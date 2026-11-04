// AI 모델 시장 판 — 인터페이스
// 화면 구조(대표 시안 EXAMPLE-APP): .ds-band(제목·설명·기준) → .ds-answer(답)
// → 조건 입력 → 그래프(가격×컨텍스트 첫 화면 / 추세는 접어) → 모델 목록(접어) → 내 장비에 맞는 모델 → 즐겨찾기·비교 → 안내.
// 색·컴포넌트는 전부 vendor/studio.css 의 ds- 토큰. 모든 글자는 textContent 로만 쓴다.

import { buildModelBoard } from './app.js';

const DEFAULT_MEMORY = 48;
const DEFAULT_BITS = 8;
const MAX_FAV = 3;
const FAV_KEY = 'ai-market-board:favorites';
const DS_FONT = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif';

// ---------- 상태 ----------
const state = {
  memoryGB: DEFAULT_MEMORY,
  bits: DEFAULT_BITS,
  search: '',
  result: null, // buildModelBoard 결과 { rows, pairedCount, unpairedCount }
  favorites: new Set(), // SPEC: localStorage 'ai-market-board:favorites'(문자열 배열)
  sample: false, // 예시 데이터로 보고 있는가
  meta: null, // { fetched_at: [], terms: [] }
};

let trendChart = null;
let priceChart = null;

// ---------- 헬퍼 ----------
const $ = (id) => document.getElementById(id);
const els = {};

function initEls() {
  for (const id of [
    'data-meta', 'sample-banner', 'answer-label', 'answer-num', 'answer-unit', 'answer-text',
    'answer-total', 'answer-priced', 'answer-top', 'answer-priced-box', 'answer-top-box',
    'top-list', 'top-empty', 'memory-input', 'bits-select', 'search-input',
    'example-button', 'refresh-button', 'reset-button',
    'board', 'board-table', 'summary-line', 'table-note', 'price-chart', 'trend-chart',
    'table-fold', 'trend-fold',
    'fav-count', 'fav-empty', 'fav-list', 'compare-lead', 'compare-lead-count', 'compare-list',
    'compare-panel', 'app-status',
  ]) {
    els[id] = $(id);
  }
}

// SPEC 의 반올림(반올림 = 0.5 올림): 8.9551 -> '9.0', 13.25 -> '13.3'
function round1(v) {
  return (Math.round((v + Number.EPSILON) * 10) / 10).toFixed(1);
}

// 파라미터: 8030264448 -> '8.0B'
function fmtParams(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const b = n / 1e9;
  return b >= 1 ? round1(b) + 'B' : (b * 1000).toFixed(0) + 'M';
}

// 컨텍스트: 262144 -> '262.1K', 8192 -> '8.2K'
function fmtContext(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return round1(n / 1000) + 'K';
}

// 로컬 메모리 추정 (SPEC): parameters * (bits/8) * 1.2 / 1024^3
function estimateGB(row, bits) {
  const p = row.hf && row.hf.parameters;
  if (p == null || !Number.isFinite(p)) return null;
  return (p * (bits / 8) * 1.2) / (1024 ** 3);
}

// 로컬 가능: 1소수 반올림한 추정치 <= RAM (SPEC)
function canRun(row, bits, memoryGB) {
  const m = estimateGB(row, bits);
  if (m == null) return { cls: 'can-unknown', text: '알 수 없음' };
  if (Math.round(m * 10) / 10 <= memoryGB) return { cls: 'can-yes', text: '가능' };
  return { cls: 'can-no', text: '불가' };
}

// API 가격: '$' + pricePerMillion (SPEC)
function fmtPrice(p) {
  return p == null ? '—' : '$' + p;
}

function displayName(raw) {
  // org 접두를 떼고 '-'는 공백으로, 단어를 대문자로
  let s = String(raw || '');
  if (s.includes('/')) s = s.split('/').pop();
  if (s.includes(':')) s = s.split(':').slice(1).join(':');
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '알 수 없음';
}

