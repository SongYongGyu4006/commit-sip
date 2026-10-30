// 화면용 순수 포맷터: 숫자·시간을 한국어 문자열로 바꾼다.

const coinNames = { bitcoin: "비트코인", ethereum: "이더리움", solana: "솔라나" };

// 108985372 → "108,985,372" (정수, 천 단위 쉼표)
export function formatWon(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 1331.45 → "1,331원" (원화 금액은 소수점 없이, 천 단위 쉼표)
export function formatRate(n) {
  return formatWon(Math.round(n)) + "원";
}

// 2 → "+2" / -1.23 → "-1.23" / 0 → "0" / 18.5 → "18.5"
// 값이 정수면 소수점 없이, 아니면 round2(2자리) 후 불필요한 0은 자른다(1,000 단위 쉼표)
export function formatSigned(n) {
  const r = round2Display(n);
  const body = formatNumber(r);
  return (r < 0 ? "-" : r > 0 ? "+" : "") + body;
}

// 18 → "18" / 18.5 → "18.5" / 18.25 → "18.25" (정수는 소수점 없이, 천 단위 쉼표)
export function formatNumber(n) {
  const r = round2Display(n);
  const isInt = Math.abs(r) % 1 === 0;
  return (isInt ? String(Math.round(r)) : String(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 12345 → "12,345원" (₩·원 혼용 금지: 금액은 천 단위 + '원')
export function formatWonAmount(n) {
  const r = Math.round(n);
  return (r < 0 ? "-" : "") + formatWon(Math.abs(r)) + "원";
}

// -0 → 0 (표시용)
function round2Display(n) {
  const r = (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100) / 100;
  return r === 0 ? 0 : r;
}

// 코인 id → 한국어 이름 (없는 id는 원문 id 그대로)
export function coinName(id) {
  return coinNames[id] || id;
}

// ISO 문자열 → "2026-10-20 22:03" (Asia/Seoul)
export function formatSeoulTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const tz = { timeZone: "Asia/Seoul" };
  const date = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...tz }).format(d);
  const time = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...tz }).format(d);
  return date + " " + time;
}

// ISO 문자열 → "N분 전" / "N시간 전" 상대 시간
export function formatRelativeTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return diffMin + "분 전";
  const h = Math.floor(diffMin / 60);
  if (h < 24) return h + "시간 " + (diffMin % 60 ? (diffMin % 60) + "분 " : "") + "전";
  const day = Math.floor(h / 24);
  return day + "일 전";
}

// 막대 너비: min(100, abs(변동률) * 10)
export function barWidth(pct) {
  return Math.min(100, Math.abs(pct) * 10);
}
