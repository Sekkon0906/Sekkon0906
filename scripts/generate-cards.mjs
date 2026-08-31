#!/usr/bin/env node
/**
 * Builds the SVG cards used by the profile README.
 *
 * Everything the profile shows is rendered here and committed into assets/,
 * so the README depends on this repository alone — not on shared public
 * instances of github-readme-stats and friends, which rate-limit and break.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/generate-cards.mjs
 *   node scripts/generate-cards.mjs --mock    # synthetic data, for layout work
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LOGIN = process.env.PROFILE_LOGIN || 'Sekkon0906';
const OUT = 'assets';
const MOCK = process.argv.includes('--mock');

/* ── Palette ────────────────────────────────────────────────────────────
   Black, white and red, taken from the Hytrex brand. Red is an accent:
   it marks the single most important value in a card, never whole blocks. */
const C = {
  bg: '#0b0b0b',
  border: '#232323',
  text: '#ffffff',
  muted: '#8a8a8a',
  dim: '#4a4a4a',
  red: '#e10600',
  // Contribution ramp: dark -> grey -> white -> red, so every level is
  // clearly distinct against the black panel.
  ramp: ['#161616', '#4d4d4d', '#b3b3b3', '#ffffff', '#e10600'],
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

const panel = (w, h) =>
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${C.bg}" stroke="${C.border}"/>`;

const doc = (w, h, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
  .f { font-family: ${FONT}; }
  .m { font-family: ${MONO}; }
  .label { font-size: 13px; letter-spacing: 0.8px; }
  .value { font-size: 34px; font-weight: 700; }
  .head  { font-size: 14px; letter-spacing: 1.6px; fill: ${C.muted}; }
</style>
${panel(w, h)}
${body}
</svg>
`;

/* ── Data ───────────────────────────────────────────────────────────── */

const QUERY = `
query($login: String!) {
  user(login: $login) {
    login
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

async function fetchData() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required (or pass --mock)');

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-card-generator',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });

  if (!res.ok) throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
  if (!json.data?.user) throw new Error(`No such user: ${LOGIN}`);
  return json.data.user;
}

/** Deterministic synthetic data so layout can be verified without a token. */
function mockData() {
  const weeks = [];
  const start = new Date(Date.UTC(2025, 7, 31));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const r = rnd();
      days.push({
        date: date.toISOString().slice(0, 10),
        weekday: d,
        contributionCount: r > 0.82 ? Math.ceil(rnd() * 14) : r > 0.55 ? Math.ceil(rnd() * 4) : 0,
      });
    }
    weeks.push({ contributionDays: days });
  }
  const mk = (name, stars, lang, size) => ({
    name, stargazerCount: stars,
    languages: { edges: [{ size, node: { name: lang } }] },
  });
  return {
    login: LOGIN,
    followers: { totalCount: 1 },
    contributionsCollection: {
      totalCommitContributions: 412,
      totalPullRequestContributions: 23,
      totalIssueContributions: 9,
      totalPullRequestReviewContributions: 4,
      contributionCalendar: {
        totalContributions: weeks.flatMap((w) => w.contributionDays).reduce((a, d) => a + d.contributionCount, 0),
        weeks,
      },
    },
    repositories: {
      totalCount: 17,
      nodes: [
        mk('GestorEventosMarcaBlanca', 0, 'JavaScript', 900000),
        mk('wallnut', 1, 'JavaScript', 500000),
        mk('consultorioEstetico-vm', 1, 'TypeScript', 400000),
        mk('Coffee-management', 0, 'JavaScript', 300000),
        mk('Ardy-IA', 0, 'Python', 200000),
        mk('pielCanelaStore', 0, 'JavaScript', 150000),
      ],
    },
  };
}

/* ── Cards ──────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Contribution calendar.
 *
 * Levels are cut at quantiles of the *non-empty* days rather than at fixed
 * counts. With fixed cuts a profile whose busiest day is 5 commits collapses
 * into the first colour and the grid reads as a flat block — which is exactly
 * how the previous third-party widget failed.
 */
function contributionsCard(user) {
  const weeks = user.contributionsCollection.contributionCalendar.weeks;
  const total = user.contributionsCollection.contributionCalendar.totalContributions;

  const nonZero = weeks.flatMap((w) => w.contributionDays)
    .map((d) => d.contributionCount).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => (nonZero.length ? nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))] : 1);
  const [q1, q2, q3] = [q(0.25), q(0.55), q(0.85)];
  const level = (n) => (n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);

  const CELL = 11, GAP = 3, STEP = CELL + GAP;
  const X0 = 52, Y0 = 82;
  const W = X0 + weeks.length * STEP + 18;
  const H = Y0 + 7 * STEP + 52;

  // Month labels, placed at the first week that opens a new month.
  let lastMonth = -1;
  const months = weeks.map((wk, i) => {
    const d = new Date(wk.contributionDays[0].date + 'T00:00:00Z');
    const m = d.getUTCMonth();
    if (m === lastMonth || d.getUTCDate() > 7) return '';
    lastMonth = m;
    return `<text class="f" x="${X0 + i * STEP}" y="${Y0 - 12}" font-size="12" fill="${C.dim}">${MONTHS[m]}</text>`;
  }).join('');

  const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
    .map(([d, t]) => `<text class="f" x="${X0 - 10}" y="${Y0 + d * STEP + 10}" font-size="12" fill="${C.dim}" text-anchor="end">${t}</text>`)
    .join('');

  // One fade-in per week rather than per cell: 53 animations instead of 371.
  const grid = weeks.map((wk, i) => {
    const cells = wk.contributionDays.map((d) => {
      const y = Y0 + d.weekday * STEP;
      return `<rect x="${X0 + i * STEP}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${C.ramp[level(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    }).join('');
    return `<g opacity="0">${cells}<animate attributeName="opacity" from="0" to="1" begin="${(i * 0.018).toFixed(3)}s" dur="0.45s" fill="freeze"/></g>`;
  }).join('');

  const legendX = W - 18 - 5 * STEP - 116;
  const legend = `
  <text class="f" x="${legendX}" y="${H - 17}" font-size="12" fill="${C.dim}" text-anchor="end">Less / Menos</text>
  ${C.ramp.map((c, i) => `<rect x="${legendX + 8 + i * STEP}" y="${H - 27}" width="${CELL}" height="${CELL}" rx="2.5" fill="${c}"/>`).join('')}
  <text class="f" x="${legendX + 16 + 5 * STEP}" y="${H - 17}" font-size="12" fill="${C.dim}">More / Más</text>`;

  const body = `
  <text class="f head" x="24" y="34">CONTRIBUTIONS · LAST YEAR<tspan fill="${C.dim}">  /  CONTRIBUCIONES · ÚLTIMO AÑO</tspan></text>
  <text class="m" x="${W - 24}" y="36" font-size="26" font-weight="700" fill="${C.red}" text-anchor="end">${fmt(total)}</text>
  <line x1="24" y1="50" x2="${W - 24}" y2="50" stroke="${C.border}"/>
  ${months}${dayLabels}${grid}${legend}`;

  return { name: 'contributions.svg', svg: doc(W, H, `${total} contributions in the last year / contribuciones en el último año`, body) };
}

/**
 * Commit streaks.
 *
 * Computed from the same contribution calendar the grid uses, which only
 * covers the trailing year — so these are streaks within that window, and
 * the card says so rather than implying an all-time figure.
 *
 * A zero on the final day does not break the current streak: that day is
 * still in progress, so it is skipped before counting backwards. Any other
 * zero ends it.
 */
function streaks(user) {
  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let longest = 0, longestEnd = null, run = 0, runStart = null;
  let longestStart = null;
  for (const d of days) {
    if (d.contributionCount > 0) {
      if (run === 0) runStart = d.date;
      run++;
      if (run > longest) { longest = run; longestStart = runStart; longestEnd = d.date; }
    } else {
      run = 0;
    }
  }

  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--; // today may not be over
  let current = 0, currentEnd = i >= 0 ? days[i].date : null, currentStart = null;
  for (; i >= 0 && days[i].contributionCount > 0; i--) {
    current++;
    currentStart = days[i].date;
  }
  if (current === 0) { currentEnd = null; }

  const active = days.filter((d) => d.contributionCount > 0).length;
  const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);

  return { current, currentStart, currentEnd, longest, longestStart, longestEnd, active, best, total: days.length };
}

const MONTHS_SHORT = MONTHS;
const shortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const range = (a, b) => (a && b ? (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`) : '—');

function streakCard(user) {
  const s = streaks(user);
  const tiles = [
    [['Current streak', 'Racha actual'], `${s.current}`, range(s.currentStart, s.currentEnd), true],
    [['Longest streak', 'Racha más larga'], `${s.longest}`, range(s.longestStart, s.longestEnd), false],
    [['Active days', 'Días activos'], `${s.active}`, `of ${s.total} · de ${s.total}`, false],
    [['Best day', 'Mejor día'], `${s.best?.contributionCount ?? 0}`, shortDate(s.best?.date) || '—', false],
  ];

  const W = 820, H = 176;
  const colW = (W - 48) / tiles.length;

  const body = `
  <text class="f head" x="24" y="32">STREAKS · LAST YEAR<tspan fill="${C.dim}">  /  RACHAS · ÚLTIMO AÑO</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  ${tiles.map(([[en, es], value, sub, accent], i) => {
    const cx = 24 + colW * i + colW / 2;
    return `<g opacity="0">
      <text class="f value" x="${cx}" y="98" text-anchor="middle" fill="${accent ? C.red : C.text}">${esc(value)}</text>
      <text class="f label" x="${cx}" y="124" text-anchor="middle" fill="${C.muted}">${esc(en.toUpperCase())}</text>
      <text class="f label" x="${cx}" y="142" text-anchor="middle" fill="${C.dim}">${esc(es.toUpperCase())}</text>
      <text class="f" x="${cx}" y="162" text-anchor="middle" font-size="11" fill="${C.dim}">${esc(sub)}</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.08 * i).toFixed(2)}s" dur="0.5s" fill="freeze"/>
    </g>${i < tiles.length - 1 ? `<line x1="${24 + colW * (i + 1)}" y1="66" x2="${24 + colW * (i + 1)}" y2="156" stroke="${C.border}"/>` : ''}`;
  }).join('')}`;

  return { name: 'streak.svg', svg: doc(W, H, 'Commit streaks / Rachas de commits', body) };
}

