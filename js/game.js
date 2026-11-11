// game.js — 食材クイズゲーム（遊びながら学べるゲーム）
//
// 食育コンテンツ（js/knowledge.js）の「旬・見分け方・からだにいいこと
// （栄養）・まめちしき・3択クイズ」、レシピデータ（js/recipes.js の
// RECIPES / EVENT_RECIPES / EVENT_MENUS / REGIONS / REGIONAL_RECIPES /
// REGIONAL_PREF）、図鑑のレア度（js/icons.js の RARITY）から、そのまま
// 遊べるクイズを組み立てる純粋ロジック。状態は持たず、在庫・買い物
// リストなどのデータには一切触れない（ゲームの結果はどこにも保存しない）。
// すべての問題はデータから自動生成するので、食材やレシピが増えれば
// 問題のプールも自動で増える（手書きの固定問題リストは持たない）。
//
// 問題の種類（type）: 全16種類
// - "knowledge":  知識ページの3択クイズそのもの
// - "season":     「いちばんおいしい季節（旬）はいつ？」を選ぶ
// - "name":       まめちしきをヒントに、食材の名前を当てる（キャラはシルエット表示）
// - "nutrition":  「この食材に多く入っている栄養は？」（body=からだにいいこと から出題）
// - "choose":     「おいしい○○の見分け方は？」（choose=見分け方 が正解、
//                   他の食材の見分け方が選択肢になる）
// - "seasonfood": 「○○（季節）に旬の食べ物はどれ？」（名前の3択。シルエット表示）
// - "regional":   郷土料理クイズ「○○はどこの地域の名物？」（recipes.js の
//                   地域データから出題。料理名と由来メモを使う）
// - "rarity":     レア度クイズ「図鑑で○○はどのくらいめずらしい？」／
//                   「激レア（レア）の食材はどれ？」（icons.js の RARITY から出題）
// - "category":   仲間分けクイズ「なかまはずれはどれ？」（2つは同じカテゴリ、
//                   1つだけ違うカテゴリ）
// - "trivia":     まめちしきクイズ「○○について正しいのはどれ？」
// - "bodyhint":   からだヒント当て（からだにいいこと の文をヒントに名前を当てる。
//                   個別記事のある食材だけから出題する）
// - "prefecture": 都道府県クイズ（料理名 → 都道府県）
// - "prefdish":   都道府県クイズ（都道府県 → 料理名）
// - "recipein":   レシピクイズ「『○○』に入る食材はどれ？」
// - "recipeout":  レシピクイズ「『○○』に入らない食材はどれ？」
// - "eventdish":  イベント料理クイズ「『○○』はどの行事のごちそう？」／
//                   「○○（行事）の料理はどれ？」（EVENT_MENUS から出題）
//
// どの問題にも fact（答えた後に見せる短い解説・豆知識）が付く。fact は
// 食育データやレシピの由来メモ・行事メモから生成し、explain の末尾にも
// 「💡」付きでつなげる（間違えた問題を結果画面で復習できるよう、
// 問題データ自体に解説を持たせる）。
// 選択肢は必ず3つで、正解は1つだけ。間違いの選択肢は、なるべく同じ
// カテゴリ・同じ地域など近いものから選ぶ。seed を渡せば毎回同じ問題に
// なる（テスト用）。同じラウンド内では同じ問題は二度出ない。
// ラウンドの長さは 5 / 10 / 15 / 20 / 30 問（GAME_COUNT_OPTIONS）。
// 難易度は GAME_DIFFICULTIES（こども／かぞく／大人チャレンジ）で
// 出題タイプの顔ぶれが変わる。buildGameQuestions の difficulty で指定。

import { knowledgeFor, KNOWLEDGE } from "./knowledge.js";
import {
  REGIONS, REGIONAL_RECIPES, REGIONAL_RECIPES_MORE, REGIONAL_PREF,
  ALL_RECIPES, EVENT_RECIPES, EVENT_MENUS,
} from "./recipes.js";
import { CATALOG, rarityOf, rarityCategory } from "./icons.js";

export const GAME_QUESTION_COUNT = 5;
export const GAME_COUNT_OPTIONS = [5, 10, 15, 20, 30];
export const GAME_TYPES = [
  "knowledge", "season", "name", "nutrition", "choose", "seasonfood", "regional",
  "rarity", "category", "trivia", "bodyhint",
  "prefecture", "prefdish", "recipein", "recipeout", "eventdish",
];
/** 難易度ごとの出題タイプ。family は全タイプ、kids はやさしいものだけ、
 *  adult は栄養・見分け方・由来・都道府県など歯ごたえのあるもの中心。 */
