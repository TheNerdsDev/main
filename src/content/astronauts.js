/*
 * The two of us as cartoon astronauts, for the About portholes: flat
 * colour, one shadow tone, a dark outline — the look of an animated
 * series' cast sheet. Drawn by hand in SVG, so the reaching arm is a real
 * jointed arm: Main.js poses it (shoulder and elbow) through a 20-shot
 * burst as you scroll.
 *
 * Both are drawn facing right in the same 400 × 400 square (the window),
 * the same height on the same baseline; Prem's is mirrored to face left,
 * towards Meet. What makes each of us us — Meet: the cap, the full beard,
 * a broader build, blue; Prem: the glasses, the big wavy hair, stubble, a
 * slimmer build, green.
 */

const OUT = '#1b1f2a';
const SUIT = '#eef1f5';
const SUIT_SH = '#c9d1dc';
const SUIT_DK = '#a3adba';
const GLOVE = '#dfe4eb';
const GLOVE_SH = '#b9c1cc';
const METAL = '#aab3bf';
const BOOT = '#3b414d';
const PANEL = '#2a2f3a';

/** The reaching arm: shoulder angle and elbow bend (degrees), at rest and
    fully out; the elbow bends a little more on the way up (Main.js). */
export const REACH = { rest: -6, out: -84, bendRest: -22, bendMid: -14 };

const PEOPLE = {
  meet: { colour: '#2F8CFF', skin: '#c68a5c', skinSh: '#a8714a', lip: '#e7b7a0', cx: 150, w: 60, belly: 8 },
  prem: { colour: '#39FF14', skin: '#c99272', skinSh: '#ab765a', lip: '#e9b9a3', cx: 156, w: 50, belly: 0 }
};

/* ---------------------------------------------------------------- body */

const torsoPath = ({ cx, w, belly }) => {
  const L = cx - w;
  const R = cx + w;
  return `M ${L + 8} 176 C ${L - 2} 190 ${L - 4} 232 ${L + 2} 264 L ${R - 2} 264 C ${R + 4 + belly} 236 ${R + 3 + belly} 196 ${R - 8} 176 C ${R - 26} 162 ${L + 26} 162 ${L + 8} 176 Z`;
};

/** The far arm, hanging behind the body, in shadow. */
const farArm = ({ cx, w, colour }) => {
  const L = cx - w;
  return `
    <g fill="${SUIT_SH}">
      <path d="M ${L + 2} 180 C ${L - 5} 206 ${L - 5} 230 ${L - 1} 246 L ${L + 22} 246 C ${L + 24} 230 ${L + 26} 206 ${L + 26} 182 Z" />
      <path d="M ${L - 1} 240 C ${L - 3} 258 ${L - 1} 276 ${L + 2} 290 L ${L + 21} 290 C ${L + 23} 276 ${L + 24} 258 ${L + 22} 240 Z" />
      <rect x="${L}" y="281" width="22" height="10" rx="3" fill="${colour}" />
      <path d="M ${L} 290 C ${L - 3} 302 ${L} 314 ${L + 11} 316 C ${L + 22} 314 ${L + 25} 302 ${L + 22} 290 Z" fill="${GLOVE_SH}" />
    </g>`;
};

const legs = ({ cx, colour }) => `
    <path d="M ${cx - 32} 258 L ${cx - 4} 258 L ${cx - 6} 356 L ${cx - 34} 356 Z" fill="${SUIT_SH}" />
    <path d="M ${cx - 4} 258 L ${cx + 30} 258 L ${cx + 30} 356 L ${cx} 356 Z" fill="${SUIT}" />
    <rect x="${cx + 1}" y="300" width="28" height="14" rx="4" fill="${SUIT_DK}" />
    <path d="M ${cx - 36} 352 h 32 v 24 c 0 7 -4 11 -11 11 h -23 c -3 0 -5 -2 -5 -5 Z" fill="${BOOT}" />
    <path d="M ${cx - 2} 352 h 34 c 11 0 19 8 19 18 v 6 c 0 6 -4 10 -10 10 h -40 c -3 0 -5 -2 -5 -5 Z" fill="${BOOT}" />
    <path d="M ${cx - 6} 380 h 56" stroke="${colour}" stroke-width="3" />`;

