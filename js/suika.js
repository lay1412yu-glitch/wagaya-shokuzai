// suika.js — やさいあわせゲーム（スイカゲームの野菜版）Web配布版
//
// Muse内蔵版（SuikaGame.tsx）の移植:
// - 上から野菜キャラを落とし、同じ野菜同士がくっつくと1段階進化
// - 進化順: プチトマト→にんじん→なす→ピーマン→玉ねぎ→じゃがいも
//   →かぼちゃ→大根→キャベツ→白菜→やさいバスケット（最終段階）
// - 物理演算は自前。衝突判定は円ではなく「野菜の輪郭ポリゴン」ベース:
//   キャラ画像のアルファチャンネルから輪郭ポリゴンを抽出し（読込時）、
//   その凸包同士を SAT で判定して押し戻す。ピースは回転しない（直立）。
//   合体判定も輪郭同士の距離ベース（輪郭が触れていれば合体）。
//   画像が読めない/抽出できない段階は従来どおり円相当の正多角形で代用。
// - キャラ画像はミュゼ版の食材キャラ画像（js/chars.js）を使う。全11段階が
//   専用キャラに解決される（Web版SVGイラストは使わない）
// - 既存データ（ストア・Firestore・在庫）には一切触らない。
//   ベストスコアだけ端末の localStorage（専用キー）に保存する

import { charUrlForSuikaStage } from "./chars.js";

export const VEG_STAGES = [
  { name: "プチトマト", radius: 17, score: 1, tint: "#f6dfc9" },
  { name: "にんじん", radius: 23, score: 3, tint: "#fbe3cd" },
  { name: "なす", radius: 29, score: 6, tint: "#e7dff2" },
  { name: "ピーマン", radius: 36, score: 10, tint: "#e2edd4" },
  { name: "玉ねぎ", radius: 43, score: 15, tint: "#f7ecd9" },
  { name: "じゃがいも", radius: 51, score: 21, tint: "#f7eccf" },
  { name: "かぼちゃ", radius: 60, score: 28, tint: "#fbe3cd" },
  { name: "大根", radius: 70, score: 36, tint: "#f1eee2" },
  { name: "キャベツ", radius: 81, score: 45, tint: "#e2edd4" },
  { name: "白菜", radius: 93, score: 55, tint: "#e9eec9" },
  { name: "やさいバスケット", radius: 106, score: 66, tint: "#f6dfc9" },
];

export const SUIKA_W = 360;
export const SUIKA_H = 520;
export const SUIKA_DEADLINE_Y = 118;
export const SUIKA_BEST_KEY = "wagaya.suika.best";

const DROP_Y = 56;
const DROP_POOL = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4];
const MERGE_TOLERANCE = 1.04; // 接触判定の遊び（半径合計に対する倍率）
const MERGE_MIN_AGE = 90; // 生まれてすぐは合体しない (ms)
const SPRITE_SCALE = 1.18; // 描画サイズ = 半径×2×この倍率（従来どおり）

export function randomDropStage() {
  return DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)] ?? 0;
}
export function stageOf(s) {
  return VEG_STAGES[s] ?? VEG_STAGES[0];
}

/* ==================================================================
 * 輪郭ポリゴンの幾何（純粋関数群。テストから直接検証できる）
 * ポリゴンは [x, y] の配列。オフセット形式（中心相対）と
 * 中心座標を分けて渡すことで、毎フレームの配列確保を避ける。
 * ================================================================== */

/** ポリゴンの符号付き面積（shoelace） */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** 正多角形のオフセット列（フォールバック形状用） */
export function regularPolygonOffsets(count, radius) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(ang) * radius, Math.sin(ang) * radius]);
  }
  return pts;
}

/** 凸包（monotone chain）。共線点は落とす。 */
export function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const sorted = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * アルファチャンネルから輪郭ポリゴンを抽出する（純粋関数）。
 * alpha: 幅 w・高さ h のアルファ値配列（0-255、行優先）。
 * 不透明ピクセルの重心から放射状に走査し、各方向で最も遠い
 * 不透明点をつないで星型ポリゴンを作り、間引いて単純化する。
 * 返り値: { pts, area, bound } — pts はスプライト中心相対・
 * 半辺=1 に正規化した座標（描画スプライトの正方形に一致）。
 * 抽出できない場合は null。
 */
