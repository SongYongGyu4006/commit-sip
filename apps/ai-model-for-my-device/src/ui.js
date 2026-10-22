// 화면(UI) 모듈 — data/hf_models.json + data/hf_models.meta.json 을 fetch 로 읽고 planModels 로 렌더링.
import { planModels, fitByVram, rankModels } from './app.js';

const $ = (sel) => document.querySelector(sel);
const statusEl = () => $('#app-status');

const DATA_TIME_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Asia/Seoul(KST) 기준 YYYY-MM-DD HH:mm KST */
export function formatKstDateTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const parts = DATA_TIME_FMT.formatToParts(new Date(t));
  const g = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? (type === 'hour' && p.value === '24' ? '00' : p.value) : '';
  };
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')} KST`;
}

/** Asia/Seoul(KST) 기준 YYYY-MM-DD (실패 시 null) */
export function formatKstDate(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = DATA_TIME_FMT.formatToParts(new Date(t));
  const g = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '';
  };
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function textNode(v) {
  const s = document.createElement('span');
  s.textContent = String(v);
  return s;
}

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = 'badge ' + cls;
  b.textContent = text;
  return b;
}

const fmtGb = (v) => (v === null ? '미상' : String(v));

// --- 예시: 화면의 select 를 특정 값으로 고정 ---
export function setSelects({ ram, task, quant }) {
  if (ram) $('#ram-select').value = String(ram);
  if (task) $('#task-select').value = task;
  if (quant) $('#quant-select').value = quant;
}

function setStatus(message, ok = false) {
  statusEl().innerHTML = '';
  if (!message) return;
  const d = document.createElement('div');
  d.className = 'status' + (ok ? ' ok' : '');
  d.textContent = message;
  statusEl().append(d);
}

function metaFrom(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const fetchedAt = raw.fetched_at ? formatKstDateTime(raw.fetched_at) : '';
  const terms = [
    typeof raw.terms === 'string' && raw.terms ? raw.terms : null,
    '출처: Hugging Face 공개 API',
  ].filter(Boolean).join(' · ');
  return { fetchedAt, terms };
}

/**
 * 결과 렌더링. models = planModels 의 반환 items, raw = 원본 행, controls = 선택값.
 * 에러 시에는 이전 화면을 유지하고 status 로만 안내.
 */
