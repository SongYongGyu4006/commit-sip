// 순수 계산: 쪽 범위 문자열, 파일명 키워드 순서, 목표 MB 해석.

const TEMPLATE_KEYWORDS = {
  전세대출: ['등본', '가족관계', '통장', '신분증'],
  취업: ['등본', '가족관계', '통장', '신분증'],
  학교: ['등본', '가족관계', '통장', '신분증'],
  '보험 청구': ['등본', '가족관계', '통장', '신분증'],
};

// "1-3, 5" 같은 문자열을 쪽 번호 목록으로. 예: "1-3, 5" → [1,2,3,5]
export function parseRanges(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  for (const part of text.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const dash = t.indexOf('-');
    if (dash > 0) {
      const a = Number(t.slice(0, dash).trim());
      const b = Number(t.slice(dash + 1).trim());
      if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && a >= 1 && b >= a) {
        for (let p = a; p <= b; p++) out.push(p);
      }
    } else {
      const p = Number(t);
      if (Number.isSafeInteger(p) && p >= 1) out.push(p);
    }
  }
  return out;
}

// 템플릿 이름과 파일명 목록을 받아, 파일명 키워드(등본·가족관계·통장·신분증) 순서로 정렬된 새 배열을 돌려준다.
// 일치하지 않는 파일은 뒤에 두고, 원래 순서를 유지한다. 같은 순위는 안정 정렬.
export function orderByTemplate(template, names) {
  const kw = TEMPLATE_KEYWORDS[template];
  if (!kw || !Array.isArray(names)) return names ? [...names] : [];
  return names
    .map((name, i) => ({ name, i, rank: kw.findIndex((k) => String(name).includes(k)) }))
    .sort((a, b) => (a.rank === -1 ? 999 : a.rank) - (b.rank === -1 ? 999 : b.rank) || a.i - b.i)
    .map((r) => r.name);
}

// select(3/5/10/20) 값 또는 커스텀 MB 텍스트를 해석해 목표 바이트수를 돌려준다.
// 합법적 숫자가 아니면 null.
export function parseTargetMb(selectValue, customText) {
  const src = (customText && String(customText).trim()) !== '' ? String(customText).trim() : String(selectValue ?? '').trim();
  if (!src) return null;
  const num = Number(src);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 1024 * 1024);
}
