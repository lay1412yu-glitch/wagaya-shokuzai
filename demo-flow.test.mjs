// demo-flow.test.mjs — デモモード（DemoStore）の自動テスト
// 実行: npm test  または  node tests/demo-flow.test.mjs
// 確認すること:
// - 2アカウント＋フレンドコード参加で同じ在庫を共同編集できる／他人は遮断される
// - 「玉」単位の分数数量（1/2・1/4 など）の登録・表示・増減・買い物リスト連動
// - レシピお気に入り（スナップショット保存）の往復・本人だけ見えること

import assert from "node:assert/strict";
import { DemoStore, DEMO_DB_KEY } from "../js/demo-store.js";
import { fmtAmount, fmtQtyValue, qtyStepFor, roundQty, isFractionUnit, normalizeForSearch, matchesSearch, topPurchased, recentRegistered } from "../js/util.js";
import { GUIDE_STEPS, guideSeen, markGuideSeen, guideStorageKey } from "../js/guide.js";
import { LEGAL_INFO, legalDocs } from "../js/legal.js";
import { buildReminders, notifyOnOpen, subscribePush, urlBase64ToUint8Array } from "../js/notify.js";
import { suggestRecipes, suggestMealSet, compareLotsForUse, lotsForIngredient, planUsage, RECIPES, EXTRA_RECIPES, ALL_RECIPES } from "../js/recipes.js";
import { inviteCodeHash, memberDocId, catalogDocId, favoriteDocId, itemToDoc, itemFromDoc, itemPatchToDoc, shoppingToDoc, shoppingFromDoc, catalogToDoc, catalogFromDoc, favoriteToDoc, favoriteFromDoc, memberFromDoc } from "../js/firebase-model.js";
import { iconKeyFor, iconSvg, CATALOG, RARITY, rarityOf } from "../js/icons.js";
import { levelForCount, titleFor, remainingToNextLevel, nextLevelAt } from "../js/levels.js";
import { knowledgeFor, hasOwnKnowledge, KNOWLEDGE } from "../js/knowledge.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); passed++; console.log("  ✓ " + name); }
async function throws(name, fn) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  ok(name + "（拒否される）", threw);
}

// ---------- 分数の表示・刻み ----------
console.log("■ 分数ユーティリティ");
ok("0.5玉 → 1/2", fmtQtyValue(0.5, "玉") === "1/2");
ok("0.25玉 → 1/4", fmtQtyValue(0.25, "玉") === "1/4");
ok("0.75玉 → 3/4", fmtQtyValue(0.75, "玉") === "3/4");
ok("1.5玉 → 1と1/2", fmtQtyValue(1.5, "玉") === "1と1/2");
ok("2.25玉 → 2と1/4", fmtQtyValue(2.25, "玉") === "2と1/4");
ok("1玉 → 1", fmtQtyValue(1, "玉") === "1");
ok("0.3玉（1/4刻みでない）は小数表示", fmtQtyValue(0.3, "玉") === "0.3");
ok("他の単位は従来通り", fmtQtyValue(3, "個") === "3" && fmtQtyValue(0.5, "個") === "0.5");
ok("玉の刻みは 0.25、他は 1", qtyStepFor("玉") === 0.25 && qtyStepFor("個") === 1 && qtyStepFor("g") === 1);
ok("isFractionUnit は 玉 のみ", isFractionUnit("玉") && !isFractionUnit("個"));
ok("fmtAmount(0.25) が 0.3 に化けない", fmtAmount(0.25) === "0.25");
ok("roundQty で 0.25+0.25=0.5（誤差なし）", roundQty(0.25 + 0.25) === 0.5);

// ---------- アカウントと冷蔵庫共有 ----------
console.log("■ 共有フロー");
const store = new DemoStore(new MemoryStorage());
const userA = await store.signUp("a@example.com", "password-a", "Aさん");
const userB = await store.signUp("b@example.com", "password-b", "Bさん");
const userC = await store.signUp("c@example.com", "password-c", "Cさん");
const { fridge, inviteCode } = await store.createFridge(userA.id, "わが家の冷蔵庫");
ok("フレンドコードが発行される", typeof inviteCode === "string" && inviteCode.length >= 8);
const joined = await store.joinByCode(userB.id, inviteCode);
ok("Bがコードで同じ冷蔵庫に参加", joined.id === fridge.id);
await throws("CはAの冷蔵庫の在庫を読めない", () => store.listItems(userC.id, fridge.id));

// ---------- 分数在庫の往復 ----------
console.log("■ 分数在庫");
const hakusai = await store.addItem(userA.id, fridge.id, {
  name: "白菜", category: "野菜", quantity: 0.5, unit: "玉",
  expiryDate: null, storage: "冷蔵庫", isFavorite: true, lowThreshold: 0.5,
});
ok("半玉（0.5玉）で登録できる", hakusai.quantity === 0.5 && hakusai.unit === "玉");
let seenByB = (await store.listItems(userB.id, fridge.id)).find((i) => i.id === hakusai.id);
ok("Bにも 0.5玉 が見える", seenByB && seenByB.quantity === 0.5);
// 1/4 消費する（アプリの − ボタン相当: 玉は 0.25 刻み）
const afterUse = Math.max(0, roundQty(hakusai.quantity - qtyStepFor(hakusai.unit)));
await store.updateItem(userB.id, hakusai.id, { quantity: afterUse });
seenByB = (await store.listItems(userA.id, fridge.id)).find((i) => i.id === hakusai.id);
ok("1/4玉 使うと 0.25玉 になる", seenByB.quantity === 0.25);
ok("残りわずか判定が分数でも効く（0.25 <= しきい値0.5）", seenByB.quantity <= seenByB.lowThreshold);
// お気に入り自動追加相当: 分数のまま買い物リストへ
const shopRow = await store.addShopping(userA.id, fridge.id, {
  name: "白菜", quantity: 0.5, unit: "玉", source: "favorite", linkedItemId: hakusai.id,
});
const shopSeen = (await store.listShopping(userB.id, fridge.id)).find((s) => s.id === shopRow.id);
ok("買い物リストでも 1/2玉 が壊れない", shopSeen.quantity === 0.5 && fmtQtyValue(shopSeen.quantity, shopSeen.unit) === "1/2");
const cabbage = await store.addItem(userB.id, fridge.id, {
  name: "キャベツ", category: "野菜", quantity: 0.75, unit: "玉",
  expiryDate: null, storage: "野菜室", isFavorite: false, lowThreshold: 0.25,
});
ok("キャベツ 3/4玉（0.75）も登録できる", cabbage.quantity === 0.75);

