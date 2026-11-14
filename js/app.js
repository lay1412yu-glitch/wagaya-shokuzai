// app.js — わが家の食材手帳（Web配布版）メイン
//
// モード:
// - config.js の Firebase 設定が空 → デモモード（DemoStore, 端末内のみ）
// - 設定あり → Firebase モード（FirebaseStore, Auth + Firestore ルールで家族共有）
// - ロールバック用: 旧 Supabase 設定が両方ある場合のみ SupabaseStore で動く
//
// セキュリティ関連:
// - ユーザー入力の描画はすべて textContent（util.el）経由。innerHTML は
//   静的な雛形だけに使い、ユーザー由来の文字列は混ぜない。
// - QR コードは同梱ライブラリ（js/qrcode.js）で端末内生成のみ。
//   フレンドコードを外部 QR 生成 API に送ることはしない。
// - 参加用リンク ?join=<code> を受けたら、コードを sessionStorage に退避し、
//   ログイン完了後に自動で参加を試みる（URL の履歴からは即座に消す）。

import { el, uid, todayISO, daysUntil, formatDate, expiryLabel, expiryGroup, expiryChipClass, formatCode, fmtQtyValue, qtyStepFor, roundQty, isFractionUnit, matchesSearch, topPurchased, recentRegistered, oneTapCandidates, inListQuantity, planOneTapAdd, usualQtyUnitFor, storageOf, RECIPE_QUICK_FILTERS, RECIPE_MOOD_FILTERS, matchesRecipeFilter, filterRecipes, STORAGE_ZONES, STORAGE_ZONE_ALL, countByStorage, filterByStorage, suggestStorage, UNIT_OPTIONS, UNIT_OTHER_VALUE, unitSelectValueFor, resolveUnitValue, upsertTodayMenuEntry, removeTodayMenuEntry, groupTodayMenuEntries, mergeMissingIngredients, isAppShellCacheName, userErrorMessage, FRIDGE_NAME_MAX } from "./util.js";
import { resolveCanonicalName } from "./names.js";
import { suggestRecipes, suggestFilteredCatalogue, suggestMealSet, suggestEventMenu, EVENT_MENUS, EVENT_RECIPES, suggestRegionalMenu, REGIONS, REGIONAL_RECIPES, evaluateRecipe, ALL_RECIPES, rankRecipesByIngredients, isNewRecipe, demoteSeenRecipes, ensureCourseVariety } from "./recipes.js";
import * as recipesNs from "./recipes.js";
import { suggestCombos, repertoireSize } from "./combo.js";
import { buildGameQuestions, scoreGame, CORRECT_PRAISE, GAME_QUESTION_COUNT, GAME_COUNT_OPTIONS, GAME_DIFFICULTIES, GAME_DIFFICULTY_DEFAULT } from "./game.js";
import { createSuikaGame, VEG_STAGES, SUIKA_W, SUIKA_H, computeSuikaBoardLayout } from "./suika.js";
import { qrToCanvas } from "./qrcode.js";
import { iconEl, charPlaceholderEl, CATALOG, rarityOf, rarityCategory, categoryOf, catalogCategories } from "./icons.js";
import { levelForCount, titleFor, remainingToNextLevel } from "./levels.js";
import { knowledgeFor } from "./knowledge.js";
import { DemoStore, DEMO_DB_KEY } from "./demo-store.js";
import { GUIDE_STEPS, guideSeen, markGuideSeen } from "./guide.js";
import { legalDocs } from "./legal.js";
import { buildReminders, notifyOnOpen, permissionState, subscribePush } from "./notify.js";
import { LOADING_MESSAGES, pickLoadingChars, loadingFactPool, pickLoadingFact, attachCharMotion } from "./loading.js";

const CATEGORIES = ["野菜", "肉", "魚", "卵・乳製品", "豆腐・大豆", "調味料", "乾物・缶詰", "冷凍食品", "飲み物", "果物", "主食", "その他"];
// 保管場所の区分（冷蔵庫／冷凍庫／野菜室／常温）は util.js の STORAGE_ZONES が正。

const appRoot = document.getElementById("app");
const toastNode = document.getElementById("toast");
let toastTimer = null;
function toast(msg, ms = 2600) {
  toastNode.replaceChildren(document.createTextNode(msg));
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, ms);
}
// 「元に戻す」ボタン付きトースト（削除・数量変更の取り消し用）
function toastWithAction(msg, actionLabel, onAction, ms = 7000) {
  const btn = el("button", { class: "toast-action", type: "button" }, actionLabel);
  btn.addEventListener("click", async () => {
    clearTimeout(toastTimer);
    toastNode.hidden = true;
    try { await onAction(); } catch (e) { toast(userErrorMessage(e)); }
  });
  toastNode.replaceChildren(document.createTextNode(msg), btn);
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, ms);
}

// ---------- 購入のお祝い（激レアゲット／レベルアップ） ----------
// 購入前に図鑑の購入回数を控えておき、購入後に比べることで
// 「はじめて集めた激レア」「レベルアップ」を検出してお祝いする。
function catalogCountsBefore() {
  return new Map(state.catalog.map((c) => [c.name, c.purchaseCount ?? 1]));
}
function celebratePurchase(name, before) {
  const rec = state.catalog.find((c) => c.name === name);
  if (!rec) return false;
  const count = rec.purchaseCount ?? 1;
  const isNew = !before.has(name);
  const tier = rarityOf(name);
  if (isNew && tier === "ultra") {
    toast(`激レア食材『${name}』をゲット！🎉 ずかんに とうろくされたよ`, 5200);
    return true;
  }
  const beforeCount = before.get(name) ?? 0;
  if (!isNew && levelForCount(count) > levelForCount(beforeCount)) {
    toast(`${name}が Lv${levelForCount(count)}にアップ！称号『${titleFor(name, count)}』をゲット！🎉`, 5200);
    return true;
  }
  if (isNew && tier === "rare") {
    toast(`レア食材『${name}』をゲット！✨ ずかんに とうろくされたよ`, 4600);
    return true;
  }
  return false;
}

let store = null;
const state = {
  user: null, fridges: [], fridge: null, members: [],
  items: [], shopping: [], favRecipes: [], catalog: [], settings: { familySize: 2 },
  todayMenu: { date: "", entries: [] }, // 今日の献立ボード（ストアに保存・家族共有。日付が変わると空になる）
  todayMenuThanks: false, // 「作った！」で片付けた直後の感謝表示フラグ（保存しない）
  tab: "stock", authTab: "login", recipeMode: "stock", recipeView: "suggest",
  recipeFilter: "all", // レシピのクイックフィルタ: all | microwave | otsumami | quick（保存しない・タブを離れると all に戻す）
  recipeCourse: null, // コース別ブラウズ: null | 主菜 | 副菜 | 汁物 | 主食 | サラダ | デザート（保存しない）
  recipeSource: "omakase", // レシピの探し方: "omakase"（おまかせ提案） | "picker"（食材を選んで作る）
  pickerSelected: [], // 食材ピッカーで選んだ在庫アイテム名（保存しない）
  pickerInit: false, // 食材ピッカーの初回プリセットを適用済みか（保存しない）
  suggestPage: 0, // おすすめ候補プールのページ（「別の提案を見る」で送る）
  comboSeen: [], // 組み合わせ提案で表示済みの combo id（未表示分を出すため）
  comboRound: 0, // 組み合わせ候補をひと通り見た回数（seed を変えて顔ぶれを変える）
  eventMenuId: null, // 選択中のイベント献立（null のときは先頭のイベント）
  regionId: null, // 選択中の地域（郷土料理。null のときは先頭の地域）
  gameView: false, // 食材クイズゲーム表示中
  game: null, // ゲームの進行状態 { questions, index, phase, selected, flags, streak, bestStreak }（保存しない）
  gameCount: GAME_QUESTION_COUNT, // ゲームの出題数（5 / 10 / 15 / 20 / 30 から選択。保存しない）
  gameDifficulty: GAME_DIFFICULTY_DEFAULT, // ゲームの難易度（こども / かぞく / 大人チャレンジ。保存しない）
  suikaView: false, // やさいあわせゲーム表示中
  zukanFilter: "all", // 図鑑のレアリティ絞り込み: all | ultra | rare
  zukanCategory: "all", // 図鑑のカテゴリ絞り込み: all | カテゴリ名（レアリティ絞り込みと併用可）
  knowledgeName: null, knowledgeCategory: null, // 食材の知識ページ表示中（食育）
  knowledgeReturnY: 0, // 知識ページを開く前のスクロール位置（もどる時に復元する）
  presetAdd: null, // 図鑑から在庫登録フォームへ渡す下書き { name, category, unit? }
  inviteCode: null, // 作成/再発行の直後に所有者へ見せるコード（平文）
  stockQuery: "", // 在庫の検索文字列
  stockZone: STORAGE_ZONE_ALL, // 在庫の保管場所フィルタ（すべて／冷蔵庫／冷凍庫／野菜室／常温。保存しない）
  recipeDetail: null, // レシピ詳細ページ表示中: { recipe, mode, size, servingsLabel, favId, scrollY, checked }（保存しない）
  confirmDeleteFridge: false, // 冷蔵庫削除の最終確認パネル表示中（保存しない）
  showGuide: false, // はじめてガイド表示中
  legalView: null, // 法的ページ表示中: null | "privacy" | "terms"
  sessionTrash: [], // 本番モード用: この画面で削除した食材（セッション内のみ復元可）
  trash: [], // デモモード用: ストアのゴミ箱（refreshData で読み込む）
  shoppingCategory: null, // 買い物タブ「カテゴリから選ぶ」で選択中のカテゴリ（保存しない）
  shoppingEditor: null, // 買い物タブ「カテゴリから選ぶ」の数量エディタ対象 { name, category }（保存しない）
};

// ---------- 消費期限のオン/オフ設定 ----------
// 設定レコード（fridge_settings）の expiryEnabled で切り替える。
// 既定は ON: 未設定（undefined）のときも ON として扱う。
// OFF のときも食材データの expiryDate は削除しない（表示・入力・通知だけを止め、
// ON に戻せばすべて復活する）。
function expiryEnabled() {
  return state.settings?.expiryEnabled !== false;
}

// ---- ?join= の受け取り ----
function captureJoinParam() {
  const url = new URL(location.href);
  const code = url.searchParams.get("join");
  if (code) {
    sessionStorage.setItem("wagaya_pending_join", code);
    url.searchParams.delete("join");
    history.replaceState(null, "", url.pathname + url.hash); // URL履歴にコードを残さない
    const banner = document.getElementById("join-banner");
    banner.hidden = false;
    banner.textContent = "QRコードから参加コードを受け取りました。ログインすると自動で参加します。";
  }
}
function pendingJoin() { return sessionStorage.getItem("wagaya_pending_join"); }
function clearPendingJoin() { sessionStorage.removeItem("wagaya_pending_join"); }

async function initStore() {
  const cfg = globalThis.WAGAYA_CONFIG || {};
  const fb = cfg.FIREBASE || {};
  if (fb.apiKey && fb.projectId) {
    const { FirebaseStore } = await import("./firebase-store.js");
    store = await FirebaseStore.create(fb);
  } else if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    // ロールバック用（旧バックエンド）。通常は Firebase 設定を使う。
    const { SupabaseStore } = await import("./supabase-store.js");
    store = await SupabaseStore.create(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } else {
    store = new DemoStore();
    document.getElementById("demo-banner").hidden = false;
  }
}

// ---------- リアルタイム更新 ----------
// 本番: Firestore の onSnapshot（store.subscribeFridge）で家族の編集を自動反映。
// デモ: localStorage の storage イベントで別タブの変更を自動反映。
// どちらも使えない場合は従来通り（操作・再読み込みで反映）にフォールバック。
let realtimeCleanup = null;
let realtimeTimer = null;
function scheduleRealtimeRefresh() {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    if (!state.user || !state.fridge) return;
    await refreshData().catch(() => {});
    if (!state.knowledgeName && !state.legalView) renderMain();
  }, 400);
}
function setupRealtime() {
  stopRealtime();
  if (!state.fridge || typeof store.subscribeFridge !== "function") return;
  realtimeCleanup = store.subscribeFridge(state.fridge.id, scheduleRealtimeRefresh);
}
function stopRealtime() {
  if (realtimeCleanup) { try { realtimeCleanup(); } catch { /* noop */ } realtimeCleanup = null; }
}
window.addEventListener("storage", (e) => {
  if (!store || store.mode !== "demo") return;
  if (e.key !== DEMO_DB_KEY) return;
  scheduleRealtimeRefresh();
});

// ---------- オフライン表示チップ ----------
// Firebase モードで圏外のときだけ、ヘッダー下に「📴 オフライン表示中」を
// 出す。データは Firestore の永続キャッシュから表示され、通常の登録・
// 変更は端末に貯まって再接続時に自動で同期される（firebase-store.js の
// オフライン設計を参照）。デモモードは端末内だけで完結するので出さない。
let wasOffline = false;
function updateOfflineUI() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const firebaseMode = !!store && store.mode === "firebase";
  banner.hidden = !(offline && firebaseMode);
  if (offline) { wasOffline = true; return; }
  if (wasOffline) {
    wasOffline = false;
    // 復帰したら家族の変更を取りに行き、画面を最新の状態に寄せる
    if (firebaseMode && state.user && state.fridge) {
      toast("オンラインに戻りました");
      scheduleRealtimeRefresh();
    }
  }
}
window.addEventListener("online", updateOfflineUI);
window.addEventListener("offline", updateOfflineUI);

// ---------- 読み込み画面（食材キャラ＋豆知識） ----------
// 起動時・冷蔵庫を開く/切り替える時に出す全画面の待ち画面。
// 食材キャラが各自のリズムで跳ね回り、ステータスメッセージと食育の豆知識が切り替わる。
// 最小表示時間は設けない（準備ができたらすぐ本画面に替わる）。
// タイマーは loadingTimers に、キャラのモーションは loadingMotion に集め、
// どの画面に遷移しても stopLoadingView() で必ず止める（renderMain / renderAuth /
// renderFridgePicker / renderLegalPage の先頭で呼ぶ）。万一止め忘れても、
// ノードが DOM から外れたら自ら止まる。
const LOADING_FACT_POOL = loadingFactPool();
let loadingTimers = [];
let loadingMotion = null; // キャラの遊びモーション（loading.js の rAF ループ）
function stopLoadingView() {
  for (const t of loadingTimers) clearInterval(t);
  loadingTimers = [];
  if (loadingMotion) { loadingMotion.stop(); loadingMotion = null; }
}
// ---- 読み込み画面からの受け渡しのクロスフェード ----
// 各画面は replaceChildren で丸ごと差し替えるため、そのままだと読み込み画面が
// 「ぱっ」と消えて硬く見える。差し替え前に現在の .loading-view を控えておき、
// 描画後に絶対配置のオーバーレイとして戻してフェードアウトさせると、新画面の
// view-in（フェード＋スライドイン）と重なってクロスフェードになる。
// 動かすのは opacity / transform だけ。reduced-motion では行わない。
let leavingLoadingView = null;
function captureLeavingLoadingView() {
  leavingLoadingView = appRoot.querySelector(":scope > .loading-view");
}
function releaseLeavingLoadingView() {
  const lv = leavingLoadingView;
  leavingLoadingView = null;
  if (!lv) return;
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return; // 控えた要素は replaceChildren で既に外れているので何もしない
  lv.classList.add("view-overlay");
  appRoot.append(lv);
  void lv.offsetWidth; // 遷移を初期状態（不透明）から始めさせる
  lv.classList.add("view-leaving");
  setTimeout(() => lv.remove(), 280);
}
function renderLoadingView() {
  stopLoadingView();
  appRoot.replaceChildren();
  const msgNode = el("p", { class: "loading-msg", role: "status" }, LOADING_MESSAGES[0]);
  // キャラは表示のたびに図鑑カタログ全体から抽選する（固定の顔ぶれにしない）
  const charsRow = el("div", { class: "loading-chars" }, pickLoadingChars().map((url, i) => {
    const img = el("img", { class: "char-img", src: url, alt: "" });
    img.draggable = false;
    const c = el("span", { class: "food-icon loading-char", "aria-hidden": "true" }, img);
    // 画像が読めなかった場合は仮表示にする（iconEl と同じ扱い）
    img.addEventListener("error", () => { c.replaceChildren(charPlaceholderEl()); }, { once: true });
    return c;
  }));
  const factThumb = el("span", { class: "loading-fact-thumb" });
  const factName = el("div", { class: "loading-fact-name" }, "");
  const factText = el("p", { class: "loading-fact-text" }, "");
  const factCard = el("div", { class: "loading-fact" },
    factThumb,
    el("div", { class: "grow" }, factName, factText));
  factCard.hidden = LOADING_FACT_POOL.length === 0;
  let lastFactName = null;
  const showFact = () => {
    const f = pickLoadingFact(LOADING_FACT_POOL, Math.random, lastFactName);
    if (!f) return;
    lastFactName = f.name;
    factThumb.replaceChildren(iconEl(f.name));
    factName.textContent = `${f.name}のまめちしき`;
    factText.textContent = f.trivia;
  };
  showFact();
  appRoot.append(el("div", { class: "loading-view" }, charsRow, msgNode, factCard));
  // キャラの動きは loading.js の物理モーション（rAF で transform のみ更新）が担う。
  // 各キャラが自分のリズムで跳ね回り、タップするとそのキャラが高く跳ぶ。
  // reduced-motion では動かさず、rAF が無い環境では CSS アニメーションに倒す。
  const charEls = Array.from(charsRow.children);
  loadingMotion = attachCharMotion(charEls);
  if (loadingMotion && loadingMotion.active) {
    charEls.forEach((c) => c.addEventListener("click", () => loadingMotion.poke(c)));
  } else if (!loadingMotion) {
    charEls.forEach((c, i) => {
      c.classList.add("bounce");
      c.style.animationDelay = `${(i * 0.13).toFixed(2)}s`;
      c.addEventListener("click", () => {
        c.classList.remove("hop");
        void c.offsetWidth; // アニメーションを最初から再生し直す
        c.classList.add("hop");
      });
      c.addEventListener("animationend", (e) => {
        if (e.animationName === "char-hop") c.classList.remove("hop");
      });
    });
  }
  let msgIdx = 0;
  const msgTimer = setInterval(() => {
    if (!msgNode.isConnected) { stopLoadingView(); return; }
    msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
    msgNode.textContent = LOADING_MESSAGES[msgIdx];
  }, 1600);
  const factTimer = setInterval(() => {
    if (!factText.isConnected) { stopLoadingView(); return; }
    showFact();
  }, 3500);
  loadingTimers = [msgTimer, factTimer];
}

// ---------- 「別の提案を見る」の処理中フィードバック ----------
// 計算自体は一瞬で終わるため、そのまま描き直すと「押せたのか」が分からない。
// 押したボタンはスピナー＋「探しています…」の処理中表示（無効化）になり、
// 最低 REFRESH_MIN_MS はその状態を保ってから新しい提案を描く。描き直し後は
// カードが順番にふわりと現れ（.card-enter）、切り替わったことが目で分かる。
// 処理中表示は、成功時は描き直しで、失敗時は catch で必ず元に戻す。
const REFRESH_MIN_MS = 450;
let refreshBusy = false; // おすすめ・組み合わせ共通の二重押し防止
let refreshEnterSection = null; // 直後の描画で出現アニメーションを付けるセクション: "suggest" | "combo"

function runRefreshWithFeedback(btn, apply) {
  if (refreshBusy) return;
  refreshBusy = true;
  const originalLabel = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    btn.replaceChildren(el("span", { class: "btn-spinner", "aria-hidden": "true" }), "探しています…");
  }
  setTimeout(() => {
    try {
      apply(); // 中で renderMain() され、ボタンごと描き直される（処理中表示はそこで消える）
    } catch (e) {
      // 失敗しても処理中表示は必ず元に戻す
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
        btn.removeAttribute("aria-busy");
        btn.textContent = originalLabel;
      }
      toast("提案の更新に失敗しました。もう一度お試しください");
    } finally {
      refreshBusy = false;
    }
  }, REFRESH_MIN_MS);
}

// ---------- はじめてガイド ----------
function renderGuideCard() {
  return el("div", { class: "card guide-card" },
    el("h2", {}, "👋 はじめてガイド"),
    el("p", { class: "hint" }, "冷蔵庫の在庫と期限を家族で共有する手帳です。コンセプトは、家族みんなで楽しむ食材管理と「家族みんなでできる食育」。食材の知識ページやクイズで、遊びながら食べ物のことを学べます。"),
    GUIDE_STEPS.map((s) => el("div", { class: "guide-step" },
      el("span", { class: "guide-icon" }, s.icon),
      el("div", { class: "grow" }, el("strong", {}, s.title), el("p", { class: "hint" }, s.body)))),
    el("button", {
      class: "btn wide", onclick: () => {
        if (state.user) markGuideSeen(localStorage, state.user.id);
        state.showGuide = false;
        if (state.fridge) renderMain(); else renderFridgePicker();
      },
    }, "わかった！はじめる"),
  );
}

