// loading.js — 読み込み画面（食材キャラ＋豆知識）のデータと純粋ロジック
//
// 読み込み中も「わが家の食材手帳」の世界観で楽しく待てるように、
// - 跳ねる食材キャラの顔ぶれ（図鑑カタログ全体から表示のたびに抽選）
// - 切り替わるステータスメッセージ
// - 食育データ（knowledge.js の個別記事「まめちしき」）からの豆知識プール
// をここに集約する。豆知識は新規に作らず、KNOWLEDGE の実在エントリだけを使う
// （キャラ画像が解決できる食材に限る＝サムネイルが必ず出せる）。

import { KNOWLEDGE } from "./knowledge.js";
import { charUrlFor, allCharUrls } from "./chars.js";

/** 読み込み画面に並べるキャラの数 */
export const LOADING_CHAR_COUNT = 5;

/**
 * 跳ねるキャラの抽選: 図鑑カタログ全体のキャラ画像（chars.js の
 * allCharUrls = 静的データ）から、重複なしで LOADING_CHAR_COUNT 体を
 * ランダムに選んで返す。表示のたびに顔ぶれが変わる。
 * 読み込み画面はストア初期化前にも出るため、カタログのストアデータには
 * 依存せず、静的情報だけで完結させる。
 * rng はテスト用に差し替え可能（0以上1未満を返す関数）。
 */
export function pickLoadingChars(rng = Math.random) {
  const pool = allCharUrls();
  const n = Math.min(LOADING_CHAR_COUNT, pool.length);
  const copy = pool.slice();
  for (let i = 0; i < n; i++) {
    const span = copy.length - i;
    const j = i + Math.min(span - 1, Math.max(0, Math.floor(rng() * span)));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** 約1.6秒ごとに切り替わるステータスメッセージ */
export const LOADING_MESSAGES = [
  "冷蔵庫を開けています…",
  "野菜室をのぞいています…",
  "冷凍庫をチェックしています…",
  "賞味期限を確かめています…",
  "買い物メモを出しています…",
  "図鑑をめくっています…",
  "おいしいレシピを探しています…",
];

/**
 * 豆知識プール: [{ name, trivia, url }]
 * KNOWLEDGE に個別記事（まめちしき）があり、かつキャラ画像が解決できる
 * 食材だけを集める。カテゴリ共通の文章は使わない（食材固有の豆知識だけ）。
 */
export function loadingFactPool() {
  const pool = [];
  for (const name of Object.keys(KNOWLEDGE)) {
    const entry = KNOWLEDGE[name];
    if (!entry || !Array.isArray(entry.trivia)) continue;
    const url = charUrlFor(name);
    if (!url) continue;
    for (const trivia of entry.trivia) {
      if (trivia) pool.push({ name, trivia, url });
    }
  }
  return pool;
}

/**
 * プールから豆知識を1件選ぶ。avoidName があれば、可能ならその食材以外から選ぶ
 * （ティッカーで同じ食材が連続表示されるのを避ける）。空プールでは null。
 * rng はテスト用に差し替え可能（0以上1未満を返す関数）。
 */
export function pickLoadingFact(pool, rng = Math.random, avoidName = null) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  let candidates = pool;
  if (avoidName && pool.some((f) => f.name !== avoidName)) {
    candidates = pool.filter((f) => f.name !== avoidName);
  }
  const idx = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
  return candidates[idx];
}

// ---------- キャラの遊びモーション（物理ベース・rAF 駆動） ----------
// 以前は CSS keyframes の跳ねを animationDelay でずらしていたが、キーフレーム
// 間の補間が粗く「カクカク」して見えた。ここでは重力つきの放物運動を
// requestAnimationFrame で毎フレーム積分し、transform（translate/rotate/
// scale）だけを書き換える。レイアウトには触らないので iPhone Safari でも
// 滑らかに動き、各キャラが自分のリズムで跳ねたり横に揺れたりして遊ぶ。
// 物理部分（createCharBody / stepCharBody / pokeCharBody / charTransform）は
// DOM に触らない純粋関数にしてテスト可能にし、DOM への適用は
// attachCharMotion が担う。

const CHAR_GRAVITY = 1500; // px/s^2

/**
 * キャラ1体の運動状態を作る。index で初回の跳躍タイミングをずらし、
 * rng で跳躍力・休み間隔・横移動に個体差を持たせる（全員そろった波
 * ではなく、それぞれの間合いで遊んでいる感じにする）。
 * y は地面からの高さ(px)、x は基準位置からの横ずれ(px)。
 */
export function createCharBody(index = 0, rng = Math.random) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    grounded: true,
    rest: 0.3 + index * 0.14 + rng() * 0.3, // 最初の跳躍までの待ち（位相ずらし）
    restBase: 0.25 + rng() * 0.55,          // 着地後の休み間隔の基準
    hopPower: 340 + rng() * 130,            // 跳躍力（高さ 約38〜68px）
    drift: 8 + rng() * 12,                  // 横移動の速さ px/s
    maxDrift: 10 + rng() * 10,              // 横ずれの上限
    dir: rng() < 0.5 ? -1 : 1,
    squash: 0, // 着地時のつぶれ 0..0.3
    rot: 0,    // 傾き deg（横移動に合わせて少し傾く）
  };
}

