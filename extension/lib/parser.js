// Converts Adblock Plus filter syntax into Chrome declarativeNetRequest rules
// and an element-hiding dataset.
//
// The conversion is deliberately lossy. Where a filter uses something DNR has
// no equivalent for, the filter is dropped whole rather than approximated: a
// rule that is nearly right breaks pages in ways that are very hard to trace
// back to the line that caused them. Everything dropped is counted, so the
// popup can report how much of a list actually made it through.

// Chrome's ceilings. Going over either one makes updateDynamicRules reject the
// entire call, so the builder truncates before it gets that far.
export const MAX_RULES = 30000;
export const MAX_REGEX_RULES = 1000;

// background.js reserves ids from 900000 up for the user allowlist.
export const MAX_RULE_ID = 899999;

// Longer patterns than this are almost always machine-generated one-offs, and
// Chrome starts rejecting them anyway.
const MAX_URL_FILTER_LENGTH = 500;

// Most of EasyList is '||domain^' and nothing else — roughly 47,000 lines of
// it. One DNR rule can carry a whole list of requestDomains, and requestDomains
// matches subdomains exactly as '||domain^' does, so those filters fold into a
// handful of rules instead of one apiece. Without this the adserver section
// alone overruns Chrome's ceiling twice over. Domains per rule is kept well
// under any plausible per-rule cap.
const DOMAINS_PER_RULE = 1000;
const PLAIN_DOMAIN_PATTERN = /^\|\|([a-z0-9-]+(?:\.[a-z0-9-]+)+)\^$/;
// A bare IP is a valid host but not a domain, and one entry Chrome refuses
// would cost the other 999 in its rule. They stay individual urlFilter rules.
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// What DNR accepts in a domain list: a bare host, no scheme, port, brackets or
// path. IPv6 literals ('[::1]') appear in $domain= lists and are not valid here.
const DOMAIN_PATTERN = /^[a-z0-9._-]+$/;

// Filter type options -> DNR resource types.
const TYPE_OPTIONS = new Map([
  ['script', 'script'],
  ['image', 'image'],
  ['stylesheet', 'stylesheet'],
  ['css', 'stylesheet'],
  ['object', 'object'],
  ['object-subrequest', 'object'],
  ['xmlhttprequest', 'xmlhttprequest'],
  ['xhr', 'xmlhttprequest'],
  ['subdocument', 'sub_frame'],
  ['frame', 'sub_frame'],
  ['ping', 'ping'],
  ['beacon', 'ping'],
  ['websocket', 'websocket'],
  ['media', 'media'],
  ['font', 'font'],
  ['other', 'other'],
  ['document', 'main_frame'],
  ['doc', 'main_frame']
]);

// Options that change what a rule *does*, in ways DNR cannot express. A filter
// carrying any of these is skipped rather than converted without them, since
// dropping the modifier would usually turn a narrow rule into a broad one.
const UNSUPPORTED_OPTIONS = new Set([
  'csp', 'redirect', 'redirect-rule', 'removeparam', 'removeheader', 'replace',
  'popup', 'popunder', 'empty', 'mp4', 'inline-script', 'inline-font',
  'genericblock', 'generichide', 'specifichide', 'elemhide', 'ehide',
  'stealth', 'cookie', 'app', 'denyallow', 'header', 'method', 'permissions',
  'urltransform', 'uritransform', 'hls', 'jsonprune', 'badfilter', 'all',
  'to', 'from', 'ipaddress', 'strict1p', 'strict3p', 'webrtc', 'network',
  'extension', 'content', 'match-case-header', 'referrerpolicy'
]);

// Cosmetic separators, longest first so that '#@$?#' is never read as '#@#'.
const COSMETIC_SEPARATORS = [
  { sep: '#@$?#', hide: false, plain: false },
  { sep: '#@?#', hide: false, plain: false },
  { sep: '#@$#', hide: false, plain: false },
  { sep: '#$?#', hide: true, plain: false },
  { sep: '#@#', hide: false, plain: true },
  { sep: '#?#', hide: true, plain: false },
  { sep: '#$#', hide: true, plain: false },
  { sep: '#%#', hide: true, plain: false },
  { sep: '##', hide: true, plain: true }
];

