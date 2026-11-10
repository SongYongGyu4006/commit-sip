// GovBenefit Finder — 순수 핵심: browseBenefits. Node에서도 import해도 부작용 없음(시계·저장소·전역 읽지 않음).
import { localTodayIso, fmtDateTime, renderList } from './ui.js';

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
  const answerLabel = $('answer-label');
  const sampleHint = $('sample-hint');
  const listDesc = $('list-desc');
  const listHeading = $('list-heading');
  const metaClosing = $('meta-closing');
  const metaNone = $('meta-none');
  const metaTime = $('meta-time');
  const summaryLine = $('summary-line');
  const list = $('benefit-list');
  const moreButton = $('more-button');
  const resetButton = $('reset-button');
  const copyLinkButton = $('copy-link-button');
  const copyLinkStatus = $('copy-link-status'); // '내 조건 링크 복사' 버튼 바로 아래 결과 문구
  const sampleBadgeList = $('sample-badge-list');
  const sampleBadgeControls = $('sample-badge-controls');
  const targetChips = document.querySelectorAll('#target-chips .ds-chip');

  const CHIP_LABELS = { all: '전체', youth: '청년', childcare: '출산·육아', selfemployed: '자영업', lowincome: '저소득', senior: '노인' };

  // 예시 버튼용 3개 샘플 (SPEC 고정)
  // 상세링크는 url 이 https:// 로 시작할 때만 보이므로, 샘플 3개에 정부24 상세페이지 주소를 넣어 두어요.
  // 첫 화면의 목록은 5건만 펼쳐 두고 나머지는 '더 보기'에 접어 두어요(차이점인 마감 임박 TOP 5가 스크롤 전에 보이도록).
  const SAMPLE_ROWS = [
    { '서비스ID': 'B1', '서비스명': '청년 월세 지원', '서비스분야': '주거·자립', '지원대상': '만 19~34세 청년', '신청기한': '2026.10.22~2026.10.22', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청' },
    { '서비스ID': 'C1', '서비스명': '소상공인 경영안정 자금', '서비스분야': '금융', '지원대상': '소상공인', '신청기한': '2026.09.01~2026.10.29', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청||방문신청' },
    { '서비스ID': 'D1', '서비스명': '노인 일자리 사업', '서비스분야': '고용·창업', '지원대상': '만 65세 이상 어르신', '신청기한': '상시', '상세조회URL': 'https://www.gov.kr/portal/gnb/contents/22146', '신청방법': '정부24온라인신청' },
  ];

  const PAGE = 20; // '더 보기' 단위로 한 번에 추가할 카드 수
  const S = { liveRows: [], todayIso: localTodayIso(), usingSample: false, loaded: false, total: null, fetchedAt: '', terms: '', limit: 5, sortNow: 'deadline' };

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
      // 첫 화면에 '데이터 기준'이 보이도록 답 카드 메타에 같은 시각을 넣고, 푸터엔 출처 전체 문구를 둠
      metaTime.textContent = S.fetchedAt ? fmtDateTime(S.fetchedAt) : '—';
      sourceLine.textContent = '출처: 행정안전부·공공데이터포털 (공공누리 제1유형)' + (S.fetchedAt ? ' · 데이터 기준 ' + fmtDateTime(S.fetchedAt) : '') + (S.terms && !S.terms.includes('출처 표시') ? ' · ' + S.terms : '');
      totalLine.textContent = S.total !== null ? '전체 혜택 ' + S.total + '건' : '';
      applyParams(); // ?field=… 가 데이터 목록의 분야에 없으면 빈 값으로 (있는 값일 때만 유지)
      render();
    })
    .catch(() => {
      dataTime.textContent = '';
      metaTime.textContent = '불러오지 못함';
      sourceLine.textContent = '출처: 행정안전부·공공데이터포털 (공공누리 제1유형) · 데이터 파일을 불러오지 못했습니다.';
      totalLine.textContent = '';
      appStatus.textContent = '데이터 파일을 불러오지 못했습니다.';
      list.textContent = '';
    });

  function render({ todayIso } = {}) {
    if (!S.loaded && !S.usingSample) return;
    // 조건이 바뀌면(이 render 는 select 칩·버튼에서 불림) 목록을 처음 5개로 접어 둔다
    if (!todayIso) S.limit = 5;
    const rows = S.usingSample ? SAMPLE_ROWS : S.liveRows;
    const today = todayIso || S.todayIso;
    S.sortNow = sortSelect.value;
    let result;
    try {
      result = browseBenefits(rows, { field: fieldSelect.value, target: targetSelect.value, sort: sortSelect.value, todayIso: today });
    } catch (e) {
      appStatus.textContent = '조건을 처리할 수 없습니다.';
      list.textContent = '';
      moreButton.hidden = true;
      return;
    }
    // 대상 칩: 대상별로 한 번씩 계산해 건수 표시(대상=전체/분야 기본값 기준 — 칩이 바뀌어도 칩 건수는 같은 기준)
    const chipField = fieldSelect.value === '' ? '' : fieldSelect.value;
    const counts = {};
    for (const t of ['all', ...Object.keys(TARGETS)]) {
      try {
        const r = browseBenefits(rows, { field: chipField, target: t, sort: 'deadline', todayIso: today });
        counts[t] = { shown: r.shown, closing: r.items.filter((i) => i.status === 'closing').length };
      } catch (e) {
        counts[t] = { shown: null, closing: null };
      }
    }
    targetChips.forEach((c) => {
      const t = c.dataset.target;
      const n = counts[t] ? counts[t].shown : null;
      const count = c.querySelector('.ds-chip-count');
      if (count) count.textContent = n !== null ? n + '건' : '';
      count.hidden = n === null;
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

    renderList(list, result.items, S.limit, S.sortNow);
    // '더 보기': 남은 개수가 있으면 버튼에 남는 수, 없으면 숨김
    const remain = result.items.length - S.limit;
    moreButton.hidden = remain <= 0;
    moreButton.textContent = remain > 0 ? '더 보기 (남은 ' + remain + '건)' : '더 보기';
    summaryLine.textContent = '표시 ' + result.shown + '건 / 전체 ' + result.totalRows + '건 (마감 지난 ' + result.closedCount + '건 제외)';

    // 목록 제목·설명: 정렬 방식에 맞게 정확히
    listHeading.textContent = '혜택 목록';
    if (S.sortNow === 'deadline') {
      listDesc.textContent = (S.usingSample ? '예시 혜택이에요. ' : '') + '마감 임박(14일 이내) 혜택이 먼저, 그 뒤 15일 초과 → 상시 순서예요.';
    } else if (S.sortNow === 'name') {
      listDesc.textContent = '이름순으로 정렬했어요.';
    } else {
      listDesc.textContent = '최근 등록·수정 순서예요.';
    }

    // 답 카드: "당신의 답" = 지금 고른 대상의 혜택 수 + 그 중 14일 이내 마감 수
    const targetName = CHIP_LABELS[targetSelect.value];
    const closing = result.items.filter((i) => i.status === 'closing');
    const noneCount = result.items.filter((i) => i.status === 'none').length;

    if (result.shown === 0) {
      answerLabel.textContent = (targetSelect.value === 'all' ? '전체 혜택' : targetName + ' 혜택');
      answerNum.textContent = '0';
      answerNum.appendChild(document.createElement('small')).textContent = '건';
      answerNum.classList.add('answer-num-zero');
      answerText.textContent = '조건에 맞는 혜택이 없어요. 대상 칩이나 조건을 바꿔 보세요.';
    } else {
      const label = targetSelect.value === 'all' ? '전체 혜택' : targetName + ' 혜택';
      answerLabel.textContent = label;
      answerNum.textContent = String(result.shown);
      answerNum.appendChild(document.createElement('small')).textContent = '건';
      answerNum.classList.remove('answer-num-zero');
      answerText.textContent = targetSelect.value === 'all'
        ? '그 중 14일 이내 마감 ' + closing.length + '건이에요. 대상 칩을 누르면 ' + targetName + ' 혜택부터 골라 드려요.'
        : '그 중 14일 이내 마감 ' + closing.length + '건이에요. 아래 목록에서 마감 순서로 확인하세요.';
    }
    metaClosing.textContent = closing.length + '건';
    metaNone.textContent = noneCount + '건';

    // 예시 상태: 실제 목록 건수 안내(이 문장은 answerText·hint에만, #app-status 는 SPEC 문구 그대로)
    sampleHint.hidden = !S.usingSample;
    if (S.usingSample) {
      const liveN = S.loaded ? S.liveRows.length : 0;
      sampleHint.textContent = '아래는 예시 3건이에요. 실제 목록 ' + liveN + '건은 \'처음으로\'로 돌아와요.';
    }
    // 예시 화면일 때: 목록·조작 위 '예시 화면' 표시 + '처음으로'를 눈에 띄게
    sampleBadgeList.hidden = !S.usingSample;
    sampleBadgeControls.hidden = !S.usingSample;
    resetButton.classList.toggle('ds-btn-primary', S.usingSample);
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
    S.limit = 5;
    render({ todayIso: '2026-10-22' });
  });

  $('reset-button').addEventListener('click', () => {
    S.usingSample = false;
    S.todayIso = localTodayIso();
    S.limit = 5;
    fieldSelect.value = '';
    targetSelect.value = 'all';
    sortSelect.value = 'deadline';
    syncTargetChips();
    if (S.loaded) render();
  });

  // 내 조건 링크 복사: ?target=&field=&sort= 로 공유·다시 열기(저장소 없이)
  // 결과 문구는 버튼 바로 아래 #copy-link-status 에(화면 밖에 있는 #app-status 로는 보이지 않음)
  copyLinkButton.addEventListener('click', () => {
    const show = (msg) => {
      copyLinkStatus.textContent = msg;
      copyLinkStatus.hidden = false;
      copyLinkStatus.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const p = new URLSearchParams();
    if (targetSelect.value !== 'all') p.set('target', targetSelect.value);
    if (fieldSelect.value) p.set('field', fieldSelect.value);
    if (sortSelect.value !== 'deadline') p.set('sort', sortSelect.value);
    const url = location.origin + location.pathname + (p.toString() ? '?' + p.toString() : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { show('링크를 복사했어요.'); },
        () => { show('주소창의 링크를 복사하세요.'); }
      );
    } else {
      show('주소창의 링크를 복사하세요.');
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
