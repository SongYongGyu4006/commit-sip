// 진입 모듈: 데이터를 불러오고 세 화면을 연결하며, 상단 버튼으로 화면 전환과
// #app-status 메시지, 상태 저장을 총괄한다.
import { loadAllData } from './data.js';
import { loadState, saveState, clearState, defaultState, addSaved, removeSaved, STORAGE_KEY } from './storage.js';
import { findVacationWindows } from './app.js';
import { todayInSeoul, isValidDate } from './format.js';
import { initPlanScreen, renderCards } from './ui-plan.js';
import { initSavedScreen, renderSaved } from './ui-saved.js';
import { initDataScreen } from './ui-data.js';

let state = loadState();
let data = null; // { holidays, weather, holidaysMeta, weatherMeta }
let planReady = false;
let savedRendered = false;

const screens = ['plan', 'saved', 'data'];

// 상단 버튼으로 한 화면만 보인다. (나머지는 hidden)
function showScreen(name) {
  for (const id of screens) {
    document.getElementById('screen-' + id).hidden = id !== name;
  }
  if (name === 'saved') {
    if (state.saved.length === 0) setStatus('저장한 후보가 없습니다', false);
    renderSaved(state, removeOne);
  }
}

// 상태 표시 영역(성공은 비움, 오류는 한국어 문구).
function setStatus(text, isError) {
  const el = document.getElementById('app-status');
  el.textContent = text;
  el.classList.toggle('error', Boolean(isError));
}

function recalc() {
  if (!data) return;
  if (!state.todayOverride) {
    setStatus('기준 날짜를 선택하면 후보를 계산합니다.', false);
    renderCards([], data.holidays, saveCard);
    return;
  }
  if (!isValidDate(state.todayOverride)) {
    setStatus('기준 날짜가 올바르지 않습니다. 올바른 날짜를 선택해 주세요.', true);
    renderCards([], data.holidays, saveCard);
    return;
  }
  let result;
  try {
    result = findVacationWindows(data.holidays, data.weather, state.leaveDays, state.todayOverride);
  } catch (err) {
    setStatus(err.message || '계산에 문제가 있습니다.', true);
    renderCards([], data.holidays, saveCard);
    return;
  }
  setStatus(result.windows.length ? '' : '후보가 없습니다', false);
  renderCards(result.windows, data.holidays, saveCard);
}

function persist() {
  saveState(state);
}

function saveCard(w) {
  const before = state.saved.length;
  state = addSaved(state, w.start, w.end);
  if (state.saved.length !== before) {
    persist();
    setStatus('후보 ' + (before + 1) + '개를 저장했습니다.', false);
  }
  renderSaved(state, removeOne);
  planReady && showScreen('plan'); // 다시 계산은 필요 없음
}

function removeOne(start, end) {
  state = removeSaved(state, start, end);
  persist();
  setStatus('', false);
  renderSaved(state, removeOne);
  showScreen('saved');
}

function setOverrideFromInputs(sliderValue, dateValue) {
  state = { ...state, leaveDays: Number(sliderValue), todayOverride: dateValue || null };
  persist();
}

function applyExample(s) {
  s.leaveDays = 3;
  s.todayOverride = '2026-09-21';
  state = { ...s };
  persist();
}

function applyImported(next) {
  state = { leaveDays: next.leaveDays, todayOverride: next.todayOverride, saved: next.saved };
  persist();
  setStatus('상태를 파일에서 불러왔습니다.', false);
  syncInputs();
  recalc();
  renderSaved(state, removeOne);
  showScreen('plan');
}

function resetAll() {
  clearState();
  state = defaultState();
  persist();
  setStatus('', false);
  syncInputs();
  recalc();
  renderSaved(state, removeOne);
  showScreen('plan');
}

function syncInputs() {
  const slider = document.getElementById('leave-slider');
  const leaveValue = document.getElementById('leave-value');
  const todayInput = document.getElementById('today-input');
  slider.value = String(state.leaveDays);
  leaveValue.textContent = state.leaveDays + '일';
  todayInput.value = state.todayOverride ?? '';
}

async function boot() {
  // 상단 버튼 연결
  for (const id of screens) {
    document.getElementById('nav-' + id).addEventListener('click', () => showScreen(id));
  }

  try {
    data = await loadAllData();
  } catch {
    setStatus('데이터 파일을 불러오지 못했습니다. 잠시 후 새로 고침해 주세요.', true);
    return;
  }

  // 기본값: 저장된 것이 없으면 오늘 날짜(서울) 기준.
  if (!state.todayOverride) {
    state = { ...state, todayOverride: todayInSeoul() };
    persist();
  }

  initPlanScreen({
    state,
    holidays: data.holidays,
    weather: data.weather,
    onRecalc: recalc,
    onSave: saveCard,
    onSetOverride: setOverrideFromInputs,
    onLeaveChange: (s) => { state = { ...state, leaveDays: s.leaveDays }; },
    onExample: applyExample,
  });
  initSavedScreen();
  initDataScreen({
    state,
    holidaysMeta: data.holidaysMeta,
    weatherMeta: data.weatherMeta,
    onImported: applyImported,
    onReset: resetAll,
    onStatus: (text, isError) => setStatus(text, isError),
  });

  syncInputs();
  renderSaved(state, removeOne);
  recalc();
  showScreen('plan');
}

boot();
