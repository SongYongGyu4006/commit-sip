// AI 모델 시장 판 — 인터페이스
// 화면 구조: 띠 → 답 카드(.ds-answer) → 조건(RAM·양자·검색) → 모델 목록(.ds-list) → 차트 → 즐겨찾기·비교
// 화면에는 ds- 클래스(스튜디오 디자인 시스템)를 쓴다. 색은 전부 디자인 토큰.

const DEFAULT_MEMORY = 48;
const DEFAULT_BITS = '8';
const MAX_FAV = 3;

// ---------- 상태 ----------
let state = {
  memoryGB: DEFAULT_MEMORY,
  bits: Number(DEFAULT_BITS),
  search: '',
  model: '', // 선택한 모델(상세)
  sort: 'trend', // trend | local | price | context
  data: null,
  favorites: new Set(),
  compare: [],
  sampleMode: false,
  expanded: new Set(), // 열려 있는 가족 키
};

let trendChart = null;
let priceChart = null;

// ---------- 헬퍼 ----------
const $ = (id) => document.getElementById(id);
const els = {};

function initEls() {
  for (const id of [
    'data-meta', 'sample-banner', 'answer-num', 'answer-unit', 'answer-text', 'answer-total', 'answer-priced', 'answer-top',
    'board-title', 'memory-input', 'bits-select', 'search-input', 'example-button', 'refresh-button', 'reset-button',
    'board', 'board-table', 'summary-line', 'table-note', 'list-toggle', 'price-chart', 'trend-chart',
    'fav-count', 'fav-empty', 'fav-list', 'compare-lead', 'compare-lead-count', 'compare-list', 'compare-panel', 'app-status',
  ]) {
    els[id] = $(id);
  }
}

function fmtGB(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return v >= 10 ? Math.round(v).toString() : v.toFixed(1);
}

function fmtPrice(perM) {
  if (perM == null || !Number.isFinite(perM)) return '—';
  if (perM === 0) return '무료';
  if (perM < 1) return '$' + perM.toFixed(2);
  if (perM < 10) return '$' + perM.toFixed(1);
  return '$' + Math.round(perM);
}

function fmtPricePerMkTok(p) {
  // 데이터 값은 1M 토큰당 달러.
  return fmtPrice(p);
}

function fmtTokens(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}

function fmtParams(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const b = n / 1e9;
  if (b >= 1) return b >= 10 ? b.toFixed(0) + 'B' : b.toFixed(1).replace(/\.0$/, '') + 'B';
  const m = n / 1e6;
  return m >= 10 ? m.toFixed(0) + 'M' : m.toFixed(1).replace(/\.0$/, '') + 'M';
}

// ---------- 데이터 ----------
function fetchJSON(url, options = {}) {
  return fetch(url, options).then((r) => {
    if (!r.ok) throw new Error(`데이터 가져오기 실패: ${r.status}`);
    return r.json();
  });
}

async function loadAppData(sample = false) {
  // samples/ 폴더의 실제 예시 파일 이름(없던 파일 3개를 읽다 404가 되던 회귀를 막는다)
  const files = sample
    ? ['samples/openrouter_models.sample.json', 'samples/hf_models.sample.json']
    : ['data/openrouter_models.json', 'data/hf_models.json'];
  const urls = files.map((f) => `${f}?v=${state.data ? Date.now() : '1'}`);
  const [openrouter, hf] = await Promise.all(urls.map((u) => fetchJSON(u, { cache: 'no-store' })));
  return { openrouter, hf };
}

// ---------- 파이프라인 ----------
function normId(id) {
  let s = String(id || '').toLowerCase();
  if (s.includes('/')) s = s.split('/').pop();
  if (s.includes(':')) s = s.split(':').slice(1).join(':');
  return s.replace(/[^a-z0-9]/g, '');
}

