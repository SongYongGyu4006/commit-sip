// Korea Holiday Plan — 순수 계산 모듈.
// holidays(데이터 행), weather(날씨 객체 또는 null), leaveDays(0..7), todayIso(YYYY-MM-DD)를 받아
// 기준 날짜부터 해당 연도 말까지 가장 긴 연속 휴가 후보 최대 3개를 계산한다.
// (import해도 화면·저장소·전역에 부작용이 없다.)

const DAY_MS = 86400000;
const round1 = (x) => Math.round(x * 10) / 10;

const pad2 = (n) => String(n).padStart(2, '0');
const toDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (t) => t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(toDate(s)) === s;
const isWorkday = (iso) => toDate(iso).getUTCDay() !== 0 && toDate(iso).getUTCDay() !== 6;

function validate(holidays, weather, leaveDays, todayIso) {
  if (!Array.isArray(holidays)) throw new TypeError('holidays는 배열이어야 합니다.');
  if (typeof leaveDays !== 'number') throw new TypeError('leaveDays는 숫자여야 합니다.');
  if (typeof todayIso !== 'string') throw new TypeError('todayIso는 문자열이어야 합니다.');
  if (weather !== null && (typeof weather !== 'object' || weather === null)) throw new TypeError('weather는 null 또는 객체여야 합니다.');
  if (weather !== null) {
    if (weather.daily === undefined || typeof weather.daily !== 'object' || weather.daily === null) throw new TypeError('weather.daily가 없거나 객체가 아닙니다.');
    for (const f of ['time', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum']) {
      if (!Array.isArray(weather.daily[f])) throw new TypeError('weather.daily.' + f + '은(는) 배열이어야 합니다.');
    }
  }
  if (!isIso(todayIso)) throw new RangeError('todayIso가 유효한 YYYY-MM-DD 날짜가 아닙니다.');
  if (!Number.isInteger(leaveDays) || leaveDays < 0 || leaveDays > 7) throw new RangeError('leaveDays는 0~7 사이의 정수여야 합니다.');
  for (const row of holidays) {
    if (typeof row !== 'object' || row === null) throw new TypeError('holidays 행은 객체여야 합니다.');
    if (typeof row.date !== 'string' || typeof row.localName !== 'string') throw new TypeError('holidays 행의 date·localName은 문자열이어야 합니다.');
  }
  for (const row of holidays) {
    if (!isIso(row.date)) throw new RangeError('holidays 행의 date가 유효한 날짜가 아닙니다.');
  }
  if (weather !== null) {
    const d = weather.daily;
    if (d.temperature_2m_max.length !== d.time.length || d.temperature_2m_min.length !== d.time.length || d.precipitation_sum.length !== d.time.length) {
      throw new RangeError('weather.daily 배열의 길이가 다릅니다.');
    }
    for (const t of d.time) if (!isIso(t)) throw new RangeError('weather.daily.time 항목이 유효한 날짜가 아닙니다.');
    for (const f of ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum']) {
      for (const v of d[f]) {
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) throw new RangeError('weather.daily 값은 숫자 또는 null이어야 합니다.');
      }
    }
  }
}

// 날짜 목록이 날씨 예보에 몇 일이나 겹치는지 요약한다.
function windowWeather(weather, dates) {
  if (!weather) return null;
  const byDate = new Map();
  weather.daily.time.forEach((t, i) => byDate.set(t, i));
  let covered = 0, maxSum = 0, minSum = 0, precipSum = 0, rainy = 0;
  for (const d of dates) {
    const i = byDate.get(d);
    if (i === undefined) continue;
    const mx = weather.daily.temperature_2m_max[i];
    const mn = weather.daily.temperature_2m_min[i];
    const pr = weather.daily.precipitation_sum[i];
    if (typeof mx !== 'number' || typeof mn !== 'number' || typeof pr !== 'number') continue;
    covered++;
    maxSum += mx;
    minSum += mn;
    precipSum += pr;
    if (pr >= 1) rainy++;
  }
  if (covered === 0) return null;
  return {
    coveredDays: covered,
    tempMaxAvg: round1(maxSum / covered),
    tempMinAvg: round1(minSum / covered),
    precipSumAvg: round1(precipSum / covered),
    rainyDays: rainy,
  };
}