// ---------- 法的ページ（プライバシーポリシー／利用規約） ----------
function renderLegalPage() {
  captureLeavingLoadingView();
  stopLoadingView();
  appRoot.replaceChildren();
  const doc = legalDocs().find((d) => d.id === state.legalView) || legalDocs()[0];
  const wrap = el("div", { class: "card legal-page" },
    el("button", {
      class: "btn secondary small", onclick: () => {
        state.legalView = null;
        if (state.user && state.fridge) renderMain();
        else if (state.user) renderFridgePicker();
        else renderAuth();
      },
    }, "← もどる"),
    el("h2", {}, doc.title),
    el("p", { class: "hint" }, "※ これは下書きです。[運営者名] などの空欄は、公開前に運営者が記入します。"),
  );
  for (const sec of doc.sections) {
    wrap.append(el("h3", { class: "legal-h" }, sec.heading));
    if (sec.table) {
      wrap.append(el("div", {}, sec.table.map(([k, v]) =>
        el("div", { class: "legal-row" }, el("strong", {}, k), el("p", { class: "k-text" }, v)))));
    }
    for (const line of sec.lines || []) wrap.append(el("p", { class: "k-text" }, line));
  }
  appRoot.append(wrap);
  releaseLeavingLoadingView();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function legalLinks() {
  return el("div", { class: "legal-links" },
    el("button", { class: "link-btn", type: "button", onclick: () => { state.legalView = "privacy"; renderLegalPage(); } }, "プライバシーポリシー"),
    el("span", {}, "・"),
    el("button", { class: "link-btn", type: "button", onclick: () => { state.legalView = "terms"; renderLegalPage(); } }, "利用規約"));
}

// ---------- サイドバーメニュー（ドロワー） ----------
// ヘッダーの ☰ から左にスライドインするメニュー（SIP & SEEK の作りが参考）。
// プロフィールカード＋グループ別のカード型メニューで、タブ移動・ゲーム・
// 設定まわりへ一足飛びに行ける。下部ナビはそのまま残し、これは追加の入り口。
// 開いている間は背面のスクロールを止める（body.drawer-open）。
const menuBtn = document.getElementById("menu-btn");
let drawerRoot = null;
let drawerCloseTimer = null;
function syncMenuButton() {
  // メインアプリ内（ログイン済み＋冷蔵庫を開いている）でのみ出す。
  // 認証画面・冷蔵庫選択では出さない（やさいあわせの全画面シェルの下でも
  // シェルに覆われて押せない）。
  if (menuBtn) menuBtn.hidden = !(state.user && state.fridge);
}
if (menuBtn) menuBtn.addEventListener("click", () => openDrawer());
// ヘッダーの「最新に更新」ボタン: 設定タブ／ドロワーと同じ forceAppUpdate を
// そのまま呼ぶ。古い版で固まったときに設定まで辿らなくて済むよう常時表示にし、
// 押下中は回転アニメーション（.is-updating）で確認中を示す。
const updateBtn = document.getElementById("update-btn");
if (updateBtn) updateBtn.addEventListener("click", () => { updateBtn.classList.add("is-updating"); forceAppUpdate(null); });
function goTab(tab) {
  state.tab = tab; state.knowledgeName = null; state.gameView = false; state.game = null;
  state.suikaView = false; state.recipeDetail = null; state.recipeFilter = "all"; state.recipeCourse = null;
  renderMain();
}
function drawerItem(icon, label, sub, onClick) {
  return el("button", { class: "drawer-item", type: "button", onclick: () => { closeDrawer(); onClick(); } },
    el("span", { class: "drawer-item-icon", "aria-hidden": "true" }, icon),
    el("span", { class: "grow" }, label, sub ? el("span", { class: "drawer-item-sub" }, sub) : null));
}
function drawerSection(label, items) {
  return el("div", { class: "drawer-section" },
    el("div", { class: "drawer-section-label" }, label),
    el("div", { class: "drawer-card" }, items));
}
function openDrawer() {
  if (drawerRoot || !state.user || !state.fridge) return;
  clearTimeout(drawerCloseTimer);
  const name = state.user.displayName || "なまえ未設定";
  const memberNote = state.members.length ? `・メンバー ${state.members.length}人` : "";
  const root = el("div", { class: "drawer-root" },
    el("div", { class: "drawer-backdrop", onclick: () => closeDrawer() }),
    el("aside", { class: "drawer-panel", role: "dialog", "aria-modal": "true", "aria-label": "メニュー" },
      el("div", { class: "drawer-head" },
        el("span", { class: "drawer-menu-label" }, "MENU"),
        el("button", { class: "drawer-close", type: "button", "aria-label": "メニューを閉じる", onclick: () => closeDrawer() }, "✕")),
      el("div", { class: "drawer-profile" },
        el("span", { class: "drawer-avatar", "aria-hidden": "true" }, "🧊"),
        el("div", { class: "grow" },
          el("div", { class: "drawer-fridge" }, state.fridge.name),
          el("div", { class: "hint" }, `${name} さん${memberNote}`))),
      drawerSection("メイン", [
        drawerItem("🧊", "在庫", null, () => goTab("stock")),
        drawerItem("🛒", "買い物", null, () => goTab("shopping")),
        drawerItem("🍳", "レシピ", null, () => goTab("recipes")),
        drawerItem("📖", "図鑑", null, () => goTab("zukan")),
      ]),
      drawerSection("あそぶ・まなぶ", [
        drawerItem("🧺", "やさいあわせ", "野菜をくっつけて進化させるパズル", () => { state.gameView = false; state.game = null; state.suikaView = true; renderMain(); }),
        drawerItem("🎮", "食材クイズ", "旬やまめちしきの3択クイズ", () => { state.game = null; state.gameView = true; state.suikaView = false; renderMain(); }),
      ]),
      drawerSection("共有・設定", [
        drawerItem("🔗", "共有・設定", null, () => goTab("settings")),
        drawerItem("🔄", "アプリを最新に更新", null, () => forceAppUpdate(null)),
        drawerItem("👋", "使い方ガイド", null, () => { state.showGuide = true; renderMain(); try { window.scrollTo(0, 0); } catch { /* noop */ } }),
        drawerItem("🛡", "プライバシーポリシー", null, () => { state.legalView = "privacy"; renderMain(); }),
        drawerItem("📜", "利用規約", null, () => { state.legalView = "terms"; renderMain(); }),
      ]),
    ));
  drawerRoot = root;
  document.body.append(root);
  document.body.classList.add("drawer-open");
  void root.offsetWidth; // 初期位置（画面外）からスライドさせるため描画を確定させる
  root.classList.add("open");
}
function closeDrawer() {
  if (!drawerRoot) return;
  const root = drawerRoot;
  drawerRoot = null;
  document.body.classList.remove("drawer-open");
  root.classList.remove("open");
  const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { root.remove(); return; }
  drawerCloseTimer = setTimeout(() => root.remove(), 280);
}

// ---------- サーバー発プッシュの購読（設定時のみ・本番モードのみ） ----------
// Firebase モード: FCM トークンを登録する（送信側は Cloud Functions 等が別途必要。
// トークン登録だけでは通知は届かない。README「プッシュ通知（サーバー発）」参照）。
// 旧 Supabase モード（ロールバック時）: Web Push（VAPID）購読を保存する。
async function maybeSubscribePush() {
  if (!store || !state.user) return;
  const cfg = globalThis.WAGAYA_CONFIG || {};
  try {
    if (store.mode === "firebase") {
      const key = cfg.FCM_VAPID_KEY || "";
      if (key && typeof store.registerPushToken === "function") {
        await store.registerPushToken(state.user.id, key);
      }
      return;
    }
    const vapid = cfg.VAPID_PUBLIC_KEY || "";
    if (!vapid || store.mode !== "supabase") return;
    const res = await subscribePush(vapid);
    if (res.ok) await store.savePushSubscription(state.user.id, res.subscription);
  } catch { /* 購読に失敗しても通知許可そのものには影響しない */ }
}

// ================= 認証画面 =================
function renderAuth(errorMsg = "") {
  if (state.legalView) { renderLegalPage(); return; }
  captureLeavingLoadingView();
  stopLoadingView();
  appRoot.replaceChildren();
  const email = el("input", { type: "email", autocomplete: "email", placeholder: "メールアドレス" });
  const pass = el("input", { type: "password", autocomplete: state.authTab === "login" ? "current-password" : "new-password", placeholder: "パスワード（6文字以上）" });
  const name = el("input", { type: "text", autocomplete: "nickname", placeholder: "表示名（ニックネームでOK）" });
  const card = el("div", { class: "card" },
    el("h2", {}, state.authTab === "login" ? "ログイン" : "アカウントを作る"),
    el("div", { class: "tabs" },
      el("button", { class: state.authTab === "login" ? "active" : "", onclick: () => { state.authTab = "login"; renderAuth(); } }, "ログイン"),
      el("button", { class: state.authTab === "signup" ? "active" : "", onclick: () => { state.authTab = "signup"; renderAuth(); } }, "新規登録"),
    ),
    el("label", {}, "メールアドレス"), email,
    el("label", {}, "パスワード"), pass,
    state.authTab === "signup" ? el("label", {}, "表示名") : null,
    state.authTab === "signup" ? name : null,
    errorMsg ? el("div", { class: "error" }, errorMsg) : null,
    el("button", {
      class: "btn wide", onclick: async () => {
        try {
          if (state.authTab === "login") state.user = await store.signIn(email.value, pass.value);
          else state.user = await store.signUp(email.value, pass.value, name.value.trim());
          toast(state.authTab === "login" ? "ログインしました" : "アカウントを作りました");
          await afterLogin();
        } catch (e) { renderAuth(userErrorMessage(e)); }
      },
    }, state.authTab === "login" ? "ログインする" : "登録する"),
    el("p", { class: "hint" }, store.mode === "demo"
      ? "デモモードでは、この端末の中だけで使えるローカルアカウントです。別の人を試すときは、一度ログアウトして別のメールアドレスで登録してください。"
      : "パスワードはログイン専門の仕組み（Firebase Authentication）が管理し、このアプリは保持しません。本名などの個人情報は集めません。"),
    legalLinks(),
  );
  appRoot.append(card);
  syncMenuButton();
  releaseLeavingLoadingView();
}

async function afterLogin() {
  renderLoadingView(); // 冷蔵庫一覧〜冷蔵庫を開くまでの待ち時間も読み込み画面にする
  state.tab = "stock";
  // 初回だけ、はじめてガイドを出す（設定からいつでも見直せる）
  if (state.user && !guideSeen(localStorage, state.user.id)) state.showGuide = true;
  try {
    state.fridges = await store.listMyFridges(state.user.id);
  } catch (e) {
    // オフライン＋キャッシュ無し（はじめて使う端末を圏外で開いた等）では
    // 一覧が取れない。読み込み画面や汎用エラーで固めず、理由と「最初に
    // 一度つないだ状態で開く」必要が分かる案内を選ぶ画面に出す。
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      renderFridgePicker("オフラインのため、冷蔵庫の一覧を読み込めませんでした。はじめて使う端末では、最初に一度つないだ状態で開いてください。電波の良いところで開き直すと、前回の続きが表示されます");
      return;
    }
    throw e;
  }
  const code = pendingJoin();
  if (code) {
    clearPendingJoin();
    document.getElementById("join-banner").hidden = true;
    try {
      const fridge = await store.joinByCode(state.user.id, code);
      toast(`「${fridge.name}」に参加しました`);
      state.fridges = await store.listMyFridges(state.user.id);
      await openFridge(fridge.id);
      return;
    } catch (e) {
      toast(userErrorMessage(e));
    }
  }
  if (state.fridges.length === 1) await openFridge(state.fridges[0].id);
  else renderFridgePicker();
}

// ================= 冷蔵庫の選択 =================
function renderFridgePicker(errorMsg = "") {
  captureLeavingLoadingView();
  stopLoadingView();
  appRoot.replaceChildren();
  if (state.showGuide) appRoot.append(renderGuideCard());
  const nameInput = el("input", { type: "text", placeholder: "例）わが家の冷蔵庫" });
  const codeInput = el("input", { type: "text", placeholder: "フレンドコード（例: K7QX-3M9P）", style: "text-transform:uppercase" });
  const pending = pendingJoin();
  if (pending) codeInput.value = formatCode(pending);
  const card = el("div", { class: "card" },
    el("h2", {}, "冷蔵庫を選ぶ"),
    state.fridges.length === 0
      ? el("p", { class: "hint" }, "まだ冷蔵庫がありません。下で新しく作るか、家族のフレンドコードで参加してください。")
      : el("div", {}, state.fridges.map((f) =>
          el("div", { class: "fridge-row" },
            el("span", { class: "grow" }, "🧊 " + f.name, el("span", { class: "chip" }, f.role === "owner" ? "作成者" : "メンバー")),
            el("button", { class: "btn small", onclick: () => openFridge(f.id) }, "開く"),
          ))),
    el("h3", {}, "冷蔵庫を作る"),
    nameInput,
    el("button", {
      class: "btn wide", onclick: async () => {
        try {
          const { fridge } = await store.createFridge(state.user.id, nameInput.value.trim());
          state.fridges = await store.listMyFridges(state.user.id);
          await openFridge(fridge.id);
          toast("冷蔵庫を作りました。共有タブでフレンドコードを家族に伝えてください");
        } catch (e) { renderFridgePicker(userErrorMessage(e)); }
      },
    }, "この名前で作る"),
    el("h3", {}, "フレンドコードで参加する"),
    pending ? el("p", { class: "hint" }, "QRコードから受け取った参加コードが入っています。そのまま「参加する」を押してください。") : null,
    codeInput,
    errorMsg ? el("div", { class: "error" }, errorMsg) : null,
    el("button", {
      class: "btn secondary wide", onclick: async () => {
        try {
          const fridge = await store.joinByCode(state.user.id, codeInput.value);
          clearPendingJoin();
          toast(`「${fridge.name}」に参加しました`);
          state.fridges = await store.listMyFridges(state.user.id);
          await openFridge(fridge.id);
        } catch (e) { renderFridgePicker(userErrorMessage(e)); }
      },
    }, "参加する"),
    el("button", {
      class: "btn ghost wide", onclick: async () => { await store.signOut(); state.user = null; renderAuth(); },
    }, "ログアウト"),
  );
  appRoot.append(card);
  syncMenuButton();
  releaseLeavingLoadingView();
}

// ================= 冷蔵庫を開く =================
async function openFridge(fridgeId) {
  state.fridge = state.fridges.find((f) => f.id === fridgeId) || null;
  if (!state.fridge) { renderFridgePicker(); return; }
  state.sessionTrash = [];
  state.suggestPage = 0; state.comboSeen = []; state.comboRound = 0;
  state.stockZone = STORAGE_ZONE_ALL; state.recipeDetail = null; state.recipeFilter = "all"; state.recipeCourse = null;
  state.recipeSource = "omakase"; state.pickerSelected = []; state.pickerInit = false;
  state.todayMenuThanks = false; state.confirmDeleteFridge = false;
  renderLoadingView(); // データ取得中は読み込み画面（キャラ＋豆知識）を出す
  try {
    await refreshData();
  } catch (e) {
    // 読み込み画面に閉じ込めない: 選択画面に戻してやり直せるようにする
    stopLoadingView();
    state.fridge = null;
    toast("読み込みに失敗しました: " + userErrorMessage(e));
    renderFridgePicker();
    return;
  }
  setupRealtime();
  // アプリを開いたタイミングのローカル通知（許可済み・1日1回・サーバー不要）
  // 消費期限の管理が OFF のときは期限通知を出さない
  notifyOnOpen(state.items, { expiryEnabled: expiryEnabled() }).catch(() => {});
  renderMain();
}
async function refreshData() {
  const fid = state.fridge.id, uidNow = state.user.id;
  [state.items, state.shopping, state.settings, state.members] = await Promise.all([
    store.listItems(uidNow, fid), store.listShopping(uidNow, fid), store.getSettings(uidNow, fid), store.listMembers(uidNow, fid),
  ]);
  state.favRecipes = await store.listFavoriteRecipes(uidNow, fid).catch(() => []);
  state.todayMenu = await store.getTodayMenu(uidNow, fid).catch(() => ({ date: todayISO(), entries: [] }));
  state.catalog = await store.listCatalog(uidNow, fid).catch(() => []);
  state.inviteCode = await store.getInviteCode(uidNow, fid).catch(() => null);
  state.trash = store.mode === "demo" && typeof store.listTrash === "function"
    ? await store.listTrash(uidNow, fid).catch(() => []) : [];
}

// ================= メイン画面 =================
function renderMain() {
  if (state.legalView) { renderLegalPage(); return; }
  captureLeavingLoadingView();
  stopLoadingView();
  if (state.tab !== "recipes") refreshEnterSection = null; // 別タブの描画に出現アニメーションを持ち越さない
  if (!state.suikaView && suikaCtrl) suikaCtrl.detach(); // ゲーム画面を離れたら物理ループを止める
  if (!state.suikaView) suikaFitFn = null; // 離れたらリサイズ時のフィット対象も外す
  appRoot.replaceChildren();
  const content = el("div", {});
  if (state.showGuide) content.append(renderGuideCard());
  if (state.knowledgeName) content.append(renderKnowledgePage());
  else if (state.gameView) content.append(renderGamePage());
  else if (state.suikaView) { /* やさいあわせは全画面シェル（body 直下のオーバーレイ）で開く */ }
  else if (state.recipeDetail) content.append(renderRecipeDetailPage());
  else if (state.tab === "stock") content.append(renderStockTab());
  else if (state.tab === "shopping") content.append(renderShoppingTab());
  else if (state.tab === "recipes") content.append(renderRecipesTab());
  else if (state.tab === "zukan") content.append(renderZukanTab());
  else content.append(renderSettingsTab());
  appRoot.append(content);
  const nav = el("nav", { class: "bottom-nav" },
    navBtn("stock", "🧊", "在庫"), navBtn("shopping", "🛒", "買い物"),
    navBtn("recipes", "🍳", "レシピ"), navBtn("zukan", "📖", "図鑑"), navBtn("settings", "🔗", "共有・設定"),
  );
  appRoot.append(nav);
  syncSuikaShell();
  releaseLeavingLoadingView();
  document.getElementById("header-sub").textContent = state.fridge ? state.fridge.name : "";
  syncMenuButton();
}
function navBtn(tab, icon, label) {
  return el("button", { class: state.tab === tab && !state.knowledgeName && !state.gameView && !state.suikaView && !state.recipeDetail ? "active" : "", onclick: () => { state.tab = tab; state.knowledgeName = null; state.gameView = false; state.game = null; state.suikaView = false; state.recipeDetail = null; state.recipeFilter = "all"; state.recipeCourse = null; renderMain(); } },
    el("span", { class: "nav-icon" }, icon), label);
}