// Procedural cosmetic syntax. Chrome applies plain CSS only, so a selector
// using any of these is skipped instead of being applied without its predicate,
// which would hide far more of the page than the filter author intended.
const PROCEDURAL_PATTERN =
  /:(?:-abp-[a-z-]+|has-text|matches-css(?:-before|-after)?|matches-attr|matches-path|matches-media|matches-property|xpath|style|remove|upward|watch-attr|contains|if|if-not|min-text-length|nth-ancestor|others|shadow)\(/i;

// ---- filter parsing ---------------------------------------------------

// True for a comment, a list header, or a blank line — anything with no filter
// in it at all. These are not counted as skipped, because nothing was lost.
export function isCommentLine(line) {
  return !line || line.startsWith('!') || line.startsWith('[Adblock') ||
    line.startsWith('#') && !COSMETIC_SEPARATORS.some(c => line.startsWith(c.sep));
}

// Splits 'pattern$opt,opt' at the separator. Filters can contain a literal '$'
// in the URL, so candidates are tried left to right and the first one whose
// tail reads as a valid option list wins.
function splitOptions(text) {
  let from = 0;
  for (;;) {
    const at = text.indexOf('$', from);
    if (at === -1) return { pattern: text, options: '' };
    const tail = text.slice(at + 1);
    if (tail && tail.split(',').every(t => /^~?[a-z0-9_-]+(=[^,]*)?$/i.test(t))) {
      return { pattern: text.slice(0, at), options: tail };
    }
    from = at + 1;
  }
}

function parseDomainList(value) {
  const include = [];
  const exclude = [];
  let dropped = 0;

  for (const raw of value.split('|')) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const negated = entry.startsWith('~');
    const domain = (negated ? entry.slice(1) : entry).replace(/^\*\./, '');
    // Entity domains ('example.*') and regex domains have no DNR equivalent.
    if (!domain || !DOMAIN_PATTERN.test(domain)) { dropped++; continue; }
    (negated ? exclude : include).push(domain);
  }

  return { include, exclude, dropped };
}

