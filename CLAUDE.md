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

---

## 構築済みの自動化パイプライン（2026年3月〜4月）

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

### GitHub Actions（.github/workflows/sync.yml）
| ステップ | スクリプト | 内容 | 頻度 |
|---|---|---|---|
| 1 | generate-guide.js | Claude → Notion にフィード・キュレーション自動生成 | 週1（月曜） |
| 2 | fetch-notion.js | Notion → data/*.json に同期 | 毎日 |
| 3 | fetch-mymaps.js | Google My Maps → 新規スポット取得 | 毎日 |
| 4 | fetch-events.js | 全10カ国イベント取得（London:RSS / 他:Claude生成） | 毎日 |
| 5 | check-spots.js | Google Places → スポット営業状況更新（全10カ国対応） | 週1（月曜） |

### Notion DB 構成
| DB名 | ID | 用途 |
|---|---|---|
| 最近の動きDB | NOTION_LIVEFEED_DB_ID（GitHub Secrets） | フィード投稿管理 |
| スポットDB | 61864001-cf96-4afb-b7f2-94b07cd445a1 | 全10カ国スポット管理 |
| キュレーションDB | 4f146e35-f680-46e1-acf2-8e4cc86851fb | YouTube/Instagram/ブログ管理 |

各DBに10カ国のビュー（フィルター）を設定済み。

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
| 共有設定 | リンクを知っている人なら誰でも表示できる |

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

### 対応国（10カ国）
ロンドン / 台湾 / パリ / ストックホルム / シンガポール / バンコク / マニラ / LA / ハワイ / ソウル

### 各国ページ（/{slug}/index.html）
- `<body data-country="{slug}">` で国を識別
- `window.WAMILY_BASE = '../'` でパス解決
- タブ構成：① その国について ② 行く前に ③ 現地で楽しむ ④ 旅のバトン
- 「最近の動き」セクション（id="feed-list"）：各国の投稿のみ最大5件表示
- スポット：data/spots-{slug}.json から動的読み込み
- **Google Maps 埋め込み地図**：スポットをピンで表示（id="spots-map"）
- キュレーション：data/curation-{slug}.json から動的読み込み

### data/*.json ファイル一覧
| ファイル | 生成元 | 内容 |
|---|---|---|
| live-feed.json | Notion最近の動きDB | 全国フィード（10件） |
| spots-{slug}.json | Notion + My Maps | 各国スポット（lat/lng/placeId付き） |
| curation-{slug}.json | NotionキュレーションDB | 各国おすすめコンテンツ |
| events-{slug}.json | TimeOut RSS(London) + Claude AI(他9カ国) | 各国イベント・季節アクティビティ |

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

## 2026年4月1日の作業記録

### 完了した作業
1. **check-spots.js を全10カ国対応に拡張**
   - ロンドンのみ → 全 spots-*.json を処理するよう変更
   - 主要15スポットに placeId を追加

2. **Google Places API セットアップ**
   - Google Cloud Console で Places API 有効化
   - Wamily-Places キーを作成・GitHub Secrets に登録
   - 毎週月曜の自動チェックが稼働開始

3. **全10カ国ページに Google Maps 埋め込み**
   - js/spots-map.js 新規作成（座標ベース・PlacesService不要）
   - 全100スポットに lat/lng 座標を追加
   - カテゴリ別カラーマーカー（赤:vital / 橙:local / 緑:play）
   - ピンクリック → InfoWindow → Googleマップで開く
   - Wamily-Maps-Frontend キー作成（HTTPリファラー制限）
   - fetch-notion.js に座標引き継ぎロジック追加

4. **Google My Maps「Wamily Spots」作成**
   - 全100スポットを KML でインポート
   - 10カ国フォルダ構成・共有設定完了

5. **My Maps → サイト自動同期**
   - scripts/fetch-mymaps.js 新規作成
   - KML取得 → パース → 新規スポットのみ追加
   - 絵文字・ZWJ対応の名前正規化で重複検知
   - GitHub Actions に組み込み（毎日実行）

6. **キッザニア・バンコク閉業を反映**
   - 2021年閉業 → status: "closed" に更新

7. **フィルター連動（地図 ↔ カード）**
   - フィルターボタン（すべて/親子で食べる/遊びに行く等）で地図ピンとカードが連動
   - main.js のフィルターを動的DOM対応に修正（data-loader.jsの動的生成に対応）

8. **スポットカードクリック → 地図ピンフォーカス**
   - カードクリックで地図がそのピンにパン＆ズーム（15）
   - InfoWindow自動表示 + 地図位置への自動スクロール

9. **全10カ国にイベント情報を追加**
   - fetch-events.js を全10カ国対応に拡張
   - ロンドン: TimeOut RSS + Claude フィルタリング（従来通り）
   - 他9カ国: Claude API で季節のイベント・アクティビティを自動生成
   - イベントカードに「🔗 詳細を見る」ソースリンクを追加
   - data-loader.js の loadEvents() を国別対応に修正
   - 全9カ国ページにイベントセクションHTML追加

### 技術的な解決事項
- **PlacesService 非対応問題**: 2025年3月以降の新規GCPプロジェクトでは PlacesService が使えない → lat/lng 座標ベースに変更して解決
- **fetch-notion.js placeId 上書き問題**: Notion sync時に placeId が null で上書きされる → `spot.placeId || prev?.placeId || null` のフォールバック追加
- **KMLフォルダ名抽出バグ**: CDATA対応で Placemark名がフォルダ名として誤検知 → `<Placemark>` 前のテキストからフォルダ名を取得するよう修正
- **フィルターが動的カードに効かない問題**: main.js がDOMContentLoaded時点のカードしか参照しない → クリック時に毎回querySelectorAllで再取得するよう修正

---

## 次にやること（優先順）

1. **サイト導線・表示確認**
   - トップページ国カード → 各国ページのリンク確認
   - スポット・キュレーション・イベント表示の最終確認

2. **My Maps 運用開始**
   - 旅先でピンを追加する運用フローを確立
   - 信頼できる在住者を編集者として招待

3. **新しい国の追加フロー整備**
   - 11カ国目以降を簡単に追加できる手順書/テンプレート化

4. **投稿フォーム**
   - ユーザーがスポットを提案→承認→My Mapsに追加の仕組み

---

## 重要なURL

| 場所 | URL |
|---|---|
| サイト本番 | https://dawayuki01.github.io/Wamily-Guide/ |
| GitHubリポジトリ | https://github.com/dawayuki01/Wamily-Guide |
| GitHub Actions | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/sync.yml |
| Google My Maps | https://www.google.com/maps/d/edit?mid=1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM |
| Google Cloud Console | https://console.cloud.google.com/apis/credentials?project=sawady-twitter |
| NotionスポットDB | https://notion.so/61864001cf964afbb7f294b07cd445a1 |
| NotionキュレーションDB | https://notion.so/4f146e35f68046e1acf28e4cc86851fb |
| Notion Integration設定 | https://www.notion.so/profile/integrations |