/** Headline numbers. */
function statsCard(user) {
  const c = user.contributionsCollection;
  const stars = user.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const tiles = [
    [['Contributions', 'Contribuciones'], c.contributionCalendar.totalContributions, true],
    [['Commits', 'Commits'], c.totalCommitContributions, false],
    [['Pull requests', 'Pull requests'], c.totalPullRequestContributions, false],
    [['Repositories', 'Repositorios'], user.repositories.totalCount, false],
    [['Stars earned', 'Estrellas'], stars, false],
    [['Followers', 'Seguidores'], user.followers.totalCount, false],
  ];

  const W = 820, H = 170;
  const colW = (W - 48) / tiles.length;

  const body = `
  <text class="f head" x="24" y="32">OVERVIEW<tspan fill="${C.dim}">  /  RESUMEN</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  ${tiles.map(([[en, es], value, accent], i) => {
    const cx = 24 + colW * i + colW / 2;
    return `<g opacity="0">
      <text class="f value" x="${cx}" y="98" text-anchor="middle" fill="${accent ? C.red : C.text}">${fmt(value)}</text>
      <text class="f label" x="${cx}" y="124" text-anchor="middle" fill="${C.muted}">${esc(en.toUpperCase())}</text>
      <text class="f label" x="${cx}" y="144" text-anchor="middle" fill="${C.dim}">${esc(es.toUpperCase())}</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.08 * i).toFixed(2)}s" dur="0.5s" fill="freeze"/>
    </g>${i < tiles.length - 1 ? `<line x1="${24 + colW * (i + 1)}" y1="66" x2="${24 + colW * (i + 1)}" y2="150" stroke="${C.border}"/>` : ''}`;
  }).join('')}`;

  return { name: 'stats.svg', svg: doc(W, H, 'GitHub overview / Resumen de GitHub', body) };
}

