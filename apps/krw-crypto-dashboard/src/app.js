// krcoinfx — 순수 계산: coin_price + fx_rates + 선택된 코인 id → 원화 요약
// 화면·저장소·전역에 부작용이 없도록 순수 함수만 제공한다.

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function round2(x) {
  const r = (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * 100) / 100;
  return r === 0 ? 0 : r;
}

const FIELDS = ["usd", "usd_24h_change", "krw", "krw_24h_change"];
const DEFAULT_IDS = ["bitcoin", "ethereum"];

export function summarizeKrwCoins(coinPrice, fxRates, coinIds) {
  if (!isPlainObject(coinPrice)) throw new TypeError("coinPrice는 평범한 객체여야 합니다");
  if (!isPlainObject(fxRates)) throw new TypeError("fxRates는 평범한 객체여야 합니다");
  if (!isPlainObject(fxRates.rates)) throw new TypeError("fxRates.rates는 평범한 객체여야 합니다");
  if (typeof fxRates.rates.KRW !== "number") throw new TypeError("fxRates.rates.KRW는 숫자여야 합니다");
  if (!Array.isArray(coinIds)) throw new TypeError("coinIds는 문자열 배열이어야 합니다");
  for (const id of coinIds) {
    if (typeof id !== "string") throw new TypeError("coinIds에는 문자열만 넣을 수 있습니다");
  }

  const ids = coinIds.length ? coinIds.slice() : DEFAULT_IDS.slice();
  const seen = new Set();
  for (const id of ids) {
    if (id === "") throw new RangeError("coinIds 항목은 빈 문자열일 수 없습니다");
    if (seen.has(id)) throw new RangeError("coinIds에 같은 코인이 두 번 있습니다");
    seen.add(id);
  }

  const krwRate = fxRates.rates.KRW;
  if (!Number.isFinite(krwRate) || krwRate <= 0) {
    throw new RangeError("fxRates.rates.KRW는 0보다 큰 유한한 숫자여야 합니다");
  }

  const rows = [];
  for (const id of ids) {
    const entry = coinPrice[id];
    if (entry === undefined) throw new RangeError("선택한 코인 '" + id + "' 데이터가 없습니다");
    if (!isPlainObject(entry)) throw new TypeError("'" + id + "' 데이터는 객체여야 합니다");
    const values = {};
    for (const f of FIELDS) {
      const v = entry[f];
      if (typeof v !== "number") {
        throw new TypeError("'" + id + "'의 " + f + "는 숫자여야 합니다");
      }
      if (!Number.isFinite(v)) {
        throw new RangeError("'" + id + "'의 " + f + "가 NaN 또는 무한대입니다");
      }
      values[f] = v;
    }
    if (values.usd <= 0) throw new RangeError("'" + id + "' usd는 0보다 커야 합니다");
    if (values.krw <= 0) throw new RangeError("'" + id + "' krw는 0보다 커야 합니다");
    if (values.usd_24h_change <= -100) throw new RangeError("'" + id + "' usd_24h_change는 -100보다 커야 합니다");
    if (values.krw_24h_change <= -100) throw new RangeError("'" + id + "' krw_24h_change는 -100보다 커야 합니다");
    const rawFx = values.krw_24h_change - values.usd_24h_change;
    rows.push({
      id,
      usdPrice: values.usd,
      krwPrice: Math.round(values.krw),
      usdChangePct: round2(values.usd_24h_change),
      krwChangePct: round2(values.krw_24h_change),
      fxEffectPct: round2(rawFx),
      direction: values.krw_24h_change > 0 ? "up" : values.krw_24h_change < 0 ? "down" : "flat",
    });
  }
  return { usdKrw: round2(krwRate), rows };
}

export { round2 };
