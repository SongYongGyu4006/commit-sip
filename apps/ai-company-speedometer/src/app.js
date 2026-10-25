// AI Company Velocity — 순수 계산 모듈(브라우저/Node 공용, 전역 부작용 없음)

export const CANONICAL_COMPANIES = ['OpenAI', 'Anthropic', 'Google', 'Mistral', 'xAI', 'Meta'];

const COMPANIES = {
  OpenAI: { keywords: ['openai', 'chatgpt', 'gpt-4', 'gpt-5', 'o1', 'o3'], prefixes: ['openai/'] },
  Anthropic: { keywords: ['anthropic', 'claude'], prefixes: ['anthropic/', 'anthropics/'] },
  Google: { keywords: ['google', 'deepmind', 'gemini', 'gemma'], prefixes: ['google/', 'google-deepmind/'] },
  Mistral: { keywords: ['mistral', 'ministral', 'pixtral', 'codestral', 'timestral'], prefixes: ['mistralai/'] },
  xAI: { keywords: ['xai', 'grok'], prefixes: ['xai-org/'] },
  Meta: { keywords: ['meta ai', 'fairseq'], prefixes: ['meta-llama/', 'facebook/', 'facebookresearch/'] },
};

const SOURCE_TO_COMPANY = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepmind: 'Google',
  mistral: 'Mistral',
  'x.ai': 'xAI',
  xai: 'xAI',
  meta: 'Meta',
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// 키워드 매칭: 공백 없는 키워드는 전체 단어(좌우에 문자 아님)으로만, 공백 있는 키워드는 부분 문자열로
function keywordMatch(text, keywords) {
  const t = ' ' + text.toLowerCase() + ' ';
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (k.includes(' ')) {
      if (t.includes(k)) return true;
    } else {
      let i = t.indexOf(k);
      while (i !== -1) {
        const before = t[i - 1];
        const after = t[i + k.length];
        if ((before === undefined || before === ' ' || !/[a-z0-9]/.test(before)) &&
            (after === undefined || after === ' ' || !/[a-z0-9]/.test(after))) return true;
        i = t.indexOf(k, i + 1);
      }
    }
  }
  return false;
}

// URL 정규화: host 소문자, http/https 동일, fragment 제거, 트래킹 쿼리(utm_*/ref/source/fbclid/gclid) 제거,
// 끝 '/' 제거 — 파싱에 실패하면 원문을 소문자로 사용해 중복 키로 그대로 사용
export function normalizeUrl(url) {
  const s = String(url == null ? '' : url);
  let u;
  try { u = new URL(s); } catch { return s.toLowerCase(); }
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  let q = u.search;
  if (q) {
    const keep = [];
    for (const [k, v] of new URLSearchParams(q)) {
      if (k === 'ref' || k === 'source' || k === 'fbclid' || k === 'gclid' || k.startsWith('utm_')) continue;
      keep.push((v === '' ? k : k + '=' + v));
    }
    q = keep.join('&');
    if (q === '') q = '';
    else q = '?' + q;
  }
  // SPEC: http와 https를 동일하게 취급 → 두 개 모두 'https'로 정규화
  const scheme = u.protocol === 'http:' || u.protocol === 'https:' ? 'https' : u.protocol.replace(/:$/, '');
  return scheme + '://' + u.hostname.toLowerCase() + (u.port ? ':' + u.port : '') + path + q;
}

const parseMs = (v) => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

