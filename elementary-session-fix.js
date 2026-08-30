// Ensures the elementary module uses the currently visible login role.
// Teacher devices can retain an older remembered student session in localStorage;
// the elementary module historically read that stale session first.
function readCandidate(store, key) {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value?.token ? value : null;
  } catch (_) { return null; }
}

function activeRoleFromUi() {
  const meta = String(document.getElementById('userMeta')?.textContent || '');
  if (meta.includes('講師')) return 'teacher';
  if (meta.includes('生徒')) return 'student';
  if (meta.includes('管理者')) return 'admin';
  return '';
}

function syncElementaryActiveSession() {
  const role = activeRoleFromUi();
  if (!role) return;
  const candidates = [
    readCandidate(sessionStorage, 'forestaProgressSession'),
    readCandidate(sessionStorage, 'forestaProgressAuth'),
    readCandidate(localStorage, 'forestaProgressSession'),
    readCandidate(localStorage, 'forestaProgressAuth'),
  ].filter(Boolean);
  const active = candidates.find((item) => item.role === role);
  if (!active) return;
  const current = readCandidate(localStorage, 'forestaProgressAuth');
  if (!current || current.token !== active.token || current.role !== active.role) {
    localStorage.setItem('forestaProgressAuth', JSON.stringify(active));
  }
}

document.addEventListener('click', syncElementaryActiveSession, true);
document.addEventListener('focusin', syncElementaryActiveSession, true);
window.addEventListener('DOMContentLoaded', syncElementaryActiveSession);
const metaObserver = new MutationObserver(syncElementaryActiveSession);
metaObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
setTimeout(syncElementaryActiveSession, 300);
setTimeout(syncElementaryActiveSession, 1000);
