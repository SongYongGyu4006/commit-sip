// 날짜·기간·날씨 문구를 만드는 순수 포맷 모듈. (import해도 부작용이 없다.)

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad2 = (n) => String(n).padStart(2, '0');
// 'YYYY-MM-DD' → UTC 기준 Date (월은 0부터 시작해 m-1).
export const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (t) => t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());

// 'YYYY-MM-DD' → '10월 3일(토)' (Korean weekday letters). withYear이면 '2026년 10월 3일(토)'.
export function formatKoreanDate(iso, withYear) {
  const t = toDate(iso);
  const year = withYear ? t.getUTCFullYear() + '년 ' : '';
  return year + (t.getUTCMonth() + 1) + '월 ' + t.getUTCDate() + '일(' + WEEKDAYS[t.getUTCDay()] + ')';
}

// 기간: '10월 3일(토) ~ 10월 11일(일)'. withYear이면 시작 날짜에만 연도를 붙인다.
export function formatPeriod(startIso, endIso, withYear) {
  if (startIso === endIso) return formatKoreanDate(startIso, withYear);
  return formatKoreanDate(startIso, withYear) + ' ~ ' + formatKoreanDate(endIso);
}

// 날씨 요약 → '예상 날씨: 최고 15.2°C / 최저 6.8°C / 강수 1.7mm' (없으면 '예보 범위 밖').
export function formatWeatherText(weather) {
  if (!weather) return '예보 범위 밖';
  return '예상 날씨: 최고 ' + weather.tempMaxAvg + '°C / 최저 ' + weather.tempMinAvg + '°C / 강수 ' + weather.precipSumAvg + 'mm';
}

// 서울(Asia/Seoul) 기준 오늘 날짜를 'YYYY-MM-DD' 문자열로.
export function todayInSeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// 'YYYY-MM-DD' 형식이며 실제로 존재하는 날짜인지.
export function isValidDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && toIso(toDate(iso)) === iso;
}
