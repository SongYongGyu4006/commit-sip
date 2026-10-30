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

/** 1048576 → '1MB' / 1572864 → '1.5MB' — 모델 파일 크기 표시용 */
function fmtMb(mb) {
  const r = Math.round(mb * 10) / 10;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)}MB`;
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

/** GPU 선택에 따른 안내(상세 설정 아래 한 줄). */
function gpuNoteText(gpu) {
  if (gpu === 'none') return 'GPU가 없으면 VRAM 기준이 없어서, 결과는 RAM 기준으로만 추정돼요.';
  if (gpu === 'apple') return 'Apple 실리콘은 통합 메모리를 쓰니, RAM과 같은 메모리를 모델에 써요.';
  return '';
}

function textNode(v) {
  const s = document.createElement('span');
  s.textContent = String(v);
  return s;
}

/**
 * 결과 렌더링. models = planModels 의 반환 items(과거된 목록), raw = 원본 행, controls = 선택값.
 * 에러 시에는 이전 화면을 유지하고 status 로만 안내.
 */
export function render(models, raw, controls) {
  const { ramGb, quantBit } = controls;
  const list = $('#model-list');
  const quantKey = quantBit === '4bit' ? 'estimated4bitGb' : 'estimated8bitGb';
  const rawById = new Map(raw.map((r) => [r.id, r]));

  // --- 답 카드: SPEC 고정 문구 한 줄 + 불가 원인 한 줄 + 보조 숫자 3개 ---
  const base = models.filter((x) => x.isBaseModel);
  const n = base.filter((x) => x.runnable).length;
  const m = base.filter((x) => !x.runnable).length;
  const noParams = base.filter((x) => x.estimatedTotalGb === null).length;
  const ramShort = m - noParams;

  $('#summary-num').textContent = String(n);
  $('#summary-num').append(Object.assign(document.createElement('small'), { textContent: '개' }));
  $('#summary-label').textContent = `내 RAM ${ramGb}GB · ${quantBit} 기준, 내 컴퓨터에서 쓸 수 있는 AI`;
  $('#summary-text').textContent = n > 0
    ? `인기 있는 무료 AI ${models.length}개 중, 내 RAM ${ramGb}GB에서 직접 설치해 쓸 수 있는 것이 ${n}개예요.`
    : `내 RAM ${ramGb}GB에서는 쓸 수 있는 AI가 없습니다. 4bit로 압축하거나 더 큰 RAM을 선택해 보세요.`;
  $('#count-ram').textContent = `${ramShort}개`;
  $('#count-noparam').textContent = `${noParams}개`;
  $('#count-all').textContent = `${models.length}개`;

  // 화면 맨 아래 푸터: 데이터 기준 시각 + 이용 조건(출처: Hugging Face)
  const meta = metaFrom(window.__hfMeta);
  $('#foot-note').textContent =
    [
      meta.fetchedAt ? `데이터 기준: ${meta.fetchedAt}` : '',
      'Hugging Face 공개 API · Hugging Face 이용약관',
    ].filter(Boolean).join(' · ');

  // --- 예시 결과: 쓸 수 있는 AI 상위 3(숫자 바로 아래) ---
  const topCard = $('#top-card');
  topCard.innerHTML = '';
  const tl = $('#top-label');
  if (tl) tl.textContent = `내 RAM ${ramGb}GB 기준, 쓸 수 있는 AI 상위 3`;
  const runnable = models.filter((x) => x.runnable);
  if (runnable.length === 0) {
    topCard.append(Object.assign(document.createElement('p'), {
      className: 'ds-hint',
      textContent: `내 RAM ${ramGb}GB에서는 쓸 수 있는 AI가 없습니다. 4bit나 더 큰 RAM을 선택해 보세요.`,
    }));
  } else {
    const top = rankModels(runnable, 'trending').slice(0, 3);
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
      tsub.textContent = `내 ${ramGb}GB에서 쓸 수 있음 · 크기 ${fmtMb(it[quantKey])}`;
      c.append(tid, tsub);
      row.append(c);
    }
    topCard.append(row);
  }

  // --- 모델 목록 ---
  const ranked = rankModels(models, controls.rank, controls.ramGb);
  list.innerHTML = '';
  for (const it of ranked) {
    const raw = rawById.get(it.id);
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
    // 휴대폰에선 이름과 출시일을 한 줄에(긴 이름은 잘림), 나머지는 배지 줄
    const titleRow = document.createElement('div');
    titleRow.className = 'ds-list-title-row';
    const title = document.createElement('a');
    title.className = 'ds-list-title';
    title.href = 'https://huggingface.co/' + it.id;
    title.target = '_blank';
    title.rel = 'noopener';
    title.textContent = it.id;
    // 새 탭 링크 — 행 클릭(상세 토글)과 분리
    title.addEventListener('click', (e) => e.stopPropagation());
    const release = textNode(`출시: ${formatKstDate(raw && raw.createdAt) || '출시일 미상'}`);
    release.className = 'ds-list-release';
    titleRow.append(title);

    // 배지 순서: [가능(추정)/RAM 부족(추정)] → 양자화 GB → NEW → VRAM
    const badges = [];
    if (!it.isBaseModel) {
      li.classList.add('disabled');
      badges.push(badge('양자화본/어댑터', 'ds-badge-warn'));
    } else if (it.runnable) {
      badges.push(badge('내 컴퓨터에서 쓸 수 있음', 'ds-badge-good'));
    } else {
      li.classList.add('disabled');
      badges.push(badge('내 컴퓨터엔 무거움', 'ds-badge-bad'));
    }
    badges.push(badge(it.parameters === null ? '크기 정보 없음' : `${quantBit}bit ${it[quantKey]}GB`, ''));
    if (it.isNew) badges.push(badge('NEW', 'ds-badge-accent'));
    if (controls.gpu !== 'none') {
      const vram = fitByVram(it, controls.vramGb);
      if (it.parameters !== null) {
        if (vram === 'vram-full') badges.push(badge('VRAM 전량 적재(추정)', 'ds-badge-warn'));
        else if (vram === 'offload') badges.push(badge('RAM 오프로딩 필요(추정)', 'ds-badge-warn'));
      } else if (vram === 'unknown') {
        badges.push(badge('VRAM 미상(추정)', ''));
      }
    }

    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.append(
      textNode(`좋아요 ${fmtNum(it.likes)}`),
      textNode(`다운로드 ${fmtNum(it.downloads)}`),
      release,
      ...badges,
    );
    main.append(titleRow, sub);

    // 오른쪽: 총 필요 메모리(한 줄) + likes/downloads
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const amt = document.createElement('span');
    amt.className = 'ds-list-amount';
    amt.textContent = it.estimatedTotalGb === null
      ? '총 필요 메모리 미상'
      : `총 필요 메모리 ${it.estimatedTotalGb}GB`;
    end.append(amt);

    li.append(av, main, end);

    // 상세 토글: SPEC — dimmed(흐리게) li 만
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
  const applyBtn = $('#apply-button');
  const example = $('#example-button');

  // 상세 설정(GPU/VRAM) 변경 시 표시되는 안내
  const syncGpu = () => {
    const note = $('#gpu-note');
    const t = gpuNoteText(gpu.value);
    note.textContent = t;
    note.hidden = !t;
    vram.disabled = gpu.value === 'none';
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
        rank: rank ? rank.value : 'trending',
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
  if (applyBtn) applyBtn.addEventListener('click', apply);
  if (example) {
    example.addEventListener('click', () => {
      setSelects({ ram: 16, task: 'text', quant: '8bit' });
      // 예시 상태: 상세 설정도 기본값(GPU 없음, VRAM 없음)으로
      if (gpu) gpu.value = 'none';
      if (vram) vram.value = '0';
      syncGpu();
      apply();
      setStatus('예시: 16GB RAM 기준 결과입니다', true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