// rawData 형태 검증: 잘못된 형상은 TypeError, 필드 누락/추가 필드는 무시
function validateRawData(rawData) {
  if (!isPlainObject(rawData)) throw new TypeError('rawData는 일반 객체여야 합니다.');
  for (const key of ['techRadar', 'hfModels', 'ghNewRepos', 'hnFront']) {
    if (!(key in rawData)) throw new TypeError('rawData에 ' + key + ' 키가 없습니다.');
  }
  if (!isPlainObject(rawData.techRadar) || !Array.isArray(rawData.techRadar.stories)) throw new TypeError('rawData.techRadar.stories 형식이 아닙니다.');
  if (!Array.isArray(rawData.hfModels)) throw new TypeError('rawData.hfModels 형식이 아닙니다.');
  if (!isPlainObject(rawData.ghNewRepos) || !Array.isArray(rawData.ghNewRepos.items)) throw new TypeError('rawData.ghNewRepos.items 형식이 아닙니다.');
  if (!isPlainObject(rawData.hnFront) || !Array.isArray(rawData.hnFront.hits)) throw new TypeError('rawData.hnFront.hits 형식이 아닙니다.');
}

function matchesCompany(company, text) {
  const c = COMPANIES[company];
  const s = String(text || '').toLowerCase();
  return c.prefixes.some((p) => s.startsWith(p)) || keywordMatch(String(text || ''), c.keywords);
}

const signalFromCount = (n) => (n >= 2 ? 'GREEN' : n === 1 ? 'AMBER' : 'RED');

// 레이더·HN 뉴스를 정규화 url로 중복 제거: 점수가 높은 쪽의 title/url/score/ageH 유지, kind 병합('RADAR+HN')
// 레이더는 score, HN은 points가 각각의 "점수" → 유효 점수로 비교해 높은 쪽을 유지한다.
function newsScore(item) {
  return item.kind === 'HN' ? Number(item.points || 0) : Number(item.score || 0);
}
function dedupNews(radarItems, hnItems) {
  const byUrl = new Map();
  for (const it of [...radarItems, ...hnItems]) {
    const k = normalizeUrl(it.url);
    const ex = byUrl.get(k);
    if (!ex) {
      byUrl.set(k, { ...it, _wonHn: it.kind === 'HN' });
    } else {
      // 이긴 쪽의 data 필드(title/url/점수/ageH)를 유지하되, sourceType은 두 원본 kind로 병합('RADAR+HN').
      // kind는 이긴 쪽 원본 kind를 유지해 점수·ageH를 이긴 쪽 값으로 매핑하고, _merged로 병합 여부를 기록한다.
      const exKind = String(ex.kind || '');
      const itKind = String(it.kind || '');
      if (newsScore(it) > newsScore(ex)) {
        ex.title = it.title; ex.url = it.url; ex.score = it.score; ex.age_h = it.age_h; ex.created_at = it.created_at; ex.points = it.points; ex.kind = it.kind; ex._wonHn = itKind === 'HN';
      } else {
        ex._wonHn = exKind === 'HN';
      }
      if (exKind !== itKind) ex.kind = exKind === 'RADAR' ? 'RADAR+HN' : itKind === 'RADAR' ? 'RADAR+HN' : exKind + itKind;
    }
  }
  return [...byUrl.values()];
}

const companyMatches = {
  story: (c, item) => {
    if (Array.isArray(item.sources) && item.sources.some((s) => SOURCE_TO_COMPANY[String(s).toLowerCase()] === c)) return true;
    return keywordMatch(String(item.title || '') + ' ' + String(item.url || ''), COMPANIES[c].keywords);
  },
  hit: (c, item) => keywordMatch(String(item.title || '') + ' ' + String(item.url || ''), COMPANIES[c].keywords),
  model: (c, item) => matchesCompany(c, item.id),
  repo: (c, item) => matchesCompany(c, String(item.full_name || '') + ' ' + String(item.description || '')),
};

