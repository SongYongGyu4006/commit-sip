// 첫 화면(사진 검사·변환) 렌더링·제어: 프리셋 칩, 직접 입력, 사진 올리기,
// 4개 판정 배지, 미리보기·확대 비교, 예시 실행, 변환·내려받기.
import { evaluatePhotoSpec } from './app.js';
import { getPresets, getPresetById, buildCustomSpec, formatSpecSummary } from './presets.js';
import {
  loadState,
  saveState,
  saveSelectedPreset,
  appendHistoryRecord,
  replaceHistory,
  clearHistory,
} from './storage.js';
import {
  inspectImageFile,
  synthesizeSamplePhoto,
  applyTransformToCanvas,
  cropResizeCanvas,
  compressAndConvertJpeg,
} from './image-processor.js';

const $ = (sel) => document.querySelector(sel);
const fmtKiB = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB');
const fmtBytes = (b) => Math.round(b).toLocaleString('ko-KR');

// 화면 모듈 상태 (모듈 하나만 인스턴스화)
let state;
let currentPreset; // 실제 사용 중인 규격 (custom 인 경우 직접 입력 값으로 조립)
let photoCanvas = null; // 현재 사진(파일 또는 예시) 원본 캔버스
let photoMeta = null; // evaluatePhotoSpec 입력용 메타
let lastResult = null;
let convertedUrl = null; // 내려받기용 object URL
let initialized = false;

const statusEl = () => $('#app-status');

function setStatus(msg, kind) {
  const el = statusEl();
  if (!msg) {
    el.textContent = '';
    el.className = 'ds-status';
    return;
  }
  el.textContent = msg;
  el.className = 'ds-status is-on ' + (kind === 'error' ? 'is-error' : 'is-ok');
}

function failStatus(msg) {
  setStatus(msg, 'error');
  const j = $('#result-json');
  if (j) j.textContent = '';
}

// main.js 의 최신 state 로 이 모듈의 state 를 덮어씀 (화면 전환·재복원)
export function syncStateFromMain(m) {
  if (!m || typeof m !== 'object') return;
  state = m;
}

function activeSpec() {
  return currentPreset && currentPreset.id === 'custom' ? buildCustomSpec(state.custom) : currentPreset;
}

function save() {
  state.lastResult = lastResult ? { ...lastResult } : null;
  saveState(state);
}

// ---- 미리보기 ----
function drawCanvas(target, source, fit) {
  const ctx = target.getContext('2d');
  target.width = source.width;
  target.height = source.height;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
}

function applyZoom() {
  const z = Math.round(parseFloat($('#zoom-compare').value) || 100);
  $('#zoom-label').textContent = z + '%';
  const stage = $('#crop-stage');
  stage.style.setProperty('--zoom', z / 100);
  const conv = $('#convert-canvas');
  const face = $('#face-guide');
  if (conv) {
    conv.style.transform = 'scale(' + z / 100 + ')';
  }
  if (face) face.style.transform = conv ? 'scale(' + z / 100 + ')' : '';
}

function renderPreview() {
  const orig = $('#preview-canvas');
  const conv = $('#convert-canvas');
  const face = $('#face-guide');
  if (photoCanvas && lastResult) {
    drawCanvas(orig, photoCanvas, 1);
    const oriented = applyTransformToCanvas(photoCanvas, lastResult);
    const fitted = cropResizeCanvas(oriented, lastResult.crop, lastResult.resize);
    drawCanvas(conv, fitted, 1);
    conv.style.transform = 'scale(1)';
    const z = Math.round(parseFloat($('#zoom-compare').value) || 100);
    conv.style.transform = 'scale(' + z / 100 + ')';
    if (face) {
      const isId = currentPreset && currentPreset.id !== 'custom';
      face.classList.toggle('is-on', !!isId);
    }
  } else {
    const ctx = orig.getContext('2d');
    ctx.clearRect(0, 0, orig.width, orig.height);
    const ctx2 = conv.getContext('2d');
    ctx2.clearRect(0, 0, conv.width, conv.height);
    if (face) face.classList.remove('is-on');
  }
}