/** Language split across owned, non-fork repositories. */
function languagesCard(user) {
  const totals = new Map();
  for (const repo of user.repositories.nodes) {
    for (const e of repo.languages?.edges ?? []) {
      totals.set(e.node.name, (totals.get(e.node.name) || 0) + e.size);
    }
  }
  const all = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = all.slice(0, 6);
  const sum = all.reduce((a, [, v]) => a + v, 0) || 1;

  // Red for the dominant language, then a descending grey ramp.
  const shades = [C.red, '#ffffff', '#b3b3b3', '#8a8a8a', '#5f5f5f', '#3d3d3d'];

  const W = 820, H = 168;
  const barX = 24, barW = W - 48, barY = 66, barH = 16;

  let x = barX;
  const segments = top.map(([name, size], i) => {
    const w = Math.max(2, (size / sum) * barW);
    const seg = `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${shades[i]}"><title>${esc(name)} ${((size / sum) * 100).toFixed(1)}%</title></rect>`;
    x += w;
    return seg;
  }).join('');
  const rest = x < barX + barW
    ? `<rect x="${x}" y="${barY}" width="${barX + barW - x}" height="${barH}" fill="#1e1e1e"/>` : '';

  const legend = top.map(([name, size], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const lx = barX + col * (barW / 3), ly = 112 + row * 26;
    return `<g>
      <rect x="${lx}" y="${ly - 11}" width="11" height="11" rx="2" fill="${shades[i]}"/>
      <text class="f" x="${lx + 18}" y="${ly}" font-size="14" fill="${C.text}">${esc(name)}</text>
      <text class="f" x="${lx + 18 + name.length * 8.5 + 8}" y="${ly}" font-size="13" fill="${C.dim}">${((size / sum) * 100).toFixed(1)}%</text>
    </g>`;
  }).join('');

  const body = `
  <text class="f head" x="24" y="32">LANGUAGE DISTRIBUTION<tspan fill="${C.dim}">  /  DISTRIBUCIÓN POR LENGUAJE</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  <g opacity="0">${segments}${rest}<animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/></g>
  ${legend}`;

  return { name: 'languages.svg', svg: doc(W, H, 'Language distribution / Distribución por lenguaje', body) };
}

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const user = MOCK ? mockData() : await fetchData();

  const cards = [contributionsCard(user), statsCard(user), streakCard(user), languagesCard(user)];

  await mkdir(OUT, { recursive: true });
  for (const { name, svg } of cards) {
    await writeFile(join(OUT, name), svg, 'utf8');
    console.log(`wrote ${OUT}/${name} (${svg.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