// ---------- 食材の知識ページ（食育） ----------
// 図鑑・在庫カード・買い物リストから開ける。キャラを大きく見せ、
// 「からだにいいこと／旬／見分け方／まめちしき／3択クイズ」をカードで表示する。
function openKnowledge(name, category) {
  // 詳細（知識ページ）へ進む前に、戻ってきたときのスクロール位置を覚える。
  // 図鑑で食材を選んで戻ると一覧が一番上に戻ってしまう問題への対策で、
  // フィルタ状態（state.zukanFilter）は元々保持されているので、足りないのは
  // スクロール位置だけだった。知識ページは短く、表示中にブラウザが
  // スクロールをクランプしてしまうため、開く前に保存しておく。
  try { state.knowledgeReturnY = window.scrollY || 0; } catch { state.knowledgeReturnY = 0; }
  state.knowledgeName = name;
  state.knowledgeCategory = category || null;
  renderMain();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function closeKnowledge() {
  state.knowledgeName = null;
  renderMain();
  // 一覧を再描画した直後に、開く前のスクロール位置へ戻す
  const y = state.knowledgeReturnY || 0;
  try { window.scrollTo(0, y); } catch { /* 表示専用 */ }
}
function renderKnowledgePage() {
  const name = state.knowledgeName;
  const category = state.knowledgeCategory || rarityCategory(name) || "その他";
  const info = knowledgeFor(name, category);
  const tier = rarityOf(name);
  const rec = state.catalog.find((c) => c.name === name);
  const wrap = el("div", {});
  const heroIcon = iconEl(name, category);
  const count = rec ? (rec.purchaseCount ?? 1) : 0;
  const lv = levelForCount(count);
  const section = (title, ...kids) => el("div", { class: "card k-section" }, el("h3", { class: "k-title" }, title), ...kids);
  // クイズ（正解したら褒める。間違えたらもう一度考えられる）
  const quizResult = el("p", { class: "quiz-result", hidden: true }, "");
  let quizDone = false;
  const quizBtns = info.quiz.choices.map((choice, idx) => el("button", {
    class: "btn secondary wide quiz-btn", onclick: () => {
      if (quizDone) return;
      if (idx === info.quiz.answer) {
        quizDone = true;
        quizResult.hidden = false;
        quizResult.textContent = `せいかい！🎉 すごい！ ${info.quiz.why}`;
        quizResult.classList.add("correct");
        for (const b of quizBtns) b.disabled = true;
        quizBtns[idx].classList.add("right");
      } else {
        quizResult.hidden = false;
        quizResult.textContent = "おしい！ もういちど かんがえてみよう。";
        quizResult.classList.remove("correct");
        quizBtns[idx].disabled = true;
        quizBtns[idx].classList.add("wrong");
      }
    },
  }, `${idx + 1}. ${choice}`));
  wrap.append(
    el("button", { class: "btn secondary small", onclick: () => closeKnowledge() }, "← もどる"),
    el("div", { class: "card knowledge-hero" },
      heroIcon,
      el("div", { class: "k-name" }, name),
      el("div", { class: "recipe-chips" },
        el("span", { class: "chip" }, category),
        tier === "ultra" ? el("span", { class: "rare-chip ultra" }, "激レア！") : tier === "rare" ? el("span", { class: "rare-chip rare" }, "レア") : null,
        rec ? el("span", { class: "chip" }, `Lv${lv} ・ ${count}回買ったよ`) : el("span", { class: "chip" }, "図鑑ではまだ未発見"),
        rec && titleFor(name, count) ? el("span", { class: "chip" }, `称号『${titleFor(name, count)}』`) : null,
      ),
      el("button", {
        class: "btn wide", onclick: () => {
          state.presetAdd = { name, category };
          state.knowledgeName = null;
          state.tab = "stock";
          renderMain();
          toast(`「${name}」を登録フォームに入れました`);
        },
      }, "この食材を在庫に登録する"),
    ),
    section("💪 からだにいいこと", el("p", { class: "k-text" }, info.body)),
    section("🌸 旬（おいしい季節）", el("p", { class: "k-text" }, info.season)),
    section("🔍 おいしいものの見分け方", el("p", { class: "k-text" }, info.choose)),
    section("💡 まめちしき", info.trivia.map((t) => el("p", { class: "k-text" }, "・" + t))),
    section("❓ 3択クイズ", el("p", { class: "k-text quiz-q" }, info.quiz.q), ...quizBtns, quizResult),
  );
  return wrap;
}

// ---------- 食材クイズゲーム（学びながら遊べるゲーム） ----------
// 図鑑タブから入る。問題は知識データ（旬・まめちしき・3択クイズ）から
// js/game.js が組み立てる。集めた食材を優先して出題し、足りなければ
// カタログから補う。結果は保存せず、在庫データには一切触れない。
function gamePool() {
  const catOf = new Map();
  for (const [, c, ns] of CATALOG) for (const n of ns) if (!catOf.has(n)) catOf.set(n, c);
  const collected = state.catalog.map((c) => ({
    name: c.name,
    category: c.category || catOf.get(c.name) || rarityCategory(c.name) || "その他",
  }));
  const seen = new Set(collected.map((p) => p.name));
  const rest = [...catOf.entries()]
    .filter(([n]) => !seen.has(n))
    .map(([name, category]) => ({ name, category }));
  // 集めた食材を中心に、プールが小さければカタログから補充する
  // （出題数が多いラウンドでは補充も多めにして顔ぶれを増やす）
  const want = state.gameCount || GAME_QUESTION_COUNT;
  return [...collected, ...rest.slice(0, Math.max(0, want * 2 - collected.length))];
}
function startGame() {
  const questions = buildGameQuestions(gamePool(), {
    count: state.gameCount || GAME_QUESTION_COUNT,
    seed: (Date.now() % 2147483646) + 1,
    difficulty: state.gameDifficulty || GAME_DIFFICULTY_DEFAULT,
  });
  state.game = { questions, index: 0, phase: "ask", selected: null, flags: [], streak: 0, bestStreak: 0 };
  state.gameView = true;
  renderMain();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function answerGame(idx) {
  const g = state.game;
  if (!g || g.phase !== "ask") return;
  const q = g.questions[g.index];
  const correct = idx === q.answer;
  g.flags.push(correct);
  g.streak = correct ? g.streak + 1 : 0;
  if (g.streak > g.bestStreak) g.bestStreak = g.streak;
  g.selected = idx;
  g.phase = "feedback";
  renderMain();
}
function renderGamePage() {
  const wrap = el("div", {});
  const backBtn = el("button", {
    class: "btn secondary small", onclick: () => { state.gameView = false; state.game = null; renderMain(); },
  }, "← 図鑑にもどる");
  wrap.append(backBtn);
  const g = state.game;
  // スタート画面
  if (!g) {
    const hero = el("div", { class: "card knowledge-hero game-hero" },
      iconEl("トマト", "野菜"), iconEl("にんじん", "野菜"), iconEl("卵", "卵・乳製品"),
      el("div", { class: "k-name" }, "🎮 食材クイズゲーム"),
      el("p", { class: "k-text" }, "3択クイズ・旬クイズ・なまえ当てのほかに、栄養クイズ、見分け方クイズ、からだの働きクイズ、都道府県クイズ、レシピクイズ、行事のごちそうクイズも出るよ。もんだいのかずと むずかしさを選んでね。集めた食材から問題が出るから、図鑑を集めるほど楽しくなるよ！"),
      el("div", { class: "tabs game-count-tabs", role: "tablist", "aria-label": "もんだいのかずを選ぶ" },
        GAME_COUNT_OPTIONS.map((n) => el("button", {
          class: (state.gameCount || GAME_QUESTION_COUNT) === n ? "active" : "",
          role: "tab", "aria-selected": (state.gameCount || GAME_QUESTION_COUNT) === n ? "true" : "false",
          onclick: () => { state.gameCount = n; renderMain(); },
        }, `${n}もん`))),
      el("div", { class: "tabs game-difficulty-tabs", role: "tablist", "aria-label": "むずかしさを選ぶ" },
        GAME_DIFFICULTIES.map((d) => el("button", {
          class: (state.gameDifficulty || GAME_DIFFICULTY_DEFAULT) === d.id ? "active" : "",
          role: "tab", "aria-selected": (state.gameDifficulty || GAME_DIFFICULTY_DEFAULT) === d.id ? "true" : "false",
          onclick: () => { state.gameDifficulty = d.id; renderMain(); },
        }, d.label))),
      el("button", { class: "btn wide", onclick: () => startGame() }, "ゲームスタート！"),
    );
    wrap.append(hero);
    return wrap;
  }
  // 結果画面
  if (g.index >= g.questions.length) {
    const result = scoreGame(g.flags);
    wrap.append(el("div", { class: "card knowledge-hero game-hero" },
      iconEl("かぼちゃ", "野菜"),
      el("div", { class: "k-name" }, "🎉 結果はっぴょう"),
      el("div", { class: "game-score" },
        el("span", { class: "chip" }, `${result.total}もん中 ${result.correct}もん せいかい`),
        el("span", { class: "chip" }, `いちばん長いれんぞくせいかいは ${result.bestStreak}もん`),
      ),
      el("p", { class: "k-text game-message" }, result.message),
      el("button", { class: "btn wide", onclick: () => startGame() }, "もう一回あそぶ"),
      el("button", { class: "btn secondary wide", onclick: () => { state.gameView = false; state.game = null; renderMain(); } }, "図鑑にもどる"),
    ));
    return wrap;
  }
  // 出題画面
  const q = g.questions[g.index];
  const scoreNow = g.flags.filter(Boolean).length;
  // 「当てる系」（hideChar: name/seasonfood/bodyhint/chooserev/nutrientrev/
  // category/recipein/recipeout/prefdish/eventdish）は、回答前に正解の
  // キャラを見せると答えがバレるので「？」プレースホルダにする。
  // 回答後（feedback）は正解発表としてキャラを出す。
  const heroIcon = (q.hideChar && g.phase === "ask")
    ? el("span", { class: "food-icon game-mystery" }, charPlaceholderEl())
    : iconEl(q.name, q.category);
  const typeLabel = {
    knowledge: "3択クイズ", season: "旬クイズ", name: "なまえ当てクイズ",
    nutrition: "栄養クイズ", choose: "見分け方クイズ", seasonfood: "旬の食べ物クイズ", regional: "郷土料理クイズ",
    category: "なかま分けクイズ", trivia: "まめちしきクイズ", bodyhint: "からだヒント当て",
    bodywork: "からだの働きクイズ", nutrientrev: "栄養から当てクイズ", chooserev: "見分け方から当てクイズ",
    prefecture: "都道府県クイズ", prefdish: "都道府県クイズ", recipein: "レシピクイズ", recipeout: "レシピクイズ",
    eventdish: "行事のごちそうクイズ",
  }[q.type] || "3択クイズ";
  const card = el("div", { class: "card game-card" },
    el("div", { class: "game-score" },
      el("span", { class: "chip" }, `第${g.index + 1}もん / 全${g.questions.length}もん`),
      el("span", { class: "chip" }, typeLabel),
      el("span", { class: "chip" }, `スコア ${scoreNow}点`),
      g.streak >= 2 ? el("span", { class: "chip warn" }, `${g.streak}れんぞく せいかい中！`) : null,
    ),
    el("div", { class: "knowledge-hero game-hero" }, heroIcon),
    el("p", { class: "game-q" }, q.q),
  );
  const btns = q.choices.map((choice, idx) => {
    const b = el("button", {
      class: "btn secondary wide quiz-btn game-choice", type: "button",
      onclick: () => answerGame(idx),
    }, `${idx + 1}. ${choice}`);
    if (g.phase === "feedback") {
      b.disabled = true;
      if (idx === q.answer) b.classList.add("right");
      else if (idx === g.selected) b.classList.add("wrong");
    }
    return b;
  });
  card.append(...btns);
  if (g.phase === "feedback") {
    const wasCorrect = g.selected === q.answer;
    const praise = CORRECT_PRAISE[(g.streak + g.index) % CORRECT_PRAISE.length];
    card.append(
      el("p", { class: "quiz-result" + (wasCorrect ? " correct" : "") },
        wasCorrect ? `せいかい！🎉 ${praise}` : `おしい！ こたえは「${q.choices[q.answer]}」だよ`),
      el("p", { class: "k-text" }, q.explain),
      el("button", {
        class: "btn wide", onclick: () => { g.index += 1; g.phase = "ask"; g.selected = null; renderMain(); },
      }, g.index + 1 >= g.questions.length ? "結果を見る" : "つぎのもんだいへ"),
    );
  }
  wrap.append(card);
  return wrap;
}

// ---------- やさいあわせ（ミニアプリ） ----------
// 図鑑タブから開く、わが家の食材手帳の中の小さなアプリ。
// 全画面シェル（.suika-app、100dvh）を body 直下に重ねて開き、中に
// スタート画面とゲーム画面を持つ。閉じるとメイン側は元のタブ・
// スクロール位置にそのまま戻る。js/suika.js が物理・合体・描画を担い、
// 進行状態はコントローラ側に保持する。ベストスコアだけ端末の
// localStorage（専用キー）に保存し、在庫データには一切触れない。
let suikaCtrl = null; // createSuikaGame のコントローラ（1つだけ使い回す）
let suikaFitFn = null; // 表示中のゲーム画面のボード幅フィット関数（リサイズ時に再計算）
let suikaShellEl = null; // 表示中の全画面シェル（閉じたら取り除く）
let suikaReturnY = 0; // シェルを開く前のスクロール位置（閉じたら復元する）
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => { if (suikaFitFn) suikaFitFn(); });
}
let suikaUi = null; // 現在表示中のゲーム画面の DOM 更新フック { update(state) }

function closeSuikaApp() {
  state.suikaView = false;
  renderMain();
}

// 全画面シェルの出し入れ（renderMain から毎回呼ばれる）。
// 開いている間は作り直さず、表示中の画面をそのまま保つ。
function syncSuikaShell() {
  if (state.suikaView) {
    if (!suikaShellEl) {
      try { suikaReturnY = window.scrollY || 0; } catch { suikaReturnY = 0; }
      suikaShellEl = renderSuikaPage();
      document.body.append(suikaShellEl);
      document.body.classList.add("suika-open");
    }
  } else if (suikaShellEl) {
    suikaShellEl.remove();
    suikaShellEl = null;
    document.body.classList.remove("suika-open");
    try { window.scrollTo(0, suikaReturnY); } catch { /* 表示専用 */ }
  }
}

function renderSuikaPage() {
  if (!suikaCtrl) {
    suikaCtrl = createSuikaGame({ onUpdate: (s) => { if (suikaUi) suikaUi.update(s); } });
  }

  // ----- ゲーム画面の部品 -----
  const scoreVal = el("span", { class: "suika-stat-num" }, "0");
  const bestVal = el("span", { class: "suika-stat-num accent" }, "0");
  const curIcon = el("span", { class: "suika-piece cur" });
  const curName = el("span", { class: "suika-piece-name" }, "");
  const nextIcon = el("span", { class: "suika-piece next" });
  const nextName = el("span", { class: "suika-piece-name" }, "");
  const melonBanner = el("p", { class: "suika-banner melon", role: "status" }, "🧺 やさいバスケットが できた！ すごい！");
  melonBanner.style.display = "none";
  const overBanner = el("p", { class: "suika-banner danger", role: "alert" }, "あふれそう！ 野菜をくっつけて 合体させて！");
  overBanner.style.display = "none";

  const canvas = el("canvas", { class: "suika-canvas", "aria-hidden": "true" });
  const overScore = el("span", { class: "suika-over-score" }, "0");
  const overBest = el("span", { class: "suika-over-best-num" }, "0");
  const overRecord = el("p", { class: "suika-over-record" }, "ベストスコア更新！");
  overRecord.style.display = "none";
  const overlay = el("div", { class: "suika-overlay" },
    el("div", { class: "suika-over-card" },
      el("p", { class: "suika-over-title" }, "あふれちゃった！"),
      el("p", { class: "hint" }, "ゲームオーバー"),
      el("p", { class: "suika-over-line" }, "スコア ", overScore),
      el("p", { class: "suika-over-best" }, "ベスト ", overBest),
      overRecord,
      el("div", { class: "suika-over-btns" },
        el("button", { class: "btn wide", type: "button", onclick: () => suikaCtrl?.restart() }, "もういちど"),
        el("button", { class: "btn secondary wide", type: "button", onclick: () => quitToHome() }, "もどる"),
      ),
    ),
  );
  overlay.style.display = "none";
  const playWrap = el("div", {
    class: "suika-wrap", role: "application",
    "aria-label": "やさいあわせゲームのプレイ画面。左右に動かして、はなすと野菜が落ちます",
  }, canvas, overlay);
  // 初期サイズ（fitBoard が実測で上書きする。論理サイズが目安）
  playWrap.style.width = `${SUIKA_W}px`;
  playWrap.style.height = `${SUIKA_H}px`;
  const boardArea = el("div", { class: "suika-board-area" }, playWrap);

  const dropBtn = el("button", {
    class: "btn suika-drop", type: "button", "aria-label": "野菜を落とす",
    onclick: () => suikaCtrl?.drop(),
  }, "おとす！");
  const controlsEl = el("div", { class: "suika-controls" },
      el("button", { class: "btn secondary suika-arrow", type: "button", "aria-label": "左へ動かす", onclick: () => suikaCtrl?.nudge(-1) }, "←"),
      dropBtn,
      el("button", { class: "btn secondary suika-arrow", type: "button", "aria-label": "右へ動かす", onclick: () => suikaCtrl?.nudge(1) }, "→"),
    );

  const gameScreen = el("div", { class: "suika-screen suika-game" },
    el("div", { class: "suika-topbar" },
      el("span", { class: "suika-topbar-title" }, "🧺 やさいあわせ"),
      el("button", { class: "btn secondary small", type: "button", onclick: () => quitToHome() }, "やめる"),
    ),
    el("div", { class: "suika-stats" },
      el("div", { class: "suika-stat" }, el("span", { class: "suika-stat-label" }, "スコア"), scoreVal),
      el("div", { class: "suika-stat" }, el("span", { class: "suika-stat-label" }, "ベスト"), bestVal),
      el("div", { class: "suika-nextbox" },
        el("div", { class: "suika-piece-box" }, el("span", { class: "suika-stat-label" }, "いま"), curIcon, curName),
        el("span", { class: "suika-arrow-mark", "aria-hidden": "true" }, "→"),
        el("div", { class: "suika-piece-box dim" }, el("span", { class: "suika-stat-label" }, "つぎ"), nextIcon, nextName),
      ),
    ),
    melonBanner, overBanner,
    boardArea,
    controlsEl,
    el("p", { class: "hint suika-game-hint" }, "野菜を左右に動かして、はなすか「おとす！」で落とすよ。"),
  );
  gameScreen.style.display = "none";

  // ----- スタート画面 -----
  const bestHomeVal = el("span", { class: "suika-home-best-num" }, String(suikaCtrl.getState().best));
  // 進化の順番
  const evoKids = [];
  VEG_STAGES.forEach((s, i) => {
    const ic = iconEl(s.name, "野菜");
    const px = Math.round(26 + i * 3.4);
    ic.style.width = `${px}px`;
    ic.style.height = `${px}px`;
    evoKids.push(el("span", { class: "suika-evo-item" }, ic,
      el("span", { class: "suika-evo-name" }, s.name),
      el("span", { class: "suika-evo-score" }, `${s.score}点`)));
    if (i < VEG_STAGES.length - 1) evoKids.push(el("span", { class: "suika-evo-arrow", "aria-hidden": "true" }, "→"));
  });
  const homeScreen = el("div", { class: "suika-screen suika-home" },
    el("div", { class: "suika-topbar" },
      el("span", { class: "suika-topbar-title" }, "わが家の食材手帳"),
      el("button", { class: "btn secondary small", type: "button", onclick: () => closeSuikaApp() }, "✕ とじる"),
    ),
    el("div", { class: "suika-home-body" },
      el("div", { class: "suika-hero" }, iconEl("やさいバスケット", "野菜")),
      el("h2", { class: "suika-title" }, "やさいあわせ"),
      el("p", { class: "suika-tagline" }, "同じ野菜をくっつけて、大きく育てよう！"),
      el("div", { class: "suika-home-best" },
        el("span", { class: "suika-stat-label" }, "ベストスコア"), bestHomeVal),
      el("button", { class: "btn suika-play", type: "button", onclick: () => startGame() }, "▶ あそぶ"),
      el("div", { class: "card suika-howto" },
        el("h3", {}, "あそびかた"),
        el("p", { class: "k-text suika-desc" }, "同じ野菜同士がくっつくと、大きな野菜に進化！ プチトマトから育てて、最後は やさいバスケットを目指そう。点線を超えたままになると、あふれてゲームオーバーだよ。"),
        el("div", { class: "suika-evo" }, ...evoKids),
        el("p", { class: "hint" }, "落とせるのは プチトマト〜玉ねぎ の小さい野菜だけ。くっつけて合体させると、だんだん大きな野菜になります。"),
      ),
    ),
  );

  const shell = el("div", { class: "suika-app", role: "dialog", "aria-modal": "true", "aria-label": "やさいあわせ" },
    homeScreen, gameScreen);

  // ----- 画面遷移 -----
  function startGame() {
    suikaCtrl.restart();
    homeScreen.style.display = "none";
    gameScreen.style.display = "";
    suikaCtrl.attach(canvas, playWrap);
    requestAnimationFrame(fitBoard);
  }
  function quitToHome() {
    suikaCtrl.detach();
    suikaCtrl.restart(); // 進行中のゲームは破棄する（ベストは保存済みの分だけ残る）
    gameScreen.style.display = "none";
    homeScreen.style.display = "";
    bestHomeVal.textContent = String(suikaCtrl.getState().best);
  }

  suikaUi = {
    update(s) {
      scoreVal.textContent = String(s.score);
      bestVal.textContent = String(s.best);
      const cur = VEG_STAGES[s.current], nxt = VEG_STAGES[s.next];
      curIcon.replaceChildren(iconEl(cur.name, "野菜"));
      curName.textContent = cur.name;
      nextIcon.replaceChildren(iconEl(nxt.name, "野菜"));
      nextName.textContent = nxt.name;
      melonBanner.style.display = s.madeWatermelon && !s.gameOver ? "" : "none";
      overBanner.style.display = s.overflowing && !s.gameOver ? "" : "none";
      overlay.style.display = s.gameOver ? "" : "none";
      if (s.gameOver) {
        overScore.textContent = String(s.score);
        overBest.textContent = String(s.best);
        overRecord.style.display = s.isRecord ? "" : "none";
      }
      dropBtn.disabled = !!s.gameOver;
      // バナーの出入りでボード領域の高さが変わるので、サイズを合わせ直す
      if (suikaFitFn) suikaFitFn();
    },
  };

  // 画面内に収めつつ、できるだけ大きく: シェルが全画面を占有するので、
  // ボード領域（フレックスの残り）の実測から「幅いっぱい」を基本に決める。
  // v40 のフィットはメイン画面側の占有高を差し引いて測っていたため、
  // 実機ではボードが半分ほどに縮んでしまった。ここでは幅を縮める代わりに
  // 盤面の論理高さを computeSuikaBoardLayout の範囲内で調整して収める。
  // 物理・描画は論理座標で動くので、論理高さの変更は床の位置だけに効く。
  function fitBoard() {
    if (!playWrap.isConnected) return;
    try {
      const areaRect = boardArea.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      const availW = areaRect.width;
      const availH = vh > 0 ? Math.min(areaRect.height, vh) : areaRect.height;
      if (availW < 40 || availH < 40) return; // 非表示時などは初期サイズのまま
      const layout = computeSuikaBoardLayout(availW, availH);
      if (layout.width <= 0) return;
      suikaCtrl?.setBoardHeight(layout.logicalH);
      playWrap.style.width = `${layout.width}px`;
      playWrap.style.height = `${layout.height}px`;
    } catch { /* 計測できない環境では CSS のフォールバックに任せる */ }
  }
  suikaFitFn = fitBoard;
  return shell;
}

// ---------- 在庫タブ ----------
// お気に入りの在庫がゼロになったら買い物リストへ自動追加する。
// （残りわずか判定は廃止したので、トリガーは数量 0 のみ）
function isOutOfStockFavorite(item) {
  return !!item && !!item.isFavorite && Number(item.quantity) === 0;
}

async function maybeAutoAddShopping(item) {
  if (!isOutOfStockFavorite(item)) return;
  const exists = state.shopping.some((s) => s.linkedItemId === item.id && !s.isChecked);
  if (exists) return;
  const row = await store.addShopping(state.user.id, state.fridge.id, {
    name: item.name, quantity: 1, unit: item.unit, source: "favorite", linkedItemId: item.id,
  });
  state.shopping.push(row);
  toast(`お気に入りの「${item.name}」を買い物リストに追加しました`);
}

