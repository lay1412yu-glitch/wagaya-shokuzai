// util.js — 共通ユーティリティ（DOM生成・日付・招待コード・ハッシュ）
// セキュリティ方針:
// - ユーザー入力は必ず textContent 経由で描画する（innerHTML に混ぜない）ため、
//   ここでは DOM 生成ヘルパー el() を提供し、app.js はこれを使う。
// - 招待コードやパスワードは平文で保存せず、照合はハッシュで行う。

import { resolveCanonicalName } from "./names.js";

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 招待コード: 紛らわしい文字 (0/O, 1/I/L) を除いた文字種で 8 文字 = 例 "K7QX-3M9P"
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateInviteCode() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.slice(0, 4) + "-" + chars.slice(4);
}
export function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function formatCode(normalized) {
  const n = normalizeCode(normalized);
  return n.length === 8 ? n.slice(0, 4) + "-" + n.slice(4) : n;
}

// 冷蔵庫の名前: 前後の空白を取り除き、空は不可、長さは 30 文字まで。
// （作成時は空なら既定名が入るが、名前変更では空への変更を認めない）
export const FRIDGE_NAME_MAX = 30;
export function cleanFridgeName(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("冷蔵庫の名前を入力してください");
  if (clean.length > FRIDGE_NAME_MAX) throw new Error(`冷蔵庫の名前は${FRIDGE_NAME_MAX}文字以内にしてください`);
  return clean;
}

