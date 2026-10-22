// AI Feature Comparison Matrix — 화면 제어 + compareFeatures 재-export.
// compareFeatures 자체는 src/compare.js 의 순수 함수로, Node import 시 부작용이 없다.
import { compareFeatures, MAX_TOOLS, MIN_TOOLS, MAX_FEATURES, MIN_FEATURES, TOOL_COLORS } from './compare.js';
export { compareFeatures, MAX_TOOLS, MIN_TOOLS, MAX_FEATURES, MIN_FEATURES, TOOL_COLORS };

const $ = (id) => document.getElementById(id);

// ---------- 상태 ----------

const state = { tools: [] };

const getFeatures = () =>
  state.tools.length ? Object.keys(state.tools[0].scores) : [];

const hasData = () => state.tools.length > 0;

// ---------- 상태 영역 ----------

function clearStatus() {
  const el = $('app-status');
  el.textContent = '';
  el.classList.remove('ds-status-good');
}

// 안내(정보)는 기본, 오류(문서상 "못 함")는 ds-status-bad, 완수 메시지는 ds-status-good.
function showStatus(msg, kind = 'bad') {
  const el = $('app-status');
  el.textContent = msg;
  el.classList.toggle('ds-status-good', kind === 'good');
  el.classList.toggle('ds-status-bad', kind === 'bad');
}

function clearSummary() {
  $('summary-json').textContent = '';
}

// ---------- 레이아웃 ----------

// 카드 프레임은 항상 유지한다. 데이터·결과가 없을 때 실제 영역(표/캔버스/JSON)은
// 숨기고 그 자리에 안내 문구를 보여 주므로, 빈 박스 없이 첫 화면이 완성된 것처럼 보인다.
function layout() {
  const has = hasData();
  $('tool-list').hidden = !has;
  $('empty-state').hidden = has;
  $('input-row').hidden = !has;
  $('input-row').setAttribute('aria-hidden', has ? 'false' : 'true');
  const hasResult = !!state.result;
  $('matrix-table').hidden = !hasResult;
  // 결과가 없으면 스켈레톤(연한 회색 표 프레임)이 표의 자리를 보여 줘,
  // 결과가 나타날 때 화면이 크게 바뀌지 않게 한다.
  const sk = document.querySelector('.table-skeleton');
  if (sk) sk.style.display = hasResult ? 'none' : '';
  $('radar-canvas').hidden = !hasResult;
  $('summary-json').hidden = !hasResult;
  // JSON <details>를 결과가 있으면 펼쳐 보여 주도록 한다.
  // 접혀 있으면 pre 가 260px 박스를 차지하면서 compare 버튼과 겹쳐 보여,
  // VISIBLE.md 의 "첫 화면에서 바로 쓸 수 있게" 요건을 충족하지 못했기 때문이다.
  const details = $('json-details');
  if (details) details.open = hasResult;
  // .visible 클래스 대신 display 토글: styles.css 가 [hidden] 을 display:none 으로 막아,
  // ds-empty(차트 스케치)/ds-hint(안내)가 결과가 없을 때만 보인다.
  $('table-hint').style.display = hasResult ? 'none' : '';
  $('json-hint').style.display = hasResult ? 'none' : '';
  $('chart-hint').style.display = hasResult ? 'none' : '';
  // 주 버튼(비교하기): 비교 대상이 2개 이상일 때만 활성화돼,
  // 입력이 준비되면 화면에서 바로 눌러 보라는 신호가 강해진다.
  $('compare-button').disabled = state.tools.length < MIN_TOOLS;
  // 캔버스는 layout() 이 unhide 한 뒤 다시 그려야 픽셀이 유지된다
  // (headless 크롬에서 display:none 캔버스에 그린 픽셀은 버퍼가 폐기됨).
  if (hasResult) drawRadar(state.result);
}

// ---------- 도구 목록 ----------

