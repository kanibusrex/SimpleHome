// Checks generated rules against Chrome's declarativeNetRequest constraints.
//
//   node validate-rules.mjs [list.txt ...]
//
// With no arguments it looks for sample lists in /tmp (easylist.txt,
// easyprivacy.txt, fanboy-annoyance.txt) and skips cleanly if they aren't
// there, so it is safe to run on a fresh checkout. To fetch them:
//
//   curl -o /tmp/easylist.txt https://easylist.to/easylist/easylist.txt
//
// The parser's own unit tests cover behaviour; this covers scale — the rules a
// real list produces, measured against the ceilings Chrome enforces.

import { readFileSync, existsSync } from 'node:fs';
import { buildRules, MAX_RULES, MAX_REGEX_RULES, MAX_RULE_ID } from './lib/parser.js';

const DEFAULT_LISTS = [
  '/tmp/easylist.txt',
  '/tmp/easyprivacy.txt',
  '/tmp/fanboy-annoyance.txt'
];

const RESOURCE_TYPES = new Set([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport',
  'webbundle', 'other'
]);

const ACTION_TYPES = new Set(['block', 'allow', 'allowAllRequests', 'redirect', 'upgradeScheme', 'modifyHeaders']);

const paths = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_LISTS)
  .filter(p => existsSync(p));

if (!paths.length) {
  console.log('No sample lists found — skipping.');
  console.log('Fetch one with: curl -o /tmp/easylist.txt https://easylist.to/easylist/easylist.txt');
  process.exit(0);
}

const texts = paths.map(p => readFileSync(p, 'utf8'));
const started = Date.now();
const { rules, stats, cosmetic } = buildRules(texts);
const elapsed = Date.now() - started;

// ---- per-rule validation ----------------------------------------------

const errors = [];
const warnings = [];
const seenIds = new Set();

function check(condition, rule, message) {
  if (!condition) errors.push({ rule, message });
}

function validDomain(d) {
  return typeof d === 'string' && d.length > 0 && d === d.toLowerCase() &&
    /^[a-z0-9.-]+$/.test(d) && !d.startsWith('.') && !d.endsWith('.');
}