function displayName(family) {
  if (!family) return '알 수 없음';
  return family.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// 아바타 문자: 원문 이름의 초기 2글자(대문자). 한글 규칙: 제목 자리는 '모델 N' 순번이 대신한다.
function famBestInitials(name) {
  const repo = String(name).split('/').pop() || '';
  const letters = (repo.match(/[A-Za-z]/g) || []).slice(0, 2).join('').toUpperCase();
  return letters || '?';
}

function familyKey(modelId) {
  return String(modelId || '').split('/')[0];
}

// 데이터 기준 시점: Unix 초(epoch)를 'YYYY.MM.DD' 로, 아니면 '오늘'.
function dataUpdatedLabel(openrouterData) {
  const created = openrouterData?.data?.[0]?.created;
  if (typeof created === 'number' && Number.isFinite(created) && created > 1e11) {
    const dt = new Date(created * 1000);
    if (Number.isNaN(dt.getTime())) return '오늘';
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
  }
  return '오늘';
}

// OpenRouter + HuggingFace를 같은 이름(예: 'qwen/qwen3')으로 묶어 통합 모델 리스트를 만든다.
function buildUnifiedModels(openrouterData, hfData) {
  const map = new Map();
  const put = (key, val) => {
    if (!map.has(key)) map.set(key, {});
    Object.assign(map.get(key), val);
  };

  for (const row of openrouterData.data || []) {
    const fam = row.id || '';
    const key = familyKey(fam);
    const pricing = row.pricing || {};
    const perM = Number.isFinite(pricing.prompt) && Number.isFinite(pricing.completion)
      ? (pricing.prompt + pricing.completion) * 1e6
      : null;
    put(key, {
      name: fam,
      pricePerMTok: perM,
      ctxTokens: Number.isFinite(row.context_length) ? row.context_length : null,
      trend: null,
      source: 'openrouter',
    });
  }

  for (const row of hfData) {
    const fam = row.id || '';
    const key = familyKey(fam);
    const st = (row.safetensors || {}).total;
    const params = st && st > 0 ? Math.round(st / 2) : null; // 8비트 기준(양자는 화면에서 바꿈)
    const trend = Number.isFinite(row.trendingScore) && row.trendingScore > 0 ? row.trendingScore : null;
    const existing = map.get(key);
    put(key, {
      name: fam,
      source: existing ? 'both' : 'hf',
      params: existing && existing.params != null ? existing.params : params,
    });
    if (trend != null) {
      map.get(key).trend = Math.max(map.get(key).trend || 0, trend);
    }
  }

  return [...map.values()].filter((m) => m.name);
}

function estimateMemGB(model, bits) {
  if (!model.params) return null;
  const bytes = model.params * (Number(bits) / 8) * 1.2; // 가중치 + 오버헤드 20%
  return bytes / (1024 ** 3);
}

// ---------- 필터·정렬 ----------
function visibleModels() {
  if (!state.data) return [];
  const q = state.search.trim().toLowerCase();
  let rows = state.data.models.slice();
  if (q) {
    rows = rows.filter((m) => m.name.toLowerCase().includes(q) || displayName(m.name).toLowerCase().includes(q));
  }
  const s = state.sort;
  const canRun = (m) => {
    const mem = estimateMemGB(m, state.bits);
    return mem != null && mem <= state.memoryGB ? 1 : 0;
  };
  rows.sort((a, b) => {
    if (s === 'trend') return (b.trend || 0) - (a.trend || 0) || a.name.localeCompare(b.name);
    if (s === 'local') return (b.trend || 0) - (a.trend || 0);
    if (s === 'price') return (a.pricePerMTok ?? Infinity) - (b.pricePerMTok ?? Infinity);
    if (s === 'context') return (b.ctxTokens || 0) - (a.ctxTokens || 0);
    return 0;
  });
  return rows;
}

// 가족 그룹: 같은 이름(예: qwen/qwen3)의 여러 버전을 하나로.
function buildFamilies(models) {
  const map = new Map();
  for (const m of models) {
    const key = familyKey(m.name);
    if (!map.has(key)) map.set(key, { key, models: [], best: null, bestScore: -1 });
    const fam = map.get(key);
    fam.models.push(m);
    const mem = estimateMemGB(m, state.bits);
    const score = (m.trend || 0) * 10 + (mem != null && mem <= state.memoryGB ? 1 : 0);
    if (score > fam.bestScore) {
      fam.best = m;
      fam.bestScore = score;
    }
  }
  return [...map.values()];
}

function canRunLabel(m) {
  const mem = estimateMemGB(m, state.bits);
  if (mem == null) return { cls: 'can-unknown', text: '알 수 없음' };
  if (mem <= state.memoryGB) return { cls: 'can-yes', text: '가능' };
  return { cls: 'can-no', text: '불가' };
}

// ---------- 렌더 ----------
function render() {
  if (!state.data) return;
  renderDataMeta();
  renderAnswer();
  renderBoard();
  renderFavs();
  renderCharts();
}

function renderDataMeta() {
  const d = state.data;
  const sources = new Set(d.models.map((m) => m.source));
  const src = sources.has('both') ? 'HuggingFace·OpenRouter' : [...sources].join('·');
  els['data-meta'].textContent = `데이터: ${src} · ${d.models.length}개 모델 · 갱신 ${d.updated}`;
}

function renderAnswer() {
  const d = state.data;
  let total = 0, runnable = 0, priced = 0, top = null;
  for (const m of d.models) {
    const mem = estimateMemGB(m, state.bits);
    total++;
    if (mem != null && mem <= state.memoryGB) runnable++;
    if (m.pricePerMTok != null) priced++;
    if (!top || (m.trend || 0) > (top.trend || 0)) top = m;
  }
  els['answer-num'].textContent = String(runnable);
  els['answer-unit'].textContent = '개';
  els['answer-text'].textContent = `내 RAM ${state.memoryGB}GB · ${state.bits}비트로 실행할 수 있습니다.`;
  els['answer-total'].textContent = `${total}개`;
  els['answer-priced'].textContent = `${priced}개`;
  els['answer-top'].textContent = top ? '모델 1' : '—'; // 한글 규칙: 원문 이름은 툴팁으로만
  els['answer-top'].title = top ? top.name : '';
}

function renderBoard() {
  const tbody = els['board-table'].querySelector('tbody');
  tbody.textContent = '';
  const list = document.querySelector('.model-list');
  list.textContent = '';

  const models = visibleModels();
  const families = buildFamilies(models);

  // 요약 한 줄
  let runnable = 0, unknown = 0;
  for (const m of models) {
    const { text } = canRunLabel(m);
    if (text === '가능') runnable++;
    else if (text === '알 수 없음') unknown++;
  }
  els['summary-line'].textContent = models.length
    ? `${models.length}개 모델 중 로컬 ${runnable}개 실행 가능 · ${unknown}개 정보 없음`
    : '검색 결과 없음';

  // 목록 접기: 기본은 접고(첫 화면에 차트를 주기 위해), 결과가 12개 이하로 줄면 자동으로 펼친다.
  const boardList = els['board-list'];
  if (boardList) {
    const folded = boardList.classList.contains('fold');
    if (families.length <= 12) {
      boardList.classList.remove('fold');
    } else if (!state.search.trim()) {
      boardList.classList.add('fold');
    }
    if (els['list-toggle']) {
      els['list-toggle'].hidden = families.length <= 12;
      els['list-toggle'].textContent = boardList.classList.contains('fold')
        ? `전체 ${families.length}개 보기`
        : '접기';
    }
  }

  // 표(테이블) 행 — SPEC 의 고정 id·구조는 유지(화면에는 ds-list 가 메인)
  let famIdx = 0;
  for (const fam of families) {
    const tr = document.createElement('tr');
    tr.className = 'row';
    tr.dataset.model = fam.best.name;
    const star = state.favorites.has(fam.best.name) ? '★' : '☆';
    tr.innerHTML = `
      <td class="family-cell" title="가족: ${fam.models.length}개 버전을 하나로. ☆를 눌러 즐겨찾기">
        ${fam.models.length > 1 ? `<span class="family-count">${fam.models.length}</span>` : '—'}
      </td>
      <td class="model-cell" title="${fam.best.name}"><span class="star">${star}</span>모델 ${famIdx + 1}</td>
      <td class="num-cell">${fam.best.params ? fmtParams(fam.best.params) : '—'}</td>
      <td class="num-cell">${fam.best.trend ? fmtTokens(fam.best.trend) : '—'}</td>
      <td class="num-cell">${(() => { const m = estimateMemGB(fam.best, state.bits); return m ? fmtGB(m) : '—'; })()}</td>
      <td class="can-cell"><span class="pill ${canRunLabel(fam.best).cls}">${canRunLabel(fam.best).text}</span></td>
      <td class="num-cell">${fam.best.pricePerMTok != null ? fmtPrice(fam.best.pricePerMTok) : '—'}</td>
      <td class="num-cell">${fam.best.ctxTokens ? fmtTokens(fam.best.ctxTokens) : '—'}</td>
    `;
    tr.addEventListener('click', () => toggleFav(fam.best.name));
    tbody.appendChild(tr);
    famIdx++;
  }

  // 목록(주 화면) — .ds-list 구조: 아바타 + 이름 + 보조 정보 + 오른쪽 값
  for (const fam of families) {
    const star = state.favorites.has(fam.best.name) ? '★' : '☆';
    const mem = estimateMemGB(fam.best, state.bits);
    const can = canRunLabel(fam.best);
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    li.dataset.model = fam.best.name;
    li.title = fam.best.name; // 원문 이름은 툴팁으로만(한글 규칙)
    li.innerHTML = `
      <div class="ds-avatar" aria-hidden="true">${famBestInitials(fam.best.name)}</div>
      <div class="ds-list-main">
        <span class="star" data-role="fav" role="button" tabindex="0" aria-label="즐겨찾기">${star}</span>
        <b class="ds-list-title"><span class="model-name">모델 ${famIdx + 1}</span>${fam.models.length > 1 ? ` <span class="family-count">${fam.models.length}</span>` : ''}</b>
        <small class="ds-list-sub">
          ${fam.best.params ? `파라미터 ${fmtParams(fam.best.params)} · ` : ''}${fam.best.trend ? `추세 ${fmtTokens(fam.best.trend)} · ` : ''}
          ${fam.best.pricePerMTok != null ? `API ${fmtPrice(fam.best.pricePerMTok)}/1M` : 'API 가격 —'}
        </small>
      </div>
      <div class="ds-list-end">
        <span class="ds-list-amount">${mem ? `${fmtGB(mem)} GB` : '—'}</span>
        <span class="pill ${can.cls}">${can.text}</span>
      </div>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('[data-role="fav"]')) {
        toggleFav(fam.best.name);
      } else {
        e.preventDefault();
      }
    });
    li.querySelector('[data-role="fav"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(fam.best.name);
    });
    list.appendChild(li);
  }

  // 표 열 선택: 가족 수가 달라지면(검색 시) 표 열을 재계산
  const famCount = Math.max(1, families.length);
  const ths = els['board-table'].querySelectorAll('thead th');
  if (ths.length >= 2) {
    ths[1].style.width = `${Math.round((100 / famCount) * 0.6)}%`;
  }
}

function renderFavs() {
  const favs = [...state.favorites];
  els['fav-count'].textContent = String(favs.length);
  els['fav-empty'].hidden = favs.length > 0;
  els['compare-lead'].hidden = !favs.length;
  els['compare-lead-count'].textContent = String(Math.min(favs.length, MAX_FAV));

  els['fav-list'].textContent = '';
  let fi = 0;
  for (const name of favs) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="star" aria-hidden="true">★</span><span class="fav-name"></span>`;
    li.querySelector('.fav-name').textContent = `모델 ${++fi}`;
    li.title = name; // 원문 이름은 툴팁으로만
    els['fav-list'].appendChild(li);
  }

  els['compare-list'].textContent = '';
  const compare = state.compare.length ? state.compare : favs.slice(0, MAX_FAV);
  let ci = 0;
  for (const name of compare) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="star" aria-hidden="true">★</span><span class="fav-name"></span>`;
    li.querySelector('.fav-name').textContent = `모델 ${++ci}`;
    li.title = name;
    els['compare-list'].appendChild(li);
  }

  els['compare-panel'].textContent = '';
  if (favs.length >= 2) {
    const models = state.compare.map((n) => state.data.models.find((m) => m.name === n)).filter(Boolean);
    if (models.length >= 2) {
      const table = document.createElement('table');
      table.className = 'compare-table';
      let ri = 0;
      const rows = [
        ['모델', (m) => `모델 ${++ri}`],
        ['파라미터', (m) => (m.params ? fmtParams(m.params) : '—')],
        ['로컬 메모리', (m) => { const v = estimateMemGB(m, state.bits); return v ? `${fmtGB(v)}GB` : '—'; }],
        ['로컬 가능', (m) => canRunLabel(m).text],
        ['API 가격', (m) => (m.pricePerMTok != null ? `${fmtPrice(m.pricePerMTok)}/1M` : '—')],
        ['컨텍스트', (m) => (m.ctxTokens ? fmtTokens(m.ctxTokens) : '—')],
      ];
      table.innerHTML = `<thead><tr>${models.map((m) => `<th title="${m.name}">모델 ${models.indexOf(m) + 1}</th>`).join('')}</tr></thead>`;
      const tbody = document.createElement('tbody');
      for (const [label, fn] of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<th>${label}</th>${models.map((m) => `<td>${fn(m)}</td>`).join('')}`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      els['compare-panel'].appendChild(table);
    }
  }
}

