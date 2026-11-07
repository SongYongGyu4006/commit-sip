// 앱 시작: 저장 상태 복원 → 화면 즉시 렌더 → 실시간 데이터 로드 → 화면 전환·예시·컨텍스트·내보내기·가져오기·초기화 연결.

import { summarizeTaskCosts } from './app.js';
import { getSampleData } from './sample.js';
import { loadState, saveState, recordSnapshot, validateState, clearState } from './storage.js';
import { renderDashboard, renderHistory, renderSettings, renderStatus, clearViews } from './render.js';

let state = loadState();
let liveModels = null; // OpenRouter data 배열
let liveHf = null; // Hugging Face 행 배열
let liveMeta = null; // { or: 메타, hf: 메타 }
let dataError = null; // 데이터 로드에 실패한 파일들의 한국어 안내

const SCREENS = ['dashboard', 'history', 'settings'];

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return [...document.querySelectorAll(sel)]; }

export function switchScreen(name) {
  for (const id of SCREENS) {
    const section = $('#screen-' + id);
    const nav = $('#nav-' + id);
    if (id === name) { section.removeAttribute('hidden'); nav.setAttribute('aria-pressed', 'true'); }
    else { section.setAttribute('hidden', ''); nav.setAttribute('aria-pressed', 'false'); }
  }
  if (name === 'history') renderHistory(state.history[state.mode]);
  if (name === 'settings') renderSettings(state.minContext);
}

