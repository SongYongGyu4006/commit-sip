// Claude Code Plugin Update Board — 순수 함수 (Node import 시 부작용 없음)
export function buildUpdateBoard(repos, nowIso) {
  if (!Array.isArray(repos)) throw new TypeError('repos must be an array');
  if (typeof nowIso !== 'string') throw new TypeError('nowIso must be a string');
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (!ISO.test(nowIso)) throw new RangeError('nowIso must match YYYY-MM-DDTHH:MM:SSZ');
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) throw new RangeError('nowIso is not a real date');

  const items = [];
  for (const row of repos) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError('each repo must be a plain object');
    }
    const { full_name, html_url, description, stargazers_count, created_at, pushed_at } = row;
    for (const f of [full_name, html_url, created_at, pushed_at]) {
      if (typeof f !== 'string') throw new TypeError('repo field must be a string');
    }
    if (typeof stargazers_count !== 'number') throw new TypeError('stargazers_count must be a number');
    if (typeof description !== 'string' && description !== null && description !== undefined) {
      throw new TypeError('description must be a string, null, or missing');
    }
    if (!full_name.trim()) throw new RangeError('full_name must not be empty');
    if (!html_url.trim()) throw new RangeError('html_url must not be empty');
    if (!Number.isInteger(stargazers_count) || stargazers_count < 0) {
      throw new RangeError('stargazers_count must be a nonnegative integer');
    }
    if (!ISO.test(created_at)) throw new RangeError('created_at must match YYYY-MM-DDTHH:MM:SSZ');
    if (!ISO.test(pushed_at)) throw new RangeError('pushed_at must match YYYY-MM-DDTHH:MM:SSZ');

    const desc = description == null ? '' : description;
    const text = (full_name + ' ' + desc).trim().toLowerCase();
    if (!text.includes('claude')) continue;
    const ageDays = Math.max(0, Math.floor((nowMs - Date.parse(created_at)) / 86400000));
    if (ageDays > 7) continue;
    const updatedDaysAgo = Math.max(0, Math.floor((nowMs - Date.parse(pushed_at)) / 86400000));
    const stars = stargazers_count;
    const starsPerDay = Math.round((stars / Math.max(ageDays, 1)) * 10) / 10;
    const recency = updatedDaysAgo <= 3;
    const status = ageDays <= 7
      ? (recency ? 'new_updated' : 'new')
      : (recency ? 'updated' : 'quiet');
    items.push({ rank: 0, fullName: full_name, url: html_url, description: desc, stars, ageDays, updatedDaysAgo, starsPerDay, recency, status, _pushed: pushed_at });
  }

  items.sort((a, b) =>
    b.stars - a.stars ||
    (a._pushed === b._pushed ? 0 : a._pushed < b._pushed ? 1 : -1) ||
    (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0)
  );
  for (const [i, it] of items.entries()) it.rank = i + 1;
  for (const it of items) delete it._pushed;
  return { total: repos.length, count: items.length, items };
}