export const GAME_DIFFICULTIES = [
  {
    id: "kids", label: "こども（やさしい）",
    types: ["knowledge", "season", "name", "seasonfood", "category", "rarity", "recipein"],
  },
  { id: "family", label: "かぞく（ふつう）", types: [...GAME_TYPES] },
  {
    id: "adult", label: "大人チャレンジ（むずかしい）",
    types: ["knowledge", "nutrition", "choose", "trivia", "bodyhint", "regional",
      "prefecture", "prefdish", "recipeout", "eventdish", "rarity"],
  },
];
export const GAME_DIFFICULTY_DEFAULT = "family";
export const CORRECT_PRAISE = [
  "すごい！その調子！",
  "やったね！食材はかせに一歩近づいたよ",
  "かんぺきに覚えているね！",
];

/** 決定的乱数（mulberry32）。同じ seed では同じ並びになる */
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const SEASON_CHOICES = ["春", "夏", "秋", "冬", "一年中"];
/**
 * 旬テキスト（例: "秋〜冬（甘くなる）" "一年中" "春・秋"）から
 * 代表の季節バケットを返す。季節の字が無い場合は null。
 */
export function seasonBucket(seasonText) {
  const s = String(seasonText || "");
  let best = null, bestIdx = Infinity;
  for (const kanji of ["春", "夏", "秋", "冬"]) {
    const idx = s.indexOf(kanji);
    if (idx >= 0 && idx < bestIdx) { best = kanji; bestIdx = idx; }
  }
  if (best) return best;
  return s.includes("一年中") ? "一年中" : null;
}

// ---- 栄養クイズ用の栄養ワード（長い語を先に判定する） ----
const NUTRIENT_WORDS = [
  "アスタキサンチン", "ポリフェノール", "ビタミンB12", "ビタミンB1", "ビタミンB群",
  "食物繊維", "たんぱく質", "カルシウム", "カロテン", "リコピン", "ナスニン",
  "ビタミンA", "ビタミンC", "ビタミンD", "ビタミンE", "ビタミンK", "ビタミンU",
  "カリウム", "グアニル酸", "クエン酸", "ペクチン", "乳酸菌", "納豆菌", "タウリン",
  "葉酸", "鉄分", "亜鉛", "酵素", "DHA",
];
/** body（からだにいいこと）から代表の栄養ワードを1つ拾う。なければ null */
export function nutrientOf(bodyText) {
  const s = String(bodyText || "");
  for (const w of NUTRIENT_WORDS) if (s.includes(w)) return w;
  return null;
}

// ---- fact（豆知識）の生成 ----
/**
 * 食材の食育データから、具体的で発見のある豆知識を1つ作る。
 * avoidText と同じ文は選ばない（問題文に使ったヒントの繰り返しを避ける）。
 */
function factFromKnowledge(name, info, rng, avoidText = "") {
  const cands = [];
  for (const t of info.trivia || []) {
    if (t && t !== avoidText && !cands.includes(t)) cands.push(t);
  }
  const nut = nutrientOf(info.body);
  if (nut) cands.push(`${name}には${nut}が入っているよ。${String(info.body).split("。")[0]}。`);
  if (info.choose) cands.push(`おいしい${name}の見分け方：${info.choose}`);
  if (seasonBucket(info.season)) cands.push(`${name}の旬は「${info.season}」だよ。旬のものはおいしくて栄養もたっぷりだよ。`);
  if (!cands.length && info.body) cands.push(`${String(info.body).split("。")[0]}。`);
  return cands.length ? pick(cands, rng) : "";
}
/** fact を問題に付け、explain の末尾にも「💡」でつなげる（今の画面でも学べるように） */
function withFact(q, fact) {
  const f = String(fact || "").trim();
  q.fact = f;
  if (f && !q.explain.includes(f)) q.explain = q.explain ? `${q.explain} 💡 ${f}` : f;
  return q;
}

/** 同じカテゴリの食材を優先して、名前の選択肢（間違い役）を集める */
function nameDistractors(target, pool, rng, count = 2) {
  const sameCat = shuffled(pool.filter((p) => p.name !== target.name && p.category === target.category), rng);
  const otherCat = shuffled(pool.filter((p) => p.name !== target.name && p.category !== target.category), rng);
  return [...sameCat, ...otherCat].slice(0, count).map((p) => p.name);
}