export function buildCompanyVelocityMatrix(selectedCompanies, rawData, nowIso) {
  // 0) nowIso 우선 검증(문자열 + 파싱 가능)
  if (typeof nowIso !== 'string' || !Number.isFinite(Date.parse(nowIso))) throw new TypeError('nowIso는 ISO-8601 문자열이어야 합니다.');
  // 1) 배열 여부
  if (!Array.isArray(selectedCompanies)) throw new TypeError('selectedCompanies는 배열이어야 합니다.');
  // 2) 문자열 여부
  for (const c of selectedCompanies) {
    if (typeof c !== 'string') throw new TypeError('selectedCompanies의 각 요소는 문자열이어야 합니다.');
  }
  // 3) 유효 키 여부
  for (const c of selectedCompanies) {
    if (!CANONICAL_COMPANIES.includes(c)) throw new RangeError('알 수 없는 기업입니다: ' + c);
  }
  // 4) 중복 여부
  if (new Set(selectedCompanies).size !== selectedCompanies.length) throw new RangeError('기업 키가 중복됩니다.');

  validateRawData(rawData);

  const activeCompanies = selectedCompanies.length ? CANONICAL_COMPANIES.filter((c) => selectedCompanies.includes(c)) : CANONICAL_COMPANIES;
  const nowMs = Date.parse(nowIso);
  const WINDOW_H = 168;

  const stories = rawData.techRadar.stories;
  const models = rawData.hfModels;
  const repos = rawData.ghNewRepos.items;
  const hits = rawData.hnFront.hits;

  // --- summary24hCount: 24시간 내 신규 소식(정규화 url 중복 제거) ---
  const seen24 = new Set();
  let summary24hCount = 0;
  for (const s of stories) {
    if (typeof s.age_h === 'number' && s.age_h >= 0 && s.age_h <= 24) {
      const k = normalizeUrl(s.url);
      if (!seen24.has(k)) { seen24.add(k); summary24hCount++; }
    }
  }
  for (const h of hits) {
    const created = parseMs(h.created_at);
    if (created === null) continue;
    const elapsed = nowMs - created;
    if (elapsed < 0 || elapsed > 24 * 3600000) continue;
    const k = normalizeUrl(h.url);
    if (!seen24.has(k)) { seen24.add(k); summary24hCount++; }
  }

  const matrix = activeCompanies.map((company) => {
    // 각 출처별 매칭(전체 수집 범위)
    const inWindowMs = (t) => (t === null ? null : (nowMs - t) / 3600000);

    const mModels = models.filter((m) => companyMatches.model(company, m));
    const mRepos = repos.filter((r) => companyMatches.repo(company, r));
    // 뉴스는 정규화 url 기준으로 중복 제거(레이더/HN 같은 기사) 후 매칭
    const newsItems = dedupNews(
      stories.filter((s) => companyMatches.story(company, s)).map((s) => ({ kind: 'RADAR', ...s })),
      hits.filter((h) => companyMatches.hit(company, h)).map((h) => ({ kind: 'HN', ...h })),
    );

    // --- 7일 관찰창(elapsedH 0..168) 카운트; nowIso 이후 timestamp은 "없음"으로 취급 ---
    const modelWindowCount = mModels.filter((m) => {
      const h = inWindowMs(parseMs(m.created || m.createdAt));
      return h !== null && h >= 0 && h <= WINDOW_H;
    }).length;

    const repoWindowCount = mRepos.filter((r) => {
      const h = inWindowMs(parseMs(r.created_at || r.created));
      return h !== null && h >= 0 && h <= WINDOW_H;
    }).length;

    const radarWindowCount = newsItems
      .filter((n) => n.kind === 'RADAR')
      .filter((n) => typeof n.age_h === 'number' && n.age_h >= 0 && n.age_h <= WINDOW_H).length;

    const hnWindowCount = newsItems
      .filter((n) => n.kind === 'HN')
      .filter((n) => {
        const h = inWindowMs(parseMs(n.created_at));
        return h !== null && h >= 0 && h <= WINDOW_H;
      }).length;

    const newsWindowCount = radarWindowCount + hnWindowCount;
    const velocityScore = modelWindowCount * 3 + repoWindowCount * 2 + newsWindowCount;

    // --- topN 리스트(전체 매칭, 창 무관) ---
    const topModels = [...mModels]
      .sort((a, b) =>
        Number(b.trendingScore || 0) - Number(a.trendingScore || 0) ||
        Number(b.downloads || 0) - Number(a.downloads || 0) ||
        String(a.id || '').localeCompare(String(b.id || '')))
      .slice(0, 3)
      .map((m) => {
        const st = m.safetensors;
        return {
          id: String(m.id || ''),
          trendingScore: Number(m.trendingScore || 0),
          downloads: Number(m.downloads || 0),
          weightSizeGB: isPlainObject(st) && typeof st.total === 'number' && st.total > 0 ? Math.round((st.total / 1e9) * 10) / 10 : null,
        };
      });

    const topRepos = [...mRepos]
      .sort((a, b) => Number(b.stargazers_count || 0) - Number(a.stargazers_count || 0) || String(a.full_name || '').localeCompare(String(b.full_name || '')))
      .slice(0, 3)
      .map((r) => ({
        fullName: String(r.full_name || ''),
        url: String(r.html_url || ''),
        stars: Number(r.stargazers_count || 0),
      }));

    // 점수·ageH: RADAR+HN 병합 항목은 이긴 쪽(radar→score, HN→points) 값을 따른다.
    const topStories = newsItems
      .map((n) => {
        const sourceType = n.kind === 'RADAR' ? 'RADAR' : n.kind === 'HN' ? 'HN' : 'RADAR+HN';
        const wonHn = n._wonHn === true ? true : n.kind === 'HN';
        return {
          sourceType,
          title: String(n.title || ''),
          url: String(n.url || ''),
          score: wonHn ? Number(n.points || 0) : Number(n.score || 0),
          ageH: wonHn ? null : (typeof n.age_h === 'number' ? Math.round(n.age_h * 10) / 10 : null),
        };
      })
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 5);

    // newsWindowCount(정규화 url 중복 제거)를 newsCount로 사용해 신호·스코어가 서로 일치하게 함
    return {
      company,
      velocityScore,
      overallSignal: velocityScore >= 6 ? 'GREEN' : velocityScore >= 2 ? 'AMBER' : 'RED',
      signals: {
        modelSignal: signalFromCount(modelWindowCount),
        repoSignal: signalFromCount(repoWindowCount),
        hnSignal: signalFromCount(newsWindowCount),
      },
      counts: {
        modelCount: modelWindowCount,
        repoCount: repoWindowCount,
        radarCount: radarWindowCount,
        hnCount: hnWindowCount,
        newsCount: newsWindowCount,
      },
      topModels,
      topRepos,
      topStories,
    };
  });

  return { activeCompanies, summary24hCount, matrix };
}