// ---------- 차트 ----------
function themeColors() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    ink: dark ? '#e7e3d8' : '#1c1917',
    ink2: dark ? '#a8a29e' : '#57534e',
    line: dark ? '#3f3a35' : '#e7e2d9',
    accent: dark ? '#60a5fa' : '#2563eb',
    accent2: dark ? '#34d399' : '#059669',
  };
}

function renderCharts() {
  if (!state.data) return;
  const c = themeColors();
  const models = state.data.models;
  const local = models.filter((m) => {
    const mem = estimateMemGB(m, state.bits);
    return mem != null && mem <= state.memoryGB;
  });
  const localSet = new Set(local.map((m) => m.name));

  // 가격 × 컨텍스트 (로그 눈금)
  const price = models.filter((m) => m.pricePerMTok != null && m.ctxTokens != null && m.trend != null);
  priceChart = priceChart || new Chart(els['price-chart'], {
    type: 'bubble',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const m = ctx.raw;
              return ` ${displayName(m.name)} · ${fmtPrice(m.pricePerMTok)}/1M · 컨텍스트 ${fmtTokens(m.ctxTokens)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'logarithmic', min: 1000, max: 2e6,
          title: { display: false },
          grid: { color: c.line }, ticks: { color: c.ink2 },
        },
        y: {
          type: 'logarithmic', min: 0.01, max: 100,
          title: { display: false, text: 'API 가격 (1M 토큰당 $, 로그)' },
          grid: { color: c.line }, ticks: { color: c.ink2 },
        },
      },
    },
  });
  priceChart.data.datasets = [
    {
      label: '클라우드 API',
      data: price.filter((m) => !localSet.has(m.name)).map((m) => ({ x: m.ctxTokens, y: m.pricePerMTok, name: m.name })),
      backgroundColor: c.ink2 + '66',
      pointRadius: 3,
    },
    {
      label: '내 장비에서 실행',
      data: price.filter((m) => localSet.has(m.name)).map((m) => ({ x: m.ctxTokens, y: m.pricePerMTok, name: m.name })),
      backgroundColor: c.accent,
      pointRadius: 4,
    },
  ];
  priceChart.update('none');

  // 추세 상위 10 (막대)
  const trend = [...models].filter((m) => m.trend).sort((a, b) => b.trend - a.trend).slice(0, 10);
  trendChart = trendChart || new Chart(els['trend-chart'], {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${displayName(ctx.raw.name)} · 추세 ${fmtTokens(ctx.raw.trend)}`,
          },
        },
      },
      scales: {
        x: { type: 'logarithmic', grid: { color: c.line }, ticks: { color: c.ink2 } },
        y: { grid: { display: false }, ticks: { color: c.ink } },
      },
    },
  });
  trendChart.data.labels = trend.map((m) => displayName(m.name));
  trendChart.data.datasets = [
    { data: trend.map((m) => ({ x: m.trend, name: m.name })), backgroundColor: c.accent2, borderRadius: 4 },
  ];
  trendChart.update('none');
}

