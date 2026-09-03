// Applies element-hiding (cosmetic) rules. Network blocking is handled by
// declarativeNetRequest in the background; this only hides the leftover
// containers that would otherwise sit as blank gaps in the layout.

(function () {
  const host = location.hostname;
  if (!host) return;

  chrome.runtime.sendMessage({ type: 'getCosmetic', host }, (res) => {
    if (chrome.runtime.lastError) return;
    if (!res || !res.selectors || !res.selectors.length) return;
    apply(res.selectors);
  });

  function apply(selectors) {
    const style = document.createElement('style');
    style.id = 'simplehome-cosmetic';
    (document.head || document.documentElement).appendChild(style);

    const sheet = style.sheet;
    if (!sheet) return;

    // One invalid selector invalidates its whole comma-separated rule, so
    // insert in chunks and, only when a chunk fails, retry that chunk one
    // selector at a time. Bad entries then cost themselves rather than the
    // 199 valid selectors they were grouped with.
    const CHUNK = 200;
    for (let i = 0; i < selectors.length; i += CHUNK) {
      const group = selectors.slice(i, i + CHUNK);
      try {
        sheet.insertRule(group.join(',') + '{display:none!important}', sheet.cssRules.length);
      } catch (_) {
        for (const sel of group) {
          try {
            sheet.insertRule(sel + '{display:none!important}', sheet.cssRules.length);
          } catch (_) { /* skip the individual offender */ }
        }
      }
    }
  }
})();
