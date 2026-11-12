// recipes.js — ルールベースのレシピ提案
// 在庫の食材名とレシピ材料のキーワードを照合し、
// モード "stock"  = あるもので作る（買い足し 0 件のみ）
// モード "shop"   = 買い出しで作る（買い足し最大 3 件まで、買い物リストへ追加可）
// 分量は家族人数 (servings) に比例して換算する。
//
// バリエーション拡充（2026-11-09「レシピはもう少しバリエーション出せた方が嬉しい」）:
// - 同じ主材料でも調理法・味付けの違う料理を複数用意（和風・洋風・中華／
//   炒める・煮る・焼く・蒸す・揚げる・スープ・サラダ）
// - 各レシピに course（主菜／副菜／汁物／主食／サラダ）を持たせ、
//   suggestMealSet で「主菜＋副菜＋汁物」の献立セットも提案できる
// - 少量の残り食材を活かす「使い切り」レシピ（useUp）
// - 提案順には日替わりローテーション（rotateKey、既定は今日の日付）を
//   小さく効かせ、同じ顔ぶれが毎日先頭に並ばないようにする（期限の近い
//   食材を優先するスコア差の方が大きいので、FIFO の優先順位は崩れない）

import { matchesRecipeFilter } from "./util.js";

export const RECIPES = [
  { id: "oyakodon", title: "親子丼", minutes: 20, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["玉ねぎを薄切りにし、鶏肉は一口大に切る", "だし・醤油・みりん・砂糖で鶏肉と玉ねぎを煮る", "溶き卵を回し入れ、半熟で火を止める", "ごはんにのせて完成"], tip: "卵は2回に分けて入れるとふんわりします" },
  { id: "teriyaki", title: "鶏の照り焼き", minutes: 20, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
  ], steps: ["鶏肉の皮目から焼いて脂を出す", "醤油・みりん・砂糖のタレを絡めて照りを出す", "千切りキャベツを添える"], tip: "焼く前にキッチンペーパーで水分を拭くと皮がパリッとします" },
  { id: "nikujaga", title: "肉じゃが", minutes: 35, ingredients: [
    { name: "豚肉", match: ["豚肉", "牛肉"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["野菜は大きめに切る", "肉を炒め、野菜とだし・調味料を加えて煮る", "落し蓋をして15分煮込み、火を止めて味をなじませる"], tip: "一度冷ますと味がしみます" },
  { id: "yasai-itame", title: "野菜炒め", minutes: 15, ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 60, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["肉と野菜を強火で手早く炒める", "塩こしょうと醤油で味付け"], tip: "野菜の水分を飛ばすように炒めるのがコツ" },
  { id: "omurice", title: "オムライス", minutes: 25, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "ケチャップ", match: ["ケチャップ"], per: 2, unit: "大さじ" },
  ], steps: ["鶏肉と玉ねぎを炒め、ごはんとケチャップでチキンライスを作る", "卵を半熟に焼いてライスを包む"], tip: "卵に牛乳を少し加えるとふんわりします" },
  { id: "curry", title: "カレーライス", minutes: 40, ingredients: [
    { name: "豚肉", match: ["豚肉", "鶏肉", "牛肉"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.75, unit: "個" },
    { name: "カレールー", match: ["カレールー", "ルー"], per: 1, unit: "かけ" },
  ], steps: ["材料を炒めて水を加え、野菜が柔らかくなるまで煮る", "火を止めてルーを溶かし、とろみがつくまで煮込む"], tip: "玉ねぎをよく炒めると甘みが出ます" },
  { id: "misoshiru", title: "具だくさん味噌汁", minutes: 15, ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
  ], steps: ["だしで豆腐とわかめを温める", "火を弱めて味噌を溶く（沸騰させない）"], tip: "余り野菜を入れてもおいしい一品" },
  { id: "salad", title: "トマトと卵のサラダ", minutes: 10, ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["卵はゆで卵にして粗く崩す", "トマトとレタスと合わせてドレッシングで和える"], tip: "食べる直前に和えると水っぽくなりません" },
  { id: "shogayaki", title: "豚の生姜焼き", minutes: 20, ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["生姜・醤油・みりんのタレに豚肉を漬ける", "玉ねぎと一緒に焼き、タレを絡める"], tip: "漬け込み10分で味がしっかり入ります" },
  { id: "fried-rice", title: "チャーハン", minutes: 15, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム", "ベーコン", "ウインナー"], per: 20, unit: "g" },
  ], steps: ["ごはんと卵を強火でパラッと炒める", "ハムとねぎを加え、醤油で香り付け"], tip: "ごはんは温かいものを使うとパラッと仕上がります" },
  { id: "mabo-dofu", title: "麻婆豆腐", minutes: 20, ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.75, unit: "丁" },
    { name: "豚ひき肉", match: ["ひき肉", "豚肉"], per: 60, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["ひき肉を炒め、豆板醤と調味料で味付け", "豆腐を加えて煮し、水溶き片栗粉でとろみをつける"], tip: "豆腐は塩ゆでしておくと崩れにくいです" },
  { id: "potato-sarada", title: "ポテトサラダ", minutes: 25, ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["じゃがいもを柔らかく茹でて熱いうちに潰す", "具材とマヨネーズで和える"], tip: "じゃがいもに酢を少し加えると味が引き締まります" },
];

// ---- 既存12品のメタ情報（ジャンル・調理法・コース） ----
export const RECIPE_META = {
  oyakodon: { genre: "和風", method: "煮る", course: "主食" },
  teriyaki: { genre: "和風", method: "焼く", course: "主菜" },
  nikujaga: { genre: "和風", method: "煮る", course: "主菜" },
  "yasai-itame": { genre: "中華", method: "炒める", course: "主菜" },
  omurice: { genre: "洋風", method: "炒める", course: "主食" },
  curry: { genre: "洋風", method: "煮る", course: "主食" },
  misoshiru: { genre: "和風", method: "スープ", course: "汁物", useUp: true },
  salad: { genre: "洋風", method: "サラダ", course: "副菜" },
  shogayaki: { genre: "和風", method: "焼く", course: "主菜" },
  "fried-rice": { genre: "中華", method: "炒める", course: "主食" },
  "mabo-dofu": { genre: "中華", method: "煮る", course: "主菜" },
  "potato-sarada": { genre: "洋風", method: "サラダ", course: "副菜" },
};

// ---- 追加レシピ（同じ主材料に複数の調理法・味付け、使い切り、セット用） ----
export const EXTRA_RECIPES = [
  // 鶏肉のバリエーション
  { id: "karaage", title: "鶏の唐揚げ", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
  ], steps: ["鶏肉を生姜・醤油に15分漬ける", "片栗粉をまぶしてカラッと揚げる"], tip: "二度揚げすると中まで火が通り外はサクッとします" },
  { id: "tori-shioyaki", title: "鶏の塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["鶏肉に塩こしょうして皮目から焼く", "両面こんがり焼いてレタスを添える"], tip: "焼く前に常温に戻すと火の通りが均一になります" },
  { id: "mushidori-salad", title: "蒸し鶏のサラダ", minutes: 20, genre: "中華", method: "蒸す", course: "副菜", ingredients: [
    { name: "鶏むね肉", match: ["鶏むね", "むね肉", "鶏肉"], per: 75, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
  ], steps: ["鶏肉を酒と塩で蒸して（またはレンジで）火を通す", "手で裂いて野菜とごまだれで和える"], tip: "蒸し汁はスープに使うと無駄がありません" },
  { id: "chicken-tomato", title: "チキンのトマト煮", minutes: 30, genre: "洋風", method: "煮る", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["鶏肉と玉ねぎを炒める", "ざく切りトマトとコンソメで15分煮込む"], tip: "仕上げにチーズをのせてもおいしいです" },
  { id: "yurinchi", title: "油淋鶏", minutes: 25, genre: "中華", method: "揚げる", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["鶏肉に片栗粉をまぶして揚げ焼きにする", "ねぎ・酢・醤油のタレをかける"], tip: "タレは食べる直前にかけると衣がサクッとします" },
  { id: "tori-soup", title: "鶏と野菜のスープ", minutes: 25, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
  ], steps: ["材料を一口大に切って水から煮る", "コンソメと塩こしょうで味を整える"], tip: "残り野菜の使い切りに向くスープです" },
  // 豚肉のバリエーション
  { id: "tonjiru", title: "豚汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["豚肉と根菜を炒めてからだしで煮る", "味噌を溶いて仕上げる"], tip: "具だくさんにすると一品で満足感があります" },
  { id: "buta-kimchi", title: "豚キムチ炒め", minutes: 15, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "キムチ", match: ["キムチ"], per: 50, unit: "g" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["豚肉を炒め、キムチともやしを加える", "醤油で香りをつけて手早く仕上げる"], tip: "キムチの汁ごと使うとうまみが増します" },
  { id: "hoikoro", title: "回鍋肉風キャベツ炒め", minutes: 20, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
  ], steps: ["豚肉と野菜を強火で炒める", "味噌・醤油・砂糖のタレを絡める"], tip: "キャベツは最後に入れるとシャキッとします" },
  { id: "shabu-salad", title: "冷しゃぶサラダ", minutes: 15, genre: "和風", method: "サラダ", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["豚肉を弱火でゆでて冷ます", "野菜の上にのせ、ごまだれやポン酢で"], tip: "ゆで汁はスープに再利用できます" },
  // 卵のバリエーション
  { id: "tamagoyaki", title: "だし巻き卵", minutes: 10, genre: "和風", method: "焼く", course: "副菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["卵にだしと塩を混ぜる", "フライパンで少しずつ巻いていく"], tip: "弱めの中火で巻くとふんわりします" },
  { id: "niratama", title: "ニラ玉", minutes: 10, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "ニラ", match: ["ニラ", "にら"], per: 0.5, unit: "束" },
  ], steps: ["ニラを炒めて溶き卵を流し入れる", "大きく混ぜて半熟で止める"], tip: "卵は余熱で火が入るので早めに止めます" },
  { id: "tamago-soup", title: "卵とわかめのスープ", minutes: 10, genre: "中華", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["中華だしでわかめを煮る", "溶き卵を糸のように流し入れる"], tip: "卵1個から作れる使い切りスープです" },
  // 豆腐のバリエーション
  { id: "tofu-salad", title: "豆腐とトマトのサラダ", minutes: 10, genre: "和風", method: "サラダ", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
  ], steps: ["豆腐は水切りして一口大に", "野菜と合わせて和風ドレッシングで和える"], tip: "食べる直前に和えると水っぽくなりません" },
  { id: "tofu-hamburg", title: "豆腐ハンバーグ", minutes: 25, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["水切りした豆腐とひき肉・玉ねぎを練る", "形を整えて両面焼き、和風あんをかける"], tip: "豆腐の水切りをしっかりすると崩れません" },
  { id: "shiraae", title: "ほうれん草の白和え", minutes: 15, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ほうれん草", match: ["ほうれん草"], per: 0.5, unit: "束" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["野菜をゆでて水気を絞る", "潰した豆腐と砂糖・醤油で和える"], tip: "豆腐は粗く潰すと食感が残ります" },
  // 魚（鮭）のバリエーション
  { id: "sake-shioyaki", title: "鮭の塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["鮭に塩をして10分置く", "グリルやフライパンで焼き、大根おろしを添える"], tip: "水分を拭いてから焼くと臭みが減ります" },
  { id: "sake-meuniere", title: "鮭のムニエル", minutes: 20, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["鮭に塩こしょうと小麦粉をまぶす", "バターで焼いてレモンを絞る"], tip: "粉は薄くまぶすとカリッと仕上がります" },
  { id: "chanchan", title: "鮭のちゃんちゃん焼き", minutes: 25, genre: "和風", method: "蒸す", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
  ], steps: ["野菜の上に鮭をのせて蒸し焼きにする", "味噌だれを絡めてほぐす"], tip: "ホットプレートでも作れる北海道の郷土料理です", note: "北海道の漁師ごはん。鉄板の上で鮭と野菜を味噌だれで蒸し焼きにして、みんなでほぐしながら食べるよ。" },
  // 野菜のバリエーション・使い切り
  { id: "millefeuille", title: "白菜と豚肉の重ね煮", minutes: 25, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "白菜", match: ["白菜"], per: 0.25, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["白菜と豚肉を交互に重ねて切る", "だしと生姜で煮てポン酢で食べる"], tip: "白菜から水分が出るので水は少なめで大丈夫です" },
  { id: "hakusai-salad", title: "白菜の浅漬け風サラダ", minutes: 10, genre: "和風", method: "サラダ", course: "副菜", useUp: true, ingredients: [
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["白菜を塩もみして水気を絞る", "きゅうりとごま油・酢で和える"], tip: "少し残った白菜の使い切りに" },
  { id: "cabbage-soup", title: "キャベツとハムのスープ", minutes: 15, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["材料をコンソメで柔らかく煮る", "塩こしょうで味を整える"], tip: "端野菜の使い切りスープです" },
  { id: "german-potato", title: "ジャーマンポテト", minutes: 20, genre: "洋風", method: "炒める", course: "副菜", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "ウインナー", match: ["ウインナー", "ソーセージ"], per: 2, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["じゃがいもをゆでてから切る", "ウインナーと玉ねぎと炒め、塩こしょう"], tip: "じゃがいもの表面をカリッと焼くのがコツ" },
  { id: "potato-soup", title: "ポテトのミルクスープ", minutes: 20, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["じゃがいもと玉ねぎを柔らかく煮て潰す", "牛乳でのばしてコンソメで味付け"], tip: "潰し加減でポタージュ風にもなります" },
  { id: "tomato-egg", title: "トマトと卵の中華炒め", minutes: 10, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
  ], steps: ["卵をふんわり炒めて一度取り出す", "トマトを炒めて卵を戻し、塩と砂糖ひとつまみ"], tip: "トマトの酸味と卵の甘さが合います" },
  { id: "kinpira", title: "きんぴらごぼう", minutes: 15, genre: "和風", method: "炒める", course: "副菜", useUp: true, ingredients: [
    { name: "ごぼう", match: ["ごぼう"], per: 0.5, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["ごぼうとにんじんを細切りにする", "ごま油で炒め、醤油・みりん・砂糖で甘辛く"], tip: "少し残った根菜の使い切りに" },
  { id: "yasai-soup", title: "野菜たっぷりコンソメスープ", minutes: 20, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 0.5, unit: "個" },
  ], steps: ["全部一口大に切ってコンソメで煮る", "塩こしょうで仕上げる"], tip: "端野菜をまとめて使い切れるスープです" },
  // ---- 大幅追加（2026-11-11「レパートリー目標1500品」に向けた固定レシピ積み上げ） ----
  // 鶏・豚・魚の主菜バリエーション
  { id: "pikata", title: "鶏むね肉のピカタ", minutes: 20, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏むね肉", match: ["鶏むね", "むね肉", "鶏肉"], per: 100, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
    { name: "チーズ", match: ["チーズ"], per: 10, unit: "g" },
  ], steps: ["鶏むね肉を薄くそぎ切りにして塩こしょうする", "小麦粉→溶き卵（チーズ入り）の順にくぐらせて焼く"], tip: "卵液にチーズを混ぜるとコクが出ます" },
  { id: "butabara-daikon", title: "豚バラ大根", minutes: 30, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "豚バラ肉", match: ["豚バラ", "豚肉"], per: 75, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["大根は厚めのいちょう切りにして下ゆでする", "豚バラを焼いてから大根と生姜、だし・醤油・砂糖で煮る"], tip: "一度冷ますと大根に味がしみます" },
  { id: "saba-misoni", title: "さばの味噌煮", minutes: 20, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "さば", match: ["さば", "サバ", "鯖"], per: 1, unit: "切れ" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["さばに熱湯をかけて臭みを取る", "味噌・砂糖・みりん・生姜の煮汁で落し蓋をして煮る"], tip: "煮汁は煮詰めすぎず、照りが出たら火を止めます" },
  { id: "saba-shioyaki", title: "さばの塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "さば", match: ["さば", "サバ", "鯖"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["さばに塩をして10分置き、水分を拭く", "皮目から焼いて大根おろしを添える"], tip: "塩を強めにすると皮がパリッと焼けます" },
  { id: "buri-daikon", title: "ブリ大根", minutes: 35, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "ぶり", match: ["ぶり", "ブリ", "鰤"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["大根を下ゆでし、ぶりは熱湯をかけて霜降りにする", "だし・醤油・砂糖で大根とぶりを煮る"], tip: "冬のぶりは脂がのって格別です" },
  { id: "aji-fry", title: "アジフライ", minutes: 20, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "あじ", match: ["あじ", "アジ", "鯵"], per: 1, unit: "尾" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
  ], steps: ["あじに塩こしょうして小麦粉・卵・パン粉をつける", "カラッと揚げて千切りキャベツを添える"], tip: "ソースとタルタル、両方用意すると楽しいです" },
  { id: "ebi-mayo", title: "エビマヨ", minutes: 20, genre: "中華", method: "揚げる", course: "主菜", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 4, unit: "尾" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1.5, unit: "大さじ" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 20, unit: "g" },
  ], steps: ["えびに片栗粉をまぶして揚げる", "マヨネーズ・砂糖・レモン汁のソースで和える"], tip: "ソースに練乳少しでお店の味に近づきます" },
  { id: "subuta", title: "酢豚", minutes: 25, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
  ], steps: ["豚肉に片栗粉をまぶして揚げ焼きにする", "野菜を炒め、酢・ケチャップ・醤油・砂糖の甘酢あんを絡める"], tip: "野菜は大きめに切ると食べ応えが出ます" },
  { id: "chinjao", title: "ピーマンと豚肉の細切り炒め", minutes: 15, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "ピーマン", match: ["ピーマン"], per: 2, unit: "個" },
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "たけのこ", match: ["たけのこ", "筍"], per: 40, unit: "g" },
  ], steps: ["ピーマンと豚肉を細切りにする", "強火で炒め、醤油とオイスターソース風に味付け"], tip: "ピーマンは最後に入れて色よく仕上げます" },
  { id: "happosai", title: "八宝菜", minutes: 20, genre: "中華", method: "煮る", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "うずら卵", match: ["うずら卵", "うずら"], per: 2, unit: "個" },
  ], steps: ["肉と野菜を炒めて中華だしで煮る", "片栗粉でとろみをつける"], tip: "ごはんにかけると中華丼になります" },
  { id: "gyoza", title: "餃子", minutes: 25, genre: "中華", method: "焼く", course: "主菜", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 60, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "にら", match: ["にら", "ニラ"], per: 0.25, unit: "束" },
    { name: "餃子の皮", match: ["餃子の皮"], per: 8, unit: "枚" },
  ], steps: ["野菜は塩もみして水気を絞り、ひき肉と練る", "皮で包み、フライパンで蒸し焼きにして底をカリッとさせる"], tip: "焼くときの水は熱湯を使うと皮が破れにくいです" },
  { id: "oroshi-hamburg", title: "和風おろしハンバーグ", minutes: 25, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["材料をこねて小判形に整える", "両面焼いて、大根おろしと大葉をのせポン酢をかける"], tip: "大根おろしの水分は軽く切るとソースが薄まりません" },
  { id: "roll-cabbage", title: "ロールキャベツ", minutes: 35, genre: "洋風", method: "煮る", course: "主菜", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 2, unit: "枚" },
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "トマト缶", match: ["トマト缶", "トマト"], per: 0.25, unit: "缶" },
  ], steps: ["キャベツは芯を薄くそいで下ゆでする", "肉だねを巻いて、トマト缶とコンソメで煮込む"], tip: "巻き終わりを下にして並べると崩れません" },
  { id: "macaroni-gratin", title: "マカロニグラタン", minutes: 30, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "マカロニ", match: ["マカロニ", "パスタ"], per: 40, unit: "g" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 150, unit: "mL" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
  ], steps: ["マカロニをゆで、鶏肉と玉ねぎをバターで炒める", "小麦粉と牛乳でホワイトソースを作り、チーズをのせて焼く"], tip: "表面に焼き色がつくまでしっかり焼くと香ばしいです" },
  { id: "doria", title: "ミートドリア", minutes: 25, genre: "洋風", method: "焼く", course: "主食", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
  ], steps: ["ひき肉と玉ねぎでミートソースを作る", "ごはん（別に用意）にソースとホワイトソース、チーズを重ねて焼く"], tip: "ごはんにバターを混ぜるとコクが出ます" },
  // 麺・ごはんもの
  { id: "meat-sauce", title: "ミートソーススパゲッティ", minutes: 30, genre: "洋風", method: "ゆでる", course: "主食", ingredients: [
    { name: "パスタ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "トマト缶", match: ["トマト缶", "トマト"], per: 0.5, unit: "缶" },
  ], steps: ["ひき肉とみじん切りの野菜を炒め、トマト缶で煮込む", "ゆでたパスタにたっぷりかける"], tip: "ソースは多めに作るとドリアやグラタンにも使えます" },
  { id: "napolitan", title: "ナポリタン", minutes: 20, genre: "洋風", method: "炒める", course: "主食", ingredients: [
    { name: "パスタ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "ウインナー", match: ["ウインナー", "ソーセージ"], per: 2, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "ケチャップ", match: ["ケチャップ"], per: 3, unit: "大さじ" },
  ], steps: ["パスタをゆでる", "具材を炒め、ケチャップでしっかり炒め合わせる"], tip: "ケチャップは焦げる手前まで炒めると酸味がまろやかになります" },
  { id: "peperoncino", title: "ペペロンチーノ", minutes: 15, genre: "洋風", method: "ゆでる", course: "主食", ingredients: [
    { name: "パスタ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "にんにく", match: ["にんにく"], per: 1, unit: "かけ" },
    { name: "ベーコン", match: ["ベーコン"], per: 20, unit: "g" },
    { name: "ブロッコリー", match: ["ブロッコリー"], per: 40, unit: "g" },
  ], steps: ["にんにくをオリーブオイルで香りよく熱する（唐辛子は大人の分だけ）", "ゆで汁とパスタを絡めて乳化させる"], tip: "ゆで汁を少しずつ足すとソースがよく絡みます" },
  { id: "kinoko-pasta", title: "和風きのこパスタ", minutes: 20, genre: "和風", method: "ゆでる", course: "主食", ingredients: [
    { name: "パスタ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "しめじ", match: ["しめじ"], per: 0.5, unit: "パック" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
  ], steps: ["きのこをバターで炒める", "パスタと醤油で和え、大葉と海苔をのせる"], tip: "きのこは触りすぎず、焼き色をつけると香りが立ちます" },
  { id: "yakisoba", title: "焼きそば", minutes: 15, genre: "和風", method: "炒める", course: "主食", ingredients: [
    { name: "焼きそば麺", match: ["焼きそば麺", "中華麺", "麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 50, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ソース", match: ["ソース"], per: 2, unit: "大さじ" },
  ], steps: ["麺は袋のまま少し温めてほぐす", "肉と野菜を炒め、麺とソースを絡める"], tip: "麺を先に軽く焼くと香ばしくなります" },
  { id: "yakiudon", title: "焼うどん", minutes: 15, genre: "和風", method: "炒める", course: "主食", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 50, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "かつお節", match: ["かつお節"], per: 2, unit: "g" },
  ], steps: ["うどんをほぐしながら肉と野菜と炒める", "醤油とだしで味付けし、かつお節をかける"], tip: "仕上げのごま油で風味アップです" },
  { id: "curry-udon", title: "カレーうどん", minutes: 20, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "カレールー", match: ["カレールー", "ルー"], per: 1, unit: "かけ" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["だしで豚肉と玉ねぎを煮てカレールーを溶く", "うどんを入れて煮込み、ねぎを散らす"], tip: "片栗粉で少しとろみをつけると汁が冷めにくいです" },
  { id: "sanshoku-don", title: "三色丼", minutes: 20, genre: "和風", method: "炒める", course: "主食", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ほうれん草", match: ["ほうれん草"], per: 0.25, unit: "束" },
  ], steps: ["ひき肉は甘辛いそぼろに、卵は炒り卵にする", "ごはん（別に用意）に、ほうれん草のおひたしと3色並べる"], tip: "並べ方をまっすぐにすると見た目がきれいです" },
  { id: "gyudon", title: "牛丼", minutes: 20, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "牛肉", match: ["牛肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["玉ねぎをだし・醤油・砂糖で煮る", "牛肉を加えてさっと煮て、ごはんにのせる（ごはんは別に用意）"], tip: "牛肉は煮すぎると固くなるので最後に入れます" },
  { id: "tonkatsu", title: "とんかつ", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "豚ロース", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["豚肉の筋を切り、塩こしょうして衣をつける", "カラッと揚げて千切りキャベツを添える"], tip: "揚げる前に10分置くと衣がはがれにくくなります" },
  { id: "menchi", title: "メンチカツ", minutes: 25, genre: "洋風", method: "揚げる", course: "主菜", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 3, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
  ], steps: ["材料をよくこねて厚めの小判形にする", "衣をつけて中までしっかり揚げる"], tip: "肉だねを冷蔵庫で休ませると形が崩れません" },
  { id: "korokke", title: "じゃがいもコロッケ", minutes: 30, genre: "洋風", method: "揚げる", course: "主菜", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "ひき肉", match: ["ひき肉"], per: 40, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["じゃがいもを茹でて潰し、炒めたひき肉と玉ねぎを混ぜる", "小判形にして衣をつけ、カラッと揚げる"], tip: "たねは冷ましてから成形すると揚げやすいです" },
  { id: "nanbanzuke", title: "鶏の南蛮漬け", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "酢", match: ["酢"], per: 1.5, unit: "大さじ" },
  ], steps: ["鶏肉に片栗粉をまぶして揚げる", "甘酢にスライス野菜と一緒に漬ける"], tip: "一晩漬けると味がなじんでさらに美味しいです" },
  { id: "sasami-cheese", title: "ささみのチーズ焼き", minutes: 15, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏ささみ", match: ["ささみ", "鶏むね", "鶏肉"], per: 2, unit: "本" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["ささみの筋を取り、観音開きにして塩こしょうする", "大葉とチーズを挟んで焼く"], tip: "焼きすぎると固くなるので中火でふっくらと" },
  { id: "buta-misozuke", title: "豚肉の味噌漬け焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "豚ロース", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
  ], steps: ["味噌・みりん・砂糖のタレに豚肉を30分漬ける", "味噌を拭ってから弱めの中火で焼く"], tip: "味噌は焦げやすいので火加減に注意です" },
  // 副菜バリエーション
  { id: "horenso-ohitashi", title: "ほうれん草のおひたし", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", ingredients: [
    { name: "ほうれん草", match: ["ほうれん草"], per: 0.5, unit: "束" },
    { name: "かつお節", match: ["かつお節"], per: 2, unit: "g" },
  ], steps: ["ほうれん草をさっとゆでて水気を絞る", "だし醤油に浸しかつお節をかける"], tip: "根元から先にゆでると均一に火が入ります" },
  { id: "horenso-gomaae", title: "ほうれん草のごま和え", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "ほうれん草", match: ["ほうれん草"], per: 0.5, unit: "束" },
    { name: "ごま", match: ["ごま"], per: 1, unit: "大さじ" },
  ], steps: ["ほうれん草をゆでて絞る", "すりごま・砂糖・醤油で和える"], tip: "ごまは食べる直前にすると香りがよいです" },
  { id: "komatsuna-nibitashi", title: "小松菜の煮びたし", minutes: 10, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "小松菜", match: ["小松菜"], per: 0.5, unit: "束" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["小松菜と油揚げをだしで軽く煮る", "薄口醤油で味を整えて浸す"], tip: "煮すぎず、色よく仕上げるのがコツです" },
  { id: "moyashi-namuru", title: "もやしのナムル", minutes: 10, genre: "中華", method: "和える", course: "副菜", ingredients: [
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
    { name: "ごま油", match: ["ごま油"], per: 1, unit: "小さじ" },
    { name: "ごま", match: ["ごま"], per: 0.5, unit: "大さじ" },
  ], steps: ["もやしをさっとゆでて水気を切る", "ごま油・塩・すりごまで和える"], tip: "熱いうちに味付けするとよく馴染みます" },
  { id: "tako-sunomono", title: "たこときゅうりの酢の物", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "たこ", match: ["たこ"], per: 40, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "わかめ", match: ["わかめ"], per: 3, unit: "g" },
  ], steps: ["きゅうりを薄切りにして塩もみする", "たことわかめと甘酢で和える"], tip: "たこは斜め薄切りにすると食べやすいです" },
  { id: "nasu-agebitashi", title: "なすの揚げびたし", minutes: 15, genre: "和風", method: "揚げる", course: "副菜", ingredients: [
    { name: "なす", match: ["なす"], per: 1.5, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["なすを素揚げする", "だし・醤油・みりんの浸し汁に熱いうちに入れる"], tip: "生姜と大葉でさっぱり仕上げます" },
  { id: "mugen-piman", title: "無限ピーマン", minutes: 10, genre: "中華", method: "炒める", course: "副菜", ingredients: [
    { name: "ピーマン", match: ["ピーマン"], per: 2, unit: "個" },
    { name: "ツナ缶", match: ["ツナ缶", "ツナ"], per: 0.5, unit: "缶" },
    { name: "ごま油", match: ["ごま油"], per: 1, unit: "小さじ" },
  ], steps: ["ピーマンを細切りにしてレンジで加熱する", "ツナとごま油・醤油で和える"], tip: "子どもでも食べやすいピーマン料理です" },
  { id: "broccoli-gomaae", title: "ブロッコリーのごま和え", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "ブロッコリー", match: ["ブロッコリー"], per: 0.5, unit: "株" },
    { name: "ごま", match: ["ごま"], per: 1, unit: "大さじ" },
  ], steps: ["ブロッコリーを小房に分けてゆでる", "すりごま・砂糖・醤油で和える"], tip: "茎も薄く切って使うと無駄がありません" },
  { id: "coleslaw", title: "コールスローサラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "コーン缶", match: ["コーン缶", "とうもろこし"], per: 0.25, unit: "缶" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1.5, unit: "大さじ" },
  ], steps: ["キャベツとにんじんを千切りにして塩もみする", "コーンとマヨネーズ・酢で和える"], tip: "少し置くと味がなじみます" },
  { id: "macaroni-salad", title: "マカロニサラダ", minutes: 15, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "マカロニ", match: ["マカロニ", "パスタ"], per: 30, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["マカロニをゆでる", "具材とマヨネーズで和える"], tip: "マカロニは少し柔らかめにゆでると味が絡みます" },
  { id: "satsumaimo-salad", title: "さつまいもサラダ", minutes: 15, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 75, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.3, unit: "本" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1, unit: "大さじ" },
  ], steps: ["さつまいもを蒸して一口大に切る", "きゅうりとマヨネーズで和える"], tip: "はちみつを少し足すと甘みが増します" },
  { id: "daikon-salad", title: "大根サラダ", minutes: 10, genre: "和風", method: "サラダ", course: "副菜", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 75, unit: "g" },
    { name: "ツナ缶", match: ["ツナ缶", "ツナ"], per: 0.5, unit: "缶" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["大根を千切りにして塩もみする", "ツナとポン酢で和え、大葉をのせる"], tip: "大根の葉があれば刻んで混ぜても" },
  { id: "harusame-salad", title: "春雨サラダ", minutes: 15, genre: "中華", method: "サラダ", course: "副菜", ingredients: [
    { name: "春雨", match: ["春雨"], per: 25, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["春雨をゆでて食べやすく切る", "細切りの具と甘酢・ごま油で和える"], tip: "春雨がドレッシングを吸うので食べる直前に和えます" },
  { id: "kiriboshi", title: "切干大根の煮物", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "切干大根", match: ["切干大根"], per: 15, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["切干大根を水で戻す", "にんじんと油揚げと一緒に甘辛く煮る"], tip: "戻し汁を煮汁に使うとうま味が増します" },
  { id: "hijiki-ni", title: "ひじきの煮物", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "ひじき", match: ["ひじき"], per: 10, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "大豆", match: ["大豆"], per: 20, unit: "g" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["ひじきを水で戻す", "具材と一緒にだし・醤油・砂糖で煮る"], tip: "鉄分たっぷりの常備菜です" },
  { id: "daigakuimo", title: "大学芋", minutes: 20, genre: "和風", method: "揚げる", course: "副菜", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 100, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
    { name: "ごま", match: ["ごま"], per: 0.5, unit: "大さじ" },
  ], steps: ["さつまいもを乱切りにして揚げる", "砂糖・醤油・水の蜜を絡め、黒ごまを振る"], tip: "蜜は熱いうちに絡めると均一に仕上がります" },
  // 汁物バリエーション
  { id: "nameko-miso", title: "なめこの味噌汁", minutes: 10, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "なめこ", match: ["なめこ"], per: 0.5, unit: "袋" },
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["なめこをさっと洗ってだしで煮る", "豆腐を入れて味噌を溶く"], tip: "なめこは煮すぎるととろみが抜けるので短めに" },
  { id: "asari-miso", title: "あさりの味噌汁", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "あさり", match: ["あさり"], per: 75, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["砂抜きしたあさりを水から煮て口を開ける", "味噌を溶いてねぎを散らす"], tip: "あさりの汁がだしになるので水から煮ます" },
  { id: "onion-soup", title: "玉ねぎのコンソメスープ", minutes: 20, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "ベーコン", match: ["ベーコン"], per: 15, unit: "g" },
  ], steps: ["玉ねぎをじっくり炒めて甘みを出す", "コンソメで煮て塩こしょうで仕上げる"], tip: "チーズとパンをのせて焼くとオニオングラタンスープ風です" },
  { id: "clam-chowder", title: "クラムチャウダー", minutes: 25, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "あさり", match: ["あさり"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 0.5, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "ベーコン", match: ["ベーコン"], per: 15, unit: "g" },
  ], steps: ["ベーコンと野菜を炒めて小麦粉を振る", "あさりの汁と牛乳で煮込む"], tip: "あさりは缶詰でも作れます" },
  // 追加の主菜・主食（魚・肉・麺の底上げ）
  { id: "saba-tatsuta", title: "さばの竜田揚げ", minutes: 20, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "さば", match: ["さば", "サバ", "鯖"], per: 1, unit: "切れ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
  ], steps: ["さばを生姜醤油に15分漬ける", "片栗粉をまぶしてカラッと揚げる"], tip: "漬け汁の水分を拭くと油はねしにくいです" },
  { id: "tebamoto-sappari", title: "手羽元のさっぱり煮", minutes: 30, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "手羽元", match: ["手羽元", "手羽"], per: 3, unit: "本" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "酢", match: ["酢"], per: 1.5, unit: "大さじ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["手羽元を焼いてから酢・醤油・砂糖で煮る", "ゆで卵を入れて一緒に煮含める"], tip: "酢でお肉が柔らかく、さっぱり食べられます" },
  { id: "buta-kakuni", title: "豚の角煮", minutes: 50, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "豚バラ肉", match: ["豚バラ", "豚肉"], per: 100, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["豚バラを下茹でして脂を落とす", "醤油・砂糖・酒で弱火でとろとろに煮る"], tip: "一度冷ますと味がしみて切りやすくなります" },
  { id: "ika-butter", title: "いかのバター醤油炒め", minutes: 10, genre: "和風", method: "炒める", course: "主菜", ingredients: [
    { name: "いか", match: ["いか", "イカ"], per: 0.5, unit: "杯" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
    { name: "にんにく", match: ["にんにく"], per: 0.5, unit: "かけ" },
  ], steps: ["いかを輪切りにする", "バターとにんにくで強火で炒め、醤油を回しかける"], tip: "炒めすぎると固くなるので手早く仕上げます" },
  { id: "tara-hoiru", title: "たらのホイル焼き", minutes: 20, genre: "和風", method: "蒸す", course: "主菜", ingredients: [
    { name: "たら", match: ["たら", "鱈"], per: 1, unit: "切れ" },
    { name: "しめじ", match: ["しめじ"], per: 0.25, unit: "パック" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "バター", match: ["バター"], per: 5, unit: "g" },
  ], steps: ["ホイルにたらと野菜、バターを包む", "フライパンやオーブンで蒸し焼きにする"], tip: "ポン酢をかけるとさっぱりします" },
  { id: "karei-nitsuke", title: "かれいの煮付け", minutes: 20, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "かれい", match: ["かれい", "カレイ"], per: 1, unit: "切れ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["煮汁を煮立ててかれいを入れる", "落し蓋をして照りよく煮る"], tip: "皮目に切り込みを入れると味が入りやすいです" },
  { id: "potofu", title: "ポトフ", minutes: 30, genre: "洋風", method: "煮る", course: "汁物", ingredients: [
    { name: "ウインナー", match: ["ウインナー", "ソーセージ"], per: 2, unit: "本" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["野菜を大きめに切ってコンソメで煮る", "ウインナーを入れて塩こしょうで仕上げる"], tip: "粒マスタードを添えると大人の味になります" },
  { id: "chapche", title: "チャプチェ", minutes: 20, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "春雨", match: ["春雨"], per: 30, unit: "g" },
    { name: "牛肉", match: ["牛肉"], per: 50, unit: "g" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["春雨をゆでて食べやすく切る", "牛肉と野菜を炒め、春雨と甘辛ダレを絡める"], tip: "韓国の春雨のお祝い料理。ごま油の香りが決め手です" },
  { id: "ebi-chili", title: "エビチリ", minutes: 20, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 4, unit: "尾" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "ケチャップ", match: ["ケチャップ"], per: 2, unit: "大さじ" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
  ], steps: ["えびに片栗粉をまぶして揚げ焼きにする", "ケチャップベースのチリソース（辛さは大人の分だけ後がけ）で絡める"], tip: "卵白を加えたソースにするとまろやかになります" },
  { id: "wonton-soup", title: "ワンタンスープ", minutes: 15, genre: "中華", method: "スープ", course: "汁物", ingredients: [
    { name: "餃子", match: ["餃子", "ワンタン"], per: 3, unit: "個" },
    { name: "チンゲン菜", match: ["チンゲン菜"], per: 0.5, unit: "株" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["中華スープを沸かして餃子を入れる", "チンゲン菜を加え、ごま油を垂らす"], tip: "冷凍餃子で手軽にワンタン風スープになります" },
  { id: "gomoku-takikomi", title: "五目炊き込みごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "米", match: ["米", "ごはん"], per: 75, unit: "g" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["具材を小さく切って米と一緒に炊飯器に入れる", "だし・醤油・みりんで味付けして炊く"], tip: "具は米の上にのせて混ぜずに炊くのがコツです" },
  { id: "yaki-onigiri", title: "焼きおにぎり", minutes: 15, genre: "和風", method: "焼く", course: "主食", ingredients: [
    { name: "米", match: ["米", "ごはん"], per: 100, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 0.5, unit: "大さじ" },
  ], steps: ["ごはんを三角に固くにぎる", "フライパンで両面を焼き、味噌（または醤油）を塗って焼く"], tip: "香ばしい焼き目がおいしさの決め手です" },
];

// ============================================================
// 大幅拡充（2026-11-11「固定レシピ1000を目指そう」）
// 材料は [名前, マッチ, 1人分, 単位] のタプルで書くコンパクト記法 DR を使う。
// ============================================================
const DR = (id, title, minutes, genre, method, course, ingredients, steps, tip, note) => {
  const r = {
    id, title, minutes, genre, method, course,
    ingredients: ingredients.map(([name, match, per, unit]) => ({ name, match, per, unit })),
    steps, tip,
  };
  if (note) r.note = note;
  return r;
};

// ---------- レンチン枠（電子レンジだけで作る・火を使わない） ----------
// 手順には必ず 600W の加熱時間の目安を入れる。method は「レンジ」。
export const MICROWAVE_RECIPES = [
  DR("mw-mushidori", "レンジ蒸し鶏のねぎ塩だれ", 15, "和風", "レンジ", "主菜",
    [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]],
    ["鶏肉はフォークで数か所刺し、酒と塩をふる", "耐熱皿にのせてふんわりラップし、600Wで4分加熱する", "ラップのまま3分蒸らし、ねぎ塩だれ（ねぎ・ごま油・塩）をかける"], "蒸らし時間をとるとしっとり仕上がります"),
  DR("mw-butabara-daikon", "レンジで豚バラ大根", 20, "和風", "レンジ", "主菜",
    [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["大根", ["大根", "だいこん"], 100, "g"]],
    ["大根は薄めのいちょう切りにし、豚肉は一口大に切る", "耐熱容器に大根→豚肉の順に重ね、醤油・みりん・砂糖と水を加える", "ラップして600Wで8分加熱し、上下を返してさらに600Wで4分加熱する"], "大根を薄く切るほど味がしみやすくなります"),
  DR("mw-moyashi-namul", "もやしのレンジナムル", 10, "中華", "レンジ", "副菜",
    [["もやし", ["もやし"], 0.5, "袋"], ["にんじん", ["にんじん", "人参"], 0.2, "本"]],
    ["もやしと千切りにんじんを耐熱容器に入れ、ラップして600Wで2分30秒加熱する", "水気を絞り、ごま油・鶏ガラスープの素・塩で和える"], "加熱しすぎるとシャキシャキ感がなくなるので短めに"),
  DR("mw-chawanmushi", "レンジ茶碗蒸し風", 15, "和風", "レンジ", "副菜",
    [["卵", ["卵", "たまご"], 1, "個"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 20, "g"], ["しいたけ", ["しいたけ"], 0.5, "個"], ["かまぼこ", ["かまぼこ"], 1, "切れ"]],
    ["卵をだしで溶きのばしてこし、器に入れる", "鶏肉・しいたけ・かまぼこをのせ、ラップして600Wで2分加熱する", "200W（または解凍モード）で3分追加し、竹串で固さを確認する"], "急に加熱すると「す」が入るので後半は弱めがコツ"),
  DR("mw-omelette", "レンジオムレツ", 10, "洋風", "レンジ", "主菜",
    [["卵", ["卵", "たまご"], 2, "個"], ["ハム", ["ハム"], 15, "g"], ["ピーマン", ["ピーマン"], 0.5, "個"], ["チーズ", ["チーズ"], 10, "g"]],
    ["平らな耐熱皿にラップを敷き、溶き卵を流す", "刻んだハム・ピーマン・チーズを散らし、600Wで2分30秒加熱する", "半熟のうちにラップごと半分に折って形を整え、1分蒸らす"], "ラップごと折ると包む手間なく形が決まります"),
  DR("mw-tsuna-hakusai", "ツナと白菜のレンジ重ね蒸し", 15, "和風", "レンジ", "主菜",
    [["白菜", ["白菜"], 0.125, "玉"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["ポン酢", ["ポン酢"], 1, "大さじ"]],
    ["白菜はざく切りにして耐熱容器に敷く", "ツナを汁ごと散らし、ラップして600Wで5分加熱する", "ポン酢をかけて完成"], "ツナの汁がだし代わりになるので捨てないで"),
  DR("mw-mabo-nasu", "レンジ麻婆なす", 15, "中華", "レンジ", "主菜",
    [["なす", ["なす", "ナス"], 1.5, "本"], ["ひき肉", ["ひき肉"], 60, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["なすは乱切りにして水にさらし、水気を切る", "耐熱容器になす・ひき肉・味噌と醤油と砂糖のタレを入れ、ラップして600Wで5分加熱する", "一度混ぜてさらに600Wで2分加熱し、ねぎとごま油を回しかける"], "ひき肉に火が通ったか中心まで必ず確認を"),
  DR("mw-satsumaimo-lemon", "さつまいものレモン煮", 15, "和風", "レンジ", "副菜",
    [["さつまいも", ["さつまいも", "薩摩芋"], 0.5, "本"], ["レモン", ["レモン"], 0.25, "個"]],
    ["さつまいもは輪切りにして水にさらす", "耐熱容器に砂糖・水・レモン汁と輪切りレモンを入れ、ラップして600Wで5分加熱する", "そのまま冷まして味をなじませる"], "冷ますとしっとり甘くなります"),
  DR("mw-risotto", "レンジきのこリゾット", 20, "洋風", "レンジ", "主食",
    [["米", ["米", "ごはん"], 75, "g"], ["しめじ", ["しめじ"], 0.25, "パック"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["チーズ", ["チーズ"], 15, "g"], ["コンソメ", ["コンソメ"], 0.5, "個"]],
    ["深めの耐熱容器に温かいごはん・きのこ・玉ねぎ・コンソメ・水を入れる", "ラップせず600Wで4分加熱し、一度混ぜる", "チーズを加えてさらに600Wで2分加熱し、塩こしょうで整える"], "温かいごはんから始めると芯が残りません"),
  DR("mw-onsen-tamago", "レンジ温泉卵", 10, "和風", "レンジ", "副菜",
    [["卵", ["卵", "たまご"], 1, "個"]],
    ["マグカップに卵を割り入れ、黄身に爪楊枝で1か所穴をあける", "卵がかぶるまで水を入れ、600Wで50秒加熱する", "水を切って器に移す（固さが足りなければ10秒ずつ追加）"], "黄身に穴をあけないと破裂するので必ずあけてください"),
  DR("mw-kabocha-ni", "かぼちゃのレンジ煮物", 15, "和風", "レンジ", "副菜",
    [["かぼちゃ", ["かぼちゃ", "南瓜"], 100, "g"]],
    ["かぼちゃは一口大に切る", "耐熱容器に醤油・砂糖・みりんと水を入れ、ラップして600Wで5分加熱する", "上下を返して600Wで2分加熱し、そのまま粗熱を取る"], "煮崩れしにくく、色もきれいに仕上がります"),
  DR("mw-nasu-mushi", "なすのレンジ蒸し", 10, "和風", "レンジ", "副菜",
    [["なす", ["なす", "ナス"], 1, "本"], ["大葉", ["大葉", "しそ"], 1, "枚"], ["ポン酢", ["ポン酢"], 1, "大さじ"]],
    ["なすはヘタを落として1本ずつラップで包む", "600Wで3分30秒加熱し、冷水で冷ます", "手で裂いてポン酢と刻み大葉をかける"], "皮ごと包んで加熱すると色が残ります"),
  DR("mw-salmon-mushi", "鮭ときのこのレンジ蒸し", 12, "和風", "レンジ", "主菜",
    [["鮭", ["鮭", "さけ"], 1, "切れ"], ["しめじ", ["しめじ"], 0.25, "パック"], ["えのき", ["えのき"], 0.25, "袋"]],
    ["耐熱皿にきのこを敷いて鮭をのせ、酒と塩をふる", "ラップして600Wで4分加熱する", "ポン酢かバター醤油で仕上げる"], "きのこの旨みが鮭に移ります"),
  DR("mw-hamburg", "レンジハンバーグ", 20, "洋風", "レンジ", "主菜",
    [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["パン粉", ["パン粉"], 1, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]],
    ["材料をよく練って小判型にまとめ、耐熱皿にのせる", "ラップして600Wで4分加熱する", "ケチャップとソースを混ぜたタレをかけ、さらに600Wで1分30秒加熱し、中心の火通りを確認する"], "肉汁が透明になるまで加熱するのが安全ポイント"),
  DR("mw-nikujaga", "レンジ肉じゃが", 20, "和風", "レンジ", "主菜",
    [["豚肉", ["豚肉"], 60, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]],
    ["材料を一口大に切り、耐熱容器に調味料と水と一緒に入れる", "ラップして600Wで7分加熱する", "混ぜてさらに600Wで4分加熱し、5分蒸らして味をなじませる"], "蒸らしで味がぐっと入ります"),
  DR("mw-yasai-mushi", "温野菜のレンジ蒸し", 10, "洋風", "レンジ", "副菜",
    [["ブロッコリー", ["ブロッコリー"], 60, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["かぼちゃ", ["かぼちゃ", "南瓜"], 50, "g"]],
    ["野菜を一口大に切り、耐熱容器に並べる", "水を少しふってラップし、600Wで4分加熱する", "好みのドレッシングやごまだれで食べる"], "火の通りにくい野菜から先に1分長く加熱を"),
  DR("mw-mabo-harusame", "レンジ麻婆春雨", 15, "中華", "レンジ", "主菜",
    [["春雨", ["春雨"], 25, "g"], ["ひき肉", ["ひき肉"], 50, "g"], ["にら", ["にら", "ニラ"], 0.25, "束"]],
    ["春雨は熱湯（またはレンジで3分）で戻して切る", "耐熱容器に春雨・ひき肉・味噌と鶏ガラスープの素と水を入れ、ラップして600Wで4分加熱する", "にらを加えて混ぜ、600Wで1分加熱する"], "春雨が汁を吸うので、食べる直前に仕上げて"),
  DR("mw-chikuzenni", "レンジ筑前煮", 20, "和風", "レンジ", "副菜",
    [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["レンコン", ["レンコン", "れんこん"], 40, "g"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"]],
    ["材料を一口大に切って耐熱容器に入れ、調味料とだしを加える", "ラップして600Wで8分加熱する", "混ぜてさらに600Wで4分加熱し、蒸らして味を含ませる"], "根菜は小さめに切ると火通りがそろいます"),
  DR("mw-tsuna-pasta", "レンジツナトマトパスタ", 15, "洋風", "レンジ", "主食",
    [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["トマト缶", ["トマト缶"], 100, "g"]],
    ["深めの耐熱容器に半分に折ったパスタ・水・塩を入れ、ラップせず600Wで袋の表示時間＋1分加熱する", "ツナとトマト缶を加えて混ぜ、600Wで2分加熱する", "オリーブオイルとこしょうで仕上げる"], "吹きこぼれ防止に深い容器を使ってください"),
  DR("mw-pudding", "レンジカスタードプリン", 15, "洋風", "レンジ", "デザート",
    [["卵", ["卵", "たまご"], 1, "個"], ["牛乳", ["牛乳"], 100, "mL"], ["砂糖", ["砂糖"], 1, "大さじ"]],
    ["卵・牛乳・砂糖をよく混ぜてマグカップにこし入れる", "ラップして600Wで1分30秒加熱する", "表面がふるふる固まったら冷蔵庫で冷やす"], "加熱しすぎると固くなるので様子を見ながら"),
  DR("mw-mugcake", "レンジチョコマグケーキ", 10, "洋風", "レンジ", "デザート",
    [["小麦粉", ["小麦粉"], 3, "大さじ"], ["チョコレート", ["チョコ", "チョコレート"], 20, "g"], ["牛乳", ["牛乳"], 3, "大さじ"], ["砂糖", ["砂糖"], 1, "大さじ"]],
    ["マグカップに材料を全部入れてよく混ぜる", "ラップせず600Wで1分30秒加熱する", "竹串を刺して生地がつかなければ完成"], "カップの8分目までにすると溢れません"),
  DR("mw-jagabata", "レンジじゃがバター", 10, "洋風", "レンジ", "副菜",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["バター", ["バター"], 10, "g"]],
    ["じゃがいもは洗って皮ごとラップで包む", "600Wで5分加熱し、竹串が通るか確認する", "十字に切り開いてバターと塩をのせる"], "丸ごと包むとホクホクに仕上がります"),
  DR("mw-atsuage", "厚揚げのレンジ味噌チーズ", 10, "和風", "レンジ", "副菜",
    [["厚揚げ", ["厚揚げ"], 0.5, "枚"], ["チーズ", ["チーズ"], 15, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]],
    ["厚揚げに味噌を薄く塗り、チーズをのせる", "ラップせず600Wで2分加熱し、チーズを溶かす", "刻みねぎを散らす"], "チーズが溶けたらすぐ完成の簡単おかず"),
  DR("mw-cabbage-buta", "キャベツと豚肉のレンジ重ね蒸し", 15, "和風", "レンジ", "主菜",
    [["キャベツ", ["キャベツ"], 80, "g"], ["豚バラ肉", ["豚バラ", "豚肉"], 80, "g"], ["ポン酢", ["ポン酢"], 1, "大さじ"]],
    ["耐熱容器にキャベツと豚肉を交互に重ね、酒と塩をふる", "ラップして600Wで5分加熱する", "火通りを確認し、ポン酢をかける"], "ミルフィーユ状に重ねると見た目もきれいです"),
];

// ---------- バズ時短枠（SNS・レシピサイトで定番の系統を、このアプリ用に書き起こし） ----------
// 全品15分以内・2〜4ステップ・特別な材料なし。レンジで作る品は method「レンジ」。
export const BUZZ_RECIPES = [
  DR("buzz-mugen-hakusai", "無限白菜", 10, "和風", "和える", "副菜",
    [["白菜", ["白菜"], 0.06, "玉"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["白菜を細切りにして塩をふり、5分置いて水気を絞る", "ツナ・鶏ガラスープの素・ごま油で和える"], "作り置きで翌日もおいしい定番"),
  DR("buzz-mugen-moyashi", "無限もやし", 10, "中華", "和える", "副菜",
    [["もやし", ["もやし"], 0.5, "袋"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["もやしを熱湯でさっとゆでて、水気をしっかり切る", "ツナ・鶏ガラスープの素・ごま油・こしょうで和える"], "水気をしっかり切るのがべちゃっとしないコツ"),
  DR("buzz-mugen-ninjin", "無限にんじん", 10, "和風", "和える", "副菜",
    [["にんじん", ["にんじん", "人参"], 1, "本"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["にんじんを千切りにしてさっとゆで、水気を切る", "ツナ・マヨネーズ・醤油で和える"], "にんじん嫌いでも食べやすい甘さです"),
  DR("buzz-mugen-nasu", "無限なす", 10, "和風", "レンジ", "副菜",
    [["なす", ["なす", "ナス"], 1.5, "本"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["なすは乱切りにしてラップで包み、600Wで3分加熱する", "ツナ・ポン酢・ごま油で和え、かつお節をかける"], "とろとろのなすにツナの旨みが合います"),
  DR("buzz-mugen-kyuri", "無限きゅうり", 10, "中華", "和える", "副菜",
    [["きゅうり", ["きゅうり"], 1.5, "本"]],
    ["きゅうりは麺棒で軽くたたいて一口大に割る", "鶏ガラスープの素・ごま油・酢・砂糖で和えて10分置く"], "たたくと味がしみ込みやすくなります"),
  DR("buzz-mugen-cabbage", "無限キャベツ", 10, "洋風", "和える", "副菜",
    [["キャベツ", ["キャベツ"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["キャベツはざく切りにしてさっとゆで、水気を絞る", "ツナ・マヨネーズ・こしょうで和える"], "温かいうちに和えると味がなじみます"),
  DR("buzz-mugen-lettuce", "無限レタス", 5, "中華", "和える", "副菜",
    [["レタス", ["レタス"], 60, "g"], ["海苔", ["海苔"], 1, "枚"]],
    ["レタスを一口大にちぎる", "ごま油・塩・ちぎった海苔で和える"], "食べる直前に和えるとシャキシャキです"),
  DR("buzz-yamitsuki-hakusai", "やみつき白菜", 10, "和風", "和える", "副菜",
    [["白菜", ["白菜"], 0.06, "玉"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["白菜をざく切りにして塩昆布と袋に入れ、軽くもむ", "ごま油を回しかけて5分置く"], "塩昆布の旨みだけで味が決まります"),
  DR("buzz-yamitsuki-avocado", "やみつきアボカド", 5, "和風", "和える", "副菜",
    [["アボカド", ["アボカド"], 0.5, "個"], ["海苔", ["海苔"], 0.5, "枚"]],
    ["アボカドを一口大に切る", "醤油・ごま油・ちぎった海苔で和える"], "ごはんにのせてもおいしい一品"),
  DR("buzz-mayaku-tamago", "やみつき味付け卵", 10, "和風", "漬ける", "副菜",
    [["卵", ["卵", "たまご"], 2, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["卵を沸騰した湯で7分ゆでて半熟ゆで卵を作り、殻をむく", "醤油・砂糖・水・刻みねぎのタレに漬ける（2時間〜）"], "漬け時間で味の濃さが変わります。ごはんのお供に"),
  DR("buzz-akuma-onigiri", "天かすと青のりの混ぜおにぎり", 10, "和風", "和える", "主食",
    [["米", ["米", "ごはん"], 100, "g"], ["天かす", ["天かす", "揚げ玉"], 1, "大さじ"], ["青のり", ["青のり", "海苔"], 0.5, "小さじ"]],
    ["温かいごはんに天かす・青のり・めんつゆを混ぜる", "ラップで三角ににぎる"], "天かすの食感が楽しい混ぜごはんおにぎり"),
  DR("buzz-onepan-tarako", "ワンパンたらこパスタ", 15, "洋風", "炒める", "主食",
    [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["たらこ", ["たらこ"], 0.5, "腹"], ["バター", ["バター"], 10, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["フライパンに水と塩、半分に折ったパスタを入れてゆでる", "水分が減ってきたらバターとほぐしたたらこを絡める", "刻み大葉と海苔をのせる"], "洗い物はフライパン1つの時短パスタ"),
  DR("buzz-onepan-carbonara", "ワンパンカルボナーラ", 15, "洋風", "炒める", "主食",
    [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["ベーコン", ["ベーコン"], 20, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["牛乳", ["牛乳"], 100, "mL"], ["チーズ", ["チーズ"], 15, "g"]],
    ["フライパンでベーコンとパスタを水と牛乳で煮る", "火を止めて卵とチーズを素早く絡める", "こしょうをたっぷりかける"], "火を止めてから卵を入れると固まりません"),
  DR("buzz-tsuna-toast", "ツナマヨトースト", 10, "洋風", "焼く", "主食",
    [["食パン", ["食パン", "パン"], 1, "枚"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"], ["チーズ", ["チーズ"], 10, "g"]],
    ["ツナとマヨネーズを混ぜてパンにのせる", "チーズをのせてトースターで焼き色がつくまで焼く"], "玉ねぎのみじん切りを混ぜると食感アップ"),
  DR("buzz-renji-shogayaki", "レンジ生姜焼き風", 15, "和風", "レンジ", "主菜",
    [["豚ロース", ["豚ロース", "豚肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["生姜", ["生姜", "しょうが"], 5, "g"]],
    ["豚肉と玉ねぎを生姜・醤油・みりんのタレに10分漬ける", "耐熱皿に広げてラップし、600Wで4分加熱する", "混ぜてさらに600Wで1分30秒加熱し、火通りを確認する"], "油で焼かない分さっぱり仕上がります"),
  DR("buzz-renji-teriyaki", "レンジ照り焼きチキン", 15, "和風", "レンジ", "主菜",
    [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"]],
    ["鶏肉にフォークで穴をあけ、醤油・みりん・砂糖のタレを絡める", "皮目を下にしてラップし、600Wで4分加熱する", "裏返してタレを絡め、600Wで2分加熱して蒸らす"], "タレを後がけすると照りが出ます"),
  DR("buzz-tuna-daikon-salad", "ツナと大根の和えるだけサラダ", 10, "和風", "和える", "副菜",
    [["大根", ["大根", "だいこん"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["大根を千切りにして塩をふり、水気を絞る", "ツナ・ポン酢・大葉で和える"], "火も包丁テクもいらない簡単サラダ"),
  DR("buzz-tomato-marine", "トマトの即席マリネ", 10, "洋風", "漬ける", "副菜",
    [["トマト", ["トマト"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]],
    ["トマトはくし形、玉ねぎは薄切りにする", "酢・オリーブオイル・砂糖・塩の液に10分漬ける"], "冷やすほどおいしい夏の副菜"),
  DR("buzz-ham-cheese-roll", "ハムとチーズの皮包み焼き", 15, "洋風", "焼く", "主菜",
    [["餃子の皮", ["餃子の皮"], 4, "枚"], ["ハム", ["ハム"], 20, "g"], ["チーズ", ["チーズ"], 20, "g"]],
    ["餃子の皮にハムとチーズをのせて半分に折り、縁を水で留める", "フライパンで両面をこんがり焼く"], "お弁当にも入れやすい一口サイズ"),
  DR("buzz-pirikara-konnyaku", "ピリ辛こんにゃく", 10, "和風", "炒める", "副菜",
    [["こんにゃく", ["こんにゃく"], 0.5, "枚"]],
    ["こんにゃくは手でちぎって下ゆでする（レンジ600W2分でも可）", "ごま油で炒め、醤油・砂糖・一味唐辛子（大人の分だけ）で味付ける"], "ちぎると味がしみ込みやすくなります"),
  DR("buzz-shiokonbu-tomato", "トマトの塩昆布和え", 5, "和風", "和える", "副菜",
    [["トマト", ["トマト"], 1, "個"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["トマトを一口大に切る", "塩昆布とごま油で和える"], "あと一品ほしいときの5分副菜"),
  DR("buzz-natto-yakko", "納豆やっこ", 5, "和風", "和える", "副菜",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["納豆", ["納豆"], 1, "パック"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["豆腐の水気を切って器に盛る", "混ぜた納豆と刻みねぎをのせ、付属のタレか醤油をかける"], "キムチをのせても合います"),
  DR("buzz-tofu-steak", "豆腐ステーキの照り焼き風", 15, "和風", "焼く", "主菜",
    [["豆腐", ["豆腐"], 0.75, "丁"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["豆腐はキッチンペーパーで水気を切り、片栗粉をまぶす", "油で両面をこんがり焼き、醤油・みりんのタレを絡める"], "表面カリッと中ふんわりの食感が楽しい"),
  DR("buzz-sabacan-salad", "サバ缶と玉ねぎのサラダ", 10, "和風", "和える", "副菜",
    [["サバ缶", ["サバ缶", "さば缶"], 0.5, "缶"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["玉ねぎは薄切りにして水にさらし、水気を切る", "ほぐしたサバ缶とポン酢・マヨネーズ少しで和え、大葉を散らす"], "サバ缶の汁は少し残すと旨みが増します"),
  DR("buzz-tsuna-potato", "ツナポテトのマヨ和え", 15, "洋風", "レンジ", "副菜",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["じゃがいもは一口大に切り、ラップして600Wで5分加熱する", "熱いうちにツナ・マヨネーズ・塩こしょうで和える"], "温かいサラダ感覚で食べられます"),
  DR("buzz-kyuri-ume", "きゅうりの梅たたき", 5, "和風", "和える", "副菜",
    [["きゅうり", ["きゅうり"], 1, "本"], ["梅干し", ["梅干し", "梅"], 1, "個"]],
    ["きゅうりをたたいて一口大に割る", "種を除いてたたいた梅干しとごま油で和える"], "梅の酸味でさっぱり箸休めに"),
  DR("buzz-renji-kakuni", "レンジ角煮風", 15, "和風", "レンジ", "主菜",
    [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["卵", ["卵", "たまご"], 1, "個"]],
    ["豚肉は厚切りにし、耐熱容器に醤油・砂糖・酒・生姜と入れる", "ラップして600Wで5分加熱し、裏返してさらに600Wで4分加熱する", "ゆで卵を加えてタレに絡める"], "短時間でもタレが濃いので味はしっかり"),
  DR("buzz-cabbage-tsuna-mushi", "キャベツとツナのレンジ蒸し", 10, "和風", "レンジ", "副菜",
    [["キャベツ", ["キャベツ"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["キャベツはざく切りにして耐熱容器に入れ、ツナを汁ごとのせる", "ラップして600Wで3分30秒加熱し、鶏ガラスープの素で整える"], "ツナ缶1つで味が決まる時短蒸し"),
  DR("buzz-sake-chazuke", "鮭茶漬け", 5, "和風", "和える", "主食",
    [["米", ["米", "ごはん"], 100, "g"], ["鮭", ["鮭", "さけ"], 0.5, "切れ"], ["海苔", ["海苔"], 0.5, "枚"], ["お茶", ["お茶", "緑茶"], 150, "mL"]],
    ["ごはんに焼いてほぐした鮭と海苔をのせる", "熱いお茶（またはだし）を注ぐ"], "夜食にも軽い朝ごはんにも"),
  DR("buzz-nasu-ponzu", "なすのポン酢びたし", 10, "和風", "レンジ", "副菜",
    [["なす", ["なす", "ナス"], 1.5, "本"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["なすは縦半分に切って皮に切り込みを入れ、ラップして600Wで3分加熱する", "ポン酢とだしに浸して冷まし、大葉をのせる"], "揚げずに作る軽いびたしです"),
];

// ---------- おつまみ枠（晩酌のあて系・15分以内・工程少なめ） ----------
// course に新区分「おつまみ」を使う（カードにコースチップとして表示され、
// 献立セットの主菜・副菜・汁物の枠とは競合しない）。
export const OTSUMAMI_RECIPES = [
  DR("otsu-edamame-garlic", "枝豆のガーリック炒め", 10, "洋風", "炒める", "おつまみ",
    [["枝豆", ["枝豆"], 100, "g"], ["にんにく", ["にんにく"], 0.5, "かけ"]],
    ["枝豆はさやごと塩ゆで（またはレンジ加熱）しておく", "フライパンにオリーブオイルとにんにくを熱し、枝豆を炒めて塩こしょうで仕上げる"], "にんにくは焦がさないよう弱火で香りを出して"),
  DR("otsu-tataki-kyuri", "たたききゅうりの中華和え", 10, "中華", "和える", "おつまみ",
    [["きゅうり", ["きゅうり"], 1.5, "本"]],
    ["きゅうりは麺棒でたたいて一口大に割り、塩をふって5分置く", "水気を絞り、ごま油・酢・醤油・鶏ガラスープの素で和える"], "たたくと短時間でも味が入ります"),
  DR("otsu-hiyayakko-negi", "冷奴のねぎ塩のせ", 5, "和風", "和える", "おつまみ",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]],
    ["豆腐の水気を切って器に盛る", "刻みねぎ・ごま油・塩を混ぜたねぎ塩をのせる"], "ねぎは細かく刻むと辛みがやわらぎます"),
  DR("otsu-hiyayakko-kimchi", "キムチ冷奴", 5, "中華", "和える", "おつまみ",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["キムチ", ["キムチ"], 30, "g"]],
    ["豆腐の水気を切って器に盛る", "刻んだキムチをのせ、ごま油を少し垂らす"], "キムチの汁も少し一緒にのせると味が決まります"),
  DR("otsu-hiyayakko-ume", "冷奴の梅しそのせ", 5, "和風", "和える", "おつまみ",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["豆腐の水気を切って器に盛る", "たたいた梅干しと刻み大葉をのせ、醤油を少し垂らす"], "梅の酸味でさっぱり食べられます"),
  DR("otsu-sunagimo", "砂肝のポン酢和え風", 15, "和風", "和える", "おつまみ",
    [["砂肝", ["砂肝", "鶏砂肝"], 80, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["ポン酢", ["ポン酢"], 1, "大さじ"]],
    ["砂肝は白い膜を取り、塩ゆでして薄切りにする", "ねぎとポン酢で和えて少し置く"], "ゆですぎると固くなるので火通りを見て引き上げて"),
  DR("otsu-chikuwa-cheese", "ちくわのチーズ焼き", 10, "洋風", "焼く", "おつまみ",
    [["ちくわ", ["ちくわ"], 1.5, "本"], ["チーズ", ["チーズ"], 15, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["ちくわを縦半分に切り、くぼみにチーズを詰める", "トースター（またはフライパン）でチーズが溶けるまで焼き、大葉をのせる"], "青のりを振ってもおいしいです"),
  DR("otsu-atsuage-kari", "厚揚げのカリッと焼き", 10, "和風", "焼く", "おつまみ",
    [["厚揚げ", ["厚揚げ"], 0.5, "枚"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"], ["生姜", ["生姜", "しょうが"], 3, "g"]],
    ["厚揚げは熱湯をかけて油抜きし、一口大に切る", "フライパンで表面がカリッとするまで焼き、ねぎと生姜をのせて醤油を垂らす"], "焼きたて熱々が一番です"),
  DR("otsu-ikageso", "イカゲソの唐揚げ風", 15, "和風", "揚げる", "おつまみ",
    [["いか", ["いか", "イカ", "ゲソ"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["いか（ゲソ）は水気をよく拭き、醤油と酒で下味をつける", "片栗粉をまぶして多めの油でカリッと揚げ焼きにする"], "水分を拭かないと油がはねるので注意"),
  DR("otsu-hiyashi-tomato", "冷やしトマトの塩だれ", 10, "和風", "和える", "おつまみ",
    [["トマト", ["トマト"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["トマトはくし形に切ってよく冷やす", "刻みねぎ・ごま油・塩・酢の塩だれをかける"], "だれは食べる直前にかけると水っぽくなりません"),
  DR("otsu-cabbage-shiokonbu", "キャベツの塩昆布和え", 5, "和風", "和える", "おつまみ",
    [["キャベツ", ["キャベツ"], 60, "g"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["キャベツを一口大にちぎる", "塩昆布とごま油で和えて少し置く"], "しんなりしたら食べ頃です"),
  DR("otsu-moyashi-piri", "もやしのピリ辛ナムル", 10, "中華", "和える", "おつまみ",
    [["もやし", ["もやし"], 0.5, "袋"], ["にら", ["にら", "ニラ"], 0.25, "束"]],
    ["もやしとにらをさっとゆでて水気を切る", "ごま油・鶏ガラスープの素・ラー油少々（辛みは好みで）で和える"], "辛さは後から足せるので、まず控えめに"),
  DR("otsu-itawasa", "かまぼこの板わさ風", 5, "和風", "和える", "おつまみ",
    [["かまぼこ", ["かまぼこ"], 3, "切れ"], ["わさび", ["わさび"], 1, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["かまぼこを厚めに切って大葉と器に盛る", "わさび醤油を添える"], "きゅうりの薄切りを添えると彩りが良くなります"),
  DR("otsu-yaki-edamame", "焼き枝豆", 10, "和風", "焼く", "おつまみ",
    [["枝豆", ["枝豆"], 100, "g"]],
    ["枝豆はさやごと塩でもんでおく", "フライパンで焼き色がつくまで乾煎りする"], "焼くと香ばしく、茹でとは違う味わいに"),
  DR("otsu-nagaimo-wasabi", "長芋のわさび醤油", 5, "和風", "和える", "おつまみ",
    [["長芋", ["長芋", "山芋"], 80, "g"], ["わさび", ["わさび"], 1, "g"], ["海苔", ["海苔"], 0.5, "枚"]],
    ["長芋は皮をむいて短冊切りにする", "わさび醤油で和え、海苔を散らす"], "シャキシャキ感を残すため食べる直前に和えて"),
  DR("otsu-eringi-butter", "エリンギのバター醤油", 10, "洋風", "炒める", "おつまみ",
    [["エリンギ", ["エリンギ"], 1.5, "本"], ["バター", ["バター"], 10, "g"]],
    ["エリンギは手で裂くか薄切りにする", "バターで炒め、醤油を回しかけて仕上げる"], "裂くと味が絡みやすくなります"),
  DR("otsu-avocado-lemon", "アボカドの塩レモン", 5, "洋風", "和える", "おつまみ",
    [["アボカド", ["アボカド"], 0.5, "個"], ["レモン", ["レモン"], 0.25, "個"]],
    ["アボカドを一口大に切る", "レモン汁・塩・オリーブオイルで和える"], "黒こしょうを振ると味が締まります"),
  DR("otsu-tako-carpaccio", "たこのカルパッチョ風", 10, "洋風", "和える", "おつまみ",
    [["たこ", ["たこ", "タコ"], 60, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["レモン", ["レモン"], 0.25, "個"]],
    ["たこは薄切り、玉ねぎは薄切りにして水にさらす", "皿に並べ、レモン汁・オリーブオイル・塩をかける"], "冷蔵庫で少し冷やすと味がなじみます"),
  DR("otsu-okra-okaka", "オクラのおかか和え", 10, "和風", "和える", "おつまみ",
    [["オクラ", ["オクラ"], 4, "本"], ["かつお節", ["かつお節"], 2, "g"]],
    ["オクラは塩で板ずりしてさっとゆで、輪切りにする", "かつお節と醤油で和える"], "粘りが出るので輪切りがおすすめ"),
  DR("otsu-renkon-chips", "レンコンチップス", 15, "和風", "揚げる", "おつまみ",
    [["レンコン", ["レンコン", "れんこん"], 80, "g"]],
    ["レンコンは薄切りにして水にさらし、水気をよく拭く", "油でカリッと揚げ、塩を振る"], "薄いほどパリパリに揚がります"),
  DR("otsu-jaga-cheese", "じゃがいものチーズ焼き", 15, "洋風", "焼く", "おつまみ",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["チーズ", ["チーズ"], 20, "g"]],
    ["じゃがいもは薄切りにしてフライパンに並べる", "チーズをのせて蓋をし、カリッとするまで焼く"], "縁がカリカリになったら裏返す合図"),
  DR("otsu-kimuchi-tako", "キムチとたこの和え物", 5, "中華", "和える", "おつまみ",
    [["たこ", ["たこ", "タコ"], 50, "g"], ["キムチ", ["キムチ"], 30, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"]],
    ["たこは一口大、きゅうりは輪切りにする", "刻んだキムチとごま油で和える"], "キムチの辛さで味が決まる簡単和え"),
  DR("otsu-shimeji-garlic", "しめじのガーリック炒め", 10, "洋風", "炒める", "おつまみ",
    [["しめじ", ["しめじ"], 0.5, "パック"], ["にんにく", ["にんにく"], 0.5, "かけ"], ["バター", ["バター"], 5, "g"]],
    ["しめじはほぐしておく", "にんにくとバターで炒め、塩こしょうで仕上げる"], "きのこは動かしすぎず焼き付けるのがコツ"),
  DR("otsu-ika-ume", "いかとオクラの梅和え", 10, "和風", "和える", "おつまみ",
    [["いか", ["いか", "イカ"], 60, "g"], ["オクラ", ["オクラ"], 3, "本"], ["梅干し", ["梅干し", "梅"], 1, "個"]],
    ["いかとオクラはさっとゆでて一口大に切る", "たたいた梅干しと醤油少しで和える"], "梅の酸味でさっぱりした和え物に"),
  DR("otsu-hanpen-butter", "はんぺんのバター焼き", 10, "洋風", "焼く", "おつまみ",
    [["はんぺん", ["はんぺん"], 0.5, "枚"], ["バター", ["バター"], 5, "g"], ["海苔", ["海苔"], 0.5, "枚"]],
    ["はんぺんを食べやすく切る", "バターで両面をこんがり焼き、醤油を少し垂らして海苔を巻く"], "ふわふわ食感は焼きたてが一番"),
];

// ---------- おつまみ枠・第2弾（2026-11-11「おつまみもっと多く」） ----------
// 冷菜・和え物を中心に、焼き物・揚げ物・レンジ・漬け物／作り置きまで拡充。
// 品名・説明に酒類を勧める表現は入れない（既存枠と同じ方針）。
export const OTSUMAMI_RECIPES_MORE = [
  // 冷菜・和え物
  DR("otsu-kyuri-tsuna", "たたききゅうりとツナのごま和え", 10, "中華", "和える", "おつまみ",
    [["きゅうり", ["きゅうり"], 1.5, "本"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["ごま", ["ごま", "白ごま"], 0.5, "大さじ"]],
    ["きゅうりは麺棒でたたいて一口大に割り、塩をふって5分置き、水気を絞る", "油を切ったツナとごま油・醤油・すりごまで和える"], "ごまは指でひねりながらかけると香りが立ちます"),
  DR("otsu-minitomato-marine", "ミニトマトと玉ねぎのマリネ", 10, "洋風", "漬ける", "おつまみ",
    [["ミニトマト", ["ミニトマト"], 5, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]],
    ["ミニトマトは半分に切り、玉ねぎは薄切りにして水にさらす", "酢・オリーブオイル・砂糖・塩の液に15分ほど漬ける"], "よく冷やすと味がなじんでおいしくなります"),
  DR("otsu-avocado-tomato", "アボカドとトマトのわさび醤油和え", 5, "洋風", "和える", "おつまみ",
    [["アボカド", ["アボカド"], 0.5, "個"], ["トマト", ["トマト"], 0.5, "個"], ["わさび", ["わさび"], 1, "g"]],
    ["アボカドとトマトを一口大に切る", "わさび醤油とオリーブオイル少しで和える"], "アボカドは切ったらすぐ和えると色がきれいです"),
  DR("otsu-nagaimo-okra", "長芋とオクラの梅おかか和え", 10, "和風", "和える", "おつまみ",
    [["長芋", ["長芋", "山芋"], 80, "g"], ["オクラ", ["オクラ"], 3, "本"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["かつお節", ["かつお節"], 2, "g"]],
    ["オクラは塩で板ずりしてさっとゆで、輪切りにする。長芋は短冊切りにする", "たたいた梅干しと醤油少しで和え、かつお節をかける"], "ねばねば同士でよく絡みます"),
  DR("otsu-moyashi-ham", "もやしとハムの中華和え", 10, "中華", "和える", "おつまみ",
    [["もやし", ["もやし"], 0.5, "袋"], ["ハム", ["ハム"], 15, "g"]],
    ["もやしはさっとゆでて水気をよく切る", "細切りのハムとごま油・酢・鶏ガラスープの素で和える"], "もやしは熱いうちに和えると味が入りやすいです"),
  DR("otsu-hakusai-shiokonbu", "白菜と塩昆布の浅漬け風", 10, "和風", "漬ける", "おつまみ",
    [["白菜", ["白菜"], 60, "g"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["白菜はざく切りにして塩少しでもみ、5分置いて水気を絞る", "塩昆布とごま油で和えて少し置く"], "しんなりしてきたら食べ頃です"),
  DR("otsu-daikon-kanikama", "大根とかにかまのマヨサラダ", 10, "洋風", "和える", "おつまみ",
    [["大根", ["大根", "だいこん"], 80, "g"], ["かにかま", ["かにかま", "カニカマ"], 2, "本"]],
    ["大根は千切りにして塩でもみ、水気を絞る", "ほぐしたかにかまとマヨネーズ・こしょうで和える"], "大根の辛みが強いときは水にさらすとやわらぎます"),
  DR("otsu-mizuna-shirasu", "水菜としらすのサラダ", 10, "和風", "和える", "おつまみ",
    [["水菜", ["水菜"], 30, "g"], ["しらす", ["しらす", "ちりめんじゃこ"], 20, "g"]],
    ["水菜は4cmに切って水にさらし、水気を切る", "しらすをのせ、ポン酢とごま油を回しかける"], "しらすの塩気があるので味付けは控えめに"),
  DR("otsu-komatsuna-tsuna", "小松菜とツナの和え物", 10, "和風", "和える", "おつまみ",
    [["小松菜", ["小松菜"], 0.5, "束"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]],
    ["小松菜はさっとゆでて水気を絞り、4cmに切る", "油を切ったツナと醤油・ごまで和える"], "茎と葉でゆで時間を少し変えると食感がそろいます"),
  DR("otsu-kyuri-wakame", "きゅうりとわかめの甘酢和え", 10, "和風", "和える", "おつまみ",
    [["きゅうり", ["きゅうり"], 1, "本"], ["わかめ", ["わかめ"], 3, "g"], ["酢", ["酢"], 1, "大さじ"]],
    ["きゅうりは薄い輪切りにして塩でもみ、水気を絞る。わかめは水で戻す", "酢・砂糖・醤油少しの甘酢で和える"], "食べる直前に和えると水っぽくなりません"),
  DR("otsu-tako-kyuri-su", "たこときゅうりの甘酢和え", 10, "和風", "和える", "おつまみ",
    [["たこ", ["たこ", "タコ"], 50, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["わかめ", ["わかめ"], 3, "g"]],
    ["たこは薄切り、きゅうりは輪切りにして塩でもむ", "戻したわかめと一緒に甘酢で和える"], "たこは斜めに切ると大きく見えて食べ応えが出ます"),
  DR("otsu-mozuku-tomato", "もずく酢のトマトのせ", 5, "和風", "和える", "おつまみ",
    [["もずく", ["もずく"], 50, "g"], ["トマト", ["トマト"], 0.5, "個"]],
    ["トマトは角切りにしてよく冷やす", "もずく酢（市販の味付きでも可）の上にのせ、生姜を少し添える"], "トマトの甘みでもずくの酸味がまろやかに"),
  DR("otsu-edamame-shiokonbu", "枝豆の塩昆布和え", 5, "和風", "和える", "おつまみ",
    [["枝豆", ["枝豆"], 80, "g"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["枝豆は塩ゆでして粗熱を取る", "塩昆布とごま油少しで和える"], "さやから出して和えると味が均一になります"),
  DR("otsu-snap-mayo", "スナップエンドウの塩ゆでマヨ添え", 10, "洋風", "和える", "おつまみ",
    [["スナップエンドウ", ["スナップエンドウ", "スナップえんどう"], 8, "個"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]],
    ["スナップエンドウは筋を取って塩ゆでし、冷水で色止めする", "マヨネーズに醤油を1滴混ぜたソースを添える"], "ゆですぎると甘みが逃げるので1分半が目安"),
  DR("otsu-aspara-goma", "アスパラのごま和え", 10, "和風", "和える", "おつまみ",
    [["アスパラ", ["アスパラ", "アスパラガス"], 2, "本"], ["ごま", ["ごま", "白ごま"], 1, "大さじ"]],
    ["アスパラは根元の皮をむいて塩ゆでし、斜め切りにする", "すりごま・砂糖・醤油で和える"], "穂先は柔らかいので後から短時間ゆでて"),
  DR("otsu-broccoli-tarako", "ブロッコリーのたらこマヨ和え", 10, "洋風", "和える", "おつまみ",
    [["ブロッコリー", ["ブロッコリー"], 60, "g"], ["たらこ", ["たらこ"], 0.5, "腹"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]],
    ["ブロッコリーは小房に分けて塩ゆでし、水気を切る", "ほぐしたたらことマヨネーズで和える"], "たらこの塩気があるので塩は加えなくて大丈夫"),
  DR("otsu-takuan-cheese", "たくあんとクリームチーズの和え物", 5, "洋風", "和える", "おつまみ",
    [["たくあん", ["たくあん"], 30, "g"], ["クリームチーズ", ["クリームチーズ", "チーズ"], 20, "g"]],
    ["たくあんは粗みじんに切る", "角切りにしたクリームチーズと和え、黒こしょうを振る"], "クラッカーにのせてもおいしいです"),
  DR("otsu-kimchi-natto", "キムチ納豆", 5, "中華", "和える", "おつまみ",
    [["納豆", ["納豆"], 1, "パック"], ["キムチ", ["キムチ"], 30, "g"]],
    ["キムチは粗く刻む", "納豆とよく混ぜ、ごま油を少し垂らす"], "海苔で巻いて食べてもおいしいです"),
  DR("otsu-natto-nagaimo", "納豆と長芋のねばねば和え", 5, "和風", "和える", "おつまみ",
    [["納豆", ["納豆"], 1, "パック"], ["長芋", ["長芋", "山芋"], 50, "g"], ["海苔", ["海苔"], 0.5, "枚"]],
    ["長芋は角切りにする", "納豆と和えて醤油で整え、ちぎった海苔をのせる"], "長芋のシャキシャキ感がアクセント"),
  DR("otsu-okra-natto", "オクラ納豆", 10, "和風", "和える", "おつまみ",
    [["オクラ", ["オクラ"], 4, "本"], ["納豆", ["納豆"], 1, "パック"], ["かつお節", ["かつお節"], 2, "g"]],
    ["オクラは塩で板ずりしてさっとゆで、輪切りにする", "納豆と混ぜ、かつお節と醤油で整える"], "よく混ぜると粘りが出てまとまります"),
  DR("otsu-hiyayakko-avocado", "冷奴のアボカドのせ", 5, "洋風", "和える", "おつまみ",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["アボカド", ["アボカド"], 0.25, "個"]],
    ["豆腐の水気を切って器に盛る", "角切りアボカドをのせ、塩とオリーブオイル、黒こしょうをかける"], "わさび醤油に変えても合います"),
  DR("otsu-hiyayakko-tomato", "冷奴のトマト大葉だれ", 5, "和風", "和える", "おつまみ",
    [["豆腐", ["豆腐"], 0.5, "丁"], ["トマト", ["トマト"], 0.5, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["豆腐の水気を切って器に盛る", "角切りトマト・刻み大葉・ポン酢・ごま油のだれをかける"], "だれは少し置くと味がなじみます"),
  DR("otsu-yuba-wasabi", "湯葉のわさび醤油", 5, "和風", "和える", "おつまみ",
    [["湯葉", ["湯葉"], 25, "g"], ["わさび", ["わさび"], 1, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["湯葉は食べやすい大きさに切って器に盛る", "大葉を添え、わさび醤油をかける"], "湯葉は水気を軽く切ると味が薄まらない"),
  DR("otsu-ninjin-namul", "にんじんのナムル", 10, "中華", "和える", "おつまみ",
    [["にんじん", ["にんじん", "人参"], 0.5, "本"], ["ごま油", ["ごま油"], 1, "小さじ"]],
    ["にんじんは千切りにしてさっとゆで、水気を切る", "ごま油・塩・すりごまで和える"], "熱いうちに和えると味が入ります"),
  DR("otsu-shirasu-oroshi", "しらすの大根おろし和え", 5, "和風", "和える", "おつまみ",
    [["しらす", ["しらす", "ちりめんじゃこ"], 20, "g"], ["大根", ["大根", "だいこん"], 80, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["大根はすりおろして軽く水気を切る", "しらすと刻み大葉をのせ、ポン酢をかける"], "大根おろしの汁気は切りすぎない方がまろやか"),
  DR("otsu-kanikama-su", "かにかまときゅうりの酢の物", 10, "和風", "和える", "おつまみ",
    [["かにかま", ["かにかま", "カニカマ"], 2, "本"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["わかめ", ["わかめ"], 3, "g"]],
    ["きゅうりは輪切りにして塩でもみ、水気を絞る", "ほぐしたかにかまと戻したわかめを甘酢で和える"], "かにかまは縦に割くとふんわりほぐれます"),
  // 焼き物・炒め物
  DR("otsu-tebamoto-shioyaki", "手羽元の塩焼き", 15, "和風", "焼く", "おつまみ",
    [["手羽元", ["手羽元", "鶏肉"], 3, "本"], ["レモン", ["レモン"], 0.25, "個"]],
    ["手羽元に塩こしょうをふって10分置く", "フライパンで皮目から焼き、全体に火を通してレモンを添える"], "焼く前に水気を拭くと皮がパリッとします"),
  DR("otsu-nankotsu-shioyaki", "鶏軟骨の塩こしょう焼き", 15, "和風", "焼く", "おつまみ",
    [["軟骨", ["軟骨", "鶏軟骨"], 50, "g"], ["レモン", ["レモン"], 0.25, "個"]],
    ["軟骨は水気を拭き、塩こしょうをふる", "フライパンに油を熱してこんがり焼き、レモンを添える"], "焼きすぎると固くなるので色づいたら引き上げて"),
  DR("otsu-shishamo-yaki", "ししゃものこんがり焼き", 10, "和風", "焼く", "おつまみ",
    [["ししゃも", ["ししゃも"], 3, "尾"], ["レモン", ["レモン"], 0.25, "個"]],
    ["ししゃもはグリル（またはフライパン）で両面を焼く", "焼き色がついたら器に盛り、レモンを添える"], "皮が破れないよう、動かしすぎないのがコツ"),
  DR("otsu-atsuage-negimiso", "厚揚げのねぎ味噌焼き", 10, "和風", "焼く", "おつまみ",
    [["厚揚げ", ["厚揚げ"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["厚揚げは熱湯をかけて油抜きし、一口大に切る", "表面を焼き、刻みねぎと味噌・みりんを混ぜたねぎ味噌をのせて軽く焼く"], "味噌は焦げやすいので仕上げにのせて"),
  DR("otsu-aburaage-natto", "油揚げの納豆詰め焼き", 15, "和風", "焼く", "おつまみ",
    [["油揚げ", ["油揚げ"], 1, "枚"], ["納豆", ["納豆"], 1, "パック"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["油揚げは半分に切って袋状に開く", "刻みねぎと混ぜた納豆を詰め、口を爪楊枝で留めて両面を焼く"], "醤油を少し垂らして焼くと香ばしい"),
  DR("otsu-ganmodoki-yaki", "がんもどきの生姜醤油焼き", 10, "和風", "焼く", "おつまみ",
    [["がんもどき", ["がんもどき"], 1, "個"], ["生姜", ["生姜", "しょうが"], 3, "g"], ["大根", ["大根", "だいこん"], 50, "g"]],
    ["がんもどきは熱湯をかけて油抜きし、半分に切る", "フライパンで両面を焼き、大根おろしと生姜をのせて醤油を垂らす"], "焼きたては中が熱いので注意"),
  DR("otsu-nasu-dengaku", "なすの田楽味噌焼き", 15, "和風", "焼く", "おつまみ",
    [["なす", ["なす", "ナス"], 1.5, "本"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["ごま", ["ごま", "白ごま"], 0.5, "大さじ"]],
    ["なすは縦半分に切って切り込みを入れ、油で両面を焼く", "味噌・砂糖・みりんの田楽味噌を塗って軽く焼き、ごまを振る"], "田楽味噌は塗ってから焼きすぎないのがコツ"),
  DR("otsu-nagaimo-butter", "長芋のバター醤油焼き", 10, "洋風", "焼く", "おつまみ",
    [["長芋", ["長芋", "山芋"], 80, "g"], ["バター", ["バター"], 10, "g"]],
    ["長芋は皮をむいて1cm幅の輪切りにする", "バターで両面を焼き、醤油を回しかける"], "表面はこんがり、中はほっくりが目安"),
  DR("otsu-jaga-galette", "じゃがいもとチーズのガレット風", 15, "洋風", "焼く", "おつまみ",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["チーズ", ["チーズ"], 20, "g"]],
    ["じゃがいもは千切りにして水にさらさず塩をまぶす", "フライパンに広げてチーズを挟み、両面をカリッと焼く"], "でんぷんがつなぎになるので水にさらさないで"),
  DR("otsu-eringi-bacon", "エリンギとベーコンの炒め物", 10, "洋風", "炒める", "おつまみ",
    [["エリンギ", ["エリンギ"], 1.5, "本"], ["ベーコン", ["ベーコン"], 15, "g"]],
    ["エリンギは手で裂き、ベーコンは1cm幅に切る", "ベーコンの脂でエリンギを炒め、塩こしょうで仕上げる"], "エリンギは焼き付けてから動かすと香ばしい"),
  DR("otsu-maitake-butter", "まいたけのバター炒め", 10, "洋風", "炒める", "おつまみ",
    [["まいたけ", ["まいたけ"], 0.5, "パック"], ["バター", ["バター"], 10, "g"]],
    ["まいたけは大きめにほぐす", "バターで炒め、塩こしょうと醤油少しで仕上げる"], "触りすぎず焼き付けると香りが引き立ちます"),
  DR("otsu-shiitake-cheese", "しいたけのチーズ焼き", 10, "洋風", "焼く", "おつまみ",
    [["しいたけ", ["しいたけ", "椎茸"], 3, "個"], ["チーズ", ["チーズ"], 15, "g"]],
    ["しいたけは軸を取ってかさに塩を少しふる", "チーズをのせてトースター（またはフライパン＋蓋）で焼く"], "しいたけの水分が出たらペーパーで軽く押さえて"),
  DR("otsu-enoki-garlic", "えのきのガーリック炒め", 10, "洋風", "炒める", "おつまみ",
    [["えのき", ["えのき"], 0.5, "袋"], ["にんにく", ["にんにく"], 0.5, "かけ"], ["バター", ["バター"], 5, "g"]],
    ["えのきは根元を落としてほぐす", "にんにくとバターで炒め、塩こしょうで仕上げる"], "えのきは短時間で火が通るので炒めすぎないで"),
  DR("otsu-sausage-piman", "ソーセージとピーマンの炒め物", 10, "洋風", "炒める", "おつまみ",
    [["ソーセージ", ["ソーセージ", "ウインナー"], 2, "本"], ["ピーマン", ["ピーマン"], 1, "個"]],
    ["ソーセージは斜め切り、ピーマンは一口大に切る", "油でソーセージから炒め、ピーマンを加えて塩こしょうで仕上げる"], "ケチャップを少し加えると子どもも食べやすい味に"),
  DR("otsu-bacon-hourenso", "ベーコンとほうれん草のソテー", 10, "洋風", "炒める", "おつまみ",
    [["ベーコン", ["ベーコン"], 15, "g"], ["ほうれん草", ["ほうれん草"], 50, "g"]],
    ["ほうれん草は洗って4cmに切る", "ベーコンを炒め、ほうれん草を加えてしんなりするまで炒め、塩こしょうで整える"], "ほうれん草の水気はよく切ってから炒めて"),
  DR("otsu-kamaboko-cheese", "かまぼこのチーズ焼き", 10, "洋風", "焼く", "おつまみ",
    [["かまぼこ", ["かまぼこ"], 3, "切れ"], ["チーズ", ["チーズ"], 10, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["かまぼこは厚めに切って切り込みを入れる", "チーズをはさんでトースターで焼き、大葉をのせる"], "チーズが溶けたらすぐ出すと固くなりません"),
  DR("otsu-hanpen-cheese", "はんぺんのチーズ焼き", 10, "洋風", "焼く", "おつまみ",
    [["はんぺん", ["はんぺん"], 0.5, "枚"], ["チーズ", ["チーズ"], 10, "g"], ["海苔", ["海苔"], 0.5, "枚"]],
    ["はんぺんは三角に切って切り込みにチーズをはさむ", "フライパンで両面を焼き、海苔を巻く"], "弱火で焼くとふんわり仕上がります"),
  DR("otsu-satsumaage-yaki", "さつま揚げの生姜醤油焼き", 10, "和風", "焼く", "おつまみ",
    [["さつま揚げ", ["さつま揚げ"], 1, "枚"], ["生姜", ["生姜", "しょうが"], 3, "g"], ["大根", ["大根", "だいこん"], 50, "g"]],
    ["さつま揚げは熱湯をかけて油抜きし、食べやすく切る", "フライパンで両面を焼き、大根おろしと生姜を添えて醤油を垂らす"], "焼くと香ばしさが増します"),
  // 揚げ物（少量の油で揚げ焼きも可）
  DR("otsu-nankotsu-karaage", "軟骨の唐揚げ", 15, "和風", "揚げる", "おつまみ",
    [["軟骨", ["軟骨", "鶏軟骨"], 50, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["レモン", ["レモン"], 0.25, "個"]],
    ["軟骨に醤油と酒で下味をつけて10分置く", "片栗粉をまぶしてカリッと揚げ、レモンを添える"], "水気をよく拭くと油はねしにくい"),
  DR("otsu-gobo-karaage", "ごぼうの唐揚げ", 15, "和風", "揚げる", "おつまみ",
    [["ごぼう", ["ごぼう"], 0.5, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["ごぼうは斜め薄切りにして水にさらし、水気を拭く", "醤油と酒で下味をつけ、片栗粉をまぶして揚げる"], "薄いほどカリッと揚がります"),
  DR("otsu-tako-karaage", "たこの唐揚げ風", 15, "和風", "揚げる", "おつまみ",
    [["たこ", ["たこ", "タコ"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["たこは一口大に切り、水気をよく拭いて醤油と生姜で下味をつける", "片栗粉をまぶして短時間でカリッと揚げる"], "揚げすぎると固くなるので色づいたら引き上げて"),
  DR("otsu-ika-karaage", "いかの唐揚げ", 15, "和風", "揚げる", "おつまみ",
    [["いか", ["いか", "イカ"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["レモン", ["レモン"], 0.25, "個"]],
    ["いかは輪切り（または一口大）にして水気をよく拭き、下味をつける", "片栗粉をまぶして揚げ、レモンを添える"], "水分が残ると油がはねるのでしっかり拭いて"),
  DR("otsu-norishio-potato", "のり塩ポテトフライ", 15, "和風", "揚げる", "おつまみ",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["青のり", ["青のり", "あおのり"], 0.5, "小さじ"]],
    ["じゃがいもはくし形に切って水にさらし、水気を拭く", "油でカリッと揚げ、熱いうちに塩と青のりをまぶす"], "二度揚げすると中までほくほくに"),
  DR("otsu-nagaimo-karaage", "長芋の唐揚げ", 10, "和風", "揚げる", "おつまみ",
    [["長芋", ["長芋", "山芋"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["長芋は皮をむいて一口大に切り、醤油で下味をつける", "片栗粉をまぶしてカリッと揚げる"], "外はカリッと中はほっくり、揚げたてが一番"),
  DR("otsu-okra-karaage", "オクラの唐揚げ", 10, "和風", "揚げる", "おつまみ",
    [["オクラ", ["オクラ"], 5, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["オクラは塩で板ずりして洗い、水気を拭いて半分に切る", "片栗粉をまぶしてカリッと揚げ、塩を振る"], "水気が残るとはねるのでよく拭いて"),
  DR("otsu-satsumaimo-ten", "さつまいもの天ぷら風", 15, "和風", "揚げる", "おつまみ",
    [["さつまいも", ["さつまいも"], 0.5, "本"], ["天ぷら粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]],
    ["さつまいもは輪切りにして水にさらし、水気を拭く", "天ぷら粉を冷水で溶いた衣をつけて揚げる"], "衣は混ぜすぎない方がサクッとします"),
  DR("otsu-chikuwa-isobe", "ちくわの磯辺揚げ風", 10, "和風", "揚げる", "おつまみ",
    [["ちくわ", ["ちくわ"], 2, "本"], ["青のり", ["青のり", "あおのり"], 0.5, "小さじ"], ["小麦粉", ["小麦粉", "天ぷら粉"], 1, "大さじ"]],
    ["ちくわは斜めに切る", "小麦粉と青のりを水で溶いた衣をつけて揚げる"], "衣に青のりを混ぜると香りが立ちます"),
  // レンジ
  DR("otsu-renji-piman", "ピーマンのレンジ塩昆布和え", 10, "和風", "レンジ", "おつまみ",
    [["ピーマン", ["ピーマン"], 2, "個"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["ピーマンは細切りにして耐熱容器に入れる", "ラップして600Wで2分加熱し、塩昆布とごま油で和える"], "加熱しすぎると色が悪くなるので様子を見て"),
  DR("otsu-renji-cabbage", "キャベツのレンジ塩だれ蒸し", 10, "中華", "レンジ", "おつまみ",
    [["キャベツ", ["キャベツ"], 80, "g"], ["ごま油", ["ごま油"], 1, "小さじ"]],
    ["キャベツはざく切りにして耐熱容器に入れる", "ラップして600Wで3分加熱し、ごま油・塩・鶏ガラスープの素で和える"], "熱いうちに和えると味がなじみます"),
  DR("otsu-renji-kinoko", "きのこのレンジ蒸しポン酢", 10, "和風", "レンジ", "おつまみ",
    [["しめじ", ["しめじ"], 0.5, "パック"], ["えのき", ["えのき"], 0.5, "袋"], ["ポン酢", ["ポン酢"], 1, "大さじ"]],
    ["きのこはほぐして耐熱容器に入れ、酒を少しふる", "ラップして600Wで3分加熱し、ポン酢をかける"], "きのこから出た汁ごと食べると旨みたっぷり"),
  DR("otsu-renji-broccoli", "ブロッコリーのレンジチーズ蒸し", 10, "洋風", "レンジ", "おつまみ",
    [["ブロッコリー", ["ブロッコリー"], 60, "g"], ["チーズ", ["チーズ"], 15, "g"]],
    ["ブロッコリーは小房に分けて耐熱容器に入れ、水を少しふる", "チーズをのせてラップし、600Wで2分30秒加熱する"], "チーズが溶けたらすぐ食べて"),
  DR("otsu-renji-jaga", "じゃがいものレンジ塩バター", 10, "洋風", "レンジ", "おつまみ",
    [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["バター", ["バター"], 10, "g"]],
    ["じゃがいもは一口大に切って耐熱容器に入れる", "ラップして600Wで5分加熱し、熱いうちにバターと塩を絡める"], "竹串がすっと通れば火通りOK"),
  DR("otsu-renji-tamago", "ふんわりチーズ卵のレンジ蒸し", 10, "洋風", "レンジ", "おつまみ",
    [["卵", ["卵", "たまご"], 2, "個"], ["チーズ", ["チーズ"], 15, "g"], ["牛乳", ["牛乳"], 1, "大さじ"]],
    ["卵を牛乳と塩少しで溶き、耐熱容器に流してチーズを散らす", "ラップして600Wで2分加熱し、一度混ぜてさらに600Wで1分加熱する"], "余熱で固まるので少し半熟で止めるのがコツ"),
  // 漬け物・作り置き・しっかり系
  DR("otsu-kyuri-shiokonbu", "きゅうりと塩昆布の浅漬け", 10, "和風", "漬ける", "おつまみ",
    [["きゅうり", ["きゅうり"], 1, "本"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["きゅうりは斜め薄切りにする", "ポリ袋で塩昆布とごま油少しをもみ込み、10分置く"], "置きすぎると水が出るので食べる少し前に作って"),
  DR("otsu-nasu-asazuke", "なすの浅漬け風", 10, "和風", "漬ける", "おつまみ",
    [["なす", ["なす", "ナス"], 1, "本"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"], ["みょうが", ["みょうが"], 1, "個"]],
    ["なすは薄切りにして塩水にさらし、水気を絞る", "塩昆布で和え、刻んだみょうがを散らす"], "みょうがの香りでさっぱり仕上がります"),
  DR("otsu-daikon-amazu", "大根の即席甘酢漬け", 15, "和風", "漬ける", "おつまみ",
    [["大根", ["大根", "だいこん"], 80, "g"], ["酢", ["酢"], 1, "大さじ"]],
    ["大根は薄いいちょう切りにして塩でもみ、水気を絞る", "酢・砂糖・塩の甘酢に15分ほど漬ける"], "作り置きできて、翌日もおいしいです"),
  DR("otsu-kabu-asazuke", "かぶの塩昆布漬け", 10, "和風", "漬ける", "おつまみ",
    [["かぶ", ["かぶ"], 1, "個"], ["塩昆布", ["塩昆布", "昆布"], 5, "g"]],
    ["かぶは薄切りにし、葉は小口切りにする", "塩昆布と一緒にポリ袋でもみ込み、10分置く"], "葉も一緒に漬けると彩りが良くなります"),
  DR("otsu-kiriboshi-daikon", "切り干し大根とツナのサラダ", 15, "和風", "和える", "おつまみ",
    [["切り干し大根", ["切り干し大根", "切干大根"], 15, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["きゅうり", ["きゅうり"], 0.5, "本"]],
    ["切り干し大根は水で戻して水気を絞り、食べやすく切る", "ほぐしたツナと千切りきゅうりを、マヨネーズとポン酢少しで和える"], "戻しすぎると食感がなくなるので短めに"),
  DR("otsu-hijiki-daizu", "ひじきと大豆の煮物", 20, "和風", "煮る", "おつまみ",
    [["ひじき", ["ひじき"], 10, "g"], ["大豆", ["大豆"], 30, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]],
    ["ひじきは水で戻し、にんじんは細切りにする", "だし・醤油・みりん・砂糖で大豆と一緒に10分ほど煮る"], "冷ますと味がしみて作り置きにも向きます"),
  DR("otsu-asari-sakamushi", "あさりのねぎ酒蒸し", 15, "和風", "蒸す", "おつまみ",
    [["あさり", ["あさり"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]],
    ["あさりは砂抜きして殻をこすり洗いする", "フライパンにあさり・酒・生姜を入れて蓋をし、口が開くまで蒸す。ねぎを散らす"], "口が開かない貝は無理に開けて食べないで"),
  DR("otsu-tori-lever", "鶏レバーの生姜煮", 20, "和風", "煮る", "おつまみ",
    [["鶏レバー", ["鶏レバー", "レバー"], 80, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]],
    ["レバーは血の塊を取り除いて洗い、下ゆでする", "だし・醤油・みりん・砂糖と生姜で10分ほど煮る"], "煮すぎると固くなるので火通りを見て止めて"),
  DR("otsu-sunagimo-garlic", "砂肝のガーリック炒め", 10, "洋風", "炒める", "おつまみ",
    [["砂肝", ["砂肝", "鶏砂肝"], 80, "g"], ["にんにく", ["にんにく"], 1, "かけ"]],
    ["砂肝は白い膜を取って薄切りにし、塩こしょうをふる", "にんにくとオリーブオイルで炒め、火が通ったら醤油を少し回しかける"], "強火で短時間がコリコリ食感のコツ"),
  DR("otsu-aji-nanban", "あじの南蛮漬け風", 20, "和風", "漬ける", "おつまみ",
    [["あじ", ["あじ"], 1, "切れ"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["酢", ["酢"], 1, "大さじ"], ["片栗粉", ["片栗粉"], 1, "大さじ"]],
    ["あじに片栗粉をまぶして揚げ焼きにする", "薄切り玉ねぎと一緒に甘酢（酢・醤油・砂糖）に熱いうちに漬ける"], "半日置くと味がなじんでさらにおいしく"),
  DR("otsu-iwashi-umeni", "いわしの梅生姜煮", 20, "和風", "煮る", "おつまみ",
    [["いわし", ["いわし"], 2, "尾"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["生姜", ["生姜", "しょうが"], 5, "g"]],
    ["いわしは頭と内臓を除いて洗い、水気を拭く", "だし・醤油・みりん・砂糖に梅干しと生姜を入れて落し蓋をし、10分ほど煮る"], "梅の酸味で臭みがやわらぎます"),
];

// ---------- 生ハム枠 ----------
export const NAMAHAMU_RECIPES = [
  DR("nama-rucola", "生ハムとルッコラ風サラダ", 10, "洋風", "和える", "おつまみ",
    [["生ハム", ["生ハム"], 20, "g"], ["レタス", ["レタス"], 30, "g"], ["水菜", ["水菜"], 20, "g"], ["チーズ", ["チーズ"], 10, "g"]],
    ["レタスと水菜を一口大にして器に盛る", "生ハムをふんわりのせ、チーズを削りかけてオリーブオイルとこしょうで仕上げる"], "生ハムの塩気があるのでドレッシングは控えめに"),
  DR("nama-avocado", "生ハムとアボカドの塩レモン", 10, "洋風", "和える", "おつまみ",
    [["生ハム", ["生ハム"], 20, "g"], ["アボカド", ["アボカド"], 0.5, "個"], ["レモン", ["レモン"], 0.25, "個"]],
    ["アボカドを一口大に切る", "生ハムと合わせ、レモン汁・塩・オリーブオイルで和える"], "アボカドは完熟の柔らかいものが合います"),
  DR("nama-canape", "生ハムのカナッペ風", 10, "洋風", "和える", "おつまみ",
    [["生ハム", ["生ハム"], 15, "g"], ["フランスパン", ["フランスパン", "食パン"], 1, "切れ"], ["チーズ", ["チーズ", "クリームチーズ"], 15, "g"], ["きゅうり", ["きゅうり"], 0.25, "本"]],
    ["パンを薄切りにして軽く焼く", "チーズを塗り、生ハムときゅうりの薄切りをのせる"], "小さく切ると食べやすい一口サイズに"),
  DR("nama-melon", "生ハムとメロンの前菜", 5, "洋風", "和える", "おつまみ",
    [["生ハム", ["生ハム"], 20, "g"], ["メロン", ["メロン"], 0.125, "個"]],
    ["メロンを一口大に切る", "生ハムをふんわりと巻きつけるように添える"], "甘いメロンと塩気の組み合わせが定番の前菜"),
  DR("nama-pasta", "生ハムの冷製パスタ", 15, "洋風", "和える", "主食",
    [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["生ハム", ["生ハム"], 20, "g"], ["トマト", ["トマト"], 0.5, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["パスタを表示より1分長くゆで、冷水でしめる", "角切りトマト・オリーブオイル・塩で和え、生ハムと大葉をのせる"], "冷やすと生ハムの塩気がちょうどよくなります"),
  DR("nama-onigiri", "生ハムおにぎり", 10, "和風", "和える", "主食",
    [["米", ["米", "ごはん"], 100, "g"], ["生ハム", ["生ハム"], 15, "g"], ["チーズ", ["チーズ"], 10, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]],
    ["ごはんに刻んだ大葉とチーズを混ぜて丸くにぎる", "生ハムを巻いて形を整える"], "海苔の代わりに生ハムで巻く洋風おにぎり"),
  DR("nama-daikon", "生ハムと大根のマリネ", 10, "洋風", "漬ける", "おつまみ",
    [["生ハム", ["生ハム"], 15, "g"], ["大根", ["大根", "だいこん"], 60, "g"]],
    ["大根は薄切りにして塩をふり、水気を絞る", "生ハムと重ねて酢・オリーブオイル・砂糖の液に10分漬ける"], "大根のシャキシャキ感がアクセント"),
  DR("nama-yukke", "生ハムユッケ風", 10, "中華", "和える", "おつまみ",
    [["生ハム", ["生ハム"], 25, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["卵", ["卵", "たまご"], 1, "個"]],
    ["生ハムときゅうりを細切りにする", "ごま油と醤油で和え、真ん中に卵黄をのせる"], "卵黄を崩して絡めながら食べます"),
];

// ---------- 日常レシピ大幅追加 ----------
export const DAILY_RECIPES_MORE = [
  // 鶏肉
  DR("d-tori-miso", "鶏の味噌漬け焼き", 20, "和風", "焼く", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["鶏肉を味噌・みりん・砂糖に30分漬ける", "味噌を拭って両面をこんがり焼く"], "味噌は焦げやすいので拭ってから焼いて"),
  DR("d-tori-sake-mushi", "鶏の酒蒸し", 15, "和風", "蒸す", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["鶏肉に塩と酒をふって10分置く", "生姜をのせて蒸し器（またはフライパン＋蓋）で10分蒸す"], "ポン酢や塩でシンプルに"),
  DR("d-tori-negi", "鶏のねぎ塩焼き", 15, "和風", "焼く", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["鶏肉を塩こしょうで焼く", "刻みねぎ・ごま油・塩のねぎ塩だれをかける"], "ねぎ塩は焼きたてにかけるのが一番"),
  DR("d-tori-ume", "鶏の梅しそ焼き", 15, "和風", "焼く", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 80, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["鶏肉を焼いて火を通す", "たたいた梅と刻み大葉をのせる"], "梅の酸味でさっぱりした主菜"),
  DR("d-tori-yuzu", "鶏のゆず風味焼き", 15, "和風", "焼く", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["ゆず", ["ゆず"], 0.25, "個"]], ["鶏肉を両面こんがり焼く", "ゆずの搾り汁と醤油を回しかけ、皮のすりおろしを散らす"], "ゆずは皮ごと香りが命です"),
  DR("d-tori-katsu", "鶏カツ", 25, "洋風", "揚げる", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["鶏肉に小麦粉・卵・パン粉の順に衣をつける", "油で両面カラッと揚げる"], "むね肉は開いて厚みをそろえると火通りが均一に"),
  DR("d-tori-ten", "とり天風", 20, "和風", "揚げる", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["鶏肉を生姜醤油に漬ける", "天ぷら衣をつけて揚げる"], "ポン酢でさっぱり食べるのが大分風"),
  DR("d-sasami-fry", "ささみフライ", 20, "洋風", "揚げる", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉", "ささみ"], 80, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["鶏肉（ささみ）を開いて大葉をはさむ", "衣をつけてカラッと揚げる"], "チーズをはさむアレンジも人気"),
  DR("d-sasami-ume", "ささみの梅しそ巻き", 15, "和風", "焼く", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉", "ささみ"], 80, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["鶏肉を開いて梅と大葉を巻く", "巻き終わりを下にして焼き、蒸し焼きで火を通す"], "巻きが緩いときは爪楊枝で留めて"),
  DR("d-mune-teriyaki", "鶏むね肉の照り焼き", 15, "和風", "焼く", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["はちみつ", ["はちみつ"], 0.5, "大さじ"]], ["鶏肉に片栗粉を薄くまぶして焼く", "醤油・みりん・はちみつのタレを絡める"], "片栗粉でタレがよく絡み、しっとりします"),
  DR("d-tori-tsukune", "鶏つくね", 20, "和風", "焼く", "主菜", [["ひき肉", ["ひき肉", "鶏ひき肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["卵", ["卵", "たまご"], 0.5, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["ひき肉にねぎ・卵・片栗粉を混ぜて小判型にする", "両面焼いて照り焼きのタレを絡める"], "卵黄をつけて食べる月見つくねもおすすめ"),
  DR("d-soboro-don", "鶏そぼろ丼", 15, "和風", "炒める", "主食", [["ひき肉", ["ひき肉", "鶏ひき肉"], 75, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["ひき肉を醤油・砂糖でそぼろに炒める", "炒り卵を作り、ごはんに2色にのせる"], "そぼろは汁気を飛ばすとごはんがべちゃっとしません"),
  DR("d-tebamoto-kani", "手羽元の甘辛だれ", 20, "和風", "揚げる", "主菜", [["手羽元", ["手羽元", "鶏肉"], 3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["手羽元に片栗粉をまぶして揚げ焼きにする", "醤油・砂糖・酢の甘辛だれを絡め、ごまを振る"], "ごまの香ばしさがアクセント"),
  DR("d-tori-shio-karaage", "鶏の塩唐揚げ", 25, "和風", "揚げる", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["レモン", ["レモン"], 0.25, "個"]], ["鶏肉を塩・酒・生姜に漬ける", "片栗粉をまぶして揚げ、レモンを添える"], "塩味はシンプルで飽きない味"),
  DR("d-tori-chili", "鶏チリ", 20, "中華", "炒める", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["ケチャップ", ["ケチャップ"], 1.5, "大さじ"]], ["鶏肉に片栗粉をまぶして焼く", "ケチャップ・鶏ガラスープの素のチリソースで絡める"], "辛さは豆板醤を大人の分だけ後入れで"),
  DR("d-tori-mayo", "鶏マヨ", 15, "洋風", "炒める", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"]], ["鶏肉に片栗粉をまぶしてこんがり焼く", "マヨネーズ・ケチャップ少しのオーロラソースで和える"], "子どもに人気のマヨ味です"),
  DR("d-yakitori-negima", "焼き鳥風ねぎま", 20, "和風", "焼く", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["鶏肉とねぎを交互に串に刺す（串なしでも可）", "フライパンで焼き、塩またはタレで仕上げる"], "ねぎは焦げ目がつくくらいが甘くておいしい"),
  DR("d-bangbang", "棒々鶏", 20, "中華", "蒸す", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["トマト", ["トマト"], 0.5, "個"]], ["鶏肉を酒蒸しして細く裂く", "きゅうりとトマトの上に盛り、ごまだれをかける"], "蒸し汁はスープに使うと無駄なし"),
  DR("d-tori-daikon-ume", "鶏大根の梅煮", 25, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["大根", ["大根", "だいこん"], 100, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"]], ["鶏肉と大根をだしで煮る", "梅干しを加えてさっぱり仕上げる"], "梅で後味すっきりの煮物"),
  DR("d-tori-jaga", "鶏じゃが", 30, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["材料を炒めてだしと調味料で煮る", "落し蓋をして味を含ませる"], "鶏の旨みであっさりした肉じゃが風"),
  // 豚肉
  DR("d-buta-nasu-miso", "豚肉となすの味噌炒め", 15, "和風", "炒める", "主菜", [["豚肉", ["豚肉"], 80, "g"], ["なす", ["なす", "ナス"], 1.5, "本"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["なすを炒めて一度取り出す", "豚肉を炒め、なすを戻して味噌だれを絡める"], "なすは油を吸うので先に炒めると色よく仕上がります"),
  DR("d-buta-moyashi", "豚もやし炒め", 10, "中華", "炒める", "主菜", [["豚肉", ["豚肉"], 75, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["豚肉を炒める", "もやしとにらを加えて強火で手早く炒め、塩こしょうと醤油で仕上げる"], "もやしは炒めすぎないのがシャキシャキのコツ"),
  DR("d-buta-kimuchi-don", "豚キムチ丼", 15, "中華", "炒める", "主食", [["豚肉", ["豚肉"], 75, "g"], ["キムチ", ["キムチ"], 50, "g"], ["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["豚肉とキムチを炒める", "ごはんにのせ、半熟の目玉焼きを添える"], "マヨネーズを少し垂らすとまろやかに"),
  DR("d-tonteki", "トンテキ", 20, "洋風", "焼く", "主菜", [["豚ロース", ["豚ロース", "豚肉"], 120, "g"], ["にんにく", ["にんにく"], 1, "かけ"], ["キャベツ", ["キャベツ"], 50, "g"]], ["豚肉の脂身に切り込みを入れて焼く", "にんにくとソース・醤油のタレを煮詰めて絡める"], "厚切り肉は常温に戻してから焼くと柔らか"),
  DR("d-buta-daikon-miso", "豚と大根の味噌煮", 30, "和風", "煮る", "主菜", [["豚バラ肉", ["豚バラ", "豚肉"], 80, "g"], ["大根", ["大根", "だいこん"], 100, "g"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["豚肉と大根をだしで煮る", "味噌を溶き入れてこっくり煮詰める"], "大根は下ゆですると味が入りやすくなります"),
  DR("d-buta-egg-itame", "豚肉と卵の炒め物", 15, "中華", "炒める", "主菜", [["豚肉", ["豚肉"], 60, "g"], ["卵", ["卵", "たまご"], 2, "個"], ["しめじ", ["しめじ"], 0.5, "パック"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["卵をふんわり炒めて取り出す", "豚肉としめじを炒め、卵とにらを戻してオイスターソースで仕上げる"], "卵は最後に戻すとふんわり感が残ります"),
  DR("d-butabara-piri", "豚バラのピリ辛炒め", 15, "中華", "炒める", "主菜", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["豚肉をカリッと焼いて脂を出す", "ねぎを加え、豆板醤（大人の分だけ）と醤油で仕上げる"], "出た脂はキッチンペーパーで少し拭くと軽くなります"),
  DR("d-buta-kinpira", "豚肉のきんぴら炒め", 15, "和風", "炒める", "副菜", [["豚肉", ["豚肉"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["ごぼう", ["ごぼう"], 0.3, "本"]], ["ごぼうとにんじんを炒める", "豚肉を加え、醤油・砂糖・みりんで甘辛く仕上げる"], "お弁当にも入れやすい甘辛味"),
  DR("d-tonshabu-goma", "豚しゃぶのごまだれ", 15, "和風", "ゆでる", "主菜", [["豚肉", ["豚肉"], 100, "g"], ["水菜", ["水菜"], 40, "g"], ["ごま", ["ごま"], 1, "大さじ"]], ["豚肉を湯でさっとゆでる", "水菜の上に盛り、すりごまとポン酢のごまだれをかける"], "ゆで汁は灰汁を取ってスープに使えます"),
  DR("d-buta-ankake", "豚肉と野菜のあんかけ", 20, "中華", "炒める", "主菜", [["豚肉", ["豚肉"], 60, "g"], ["白菜", ["白菜"], 0.06, "玉"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["豚肉と野菜を炒めてスープで煮る", "水溶き片栗粉でとろみをつける"], "ごはんにかけるとあんかけ丼になります"),
  // 牛肉
  DR("d-gyu-shigure", "牛しぐれ煮", 20, "和風", "煮る", "副菜", [["牛肉", ["牛肉"], 75, "g"], ["生姜", ["生姜", "しょうが"], 10, "g"], ["ごぼう", ["ごぼう"], 0.3, "本"]], ["牛肉と千切り生姜・ごぼうを醤油・砂糖で煮詰める", "汁気が少なくなるまで煮る"], "ごはんのお供の作り置きに"),
  DR("d-gyu-sukiyaki", "すき焼き風煮", 25, "和風", "煮る", "主菜", [["牛肉", ["牛肉"], 100, "g"], ["白菜", ["白菜"], 0.06, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["しらたき", ["しらたき"], 50, "g"]], ["割り下で牛肉を煮て一度取り出す", "野菜と豆腐を煮て牛肉を戻す"], "卵をつけて食べるのがすき焼き風"),
  DR("d-gyu-stamina", "牛肉のスタミナ炒め", 15, "和風", "炒める", "主菜", [["牛肉", ["牛肉"], 100, "g"], ["にんにく", ["にんにく"], 1, "かけ"], ["にら", ["にら", "ニラ"], 0.5, "束"]], ["牛肉をにんにくと炒める", "にらを加えて醤油とみりんで仕上げる"], "ごはんが進む力強い味"),
  DR("d-gyu-koma", "牛こまの甘辛炒め", 15, "和風", "炒める", "主菜", [["牛肉", ["牛肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["玉ねぎを炒めて牛肉を加える", "醤油・砂糖・みりんで甘辛く煮詰める"], "丼にもお弁当にも使える万能おかず"),
  DR("d-gyu-piman-oyster", "牛肉とピーマンのオイスター炒め", 15, "中華", "炒める", "主菜", [["牛肉", ["牛肉"], 80, "g"], ["ピーマン", ["ピーマン"], 2, "個"], ["たけのこ", ["たけのこ"], 50, "g"]], ["牛肉を炒めて取り出す", "ピーマンとたけのこを炒め、牛肉を戻してオイスターソースで仕上げる"], "たけのこの代わりに玉ねぎでも"),
  DR("d-gyu-tomato", "牛肉とトマトの炒め物", 15, "中華", "炒める", "主菜", [["牛肉", ["牛肉"], 80, "g"], ["トマト", ["トマト"], 1, "個"], ["卵", ["卵", "たまご"], 1, "個"]], ["トマトを炒めて少し崩す", "牛肉と溶き卵を加えてオイスターソースで仕上げる"], "トマトの酸味が牛肉と合います"),
  DR("d-gyu-yakiniku", "牛肉の焼肉だれ炒め", 15, "和風", "炒める", "主菜", [["牛肉", ["牛肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ピーマン", ["ピーマン"], 1, "個"]], ["牛肉と野菜を強火で炒める", "焼肉のたれを絡めて仕上げる"], "レタスで巻いて食べてもおいしい"),
  DR("d-gyu-cream", "牛肉とじゃがいものクリーム煮", 25, "洋風", "煮る", "主菜", [["牛肉", ["牛肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["牛乳", ["牛乳"], 100, "mL"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["牛肉と野菜を炒めて水で煮る", "牛乳とコンソメを加えてとろみをつける"], "パンにもごはんにも合う洋風煮"),
  // ひき肉
  DR("d-niku-miso", "肉味噌", 15, "和風", "炒める", "副菜", [["ひき肉", ["ひき肉"], 100, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["ひき肉を炒めて味噌・砂糖・みりんで味付ける", "ねぎを加えて水分を飛ばす"], "ごはん・麺・野菜につける作り置き"),
  DR("d-dry-curry", "ドライカレー", 20, "洋風", "炒める", "主食", [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ピーマン", ["ピーマン"], 1, "個"], ["カレー粉", ["カレー粉", "カレールー"], 1, "大さじ"], ["米", ["米", "ごはん"], 100, "g"]], ["ひき肉と野菜を炒めてカレー粉で味付ける", "ごはんにのせ、目玉焼きを添える"], "水分少なめでお弁当にも"),
  DR("d-piman-nikuzume", "ピーマンの肉詰め", 25, "和風", "焼く", "主菜", [["ピーマン", ["ピーマン"], 3, "個"], ["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["ピーマンを縦半分に切り、肉だねを詰める", "フライパンで蒸し焼きにして照り焼きのタレを絡める"], "肉だねにパン粉を混ぜるとふんわり"),
  DR("d-nasu-hasami", "なすのはさみ焼き", 20, "和風", "焼く", "主菜", [["なす", ["なす", "ナス"], 1.5, "本"], ["ひき肉", ["ひき肉"], 75, "g"]], ["なすに切り込みを入れて肉だねをはさむ", "両面を焼いて甘辛だれを絡める"], "なすがとろとろになるまで焼くのがコツ"),
  DR("d-hiki-lettuce", "ひき肉のレタス包み", 15, "中華", "炒める", "主菜", [["ひき肉", ["ひき肉"], 100, "g"], ["レタス", ["レタス"], 60, "g"], ["たけのこ", ["たけのこ"], 30, "g"]], ["ひき肉とたけのこを味噌味で炒める", "レタスに包んで食べる"], "子どもも手で包むのが楽しい一品"),
  DR("d-meatball-amazu", "肉団子の甘酢あん", 25, "中華", "揚げる", "主菜", [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["肉団子を丸めて揚げ焼きにする", "酢・醤油・砂糖の甘酢あんを絡める"], "団子は小さめにすると火通りが早い"),
  DR("d-meatloaf", "ミートローフ風", 40, "洋風", "焼く", "主菜", [["ひき肉", ["ひき肉"], 150, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["卵", ["卵", "たまご"], 1, "個"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["材料を練ってパウンド型（またはホイル型）に詰める", "200℃で25分焼き、粗熱を取ってから切る"], "切り分けてお弁当や作り置きにも"),
  DR("d-hiki-omelette", "ひき肉オムレツ", 15, "洋風", "焼く", "主菜", [["ひき肉", ["ひき肉"], 60, "g"], ["卵", ["卵", "たまご"], 2, "個"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 0.5, "個"]], ["ひき肉とじゃがいもを炒める", "溶き卵を流し入れて半熟で巻く"], "ケチャップをかける定番の味"),
  DR("d-hiki-jaga", "ひき肉じゃが", 25, "和風", "煮る", "主菜", [["ひき肉", ["ひき肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["ひき肉を炒めて野菜と煮る", "醤油・砂糖で甘辛く味を含ませる"], "そぼろ状でごはんにかけても"),
  DR("d-taco-meat", "タコミート", 15, "洋風", "炒める", "副菜", [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ケチャップ", ["ケチャップ"], 1.5, "大さじ"], ["カレー粉", ["カレー粉"], 0.5, "小さじ"]], ["ひき肉と玉ねぎを炒める", "ケチャップ・カレー粉・ソースで味付ける"], "ごはん・パン・サラダに使える作り置き"),
  DR("d-nikudango-soup", "肉団子スープ", 20, "中華", "スープ", "汁物", [["ひき肉", ["ひき肉"], 75, "g"], ["白菜", ["白菜"], 0.06, "玉"], ["春雨", ["春雨"], 15, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["肉団子を丸めてスープに落とす", "白菜と春雨を加えて中華だしで仕上げる"], "生姜で体が温まるスープ"),
  DR("d-mabo-harusame", "麻婆春雨", 20, "中華", "煮る", "主菜", [["春雨", ["春雨"], 30, "g"], ["ひき肉", ["ひき肉"], 60, "g"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["春雨を戻してひき肉と煮る", "味噌・醤油で味付けし、にらを加える"], "春雨が味を吸って主菜になる一品"),

  // 魚介
  DR("d-sake-miso", "鮭の味噌漬け焼き", 20, "和風", "焼く", "主菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["鮭を味噌・みりんに30分漬ける", "味噌を拭って両面を焼く"], "漬け味噌は拭ってから焼くと焦げません"),
  DR("d-sake-cream", "鮭のクリーム煮", 25, "洋風", "煮る", "主菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 100, "mL"], ["しめじ", ["しめじ"], 0.5, "パック"]], ["鮭を焼いて取り出す", "玉ねぎとしめじを炒めて牛乳で煮て、鮭を戻す"], "牛乳は沸騰させると分離するので弱火で"),
  DR("d-sake-nanban", "鮭の南蛮漬け", 25, "和風", "漬ける", "主菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["鮭に片栗粉をまぶして揚げ焼きにする", "野菜と一緒に甘酢に漬ける"], "冷やすと味がしみておいしくなります"),
  DR("d-sake-buttercorn", "鮭とコーンのバター焼き", 15, "洋風", "焼く", "主菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["バター", ["バター"], 10, "g"]], ["鮭をバターで両面焼く", "コーンを加えて醤油を少し垂らす"], "ホイルに包んで焼いてもふっくら"),
  DR("d-sake-fry", "鮭フライ", 20, "洋風", "揚げる", "主菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["鮭に衣をつける", "油でカラッと揚げる"], "タルタルソースを添えるのが定番"),
  DR("d-sake-harasa", "鮭のハラス焼き風", 15, "和風", "焼く", "主菜", [["鮭", ["鮭", "さけ", "ハラス"], 1, "切れ"]], ["鮭（ハラス部分）に塩をふって10分置く", "グリル（またはフライパン）で脂を落としながら焼く"], "脂がのった部分は大根おろしと相性抜群"),
  DR("d-saba-shoga", "さばの生姜焼き風", 15, "和風", "焼く", "主菜", [["さば", ["さば", "サバ"], 1, "切れ"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["さばに小麦粉を薄くまぶして焼く", "生姜・醤油・みりんのタレを絡める"], "臭みが気になるときは下処理で湯をかけて"),
  DR("d-saba-curry", "さばのカレー焼き", 15, "洋風", "焼く", "主菜", [["さば", ["さば", "サバ"], 1, "切れ"], ["カレー粉", ["カレー粉"], 0.5, "小さじ"]], ["さばに塩とカレー粉をまぶす", "フライパンで両面を焼く"], "カレーの香りで魚が苦手でも食べやすく"),
  DR("d-saba-tomato", "さばのトマト煮", 20, "洋風", "煮る", "主菜", [["さば", ["さば", "サバ"], 1, "切れ"], ["トマト缶", ["トマト缶"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["さばを焼いて取り出す", "玉ねぎとトマト缶を煮て、さばを戻して煮込む"], "にんにくを効かせると洋風らしくなります"),
  DR("d-saba-ume-miso", "さばの梅味噌煮", 20, "和風", "煮る", "主菜", [["さば", ["さば", "サバ"], 1, "切れ"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["さばを湯引きして臭みを取る", "梅干しと味噌で煮る"], "梅の酸味でさっぱりした味噌煮"),
  DR("d-aji-nanban", "あじの南蛮漬け", 25, "和風", "漬ける", "主菜", [["あじ", ["あじ", "アジ"], 1, "尾"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["あじに片栗粉をまぶして揚げ焼きにする", "野菜と甘酢に漬ける"], "小あじなら骨まで食べられます"),
  DR("d-aji-tataki", "あじのたたき風", 15, "和風", "和える", "主菜", [["あじ", ["あじ", "アジ"], 1, "尾"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["生姜", ["生姜", "しょうが"], 3, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["あじの身を包丁で細かくたたく", "大葉・生姜・味噌と混ぜる"], "新鮮なあじで作る漁師風の一品"),
  DR("d-aji-shio", "あじの塩焼き", 15, "和風", "焼く", "主菜", [["あじ", ["あじ", "アジ"], 1, "尾"]], ["あじに塩をふって10分置く", "グリルで両面を焼く"], "大根おろしとレモンを添えて"),
  DR("d-aji-panko", "あじの香草パン粉焼き", 20, "洋風", "焼く", "主菜", [["あじ", ["あじ", "アジ"], 1, "尾"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["パセリ", ["パセリ"], 1, "g"]], ["あじにパン粉とパセリを混ぜた衣をのせる", "オーブントースター（またはフライパン）で焼く"], "揚げないフライ風で後片付けも楽"),
  DR("d-iwashi-ume", "いわしの梅煮", 25, "和風", "煮る", "主菜", [["いわし", ["いわし", "イワシ"], 2, "尾"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["いわしの下処理をする", "梅干しと生姜で落し蓋をして煮る"], "骨まで柔らかく煮ると食べやすい"),
  DR("d-iwashi-shoga", "いわしの生姜煮", 20, "和風", "煮る", "主菜", [["いわし", ["いわし", "イワシ"], 2, "尾"], ["生姜", ["生姜", "しょうが"], 10, "g"]], ["いわしの下処理をする", "生姜たっぷりの甘辛汁で煮る"], "生姜で臭みが消えてごはんが進みます"),
  DR("d-iwashi-fry", "いわしフライ", 20, "洋風", "揚げる", "主菜", [["いわし", ["いわし", "イワシ"], 2, "尾"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["いわしを開いて衣をつける", "油でカラッと揚げる"], "大葉をはさんで揚げてもおいしい"),
  DR("d-iwashi-kabayaki", "いわしの蒲焼き風", 15, "和風", "焼く", "主菜", [["いわし", ["いわし", "イワシ"], 2, "尾"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["いわしを開いて片栗粉をまぶして焼く", "醤油・みりん・砂糖のタレを煮詰めて絡める"], "ごはんにのせると蒲焼き丼に"),
  DR("d-sanma-kabayaki", "さんまの蒲焼き", 15, "和風", "焼く", "主菜", [["さんま", ["さんま", "サンマ"], 1, "尾"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["さんまを開いて片栗粉をまぶして焼く", "甘辛いタレを絡める"], "缶詰風の味を家で再現"),
  DR("d-sanma-shoga", "さんまの生姜煮", 20, "和風", "煮る", "主菜", [["さんま", ["さんま", "サンマ"], 1, "尾"], ["生姜", ["生姜", "しょうが"], 10, "g"]], ["さんまを筒切りにする", "生姜と甘辛汁で煮る"], "圧力鍋なら骨まで柔らかく"),
  DR("d-buri-shio", "ぶりの塩焼き", 15, "和風", "焼く", "主菜", [["ぶり", ["ぶり", "ブリ"], 1, "切れ"]], ["ぶりに塩をして10分置き、水分を拭く", "グリルで両面を焼く"], "大根おろしでさっぱりと"),
  DR("d-buri-yuan", "ぶりの幽庵焼き風", 20, "和風", "焼く", "主菜", [["ぶり", ["ぶり", "ブリ"], 1, "切れ"], ["ゆず", ["ゆず"], 0.25, "個"]], ["ぶりを醤油・みりん・ゆず汁に30分漬ける", "漬け汁を拭って焼く"], "柚子の香りが上品な焼き魚"),
  DR("d-buri-nitsuke", "ぶりの煮付け", 20, "和風", "煮る", "主菜", [["ぶり", ["ぶり", "ブリ"], 1, "切れ"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["ぶりを湯引きする", "生姜と甘辛汁で煮付ける"], "照り焼きよりあっさりした煮付け"),
  DR("d-tara-mushi", "たらの中華蒸し", 20, "中華", "蒸す", "主菜", [["たら", ["たら", "タラ"], 1, "切れ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["たらにねぎと生姜をのせて蒸す", "熱した油と醤油をかける"], "蒸し器がなければフライパン＋蓋で"),
  DR("d-tara-misonabe", "たらの味噌鍋", 25, "和風", "煮る", "主菜", [["たら", ["たら", "タラ"], 1, "切れ"], ["白菜", ["白菜"], 0.06, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"], ["バター", ["バター"], 5, "g"]], ["野菜と豆腐をだしで煮る", "たらを入れて味噌で仕上げ、バターをのせる"], "バターのコクが味噌と合います"),
  DR("d-tara-picata", "たらのピカタ", 15, "洋風", "焼く", "主菜", [["たら", ["たら", "タラ"], 1, "切れ"], ["卵", ["卵", "たまご"], 1, "個"], ["チーズ", ["チーズ"], 10, "g"]], ["たらに溶き卵とチーズを絡めて焼く", "両面こんがり焼く"], "淡白なたらがふんわりリッチに"),
  DR("d-maguro-steak", "まぐろのステーキ", 15, "洋風", "焼く", "主菜", [["まぐろ", ["まぐろ", "マグロ"], 100, "g"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["まぐろに塩こしょうして表面を焼く", "にんにく醤油のソースをかける"], "中はレアに残すのがステーキ風"),
  DR("d-maguro-zuke", "まぐろの漬け丼", 15, "和風", "漬ける", "主食", [["まぐろ", ["まぐろ", "マグロ"], 80, "g"], ["米", ["米", "ごはん"], 100, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"], ["海苔", ["海苔"], 0.5, "枚"]], ["まぐろを醤油・みりんに10分漬ける", "ごはんにのせ、大葉と海苔を散らす"], "わさびを添えると味が締まります"),
  DR("d-maguro-nitsuke", "まぐろの煮付け", 20, "和風", "煮る", "主菜", [["まぐろ", ["まぐろ", "マグロ"], 80, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["まぐろを湯引きする", "生姜と甘辛汁で煮付ける"], "加熱用のまぐろをおいしく食べる工夫"),
  DR("d-katsuo-shoga", "かつおの生姜焼き", 15, "和風", "焼く", "主菜", [["かつお", ["かつお", "カツオ"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["かつおに小麦粉を薄くまぶして焼く", "生姜醤油のタレを絡める"], "刺身の残りを主菜に変える一品"),
  DR("d-katsuo-tatsuta", "かつおの竜田揚げ", 20, "和風", "揚げる", "主菜", [["かつお", ["かつお", "カツオ"], 100, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["かつおを生姜醤油に漬ける", "片栗粉をまぶして揚げる"], "下味をしっかりつけると臭みなし"),
  DR("d-karei-muniere", "かれいのムニエル", 15, "洋風", "焼く", "主菜", [["かれい", ["かれい", "カレイ"], 1, "切れ"], ["小麦粉", ["小麦粉"], 1, "大さじ"], ["バター", ["バター"], 10, "g"], ["レモン", ["レモン"], 0.25, "個"]], ["かれいに小麦粉をまぶしてバターで焼く", "レモンを搾る"], "皮目をカリッと焼くのがコツ"),
  DR("d-karei-karaage", "かれいの唐揚げ", 20, "和風", "揚げる", "主菜", [["かれい", ["かれい", "カレイ"], 1, "切れ"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["かれいに片栗粉をまぶす", "油でカラッと揚げ、塩を振る"], "骨の周りまで香ばしく"),
  DR("d-hokke-shio", "ほっけの塩焼き", 15, "和風", "焼く", "主菜", [["ほっけ", ["ほっけ", "ホッケ"], 1, "切れ"]], ["ほっけをグリルで両面焼く", "大根おろしを添える"], "皮はパリッと身はふっくらが目標"),
  DR("d-hokke-mirin", "ほっけのみりん干し風", 15, "和風", "焼く", "主菜", [["ほっけ", ["ほっけ", "ホッケ"], 1, "切れ"], ["みりん", ["みりん"], 1, "大さじ"]], ["ほっけにみりんと醤油を絡めて少し置く", "焦がさないよう焼く"], "甘みのある干物風の味"),
  DR("d-shishamo-fry", "ししゃもフライ", 15, "洋風", "揚げる", "主菜", [["ししゃも", ["ししゃも"], 3, "尾"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["ししゃもに衣をつける", "油でカラッと揚げる"], "卵たっぷりの子持ちししゃもで"),
  DR("d-shishamo-nanban", "ししゃもの南蛮漬け", 20, "和風", "漬ける", "副菜", [["ししゃも", ["ししゃも"], 3, "尾"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["ししゃもを焼いて甘酢に漬ける", "玉ねぎと一緒に冷やす"], "焼くだけで作れる簡単南蛮"),
  DR("d-tarako-spa", "たらこスパゲッティ", 15, "洋風", "和える", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["たらこ", ["たらこ"], 1, "腹"], ["バター", ["バター"], 10, "g"], ["海苔", ["海苔"], 0.5, "枚"]], ["パスタをゆでる", "バターとほぐしたたらこを絡め、海苔をのせる"], "牛乳を少し加えるとまろやかに"),
  DR("d-mentai-potato", "明太マヨポテト", 15, "洋風", "和える", "副菜", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["明太子", ["明太子"], 0.5, "腹"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["じゃがいもをゆでて一口大に切る", "明太子とマヨネーズで和える"], "温かいうちに和えると味がなじみます"),
  DR("d-tarako-tamago", "たらこ入り卵焼き", 10, "和風", "焼く", "副菜", [["卵", ["卵", "たまご"], 2, "個"], ["たらこ", ["たらこ"], 0.5, "腹"]], ["溶き卵でたらこを巻くように焼く", "巻いて形を整える"], "お弁当の彩りにもなる卵焼き"),
  DR("d-ebi-garlic", "ガーリックシュリンプ風", 15, "洋風", "炒める", "主菜", [["えび", ["えび", "エビ"], 5, "尾"], ["にんにく", ["にんにく"], 1, "かけ"], ["バター", ["バター"], 10, "g"]], ["えびの下処理をする", "にんにくとバターで炒め、塩こしょうで仕上げる"], "殻ごと炒めると香ばしくなります"),
  DR("d-ebi-tempura", "えびの天ぷら", 20, "和風", "揚げる", "主菜", [["えび", ["えび", "エビ"], 4, "尾"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["えびの背わたを取り、筋を切って伸ばす", "天ぷら衣をつけて揚げる"], "衣は冷水で作るとサクッと"),
  DR("d-ebi-shinjo", "えびしんじょ風", 20, "和風", "揚げる", "主菜", [["えび", ["えび", "エビ"], 4, "尾"], ["はんぺん", ["はんぺん"], 0.5, "枚"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["えびとはんぺんを潰して混ぜる", "丸めて揚げる（または吸い物の具に）"], "はんぺんでふんわり簡単しんじょ"),
  DR("d-ebi-broccoli", "えびとブロッコリーの炒め物", 15, "中華", "炒める", "主菜", [["えび", ["えび", "エビ"], 4, "尾"], ["ブロッコリー", ["ブロッコリー"], 60, "g"]], ["ブロッコリーを下ゆでする", "えびと炒めて塩と鶏ガラスープの素で仕上げる"], "えびは焼きすぎると固くなるので最後に"),
  DR("d-ebi-avocado", "えびとアボカドのサラダ", 10, "洋風", "和える", "副菜", [["えび", ["えび", "エビ"], 3, "尾"], ["アボカド", ["アボカド"], 0.5, "個"], ["レモン", ["レモン"], 0.25, "個"]], ["えびをゆでて冷ます", "アボカドとマヨネーズ・レモンで和える"], "プリプリとクリーミーの組み合わせ"),
  DR("d-ika-ring", "イカリングフライ", 20, "洋風", "揚げる", "主菜", [["いか", ["いか", "イカ"], 80, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["いかを輪切りにして衣をつける", "油でカラッと揚げる"], "揚げすぎると固くなるので短時間で"),
  DR("d-ika-shoga", "いかの生姜焼き", 15, "和風", "焼く", "主菜", [["いか", ["いか", "イカ"], 80, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["いかに切り込みを入れる", "強火でさっと焼いて生姜醤油を絡める"], "焼きすぎは固さの元、短時間がコツ"),
  DR("d-ika-nitsuke", "いかの煮付け", 20, "和風", "煮る", "主菜", [["いか", ["いか", "イカ"], 80, "g"], ["大根", ["大根", "だいこん"], 80, "g"]], ["大根を下煮する", "いかを加えて甘辛く煮付ける"], "いかは最後に入れると柔らかく仕上がります"),
  DR("d-ika-marine", "いかのマリネ", 15, "洋風", "漬ける", "副菜", [["いか", ["いか", "イカ"], 60, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ピーマン", ["ピーマン"], 0.5, "個"]], ["いかをさっとゆでる", "野菜と酢・オリーブオイルの液に漬ける"], "冷やすと味がしみます"),
  DR("d-tako-karaage", "たこの唐揚げ", 15, "和風", "揚げる", "主菜", [["たこ", ["たこ", "タコ"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["たこに醤油と生姜で下味をつける", "片栗粉をまぶして揚げる"], "水気をよく拭いてからはね防止を"),
  DR("d-tako-sumiso", "たこの酢味噌和え", 10, "和風", "和える", "副菜", [["たこ", ["たこ", "タコ"], 60, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["わかめ", ["わかめ"], 2, "g"]], ["たこ・きゅうり・わかめを一口大にする", "酢味噌で和える"], "酢味噌は砂糖でまろやかに調整"),
  DR("d-asari-sakamushi", "あさりの酒蒸し", 15, "和風", "蒸す", "主菜", [["あさり", ["あさり", "アサリ"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["あさりの砂抜きをする", "酒と一緒に蒸して口が開いたらねぎを散らす"], "蒸し汁は味噌汁やパスタに使えます"),
  DR("d-asari-butter", "あさりのバター醤油蒸し", 15, "洋風", "蒸す", "主菜", [["あさり", ["あさり", "アサリ"], 100, "g"], ["バター", ["バター"], 10, "g"], ["キャベツ", ["キャベツ"], 50, "g"]], ["キャベツの上にあさりをのせて蒸す", "バターと醤油で仕上げる"], "キャベツが旨みを吸っておいしくなります"),
  DR("d-asari-cabbage", "あさりとキャベツの蒸し物", 15, "和風", "蒸す", "副菜", [["あさり", ["あさり", "アサリ"], 80, "g"], ["キャベツ", ["キャベツ"], 80, "g"]], ["キャベツをざく切りにして鍋に敷く", "あさりをのせて酒蒸しにする"], "塩だけで貝の旨みを味わう一品"),
  DR("d-hotate-butter", "ほたてのバター醤油焼き", 15, "洋風", "焼く", "主菜", [["ほたて", ["ほたて", "ホタテ"], 3, "個"], ["バター", ["バター"], 10, "g"]], ["ほたての水気を拭いて焼く", "バターと醤油を絡める"], "表面だけ香ばしく中はふっくら"),
  DR("d-hotate-carpaccio", "ほたてのカルパッチョ風", 10, "洋風", "和える", "副菜", [["ほたて", ["ほたて", "ホタテ"], 2, "個"], ["レモン", ["レモン"], 0.25, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["ほたてを薄く切って皿に並べる", "レモン汁・オリーブオイル・塩をかけ、大葉を散らす"], "刺身用ほたてで作るごちそう副菜"),
  DR("d-kani-tamago", "かに玉", 15, "中華", "焼く", "主菜", [["卵", ["卵", "たまご"], 2, "個"], ["かに", ["かに", "カニ"], 40, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["卵にかにとねぎを混ぜてふんわり焼く", "甘酢あんをかける"], "カニかまでも作れる定番中華"),
  DR("d-kani-ankake", "かにのあんかけ豆腐", 15, "中華", "煮る", "主菜", [["豆腐", ["豆腐"], 0.75, "丁"], ["かに", ["かに", "カニ"], 40, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["豆腐を中華スープで温める", "かに入りのあんをかける"], "体が温まる優しい味"),
  DR("d-shirasu-oroshi", "しらすおろし", 10, "和風", "和える", "副菜", [["しらす", ["しらす"], 25, "g"], ["大根", ["大根", "だいこん"], 80, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["大根をおろして軽く水気を切る", "しらすと大葉をのせ、ポン酢をかける"], "大根の辛みはおろし方で調整"),
  DR("d-shirasu-toast", "しらすトースト", 10, "洋風", "焼く", "主食", [["食パン", ["食パン", "パン"], 1, "枚"], ["しらす", ["しらす"], 20, "g"], ["チーズ", ["チーズ"], 15, "g"], ["海苔", ["海苔"], 0.5, "枚"]], ["パンにしらすとチーズをのせる", "トースターで焼いて海苔を散らす"], "マヨネーズを薄く塗るとコクが出ます"),
  DR("d-shirasu-pasta", "しらすの和風パスタ", 15, "和風", "和える", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["しらす", ["しらす"], 25, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["バター", ["バター"], 5, "g"]], ["パスタをゆでる", "バター醤油としらすを絡め、大葉をのせる"], "梅を加えるとさっぱりアレンジに"),
  DR("d-sabacan-daikon", "サバ缶と大根の煮物", 20, "和風", "煮る", "副菜", [["サバ缶", ["サバ缶", "さば缶"], 0.5, "缶"], ["大根", ["大根", "だいこん"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["大根をサバ缶の汁と水で煮る", "サバを加えて生姜と煮含める"], "缶の汁がだしになる簡単煮物"),
  DR("d-tuna-jaga", "ツナ缶とじゃがいもの煮物", 20, "和風", "煮る", "副菜", [["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["じゃがいもと玉ねぎを煮る", "ツナを汁ごと加えて醤油で仕上げる"], "肉じゃが風の魚版です"),

  // 豆腐・大豆
  DR("d-mabo-home", "おうち麻婆豆腐", 20, "中華", "煮る", "主菜", [["豆腐", ["豆腐"], 1, "丁"], ["ひき肉", ["ひき肉"], 75, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["ひき肉を炒めてスープと豆腐を煮る", "味噌・醤油で味付けし、水溶き片栗粉でとろみをつける"], "辛さは豆板醤を大人の分にだけ後入れで"),
  DR("d-tofu-steak", "豆腐ステーキ", 15, "和風", "焼く", "主菜", [["豆腐", ["豆腐"], 1, "丁"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["バター", ["バター"], 5, "g"]], ["水切りした豆腐に片栗粉をまぶして焼く", "バター醤油を絡める"], "しっかり水切りするとカリッと焼けます"),
  DR("d-niku-tofu", "肉豆腐", 20, "和風", "煮る", "主菜", [["牛肉", ["牛肉"], 75, "g"], ["豆腐", ["豆腐"], 1, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["牛肉とねぎを甘辛く煮る", "豆腐を加えて煮含める"], "すき焼きの残りでも作れる家庭の味"),
  DR("d-atsuage-ni", "厚揚げの煮物", 20, "和風", "煮る", "副菜", [["厚揚げ", ["厚揚げ"], 1, "枚"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["いんげん", ["いんげん"], 3, "本"]], ["厚揚げに熱湯をかけて油抜きする", "野菜とだしで煮含める"], "油抜きすると味が入りやすくなります"),
  DR("d-atsuage-shoga", "厚揚げの生姜焼き", 15, "和風", "焼く", "主菜", [["厚揚げ", ["厚揚げ"], 1, "枚"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["厚揚げを両面こんがり焼く", "生姜醤油のタレを絡める"], "大根おろしを添えるとさっぱり"),
  DR("d-ganmo-ni", "がんもどきの煮物", 20, "和風", "煮る", "副菜", [["がんもどき", ["がんもどき"], 2, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["しいたけ", ["しいたけ"], 1, "個"]], ["がんもどきを油抜きする", "野菜とだしで煮る"], "味がしみるので作り置きにも"),
  DR("d-koya-ni", "高野豆腐の煮物", 25, "和風", "煮る", "副菜", [["高野豆腐", ["高野豆腐"], 1.5, "枚"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["干ししいたけ", ["干ししいたけ"], 1, "個"]], ["高野豆腐を戻す", "だしで野菜と煮含める"], "戻し汁もだしに使うと旨みが増します"),
  DR("d-tofu-champuru", "豆腐チャンプルー", 15, "和風", "炒める", "主菜", [["豆腐", ["豆腐"], 1, "丁"], ["豚肉", ["豚肉"], 50, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["水切りした豆腐を焼き付ける", "豚肉ともやしを炒め合わせ、卵なしでも醤油とかつお節で仕上げる"], "かつお節をたっぷりかけるのが沖縄風"),
  DR("d-tofu-egg-toji", "豆腐の卵とじ", 15, "和風", "煮る", "主菜", [["豆腐", ["豆腐"], 1, "丁"], ["卵", ["卵", "たまご"], 2, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["玉ねぎと豆腐をだしで煮る", "溶き卵を回し入れてふんわりとじる"], "優しい味で食欲がない日にも"),
  DR("d-yudofu", "湯豆腐", 15, "和風", "煮る", "主菜", [["豆腐", ["豆腐"], 1, "丁"], ["白菜", ["白菜"], 0.06, "玉"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["昆布", ["昆布"], 2, "g"]], ["昆布だしで豆腐と野菜を温める", "ポン酢や醤油だれで食べる"], "煮すぎると豆腐が固くなるので温める程度に"),
  DR("d-tofu-salad", "豆腐サラダ", 10, "和風", "和える", "副菜", [["豆腐", ["豆腐"], 0.75, "丁"], ["水菜", ["水菜"], 40, "g"], ["トマト", ["トマト"], 0.5, "個"], ["海苔", ["海苔"], 0.5, "枚"]], ["水切りした豆腐を手で崩す", "野菜と盛り、醤油とごま油のドレッシングをかける"], "和風ドレッシングが豆腐によく合います"),
  DR("d-aburaage-fukuro", "油揚げの袋煮風", 20, "和風", "煮る", "副菜", [["油揚げ", ["油揚げ"], 2, "枚"], ["卵", ["卵", "たまご"], 2, "個"]], ["油揚げを袋状に開いて卵を落とし入れる", "爪楊枝で留めてだしで煮る"], "半熟に仕上げると中から卵がとろり"),
  // 卵
  DR("d-tomato-egg", "トマトと卵の炒め物", 10, "中華", "炒める", "副菜", [["トマト", ["トマト"], 1, "個"], ["卵", ["卵", "たまご"], 2, "個"]], ["卵をふんわり炒めて取り出す", "トマトを炒めて卵を戻し、塩と少しの砂糖で仕上げる"], "トマトの酸味と卵のまろやかさが好相性"),
  DR("d-niratama", "にら玉", 10, "中華", "炒める", "副菜", [["にら", ["にら", "ニラ"], 0.5, "束"], ["卵", ["卵", "たまご"], 2, "個"]], ["にらを炒める", "溶き卵を加えてふんわり仕上げる"], "あんをかけるとにら玉あんかけに"),
  DR("d-ajitama-miso", "半熟卵の味噌漬け", 15, "和風", "漬ける", "副菜", [["卵", ["卵", "たまご"], 2, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["卵を7分ゆでて殻をむく", "味噌・みりん・砂糖に数時間〜一晩漬ける"], "味噌味の味付け卵、ごはんのお供に"),
  DR("d-scotch-egg", "スコッチエッグ風", 25, "洋風", "揚げる", "主菜", [["卵", ["卵", "たまご"], 2, "個"], ["ひき肉", ["ひき肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["ゆで卵に肉だねを包む", "衣をつけて揚げる"], "断面がきれいなごちそう卵料理"),
  DR("d-egg-salad", "卵サラダ", 15, "洋風", "和える", "副菜", [["卵", ["卵", "たまご"], 2, "個"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"], ["きゅうり", ["きゅうり"], 0.3, "本"]], ["ゆで卵を粗く潰す", "マヨネーズときゅうりで和える"], "パンにはさんでもおいしい"),
  // 野菜
  DR("d-yasai-tempura", "野菜天ぷら", 25, "和風", "揚げる", "主菜", [["かぼちゃ", ["かぼちゃ"], 40, "g"], ["さつまいも", ["さつまいも"], 0.5, "本"], ["なす", ["なす", "ナス"], 0.5, "本"], ["小麦粉", ["天ぷら粉", "小麦粉"], 3, "大さじ"]], ["野菜を切り、天ぷら衣をつける", "油でカラッと揚げる"], "塩で食べると野菜の甘みが際立ちます"),
  DR("d-nasu-dengaku", "なすの味噌田楽", 15, "和風", "焼く", "副菜", [["なす", ["なす", "ナス"], 1.5, "本"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["なすを焼く（または揚げ焼き）", "甘味噌をのせて少し焼く"], "田楽味噌は作り置きして豆腐にも"),
  DR("d-goya-tempura", "ゴーヤの天ぷら", 15, "和風", "揚げる", "副菜", [["ゴーヤ", ["ゴーヤ"], 0.5, "本"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["ゴーヤのワタを取って薄切りにする", "衣をつけて揚げ、塩で食べる"], "苦みが和らいで子どもでも食べやすく"),
  DR("d-kabocha-ten", "かぼちゃの天ぷら", 15, "和風", "揚げる", "副菜", [["かぼちゃ", ["かぼちゃ"], 80, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["かぼちゃを薄切りにする", "衣をつけて揚げる"], "ホクホク甘い天ぷらは塩で"),
  DR("d-kabocha-soboro", "かぼちゃのそぼろ煮", 20, "和風", "煮る", "副菜", [["かぼちゃ", ["かぼちゃ"], 150, "g"], ["ひき肉", ["ひき肉"], 50, "g"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["そぼろを煮てかぼちゃを加える", "柔らかくなったらあんを絡める"], "あんかけで冷めにくく、ごはんにも合う"),
  DR("d-renkon-hasami", "れんこんのはさみ焼き", 20, "和風", "焼く", "主菜", [["れんこん", ["れんこん"], 80, "g"], ["ひき肉", ["ひき肉"], 75, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["れんこんの間に肉だねをはさむ", "両面を焼いて甘辛だれを絡める"], "れんこんのシャキシャキ感が主役"),
  DR("d-renkon-kinpira", "れんこんのきんぴら", 15, "和風", "炒める", "副菜", [["れんこん", ["れんこん"], 80, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["れんこんを酢水にさらして炒める", "醤油・砂糖・みりんで甘辛く仕上げ、ごまを振る"], "歯ごたえを残すのがきんぴらのコツ"),
  DR("d-daikon-steak", "大根ステーキ", 20, "和風", "焼く", "主菜", [["大根", ["大根", "だいこん"], 150, "g"], ["バター", ["バター"], 5, "g"]], ["大根を下ゆでして水気を拭く", "バターで両面こんがり焼いて醤油を絡める"], "下ゆでで中まで味が入ります"),
  DR("d-daikon-aburaage", "大根と油揚げの煮物", 20, "和風", "煮る", "副菜", [["大根", ["大根", "だいこん"], 120, "g"], ["油揚げ", ["油揚げ"], 1, "枚"]], ["大根をだしで煮る", "油揚げを加えて煮含める"], "油揚げのコクで満足感のある煮物"),
  DR("d-cabbage-kasane", "キャベツとひき肉の重ね蒸し", 25, "洋風", "蒸す", "主菜", [["キャベツ", ["キャベツ"], 120, "g"], ["ひき肉", ["ひき肉"], 100, "g"], ["トマト缶", ["トマト缶"], 100, "g"]], ["キャベツと肉だねを重ねていく", "トマト缶をかけて蒸し煮にする"], "ロールキャベツの中身を重ねた時短版"),
  DR("d-hakusai-cream", "白菜のクリーム煮", 20, "洋風", "煮る", "副菜", [["白菜", ["白菜"], 0.12, "玉"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["牛乳", ["牛乳"], 100, "mL"]], ["白菜とベーコンを炒める", "牛乳とコンソメで煮てとろみをつける"], "白菜の甘みが引き立つ洋風煮"),
  DR("d-komatsuna-namul", "小松菜のナムル", 10, "和風", "和える", "副菜", [["小松菜", ["小松菜"], 0.5, "束"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["小松菜をゆでて水気を絞る", "ごま油・塩・すりごまで和える"], "ゆで時間は短く、色よく仕上げて"),
  DR("d-hourensou-corn", "ほうれん草とコーンのバター炒め", 10, "洋風", "炒める", "副菜", [["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.5, "束"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["バター", ["バター"], 5, "g"]], ["ほうれん草をバターで炒める", "コーンを加えて塩こしょうで仕上げる"], "彩りのよい付け合わせ副菜"),
  DR("d-broccoli-okaka", "ブロッコリーのおかか和え", 10, "和風", "和える", "副菜", [["ブロッコリー", ["ブロッコリー"], 60, "g"], ["かつお節", ["かつお節"], 1, "g"]], ["ブロッコリーをゆでる", "醤油とかつお節で和える"], "ゆで汁はスープに使えます"),
  DR("d-aspara-butter", "アスパラのバター焼き", 10, "洋風", "焼く", "副菜", [["アスパラ", ["アスパラ"], 3, "本"], ["バター", ["バター"], 5, "g"]], ["アスパラの下半分の皮をむく", "バターで焼いて塩こしょう"], "焼き色がつくくらいが香ばしい"),
  DR("d-ingen-goma", "いんげんのごま和え", 10, "和風", "和える", "副菜", [["いんげん", ["いんげん"], 6, "本"], ["ごま", ["ごま"], 1, "大さじ"]], ["いんげんをゆでる", "すりごまと醤油・砂糖で和える"], "筋を取ると食感がよくなります"),
  DR("d-ingen-ten", "いんげんの天ぷら", 15, "和風", "揚げる", "副菜", [["いんげん", ["いんげん"], 8, "本"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["いんげんに衣をつける", "油でカラッと揚げる"], "数本まとめて揚げると束の形がきれい"),
  DR("d-snap-mayo", "スナップエンドウのマヨ和え", 10, "洋風", "和える", "副菜", [["スナップエンドウ", ["スナップエンドウ"], 8, "個"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["スナップエンドウを塩ゆでする", "マヨネーズと少しの醤油で和える"], "ゆで過ぎると食感が消えるので1分程度"),
  DR("d-soramame", "そら豆の塩ゆで", 10, "和風", "ゆでる", "副菜", [["そら豆", ["そら豆"], 6, "個"]], ["そら豆のさやに切り込みを入れる", "塩湯で3分ゆでる"], "ゆでたてに塩を振るのが一番のごちそう"),
  DR("d-kyuri-su", "きゅうりの酢の物", 10, "和風", "和える", "副菜", [["きゅうり", ["きゅうり"], 1, "本"], ["わかめ", ["わかめ"], 2, "g"]], ["きゅうりを薄切りにして塩もみする", "わかめと甘酢で和える"], "しらすを加えるとカルシウムもプラス"),
  DR("d-nagaimo-ume", "長芋の梅和え", 10, "和風", "和える", "副菜", [["長芋", ["長芋", "ながいも"], 80, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["長芋を短冊切りにする", "たたいた梅と大葉で和える"], "シャキシャキ食感のさっぱり副菜"),
  DR("d-jaga-butter", "じゃがバター", 15, "洋風", "蒸す", "副菜", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1.5, "個"], ["バター", ["バター"], 10, "g"]], ["じゃがいもを蒸す（またはゆでる）", "十字に割ってバターをのせる"], "塩辛をのせる北海道風も定番"),
  DR("d-jaga-nikoro", "じゃがいもの煮っころがし", 25, "和風", "煮る", "副菜", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"]], ["じゃがいもをだしで煮る", "醤油・砂糖を加えて照りが出るまで煮詰める"], "煮詰めるときは焦げに注意"),
  DR("d-satoimo-miso", "里芋の味噌煮", 25, "和風", "煮る", "副菜", [["里芋", ["里芋"], 4, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["里芋の下処理をする", "だしで煮て味噌で仕上げる"], "ねっとりした里芋に味噌が合います"),
  DR("d-takenoko-tosa", "たけのこの土佐煮", 20, "和風", "煮る", "副菜", [["たけのこ", ["たけのこ"], 100, "g"], ["かつお節", ["かつお節"], 2, "g"]], ["たけのこをだしで煮る", "かつお節をまぶす"], "木の芽があれば香りがぐっと春らしく"),
  DR("d-takenoko-ten", "たけのこの天ぷら", 15, "和風", "揚げる", "副菜", [["たけのこ", ["たけのこ"], 80, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["ゆでたけのこに衣をつける", "油で揚げる"], "下味をつけてから揚げてもおいしい"),
  DR("d-fuki-ni", "ふきの煮物", 25, "和風", "煮る", "副菜", [["ふき", ["ふき"], 4, "本"], ["油揚げ", ["油揚げ"], 1, "枚"]], ["ふきを板ずりして下ゆでし、皮をむく", "油揚げとだしで煮る"], "春の香りを味わう煮物"),
  DR("d-kinoko-butter", "きのこのバター炒め", 10, "洋風", "炒める", "副菜", [["しめじ", ["しめじ"], 0.5, "パック"], ["えのき", ["えのき"], 0.5, "袋"], ["まいたけ", ["まいたけ"], 0.5, "パック"], ["バター", ["バター"], 10, "g"]], ["きのこをバターで炒める", "醤油を少し垂らして仕上げる"], "きのこは触りすぎず焼き付けるのがコツ"),
  DR("d-kinoko-marine", "きのこのマリネ", 15, "洋風", "漬ける", "副菜", [["しめじ", ["しめじ"], 0.5, "パック"], ["エリンギ", ["エリンギ"], 1, "本"], ["まいたけ", ["まいたけ"], 0.5, "パック"]], ["きのこを炒める", "酢・オリーブオイル・塩の液に漬ける"], "冷蔵庫で2〜3日持つ作り置き"),
  DR("d-shiitake-niku", "しいたけの肉詰め", 20, "和風", "焼く", "主菜", [["しいたけ", ["しいたけ"], 4, "個"], ["ひき肉", ["ひき肉"], 60, "g"]], ["しいたけの軸を取って肉だねを詰める", "両面を焼いて甘辛だれを絡める"], "傘に片栗粉を薄く振ると肉が離れません"),
  DR("d-eringi-karaage", "エリンギの唐揚げ風", 15, "和風", "揚げる", "副菜", [["エリンギ", ["エリンギ"], 2, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["エリンギを手で裂いて下味をつける", "片栗粉をまぶして揚げ焼きにする"], "貝のような食感で人気のきのこ唐揚げ"),
  DR("d-shimeji-oroshi", "しめじのおろし和え", 10, "和風", "和える", "副菜", [["しめじ", ["しめじ"], 1, "パック"], ["大根", ["大根", "だいこん"], 80, "g"]], ["しめじをゆでる（または炒める）", "大根おろしとポン酢で和える"], "さっぱりしたきのこの副菜"),
  DR("d-ninjin-kinpira", "にんじんのきんぴら", 10, "和風", "炒める", "副菜", [["にんじん", ["にんじん", "人参"], 1, "本"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["にんじんを細切りにして炒める", "醤油・砂糖で甘辛く仕上げ、ごまを振る"], "にんじんだけでも立派な一品に"),
  DR("d-tamanegi-steak", "玉ねぎステーキ", 15, "洋風", "焼く", "副菜", [["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"], ["バター", ["バター"], 5, "g"]], ["玉ねぎを厚い輪切りにする", "両面をじっくり焼いてバター醤油で仕上げる"], "焼くと甘みが増すシンプル副菜"),
  DR("d-tamanegi-amazu", "玉ねぎの甘酢漬け", 10, "和風", "漬ける", "副菜", [["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"]], ["玉ねぎを薄切りにして水にさらす", "甘酢に漬ける"], "箸休めや肉料理の付け合わせに"),
  DR("d-negi-nuta", "ねぎのぬた", 15, "和風", "和える", "副菜", [["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 1, "本"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["わかめ", ["わかめ"], 2, "g"]], ["ねぎをゆでる", "酢味噌で和える"], "ねぎの甘みと酢味噌が合います"),
  DR("d-myoga-amazu", "みょうがの甘酢漬け", 10, "和風", "漬ける", "副菜", [["みょうが", ["みょうが"], 3, "個"]], ["みょうがを縦半分に切ってさっとゆでる", "甘酢に漬ける"], "鮮やかな色に仕上がる箸休め"),
  DR("d-shiso-zuke", "大葉の醤油漬け", 10, "和風", "漬ける", "副菜", [["大葉", ["大葉", "しそ"], 10, "枚"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["大葉を洗って水気を拭く", "醤油・ごま油・ごまに漬ける"], "ごはんを巻いて食べる作り置き"),
  DR("d-piman-tsukudani", "ピーマンの佃煮風", 15, "和風", "煮る", "副菜", [["ピーマン", ["ピーマン"], 3, "個"], ["じゃこ", ["じゃこ", "ちりめんじゃこ"], 10, "g"]], ["ピーマンを細切りにして炒める", "じゃこと甘辛く煮詰める"], "ごはんのお供の作り置き"),
  DR("d-tomato-marine", "トマトのマリネ", 10, "洋風", "漬ける", "副菜", [["トマト", ["トマト"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["トマトをくし切りにする", "玉ねぎと酢・オリーブオイル・塩で漬ける"], "冷やすと味がなじむ夏の副菜"),
  DR("d-corn-karaage", "とうもろこしの唐揚げ風", 15, "和風", "揚げる", "副菜", [["とうもろこし", ["とうもろこし"], 0.5, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["とうもろこしを芯ごと輪切りにして片栗粉をまぶす", "揚げ焼きにして塩を振る"], "甘くて香ばしい、子どもに人気の一品"),
  DR("d-gobou-salad", "ごぼうサラダ", 20, "和風", "和える", "副菜", [["ごぼう", ["ごぼう"], 0.5, "本"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"]], ["ごぼうとにんじんをゆでる", "マヨネーズとすりごま・醤油で和える"], "デパ地下風の定番サラダ"),
  DR("d-renkon-mayo", "れんこんのマヨサラダ", 15, "和風", "和える", "副菜", [["れんこん", ["れんこん"], 60, "g"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"], ["枝豆", ["枝豆"], 20, "g"]], ["れんこんをゆでる", "枝豆とマヨネーズで和える"], "シャキシャキ食感のサラダ"),
  DR("d-hijiki-shiraae", "ひじきの白和え", 15, "和風", "和える", "副菜", [["ひじき", ["ひじき"], 3, "g"], ["豆腐", ["豆腐"], 0.5, "丁"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["ひじきを戻してにんじんと煮る", "水切り豆腐の和え衣で和える"], "白和えは豆腐の水切りが決め手"),
  DR("d-yude-goma", "ゆで野菜のごまだれ", 15, "和風", "和える", "副菜", [["ブロッコリー", ["ブロッコリー"], 60, "g"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["ごま", ["ごま"], 1.5, "大さじ"]], ["野菜をゆでる", "すりごま・醤油・砂糖・だしのごまだれをかける"], "季節の野菜で作れる基本の和え物"),

  // 鍋物
  DR("d-yosenabe", "寄せ鍋", 30, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["たら", ["たら", "タラ"], 1, "切れ"], ["白菜", ["白菜"], 0.12, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["しいたけ", ["しいたけ"], 1, "個"]], ["だしに鶏肉と野菜を入れて煮る", "魚と豆腐を加え、ポン酢や塩で食べる"], "具は冷蔵庫の残り野菜で自由に"),
  DR("d-mizutaki", "水炊き", 30, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["白菜", ["白菜"], 0.12, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["昆布だしで鶏肉を煮て灰汁を取る", "野菜と豆腐を加え、ポン酢で食べる"], "鶏の出汁が出たスープもごちそう"),
  DR("d-kimuchi-nabe", "キムチ鍋", 25, "中華", "煮る", "主菜", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["キムチ", ["キムチ"], 75, "g"], ["豆腐", ["豆腐"], 0.5, "丁"], ["白菜", ["白菜"], 0.1, "玉"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["豚肉とキムチを炒めて香りを出す", "だしと野菜・豆腐を加えて煮る"], "辛さはキムチの量で調整、子ども分は先に取り分けて"),
  DR("d-tonyu-nabe", "豆乳鍋", 25, "和風", "煮る", "主菜", [["豆乳", ["豆乳"], 200, "mL"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["白菜", ["白菜"], 0.1, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"]], ["だしで鶏肉と野菜を煮る", "豆乳を加えて沸騰直前で止める"], "豆乳は煮立てると分離するので最後に"),
  DR("d-butabara-nabe", "豚バラとキャベツのにんにく鍋", 25, "和風", "煮る", "主菜", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["キャベツ", ["キャベツ"], 0.2, "玉"], ["にら", ["にら", "ニラ"], 0.5, "束"], ["にんにく", ["にんにく"], 1, "かけ"], ["もやし", ["もやし"], 0.5, "袋"]], ["だしににんにくを入れて豚肉を煮る", "キャベツ・もやし・にらを山盛り加える"], "もつ鍋風の野菜たっぷり鍋"),
  DR("d-tsukune-nabe", "鶏つくね鍋", 30, "和風", "煮る", "主菜", [["ひき肉", ["ひき肉", "鶏ひき肉"], 100, "g"], ["白菜", ["白菜"], 0.12, "玉"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["しらたき", ["しらたき"], 50, "g"]], ["つくねだねをスプーンで落としながら煮る", "野菜としらたきを加える"], "つくねに軟骨の代わりにれんこんを入れると食感が楽しい"),
  DR("d-shio-nabe", "鶏と白菜の塩鍋", 25, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["白菜", ["白菜"], 0.15, "玉"], ["生姜", ["生姜", "しょうが"], 10, "g"]], ["鶏肉を塩と酒で煮る", "白菜を加え、生姜で温かく仕上げる"], "あっさり塩味で素材の味が分かる鍋"),
  DR("d-curry-nabe", "カレー鍋", 25, "洋風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["カレールー", ["カレールー"], 1, "皿分"], ["キャベツ", ["キャベツ"], 80, "g"]], ["だしで肉と野菜を煮る", "カレールーを溶かして煮込む"], "締めはうどんかチーズリゾットが定番"),
  DR("d-tomato-nabe", "トマト鍋", 25, "洋風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["トマト缶", ["トマト缶"], 200, "g"], ["キャベツ", ["キャベツ"], 80, "g"], ["チーズ", ["チーズ"], 20, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"]], ["トマト缶とコンソメで肉と野菜を煮る", "最後にチーズをのせる"], "洋風で子どもにも人気の鍋"),
  DR("d-mille-nabe", "白菜と豚肉のミルフィーユ鍋", 25, "和風", "煮る", "主菜", [["白菜", ["白菜"], 0.15, "玉"], ["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["白菜と豚肉を交互に重ねて切る", "鍋に詰めてだしで煮る"], "切り口の層がきれいな人気鍋"),
  DR("d-shabu", "しゃぶしゃぶ風鍋", 20, "和風", "煮る", "主菜", [["豚肉", ["豚肉"], 100, "g"], ["水菜", ["水菜"], 60, "g"], ["豆腐", ["豆腐"], 0.5, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["昆布だしを煮立てる", "肉をくぐらせて色が変わったら野菜と食べる"], "ごまだれとポン酢の2種があると楽しい"),
  DR("d-oden", "おでん", 60, "和風", "煮る", "主菜", [["大根", ["大根", "だいこん"], 150, "g"], ["卵", ["卵", "たまご"], 2, "個"], ["こんにゃく", ["こんにゃく"], 0.5, "枚"], ["ちくわ", ["ちくわ"], 1, "本"], ["さつま揚げ", ["さつま揚げ"], 1, "枚"], ["がんもどき", ["がんもどき"], 1, "個"]], ["大根と卵を下準備する", "練り物と一緒にだしで弱火でコトコト煮る"], "前の日に作ると味がしみてさらにおいしい"),
  DR("d-satoimo-nabe", "里芋と牛肉の鍋", 30, "和風", "煮る", "主菜", [["里芋", ["里芋"], 4, "個"], ["牛肉", ["牛肉"], 75, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["こんにゃく", ["こんにゃく"], 0.5, "枚"]], ["里芋とこんにゃくをだしで煮る", "牛肉を加えて醤油味で仕上げる"], "芋煮風のほっとする鍋"),
  DR("d-houtou-nabe", "かぼちゃのほうとう風鍋", 30, "和風", "煮る", "主菜", [["かぼちゃ", ["かぼちゃ"], 100, "g"], ["うどん", ["うどん"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["白菜", ["白菜"], 0.08, "玉"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["野菜を味噌だしで煮る", "平たいうどんを加えて煮込む"], "かぼちゃが溶けて甘くなる味噌鍋"),
  // 汁物・スープ
  DR("d-kakitama", "かきたま汁", 10, "和風", "スープ", "汁物", [["卵", ["卵", "たまご"], 1, "個"], ["豆腐", ["豆腐"], 0.25, "丁"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"], ["三つ葉", ["三つ葉"], 1, "g"]], ["だしに豆腐を入れて温める", "水溶き片栗粉でとろみをつけ、溶き卵を糸状に流す"], "卵を流したらすぐ火を止めるのがふんわりのコツ"),
  DR("d-wakame-sumashi", "わかめと豆腐のすまし汁", 10, "和風", "スープ", "汁物", [["わかめ", ["わかめ"], 2, "g"], ["豆腐", ["豆腐"], 0.25, "丁"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.1, "本"]], ["だしを温めて塩と薄口醤油で調える", "豆腐とわかめを加えて温める"], "透明な汁の上品なすまし汁"),
  DR("d-nasu-abura-miso", "なすと油揚げの味噌汁", 15, "和風", "スープ", "汁物", [["なす", ["なす", "ナス"], 1, "本"], ["油揚げ", ["油揚げ"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["なすを炒めてからだしで煮る", "油揚げを加えて味噌を溶く"], "なすは先に炒めると色がきれいに残ります"),
  DR("d-tamajaga-miso", "玉ねぎとじゃがいもの味噌汁", 15, "和風", "スープ", "汁物", [["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["じゃがいもと玉ねぎをだしで煮る", "味噌を溶く"], "玉ねぎの甘みが出る素朴な味噌汁"),
  DR("d-daikon-wakame-miso", "大根とわかめの味噌汁", 15, "和風", "スープ", "汁物", [["大根", ["大根", "だいこん"], 60, "g"], ["わかめ", ["わかめ"], 2, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["大根をだしで煮る", "わかめを加えて味噌を溶く"], "大根は薄切りにすると火通りが早い"),
  DR("d-satsumaimo-miso", "さつまいもの味噌汁", 15, "和風", "スープ", "汁物", [["さつまいも", ["さつまいも"], 0.5, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["さつまいもと玉ねぎをだしで煮る", "味噌を溶く"], "甘いさつまいもと味噌が好相性"),
  DR("d-satoimo-misoshiru", "里芋の味噌汁", 20, "和風", "スープ", "汁物", [["里芋", ["里芋"], 3, "個"], ["大根", ["大根", "だいこん"], 40, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["里芋と大根をだしで煮る", "味噌を溶く"], "里芋のとろみが自然に出る味噌汁"),
  DR("d-sanpei-fu", "三平汁風", 25, "和風", "スープ", "汁物", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["大根", ["大根", "だいこん"], 60, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["塩鮭と根菜を昆布だしで煮る", "味付けは鮭の塩気と少しの味噌で調える"], "北海道の漁師汁を家庭風に"),
  DR("d-asari-suimono", "あさりのお吸い物", 15, "和風", "スープ", "汁物", [["あさり", ["あさり", "アサリ"], 80, "g"], ["三つ葉", ["三つ葉"], 1, "g"]], ["あさりをだしで煮て口を開ける", "塩と薄口醤油で調え、三つ葉を散らす"], "貝の出汁がそのまま味になる吸い物"),
  DR("d-yasai-consomme", "野菜のコンソメスープ", 20, "洋風", "スープ", "汁物", [["キャベツ", ["キャベツ"], 60, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["コンソメ", ["コンソメ"], 1, "個"]], ["ベーコンと野菜を炒める", "水とコンソメで煮る"], "冷蔵庫の半端野菜の消費にも"),
  DR("d-potato-potage", "じゃがいものポタージュ", 25, "洋風", "スープ", "汁物", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"]], ["じゃがいもと玉ねぎを煮る", "潰して牛乳でのばす"], "冷やすとビシソワーズ風になります"),
  DR("d-onion-soup", "オニオンスープ", 30, "洋風", "スープ", "汁物", [["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1.5, "個"], ["バター", ["バター"], 5, "g"], ["コンソメ", ["コンソメ"], 1, "個"]], ["玉ねぎを飴色になるまで炒める", "水とコンソメで煮る"], "じっくり炒めるほど甘くなるスープ"),
  DR("d-tomato-soup", "トマトスープ", 20, "洋風", "スープ", "汁物", [["トマト", ["トマト"], 1.5, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["ベーコンと玉ねぎを炒める", "トマトを加えて煮崩す"], "卵を落とすと中華風にもなります"),
  DR("d-chuka-egg-soup", "中華卵スープ", 10, "中華", "スープ", "汁物", [["卵", ["卵", "たまご"], 1, "個"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["中華スープにとろみをつける", "溶き卵を流し入れる"], "コーンの甘みで子どもも飲みやすい"),
  DR("d-wakame-egg-soup", "わかめと卵のスープ", 10, "中華", "スープ", "汁物", [["わかめ", ["わかめ"], 2, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["中華スープにわかめを入れる", "溶き卵を流し、ごま油とごまを加える"], "あと一品のときにすぐできるスープ"),
  DR("d-harusame-yasai-soup", "春雨と野菜のスープ", 15, "中華", "スープ", "汁物", [["春雨", ["春雨"], 20, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["白菜", ["白菜"], 0.05, "玉"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["野菜を中華スープで煮る", "春雨と溶き卵を加える"], "春雨で満足感のあるスープ"),
  DR("d-moyashi-soup", "もやしのスープ", 10, "中華", "スープ", "汁物", [["もやし", ["もやし"], 0.5, "袋"], ["にら", ["にら", "ニラ"], 0.25, "束"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["もやしを中華スープでさっと煮る", "にらとごまを加える"], "シャキシャキ感を残すのがコツ"),
  DR("d-sanratan", "豆腐の酸辣湯風", 15, "中華", "スープ", "汁物", [["豆腐", ["豆腐"], 0.5, "丁"], ["卵", ["卵", "たまご"], 1, "個"], ["しいたけ", ["しいたけ"], 1, "個"], ["たけのこ", ["たけのこ"], 30, "g"]], ["具を中華スープで煮て酢と醤油で調える", "とろみをつけて溶き卵を流す"], "辛さは大人の分にラー油を後入れで"),
  DR("d-gyoza-soup", "餃子スープ", 15, "中華", "スープ", "汁物", [["餃子", ["餃子"], 4, "個"], ["もやし", ["もやし"], 0.5, "袋"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["中華スープに餃子を入れて煮る", "もやしとにらを加える"], "冷凍餃子で作れる即席スープ"),
  DR("d-niku-sui", "肉吸い風", 15, "和風", "スープ", "汁物", [["牛肉", ["牛肉"], 50, "g"], ["豆腐", ["豆腐"], 0.5, "丁"], ["卵", ["卵", "たまご"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["だしで牛肉と豆腐を煮る", "半熟卵を落とす"], "うどん屋さんの名物を家庭で"),
  DR("d-borsch", "ボルシチ風", 35, "洋風", "スープ", "汁物", [["牛肉", ["牛肉"], 75, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["トマト缶", ["トマト缶"], 100, "g"]], ["牛肉と野菜を炒めて煮込む", "トマト缶で赤く仕上げる"], "ビーツの代わりにトマトで家庭風に"),
  DR("d-clam-chowder", "クラムチャウダー風", 25, "洋風", "スープ", "汁物", [["あさり", ["あさり", "アサリ"], 80, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["ベーコンと野菜を炒めて煮る", "あさりと牛乳を加えて温める"], "貝の旨みのクリームスープ"),
  DR("d-satsumaimo-potage", "さつまいものポタージュ", 25, "洋風", "スープ", "汁物", [["さつまいも", ["さつまいも"], 1, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"]], ["さつまいもと玉ねぎを煮る", "潰して牛乳でのばす"], "自然な甘さのポタージュ"),
  DR("d-daikon-tori-soup", "大根と鶏のスープ", 25, "中華", "スープ", "汁物", [["大根", ["大根", "だいこん"], 100, "g"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["鶏肉と大根を生姜と煮る", "塩と醤油で調える"], "大根がとろとろになる中華スープ"),
  DR("d-hakusai-soup", "白菜のスープ", 15, "中華", "スープ", "汁物", [["白菜", ["白菜"], 0.1, "玉"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["春雨", ["春雨"], 15, "g"]], ["白菜とベーコンを煮る", "春雨を加える"], "白菜の芯の甘みが出るスープ"),
  DR("d-cabbage-soup", "キャベツのスープ", 15, "洋風", "スープ", "汁物", [["キャベツ", ["キャベツ"], 80, "g"], ["ソーセージ", ["ソーセージ"], 2, "本"], ["コンソメ", ["コンソメ"], 1, "個"]], ["キャベツとソーセージをコンソメで煮る", "塩こしょうで調える"], "くたくたに煮たキャベツが甘い"),
  DR("d-lettuce-soup", "レタスのスープ", 10, "中華", "スープ", "汁物", [["レタス", ["レタス"], 60, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["中華スープを煮立てる", "レタスを加えて溶き卵を流す"], "レタスは最後にさっと火を通すだけ"),
  DR("d-okura-soup", "オクラのスープ", 10, "洋風", "スープ", "汁物", [["オクラ", ["オクラ"], 5, "本"], ["トマト", ["トマト"], 0.5, "個"], ["コンソメ", ["コンソメ"], 1, "個"]], ["トマトをコンソメで煮る", "オクラを加える"], "オクラのとろみが自然につくスープ"),
  DR("d-tororo-jiru", "長芋のとろろ汁", 10, "和風", "スープ", "汁物", [["長芋", ["長芋", "ながいも"], 80, "g"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["長芋をすりおろしてだしでのばす", "卵を加えて温める（煮立てない）"], "ごはんにかけるととろろごはんに"),
  DR("d-miso-cream-soup", "味噌クリームスープ", 15, "洋風", "スープ", "汁物", [["牛乳", ["牛乳"], 150, "mL"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"]], ["じゃがいもを煮る", "牛乳と味噌を加えて温める"], "味噌と牛乳は意外なほど合います"),
  DR("d-ara-jiru", "魚のあら汁風", 20, "和風", "スープ", "汁物", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["大根", ["大根", "だいこん"], 60, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["鮭（あら部分）に湯をかけて下処理する", "大根と煮て味噌で仕上げる"], "下処理で臭みのない漁師汁に"),
  DR("d-tebamoto-soup", "手羽元のスープ", 40, "洋風", "スープ", "汁物", [["手羽元", ["手羽元", "鶏肉"], 3, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.5, "本"]], ["手羽元と野菜をコトコト煮る", "塩こしょうで調える"], "煮込むほどスープにコクが出ます"),
  DR("d-gobou-potage", "ごぼうのポタージュ", 30, "洋風", "スープ", "汁物", [["ごぼう", ["ごぼう"], 0.5, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"]], ["ごぼうと玉ねぎを炒めて煮る", "潰して牛乳でのばす"], "ごぼうの香りが洋風になる一品"),
  DR("d-carrot-potage", "にんじんのポタージュ", 25, "洋風", "スープ", "汁物", [["にんじん", ["にんじん", "人参"], 1.5, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"]], ["にんじんと玉ねぎを煮る", "潰して牛乳でのばす"], "鮮やかな色で食卓が明るくなります"),
  DR("d-broccoli-potage", "ブロッコリーのポタージュ", 20, "洋風", "スープ", "汁物", [["ブロッコリー", ["ブロッコリー"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["牛乳", ["牛乳"], 150, "mL"]], ["ブロッコリーと玉ねぎを煮る", "潰して牛乳でのばす"], "茎まで使うと栄養も無駄なし"),
  DR("d-kinoko-soup", "きのこのスープ", 15, "洋風", "スープ", "汁物", [["しめじ", ["しめじ"], 0.5, "パック"], ["エリンギ", ["エリンギ"], 1, "本"], ["まいたけ", ["まいたけ"], 0.5, "パック"], ["コンソメ", ["コンソメ"], 1, "個"]], ["きのこを炒めて香りを出す", "コンソメで煮る"], "きのこ3種の旨みスープ"),

  // 丼もの
  DR("d-tendon", "天丼", 30, "和風", "揚げる", "主食", [["えび", ["えび", "エビ"], 2, "尾"], ["かぼちゃ", ["かぼちゃ"], 30, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"], ["米", ["米", "ごはん"], 100, "g"]], ["えびと野菜の天ぷらを揚げる", "甘い丼つゆをかけてごはんにのせる"], "つゆは煮詰めすぎないのがコツ"),
  DR("d-tekka-don", "鉄火丼", 15, "和風", "和える", "主食", [["まぐろ", ["まぐろ", "マグロ"], 80, "g"], ["米", ["米", "ごはん"], 100, "g"], ["海苔", ["海苔"], 0.5, "枚"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["酢飯を作る", "まぐろをのせ、わさび醤油で食べる"], "まぐろは漬けにしてもおいしい"),
  DR("d-salmon-ikura-don", "サーモンいくら丼風", 15, "和風", "和える", "主食", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["いくら", ["いくら"], 15, "g"], ["米", ["米", "ごはん"], 100, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["酢飯を作る", "鮭の刺身といくらをのせる"], "親子丼ならぬ海の親子丼です"),
  DR("d-unadon", "うな丼", 15, "和風", "焼く", "主食", [["うなぎ", ["うなぎ"], 0.5, "尾"], ["米", ["米", "ごはん"], 100, "g"]], ["うなぎを温め直す（酒をふって蒸し焼き）", "タレをかけたごはんにのせる"], "山椒を振ると香りが立ちます"),
  DR("d-mabo-don", "麻婆丼", 20, "中華", "煮る", "主食", [["豆腐", ["豆腐"], 0.75, "丁"], ["ひき肉", ["ひき肉"], 60, "g"], ["米", ["米", "ごはん"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["麻婆豆腐を作る", "ごはんにかける"], "とろみはごはん用に少し固めに"),
  DR("d-yakiniku-don", "焼肉丼", 15, "和風", "炒める", "主食", [["牛肉", ["牛肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["牛肉と玉ねぎを焼肉のたれで炒める", "ごはんにのせ、ごまを振る"], "野菜をたっぷり添えるとバランスよく"),
  DR("d-stamina-don", "スタミナ丼", 15, "和風", "炒める", "主食", [["豚肉", ["豚肉"], 100, "g"], ["にら", ["にら", "ニラ"], 0.5, "束"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["豚肉とにらをにんにく醤油で炒める", "ごはんにのせ、卵黄をのせる"], "疲れた日に食べたい力の出る丼"),
  DR("d-teriyaki-don", "照り焼きチキン丼", 20, "和風", "焼く", "主食", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["米", ["米", "ごはん"], 100, "g"], ["海苔", ["海苔"], 0.5, "枚"]], ["鶏の照り焼きを作る", "刻み海苔を敷いたごはんにのせる"], "マヨネーズを少し垂らすと子どもに人気"),
  DR("d-karaage-don", "唐揚げ丼", 20, "和風", "揚げる", "主食", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["米", ["米", "ごはん"], 100, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["鶏の唐揚げを揚げる", "キャベツを敷いたごはんにのせ、甘辛だれをかける"], "残った唐揚げのリメイクにも"),
  DR("d-ebi-toji-don", "えびとじ丼", 20, "和風", "煮る", "主食", [["えび", ["えび", "エビ"], 3, "尾"], ["卵", ["卵", "たまご"], 2, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["えびと玉ねぎをだしで煮る", "卵でとじてごはんにのせる"], "カツ丼のえび版、上品な味"),
  DR("d-buta-don", "豚丼", 20, "和風", "焼く", "主食", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["米", ["米", "ごはん"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["豚肉を甘辛いタレで焼く", "ごはんにのせる"], "十勝風はタレを煮詰めて香ばしく"),
  DR("d-kinoko-tamago-don", "きのこの卵とじ丼", 15, "和風", "煮る", "主食", [["しめじ", ["しめじ"], 0.5, "パック"], ["えのき", ["えのき"], 0.5, "袋"], ["卵", ["卵", "たまご"], 2, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["きのこをだしで煮る", "卵でとじてごはんにのせる"], "肉なしでも旨みたっぷりの丼"),
  DR("d-nasu-don", "なすの蒲焼き丼", 15, "和風", "焼く", "主食", [["なす", ["なす", "ナス"], 2, "本"], ["米", ["米", "ごはん"], 100, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["なすを開いて蒸し焼きにし、片栗粉をまぶして焼く", "蒲焼きのタレを絡めてごはんにのせる"], "うなぎ風の見た目で楽しい丼"),
  DR("d-avocado-don", "アボカド丼", 10, "洋風", "和える", "主食", [["アボカド", ["アボカド"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["海苔", ["海苔"], 0.5, "枚"]], ["アボカドを切ってわさび醤油で和える", "ごはんにのせ、温泉卵と海苔を添える"], "まぐろを加えるとポキ丼風に"),
  // 麺
  DR("d-tanuki-udon", "たぬきうどん", 10, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["天かす", ["天かす"], 1, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"], ["わかめ", ["わかめ"], 2, "g"]], ["うどんをだしで温める", "天かすとねぎ、わかめをのせる"], "天かすは食べる直前にのせて食感を残して"),
  DR("d-niku-udon", "肉うどん", 20, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["牛肉", ["牛肉"], 60, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["牛肉を甘辛く煮る", "うどんとだしにのせる"], "肉の旨みでだしがごちそうに"),
  DR("d-ontama-udon", "温玉うどん", 15, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["卵", ["卵", "たまご"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["うどんをゆでて冷水でしめる（または温かいまま）", "温泉卵をのせ、つゆをかける"], "とろろを加えてもおいしい"),
  DR("d-curry-nanban-udon", "カレー南蛮うどん", 20, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["カレールー", ["カレールー"], 0.5, "皿分"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["豚肉とねぎをだしで煮てカレールーを溶かす", "とろみをつけてうどんにかける"], "ねぎたっぷりが南蛮の名前の由来"),
  DR("d-nabeyaki-udon", "鍋焼きうどん", 25, "和風", "煮る", "主食", [["うどん", ["うどん"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["かまぼこ", ["かまぼこ"], 10, "g"], ["しいたけ", ["しいたけ"], 1, "個"]], ["一人鍋にだしと具を入れて煮る", "卵を落として蓋をする"], "土鍋でそのまま食卓へ、冬のごちそう"),
  DR("d-tsukimi-soba", "月見そば", 15, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["卵", ["卵", "たまご"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["そばをゆでて温かいだしに入れる", "生卵を落として蓋をして少し置く"], "卵が半熟になったら食べ頃"),
  DR("d-tempura-soba", "天ぷらそば", 20, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["えび", ["えび", "エビ"], 2, "尾"], ["小麦粉", ["天ぷら粉", "小麦粉"], 1.5, "大さじ"]], ["えびの天ぷらを揚げる", "そばとだしにのせる"], "かき揚げをのせてもおいしい"),
  DR("d-tororo-soba", "とろろそば", 15, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["長芋", ["長芋", "ながいも"], 60, "g"], ["海苔", ["海苔"], 0.5, "枚"]], ["そばをゆでて冷水でしめる", "すりおろした長芋とつゆをかける"], "長芋は変色するので食べる直前に"),
  DR("d-kinoko-soba", "きのこそば", 20, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["しめじ", ["しめじ"], 0.5, "パック"], ["なめこ", ["なめこ"], 0.5, "袋"], ["まいたけ", ["まいたけ"], 0.5, "パック"]], ["きのこをだしで煮る", "そばにかける"], "きのこの旨みたっぷりの温かいそば"),
  DR("d-nyumen", "にゅうめん", 15, "和風", "ゆでる", "主食", [["そうめん", ["そうめん"], 1, "束"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 30, "g"], ["卵", ["卵", "たまご"], 0.5, "個"], ["しいたけ", ["しいたけ"], 0.5, "個"]], ["そうめんを別ゆでする", "鶏としいたけのだしに入れ、溶き卵を流す"], "温かいそうめんは冬の楽しみ"),
  DR("d-miso-ramen", "味噌ラーメン風", 20, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"], ["バター", ["バター"], 5, "g"]], ["スープに味噌を溶かして野菜と肉を煮る", "麺を入れてコーンとバターをのせる"], "バターとコーンが味噌ラーメンの定番"),
  DR("d-shio-ramen", "塩ラーメン風", 20, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["キャベツ", ["キャベツ"], 40, "g"], ["わかめ", ["わかめ"], 2, "g"]], ["鶏ガラスープを塩で調える", "麺と具を入れる"], "あっさり塩味にごま油を少し"),
  DR("d-tonkotsu-fu", "とんこつ風ラーメン", 20, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["牛乳", ["牛乳"], 100, "mL"], ["豚肉", ["豚肉"], 40, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["鶏ガラスープに牛乳を加えて白濁させる", "麺と具を入れる"], "牛乳で作るなんちゃってとんこつ"),
  DR("d-sara-udon-fu", "皿うどん風", 25, "中華", "炒める", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["麺を揚げ焼きにしてパリッとさせる", "野菜あんをかける"], "揚げ麺の代わりに焼きそば麺でも"),
  DR("d-shoyu-yaki-udon", "醤油焼きうどん", 15, "和風", "炒める", "主食", [["うどん", ["うどん"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["かつお節", ["かつお節"], 1, "g"]], ["うどんと具を炒める", "醤油とみりんで香ばしく仕上げ、かつお節をかける"], "和風の焼きうどんは醤油が決め手"),
  DR("d-shio-yakisoba", "塩焼きそば", 15, "中華", "炒める", "主食", [["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["レモン", ["レモン"], 0.25, "個"]], ["麺と具を炒めて塩と鶏ガラスープの素で味付ける", "レモンを搾る"], "あっさり塩味で野菜の甘みが分かる"),
  DR("d-gomoku-ankake", "五目あんかけ焼きそば", 25, "中華", "炒める", "主食", [["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["白菜", ["白菜"], 0.05, "玉"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["麺を両面焼き付ける", "五目あんをかける"], "麺のパリッと感が楽しい一品"),
  // パスタ
  DR("d-bolognese", "ボロネーゼ風パスタ", 25, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["ひき肉", ["ひき肉"], 80, "g"], ["トマト缶", ["トマト缶"], 150, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["チーズ", ["チーズ"], 10, "g"]], ["ひき肉と玉ねぎを炒めてトマト缶で煮込む", "ゆでたパスタと和え、チーズを振る"], "煮込むほど肉の旨みが出ます"),
  DR("d-shiso-genovese", "大葉のジェノベーゼ風パスタ", 15, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["大葉", ["大葉", "しそ"], 10, "枚"], ["にんにく", ["にんにく"], 0.5, "かけ"], ["チーズ", ["チーズ"], 10, "g"]], ["大葉・にんにく・オリーブオイル・チーズを潰してソースにする", "ゆでたパスタと和える"], "バジルの代わりに大葉で和風ジェノベーゼ"),
  DR("d-tomato-tsuna-pasta", "トマトとツナのパスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["トマト缶", ["トマト缶"], 150, "g"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["トマト缶とツナを煮てソースにする", "パスタと和える"], "缶同士で作れる常備菜パスタ"),
  DR("d-kinoko-cream-pasta", "きのこのクリームパスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["しめじ", ["しめじ"], 0.5, "パック"], ["まいたけ", ["まいたけ"], 0.5, "パック"], ["牛乳", ["牛乳"], 100, "mL"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["きのことベーコンを炒めて牛乳で煮る", "パスタと和える"], "生クリームなしでも牛乳とチーズで濃厚に"),
  DR("d-salmon-cream-pasta", "鮭のクリームパスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["鮭", ["鮭", "さけ"], 1, "切れ"], ["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.3, "束"], ["牛乳", ["牛乳"], 100, "mL"]], ["鮭を焼いてほぐす", "牛乳ソースでパスタとほうれん草を和える"], "鮭の塩気で味が決まります"),
  DR("d-mentai-cream-pasta", "明太子クリームパスタ", 15, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["明太子", ["明太子"], 1, "腹"], ["牛乳", ["牛乳"], 60, "mL"], ["海苔", ["海苔"], 0.5, "枚"]], ["明太子と牛乳・バターを混ぜる", "ゆでたてパスタと和え、海苔をのせる"], "火にかけすぎると明太子が固くなるので和えるだけ"),
  DR("d-nasu-bacon-pasta", "なすとベーコンの和風パスタ", 20, "和風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["なす", ["なす", "ナス"], 1, "本"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["なすとベーコンを炒める", "パスタと醤油バターで和え、大葉をのせる"], "和風パスタの定番の組み合わせ"),
  DR("d-natto-pasta", "納豆パスタ", 15, "和風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["納豆", ["納豆"], 1, "パック"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["海苔", ["海苔"], 0.5, "枚"]], ["パスタをゆでる", "納豆とバター醤油で和える"], "卵黄をのせるとまろやかに"),
  DR("d-ume-shiso-pasta", "梅しそパスタ", 15, "和風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["梅干し", ["梅干し", "梅"], 2, "個"], ["大葉", ["大葉", "しそ"], 3, "枚"], ["じゃこ", ["じゃこ", "ちりめんじゃこ"], 10, "g"]], ["パスタをゆでる", "たたいた梅とじゃこで和え、大葉をのせる"], "さっぱりして食欲のない日にも"),
  DR("d-vongole", "ボンゴレ風パスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["あさり", ["あさり", "アサリ"], 80, "g"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["あさりをワイン（または酒）蒸しにする", "パスタを加えて汁を吸わせる"], "貝の汁がソースになるパスタ"),
  DR("d-puttanesca", "プッタネスカ風パスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["トマト缶", ["トマト缶"], 150, "g"], ["オリーブ", ["オリーブ"], 5, "個"], ["アンチョビ缶", ["アンチョビ缶"], 0.25, "缶"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["トマトソースにオリーブとアンチョビを加える", "パスタと和える"], "塩気のある大人のトマトパスタ"),
  DR("d-arrabbiata", "アラビアータ風パスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["トマト缶", ["トマト缶"], 150, "g"], ["にんにく", ["にんにく"], 1, "かけ"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["にんにくとトマト缶でソースを作る（辛みは大人の分だけ唐辛子を）", "パスタと和える"], "シンプルなトマトパスタの代表"),
  DR("d-cabbage-pepe", "キャベツのペペロンチーノ風", 15, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["にんにく", ["にんにく"], 1, "かけ"], ["アンチョビ缶", ["アンチョビ缶"], 0.25, "缶"]], ["キャベツをパスタと一緒にゆでる", "にんにくオイルと和える"], "キャベツの甘みが出る春パスタ"),
  DR("d-tonyu-pasta", "豆乳クリームパスタ", 20, "洋風", "ゆでる", "主食", [["パスタ", ["パスタ", "スパゲッティ"], 80, "g"], ["豆乳", ["豆乳"], 120, "mL"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["しめじ", ["しめじ"], 0.5, "パック"]], ["ベーコンとしめじを炒めて豆乳で煮る", "パスタと和える"], "豆乳は沸騰させないのがなめらかのコツ"),
  // ごはんもの
  DR("d-tori-gobou-takikomi", "鶏とごぼうの炊き込みごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 60, "g"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["米と調味料・具を炊飯器に入れる", "炊き上げて蒸らす"], "ごぼうはささがきにして水にさらして"),
  DR("d-sake-takikomi", "鮭の炊き込みごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["鮭", ["鮭", "さけ"], 1, "切れ"], ["しめじ", ["しめじ"], 0.5, "パック"]], ["鮭をのせて一緒に炊く", "炊き上がったら鮭をほぐして混ぜる"], "骨を取るのは大人の仕事にして"),
  DR("d-kuri-takikomi", "栗の炊き込みごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["栗", ["栗"], 5, "個"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"]], ["栗の皮をむく", "米と一緒に炊く"], "ほくほくの栗が主役の秋ごはん"),
  DR("d-edamame-gohan", "枝豆ごはん", 15, "和風", "和える", "主食", [["米", ["米", "ごはん"], 150, "g"], ["枝豆", ["枝豆"], 40, "g"]], ["炊きたてごはんを用意する", "塩ゆでした枝豆を混ぜる"], "塩を少し振ると枝豆の甘みが立ちます"),
  DR("d-corn-gohan", "とうもろこしごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["とうもろこし", ["とうもろこし"], 0.5, "本"], ["バター", ["バター"], 5, "g"]], ["実を外したとうもろこしと芯を入れて炊く", "バターを混ぜる"], "芯からも出汁が出ます"),
  DR("d-shirasu-gohan", "しらすごはん", 10, "和風", "和える", "主食", [["米", ["米", "ごはん"], 150, "g"], ["しらす", ["しらす"], 25, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["炊きたてごはんにしらすを混ぜる", "大葉を散らす"], "釜揚げしらすならふんわり"),
  DR("d-hijiki-gohan", "ひじきごはん", 15, "和風", "和える", "主食", [["米", ["米", "ごはん"], 150, "g"], ["ひじき", ["ひじき"], 3, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["油揚げ", ["油揚げ"], 0.5, "枚"]], ["ひじきの煮物を作る", "炊きたてごはんに混ぜる"], "ひじき煮の残りでも作れます"),
  DR("d-tenmusu", "天むす風おにぎり", 20, "和風", "揚げる", "主食", [["米", ["米", "ごはん"], 150, "g"], ["えび", ["えび", "エビ"], 2, "尾"], ["小麦粉", ["天ぷら粉", "小麦粉"], 1, "大さじ"], ["海苔", ["海苔"], 1, "枚"]], ["小えびの天ぷらを作る", "おにぎりに天ぷらをのせて海苔で巻く"], "一口サイズで見た目も楽しい"),
  DR("d-tamago-zousui", "卵雑炊", 15, "和風", "煮る", "主食", [["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["ごはんをだしで煮る", "溶き卵を流して蓋をする"], "鍋の締めや体調の優れない日に"),
  DR("d-kani-zousui", "かに雑炊風", 15, "和風", "煮る", "主食", [["米", ["米", "ごはん"], 100, "g"], ["かに", ["かに", "カニ"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["ごはんをだしで煮る", "かにを加えて卵でとじる"], "かに鍋の締めの贅沢版"),
  DR("d-doria", "ドリア", 30, "洋風", "焼く", "主食", [["米", ["米", "ごはん"], 100, "g"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["牛乳", ["牛乳"], 100, "mL"], ["チーズ", ["チーズ"], 20, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["ホワイトソースを作る", "ごはんにソースとチーズをのせて焼く"], "焼き色がつくまでしっかり焼くのがおいしい"),
  DR("d-kinoko-risotto", "きのこのリゾット", 25, "洋風", "煮る", "主食", [["米", ["米", "ごはん"], 100, "g"], ["しめじ", ["しめじ"], 0.5, "パック"], ["まいたけ", ["まいたけ"], 0.5, "パック"], ["チーズ", ["チーズ"], 15, "g"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["ベーコンときのこを炒める", "ごはんとスープを加えて煮て、チーズを混ぜる"], "冷やごはんで作る簡単リゾット"),
  DR("d-paella", "パエリア風", 35, "洋風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["えび", ["えび", "エビ"], 3, "尾"], ["あさり", ["あさり", "アサリ"], 60, "g"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["パプリカ", ["パプリカ"], 0.5, "個"], ["ターメリック", ["ターメリック"], 0.5, "小さじ"]], ["フライパンで具を炒めて米とスープを入れる", "蓋をして炊き上げ、おこげを作る"], "サフランの代わりにターメリックで色付け"),
  DR("d-gapao", "ガパオライス風", 20, "洋風", "炒める", "主食", [["ひき肉", ["ひき肉"], 100, "g"], ["パプリカ", ["パプリカ"], 0.5, "個"], ["大葉", ["大葉", "しそ"], 3, "枚"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["ひき肉とパプリカを炒めてナンプラーと醤油で味付ける", "ごはんにのせ、目玉焼きと大葉を添える"], "バジルの代わりに大葉で和風ガパオ"),
  DR("d-loco-moco", "ロコモコ風", 25, "洋風", "焼く", "主食", [["ひき肉", ["ひき肉"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"]], ["ハンバーグを焼いてグレービー風ソースをかける", "ごはんにハンバーグと目玉焼きをのせる"], "ハワイの定番を家庭で"),
  DR("d-ouchi-taco", "おうちタコライス", 20, "洋風", "炒める", "主食", [["ひき肉", ["ひき肉"], 100, "g"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 40, "g"], ["トマト", ["トマト"], 0.5, "個"], ["チーズ", ["チーズ"], 15, "g"]], ["タコミートを作る", "ごはんにレタス・トマト・チーズと盛る"], "サルサの代わりにケチャップとチリで調整"),
  DR("d-hayashi", "ハヤシライス", 30, "洋風", "煮る", "主食", [["牛肉", ["牛肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"], ["トマト缶", ["トマト缶"], 150, "g"], ["米", ["米", "ごはん"], 100, "g"], ["バター", ["バター"], 5, "g"]], ["牛肉と玉ねぎを炒める", "トマト缶とデミ風の調味料で煮込む"], "市販ルーなしでもトマトとソースで作れます"),

  // サラダ
  DR("d-caesar", "シーザーサラダ風", 15, "洋風", "和える", "副菜", [["レタス", ["レタス"], 80, "g"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["チーズ", ["チーズ"], 15, "g"], ["食パン", ["食パン", "パン"], 0.5, "枚"]], ["ベーコンとパンの角切りをカリカリに焼く", "レタスにマヨネーズ・チーズ・レモンのドレッシングをかける"], "クルトン風のパンは最後にのせて食感を残して"),
  DR("d-greek-salad", "ギリシャ風サラダ", 10, "洋風", "和える", "副菜", [["トマト", ["トマト"], 1, "個"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["オリーブ", ["オリーブ"], 5, "個"], ["チーズ", ["チーズ"], 20, "g"]], ["材料を大きめに切る", "オリーブオイルとレモン・塩で和える"], "チーズの塩気で味が決まるサラダ"),
  DR("d-cobb-salad", "コブサラダ風", 20, "洋風", "和える", "副菜", [["レタス", ["レタス"], 60, "g"], ["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["トマト", ["トマト"], 0.5, "個"], ["アボカド", ["アボカド"], 0.5, "個"]], ["鶏肉と卵をゆでる", "材料を列に並べて盛り、ドレッシングをかける"], "並べ方がきれいだと食卓が華やかに"),
  DR("d-coleslaw", "コールスロー", 15, "洋風", "和える", "副菜", [["キャベツ", ["キャベツ"], 100, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"]], ["キャベツとにんじんを塩もみする", "マヨネーズと酢で和える"], "少し置くと味がなじんでおいしく"),
  DR("d-carrot-rape", "キャロットラペ", 15, "洋風", "和える", "副菜", [["にんじん", ["にんじん", "人参"], 1, "本"], ["レーズン", ["レーズン"], 10, "g"]], ["にんじんを細切りにして塩もみする", "酢・オリーブオイル・はちみつで和え、レーズンを加える"], "作り置きできる洋風常備菜"),
  DR("d-hakusai-salad", "白菜サラダ", 15, "和風", "和える", "副菜", [["白菜", ["白菜"], 0.08, "玉"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["かつお節", ["かつお節"], 1, "g"]], ["白菜を細切りにして塩もみする", "ツナとかつお節・醤油で和える"], "白菜の芯の甘みが分かるサラダ"),
  DR("d-cabbage-tsuna-salad", "キャベツとツナのサラダ", 10, "洋風", "和える", "副菜", [["キャベツ", ["キャベツ"], 80, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["キャベツを塩もみする", "ツナとマヨネーズで和える"], "こしょうを効かせると大人の味"),
  DR("d-mizuna-jako", "水菜とじゃこのサラダ", 10, "和風", "和える", "副菜", [["水菜", ["水菜"], 60, "g"], ["じゃこ", ["じゃこ", "ちりめんじゃこ"], 15, "g"], ["豆腐", ["豆腐"], 0.5, "丁"]], ["じゃこをごま油でカリカリに炒める", "水菜と豆腐に熱いままかける"], "じゃこの塩気だけで味が決まります"),
  DR("d-lettuce-ham", "レタスとハムのサラダ", 10, "洋風", "和える", "副菜", [["レタス", ["レタス"], 80, "g"], ["ハム", ["ハム"], 30, "g"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"]], ["レタスを手でちぎる", "ハムとコーンを散らし、好みのドレッシングをかける"], "レタスは水気をよく切るのがコツ"),
  DR("d-spinach-bacon-salad", "ほうれん草とベーコンのサラダ", 15, "洋風", "和える", "副菜", [["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.5, "束"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["ほうれん草をゆでる", "カリカリベーコンとゆで卵をのせる"], "ベーコンの脂がドレッシング代わりに"),
  DR("d-tomato-wafu-salad", "トマトの和風サラダ", 10, "和風", "和える", "副菜", [["トマト", ["トマト"], 1, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["かつお節", ["かつお節"], 1, "g"]], ["トマトを切る", "ポン酢と大葉・かつお節をかける"], "よく冷やすとおいしい"),
  DR("d-mozuku-su", "もずくの酢の物", 10, "和風", "和える", "副菜", [["もずく", ["もずく"], 50, "g"], ["きゅうり", ["きゅうり"], 0.3, "本"], ["生姜", ["生姜", "しょうが"], 2, "g"]], ["もずくを洗って水気を切る", "きゅうりと甘酢で和え、生姜を添える"], "三杯酢は醤油・酢・砂糖同量が基本"),
  DR("d-daikon-amazu", "大根の甘酢漬け", 15, "和風", "漬ける", "副菜", [["大根", ["大根", "だいこん"], 100, "g"], ["ゆず", ["ゆず"], 0.25, "個"]], ["大根を薄切りにして塩もみする", "甘酢とゆずの皮で漬ける"], "ゆずの香りの箸休め"),
  DR("d-pickles", "ピクルス", 15, "洋風", "漬ける", "副菜", [["きゅうり", ["きゅうり"], 1, "本"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["パプリカ", ["パプリカ"], 0.5, "個"], ["大根", ["大根", "だいこん"], 60, "g"]], ["野菜をスティック状に切る", "酢・砂糖・塩のピクルス液に漬ける"], "1日置くと味がしみます"),
  DR("d-hakusai-asazuke", "白菜の浅漬け", 15, "和風", "漬ける", "副菜", [["白菜", ["白菜"], 0.08, "玉"], ["昆布", ["昆布"], 2, "g"], ["ゆず", ["ゆず"], 0.25, "個"]], ["白菜をざく切りにする", "塩と昆布・ゆずで揉んで置く"], "重しをすると早く漬かります"),
  DR("d-celery-asazuke", "セロリの浅漬け", 15, "和風", "漬ける", "副菜", [["セロリ", ["セロリ"], 1, "本"]], ["セロリの筋を取って斜め切りにする", "塩と昆布で揉んで置く"], "セロリの香りが爽やかな漬物"),
  DR("d-nasu-asazuke", "なすの浅漬け", 15, "和風", "漬ける", "副菜", [["なす", ["なす", "ナス"], 2, "本"], ["みょうが", ["みょうが"], 1, "個"]], ["なすを切って塩もみする", "みょうがと一緒に少し置く"], "水気は食べる直前に絞ると色がきれい"),
  DR("d-kabu-salad", "かぶのサラダ", 10, "和風", "和える", "副菜", [["かぶ", ["かぶ"], 1.5, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]], ["かぶを薄切りにして塩もみする", "葉も刻んでツナマヨで和える"], "かぶは葉まで丸ごと使えます"),
  DR("d-kabu-amazu", "かぶの甘酢漬け", 15, "和風", "漬ける", "副菜", [["かぶ", ["かぶ"], 2, "個"], ["ゆず", ["ゆず"], 0.25, "個"]], ["かぶを薄切りにして塩もみする", "甘酢とゆずで漬ける"], "千枚漬け風の上品な漬物"),
  DR("d-kabocha-salad", "かぼちゃサラダ", 20, "洋風", "和える", "副菜", [["かぼちゃ", ["かぼちゃ"], 150, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"], ["レーズン", ["レーズン"], 10, "g"]], ["かぼちゃを蒸して潰す", "玉ねぎとマヨネーズで和え、レーズンを加える"], "デリ風の甘いサラダ"),
  DR("d-broccoli-tamago", "ブロッコリーと卵のサラダ", 15, "洋風", "和える", "副菜", [["ブロッコリー", ["ブロッコリー"], 80, "g"], ["卵", ["卵", "たまご"], 1.5, "個"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"]], ["ブロッコリーと卵をゆでる", "粗く潰した卵とマヨネーズで和える"], "彩りのよいデリ風サラダ"),
  DR("d-aspara-ham-salad", "アスパラとハムのサラダ", 10, "洋風", "和える", "副菜", [["アスパラ", ["アスパラ"], 3, "本"], ["ハム", ["ハム"], 20, "g"]], ["アスパラをゆでる", "ハムとマヨネーズ・レモンで和える"], "アスパラはゆで過ぎないのがコツ"),
  DR("d-yam-unsen", "ヤムウンセン風サラダ", 15, "洋風", "和える", "副菜", [["春雨", ["春雨"], 25, "g"], ["えび", ["えび", "エビ"], 3, "尾"], ["豚肉", ["豚肉"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"], ["レモン", ["レモン"], 0.25, "個"]], ["春雨と具をゆでる", "レモン汁・ナンプラー・砂糖で和える"], "タイの春雨サラダを家庭風に"),
  DR("d-wakame-tsuna", "わかめとツナのサラダ", 10, "和風", "和える", "副菜", [["わかめ", ["わかめ"], 3, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["きゅうり", ["きゅうり"], 0.5, "本"]], ["わかめを戻す", "ツナときゅうりをポン酢で和える"], "海藻が手軽に取れるサラダ"),
  DR("d-hijiki-mame-salad", "ひじきと豆のサラダ", 15, "和風", "和える", "副菜", [["ひじき", ["ひじき"], 3, "g"], ["大豆", ["大豆"], 30, "g"], ["枝豆", ["枝豆"], 20, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["ひじきを戻してさっと煮る", "豆と一緒に醤油ドレッシングで和える"], "鉄分とたんぱく質のサラダ"),
  DR("d-mame-salad", "豆のサラダ", 15, "洋風", "和える", "副菜", [["大豆", ["大豆"], 40, "g"], ["枝豆", ["枝豆"], 30, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]], ["豆をゆでる（水煮でも可）", "ツナと玉ねぎをマヨネーズで和える"], "豆同士の食感比べが楽しい"),
  // 作り置き・弁当
  DR("d-mini-hamburg", "ミニハンバーグ", 20, "洋風", "焼く", "主菜", [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["小さめのハンバーグを成形する", "両面焼いてケチャップソースを絡める"], "お弁当サイズで冷凍保存もできます"),
  DR("d-winner-ketchup", "ウインナーのケチャップ炒め", 10, "洋風", "炒める", "副菜", [["ソーセージ", ["ソーセージ"], 3, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["ケチャップ", ["ケチャップ"], 1, "大さじ"]], ["ソーセージと玉ねぎを炒める", "ケチャップを絡める"], "お弁当の定番おかず"),
  DR("d-chikuwa-isobe", "ちくわの磯辺揚げ", 15, "和風", "揚げる", "副菜", [["ちくわ", ["ちくわ"], 2, "本"], ["小麦粉", ["天ぷら粉", "小麦粉"], 1.5, "大さじ"], ["青のり", ["青のり", "あおさ"], 0.5, "大さじ"]], ["ちくわに青のり入りの衣をつける", "油で揚げる"], "お弁当とおやつに人気の一品"),
  DR("d-satsumaage-ni", "さつま揚げの煮物", 15, "和風", "煮る", "副菜", [["さつま揚げ", ["さつま揚げ"], 2, "枚"], ["大根", ["大根", "だいこん"], 80, "g"]], ["大根をだしで煮る", "さつま揚げを加えて煮含める"], "練り物の旨みが出る煮物"),
  DR("d-konnyaku-piri", "こんにゃくのピリ辛煮", 20, "和風", "煮る", "副菜", [["こんにゃく", ["こんにゃく"], 1, "枚"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["こんにゃくを下ゆでしてちぎる", "甘辛く煮詰め、辛みは大人の分だけ唐辛子を加える"], "炒り煮にすると味がよく入ります"),
  DR("d-ninjin-tarako", "にんじんのたらこ炒め", 10, "和風", "炒める", "副菜", [["にんじん", ["にんじん", "人参"], 1, "本"], ["たらこ", ["たらこ"], 0.5, "腹"]], ["にんじんを細切りにして炒める", "たらこを加えて炒め合わせる"], "たらこの塩気だけで味が決まります"),
  DR("d-piman-okaka", "ピーマンのおかか炒め", 10, "和風", "炒める", "副菜", [["ピーマン", ["ピーマン"], 3, "個"], ["かつお節", ["かつお節"], 1.5, "g"]], ["ピーマンを炒める", "醤油とかつお節で仕上げる"], "あと一品のときに便利な副菜"),
  DR("d-kyuri-tsukudani", "きゅうりの佃煮風", 20, "和風", "煮る", "副菜", [["きゅうり", ["きゅうり"], 2, "本"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["きゅうりを塩もみして絞る", "醤油・酢・砂糖で煮詰める"], "きゅうりの大量消費にもなる作り置き"),
  DR("d-fukujin-fu", "福神漬け風", 20, "和風", "漬ける", "副菜", [["大根", ["大根", "だいこん"], 80, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["なす", ["なす", "ナス"], 0.5, "本"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["野菜を小さく切って塩もみする", "醤油・酢・砂糖の液で煮て冷ます"], "カレーのお供を手作りで"),
  DR("d-harihari", "大根のはりはり漬け風", 15, "和風", "漬ける", "副菜", [["大根", ["大根", "だいこん"], 100, "g"], ["昆布", ["昆布"], 2, "g"]], ["大根を細切りにして塩もみする", "甘酢と昆布で漬ける"], "ポリポリ食感の漬物"),
  DR("d-takana-fu", "小松菜の高菜風", 15, "和風", "炒める", "副菜", [["小松菜", ["小松菜"], 1, "束"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["小松菜を塩漬けして絞る", "ごま油で炒めて醤油で調える"], "高菜漬けの代わりに小松菜で"),
  DR("d-tori-soboro-tsukuri", "鶏そぼろ", 15, "和風", "炒める", "副菜", [["ひき肉", ["ひき肉", "鶏ひき肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["ひき肉を生姜と甘辛く炒める", "汁気を飛ばしてそぼろ状にする"], "ごはん・おにぎり・麺に使える作り置き"),
  DR("d-broccoli-namul", "ブロッコリーのナムル", 10, "中華", "和える", "副菜", [["ブロッコリー", ["ブロッコリー"], 80, "g"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["ブロッコリーをゆでる", "ごま油・塩・すりごまで和える"], "茎まで使うと食感が楽しい"),
  DR("d-moyashi-zuke", "もやしの中華漬け", 10, "中華", "漬ける", "副菜", [["もやし", ["もやし"], 1, "袋"], ["きゅうり", ["きゅうり"], 0.3, "本"]], ["もやしをゆでて水気を切る", "酢・醤油・ごま油で漬ける"], "冷やすと味がしみる作り置き"),
  DR("d-egg-curry-zuke", "ゆで卵のカレー漬け", 15, "洋風", "漬ける", "副菜", [["卵", ["卵", "たまご"], 2, "個"], ["カレー粉", ["カレー粉"], 0.5, "小さじ"]], ["卵をゆでて殻をむく", "カレー粉・醤油・みりんに漬ける"], "色もきれいな変わり味玉"),
  // 朝ごはん
  DR("d-pizza-toast", "ピザトースト", 10, "洋風", "焼く", "主食", [["食パン", ["食パン", "パン"], 1, "枚"], ["ケチャップ", ["ケチャップ"], 1, "大さじ"], ["チーズ", ["チーズ"], 15, "g"], ["ピーマン", ["ピーマン"], 0.5, "個"], ["ソーセージ", ["ソーセージ"], 1, "本"]], ["パンにケチャップを塗って具をのせる", "トースターで焼く"], "朝の定番トースト"),
  DR("d-tamago-toast", "たまごトースト", 10, "洋風", "焼く", "主食", [["食パン", ["食パン", "パン"], 1, "枚"], ["卵", ["卵", "たまご"], 1, "個"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["ゆで卵を潰してマヨネーズで和える", "パンにのせてトースターで焼く"], "こんがり焼けた卵がおいしい"),
  DR("d-natto-gohan", "納豆ごはん", 5, "和風", "和える", "主食", [["米", ["米", "ごはん"], 150, "g"], ["納豆", ["納豆"], 1, "パック"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.1, "本"]], ["納豆をよく混ぜる", "温かいごはんにのせ、ねぎを散らす"], "卵黄やキムチを足すアレンジも"),
  DR("d-tkg", "卵かけごはん", 5, "和風", "和える", "主食", [["米", ["米", "ごはん"], 150, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["温かいごはんに卵を落とす", "醤油をかけて混ぜる"], "新鮮な卵でシンプルに"),
  DR("d-okayu", "おかゆ", 30, "和風", "煮る", "主食", [["米", ["米", "ごはん"], 75, "g"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["米を多めの水でコトコト煮る", "塩で調え、好みで溶き卵を加える"], "体調に合わせて水分を調整"),
  DR("d-ume-okayu", "梅がゆ", 30, "和風", "煮る", "主食", [["米", ["米", "ごはん"], 75, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["おかゆを炊く", "梅干しと大葉をのせる"], "梅の酸味で食欲が戻る一杯"),
  DR("d-ham-cheese-toast", "ハムチーズトースト", 10, "洋風", "焼く", "主食", [["食パン", ["食パン", "パン"], 2, "枚"], ["ハム", ["ハム"], 1, "枚"], ["チーズ", ["チーズ"], 15, "g"]], ["パンにハムとチーズをはさむ", "トースター（またはフライパン）で両面焼く"], "ホットサンド風の朝ごはん"),
  DR("d-sake-flake", "鮭フレーク風", 15, "和風", "炒める", "副菜", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["鮭を焼いて細かくほぐす", "フライパンで炒って水分を飛ばし、塩とごまで調える"], "ごはんとおにぎりの作り置き"),
  DR("d-nori-tsukudani", "海苔の佃煮風", 15, "和風", "煮る", "副菜", [["海苔", ["海苔"], 3, "枚"]], ["海苔をちぎって水に浸す", "醤油・みりん・砂糖で煮詰める"], "湿気た海苔の救済にもなる佃煮"),
  // おやつ
  DR("d-purin", "プリン", 30, "洋風", "蒸す", "おやつ", [["卵", ["卵", "たまご"], 2, "個"], ["牛乳", ["牛乳"], 200, "mL"], ["砂糖", ["砂糖"], 3, "大さじ"]], ["砂糖でカラメルを作って型に流す", "卵液を加えて弱火で蒸す"], "蒸しすぎは「す」の元、様子を見ながら"),
  DR("d-choco-banana", "チョコバナナ", 10, "洋風", "和える", "おやつ", [["バナナ", ["バナナ"], 1, "本"], ["チョコレート", ["チョコレート"], 20, "g"]], ["チョコレートを湯煎で溶かす", "バナナにからめて冷やし固める"], "カラースプレーがあればお祭り風に"),
  DR("d-mitarashi-mochi", "みたらし餅", 15, "和風", "焼く", "おやつ", [["もち", ["もち"], 2, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["もちを焼く", "醤油・砂糖・水のタレを煮詰めてかける"], "タレはとろみがつくまで煮詰めて"),
  DR("d-isobe-mochi", "磯辺餅", 10, "和風", "焼く", "おやつ", [["もち", ["もち"], 2, "個"], ["海苔", ["海苔"], 1, "枚"]], ["もちを焼いて醤油をつける", "海苔で巻く"], "焼きたてが一番のおやつ"),
  DR("d-kinako-mochi", "きなこ餅", 10, "和風", "和える", "おやつ", [["もち", ["もち"], 2, "個"], ["きな粉", ["きな粉"], 1.5, "大さじ"]], ["もちを柔らかくゆでる（または焼く）", "きな粉と砂糖をまぶす"], "黒蜜があれば安倍川餅風に"),
  DR("d-fruit-punch", "フルーツポンチ風", 10, "洋風", "和える", "おやつ", [["みかん缶", ["みかん缶"], 0.5, "缶"], ["パイナップル缶", ["パイナップル缶"], 0.25, "缶"], ["バナナ", ["バナナ"], 0.5, "本"], ["キウイ", ["キウイ"], 0.5, "個"]], ["果物を一口大に切る", "缶のシロップとサイダー少しで和えて冷やす"], "白玉を入れるとボリュームアップ"),
  DR("d-yogurt-parfait", "ヨーグルトパフェ風", 10, "洋風", "和える", "おやつ", [["ヨーグルト", ["ヨーグルト"], 100, "g"], ["バナナ", ["バナナ"], 0.5, "本"], ["いちご", ["いちご"], 3, "個"], ["はちみつ", ["はちみつ"], 0.5, "大さじ"]], ["グラスにヨーグルトと果物を重ねる", "はちみつをかける"], "朝ごはんにもなる軽いパフェ"),
  DR("d-apple-compote", "りんごのコンポート", 20, "洋風", "煮る", "おやつ", [["りんご", ["りんご"], 1, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["レモン", ["レモン"], 0.25, "個"]], ["りんごをくし切りにする", "砂糖とレモンで煮る"], "ヨーグルトやアイスのトッピングに"),
  DR("d-yaki-ringo", "焼きりんご", 25, "洋風", "焼く", "おやつ", [["りんご", ["りんご"], 1, "個"], ["バター", ["バター"], 5, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["りんごの芯をくり抜いてバターと砂糖を詰める", "オーブン（またはトースター）で焼く"], "シナモンがあれば香りが本格的に"),
  DR("d-banana-cake", "バナナのパウンドケーキ風", 40, "洋風", "焼く", "おやつ", [["バナナ", ["バナナ"], 1.5, "本"], ["ホットケーキミックス", ["ホットケーキミックス"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["バター", ["バター"], 20, "g"]], ["バナナを潰して材料を混ぜる", "型に入れて180℃で25分焼く"], "完熟バナナの救済にぴったり"),
  DR("d-sweet-potato", "スイートポテト", 30, "洋風", "焼く", "おやつ", [["さつまいも", ["さつまいも"], 1, "本"], ["バター", ["バター"], 10, "g"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["さつまいもを蒸して潰し、バターと砂糖を混ぜる", "形を整えて卵黄を塗り、トースターで焼く"], "焼き色がつくと香ばしい"),
  DR("d-tofu-donut", "豆腐ドーナツ風", 20, "洋風", "揚げる", "おやつ", [["豆腐", ["豆腐"], 0.5, "丁"], ["ホットケーキミックス", ["ホットケーキミックス"], 100, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["豆腐とミックスを混ぜて生地にする", "スプーンで落として揚げる"], "もちもち食感の簡単ドーナツ"),
  DR("d-mikan-sherbet", "みかんのシャーベット風", 10, "洋風", "和える", "おやつ", [["みかん缶", ["みかん缶"], 1, "缶"], ["ヨーグルト", ["ヨーグルト"], 50, "g"]], ["みかん缶を汁ごと容器に入れて冷凍する", "途中で何回か混ぜてシャーベット状にする"], "缶詰で作れる簡単冷たいおやつ"),
  DR("d-oshiruko", "おしるこ", 20, "和風", "煮る", "おやつ", [["小豆", ["小豆"], 50, "g"], ["もち", ["もち"], 2, "個"], ["砂糖", ["砂糖"], 2, "大さじ"]], ["小豆を柔らかく煮て砂糖と塩少しで調える", "焼いたもちを入れる"], "冬の温かいおやつの定番"),
  DR("d-zunda-mochi", "ずんだ餅", 20, "和風", "和える", "おやつ", [["枝豆", ["枝豆"], 80, "g"], ["もち", ["もち"], 2, "個"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["枝豆をゆでて薄皮をむき、潰す", "砂糖と塩少しで餡にして、ゆでもちにからめる"], "枝豆の鮮やかな色のおやつ"),
  DR("d-warabi-fu", "わらび餅風", 15, "和風", "煮る", "おやつ", [["片栗粉", ["片栗粉"], 3, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["きな粉", ["きな粉"], 1.5, "大さじ"]], ["片栗粉と砂糖を水で煮て透明になるまで練る", "冷やして切り、きな粉をまぶす"], "片栗粉で作るなんちゃってわらび餅"),
  DR("d-mushi-pan", "蒸しパン", 20, "洋風", "蒸す", "おやつ", [["ホットケーキミックス", ["ホットケーキミックス"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["牛乳", ["牛乳"], 80, "mL"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["材料を混ぜてカップに入れる", "蒸し器で12分蒸す"], "レーズンやさつまいもを入れても"),
  DR("d-apple-toast", "アップルパイ風トースト", 15, "洋風", "焼く", "おやつ", [["食パン", ["食パン", "パン"], 1, "枚"], ["りんご", ["りんご"], 0.5, "個"], ["バター", ["バター"], 5, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["りんごを薄切りにしてバターと砂糖で煮る", "パンにのせてトースターで焼く"], "シナモンがあればパイ風の香りに"),

  // 追加の定番・洋風・魚介
  DR("d-ham-steak", "ハムステーキ", 10, "洋風", "焼く", "主菜", [["ハム", ["ハム"], 60, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["厚切りハムを両面焼く", "ソースとケチャップを絡める"], "厚切りハムのごちそう感"),
  DR("d-bacon-cabbage", "ベーコンとキャベツの炒め物", 10, "洋風", "炒める", "副菜", [["ベーコン", ["ベーコン", "ハム"], 30, "g"], ["キャベツ", ["キャベツ"], 100, "g"]], ["ベーコンを炒めて脂を出す", "キャベツを加えて塩こしょうで仕上げる"], "朝ごはんにもなる炒め物"),
  DR("d-german-potato", "ジャーマンポテト風", 20, "洋風", "炒める", "副菜", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["ソーセージ", ["ソーセージ"], 2, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["じゃがいもをゆでて切る", "ソーセージと炒めて塩こしょうとマスタードで仕上げる"], "カリッと焼くのがおいしい"),
  DR("d-ham-egg", "ハムエッグ", 10, "洋風", "焼く", "主菜", [["ハム", ["ハム"], 2, "枚"], ["卵", ["卵", "たまご"], 2, "個"]], ["ハムを焼く", "卵を落として蓋をして半熟に焼く"], "朝の定番、醤油派とソース派で"),
  DR("d-cheese-imo-mochi", "チーズいももち", 20, "和風", "焼く", "おやつ", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["片栗粉", ["片栗粉"], 2, "大さじ"], ["チーズ", ["チーズ"], 20, "g"]], ["じゃがいもを潰して片栗粉と混ぜ、チーズを包む", "両面をこんがり焼いて甘辛だれを絡める"], "もちもち食感の北海道風おやつ"),
  DR("d-nasu-cheese", "なすのチーズ焼き", 15, "洋風", "焼く", "副菜", [["なす", ["なす", "ナス"], 1.5, "本"], ["チーズ", ["チーズ"], 20, "g"], ["ケチャップ", ["ケチャップ"], 1, "大さじ"]], ["なすを焼く", "ケチャップとチーズをのせて焼く"], "ピザ風のなす料理"),
  DR("d-tomato-cheese", "トマトのチーズ焼き", 15, "洋風", "焼く", "副菜", [["トマト", ["トマト"], 1, "個"], ["チーズ", ["チーズ"], 20, "g"], ["パン粉", ["パン粉"], 0.5, "大さじ"]], ["トマトの輪切りにチーズとパン粉をのせる", "トースターで焼く"], "トマトの酸味とチーズが合います"),
  DR("d-zucchini-fry", "ズッキーニのフライ風", 15, "洋風", "揚げる", "副菜", [["ズッキーニ", ["ズッキーニ"], 1, "本"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["チーズ", ["チーズ"], 10, "g"]], ["ズッキーニにチーズ入りのパン粉をつける", "揚げ焼きにする"], "スティック状で食べやすい"),
  DR("d-paprika-tsuna", "パプリカとツナの炒め物", 10, "洋風", "炒める", "副菜", [["パプリカ", ["パプリカ"], 1, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]], ["パプリカを炒める", "ツナを加えて塩こしょうで仕上げる"], "彩りのよい簡単炒め"),
  DR("d-paprika-marine", "パプリカのマリネ", 15, "洋風", "漬ける", "副菜", [["パプリカ", ["パプリカ"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["パプリカを焼いて皮をむく", "マリネ液に漬ける"], "焼くと甘みが増すパプリカ"),
  DR("d-celery-bacon", "セロリとベーコンの炒め物", 10, "洋風", "炒める", "副菜", [["セロリ", ["セロリ"], 1, "本"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["セロリの筋を取って斜め切りにする", "ベーコンと炒めて塩こしょう"], "セロリの香りが爽やかな炒め物"),
  DR("d-celery-apple", "セロリとりんごのサラダ", 10, "洋風", "和える", "副菜", [["セロリ", ["セロリ"], 1, "本"], ["りんご", ["りんご"], 0.5, "個"], ["ヨーグルト", ["ヨーグルト"], 2, "大さじ"]], ["セロリとりんごを細切りにする", "ヨーグルトとマヨネーズで和える"], " Waldorf風の爽やかサラダ"),
  DR("d-kabu-soboro", "かぶのそぼろ煮", 20, "和風", "煮る", "副菜", [["かぶ", ["かぶ"], 2, "個"], ["ひき肉", ["ひき肉"], 50, "g"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["そぼろを煮てかぶを加える", "柔らかくなったらあんを絡める"], "かぶの葉も刻んで入れると彩りよく"),
  DR("d-kabu-misoshiru", "かぶと油揚げの味噌汁", 15, "和風", "スープ", "汁物", [["かぶ", ["かぶ"], 1.5, "個"], ["油揚げ", ["油揚げ"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["かぶと油揚げをだしで煮る", "味噌を溶く"], "かぶの甘みが出る味噌汁"),
  DR("d-daikon-soboro-ni", "大根のそぼろ煮", 25, "和風", "煮る", "副菜", [["大根", ["大根", "だいこん"], 150, "g"], ["ひき肉", ["ひき肉"], 50, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["大根をだしで煮る", "そぼろあんをかける"], "生姜を効かせると体が温まります"),
  DR("d-hakusai-umani", "白菜のうま煮", 20, "中華", "煮る", "主菜", [["白菜", ["白菜"], 0.12, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["豚肉と野菜を炒めてスープで煮る", "とろみをつける"], "白菜の甘みの中華風うま煮"),
  DR("d-hakusai-miso-itame", "白菜の味噌炒め", 15, "和風", "炒める", "副菜", [["白菜", ["白菜"], 0.1, "玉"], ["厚揚げ", ["厚揚げ"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["白菜と厚揚げを炒める", "味噌だれを絡める"], "ごはんが進む味噌味"),
  DR("d-cabbage-egg", "キャベツと卵の炒め物", 10, "中華", "炒める", "副菜", [["キャベツ", ["キャベツ"], 100, "g"], ["卵", ["卵", "たまご"], 2, "個"]], ["卵をふんわり炒めて取り出す", "キャベツを炒めて卵を戻し、塩とオイスターソースで仕上げる"], "シンプルで飽きない炒め物"),
  DR("d-komatsuna-egg", "小松菜と卵の炒め物", 10, "中華", "炒める", "副菜", [["小松菜", ["小松菜"], 0.5, "束"], ["卵", ["卵", "たまご"], 2, "個"]], ["小松菜を炒める", "溶き卵を加えてふんわり仕上げる"], "カルシウムと鉄分の炒め物"),
  DR("d-komatsuna-jako", "小松菜とじゃこの炒め物", 10, "和風", "炒める", "副菜", [["小松菜", ["小松菜"], 0.5, "束"], ["じゃこ", ["じゃこ", "ちりめんじゃこ"], 15, "g"]], ["じゃこを炒めて香りを出す", "小松菜を加えて醤油で仕上げる"], "じゃこの塩気で調味料いらず"),
  DR("d-chingensai-cream", "チンゲン菜のクリーム煮", 15, "洋風", "煮る", "副菜", [["チンゲン菜", ["チンゲン菜"], 1, "株"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["牛乳", ["牛乳"], 80, "mL"]], ["チンゲン菜とベーコンを炒める", "牛乳で煮てとろみをつける"], "中華の青菜が洋風に"),
  DR("d-chingensai-oyster", "チンゲン菜のオイスター炒め", 10, "中華", "炒める", "副菜", [["チンゲン菜", ["チンゲン菜"], 1, "株"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["チンゲン菜を強火で炒める", "オイスターソースで仕上げる"], "青菜炒めの定番"),
  DR("d-mizuna-nibitashi", "水菜の煮びたし", 15, "和風", "煮る", "副菜", [["水菜", ["水菜"], 80, "g"], ["油揚げ", ["油揚げ"], 1, "枚"]], ["水菜をざく切りにする", "油揚げとだしでさっと煮る"], "煮すぎると食感が消えるので短時間で"),
  DR("d-harihari-nabe", "はりはり鍋風", 20, "和風", "煮る", "主菜", [["水菜", ["水菜"], 100, "g"], ["豚肉", ["豚肉"], 100, "g"], ["油揚げ", ["油揚げ"], 1, "枚"]], ["だしで豚肉と油揚げを煮る", "水菜を山盛り加える"], "水菜のシャキシャキ感が主役の大阪風鍋"),
  DR("d-syungiku-goma", "しゅんぎくのごま和え", 10, "和風", "和える", "副菜", [["しゅんぎく", ["しゅんぎく"], 0.5, "束"], ["ごま", ["ごま"], 1, "大さじ"]], ["しゅんぎくをゆでる", "すりごまと醤油・砂糖で和える"], "香りのよい冬の和え物"),
  DR("d-syungiku-ohitashi", "しゅんぎくのおひたし", 10, "和風", "和える", "副菜", [["しゅんぎく", ["しゅんぎく"], 0.5, "束"], ["かつお節", ["かつお節"], 1, "g"]], ["しゅんぎくをゆでて絞る", "だし醤油に浸してかつお節をかける"], "ゆで時間は短く香りを残して"),
  DR("d-reba-nira", "レバニラ炒め", 20, "中華", "炒める", "主菜", [["鶏レバー", ["鶏レバー", "レバー"], 80, "g"], ["にら", ["にら", "ニラ"], 0.5, "束"], ["もやし", ["もやし"], 0.5, "袋"]], ["レバーの下処理（血抜き）をして炒める", "にらともやしを加えてオイスターソースで仕上げる"], "下処理で臭みのないレバニラに"),
  DR("d-sunagimo-shio", "砂肝の塩炒め", 15, "和風", "炒める", "主菜", [["砂肝", ["砂肝"], 80, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["砂肝に切り込みを入れる", "強火で炒めて塩こしょうとごま油で仕上げる"], "コリコリ食感の塩炒め"),
  DR("d-nankotsu-karaage", "なんこつの唐揚げ風", 20, "和風", "揚げる", "主菜", [["軟骨", ["軟骨", "なんこつ"], 80, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["軟骨に下味をつける", "片栗粉をまぶして揚げる"], "居酒屋風のコリコリ唐揚げ"),
  DR("d-tebamoto-karaage", "手羽元の唐揚げ", 25, "和風", "揚げる", "主菜", [["手羽元", ["手羽元", "鶏肉"], 3, "本"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["手羽元を生姜醤油に漬ける", "片栗粉をまぶして揚げる"], "骨付きで豪華に見える唐揚げ"),
  DR("d-chicken-nanban", "チキン南蛮", 25, "和風", "揚げる", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["卵", ["卵", "たまご"], 1.5, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["マヨネーズ", ["マヨネーズ"], 1.5, "大さじ"]], ["鶏肉に卵衣をつけて揚げ、甘酢にくぐらせる", "タルタルソースをかける"], "タルタルはゆで卵と玉ねぎで手作り"),
  DR("d-sasami-wasabi", "ささみのわさび焼き", 15, "和風", "焼く", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉", "ささみ"], 80, "g"], ["わさび", ["わさび"], 2, "g"]], ["鶏肉（ささみ）を焼く", "わさび醤油を絡める"], "わさびの辛みは火を入れると和らぎます"),
  DR("d-tori-amazu", "鶏と野菜の甘酢炒め", 20, "中華", "炒める", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 80, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ピーマン", ["ピーマン"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["鶏肉と野菜を炒める", "甘酢あんを絡める"], "酢豚の鶏版、あっさり版"),
  DR("d-buta-ponzu", "豚肉のポン酢炒め", 15, "和風", "炒める", "主菜", [["豚肉", ["豚肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["大根", ["大根", "だいこん"], 60, "g"]], ["豚肉と玉ねぎを炒める", "ポン酢を絡め、大根おろしをのせる"], "さっぱりして食欲のない日にも"),
  DR("d-buta-ume-maki", "豚肉の梅しそ巻き", 20, "和風", "焼く", "主菜", [["豚肉", ["豚肉"], 80, "g"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["豚肉に梅と大葉を巻く", "両面を焼く"], "梅の酸味でさっぱりした肉巻き"),
  DR("d-gyu-tataki", "牛肉のたたき風", 20, "和風", "焼く", "主菜", [["牛肉", ["牛肉"], 120, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["牛肉の塊の表面を焼いて冷ます", "薄切りにしてポン酢と薬味で食べる"], "焼き加減は表面だけがコツ"),
  DR("d-gyu-shabu-salad", "牛しゃぶサラダ", 15, "和風", "ゆでる", "副菜", [["牛肉", ["牛肉"], 80, "g"], ["水菜", ["水菜"], 50, "g"], ["トマト", ["トマト"], 0.5, "個"]], ["牛肉をさっとゆでる", "野菜と盛ってごまだれ（またはポン酢）をかける"], "ゆでると脂が落ちてあっさり"),
  DR("d-wafu-steak", "和風ステーキ", 20, "和風", "焼く", "主菜", [["牛肉", ["牛肉"], 120, "g"], ["大根", ["大根", "だいこん"], 80, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["牛肉を焼く", "大根おろしとポン酢・大葉をのせる"], "おろしでさっぱり食べるステーキ"),
  DR("d-wafu-hamburg", "和風ハンバーグ", 25, "和風", "焼く", "主菜", [["ひき肉", ["ひき肉"], 120, "g"], ["大根", ["大根", "だいこん"], 80, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["ハンバーグを焼く", "大根おろしと大葉をのせ、ポン酢をかける"], "おろしハンバーグはあっさり人気"),
  DR("d-cheese-hamburg", "チーズハンバーグ", 25, "洋風", "焼く", "主菜", [["ひき肉", ["ひき肉"], 120, "g"], ["チーズ", ["チーズ"], 20, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"]], ["チーズを包んだハンバーグを焼く", "ケチャップソースをかける"], "切るとチーズがとろけるごちそう"),
  DR("d-roll-hakusai", "ロール白菜", 30, "洋風", "煮る", "主菜", [["白菜", ["白菜"], 0.12, "玉"], ["ひき肉", ["ひき肉"], 100, "g"], ["トマト缶", ["トマト缶"], 100, "g"]], ["ゆでた白菜で肉だねを巻く", "トマト缶とコンソメで煮る"], "キャベツより巻きやすい白菜版"),
  DR("d-harumaki", "春巻き", 30, "中華", "揚げる", "主菜", [["春巻きの皮", ["春巻きの皮"], 4, "枚"], ["豚肉", ["豚肉"], 50, "g"], ["たけのこ", ["たけのこ"], 40, "g"], ["にら", ["にら", "ニラ"], 0.25, "束"], ["春雨", ["春雨"], 15, "g"]], ["具を炒めて冷ます", "皮で包んで揚げる"], "具は冷ましてから包むと皮が破れません"),
  DR("d-suigyoza", "水餃子", 20, "中華", "ゆでる", "主菜", [["餃子の皮", ["餃子の皮"], 8, "枚"], ["ひき肉", ["ひき肉"], 75, "g"], ["にら", ["にら", "ニラ"], 0.25, "束"], ["白菜", ["白菜"], 0.05, "玉"]], ["餃子を包む", "たっぷりの湯でゆでる"], "ポン酢やラー油（大人の分）で"),
  DR("d-age-gyoza", "揚げ餃子", 20, "中華", "揚げる", "主菜", [["餃子の皮", ["餃子の皮"], 8, "枚"], ["ひき肉", ["ひき肉"], 60, "g"], ["チーズ", ["チーズ"], 15, "g"]], ["ひき肉とチーズを包む", "油でカラッと揚げる"], "チーズ入りは子どもに人気"),
  DR("d-hiroshima-okonomi", "広島風お好み焼き", 30, "和風", "焼く", "主食", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["キャベツ", ["キャベツ"], 100, "g"], ["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["生地を薄く焼いてキャベツと豚肉を重ねる", "焼きそばと卵を重ねてひっくり返す"], "重ねて焼く広島スタイル"),
  DR("d-yakisoba-pan", "焼きそばパン", 15, "洋風", "焼く", "主食", [["食パン", ["食パン", "パン"], 1, "枚"], ["焼きそば麺", ["焼きそば麺", "中華麺"], 0.5, "玉"], ["キャベツ", ["キャベツ"], 30, "g"]], ["ソース焼きそばを作る", "パンにはさんで（またはのせて）マヨネーズをかける"], "お祭りの味を家で"),
  DR("d-cream-croquette", "クリームコロッケ風", 35, "洋風", "揚げる", "主菜", [["牛乳", ["牛乳"], 100, "mL"], ["小麦粉", ["小麦粉"], 2, "大さじ"], ["バター", ["バター"], 10, "g"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["固めのホワイトソースを作って冷やし固める", "衣をつけて揚げる"], "冷やしてから成形すると失敗しません"),
  DR("d-kushikatsu", "串カツ", 30, "和風", "揚げる", "主菜", [["豚肉", ["豚肉"], 80, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["パン粉", ["パン粉"], 2.5, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["豚肉と玉ねぎを交互に串に刺す", "衣をつけて揚げる"], "大阪風はソースで、二度漬けは家では自由に"),
  DR("d-sauce-katsu-don", "ソースカツ丼", 25, "洋風", "揚げる", "主食", [["豚ロース", ["豚ロース", "豚肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["米", ["米", "ごはん"], 100, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["とんかつを揚げる", "ソースにくぐらせてごはんにのせる"], "福井風のソースカツ丼"),
  DR("d-ebi-katsu", "えびカツ", 25, "洋風", "揚げる", "主菜", [["えび", ["えび", "エビ"], 5, "尾"], ["はんぺん", ["はんぺん"], 0.5, "枚"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["えびとはんぺんを潰して混ぜる", "衣をつけて揚げる"], "プリプリ食感のえびカツ"),
  DR("d-kaki-furai", "かきフライ", 20, "洋風", "揚げる", "主菜", [["かき", ["かき", "牡蠣"], 4, "個"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["かきの水気を拭いて衣をつける", "油で短時間で揚げる"], "揚げすぎると小さくなるので注意"),
  DR("d-kaki-butter", "かきのバター焼き", 15, "洋風", "焼く", "主菜", [["かき", ["かき", "牡蠣"], 4, "個"], ["バター", ["バター"], 10, "g"], ["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.3, "束"]], ["かきに小麦粉を薄くまぶしてバターで焼く", "ほうれん草を添える"], "かきの旨みとバターのコク"),
  DR("d-hotate-furai", "ほたてフライ", 15, "洋風", "揚げる", "主菜", [["ほたて", ["ほたて", "ホタテ"], 3, "個"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["ほたてに衣をつける", "油でカラッと揚げる"], "タルタルソースで食べるごちそう"),
  DR("d-ika-tempura", "いかの天ぷら", 15, "和風", "揚げる", "主菜", [["いか", ["いか", "イカ"], 80, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["いかに切り込みを入れて衣をつける", "油で揚げる"], "はね防止に水気をよく拭いて"),
  DR("d-sawara-saikyo", "さわらの西京焼き風", 20, "和風", "焼く", "主菜", [["さわら", ["さわら", "サワラ"], 1, "切れ"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["さわらを白味噌・みりんに漬ける", "味噌を拭って焼く"], "白味噌の甘みが上品な焼き魚"),
  DR("d-sawara-yuan", "さわらの幽庵焼き", 20, "和風", "焼く", "主菜", [["さわら", ["さわら", "サワラ"], 1, "切れ"], ["ゆず", ["ゆず"], 0.25, "個"]], ["さわらを醤油・みりん・ゆずに漬ける", "漬け汁を拭って焼く"], "春の魚さわらは香り焼きが合います"),
  DR("d-tai-arani", "たいのあら煮", 25, "和風", "煮る", "主菜", [["たい", ["たい", "鯛"], 1, "切れ"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["たい（あら）に湯をかけて下処理する", "ごぼうと甘辛く煮る"], "あら煮は鯛の旨みの宝庫"),
  DR("d-tai-kobujime", "たいの昆布締め風", 15, "和風", "漬ける", "副菜", [["たい", ["たい", "鯛"], 80, "g"], ["昆布", ["昆布"], 3, "g"]], ["たいの切り身を昆布ではさんで数時間置く", "薄切りにしてわさび醤油で"], "昆布の旨みが移る料亭風"),
  DR("d-anago-kabayaki", "あなごの蒲焼き風", 20, "和風", "焼く", "主菜", [["あなご", ["あなご"], 1, "尾"]], ["あなごを焼く", "蒲焼きのタレを絡める"], "ふっくら焼くのがコツ"),
  DR("d-ayu-shio", "あゆの塩焼き", 20, "和風", "焼く", "主菜", [["あゆ", ["あゆ"], 1, "尾"]], ["あゆに化粧塩をしてグリルで焼く", "蓼酢（またはレモン）を添える"], "化粧塩で見た目も美しく"),
  DR("d-unagi-yanagawa", "柳川鍋風", 25, "和風", "煮る", "主食", [["うなぎ", ["うなぎ"], 0.5, "尾"], ["ごぼう", ["ごぼう"], 0.5, "本"], ["卵", ["卵", "たまご"], 2, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["ごぼうをだしで煮てうなぎをのせる", "卵でとじてごはんにのせる"], "どじょうの代わりにうなぎで作る柳川風"),
  DR("d-shijimi-tsukudani", "しじみの佃煮風", 20, "和風", "煮る", "副菜", [["しじみ", ["しじみ"], 80, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["しじみを酒蒸しして身を取り出す", "生姜と甘辛く煮詰める"], "むき身の手間がおいしさに変わります"),
  DR("d-asari-takikomi", "あさりの炊き込みごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["あさり", ["あさり", "アサリ"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["あさりを酒蒸しして汁と身に分ける", "汁で米を炊き、身を混ぜる"], "貝の出汁で炊く贅沢ごはん"),
  DR("d-tako-takikomi", "たこの炊き込みごはん", 50, "和風", "炊く", "主食", [["米", ["米", "ごはん"], 150, "g"], ["たこ", ["たこ", "タコ"], 60, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["たこを切って米と一緒に炊く", "蒸らして混ぜる"], "たこの旨みがごはんに移ります"),
];

EXTRA_RECIPES.push(...MICROWAVE_RECIPES, ...BUZZ_RECIPES, ...OTSUMAMI_RECIPES, ...OTSUMAMI_RECIPES_MORE, ...NAMAHAMU_RECIPES, ...DAILY_RECIPES_MORE);

// ---------- 重複タイトル解消のための差し替えレシピ ----------
EXTRA_RECIPES.push(
  DR("d-oyako-ni", "親子煮", 20, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["卵", ["卵", "たまご"], 2, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["三つ葉", ["三つ葉"], 1, "g"]], ["鶏肉と玉ねぎをだしで煮る", "溶き卵を流して半熟でとじ、三つ葉を散らす"], "丼にしないおかず版の親子味"),
  DR("d-dashi-chazuke", "だし茶漬け", 10, "和風", "和える", "主食", [["米", ["米", "ごはん"], 100, "g"], ["海苔", ["海苔"], 0.5, "枚"], ["わさび", ["わさび"], 1, "g"], ["三つ葉", ["三つ葉"], 1, "g"]], ["ごはんに海苔と三つ葉をのせる", "熱いだしをかけ、わさびを添える"], "さらさら食べられる締めの一杯"),
  DR("d-nikomi-udon", "煮込みうどん", 25, "和風", "煮る", "主食", [["うどん", ["うどん"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["白菜", ["白菜"], 0.06, "玉"], ["しいたけ", ["しいたけ"], 1, "個"], ["卵", ["卵", "たまご"], 1, "個"]], ["だしで鶏肉と野菜を煮る", "うどんを入れて煮込み、卵を落とす"], "うどんに味が染みる冬の一杯"),
  DR("d-tsukemen", "つけ麺風", 20, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["麺をゆでて冷水でしめる", "豚肉とねぎの濃いめのつけ汁を作る", "麺をつけ汁で食べる"], "つけ汁は割りスープで薄めて飲めます"),
  DR("d-tanmen", "タンメン風", 20, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["豚肉と野菜を炒める", "塩味のスープで麺と煮る"], "野菜の甘みが出る塩ラーメン"),
  DR("d-yasai-champon", "野菜たっぷりちゃんぽん風", 25, "中華", "ゆでる", "主食", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["かまぼこ", ["かまぼこ"], 15, "g"], ["牛乳", ["牛乳"], 50, "mL"]], ["豚肉と野菜を炒める", "牛乳入りのスープで麺と煮る"], "家庭版は牛乳で白濁スープを再現"),
  DR("d-mabo-nasu-don", "麻婆なす丼", 20, "中華", "炒める", "主食", [["なす", ["なす", "ナス"], 2, "本"], ["ひき肉", ["ひき肉"], 60, "g"], ["米", ["米", "ごはん"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"]], ["なすを炒めてひき肉と味噌だれで煮絡める", "ごはんにのせる"], "なすは先に油通しすると色よく仕上がります"),
  DR("d-shogayaki-don", "豚の生姜焼き丼", 15, "和風", "焼く", "主食", [["豚肉", ["豚肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["米", ["米", "ごはん"], 100, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["豚の生姜焼きを作る", "キャベツを敷いたごはんにのせる"], "タレをごはんに染みさせるのが丼の醍醐味"),
  DR("d-tori-mizore-ni", "鶏のみぞれ煮", 20, "和風", "煮る", "主菜", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["大根", ["大根", "だいこん"], 150, "g"], ["しめじ", ["しめじ"], 0.5, "パック"]], ["鶏肉を焼いてだしで煮る", "大根おろしを加えてひと煮立ち"], "大根おろしは最後に入れて香りを残して"),
  DR("d-saba-mizore", "さばのみぞれ煮", 20, "和風", "煮る", "主菜", [["さば", ["さば", "サバ"], 1, "切れ"], ["大根", ["大根", "だいこん"], 120, "g"]], ["さばをだしで煮る", "大根おろしをのせて温める"], "味噌煮とは違うあっさりしたさば料理"),
  DR("d-jaga-oyaki", "じゃがいものおやき風", 20, "和風", "焼く", "副菜", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["片栗粉", ["片栗粉"], 1.5, "大さじ"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["じゃがいもをすりおろして片栗粉と混ぜる", "平たく成形して両面を焼き、味噌を塗る"], "すりおろしのもちもち食感"),
  DR("d-nasu-soboro-ni", "なすの鶏そぼろ煮", 20, "和風", "煮る", "副菜", [["なす", ["なす", "ナス"], 2, "本"], ["ひき肉", ["ひき肉", "鶏ひき肉"], 50, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["なすを炒めてそぼろと煮る", "生姜を効かせて仕上げる"], "なすがとろとろになる煮物"),
  DR("d-kabocha-butter-yaki", "かぼちゃのバター焼き", 15, "洋風", "焼く", "副菜", [["かぼちゃ", ["かぼちゃ"], 120, "g"], ["バター", ["バター"], 8, "g"]], ["かぼちゃを薄切りにする", "バターで両面を焼いて塩を振る"], "表面カリッと中はホクホク"),
  DR("d-renkon-amazu-itame", "れんこんの甘酢炒め", 15, "和風", "炒める", "副菜", [["れんこん", ["れんこん"], 80, "g"], ["豚肉", ["豚肉"], 40, "g"]], ["れんこんと豚肉を炒める", "甘酢を絡める"], "シャキシャキれんこんの甘酢味"),
  DR("d-gobou-miso-ni", "ごぼうの味噌煮", 25, "和風", "煮る", "副菜", [["ごぼう", ["ごぼう"], 0.5, "本"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["ごぼうとこんにゃくをだしで煮る", "味噌で仕上げる"], "ごぼうの香りと味噌が合います"),
  DR("d-daikon-consomme", "大根のコンソメ煮", 25, "洋風", "煮る", "副菜", [["大根", ["大根", "だいこん"], 150, "g"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"], ["コンソメ", ["コンソメ"], 1, "個"]], ["大根をコンソメで煮る", "ベーコンを加えて煮含める"], "洋風おでんのような一品"),
  DR("d-hakusai-tsuna-ni", "白菜とツナの煮物", 15, "和風", "煮る", "副菜", [["白菜", ["白菜"], 0.1, "玉"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"]], ["白菜をだしで煮る", "ツナを汁ごと加えて醤油で調える"], "ツナの旨みで白菜がたくさん食べられます"),
  DR("d-cabbage-butter-mushi", "キャベツのバター蒸し", 15, "洋風", "蒸す", "副菜", [["キャベツ", ["キャベツ"], 120, "g"], ["バター", ["バター"], 8, "g"], ["ベーコン", ["ベーコン", "ハム"], 20, "g"]], ["キャベツとベーコンを重ねて蒸す", "バターをのせて塩こしょう"], "キャベツの甘みが際立つ蒸し物"),
  DR("d-komatsuna-miso-itame", "小松菜の味噌炒め", 10, "和風", "炒める", "副菜", [["小松菜", ["小松菜"], 0.5, "束"], ["油揚げ", ["油揚げ"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["小松菜と油揚げを炒める", "味噌だれを絡める"], "味噌味でごはんが進む青菜炒め"),
  DR("d-hourensou-kurumi", "ほうれん草のクルミ和え", 15, "和風", "和える", "副菜", [["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.5, "束"], ["くるみ", ["くるみ"], 15, "g"]], ["ほうれん草をゆでて絞る", "砕いたくるみと醤油・砂糖で和える"], "くるみの香ばしさが加わる和え物"),
  DR("d-broccoli-mayo-yaki", "ブロッコリーのマヨ焼き", 15, "洋風", "焼く", "副菜", [["ブロッコリー", ["ブロッコリー"], 80, "g"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"], ["チーズ", ["チーズ"], 10, "g"]], ["ブロッコリーをゆでる", "マヨネーズとチーズをのせてトースターで焼く"], "焼き色がつくと香ばしい"),
  DR("d-aspara-nikumaki", "アスパラの肉巻き", 15, "和風", "焼く", "主菜", [["アスパラ", ["アスパラ"], 4, "本"], ["豚肉", ["豚肉"], 60, "g"]], ["アスパラに豚肉を巻く", "両面を焼いて甘辛だれを絡める"], "お弁当にも人気の肉巻き"),
  DR("d-ingen-nikumaki", "いんげんの肉巻き", 15, "和風", "焼く", "主菜", [["いんげん", ["いんげん"], 8, "本"], ["豚肉", ["豚肉"], 60, "g"]], ["いんげんを束ねて豚肉を巻く", "両面を焼いて照り焼きだれを絡める"], "断面の緑がきれいな肉巻き"),
  DR("d-ninjin-egg", "にんじんと卵の炒め物", 10, "和風", "炒める", "副菜", [["にんじん", ["にんじん", "人参"], 1, "本"], ["卵", ["卵", "たまご"], 2, "個"]], ["にんじんを細切りにして炒める", "溶き卵を加えてふんわり仕上げる"], "ツナを加えるとしりしり風になります"),
  DR("d-tamanegi-tamagotoji", "玉ねぎの卵とじ", 15, "和風", "煮る", "副菜", [["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"], ["卵", ["卵", "たまご"], 2, "個"]], ["玉ねぎをだしで煮る", "卵でとじる"], "玉ねぎの甘みだけの優しい一品"),
  DR("d-moyashi-egg", "もやしと卵の炒め物", 10, "中華", "炒める", "副菜", [["もやし", ["もやし"], 1, "袋"], ["卵", ["卵", "たまご"], 2, "個"], ["にら", ["にら", "ニラ"], 0.25, "束"]], ["もやしを強火で炒める", "溶き卵とにらを加えて仕上げる"], "節約食材の組み合わせの定番"),
  DR("d-kyuri-ume-okaka", "きゅうりの梅おかか和え", 10, "和風", "和える", "副菜", [["きゅうり", ["きゅうり"], 1, "本"], ["梅干し", ["梅干し", "梅"], 1, "個"], ["かつお節", ["かつお節"], 1, "g"]], ["きゅうりを叩いて割る", "梅肉とかつお節で和える"], "梅の酸味でさっぱり"),
  DR("d-wakame-nuta", "わかめのぬた風", 10, "和風", "和える", "副菜", [["わかめ", ["わかめ"], 3, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["わかめを戻し、ねぎをゆでる", "酢味噌で和える"], "ねぎのぬたのわかめ版"),
  DR("d-hijiki-tsuna-ni", "ひじきとツナの煮物", 20, "和風", "煮る", "副菜", [["ひじき", ["ひじき"], 3, "g"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["ひじきを戻してにんじんと煮る", "ツナを加えて醤油で仕上げる"], "ツナのコクでひじきが食べやすく"),
  DR("d-kiriboshi-ni", "切り干し大根の煮物", 25, "和風", "煮る", "副菜", [["切り干し大根", ["切り干し大根"], 15, "g"], ["油揚げ", ["油揚げ"], 1, "枚"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["切り干し大根を戻す", "油揚げとにんじんとだしで煮る"], "乾物の旨みが詰まった常備菜"),
  DR("d-kanpyo-ni", "かんぴょうの煮物", 30, "和風", "煮る", "副菜", [["かんぴょう", ["かんぴょう"], 5, "g"], ["干ししいたけ", ["干ししいたけ"], 1, "個"]], ["かんぴょうを塩もみしてゆで、戻す", "甘辛く煮含める"], "巻き寿司の具の定番を副菜で"),
  DR("d-ofu-ni", "お麩の煮物", 15, "和風", "煮る", "副菜", [["お麩", ["お麩", "麩"], 10, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["いんげん", ["いんげん"], 3, "本"]], ["お麩を戻す", "野菜とだしで煮る"], "だしを吸ったお麩が主役の煮物"),
  DR("d-tamagotoji-udon", "卵とじうどん", 15, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["卵", ["卵", "たまご"], 1.5, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["うどんをだしで温める", "とろみをつけて溶き卵を流す"], "とろみで冷めにくい冬のうどん"),
  DR("d-tamagotoji-soba", "卵とじそば", 15, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["卵", ["卵", "たまご"], 1.5, "個"], ["三つ葉", ["三つ葉"], 1, "g"]], ["そばをだしで温める", "溶き卵を流してふんわりとじる"], "優しい味の温かいそば"),
  DR("d-curry-soba", "カレーそば", 20, "和風", "ゆでる", "主食", [["そば", ["そば"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"], ["カレールー", ["カレールー"], 0.5, "皿分"]], ["豚肉とねぎをだしで煮てカレールーを溶かす", "そばにかける"], "うどんと違うそばの香りが合います"),
  DR("d-salad-udon", "サラダうどん", 15, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["レタス", ["レタス"], 40, "g"], ["トマト", ["トマト"], 0.5, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.5, "缶"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["うどんをゆでて冷水でしめる", "野菜とツナをのせ、マヨネーズと麺つゆをかける"], "夏の食欲がない日にも食べやすい"),
  DR("d-bukkake-udon", "ぶっかけうどん", 15, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["大根", ["大根", "だいこん"], 60, "g"], ["天かす", ["天かす"], 1, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"], ["レモン", ["レモン"], 0.25, "個"]], ["うどんをゆでて冷水でしめる", "大根おろしと天かす・ねぎをのせ、濃いめのつゆをかける"], "レモンを搾るとさっぱり"),
  DR("d-wakame-udon", "わかめうどん", 10, "和風", "ゆでる", "主食", [["うどん", ["うどん"], 1, "玉"], ["わかめ", ["わかめ"], 3, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["うどんをだしで温める", "わかめとねぎをのせる"], "シンプルなうどんの基本形"),
  DR("d-yodare-dori", "よだれ鶏", 20, "中華", "蒸す", "主菜", [["鶏むね肉", ["鶏むね", "むね肉", "鶏肉"], 100, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["ごま", ["ごま"], 0.5, "大さじ"], ["きゅうり", ["きゅうり"], 0.5, "本"]], ["鶏肉を酒蒸しして冷まし、薄切りにする", "きゅうりの上に盛り、醤油・酢・ごま油のタレ（辛みは大人の分だけラー油を）をかける"], "蒸し汁はスープに使えます"),
DR("d-ebi-tamagotoji", "えびの卵とじ", 15, "和風", "煮る", "主菜", [["えび", ["えび", "エビ"], 4, "尾"], ["卵", ["卵", "たまご"], 2, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["三つ葉", ["三つ葉"], 1, "g"]], ["えびと玉ねぎをだしで煮る", "卵でとじて三つ葉を散らす"], "丼にしないおかず版のえびとじ"),
);


export const ALL_RECIPES = [...RECIPES, ...EXTRA_RECIPES];

function metaFor(recipe) {
  return RECIPE_META[recipe.id] || {};
}

// ---------- 消費順（先入れ先出しの原則＋ユーザーの優先順位） ----------
// ユーザーの指定: 「消費期限の近いもの → 先に買ったもの → 期限がまだなものの順」
//  1) 消費期限が近いロットから（期限の近さが購入順より優先する）
//  2) 期限が同じなら、先に買った（登録した）ロットから
//  3) 期限なしは期限ありの後ろに回し、その中では購入順
// データモデル上、在庫は「食材ごとに複数エントリ（ロット）」で持つ。
// 実際に料理で使う分はこの並びの先頭ロットから割り当てる（planUsage）。

/** 消費優先度の比較関数（先に使うべきロットが小さい） */
export function compareLotsForUse(a, b) {
  const ea = a.expiryDate || null, eb = b.expiryDate || null;
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  const ca = a.createdAt || "", cb = b.createdAt || "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0;
}

function matches(item, ingredient) {
  return ingredient.match.some((kw) => item.name.includes(kw) || kw.includes(item.name));
}

/** その材料に使える在庫ロットを、消費順（期限→購入順）に並べて返す */
export function lotsForIngredient(stockItems, ingredient) {
  return stockItems.filter((item) => matches(item, ingredient)).sort(compareLotsForUse);
}

/** 必要量を消費順に先頭ロットから割り当てる使用計画（同単位のロットのみ対象） */
export function planUsage(stockItems, ingredient, amount, unit) {
  const plan = [];
  let rest = amount;
  for (const lot of lotsForIngredient(stockItems, ingredient)) {
    if (rest <= 0) break;
    if (unit && lot.unit !== unit) continue;
    const use = Math.min(rest, Number(lot.quantity) || 0);
    if (use <= 0) continue;
    plan.push({ itemId: lot.id, stockName: lot.name, use, unit: lot.unit, expiryDate: lot.expiryDate || null, registeredAt: lot.createdAt || null });
    rest = Math.round((rest - use) * 1000) / 1000;
  }
  return plan;
}

function findStock(stockItems, ingredient) {
  return lotsForIngredient(stockItems, ingredient)[0] || null;
}

function todayLocalISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}
/** 代表ロット（消費順の先頭）の「早く使いたい度」ボーナス。期限が近いほど大、期限なしは寝かせた日数で小 */
function urgencyBonus(lot, today) {
  if (!lot) return 0;
  if (lot.expiryDate) {
    const d = daysBetween(today, lot.expiryDate);
    if (d <= 0) return 6;
    if (d <= 2) return 5;
    if (d <= 5) return 3.5;
    if (d <= 10) return 2;
    return 0.5;
  }
  if (lot.createdAt) return Math.min(2, Math.max(0, daysBetween(lot.createdAt, today)) * 0.1);
  return 0;
}

/** ローテーション用の決定的ハッシュ（同じキーでは毎回同じ値） */
function rotationJitter(id, key) {
  let h = 0;
  const s = `${id}|${key}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 90) / 100; // 0〜0.89。期限優先のスコア差（最大で数点）より小さい
}

/**
 * 1品を在庫と照合して評価する共通処理（通常の提案・イベント献立で共用）。
 * 材料を家族人数で換算し、在庫にある材料（have、消費順の先頭ロット付き）と
 * 足りない材料（missing）に分ける。bonus は期限の近さの加点、earliestExpiry は
 * その料理で使う材料のうち最も近い期限。
 */
export function evaluateRecipe(recipe, stockItems, servings = 2, today = todayLocalISO()) {
  const have = [], missing = [];
  let bonus = 0, earliestExpiry = null;
  for (const ing of recipe.ingredients) {
    const entry = { name: ing.name, amount: Math.round(ing.per * servings * 10) / 10, unit: ing.unit };
    const lots = lotsForIngredient(stockItems, ing);
    const rep = lots[0];
    if (rep) {
      // 消費順の先頭ロット（＝この料理で最初に使う分）を材料行に添える（UI表示用）
      entry.fifo = {
        stockName: rep.name,
        expiryDate: rep.expiryDate || null,
        registeredAt: rep.createdAt || null,
        lotCount: lots.length,
      };
      bonus += urgencyBonus(rep, today);
      if (rep.expiryDate && (!earliestExpiry || rep.expiryDate < earliestExpiry)) earliestExpiry = rep.expiryDate;
      have.push(entry);
    } else {
      missing.push(entry);
    }
  }
  const meta = metaFor(recipe);
  return {
    ...recipe, genre: recipe.genre || meta.genre || "その他",
    method: recipe.method || meta.method || "作る", course: recipe.course || meta.course || "主菜",
    useUp: recipe.useUp || meta.useUp || false,
    have, missing, bonus, earliestExpiry,
  };
}


// ============================================================
// 食材を選んで作るモード用: 選択した在庫食材をどれだけ使うかで並べ替える
// ============================================================
/** 材料が在庫アイテム名にマッチするか（matches() と同じ規則を、名前同士で判定する版） */
export function ingredientMatchesStockName(ingredient, stockName) {
  const name = String(stockName || "");
  if (!name) return false;
  const kws = Array.isArray(ingredient && ingredient.match) && ingredient.match.length
    ? ingredient.match
    : [ingredient && ingredient.name].filter(Boolean);
  return kws.some((kw) => kw && (name.includes(kw) || kw.includes(name)));
}

/** レシピが「選択した在庫食材」のうち何種類を使うか（選択名の重複は除いて数える） */
export function countUsedSelected(recipe, selectedNames) {
  const selected = [...new Set((selectedNames || []).filter(Boolean))];
  if (!recipe || !selected.length) return 0;
  return selected.filter((name) =>
    (recipe.ingredients || []).some((ing) => ingredientMatchesStockName(ing, name))).length;
}

/**
 * 評価済みレシピ（evaluateRecipe の戻り値。組み合わせ生成の評価結果も可）を、
 * 選択食材の使用数で並べ替える純粋関数。
 * - 残すのは「選択食材を1種類以上使う」レシピだけ
 * - 順序: 使用数 desc → 不足材料数 asc → 期限ボーナス desc
 * - 各要素に usedSelected（使用した選択食材の数）を付けて返す
 */
export function rankRecipesByIngredients(evaluatedRecipes, selectedNames) {
  const rows = [];
  for (const r of evaluatedRecipes || []) {
    const used = countUsedSelected(r, selectedNames);
    if (used === 0) continue;
    rows.push({ r, used, missing: (r.missing || []).length, bonus: r.bonus || 0 });
  }
  rows.sort((a, b) => b.used - a.used || a.missing - b.missing || b.bonus - a.bonus);
  return rows.map(({ r, used }) => ({ ...r, usedSelected: used }));
}


// ============================================================
// detailedSteps(recipe): 短い steps を「下ごしらえ→加熱→味付け→仕上げ」の
// 詳細手順に展開する。UI はこれがあれば使い、なければ recipe.steps を使う。
// 返り値: [{ text, minutes }]（minutes は目安分数、総時間が不明なら null）
// ============================================================
const DETAIL_METHOD_CUES = {
  "焼く": { fire: "中火", state: "表面に焼き色がつき、香ばしい香りが立ったら" },
  "炒める": { fire: "中火〜強火", state: "全体に油が回り、具材に火が通ったら" },
  "揚げる": { fire: "中温（170℃目安）の油", state: "きつね色になって浮いてきたら" },
  "煮る": { fire: "弱火〜中火", state: "具材が柔らかくなり、味が染みてきたら" },
  "蒸す": { fire: "弱火（蒸し器は中火）", state: "中まで火が通り、ふっくらしたら" },
  "ゆでる": { fire: "中火", state: "浮いてくる・芯がなくなるなど火が通ったら" },
  "炊く": { fire: "炊飯器／弱火", state: "炊き上がって蒸らしが済んだら" },
  "スープ": { fire: "弱火〜中火", state: "具材が柔らかくなり、だしが澄んできたら" },
  "レンジ": { fire: "600W", state: "中まで温まり、火通りを確認できたら" },
  "和える": { fire: "火を使わない", state: "全体に味がなじんだら" },
  "漬ける": { fire: "火を使わない", state: "味がなじんで色が変わってきたら" },
  "サラダ": { fire: "火を使わない", state: "全体にドレッシングが回ったら" },
  "冷やす": { fire: "冷蔵庫で冷やす", state: "よく冷えて味がなじんだら" },
  "切る": { fire: "火を使わない", state: "切り分けて形が整ったら" },
  "その他": { fire: "様子を見ながら", state: "仕上がりの状態を確認できたら" },
};
const DETAIL_PREP_EXTRA = {
  "揚げる": "具材の水気はペーパーでよく拭いておく（油はね防止）。",
  "レンジ": "耐熱容器とラップ（または蓋）を用意する。",
  "炊く": "米は洗って浸水させておくとふっくら炊ける。",
  "漬ける": "保存容器かポリ袋を用意する。",
  "蒸す": "蒸し器（または蓋付きフライパン）に湯を沸かしておく。",
};

export function detailedSteps(recipe) {
  const src = recipe && Array.isArray(recipe.steps) ? recipe.steps.filter((s) => typeof s === "string" && s.trim()) : [];
  const method = (recipe && recipe.method) || "";
  const cue = DETAIL_METHOD_CUES[method] || DETAIL_METHOD_CUES["その他"];
  const total = recipe && Number.isFinite(recipe.minutes) && recipe.minutes > 0 ? recipe.minutes : null;
  const ings = recipe && Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

  // 時間配分（重み: 下ごしらえ2 / 各ステップ3 / 仕上げ1）
  const weights = [2, ...src.map(() => 3), 1];
  const alloc = weights.map((w) => {
    if (!total) return null;
    return Math.max(1, Math.round((total * w) / weights.reduce((a, b) => a + b, 0)));
  });

  const out = [];
  // 1) 下ごしらえ
  const names = ings.slice(0, 6).map((i) => i && i.name).filter(Boolean);
  let prep = names.length
    ? `下ごしらえ：${names.join("、")}${ings.length > 6 ? "など" : ""}を用意し、洗う・皮をむくなどの処理をして食べやすい大きさに切る。`
    : "下ごしらえ：材料をすべて揃え、洗う・皮をむくなどの処理をして食べやすい大きさに切る。";
  if (DETAIL_PREP_EXTRA[method]) prep += DETAIL_PREP_EXTRA[method];
  prep += "調味料も先に計っておくと慌てない。";
  out.push({ text: prep, minutes: alloc[0] });

  // 2) 本手順（火加減・状態の目安・時間を補う）
  src.forEach((s, i) => {
    const m = alloc[i + 1];
    let extra;
    if (method === "レンジ") {
      extra = s.includes("W") || s.includes("ワット")
        ? "加熱後は庫内に1分ほど置くと余熱で火通りが均一になる。"
        : `目安は${cue.fire}。加熱ムラを防ぐため、途中で一度取り出して混ぜるとよい。`;
    } else if (method === "和える" || method === "漬ける" || method === "サラダ") {
      extra = i === src.length - 1 ? "味見をして、塩・醤油などで味を整える。" : "具材を潰さないよう、大きく混ぜる。";
    } else {
      extra = `火加減は${cue.fire}が目安。${cue.state}次の工程へ。`;
    }
    out.push({ text: `${s}（${extra}）`, minutes: m });
  });

  // 3) 仕上げ
  out.push({
    text: "仕上げ：味見をして塩加減を整え、器に盛り付ける。薬味や付け合わせがあれば添えて、温かい料理は熱いうちに食卓へ。",
    minutes: alloc[alloc.length - 1],
  });
  return out;
}

export function suggestRecipes(stockItems, { mode = "stock", servings = 2, limit = 8, rotateKey = null } = {}) {
  const today = todayLocalISO();
  const rotKey = rotateKey ?? today; // 既定は日替わり
  const results = [];
  for (const recipe of ALL_RECIPES) {
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    const { have, missing } = evaluated;
    if (mode === "stock" && missing.length > 0) continue;
    if (mode === "shop" && missing.length > 3) continue;
    if (have.length === 0) continue;
    results.push({
      ...evaluated,
      score: have.length * 10 - missing.length * 4 + bonus + rotationJitter(recipe.id, rotKey),
      _fifoKey: earliestExpiry,
    });
  }
  // スコア優先、同点なら「いちばん期限が近い材料を持つ料理」を先に
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

/**
 * クイックフィルタ有効時のおすすめプール（全カタログ版）。
 * 在庫マッチ（suggestRecipes）の結果だけを絞り込むと、フィルタ後に数件しか
 * 残らず「別の提案を見る」で新しい候補が出てこない（例: おつまみ101品のうち
 * 手持ちの食材で作れるのは数品だけ）。そこでフィルタが有効な間は、全固定
 * レシピを今の在庫で評価し直し、フィルタに合うものを全部候補にする。
 * 足りない材料が6件以上のものは「あと少しで作れる」範囲を超えるので除く
 * （食材ピッカーと同じ上限）。並びは 不足材料数 asc → 期限ボーナス
 * （使い切り優先） desc → タイトル順。戻り値は evaluateRecipe の評価済み
 * レシピ（have/missing 付き）で、通常のレシピカード・詳細・お気に入り・
 * 献立ピン留めがそのまま使える。
 */
export function suggestFilteredCatalogue(stockItems, { servings = 2, filter = "all" } = {}) {
  const today = todayLocalISO();
  const rows = [];
  for (const recipe of ALL_RECIPES) {
    const evaluated = evaluateRecipe(recipe, stockItems, servings, today);
    if (evaluated.missing.length >= 6) continue;
    if (!matchesRecipeFilter(evaluated, filter)) continue;
    rows.push(evaluated);
  }
  rows.sort((a, b) =>
    a.missing.length - b.missing.length
    || (b.bonus || 0) - (a.bonus || 0)
    || String(a.title).localeCompare(String(b.title), "ja"));
  return rows;
}

/**
 * 献立セット提案: 「主菜＋副菜＋汁物」の組み合わせを在庫だけで作れるものから選ぶ。
 * 作れるものが無いコースは null。主菜が無ければ全体を null にする。
 * 戻り値: { main, side, soup, recipes: [主菜, 副菜?, 汁物?], totalMinutes }
 */
export function suggestMealSet(stockItems, { servings = 2, rotateKey = null } = {}) {
  const all = suggestRecipes(stockItems, { mode: "stock", servings, limit: ALL_RECIPES.length, rotateKey });
  const pick = (courses, exclude) => all.find((r) => courses.includes(r.course) && !exclude.has(r.id)) || null;
  const used = new Set();
  const main = pick(["主菜", "主食"], used);
  if (!main) return null;
  used.add(main.id);
  const side = pick(["副菜", "サラダ"], used);
  if (side) used.add(side.id);
  const soup = pick(["汁物"], used);
  const recipes = [main, side, soup].filter(Boolean);
  return { main, side, soup, recipes, totalMinutes: recipes.reduce((s, r) => s + (r.minutes || 0), 0) };
}

// ============================================================
// イベント献立（2026-11-10「ハロウィンやクリスマス、正月、冬至などの
// イベント献立も立てれるようにして」）
// 行事ごとに「主菜・副菜・汁物/行事食・デザート」の献立セットを用意する。
// 料理は通常レシピと同じデータモデル（ingredients の match/per/unit、
// 家族人数で換算、have/missing の照合は evaluateRecipe を共用）。
// 既存レシピ（ALL_RECIPES）も献立に再利用し、行事専用の料理は
// EVENT_RECIPES に足す（並行する別システムは作らない）。
// ============================================================

export const EVENT_RECIPES = [
  // ---- ハロウィン ----
  { id: "ev-kabocha-gratin", title: "かぼちゃのグラタン", minutes: 30, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
  ], steps: ["かぼちゃと玉ねぎを炒めて牛乳で煮る", "耐熱皿に移してチーズをのせ、焼き色がつくまで焼く"], tip: "かぼちゃの顔をチーズで描くとハロウィンらしくなります" },
  { id: "ev-kabocha-soup", title: "かぼちゃのポタージュ", minutes: 25, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
  ], steps: ["かぼちゃと玉ねぎを柔らかく煮て潰す", "牛乳でのばしてコンソメと塩で味を整える"], tip: "皮をむくと色がきれいなオレンジになります" },
  { id: "ev-halloween-salad", title: "かぼちゃとハムのサラダ", minutes: 15, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["かぼちゃを蒸して一口大に切る", "ハムとレタスとマヨネーズで和える"], tip: "レーズンを散らすと甘みが増します" },
  { id: "ev-kabocha-pudding", title: "かぼちゃプリン", minutes: 20, genre: "洋風", method: "蒸す", course: "デザート", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 75, unit: "mL" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["蒸したかぼちゃを潰し、卵・牛乳・砂糖と混ぜる", "こしてから弱火で蒸し、冷やして固める"], tip: "ジャック・オー・ランタンの顔を描くと子どもが喜びます" },
  // ---- クリスマス ----
  { id: "ev-roast-chicken", title: "ローストチキン", minutes: 45, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 150, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
  ], steps: ["鶏肉に塩こしょうとにんにくをもみ込む", "野菜と一緒にオーブン（またはフライパン＋蓋）でこんがり焼く"], tip: "焼く前に常温に戻すと中まで火が通りやすくなります" },
  { id: "ev-corn-soup", title: "コーンポタージュ", minutes: 15, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "コーン缶", match: ["コーン缶", "とうもろこし"], per: 0.5, unit: "缶" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["玉ねぎを炒め、コーンと水で煮る", "牛乳を加えてコンソメで味を整える"], tip: "コーンを少し残して混ぜると粒の食感が楽しめます" },
  { id: "ev-ichigo-cake", title: "いちごのショートケーキ風", minutes: 15, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "生クリーム", match: ["生クリーム", "ホイップ"], per: 50, unit: "mL" },
    { name: "カステラ", match: ["カステラ", "スポンジ"], per: 1, unit: "切れ" },
  ], steps: ["生クリームを泡立てる", "カステラにクリームといちごを重ねてのせる"], tip: "グラスに重ねるとパフェ風になって簡単です" },
  // ---- お正月（おせち） ----
  { id: "ev-ozoni", title: "お雑煮", minutes: 20, genre: "和風", method: "スープ", course: "行事食", ingredients: [
    { name: "餅", match: ["餅", "もち"], per: 2, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
  ], steps: ["だしで鶏肉と野菜を煮る", "焼いた餅を入れ、醤油と塩で味を整える"], tip: "地域で味付けが違うので、家の味を子どもに伝える機会に" },
  { id: "ev-datemaki", title: "伊達巻", minutes: 20, genre: "和風", method: "焼く", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "はんぺん", match: ["はんぺん"], per: 0.5, unit: "枚" },
  ], steps: ["はんぺんを潰して卵と混ぜ、砂糖とだしで味付け", "フライパンで焼いて熱いうちに巻く"], tip: "巻物の形は「学問が身につくように」という願いから" },
  { id: "ev-kurikinton", title: "栗きんとん", minutes: 25, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 100, unit: "g" },
    { name: "栗", match: ["栗"], per: 2, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["さつまいもを茹でて熱いうちに潰す", "砂糖と煮汁で練り、栗を混ぜる"], tip: "金色の見た目から「金運」の縁起物です" },
  { id: "ev-kuromame", title: "黒豆", minutes: 30, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "黒豆", match: ["黒豆"], per: 40, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["黒豆を一晩水に浸す", "弱火で柔らかくなるまで煮て甘く味付ける"], tip: "「まめに働けるように」という元気の願いがこもっています" },
  { id: "ev-namasu", title: "紅白なます", minutes: 15, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 75, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["大根とにんじんを千切りにして塩もみする", "甘酢で和えてなじませる"], tip: "紅白の色はお祝いの色です" },
  // ---- 冬至 ----
  { id: "ev-kabocha-croquette", title: "かぼちゃコロッケ", minutes: 30, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "豚ひき肉", match: ["ひき肉", "豚肉"], per: 40, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["蒸したかぼちゃを潰し、炒めたひき肉と玉ねぎを混ぜる", "丸めて衣をつけ、カラッと揚げる"], tip: "かぼちゃの甘みで子どもも食べやすいコロッケです" },
  { id: "ev-itokoni", title: "かぼちゃのいとこ煮", minutes: 25, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "ゆであずき缶", match: ["あずき缶", "小豆缶", "ゆであずき"], per: 0.3, unit: "缶" },
  ], steps: ["かぼちゃをだしで煮る", "ゆであずきを加えて甘く仕上げる"], tip: "冬至にかぼちゃと小豆を食べると風邪をひかないと言われます" },
  { id: "ev-yuzu-daikon", title: "ゆず大根", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 75, unit: "g" },
    { name: "ゆず", match: ["ゆず", "柚子"], per: 0.25, unit: "個" },
  ], steps: ["大根を薄切りにして塩もみする", "ゆずの皮と甘酢で和える"], tip: "冬至のゆず湯と同じく、香りでリラックスできます" },
  // ---- 節分 ----
  { id: "ev-ehomaki", title: "恵方巻", minutes: 25, genre: "和風", method: "和える", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "かにかま", match: ["かにかま", "カニカマ"], per: 2, unit: "本" },
    { name: "海苔", match: ["海苔", "のり"], per: 1, unit: "枚" },
  ], steps: ["卵は厚焼きにして細長く切る", "酢飯と具を海苔で巻く（ごはんは別に用意）"], tip: "7種類の具は七福神にちなんだ縁起担ぎです" },
  { id: "ev-iwashi", title: "いわしの塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "いわし", match: ["いわし", "鰯"], per: 2, unit: "尾" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["いわしに塩をして焼く", "大根おろしを添える"], tip: "いわしの匂いで鬼が近寄らないと言われます" },
  { id: "ev-gomokuni", title: "大豆の五目煮", minutes: 30, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "大豆", match: ["大豆"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
  ], steps: ["材料を小さく切ってだしで煮る", "醤油と砂糖で甘辛く仕上げる"], tip: "年の数だけ豆を食べる風習にちなんだ一品です" },
  { id: "ev-kenchin", title: "けんちん汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
  ], steps: ["根菜をごま油で炒めてからだしで煮る", "豆腐を崩し入れ、醤油で味を整える"], tip: "野菜たっぷりで体が温まります" },
  // ---- ひな祭り ----
  { id: "ev-chirashi", title: "ちらし寿司", minutes: 30, genre: "和風", method: "和える", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "えび", match: ["えび", "海老"], per: 3, unit: "尾" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "海苔", match: ["海苔", "のり"], per: 0.5, unit: "枚" },
  ], steps: ["酢飯を作り（ごはんは別に用意）、錦糸卵を作る", "茹でえびときゅうりを彩りよく散らす"], tip: "えびは「長生き」、れんこんは「見通しがよい」の縁起物です" },
  { id: "ev-hamaguri", title: "はまぐりのお吸い物", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "はまぐり", match: ["はまぐり", "蛤"], per: 2, unit: "個" },
    { name: "三つ葉", match: ["三つ葉", "みつば"], per: 2, unit: "本" },
  ], steps: ["砂抜きしたはまぐりを水から温める", "口が開いたら塩と醤油で薄く味付け"], tip: "はまぐりの貝殻は対でぴったり合うことから仲良しの象徴です" },
  { id: "ev-nanohana", title: "菜の花の辛子和え", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "菜の花", match: ["菜の花"], per: 0.5, unit: "束" },
  ], steps: ["菜の花をさっと茹でて水に取る", "醤油と練り辛子（子どもには抜き）で和える"], tip: "春の訪れを告げる野菜です" },
  { id: "ev-ichigo-kanten", title: "いちごミルク寒天", minutes: 15, genre: "和風", method: "冷やす", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "寒天", match: ["寒天", "粉寒天"], per: 1, unit: "g" },
  ], steps: ["寒天を煮溶かして牛乳と砂糖を混ぜる", "いちごを入れて冷やし固める"], tip: "ひし餅のピンク（桃の花）の色をイメージしたデザートです" },
  // ---- こどもの日 ----
  { id: "ev-takenoko-gohan", title: "たけのこごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "たけのこ", match: ["たけのこ", "筍"], per: 75, unit: "g" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["たけのこと油揚げをだしで軽く煮る", "炊きたてごはんに混ぜる（ごはんは別に用意）"], tip: "たけのこはすくすく伸びることから成長の象徴です" },
  { id: "ev-wakatake-ni", title: "若竹煮", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "たけのこ", match: ["たけのこ", "筍"], per: 75, unit: "g" },
    { name: "わかめ", match: ["わかめ"], per: 3, unit: "g" },
  ], steps: ["たけのこをだしで煮る", "わかめを加えてひと煮立ちさせる"], tip: "春の山と海の幸の組み合わせです" },
  { id: "ev-fruit-punch", title: "フルーツポンチ", minutes: 10, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "みかん缶", match: ["みかん缶", "みかん"], per: 0.3, unit: "缶" },
    { name: "バナナ", match: ["バナナ"], per: 0.5, unit: "本" },
    { name: "キウイ", match: ["キウイ"], per: 0.5, unit: "個" },
  ], steps: ["果物を一口大に切る", "缶のシロップとサイダーで和える"], tip: "こいのぼりの色みたいにカラフルに仕上げましょう" },
  // ---- 七夕 ----
  { id: "ev-tanabata-somen", title: "七夕そうめん", minutes: 15, genre: "和風", method: "ゆでる", course: "行事食", ingredients: [
    { name: "そうめん", match: ["そうめん", "素麺"], per: 1, unit: "束" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "オクラ", match: ["オクラ"], per: 2, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
  ], steps: ["そうめんをゆでて冷水でしめる", "星形に切った卵・オクラ・ハムをのせる"], tip: "そうめんの細い麺は天の川に見立てられています" },
  { id: "ev-hoshi-salad", title: "オクラとトマトの星サラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "オクラ", match: ["オクラ"], per: 2, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["オクラをゆでて輪切りにする（切り口が星形）", "トマトときゅうりとドレッシングで和える"], tip: "オクラの切り口の星が七夕らしい一品です" },
  { id: "ev-suika", title: "すいか", minutes: 5, genre: "和風", method: "切る", course: "デザート", ingredients: [
    { name: "すいか", match: ["すいか", "スイカ", "西瓜"], per: 0.125, unit: "玉" },
  ], steps: ["食べやすく切ってよく冷やす"], tip: "夏の水分補給にもなるデザートです" },
  // ---- お月見 ----
  { id: "ev-sanma", title: "さんまの塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "さんま", match: ["さんま", "秋刀魚"], per: 1, unit: "尾" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["さんまに塩をして焼く", "大根おろしとすだち（あれば）を添える"], tip: "秋の味覚の代表です" },
  { id: "ev-satoimo-ni", title: "里芋の煮っころがし", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
  ], steps: ["里芋の下ゆでをしてぬめりを取る", "だしと醤油・砂糖で転がしながら煮る"], tip: "お月見では里芋をお供えする風習から『芋名月』とも呼ばれます" },
  { id: "ev-tsukimi-jiru", title: "月見汁（里芋の味噌汁）", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "里芋", match: ["里芋"], per: 2, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["里芋とにんじんをだしで煮る", "味噌を溶いて仕上げる"], tip: "丸い里芋がお月さまみたいです" },
  { id: "ev-tsukimi-dango", title: "月見団子", minutes: 20, genre: "和風", method: "ゆでる", course: "デザート", ingredients: [
    { name: "白玉粉", match: ["白玉粉", "だんご粉"], per: 25, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["白玉粉を水でこねて丸める", "ゆでて浮いてきたら冷水に取り、きな粉や砂糖醤油で"], tip: "十五夜には15個お供えする風習があります" },
  { id: "ev-kuri-gohan", title: "栗ごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "栗", match: ["栗"], per: 4, unit: "個" },
    { name: "塩", match: ["塩"], per: 0.5, unit: "小さじ" },
  ], steps: ["栗の皮をむく", "ごはんと塩で炊き込む（ごはんは別に用意）"], tip: "秋の実りを味わうごはんです" },
  // ---- 敬老の日 ----
  { id: "ev-chawanmushi", title: "茶碗蒸し", minutes: 20, genre: "和風", method: "蒸す", course: "副菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 25, unit: "g" },
    { name: "しいたけ", match: ["しいたけ", "椎茸"], per: 1, unit: "個" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 1, unit: "切れ" },
  ], steps: ["卵液にだしを混ぜてこす", "具を入れて弱火で蒸す"], tip: "柔らかくて食べやすい、感謝を伝える一品です" },
  // ---- 母の日 ----
  { id: "ev-heart-hamburg", title: "ハートのハンバーグ", minutes: 25, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["材料をよくこねてハート形に整える", "両面焼いて中まで火を通す"], tip: "形で気持ちが伝わるハンバーグです" },
  { id: "ev-ichigo-yogurt", title: "いちごのヨーグルト和え", minutes: 5, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "ヨーグルト", match: ["ヨーグルト"], per: 75, unit: "g" },
  ], steps: ["いちごを半分に切る", "ヨーグルトと蜂蜜（あれば）で和える"], tip: "カーネーション色のピンクが母の日らしいデザートです" },
  // ---- 父の日 ----
  { id: "ev-hiyayakko", title: "冷奴", minutes: 5, genre: "和風", method: "切る", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["豆腐の水気を軽く切る", "ねぎとおろし生姜をのせて醤油をかける"], tip: "おつまみにもなる定番です" },
  { id: "ev-edamame", title: "枝豆", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", ingredients: [
    { name: "枝豆", match: ["枝豆"], per: 75, unit: "g" },
  ], steps: ["枝豆を塩もみしてゆでる", "塩を振って出す"], tip: "初夏の味覚です" },
  // ---- バレンタイン ----
  { id: "ev-beef-stew", title: "ビーフシチュー", minutes: 50, genre: "洋風", method: "煮る", course: "主菜", ingredients: [
    { name: "牛肉", match: ["牛肉"], per: 100, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "デミグラスソース", match: ["デミグラス"], per: 0.25, unit: "缶" },
  ], steps: ["牛肉と野菜を炒めて水で煮込む", "デミグラスソースを加えてさらに煮込む"], tip: "にんじんをハート形に抜くとバレンタインらしくなります" },
  { id: "ev-heart-salad", title: "トマトとチーズのサラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["トマトとチーズを重ねてレタスにのせる", "オリーブオイルと塩でシンプルに"], tip: "チーズをハート形に抜くのもおすすめです" },
  { id: "ev-choco-pudding", title: "チョコプリン", minutes: 15, genre: "洋風", method: "冷やす", course: "デザート", ingredients: [
    { name: "チョコレート", match: ["チョコレート", "チョコ"], per: 25, unit: "g" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["チョコレートを牛乳で溶かす", "卵を混ぜて蒸すか、ゼラチンで冷やし固める"], tip: "手作りチョコの定番デザートです" },
  // ---- ホワイトデー ----
  { id: "ev-carbonara", title: "カルボナーラ", minutes: 20, genre: "洋風", method: "ゆでる", course: "主食", ingredients: [
    { name: "スパゲッティ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "ベーコン", match: ["ベーコン"], per: 30, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
  ], steps: ["パスタをゆで、ベーコンを炒める", "火を止めて卵とチーズを絡める"], tip: "余熱で絡めると卵が固まりすぎません" },
  { id: "ev-caesar-salad", title: "シーザーサラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "レタス", match: ["レタス"], per: 40, unit: "g" },
    { name: "ベーコン", match: ["ベーコン"], per: 15, unit: "g" },
    { name: "チーズ", match: ["チーズ"], per: 10, unit: "g" },
  ], steps: ["ベーコンをカリッと焼く", "レタスにのせてドレッシングとチーズをかける"], tip: "白いドレッシングがホワイトデーらしいサラダです" },
  { id: "ev-pudding", title: "カスタードプリン", minutes: 20, genre: "洋風", method: "蒸す", course: "デザート", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["卵・牛乳・砂糖を混ぜてこす", "弱火で蒸して冷やす"], tip: "白くて甘いお返しの定番です" },
  // ---- 土用の丑の日 ----
  { id: "ev-unadon", title: "うなぎの蒲焼き丼", minutes: 15, genre: "和風", method: "焼く", course: "行事食", ingredients: [
    { name: "うなぎ", match: ["うなぎ", "鰻"], per: 0.5, unit: "尾" },
    { name: "海苔", match: ["海苔", "のり"], per: 0.5, unit: "枚" },
  ], steps: ["うなぎを温め直して香ばしく焼く", "ごはんにのせてタレをかける（ごはんは別に用意）"], tip: "「う」のつく食べ物で暑さを乗り切る風習です" },
  { id: "ev-shijimi-jiru", title: "しじみの味噌汁", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "しじみ", match: ["しじみ"], per: 50, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["砂抜きしたしじみを水から煮る", "味噌を溶いて仕上げる"], tip: "土用しじみは夏バテ防止の知恵です", note: "島根県の宍道湖（しんじこ）はしじみで有名。お味噌汁にして、湖の恵みをいただく郷土の味だよ。" },
  { id: "ev-sumono", title: "きゅうりとわかめの酢の物", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "わかめ", match: ["わかめ"], per: 3, unit: "g" },
  ], steps: ["きゅうりを薄切りにして塩もみする", "わかめと甘酢で和える"], tip: "さっぱりして食欲がない日にも食べやすい一品です" },
  // ---- 七五三 ----
  { id: "ev-sekihan", title: "赤飯", minutes: 15, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "小豆", match: ["小豆", "あずき"], per: 25, unit: "g" },
    { name: "もち米", match: ["もち米"], per: 0.5, unit: "合" },
  ], steps: ["小豆をゆでて煮汁ごと冷ます", "もち米と一緒に炊く"], tip: "赤い色は魔除けとお祝いの色です" },
  { id: "ev-tai-shioyaki", title: "鯛の塩焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鯛", match: ["鯛", "たい"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["鯛に塩をして焼く", "大根おろしを添える"], tip: "「めでたい」の鯛はお祝いの席の主役です" },
  { id: "ev-chikuzenni", title: "筑前煮", minutes: 35, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 50, unit: "g" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "れんこん", match: ["れんこん", "蓮根"], per: 40, unit: "g" },
  ], steps: ["材料を炒めてだしで煮る", "醤油と砂糖で甘辛く仕上げる"], tip: "たくさんの具材が「家族の結びつき」を表します" },
  // ---- 年越し ----
  { id: "ev-toshikoshi-soba", title: "年越しそば", minutes: 15, genre: "和風", method: "ゆでる", course: "行事食", ingredients: [
    { name: "そば", match: ["そば", "蕎麦"], per: 1, unit: "束" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["そばをゆでて温かいつゆに入れる", "かまぼことねぎ、月見卵をのせる"], tip: "細く長いそばは「長生き」の願い、切れやすさは「今年の苦労を断ち切る」意味です" },
  { id: "ev-tempura", title: "えびとかぼちゃの天ぷら", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 50, unit: "g" },
    { name: "天ぷら粉", match: ["天ぷら粉", "小麦粉"], per: 2, unit: "大さじ" },
  ], steps: ["えびとかぼちゃに薄く衣をつける", "カラッと揚げて塩で"], tip: "年越しそばの名脇役です" },
  // ---- お花見 ----
  { id: "ev-sanshoku-dango", title: "三色団子", minutes: 20, genre: "和風", method: "ゆでる", course: "デザート", ingredients: [
    { name: "白玉粉", match: ["白玉粉", "だんご粉"], per: 25, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["白玉粉をこねて3色（白・ピンク・緑）に分けて丸める", "ゆでて串に刺す"], tip: "ピンクは桜、白は雪、緑は新芽で春を表します" },
  // ---- 夏の旬 ----
  { id: "ev-hiyashi-chuka", title: "冷やし中華", minutes: 20, genre: "中華", method: "ゆでる", course: "主食", ingredients: [
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ハム", match: ["ハム"], per: 20, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
  ], steps: ["麺をゆでて冷水でしめる", "錦糸卵と細切りの具を彩りよくのせ、タレをかける"], tip: "夏の定番。具を並べるのは子どもにもお手伝いできます" },
  { id: "ev-goya-champuru", title: "ゴーヤチャンプルー", minutes: 15, genre: "和風", method: "炒める", course: "主菜", ingredients: [
    { name: "ゴーヤ", match: ["ゴーヤ", "にがうり"], per: 0.5, unit: "本" },
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "豚肉", match: ["豚肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
  ], steps: ["ゴーヤは薄切りにして塩もみする", "豆腐と豚肉と炒め、卵でとじる"], tip: "沖縄の夏の元気ごはんです", note: "沖縄の家庭料理。『チャンプルー』は沖縄の言葉で『混ぜこぜ』という意味だよ。" },
  { id: "ev-tomorokoshi", title: "ゆでとうもろこし", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", ingredients: [
    { name: "とうもろこし", match: ["とうもろこし", "コーン"], per: 1, unit: "本" },
  ], steps: ["皮を薄く残して塩ゆでする", "熱いうちに塩を振る"], tip: "夏祭りの屋台の味です" },
  // ---- 秋の味覚 ----
  { id: "ev-kinoko-gohan", title: "きのこごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "しめじ", match: ["しめじ"], per: 0.5, unit: "パック" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["きのこをほぐしてだしで軽く煮る", "炊きたてごはんに混ぜる（ごはんは別に用意）"], tip: "秋の香りを味わうごはんです" },
  { id: "ev-satsumaimo-ni", title: "さつまいもの甘煮", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 100, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["さつまいもを輪切りにして水にさらす", "砂糖とレモン（あれば）で柔らかく煮る"], tip: "お弁当にも入る秋の甘い一品です" },
  // ---- 大幅追加（2026-11-11「レパートリー目標1500品」に向けた固定レシピ積み上げ） ----
  // おせち・年末年始
  { id: "ev-tataki-gobou", title: "たたきごぼう", minutes: 15, course: "副菜", genre: "和風", method: "和える", note: "おせちの一つ。「ごぼうをたたく＝想いを込めて叩く」という語呂で、細く長く丈夫に育つよう願う料理。", ingredients: [
    { name: "ごぼう", match: ["ごぼう"], per: 0.5, unit: "本" },
    { name: "ごま", match: ["ごま"], per: 1, unit: "大さじ" },
  ], steps: ["ごぼうをたたいて割り、酢水で茹でる", "ごまだれで和える"], tip: "ごぼうはたたくと味が入りやすくなります" },
  { id: "ev-tazukuri", title: "田作り（ごまめ）", minutes: 10, course: "副菜", genre: "和風", method: "炒める", note: "おせちの一つ。小さなイワシが豊作の肥料になったことから「田作り」と呼ばれ、五穀豊穣を願う縁起物。カリカリに仕上げるのがコツ。", ingredients: [
    { name: "いわし", match: ["いわし", "かたくちいわし", "田作り"], per: 10, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["小魚をから炒りする", "砂糖・醤油の蜜を絡める"], tip: "弱火で焦がさないようにから炒りします" },
  { id: "ev-matsukaze", title: "松風焼き", minutes: 25, course: "主菜", genre: "和風", method: "焼く", note: "おせちの一つ。表面だけにごまを振り、裏には何もないことから「裏のない＝正直な一年に」という願いを込めたとも言われる、鶏ひき肉の焼き物。", ingredients: [
    { name: "鶏ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "味噌", match: ["味噌", "みそ"], per: 0.5, unit: "大さじ" },
    { name: "ごま", match: ["ごま"], per: 0.5, unit: "大さじ" },
  ], steps: ["ひき肉に卵と味噌を混ぜて平らに伸ばす", "ごまを振って焼き、切り分ける"], tip: "表面にごまをたっぷり振ると松風らしくなります" },
  // 節分
  { id: "ev-fukumame-gohan", title: "福豆ごはん", minutes: 10, course: "主食", genre: "和風", method: "煮る", note: "節分でまいた福豆（炒り大豆）を無駄なく使うごはん。豆の香ばしさがごはんに移って、子どもにも人気。余った豆のリメイクにぴったり。", ingredients: [
    { name: "米", match: ["米", "ごはん"], per: 75, unit: "g" },
    { name: "大豆", match: ["大豆", "炒り豆"], per: 15, unit: "g" },
    { name: "塩昆布", match: ["塩昆布", "昆布"], per: 3, unit: "g" },
  ], steps: ["米と福豆、塩昆布を一緒に炊く", "蒸らして混ぜる"], tip: "福豆がなければ炒り大豆でも作れます" },
  { id: "ev-iwashi-tsumire", title: "いわしのつみれ汁", minutes: 20, course: "汁物", genre: "和風", method: "スープ", note: "節分にいわしを食べるのは、焼く煙とにおいで鬼（邪気）を寄せつけないという言い伝えから。つみれにすると骨が気にならず子どもも食べやすい。", ingredients: [
    { name: "いわし", match: ["いわし", "イワシ"], per: 1, unit: "尾" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["いわしをたたいて生姜と片栗粉でつみれにする", "だしに野菜とつみれを入れて味噌で仕上げる"], tip: "つみれはスプーンで落とすと簡単です" },
  { id: "ev-daizu-konbu-ni", title: "大豆と昆布の煮物", minutes: 25, course: "副菜", genre: "和風", method: "煮る", note: "節分のあとの福豆や戻した大豆で作る定番の煮物。「豆＝まめ（健康）に暮らせるように」という願いも込められた、栄養たっぷりの常備菜。", ingredients: [
    { name: "大豆", match: ["大豆"], per: 30, unit: "g" },
    { name: "昆布", match: ["昆布"], per: 5, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["大豆を水で戻す", "昆布とにんじんと一緒に甘辛く煮る"], tip: "一晩置くと味がよくなじみます" },
  { id: "ev-fukucha", title: "福茶", minutes: 5, course: "汁物", genre: "和風", method: "その他", note: "節分に飲む縁起のいいお茶。福豆3粒・梅干し・塩昆布にお湯を注ぐだけ。豆まきのあとのほっと一息に。", ingredients: [
    { name: "大豆", match: ["大豆", "炒り豆"], per: 3, unit: "粒" },
    { name: "梅干し", match: ["梅干し"], per: 0.5, unit: "個" },
    { name: "昆布", match: ["昆布", "塩昆布"], per: 2, unit: "g" },
  ], steps: ["湯のみに福豆・梅干し・昆布を入れる", "熱湯を注いで少し蒸らす"], tip: "豆は年の数だけ入れる人もいます" },
  // バレンタイン
  { id: "ev-gateau", title: "ガトーショコラ", minutes: 40, course: "デザート", genre: "洋風", method: "焼く", note: "フランス生まれの濃厚なチョコレートケーキ。しっとり焼き上げて、冷やすとさらに濃厚に。バレンタインの手作りの定番。", ingredients: [
    { name: "チョコレート", match: ["チョコレート", "チョコ"], per: 25, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "バター", match: ["バター"], per: 15, unit: "g" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
  ], steps: ["チョコとバターを溶かし、卵と砂糖を混ぜる", "型に入れて170℃で焼く"], tip: "冷蔵庫で冷やすとしっとり濃厚になります" },
  { id: "ev-heart-croquette", title: "ハートのコロッケ", minutes: 30, course: "主菜", genre: "洋風", method: "揚げる", note: "いつものコロッケをハート型に成形した、バレンタイン仕様の一品。形が変わるだけで食卓がぐっと華やかになる。", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "ひき肉", match: ["ひき肉"], per: 40, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["じゃがいものたねをハート型に成形する", "衣をつけてカラッと揚げる"], tip: "少し平たく成形すると揚げやすいです" },
  { id: "ev-tomato-cream-pasta", title: "トマトクリームパスタ", minutes: 20, course: "主食", genre: "洋風", method: "ゆでる", note: "ピンク色のソースがバレンタインにぴったり。トマトの酸味と生クリームのコクが一緒になった、特別な日のパスタ。", ingredients: [
    { name: "パスタ", match: ["スパゲッティ", "パスタ"], per: 80, unit: "g" },
    { name: "えび", match: ["えび", "海老"], per: 3, unit: "尾" },
    { name: "トマト缶", match: ["トマト缶", "トマト"], per: 0.25, unit: "缶" },
    { name: "牛乳", match: ["牛乳"], per: 50, unit: "mL" },
  ], steps: ["えびを炒めてトマト缶で煮る", "牛乳を加えてピンクのソースにし、パスタを絡める"], tip: "ソースがピンクになったら火を止めます" },
  { id: "ev-ichigo-tiramisu", title: "いちごのティラミス風", minutes: 15, course: "デザート", genre: "洋風", method: "冷やす", note: "イタリアのティラミスをいちごでアレンジ。コーヒーの代わりにいちごジャムを使えば、子どもも一緒に楽しめる。", ingredients: [
    { name: "いちご", match: ["いちご", "イチゴ"], per: 3, unit: "粒" },
    { name: "クリームチーズ", match: ["クリームチーズ", "チーズ"], per: 30, unit: "g" },
    { name: "いちごジャム", match: ["いちごジャム", "ジャム"], per: 1, unit: "大さじ" },
    { name: "ビスケット", match: ["ビスケット", "クッキー"], per: 2, unit: "枚" },
  ], steps: ["クリームチーズとヨーグルトを滑らかに混ぜる", "ビスケット、クリーム、いちごを重ねて冷やす"], tip: "冷やすほど味がなじみます" },
  // ひな祭り
  { id: "ev-sanshoku-jelly", title: "三色ゼリー", minutes: 20, course: "デザート", genre: "洋風", method: "冷やす", note: "ひな祭りの三色（桃・白・緑）をゼリーで表現。緑はキウイ、白は牛乳、ピンクはいちご。ひし餅の代わりに冷たくてかわいいデザート。", ingredients: [
    { name: "いちご", match: ["いちご", "イチゴ"], per: 2, unit: "粒" },
    { name: "牛乳", match: ["牛乳"], per: 50, unit: "mL" },
    { name: "キウイ", match: ["キウイ"], per: 0.5, unit: "個" },
    { name: "寒天", match: ["寒天", "ゼラチン"], per: 1, unit: "g" },
  ], steps: ["色ごとの液を作って順に固める", "一番上の層にいちごを飾る"], tip: "層ごとにしっかり固めてから次を注ぎます" },
  { id: "ev-amazake", title: "甘酒", minutes: 10, course: "汁物", genre: "和風", method: "その他", note: "ひな祭りに飲む白酒の代わりとして、子どもには甘酒を。「飲む点滴」とも言われるほど栄養たっぷりで、ほんのり甘い発酵飲料。", ingredients: [
    { name: "酒粕", match: ["酒粕", "米麹", "麹"], per: 20, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 2, unit: "g" },
  ], steps: ["酒粕を水で溶きのばして温める", "砂糖と生姜で味を整える"], tip: "生姜を入れると体が温まります" },
  { id: "ev-ebi-broccoli-salad", title: "えびとブロッコリーのサラダ", minutes: 15, course: "副菜", genre: "洋風", method: "サラダ", note: "ピンクのえびと緑のブロッコリーで、ひな祭りらしい色合いのサラダ。えびは「長生き」の縁起物としても行事食に登場する。", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 3, unit: "尾" },
    { name: "ブロッコリー", match: ["ブロッコリー"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1, unit: "大さじ" },
  ], steps: ["えびとブロッコリー、卵をゆでる", "マヨネーズで和える"], tip: "えびは茹で過ぎないのがプリプリのコツです" },
  // ホワイトデー
  { id: "ev-cream-stew", title: "クリームシチュー", minutes: 30, course: "主菜", genre: "洋風", method: "煮る", note: "白いシチューでホワイトデーらしく。牛乳とバターの優しい味わいで、家族みんなが喜ぶ定番の煮込み。", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 150, unit: "mL" },
    { name: "ブロッコリー", match: ["ブロッコリー"], per: 30, unit: "g" },
  ], steps: ["鶏肉と野菜をバターで炒める", "水と牛乳で煮て、白く仕上げる"], tip: "牛乳は最後に加えると分離しにくいです" },
  { id: "ev-white-gratin", title: "ホワイトグラタン", minutes: 30, course: "主菜", genre: "洋風", method: "焼く", note: "白いホワイトソースとチーズのグラタン。ホワイトデーの「白」にちなんだ、あつあつとろとろの一品。", ingredients: [
    { name: "マカロニ", match: ["マカロニ", "パスタ"], per: 40, unit: "g" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 50, unit: "g" },
    { name: "牛乳", match: ["牛乳"], per: 150, unit: "mL" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
    { name: "しめじ", match: ["しめじ"], per: 0.25, unit: "パック" },
  ], steps: ["ホワイトソースを作り具材と和える", "チーズをのせてこんがり焼く"], tip: "焼き色がつくまでしっかり焼きます" },
  { id: "ev-white-choco-mousse", title: "ホワイトチョコのムース", minutes: 15, course: "デザート", genre: "洋風", method: "冷やす", note: "ホワイトチョコレートを使った、ふんわり軽いムース。お返しスイーツの定番・ホワイトチョコをアレンジ。", ingredients: [
    { name: "ホワイトチョコ", match: ["ホワイトチョコ", "チョコレート", "チョコ"], per: 20, unit: "g" },
    { name: "牛乳", match: ["牛乳"], per: 50, unit: "mL" },
    { name: "いちご", match: ["いちご", "イチゴ"], per: 2, unit: "粒" },
  ], steps: ["ホワイトチョコを牛乳で溶かす", "冷やして固め、いちごを飾る"], tip: "いちごを飾ると華やかになります" },
  // お花見
  { id: "ev-inarizushi", title: "いなり寿司", minutes: 20, course: "主食", genre: "和風", method: "その他", note: "甘い油揚げに酢飯を詰めた、手でつまめる行楽の定番。お花見弁当にもぴったりで、子どもたちも大好き。", ingredients: [
    { name: "油揚げ", match: ["油揚げ"], per: 2, unit: "枚" },
    { name: "米", match: ["米", "ごはん"], per: 60, unit: "g" },
    { name: "酢", match: ["酢"], per: 1, unit: "大さじ" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.2, unit: "本" },
  ], steps: ["油揚げを甘辛く煮て半分に切る", "酢飯を詰める"], tip: "油揚げは熱いうちに酢飯を詰めます" },
  { id: "ev-haru-coleslaw", title: "春キャベツのコールスロー", minutes: 10, course: "副菜", genre: "洋風", method: "サラダ", note: "春キャベツは柔らかくて甘いのが特徴。お花見の時期の旬野菜を、さっぱりしたサラダで楽しむ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "コーン缶", match: ["コーン缶", "とうもろこし"], per: 0.25, unit: "缶" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1.5, unit: "大さじ" },
  ], steps: ["キャベツとにんじんを千切りにして塩もみする", "コーンとマヨネーズ・酢で和える"], tip: "春キャベツは塩もみしすぎないのがコツです" },
  // 母の日
  { id: "ev-french-toast", title: "フレンチトースト", minutes: 15, course: "主食", genre: "洋風", method: "焼く", note: "母の日の朝食やブランチにぴったりの甘いトースト。ふわふわに焼いて、いちごや粉砂糖でかわいく仕上げる。", ingredients: [
    { name: "食パン", match: ["食パン", "パン"], per: 1, unit: "枚" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 50, unit: "mL" },
    { name: "いちご", match: ["いちご", "イチゴ"], per: 2, unit: "粒" },
  ], steps: ["卵と牛乳、砂糖の液にパンを浸す", "バターで両面をこんがり焼く"], tip: "一晩浸すと中までしっとりします" },
  { id: "ev-salmon-marine", title: "サーモンのマリネ", minutes: 15, course: "副菜", genre: "洋風", method: "サラダ", note: "ピンク色のサーモンがカーネーションのように華やか。母の日の食卓を彩る、前菜向きの一品。", ingredients: [
    { name: "鮭", match: ["鮭", "サーモン", "さけ"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["鮭と薄切り玉ねぎをマリネ液に漬ける", "冷蔵庫で30分なじませる"], tip: "玉ねぎは水にさらして辛みを抜きます" },
  { id: "ev-ichigo-milk", title: "いちごミルク", minutes: 5, course: "デザート", genre: "洋風", method: "冷やす", note: "つぶしたいちごと牛乳の、かわいいピンクのドリンク。子どもと一緒に作れる簡単さも魅力。", ingredients: [
    { name: "いちご", match: ["いちご", "イチゴ"], per: 4, unit: "粒" },
    { name: "牛乳", match: ["牛乳"], per: 150, unit: "mL" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["いちごをフォークでつぶす", "牛乳と砂糖を注いで混ぜる"], tip: "いちごは完熟のものが甘くておすすめです" },
  // こどもの日
  { id: "ev-kashiwa-mochi", title: "柏餅風おやつ", minutes: 20, course: "デザート", genre: "和風", method: "蒸す", note: "柏の葉は新芽が出るまで古い葉が落ちないことから「子孫繁栄」の縁起物。家では白玉粉のもちにあんこを包んで、柏餅風に。", ingredients: [
    { name: "白玉粉", match: ["白玉粉"], per: 30, unit: "g" },
    { name: "あんこ", match: ["あんこ", "ゆであずき缶", "あずき"], per: 2, unit: "大さじ" },
  ], steps: ["白玉粉をこねて平たく伸ばす", "あんこを包んで蒸す"], tip: "柏の葉があれば巻くと本物らしくなります" },
  { id: "ev-koinobori-sand", title: "こいのぼりサンドイッチ", minutes: 15, course: "主食", genre: "洋風", method: "その他", note: "サンドイッチをこいのぼりの形に切って、うろこをきゅうりやハムで表現。作るのも食べるのも楽しい行事食。", ingredients: [
    { name: "食パン", match: ["食パン", "パン"], per: 1, unit: "枚" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 1, unit: "枚" },
  ], steps: ["卵サラダをパンではさむ", "魚の形に切り、うろこと目を飾る"], tip: "目は海苔やチーズで作ります" },
  { id: "ev-yasai-stick", title: "野菜スティック", minutes: 10, course: "副菜", genre: "洋風", method: "サラダ", note: "色とりどりの野菜をスティック状に切って、こいのぼりの吹き流しに見立てた一品。ディップで野菜が進む。", ingredients: [
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "大根", match: ["大根", "だいこん"], per: 40, unit: "g" },
    { name: "マヨネーズ", match: ["マヨネーズ"], per: 1.5, unit: "大さじ" },
    { name: "味噌", match: ["味噌", "みそ"], per: 0.5, unit: "大さじ" },
  ], steps: ["野菜をスティック状に切る", "味噌マヨディップを添える"], tip: "野菜は色の組み合わせを楽しく" },
  // 父の日
  { id: "ev-garlic-rice", title: "ガーリックライス", minutes: 15, course: "主食", genre: "洋風", method: "炒める", note: "にんにくの香りが食欲をそそる、スタミナ系のごはんもの。お父さんの好きな牛肉と合わせても。", ingredients: [
    { name: "米", match: ["米", "ごはん"], per: 100, unit: "g" },
    { name: "にんにく", match: ["にんにく"], per: 1, unit: "かけ" },
    { name: "牛肉", match: ["牛肉"], per: 40, unit: "g" },
    { name: "バター", match: ["バター"], per: 5, unit: "g" },
  ], steps: ["にんにくと牛肉を炒める", "ごはんを加えて醤油で香ばしく炒める"], tip: "にんにくは焦がさないように香りを出します" },
  { id: "ev-nasu-miso-itame", title: "なすの味噌炒め", minutes: 15, course: "主菜", genre: "和風", method: "炒める", note: "とろとろのなすと甘辛い味噌がごはんによく合う。お父さんのごはんが進む、しっかり味の一品。", ingredients: [
    { name: "なす", match: ["なす"], per: 1.5, unit: "本" },
    { name: "豚肉", match: ["豚肉"], per: 50, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
  ], steps: ["なすを炒めて一度取り出す", "豚肉とピーマンを炒め、なすと味噌だれを戻す"], tip: "なすは吸油が多いので少し多めの油で炒めます" },
  { id: "ev-stamina-natto", title: "スタミナ納豆", minutes: 10, course: "副菜", genre: "和風", method: "和える", note: "鳥取県の給食で生まれた人気メニュー。ひき肉と納豆の組み合わせで、ごはんがどんどん進むスタミナ副菜。", ingredients: [
    { name: "納豆", match: ["納豆"], per: 1, unit: "パック" },
    { name: "ひき肉", match: ["ひき肉"], per: 40, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "にんにく", match: ["にんにく"], per: 0.5, unit: "かけ" },
  ], steps: ["ひき肉をにんにくと炒めて醤油で味付けする", "納豆とねぎを混ぜ合わせる"], tip: "温泉卵をのせても美味しいです" },
  // 七夕
  { id: "ev-amanogawa-jelly", title: "天の川ゼリー", minutes: 20, course: "デザート", genre: "洋風", method: "冷やす", note: "青いゼリーに星形のフルーツを浮かべて天の川に見立てた、七夕ならではの涼しいデザート。バタフライピーがなければ食紅やかき氷シロップでも青くできる。", ingredients: [
    { name: "みかん缶", match: ["みかん缶", "みかん"], per: 0.25, unit: "缶" },
    { name: "寒天", match: ["寒天", "ゼラチン"], per: 1, unit: "g" },
    { name: "キウイ", match: ["キウイ"], per: 0.5, unit: "個" },
  ], steps: ["青いゼリー液を作って冷やし固める", "星形に抜いたフルーツをのせる"], tip: "星はクッキー型で抜くと簡単です" },
  { id: "ev-natsuyasai-marine", title: "夏野菜のマリネ", minutes: 20, course: "副菜", genre: "洋風", method: "サラダ", note: "織姫と彦星の再会を祝う七夕に、カラフルな夏野菜を星の形に抜いて散らした、見た目も楽しいマリネ。", ingredients: [
    { name: "パプリカ", match: ["パプリカ"], per: 0.5, unit: "個" },
    { name: "ズッキーニ", match: ["ズッキーニ"], per: 0.5, unit: "本" },
    { name: "なす", match: ["なす"], per: 0.5, unit: "本" },
    { name: "オリーブオイル", match: ["オリーブオイル", "オリーブ油", "サラダ油"], per: 1, unit: "大さじ" },
  ], steps: ["野菜を焼いてマリネ液に漬ける", "星形に抜いたパプリカを飾る"], tip: "冷やすほど味がなじみます" },
  { id: "ev-hoshi-pizza", title: "星型ピザトースト", minutes: 10, course: "主食", genre: "洋風", method: "焼く", note: "チーズを星形に抜いてのせたピザトースト。七夕の朝食や軽食に、子どもと一緒に星を飾る楽しみも。", ingredients: [
    { name: "食パン", match: ["食パン", "パン"], per: 1, unit: "枚" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
    { name: "コーン缶", match: ["コーン缶", "とうもろこし"], per: 0.2, unit: "缶" },
    { name: "ケチャップ", match: ["ケチャップ"], per: 1, unit: "大さじ" },
  ], steps: ["パンにケチャップを塗り具をのせる", "星形のチーズをのせてトーストする"], tip: "チーズの星はクッキー型で抜くと簡単です" },
  { id: "ev-suika-sherbet", title: "すいかのシャーベット", minutes: 10, course: "デザート", genre: "洋風", method: "冷やす", note: "七夕の夜に食べたい、夏の味覚すいかのシャーベット。種を取り除いて凍らせるだけの簡単デザート。", ingredients: [
    { name: "すいか", match: ["すいか", "スイカ"], per: 100, unit: "g" },
    { name: "はちみつ", match: ["はちみつ"], per: 1, unit: "小さじ" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["すいかを潰してはちみつとレモン汁を混ぜる", "冷凍庫で凍らせ、途中で何回か混ぜる"], tip: "凍らせる途中で混ぜるとシャリシャリ感が出ます" },
  // 土用の丑
  { id: "ev-uzaku", title: "うざく（うなぎときゅうりの酢の物）", minutes: 10, course: "副菜", genre: "和風", method: "和える", note: "うなぎの蒲焼きときゅうりの酢の物。土用の丑の日に、こってり蒲焼きとさっぱり酢の物の組み合わせで食が進む。", ingredients: [
    { name: "うなぎ", match: ["うなぎ", "蒲焼き"], per: 0.25, unit: "枚" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "酢", match: ["酢"], per: 1, unit: "大さじ" },
  ], steps: ["きゅうりを塩もみする", "うなぎを温めて切り、甘酢で和える"], tip: "うなぎは温めてから和えると香ばしいです" },
  { id: "ev-umaki", title: "う巻き（うなぎ入り卵焼き）", minutes: 15, course: "副菜", genre: "和風", method: "焼く", note: "だし巻き卵にうなぎを巻いた「う巻き」。うなぎが少量でも豪華に見えるので、家族で分け合う丑の日にぴったり。", ingredients: [
    { name: "うなぎ", match: ["うなぎ", "蒲焼き"], per: 0.25, unit: "枚" },
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
  ], steps: ["うなぎを温めて細く切る", "だし入りの卵液で巻いていく"], tip: "うなぎを芯にして巻くと切り口がきれいです" },
  { id: "ev-doyo-mochi", title: "土用餅", minutes: 10, course: "デザート", genre: "和風", method: "その他", note: "土用の時期に無病息災を願って食べるあんころ餅。暑い時期に力をつけるための、昔ながらの知恵のおやつ。", ingredients: [
    { name: "あんこ", match: ["あんこ", "ゆであずき缶", "あずき"], per: 3, unit: "大さじ" },
    { name: "白玉粉", match: ["白玉粉"], per: 30, unit: "g" },
  ], steps: ["白玉を茹でる", "あんこをたっぷり絡める"], tip: "あんこは温かい白玉にたっぷりと" },
  { id: "ev-ume-kyuri", title: "たたききゅうりの梅和え", minutes: 5, course: "副菜", genre: "和風", method: "和える", note: "「土用」には梅干しなど酸味のあるもので食欲を保つ工夫も。たたききゅうりと梅のさっぱりした一品。", ingredients: [
    { name: "きゅうり", match: ["きゅうり"], per: 1, unit: "本" },
    { name: "梅干し", match: ["梅干し"], per: 1, unit: "個" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["きゅうりをたたいて割る", "梅肉と大葉、ごま油少しで和える"], tip: "たたくと味がよく絡みます" },
  // 夏休み
  { id: "ev-natsuyasai-curry", title: "夏野菜カレー", minutes: 25, course: "主食", genre: "洋風", method: "煮る", note: "なす・トマト・ピーマンなど夏野菜をたっぷりのせたカレー。夏休みのランチの定番で、野菜の彩りも楽しい。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 60, unit: "g" },
    { name: "なす", match: ["なす"], per: 1, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "カレールー", match: ["カレールー", "ルー"], per: 1, unit: "かけ" },
  ], steps: ["ひき肉と野菜を炒めてカレーを煮る", "素揚げした夏野菜を上にのせ、ごはんに添える（ごはんは別に用意）"], tip: "夏野菜は素揚げしてのせると彩りがよいです" },
  { id: "ev-yaki-tomorokoshi", title: "焼きとうもろこし", minutes: 10, course: "副菜", genre: "和風", method: "焼く", note: "夏祭りの屋台の味。醤油を塗って香ばしく焼いたとうもろこしは、夏休みのおやつにもなる。", ingredients: [
    { name: "とうもろこし", match: ["とうもろこし", "コーン缶"], per: 0.5, unit: "本" },
    { name: "バター", match: ["バター"], per: 5, unit: "g" },
  ], steps: ["とうもろこしを茹でる（またはレンジ加熱）", "醤油とバターを塗って焼き目をつける"], tip: "焼き網やフライパンで香ばしく焼きます" },
  { id: "ev-edamame-pepe", title: "枝豆ペペロンチーノ風", minutes: 10, course: "副菜", genre: "洋風", method: "炒める", note: "夏の食卓の定番・枝豆をイタリアンにアレンジ。にんにくとオリーブオイルで炒めるだけで、おつまみにも副菜にもなる。", ingredients: [
    { name: "枝豆", match: ["枝豆"], per: 75, unit: "g" },
    { name: "にんにく", match: ["にんにく"], per: 0.5, unit: "かけ" },
    { name: "オリーブオイル", match: ["オリーブオイル", "オリーブ油", "サラダ油"], per: 1, unit: "大さじ" },
  ], steps: ["枝豆を茹でる", "にんにくオイルで炒める（辛みは大人の分だけ後がけ）"], tip: "さやごと炒めるので手でつまんで食べます" },
  { id: "ev-natsuyasai-agebitashi", title: "夏野菜の揚げびたし", minutes: 20, course: "副菜", genre: "和風", method: "揚げる", note: "なす・ピーマン・かぼちゃを素揚げしてだしに浸ける、作り置きにも便利な夏の常備菜。冷やしてもおいしい。", ingredients: [
    { name: "なす", match: ["なす"], per: 1, unit: "本" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 50, unit: "g" },
  ], steps: ["野菜を素揚げする", "だし・醤油・みりんの汁に浸ける"], tip: "冷蔵庫で冷やしても美味しいです" },
  // 敬老の日
  { id: "ev-eringi-gohan", title: "きのこと鮭の炊き込みごはん", minutes: 15, course: "主食", genre: "和風", method: "煮る", note: "秋のきのこと鮭で、おじいちゃんおばあちゃんにも喜ばれる上品な炊き込みごはん。長寿を祝う敬老の日に。", ingredients: [
    { name: "米", match: ["米", "ごはん"], per: 75, unit: "g" },
    { name: "鮭", match: ["鮭", "サーモン", "さけ"], per: 40, unit: "g" },
    { name: "しめじ", match: ["しめじ"], per: 0.25, unit: "パック" },
    { name: "えのき", match: ["えのき"], per: 0.25, unit: "袋" },
  ], steps: ["材料を米と一緒に炊飯器に入れる", "炊き上がったら鮭をほぐして混ぜる"], tip: "鮭の皮は炊き上がりに取り除きます" },
  { id: "ev-kabocha-nimono", title: "かぼちゃの煮物", minutes: 20, course: "副菜", genre: "和風", method: "煮る", note: "ほくほく甘いかぼちゃの煮物は、世代を超えて愛される家庭の味。敬老の日には少し上品に、薄味に仕上げる。", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 0.125, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["かぼちゃを一口大に切る", "だし・砂糖・醤油で柔らかく煮る"], tip: "煮崩れしないよう弱火でコトコト煮ます" },
  // お月見
  { id: "ev-tsukimi-udon", title: "月見うどん", minutes: 15, course: "主食", genre: "和風", method: "煮る", note: "卵の黄身を月に見立てたうどん。お月見の夜に温かい月見うどんで、家族で月を眺めながら。", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 10, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["うどんを温かいだしで煮る", "卵をそっと落とし、半熟で火を止める"], tip: "卵は半熟のうちに火を止めます" },
  { id: "ev-tsukimi-burger", title: "月見バーガー風", minutes: 20, course: "主食", genre: "洋風", method: "焼く", note: "秋の風物詩になった月見バーガーを家庭で再現。目玉焼きの黄身が満月みたいで楽しい。", ingredients: [
    { name: "バンズ", match: ["バンズ", "ロールパン", "パン"], per: 1, unit: "個" },
    { name: "ひき肉", match: ["ひき肉"], per: 60, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "レタス", match: ["レタス"], per: 1, unit: "枚" },
    { name: "チーズ", match: ["チーズ"], per: 10, unit: "g" },
  ], steps: ["パティを焼く", "目玉焼きとチーズをのせてバンズで挟む"], tip: "黄身を月に見立てて真ん中にのせます" },
  { id: "ev-nashi", title: "梨のコンポート", minutes: 20, course: "デザート", genre: "洋風", method: "煮る", note: "秋の味覚・梨を白ワイン風（水と砂糖）で煮た上品なデザート。お月見の供物にもなる梨の、ひと味違う楽しみ方。", ingredients: [
    { name: "梨", match: ["梨"], per: 0.5, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["梨をくし形に切る", "砂糖水とレモンで透き通るまで煮て冷やす"], tip: "冷やして食べると上品な甘さです" },
  // 秋の味覚
  { id: "ev-yakiimo", title: "焼き芋", minutes: 60, course: "デザート", genre: "和風", method: "焼く", note: "低温でじっくり焼くことで甘さが引き出される、秋の定番おやつ。オーブンや炊飯器でも石焼き芋のように仕上がる。", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 0.5, unit: "本" },
  ], steps: ["さつまいもを洗ってホイルで包む", "160℃でゆっくり焼く"], tip: "低温でゆっくり焼くほど甘くなります" },
  { id: "ev-kinoko-hoiru", title: "きのこのホイル焼き", minutes: 15, course: "副菜", genre: "和風", method: "蒸す", note: "旬のきのこをバターと一緒にホイルで包む蒸し焼き。開けた瞬間の香りが秋そのもの。", ingredients: [
    { name: "しめじ", match: ["しめじ"], per: 0.5, unit: "パック" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "えのき", match: ["えのき"], per: 0.5, unit: "袋" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
  ], steps: ["きのこをホイルにのせ、バターと塩を振る", "閉じて10分ほど蒸し焼きにする"], tip: "開けたときの香りもごちそうです" },
  { id: "ev-kaki-shiraae", title: "柿の白和え", minutes: 15, course: "副菜", genre: "和風", method: "和える", note: "柿の甘さと豆腐の白和え衣が合う、秋の上品な和え物。柿が余ったときにもおすすめ。", ingredients: [
    { name: "柿", match: ["柿"], per: 0.5, unit: "個" },
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
    { name: "ごま", match: ["ごま"], per: 0.5, unit: "大さじ" },
  ], steps: ["豆腐の水切りをしてすり鉢で滑らかにする", "柿を切って和える"], tip: "柿は完熟手前の固めが和えやすいです" },
  // ハロウィン
  { id: "ev-obake-curry", title: "おばけカレー", minutes: 25, course: "主食", genre: "洋風", method: "煮る", note: "ごはんをおばけの形にして、海苔で顔をつけたハロウィンカレー。いつものカレーがイベント仕様に変身。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 50, unit: "g" },
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 50, unit: "g" },
    { name: "カレールー", match: ["カレールー", "ルー"], per: 1, unit: "かけ" },
    { name: "海苔", match: ["海苔"], per: 0.25, unit: "枚" },
  ], steps: ["かぼちゃ入りのカレーを煮る", "ごはんをおばけ型に盛り、海苔で顔を飾る（ごはんは別に用意）"], tip: "おばけの顔は海苔をハサミで切って作ります" },
  { id: "ev-kabocha-cheesecake", title: "かぼちゃのチーズケーキ", minutes: 40, course: "デザート", genre: "洋風", method: "焼く", note: "ジャック・オ・ランタンのかぼちゃで作るチーズケーキ。濃厚でしっとり、ハロウィンパーティーの主役に。", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 75, unit: "g" },
    { name: "クリームチーズ", match: ["クリームチーズ", "チーズ"], per: 40, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 2, unit: "大さじ" },
  ], steps: ["かぼちゃを蒸して潰す", "チーズと卵、砂糖を混ぜて焼く"], tip: "一晩冷やすとしっとりします" },
  { id: "ev-kabocha-muffin", title: "かぼちゃマフィン", minutes: 25, course: "デザート", genre: "洋風", method: "焼く", note: "かぼちゃの生地のマフィンに、チョコペンでおばけの顔を描けばハロウィンおやつの完成。配るのにもぴったり。", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 50, unit: "g" },
    { name: "ホットケーキミックス", match: ["ホットケーキミックス"], per: 40, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 30, unit: "mL" },
  ], steps: ["かぼちゃペーストと材料を混ぜる", "カップに入れて180℃で焼く"], tip: "チョコペンで顔を描くとハロウィンらしくなります" },
  { id: "ev-hot-apple", title: "ホットアップル", minutes: 10, course: "デザート", genre: "洋風", method: "その他", note: "秋のりんごを温かい飲み物に。ハロウィンの夜に、温かいカップを両手で持つ幸せ。生姜を少し入れると体が温まる。", ingredients: [
    { name: "りんご", match: ["りんご"], per: 0.5, unit: "個" },
    { name: "はちみつ", match: ["はちみつ"], per: 1, unit: "大さじ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 2, unit: "g" },
  ], steps: ["りんごをすりおろして水と煮る", "はちみつと生姜で味を整えて温かく出す"], tip: "温かいうちにどうぞ" },
  // 七五三
  { id: "ev-ebi-shioyaki", title: "えびの塩焼き", minutes: 10, course: "主菜", genre: "和風", method: "焼く", note: "えびは腰が曲がるまで長生きできるようにという「長寿」の象徴。七五三のお祝い膳に欠かせない一品。", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["えびの背ワタを取る", "塩を振って焼き、レモンを添える"], tip: "えびは背ワタを取ると臭みがありません" },
  { id: "ev-chitoseame-jelly", title: "千歳飴ゼリー", minutes: 20, course: "デザート", genre: "洋風", method: "冷やす", note: "千歳飴の紅白をイメージした、牛乳といちごのゼリー。細く長く丈夫に育つようにという千歳飴の願いをデザートで。", ingredients: [
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "いちご", match: ["いちご", "イチゴ"], per: 2, unit: "粒" },
    { name: "寒天", match: ["寒天", "ゼラチン"], per: 1, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["牛乳ゼリーといちごゼリーを交互に重ねて固める", "細長いグラスに入れると千歳飴みたいになる"], tip: "細長いグラスに入れると千歳飴らしくなります" },
  { id: "ev-renkon-amazu", title: "れんこんの甘酢漬け", minutes: 15, course: "副菜", genre: "和風", method: "和える", note: "れんこんは穴から先が見通せることから「見通しが良い」縁起物。お祝いの食卓に、さっぱりした甘酢漬けで。", ingredients: [
    { name: "れんこん", match: ["れんこん", "レンコン", "蓮根"], per: 50, unit: "g" },
    { name: "酢", match: ["酢"], per: 1, unit: "大さじ" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["れんこんを薄切りにして酢水で茹でる", "甘酢に漬ける"], tip: "れんこんは酢水で色白に仕上げます" },
  // 冬至
  { id: "ev-yuzu-dengaku", title: "こんにゃくのゆず味噌田楽", minutes: 15, course: "副菜", genre: "和風", method: "焼く", note: "冬至のゆずを味噌に混ぜた、香りのいい田楽。ゆず湯に浸かる風習と同じく、ゆずの香りで邪気を払うと言われる。", ingredients: [
    { name: "こんにゃく", match: ["こんにゃく"], per: 0.25, unit: "枚" },
    { name: "ゆず", match: ["ゆず", "柚子"], per: 0.25, unit: "個" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
  ], steps: ["こんにゃくを下茹でして焼く", "ゆずの皮と味噌の田楽味噌をのせる"], tip: "ゆずの皮は白い部分を避けると苦くありません" },
  { id: "ev-kabocha-misoshiru", title: "かぼちゃの味噌汁", minutes: 15, course: "汁物", genre: "和風", method: "スープ", note: "冬至のかぼちゃを味噌汁でも。ほくほく甘いかぼちゃが溶け出した汁は、体が温まる冬の味。", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["かぼちゃと玉ねぎをだしで煮る", "味噌を溶く"], tip: "かぼちゃが少し溶け出すくらいが美味しいです" },
  { id: "ev-yuzu-sherbet", title: "ゆずシャーベット", minutes: 10, course: "デザート", genre: "洋風", method: "冷やす", note: "ゆず湯で温まった冬至の夜の、爽やかなデザート。ゆずの香りと酸味が、食後の口をさっぱりさせる。", ingredients: [
    { name: "ゆず", match: ["ゆず", "柚子"], per: 1, unit: "個" },
    { name: "はちみつ", match: ["はちみつ"], per: 1.5, unit: "大さじ" },
  ], steps: ["ゆずの果汁とはちみつ、水を混ぜる", "冷凍庫で凍らせ、シャリシャリに崩す"], tip: "ゆずの器に入れるとおしゃれです" },
  // クリスマス
  { id: "ev-minestrone", title: "ミネストローネ", minutes: 25, course: "汁物", genre: "洋風", method: "スープ", note: "赤いトマトのスープはクリスマスカラー。野菜たっぷりで、ごちそうの日の汁物にちょうどいい。", ingredients: [
    { name: "トマト缶", match: ["トマト缶", "トマト"], per: 0.25, unit: "缶" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 0.5, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
    { name: "ベーコン", match: ["ベーコン"], per: 15, unit: "g" },
  ], steps: ["野菜とベーコンを炒める", "トマト缶とコンソメで煮込む"], tip: "野菜は小さく切ると火の通りが均一です" },
  { id: "ev-garlic-toast", title: "ガーリックトースト", minutes: 10, course: "主食", genre: "洋風", method: "焼く", note: "パーティーの付け合わせに。にんにくバターの香りで、スープやシチューがぐっと進む。", ingredients: [
    { name: "フランスパン", match: ["フランスパン", "バゲット", "食パン", "パン"], per: 1, unit: "枚" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
    { name: "にんにく", match: ["にんにく"], per: 0.5, unit: "かけ" },
  ], steps: ["にんにくバターをパンに塗る", "こんがり焼く"], tip: "にんにくは切り口をこすりつける方法もあります" },
  { id: "ev-buche", title: "ブッシュ・ド・ノエル風", minutes: 20, course: "デザート", genre: "洋風", method: "冷やす", note: "「クリスマスの薪（まき）」という意味のフランスのケーキ。ロールケーキにチョコクリームの年輪を描いて、切り株らしく仕上げる。", ingredients: [
    { name: "ロールケーキ", match: ["ロールケーキ", "スポンジ", "カステラ"], per: 0.25, unit: "本" },
    { name: "チョコレート", match: ["チョコレート", "チョコ"], per: 20, unit: "g" },
    { name: "いちご", match: ["いちご", "イチゴ"], per: 2, unit: "粒" },
  ], steps: ["チョコを溶かしてクリームを作る", "ロールケーキに塗り、フォークで木目を描く"], tip: "フォークで木目を描くのが楽しい作業です" },
  { id: "ev-roast-potato", title: "ローストポテト", minutes: 30, course: "副菜", genre: "洋風", method: "焼く", note: "ローストチキンの付け合わせの定番。外はカリッ、中はホクホクに焼けたじゃがいもは大人気。", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "にんにく", match: ["にんにく"], per: 0.5, unit: "かけ" },
    { name: "オリーブオイル", match: ["オリーブオイル", "オリーブ油", "サラダ油"], per: 1, unit: "大さじ" },
  ], steps: ["じゃがいもを大きめに切る", "オイルと塩をまぶして200℃で焼く"], tip: "大きめに切るとホクホク感が出ます" },
  // 大晦日
  { id: "ev-buri-teriyaki", title: "ぶりの照り焼き", minutes: 15, course: "主菜", genre: "和風", method: "焼く", note: "ぶりは成長で名前が変わる「出世魚」。年越しやお正月のめでたい魚料理として、照り焼きで。", ingredients: [
    { name: "ぶり", match: ["ぶり", "ブリ", "鰤"], per: 1, unit: "切れ" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["ぶりに塩をして水分を拭く", "焼いて照り焼きのタレを絡める"], tip: "タレは最後に煮詰めて照りを出します" },
  { id: "ev-kakiage", title: "年越しそば用の野菜かき揚げ", minutes: 20, course: "主食", genre: "和風", method: "揚げる", note: "年越しそばの上にのせるかき揚げ。天ぷらは「金を包む」形に似て縁起がいいとも言われ、大晦日のそばを豪華にする。", ingredients: [
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 50, unit: "g" },
    { name: "天ぷら粉", match: ["天ぷら粉", "小麦粉"], per: 2, unit: "大さじ" },
  ], steps: ["野菜を細切りにして衣を絡める", "平たくまとめて揚げる"], tip: "衣は冷水で作るとサクッと揚がります" },
];


// ---------- イベントレシピ追加（全イベント8〜10品＋運動会を新設） ----------
const EV = (id, title, minutes, genre, method, course, note, ingredients, steps, tip) => ({
  id, title, minutes, genre, method, course, note,
  ingredients: ingredients.map(([name, match, per, unit]) => ({ name, match, per, unit })),
  steps, tip,
});
export const EVENT_RECIPES_MORE = [
  // お正月
  EV("ev-kobumaki", "昆布巻き", 40, "和風", "煮る", "副菜", "お正月のおせち。昆布は「喜ぶ（よろこぶ）」に通じる縁起物で、鮭などを巻いて煮るよ。", [["昆布", ["昆布"], 5, "g"], ["鮭", ["鮭", "さけ"], 0.5, "切れ"], ["かんぴょう", ["かんぴょう"], 2, "g"]], ["昆布を戻して鮭を巻き、かんぴょうで結ぶ（なければそのまま重ねる）", "だしに酒と醤油を加え、弱火で25分ほどコトコト煮る", "火を止めてそのまま冷まし、味を含ませる"], "冷ます時間に味がしみるので前日作りがおすすめ"),
  EV("ev-kazunoko", "数の子風", 15, "和風", "漬ける", "副菜", "お正月のおせち。数の子はニシンの卵で、子孫繁栄の願いがこめられた縁起物だよ。", [["数の子", ["数の子"], 30, "g"], ["かつお節", ["かつお節"], 1, "g"]], ["数の子を塩抜きして薄皮を取る（塩抜き済みならそのまま）", "だし醤油に半日ほど漬ける", "器に盛り、かつお節をかける"], "漬け時間で味の濃さが変わります"),
  // 節分
  EV("ev-shiitake-ni", "しいたけの含め煮", 20, "和風", "煮る", "副菜", "恵方巻の具の定番。しいたけを甘辛く煮ると、巻き寿司の味の要になるよ。", [["干ししいたけ", ["干ししいたけ"], 2, "個"]], ["干ししいたけを戻し、軸を取って薄切りにする", "戻し汁に醤油・砂糖・みりんを加え、弱火で10分煮る", "汁気が少なくなるまで煮詰める"], "戻し汁ごと煮るのが旨みのコツ"),
  // バレンタイン
  EV("ev-choco-fondue", "チョコフォンデュ風", 15, "洋風", "和える", "デザート", "バレンタインのお楽しみ。溶かしたチョコに果物をつけて食べる、みんなで囲むデザートだよ。", [["チョコレート", ["チョコレート"], 40, "g"], ["牛乳", ["牛乳"], 30, "mL"], ["いちご", ["いちご"], 3, "個"], ["バナナ", ["バナナ"], 0.5, "本"], ["マシュマロ", ["マシュマロ"], 2, "個"]], ["チョコレートを刻んで耐熱ボウルに入れる", "温めた牛乳を加えてよく混ぜ、なめらかに溶かす", "果物とマシュマロをフォークでつけて食べる"], "チョコは湯煎か弱い加熱で。焦がすと固まります"),
  EV("ev-ichigo-choco", "いちごチョコ", 15, "洋風", "和える", "デザート", "バレンタインの手作りチョコ。いちごにチョコをかけるだけで、お店みたいな一品になるよ。", [["いちご", ["いちご"], 4, "個"], ["チョコレート", ["チョコレート"], 30, "g"]], ["いちごを洗って水気をしっかり拭く", "溶かしたチョコをいちごにかけ（または半分つける）", "冷蔵庫で10分ほど冷やして固める"], "水気が残るとチョコがつきにくいのでしっかり拭いて"),
  // ひな祭り
  EV("ev-sakura-mochi", "桜餅風", 25, "和風", "蒸す", "デザート", "ひな祭りのお菓子。ピンクのお餅を塩漬けの桜の葉で包むよ。葉の香りが春らしいおやつだよ。", [["もち米", ["もち米"], 75, "g"], ["小豆", ["小豆"], 30, "g"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["桜の葉", ["桜の葉"], 2, "枚"]], ["もち米を蒸して（または炊いて）ピンクに色付けし、軽くつく", "小豆あんを包んで丸める", "塩抜きした桜の葉で包む"], "あんは市販のこしあんでも作れます"),
  EV("ev-shinjo-suimono", "えびしんじょの吸物", 20, "和風", "スープ", "汁物", "ひな祭りのお祝い汁。はまぐりの吸い物と並ぶ、ふんわりしたえびのしんじょのお吸い物だよ。", [["えび", ["えび", "エビ"], 3, "尾"], ["はんぺん", ["はんぺん"], 0.5, "枚"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"], ["三つ葉", ["三つ葉"], 1, "g"]], ["えびとはんぺんを潰して片栗粉と混ぜる", "丸めてだしで5分ほど煮る（中まで火が通るまで）", "塩と薄口醤油で調え、三つ葉を散らす"], "しんじょは煮すぎると固くなるので様子を見て"),
  EV("ev-tai-suimono", "たいのお吸い物", 15, "和風", "スープ", "汁物", "お祝いの席の吸い物。「めでたい」の鯛を使った、澄んだ上品な汁だよ。", [["たい", ["たい", "鯛"], 0.5, "切れ"], ["豆腐", ["豆腐"], 0.25, "丁"], ["三つ葉", ["三つ葉"], 1, "g"]], ["たいに湯をかけて霜降りにする", "昆布だしで豆腐と一緒に温める（煮立てない）", "塩で調え、三つ葉を散らす"], "だしは沸騰させないのが澄んだ汁のコツ"),
  // ホワイトデー
  EV("ev-marshmallow-toast", "マシュマロトースト風", 10, "洋風", "焼く", "デザート", "ホワイトデーのお返しの定番マシュマロを、トーストにのせて焼く簡単おやつだよ。", [["食パン", ["食パン", "パン"], 1, "枚"], ["マシュマロ", ["マシュマロ"], 3, "個"], ["チョコレート", ["チョコレート"], 10, "g"]], ["パンに刻んだチョコを散らす", "マシュマロをのせてトースターで2〜3分、膨らんで焼き色がつくまで焼く"], "マシュマロは焦げやすいので目を離さないで"),
  EV("ev-milk-pudding", "牛乳プリン", 20, "洋風", "蒸す", "デザート", "ホワイトデーの白いお菓子。牛乳と卵の、真っ白で優しい味のプリンだよ。", [["牛乳", ["牛乳"], 150, "mL"], ["卵", ["卵", "たまご"], 1, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["卵・牛乳・砂糖を混ぜてこす", "弱火で12分ほど蒸す", "冷蔵庫で冷やして固める"], "カラメルなしの真っ白プリンです"),
  // お花見
  EV("ev-sakura-onigiri", "桜おにぎり", 15, "和風", "和える", "主食", "お花見のお弁当。桜の塩漬けを混ぜた、ほんのりピンクのおにぎりだよ。", [["米", ["米", "ごはん"], 150, "g"], ["桜の花", ["桜の花", "桜"], 2, "g"], ["梅干し", ["梅干し", "梅"], 0.5, "個"]], ["桜の塩漬けを塩抜きして刻む", "温かいごはんに桜と梅を混ぜる", "三角に握る"], "桜の葉を敷くと見た目も香りも春らしく"),
  EV("ev-yomogi-mochi", "よもぎ餅風", 20, "和風", "和える", "デザート", "春の野草よもぎのお餅。緑の色と香りが、春の野原を思わせるおやつだよ。", [["もち", ["もち"], 2, "個"], ["よもぎ", ["よもぎ"], 10, "g"], ["小豆", ["小豆"], 25, "g"], ["きな粉", ["きな粉"], 1, "大さじ"]], ["よもぎをゆでて刻み、柔らかくしたもちに混ぜる", "丸めて平たくする", "あんこを添える（またはきな粉をまぶす）"], "よもぎは若い葉を摘んだものを使って"),
  // 母の日
  EV("ev-carnation-salad", "カーネーションサラダ", 15, "洋風", "和える", "副菜", "母の日の花カーネーションに見立てた、ハムの花のサラダ。ありがとうを伝える一皿だよ。", [["ハム", ["ハム"], 20, "g"], ["レタス", ["レタス"], 50, "g"], ["ミニトマト", ["ミニトマト"], 3, "個"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"]], ["ハムを花びらのように巻いて花の形にする", "レタスの上にハムの花と野菜を並べる", "好みのドレッシングをかける"], "ハムは薄切りを重ねると花らしくなります"),
  EV("ev-berry-panna", "ベリーのパンナコッタ風", 20, "洋風", "和える", "デザート", "母の日のデザート。真っ白なパンナコッタに赤いベリーをのせた、カーネーション色のお菓子だよ。", [["生クリーム", ["生クリーム"], 75, "mL"], ["牛乳", ["牛乳"], 75, "mL"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["いちご", ["いちご"], 3, "個"], ["ブルーベリー", ["ブルーベリー"], 10, "g"]], ["生クリームと牛乳・砂糖を温める（沸騰させない）", "型に流して冷蔵庫で冷やし固める", "ベリーをのせる"], "固めるのはゼラチンや寒天で。冷やす時間が要ります"),
  // こどもの日
  EV("ev-koinobori-pizza", "こいのぼりピザ風", 20, "洋風", "焼く", "主食", "こどもの日のピザ。楕円の生地に野菜で鱗を描いて、泳ぐこいのぼりにするよ。", [["食パン", ["食パン", "パン"], 1, "枚"], ["ケチャップ", ["ケチャップ"], 1, "大さじ"], ["チーズ", ["チーズ"], 15, "g"], ["コーン缶", ["コーン缶", "とうもろこし"], 0.25, "缶"], ["ミニトマト", ["ミニトマト"], 2, "個"], ["ピーマン", ["ピーマン"], 0.5, "個"]], ["パンをこいのぼりの形（楕円）に切ってケチャップを塗る", "コーンとトマト・ピーマンで鱗模様を作り、チーズを散らす", "トースターで5分ほど、チーズが溶けるまで焼く"], "目はチーズと海苔で作るとらしくなります"),
  EV("ev-chimaki", "ちまき風", 30, "和風", "蒸す", "デザート", "こどもの日のお菓子。笹の葉で包んで蒸すお餅で、柏餅と並ぶ端午の節句の味だよ。", [["もち米", ["もち米"], 75, "g"], ["小豆", ["小豆"], 25, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["もち米を蒸す（または炊く）", "あんを包んで丸める", "笹の葉（なければラップ）で包んで形を整える"], "笹の香りが移るのがちまきの楽しみ"),
  EV("ev-kabuto-hamburg", "かぶとハンバーグ風", 25, "洋風", "焼く", "主菜", "こどもの日のハンバーグ。兜（かぶと）の形に成形して、元気に育つ願いをこめるよ。", [["ひき肉", ["ひき肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["チーズ", ["チーズ"], 10, "g"]], ["ハンバーグだねを作る", "兜の形（三角形に近い形）に成形して両面を焼く", "チーズで飾りをつける"], "形作りは子どもと一緒にやると楽しい"),
  // 父の日
  EV("ev-katsuo-tataki", "かつおの薬味たたき", 15, "和風", "焼く", "主菜", "父の日の一品。表面を焼いたかつおに薬味をたっぷりのせた、元気の出る刺身アレンジだよ。", [["かつお", ["かつお", "カツオ"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんにく", ["にんにく"], 0.5, "かけ"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["かつおの表面だけを強火でさっと焼く", "薄切りにして玉ねぎスライスの上に盛る", "にんにく・大葉をのせ、ポン酢をかける"], "焼いたらすぐ氷水で締めると色がきれいに"),
  // 七夕
  EV("ev-hoshi-onigiri", "星形おにぎり", 15, "和風", "和える", "主食", "七夕のおにぎり。星の形に握って、海苔や卵で飾るよ。願い事をしながら食べよう。", [["米", ["米", "ごはん"], 150, "g"], ["卵", ["卵", "たまご"], 0.5, "個"], ["海苔", ["海苔"], 0.5, "枚"]], ["ごはんを星形に握る（型がなければ手で五角形に）", "薄焼き卵を星形に切ってのせる", "海苔で顔を飾る"], "黄色い卵の星が七夕らしくなります"),
  // 土用の丑の日
  EV("ev-unagi-shirayaki", "うなぎの白焼き風", 15, "和風", "焼く", "主菜", "土用の丑の日のもう一つの顔。タレなしで焼く白焼きは、うなぎ本来の味が分かる通の食べ方だよ。", [["うなぎ", ["うなぎ"], 0.5, "尾"]], ["うなぎを酒をふってフライパンで蒸し焼きにする（中火で5分ほど）", "皮目を香ばしく焼く", "わさび醤油で食べる"], "タレの蒲焼きと食べ比べるのも楽しい"),
  EV("ev-ume-gohan", "梅しそごはん", 10, "和風", "和える", "主食", "土用の丑の日は「う」のつく食べ物で元気をつける日。梅干しもその一つだよ。", [["米", ["米", "ごはん"], 150, "g"], ["梅干し", ["梅干し", "梅"], 1.5, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["梅干しをたたいて大葉を刻む", "温かいごはんに混ぜ、ごまを振る"], "塩味は梅の塩加減で調整して"),
  // 夏の旬・夏祭り
  EV("ev-kakigori", "いちごかき氷風", 15, "洋風", "和える", "デザート", "夏祭りの屋台の味。冷凍いちごを削る（または潰す）だけの、家で作るかき氷だよ。", [["いちご", ["いちご"], 5, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["牛乳", ["牛乳"], 50, "mL"]], ["いちごを冷凍する", "冷凍いちごを削る（包丁で刻む・すりおろす）か、少し溶かして潰す", "砂糖を混ぜ、練乳代わりの牛乳をかける"], "氷をミキサーで砕いても作れます"),
  // 敬老の日
  EV("ev-matsutake-gohan", "松茸ごはん風", 50, "和風", "炊く", "主食", "敬老の日の秋のごちそう。松茸の香りを炊き込みごはんで味わう、特別な一品だよ。", [["米", ["米", "ごはん"], 150, "g"], ["松茸", ["松茸"], 0.5, "本"], ["油揚げ", ["油揚げ"], 0.5, "枚"]], ["松茸を手で裂いて用意する", "米とだし・油揚げと一緒に炊く", "蒸らしてそっと混ぜる"], "松茸は洗いすぎると香りが逃げるので汚れを拭く程度に"),
  EV("ev-ginnan", "銀杏の塩炒り", 15, "和風", "炒める", "副菜", "秋の味覚。殻を割って炒る銀杏は、敬老の日のお祝い膳にも出る秋の実りだよ。", [["銀杏", ["銀杏"], 8, "個"]], ["銀杏の殻にペンチ等でひびを入れる", "フライパンで塩と一緒に5分ほど炒る", "殻と薄皮をむいて食べる"], "食べすぎに注意。少しずつ秋の味を楽しんで"),
  EV("ev-kuri-yokan", "栗蒸し羊羹風", 30, "和風", "蒸す", "デザート", "敬老の日の和菓子。栗入りの蒸し羊羹は、上品な甘さでお茶によく合うよ。", [["栗", ["栗"], 4, "個"], ["小豆", ["小豆"], 40, "g"], ["小麦粉", ["小麦粉"], 1, "大さじ"], ["砂糖", ["砂糖"], 2, "大さじ"]], ["小豆あんに小麦粉と砂糖を混ぜる", "栗をのせて20分ほど蒸す", "冷ましてから切る"], "あんは市販のものでも作れます"),
  // お月見
  EV("ev-satoimo-croquette", "里芋のコロッケ風", 25, "洋風", "揚げる", "主菜", "お月見の里芋をコロッケに。丸い形がお月さまみたいな、月見のコロッケだよ。", [["里芋", ["里芋"], 4, "個"], ["ひき肉", ["ひき肉"], 40, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["里芋を蒸して潰し、炒めたひき肉と混ぜる", "丸く成形して衣をつける", "油でカラッと揚げる"], "里芋のねっとり感がコロッケと好相性"),
  EV("ev-tsukimi-mitarashi", "お月見みたらし団子", 20, "和風", "ゆでる", "デザート", "お月見のお供え団子に、みたらしのタレをかけた甘い団子だよ。", [["白玉粉", ["白玉粉"], 3, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["白玉粉を水でこねて丸め、ゆでる", "浮いてきたら冷水に取る", "醤油・砂糖のタレを煮詰めてかける"], "団子は真ん中を少し凹ませると火通りが均一に"),
  // 秋の味覚
  EV("ev-yaki-guri", "焼き栗", 30, "和風", "焼く", "デザート", "秋の味覚の王様。殻に切り込みを入れて焼くだけの、ほくほくの焼き栗だよ。", [["栗", ["栗"], 6, "個"]], ["栗の殻に切り込みを入れる", "オーブントースターで20分ほど焼く（時々様子を見る）", "殻をむいて食べる"], "切り込みを入れないと破裂するので忘れずに"),
  // ハロウィン
  EV("ev-obake-pizza", "おばけピザ風", 20, "洋風", "焼く", "主食", "ハロウィンのピザ。チーズをおばけの形にのせて焼く、見た目も楽しい一枚だよ。", [["食パン", ["食パン", "パン"], 1, "枚"], ["ケチャップ", ["ケチャップ"], 1, "大さじ"], ["チーズ", ["チーズ"], 20, "g"], ["海苔", ["海苔"], 0.25, "枚"], ["ソーセージ", ["ソーセージ"], 1, "本"]], ["パンにケチャップを塗ってソーセージをのせる", "チーズをおばけ形に切ってのせる", "トースターで5分ほど焼き、海苔で目をつける"], "チーズは溶けすぎると形が崩れるので短時間で"),
  EV("ev-kabocha-pie", "かぼちゃパイ風", 30, "洋風", "焼く", "デザート", "ハロウィンのかぼちゃパイ。アメリカの感謝祭でも定番の、スパイスの香りのパイだよ。", [["かぼちゃ", ["かぼちゃ", "南瓜"], 100, "g"], ["春巻きの皮", ["春巻きの皮"], 3, "枚"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["バター", ["バター"], 5, "g"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["かぼちゃを蒸して潰し、砂糖とバターを混ぜる", "春巻きの皮で包む", "卵を塗ってトースターで焼き色がつくまで焼く"], "パイシートの代わりに春巻きの皮で手軽に"),
  // 七五三
  EV("ev-chitose-pudding", "千歳飴プリン", 20, "洋風", "蒸す", "デザート", "七五三の千歳飴をヒントにした、紅白のミルクプリン。長生きの願いをこめたお祝いおやつだよ。", [["牛乳", ["牛乳"], 150, "mL"], ["卵", ["卵", "たまご"], 1, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["いちご", ["いちご"], 2, "個"]], ["牛乳プリンの生地を蒸して固める", "冷やしてから器に盛る", "いちごをのせて紅白にする"], "千歳飴の袋の絵柄みたいに紅白でお祝い"),
  EV("ev-shiratama-zenzai", "白玉ぜんざい", 20, "和風", "煮る", "デザート", "七五三のお祝いの甘味。白玉入りの温かいぜんざいで、成長を祝うよ。", [["小豆", ["小豆"], 40, "g"], ["白玉粉", ["白玉粉"], 2, "大さじ"], ["砂糖", ["砂糖"], 2, "大さじ"]], ["小豆を柔らかく煮て砂糖と塩少しで調える", "白玉を丸めてゆでる", "ぜんざいに白玉を入れる"], "白玉は浮いてから1分ゆでると中まで柔らか"),
  // 冬至
  EV("ev-renkon-ni", "れんこんの煮物", 25, "和風", "煮る", "副菜", "冬至には「ん」のつく食べ物を食べると運がつくと言われるよ。れんこんもその一つだよ。", [["れんこん", ["れんこん"], 80, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"]], ["れんこんを酢水にさらして切る", "野菜とこんにゃくをだしで15分ほど煮る", "醤油・砂糖・みりんで味を含ませる"], "「ん」のつく食べ物探しも冬至の楽しみ"),
  EV("ev-kabocha-zenzai", "かぼちゃぜんざい風", 20, "和風", "煮る", "デザート", "冬至のかぼちゃの食べ方の一つ。あずきとかぼちゃの甘いぜんざいで温まろう。", [["かぼちゃ", ["かぼちゃ", "南瓜"], 80, "g"], ["小豆", ["小豆"], 30, "g"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["小豆を煮る", "かぼちゃを加えて柔らかくなるまで煮る", "砂糖で甘さを調える"], "いとこ煮を甘くしたような冬至の味"),
  // クリスマス
  EV("ev-roast-beef", "ローストビーフ風", 40, "洋風", "焼く", "主菜", "クリスマスのごちそう。牛肉の塊を焼いて薄く切る、特別な日のメインディッシュだよ。", [["牛肉", ["牛肉"], 150, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["牛肉に塩こしょうとにんにくをすり込み、常温に戻す", "フライパンで全面に焼き色をつけ（各面2分ほど）、アルミホイルで包んで15分休ませる", "薄く切って、玉ねぎソースをかける"], "休ませる時間で肉汁が落ち着きます"),
  EV("ev-stollen-fu", "シュトーレン風", 20, "洋風", "焼く", "デザート", "ドイツのクリスマスのお菓子。ドライフルーツ入りのパンを、食パンとホットケーキミックスで再現するよ。", [["ホットケーキミックス", ["ホットケーキミックス"], 75, "g"], ["レーズン", ["レーズン"], 15, "g"], ["バター", ["バター"], 15, "g"], ["砂糖", ["砂糖"], 1.5, "大さじ"], ["牛乳", ["牛乳"], 40, "mL"]], ["材料を混ぜて楕円に成形する", "180℃で15分ほど焼く", "粉砂糖（砂糖で代用）をたっぷり振る"], "本物は少しずつ切り分けてクリスマスまで食べます"),
  // 年越し
  EV("ev-kamo-nanban", "鴨南蛮風そば", 20, "和風", "ゆでる", "主食", "年越しそばの豪華版。本物の鴨の代わりに鶏肉で作る、ねぎたっぷりの温かいそばだよ。", [["そば", ["そば"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 60, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.5, "本"]], ["鶏肉とねぎを焼いてだしで煮る", "そばをゆでる", "そばに鶏とねぎ・つゆをかける"], "ねぎを焼くと甘みと香ばしさが出ます"),
  EV("ev-kamaboko", "お祝いかまぼこ", 10, "和風", "和える", "副菜", "大みそかとお正月の橋渡し。紅白かまぼこを飾り切りして、お祝いの食卓に添えるよ。", [["かまぼこ", ["かまぼこ"], 30, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["かまぼこを薄く切る", "切り込みを入れて花の形にする", "大葉を敷いて盛る"], "うさぎや花の形の飾り切りがお正月の定番"),
  // 運動会（新規イベント用）
  EV("ev-undou-onigiri", "運動会の鮭おにぎり", 15, "和風", "和える", "主食", "運動会のお弁当の主役。走った後に食べるおにぎりは格別だよ。", [["米", ["米", "ごはん"], 150, "g"], ["鮭", ["鮭", "さけ"], 0.5, "切れ"], ["海苔", ["海苔"], 1, "枚"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["鮭を焼いてほぐす", "ごはんに鮭とごまを混ぜる", "三角に握って海苔を巻く"], "塩を少し強めにすると屋外でも食べやすい"),
  EV("ev-undou-yakisoba", "屋台風焼きそば", 20, "和風", "炒める", "主食", "運動会とお祭りの屋台の味。ソースの香りが食欲をそそるよ。", [["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["青のり", ["青のり", "あおさ"], 0.5, "大さじ"]], ["豚肉と野菜を炒める", "麺をほぐし入れてソースで炒める", "青のりと紅生姜（あれば）をのせる"], "麺は焼き付けてからほぐすと香ばしい"),
  EV("ev-undou-potato", "フライドポテト風", 20, "洋風", "揚げる", "副菜", "運動会のお弁当にも入る人気者。揚げたてに塩を振るシンプルな味だよ。", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["じゃがいもをスティック状に切って水にさらす", "水気を拭いて片栗粉を薄くまぶす", "油でカラッと揚げて塩を振る"], "二度揚げすると中はホクホク外はカリッと"),
  EV("ev-undou-kyuri", "きゅうりの一本漬け風", 10, "和風", "漬ける", "副菜", "夏祭りと運動会の定番。冷たく冷やしたきゅうりの漬物は、暑い日の救世主だよ。", [["きゅうり", ["きゅうり"], 1, "本"], ["昆布", ["昆布"], 1, "g"]], ["きゅうりに塩をすり込む", "昆布と一緒に袋に入れて冷蔵庫で冷やす", "食べる直前に水気を拭く"], "割り箸を刺すと屋台っぽくなります"),
  EV("ev-undou-sand", "運動会サンドイッチ", 15, "洋風", "和える", "主食", "運動会のお弁当。片手で食べられるサンドイッチは、応援の合間にもぴったりだよ。", [["食パン", ["食パン", "パン"], 2, "枚"], ["卵", ["卵", "たまご"], 1, "個"], ["ハム", ["ハム"], 1, "枚"], ["レタス", ["レタス"], 20, "g"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["ゆで卵を潰してマヨネーズで和える", "パンに卵・ハム・レタスをはさむ", "耳を落として三角に切る"], "前日に作るときはレタスの水気をしっかり切って"),
  EV("ev-undou-jelly", "運動会のフルーツゼリー", 15, "洋風", "和える", "デザート", "運動会のデザート。冷たいフルーツゼリーは、頑張った体にうれしいご褒美だよ。", [["みかん缶", ["みかん缶"], 0.5, "缶"], ["パイナップル缶", ["パイナップル缶"], 0.25, "缶"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["缶詰のシロップを温めて砂糖を溶かす", "果物と一緒に容器に流す", "冷蔵庫で冷やし固める"], "固めるのはゼラチンや寒天で。小さいカップに入れると配りやすい"),
];
EVENT_RECIPES.push(...EVENT_RECIPES_MORE);

// ---- イベント献立セット（暦の順） ----
// note は子どもにも分かる「なぜその食べ物なのか」を1〜2行で。
// dishes は EVENT_RECIPES と既存 ALL_RECIPES の id を混ぜて参照する。
export const EVENT_MENUS = [
  { id: "osechi", name: "お正月", emoji: "🎍", when: "1月1日〜3日", dishes: ["ev-ozoni", "ev-datemaki", "ev-kurikinton", "ev-kuromame", "ev-namasu", "ev-tataki-gobou", "ev-tazukuri", "ev-matsukaze"],
    note: "おせちは1年のはじまりのお祝いごはん。伊達巻は学び、栗きんとんは金運、黒豆は元気に働けるように、と一品ごとに願いがこめられています。" },
  { id: "setsubun", name: "節分", emoji: "👹", when: "2月3日ごろ", dishes: ["ev-ehomaki", "ev-iwashi", "ev-gomokuni", "ev-kenchin", "ev-fukumame-gohan", "ev-iwashi-tsumire", "ev-daizu-konbu-ni", "ev-fukucha"],
    note: "恵方巻をその年の良い方角を向いて食べると願いが叶うと言われます。豆まきの豆と、鬼が苦手ないわしで悪いものを追い払います。" },
  { id: "valentine", name: "バレンタイン", emoji: "🍫", when: "2月14日", dishes: ["ev-beef-stew", "ev-heart-salad", "ev-corn-soup", "ev-choco-pudding", "ev-gateau", "ev-heart-croquette", "ev-tomato-cream-pasta", "ev-ichigo-tiramisu"],
    note: "大切な人にチョコレートを贈る日。ごはんもハートを散らして、気持ちが伝わる献立にしました。" },
  { id: "hinamatsuri", name: "ひな祭り", emoji: "🎎", when: "3月3日", dishes: ["ev-chirashi", "ev-hamaguri", "ev-nanohana", "ev-ichigo-kanten", "ev-sanshoku-jelly", "ev-amazake", "ev-ebi-broccoli-salad"],
    note: "女の子の健やかな成長を願う桃の節句。ちらし寿司やはまぐりなど、春らしく彩りの良いものを食べます。" },
  { id: "whiteday", name: "ホワイトデー", emoji: "🤍", when: "3月14日", dishes: ["ev-carbonara", "ev-caesar-salad", "ev-pudding", "ev-cream-stew", "ev-white-gratin", "ev-white-choco-mousse", "ev-corn-soup"],
    note: "バレンタインのお返しをする日。白いものを贈る風習にちなんで、白っぽい洋食の献立にしました。" },
  { id: "hanami", name: "お花見", emoji: "🌸", when: "3月〜4月（桜の季節）", dishes: ["ev-takenoko-gohan", "karaage", "tamagoyaki", "ev-nanohana", "ev-sanshoku-dango", "ev-inarizushi", "ev-haru-coleslaw"],
    note: "桜の下で春のごちそうを楽しむ行楽の献立。三色団子のピンク・白・緑は、桜・雪・新芽で春そのものを表します。" },
  { id: "hahanohi", name: "母の日", emoji: "💐", when: "5月の第2日曜日", dishes: ["ev-heart-hamburg", "omurice", "potato-sarada", "ev-ichigo-yogurt", "ev-french-toast", "ev-salmon-marine", "ev-ichigo-milk"],
    note: "お母さんに「ありがとう」を伝える日。ハート形のハンバーグなど、子どもと一緒に作って感謝を届ける献立です。" },
  { id: "kodomonohi", name: "こどもの日", emoji: "🎏", when: "5月5日", dishes: ["karaage", "ev-takenoko-gohan", "ev-wakatake-ni", "ev-fruit-punch", "ev-kashiwa-mochi", "ev-koinobori-sand", "ev-yasai-stick"],
    note: "子どもの成長を祝う日。たけのこはまっすぐ伸びる元気の象徴で、柏餅やちまきを食べる風習もあります。" },
  { id: "chichinohi", name: "父の日", emoji: "👔", when: "6月の第3日曜日", dishes: ["shogayaki", "ev-hiyayakko", "ev-edamame", "misoshiru", "ev-garlic-rice", "ev-nasu-miso-itame", "ev-stamina-natto", "tonkatsu"],
    note: "お父さんに「ありがとう」を伝える日。おつまみにもなる、がっつり元気の出る献立にしました。" },
  { id: "tanabata", name: "七夕", emoji: "🎋", when: "7月7日", dishes: ["ev-tanabata-somen", "ev-hoshi-salad", "tamago-soup", "ev-suika", "ev-amanogawa-jelly", "ev-natsuyasai-marine", "ev-hoshi-pizza", "ev-suika-sherbet"],
    note: "織姫と彦星が1年に1度会える日。そうめんは天の川、オクラの切り口は星に見立てて、願い事をしながら食べます。" },
  { id: "doyou", name: "土用の丑の日", emoji: "🍱", when: "7月下旬ごろ", dishes: ["ev-unadon", "ev-sumono", "ev-shijimi-jiru", "ev-uzaku", "ev-umaki", "ev-doyo-mochi", "ev-ume-kyuri"],
    note: "夏の暑さに負けないよう、栄養のあるうなぎを食べる日。「う」のつく食べ物で元気をつける江戸時代からの知恵です。" },
  { id: "natsu", name: "夏の旬・夏祭り", emoji: "🎆", when: "7月〜8月（夏）", dishes: ["ev-goya-champuru", "ev-hiyashi-chuka", "ev-tomorokoshi", "ev-suika", "ev-natsuyasai-curry", "ev-yaki-tomorokoshi", "ev-edamame-pepe", "ev-natsuyasai-agebitashi"],
    note: "夏祭りの屋台みたいな、暑い日に元気が出る旬の献立。冷たい麺と甘いとうもろこし、仕上げはすいかです。" },
  { id: "keirou", name: "敬老の日", emoji: "🍵", when: "9月の第3月曜日", dishes: ["sake-shioyaki", "ev-chawanmushi", "ev-kuri-gohan", "misoshiru", "ev-eringi-gohan", "ev-kabocha-nimono"],
    note: "おじいちゃん・おばあちゃんに長生きと感謝を伝える日。柔らかく食べやすい和食の献立にしました。" },
  { id: "tsukimi", name: "お月見", emoji: "🌕", when: "秋の十五夜", dishes: ["ev-sanma", "ev-satoimo-ni", "ev-tsukimi-jiru", "ev-tsukimi-dango", "ev-tsukimi-udon", "ev-tsukimi-burger", "ev-nashi"],
    note: "きれいなお月さまに秋の実りを感謝する日。丸いお団子や里芋をお供えしてから、みんなでいただきます。" },
  { id: "aki", name: "秋の味覚", emoji: "🍄", when: "9月〜11月（秋）", dishes: ["ev-sanma", "ev-kinoko-gohan", "ev-satsumaimo-ni", "ev-kenchin", "ev-yakiimo", "ev-kinoko-hoiru", "ev-kaki-shiraae", "tonjiru"],
    note: "きのこ、さんま、栗、さつまいも。秋にいちばんおいしくなるものばかり集めた旬の献立です。" },
  { id: "halloween", name: "ハロウィン", emoji: "🎃", when: "10月31日", dishes: ["ev-kabocha-gratin", "ev-halloween-salad", "ev-kabocha-soup", "ev-kabocha-pudding", "ev-obake-curry", "ev-kabocha-cheesecake", "ev-kabocha-muffin", "ev-hot-apple"],
    note: "かぼちゃをくり抜いたランタンを飾る外国のお祭り。献立もかぼちゃづくしで、オレンジ色の食卓にしました。" },
  { id: "shichigosan", name: "七五三", emoji: "👘", when: "11月15日", dishes: ["ev-sekihan", "ev-tai-shioyaki", "ev-chikuzenni", "ev-hamaguri", "ev-ebi-shioyaki", "ev-chitoseame-jelly", "ev-renkon-amazu"],
    note: "3歳・5歳・7歳の成長をお祝いする日。赤飯や鯛などお祝いの食べ物を用意して、長い千歳飴で長生きを願います。" },
  { id: "touji", name: "冬至", emoji: "🍊", when: "12月22日ごろ", dishes: ["ev-kabocha-croquette", "ev-itokoni", "ev-yuzu-daikon", "ev-kabocha-soup", "ev-yuzu-dengaku", "ev-kabocha-misoshiru", "ev-yuzu-sherbet"],
    note: "1年でいちばん夜が長い日。かぼちゃを食べて栄養をつけ、ゆず湯に入ると風邪をひかないと言われます。" },
  { id: "christmas", name: "クリスマス", emoji: "🎄", when: "12月24日〜25日", dishes: ["ev-roast-chicken", "potato-sarada", "ev-corn-soup", "ev-ichigo-cake", "ev-minestrone", "ev-garlic-toast", "ev-buche", "ev-roast-potato"],
    note: "家族で食卓を囲む特別な日。大きなチキンと赤いいちごのケーキで、クリスマスカラーの献立にしました。" },
  { id: "toshikoshi", name: "年越し・大みそか", emoji: "🔔", when: "12月31日", dishes: ["ev-toshikoshi-soba", "ev-tempura", "ev-chikuzenni", "ev-yuzu-daikon", "ev-kakiage", "ev-buri-teriyaki", "ev-kuromame"],
    note: "1年の最後のごはんは年越しそば。細く長いそばに長生きの願い、切れやすさに「今年の苦労は断ち切る」意味があります。" },
];


// ---- イベント献立の追加（全イベント8〜10品に拡充＋運動会を新設） ----
{
  const addDishes = (menuId, ids) => {
    const m = EVENT_MENUS.find((e) => e.id === menuId);
    if (m) m.dishes.push(...ids);
  };
  addDishes("osechi", ["ev-kobumaki", "ev-kazunoko"]);
  addDishes("setsubun", ["ev-shiitake-ni"]);
  addDishes("valentine", ["ev-choco-fondue", "ev-ichigo-choco"]);
  addDishes("hinamatsuri", ["ev-sakura-mochi", "ev-shinjo-suimono", "ev-tai-suimono"]);
  addDishes("whiteday", ["ev-marshmallow-toast", "ev-milk-pudding"]);
  addDishes("hanami", ["ev-sakura-onigiri", "ev-yomogi-mochi"]);
  addDishes("hahanohi", ["ev-carnation-salad", "ev-berry-panna"]);
  addDishes("kodomonohi", ["ev-koinobori-pizza", "ev-chimaki", "ev-kabuto-hamburg"]);
  addDishes("chichinohi", ["ev-katsuo-tataki"]);
  addDishes("tanabata", ["ev-hoshi-onigiri"]);
  addDishes("doyou", ["ev-unagi-shirayaki", "ev-ume-gohan"]);
  addDishes("natsu", ["ev-kakigori"]);
  addDishes("keirou", ["ev-matsutake-gohan", "ev-ginnan", "ev-kuri-yokan"]);
  addDishes("tsukimi", ["ev-satoimo-croquette", "ev-tsukimi-mitarashi"]);
  addDishes("aki", ["ev-yaki-guri"]);
  addDishes("halloween", ["ev-obake-pizza", "ev-kabocha-pie"]);
  addDishes("shichigosan", ["ev-chitose-pudding", "ev-shiratama-zenzai"]);
  addDishes("touji", ["ev-renkon-ni", "ev-kabocha-zenzai"]);
  addDishes("christmas", ["ev-roast-beef", "ev-stollen-fu"]);
  addDishes("toshikoshi", ["ev-kamo-nanban", "ev-kamaboko"]);
  EVENT_MENUS.push({ id: "undoukai", name: "運動会", emoji: "🏃", when: "5月・10月（運動会の日）", dishes: ["ev-undou-onigiri", "karaage", "tamagoyaki", "ev-undou-yakisoba", "ev-undou-potato", "ev-undou-kyuri", "ev-undou-sand", "ev-undou-jelly"],
    note: "走って、応援して、おなかがすく日。おにぎりや焼きそばなど、屋外で食べやすいお弁当の献立にしました。" });
}

const EVENT_DISH_BY_ID = new Map([...ALL_RECIPES, ...EVENT_RECIPES].map((r) => [r.id, r]));

/** id からイベントを引く */
export function eventById(eventId) {
  return EVENT_MENUS.find((e) => e.id === eventId) || null;
}

/**
 * イベント献立を組み立てる。
 * 各料理を通常レシピと同じ評価（evaluateRecipe）で在庫と照合し、家族人数で換算する。
 * 戻り値: { event, dishes, missingAll, totalMinutes, haveCount, missingCount }
 *  - dishes: 献立の順（主菜→副菜→汁物/行事食→デザートなど定義順）の評価済みレシピ
 *  - missingAll: 全料理の不足材料を名前＋単位でまとめたもの（買い物リスト追加用）
 * イベントが無ければ null。
 */
export function suggestEventMenu(eventId, stockItems, { servings = 2 } = {}) {
  const event = eventById(eventId);
  if (!event) return null;
  const today = todayLocalISO();
  const dishes = [];
  for (const id of event.dishes) {
    const recipe = EVENT_DISH_BY_ID.get(id);
    if (!recipe) continue;
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    dishes.push(evaluated);
  }
  const missingMap = new Map();
  let haveCount = 0;
  for (const d of dishes) {
    haveCount += d.have.length;
    for (const m of d.missing) {
      const key = `${m.name}|${m.unit}`;
      if (missingMap.has(key)) missingMap.get(key).amount = Math.round((missingMap.get(key).amount + m.amount) * 10) / 10;
      else missingMap.set(key, { ...m });
    }
  }
  return {
    event, dishes,
    missingAll: [...missingMap.values()],
    totalMinutes: dishes.reduce((s, d) => s + (d.minutes || 0), 0),
    haveCount, missingCount: missingMap.size,
  };
}

// ============================================================
// 地域の郷土料理・名物グルメ（2026-11-10「地域の郷土料理や名物
// グルメレシピも追加して。季節の献立と同じようにタブで選択」）
// イベント献立と同じ作り: 地域ごとに献立セットを用意し、料理は
// 通常レシピと同じデータモデル（evaluateRecipe で在庫照合・家族
// 人数換算・FIFO）。郷土料理専用の料理は REGIONAL_RECIPES に足し、
// 既存レシピ（ちゃんちゃん焼き等）も再利用する。各料理には
// 子ども向けの由来メモ（note）を付ける。
// ============================================================

export const REGIONAL_RECIPES = [
  // ---- 北海道 ----
  { id: "rg-jingisukan", title: "ジンギスカン風焼肉", minutes: 25, genre: "和風", method: "焼く", course: "主菜", note: "北海道の名物。羊のお肉を、真ん中が盛り上がった鍋で焼くよ。名前はモンゴルの英雄チンギス・ハンから来たと言われるよ。", ingredients: [
    { name: "ラム肉", match: ["ラム", "羊肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
  ], steps: ["ラム肉と野菜をホットプレートやフライパンで焼く", "焼けたものからタレにつけて食べる"], tip: "もやしを山盛りにすると本場っぽくなります" },
  { id: "rg-ishikari", title: "石狩鍋風スープ", minutes: 25, genre: "和風", method: "スープ", course: "汁物", note: "北海道・石狩川の鮭漁師が生んだ鍋。鮭と野菜を味噌で煮込む、寒い日にぴったりのごちそうだよ。", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["野菜をだしで煮て、鮭を入れる", "味噌を溶いて仕上げる（バターを少しのせても）"], tip: "鮭のアラがあればだしがよく出ます" },
  { id: "rg-buttercorn", title: "バターコーン", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", note: "北海道の甘いとうもろこしにバターをのせた屋台の味。札幌のラーメンにのせるのも定番だよ。", ingredients: [
    { name: "とうもろこし", match: ["とうもろこし", "コーン"], per: 1, unit: "本" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
  ], steps: ["とうもろこしを茹でる（またはレンジで蒸す）", "熱いうちにバターをのせ、軽く塩を振る"], tip: "醤油を少し垂らすと香ばしくなります" },
  // ---- 東北 ----
  { id: "rg-kiritanpo", title: "きりたんぽ鍋風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "秋田の郷土鍋。ごはんを棒に巻いて焼いた『きりたんぽ』を、鶏のだしで煮込むよ。", ingredients: [
    { name: "きりたんぽ", match: ["きりたんぽ"], per: 2, unit: "本" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.5, unit: "本" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.5, unit: "本" },
  ], steps: ["鶏肉とごぼう・まいたけをだしで煮る", "斜め切りのきりたんぽとねぎを入れてひと煮立ち"], tip: "きりたんぽは煮崩れしやすいので最後に入れます" },
  { id: "rg-imoni", title: "芋煮風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "山形の秋の風物詩。河原で大きな鍋を囲む『芋煮会』が有名だよ。味付けは地域で醤油と味噌に分かれるんだ。", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
    { name: "牛肉", match: ["牛肉"], per: 75, unit: "g" },
    { name: "こんにゃく", match: ["こんにゃく"], per: 0.5, unit: "枚" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["里芋とこんにゃくをだしで煮る", "牛肉とねぎを入れ、醤油と砂糖で甘辛く仕上げる"], tip: "里芋は下ゆでするとぬめりが取れます" },
  { id: "rg-senbeijiru", title: "せんべい汁風", minutes: 20, genre: "和風", method: "スープ", course: "汁物", note: "青森・八戸の郷土汁。鍋用の南部せんべいをお汁に入れると、もちもちのお餅みたいになるよ。", ingredients: [
    { name: "せんべい", match: ["せんべい", "南部せんべい"], per: 2, unit: "枚" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["根菜をだしで煮て醤油で味付け", "食べる直前に鍋用せんべいを割り入れる"], tip: "普通のお菓子せんべいではなく鍋用を使ってください" },
  { id: "rg-zunda", title: "ずんだ餅風", minutes: 15, genre: "和風", method: "和える", course: "デザート", note: "宮城の名物。枝豆をすりつぶした緑色のあん『ずんだ』をお餅にからめるよ。枝豆の香りが自慢だよ。", ingredients: [
    { name: "枝豆", match: ["枝豆"], per: 75, unit: "g" },
    { name: "餅", match: ["餅", "もち"], per: 2, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["枝豆を茹でてさやから出し、砂糖と塩少々ですりつぶす", "焼いた餅にからめる"], tip: "少し粒を残すと食感が楽しいです" },
  // ---- 関東 ----
  { id: "rg-fukagawa", title: "深川めし風", minutes: 20, genre: "和風", method: "煮る", course: "主食", note: "東京・深川の漁師ごはん。あさりを味噌や醤油で煮て、汁ごとごはんにのせたり炊き込んだりするよ。", ingredients: [
    { name: "あさり", match: ["あさり"], per: 75, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["砂抜きしたあさりをだしで煮て味付け", "炊きたてごはんにのせる（ごはんは別に用意）"], tip: "あさりの煮汁をごはんにかけるとうま味たっぷりです" },
  { id: "rg-monja", title: "もんじゃ焼き風", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "東京・月島の名物。ゆるい生地を鉄板で焼いて、小さいヘラで少しずつ食べるのが楽しいよ。昔、駄菓子屋で子どもが文字を書いて遊んだ『もんじ焼き』が始まりだと言われるよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "小麦粉", match: ["小麦粉"], per: 2, unit: "大さじ" },
    { name: "明太子", match: ["明太子"], per: 20, unit: "g" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["刻んだキャベツに水で溶いた生地を混ぜる", "ホットプレートで広げて焼き、焦げ目をつけて食べる"], tip: "土手を作って生地を流すのが本場流です" },
  { id: "rg-shumai", title: "横浜シュウマイ風", minutes: 25, genre: "中華", method: "蒸す", course: "主菜", note: "横浜中華街の名物。崎陽軒のシウマイで有名になり、横浜みやげの定番になったよ。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "シュウマイの皮", match: ["シュウマイの皮", "餃子の皮"], per: 8, unit: "枚" },
  ], steps: ["ひき肉と玉ねぎを練って皮で包む", "蒸し器やフライパンで10分蒸す"], tip: "干し貝柱を入れると本格的になります" },
  { id: "rg-chanko", title: "ちゃんこ鍋風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "東京・両国のお相撲さんのごはん。力士が食べる鍋は全部『ちゃんこ』と呼ばれるよ。栄養満点で体を作るよ。", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["鶏肉と野菜をだしで煮る", "豆腐を入れて醤油や味噌で味付け"], tip: "肉団子を入れると子どもも喜びます" },
  // ---- 中部 ----
  { id: "rg-misokatsu", title: "名古屋みそカツ", minutes: 30, genre: "和風", method: "揚げる", course: "主菜", note: "名古屋名物『名古屋めし』のひとつ。甘い赤味噌のタレをとんかつにかけるよ。赤味噌は豆味噌で、コクが深いんだ。", ingredients: [
    { name: "豚ロース", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
  ], steps: ["豚肉に衣をつけてカラッと揚げる", "味噌・砂糖・みりんを煮詰めたタレをたっぷりかける"], tip: "千切りキャベツを山盛りに添えるのが名古屋流です" },
  { id: "rg-tebasaki", title: "手羽先の甘辛焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "名古屋の居酒屋名物。カリッと焼いた手羽に甘辛タレとごま。手で持って食べるのが本場流だよ。", ingredients: [
    { name: "手羽元", match: ["手羽元", "手羽先", "手羽"], per: 3, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["手羽を揚げ焼きしてカリッとさせる", "醤油・みりん・砂糖のタレを絡めてごまを振る"], tip: "タレは煮詰めすぎないのがコツです" },
  { id: "rg-hoto", title: "ほうとう風", minutes: 25, genre: "和風", method: "煮る", course: "主食", note: "山梨の郷土麺。太くて平たい麺を、かぼちゃと野菜と一緒に味噌で煮込むよ。武将・武田信玄の陣中食だったという話もあるよ。", ingredients: [
    { name: "ほうとう麺", match: ["ほうとう", "うどん"], per: 1, unit: "玉" },
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["野菜をだしで煮て、ほうとう麺をそのまま入れる", "味噌を溶いて麺が柔らかくなるまで煮込む"], tip: "麺は茹でずに入れるのがほうとう流（とろみが出ます）" },
  { id: "rg-hamamatsu-gyoza", title: "浜松餃子風", minutes: 25, genre: "中華", method: "焼く", course: "主菜", note: "静岡・浜松の名物。キャベツたっぷりで甘みがあり、真ん中に茹でもやしを添えるのが浜松流だよ。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 60, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "餃子の皮", match: ["餃子の皮"], per: 8, unit: "枚" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["キャベツとひき肉の餡を皮で包む", "フライパンで円形に焼き、真ん中に茹でもやしを添える"], tip: "野菜多めで甘いのが浜松餃子の特徴です" },
  // ---- 関西 ----
  { id: "rg-takoyaki", title: "たこ焼き", minutes: 20, genre: "和風", method: "焼く", course: "主食", note: "大阪のソウルフード。丸い鉄板でころころ焼くよ。外はカリッ、中はとろ〜りが本場の合言葉だよ。", ingredients: [
    { name: "たこ", match: ["たこ"], per: 40, unit: "g" },
    { name: "小麦粉", match: ["小麦粉"], per: 3, unit: "大さじ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["生地にたことねぎを入れてたこ焼き器で焼く", "ソースとマヨネーズ（あれば）で仕上げる"], tip: "回し続けるように焼くとまん丸になります" },
  { id: "rg-okonomiyaki", title: "お好み焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "関西の家庭の味。キャベツたっぷりの生地を焼いて、ソースとマヨネーズで仕上げるよ。名前は『お好み』の具を入れることから来たよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "豚肉", match: ["豚バラ", "豚肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "小麦粉", match: ["小麦粉"], per: 2, unit: "大さじ" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["キャベツと生地を混ぜてフライパンで焼く", "豚肉をのせて返し、ソースとマヨネーズで仕上げる"], tip: "生地は混ぜすぎないとふんわりします" },
  { id: "rg-kitsune-udon", title: "きつねうどん", minutes: 15, genre: "和風", method: "ゆでる", course: "主食", note: "大阪生まれと言われるうどん。甘く煮た油揚げが、キツネの好物にちなんで『きつね』と呼ばれるよ。", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "油揚げ", match: ["油揚げ"], per: 1, unit: "枚" },
  ], steps: ["油揚げを砂糖と醤油で甘く煮る", "うどんをゆで、温かいつゆと油揚げをのせる"], tip: "青ねぎを散らすと彩りがよくなります" },
  { id: "rg-kushikatsu", title: "串カツ風", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", note: "大阪・新世界の名物。串に刺して揚げたカツをソースにどっぷり。本場では『ソース二度づけ禁止』が合言葉だよ。", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["豚肉と玉ねぎを交互に串に刺して衣をつける", "カラッと揚げてソースにつける"], tip: "衣の粉は水でドロッと溶くのが大阪流です" },
  // ---- 中国 ----
  { id: "rg-hiroshima-okonomi", title: "広島お好み焼き", minutes: 25, genre: "和風", method: "焼く", course: "主菜", note: "広島流は生地と具を重ねて焼き、中華麺が入るのが特徴。戦後の広島で、鉄板の上のごちそうとして広まったよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚バラ", "豚肉"], per: 40, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["薄い生地にキャベツと豚肉を重ねて蒸し焼き", "炒めた中華麺と卵を重ねてソースで仕上げる"], tip: "キャベツは山盛りでも焼くとしんなりします" },
  { id: "rg-kawara-soba", title: "瓦そば風", minutes: 20, genre: "和風", method: "焼く", course: "主食", note: "山口の郷土麺。本当は熱く焼いた瓦の上に茶そばをのせて、温かいおつゆにつけて食べるよ。ここではフライパンで再現するよ。", ingredients: [
    { name: "そば", match: ["茶そば", "そば"], per: 1, unit: "束" },
    { name: "牛肉", match: ["牛肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["そばをゆでてフライパンで軽く焼く", "甘辛牛肉と錦糸卵をのせ、温かいつゆにレモンを絞って食べる"], tip: "そばの底が少しカリッとするのがおいしいポイントです" },
  { id: "rg-demikatsu", title: "岡山デミカツ丼風", minutes: 25, genre: "洋風", method: "揚げる", course: "主食", note: "岡山のご当地丼。とんかつにデミグラスソースをかけた洋食風の丼で、喫茶店や洋食屋さんで生まれた味だよ。", ingredients: [
    { name: "豚肉", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "デミグラスソース", match: ["デミグラス"], per: 0.25, unit: "缶" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
  ], steps: ["豚肉をカツに揚げる", "ごはんにキャベツとカツをのせ、デミグラスソースをかける（ごはんは別に用意）"], tip: "ソースは温めてからかけるとごはんが冷めません" },
  // ---- 四国 ----
  { id: "rg-sanuki-udon", title: "讃岐うどん風", minutes: 15, genre: "和風", method: "ゆでる", course: "主食", note: "香川は『うどん県』と呼ばれるうどん王国。コシの強い麺を、いりこだしでいただくのが讃岐流だよ。", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["うどんをコシが残るようゆでる", "いりこだし（だしで代用）をかけ、ねぎとおろし生姜をのせる"], tip: "天かすを散らすと『たぬき』になります" },
  { id: "rg-katsuo-tataki", title: "かつおのたたき", minutes: 15, genre: "和風", method: "焼く", course: "主菜", note: "高知の名物。かつおの表面だけを焼いて香ばしくし、塩やポン酢で食べるよ。坂本龍馬も好んだと言われるよ。", ingredients: [
    { name: "かつお", match: ["かつお", "カツオ"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["かつおの表面を強火でさっと炙る", "厚めに切って玉ねぎと大葉を添え、塩やポン酢で"], tip: "中は生、外は香ばしいのがたたきの命です" },
  { id: "rg-taimeshi", title: "鯛めし風", minutes: 20, genre: "和風", method: "煮る", course: "主食", note: "愛媛の郷土ごはん。宇和島では鯛のお刺身を卵のタレにからめてごはんにのせる、珍しい食べ方が有名だよ。", ingredients: [
    { name: "鯛", match: ["鯛", "たい"], per: 1, unit: "切れ" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
  ], steps: ["鯛を焼いてほぐし、炊きたてごはんに混ぜる（ごはんは別に用意）", "好みで卵黄をタレに混ぜてかけても"], tip: "鯛のアラでだしを取るとごちそう感が増します" },
  { id: "rg-imotaki", title: "愛媛の芋炊き風", minutes: 25, genre: "和風", method: "煮る", course: "副菜", note: "愛媛の秋の味。河原で大きな鍋で里芋を炊く『いもたき』は、松山の秋の風物詩だよ。", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "こんにゃく", match: ["こんにゃく"], per: 0.5, unit: "枚" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["材料をだしで煮る", "醤油と砂糖でほんのり甘く仕上げる"], tip: "里芋の形が残るよう煮すぎないのがコツです" },
  // ---- 九州 ----
  { id: "rg-chicken-nanban", title: "宮崎チキン南蛮", minutes: 25, genre: "洋風", method: "揚げる", course: "主菜", note: "宮崎の名物。揚げた鶏肉を甘酢にくぐらせて、タルタルソースをたっぷり。洋食屋さんのまかないが始まりだと言われるよ。", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
    { name: "酢", match: ["酢"], per: 1, unit: "大さじ" },
  ], steps: ["鶏肉に衣をつけて揚げ、甘酢にくぐらせる", "ゆで卵のタルタルソースをたっぷりのせる"], tip: "タルタルは卵を粗く崩すと食べ応えが出ます" },
  { id: "rg-champon", title: "長崎ちゃんぽん", minutes: 20, genre: "中華", method: "煮る", course: "主食", note: "長崎の名物麺。中国から来た料理が元になり、太麺に海と山の具をたっぷりのせるよ。『ちゃんぽん』は混ぜるという意味だと言われるよ。", ingredients: [
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
  ], steps: ["豚肉と野菜を炒めてスープで煮る", "麺を入れてひと煮立ちさせる"], tip: "具だくさんにするほどちゃんぽんらしくなります" },
  { id: "rg-tonkotsu", title: "博多とんこつラーメン風", minutes: 20, genre: "中華", method: "ゆでる", course: "主食", note: "福岡・博多の名物。白く濁った豚骨スープと細い麺が特徴。麺のおかわり『替え玉』も博多の文化だよ。", ingredients: [
    { name: "ラーメン", match: ["ラーメン", "中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["豚骨風スープ（市販の素でOK）で麺を短めにゆでる", "焼いた豚肉とねぎをのせる"], tip: "紅生姜をのせると博多らしくなります" },
  { id: "rg-satsumajiru", title: "鹿児島さつま汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", note: "鹿児島の郷土汁。さつまいもと豚肉を味噌で煮込む、甘みのあるお汁。薩摩は今の鹿児島の昔の名前だよ。", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 75, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["豚肉と野菜をだしで煮る", "味噌を溶いて仕上げる"], tip: "さつまいもの甘みが味噌とよく合います" },
  // ---- 沖縄 ----
  { id: "rg-rafute", title: "ラフテー風・豚の角煮", minutes: 40, genre: "和風", method: "煮る", course: "主菜", note: "沖縄の豚の角煮。黒糖でとろとろに煮る、沖縄の長寿の食卓を支えるごちそうだよ。", ingredients: [
    { name: "豚バラ肉", match: ["豚バラ", "豚肉"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["豚バラを下茹でして脂を落とす", "黒糖（砂糖で代用）と醤油で弱火でとろとろに煮る"], tip: "一度冷ますと味がしみてさらに柔らかくなります" },
  { id: "rg-okinawa-soba", title: "沖縄そば風", minutes: 20, genre: "和風", method: "ゆでる", course: "主食", note: "沖縄の日常麺。『そば』と言っても小麦の麺で、かつおと豚のだしに三枚肉やかまぼこをのせるよ。", ingredients: [
    { name: "中華麺", match: ["中華麺", "沖縄そば"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["麺をゆでてかつおだしのスープに入れる", "甘辛く煮た豚肉とかまぼこ、ねぎをのせる"], tip: "紅生姜を添えるのが沖縄流です" },
  { id: "rg-sata-andagi", title: "サーターアンダギー風", minutes: 20, genre: "和風", method: "揚げる", course: "デザート", note: "沖縄の、ドーナツみたいなお菓子。揚げると口がパカッと割れて、花が咲いたみたいになる笑顔のおやつだよ。", ingredients: [
    { name: "小麦粉", match: ["小麦粉"], per: 3, unit: "大さじ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["材料を混ぜて丸める（ベーキングパウダー小さじ1/2を加える）", "低めの油でじっくり揚げる"], tip: "低温でじっくり揚げるときれいに割れます" },
];

// ============================================================
// 郷土料理の大幅拡充（2026-11-10「できるだけ多く追加して」）
// 全47都道府県の名物をカバーするため、材料は
// [名前, マッチ, 1人分, 単位] のタプルで書くコンパクト記法 RG を使う。
// pref は都道府県名。note は子ども向けの由来メモ（県名から書き出す）。
// ============================================================
const RG = (id, title, minutes, genre, method, course, pref, note, ingredients, steps, tip) => ({
  id, title, minutes, genre, method, course, pref, note,
  ingredients: ingredients.map(([name, match, per, unit]) => ({ name, match, per, unit })),
  steps, tip,
});
export const REGIONAL_RECIPES_MORE = [
  // ---- 北海道（追加6品） ----
  RG("rg2-soupcurry", "札幌スープカレー風", 35, "洋風", "煮る", "主菜", "北海道", "北海道・札幌生まれの、さらさらカレーのスープに大きな野菜がごろごろ入った名物。ごはんをスープにつけて食べるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["かぼちゃ", ["かぼちゃ", "南瓜"], 50, "g"], ["ピーマン", ["ピーマン"], 1, "個"], ["カレー粉", ["カレー粉", "カレールー"], 1, "大さじ"]], ["鶏肉と野菜を大きめに切って炒める", "水とカレー粉で煮て、塩で味を調える"], "野菜は素揚げすると本場っぽくなります"),
  RG("rg2-zangi", "ザンギ（北海道の鶏唐揚げ）", 25, "和風", "揚げる", "主菜", "北海道", "北海道の唐揚げは『ザンギ』と呼ばれるよ。下味をしっかりつけるのが北海道流。名前は中国の鶏の揚げ物から来たと言われるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["鶏肉を生姜・醤油に30分漬ける", "片栗粉をまぶしてカラッと揚げる"], "漬け時間を長くすると味が濃くなります"),
  RG("rg2-ikameshi", "函館いかめし風", 40, "和風", "煮る", "主食", "北海道", "北海道・森町で生まれた駅弁の王様。イカの中にお米を詰めて、甘辛く煮るよ。戦時中の食糧不足のときに考えられた工夫の味だよ。", [["いか", ["いか", "イカ"], 1, "杯"], ["米", ["米", "ごはん"], 75, "g"]], ["イカの胴に洗った米を7分目まで詰める", "醤油・砂糖・みりんの汁で落し蓋をして煮る"], "米は詰めすぎると破裂するので7分目までに"),
  RG("rg2-butadon", "帯広豚丼風", 20, "和風", "焼く", "主食", "北海道", "北海道・帯広の名物丼。厚い豚肉を炭火のような香ばしさで焼いて、甘辛タレでごはんにのせるよ。", [["豚ロース", ["豚ロース", "豚肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["豚肉を両面こんがり焼く", "砂糖・醤油・みりんのタレを絡めてごはんにのせる（ごはんは別に用意）"], "タレを焦がし気味にすると香ばしくなります"),
  RG("rg2-ramensalad", "ラーメンサラダ", 15, "洋風", "サラダ", "副菜", "北海道", "北海道・札幌の居酒屋で生まれた、冷たい中華麺のサラダ。麺なのにサラダ、サラダなのに麺という楽しい名物だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["レタス", ["レタス"], 40, "g"], ["トマト", ["トマト"], 0.5, "個"], ["ハム", ["ハム"], 20, "g"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["麺をゆでて冷水でしめる", "野菜とハムをのせ、ごまドレッシング風にマヨネーズと醤油で和える"], "きゅうりを足すとさっぱりします"),
  RG("rg2-sanpeijiru", "三平汁", 25, "和風", "スープ", "汁物", "北海道", "北海道の漁師のお汁。塩漬けの鮭と根菜を煮た、体が温まる汁物だよ。名前は昔の漁師さんの名前から来たと言われるよ。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["大根", ["大根", "だいこん"], 50, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["根菜をだしで煮る", "鮭を入れて塩味で仕上げる"], "鮭が塩味の場合は味付けを控えめに"),
  // ---- 東北（追加8品） ----
  RG("rg2-barayaki", "十和田バラ焼き風", 20, "和風", "焼く", "主菜", "青森県", "青森県・十和田市の名物。牛バラ肉と山盛りの玉ねぎを、甘辛タレで鉄板で焼くよ。ごはんがどんどん進む味だよ。", [["牛肉", ["牛肉"], 75, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"]], ["玉ねぎを山盛りに敷いて牛肉をのせて焼く", "甘辛タレを回しかけて炒め合わせる"], "玉ねぎは多めがバラ焼きの決まりです"),
  RG("rg2-jajamen", "盛岡じゃじゃ麺風", 20, "中華", "ゆでる", "主食", "岩手県", "岩手県・盛岡の名物麺。うどんに肉味噌ときゅうりをのせて混ぜて食べ、最後は卵スープ『チータンタン』で締めるよ。", [["うどん", ["うどん"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["ひき肉と味噌で肉味噌を作る", "ゆでたうどんに肉味噌と千切りきゅうりをのせ、よく混ぜて食べる"], "食べ終わりの麺に卵とゆで汁を足すとチータンタンになります"),
  RG("rg2-gyutan", "仙台牛タン焼き風", 20, "和風", "焼く", "主菜", "宮城県", "宮城県・仙台の名物。厚切りの牛タンを焼いて、麦めしとテールスープと一緒に食べるのが仙台流だよ。", [["牛タン", ["牛タン", "牛肉"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"], ["キャベツ", ["キャベツ"], 30, "g"]], ["牛タンに塩を振って強火で両面焼く", "浅漬け風キャベツとねぎを添える（ごはんは別に用意）"], "厚切りは中を少しピンクに残すとやわらかいです"),
  RG("rg2-harakomeshi", "はらこ飯風", 25, "和風", "煮る", "主食", "宮城県", "宮城県・亘理（わたり）の郷土ごはん。鮭の煮汁で炊いたごはんに鮭といくらをのせる、親と子のごちそうだよ（はらこはいくらのこと）。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["いくら", ["いくら"], 20, "g"], ["米", ["米", "ごはん"], 75, "g"]], ["鮭を醤油で煮て、煮汁でごはんを炊く", "ごはんに鮭の身といくらをのせる"], "いくらは食べる直前にのせるとつやつやです"),
  RG("rg2-yokoteyakisoba", "横手やきそば風", 20, "和風", "焼く", "主食", "秋田県", "秋田県・横手市の名物。太めのゆで麺にひき肉と目玉焼きをのせるのが特徴で、福神漬けを添えるよ。", [["中華麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["麺とひき肉・キャベツをソースで炒める", "目玉焼きをのせて完成"], "半熟の目玉焼きを崩して混ぜるのが横手流です"),
  RG("rg2-tsumetainikusoba", "河北の冷たい肉そば風", 20, "和風", "ゆでる", "主食", "山形県", "山形県・河北町の名物。冷たいそばに、甘くない鶏だしの冷たいおつゆをかける、夏に人気のそばだよ。", [["そば", ["そば"], 1, "束"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["鶏肉をだしで煮て、その汁を冷やしてつゆにする", "冷たくしめたそばに鶏肉とねぎをのせ、冷たいつゆをかける"], "つゆは鶏の脂が固まらないよう一度冷ますのがコツ"),
  RG("rg2-kitakata", "喜多方ラーメン風", 20, "中華", "ゆでる", "主食", "福島県", "福島県・喜多方の名物。平たくて縮れた麺と、すっきり醤油スープ。喜多方では朝からラーメンを食べる『朝ラー』の文化があるよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["醤油味のスープ（市販の素でOK）で麺をゆでる", "焼いた豚肉とねぎをのせる"], "麺は平打ち縮れ麺が本場です"),
  RG("rg2-enbangyoza", "福島円盤餃子風", 25, "中華", "焼く", "主菜", "福島県", "福島県・福島市の名物。餃子をフライパンに円盤のように丸く並べて焼くから、この名前だよ。野菜たっぷりで軽く食べられるよ。", [["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["餃子の皮", ["餃子の皮"], 8, "枚"]], ["キャベツ多めの餡を皮で包む", "フライパンに丸く並べて水を入れて蒸し焼きにする"], "円盤の真ん中まで火が通るよう蓋をして蒸らします"),
  // ---- 関東（追加9品） ----
  RG("rg2-ankonabe", "あんこう鍋風", 30, "和風", "煮る", "主菜", "茨城県", "茨城県の冬の名物。『西のふぐ、東のあんこう』と言われる深海魚を、あん肝（きも）を溶いた味噌で煮る豪快な鍋だよ。", [["あんこう", ["あんこう"], 100, "g"], ["白菜", ["白菜"], 0.125, "玉"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["豆腐", ["豆腐"], 0.5, "丁"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["野菜とあんこうをだしで煮る", "あん肝（なければ味噌だけ）を溶いて仕上げる"], "あんこうは専門のお店や切り身で買うのが安心です"),
  RG("rg2-sanoramen", "佐野ラーメン風", 20, "中華", "ゆでる", "主食", "栃木県", "栃木県・佐野市の名物。青竹で打った平たい麺と、あっさり醤油スープが特徴だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["あっさり醤油スープで麺をゆでる", "焼いた豚肉とねぎをのせる"], "麺は平たくてつるつるしたものが佐野流です"),
  RG("rg2-utsunomiyagyoza", "宇都宮餃子風", 25, "中華", "焼く", "主菜", "栃木県", "栃木県・宇都宮市は餃子の街として有名。野菜多めの餡で、たくさん食べられるヘルシーな餃子だよ。", [["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["にら", ["にら"], 0.25, "束"], ["餃子の皮", ["餃子の皮"], 8, "枚"]], ["野菜多めの餡を皮で包む", "フライパンで蒸し焼きにして底をカリッとさせる"], "酢とこしょうだけで食べる宇都宮流も人気です"),
  RG("rg2-yakimanju", "焼きまんじゅう風", 20, "和風", "焼く", "デザート", "群馬県", "群馬県のソウルフード。ふかふかのおまんじゅうを竹串に刺して、甘い味噌ダレを塗って炭火で焼くおやつだよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["小麦粉の生地を蒸して（または蒸しパンで代用）まんじゅう状にする", "味噌と砂糖のタレを塗ってフライパンで焼き色をつける"], "タレは塗っては焼くを2回繰り返すとおいしくなります"),
  RG("rg2-mizusawaudon", "水沢うどん風", 15, "和風", "ゆでる", "主食", "群馬県", "群馬県・渋川市の名物で、日本三大うどんのひとつと言われるよ。つるつるの麺を、冷たいごまつゆで食べるのが水沢流だよ。", [["うどん", ["うどん"], 1, "玉"], ["ごま", ["ごま"], 1, "大さじ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["うどんをゆでて冷水でしめる", "すりごまとつゆを合わせた冷たいごまつゆで食べる"], "舞茸の天ぷらを添えるのが本場の定番です"),
  RG("rg2-katsuura-tantan", "勝浦タンタンメン風", 20, "中華", "煮る", "主食", "千葉県", "千葉県・勝浦市の名物。ラー油の辛いスープに、ひき肉と玉ねぎがたっぷり。寒い海で働く漁師さんが体を温めるために生まれた味だよ（おうち版は辛さ控えめで）。", [["中華麺", ["中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["玉ねぎとひき肉を炒めてスープで煮る", "麺を入れて、ラー油は大人の分だけ後がけにする"], "玉ねぎの甘さが勝浦式のポイントです"),
  RG("rg2-namero", "なめろう風", 15, "和風", "和える", "副菜", "千葉県", "千葉県の漁師ごはん。あじを細かくたたいて味噌と薬味と混ぜるよ。『皿をなめるほどおいしい』が名前の由来と言われるよ。", [["あじ", ["あじ", "アジ"], 1, "尾"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["あじの身を包丁で細かくたたく", "味噌・大葉・生姜と混ぜ合わせる"], "新鮮なあじで作るのが漁師流。焼くとさんが焼きになります"),
  RG("rg2-sanmamen", "横浜サンマーメン風", 20, "中華", "煮る", "主食", "神奈川県", "神奈川県・横浜の名物麺。細麺の上に、とろみのある熱い野菜あんをたっぷりかけるよ。名前の『サンマー』は『生（なま）の馬』という中国語から来たと言われるよ。", [["中華麺", ["中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["キャベツ", ["キャベツ"], 40, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["豚肉と野菜を炒めてスープで煮て、片栗粉でとろみをつける", "ゆでた麺に熱いあんをかける"], "あんは冷めにくいので、猫舌さんは気をつけて"),
  RG("rg2-zeryfry", "行田ゼリーフライ風", 25, "和風", "揚げる", "副菜", "埼玉県", "埼玉県・行田市の名物。じゃがいもとおからのコロッケのような揚げ物で、形が小判に似ていて『銭（ぜに）フライ』から名前がついたと言われるよ。", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["おから", ["おから"], 25, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ソース", ["ソース"], 1, "大さじ"]], ["茹でたじゃがいもとおからを混ぜて小判型に丸める", "油で揚げてソースをかける（衣はつけないのが本場流）"], "衣なしで揚げるのがゼリーフライの特徴です"),
  // ---- 中部（追加12品） ----
  RG("rg2-tarekatsu", "新潟タレカツ丼風", 25, "和風", "揚げる", "主食", "新潟県", "新潟市の名物。うすめのとんかつを甘辛い醤油ダレにくぐらせてごはんにのせるだけ、というシンプルな丼だよ。", [["豚肉", ["豚ロース", "豚肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["豚肉をうすく伸ばしてカツに揚げる", "醤油・砂糖・みりんの熱いタレにくぐらせ、ごはんにのせる（ごはんは別に用意）"], "キャベツはのせないのがタレカツ流です"),
  RG("rg2-hegisoba", "へぎそば風", 15, "和風", "ゆでる", "主食", "新潟県", "新潟県・魚沼地方の名物。つなぎに海藻の布海苔（ふのり）を使ったそばを、『へぎ』という木の器に一口ずつ盛るよ。", [["そば", ["そば"], 1, "束"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["そばをゆでて冷水でしめる", "一口大に丸めて器に盛り、薬味を添える"], "からしで食べるのも魚沼の習慣です"),
  RG("rg2-blackramen", "富山ブラックラーメン風", 20, "中華", "ゆでる", "主食", "富山県", "富山県の名物。真っ黒な醤油スープが特徴で、もともとは肉体労働の人の塩分補給のために生まれた味だよ（おうち版はほどほどの濃さで）。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"]], ["濃い醤油色のスープで麺をゆでる", "焼いた豚肉と山盛りのねぎをのせる"], "黒こしょうを効かせるのがブラック流です"),
  RG("rg2-masuzushi", "ます寿司風", 20, "和風", "和える", "主食", "富山県", "富山県の駅弁の名物。ます（鱒）の切り身を酢飯にのせて、笹の葉で包んで押したお寿司だよ。丸い形が特徴だよ。", [["ます", ["ます", "鱒", "鮭"], 1, "切れ"], ["米", ["米", "ごはん"], 75, "g"], ["酢", ["酢"], 1, "大さじ"]], ["ごはんに酢と砂糖を混ぜて酢飯にする", "ますの切り身をのせて押し寿司の形に整える"], "笹やラップに包んで少し置くと形がなじみます"),
  RG("rg2-jibuni", "金沢治部煮風", 30, "和風", "煮る", "主菜", "石川県", "石川県・金沢の郷土料理。鶏肉（本来は鴨）に小麦粉をまぶしてとろみのある汁で煮るよ。名前の『治部』は昔の人の名前から来たと言われるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["しいたけ", ["しいたけ"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["小麦粉", ["小麦粉"], 1, "大さじ"]], ["鶏肉に小麦粉をまぶす", "野菜と一緒に甘辛いだしで煮て、自然なとろみをつける"], "わさびを添えるのが金沢流です"),
  RG("rg2-kanazawacurry", "金沢カレー風", 30, "洋風", "煮る", "主食", "石川県", "石川県・金沢の名物カレー。どろっと濃いルーにとんかつとキャベツ、ステンレスの器が本場のスタイルだよ。", [["豚肉", ["豚ロース", "豚肉"], 75, "g"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["カレールー", ["カレールー", "ルー"], 1, "かけ"], ["キャベツ", ["キャベツ"], 40, "g"]], ["豚肉をカツに揚げる", "濃いカレーをごはんにかけ、カツと千切りキャベツをのせる（ごはんは別に用意）"], "ソースをカツに少し回しかけるのも金沢流です"),
  RG("rg2-saucekatsu", "福井ソースカツ丼風", 25, "洋風", "揚げる", "主食", "福井県", "福井県の名物。うすく大きなとんかつを特製のウスター系ソースにくぐらせて、白いごはんにのせるシンプルな丼だよ。", [["豚肉", ["豚ロース", "豚肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["ソース", ["ソース"], 1.5, "大さじ"]], ["豚肉をうすく伸ばして細かいパン粉でカツに揚げる", "温めたソースにくぐらせてごはんにのせる（ごはんは別に用意）"], "細かいパン粉でサクサクにするのが福井流です"),
  RG("rg2-oroshisoba", "越前おろしそば風", 15, "和風", "ゆでる", "主食", "福井県", "福井県の名物そば。冷たいそばに大根おろしと鰹節をのせて、濃いめのおつゆをかけるよ。大根の辛みがポイントだよ。", [["そば", ["そば"], 1, "束"], ["大根", ["大根", "だいこん"], 75, "g"], ["かつお節", ["かつお節"], 2, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["そばをゆでて冷水でしめる", "大根おろしと鰹節・ねぎをのせ、冷たいつゆをかける"], "大根おろしの汁も一緒にかけるのが越前流です"),
  RG("rg2-oyaki", "信州おやき風", 30, "和風", "焼く", "副菜", "長野県", "長野県の郷土おやつ。小麦粉の皮で野沢菜やあんこを包んで焼くよ。寒い山国で生まれた、保存の知恵のおやきだよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["野沢菜", ["野沢菜", "高菜"], 25, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["小麦粉の生地を練って休ませ、野沢菜を包む", "フライパンで両面をこんがり焼く（蒸し焼きに）"], "具は野沢菜・あんこ・かぼちゃなど家々で違います"),
  RG("rg2-keichan", "岐阜けいちゃん風", 20, "和風", "焼く", "主菜", "岐阜県", "岐阜県・奥美濃の郷土料理。味噌ダレに漬けた鶏肉（けいちゃん）をキャベツと一緒に焼くよ。名前は『鶏ちゃん』から来ているよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["鶏肉を味噌ダレに漬ける", "キャベツと一緒にフライパンで焼く"], "うどんを一緒に焼くのも人気の食べ方です"),
  RG("rg2-iseudon", "伊勢うどん風", 15, "和風", "ゆでる", "主食", "三重県", "三重県・伊勢の名物。太くてやわらかい麺に、真っ黒なたまり醤油のタレをかけるよ。伊勢神宮への旅人のために早く出せるよう、麺を茹で置いたのが始まりと言われるよ。", [["うどん", ["うどん"], 1, "玉"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["太いうどんをやわらかくゆでる", "たまり醤油風の濃いタレをかけ、ねぎをのせてよく混ぜる"], "卵の黄身をのせるとまろやかになります"),
  RG("rg2-misonikomi", "味噌煮込みうどん風", 25, "和風", "煮る", "主食", "愛知県", "愛知県・名古屋の名物。赤味噌の汁で生のうどんを土鍋で煮込むよ。麺に芯が残るくらいが本場の食感だよ。", [["うどん", ["うどん"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["土鍋（鍋）に赤味噌の汁を作り鶏肉を煮る", "うどんをそのまま入れて煮込み、最後に卵を落とす"], "蓋を食器代わりにして食べるのが名古屋流です"),
  RG("rg2-hitsumabushi", "ひつまぶし風", 25, "和風", "焼く", "主食", "愛知県", "愛知県・名古屋の名物。刻んだうなぎの蒲焼をごはんにのせて、①そのまま②薬味③だし茶漬け、と3回楽しむ食べ方だよ。", [["うなぎ", ["うなぎ"], 0.5, "尾"], ["米", ["米", "ごはん"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["うなぎを温めて細かく刻む", "ごはんにのせ、最後はだしをかけてお茶漬け風に"], "わさびと海苔の薬味を用意すると本格的です"),
  // ---- 関西（追加8品） ----
  RG("rg2-nishinsoba", "京都にしんそば風", 20, "和風", "ゆでる", "主食", "京都府", "京都府の名物そば。甘く煮たにしんをそばにのせるよ。海から遠い京都で、保存のきく干物のにしんがごちそうだったんだ。", [["そば", ["そば"], 1, "束"], ["にしん", ["にしん"], 1, "切れ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["にしんを甘辛く煮る（ソフト身欠きにしんで代用可）", "温かいそばにのせる"], "九条ねぎを散らすのが京都流です"),
  RG("rg2-yubagohan", "湯葉あんかけごはん風", 20, "和風", "煮る", "主食", "京都府", "京都府の精進（しょうじん）の味。豆乳を温めるとできる薄い膜『湯葉』を、とろとろのあんにしてごはんにかけるよ。", [["湯葉", ["湯葉"], 25, "g"], ["しいたけ", ["しいたけ"], 1, "個"], ["米", ["米", "ごはん"], 75, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["だしでしいたけを煮て片栗粉でとろみをつける", "湯葉を入れて、炊きたてごはんにかける"], "生姜のすりおろしを添えると料亭の味になります"),
  RG("rg2-akashiyaki", "明石焼き風", 20, "和風", "焼く", "主食", "兵庫県", "兵庫県・明石市の名物。たこ焼きの先祖と言われ、卵たっぷりのふわふわ生地を、だしにつけて食べるよ。地元では『玉子焼』と呼ぶよ。", [["卵", ["卵", "たまご"], 1, "個"], ["小麦粉", ["小麦粉"], 2, "大さじ"], ["たこ", ["たこ"], 30, "g"]], ["卵と小麦粉のゆるい生地にたこを入れて丸く焼く", "温かいだしにつけて食べる"], "だしは熱々を用意するとおいしくいただけます"),
  RG("rg2-sobameshi", "神戸そばめし風", 20, "洋風", "焼く", "主食", "兵庫県", "兵庫県・神戸市長田区の名物。焼きそばとごはんを一緒に炒めるよ。お好み焼き屋さんで生まれた、子どもに人気の味だよ。", [["中華麺", ["焼きそば麺", "中華麺"], 0.5, "玉"], ["米", ["米", "ごはん"], 75, "g"], ["豚肉", ["豚肉"], 40, "g"], ["キャベツ", ["キャベツ"], 40, "g"], ["ソース", ["ソース"], 1.5, "大さじ"]], ["麺を細かく刻む", "ごはんと豚肉・キャベツと一緒にソースで炒める"], "目玉焼きをのせると長田流です"),
  RG("rg2-kakinohazushi", "柿の葉寿司風", 20, "和風", "和える", "主食", "奈良県", "奈良県の郷土寿司。一口の酢飯と鮭を柿の葉で包むよ。柿の葉には食べ物を守る力があり、山里の保存の知恵なんだ。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["米", ["米", "ごはん"], 75, "g"], ["酢", ["酢"], 1, "大さじ"]], ["酢飯を作り、焼いた鮭をほぐす", "一口大ににぎって鮭をのせ、ラップ（あれば柿の葉）で包んでなじませる"], "さばでも作るのが本場です"),
  RG("rg2-meharizushi", "めはり寿司風", 15, "和風", "和える", "主食", "和歌山県", "和歌山県・熊野地方の郷土ごはん。高菜の葉でごはんを包んだ大きなおにぎり。あまりのおいしさに『目を見張る』ことが名前の由来と言われるよ。", [["高菜", ["高菜"], 25, "g"], ["米", ["米", "ごはん"], 100, "g"]], ["高菜の葉を塩抜きして広げる", "ごはんを包んで大きなおにぎりにする"], "高菜の茎を刻んでごはんに混ぜてもおいしいです"),
  RG("rg2-wakayamaramen", "和歌山ラーメン風", 20, "中華", "ゆでる", "主食", "和歌山県", "和歌山県の名物。醤油豚骨の濃いスープと細麺。ラーメン屋さんのテーブルに早ずし（鯖寿司）が置いてあるのが和歌山の不思議な習慣だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["かまぼこ", ["かまぼこ"], 2, "切れ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["豚骨醤油スープ（市販の素でOK）で細麺をゆでる", "豚肉とかまぼこ、ねぎをのせる"], "ゆで卵を半分に切ってのせると本場っぽくなります"),
  RG("rg2-omigyusukiyaki", "近江牛すき焼き風", 25, "和風", "煮る", "主菜", "滋賀県", "滋賀県のごちそう。『近江牛』は日本で古くから続くブランド牛のひとつ。そのお肉のすき焼きは特別な日の味だよ。", [["牛肉", ["牛肉"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"], ["豆腐", ["豆腐"], 0.5, "丁"], ["しらたき", ["しらたき"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["割り下（醤油・砂糖・みりん）で牛肉と野菜を煮る", "溶き卵につけて食べる"], "最初に牛肉だけを焼いて食べるのが関西流です"),
  // ---- 中国（追加6品） ----
  RG("rg2-gyukotsuramen", "鳥取牛骨ラーメン風", 20, "中華", "ゆでる", "主食", "鳥取県", "鳥取県の名物。牛の骨でだしを取る、甘みとコクのあるスープが特徴だよ。戦後から続く東・中部の鳥取の味だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["牛肉", ["牛肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["牛骨風スープ（牛だしの素で代用）で麺をゆでる", "焼いた牛肉とねぎをのせる"], "もやしとメンマをのせると本場っぽくなります"),
  RG("rg2-izumosoba", "出雲そば風", 15, "和風", "ゆでる", "主食", "島根県", "島根県・出雲の名物。殻ごと挽いた黒っぽいそばを、三段の丸い器（割子）に盛って、つゆをかけて食べるよ。", [["そば", ["そば"], 1, "束"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"], ["大根", ["大根", "だいこん"], 30, "g"]], ["そばをゆでて冷水でしめる", "小分けの器に盛り、大根おろしとねぎをのせてつゆをかける"], "残ったそば湯に最後の段のつゆを入れて飲むのが出雲流です"),
  RG("rg2-ebimeshi", "岡山えびめし風", 20, "洋風", "焼く", "主食", "岡山県", "岡山県の名物。えびとごはんをカラメル色のソースで炒めた、真っ黒い見た目が楽しい炒めごはんだよ。", [["えび", ["えび", "海老"], 3, "尾"], ["米", ["米", "ごはん"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["玉ねぎとえびを炒める", "ごはんを加え、デミグラス風ソースとカラメルで黒く炒める"], "錦糸卵をのせると岡山の食堂風になります"),
  RG("rg2-hiroshimatsukemen", "広島つけ麺風", 20, "中華", "ゆでる", "主食", "広島県", "広島県の名物。冷たい麺を、ラー油のきいた辛いつけダレで食べるよ（おうち版は辛さなし〜控えめで）。茹でキャベツが名脇役だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["キャベツ", ["キャベツ"], 50, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["卵", ["卵", "たまご"], 1, "個"]], ["麺をゆでて冷水でしめ、野菜を茹でる", "醤油ダレ（ラー油は大人の分だけ）に麺をつけて食べる"], "ゆで卵を添えるのが広島流です"),
  RG("rg2-hiruzenyakisoba", "ひるぜん焼そば風", 20, "和風", "焼く", "主食", "岡山県", "岡山県・蒜山（ひるぜん）高原の名物。味噌味に近い特製ダレと鶏肉で焼く焼きそばだよ。高原のご当地グルメ大会で有名になったよ。", [["中華麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["キャベツ", ["キャベツ"], 50, "g"]], ["鶏肉とキャベツを炒める", "麺を加え、味噌風味の甘辛ダレで炒める"], "高原キャベツの甘さが主役です"),
  RG("rg2-fukuzosui", "山口ふく雑炊風", 25, "和風", "煮る", "主食", "山口県", "山口県ではふぐのことを『ふく（福）』と呼ぶよ。ふぐのお鍋の締めに作る雑炊が、だしのうま味たっぷりのごちそうだよ（ふぐは資格のある人のものを）。", [["ふぐ", ["ふぐ"], 50, "g"], ["米", ["米", "ごはん"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["ふぐと野菜を煮ただしにごはんを入れる（ふぐは専門の切り身を使う）", "溶き卵を回し入れ、ねぎを散らす"], "ふぐは必ず専門店の処理済みのものを使ってください"),
  // ---- 四国（追加6品） ----
  RG("rg2-tokushimaramen", "徳島ラーメン風", 20, "中華", "ゆでる", "主食", "徳島県", "徳島県の名物。濃い茶色の豚骨醤油スープに、甘辛く煮た豚バラと生卵をのせるよ。ごはんのおかずになるラーメンだよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚バラ", "豚肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["もやし", ["もやし"], 0.5, "袋"]], ["豚肉を甘辛く煮る", "濃いスープで麺をゆで、豚肉・もやし・生卵（月見）をのせる"], "すき焼きのような甘辛さが徳島流です"),
  RG("rg2-taraiudon", "徳島たらいうどん風", 20, "和風", "ゆでる", "主食", "徳島県", "徳島県・阿波市の名物。大きな『たらい』に熱いうどんを入れて、みんなで温かい生姜のつゆにつけて食べるよ。", [["うどん", ["うどん"], 1, "玉"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["太いうどんを熱々でゆでる", "生姜を入れた温かいだしつゆで、みんなでつついて食べる"], "たらいがなければ大きな鍋やボウルでOKです"),
  RG("rg2-honebutsudori", "香川骨付鳥風", 30, "和風", "焼く", "主菜", "香川県", "香川県・丸亀の名物。骨のついた鶏もも肉を、にんにくとスパイスを効かせてこんがり焼くよ。豪快にかぶりつくのが本場流だよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "骨付き鶏"], 150, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["鶏肉に塩こしょうとにんにくをすり込む", "オーブンやフライパンで皮をパリッと焼く"], "肉汁にキャベツをつけて食べるのが丸亀流です"),
  RG("rg2-yakibutatamago", "今治焼豚玉子飯風", 20, "中華", "焼く", "主食", "愛媛県", "愛媛県・今治市の名物。甘いタレの焼豚と目玉焼きをごはんにのせた、元中華料理屋さんのまかない丼だよ。", [["豚肉", ["豚肉"], 75, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["豚肉を甘辛く焼豚風に焼く", "ごはんに焼豚と半熟目玉焼きをのせ、タレを回しかける"], "目玉焼きは2つが今治の定番スタイルです"),
  RG("rg2-jakoten", "宇和島じゃこ天風", 20, "和風", "揚げる", "副菜", "愛媛県", "愛媛県・宇和島の名物。小魚を骨ごとすり身にして揚げた天ぷらで、カルシウムたっぷりだよ。そのまま焼いて食べてもおいしいよ。", [["じゃこ", ["じゃこ", "しらす"], 30, "g"], ["豆腐", ["豆腐"], 0.25, "丁"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["じゃこと豆腐・片栗粉を混ぜて平たくまとめる", "油で両面をこんがり揚げ焼きする"], "大根おろしと生姜を添えるのが宇和島流です"),
  RG("rg2-nabeyakiramen", "須崎鍋焼きラーメン風", 20, "中華", "煮る", "主食", "高知県", "高知県・須崎市の名物。土鍋でぐつぐつ煮た熱いラーメンで、鶏だしと細麺、ちくわと生卵が特徴だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["ちくわ", ["ちくわ"], 1, "本"], ["卵", ["卵", "たまご"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["土鍋で鶏だしのスープを沸かし、麺と鶏肉・ちくわを煮る", "生卵を落として半熟で食べる"], "最後まで熱々なので、取り皿に移して食べてね"),
  // ---- 九州（追加9品） ----
  RG("rg2-motsunabe", "博多もつ鍋風", 30, "和風", "煮る", "主菜", "福岡県", "福岡県・博多の名物鍋。牛もつと山盛りのキャベツ・にらを、醤油や味噌の汁で煮るよ。締めのちゃんぽん麺までが本場の楽しみだよ。", [["もつ", ["牛もつ", "もつ"], 75, "g"], ["キャベツ", ["キャベツ"], 75, "g"], ["にら", ["にら"], 0.5, "束"], ["豆腐", ["豆腐"], 0.5, "丁"]], ["キャベツともつをだしで煮る", "にらと豆腐を入れて、醤油（または味噌）で仕上げる"], "にんにくと唐辛子は大人の分だけ後がけに"),
  RG("rg2-mizutaki", "博多水炊き風", 35, "和風", "煮る", "主菜", "福岡県", "福岡県・博多の鶏鍋。鶏を水から煮て白いスープを取り、肉と野菜をポン酢で食べるよ。最初にスープを塩で飲むのが博多の作法だよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["白菜", ["白菜"], 0.125, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["ポン酢", ["ポン酢"], 1.5, "大さじ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["鶏肉を水から煮て白いスープを取る", "野菜と豆腐を煮て、ポン酢で食べる"], "つくねを入れると子どもも大喜びです"),
  RG("rg2-shishirian", "佐賀シシリアンライス風", 20, "洋風", "焼く", "主食", "佐賀県", "佐賀市の名物洋食。温かいごはんに甘辛い牛肉と生野菜をのせて、マヨネーズをかけたワンプレートだよ。名前の由来は諸説ある不思議なご当地グルメだよ。", [["牛肉", ["牛肉"], 75, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["牛肉と玉ねぎを甘辛く炒める", "ごはんに生野菜と牛肉をのせ、マヨネーズをかける"], "温泉卵をのせるアレンジも人気です"),
  RG("rg2-saraudon", "長崎皿うどん", 25, "中華", "煮る", "主食", "長崎県", "長崎県の名物。パリパリの細い揚げ麺に、とろみのある具だくさんのあんをかけるよ。ちゃんぽんの兄弟分だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["えび", ["えび", "海老"], 2, "尾"], ["キャベツ", ["キャベツ"], 40, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["麺を油でパリッと揚げる（揚げ麺を使ってもOK）", "豚肉と具材を炒めてあんを作り、麺にかける"], "ウスターソースやお酢をかけて味変するのが長崎流です"),
  RG("rg2-taiyoyen", "熊太平燕風", 20, "中華", "スープ", "主食", "熊本県", "熊本県の名物麺。中国生まれの『太平燕（タイピーエン）』は、春雨の麺が特徴。熊本の学校給食でもおなじみの味だよ。", [["春雨", ["春雨"], 25, "g"], ["豚肉", ["豚肉"], 40, "g"], ["えび", ["えび", "海老"], 2, "尾"], ["キャベツ", ["キャベツ"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["豚肉と野菜・えびをスープで煮る", "春雨を入れて、揚げ卵（またはゆで卵）をのせる"], "ヘルシーな春雨麺が熊本流のポイントです"),
  RG("rg2-toriten", "大分とり天風", 25, "和風", "揚げる", "主菜", "大分県", "大分県の名物。鶏肉の天ぷらで、ポン酢や酢醤油とかぼすでさっぱり食べるよ。大分では唐揚げよりとり天が定番なんだ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"], ["ポン酢", ["ポン酢"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["鶏肉を生姜醤油に漬ける", "天ぷら衣をつけてカラッと揚げ、ポン酢で食べる"], "かぼちゃの天ぷらを添えるのが大分らしいです"),
  RG("rg2-hiyajiru", "宮崎冷や汁風", 15, "和風", "和える", "汁物", "宮崎県", "宮崎県の夏の郷土汁。焼いた魚と味噌を冷たいだしで伸ばして、冷たいごはんにかけるよ。暑い日の農作業のごはんだったんだ。", [["あじ", ["あじ", "アジ"], 1, "尾"], ["豆腐", ["豆腐"], 0.5, "丁"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["あじを焼いてほぐし、味噌とすり合わせる", "冷たいだしで伸ばして豆腐ときゅうりを入れ、ごはんにかける（ごはんは別に用意）"], "ごまをすって入れると本格的になります"),
  RG("rg2-kurobutashabu", "鹿児島黒豚しゃぶ風", 20, "和風", "ゆでる", "主菜", "鹿児島県", "鹿児島県の名物『黒豚』のしゃぶしゃぶ。甘みのある豚肉を、そばつゆのような和風だしで食べるのが鹿児島流だよ。", [["豚肉", ["豚肉"], 100, "g"], ["レタス", ["レタス"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"], ["ポン酢", ["ポン酢"], 1.5, "大さじ"]], ["鍋にだしを沸かし、野菜を煮る", "豚肉をさっと湯にくぐらせてポン酢（またはそばつゆ）で食べる"], "肉はピンク色が消える程度に、くぐらせすぎないのがコツ"),
  RG("rg2-keihan", "奄美の鶏飯風", 25, "和風", "スープ", "主食", "鹿児島県", "鹿児島県・奄美大島の郷土ごはん。ごはんに裂いた鶏肉や錦糸卵をのせて、熱い鶏スープをかけて食べるよ。もともとは大切なお客さまへのごちそうだったんだ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["しいたけ", ["しいたけ"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["鶏肉を茹でてスープを取り、身を細かく裂く", "ごはんに鶏肉・錦糸卵・しいたけをのせ、熱いスープをかける"], "パパイヤ漬けの代わりにたくあんを添えても合います"),
  // ---- 沖縄（追加5品） ----
  RG("rg2-tacorice", "沖縄タコライス", 20, "洋風", "焼く", "主食", "沖縄県", "沖縄県の名物。メキシコのタコスの具をごはんにのせた、沖縄生まれの洋食だよ。レタスとトマトとチーズが山盛りだよ。", [["ひき肉", ["ひき肉"], 75, "g"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"], ["チーズ", ["チーズ"], 15, "g"]], ["ひき肉をケチャップとスパイスでタコミート風に炒める", "ごはんにレタスとタコミート、トマトとチーズをのせる"], "辛いサルサは大人の分だけ後がけに"),
  RG("rg2-ninjinshirishiri", "にんじんしりしり", 10, "和風", "焼く", "副菜", "沖縄県", "沖縄県の家庭料理。にんじんを千切りにして卵と炒めるよ。『しりしり』は、にんじんをおろし器ですりすりする音・様子から来た言葉だよ。", [["にんじん", ["にんじん", "人参"], 1, "本"], ["卵", ["卵", "たまご"], 1, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.25, "缶"]], ["にんじんを千切りにして炒める", "ツナと溶き卵を加えて炒め合わせる"], "専用の『しりしり器』でにんじんを削るのが沖縄流です"),
  RG("rg2-porktamago", "ポーク玉子おにぎり風", 15, "和風", "焼く", "主食", "沖縄県", "沖縄県の定番おにぎり。焼いたランチョンミート（ポーク）と卵焼きを、ごはんと海苔でサンドするよ。コンビニでも大人気だよ。", [["ハム", ["ハム", "ランチョンミート"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 75, "g"]], ["ハム（厚切り）を焼き、卵焼きを作る", "ごはんと一緒に海苔でサンドして包む"], "中身はツナマヨやゴーヤの天ぷらも人気です"),
  RG("rg2-soki", "ソーキ煮風", 40, "和風", "煮る", "主菜", "沖縄県", "沖縄県の名物。豚のあばら肉（ソーキ）を、黒糖と泡盛（お酒）でとろとろに煮るよ。沖縄そばにのせるのも定番だよ。", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["大根", ["大根", "だいこん"], 50, "g"]], ["豚肉を下茹でして脂を落とす", "黒糖（砂糖で代用）と醤油で大根と一緒に弱火で煮る"], "圧力鍋を使うと短時間でとろとろになります"),
  RG("rg2-mozukuten", "もずくの天ぷら風", 15, "和風", "揚げる", "副菜", "沖縄県", "沖縄県の名物天ぷら。海藻のもずくを衣と一緒に揚げると、もちもちカリッの楽しい食感になるよ。沖縄の食堂の定番だよ。", [["もずく", ["もずく"], 50, "g"], ["小麦粉", ["小麦粉"], 2, "大さじ"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["もずくの水気を切って衣とにんじんと混ぜる", "スプーンですくって油で揚げる"], "塩を少しかけるだけでおいしいです"),
  // ---- 大幅追加（2026-11-11）：1品だけだった県を中心に補充 ----
  RG("rg3-wankosoba", "わんこそば風", 15, "和風", "ゆでる", "主食", "岩手県", "岩手県の名物。お椀に一口ずつそばを入れて食べる賑やかな食事。家庭では小分けにして楽しく再現。", [["そば", ["そば"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["そばをゆでて小皿に小分けする", "鶏肉入りの温かいつゆを用意する"], "つゆは少しずつ継ぎ足して楽しみます"),
  RG("rg3-shizuoka-oden", "静岡おでん風", 30, "和風", "煮る", "主菜", "静岡県", "静岡県のおでんは濃い色のだしと黒はんぺんが特徴。家庭では練り物と大根で再現。", [["練り物", ["練り物", "はんぺん"], 2, "個"], ["大根", ["大根", "だいこん"], 80, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"]], ["大根とこんにゃくを下ゆでする", "濃いめのだしで材料を煮込む"], "削り節と青のりをかけるのが静岡流です"),
  RG("rg3-stamina-ramen", "スタミナラーメン風", 20, "中華", "煮る", "主食", "茨城県", "茨城県水戸発祥の、甘辛あんかけ野菜がのったラーメン。レバーが定番だが家庭では豚肉で手軽に。", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["にら", ["にら", "ニラ"], 0.25, "束"], ["にんにく", ["にんにく"], 1, "かけ"]], ["中華麺をゆでる", "野菜と豚肉の甘辛あんかけを作ってのせる"], "本場はレバー入り。辛さは控えめにどうぞ"),
  RG("rg3-misopotato", "みそポテト", 15, "和風", "蒸す", "副菜", "埼玉県", "埼玉県秩父の名物。蒸したじゃがいもに甘い味噌だれを絡めた素朴なおやつ兼おかず。", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 2, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["じゃがいもを蒸す", "甘味噌だれを絡める"], "おやつにもなる秩父の味です"),
  RG("rg3-torimotsu", "鳥もつ煮風", 20, "和風", "煮る", "副菜", "山梨県", "山梨県甲府の名物。鳥のもつを甘辛く照りよく煮詰めたご当地グルメ。家庭ではレバーで再現しやすい。", [["鶏レバー", ["鶏レバー", "レバー", "もつ"], 60, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["レバーを下処理する", "甘辛く照りよく煮詰める"], "甲府では砂肝やハツも一緒に煮ます"),
  RG("rg3-sanzokuyaki", "山賊焼き風", 20, "和風", "揚げる", "主菜", "長野県", "長野県中信地方の名物「山賊焼」は、一枚肉のにんにく醤油漬けを揚げた豪快な鶏料理。", [["鶏もも肉", ["鶏もも", "鶏肉"], 100, "g"], ["にんにく", ["にんにく"], 1, "かけ"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["鶏肉をにんにく醤油に漬ける", "片栗粉をまぶして揚げる"], "「山賊は物を取る（揚げる）」が名前の由来とも言われます"),
  RG("rg3-hobamiso", "朴葉味噌風", 15, "和風", "焼く", "副菜", "岐阜県", "岐阜県飛騨地方の郷土料理。朴の葉の上で味噌と具を焼く香ばしい一品。家庭ではホイルで代用できる。", [["味噌", ["味噌", "みそ"], 1, "大さじ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"], ["しいたけ", ["しいたけ"], 1, "枚"], ["豚肉", ["豚肉"], 30, "g"]], ["ホイルに味噌と具をのせる", "焼いてごはんにのせる"], "朴の葉の代わりにホイルで作れます"),
  RG("rg3-tekone", "てこね寿司風", 15, "和風", "その他", "主食", "三重県", "三重県志摩地方の漁師めし。まぐろの漬けを酢飯と手で混ぜる（手でこねる）ことからこの名前。", [["米", ["米", "ごはん"], 75, "g"], ["まぐろ", ["まぐろ"], 50, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["酢", ["酢"], 1, "大さじ"]], ["まぐろを醤油に漬ける", "酢飯と手で混ぜ合わせる"], "かつおで作るのが本場流です"),
  RG("rg3-chagayu", "茶粥風", 20, "和風", "煮る", "主食", "奈良県", "奈良県の郷土料理。お茶で炊くさらさらのお粥で、朝ごはんの定番。さつまいもを入れる家も多い。", [["米", ["米", "ごはん"], 50, "g"], ["ほうじ茶", ["ほうじ茶", "お茶"], 300, "mL"]], ["ほうじ茶で米を炊く", "塩で味を整える"], "さつまいもを入れると甘みが増します"),
  RG("rg3-akakonnyaku", "赤こんにゃくの甘辛煮", 15, "和風", "煮る", "副菜", "滋賀県", "滋賀県近江八幡の名物・赤こんにゃくを甘辛く煮付けた一品。鉄分で赤く染めるのが特徴。", [["こんにゃく", ["こんにゃく"], 0.5, "枚"]], ["こんにゃくを下ゆでする", "甘辛く煮含める"], "近江八幡のお祭り気分の一品です"),
  RG("rg3-dondoroke", "どんどろけ飯風", 25, "和風", "煮る", "主食", "鳥取県", "鳥取県の郷土料理。豆腐と根菜の炊き込みごはん。豆腐を炒るときの「どんどろけ」という音が名前の由来。", [["米", ["米", "ごはん"], 75, "g"], ["豆腐", ["豆腐"], 0.25, "丁"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["油揚げ", ["油揚げ"], 0.5, "枚"]], ["豆腐と根菜を炒める", "米と一緒に炊き込む"], "具は米の上にのせて炊くのがコツです"),
  RG("rg3-shijimi-gohan", "しじみごはん風", 20, "和風", "煮る", "主食", "島根県", "島根県宍道湖のしじみを使った炊き込みごはん。しじみの旨みがごはんにしみる。", [["米", ["米", "ごはん"], 75, "g"], ["しじみ", ["しじみ"], 50, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["しじみの砂抜きをする", "しじみと一緒に炊き込む"], "宍道湖のしじみは島根の宝物です"),
  RG("rg3-onsen-tofu", "嬉野温泉湯豆腐風", 15, "和風", "煮る", "主菜", "佐賀県", "佐賀県嬉野温泉の名物。温泉水で煮ると豆腐がとろけるように柔らかくなる。", [["豆腐", ["豆腐"], 0.5, "丁"], ["白菜", ["白菜"], 0.06, "玉"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["鍋に豆腐と野菜を入れて煮る", "ポン酢やごまだれで食べる"], "重曹をほんの少し入れると豆腐がとろけます"),
  RG("rg3-karashi-renkon", "からしれんこん風", 20, "和風", "揚げる", "副菜", "熊本県", "熊本県の郷土料理。れんこんの穴にからし味噌を詰めて揚げる。家庭では薄切りにはさんで手軽に。", [["れんこん", ["れんこん", "レンコン", "蓮根"], 60, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["れんこんにからし味噌をはさむ", "衣をつけて揚げる"], "からし控えめなら子どもも食べられます"),
  RG("rg3-ryukyu", "りゅうきゅう風", 10, "和風", "和える", "主菜", "大分県", "大分県の郷土料理。刺身を醤油ベースのタレに漬けた漁師めし。名前は琉球（沖縄）とのつながりが由来とも。", [["ぶり", ["ぶり", "ブリ", "鰤"], 60, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["ぶりの刺身をタレに漬ける", "大葉とごまを添える"], "鯛やアジでも美味しく作れます"),
  RG("rg3-ika-menchi", "いかメンチ風", 20, "和風", "揚げる", "主菜", "青森県", "青森県弘前・津軽地方の家庭料理。いかと野菜のみじん切りを揚げた素朴なメンチ。", [["いか", ["いか", "イカ"], 0.5, "杯"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["パン粉", ["パン粉"], 2, "大さじ"], ["小麦粉", ["小麦粉"], 1, "大さじ"]], ["いかと玉ねぎをみじん切りにして混ぜる", "成形して揚げる"], "津軽の家庭の味です"),
  RG("rg3-shottsuru", "しょっつる鍋風", 25, "和風", "煮る", "主菜", "秋田県", "秋田県の魚醤「しょっつる」で味付けする鍋。はたはたが定番だが、家庭ではたらでも美味しい。", [["たら", ["たら", "鱈"], 1, "切れ"], ["白菜", ["白菜"], 0.125, "玉"], ["豆腐", ["豆腐"], 0.25, "丁"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["野菜と豆腐を煮る", "たらを入れて魚醤で味付けする"], "しょっつるがなければ塩と少しの醤油でも"),
  RG("rg3-aburafu-don", "油麩丼風", 15, "和風", "煮る", "主食", "宮城県", "宮城県登米地方の名物。車麩のような油麩をカツ丼風に卵でとじた丼。肉なしでも満足感がある。", [["油麩", ["油麩", "麩"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["油麩と玉ねぎを煮る", "卵でとじてごはんにのせる（ごはんは別に用意）"], "登米の油麩は肉のような食べ応えです"),
  RG("rg3-ika-ninjin", "いかにんじん", 10, "和風", "和える", "副菜", "福島県", "福島県の郷土料理。するめと人参の漬物風で、おせちや常備菜に。家庭では刺身用いかでも。", [["いか", ["いか", "イカ"], 0.5, "杯"], ["にんじん", ["にんじん", "人参"], 0.5, "本"]], ["いかと人参を細切りにする", "醤油とみりんで漬け込む"], "本場はするめいかを使います"),
  RG("rg3-shimotsukare", "しもつかれ風", 30, "和風", "煮る", "副菜", "栃木県", "栃木県の郷土料理。鮭と根菜、大豆を煮込んだ栄養満点の一品。家庭では鮭の切り身で作りやすく。", [["鮭", ["鮭", "サーモン", "さけ"], 40, "g"], ["大根", ["大根", "だいこん"], 60, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["大豆", ["大豆"], 15, "g"], ["油揚げ", ["油揚げ"], 0.5, "枚"]], ["根菜と大豆を煮る", "鮭を入れて煮込む"], "初午（はつうま）の日に食べる行事食です"),
  RG("rg3-okkirikomi", "おっきりこみ風", 25, "和風", "煮る", "主食", "群馬県", "群馬県の郷土料理。幅広の麺と根菜を味噌で煮込む、体が温まる一品。「切って入れる」が名前の由来。", [["うどん", ["うどん"], 1, "玉"], ["かぼちゃ", ["かぼちゃ"], 50, "g"], ["大根", ["大根", "だいこん"], 40, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["根菜を味噌で煮る", "うどんを入れて煮込む"], "幅広麺で作るのが本場流です"),
  RG("rg3-futomaki", "太巻き寿司（祭り寿司）風", 25, "和風", "その他", "主食", "千葉県", "千葉県の郷土料理。お祭りの日に作る華やかな太巻き。家庭では卵やかまぼこで色鮮やかに。", [["米", ["米", "ごはん"], 75, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["きゅうり", ["きゅうり"], 0.3, "本"], ["かまぼこ", ["かまぼこ"], 20, "g"], ["海苔", ["海苔"], 1, "枚"]], ["酢飯と具を用意する", "海苔で太く巻く"], "切った断面の模様を楽しむ祭り寿司です"),
  RG("rg3-shirasu-don", "しらす丼", 10, "和風", "その他", "主食", "神奈川県", "神奈川県湘南の名物。釜揚げしらすを熱々ごはんにたっぷりのせた丼。卵黄をのせても美味しい。", [["米", ["米", "ごはん"], 100, "g"], ["しらす", ["しらす"], 30, "g"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["卵", ["卵", "たまご"], 1, "個"]], ["熱いごはんにしらすをのせる", "大葉と卵黄を添える"], "釜揚げしらすが手に入ったらぜひ"),
  RG("rg3-noppe", "のっぺ風", 25, "和風", "煮る", "副菜", "新潟県", "新潟県の郷土料理。根菜を煮てとろみをつけた、お祝いの席にも出る煮物。", [["里芋", ["里芋"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["れんこん", ["れんこん", "レンコン", "蓮根"], 30, "g"], ["鮭", ["鮭", "サーモン", "さけ"], 30, "g"], ["銀杏", ["銀杏"], 2, "個"]], ["根菜を煮る", "里芋のとろみで仕上げる"], "お正月やお祝いの席の煮物です"),
  RG("rg3-kaburazushi", "かぶら寿司風", 15, "和風", "その他", "副菜", "石川県", "石川県・富山県の冬の発酵食品。塩漬けのかぶにブリと麹を挟んだ「なれずし」。家庭では甘酢漬けで雰囲気を再現。", [["かぶ", ["かぶ"], 0.5, "個"], ["ぶり", ["ぶり", "ブリ", "鰤"], 40, "g"], ["米", ["米", "ごはん"], 30, "g"], ["酢", ["酢"], 1, "大さじ"]], ["かぶを甘酢に漬ける", "ぶりとごはんをはさむ"], "本物は麹で発酵させる冬の味覚です"),
  RG("rg3-hasumushi", "加賀れんこんのはす蒸し風", 20, "和風", "蒸す", "副菜", "石川県", "石川県金沢の郷土料理。すりおろした加賀れんこんを蒸してあんをかけた、もっちり上品な一品。", [["れんこん", ["れんこん", "レンコン", "蓮根"], 60, "g"], ["えび", ["えび", "海老"], 2, "尾"], ["銀杏", ["銀杏"], 2, "個"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["れんこんをすりおろして卵と混ぜる", "具をのせて蒸し、あんをかける"], "加賀れんこんのもっちり感が主役です"),
  RG("rg3-kanimeshi", "かにめし風", 20, "和風", "煮る", "主食", "福井県", "福井県越前の冬の味覚・越前がにを使ったかにめし。家庭では缶詰やカニかまでも雰囲気が出る。", [["米", ["米", "ごはん"], 75, "g"], ["かに", ["かに"], 40, "g"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["かにの身と一緒に炊き込む", "錦糸卵をのせる"], "越前がにの季節のごちそうです"),
  RG("rg3-kujo-nuta", "九条ねぎのぬた", 10, "和風", "和える", "副菜", "京都府", "京都府の京野菜・九条ねぎを使った酢味噌和え。ねぎの甘みとぬたの酸味が好相性。", [["長ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 1, "本"], ["わかめ", ["わかめ"], 3, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["酢", ["酢"], 1, "小さじ"]], ["ねぎをゆでる", "酢味噌で和える"], "九条ねぎの甘みが際立ちます"),
  RG("rg3-bokkake", "ぼっかけ風", 20, "和風", "煮る", "主菜", "兵庫県", "兵庫県神戸・長田の名物。牛すじとこんにゃくを甘辛く煮て丼やお好み焼きにのせる。家庭では牛肉で再現。", [["牛肉", ["牛肉"], 50, "g"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["牛肉とこんにゃくを甘辛く煮る", "ごはんや麺にのせる"], "神戸・長田ではお好み焼きにも入れます"),
];
REGIONAL_RECIPES.push(...REGIONAL_RECIPES_MORE);

// ---------- 郷土料理の追加（全47都道府県を4〜5品に拡充） ----------
export const REGIONAL_RECIPES_MORE2 = [
  // 東北
  RG("rg4-yamagata-dashi", "山形のだし風", 15, "和風", "和える", "副菜", "山形県", "山形県の夏の味。なすやきゅうりなどの夏野菜を細かく刻んで混ぜた、ごはんのお供だよ。", [["なす", ["なす", "ナス"], 0.5, "本"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["みょうが", ["みょうが"], 1, "個"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["オクラ", ["オクラ"], 2, "本"]], ["野菜をすべて細かく刻む", "醤油とだしで和えて少し置く", "温かいごはんにかける"], "刻むほど粘りが出てごはんとよく絡みます"),
  RG("rg4-tama-konnyaku", "玉こんにゃく煮", 20, "和風", "煮る", "副菜", "山形県", "山形県の名物。丸いこんにゃくを甘辛く煮て、からしをつけて食べるよ。お祭りの屋台でも人気だよ。", [["こんにゃく", ["こんにゃく"], 0.5, "枚"]], ["こんにゃくを下ゆでする", "醤油・砂糖・みりんで15分ほど煮る", "火を止めて冷ましながら味を含ませる"], "丸いこんにゃくがないときは普通のこんにゃくを一口大に"),
  RG("rg4-morioka-reimen", "盛岡冷麺風", 20, "和風", "ゆでる", "主食", "岩手県", "岩手県・盛岡の名物麺。つるつるで歯ごたえのある麺に、冷たい牛だしスープとキムチをのせるよ。", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["牛肉", ["牛肉"], 40, "g"], ["キムチ", ["キムチ"], 30, "g"], ["きゅうり", ["きゅうり"], 0.3, "本"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["麺をゆでて冷水でよくしめる", "冷たいスープ（コンソメと醤油を薄く）を注ぐ", "牛肉・キムチ・きゅうり・ゆで卵をのせる"], "果物（梨やりんご）をのせるのが盛岡流です"),
  RG("rg4-hittsumi", "ひっつみ汁風", 30, "和風", "煮る", "汁物", "岩手県", "岩手県の郷土汁。小麦粉の生地を手でひっつまんで（ちぎって）入れるから、この名前だよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["しいたけ", ["しいたけ"], 1, "個"]], ["小麦粉を水でこねて耳たぶの固さにする", "だしで鶏肉と野菜を煮る", "生地を薄くちぎって入れ、火が通るまで5分ほど煮る"], "生地は薄くのばすとつるんとした食感に"),
  RG("rg4-hatahata", "ハタハタの煮付け風", 20, "和風", "煮る", "主菜", "秋田県", "秋田県の県魚ハタハタ。冬に旬を迎える魚で、煮付けにすると卵（ぶりこ）がおいしいよ。", [["ハタハタ", ["ハタハタ", "はたはた"], 2, "尾"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["ハタハタを水で洗う", "生姜と甘辛い煮汁で10分ほど煮る", "煮汁を少し煮詰めて照りを出す"], "秋田ではしょっつる鍋にも入れる魚です"),
  RG("rg4-hotate-kaiyaki", "ほたての貝焼き味噌風", 20, "和風", "焼く", "主菜", "青森県", "青森県・津軽の郷土料理。ほたてを貝殻（代わりに耐熱皿）で味噌と卵で煮る、漁師のごちそうだよ。", [["ほたて", ["ほたて", "ホタテ"], 3, "個"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["卵", ["卵", "たまご"], 1, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["耐熱皿にほたてとだし・味噌を入れる", "中火で5分ほど煮て、溶き卵を回し入れる", "卵が半熟になったら火を止める"], "本場は大きな貝殻を鍋代わりに使います"),
  RG("rg4-sasa-kamaboko", "笹かまの焼き物風", 10, "和風", "焼く", "副菜", "宮城県", "宮城県・仙台の名物かまぼこ。笹の葉の形をしていて、焼くと香ばしくなるよ。", [["かまぼこ", ["かまぼこ"], 30, "g"], ["わさび", ["わさび"], 1, "g"]], ["かまぼこをフライパン（またはトースター）で両面焼く", "焼き色がついたら取り出す", "わさび醤油で食べる"], "チーズをのせて焼くアレンジも人気"),
  RG("rg4-kozuyu", "こづゆ風", 30, "和風", "煮る", "汁物", "福島県", "福島県・会津のお祝いの汁物。ほたての貝柱のだしで、里芋やきくらげなどを煮る椀物だよ。", [["里芋", ["里芋"], 2, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ほたて", ["ほたて", "ホタテ"], 1, "個"], ["干ししいたけ", ["干ししいたけ"], 1, "個"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"]], ["材料を一口大に切る", "だしで20分ほど煮る", "塩と薄口醤油で上品に調える"], "お祝いの席で何度もおかわりする会津の味"),
  // 関東
  RG("rg4-soboro-natto", "そぼろ納豆風", 10, "和風", "和える", "副菜", "茨城県", "茨城県・水戸の郷土食。納豆に大根の漬物を刻んで混ぜたもので、ごはんが進むよ。", [["納豆", ["納豆"], 1, "パック"], ["大根", ["大根", "だいこん"], 30, "g"]], ["大根を細かく刻んで軽く塩もみする（漬物でも可）", "納豆と混ぜる", "醤油を少し垂らす"], "しょぼろ納豆とも呼ばれる水戸の味"),
  RG("rg4-natto-jiru", "納豆汁風", 15, "和風", "スープ", "汁物", "茨城県", "茨城県や山形県で食べられる冬の汁。すり潰した納豆を味噌汁に入れる、体が温まる一杯だよ。", [["納豆", ["納豆"], 1, "パック"], ["豆腐", ["豆腐"], 0.25, "丁"], ["大根", ["大根", "だいこん"], 40, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["大根と豆腐をだしで煮る", "すり潰した納豆を加える", "味噌を溶いて仕上げる"], "納豆の粘りでとろみがつきます"),
  RG("rg4-mimi-udon", "耳うどん風", 25, "和風", "ゆでる", "主食", "栃木県", "栃木県・鹿沼の郷土麺。耳の形に成形したうどんで、耳の形は魔除けの意味があると言われるよ。", [["小麦粉", ["小麦粉"], 4, "大さじ"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["しいたけ", ["しいたけ"], 1, "個"]], ["小麦粉をこねて耳の形（丸めて両端をつまむ）に成形する", "だしで鶏肉と野菜を煮る", "耳うどんを入れて5分ほど煮る"], "形作りが楽しい栃木の郷土麺"),
  RG("rg4-ota-yakisoba", "太田やきそば風", 20, "和風", "炒める", "主食", "群馬県", "群馬県・太田市の名物。太い麺と濃いソース、具はキャベツだけという潔さが特徴だよ。B級グルメで有名だよ。", [["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["キャベツ", ["キャベツ"], 80, "g"]], ["キャベツを炒める", "太麺を加えて濃いめのソースで炒める", "青のりを振る"], "具がキャベツだけなのが太田流のこだわり"),
  RG("rg4-musashino-udon", "武蔵野うどん風", 20, "和風", "ゆでる", "主食", "埼玉県", "埼玉県と東京都にまたがる武蔵野台地の名物。歯ごたえのある太いうどんを、熱い肉汁につけて食べるよ。", [["うどん", ["うどん"], 1, "玉"], ["豚肉", ["豚肉"], 60, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["油揚げ", ["油揚げ"], 0.5, "枚"]], ["うどんをゆでて冷水でしめる", "豚肉とねぎ・油揚げを濃いめのだしで煮てつけ汁にする", "冷たいうどんを熱いつけ汁で食べる"], "麺は太くて力強いのが武蔵野流"),
  RG("rg4-suttate", "すったてうどん風", 20, "和風", "ゆでる", "主食", "埼玉県", "埼玉県の夏の郷土食。すり潰した胡麻と味噌の冷たい汁に、うどんをつけて食べるよ。", [["うどん", ["うどん"], 1, "玉"], ["ごま", ["ごま"], 1.5, "大さじ"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["みょうが", ["みょうが"], 1, "個"]], ["ごまをすって味噌と冷たいだしでのばす", "薬味野菜を刻んで汁に入れる", "冷たくしめたうどんをつけて食べる"], "冷汁のうどん版、暑い日にぴったり"),
  RG("rg4-sanga-yaki", "さんが焼き風", 20, "和風", "焼く", "主菜", "千葉県", "千葉県の漁師ごはん。なめろうを焼いたもので、山の仕事の人（山家さん）が持って行ったのが名前の由来と言われるよ。", [["あじ", ["あじ", "アジ"], 1, "尾"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["あじをたたいて味噌と薬味と混ぜる（なめろうを作る）", "大葉で包む（またはそのまま小判型にする）", "フライパンで両面をこんがり焼く"], "なめろうの焼きバージョンです"),
  RG("rg4-edo-komatsuna", "江戸小松菜の煮びたし", 15, "和風", "煮る", "副菜", "東京都", "東京都・江戸川区の小松地区が名前の由来の小松菜。江戸時代から食べられてきた東京の野菜だよ。", [["小松菜", ["小松菜"], 0.5, "束"], ["油揚げ", ["油揚げ"], 1, "枚"]], ["小松菜をざく切りにする", "油揚げとだしでさっと煮る", "薄口醤油で調える"], "煮すぎると色が悪くなるので手早く"),
  RG("rg4-iekei", "横浜家系ラーメン風", 20, "中華", "ゆでる", "主食", "神奈川県", "神奈川県・横浜生まれのラーメン。濃い豚骨醤油スープに太麺、ほうれん草と海苔が特徴だよ（家庭版は牛乳でコクを再現するよ）。", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ほうれん草", ["ほうれん草", "ホウレンソウ"], 0.3, "束"], ["海苔", ["海苔"], 1, "枚"], ["牛乳", ["牛乳"], 50, "mL"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["鶏ガラスープに牛乳と醤油を加えて濃厚スープにする", "太麺をゆでてスープに入れる", "ほうれん草・海苔・ゆで卵・豚肉をのせる"], "家系の合言葉はほうれん草と海苔です"),
  // 中部
  RG("rg4-sasa-dango", "笹団子風", 30, "和風", "蒸す", "デザート", "新潟県", "新潟県の名物お菓子。よもぎのお餅にあんを入れて、笹の葉で包むよ。笹には殺菌作用があると言われるよ。", [["もち米", ["もち米"], 75, "g"], ["よもぎ", ["よもぎ"], 10, "g"], ["小豆", ["小豆"], 30, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["もち米を蒸してよもぎを混ぜる", "あんを包んで丸める", "笹の葉（なければラップ）で包む"], "笹の香りが新潟の山の恵みです"),
  RG("rg4-yakisaba-sushi", "焼き鯖寿司風", 20, "和風", "焼く", "主食", "福井県", "福井県の名物。香ばしく焼いた鯖を酢飯にのせた押し寿司で、鯖街道の終点・小浜の味だよ。", [["さば", ["さば", "サバ"], 1, "切れ"], ["米", ["米", "ごはん"], 100, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["酢飯を作る", "さばをこんがり焼く", "酢飯に大葉とさばをのせて形を整える"], "焼いた鯖の香ばしさが主役"),
  RG("rg4-himi-udon", "氷見うどん風", 15, "和風", "ゆでる", "主食", "富山県", "富山県・氷見の名物うどん。手延べの細うどんで、つるつるしたのどごしが自慢だよ。", [["うどん", ["うどん"], 1, "玉"], ["かまぼこ", ["かまぼこ"], 15, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["うどんをゆでて冷水でしめる", "温かいだし（または冷たいつゆ）を用意する", "かまぼことねぎをのせる"], "細麺はゆで過ぎに注意"),
  RG("rg4-shiroebi-kakiage", "白えびのかき揚げ風", 20, "和風", "揚げる", "主菜", "富山県", "富山県・富山湾の宝石と呼ばれる白えび。家庭では小えびで作る、甘いかき揚げだよ。", [["えび", ["えび", "エビ"], 4, "尾"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"]], ["えびは殻をむいて小さく切る", "玉ねぎと衣でまとめる", "油でカラッと揚げる"], "白えびは富山湾でしかまとまって獲れない貴重なえびです"),
  RG("rg4-hunton-rice", "ハントンライス風", 25, "洋風", "焼く", "主食", "石川県", "石川県・金沢の洋食。ケチャップライスに卵とフライをのせた、ボリューム満点の一皿だよ。", [["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1.5, "個"], ["えび", ["えび", "エビ"], 2, "尾"], ["ケチャップ", ["ケチャップ"], 1.5, "大さじ"], ["パン粉", ["パン粉"], 1, "大さじ"]], ["ケチャップライスを作る", "えびフライを揚げ、薄焼き卵を作る", "ライスに卵とフライをのせ、タルタル風にマヨネーズをかける"], "名前はハンガリーの「ハン」とフランス語のまぐろ「トン」が由来と言われます"),
  RG("rg4-yoshida-udon", "吉田のうどん風", 20, "和風", "ゆでる", "主食", "山梨県", "山梨県・富士吉田の名物。日本一固いとも言われる太いうどんに、茹でキャベツと馬肉（家庭では牛肉）の甘辛煮をのせるよ。", [["うどん", ["うどん"], 1, "玉"], ["牛肉", ["牛肉"], 50, "g"], ["キャベツ", ["キャベツ"], 50, "g"]], ["うどんをゆでる", "牛肉を甘辛く煮る", "うどんに牛肉とゆでキャベツをのせる"], "キャベツの甘みが固い麺と合います"),
  RG("rg4-shingen-mochi", "信玄餅風", 15, "和風", "和える", "デザート", "山梨県", "山梨県の代表お菓子。きな粉をまぶしたお餅に黒蜜をかけるよ。武田信玄の名前がついた名物だよ。", [["もち", ["もち"], 2, "個"], ["きな粉", ["きな粉"], 2, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["もちを柔らかくゆでる", "きな粉をたっぷりまぶす", "砂糖を煮詰めた黒蜜風シロップをかける"], "きな粉は食べる直前にまぶすと香りがよい"),
  RG("rg4-nozawana", "野沢菜漬け風", 15, "和風", "漬ける", "副菜", "長野県", "長野県・野沢温泉の名物漬物。家庭では塩漬けで雰囲気を再現する、信州の冬の味だよ。", [["野沢菜", ["野沢菜", "高菜"], 80, "g"]], ["野沢菜（なければ高菜）を洗って切る", "塩もみして一晩置く", "水気を絞って刻み、醤油を少し垂らす"], "本物は大きな樽で冬の間漬け込みます"),
  RG("rg4-sobagaki", "そばがき風", 15, "和風", "煮る", "主食", "長野県", "長野県・信州そばの原点。そば粉を熱湯で練ったもので、そばを打つ技術が生まれる前から食べられてきたよ。", [["そば粉", ["そば粉"], 3, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.1, "本"], ["わさび", ["わさび"], 1, "g"]], ["鍋で湯を沸かしてそば粉を一気に加える", "木べらで力強く練る（2〜3分）", "一口大にして、わさび醤油で食べる"], "練る力が要る、信州の素朴な味"),
  RG("rg4-gohei-mochi", "五平餅風", 20, "和風", "焼く", "主食", "岐阜県", "岐阜県と長野県の山の郷土食。潰したごはんを串に付けて、甘い味噌やくるみのタレを塗って焼くよ。", [["米", ["米", "ごはん"], 120, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["くるみ", ["くるみ"], 10, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["ごはんを半潰しにして串に小判型につける", "両面を焼く", "すり潰したくるみと味噌・砂糖のタレを塗って焼く"], "タレは地域で味噌・醤油・くるみと様々です"),
  RG("rg4-tsukemono-steak", "漬物ステーキ風", 10, "和風", "焼く", "副菜", "岐阜県", "岐阜県・飛騨の郷土料理。漬物を焼くという意外な一品で、焼くと漬物の塩気がまろやかになるよ。", [["たくあん", ["たくあん"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["かつお節", ["かつお節"], 1, "g"]], ["漬物（たくあん等）を切ってフライパンで焼く", "溶き卵を回し入れる", "かつお節をかける"], "飛騨では白菜漬けで作るのが定番です"),
  RG("rg4-fujinomiya-yakisoba", "富士宮やきそば風", 20, "和風", "炒める", "主食", "静岡県", "静岡県・富士宮市の名物。歯ごたえのある蒸し麺と、肉かす（家庭では豚バラで代用）、仕上げの魚粉が特徴だよ。", [["焼きそば麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["豚バラ肉", ["豚バラ", "豚肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["かつお節", ["かつお節"], 1.5, "g"]], ["豚肉をカリッと炒めて脂を出す", "麺とキャベツをソースで炒める", "かつお粉（かつお節）をたっぷり振る"], "仕上げの魚粉が富士宮の証です"),
  RG("rg4-wasabi-zuke", "わさび漬け風", 15, "和風", "漬ける", "副菜", "静岡県", "静岡県・伊豆の名物。本わさびの産地・伊豆の、酒粕で作る漬物。家庭では味噌漬け風に再現するよ。", [["わさび", ["わさび"], 5, "g"], ["大根", ["大根", "だいこん"], 50, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["大根を小さく切って塩もみする", "すりおろしたわさびと味噌で和える", "少し置いて味をなじませる"], "ツンとくる香りは大人の味、少しずつどうぞ"),
  RG("rg4-ankake-spa", "あんかけスパ風", 20, "洋風", "ゆでる", "主食", "愛知県", "愛知県・名古屋の洋食。太いパスタに、とろみのあるピリ辛トマトソースをかける名古屋めしだよ（家庭版は辛さ控えめ）。", [["パスタ", ["パスタ", "スパゲッティ"], 90, "g"], ["ソーセージ", ["ソーセージ"], 2, "本"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ピーマン", ["ピーマン"], 1, "個"], ["トマト缶", ["トマト缶"], 100, "g"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["太めのパスタをゆでる", "具を炒めてトマト缶で煮て、とろみをつける", "パスタにかける"], "麺は2mm以上の太さが名古屋流です"),
  RG("rg4-shigure-ni", "松阪牛しぐれ煮風", 20, "和風", "煮る", "副菜", "三重県", "三重県の名物。牛肉を生姜と甘辛く煮たしぐれ煮は、時雨（しぐれ）の季節の名前がついた保存食だよ。", [["牛肉", ["牛肉"], 75, "g"], ["生姜", ["生姜", "しょうが"], 10, "g"]], ["牛肉と千切り生姜を醤油・砂糖で煮る", "汁気が少なくなるまで煮詰める", "ごはんにのせる（またはおにぎりの具に）"], "松阪牛でなくても、生姜たっぷりで本格的に"),
  RG("rg4-aosa-jiru", "あおさ汁風", 10, "和風", "スープ", "汁物", "三重県", "三重県・志摩の海の恵み。あおさ海苔の味噌汁は、磯の香りがいっぱいだよ。", [["青のり", ["青のり", "あおさ"], 2, "g"], ["豆腐", ["豆腐"], 0.25, "丁"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["だしで豆腐を温める", "あおさを加える", "味噌を溶く"], "あおさは煮すぎると香りが飛ぶので最後に"),

  // 関西
  RG("rg4-uji-pudding", "抹茶プリン風", 20, "和風", "蒸す", "デザート", "京都府", "京都府・宇治の抹茶のお菓子。ほろ苦い抹茶プリンは、宇治茶の文化が生んだ和のデザートだよ。", [["抹茶", ["抹茶"], 1, "小さじ"], ["牛乳", ["牛乳"], 150, "mL"], ["卵", ["卵", "たまご"], 1, "個"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["卵・牛乳・砂糖に抹茶を溶いて混ぜる", "こして弱火で12分ほど蒸す", "冷やして固める"], "抹茶はダマにならないよう少量の牛乳で先に溶いて"),
  RG("rg4-doteyaki", "どて焼き風", 40, "和風", "煮る", "主菜", "大阪府", "大阪府の名物。牛すじを味噌で煮込んだもので、家庭では牛肉とこんにゃくで再現するよ。土手（どて）の形に味噌を塗ったのが名前の由来だよ。", [["牛肉", ["牛肉"], 75, "g"], ["こんにゃく", ["こんにゃく"], 0.5, "枚"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["牛肉とこんにゃくを下ゆでする", "味噌・砂糖・みりんで30分ほど煮込む", "ねぎを散らす"], "煮込むほど味がしみる大阪の味"),
  RG("rg4-ikanago", "いかなごのくぎ煮風", 25, "和風", "煮る", "副菜", "兵庫県", "兵庫県・神戸の春の味。小魚のいかなごを甘辛く煮たもので、形が錆びた釘に似ているから「くぎ煮」だよ。家庭ではじゃこで代用できるよ。", [["じゃこ", ["じゃこ", "ちりめんじゃこ", "いかなご"], 30, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["じゃこ（またはいかなご）を洗う", "醤油・砂糖・みりんと生姜で煮る", "汁気がなくなるまで煮詰める"], "春に神戸の街に漂う甘辛い香りが名物です"),
  RG("rg4-miwa-nyumen", "三輪にゅうめん風", 15, "和風", "ゆでる", "主食", "奈良県", "奈良県・三輪はそうめん発祥の地と言われるよ。温かいにゅうめんは奈良の冬の味だよ。", [["そうめん", ["そうめん"], 1, "束"], ["干ししいたけ", ["干ししいたけ"], 1, "個"], ["かまぼこ", ["かまぼこ"], 10, "g"], ["三つ葉", ["三つ葉"], 1, "g"]], ["そうめんを別ゆでする", "しいたけの戻し汁入りのだしで具を煮る", "そうめんを入れて温める"], "三輪そうめんは細くてのどごしが自慢"),
  RG("rg4-asuka-nabe", "飛鳥鍋風", 25, "和風", "煮る", "主菜", "奈良県", "奈良県の郷土鍋。牛乳入りのまろやかなだしで鶏肉と野菜を煮る、飛鳥時代の唐の文化が由来と言われる鍋だよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["白菜", ["白菜"], 0.1, "玉"], ["牛乳", ["牛乳"], 100, "mL"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["だしで鶏肉と野菜を煮る", "牛乳を加えて沸騰直前で火を止める", "塩と薄口醤油で調える"], "牛乳は最後に加えると分離しません"),
  RG("rg4-goma-tofu", "胡麻豆腐風", 20, "和風", "煮る", "副菜", "和歌山県", "和歌山県・高野山の精進料理。豆腐と名前がつくけれど、ごまを葛（家庭では片栗粉）で固めたものだよ。", [["ごま", ["ごま"], 2, "大さじ"], ["片栗粉", ["片栗粉"], 1.5, "大さじ"], ["わさび", ["わさび"], 1, "g"]], ["すりごまを水で溶いて片栗粉と混ぜる", "鍋で練りながら火を通す（5分ほど、透明感が出るまで）", "型に流して冷やし固め、わさび醤油で食べる"], "練る作業が腕の見せどころです"),
  RG("rg4-sanma-sushi", "さんま寿司風", 20, "和風", "漬ける", "主食", "和歌山県", "和歌山県・紀州の郷土寿司。塩と酢でしめたさんまを酢飯にのせる、熊野地方のお祝い寿司だよ。", [["さんま", ["さんま", "サンマ"], 1, "尾"], ["米", ["米", "ごはん"], 100, "g"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["酢飯を作る", "さんまを開いて軽く酢に漬ける（刺身用ならそのまま）", "酢飯にのせて形を整える"], "新鮮なさんまで作る紀州の味"),
  RG("rg4-ebi-mame", "えび豆風", 25, "和風", "煮る", "副菜", "滋賀県", "滋賀県・琵琶湖の郷土食。小エビと大豆を甘辛く煮たもので、家庭では小えびで再現するよ。", [["えび", ["えび", "エビ"], 3, "尾"], ["大豆", ["大豆"], 30, "g"]], ["大豆を柔らかく煮る", "小えびを加えて甘辛く煮る", "汁気が少なくなるまで煮詰める"], "琵琶湖の小さな恵みの煮物です"),
  RG("rg4-masu-shio", "ますの塩焼き風", 15, "和風", "焼く", "主菜", "滋賀県", "滋賀県・琵琶湖の固有種ビワマス。家庭では鱒（ます）の塩焼きで、湖の恵みを味わうよ。", [["ます", ["ます", "鱒"], 1, "切れ"]], ["ますに塩をして10分置く", "グリルで両面を焼く", "大根おろしを添える"], "ビワマスは「琵琶湖の宝石」と呼ばれる魚です"),
  // 中国
  RG("rg4-bara-sushi", "ばら寿司風", 30, "和風", "和える", "主食", "岡山県", "岡山県のお祝い寿司。酢飯に魚介と野菜をたくさん混ぜ込んだ、豪華なちらし寿司だよ。", [["米", ["米", "ごはん"], 120, "g"], ["えび", ["えび", "エビ"], 2, "尾"], ["れんこん", ["れんこん"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["さやいんげん", ["いんげん"], 3, "本"]], ["酢飯を作る", "具をそれぞれ下ごしらえする（えびはゆで、卵は錦糸卵に）", "酢飯に具を混ぜて盛る"], "具が多いほどお祝いらしくなります"),
  RG("rg4-shirunashi-tantan", "汁なし担担麺風", 20, "中華", "ゆでる", "主食", "広島県", "広島県・広島市で人気の麺。汁のない麺に肉味噌と山椒を絡めるよ（家庭版は辛さと痺れ控えめだよ）。", [["中華麺", ["中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.3, "本"], ["ごま", ["ごま"], 1, "大さじ"]], ["ひき肉を甘辛い肉味噌に炒める", "麺をゆでる", "丼にタレと麺を入れて肉味噌とねぎをのせ、よく混ぜる"], "よく混ぜて食べるのが汁なし流です"),
  RG("rg4-gansu", "がんす風", 20, "和風", "揚げる", "副菜", "広島県", "広島県の名物。魚のすり身に玉ねぎを混ぜてパン粉で揚げたもので、家庭ではさつま揚げで雰囲気を再現するよ。", [["さつま揚げ", ["さつま揚げ"], 1, "枚"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["パン粉", ["パン粉"], 1, "大さじ"]], ["さつま揚げと玉ねぎをみじん切りにして混ぜる", "小判型にしてパン粉をつける", "油で揚げ焼きにする"], "名前は広島の方言「〜がんす（です）」からと言われます"),
  RG("rg4-kencho", "けんちょう風", 25, "和風", "煮る", "副菜", "山口県", "山口県の郷土料理。大根と豆腐を煮た素朴な煮物で、名前は「けんちん汁」がなまったものと言われるよ。", [["大根", ["大根", "だいこん"], 100, "g"], ["豆腐", ["豆腐"], 0.5, "丁"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["しいたけ", ["しいたけ"], 1, "個"]], ["大根とにんじんをだしで煮る", "豆腐を加えてさらに煮る", "醤油で味を調える"], "山口の家庭の冬の味です"),
  RG("rg4-uiro", "ういろう風", 25, "和風", "蒸す", "デザート", "山口県", "山口県・山口市の名物和菓子。わらび粉（家庭では片栗粉）でもっちりさせた、透き通るお菓子だよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["片栗粉", ["片栗粉"], 1, "大さじ"], ["砂糖", ["砂糖"], 2.5, "大さじ"], ["抹茶", ["抹茶"], 0.5, "小さじ"]], ["材料を水で溶いてこす", "型に流して20分ほど蒸す", "冷めてから切る"], "山口の外郎は名古屋のものより柔らかいのが特徴です"),
  RG("rg4-kani-jiru", "かに汁風", 25, "和風", "スープ", "汁物", "鳥取県", "鳥取県の冬の味。松葉ガニの名産地・鳥取では、かにの味噌汁が家庭のごちそうだよ（家庭ではカニかまや缶詰でも）。", [["かに", ["かに", "カニ"], 50, "g"], ["大根", ["大根", "だいこん"], 50, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["だしで大根を煮る", "かにを加えてひと煮立ち", "味噌を溶いてねぎを散らす"], "かにの出汁がそのまま味になります"),
  RG("rg4-tofu-chikuwa", "とうふちくわ風", 20, "和風", "蒸す", "副菜", "鳥取県", "鳥取県の名物。豆腐と魚のすり身を混ぜて蒸したちくわで、家庭でははんぺんと豆腐で再現するよ。", [["豆腐", ["豆腐"], 0.5, "丁"], ["はんぺん", ["はんぺん"], 0.5, "枚"], ["片栗粉", ["片栗粉"], 0.5, "大さじ"]], ["豆腐とはんぺんを潰して混ぜる", "棒状に成形する", "蒸し器で10分ほど蒸す"], "焼いて食べてもおいしい鳥取の味"),
  RG("rg4-akaten", "赤天風", 15, "和風", "焼く", "副菜", "島根県", "島根県・浜田の名物。唐辛子入りの赤い魚のすり身揚げで、家庭ではさつま揚げに七味で雰囲気を出すよ（辛さは大人の分だけ）。", [["さつま揚げ", ["さつま揚げ"], 1, "枚"]], ["さつま揚げをフライパンで両面焼く", "焼き色がついたら切る", "好みで大人の分にだけ七味を添える"], "赤い色が島根の食卓の印です"),
  RG("rg4-uzume-meshi", "うずめ飯風", 15, "和風", "和える", "主食", "島根県", "島根県・津和野の郷土ごはん。具をごはんの下に「うずめて」隠すから、この名前だよ。食べる人が掘り出す楽しみがあるよ。", [["米", ["米", "ごはん"], 120, "g"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 30, "g"], ["にんじん", ["にんじん", "人参"], 0.2, "本"], ["豆腐", ["豆腐"], 0.25, "丁"], ["わさび", ["わさび"], 1, "g"]], ["具をだしで煮る", "茶碗に具を入れてからごはんで蓋をする", "ひっくり返して盛り、だしをかける"], "ひっくり返す瞬間が一番の見せ場です"),
  // 四国
  RG("rg4-sobagome-jiru", "そば米汁風", 20, "和風", "煮る", "汁物", "徳島県", "徳島県・祖谷（いや）の郷土汁。そばの実を入れた汁物で、山の村の素朴な味だよ。家庭ではそばの実の代わりに押し麦でも作れるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["大根", ["大根", "だいこん"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["そば粉", ["そば粉"], 1, "大さじ"]], ["鶏肉と野菜をだしで煮る", "そば粉を溶いて加え、とろみと粒感を出す", "醤油で調える"], "祖谷は平家の隠れ里と伝わる山あいの集落です"),
  RG("rg4-handa-somen", "半田そうめん風", 15, "和風", "ゆでる", "主食", "徳島県", "徳島県・つるぎ町の名物そうめん。普通のそうめんより太くて、うどんのような食べごたえがあるよ。", [["そうめん", ["そうめん"], 1, "束"], ["卵", ["卵", "たまご"], 0.5, "個"], ["椎茸", ["しいたけ"], 0.5, "個"]], ["そうめんをゆでて冷水でしめる", "温かいだし（または冷たいつゆ）を用意する", "錦糸卵としいたけをのせる"], "太麺そうめんは徳島の自慢です"),
  RG("rg4-shippoku-udon", "しっぽくうどん風", 20, "和風", "ゆでる", "主食", "香川県", "香川県の冬のうどん。根菜と油揚げがたっぷり入った、具だくさんの讃岐うどんだよ。", [["うどん", ["うどん"], 1, "玉"], ["大根", ["大根", "だいこん"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["里芋", ["里芋"], 1, "個"], ["油揚げ", ["油揚げ"], 0.5, "枚"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 30, "g"]], ["具をだしで煮る", "うどんを加えて温める", "ねぎを散らす"], "「しっぽく」は長崎の卓袱料理から来た言葉だよ"),
  RG("rg4-shoyu-mame", "しょうゆ豆風", 20, "和風", "煮る", "副菜", "香川県", "香川県の郷土食。炒ったそら豆を醤油に漬けたもので、お茶うけやごはんのお供だよ。", [["そら豆", ["そら豆"], 8, "個"]], ["そら豆をから炒りする（または塩ゆでする）", "熱いうちに醤油・砂糖・みりんに漬ける", "一晩置いて味を含ませる"], "香川では法事やお茶の席にも出る味です"),
  RG("rg4-mikan-gohan", "伊予のみかんごはん風", 15, "和風", "和える", "主食", "愛媛県", "愛媛県の学校給食で生まれたごはん。みかんジュースで炊いたごはんは、ほんのり甘酸っぱいよ。", [["米", ["米", "ごはん"], 120, "g"], ["みかん", ["みかん"], 1, "個"], ["しらす", ["しらす"], 15, "g"]], ["みかんを搾って果汁を用意する", "果汁と水でごはんを炊く（または混ぜごはんにする）", "しらすをのせる"], "給食で愛される愛媛の変わりごはんです"),
  RG("rg4-inaka-sushi", "田舎寿司風", 25, "和風", "和える", "主食", "高知県", "高知県の山の郷土寿司。魚の代わりに野菜やこんにゃくを握る、山里のお寿司だよ。", [["米", ["米", "ごはん"], 120, "g"], ["こんにゃく", ["こんにゃく"], 0.25, "枚"], ["たけのこ", ["たけのこ"], 40, "g"], ["しいたけ", ["しいたけ"], 1, "個"], ["みょうが", ["みょうが"], 1, "個"]], ["酢飯を作る（ゆず酢があれば本場風）", "具を甘辛く煮る", "酢飯を小さく握って具をのせる"], "海のない山の集落の知恵のお寿司です"),
  RG("rg4-boshi-pan", "ぼうしパン風", 15, "洋風", "焼く", "デザート", "高知県", "高知県の名物パン。帽子のつばのようなクッキー生地がついたパンで、家庭では食パンで再現するよ。", [["食パン", ["食パン", "パン"], 1, "枚"], ["ホットケーキミックス", ["ホットケーキミックス"], 2, "大さじ"], ["バター", ["バター"], 5, "g"], ["砂糖", ["砂糖"], 1, "大さじ"]], ["クッキー生地（ミックス・バター・砂糖）を作る", "パンの上に広げる", "トースターで焼き色がつくまで焼く"], "つばの部分がカリカリで人気です"),
  // 九州
  RG("rg4-yaki-ramen", "焼きラーメン風", 20, "中華", "炒める", "主食", "福岡県", "福岡県・博多の屋台の名物。とんこつスープで麺を炒める、汁なしラーメンだよ（家庭版は牛乳でコクを出すよ）。", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["豚肉", ["豚肉"], 50, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["キャベツ", ["キャベツ"], 40, "g"], ["牛乳", ["牛乳"], 30, "mL"]], ["豚肉と野菜を炒める", "ゆでた麺を加え、牛乳とソースで炒める", "紅生姜（あれば）をのせる"], "屋台発祥の博多の味です"),
  RG("rg4-ureshino-chagayu", "嬉野茶粥風", 25, "和風", "煮る", "主食", "佐賀県", "佐賀県・嬉野温泉の名物。お茶で炊いたお粥で、温泉の宿の朝ごはんで有名だよ。", [["米", ["米", "ごはん"], 75, "g"], ["緑茶", ["緑茶", "お茶"], 150, "mL"]], ["濃いめに緑茶を入れる", "お茶でお粥を炊く", "塩で調える"], "お茶の香りが爽やかなお粥です"),
  RG("rg4-ika-shumai", "呼子のいかしゅうまい風", 25, "中華", "蒸す", "主菜", "佐賀県", "佐賀県・唐津市呼子の名物。いかの身で作るしゅうまいで、ふんわりした食感が特徴だよ。", [["いか", ["いか", "イカ"], 60, "g"], ["はんぺん", ["はんぺん"], 0.5, "枚"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"], ["餃子の皮", ["餃子の皮", "ワンタンの皮"], 4, "枚"]], ["いかとはんぺんを潰して玉ねぎと混ぜる", "皮で包む", "蒸し器で8分ほど蒸す"], "呼子はイカの活き造りで有名な港町です"),
  RG("rg4-toruko-rice", "トルコライス風", 30, "洋風", "焼く", "主食", "長崎県", "長崎県・長崎市の洋食。ピラフ・とんかつ・ナポリタンを一皿に盛った、大人のお子様ランチだよ。", [["米", ["米", "ごはん"], 100, "g"], ["豚ロース", ["豚ロース", "豚肉"], 60, "g"], ["パスタ", ["パスタ", "スパゲッティ"], 30, "g"], ["ケチャップ", ["ケチャップ"], 1.5, "大さじ"], ["パン粉", ["パン粉"], 1, "大さじ"]], ["カレー風味のピラフを作る", "とんかつを揚げ、ナポリタンを作る", "一皿に盛り合わせる"], "3つの洋食が一皿に集まる長崎の味"),
  RG("rg4-goto-udon", "五島うどん風", 15, "和風", "ゆでる", "主食", "長崎県", "長崎県・五島列島の名物。細い乾麺うどんを、焼きあご（飛び魚）のだしで食べるよ。", [["うどん", ["うどん"], 1, "玉"], ["卵", ["卵", "たまご"], 0.5, "個"], ["長ねぎ", ["長ねぎ", "ねぎ", "ネギ"], 0.2, "本"]], ["うどんをゆでる", "温かいだしを用意する", "溶き卵を流し、ねぎを散らす"], "あごだしの香りが五島の印です"),
  RG("rg4-takana-meshi", "高菜めし風", 15, "和風", "和える", "主食", "熊本県", "熊本県・阿蘇の郷土ごはん。高菜漬けを炒めてごはんに混ぜる、阿蘇の家庭の味だよ。", [["米", ["米", "ごはん"], 120, "g"], ["高菜", ["高菜"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["ごま", ["ごま"], 0.5, "大さじ"]], ["高菜を刻んでごま油で炒める", "温かいごはんに混ぜる", "炒り卵とごまをのせる"], "阿蘇の高菜は漬物でも名物です"),
  RG("rg4-dago-jiru", "だご汁風", 30, "和風", "煮る", "汁物", "熊本県", "熊本県の郷土汁。小麦粉の団子（だご）を野菜と煮る、阿蘇の農家の温かい汁だよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["豚肉", ["豚肉"], 40, "g"], ["大根", ["大根", "だいこん"], 50, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ごぼう", ["ごぼう"], 0.3, "本"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["小麦粉をこねて団子にする", "だしで豚肉と野菜を煮る", "団子をちぎって入れ、味噌で仕上げる"], "大分のだんご汁と兄弟のような汁物です"),
  RG("rg4-yaseuma", "やせうま風", 20, "和風", "ゆでる", "デザート", "大分県", "大分県の郷土おやつ。平たい小麦団子にきな粉をまぶす、素朴で優しい甘さだよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["きな粉", ["きな粉"], 2, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["小麦粉をこねて平たくのばす", "ゆでて冷水に取る", "きな粉と砂糖をまぶす"], "名前の由来は昔のお話から来ているよ"),
  RG("rg4-nikumaki-onigiri", "肉巻きおにぎり風", 20, "和風", "焼く", "主食", "宮崎県", "宮崎県の名物。おにぎりを豚肉で巻いて甘辛く焼いた、見た目も楽しいごはんだよ。", [["米", ["米", "ごはん"], 120, "g"], ["豚バラ肉", ["豚バラ", "豚肉"], 60, "g"]], ["ごはんを俵型に握る", "豚肉を巻きつける", "フライパンで焼いて甘辛だれを絡める"], "お弁当にも入る宮崎生まれの味"),
  RG("rg4-karamen", "辛麺風", 20, "中華", "ゆでる", "主食", "宮崎県", "宮崎県・延岡生まれの麺。唐辛子の効いたスープに溶き卵とひき肉が入るよ（家庭版は辛さ控えめ、辛くするのは大人の分だけ）。", [["中華麺", ["中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["にら", ["にら", "ニラ"], 0.25, "束"], ["にんにく", ["にんにく"], 0.5, "かけ"]], ["ひき肉とにんにくを炒めてスープで煮る", "麺を加える", "溶き卵を流して、にらをのせる"], "辛さは後から足せるよう控えめが家庭流"),
  RG("rg4-akumaki", "あくまき風", 30, "和風", "煮る", "デザート", "鹿児島県", "鹿児島県の端午の節句のお菓子。灰汁（あく）でもち米を煮る、独特の香りの保存食だよ。家庭では重曹で雰囲気を再現するよ。", [["もち米", ["もち米"], 100, "g"], ["きな粉", ["きな粉"], 1.5, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["もち米を水に浸す", "包んで（または耐熱容器で）30分ほど煮る・蒸す", "きな粉と砂糖をまぶす"], "薩摩の武士の保存食だったと言われます"),
];
REGIONAL_RECIPES.push(...REGIONAL_RECIPES_MORE2);
REGIONAL_RECIPES.push(RG("rg4-beppu-reimen", "別府冷麺風", 20, "和風", "ゆでる", "主食", "大分県", "大分県・別府の名物冷麺。太めの麺と牛だしの冷たいスープが特徴で、温泉の街の味だよ。", [["中華麺", ["中華麺", "ラーメン"], 1, "玉"], ["牛肉", ["牛肉"], 40, "g"], ["キムチ", ["キムチ"], 30, "g"], ["きゅうり", ["きゅうり"], 0.3, "本"], ["卵", ["卵", "たまご"], 0.5, "個"]], ["麺をゆでて冷水でよくしめる", "冷たい牛だし風スープ（コンソメと醤油）を注ぐ", "牛肉・キムチ・きゅうり・ゆで卵をのせる"], "別府では冷麺専門店が並ぶ人気の味です"));



/** 既存の郷土料理・再利用レシピの都道府県（新規 RG 品は pref を直接持つ） */
export const REGIONAL_PREF = {
  "rg-jingisukan": "北海道", "chanchan": "北海道", "rg-ishikari": "北海道", "rg-buttercorn": "北海道",
  "rg-kiritanpo": "秋田県", "rg-imoni": "山形県", "rg-senbeijiru": "青森県", "rg-zunda": "宮城県",
  "rg-fukagawa": "東京都", "rg-monja": "東京都", "rg-shumai": "神奈川県", "rg-chanko": "東京都",
  "rg-misokatsu": "愛知県", "rg-tebasaki": "愛知県", "rg-hoto": "山梨県", "rg-hamamatsu-gyoza": "静岡県",
  "rg-takoyaki": "大阪府", "rg-okonomiyaki": "大阪府", "rg-kitsune-udon": "大阪府", "rg-kushikatsu": "大阪府",
  "rg-hiroshima-okonomi": "広島県", "rg-kawara-soba": "山口県", "rg-demikatsu": "岡山県", "ev-shijimi-jiru": "島根県",
  "rg-sanuki-udon": "香川県", "rg-katsuo-tataki": "高知県", "rg-taimeshi": "愛媛県", "rg-imotaki": "愛媛県",
  "rg-chicken-nanban": "宮崎県", "rg-champon": "長崎県", "rg-tonkotsu": "福岡県", "rg-satsumajiru": "鹿児島県",
  "ev-goya-champuru": "沖縄県", "rg-rafute": "沖縄県", "rg-okinawa-soba": "沖縄県", "rg-sata-andagi": "沖縄県",
};

// ---- 地域セット（北から南の順） ----
// intro はその土地の食の特徴を子ども向けに1行で。
// dishes は REGIONAL_RECIPES と既存レシピ（ALL/EVENT）の id を混ぜて参照する。
export const REGIONS = [
  { id: "hokkaido", name: "北海道", emoji: "❄️", dishes: ["rg-jingisukan", "chanchan", "rg-ishikari", "rg-buttercorn", "rg2-soupcurry", "rg2-zangi", "rg2-ikameshi", "rg2-butadon", "rg2-ramensalad", "rg2-sanpeijiru"],
    intro: "海の幸と大地の恵み。鮭・じゃがいも・とうもろこしと、寒い土地ならではの温かい鍋が自慢だよ。" },
  { id: "tohoku", name: "東北", emoji: "🍎", dishes: ["rg-kiritanpo", "rg-imoni", "rg-senbeijiru", "rg-zunda", "rg2-barayaki", "rg2-jajamen", "rg2-gyutan", "rg2-harakomeshi", "rg2-yokoteyakisoba", "rg2-tsumetainikusoba", "rg2-kitakata", "rg2-enbangyoza", "rg3-wankosoba", "rg3-ika-menchi", "rg3-shottsuru", "rg3-aburafu-don", "rg3-ika-ninjin"],
    intro: "山と里の恵み。きりたんぽや芋煮など、体が温まる鍋ものと、枝豆のずんだが有名だよ。" },
  { id: "kanto", name: "関東", emoji: "🗼", dishes: ["rg-monja", "rg-fukagawa", "rg-shumai", "rg-chanko", "rg2-ankonabe", "rg2-sanoramen", "rg2-utsunomiyagyoza", "rg2-yakimanju", "rg2-mizusawaudon", "rg2-katsuura-tantan", "rg2-namero", "rg2-sanmamen", "rg2-zeryfry", "rg3-stamina-ramen", "rg3-misopotato", "rg3-shimotsukare", "rg3-okkirikomi", "rg3-futomaki", "rg3-shirasu-don"],
    intro: "江戸・東京の下町ごはんと港町の味。もんじゃ焼きに深川めし、横浜のシュウマイだよ。" },
  { id: "chubu", name: "中部", emoji: "🏯", dishes: ["rg-misokatsu", "rg-tebasaki", "rg-hoto", "rg-hamamatsu-gyoza", "rg2-tarekatsu", "rg2-hegisoba", "rg2-blackramen", "rg2-masuzushi", "rg2-jibuni", "rg2-kanazawacurry", "rg2-saucekatsu", "rg2-oroshisoba", "rg2-oyaki", "rg2-keichan", "rg2-iseudon", "rg2-misonikomi", "rg2-hitsumabushi", "rg3-torimotsu", "rg3-shizuoka-oden", "rg3-sanzokuyaki", "rg3-hobamiso", "rg3-tekone", "rg3-noppe", "rg3-kaburazushi", "rg3-hasumushi", "rg3-kanimeshi"],
    intro: "名古屋めしの甘い赤味噌、山梨のほうとう、浜松の餃子。真ん中の日本の味だよ。" },
  { id: "kansai", name: "関西", emoji: "🐙", dishes: ["rg-takoyaki", "rg-okonomiyaki", "rg-kitsune-udon", "rg-kushikatsu", "rg2-nishinsoba", "rg2-yubagohan", "rg2-akashiyaki", "rg2-sobameshi", "rg2-kakinohazushi", "rg2-meharizushi", "rg2-wakayamaramen", "rg2-omigyusukiyaki", "rg3-chagayu", "rg3-akakonnyaku", "rg3-kujo-nuta", "rg3-bokkake"],
    intro: "粉ものの本場。たこ焼き・お好み焼き・うどんと、大阪の楽しい食卓だよ。" },
  { id: "chugoku", name: "中国", emoji: "🍋", dishes: ["rg-hiroshima-okonomi", "rg-kawara-soba", "rg-demikatsu", "ev-shijimi-jiru", "rg2-gyukotsuramen", "rg2-izumosoba", "rg2-ebimeshi", "rg2-hiroshimatsukemen", "rg2-hiruzenyakisoba", "rg2-fukuzosui", "rg3-dondoroke", "rg3-shijimi-gohan"],
    intro: "瀬戸内の恵み。広島のお好み焼き、山口の瓦そば、宍道湖のしじみ汁だよ。" },
  { id: "shikoku", name: "四国", emoji: "🍊", dishes: ["rg-sanuki-udon", "rg-katsuo-tataki", "rg-taimeshi", "rg-imotaki", "rg2-tokushimaramen", "rg2-taraiudon", "rg2-honebutsudori", "rg2-yakibutatamago", "rg2-jakoten", "rg2-nabeyakiramen"],
    intro: "讃岐うどんに高知のかつお、愛媛の鯛めしと芋炊き。四つの県の名物がそろうよ。" },
  { id: "kyushu", name: "九州", emoji: "🍜", dishes: ["rg-champon", "rg-tonkotsu", "rg-chicken-nanban", "rg-satsumajiru", "rg2-motsunabe", "rg2-mizutaki", "rg2-shishirian", "rg2-saraudon", "rg2-taiyoyen", "rg2-toriten", "rg2-hiyajiru", "rg2-kurobutashabu", "rg2-keihan", "rg3-onsen-tofu", "rg3-karashi-renkon", "rg3-ryukyu"],
    intro: "長崎ちゃんぽん、博多ラーメン、宮崎チキン南蛮。南の元気な麺と鶏の国だよ。" },
  { id: "okinawa", name: "沖縄", emoji: "🌺", dishes: ["ev-goya-champuru", "rg-rafute", "rg-okinawa-soba", "rg-sata-andagi", "rg2-tacorice", "rg2-ninjinshirishiri", "rg2-porktamago", "rg2-soki", "rg2-mozukuten"],
    intro: "長寿の島の食卓。ゴーヤや豚肉を上手に食べて、暑さに負けない知恵が詰まっているよ。" },
];


// ---- 地域セットへの追加（郷土料理拡充分を各地域の献立に組み込む） ----
{
  const addRegionDishes = (regionId, ids) => {
    const r = REGIONS.find((x) => x.id === regionId);
    if (r) r.dishes.push(...ids);
  };
  addRegionDishes("tohoku", ["rg4-yamagata-dashi", "rg4-tama-konnyaku", "rg4-morioka-reimen", "rg4-hittsumi", "rg4-hatahata", "rg4-hotate-kaiyaki", "rg4-sasa-kamaboko", "rg4-kozuyu"]);
  addRegionDishes("kanto", ["rg4-soboro-natto", "rg4-natto-jiru", "rg4-mimi-udon", "rg4-ota-yakisoba", "rg4-musashino-udon", "rg4-suttate", "rg4-sanga-yaki", "rg4-edo-komatsuna", "rg4-iekei"]);
  addRegionDishes("chubu", ["rg4-sasa-dango", "rg4-yakisaba-sushi", "rg4-himi-udon", "rg4-shiroebi-kakiage", "rg4-hunton-rice", "rg4-yoshida-udon", "rg4-shingen-mochi", "rg4-nozawana", "rg4-sobagaki", "rg4-gohei-mochi", "rg4-tsukemono-steak", "rg4-fujinomiya-yakisoba", "rg4-wasabi-zuke", "rg4-ankake-spa", "rg4-shigure-ni", "rg4-aosa-jiru"]);
  addRegionDishes("kansai", ["rg4-uji-pudding", "rg4-doteyaki", "rg4-ikanago", "rg4-miwa-nyumen", "rg4-asuka-nabe", "rg4-goma-tofu", "rg4-sanma-sushi", "rg4-ebi-mame", "rg4-masu-shio"]);
  addRegionDishes("chugoku", ["rg4-bara-sushi", "rg4-shirunashi-tantan", "rg4-gansu", "rg4-kencho", "rg4-uiro", "rg4-kani-jiru", "rg4-tofu-chikuwa", "rg4-akaten", "rg4-uzume-meshi"]);
  addRegionDishes("shikoku", ["rg4-sobagome-jiru", "rg4-handa-somen", "rg4-shippoku-udon", "rg4-shoyu-mame", "rg4-mikan-gohan", "rg4-inaka-sushi", "rg4-boshi-pan"]);
  addRegionDishes("kyushu", ["rg4-yaki-ramen", "rg4-ureshino-chagayu", "rg4-ika-shumai", "rg4-toruko-rice", "rg4-goto-udon", "rg4-takana-meshi", "rg4-dago-jiru", "rg4-beppu-reimen", "rg4-yaseuma", "rg4-nikumaki-onigiri", "rg4-karamen", "rg4-akumaki"]);
}

const REGIONAL_DISH_BY_ID = new Map([...ALL_RECIPES, ...EVENT_RECIPES, ...REGIONAL_RECIPES].map((r) => [r.id, r]));

/** id から地域を引く */
export function regionById(regionId) {
  return REGIONS.find((r) => r.id === regionId) || null;
}

/**
 * 地域の献立を組み立てる（イベント献立と同じ評価系）。
 * 戻り値: { region, dishes, missingAll, totalMinutes, haveCount, missingCount }
 * 地域が無ければ null。
 */
export function suggestRegionalMenu(regionId, stockItems, { servings = 2 } = {}) {
  const region = regionById(regionId);
  if (!region) return null;
  const today = todayLocalISO();
  const dishes = [];
  for (const id of region.dishes) {
    const recipe = REGIONAL_DISH_BY_ID.get(id);
    if (!recipe) continue;
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    dishes.push({ ...evaluated, pref: recipe.pref || REGIONAL_PREF[id] || null });
  }
  const missingMap = new Map();
  let haveCount = 0;
  for (const d of dishes) {
    haveCount += d.have.length;
    for (const m of d.missing) {
      const key = `${m.name}|${m.unit}`;
      if (missingMap.has(key)) missingMap.get(key).amount = Math.round((missingMap.get(key).amount + m.amount) * 10) / 10;
      else missingMap.set(key, { ...m });
    }
  }
  return {
    region, dishes,
    missingAll: [...missingMap.values()],
    totalMinutes: dishes.reduce((s, d) => s + (d.minutes || 0), 0),
    haveCount, missingCount: missingMap.size,
  };
}