export function render(models, raw, controls) {
  const { ramGb, quantBit } = controls;
  const list = $('#model-list');
  const quantKey = quantBit === '4bit' ? 'estimated4bitGb' : 'estimated8bitGb';
  const rawById = new Map(raw.map((r) => [r.id, r]));

  // 요약 — SPEC 고정 문구 1줄 + 불가 원인 분해 2줄
  const base = models.filter((x) => x.isBaseModel);
  const n = base.filter((x) => x.runnable).length;
  const m = base.filter((x) => !x.runnable).length;
  const noParams = base.filter((x) => x.estimatedTotalGb === null).length;
  const ramShort = m - noParams;
  const sumEl = $('#summary');
  sumEl.innerHTML = '';
  const line1 = document.createElement('div');
  line1.className = 'summary-main';
  line1.textContent = `돌릴 수 있는 모델 ${n}개 / 불가 ${m}개`;
  const line2 = document.createElement('div');
  line2.className = 'summary-sub';
  line2.textContent = `불가 원인: RAM 부족 ${ramShort}개 · 파라미터 미상 ${noParams}개`;
  const line3 = document.createElement('div');
  line3.className = 'summary-sub';
  const total = models.length;
  line3.textContent = `전체 ${total}개 · 가능 ${n} · RAM 부족 ${ramShort} · 파라미터 미상 ${noParams}`;
  sumEl.append(line1, line2, line3);

  // 데이터 기준 시각·이용 조건
  $('#data-time').textContent = metaFrom(window.__hfMeta).fetchedAt;
  $('#data-terms').textContent = metaFrom(window.__hfMeta).terms;

  // TOP3 요약 카드(정렬 모드 기준 상위 3개)
  const topCard = $('#top-card');
  if (topCard) {
    topCard.innerHTML = '';
    const top = models.slice(0, 3);
    if (top.length) {
      const tLabel = document.createElement('div');
      tLabel.className = 'top-label';
      tLabel.textContent =
        controls.rank === 'downloads' ? '상위 3개 (많이 사용)'
        : controls.rank === 'optimized' ? '상위 3개 (내 RAM 대비 최적)'
        : '상위 3개 (인기)';
      const row = document.createElement('div');
      row.className = 'top-row';
      for (const it of top) {
        const c = document.createElement('div');
        c.className = 'top-item';
        const tid = document.createElement('a');
        tid.className = 'top-id';
        tid.href = 'https://huggingface.co/' + it.id;
        tid.target = '_blank';
        tid.rel = 'noopener';
        tid.textContent = it.id;
        tid.addEventListener('click', (e) => e.stopPropagation());
        const tsub = document.createElement('div');
        tsub.className = 'top-sub';
        if (controls.rank === 'downloads') {
          tsub.textContent = `다운로드 ${Number(it.downloads || 0).toLocaleString('ko-KR')}`;
        } else if (controls.rank === 'optimized') {
          tsub.textContent = it.estimatedTotalGb === null
            ? '파라미터 미상'
            : `총 필요 메모리(추정) ${it.estimatedTotalGb}GB`;
        } else {
          tsub.textContent = `트렌드 점수 ${Number(it.trendingScore || 0).toLocaleString('ko-KR')}`;
        }
        c.append(tid, tsub);
        row.append(c);
      }
      topCard.append(tLabel, row);
    }
  }

  // 목록 (정렬 모드별 순서만 재배열 — planModels 반환 순서·내용은 그대로)
  const ranked = rankModels(models, controls.rank, controls.ramGb);
  list.innerHTML = '';
  for (const it of ranked) {
    const li = document.createElement('li');
    li.className = 'model';
    li.dataset.id = it.id;

    const head = document.createElement('div');
    head.className = 'head';
    const mid = document.createElement('a');
    mid.className = 'mid';
    mid.href = 'https://huggingface.co/' + it.id;
    mid.target = '_blank';
    mid.rel = 'noopener';
    mid.textContent = it.id;
    // 링크 클릭은 행 상세 토글(클릭 전파)과 충돌하지 않도록 차단
    mid.addEventListener('click', (e) => e.stopPropagation());
    head.append(mid);

    if (it.isNew) head.append(badge('NEW', 'new'));
    const raw = rawById.get(it.id);
    const vram = fitByVram(it, controls.vramGb);
    if (it.parameters === null) {
      // 파라미터가 없거나 신뢰할 수 없는(null) 경우 — SPEC: '파라미터 미상'
      li.classList.add('no-params');
      head.append(badge('파라미터 미상', 'quant'));
      if (vram === 'unknown') head.append(badge('VRAM 미상(추정)', 'vram'));
    } else {
      head.append(badge(`${quantBit} 추정 ${it[quantKey]}GB`, 'quant'));
      if (vram === 'vram-full') head.append(badge('VRAM 전량 적재(추정)', 'vram'));
      else if (vram === 'offload') head.append(badge('RAM 오프로딩 필요(추정)', 'vram off'));
    }
    if (!it.isBaseModel) {
      li.classList.add('disabled');
      head.append(badge('양자화본/어댑터', 'dim'));
    } else if (it.runnable) {
      head.append(badge('가능(추정)', 'ok'));
    } else {
      li.classList.add('disabled');
      head.append(badge('RAM 부족(추정)', 'no'));
    }

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.append(
      textNode(`출시: ${formatKstDate(raw && raw.createdAt) || '출시일 미상'}`),
      textNode(`좋아요 ${Number(it.likes || 0).toLocaleString('ko-KR')}`),
      textNode(`다운로드 ${Number(it.downloads || 0).toLocaleString('ko-KR')}`),
    );

    // 한 줄 요약(한국어): 총 필요 메모리 구성
    const summaryLine = document.createElement('div');
    summaryLine.className = 'sub';
    if (it.estimatedTotalGb === null) {
      summaryLine.textContent =
        '파라미터 수가 없어 총 필요 메모리를 추정할 수 없습니다. 실행 가능 여부를 판단할 수 없습니다.';
    } else {
      summaryLine.textContent =
        `총 필요 메모리(추정) ${it.estimatedTotalGb}GB — 가중치(양자화) ${it[quantKey]}GB, ` +
        `런타임 예약 ${it.runtimeReservationGb}GB, KV 캐시 ${it.kvCacheGb}GB. ` +
        (it.runnable
          ? `내 램 ${ramGb}GB 안에 들어오니 실행이 가능할 것으로 보입니다(추정). 실제 실행엔 더 많은 램이 필요할 수 있습니다.`
          : `내 램 ${ramGb}GB보다 크기 때문에 실행이 어려울 것으로 보입니다(추정). 더 작은 모델이나 더 큰 램이 필요합니다.`);
    }

    li.append(head, sub, summaryLine);

    // 어두운(차이) 행 클릭 시 상세 토글
    if (li.classList.contains('disabled')) {
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.style.display = 'none';
      const weight = it.parameters === null ? null : it[quantKey];
      // SPEC 지정 문구(원문 그대로). 값이 null 이면 '미상' 로 표시.
      detail.textContent =
        `총 필요 메모리(가중치 ${quantBit} ${weight === null ? '미상' : weight}GB` +
        ` + 런타임 ${it.runtimeReservationGb}GB` +
        ` + KV ${it.kvCacheGb === null ? '미상' : it.kvCacheGb}GB)` +
        ` = ${it.estimatedTotalGb === null ? '미상' : it.estimatedTotalGb}GB` +
        ` — 내 RAM ${ramGb}GB 이하여야 실행 가능(추정)`;
      li.append(detail);
      li.addEventListener('click', () => {
        detail.style.display = detail.style.display === 'none' ? '' : 'none';
      });
    }

    list.append(li);
  }
}

