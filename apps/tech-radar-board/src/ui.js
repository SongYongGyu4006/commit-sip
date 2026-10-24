// 화면 로직: 데이터 fetch, 예시 버튼, 필터, 렌더링. 순수 함수는 app.js 의 buildRadarBoard.
import { buildRadarBoard } from './app.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_FILTER = { tier: 0, interestOnly: false, crossConfirmedOnly: false, sortBy: 'score' };
const TIER_NAME = { 1: '공식', 2: '언론', 3: '전문가', 4: '커뮤니티' };
const DATA_URL = 'data/tech_radar.json';
const META_URL = 'data/tech_radar.meta.json';
const SAMPLE_URL = 'samples/tech_radar_예시.json';
const AI_MODELS_URL = 'data/ai_models.json';
const AI_MODELS_SAMPLE_URL = 'samples/ai_models_예시.json';

// 데이터가 없을 때 세 목록의 빈 상태 안내(예시로 해 보기 버튼과 함께 쓴다).
const EMPTY_HINT = "데이터를 불러오지 못했습니다. '예시로 해 보기' 버튼으로 확인할 수 있어요.";

let currentData = null;
let resultHasData = false;
let resultUniqueStories = 0;

function currentFilter() {
  return {
    tier: Number($('tier-select').value),
    interestOnly: $('interest-checkbox').checked,
    crossConfirmedOnly: $('cross-checkbox').checked,
    sortBy: $('sort-select').value,
  };
}

function resetFilters() {
  $('tier-select').value = String(DEFAULT_FILTER.tier);
  $('interest-checkbox').checked = DEFAULT_FILTER.interestOnly;
  $('cross-checkbox').checked = DEFAULT_FILTER.crossConfirmedOnly;
  $('sort-select').value = DEFAULT_FILTER.sortBy;
}

function clearLists() {
  restoreDetail();
  for (const id of ['top-three-list', 'story-list', 'source-status-list']) $(id).innerHTML = '';
  $('filtered-count').textContent = '';
  $('source-summary-text').textContent = '데이터가 준비되면 수집 현황을 여기에 표시합니다.';
}

function setError(message) {
  $('app-status').textContent = message;
  clearLists();
  $('sample-button').classList.add('pulse');
}

function clearError() {
  $('app-status').textContent = '';
  $('sample-button').classList.remove('pulse');
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function badge(text, className) {
  return makeEl('span', 'badge ' + className, text);
}

function ageText(h) {
  if (h < 1) return '한 시간 전';
  if (h < 24) return Math.round(h) + '시간 전';
  return Math.round(h / 24) + '일 전';
}

// 출처 · 지표 + 원문 제목(링크) 행을 만든다.
function linkRow(l) {
  const row = makeEl('div', 'link');
  row.appendChild(makeEl('span', 'link-source', l.source + (l.metric ? ' · ' + l.metric : '')));
  const a = document.createElement('a');
  a.href = l.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'link-title';
  a.textContent = l.title;
  row.appendChild(a);
  return row;
}

function renderAnswer(result) {
  const top = result.topThree[0];
  const num = $('answer-num');
  const text = $('answer-text');
  if (!top) {
    num.textContent = '0';
    const small = document.createElement('small');
    small.textContent = '개';
    num.appendChild(small);
    text.textContent = '데이터가 준비되면 지금 가장 큰 소식부터 보여 드려요.';
  } else {
    num.textContent = String(top.scoreRounded);
    const small = document.createElement('small');
    small.textContent = '점';
    num.appendChild(small);
    text.textContent = '지금은 ' + top.title + '이(가) 가장 크게 다뤄지고 있어요.';
  }
  $('answer-total').textContent = result.sourceSummary.uniqueStories + '개';
  const s = result.sourceSummary;
  $('answer-sources').textContent = s.totalSources + '곳';
  const crossCount = result.filteredStories.filter((st) => st.crossConfirmed).length;
  $('answer-cross').textContent = crossCount + '개';
}

function renderTopThree(items) {
  const ul = $('top-three-list');
  ul.innerHTML = '';
  if (!items.length) {
    ul.appendChild(emptyLi(EMPTY_HINT));
    $('top-section').hidden = true;
    return;
  }
  $('top-section').hidden = false;
  const total = resultUniqueStories;
  items.forEach((s, i) => {
    const li = makeEl('li', 'top-item');
    li.appendChild(makeEl('span', 'rank', String(i + 1)));
    const main = makeEl('div', 'main');
    const a = document.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'title';
    a.textContent = s.title;
    main.appendChild(a);
    const meta = makeEl('span', 'meta', '점수 ' + s.scoreRounded + ' (전체 상위 ' + (i + 1) + '위' + (total ? ' / ' + total + '개' : '') + ')');
    for (const t of s.tiers) meta.appendChild(badge(TIER_NAME[t] || String(t), 'tier-' + t));
    meta.appendChild(makeEl('span', '', ' · '));
    meta.appendChild(makeEl('span', '', ageText(s.ageHours)));
    main.appendChild(meta);
    li.appendChild(main);
    const links = makeEl('div', 'links');
    for (const l of s.links.slice(0, 2)) links.appendChild(linkRow(l));
    if (links.children.length) li.appendChild(links);
    ul.appendChild(li);
  });
}

// 처음 8개만 그린다. "더 보기"를 누를 때마다 8개씩 추가한다.
const PAGE_SIZE = 8;
let visibleCount = PAGE_SIZE;
let lastStoryItems = [];

function resetVisibleCount() {
  visibleCount = PAGE_SIZE;
}

// 빈 상태 li: 안내 문구 + 예시로 해 보기 버튼
function emptyLi(text) {
  const li = makeEl('li', 'empty');
  li.appendChild(makeEl('p', 'empty-text', text));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ds-btn ds-btn-primary ds-btn-sm';
  btn.textContent = '예시로 해 보기';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    $('sample-button').click();
  });
  li.appendChild(btn);
  return li;
}