function knowledgeQuestion(target, info, rng) {
  const choices = shuffled(info.quiz.choices, rng);
  return withFact({
    name: target.name, category: target.category, type: "knowledge",
    q: info.quiz.q,
    choices,
    answer: choices.indexOf(info.quiz.choices[info.quiz.answer]),
    explain: info.quiz.why,
  }, factFromKnowledge(target.name, info, rng, info.quiz.q));
}
function seasonQuestion(target, info, rng) {
  const bucket = seasonBucket(info.season);
  if (!bucket) return null;
  const others = shuffled(SEASON_CHOICES.filter((c) => c !== bucket), rng).slice(0, 2);
  const choices = shuffled([bucket, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "season",
    q: `${target.name}が いちばん おいしい きせつ（旬）は いつ？`,
    choices,
    answer: choices.indexOf(bucket),
    explain: `${target.name}の旬は「${info.season}」だよ。旬のものはおいしくて栄養もたっぷりだよ。`,
  }, factFromKnowledge(target.name, info, rng));
}
function nameQuestion(target, info, pool, rng) {
  const others = nameDistractors(target, pool, rng);
  if (others.length < 2) return null;
  // ヒント文に食材名そのものが入っていたら伏せ字にする（答えがバレないように）
  const hint = String(info.trivia[0] || "").split(target.name).join("○○○");
  const choices = shuffled([target.name, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "name",
    q: `ヒント：${hint} この たべものは なーんだ？`,
    choices,
    answer: choices.indexOf(target.name),
    explain: `正解は『${target.name}』！ 旬は「${info.season}」。${info.choose}`,
  }, factFromKnowledge(target.name, info, rng, info.trivia[0]));
}
function nutritionQuestion(target, info, rng) {
  const nutrient = nutrientOf(info.body);
  if (!nutrient) return null;
  const others = shuffled(NUTRIENT_WORDS.filter((w) => w !== nutrient), rng).slice(0, 2);
  const choices = shuffled([nutrient, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "nutrition",
    q: `${target.name}に 多く 入っていて、体に うれしい 栄養は どれ？`,
    choices,
    answer: choices.indexOf(nutrient),
    explain: `${target.name}のはたらき：${info.body}`,
  }, factFromKnowledge(target.name, info, rng));
}
function chooseQuestion(target, info, pool, rng) {
  // 同じカテゴリの食材の見分け方を優先して間違い役にする（近いものほど難しい）
  const ordered = [
    ...shuffled(pool.filter((x) => x.name !== target.name && x.category === target.category), rng),
    ...shuffled(pool.filter((x) => x.name !== target.name && x.category !== target.category), rng),
  ];
  const others = [];
  for (const p of ordered) {
    const other = knowledgeFor(p.name, p.category).choose;
    if (other && other !== info.choose && !others.includes(other)) others.push(other);
    if (others.length >= 2) break;
  }
  if (others.length < 2) return null;
  const choices = shuffled([info.choose, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "choose",
    q: `おいしい ${target.name} の 見分け方は どれ？`,
    choices,
    answer: choices.indexOf(info.choose),
    explain: `${target.name}の見分け方：${info.choose}`,
  }, factFromKnowledge(target.name, info, rng));
}
function seasonFoodQuestion(target, info, pool, rng) {
  const bucket = seasonBucket(info.season);
  if (!bucket || bucket === "一年中") return null;
  const others = [];
  for (const p of shuffled(pool.filter((x) => x.name !== target.name), rng)) {
    const pi = knowledgeFor(p.name, p.category);
    const b = seasonBucket(pi.season);
    if (b && b !== bucket && !others.includes(p.name)) others.push(p.name);
    if (others.length >= 2) break;
  }
  if (others.length < 2) return null;
  const choices = shuffled([target.name, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "seasonfood",
    q: `${bucket}に いちばん おいしい（旬の）食べ物は どれ？`,
    choices,
    answer: choices.indexOf(target.name),
    explain: `${target.name}の旬は「${info.season}」だよ。旬の食べ物はおいしくて栄養もたっぷりだよ。`,
  }, factFromKnowledge(target.name, info, rng));
}
function triviaQuestion(target, info, pool, rng) {
  const correct = info.trivia && info.trivia[0];
  if (!correct) return null;
  // 間違い役は違うカテゴリの食材のまめちしき（その食材には当てはまらない文にする）
  const others = [];
  for (const p of shuffled(pool.filter((x) => x.name !== target.name && x.category !== target.category), rng)) {
    const t = knowledgeFor(p.name, p.category).trivia[0];
    if (t && t !== correct && !others.includes(t)) others.push(t);
    if (others.length >= 2) break;
  }
  if (others.length < 2) return null;
  const choices = shuffled([correct, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "trivia",
    q: `${target.name}について 正しいのは どれ？`,
    choices,
    answer: choices.indexOf(correct),
    explain: `正解は『${correct}』だよ。`,
  }, factFromKnowledge(target.name, info, rng, correct));
}
function bodyHintQuestion(target, info, pool, rng) {
  // からだにいいこと の文はカテゴリ共通だと食材を特定できないので、
  // 個別記事のある食材だけを対象にする（呼び出し側でも絞るが、ここでも守る）
  if (info.source !== "item") return null;
  const others = nameDistractors(target, pool, rng);
  if (others.length < 2) return null;
  const sentences = String(info.body).split("。").filter(Boolean).slice(0, 2).join("。");
  const hint = (sentences ? `${sentences}。` : String(info.body)).split(target.name).join("○○○");
  const choices = shuffled([target.name, ...others], rng);
  return withFact({
    name: target.name, category: target.category, type: "bodyhint",
    q: `ヒント：体への はたらき…「${hint}」この たべものは なーんだ？`,
    choices,
    answer: choices.indexOf(target.name),
    explain: `正解は『${target.name}』！ 旬は「${info.season}」。${info.choose}`,
  }, factFromKnowledge(target.name, info, rng));
}

