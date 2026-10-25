// 진입 모듈: localStorage 저장 상태와 URL 해시를 복원하고, 상단 탐색 버튼으로
// 3개 화면(사진 검사·변환 / 제출처 규격표 / 변환 기록)을 전환한다.
import { getPresetById } from './presets.js';
import { loadState, saveState } from './storage.js';
import { initWorkspaceView, renderWorkspaceView, selectPresetInWorkspace, syncStateFromMain } from './view-workspace.js';
import { initPresetsView, renderPresetsView } from './view-presets.js';
import { initHistoryView, renderHistoryView } from './view-history.js';

const $ = (sel) => document.querySelector(sel);

const SCREENS = [
  { id: 'workspace', nav: '#nav-workspace', view: '#view-workspace', init: initWorkspaceView, render: renderWorkspaceView },
  { id: 'presets', nav: '#nav-presets', view: '#view-presets', init: initPresetsView, render: renderPresetsView },
  { id: 'history', nav: '#nav-history', view: '#view-history', init: initHistoryView, render: renderHistoryView },
];

let currentScreen = 'workspace';
let state = null;
let initialized = false;

function setNavActive() {
  for (const s of SCREENS) {
    const btn = $(s.nav);
    if (btn) btn.setAttribute('aria-pressed', s.id === currentScreen ? 'true' : 'false');
  }
}

function showScreen(id) {
  for (const s of SCREENS) {
    const v = $(s.view);
    if (v) v.hidden = s.id !== id;
  }
  setNavActive();
  currentScreen = id;
}

export function switchScreen(id) {
  const s = SCREENS.find((x) => x.id === id);
  if (!s) {
    id = 'workspace';
  }
  showScreen(id);
  pushStateToWorkspace();
  if (id === 'workspace') renderWorkspaceView();
  if (id === 'presets') renderPresetsView();
  if (id === 'history') renderHistoryView();
  currentScreen = id;
}

// 해시 → 프리셋 (작업 화면에서만 유효)
export function syncHashPreset() {
  const h = window.location.hash;
  if (!h || h === '#') return;
  const m = h.match(/^#\/([a-z0-9_-]+)$/);
  if (!m) return;
  const id = m[1];
  if (!getPresetById(id)) {
    // 미지의 해시는 toeic 으로 돌아온다
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#/toeic');
    }
    selectPresetInWorkspace('toeic');
    return;
  }
  selectPresetInWorkspace(id);
}

// main.js 의 state 를 view-workspace 의 state 객체에 덮어씀 (화면 전환 시 최신화)
function pushStateToWorkspace() {
  if (state) syncStateFromMain(state);
}

// view-presets 의 '적용' 버튼용 (화면 전환 포함)
function applyPresetAndGo(id) {
  selectPresetInWorkspace(id);
  if (window.history && window.history.pushState) {
    window.history.pushState(null, '', '#' + id);
  }
  switchScreen('workspace');
}

window.__kbshrinkSelectPreset = applyPresetAndGo;

export function initApp() {
  if (initialized) return;
  initialized = true;
  state = loadState();

  // 화면 3개 전부 초기화 (리스너 등록은 각 모듈에서 한 번씩)
  initWorkspaceView();
  initPresetsView();
  initHistoryView();

  // nav 버튼 (event delegation 없음 — 3개 고정 버튼)
  for (const s of SCREENS) {
    $(s.nav).addEventListener('click', () => {
      switchScreen(s.id);
    });
  }

  // 초기 화면: 저장된 프리셋/예시 결과를 복원 (toeic 이 아닌 경우만 명시 선택)
  if (state.presetId && state.presetId !== 'toeic') {
    selectPresetInWorkspace(state.presetId);
    if (window.location.hash !== '#/' + state.presetId) {
      window.history.replaceState(null, '', '#' + state.presetId);
    }
  } else {
    renderWorkspaceView();
  }
  // 저장된 예시 결과 복원 (lastResult)
  if (state.lastResult) {
    const j = $('#result-json');
    if (j) j.textContent = JSON.stringify(state.lastResult, null, 2);
  }
  showScreen('workspace');

  // 해시 변화(뒤로/앞으로)
  window.addEventListener('hashchange', () => {
    syncHashPreset();
  });

  // 초기 로드 시 해시가 있으면 해당 프리셋 선택
  if (window.location.hash) {
    syncHashPreset();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