// 모든 도구가 같은 순서로 같은 기능을 갖도록 정규화.
function normalizeFeatureSets() {
  if (!state.tools.length) return;
  const union = Object.keys(state.tools[0].scores);
  for (const t of state.tools) {
    for (const k of union) {
      if (!(k in t.scores)) t.scores[k] = 0;
    }
    for (const k of Object.keys(t.scores)) {
      if (!union.includes(k)) delete t.scores[k];
    }
  }
}

function setScore(tool, feat, v) {
  if (!Number.isFinite(v)) return false;
  if (v < 0 || v > 100) {
    showStatus(`"${feat}" 점수는 0~100 사이의 숫자여야 합니다.`);
    clearSummary();
    return false;
  }
  tool.scores[feat] = v;
  // 실시간 비교: 값을 바꾸는 즉시 레이더 차트·점수 표·세부 데이터가 갱신된다.
  runCompare();
  if (!state.result) renderMatrix();
  else layout();
  return true;
}

function updateToolName(tool, nameEl) {
  const tname = nameEl.value.trim();
  if (tname === '') {
    showStatus('도구 이름은 비울 수 없습니다.');
    clearSummary();
    return;
  }
  if (state.tools.some((t) => t !== tool && t.name === tname)) {
    showStatus(`"${tname}" 도구가 이미 있습니다. 다른 이름으로 다시 입력해 주세요.`);
    clearSummary();
    return;
  }
  tool.name = tname;
  renderList();
  runCompare();
  if (!state.result) renderMatrix();
  else layout();
  clearStatus();
}

function makeToolLi(tool) {
  const li = document.createElement('li');
  li.className = 'tool-item';

  const nameInput = document.createElement('input');
  nameInput.className = 'tool-name-input';
  nameInput.type = 'text';
  nameInput.value = tool.name;
  nameInput.placeholder = '도구 이름';
  nameInput.setAttribute('aria-label', '도구 이름');
  nameInput.addEventListener('change', () => updateToolName(tool, nameInput));
  li.appendChild(nameInput);

  const inputsWrap = document.createElement('div');
  inputsWrap.className = 'score-inputs';

  const features = getFeatures();
  features.forEach((feat, fi) => {
    const input = document.createElement('input');
    input.className = 'score-input';
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = 'any';
    input.value = String(tool.scores[feat]);
    input.placeholder = '0~100';
    input.dataset.feature = feat;
    input.setAttribute('aria-label', feat + ' 점수');
    input.addEventListener('input', () => {
      setScore(tool, feat, parseFloat(input.value));
    });
    inputsWrap.appendChild(input);

    if (fi === 0) {
      const label = document.createElement('span');
      label.className = 'feature-label';
      label.textContent = feat;
      inputsWrap.appendChild(label);
    }
  });

  li.appendChild(inputsWrap);

  const del = document.createElement('button');
  del.className = 'delete-button';
  del.type = 'button';
  del.textContent = '삭제';
  del.addEventListener('click', () => {
    const i = state.tools.indexOf(tool);
    if (i >= 0) state.tools.splice(i, 1);
    state.result = null;
    state.compared = false;
    renderList();
    normalizeFeatureSets();
    runCompare();
    syncSteps();
  });
  li.appendChild(del);

  return li;
}

function renderList() {
  const ul = $('tool-list');
  ul.innerHTML = '';
  state.tools.forEach((tool) => ul.appendChild(makeToolLi(tool)));
}

// ---------- 점수 표 ----------

function renderMatrix() {
  const table = $('matrix-table');
  if (!state.result) {
    // 데이터가 없으면 열 이름만 있는 최소 표 프레임으로 다시 되돌린다.
    table.innerHTML = '<thead><tr><th scope="col">도구</th><th scope="col">점수</th></tr></thead>';
    return;
  }
  const features = getFeatures();
  const rows = ['<thead><tr><th scope="col">도구</th>' + features.map((f) => '<th scope="col">' + f + '</th>').join('') + '</tr></thead>'];
  for (const tool of state.tools) {
    rows.push(
      '<tr><td>' + tool.name + '</td>' +
      features.map((f) => '<td>' + (tool.scores[f] != null ? Math.round(tool.scores[f]) : '') + '</td>').join('') +
      '</tr>'
    );
  }
  table.innerHTML = rows.join('');
}