export function extractSilhouettePolygon(alpha, w, h, opts = {}) {
  const threshold = opts.threshold ?? 110;
  const rays = opts.rays ?? 96;
  const targetVerts = opts.targetVerts ?? 24;
  if (!alpha || alpha.length < w * h || w < 8 || h < 8) return null;
  let count = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] >= threshold) { count++; sx += x; sy += y; }
    }
  }
  if (count < 40) return null;
  const cx = sx / count, cy = sy / count;
  const maxR = Math.hypot(w, h) / 2 + 2;
  const raw = [];
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let last = -1, gap = 0;
    for (let r = 0; r <= maxR; r += 1) {
      const px = Math.round(cx + dx * r), py = Math.round(cy + dy * r);
      const hit = px >= 0 && py >= 0 && px < w && py < h && alpha[py * w + px] >= threshold;
      if (hit) { last = r; gap = 0; }
      else if (last >= 0 && ++gap > 5) break;
    }
    if (last < 2) return null; // 重心から届かない方向がある=抽出失敗
    raw.push([cx + dx * last, cy + dy * last]);
  }
  // 階段状のノイズを1回だけ平滑化
  const sm = raw.map((p, i) => {
    const a = raw[(i - 1 + rays) % rays], b = raw[(i + 1) % rays];
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
  // 目標頂点数へ間引き
  let pts = [];
  const stride = rays / targetVerts;
  for (let i = 0; i < targetVerts; i++) pts.push(sm[Math.floor(i * stride)]);
  // ほぼ共線な点を落とす（ただし10点未満にはしない）
  pts = simplifyPolygon(pts, 0.5);
  if (pts.length < 8) return null;
  // スプライト中心相対・半辺=1へ正規化
  const norm = pts.map(([px, py]) => [(px - w / 2) / (w / 2), (py - h / 2) / (h / 2)]);
  let bound = 0;
  for (const [nx, ny] of norm) bound = Math.max(bound, Math.hypot(nx, ny));
  return { pts: norm, area: Math.abs(polygonArea(norm)), bound };
}

/** 隣接辺からほぼ一直線な中間点を繰り返し落とす（eps は座標系の単位） */
function simplifyPolygon(pts, eps) {
  let out = pts.slice();
  let guard = 0;
  while (out.length > 10 && guard++ < 200) {
    let worst = -1, worstDist = Infinity;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length];
      const next = out[(i + 1) % out.length];
      const d = pointSegmentDistance(out[i], prev, next);
      if (d < worstDist) { worstDist = d; worst = i; }
    }
    if (worst < 0 || worstDist >= eps) break;
    out.splice(worst, 1);
  }
  return out;
}

