# Wamily Guide - Claude Code 設定

## 最初に必ず読むファイル
WAMILY_DESIGN_SPEC.md（ルート直下・最新版）を読んでから作業を開始してください。
docs/archive/ の古い版は無視してください。

## プロジェクト概要
子連れ家族向け海外旅行ガイドブックサイト。
コンセプト：「本棚のある、黒板がある、常連が集まる居酒屋」

## 技術スタック
- HTML / CSS / JavaScript（シンプルな構成）
- GitHub Pages でホスティング
- Notion API でコンテンツ管理（稼働中）
- Claude API（claude-haiku-4-5）でコンテンツ自動生成
- Google Maps JavaScript API（スポット地図埋め込み）
- Google Places API（営業状況自動チェック）
- Google My Maps（共同編集スポット管理）

## 作業ルール
- カラーパレット・言葉のトーンはWAMILY_DESIGN_SPEC.mdに従う
- 新機能追加前に設計書のフェーズを確認する
- 作業前にgit commitで現状を保存する
- 過去の作業記録は `docs/work-log.md` を参照

---

## 自動化パイプライン

### 全体フロー
```
【入力口】
  Google My Maps ← みんなでピン追加（共同編集）
  Notion DB     ← スポット・フィード・キュレーション管理

【毎日 09:00 JST 自動実行（GitHub Actions）】
  ① Claude API → Notion コンテンツ生成（週1・月曜）
  ② Notion → data/*.json 同期（毎日）
  ③ Google My Maps → 新規スポット取得（毎日）
  ④ Google Places → 営業状況チェック（週1・月曜）
  ⑤ TimeOut RSS → ロンドンイベント更新（毎日）
  ⑥ commit & push → GitHub Pages に反映

【表示】
  GitHub Pages ← 全10カ国ページ + Google Maps 埋め込み地図
```

### GitHub Actions ワークフロー
| ワークフロー | スケジュール | 内容 |
|---|---|---|
| sync.yml | 毎日 09:00 JST | コンテンツ同期（5ステップ）+ ヘルスチェック |
| newsletter.yml | 毎週月曜 7:00 JST | 週刊キュレーションメール配信 |
| newsletter-announce.yml | 毎日 8:00 JST | お知らせメール配信（予定日チェック） |
| newsletter-sequence.yml | 毎日 7:30 JST | シーケンスメール（ウェルカムメールのフォールバック） |

