/**
 * 우리동네 기름값 30일 — 순수 함수 summarizeFuelPrices + UI 로직
 * Node.js에서 import해도 화면·저장소·전역에 부작용 없음.
 */

const FUEL_KEYS = ['고급휘발유', '휘발유', '경유', '실내등유', '자동차용 LPG'];
const FUEL_TO_VALUE = { '고급휘발유': 'premium', '휘발유': 'gasoline', '경유': 'diesel', '자동차용 LPG': 'lpg', '실내등유': 'kerosene' };
const FUEL_TO_KEY = Object.fromEntries(Object.entries(FUEL_TO_VALUE).map(([k, v]) => [v, k]));
const STORAGE_KEY = 'fuelApp_state';

function isValidFuelData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const today = data.today;
  if (!today || typeof today !== 'object' || typeof today.national !== 'object' || typeof today.sido !== 'object') return false;
  return true;
}

function getFuelKeys(obj) {
  return FUEL_KEYS.filter(k => typeof obj[k] === 'number' && obj[k] >= 0);
}

export function summarizeFuelPrices(fuelData) {
  if (!isValidFuelData(fuelData)) {
    throw new TypeError('잘못된 데이터 형식입니다. today.national과 today.sido를 포함하는 객체를 전달하세요.');
  }

  const { today, lowest_20 = [], history = [] } = fuelData;
  const date = today.date;
  const national = today.national;

  const nationalAvg = { ...national };

  const sidenames = Object.keys(today.sido);
  const sidoAvgs = sidenames.map(sidoName => {
    const sidoData = today.sido[sidoName];
    const result = { sido: sidoName };
    if (sidoData && typeof sidoData === 'object') {
      // Preserve original key order from source; missing fuel keys get 0
      const existingKeys = Object.keys(sidoData).filter(k => FUEL_KEYS.includes(k) && typeof sidoData[k] === 'number');
      const addedKeys = new Set(existingKeys);
      // Insert existing keys first in original order
      existingKeys.forEach(fuel => { result[fuel] = sidoData[fuel]; });
      // Then missing fuel keys as 0 (in FUEL_KEYS order)
      FUEL_KEYS.forEach(fuel => {
        if (!addedKeys.has(fuel)) { result[fuel] = 0; }
      });
    }
    return result;
  });

  const lowest20 = [];
  // Per SPEC: lowest_20 is 'array of objects each having name, price, address'
  // Handle both flat array (spec format) and legacy per-sido object
  if (Array.isArray(lowest_20)) {
    for (const station of lowest_20) {
      if (station && typeof station === 'object') {
        const price = typeof station.price === 'number' ? station.price : 0;
        lowest20.push({ ...station, price });
      }
    }
  } else if (lowest_20 && typeof lowest_20 === 'object') {
    // Legacy per-sido, per-fuel object format: lowest_20[시도][연료] = [{name,price,address}]
    const sidoKeys = Object.keys(lowest_20);
    for (const s of sidoKeys) {
      const fuelStations = lowest_20[s];
      if (fuelStations && typeof fuelStations === 'object') {
        const fuelKeys = Object.keys(fuelStations);
        for (const fk of fuelKeys) {
          const stations = fuelStations[fk];
          if (Array.isArray(stations)) {
            for (const station of stations) {
              if (station && typeof station === 'object') {
                const price = typeof station.price === 'number' ? station.price : 0;
                lowest20.push({ ...station, price });
              }
            }
          }
        }
      }
    }
  }
  lowest20.sort((a, b) => a.price - b.price);
  // SPEC: 'up to 20'
  if (lowest20.length > 20) lowest20.length = 20;

  // SPEC: history is 'array of objects ... optional, defaults to []'
  // If history is not an array (wrong type), treat as missing — don't crash
  const validHistory = Array.isArray(history) ? history : [];

  const priceHistory = validHistory
    .map(entry => {
      const e = entry == null ? {} : entry;
      const nat = (e.national) || {};
      const keys = getFuelKeys(nat);
      const sum = keys.reduce((acc, k) => acc + nat[k], 0);
      const avgOverall = keys.length ? sum / keys.length : 0;
      return { date: e.date, avgOverall };
    })
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

  return { date, nationalAvg, sidoAvgs, lowest20, priceHistory };
}

/* ---- UI (Node 환경에서 import 시에는 정의만 하고 실행하지 않음) ---- */