function renderStockTab() {
  const wrap = el("div", {});
  // お知らせ（消費期限の管理が OFF のときは期限のお知らせは出さない）
  const alerts = [];
  if (expiryEnabled()) {
    for (const item of state.items) {
      const d = daysUntil(item.expiryDate);
      if (d !== null && d <= 3) alerts.push(`⏰ 「${item.name}」は${expiryLabel(item.expiryDate)}（${formatDate(item.expiryDate)}）`);
    }
  }
  if (alerts.length) {
    wrap.append(el("div", { class: "card" }, el("h2", {}, "🔔 お知らせ"),
      alerts.map((a) => el("div", { class: "notice-item" }, a))));
  }
  wrap.append(renderAddItemForm());
  // 在庫の検索（名前の部分一致・カタカナ/ひらがなの揺れを吸収）。
  // 入力中に入力欄のフォーカスを失わないよう、再描画はリスト部分だけにする。
  const listBox = el("div", {});
  const updateStockList = () => listBox.replaceChildren(...stockListNodes());
  const searchInput = el("input", {
    type: "search", placeholder: "食材名で検索（例：たまご）", value: state.stockQuery || "",
  });
  searchInput.addEventListener("input", () => { state.stockQuery = searchInput.value; updateStockList(); });
  wrap.append(el("div", { class: "search-row" },
    el("span", { class: "search-icon" }, "🔍"),
    searchInput,
    el("button", {
      class: "btn ghost small", type: "button", onclick: () => {
        state.stockQuery = ""; searchInput.value = ""; updateStockList(); searchInput.focus();
      },
    }, "クリア"),
  ));
  // 保管場所の区分チップ（冷蔵庫／冷凍庫／野菜室／常温）: 図鑑のカテゴリ
  // チップと同じ見た目の、横スクロールする1行のチップバー。全区分を件数
  // つきで常時出す（0件の区分も隠さない）ので、件数によって並びや幅が
  // 変わらない。0件の区分を選んだときは、下のリスト側が「まだ食材が
  // ありません」の案内を出す。区分内でも期限グループ表示はそのまま。
  const zoneRow = el("div", { class: "zone-chip-row", role: "tablist", "aria-label": "保管場所で絞り込む" });
  const renderZoneChips = () => {
    const counts = countByStorage(state.items);
    const zones = [STORAGE_ZONE_ALL, ...STORAGE_ZONES];
    zoneRow.replaceChildren(...zones.map((z) => el("button", {
      type: "button", role: "tab",
      class: state.stockZone === z ? "active" : "",
      "aria-selected": state.stockZone === z ? "true" : "false",
      onclick: () => { state.stockZone = z; renderZoneChips(); updateStockList(); },
    }, z, el("span", { class: "cat-count" }, String(z === STORAGE_ZONE_ALL ? state.items.length : counts[z] || 0)))));
  };
  renderZoneChips();
  wrap.append(zoneRow);
  wrap.append(listBox);
  updateStockList();
  return wrap;
}

// 在庫リスト部分（期限グループ表示）。検索文字列・保管場所フィルタとも組み合わせる。
// 消費期限の管理が OFF のとき: 期限グループ見出しも期限順ソートもやめ、
// フォールバック並び（保管場所順 → 名前順 → 登録順）でフラットに並べる。
// 保管場所チップによる絞り込み（filterByStorage）は OFF でもそのまま効く。
function stockListNodes() {
  const nodes = [];
  const query = state.stockQuery || "";
  const zone = state.stockZone || STORAGE_ZONE_ALL;
  const showExpiry = expiryEnabled();
  const groups = [
    ["soon", "すぐ使いたい"], ["week", "今週中に"], ["later", "まだ余裕あり"],
  ];
  const sorted = filterByStorage(state.items, zone)
    .filter((i) => matchesSearch(i.name, query));
  if (showExpiry) {
    sorted.sort((a, b) => {
      const da = daysUntil(a.expiryDate), db = daysUntil(b.expiryDate);
      if (da === null && db === null) return a.name.localeCompare(b.name);
      if (da === null) return 1; if (db === null) return -1; return da - db;
    });
  } else {
    // フォールバック並び: 保管場所（STORAGE_ZONES の順）→ 名前 → 登録順（createdAt）
    const zoneOrder = (item) => {
      const idx = STORAGE_ZONES.indexOf(storageOf(item));
      return idx === -1 ? STORAGE_ZONES.length : idx;
    };
    sorted.sort((a, b) =>
      zoneOrder(a) - zoneOrder(b)
      || a.name.localeCompare(b.name)
      || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  }
  if (state.items.length === 0) {
    nodes.push(el("div", { class: "card" }, el("p", { class: "empty" }, "まだ食材がありません。\n上のフォームから登録してみましょう。")));
    return nodes;
  }
  if (sorted.length === 0) {
    const zoneActive = zone !== STORAGE_ZONE_ALL;
    nodes.push(el("div", { class: "card" }, el("p", { class: "empty" },
      query && zoneActive ? `「${query}」に合う食材は${zone}にありませんでした。\n別の名前で探すか、区分を変えてみてください。`
        : query ? `「${query}」に合う食材がありませんでした。\n別の名前で探してみてください。`
          : `${zone}にはまだ食材がありません。\n上のフォームから登録するか、別の区分を選んでください。`)));
    return nodes;
  }
  if (query) nodes.push(el("p", { class: "hint" }, `「${query}」の検索結果：${sorted.length}件`));
  else if (zone !== STORAGE_ZONE_ALL) nodes.push(el("p", { class: "hint" }, `${zone}の食材：${sorted.length}件`));
  if (!showExpiry) {
    // 期限 OFF: グループ見出しなしでフラットに並べる（並びは上のフォールバック順）
    for (const item of sorted) nodes.push(renderItemCard(item));
    return nodes;
  }
  for (const [key, label] of groups) {
    const rows = sorted.filter((i) => expiryGroup(i.expiryDate) === key);
    if (!rows.length) continue;
    nodes.push(el("h3", { class: "group-title" }, el("span", { class: "dot " + key }), label, el("span", { class: "group-count" }, `${rows.length}件`)));
    for (const item of rows) nodes.push(renderItemCard(item));
  }
  return nodes;
}

function renderItemCard(item) {
  const d = daysUntil(item.expiryDate);
  const meta = [
    el("span", { class: "chip" }, item.category),
    el("span", { class: "chip" }, item.storage),
    // 消費期限の管理が OFF のときは期限チップを出さない（データ自体は保持する）
    (expiryEnabled() && item.expiryDate) ? el("span", { class: "chip expiry-chip " + (expiryChipClass(d) || "") }, `期限 ${formatDate(item.expiryDate)}・${expiryLabel(item.expiryDate)}`) : null,
  ];
  const iconTile = iconEl(item.name, item.category);
  iconTile.classList.add("tile");
  iconTile.title = "食材の知識を見る";
  iconTile.style.cursor = "pointer";
  iconTile.addEventListener("click", () => openKnowledge(item.name, item.category));
  // 構造: グリッドの左列=アイコン、右列=名前+チップ、その下の独立行=数量と削除。
  // 1行フレックスに全部並べると固定幅の操作部に名前列が潰され、名前が
  // 1文字ずつ縦に折れる（実機で再発）。操作部は .item-ctrls の行に分離する。
  const card = el("div", { class: "card item-card" },
    iconTile,
    el("div", { class: "item-main" },
      el("div", { class: "item-name" }, item.isFavorite ? el("span", { class: "star" }, "★ ") : null, item.name),
      el("div", { class: "item-meta" }, meta),
    ),
    el("div", { class: "item-ctrls" },
      el("div", { class: "qty-ctrl" },
        el("button", { class: "qty-btn", onclick: () => changeQty(item, -1) }, "−"),
        el("span", { class: "qty-num" }, `${fmtQtyValue(item.quantity, item.unit)}${item.unit || ""}`),
        el("button", { class: "qty-btn", onclick: () => changeQty(item, 1) }, "+"),
      ),
      el("button", {
        class: "icon-btn", title: "削除", onclick: async () => {
          if (!confirm(`「${item.name}」を削除しますか？`)) return;
          const snapshot = { ...item };
          await store.deleteItem(state.user.id, item.id);
          // 本番モードはゴミ箱が端末内に無いので、この画面の間だけ復元用に保持する
          if (store.mode !== "demo") state.sessionTrash = [snapshot, ...state.sessionTrash].slice(0, 30);
          await refreshData(); renderMain();
          toastWithAction(`「${item.name}」を削除しました`, "元に戻す", async () => {
            await store.restoreDeletedItem(state.user.id, state.fridge.id, snapshot);
            state.sessionTrash = state.sessionTrash.filter((t) => t.id !== snapshot.id);
            await refreshData(); renderMain(); toast("元に戻しました");
          });
        },
      }, "🗑"),
    ),
  );
  card.style.padding = "12px 14px";
  return card;
}

async function changeQty(item, delta) {
  // 「玉」単位は 1/4 玉刻み、それ以外は 1 刻みで増減する
  const prev = Number(item.quantity);
  const next = Math.max(0, roundQty(prev + delta * qtyStepFor(item.unit)));
  if (next === prev) return;
  await store.updateItem(state.user.id, item.id, { quantity: next });
  item.quantity = next;
  await maybeAutoAddShopping(item);
  await refreshData();
  renderMain();
  toastWithAction(`「${item.name}」の数量を ${fmtQtyValue(next, item.unit)}${item.unit || ""} に変更しました`, "元に戻す", async () => {
    await store.updateItem(state.user.id, item.id, { quantity: prev });
    await refreshData(); renderMain(); toast("数量を元に戻しました");
  });
}

// 単位プルダウン: 選択肢から選ぶ＋最後の「その他（自由入力）」で
// 一覧にない単位もテキスト入力できる。既存データの単位が一覧にない場合は
// 「その他＋その値」で初期化し、編集しても値を失わない。
function createUnitPicker() {
  const sel = el("select", {},
    UNIT_OPTIONS.map((u) => el("option", { value: u }, u)),
    el("option", { value: UNIT_OTHER_VALUE }, "その他（自由入力）"));
  const custom = el("input", { type: "text", class: "unit-custom", placeholder: "単位を入力", style: "display:none" });
  const syncCustom = () => { custom.style.display = sel.value === UNIT_OTHER_VALUE ? "" : "none"; };
  const picker = {
    nodes: [sel, custom],
    onChange: null,
    getValue: () => resolveUnitValue(sel.value, custom.value),
    setValue: (v) => {
      const s = unitSelectValueFor(v);
      sel.value = s.selectValue;
      custom.value = s.customValue;
      syncCustom();
      if (picker.onChange) picker.onChange();
    },
  };
  sel.addEventListener("change", () => { syncCustom(); if (picker.onChange) picker.onChange(); });
  custom.addEventListener("input", () => { if (picker.onChange) picker.onChange(); });
  syncCustom();
  return picker;
}

function renderAddItemForm() {
  const name = el("input", { type: "text", placeholder: "例）鶏もも肉" });
  const category = el("select", {}, CATEGORIES.map((c) => el("option", { value: c }, c)));
  const qty = el("input", { type: "number", value: "1", min: "0", step: "0.5" });
  const unitPicker = createUnitPicker();
  // 「玉」単位のときだけ出す分数クイック選択（白菜・キャベツなどの頭野菜用）
  const FRACS = [[0.25, "1/4玉"], [0.5, "半玉（1/2）"], [0.75, "3/4玉"], [1, "1玉"], [1.5, "1玉半"], [2, "2玉"]];
  const fracRow = el("div", { class: "frac-row", style: "display:none" },
    el("span", { class: "frac-label" }, "分数で選ぶ："),
    FRACS.map(([v, label]) => el("button", {
      type: "button", class: "frac-chip",
      onclick: () => { qty.value = String(v); },
    }, label)));
  // 食材名に合わせてアイコンをプレビュー表示（図鑑と同じアイコン）
  const namePreview = el("div", { class: "name-preview" }, iconEl("", category.value), "食材名を入れるとアイコンが出ます");
  const updateNamePreview = () => {
    namePreview.replaceChildren(iconEl(name.value, category.value),
      name.value.trim() ? `「${name.value.trim()}」のアイコン` : "食材名を入れるとアイコンが出ます");
  };
  name.addEventListener("input", updateNamePreview);
  category.addEventListener("change", updateNamePreview);
  if (state.presetAdd) { // 図鑑からの下書きを反映（1回だけ使う）
    name.value = resolveCanonicalName(state.presetAdd.name);
    if (CATEGORIES.includes(state.presetAdd.category)) category.value = state.presetAdd.category;
    if (state.presetAdd.unit) unitPicker.setValue(state.presetAdd.unit);
    state.presetAdd = null;
    updateNamePreview();
  }
  const expiry = el("input", { type: "date", value: todayISO() });
  const storageSel = el("select", {}, STORAGE_ZONES.map((s) => el("option", { value: s }, s)));
  // カテゴリが「野菜」のときは保管場所を野菜室にプリセットする。
  // ユーザーが保管場所を手で選んだら、それ以降は自動で上書きしない。
  let storageTouched = false;
  storageSel.addEventListener("change", () => { storageTouched = true; });
  const syncStorageDefault = () => { if (!storageTouched) storageSel.value = suggestStorage(category.value); };
  category.addEventListener("change", syncStorageDefault);
  syncStorageDefault();
  const fav = el("input", { type: "checkbox" });
  // 単位が「玉」のときは数量を 1/4 刻みにし、分数クイック選択を出す
  const updateUnitUI = () => {
    const tama = isFractionUnit(unitPicker.getValue());
    qty.step = tama ? "0.25" : "0.5";
    fracRow.style.display = tama ? "" : "none";
  };
  unitPicker.onChange = updateUnitUI;
  updateUnitUI();
  // ---- よく買うもの／最近登録したもの（ワンタップ再登録） ----
  // 図鑑の購入回数と直近の登録から候補を出し、タップで名前・カテゴリ・単位を
  // フォームに入れる。あとは「登録する」を押すだけで再登録できる。
  const applyQuickPick = (n, c, u) => {
    name.value = n;
    if (c && CATEGORIES.includes(c)) category.value = c;
    syncStorageDefault();
    if (u) unitPicker.setValue(u);
    updateNamePreview(); updateUnitUI();
    try { name.focus(); } catch { /* noop */ }
    toast(`「${n}」をフォームに入れました。内容を確認して「登録する」を押してください`);
  };
  const quickChip = (label, sub, onclick) => el("button", {
    type: "button", class: "quick-chip", onclick,
  }, label, sub ? el("span", { class: "quick-sub" }, sub) : null);
  const quickKids = [];
  const top = topPurchased(state.catalog, 8);
  if (top.length) {
    quickKids.push(el("div", { class: "quick-label" }, "⭐ よく買うもの（タップで入力）"));
    quickKids.push(el("div", { class: "quick-row" }, top.map((c) => {
      const known = state.items.find((i) => i.name === c.name);
      return quickChip(c.name, `${c.purchaseCount ?? 1}回`, () =>
        applyQuickPick(c.name, rarityCategory(c.name) || (known ? known.category : ""), known ? known.unit : ""));
    })));
  }
  const recent = recentRegistered(state.items, 8);
  if (recent.length) {
    quickKids.push(el("div", { class: "quick-label" }, "🕘 最近登録したもの"));
    quickKids.push(el("div", { class: "quick-row" }, recent.map((i) =>
      quickChip(i.name, "", () => applyQuickPick(i.name, i.category, i.unit)))));
  }
  const quickBox = quickKids.length ? el("div", { class: "quick-box" }, ...quickKids) : null;
  // 消費期限の管理が OFF のときは期限入力欄自体を出さず、登録も expiryDate: null にする
  const showExpiry = expiryEnabled();
  const form = el("div", { class: "card" },
    el("h2", {}, "＋ 食材を登録"),
    quickBox,
    el("label", {}, "食材名"), name, namePreview,
    el("div", { class: "form-grid" },
      el("div", {}, el("label", {}, "カテゴリ"), category),
      el("div", {}, el("label", {}, "保管場所"), storageSel),
      el("div", {}, el("label", {}, "数量"), qty),
      el("div", {}, el("label", {}, "単位"), ...unitPicker.nodes),
      showExpiry ? el("div", {}, el("label", {}, "賞味・消費期限"), expiry) : null,
    ),
    fracRow,
    el("p", { class: "hint" }, "白菜・キャベツなどの頭野菜は、単位を「玉」にすると半玉（1/2）・1/4玉・3/4玉のような分数で登録できます。"),
    el("label", { class: "check-line" }, fav, "お気に入りにする（在庫がなくなったら買い物リストへ自動追加）"),
    el("button", {
      class: "btn wide", onclick: async () => {
        if (!name.value.trim()) { toast("食材名を入力してください"); return; }
        try {
          const beforeCounts = catalogCountsBefore();
          const item = await store.addItem(state.user.id, state.fridge.id, {
            name: resolveCanonicalName(name.value.trim()), category: category.value, quantity: roundQty(Number(qty.value) || 1),
            unit: unitPicker.getValue(), expiryDate: showExpiry ? (expiry.value || null) : null, storage: storageSel.value,
            isFavorite: fav.checked,
          });
          await refreshData(); renderMain();
          if (!celebratePurchase(item.name, beforeCounts)) toast(`「${item.name}」を登録しました`);
        } catch (e) { toast(userErrorMessage(e)); }
      },
    }, "登録する"),
  );
  return form;
}

// ---------- 食材図鑑タブ ----------
// 在庫に登録した食材が自動でコレクションされる図鑑（スコープは冷蔵庫単位）。
// 定番カタログはカラー/薄いの対比で「集める楽しさ」を出し、
// セルをタップすると、その食材を在庫登録フォームに下書きして在庫タブへ進む。
function renderZukanTab() {
  const wrap = el("div", { class: "zukan-wrap" });
  const collected = new Map(state.catalog.map((c) => [c.name, c]));
  const catalogNames = new Set(CATALOG.flatMap(([, , names]) => names));
  const totalInCatalog = catalogNames.size;
  const gotInCatalog = [...catalogNames].filter((n) => collected.has(n)).length;
  const extras = state.catalog.filter((c) => !catalogNames.has(c.name));
  // レアリティ別の収集状況（激レアは別枠で見せて「集める楽しさ」を出す）
  const tierNames = (tier) => CATALOG.flatMap(([, , names]) => names).filter((n) => rarityOf(n) === tier);
  const ultraNames = tierNames("ultra"), rareNames = tierNames("rare");
  const ultraGot = ultraNames.filter((n) => collected.has(n)).length;
  const rareGot = rareNames.filter((n) => collected.has(n)).length;
  const filterBtn = (key, label) => el("button", {
    class: state.zukanFilter === key ? "active" : "",
    onclick: () => { state.zukanFilter = key; renderMain(); },
  }, label);
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "📖 食材図鑑"),
    el("p", { class: "hint" }, "食材を在庫に登録すると、図鑑にも自動で記録されます。家族みんなで1つの図鑑を育てましょう。お買い物で見つけたらゲット！セルをタップすると、その食材の知識（食育）ページが開きます。買った回数が増えると食材のレベルが上がって称号がつきます。"),
    el("div", { class: "zukan-progress" },
      el("span", { class: "zukan-count" }, `${gotInCatalog} / ${totalInCatalog}`),
      el("span", {}, "種類をコレクション中"),
      extras.length ? el("span", { class: "chip" }, `カタログ外 ${extras.length} 種`) : null,
    ),
    el("div", { class: "zukan-bar" }, el("div", { class: "zukan-bar-fill", style: `transform:scaleX(${totalInCatalog ? (gotInCatalog / totalInCatalog).toFixed(3) : 0})` })),
    el("div", { class: "zukan-rare-progress" },
      el("span", { class: "rare-chip ultra" }, `激レア ${ultraGot}/${ultraNames.length} ゲット`),
      el("span", { class: "rare-chip rare" }, `レア ${rareGot}/${rareNames.length} ゲット`),
    ),
    el("div", { class: "tabs zukan-filter" },
      filterBtn("all", "すべて"),
      filterBtn("ultra", "激レアだけ"),
      filterBtn("rare", "レアだけ"),
    ),
    el("button", {
      class: "btn wide", onclick: () => { state.game = null; state.gameView = true; state.suikaView = false; renderMain(); },
    }, "🎮 食材クイズゲームであそぶ"),
    el("p", { class: "hint" }, "集めた食材の旬やまめちしきがクイズになるよ。遊びながら食材に詳しくなろう！"),
    el("button", {
      class: "btn wide", onclick: () => { state.gameView = false; state.game = null; state.suikaView = true; renderMain(); },
    }, "🧺 やさいあわせゲームであそぶ"),
    el("p", { class: "hint" }, "同じ野菜をくっつけて合体・進化させるパズルだよ。プチトマトから育てて、やさいバスケットを目指そう！"),
  ));
  // カテゴリ別の収集状況（チップに got/total を出す）
  const catStats = new Map();
  for (const [, , names] of CATALOG) for (const n of names) {
    const c = categoryOf(n);
    if (!c) continue;
    const s = catStats.get(c) || { total: 0, got: 0 };
    s.total++; if (collected.has(n)) s.got++;
    catStats.set(c, s);
  }
  const catChip = (key, label, got, total) => el("button", {
    type: "button",
    class: state.zukanCategory === key ? "active" : "",
    onclick: () => { state.zukanCategory = key; renderMain(); },
  }, label, total != null ? el("span", { class: "cat-count" }, `${got}/${total}`) : null);
  const cellFor = (name, category) => {
    const rec = collected.get(name);
    const tier = rarityOf(name);
    const icon = iconEl(name, category);
    if (!rec) icon.classList.add("locked"); // 未登録はミュゼ版の見せ方に合わせ、同じキャラをグレー淡色で表示（レア食材もシルエットにしない）
    const kids = [icon, el("span", { class: "zukan-name" }, name)];
    if (tier === "ultra") kids.push(el("span", { class: "rare-badge ultra" }, "激レア！"));
    else if (tier === "rare") kids.push(el("span", { class: "rare-badge rare" }, "レア"));
    if (rec) {
      const count = rec.purchaseCount ?? 1;
      const lv = levelForCount(count);
      const title = titleFor(name, count);
      kids.push(el("span", { class: "zukan-lv" }, `Lv${lv} ・ ${count}回`));
      if (title) kids.push(el("span", { class: "zukan-title" }, `『${title}』`));
      kids.push(el("span", { class: "zukan-next" }, `あと${remainingToNextLevel(count)}回で Lv${lv + 1}`));
    } else {
      kids.push(el("span", { class: "zukan-state" }, tier ? "❓ 未発見" : "まだ"));
    }
    return el("button", {
      type: "button",
      class: "zukan-cell" + (rec ? " got" : "") + (tier ? ` tier-${tier}` : ""),
      title: rec ? `${name}（${rec.firstAddedAt || ""} に初登録）` : `${name}（まだ見つけていません）`,
      onclick: () => openKnowledge(name, rarityCategory(name) || category),
    }, ...kids);
  };
  // カテゴリチップ（スティッキー）: レアリティ絞り込みと併用（AND）できる
  const catRow = el("div", { class: "zukan-cat-row", role: "tablist", "aria-label": "カテゴリで絞り込む" },
    catChip("all", "すべて", gotInCatalog, totalInCatalog));
  for (const c of catalogCategories()) {
    const s = catStats.get(c);
    if (s) catRow.append(catChip(c, c, s.got, s.total));
  }
  wrap.append(catRow);
  let shownAny = false;
  for (const [group, category, names] of CATALOG) {
    const shown = names.filter((n) =>
      (state.zukanFilter === "all" || rarityOf(n) === state.zukanFilter)
      && (state.zukanCategory === "all" || categoryOf(n) === state.zukanCategory));
    if (!shown.length) continue;
    shownAny = true;
    wrap.append(el("h3", { class: "group-title" }, el("span", { class: "dot week" }), group));
    wrap.append(el("div", { class: "zukan-grid" }, shown.map((n) => cellFor(n, category))));
  }
  const shownExtras = extras.filter((c) => state.zukanCategory === "all" || c.category === state.zukanCategory);
  if (shownExtras.length && state.zukanFilter === "all") {
    shownAny = true;
    wrap.append(el("h3", { class: "group-title" }, el("span", { class: "dot later" }), "自分で追加した食材"));
    wrap.append(el("div", { class: "zukan-grid" }, shownExtras.map((c) => cellFor(c.name, c.category))));
  }
  if (!shownAny) {
    wrap.append(el("p", { class: "hint" }, "この絞り込みに合う食材は、まだ図鑑にありません。カテゴリやレアリティの絞り込みを変えてみてね。"));
  }
  return wrap;
}