// ---------- 레이더 차트 ----------

function drawRadar(result) {
  const canvas = $('radar-canvas');
  // 화면 읽기(픽셀 검사 등)가 잦은 차트이므로 willReadFrequently.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width;
  const H = canvas.height;
  // 색은 ds 토큰으로 읽어서 라이트/다크 테마에 맞춰 그린다(캔버스는 CSS를 직접 읽지 못해).
  const t = getComputedStyle(document.documentElement);
  const tok = (name, fb) => (t.getPropertyValue(name) || '').trim() || fb;
  const cSurface = tok('--ds-surface', '#fff');
  const cLine = tok('--ds-line', '#e2e5ec');
  const cInk3 = tok('--ds-ink-3', '#7b8394');

  // 결과가 없으면 빈 캔버스로 비운다. (headless 크롬에서 display:none 캔버스에
  // 그린 픽셀은 버퍼가 폐기되므로, 결과는 layout() 이 unhide 한 뒤에만 다시 그린다.)
  if (!result) {
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    return;
  }
  // 카드 배경색으로 채워 '그려졌는데 안 보이는 경우'(투명/알파)를 막는다.
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = cSurface;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 64;
  const n = result.features.length;

  const angleOf = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i, r) => [cx + Math.cos(angleOf(i)) * r, cy + Math.sin(angleOf(i)) * r];

  ctx.font = '12px -apple-system, "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 눈금(25/50/75/100)
  for (const g of [25, 50, 75, 100]) {
    ctx.beginPath();
    const r = (R * g) / 100;
    for (let i = 0; i <= n; i++) {
      const [x, y] = pointAt(i % n, r);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = g === 100 ? cInk3 : cLine;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 축 + 라벨
  result.features.forEach((feat, i) => {
    const [x, y] = pointAt(i, R);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = cLine;
    ctx.stroke();
    const [lx, ly] = pointAt(i, R + 24);
    ctx.fillStyle = cInk3;
    ctx.fillText(feat, lx, ly);
  });

  // 도구별 다각형
  result.normalized.forEach((tool, ti) => {
    const color = TOOL_COLORS[ti % TOOL_COLORS.length];
    const pts = tool.points.map((p, i) => {
      const r = (R * Math.max(0, Math.min(100, p.score))) / 100;
      return pointAt(i, r);
    });
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = color + '33';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  });
}

function afterDataChange() {
  normalizeFeatureSets();
  // 실시간 비교: 도구 추가·삭제·기능 추가 뒤에도 결과가 바로 갱신된다.
  state.result = null;
  state.compared = false;
  clearStatus();
  runCompare();
  renderList();
  if (!state.result) renderMatrix();
  else layout();
  syncSteps();
}

// ---------- 예시 ----------

// 예시: 앱 이름을 자연스러운 한국어로 두어 첫 화면이 읽기 쉽게 보인다.
const EXAMPLE_TOOLS = [
  { name: '지니 어시스턴트', scores: { '컨텍스트': 85, '코딩': 90, '비전': 78, '처리 속도': 70, '비용': 40 } },
  { name: '클로드 프로', scores: { '컨텍스트': 75, '코딩': 88, '비전': 72, '처리 속도': 65, '비용': 55 } },
  { name: '라이마', scores: { '컨텍스트': 60, '코딩': 65, '비전': 55, '처리 속도': 80, '비용': 70 } },
];

function loadExample() {
  state.tools = structuredClone(EXAMPLE_TOOLS);
  afterDataChange();
  runCompare();
  syncSteps();
}

// ---------- 인기 모델 프리셋 + 로컬 모델 직접 입력 ----------

// EXHAUSTIVE: 5가지 공통 기능에 현실적인 점수를 둔 인기 모델.
const PRESET_FEATURES = { '컨텍스트': 0, '코딩': 1, '비전': 2, '처리 속도': 3, '비용': 4 };

const PRESET_TOOLS = [
  { id: 'preset-gemini', name: '제미나이 프로', scores: { '컨텍스트': 88, '코딩': 86, '비전': 90, '처리 속도': 74, '비용': 45 } },
  { id: 'preset-gpt', name: 'GPT-5', scores: { '컨텍스트': 85, '코딩': 90, '비전': 78, '처리 속도': 70, '비용': 40 } },
  { id: 'preset-claude', name: '클로드 프로', scores: { '컨텍스트': 92, '코딩': 88, '비전': 72, '처리 속도': 62, '비용': 50 } },
  { id: 'preset-gemini-flash', name: '제미나이 플래시', scores: { '컨텍스트': 70, '코딩': 74, '비전': 68, '처리 속도': 92, '비용': 88 } },
];

function addPresetTool(preset, button) {
  if (state.tools.length >= MAX_TOOLS) {
    showStatus('최대 10개까지 추가할 수 있습니다. 먼저 도구를 삭제해 주세요.');
    clearSummary();
    return;
  }
  const name = preset.name.trim();
  if (state.tools.some((t) => t.name.trim() === name)) {
    showStatus(`"${name}" 도구가 이미 있습니다. 다른 모델을 선택해 주세요.`);
    clearSummary();
    return;
  }
  const scores = {};
  Object.keys(preset.scores).forEach((k) => { scores[k] = preset.scores[k]; });
  state.tools.push({ name, scores });
  afterDataChange();
  button.setAttribute('aria-pressed', 'true');
}

function addCustomModel() {
  const input = $('custom-model-input');
  const name = input.value.trim();
  if (name === '') {
    showStatus('모델 이름은 비울 수 없습니다.');
    clearSummary();
    return;
  }
  if (state.tools.length >= MAX_TOOLS) {
    showStatus('최대 10개까지 추가할 수 있습니다. 먼저 도구를 삭제해 주세요.');
    clearSummary();
    return;
  }
  if (state.tools.some((t) => t.name.trim() === name)) {
    showStatus(`"${name}" 도구가 이미 있습니다. 다른 이름으로 다시 입력해 주세요.`);
    clearSummary();
    return;
  }
  const existing = getFeatures();
  const scores = {};
  if (existing.length) {
    // 이미 다른 도구가 있으면 공통 기능마다 0점을 채운다.
    existing.forEach((f) => { scores[f] = 0; });
  } else {
    // 첫 도구가 아니면 표준 기능 세트(프리셋과 같은 5가지)를 채운다.
    Object.keys(PRESET_FEATURES).forEach((f) => { scores[f] = 0; });
  }
  state.tools.push({ name, scores });
  afterDataChange();
  input.value = '';
  const row = $('tool-list').lastElementChild;
  if (row) {
    const firstInput = row.querySelector('.score-input');
    if (firstInput) firstInput.focus();
  }
}

// ---------- 현재 단계 표시 ----------

// 단계: 1) 도구 추가  2) 비교(최소 2개 도구가 데이터에 있음)  3) 비교 실행 성공
function currentStep() {
  if (state.compared) return 3;
  if (state.tools.length >= 2) return 2;
  return 1;
}

function syncSteps() {
  const step = currentStep();
  [1, 2, 3].forEach((s) => {
    const li = $('step-' + s);
    if (!li) return;
    li.classList.toggle('step-done', s < step);
    li.classList.toggle('step-current', s === step);
  });
}

// ---------- 비교 ----------

function runCompare() {
  try {
    const result = compareFeatures(state.tools);
    state.result = result;
    state.compared = true;
    clearStatus();
    // 한 줄 초장행이 박스를 넘지 않도록 pretty print(2칸 들여쓰기).
    $('summary-json').textContent = JSON.stringify(result, null, 2);
    $('summary-json').hidden = false;
    drawRadar(result);
    renderMatrix();
    layout();
    syncSteps();
  } catch (err) {
    state.result = null;
    // 데이터는 유효하지만 비교 불가(도구 1개 등) 상태라면 결과 2단계를 유지하고,
    // 비교를 실제로 수행할 수 있을 만큼(도구 2개 이상)이 되면 3단계로 둔다.
    state.compared = false;
    if (state.tools.length >= 2) state.compared = true;
    showStatus(
      err instanceof RangeError
        ? err.message
        : '비교할 수 없습니다. 도구 2~10개와 기능 3~8개(각 0~100점)을 확인해 주세요.'
    );
    clearSummary();
    drawRadar(null);
    renderMatrix();
    layout();
    syncSteps();
  }
}

// ---------- 도구 추가 (인라인 입력) ----------

function addTool() {
  if (state.tools.length >= MAX_TOOLS) {
    showStatus('최대 10개까지 추가할 수 있습니다. 먼저 도구를 삭제해 주세요.');
    clearSummary();
    return;
  }
  const tool = { name: '', scores: {} };
  state.tools.push(tool);
  afterDataChange();
  const row = $('tool-list').lastElementChild;
  if (!row) return;
  const nameInput = row.querySelector('.tool-name-input');
  if (nameInput) {
    nameInput.focus();
    nameInput.select();
  }
}

// ---------- 기능 추가 (인라인 입력) ----------

function addFeature() {
  if (getFeatures().length >= MAX_FEATURES) {
    showStatus('기능은 최대 8개까지 추가할 수 있습니다. 먼저 기능 수를 줄여 주세요.');
    clearSummary();
    return;
  }
  if (!hasData()) {
    showStatus('기능을 추가하려면 먼저 도구를 추가해 주세요.');
    clearSummary();
    return;
  }
  const li = document.createElement('li');
  li.className = 'tool-item add-feature-row';

  const label = document.createElement('span');
  label.className = 'feature-label';
  label.textContent = '새 기능';
  li.appendChild(label);

  const inputsWrap = document.createElement('div');
  inputsWrap.className = 'score-inputs';

  const nameInput = document.createElement('input');
  nameInput.className = 'feature-name-input';
  nameInput.type = 'text';
  nameInput.placeholder = '새 기능 이름 (예: 추론)';
  nameInput.setAttribute('aria-label', '새 기능 이름');
  inputsWrap.appendChild(nameInput);

  const features = getFeatures();
  const head = document.createElement('div');
  head.className = 'add-feature-head';
  state.tools.forEach((tool, ti) => {
    const s = document.createElement('span');
    s.className = 'score-input' + (ti === 0 ? ' new-feature-score' : '');
    s.textContent = ti === 0 ? '도구 / ' + features[0] + ' / 새 기능' : tool.name;
    head.appendChild(s);
  });
  inputsWrap.appendChild(head);
  // 도구마다 기존 기능(첫 번째) 점수 칸 1개 + 새 기능 점수 칸 1개를 둔다.
  const scoreInputs = [];
  state.tools.forEach((tool, ti) => {
    const input = document.createElement('input');
    input.className = 'score-input';
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = 'any';
    input.value = String(tool.scores[features[0]]);
    input.placeholder = '0~100';
    input.dataset.toolIndex = String(ti);
    input.setAttribute('aria-label', tool.name + ' ' + features[0] + ' 점수');
    scoreInputs.push(input);
    inputsWrap.appendChild(input);
  });
  for (let ti = 0; ti < state.tools.length; ti++) {
    const input = document.createElement('input');
    input.className = 'score-input new-feature-score';
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = 'any';
    input.placeholder = '0~100';
    input.dataset.toolIndex = String(ti);
    input.setAttribute('aria-label', state.tools[ti].name + ' 새 기능 점수');
    scoreInputs.push(input);
    inputsWrap.appendChild(input);
  }

  li.appendChild(inputsWrap);

  const del = document.createElement('button');
  del.className = 'delete-button';
  del.type = 'button';
  del.textContent = '취소';
  del.addEventListener('click', () => {
    li.remove();
    clearStatus();
  });
  li.appendChild(del);

  $('tool-list').appendChild(li);

  // (도구, 칸) 위치별로 연결: scoreInputs[ti] = 기존 기능 점수, scoreInputs[tools+ti] = 새 기능 점수.
  const existing = getFeatures();
  const nTools = state.tools.length;
  const cell = (ti, kind) => scoreInputs[kind === 'new' ? nTools + ti : ti];

  const commit = () => {
    const fname = nameInput.value.trim();
    if (fname === '') {
      showStatus('기능 이름은 비울 수 없습니다.');
      return;
    }
    if (getFeatures().includes(fname)) {
      showStatus(`"${fname}" 기능이 이미 있습니다. 다른 이름으로 다시 입력해 주세요.`);
      return;
    }
    try {
    // 범위를 벗어나는 값이 있으면 아무것도 바꾸지 않고 입력 행을 유지한다.
    for (let ti = 0; ti < nTools; ti++) {
      const old = parseFloat(cell(ti, 'old').value);
      if (cell(ti, 'old').value !== '' && (!Number.isFinite(old) || old < 0 || old > 100)) {
        showStatus(`"${state.tools[ti].name}" 도구의 점수는 0~100 사이의 숫자여야 합니다.`);
        throw new RangeError();
      }
      if (cell(ti, 'new').value !== '') {
        const v = parseFloat(cell(ti, 'new').value);
        if (!Number.isFinite(v) || v < 0 || v > 100) {
          showStatus(`"${state.tools[ti].name}" 도구의 "${fname}" 점수는 0~100 사이의 숫자여야 합니다.`);
          throw new RangeError();
        }
      }
    }
    state.tools.forEach((tool, ti) => {
      if (cell(ti, 'old').value !== '') {
        tool.scores[existing[0]] = parseFloat(cell(ti, 'old').value);
      }
      if (cell(ti, 'new').value !== '') {
        tool.scores[fname] = parseFloat(cell(ti, 'new').value);
      }
    });
  } catch {
    // 범위를 벗어나는 값은 반영하지 않은 채 입력 행을 유지한다.
    return;
  }
  li.remove();
  afterDataChange();
  clearStatus();
};

  const cancel = () => {
    li.remove();
    clearStatus();
  };

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  });
  inputsWrap.querySelectorAll('.score-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
  });
  del.addEventListener('click', cancel);

  nameInput.focus();
}

