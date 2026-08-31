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

  function isNormalLessonProgress() {
    return [...document.querySelectorAll('#modalBody .lessonDayToggle')]
      .some((button) => /今日/u.test(button.textContent || ''));
  }

  function refreshUi() {
    Object.entries(SCORE_LABELS).forEach(([id, text]) => setLabelText(id, text));
    const saveLesson = document.getElementById('saveLesson');
    if (saveLesson && isNormalLessonProgress()) {
      saveLesson.textContent = '進行表と宿題を保存';
      saveLesson.title = '進行表を保存すると、既定の次回宿題も同時に保存します';
    }
  }

  // 通常授業だけ、既存の宿題確認画面を内部で即時確定する。
  // 既存の宿題生成ルールをそのまま使うため、算数・英語等の既定宿題を
  // 別実装で二重管理しない。過去授業の訂正モードは対象外。
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#saveLesson');
    if (!button || !isNormalLessonProgress()) return;
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
