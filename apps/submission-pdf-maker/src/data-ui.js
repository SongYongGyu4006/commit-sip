// 데이터 보관 화면(#screen-data): JSON 내보내기 / 다시 불러오기.
import { loadState, saveState, exportStateJson, importStateJson } from './storage.js';
import { handleAppError } from './ui.js';
import { renderHistory } from './history-ui.js';

export function initDataScreen() {
  const exportBtn = document.getElementById('export-button');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');

  exportBtn.addEventListener('click', () => {
    const st = loadState();
    const blob = new Blob([exportStateJson(st)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kofilepdf-data.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    handleAppError('보관 파일을 만들었어요. 브라우저 다운로드 폴더에 있어요.');
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const f = importFile.files && importFile.files[0];
    if (!f) return;
    const state = importStateJson(await f.text());
    if (!state) {
      handleAppError('불러오지 못했어요. KoFilePDF 보관 파일(kofilepdf-data.json)인지 확인해 주세요.');
      return;
    }
    saveState(state);
    handleAppError('보관 파일을 불러왔어요. 목표 용량과 기록이 다시 들어왔어요.');
    renderHistory();
    window.dispatchEvent(new CustomEvent('kofilepdf:storage-changed'));
  });
}
