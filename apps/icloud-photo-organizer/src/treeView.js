// 폴더 미리보기 화면: 요약 문장 + 촬영일 폴더 목록.
import { fmt } from './format.js';

export function renderTree(screen, result) {
  const n = result.datedCount + result.undatedCount;
  screen.querySelector('#tree-summary').textContent =
    n + '장 중 ' + result.datedCount + '장 날짜 확인 · ' + result.undatedCount + '장 날짜 없음';
  const list = screen.querySelector('#tree-list');
  list.textContent = '';
  for (const item of result.tree) {
    const li = document.createElement('li');
    li.textContent = item.folder + ' · ' + item.count + '장 · ' + fmt(item.bytes);
    list.appendChild(li);
  }
}
