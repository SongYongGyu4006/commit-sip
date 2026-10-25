// 변환 기록 화면: 목록(최신순) 렌더링, kbshrink-history.json 내보내기·불러오기,
// 기록 비우기(확인 대화 포함), 한국어 상태 안내.
import { loadState, saveState, replaceHistory, clearHistory } from './storage.js';

const $ = (sel) => document.querySelector(sel);
let initialized = false;

function statusEl() {
  const el = $('#app-status');
  if (!el) return null;
  return el;
}

function setLocalStatus(msg, kind) {
  const el = statusEl();
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.className = 'ds-status';
    return;
  }
  el.textContent = msg;
  el.className = 'ds-status is-on ' + (kind === 'error' ? 'is-error' : 'is-ok');
}

function fmtBytes(b) {
  const n = Number(b) || 0;
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

export function renderHistoryView() {
  const list = $('#history-list');
  const empty = $('#history-empty');
  if (!list) return;
  const state = loadState();
  list.innerHTML = '';
  if (!state.history.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  for (const r of state.history) {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = r.fileName || (r.presetId || '') + ' 변환 결과';
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    const badge = document.createElement('span');
    badge.className = 'ds-badge ds-badge-accent';
    badge.textContent = r.presetLabel || r.presetId || '제출처';
    sub.appendChild(badge);
    if (r.quality) {
      const q = document.createElement('span');
      q.textContent = '화질 ' + r.quality;
      sub.appendChild(q);
    }
    if (r.timestamp) {
      const t = document.createElement('span');
      t.textContent = fmtDate(r.timestamp);
      sub.appendChild(t);
    }
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const amount = document.createElement('span');
    amount.className = 'ds-list-amount';
    amount.textContent = fmtBytes(r.sizeBytes);
    const sub2 = document.createElement('span');
    sub2.className = 'ds-list-sub';
    sub2.textContent = '변환 용량';
    end.appendChild(amount);
    end.appendChild(sub2);
    li.append(title, sub, end);
    list.appendChild(li);
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportHistoryJson() {
  const state = loadState();
  if (!state.history.length) {
    setLocalStatus('내보낼 기록이 없어요. 먼저 사진 변환을 한 뒤 다시 눌러 보세요.', 'error');
    return;
  }
  downloadJson('kbshrink-history.json', state.history);
  setLocalStatus('기록 ' + state.history.length + '개를 kbshrink-history.json 파일로 내보냈어요.', 'ok');
}

export function importHistoryJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      setLocalStatus('그 파일은 올바른 JSON이 아니에요. 내보내기 한 kbshrink-history.json 파일을 다시 골라 보세요.', 'error');
      return;
    }
    if (!Array.isArray(data)) {
      setLocalStatus('그 파일은 변환 기록 목록 형식이 아니에요. 내보내기 한 파일을 다시 골라 보세요.', 'error');
      return;
    }
    const state = loadState();
    replaceHistory(state, data);
    renderHistoryView();
    setLocalStatus('기록 ' + data.length + '개를 불러왔어요.', 'ok');
  };
  reader.onerror = () => setLocalStatus('파일을 읽지 못했어요. 다시 골라 보세요.', 'error');
  reader.readAsText(file);
}

// 기록 비우기: 되돌릴 수 없으니 확인
function confirmReset() {
  const state = loadState();
  const n = state.history.length;
  const holder = $('#history-list').parentElement; // ds-page 안 섹션
  let line = holder.querySelector('.app-confirm');
  if (line) {
    line.remove();
    line = null;
  }
  if (!n) {
    setLocalStatus('비울 기록이 없어요.', 'ok');
    return;
  }
  line = document.createElement('div');
  line.className = 'ds-row app-confirm';
  const q = document.createElement('span');
  q.className = 'ds-label';
  q.textContent = n + '개 지울까요? 이 뒤로는 되돌릴 수 없어요.';
  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'ds-btn ds-btn-primary app-btn-danger';
  yes.textContent = '지우기';
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'ds-btn';
  no.textContent = '그대로 두기';
  yes.addEventListener('click', () => {
    clearHistory(state);
    saveState(state);
    renderHistoryView();
    setLocalStatus('변환 기록 ' + n + '개를 모두 지웠어요.', 'ok');
    line.remove();
  });
  no.addEventListener('click', () => {
    line.remove();
    setLocalStatus('', '');
  });
  line.append(q, yes, no);
  holder.appendChild(line);
  setLocalStatus('', '');
}

export function initHistoryView() {
  if (initialized) return;
  initialized = true;
  renderHistoryView();
  const exportBtn = $('#export-button');
  const importBtn = $('#import-button');
  const importFile = $('#import-file');
  const resetBtn = $('#reset-button');
  exportBtn.addEventListener('click', exportHistoryJson);
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const f = importFile.files && importFile.files[0];
    if (f) importHistoryJson(f);
    importFile.value = '';
  });
  resetBtn.addEventListener('click', confirmReset);
}
