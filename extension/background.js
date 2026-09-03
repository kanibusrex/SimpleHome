import { buildRules } from './lib/parser.js';

const LISTS = {
  easylist: {
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    description: 'Core ad blocking',
    defaultOn: true
  },
  easyprivacy: {
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    description: 'Trackers and analytics',
    defaultOn: true
  },
  annoyances: {
    name: 'Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    description: 'Cookie notices, social widgets',
    defaultOn: false
  }
};

// Dynamic rule ids we reserve for user allowlist entries, kept well clear of
// the filter-list range so the two never collide.
const ALLOWLIST_ID_BASE = 900000;
const UPDATE_ALARM = 'simplehome-update-lists';
const UPDATE_PERIOD_MINUTES = 60 * 24; // daily

// The cosmetic dataset runs to hundreds of KB. Reading it from storage on
// every page load would put that cost on every navigation, so it is cached
// for the service worker's lifetime and invalidated whenever lists change.
let cosmeticCache = null;

async function getCosmeticData() {
  if (cosmeticCache) return cosmeticCache;
  const { cosmetic } = await chrome.storage.local.get({
    cosmetic: { generic: [], byDomain: {}, exceptions: [] }
  });
  cosmeticCache = cosmetic;
  return cosmeticCache;
}

// ---- storage helpers --------------------------------------------------

async function getState() {
  const d = await chrome.storage.local.get({
    enabled: true,
    allowlist: [],
    enabledLists: Object.keys(LISTS).filter(k => LISTS[k].defaultOn),
    lastUpdated: null,
    stats: null,
    cosmetic: { generic: [], byDomain: {}, exceptions: [] },
    blockedCount: 0
  });
  return d;
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

// ---- list fetching and rule building ---------------------------------

async function fetchList(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function updateLists({ force = false } = {}) {
  const state = await getState();
  const enabledKeys = state.enabledLists.filter(k => LISTS[k]);

  if (!enabledKeys.length) {
    await applyRules([], { generic: [], byDomain: {}, exceptions: [] });
    await setState({
      lastUpdated: Date.now(),
      stats: { networkRules: 0, parsed: 0, skipped: 0, note: 'No lists enabled' }
    });
    return { ok: true, stats: { networkRules: 0 } };
  }

  const texts = [];
  const failures = [];

  for (const key of enabledKeys) {
    try {
      texts.push(await fetchList(LISTS[key].url));
    } catch (err) {
      failures.push(`${LISTS[key].name}: ${err.message}`);
    }
  }

  if (!texts.length) {
    return { ok: false, error: failures.join('; ') || 'No lists could be fetched' };
  }

  const { rules, stats, cosmetic } = buildRules(texts);

  try {
    await applyRules(rules, cosmetic);
  } catch (err) {
    return { ok: false, error: 'Could not install rules: ' + err.message };
  }

  await setState({
    lastUpdated: Date.now(),
    stats: { ...stats, failures },
    cosmetic
  });

  return { ok: true, stats, failures };
}

async function applyRules(rules, cosmetic) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter(r => r.id < ALLOWLIST_ID_BASE)
    .map(r => r.id);

  // Chrome rejects an oversized single call, so install in batches.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: []
  });

  const BATCH = 4000;
  for (let i = 0; i < rules.length; i += BATCH) {
    const batch = rules.slice(i, i + BATCH);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: batch });
    } catch (err) {
      // One malformed rule poisons its whole batch, so retry individually to
      // salvage the rest rather than losing 4000 rules to a single bad line.
      for (const rule of batch) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
        } catch (_) { /* drop the individual offender */ }
      }
    }
  }

  cosmeticCache = cosmetic;
  await setState({ cosmetic });
}

// ---- allowlist --------------------------------------------------------

function allowRuleFor(domain, index) {
  return {
    id: ALLOWLIST_ID_BASE + index,
    priority: 1000,
    action: { type: 'allowAllRequests' },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ['main_frame', 'sub_frame']
    }
  };
}