/**
 * 運動状態を dt 秒進める。地面（y=0）より下には行かず、横ずれは
 * ±maxDrift の範囲で反転する。着地した瞬間に衝撃の大きさで squash が立つ。
 */
export function stepCharBody(b, dt, rng = Math.random) {
  if (!b || !(dt > 0)) return b;
  // つぶれは指数で抜ける（バネっぽく戻る）
  b.squash *= Math.exp(-9 * dt);
  if (b.squash < 0.001) b.squash = 0;
  if (b.grounded) {
    // 地面では横滑りを減衰させ、休みが明けたら跳ぶ
    b.x += b.vx * dt;
    b.vx *= Math.max(0, 1 - 8 * dt);
    if (b.x > b.maxDrift) { b.x = b.maxDrift; b.vx = -Math.abs(b.vx); }
    if (b.x < -b.maxDrift) { b.x = -b.maxDrift; b.vx = Math.abs(b.vx); }
    b.rest -= dt;
    if (b.rest <= 0) {
      b.grounded = false;
      b.vy = b.hopPower * (0.85 + rng() * 0.3);
      if (rng() < 0.3) b.dir = -b.dir; // たまに進む向きを変える
      b.vx = b.dir * b.drift * (0.6 + rng() * 0.7);
    }
  } else {
    b.vy -= CHAR_GRAVITY * dt;
    b.y += b.vy * dt;
    b.x += b.vx * dt;
    if (b.x > b.maxDrift) { b.x = b.maxDrift; b.vx = -Math.abs(b.vx); }
    if (b.x < -b.maxDrift) { b.x = -b.maxDrift; b.vx = Math.abs(b.vx); }
    if (b.y <= 0) {
      const impact = -b.vy;
      b.y = 0; b.vy = 0; b.grounded = true;
      b.squash = Math.min(0.3, impact / 1600);
      b.rest = b.restBase * (0.6 + rng() * 0.9);
      b.vx *= 0.4;
    }
  }
  // 傾きは横移動に連動（空中のみ）。地面では 0 に戻る
  const targetRot = b.grounded ? 0 : Math.max(-7, Math.min(7, b.vx * 0.45));
  b.rot += (targetRot - b.rot) * Math.min(1, 12 * dt);
  return b;
}

/** タップされたキャラに強い跳躍インパルスを与える（空中なら押し上げる）。 */
export function pokeCharBody(b, rng = Math.random) {
  if (!b) return b;
  b.grounded = false;
  b.vy = Math.max(b.vy, 580); // 通常の跳躍（最大約68px）より高い約112px
  b.vx += (rng() - 0.5) * 30;
  b.squash = 0;
  b.rest = 0;
  return b;
}

/** 運動状態から CSS transform 文字列を作る（translate3d + rotate + scale）。 */
export function charTransform(b) {
  let sx, sy;
  if (b.grounded) {
    sy = 1 - b.squash;
    sx = 1 + b.squash * 0.75;
  } else {
    // 上昇中は少し伸び、落下中は少し縮む（速さに連動）
    const stretch = Math.max(-0.1, Math.min(0.13, b.vy / 2400));
    sy = 1 + stretch;
    sx = 1 - stretch * 0.55;
  }
  return `translate3d(${b.x.toFixed(1)}px, ${(-b.y).toFixed(1)}px, 0) rotate(${b.rot.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
}

/**
 * キャラ要素の列に遊びモーションを取り付ける。
 * - requestAnimationFrame で毎フレーム物理を進め、transform だけを書き換える
 * - ドキュメントが隠れたらループを止め、戻ったら再開する
 * - 要素が DOM から外れたら自ら止まる（止め忘れ防止）
 * - prefers-reduced-motion のときは動かさない（active: false のハンドルを返す）
 * - rAF が無い環境では null を返す（呼び出し側が CSS アニメーションに倒す）
 * 戻り値: { active, poke(el), stop() } | null
 */
export function attachCharMotion(elements, opts = {}) {
  const els = Array.from(elements || []).filter(Boolean);
  if (els.length === 0) return null;
  if (typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") return null;
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return { active: false, poke() {}, stop() {} };
  const rng = opts.rng || Math.random;
  const bodies = els.map((_, i) => createCharBody(i, rng));
  els.forEach((el, i) => { el.style.transform = charTransform(bodies[i]); });
  let rafId = 0, last = 0, stopped = false, running = false;
  const frame = (now) => {
    if (stopped) return;
    if (!els[0].isConnected) { handle.stop(); return; } // 画面が消えたら自ら止まる
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    for (let i = 0; i < els.length; i++) {
      stepCharBody(bodies[i], dt, rng);
      els[i].style.transform = charTransform(bodies[i]);
    }
    rafId = requestAnimationFrame(frame);
  };
  const start = () => {
    if (stopped || running) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(frame);
  };
  const pause = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
  };
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.hidden) pause();
    else start();
  };
  const handle = {
    active: true,
    poke(el) {
      const i = els.indexOf(el);
      if (i >= 0) pokeCharBody(bodies[i], rng);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      pause();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    },
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  if (!(typeof document !== "undefined" && document.hidden)) start();
  return handle;
}
