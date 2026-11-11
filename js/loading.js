// loading.js — 読み込み画面（食材キャラ＋豆知識）のデータと純粋ロジック
//
// 読み込み中も「わが家の食材手帳」の世界観で楽しく待てるように、
// - 跳ねる食材キャラの顔ぶれ
// - 切り替わるステータスメッセージ
// - 食育データ（knowledge.js の個別記事「まめちしき」）からの豆知識プール
// をここに集約する。豆知識は新規に作らず、KNOWLEDGE の実在エントリだけを使う
// （キャラ画像が解決できる食材に限る＝サムネイルが必ず出せる）。

import { KNOWLEDGE } from "./knowledge.js";
import { charUrlFor } from "./chars.js";

/** 読み込み画面で波のように跳ねる定番食材キャラ（全てキャラ画像が解決できることをテストで担保） */
export const LOADING_CHAR_NAMES = ["トマト", "にんじん", "卵", "牛乳", "ブロッコリー"];

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
