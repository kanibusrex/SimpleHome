// Unit tests for the ABP -> DNR converter.
//
//   node test-parser.mjs
//
// No dependencies and no browser: lib/parser.js is deliberately free of any
// chrome.* reference so it can be exercised directly from Node.

import assert from 'node:assert/strict';
import {
  buildRules,
  parseNetworkFilter,
  parseCosmeticFilter,
  patternToUrlFilter,
  regexToFilter,
  MAX_RULE_ID
} from './lib/parser.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error('      ' + String(err.message).split('\n').join('\n      '));
  }
}

// Convenience: build from a single list and return the first rule.
function ruleFor(line) {
  const { rules } = buildRules([line]);
  return rules[0];
}

// ---- comments and blank lines -----------------------------------------

test('comments, headers and blank lines are ignored', () => {
  const { rules, stats } = buildRules([
    '[Adblock Plus 2.0]\n! Title: Test\n\n   \n! another comment'
  ]);
  assert.equal(rules.length, 0);
  assert.equal(stats.lines, 0);
  assert.equal(stats.skipped, 0);
});

// ---- network filters ---------------------------------------------------

test('a bare domain filter folds into a consolidated block rule', () => {
  const rule = ruleFor('||ads.example.com^');
  assert.equal(rule.action.type, 'block');
  assert.deepEqual(rule.condition.requestDomains, ['ads.example.com']);
  assert.equal(rule.condition.urlFilter, undefined);
  // No type option means every type but main_frame, which is DNR's default.
  assert.equal(rule.condition.resourceTypes, undefined);
});

test('bare domains across lists share one rule, deduplicated and sorted', () => {
  const { rules, stats } = buildRules(['||b.example^\n||a.example^', '||a.example^']);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].condition.requestDomains, ['a.example', 'b.example']);
  assert.equal(stats.consolidatedDomains, 2);
  assert.equal(stats.skippedBy.duplicate, 1);
});

test('domains are chunked so no single rule grows unbounded', () => {
  const lines = Array.from({ length: 25 }, (_, i) => `||d${i}.example^`).join('\n');
  const { rules } = buildRules([lines], { domainsPerRule: 10 });
  assert.equal(rules.length, 3);
  assert.deepEqual(rules.map(r => r.condition.requestDomains.length), [10, 10, 5]);
});

test('anything beyond a bare domain stays its own urlFilter rule', () => {
  for (const line of [
    '||ads.example.com^$script',
    '||ads.example.com^$third-party',
    '||ads.example.com^$domain=a.com',
    '||ads.example.com^$important',
    '||ads.example.com/path^',
    '||ads.example.com'
  ]) {
    const rule = ruleFor(line);
    assert.equal(rule.condition.requestDomains, undefined, line);
    assert.ok(rule.condition.urlFilter, line);
  }
});

test('a bare IP is left as a pattern rather than a requestDomains entry', () => {
  const rule = ruleFor('||192.0.2.10^');
  assert.equal(rule.condition.requestDomains, undefined);
  assert.equal(rule.condition.urlFilter, '||192.0.2.10^');
});

test('type options map to resource types', () => {
  const rule = ruleFor('||example.com/track$script,image');
  assert.deepEqual(rule.condition.resourceTypes, ['script', 'image']);
});

test('negated type options become exclusions', () => {
  const rule = ruleFor('||example.com/x$~script');
  assert.deepEqual(rule.condition.excludedResourceTypes, ['script']);
});

test('third-party and its negation set domainType', () => {
  assert.equal(ruleFor('||example.com^$third-party').condition.domainType, 'thirdParty');
  assert.equal(ruleFor('||example.com^$~third-party').condition.domainType, 'firstParty');
});

test('$domain splits into included and excluded initiators', () => {
  const rule = ruleFor('||cdn.example.com^$domain=a.com|~sub.b.com');
  assert.deepEqual(rule.condition.initiatorDomains, ['a.com']);
  assert.deepEqual(rule.condition.excludedInitiatorDomains, ['sub.b.com']);
});

test('$match-case sets case sensitivity, absent means insensitive', () => {
  assert.equal(ruleFor('||example.com/AdS$match-case').condition.isUrlFilterCaseSensitive, true);
  assert.equal(ruleFor('||example.com/ads').condition.isUrlFilterCaseSensitive, undefined);
});