// fetched_at "2026-11-07T06:47:25" → "2026-11-07 06:47"
function formatFetchedAt(iso) {
  if (typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? m[1] + ' ' + m[2] : iso;
}

let liveLoading = true; // 실시간 데이터가 아직 도착하지 않았다(로딩 중 = 실패와 다른 상태)

function updateMetaLabels() {
  const mode = state.mode;
  const time = $('#data-time');
  const terms = $('#data-terms');
  if (mode === 'example') {
    time.textContent = '예시 데이터';
    terms.textContent = '내장 샘플: OpenRouter 모델·가격 목록, Hugging Face 모델 목록';
    return;
  }
  if (liveLoading) {
    // 실패가 아니라 불러오는 중: 오류 문구로 읽히지 않게 따로 구분
    time.textContent = '불러오는 중';
    terms.textContent = '실시간 데이터';
    return;
  }
  if (dataError || !liveMeta) {
    time.textContent = '불러오지 못함';
    terms.textContent = '"예시로 해 보기"로 확인';
    return;
  }
  const times = [liveMeta.or && liveMeta.or.fetched_at, liveMeta.hf && liveMeta.hf.fetched_at].filter(Boolean).map(formatFetchedAt);
  time.textContent = times.length ? times.join(' · ') : '';
  const names = [liveMeta.or && liveMeta.or.name, liveMeta.hf && liveMeta.hf.name].filter(Boolean);
  terms.textContent = names.join(', ') + ' · ' + [liveMeta.or && liveMeta.or.terms, liveMeta.hf && liveMeta.hf.terms].filter(Boolean).join(', ');
}

// 데이터 모드(현재)로 요약·렌더·기록
function renderCurrent() {
  const mode = state.mode;
  let models, hfRows, nowIso;
  if (mode === 'example') {
    const sample = getSampleData();
    models = sample.models;
    hfRows = sample.hfRows;
    nowIso = sample.nowIso;
  } else {
    if (!liveModels || !liveHf || dataError) {
      clearViews();
      renderStatus(dataError || '모델 데이터를 불러오지 못했어요. "예시로 해 보기"를 눌러 보세요.', 'error');
      renderHistory(state.history[mode]);
      return;
    }
    models = liveModels;
    hfRows = liveHf;
    nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  let result;
  try {
    result = summarizeTaskCosts(models, hfRows, { minContext: state.minContext }, nowIso);
  } catch (err) {
    clearViews();
    renderStatus('계산에 실패했어요. 기준값을 다시 확인해 주세요.', 'error');
    return;
  }
  const costs = {};
  for (const t of result.tasks) costs[t.key] = t.cheapest ? t.cheapest.costUsd : null;
  recordSnapshot(state, mode, result.asOf, costs);
  saveState(state);
  renderDashboard(result, state.minContext);
  renderHistory(state.history[mode]);
  updateMetaLabels();
  if (mode === 'example') {
    // 예시 모드에서는 실시간으로 다시 계산할 수 있는 방법을 알려 준다
    renderStatus('예시 데이터. 실시간으로 다시 계산하려면 "실시간 데이터 보기"를 눌러 주세요.', 'success');
    return;
  }
  // SPEC: 성공 이후 #app-status 는 비운다
  renderStatus('', 'success');
}

function fetchDataFile(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

async function loadLiveData() {
  dataError = null;
  const results = await Promise.allSettled([
    fetchDataFile('data/openrouter_models.json'),
    fetchDataFile('data/hf_models.json'),
    fetchDataFile('data/openrouter_models.meta.json'),
    fetchDataFile('data/hf_models.meta.json')
  ]);
  const failed = [];
  liveModels = null; liveHf = null; liveMeta = { or: null, hf: null };
  const or = results[0];
  if (or.status === 'fulfilled' && or.value && Array.isArray(or.value.data)) liveModels = or.value.data;
  else failed.push('OpenRouter 모델 목록을 읽지 못했어요. 이 페이지를 다시 열어 주세요.');
  const hf = results[1];
  if (hf.status === 'fulfilled' && Array.isArray(hf.value)) liveHf = hf.value;
  else failed.push('Hugging Face 모델 목록을 읽지 못했어요. 이 페이지를 다시 열어 주세요.');
  if (results[2].status === 'fulfilled' && results[2].value) liveMeta.or = results[2].value;
  if (results[3].status === 'fulfilled' && results[3].value) liveMeta.hf = results[3].value;
  if (failed.length) dataError = failed.join(' ');
}

function exportFile() {
  const payload = { version: 1, mode: state.mode, minContext: state.minContext, history: state.history };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'llm-task-costs.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  renderStatus('기록을 llm-task-costs.json 파일로 내보냈어요.', 'success');
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const valid = validateState(parsed);
      if (!valid) {
        renderStatus('가져올 수 없어요. 파일을 잘못 만들었어요: 버전 1, 모드, 최소 컨텍스트, 기록이 들어 있어야 해요.', 'error');
        return;
      }
      state = valid;
      saveState(state);
      switchScreen('dashboard');
      renderSettings(state.minContext);
      renderStatus('기록을 불러왔어요.', 'success');
      renderCurrent();
    } catch {
      renderStatus('가져올 수 없어요. 파일을 읽을 수 없어요: 유효한 JSON 파일이어야 해요.', 'error');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  state = clearState();
  saveState(state);
  switchScreen('dashboard');
  renderSettings(state.minContext);
  if (state.mode === 'example') renderCurrent();
  else {
    // 초기화 뒤 다시 결과가 보이면 예시로 돌려 놓는다(데이터는 다시 불러오지 않아도 되므로)
    state.mode = 'example';
    saveState(state);
    renderCurrent();
  }
  renderHistory(state.history[state.mode]);
}

let initialized = false;
export function initApp() {
  if (initialized) return;
  initialized = true;

  for (const id of SCREENS) {
    $('#nav-' + id).addEventListener('click', () => switchScreen(id));
  }

  $('#example-button').addEventListener('click', () => {
    state.mode = 'example';
    saveState(state);
    renderCurrent();
  });

  // 예시 모드에서 실시간 데이터로 계산하는 버튼.
  // renderCurrent()이 기록·렌더를 모두 맡고, 여기서 기록을 다시 넣지 않는다(중복 방지).
  $('#live-button').addEventListener('click', () => {
    state.mode = 'live';
    saveState(state);
    renderCurrent(); // 데이터가 있으면 다시 계산·렌더, 없으면 #app-status 로 안내
  });

  const select = $('#min-context-select');
  select.addEventListener('change', () => {
    const next = Number(select.value);
    if (select.value === '' || !Number.isSafeInteger(next) || next < 0) return;
    state.minContext = next;
    saveState(state);
    renderCurrent();
  });

  $('#export-button').addEventListener('click', exportFile);
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', () => {
    const file = $('#import-file').files && $('#import-file').files[0];
    if (file) importFile(file);
    $('#import-file').value = '';
  });

  // 지우기: 되돌릴 수 없으니 먼저 확인
  let confirming = false;
  $('#reset-button').addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      $('#reset-button').textContent = '지울까요?';
      renderStatus('모든 기록을 지울게요. 계속하려면 "지울까요?"를, 그대로 두려면 다시 "기록 초기화"를 누르세요.', 'error');
      return;
    }
    confirming = false;
    $('#reset-button').textContent = '기록 초기화';
    resetAll();
  });

  // 화면 표시 상태 정리: 대시보드가 먼저 보인다
  for (const id of SCREENS) if (id !== 'dashboard') $('#screen-' + id).setAttribute('hidden', '');
  $('#nav-dashboard').setAttribute('aria-pressed', 'true');

  // 실시간 데이터가 도착하기 전에 복원된 상태로 화면을 즉시 채운다(새로고침 뒤 타이밍 경쟁 방지)
  updateMetaLabels();
  renderSettings(state.minContext);
  renderHistory(state.history[state.mode]);
  if (state.mode === 'example') renderCurrent();

  // 실시간 데이터 로딩: 도착 후 현재 모드(실시간)로 갱신
  loadLiveData().then(() => {
    liveLoading = false;
    if (state.mode !== 'live') {
      updateMetaLabels();
      return;
    }
    if (dataError) {
      clearViews();
      renderStatus(dataError + ' "예시로 해 보기"를 누르면 예시 결과로 확인할 수 있어요.', 'error');
      updateMetaLabels();
    } else {
      renderCurrent();
    }
    renderHistory(state.history[state.mode]);
  });
}

// 브라우저에서 1회 초기화(모듈은 DOM 준비 후 로드되지만 readyState를 봐서 두 경우를 다 대응)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
  } else {
    initApp();
  }
}