// ---- レア度クイズ（icons.js の RARITY から作る） ----
const TIER_LABEL = { ultra: "激レア", rare: "レア" };
const RARE_NAMES = CATALOG.flatMap(([, , names]) => names).filter((n) => rarityOf(n));
function rarityQuestion(target, pool, rng) {
  // 形その2: 「激レア（レア）の食材はどれ？」— たまに出す
  if (rng() < 0.4 && RARE_NAMES.length > 0) {
    const rareName = pick(RARE_NAMES, rng);
    const tier = rarityOf(rareName);
    const normals = shuffled(pool.filter((p) => !rarityOf(p.name) && p.name !== rareName), rng).slice(0, 2);
    if (normals.length >= 2) {
      const choices = shuffled([rareName, ...normals.map((p) => p.name)], rng);
      const info = knowledgeFor(rareName, rarityCategory(rareName) || "その他");
      return withFact({
        name: rareName, category: rarityCategory(rareName) || "その他", type: "rarity",
        q: `${TIER_LABEL[tier]}の 食材は どれ？`,
        choices,
        answer: choices.indexOf(rareName),
        explain: `『${rareName}』は${TIER_LABEL[tier]}！ 図鑑で金色のわくが付く、特別な食材だよ。`,
      }, factFromKnowledge(rareName, info, rng));
    }
  }
  // 形その1: 「○○はどのくらいめずらしい？」
  const tier = rarityOf(target.name);
  const label = tier ? TIER_LABEL[tier] : "ふつう";
  const choices = shuffled(["激レア", "レア", "ふつう"], rng);
  const info = knowledgeFor(target.name, target.category);
  const explain = tier === "ultra"
    ? `『${target.name}』は激レア！ なかなか出会えない、とっても特別な食材だよ。`
    : tier === "rare"
      ? `『${target.name}』はレア！ ちょっとめずらしい食材だよ。`
      : `『${target.name}』はふつうの食材。スーパーでよく出会える、毎日の食卓の味方だよ。`;
  return withFact({
    name: target.name, category: target.category, type: "rarity",
    q: `図鑑で ${target.name} は どのくらい めずらしい？`,
    choices,
    answer: choices.indexOf(label),
    explain,
  }, factFromKnowledge(target.name, info, rng));
}

// ---- 仲間分けクイズ（カテゴリから作る） ----
function categoryQuestion(pool, rng) {
  const byCat = new Map();
  for (const p of pool) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category).push(p);
  }
  const cats = shuffled([...byCat.entries()].filter(([, v]) => v.length >= 2).map(([k]) => k), rng);
  for (const cat of cats) {
    const pair = shuffled(byCat.get(cat), rng).slice(0, 2);
    const outsiders = shuffled(pool.filter((p) => p.category !== cat), rng);
    if (!outsiders.length) continue;
    const odd = outsiders[0];
    const choices = shuffled([...pair.map((p) => p.name), odd.name], rng);
    const info = knowledgeFor(odd.name, odd.category);
    return withFact({
      name: odd.name, category: odd.category, type: "category",
      q: `なかまはずれは どれ？（ひとつだけ ちがう なかまだよ）`,
      choices,
      answer: choices.indexOf(odd.name),
      explain: `${pair.map((p) => p.name).join("と")}は『${cat}』のなかま。${odd.name}は『${odd.category}』のなかまだよ。`,
    }, factFromKnowledge(odd.name, info, rng));
  }
  return null;
}

