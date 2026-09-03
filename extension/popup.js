const $ = (id) => document.getElementById(id);

const enabledToggle = $('enabledToggle');
const statusDot = $('statusDot');
const siteHost = $('siteHost');
const allowBtn = $('allowBtn');
const ruleCount = $('ruleCount');
const updatedAt = $('updatedAt');
const listOptions = $('listOptions');
const updateBtn = $('updateBtn');
const note = $('note');
const allowedSection = $('allowedSection');
const allowedList = $('allowedList');

let currentHost = null;
let status = null;

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function relativeTime(ts) {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function hostFromUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function setNote(text, isError) {
  note.textContent = text || '';
  note.classList.toggle('error', Boolean(isError));
}

function renderLists() {
  listOptions.innerHTML = '';
  for (const [key, meta] of Object.entries(status.lists)) {
    const label = document.createElement('label');
    label.className = 'list-option';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = status.enabledLists.includes(key);
    cb.addEventListener('change', async () => {
      const next = Array.from(listOptions.querySelectorAll('input'))
        .map((el, i) => ({ el, key: Object.keys(status.lists)[i] }))
        .filter(x => x.el.checked)
        .map(x => x.key);
      setNote('Updating lists…');
      updateBtn.disabled = true;
      const res = await send({ type: 'setLists', lists: next });
      updateBtn.disabled = false;
      await refresh();
      reportUpdate(res);
    });

    const text = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'lo-name';
    name.textContent = meta.name;
    const desc = document.createElement('div');
    desc.className = 'lo-desc';
    desc.textContent = meta.description;
    text.append(name, desc);

    label.append(cb, text);
    listOptions.appendChild(label);
  }
}

function renderAllowed() {
  const list = status.allowlist || [];
  allowedSection.hidden = list.length === 0;
  allowedList.innerHTML = '';
  for (const domain of list) {
    const row = document.createElement('div');
    row.className = 'allowed-item';
    const span = document.createElement('span');
    span.textContent = domain;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.title = 'Remove';
    btn.addEventListener('click', async () => {
      await send({ type: 'toggleAllowlist', domain });
      await refresh();
    });
    row.append(span, btn);
    allowedList.appendChild(row);
  }
}

function renderSite() {
  if (!currentHost) {
    siteHost.textContent = 'No site in this tab';
    allowBtn.disabled = true;
    allowBtn.textContent = 'Allow ads on this site';
    allowBtn.classList.remove('active');
    return;
  }
  const allowed = (status.allowlist || []).includes(currentHost);
  siteHost.textContent = currentHost;
  allowBtn.disabled = false;
  allowBtn.textContent = allowed ? 'Blocking off for this site' : 'Allow ads on this site';
  allowBtn.classList.toggle('active', allowed);
}

function reportUpdate(res) {
  if (!res) return;
  if (!res.ok) { setNote(res.error || 'Update failed', true); return; }
  const s = res.stats || {};
  const bits = [];
  if (s.networkRules != null) bits.push(s.networkRules.toLocaleString() + ' rules installed');
  if (s.truncated) bits.push('list capped at Chrome’s rule limit');
  if (res.failures && res.failures.length) {
    setNote(bits.join(' · ') + ' — ' + res.failures.join('; '), true);
  } else {
    setNote(bits.join(' · '));
  }
}

async function refresh() {
  status = await send({ type: 'getStatus' });
  enabledToggle.checked = status.enabled;
  statusDot.classList.toggle('off', !status.enabled);
  ruleCount.textContent = (status.activeRules || 0).toLocaleString();
  updatedAt.textContent = relativeTime(status.lastUpdated);
  renderLists();
  renderAllowed();
  renderSite();
}

enabledToggle.addEventListener('change', async () => {
  setNote(enabledToggle.checked ? 'Enabling…' : 'Disabling…');
  await send({ type: 'setEnabled', enabled: enabledToggle.checked });
  await refresh();
  setNote('');
});

allowBtn.addEventListener('click', async () => {
  if (!currentHost) return;
  await send({ type: 'toggleAllowlist', domain: currentHost });
  await refresh();
  setNote('Reload the page for this to take effect.');
});

updateBtn.addEventListener('click', async () => {
  updateBtn.disabled = true;
  setNote('Fetching filter lists…');
  const res = await send({ type: 'update' });
  updateBtn.disabled = false;
  await refresh();
  reportUpdate(res);
});

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHost = tab ? hostFromUrl(tab.url) : null;
  await refresh();
})();