function renderStoryList(items) {
  const ul = $('story-list');
  restoreDetail();
  ul.innerHTML = '';
  if (!items.length) {
    const isDataMissing = !resultHasData;
    ul.appendChild(emptyLi(isDataMissing ? EMPTY_HINT : '조건에 맞는 소식이 없습니다. 등급·정렬·체크를 바꾸거나 초기화를 눌러 보세요.'));
    $('filtered-count').textContent = isDataMissing ? '' : '0개';
    return;
  }
  $('filtered-count').textContent = '모두 ' + items.length + '개';
  lastStoryItems = items;
  const shown = items.slice(0, visibleCount);
  shown.forEach((s) => {
    const li = makeEl('li', 'story');
    li.tabIndex = 0;
    li.setAttribute('aria-expanded', 'false');
    const titleRow = makeEl('span', 'title-row');
    const title = makeEl('span', 'title', s.title);
    titleRow.appendChild(title);
    const chev = makeEl('span', 'chev', '▾ 원문·지표');
    titleRow.appendChild(chev);
    li.appendChild(titleRow);
    const meta = makeEl('span', 'meta', '점수 ' + s.scoreRounded + ' · 출처 ' + s.sourceCount + '곳 · ' + ageText(s.ageHours));
    if (s.crossConfirmed) meta.appendChild(badge('교차 확인', 'cross'));
    if (s.interest) meta.appendChild(badge('관심 주제', 'interest'));
    li.appendChild(meta);
    const show = () => renderDetail(s, li);
    li.addEventListener('click', show);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        show();
      }
    });
    ul.appendChild(li);
  });
  if (visibleCount < items.length) {
    const more = makeEl('button', 'more', '더 보기(남은 ' + (items.length - visibleCount) + '개)');
    more.type = 'button';
    more.addEventListener('click', () => {
      visibleCount = Math.min(visibleCount + PAGE_SIZE, items.length);
      renderStoryList(lastStoryItems);
    });
    ul.appendChild(more);
  }
}

// 상세 칸을 목록(ul) 바깥의 원래 자리(목록 바로 뒤)로 되돌린다.
function restoreDetail() {
  const detail = $('story-detail');
  detail.innerHTML = '';
  const list = $('story-list');
  if (detail.parentElement !== list.parentElement || detail.previousElementSibling !== list) {
    list.after(detail);
  }
}

// 상세 패널: li 뒤 형제로 표시한다. 한 번에 하나만 연다.
function renderDetail(story, li) {
  const detail = $('story-detail');
  const list = $('story-list');
  const chev = li.querySelector('.chev');
  if (li.getAttribute('aria-expanded') === 'true') {
    restoreDetail();
    li.setAttribute('aria-expanded', 'false');
    if (chev) chev.textContent = '▾ 원문·지표';
    return;
  }
  detail.innerHTML = '';
  for (const l of story.links) detail.appendChild(linkRow(l));
  if (!story.links.length) {
    detail.appendChild(makeEl('p', 'empty', '출처 링크가 아직 수집되지 않았습니다.'));
  }
  li.after(detail);
  for (const other of list.querySelectorAll('.story[aria-expanded="true"]')) {
    if (other !== li) {
      other.setAttribute('aria-expanded', 'false');
      const c = other.querySelector('.chev');
      if (c) c.textContent = '▾ 원문·지표';
    }
  }
  li.setAttribute('aria-expanded', 'true');
  if (chev) chev.textContent = '▴ 원문·지표';
}