/* ============================ 브라우저 UI ============================
   (여기 아래는 브라우저 전용: DOM 렌더링. Node import 시 실행되지 않는다) */

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const statusEl = $('app-status');
  const matrixBody = $('matrix-body');
  const matrixEmpty = $('matrix-empty');
  const sectionsEl = $('company-sections');
  const jsonEl = $('matrix-json');
  const resultSummaryEl = $('result-summary');
  const toggles = [...document.querySelectorAll('input.company-toggle')];
  const fetchedAtEl = $('fetched-at-kst');
  const summary24El = $('summary-24h-count');
  const sourceTermsEl = $('source-terms');

  const DEFAULT_SUMMARY = '6개 회사 모두를 보고 있어요. 위 파란 버튼을 누르면 Mistral과 Anthropic만 비교해요.';

  const SOURCE_DEFS = [
    { id: 'tech_radar', key: 'techRadar', label: '기술 레이더' },
    { id: 'hf_models', key: 'hfModels', label: 'Hugging Face 모델' },
    { id: 'gh_new_repos', key: 'ghNewRepos', label: 'GitHub 신규 저장소' },
    { id: 'hn_front', key: 'hnFront', label: 'Hacker News 1면' },
  ];

  const state = {
    rawData: null, // { techRadar, hfModels, ghNewRepos, hnFront }
    metas: [], // [{label, fetchedAt, terms}]
    result: null,
  };

  // fetched_at('2026-10-20T08:19:00' 등)을 아시아/서울 기준 'YYYY-MM-DD HH:mm KST'
  function formatKst(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(t));
    const get = (type) => { const p = parts.find((x) => x.type === type); return p ? p.value : ''; };
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} 한국 시간`;
  }

  function showStatus(msg) { statusEl.innerHTML = ''; if (msg) statusEl.appendChild(Object.assign(document.createElement('div'), { className: 'ds-status ds-status-bad', textContent: msg })); }

  function clearResults() {
    matrixBody.innerHTML = '';
    sectionsEl.innerHTML = '';
    jsonEl.textContent = '';
    matrixEmpty.hidden = true;
    resultSummaryEl.textContent = DEFAULT_SUMMARY;
  }

  function selectedCompanies() {
    // UX-REVIEW 4.1: 모두 꺼 놓으면 "전체"가 아니라 "아무도 선택되지 않음" → 빈 결과 상태.
    const set = new Set(toggles.filter((t) => t.checked).map((t) => t.value));
    return [...set];
  }

  const SIGNAL_COLOR = { GREEN: '초록', AMBER: '주황', RED: '빨강' };
  function renderResultSummary(result) {
    if (!result.matrix.length) return '선택된 기업이 없어요. 위 토글에서 기업을 골라 주세요.';
    if (result.matrix.length === 1) {
      const r = result.matrix[0];
      return `${r.company}: ${r.velocityScore}점, 종합 ${SIGNAL_COLOR[r.overallSignal] || ''}`;
    }
    let fastest = result.matrix[0];
    let slowest = result.matrix[0];
    for (const r of result.matrix) {
      if (r.velocityScore > fastest.velocityScore) fastest = r; // 동점이면 표 순서상 앞
      if (r.velocityScore < slowest.velocityScore) slowest = r;
    }
    if (fastest.velocityScore === slowest.velocityScore) {
      return `${fastest.company} 등 ${result.matrix.length}개 기업이 모두 ${fastest.velocityScore}점으로 ${SIGNAL_COLOR[fastest.overallSignal] || ''} 신호예요.`;
    }
    return `결론: 최근 7일 가장 활발한 곳은 ${fastest.company}(${fastest.velocityScore}점), 가장 조용한 곳은 ${slowest.company}(${slowest.velocityScore}점)`;
  }
  function makeSignal(kind, label, count) {
    const span = document.createElement('span');
    span.className = 'signal ' + kind;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const text = document.createElement('span');
    text.className = 'label-text';
    text.textContent = label;
    span.append(dot, text);
    if (count !== null) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = `(${count})`;
      span.append(c);
    }
    // 접근성: 색은 스크린리더에 안 보이므로 색 이름(초록·주황·빨강)을 텍스트로 덧붙인다.
    const color = SIGNAL_COLOR[kind] || '';
    const bits = [label];
    if (count !== null) bits.push(`최근 7일 ${count}건`);
    if (color) bits.push(color);
    span.setAttribute('aria-label', bits.join(', '));
    return span;
  }

  const num = (n) => n.toLocaleString('ko-KR');

  function renderMatrix(result) {
    matrixBody.innerHTML = '';
    for (const row of result.matrix) {
      const tr = document.createElement('tr');
      tr.dataset.company = row.company;
      const tdCo = document.createElement('td');
      tdCo.className = 'company-cell';
      tdCo.textContent = row.company;
      const tdScore = document.createElement('td');
      tdScore.className = 'score-cell';
      tdScore.textContent = String(row.velocityScore);
      const tdOverall = document.createElement('td');
      tdOverall.appendChild(makeSignal(row.overallSignal, '종합', null));
      const tdModel = document.createElement('td');
      tdModel.appendChild(makeSignal(row.signals.modelSignal, '새 AI 모델', row.counts.modelCount));
      const tdRepo = document.createElement('td');
      tdRepo.appendChild(makeSignal(row.signals.repoSignal, '새 개발 자료', row.counts.repoCount));
      const tdNews = document.createElement('td');
      tdNews.appendChild(makeSignal(row.signals.hnSignal, '뉴스', row.counts.newsCount));
      tr.append(tdCo, tdScore, tdOverall, tdModel, tdRepo, tdNews);
      matrixBody.appendChild(tr);
    }
    matrixEmpty.hidden = result.matrix.length > 0;
  }

  function makeList(items, renderItem, emptyText, cls) {
    const ul = document.createElement('ul');
    if (cls) ul.className = cls;
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty-note';
      li.textContent = emptyText;
      ul.appendChild(li);
      return ul;
    }
    for (const it of items) {
      const li = document.createElement('li');
      li.append(...renderItem(it));
      ul.appendChild(li);
    }
    return ul;
  }

  function linkNode(text) {
    const a = document.createElement('a');
    a.className = 'item-main';
    a.textContent = text; // 원문 그대로(번역 금지)
    return a;
  }
  const spanNode = (text, cls) => Object.assign(document.createElement('span'), { className: cls, textContent: text });

  function renderCompanyCard(row) {
    const section = document.createElement('section');
    section.className = 'company-card';
    section.id = 'section-' + row.company;

    const head = document.createElement('div');
    head.className = 'company-head';
    const h3 = document.createElement('h3');
    h3.textContent = row.company;
    const overall = makeSignal(row.overallSignal, '종합', null);
    const scoreChip = document.createElement('span');
    scoreChip.className = 'score-chip';
    scoreChip.textContent = `7일 속도 점수 ${row.velocityScore}`;
    head.append(h3, overall, scoreChip);
    section.appendChild(head);

    const view = document.createElement('div');
    view.className = 'three-view';

    // 모델: 소제목에 "7일 건수"와 "목록 개수"를 같은 줄에 나란히(혼합 방지)
    const modelBlock = document.createElement('div');
    const mh = document.createElement('h4');
    mh.textContent = `급상승 모델 — 최근 7일 ${row.counts.modelCount}건 · 아래는 전체 수집 상위 ${row.topModels.length}개`;
    modelBlock.appendChild(mh);
    modelBlock.appendChild(makeList(
      row.topModels,
      (m) => [
        linkNode(m.id),
        spanNode(
          `가중 파일 ${m.weightSizeGB === null ? '정보 없음' : m.weightSizeGB + ' GB'} · 다운로드 ${num(m.downloads)} · 트렌드 ${num(m.trendingScore)}`,
          'item-sub',
        ),
      ],
      row.counts.modelCount > 0
        ? '최근 7일 창에 급상승 모델은 없습니다(아래 목록은 전체 수집 범위).'
        : '데이터에 급상승 모델이 없습니다.',
      'model-list',
    ));

    // 레포
    const repoBlock = document.createElement('div');
    const rh = document.createElement('h4');
    rh.textContent = `신규 저장소 — 최근 7일 ${row.counts.repoCount}건 · 아래는 전체 수집 상위 ${row.topRepos.length}개`;
    repoBlock.appendChild(rh);
    repoBlock.appendChild(makeList(
      row.topRepos,
      (r) => [
        (() => { const a = linkNode(r.fullName); if (r.url) a.href = r.url; return a; })(),
        spanNode(`스타 ${num(r.stars)}`, 'item-sub'),
      ],
      '데이터에 신규 저장소가 없습니다.',
      'repo-list',
    ));

    // 소식(목록은 전체 수집 범위이므로 "전체 수집" 표기)
    const storyBlock = document.createElement('div');
    const sh = document.createElement('h4');
    sh.textContent = `기술 소식 — 최근 7일 ${row.counts.newsCount}건 · 아래는 전체 수집 상위 ${row.topStories.length}개`;
    storyBlock.appendChild(sh);
    storyBlock.appendChild(makeList(
      row.topStories,
      (s) => [
        (() => { const a = linkNode(s.title); if (s.url) a.href = s.url; return a; })(),
        spanNode(
          [s.sourceType, `가중치 ${s.score}`, s.ageH === null ? null : `${s.ageH}시간 전`].filter(Boolean).join(' · '),
          'item-sub',
        ),
      ],
      row.counts.newsCount > 0
        ? '최근 7일 창에 기술 소식은 없습니다(아래 목록은 전체 수집 범위).'
        : '데이터에 기술 소식이 없습니다.',
      'story-list',
    ));

    view.append(modelBlock, repoBlock, storyBlock);
    section.appendChild(view);
    return section;
  }

  function render() {
    if (!state.rawData) return;
    showStatus(null);
    let result;
    try {
      result = buildCompanyVelocityMatrix(selectedCompanies(), state.rawData, state.nowIso);
    } catch (err) {
      showStatus(`결과를 계산할 수 없습니다: ${err.message} — 데이터 파일 형식이 잘못되었을 수 있습니다.`);
      clearResults();
      return;
    }
    state.result = result;
    summary24El.textContent = String(result.summary24hCount);
    // 표 바로 위의 "한 줄 결론": 7일 속도 점수가 가장 큰(동점이면 표 순서상 앞) 기업을 씀. 순수 함수는 건드리지 않는다.
    resultSummaryEl.textContent = selectedCompanies().length ? renderResultSummary(result) : DEFAULT_SUMMARY;
    renderMatrix(result);
    sectionsEl.innerHTML = '';
    for (const row of result.matrix) sectionsEl.appendChild(renderCompanyCard(row));
    jsonEl.textContent = JSON.stringify(result, null, 2);
  }

  async function loadData() {
    const errors = [];
    const rawData = {};
    state.metas = [];
    let nowIso = null;
    for (const def of SOURCE_DEFS) {
      try {
        const [dataRes, metaRes] = await Promise.all([
          fetch(`data/${def.id}.json`),
          fetch(`data/${def.id}.meta.json`).catch(() => null),
        ]);
        if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
        rawData[def.key] = await dataRes.json();
        let meta = null;
        if (metaRes && metaRes.ok) meta = await metaRes.json().catch(() => null);
        if (meta) {
          state.metas.push({ label: def.label, fetchedAt: meta.fetched_at, terms: meta.terms });
          if (!nowIso && typeof meta.fetched_at === 'string') nowIso = meta.fetched_at;
        }
      } catch (err) {
        errors.push(`${def.label} 데이터(data/${def.id}.json)를 불러오지 못했습니다(${err.message}).`);
      }
    }
    if (errors.length) {
      showStatus(errors.join(' '));
      state.rawData = Object.assign({ techRadar: { stories: [] }, hfModels: [], ghNewRepos: { items: [] }, hnFront: { hits: [] } }, rawData);
    } else {
      state.rawData = rawData;
    }
    state.nowIso = nowIso || new Date().toISOString();
    // 요약 바 표시
    const radarMeta = state.metas.find((m) => m.label === '기술 레이더');
    const primaryMeta = radarMeta || state.metas[0];
    fetchedAtEl.textContent = primaryMeta ? (formatKst(primaryMeta.fetchedAt) || '알 수 없음') : '알 수 없음';
    summary24El.textContent = '…';
    sourceTermsEl.innerHTML = '';
    for (const m of state.metas) {
      const t1 = document.createElement('span');
      t1.textContent = `${m.label} — `;
      const t2 = document.createElement('span');
      t2.textContent = m.terms ? m.terms : '';
      sourceTermsEl.append(t1, t2);
    }
    render();
  }

  for (const t of toggles) t.addEventListener('change', render);
  // "예시로 해 보기"는 데모 편의: Mistral + Anthropic만, 그 외 모두 해제
  $('demo-mistral-button').addEventListener('click', () => {
    for (const t of toggles) t.checked = (t.value === 'Mistral' || t.value === 'Anthropic');
    render();
  });
  // UX-REVIEW 4.1/7.2: 초기 상태는 6개 기업 전체가 켜진 상태
  $('reset-button').addEventListener('click', () => {
    for (const t of toggles) t.checked = true;
    showStatus(null);
    render();
  });

  loadData().catch(() => showStatus('데이터를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.'));
}
