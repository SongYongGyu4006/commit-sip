// KoFilePDF — 변환 기록 화면(#screen-history): 저장된 생성 기록 목록을 표시하고 기록 비우기.
import { loadState, saveState } from './storage.js';

const MB = 1048576;

export function renderHistory() {
  const ul = document.getElementById('history-list');
  if (!ul) return;
  ul.textContent = '';
  const { history } = loadState();
  if (history.length === 0) {
    const li = document.createElement('li');
    li.className = 'ds-empty';
    li.textContent = '아직 만든 기록이 없어요. 문서 합치기 화면에서 PDF를 만들면 여기에 최신순으로 쌓여요.';
    ul.appendChild(li);
    return;
  }
  for (const r of history) {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = (r.label === 'example' ? '예시 사진' : '내 파일') + ' ' + r.pageCount + '장';
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = '목표 ' + r.targetMb + 'MB · 결과 ' + (r.finalBytes / MB).toFixed(2) + 'MB';
    main.appendChild(title);
    main.appendChild(sub);
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const badge = document.createElement('span');
    badge.className = 'ds-badge ' + (r.ok ? 'ds-badge-good' : 'ds-badge-bad');
    badge.textContent = r.ok ? '목표 이하' : '목표 초과';
    end.appendChild(badge);
    li.appendChild(main);
    li.appendChild(end);
    ul.appendChild(li);
  }
}

export function initHistoryScreen() {
  const clearBtn = document.getElementById('clear-history');
  if (!clearBtn) return;
  clearBtn.addEventListener('click', () => {
    const state = loadState();
    if (state.history.length === 0) return; // 이미 비었으면 그대로
    if (!window.confirm(state.history.length + '개 지울까요? 지우면 다시 만들 수 없어요.')) return;
    state.history = [];
    saveState(state);
    renderHistory();
  });
  renderHistory();
}