// ---- 4개 배지 ----
function renderBadges(result) {
  const map = [
    ['#check-size', 'sizeOk'],
    ['#check-ratio', 'ratioOk'],
    ['#check-kb', 'kbOk'],
    ['#check-ext', 'extOk'],
  ];
  const pass = result ? map.filter(([, k]) => result.checks[k]).length : 0;
  for (const [sel, k] of map) {
    const el = $(sel);
    if (!el) continue;
    if (!result) {
      el.textContent = '—';
      el.className = 'ds-check is-neutral';
    } else if (result.checks[k]) {
      el.textContent = '통과';
      el.className = 'ds-check is-pass';
    } else {
      el.textContent = '부합 안 함';
      el.className = 'ds-check is-fail';
    }
  }
  const big = $('#pass-big');
  if (big) big.innerHTML = ''; // safe: replace with textContent below
  big.textContent = '';
  big.append(pass);
  const small = document.createElement('small');
  small.textContent = '/4';
  big.append(small);
  $('#pass-count').textContent = String(pass);

  const verdict = $('#verdict-text');
  if (!result) {
    verdict.textContent = '아래에서 사진을 올리거나 예시로 바로 확인해 보세요.';
  } else if (result.allPassed) {
    verdict.textContent = '이 사진은 ' + currentPreset.label + ' 규격에 모두 맞아요. 그대로 제출할 수 있습니다.';
  } else {
    verdict.textContent =
      '크기·비율·용량·확장자 중 ' + (4 - pass) + '개 미달이에요. ' +
      currentPreset.label + ' 규격으로 변환하면 맞춰집니다.';
  }
}

// ---- 결과 JSON ----
function renderResultJson(result) {
  $('#result-json').textContent = result ? JSON.stringify(result, null, 2) : '';
}

// ---- 규격 요약(띠) ----
function renderSummary() {
  const spec = activeSpec();
  const sum = formatSpecSummary(spec);
  $('#spec-summary').textContent = currentPreset.id + ': ' + sum;
  const link = $('#spec-source-link');
  const vd = $('#spec-verified-date');
  if (currentPreset.id === 'custom') {
    link.hidden = true;
    link.textContent = '';
    link.removeAttribute('href');
    vd.hidden = true;
    vd.textContent = '';
  } else {
    link.hidden = false;
    link.textContent = currentPreset.label + ' 공식 안내';
    link.setAttribute('href', currentPreset.sourceUrl);
    vd.hidden = false;
    vd.textContent = '확인일: ' + currentPreset.verifiedDate;
  }
}

// ---- 프리셋 칩 ----
function renderChips() {
  const wrap = $('#preset-chips');
  wrap.innerHTML = '';
  for (const p of getPresets()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ds-chip preset-chip';
    b.dataset.preset = p.id;
    b.setAttribute('aria-pressed', p.id === currentPreset.id ? 'true' : 'false');
    b.textContent = p.label;
    wrap.appendChild(b);
  }
}

function renderCustomPanel() {
  const on = currentPreset.id === 'custom';
  $('#custom-panel').hidden = !on;
  if (on) {
    $('#custom-width').value = String(state.custom.width);
    $('#custom-height').value = String(state.custom.height);
    $('#custom-ratio-w').value = String(state.custom.ratioW);
    $('#custom-ratio-h').value = String(state.custom.ratioH);
    $('#custom-max-bytes').value = String(state.custom.maxBytes);
    $('#custom-ext').value = state.custom.ext;
  }
}

export function renderWorkspaceView() {
  renderSummary();
  renderChips();
  renderCustomPanel();
  renderBadges(lastResult);
  renderResultJson(lastResult);
  renderPreview();
  applyZoom();
  renderHistoryList();
}

function renderHistoryList() {
  const list = $('#history-list');
  if (!list) return;
  list.innerHTML = '';
  const items = state.history || [];
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = '아직 변환 기록이 없어요.';
    list.appendChild(li);
    return;
  }
  for (const rec of items.slice(0, 50)) {
    const li = document.createElement('li');
    const when = rec.timestamp
      ? new Date(rec.timestamp)
      : null;
    const whenText = when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString('ko-KR') + ' ' + when.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '';
    li.textContent =
      (rec.presetLabel || rec.presetId || '') + ' · ' + (rec.fileName || '') +
      ' · ' + fmtBytes(rec.sizeBytes || 0) + (whenText ? ' · ' + whenText : '');
    list.appendChild(li);
  }
}

// ---- 외부에서 호출: 프리셋 선택 ----
export function selectPresetInWorkspace(id) {
  const preset = getPresetById(id);
  if (!preset) {
    currentPreset = getPresetById('toeic');
    id = 'toeic';
  }
  currentPreset = preset;
  state.presetId = preset.id;
  saveSelectedPreset(state, preset.id);
  if (photoMeta) {
    lastResult = evaluatePhotoSpec(photoMeta, currentPreset);
  } else {
    lastResult = null;
  }
  renderWorkspaceView();
}