// ---- 郷土料理クイズ（recipes.js の地域データから作る） ----
const REGIONAL_RECIPE_BY_ID = new Map(
  [...ALL_RECIPES, ...EVENT_RECIPES, ...REGIONAL_RECIPES, ...REGIONAL_RECIPES_MORE].map((r) => [r.id, r]),
);
/** 地域クイズの出題プール: [{ region, recipe }]（由来メモのある料理だけ） */
export const REGIONAL_QUIZ_POOL = REGIONS.flatMap((region) =>
  region.dishes
    .map((id) => REGIONAL_RECIPE_BY_ID.get(id))
    .filter((recipe) => recipe && typeof recipe.note === "string" && recipe.note.length >= 15)
    .map((recipe) => ({ region, recipe })),
);
function regionalQuestion(rng) {
  if (REGIONAL_QUIZ_POOL.length === 0 || REGIONS.length < 3) return null;
  const { region, recipe } = pick(REGIONAL_QUIZ_POOL, rng);
  const others = shuffled(REGIONS.filter((r) => r.id !== region.id).map((r) => r.name), rng).slice(0, 2);
  const choices = shuffled([region.name, ...others], rng);
  const mainIng = recipe.ingredients && recipe.ingredients[0];
  return withFact({
    name: mainIng ? mainIng.name : recipe.title, category: "郷土料理", type: "regional",
    dishTitle: recipe.title, regionName: region.name,
    q: `『${recipe.title}』は どこの 地域の 名物？`,
    choices,
    answer: choices.indexOf(region.name),
    explain: `${recipe.title}は${region.name}の名物だよ。${recipe.note}`,
  }, region.intro);
}

// ---- 都道府県クイズ（REGIONAL_PREF と各レシピの pref から作る） ----
const prefOf = (recipe) => recipe.pref || REGIONAL_PREF[recipe.id] || null;
/** 都道府県クイズの出題プール: [{ recipe, pref }]（由来メモのある料理だけ） */
export const PREF_QUIZ_POOL = [...REGIONAL_RECIPE_BY_ID.values()]
  .filter((r) => prefOf(r) && typeof r.note === "string" && r.note.length >= 15)
  .map((recipe) => ({ recipe, pref: prefOf(recipe) }));
const PREF_LIST = [...new Set(PREF_QUIZ_POOL.map((e) => e.pref))];
/** 都道府県 → 地域名（近い県を間違い役に優先するため） */
const REGION_OF_PREF = new Map();
for (const region of REGIONS) {
  for (const id of region.dishes) {
    const recipe = REGIONAL_RECIPE_BY_ID.get(id);
    const pref = recipe && prefOf(recipe);
    if (pref && !REGION_OF_PREF.has(pref)) REGION_OF_PREF.set(pref, region.name);
  }
}
function prefDistractors(pref, rng, count = 2) {
  const regionName = REGION_OF_PREF.get(pref);
  const sameRegion = shuffled(PREF_LIST.filter((p) => p !== pref && REGION_OF_PREF.get(p) === regionName), rng);
  const others = shuffled(PREF_LIST.filter((p) => p !== pref && REGION_OF_PREF.get(p) !== regionName), rng);
  return [...sameRegion, ...others].slice(0, count);
}
function prefectureQuestion(rng) {
  if (PREF_QUIZ_POOL.length === 0 || PREF_LIST.length < 3) return null;
  const { recipe, pref } = pick(PREF_QUIZ_POOL, rng);
  const others = prefDistractors(pref, rng);
  if (others.length < 2) return null;
  const choices = shuffled([pref, ...others], rng);
  const mainIng = recipe.ingredients && recipe.ingredients[0];
  return withFact({
    name: mainIng ? mainIng.name : recipe.title, category: "郷土料理", type: "prefecture",
    dishTitle: recipe.title, prefName: pref,
    q: `『${recipe.title}』は どこの 都道府県の 名物？`,
    choices,
    answer: choices.indexOf(pref),
    explain: `${recipe.title}は${pref}の名物だよ。`,
  }, recipe.note);
}
function prefDishQuestion(rng) {
  if (PREF_QUIZ_POOL.length === 0) return null;
  const byPref = new Map();
  for (const e of PREF_QUIZ_POOL) {
    if (!byPref.has(e.pref)) byPref.set(e.pref, []);
    byPref.get(e.pref).push(e.recipe);
  }
  const prefs = shuffled([...byPref.keys()], rng);
  for (const pref of prefs) {
    const recipe = pick(byPref.get(pref), rng);
    const otherPrefs = prefDistractors(pref, rng, 6);
    const others = [];
    for (const op of otherPrefs) {
      const cand = pick(byPref.get(op) || [], rng);
      if (cand && cand.title !== recipe.title && !others.includes(cand.title)) others.push(cand.title);
      if (others.length >= 2) break;
    }
    if (others.length < 2) continue;
    const choices = shuffled([recipe.title, ...others], rng);
    const mainIng = recipe.ingredients && recipe.ingredients[0];
    return withFact({
      name: mainIng ? mainIng.name : recipe.title, category: "郷土料理", type: "prefdish",
      dishTitle: recipe.title, prefName: pref,
      q: `${pref}の 名物は どれ？`,
      choices,
      answer: choices.indexOf(recipe.title),
      explain: `${recipe.title}は${pref}の名物だよ。`,
    }, recipe.note);
  }
  return null;
}

