/**
 * The Floor diorama: an isometric cutaway of ground with a reservoir cut into it.
 *
 * The water level IS the peg. At $1.00 the reservoir is brim-full and level with the plaza. As the price
 * falls the water drains, exposing strata on the cut walls and revealing the payout tier lines carved into
 * them one by one. When a tier has been held long enough to trigger, the plaza cracks and light leaks out.
 *
 * Everything is drawn with canvas 2D — no WebGL, no model files — so it loads instantly and runs on any
 * laptop a judge happens to open it on.
 */

export interface Tier {
  /** Peg price at which this tier pays, e.g. 0.97. */
  price: number;
  /** Payout as a fraction of notional, e.g. 0.03. */
  payout: number;
  /** The price has been below this line long enough to count. */
  sustained: boolean;
}

export interface SceneState {
  /** Live peg price, 1 = on peg. */
  price: number;
  tiers: Tier[];
  /** Price at or above which cover can still be bought. */
  band: number;
  /** Cover can be bought right now. */
  gateOpen: boolean;
  /** Policies standing on the plaza. */
  houses: Array<{ id: number; state: "pending" | "active" | "paid" | "void" }>;
  /** Solver towers, each with how much of its margin is committed (0..1). */
  towers: Array<{ id: string; committed: number; out: boolean }>;
  /** Timestamp (ms) of the last payout, for the gold burst. */
  paidAt: number | null;
  /** Timestamp (ms) of the last dump, for the shockwave. */
  shockAt: number | null;
  /** Timestamps (ms) of recent dumps; each one drops a block into the reservoir and splashes. */
  impacts?: number[];
}

export const emptyScene: SceneState = {
  price: 1,
  tiers: [],
  band: 0.995,
  gateOpen: true,
  houses: [],
  towers: [],
  paidAt: null,
  shockAt: null,
};

// ----------------------------------------------------------------- geometry
const N = 10; // slab is N x N tiles
const B0 = 2.7; // reservoir near corner
const B1 = 7.3; // reservoir far corner
const PLAZA_Z = 0; // top surface height
const FLOOR_Z = -3.1; // reservoir floor
/** Price that would drain the reservoir completely; below this the view bottoms out. */
const PRICE_FLOOR = 0.82;

interface View {
  tw: number; // tile half-width
  th: number; // tile half-height
  zs: number; // height unit in px
  cx: number;
  cy: number;
}

function iso(v: View, x: number, y: number, z: number): [number, number] {
  return [v.cx + (x - y) * v.tw, v.cy + (x + y) * v.th - z * v.zs];
}