test('an exception becomes an allow rule that outranks blocks', () => {
  const { rules } = buildRules(['||example.com^\n@@||example.com/ok^']);
  const allow = rules.find(r => r.action.type === 'allow');
  const block = rules.find(r => r.action.type === 'block');
  assert.ok(allow.priority > block.priority);
});

test('$important outranks an exception', () => {
  const { rules } = buildRules(['||example.com^$important\n@@||example.com/ok^']);
  const important = rules.find(r => r.action.type === 'block');
  const allow = rules.find(r => r.action.type === 'allow');
  assert.ok(important.priority > allow.priority);
});

test('@@$document allowlists the whole page', () => {
  const rule = ruleFor('@@||example.com^$document');
  assert.equal(rule.action.type, 'allowAllRequests');
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('exceptions are emitted ahead of blocks', () => {
  const { rules } = buildRules(['||a.example^\n||b.example^\n@@||c.example^']);
  assert.equal(rules[0].action.type, 'allow');
});

test('options DNR cannot express are skipped, not approximated', () => {
  for (const line of [
    '||example.com^$csp=script-src none',
    '||example.com^$redirect=noop.js',
    '||example.com^$removeparam=utm_source',
    '||example.com^$popup',
    '||example.com^$replace=/a/b/',
    '@@||example.com^$generichide'
  ]) {
    const { rules, stats } = buildRules([line]);
    assert.equal(rules.length, 0, line);
    assert.equal(stats.skippedBy['unsupported-option'], 1, line);
  }
});

test('a literal $ in a URL is not read as an option separator', () => {
  const rule = ruleFor('||example.com/a$b$script');
  assert.equal(rule.condition.urlFilter, '||example.com/a$b');
  assert.deepEqual(rule.condition.resourceTypes, ['script']);
});

// ---- pattern validation ------------------------------------------------

test('patterns Chrome rejects are filtered out', () => {
  assert.equal(patternToUrlFilter('*'), null);
  assert.equal(patternToUrlFilter('||*'), null);
  assert.equal(patternToUrlFilter('||*.example.com^'), null);
  assert.equal(patternToUrlFilter('||exam|ple.com^'), null);
  assert.equal(patternToUrlFilter('||exämple.com^'), null);
  assert.equal(patternToUrlFilter('||example.com^' + 'x'.repeat(600)), null);
});

test('anchors at either end survive', () => {
  assert.equal(patternToUrlFilter('|http://example.com|'), '|http://example.com|');
  assert.equal(patternToUrlFilter('||example.com^'), '||example.com^');
});

test('regex filters convert, minus the ones RE2 cannot run', () => {
  assert.equal(regexToFilter('/ads?\\d+/'), 'ads?\\d+');
  assert.equal(regexToFilter('/(?=ad)/'), null, 'lookahead');
  assert.equal(regexToFilter('/(a)\\1/'), null, 'backreference');
  assert.equal(regexToFilter('/[unclosed/'), null, 'invalid regex');
});

test('regex rules are capped separately from the total', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `/tracker-${i}-\\d+/`).join('\n');
  const { rules, stats } = buildRules([lines], { maxRegexRules: 5 });
  assert.equal(rules.length, 5);
  assert.equal(stats.skippedBy['regex-limit'], 7);
});

// ---- cosmetic filters --------------------------------------------------

test('a generic hide lands in the generic bucket', () => {
  const { cosmetic } = buildRules(['##.ad-banner']);
  assert.deepEqual(cosmetic.generic, ['.ad-banner']);
});

test('a domain hide is filed under each of its domains', () => {
  const { cosmetic } = buildRules(['a.com,b.com##.promo']);
  assert.deepEqual(cosmetic.byDomain['a.com'], ['.promo']);
  assert.deepEqual(cosmetic.byDomain['b.com'], ['.promo']);
  assert.equal(cosmetic.generic.length, 0);
});

test('#@# and ~domain both produce exceptions', () => {
  const { cosmetic } = buildRules(['a.com#@#.promo\nb.com,~sub.b.com##.deal']);
  const promo = cosmetic.exceptions.find(e => e.selector === '.promo');
  const deal = cosmetic.exceptions.find(e => e.selector === '.deal');
  assert.deepEqual(promo.domains, ['a.com']);
  assert.deepEqual(deal.domains, ['sub.b.com']);
  assert.deepEqual(cosmetic.byDomain['b.com'], ['.deal']);
});

