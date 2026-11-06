// KoFilePDF — 설정 보관 화면(#screen-data): 목표 용량과 기록을 파일로 내보내고,
// 선택한 보관 파일을 검증해 상태를 복원하는 가져오기.
import { loadState, saveState, exportStateJson, importStateJson } from './storage.js';
import { syncFromStorage, handleAppError } from './ui.js';
import { renderHistory } from './history-ui.js';

export function initDataScreen() {
  const exportBtn = document.getElementById('export-button');
  exportBtn.addEventListener('click', () => {
    const st = loadState();
    const blob = new Blob([exportStateJson(st)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kofilepdf-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    handleAppError(''); // 성공한 변경: 상태 안내 지우기
  });

  const importInput = document.getElementById('import-file');
  importInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const st = importStateJson(String(reader.result));
      if (!st) {
        handleAppError('보관 파일을 읽지 못했어요. kofilepdf-data.json 형식이 아니면 그대로 유지돼요.');
        return;
      }
      const err = saveState(st);
      if (err) {
        handleAppError(err);
        return;
      }
      syncFromStorage(); // 저장 상태가 화면에 반영(목표 용량·기록)
      renderHistory();
      handleAppError(''); // 성공
    };
    reader.onerror = () => handleAppError('파일을 읽지 못했어요. 다시 선택해 주세요.');
    reader.readAsText(file);
  });
}
