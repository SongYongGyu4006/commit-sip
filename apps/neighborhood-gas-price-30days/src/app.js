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
  let lastExportedSummary = null;

  function $(id) {
    return document.getElementById(id);
  }

  function formatPrice(n) {
    if (typeof n !== 'number' || isNaN(n)) return '—원';
    return n.toLocaleString('ko-KR') + '원';
  }

  function formatAvg(n) {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('ko-KR');
  }

  function showError(msg) {
    const status = $('app-status');
    if (status) {
      status.textContent = msg;
      status.removeAttribute('hidden');
    }
  }

  function clearStatus() {
    const status = $('app-status');
    if (status) {
      status.textContent = '';
      status.setAttribute('hidden', '');
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fuel: selectedFuel, sido: selectedSido }));
    } catch (_) { /* 저장 실패는 무시 */ }
  }

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && s.fuel && FUEL_TO_VALUE[s.fuel]) selectedFuel = s.fuel;
      if (s && s.sido) selectedSido = s.sido;
    } catch (_) { /* 무시 */ }
  }

  function updateFuelOptions() {
    const sel = $('fuel-type');
    if (sel) sel.value = selectedFuel;
  }

  function updateSidoOptions(data) {
    const sel = $('sido-select');
    if (!sel || !data || !data.today || !data.today.sido) return;
    const sidenames = Object.keys(data.today.sido);
    // Keep the default option, update others
    sel.innerHTML = '<option value="">-- 모든 시도 --</option>';
    sidenames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === selectedSido) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function updateSummary(data, summary) {
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    if (!summary) return;

    // national price (big number)
    const np = $('national-price');
    if (np) {
      const price = summary.nationalAvg[fuelKey];
      if (typeof price === 'number' && !isNaN(price)) {
        np.textContent = formatPrice(price);
      } else {
        np.textContent = '—원';
      }
    }

    // national detail
    const nd = $('national-detail');
    if (nd) {
      const fuelKey = FUEL_TO_KEY[selectedFuel];
      nd.textContent = `오늘 전국 ${fuelKey} 평균가`;
    }

    // lowest 20
    renderLowest20(summary);

    // sido avg
    renderSidoAvgs(summary);

    // price history chart
    renderChart(summary.priceHistory);
  }

  function renderLowest20(summary) {
    const list = $('lowest-list');
    if (!list) return;
    const items = summary.lowest20;
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="ds-empty">현재 최저가 주유소 데이터가 없습니다.</div>';
      return;
    }

    // Filter by selected fuel if lowest_20 has per-fuel data
    const fuelKey = FUEL_TO_KEY[selectedFuel];
    list.innerHTML = '';
    const displayItems = items.slice(0, 20);
    displayItems.forEach(item => {
      const li = document.createElement('li');
      li.className = 'ds-list-item';
      const title = document.createElement('span');
      title.className = 'ds-list-title';
      title.textContent = item.name;
      const sub = document.createElement('span');
      sub.className = 'ds-list-sub';
      sub.textContent = item.address;
      const end = document.createElement('div');
      end.className = 'ds-list-end';
      const amount = document.createElement('span');
      amount.className = 'ds-list-amount';
      amount.textContent = formatPrice(item.price);

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(end);
      list.appendChild(li);
    });
  }

  function renderSidoAvgs(summary) {
    const list = $('sido-list');
    if (!list) return;
    const items = summary.sidoAvgs;
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="ds-empty">시도별 데이터가 없습니다.</div>';
      return;
    }

    const fuelKey = FUEL_TO_KEY[selectedFuel];
    list.innerHTML = '';

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'ds-list-item';
      const title = document.createElement('span');
      title.className = 'ds-list-title';
      title.textContent = item.sido;
      const sub = document.createElement('span');
      sub.className = 'ds-list-sub sido-price';
      const price = typeof item[fuelKey] === 'number' ? formatPrice(item[fuelKey]) : '—';
      sub.textContent = `${item.sido} ${price}`;
      const end = document.createElement('div');
      end.className = 'ds-list-end';
      const amount = document.createElement('span');
      amount.className = 'ds-list-amount';
      amount.textContent = price;

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(end);
      list.appendChild(li);
    });
  }

  function renderChart(history) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (!history || history.length === 0) {
      const canvas = $('history-chart');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--ds-ink-3');
          ctx.font = '15px ' + getComputedStyle(document.body).fontFamily;
          ctx.textAlign = 'center';
          ctx.fillText('가격 추이 데이터가 없습니다.', canvas.width / 2, canvas.height / 2);
        }
      }
      return;
    }

    const canvas = $('history-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive canvas sizing
    const wrap = canvas.parentElement;
    canvas.width = wrap ? wrap.clientWidth : 800;
    const isMobile = window.innerWidth <= 520;
    canvas.height = isMobile ? 220 : 260;

    const labels = history.map(h => h.date ?? '');
    const data = history.map(h => Math.round(h.avgOverall));

    // 모바일: 라벨이 적으면 날짜 생략/회전하여 겹침 방지
    const maxLabels = isMobile ? 7 : undefined;
    const rotatedLabels = isMobile && labels.length > 7
      ? labels.map((l, i) => (i % 2 === 0 ? l : ''))
      : labels;

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rotatedLabels,
        datasets: [{
          label: '전국 평균 (원)',
          data: data,
          borderColor: '#2f5bea',
          backgroundColor: 'rgba(47, 91, 234, 0.08)',
          fill: true,
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
          legend: { display: true, position: 'top', labels: { font: { size: isMobile ? 11 : 13 }, color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3') } },
          tooltip: {
            callbacks: {
              label: (ctx) => formatPrice(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: {
            ticks: {
              font: { size: isMobile ? 9 : 11 },
              color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'),
              maxRotation: isMobile ? 45 : 0,
              autoSkip: true,
              maxTicksLimit: maxLabels
            },
            title: { display: true, text: '날짜', color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'), font: { size: 12 } }
          },
          y: {
            ticks: {
              callback: v => v.toLocaleString('ko-KR') + '원',
              font: { size: isMobile ? 9 : 11 },
              color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'),
              maxTicks: isMobile ? 5 : 8
            },
            title: { display: true, text: '평균 가격 (원/ℓ)', color: getComputedStyle(document.body).getPropertyValue('--ds-ink-3'), font: { size: 12 } },
            min: 0
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

    // Update title based on fuel type
    const titleEl = $('lowest-title');
    const sidoTitleEl = $('sido-title');
    if (titleEl) titleEl.textContent = `최저가 주유소 20곳 (${summary.nationalAvg[fuelKey] !== undefined ? FUEL_TO_KEY[selectedFuel] : ''})`.replace(` (${FUEL_TO_KEY[selectedFuel]})`, '');

    updateSummary(rawData, summary);
  }

  function updateSidoFilter() {
    // Filter sidoAvgs by selected sido
    const summary = summarizeFuelPrices(rawData);
    const fuelKey = FUEL_TO_KEY[selectedFuel];

    // Update lowest title
    const lowestTitle = $('lowest-title');
    if (lowestTitle) lowestTitle.textContent = '최저가 주유소 20곳';

    // Filter sidoAvgs if specific sido selected
    let displaySidoAvgs = summary.sidoAvgs;
    if (selectedSido) {
      displaySidoAvgs = summary.sidoAvgs.filter(s => s.sido === selectedSido);
    }

    // Update national price (use selected fuel)
    const np = $('national-price');
    if (np) {
      const price = summary.nationalAvg[fuelKey];
      if (typeof price === 'number' && !isNaN(price)) {
        np.textContent = formatPrice(price);
      } else {
        np.textContent = '—원';
      }
    }

    // If sido selected, show 시도별 평균 header updates
    const sidoTitle = $('sido-title');
    if (sidoTitle) {
      sidoTitle.textContent = selectedSido ? `${selectedSido} 시도별 평균` : '시도별 평균';
    }

    // Update lowest list
    renderLowest20(summary);

    // Update sido list (filtered or not)
    renderSidoAvgsFiltered(summary, selectedSido);

    // Chart (full history always)
    renderChart(summary.priceHistory);
  }

  function renderSidoAvgsFiltered(summary, sidoFilter) {
    const list = $('sido-list');
    if (!list) return;
    let items = summary.sidoAvgs;
    if (sidoFilter) {
      items = items.filter(s => s.sido === sidoFilter);
    }
    if (!items || items.length === 0) {
      list.innerHTML = '<div class="ds-empty">시도별 데이터가 없습니다.</div>';
      return;
    }

    const fuelKey = FUEL_TO_KEY[selectedFuel];
    list.innerHTML = '';

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'ds-list-item';
      const title = document.createElement('span');
      title.className = 'ds-list-title';
      title.textContent = item.sido;
      const sub = document.createElement('span');
      sub.className = 'ds-list-sub sido-price';
      const price = typeof item[fuelKey] === 'number' ? formatPrice(item[fuelKey]) : '—';
      sub.textContent = `${item.sido} ${price}`;
      const end = document.createElement('div');
      end.className = 'ds-list-end';
      const amount = document.createElement('span');
      amount.className = 'ds-list-amount';
      amount.textContent = price;

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(end);
      list.appendChild(li);
    });
  }

  function applyFilters() {
    clearStatus();
    updateSidoFilter();
    saveState();
  }

  function showExample() {
    clearStatus();
    if (!rawData) {
      showError('먼저 데이터를 불러온 후 예시 버튼을 눌러 주세요.');
      return;
    }
    // 예시: 경유 + 서울로 전환해 실제 비교 결과를 보여줌 (이미 기본값인 경우와 다른 화면)
    const sidenames = Object.keys(rawData.today.sido);
    const targetSido = sidenames.length > 0 ? sidenames[0] : '';
    selectedFuel = 'diesel';
    selectedSido = targetSido;
    updateFuelOptions();
    updateDisplay();
    saveState();
  }

  async function loadData() {
    clearStatus();

    try {
      const [dataRes, metaRes] = await Promise.all([
        fetch('data/fuel_prices.json').then(r => r.json()),
        fetch('data/fuel_prices.meta.json').then(r => r.json())
      ]);
      rawData = dataRes;
      meta = metaRes;
      renderMeta();
      updateSidoOptions(rawData);
      updateDisplay();
    } catch (e) {
      showError('데이터 파일을 불러오는데 실패했습니다. data/fuel_prices.json 파일이 있는지 확인해 주세요.');
      console.error(e);
    }
  }

  function renderMeta() {
    if (!meta) return;
    const metaEl = $('data-meta');
    const footerEl = $('data-footer');

    if (metaEl) {
      let metaText = '';
      if (meta.fetched_at) {
        const dt = new Date(meta.fetched_at);
        metaText += `데이터 기준: ${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      }
      if (meta.terms) {
        metaText += ` · ${meta.terms}`;
      }
      metaEl.textContent = metaText;
    }

    if (footerEl) {
      footerEl.textContent = meta ? meta.terms || '' : '';
    }
  }

  async function init() {
    loadState();

    // Event listeners
    const fuelSel = $('fuel-type');
    if (fuelSel) {
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
        updateDisplay();
        saveState();
      });
    }

    const applyBtn = $('apply-button');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyFilters);
    }

    const exampleBtn = $('example-button');
    if (exampleBtn) {
      exampleBtn.addEventListener('click', showExample);
    }

    // Load data and start
    await loadData();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