function pointSegmentDistance(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t));
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointInPolygon(px, py, offs, cx, cy) {
  let inside = false;
  for (let i = 0, j = offs.length - 1; i < offs.length; j = i++) {
    const xi = offs[i][0] + cx, yi = offs[i][1] + cy;
    const xj = offs[j][0] + cx, yj = offs[j][1] + cy;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * SAT による凸ポリゴン同士の衝突判定。
 * aOffs/bOffs は中心相対オフセット、(ax, ay)/(bx, by) は中心座標。
 * 重なっていれば { depth, nx, ny }（B を +n 方向へ depth 動かすと離れる）、
 * 離れていれば null を返す。
 */
export function satMTV(aOffs, ax, ay, bOffs, bx, by) {
  let minOverlap = Infinity, mnx = 0, mny = 0;
  for (let side = 0; side < 2; side++) {
    const offs = side === 0 ? aOffs : bOffs;
    const n = offs.length;
    for (let i = 0; i < n; i++) {
      const p = offs[i], q = offs[(i + 1) % n];
      let nx = -(q[1] - p[1]), ny = q[0] - p[0];
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      nx /= len; ny /= len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [ox, oy] of aOffs) { const d = ox * nx + oy * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const [ox, oy] of bOffs) { const d = ox * nx + oy * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      const shift = (bx - ax) * nx + (by - ay) * ny;
      minB += shift; maxB += shift;
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return null;
      if (overlap < minOverlap) { minOverlap = overlap; mnx = nx; mny = ny; }
    }
  }
  if ((bx - ax) * mnx + (by - ay) * mny < 0) { mnx = -mnx; mny = -mny; }
  return { depth: minOverlap, nx: mnx, ny: mny };
}

/**
 * 2つのポリゴン（凹でもよい）の最短距離。重なり・接触・内包は 0。
 * 合体判定（輪郭が触れたか）に使う。
 */
export function polygonDistance(aOffs, ax, ay, bOffs, bx, by) {
  const na = aOffs.length, nb = bOffs.length;
  for (let i = 0; i < na; i++) {
    const a1 = aOffs[i], a2 = aOffs[(i + 1) % na];
    for (let j = 0; j < nb; j++) {
      const b1 = bOffs[j], b2 = bOffs[(j + 1) % nb];
      if (segmentsCross(a1[0] + ax, a1[1] + ay, a2[0] + ax, a2[1] + ay,
                         b1[0] + bx, b1[1] + by, b2[0] + bx, b2[1] + by)) return 0;
    }
  }
  if (pointInPolygon(aOffs[0][0] + ax, aOffs[0][1] + ay, bOffs, bx, by)) return 0;
  if (pointInPolygon(bOffs[0][0] + bx, bOffs[0][1] + by, aOffs, ax, ay)) return 0;
  let best = Infinity;
  for (const [ox, oy] of aOffs) {
    for (let j = 0; j < nb; j++) {
      const d = pointSegmentDistance([ox + ax, oy + ay],
        [bOffs[j][0] + bx, bOffs[j][1] + by], [bOffs[(j + 1) % nb][0] + bx, bOffs[(j + 1) % nb][1] + by]);
      if (d < best) best = d;
    }
  }
  for (const [ox, oy] of bOffs) {
    for (let j = 0; j < na; j++) {
      const d = pointSegmentDistance([ox + bx, oy + by],
        [aOffs[j][0] + ax, aOffs[j][1] + ay], [aOffs[(j + 1) % na][0] + ax, aOffs[(j + 1) % na][1] + ay]);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * 2つのピースの衝突解決（位置の押し戻し＋反発インパルス）。
 * a, b は { x, y, vx, vy, hull, mass }。hull は中心相対の凸ポリゴン。
 * 衝突していれば true。
 */
export function collideBodies(a, b) {
  if (!a.hull || !b.hull) return false;
  const hit = satMTV(a.hull, a.x, a.y, b.hull, b.x, b.y);
  if (!hit) return false;
  const { depth, nx, ny } = hit;
  const ma = a.mass || 1, mb = b.mass || 1, mt = ma + mb;
  a.x -= nx * depth * (mb / mt);
  a.y -= ny * depth * (mb / mt);
  b.x += nx * depth * (ma / mt);
  b.y += ny * depth * (ma / mt);
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const rest = 0.16;
    const imp = (-(1 + rest) * vn) / (1 / ma + 1 / mb);
    a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny;
    b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny;
    a.vx *= 0.985; b.vx *= 0.985;
  }
  return true;
}

/* ==================================================================
 * 段階ごとの形状（輪郭ポリゴン）。初期値は円相当の正多角形で、
 * キャラ画像が読み込めた段階から実輪郭へ差し替わる。
 * shape = { outline, hull, extL, extR, extT, extB, boundR, area, real }
 * outline/hull/ext* はワールド座標（中心相対px）。
 * ================================================================== */
function buildStageShape(stage, normPts, real) {
  const st = stageOf(stage);
  const scale = st.radius * SPRITE_SCALE;
  const outline = normPts.map(([nx, ny]) => [nx * scale, ny * scale]);
  let hull = convexHull(outline);
  if (hull.length < 3) hull = outline;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, boundR = 0;
  for (const [ox, oy] of outline) {
    if (ox < minX) minX = ox; if (ox > maxX) maxX = ox;
    if (oy < minY) minY = oy; if (oy > maxY) maxY = oy;
    boundR = Math.max(boundR, Math.hypot(ox, oy));
  }
  return {
    outline, hull,
    extL: -minX, extR: maxX, extT: -minY, extB: maxY,
    boundR, area: Math.max(1, Math.abs(polygonArea(hull))), real,
  };
}

const FALLBACK_NORM = regularPolygonOffsets(20, 1 / SPRITE_SCALE);
const stageShapes = VEG_STAGES.map((_, s) => buildStageShape(s, FALLBACK_NORM, false));

export function getStageShape(stage) {
  return stageShapes[stage] ?? stageShapes[0];
}

/** 画像から段階の実輪郭を抽出して差し替える（ブラウザ専用・失敗時は無視） */
function setStageShapeFromImage(stage, img) {
  try {
    if (typeof document === "undefined" || !img.naturalWidth) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h).data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    const res = extractSilhouettePolygon(alpha, w, h);
    if (res && res.pts.length >= 8) stageShapes[stage] = buildStageShape(stage, res.pts, true);
  } catch { /* 読めなければ円相当のまま遊べる */ }
}

/**
 * 合体判定（純粋関数）: 同じ段階同士が「接触」していれば合体する。
 * a, b に輪郭オフセット（offs）があれば輪郭同士の距離で判定し、
 * 無ければ従来の円距離で判定する。now は ms。
 */
export function shouldMerge(a, b, now) {
  if (!a || !b || a === b) return false;
  if (a.stage !== b.stage || a.stage >= VEG_STAGES.length - 1) return false;
  if (now - a.bornAt < MERGE_MIN_AGE || now - b.bornAt < MERGE_MIN_AGE) return false;
  if (a.offs && b.offs) {
    const tol = (a.r + b.r) * (MERGE_TOLERANCE - 1);
    return polygonDistance(a.offs, a.x, a.y, b.offs, b.x, b.y) <= tol;
  }
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  return dist <= (a.r + b.r) * MERGE_TOLERANCE;
}

/** 段階のキャラ画像URL（ミュゼ版キャラ画像。全11段階に専用キャラがある。
 * 万一無い段階は、Web版SVGは使わず無地の丸の仮表示にする） */
export function stageImageUrl(stage) {
  const charUrl = charUrlForSuikaStage(stage);
  if (charUrl) return charUrl;
  const st = stageOf(stage);
  const ph = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='46' fill='${st.tint}'/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ph);
}

/* ---------- デバッグ表示（輪郭ポリゴンの重ね描き） ----------
 * ?suikaDebug=1 で有効。盤面の長押しでも切り替えられる。既定は OFF。 */
let suikaDebug = (() => {
  try { return new URLSearchParams(globalThis.location?.search ?? "").get("suikaDebug") === "1"; }
  catch { return false; }
})();
export function setSuikaDebug(v) { suikaDebug = !!v; }
export function isSuikaDebug() { return suikaDebug; }

function loadBest() {
  try { return Number(globalThis.localStorage?.getItem(SUIKA_BEST_KEY) ?? 0) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { globalThis.localStorage?.setItem(SUIKA_BEST_KEY, String(v)); } catch { /* 保存できなくても遊べる */ }
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * ゲーム本体。DOM への着脱（attach/detach）ができ、進行状態は
 * コントローラ側に保持する（画面の再描画で盤面が消えないように）。
 * hooks.onUpdate(state) がスコア・次の野菜・あふれ警告・終了などの
 * 変化のたびに呼ばれる。state = { score, best, current, next,
 * gameOver, overflowing, madeWatermelon, isRecord }
 * （madeWatermelon は最終段階=やさいバスケット完成フラグの互換名）
 */
export function createSuikaGame(hooks = {}) {
  const onUpdate = typeof hooks.onUpdate === "function" ? hooks.onUpdate : () => {};
  let bodies = [];
  let floaters = [];
  let particles = [];
  let nextId = 1;
  let dropX = SUIKA_W / 2;
  let current = randomDropStage();
  let next = randomDropStage();
  let cooldownUntil = 0;
  let overflowSince = null;
  let gameOver = false;
  let overflowing = false;
  let madeWatermelon = false;
  let score = 0;
  let best = loadBest();

  const images = new Map();
  for (let s = 0; s < VEG_STAGES.length; s++) {
    const img = new Image();
    img.src = stageImageUrl(s);
    images.set(s, img);
    // 読み込めたら輪郭ポリゴンを抽出して衝突形状を実輪郭へ差し替える
    if (img.complete && img.naturalWidth > 0) setStageShapeFromImage(s, img);
    else img.addEventListener("load", () => setStageShapeFromImage(s, img), { once: true });
  }

  let canvas = null;
  let ctx = null;
  let wrap = null;
  let raf = 0;
  let last = 0;
  let attached = false;
  let pressTimer = 0;
  let longPressed = false;

  const snapshot = () => ({
    score, best, current, next, gameOver, overflowing, madeWatermelon,
    isRecord: score > 0 && score >= best,
  });
  const emit = () => onUpdate(snapshot());

  function addScore(pts, x, y, now) {
    score += pts;
    floaters.push({ x, y, text: `+${pts}`, bornAt: now });
    if (score > best) { best = score; saveBest(best); }
    emit();
  }

  function spawnBody(stage, x, y, vx, vy, bornAt, now) {
    const st = stageOf(stage);
    const sh = stageShapes[stage];
    const b = {
      id: nextId++, stage, x, y, vx, vy,
      r: st.radius, bornAt, mergedAt: 0, angle: 0,
      offs: sh.outline, hull: sh.hull, mass: sh.area, br: sh.boundR,
    };
    bodies.push(b);
    return b;
  }

  function drop() {
    const now = performance.now();
    if (gameOver || now < cooldownUntil) return;
    const sh = stageShapes[current];
    const x = Math.min(SUIKA_W - 4 - sh.extR, Math.max(4 + sh.extL, dropX));
    spawnBody(current, x, DROP_Y, 0, 30, now, now);
    current = next;
    next = randomDropStage();
    cooldownUntil = now + 520;
    emit();
  }

  function restart() {
    bodies = [];
    floaters = [];
    particles = [];
    score = 0;
    gameOver = false;
    madeWatermelon = false;
    overflowSince = null;
    overflowing = false;
    current = randomDropStage();
    next = randomDropStage();
    cooldownUntil = 0;
    dropX = SUIKA_W / 2;
    emit();
  }

  function moveTo(clientX) {
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * SUIKA_W;
    const sh = stageShapes[current];
    dropX = Math.min(SUIKA_W - 4 - sh.extR, Math.max(4 + sh.extL, x));
  }

  function nudge(dir) {
    const sh = stageShapes[current];
    dropX = Math.min(SUIKA_W - 4 - sh.extR, Math.max(4 + sh.extL, dropX + dir * 28));
  }

  /* ---------- 物理（輪郭ポリゴンベース・ピースは直立） ---------- */
  function physics(now, dtRaw) {
    const sub = 3;
    const dt = dtRaw / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of bodies) {
        b.vy += 1650 * dt;
        b.vx *= 0.999;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += (0 - b.angle) * Math.min(1, dt * 5); // 傾きは直立へ戻るだけ
        // 形状参照を最新に（画像読込で実輪郭へ差し替わった場合に追従）
        const sh = stageShapes[b.stage];
        b.offs = sh.outline; b.hull = sh.hull; b.mass = sh.area; b.br = sh.boundR;
      }
      // 壁・床・天井: 輪郭の端（extents）で判定する
      for (const b of bodies) {
        const sh = stageShapes[b.stage];
        if (b.x - sh.extL < 4) { b.x = 4 + sh.extL; b.vx = Math.abs(b.vx) * 0.35; }
        if (b.x + sh.extR > SUIKA_W - 4) { b.x = SUIKA_W - 4 - sh.extR; b.vx = -Math.abs(b.vx) * 0.35; }
        if (b.y + sh.extB > SUIKA_H - 4) {
          b.y = SUIKA_H - 4 - sh.extB;
          b.vy = -Math.abs(b.vy) * 0.18;
          if (Math.abs(b.vy) < 28) b.vy = 0;
          b.vx *= 0.82;
        }
        if (b.y - sh.extT < 2) { b.y = 2 + sh.extT; b.vy = Math.abs(b.vy) * 0.2; }
      }
      // ピース同士: 境界円で候補を絞ってから SAT（凸包）で解決。2回反復で積み重なりを安定させる
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < bodies.length; i++) {
          const a = bodies[i]; if (!a) continue;
          for (let j = i + 1; j < bodies.length; j++) {
            const b = bodies[j]; if (!b) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const minD = a.br + b.br;
            if (dx * dx + dy * dy >= minD * minD) continue;
            collideBodies(a, b);
          }
        }
      }
    }

    // merge: same stage, outlines touching
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]; if (!a) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j]; if (!b) continue;
          if (!shouldMerge(a, b, now)) continue;
          const ns = a.stage + 1;
          const nst = stageOf(ns);
          const nsh = stageShapes[ns];
          const nx = (a.x + b.x) / 2;
          const ny = Math.min(SUIKA_H - 4 - nsh.extB, (a.y + b.y) / 2);
          const nvx = (a.vx + b.vx) / 2;
          const nvy = Math.min(a.vy, b.vy) - 40;
          bodies.splice(j, 1);
          bodies.splice(i, 1);
          const nb = spawnBody(ns,
            Math.min(SUIKA_W - 4 - nsh.extR, Math.max(4 + nsh.extL, nx)), ny,
            nvx, nvy, now - 200, now);
          nb.mergedAt = now;
          for (let p = 0; p < 8; p++) {
            const ang = (p / 8) * Math.PI * 2;
            particles.push({
              x: nx, y: ny, vx: Math.cos(ang) * (60 + Math.random() * 70), vy: Math.sin(ang) * (60 + Math.random() * 70) - 30,
              bornAt: now, color: ["#e9b949", "#a9bf8d", "#dd8a76"][p % 3],
            });
          }
          addScore(nst.score, nx, ny - nst.radius, now);
          if (ns === VEG_STAGES.length - 1 && !madeWatermelon) { madeWatermelon = true; emit(); }
          merged = true;
          break outer;
        }
      }
    }

    // game over: settled body above deadline for a while
    const over = bodies.some((b) => now - b.bornAt > 900 && b.y - stageShapes[b.stage].extT < SUIKA_DEADLINE_Y && Math.abs(b.vy) < 130);
    if (over) {
      if (overflowSince == null) overflowSince = now;
      if (now - overflowSince > 1900 && !gameOver) {
        gameOver = true;
        emit();
      }
    } else {
      overflowSince = null;
    }
    const isOverflowing = overflowSince != null;
    if (isOverflowing !== overflowing) { overflowing = isOverflowing; emit(); }
  }

  /* ---------- 描画 ---------- */
  function draw(now) {
    if (!ctx || !canvas) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SUIKA_W, SUIKA_H);
    ctx.fillStyle = "#fffdf8";
    rrect(ctx, 2, 2, SUIKA_W - 4, SUIKA_H - 4, 22);
    ctx.fill();
    ctx.save();
    rrect(ctx, 2, 2, SUIKA_W - 4, SUIKA_H - 4, 22);
    ctx.clip();
    ctx.fillStyle = "#faf3e3";
    for (let y = 170; y < SUIKA_H; y += 88) ctx.fillRect(0, y, SUIKA_W, 2);
    ctx.restore();
    // deadline
    const danger = overflowSince != null;
    ctx.strokeStyle = danger ? "#b91c1c" : "#d8c9a8";
    ctx.lineWidth = danger ? 3 : 2;
    ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(8, SUIKA_DEADLINE_Y); ctx.lineTo(SUIKA_W - 8, SUIKA_DEADLINE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = danger ? "#b91c1c" : "#8a7a65";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(danger ? "あふれそう！" : "ここを超えると あふれちゃう", 10, SUIKA_DEADLINE_Y - 7);

    // aim guide + current piece
    if (!gameOver) {
      const cur = stageOf(current);
      const ready = now >= cooldownUntil;
      ctx.strokeStyle = "rgba(140,106,63,0.35)";
      ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(dropX, DROP_Y + cur.radius); ctx.lineTo(dropX, SUIKA_H - 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = ready ? 1 : 0.35;
      const img = images.get(current);
      const size = cur.radius * 2 * SPRITE_SCALE;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, dropX - size / 2, DROP_Y - size / 2, size, size);
      } else {
        // 画像がまだ読めていない間は、円の下地は描かず段階名だけ出す
        ctx.fillStyle = "#43382c";
        ctx.font = `bold ${Math.max(11, cur.radius * 0.42)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(cur.name, dropX, DROP_Y);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    }

    // bodies（キャラ画像のみを描く。輪郭ベースの当たり判定に合わせ、
    // 円時代の下地ディスク（tint の丸）は描かない）
    for (const b of bodies) {
      const st = stageOf(b.stage);
      const pop = b.mergedAt ? Math.max(0, 1 - (now - b.mergedAt) / 220) : 0;
      const scale = 1 + pop * 0.16;
      const img = images.get(b.stage);
      const size = b.r * 2 * SPRITE_SCALE * scale;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.max(-0.35, Math.min(0.35, b.angle)));
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#43382c";
        ctx.font = `bold ${Math.max(11, b.r * 0.42)}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(st.name, b.x, b.y);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      }
    }
    // debug: collision polygons (outline = teal, hull = orange, bound = gray dashed)
    if (suikaDebug) {
      ctx.lineWidth = 1.5;
      for (const b of bodies) {
        const sh = stageShapes[b.stage];
        ctx.strokeStyle = "rgba(120,120,120,0.6)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(b.x, b.y, sh.boundR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        for (const [offs, color] of [[sh.outline, "rgba(14,149,148,0.9)"], [sh.hull, "rgba(224,123,57,0.9)"]]) {
          ctx.strokeStyle = color;
          ctx.beginPath();
          offs.forEach(([ox, oy], i) => { if (i === 0) ctx.moveTo(b.x + ox, b.y + oy); else ctx.lineTo(b.x + ox, b.y + oy); });
          ctx.closePath(); ctx.stroke();
        }
      }
    }
    // particles
    particles = particles.filter((p) => now - p.bornAt < 480);
    for (const p of particles) {
      const t = (now - p.bornAt) / 1000;
      const alpha = Math.max(0, 1 - t / 0.48);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x + p.vx * t, p.y + p.vy * t + 190 * t * t, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // score floaters
    floaters = floaters.filter((f) => now - f.bornAt < 800);
    for (const f of floaters) {
      const t = (now - f.bornAt) / 800;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = "#8c6a3f";
      ctx.font = "800 19px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y - t * 34);
      ctx.textAlign = "left";
    }
    ctx.globalAlpha = 1;
    // walls
    ctx.strokeStyle = "#e6dbc4"; ctx.lineWidth = 4;
    rrect(ctx, 2, 2, SUIKA_W - 4, SUIKA_H - 4, 22);
    ctx.stroke();
  }

  function frame(now) {
    if (!attached) return;
    const dtRaw = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!gameOver && dtRaw > 0) physics(now, dtRaw);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  const onPointerMove = (e) => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; } moveTo(e.clientX); };
  const onPointerDown = (e) => {
    moveTo(e.clientX);
    // 長押しで輪郭デバッグ表示を切り替え（落下はさせない）
    pressTimer = setTimeout(() => { pressTimer = 0; longPressed = true; setSuikaDebug(!suikaDebug); }, 900);
  };
  const onPointerUp = (e) => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    if (longPressed) { longPressed = false; return; }
    moveTo(e.clientX); drop();
  };

  function attach(canvasEl, wrapEl) {
    detach();
    canvas = canvasEl;
    wrap = wrapEl;
    ctx = canvas.getContext("2d");
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = SUIKA_W * dpr;
    canvas.height = SUIKA_H * dpr;
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("pointerup", onPointerUp);
    attached = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
    emit();
  }

  function detach() {
    attached = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    if (wrap) {
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("pointerup", onPointerUp);
    }
    canvas = null;
    ctx = null;
    wrap = null;
  }

  return {
    attach, detach, drop, restart, nudge, moveTo,
    getState: snapshot,
    destroy() { detach(); },
  };
}
