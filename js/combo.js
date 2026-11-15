// combo.js — 組み合わせ提案（テンプレート生成のレシピ提案）
//
// 外部 AI は使わない（API キーもサーバーも不要・端末内だけで完結）。
// 主食材 × 調理法 × 味付け × 形式（主菜／副菜／汁物／主食）のテンプレートを
// 組み合わせて、家庭料理として成立するレシピを生成する。
// 生成レシピは recipes.js と同じデータモデル（ingredients の
// name/match/per/unit、steps、genre/method/course）で返し、照合・分量換算・
// 消費順（FIFO）の評価は recipes.js の evaluateRecipe() をそのまま使う。
//
// 調味料の扱い（2026-11-15 Task CN で改定。ユーザー指摘「カレー粉、コンソメ
// とかいきなり出てくる」を受けたもの）:
// - 料理の味を決める調味料・食材（カレー粉・コンソメ・鶏ガラスープ・
//   だしの素・味噌・チーズ・ケチャップ・オイスターソース・ポン酢・バター・
//   牛乳・ごま油・片栗粉など）は、パターンの extra として分量つきで
//   材料リストに入れる。手順にだけ出て材料欄に無い状態にしない。
// - どの家庭にもある基本の8品（醤油・塩・砂糖・酒・みりん・酢・こしょう・
//   サラダ油）だけは「常備品」として材料リストには入れず、手順の中で
//   触れるに留める（分量の目安は手順文に比率・小さじ表記で示す）。
// - 米・ごはん・麺類（パスタ／うどん）・お好みのドレッシングも、料理の
//   形式そのものなので材料リストには入れない（常備の主食として扱う）。
//
// 消費順: 照合は lotsForIngredient（期限の近いロット→先に買ったロット）を
// 使い、evaluateRecipe の bonus（期限の近さの加点）で並べるため、
// 期限の近い主食材の組み合わせが先に来る。
//
// レパートリーの数え方（水増しなし）:
// enumerateComboSpace() は、生成器が実際に出せる「異なる料理名」を全部
// 数え上げる。主食材×パターンの単品名に加え、パートナー（付け合わせ）が
// 料理名に反映される場合はパートナー違いも別名として数える。逆に、
// 固定レシピと同名になる生成名は数えない（重複を避けるため）。

import {
  evaluateRecipe, lotsForIngredient,
  ALL_RECIPES, EVENT_RECIPES, REGIONAL_RECIPES, REGIONAL_RECIPES_MORE,
} from "./recipes.js";

// ---------- 固定レシピ（総数と同名回避用） ----------
const FIXED_RECIPE_SETS = [ALL_RECIPES, EVENT_RECIPES, REGIONAL_RECIPES, REGIONAL_RECIPES_MORE];
const FIXED_TITLES = new Set(FIXED_RECIPE_SETS.flatMap((set) => set.map((r) => r.title)));
export function fixedRecipeCount() {
  const ids = new Set();
  for (const set of FIXED_RECIPE_SETS) for (const r of set) ids.add(r.id);
  return ids.size;
}

