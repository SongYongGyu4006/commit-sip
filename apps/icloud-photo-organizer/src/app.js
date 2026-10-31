// 순수 함수: 아이클라우드 내보내기 묶음을 진단한다. 화면·저장소·전역에 부작용 없음.
const STILL_EXT = new Set(['heic', 'heif', 'jpg', 'jpeg', 'png']);
const VIDEO_EXT = new Set(['mov', 'mp4']);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const COPY_RE = /^(.+?) ?\(\d+\)$/;
const IMG_DIGITS_RE = /^IMG_(\d+)$/i;
const DATE_RE = /\b([A-Za-z]{3}) (\d{1,2}),(\d{4})\b/;

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// 이름에서 확장자·스템을 뺀다. 마지막 '.' 기준으로, 확장자는 소문자, 스템은 원문 그대로.
function splitName(name) {
  const i = name.lastIndexOf('.');
  if (i === -1 || i === 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() };
}

// 표준 CSV: 이중 인용 필드, "" 도피. 필드 내 줄바꿈은 없는 전제.
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Gregorian: 각 월의 말일(2월은 윤년 29, 평년 28).
function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// originalCreationDate 셀에서 첫 날짜를 찾아 유효하면 폴더 문자열, 아니면 null.
function resolveFolder(text) {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month === -1) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (day < 1 || day > daysInMonth(year, month + 1)) return null;
  return String(year).padStart(4, '0') + '/' + String(year).padStart(4, '0') + '-' + String(month + 1).padStart(2, '0');
}

