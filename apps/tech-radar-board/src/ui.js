// 화면 로직: 데이터 fetch, 예시 버튼, 필터, 렌더링. 순수 함수는 app.js 의 buildRadarBoard.
import { buildRadarBoard } from './app.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_FILTER = { tier: 0, interestOnly: false, crossConfirmedOnly: false, sortBy: 'score' };
const TIER_NAME = { 1: '공식', 2: '언론', 3: '전문가', 4: '커뮤니티' };
const DATA_URL = 'data/tech_radar.json';
const META_URL = 'data/tech_radar.meta.json';
const SAMPLE_URL = 'samples/tech_radar_예시.json';

let currentData = null;

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
  $('source-summary-text').textContent = '';
}

function setError(message) {
  $('app-status').textContent = message;
  clearLists();
  $('source-summary-text').textContent = '데이터가 준비되면 수집 현황을 여기에 표시합니다.';
  $('data-terms').textContent = '이용 조건은 데이터가 준비되면 여기에 표시됩니다.';
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

function renderTopThree(items) {
  const ul = $('top-three-list');
  ul.innerHTML = '';
  if (!items.length) {
    ul.appendChild(makeEl('li', 'empty', "데이터를 불러오지 못했습니다. 맨 위의 '예시로 해 보기' 버튼을 눌러 보세요."));
    return;
  }
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
    const meta = makeEl('span', 'meta', '100점 만점 중 ' + s.scoreRounded + '점');
    for (const t of s.tiers) meta.appendChild(badge(TIER_NAME[t] || String(t), 'tier-' + t));
    meta.appendChild(makeEl('span', '', ' · '));
    meta.appendChild(makeEl('span', '', ageText(s.ageHours)));
    meta.appendChild(makeEl('span', '', ' · 출처 ' + s.sourceCount + '곳'));
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

function renderStoryList(items) {
  const ul = $('story-list');
  restoreDetail();
  ul.innerHTML = '';
  if (!items.length) {
    ul.appendChild(makeEl('li', 'empty', '조건에 맞는 소식이 없습니다. 등급·정렬·체크를 바꾸거나 초기화를 눌러 보세요.'));
    $('filtered-count').textContent = '';
    return;
  }
  $('filtered-count').textContent = '모두 ' + items.length + '개';
  lastStoryItems = items;
  if (!items.length) {
    ul.appendChild(makeEl('li', 'empty', "데이터를 불러오지 못했습니다. 맨 위의 '예시로 해 보기' 버튼을 눌러 보세요."));
    return;
  }
  const shown = items.slice(0, visibleCount);
  shown.forEach((s) => {
    const li = makeEl('li', 'story');
    li.tabIndex = 0;
    li.setAttribute('aria-expanded', 'false');
    li.appendChild(makeEl('span', 'title', s.title));
    const meta = makeEl('span', 'meta', '점수 ' + s.scoreRounded + ' · 출처 ' + s.sourceCount + '곳 · ' + ageText(s.ageHours));
    for (const t of s.tiers) meta.appendChild(badge(TIER_NAME[t] || String(t), 'tier-' + t));
    meta.appendChild(badge(s.crossConfirmed ? '교차 확인' : '단일 출처', s.crossConfirmed ? 'cross' : 'cross muted'));
    meta.appendChild(badge(s.interest ? '관심 주제' : '일반 소식', s.interest ? 'interest' : 'interest muted'));
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
// ul.innerHTML='' 이면 ul 안의 자식 전체가 지워지므로 상세 칸은 ul 밖에 두어야 한다.
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
  if (li.getAttribute('aria-expanded') === 'true') {
    // 같은 항목을 다시 누르면 접는다.
    restoreDetail();
    li.setAttribute('aria-expanded', 'false');
    return;
  }
  detail.innerHTML = '';
  for (const l of story.links) {
    const row = makeEl('div', 'link');
    row.appendChild(makeEl('span', 'link-source', l.source + (l.metric ? ' · ' + l.metric : '')));
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'link-title';
    a.textContent = l.title;
    row.appendChild(a);
    detail.appendChild(row);
  }
  if (!story.links.length) {
    detail.appendChild(makeEl('p', 'empty', '출처 링크가 아직 수집되지 않았습니다.'));
  }
  li.after(detail);
  for (const other of list.querySelectorAll('.story[aria-expanded="true"]')) {
    if (other !== li) other.setAttribute('aria-expanded', 'false');
  }
  li.setAttribute('aria-expanded', 'true');
}

// render() 호출 등 새 렌더 시: 상세를 비우고 원래 자리로 되돌린다.
function collapseDetail() {
  restoreDetail();
  for (const other of $('story-list').querySelectorAll('.story[aria-expanded="true"]')) {
    other.setAttribute('aria-expanded', 'false');
  }
}

function renderSourceSummary(summary) {
  $('source-summary-text').textContent =
    '출처 ' + summary.totalSources + ' 곳 · 성공 ' + summary.okSources + ' 곳 · 수집 ' + summary.collectedItems + '개 · 소식 ' + summary.uniqueStories + '개';
}

function renderSourceStatus(sources) {
  const ul = $('source-status-list');
  ul.innerHTML = '';
  if (!sources.length) {
    ul.appendChild(makeEl('li', 'empty', "데이터를 불러오지 못했습니다. 맨 위의 '예시로 해 보기' 버튼을 눌러 보세요."));
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

function render() {
  if (!currentData) {
    clearLists();
    renderTopThree([]);
    renderStoryList([]);
    return;
  }
  const result = buildRadarBoard(currentData, currentFilter());
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
  $('sample-button').addEventListener('click', async () => {
    try {
      // 받아 둔 실제 데이터를 우선 쓰고, 읽지 못하면 내장 예시로 대체한다.
      let sampleRes = await fetch(DATA_URL);
      if (!sampleRes.ok) sampleRes = await fetch(SAMPLE_URL);
      if (!sampleRes.ok) throw new Error('HTTP ' + sampleRes.status);
      currentData = structuredClone(JSON.parse(await sampleRes.text()));
      $('fetched-at').textContent = '내장 예시 데이터';
      $('data-terms').textContent = '공개 피드에서 모은 제목·링크·지표만 표시합니다.';
      $('app-status').textContent = '';
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
  (async () => {
    try {
      const [radarText, metaText] = await Promise.all([fetch(DATA_URL), fetch(META_URL)]);
      if (!radarText.ok || !metaText.ok) throw new Error('HTTP ' + radarText.status + ' / ' + metaText.status);
      currentData = JSON.parse(await radarText.text());
      const meta = JSON.parse(await metaText.text());
      $('fetched-at').textContent = formatFetchedAt(meta.fetched_at);
      $('data-terms').textContent = meta.terms || '이용 조건은 데이터가 준비되면 여기에 표시됩니다.';
      $('app-status').textContent = '';
      render();
    } catch (err) {
      setError('기술 레이더 데이터를 불러오지 못했습니다. 예시로 해 보기 버튼을 눌러 확인하세요.');
    }
  })();
}

init();
