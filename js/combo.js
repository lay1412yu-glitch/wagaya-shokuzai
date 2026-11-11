// combo.js — 組み合わせ提案（テンプレート生成のレシピ提案）
//
// 外部 AI は使わない（API キーもサーバーも不要・端末内だけで完結）。
// 主食材 × 調理法 × 味付け × 形式（主菜／副菜／汁物／主食）のテンプレートを
// 組み合わせて、家庭料理として成立するレシピを生成する。
// 生成レシピは recipes.js と同じデータモデル（ingredients の
// name/match/per/unit、steps、genre/method/course）で返し、照合・分量換算・
// 消費順（FIFO）の評価は recipes.js の evaluateRecipe() をそのまま使う。
//
// 調味料の扱い（recipes.js の内蔵レシピの流儀に合わせる）:
// - 醤油・塩・砂糖・酒・みりん・油・酢・こしょう等の基本調味料は「常備品」
//   として材料リストには入れず、手順の中でのみ触れる。
// - 例外として、内蔵レシピでも材料として数える 味噌（味噌汁）と
//   チーズ（チーズ焼き）だけは材料に入れる。
//
// 消費順: 照合は lotsForIngredient（期限の近いロット→先に買ったロット）を
// 使い、evaluateRecipe の bonus（期限の近さの加点）で並べるため、
// 期限の近い主食材の組み合わせが先に来る。

import {
  evaluateRecipe, lotsForIngredient,
  ALL_RECIPES, EVENT_RECIPES, REGIONAL_RECIPES, REGIONAL_RECIPES_MORE,
} from "./recipes.js";