// render() 호출 등 새 렌더 시: 상세를 비우고 원래 자리로 되돌린다.
function collapseDetail() {
  restoreDetail();
  for (const other of $('story-list').querySelectorAll('.story[aria-expanded="true"]')) {
    other.setAttribute('aria-expanded', 'false');
    const c = other.querySelector('.chev');
    if (c) c.textContent = '▾ 원문·지표';
  }
}

function renderSourceSummary(summary) {
  $('source-summary-text').textContent =
    '출처 ' + summary.totalSources + ' 곳 · 성공 ' + summary.okSources + ' 곳 · 수집 ' + summary.collectedItems + '건 · 소식 ' + summary.uniqueStories + '개';
}

function renderSourceStatus(sources) {
  const ul = $('source-status-list');
  ul.innerHTML = '';
  if (!sources.length) {
    ul.appendChild(emptyLi(EMPTY_HINT));
    return;
  }
  const maxCount = Math.max(...sources.map((s) => s.count), 1);
  for (const s of sources) {
    const li = makeEl('li', 'source' + (s.ok ? '' : ' fail'));
    li.appendChild(makeEl('span', 'source-name', s.name + ' 출처'));
    const bar = makeEl('span', 'bar');
    bar.style.width = (s.count / maxCount * 100) + '%';
    li.appendChild(bar);
    li.appendChild(makeEl('span', 'source-meta', '등급: ' + (TIER_NAME[s.tier] || s.tier) + ' · 수집 ' + s.count + '건 · ' + (s.ok ? '정상 수집 완료' : '수집 실패, 확인 필요')));
    ul.appendChild(li);
  }
}

// 첫 화면 '모델 출시·가격' 구역: data/ai_models.json 의 [{title, params, price, url}]
const MODEL_CARD_LIMIT = 8;
let modelsCache = null;

function renderModelList(models) {
  const ul = $('model-list');
  ul.innerHTML = '';
  if (!models.length) {
    const li = makeEl('li', 'empty');
    li.appendChild(makeEl('p', 'empty-text', '모델 출시·가격 데이터가 아직 준비되지 않았습니다.'));
    ul.appendChild(li);
    return;
  }
  for (const m of models.slice(0, MODEL_CARD_LIMIT)) {
    const li = makeEl('li', 'model');
    li.appendChild(makeEl('span', 'model-title', m.title));
    const meta = makeEl('span', 'meta', (m.params || '정보 없음') + ' · ' + (m.price || '정보 없음'));
    li.appendChild(meta);
    if (m.url) {
      const a = document.createElement('a');
      a.href = m.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'model-link';
      a.textContent = '원문 보기';
      li.appendChild(a);
    }
    ul.appendChild(li);
  }
  if (models.length > MODEL_CARD_LIMIT) {
    const li = makeEl('li', 'model');
    li.appendChild(makeEl('span', 'model-title', '외 ' + (models.length - MODEL_CARD_LIMIT) + '개'));
    li.appendChild(makeEl('span', 'meta', '전체 목록은 아래 AI 모델 동향 탭에서 볼 수 있어요.'));
    ul.appendChild(li);
  }
}

// 첫 화면 '최근 7일 새 모델' 요약 카드
function renderModelAnswer(models) {
  const num = $('model-num');
  const text = $('model-text');
  num.textContent = String(models.length);
  const small = document.createElement('small');
  small.textContent = '개';
  num.appendChild(small);
  if (!models.length) {
    text.textContent = '모델 출시·가격 데이터가 준비되면 여기에 보여 드려요.';
  } else {
    const named = models.filter((m) => m.price).length;
    text.textContent = '최근 7일간 나온 새 모델 ' + models.length + '개 중 가격 정보는 ' + named + '건이에요.';
  }
  $('models-count').textContent = '최근 7일간 출시된 새 모델 ' + models.length + '개의 제목·파라미터·가격이에요.';
}

