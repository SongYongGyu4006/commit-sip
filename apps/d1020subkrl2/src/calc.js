// 순수 계산 모듈: 구독 원화 계산, 플랜 목록, 기본값, KST 시각 변환.

export const PLAN_CATALOG = {
  netflix_standard: { id: "netflix_standard", name: "Netflix 표준", monthlyUsd: 15.49 },
  netflix_premium: { id: "netflix_premium", name: "Netflix 프리미엄", monthlyUsd: 22.99 },
  spotify_premium: { id: "spotify_premium", name: "Spotify Premium", monthlyUsd: 11.99 },
  chatgpt_plus: { id: "chatgpt_plus", name: "ChatGPT Plus", monthlyUsd: 20 },
  notion_plus: { id: "notion_plus", name: "Notion", monthlyUsd: 10 },
  youtube_premium: { id: "youtube_premium", name: "YouTube Premium", monthlyUsd: 13.99 },
};

export const DEFAULT_STATE = {
  selectedPlanIds: ["netflix_premium", "chatgpt_plus"],
  baselineKrwRate: 1380,
};

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

export function formatKstUpdate(updatedAtUtc) {
  const date = new Date(updatedAtUtc);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : "00";
  };
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} KST`;
}

export function calculateSubKrw(fxData, coinData, selectedPlanIds, baselineKrwRate = 1380) {
  if (!isPlainObject(fxData) || !isPlainObject(coinData)) {
    throw new TypeError("fxData 와 coinData 는 비어 있지 않은 객체여야 합니다.");
  }
  if (!Array.isArray(selectedPlanIds) || selectedPlanIds.some((id) => typeof id !== "string")) {
    throw new TypeError("selectedPlanIds 는 문자열 배열이어야 합니다.");
  }
  if (baselineKrwRate !== undefined && !isFiniteNumber(baselineKrwRate)) {
    throw new TypeError("baselineKrwRate 는 유한한 숫자여야 합니다.");
  }
  if (typeof fxData.time_last_update_utc !== "string") {
    throw new TypeError("fxData.time_last_update_utc 는 문자열이어야 합니다.");
  }
  if (!isPlainObject(fxData.rates) || !isFiniteNumber(fxData.rates.KRW)) {
    throw new TypeError("fxData.rates 에 유한한 숫자 KRW 값이 있어야 합니다.");
  }
  for (const coinKey of ["bitcoin", "ethereum"]) {
    const coin = coinData[coinKey];
    if (!isPlainObject(coin) || !isFiniteNumber(coin.usd) || !isFiniteNumber(coin.krw) || !isFiniteNumber(coin.krw_24h_change)) {
      throw new TypeError(`coinData.${coinKey} 에 유한한 숫자 usd, krw, krw_24h_change 가 있어야 합니다.`);
    }
  }

  if (fxData.rates.KRW <= 0) {
    throw new RangeError("KRW 환율은 0보다 커야 합니다.");
  }
  if (baselineKrwRate <= 0) {
    throw new RangeError("기준 환율은 0보다 커야 합니다.");
  }
  if (fxData.time_last_update_utc.trim() === "") {
    throw new RangeError("시각 문자열이 비어 있습니다.");
  }
  if (coinData.bitcoin.krw <= 0) {
    throw new RangeError("비트코인 원화 시세는 0보다 커야 합니다.");
  }
  if (coinData.ethereum.krw <= 0) {
    throw new RangeError("이더리움 원화 시세는 0보다 커야 합니다.");
  }
  const seen = new Set();
  for (const id of selectedPlanIds) {
    if (!PLAN_CATALOG[id]) {
      throw new RangeError("알 수 없는 요금제 id가 포함되어 있습니다: " + id);
    }
    if (seen.has(id)) {
      throw new RangeError("중복된 요금제 id가 포함되어 있습니다: " + id);
    }
    seen.add(id);
  }

  const krwRate = Math.round(fxData.rates.KRW);
  const baselineRate = Math.round(baselineKrwRate);
  const items = selectedPlanIds.map((id) => {
    const plan = PLAN_CATALOG[id];
    const monthlyKrw = Math.round(plan.monthlyUsd * krwRate);
    const yearlyKrw = monthlyKrw * 12;
    const baselineMonthlyKrw = Math.round(plan.monthlyUsd * baselineRate);
    const diffMonthlyKrw = monthlyKrw - baselineMonthlyKrw;
    return { id, name: plan.name, monthlyUsd: plan.monthlyUsd, monthlyKrw, yearlyKrw, diffMonthlyKrw };
  });
  const totalMonthlyKrw = items.reduce((sum, item) => sum + item.monthlyKrw, 0);
  const totalYearlyKrw = items.reduce((sum, item) => sum + item.yearlyKrw, 0);
  const totalDiffMonthlyKrw = items.reduce((sum, item) => sum + item.diffMonthlyKrw, 0);
  const toCoin = (coin) => {
    const change24hPct = Math.round(coin.krw_24h_change * 100) / 100;
    const changeText = (change24hPct > 0 ? "+" : "") + change24hPct.toFixed(2) + "%";
    return { usd: coin.usd, krw: Math.round(coin.krw), change24hPct, changeText };
  };

  return {
    krwRate,
    baselineRate,
    updatedAtUtc: fxData.time_last_update_utc,
    items,
    totalMonthlyKrw,
    totalYearlyKrw,
    totalDiffMonthlyKrw,
    coins: { bitcoin: toCoin(coinData.bitcoin), ethereum: toCoin(coinData.ethereum) },
  };
}
