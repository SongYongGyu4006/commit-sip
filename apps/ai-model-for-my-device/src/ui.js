// 화면(UI) 모듈 — data/hf_models.json + data/hf_models.meta.json 을 fetch 로 읽고 planModels 로 렌더링.
import { planModels, fitByVram, rankModels } from './app.js';

const $ = (sel) => document.querySelector(sel);

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

/** ds-avatar 의 data-hue(0~7) — 이름에서 항상 같은 색 */
function hueOf(name) {
  return [...String(name)].reduce((s, c) => s + c.codePointAt(0), 0) % 8;
}

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = 'ds-badge' + (cls ? ' ' + cls : '');
  b.textContent = text;
  return b;
}

const fmtNum = (v) => Number(v || 0).toLocaleString('ko-KR');

function textNode(v) {
  const s = document.createElement('span');
  s.textContent = String(v);
  return s;
}

// --- 예시: 화면의 select 를 특정 값으로 고정 ---
export function setSelects({ ram, task, quant }) {
  if (ram) $('#ram-select').value = String(ram);
  if (task) $('#task-select').value = task;
  if (quant) $('#quant-select').value = quant;
}

function setStatus(message, ok = false) {
  const el = $('#app-status');
  el.innerHTML = '';
  if (!message) return;
  const d = document.createElement('div');
  d.className = 'status' + (ok ? ' ok' : '');
  d.textContent = message;
  el.append(d);
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

/** GPU 선택에 따른 안내(설정 카드 아래 한 줄). */
function gpuNoteText(gpu) {
  if (gpu === 'none') return 'GPU가 없으면 VRAM 기준이 없어서, 결과는 RAM 기준으로만 추정돼요.';
  if (gpu === 'apple') return 'Apple 실리콘은 통합 메모리를 쓰니, RAM과 같은 메모리를 모델에 써요.';
  return '';
}

/** 아키텍처 선택에 따른 안내(설정 카드 아래 한 줄). */
function archNoteText(arch) {
  if (arch === 'arm64') return 'ARM64(Apple 실리콘·Snapdragon)를 골라 GPU를 Apple 실리콘으로 맞췄어요.';
  return '';
}

/**
 * 결과 렌더링. models = planModels 의 반환 items(필터링된 목록), raw = 원본 행, controls = 선택값.
 * 에러 시에는 이전 화면을 유지하고 status 로만 안내.
 */
export function render(models, raw, controls) {
  const { ramGb, quantBit } = controls;
  const list = $('#model-list');
  const quantKey = quantBit === '4bit' ? 'estimated4bitGb' : 'estimated8bitGb';
  const rawById = new Map(raw.map((r) => [r.id, r]));

  // --- 답 카드: SPEC 고정 문구 한 줄 + 보조 숫자 3개 ---
  const base = models.filter((x) => x.isBaseModel);
  const n = base.filter((x) => x.runnable).length;
  const noParams = base.filter((x) => x.estimatedTotalGb === null).length;
  const ramShort = base.length - n - noParams;

  $('#summary-num').textContent = String(n);
  $('#summary-num').append(Object.assign(document.createElement('small'), { textContent: '개' }));
  $('#summary-label').textContent = `내 RAM ${ramGb}GB · ${quantBit} 기준, 내 컴퓨터에서 쓸 수 있는 AI`;
  $('#summary-text').textContent = `돌릴 수 있는 모델 ${n}개 / 불가 ${base.length - n}개`;
  $('#count-ram').textContent = `${ramShort}개`;
  $('#count-noparam').textContent = `${noParams}개`;
  $('#count-all').textContent = `${models.length}개`;

  // 띠 메타: 데이터 기준 시각 + 이용 조건(출처: Hugging Face)
  const meta = metaFrom(window.__hfMeta);
  $('#data-time').textContent = meta.fetchedAt
    ? `데이터: ${meta.fetchedAt}`
    : '데이터 불러오는 중…';
  $('#data-terms').textContent = meta.terms;

  // 화면 맨 아래 푸터
  $('#foot-note').textContent =
    [
      meta.fetchedAt ? `데이터 기준: ${meta.fetchedAt}` : '',
      'Hugging Face 공개 API · Hugging Face 이용약관',
    ].filter(Boolean).join(' · ');

  // --- 모델 목록: 처음 10개, '전체 보기'로 100개 ---
  const ranked = rankModels(models, controls.rank, controls.ramGb);
  const topDownloads = new Set(ranked.slice(0, 3).map((it) => it.id));
  const limit = showAll ? ranked.length : Math.min(10, ranked.length);
  list.innerHTML = '';
  ranked.slice(0, limit).forEach((it) => {
    const r = rawById.get(it.id);
    const li = document.createElement('li');
    li.className = 'ds-list-item model';
    li.dataset.id = it.id;

    const av = document.createElement('span');
    av.className = 'ds-avatar ds-avatar-s';
    av.dataset.hue = String(hueOf(it.id));
    av.setAttribute('aria-hidden', 'true');
    av.textContent = (it.id[0] || '?').toUpperCase();

    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('a');
    title.className = 'ds-list-title';
    title.href = 'https://huggingface.co/' + it.id;
    title.target = '_blank';
    title.rel = 'noopener';
    title.textContent = it.id + ' ↗';
    // 새 탭 링크 — 행 클릭(상세 토글)과 분리
    title.addEventListener('click', (e) => e.stopPropagation());
    main.append(title);

    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    const badges = [];
    if (!it.isBaseModel) {
      li.classList.add('disabled');
      badges.push(badge('양자화본/어댑터', 'ds-badge-warn'));
    } else if (it.runnable) {
      badges.push(badge('가능(추정)', 'ds-badge-good'));
    } else {
      li.classList.add('disabled');
      badges.push(badge('RAM 부족(추정)', 'ds-badge-bad'));
    }
    if (it.isBaseModel && it.runnable && topDownloads.has(it.id)) {
      badges.push(badge('많이 쓰는 모델', 'ds-badge-accent'));
    }
    badges.push(badge(it.parameters === null ? '파라미터 미상' : `${quantBit} 추정 ${it[quantKey]}GB`, ''));
    if (it.isNew) badges.push(badge('NEW', 'ds-badge-accent'));
    if (controls.gpu !== 'none') {
      const vram = fitByVram(it, controls.vramGb);
      if (it.parameters !== null && vram === 'vram-full') {
        badges.push(badge('내 GPU에서 빠름(추정)', 'ds-badge-good'));
      }
    }
    sub.append(
      textNode(`좋아요 ${fmtNum(it.likes)}`),
      textNode(`다운로드 ${fmtNum(it.downloads)}`),
      textNode(`출시: ${formatKstDate(r && r.createdAt) || '출시일 미상'}`),
      ...badges,
    );
    main.append(sub);

    // 오른쪽: 총 필요 메모리
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const amt = document.createElement('span');
    amt.className = 'ds-list-amount';
    amt.textContent = it.estimatedTotalGb === null
      ? '미상'
      : `${it.estimatedTotalGb}GB`;
    end.append(amt);

    li.append(av, main, end);

    // 상세 토글: SPEC — 흐리게(dimmed) li 만
    if (li.classList.contains('disabled')) {
      const detail = document.createElement('span');
      detail.className = 'model-detail';
      const weight = it.parameters === null ? null : it[quantKey];
      detail.textContent =
        `총 필요 메모리(가중치 ${quantBit} ${weight === null ? '미상' : weight}GB` +
        ` + 런타임 ${it.runtimeReservationGb}GB` +
        ` + KV ${it.kvCacheGb === null ? '미상' : it.kvCacheGb}GB)` +
        ` = ${it.estimatedTotalGb === null ? '미상' : it.estimatedTotalGb}GB` +
        ` — 내 RAM ${ramGb}GB 이하여야 실행 가능(추정)`;
      li.append(detail);
      li.addEventListener('click', () => detail.classList.toggle('show'));
    }

    list.append(li);
  });

  // '전체 100개 보기' 버튼
  const moreWrap = $('#more-wrap');
  const moreBtn = $('#more-button');
  if (ranked.length > 10) {
    moreWrap.hidden = false;
    moreBtn.textContent = moreBtn.dataset.on
      ? '10개로 줄이기'
      : `전체 ${ranked.length}개 보기`;
    moreBtn.dataset.on = showAll ? '1' : '0';
  } else {
    moreWrap.hidden = true;
  }
}

// 처음 10개만, '전체 보기' 후엔 100개
let showAll = false;

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
  const moreBtn = $('#more-button');

  // 상세 설정(GPU/VRAM/아키텍처) 변경 시 표시되는 안내
  const syncGpu = () => {
    const note = $('#gpu-note');
    const t = gpuNoteText(gpu.value);
    note.textContent = t;
    note.hidden = !t;
    vram.disabled = gpu.value === 'none';
  };
  const syncArch = () => {
    const note = $('#arch-note');
    const t = archNoteText(arch.value);
    note.textContent = t;
    note.hidden = !t;
    if (arch.value === 'arm64') {
      gpu.value = 'apple';
      syncGpu();
    }
  };

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
        rank: rank ? rank.value : 'optimized',
        gpu: gpu ? gpu.value : 'none',
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
  if (gpu) {
    gpu.addEventListener('change', () => { syncGpu(); apply(); });
    syncGpu();
  }
  if (arch) {
    arch.addEventListener('change', () => { syncArch(); apply(); });
    syncArch();
  }
  if (applyBtn) applyBtn.addEventListener('click', apply);
  if (example) {
    example.addEventListener('click', () => {
      setSelects({ ram: 16, task: 'text', quant: '8bit' });
      // 예시 상태: 상세 설정도 기본값(GPU 없음, VRAM 없음, x86_64)으로
      if (gpu) gpu.value = 'none';
      if (vram) vram.value = '0';
      if (arch) arch.value = 'x86_64';
      syncGpu();
      syncArch();
      apply();
      setStatus('예시: 16GB RAM 기준 결과입니다', true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      showAll = !showAll;
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
    $('#summary-num').textContent = '0';
    $('#summary-num').append(Object.assign(document.createElement('small'), { textContent: '개' }));
    $('#summary-text').textContent = '데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
    $('#count-ram').textContent = '—';
    $('#count-noparam').textContent = '—';
    $('#count-all').textContent = '—';
    $('#foot-note').textContent = '';
  }
}

if (typeof document !== 'undefined') {
  init();
}