// ---------- レシピお気に入り ----------
console.log("■ レシピお気に入り");
await store.addItem(userA.id, fridge.id, { name: "鶏もも肉", category: "肉", quantity: 300, unit: "g", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
await store.addItem(userA.id, fridge.id, { name: "卵", category: "卵・乳製品", quantity: 6, unit: "個", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
await store.addItem(userA.id, fridge.id, { name: "玉ねぎ", category: "野菜", quantity: 2, unit: "個", expiryDate: null, storage: "野菜室", isFavorite: false, lowThreshold: 1 });
const allItems = await store.listItems(userA.id, fridge.id);
const suggestions = suggestRecipes(allItems, { mode: "stock", servings: 4 });
const oyakodon = suggestions.find((r) => r.id === "oyakodon");
ok("在庫から親子丼が提案される（4人分）", !!oyakodon);
const snapshot = {
  recipeKey: `${oyakodon.id}:stock`, recipeId: oyakodon.id, mode: "stock",
  title: oyakodon.title, minutes: oyakodon.minutes, tip: oyakodon.tip || "",
  steps: [...oyakodon.steps], have: oyakodon.have.map((i) => ({ ...i })), missing: [],
  servings: 4,
};
const saved = await store.addFavoriteRecipe(userA.id, fridge.id, snapshot);
let favsA = await store.listFavoriteRecipes(userA.id, fridge.id);
ok("お気に入りに保存できる", favsA.length === 1 && favsA[0].id === saved.id);
ok("スナップショットに手順が残る", favsA[0].steps.length === oyakodon.steps.length && favsA[0].steps[0] === oyakodon.steps[0]);
const egg = favsA[0].have.find((i) => i.name === "卵");
ok("分量が家族人数で換算済みのまま保存される（卵 1.5×4=6個）", egg && egg.amount === 6);
// 同じキーの再登録は上書き（重複しない）
await store.addFavoriteRecipe(userA.id, fridge.id, { ...snapshot, servings: 2 });
favsA = await store.listFavoriteRecipes(userA.id, fridge.id);
ok("同じレシピの再登録は1件に上書き", favsA.length === 1 && favsA[0].servings === 2);
// 分数材料を含むスナップショットもそのまま往復する
await store.addFavoriteRecipe(userA.id, fridge.id, {
  recipeKey: "teriyaki:stock", recipeId: "teriyaki", mode: "stock",
  title: "鶏の照り焼き", minutes: 20, tip: "", steps: ["焼く"],
  have: [{ name: "キャベツ", amount: 0.25, unit: "玉" }], missing: [], servings: 2,
});
favsA = await store.listFavoriteRecipes(userA.id, fridge.id);
const teriyaki = favsA.find((f) => f.recipeId === "teriyaki");
ok("分数材料（0.25玉）もスナップショットに残る", teriyaki && teriyaki.have[0].amount === 0.25 && fmtQtyValue(teriyaki.have[0].amount, "玉") === "1/4");
// お気に入りは本人のものだけ
const favsB = await store.listFavoriteRecipes(userB.id, fridge.id);
ok("同じ冷蔵庫でもBにはAのお気に入りが見えない", favsB.length === 0);
await throws("メンバー外のCはお気に入りを保存できない", () =>
  store.addFavoriteRecipe(userC.id, fridge.id, { ...snapshot, recipeKey: "x:stock", recipeId: "x" }));
const currentOyakodon = favsA.find((f) => f.recipeId === "oyakodon");
await store.removeFavoriteRecipe(userA.id, fridge.id, currentOyakodon.id);
favsA = await store.listFavoriteRecipes(userA.id, fridge.id);
ok("お気に入りを外せる", favsA.length === 1 && favsA[0].recipeId === "teriyaki");

// ---------- 食材アイコン ----------
console.log("■ 食材アイコン");
ok("白菜 → 個別アイコン hakusai", iconKeyFor("白菜") === "hakusai");
ok("キャベツ → cabbage", iconKeyFor("キャベツ") === "cabbage");
ok("鶏もも肉 → chicken", iconKeyFor("鶏もも肉") === "chicken");
ok("牛乳 → milk（牛肉と誤判定しない）", iconKeyFor("牛乳") === "milk");
ok("アイスクリーム → icecream（クリームと誤判定しない）", iconKeyFor("アイスクリーム") === "icecream");
ok("油揚げ → 専用アイコン aburaage（油と誤判定しない）", iconKeyFor("油揚げ") === "aburaage");
ok("レタス → lettuce", iconKeyFor("レタス") === "lettuce");
ok("いちご → strawberry", iconKeyFor("いちご") === "strawberry");
ok("醤油 → soysauce", iconKeyFor("醤油") === "soysauce");
ok("未知の食材はカテゴリ汎用へ（野菜）", iconKeyFor("謎の葉っぱ", "野菜") === "cat_veg");
ok("未知の食材はカテゴリ汎用へ（魚）", iconKeyFor("謎の切り身", "魚") === "fish");
ok("カテゴリなし未知食材は汎用", iconKeyFor("なにか") === "cat_generic");
const catalogNamesAll = CATALOG.flatMap(([, , names]) => names);
const individualCount = new Set(catalogNamesAll.map((n) => iconKeyFor(n))).size;
ok(`図鑑カタログ ${catalogNamesAll.length} 種すべてが別の専用アイコン（使い回しなし）`, individualCount === catalogNamesAll.length);
ok("カタログ全食材の最終SVGがすべて異なる", new Set(catalogNamesAll.map((n) => iconSvg(n))).size === catalogNamesAll.length);
ok("きのこ類は品種ごとに全部別のアイコン", new Set(["しいたけ", "えのき", "しめじ", "エリンギ", "まいたけ", "マッシュルーム"].map((n) => iconKeyFor(n))).size === 6);
ok("魚介は種類ごとに別のアイコン", new Set(["鮭", "さば", "あじ", "いわし", "さんま", "ぶり", "たら", "まぐろ", "しらす", "えび", "いか", "たこ", "あさり", "ほたて", "かに"].map((n) => iconKeyFor(n))).size === 15);
ok("片栗粉 → katakuriko（栗と誤判定しない）", iconKeyFor("片栗粉") === "katakuriko");
ok("カタログ全食材にSVGが引ける", catalogNamesAll.every((n) => iconSvg(n).startsWith("<svg")));
ok("図鑑カタログは100種以上", catalogNamesAll.length >= 100);

// ---------- 食材図鑑コレクション ----------
console.log("■ 食材図鑑コレクション");
let catalogA = await store.listCatalog(userA.id, fridge.id);
ok("在庫登録した食材が図鑑に自動登録される（白菜・キャベツ・鶏もも肉・卵・玉ねぎ）",
  ["白菜", "キャベツ", "鶏もも肉", "卵", "玉ねぎ"].every((n) => catalogA.some((c) => c.name === n)));
ok("図鑑の記録に初回登録日がある", catalogA.every((c) => !!c.firstAddedAt));
// 同じ食材をもう一度登録しても図鑑は1件のまま
const before = catalogA.filter((c) => c.name === "白菜").length;
await store.addItem(userB.id, fridge.id, { name: "白菜", category: "野菜", quantity: 1, unit: "玉", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
catalogA = await store.listCatalog(userA.id, fridge.id);
ok("同じ食材の再登録で図鑑は重複しない", before === 1 && catalogA.filter((c) => c.name === "白菜").length === 1);
// 同じ冷蔵庫のメンバー同士は同じ図鑑を見る（冷蔵庫単位スコープ）
const catalogB = await store.listCatalog(userB.id, fridge.id);
ok("メンバーBにも同じ図鑑が見える（冷蔵庫単位）", catalogB.length === catalogA.length);
// 在庫から消しても図鑑には残る
const hakusaiRow = (await store.listItems(userA.id, fridge.id)).find((i) => i.name === "白菜");
await store.deleteItem(userA.id, hakusaiRow.id);
catalogA = await store.listCatalog(userA.id, fridge.id);
ok("在庫から消しても図鑑の記録は残る", catalogA.some((c) => c.name === "白菜"));
// メンバー外は図鑑を読めない
await throws("メンバー外のCは図鑑を読めない", () => store.listCatalog(userC.id, fridge.id));
// 別の冷蔵庫の図鑑は混ざらない
const { fridge: fridge2 } = await store.createFridge(userC.id, "Cの冷蔵庫");
await store.addItem(userC.id, fridge2.id, { name: "メロン", category: "果物", quantity: 1, unit: "個", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
const catalogA2 = await store.listCatalog(userA.id, fridge.id);
ok("別世帯の図鑑はAの図鑑に混ざらない", !catalogA2.some((c) => c.name === "メロン"));

// ---------- レアリティ（激レア/レア） ----------
console.log("■ レアリティ（激レア/レア）");
const ultraList = Object.entries(RARITY).filter(([, r]) => r.tier === "ultra").map(([n]) => n);
const rareList = Object.entries(RARITY).filter(([, r]) => r.tier === "rare").map(([n]) => n);
ok("激レアは24種・レアは12種", ultraList.length === 24 && rareList.length === 12);
ok("松茸は激レア", rarityOf("松茸") === "ultra");
ok("通常食材にレアリティは付かない", rarityOf("にんじん") === null);
ok("激レア・レア全種が専用アイコンに解決される（汎用に落ちない）",
  Object.keys(RARITY).every((n) => !iconKeyFor(n).startsWith("cat_")));
ok("激レア・レア同士でアイコンを使い回していない",
  new Set(Object.keys(RARITY).map((n) => iconKeyFor(n))).size === Object.keys(RARITY).length);
ok("本まぐろは大トロ専用（まぐろとは別アイコン）", iconKeyFor("本まぐろ") !== iconKeyFor("まぐろ"));
ok("白いちごはいちごと別アイコン", iconKeyFor("白いちご") !== iconKeyFor("いちご"));
console.log("■ 標準カタログ拡充");
ok("パプリカはピーマンと別の専用アイコン", iconKeyFor("パプリカ") === "paprika" && iconKeyFor("ピーマン") === "pepper");
ok("オレンジはみかんと別の専用アイコン", iconKeyFor("オレンジ") === "orange" && iconKeyFor("みかん") === "mikan");
ok("わかめ・ちくわ・キムチ・マヨネーズに専用アイコン",
  iconKeyFor("わかめ") === "wakame" && iconKeyFor("ちくわ") === "chikuwa" && iconKeyFor("キムチ") === "kimuchi" && iconKeyFor("マヨネーズ") === "mayonnaise");
ok("スーパー定番がカタログに揃っている",
  ["チンゲン菜", "水菜", "豆苗", "にら", "かまぼこ", "こんにゃく", "梅干し", "サバ缶", "わかめ", "昆布", "酢", "みりん", "冷凍ポテト", "フランスパン", "うずら卵"].every((n) => catalogNamesAll.includes(n)));

// ---------- 食材レベルと称号 ----------
console.log("■ 食材レベルと称号");
ok("レベル表は大きな回数で伸びる（1/5/10/20/35/50/75/100/150/200）",
  [1, 5, 10, 20, 35, 50, 75, 100, 150, 200].every((c, i) => levelForCount(c) === i + 1));
ok("境界: 4回はLv1、5回でLv2（最初のレベルアップは早め）", levelForCount(4) === 1 && levelForCount(5) === 2);
ok("200回超は+100回ごとにLvアップ（300回=Lv11）", levelForCount(250) === 10 && levelForCount(300) === 11 && nextLevelAt(200) === 300);
ok("称号マップ", titleFor("にんじん", 1) === "にんじんビギナー" && titleFor("にんじん", 5) === "にんじんファン"
  && titleFor("にんじん", 10) === "にんじんはかせ" && titleFor("にんじん", 20) === "にんじんマスター"
  && titleFor("にんじん", 100) === "伝説のにんじん" && titleFor("にんじん", 200) === "にんじんの神さま"
  && titleFor("にんじん", 300) === "真・にんじんの神さま" && titleFor("にんじん", 0) === "");
ok("あと何回でLvアップか", remainingToNextLevel(1) === 4 && remainingToNextLevel(5) === 5 && remainingToNextLevel(200) === 100);
console.log("■ 購入回数（図鑑に加算される）");
await store.addItem(userA.id, fridge.id, { name: "松茸", category: "野菜", quantity: 1, unit: "パック", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
let catNow = await store.listCatalog(userA.id, fridge.id);
ok("激レアを初登録すると図鑑に集まり購入回数=1", catNow.find((c) => c.name === "松茸")?.purchaseCount === 1);
await store.addItem(userA.id, fridge.id, { name: "松茸", category: "野菜", quantity: 1, unit: "パック", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
await store.recordPurchase(userA.id, fridge.id, "松茸", "野菜");
catNow = await store.listCatalog(userA.id, fridge.id);
ok("再登録と recordPurchase で購入回数が増える（1→3）", catNow.find((c) => c.name === "松茸")?.purchaseCount === 3);
for (let i = 0; i < 5; i++)
  await store.addItem(userA.id, fridge.id, { name: "にんじん", category: "野菜", quantity: 1, unit: "本", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
catNow = await store.listCatalog(userA.id, fridge.id);
const carrot = catNow.find((c) => c.name === "にんじん");
ok("にんじん5回購入で Lv2・称号『にんじんファン』（レベルアップ検出できる）",
  carrot.purchaseCount === 5 && levelForCount(carrot.purchaseCount) === 2 && titleFor("にんじん", carrot.purchaseCount) === "にんじんファン");

// ---------- レシピの消費順（期限の近いもの→先に買ったもの） ----------
console.log("■ レシピの消費順（期限→購入順）");
const lot = (id, createdAt, expiryDate, quantity = 5) => ({ id, name: "豆腐", category: "豆腐・大豆", quantity, unit: "丁", expiryDate, createdAt });
const olderFar = lot("older", "2026-01-01", "2026-12-01");       // 先に買ったが期限は遠い
const newerNear = lot("newer", "2026-06-01", "2026-06-10");      // 後から買ったが期限が近い
ok("期限の近さが購入順より優先（後買い・期限近が先）", compareLotsForUse(newerNear, olderFar) < 0 && compareLotsForUse(olderFar, newerNear) > 0);
const sameExpiryOld = lot("sameOld", "2026-01-01", "2026-06-10");
const sameExpiryNew = lot("sameNew", "2026-03-01", "2026-06-10");
ok("期限が同じなら先に買ったものが先", compareLotsForUse(sameExpiryOld, sameExpiryNew) < 0);
const noExpiryOld = lot("noExpOld", "2026-01-01", null);
const noExpiryNew = lot("noExpNew", "2026-03-01", null);
ok("期限なしは期限ありの後ろ・その中では購入順",
  compareLotsForUse(noExpiryOld, olderFar) > 0 && compareLotsForUse(noExpiryOld, noExpiryNew) < 0);
const tofuIng = { name: "豆腐", match: ["豆腐"] };
const plan = planUsage([olderFar, newerNear], tofuIng, 7, "丁");
ok("使用計画は期限の近いロットから割り当てる", plan.length === 2 && plan[0].itemId === "newer" && plan[0].use === 5 && plan[1].itemId === "older" && plan[1].use === 2);
ok("ロット一覧も消費順に並ぶ", lotsForIngredient([olderFar, newerNear, noExpiryOld], tofuIng)[0].id === "newer");
const isoDay = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const mkStock = (tofuExpiry) => ([
  { id: "t", name: "豆腐", category: "豆腐・大豆", quantity: 2, unit: "丁", expiryDate: tofuExpiry, createdAt: plusDays(-30) },
  { id: "m", name: "味噌", category: "調味料", quantity: 1, unit: "パック", expiryDate: plusDays(120), createdAt: plusDays(-30) },
  { id: "w", name: "わかめ", category: "乾物・缶詰", quantity: 1, unit: "袋", expiryDate: plusDays(120), createdAt: plusDays(-30) },
]);
const calm = suggestRecipes(mkStock(plusDays(90)), { mode: "stock", servings: 2 }).find((r) => r.id === "misoshiru");
const urgent = suggestRecipes(mkStock(plusDays(1)), { mode: "stock", servings: 2 }).find((r) => r.id === "misoshiru");
ok("期限間近の食材を使うレシピが優先される（スコア）", !!calm && !!urgent && urgent.score > calm.score);
ok("材料行に消費順の先頭ロット（期限）が付く", urgent.have.find((i) => i.name === "豆腐")?.fifo?.expiryDate === plusDays(1));

// ---------- 食材の知識（食育コンテンツ） ----------
console.log("■ 食材の知識（食育）");
{
  const catOf = new Map();
  for (const [, c, ns] of CATALOG) for (const n of ns) if (!catOf.has(n)) catOf.set(n, c);
  const allNames = CATALOG.flatMap(([, , ns]) => ns);
  ok("カタログ全品に知識ページがある（本文・旬・見分け方・豆知識・クイズ完備）",
    allNames.every((n) => {
      const k = knowledgeFor(n, catOf.get(n));
      return k.body && k.season && k.choose && k.trivia.length >= 1 && k.quiz
        && k.quiz.choices.length === 3 && k.quiz.answer >= 0 && k.quiz.answer <= 2 && k.quiz.why;
    }));
  ok("カテゴリ共通記事に {name} が残らない（食材名に置換される）",
    allNames.every((n) => !knowledgeFor(n, catOf.get(n)).body.includes("{name}")));
  ok("激レア・レア全品に個別記事がある", Object.keys(RARITY).every((n) => hasOwnKnowledge(n)));
  ok("個別記事は70品以上", Object.keys(KNOWLEDGE).length >= 70);
  const matsutake = knowledgeFor("松茸", "野菜");
  ok("松茸の個別記事（旬は秋・クイズ正解が選択肢内）",
    matsutake.source === "item" && matsutake.season.includes("秋") && matsutake.quiz.choices[matsutake.quiz.answer] === "秋");
  const generic = knowledgeFor("謎の葉っぱ", "野菜");
  ok("未知の食材でもカテゴリ知識が返る", generic.source === "category" && generic.body.includes("謎の葉っぱ"));
  ok("同じ食材のカテゴリクイズは毎回同じ（決定的）",
    knowledgeFor("謎の葉っぱ", "野菜").quiz.q === generic.quiz.q);
}

// ---------- 退会（アカウント削除） ----------
console.log("■ 退会");
// Aは冷蔵庫の作成者。Bがメンバーにいるので、退会すると作成者はBへ引き継がれる
await store.deleteAccount(userA.id);
await throws("退会したAはもうログインできない", () => store.signIn("a@example.com", "password-a"));
const fridgesB = await store.listMyFridges(userB.id);
const kept = fridgesB.find((f) => f.id === fridge.id);
ok("Aの退会後も冷蔵庫は残り、Bが作成者になる", kept && kept.role === "owner");
const itemsB = await store.listItems(userB.id, fridge.id);
ok("共有の在庫は家族のものとして残る（キャベツ 3/4玉）", itemsB.some((i) => i.name === "キャベツ" && i.quantity === 0.75));
const dbAfterA = JSON.parse(store.storage.getItem("wagaya_demo_db_v1"));
ok("Aのお気に入りレシピは消える", !dbAfterA.favoriteRecipes.some((r) => r.userId === userA.id));
ok("Aのユーザー記録は消える", !dbAfterA.users.some((u) => u.id === userA.id));
// メンバーDが参加してから退会：冷蔵庫はそのまま残る
const userD = await store.signUp("d@example.com", "password-d", "Dさん");
const codeB = await store.getInviteCode(userB.id, fridge.id);
await store.joinByCode(userD.id, codeB);
await store.deleteAccount(userD.id);
await throws("退会したDはもうログインできない", () => store.signIn("d@example.com", "password-d"));
ok("メンバーDの退会後も冷蔵庫とBは残る",
  (await store.listMyFridges(userB.id)).some((f) => f.id === fridge.id));
// Cは自分の冷蔵庫の唯一のメンバー。退会すると冷蔵庫ごと消える
await store.deleteAccount(userC.id);
await throws("退会したCはもうログインできない", () => store.signIn("c@example.com", "password-c"));
const dbAfterC = JSON.parse(store.storage.getItem("wagaya_demo_db_v1"));
ok("Cだけの冷蔵庫は退会とともに削除される", !dbAfterC.fridges.some((f) => f.id === fridge2.id));
ok("Cだけの冷蔵庫の在庫も消える", !dbAfterC.items.some((i) => i.name === "メロン"));

// ---------- はじめてガイド ----------
console.log("■ はじめてガイド");
ok("ガイドは4ステップ（登録→買い物→レシピ＋フレンドコード参加）", GUIDE_STEPS.length === 4);
ok("ガイドにフレンドコード／QRでの参加説明がある",
  GUIDE_STEPS.some((s) => s.body.includes("フレンドコード") && s.body.includes("QR")));
{
  const ms = new MemoryStorage();
  ok("ガイド: 未読なら未表示", guideSeen(ms, "u1") === false);
  markGuideSeen(ms, "u1");
  ok("ガイド: 閉じたら表示済みになる", guideSeen(ms, "u1") === true);
  ok("ガイド: ユーザーごとに独立", guideSeen(ms, "u2") === false && guideStorageKey("u1") !== guideStorageKey("u2"));
}

// ---------- プライバシーポリシー／利用規約 ----------
console.log("■ プライバシーポリシー／利用規約（アプリ内）");
{
  const docs = legalDocs();
  ok("法的文書は2つ（privacy / terms）", docs.length === 2 && docs[0].id === "privacy" && docs[1].id === "terms");
  const text = JSON.stringify(docs);
  ok("空欄は [運営者名] [連絡用メールアドレス] [公開URL] [施行日] として残る",
    text.includes("[運営者名]") && text.includes("[連絡用メールアドレス]") && text.includes("[公開URL]") && text.includes("[施行日]"));
  ok("プライバシーに退会（アプリ内削除）の説明がある", text.includes("退会"));
  ok("既定の LEGAL_INFO は空（勝手に値を埋めない）",
    LEGAL_INFO.operatorName === "" && LEGAL_INFO.contactEmail === "" && LEGAL_INFO.publicUrl === "" && LEGAL_INFO.effectiveDate === "");
  const filled = JSON.stringify(legalDocs({ operatorName: "山田花子", contactEmail: "a@example.com", publicUrl: "https://x.pages.dev", effectiveDate: "2026年11月10日" }));
  ok("LEGAL_INFO を埋めると文書へ反映される", filled.includes("山田花子") && filled.includes("https://x.pages.dev") && !filled.includes("[運営者名]"));
}

// ---------- 元に戻す（削除・数量変更）／ゴミ箱 ----------
console.log("■ 元に戻す／ゴミ箱（デモ）");
{
  const s2 = new DemoStore(new MemoryStorage());
  const u = await s2.signUp("undo@example.com", "password-u", "元に戻す係");
  const { fridge: fr } = await s2.createFridge(u.id, "元に戻す家の冷蔵庫");
  const item = await s2.addItem(u.id, fr.id, { name: "牛乳", category: "卵・乳製品", quantity: 2, unit: "本", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
  await s2.updateItem(u.id, item.id, { quantity: 5 });
  ok("数量変更が反映される", (await s2.listItems(u.id, fr.id))[0].quantity === 5);
  await s2.updateItem(u.id, item.id, { quantity: 2 }); // 元に戻す＝前の値で更新し直す
  ok("数量を前の値に戻せる（元に戻す）", (await s2.listItems(u.id, fr.id))[0].quantity === 2);
  const countBefore = (await s2.listCatalog(u.id, fr.id)).find((c) => c.name === "牛乳")?.purchaseCount;
  await s2.deleteItem(u.id, item.id);
  ok("削除後は在庫から消える", (await s2.listItems(u.id, fr.id)).length === 0);
  const trash = await s2.listTrash(u.id, fr.id);
  ok("削除した食材はゴミ箱に入る（deletedAtつき）", trash.length === 1 && trash[0].id === item.id && !!trash[0].deletedAt);
  const restored = await s2.restoreDeletedItem(u.id, fr.id, trash[0]);
  ok("ゴミ箱から復元すると同じID・数量で戻る", restored.id === item.id && restored.quantity === 2
    && (await s2.listItems(u.id, fr.id)).length === 1);
  ok("復元後はゴミ箱が空になる", (await s2.listTrash(u.id, fr.id)).length === 0);
  const countAfter = (await s2.listCatalog(u.id, fr.id)).find((c) => c.name === "牛乳")?.purchaseCount;
  ok("復元で図鑑の購入回数は増えない", countAfter === countBefore);
  const outsider = await s2.signUp("undo2@example.com", "password-u", "他人");
  await throws("非メンバーはゴミ箱を見られない", () => s2.listTrash(outsider.id, fr.id));
  await throws("非メンバーは復元できない", () => s2.restoreDeletedItem(outsider.id, fr.id, { id: "x", name: "牛乳" }));
}

// ---------- 在庫の検索 ----------
console.log("■ 在庫の検索");
ok("検索: カタカナ入力がひらがな名に一致", matchesSearch("きゃべつ", "キャベツ") === true);
ok("検索: ひらがな入力がカタカナ名に一致", matchesSearch("キャベツ", "きゃべつ") === true);
ok("検索: 部分一致", matchesSearch("鶏もも肉", "もも") === true);
ok("検索: 空白は無視される", matchesSearch("牛乳", " 牛 乳 ") === true);
ok("検索: 一致しなければ false", matchesSearch("牛乳", "たまご") === false);
ok("検索: 空クエリは全件一致", matchesSearch("牛乳", "") === true);
ok("検索: 正規化（タマゴ→たまご）", normalizeForSearch("タマゴ") === "たまご");

// ---------- よく買うもの／最近登録したもの ----------
console.log("■ ワンタップ再登録の候補");
{
  const top = topPurchased([
    { name: "牛乳", purchaseCount: 5 }, { name: "卵", purchaseCount: 12 }, { name: "豆腐", purchaseCount: 3 },
  ], 2);
  ok("よく買うものは購入回数順", top.length === 2 && top[0].name === "卵" && top[1].name === "牛乳");
  const rec = recentRegistered([
    { name: "白菜", createdAt: "2026-11-01" }, { name: "白菜", createdAt: "2026-11-05" }, { name: "大根", createdAt: "2026-11-03" },
  ], 8);
  ok("最近登録したものは重複なし・新しい順", rec.length === 2 && rec[0].createdAt === "2026-11-05" && rec[1].name === "大根");
}

// ---------- 通知（ローカル通知／プッシュ準備） ----------
console.log("■ 通知");
{
  const relDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const reminders = buildReminders([
    { name: "牛乳", expiryDate: relDay(2), isFavorite: false, quantity: 3, lowThreshold: 1 },
    { name: "卵", expiryDate: relDay(30), isFavorite: true, quantity: 1, lowThreshold: 1 },
    { name: "米", expiryDate: null, isFavorite: false, quantity: 5, lowThreshold: 1 },
  ]);
  ok("通知: 期限3日以内が対象になる", reminders.some((r) => r.kind === "expiry" && r.name === "牛乳"));
  ok("通知: お気に入り残りわずかが対象になる", reminders.some((r) => r.kind === "low" && r.name === "卵"));
  ok("通知: 対象外の食材は含まれない", !reminders.some((r) => r.name === "米"));
  const itemsSoon = [{ name: "牛乳", expiryDate: relDay(1), isFavorite: false, quantity: 1, lowThreshold: 1 }];
  const noPerm = await notifyOnOpen(itemsSoon, { permission: "default", storage: new MemoryStorage() });
  ok("通知: 未許可では送らない", noPerm.sent === false && noPerm.reason === "not_granted");
  let shown = 0;
  const mem = new MemoryStorage();
  const deps = { permission: "granted", storage: mem, show: async () => { shown++; } };
  const first = await notifyOnOpen(itemsSoon, deps);
  const second = await notifyOnOpen(itemsSoon, deps);
  ok("通知: 許可ありならアプリ起動時に送る", first.sent === true && shown === 1);
  ok("通知: 同じ日には2回送らない", second.sent === false && second.reason === "already_today" && shown === 1);
  const sub = await subscribePush("");
  ok("プッシュ: VAPID公開鍵が未設定なら購読を開始しない", sub.ok === false && sub.reason === "not_configured");
  ok("プッシュ: VAPID鍵の base64url 変換ができる", urlBase64ToUint8Array("SGVsbG8").length === 5);
}

// ---------- リアルタイム更新 ----------
console.log("■ リアルタイム更新");
{
  ok("デモ: 別タブ連携に使う storage キーが公開されている", DEMO_DB_KEY === "wagaya_demo_db_v1");
  const shared = new MemoryStorage();
  const tabA = new DemoStore(shared);
  const tabB = new DemoStore(shared);
  const ua = await tabA.signUp("tab@example.com", "password-t", "タブA");
  const { fridge: fr } = await tabA.createFridge(ua.id, "タブ共有の冷蔵庫");
  await tabA.addItem(ua.id, fr.id, { name: "納豆", category: "豆腐・大豆", quantity: 1, unit: "パック", expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1 });
  ok("デモ: 別インスタンス（別タブ相当）から変更が見える＝storageイベントで再読込できる",
    (await tabB.listItems(ua.id, fr.id)).some((i) => i.name === "納豆"));
  const { FirebaseStore } = await import("../js/firebase-store.js");
  const fb = Object.create(FirebaseStore.prototype);
  fb.db = null; fb.auth = null; fb._mods = null;
  ok("本番: Realtime(onSnapshot) は Firestore 未接続なら購読せず null（従来動作にフォールバック）", fb.subscribeFridge("fridge-x", () => {}) === null);
  ok("本番: ゴミ箱はセッション方式（常に空）", Array.isArray(await fb.listTrash()) && (await fb.listTrash()).length === 0);
  // ロールバック用に旧 Supabase ストアも残っており、同じ契約で読める
  const { SupabaseStore } = await import("../js/supabase-store.js");
  const sb = Object.create(SupabaseStore.prototype);
  sb.client = null;
  ok("ロールバック: 旧 Supabase ストアも Realtime は未接続なら null", sb.subscribeFridge("fridge-x", () => {}) === null);
  ok("デモ: プッシュ購読の保存はデモでは無効", (await tabA.savePushSubscription()).saved === false);
}

// ---------- 配線のスモークチェック（ソース確認） ----------
console.log("■ 配線スモークチェック");
{
  const fs = await import("node:fs");
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  const appSrc = read("../js/app.js");
  ok("アプリに はじめてガイド が配線されている", appSrc.includes("GUIDE_STEPS") && appSrc.includes("renderGuideCard"));
  ok("アプリに 法的ページ が配線されている", appSrc.includes("legalDocs") && appSrc.includes("renderLegalPage"));
  ok("アプリに 元に戻すトースト が配線されている", appSrc.includes("toastWithAction") && appSrc.includes("restoreDeletedItem"));
  ok("アプリに 在庫検索 が配線されている", appSrc.includes("stockListNodes") && appSrc.includes("matchesSearch"));
  ok("アプリに ワンタップ再登録 が配線されている", appSrc.includes("topPurchased") && appSrc.includes("recentRegistered"));
  ok("アプリに 通知設定と起動時通知 が配線されている", appSrc.includes("notifyOnOpen") && appSrc.includes("通知をONにする"));
  ok("アプリに リアルタイム購読 が配線されている", appSrc.includes("subscribeFridge") && appSrc.includes("DEMO_DB_KEY"));
  const fbSrc = read("../js/firebase-store.js");
  ok("本番ストア（Firebase）に Realtime 購読（onSnapshot）がある", fbSrc.includes("onSnapshot"));
  ok("本番ストア（Firebase）に FCM トークン登録がある", fbSrc.includes("registerPushToken") && fbSrc.includes("push_tokens"));
  ok("アプリが Firebase 設定で本番ストアを選ぶ", appSrc.includes("FIREBASE") && appSrc.includes("firebase-store.js"));
  const sbSrc = read("../js/supabase-store.js");
  ok("ロールバック用に旧 Supabase ストアが残っている", sbSrc.includes("postgres_changes"));
  const swSrc = read("../sw.js");
  ok("SW のキャッシュ版数が v13", swSrc.includes("wagaya-shokuzai-v13"));
  ok("SW に push / notificationclick ハンドラがある", swSrc.includes('addEventListener("push"') && swSrc.includes('addEventListener("notificationclick"'));
  ok("SW に FCM バックグラウンド受信（onBackgroundMessage）がある", swSrc.includes("onBackgroundMessage"));
  const rulesSrc = read("../firebase/firestore.rules");
  ok("Firestore ルールにメンバー限定・お気に入り本人限定がある", rulesSrc.includes("isMember") && rulesSrc.includes("favorite_recipes") && rulesSrc.includes("resource.data.userId == uid()"));
  ok("Firestore ルールで fridge_codes の一覧が禁止されている", rulesSrc.includes("fridge_codes") && rulesSrc.includes("allow list: if false"));
  const storageRulesSrc = read("../firebase/storage.rules");
  ok("Storage ルールがメンバー限定＋画像のみ", storageRulesSrc.includes("firestore.exists") && storageRulesSrc.includes("image/(jpeg|png|webp)"));
  const schemaSrc = read("../supabase/schema.sql");
  ok("ロールバック用に旧 schema.sql が残っている", schemaSrc.includes("push_subscriptions") && schemaSrc.includes("【旧バックエンド"));
}

// ---------- Firebase データ変換（firebase-model） ----------
console.log("■ Firebase データ変換レイヤー");
{
  const doc = itemToDoc({ fridgeId: "f1", name: "白菜", category: "野菜", quantity: 0.5, unit: "玉", expiryDate: "", storage: "冷蔵庫", isFavorite: true, lowThreshold: 0.5, createdBy: "u1", createdAt: "2026-11-01" });
  ok("Firebase: 在庫→ドキュメントで期限の空文字は null・数量は数値", doc.expiryDate === null && doc.quantity === 0.5 && doc.lowThreshold === 0.5);
  const back = itemFromDoc("i1", doc);
  ok("Firebase: ドキュメント→在庫の往復で項目が一致", back.id === "i1" && back.name === "白菜" && back.quantity === 0.5 && back.isFavorite === true && back.createdAt === "2026-11-01");
  ok("Firebase: パッチ変換（expiryDate の null 化・数量の数値化）", itemPatchToDoc({ expiryDate: "", quantity: "3" }).expiryDate === null && itemPatchToDoc({ quantity: "3" }).quantity === 3);
  const sBack = shoppingFromDoc("s1", shoppingToDoc({ name: "牛乳", quantity: 2, unit: "本", source: "manual", linkedItemId: null }, "f1", "u1"));
  ok("Firebase: 買い物リストの往復", sBack.name === "牛乳" && sBack.quantity === 2 && sBack.isChecked === false);
  const cBack = catalogFromDoc("c1", catalogToDoc({ fridgeId: "f1", name: "松茸", category: "野菜", purchaseCount: 7 }, "u1"));
  ok("Firebase: 図鑑の往復（購入回数が残る）", cBack.purchaseCount === 7 && cBack.name === "松茸");
  const fBack = favoriteFromDoc("x", favoriteToDoc({ recipeKey: "oyakodon:stock", recipeId: "oyakodon", mode: "stock", title: "親子丼", minutes: 20, tip: "t", steps: ["a"], have: [{ name: "卵", amount: 6, unit: "個" }], missing: [], servings: 4 }, "f1", "u1"));
  ok("Firebase: お気に入りスナップショットの往復", fBack.title === "親子丼" && fBack.have[0].amount === 6 && fBack.servings === 4);
  ok("Firebase: メンバー表示名はスナップショットから読む", memberFromDoc({ userId: "u1", role: "owner", joinedAt: "2026-11-01", displayName: "Aさん" }).displayName === "Aさん");
  ok("Firebase: ドキュメントID規則（メンバー／図鑑／お気に入り）",
    memberDocId("f1", "u1") === "f1_u1" && catalogDocId("f1", "白菜") === "f1__%E7%99%BD%E8%8F%9C" && favoriteDocId("f1", "u1", "oyakodon:stock").startsWith("f1__u1__"));
  const h1 = await inviteCodeHash("K7QX-3M9P");
  const h2 = await inviteCodeHash("k7qx3m9p");
  ok("Firebase: フレンドコードのハッシュは表記ゆれを吸収して一致（平文は保存しない）", h1 === h2 && h1.length === 64 && !h1.includes("K7QX"));
  const h3 = await inviteCodeHash("AAAA-AAAA");
  ok("Firebase: 違うコードは違うハッシュになる", h3 !== h1);
}

// ---------- レシピのバリエーション拡充 ----------
console.log("■ レシピのバリエーション拡充");
{
  ok("レシピ総数が増えた（既存12＋追加20以上）", RECIPES.length === 12 && EXTRA_RECIPES.length >= 20 && ALL_RECIPES.length === RECIPES.length + EXTRA_RECIPES.length);
  const richStock = [
    { id: "r1", name: "鶏もも肉", quantity: 500, unit: "g", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r2", name: "卵", quantity: 10, unit: "個", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r3", name: "玉ねぎ", quantity: 3, unit: "個", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r4", name: "豚肉", quantity: 400, unit: "g", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r5", name: "キャベツ", quantity: 1, unit: "玉", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r6", name: "にんじん", quantity: 3, unit: "本", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r7", name: "じゃがいも", quantity: 4, unit: "個", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r8", name: "豆腐", quantity: 2, unit: "丁", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r9", name: "味噌", quantity: 1, unit: "パック", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r10", name: "わかめ", quantity: 1, unit: "袋", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r11", name: "トマト", quantity: 3, unit: "個", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r12", name: "鮭", quantity: 3, unit: "切れ", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r13", name: "ねぎ", quantity: 2, unit: "本", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r14", name: "生姜", quantity: 1, unit: "個", expiryDate: null, createdAt: "2026-11-01" },
    { id: "r15", name: "大根", quantity: 1, unit: "本", expiryDate: null, createdAt: "2026-11-01" },
  ];
  const candidates = suggestRecipes(richStock, { mode: "stock", servings: 2, limit: 100, rotateKey: "fixed" });
  ok("固定の在庫セットで候補が以前（12品上限）より多い（18品以上）", candidates.length >= 18);
  const chicken = candidates.filter((r) => r.have.some((i) => i.name.includes("鶏")));
  ok("鶏肉料理が複数ある（親子丼・照り焼き・唐揚げ等 4品以上）", chicken.length >= 4);
  ok("鶏肉料理に調理法の違いがある（3種以上）", new Set(chicken.map((r) => r.method)).size >= 3);
  ok("味付けジャンルが複数ある（和風・洋風・中華）",
    ["和風", "洋風", "中華"].every((g) => candidates.some((r) => r.genre === g)));
  ok("候補にコース情報が付く（主菜・副菜・汁物が揃う）",
    ["主菜", "副菜", "汁物"].every((c) => candidates.some((r) => r.course === c)));
  ok("使い切りレシピ（useUp）が候補に含まれる", candidates.some((r) => r.useUp));
  const rotA = suggestRecipes(richStock, { mode: "stock", servings: 2, limit: 8, rotateKey: "2026-11-09" }).map((r) => r.id);
  const rotB = suggestRecipes(richStock, { mode: "stock", servings: 2, limit: 8, rotateKey: "2026-11-10" }).map((r) => r.id);
  const rotC = suggestRecipes(richStock, { mode: "stock", servings: 2, limit: 8, rotateKey: "2026-12-25" }).map((r) => r.id);
  ok("ローテーション: 日付キーが変わると提案の並び／顔ぶれが変わる", rotA.join() !== rotB.join() || rotA.join() !== rotC.join());
  const set = suggestMealSet(richStock, { servings: 2, rotateKey: "fixed" });
  ok("献立セット: 主菜＋副菜＋汁物が揃う", !!set && !!set.main && !!set.side && !!set.soup && set.recipes.length === 3);
  ok("献立セット: 3品は別々のコースで重複しない", !!set && new Set(set.recipes.map((r) => r.id)).size === 3
    && set.main.course !== set.side.course && set.soup.course === "汁物" && set.totalMinutes > 0);
  ok("献立セット: 在庫が無ければ null", suggestMealSet([], { servings: 2 }) === null);
}

console.log(`\n✅ 全 ${passed} 項目パス`);
