// 화면용 순수 포맷터: 숫자·시간을 한국어 문자열로 바꾼다.

const coinNames = { bitcoin: "비트코인", ethereum: "이더리움", solana: "솔라나" };

// 108985372 → "108,985,372" (정수, 천 단위 쉼표)
export function formatWon(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 1331.45 → "1,331.45" (2자리 소수, 천 단위 쉼표)
export function formatRate(n) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 2 → "+2.00" / -1.23 → "-1.23" / 0 → "0.00" (값이 이미 round2됨; 표시가 0이면 부호 없음)
export function formatSigned(n) {
  const r = round2Display(n);
  const body = Math.abs(r).toFixed(2);
  return (r < 0 ? "-" : r > 0 ? "+" : "") + body;
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

// 막대 너비: min(100, abs(변동률) * 10)
export function barWidth(pct) {
  return Math.min(100, Math.abs(pct) * 10);
}