// Parses one network filter into a neutral shape, or returns a skip reason.
export function parseNetworkFilter(line) {
  let text = line;
  const isException = text.startsWith('@@');
  if (isException) text = text.slice(2);

  let pattern = text;
  let optionText = '';

  if (text.startsWith('/')) {
    // Regex filter: /pattern/ with options after the closing slash.
    const close = text.lastIndexOf('/$');
    if (close > 0) {
      pattern = text.slice(0, close + 1);
      optionText = text.slice(close + 2);
    }
  } else {
    ({ pattern, options: optionText } = splitOptions(text));
  }

  if (!pattern) return { skip: 'empty-pattern' };

  const parsed = {
    isException,
    pattern,
    isRegex: pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/'),
    types: new Set(),
    excludedTypes: new Set(),
    domainType: null,
    initiatorDomains: [],
    excludedInitiatorDomains: [],
    matchCase: false,
    important: false,
    isDocument: false
  };

  if (!optionText) return parsed;

  for (const token of optionText.split(',')) {
    const negated = token.startsWith('~');
    const body = negated ? token.slice(1) : token;
    const eq = body.indexOf('=');
    const name = (eq === -1 ? body : body.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? '' : body.slice(eq + 1);

    if (UNSUPPORTED_OPTIONS.has(name)) return { skip: 'unsupported-option' };

    if (TYPE_OPTIONS.has(name)) {
      const type = TYPE_OPTIONS.get(name);
      if (name === 'document' || name === 'doc') parsed.isDocument = true;
      (negated ? parsed.excludedTypes : parsed.types).add(type);
      continue;
    }

    if (name === 'third-party' || name === '3p') {
      parsed.domainType = negated ? 'firstParty' : 'thirdParty';
      continue;
    }
    if (name === 'first-party' || name === '1p') {
      parsed.domainType = negated ? 'thirdParty' : 'firstParty';
      continue;
    }
    if (name === 'domain') {
      const { include, exclude } = parseDomainList(value);
      if (!include.length && !exclude.length) return { skip: 'unsupported-domain' };
      parsed.initiatorDomains = include;
      parsed.excludedInitiatorDomains = exclude;
      continue;
    }
    if (name === 'match-case') { parsed.matchCase = !negated; continue; }
    if (name === 'important') { parsed.important = true; continue; }

    return { skip: 'unknown-option' };
  }

  return parsed;
}

// ABP patterns and DNR urlFilters share their anchors ('||', '|', '^', '*'),
// so most patterns pass through untouched. What is left is validating the
// cases Chrome rejects outright.
export function patternToUrlFilter(pattern) {
  if (!pattern || pattern === '*' || pattern === '|' || pattern === '||') return null;
  if (pattern.length > MAX_URL_FILTER_LENGTH) return null;
  // urlFilter must be ASCII; punycode conversion is not something to guess at.
  if (!/^[\x20-\x7E]+$/.test(pattern)) return null;
  if (pattern.startsWith('||*')) return null;

  // '|' is an anchor and is only legal at the very start or very end.
  const body = pattern.replace(/^\|\|?/, '').replace(/\|$/, '');
  if (body.includes('|')) return null;
  if (!body) return null;

  return pattern;
}

// RE2 (what DNR uses) has neither lookaround nor backreferences.
export function regexToFilter(source) {
  const body = source.slice(1, -1);
  if (!body) return null;
  if (!/^[\x20-\x7E]+$/.test(body)) return null;
  if (/\(\?[=!<]/.test(body)) return null;
  if (/\\[1-9]/.test(body)) return null;
  try {
    new RegExp(body);
  } catch (_) {
    return null;
  }
  return body;
}

// ---- rule construction ------------------------------------------------

// Blocks sit below exceptions so an allow always wins a tie; '$important'
// blocks sit above both, which is what the option means.
const PRIORITY_BLOCK = 1;
const PRIORITY_ALLOW = 2;
const PRIORITY_IMPORTANT = 3;

// A filter that is exactly '||domain^' with no options at all can be folded in
// with every other filter of that shape. Anything carrying a type, a party
// restriction, a domain list or a priority bump has to stay a rule of its own.
export function plainBlockDomain(parsed) {
  if (parsed.isException || parsed.isRegex || parsed.important || parsed.matchCase) return null;
  if (parsed.types.size || parsed.excludedTypes.size || parsed.domainType) return null;
  if (parsed.initiatorDomains.length || parsed.excludedInitiatorDomains.length) return null;
  const match = PLAIN_DOMAIN_PATTERN.exec(parsed.pattern.toLowerCase());
  if (!match || IPV4_PATTERN.test(match[1])) return null;
  return match[1];
}

export function toRule(parsed, id) {
  const condition = {};

  if (parsed.isRegex) {
    const regexFilter = regexToFilter(parsed.pattern);
    if (!regexFilter) return null;
    condition.regexFilter = regexFilter;
  } else {
    const urlFilter = patternToUrlFilter(parsed.pattern);
    if (!urlFilter) return null;
    condition.urlFilter = urlFilter;
  }

  // '@@...$document' allowlists a page and everything it loads, which is what
  // allowAllRequests means. A plain exception only unblocks the request itself.
  const allowAll = parsed.isException && parsed.isDocument;

  if (allowAll) {
    condition.resourceTypes = ['main_frame', 'sub_frame'];
  } else {
    // Leaving resourceTypes off matches every type except main_frame, which is
    // already how a filter with no type option behaves.
    if (parsed.types.size) condition.resourceTypes = [...parsed.types];
    if (parsed.excludedTypes.size) condition.excludedResourceTypes = [...parsed.excludedTypes];
  }

  if (parsed.domainType) condition.domainType = parsed.domainType;
  if (parsed.initiatorDomains.length) condition.initiatorDomains = parsed.initiatorDomains;
  if (parsed.excludedInitiatorDomains.length) {
    condition.excludedInitiatorDomains = parsed.excludedInitiatorDomains;
  }
  if (parsed.matchCase) condition.isUrlFilterCaseSensitive = true;

  const type = allowAll ? 'allowAllRequests' : parsed.isException ? 'allow' : 'block';
  const priority = parsed.isException
    ? PRIORITY_ALLOW
    : parsed.important ? PRIORITY_IMPORTANT : PRIORITY_BLOCK;

  return { id, priority, action: { type }, condition };
}

// ---- cosmetic filters -------------------------------------------------

export function parseCosmeticFilter(line) {
  const hash = line.indexOf('#');
  if (hash === -1) return null;

  const match = COSMETIC_SEPARATORS.find(c => line.startsWith(c.sep, hash));
  if (!match) return null;

  const domainPart = line.slice(0, hash);
  const domains = [];
  const excludedDomains = [];
  let droppedDomains = 0;

  for (const raw of domainPart.split(',')) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const negated = entry.startsWith('~');
    const domain = negated ? entry.slice(1) : entry;
    // An entity domain ('example.*') has no equivalent in the host lookup
    // background.js does, so it is dropped — but see the guard below, because
    // dropping every domain would silently promote the filter to a generic one.
    if (domain.includes('*') || domain.startsWith('/')) { droppedDomains++; continue; }
    // Anything else that isn't domain-shaped means the '#' belonged to a URL
    // and this is a network filter after all.
    if (!DOMAIN_PATTERN.test(domain)) return null;
    (negated ? excludedDomains : domains).push(domain);
  }

  if (!match.plain) return { skip: 'procedural' };

  const selector = line.slice(hash + match.sep.length).trim();
  if (!selector) return { skip: 'empty-selector' };
  // '##+js(...)' injects a scriptlet; '{' is a style rule, not a selector.
  if (selector.startsWith('+js(') || selector.includes('{')) return { skip: 'procedural' };
  if (PROCEDURAL_PATTERN.test(selector)) return { skip: 'procedural' };

  const scoped = domains.length > 0 || excludedDomains.length > 0;
  if (!scoped && droppedDomains) return { skip: 'unsupported-domain' };
  // A generic rule runs on every site, so a bare element selector ('##div')
  // is never worth the risk of what it would take down with it.
  if (!scoped && !/[.#[:]/.test(selector)) return { skip: 'unsafe-generic' };

  return { hide: match.hide, selector, domains, excludedDomains };
}

// ---- the builder ------------------------------------------------------

// Takes the raw text of one or more filter lists and returns installable DNR
// rules plus the cosmetic dataset background.js hands to content scripts.
export function buildRules(texts, {
  maxRules = MAX_RULES,
  maxRegexRules = MAX_REGEX_RULES,
  domainsPerRule = DOMAINS_PER_RULE
} = {}) {
  const allowRules = [];
  const blockRules = [];
  const blockedDomains = new Set();
  const seen = new Set();

  const generic = new Set();
  const byDomain = new Map();
  const exceptions = new Map();

  const stats = {
    lines: 0,
    parsed: 0,
    skipped: 0,
    networkRules: 0,
    networkFilters: 0,
    consolidatedDomains: 0,
    regexRules: 0,
    cosmeticSelectors: 0,
    cosmeticDomains: 0,
    cosmeticExceptions: 0,
    truncated: false,
    skippedBy: {}
  };

  let regexCount = 0;

  const skip = (reason) => {
    stats.skipped++;
    stats.skippedBy[reason] = (stats.skippedBy[reason] || 0) + 1;
  };

  const addCosmetic = (parsed) => {
    if (!parsed.hide) {
      // '#@#' — an unhide, which background.js subtracts per host.
      for (const domain of parsed.domains) {
        const existing = exceptions.get(parsed.selector);
        if (existing) existing.add(domain);
        else exceptions.set(parsed.selector, new Set([domain]));
      }
      return;
    }

    if (!parsed.domains.length) generic.add(parsed.selector);

    for (const domain of parsed.domains) {
      const list = byDomain.get(domain);
      if (list) list.add(parsed.selector);
      else byDomain.set(domain, new Set([parsed.selector]));
    }

    // 'a.com,~sub.a.com##.ad' rides in as a rule plus an unhide for the
    // excluded host, which is exactly how the exception list is consumed.
    for (const domain of parsed.excludedDomains) {
      const existing = exceptions.get(parsed.selector);
      if (existing) existing.add(domain);
      else exceptions.set(parsed.selector, new Set([domain]));
    }
  };

  for (const text of texts) {
    for (const rawLine of String(text).split('\n')) {
      const line = rawLine.trim();
      if (isCommentLine(line)) continue;
      stats.lines++;

      const cosmetic = parseCosmeticFilter(line);
      if (cosmetic) {
        if (cosmetic.skip) { skip(cosmetic.skip); continue; }
        addCosmetic(cosmetic);
        stats.parsed++;
        continue;
      }

      const parsed = parseNetworkFilter(line);
      if (parsed.skip) { skip(parsed.skip); continue; }

      const plainDomain = plainBlockDomain(parsed);
      if (plainDomain) {
        if (blockedDomains.has(plainDomain)) { skip('duplicate'); continue; }
        blockedDomains.add(plainDomain);
        stats.parsed++;
        continue;
      }

      if (parsed.isRegex && regexCount >= maxRegexRules) { skip('regex-limit'); continue; }

      // The id is a placeholder; final ids are assigned once both buckets are
      // ordered, so that truncation never leaves a gap.
      const rule = toRule(parsed, 0);
      if (!rule) { skip(parsed.isRegex ? 'unsupported-regex' : 'unsupported-pattern'); continue; }

      const key = rule.action.type + '|' + JSON.stringify(rule.condition);
      if (seen.has(key)) { skip('duplicate'); continue; }
      seen.add(key);

      if (parsed.isRegex) regexCount++;
      (rule.action.type === 'block' ? blockRules : allowRules).push(rule);
      stats.parsed++;
    }
  }

  // Every bare '||domain^' collapses into a handful of requestDomains rules.
  const domains = [...blockedDomains].sort();
  const domainRules = [];
  for (let i = 0; i < domains.length; i += domainsPerRule) {
    domainRules.push({
      id: 0,
      priority: PRIORITY_BLOCK,
      action: { type: 'block' },
      condition: { requestDomains: domains.slice(i, i + domainsPerRule) }
    });
  }

  // Exceptions go in first. If a list combination overruns Chrome's ceiling,
  // losing blocks costs some ads; losing allows breaks working pages. The
  // consolidated domain rules follow, since each one carries a thousand
  // filters' worth of blocking and the individual rules only carry one.
  const rules = allowRules.concat(domainRules, blockRules);
  if (rules.length > maxRules) {
    rules.length = maxRules;
    stats.truncated = true;
  }
  rules.forEach((rule, i) => { rule.id = i + 1; });

  const cosmetic = {
    generic: [...generic],
    byDomain: Object.fromEntries([...byDomain].map(([d, set]) => [d, [...set]])),
    exceptions: [...exceptions].map(([selector, domains]) => ({ selector, domains: [...domains] }))
  };

  stats.networkRules = rules.length;
  stats.networkFilters = allowRules.length + blockRules.length + blockedDomains.size;
  stats.consolidatedDomains = blockedDomains.size;
  stats.regexRules = rules.filter(r => r.condition.regexFilter).length;
  stats.cosmeticSelectors = cosmetic.generic.length +
    Object.values(cosmetic.byDomain).reduce((n, list) => n + list.length, 0);
  stats.cosmeticDomains = Object.keys(cosmetic.byDomain).length;
  stats.cosmeticExceptions = cosmetic.exceptions.length;

  return { rules, stats, cosmetic };
}