async function syncAllowlist() {
  const { allowlist, enabled } = await getState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing
    .filter(r => r.id >= ALLOWLIST_ID_BASE)
    .map(r => r.id);

  const addRules = enabled
    ? allowlist.map((d, i) => allowRuleFor(d, i))
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules
  });
}

function normalizeDomain(input) {
  let v = String(input || '').trim().toLowerCase();
  if (!v) return null;
  try {
    if (!/^https?:\/\//.test(v)) v = 'http://' + v;
    const host = new URL(v).hostname;
    return host.replace(/^www\./, '') || null;
  } catch (_) {
    return null;
  }
}

// ---- enable / disable -------------------------------------------------

async function setEnabled(enabled) {
  await setState({ enabled });
  if (enabled) {
    await updateLists();
    await syncAllowlist();
  } else {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(r => r.id),
      addRules: []
    });
  }
  await refreshBadge();
}

async function refreshBadge() {
  const { enabled } = await getState();
  await chrome.action.setBadgeText({ text: enabled ? '' : 'off' });
  await chrome.action.setBadgeBackgroundColor({ color: '#8a8a8a' });
}

// ---- messaging --------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'getStatus': {
        const state = await getState();
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        sendResponse({
          ...state,
          lists: LISTS,
          activeRules: rules.filter(r => r.id < ALLOWLIST_ID_BASE).length
        });
        break;
      }

      case 'setEnabled':
        await setEnabled(Boolean(msg.enabled));
        sendResponse({ ok: true });
        break;

      case 'setLists':
        await setState({ enabledLists: msg.lists });
        sendResponse(await updateLists({ force: true }));
        break;

      case 'update':
        sendResponse(await updateLists({ force: true }));
        break;

      case 'toggleAllowlist': {
        const domain = normalizeDomain(msg.domain);
        if (!domain) { sendResponse({ ok: false, error: 'Invalid domain' }); break; }
        const { allowlist } = await getState();
        const next = allowlist.includes(domain)
          ? allowlist.filter(d => d !== domain)
          : allowlist.concat(domain);
        await setState({ allowlist: next });
        await syncAllowlist();
        sendResponse({ ok: true, allowlist: next, allowed: next.includes(domain) });
        break;
      }

      case 'getCosmetic': {
        const { enabled, allowlist } = await chrome.storage.local.get({
          enabled: true, allowlist: []
        });
        const host = normalizeDomain(msg.host);
        if (!enabled || !host || allowlist.includes(host)) {
          sendResponse({ selectors: [] });
          break;
        }
        const cosmetic = await getCosmeticData();
        sendResponse({ selectors: selectorsForHost(host, cosmetic) });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message' });
    }
  })();
  return true; // keep the channel open for the async reply
});

function selectorsForHost(host, cosmetic) {
  if (!cosmetic) return [];
  const out = [];
  const parts = host.split('.');

  // Match the host and each parent domain: sub.example.com also gets
  // rules written for example.com.
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const list = cosmetic.byDomain[candidate];
    if (list) out.push(...list);
  }

  const excluded = new Set(
    (cosmetic.exceptions || [])
      .filter(e => e.domains.some(d => host === d || host.endsWith('.' + d)))
      .map(e => e.selector)
  );

  const all = out.concat(cosmetic.generic || []);
  return excluded.size ? all.filter(s => !excluded.has(s)) : all;
}

// ---- lifecycle --------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.alarms.create(UPDATE_ALARM, {
    periodInMinutes: UPDATE_PERIOD_MINUTES,
    delayInMinutes: 1
  });
  if (details.reason === 'install') {
    await updateLists();
  }
  await refreshBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshBadge();
  const { lastUpdated } = await getState();
  const stale = !lastUpdated || (Date.now() - lastUpdated) > UPDATE_PERIOD_MINUTES * 60 * 1000;
  if (stale) await updateLists();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    const { enabled } = await getState();
    if (enabled) await updateLists();
  }
});
