#!/usr/bin/env node
/**
 * Draws the Hytrex identity in pure SVG and writes the profile banner.
 *
 *   node scripts/generate-brand.mjs
 *
 * The ring mark is built procedurally: concentric arcs at jittered radii,
 * broken up with dash patterns and round caps so the edges read as brush
 * strokes rather than as clean geometry. A seeded PRNG keeps the output
 * byte-identical between runs, so re-running never churns the diff.
 *
 * Outputs assets/hytrex-mark.svg (mark alone), assets/banner.svg and
 * assets/ai-stack.svg.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { ICONS, ICON_VIEWBOX } from './ai-icons.mjs';

const OUT = 'assets';

const RED = '#e10600';
const REDS = ['#e10600', '#c60500', '#ff1a0d', '#a80400'];
const WHITES = ['#ffffff', '#f0f0f0', '#dcdcdc'];
const GREYS = ['#8c8c8c', '#6a6a6a', '#4a4a4a', '#333333', '#242424'];

/** mulberry32 — small, seedable, good enough for visual jitter. */
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Number(v.toFixed(2));

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/**
 * Arc from a0 to a1 (degrees, 0 = 3 o'clock, increasing clockwise because
 * SVG's y axis points down). Spans are clamped below a full turn: a 360°
 * arc has identical endpoints and renders as nothing.
 */