function famBestName(row) {
  return row.hf ? row.hf.name : row.openrouter ? row.openrouter.name : row.family;
}

function famBestInitials(name) {
  const letters = (String(name).match(/[A-Za-z]/g) || []).slice(0, 2).join('').toUpperCase();
  return letters || '?';
}

function hueFor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 8;
  return h;
}

function rows() {
  return state.result ? state.result.rows : [];
}

function visibleRows() {
  const q = state.search.trim().toLowerCase();
  return rows().filter((r) => !q || r.family.toLowerCase().includes(q));
}

// ---------- 데이터 ----------
const REAL_FILES = ['data/hf_models.json', 'data/openrouter_models.json', 'data/hf_models.meta.json', 'data/openrouter_models.meta.json'];
const SAMPLE_FILES = ['data/hf_models.sample.json', 'data/openrouter_models.sample.json'];

function fetchJSON(url, options = {}) {
  return fetch(url, options).then((r) => {
    if (!r.ok) throw new Error(`데이터 파일 없음: ${url.split('/').pop()}`);
    return r.json();
  });
}

function fileName(url) {
  return url.split('/').pop().split('?')[0];
}

function formatMeta(meta, name) {
  const fa = meta && meta.fetched_at ? String(meta.fetched_at) : '';
  const d = fa ? fa.slice(0, 16).replace('T', ' ') : '';
  return { fetched_at: `데이터 기준: ${d}${fa ? ' ' + (fa.slice(17, 19) || '') : ''}`.trim(), terms: (meta && meta.terms ? meta.terms : '') + (meta && meta.name ? ` · 출처: ${meta.name}` : '') };
}

function loadAll(sample) {
  const files = sample ? SAMPLE_FILES : REAL_FILES;
  const urls = files.map((f) => f + '?v=' + (sample ? 's' : '1'));
  return Promise.all(urls.map((u) => fetchJSON(u, { cache: 'no-store' }))).then((arr) => ({
    hf: arr[0],
    openrouter: arr[1],
    hfMeta: arr[2] || null,
    orMeta: arr[3] || null,
    names: files.map(fileName),
  }));
}

// ---------- 렌더 ----------
function render() {
  if (!state.result) return;
  renderAnswer();
  renderTopList();
  renderTable();
  renderFavs();
  renderCharts();
  // 첫 화면: 추세 그래프만 펼쳐 두고, 모델 목록은 접어 둔 채 시작한다(보이지 않는 구역은 아래로)
  if (!state.result._foldTouched) {
    if (els['trend-fold'] && !els['trend-fold'].open) els['trend-fold'].open = true;
    if (els['table-fold'] && els['table-fold'].open) els['table-fold'].open = false;
  }
}

function renderAnswer() {
  let total = 0, runnable = 0, priced = 0, top = null;
  for (const r of rows()) {
    total += 1;
    if (canRun(r, state.bits, state.memoryGB).text === '가능') runnable += 1;
    if (r.openrouter && r.openrouter.pricePerMillion != null) priced += 1;
    const t = r.hf && r.hf.trendingScore;
    if (t != null && (top == null || t > top.trendingScore)) top = { trendingScore: t, name: famBestName(r) };
  }
  els['answer-label'].textContent = state.sample
    ? `예시 기준(내 RAM ${state.memoryGB}GB · ${state.bits}비트)으로 돌릴 수 있는 AI`
    : `내 RAM ${state.memoryGB}GB · ${state.bits}비트로 직접 돌릴 수 있는 AI`;
  els['answer-num'].textContent = String(runnable);
  els['answer-unit'].textContent = '개';
  els['answer-text'].textContent = runnable > 0
    ? '아래 목록에서 실행에 드는 메모리를 확인하고, ☆를 눌러 나란히 비교해 보세요.'
    : '조건을 바꾸거나 RAM을 더 크게 올려 보세요.';
  els['answer-total'].textContent = total + '개';
  const pb = els['answer-priced-box'];
  pb.hidden = priced === 0;
  els['answer-priced'].textContent = priced + '개';
  const tb = els['answer-top-box'];
  tb.hidden = !top;
  els['answer-top'].textContent = top ? displayName(top.name) : '—';
  els['answer-top'].title = top ? top.name : '';
}