// ---------- 이벤트 ----------
function toggleFav(name) {
  if (state.favorites.has(name)) {
    state.favorites.delete(name);
    state.compare = state.compare.filter((n) => n !== name);
  } else {
    if (state.favorites.size >= MAX_FAV) {
      setStatus(`즐겨찾기는 ${MAX_FAV}개까지예요. 하나를 해제하세요.`);
      return;
    }
    state.favorites.add(name);
    if (state.compare.length < MAX_FAV) state.compare.push(name);
  }
  render();
}

let statusTimer;
function setStatus(msg) {
  els['app-status'].textContent = msg || '';
  clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => { els['app-status'].textContent = ''; }, 4000);
}

function loadState() {
  try {
    const raw = localStorage.getItem('ai-marketboard');
    if (!raw) return;
    const s = JSON.parse(raw);
    state.favorites = new Set(s.favorites || []);
    state.compare = s.compare || [];
    state.memoryGB = s.memoryGB ?? state.memoryGB;
    state.bits = s.bits ?? state.bits;
    state.sort = s.sort ?? state.sort;
  } catch { /* ignore */ }
}

function saveState() {
  try {
    localStorage.setItem('ai-marketboard', JSON.stringify({
      favorites: [...state.favorites],
      compare: state.compare,
      memoryGB: state.memoryGB,
      bits: state.bits,
      sort: state.sort,
    }));
  } catch { /* ignore */ }
}