// ---- レシピクイズ（全レシピの材料から作る） ----
const ALL_RECIPE_POOL = [...REGIONAL_RECIPE_BY_ID.values()]
  .filter((r) => Array.isArray(r.ingredients) && r.ingredients.length >= 1);
/** 食材名 → カテゴリ（カタログ由来。レシピの材料のカテゴリ判定に使う） */
const CATEGORY_OF = new Map();
for (const [, category, names] of CATALOG) {
  for (const n of names) CATEGORY_OF.set(n, rarityCategory(n) || category);
}
for (const r of ALL_RECIPE_POOL) {
  for (const ing of r.ingredients) {
    if (!CATEGORY_OF.has(ing.name)) CATEGORY_OF.set(ing.name, "その他");
  }
}
const INGREDIENT_UNIVERSE = [...CATEGORY_OF.keys()];
/** そのレシピに「入らない」食材かどうか（材料名とマッチ語の両方で判定） */
function isInRecipe(recipe, name) {
  return recipe.ingredients.some((ing) =>
    ing.name === name || (Array.isArray(ing.match) && ing.match.includes(name)));
}
function recipeFact(recipe, fallbackName, fallbackCategory, rng) {
  if (recipe.note) return recipe.note;
  if (recipe.tip) return `作るときのコツ：${recipe.tip}`;
  const info = knowledgeFor(fallbackName, fallbackCategory);
  return factFromKnowledge(fallbackName, info, rng);
}
function recipeInQuestion(rng) {
  const withIngs = ALL_RECIPE_POOL.filter((r) => r.ingredients.length >= 1);
  if (!withIngs.length) return null;
  const recipe = pick(withIngs, rng);
  const correct = pick(recipe.ingredients, rng).name;
  const cat = CATEGORY_OF.get(correct) || "その他";
  const sameCat = shuffled(INGREDIENT_UNIVERSE.filter((n) => n !== correct && CATEGORY_OF.get(n) === cat && !isInRecipe(recipe, n)), rng);
  const otherCat = shuffled(INGREDIENT_UNIVERSE.filter((n) => n !== correct && CATEGORY_OF.get(n) !== cat && !isInRecipe(recipe, n)), rng);
  const others = [...sameCat, ...otherCat].slice(0, 2);
  if (others.length < 2) return null;
  const choices = shuffled([correct, ...others], rng);
  return withFact({
    name: correct, category: cat, type: "recipein",
    dishTitle: recipe.title,
    q: `『${recipe.title}』に 入る 食材は どれ？`,
    choices,
    answer: choices.indexOf(correct),
    explain: `${recipe.title}には${correct}が入るよ。入る食材は ${recipe.ingredients.map((i) => i.name).join("・")}だよ。`,
  }, recipeFact(recipe, correct, cat, rng));
}
function recipeOutQuestion(rng) {
  const withIngs = ALL_RECIPE_POOL.filter((r) => r.ingredients.length >= 2);
  if (!withIngs.length) return null;
  const recipe = pick(withIngs, rng);
  const inNames = shuffled(recipe.ingredients.map((i) => i.name), rng).slice(0, 2);
  if (inNames.length < 2) return null;
  // 入らない食材は、レシピの材料と同じカテゴリから優先（ありそうで入らない、が面白い）
  const inCats = new Set(inNames.map((n) => CATEGORY_OF.get(n) || "その他"));
  const sameCat = shuffled(INGREDIENT_UNIVERSE.filter((n) => !isInRecipe(recipe, n) && inCats.has(CATEGORY_OF.get(n) || "その他")), rng);
  const otherCat = shuffled(INGREDIENT_UNIVERSE.filter((n) => !isInRecipe(recipe, n) && !inCats.has(CATEGORY_OF.get(n) || "その他")), rng);
  const correct = [...sameCat, ...otherCat][0];
  if (!correct) return null;
  const choices = shuffled([correct, ...inNames], rng);
  const mainIng = recipe.ingredients[0];
  return withFact({
    name: mainIng.name, category: CATEGORY_OF.get(mainIng.name) || "その他", type: "recipeout",
    dishTitle: recipe.title,
    q: `『${recipe.title}』に 入らない 食材は どれ？`,
    choices,
    answer: choices.indexOf(correct),
    explain: `${recipe.title}に入るのは ${recipe.ingredients.map((i) => i.name).join("・")}だよ。${correct}は入らないよ。`,
  }, recipeFact(recipe, mainIng.name, CATEGORY_OF.get(mainIng.name) || "その他", rng));
}

