// suika.js — やさいあわせゲーム（スイカゲームの野菜版）Web配布版
//
// Muse内蔵版（SuikaGame.tsx）の移植:
// - 上から野菜キャラを落とし、同じ野菜同士がくっつくと1段階進化
// - 進化順: プチトマト→にんじん→なす→ピーマン→玉ねぎ→じゃがいも
//   →かぼちゃ→大根→キャベツ→白菜→すいか（最終段階）
// - 物理演算は自前の円物理（重力・壁・床・円同士の衝突）
// - 合体判定は「接触」ベース: 衝突処理が円同士をちょうど触れる距離
//   （半径の合計）まで押し戻すため、半径合計 ×1.04 以内なら合体する
// - キャラ画像は js/icons.js の食材キャラ（SVG）をそのまま使う
// - 既存データ（ストア・Firestore・在庫）には一切触らない。
//   ベストスコアだけ端末の localStorage（専用キー）に保存する

import { iconSvg } from "./icons.js";

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
  { name: "すいか", radius: 106, score: 66, tint: "#f6dfc9" },
];

export const SUIKA_W = 360;
export const SUIKA_H = 520;
export const SUIKA_DEADLINE_Y = 118;
export const SUIKA_BEST_KEY = "wagaya.suika.best";

const DROP_Y = 56;
const DROP_POOL = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4];
const MERGE_TOLERANCE = 1.04; // 接触判定の遊び（半径合計に対する倍率）
const MERGE_MIN_AGE = 90; // 生まれてすぐは合体しない (ms)

export function randomDropStage() {
  return DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)] ?? 0;
}
export function stageOf(s) {
  return VEG_STAGES[s] ?? VEG_STAGES[0];
}

/**
 * 合体判定（純粋関数）: 同じ段階同士が「接触」していれば合体する。
 * a, b は { stage, x, y, r, bornAt }、now は ms。
 */
export function shouldMerge(a, b, now) {
  if (!a || !b || a === b) return false;
  if (a.stage !== b.stage || a.stage >= VEG_STAGES.length - 1) return false;
  if (now - a.bornAt < MERGE_MIN_AGE || now - b.bornAt < MERGE_MIN_AGE) return false;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  return dist <= (a.r + b.r) * MERGE_TOLERANCE;
}

/** 段階のキャラ画像URL（icons.js の SVG を data URL 化） */
export function stageImageUrl(stage) {
  const st = stageOf(stage);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(iconSvg(st.name, "野菜"));
}

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
  }

  let canvas = null;
  let ctx = null;
  let wrap = null;
  let raf = 0;
  let last = 0;
  let attached = false;

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

  function drop() {
    const now = performance.now();
    if (gameOver || now < cooldownUntil) return;
    const st = stageOf(current);
    const x = Math.min(SUIKA_W - st.radius - 4, Math.max(st.radius + 4, dropX));
    bodies.push({
      id: nextId++, stage: current, x, y: DROP_Y, vx: 0, vy: 30,
      r: st.radius, bornAt: now, mergedAt: 0, angle: 0, va: 0,
    });
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
    const st = stageOf(current);
    dropX = Math.min(SUIKA_W - st.radius - 4, Math.max(st.radius + 4, x));
  }

  function nudge(dir) {
    const st = stageOf(current);
    dropX = Math.min(SUIKA_W - st.radius - 4, Math.max(st.radius + 4, dropX + dir * 28));
  }

  /* ---------- 物理 ---------- */
  function physics(now, dtRaw) {
    const sub = 3;
    const dt = dtRaw / sub;
    for (let s = 0; s < sub; s++) {
      for (const b of bodies) {
        b.vy += 1650 * dt;
        b.vx *= 0.999;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.va * dt;
        b.va *= 0.98;
      }
      for (const b of bodies) {
        if (b.x - b.r < 4) { b.x = 4 + b.r; b.vx = Math.abs(b.vx) * 0.35; }
        if (b.x + b.r > SUIKA_W - 4) { b.x = SUIKA_W - 4 - b.r; b.vx = -Math.abs(b.vx) * 0.35; }
        if (b.y + b.r > SUIKA_H - 4) {
          b.y = SUIKA_H - 4 - b.r;
          b.vy = -Math.abs(b.vy) * 0.18;
          if (Math.abs(b.vy) < 28) b.vy = 0;
          b.vx *= 0.82;
          b.va = b.vx * 0.004;
        }
        if (b.y - b.r < 2) { b.y = 2 + b.r; b.vy = Math.abs(b.vy) * 0.2; }
      }
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]; if (!a) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j]; if (!b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minD = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d; const ny = dy / d;
          const overlap = minD - d;
          const ma = a.r * a.r; const mb = b.r * b.r; const mt = ma + mb;
          a.x -= nx * overlap * (mb / mt);
          a.y -= ny * overlap * (mb / mt);
          b.x += nx * overlap * (ma / mt);
          b.y += ny * overlap * (ma / mt);
          const rvx = b.vx - a.vx; const rvy = b.vy - a.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const rest = 0.16;
            const imp = (-(1 + rest) * vn) / (1 / ma + 1 / mb);
            a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny;
            b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny;
            a.vx *= 0.985; b.vx *= 0.985;
            a.va += (rvy * nx - rvx * ny) * 0.002;
            b.va -= (rvy * nx - rvx * ny) * 0.002;
          }
        }
      }
    }

    // merge: same stage touching
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
          const nx = (a.x + b.x) / 2;
          const ny = Math.min(SUIKA_H - 4 - nst.radius, (a.y + b.y) / 2);
          bodies.splice(j, 1);
          bodies.splice(i, 1);
          bodies.push({
            id: nextId++, stage: ns,
            x: Math.min(SUIKA_W - 4 - nst.radius, Math.max(4 + nst.radius, nx)), y: ny,
            vx: (a.vx + b.vx) / 2, vy: Math.min(a.vy, b.vy) - 40,
            r: nst.radius, bornAt: now - 200, mergedAt: now, angle: 0, va: 0,
          });
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
    const over = bodies.some((b) => now - b.bornAt > 900 && b.y - b.r < SUIKA_DEADLINE_Y && Math.abs(b.vy) < 130);
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
      const size = cur.radius * 2 * 1.18;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, dropX - size / 2, DROP_Y - size / 2, size, size);
      } else {
        ctx.fillStyle = cur.tint;
        ctx.beginPath(); ctx.arc(dropX, DROP_Y, cur.radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // bodies
    for (const b of bodies) {
      const st = stageOf(b.stage);
      const pop = b.mergedAt ? Math.max(0, 1 - (now - b.mergedAt) / 220) : 0;
      const scale = 1 + pop * 0.16;
      ctx.fillStyle = st.tint;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.94 * scale, 0, Math.PI * 2); ctx.fill();
      const img = images.get(b.stage);
      const size = b.r * 2 * 1.18 * scale;
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

  const onPointerMove = (e) => moveTo(e.clientX);
  const onPointerDown = (e) => moveTo(e.clientX);
  const onPointerUp = (e) => { moveTo(e.clientX); drop(); };

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
