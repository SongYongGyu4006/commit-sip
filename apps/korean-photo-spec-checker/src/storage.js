// 단일 localStorage 키("kbshrink.photo.state.v1")에 선택한 프리셋, 직접 입력
// 규격, 예시·변환 결과, 변환 기록을 한 덩어리로 저장하고 새로고침 시 복원한다.
// 모든 글자는 textContent 로만 보여 주고, 파싱 실패는 조용히 기본값으로 돌아간다.
import { getPresetById } from './presets.js';

export const STATE_KEY = 'kbshrink.photo.state.v1';

const DEFAULT_STATE = {
  presetId: 'toeic',
  custom: { width: 300, height: 400, ratioW: 3, ratioH: 4, maxBytes: 102400, ext: '.jpg' },
  sample: null, // '예시로 해 보기' 로 불러온 사진
  lastResult: null, // 마지막 판정 결과
  history: [], // 변환 기록 (최신 순)
};

function emptyState() {
  return {
    presetId: 'toeic',
    custom: { ...DEFAULT_STATE.custom },
    sample: null,
    lastResult: null,
    history: [],
  };
}

// 저장된 값을 골라 안전하게 합친다. 항목은 전부 안전 값이어야만 쓴다.
function sanitize(presetId, custom, sample, lastResult, history) {
  const s = emptyState();
  if (typeof presetId === 'string' && getPresetById(presetId)) s.presetId = presetId;
  const c = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
  if (Number.isSafeInteger(c.width)) s.custom.width = c.width;
  if (Number.isSafeInteger(c.height)) s.custom.height = c.height;
  if (Number.isSafeInteger(c.ratioW)) s.custom.ratioW = c.ratioW;
  if (Number.isSafeInteger(c.ratioH)) s.custom.ratioH = c.ratioH;
  if (Number.isSafeInteger(c.maxBytes)) s.custom.maxBytes = c.maxBytes;
  if (typeof c.ext === 'string' && c.ext) s.custom.ext = c.ext;
  if (sample && typeof sample === 'object' && typeof sample.fileName === 'string') s.sample = sample;
  if (lastResult && typeof lastResult === 'object' && lastResult.checks) s.lastResult = lastResult;
  if (Array.isArray(history) && history.every((r) => r && typeof r === 'object')) s.history = history;
  return s;
}

// 실패해도 기본 상태로 돌려주는 읽기
export function loadState() {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return emptyState();
    return sanitize(p.presetId, p.custom, p.sample, p.lastResult, p.history);
  } catch {
    return emptyState();
  }
}

// 통째로 저장 (오류는 조용히 무시 — 저장 실패해도 앱은 계속 동작)
export function saveState(state) {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* 저장 공간 부족 등은 조용히 무시 */
  }
}

export function saveSelectedPreset(state, presetId) {
  state.presetId = presetId;
  saveState(state);
}

// 변환 기록 추가 (최신 순 유지)
export function appendHistoryRecord(state, record) {
  state.history.unshift(record);
  saveState(state);
}

// 가져온 기록으로 통째 교체 (불러오기时用)
export function replaceHistory(state, records) {
  state.history = records;
  saveState(state);
}

// 기록 비우기 (선택한 프리셋은 보존)
export function clearHistory(state) {
  state.history = [];
  saveState(state);
}