// ---- 사진 로드(파일) ----
async function loadFile(file) {
  const input = $('#photo-file');
  input.value = '';
  const meta = await inspectImageFile(file);
  if (!meta) {
    photoCanvas = null;
    photoMeta = null;
    lastResult = null;
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      convertedUrl = null;
    }
    const dl = $('#download-link');
    dl.disabled = true;
    dl.removeAttribute('href');
    renderBadges(null);
    renderResultJson(null);
    renderPreview();
    failStatus('그 파일을 이미지로 읽을 수 없어요. JPG·PNG·WebP·HEIC 파일로 다시 올려 보세요.');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    failStatus('이미지 내용을 읽는 중 오류가 났어요. 파일을 다시 올려 보세요.');
    return;
  }
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  photoCanvas = c;
  photoMeta = meta;
  lastResult = evaluatePhotoSpec(meta, currentPreset);
  if (convertedUrl) {
    URL.revokeObjectURL(convertedUrl);
    convertedUrl = null;
  }
  const dl = $('#download-link');
  dl.disabled = true;
  dl.removeAttribute('href');
  renderBadges(lastResult);
  renderResultJson(lastResult);
  renderPreview();
  setStatus(
    lastResult.allPassed
      ? '사진이 ' + currentPreset.label + ' 규격에 모두 맞아요.'
      : '사진을 읽었어요. 규격에 맞지 않는 부분이 있으니 변환해 보세요.',
    lastResult.allPassed ? 'ok' : 'error',
  );
  save();
}

// ---- 예시로 해 보기 ----
export async function runSampleWorkflow() {
  const canvas = synthesizeSamplePhoto();
  photoCanvas = canvas;
  photoMeta = {
    fileName: 'sample_portrait.jpg',
    width: 800,
    height: 1000,
    sizeBytes: 0, // 아래에서 실제 인코딩 크기로 갱신
    orientation: 1,
    detectedMime: 'image/jpeg',
  };
  // 실제 인코딩 크기를 매직 바이트로 확인
  const buf = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then(resolve) : reject(new Error('enc'))),
      'image/jpeg',
      0.9,
    );
  }).catch(() => new Uint8Array(0));
  photoMeta.sizeBytes = buf.byteLength || 1;
  if (buf.byteLength === 0) {
    failStatus('예시를 만들 수 없어요. 브라우저 캔버스 기능을 확인해 주세요.');
    return;
  }
  photoMeta.sizeBytes = buf.byteLength;

  const spec = activeSpec();
  lastResult = evaluatePhotoSpec(photoMeta, spec);
  renderBadges(lastResult);
  renderResultJson(lastResult);
  renderPreview();
  applyZoom();

  // 변환
  const conv = await compressAndConvertJpeg(photoCanvas, spec, lastResult);
  if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  const dl = $('#download-link');
  const historyRec = {
    presetId: currentPreset.id,
    presetLabel: currentPreset.label,
    fileName: lastResult ? lastResult.outputFileName : '',
    sizeBytes: conv.ok ? conv.sizeBytes : 0,
    quality: conv.quality,
    timestamp: new Date().toISOString(),
  };
  if (conv.ok) {
    convertedUrl = conv.url;
    dl.disabled = false;
    dl.href = conv.url;
    dl.download = lastResult.outputFileName;
    // EXIF 제거 후 재확인: 실제 인코딩으로 evaluatePhotoSpec 다시
    photoMeta.sizeBytes = conv.sizeBytes;
    lastResult = evaluatePhotoSpec(photoMeta, spec);
    renderBadges(lastResult);
    renderResultJson(lastResult);
    setStatus(
      '예시 사진을 ' + currentPreset.label + ' 규격으로 변환했어요. ' +
        fmtBytes(conv.sizeBytes) + ' (한도 ' + fmtKiB(spec.maxBytes) + ' 이하) JPG가 만들어졌어요.',
      'ok',
    );
    state.sample = {
      fileName: 'sample_portrait.jpg',
      width: 800,
      height: 1000,
      sizeBytes: conv.sizeBytes,
      orientation: 1,
      detectedMime: 'image/jpeg',
      label: currentPreset.label,
    };
  } else {
    dl.disabled = true;
    dl.removeAttribute('href');
    convertedUrl = null;
    failStatus('예시 사진 변환에 실패했어요. 한도(' + fmtKiB(spec.maxBytes) + ') 안에 못 들어가요.');
  }
  historyRec.fileName = lastResult ? lastResult.outputFileName : historyRec.fileName;
  appendHistoryRecord(state, historyRec);
  save();
}

