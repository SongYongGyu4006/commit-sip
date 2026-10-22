// 화면 렌더: 순수 함수 결과를 DOM으로만 바꿈. 모든 데이터 텍스트는 textContent로만.

const pad = (n) => String(n).padStart(2, '0');

// 브라우저 로컬 날짜 YYYY-MM-DD (SPEC: todayIso 는 화면에서만 계산)
export const localTodayIso = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

export const fmtDateTime = (iso) => {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] : iso;
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
  av.textContent = item.name.slice(0, 1);

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
  const badge = el('span', 'ds-badge' + (item.status === 'closing' ? ' ds-badge-warn' : ''), item.daysLeft === 0 ? 'D-day' : 'D-' + item.daysLeft);
  if (item.daysLeft === 0) badge.dataset.day = '0';
  end.append(badge);
  end.append(el('span', 'ds-list-sub', item.deadline || '상시/기한 미표시'));
  if (item.methods.length) end.append(el('span', 'ds-list-sub', item.methods.join(', ')));

  li.append(av, main, end);
  return li;
}

export function renderList(list, items) {
  list.textContent = '';
  for (const item of items) list.append(buildCard(item));
}

export function renderMeta(totalEl, closingEl, noneEl, n, closing, none) {
  totalEl.textContent = n + '건';
  closingEl.textContent = closing + '건';
  noneEl.textContent = none + '건';
}
