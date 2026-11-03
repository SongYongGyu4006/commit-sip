// data/ 아래 시세·환율(+meta) 파일을 fetch로 읽어 반환하고, 내장 예시를 제공한다.
// 환율 데이터는 하루 1회라 24시간 전 환율은 없다 → "24시간 전 1$"을 저장해 두고,
// 없으면 오늘 환율로 채운다(= 환율 효과 0).

async function readJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("read fail: " + url);
  return r.json();
}

// { coinPrice, coinMeta, fxRates, fxMeta } — 하나라도 실패하면 오류가 퍼트리도록 그대로 던진다.
export async function loadAllData() {
  const [coinPrice, coinMeta, fxRates, fxMeta] = await Promise.all([
    readJson("data/coin_price.json"),
    readJson("data/coin_price.meta.json"),
    readJson("data/fx_rates.json"),
    readJson("data/fx_rates.meta.json"),
  ]);
  return { coinPrice, coinMeta, fxRates, fxMeta };
}

// ISO 문자열(2026-10-29T04:00:17) → 서울 시간 "오전 01:00" (HH:mm, 24시간제)
export function formatSeoulClock(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const time = new Intl.DateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" }).format(d);
  return time + " 기준";
}

// ISO 문자열 → "N분 전" / "N시간 전" 상대 시간 (서울 시간)
export function formatRelativeSeoul(iso) {
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

// "예시로 해 보기"용 내장 데이터: SPEC 검증 예시 1의 값(솔라나 포함)이라 실데이터와 확연히 다릅니다.
export const SAMPLE_DATA = {
  coinPrice: {
    bitcoin: { usd: 81829, usd_24h_change: 2, krw: 108985372, krw_24h_change: 3.5 },
    ethereum: { usd: 2397.34, usd_24h_change: -1.234, krw: 3192947.6, krw_24h_change: -0.5 },
    solana: { usd: 150, usd_24h_change: 5, krw: 200000, krw_24h_change: 6 },
  },
  fxRates: { result: "success", base_code: "USD", rates: { USD: 1, KRW: 1331.45, JPY: 151.2 } },
  coinMeta: { fetched_at: "2026-10-20T22:03:56", terms: "무료 공개 API(호출 제한, 출처 표기 권장)" },
  fxMeta: { terms: "무료, 하루 1회 갱신" },
};
