// 세 화면의 DOM 구성, 이벤트 연결, 박스 확인·삭제·직접 그리기,
// 상태 표시줄 갱신을 textContent(HTML 주입 없음)으로 처리한다.

import { planRedactions } from './app.js';
import { parseRanges, orderByTemplate, parseTargetMb } from './ranges.mjs';
import { saveState } from './storage.mjs';
import { readPdfPages, renderPageToCanvas, pdfToCanvas, buildPdf } from './pdf.mjs';
import { loadImageFile, applyBoxes, canvasToJpeg } from './image.mjs';
import { shrinkToTarget } from './compress.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const MB = 1024 * 1024;

function text(el, str) {
  el.textContent = str;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

function fileKey(name, size) {
  return name + '|' + size;
}

function fmtMb(bytes) {
  return (bytes / MB).toFixed(2);
}

// ---------- 상태 표시줄 ----------
export function setStatus(state, msg, cls = '') {
  const status = $('#app-status');
  if (!status) return;
  status.className = 'ds-status' + (cls ? ' ' + cls : '');
  text(status, msg || '');
}

// ---------- 공통: 박스 그리기 ----------
function drawPage(page, canvas) {
  const boxes = Array.isArray(page.boxes) ? page.boxes : [];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (page.srcCanvas) {
    ctx.drawImage(page.srcCanvas, 0, 0, canvas.width, canvas.height);
  } else if (page.srcDoc && typeof globalThis.pdfjsLib !== 'undefined') {
    // pdf.js 문서가 이미 로딩되어 있으면 비동기 렌더
  } else {
    ctx.fillStyle = '#eef0f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5f6777';
    ctx.font = '13px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.fillText('미리보기 없음', 8, 18);
  }
  for (const b of boxes) {
    const x = b.dx != null ? b.dx : (b.x / page.w) * canvas.width;
    const y = b.dy != null ? b.dy : (b.y / page.h) * canvas.height;
    const w = b.dw != null ? b.dw : (b.width / page.w) * canvas.width;
    const h = b.dh != null ? b.dh : (b.height / page.h) * canvas.height;
    if (w <= 0 || h <= 0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(x, y, w, h);
    if (b.preview) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(b.preview, Math.min(x + 3, canvas.width - 40), Math.min(y + h - 3, canvas.height - 3));
    }
  }
}

function makeBox(checked, preview, x, y, w, h) {
  return { confirmed: !!checked, preview: preview || null, x: x || 0, y: y || 0, width: w || 0, height: h || 0 };
}

// ---------- 화면 1: 서류 담기 ----------
export function renderAddScreen(state, ui) {
  const screen = $('#screen-add');
  if (!screen) return;

  const fileInput = $('#file-input');
  const dropzone = $('#dropzone');
  const count = $('#add-count');
  const list = $('#file-list');
  const orderSel = $('#order-template');
  const targetSel = $('#target-mb');
  const targetCustom = $('#target-custom');
  const rangeInput = $('#range-input');

  // 옵션 반영
  $('#opt-merge').checked = state.options.merge;
  $('#opt-mask').checked = state.options.mask;
  $('#opt-shrink').checked = state.options.shrink;
  targetSel.value = String(state.options.targetMb);
  targetCustom.value = state.options.targetCustom || '';
  rangeInput.value = state.options.range || '';

  // 파일 목록
  const renderList = () => {
    if (count) count.textContent = state.fileNames.length + '개';
    list.innerHTML = '';
    if (!state.fileNames.length) {
      list.appendChild(
        el('li', { class: 'ds-empty' }, [
          el('span', { text: '아직 서류가 없어요. PDF·사진을 끌어 놓거나 "파일 고르기"를 누르세요. "예시로 해 보기"로 바로 체험할 수 있어요.' }),
        ])
      );
      return;
    }
    state.fileNames.forEach((name, i) => {
      const li = el('li', { class: 'ds-list-item', draggable: 'true', dataset: { name } }, [
        el('span', { class: 'ds-avatar', 'data-hue': String([...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8), 'aria-hidden': 'true', text: [...name][0] || '?' }),
        el('div', { class: 'ds-list-main' }, [el('span', { class: 'ds-list-title', text: name })]),
        el('div', { class: 'ds-row file-btns' }, [
          el('button', { class: 'ds-btn up-button', type: 'button', disabled: i === 0, text: '위로' }),
          el('button', { class: 'ds-btn down-button', type: 'button', disabled: i === state.fileNames.length - 1, text: '아래로' }),
          el('button', { class: 'ds-btn remove-button', type: 'button', text: '제거' }),
        ]),
      ]);
      li.querySelector('.up-button').addEventListener('click', () => {
        if (i === 0) return;
        [state.fileNames[i - 1], state.fileNames[i]] = [state.fileNames[i], state.fileNames[i - 1]];
        saveState(state);
        renderList();
      });
      li.querySelector('.down-button').addEventListener('click', () => {
        if (i === state.fileNames.length - 1) return;
        [state.fileNames[i + 1], state.fileNames[i]] = [state.fileNames[i], state.fileNames[i + 1]];
        saveState(state);
        renderList();
      });
      li.querySelector('.remove-button').addEventListener('click', () => {
        state.fileNames.splice(i, 1);
        saveState(state);
        renderList();
      });
      // 드래그로 순서 변경
      li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isInteger(from) || from === i) return;
        const [moved] = state.fileNames.splice(from, 1);
        state.fileNames.splice(i, 0, moved);
        saveState(state);
        renderList();
      });
      list.appendChild(li);
    });
  };
  renderList();

  // 파일 추가
  const addFiles = async (files) => {
    let added = false;
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (!/\.(pdf|jpe?g|png)$/.test(lower)) {
        setStatus(state, '"' + f.name + '"은(는) 지원하지 않는 형식이에요. PDF·JPG·PNG 파일만 올릴 수 있어요.');
        continue;
      }
      if (!state.fileNames.includes(f.name)) state.fileNames.push(f.name);
      added = true;
    }
    if (!added) return;
    saveState(state);
    renderList();
    // 실제 파일 내용을 읽어서 쪽(페이지) 목록을 만든다
    if (typeof ui.ingestFiles === 'function') {
      await ui.ingestFiles(files);
    }
    renderList();
    if (state.fileNames.length) {
      setStatus(state, '서류 ' + state.fileNames.length + '개를 담았습니다. 순서와 옵션을 정한 뒤 "가림 확인"으로 가세요.', 'ds-status-good');
    }
  };
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    addFiles(files).catch((e) => setStatus(state, '서류를 읽지 못했어요. (' + (e.message || e) + ')', 'ds-status-bad'));
  });
  const chooseButton = $('#choose-button');
  if (chooseButton) chooseButton.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  for (const ev of ['dragover', 'drop']) {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'drop' && e.dataTransfer.files.length) {
        addFiles([...e.dataTransfer.files]).catch((er) => setStatus(state, '서류를 읽지 못했어요. (' + (er.message || er) + ')', 'ds-status-bad'));
      }
    });
  }
  dropzone.addEventListener('dragenter', () => dropzone.classList.add('drag-over'));
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', () => dropzone.classList.remove('drag-over'));

  // 옵션·입력 바인딩
  const persist = () => saveState(state);
  $('#opt-merge').addEventListener('change', (e) => { state.options.merge = e.target.checked; persist(); });
  $('#opt-mask').addEventListener('change', (e) => { state.options.mask = e.target.checked; persist(); });
  $('#opt-shrink').addEventListener('change', (e) => { state.options.shrink = e.target.checked; persist(); });
  targetSel.addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'custom') {
      targetCustom.disabled = false;
      targetCustom.focus();
      targetCustom.placeholder = '예: 12.5';
      persist();
    } else {
      state.options.targetMb = Number(v);
      state.options.targetCustom = '';
      targetCustom.value = '';
      targetCustom.disabled = true;
      persist();
    }
  });
  // 기존 상태가 custom이면 입력을 열어둔다
  targetCustom.disabled = state.options.targetMb !== Number(targetSel.value) || targetSel.value === 'custom';
  targetCustom.addEventListener('input', (e) => {
    state.options.targetCustom = e.target.value;
    persist();
  });
  rangeInput.addEventListener('input', (e) => { state.options.range = e.target.value; persist(); });
  orderSel.addEventListener('change', (e) => {
    state.fileNames = orderByTemplate(e.target.value, state.fileNames);
    persist();
    renderList();
    setStatus(state, '"' + e.target.value + '" 순서로 서류를 정렬했어요.', 'ds-status-good');
  });

  // 예시로 해 보기
  $('#example-button').addEventListener('click', () => {
    ui.loadExample();
    renderList();
    ui.showScreen('review');
  });
  $('#review-button').addEventListener('click', () => {
    if (!state.fileNames.length && !state.sample) {
      setStatus(state, '서류가 없어요. 파일을 올리거나 "예시로 해 보기"를 눌러 주세요.');
      return;
    }
    ui.showScreen('review');
  });
}