// ---------- 買い物タブ ----------
const SOURCE_LABEL = { manual: "手入力", favorite: "お気に入り", recipe: "レシピの材料", onetap: "ワンタップ" };
// ワンタップ追加: チップを押すだけで「いつもの数量・単位」でリストに入れる。
// すでに同名がリストにあれば、新しい行を作らず数量を増やす。
async function oneTapAddToShopping(entry) {
  const plan = planOneTapAdd(state.shopping, entry);
  try {
    if (plan.action === "increment") {
      await store.updateShopping(state.user.id, plan.rowId, { quantity: plan.quantity });
      toast(`「${entry.name}」はすでにリストにあるので、数量を増やしました（${fmtQtyValue(plan.quantity, plan.unit)}${plan.unit}）`);
    } else {
      await store.addShopping(state.user.id, state.fridge.id, {
        name: resolveCanonicalName(entry.name), quantity: plan.quantity, unit: plan.unit, source: "onetap",
      });
      toast(`「${entry.name}」を買い物リストに追加しました`);
    }
    await refreshData(); renderMain();
  } catch (e) { toast(userErrorMessage(e)); }
}
// ---------- カテゴリから選ぶ（買い物） ----------
// 図鑑と同じカテゴリ構造でカタログ食材を辿れる買い物導線。
// カテゴリは図鑑の表示グループ（激レア／レア）ではなく、食材の
// アプリ内カテゴリ（categoryOf / catalogCategories）を使う。
// 同じ食材名がカタログに複数回出る場合は最初のカテゴリで1回だけ出す。
function shoppingCatalogByCategory() {
  const byCat = new Map();
  const seen = new Set();
  for (const [, , names] of CATALOG) {
    for (const n of names) {
      if (seen.has(n)) continue;
      seen.add(n);
      const c = categoryOf(n);
      if (!c) continue;
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(n);
    }
  }
  return byCat;
}
// カテゴリブラウズからの追加: ワンタップ追加と同じ計画（planOneTapAdd）で、
// すでにリストに同名があれば数量を増やし、無ければ source: "manual" で新規追加する。
async function addCatalogItemToShopping(entry) {
  const plan = planOneTapAdd(state.shopping, entry);
  try {
    if (plan.action === "increment") {
      await store.updateShopping(state.user.id, plan.rowId, { quantity: plan.quantity });
      toast(`「${entry.name}」はすでにリストにあるので、数量を増やしました（${fmtQtyValue(plan.quantity, plan.unit)}${plan.unit}）`);
    } else {
      await store.addShopping(state.user.id, state.fridge.id, {
        name: resolveCanonicalName(entry.name), quantity: plan.quantity, unit: plan.unit, source: "manual",
      });
      toast(`「${entry.name}」を買い物リストに追加しました`);
    }
    state.shoppingEditor = null;
    await refreshData(); renderMain();
  } catch (e) { toast(userErrorMessage(e)); }
}
function renderShopBrowseCard() {
  const byCat = shoppingCatalogByCategory();
  const categories = catalogCategories().filter((c) => byCat.has(c));
  const selected = state.shoppingCategory && byCat.has(state.shoppingCategory)
    ? state.shoppingCategory : null;
  const card = el("div", { class: "card shop-browse-card" },
    el("h2", {}, "🗂 カテゴリから選ぶ"),
    el("p", { class: "hint" }, "カテゴリを選ぶと食材が並びます。食材をタップすると数量を選んで買い物リストに追加できます。"),
    el("div", { class: "shop-cat-row", role: "tablist", "aria-label": "カテゴリを選ぶ" },
      categories.map((c) => el("button", {
        type: "button", role: "tab",
        class: selected === c ? "active" : "",
        "aria-selected": selected === c ? "true" : "false",
        onclick: () => {
          state.shoppingCategory = c;
          state.shoppingEditor = null;
          renderMain();
        },
      }, c, el("span", { class: "cat-count" }, String(byCat.get(c).length))))),
  );
  if (!selected) {
    card.append(el("p", { class: "hint" }, "上のカテゴリを選んでください。"));
    return card;
  }
  const names = byCat.get(selected) || [];
  card.append(el("div", { class: "shop-browse-grid" }, names.map((name) => {
    const inQty = inListQuantity(state.shopping, name);
    const inRow = state.shopping.find((s) => s.name === name && !s.isChecked);
    const inUnit = inRow ? (inRow.unit || "") : "";
    const isEditing = state.shoppingEditor && state.shoppingEditor.name === name;
    return el("button", {
      type: "button",
      class: "shop-browse-item" + (inQty > 0 ? " in-list" : "") + (isEditing ? " editing" : ""),
      onclick: () => {
        state.shoppingEditor = { name, category: categoryOf(name) || selected };
        renderMain();
      },
    },
      iconEl(name, categoryOf(name) || selected),
      el("span", { class: "shop-browse-name" }, name),
      inQty > 0 ? el("span", { class: "onetap-badge" }, `リストに ${fmtQtyValue(inQty, inUnit)}${inUnit}`) : null,
    );
  })));
  // 数量・単位エディタ（タップした食材だけ、グリッドの下に開く）
  if (state.shoppingEditor) {
    const ed = state.shoppingEditor;
    // エディタ対象が今のカテゴリに無い場合は出さない（カテゴリ切替時に残らない）
    if (names.includes(ed.name)) {
      const defaults = usualQtyUnitFor(ed.name, state.items);
      const qtyInput = el("input", {
        type: "number", value: String(defaults.quantity), min: "0", step: "0.25",
        "aria-label": `${ed.name}の数量`,
      });
      const unitPicker = createUnitPicker();
      // いつもの単位が無ければ createUnitPicker の既定（「個」）を妥当な単位として使う
      unitPicker.setValue(defaults.unit || "");
      const syncQtyStep = () => { qtyInput.step = String(qtyStepFor(unitPicker.getValue())); };
      unitPicker.onChange = syncQtyStep;
      syncQtyStep();
      const stepQty = (delta) => {
        const step = qtyStepFor(unitPicker.getValue());
        const cur = Number(qtyInput.value);
        const base = Number.isFinite(cur) && cur > 0 ? cur : 0;
        qtyInput.value = String(Math.max(step, roundQty(base + delta * step)));
      };
      const inQty = inListQuantity(state.shopping, ed.name);
      const inRow = state.shopping.find((s) => s.name === ed.name && !s.isChecked);
      const inUnit = inRow ? (inRow.unit || "") : "";
      card.append(el("div", { class: "shop-editor" },
        el("div", { class: "shop-editor-head" },
          iconEl(ed.name, ed.category),
          el("span", { class: "grow shop-editor-name" }, ed.name),
          el("button", {
            type: "button", class: "icon-btn", "aria-label": "閉じる",
            onclick: () => { state.shoppingEditor = null; renderMain(); },
          }, "✕"),
        ),
        inQty > 0
          ? el("p", { class: "hint" }, `すでに買い物リストに ${fmtQtyValue(inQty, inUnit)}${inUnit} 入っています。「リストに追加」を押すと数量が増えます。`)
          : el("p", { class: "hint" }, `いつもの数量は ${fmtQtyValue(defaults.quantity, defaults.unit)}${defaults.unit} です。変えたいときは下で調整してください。`),
        el("label", {}, "数量"),
        el("div", { class: "qty-ctrl shop-editor-qty" },
          el("button", { type: "button", class: "qty-btn", onclick: () => stepQty(-1) }, "−"),
          qtyInput,
          el("button", { type: "button", class: "qty-btn", onclick: () => stepQty(1) }, "+"),
        ),
        el("label", {}, "単位"),
        ...unitPicker.nodes,
        el("button", {
          type: "button", class: "btn wide",
          onclick: () => {
            const q = Number(qtyInput.value);
            addCatalogItemToShopping({
              name: ed.name,
              quantity: Number.isFinite(q) && q > 0 ? roundQty(q) : 1,
              unit: unitPicker.getValue(),
            });
          },
        }, "リストに追加"),
      ));
    }
  }
  return card;
}
function renderShoppingTab() {
  const wrap = el("div", {});
  const name = el("input", { type: "text", placeholder: "買うもの（例：牛乳）" });
  // 単位も登録フォームと同じプルダウンで選べるようにする
  const unitPicker = createUnitPicker();
  // ---- ワンタップ追加（よく買うもの／最近買ったもの／お気に入り食材） ----
  const oneTap = oneTapCandidates(state.catalog, state.items, 10);
  const oneTapRows = [
    ["⭐ よく買うもの", oneTap.top],
    ["🕘 最近買ったもの", oneTap.recent],
    ["💗 お気に入り食材", oneTap.favorites],
  ].filter(([, entries]) => entries.length);
  const oneTapKids = [];
  if (oneTapRows.length) {
    for (const [label, entries] of oneTapRows) {
      oneTapKids.push(el("div", { class: "quick-label" }, label));
      oneTapKids.push(el("div", { class: "onetap-row" }, entries.map((entry) => {
        const inQty = inListQuantity(state.shopping, entry.name);
        const inRow = state.shopping.find((s) => s.name === entry.name && !s.isChecked);
        const inUnit = inRow ? (inRow.unit || "") : "";
        return el("button", {
          type: "button",
          class: "onetap-chip" + (inQty > 0 ? " in-list" : ""),
          onclick: () => oneTapAddToShopping(entry),
        },
          iconEl(entry.name),
          el("span", { class: "onetap-main" },
            el("span", { class: "onetap-name" }, entry.name),
            el("span", { class: "onetap-sub" }, `いつもの ${fmtQtyValue(entry.quantity, entry.unit)}${entry.unit}`)),
          inQty > 0 ? el("span", { class: "onetap-badge" }, `リストに ${fmtQtyValue(inQty, inUnit)}${inUnit}`) : null,
        );
      })));
    }
  } else {
    oneTapKids.push(el("p", { class: "hint" }, "買うたびに、ここによく買うものが並びます。タップするだけで、いつもの数量でリストに追加できます。"));
  }
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "👆 ワンタップ追加"),
    el("p", { class: "hint" }, "タップするだけで、いつもの数量・単位で買い物リストに入ります。すでにリストにあるものは数量が増えます。"),
    ...oneTapKids,
  ));
  // カテゴリから選ぶ（図鑑と同じカテゴリ構造でカタログから辿る）
  wrap.append(renderShopBrowseCard());
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🛒 買い物リスト"),
    state.shopping.length === 0
      ? el("p", { class: "empty" }, "リストは空です。\nお気に入りの在庫がなくなると自動で追加されます。")
      : state.shopping.map((s) => el("div", { class: "shop-row" },
          // おつかいの子が見分けやすいよう、キャラ＋名前を大きく目立たせる
          // キャラ／名前タップで食材の知識ページ（食育）にも行ける
          el("span", { class: "grow shop-main" },
            el("span", { class: "k-link", title: "食材の知識を見る", onclick: () => openKnowledge(s.name) }, iconEl(s.name)),
            el("span", { class: "shop-name k-link", title: "食材の知識を見る", onclick: () => openKnowledge(s.name) }, s.name), " ",
            rarityOf(s.name) === "ultra" ? el("span", { class: "rare-chip ultra" }, "激レア！") : rarityOf(s.name) === "rare" ? el("span", { class: "rare-chip rare" }, "レア") : null,
            el("span", { class: "chip" }, `${fmtQtyValue(s.quantity, s.unit)}${s.unit || ""}`),
            el("span", { class: "chip" }, SOURCE_LABEL[s.source] || "")),
          el("button", {
            class: "btn small", onclick: async () => {
              try {
                const beforeCounts = catalogCountsBefore();
                if (s.linkedItemId) {
                  const item = state.items.find((i) => i.id === s.linkedItemId);
                  if (item) {
                    await store.updateItem(state.user.id, item.id, { quantity: Number(item.quantity) + Number(s.quantity) });
                    // 数量を足すだけの経路でも「買った」として図鑑の購入回数を数える
                    await store.recordPurchase(state.user.id, state.fridge.id, s.name, rarityCategory(s.name) || "その他");
                  }
                } else {
                  await store.addItem(state.user.id, state.fridge.id, {
                    name: resolveCanonicalName(s.name), category: rarityCategory(s.name) || "その他", quantity: Number(s.quantity) || 1, unit: s.unit || "",
                    expiryDate: null, storage: "冷蔵庫", isFavorite: false,
                  });
                }
                await store.deleteShopping(state.user.id, s.id);
                await refreshData(); renderMain();
                if (!celebratePurchase(s.name, beforeCounts)) toast(`「${s.name}」を在庫に戻しました`);
              } catch (e) { toast(userErrorMessage(e)); }
            },
          }, "買った！"),
          el("button", {
            class: "icon-btn", onclick: async () => {
              await store.deleteShopping(state.user.id, s.id);
              await refreshData(); renderMain();
            },
          }, "✕"),
        )),
    el("h3", {}, "買い物を追加"),
    name,
    el("label", {}, "単位"),
    ...unitPicker.nodes,
    el("button", {
      class: "btn secondary wide", onclick: async () => {
        if (!name.value.trim()) { toast("買うものを入力してください"); return; }
        await store.addShopping(state.user.id, state.fridge.id, { name: resolveCanonicalName(name.value.trim()), quantity: 1, unit: unitPicker.getValue(), source: "manual" });
        await refreshData(); renderMain();
      },
    }, "リストに追加"),
  ));
  return wrap;
}

// ---------- レシピタブ ----------
// お気に入りは「レシピ×モード」をキーに、レシピの内容そのもの
// （名前・材料・分量・手順）をスナップショット保存する。
// レシピは在庫から都度生成されるため、保存しておかないと後で見返せない。
function recipeKeyOf(recipe, mode) { return `${recipe.id}:${mode}`; }

// ---- おすすめ表示履歴（P3-2: 直近で表示したレシピを下げる） ----
const SUGGEST_HISTORY_KEY = "wagaya-suggest-history-v1";
function loadSuggestHistory() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SUGGEST_HISTORY_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function suggestDemoteIds() {
  const today = todayISO();
  const hist = loadSuggestHistory();
  const ids = new Set();
  for (const [date, list] of Object.entries(hist)) {
    if (date < today && Array.isArray(list)) for (const id of list) if (id) ids.add(id);
  }
  return ids;
}
function recordSuggestShown(ids) {
  try {
    const today = todayISO();
    const hist = loadSuggestHistory();
    const cur = new Set(Array.isArray(hist[today]) ? hist[today] : []);
    for (const id of ids || []) if (id) cur.add(id);
    hist[today] = [...cur];
    // 4日より前のキーは捨てる（ISO日付の文字列比較でよい）
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 4);
    const cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const key of Object.keys(hist)) if (key < cutoff) delete hist[key];
    if (typeof localStorage !== "undefined") localStorage.setItem(SUGGEST_HISTORY_KEY, JSON.stringify(hist));
  } catch { /* 保存できなくても提案は続ける */ }
}

// ---- お気に入りの再評価（P8） ----
function currentRecipeDefinition(fav) {
  if (!fav || !fav.recipeId) return null;
  for (const list of [ALL_RECIPES, EVENT_RECIPES, REGIONAL_RECIPES]) {
    const found = (list || []).find((r) => r && r.id === fav.recipeId);
    if (found) return found;
  }
  return null;
}
function reevaluateFavorite(fav, size) {
  const def = currentRecipeDefinition(fav);
  if (!def) return null;
  try { return evaluateRecipe(def, state.items, (fav && fav.servings) || size); } catch { return null; }
}
function findFavorite(recipe, mode) {
  return state.favRecipes.find((f) => f.recipeKey === recipeKeyOf(recipe, mode));
}
async function toggleRecipeFavorite(recipe, mode, size) {
  const existing = findFavorite(recipe, mode);
  try {
    if (existing) {
      await store.removeFavoriteRecipe(state.user.id, state.fridge.id, existing.id);
      state.favRecipes = state.favRecipes.filter((f) => f.id !== existing.id);
      toast("レシピのお気に入りを外しました");
    } else {
      const snapshot = {
        recipeKey: recipeKeyOf(recipe, mode), recipeId: recipe.id, mode,
        title: recipe.title, minutes: recipe.minutes, tip: recipe.tip || "",
        steps: [...recipe.steps],
        have: recipe.have.map((i) => ({ ...i })), missing: recipe.missing.map((i) => ({ ...i })),
        servings: size,
      };
      const saved = await store.addFavoriteRecipe(state.user.id, state.fridge.id, snapshot);
      state.favRecipes = [...state.favRecipes.filter((f) => f.recipeKey !== saved.recipeKey), saved];
      toast("レシピをお気に入りに保存しました");
    }
  } catch (e) { toast(userErrorMessage(e)); }
  renderMain();
}
function favStarBtn(active, onclick) {
  return el("button", {
    class: "fav-btn" + (active ? " active" : ""), type: "button",
    title: active ? "お気に入りから外す" : "お気に入りに保存",
    "aria-label": active ? "お気に入りから外す" : "お気に入りに保存",
    onclick,
  }, active ? "★" : "☆");
}
async function addMissingToShopping(missing) {
  for (const m of missing)
    await store.addShopping(state.user.id, state.fridge.id, { name: m.name, quantity: m.amount, unit: m.unit, source: "recipe" });
  await refreshData(); toast("足りない材料を買い物リストに追加しました");
}

