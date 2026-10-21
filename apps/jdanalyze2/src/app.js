// 교육 채용 공고 분석기 — 순수 분석 함수 (Node/브라우저 어디서든 import 가능, 부작용 없음)

// 필수 키워드 (문구에 대소문자 구분 없이 부분 문자열로 감지)
const MUST_MARKERS = ['요망', '필수', '만족', 'must'];
// 선호 키워드
const PREFERRED_MARKERS = ['선호', '우대'];
const LOWERED_MARKERS = new Set([...MUST_MARKERS, ...PREFERRED_MARKERS].map((m) => m.toLowerCase()));

// 한 토큰을 소문자로: ASCII 대문자(A-Z)만 a-z로, 그 외 문자(한글·한자·숫자 등)는 그대로
function lowercaseAscii(token) {
  let out = '';
  for (const ch of token) {
    const code = ch.codePointAt(0);
    out += code >= 0x41 && code <= 0x5a ? String.fromCodePoint(code + 32) : ch;
  }
  return out;
}

// 공백/문자점이 아닌 최대 연속 문자를 하나씩 찾음 (한글·한자·숫자도 모두 한 토큰)
const TOKEN_RE = /[^\s\p{P}]+/gu;

// 모든 occurrences 개수를 세어 { name: { must, preferred } } 집계
function countTokens(text, isMustJob) {
  const buckets = new Map();
  let total = 0;
  const matches = text.match(TOKEN_RE);
  if (matches) {
    for (const token of matches) {
      const name = lowercaseAscii(token);
      if (name === '') continue;
      if (LOWERED_MARKERS.has(name)) continue; // 마커 자체는 스킬로 집계하지 않음
      let entry = buckets.get(name);
      if (!entry) { entry = { must: 0, preferred: 0 }; buckets.set(name, entry); }
      if (isMustJob) entry.must += 1; else entry.preferred += 1;
      total += 1;
    }
  }
  return { buckets, total };
}

/**
 * 교육 분야 채용 공고 목록을 분석해 요구 역량의 빈도(필수/선호)를 집계한다.
 *
 * @param {Array<{title: string, text: string}>} jobs
 * @returns {{count: number, totalSkillMentions: number, skills: Array<{name: string, count: number, must: number, preferred: number}>}}
 * @throws {TypeError}  jobs가 배열이 아니면, 또는 어떤 공고의 title/text가 문자열이 아니면
 * @throws {RangeError} 어떤 공고의 title이 공백(trim) 이후 비어 있으면
 */
export function analyzeJobDescriptions(jobs) {
  if (!Array.isArray(jobs)) throw new TypeError('jobs is not an array');

  const buckets = new Map();
  let totalSkillMentions = 0;

  for (const job of jobs) {
    if (job === null || typeof job !== 'object') throw new TypeError('each job must be an object with string title and text');
    if (typeof job.title !== 'string') throw new TypeError('job.title must be a string');
    if (typeof job.text !== 'string') throw new TypeError('job.text must be a string');
    if (job.title.trim() === '') throw new RangeError('job.title must not be blank');

    const lower = job.text.toLowerCase();
    const isMustJob = MUST_MARKERS.some((marker) => lower.includes(marker));
    const { buckets: jobBuckets, total } = countTokens(job.text, isMustJob);
    totalSkillMentions += total;
    for (const [name, entry] of jobBuckets) {
      let agg = buckets.get(name);
      if (!agg) { agg = { must: 0, preferred: 0 }; buckets.set(name, agg); }
      agg.must += entry.must;
      agg.preferred += entry.preferred;
    }
  }

  const skills = [...buckets.entries()]
    .map(([name, { must, preferred }]) => ({ name, count: must + preferred, must, preferred }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en-US'));

  return { count: jobs.length, totalSkillMentions, skills };
}