async function refresh(sample) {
  state.sampleMode = sample;
  els['sample-banner'].hidden = !sample;
  els['sample-banner'].textContent = sample
    ? '예시 데이터로 보고 있어요. 새로고침하면 실제 데이터로 바뀝니다.'
    : '';
  setStatus('데이터를 불러오는 중…');
  try {
    const d = await loadAppData(sample);
    state.data = {
      updated: dataUpdatedLabel(d.openrouter),
      models: buildUnifiedModels(d.openrouter, d.hf),
    };
    setStatus('');
    saveState();
    render();
  } catch (err) {
    setStatus('데이터를 불러오지 못했어요. 새로고침을 눌러주세요.');
    console.error(err);
  }
}

function bindEvents() {
  els['memory-input'].addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 1) {
      state.memoryGB = v;
      saveState();
      render();
    }
  });
  els['bits-select'].addEventListener('change', (e) => {
    state.bits = Number(e.target.value);
    saveState();
    render();
  });
  let t;
  els['search-input'].addEventListener('input', (e) => {
    state.search = e.target.value;
    clearTimeout(t);
    t = setTimeout(render, 150); // 3초 원칙: 검색은 즉시 반영
  });
  els['list-toggle'].addEventListener('click', () => {
    const el = els['board-list'];
    el.classList.toggle('fold');
    els['list-toggle'].textContent = el.classList.contains('fold')
      ? `전체 ${els['board-table'].querySelectorAll('tbody tr').length}개 보기`
      : '접기';
  });
  els['example-button'].addEventListener('click', () => refresh(true));
  els['refresh-button'].addEventListener('click', () => refresh(false));
  els['reset-button'].addEventListener('click', () => {
    state.memoryGB = DEFAULT_MEMORY;
    state.bits = Number(DEFAULT_BITS);
    state.search = '';
    els['memory-input'].value = String(DEFAULT_MEMORY);
    els['bits-select'].value = DEFAULT_BITS;
    els['search-input'].value = '';
    saveState();
    render();
  });

  // 표 헤더 클릭 → 정렬
  const headers = [
    { el: els['board-table'].querySelectorAll('thead th')[0], sort: 'trend' },
    { el: els['board-table'].querySelectorAll('thead th')[3], sort: 'trend' },
    { el: els['board-table'].querySelectorAll('thead th')[4], sort: 'local' },
    { el: els['board-table'].querySelectorAll('thead th')[6], sort: 'price' },
    { el: els['board-table'].querySelectorAll('thead th')[7], sort: 'context' },
  ];
  for (const h of headers) {
    if (!h.el) continue;
    h.el.style.cursor = 'pointer';
    h.el.addEventListener('click', () => {
      state.sort = h.sort;
      saveState();
      render();
    });
  }
}

// ---------- 시작 ----------
function boot() {
  initEls();
  // 모델 목록 컨테이너 삽입(표 아래)
  const list = document.createElement('ul');
  list.className = 'model-list ds-list';
  els['board-table'].after(list);
  loadState();
  els['memory-input'].value = String(state.memoryGB);
  els['bits-select'].value = String(state.bits);
  bindEvents();
  refresh(false);
}

document.addEventListener('DOMContentLoaded', boot);
