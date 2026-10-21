// 공휴일·날씨 데이터 파일과 메타 파일 4개를 fetch로 읽고 파싱한다.
// 하나라도 실패하면 오류를 던진다. (화면에서 받아서 한국어 오류로 표시한다.)

const FILES = ['data/kr_holidays.json', 'data/weather.json', 'data/kr_holidays.meta.json', 'data/weather.meta.json'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' 파일을 불러오지 못했습니다(' + res.status + ')');
  return res.json();
}

export async function loadAllData() {
  const [holidays, weather, holidaysMeta, weatherMeta] = await Promise.all(FILES.map(fetchJson));
  return { holidays, weather, holidaysMeta, weatherMeta };
}