// 日付ユーティリティ（ローカル日付ベース）
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
export function formatDate(isoDate) {
  if (!isoDate) return "期限なし";
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${m}/${d}`;
}
export function expiryLabel(isoDate) {
  const days = daysUntil(isoDate);
  if (days === null) return "";
  if (days < 0) return `${-days}日過ぎ`;
  if (days === 0) return "今日まで";
  if (days === 1) return "明日まで";
  return `あと${days}日`;
}
// グループ: soon=すぐ使いたい(2日以内/期限切れ), week=今週中に(7日以内), later=まだ余裕あり
export function expiryGroup(isoDate) {
  const days = daysUntil(isoDate);
  if (days === null) return "later";
  if (days <= 2) return "soon";
  if (days <= 7) return "week";
  return "later";
}
// 期限チップの色分け（残り日数→色クラス）:
// 期限切れ・今日まで = 赤 (exp-red) / 3日以内 = オレンジ (exp-orange) / それ以外 = 緑〜グレー (exp-calm)
// 期限なし（days が null）のときは null を返す（チップ自体を出さない）。
export function expiryChipClass(days) {
  if (days === null || days === undefined) return null;
  if (days <= 0) return "exp-red";
  if (days <= 3) return "exp-orange";
  return "exp-calm";
}

// DOM 生成ヘルパー: 文字列はすべて textContent になる（XSS 対策）
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function fmtAmount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  // 0.25 のような分数数量を潰さないよう、小数第2位まで保持する
  const v = Math.round(Number(n) * 100) / 100;
  return String(v);
}

// ---- 分数単位（玉）の扱い ----
// 白菜・キャベツなど「玉」単位の頭野菜は、半玉=1/2、1/4玉、3/4玉のように
// 1/4 刻みの分数で登録・表示・増減できるようにする。
// 他の単位（個・本・g など）は従来通り整数/小数のまま。
export function isFractionUnit(unit) { return String(unit || "").trim() === "玉"; }

// 数量の ± ボタンや入力欄の刻み幅: 玉は 1/4、他は 1
export function qtyStepFor(unit) { return isFractionUnit(unit) ? 0.25 : 1; }

// 浮動小数の誤差を防ぐため、数量は小数第2位に丸めて保持する
export function roundQty(n) { return Math.round(Number(n) * 100) / 100; }

const QUARTER_FRACTIONS = [[0.25, "1/4"], [0.5, "1/2"], [0.75, "3/4"]];

// ---- 残りわずか判定は廃止（ユーザー指示 2026-11-12） ----
// 以前あった isLowStock / effectiveLowThreshold / FRACTION_LOW_QTY（しきい値・
// 玉の 1/4 ルール）は削除した。お気に入りの買い物リスト自動追加は
// 「在庫ゼロ（数量 0）」だけをトリガーに app.js 側で判定する。
// 保存済みの lowThreshold 値は単に無視される（読み書きしない）。

// ---- アプリ更新（Service Worker のキャッシュ判定） ----
// アプリの殻キャッシュは "wagaya-shokuzai-vXX"。食材キャラ画像の
// ランタイムキャッシュ "wagaya-chars-v1" は更新時も消さない対象なので、
// 「アプリを最新に更新する」ボタンでは殻だけを削除する。
export function isAppShellCacheName(name) {
  return typeof name === "string" && name.startsWith("wagaya-shokuzai-");
}
// ---- 在庫検索（カナの揺れを吸収する正規化） ----
// カタカナ→ひらがな化＋小文字化＋空白除去をしてから、名前同士を部分一致で比べる。
// 例: 検索「きゃべつ」は登録名「キャベツ」に一致する（表記ゆれを吸収）。
//     ※ 表記ゆれ（漢字／かな／カタカナ）は names.js の正規化で吸収する:
//        検索「玉葱」は登録名「玉ねぎ」に、検索「たまご」は登録名「卵」に一致する。
export function normalizeForSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, "");
}
export function matchesSearch(name, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const rawName = String(name || "");
  if (normalizeForSearch(rawName).includes(q)) return true;
  // 表記ゆれは両側を正規名に解決してから比べる（玉葱⇔玉ねぎ、たまご⇔卵）。
  // 正規化は完全一致の別表記だけに効くので、部分一致の従来動作は変わらない。
  const rawQuery = String(query || "").trim();
  const rn = resolveCanonicalName(rawName);
  const rq = resolveCanonicalName(rawQuery);
  if (rn === rawName && rq === rawQuery) return false;
  return normalizeForSearch(rn).includes(normalizeForSearch(rq)) || normalizeForSearch(rn).includes(q);
}

// ---- よく買うもの／最近登録したもの（ワンタップ再登録用） ----
// 図鑑コレクション（購入回数つき）から「よく買うもの」を回数順に返す。
export function topPurchased(catalog, limit = 8) {
  return [...(catalog || [])]
    .filter((c) => c && c.name)
    .sort((a, b) => (b.purchaseCount ?? 1) - (a.purchaseCount ?? 1) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}

/**
 * 図鑑コレクションを「正規名キー」で統合した Map を返す（読み取り時の解決）。
 *
 * 背景: 在庫登録時の名前の正規化（names.js）が入る前に保存された記録や、
 * 正規化を経ない経路で保存された記録は、別表記（例: ねぎ・たまご）のまま
 * コレクションに残りうる。図鑑のセル・進捗・知識ページの記録照合は正規名で
 * 行うため、そのままだと「冷蔵庫に登録したのに図鑑に反映されない」状態になる。
 * 保存データ自体は書き換えず、読むときに正規名へ解決して統合する:
 * - キーと name は正規名（resolveCanonicalName）
 * - 同じ正規名に複数エントリがある場合は購入回数を合算する
 * - firstAddedAt は最も古いものを残す
 * 加工形態などの別品（刻みねぎ等）は正規化でも統合されないため混ざらない。
 */
export function collectedByCanonicalName(catalog) {
  const map = new Map();
  for (const c of catalog || []) {
    if (!c || !c.name) continue;
    const key = resolveCanonicalName(c.name);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...c, name: key, purchaseCount: c.purchaseCount ?? 1 });
    } else {
      prev.purchaseCount = (prev.purchaseCount ?? 1) + (c.purchaseCount ?? 1);
      if (c.firstAddedAt && (!prev.firstAddedAt || String(c.firstAddedAt) < String(prev.firstAddedAt))) {
        prev.firstAddedAt = c.firstAddedAt;
      }
    }
  }
  return map;
}

/**
 * 在庫を「正規名キー」で統合した Map を返す（図鑑・知識ページの「在庫あり」表示用）。
 *
 * collectedByCanonicalName と対になる読み取り時解決: 在庫の保存名が
 * 別表記（ねぎ等）のままでも、正規名（長ねぎ）で引けるようにする。
 * 値は { name, quantity, unit }:
 * - 数量はロットを合算する。ただし単位の違うロット同士は合算しない
 *   （食材ピッカーと同じ流儀）。単位グループが複数ある場合は合計が
 *   最も大きいグループを代表値にする。
 * - quantity が 0 の食材もエントリは残る（呼び出し側で > 0 を在庫あり判定）。
 * 加工形態などの別品（刻みねぎ等）は正規化でも統合されないため混ざらない。
 */
export function stockByCanonicalName(items) {
  const byUnit = new Map(); // 正規名 -> Map(単位 -> 合計数量)
  for (const item of items || []) {
    if (!item || !item.name) continue;
    const key = resolveCanonicalName(item.name);
    const unit = item.unit || "";
    const q = Number(item.quantity);
    if (!byUnit.has(key)) byUnit.set(key, new Map());
    const groups = byUnit.get(key);
    groups.set(unit, roundQty((groups.get(unit) || 0) + (Number.isFinite(q) ? q : 0)));
  }
  const map = new Map();
  for (const [key, groups] of byUnit) {
    let best = { name: key, quantity: 0, unit: "" };
    for (const [unit, quantity] of groups) {
      if (quantity > best.quantity) best = { name: key, quantity, unit };
    }
    map.set(key, best);
  }
  return map;
}
// 「在庫あり」チップの数量部分（例: ×3束 / ×1/2玉）。図鑑セル・知識ページ共通。
export function stockQtyText(entry) {
  if (!entry) return "";
  return `×${fmtQtyValue(entry.quantity, entry.unit)}${entry.unit || ""}`;
}
// 在庫アイテムから「最近登録したもの」を名前の重複なしで新しい順に返す。
export function recentRegistered(items, limit = 8) {
  const seen = new Set();
  const out = [];
  const sorted = [...(items || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const item of sorted) {
    if (!item || !item.name || seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- 買い物リストへのワンタップ追加 ----
// よく買うもの／最近買ったもの／お気に入り食材のチップをタップするだけで、
// 「いつもの数量・単位」で買い物リストに入れられるようにするための純粋関数群。
// いつもの数量・単位: 在庫に同名の食材があれば、その一番新しい登録の数量・単位
// （＝最後に使った分量）。在庫に無ければ数量1・単位なし（呼び出し側の表示で調整）。
export function usualQtyUnitFor(name, items) {
  let best = null;
  for (const item of items || []) {
    if (!item || item.name !== name) continue;
    if (!best || String(item.createdAt || "") >= String(best.createdAt || "")) best = item;
  }
  if (!best) return { quantity: 1, unit: "" };
  const q = Number(best.quantity);
  return { quantity: Number.isFinite(q) && q > 0 ? roundQty(q) : 1, unit: best.unit || "" };
}
// お気に入り食材（isFavorite）: 名前の重複なしで、新しい登録から順に返す。
export function favoriteItemEntries(items, limit = 10) {
  const seen = new Set();
  const out = [];
  const sorted = [...(items || [])]
    .filter((i) => i && i.name && i.isFavorite)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const item of sorted) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    const q = Number(item.quantity);
    out.push({
      name: item.name,
      quantity: Number.isFinite(q) && q > 0 ? roundQty(q) : 1,
      unit: item.unit || "",
    });
    if (out.length >= limit) break;
  }
  return out;
}
// ワンタップ追加の3行分（よく買う／最近／お気に入り）の候補をまとめて作る。
// 各候補は { name, quantity, unit }（いつもの数量・単位に解決済み）。
export function oneTapCandidates(catalog, items, limit = 10) {
  const top = topPurchased(catalog, limit).map((c) => ({ name: c.name, ...usualQtyUnitFor(c.name, items) }));
  const recent = recentRegistered(items, limit).map((i) => {
    const q = Number(i.quantity);
    return { name: i.name, quantity: Number.isFinite(q) && q > 0 ? roundQty(q) : 1, unit: i.unit || "" };
  });
  const favorites = favoriteItemEntries(items, limit);
  return { top, recent, favorites };
}
// 買い物リストの未チェック行から、同名の最初の行を返す（無ければ null）。
export function shoppingRowFor(shopping, name) {
  return (shopping || []).find((s) => s && s.name === name && !s.isChecked) || null;
}
// 同名の未チェック行に今入っている数量の合計（チップの「リストに入ってます」表示用）。
export function inListQuantity(shopping, name) {
  let total = 0;
  for (const s of shopping || []) {
    if (s && s.name === name && !s.isChecked) total += Number(s.quantity) || 0;
  }
  return roundQty(total);
}
// ワンタップ追加の計画: すでにリストに同名があれば「数量を増やす」、なければ「新規追加」。
// entry は { name, quantity, unit }（いつもの数量・単位）。
export function planOneTapAdd(shopping, entry) {
  const usualQty = Number(entry && entry.quantity);
  const addQty = Number.isFinite(usualQty) && usualQty > 0 ? roundQty(usualQty) : 1;
  const row = entry ? shoppingRowFor(shopping, entry.name) : null;
  if (row) {
    return {
      action: "increment", rowId: row.id,
      quantity: roundQty((Number(row.quantity) || 0) + addQty),
      unit: row.unit || entry.unit || "",
    };
  }
  return { action: "add", quantity: addQty, unit: (entry && entry.unit) || "" };
}

// ---- レシピのクイックフィルタ ----
// レシピタブの絞り込みチップ: すべて／レンジだけ（method=レンジ）／
// おつまみ（course=おつまみ）／時短（15分以内）。
export const RECIPE_QUICK_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "microwave", label: "レンジだけ" },
  { key: "otsumami", label: "おつまみ" },
  { key: "quick", label: "時短（15分以内）" },
];
// 気分フィルタ（P2）: パパッと時短は既存の "quick" キーを再利用する
export const RECIPE_MOOD_FILTERS = [
  { key: "sappari", label: "さっぱり" },
  { key: "gattsuri", label: "がっつり" },
  { key: "hott", label: "ほっと温かく" },
];
export function matchesRecipeFilter(recipe, filter) {
  if (!recipe) return false;
  switch (filter) {
    case "microwave": return recipe.method === "レンジ";
    case "otsumami": return recipe.course === "おつまみ";
    case "sappari": return ["和える", "ゆでる", "蒸す", "スープ"].includes(recipe.method);
    case "gattsuri": return ["炒める", "焼く", "揚げる"].includes(recipe.method) && ["主菜", "主食"].includes(recipe.course);
    case "hott": return ["煮る", "スープ"].includes(recipe.method);
    case "quick": {
      const m = Number(recipe.minutes);
      return Number.isFinite(m) && m > 0 && m <= 15;
    }
    default: return true;
  }
}
export function filterRecipes(recipes, filter) {
  return [...(recipes || [])].filter((r) => matchesRecipeFilter(r, filter));
}

// ---- 保管場所（冷蔵庫の区分け） ----
// 在庫は「冷蔵庫／冷凍庫／野菜室／常温」の区分で登録でき、在庫画面では
// 区分チップで絞り込める。区分が無い・未知の値のアイテムは、ストア側の
// 既定値と同じく「冷蔵庫」として扱う（既存データを移行しないための互換処理）。
export const STORAGE_ZONES = ["冷蔵庫", "冷凍庫", "野菜室", "常温"];
export const STORAGE_ZONE_ALL = "すべて";
export function storageOf(item) {
  const s = item && item.storage;
  return STORAGE_ZONES.includes(s) ? s : "冷蔵庫";
}
export function countByStorage(items) {
  const counts = {};
  for (const z of STORAGE_ZONES) counts[z] = 0;
  for (const item of items || []) counts[storageOf(item)] += 1;
  return counts;
}
export function filterByStorage(items, zone) {
  const list = [...(items || [])];
  if (!zone || zone === STORAGE_ZONE_ALL) return list;
  return list.filter((item) => storageOf(item) === zone);
}
// 登録フォームの保管場所プリセット: カテゴリが「野菜」なら野菜室、それ以外は冷蔵庫。
export function suggestStorage(category) {
  return category === "野菜" ? "野菜室" : "冷蔵庫";
}

// ---- 単位プルダウン ----
// 登録・買い物フォームの単位は自由入力ではなくプルダウンで選ぶ。
// 一覧はカタログ／レシピ／既存データで実際に使われている表記に合わせる
// （既存データの表記は "mL" なので "ml" にはしない）。分数対応の「玉」も含む。
// 一覧にない単位は「その他（自由入力）」で保持でき、既存値を失わない。
export const UNIT_OPTIONS = [
  "個", "本", "玉", "袋", "パック", "缶", "箱", "セット",
  "g", "kg", "mL", "L",
  "切れ", "枚", "束", "房", "尾", "丁", "かけ", "粒", "杯", "株",
  "腹", "皿分",
];
export const UNIT_OTHER_VALUE = "__other__";
// 既存の単位文字列を、プルダウンの選択状態（select の値＋自由入力の値）に変換する。
// 一覧にある値 → その値。一覧にない非空の値 → その他＋その値。空 → 既定の「個」。
export function unitSelectValueFor(value) {
  const v = String(value || "").trim();
  if (UNIT_OPTIONS.includes(v)) return { selectValue: v, customValue: "" };
  if (v) return { selectValue: UNIT_OTHER_VALUE, customValue: v };
  return { selectValue: "個", customValue: "" };
}
// プルダウンの選択状態から、保存する単位文字列を取り出す。
export function resolveUnitValue(selectValue, customValue) {
  if (selectValue === UNIT_OTHER_VALUE) return String(customValue || "").trim();
  return String(selectValue || "");
}

// 数量の表示文字列（単位は付けない）。玉のときは分数表記にする:
//   0.5 → "1/2" / 0.25 → "1/4" / 0.75 → "3/4" / 1.5 → "1と1/2" / 2 → "2"
// 1/4 刻みでない値（例: 0.3玉）は通常の小数表示にフォールバックする。
export function fmtQtyValue(quantity, unit) {
  const q = Number(quantity);
  if (Number.isNaN(q)) return "";
  if (!isFractionUnit(unit)) return fmtAmount(q);
  const whole = Math.floor(q + 1e-9);
  const rest = roundQty(q - whole);
  if (rest === 0) return String(whole);
  for (const [val, label] of QUARTER_FRACTIONS) {
    if (Math.abs(rest - val) < 0.001) return whole > 0 ? `${whole}と${label}` : label;
  }
  return fmtAmount(q);
}

// ---------- 今日の献立ボード ----------
// 「今日作るもの」を一時保存するボード。保存先は冷蔵庫の設定レコード
// （Demo: settings[fridgeId].todayMenu / 本番: fridge_settings ドキュメントの
// todayMenu フィールド）で、形は { date: "YYYY-MM-DD", entries: [...] }。
// entries はレシピお気に入りと同じ形のスナップショット + course。
// 保存された date が今日でなければ読み取り時に空として扱う（翌日自動リセット）。
export const TODAY_MENU_GROUPS = ["主菜", "副菜", "汁物", "その他"];
export function todayMenuGroupOf(course) {
  return course === "主菜" || course === "副菜" || course === "汁物" ? course : "その他";
}
export function emptyTodayMenu(today = todayISO()) {
  return { date: today, entries: [] };
}
/** 保存値の正規化: 日付が今日でない・形が壊れている場合は空のボードを返す */
export function normalizeTodayMenu(raw, today = todayISO()) {
  if (!raw || raw.date !== today || !Array.isArray(raw.entries)) return emptyTodayMenu(today);
  return {
    date: today,
    entries: raw.entries.filter((e) => e && e.recipeKey && e.title),
  };
}
/** ボードへの追加（同じ recipeKey があれば追加しない）。{ board, added } を返す */
export function upsertTodayMenuEntry(board, entry, today = todayISO()) {
  const base = normalizeTodayMenu(board, today);
  if (!entry || !entry.recipeKey) return { board: base, added: false };
  if (base.entries.some((e) => e.recipeKey === entry.recipeKey)) return { board: base, added: false };
  return { board: { date: today, entries: [...base.entries, entry] }, added: true };
}
export function removeTodayMenuEntry(board, recipeKey, today = todayISO()) {
  const base = normalizeTodayMenu(board, today);
  return { date: today, entries: base.entries.filter((e) => e.recipeKey !== recipeKey) };
}
/** コース順（主菜→副菜→汁物→その他）にグループ化する。空のグループは含めない */
export function groupTodayMenuEntries(entries) {
  return TODAY_MENU_GROUPS
    .map((group) => ({ group, entries: (entries || []).filter((e) => todayMenuGroupOf(e.course) === group) }))
    .filter((g) => g.entries.length > 0);
}
// ---------- エラーメッセージの日本語化 ----------
// Firestore / Firebase の生エラー（英語の "Missing or insufficient
// permissions." など）をそのまま画面に出さないための一元変換。
// 呼び出し側は toast(userErrorMessage(e)) の形で使う。
// アプリ自身が投げる日本語の案内文（例: 「コードが見つかりませんでした」）は
// そのまま通し、生の情報は console にだけ残す（原因調査用）。
export function userErrorMessage(e) {
  // コードは "firestore/permission-denied" や "auth/network-request-failed"
  // のように名前空間つきで来るので、末尾の要素名で引く
  const code = e && typeof e.code === "string" ? e.code : "";
  const short = code.split("/").pop();
  const raw = e && e.message ? String(e.message) : "";
  try { console.warn("[error]", code || "(no code)", raw); } catch { /* ログ失敗は無視 */ }
  // 再認証が必要な場合（退会など）は、ログインし直す案内を出す
  if (short === "requires-recent-login" || /requires-recent-login/.test(raw)) {
    return "安全のため、もう一度ログインしてからお試しください";
  }
  switch (short) {
    case "permission-denied":
      return "権限がありませんでした。ログインし直してからもう一度お試しください";
    case "not-found":
      return "データが見つかりませんでした。画面を更新してもう一度お試しください";
    case "unavailable":
    case "network-request-failed":
      return "通信できませんでした。電波の良いところでもう一度お試しください";
    case "deadline-exceeded":
      return "通信に時間がかかりすぎました。もう一度お試しください";
    case "unauthenticated":
    case "user-token-expired":
      return "ログインの有効期限が切れました。ログインし直してください";
    case "already-exists":
      return "すでに登録されています";
    case "resource-exhausted":
      return "アクセスが集中しています。少し待ってもう一度お試しください";
  }
  // コードが無い/未知でも、英語の生メッセージは出さない
  if (/Missing or insufficient permissions/i.test(raw)) {
    return "権限がありませんでした。ログインし直してからもう一度お試しください";
  }
  if (/network|offline|failed to fetch|ERR_/i.test(raw)) {
    return "通信できませんでした。電波の良いところでもう一度お試しください";
  }
  // アプリ自身の日本語の案内文はそのまま表示する
  if (/[ぁ-んァ-ヶ一-龠]/.test(raw)) return raw;
  return "うまくいきませんでした。もう一度お試しください";
}

/** 複数レシピの「足りない材料」を名前＋単位で統合する（分量は合算） */
export function mergeMissingIngredients(missingLists) {
  const map = new Map();
  for (const list of missingLists || []) {
    for (const m of list || []) {
      if (!m || !m.name) continue;
      const key = `${m.name}${m.unit || ""}`;
      const prev = map.get(key);
      if (prev) prev.amount = roundQty(prev.amount + (Number(m.amount) || 0));
      else map.set(key, { name: m.name, amount: Number(m.amount) || 0, unit: m.unit || "" });
    }
  }
  return [...map.values()];
}
