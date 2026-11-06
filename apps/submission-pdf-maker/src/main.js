// KoFilePDF — 앱 시작: 저장된 상태를 불러와 화면 모듈을 초기화하고 상단 이동 버튼으로 세 화면 전환.
import { loadState } from './storage.js';
import { initMakeScreen, syncFromStorage } from './ui.js';
import { initHistoryScreen, renderHistory } from './history-ui.js';
import { initDataScreen } from './data-ui.js';

const SCREENS = ['make', 'history', 'data'];
// 현재 화면은 저장하지 않는다: 새로고침해도 문서 합치기 화면으로 돌아온다.
let current = 'make';

export function switchScreen(name) {
  if (!SCREENS.includes(name)) return;
  current = name;
  for (const s of SCREENS) {
    const sec = document.getElementById('screen-' + s);
    if (sec) sec.hidden = s !== name;
    const nav = document.getElementById('nav-' + s);
    if (nav) nav.setAttribute('aria-current', s === name ? 'page' : 'false');
  }
  if (name === 'history') renderHistory(); // 전환할 때 최신 기록 표시
}

export function initApp() {
  loadState(); // 저장된 상태를 불러온다(목표 용량은 화면이, 기록은 화면이 표시)
  initMakeScreen();
  initHistoryScreen();
  initDataScreen();
  for (const s of SCREENS) {
    const nav = document.getElementById('nav-' + s);
    nav.addEventListener('click', () => switchScreen(s));
  }
  syncFromStorage();
  switchScreen('make');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
  else initApp();
}
