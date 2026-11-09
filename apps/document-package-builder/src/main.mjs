// 진입 모듈: 저장 상태를 복원하고, 상단 nav 버튼으로 화면을 전환하며,
// "예시로 해 보기"와 초기 화면(서류 담기)을 설정한다.

import { loadState, saveState, clearState, exportBackup, importBackup } from './storage.mjs';
import { renderAddScreen, renderReviewScreen, renderExportScreen, setStatus } from './screens.mjs';
import { readPdfPages, pdfToCanvas } from './pdf.mjs';
import { loadImageFile, scaleCanvas } from './image.mjs';
import { planRedactions } from './app.js';
import { parseRanges } from './ranges.mjs';

// 예시 PDF는 코드 안에(네트워크 없이) — A4 한 장, 주민등록번호가 들어 있는 텍스트.
function makeExamplePdfBytes() {
  const w = 595.28;
  const h = 841.89;
  const lines = [
    ['가족관계증명서', 32, 780],
    ['주민등록번호 123456-1234567', 18, 740],
    ['발행일 2024-05-01', 14, 712],
    ['제출 서류 예시', 12, 680],
  ];
  const content = lines
    .map(([t, size, y]) => `BT /F1 ${size} Tf 60 ${y} Td (${t}) Tj ET`)
    .join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (const o of offsets) pdf += String(o).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function makeExamplePage() {
  return {
    page: 1,
    w: 595.28,
    h: 841.89,
    srcDoc: null,
    srcFile: null,
    srcCanvas: null,
    srcName: '예시 서류.pdf',
    boxes: [],
    items: [
      { str: '가족관계증명서', x: 60, y: 780, width: 220, height: 32 },
      { str: '주민등록번호 123456-1234567', x: 60, y: 740, width: 260, height: 18 },
      { str: '발행일 2024-05-01', x: 60, y: 712, width: 150, height: 14 },
      { str: '제출 서류 예시', x: 60, y: 680, width: 120, height: 12 },
    ],
  };
}

// ---------- 외부 전송 카운트(PerformanceObserver) ----------
function startPrivacyCounter(state, ui) {
  const badge = () => document.getElementById('privacy-badge');
  const own = new Set();
  const url = location.href;
  // 페이지 자체 리소스(스크립트·스타일)는 외부 전송이 아니다
  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    for (const e of performance.getEntriesByType('resource')) own.add(e.name);
  }
  own.add(url);
  const update = () => {
    let ext = 0;
    try {
      const entries = performance.getEntriesByType('resource');
      for (const e of entries) {
        if (!own.has(e.name)) ext++;
      }
    } catch {
      /* 무시 */
    }
    state.extCount = ext;
    const b = badge();
    if (b) b.textContent = '파일은 기기 밖으로 나가지 않습니다 · 외부 전송 ' + ext + '건';
  };
  update();
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!own.has(e.name) && !own.has(e.name)) own.add(e.name);
        update();
      }).observe({ type: 'resource', buffered: true });
    } catch {
      /* 일부 브라우저에서는 실패 */
    }
  }
  // 2초마다 갱신(새 리소스가 생길 수 있음)
  const t = setInterval(update, 2000);
  if (typeof ui === 'object' && ui) ui.privacyTimer = t;
}

// ---------- ui 컨텍스트 ----------
function makeUi(state) {
  return {
    state,
    pages: [],
    resultBytes: null,
    resultOver: false,
    privacyTimer: null,
    showScreen: null,
    loadExample: null,
    ingestFiles: null,
    applyRange: null,
    persistBoxes: () => saveState(state),
    doBackup: null,
    doReset: null,
    doImport: null,
  };
}

export function showScreen(name) {
  for (const id of ['add', 'review', 'export']) {
    const el = document.getElementById('screen-' + id);
    if (el) el.hidden = id !== name;
  }
  for (const btn of document.querySelectorAll('[data-nav]')) {
    btn.setAttribute('aria-current', btn.dataset.nav === name ? 'page' : 'false');
  }
}