function poly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, fill: string) {
  poly(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Map a peg price onto a height between the reservoir floor and the plaza brim. */
export function priceToZ(price: number): number {
  const t = clamp((price - PRICE_FLOOR) / (1 - PRICE_FLOOR), 0, 1.04);
  return lerp(FLOOR_Z, PLAZA_Z, t);
}

// ------------------------------------------------------------------- strata
/** Soil bands on the cut faces. Fixed, so the wall looks like real ground rather than a gradient. */
const STRATA: Array<{ at: number; h: number; c: string }> = [
  { at: 0.0, h: 0.34, c: "#6b5435" },
  { at: 0.34, h: 0.14, c: "#7d6440" },
  { at: 0.48, h: 0.1, c: "#57442b" },
  { at: 0.58, h: 0.2, c: "#6d5634" },
  { at: 0.78, h: 0.22, c: "#4a3a24" },
];

// -------------------------------------------------------------------- scene
export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: SceneState,
  tMs: number,
  opts: { scale?: number; yOffset?: number; xOffset?: number; dim?: number } = {},
) {
  const t = tMs / 1000;
  const scale = opts.scale ?? 1;
  // The slab spans ~19.6 base units across and ~13 tall once the cut faces and towers are counted, so size
  // from both axes and then centre on the shape's real middle rather than on the origin tile.
  const base = Math.min(w / 17, h / 13) * scale;
  const v: View = {
    tw: base * 0.98,
    th: base * 0.49,
    zs: base * 0.62,
    // offsets are fractions of the canvas, so framing holds at any size
    cx: w / 2 + w * (opts.xOffset ?? 0),
    cy: h / 2 - base * 4.9 + h * (opts.yOffset ?? 0),
  };

  const waterZ = priceToZ(s.price);
  const stress = clamp((1 - s.price) / 0.14, 0, 1); // 0 calm, 1 deep break
  const anySustained = s.tiers.some((x) => x.sustained);
  const shock = s.shockAt ? clamp(1 - (tMs - s.shockAt) / 900, 0, 1) : 0;
  const paid = s.paidAt ? clamp(1 - (tMs - s.paidAt) / 2200, 0, 1) : 0;

  ctx.save();
  // the whole slab recoils when someone dumps
  if (shock > 0) {
    const k = shock * shock;
    ctx.translate(Math.sin(tMs / 24) * 7 * k, Math.cos(tMs / 19) * 4 * k);
  }

  drawAtmosphere(ctx, w, h, v, stress, paid, t);
  drawSlab(ctx, v, stress);
  drawPlazaTop(ctx, v, s, stress, t);
  drawReservoirWalls(ctx, v, s, waterZ);
  drawWater(ctx, v, s, waterZ, t, stress);
  drawTowers(ctx, v, s, t);
  drawHouses(ctx, v, s, t, paid);
  if (anySustained) drawCracks(ctx, v, t, stress);
  drawEmbers(ctx, v, t, stress);
  for (const at of s.impacts ?? []) if (tMs - at < 2400) drawImpact(ctx, v, tMs - at, at, waterZ);
  if (paid > 0) drawPayoutBurst(ctx, v, paid);
  if (s.paidAt && tMs - s.paidAt < 4200) drawCoins(ctx, v, s, tMs - s.paidAt);

  ctx.restore();

  if (opts.dim) {
    ctx.fillStyle = `rgba(8,9,11,${opts.dim})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---------------------------------------------------------------- the slab
function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: View,
  stress: number,
  paid: number,
  t: number,
) {
  const [gx, gy] = iso(v, N / 2, N / 2, 0);
  // calm blue halo that turns to a red bruise as the peg breaks
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.72);
  const glow = 0.1 + Math.sin(t * 0.7) * 0.012;
  g.addColorStop(0, `rgba(${lerp(30, 150, stress) | 0},${lerp(110, 32, stress) | 0},${lerp(243, 40, stress) | 0},${glow + paid * 0.1})`);
  g.addColorStop(0.55, "rgba(8,9,11,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawSlab(ctx: CanvasRenderingContext2D, v: View, stress: number) {
  const D = 2.6; // how deep the slab reads below the plaza
  const bl = iso(v, 0, N, PLAZA_Z);
  const br = iso(v, N, N, PLAZA_Z);
  const bf = iso(v, N, 0, PLAZA_Z);

  // left cut face, turned away from the key light
  fillPoly(
    ctx,
    [bl, [bl[0], bl[1] + v.zs * D], [br[0], br[1] + v.zs * D], br],
    "#3a2d1b",
  );
  // right cut face, catching more light
  fillPoly(
    ctx,
    [br, [br[0], br[1] + v.zs * D], [bf[0], bf[1] + v.zs * D], bf],
    "#4d3c24",
  );
  // soil bands across both faces
  for (const band of STRATA) {
    const z0 = band.at * D;
    const z1 = (band.at + band.h) * D;
    ctx.globalAlpha = 0.72;
    fillPoly(
      ctx,
      [
        [bl[0], bl[1] + v.zs * z0],
        [br[0], br[1] + v.zs * z0],
        [br[0], br[1] + v.zs * z1],
        [bl[0], bl[1] + v.zs * z1],
      ],
      band.c,
    );
    fillPoly(
      ctx,
      [
        [br[0], br[1] + v.zs * z0],
        [bf[0], bf[1] + v.zs * z0],
        [bf[0], bf[1] + v.zs * z1],
        [br[0], br[1] + v.zs * z1],
      ],
      band.c,
    );
    ctx.globalAlpha = 1;
  }
  // a hot seam under the slab when the peg is under stress
  if (stress > 0.05) {
    ctx.globalAlpha = stress * 0.5;
    ctx.strokeStyle = "#ff4438";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bl[0], bl[1] + v.zs * D);
    ctx.lineTo(br[0], br[1] + v.zs * D);
    ctx.lineTo(bf[0], bf[1] + v.zs * D);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPlazaTop(ctx: CanvasRenderingContext2D, v: View, s: SceneState, stress: number, t: number) {
  // the plaza is the ring of ground around the reservoir, drawn as one polygon with the hole punched out
  const outer: Array<[number, number]> = [
    iso(v, 0, 0, 0),
    iso(v, N, 0, 0),
    iso(v, N, N, 0),
    iso(v, 0, N, 0),
  ];
  const inner: Array<[number, number]> = [
    iso(v, B0, B0, 0),
    iso(v, B1, B0, 0),
    iso(v, B1, B1, 0),
    iso(v, B0, B1, 0),
  ];

  // one path holding both rings, filled even-odd so the reservoir is a real hole in the ground
  const ring = new Path2D();
  ring.moveTo(outer[0]![0], outer[0]![1]);
  for (let i = 1; i < outer.length; i++) ring.lineTo(outer[i]![0], outer[i]![1]);
  ring.closePath();
  ring.moveTo(inner[0]![0], inner[0]![1]);
  for (let i = 1; i < inner.length; i++) ring.lineTo(inner[i]![0], inner[i]![1]);
  ring.closePath();

  ctx.save();
  ctx.clip(ring, "evenodd");

  const [ox, oy] = iso(v, 0, 0, 0);
  const [mx, my] = iso(v, N, N, 0);
  const g = ctx.createLinearGradient(ox, oy, mx, my);
  g.addColorStop(0, "#3f5c48");
  g.addColorStop(1, "#22362c");
  ctx.fillStyle = g;
  ctx.fill(ring, "evenodd");

  // tile grid, so the surface reads as built ground rather than a flat shape
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= N; i++) {
    const a = iso(v, i, 0, 0);
    const b = iso(v, i, N, 0);
    const c = iso(v, 0, i, 0);
    const d = iso(v, N, i, 0);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.moveTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.stroke();
  }
  ctx.restore();

  // the gate: a bright rim while cover is on sale, a dead red one once it closes
  ctx.save();
  poly(ctx, outer);
  ctx.strokeStyle = s.gateOpen
    ? `rgba(70,227,155,${0.3 + Math.sin(t * 2) * 0.08})`
    : `rgba(255,68,56,${0.4 + Math.sin(t * 5) * 0.16})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  void stress;
}

function drawReservoirWalls(ctx: CanvasRenderingContext2D, v: View, s: SceneState, waterZ: number) {
  const depth = PLAZA_Z - FLOOR_Z;
  // Looking into a pit you see its FAR walls. In this projection larger (x+y) is nearer the viewer, so the
  // far walls are the two that meet at the B0 corner; the B1 walls are behind the camera-facing lip.
  const faces: Array<{ a: [number, number]; b: [number, number]; shade: number }> = [
    { a: [B0, B0], b: [B1, B0], shade: 1 }, // far wall on the lit side
    { a: [B0, B0], b: [B0, B1], shade: 0.68 }, // far wall in shade
  ];

  // Everything inside the pit is clipped to the opening itself. Looking into a hole, the ground in front
  // hides anything that would fall below the near lip, so the opening quad is the whole visible aperture.
  ctx.save();
  poly(ctx, [
    iso(v, B0, B0, PLAZA_Z),
    iso(v, B1, B0, PLAZA_Z),
    iso(v, B1, B1, PLAZA_Z),
    iso(v, B0, B1, PLAZA_Z),
  ]);
  ctx.clip();

  const labels: Array<{ x: number; y: number; text: string; fill: string }> = [];

  for (const f of faces) {
    const top1 = iso(v, f.a[0], f.a[1], PLAZA_Z);
    const top2 = iso(v, f.b[0], f.b[1], PLAZA_Z);
    const bot1 = iso(v, f.a[0], f.a[1], FLOOR_Z);
    const bot2 = iso(v, f.b[0], f.b[1], FLOOR_Z);

    fillPoly(ctx, [top1, top2, bot2, bot1], "#42331f");
    for (const band of STRATA) {
      const z0 = PLAZA_Z - band.at * depth;
      const z1 = PLAZA_Z - (band.at + band.h) * depth;
      const p0 = iso(v, f.a[0], f.a[1], z0);
      const p1 = iso(v, f.b[0], f.b[1], z0);
      const p2 = iso(v, f.b[0], f.b[1], z1);
      const p3 = iso(v, f.a[0], f.a[1], z1);
      ctx.globalAlpha = 0.95 * f.shade;
      fillPoly(ctx, [p0, p1, p2, p3], band.c);
      ctx.globalAlpha = 1;
    }

    // tier lines carved into the wall; they light up once the water has fallen past them
    s.tiers.forEach((tier) => {
      const z = priceToZ(tier.price);
      const exposed = waterZ < z + 0.04;
      const p0 = iso(v, f.a[0], f.a[1], z);
      const p1 = iso(v, f.b[0], f.b[1], z);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineWidth = tier.sustained ? 3 : 1.6;
      ctx.strokeStyle = tier.sustained
        ? "rgba(255,68,56,0.95)"
        : exposed
          ? "rgba(255,180,84,0.8)"
          : "rgba(255,255,255,0.16)";
      ctx.setLineDash(exposed ? [] : [5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // queue the label for after the clip is released, so it can sit outside the pit
      if (f.shade === 1) {
        labels.push({
          x: p1[0] + 10,
          y: p1[1] - 1,
          text: `$${tier.price.toFixed(2)}  −${(tier.payout * 100).toFixed(0)}%`,
          fill: tier.sustained
            ? "rgba(255,68,56,0.95)"
            : exposed
              ? "rgba(255,180,84,0.9)"
              : "rgba(255,255,255,0.28)",
        });
      }
    });
  }

  // reservoir floor
  fillPoly(
    ctx,
    [
      iso(v, B0, B0, FLOOR_Z),
      iso(v, B1, B0, FLOOR_Z),
      iso(v, B1, B1, FLOOR_Z),
      iso(v, B0, B1, FLOOR_Z),
    ],
    "#2b2114",
  );

  ctx.restore();

  ctx.save();
  ctx.font = `600 ${Math.max(9, v.tw * 0.18)}px ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  for (const l of labels) {
    ctx.fillStyle = l.fill;
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.restore();
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  v: View,
  s: SceneState,
  waterZ: number,
  t: number,
  stress: number,
) {
  const wob = Math.sin(t * 1.6) * 0.012 + Math.sin(t * 4.1) * 0.005 * (1 + stress * 3);
  const z = waterZ + wob;

  const c0 = iso(v, B0, B0, z);
  const c1 = iso(v, B1, B0, z);
  const c2 = iso(v, B1, B1, z);
  const c3 = iso(v, B0, B1, z);

  // the water surface: DeepBook blue when the peg holds, draining to a sick red as it breaks
  const g = ctx.createLinearGradient(c0[0], c0[1], c2[0], c2[1]);
  const r = lerp(30, 150, stress) | 0;
  const gg = lerp(110, 45, stress) | 0;
  const b = lerp(243, 60, stress) | 0;
  g.addColorStop(0, `rgba(${r},${gg},${b},0.95)`);
  g.addColorStop(1, `rgba(${(r * 0.55) | 0},${(gg * 0.6) | 0},${(b * 0.8) | 0},0.95)`);
  poly(ctx, [c0, c1, c2, c3]);
  ctx.fillStyle = g;
  ctx.fill();

  // surface shimmer: a few drifting highlight lines
  ctx.save();
  poly(ctx, [c0, c1, c2, c3]);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const p = ((t * 0.07 + i / 7) % 1) * (B1 - B0) + B0;
    const a = iso(v, B0, p, z);
    const bb = iso(v, B1, p, z);
    ctx.globalAlpha = 0.16 + Math.sin(t * 2 + i) * 0.1;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(bb[0], bb[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // bright waterline where the surface meets the two far walls
  ctx.beginPath();
  ctx.moveTo(c3[0], c3[1]);
  ctx.lineTo(c0[0], c0[1]);
  ctx.lineTo(c1[0], c1[1]);
  ctx.strokeStyle = `rgba(255,255,255,${0.42 + Math.sin(t * 3) * 0.08})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // the band line: the height above which cover can still be bought
  const bz = priceToZ(s.band);
  const b0 = iso(v, B0, B0, bz);
  const b1 = iso(v, B1, B0, bz);
  ctx.beginPath();
  ctx.moveTo(b0[0], b0[1]);
  ctx.lineTo(b1[0], b1[1]);
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = s.gateOpen ? "rgba(70,227,155,0.55)" : "rgba(255,68,56,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

// ------------------------------------------------------------- the builders
/** Positions on the plaza ring where policy houses stand. */
const HOUSE_SPOTS: Array<[number, number]> = [
  [1.3, 1.3],
  [4.4, 1.2],
  [8.6, 1.5],
  [1.2, 4.6],
  [8.7, 5.2],
  [1.5, 8.5],
  [5.0, 8.7],
  [8.5, 8.4],
];

/** Positions where solver towers stand. */
const TOWER_SPOTS: Array<[number, number]> = [
  [0.9, 6.6],
  [6.5, 0.8],
  [9.0, 7.2],
];

function box(
  ctx: CanvasRenderingContext2D,
  v: View,
  x: number,
  y: number,
  sx: number,
  sy: number,
  z0: number,
  z1: number,
  top: string,
  left: string,
  right: string,
) {
  const a = iso(v, x, y, z1);
  const b = iso(v, x + sx, y, z1);
  const c = iso(v, x + sx, y + sy, z1);
  const d = iso(v, x, y + sy, z1);
  const bl = iso(v, x, y + sy, z0);
  const bc = iso(v, x + sx, y + sy, z0);
  const bb = iso(v, x + sx, y, z0);
  fillPoly(ctx, [d, c, bc, bl], left);
  fillPoly(ctx, [c, b, bb, bc], right);
  fillPoly(ctx, [a, b, c, d], top);
}

function drawHouses(ctx: CanvasRenderingContext2D, v: View, s: SceneState, t: number, paid: number) {
  s.houses.slice(0, HOUSE_SPOTS.length).forEach((house, i) => {
    const [x, y] = HOUSE_SPOTS[i]!;
    const lit = house.state === "active" || house.state === "paid";
    const gold = house.state === "paid";
    const h = 0.95;

    box(ctx, v, x, y, 0.95, 0.95, 0, h, "#5c6878", "#2e3742", "#434e5c");

    // roof
    const apex = iso(v, x + 0.475, y + 0.475, h + 0.62);
    const r2 = iso(v, x + 0.95, y, h);
    const r3 = iso(v, x + 0.95, y + 0.95, h);
    const r4 = iso(v, x, y + 0.95, h);
    fillPoly(ctx, [r4, r3, apex], gold ? "#b98f2c" : "#6b7788");
    fillPoly(ctx, [r3, r2, apex], gold ? "#d9a838" : "#8491a3");

    // the window: the human signal that someone is home and covered
    if (lit) {
      const flick = 0.78 + Math.sin(t * 3 + i * 2.1) * 0.12;
      const wp = iso(v, x + 0.72, y + 0.92, h * 0.5);
      const col = gold ? "255,205,110" : "255,180,84";
      const gl = ctx.createRadialGradient(wp[0], wp[1], 0, wp[0], wp[1], v.tw * 0.75);
      gl.addColorStop(0, `rgba(${col},${(gold ? 0.75 : 0.5) * flick + paid * 0.25})`);
      gl.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(wp[0], wp[1], v.tw * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${col},${flick})`;
      ctx.fillRect(wp[0] - v.tw * 0.07, wp[1] - v.tw * 0.09, v.tw * 0.14, v.tw * 0.17);
    } else if (house.state === "pending") {
      // pending: a faint, waiting glow
      const wp = iso(v, x + 0.72, y + 0.92, h * 0.5);
      ctx.fillStyle = `rgba(140,150,165,${0.3 + Math.sin(t * 2 + i) * 0.12})`;
      ctx.fillRect(wp[0] - v.tw * 0.06, wp[1] - v.tw * 0.08, v.tw * 0.12, v.tw * 0.15);
    }
  });
}

function drawTowers(ctx: CanvasRenderingContext2D, v: View, s: SceneState, t: number) {
  s.towers.slice(0, TOWER_SPOTS.length).forEach((tower, i) => {
    const [x, y] = TOWER_SPOTS[i]!;
    const H = 2.5;
    box(ctx, v, x, y, 0.8, 0.8, 0, H, "#6a7686", "#2b333d", "#3e4854");

    // margin gauge climbing the tower: how much of this solver's capital is committed
    const fillTo = clamp(tower.committed, 0, 1) * (H - 0.25);
    if (fillTo > 0.02) {
      const col = tower.out ? "#ff4438" : "#1e6ef3";
      const a = iso(v, x + 0.8, y + 0.12, 0.12);
      const b = iso(v, x + 0.8, y + 0.68, 0.12);
      const c = iso(v, x + 0.8, y + 0.68, 0.12 + fillTo);
      const d = iso(v, x + 0.8, y + 0.12, 0.12 + fillTo);
      ctx.globalAlpha = 0.9;
      fillPoly(ctx, [a, b, c, d], col);
      ctx.globalAlpha = 1;
    }

    // beacon on top: steady blue while quoting, blinking red once the solver pulls out
    const top = iso(v, x + 0.4, y + 0.4, H + 0.22);
    const on = tower.out ? Math.sin(t * 7) > 0 : true;
    if (on) {
      const col = tower.out ? "255,68,56" : "75,141,255";
      const gl = ctx.createRadialGradient(top[0], top[1], 0, top[0], top[1], v.tw * 0.6);
      gl.addColorStop(0, `rgba(${col},0.85)`);
      gl.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(top[0], top[1], v.tw * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Deterministic pseudo-random so the cracks are the same every reload. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function drawCracks(ctx: CanvasRenderingContext2D, v: View, t: number, stress: number) {
  const pulse = 0.5 + Math.sin(t * 3) * 0.25;
  ctx.save();
  ctx.lineCap = "round";
  for (let c = 0; c < 5; c++) {
    const sx = rnd(c + 1) * N;
    const sy = rnd(c + 9) * N;
    ctx.beginPath();
    let px = sx;
    let py = sy;
    const [x0, y0] = iso(v, px, py, 0);
    ctx.moveTo(x0, y0);
    for (let k = 0; k < 5; k++) {
      px += (rnd(c * 17 + k) - 0.5) * 1.5;
      py += (rnd(c * 31 + k) - 0.5) * 1.5;
      const [xx, yy] = iso(v, clamp(px, 0, N), clamp(py, 0, N), 0);
      ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = `rgba(255,68,56,${(0.35 + pulse * 0.45) * stress})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,190,150,${0.25 * pulse * stress})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();
}

function drawEmbers(ctx: CanvasRenderingContext2D, v: View, t: number, stress: number) {
  const n = 22;
  for (let i = 0; i < n; i++) {
    const sp = 0.1 + rnd(i) * 0.14;
    const life = (t * sp + rnd(i + 50)) % 1;
    const x = rnd(i + 3) * N;
    const y = rnd(i + 77) * N;
    const z = life * 3.2;
    const [px, py] = iso(v, x, y, z);
    const a = (1 - life) * 0.5;
    ctx.fillStyle = stress > 0.4 ? `rgba(255,120,80,${a})` : `rgba(255,200,130,${a * 0.7})`;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.8, v.tw * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPayoutBurst(ctx: CanvasRenderingContext2D, v: View, k: number) {
  const [cx, cy] = iso(v, N / 2, N / 2, 0.4);
  const r = (1 - k) * v.tw * 9;
  ctx.save();
  ctx.globalAlpha = k * 0.7;
  ctx.strokeStyle = "#ffcf6e";
  ctx.lineWidth = 3 * k + 0.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, v.tw * 7);
  g.addColorStop(0, `rgba(255,207,110,${k * 0.3})`);
  g.addColorStop(1, "rgba(255,207,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

// ------------------------------------------------------------------ effects
/**
 * A dump, made visible: a hot block falls out of the sky into the reservoir, hits the surface, throws up
 * droplets and sends rings across the water. Deterministic per impact, so replays look identical.
 */
function drawImpact(ctx: CanvasRenderingContext2D, v: View, ageMs: number, seed: number, waterZ: number) {
  const cx = (B0 + B1) / 2;
  const cy = (B0 + B1) / 2;
  const FALL = 380;

  if (ageMs < FALL) {
    // fall: accelerating, with a streak behind it
    const k = ageMs / FALL;
    const z = lerp(8.5, waterZ, k * k);
    const [px, py] = iso(v, cx, cy, z);
    const [tx, ty] = iso(v, cx, cy, z + 2.2);
    const g = ctx.createLinearGradient(tx, ty, px, py);
    g.addColorStop(0, "rgba(255,120,80,0)");
    g.addColorStop(1, "rgba(255,150,90,0.85)");
    ctx.save();
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(3, v.tw * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = "#ffb27a";
    ctx.shadowColor = "#ff5a3c";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(4, v.tw * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const a = (ageMs - FALL) / 1000; // seconds since the splash
  const [sx, sy] = iso(v, cx, cy, waterZ);

  // rings spreading over the surface
  ctx.save();
  for (let r = 0; r < 3; r++) {
    const ra = a - r * 0.16;
    if (ra <= 0) continue;
    const life = clamp(ra / 1.5, 0, 1);
    ctx.globalAlpha = (1 - life) * 0.7;
    ctx.strokeStyle = r === 0 ? "#ffd9c4" : "#a8c8ff";
    ctx.lineWidth = 2.4 - life * 1.6;
    ctx.beginPath();
    ctx.ellipse(sx, sy, v.tw * (0.3 + life * 2.6), v.th * (0.3 + life * 2.6), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // droplets on ballistic arcs
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const ang = rnd(seed + i * 3.1) * Math.PI * 2;
    const speed = 1.1 + rnd(seed + i * 7.7) * 2.3;
    const up = 2.2 + rnd(seed + i * 5.3) * 3.4;
    const lt = a;
    const z = up * lt - 4.8 * lt * lt;
    if (z < -0.05 && lt > 0.15) continue;
    const dx = Math.cos(ang) * speed * lt;
    const dy = Math.sin(ang) * speed * lt;
    const [px, py] = iso(v, cx + dx, cy + dy, waterZ + Math.max(0, z));
    ctx.globalAlpha = clamp(1 - lt / 1.2, 0, 1) * 0.9;
    ctx.fillStyle = i % 3 === 0 ? "#ffd2b8" : "#9cc2ff";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.4, v.tw * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Gold coins that pop out of every paid house and tumble down, for a few seconds after a payout. */
function drawCoins(ctx: CanvasRenderingContext2D, v: View, s: SceneState, ageMs: number) {
  const a = ageMs / 1000;
  ctx.save();
  s.houses.slice(0, HOUSE_SPOTS.length).forEach((house, hi) => {
    if (house.state !== "paid") return;
    const [x, y] = HOUSE_SPOTS[hi]!;
    for (let i = 0; i < 9; i++) {
      const delay = rnd(hi * 31 + i) * 0.7;
      const lt = a - delay;
      if (lt < 0 || lt > 2.2) continue;
      const ang = rnd(hi * 17 + i * 5) * Math.PI * 2;
      const sp = 0.5 + rnd(hi * 13 + i * 9) * 1.1;
      const up = 3.4 + rnd(hi * 7 + i) * 2.2;
      const z = 1.05 + up * lt - 5.2 * lt * lt;
      const [px, py] = iso(v, x + 0.47 + Math.cos(ang) * sp * lt, y + 0.47 + Math.sin(ang) * sp * lt, Math.max(0.05, z));
      const spin = Math.abs(Math.cos(lt * 9 + i)); // a coin turning edge-on and back
      ctx.globalAlpha = clamp(1 - lt / 2.2, 0, 1);
      ctx.fillStyle = "#ffcf6e";
      ctx.strokeStyle = "#a8781a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py, Math.max(2, v.tw * 0.055), Math.max(1, v.tw * 0.055 * spin), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });
  ctx.restore();
}
