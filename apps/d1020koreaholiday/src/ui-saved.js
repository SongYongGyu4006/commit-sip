// 저장한 후보 화면: 목록을 그리고 삭제 버튼을 연결한다.
import { formatPeriod } from './format.js';

export function initSavedScreen() {
  // 목록 갱신은 상태가 바뀔 때마다 main 이 renderSaved 로 호출한다.
}

// 저장 목록을 다시 렌더한다. onRemove(start, end) 로 삭제 요청을 올린다.
export function renderSaved(state, onRemove) {
  const list = document.getElementById('saved-list');
  list.textContent = '';
  for (const s of state.saved) {
    const li = document.createElement('li');
    li.className = 'saved-item';
    const info = document.createElement('span');
    info.className = 'saved-info';
    const totalDays =
      Math.round(
        (new Date(Date.UTC(...s.end.split('-').map(Number))) - new Date(Date.UTC(...s.start.split('-').map(Number)))) / 86400000
      ) + 1;
    info.textContent = formatPeriod(s.start, s.end) + ' — ' + totalDays + '일';
    const btn = document.createElement('button');
    btn.className = 'unsave-button';
    btn.textContent = '제거';
    btn.addEventListener('click', () => onRemove(s.start, s.end));
    li.append(info, btn);
    list.append(li);
  }
}
