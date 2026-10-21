// AI 모델 시장 판 — UI 계층 (브라우저 전용, <script type="module"> 로 로드).
// 순수 로직은 app.js 의 buildModelBoard. DOM, localStorage, fetch 만 사용.
import { buildModelBoard } from './app.js';

const FAV_KEY = 'ai-market-board:favorites';
const DATA_FILES = [
  'data/hf_models.json',
  'data/openrouter_models.json',
  'data/hf_models.meta.json',
  'data/openrouter_models.meta.json',
];

// '예시로 해 보기' 버튼이 쓰는 현실적 예시 데이터 (실제 data/ 파일과 같은 구조)
const EXAMPLE = {
  hf: [
    { id: 'meta-llama/Llama-3.1-8B-Instruct', likes: 1200, trendingScore: 31, downloads: 1234567, safetensors: { total: 8030264448 } },
    { id: 'openbmb/MiniCPM5-2B', likes: 1782, trendingScore: 43, downloads: 1282153, safetensors: { total: 2516756480 } },
    { id: 'mistralai/Mistral-7B-v0.1', likes: 900, trendingScore: 5, downloads: 880000, safetensors: { total: 7253004288 } },
    { id: 'Qwen/Qwen2.5-14B-Instruct', likes: 540, trendingScore: 88, downloads: 2103400, safetensors: { total: 14533435392 } },
    { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', likes: 862, trendingScore: 120, downloads: 3301200, safetensors: { total: 7617976320 } },
    { id: 'google/gemma-2-2b-it', likes: 730, trendingScore: 64, downloads: 1800220, safetensors: { total: 2541523456 } },
  ],
  openrouter: {
    data: [
      { id: 'meta-llama/llama-3.1-8b-instruct', context_length: 131072, pricing: { prompt: '0.0000002', completion: '0.0000008' } },
      { id: 'openbmb/minicpm5-2b', context_length: 32768, pricing: { prompt: 0, completion: 0 } },
      { id: 'qwen/qwen-2.5-14b-instruct', context_length: 32768, pricing: { prompt: '0.0000001', completion: '0.0000003' } },
      { id: 'mistralai/mistral-7b-instruct', context_length: 32000, pricing: { prompt: '0.00000025', completion: '0.00000100' } },
      { id: 'openai/gpt-4o-mini', context_length: 128000, pricing: { prompt: '0.00000015', completion: '0.00000060' } },
      { id: 'google/gemini-2.0-flash-001', context_length: 1048576, pricing: { prompt: '0.00000010', completion: '0.00000040' } },
    ],
  },
  hfMeta: { fetched_at: '2026-10-17T17:33:36', terms: '공개 API(키 없음), Hugging Face 이용약관', name: 'Hugging Face 모델 목록' },
  orMeta: { fetched_at: '2026-10-17T17:33:36', terms: '공개 목록(키 없음)', name: 'OpenRouter 모델·가격 목록' },
};

// 표에 한 번에 보여주는 행 수: 전체를 펼치면 영문 모델 이름이 화면을 차지하므로
// 기본은 상위 15개만 렌더하고, '모두 표시' 버튼으로 전체를 볼 수 있게 한다.
const BOARD_RENDER_CAP = 15;

const $ = (id) => document.getElementById(id);
const els = {
  memory: $('memory-input'),
  bits: $('bits-select'),
  table: $('board-table'),
  tableNote: document.querySelector('.table-note'), // 표 밖 고정 컨테이너 (index.html)
  summary: $('summary-line'),
  trend: $('trend-chart'),
  price: $('price-chart'),
  favList: $('fav-list'),
  favCount: $('fav-count'),
  search: $('search-input'),
  compareList: $('compare-list'),
  compare: $('compare-panel'),
  meta: $('data-meta'),
  status: $('app-status'),
  sampleBanner: $('sample-banner'),
};
const tbody = els.table.querySelector('tbody');

let result = null; // buildModelBoard 결과
let showingExample = false; // '예시로 해 보기' 모드 여부
let trendChart = null;
let priceChart = null;
let favorites = loadFavorites();

// ---------- 보조 서술 (화면 문구용 순수 계산) ----------
const round1 = (x) => String(Math.round(x * 10) / 10); // 반올림(반上去) 1자리
const fmtParams = (p) => (p == null ? '알 수 없음' : round1(p / 1e9) + 'B');
const fmtContext = (c) => (c == null ? '—' : round1(c / 1000) + 'K');
const fmtPrice = (p) => (p == null ? '—' : '$' + p);

function memoryEstimateGB(parameters, bits) {
  if (parameters == null) return null;
  return Math.round((parameters * (bits / 8) * 1.2) / (1024 ** 3) * 10) / 10;
}
const currentBits = () => Number(els.bits.value) || 8;
const currentMemory = () => Number(els.memory.value) || 0;

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (raw == null) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === 'string')) return [];
    return arr;
  } catch { return []; }
}
function saveFavorites() {
  try { window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch { /* 저장 실패 무시 */ }
}

const nameOf = (r) => (r.hf ? r.hf.name : r.openrouter ? r.openrouter.name : r.family);
// 화면용 이름: org/ 접두를 뺀 저장소 이름만 (가족 키와 겹치는 org는 반복되므로). ':alias' 도 생략.
const repoNameOf = (r) => {
  const n = String(nameOf(r));
  const s = n.includes('/') ? n.split('/').slice(1).join('/') : n;
  return s.replace(/:.*$/, '');
};
const paramsOf = (r) => (r.hf ? r.hf.parameters : null);
const priceOf = (r) => (r.openrouter ? r.openrouter.pricePerMillion : null);
const contextOf = (r) => (r.openrouter ? r.openrouter.contextLength : null);
const trendOf = (r) => (r.hf && typeof r.hf.trendingScore === 'number' && isFinite(r.hf.trendingScore) ? r.hf.trendingScore : null);

// ---------- 보드 렌더 ----------
// 검색으로 걸러진 행 전체를 유지(비교·즐겨찾기 참조는 이 배열을 쓴다).
// 정렬 등급: ① HF+OpenRouter 둘 다 있는(짝 지어진) 행 → ② 파라미터가 있는 행 → ③ 나머지.
// API 가격·파라미터가 없는 행이 뒤로 내려가, 첫 화면은 "로컬 vs 클라우드" 핵심부터 보인다.
// buildModelBoard 는 건드리지 않고(SPEC 고정) 여기에만 정렬을 덧씌운다.
// Array.prototype.sort 는 안정 정렬이므로 같은 등급 안에서는 원래 순서가 보존된다.
const boardRank = (r) => (r.hf && r.openrouter ? 0 : paramsOf(r) != null ? 1 : 2);
function boardOrder() {
  if (!result) return [];
  return result.rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => boardRank(a.r) - boardRank(b.r) || a.i - b.i)
    .map((x) => x.r);
}

