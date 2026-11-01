// Submission Photo Fit — 화면 인터랙션 (브라우저 전용, src/app.js 의 checkSubmissionPhoto 를 사용)
(function () {
  'use strict';
  const check = window.checkSubmissionPhoto; // src/shim.js 가 정의 (구현은 src/app.js 와 동일)
  const $ = (id) => document.getElementById(id);

  const PRESETS = {
    toeic:  { label: '토익',       maxKb: 300, width: 354, height: 472, sourceUrl: 'https://toeic.co.kr',   appliesTo: '토익 시험',    checkedAt: '미확인' },
    qnet:   { label: '큐넷',       maxKb: 100, width: 413, height: 531, sourceUrl: 'https://q-net.or.kr',   appliesTo: '큐넷(대학·학점은행)', checkedAt: '미확인' },
    civil:  { label: '공무원 원서', maxKb: 100, width: 354, height: 472, sourceUrl: 'https://gosi.kr',       appliesTo: '공무원 원서',  checkedAt: '미확인' },
    gov24:  { label: '정부24',     maxKb: 100, width: 413, height: 531, sourceUrl: 'https://www.gov.kr',    appliesTo: '정부24',       checkedAt: '미확인' },
    resume: { label: '이력서',     maxKb: 200, width: 354, height: 472, sourceUrl: 'https://saramin.co.kr', appliesTo: '채용 이력서',  checkedAt: '미확인' },
    custom: { label: '직접 입력' },
  };

  const state = { presetId: null, preset: null, img: null, natural: null, crop: null, frame: null, frameDirty: false, out: null, outBytes: null, blobUrl: null, sample: false };
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const SAMPLE_TAG = '연습용 · ';
  const CONTENT_NOTE = '기술 규격만 통과했습니다. 얼굴·배경·촬영 시점 등 사진 내용 규정은 제출처 안내 페이지에서 직접 확인하세요';

  /* ---------- 상태 영역 ---------- */
  function status(msg, kind) {
    const el = $('app-status');
    el.textContent = msg || '';
    el.className = msg ? 'ds-status' + (kind ? ' ds-status-' + kind : '') : 'app-status';
  }
  function clearStatus() { status(''); }

  /* ---------- spec 라인 ---------- */
  function specLineText(p) {
    return '최대 ' + p.maxKb + 'KB · ' + p.width + '×' + p.height + 'px · JPG · ' + p.width + ':' + p.height;
  }
  function renderSpec() {
    const line = $('spec-line');
    line.textContent = '';
    // #spec-source / #spec-checked 는 SPEC 의 고정 id — 제출처를 아직 안 고른 빈 화면에도 항상 존재
    // (규격 텍스트·링크·확인 날짜는 제출처를 골라야만 채워지므로 빈 화면에서는 비어 있음)
    const a = document.createElement('a');
    a.id = 'spec-source';
    a.target = '_blank';
    a.rel = 'noopener';
    const span = document.createElement('span');
    span.id = 'spec-checked';
    if (!state.preset) { line.append(a, ' ', span); return; }
    a.href = state.preset.sourceUrl;
    a.textContent = state.presetId === 'custom' ? '직접 입력한 규격' : '출처 확인';
    span.textContent = '확인 날짜: ' + (state.preset.checkedAt === '미확인' ? '미확인 — 제출 전 제출처 안내 페이지에서 직접 확인하세요' : state.preset.checkedAt);
    line.append(specLineText(state.preset), ' ', a, ' ', span);
  }

  function selectPreset(id) {
    state.presetId = id;
    state.preset = PRESETS[id] ? Object.assign({}, PRESETS[id]) : null;
    for (const b of document.querySelectorAll('.preset-button')) {
      b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false');
    }
    $('custom-box').hidden = id !== 'custom';
    renderSpec();
    clearStatus();
    if (state.img) {
      // 직접 입력은 규격(너비·높이)이 아직 없으므로 비교할 수 없음 — 입력 완료 시(onCustomInput) 처리
      if (state.preset && state.preset.width) {
        const cur = state.frame || { width: 0, height: 0 };
        if (cur.width !== state.preset.width || cur.height !== state.preset.height) {
          state.frameDirty = false; // 프레임이 새 규격 비율에 맞게 다시 계산
          if (state.out) clearResult('제출처를 바꿨어요. 사진은 그대로 있고, 「규격에 맞게 변환」을 누르면 새 규격으로 다시 변환돼요.');
        }
        layoutCrop(); // 새 규격 비율에 맞춰 프레임 다시 계산
      }
    }
    updateAnswer(); // 답 카드도 새 규격 기준(결과 값 없으면 현재 제출처 기준)
  }

  /* ---------- 직접 입력 ---------- */
  function parseWhole(str, name) {
    const t = (str || '').trim();
    if (!/^\d+$/.test(t)) return { err: name + '은 숫자만 넣어 주세요. ' + (t ? '"' + t + '"' : '값') + '은 숫자가 아니에요.' };
    const n = parseInt(t, 10);
    if (!Number.isSafeInteger(n) || n <= 0) return { err: name + '은 1 이상의 정수로 넣어 주세요.' };
    return { n };
  }
  function onCustomInput() {
    const kb = parseWhole($('custom-kb').value, '용량');
    const w = parseWhole($('custom-width').value, '너비');
    const h = parseWhole($('custom-height').value, '높이');
    if (kb.err) return status(kb.err, 'bad');
    if (w.err) return status(w.err, 'bad');
    if (h.err) return status(h.err, 'bad');
    state.presetId = 'custom';
    state.preset = { label: '직접 입력', maxKb: kb.n, width: w.n, height: h.n, sourceUrl: 'https://www.google.com', appliesTo: '직접 입력 규격', checkedAt: '미확인' };
    for (const b of document.querySelectorAll('.preset-button')) b.setAttribute('aria-pressed', b.dataset.id === 'custom' ? 'true' : 'false');
    renderSpec();
    clearStatus();
    if (state.img) {
      const cur = state.frame || { width: 0, height: 0 };
      if (cur.width !== w.n || cur.height !== h.n) {
        state.frameDirty = false; // 프레임이 새 규격 비율에 맞게 다시 계산
        if (state.out) clearResult('규격을 바꿨어요. 「규격에 맞게 변환」을 누르면 새 규격으로 다시 변환돼요.');
      }
      layoutCrop();
    }
    updateAnswer();
  }

  /* ---------- 답 카드(항상 표시) ---------- */
  // 순수 함수 결과는 bytes 를 최상위에 안 담고, checks(0)=size 에 용량을 담음
  function outBytes(out) { return out && out.checks && out.checks[0] ? out.checks[0].bytes : null; }
  function kbNote(n) { return Math.round(n / 980) === n / 1000 ? ' ≈ ' + Math.round(n / 1000) + 'KB, 2% 여유 포함' : ''; }
  function updateAnswer() {
    const p = state.preset || PRESETS.qnet;
    // 결과가 있으면 결과 값, 없으면 '—' — 사진 전에는 가짜 수치를 보여 주지 않음
    const b = state.outBytes != null ? state.outBytes : outBytes(state.out);
    $('sample-hint-answer').hidden = !!state.out;
    if (state.out) {
      const prefix = state.sample ? SAMPLE_TAG : '';
      $('verdict').textContent = prefix + (state.out.pass ? '제출 가능' : '규격 미충족');
      $('verdict-text').textContent = prefix + p.label + ' 규격 기준, 사진 ' + fmt(b) + '바이트예요. 상한 ' + fmt(state.out.safeLimitBytes) + '바이트(' + Math.round(state.out.safeLimitBytes / 1000) + 'KB, 2% 여유) 안에 들어가요.';
      $('upscale-note').textContent = state.out.upscaled ? '원본이 작아 확대되었습니다. 화질이 낮을 수 있습니다.' : '';
      document.querySelector('.ans-size').textContent = fmt(b) + '바이트';
      document.querySelector('.ans-limit').textContent = fmt(state.out.safeLimitBytes) + '바이트' + kbNote(state.out.safeLimitBytes);
      document.querySelector('.ans-dims').textContent = p.width + '×' + p.height;
    } else if (state.preset) {
      $('verdict').textContent = '사진을 넣어 보세요';
      $('verdict-text').textContent = p.label + ' 규격이 준비됐어요. 사진을 골라 「규격에 맞게 변환」을 누르면 결과가 여기에 나와요.';
      $('upscale-note').textContent = '';
      document.querySelector('.ans-size').textContent = '—';
      document.querySelector('.ans-limit').textContent = '최대 ' + p.maxKb + 'KB';
      document.querySelector('.ans-dims').textContent = p.width + '×' + p.height;
    } else {
      // 아무 제출처도 안 고른 초기 상태: 예시 규격으로 미리 채우지 않음
      $('verdict').textContent = '사진을 넣어 보세요';
      $('verdict-text').textContent = '아직 사진이 없어요. ① 제출처를 고르고 ② 사진을 골라 주세요.';
      $('upscale-note').textContent = '';
      document.querySelector('.ans-size').textContent = '—';
      document.querySelector('.ans-limit').textContent = '—';
      document.querySelector('.ans-dims').textContent = '—';
    }
    toggleSampleMode();
  }
  // 연습용 결과: 결과 카드 + 답 카드에 data-sample 로 구분 (점선·회색은 styles.css)
  function toggleSampleMode() {
    for (const id of ['result-card', 'answer-card']) $(id).dataset.sample = state.sample ? 'true' : 'false';
  }

  /* ---------- 결과 ---------- */
  function clearResult(reason) {
    if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; }
    state.out = null; state.outBytes = null; state.sample = false;
    if (state.frame) state.frameDirty = false; // 프레임은 새 규격 비율로 다시 계산
    toggleSampleMode();
    const img = $('result-preview');
    img.hidden = true;
    img.removeAttribute('src');
    $('checklist').textContent = '';
    const dl = $('download-link');
    dl.hidden = true;
    dl.removeAttribute('href');
    $('content-note').hidden = true;
    $('content-note').textContent = '';
    $('result-card').hidden = true;
    $('sample-badge').hidden = true;
    $('result-empty').hidden = false;
    // 이유가 있으면 그 문구, 없으면 기본 문구 — result-empty 이 항상 어떤 다음 단계인지 말해 줌
    $('result-empty-text').textContent = reason
      || (state.img ? '사진이 준비됐어요. 「규격에 맞게 변환」을 누르면 결과가 여기에 나와요.'
        : '변환 결과가 여기에 보여요. 예시로 해 보기를 누르면 연습용 그림으로 바로 확인할 수 있어요. 제출처를 고르면 그 규격으로 변환돼요.');
    updateAnswer();
  }

  function renderResult(out) {
    const p = state.preset;
    const b = state.outBytes != null ? state.outBytes : outBytes(out);
    const kb = Math.round(out.safeLimitBytes / 1000);
    $('result-empty').hidden = true;
    $('result-card').hidden = false;
    $('answer-card').hidden = false; // 결과가 나오면 답 카드 표시 (사진 전에는 비어 있어 숨김 — UX-REVIEW RED: 예시가 실제처럼 보이지 않게)
    $('sample-badge').hidden = !state.sample;
    const prefix = state.sample ? SAMPLE_TAG : '';
    $('verdict').textContent = prefix + (out.pass ? '제출 가능' : '규격 미충족');
    $('verdict-text').textContent = prefix + p.label + ' 규격 기준, 사진 ' + fmt(b) + '바이트예요. 상한 ' + fmt(out.safeLimitBytes) + '바이트(' + kb + 'KB, 2% 여유) 안에 들어가요.';
    $('upscale-note').textContent = out.upscaled ? '원본이 작아 확대되었습니다. 화질이 낮을 수 있습니다.' : '';

    const lines = [
      '용량 ' + fmt(b) + '바이트 (상한 ' + fmt(out.safeLimitBytes) + '바이트 ≈ ' + kb + 'KB, 2% 여유 포함)',
      '크기 ' + p.width + '×' + p.height,
      'JPG',
    ];
    const ul = $('checklist');
    ul.textContent = '';
    out.checks.forEach((c, i) => {
      const li = document.createElement('li');
      li.textContent = (c.ok ? '✓ ' : '✗ ') + lines[i];
      li.className = c.ok ? 'ok' : 'fail';
      ul.append(li);
    });

    const img = $('result-preview');
    if (state.blobUrl) img.src = state.blobUrl;
    img.hidden = false;
    const dl = $('download-link');
    if (state.blobUrl) { dl.href = state.blobUrl; dl.hidden = false; } else dl.hidden = true;
    const note = $('content-note');
    if (out.pass) { note.textContent = CONTENT_NOTE + ' 용량 상한은 제출처 규격에 앱이 2% 여유를 둔 기준이에요.'; note.hidden = false; }
    else {
      note.textContent = '통과하지 못한 항목을 확인하고, 용량이 크면 사진 규격(최대 ' + kb + 'KB)에 맞게 다시 촬영해 보세요. 이 파일은 그대로 제출하면 제출처가 받아주지 않을 수 있어요.';
      note.hidden = false;
    }
    $('crop-hint').hidden = false;
    $('photo-hint').textContent = state.sample
      ? '연습용 그림이에요. 내 사진으로 하면 「파일 고르기」를 눌러 주세요.'
      : (state.natural.width + '×' + state.natural.height + ' 사진을 불러왔어요. 「규격에 맞게 변환」을 눌러 보세요.');
    updateAnswer();
  }

  /* ---------- 사진 로딩 ---------- */
  function loadSource(img) {
    // 0×0로 해석되는 경우(예: 생성된 dataURL)에 대비해 미리 4032×3024로 고정
    state.img = img;
    state.natural = (img.naturalWidth > 0 && img.naturalHeight > 0)
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : { width: 4032, height: 3024 };
    state.frameDirty = false;
    if (!$('photo-hint').textContent.includes('연습용')) {
      $('photo-hint').textContent = state.natural.width + '×' + state.natural.height + ' 사진을 불러왔어요. 아래에서 「규격에 맞게 변환」을 눌러 보세요.';
    }
    $('crop-empty').hidden = true;
    $('crop-canvas').hidden = false;
    $('crop-hint').hidden = false;
    clearStatus();
    layoutCrop();
    if (!$('result-empty').hidden) $('result-empty-text').textContent = '사진이 준비됐어요. 「규격에 맞게 변환」을 누르면 결과가 여기에 나와요.';
  }

  function pickPhoto(file) {
    sampleTicket++; // 내 파일을 고르면 예시 표시를 정리
    if (!state.preset) { status('제출처를 먼저 선택하세요. 위에서 제출처를 골라 주세요.', 'bad'); return; }
    if (!file || !/^image\//.test(file.type)) { status('그림 파일이 아니에요. JPG나 PNG 파일로 다시 골라 주세요.', 'bad'); return; }
    state.sample = false;
    const img = new Image();
    img.onload = () => {
      clearResult();
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) { status('사진을 읽지 못했어요. 다른 파일로 다시 골라 주세요.', 'bad'); return; }
      loadSource(img);
    };
    img.onerror = () => { clearResult(); status('사진을 읽지 못했어요. 파일을 다시 골라 주세요.', 'bad'); };
    img.src = URL.createObjectURL(file);
  }

  /* ---------- 크롭 캔버스 ---------- */
  function layoutCrop() {
    if (!state.img || !state.natural) return;
    let cw, ch, scale;
    try {
      const maxW = $('crop-canvas').parentElement ? $('crop-canvas').getBoundingClientRect().width : 0;
      const w = Math.min(720, maxW || 560);
      const h = Math.round(w * state.natural.height / state.natural.width);
      const dpr = window.devicePixelRatio || 1;
      cw = Math.round(w * dpr);
      ch = Math.round(h * dpr);
      scale = cw / state.natural.width;
    } catch (e) { status('사진을 화면에 그리지 못했어요. 다른 브라우저에서 다시 열어 주세요.', 'bad'); return; }
    const cv = $('crop-canvas');
    cv.width = cw; cv.height = ch;
    cv.style.aspectRatio = state.natural.width + '/' + state.natural.height; // 사진 비율 그대로
    state.scale = scale;

    if (!state.frameDirty) {
      const r = check(state.preset, state.natural, { width: state.preset.width, height: state.preset.height, bytes: 0, mimeType: 'image/jpeg' });
      state.frame = Object.assign({}, r.crop);
    }
    clampFrame();
    drawCrop();
  }
  function clampFrame() {
    if (!state.frame || !state.natural) return;
    state.frame.x = Math.max(0, Math.min(state.frame.x, state.natural.width - state.frame.width));
    state.frame.y = Math.max(0, Math.min(state.frame.y, state.natural.height - state.frame.height));
  }
  function drawCrop() {
    const cv = $('crop-canvas');
    if (!cv.width || !state.img) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(state.img, 0, 0, cv.width, cv.height);
    if (state.frame) {
      const s = state.scale;
      const f = state.frame;
      // 제출 영역 바깥은 밝게 흐리게 (어두운 막대가 깨진 이미지처럼 보이지 않게)
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(0, 0, cv.width, f.y * s);
      ctx.fillRect(0, (f.y + f.height) * s, cv.width, cv.height - (f.y + f.height) * s);
      ctx.fillRect(0, f.y * s, f.x * s, f.height * s);
      ctx.fillRect((f.x + f.width) * s, f.y * s, cv.width - (f.x + f.width) * s, f.height * s);
      // 프레임 테두리: 어두운 선(바깥) + 흰 선(안쪽) 두 줄 — 밝은 사진·어두운 사진 어디서든 보임
      ctx.lineWidth = Math.max(3, Math.round(3 * s));
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeRect(f.x * s - 1.5, f.y * s - 1.5, f.width * s + 3, f.height * s + 3);
      ctx.lineWidth = Math.max(1.5, Math.round(1.5 * s));
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeRect(f.x * s, f.y * s, f.width * s, f.height * s);
    }
  }
  function onPointer(e, type) {
    if (!state.frame || !state.img) return;
    e.preventDefault();
    const rect = $('crop-canvas').getBoundingClientRect();
    const dx = (e.clientX - rect.left) * (state.natural.width / rect.width);
    const dy = (e.clientY - rect.top) * (state.natural.height / rect.height);
    const start = state._start || { fx: state.frame.x, fy: state.frame.y, cx: 0, cy: 0 };
    state.frame.x = Math.round(start.fx + (dx - start.cx));
    state.frame.y = Math.round(start.fy + (dy - start.cy));
    clampFrame();
    drawCrop();
  }
  function initDrag() {
    const cv = $('crop-canvas');
    let active = null;
    cv.addEventListener('pointerdown', (e) => {
      if (!state.frame || !state.img) return;
      active = e.pointerId;
      state._start = { fx: state.frame.x, fy: state.frame.y, cx: e.clientX, cy: e.clientY };
      cv.setPointerCapture(active);
    });
    cv.addEventListener('pointermove', (e) => { if (e.pointerId === active) onPointer(e, 'move'); });
    const end = (e) => { if (e.pointerId === active) { active = null; state.frameDirty = true; } };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  /* ---------- 변환 ---------- */
  function process() {
    if (!state.preset) { status('제출처를 먼저 선택하세요. 위 목록에서 제출처를 골라 주세요.', 'bad'); return; }
    if (!state.img) { status('변환할 사진이 없어요. 파일을 고르거나 예시로 해 보기를 눌러 주세요.', 'bad'); return; }
    clearResult();
    const p = state.preset;
    const f = state.frame || { x: 0, y: 0, width: state.natural.width, height: state.natural.height };
    try {
      const c = document.createElement('canvas');
      c.width = p.width; c.height = p.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(state.img, f.x, f.y, f.width, f.height, 0, 0, p.width, p.height);

      // JPEG quality 이분 탐색: safeLimitBytes 이하에 가장 높은 화질 (0.05~0.95, 8회)
      const limit = check(p, state.natural, { width: p.width, height: p.height, bytes: 0, mimeType: 'image/jpeg' }).safeLimitBytes;
      let qmin = 0.05, qmax = 0.95, best = null, last = null;
      for (let i = 0; i < 8; i++) {
        const q = (qmin + qmax) / 2;
        // toDataURL 로 동기 측정 (외부 전송 없음, 브라우저 안에서만)
        const data = c.toDataURL('image/jpeg', q);
        const bytes = Math.round((data.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
        last = { q, bytes };
        if (bytes <= limit) { best = { q, bytes }; qmin = q; } else qmax = q;
      }
      const chosen = best || { q: qmin, bytes: last ? last.bytes : 0 };
      const data = c.toDataURL('image/jpeg', chosen.q);
      const bin = atob(data.split(',')[1]);
      const bytes = bin.length;
      const u8 = new Uint8Array(bytes);
      for (let i = 0; i < bytes; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: 'image/jpeg' });
      if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
      state.blobUrl = URL.createObjectURL(blob);
      state.out = check(p, state.natural, { width: p.width, height: p.height, bytes, mimeType: 'image/jpeg' });
      state.outBytes = bytes; // 순수 함수 결과가 bytes 를 최상위에 안 담아, UI가 직접 표시
      renderResult(state.out);
      clearStatus();
    } catch (e) {
      clearResult();
      status('사진을 변환하지 못했어요. 다른 파일로 다시 시도해 주세요.', 'bad');
    }
  }

  /* ---------- 예시 ---------- */
  let sampleTicket = 0;
  function runSample() {
    if (!state.presetId) selectPreset('qnet'); // 무선택 시 큐넷
    const cv = document.createElement('canvas');
    cv.width = 4032; cv.height = 3024;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 3024);
    g.addColorStop(0, '#8aa2bd'); g.addColorStop(1, '#54688a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4032, 3024);
    const my = ++sampleTicket; // 다른 동작(파일 고르기 등)에 예시 표시가 지워지지 않게
    const img = new Image();
    img.onload = () => {
      if (my !== sampleTicket) return;
      clearResult();
      loadSource(img);
      process(); // process() 안의 clearResult()가 sample 플래그를 초기화하므로
      state.sample = true; // 여기에서 다시 표시 (연습용 뱃지·답 카드 숨김·회색 톤)
      renderResult(state.out);
      updateAnswer();
    };
    img.onerror = () => { status('예시를 만들지 못했어요. 다시 눌러 주세요.', 'bad'); };
    img.src = cv.toDataURL('image/png');
  }

  /* ---------- 초기화 ---------- */
  function reset() {
    if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; }
    state.img = null; state.natural = null; state.frame = null; state.frameDirty = false; state.sample = false;
    $('photo-file').value = '';
    $('crop-canvas').hidden = true;
    $('crop-canvas').width = 0; $('crop-canvas').height = 0;
    $('crop-empty').hidden = false;
    $('crop-hint').hidden = true;
    $('photo-hint').textContent = '제출할 사진(JPG·PNG)을 골라 주세요. 브라우저 안에서만 처리해요.';
    clearStatus();
    clearResult(); // result-empty 문구도 기본 문구로 (제출처는 유지)
    updateAnswer();
  }

  function init() {
    $('sample-button').addEventListener('click', runSample);
    $('process-button').addEventListener('click', process);
    $('choose-btn').addEventListener('click', () => $('photo-file').click());
    $('crop-empty').addEventListener('click', () => $('photo-file').click());
    $('photo-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) pickPhoto(f); });
    $('reset-button').addEventListener('click', reset);
    for (const b of document.querySelectorAll('.preset-button')) {
      b.addEventListener('click', () => selectPreset(b.dataset.id));
    }
    ['custom-kb', 'custom-width', 'custom-height'].forEach((id) => $(id).addEventListener('input', onCustomInput));
    initDrag();
    renderSpec(); // 빈 화면에도 #spec-line(빈)·#spec-source·#spec-checked 고정 id 가 존재하게
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
