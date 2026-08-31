(() => {
  const SCORE_LABELS = {
    elementaryTopTestScore: '表面の点数',
    elementaryTopTestMax: '表面の満点',
    elementaryTopTestBackScore: '裏面の点数',
    elementaryTopTestBackMax: '裏面の満点',
  };

  function setLabelText(inputId, text) {
    const input = document.getElementById(inputId);
    const label = input?.closest('label');
    if (!label) return;
    const node = [...label.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function refreshUi() {
    Object.entries(SCORE_LABELS).forEach(([id, text]) => setLabelText(id, text));
    const saveLesson = document.getElementById('saveLesson');
    if (saveLesson && !/訂正/u.test(saveLesson.textContent || '')) {
      saveLesson.textContent = '進行表と宿題を保存';
      saveLesson.title = '進行表を保存すると、既定の次回宿題も同時に保存します';
    }
  }

  // Normal lesson flow only: after the existing progression handler opens the
  // default-homework confirmation, immediately confirm it. Correction mode is
  // intentionally excluded so an old record is never changed automatically.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#saveLesson');
    if (!button || /訂正/u.test(button.textContent || '')) return;
    queueMicrotask(() => {
      const confirm = document.getElementById('confirmLesson');
      if (!confirm || confirm.disabled) return;
      if (!/授業と宿題を保存/u.test(confirm.textContent || '')) return;
      confirm.click();
    });
  }, true);

  const observer = new MutationObserver(refreshUi);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  refreshUi();
})();
