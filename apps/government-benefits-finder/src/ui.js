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
  if (item.status === 'open') return el('span', 'ds-badge', item.daysLeft + '일 남음');
  const b = el('span', 'ds-badge', '상시');
  b.title = '상시/기한 미표시';
  b.setAttribute('aria-label', '상시/기한 미표시');
  return b;
};

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
  if (item.field) main.append(el('span', 'ds-list-sub field-label', item.field));
  if (item.targets.length) main.append(el('span', 'ds-list-sub target-label', item.targets.join(' · ')));
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

// 첫 화면 TOP 5: 답 카드 안의 짧은 카드(이름 + 남은 일수)
export function renderSoonList(ol, items) {
  ol.textContent = '';
  for (const i of items) {
    const li = el('li', 'ds-list-item soon-item');
    const av = el('span', 'ds-avatar ds-avatar-s');
    av.setAttribute('aria-hidden', 'true');
    av.dataset.hue = String(hue(i.name));
    const first = i.name.match(/[가-힣0-9A-Za-z]/);
    av.textContent = first ? first[0] : '혜';

    const main = el('div', 'ds-list-main');
    const title = el(i.url.startsWith('https://') ? 'a' : 'span', 'ds-list-title');
    if (i.url.startsWith('https://')) {
      title.classList.add('detail-link');
      title.href = i.url;
      title.target = '_blank';
      title.rel = 'noopener';
    }
    title.textContent = i.name;
    main.append(title);
    if (i.field) main.append(el('span', 'ds-list-sub', i.field));

    const end = el('div', 'ds-list-end');
    if (i.daysLeft !== null) {
      end.append(el('span', 'ds-list-amount soon-amount', i.daysLeft === 0 ? 'D-day' : i.daysLeft + '일 남음'));
      if (i.deadline) end.append(el('span', 'ds-list-sub', i.deadline));
    } else {
      const b = el('span', 'ds-badge', '상시');
      b.title = '상시/기한 미표시';
      b.setAttribute('aria-label', '상시/기한 미표시');
      end.append(b);
    }
    li.append(av, main, end);
    ol.append(li);
  }
}

// limit: 처음 limit개만 보이고, 0(또는 items보다 큰 값)이면 전부. #more-button 은 app.js 가 관리
export function renderList(list, items, limit = 0) {
  list.textContent = '';
  const n = limit > 0 ? Math.min(limit, items.length) : items.length;
  for (let i = 0; i < n; i++) list.append(buildCard(items[i]));
}

export function renderMeta(totalEl, closingEl, noneEl, n, closing, none) {
  totalEl.textContent = n + '건';
  closingEl.textContent = closing + '건';
  noneEl.textContent = none + '건';
}