export async function init() {
  const state = loadState();
  const ui = makeUi(state);

  // PDF 쪽의 박스를 주민번호 패턴으로 자동 계산한다(옵션 mask)
  const planAutoBoxes = () => {
    if (!ui.pages.some((p) => p.srcDoc && p.items.length)) return;
    try {
      const r = planRedactions(ui.pages);
      for (const pg of r.pages) {
        const target = ui.pages.find((p) => p.page === pg.page && p.srcDoc);
        if (!target) continue;
        if (!Array.isArray(target.boxes)) target.boxes = [];
        const existing = new Set(target.boxes.map((b) => b.x + ',' + b.y));
        for (const b of pg.boxes) {
          if (!existing.has(b.x + ',' + b.y)) target.boxes.push({ ...b, confirmed: true });
        }
      }
    } catch (e) {
      // 계산 실패는 조용히 넘긴다. 상태 문구까지 바꾸면 "예시를 불러왔어요" 안내를
      // 덮어써 오류 메시지가 화면에 남는 일(검수에서 확인됨)을 막기 위함.
    }
  };

  ui.showScreen = (name) => {
    showScreen(name);
    if (name === 'add') renderAddScreen(state, ui);
    else if (name === 'review') {
      // 추출 쪽수(옵션)를 적용하고, PDF 쪽의 박스를 자동 계산한다
      if (ui.applyRange) ui.applyRange();
      if (state.options.mask) planAutoBoxes();
      saveState(state);
      // 페이지가 없으면(파일/예시 없음) 빈 미리보기만
      if (!ui.pages.length) {
        ui.pages = state.sample ? [makeExamplePage()] : [];
      }
      renderReviewScreen(state, ui).catch((e) => setStatus(state, e.message || '가림 확인을 열지 못했어요.'));
    } else if (name === 'export') {
      renderExportScreen(state, ui);
    }
  };

  ui.loadExample = () => {
    // 내장 예시를 불러온다(예시 데이터는 코드에)
    const bytes = makeExamplePdfBytes();
    state.sample = { name: '예시 서류.pdf', bytes };
    state.fileNames = ['예시 서류.pdf'];
    ui.pages = [makeExamplePage()];
    if (state.options.mask) planAutoBoxes();
    saveState(state);
    setStatus(state, '예시를 불러왔어요. 박스를 확인한 뒤 "내보내기"로 가세요.', 'ds-status-good');
  };

  // 파일(File[]) → 쪽(페이지) 목록. PDF는 pdf.js로, 사진은 canvas로.
  ui.ingestFiles = async (files) => {
    let ok = 0;
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (/\.pdf$/.test(lower)) {
        const buf = await f.arrayBuffer();
        try {
          const doc = await readPdfPages(buf, { maxBytes: 20 * 1024 * 1024 });
          for (const pg of doc.pages) {
            ui.pages.push({
              page: pg.page,
              w: pg.w,
              h: pg.h,
              srcDoc: doc.doc,
              srcFile: null,
              srcCanvas: null,
              srcName: f.name,
              items: pg.items,
              boxes: [],
            });
          }
          ok++;
          if (state.options.mask) planAutoBoxes();
        } catch (e) {
          setStatus(state, '"' + f.name + '"은(는) PDF로 읽지 못했어요. (' + (e.message || e) + ')', 'ds-status-bad');
        }
      } else if (/\.(jpe?g|png)$/.test(lower)) {
        try {
          const { canvas, srcW, srcH } = await loadImageFile(f);
          const scale = srcW > 2000 ? 2000 / srcW : 1;
          const c = scale < 1 ? scaleCanvas(canvas, scale) : canvas;
          ui.pages.push({
            page: ui.pages.length + 1,
            w: c.width,
            h: c.height,
            srcDoc: null,
            srcFile: null,
            srcCanvas: c,
            srcName: f.name,
            items: [],
            boxes: [],
          });
          ok++;
        } catch (e) {
          setStatus(state, '"' + f.name + '"은(는) 불러오지 못했어요. (' + (e.message || e) + ')', 'ds-status-bad');
        }
      }
    }
    if (ok) saveState(state);
  };

  // 추출 쪽수(옵션 range)를 적용한다
  ui.applyRange = () => {
    const ranges = parseRanges(state.options.range);
    if (!state.options.range || !ranges.length) return;
    const keep = (p) => ranges.includes(p.page);
    for (const p of ui.pages) {
      if (!keep(p)) {
        ui.pages.splice(ui.pages.indexOf(p), 1);
      }
    }
  };

  ui.doBackup = () => {
    const text = exportBackup(state);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(state, 'backup.json을 내려받았어요. 다음에 다시 가져올 수 있어요.', 'ds-status-good');
  };

  ui.doImport = (text) => {
    const imported = importBackup(text);
    if (!imported) {
      setStatus(state, 'backup.json 형식이 다르고 복원할 수 없어요. 다시 내려받은 뒤 불러와 주세요.', 'ds-status-bad');
      return;
    }
    Object.assign(state, imported);
    ui.pages = [];
    ui.resultBytes = null;
    saveState(state);
    renderAddScreen(state, ui);
    setStatus(state, '백업에서 복원했어요. 서류 ' + state.fileNames.length + '개가 다시 담겼습니다.', 'ds-status-good');
  };

  ui.doReset = () => {
    clearState();
    state.options = { merge: true, mask: true, shrink: true, targetMb: 10, targetCustom: '', range: '' };
    state.fileNames = [];
    state.sample = null;
    ui.pages = [];
    ui.resultBytes = null;
    ui.resultOver = false;
    saveState(state);
    ui.showScreen('add');
    setStatus(state, '처음으로 초기화했어요. 모든 서류와 설정이 지워졌습니다.', 'ds-status-good');
  };

  // nav 버튼
  for (const btn of document.querySelectorAll('[data-nav]')) {
    btn.addEventListener('click', () => ui.showScreen(btn.dataset.nav));
  }

  startPrivacyCounter(state, ui);
  ui.showScreen('add');

  // 초기 상태 문구
  setStatus(state, '서류를 끌어 놓거나 "예시로 해 보기"를 눌러 시작하세요. 모든 처리는 이 기기 안에서 이뤄져요.');
}

function boot() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => runInit());
  } else {
    runInit();
  }
}
function runInit() {
  try {
    init();
  } catch (e) {
    const s = document.getElementById('app-status');
    if (s) {
      s.className = 'ds-status ds-status-bad';
      s.textContent = '앱을 열지 못했어요: ' + (e && e.message ? e.message : e);
    }
    if (typeof console !== 'undefined') console.error('init failed', e);
  }
}
boot();
