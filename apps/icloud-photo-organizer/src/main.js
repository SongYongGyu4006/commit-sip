// 진입: 상태 불러오기 → 화면 전환, 변경 처리, 저장, 오류 표시, 초기화.
import { diagnoseIcloudExport } from './app.js';
import { loadState, saveState, clearState } from './storage.js';
import { getSample } from './sample.js';
import { renderDiagnose, readPickedFiles } from './diagnoseView.js';
import { renderTree } from './treeView.js';
import { renderData, exportState, readImportFile } from './dataView.js';

export async function init() {
  const status = document.querySelector('#app-status');
  const screens = ['diagnose', 'tree', 'data'].map((id) => document.querySelector('#screen-' + id));
  const [diagnoseScreen, treeScreen, dataScreen] = screens;
  let isSample = false;
  let state = null;

  const saved = loadState();
  if (saved) state = saved;
  else {
    state = getSample();
    isSample = true;
    saveState(state);
  }

  const clearResults = () => {
    diagnoseScreen.querySelector('#headline').textContent = '';
    for (const id of ['seg-liveVideo', 'seg-copy', 'seg-editedOriginal', 'seg-keep']) {
      diagnoseScreen.querySelector('#' + id).style.width = '0%';
    }
    diagnoseScreen.querySelector('#category-list').textContent = '';
    diagnoseScreen.querySelector('#savings').textContent = '';
    diagnoseScreen.querySelector('#bar-legend').textContent = '';
    diagnoseScreen.querySelector('#csv-hint').textContent = '';
    treeScreen.querySelector('#tree-list').textContent = '';
    treeScreen.querySelector('#tree-summary').textContent = '';
    dataScreen.querySelector('#result-json').textContent = '';
  };

  const showError = (msg) => {
    status.textContent = msg;
    clearResults();
  };

  const renderAll = () => {
    const result = diagnoseIcloudExport(state.entries, state.csvText, state.discard);
    renderDiagnose(diagnoseScreen, state, result, isSample);
    renderTree(treeScreen, result);
    renderData(dataScreen, result);
    status.textContent = '';
    saveState(state);
  };

  // 화면 전환: 보이는 화면 1개만, active nav 버튼 유지.
  const show = (name) => {
    for (const id of ['diagnose', 'tree', 'data']) {
      const el = document.querySelector('#screen-' + id);
      if (id === name) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
    for (const id of ['diagnose', 'tree', 'data']) {
      const btn = document.querySelector('#nav-' + id);
      if (btn) btn.setAttribute('aria-current', id === name ? 'page' : 'false');
    }
  };
  for (const id of ['diagnose', 'tree', 'data']) {
    const btn = document.querySelector('#nav-' + id);
    if (btn) btn.addEventListener('click', () => show(id));
  }

  renderAll();
  show('diagnose');

  // 버리기 체크박스
  diagnoseScreen.querySelector('#category-list').addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb.classList.contains('discard-toggle')) return;
    try {
      state.discard[cb.dataset.category] = cb.checked;
      isSample = false;
      renderAll();
    } catch (err) {
      showError('버릴 항목을 고르는 데 실패했어요. ' + err.message);
      cb.checked = !state.discard[cb.dataset.category];
    }
  });

  // 파일 고르기(폴더·개별): 상태 교체, discard 전부 true.
  const onPicked = async (input) => {
    if (!input.files || input.files.length === 0) return;
    try {
      const picked = await readPickedFiles(input.files);
      if (picked.entries.length === 0) {
        showError('사진 파일이 하나도 없어요. HEIC·JPG 같은 사진 파일을 골라 주세요.');
        return;
      }
      state = {
        entries: picked.entries,
        csvText: picked.csvText,
        discard: { liveVideo: true, copy: true, editedOriginal: true },
      };
      isSample = false;
      renderAll();
      input.value = '';
    } catch (err) {
      showError('파일을 읽지 못했어요. 다시 골라 주세요. (' + err.message + ')');
    }
  };
  diagnoseScreen.querySelector('#folder-input').addEventListener('change', (e) => onPicked(e.target));
  diagnoseScreen.querySelector('#files-input').addEventListener('change', (e) => onPicked(e.target));

  // 예시로 해 보기
  diagnoseScreen.querySelector('#sample-button').addEventListener('click', () => {
    try {
      state = getSample();
      isSample = true;
      renderAll();
    } catch (err) {
      showError('예시 묶음을 불러오지 못했어요. (' + err.message + ')');
    }
  });

  // 데이터 관리: 내보내기 · 가져오기 · 초기화
  dataScreen.querySelector('#export-button').addEventListener('click', () => {
    try {
      exportState(state);
      status.textContent = '';
    } catch (err) {
      showError('내보내기를 실패했어요. 다시 시도해 주세요. (' + err.message + ')');
    }
  });
  dataScreen.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const imported = await readImportFile(file);
      if (!imported) {
        showError('가져오기를 실패했어요. heicpack-state.json 형식(사진 목록·날짜 정보·버릴 항목)이어야 해요.');
        return;
      }
      state = imported;
      isSample = false;
      renderAll();
    } catch (err) {
      showError('가져오기를 실패했어요. (' + err.message + ')');
    }
  });
  dataScreen.querySelector('#reset-button').addEventListener('click', () => {
    const ok = window.confirm(
      '지금 고른 항목과 사진 목록이 모두 지워지고 예시로 돌아갑니다. 이 동작은 되돌릴 수 없어요. 지울까요?'
    );
    if (!ok) return;
    try {
      clearState();
      state = getSample();
      isSample = true;
      renderAll();
      show('diagnose');
    } catch (err) {
      showError('처음으로 되돌리기를 실패했어요. (' + err.message + ')');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().catch((err) => {
    const s = document.querySelector('#app-status');
    if (s) s.textContent = '앱을 열지 못했어요. 새로고침해 주세요. (' + err.message + ')';
  }));
} else {
  init().catch((err) => {
    const s = document.querySelector('#app-status');
    if (s) s.textContent = '앱을 열지 못했어요. 새로고침해 주세요. (' + err.message + ')';
  });
}