function arc(cx, cy, r, a0, a1) {
  const span = Math.min(Math.abs(a1 - a0), 358);
  const end = a0 + Math.sign(a1 - a0) * span;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, end);
  return `M ${n(x0)} ${n(y0)} A ${n(r)} ${n(r)} 0 ${span > 180 ? 1 : 0} ${end > a0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
}

/**
 * The ring.
 *
 * Angles follow the identity: the white accent sweeps the upper left, the
 * red band carries the bottom and lower left, and the loose grey filaments
 * crowd the top and right.
 */
function mark({ cx = 100, cy = 100, R = 66, seed = 20260831, animate = true } = {}) {
  const rand = rng(seed);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const between = (a, b) => a + rand() * (b - a);

  const strokes = [];
  const push = (d, stroke, width, opacity, dash, cap = 'round') =>
    strokes.push(
      `<path d="${d}" stroke="${stroke}" stroke-width="${n(width)}" stroke-opacity="${n(opacity)}" ` +
        `fill="none" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    );

  // ── Outer filaments: the spun, frayed halo around the solid ring ──
  const halo = [];
  for (let i = 0; i < 30; i++) {
    const r = R * between(1.02, 1.32);
    const a0 = between(-40, 320);
    const d = arc(cx, cy, r, a0, a0 + between(45, 210));
    const light = rand();
    const colour = light > 0.78 ? pick(WHITES) : light > 0.66 ? pick(REDS) : pick(GREYS);
    const dash = rand() > 0.3 ? `${n(between(10, 60))} ${n(between(4, 18))}` : null;
    halo.push(
      `<path d="${d}" stroke="${colour}" stroke-width="${n(between(0.6, 2.3))}" ` +
        `stroke-opacity="${n(between(0.25, 0.95))}" fill="none" stroke-linecap="round"` +
        `${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    );
  }

  // ── Mid filaments, tucked just outside the band ──
  for (let i = 0; i < 11; i++) {
    const r = R * between(0.86, 1.03);
    const a0 = between(-30, 320);
    const d = arc(cx, cy, r, a0, a0 + between(40, 170));
    const colour = rand() > 0.55 ? pick(GREYS) : rand() > 0.5 ? pick(WHITES) : pick(REDS);
    push(d, colour, between(0.7, 2.4), between(0.25, 0.8), rand() > 0.3 ? `${n(between(12, 55))} ${n(between(5, 16))}` : null);
  }

  // ── Red band: lower right, through the bottom, up the left ──
  for (let i = 0; i < 7; i++) {
    const r = R * between(0.88, 1.01);
    const a0 = between(-8, 18);
    const a1 = between(150, 196);
    const dash = rand() > 0.55 ? `${n(between(90, 220))} ${n(between(3, 9))}` : null;
    push(arc(cx, cy, r, a0, a1), pick(REDS), between(5, 11), between(0.7, 1), dash, 'butt');
  }
  // A couple of thin red strays past the band's ends.
  for (let i = 0; i < 4; i++) {
    const r = R * between(0.86, 1.08);
    const a0 = between(140, 200);
    push(arc(cx, cy, r, a0, a0 + between(15, 70)), pick(REDS), between(1.2, 4), between(0.4, 0.9));
  }

  // ── Fine streaks over the bands: this is where the texture comes from ──
  for (let i = 0; i < 14; i++) {
    const r = R * between(0.89, 1.0);
    const a0 = between(-10, 200);
    const colour = rand() > 0.4 ? pick(REDS) : '#000000';
    push(arc(cx, cy, r, a0, a0 + between(20, 90)), colour, between(0.5, 1.8),
      between(0.25, 0.7), `${n(between(8, 40))} ${n(between(4, 14))}`);
  }

  // ── White accent: upper left into the top ──
  for (let i = 0; i < 5; i++) {
    const r = R * between(0.94, 1.05);
    const a0 = between(198, 216);
    const a1 = between(288, 320);
    const dash = rand() > 0.55 ? `${n(between(60, 160))} ${n(between(3, 8))}` : null;
    push(arc(cx, cy, r, a0, a1), pick(WHITES), between(5, 11), between(0.6, 1), dash, 'butt');
  }

  // ── Dark filaments across the top right, where the identity goes quiet ──
  for (let i = 0; i < 10; i++) {
    const r = R * between(0.95, 1.24);
    const a0 = between(255, 350);
    push(arc(cx, cy, r, a0, a0 + between(30, 110)), pick(GREYS), between(0.8, 3.4), between(0.35, 0.9),
      rand() > 0.3 ? `${n(between(10, 48))} ${n(between(5, 15))}` : null);
  }

  // ── Inner fragments, hinting at the open centre ──
  for (let i = 0; i < 7; i++) {
    const r = R * between(0.76, 0.87);
    const a0 = between(-20, 330);
    const colour = rand() > 0.6 ? pick(REDS) : pick(GREYS);
    push(arc(cx, cy, r, a0, a0 + between(25, 95)), colour, between(0.7, 2.4), between(0.3, 0.8));
  }

  const spin = animate
    ? `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="140s" repeatCount="indefinite"/>`
    : '';

  return `  <g>
    <g>${spin}
      ${halo.join('\n      ')}
    </g>
    ${strokes.join('\n    ')}
  </g>`;
}

const markSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Hytrex mark">
<title>Hytrex</title>
<rect width="200" height="200" fill="#000000"/>
${mark()}
</svg>
`;

/**
 * AI and automation tooling.
 *
 * Rendered here rather than with skillicons or shields: skillicons carries
 * none of these marks, and dropping badge-style chips into the existing icon
 * rows would read as an afterthought. Marks come from simple-icons, vendored
 * in ai-icons.mjs, so the row keeps its no-runtime-dependency property.
 *
 * `icon` names a key in ICONS; a tool without one gets a red dot. simple-icons
 * has no OpenAI mark and none for OpenClaw, so Codex and OpenClaw use the dot.
 */
const AI_TOOLS = [
  { name: 'CLAUDE', icon: 'claude', note: 'Agents and assistants' },
  { name: 'CLAUDE CODE', icon: 'claudecode', note: 'Agentic development' },
  { name: 'CURSOR', icon: 'cursor', note: 'AI-assisted editor' },
  { name: 'COPILOT', icon: 'githubcopilot', note: 'In-editor completion' },
  { name: 'CODEX', icon: null, note: 'Code generation' },
  { name: 'OLLAMA', icon: 'ollama', note: 'Local models — used to build Ardy-IA' },
  { name: 'MCP', icon: 'modelcontextprotocol', note: 'Model Context Protocol servers' },
  { name: 'N8N', icon: 'n8n', note: 'Workflow automation' },
  { name: 'OBSIDIAN', icon: 'obsidian', note: 'Knowledge base' },
  { name: 'OPENCLAW', icon: null, note: 'Open-source agent' },
];

function aiStackSvg() {
  const W = 900;
  const CHIP_H = 42, GAP = 12, CHAR = 9.6, TRACK = 1.4;
  const GLYPH = 17, MARK_ZONE = 36, PAD_RIGHT = 20;
  const labelW = (label) => label.length * (CHAR + TRACK);
  const chipW = (label) => Math.round(labelW(label) + MARK_ZONE + PAD_RIGHT);

  // Greedy wrap into rows that fit the plate.
  const MAX = W - 56;
  const rows = [[]];
  for (const tool of AI_TOOLS) {
    const row = rows[rows.length - 1];
    const used = row.reduce((a, t) => a + chipW(t.name) + GAP, 0);
    if (row.length && used + chipW(tool.name) > MAX) rows.push([tool]);
    else row.push(tool);
  }

  const TOP = 78;
  const H = TOP + rows.length * (CHIP_H + GAP) + 32;

  let order = 0;
  const chips = rows.map((row, ri) => {
    const total = row.reduce((a, t) => a + chipW(t.name), 0) + GAP * (row.length - 1);
    let x = (W - total) / 2;
    const y = TOP + ri * (CHIP_H + GAP);
    return row.map((tool) => {
      const w = chipW(tool.name);
      const cx = x;
      x += w + GAP;
      const my = y + (CHIP_H - GLYPH) / 2;
      const scale = GLYPH / ICON_VIEWBOX;
      const glyph = tool.icon && ICONS[tool.icon]
        ? `<g transform="translate(${n(cx + 13)} ${n(my)}) scale(${n(scale)})"><path d="${ICONS[tool.icon]}" fill="#ffffff"/></g>`
        : `<circle cx="${n(cx + 21)}" cy="${y + CHIP_H / 2}" r="3.6" fill="${RED}"/>`;
      return `  <g opacity="0">
    <rect x="${n(cx)}" y="${y}" width="${w}" height="${CHIP_H}" rx="${CHIP_H / 2}" fill="#101010" stroke="#2b2b2b"/>
    ${glyph}
    <text class="sans chip" x="${n(cx + MARK_ZONE)}" y="${y + CHIP_H / 2 + 5}">${esc(tool.name)}</text>
    <title>${esc(tool.name)} — ${esc(tool.note)}</title>
    <animate attributeName="opacity" from="0" to="1" begin="${(0.06 * order++).toFixed(2)}s" dur="0.5s" fill="freeze"/>
  </g>`;
    }).join('\n');
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="AI and automation stack: ${esc(AI_TOOLS.map((t) => t.name).join(', '))}">
<title>AI &amp; automation / IA y automatización</title>
<style>
  .sans { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .head { font-size: 14px; letter-spacing: 1.6px; fill: #8a8a8a; }
  .chip { font-size: 14.5px; font-weight: 600; letter-spacing: 1.4px; fill: #ffffff; }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#0b0b0b" stroke="#232323"/>
<text class="sans head" x="24" y="34">TOOLS I WORK WITH<tspan fill="#4a4a4a">  /  HERRAMIENTAS CON LAS QUE ESTOY FAMILIARIZADO</tspan></text>
<rect x="24" y="48" width="${W - 48}" height="1" fill="#232323"/>
${chips}
</svg>
`;
}

const bannerSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 230" width="900" height="230" role="img" aria-label="Hytrex — Clarity. Purpose. Impact. Co-founder and CEO, Juan Felipe Medina">
<title>Hytrex · Clarity. Purpose. Impact.</title>

<defs>
  <radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0%"   stop-color="${RED}" stop-opacity="0.13"/>
    <stop offset="55%"  stop-color="${RED}" stop-opacity="0.035"/>
    <stop offset="100%" stop-color="${RED}" stop-opacity="0"/>
  </radialGradient>

  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="50%"  stop-color="#ffffff" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${RED}" stop-opacity="0"/>
    <stop offset="50%"  stop-color="${RED}" stop-opacity="1"/>
    <stop offset="100%" stop-color="${RED}" stop-opacity="0"/>
  </linearGradient>

  <clipPath id="plate"><rect x="0" y="0" width="900" height="230" rx="14"/></clipPath>
</defs>

<style>
  .sans { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .mark-type { font-size: 60px; font-weight: 600; letter-spacing: 16px; fill: #ffffff; }
  .tagline   { font-size: 16px; font-weight: 500; letter-spacing: 7px; fill: #d8d8d8; }
  .kicker    { font-size: 12.5px; font-weight: 500; letter-spacing: 4.2px; fill: #8a8a8a; }
  .dot       { fill: ${RED}; }
</style>

<g clip-path="url(#plate)">
  <rect width="900" height="230" fill="#000000"/>
  <!-- Bloom sits behind the mark so the ring reads as the light source -->
  <ellipse cx="196" cy="115" rx="215" ry="160" fill="url(#bloom)"/>

  <rect x="-420" y="0" width="420" height="230" fill="url(#sheen)">
    <animate attributeName="x" values="-420;900" dur="11s" repeatCount="indefinite"/>
  </rect>

${mark({ cx: 196, cy: 115, R: 72 })}

  <text class="sans mark-type" x="576" y="106" text-anchor="middle">HYTRE<tspan fill="${RED}">X</tspan></text>

  <rect x="404" y="130" width="336" height="2.5" fill="url(#rule)"/>

  <text class="sans tagline" x="572" y="164" text-anchor="middle">CLARITY<tspan class="dot">.</tspan> PURPOSE<tspan class="dot">.</tspan> IMPACT<tspan class="dot">.</tspan></text>

  <text class="sans kicker" x="570" y="193" text-anchor="middle">CO-FOUNDER &amp; CEO &#183; JUAN FELIPE MEDINA</text>
</g>

<rect x="0.5" y="0.5" width="899" height="229" rx="14" fill="none" stroke="#242424"/>
</svg>
`;

await mkdir(OUT, { recursive: true });
for (const [name, svg] of [['hytrex-mark.svg', markSvg()], ['banner.svg', bannerSvg()], ['ai-stack.svg', aiStackSvg()]]) {
  await writeFile(join(OUT, name), svg, 'utf8');
  console.log(`wrote ${OUT}/${name} (${svg.length} bytes)`);
}
