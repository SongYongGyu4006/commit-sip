// fetch 로 data/ 아래 환율·코인 JSON과 meta JSON 네 개를 읽어 하나의 객체로 돌려준다.

async function readJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data 파일을 읽지 못했습니다: ${url} (HTTP ${res.status})`);
  return res.json();
}

export async function loadAllData() {
  const [fx, fxMeta, coin, coinMeta] = await Promise.all([
    readJson("data/fx_rates.json"),
    readJson("data/fx_rates.meta.json"),
    readJson("data/coin_price.json"),
    readJson("data/coin_price.meta.json"),
  ]);
  return { fx, fxMeta, coin, coinMeta };
}
