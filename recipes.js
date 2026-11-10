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
  ], steps: ["野菜の上に鮭をのせて蒸し焼きにする", "味噌だれを絡めてほぐす"], tip: "ホットプレートでも作れる北海道の郷土料理です" },
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
];

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

export function suggestRecipes(stockItems, { mode = "stock", servings = 2, limit = 8, rotateKey = null } = {}) {
  const today = todayLocalISO();
  const rotKey = rotateKey ?? today; // 既定は日替わり
  const results = [];
  for (const recipe of ALL_RECIPES) {
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
    if (mode === "stock" && missing.length > 0) continue;
    if (mode === "shop" && missing.length > 3) continue;
    if (have.length === 0) continue;
    const meta = metaFor(recipe);
    results.push({
      ...recipe, genre: recipe.genre || meta.genre || "その他",
      method: recipe.method || meta.method || "作る", course: recipe.course || meta.course || "主菜",
      useUp: recipe.useUp || meta.useUp || false,
      have, missing,
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
