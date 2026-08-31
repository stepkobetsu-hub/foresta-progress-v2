(() => {
  const setLabel = (inputId, text, defaultValue) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const label = input.closest('label');
    if (label && label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) {
      label.firstChild.nodeValue = text;
    }
    if (!input.dataset.forestaDefaultApplied) {
      if (!String(input.value || '').trim()) input.value = String(defaultValue);
      input.dataset.forestaDefaultApplied = '1';
    }
  };

  const patch = () => {
    setLabel('elementaryTopTestScore', '表面の点数', 50);
    setLabel('elementaryTopTestMax', '表面の満点', 100);
    setLabel('elementaryTopTestBackScore', '裏面の点数', 30);
    setLabel('elementaryTopTestBackMax', '裏面の満点', 50);
  };

  patch();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      patch();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