// 내 장비에 맞는 모델: 가능 모델(추세 순, 8개) — 스크롤 전 첫 화면의 목록
function renderTopList() {
  const can = rows().filter((r) => canRun(r, state.bits, state.memoryGB).text === '가능');
  can.sort((a, b) => {
    const ta = a.hf && a.hf.trendingScore != null ? a.hf.trendingScore : -1;
    const tb = b.hf && b.hf.trendingScore != null ? b.hf.trendingScore : -1;
    return tb - ta;
  });
  els['top-empty'].hidden = can.length > 0;
  const list = els['top-list'];
  list.textContent = '';
  for (const r of can.slice(0, 8)) {
    const name = famBestName(r);
    const li = document.createElement('li');
    const mem = estimateGB(r, state.bits);
    const av = document.createElement('span');
    av.className = 'ds-avatar';
    av.dataset.hue = String(hueFor(name));
    av.textContent = famBestInitials(name);
    const main = document.createElement('span');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = displayName(name);
    title.title = name;
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    const parts = [];
    const pp = r.hf && r.hf.parameters != null ? fmtParams(r.hf.parameters) : null;
    if (pp) parts.push('파라미터 ' + pp);
    if (r.openrouter && r.openrouter.contextLength != null) parts.push('컨텍스트 ' + fmtContext(r.openrouter.contextLength));
    sub.textContent = parts.join(' · ') || '참고 정보 없음';
    main.append(title, sub);
    const end = document.createElement('span');
    end.className = 'ds-list-end';
    const amt = document.createElement('span');
    amt.className = 'ds-list-amount';
    amt.textContent = mem != null ? round1(mem) + ' GB' : '—';
    end.append(amt);
    li.append(av, main, end);
    li.addEventListener('click', () => {
      els['search-input'].value = displayName(name);
      state.search = displayName(name);
      state.result._foldTouched = true;
      if (els['table-fold']) els['table-fold'].open = true;
      render();
      els['board-table'].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(li);
  }
}

function renderTable() {
  const tbody = els['board-table'].querySelector('tbody');
  tbody.textContent = '';
  const vis = visibleRows();

  // SPEC: '모델 N개 · 짝 M개 · 짝 안 됨 K개'
  els['summary-line'].textContent = `모델 ${rows().length}개 · 짝 ${state.result.pairedCount}개 · 짝 안 됨 ${state.result.unpairedCount}개`;

  // 검색 결과 안내: 빈 결과 / 일부 일치
  els['table-note'].textContent = '';
  if (state.search.trim() && vis.length === 0) {
    els['table-note'].textContent = `“${state.search.trim()}” 검색 결과가 없어요. 다른 이름으로 검색해 보세요.`;
  } else if (state.search.trim() && vis.length < rows().length) {
    els['table-note'].textContent = `검색 조건에 맞는 모델 ${vis.length}개`;
  }

  // 추세 막대: 보이는 행의 최대 trendingScore 대비 (SPEC)
  const maxTrend = vis.reduce((mx, r) => {
    const t = r.hf && r.hf.trendingScore;
    return t != null && t > mx ? t : mx;
  }, 0);

  for (const r of vis) {
    const name = famBestName(r);
    const tr = document.createElement('tr');
    tr.dataset.family = r.family;
    const star = state.favorites.has(r.family) ? '★' : '☆';

    // 가족: ☆(즐겨찾기 토글)
    const tdFam = document.createElement('td');
    const starEl = document.createElement('span');
    starEl.className = 'star';
    starEl.textContent = star;
    starEl.title = '즐겨찾기 추가/제거';
    tdFam.append(starEl);
    tdFam.title = `가족: 같은 이름의 모델 묶음. ☆를 눌러 즐겨찾기`;
    tdFam.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(r.family);
    });

    // 모델: 원문 이름(영문)은 툴팁에 — 화면 글자는 한국어 규칙
    const tdModel = document.createElement('td');
    const mName = document.createElement('span');
    mName.className = 'model-name';
    mName.textContent = displayName(name);
    mName.title = name;
    tdModel.append(mName);
    tr.append(tdFam, tdModel);

    // 파라미터
    const tdPar = document.createElement('td');
    tdPar.className = 'num-cell';
    tdPar.textContent = r.hf && r.hf.parameters != null ? fmtParams(r.hf.parameters) : '알 수 없음';
    tr.append(tdPar);

    // 추세: 막대 길이 = 최대 점수 대비
    const tdTrend = document.createElement('td');
    const t = r.hf && r.hf.trendingScore;
    const num = document.createElement('span');
    num.className = 'ds-num num-cell';
    num.textContent = t != null ? String(t) : '—';
    if (t != null && maxTrend > 0) {
      const bar = document.createElement('span');
      bar.className = 'ds-bar bar';
      const fill = document.createElement('span');
      fill.style.width = Math.max(6, Math.round((t / maxTrend) * 100)) + '%';
      bar.style.width = '80px';
      bar.append(fill);
      tdTrend.append(bar, num);
    } else {
      tdTrend.append(num);
    }
    tr.append(tdTrend);

    // 로컬 메모리 (GB)
    const mem = estimateGB(r, state.bits);
    const tdMem = document.createElement('td');
    tdMem.className = 'num-cell';
    tdMem.textContent = mem != null ? round1(mem) + ' GB' : '알 수 없음';
    tr.append(tdMem);

    // 로컬 가능
    const can = canRun(r, state.bits, state.memoryGB);
    const tdCan = document.createElement('td');
    tdCan.className = 'center-cell';
    const pill = document.createElement('span');
    pill.className = 'pill ' + can.cls;
    pill.textContent = can.text;
    tdCan.append(pill);
    tr.append(tdCan);

    // API 가격 (1M 토큰)
    const tdPrice = document.createElement('td');
    tdPrice.className = 'num-cell';
    tdPrice.textContent = fmtPrice(r.openrouter && r.openrouter.pricePerMillion);
    tr.append(tdPrice);

    // 컨텍스트
    const tdCtx = document.createElement('td');
    tdCtx.className = 'num-cell';
    const cx = r.openrouter && r.openrouter.contextLength;
    tdCtx.textContent = cx != null ? fmtContext(cx) : '—';
    tr.append(tdCtx);

    // 행 클릭 = 비교 추가/제거
    tr.addEventListener('click', () => toggleCompare(r.family));
    if (state.favorites.has(r.family)) tr.className = 'ds-pick';
    tbody.appendChild(tr);
  }
}