### sync.yml ステップ
| # | スクリプト | 内容 | 頻度 |
|---|---|---|---|
| 1 | generate-guide.js | Claude → Notion にフィード・キュレーション自動生成 | 週1（月曜） |
| 2 | fetch-notion.js | Notion → data/*.json に同期 | 毎日 |
| 3 | fetch-mymaps.js | Google My Maps → 新規スポット取得 | 毎日 |
| 4 | fetch-events.js | 全10カ国イベント取得（London:RSS / 他:Claude生成） | 毎日 |
| 5 | check-spots.js | Google Places → スポット営業状況更新（全10カ国） + 閉業Notion自動更新 | 週1（月曜） |
| 6 | health-check.js | 全データファイル健全性検証 + Slack日次/週次レポート | 毎日（always） |

### Notion DB 構成
| DB名 | ID | 用途 |
|---|---|---|
| 最近の動きDB | NOTION_LIVEFEED_DB_ID（GitHub Secrets） | フィード投稿管理 |
| スポットDB | 61864001-cf96-4afb-b7f2-94b07cd445a1 | 全10カ国スポット管理 |
| キュレーションDB | 4f146e35-f680-46e1-acf2-8e4cc86851fb | YouTube/Instagram/ブログ管理 |
| メルマガ購読者DB | 4cb8342e-d95d-44bb-894d-0b882eba6e99 | 購読者管理 |
| メルマガお知らせDB | 8735e684-62ce-47b1-8fb4-fd99e9a0725e | お知らせ管理 |
| 旅のバトンDB | 0d873caad48d4cf7aa841312ee9d5a3b | バトン投稿管理 |

### Google Cloud Console（プロジェクト: sawady-twitter）
| APIキー名 | 用途 | 制限 |
|---|---|---|
| Wamily-Places | サーバー側：営業状況チェック（check-spots.js） | Places API / 制限なし |
| Wamily-Maps-Frontend | ブラウザ側：地図埋め込み表示 | Maps JS API + Places API / dawayuki01.github.io/* |

### Google My Maps
| 項目 | 値 |
|---|---|
| マップ名 | Wamily Spots |
| Map ID | 1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM |
| KML URL | https://www.google.com/maps/d/kml?mid=1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM&forcekml=1 |

フォルダ構成：国ごとに10フォルダ。新しいフォルダを追加する場合は fetch-mymaps.js の `FOLDER_TO_SLUG` に追加する。

### GitHub Secrets
| シークレット名 | 用途 |
|---|---|
| ANTHROPIC_API_KEY | Claude API（コンテンツ生成） |
| GOOGLE_PLACES_API_KEY | Google Places API（営業チェック） |
| NOTION_API_KEY | Notion API（DB読み書き） |
| NOTION_CURATION_DB_ID | キュレーションDB ID |
| NOTION_LIVEFEED_DB_ID | 最近の動きDB ID |
| NOTION_SPOTS_DB_ID | スポットDB ID |
| RESEND_API_KEY | Resend メール送信 |
| NEWSLETTER_SUBSCRIBERS_DB_ID | Notion メルマガ購読者DB ID |
| NEWSLETTER_GAS_URL | GAS メルマガ登録・配信停止エンドポイント |
| NEWSLETTER_TEST_EMAIL | テスト送信先メールアドレス |
| SLACK_WEBHOOK_PATROL | パトロール部 Slack通知 |
| SLACK_WEBHOOK_CONTENT | コンテンツ部 Slack通知 |
| SLACK_WEBHOOK_NEWSLETTER | メルマガ部 Slack通知 |

### GAS プロジェクト一覧
| プロジェクト名 | アカウント | 用途 |
|---|---|---|
| Wamily お問い合わせ自動返信 | pr@tomoyukisawada.com | Google Form 自動返信 |
| Wamily 旅のバトン | pr@tomoyukisawada.com | バトンフォーム → Notion |
| Wamily メルマガ | pr@tomoyukisawada.com | 登録・配信停止 → Notion |

---

## サイト構成

### 対応国（10カ国）
ロンドン / 台湾 / パリ / ストックホルム / シンガポール / バンコク / マニラ / LA / ハワイ / ソウル

### 各国ページ（/{slug}/index.html）
- `<body data-country="{slug}">` で国を識別
- `window.WAMILY_BASE = '../'` でパス解決
- タブ構成：① その国について ② 行く前に ③ 現地で楽しむ ④ 旅のバトン
- スポット：data/spots-{slug}.json から動的読み込み（5件ずつページ切替表示）
- キュレーション：data/curation-{slug}.json から動的読み込み
- Google Maps 埋め込み地図：スポットをピンで表示（id="spots-map"）
- 「最近の動き」セクション（id="feed-list"）：各国の投稿のみ最大5件表示

### data/*.json ファイル一覧
| ファイル | 生成元 | 内容 |
|---|---|---|
| live-feed.json | Notion最近の動きDB | 全国フィード（10件） |
| spots-{slug}.json | Notion + My Maps | 各国スポット（lat/lng/placeId付き） |
| curation-{slug}.json | NotionキュレーションDB | 各国おすすめコンテンツ |
| events-{slug}.json | TimeOut RSS(London) + Claude AI(他9カ国) | 各国イベント・季節アクティビティ |
| newsletter-history.json | 週刊メルマガ | 配信済み記事URL履歴（重複防止） |

### JS ファイル構成
| ファイル | 役割 |
|---|---|
| js/main.js | タブ切替・アコーディオン・フィルター |
| js/data-loader.js | data/*.json を fetch して DOM 更新 |
| js/spots-map.js | Google Maps 初期化・マーカー配置 |
| js/maps-config.js | Maps JavaScript API キー設定 |

### fetch-notion.js のデータ引き継ぎ
Notion sync時に以下のフィールドは既存JSONファイルから引き継がれる：
- `status` / `statusLabel` / `checkedDate`（Google Places更新分を保持）
- `placeId`（Notionにない場合は既存値を保持）
- `lat` / `lng`（座標は手動管理）

---

## 運用ルール

### カテゴリルール（スポット）
| カテゴリ | 対象 |
|---|---|
| 親子で食べる | レストラン・カフェ・ベーカリー |
| 遊びに行く | 観光名所・博物館・公園・テーマパーク・百貨店・ショッピングモール |
| 現地の日常へ | 市場・商店街・コンセプトストア・散歩スポット・スーパー |
| いざという時 | 病院・大使館 |

### キュレーション運用
- Notion ステータス管理：候補🟡 / 公開🟢 / 非公開⚫
- `fetch-notion.js` は「公開」ステータスのみサイトに反映
- 半年に1回程度 Claude が見直し・入れ替え候補を提案
- 自動生成は月1回程度（sync.yml で制御）

### メルマガ運用
- 詳細仕様書: `docs/newsletter-spec.md`
- 週刊キュレーション: 毎週月曜 7:00 JST 自動配信
- お知らせ: Notion で書く → テスト → 配信予定日に自動配信
- ウェルカムメール: 登録直後にGAS内からResend API経由で即時送信（`docs/gas-newsletter.js` 参照）

---

## ロードマップ（公開に向けて）

| # | タスク | ステータス |
|---|---|---|
| 1 | トップページデザイン | ✅ 完了 |
| 2 | 全ページ動作確認 | ✅ 完了 |
| 3 | Google マップリッチ化 | ✅ 一部完了（残: お気に入りリスト277件の海外スポット） |
| 4 | キュレーションリッチ化 | ✅ 完了 |
| 5 | メルマガ（Wamily Letter） | ✅ 完了 |
| 6 | Wamily AI チーム組成 | ✅ Phase 1 実装完了（パトロール部・コンテンツ部・メルマガ部稼働中） |
| 7 | サイト公開 | 上記完了後 |

### スポット表示UIの改善 — ページ切り替え式に変更

- 各レイヤー（いざという時 / 現地の日常へ / 遊びに行く）で **5件ずつ表示**
- 「1–5 / 17件」カウンター + 「次の5件 →」「← 前の5件」ボタンで入れ替え表示
- 蛇腹にならないページ切り替え式（キュレーションと同じUIパターン）
- フィルター選択時も5件ずつページ切り替え対応
- 変更ファイル: `js/data-loader.js` / `js/main.js` / `css/style.css`

### 全9カ国に「知ってたら楽しい言葉」フレーズセクションを追加

ロンドンのみ存在していた言葉セクションを全10カ国統一構成に：

| 国 | 言語 | タイトル |
|---|---|---|
| ロンドン | 英語 | 🗣️ 知ってたら楽しい英語フレーズ（既存） |
| 台北 | 中国語（繁体字） | 🗣️ 知ってたら楽しい中国語フレーズ |
| パリ | フランス語 | 🗣️ 知ってたら楽しいフランス語フレーズ |
| ストックホルム | スウェーデン語 | 🗣️ 知ってたら楽しいスウェーデン語フレーズ |
| シンガポール | 英語（シングリッシュ） | 🗣️ 知ってたら楽しい英語フレーズ |
| バンコク | タイ語 | 🗣️ 知ってたら楽しいタイ語フレーズ |
| マニラ | フィリピン語（タガログ語） | 🗣️ 知ってたら楽しいフィリピン語フレーズ |
| LA | 英語（アメリカ英語） | 🗣️ 知ってたら楽しい英語フレーズ |
| ハワイ | 英語（+ハワイ語） | 🗣️ 知ってたら楽しい英語フレーズ |
| ソウル | 韓国語 | 🗣️ 知ってたら楽しい韓国語フレーズ |

各国4カテゴリ構成：😊 基本のひと言 / 👶 子連れならでは / 🏥 いざというとき / 🚇 交通・移動
非ラテン文字（タイ語・韓国語・中国語）はカタカナ読みを併記。

---

## 重要なURL

| 場所 | URL |
|---|---|
| サイト本番 | https://dawayuki01.github.io/Wamily-Guide/ |
| GitHubリポジトリ | https://github.com/dawayuki01/Wamily-Guide |
| GitHub Actions（sync） | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/sync.yml |
| GitHub Actions（週刊メルマガ） | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/newsletter.yml |
| GitHub Actions（お知らせ） | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/newsletter-announce.yml |
| Google My Maps | https://www.google.com/maps/d/edit?mid=1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM |
| Google Cloud Console | https://console.cloud.google.com/apis/credentials?project=sawady-twitter |
| NotionスポットDB | https://notion.so/61864001cf964afbb7f294b07cd445a1 |
| NotionキュレーションDB | https://notion.so/4f146e35f68046e1acf28e4cc86851fb |
| Notionメルマガ購読者DB | https://notion.so/4cb8342ed95d44bb894d0b882eba6e99 |
| Notionメルマガお知らせDB | https://notion.so/8735e68462ce47b18fb4fd99e9a0725e |
| Notion Integration設定 | https://www.notion.so/profile/integrations |