function isDOM() {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

if (isDOM()) {
  let rawData = null;
  let meta = null;
  let chartInstance = null;
  let selectedFuel = 'gasoline';
  let selectedSido = '';
  let selectedSigungu = '';

  function $(id) {
    return document.getElementById(id);
  }

  // 원 금액은 1,000 단위 쉼표로, 소수점 없이(1,842원)
  function formatPrice(n) {
    if (typeof n !== 'number' || isNaN(n)) return '—원';
    return Math.round(n).toLocaleString('ko-KR') + '원';
  }

  function formatSigned(n) {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    const r = Math.round(n);
    const sign = r > 0 ? '+' : r < 0 ? '-' : '';
    return sign + Math.abs(r).toLocaleString('ko-KR') + '원';
  }

  function showError(msg, bad) {
    const status = $('app-status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'ds-status ds-status-bad';
    status.removeAttribute('hidden');
  }

  function clearStatus() {
    const status = $('app-status');
    if (status) {
      status.textContent = '';
      status.className = 'ds-status';
      status.setAttribute('hidden', '');
    }
  }

  // studio.css 에 정의가 없는 유틸 클래스 (증감은 한국 관례: 오름 빨강·내림 파랑)
  function addUtility() {
    const s = document.createElement('style');
    s.textContent = '.ds-h3{font-size:18px;line-height:1.35;margin:0 0 var(--ds-s1);font-weight:700}.ds-muted{color:var(--ds-ink-3);font-size:14px;margin:0}';
    document.head.appendChild(s);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fuel: selectedFuel, sido: selectedSido, sigungu: selectedSigungu }));
    } catch (_) { /* 저장 실패는 무시 */ }
  }

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && s.fuel && FUEL_TO_VALUE[s.fuel]) selectedFuel = s.fuel;
      if (s && s.sido) selectedSido = s.sido;
      if (s && s.sigungu) selectedSigungu = s.sigungu;
    } catch (_) { /* 무시 */ }
  }

  function setSelect(sel, value, defaultText) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${defaultText}</option>`;
    sel.value = value || '';
  }

  function updateSidoOptions(data) {
    const sel = $('sido-select');
    if (!sel || !data || !data.today || !data.today.sido) return;
    const names = Object.keys(data.today.sido);
    sel.innerHTML = '<option value="">-- 모든 시도 --</option>';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === selectedSido) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!sel.value) selectedSido = '';
  }


  function updateSigunguOptions() {
    const sel = $('sigungu-select');
    if (!sel || !rawData) {
      if (sel) setSelect(sel, '', '-- 시군구 전체 --');
      return;
    }
    const words = new Set();
    const l20 = rawData.lowest_20;
    const stationList = Array.isArray(l20) ? l20 : [];
    const bySido = (sidoName) => {
      if (Array.isArray(l20)) {
        // 평평한 배열이면 주소가 시도명으로 시작하는 것만
        return stationList.filter(s => typeof s.address === 'string' && s.address.startsWith(sidoName));
      }
      if (!l20 || typeof l20 !== 'object') return [];
      const s = l20[sidoName];
      if (!s || typeof s !== 'object') return [];
      const out = [];
      for (const fk of Object.keys(s)) if (Array.isArray(s[fk])) out.push(...s[fk]);
      return out;
    };
    for (const st of (selectedSido ? bySido(selectedSido) : stationList)) {
      if (!st || typeof st.address !== 'string') continue;
      // 주소: '경북 포항시 남구 …' → 시·도(군) 단어를 뺀 뒤 남은 단어('남구')
      const toks = st.address.split(' ').filter(Boolean);
      const rest = toks.slice(1).join(' ');
      const m = rest.match(/^[가-힣]+(?:시|도|군)/);
      if (m) {
        const w = rest.slice(m[0].length).split(' ')[0];
        if (w) words.add(w);
      }
    }
    sel.innerHTML = '<option value="">-- 시군구 전체 --</option>';
    [...words].sort((a, b) => a.localeCompare(b, 'ko')).forEach(w => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = w;
      sel.appendChild(opt);
    });
    sel.value = [...sel.options].some(o => o.value === selectedSigungu) ? selectedSigungu : '';
    selectedSigungu = sel.value;
  }

  // 화면용 최저가 필터: rawData.lowest_20 을 직접 읽고 시도·시군구·연료로 거른다.
  function getDisplayLowest() {
    const l20 = rawData ? rawData.lowest_20 : null;
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    let stations = [];
    if (Array.isArray(l20)) {
      stations = l20;
      if (selectedSido) stations = stations.filter(s => typeof s.address === 'string' && s.address.startsWith(selectedSido));
    } else if (l20 && typeof l20 === 'object') {
      // [시도][연료] 구조: 선택한 시도에 선택한 연료가 있으면 그 연료만,
      // 없으면 그 시도의 있는 연료를 모아 보여 준다(데이터에 연료가 없을 때 '없음'이 되지 않도록).
      if (selectedSido) {
        const s = l20[selectedSido];
        if (s && typeof s === 'object') {
          if (Object.prototype.hasOwnProperty.call(s, fuelKey) && Array.isArray(s[fuelKey])) {
            stations = s[fuelKey];
          } else {
            for (const fk of Object.keys(s)) if (Array.isArray(s[fk])) stations.push(...s[fk]);
          }
        }
      } else {
        for (const sk of Object.keys(l20)) {
          const s = l20[sk];
          if (!s || typeof s !== 'object') continue;
          if (Object.prototype.hasOwnProperty.call(s, fuelKey) && Array.isArray(s[fuelKey])) stations.push(...s[fuelKey]);
        }
      }
    } else {
      return null;
    }
    // 가격 없는(0이 되는) 항목 제외
    stations = stations.filter(s => s && typeof s.price === 'number' && s.price > 0);
    if (selectedSigungu) {
      stations = stations.filter(s => typeof s.address === 'string' && s.address.includes(selectedSigungu));
    }
    // 이름+주소 기준으로 중복 제거
    const seen = new Set();
    const deduped = [];
    for (const s of stations) {
      const key = (s.name || '') + '|' + (s.address || '');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
    }
    deduped.sort((a, b) => a.price - b.price);
    return deduped.slice(0, 20);
  }

  function avatarHue(name) {
    let h = 0;
    for (const c of String(name || '')) h += c.codePointAt(0);
    return h % 8;
  }

  function listRow(name, subText, priceText) {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const av = document.createElement('span');
    av.className = 'ds-avatar';
    av.dataset.hue = String(avatarHue(name));
    av.textContent = String(name || '—').slice(0, 1);
    av.setAttribute('aria-hidden', 'true');
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = name || '—';
    main.appendChild(title);
    if (subText) {
      const sub = document.createElement('span');
      sub.className = 'ds-list-sub';
      sub.textContent = subText;
      main.appendChild(sub);
    }
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const amount = document.createElement('span');
    amount.className = 'ds-list-amount';
    amount.textContent = priceText;
    end.appendChild(amount);
    li.appendChild(av);
    li.appendChild(main);
    li.appendChild(end);
    return li;
  }

  function renderLowest20() {
    const list = $('lowest-list');
    const title = $('lowest-title');
    const hint = $('lowest-hint');
    if (!list) return;
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    const region = selectedSido || '전국';
    if (title) title.textContent = `${region} ${FUEL_TO_KEY[fuelKey]} 최저가 주유소 20곳`;
    if (hint) {
      hint.textContent = selectedSido
        ? (selectedSigungu ? `${selectedSido} ${selectedSigungu} 주유소, 가격 낮은 순이에요.` : `${selectedSido} 주유소만 보여 드려요.`)
        : '시도를 고르면 그 지역 주유소만 보여 드려요.';
    }
    const items = getDisplayLowest();
    list.innerHTML = '';
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="ds-empty">이 지역·연료의 최저가 데이터가 없습니다. 다른 시도를 골라 보세요.</div>`;
      return;
    }
    items.forEach(item => {
      list.appendChild(listRow(item.name, item.address || '', formatPrice(item.price)));
    });
  }

  function renderSidoAvgs(summary) {
    const list = $('sido-list');
    const title = $('sido-title');
    if (!list) return;
    if (title) title.textContent = '시도별 평균';
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    let items = summary.sidoAvgs || [];
    if (selectedSido) items = items.filter(s => s.sido === selectedSido);
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="ds-empty">시도별 데이터가 없습니다.</div>';
      return;
    }
    items.forEach(item => {
      const price = typeof item[fuelKey] === 'number' && item[fuelKey] > 0 ? formatPrice(item[fuelKey]) : '—';
      list.appendChild(listRow(item.sido, fuelKey, price));
    });
  }

  function renderChart() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    const canvas = $('history-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!rawData) return;

    // 선택한 연료의 전국 일별 기록으로 그린다 (SPEC: history[].national[연료키])
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    const entries = (Array.isArray(rawData.history) ? rawData.history : [])
      .map(h => ({ date: h ? h.date : '', price: h && h.national ? h.national[fuelKey] : undefined }))
      .filter(e => e.date && typeof e.price === 'number' && e.price > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const hint = $('history-hint');
    if (hint) {
      if (entries.length) hint.textContent = `선 = 전국 평균 ${fuelKey}(${entries.length}일), 가로 = 날짜(연도 포함), 세로 = 원/ℓ`;
      else hint.textContent = `선 = 전국 평균 ${fuelKey}, 가로 = 날짜(연도 포함), 세로 = 원/ℓ`;
    }

    if (!entries.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ink = getComputedStyle(document.body).getPropertyValue('--ds-ink-3') || '#888';
      const fs2 = getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = ink;
      ctx.font = `15px ${fs2}`;
      ctx.textAlign = 'center';
      ctx.fillText(`이 연료의 ${fuelKey} 가격 기록이 없습니다.`, canvas.width / 2, canvas.height / 2);
      return;
    }

    const isMobile = window.innerWidth <= 520;
    const labels = entries.map(e => e.date);
    const data = entries.map(e => e.price);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = Math.max(max - min, 1);

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `전국 평균 ${fuelKey}`,
          data: data,
          borderColor: getComputedStyle(document.body).getPropertyValue('--ds-c1') || '#2f5bea',
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => formatPrice(c.parsed.y)
            }
          }
        },
        scales: {
          x: {
            ticks: {
              font: { size: isMobile ? 10 : 11 },
              color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'),
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: isMobile ? 5 : 8
            },
            grid: { display: false },
            title: { display: false }
          },
          y: {
            min: min - range * 0.1,
            max: max + range * 0.1,
            ticks: {
              callback: v => Math.round(v).toLocaleString('ko-KR'),
              font: { size: isMobile ? 10 : 11 },
              color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'),
              maxTicksLimit: isMobile ? 5 : 7
            },
            title: { display: false }
          }
        }
      }
    });
  }

  function updateDisplay() {
    clearStatus();
    if (!rawData) return;

    const fuelKey = FUEL_TO_KEY[selectedFuel];
    const summary = summarizeFuelPrices(rawData);

    // 답 카드: 전국 평균 큰 숫자
    const price = summary.nationalAvg ? summary.nationalAvg[fuelKey] : undefined;
    const np = $('national-price');
    if (np) np.textContent = (typeof price === 'number' && price > 0) ? formatPrice(price) : '—원';

    // 보조 숫자 2개: 어제보다, 최근 30일 최저
    const dayEl = $('answer-day');
    const lowEl = $('answer-low');
    const hist = (Array.isArray(rawData.history) ? rawData.history : [])
      .map(h => h && h.national ? h.national[fuelKey] : undefined)
      .filter(v => typeof v === 'number' && v > 0)
      .sort((a, b) => a - b);
    if (lowEl) lowEl.textContent = hist.length ? formatPrice(hist[0]) : '—';
    if (dayEl) {
      const last = hist.length >= 2 ? hist[hist.length - 2] : (typeof price === 'number' ? price : null);
      const prev = hist.length >= 2 ? hist[hist.length - 1] : null;
      if (last !== null && prev !== null) {
        const diff = last - prev;
        dayEl.textContent = formatSigned(diff);
        dayEl.className = Math.abs(diff) < 0.5 ? 'ds-flat' : (diff > 0 ? 'ds-up' : 'ds-down');
      } else {
        dayEl.textContent = '—';
        dayEl.className = 'ds-flat';
      }
    }

    // 한 문장
    const nd = $('national-detail');
    if (nd) {
      const region = selectedSido || '전국';
      const lowest = getDisplayLowest();
      if (lowest && lowest.length) {
        const best = lowest[0];
        const range = lowest.length > 1 ? `~${formatPrice(lowest[lowest.length - 1].price)}` : '';
        nd.textContent = `${region} 최저가 ${best.name}은(는) 리터당 ${formatPrice(best.price)}${range}이에요.`;
      } else {
        nd.textContent = `${region} ${fuelKey} 평균은 리터당 ${np ? np.textContent : '—'}이에요.`;
      }
    }

    renderLowest20();
    renderSidoAvgs(summary);
    renderChart();
  }

  function applyFilters() {
    clearStatus();
    updateDisplay();
    saveState();
  }

  function showExample() {
    clearStatus();
    if (!rawData || !rawData.today || !rawData.today.sido) {
      showError('먼저 데이터를 불러온 후 예시 버튼을 눌러 주세요.', true);
      return;
    }
    // 예시: 경유 + 서울 + 서울 안 시군구 하나
    const sidos = Object.keys(rawData.today.sido);
    const target = sidos.includes('서울') ? '서울' : (sidos[0] || '');
    selectedFuel = 'diesel';
    selectedSido = target;
    $('fuel-type').value = 'diesel';
    $('sido-select').value = target;
    // 서울 시군구 목록에서 실제로 주유소가 있는 첫 번째를 고른다
    updateSigunguOptions();
    const sel = $('sigungu-select');
    const candidates = [...sel.options].map(o => o.value).filter(v => v);
    let pick = candidates[0] || '';
    selectedSigungu = pick;
    sel.value = pick;
    updateDisplay();
    saveState();
    const nd = $('national-detail');
    if (nd) nd.textContent = `예시로 ${FUEL_TO_KEY[selectedFuel]} + ${selectedSido}${pick ? ' ' + pick : ''} 을(를) 골랐어요.`;
  }

  // fetched_at 에 'Z'나 '+09:00' 같은 타임존 표시가 없으면 한국 시간(KST)으로 해석한다.
  function localTime(iso) {
    const s = String(iso || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return null;
    if (s.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + 9, Number(m[5]), 0, 0);
  }

  function renderMeta() {
    const metaEl = $('data-meta');
    const footerEl = $('data-footer');
    // 메타 줄: 기준 시각만. 약관·출처는 푸터에만.
    if (metaEl) {
      metaEl.innerHTML = '';
      if (meta && meta.fetched_at) {
        const dt = localTime(meta.fetched_at) || new Date(meta.fetched_at);
        const span = document.createElement('span');
        span.textContent = `데이터 기준: ${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
        metaEl.appendChild(span);
      }
    }
    if (footerEl) {
      const parts = [];
      if (meta) {
        if (meta.source) parts.push(`출처: ${meta.source}`);
        if (meta.terms) parts.push(meta.terms);
      }
      footerEl.textContent = parts.join(' · ');
    }
  }

  function onResize() {
    renderChart();
  }

  async function loadData() {
    clearStatus();
    try {
      const [dataRes, metaRes] = await Promise.all([
        fetch('data/fuel_prices.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
        fetch('data/fuel_prices.meta.json').then(r => r.json())
      ]);
      if (!isValidFuelData(dataRes)) {
        showError('데이터 파일의 형식이 달라 화면을 만들 수 없습니다. 파일을 다시 받아 주세요.', true);
        return;
      }
      rawData = dataRes;
      meta = metaRes;
      renderMeta();
      updateSidoOptions(rawData);
      updateSigunguOptions();
      updateDisplay();
    } catch (e) {
      console.error(e);
      showError('데이터 파일을 불러오는데 실패했습니다. 페이지를 새로고침해 주세요.', true);
    }
  }

  async function init() {
    addUtility();
    loadState();

    const fuelSel = $('fuel-type');
    if (fuelSel) {
      // 저장값이 select에 없으면(예: 예시 저장 후 재방문) 옵션에 추가한다
      if (selectedFuel && ![...fuelSel.options].some(o => o.value === selectedFuel)) {
        const o = document.createElement('option');
        o.value = selectedFuel;
        o.textContent = FUEL_TO_KEY[selectedFuel];
        fuelSel.appendChild(o);
      }
      fuelSel.value = selectedFuel;
      fuelSel.addEventListener('change', () => {
        selectedFuel = fuelSel.value;
        updateDisplay();
        saveState();
      });
    }

    const sidoSel = $('sido-select');
    if (sidoSel) {
      sidoSel.addEventListener('change', () => {
        selectedSido = sidoSel.value;
        selectedSigungu = ''; // 시도 바뀌면 시군구 초기화
        updateSigunguOptions();
        updateDisplay();
        saveState();
      });
    }

    const sgSel = $('sigungu-select');
    if (sgSel) {
      sgSel.addEventListener('change', () => {
        selectedSigungu = sgSel.value;
        updateDisplay();
        saveState();
      });
    }

    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.font.size = 11;
      Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--ds-ink-3').trim() || '#8a8f98';
    }

    const applyBtn = $('apply-button');
    if (applyBtn) applyBtn.addEventListener('click', applyFilters);

    const exampleBtn = $('example-button');
    if (exampleBtn) exampleBtn.addEventListener('click', showExample);

    window.addEventListener('resize', onResize);

    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