// ---------- 화면 2: 가림 확인 ----------
export async function renderReviewScreen(state, ui) {
  const screen = $('#screen-review');
  if (!screen) return;
  screen.innerHTML = '';
  const list = el('div', { id: 'review-list', class: 'review-list' });
  const exportBtn = el('button', { id: 'export-button', class: 'ds-btn ds-btn-primary', type: 'button', disabled: true, text: '내보내기로' });
  screen.appendChild(list);
  screen.appendChild(el('div', { class: 'ds-row form-row' }, [exportBtn]));

  const allBoxes = () => {
    const out = [];
    for (const p of ui.pages) for (const b of Array.isArray(p.boxes) ? p.boxes : []) out.push(b);
    return out;
  };
  const updateExport = () => {
    const boxes = allBoxes();
    exportBtn.disabled = !(boxes.length && boxes.every((b) => b.confirmed));
  };

  const renderOne = async (page) => {
    const card = el('div', { class: 'ds-card review-card', 'data-page': String(page.page) }, [
      el('div', { class: 'ds-section-title' }, [
        el('h2', { text: '쪽 ' + page.page }),
        el('span', { class: 'ds-badge', text: page.srcDoc ? 'PDF' : '이미지' }),
      ]),
    ]);
    const canvas = el('canvas', { class: 'review-canvas', width: 320, height: 200 });
    card.appendChild(canvas);
    const boxRow = el('div', { class: 'ds-row box-row' });
    card.appendChild(boxRow);

    if (page.srcDoc) {
      // PDF: pdf.js 문서에서 직접 캔버스로(원문 텍스트를 픽셀로 바꿔 가림 적용)
      drawPage(page, canvas);
      try {
        page.srcCanvas = await pdfToCanvas(page.srcDoc, page.page, 1);
      } catch (e) {
        setStatus(state, (e.message || 'PDF를 렌더하지 못했어요.'));
      }
      drawPage(page, canvas);
    } else if (page.srcCanvas) {
      drawPage(page, canvas);
    }

    for (const b of Array.isArray(page.boxes) ? page.boxes : []) {
      const cbId = 'box-cb-' + page.page + '-' + page.boxes.indexOf(b);
      const box = el('div', { class: 'ds-row box-item' }, [
        el('label', { class: 'box-label', for: cbId }, [
          el('input', { class: 'input box-confirm', type: 'checkbox', checked: b.confirmed, id: cbId }),
          el('span', { text: b.preview ? '확인 · ' + b.preview : '박스 확인' }),
        ]),
        el('button', { class: 'ds-btn box-delete', type: 'button', text: '삭제' }),
      ]);
      box.querySelector('.box-confirm').addEventListener('change', (e) => {
        b.confirmed = e.target.checked;
        saveState(state);
        ui.persistBoxes();
        updateExport();
      });
      box.querySelector('.box-delete').addEventListener('click', () => {
        if (!Array.isArray(page.boxes)) page.boxes = [];
        page.boxes.splice(page.boxes.indexOf(b), 1);
        saveState(state);
        ui.persistBoxes();
        renderOne(page);
        updateExport();
      });
      boxRow.appendChild(box);
    }
    if (!(Array.isArray(page.boxes) && page.boxes.length)) {
      boxRow.appendChild(el('span', { class: 'ds-hint', text: '가릴 박스가 없어요. 사진은 위에서 직접 그릴 수 있습니다.' }));
    }

    // 사진·스캔본: 캔버스에서 직접 그리기
    if (!page.srcDoc && page.srcCanvas) {
      let drawing = null;
      canvas.addEventListener('pointerdown', (e) => {
        const r = canvas.getBoundingClientRect();
        drawing = { sx: e.clientX - r.left, sy: e.clientY - r.top, cx: e.clientX - r.left, cy: e.clientY - r.top, moved: false };
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const r = canvas.getBoundingClientRect();
        drawing.cx = e.clientX - r.left;
        drawing.cy = e.clientY - r.top;
        if (Math.abs(drawing.cx - drawing.sx) > 3 || Math.abs(drawing.cy - drawing.sy) > 3) drawing.moved = true;
        drawPage(page, canvas);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#c4352b';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.min(drawing.sx, drawing.cx), Math.min(drawing.sy, drawing.cy), Math.abs(drawing.cx - drawing.sx), Math.abs(drawing.cy - drawing.sy));
      });
      canvas.addEventListener('pointerup', (e) => {
        if (drawing && drawing.moved) {
          const x0 = Math.min(drawing.sx, drawing.cx);
          const y0 = Math.min(drawing.sy, drawing.cy);
          const w0 = Math.abs(drawing.cx - drawing.sx);
          const h0 = Math.abs(drawing.cy - drawing.sy);
          page.boxes.push(
            makeBox(true, null, x0 * (page.w / canvas.width), y0 * (page.h / canvas.height), w0 * (page.w / canvas.width), h0 * (page.h / canvas.height))
          );
          saveState(state);
          ui.persistBoxes();
          drawPage(page, canvas);
          renderOne(page);
          updateExport();
        }
        drawing = null;
      });
    }
    list.appendChild(card);
  };

  for (const page of ui.pages) await renderOne(page);
  if (!ui.pages.length) {
    list.appendChild(el('div', { class: 'ds-empty' }, [el('span', { text: '가릴 쪽이 없어요. 서류를 담은 뒤 이 화면을 다시 들어오면 미리보기가 여기에 뜹니다.' })]));
  }
  exportBtn.addEventListener('click', () => ui.showScreen('export'));
  updateExport();
}