// ---- イベント料理クイズ（EVENT_MENUS から作る） ----
const EVENTS_OF_RECIPE = new Map();
for (const ev of EVENT_MENUS) {
  for (const id of ev.dishes) {
    if (!EVENTS_OF_RECIPE.has(id)) EVENTS_OF_RECIPE.set(id, []);
    EVENTS_OF_RECIPE.get(id).push(ev);
  }
}
/** 1つの行事にだけ属する料理（「どの行事のごちそう？」が一意に決まるもの） */
const SINGLE_EVENT_DISHES = [...EVENTS_OF_RECIPE.entries()]
  .filter(([, evs]) => evs.length === 1)
  .map(([id, evs]) => ({ recipe: REGIONAL_RECIPE_BY_ID.get(id), event: evs[0] }))
  .filter((e) => e.recipe);
function eventDishQuestion(rng) {
  if (SINGLE_EVENT_DISHES.length === 0 || EVENT_MENUS.length < 3) return null;
  // 形その2: 「○○（行事）の料理はどれ？」— たまに出す
  if (rng() < 0.4) {
    const { event } = pick(SINGLE_EVENT_DISHES, rng);
    const ownTitles = event.dishes.map((id) => REGIONAL_RECIPE_BY_ID.get(id)).filter(Boolean);
    if (ownTitles.length) {
      const recipe = pick(ownTitles, rng);
      const otherEvents = shuffled(EVENT_MENUS.filter((e) => e.id !== event.id), rng);
      const others = [];
      for (const oe of otherEvents) {
        const cand = oe.dishes.map((id) => REGIONAL_RECIPE_BY_ID.get(id)).filter(Boolean)
          .find((r) => r.title !== recipe.title && !event.dishes.includes(r.id));
        if (cand && !others.includes(cand.title)) others.push(cand.title);
        if (others.length >= 2) break;
      }
      if (others.length >= 2) {
        const choices = shuffled([recipe.title, ...others], rng);
        const mainIng = recipe.ingredients && recipe.ingredients[0];
        return withFact({
          name: mainIng ? mainIng.name : recipe.title, category: "イベント料理", type: "eventdish",
          dishTitle: recipe.title, eventName: event.name,
          q: `${event.name}（${event.when}）に 食べる 料理は どれ？`,
          choices,
          answer: choices.indexOf(recipe.title),
          explain: `『${recipe.title}』は${event.name}の料理だよ。`,
        }, event.note);
      }
    }
  }
  // 形その1: 「『○○』はどの行事のごちそう？」
  const { recipe, event } = pick(SINGLE_EVENT_DISHES, rng);
  const others = shuffled(EVENT_MENUS.filter((e) => e.id !== event.id).map((e) => e.name), rng).slice(0, 2);
  const choices = shuffled([event.name, ...others], rng);
  const mainIng = recipe.ingredients && recipe.ingredients[0];
  return withFact({
    name: mainIng ? mainIng.name : recipe.title, category: "イベント料理", type: "eventdish",
    dishTitle: recipe.title, eventName: event.name,
    q: `『${recipe.title}』は どの 行事の ごちそう？`,
    choices,
    answer: choices.indexOf(event.name),
    explain: `『${recipe.title}』は${event.name}（${event.when}）のごちそうだよ。`,
  }, event.note);
}

/**
 * ゲームの問題を作る。
 * pool: [{ name, category }]（集めた食材を優先して渡す想定。重複は名前で除く）
 * count: 問題数（5 / 10 / 15 / 20 / 30 など）。プールが問題数より少なくても、
 *        食材を使い回して（違うタイプで）count 問そろえる。プールが空なら 0 問。
 * difficulty: "kids" | "family" | "adult"（出題タイプの顔ぶれが変わる）
 * types: 出題タイプを直接指定したいとき（difficulty より優先）
 * 同じラウンド内では、同じ問題（タイプ＋問題文＋選択肢）は二度出ない。
 * 戻り値: [{ name, category, type, q, choices[3], answer, explain, fact }]
 */
