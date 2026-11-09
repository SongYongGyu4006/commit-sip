// 순수 함수: 쪽별 텍스트 항목에서 주민등록번호 뒷 6자리 가림 박스를 계산한다.
// 부작용·DOM·랜덤이 없으며 입력은 바꾸지 않는다. SPEC 규칙 그대로다.

const PATTERN = /(?<!\d)(\d{6})-?([1-8]\d{6})(?!\d)/g;

const isPlain = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const isNumber = (v) => typeof v === 'number';

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

const r2 = (v) => Math.round(v * 100) / 100;

// 앞 6자리를 YY-MM-DD(2000~2099)로 읽었을 때 실제 날짜인지
function isBirthDate(d6) {
  const mm = Number(d6.slice(2, 4));
  if (mm < 1 || mm > 12) return false;
  const yy = 2000 + Number(d6.slice(0, 2));
  const dd = Number(d6.slice(4, 6));
  if (dd < 1) return false;
  const dim = new Date(yy, mm, 0).getDate();
  return dd <= dim; // 윤년 2월 29일 포함
}

function planRedactions(pages) {
  if (!Array.isArray(pages)) throw new TypeError('pages is not an array');
  for (const entry of pages) if (!isPlain(entry)) throw new TypeError('a page entry is not a plain object');
  const seen = new Set();
  for (const entry of pages) {
    if (!isNumber(entry.page)) throw new TypeError('page is not a number');
    if (!Array.isArray(entry.items)) throw new TypeError('items is not an array');
    for (const item of entry.items) {
      if (!isPlain(item)) throw new TypeError('an item is not a plain object');
      if (typeof item.str !== 'string') throw new TypeError('str is not a string');
      if (!isNumber(item.x)) throw new TypeError('x is not a number');
      if (!isNumber(item.y)) throw new TypeError('y is not a number');
      if (!isNumber(item.width)) throw new TypeError('width is not a number');
      if (!isNumber(item.height)) throw new TypeError('height is not a number');
    }
  }
  for (const entry of pages) {
    if (!Number.isSafeInteger(entry.page) || entry.page <= 0) throw new RangeError('page is not a positive safe integer');
    if (seen.has(entry.page)) throw new RangeError('a duplicate page number');
    seen.add(entry.page);
    for (const item of entry.items) {
      if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) throw new RangeError('x or y is NaN or infinite');
      if (!isFiniteNumber(item.width) || !isFiniteNumber(item.height)) throw new RangeError('width or height is NaN or infinite');
      if (item.width <= 0) throw new RangeError('width must be greater than 0');
      if (item.height <= 0) throw new RangeError('height must be greater than 0');
    }
  }

  const outPages = [];
  let total = 0;
  for (const entry of pages) {
    const { page, items } = entry;
    let full = '';
    const itemLens = [];
    for (const it of items) {
      itemLens.push(full.length);
      full += it.str;
      full += ' ';
    }
    const boxes = [];
    PATTERN.lastIndex = 0;
    let m;
    while ((m = PATTERN.exec(full)) !== null) {
      const d6 = m[1];
      const back = m[2];
      const mStart = m.index;
      const matchLen = m[0].length;
      if (!isBirthDate(d6)) continue;
      const start = mStart + matchLen - 6; // 뒷 6자리를 덮는다
      const end = start + 6;
      const preview = d6 + '-' + back[0] + '******';
      let first = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sl = itemLens[i];
        const il = it.str.length;
        if (il === 0) continue;
        const a = Math.max(start, sl);
        const b = Math.min(end, sl + il);
        if (a >= b) continue;
        const s0 = a - sl;
        const s1 = b - sl - 1;
        const n = s1 - s0 + 1;
        const box = {
          x: r2(it.x + (it.width * s0) / il),
          y: r2(it.y),
          width: r2((it.width * n) / il),
          height: r2(it.height),
        };
        if (first) box.preview = preview;
        boxes.push(box);
        first = false;
      }
    }
    if (boxes.length) {
      outPages.push({ page, boxes });
      total += boxes.length;
    }
  }
  outPages.sort((a, b) => a.page - b.page);
  return { total, pages: outPages };
}

export { planRedactions };