// ---------- 화면 3: 내보내기 ----------
export function renderExportScreen(state, ui) {
  const screen = $('#screen-export');
  if (!screen) return;
  const result = $('#result-size');
  const checklist = $('#checklist');
  const downloadBtn = $('#download-button');

  // 확인된 박스로 매스킹한 쪽들을 만든다
  const maskedPages = [];
  const target = parseTargetMb(state.options.targetMb, state.options.targetCustom) || 10 * MB;
  for (const page of ui.pages) {
    const confirmed = (Array.isArray(page.boxes) ? page.boxes : []).filter((b) => b.confirmed);
    if (!confirmed.length) continue;
    if (page.srcCanvas) {
      const canvas = applyBoxes(page.srcCanvas, confirmed);
      maskedPages.push({ canvas, title: page.srcName || '쪽 ' + page.page, page: page.page });
    }
    // PDF 쪽은 renderPageToCanvas에서 매스킹 처리(아래 exportRun)
  }

  const renderChecklist = (over) => {
    checklist.innerHTML = '';
    const items = [
      ['박스 모두 확인', state.options.mask ? '주민번호 뒷자리를 검게 가렸어요.' : '가림 옵션이 꺼져 있어요. 필요하면 서류 담기에서 켜세요.'],
      ['용량 확인', over ? '목표 ' + (target / MB).toFixed(0) + 'MB를 넘었어요. 품질을 더 낮춰 보세요.' : '목표 ' + (target / MB).toFixed(0) + 'MB 이내에 들어가요.'],
      ['파일 다운로드', 'package.pdf로 제출용 파일을 만들었어요.'],
    ];
    for (const [t, d] of items) {
      checklist.appendChild(
        el('li', { class: 'ds-list-item' }, [
          el('span', { class: 'ds-avatar', 'data-hue': over ? '6' : '1', 'aria-hidden': 'true', text: over ? '!' : '○' }),
          el('div', { class: 'ds-list-main' }, [el('span', { class: 'ds-list-title', text: t }), el('span', { class: 'ds-list-sub', text: d })]),
        ])
      );
    }
  };

  const exportRun = async () => {
    setStatus(state, 'PDF를 만들고 있어요. 잠시만 기다려 주세요…');
    try {
      const pages = [];
      for (const page of ui.pages) {
        const confirmed = (Array.isArray(page.boxes) ? page.boxes : []).filter((b) => b.confirmed);
        if (!confirmed.length) continue;
        if (page.srcCanvas) {
          pages.push({ canvas: applyBoxes(page.srcCanvas, confirmed), title: page.srcName || '쪽 ' + page.page });
        } else if (page.srcDoc && page.srcFile) {
          // PDF 쪽: 원본 렌더 + 박스 덮기
          const canvas = await renderPageToCanvas(page.srcFile, page.page, 1);
          const s = canvas.width / page.w;
          const masked = applyBoxes(canvas, confirmed.map((b) => ({ x: b.x * s, y: b.y * s, width: b.width * s, height: b.height * s })), 1);
          pages.push({ canvas: masked, title: page.srcName || '쪽 ' + page.page });
        }
      }
      if (!pages.length) {
        setStatus(state, '가릴 쪽이 없어요. 가림 확인에서 박스를 확인해 주세요.', 'ds-status-bad');
        text(result, '0.00 MB');
        checklist.innerHTML = '';
        renderChecklist(false);
        downloadBtn.disabled = true;
        ui.resultBytes = null;
        return;
      }
      const useShrink = state.options.shrink;
      const out = useShrink ? await shrinkToTarget(pages, target) : await shrinkToTarget(pages, Number.MAX_SAFE_INTEGER);
      ui.resultBytes = out.bytes;
      ui.resultOver = out.over;
      text(result, fmtMb(out.size) + ' MB');
      renderChecklist(out.over);
      downloadBtn.disabled = false;
      if (out.over) {
        setStatus(state, '목표 ' + (target / MB).toFixed(0) + 'MB를 넘었어요(' + fmtMb(out.size) + 'MB). 그래도 내릴 수 있지만, 용량이 맞지 않을 수 있어요.');
      } else {
        setStatus(state, '목표 ' + (target / MB).toFixed(0) + 'MB 이하로 만들었어요. "package.pdf 내려받기"를 눌러 주세요.', 'ds-status-good');
      }
    } catch (e) {
      setStatus(state, 'PDF를 만들지 못했어요. (' + (e.message || e) + ') 서류 형식을 다시 확인해 주세요.', 'ds-status-bad');
      text(result, '—');
      checklist.innerHTML = '';
      renderChecklist(false);
      ui.resultBytes = null;
      downloadBtn.disabled = true;
    }
  };

  if (!ui.pages.some((p) => Array.isArray(p.boxes) && p.boxes.length)) {
    text(result, '—');
    renderChecklist(false);
    downloadBtn.disabled = true;
    setStatus(state, '아직 가릴 박스가 없어요. 가림 확인에서 박스를 확인한 뒤 다시 와 보세요.');
  } else {
    text(result, '계산 중…');
    renderChecklist(false);
    downloadBtn.disabled = true;
    exportRun();
  }

  downloadBtn.addEventListener('click', () => {
    if (!ui.resultBytes) return;
    const blob = new Blob([ui.resultBytes.buffer], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'package.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(state, 'package.pdf를 내려받았어요.', 'ds-status-good');
  });

  // backup·reset·import는 main.js의 ui 콜백으로 위임한다
  $('#backup-export').addEventListener('click', () => ui.doBackup());
  $('#reset-button').addEventListener('click', () => ui.doReset());
  $('#backup-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((t) => ui.doImport(t));
    e.target.value = '';
  });
}