// ---------- 主食材辞書 ----------
// group: poultry 鶏 / meat 豚・牛・ひき肉 / processed ハム等 / fish 魚 /
// seafood えび・いか・貝 / egg 卵 / soy 豆腐・大豆 / vegLeafy 葉物 /
// vegRoot 根菜 / vegFruit 実野菜 / potato いも・かぼちゃ / mushroom きのこ
// short は料理名に使う短い呼び名（固定レシピの料理名と重ならない形にする）。
const M = (name, short, match, per, unit, group) => ({ name, short, match, per, unit, group });
export const COMBO_MAINS = [
  // 肉
  M("鶏もも肉", "鶏もも", ["鶏もも", "鶏肉", "とり肉"], 100, "g", "poultry"),
  M("鶏むね肉", "鶏むね", ["鶏むね", "むね肉", "鶏肉"], 100, "g", "poultry"),
  M("手羽元", "手羽元", ["手羽元", "鶏肉"], 2, "本", "poultry"),
  M("豚バラ肉", "豚バラ", ["豚バラ", "豚肉"], 100, "g", "meat"),
  M("豚こま肉", "豚こま", ["豚こま", "豚肉"], 100, "g", "meat"),
  M("豚ロース", "豚ロース", ["豚ロース", "豚肉"], 100, "g", "meat"),
  M("牛肉", "牛肉", ["牛肉"], 100, "g", "meat"),
  M("ひき肉", "ひき肉", ["ひき肉"], 75, "g", "meat"),
  M("ハム", "ハム", ["ハム"], 20, "g", "processed"),
  M("ベーコン", "ベーコン", ["ベーコン"], 20, "g", "processed"),
  M("ソーセージ", "ソーセージ", ["ソーセージ", "ウインナー"], 2, "本", "processed"),
  // 魚介
  M("鮭", "鮭", ["鮭", "さけ"], 1, "切れ", "fish"),
  M("さば", "さば", ["さば", "サバ"], 1, "切れ", "fish"),
  M("あじ", "あじ", ["あじ", "アジ"], 1, "切れ", "fish"),
  M("いわし", "いわし", ["いわし", "イワシ"], 1, "切れ", "fish"),
  M("さんま", "さんま", ["さんま", "サンマ"], 1, "切れ", "fish"),
  M("ぶり", "ぶり", ["ぶり", "ブリ"], 1, "切れ", "fish"),
  M("たら", "たら", ["たら", "タラ"], 1, "切れ", "fish"),
  M("まぐろ", "まぐろ", ["まぐろ", "マグロ"], 80, "g", "fish"),
  M("かつお", "かつお", ["かつお", "カツオ"], 80, "g", "fish"),
  M("かれい", "かれい", ["かれい", "カレイ"], 1, "切れ", "fish"),
  M("ほっけ", "ほっけ", ["ほっけ", "ホッケ"], 1, "切れ", "fish"),
  M("えび", "えび", ["えび", "エビ"], 4, "尾", "seafood"),
  M("いか", "いか", ["いか", "イカ"], 80, "g", "seafood"),
  M("たこ", "たこ", ["たこ", "タコ"], 50, "g", "seafood"),
  M("あさり", "あさり", ["あさり", "アサリ"], 80, "g", "seafood"),
  M("ほたて", "ほたて", ["ほたて", "ホタテ"], 2, "個", "seafood"),
  M("しらす", "しらす", ["しらす"], 20, "g", "seafood"),
  M("かに", "かに", ["かに", "カニ"], 50, "g", "seafood"),
  // 卵
  M("卵", "卵", ["卵", "たまご"], 2, "個", "egg"),
  M("うずら卵", "うずら卵", ["うずら"], 3, "個", "egg"),
  // 豆腐・大豆
  M("豆腐", "豆腐", ["豆腐"], 0.5, "丁", "soy"),
  M("厚揚げ", "厚揚げ", ["厚揚げ"], 0.5, "枚", "soy"),
  M("油揚げ", "油揚げ", ["油揚げ"], 1, "枚", "soy"),
  M("納豆", "納豆", ["納豆"], 1, "パック", "soy"),
  M("高野豆腐", "高野豆腐", ["高野豆腐"], 1, "個", "soy"),
  M("こんにゃく", "こんにゃく", ["こんにゃく"], 0.5, "枚", "soy"),
  // 野菜・葉物
  M("白菜", "白菜", ["白菜"], 0.125, "玉", "vegLeafy"),
  M("キャベツ", "キャベツ", ["キャベツ"], 60, "g", "vegLeafy"),
  M("レタス", "レタス", ["レタス"], 40, "g", "vegLeafy"),
  M("ほうれん草", "ほうれん草", ["ほうれん草"], 0.5, "束", "vegLeafy"),
  M("小松菜", "小松菜", ["小松菜"], 0.5, "束", "vegLeafy"),
  M("もやし", "もやし", ["もやし"], 0.5, "袋", "vegLeafy"),
  M("チンゲン菜", "チンゲン菜", ["チンゲン菜"], 1, "株", "vegLeafy"),
  M("水菜", "水菜", ["水菜"], 40, "g", "vegLeafy"),
  M("春菊", "春菊", ["春菊"], 0.5, "束", "vegLeafy"),
  M("豆苗", "豆苗", ["豆苗"], 0.5, "パック", "vegLeafy"),
  M("にら", "にら", ["にら", "ニラ"], 0.5, "束", "vegLeafy"),
  // 野菜・根菜
  M("にんじん", "にんじん", ["にんじん", "人参"], 0.5, "本", "vegRoot"),
  M("玉ねぎ", "玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個", "vegRoot"),
  M("大根", "大根", ["大根", "だいこん"], 80, "g", "vegRoot"),
  M("ごぼう", "ごぼう", ["ごぼう"], 0.3, "本", "vegRoot"),
  M("レンコン", "レンコン", ["レンコン", "れんこん"], 60, "g", "vegRoot"),
  M("かぶ", "かぶ", ["かぶ"], 1, "個", "vegRoot"),
  M("里芋", "里芋", ["里芋"], 2, "個", "vegRoot"),
  M("長芋", "長芋", ["長芋", "山芋"], 80, "g", "vegRoot"),
  M("長ねぎ", "ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本", "vegRoot"),
  // 野菜・実野菜
  M("トマト", "トマト", ["トマト"], 1, "個", "vegFruit"),
  M("きゅうり", "きゅうり", ["きゅうり"], 1, "本", "vegFruit"),
  M("なす", "なす", ["なす", "ナス"], 1, "本", "vegFruit"),
  M("ピーマン", "ピーマン", ["ピーマン"], 2, "個", "vegFruit"),
  M("パプリカ", "パプリカ", ["パプリカ"], 0.5, "個", "vegFruit"),
  M("とうもろこし", "とうもろこし", ["とうもろこし", "コーン"], 0.5, "本", "vegFruit"),
  M("ブロッコリー", "ブロッコリー", ["ブロッコリー"], 60, "g", "vegFruit"),
  M("アスパラガス", "アスパラ", ["アスパラ"], 3, "本", "vegFruit"),
  M("オクラ", "オクラ", ["オクラ"], 4, "本", "vegFruit"),
  M("枝豆", "枝豆", ["枝豆"], 50, "g", "vegFruit"),
  M("ズッキーニ", "ズッキーニ", ["ズッキーニ"], 0.5, "本", "vegFruit"),
  M("セロリ", "セロリ", ["セロリ"], 0.5, "本", "vegFruit"),
  M("ゴーヤ", "ゴーヤ", ["ゴーヤ"], 0.5, "本", "vegFruit"),
  // いも・かぼちゃ
  M("じゃがいも", "じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個", "potato"),
  M("さつまいも", "さつまいも", ["さつまいも"], 0.5, "本", "potato"),
  M("かぼちゃ", "かぼちゃ", ["かぼちゃ"], 80, "g", "potato"),
  // きのこ
  M("しいたけ", "しいたけ", ["しいたけ"], 2, "個", "mushroom"),
  M("しめじ", "しめじ", ["しめじ"], 0.5, "パック", "mushroom"),
  M("えのき", "えのき", ["えのき"], 0.5, "袋", "mushroom"),
  M("エリンギ", "エリンギ", ["エリンギ"], 1, "本", "mushroom"),
  M("まいたけ", "まいたけ", ["まいたけ"], 0.5, "パック", "mushroom"),
  M("マッシュルーム", "マッシュルーム", ["マッシュルーム"], 3, "個", "mushroom"),
];

