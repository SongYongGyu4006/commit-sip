// 화면 로직: 데이터 fetch, 예시 버튼, 필터, 렌더링. 순수 함수는 app.js 의 buildRadarBoard.
import { buildRadarBoard, buildSpeedometer } from './app.js';

const $ = (id) => document.getElementById(id);

// 수요가 높은 주제로 시작: 처음부터 관심 주제만 켜 둔다(필터 초기화도 이 상태로).
const DEFAULT_FILTER = { tier: 0, interestOnly: true, crossConfirmedOnly: false, sortBy: 'score' };
const TIER_NAME = { 1: '공식', 2: '언론', 3: '전문가', 4: '커뮤니티' };
const DATA_URL = 'data/tech_radar.json';
const META_URL = 'data/tech_radar.meta.json';
const SAMPLE_URL = 'samples/tech_radar_예시.json';
const AI_MODELS_URL = 'data/ai_models.json';
const AI_MODELS_SAMPLE_URL = 'samples/ai_models_예시.json';

// 데이터가 없을 때 세 목록의 빈 상태 안내(예시로 해 보기 버튼과 함께 쓴다).
const EMPTY_HINT = "데이터를 불러오지 못했습니다. '예시로 해 보기' 버튼으로 확인할 수 있어요.";
const SPEED_EMPTY = '데이터가 준비되면 최근 24시간 소식 수를 신호등으로 보여 드려요.';

let currentData = null;
let resultHasData = false;
let resultTopThree = [];
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
  for (const id of ['top-three-list', 'story-list', 'source-status-list', 'speed-list']) $(id).innerHTML = '';
  $('speed-list').appendChild(speedEmptyLi());
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

// 원문 제목(링크) 행을 만든다.
// dedupeTitle 이 true 이고 행 제목이 소식 제목과 같으면, 제목이 같은 링크 문구를 '원문 보기'로 줄인다.
// 지표(metric)는 한국어 안내문 뒤 작은 글씨로 보여 준다.
function linkRow(l, dedupeTitle, storyTitle) {
  const row = makeEl('div', 'link');
  const a = document.createElement('a');
  a.href = l.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'link-title';
  a.title = l.title;
  a.textContent = dedupeTitle && storyTitle && l.title.trim() === storyTitle.trim() ? '원문 보기' : l.title;
  row.appendChild(a);
  const src = makeEl('span', 'link-source');
  src.appendChild(makeEl('span', '', '기사를 쓴 사이트: ' + l.source + ' · 원문 링크'));
  if (l.metric) src.appendChild(makeEl('span', 'link-metric', ' · 지표 ' + l.metric));
  row.appendChild(src);
  return row;
}

// 첫 화면에 처음부터 계산된 결과가 보일 수 있게 예시 데이터로 화면을 채운다.
// (실제 데이터 파일이 있으면 그걸 쓰러 시도하되 실패하면 이 화면이 그대로 유지된다.)
function seedSample() {
  if (resultHasData || $('sample-button').dataset.seeding === '1') return;
  $('sample-button').dataset.seeding = '1';
  (async () => {
    let sampleRes = await fetch(SAMPLE_URL).catch(() => null);
    if (!sampleRes || !sampleRes.ok) {
      $('sample-button').dataset.seeding = '';
      return;
    }
    currentData = structuredClone(JSON.parse(await sampleRes.text()));
    $('fetched-at').textContent = '오늘 내장 예시(5개)';
    $('data-terms').textContent = '기술 출처가 공개로 낸 제목과 링크만 표시해요. 내용은 출처가 정한 조건 그대로입니다.';
    clearError();
    resetFilters();
    render();
  })();
}