function visibleRows() {
  if (!result) return [];
  const q = els.search.value.trim().toLowerCase();
  if (!q) return boardOrder();
  return boardOrder().filter((r) => r.family.toLowerCase().includes(q));
}
// 실제로 <tr>으로 렌더할 행: 기본은 상위 BOARD_RENDER_CAP 개, '모두 표시'를 누르면 전체
function renderedRows() {
  const rows = visibleRows();
  return showAll ? rows : rows.slice(0, BOARD_RENDER_CAP);
}

let showAll = false;
let showAllButton = null;

function renderTable() {
  const bits = currentBits();
  const mem = currentMemory();
  const all = visibleRows();
  const rows = renderedRows();
  // 추세 막대 폭은 '보여지는 행' 중 최대 추세 점수 기준으로 결정(SPEC)
  const maxTrend = rows.reduce((m, r) => { const t = trendOf(r); return t != null ? Math.max(m, t) : m; }, 0);

  tbody.textContent = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.dataset.family = r.family;

    const tdFam = document.createElement('td');
    tdFam.dataset.role = 'family';
    tdFam.title = '가족: ' + nameOf(r) + ' — 클릭해 즐겨찾기 추가/제거'; // 가족 키(영문)는 툴팁으로만 노출
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = favorites.includes(r.family) ? '★' : '☆';
    tdFam.appendChild(star);
    tr.appendChild(tdFam);

    const tdModel = document.createElement('td');
    tdModel.textContent = repoNameOf(r); // 실제 모델 이름을 화면에 표시 (org 접두는 생략)
    tdModel.title = nameOf(r); // 원본 전체 이름을 툴팁으로
    tr.appendChild(tdModel);

    const tdParams = document.createElement('td');
    tdParams.textContent = fmtParams(paramsOf(r));
    tr.appendChild(tdParams);

    // 추세: ds-bar(트랙)+채움 막대로 표시(점수 값은 넣지 않음), trendingScore가 null이면 빈 셀
    const tdTrend = document.createElement('td');
    tdTrend.className = 'cell-trend';
    const ts = trendOf(r);
    if (ts != null) {
      const bar = document.createElement('div');
      bar.className = 'ds-bar bar';
      const fill = document.createElement('span');
      fill.style.width = maxTrend > 0 ? ((ts / maxTrend) * 100).toFixed(1) + '%' : '0%';
      bar.appendChild(fill);
      tdTrend.appendChild(bar);
    }
    tr.appendChild(tdTrend);

    const est = memoryEstimateGB(paramsOf(r), bits);
    const tdMem = document.createElement('td');
    tdMem.dataset.role = 'mem';
    tdMem.textContent = est == null ? '알 수 없음' : est + ' GB';
    tr.appendChild(tdMem);

    const tdCan = document.createElement('td');
    tdCan.dataset.role = 'can';
    tdCan.className = 'can-cell ' + (est == null ? 'can-unknown' : (est <= mem ? 'can-yes' : 'can-no'));
    // 알약(필)은 td 배경이 아니라 안쪽 텍스트만 감싸, 셀 경계·접선색은 유지
    const canPill = document.createElement('span');
    canPill.className = est == null ? 'can-unknown' : (est <= mem ? 'can-yes' : 'can-no');
    canPill.textContent = est == null ? '알 수 없음' : (est <= mem ? '가능' : '불가');
    tdCan.appendChild(canPill);
    tr.appendChild(tdCan);

    const tdPrice = document.createElement('td');
    tdPrice.textContent = fmtPrice(priceOf(r));
    tr.appendChild(tdPrice);

    const tdCtx = document.createElement('td');
    tdCtx.textContent = fmtContext(contextOf(r));
    tr.appendChild(tdCtx);

    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-role="family"]')) toggleFavorite(r.family);
    });
    tbody.appendChild(tr);
  }

  // 검색 결과 0개: 빈 표보다 한국어 안내 문구로 빈 공간을 채운다
  if (!rows.length && els.search.value.trim()) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = '해당하는 모델이 없습니다. 다른 키워드로 검색해 보세요.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // 표 아래에 "N개 중 M개 표시" 안내 + '모두 표시' 버튼 (한글만)
  renderTableNote(all.length, rows.length);
}

