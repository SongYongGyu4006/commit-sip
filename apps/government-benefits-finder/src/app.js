// GovBenefit Finder — 순수 핵심: browseBenefits. Node에서도 import해도 부작용 없음(시계·저장소·전역 읽지 않음).
import { localTodayIso, fmtDateTime, renderList, renderMeta } from './ui.js';

const KEYS = ['서비스ID', '서비스명', '서비스목적요약', '서비스분야', '지원대상', '신청기한', '신청방법', '소관기관명', '상세조회URL'];
const TARGETS = {
  youth: ['청년'],
  childcare: ['출산', '임신', '육아', '영유아'],
  selfemployed: ['소상공인', '자영업', '창업'],
  lowincome: ['저소득', '기초생활', '차상위'],
  senior: ['노인', '어르신', '고령'],
};
const ALLOWED_TARGETS = ['all', 'youth', 'childcare', 'selfemployed', 'lowincome', 'senior'];
const ALLOWED_SORTS = ['deadline', 'name', 'input'];

const isPlain = (v) =>
  typeof v === 'object' && v !== null &&
  (v.constructor === Object || v.constructor === undefined);

const text = (v) => (v === null || v === undefined ? '' : String(v));
const trim = (s) => s.trim();

function validateDateParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return validateDateParts(y, mo, d) ? { y, m: mo, d } : null;
}

const utcMidnight = (p) => Date.UTC(p.y, p.m - 1, p.d);

function parseDeadline(raw) {
  const ms = [...text(raw).matchAll(/\d{4}[.\-]?\d{2}[.\-]?\d{2}/g)];
  if (!ms.length) return null;
  // Normalize the matched date to YYYY-MM-DD: strip separators, then re-insert
  // dashes at fixed positions (works for dot-, hyphen- and compact forms).
  const digits = ms[ms.length - 1][0].replace(/[.\-]/g, '');
  const norm = digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
  const parts = parseIsoDate(norm);
  return parts ? norm : null;
}

function normalizeOptions(options) {
  if (!isPlain(options)) throw new TypeError('options는 일반 객체여야 합니다');
  const { field, target, sort, todayIso } = options;
  if (typeof field !== 'string') throw new TypeError('options.field은(는) 문자열이어야 합니다');
  if (typeof target !== 'string') throw new TypeError('options.target은(는) 문자열이어야 합니다');
  if (typeof sort !== 'string') throw new TypeError('options.sort은(는) 문자열이어야 합니다');
  if (typeof todayIso !== 'string') throw new TypeError('options.todayIso은(는) 문자열이어야 합니다');
  if (!ALLOWED_TARGETS.includes(target)) throw new RangeError('target 값이 올바르지 않습니다: ' + target);
  if (!ALLOWED_SORTS.includes(sort)) throw new RangeError('sort 값이 올바르지 않습니다: ' + sort);
  if (!parseIsoDate(todayIso)) throw new RangeError('todayIso는 존재하는 날짜(YYYY-MM-DD)여야 합니다: ' + todayIso);
  return options;
}

