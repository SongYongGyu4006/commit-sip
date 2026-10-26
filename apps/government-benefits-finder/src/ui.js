// 화면 렌더: 순수 함수 결과를 DOM으로만 바꿈. 모든 데이터 텍스트는 textContent로만.

const pad = (n) => String(n).padStart(2, '0');

// 브라우저 로컬 날짜 YYYY-MM-DD (SPEC: todayIso 는 화면에서만 계산)
export const localTodayIso = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

// '2026-10-22T23:15:05' → '10월 22일 밤 11시' (사람 말로, 기계식 T 제거)
export const fmtDateTime = (iso) => {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const mon = +m[2], day = +m[3], h = +m[4];
  const mer = h < 12 ? '오전' : h < 18 ? '오후' : '밤';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mon + '월 ' + day + '일 ' + mer + ' ' + h12 + '시';
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const hue = (name) => [...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8;

// 카드: 이름 → 분야 → 요약 → D-n → 마감일 → 신청방법 → 소관기관 → 상세링크 (SPEC 순서)
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
  if (item.field) main.append(el('span', 'ds-list-sub', item.field));
  if (item.summary) main.append(el('span', 'ds-list-sub', item.summary));
  if (item.agency) main.append(el('span', 'ds-list-sub', item.agency));

  const end = el('div', 'ds-list-end');
  // 임박(closing)만 'D-n'·강조, 15일 이상 남은 건은 'n일 남음' 회색, 기한 없으면 '상시'
  let badge;
  if (item.status === 'closing') {
    badge = el('span', 'ds-badge ds-badge-warn', item.daysLeft === 0 ? 'D-day' : 'D-' + item.daysLeft);
    if (item.daysLeft === 0) badge.dataset.day = '0';
  } else if (item.status === 'open') {
    badge = el('span', 'ds-badge', item.daysLeft + '일 남음');
  } else {
    badge = el('span', 'ds-badge', '상시');
  }
  end.append(badge);
  end.append(el('span', 'ds-list-sub', item.deadline || '상시/기한 미표시'));
  if (item.methods.length) end.append(el('span', 'ds-list-sub', item.methods.join(', ')));

  li.append(av, main, end);
  return li;
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
