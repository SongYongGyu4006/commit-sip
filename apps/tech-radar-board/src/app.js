// 기술 레이더 보드 — 순수 로직. 이 모듈을 import 하면 화면·저장소·전역에 영향을 주지 않는다.
// UI와 데이터 로딩은 index.html 이 담당한다.

const round1 = (x) => Math.round(x * 10) / 10;

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntegerIn(v, lo, hi) {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// 출처 행: 하나라도 어긋나면 쓸 수 없는(U) 행이라 조용히 제외한다.
function usableSource(row, seenIds) {
  if (!isPlainObject(row)) return false;
  if (typeof row.id !== 'string' || row.id.trim() === '') return false;
  if (seenIds.has(row.id)) return false;
  if (typeof row.name !== 'string') return false;
  if (!isIntegerIn(row.tier, 1, 4)) return false;
  if (!isIntegerIn(row.count, 0, Infinity)) return false;
  if (typeof row.ok !== 'boolean') return false;
  return true;
}

// 소식 행: 보드가 읽는 모든 필드가 존재·타입·범위를 만족해야 쓸 수 있다.
function usableStory(row, sourceIds) {
  if (!isPlainObject(row)) return false;
  if (typeof row.title !== 'string' || row.title.trim() === '') return false;
  if (typeof row.url !== 'string' || row.url.trim() === '') return false;
  if (!isFiniteNumber(row.score) || row.score < 0 || row.score > 100) return false;
  if (!isFiniteNumber(row.age_h) || row.age_h < 0) return false;
  if (typeof row.interest !== 'boolean') return false;
  if (row.cross_confirmed !== undefined && typeof row.cross_confirmed !== 'boolean') return false;
  if (!Array.isArray(row.sources) || !Array.isArray(row.tiers) || !Array.isArray(row.links)) return false;
  for (const s of row.sources) if (typeof s !== 'string' || s.trim() === '' || !sourceIds.has(s)) return false;
  for (const t of row.tiers) if (!isIntegerIn(t, 1, 4)) return false;
  for (const l of row.links) {
    if (!isPlainObject(l)) return false;
    if (typeof l.source !== 'string' || l.source.trim() === '' || !sourceIds.has(l.source)) return false;
    if (typeof l.title !== 'string' || typeof l.url !== 'string') return false;
    if (l.metric !== undefined && l.metric !== null && typeof l.metric !== 'string') return false;
  }
  return true;
}

function normalize(row, okSourceIds) {
  const distinct = [...new Set(row.sources)];
  const okDistinct = new Set(distinct.filter((id) => okSourceIds.has(id)));
  return {
    title: row.title.trim(),
    url: row.url.trim(),
    scoreRounded: round1(row.score),
    ageHours: round1(row.age_h),
    sourceCount: distinct.length,
    sources: row.sources.slice(),
    tiers: [...new Set(row.tiers)].sort((a, b) => a - b),
    crossConfirmed: okDistinct.size >= 2,
    interest: row.interest,
    links: row.links.map((l) => ({
      source: l.source,
      title: l.title,
      url: l.url,
      metric: l.metric == null ? '' : String(l.metric),
    })),
  };
}

// 점수 내림 → 출처 수 내림 → 나이 오름 → 제목 오름 (UTF-16 코드 단위)
const cmpScore = (a, b) =>
  b.scoreRounded - a.scoreRounded ||
  b.sourceCount - a.sourceCount ||
  a.ageHours - b.ageHours ||
  (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

// 나이 오름 → 점수 내림 → 제목 오름
const cmpRecent = (a, b) =>
  a.ageHours - b.ageHours ||
  b.scoreRounded - a.scoreRounded ||
  (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

// AI 기업 속도계: 6개 기업이 최근 24시간에 낸 소식 수를 신호등으로 센다.
// 뉴스 속보처럼 같은 소식이 여러 출처에 중복 집계되는 걸 막기 위해 제목을 정규화해 중복을 제거한다.
// (buildRadarBoard 는 건드리지 않는다.)
const SPEED_COMPANIES = [
  { id: 'openai', name: 'OpenAI', re: /openai|chatgpt|gpt|sora|dall/i },
  { id: 'google', name: 'Google·DeepMind', re: /google|deepmind|gemini|genie/i },
  { id: 'anthropic', name: 'Anthropic', re: /anthropic|claude/i },
  { id: 'meta', name: 'Meta', re: /\bmeta\b|llama|instagram|whatsapp|facebook/i },
  { id: 'microsoft', name: 'Microsoft', re: /microsoft|copilot|azure/i },
  { id: 'xai', name: 'xAI', re: /\bxai\b|grok/i },
];

function normTitle(t) {
  return t.replace(/[^a-z0-9가-힣]+/gi, ' ').trim().toLowerCase().slice(0, 80);
}

export function buildSpeedometer(radarData) {
  if (!isPlainObject(radarData) || !Array.isArray(radarData.stories)) {
    throw new TypeError('radarData 는 stories 배열이 있는 객체여야 합니다.');
  }
  const rows = radarData.stories.filter((r) => isPlainObject(r) && typeof r.title === 'string' && r.title.trim() !== '');
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const key = normTitle(r.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return SPEED_COMPANIES.map((c) => {
    let best = null;
    let count = 0;
    for (const s of unique) {
      if (!c.re.test(s.title)) continue;
      const fresh = typeof s.age_h === 'number' && Number.isFinite(s.age_h) && s.age_h <= 24;
      if (!fresh) continue;
      count += 1;
      if (best === null || (typeof s.score === 'number' && s.score > best.score)) best = s;
    }
    const level = count >= 3 ? 'fast' : count >= 1 ? 'mid' : 'quiet';
    return {
      id: c.id,
      name: c.name,
      count,
      level,
      label: level === 'fast' ? '빠름' : level === 'mid' ? '보통' : '조용',
      topUrl: best && typeof best.url === 'string' ? best.url.trim() : '',
      topScore: best && typeof best.score === 'number' && Number.isFinite(best.score) ? Math.round(best.score * 10) / 10 : null,
    };
  });
}

export function buildRadarBoard(radarData, filter) {
  if (!isPlainObject(radarData)) throw new TypeError('radarData 는 객체여야 합니다.');
  if (!Array.isArray(radarData.stories)) throw new TypeError('stories 는 배열이어야 합니다.');
  if (!Array.isArray(radarData.sources)) throw new TypeError('sources 는 배열이어야 합니다.');
  if (!isPlainObject(filter)) throw new TypeError('filter 는 객체여야 합니다.');
  if (typeof filter.tier !== 'number') throw new TypeError('tier 는 숫자여야 합니다.');
  if (typeof filter.interestOnly !== 'boolean') throw new TypeError('interestOnly 는 불리언이어야 합니다.');
  if (typeof filter.crossConfirmedOnly !== 'boolean') throw new TypeError('crossConfirmedOnly 는 불리언이어야 합니다.');
  if (typeof filter.sortBy !== 'string') throw new TypeError('sortBy 는 문자열이어야 합니다.');
  if (!isIntegerIn(filter.tier, 0, 4)) throw new RangeError('tier 는 0~4 의 정수여야 합니다.');
  if (filter.sortBy !== 'score' && filter.sortBy !== 'recent') throw new RangeError("sortBy 는 'score' 또는 'recent' 여야 합니다.");

  const seenIds = new Set();
  const sources = [];
  for (const row of radarData.sources) {
    if (!usableSource(row, seenIds)) continue;
    seenIds.add(row.id);
    sources.push({ id: row.id, name: row.name, tier: row.tier, ok: row.ok, count: row.count });
  }
  const okSourceIds = new Set(sources.filter((s) => s.ok === true).map((s) => s.id));
  const allSourceIds = new Set(sources.map((s) => s.id));

  const stories = [];
  for (const row of radarData.stories) {
    if (!usableStory(row, allSourceIds)) continue;
    stories.push(normalize(row, okSourceIds));
  }

  const topThree = stories.slice().sort(cmpScore).slice(0, 3);

  const filtered = stories.filter(
    (s) =>
      (filter.tier === 0 || s.tiers.includes(filter.tier)) &&
      (!filter.interestOnly || s.interest === true) &&
      (!filter.crossConfirmedOnly || s.crossConfirmed === true),
  );
  const filteredStories = filtered
    .slice()
    .sort(filter.sortBy === 'recent' ? cmpRecent : cmpScore);

  const sourceSummary = {
    totalSources: sources.length,
    okSources: sources.filter((s) => s.ok === true).length,
    collectedItems: sources.reduce((sum, s) => sum + s.count, 0),
    uniqueStories: stories.length,
  };

  return {
    topThree,
    filteredStories,
    totalFiltered: filteredStories.length,
    sourceSummary,
    sources: sources
      .slice()
      .sort((a, b) => a.tier - b.tier || b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}