const torso = (id, p) => {
  const { cx, w, colour } = p;
  const L = cx - w;
  return `
    <path d="${torsoPath(p)}" fill="${SUIT}" />
    <g clip-path="url(#astro-${id}-torso)" stroke="none">
      <path d="M ${L - 8} 160 L ${cx - w * 0.28} 160 C ${cx - w * 0.38} 200 ${cx - w * 0.32} 240 ${cx - w * 0.22} 270 L ${L - 8} 270 Z" fill="${SUIT_SH}" />
    </g>
    <path d="${torsoPath(p)}" fill="none" />
    <path d="M ${cx + 2} 178 C ${cx} 208 ${cx} 230 ${cx + 2} 250" fill="none" stroke="${colour}" stroke-width="3.2" />
    <rect x="${cx + 8}" y="194" width="34" height="28" rx="5" fill="${PANEL}" stroke-width="2.5" />
    <circle cx="${cx + 16}" cy="203" r="3.4" fill="${colour}" stroke="none" />
    <circle cx="${cx + 25}" cy="203" r="3.4" fill="#ff5d5d" stroke="none" />
    <circle cx="${cx + 34}" cy="203" r="3.4" fill="#ffc04a" stroke="none" />
    <path d="M ${cx + 13} 211 h 24 M ${cx + 13} 216 h 16" stroke="#5b6372" stroke-width="2" />
    <rect x="${L + 1}" y="250" width="${w * 2 - 2}" height="13" rx="3" fill="${SUIT_DK}" />
    <rect x="${cx + 4}" y="250" width="16" height="13" rx="2" fill="${colour}" />
    <circle cx="${L + 20}" cy="194" r="9.5" fill="${colour}" stroke-width="2" />
    <circle cx="${L + 20}" cy="194" r="3.6" fill="#fff" stroke="none" />
    <path d="M ${L + 13} 197 C ${L + 17} 192 ${L + 23} 191 ${L + 27} 191" fill="none" stroke="#fff" stroke-width="1.5" />`;
};

/** The near arm, in front, jointed: Main.js turns .astro-arm about the
    shoulder and .astro-fore about the elbow (data-pivot). Drawn hanging
    straight down; the thumb is on the side that ends up on top. */
const nearArm = ({ cx, w, colour }) => {
  const px = cx + w - 10;
  const py = 188;
  const ey = py + 60;
  return `
    <g class="astro-arm" data-pivot="${px} ${py}" transform="rotate(${REACH.rest} ${px} ${py})">
      <path d="M ${px - 14} ${py} C ${px - 16} ${py + 24} ${px - 15} ${py + 46} ${px - 12} ${py + 62} L ${px + 12} ${py + 62} C ${px + 15} ${py + 46} ${px + 16} ${py + 24} ${px + 14} ${py} Z" fill="${SUIT}" />
      <path d="M ${px - 13} ${py + 4} C ${px - 15} ${py + 26} ${px - 14} ${py + 46} ${px - 11} ${py + 60} L ${px - 4} ${py + 60} C ${px - 6} ${py + 42} ${px - 6} ${py + 22} ${px - 5} ${py + 4} Z" fill="${SUIT_SH}" stroke="none" />
      <g class="astro-fore" data-pivot="${px} ${ey}" transform="rotate(${REACH.bendRest} ${px} ${ey})">
        <path d="M ${px - 12} ${ey - 2} C ${px - 13} ${ey + 16} ${px - 12} ${ey + 34} ${px - 10} ${ey + 48} L ${px + 10} ${ey + 48} C ${px + 12} ${ey + 34} ${px + 13} ${ey + 16} ${px + 12} ${ey - 2} Z" fill="${SUIT}" />
        <path d="M ${px - 11} ${ey + 2} C ${px - 12} ${ey + 18} ${px - 11} ${ey + 34} ${px - 9} ${ey + 46} L ${px - 3} ${ey + 46} C ${px - 4} ${ey + 32} ${px - 5} ${ey + 16} ${px - 4} ${ey + 2} Z" fill="${SUIT_SH}" stroke="none" />
        <rect x="${px - 12}" y="${ey + 42}" width="24" height="10" rx="3" fill="${colour}" />
        <path d="M ${px + 9} ${ey + 52} C ${px + 18} ${ey + 54} ${px + 20} ${ey + 64} ${px + 14} ${ey + 68} C ${px + 11} ${ey + 64} ${px + 10} ${ey + 58} ${px + 9} ${ey + 52} Z" fill="${GLOVE}" />
        <path d="M ${px - 11} ${ey + 50} C ${px - 14} ${ey + 62} ${px - 11} ${ey + 76} ${px} ${ey + 78} C ${px + 11} ${ey + 76} ${px + 14} ${ey + 62} ${px + 11} ${ey + 50} Z" fill="${GLOVE}" />
        <path d="M ${px - 4} ${ey + 64} v 9 M ${px + 3} ${ey + 65} v 9" stroke="${GLOVE_SH}" stroke-width="2" />
      </g>
      <ellipse cx="${px}" cy="${ey}" rx="13" ry="8" fill="${SUIT_DK}" stroke-width="2.5" />
      <circle cx="${px}" cy="${py + 2}" r="14.5" fill="${SUIT}" />
      <path d="M ${px - 12.5} ${py - 4} A 14.5 14.5 0 0 1 ${px + 12.5} ${py - 4}" fill="none" stroke="${colour}" stroke-width="3.6" />
    </g>`;
};