// ---- 변환 버튼 ----
async function runConvert() {
  if (!photoCanvas || !photoMeta) {
    failStatus('먼저 사진을 올려 주세요. 파일 고르기를 누르거나 예시로 해 보기를 눌러 보세요.');
    return;
  }
  const spec = activeSpec();
  const conv = await compressAndConvertJpeg(photoCanvas, spec, lastResult);
  const dl = $('#download-link');
  if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  if (conv.ok) {
    convertedUrl = conv.url;
    dl.disabled = false;
    dl.href = conv.url;
    dl.download = lastResult.outputFileName;
    photoMeta.sizeBytes = conv.sizeBytes;
    lastResult = evaluatePhotoSpec(photoMeta, spec);
    renderBadges(lastResult);
    renderResultJson(lastResult);
    renderPreview();
    setStatus(
      '규격에 맞는 JPG 변환이 끝났어요. ' +
        fmtBytes(conv.sizeBytes) + ' (한도 ' + fmtKiB(spec.maxBytes) + ' 이하) ' +
        lastResult.outputFileName,
      'ok',
    );
  } else {
    dl.disabled = true;
    dl.removeAttribute('href');
    convertedUrl = null;
    failStatus(
      '변환한 JPG가 한도(' + fmtKiB(spec.maxBytes) + ')를 넘어요. 원본 사진을 작게 줄인 뒤 다시 올려 보세요.',
    );
  }
  appendHistoryRecord(state, {
    presetId: currentPreset.id,
    presetLabel: currentPreset.label,
    fileName: lastResult ? lastResult.outputFileName : '',
    sizeBytes: conv.ok ? conv.sizeBytes : 0,
    quality: conv.quality,
    timestamp: new Date().toISOString(),
  });
  save();
}

// ---- 초기화 (한 번만) ----
export function initWorkspaceView() {
  if (initialized) return;
  initialized = true;
  state = loadState();

  currentPreset = getPresetById(state.presetId) || getPresetById('toeic');
  if (currentPreset.id === 'custom') currentPreset = buildCustomSpec(state.custom) || getPresetById('toeic');

  renderWorkspaceView();

  // 프리셋 칩 (event delegation — 중복 리스너 없음)
  $('#preset-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    selectPresetInWorkspace(chip.dataset.preset);
    if (window.location.hash !== '#/' + currentPreset.id) {
      history.replaceState(null, '', '#' + currentPreset.id);
    }
  });

  // 직접 입력
  const customInputs = [
    ['#custom-width', 'width'],
    ['#custom-height', 'height'],
    ['#custom-ratio-w', 'ratioW'],
    ['#custom-ratio-h', 'ratioH'],
    ['#custom-max-bytes', 'maxBytes'],
  ];
  for (const [sel, key] of customInputs) {
    $(sel).addEventListener('input', () => {
      if (currentPreset.id !== 'custom') return;
      const v = parseInt($(sel).value, 10);
      state.custom[key] = Number.isSafeInteger(v) ? v : 0;
      const spec = buildCustomSpec(state.custom);
      if (!spec) {
        failStatus(
          '직접 입력 값이 규격이 안 돼요. 비율(너비:높이)이 맞지 않거나 용량이 1KB~10MB 밖이에요. 마지막 유효 값을 계속 쓰고 있어요.',
        );
        return;
      }
      currentPreset = spec;
      saveState(state);
      if (photoMeta) {
        lastResult = evaluatePhotoSpec(photoMeta, currentPreset);
        renderBadges(lastResult);
        renderResultJson(lastResult);
        renderPreview();
      }
      renderSummary();
      setStatus('', '');
    });
  }
  $('#custom-ext').addEventListener('change', () => {
    if (currentPreset.id !== 'custom') return;
    state.custom.ext = $('#custom-ext').value;
    const spec = buildCustomSpec(state.custom);
    if (!spec) {
      failStatus('확장자는 .jpg 또는 .jpeg 로만 설정할 수 있어요. 마지막 유효 값을 계속 쓰고 있어요.');
      return;
    }
    currentPreset = spec;
    saveState(state);
    if (photoMeta) {
      lastResult = evaluatePhotoSpec(photoMeta, currentPreset);
      renderBadges(lastResult);
      renderResultJson(lastResult);
    }
    renderSummary();
    setStatus('', '');
  });

  // 파일
  const fileInput = $('#photo-file');
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) await loadFile(f);
  });
  $('#choose-file-button').addEventListener('click', () => fileInput.click());

  // 확대
  $('#zoom-compare').addEventListener('input', applyZoom);

  // 예시
  $('#sample-button').addEventListener('click', () => {
    runSampleWorkflow();
  });

  // 변환
  $('#convert-button').addEventListener('click', () => {
    runConvert();
  });

  // 미리보기 초기(빈 상태) — 예시로 채우지 않음
  renderPreview();
}