// 'N개 중 M개 표시' 문구와 모두 표시/접기 토글 — <table> 밖의 독립 블록에 표시
// (표 안에 넣으면 셀 폭에 갇혀 한두 글자씩 세로 줄바꿈됨)
function renderTableNote(total, shown) {
  if (!els.tableNote) return;
  els.tableNote.textContent = '';
  if (!total) return;
  const span = document.createElement('span');
  span.className = 'note-text';
  span.textContent = showAll
    ? '모델 ' + total + '개 모두 표시 중'
    : '모델 ' + total + '개 중 ' + shown + '개 표시';
  els.tableNote.appendChild(span);
  if (!showAllButton) {
    showAllButton = document.createElement('button');
    showAllButton.className = 'link';
    showAllButton.type = 'button';
    showAllButton.addEventListener('click', () => {
      showAll = !showAll;
      renderTable();
    });
    els.tableNote.appendChild(showAllButton);
  }
  showAllButton.textContent = showAll ? '접기' : '모두 표시';
}

function renderSummary() {
  if (!result) { els.summary.textContent = ''; return; }
  els.summary.textContent =
    '모델 ' + result.rows.length + '개 · 짝 ' + result.pairedCount + '개 · 짝 안 됨 ' + result.unpairedCount + '개';
}

// RAM·양자만 바뀐 경우: 두 셀과 요약만 재계산(경량)
function renderLive() {
  if (!result) return;
  const bits = currentBits();
  const mem = currentMemory();
  for (const tr of tbody.rows) {
    const row = result.rows.find((r) => r.family === tr.dataset.family);
    if (!row) continue;
    const est = memoryEstimateGB(paramsOf(row), bits);
    const tdMem = tr.querySelector('[data-role="mem"]');
    tdMem.textContent = est == null ? '알 수 없음' : est + ' GB';
    const tdCan = tr.querySelector('[data-role="can"]');
    tdCan.className = 'can-cell ' + (est == null ? 'can-unknown' : (est <= mem ? 'can-yes' : 'can-no'));
    const canPill = tdCan.firstChild;
    if (canPill) {
      canPill.className = est == null ? 'can-unknown' : (est <= mem ? 'can-yes' : 'can-no');
      canPill.textContent = est == null ? '알 수 없음' : (est <= mem ? '가능' : '불가');
    }
  }
  renderSummary();
}

