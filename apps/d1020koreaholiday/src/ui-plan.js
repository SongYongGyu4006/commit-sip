// 계획 화면: 연차 슬라이더·기준 날짜·예시 버튼을 연결하고 결과 카드와
// 연차별 비교 막대를 그린다. 상태는 이 모듈에서 직접 바꾸지 않고 값을
// 콜백으로 넘겨 main.js 가 갱신하게 한다.
import { findVacationWindows, dayInfo } from './app.js';
import { formatKoreanDate, formatPeriod, formatWeatherText, toDate } from './format.js';

// 상태·데이터·콜백을 한 번에 받아 화면을 연결한다.
export function initPlanScreen({ state, holidays, weather, onRecalc, onSave, onSetOverride, onLeaveChange, onExample }) {
  const screen = document.getElementById('screen-plan');
  const slider = document.getElementById('leave-slider');
  const leaveValue = document.getElementById('leave-value');
  const todayInput = document.getElementById('today-input');
  const exampleButton = document.getElementById('example-button');
  const compareList = document.getElementById('leave-compare');

  slider.value = state.leaveDays;
  todayInput.value = state.todayOverride ?? '';

  const refreshLeaveLabel = () => {
    leaveValue.textContent = slider.value + '일';
  };
  refreshLeaveLabel();

  // 슬라이더: 연차만 바꾼다. 값을 넘기고 다시 계산·저장한다.
  slider.addEventListener('input', () => {
    refreshLeaveLabel();
    onLeaveChange(Number(slider.value));
    onRecalc();
  });

  // 날짜 입력: 기준 날짜만 바꾼다. (비우면 null)
  todayInput.addEventListener('change', () => {
    onSetOverride(Number(slider.value), todayInput.value);
    onRecalc();
  });

  // 예시: 연차 3일 + 2026-09-21 로 채우고 다시 계산한다.
  exampleButton.addEventListener('click', () => {
    slider.value = 3;
    todayInput.value = '2026-09-21';
    refreshLeaveLabel();
    onExample(3, '2026-09-21');
    onRecalc();
  });
}

// 날짜에 표시할 태그(공휴일/주말/연차/대체) — 순수 함수 dayInfo 로 성격을 얻어 만든다.
function renderDateChip(iso, holidays, isLeaveDay, isSubstitute) {
  const span = document.createElement('span');
  span.className = 'chip';
  const info = dayInfo(iso, holidays);
  const labels = [];
  if (info.isHoliday) labels.push('공휴일');
  if (info.isWeekend) labels.push('주말');
  if (isLeaveDay) labels.push('연차');
  if (isSubstitute) labels.push('대체');
  span.textContent = formatKoreanDate(iso) + (labels.length ? ' ' + labels.join('·') : '');
  return span;
}

// 결과 카드 목록을 그린다. windows: findVacationWindows 반환값의 windows 배열.
export function renderCards(windows, holidays, onCardSave) {
  const list = document.getElementById('card-list');
  list.textContent = '';
  // 결과(및 비교)가 접혀 있는 구역: 내용이 바뀌면 닫혀 있는 그대로 유지해 첫 화면을 깔끔히 둔다.
  if (!windows.length) return;

  for (const w of windows) {
    const li = document.createElement('li');
    li.className = 'card';

    const period = document.createElement('div');
    period.className = 'card-period';
    period.textContent = formatPeriod(w.start, w.end, true);

    const total = document.createElement('div');
    total.className = 'card-total';
    total.textContent = w.totalDays + '일';

    const holidaysEl = document.createElement('div');
    holidaysEl.className = 'card-holidays';
    holidaysEl.textContent = '공휴일 ' + w.holidayCount + '일';

    const leave = document.createElement('div');
    leave.className = 'card-leave';
    leave.textContent = '연차 ' + w.leaveUsed + '일';

    const line = document.createElement('div');
    line.className = 'card-line';
    line.append(period, total, holidaysEl, leave);
    if (w.substituteDates.length) {
      const sub = document.createElement('span');
      sub.className = 'badge badge-substitute';
      sub.textContent = '대체 휴무';
      line.append(sub);
    }

    const weatherEl = document.createElement('div');
    weatherEl.className = 'card-weather';
    weatherEl.textContent = formatWeatherText(w.weather);
    if (w.weather && w.weather.rainyDays >= 1) {
      const rain = document.createElement('span');
      rain.className = 'badge badge-rain';
      rain.textContent = '비 예상';
      weatherEl.append(rain);
    }

    // 기간 내 날짜를 연차·주말·공휴일 태그와 함께 보여 준다. (format.js 의 toDate 로 날짜 계산)
    const dates = document.createElement('div');
    dates.className = 'card-dates';
    const leaveSet = new Set(w.leaveDates);
    const subSet = new Set(w.substituteDates);
    const DAY = 86400000;
    for (let t = toDate(w.start).getTime(); t <= toDate(w.end).getTime(); t += DAY) {
      const iso = new Date(t).toISOString().slice(0, 10);
      dates.append(renderDateChip(iso, holidays, leaveSet.has(iso), subSet.has(iso)));
    }

    const saveButton = document.createElement('button');
    saveButton.className = 'save-button';
    saveButton.textContent = '저장';
    saveButton.addEventListener('click', () => onCardSave(w));

    li.append(line, weatherEl, dates, saveButton);
    list.append(li);
  }
}

// 연차별 연휴 길이 비교: rows = [{leaveDays, totalDays}], current = 현재 슬라이더 값.
// rows 의 totalDays 가 null 이면 결과가 없어 "-" 로 표시한다.
export function renderCompare(rows, current, { onLeaveChange, onRecalc, onSync }) {
  const list = document.getElementById('leave-compare');
  list.textContent = '';
  const max = Math.max(1, ...rows.map((r) => r.totalDays || 0));
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = 'compare-row' + (r.leaveDays === current ? ' current' : '');
    const label = document.createElement('span');
    label.className = 'compare-label';
    label.textContent = '연차 ' + r.leaveDays + '일 → ' + (r.totalDays ? '최장 ' + r.totalDays + '일' : '-');
    const bar = document.createElement('div');
    bar.className = 'compare-bar';
    bar.style.width = ((r.totalDays || 0) / max) * 100 + '%';
    li.append(label, bar);
    // 행을 누르면 그 연차로 슬라이더를 바꾸고 다시 계산한다.
    li.addEventListener('click', () => {
      onSync(r.leaveDays); // 슬라이더·라벨을 그 값으로
      onLeaveChange(r.leaveDays);
      onRecalc();
    });
    list.append(li);
  }
}