function renderAnswer(result) {
  const top = result.topThree[0];
  const total = result.sourceSummary.uniqueStories;
  resultTopThree = result.topThree;
  const num = $('answer-num');
  num.innerHTML = '';
  if (!top) {
    num.appendChild(document.createTextNode('0'));
    const small = document.createElement('small');
    small.textContent = '위';
    num.appendChild(small);
    $('answer-text').textContent = '데이터가 준비되면 지금 가장 큰 소식부터 보여 드려요.';
    seedSample();
  } else {
    num.appendChild(document.createTextNode('1'));
    const small = document.createElement('small');
    small.textContent = total ? '개 중 1위' : '위';
    num.appendChild(small);
    $('answer-text').textContent = '지금 가장 크게 다뤄지는 소식: ' + top.title;
  }
  // 통계 3칸은 화면에서 뺐다. 남은 값 id는 DOM 에 없는 걸 참고:
  $('answer-total') && ($('answer-total').textContent = total + '개');
  $('answer-sources') && ($('answer-sources').textContent = result.sourceSummary.totalSources + '곳');
  const crossCount = result.filteredStories.filter((st) => st.crossConfirmed).length;
  $('answer-cross') && ($('answer-cross').textContent = crossCount + '개');
  const sum = $('summary-text');
  if (!resultHasData || !top || !total) {
    sum.hidden = true;
  } else {
    sum.hidden = false;
    $('summary-text').textContent =
      result.sourceSummary.totalSources + '곳에서 ' + total + '개 소식을 모았어요';
  }
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
    a.title = s.title;
    a.textContent = s.title.length > 60 ? s.title.slice(0, 60) + '…' : s.title;
    main.appendChild(a);
    const meta = makeEl('span', 'meta');
    meta.appendChild(makeEl('span', '', (total ? total + '개 중 ' : '') + (i + 1) + '위 · ' + ageText(s.ageHours)));
    for (const t of s.tiers) meta.appendChild(badge('기사 종류: ' + (TIER_NAME[t] || String(t)), 'tier-' + t));
    if (s.crossConfirmed) meta.appendChild(badge('여러 곳에서 다뤄진 소식', 'cross'));
    if (s.interest) meta.appendChild(badge('많은 사람이 찾는 주제', 'interest'));
    main.appendChild(meta);
    main.appendChild(makeEl('span', 'plain', plainText(s)));
    li.appendChild(main);
    const links = makeEl('div', 'links');
    for (const l of s.links.slice(0, 2)) links.appendChild(linkRow(l, true, s.title));
    if (links.children.length) li.appendChild(links);
    ul.appendChild(li);
  });
}

// 소식 하나를 누구나 아는 말로 한 줄로 풀어서 쓴다.
// 원문 제목은 영어인 경우가 많아, 뜻을 한 번 더 한국어로 붙여 주는 게 첫 화면 읽기 쉽게 한다.
const PLAIN_HINTS = [
  [/open[ -]?(?:weight|source)|openai/i, '누구나 쓸 수 있는 AI 모델(공개 모델) 관련 소식입니다.'],
  [/agent|agentic|claude|codex|chatgpt|gemini|llama|copilot|assistant/i, '컴퓨터가 대신 일을 하는 AI 도구나 그 활용법을 다루는 소식입니다.'],
  [/(?:api|pricing|price|cost|fee|rate)[\s-]?(?:update|change|cut|change|adjustment)?|price/i, 'AI 서비스를 쓰는 비용과 요금을 다루는 소식입니다.'],
  [/security|vulnerab|exploit|hack|injection|safe|safety/i, '보안과 안전 문제를 다루는 소식입니다.'],
  [/benchmark|evaluat|compare|test/i, '성능 비교와 시험 결과를 다루는 소식입니다.'],
  [/release|launch|introduc|announc|unveil|debut/i, '새 서비스나 제품 출고를 다루는 소식입니다.'],
  [/open[ -]?(?:source|sourced)/i, '공개(오픈소스) 프로젝트 관련 소식입니다.'],
];
function plainText(s) {
  let t = '';
  for (const [re, text] of PLAIN_HINTS) {
    if (re.test(s.title)) { t = text; break; }
  }
  if (!t) t = /[a-z]{3,}/i.test(s.title)
    ? '원문이 외국어라 어떤 내용인지 바로 보이지 않아요. 제목을 누르면 원문으로 이동해요.'
    : '지금 많은 곳에서 함께 전하고 있는 소식입니다.';
  if (s.crossConfirmed) t += ' ' + s.sourceCount + '곳에서 같은 내용으로 확인했어요.';
  return t;
}