// ---------- 主食材辞書 ----------
// group: poultry 鶏 / meat 豚・牛・ひき肉 / processed ハム等 / fish 魚 /
// seafood えび・いか・貝 / egg 卵 / soy 豆腐・大豆 / roe 魚卵 /
// seaweed 海藻 / vegLeafy 葉物 / vegRoot 根菜 / vegFruit 実野菜 /
// potato いも・かぼちゃ / mushroom きのこ / pantry 缶詰・乾物系 / fruit 果物
// short は料理名に使う短い呼び名（固定レシピの料理名と重ならない形にする）。
// only を付けた主食材は、そのパターンキーでしか生成しない（料理として
// 成立する範囲に絞るため）。
const M = (name, short, match, per, unit, group, only) => ({ name, short, match, per, unit, group, ...(only ? { only } : {}) });
export const COMBO_MAINS = [
  // 肉
  M("鶏もも肉", "鶏もも", ["鶏もも", "鶏肉", "とり肉"], 100, "g", "poultry"),
  M("鶏むね肉", "鶏むね", ["鶏むね", "むね肉", "鶏肉"], 100, "g", "poultry"),
  M("手羽元", "手羽元", ["手羽元", "鶏肉"], 2, "本", "poultry"),
  M("鶏レバー", "鶏レバー", ["鶏レバー", "レバー"], 80, "g", "poultry", ["shogayaki", "karaage", "miso-itame"]),
  M("砂肝", "砂肝", ["砂肝"], 80, "g", "poultry", ["shio-itame", "karaage", "ponzu-ae", "negi-shio"]),
  M("豚バラ肉", "豚バラ", ["豚バラ", "豚肉"], 100, "g", "meat"),
  M("豚こま肉", "豚こま", ["豚こま", "豚肉"], 100, "g", "meat"),
  M("豚ロース", "豚ロース", ["豚ロース", "豚肉"], 100, "g", "meat"),
  M("牛肉", "牛肉", ["牛肉"], 100, "g", "meat"),
  M("牛タン", "牛タン", ["牛タン", "タン"], 80, "g", "meat", ["shioyaki", "garlic-yaki", "negi-shio"]),
  M("ひき肉", "ひき肉", ["ひき肉"], 75, "g", "meat"),
  M("ハム", "ハム", ["ハム"], 20, "g", "processed"),
  M("ベーコン", "ベーコン", ["ベーコン"], 20, "g", "processed"),
  M("ソーセージ", "ソーセージ", ["ソーセージ", "ウインナー"], 2, "本", "processed"),
  M("かまぼこ", "かまぼこ", ["かまぼこ"], 30, "g", "processed", ["salad", "mayo-ae", "chuka-soup", "udon"]),
  M("ちくわ", "ちくわ", ["ちくわ"], 1, "本", "processed", ["cheese-yaki", "karaage", "shoyu-ni", "miso-itame"]),
  M("はんぺん", "はんぺん", ["はんぺん"], 0.5, "枚", "processed", ["butter-yaki", "cheese-yaki", "misoshiru", "shoyu-ni"]),
  M("さつま揚げ", "さつま揚げ", ["さつま揚げ"], 1, "枚", "processed", ["shioyaki", "miso-ni", "nabe-fu", "udon"]),
  M("生ハム", "生ハム", ["生ハム"], 25, "g", "processed", ["salad", "mayo-ae", "carpaccio"]),
  M("かにかま", "かにかま", ["かにかま", "カニかま"], 30, "g", "processed", ["salad", "mayo-ae", "chuka-soup", "sunomono"]),
  // 魚介
  M("鮭", "鮭", ["鮭", "さけ"], 1, "切れ", "fish"),
  M("さば", "さば", ["さば", "サバ"], 1, "切れ", "fish"),
  M("あじ", "あじ", ["あじ", "アジ"], 1, "切れ", "fish"),
  M("いわし", "いわし", ["いわし", "イワシ"], 1, "切れ", "fish"),
  M("さんま", "さんま", ["さんま", "サンマ"], 1, "切れ", "fish"),
  M("ぶり", "ぶり", ["ぶり", "ブリ"], 1, "切れ", "fish"),
  M("たら", "たら", ["たら", "タラ"], 1, "切れ", "fish"),
  M("まぐろ", "まぐろ", ["まぐろ", "マグロ", "本まぐろ"], 80, "g", "fish"),
  M("かつお", "かつお", ["かつお", "カツオ"], 80, "g", "fish"),
  M("かれい", "かれい", ["かれい", "カレイ"], 1, "切れ", "fish"),
  M("ほっけ", "ほっけ", ["ほっけ", "ホッケ"], 1, "切れ", "fish"),
  M("ししゃも", "ししゃも", ["ししゃも"], 3, "尾", "fish"),
  M("金目鯛", "金目鯛", ["金目鯛"], 1, "切れ", "fish"),
  M("のどぐろ", "のどぐろ", ["のどぐろ"], 1, "尾", "fish"),
  M("さわら", "さわら", ["さわら", "サワラ"], 1, "切れ", "fish"),
  M("たい", "たい", ["たい", "鯛", "真鯛"], 1, "切れ", "fish"),
  M("ます", "ます", ["ます", "鱒"], 1, "切れ", "fish"),
  M("ハタハタ", "ハタハタ", ["ハタハタ", "はたはた"], 2, "尾", "fish"),
  M("あゆ", "あゆ", ["あゆ"], 1, "尾", "fish", ["shioyaki"]),
  M("うなぎ", "うなぎ", ["うなぎ"], 0.5, "尾", "fish", ["teriyaki", "don", "chazuke"]),
  M("あんこう", "あんこう", ["あんこう"], 100, "g", "fish", ["misoshiru", "miso-ni", "shoyu-ni", "nabe-fu"]),
  M("サバ缶", "サバ缶", ["サバ缶", "さば缶"], 0.5, "缶", "fish", ["miso-ni", "shoyu-ni", "misoshiru", "tomato-ni", "salad", "curry-itame"]),
  M("ツナ缶", "ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶", "pantry", ["salad", "mayo-ae", "pasta", "chahan", "chuka-soup"]),
  M("えび", "えび", ["えび", "エビ", "甘えび"], 4, "尾", "seafood"),
  M("いか", "いか", ["いか", "イカ"], 80, "g", "seafood"),
  M("たこ", "たこ", ["たこ", "タコ"], 50, "g", "seafood"),
  M("あさり", "あさり", ["あさり", "アサリ"], 80, "g", "seafood"),
  M("ほたて", "ほたて", ["ほたて", "ホタテ"], 2, "個", "seafood"),
  M("しらす", "しらす", ["しらす"], 20, "g", "seafood"),
  M("かに", "かに", ["かに", "カニ", "毛ガニ", "ズワイガニ"], 50, "g", "seafood"),
  M("かき", "かき", ["かき", "牡蠣"], 4, "個", "seafood"),
  M("しじみ", "しじみ", ["しじみ"], 80, "g", "seafood", ["misoshiru"]),
  M("あん肝", "あん肝", ["あん肝"], 30, "g", "seafood", ["ponzu-ae"]),
  // 魚卵
  M("明太子", "明太子", ["明太子"], 0.5, "腹", "roe"),
  M("たらこ", "たらこ", ["たらこ"], 0.5, "腹", "roe"),
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
  M("がんもどき", "がんもどき", ["がんもどき"], 1, "個", "soy"),
  M("大豆", "大豆", ["大豆"], 40, "g", "soy"),
  M("しらたき", "しらたき", ["しらたき"], 50, "g", "soy", ["shoyu-ni", "sukiyaki-fu", "nabe-fu"]),
  // 海藻
  M("わかめ", "わかめ", ["わかめ"], 3, "g", "seaweed"),
  M("ひじき", "ひじき", ["ひじき"], 3, "g", "seaweed"),
  M("もずく", "もずく", ["もずく"], 50, "g", "seaweed", ["sunomono", "misoshiru", "ponzu-ae"]),
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
  M("モロヘイヤ", "モロヘイヤ", ["モロヘイヤ"], 0.5, "束", "vegLeafy"),
  M("こしあぶら", "こしあぶら", ["こしあぶら"], 30, "g", "vegLeafy", ["kakiage", "goma-ae", "ohitashi"]),
  M("たらの芽", "たらの芽", ["たらの芽"], 4, "個", "vegLeafy", ["kakiage", "goma-ae", "ohitashi"]),
  M("ふきのとう", "ふきのとう", ["ふきのとう"], 4, "個", "vegLeafy", ["kakiage", "miso-ae", "ohitashi"]),
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
  M("ミニトマト", "ミニトマト", ["ミニトマト"], 5, "個", "vegFruit"),
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
  M("絹さや", "絹さや", ["絹さや"], 8, "個", "vegFruit"),
  M("スナップエンドウ", "スナップエンドウ", ["スナップエンドウ"], 8, "個", "vegFruit"),
  M("そら豆", "そら豆", ["そら豆"], 6, "個", "vegFruit"),
  M("アボカド", "アボカド", ["アボカド"], 0.5, "個", "vegFruit"),
  M("みょうが", "みょうが", ["みょうが"], 2, "個", "vegFruit", ["ponzu-ae", "sunomono", "ume-ae", "goma-ae"]),
  M("栗", "栗", ["栗"], 4, "個", "vegFruit", ["takikomi", "shoyu-ni"]),
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
  M("なめこ", "なめこ", ["なめこ"], 0.5, "袋", "mushroom"),
  M("松茸", "松茸", ["松茸"], 0.5, "本", "mushroom", ["takikomi", "misoshiru", "hoiru", "zosui"]),
  M("じゅんさい", "じゅんさい", ["じゅんさい"], 30, "g", "seaweed", ["misoshiru", "sunomono", "ponzu-ae"]),
  // 缶詰・乾物系
  M("春雨", "春雨", ["春雨"], 20, "g", "pantry", ["chuka-soup", "salad", "mabofu", "shio-itame"]),
  M("コーン缶", "コーン", ["コーン缶", "とうもろこし"], 0.5, "缶", "pantry", ["salad", "butter-yaki", "consomme-soup", "chahan", "milk-soup"]),
  M("トマト缶", "トマト缶", ["トマト缶"], 100, "g", "pantry", ["tomato-ni", "consomme-soup"]),
  M("ミックスベジタブル", "ミックスベジタブル", ["ミックスベジタブル"], 50, "g", "pantry", ["consomme-soup", "chahan", "curry-itame", "salad"]),
  M("冷凍ポテト", "冷凍ポテト", ["冷凍ポテト"], 60, "g", "pantry", ["butter-yaki", "cheese-yaki", "consomme-soup"]),
  // 果物（サラダ・和え物専用）
  M("りんご", "りんご", ["りんご"], 0.5, "個", "fruit"),
  M("梨", "梨", ["梨", "なし"], 0.5, "個", "fruit"),
  M("柿", "柿", ["柿"], 0.5, "個", "fruit"),
  M("みかん", "みかん", ["みかん"], 1, "個", "fruit"),
  M("バナナ", "バナナ", ["バナナ"], 0.5, "本", "fruit"),
  M("キウイ", "キウイ", ["キウイ"], 0.5, "個", "fruit"),
  M("いちご", "いちご", ["いちご"], 3, "個", "fruit"),
  M("ぶどう", "ぶどう", ["ぶどう"], 30, "g", "fruit"),
  M("メロン", "メロン", ["メロン"], 0.125, "個", "fruit"),
  M("すいか", "すいか", ["すいか"], 100, "g", "fruit"),
  M("さくらんぼ", "さくらんぼ", ["さくらんぼ"], 30, "g", "fruit"),
  M("ブルーベリー", "ブルーベリー", ["ブルーベリー"], 20, "g", "fruit"),
  M("パイナップル", "パイナップル", ["パイナップル"], 50, "g", "fruit"),
  M("レモン", "レモン", ["レモン"], 0.25, "個", "fruit"),
  M("ゆず", "ゆず", ["ゆず"], 0.25, "個", "fruit"),
  M("夕張メロン", "夕張メロン", ["夕張メロン"], 0.125, "個", "fruit"),
  M("ルビーロマン", "ルビーロマン", ["ルビーロマン"], 30, "g", "fruit"),
  M("白いちご", "白いちご", ["白いちご"], 3, "個", "fruit"),
  M("デンスケすいか", "デンスケすいか", ["デンスケすいか"], 100, "g", "fruit"),
  M("太陽のタマゴ", "太陽のタマゴ", ["太陽のタマゴ"], 0.25, "個", "fruit"),
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

// パターンの材料にだけ入れる追加食材。味を決める調味料は分量つきで
// 材料化する（per は1人分。分量はキッコーマン／クックパッド等の標準的な
// 家庭レシピと、笠原将弘の黄金比（煮物は だし10：醤油1：みりん1）を目安に
// した。文面はすべて自作）。
const X = (name, match, per, unit) => ({ name, match, per, unit });
const EXTRA_MISO = X("味噌", ["味噌", "みそ"], 1.5, "大さじ"); // 味噌汁用（汁物は濃いめ）
const EXTRA_MISO_SIDE = X("味噌", ["味噌", "みそ"], 0.5, "大さじ"); // 炒め・和え・焼き用
const EXTRA_MISO_NI = X("味噌", ["味噌", "みそ"], 1, "大さじ"); // 味噌煮用（キッコーマン: 2人分 大さじ2〜3）
const EXTRA_CHEESE = X("チーズ", ["チーズ"], 15, "g");
const EXTRA_EGG = X("卵", ["卵", "たまご"], 1, "個");
const EXTRA_CURRY_TBS = X("カレー粉", ["カレー粉", "カレールー"], 0.5, "大さじ"); // 煮物用（2人分 大さじ1）
const EXTRA_CURRY_TSP = X("カレー粉", ["カレー粉", "カレールー"], 1, "小さじ"); // 炒め用（香りづけ）
const EXTRA_CONSOMME = X("コンソメ", ["コンソメ"], 1, "小さじ");
const EXTRA_DASHI = X("だしの素", ["だしの素", "だし"], 0.5, "小さじ"); // 水・だし200mlあたり
const EXTRA_TORIGARA = X("鶏ガラスープ", ["鶏ガラスープ", "鶏ガラ"], 1, "小さじ");
const EXTRA_TORIGARA_HALF = X("鶏ガラスープ", ["鶏ガラスープ", "鶏ガラ"], 0.5, "小さじ");
const EXTRA_KATAKURI = X("片栗粉", ["片栗粉"], 1, "大さじ"); // 衣用
const EXTRA_KATAKURI_HALF = X("片栗粉", ["片栗粉"], 0.5, "大さじ"); // あん・漬け用
const EXTRA_BUTTER = X("バター", ["バター"], 10, "g");
const EXTRA_MILK = X("牛乳", ["牛乳"], 100, "mL");
const EXTRA_KETCHUP = X("ケチャップ", ["ケチャップ"], 1, "大さじ");
const EXTRA_KETCHUP_BIG = X("ケチャップ", ["ケチャップ"], 1.5, "大さじ");
const EXTRA_SAUCE = X("ソース", ["ソース", "ウスターソース"], 1, "大さじ");
const EXTRA_SAUCE_HALF = X("ソース", ["ソース", "ウスターソース"], 0.5, "大さじ");
const EXTRA_OYSTER = X("オイスターソース", ["オイスターソース"], 0.5, "大さじ");
const EXTRA_PONZU = X("ポン酢", ["ポン酢"], 1, "大さじ");
const EXTRA_GOMAABURA = X("ごま油", ["ごま油"], 1, "小さじ");
const EXTRA_GOMA = X("ごま", ["ごま"], 0.5, "大さじ");
const EXTRA_NORI = X("海苔", ["海苔", "のり"], 0.5, "枚");
const EXTRA_SHOGA = X("しょうが", ["しょうが", "生姜"], 5, "g");
const EXTRA_NINNIKU = X("にんにく", ["にんにく", "ニンニク"], 5, "g");
const EXTRA_NINNIKU_SMALL = X("にんにく", ["にんにく", "ニンニク"], 3, "g");
const EXTRA_LEMON = X("レモン", ["レモン"], 0.25, "個");
const EXTRA_OLIVE = X("オリーブオイル", ["オリーブオイル"], 0.5, "大さじ");
const EXTRA_TOMATO = X("トマト", ["トマト"], 1, "個");
const EXTRA_DAIKON = X("大根", ["大根", "だいこん"], 80, "g");
const EXTRA_NEGI = X("長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本");
const EXTRA_UMEBOSHI = X("梅干し", ["梅干し"], 1, "個");
const EXTRA_WASABI = X("わさび", ["わさび"], 0.5, "小さじ");
const EXTRA_SHIOKONBU = X("塩昆布", ["塩昆布"], 3, "g");
const EXTRA_TENMEN = X("甜麺醤", ["甜麺醤"], 0.5, "大さじ");
const EXTRA_MAYO = X("マヨネーズ", ["マヨネーズ"], 1, "大さじ");
const EXTRA_HACHIMITSU = X("はちみつ", ["はちみつ"], 0.5, "大さじ");
const EXTRA_ICHIMI = X("一味唐辛子", ["一味唐辛子", "唐辛子"], 0.25, "小さじ"); // 辛味づけ（好みで加減）

// ---------- 手順テンプレート（調理法ごと） ----------
// 手順には火加減と時間の目安を含める（詳細表示でもそのまま使える情報量にする）。
// m = 主食材の短い名、s = パートナー名（無い場合は null）、season = 味付けの説明
// 手順の切り方は詳細表示の「準備」手順（約3cm／2〜3cm角の目安）が担うため、
// ここでは「切るだけ」の手順を作らない（準備と重複するうえ、「食べやすい
// 大きさ」のような曖昧表現の温床になる。2026-11-15 Task CN）。
// 代わりに下味・水切りなど、その料理固有の下準備から始める。
const STEP_BUILDERS = {
  yaku: (pt, m, s) => [
    `${m}に塩こしょうで下味をつける`,
    s ? `${s}も用意する` : `${pt.season}を合わせておく`,
    `フライパンを中火で熱し、${m}を片面2〜3分ずつ、焼き色がつくまで焼く`,
    s ? `${s}を加えてさっと焼き、${pt.season}の味で仕上げる` : "中まで火が通ったら火を止めて盛り付ける",
  ],
  itame: (pt, m, s) => [
    `フライパンに油を熱し（中火〜強火）、${m}${s ? `と${s}` : ""}を火の通りにくいものから炒める`,
    `全体に火が通るまで2〜3分炒め、${pt.season}で手早く味付けする`,
  ],
  niru: (pt, m, s) => [
    `鍋に${pt.broth === "dashi" ? "だし（または水）" : "水"}（1人分あたり約200ml）を入れ、${pt.season}を加えて中火で煮立てる`,
    `${m}${s ? `と${s}` : ""}を入れて弱火で10分ほど煮る`,
    "火が通ったら火を止め、数分置いて味をなじませる",
  ],
  ankake: (pt, m, s) => [
    `鍋に水（1人分あたり約200ml）と鶏ガラスープを入れ、中火で煮立てる`,
    `${m}${s ? `と${s}` : ""}を入れて弱火で約5分、火が通るまで煮る`,
    "水溶き片栗粉（片栗粉と水を同じ量ずつ混ぜたもの）を回し入れ、とろみがつくまで約1分煮る",
  ],
  musu: (pt, m, s) => [
    `フライパンか蒸し器に並べ、酒をふってふたをする`,
    `中火で約8分蒸し焼きにし、中まで火を通す`,
    `${pt.season}で仕上げる`,
  ],
  ageru: (pt, m, s) => [
    `${m}の水分をペーパーでよく拭く（油はね防止）`,
    "片栗粉を薄くまぶす",
    `170℃目安の油で3〜4分、カラッと揚げ焼きにする`,
    `${pt.season}で仕上げる`,
  ],
  ae: (pt, m, s) => pt.course === "デザート" ? [
    `${m}は皮をむくなどして、盛りつけやすくする`,
    `${pt.season}で和え、少し置いて味をなじませる`,
  ] : [
    `${m}を塩ゆで（1〜2分）または塩もみして、水気をよく絞る`,
    `${pt.season}で和え、少し置いて味をなじませる`,
  ],
  salad: (pt, m, s) => [
    "必要ならさっとゆでて、ざるに上げてよく冷ます",
    `器に盛り、${pt.season}をかける`,
  ],
  soup: (pt, m, s) => [
    `鍋に水（1人分あたり約200ml）と${m}${s ? `と${s}` : ""}を入れ、中火で煮立てる`,
    `弱火で5〜8分煮て、${pt.season}で味を整える（沸騰させすぎない）`,
  ],
  chahan: (pt, m, s) => [
    "フライパンを強火で熱し、具材を炒める",
    "温かいごはんを加えて強火で約3分、パラッと炒め、塩こしょうと醤油で仕上げる",
  ],
  don: (pt, m, s) => [
    `フライパンを中火で熱し、${m}を焼いて${pt.season}をからめ、照りが出たら火を止める`,
    "温かいごはんにのせて完成",
  ],
  pasta: (pt, m, s) => [
    "パスタを表示時間どおりゆで、その間にフライパンで具材を中火で炒める",
    `ゆで上がったパスタと合わせ、${pt.season}で仕上げる`,
  ],
  udon: (pt, m, s) => [
    `だしで${m}${s ? `と${s}` : ""}を中火で煮て、うどんを加える`,
    "うどんが温まったら、醤油と塩で味を整える",
  ],
  zosui: (pt, m, s) => [
    `だしで${m}${s ? `と${s}` : ""}を弱火で煮て、ごはんを加える`,
    "溶き卵を回し入れてふたをし、1〜2分蒸らして完成",
  ],
  renji: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}を耐熱容器に入れる`,
    `${pt.season}を加えてラップをする`,
    "600Wで約4分加熱し、様子を見て1〜2分ずつ追加する",
    "庫内に1分ほど置いて余熱で火通りを均一にし、全体を混ぜる",
  ],
  hoiru: (pt, m, s) => [
    `アルミホイル（またはクッキングシート）に${m}${s ? `と${s}` : ""}をのせ、${pt.season}をかけて包む`,
    "フライパンに並べて水を少し入れ、ふたをして中火で約10分蒸し焼きにする",
    "包みを開けて火通りを確認する",
  ],
  gratin: (pt, m, s) => [
    `${m}をバターで炒め、牛乳とコンソメで軽く煮て、なめらかなクリーム煮にする`,
    `耐熱皿に移してチーズをのせ、200℃のオーブン（またはトースター）で焼き色がつくまで約10分焼く`,
  ],
  takikomi: (pt, m, s) => [
    "米を洗って浸水させる（30分目安）",
    `炊飯器に米・だし・醤油・酒と${m}${s ? `と${s}` : ""}を入れて炊く`,
    "炊き上がったら10分蒸らして全体を混ぜる",
  ],
  chazuke: (pt, m, s) => [
    `${m}は焼く・ほぐすなどして、ごはんにのせやすくする`,
    "温かいごはんにのせる",
    "熱いお茶（またはだし）を注ぎ、海苔やごまを散らす",
  ],
  hiyashi: (pt, m, s) => [
    `${m}${s ? `と${s}` : ""}は細切りにして用意する`,
    "麺を表示時間どおりゆで、冷水でよくしめる",
    `器に盛って${m}をのせ、冷たいタレ（酢・醤油・砂糖・ごま油）をかける`,
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
  T("shioyaki", "主菜", "和風", "焼く", "yaku", ["fish", "poultry", "meat", "processed"], "塩こしょう", 15,
    (m) => `${m}の塩焼き`),
  T("misoyaki", "主菜", "和風", "焼く", "yaku", ["fish", "poultry", "meat", "soy"], "味噌・みりんの味噌だれ", 20,
    (m) => `${m}の味噌焼き`, { extra: [EXTRA_MISO_SIDE] }),
  T("butter-yaki", "主菜", "洋風", "焼く", "yaku", ["fish", "seafood", "poultry", "meat", "mushroom", "potato", "vegFruit", "processed", "pantry"], "バターと醤油", 15,
    (m) => `${m}のバター醤油焼き`, { extra: [EXTRA_BUTTER] }),
  T("garlic-yaki", "主菜", "洋風", "焼く", "yaku", ["poultry", "meat", "seafood", "mushroom", "processed"], "にんにくと塩こしょう", 15,
    (m) => `${m}のガーリック焼き`, { extra: [EXTRA_NINNIKU] }),
  T("cheese-yaki", "主菜", "洋風", "焼く", "yaku", ["poultry", "meat", "processed", "vegFruit", "potato", "mushroom", "soy", "pantry"], "とろけるチーズ", 15,
    (m) => `${m}のチーズ焼き`, { extra: [EXTRA_CHEESE] }),
  T("shio-itame", "主菜", "和風", "炒める", "itame", ["poultry", "meat", "fish", "seafood", "egg", "soy", "vegLeafy", "vegRoot", "vegFruit", "potato", "mushroom", "pantry"], "塩こしょう", 15,
    (m) => `${m}の塩炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の塩炒め` }),
  T("miso-itame", "主菜", "和風", "炒める", "itame", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegRoot", "vegFruit", "mushroom", "processed"], "味噌・醤油・砂糖", 15,
    (m) => `${m}の味噌炒め`, { extra: [EXTRA_MISO_SIDE], partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の味噌炒め` }),
  T("oyster-itame", "主菜", "中華", "炒める", "itame", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegFruit", "mushroom"], "オイスターソースと醤油", 15,
    (m) => `${m}のオイスター炒め`, { extra: [EXTRA_OYSTER], partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のオイスター炒め` }),
  T("ketchup-itame", "主菜", "洋風", "炒める", "itame", ["poultry", "meat", "processed", "seafood"], "ケチャップとソース", 15,
    (m) => `${m}のケチャップ炒め`, { extra: [EXTRA_KETCHUP_BIG, EXTRA_SAUCE_HALF], partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のケチャップ炒め` }),
  T("chuka-itame", "主菜", "中華", "炒める", "itame", ["poultry", "meat", "seafood", "egg", "soy", "vegLeafy", "vegRoot", "vegFruit", "mushroom"], "中華だしと醤油", 15,
    (m) => `${m}の中華炒め`, { extra: [EXTRA_TORIGARA], partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の中華炒め` }),
  T("curry-itame", "主菜", "洋風", "炒める", "itame", ["poultry", "meat", "seafood", "vegLeafy", "vegRoot", "vegFruit", "potato", "fish", "pantry"], "カレー粉と塩こしょう", 15,
    (m) => `${m}のカレー炒め`, { extra: [EXTRA_CURRY_TSP], partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のカレー炒め` }),
  T("shoyu-ni", "主菜", "和風", "煮る", "niru", ["poultry", "meat", "fish", "soy", "vegLeafy", "vegRoot", "potato", "seaweed", "processed"], "醤油・砂糖・酒", 30,
    (m) => `${m}の煮物`, { broth: "dashi", partner: POOL_MEAT, extra: [EXTRA_DASHI], titleWith: (m, s) => `${m}と${s}の煮物` }),
  T("miso-ni", "主菜", "和風", "煮る", "niru", ["fish", "meat", "soy", "vegRoot", "vegFruit", "processed"], "味噌・砂糖・酒", 25,
    (m) => `${m}の味噌煮`, { broth: "dashi", partner: POOL_FISH, extra: [EXTRA_MISO_NI, EXTRA_DASHI] }),
  T("tomato-ni", "主菜", "洋風", "煮る", "niru", ["poultry", "meat", "seafood", "soy", "vegLeafy", "vegRoot", "pantry", "fish"], "トマトとコンソメ", 25,
    (m) => `${m}のトマト煮`, { partner: POOL_MEAT, extra: [EXTRA_CONSOMME, EXTRA_TOMATO] }),
  T("cream-ni", "主菜", "洋風", "煮る", "niru", ["poultry", "fish", "seafood", "vegLeafy", "potato", "mushroom"], "牛乳とコンソメ", 25,
    (m) => `${m}のクリーム煮`, { partner: POOL_MEAT, extra: [EXTRA_CONSOMME, EXTRA_MILK] }),
  T("ankake", "主菜", "中華", "煮る", "ankake", ["fish", "seafood", "soy", "vegFruit", "vegLeafy"], "中華だしと片栗粉のあん", 20,
    (m) => `${m}のあんかけ`, { partner: POOL_MEAT, extra: [EXTRA_TORIGARA, EXTRA_KATAKURI_HALF], titleWith: (m, s) => `${m}と${s}のあんかけ` }),
  T("ponzu-mushi", "主菜", "和風", "蒸す", "musu", ["fish", "poultry", "meat", "seafood", "soy", "vegLeafy", "vegFruit"], "ポン酢", 20,
    (m) => `${m}のポン酢蒸し`, { partner: POOL_FISH, extra: [EXTRA_PONZU], titleWith: (m, s) => `${m}と${s}のポン酢蒸し` }),
  T("chuka-mushi", "主菜", "中華", "蒸す", "musu", ["fish", "seafood", "poultry", "soy"], "ごま油と醤油の中華だれ", 20,
    (m) => `${m}の中華蒸し`, { extra: [EXTRA_GOMAABURA] }),
  T("karaage", "主菜", "和風", "揚げる", "ageru", ["poultry", "meat", "seafood", "fish", "vegRoot", "potato", "processed"], "醤油と生姜の下味", 25,
    (m) => `${m}の唐揚げ風`, { extra: [EXTRA_KATAKURI, EXTRA_SHOGA] }),
  T("nanban", "主菜", "和風", "揚げる", "ageru", ["fish", "poultry", "seafood"], "酢・醤油・砂糖の南蛮酢", 25,
    (m) => `${m}の南蛮漬け`, { extra: [EXTRA_KATAKURI_HALF] }),
  T("dengaku", "主菜", "和風", "焼く", "yaku", ["vegFruit", "vegRoot", "soy"], "甘い味噌だれ", 20,
    (m) => `${m}の田楽`, { extra: [EXTRA_MISO_SIDE], names: ["なす", "大根", "豆腐", "こんにゃく", "里芋", "厚揚げ"] }),
  // ---- 主菜（追加） ----
  T("hoiru", "主菜", "洋風", "蒸す", "hoiru", ["fish", "seafood", "poultry", "meat", "mushroom", "vegFruit"], "バターと塩こしょう", 20,
    (m) => `${m}のホイル焼き`, { partner: POOL_FISH, extra: [EXTRA_BUTTER], titleWith: (m, s) => `${m}と${s}のホイル焼き` }),
  T("muniere", "主菜", "洋風", "焼く", "yaku", ["fish", "seafood"], "バターとレモン", 15,
    (m) => `${m}のムニエル`, { extra: [EXTRA_BUTTER, EXTRA_LEMON] }),
  T("pikata", "主菜", "洋風", "焼く", "yaku", ["poultry", "fish", "soy"], "卵とチーズの衣", 15,
    (m) => `${m}のピカタ`, { extra: [EXTRA_EGG, EXTRA_CHEESE] }),
  T("shogayaki", "主菜", "和風", "焼く", "yaku", ["meat", "poultry", "fish"], "生姜・醤油・みりん", 15,
    (m) => `${m}の生姜焼き`, { partner: POOL_MEAT, extra: [EXTRA_SHOGA], titleWith: (m, s) => `${m}と${s}の生姜焼き` }),
  T("negi-shio", "主菜", "和風", "焼く", "yaku", ["poultry", "meat", "seafood", "processed"], "ねぎ塩だれ（刻みねぎ・塩・ごま油）", 15,
    (m) => `${m}のねぎ塩焼き`, { extra: [EXTRA_GOMAABURA, EXTRA_NEGI] }),
  T("huigo", "主菜", "中華", "炒める", "itame", ["meat", "vegLeafy"], "甜麺醤の甘辛だれ", 15,
    (m) => `${m}の回鍋肉風炒め`, { partner: POOL_MEAT, extra: [EXTRA_TENMEN], titleWith: (m, s) => `${m}と${s}の回鍋肉風炒め` }),
  T("mabofu", "主菜", "中華", "煮る", "niru", ["soy", "meat", "vegFruit", "pantry"], "味噌・醤油・ごま油（辛みは控えめ）", 20,
    (m) => `${m}の麻婆風`, { extra: [EXTRA_MISO_SIDE, EXTRA_GOMAABURA, EXTRA_ICHIMI] }),
  T("chilisauce", "主菜", "中華", "炒める", "itame", ["seafood", "poultry"], "ケチャップと酢の甘辛チリソース", 20,
    (m) => `${m}のチリソース炒め`, { partner: POOL_MEAT, extra: [EXTRA_KETCHUP], titleWith: (m, s) => `${m}と${s}のチリソース炒め` }),
  T("amazu-an", "主菜", "中華", "煮る", "niru", ["fish", "poultry", "meat", "seafood", "soy"], "酢・醤油・砂糖の甘酢あん", 20,
    (m) => `${m}の甘酢あんかけ`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の甘酢あんかけ` }),
  T("oroshi-ni", "主菜", "和風", "煮る", "niru", ["fish", "poultry", "meat"], "大根おろしとだし醤油", 20,
    (m) => `${m}の大根おろし煮`, { extra: [EXTRA_DASHI, EXTRA_DAIKON] }),
  T("yasai-itame", "主菜", "中華", "炒める", "itame", ["vegLeafy", "vegRoot", "vegFruit", "mushroom", "potato"], "塩こしょうと醤油", 15,
    (m) => `${m}の野菜炒め`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}の野菜炒め` }),
  T("kakiage", "主菜", "和風", "揚げる", "ageru", ["vegRoot", "vegFruit", "seafood", "mushroom", "vegLeafy"], "塩（または天つゆ）", 20,
    (m) => `${m}のかき揚げ`, { partner: POOL_MEAT, extra: [EXTRA_KATAKURI], titleWith: (m, s) => `${m}と${s}のかき揚げ` }),
  T("fritter", "主菜", "洋風", "揚げる", "ageru", ["fish", "seafood", "poultry", "vegFruit"], "塩こしょうの衣", 20,
    (m) => `${m}のフリッター`, { extra: [EXTRA_KATAKURI] }),
  T("gratin", "主菜", "洋風", "焼く", "gratin", ["poultry", "seafood", "potato", "mushroom", "vegFruit"], "ホワイトソースとチーズ", 30,
    (m) => `${m}のグラタン風`, { extra: [EXTRA_CHEESE, EXTRA_BUTTER, EXTRA_CONSOMME, EXTRA_MILK] }),
  T("doria", "主食", "洋風", "焼く", "gratin", ["poultry", "seafood", "meat"], "ホワイトソースとチーズ（ごはん）", 30,
    (m) => `${m}のドリア風`, { extra: [EXTRA_CHEESE, EXTRA_BUTTER, EXTRA_CONSOMME, EXTRA_MILK] }),
  T("renji-mushi", "主菜", "和風", "レンジ", "renji", ["poultry", "fish", "seafood", "soy", "vegLeafy", "vegFruit", "potato", "mushroom"], "酒と塩（またはポン酢）", 15,
    (m) => `${m}のレンジ蒸し`, { partner: POOL_FISH, extra: [EXTRA_PONZU], titleWith: (m, s) => `${m}と${s}のレンジ蒸し` }),
  T("renji-ni", "主菜", "和風", "レンジ", "renji", ["meat", "fish", "vegRoot", "potato", "soy"], "醤油・みりん・砂糖", 15,
    (m) => `${m}のレンジ煮`),
  T("sukiyaki-fu", "主菜", "和風", "煮る", "niru", ["meat", "vegLeafy", "soy"], "醤油・砂糖・みりんの割り下", 25,
    (m) => `${m}のすき焼き風`, { partner: POOL_MEAT, titleWith: (m, s) => `${m}と${s}のすき焼き風` }),
  T("shabu-fu", "主菜", "和風", "スープ", "soup", ["meat", "vegLeafy"], "ポン酢", 15,
    (m) => `${m}のしゃぶしゃぶ風`, { extra: [EXTRA_PONZU] }),
  T("nabe-fu", "主菜", "和風", "煮る", "niru", ["poultry", "meat", "fish", "soy", "vegLeafy", "processed"], "だしと塩", 25,
    (m) => `${m}の鍋風`, { broth: "dashi", partner: POOL_MEAT, extra: [EXTRA_DASHI], titleWith: (m, s) => `${m}と${s}の鍋風` }),
  T("curry-ni", "主菜", "洋風", "煮る", "niru", ["poultry", "meat", "vegRoot", "potato"], "カレー粉とコンソメ", 25,
    (m) => `${m}のカレー煮`, { broth: "dashi", partner: POOL_MEAT, extra: [EXTRA_CURRY_TBS, EXTRA_CONSOMME, EXTRA_DASHI], titleWith: (m, s) => `${m}と${s}のカレー煮` }),
  T("demi-ni", "主菜", "洋風", "煮る", "niru", ["meat", "poultry"], "ケチャップとソースのデミ風", 30,
    (m) => `${m}のデミ風煮込み`, { extra: [EXTRA_KETCHUP, EXTRA_SAUCE] }),
  T("butter-mushi", "主菜", "洋風", "蒸す", "musu", ["seafood", "fish", "mushroom", "vegFruit"], "バターと醤油", 20,
    (m) => `${m}のバター蒸し`, { partner: POOL_FISH, extra: [EXTRA_BUTTER], titleWith: (m, s) => `${m}と${s}のバター蒸し` }),
  T("sake-mushi", "主菜", "和風", "蒸す", "musu", ["seafood", "fish", "poultry"], "酒と塩", 20,
    (m) => `${m}の酒蒸し`, { partner: POOL_FISH, titleWith: (m, s) => `${m}と${s}の酒蒸し` }),
  T("tataki", "主菜", "和風", "焼く", "yaku", ["fish"], "ポン酢と薬味", 15,
    (m) => `${m}のたたき風`, { extra: [EXTRA_PONZU], names: ["かつお", "まぐろ", "あじ"] }),
  // ---- 副菜 ----
  T("goma-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegRoot", "soy"], "すりごまと醤油・砂糖", 10,
    (m) => `${m}のごま和え`, { extra: [EXTRA_GOMA] }),
  T("miso-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit", "soy", "vegRoot", "seaweed"], "味噌・砂糖・酢", 10,
    (m) => `${m}の味噌和え`, { extra: [EXTRA_MISO_SIDE] }),
  T("ponzu-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit", "mushroom", "seafood", "seaweed"], "ポン酢", 10,
    (m) => `${m}のポン酢和え`, { extra: [EXTRA_PONZU] }),
  T("sunomono", "副菜", "和風", "和える", "ae", ["vegFruit", "vegLeafy", "seafood", "seaweed", "processed"], "酢・砂糖・塩の甘酢", 10,
    (m) => `${m}の酢の物`),
  T("mayo-ae", "副菜", "洋風", "和える", "ae", ["vegFruit", "potato", "egg", "processed", "vegLeafy", "roe", "pantry", "fruit"], "マヨネーズと塩こしょう", 10,
    (m) => `${m}のマヨ和え`, { extra: [EXTRA_MAYO] }),
  T("salad", "副菜", "洋風", "サラダ", "salad", ["vegLeafy", "vegFruit", "egg", "processed", "seafood", "poultry", "fruit", "seaweed", "pantry", "fish"], "お好みのドレッシング", 10,
    (m) => `${m}サラダ`),
  T("namul", "副菜", "中華", "和える", "ae", ["vegLeafy", "vegFruit", "mushroom", "seaweed"], "ごま油と鶏ガラスープ", 10,
    (m) => `${m}のナムル`, { extra: [EXTRA_GOMAABURA, EXTRA_TORIGARA_HALF] }),
  T("ohitashi", "副菜", "和風", "和える", "ae", ["vegLeafy", "mushroom"], "だし醤油", 10,
    (m) => `${m}のおひたし`),
  // ---- 副菜（追加：おつまみ系・レンジ） ----
  T("shiodare-ae", "副菜", "和風", "和える", "ae", ["vegFruit", "vegLeafy", "seafood", "processed", "soy"], "塩だれ（塩・ごま油・にんにく少し）", 10,
    (m) => `${m}の塩だれ和え`, { extra: [EXTRA_GOMAABURA, EXTRA_NINNIKU_SMALL] }),
  T("pirikara-ae", "副菜", "中華", "和える", "ae", ["vegLeafy", "vegFruit", "seafood", "soy"], "醤油・酢・ごま油（辛みは控えめ）", 10,
    (m) => `${m}のピリ辛和え`, { extra: [EXTRA_GOMAABURA, EXTRA_ICHIMI] }),
  T("shiokonbu-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit"], "塩昆布とごま油", 10,
    (m) => `${m}の塩昆布和え`, { extra: [EXTRA_SHIOKONBU, EXTRA_GOMAABURA] }),
  T("ume-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "vegFruit", "seafood"], "梅肉と醤油", 10,
    (m) => `${m}の梅和え`, { extra: [EXTRA_UMEBOSHI] }),
  T("wasabi-ae", "副菜", "和風", "和える", "ae", ["vegLeafy", "seafood", "vegRoot"], "わさび醤油", 10,
    (m) => `${m}のわさび和え`, { extra: [EXTRA_WASABI] }),
  T("renji-ae", "副菜", "和風", "レンジ", "renji", ["vegLeafy", "vegFruit", "mushroom"], "ごま油と塩（またはポン酢）", 10,
    (m) => `${m}のレンジ和え`, { extra: [EXTRA_GOMAABURA, EXTRA_PONZU] }),
  T("marine", "副菜", "洋風", "サラダ", "salad", ["fish", "seafood", "vegFruit", "vegRoot"], "酢とオリーブオイルのマリネ液", 15,
    (m) => `${m}のマリネ`, { extra: [EXTRA_OLIVE] }),
  T("carpaccio", "副菜", "洋風", "サラダ", "salad", ["fish", "seafood", "processed"], "レモンとオリーブオイル", 10,
    (m) => `${m}のカルパッチョ風`, { extra: [EXTRA_OLIVE, EXTRA_LEMON] }),
  T("honey-ae", "デザート", "洋風", "和える", "ae", ["fruit"], "はちみつとレモン", 10,
    (m) => `${m}のはちみつ和え`, { extra: [EXTRA_HACHIMITSU, EXTRA_LEMON] }),
  // ---- 汁物 ----
  T("misoshiru", "汁物", "和風", "スープ", "soup", ["vegLeafy", "vegRoot", "vegFruit", "potato", "soy", "seafood", "egg", "mushroom", "seaweed", "fish", "processed"], "味噌", 15,
    (m) => `${m}の味噌汁`, { partner: POOL_SOUP, extra: [EXTRA_MISO], titleWith: (m, s) => `${m}と${s}の味噌汁` }),
  T("consomme-soup", "汁物", "洋風", "スープ", "soup", ["vegLeafy", "vegRoot", "potato", "poultry", "meat", "processed", "egg", "mushroom", "pantry"], "コンソメと塩こしょう", 15,
    (m) => `${m}のコンソメスープ`, { partner: POOL_SOUP, extra: [EXTRA_CONSOMME], titleWith: (m, s) => `${m}と${s}のコンソメスープ` }),
  T("chuka-soup", "汁物", "中華", "スープ", "soup", ["vegLeafy", "vegFruit", "egg", "seafood", "soy", "mushroom", "seaweed", "processed", "pantry"], "中華だしとごま油", 10,
    (m) => `${m}の中華スープ`, { partner: POOL_SOUP, extra: [EXTRA_TORIGARA, EXTRA_GOMAABURA], titleWith: (m, s) => `${m}と${s}の中華スープ` }),
  T("milk-soup", "汁物", "洋風", "スープ", "soup", ["potato", "vegLeafy", "poultry", "seafood", "processed", "pantry"], "牛乳とコンソメ", 15,
    (m) => `${m}のミルクスープ`, { partner: POOL_SOUP, extra: [EXTRA_CONSOMME, EXTRA_MILK], titleWith: (m, s) => `${m}と${s}のミルクスープ` }),
  // ---- 主食 ----
  T("chahan", "主食", "中華", "炒める", "chahan", ["egg", "processed", "poultry", "meat", "seafood", "vegLeafy", "roe", "pantry"], "塩こしょうと醤油", 15,
    (m) => `${m}チャーハン`, { partner: POOL_RICE }),
  T("don", "主食", "和風", "焼く", "don", ["poultry", "meat", "fish"], "醤油・みりんの照り焼きだれ", 20,
    (m) => `${m}の照り焼き丼`),
  T("pasta", "主食", "洋風", "炒める", "pasta", ["processed", "seafood", "mushroom", "vegLeafy", "vegFruit", "meat", "roe", "pantry"], "醤油とバター（和風）", 20,
    (m) => `${m}の和風パスタ`, { partner: POOL_MEAT, extra: [EXTRA_BUTTER] }),
  T("udon", "主食", "和風", "煮る", "udon", ["poultry", "meat", "egg", "vegLeafy", "vegRoot", "processed"], "だしと醤油", 20,
    (m) => `${m}の煮込みうどん`, { partner: POOL_SOUP, extra: [EXTRA_DASHI] }),
  T("zosui", "主食", "和風", "煮る", "zosui", ["egg", "poultry", "seafood", "mushroom", "vegLeafy", "soy"], "だしと塩", 15,
    (m) => `${m}の雑炊`, { partner: POOL_SOUP, extra: [EXTRA_DASHI, EXTRA_EGG] }),
  // ---- 主食（追加） ----
  T("pilaf", "主食", "洋風", "炒める", "chahan", ["processed", "seafood", "poultry", "mushroom"], "バターとコンソメ", 20,
    (m) => `${m}ピラフ`, { partner: POOL_RICE }),
  T("takikomi", "主食", "和風", "炊く", "takikomi", ["poultry", "seafood", "mushroom", "vegRoot", "soy", "fish", "vegFruit"], "だしと醤油", 50,
    (m) => `${m}の炊き込みごはん`, { partner: POOL_RICE, extra: [EXTRA_DASHI], titleWith: (m, s) => `${m}と${s}の炊き込みごはん` }),
  T("chazuke", "主食", "和風", "和える", "chazuke", ["fish", "seafood", "roe", "processed"], "お茶（またはだし）と塩", 10,
    (m) => `${m}のお茶漬け`, { extra: [EXTRA_GOMA, EXTRA_NORI] }),
  T("hiyashi", "主食", "中華", "和える", "hiyashi", ["egg", "processed", "vegFruit"], "冷やし中華のタレ", 20,
    (m) => `${m}の冷やし中華風`, { extra: [EXTRA_GOMAABURA] }),
];

