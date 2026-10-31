// 용량 진단 화면: 제목·막대·범주 목록·체크박스 그리기, 고른 파일 → {entries, csvText}.
import { fmt, percent } from './format.js';

const CATEGORIES = [
  ['liveVideo', '라이브포토 영상', '라이브포토 사진 뒤에 붙은 짧은 영상(예: IMG_0001.MOV)'],
  ['copy', '사본', '(1) 같은 이름의 복붙 파일(예: IMG_0003(1).HEIC)'],
  ['editedOriginal', '편집 전 원본', '편집본(IMG_E로 시작)과 짝을 이루는 원본(예: IMG_0002.HEIC)'],
  ['keep', '그대로 둘 사진', '다른 범주에 들지 않은 사진'],
];

// 막대 색 → 범주 한 줄 설명: 색 점과 라벨·용량을 함께 보여 주면 막대만 봐도 무슨 색이 뭘 뜻하는지 안다.
function renderLegend(el, result) {
  el.textContent = '';
  const total = result.totalBytes;
  for (const [key, label] of CATEGORIES) {
    const bytes = result.categories[key].bytes;
    const share = total > 0 ? Math.round((bytes / total) * 100) : 0;
    const span = document.createElement('span');
    span.className = 'lg-' + key;
    span.textContent = label + ' ' + share + '%';
    el.appendChild(span);
  }
}

// 버린 만큼의 절감량을 말로(0이면 비워 두어 빈 칸이 안 보이게).
function renderSavings(el, result) {
  const saved = result.totalBytes - result.afterBytes;
  el.textContent = saved > 0 ? '지금 고른 항목을 버리면 ' + fmt(saved) + '가 줄어요' : '';
}

// 날짜 CSV(Photos Details.csv) 유무에 따라 폴더가 어떻게 생기는지 안내.
function renderCsvHint(el, state) {
  el.textContent = state.csvText.trim() !== ''
    ? '날짜 CSV가 있어 촬영일 폴더로 정리돼요. CSV가 없거나 날짜가 없는 사진은 아래 폴더 미리보기의 "날짜 없음" 폴더에 들어요.'
    : '날짜 CSV(Photos Details.csv)가 없어 사진은 전부 "날짜 없음" 폴더로 모여요. 아이클라우드에서 내보낸 Photos Details.csv를 함께 고르면 촬영일 폴더로 나눠져요.';
}

export function renderDiagnose(screen, state, result, isSample) {
  const $ = (id) => screen.querySelector('#' + id);
  $('sample-label').textContent = isSample ? '예시 묶음' : '내 사진 묶음';
  $('headline').textContent = fmt(result.totalBytes) + ' → ' + fmt(result.afterBytes);

  const total = result.totalBytes;
  const segs = {
    'seg-liveVideo': result.categories.liveVideo.bytes,
    'seg-copy': result.categories.copy.bytes,
    'seg-editedOriginal': result.categories.editedOriginal.bytes,
    'seg-keep': result.categories.keep.bytes,
  };
  for (const [id, bytes] of Object.entries(segs)) $(id).style.width = percent(bytes, total);
  renderLegend($('bar-legend'), result);
  renderSavings($('savings'), result);
  renderCsvHint($('csv-hint'), state);

  const list = $('category-list');
  list.textContent = '';
  for (const [key, label, desc] of CATEGORIES) {
    const c = result.categories[key];
    const li = document.createElement('li');
    li.dataset.category = key;
    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = label;
    li.appendChild(name);
    const descEl = document.createElement('span');
    descEl.className = 'cat-desc';
    descEl.textContent = desc;
    li.appendChild(descEl);
    if (key !== 'keep') {
      const lab = document.createElement('label');
      lab.className = 'cat-toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'discard-toggle';
      cb.dataset.category = key;
      cb.checked = !!state.discard[key];
      lab.appendChild(cb);
      const t = document.createElement('span');
      t.textContent = '버리기';
      lab.appendChild(t);
      li.appendChild(lab);
    }
    const meta = document.createElement('span');
    meta.className = 'cat-meta';
    meta.textContent = c.count + '장 · ' + fmt(c.bytes);
    li.appendChild(meta);
    list.appendChild(li);
  }
}

// 고른 파일 목록 → {entries, csvText}. 사진 바이트는 절대 읽지 않는다.
export async function readPickedFiles(fileList) {
  const entries = [...fileList].map((f) => ({ name: f.name, size: f.size }));
  let csvText = '';
  const csvs = [...fileList].filter((f) => f.name.toLowerCase().endsWith('.csv'));
  for (let i = 0; i < csvs.length; i++) {
    const text = await csvs[i].text();
    const part = i === 0 ? text : text.replace(/^\r?\n/, ''); // 첫 파일은 통째로, 나머지는 첫 줄(헤더) 제외
    if (part === '') continue;
    csvText = csvText === '' ? part : csvText + '\n' + part;
  }
  return { entries, csvText };
}
