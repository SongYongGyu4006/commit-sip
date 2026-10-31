// 데이터 관리 화면: 결과 글자 표시, 상태 내보내기 다운로드, 가져오기 파일 읽기.
import { isValidState } from './storage.js';

export function renderData(screen, result) {
  screen.querySelector('#result-json').textContent = JSON.stringify(result, null, 2);
}

// heicpack-state.json 을 다운로드한다.
export function exportState(state) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'heicpack-state.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 가져오기 파일 읽기: 파싱된 JSON 이 {entries, csvText, discard} 평범한 객체이고 진단이 안 터지는 경우만 유효.
// 유효하면 복제된 상태 객체, 아니면 null.
export async function readImportFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return null;
  }
  const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isPlain(parsed)) return null;
  if (!Array.isArray(parsed.entries) || typeof parsed.csvText !== 'string' || !isPlain(parsed.discard)) return null;
  if (!isValidState(parsed)) return null;
  return JSON.parse(JSON.stringify(parsed));
}