test('procedural selectors and scriptlets are skipped', () => {
  for (const line of [
    'a.com##.ad:has-text(sponsored)',
    'a.com##.ad:-abp-has(.x)',
    'a.com#?#.ad:upward(2)',
    'a.com#$#.ad { display: none }',
    'a.com##+js(set, x, true)',
    'a.com##.ad:xpath(//div)'
  ]) {
    const { cosmetic, stats } = buildRules([line]);
    assert.equal(cosmetic.generic.length + Object.keys(cosmetic.byDomain).length, 0, line);
    assert.ok(stats.skipped >= 1, line);
  }
});

test('an entity domain never gets promoted to a generic rule', () => {
  const { cosmetic, stats } = buildRules(['example.*##.ad']);
  assert.equal(cosmetic.generic.length, 0);
  assert.equal(Object.keys(cosmetic.byDomain).length, 0);
  assert.equal(stats.skippedBy['unsupported-domain'], 1);
});

test('a bare element selector is refused as a generic rule', () => {
  const { cosmetic, stats } = buildRules(['##div']);
  assert.equal(cosmetic.generic.length, 0);
  assert.equal(stats.skippedBy['unsafe-generic'], 1);
});

test("a '#' inside a URL still reads as a network filter", () => {
  const rule = ruleFor('||example.com/a##b');
  assert.ok(rule, 'expected a network rule');
  assert.equal(rule.action.type, 'block');
});

test('selectors are deduplicated across lists', () => {
  const { cosmetic } = buildRules(['a.com##.ad', 'a.com##.ad\n##.banner', '##.banner']);
  assert.deepEqual(cosmetic.byDomain['a.com'], ['.ad']);
  assert.deepEqual(cosmetic.generic, ['.banner']);
});

// ---- ids, dedupe and limits --------------------------------------------

test('duplicate network filters collapse into one rule', () => {
  const { rules, stats } = buildRules(['||example.com^', '||example.com^']);
  assert.equal(rules.length, 1);
  assert.equal(stats.skippedBy.duplicate, 1);
});

test('ids are unique, contiguous and clear of the allowlist range', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `||example${i}.com^$script`).join('\n');
  const { rules } = buildRules([lines]);
  assert.equal(rules.length, 50);
  const ids = rules.map(r => r.id);
  assert.equal(new Set(ids).size, rules.length);
  assert.deepEqual(ids, ids.map((_, i) => i + 1));
  assert.ok(Math.max(...ids) < MAX_RULE_ID);
});

test('the total is truncated at the ceiling, exceptions kept first', () => {
  const blocks = Array.from({ length: 20 }, (_, i) => `||block${i}.com^$script`);
  const allows = Array.from({ length: 3 }, (_, i) => `@@||allow${i}.com^`);
  const { rules, stats } = buildRules([blocks.concat(allows).join('\n')], { maxRules: 10 });
  assert.equal(rules.length, 10);
  assert.equal(stats.truncated, true);
  assert.equal(rules.filter(r => r.action.type === 'allow').length, 3);
});

test('consolidated rules survive truncation ahead of individual blocks', () => {
  const bare = Array.from({ length: 40 }, (_, i) => `||bare${i}.com^`);
  const typed = Array.from({ length: 40 }, (_, i) => `||typed${i}.com^$script`);
  const { rules, stats } = buildRules(
    [bare.concat(typed).join('\n')],
    { maxRules: 5, domainsPerRule: 10 }
  );
  assert.equal(stats.truncated, true);
  // Four consolidated rules carry all 40 bare domains; the typed ones get cut.
  assert.equal(rules.filter(r => r.condition.requestDomains).length, 4);
  assert.equal(rules.filter(r => r.condition.urlFilter).length, 1);
});

test('stats add up: every counted line is either parsed or skipped', () => {
  const { stats } = buildRules([
    '||example.com^\n' +
    '||example.com^$csp=x\n' +
    'a.com##.ad\n' +
    'a.com##.ad:has-text(x)\n' +
    '! comment\n' +
    '\n'
  ]);
  assert.equal(stats.lines, 4);
  assert.equal(stats.parsed + stats.skipped, stats.lines);
});

// ---- results -----------------------------------------------------------

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