for (const rule of rules) {
  const { id, priority, action, condition } = rule;

  check(Number.isInteger(id) && id >= 1 && id <= MAX_RULE_ID, rule, `id out of range: ${id}`);
  check(!seenIds.has(id), rule, `duplicate id: ${id}`);
  seenIds.add(id);

  check(Number.isInteger(priority) && priority >= 1, rule, `priority must be a positive integer`);
  check(ACTION_TYPES.has(action?.type), rule, `unknown action: ${action?.type}`);

  const hasUrl = typeof condition.urlFilter === 'string';
  const hasRegex = typeof condition.regexFilter === 'string';
  const hasDomains = Array.isArray(condition.requestDomains);
  check(!(hasUrl && hasRegex), rule, 'urlFilter and regexFilter are mutually exclusive');
  // A consolidated rule matches on requestDomains alone, which is a condition
  // in its own right; every other rule needs a pattern.
  check(hasUrl || hasRegex || hasDomains, rule, 'rule has no matchable condition');

  if (hasDomains) {
    check(condition.requestDomains.length > 0, rule, 'requestDomains must be non-empty');
    for (const d of condition.requestDomains) {
      check(validDomain(d), rule, `requestDomains entry is not a bare domain: ${d}`);
    }
    if (condition.requestDomains.length > 1000) {
      warnings.push(`rule ${id}: requestDomains has ${condition.requestDomains.length} entries`);
    }
  }

  if (hasUrl) {
    const f = condition.urlFilter;
    check(f.length > 0, rule, 'empty urlFilter');
    // eslint-disable-next-line no-control-regex
    check(/^[\x20-\x7E]+$/.test(f), rule, 'urlFilter must be ASCII');
    check(!f.startsWith('||*'), rule, 'urlFilter cannot start with ||*');
    const body = f.replace(/^\|\|?/, '').replace(/\|$/, '');
    check(!body.includes('|'), rule, "'|' is only allowed as an anchor");
  }

  if (hasRegex) {
    check(!/\(\?[=!<]/.test(condition.regexFilter), rule, 'RE2 has no lookaround');
    check(!/\\[1-9]/.test(condition.regexFilter), rule, 'RE2 has no backreferences');
    try {
      new RegExp(condition.regexFilter);
    } catch (err) {
      errors.push({ rule, message: 'regexFilter does not compile: ' + err.message });
    }
  }

  for (const key of ['resourceTypes', 'excludedResourceTypes']) {
    const list = condition[key];
    if (!list) continue;
    check(Array.isArray(list) && list.length > 0, rule, `${key} must be a non-empty array`);
    for (const t of list || []) check(RESOURCE_TYPES.has(t), rule, `unknown resource type: ${t}`);
  }

  if (action?.type === 'allowAllRequests') {
    const types = condition.resourceTypes || [];
    check(
      types.length > 0 && types.every(t => t === 'main_frame' || t === 'sub_frame'),
      rule,
      'allowAllRequests needs main_frame / sub_frame resource types'
    );
  }

  for (const key of ['initiatorDomains', 'excludedInitiatorDomains']) {
    const list = condition[key];
    if (!list) continue;
    check(Array.isArray(list) && list.length > 0, rule, `${key} must be a non-empty array`);
    for (const d of list || []) check(validDomain(d), rule, `${key} entry is not a bare domain: ${d}`);
    if ((list || []).length > 1000) {
      warnings.push(`rule ${id}: ${key} has ${list.length} entries`);
    }
  }

  if (condition.domainType) {
    check(
      condition.domainType === 'firstParty' || condition.domainType === 'thirdParty',
      rule,
      `unknown domainType: ${condition.domainType}`
    );
  }
}

// ---- totals ------------------------------------------------------------

const regexRules = rules.filter(r => r.condition.regexFilter).length;
if (rules.length > MAX_RULES) errors.push({ message: `${rules.length} rules exceeds the ${MAX_RULES} ceiling` });
if (regexRules > MAX_REGEX_RULES) errors.push({ message: `${regexRules} regex rules exceeds the ${MAX_REGEX_RULES} ceiling` });

for (const [selector, list] of Object.entries(cosmetic.byDomain)) {
  if (!Array.isArray(list)) errors.push({ message: `cosmetic.byDomain[${selector}] is not an array` });
}

// ---- report ------------------------------------------------------------

const pct = (n, of) => of ? (n / of * 100).toFixed(1) + '%' : '—';

console.log('Lists:');
for (const p of paths) console.log('  ' + p);
console.log('');
console.log(`Filter lines      ${stats.lines.toLocaleString()}`);
console.log(`  converted       ${stats.parsed.toLocaleString()} (${pct(stats.parsed, stats.lines)})`);
console.log(`  skipped         ${stats.skipped.toLocaleString()} (${pct(stats.skipped, stats.lines)})`);
console.log('');
console.log(`Network rules     ${stats.networkRules.toLocaleString()} / ${MAX_RULES.toLocaleString()}`);
console.log(`  regex           ${regexRules.toLocaleString()} / ${MAX_REGEX_RULES.toLocaleString()}`);
console.log(`  allow           ${rules.filter(r => r.action.type !== 'block').length.toLocaleString()}`);
console.log(`  truncated       ${stats.truncated}`);
console.log('');
console.log(`Cosmetic selectors ${stats.cosmeticSelectors.toLocaleString()}`);
console.log(`  generic          ${cosmetic.generic.length.toLocaleString()}`);
console.log(`  domains          ${stats.cosmeticDomains.toLocaleString()}`);
console.log(`  exceptions       ${stats.cosmeticExceptions.toLocaleString()}`);
console.log('');
console.log('Skipped by reason:');
for (const [reason, count] of Object.entries(stats.skippedBy).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(20)} ${count.toLocaleString()}`);
}
console.log('');
console.log(`Built in ${elapsed}ms`);

if (warnings.length) {
  console.log('');
  console.log(`${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 10)) console.log('  ' + w);
}

if (errors.length) {
  console.log('');
  console.log(`${errors.length} constraint violation(s):`);
  for (const e of errors.slice(0, 20)) {
    const context = e.rule ? '  ' + JSON.stringify(e.rule.condition).slice(0, 160) : '';
    console.log('  ' + e.message + context);
  }
  process.exit(1);
}

console.log('');
console.log('All rules satisfy Chrome\'s DNR constraints.');
