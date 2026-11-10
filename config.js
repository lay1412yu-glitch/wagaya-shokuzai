// config.js — Firebase 接続設定（本番モード用）
//
// ここに Firebase プロジェクトの Web 設定を入れると本番モードで動き、
// 空のままだと「デモモード（この端末内だけ）」で動きます。
// 設定値の場所: Firebase コンソール → プロジェクトの設定 → 全般 →
// 「マイアプリ」の Web アプリ（</>）→ firebaseConfig。
//
// セキュリティ注意:
// - ここに書くのは Web 公開設定（apiKey 等）のみです。apiKey は秘密鍵では
//   ありません（アクセス制御は Firestore / Storage のセキュリティルールが担う）。
// - サービスアカウント等の管理者用秘密鍵は絶対に書かないでください。
// - ロールバック用に旧 Supabase 設定（SUPABASE_URL / SUPABASE_ANON_KEY）が
//   両方入っている場合のみ、旧バックエンドで動きます（Firebase 設定が優先）。
globalThis.WAGAYA_CONFIG = {
  FIREBASE: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },
  // サーバー発プッシュ（FCM）用の Web Push 証明書キー（VAPID 公開鍵）。
  // Firebase コンソール → プロジェクトの設定 → Cloud Messaging で発行する。
  // 未設定（空）の間は FCM トークン登録を開始しません。送信側には別途
  // Cloud Functions（Blaze プラン）等が必要です（README 参照）。
  FCM_VAPID_KEY: "",
};