// ---------- 今日の献立ボード ----------
// 「今日作るもの」の一時保存。保存先は冷蔵庫の設定レコード
// （fridge_settings の todayMenu フィールド）で、メンバー全員に共有される。
// 日付が変わるとストア側の読み取りで自動的に空になる（翌日リセット）。
// スナップショットはレシピお気に入りと同じ形 + course（グループ分け用）と
// ingredients（買い物リスト追加時に今の在庫で再評価するため）。
function boardSnapshotOf(recipe, mode, size) {
  return {
    recipeKey: recipe.recipeKey || recipeKeyOf(recipe, mode),
    recipeId: recipe.recipeId || recipe.id || "", mode,
    title: recipe.title, minutes: recipe.minutes ?? null, tip: recipe.tip || "",
    steps: [...(recipe.steps || [])],
    have: (recipe.have || []).map((i) => ({ ...i })),
    missing: (recipe.missing || []).map((i) => ({ ...i })),
    servings: size || recipe.servings || state.settings.familySize || 2,
    course: recipe.course || "その他", genre: recipe.genre || "", method: recipe.method || "",
    note: recipe.note || "", pref: recipe.pref || "",
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((g) => ({
          name: g.name, per: g.per, unit: g.unit || "",
          // 在庫照合キーワード（evaluateRecipe の照合に必要。再評価のため保持する）
          ...(Array.isArray(g.match) ? { match: [...g.match] } : {}),
        })) : null,
  };
}
async function pinToTodayMenu(recipe, mode, size) {
  const entry = boardSnapshotOf(recipe, mode, size);
  const { board, added } = upsertTodayMenuEntry(state.todayMenu, entry);
  if (!added) { toast("すでに今日の献立に入っています"); return; }
  try {
    state.todayMenu = await store.setTodayMenu(state.user.id, state.fridge.id, board);
    state.todayMenuThanks = false;
    toast(`「${entry.title}」を今日の献立に入れました`);
  } catch (e) { toast(userErrorMessage(e)); }
  renderMain();
}
async function removeFromTodayMenu(recipeKey) {
  try {
    state.todayMenu = await store.setTodayMenu(state.user.id, state.fridge.id,
      removeTodayMenuEntry(state.todayMenu, recipeKey));
  } catch (e) { toast(userErrorMessage(e)); }
  renderMain();
}
/** ボード全体の「足りない材料」を、今の在庫で再評価して名前＋単位で統合する */
function boardMissingUnion() {
  const size = state.settings.familySize || 2;
  const lists = state.todayMenu.entries.map((e) => {
    if (Array.isArray(e.ingredients) && e.ingredients.length) {
      try {
        return evaluateRecipe(
          { id: e.recipeId, title: e.title, ingredients: e.ingredients, steps: e.steps || [] },
          state.items, size).missing;
      } catch { return e.missing || []; }
    }
    return e.missing || [];
  });
  return mergeMissingIngredients(lists);
}
async function addBoardMissingToShopping() {
  const union = boardMissingUnion();
  if (!union.length) { toast("足りない材料はありません"); return; }
  await addMissingToShopping(union);
  renderMain();
}
async function finishTodayMenu() {
  try {
    state.todayMenu = await store.setTodayMenu(state.user.id, state.fridge.id, { date: todayISO(), entries: [] });
    state.todayMenuThanks = true;
    toast("今日の献立を片付けました。おつかれさま！");
  } catch (e) { toast(userErrorMessage(e)); }
  renderMain();
}
function renderTodayMenuBoard() {
  const entries = state.todayMenu.entries;
  if (state.todayMenuThanks && entries.length === 0) {
    return el("div", { class: "card today-menu-card" },
      el("h2", {}, "🍽 今日の献立"),
      el("p", { class: "hint" }, "🎉 今日のごはん完成！おつかれさまでした。また明日、作るものをここに留めてください。"));
  }
  const card = el("div", { class: "card today-menu-card" }, el("h2", {}, "🍽 今日の献立"));
  if (!entries.length) {
    card.append(el("p", { class: "hint" },
      "レシピカードの「📌 今日の献立に入れる」で、今夜作るものをここに留めておけます。家族みんなに見えて、翌日になると自動で空になります。"));
    return card;
  }
  const size = state.settings.familySize || 2;
  for (const g of groupTodayMenuEntries(entries)) {
    card.append(el("h3", { class: "today-menu-group" }, g.group));
    for (const e of g.entries) {
      card.append(el("div", { class: "fridge-row today-menu-row" },
        el("span", {
          class: "grow k-link", title: "詳しい作り方を見る",
          // 詳細ページは recipe.id で recipeKey を作るため、保存時の recipeId を id に戻して渡す
          onclick: () => openRecipeDetail({ ...e, id: e.recipeId }, {
            mode: e.mode, size: e.servings || size, servingsLabel: `${e.servings || size}人分`,
          }),
        }, e.title),
        e.minutes ? el("span", { class: "chip" }, `約${e.minutes}分`) : null,
        el("button", {
          class: "icon-btn", "aria-label": `${e.title}を今日の献立から外す`,
          onclick: () => removeFromTodayMenu(e.recipeKey),
        }, "✕"),
      ));
    }
  }
  card.append(el("div", { class: "today-menu-actions" },
    el("button", { class: "btn secondary", onclick: addBoardMissingToShopping }, "足りない材料を買い物リストへ"),
    el("button", { class: "btn", onclick: finishTodayMenu }, "作った！"),
  ));
  return card;
}
/** 材料行の消費順メモ（どのロットから使うかを家族に伝える） */
function fifoNote(ing) {
  const f = ing.fifo;
  if (!f) return "";
  const parts = [];
  // 消費期限の管理が OFF のときは期限日付の詳細だけを隠し、購入順の案内に倒す
  // （レシピ内部の消費順＝FIFO そのものは OFF でも変えない）
  if (f.expiryDate && expiryEnabled()) parts.push(`期限 ${formatDate(f.expiryDate)} の分から`);
  else if (f.registeredAt) parts.push(`${formatDate(f.registeredAt)} に買った分から`);
  if (f.lotCount > 1) parts.push(`在庫${f.lotCount}件中`);
  return parts.length ? `（${parts.join("・")}）` : "";
}
function renderRecipeCard(r, { servingsLabel, starBtn, savedNote = "", onOpen = null, onPin = null }) {
  const card = el("div", { class: "card recipe-card" + (onOpen ? " openable" : "") },
    el("div", { class: "recipe-head" },
      el("h2", { class: "grow" }, r.title),
      starBtn,
    ),
    el("div", { class: "recipe-chips" },
      r.minutes ? el("span", { class: "chip" }, `約${r.minutes}分`) : null,
      servingsLabel ? el("span", { class: "chip" }, servingsLabel) : null,
      savedNote ? el("span", { class: "chip" }, savedNote) : null,
      r.course ? el("span", { class: "chip" }, r.course) : null,
      r.genre ? el("span", { class: "chip" }, `${r.genre}・${r.method || ""}`) : null,
      r.useUp ? el("span", { class: "chip" }, "使い切り") : null,
      r.steps && r.steps.length ? el("span", { class: "chip" }, `手順${r.steps.length}`) : null,
      isNewRecipe(r) ? el("span", { class: "chip new-chip" }, "NEW") : null,
      // 消費順の見える化: 期限の近いもの→先に買ったものの順で使うことを明示
      r.have.some((i) => i.fifo) ? el("span", { class: "chip fifo-chip" }, "期限の近いものから使います") : null,
    ),
    el("div", { class: "recipe-ing" },
      r.have.map((i) => el("div", { class: "have" }, "✓ ", iconEl(i.name), ` ${i.name} … ${fmtQtyValue(i.amount, i.unit)}${i.unit}`,
        i.fifo ? el("span", { class: "fifo-note" }, fifoNote(i)) : null)),
      r.missing.map((i) => el("div", { class: "missing" }, "＋ ", iconEl(i.name), ` ${i.name} … ${fmtQtyValue(i.amount, i.unit)}${i.unit}（買い足し）`)),
    ),
    r.tip ? el("p", { class: "hint" }, "💡 " + r.tip) : null,
    r.note ? el("p", { class: "hint region-note" }, "📍 " + (r.pref ? `【${r.pref}】` : "") + r.note) : null,
    r.missing.length ? el("button", {
      class: "btn secondary small", onclick: (e) => { e.stopPropagation(); addMissingToShopping(r.missing); },
    }, "足りない材料を買い物リストへ") : null,
    onPin ? el("button", {
      class: "btn secondary small", onclick: (e) => { e.stopPropagation(); onPin(); },
    }, "📌 今日の献立に入れる") : null,
    onOpen ? el("p", { class: "hint detail-hint" }, "タップで詳しい作り方を見る") : null,
  );
  if (onOpen) {
    // カード本体のタップで詳細ページへ。☆・買い物リスト追加ボタンの
    // クリックは詳細遷移へ伝播させない（ボタンの本来の動作だけが走る）。
    if (starBtn) starBtn.addEventListener("click", (e) => e.stopPropagation());
    card.addEventListener("click", onOpen);
  }
  return card;
}

// ---------- レシピ詳細ページ（全画面） ----------
// 詳細手順: recipes.js が detailedSteps(recipe) → [{text, minutes}] を
// export していればそれを使い、無ければ recipe.steps にフォールバックする。
function detailedStepsFor(recipe) {
  try {
    if (typeof recipesNs.detailedSteps === "function") {
      const ds = recipesNs.detailedSteps(recipe);
      if (Array.isArray(ds) && ds.length) {
        const mapped = ds.map((s) => (typeof s === "string"
          ? { text: s, minutes: null }
          : { text: s && s.text ? String(s.text) : "", minutes: s && s.minutes != null ? Number(s.minutes) : null }))
          .filter((s) => s.text);
        if (mapped.length) return mapped;
      }
    }
  } catch { /* 詳細手順が使えない場合は通常の手順にフォールバック */ }
  return (recipe.steps || []).map((s) => ({ text: String(s), minutes: null }));
}

function openRecipeDetail(recipe, { mode, size, servingsLabel = "", favId = null }) {
  state.recipeDetail = {
    recipe, mode, size, servingsLabel, favId,
    scrollY: typeof window !== "undefined" ? window.scrollY || 0 : 0,
    checked: new Set(), // 材料の準備チェック（この画面の間だけ保持・保存しない）
    cookMode: false, cookIndex: 0, // 調理モード（P5。この画面の間だけ保持・保存しない）
    wakeLock: null,
  };
  renderMain();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}

function renderRecipeDetailPage() {
  const d = state.recipeDetail;
  const r = d.recipe;
  const wrap = el("div", {});
  const releaseWakeLock = () => {
    try {
      const p = d.wakeLock?.release();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* Wake Lock の解放失敗は無視 */ }
    d.wakeLock = null;
  };
  const exitCookMode = () => { releaseWakeLock(); d.cookMode = false; renderMain(); };
  const startCook = async () => {
    d.cookMode = true; d.cookIndex = 0;
    try {
      if (typeof navigator !== "undefined") d.wakeLock = await navigator.wakeLock?.request("screen");
    } catch { /* Wake Lock が使えない環境ではそのまま続行 */ }
    renderMain();
  };
  const back = () => {
    const y = d.scrollY || 0;
    releaseWakeLock();
    state.recipeDetail = null;
    renderMain();
    try { window.scrollTo(0, y); } catch { /* 表示専用 */ }
  };
  // ☆の動作: お気に入り一覧から開いた場合は、その保存を外して一覧へ戻る。
  // それ以外は通常のトグル（詳細ページを開いたまま状態だけ更新する）。
  const isFav = d.favId ? true : !!findFavorite(r, d.mode);
  const onStar = async () => {
    if (d.favId) {
      try {
        await store.removeFavoriteRecipe(state.user.id, state.fridge.id, d.favId);
        state.favRecipes = state.favRecipes.filter((x) => x.id !== d.favId);
        toast("レシピのお気に入りを外しました");
      } catch (e) { toast(userErrorMessage(e)); return; }
      state.recipeDetail = null;
      renderMain();
      return;
    }
    const y = typeof window !== "undefined" ? window.scrollY || 0 : 0;
    await toggleRecipeFavorite(r, d.mode, d.size);
    try { window.scrollTo(0, y); } catch { /* 表示専用 */ }
  };
  // 材料行（準備チェックつき）: 在庫にある＝✓、足りない＝＋（買い足し）
  const ingRow = (ing, kind) => {
    const key = `${kind}:${ing.name}`;
    const row = el("div", { class: "detail-ing" + (kind === "missing" ? " is-missing" : "") });
    const cb = el("input", { type: "checkbox", class: "prep-check", "aria-label": `${ing.name}の準備チェック` });
    if (d.checked.has(key)) { cb.checked = true; row.classList.add("prep-done"); }
    cb.addEventListener("change", () => {
      if (cb.checked) d.checked.add(key); else d.checked.delete(key);
      row.classList.toggle("prep-done", cb.checked);
    });
    row.append(
      cb,
      el("span", { class: "detail-ing-mark" }, kind === "missing" ? "＋" : "✓"),
      iconEl(ing.name),
      el("span", { class: "grow" }, ing.name,
        ing.fifo ? el("span", { class: "fifo-note" }, fifoNote(ing)) : null),
      el("span", { class: "detail-ing-amt" }, `${fmtQtyValue(ing.amount, ing.unit)}${ing.unit}${kind === "missing" ? "（買い足し）" : ""}`),
    );
    return row;
  };
  const steps = detailedStepsFor(r);
  if (d.cookMode) {
    const idx = Math.min(Math.max(d.cookIndex || 0, 0), Math.max(steps.length - 1, 0));
    d.cookIndex = idx;
    const s = steps[idx] || { text: "", minutes: null };
    const isLast = idx >= steps.length - 1;
    wrap.append(
      el("button", { class: "btn secondary small", onclick: back }, "← レシピにもどる"),
      el("div", { class: "card cook-card" },
        el("h2", {}, r.title),
        el("p", { class: "cook-progress" }, `手順 ${idx+1} / ${steps.length}`),
        el("p", { class: "cook-step-text" }, s.text),
        s.minutes ? el("span", { class: "chip" }, `約${s.minutes}分`) : null,
        isLast && r.tip ? el("p", { class: "hint" }, "💡 コツ：" + r.tip) : null,
        el("div", { class: "cook-nav" },
          el("button", { class: "btn secondary", disabled: idx === 0 ? true : null, onclick: () => { if (d.cookIndex > 0) d.cookIndex -= 1; renderMain(); } }, "← もどる"),
          el("button", { class: "btn", onclick: () => { if (isLast) { exitCookMode(); toast("おつかれさまです！できあがりです"); } else { d.cookIndex += 1; renderMain(); } } }, isLast ? "完成！" : "つぎへ →"),
        ),
        el("button", { class: "btn secondary", onclick: () => exitCookMode() }, "材料・全体にもどる"),
      ),
    );
    return wrap;
  }
  wrap.append(
    el("button", { class: "btn secondary small", onclick: back }, "← レシピにもどる"),
    el("div", { class: "card recipe-detail" },
      el("div", { class: "recipe-head" },
        el("h2", { class: "grow" }, r.title),
        favStarBtn(isFav, onStar),
      ),
      el("div", { class: "recipe-chips" },
        r.minutes ? el("span", { class: "chip" }, `約${r.minutes}分`) : null,
        d.servingsLabel ? el("span", { class: "chip" }, d.servingsLabel) : null,
        r.course ? el("span", { class: "chip" }, r.course) : null,
        r.genre ? el("span", { class: "chip" }, `${r.genre}・${r.method || ""}`) : null,
        r.useUp ? el("span", { class: "chip" }, "使い切り") : null,
        r.have.some((i) => i.fifo) ? el("span", { class: "chip fifo-chip" }, "期限の近いものから使います") : null,
      ),
      el("h3", {}, "材料"),
      el("p", { class: "hint" }, "用意できたらチェックを入れていくと、準備が進みます。"),
      el("div", { class: "detail-ings" },
        r.have.map((i) => ingRow(i, "have")),
        r.missing.map((i) => ingRow(i, "missing")),
      ),
      el("h3", {}, "作り方"),
      el("div", { class: "detail-steps" },
        steps.map((s, idx) => el("div", { class: "detail-step" },
          el("span", { class: "step-num" }, String(idx + 1)),
          el("span", { class: "grow" }, s.text),
          s.minutes ? el("span", { class: "chip step-min" }, `約${s.minutes}分`) : null,
        )),
      ),
      r.tip ? el("p", { class: "hint" }, "💡 コツ：" + r.tip) : null,
      r.note ? el("p", { class: "hint region-note" }, "📍 " + (r.pref ? `【${r.pref}】` : "") + r.note) : null,
      el("div", { class: "detail-actions" },
        el("button", { class: "btn", onclick: startCook }, "▶ 調理をはじめる"),
        el("button", { class: "btn secondary", onclick: onStar },
          isFav ? "★ お気に入り保存済み（外す）" : "☆ お気に入りに保存"),
        el("button", { class: "btn secondary", onclick: () => pinToTodayMenu(r, d.mode, d.size) },
          "📌 今日の献立に入れる"),
        r.missing.length ? el("button", {
          class: "btn secondary", onclick: () => addMissingToShopping(r.missing),
        }, "足りない材料を買い物リストへ") : null,
      ),
    ),
  );
  return wrap;
}
/**
 * イベント献立セクション: 行事を選ぶと、その行事の献立セット
 * （主菜・副菜・汁物/行事食・デザート）を通常レシピと同じカードで表示する。
 * 材料は在庫と照合して「ある／買い足し」を分け、不足分はまとめて
 * 買い物リストへ追加できる。分量は家族人数で換算する。
 */
function renderEventMenuSection(size) {
  const wrap = el("div", {});
  const selectedId = state.eventMenuId || EVENT_MENUS[0].id;
  const menu = suggestEventMenu(selectedId, state.items, { servings: size });
  const head = el("div", { class: "card" },
    el("h2", {}, "🎉 イベント献立"),
    el("p", { class: "hint" }, "行事タブを選ぶと、その日の献立セットが出ます。材料は今の在庫と比べて「あるもの／買い足し」を表示し、足りないものはまとめて買い物リストに入れられます。"),
    el("div", { class: "event-grid event-tabs", role: "tablist", "aria-label": "行事を選ぶ" },
      EVENT_MENUS.map((ev) => el("button", {
        class: "event-chip" + (ev.id === selectedId ? " active" : ""),
        role: "tab",
        "aria-selected": ev.id === selectedId ? "true" : "false",
        onclick: () => { state.eventMenuId = ev.id; renderMain(); },
      }, `${ev.emoji} ${ev.name}`))),
  );
  wrap.append(head);
  if (!menu) return wrap;
  const ev = menu.event;
  wrap.append(el("div", { class: "card event-head" },
    el("h2", {}, `${ev.emoji} ${ev.name}の献立`),
    el("div", { class: "recipe-chips" },
      el("span", { class: "chip" }, ev.when),
      el("span", { class: "chip" }, `${size}人分`),
      el("span", { class: "chip" }, `全${menu.dishes.length}品・合計 約${menu.totalMinutes}分`),
      el("span", { class: "chip" }, `在庫にある材料 ${menu.haveCount}品`),
      menu.missingCount ? el("span", { class: "chip warn" }, `買い足し ${menu.missingCount}品`) : el("span", { class: "chip" }, "全部そろっています"),
    ),
    el("p", { class: "k-text" }, ev.note),
    menu.missingAll.length ? el("button", {
      class: "btn secondary", onclick: () => addMissingToShopping(menu.missingAll),
    }, "イベントの足りない材料をまとめて買い物リストへ") : null,
  ));
  for (const d of menu.dishes) {
    const fav = findFavorite(d, state.recipeMode);
    wrap.append(renderRecipeCard(d, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(d, state.recipeMode, size)),
      onOpen: () => openRecipeDetail(d, { mode: state.recipeMode, size, servingsLabel: `${size}人分` }),
      onPin: () => pinToTodayMenu(d, state.recipeMode, size),
    }));
  }
  return wrap;
}
/**
 * 郷土料理セクション: 地域タブを選ぶと、その土地の郷土料理・名物グルメの
 * 献立セットをイベント献立と同じカードで表示する。各料理には子ども向けの
 * 由来メモ（note）が付き、不足分はまとめて買い物リストへ追加できる。
 */
function renderRegionalMenuSection(size) {
  const wrap = el("div", {});
  const selectedId = state.regionId || REGIONS[0].id;
  const menu = suggestRegionalMenu(selectedId, state.items, { servings: size });
  const head = el("div", { class: "card" },
    el("h2", {}, "🗾 郷土料理・名物グルメ"),
    el("p", { class: "hint" }, "地域タブを選ぶと、その土地の名物料理の献立が出ます。材料は今の在庫と比べて「あるもの／買い足し」を表示し、足りないものはまとめて買い物リストに入れられます。料理の📍メモは、その土地ならではの由来です。"),
    el("div", { class: "event-grid event-tabs", role: "tablist", "aria-label": "地域を選ぶ" },
      REGIONS.map((r) => el("button", {
        class: "event-chip" + (r.id === selectedId ? " active" : ""),
        role: "tab",
        "aria-selected": r.id === selectedId ? "true" : "false",
        onclick: () => { state.regionId = r.id; renderMain(); },
      }, `${r.emoji} ${r.name}`))),
  );
  wrap.append(head);
  if (!menu) return wrap;
  const region = menu.region;
  wrap.append(el("div", { class: "card event-head" },
    el("h2", {}, `${region.emoji} ${region.name}の献立`),
    el("div", { class: "recipe-chips" },
      el("span", { class: "chip" }, `${size}人分`),
      el("span", { class: "chip" }, `全${menu.dishes.length}品・合計 約${menu.totalMinutes}分`),
      el("span", { class: "chip" }, `全国 ${REGIONS.reduce((s, r) => s + r.dishes.length, 0)}品・全47都道府県の名物`),
      el("span", { class: "chip" }, `在庫にある材料 ${menu.haveCount}品`),
      menu.missingCount ? el("span", { class: "chip warn" }, `買い足し ${menu.missingCount}品`) : el("span", { class: "chip" }, "全部そろっています"),
    ),
    el("p", { class: "k-text" }, region.intro),
    menu.missingAll.length ? el("button", {
      class: "btn secondary", onclick: () => addMissingToShopping(menu.missingAll),
    }, "この地域の足りない材料をまとめて買い物リストへ") : null,
  ));
  for (const d of menu.dishes) {
    const fav = findFavorite(d, state.recipeMode);
    wrap.append(renderRecipeCard(d, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(d, state.recipeMode, size)),
      onOpen: () => openRecipeDetail(d, { mode: state.recipeMode, size, servingsLabel: `${size}人分` }),
      onPin: () => pinToTodayMenu(d, state.recipeMode, size),
    }));
  }
  return wrap;
}
/**
 * 組み合わせ提案セクション: 主食材×調理法×味付けのテンプレート生成
 * （combo.js）から、手持ちの食材で作れる候補を出す。主役は大きな
 * 「🔄 別の提案を見る」更新ボタンで、押すたびに未表示の候補から
 * 新しいセットを出す（候補をひと通り見たら seed を変えて出し直す）。
 * カードは通常レシピと同じ renderRecipeCard／お気に入り保存フローを使う。
 */