export function patternsForMain(main) {
  return COMBO_PATTERNS.filter((pt) =>
    pt.groups.includes(main.group) && (!pt.names || pt.names.includes(main.name)) && (!main.only || main.only.includes(pt.key)));
}

// ---------- 生成空間の数え上げ ----------
// 生成器が出せる「異なる料理名」をすべて数え上げる：
// - 単品名（主食材 × パターン）
// - パートナーが料理名に反映される場合は、パートナー違いも別名として数える
// - 固定レシピと同名の生成名は数えない（重複回避）
// 同じ名前になる組み合わせは Set で1つに数える。
export function enumerateComboSpace() {
  const byTitle = new Map();
  for (const main of COMBO_MAINS) {
    for (const pt of patternsForMain(main)) {
      const solo = pt.titleSolo(main.short);
      if (!FIXED_TITLES.has(solo) && !byTitle.has(solo)) {
        byTitle.set(solo, { id: `combo-${main.name}-${pt.key}`, title: solo, main: main.name, pattern: pt.key, course: pt.course });
      }
      if (pt.partner && pt.titleWith) {
        for (const pName of pt.partner) {
          const partner = COMBO_PARTNERS[pName];
          if (!partner || partner.name === main.name) continue;
          const t = pt.titleWith(main.short, partner.name);
          if (FIXED_TITLES.has(t) || byTitle.has(t)) continue;
          byTitle.set(t, { id: `combo-${main.name}-${pt.key}-${partner.name}`, title: t, main: main.name, pattern: pt.key, course: pt.course });
        }
      }
    }
  }
  return [...byTitle.values()];
}

export function comboSpaceSize() {
  return enumerateComboSpace().length;
}

// ---------- レパートリー総数（固定レシピは recipes.js の実データから数える） ----------
export function repertoireSize() {
  const fixed = fixedRecipeCount();
  const generated = comboSpaceSize();
  return { fixed, generated, total: fixed + generated };
}

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
