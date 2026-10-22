// data/ 아래 시세·환율(+meta) 파일을 fetch로 읽어 반환하고, 내장 예시를 제공한다.

async function readJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("read fail: " + url);
  return r.json();
}

// { coinPrice, coinMeta, fxRates, fxMeta } — 하나라도 실패하면 오류가 퍼트리도록 그대로 던진다
export async function loadAllData() {
  const [coinPrice, coinMeta, fxRates, fxMeta] = await Promise.all([
    readJson("data/coin_price.json"),
    readJson("data/coin_price.meta.json"),
    readJson("data/fx_rates.json"),
    readJson("data/fx_rates.meta.json"),
  ]);
  return { coinPrice, coinMeta, fxRates, fxMeta };
}

// "예시로 해 보기"용 내장 데이터: data/ 파일 내용 그대로(솔라나 포함, KRW 1,331.45)
export const SAMPLE_DATA = {
  coinPrice: {
    bitcoin: { krw: 108086247, krw_24h_change: -1.6171559524551522, usd: 81414, usd_24h_change: -1.4484972666294742 },
    ethereum: { krw: 3172329, krw_24h_change: -1.6429684944341656, usd: 2389.51, usd_24h_change: -1.4743540593053626 },
    solana: { krw: 138377, krw_24h_change: -1.2379703631985979, usd: 104.23, usd_24h_change: -1.0686616357545262 },
  },
  fxRates: { result: "success", base_code: "USD", rates: { USD: 1, KRW: 1331.45, JPY: 151.2 } },
  coinMeta: { fetched_at: "2026-10-20T22:03:56", terms: "무료 공개 API(호출 제한, 출처 표기 권장)" },
  fxMeta: { terms: "무료, 하루 1회 갱신" },
};