// --- 시작 ---
export async function init() {
  const ram = $('#ram-select');
  const task = $('#task-select');
  const quant = $('#quant-select');
  const vram = $('#vram-select');
  const rank = $('#rank-select');
  const gpu = $('#gpu-select');
  const arch = $('#arch-select');
  const applyBtn = $('#apply-button');
  const example = $('#example-button');

  // planModels + 렌더링. 실패 시 이전 화면 유지 + status
  const apply = async () => {
    try {
      const nowIso = new Date().toISOString(); // KST 기준 시각을 nowIso 로 전달
      const raw = window.__hfModels || [];
      const res = planModels(raw, Number(ram.value), quant.value, nowIso);
      // 작업 필터: text 는 전부(데이터가 text-generation 으로 미리 필터됨), image 는 특정 pipeline_tag
      const imageTags = ['image-text-to-text', 'text-to-image', 'image-to-image'];
      const rawTags = new Map(raw.map((r) => [r.id, r.pipeline_tag]));
      const models = res.models.filter((m) => {
        if (task.value === 'text') return true;
        return imageTags.includes(rawTags.get(m.id));
      });
      render(models, raw, {
        ramGb: Number(ram.value),
        task: task.value,
        quantBit: quant.value,
        vramGb: vram ? Number(vram.value) : null,
        rank: rank ? rank.value : 'trending',
        gpu: gpu ? gpu.value : 'none',
        arch: arch ? arch.value : 'arm',
      });
      setStatus('');
    } catch (e) {
      setStatus('모델 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
    }
  };

  ram.addEventListener('change', apply);
  task.addEventListener('change', apply);
  quant.addEventListener('change', apply);
  if (vram) vram.addEventListener('change', apply);
  if (rank) rank.addEventListener('change', apply);
  if (gpu) gpu.addEventListener('change', apply);
  if (arch) arch.addEventListener('change', apply);
  if (applyBtn) applyBtn.addEventListener('click', apply);
  if (example) {
    example.addEventListener('click', () => {
      setSelects({ ram: 16, task: 'text', quant: '8bit' });
      apply();
    });
  }

  // 데이터 로딩
  try {
    const [modelsRes, metaRes] = await Promise.all([
      fetch('data/hf_models.json'),
      fetch('data/hf_models.meta.json'),
    ]);
    if (!modelsRes.ok || !metaRes.ok) throw new Error('http');
    const models = await modelsRes.json();
    const meta = await metaRes.json();
    if (!Array.isArray(models)) throw new Error('not-array');
    window.__hfModels = models;
    window.__hfMeta = meta;
    await apply();
  } catch (e) {
    setStatus('모델 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.');
    $('#model-list').innerHTML = '';
    $('#summary').textContent = '돌릴 수 있는 모델 0개 / 불가 0개';
    $('#data-time').textContent = '';
    $('#data-terms').textContent = '';
  }
}

if (typeof document !== 'undefined') {
  init();
}