function renderFavs() {
  const favs = [...state.favorites];
  els['fav-count'].textContent = String(favs.length);
  els['fav-empty'].hidden = favs.length > 0;
  els['compare-lead'].hidden = !favs.length;
  els['compare-lead-count'].textContent = String(Math.min(favs.length, MAX_FAV));

  els['fav-list'].textContent = '';
  const byFam = new Map(rows().map((r) => [r.family, r]));
  for (const f of favs) {
    const r = byFam.get(f);
    const name = r ? famBestName(r) : f;
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const av = document.createElement('span');
    av.className = 'ds-avatar ds-avatar-s';
    av.dataset.hue = String(hueFor(name));
    av.textContent = famBestInitials(name);
    const main = document.createElement('span');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = displayName(name);
    title.title = name;
    main.append(title);
    const end = document.createElement('span');
    end.className = 'ds-list-end';
    const rm = document.createElement('button');
    rm.className = 'fav-remove';
    rm.type = 'button';
    rm.textContent = '제거';
    rm.title = '즐겨찾기에서 제거';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(f);
    });
    end.append(rm);
    li.append(av, main, end);
    els['fav-list'].appendChild(li);
  }

  els['compare-list'].textContent = '';
  for (const f of favs.slice(0, MAX_FAV)) {
    const r = byFam.get(f);
    const name = r ? famBestName(r) : f;
    const li = document.createElement('li');
    li.className = 'fav-chip ds-chip';
    li.textContent = displayName(name);
    li.title = name;
    els['compare-list'].appendChild(li);
  }

  // 비교 표: 열 = 선택한 가족, 행 = 로컬 메모리·로컬 가능·API 가격·컨텍스트
  els['compare-panel'].textContent = '';
  const sel = favs.slice(0, MAX_FAV).map((f) => byFam.get(f)).filter(Boolean);
  if (sel.length < 2) return;
  const table = document.createElement('table');
  table.className = 'ds-table compare-table';
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = '';
  htr.append(corner);
  for (const r of sel) {
    const th = document.createElement('th');
    const name = famBestName(r);
    th.textContent = displayName(name);
    th.title = name;
    htr.append(th);
  }
  thead.append(htr);
  const tbody = document.createElement('tbody');
  const defs = [
    ['로컬 메모리', (r) => {
      const m = estimateGB(r, state.bits);
      return m != null ? round1(m) + ' GB' : '알 수 없음';
    }],
    ['로컬 가능', (r) => canRun(r, state.bits, state.memoryGB).text],
    ['API 가격', (r) => fmtPrice(r.openrouter && r.openrouter.pricePerMillion)],
    ['컨텍스트', (r) => {
      const c = r.openrouter && r.openrouter.contextLength;
      return c != null ? fmtContext(c) : '—';
    }],
  ];
  for (const [label, fn] of defs) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    tr.append(th);
    for (const r of sel) {
      const td = document.createElement('td');
      td.textContent = fn(r);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  els['compare-panel'].appendChild(table);
}