// 첫 화면 '지금 가장 큰 소식 3개' 옆 복사 버튼: 블로그·쇼츠에 붙여넣을 줄 3개를 클립보드에 넣는다.
function copyTopThree() {
  const lines = resultTopThree.map((s, i) =>
    (i + 1) + '. ' + s.title + ' (' + s.sources.join(', ') + ' · 점수 ' + s.scoreRounded + ') ' + s.url
  ).join('\n');
  const done = (ok) => {
    const status = $('app-status');
    status.textContent = ok ? '복사했어요' : '복사하지 못했습니다. 브라우저가 클립보드 권한을 막고 있어요.';
    if (ok) setTimeout(() => { if (status.textContent === '복사했어요') status.textContent = ''; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lines).then(() => done(true)).catch(() => done(false));
  } else {
    done(false);
  }
}

// 처음 8개만 그린다. "더 보기"를 누를 때마다 8개씩 추가한다.
const PAGE_SIZE = 10;
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

// 속도계 빈 상태(데이터 없을 때): 안내 문구 + 예시로 해 보기 버튼
function speedEmptyLi() {
  const li = makeEl('li', 'empty speed-empty');
  li.appendChild(makeEl('p', 'empty-text', SPEED_EMPTY));
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

// AI 기업 속도계: 6개 칸 신호등. 칸을 누르면(링크를 안 누르면) 대표 소식 상세로 이동한다.
function renderSpeedometer(radarData) {
  const ul = $('speed-list');
  ul.innerHTML = '';
  const cells = buildSpeedometer(radarData);
  const hasAny = cells.some((c) => c.count > 0);
  if (!hasAny) {
    ul.appendChild(speedEmptyLi());
    return;
  }
  for (const c of cells) {
    const li = makeEl('li', 'speed-cell ' + c.level);
    // 칸 전체를 버튼으로: 어디를 눌러도 대표 소식 상세로 이동한다(0건 칸은 반응 없음).
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speed-btn ' + c.level;
    btn.disabled = !c.topUrl;
    const top = makeEl('span', 'speed-top');
    top.appendChild(makeEl('span', 'speed-dot ' + c.level));
    top.appendChild(makeEl('span', 'speed-name', c.name));
    btn.appendChild(top);
    btn.appendChild(makeEl('span', 'speed-label ' + c.level, c.label + ' · ' + c.count + '건'));
    btn.appendChild(makeEl('span', 'speed-link' + (c.topUrl ? '' : ' speed-link-off'), c.topUrl ? '대표 소식' : ''));
    li.appendChild(btn);
    // 칸을 누르면: 해당 기업의 대표 소식을 목록에서 찾아 여닫고 스크롤해 준다.
    // 대표 소식이 목록에 안 보이면(필터로 걸리면) 목록 바로 아래 상세 칸에 보여 주고,
    // 다시 누르면 닫는다. 0건 칸은 버튼을 비활성화해서 아무 반응이 없게 한다.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const detail = $('story-detail');
      // 대표 소식 상세를 열려 있을 때(어디에서든) 다시 누르면 닫는다.
      if (speedDetailFor && detail.querySelector('.speed-detail')) {
        restoreDetail();
        return;
      }
      const expanded = $('story-list').querySelector('.story[aria-expanded="true"]');
      if (expanded) expanded.click(); // 이미 열려 있으면 닫는다
      let target = jumpToStory(c.topUrl);
      if (target) {
        detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (c.topUrl) {
        showSpeedDetail(c);
      }
    });
    ul.appendChild(li);
  }
}

// 속도계 칸을 눌렀는데 대표 소식이 목록에 안 보이는 경우(필터로 걸렸을 때):
// 목록 바깥의 상세 칸(누른 칸 바로 아래쪽)에 대표 소식 원문 링크를 보여 준다.
// speedDetailFor 에 회사 id 를 남기고, 재클릭·렌더 시점에 닫아 준다.
let speedDetailFor = null;
function showSpeedDetail(c) {
  const detail = $('story-detail');
  restoreDetail();
  detail.innerHTML = '';
  const box = makeEl('div', 'speed-detail');
  box.appendChild(makeEl('p', 'speed-detail-head', c.name + ' 대표 소식 · ' + c.label + ' (목록에 없어 여기 보여 줘요)'));
  const a = document.createElement('a');
  a.href = c.topUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'link-title';
  a.textContent = c.name + ' 대표 소식 원문 보기';
  box.appendChild(a);
  detail.appendChild(box);
  speedDetailFor = c.id;
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 상세 칸에 열려 있는 속도계 대표 소식 상세를 닫는다.
function closeSpeedDetail() {
  if (!speedDetailFor) return;
  if ($('story-detail').querySelector('.speed-detail')) restoreDetail();
  speedDetailFor = null;
}

// URL 로부터 소식 상세로 이동한다. 해당 행에 원문 링크가 없으면(필터 등으로 안 보이면) 아무것도 안 한다.
function jumpToStory(url) {
  let abs;
  try {
    abs = new URL(url, document.baseURI).href;
  } catch {
    return null;
  }
  for (const li of $('story-list').querySelectorAll('.story')) {
    const a = li.querySelector('a');
    if (a && a.href === abs) {
      li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li.click();
      return li;
    }
  }
  return null;
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
    // 1행: 제목(2줄까지만) + 오른쪽 '원문·지표' 힌트. 항목을 누르면 아래에 원문 링크·지표를 바로 보여 준다.
    const row = makeEl('span', 'title-row');
    const title = makeEl('span', 'title', s.title.length > 60 ? s.title.slice(0, 60) + '…' : s.title);
    title.title = s.title;
    const chev = makeEl('span', 'chev', '▾ 원문·지표');
    row.appendChild(title);
    row.appendChild(chev);
    li.appendChild(row);
    const meta = makeEl('span', 'meta', '기사는 ' + s.sourceCount + '곳에서 · ' + ageText(s.ageHours));
    if (s.crossConfirmed) meta.appendChild(badge('여러 곳에서 다뤄진 소식', 'cross'));
    if (s.interest) meta.appendChild(badge('많은 사람이 찾는 주제', 'interest'));
    li.appendChild(meta);
    li.appendChild(makeEl('span', 'plain', plainText(s)));
    const show = () => renderDetail(s, li);
    const toggle = (e) => {
      // '원문·지표' 힌트를 직접 누르면 행 전체 토글 대신, 바로 아래 원문 링크·지표 상세만 여닫는다.
      if (e && e.target && e.target.closest && e.target.closest('.chev')) {
        const detail = $('story-detail');
        const wasOpen = li.getAttribute('aria-expanded') === 'true';
        renderDetail(s, li); // 토글(닫힘) 동작
        if (!wasOpen) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // 열면 상세로 스크롤
        return;
      }
      show(); // 행 나머지 부분을 누르면 기존과 동일하게 상세를 여닫는다.
    };
    li.addEventListener('click', toggle);
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
  if (typeof speedDetailFor !== 'undefined' && speedDetailFor) {
    speedDetailFor = null;
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
  for (const l of story.links) detail.appendChild(linkRow(l, false));
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
    '확인한 사이트 ' + summary.totalSources + '곳(모아 온 곳 ' + summary.okSources + '곳) · 기사 ' + summary.uniqueStories + '개';
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
    li.appendChild(makeEl('span', 'source-name', s.name));
    const bar = makeEl('span', 'bar');
    bar.style.width = (s.count / maxCount * 100) + '%';
    li.appendChild(bar);
    li.appendChild(makeEl('span', 'source-meta', (s.ok ? '정상적으로 모아 왔어요(' : '모아 오지 못했어요(') + s.count + '건) · 기사 종류: ' + (TIER_NAME[s.tier] || s.tier)));
    ul.appendChild(li);
  }
}

// '모델 출시·가격' 구역: data/ai_models.json 의 [{title, params, price, url}] — 0개면 숨긴다.
const MODEL_CARD_LIMIT = 8;
let modelsCache = null;

function renderModelList(models) {
  const ul = $('model-list');
  const section = $('models-section');
  ul.innerHTML = '';
  if (!models.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('models-count').textContent = models.length + '개';
  for (const m of models.slice(0, MODEL_CARD_LIMIT)) {
    const li = makeEl('li', 'model');
    const mt = makeEl('span', 'model-title', m.title);
    mt.title = m.title;
    li.appendChild(mt);
    const meta = makeEl('span', 'meta', (m.params ? '파라미터 ' + m.params : '') + (m.params && m.price ? ' · ' : '') + (m.price ? '가격 ' + m.price : ''));
    if (!m.params && !m.price) meta.textContent = '상세 값은 원문 링크에서 확인해요';
    if (m.name) {
      const src = makeEl('span', 'source-name');
      src.textContent = m.name;
      src.title = '출처: ' + m.name;
      li.appendChild(src);
    }
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
    li.appendChild(makeEl('span', 'meta', '전체 목록은 위에서 등급·정렬을 바꾸어 볼 수 있어요.'));
    ul.appendChild(li);
  }
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
}

function render() {
  if (!currentData) {
    clearLists();
    resultTopThree = [];
    renderAnswer({ topThree: [], filteredStories: [], sourceSummary: { totalSources: 0, okSources: 0, collectedItems: 0, uniqueStories: 0 } });
    renderSpeedometer({ stories: [] });
    renderTopThree([]);
    renderStoryList([]);
    return;
  }
  const result = buildRadarBoard(currentData, currentFilter());
  resultHasData = true;
  resultUniqueStories = result.sourceSummary.uniqueStories;
  renderAnswer(result);
  renderSpeedometer(currentData);
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
  $('copy-button').addEventListener('click', copyTopThree);
  $('sample-button').addEventListener('click', async () => {
    try {
      // 받아 둔 실제 데이터를 우선 쓰고, 읽지 못하면 내장 예시로 대체한다.
      let sampleRes = await fetch(DATA_URL);
      if (!sampleRes.ok) sampleRes = await fetch(SAMPLE_URL);
      if (!sampleRes.ok) throw new Error('HTTP ' + sampleRes.status);
      currentData = structuredClone(JSON.parse(await sampleRes.text()));
      $('fetched-at').textContent = '오늘 내장 예시(5개)';
      $('data-terms').textContent = '기술 출처가 공개로 낸 제목과 링크만 표시해요. 내용은 출처가 정한 조건 그대로입니다.';
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
      seedSample();
    }
  })();
}

init();
