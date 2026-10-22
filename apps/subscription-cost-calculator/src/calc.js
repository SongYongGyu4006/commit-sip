// 구독 요금 계산 코어(순수 함수). Node(tools/selfcheck.mjs)과 브라우저(main.js) 양쪽에서 그대로 실행된다.
// SPEC.md의 순수 함수 규칙·검증된 예시 4개를 정확히 따른다. UI·localStorage·fetch는 여기 없다.

// 내장 요금제(정확한 id, 한국어 이름, USD 월액 — SPEC 고정)
export const PLAN_CATALOG = {
  netflix_standard: { id: "netflix_standard", name: "Netflix 표준", monthlyUsd: 15.49 },
  netflix_premium: { id: "netflix_premium", name: "Netflix 프리미엄", monthlyUsd: 22.99 },
  spotify_premium: { id: "spotify_premium", name: "Spotify Premium", monthlyUsd: 11.99 },
  chatgpt_plus: { id: "chatgpt_plus", name: "ChatGPT Plus", monthlyUsd: 20 },
  notion_plus: { id: "notion_plus", name: "Notion", monthlyUsd: 10 },
  youtube_premium: { id: "youtube_premium", name: "YouTube Premium", monthlyUsd: 13.99 },
};

// 기준 환율 기본값(7일 평균 자리 표시). fx_rates 는 오늘 환율만 주므로 여기서 유도하지 않는다.
export const DEFAULT_BASELINE_KRW_RATE = 1380;

// CHANGES #3: 첫 화면에 인기 구독 5개를 미리 체크(Netflix 프리미엄·YouTube·Spotify·ChatGPT·Notion).
export const DEFAULT_STATE = {
  selectedPlanIds: ["netflix_premium", "youtube_premium", "spotify_premium", "chatgpt_plus", "notion_plus"],
  baselineKrwRate: DEFAULT_BASELINE_KRW_RATE,
};

// '예시로 해 보기' 버튼: 기본값(인기 5개 + 1380)과 눈에 띄게 다른 구성(Netflix 표준 + Spotify + YouTube + 1350).
// 기본값과 같으면 버튼이 아무것도 바꿔 보이지 않아서, 기본 5개에서 넷플릭스는 표준으로 바꾸고 기준 환율도 낮춘다.
export const EXAMPLE_STATE = {
  selectedPlanIds: ["netflix_standard", "spotify_premium", "youtube_premium"],
  baselineKrwRate: 1350,
};

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isPlain(v) {
  return v !== null && typeof v === "object";
}

// SPEC 검증 규칙: shape이 어긋나면 TypeError, 값이 어긋나면 RangeError.
function validate(fx, coin, selectedIds, baseline) {
  if (!isPlainObject(fx) || !isPlainObject(coin)) throw new TypeError("fx/coin 데이터가 객체가 아닙니다.");
  if (!Array.isArray(selectedIds)) throw new TypeError("선택 요금제 목록은 배열이어야 합니다.");
  if (!selectedIds.every((x) => typeof x === "string")) throw new TypeError("선택 요금제 목록은 문자열 배열이어야 합니다.");
  if (baseline !== undefined && !isFiniteNumber(baseline)) throw new TypeError("기준 환율은 숫자여야 합니다.");
  if (typeof fx.time_last_update_utc !== "string") throw new TypeError("환율 갱신 시각이 올바르지 않습니다.");
  if (!isPlain(fx.rates) || !isFiniteNumber(fx.rates.KRW)) throw new TypeError("환율 데이터에 KRW 값이 없습니다.");
  for (const key of ["bitcoin", "ethereum"]) {
    const c = coin[key];
    if (!isPlainObject(c) || !isFiniteNumber(c.usd) || !isFiniteNumber(c.krw) || !isFiniteNumber(c.krw_24h_change)) {
      throw new TypeError("코인 시세가 올바르지 않습니다.");
    }
  }
  if (fx.rates.KRW <= 0) throw new RangeError("환율이 0보다 커야 합니다.");
  if (baseline !== undefined && baseline <= 0) throw new RangeError("기준 환율은 0보다 커야 합니다.");
  if (fx.time_last_update_utc.trim() === "") throw new RangeError("환율 갱신 시각이 비어 있습니다.");
  if (coin.bitcoin.krw <= 0 || coin.ethereum.krw <= 0) throw new RangeError("코인 시세가 0보다 커야 합니다.");
  const seen = new Set();
  for (const id of selectedIds) {
    if (!PLAN_CATALOG[id]) throw new RangeError(`모르는 요금제 id입니다: ${id}`);
    if (seen.has(id)) throw new RangeError(`같은 요금제가 두 번 있습니다: ${id}`);
    seen.add(id);
  }
}

// 환율+코인+선택 id(+ 기준 환율)을 받아 계산 결과를 돌려준다.
// selfcheck(tools/examples.json)가 이 시그니처·필드·예시로 검증한다.
export function calculateSubKrw(fxData, coinData, selectedPlanIds, baselineKrwRate = DEFAULT_BASELINE_KRW_RATE) {
  validate(fxData, coinData, selectedPlanIds, baselineKrwRate);
  const krwRate = Math.round(fxData.rates.KRW);
  const baselineRate = Math.round(baselineKrwRate);
  const items = selectedPlanIds.map((id) => {
    const plan = PLAN_CATALOG[id];
    const monthlyKrw = Math.round(plan.monthlyUsd * krwRate);
    const baselineMonthlyKrw = Math.round(plan.monthlyUsd * baselineRate);
    return {
      id: plan.id,
      name: plan.name,
      monthlyUsd: plan.monthlyUsd,
      monthlyKrw,
      yearlyKrw: monthlyKrw * 12,
      diffMonthlyKrw: monthlyKrw - baselineMonthlyKrw,
    };
  });
  const coinOut = {};
  for (const key of ["bitcoin", "ethereum"]) {
    const c = coinData[key];
    const krw = Math.round(c.krw);
    const change24hPct = Math.round(c.krw_24h_change * 100) / 100;
    coinOut[key] = { usd: c.usd, krw, change24hPct, changeText: (change24hPct > 0 ? "+" : "") + change24hPct.toFixed(2) + "%" };
  }
  return {
    krwRate,
    baselineRate,
    updatedAtUtc: fxData.time_last_update_utc,
    items,
    totalMonthlyKrw: items.reduce((s, i) => s + i.monthlyKrw, 0),
    totalYearlyKrw: items.reduce((s, i) => s + i.yearlyKrw, 0),
    totalDiffMonthlyKrw: items.reduce((s, i) => s + i.diffMonthlyKrw, 0),
    coins: coinOut,
  };
}

// KST(UTC+9) 문자열: '2026-01-02 15:04:05 KST' 형태
export function formatKstUpdate(utcString) {
  const date = new Date(utcString);
  if (Number.isNaN(date.getTime())) return "알 수 없음";
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => iso.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} KST`;
}