function renderComboSection(size) {
  const wrap = el("div", {});
  const rep = repertoireSize();
  const seedKey = `${todayISO()}#${state.comboRound}`;
  const ask = (excludeIds) => suggestCombos(state.items, {
    servings: size, mode: state.recipeMode, limit: 6, seedKey, excludeIds,
  });
  const rawCombos = ask(state.comboSeen);
  // クイックフィルタが選ばれていれば、組み合わせ提案にも絞り込みを効かせる
  // （候補の巡回＝comboSeen の記録は、絞り込み前の候補全体で数える）。
  const combos = filterRecipes(rawCombos, state.recipeFilter);
  const shownIds = rawCombos.map((c) => c.id);
  // 直前に「別の提案を見る」が押されていたら、この描画のカードに出現アニメーションを付ける
  const enterCombo = refreshEnterSection === "combo";
  if (enterCombo) refreshEnterSection = null;
  const refresh = (e) => runRefreshWithFeedback(e.currentTarget, () => {
    const next = ask([...state.comboSeen, ...shownIds]);
    if (next.length === 0) {
      state.comboRound += 1;
      state.comboSeen = [];
      toast("組み合わせ候補をひと通り見たので、顔ぶれを変えて出し直します");
    } else {
      state.comboSeen = [...state.comboSeen, ...shownIds];
    }
    refreshEnterSection = "combo";
    renderMain();
  });
  const refreshBtn = () => el("button", { class: "btn wide refresh-btn", onclick: refresh }, "🔄 別の提案を見る");
  wrap.append(el("div", { class: "card combo-head" },
    el("h2", {}, "🧩 組み合わせ提案"),
    el("p", { class: "hint" }, `内蔵レシピ${rep.fixed}品と、主食材×調理法×味付けの組み合わせ${rep.generated}通り、あわせて全${rep.total}通りのレパートリーから、手持ちの食材で作れるものを提案します。気に入るものがなければ「別の提案を見る」で次の候補へ。`),
    enterCombo ? el("p", { class: "hint refresh-note" }, "✨ 新しい提案を表示しました") : null,
    (combos.length > 0 || state.comboSeen.length > 0 || rawCombos.length > 0) ? refreshBtn() : null,
  ));
  if (combos.length === 0) {
    wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
      state.recipeFilter !== "all" && rawCombos.length > 0
        ? "この絞り込みに合う組み合わせは、今の候補にありません。\n「別の提案を見る」で次の候補を探せます。"
        : state.comboSeen.length > 0
          ? "組み合わせ候補をひと通り見ました。\n「別の提案を見る」でもう一度、顔ぶれを変えて出せます。"
          : "今の在庫で作れる組み合わせはまだありません。\n肉・魚・野菜などを登録すると提案が増えます。")));
    return wrap;
  }
  combos.forEach((r, idx) => {
    const fav = findFavorite(r, state.recipeMode);
    const card = renderRecipeCard(r, {
      servingsLabel: `${size}人分`,
      savedNote: "組み合わせ提案",
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(r, state.recipeMode, size)),
      onOpen: () => openRecipeDetail(r, { mode: state.recipeMode, size, servingsLabel: `${size}人分` }),
      onPin: () => pinToTodayMenu(r, state.recipeMode, size),
    });
    if (enterCombo) {
      card.classList.add("card-enter");
      card.style.animationDelay = `${Math.min(idx, 7) * 60}ms`;
    }
    wrap.append(card);
  });
  wrap.append(refreshBtn());
  return wrap;
}

/**
 * 食材ピッカーの検索: 固定レシピ（ALL_RECIPES 全件を今の在庫で評価）と
 * 組み合わせ生成の両方から、「選んだ食材を1種類以上使う」レシピを集めて
 * rankRecipesByIngredients で並べる（使用数 desc → 不足数 asc）。
 * 組み合わせは (1) 在庫全体から生成した候補と、(2) 選んだ食材だけを
 * 主食材・相方にして生成した候補の合併。(2) は生成時の評価が選択食材
 * 基準になっているため、在庫全体で再評価して不足数を正しくする。
 * クイックフィルタ（レンジだけ等）もここに効かせる。
 */
function pickerSearchResults(size) {
  const selected = state.pickerSelected;
  const selectedItems = state.items.filter((i) => selected.includes(i.name));
  const fixed = ALL_RECIPES
    .map((r) => evaluateRecipe(r, state.items, size))
    .filter((r) => r.missing.length <= 5);
  const seedKey = todayISO();
  const comboByTitle = new Map();
  for (const c of suggestCombos(state.items, { servings: size, mode: "shop", limit: 400, seedKey })) {
    if (!comboByTitle.has(c.title)) comboByTitle.set(c.title, c);
  }
  for (const c of suggestCombos(selectedItems, { servings: size, mode: "shop", limit: 400, seedKey })) {
    if (!comboByTitle.has(c.title)) comboByTitle.set(c.title, evaluateRecipe(c, state.items, size));
  }
  const ranked = rankRecipesByIngredients([...fixed, ...comboByTitle.values()], selected);
  return filterRecipes(ranked, state.recipeFilter).slice(0, 30);
}

/**
 * 「食材を選んで作る」モードの本体: 在庫をキャラチップで並べ（複数選択）、
 * 選んだ食材を使うレシピを下にカード表示する。
 * チップは在庫アイテムを名前でまとめ、複数ロットは同一単位どうし合算して表示。
 * 並びは期限の近い順（使い切りたいものから選びやすく）。
 */
function renderPickerSection(size) {
  const wrap = el("div", {});
  const byName = new Map();
  for (const item of state.items) {
    const cur = byName.get(item.name);
    if (!cur) {
      byName.set(item.name, {
        name: item.name, category: item.category, unit: item.unit,
        quantity: Number(item.quantity) || 0, expiryDate: item.expiryDate || null,
      });
    } else {
      if (cur.unit === item.unit) cur.quantity = Math.round((cur.quantity + (Number(item.quantity) || 0)) * 100) / 100;
      if (item.expiryDate && (!cur.expiryDate || item.expiryDate < cur.expiryDate)) cur.expiryDate = item.expiryDate;
    }
  }
  const stockList = [...byName.values()].sort((a, b) => {
    const ea = a.expiryDate || "9999-12-31", eb = b.expiryDate || "9999-12-31";
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  });
  // 在庫から消えた名前は選択から落とす
  state.pickerSelected = state.pickerSelected.filter((n) => byName.has(n));
  let selected = state.pickerSelected;
  let pickerPresetApplied = false;
  if (!state.pickerInit) {
    state.pickerInit = true;
    if (selected.length === 0) {
      const preset = stockList.slice(0, 5).map((s) => s.name);
      if (preset.length) { state.pickerSelected = preset; selected = state.pickerSelected; pickerPresetApplied = true; }
    }
  }

  const pickerCard = el("div", { class: "card" }, el("h2", {}, "🥕 使いたい食材を選ぶ"));
  if (!stockList.length) {
    pickerCard.append(el("p", { class: "empty" },
      "在庫がまだありません。\n食材を登録すると、ここで選んでレシピを探せます。"));
    wrap.append(pickerCard);
    return wrap;
  }
  pickerCard.append(el("p", { class: "hint" }, "タップで選べます（複数OK・5つまでがおすすめ）。もう一度タップすると外れます。"));
  if (pickerPresetApplied) pickerCard.append(el("p", { class: "hint" }, "期限の近い食材を5つまで選んでおきました。タップで変えられます。"));
  pickerCard.append(el("div", { class: "picker-chips" }, stockList.map((s) => {
    const on = selected.includes(s.name);
    return el("button", {
      type: "button",
      class: "picker-chip" + (on ? " selected" : ""),
      "aria-pressed": on ? "true" : "false",
      onclick: () => {
        state.pickerSelected = on ? selected.filter((n) => n !== s.name) : [...selected, s.name];
        renderMain();
      },
    },
      iconEl(s.name, s.category),
      el("span", { class: "picker-chip-main" },
        el("span", { class: "picker-chip-name" }, (on ? "✓ " : "") + s.name),
        el("span", { class: "picker-chip-sub" }, `在庫 ${fmtQtyValue(s.quantity, s.unit)}${s.unit}`)));
  })));
  pickerCard.append(el("div", { class: "picker-summary" },
    el("span", { class: "grow" }, `選んだ食材：${selected.length}個`),
    selected.length ? el("button", {
      class: "btn secondary small", onclick: () => { state.pickerSelected = []; renderMain(); },
    }, "クリア") : null,
  ));
  wrap.append(pickerCard);

  if (!selected.length) {
    wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
      "上の食材を選ぶと、その食材で作れるレシピがここに出ます。")));
    return wrap;
  }
  const results = pickerSearchResults(size);
  if (!results.length) {
    wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
      state.recipeFilter !== "all"
        ? "選んだ食材を使うレシピはありますが、今の絞り込み（レンジだけ／おつまみ／時短）には合いませんでした。\n絞り込みを「すべて」に戻すか、食材を1つ外してみてください。"
        : "選んだ食材を使うレシピが見つかりませんでした。\n食材を1つ外してみてください。")));
    return wrap;
  }
  const allUsed = results.filter((r) => r.usedSelected === selected.length).length;
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🍳 選んだ食材のレシピ"),
    el("p", { class: "hint" },
      `${selected.join("・")} を使うレシピ ${results.length} 件です（選んだ食材を多く使う順）。`
      + (allUsed ? `うち ${allUsed} 件は選んだ食材を全部使います。` : "")),
  ));
  for (const r of results) {
    const isCombo = String(r.id).startsWith("combo-");
    const fav = findFavorite(r, "picker");
    wrap.append(renderRecipeCard(r, {
      servingsLabel: `${size}人分`,
      savedNote: isCombo ? "組み合わせ提案" : "",
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(r, "picker", size)),
      onOpen: () => openRecipeDetail(r, { mode: "picker", size, servingsLabel: `${size}人分` }),
      onPin: () => pinToTodayMenu(r, "picker", size),
    }));
  }
  return wrap;
}

function renderRecipesTab() {
  const wrap = el("div", {});
  const size = state.settings.familySize || 2;
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🍳 レシピ・献立"),
    el("div", { class: "stepper" },
      el("span", {}, "家族の人数"),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size - 1) }, "−"),
      el("span", { class: "num" }, `${size}人分`),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size + 1) }, "+"),
    ),
    el("div", { class: "tabs recipe-view-tabs", style: "margin-top:12px", role: "tablist", "aria-label": "レシピの表示を切り替える" },
      el("button", { class: state.recipeView === "suggest" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "suggest" ? "true" : "false", onclick: () => { state.recipeView = "suggest"; renderMain(); } }, "おすすめ"),
      el("button", { class: state.recipeView === "event" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "event" ? "true" : "false", onclick: () => { state.recipeView = "event"; renderMain(); } }, "🎉 イベント献立"),
      el("button", { class: state.recipeView === "region" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "region" ? "true" : "false", onclick: () => { state.recipeView = "region"; renderMain(); } }, "🗾 郷土料理"),
      el("button", { class: state.recipeView === "favorites" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "favorites" ? "true" : "false", onclick: () => { state.recipeView = "favorites"; renderMain(); } }, `★ お気に入り（${state.favRecipes.length}）`),
    ),
    state.recipeView === "suggest" ? el("div", { class: "tabs recipe-source-tabs", style: "margin-top:8px", role: "tablist", "aria-label": "レシピの探し方を切り替える" },
      el("button", { class: state.recipeSource === "omakase" ? "active" : "", role: "tab", "aria-selected": state.recipeSource === "omakase" ? "true" : "false", onclick: () => { state.recipeSource = "omakase"; renderMain(); } }, "✨ おまかせ"),
      el("button", { class: state.recipeSource === "picker" ? "active" : "", role: "tab", "aria-selected": state.recipeSource === "picker" ? "true" : "false", onclick: () => { state.recipeSource = "picker"; renderMain(); } }, "🥕 食材を選んで作る"),
    ) : null,
    state.recipeView === "suggest" && state.recipeSource === "omakase" ? el("div", { class: "tabs" },
      el("button", { class: state.recipeMode === "stock" ? "active" : "", onclick: () => { state.recipeMode = "stock"; state.suggestPage = 0; state.comboSeen = []; renderMain(); } }, "あるもので作る"),
      el("button", { class: state.recipeMode === "shop" ? "active" : "", onclick: () => { state.recipeMode = "shop"; state.suggestPage = 0; state.comboSeen = []; renderMain(); } }, "買い出しで作る"),
    ) : null,
    state.recipeView === "suggest" ? el("div", { class: "tabs recipe-filter-tabs", role: "tablist", "aria-label": "レシピを絞り込む" },
      [{ key: "all", label: "すべて" }, ...RECIPE_MOOD_FILTERS, ...RECIPE_QUICK_FILTERS.filter((f) => f.key !== "all")].map((f) => el("button", {
        class: state.recipeFilter === f.key ? "active" : "", role: "tab",
        "aria-selected": state.recipeFilter === f.key ? "true" : "false",
        onclick: () => { state.recipeFilter = f.key; state.suggestPage = 0; renderMain(); },
      }, f.label)),
    ) : null,
    state.recipeView === "suggest" && state.recipeSource === "omakase" ? el("div", { class: "tabs course-tabs", role: "tablist", "aria-label": "コースで探す" },
      el("span", { class: "filter-lead" }, "コースで探す"),
      ["主菜", "副菜", "汁物", "主食", "サラダ", "デザート"].map((c) => el("button", {
        class: state.recipeCourse === c ? "active" : "", role: "tab",
        "aria-selected": state.recipeCourse === c ? "true" : "false",
        onclick: () => { state.recipeCourse = state.recipeCourse === c ? null : c; state.suggestPage = 0; renderMain(); },
      }, c)),
    ) : null,
    el("p", { class: "hint" }, state.recipeView === "favorites"
      ? "★で保存したレシピです。材料の「ある／買い足し」は今の在庫で判定し直しています（分量は保存時の人数のまま）。★を押すと取り消せます。"
      : state.recipeView === "event"
        ? "ハロウィン・クリスマス・お正月・冬至などの行事の献立です。下の行事タブを選ぶと献立が切り替わります。分量は家族の人数に合わせてあります。"
      : state.recipeView === "region"
        ? "北海道から沖縄まで、地域の郷土料理・名物グルメの献立です。下の地域タブを選ぶと献立が切り替わります。各料理に、その土地の由来メモが付いています。"
      : state.recipeSource === "picker"
        ? "使いたい食材をタップで選ぶと、その食材を使うレシピ（固定レシピ＋組み合わせ提案）を、選んだ食材を多く使う順に探します。足りない材料は買い物リストに追加できます。"
      : state.recipeMode === "stock"
        ? "登録されている食材だけで作れるレシピです（買い足しなし）。食材は消費期限の近いもの→先に買ったものの順で使う前提で提案します。気に入ったレシピは☆で保存できます。"
        : "あと少し買い足せば作れるレシピです。足りない材料は買い物リストに追加できます。食材は消費期限の近いもの→先に買ったものの順で使う前提で提案します。気に入ったレシピは☆で保存できます。"),
  ));
  // 今日の献立ボードは、どの表示（おすすめ／イベント／郷土／お気に入り）でも
  // レシピタブの先頭に出す（今夜作るものをいつでも確認・編集できるように）
  wrap.append(renderTodayMenuBoard());
  if (state.recipeView === "favorites") {
    if (state.favRecipes.length === 0) {
      wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
        "まだお気に入りレシピがありません。\n「おすすめ」のレシピカードの☆を押すと、ここに残しておけます。")));
    }
    const FAV_COURSE_ORDER = ["主菜", "主食", "副菜", "汁物", "サラダ", "デザート", "おつまみ", "その他"];
    const favGroups = new Map(FAV_COURSE_ORDER.map((c) => [c, []]));
    for (const f of state.favRecipes) {
      const ev = reevaluateFavorite(f, size);
      const course = ev && FAV_COURSE_ORDER.includes(ev.course) ? ev.course : "その他";
      const cardRecipe = ev ? { ...f, have: ev.have, missing: ev.missing } : f;
      const savedNote = (f.mode === "shop" ? "買い出しで作る" : "あるもので作る")
        + (ev ? (ev.missing.length === 0 ? "・今の在庫で作れます" : `・買い足し${ev.missing.length}品`) : "・保存時の情報");
      favGroups.get(course).push({ f, cardRecipe, savedNote });
    }
    for (const course of FAV_COURSE_ORDER) {
      const entries = favGroups.get(course) || [];
      if (!entries.length) continue;
      wrap.append(el("h3", { class: "today-menu-group" }, course));
      for (const { f, cardRecipe, savedNote } of entries) {
        wrap.append(renderRecipeCard(cardRecipe, {
          servingsLabel: f.servings ? `保存時 ${f.servings}人分` : "",
          savedNote,
          onPin: () => pinToTodayMenu(f, f.mode, f.servings || size),
          onOpen: () => openRecipeDetail(cardRecipe, {
            mode: f.mode, size: f.servings || size,
            servingsLabel: f.servings ? `保存時 ${f.servings}人分` : "", favId: f.id,
          }),
          starBtn: favStarBtn(true, async () => {
            try {
              await store.removeFavoriteRecipe(state.user.id, state.fridge.id, f.id);
              state.favRecipes = state.favRecipes.filter((x) => x.id !== f.id);
              toast("レシピのお気に入りを外しました");
            } catch (e) { toast(userErrorMessage(e)); }
            renderMain();
          }),
        }));
      }
    }
    return wrap;
  }
  // イベント献立タブ（ハロウィン・クリスマス・お正月・冬至など）: 行事タブで献立を切り替える
  if (state.recipeView === "event") {
    wrap.append(renderEventMenuSection(size));
    return wrap;
  }
  // 郷土料理タブ（北海道〜沖縄）: 地域タブで献立を切り替える
  if (state.recipeView === "region") {
    wrap.append(renderRegionalMenuSection(size));
    return wrap;
  }
  // 食材を選んで作るモード: おまかせ提案の代わりにピッカー＋検索結果を出す
  if (state.recipeSource === "picker") {
    wrap.append(renderPickerSection(size));
    return wrap;
  }
  // おすすめ候補プール全体を取り、「別の提案を見る」でページ送りする
  // クイックフィルタ（レンジだけ／おつまみ／時短）が選ばれていれば、プール・
  // 献立セット・組み合わせ提案のすべてに絞り込みを効かせる。
  const SUGGEST_PAGE_SIZE = 8;
  const pool = suggestRecipes(state.items, { mode: state.recipeMode, servings: size, limit: 1000 });
  // クイックフィルタ有効時は、在庫マッチの候補だけを絞ると数件しか残らず
  // 「別の提案を見る」で新しい候補が出ない（例: おつまみ101品のうち手持ちで
  // 作れるのは数品）。フィルタ中は全固定レシピからプールを作り直す
  // （足りない材料6件未満まで、不足が少ない順）。「すべて」は従来どおり。
  const rankedPool = state.recipeFilter === "all" && !state.recipeCourse ? ensureCourseVariety(demoteSeenRecipes(pool, suggestDemoteIds())) : pool;
  const filteredPool = state.recipeCourse
    ? suggestFilteredCatalogue(state.items, { servings: size, filter: state.recipeFilter, course: state.recipeCourse })
    : state.recipeFilter !== "all"
    ? suggestFilteredCatalogue(state.items, { servings: size, filter: state.recipeFilter })
    : rankedPool;
  const filterLabel = ([...RECIPE_MOOD_FILTERS, ...RECIPE_QUICK_FILTERS].find((f) => f.key === state.recipeFilter) || {}).label || "";
  const pageCount = Math.max(1, Math.ceil(filteredPool.length / SUGGEST_PAGE_SIZE));
  if (state.suggestPage >= pageCount) state.suggestPage = 0;
  const recipes = filteredPool.slice(state.suggestPage * SUGGEST_PAGE_SIZE, (state.suggestPage + 1) * SUGGEST_PAGE_SIZE);
  recordSuggestShown(recipes.map((r) => r.id));
  // 献立セット（主菜＋副菜＋汁物）: 在庫だけで揃う場合だけ先頭に出す
  // コース別ブラウズ中は献立セットを出さない
  if (state.recipeMode === "stock" && !state.recipeCourse) {
    const set = suggestMealSet(state.items, { servings: size });
    if (set && set.recipes.length) {
      const setDishes = filterRecipes(set.recipes, state.recipeFilter);
      const minDishes = state.recipeFilter === "all" ? 2 : 1;
      if (setDishes.length >= minDishes) {
        const shownMinutes = state.recipeFilter === "all"
          ? set.totalMinutes
          : setDishes.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
        const setCard = el("div", { class: "card" },
          el("h2", {}, "🍽 今日の献立セット"),
          el("p", { class: "hint" }, state.recipeFilter === "all"
            ? `主菜＋副菜＋汁物の組み合わせです（合計 約${set.totalMinutes}分・${size}人分）。食材は期限の近いものから使います。`
            : `「${filterLabel}」に合う料理だけを表示しています（合計 約${shownMinutes}分・${size}人分）。`),
          setDishes.map((r) => el("div", { class: "fridge-row" },
            el("span", { class: "chip" }, r.course), el("span", { class: "grow" }, r.title),
            el("span", { class: "chip" }, `${r.genre}・${r.method}`))),
        );
        const setMissing = mergeMissingIngredients(setDishes.map((r) => r.missing));
        if (setMissing.length) setCard.append(el("button", { class: "btn secondary small", onclick: () => addMissingToShopping(setMissing) }, "セットの足りない材料を買い物リストへ"));
        wrap.append(setCard);
      }
    }
  }
  if (filteredPool.length === 0) {
    wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
      state.recipeFilter !== "all" && pool.length > 0
        ? `「${filterLabel}」に合うレシピは今の候補にありません。\n絞り込みを「すべて」に戻すと ${pool.length} 件の候補があります。`
        : state.recipeMode === "stock"
          ? "今の在庫だけで作れるレシピがまだありません。\n「買い出しで作る」も見てみてください。"
          : "提案できるレシピがありません。在庫を登録すると提案が増えます。")));
  }
  if (state.recipeCourse) {
    wrap.append(el("p", { class: "hint" },
      `「${state.recipeCourse}」のレシピ ${filteredPool.length} 件を、足りない材料が少ない順に表示しています`));
  } else if (state.recipeFilter !== "all" && filteredPool.length > 0) {
    wrap.append(el("p", { class: "hint" },
      `「${filterLabel}」のレシピ ${filteredPool.length} 件から、足りない材料が少ない順に表示しています（買い足しが必要なものもあります）。`));
  }
  if (!state.recipeCourse && filteredPool.length > 0) {
    wrap.append(el("p", { class: "hint" }, `全${ALL_RECIPES.length}品のレシピから提案中`));
  }
  // 直前に「別の提案を見る」が押されていたら、この描画のカードに出現アニメーションを付ける
  const enterSuggest = refreshEnterSection === "suggest";
  if (enterSuggest) refreshEnterSection = null;
  recipes.forEach((r, idx) => {
    const fav = findFavorite(r, state.recipeMode);
    const card = renderRecipeCard(r, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(r, state.recipeMode, size)),
      onOpen: () => openRecipeDetail(r, { mode: state.recipeMode, size, servingsLabel: `${size}人分` }),
      onPin: () => pinToTodayMenu(r, state.recipeMode, size),
    });
    if (enterSuggest) {
      card.classList.add("card-enter");
      card.style.animationDelay = `${Math.min(idx, 7) * 60}ms`;
    }
    wrap.append(card);
  });
  if (pageCount > 1) {
    wrap.append(el("button", {
      class: "btn wide refresh-btn",
      onclick: (e) => runRefreshWithFeedback(e.currentTarget, () => {
        const wrapped = state.suggestPage + 1 >= pageCount;
        state.suggestPage = (state.suggestPage + 1) % pageCount;
        refreshEnterSection = "suggest";
        renderMain();
        if (wrapped) toast("おすすめ候補をひと通り見たので、最初から出し直します");
      }),
    }, "🔄 別の提案を見る"));
    wrap.append(el("p", { class: "hint", style: "text-align:center" },
      `おすすめ候補 ${filteredPool.length} 件中 ${state.suggestPage + 1} / ${pageCount} ページ目` + (enterSuggest ? "（新しい提案を表示しました）" : "")));
  }
  // コース別ブラウズ中は組み合わせ提案を出さず、ページ送りまでで終える
  if (state.recipeCourse) return wrap;
  // 組み合わせ提案（テンプレート生成）: 通常の提案の下に出す
  wrap.append(renderComboSection(size));
  return wrap;
}
async function setFamilySize(n) {
  const size = Math.min(10, Math.max(1, n));
  state.settings = await store.updateSettings(state.user.id, state.fridge.id, { familySize: size });
  renderMain();
}