// ---------- 차트 ----------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const ink = cssVar('--ds-ink') || '#151a24';
  const ink2 = cssVar('--ds-ink-2') || '#454d5e';
  const line = cssVar('--ds-line') || '#e1e4ea';
  const c1 = cssVar('--ds-c1') || '#2f5bea';
  const c3 = cssVar('--ds-c3') || '#0c8599';
  const vis = visibleRows();

  Chart.defaults.font.family = DS_FONT;
  Chart.defaults.font.size = 12;

  // 가격 × 컨텍스트: 점 하나 = 모델 (로그 눈금)
  const price = vis.filter((r) => {
    const o = r.openrouter;
    return o && o.contextLength != null && o.pricePerMillion != null;
  });
  const localNames = new Set(
    vis.filter((r) => canRun(r, state.bits, state.memoryGB).text === '가능').map((r) => famBestName(r))
  );
  priceChart = priceChart || new Chart(els['price-chart'], {
    type: 'scatter',
    data: { datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? items[0].raw._label : '',
            label: (ctx) => {
              const p = ctx.raw;
              const ctxK = p.x / 1000;
              return ` ${fmtPrice(p.y)} / 1M 토큰 · 컨텍스트 ${round1(ctxK)}K`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'logarithmic',
          min: 1000, max: 2e6,
          grid: { color: line },
          ticks: {
            color: ink2,
            maxTicksLimit: 6,
            callback: (v) => (v >= 1e6 ? v / 1e6 + 'M' : v / 1000 + 'K'),
          },
        },
        y: {
          type: 'logarithmic',
          min: 0.01, max: 500,
          grid: { color: line },
          ticks: { color: ink2, maxTicksLimit: 6, callback: (v) => '$' + v },
        },
      },
    },
  });
  priceChart.data.datasets = [
    {
      label: '클라우드 API',
      data: price.filter((r) => !localNames.has(famBestName(r))).map((r) => ({ x: r.openrouter.contextLength, y: r.openrouter.pricePerMillion, _label: displayName(famBestName(r)) })),
      backgroundColor: ink2 + '66',
      pointRadius: 3,
      pointHoverRadius: 6,
    },
    {
      label: '내 장비에서 실행',
      data: price.filter((r) => localNames.has(famBestName(r))).map((r) => ({ x: r.openrouter.contextLength, y: r.openrouter.pricePerMillion, _label: displayName(famBestName(r)) })),
      backgroundColor: c1,
      pointRadius: 4,
      pointHoverRadius: 7,
    },
  ];
  priceChart.update('none');

  // 추세 상위 10: 막대 길이 = trendingScore
  const trend = vis.filter((r) => r.hf && r.hf.trendingScore != null)
    .sort((a, b) => b.hf.trendingScore - a.hf.trendingScore)
    .slice(0, 10);
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
            label: (ctx) => ` 추세 ${ctx.raw._trend} · ${ctx.raw._label}`,
          },
        },
      },
      scales: {
        x: { grid: { color: line }, ticks: { color: ink2 } },
        y: { grid: { display: false }, ticks: { color: ink, font: { size: 11 } } },
      },
    },
  });
  trendChart.data.labels = trend.map((r) => displayName(famBestName(r)));
  trendChart.data.datasets = [
    { data: trend.map((r) => ({ x: r.hf.trendingScore, _trend: r.hf.trendingScore, _label: displayName(famBestName(r)) })), backgroundColor: c3, borderRadius: 4, barThickness: 18 },
  ];
  trendChart.update('none');
}