// data/ai_models.json 이 없으면(404) 샘플 파일로 내려간다.
// fetch 의 promise 자체를 catch 로 잡아 브라우저 콘솔 404 오류가 남지 않게 한다.
async function loadModels() {
  let models = [];
  try {
    let res;
    try {
      res = await fetch(AI_MODELS_URL);
    } catch (err) {
      res = null;
    }
    if (!res || !res.ok) res = await fetch(AI_MODELS_SAMPLE_URL).catch(() => null);
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 0));
    const parsed = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) throw new Error('배열 아님');
    models = parsed;
  } catch (err) {
    models = [];
  }
  modelsCache = models;
  renderModelList(models);
  renderModelAnswer(models);
}

// 'AI 모델 동향' 탭: 첫 화면 모델 구역과 같은 데이터를 전체로 보여 준다.
function renderPaneModelList() {
  const ul = $('pane-model-list');
  ul.innerHTML = '';
  if (!modelsCache || !modelsCache.length) {
    const li = makeEl('li', 'empty');
    li.appendChild(makeEl('p', 'empty-text', 'AI 모델 데이터가 아직 준비되지 않았습니다.'));
    ul.appendChild(li);
    return;
  }
  for (const m of modelsCache) {
    const li = makeEl('li', 'model');
    li.appendChild(makeEl('span', 'model-title', m.title));
    const meta = makeEl('span', 'meta', (m.params || '정보 없음') + ' · ' + (m.price || '정보 없음'));
    li.appendChild(meta);
    if (m.url) {
      const a = document.createElement('a');
      a.href = m.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'model-link';
      a.textContent = '원문 보기';
      li.appendChild(a);
    }
    ul.appendChild(li);
  }
}

let activeTab = 'stories';

function selectTab(name) {
  activeTab = name;
  const stories = name === 'stories';
  $('tab-stories').setAttribute('aria-selected', String(stories));
  $('tab-models').setAttribute('aria-selected', String(!stories));
  $('pane-stories').hidden = !stories;
  $('pane-models').hidden = stories;
  if (!stories) renderPaneModelList();
}

function render() {
  if (!currentData) {
    clearLists();
    renderTopThree([]);
    renderStoryList([]);
    renderAnswer({ topThree: [], filteredStories: [], sourceSummary: { totalSources: 0, okSources: 0, collectedItems: 0, uniqueStories: 0 } });
    return;
  }
  const result = buildRadarBoard(currentData, currentFilter());
  resultHasData = true;
  resultUniqueStories = result.sourceSummary.uniqueStories;
  renderAnswer(result);
  renderTopThree(result.topThree);
  renderStoryList(result.filteredStories);
  renderSourceSummary(result.sourceSummary);
  renderSourceStatus(result.sources);
  collapseDetail();
}

function attach() {
  for (const id of ['tier-select', 'interest-checkbox', 'cross-checkbox', 'sort-select']) {
    $(id).addEventListener('change', render);
  }
  $('reset-button').addEventListener('click', () => {
    resetFilters();
    collapseDetail();
    $('app-status').textContent = '';
    render();
  });
  $('tab-stories').addEventListener('click', () => selectTab('stories'));
  $('tab-models').addEventListener('click', () => selectTab('models'));
  $('sample-button').addEventListener('click', async () => {
    try {
      // 받아 둔 실제 데이터를 우선 쓰고, 읽지 못하면 내장 예시로 대체한다.
      let sampleRes = await fetch(DATA_URL);
      if (!sampleRes.ok) sampleRes = await fetch(SAMPLE_URL);
      if (!sampleRes.ok) throw new Error('HTTP ' + sampleRes.status);
      currentData = structuredClone(JSON.parse(await sampleRes.text()));
      $('fetched-at').textContent = '내장 예시 데이터';
      $('data-terms').textContent = '공개 피드에서 모은 제목·링크·지표만 표시합니다.';
      clearError();
      resetFilters();
      render();
    } catch (err) {
      setError('예시 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    }
  });
}

function formatFetchedAt(raw) {
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) return raw;
  const p = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
}

function init() {
  attach();
  loadModels();
  (async () => {
    try {
      const [radarText, metaText] = await Promise.all([fetch(DATA_URL), fetch(META_URL)]);
      if (!radarText.ok || !metaText.ok) throw new Error('HTTP ' + radarText.status + ' / ' + metaText.status);
      currentData = JSON.parse(await radarText.text());
      const meta = JSON.parse(await metaText.text());
      $('fetched-at').textContent = formatFetchedAt(meta.fetched_at);
      $('data-terms').textContent = meta.terms || '이용 조건은 데이터가 준비되면 여기에 표시됩니다.';
      clearError();
      render();
    } catch (err) {
      setError('기술 레이더 데이터를 불러오지 못했습니다. 예시로 해 보기 버튼을 눌러 확인하세요.');
    }
  })();
}

init();
