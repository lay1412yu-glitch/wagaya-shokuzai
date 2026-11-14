// sw.js — PWA 用 Service Worker
// 方針: アプリの殻（HTML/CSS/JS）はキャッシュして高速・オフライン表示に対応。
// Firebase への通信は常にネットワーク（キャッシュしない）ことで、
// 在庫データが古いまま固定される事故を防ぐ。
// 例外: Firebase SDK 本体（gstatic のバージョニング済みファイル）は不変
// なので cache-first で貯める。これが無いと圏外では SDK 自体を読み込めず、
// 殻＋Firestore 永続キャッシュによるオフライン起動が成立しない。
const CACHE = "wagaya-shokuzai-v47";
// ミュゼ版キャラ画像（img/chars/*.webp・200枚超）は SHELL に入れず、
// 初回表示時にここへ貯めるランタイムキャッシュにする（cache-first）。
// アプリ本体の版数が上がってもキャラキャッシュは消さない。
// 例外: v46 ではキャラ画像の白背景を透過化したため、旧キャッシュを
// 破棄させる目的で CHAR_CACHE を v2 に上げた（activate で v1 は削除される）。
const CHAR_CACHE = "wagaya-chars-v2";
// Firebase SDK（firebasejs/10.12.5 配下）のランタイムキャッシュ。
// バージョン固定 URL で内容は不変。殻キャッシュとは別名にし、「アプリを
// 最新に更新する」（殻だけ削除）の対象にもしない。
const SDK_CACHE = "wagaya-sdk-v1";
const SHELL = [
  "./", "./index.html", "./styles.css", "./config.js", "./manifest.webmanifest", "./icon.svg",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png", "./favicon.ico",
  "./js/app.js", "./js/util.js", "./js/recipes.js", "./js/levels.js", "./js/knowledge.js", "./js/demo-store.js", "./js/supabase-store.js", "./js/firebase-store.js", "./js/firebase-model.js", "./js/qrcode.js", "./js/icons.js", "./js/chars.js",
  "./js/guide.js", "./js/legal.js", "./js/notify.js", "./js/game.js", "./js/suika.js", "./js/combo.js", "./js/loading.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CHAR_CACHE && k !== SDK_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firebase SDK 本体は不変ファイルなので cache-first（初回だけ取得して貯める）。
  // 圏外でも SDK が読めることが、オフライン起動の前提になる。
  if (url.origin === "https://www.gstatic.com" && url.pathname.includes("/firebasejs/")) {
    e.respondWith(
      caches.open(SDK_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // 外部（Firebase等）は素通し
  // キャラ画像は不変ファイルなので cache-first（初回だけ取得して貯める）。
  if (url.pathname.includes("/img/chars/")) {
    e.respondWith(
      caches.open(CHAR_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }
  // ネットワーク優先（オンライン時は常に最新を取得し、キャッシュを更新。
  // オフライン時だけキャッシュにフォールバックする）。
  // キャッシュ優先だとコード修正が端末に届くまで時間がかかる事故があったため。
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ---- FCM（Firebase Cloud Messaging）のバックグラウンド受信 ----
// config.js の Firebase 設定が入っているときだけ初期化する（デモモードでは無効）。
// 注意: 送信側（Cloud Functions 等）が用意できなければメッセージは届かない。
// config.js は globalThis.WAGAYA_CONFIG を使うため Service Worker でも読める。
try {
  importScripts("./config.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
  const fc = (self.WAGAYA_CONFIG || {}).FIREBASE || {};
  if (fc.apiKey && typeof firebase !== "undefined") {
    firebase.initializeApp(fc);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      const data = payload.data || {};
      self.registration.showNotification(n.title || "わが家の食材手帳", {
        body: n.body || data.body || "期限が近い食材があります。アプリで確認してください。",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        data: { url: data.url || "./" },
      });
    });
  }
} catch { /* デモモード・未設定では FCM を初期化しない */ }

// ---- Web Push（サーバー発通知）の受け口 ----
// 旧 Supabase 方式（ロールバック時）の Web Push もこのハンドラで表示できる。
// ペイロード形式: JSON { title, body, url }
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : "" }; }
  const title = data.title || "わが家の食材手帳";
  const options = {
    body: data.body || "期限が近い食材があります。アプリで確認してください。",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: data.url || "./" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(target).catch(() => {}); return client.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
