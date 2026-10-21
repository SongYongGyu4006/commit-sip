// 계획 화면: 연차 슬라이더·기준 날짜·예시 버튼을 연결하고 결과 카드를 그린다.
import { findVacationWindows, dayInfo } from './app.js';
import { formatKoreanDate, formatPeriod, formatWeatherText } from './format.js';

// 상태·데이터·콜백을 한 번에 받아 화면을 연결한다.
export function initPlanScreen({ state, holidays, weather, onRecalc, onSave, onSetOverride, onLeaveChange, onExample }) {
  const screen = document.getElementById('screen-plan');
  const slider = document.getElementById('leave-slider');
  const leaveValue = document.getElementById('leave-value');
  const todayInput = document.getElementById('today-input');
  const exampleButton = document.getElementById('example-button');

  slider.value = state.leaveDays;
  todayInput.value = state.todayOverride ?? '';

  const refreshLeaveLabel = () => {
    leaveValue.textContent = slider.value + '일';
  };
  refreshLeaveLabel();

  slider.addEventListener('input', () => {
    refreshLeaveLabel();
    state.leaveDays = Number(slider.value);
    onLeaveChange(state);
    onRecalc(state);
  });

  todayInput.addEventListener('change', () => {
    state.todayOverride = todayInput.value || null;
    onSetOverride(state);
    onRecalc(state);
  });

  exampleButton.addEventListener('click', () => {
    slider.value = 3;
    todayInput.value = '2026-09-21';
    state.leaveDays = 3;
    state.todayOverride = '2026-09-21';
    onExample(state);
    refreshLeaveLabel();
    onRecalc(state);
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
  if (!windows.length) return;

  for (const w of windows) {
    const li = document.createElement('li');
    li.className = 'card';

    const period = document.createElement('div');
    period.className = 'card-period';
    period.textContent = formatPeriod(w.start, w.end);

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

    // 기간 내 날짜를 연차·주말·공휴일 태그와 함께 보여 준다.
    const dates = document.createElement('div');
    dates.className = 'card-dates';
    let t = new Date(Date.UTC(...w.start.split('-').map(Number)));
    const end = Date.UTC(...w.end.split('-').map(Number));
    const leaveSet = new Set(w.leaveDates);
    const subSet = new Set(w.substituteDates);
    const DAY = 86400000;
    for (let d = t.getTime(); d <= end; d += DAY) {
      const iso = new Date(d).toISOString().slice(0, 10);
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