// 화면(카드)에서 날짜의 성격을 보여 주기에 편하게, 내부 로직과 같은 판정 기준을 공유한다.
export function dayInfo(iso, holidays) {
  const holidayDates = new Set(holidays.map((r) => r.date));
  const substituteDates = new Set(holidays.filter((r) => r.localName.includes('대체')).map((r) => r.date));
  const isHoliday = holidayDates.has(iso);
  const isWeekend = toDate(iso).getUTCDay() === 0 || toDate(iso).getUTCDay() === 6;
  return { isHoliday, isWeekend, isOff: isHoliday || isWeekend, isWorkday: !(isHoliday || isWeekend), isSubstitute: substituteDates.has(iso) };
}

export function findVacationWindows(holidays, weather, leaveDays, todayIso) {
  validate(holidays, weather, leaveDays, todayIso);

  const holidayDates = new Set(holidays.map((r) => r.date));
  const substituteDates = new Set(holidays.filter((r) => r.localName.includes('대체')).map((r) => r.date));
  const isOff = (iso) => holidayDates.has(iso) || !isWorkday(iso);

  // 캘린더: todayIso → 해당 연도 12월 31일 (단순 날짜 연산, 시간대 무시).
  const start = toDate(todayIso);
  const end = toDate(String(start.getUTCFullYear()) + '-12-31');
  const days = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const iso = toIso(new Date(t));
    days.push({ iso, off: isOff(iso) });
  }
  const index = new Map();
  days.forEach((x, i) => index.set(x.iso, i));

  // 연속으로 붙은 '여유일'(주말 또는 공휴일) 블록.
  const blocks = [];
  let cur = null;
  for (const day of days) {
    if (day.off) {
      if (cur) cur.e = day.iso;
      else cur = { s: day.iso, e: day.iso };
    } else {
      if (cur) blocks.push(cur);
      cur = null;
    }
  }
  if (cur) blocks.push(cur);

  // 후보 = 여유일 블록 두 끝 [blocks[i].s, blocks[j].e] (i <= j)을 잇는 기간:
  // 양 끝은 여유일(블록 끝)이므로 s-1 / e+1 경계 조건이 자연히 성립하고,
  // 구간 안의 근무일 수(쓸 연차)가 leaveDays 이하만 후보가 된다.
  // SPEC: "The workday flanks may be partial: [s,e] is a window for every length of workdays
  // taken, from 0 up to leaveDays, as long as the s-1/e+1 boundary condition holds" —
  // 중간에 부분 근무일만 포함하면 자동으로 모든 부분 길이가 후보가 된다.
  const candidates = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i; j < blocks.length; j++) {
      let workdays = 0;
      for (let k = index.get(blocks[i].s); k <= index.get(blocks[j].e); k++) {
        if (!days[k].off) workdays++;
        if (workdays > leaveDays) break;
      }
      if (workdays <= leaveDays) candidates.push({ s: blocks[i].s, e: blocks[j].e });
    }
  }

  // 후보마다 기간 내 공휴일·연차·대체 휴무 날짜 집계.
  for (const w of candidates) {
    w.totalDays = Math.round((toDate(w.e) - toDate(w.s)) / DAY_MS) + 1;
    let holidayCount = 0;
    const leaveDates = [];
    const substitute = [];
    for (let t = toDate(w.s).getTime(); t <= toDate(w.e).getTime(); t += DAY_MS) {
      const iso = toIso(new Date(t));
      if (holidayDates.has(iso)) holidayCount++;
      if (!isOff(iso)) leaveDates.push(iso);
      if (substituteDates.has(iso)) substitute.push(iso);
    }
    w.holidayCount = holidayCount;
    w.leaveDates = leaveDates;
    w.leaveUsed = leaveDates.length;
    w.substituteDates = substitute;
  }

  // 총 일수 내림차순 → 쓰는 연차 오름차순 → 시작일 오름차순.
  candidates.sort((a, b) =>
    b.totalDays - a.totalDays ||
    a.leaveUsed - b.leaveUsed ||
    (a.s < b.s ? -1 : a.s > b.s ? 1 : 0)
  );

  // 날짜가 겹치지 않는 후보를 순서대로 골라 최대 3개.
  const kept = [];
  for (const w of candidates) {
    if (kept.some((k) => !(w.s > k.e || w.e < k.s))) continue;
    kept.push(w);
    if (kept.length === 3) break;
  }

  const windows = kept.map((w) => {
    const dates = [];
    for (let t = toDate(w.s).getTime(); t <= toDate(w.e).getTime(); t += DAY_MS) dates.push(toIso(new Date(t)));
    return {
      start: w.s,
      end: w.e,
      totalDays: w.totalDays,
      holidayCount: w.holidayCount,
      leaveUsed: w.leaveUsed,
      leaveDates: w.leaveDates,
      substituteDates: w.substituteDates,
      weather: windowWeather(weather, dates),
    };
  });
  return { windows };
}