// ---------- 付け合わせ（パートナー食材） ----------
// パターン側のプールから選ぶ。在庫にあるものを優先し、無い場合は
// stock モードでは付けず（単品で成立）、shop モードでは買い足し候補にする。
const P = (name, match, per, unit) => ({ name, match, per, unit });
export const COMBO_PARTNERS = Object.fromEntries([
  P("玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"),
  P("にんじん", ["にんじん", "人参"], 0.3, "本"),
  P("ピーマン", ["ピーマン"], 1, "個"),
  P("キャベツ", ["キャベツ"], 50, "g"),
  P("もやし", ["もやし"], 0.5, "袋"),
  P("長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"),
  P("ほうれん草", ["ほうれん草"], 0.5, "束"),
  P("なす", ["なす", "ナス"], 1, "本"),
  P("しめじ", ["しめじ"], 0.5, "パック"),
  P("えのき", ["えのき"], 0.5, "袋"),
  P("油揚げ", ["油揚げ"], 1, "枚"),
  P("厚揚げ", ["厚揚げ"], 0.5, "枚"),
  P("豆腐", ["豆腐"], 0.25, "丁"),
  P("ハム", ["ハム"], 15, "g"),
  P("ベーコン", ["ベーコン"], 15, "g"),
  P("卵", ["卵", "たまご"], 1, "個"),
  P("にら", ["にら", "ニラ"], 0.5, "束"),
  P("トマト", ["トマト"], 0.5, "個"),
  P("白菜", ["白菜"], 0.125, "玉"),
  P("小松菜", ["小松菜"], 0.5, "束"),
  P("わかめ", ["わかめ"], 2, "g"),
].map((p) => [p.name, p]));