// ---------- 차트 ----------
// 폭에 맞춰 차트 축 글자 개수를 조절: 390px 같은 좁은 화면에서 레이블이 겹치지 않게
const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;
// 이름이 길어 축에 다 못 적히면 중간만 남기고 양끝을 생략: 'llama318binstruct' → 'llama…instruct'
const shortLabel = (s, max) => {
  if (max < 8) return '';
  const str = String(s);
  if (str.length <= max) return str;
  const half = Math.max(2, Math.floor((max - 3) / 2));
  return str.slice(0, half) + '…' + str.slice(-half);
};
// 좁은 화면(390px)에서 숫자 축이 서로 닿아 읽히지 않도록:
// 회전 + 글자 생략(4자 이하) + 개수 제한(최대 4개) 세 가지를 함께 쓴다.
const narrowNumTick = (v) => {
  const str = String(v);
  return str.length > 4 ? str.slice(0, 4) + '…' : str;
};

function renderCharts() {
  if (typeof Chart === 'undefined' || !result) return;
  if (trendChart) trendChart.destroy();
  if (priceChart) priceChart.destroy();

  // 추세 차트: 가로 막대(indexAxis:'y')로 상위 10개. y축에 이름이 가로로 놓여
  // 세로로 회전된 라벨이 사라지고, 막대 길이 비교도 한눈에 된다.
  const trendData = result.rows
    .map((r) => ({ family: r.family, score: trendOf(r) }))
    .filter((d) => d.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  trendChart = new Chart(els.trend, {
    type: 'bar',
    data: {
      labels: trendData.map((d) => shortLabel(d.family, isNarrow() ? 12 : 22)),
      datasets: [{ label: '추세 점수', data: trendData.map((d) => d.score), backgroundColor: '#2563eb' }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          // 축 라벨은 줄여도 툴팁에는 가족 전체 이름을 보여 준다
          callbacks: { label: (ctx) => ' 추세 점수 ' + ctx.parsed.x + ' · ' + trendData[ctx.dataIndex].family },
        },
      },
      scales: {
        // x축(점수): 좁으면 개수 4개 + 4자 생략 + 45° 회전 → 390px에서 축 글자가 안 겹침
        x: { ticks: { maxTicksLimit: isNarrow() ? 4 : 8, maxRotation: isNarrow() ? 45 : 0, minRotation: 0, callback: isNarrow() ? (v) => narrowNumTick(v) : undefined } },
        // y축(이름): 이미 shortLabel로 생략 + 개수 제한(좁으면 6개)
        y: { ticks: { maxTicksLimit: isNarrow() ? 6 : 10, autoSkip: true } },
      },
    },
  });

  // 가격 차트: 무료(0달러) 모델은 로그 축에 못 올리므로 제외하고, x·y 둘 다 로그로
  // 컨텍스트·가격이 0 근처에 몰려 보이는 것을 풀어 준다. 점에 올리면 모델 이름이 보인다.
  const priceData = result.rows
    .filter((r) => r.openrouter && r.openrouter.contextLength != null && r.openrouter.pricePerMillion != null && r.openrouter.pricePerMillion > 0)
    .map((r) => ({ family: r.family, x: r.openrouter.contextLength, y: r.openrouter.pricePerMillion }));
  priceChart = new Chart(els.price, {
    type: 'scatter',
    data: {
      datasets: [{
        label: '가격 × 컨텍스트',
        data: priceData,
        pointLabel: priceData.map((d) => d.family),
        backgroundColor: '#0f766e',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ' ' + (ctx.raw && ctx.raw.family != null ? ctx.raw.family : priceData[ctx.dataIndex].family) },
        },
      },
      scales: {
        // x축(컨텍스트, 로그): 좁으면 개수 4개 + 4자 생략 + 45° 회전 → 390px에서 안 겹침
        x: {
          type: 'logarithmic',
          title: { display: true, text: '컨텍스트 (토큰, 로그)' },
          ticks: { maxTicksLimit: isNarrow() ? 4 : 10, maxRotation: isNarrow() ? 45 : 0, minRotation: 0, callback: isNarrow() ? (v) => narrowNumTick(v) : undefined },
        },
        // y축(가격, 로그): 좁으면 개수 4개 + 4자 생략 + 45° 회전, 축 제목은 숨김(좁아서 겹침)
        y: {
          type: 'logarithmic',
          title: { display: !isNarrow(), text: 'API 가격 (1M 토큰당 $, 로그)' },
          ticks: { maxTicksLimit: isNarrow() ? 4 : 8, maxRotation: isNarrow() ? 45 : 0, minRotation: 0, callback: isNarrow() ? (v) => narrowNumTick(v) : undefined },
        },
      },
    },
  });
}

