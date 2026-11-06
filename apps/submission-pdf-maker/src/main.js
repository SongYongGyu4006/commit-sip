// 앱 시작: 저장된 상태를 불러와 전체 화면 모듈을 초기화하고,
// 상단 이동 버튼(#nav-make/#nav-history/#nav-data)으로 세 화면 전환을 제어한다.
import { loadState } from './storage.js';
import { initMakeScreen, syncFromStorage } from './ui.js';
import { initHistoryScreen, renderHistory } from './history-ui.js';
import { initDataScreen } from './data-ui.js';

const NAV = { make: 'nav-make', history: 'nav-history', data: 'nav-data' };
const SCREEN = { make: 'screen-make', history: 'screen-history', data: 'screen-data' };

export function switchScreen(name) {
  for (const key of ['make', 'history', 'data']) {
    const s = document.getElementById(SCREEN[key]);
    if (s) s.hidden = key !== name;
    const n = document.getElementById(NAV[key]);
    if (n) {
      n.setAttribute('aria-pressed', String(key === name));
      n.setAttribute('aria-current', key === name ? 'page' : 'false');
    }
  }
}

export function initApp() {
  loadState(); // 저장된 상태 미리 로딩(목표 용량 복원 등)
  initMakeScreen();
  initHistoryScreen();
  initDataScreen();

  document.getElementById('nav-make').addEventListener('click', () => switchScreen('make'));
  document.getElementById('nav-history').addEventListener('click', () => {
    switchScreen('history');
    renderHistory();
  });
  document.getElementById('nav-data').addEventListener('click', () => switchScreen('data'));

  // 보관 파일을 다시 불러오거나 기록을 비우면 화면 동기화.
  window.addEventListener('kofilepdf:storage-changed', () => {
    syncFromStorage();
    renderHistory();
  });

  switchScreen('make');
}

// HTML 이 src/main.js 를 type="module" 로 로드하므로 여기서 시작한다.
initApp();