const POOL_MEAT = ["玉ねぎ", "ピーマン", "キャベツ", "もやし", "長ねぎ", "ほうれん草", "にんじん", "なす"];
const POOL_FISH = ["玉ねぎ", "キャベツ", "長ねぎ", "ほうれん草", "しめじ", "えのき", "にんじん"];
const POOL_SOUP = ["豆腐", "わかめ", "玉ねぎ", "にんじん", "長ねぎ"];
const POOL_RICE = ["長ねぎ", "にんじん", "ピーマン"];

// パターンの材料にだけ入れる追加食材（基本調味料は入れない流儀の例外）
const EXTRA_MISO = { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" };
const EXTRA_CHEESE = { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" };

// ---------- 手順テンプレート（調理法ごと） ----------
// m = 主食材の短い名、s = パートナー名（無い場合は null）、season = 味付けの説明
const STEP_BUILDERS = {
  yaku: (pt, m, s) => [
    `${m}は食べやすい大きさに切る`,
    s ? `${s}も切って、焼く直前に添える分を用意する` : `${pt.season}で下味をつける`,
    `フライパン（またはグリル）で${m}の両面をこんがり焼く`,
    s ? `${s}と盛り合わせ、${pt.season}の味で仕上げる` : "焼き色がついたら火を止めて盛り付ける",
  ],
  itame: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    "フライパンに油を熱し、火の通りにくいものから炒める",
    `${pt.season}で手早く味付けする`,
  ],
  niru: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    `鍋にだし（または水）と${pt.season}を入れ、${m}を煮る`,
    "火が通ったら弱火で数分煮て、味をなじませる",
  ],
  musu: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    `フライパンか蒸し器に並べ、酒をふってふたをし、蒸し焼きにする`,
    `火が通ったら${pt.season}で仕上げる`,
  ],
  ageru: (pt, m, s) => [
    `${m}は食べやすい大きさに切り、水分を拭く`,
    "片栗粉（または小麦粉）を薄くまぶす",
    `多めの油でカラッと揚げ焼きにし、${pt.season}で仕上げる`,
  ],
  ae: (pt, m, s) => [
    `${m}は食べやすい大きさに切る`,
    `${m}をさっとゆでる（または塩もみする）`,
    `水気をよく絞り、${pt.season}で和える`,
  ],
  salad: (pt, m, s) => [
    `${m}は食べやすい大きさに切る`,
    "必要ならさっとゆでて、よく冷ます",
    `器に盛り、${pt.season}をかける`,
  ],
  soup: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    `鍋に水と${m}を入れて煮る`,
    `${pt.season}で味を整える（沸騰させすぎない）`,
  ],
  chahan: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は細かく切る`,
    "フライパンで具材を炒め、温かいごはんを加える",
    "強火でパラッと炒め、塩こしょうと醤油で仕上げる",
  ],
  don: (pt, m, s) => [
    `${m}は食べやすい大きさに切る`,
    `${pt.season}で焼き（煮）付ける`,
    "温かいごはんにのせて完成",
  ],
  pasta: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    "パスタをゆで、その間に具材を炒める",
    `ゆで上がったパスタと合わせ、${pt.season}で仕上げる`,
  ],
  udon: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は食べやすい大きさに切る`,
    `だしで${m}を煮て、うどんを加える`,
    "うどんが温まったら、醤油と塩で味を整える",
  ],
  zosui: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は小さめに切る`,
    `だしで${m}を煮て、ごはんを加える`,
    "溶き卵を回し入れてふたをし、蒸らして完成",
  ],
};

// ---------- パターン（調理法 × 味付け × 形式） ----------
// titleSolo / titleWith は料理名の生成関数。料理名には主食材の短い名が
// 必ず入るため、（主食材 × パターン）ごとに料理名は一意になる。
const T = (key, course, genre, method, cook, groups, season, minutes, titleSolo, opt = {}) =>
  ({ key, course, genre, method, cook, groups, season, minutes, titleSolo, ...opt });
export const COMBO_PATTERNS = [
  // ---- 主菜 ----
  T("teriyaki", "主菜", "和風", "焼く", "yaku", ["poultry", "meat", "fish", "seafood"], "醤油・みりん・砂糖のタレ", 20,
    (m) => `${m}の照り焼き`, { partner: POOL_MEAT }),
  T("shioyaki", "主菜", "和風", "焼く", "yaku", ["fish", "poultry", "meat"], "塩こしょう", 15,
    (m) => `${m}の塩焼き`),
  T("misoyaki", "主菜", "和風", "焼く", "yaku", ["fish", "poultry", "meat", "soy"], "味噌・みりんの味噌だれ", 20,
    (m) => `${m}の味噌焼き`),
  T("butter-yaki", "主菜", "洋風", "焼く", "yaku", ["fish", "seafood", "poultry", "meat", "mushroom", "potato", "vegFruit"], "バターと醤油", 15,
    (m) => `${m}のバター醤油焼き`),
  T("garlic-yaki", "主菜", "洋風", "焼く", "yaku", ["poultry", "meat", "seafood", "mushroom", "processed"], "にんにくと塩こしょう", 15,
    (m) => `${m}のガーリック焼き`),
  T("cheese-yaki", "主菜", "洋風", "焼く", "yaku", ["poultry", "meat", "processed", "vegFruit", "potato", "mushroom", "soy"], "とろけるチーズ", 15,
    (m) => `${m}のチーズ焼き`, { extra: [EXTRA_CHEESE] }),
  T("shio-itame", "主菜", "和風", "炒める", "itame", ["poultry", "meat", "fish", "seafood", "egg", "soy", "vegLeafy", "vegRoot", "vegFruit", "potato", "mushroom"], "塩こしょう", 15,
    (m) => `${m}の塩炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の塩炒め` }),
  T("miso-itame", "主菜", "和風", "炒める", "itame", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegRoot", "vegFruit", "mushroom"], "味噌・醤油・砂糖", 15,
    (m) => `${m}の味噌炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の味噌炒め` }),
  T("oyster-itame", "主菜", "中華", "炒める", "itame", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegFruit", "mushroom"], "オイスターソースと醤油", 15,
    (m) => `${m}のオイスター炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のオイスター炒め` }),
  T("ketchup-itame", "主菜", "洋風", "炒める", "itame", ["poultry", "meat", "processed", "seafood"], "ケチャップとソース", 15,
    (m) => `${m}のケチャップ炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のケチャップ炒め` }),
  T("chuka-itame", "主菜", "中華", "炒める", "itame", ["poultry", "meat", "seafood", "egg", "soy", "vegLeafy", "vegRoot", "vegFruit", "mushroom"], "中華だしと醤油", 15,
    (m) => `${m}の中華炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の中華炒め` }),
  T("curry-itame", "主菜", "洋風", "炒める", "itame", ["poultry", "meat", "seafood", "vegLeafy", "vegRoot", "vegFruit", "potato"], "カレー粉と塩こしょう", 15,
    (m) => `${m}のカレー炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のカレー炒め` }),
  T("shoyu-ni", "主菜", "和風", "煮る", "niru", ["poultry", "meat", "fish", "soy", "vegLeafy", "vegRoot", "potato"], "醤油・砂糖・酒", 30,
    (m) => `${m}の煮物`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の煮物` }),
  T("miso-ni", "主菜", "和風", "煮る", "niru", ["fish", "meat", "soy", "vegRoot", "vegFruit"], "味噌・砂糖・酒", 25,
    (m) => `${m}の味噌煮`, { partner: POOL_FISH }),
  T("tomato-ni", "主菜", "洋風", "煮る", "niru", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegRoot"], "トマトとコンソメ", 25,
    (m) => `${m}のトマト煮`, { partner: POOL_MEAT }),
  T("cream-ni", "主菜", "洋風", "煮る", "niru", ["poultry", "fish", "seafood", "vegLeafy", "potato", "mushroom"], "牛乳（または生クリーム）とコンソメ", 25,
    (m) => `${m}のクリーム煮`, { partner: POOL_MEAT }),
  T("ankake", "主菜", "中華", "煮る", "niru", ["fish", "seafood", "soy", "vegFruit", "vegLeafy"], "中華だしのあん（片栗粉でとろみ）", 20,
    (m) => `${m}のあんかけ`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のあんかけ` }),
  T("ponzu-mushi", "主菜", "和風", "蒸す", "musu", ["fish", "poultry", "meat", "seafood", "soy", "vegLeafy", "vegFruit"], "ポン酢", 20,
    (m) => `${m}のポン酢蒸し`, { partner: POOL_FISH, titleWith: (m, s) => `${m}と${s}のポン酢蒸し` }),
  T("chuka-mushi", "主菜", "中華", "蒸す", "musu", ["fish", "seafood", "poultry", "soy"], "ごま油と醤油の中華だれ", 20,
    (m) => `${m}の中華蒸し`),
  T("karaage", "主菜", "和風", "揚げる", "ageru", ["poultry", "meat", "seafood", "fish", "vegRoot", "potato"], "醤油と生姜の下味", 25,
    (m) => `${m}の唐揚げ風`),
  T("nanban", "主菜", "和風", "揚げる", "ageru", ["fish", "poultry", "seafood"], "酢・醤油・砂糖の南蛮酢", 25,
    (m) => `${m}の南蛮漬け`),
  T("dengaku", "主菜", "和風", "焼く", "yaku", ["vegFruit", "vegRoot", "soy"], "甘い味噌だれ", 20,
    (m) => `${m}の田楽`, { names: ["なす", "大根", "豆腐", "こんにゃく", "里芋", "厚揚げ"] }),
  // ---- 副菜 ----
  T("goma-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegRoot", "soy"], "すりごまと醤油・砂糖", 10,
    (m) => `${m}のごま和え`),
  T("miso-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit", "soy"], "味噌・砂糖・酢", 10,
    (m) => `${m}の味噌和え`),
  T("ponzu-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit", "mushroom", "seafood"], "ポン酢", 10,
    (m) => `${m}のポン酢和え`),
  T("sunomono", "副菜", "和風", "和える", "ae", ["vegFruit", "vegLeafy", "seafood"], "酢・砂糖・塩の甘酢", 10,
    (m) => `${m}の酢の物`),
  T("mayo-ae", "副菜", "洋風", "和える", "ae", ["vegFruit", "potato", "egg", "processed", "vegLeafy"], "マヨネーズと塩こしょう", 10,
    (m) => `${m}のマヨ和え`),
  T("salad", "副菜", "洋風", "サラダ", "salad", ["vegLeafy", "vegFruit", "egg", "processed", "seafood", "poultry"], "お好みのドレッシング", 10,
    (m) => `${m}サラダ`),
  T("namul", "副菜", "中華", "和える", "ae", ["vegLeafy", "vegFruit", "mushroom"], "ごま油と塩", 10,
    (m) => `${m}のナムル`),
  T("ohitashi", "副菜", "和風", "和える", "ae", ["vegLeafy", "mushroom"], "だし醤油", 10,
    (m) => `${m}のおひたし`),
  // ---- 汁物 ----
  T("misoshiru", "汁物", "和風", "スープ", "soup", ["vegLeafy", "vegRoot", "vegFruit", "potato", "soy", "seafood", "egg", "mushroom"], "味噌", 15,
    (m) => `${m}の味噌汁`, { partner: POOL_SOUP, extra: [EXTRA_MISO], titleWith: (m, s) => `${m}と${s}の味噌汁` }),
  T("consomme-soup", "汁物", "洋風", "スープ", "soup", ["vegLeafy", "vegRoot", "potato", "poultry", "meat", "processed", "egg", "mushroom"], "コンソメと塩こしょう", 15,
    (m) => `${m}のコンソメスープ`, { partner: POOL_SOUP, titleWith: (m, s) => `${m}と${s}のコンソメスープ` }),
  T("chuka-soup", "汁物", "中華", "スープ", "soup", ["vegLeafy", "vegFruit", "egg", "seafood", "soy", "mushroom"], "中華だしとごま油", 10,
    (m) => `${m}の中華スープ`, { partner: POOL_SOUP, titleWith: (m, s) => `${m}と${s}の中華スープ` }),
  T("milk-soup", "汁物", "洋風", "スープ", "soup", ["potato", "vegLeafy", "poultry", "seafood", "processed"], "牛乳とコンソメ", 15,
    (m) => `${m}のミルクスープ`, { partner: POOL_SOUP, titleWith: (m, s) => `${m}と${s}のミルクスープ` }),
  // ---- 主食 ----
  T("chahan", "主食", "中華", "炒める", "chahan", ["egg", "processed", "poultry", "meat", "seafood", "vegLeafy"], "塩こしょうと醤油", 15,
    (m) => `${m}チャーハン`, { partner: POOL_RICE }),
  T("don", "主食", "和風", "焼く", "don", ["poultry", "meat", "fish"], "醤油・みりんの照り焼きだれ", 20,
    (m) => `${m}の照り焼き丼`),
  T("pasta", "主食", "洋風", "炒める", "pasta", ["processed", "seafood", "mushroom", "vegLeafy", "vegFruit", "meat"], "醤油とバター（和風）", 20,
    (m) => `${m}の和風パスタ`, { partner: POOL_MEAT }),
  T("udon", "主食", "和風", "煮る", "udon", ["poultry", "meat", "egg", "vegLeafy", "vegRoot"], "だしと醤油", 20,
    (m) => `${m}の煮込みうどん`, { partner: POOL_SOUP }),
  T("zosui", "主食", "和風", "煮る", "zosui", ["egg", "poultry", "seafood", "mushroom", "vegLeafy", "soy"], "だしと塩", 15,
    (m) => `${m}の雑炊`, { partner: POOL_SOUP }),
];

export function patternsForMain(main) {
  return COMBO_PATTERNS.filter((pt) =>
    pt.groups.includes(main.group) && (!pt.names || pt.names.includes(main.name)));
}

// ---------- 生成空間の数え上げ ----------
// （主食材 × パターン）ごとに、代表パートナーで組み立てた料理名を数える。
// パートナー無し版や別のパートナー版も実際には生成されるので、
// ここで数えるのは控えめな下限。
export function enumerateComboSpace() {
  const out = [];
  for (const main of COMBO_MAINS) {
    for (const pt of patternsForMain(main)) {
      const canonicalPartner = pt.partner ? COMBO_PARTNERS[pt.partner[0]] : null;
      const title = pt.titleWith && canonicalPartner
        ? pt.titleWith(main.short, canonicalPartner.name)
        : pt.titleSolo(main.short);
      out.push({ id: `combo-${main.name}-${pt.key}`, title, main: main.name, pattern: pt.key, course: pt.course });
    }
  }
  return out;
}

export function comboSpaceSize() {
  return new Set(enumerateComboSpace().map((c) => c.title)).size;
}

// ---------- レパートリー総数（固定レシピは recipes.js の実データから数える） ----------
const FIXED_RECIPE_SETS = [ALL_RECIPES, EVENT_RECIPES, REGIONAL_RECIPES, REGIONAL_RECIPES_MORE];
export function fixedRecipeCount() {
  const ids = new Set();
  for (const set of FIXED_RECIPE_SETS) for (const r of set) ids.add(r.id);
  return ids.size;
}
export function repertoireSize() {
  const fixed = fixedRecipeCount();
  const generated = comboSpaceSize();
  return { fixed, generated, total: fixed + generated };
}
const FIXED_TITLES = new Set(FIXED_RECIPE_SETS.flatMap((set) => set.map((r) => r.title)));

// ---------- レシピの組み立て ----------
export function buildComboRecipe(main, pattern, partner = null) {
  const title = partner && pattern.titleWith
    ? pattern.titleWith(main.short, partner.name)
    : pattern.titleSolo(main.short);
  const ingredients = [
    { name: main.name, match: [...main.match], per: main.per, unit: main.unit },
    ...(pattern.extra || []).map((e) => ({ name: e.name, match: [...e.match], per: e.per, unit: e.unit })),
  ];
  if (partner) ingredients.push({ name: partner.name, match: [...partner.match], per: partner.per, unit: partner.unit });
  return {
    id: `combo-${main.name}-${pattern.key}`,
    title,
    minutes: pattern.minutes,
    genre: pattern.genre,
    method: pattern.method,
    course: pattern.course,
    ingredients,
    steps: STEP_BUILDERS[pattern.cook](pattern, main.short, partner ? partner.name : null),
    comboMain: main.name,
    comboPattern: pattern.key,
  };
}

// ---------- 決定的ハッシュ（ローテーション用。recipes.js の rotationJitter と同方式） ----------
function hashOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function jitter(id, key) {
  return (hashOf(`${id}|${key}`) % 90) / 100; // 0〜0.89。期限ボーナス（数点）より小さい
}

function todayLocalISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- 組み合わせ提案 ----------
// 在庫にある主食材から候補を生成し、evaluateRecipe で照合して並べる。
// - mode "stock": 買い足し 0 件のみ（パートナーは在庫にあるときだけ付ける）
// - mode "shop": 買い足し最大 2 件まで（パートナーや味噌・チーズが対象）
// - seedKey（日付＋更新回数）で候補の顔ぶれが決定的に変わる
// - excludeIds に渡した combo id は結果から除く（「別の提案を見る」の未表示分用）
export function suggestCombos(stockItems, { servings = 2, mode = "stock", limit = 6, seedKey = null, excludeIds = [] } = {}) {
  const today = todayLocalISO();
  const seed = seedKey ?? today;
  const exclude = new Set(excludeIds);
  const results = [];
  const seenTitles = new Set();
  for (const main of COMBO_MAINS) {
    // 主食材が在庫にあるか（消費順の先頭ロットまで含めて判定）
    if (lotsForIngredient(stockItems, main).length === 0) continue;
    for (const pt of patternsForMain(main)) {
      const base = buildComboRecipe(main, pt, null);
      if (exclude.has(base.id)) continue;
      // パートナー選び: 在庫にあるものを消費順に並べ、seed で決定的に選ぶ。
      // 無ければ stock は単品、shop は候補から買い足しとして付けることがある。
      let partner = null;
      if (pt.partner) {
        const inStock = pt.partner
          .map((name) => COMBO_PARTNERS[name])
          .filter((p) => p && p.name !== main.name && lotsForIngredient(stockItems, p).length > 0);
        if (inStock.length > 0) {
          partner = inStock[hashOf(`${seed}|${base.id}`) % inStock.length];
        } else if (mode === "shop" && hashOf(`${seed}|${base.id}|partner`) % 2 === 0) {
          const pool = pt.partner.map((name) => COMBO_PARTNERS[name]).filter((p) => p && p.name !== main.name);
          if (pool.length > 0) partner = pool[hashOf(`${seed}|${base.id}`) % pool.length];
        }
      }
      const recipe = partner ? buildComboRecipe(main, pt, partner) : base;
      if (FIXED_TITLES.has(recipe.title)) continue; // 固定レシピと同名は出さない
      if (seenTitles.has(recipe.title)) continue;
      const ev = evaluateRecipe(recipe, stockItems, servings, today);
      if (mode === "stock" && ev.missing.length > 0) continue;
      if (mode === "shop" && ev.missing.length > 2) continue;
      if (ev.have.length === 0) continue;
      seenTitles.add(recipe.title);
      results.push({
        ...ev,
        score: ev.have.length * 10 - ev.missing.length * 4 + ev.bonus + jitter(recipe.id, seed),
        _fifoKey: ev.earliestExpiry,
      });
    }
  }
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ea = a._fifoKey, eb = b._fifoKey;
    if (ea && eb) return ea < eb ? -1 : 1;
    if (ea) return -1;
    if (eb) return 1;
    return 0;
  });
  for (const r of results) delete r._fifoKey;
  return results.slice(0, limit);
}