const neck = ({ cx, skin, skinSh, colour }) => {
  const hx = cx + 18;
  return `
    <path d="M ${hx - 10} 148 L ${hx - 9} 172 L ${hx + 16} 172 L ${hx + 18} 150 Z" fill="${skin}" />
    <path d="M ${hx - 9} 150 L ${hx - 8} 170 L ${hx} 170 L ${hx} 156 Z" fill="${skinSh}" stroke="none" />
    <ellipse cx="${hx + 4}" cy="171" rx="31" ry="9.5" fill="${METAL}" />
    <ellipse cx="${hx + 4}" cy="170" rx="26" ry="6" fill="none" stroke="${colour}" stroke-width="2.6" />`;
};

/* --------------------------------------------------------------- heads */

const eye = (x, y, rx, ry, skin) => `
    <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${OUT}" stroke="none" />
    <circle cx="${x + rx * 0.35}" cy="${y - ry * 0.35}" r="${rx * 0.36}" fill="#fff" stroke="none" />
    <ellipse class="astro-lid" cx="${x}" cy="${y}" rx="${rx + 1.4}" ry="${ry + 1.4}" fill="${skin}" stroke="none" />`;

/** Meet: black cap with a blue badge, a full short beard. */
const meetHead = ({ cx, skin, skinSh, lip, colour }) => {
  const hx = cx + 18;
  const HAIR = '#1d1714';
  const BEARD = '#2c211c';
  return `
    <path d="M ${hx - 28} 104 C ${hx - 31} 114 ${hx - 29} 124 ${hx - 24} 130 L ${hx - 19} 118 L ${hx - 19} 106 Z" fill="${HAIR}" />
    <path d="M ${hx - 24} 100 C ${hx - 30} 120 ${hx - 26} 146 ${hx - 6} 156 C ${hx + 8} 163 ${hx + 26} 158 ${hx + 34} 146 C ${hx + 40} 138 ${hx + 42} 124 ${hx + 38} 108 C ${hx + 34} 96 ${hx - 12} 92 ${hx - 24} 100 Z" fill="${skin}" />
    <path d="M ${hx - 22} 106 C ${hx - 27} 122 ${hx - 23} 144 ${hx - 8} 153 C ${hx - 12} 140 ${hx - 14} 122 ${hx - 10} 104 Z" fill="${skinSh}" stroke="none" />
    <path d="M ${hx + 40} 114 C ${hx + 49} 122 ${hx + 50} 130 ${hx + 41} 134" fill="${skin}" />
    <ellipse cx="${hx - 20}" cy="126" rx="6.5" ry="9.5" fill="${skin}" />
    <path d="M ${hx - 22} 121 C ${hx - 18} 123 ${hx - 18} 129 ${hx - 21} 131" fill="none" stroke="${skinSh}" stroke-width="2" />
    <path d="M ${hx - 24} 112 L ${hx - 17} 112 L ${hx - 15} 130 L ${hx - 23} 130 Z" fill="${BEARD}" stroke="none" />
    <path d="M ${hx - 22} 128 C ${hx - 22} 148 ${hx - 8} 162 ${hx + 8} 162 C ${hx + 24} 162 ${hx + 36} 152 ${hx + 39} 138 C ${hx + 33} 141 ${hx + 26} 143 ${hx + 19} 140 C ${hx + 11} 137 ${hx + 4} 140 ${hx - 3} 136 C ${hx - 10} 132 ${hx - 15} 128 ${hx - 22} 128 Z" fill="${BEARD}" stroke-width="2" />
    <path d="M ${hx + 18} 136 C ${hx + 25} 132 ${hx + 34} 133 ${hx + 40} 137 C ${hx + 33} 141 ${hx + 25} 141 ${hx + 18} 136 Z" fill="${BEARD}" stroke="none" />
    <path d="M ${hx + 24} 145 Q ${hx + 30} 149.5 ${hx + 36} 144" fill="none" stroke="${lip}" stroke-width="2.4" />
    ${eye(hx + 22, 120, 3.6, 4.8, skin)}
    ${eye(hx + 35, 119, 2.6, 4.2, skin)}
    <path d="M ${hx + 14} 110 Q ${hx + 22} 105 ${hx + 29} 108" fill="none" stroke-width="4" />
    <path d="M ${hx + 32} 108 Q ${hx + 37} 106 ${hx + 41} 108" fill="none" stroke-width="3.4" />
    <path d="M ${hx - 28} 106 C ${hx - 30} 84 ${hx - 10} 74 ${hx + 8} 74 C ${hx + 30} 74 ${hx + 42} 88 ${hx + 42} 104 C ${hx + 20} 100 ${hx - 6} 100 ${hx - 28} 106 Z" fill="#202329" />
    <path d="M ${hx + 6} 76 C ${hx + 4} 86 ${hx + 4} 94 ${hx + 6} 101" fill="none" stroke="#3a3f48" stroke-width="2" />
    <path d="M ${hx + 30} 101 C ${hx + 46} 98 ${hx + 60} 100 ${hx + 64} 106 C ${hx + 54} 111 ${hx + 40} 111 ${hx + 28} 108 Z" fill="#15171c" />
    <circle cx="${hx + 22}" cy="88" r="4.4" fill="${colour}" stroke-width="1.6" />
    <circle cx="${hx + 6}" cy="75" r="2.6" fill="#202329" stroke-width="1.6" />`;
};