// ---------- 즐겨찾기·비교 (SPEC 규칙) ----------
function loadFavs() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      state.favorites = new Set(v);
    }
  } catch { /* 잘못된 값은 무시(빈 것으로 시작) */ }
}

function saveFavs() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites]));
  } catch { /* ignore */ }
}

function toggleFav(family) {
  if (state.favorites.has(family)) {
    state.favorites.delete(family);
  } else {
    if (state.favorites.size >= MAX_FAV) {
      state.favorites.delete(state.favorites.values().next().value); // 가장 오래된 1개 치환
    }
    state.favorites.add(family);
  }
  saveFavs();
  render();
}

// 행 클릭: 선택(비교) 토글 — ☆(가족 셀)은 즐겨찾기
function toggleCompare(family) {
  if (state.favorites.has(family)) {
    state.favorites.delete(family);
  } else {
    if (state.favorites.size >= MAX_FAV) {
      state.favorites.delete(state.favorites.values().next().value);
    }
    state.favorites.add(family);
  }
  saveFavs();
  render();
}

// ---------- 상태 메시지 ----------
let statusTimer;
function setStatus(msg, sticky = false) {
  els['app-status'].textContent = msg || '';
  clearTimeout(statusTimer);
  if (msg && !sticky) statusTimer = setTimeout(() => { els['app-status'].textContent = ''; }, 6000);
}