// ---------- 즐겨찾기·비교 ----------
function renderFavorites() {
  els.favCount.textContent = String(favorites.length);
  els.favList.textContent = '';
  for (const fam of favorites) {
    const li = document.createElement('li');
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '★';
    li.appendChild(star);
    const span = document.createElement('span');
    span.textContent = fam;
    li.appendChild(span);
    const del = document.createElement('button');
    del.className = 'link';
    del.type = 'button';
    del.textContent = '제거';
    del.addEventListener('click', () => toggleFavorite(fam));
    li.appendChild(del);
    els.favList.appendChild(li);
  }
  const selected = favorites.slice(-3); // 비교 패널은 최대 3개(4번째를 누르면 가장 오래된 것이 빠짐)
  els.compareList.textContent = '';
  for (const fam of selected) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = fam;
    li.appendChild(span);
    els.compareList.appendChild(li);
  }
  renderComparePanel(selected);
}

function renderComparePanel(selected) {
  els.compare.textContent = '';
  if (!selected.length || !result) return;
  const rows = selected
    .map((fam) => result.rows.find((r) => r.family === fam))
    .filter(Boolean);
  if (!rows.length) return;

  const table = document.createElement('table');
  table.className = 'compare-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const thName = document.createElement('th');
  thName.textContent = '구분';
  hr.appendChild(thName);
  for (const r of rows) {
    const th = document.createElement('th');
    th.textContent = r.family;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const bits = currentBits();
  const mem = currentMemory();
  const body = document.createElement('tbody');
  const mkRow = (label, fn) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    tr.appendChild(th);
    for (const r of rows) {
      const td = document.createElement('td');
      td.textContent = fn(r);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  };
  mkRow('로컬 메모리', (r) => {
    const est = memoryEstimateGB(paramsOf(r), bits);
    return est == null ? '알 수 없음' : est + ' GB';
  });
  mkRow('로컬 가능', (r) => {
    const est = memoryEstimateGB(paramsOf(r), bits);
    return est == null ? '알 수 없음' : (est <= mem ? '가능' : '불가');
  });
  mkRow('API 가격', (r) => fmtPrice(priceOf(r)));
  mkRow('컨텍스트', (r) => fmtContext(contextOf(r)));
  table.appendChild(body);
  els.compare.appendChild(table);
}

function toggleFavorite(fam) {
  const i = favorites.indexOf(fam);
  if (i !== -1) {
    favorites.splice(i, 1);
  } else {
    favorites.push(fam);
    if (favorites.length > 3) favorites.shift(); // 4번째는 가장 오래된 것을 교체
  }
  saveFavorites();
  renderFavorites();
  for (const tr of tbody.rows) {
    const star = tr.querySelector('.star');
    if (star && tr.dataset.family === fam) star.textContent = favorites.includes(fam) ? '★' : '☆';
  }
}

// ---------- 데이터 로딩 ----------
async function loadFile(file) {
  const res = await fetch(file);
  if (!res.ok) throw new Error(file);
  return res.json();
}

async function loadAll() {
  const [hfRows, openrouterData, hfMeta, orMeta] = await Promise.all(DATA_FILES.map(loadFile));
  showingExample = false;
  applyData(hfRows, openrouterData, hfMeta, orMeta);
}

function applyData(hfRows, openrouterData, hfMeta, orMeta) {
  result = buildModelBoard(hfRows, openrouterData);
  renderBanner();
  const parts = [metaLine(hfMeta, 'Hugging Face'), metaLine(orMeta, 'OpenRouter')].filter(Boolean);
  els.meta.textContent = parts.join('  ');
  els.status.textContent = '';
  renderFavorites();
  renderTable();
  renderSummary();
  renderCharts();
}

// 예시 모드 배너: 실제 데이터와 혼동하지 않도록 상단에 알림 + '실제 데이터로 돌아가기'
function renderBanner() {
  els.sampleBanner.hidden = !showingExample;
  els.sampleBanner.textContent = showingExample
    ? '예시 데이터를 보고 있습니다. '
    : '';
  if (showingExample) {
    const btn = document.createElement('button');
    btn.className = 'link';
    btn.type = 'button';
    btn.textContent = '실제 데이터로 돌아가기';
    btn.addEventListener('click', () => {
      showingExample = false;
      renderBanner();
      loadAll().catch((err) => {
        clearBoard();
        els.status.textContent = '데이터 파일을 불러올 수 없습니다: ' + fileNameOf(err);
      });
    });
    els.sampleBanner.appendChild(btn);
  }
}

function metaLine(meta) {
  if (!meta || typeof meta !== 'object') return null;
  let date = '알 수 없음';
  if (typeof meta.fetched_at === 'string' && meta.fetched_at.length >= 16) {
    date = meta.fetched_at.slice(0, 16).replace('T', ' ');
  }
  const parts = ['데이터 기준: ' + date];
  if (meta.terms) parts.push(meta.terms); // 출처 이름·이용 조건은 파일 값 그대로 표시
  return parts.filter(Boolean).join(' · ');
}

function clearBoard() {
  result = null;
  showAll = false;
  tbody.textContent = '';
  els.summary.textContent = '';
  els.meta.textContent = '';
  if (els.tableNote) els.tableNote.textContent = '';
  if (els.sampleBanner) els.sampleBanner.hidden = true;
  if (trendChart) { trendChart.destroy(); trendChart = null; }
  if (priceChart) { priceChart.destroy(); priceChart = null; }
}

function fileNameOf(err) {
  const msg = String(err && err.message ? err.message : err);
  const m = msg.match(/(data\/[A-Za-z0-9_.\-]+\.json)/);
  if (m) return m[1];
  for (const f of DATA_FILES) if (msg.includes(f)) return f;
  return '알 수 없음';
}

// ---------- 초기화 ----------
els.memory.addEventListener('input', renderLive);
els.bits.addEventListener('change', renderLive);
els.search.addEventListener('input', renderTable);

// 화면 폭이 바뀌면(데스크톱 ↔ 휴대폰) 차트 축 글자 개수·회전을 다시 계산
if (typeof window.matchMedia === 'function') {
  window.matchMedia('(max-width: 640px)').addEventListener('change', () => { if (result) renderCharts(); });
}

$('example-button').addEventListener('click', () => {
  applyExample();
});

// '예시로 해 보기' 로직 — 버튼 클릭과 동일한 경로를 재사용한다(자동화 점검에서도 같은 경로)
function applyExample() {
  try {
    showingExample = true;
    applyData(EXAMPLE.hf, EXAMPLE.openrouter, EXAMPLE.hfMeta, EXAMPLE.orMeta);
  } catch (err) {
    showingExample = false;
    renderBanner();
    clearBoard();
    els.status.textContent = '예시 데이터를 처리할 수 없습니다: ' + String(err.message || err);
  }
}

$('refresh-button').addEventListener('click', async () => {
  showingExample = false;
  renderBanner();
  els.status.textContent = '데이터 파일을 다시 불러오는 중입니다…';
  try {
    await loadAll();
  } catch (err) {
    clearBoard();
    els.status.textContent = '데이터 파일을 불러올 수 없습니다: ' + fileNameOf(err);
  }
});

$('reset-button').addEventListener('click', () => {
  try { window.localStorage.removeItem(FAV_KEY); } catch { /* 무시 */ }
  favorites = [];
  els.search.value = '';
  els.memory.value = '48';
  els.bits.value = '8';
  els.status.textContent = '';
  renderFavorites();
  renderTable();
  renderSummary();
});

loadAll().catch((err) => {
  clearBoard();
  els.status.textContent = '데이터 파일을 불러올 수 없습니다: ' + fileNameOf(err);
});

// 브라우저에서만: 자동화(디자인 대비 점검)가 클릭 없이 예시 경로를 재사용할 수 있게 노출
if (typeof window !== 'undefined') window.applyExample = applyExample;