// アプリを最新に更新: SW の更新確認 → アプリの殻キャッシュだけ削除 →
// 再読み込み。キャラ画像キャッシュ（wagaya-chars-v1）は消さない。
// SW が無い環境でも、失敗しても、最後は必ず再読み込みする。
async function forceAppUpdate(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "更新を確認しています…"; }
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
      if (reg) await reg.update().catch(() => {});
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.filter(isAppShellCacheName).map((k) => caches.delete(k).catch(() => false)));
    }
  } catch { /* 更新確認に失敗しても再読み込みはする */ }
  location.reload();
}

// ---------- 共有・設定タブ ----------
function joinUrl(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", code);
  return url.toString();
}
function renderSettingsTab() {
  const wrap = el("div", {});
  const fridge = state.fridge;
  const isOwner = fridge.role === "owner" || fridge.ownerId === state.user.id;
  const size = state.settings.familySize || 2;

  // 共有（フレンドコード + QR）
  const shareCard = el("div", { class: "card" }, el("h2", {}, "🔗 冷蔵庫をシェア"));
  if (isOwner && state.inviteCode) {
    const code = state.inviteCode;
    const url = joinUrl(code);
    const canvas = el("canvas", {});
    shareCard.append(
      el("p", { class: "hint" }, "家族にこのフレンドコードを伝えるか、QRコードを読み取ってもらうと、同じ冷蔵庫に参加できます。QRコードはこの端末の中で生成しており、コードが外部に送信されることはありません。"),
      el("div", { class: "code-box" }, el("div", { class: "code-text" }, code)),
      el("div", { class: "qr-wrap" }, canvas, el("span", { class: "hint" }, "カメラで読み取ると参加コードが自動入力されます")),
      el("div", { class: "tabs" },
        el("button", {
          onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast("参加用リンクをコピーしました"); }
            catch { toast(url); }
          },
        }, "参加リンクをコピー"),
        el("button", {
          onclick: async () => {
            if (!confirm("コードを再発行すると、今のコードとQRは使えなくなります。よろしいですか？")) return;
            try {
              const newCode = await store.regenerateCode(state.user.id, fridge.id);
              // サーバー側の平文コード表示を最新化するため再取得
              state.inviteCode = (await store.getInviteCode(state.user.id, fridge.id).catch(() => null)) || formatCode(newCode);
              renderMain(); toast("新しいコードを発行しました");
            } catch (e) { toast(userErrorMessage(e)); }
          },
        }, "コードを再発行"),
      ),
    );
    requestAnimationFrame(() => { try { qrToCanvas(canvas, url, { scale: 5 }); } catch { /* 長すぎる場合はコードのみ */ } });
  } else {
    shareCard.append(el("p", { class: "hint" }, isOwner
      ? "フレンドコードを取得できませんでした。「コードを再発行」すると表示されます。"
      : "フレンドコードとQRコードは、冷蔵庫を作った人だけが表示できます。参加したい家族がいる場合は、作成者にコードを教えてもらってください。"));
    if (isOwner) {
      shareCard.append(el("button", {
        class: "btn secondary", onclick: async () => {
          try {
            const newCode = await store.regenerateCode(state.user.id, fridge.id);
            state.inviteCode = (await store.getInviteCode(state.user.id, fridge.id).catch(() => null)) || formatCode(newCode);
            renderMain(); toast("コードを発行しました");
          } catch (e) { toast(userErrorMessage(e)); }
        },
      }, "コードを発行する"));
    }
  }
  wrap.append(shareCard);

  // メンバー
  const memberCard = el("div", { class: "card" }, el("h2", {}, "👨‍👩‍👧 メンバー"));
  for (const m of state.members) {
    memberCard.append(el("div", { class: "member-row" },
      el("span", { class: "grow" }, m.displayName || "なまえ未設定", " ",
        el("span", { class: "chip" }, m.role === "owner" ? "作成者" : "メンバー"),
        m.userId === state.user.id ? el("span", { class: "chip" }, "あなた") : null),
      isOwner && m.userId !== state.user.id
        ? el("button", {
            class: "btn danger small", onclick: async () => {
              if (!confirm(`${m.displayName}さんをメンバーから外しますか？`)) return;
              try { await store.removeMember(state.user.id, fridge.id, m.userId); await refreshData(); renderMain(); toast("メンバーを外しました"); }
              catch (e) { toast(userErrorMessage(e)); }
            },
          }, "外す")
        : null,
    ));
  }
  wrap.append(memberCard);

  // 通知（この端末へのローカル通知が今すぐ使える範囲。
  // サーバー発プッシュは FCM 送信側などの公開後設定が済んでから有効になる）
  const notifyCard = el("div", { class: "card" }, el("h2", {}, "🔔 通知"));
  const perm = permissionState();
  const permLabel = perm === "unsupported" ? "このブラウザは通知に対応していません"
    : perm === "granted" ? "ON（この端末に通知します）"
    : perm === "denied" ? "ブロックされています（ブラウザの設定で許可してください）"
    : "まだOFFです";
  notifyCard.append(
    el("p", { class: "hint" }, "アプリを開いたときに、期限が近い食材があれば、この端末に通知します（1日1回まで・サーバー不要）。アプリを開いていないときの通知（サーバー発プッシュ）は、公開後の追加設定が済むと有効になります。"),
    el("p", {}, "現在の状態：", el("strong", {}, permLabel)),
  );
  if (perm === "default") {
    notifyCard.append(el("button", {
      class: "btn wide", onclick: async () => {
        try {
          const result = await Notification.requestPermission();
          if (result === "granted") {
            toast("通知をONにしました");
            await maybeSubscribePush();
            await notifyOnOpen(state.items, { expiryEnabled: expiryEnabled() }).catch(() => {});
          } else {
            toast("通知は許可されませんでした");
          }
        } catch { toast("通知の許可を取得できませんでした"); }
        renderMain();
      },
    }, "通知をONにする"));
  }
  if (perm === "granted") {
    notifyCard.append(el("button", {
      class: "btn secondary wide", onclick: async () => {
        if (!buildReminders(state.items, undefined, { expiryEnabled: expiryEnabled() }).length) {
          toast(expiryEnabled()
            ? "今は通知する内容がありません（期限3日以内の食材なし）"
            : "消費期限の管理がOFFのため、期限通知はありません");
          return;
        }
        // テスト送信: その日の「送信済み」記録を無視して1回だけ送る
        await notifyOnOpen(state.items, {
          permission: "granted",
          expiryEnabled: expiryEnabled(),
          storage: { getItem: () => null, setItem: () => {} },
        }).catch(() => {});
        toast("テスト通知を送りました");
      },
    }, "テスト通知を送る"));
  }
  wrap.append(notifyCard);

  // 困ったとき・ルール
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "❓ ヘルプ・ルール"),
    el("button", {
      class: "btn secondary wide", onclick: () => { state.showGuide = true; renderMain(); try { window.scrollTo(0, 0); } catch { /* noop */ } },
    }, "はじめてガイドを見る"),
    el("button", {
      class: "btn secondary wide", style: "margin-top:8px", onclick: () => { state.legalView = "privacy"; renderMain(); },
    }, "プライバシーポリシー"),
    el("button", {
      class: "btn secondary wide", style: "margin-top:8px", onclick: () => { state.legalView = "terms"; renderMain(); },
    }, "利用規約"),
  ));

  // ゴミ箱（削除した食材の復元）
  const trashCard = el("div", { class: "card" }, el("h2", {}, "🗑 ゴミ箱（削除した食材）"));
  const trashList = store.mode === "demo" ? (state.trash || []) : state.sessionTrash;
  if (!trashList.length) {
    trashCard.append(el("p", { class: "hint" }, store.mode === "demo"
      ? "ゴミ箱は空です。在庫で食材を削除すると、ここに入って元に戻せます。"
      : "この画面を開いている間に削除した食材がここに残り、元に戻せます。"));
  }
  for (const t of trashList) {
    trashCard.append(el("div", { class: "fridge-row" },
      el("span", { class: "grow" }, t.name, " ", el("span", { class: "chip" }, `${fmtQtyValue(t.quantity, t.unit)}${t.unit || ""}`)),
      el("button", {
        class: "btn small", onclick: async () => {
          try {
            await store.restoreDeletedItem(state.user.id, fridge.id, t);
            state.sessionTrash = state.sessionTrash.filter((x) => x.id !== t.id);
            await refreshData(); renderMain(); toast(`「${t.name}」を元に戻しました`);
          } catch (e) { toast(userErrorMessage(e)); }
        },
      }, "元に戻す"),
    ));
  }
  wrap.append(trashCard);

  // アプリの更新（端末側に古いアプリ本体が残っているときの手動リフレッシュ）
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🔄 アプリの更新"),
    el("p", { class: "hint" }, "新しい機能が届かない・表示が古いままのときに押してください。最新のアプリを取り直して読み込み直します（食材キャラの画像は手元に残るので、次回も速く表示されます）。"),
    el("button", {
      class: "btn secondary wide", onclick: (e) => forceAppUpdate(e.currentTarget),
    }, "アプリを最新に更新する"),
  ));

  // 設定
  // 冷蔵庫の名前変更は作成者だけ（本番ルールでも fridges の更新は作成者のみ許可）
  const fridgeNameInput = isOwner ? el("input", {
    type: "text", class: "grow", value: fridge.name, maxlength: String(FRIDGE_NAME_MAX), "aria-label": "新しい冷蔵庫の名前",
  }) : null;
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "⚙️ 設定"),
    el("div", { class: "fridge-row" }, el("span", { class: "grow" }, "冷蔵庫の名前"), el("strong", {}, fridge.name)),
    isOwner ? el("div", { class: "fridge-row" },
      fridgeNameInput,
      el("button", {
        class: "btn secondary small", onclick: async () => {
          try {
            const res = await store.renameFridge(state.user.id, fridge.id, fridgeNameInput.value);
            state.fridge = { ...state.fridge, name: res.name };
            const entry = state.fridges.find((f) => f.id === fridge.id);
            if (entry) entry.name = res.name;
            renderMain(); toast("冷蔵庫の名前を変更しました");
          } catch (e) { toast(userErrorMessage(e)); }
        },
      }, "名前を変更する")) : null,
    el("div", { class: "stepper" },
      el("span", {}, "家族の人数（レシピの分量）"),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size - 1) }, "−"),
      el("span", { class: "num" }, `${size}人分`),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size + 1) }, "+"),
    ),
    // 消費期限の管理 ON/OFF（設定レコードの expiryEnabled。OFF でも期限データは消さない）
    el("div", { class: "fridge-row expiry-toggle-row" },
      el("span", { class: "grow" },
        el("span", {}, "消費期限の管理"),
        el("span", { class: "hint", style: "display:block" }, expiryEnabled()
          ? "ON：期限の入力・表示・お知らせ・通知を使います"
          : "OFF：期限の入力・表示・お知らせ・通知を止めます（保存済みの期限は消えません）")),
      el("button", {
        class: "btn small " + (expiryEnabled() ? "" : "secondary"),
        "aria-pressed": expiryEnabled() ? "true" : "false",
        onclick: async () => {
          const next = !expiryEnabled();
          try {
            state.settings = await store.updateSettings(state.user.id, fridge.id, { expiryEnabled: next });
            renderMain();
            toast(next ? "消費期限の管理をONにしました" : "消費期限の管理をOFFにしました");
          } catch (e) { toast(userErrorMessage(e)); }
        },
      }, expiryEnabled() ? "ON" : "OFF"),
    ),
    el("button", { class: "btn secondary wide", onclick: () => { stopRealtime(); state.fridge = null; renderFridgePicker(); } }, "別の冷蔵庫に切り替える"),
    !isOwner ? el("button", {
      class: "btn danger wide", onclick: async () => {
        if (!confirm("この冷蔵庫から退出しますか？")) return;
        try { await store.leaveFridge(state.user.id, fridge.id); stopRealtime(); state.fridges = await store.listMyFridges(state.user.id); state.fridge = null; renderFridgePicker(); }
        catch (e) { toast(userErrorMessage(e)); }
      },
    }, "この冷蔵庫から退出する") : null,
    el("button", {
      class: "btn ghost wide", onclick: async () => {
        stopRealtime();
        await store.signOut(); state.user = null; state.fridge = null; renderAuth();
      },
    }, "ログアウト"),
    isOwner && !state.confirmDeleteFridge ? el("button", {
      class: "btn danger wide", onclick: () => {
        if (!confirm(`「${fridge.name}」を削除しますか？\nこの冷蔵庫の在庫・買い物リスト・食材図鑑の記録はすべて削除され、メンバー全員がアクセスできなくなります。\nあなたが登録した、この冷蔵庫のレシピのお気に入りも削除されます。`)) return;
        state.confirmDeleteFridge = true; renderMain();
      },
    }, "この冷蔵庫を削除する") : null,
    isOwner && state.confirmDeleteFridge ? el("div", { class: "danger-confirm" },
      el("p", {}, `「${fridge.name}」を本当に削除します。メンバー ${state.members.length} 人全員がアクセスできなくなり、在庫 ${state.items.length} 件・買い物リスト ${state.shopping.length} 件・図鑑の記録がすべて消えます。この操作は取り消せません。`),
      el("button", {
        class: "btn danger wide", onclick: async () => {
          const fid = fridge.id;
          try {
            stopRealtime();
            await store.deleteFridge(state.user.id, fid);
            state.confirmDeleteFridge = false;
            state.fridges = state.fridges.filter((f) => f.id !== fid);
            try { state.fridges = await store.listMyFridges(state.user.id); } catch { /* 一覧の再取得に失敗しても、ローカルで除外済み */ }
            state.fridge = null;
            state.items = []; state.shopping = []; state.members = []; state.favRecipes = []; state.catalog = [];
            state.inviteCode = null; state.sessionTrash = [];
            state.todayMenu = { date: "", entries: [] }; state.todayMenuThanks = false;
            renderFridgePicker(); toast("冷蔵庫を削除しました");
          } catch (e) {
            state.confirmDeleteFridge = false;
            setupRealtime(); renderMain(); toast(userErrorMessage(e));
          }
        },
      }, "削除する"),
      el("button", {
        class: "btn ghost wide", style: "margin-top:8px", onclick: () => { state.confirmDeleteFridge = false; renderMain(); },
      }, "やめる"),
    ) : null,
    el("button", {
      class: "btn danger wide", onclick: async () => {
        if (!confirm("退会すると、アカウントとあなたのレシピのお気に入りが削除されます。\n共有している冷蔵庫の在庫・買い物リストは家族のものとして残ります。\nあなたが作った冷蔵庫は、他のメンバーがいれば一番古くからのメンバーに引き継がれ、メンバーがあなただけなら冷蔵庫ごと削除されます。\n本当に退会しますか？")) return;
        if (!confirm("この操作は取り消せません。退会しますか？")) return;
        try {
          stopRealtime();
          await store.deleteAccount(state.user.id);
          state.user = null; state.fridge = null; state.fridges = [];
          state.items = []; state.shopping = []; state.members = []; state.favRecipes = []; state.catalog = [];
          state.todayMenu = { date: "", entries: [] }; state.todayMenuThanks = false;
          renderAuth(); toast("退会しました");
        } catch (e) { toast(userErrorMessage(e)); }
      },
    }, "退会する（アカウントを削除）"),
    el("p", { class: "hint" }, store.mode === "demo"
      ? "デモモード：データはこの端末の中だけです。別の端末の家族とは共有されません（本番公開時に Firebase と接続します）。"
      : "データはメンバーだけがアクセスできます（Firestore のセキュリティルールで保護）。退会は上の「退会する」からできます。共有の冷蔵庫の在庫は家族のものとして残ります。"),
  ));
  return wrap;
}

// ---------- ホーム画面に追加の案内（iPhone Safari・未インストール時のみ） ----------
// ホーム画面（スタンドアロン）で起動した場合は出さない。閉じたら端末に記録して再表示しない。
const INSTALL_HINT_KEY = "wagaya.installHintDismissed";
function shouldShowInstallHint() {
  try {
    const ua = navigator.userAgent || "";
    if (!/iPhone/.test(ua)) return false;
    const standalone = window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    if (standalone) return false;
    return localStorage.getItem(INSTALL_HINT_KEY) !== "1";
  } catch { return false; }
}
function maybeShowInstallHint() {
  if (!shouldShowInstallHint()) return;
  const banner = el("div", { class: "install-banner" },
    el("span", { class: "grow" }, "ホーム画面に追加すると、アプリのように使えます（共有ボタン →「ホーム画面に追加」）"),
    el("button", {
      class: "install-close", "aria-label": "案内を閉じる", onclick: () => {
        try { localStorage.setItem(INSTALL_HINT_KEY, "1"); } catch { /* 保存できなくても閉じる */ }
        banner.remove();
      },
    }, "✕"),
  );
  const anchor = document.getElementById("join-banner");
  if (anchor) anchor.after(banner);
  else document.body.prepend(banner);
}

// ================= 起動 =================
captureJoinParam();
maybeShowInstallHint();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* file:// 等では無効でよい */ });
}
renderLoadingView();
initStore()
  .then(async () => {
    updateOfflineUI();
    state.user = await store.currentUser();
    if (state.user) await afterLogin();
    else renderAuth();
  })
  .catch((e) => {
    captureLeavingLoadingView();
    stopLoadingView();
    appRoot.replaceChildren(el("div", { class: "card" }, el("div", { class: "error" }, "読み込みに失敗しました: " + userErrorMessage(e))));
    releaseLeavingLoadingView();
  });