export function diagnoseIcloudExport(entries, csvText, discard) {
  // TypeError (가장 먼저 검사)
  if (!Array.isArray(entries)) throw new TypeError('entries is not an array');
  for (const e of entries) {
    if (!isPlainObject(e) || typeof e.name !== 'string' || typeof e.size !== 'number') {
      throw new TypeError('entry must be a plain object with string name and number size');
    }
  }
  if (typeof csvText !== 'string') throw new TypeError('csvText is not a string');
  if (!isPlainObject(discard) ||
    typeof discard.liveVideo !== 'boolean' ||
    typeof discard.copy !== 'boolean' ||
    typeof discard.editedOriginal !== 'boolean') {
    throw new TypeError('discard must be a plain object with boolean liveVideo, copy, editedOriginal');
  }

  // RangeError
  const seen = new Set();
  for (const e of entries) {
    if (e.name.trim() === '') throw new RangeError('file name is blank');
    if (typeof e.size !== 'number' || Number.isNaN(e.size) || e.size < 0 || !Number.isInteger(e.size) || !Number.isSafeInteger(e.size)) {
      throw new RangeError('size must be a nonnegative safe integer in bytes');
    }
    const key = e.name.toLowerCase();
    if (seen.has(key)) throw new RangeError('duplicate file name: ' + e.name);
    seen.add(key);
  }
  if (csvText.trim() !== '') {
    const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) throw new RangeError('CSV header is missing');
    const header = parseCsvLine(lines[0]).map((s) => s.trim());
    if (!header.includes('imgName') || !header.includes('originalCreationDate')) {
      throw new RangeError('CSV header must contain imgName and originalCreationDate');
    }
  }

  // 파일 분류
  const media = [];
  let ignoredCount = 0;
  for (const e of entries) {
    const { stem, ext } = splitName(e.name);
    if (STILL_EXT.has(ext) || VIDEO_EXT.has(ext)) media.push({ ...e, stem, ext });
    else ignoredCount++;
  }

  // 참조 집합: 확장자별 스템(대소문자 무시)
  const stemsByExt = new Map(); // ext -> Set(stemLC)
  for (const f of media) {
    let s = stemsByExt.get(f.ext);
    if (!s) { s = new Set(); stemsByExt.set(f.ext, s); }
    s.add(f.stem.toLowerCase());
  }
  const hasStillStem = (lc) => {
    for (const ext of ['heic', 'heif', 'jpg', 'jpeg', 'png']) {
      const s = stemsByExt.get(ext);
      if (s && s.has(lc)) return true;
    }
    return false;
  };

  const isStill = (f) => STILL_EXT.has(f.ext);
  const isEditedSibling = (f) => {
    const m = IMG_DIGITS_RE.exec(f.stem);
    if (!m) return false;
    const digits = m[1];
    for (const g of media) {
      if (!isStill(g) || g === f) continue;
      const gc = g.stem.toLowerCase();
      if (gc.startsWith('img_e' + digits)) return true;
    }
    return false;
  };

  const categories = { liveVideo: { count: 0, bytes: 0 }, copy: { count: 0, bytes: 0 }, editedOriginal: { count: 0, bytes: 0 }, keep: { count: 0, bytes: 0 } };
  let fileCount = 0, totalBytes = 0;

  // CSV: imgName(대소문자 무시) -> 폴더 문자열 (첫 행이 이김)
  const csvFolders = new Map();
  if (csvText.trim() !== '') {
    const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const header = parseCsvLine(lines[0]).map((s) => s.trim());
    const iName = header.indexOf('imgName');
    const iDate = header.indexOf('originalCreationDate');
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < header.length) continue; // 필드가 적은 행은 건너뜀
      const imgName = row[iName];
      if (imgName === '') continue;
      const key = imgName.toLowerCase();
      if (csvFolders.has(key)) continue; // 첫 행이 이김
      csvFolders.set(key, resolveFolder(row[iDate]));
    }
  }

  // 각 파일의 폴더: CSV에 없거나 날짜 무효면 'unknown-date', 사본/라이브영상은 쌍의 폴더를 상속.
  const folders = new Map();
  for (const f of media) {
    folders.set(f.name, csvFolders.get(f.name.toLowerCase()));
  }
  for (const f of media) {
    const m = COPY_RE.exec(f.stem);
    if (m) {
      const orig = media.find((g) => g !== f && g.ext === f.ext && g.stem.toLowerCase() === m[1].toLowerCase());
      if (orig) folders.set(f.name, folders.get(orig.name));
    } else if (f.ext === 'mov') {
      const still = media.find((g) => isStill(g) && g.stem.toLowerCase() === f.stem.toLowerCase());
      if (still) folders.set(f.name, folders.get(still.name));
    }
    if (folders.get(f.name) == null) folders.set(f.name, 'unknown-date');
  }

  // 범주 확정 (순서: copy → editedOriginal → liveVideo → keep)
  for (const f of media) {
    let cat = 'keep';
    const m = COPY_RE.exec(f.stem);
    if (m && media.some((g) => g !== f && g.ext === f.ext && g.stem.toLowerCase() === m[1].toLowerCase())) {
      cat = 'copy';
    } else if (isStill(f) && IMG_DIGITS_RE.test(f.stem) && isEditedSibling(f)) {
      cat = 'editedOriginal';
    } else if (f.ext === 'mov' && hasStillStem(f.stem.toLowerCase())) {
      cat = 'liveVideo';
    }
    f.category = cat;
    f.folder = folders.get(f.name);
    categories[cat].count++;
    categories[cat].bytes += f.size;
    fileCount++;
    totalBytes += f.size;
  }

  // 트리: 버릴 범주를 뺀 파일 (keep은 절대 안 줍)
  let afterBytes = 0, datedCount = 0, undatedCount = 0;
  const buckets = new Map();
  for (const f of media) {
    if (f.category !== 'keep' && discard[f.category]) continue; // keep은 절대 안 줍
    afterBytes += f.size;
    if (f.folder === 'unknown-date') undatedCount++;
    else datedCount++;
    let b = buckets.get(f.folder);
    if (!b) { b = { folder: f.folder, count: 0, bytes: 0 }; buckets.set(f.folder, b); }
    b.count++;
    b.bytes += f.size;
  }
  const tree = [...buckets.values()].sort((a, b) =>
    a.folder === 'unknown-date' ? 1 : b.folder === 'unknown-date' ? -1 : a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0);

  return {
    fileCount,
    totalBytes,
    categories: {
      liveVideo: { ...categories.liveVideo },
      copy: { ...categories.copy },
      editedOriginal: { ...categories.editedOriginal },
      keep: { ...categories.keep },
    },
    ignoredCount,
    afterBytes,
    datedCount,
    undatedCount,
    tree,
  };
}