export function buildGameQuestions(pool, { count = GAME_QUESTION_COUNT, seed = 1, difficulty = GAME_DIFFICULTY_DEFAULT, types = null } = {}) {
  const rng = mulberry32(seed);
  const unique = [];
  const seen = new Set();
  for (const p of pool || []) {
    if (!p || !p.name || seen.has(p.name)) continue;
    seen.add(p.name);
    unique.push({ name: String(p.name), category: p.category || "その他" });
  }
  if (unique.length === 0) return [];
  const total = Math.max(1, Math.floor(count) || GAME_QUESTION_COUNT);
  const diff = GAME_DIFFICULTIES.find((d) => d.id === difficulty);
  const requested = (Array.isArray(types) && types.length) ? types : (diff ? diff.types : GAME_TYPES);
  const activeTypes = requested.filter((t) => GAME_TYPES.includes(t));
  const typeSet = activeTypes.length ? activeTypes : GAME_TYPES;

  // 食材ターゲットの順番（シャッフル済みキュー。一巡したら並び替える）
  let order = shuffled(unique, rng);
  let ptr = 0;
  const takeTarget = (pred = null) => {
    if (ptr >= order.length) { order = shuffled(unique, rng); ptr = 0; }
    for (let k = 0; k < order.length; k++) {
      const idx = (ptr + k) % order.length;
      const t = order[idx];
      if (!pred || pred(t)) { ptr = idx + 1; return t; }
    }
    return null;
  };
  const hasOwnKnowledge = (t) => Object.prototype.hasOwnProperty.call(KNOWLEDGE, t.name);
  const seasonable = (t) => {
    const b = seasonBucket(knowledgeFor(t.name, t.category).season);
    return b && b !== "一年中";
  };

  const genTarget = (type) => {
    // タイプに合う食材を優先して取る（無ければどれか1つ）
    let target = null;
    if (type === "bodyhint") target = takeTarget(hasOwnKnowledge);
    else if (type === "seasonfood") target = takeTarget(seasonable);
    if (!target) target = takeTarget();
    if (!target) return null;
    const info = knowledgeFor(target.name, target.category);
    switch (type) {
      case "season": return seasonQuestion(target, info, rng) || knowledgeQuestion(target, info, rng);
      case "name": return nameQuestion(target, info, unique, rng) || knowledgeQuestion(target, info, rng);
      case "nutrition": return nutritionQuestion(target, info, rng) || knowledgeQuestion(target, info, rng);
      case "choose": return chooseQuestion(target, info, unique, rng) || knowledgeQuestion(target, info, rng);
      case "seasonfood": return seasonFoodQuestion(target, info, unique, rng) || knowledgeQuestion(target, info, rng);
      case "trivia": return triviaQuestion(target, info, unique, rng) || knowledgeQuestion(target, info, rng);
      case "bodyhint": return bodyHintQuestion(target, info, unique, rng) || knowledgeQuestion(target, info, rng);
      case "rarity": return rarityQuestion(target, unique, rng);
      default: return knowledgeQuestion(target, info, rng);
    }
  };
  const gen = (type) => {
    switch (type) {
      case "regional": return regionalQuestion(rng);
      case "prefecture": return prefectureQuestion(rng);
      case "prefdish": return prefDishQuestion(rng);
      case "recipein": return recipeInQuestion(rng);
      case "recipeout": return recipeOutQuestion(rng);
      case "eventdish": return eventDishQuestion(rng);
      case "category": return categoryQuestion(unique, rng);
      default: return genTarget(type);
    }
  };

  const keyOf = (q) => `${q.type}|${q.q}|${q.choices.join("/")}`;
  const used = new Set();
  const usedNames = new Set();
  const questions = [];
  const rotation = shuffled(typeSet, rng);
  // 受け入れの優先度: プール内の食材で・名前も問題も初めての問題を最優先し、
  // 次にプール内の食材の新しい問題、次に新しい問題、最後は使い回し。
  // （クイズは手元の食材について出るのが基本。郷土料理などプール外の
  // 食材が主役の問題は、他に候補が無いときや長いラウンドで混ざる）
  const tierOf = (q) => {
    const freshKey = !used.has(keyOf(q));
    const inPool = seen.has(q.name);
    if (freshKey && inPool && !usedNames.has(q.name)) return 1;
    if (freshKey && inPool) return 2;
    if (freshKey) return 3;
    return 4;
  };
  for (let i = 0; i < total; i++) {
    const preferred = rotation[i % rotation.length];
    const tryOrder = [preferred, ...rotation.filter((t) => t !== preferred)];
    let best = null;
    let bestTier = Infinity;
    for (const type of tryOrder) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const q = gen(type);
        if (!q) continue;
        const tier = tierOf(q);
        if (tier < bestTier) { best = q; bestTier = tier; }
        if (bestTier === 1) break;
      }
      if (bestTier === 1) break;
    }
    if (!best) {
      best = genTarget("knowledge");
      if (!best) break;
    }
    used.add(keyOf(best));
    usedNames.add(best.name);
    questions.push(best);
  }
  return questions;
}

/**
 * 結果を集計する。results は正誤の配列（true = 正解）。
 * 戻り値: { correct, total, bestStreak, rate, message }
 */
export function scoreGame(results) {
  const flags = Array.isArray(results) ? results : [];
  let bestStreak = 0, streak = 0;
  for (const f of flags) {
    streak = f ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }
  const correct = flags.filter(Boolean).length;
  const total = flags.length;
  let message;
  if (total > 0 && correct === total) message = "パーフェクト！🎉 きみは 食材はかせ だね！";
  else if (total > 0 && correct / total >= 0.6) message = "すごい！ よくできたね！🎉";
  else message = "よくがんばったね！ 食材の『まなび』を読んで、もう一回チャレンジしよう！";
  return { correct, total, bestStreak, rate: total ? correct / total : 0, message };
}
