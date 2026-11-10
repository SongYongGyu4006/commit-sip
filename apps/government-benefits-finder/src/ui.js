// 화면 렌더: 순수 함수 결과를 DOM으로만 바꿈. 모든 데이터 텍스트는 textContent로만.

const pad = (n) => String(n).padStart(2, '0');

// 브라우저 로컬 날짜 YYYY-MM-DD (SPEC: todayIso 는 화면에서만 계산)
export const localTodayIso = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

// '2026-11-03T04:01:14' → '11월 3일' (사람 말로, 기계식 T·시각 제거)
export const fmtDateTime = (iso) => {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return +m[2] + '월 ' + +m[3] + '일';
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const hue = (name) => [...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8;

// 마감 배지: 임박은 D-n(강조), 여유는 'n일 남음', 기한 없으면 '상시'
// (SPEC: deadline 이 없으면 '상시/기한 미표시' — 배지·날짜 줄 중복을 피하기 위해 배지는 '상시'만,
//  '상시/기한 미표시'는 title 속성(툴팁)·aria-label 로만 남김)
const deadlineBadge = (item) => {
  if (item.status === 'closing') {
    const b = el('span', 'ds-badge ds-badge-warn', item.daysLeft === 0 ? 'D-day' : 'D-' + item.daysLeft);
    if (item.daysLeft === 0) b.dataset.day = '0';
    return b;
  }
  if (item.status === 'open' && item.daysLeft !== null) return el('span', 'ds-badge', item.daysLeft + '일 남음');
  // daysLeft가 null인데 status가 'none'이 아닌 경계(날짜 파싱 실패 등)도 '상시'로 — 'D-null' 금지
  const b = el('span', 'ds-badge', '상시');
  b.title = '상시/기한 미표시';
  b.setAttribute('aria-label', '상시/기한 미표시');
  return b;
};

// 남은 일수 문장: D-day / n일 남음 (ui.js 만 사용 — app.js 의 daysWord 와 같은 문구)
const daysWord = (d) => (d === 0 ? '오늘 마감(D-day)' : d + '일 남음');

// 보조 줄: 남은 일수 + 마감일을 한 줄로('27일 남음 · 2026-11-30', 상시는 '상시(기한 미표시)')
const dueLine = (item) =>
  item.daysLeft === null ? '상시(기한 미표시)' : daysWord(item.daysLeft) + ' · ' + (item.deadline || '');

// 카드: 이름 → 분야(라벨)·지원 대상(보조 줄)·요약 | D-n + 'n일 남음 · 마감일' (SPEC 순서)
export function buildCard(item) {
  const li = el('li', 'ds-list-item benefit-card');
  if (item.status === 'closing') li.classList.add('closing');

  const av = el('span', 'ds-avatar ds-avatar-s');
  av.setAttribute('aria-hidden', 'true');
  av.dataset.hue = String(hue(item.name));
  const first = item.name.match(/[가-힣0-9A-Za-z]/); // 깨진 문자(예: '(') 대신 첫 한글·숫자·영문
  av.textContent = first ? first[0] : '혜';

  const main = el('div', 'ds-list-main');
  const title = el(item.url.startsWith('https://') ? 'a' : 'span', 'ds-list-title');
  if (item.url.startsWith('https://')) {
    title.classList.add('detail-link');
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noopener';
  }
  title.textContent = item.name;
  main.append(title);
  const TARGET_LABEL = { youth: '청년', childcare: '출산·육아', selfemployed: '자영업', lowincome: '저소득', senior: '노인' };
  if (item.targets.length) {
    const badge = el('span', 'ds-badge ds-badge-accent target-badge', item.targets.map((t) => TARGET_LABEL[t]).join(' · '));
    badge.title = '이 혜택의 대상입니다';
    main.append(badge);
  }
  if (item.field) main.append(el('span', 'ds-list-sub field-label', item.field));
  if (item.summary) main.append(el('span', 'ds-list-sub', item.summary));
  if (item.agency) main.append(el('span', 'ds-list-sub', item.agency));

  const end = el('div', 'ds-list-end');
  end.append(deadlineBadge(item));
  // 제목 아래 보조 줄: 남은 일수와 날짜를 한 줄에('27일 남음 · 2026-11-30')
  end.append(el('span', 'ds-list-sub due-line', dueLine(item)));
  if (item.methods.length) end.append(el('span', 'ds-list-sub', item.methods.join(', ')));

  li.append(av, main, end);
  return li;
}

// '임박순'을 화면 목록에 맞게 재정렬: 0~14일(closing) → 15일 초과(open) → 상시(none).
// 순서만 바꾸고 요소를 안 건드리므로(정렬 안정성) 순수 함수의 정렬 결과는 그대로 유지돼요.
const reorderByImminency = (items) => {
  const rank = (i) => (i.status === 'closing' ? 0 : i.status === 'open' ? 1 : 2);
  const cmp = (a, b) => rank(a) - rank(b)
    || (a.daysLeft === null ? 1 : b.daysLeft === null ? -1 : a.daysLeft - b.daysLeft);
  return [...items].sort(cmp);
};

// limit: 처음 limit개만 보이고, 0(또는 items보다 큰 값)이면 전부. #more-button 은 app.js 가 관리
// sort='deadline' 이면 '마감 임박(14일 이내)순' 의 의미에 맞게 재분류한 뒤 그 순서대로 뽑는다.
export function renderList(list, items, limit = 0, sort = '') {
  const shown = sort === 'deadline' ? reorderByImminency(items) : items;
  list.textContent = '';
  const n = limit > 0 ? Math.min(limit, shown.length) : shown.length;
  for (let i = 0; i < n; i++) list.append(buildCard(shown[i]));
}