/** Prem: big wavy hair, black glasses, stubble. */
const premHead = ({ cx, skin, skinSh, lip }) => {
  const hx = cx + 18;
  const HAIR = '#1b1616';
  const STUBBLE = '#3b2c25';
  return `
    <path d="M ${hx - 22} 98 C ${hx - 28} 120 ${hx - 24} 148 ${hx - 4} 158 C ${hx + 10} 165 ${hx + 26} 160 ${hx + 33} 148 C ${hx + 39} 138 ${hx + 41} 122 ${hx + 37} 104 C ${hx + 32} 92 ${hx - 10} 90 ${hx - 22} 98 Z" fill="${skin}" />
    <path d="M ${hx - 20} 106 C ${hx - 25} 124 ${hx - 21} 146 ${hx - 6} 155 C ${hx - 10} 140 ${hx - 12} 122 ${hx - 8} 104 Z" fill="${skinSh}" stroke="none" />
    <path d="M ${hx + 37} 113 C ${hx + 46} 121 ${hx + 47} 129 ${hx + 38} 133" fill="${skin}" />
    <ellipse cx="${hx - 19}" cy="127" rx="6.5" ry="9.5" fill="${skin}" />
    <path d="M ${hx - 21} 122 C ${hx - 17} 124 ${hx - 17} 130 ${hx - 20} 132" fill="none" stroke="${skinSh}" stroke-width="2" />
    <path d="M ${hx - 20} 129 C ${hx - 20} 147 ${hx - 6} 160 ${hx + 8} 160 C ${hx + 22} 160 ${hx + 32} 151 ${hx + 35} 140 C ${hx + 29} 142 ${hx + 22} 143 ${hx + 16} 140 C ${hx + 8} 138 ${hx + 2} 140 ${hx - 4} 136 C ${hx - 10} 132 ${hx - 15} 129 ${hx - 20} 129 Z" fill="${STUBBLE}" fill-opacity="0.5" stroke="none" />
    <path d="M ${hx + 16} 136 C ${hx + 23} 133 ${hx + 31} 134 ${hx + 36} 137 C ${hx + 30} 140 ${hx + 22} 140 ${hx + 16} 136 Z" fill="${STUBBLE}" fill-opacity="0.85" stroke="none" />
    <path d="M ${hx + 21} 145 Q ${hx + 28} 150.5 ${hx + 34} 144" fill="none" stroke="${lip}" stroke-width="2.4" />
    ${eye(hx + 20, 120, 3.4, 4.6, skin)}
    ${eye(hx + 33, 119, 2.5, 4, skin)}
    <path d="M ${hx + 12} 108 Q ${hx + 20} 104 ${hx + 28} 106" fill="none" stroke-width="3.6" />
    <path d="M ${hx + 32} 107 Q ${hx + 36} 105 ${hx + 40} 107" fill="none" stroke-width="3" />
    <g fill="rgba(210, 235, 255, 0.16)" stroke="#121212" stroke-width="2.6">
      <rect x="${hx + 10}" y="113" width="19" height="14" rx="3.5" />
      <rect x="${hx + 31}" y="113" width="10" height="13" rx="3" />
      <path d="M ${hx + 29} 118 L ${hx + 31} 118 M ${hx + 10} 118 L ${hx - 16} 121" fill="none" />
    </g>
    <path d="M ${hx + 14} 116 l 5 -2" stroke="#fff" stroke-width="1.4" stroke-opacity="0.7" />
    <path d="M ${hx - 28} 114 C ${hx - 38} 94 ${hx - 28} 70 ${hx - 8} 64 C ${hx + 4} 56 ${hx + 24} 58 ${hx + 34} 68 C ${hx + 46} 74 ${hx + 48} 92 ${hx + 40} 102 C ${hx + 34} 94 ${hx + 24} 92 ${hx + 14} 95 C ${hx + 6} 91 ${hx - 6} 93 ${hx - 12} 99 C ${hx - 18} 99 ${hx - 22} 104 ${hx - 22} 116 Z" fill="${HAIR}" />
    <path d="M ${hx + 18} 93 C ${hx + 26} 95 ${hx + 32} 99 ${hx + 33} 104 C ${hx + 27} 101 ${hx + 20} 99 ${hx + 12} 99 Z" fill="${HAIR}" />
    <path d="M ${hx - 23} 106 L ${hx - 17} 106 L ${hx - 16} 125 L ${hx - 22} 125 Z" fill="${HAIR}" stroke="none" />
    <g fill="none" stroke="#3d3535" stroke-width="2">
      <path d="M ${hx - 18} 76 q 7 -7 14 -1" />
      <path d="M ${hx + 4} 68 q 8 -5 15 1" />
      <path d="M ${hx + 22} 74 q 8 0 12 7" />
      <path d="M ${hx - 26} 92 q 2 -8 9 -11" />
    </g>`;
};

const HEADS = { meet: meetHead, prem: premHead };

/**
 * One astronaut, as inline SVG markup. Facing right; `mirror` turns it to
 * face left (Prem, in the right-hand window).
 */
export const astronaut = (id, { mirror = false, label = '' } = {}) => {
  const p = PEOPLE[id];
  const flip = mirror ? ' transform="translate(400 0) scale(-1 1)"' : '';
  return `<svg class="astro astro-${id}" viewBox="0 0 400 400" role="img" aria-label="${label}">
  <defs><clipPath id="astro-${id}-torso"><path d="${torsoPath(p)}" /></clipPath></defs>
  <g${flip} stroke="${OUT}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    ${farArm(p)}
    ${legs(p)}
    ${torso(id, p)}
    ${neck(p)}
    ${HEADS[id](p)}
    ${nearArm(p)}
  </g>
</svg>`;
};