// ---------- 내보내기 ----------

function exportJson() {
  if (state.tools.length < 2) {
    showStatus('내보내려면 최소 2개의 도구가 필요합니다.');
    clearSummary();
    return;
  }
  try {
    compareFeatures(state.tools);
  } catch (err) {
    showStatus(err instanceof RangeError ? err.message : '데이터를 확인해 주세요.');
    clearSummary();
    return;
  }
  const blob = new Blob([JSON.stringify(state.tools)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'comparison.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  clearStatus();
}

// ---------- 초기화 (브라우저에서만 실행) ----------

if (typeof document !== 'undefined') {
  $('add-tool-button').addEventListener('click', addTool);
  $('add-feature-button').addEventListener('click', addFeature);
  $('compare-button').addEventListener('click', runCompare);
  $('export-button').addEventListener('click', exportJson);
  $('example-button').addEventListener('click', loadExample);
  $('reset-button').addEventListener('click', () => {
    state.tools = [];
    state.compared = false;
    afterDataChange();
    showStatus('모든 데이터를 지웠습니다. 도구를 추가하거나 예시로 해 보세요.', 'good');
  });
  // 인기 모델 프리셋: 클릭 시 해당 도구를 바로 추가한다.
  PRESET_TOOLS.forEach((preset) => {
    const button = $(preset.id);
    if (!button) return;
    button.addEventListener('click', () => addPresetTool(preset, button));
  });
  // 로컬·자체 모델 직접 입력: Enter 키로 추가.
  $('custom-model-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomModel();
  });
  $('add-custom-model-button').addEventListener('click', addCustomModel);
  // 앱 이름·설명 바로 아래에 3단계 안내 + 인기 모델 프리셋, 그 뒤에 레이더 차트·
  // 비교 요약, 그 뒤에 점수 입력 구역을 배치해, 스크롤 전 첫 화면에서 시작
  // 방법과 결과가 함께 보이고 바로 쓸 수 있게 한다.
  layout();
  syncSteps();
}