export function browseBenefits(rows, options) {
  if (!Array.isArray(rows)) throw new TypeError('rows는 배열이어야 합니다');
  normalizeOptions(options);
  const today = utcMidnight(parseIsoDate(options.todayIso));

  // Step 1: row 검증 + 이름 빈 것 제거 + ID로 중복 제거
  const cleaned = [];
  const seenIds = new Set();
  for (const row of rows) {
    if (!isPlain(row)) throw new TypeError('rows 항목은 일반 객체여야 합니다');
    for (const k of KEYS) {
      const v = row[k];
      if (v !== null && v !== undefined && typeof v !== 'string') throw new TypeError('행의 "' + k + '" 값은 문자열, null 또는 없어야 합니다');
    }
    const name = trim(text(row['서비스명']));
    if (!name) continue;
    const id = trim(text(row['서비스ID']));
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    cleaned.push({ row, name, id });
  }

  // Step 2: 항목별 값 계산
  const items = cleaned.map((c) => {
    const r = c.row;
    const deadline = parseDeadline(r['신청기한']);
    const daysLeft = deadline ? Math.round((utcMidnight(parseIsoDate(deadline)) - today) / 86400000) : null;
    const status = daysLeft === null ? 'none' : daysLeft < 0 ? 'closed' : daysLeft <= 14 ? 'closing' : 'open';
    const targets = Object.keys(TARGETS).filter((t) =>
      TARGETS[t].some((k) => (c.name + ' ' + text(r['서비스목적요약']) + ' ' + text(r['지원대상'])).includes(k))
    );
    return {
      id: c.id,
      name: c.name,
      field: trim(text(r['서비스분야'])),
      summary: text(r['서비스목적요약']).replace(/\s+/g, ' ').trim(),
      agency: trim(text(r['소관기관명'])),
      deadline,
      daysLeft,
      status,
      targets,
      methods: text(r['신청방법']).split(/\|\|?/).map(trim).filter(Boolean),
      url: trim(text(r['상세조회URL'])),
    };
  });

  // fields: 남은 전체 row 기준, 중복 제거 후 코드유닛 순 정렬
  const fields = [...new Set(items.map((i) => i.field).filter(Boolean))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  // Step 4: 필터 + closed 제외 + 정렬
  let picked = items.filter((i) => (options.field === '' || i.field === options.field) && (options.target === 'all' || i.targets.includes(options.target)));
  const closedCount = picked.filter((i) => i.status === 'closed').length;
  let list = picked.filter((i) => i.status !== 'closed');

  if (options.sort === 'deadline') {
    const withDate = list.filter((i) => i.daysLeft !== null).sort((a, b) => a.daysLeft - b.daysLeft || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const noDate = list.filter((i) => i.daysLeft === null).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    list = withDate.concat(noDate);
  } else if (options.sort === 'name') {
    list = [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  // 'input'은 필터 후 순서 유지

  return { totalRows: items.length, shown: list.length, closedCount, fields, items: list };
}

// ---- 화면 ---- (브라우저에서만 실행되는 부분)

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  const appStatus = $('app-status');
  const totalLine = $('total-line');
  const dataTime = $('data-time');
  const sourceLine = $('source-line');
  const fieldSelect = $('field-select');
  const targetSelect = $('target-select');
  const sortSelect = $('sort-select');
  const answerNum = $('answer-num');
  const answerText = $('answer-text');
  const metaTotal = $('meta-total');
  const metaClosing = $('meta-closing');
  const metaNone = $('meta-none');
  const summaryLine = $('summary-line');
  const list = $('benefit-list');
  const moreButton = $('more-button');
  const resetButton = $('reset-button');
  const copyLinkButton = $('copy-link-button');
  const sampleBadgeList = $('sample-badge-list');
  const sampleBadgeControls = $('sample-badge-controls');
  const targetChips = document.querySelectorAll('#target-chips .ds-chip');
  const filterToggle = $('filter-toggle');
  const filterBody = $('filter-body');
  const filterCount = $('filter-count');

  const CHIP_LABELS = { all: '전체', youth: '청년', childcare: '출산·육아', selfemployed: '자영업', lowincome: '저소득', senior: '노인' };

  // 조건 조절 접기: 칩·버튼 아래로 눌러 접었다 펼친다(공유 링크가 조건을 싣으면 render 가 자동으로 펼쳐)
  const setFilterOpen = (open) => {
    filterBody.hidden = !open;
    filterToggle.setAttribute('aria-expanded', String(open));
  };
  filterToggle.addEventListener('click', () => setFilterOpen(filterBody.hidden));

  // 예시 버튼용 3개 샘플 (SPEC 고정)
  // 상세링크는 url 이 https:// 로 시작할 때만 보이므로, 샘플 3개에 정부24 상세페이지 주소를 넣어 두어요.
  const SAMPLE_ROWS = [
    { '서비스ID': 'B1', '서비스명': '청년 월세 지원', '서비스분야': '주거·자립', '지원대상': '만 19~34세 청년', '신청기한': '2026.10.22~2026.10.22', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청' },
    { '서비스ID': 'C1', '서비스명': '소상공인 경영안정 자금', '서비스분야': '금융', '지원대상': '소상공인', '신청기한': '2026.09.01~2026.10.29', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청||방문신청' },
    { '서비스ID': 'D1', '서비스명': '노인 일자리 사업', '서비스분야': '고용·창업', '지원대상': '만 65세 이상 어르신', '신청기한': '상시', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청' },
  ];

  const PAGE = 20; // '더 보기' 단위로 한 번에 추가할 카드 수
  const S = { liveRows: [], todayIso: localTodayIso(), usingSample: false, loaded: false, total: null, fetchedAt: '', terms: '', limit: PAGE };

  // 답 카드 문장: 현재 선택 기준(대상) 한 문장으로
  const answerSentence = (t, c, closing) => {
    if (!c || c.shown === null) return '';
    if (t === 'all') return c.shown + '건 중 ' + closing + '건이 14일 안에 마감돼요. 급한 것부터 보여 드려요.';
    return CHIP_LABELS[t] + ' 혜택 ' + c.shown + '건 중 14일 안에 마감 ' + closing + '건이에요.';
  };

  // 시작: 데이터 파일 2개 불러오기
  Promise.all([fetch('data/gov_benefits.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('data')))),
               fetch('data/gov_benefits.meta.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('meta'))))])
    .then(([data, meta]) => {
      S.liveRows = [...(Array.isArray(data.registered_recently) ? data.registered_recently : []), ...(Array.isArray(data.updated_recently) ? data.updated_recently : [])];
      S.total = typeof data.total === 'number' ? data.total : null;
      S.fetchedAt = typeof meta.fetched_at === 'string' ? meta.fetched_at : '';
      S.terms = typeof meta.terms === 'string' ? meta.terms : '';
      S.loaded = true;
      // #data-time·#source-line 은 푸터로 옮김(첫 화면 여백 확보) — id 유지, 같은 내용은 푸터에
      dataTime.textContent = S.fetchedAt ? '데이터 기준: ' + fmtDateTime(S.fetchedAt) : '';
      sourceLine.textContent = '출처: 행정안전부·공공데이터포털 (공공누리 제1유형)' + (S.terms && !S.terms.includes('출처 표시') ? ' · ' + S.terms : '');
      totalLine.textContent = S.total !== null ? '전체 혜택 ' + S.total + '건' : '';
      applyParams(); // ?field=… 가 데이터 목록의 분야에 없으면 빈 값으로 (있는 값일 때만 유지)
      render();
    })
    .catch(() => {
      dataTime.textContent = '';
      sourceLine.textContent = '출처: 행정안전부·공공데이터포털 (공공누리 제1유형)';
      totalLine.textContent = '';
      appStatus.textContent = '데이터 파일을 불러오지 못했습니다.';
      list.textContent = '';
    });

  function render({ todayIso } = {}) {
    if (!S.loaded && !S.usingSample) return;
    // 조건이 바뀌면(이 render 는 select 칩·버튼에서 불림) 목록을 처음 20개로 되돌린다
    if (!todayIso) S.limit = PAGE;
    const rows = S.usingSample ? SAMPLE_ROWS : S.liveRows;
    const today = todayIso || S.todayIso;
    let result;
    try {
      result = browseBenefits(rows, { field: fieldSelect.value, target: targetSelect.value, sort: sortSelect.value, todayIso: today });
    } catch (e) {
      appStatus.textContent = '조건을 처리할 수 없습니다.';
      list.textContent = '';
      moreButton.hidden = true;
      return;
    }
    // 대상 칩: 대상별로 한 번씩 계산해 건수 표시(마감 급한 것부터 알리기 위해)
    const counts = {};
    for (const t of ['all', ...Object.keys(TARGETS)]) {
      try {
        const r = browseBenefits(rows, { field: '', target: t, sort: 'deadline', todayIso: today });
        counts[t] = { shown: r.shown, closing: r.items.filter((i) => i.status === 'closing').length };
      } catch (e) {
        counts[t] = { shown: null, closing: null };
      }
    }
    targetChips.forEach((c) => {
      const t = c.dataset.target;
      const n = counts[t] ? counts[t].shown : null;
      c.textContent = n !== null ? CHIP_LABELS[t] + ' ' + n + '건' : CHIP_LABELS[t];
    });
    // 분야 선택지 갱신: 결과 fields 순서 그대로, 현재 선택 유지
    const cur = fieldSelect.value;
    fieldSelect.textContent = '';
    const optAll = document.createElement('option');
    optAll.value = ''; optAll.textContent = '전체 분야';
    fieldSelect.append(optAll);
    for (const f of result.fields) {
      const o = document.createElement('option');
      o.value = f; o.textContent = f;
      fieldSelect.append(o);
    }
    if (cur && result.fields.includes(cur)) fieldSelect.value = cur;

    renderList(list, result.items, S.limit);
    // '더 보기': 남은 개수가 있으면 버튼에 남는 수, 없으면 숨김
    const remain = result.items.length - S.limit;
    moreButton.hidden = remain <= 0;
    moreButton.textContent = remain > 0 ? '더 보기 (남은 ' + remain + '건)' : '더 보기';
    summaryLine.textContent = '표시 ' + result.shown + '건 / 전체 ' + result.totalRows + '건 (마감 지난 ' + result.closedCount + '건 제외)';
    answerNum.textContent = String(result.shown);
    answerNum.appendChild(document.createElement('small')).textContent = '건';
    answerNum.classList.toggle('answer-num-zero', result.shown === 0);
    const closing = result.items.filter((i) => i.status === 'closing').length;
    const none = result.items.filter((i) => i.status === 'none').length;
    answerText.textContent = result.shown === 0
      ? '조건에 맞는 혜택이 없어요. 조건을 바꿔 보세요.'
      : (S.usingSample
        ? '예시로 3개만 보여 드려요. 실제 목록은 처음으로를 누르면 다시 나와요.'
        : answerSentence(targetSelect.value, counts[targetSelect.value], closing));
    renderMeta(metaTotal, metaClosing, metaNone, S.usingSample ? result.totalRows : (S.total !== null ? S.total : result.totalRows), closing, none);
    // 예시 화면일 때: 목록·조작 위 '예시 화면' 표시 + '처음으로'를 눈에 띄게
    sampleBadgeList.hidden = !S.usingSample;
    sampleBadgeControls.hidden = !S.usingSample;
    resetButton.classList.toggle('ds-btn-primary', S.usingSample);
    // 조건 조절 접기: 조건이 기본값과 다르면 개수 배지 + 자동 펼쳐서(공유 링크로 열렸을 때 바로 반영)
    const parts = [];
    if (targetSelect.value !== 'all') parts.push('대상');
    if (fieldSelect.value) parts.push('분야');
    if (sortSelect.value !== 'deadline') parts.push('정렬');
    if (parts.length) {
      filterCount.textContent = parts.join('·') + ' ' + parts.length + '개';
      filterCount.hidden = false;
      if (filterBody.hidden) setFilterOpen(true);
    } else {
      filterCount.hidden = true;
    }
    appStatus.textContent = result.shown === 0
      ? '조건에 맞는 혜택이 없습니다.'
      : (S.usingSample ? '예시 데이터입니다. 실제 데이터는 처음으로를 누르세요.' : '');
  }

  for (const s of [fieldSelect, targetSelect, sortSelect]) s.addEventListener('change', () => { if (S.loaded || S.usingSample) render(); });

  // 대상 칩: 누르면 select 값을 바꾸고 change 를 보내(선택 상태는 칩과 select 가 일치)
  const syncTargetChips = () => {
    const v = targetSelect.value;
    targetChips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.target === v)));
  };
  targetChips.forEach((c) => c.addEventListener('click', () => {
    targetSelect.value = c.dataset.target;
    syncTargetChips();
    targetSelect.dispatchEvent(new Event('change'));
  }));

  moreButton.addEventListener('click', () => { S.limit += PAGE; render(); });

  $('example-button').addEventListener('click', () => {
    S.usingSample = true;
    S.limit = PAGE;
    render({ todayIso: '2026-10-22' });
  });

  $('reset-button').addEventListener('click', () => {
    S.usingSample = false;
    S.todayIso = localTodayIso();
    S.limit = PAGE;
    fieldSelect.value = '';
    targetSelect.value = 'all';
    sortSelect.value = 'deadline';
    syncTargetChips();
    if (S.loaded) render();
  });

  // 내 조건 링크 복사: ?target=&field=&sort= 로 공유·다시 열기(저장소 없이)
  copyLinkButton.addEventListener('click', () => {
    const p = new URLSearchParams();
    if (targetSelect.value !== 'all') p.set('target', targetSelect.value);
    if (fieldSelect.value) p.set('field', fieldSelect.value);
    if (sortSelect.value !== 'deadline') p.set('sort', sortSelect.value);
    const url = location.origin + location.pathname + (p.toString() ? '?' + p.toString() : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { appStatus.textContent = '링크를 복사했어요.'; },
        () => { appStatus.textContent = '주소창의 링크를 복사하세요.'; }
      );
    } else {
      appStatus.textContent = '주소창의 링크를 복사하세요.';
    }
  });

  // 시작할 때 주소 파라미터(?target=&field=&sort=)를 읽어서 세 셀렉트·칩에 맞춤
  const applyParams = () => {
    try {
      const p = new URLSearchParams(location.search);
      const t = p.get('target');
      if (t && ['all', ...Object.keys(TARGETS)].includes(t)) targetSelect.value = t;
      const s = p.get('sort');
      if (s && ALLOWED_SORTS.includes(s)) sortSelect.value = s;
      const f = p.get('field');
      if (f) fieldSelect.value = f; // render 가 options 로 검증(없는 분야면 빈 값으로)
      syncTargetChips();
    } catch (e) { /* URL 이 없거나 비정상이면 기본 값 그대로 */ }
  };
}
