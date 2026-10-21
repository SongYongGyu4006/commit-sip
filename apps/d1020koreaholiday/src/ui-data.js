// 데이터 관리 화면: 기준 시각·이용 조건 표시, 내보내기, 가져오기, 초기화.
import { validateImport } from './storage.js';

const pad2 = (n) => String(n).padStart(2, '0');

// ISO 문자열(예: 2026-10-20T18:21:15) → 'YYYY-MM-DD HH:MM'.
function formatFetchedAt(iso) {
  if (!iso || typeof iso !== 'string') return '미상';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return (
    t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) +
    ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes())
  );
}

export function renderDataInfo(holidaysMeta, weatherMeta) {
  const time = document.getElementById('data-time');
  time.textContent =
    '공휴일 데이터: ' + formatFetchedAt(holidaysMeta && holidaysMeta.fetched_at) +
    ', 날씨 데이터: ' + formatFetchedAt(weatherMeta && weatherMeta.fetched_at);
  const terms = document.getElementById('data-terms');
  terms.textContent =
    (holidaysMeta && holidaysMeta.terms ? holidaysMeta.terms : '') + ' · ' +
    (weatherMeta && weatherMeta.terms ? weatherMeta.terms : '');
}

export function initDataScreen({ state, holidaysMeta, weatherMeta, onImported, onReset, onStatus }) {
  renderDataInfo(holidaysMeta, weatherMeta);

  // 내보내기: koreaholidayplan.json 으로 상태(연차, 기준 날짜, 저장 목록)를 다운로드.
  const exportButton = document.getElementById('export-button');
  exportButton.addEventListener('click', () => {
    const payload = JSON.stringify({
      leaveDays: state.leaveDays,
      todayOverride: state.todayOverride,
      saved: state.saved.map((s) => ({ start: s.start, end: s.end })),
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'koreaholidayplan.json';
    a.click();
    URL.revokeObjectURL(url);
    onStatus('상태를 koreaholidayplan.json 으로 내보냈습니다.', false);
  });

  // 가져오기: .json 파일을 읽어 상태를 교체한다.
  const importFile = document.getElementById('import-file');
  importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        onStatus('가져오기 실패: JSON 파일을 해석할 수 없습니다. 올바른 파일로 다시 시도해 주세요.', true);
        return;
      }
      const next = validateImport(parsed);
      if (!next) {
        onStatus('가져오기 실패: 파일 내용이 올바르지 않습니다. 연차(0~7), 날짜, 저장 목록 형식을 확인해 주세요.', true);
        return;
      }
      onImported(next);
    };
    reader.readAsText(file);
    importFile.value = ''; // 같은 파일도 다시 선택할 수 있게
  });

  // 초기화: 슬라이더 5, 날짜 오늘, 저장 목록 비우고 상태를 지운다.
  const resetButton = document.getElementById('reset-button');
  resetButton.addEventListener('click', () => onReset());
}