// ---------- 로드/새로고침 ----------
async function load(sample) {
  state.sample = sample;
  els['sample-banner'].hidden = !sample;
  els['sample-banner'].className = 'sample-banner ds-status ds-status-warn';
  els['sample-banner'].textContent = sample
    ? '예시 데이터를 보고 있어요. 실제 데이터로 복귀하려면 [새로고침]을 누르세요.'
    : '';
  setStatus(sample ? '예시 데이터를 불러오는 중…' : '데이터를 불러오는 중…');
  try {
    const d = await loadAll(sample);
    if (sample) {
      // 예시 데이터: 파일 대신 코드에 들어 있는 실제 데이터(같은 처리를 실행)
      state.result = buildModelBoard(d.hf, d.openrouter);
      state.meta = {
        fetched_at: ['데이터 기준: 2026-11-04 04:03 (예시)'],
        terms: ['예시: 실제 데이터 파일의 일부(이용 조건은 실제 데이터와 같음)'],
      };
    } else {
      try {
        state.result = buildModelBoard(d.hf, d.openrouter);
      } catch (err) {
        state.result = null;
        setStatus('데이터 모양이 기대와 달라서 화면을 표시할 수 없습니다. 새로고침을 눌러 주세요.', true);
        return;
      }
      const metas = [d.hfMeta, d.orMeta].filter(Boolean);
      state.meta = {
        fetched_at: metas.map((m) => formatMeta(m).fetched_at),
        terms: [...new Set(metas.map((m) => formatMeta(m).terms).filter((t) => t))],
      };
    }
    setStatus('');
    renderDataMeta();
    render();
  } catch (err) {
    state.result = null;
    els['data-meta'].textContent = '';
    els['board-table'].querySelector('tbody').textContent = '';
    els['summary-line'].textContent = '';
    els['table-note'].textContent = '';
    els['top-list'].textContent = '';
    els['fav-list'].textContent = '';
    els['compare-list'].textContent = '';
    els['compare-panel'].textContent = '';
    if (els['table-fold']) els['table-fold'].open = false;
    if (priceChart) { priceChart.data.datasets = []; priceChart.update('none'); }
    if (trendChart) { trendChart.data.datasets = []; trendChart.data.labels = []; trendChart.update('none'); }
    // SPEC: '데이터 파일을 불러올 수 없습니다: <file name>'
    const m = String(err && err.message || '').match(/(?:데이터 파일 없음|데이터 파일을 불러올 수 없습니다):?\s*(\S+)/);
    setStatus('데이터 파일을 불러올 수 없습니다: ' + (m ? m[1] : fileName((sample ? SAMPLE_FILES : REAL_FILES)[0])) + ' — 새로고침을 눌러 주세요.', true);
  }
}

function renderDataMeta() {
  const lines = [];
  if (state.meta) {
    for (const f of state.meta.fetched_at) if (f) lines.push(f);
    for (const t of state.meta.terms) if (t) lines.push(t);
  }
  els['data-meta'].textContent = lines.join(' · ');
}

// ---------- 이벤트 ----------
function bindEvents() {
  els['memory-input'].addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 1) {
      state.memoryGB = Math.min(v, 1024);
      render();
    }
  });
  els['bits-select'].addEventListener('change', (e) => {
    state.bits = Number(e.target.value);
    render();
  });
  let t;
  els['search-input'].addEventListener('input', (e) => {
    state.search = e.target.value;
    if (e.target.value.trim()) {
      // 검색을 시작하면 접혀 있는 모델 목록을 펼쳐 보여 준다
      state.result._foldTouched = true;
      if (els['table-fold'] && !els['table-fold'].open) els['table-fold'].open = true;
    }
    clearTimeout(t);
    t = setTimeout(render, 120);
  });
  // '내 장비에 맞는 모델' 제목의 '목록 전체 보기' — 접혀 있는 모델을 펼쳐 준다
  const openTable = (a) => {
    a.preventDefault();
    state.result._foldTouched = true;
    if (els['table-fold']) els['table-fold'].open = true;
    els['board-table'].scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  for (const a of document.querySelectorAll('a[data-open-table]')) a.addEventListener('click', openTable);
  // 그래프로 보기: 추세 그래프가 접혀 있으면 펼친 뒤 그래프로 이동
  els['board'].addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href="#chart-anchor"]');
    if (!a) return;
    if (els['trend-fold'] && !els['trend-fold'].open) {
      els['trend-fold'].open = true;
      state.result._foldTouched = true;
    }
  });
  els['example-button'].addEventListener('click', () => load(true));
  els['refresh-button'].addEventListener('click', () => load(false));
  els['reset-button'].addEventListener('click', () => {
    state.memoryGB = DEFAULT_MEMORY;
    state.bits = DEFAULT_BITS;
    state.search = '';
    state.favorites = new Set();
    localStorage.removeItem(FAV_KEY);
    els['memory-input'].value = String(DEFAULT_MEMORY);
    els['bits-select'].value = String(DEFAULT_BITS);
    els['search-input'].value = '';
    if (state.result) state.result._foldTouched = false;
    setStatus('');
    render();
  });
}

// ---------- 시작 ----------
function boot() {
  initEls();
  loadFavs();
  bindEvents();
  renderDataMeta();
  load(false);
}

document.addEventListener('DOMContentLoaded', boot);
