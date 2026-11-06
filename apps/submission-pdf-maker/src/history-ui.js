// 전환 기록 화면(#screen-history): 최근 20건, '기록 비우기'.
import { loadState, saveState } from './storage.js';

export function renderHistory() {
  const ul = document.getElementById('history-list');
  if (!ul) return;
  ul.textContent = '';
  const hist = loadState().history;
  if (!hist.length) {
    const li = document.createElement('li');
    li.className = 'ds-empty';
    li.textContent = '아직 기록이 없어요. 만든 PDF가 여기에 쌓여요.';
    ul.appendChild(li);
    return;
  }
  for (const h of hist) {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = h.label;
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = h.pageCount + '장 · 목표 ' + h.targetMb + 'MB';
    main.append(title, sub);
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const badge = document.createElement('span');
    badge.className = 'ds-badge ' + (h.ok ? 'ds-badge-good' : 'ds-badge-warn');
    badge.textContent = h.ok ? '목표 이하' : '목표 초과';
    const amount = document.createElement('span');
    amount.className = 'ds-list-amount';
    amount.textContent = (h.finalBytes / 1e6).toFixed(2) + 'MB';
    end.append(badge, amount);
    li.append(main, end);
    ul.appendChild(li);
  }
}

export function refreshHistory() {
  renderHistory();
}

export function initHistoryScreen() {
  const btn = document.getElementById('clear-history');
  if (btn) {
    btn.addEventListener('click', () => {
      const st = loadState();
      clearHistory();
      saveState({ targetMb: st.targetMb, history: [] });
      renderHistory();
      window.dispatchEvent(new CustomEvent('kofilepdf:storage-changed'));
    });
  }
  renderHistory();
}
