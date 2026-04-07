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
| メルマガ購読者DB | 4cb8342e-d95d-44bb-894d-0b882eba6e99 | メルマガ購読者管理 |

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
| RESEND_API_KEY | Resend メール送信 |
| NEWSLETTER_SUBSCRIBERS_DB_ID | Notion メルマガ購読者DB ID |
| NEWSLETTER_GAS_URL | GAS メルマガ登録・配信停止エンドポイント |

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

10. **My Maps 運用テスト完了**
    - テストピン追加 → fetch-mymaps.js 実行 → JSON反映を確認
    - 座標・説明・絵文字・カテゴリすべて正しく取り込まれることを検証
    - 運用フロー確定：旅先でピン追加 → 毎朝自動同期 → サイト反映

11. **新しい国の追加フロー整備**
    - scripts/add-country.js 新規作成
    - 対話形式で国情報を入力 → 8箇所のファイルを自動更新
    - 国ページHTML生成・空のspotsJSON・全設定ファイルの追記を1コマンドで完了
    - 手動残作業（My Mapsフォルダ・guidebookカード）は案内表示

### 技術的な解決事項
- **PlacesService 非対応問題**: 2025年3月以降の新規GCPプロジェクトでは PlacesService が使えない → lat/lng 座標ベースに変更して解決
- **fetch-notion.js placeId 上書き問題**: Notion sync時に placeId が null で上書きされる → `spot.placeId || prev?.placeId || null` のフォールバック追加
- **KMLフォルダ名抽出バグ**: CDATA対応で Placemark名がフォルダ名として誤検知 → `<Placemark>` 前のテキストからフォルダ名を取得するよう修正
- **フィルターが動的カードに効かない問題**: main.js がDOMContentLoaded時点のカードしか参照しない → クリック時に毎回querySelectorAllで再取得するよう修正

---

## 完了した作業（2026年4月2日）

### ガイドブックページ（guidebook/index.html）大幅リデザイン
- ヒーローセクション刷新：世界地図イラスト＋飛行機イラスト＋マーカースティックアニメーション
- インタラクティブ世界地図：ピンクリック→飛行機アニメーション→各国ページへ遷移
- 国カルーセル（スワイプ対応）
- About セクション：Feature Grid + タブ構成ガイド
- Hero Japan ドット位置修正（日本の正しい緯度経度に）
- LA ピン位置修正（海上→カリフォルニア沿岸）
- ステータスバッジ撤去（全国カード・地図ピン・凡例）
- Feature Grid コピー：居酒屋 Wamily トーンで書き直し
  - 「行ったことがある国だけ」「黒板は常に書き換え中」「スポットは地図で見られる」「現地ホストがいる国も」

---

## 完了した作業（2026年4月3日）

### コンセプトページ（concept/index.html）大幅リニューアル
- `css/concept.css` を新規作成、`concept/index.html` を写真エッセイ形式に完全書き直し
- 透明ナビ → スクロールで白（`.gnav.scrolled`）
- `--dark-forest: #1a3530` をダークパネルに使用（黒よりブランドらしいディープグリーン）
- `IntersectionObserver` によるスクロールフェードイン（`.cp-anim`）
- `clamp()` でレスポンシブタイポグラフィ
- CSS Grid で写真グリッド（非対称5枠）

### コンセプトページ — 言葉のブラッシュアップ（ピボット対応）
マッチングサービス時代の言葉 → ガイドブック＋コミュニティ時代の言葉に全面更新：
- **01 きっかけ**：「ロンドンでスマホを盗まれました」→「妻が、夢を追って海外へ出るようになった」
  - 留守番エピソード削除 → 海外でちょっとした日常を子どもと過ごすリアル（言葉の壁・文化の違い・大変さが倍）にフォーカス
  - 「大変だから行かない」は僕たちじゃない → 絆が深まる → だって海外って面白いから
- **02 旅のかたち**：泣きそうになった理由を補足（友人家族の温かさへの感謝）
- **03 Wamilyとは**：「あの人がいるあの国に」→「行きたい国に、家族で行けるように。」（ガイドブック+コミュニティ方針）
- **オープニング改行**：「荷物は増えた。計画は狂う。思い通りにいかないことばかり。」を1文ずつ改行

### ガイドブックページ — Feature Grid 復元・ブラッシュアップ
- 誤って削除されていた Feature Grid を復元
- 「広告なし」項目 → 「現地ホストがいる国も」に変更
- 全4項目を居酒屋 Wamily トーンで書き直し

### 各国ガイドブックページ — 回遊導線修正（全10カ国）
- ヘッダーパンくず「ガイドブック」をリンク化（`../guidebook/` へ）
- フッター「← ガイドブックに戻る」の遷移先を `../`（トップ）→ `../guidebook/` に修正
- 対象：ロンドン / 台湾 / パリ / ストックホルム / シンガポール / バンコク / マニラ / LA / ハワイ / ソウル

## 完了した作業（2026年4月3日 続き）

### つながるページ（connect/index.html）— フォーム & コピー整備
1. **旅のバトン フォーム → Notion 連携**
   - Notion「旅のバトンDB」作成（ID: `0d873caad48d4cf7aa841312ee9d5a3b`）
   - スキーマ：国・都市(Title) / メッセージ(Rich Text) / お名前(Rich Text) / ステータス(Select) / 国スラッグ(Select) / 投稿日(Date)
   - GAS Web App「Wamily 旅のバトン」デプロイ（pr@tomoyukisawada.com）
   - GAS URL: `https://script.google.com/macros/s/AKfycbzVBtsOY-8IAdAufYOe7NXSRBSXW5vWNGpp4rnTIMDtcbGc_H_7j6uTLY7TOfKu_Ef6/exec`
   - フロー：サイトフォーム → fetch POST → GAS doPost → Notion API → DB保存 + メール通知
   - connect/index.html にインライン送信JS・成功メッセージ追加
   - css/connect.css に disabled / 成功メッセージスタイル追加

2. **ヒーローコピー変更**
   - 変更前：「旅のバトンを、渡してみませんか。」
   - 変更後：「ひとりで抱えないで、一緒に行こう。」
   - サブ変更前：「あなたの経験が、次の誰かの地図になります。」
   - サブ変更後：「家族で海外。大変だけど、頼れる場所があれば、もっと楽しい。」

3. **「週1回。押しつけません。」削除済み**（メルマガセクション）

### GAS プロジェクト一覧
| プロジェクト名 | アカウント | 用途 | Script ID |
|---|---|---|---|
| Wamily お問い合わせ自動返信 | pr@tomoyukisawada.com | Google Form 自動返信 | （Google Form トリガー） |
| Wamily 旅のバトン | pr@tomoyukisawada.com | バトンフォーム → Notion | 1zdMZM_q-TbRgDWl7eja9jdjisqIb2g-PoclnZdmzzTe3D1QxQO36I2co |

### GitHub Secrets（追加分なし — GAS側でNotion APIキーを管理）

## 完了した作業（2026年4月3日 — デザインFix）

### トップページ（index.html + css/top.css）大幅リデザイン ✅ デザインFix
- **ヒーロー**: 地球儀（opacity .22, min(70vw,760px)）+ 浮遊イラストアイコン12個 + キラキラドット8個 + 家族パレード歩行アニメーション
- **About**: 「家族で海外が、好きな人の場所。」+ 左右にイラスト装飾
- **ガイドブック**: 世界地図（白背景）+ イラスト6個 + 人イラスト3人 + 飛行機アニメ
- **Features**: 4カード + 背景イラスト装飾
- **Connect CTA**: ダークフォレスト背景 + イラスト（opacity .85）+ 「フレンズ →」
- セクション区切りドット（マスタード・ティール・マスタード）
- ナビ「つながる」→「フレンズ」全ページ統一
- ニュースセクション削除（各国ページに集約）
- ギャラリーセクション削除（風景写真素材なしのため）
- テキスト: 「一緒に育てていけると嬉しいです」「フレンズと一緒に広げていきたい」

### ガイドブックページ（css/guidebook.css）アニメーション追加
- ヒーローテキスト: スライドアップ登場（GUIDEBOOK → タイトル → サブ → CTA → Stats の順）
- キャラクターイラスト: char-float / char-float-flip で上下浮遊
- グループイラスト: group-float で上下浮遊
- 背景「TRAVEL」テキスト: フェードイン
- About本文: `<br><br>` → 2つの `<p>` タグに分離

### コンセプトページ（concept/index.html + css/concept.css）
- 01きっかけ: 「海外へ出るようになった」→「海外へ挑戦するようになった」
- 写真グリッド: 台湾上部 object-position center 30%、おまけ center 20%
- バス写真: object-position center 30% → center 55%（子ども2人の顔が見切れない）
- 全文の改行位置を句読点・文の切れ目に最適化（7箇所）

### フレンズページ（connect/index.html）
- 長文の改行位置を句読点で最適化（5箇所）
- コネクトイラスト opacity .12 → .85（幽霊→しっかり表示）

### 全ページ共通
- 改行チェック: 全4ページの文章を句読点・意味の区切りで改行するよう統一

---

## 完了した作業（2026年4月6日）

### スタンスコピー更新（トップ + フレンズ）
- トップページ ガイドブックセクション + フレンズページ ブリッジセクションに統一コピー：
  ```
  家族の旅が増えるたびに、ページも増えていく。
  ブログを書くように、少しずつ。
  一緒に育ててくれる仲間がいたら、もっと嬉しい。
  ```
- フレンズページ セクション順変更：01おすそ分け→02そっと置いていく→03ゆるくつながる→04旅の前後に聞く→05現地から迎える
- css/connect.css にブリッジサブテキストスタイル追加

### 各国 Google マップのリッチ化 — スポット65件投入
Chrome MCP で Google Maps 共有リストからスポットデータを取得 → Notion スポットDB に投入 → fetch-notion.js（GitHub Actions）→ サイト反映

| 国 | 追加数 | 主なスポット |
|---|---|---|
| ロンドン | 33件 | テキスト＋Google Maps共有リスト |
| パリ | 12件 | 凱旋門、サクレクール、シャンゼリゼ、Kodawari Ramen ほか |
| ストックホルム | 10件 | Google Maps共有リスト |
| ハワイ | 6件 | Hana Koa、KIDS CITY、レナーズ ほか |
| 台北 | 4件 | 饒河街夜市、華山1914、四四南村、三媽臭臭鍋 |

**カテゴリ修正：**
- セーフウェイ（ハワイ）→ いざという時 → **現地の日常へ**（スーパーは現地の日常へ）
- シャンゼリゼ通り（パリ）→ 現地の日常へ → **遊びに行く**（著名な観光名所は遊びに行く）

**技術的な制約：**
- Google Maps共有リストはDOMに20件しかレンダリングしない（仮想スクロール制限）
- Google Takeoutは「スター付き」のみで「お気に入り」リスト非対応
- → 残りはサワディーがスマホで確認してスクショ共有 or 国別リストを共有して対応

### キュレーションリッチ化 — 候補管理システム導入

**Notion DB変更：**
- 「ステータス」プロパティ追加（候補🟡 / 公開🟢 / 非公開⚫）
- 「📋 候補一覧」ビュー作成（ステータス=候補でフィルタ）

**コード変更：**
- `fetch-notion.js` — 「公開」ステータスのみサイトに反映するようフィルタ追加
- `generate-guide.js` — キュレーション生成改善：
  - 5件/国に増量（3→5）
  - URL必須化 + HTTP HEAD検証（死んだリンクは除外）
  - 個人体験ベースのコンテンツを優先、政府観光局は除外
  - ステータス「候補」で投入

**データ整理：**
- 既存86件を全て「公開」に一括設定
- その後、URLなし64件から「公開」ステータスを除去
- 結果：URLあり約22件のみ「公開」、URLなしはステータスなし

**運用方針：**
- キュレーションは半年に1回程度の頻度でClaudeが見直し・入れ替え候補を提案
- 今あるベースを大事にしつつ、サワディーが「この人いいな」と思ったものを随時Notionに追加
- YouTube / Instagram / ブログの個人コンテンツは頻繁に代替わりしないので安定運用がベース
- 自動生成は月1回程度に頻度調整予定

---

## 次にやること（優先順） — 公開に向けたロードマップ

### ~~1. トップページのデザイン大幅アップデート~~ ✅ 完了
### ~~2. 全ページ動作確認~~ ✅ 完了（2026年4月3日）
- トップ / コンセプト / ガイドブック / フレンズ — モバイル・デスクトップ表示OK
- 全10カ国ページ — パンくず・フッターリンク・JS/CSS参照・data-country属性 全OK
- コンソールエラーなし、リンク切れなし
- mainにマージ & プッシュ完了 → GitHub Pages反映済み

### ~~3. 各国 Google マップのリッチ化~~ ✅ 一部完了（2026年4月6日）

**完了分：Google Maps 共有リスト → Chrome MCP → Notion → サイト反映**

| 国 | 追加数 | 方法 |
|---|---|---|
| ロンドン | 33件 | テキスト＋Google Maps共有リスト |
| ストックホルム | 10件 | Google Maps共有リスト |
| 台北 | 4件 | Google Maps共有リスト |
| ハワイ | 6件 | Google Maps共有リスト |
| パリ | 12件 | Google Maps共有リスト（20/43件取得、残23件は仮想スクロール制限） |

**残課題：**
- 「お気に入り」リスト（277件）の海外スポット（シンガポール・タイ・マレーシア等）が未取得
  - Google Maps共有リストはDOM 20件制限で全件取得不可
  - Google Takeoutは「スター付き」のみで「お気に入り」非対応
  - → サワディーがスマホで確認してスクショ共有 or 国別リストを共有する方法で対応予定
- パリの残り23件
- 各スポットのplaceId・座標は未設定（check-spots.jsの次回実行で一部自動取得）

### ~~4. キュレーションのリッチ化~~ ✅ 完了（2026年4月6日）

**方針：Claude が候補を探す → サワディーが選ぶだけ**

**完了した実装：**
- Notion キュレーションDB に「ステータス」プロパティ追加（候補🟡 / 公開🟢 / 非公開⚫）
- 「📋 候補一覧」ビュー作成（ステータス=候補でフィルタ）
- `fetch-notion.js` 修正 → 「公開」ステータスのみサイトに反映
- `generate-guide.js` のキュレーション生成を改善：
  - 5件/国に増量（3→5）
  - URL必須化 + HTTP HEAD検証（死んだリンクは除外）
  - 個人体験ベースのコンテンツを優先
  - 政府観光局は除外（すでに登録済み）
  - ステータス「候補」で投入
- 既存86件を全て「公開」に設定済み

**運用方針：**
- キュレーションは**半年に1回**程度の頻度でClaudeが見直し・入れ替え候補を提案
- 今あるベースを大事にしつつ、サワディーが「この人いいな」と思ったものを随時Notionに追加
- YouTube / Instagram / ブログの個人コンテンツは頻繁に代替わりしないので、安定運用がベース
- 自動生成は月1回程度に頻度調整予定（sync.yml で制御）

**カテゴリルール（スポット）：**
| カテゴリ | 対象 |
|---|---|
| 親子で食べる | レストラン・カフェ・ベーカリー |
| 遊びに行く | 観光名所・博物館・公園・テーマパーク・百貨店・ショッピングモール |
| 現地の日常へ | 市場・商店街・コンセプトストア・散歩スポット・スーパー |
| いざという時 | 病院・大使館 |

### ~~5. メルマガ（Wamily Letter）~~ ✅ 完了（2026年4月7日）
- **詳細仕様書: `docs/newsletter-spec.md`**
- GitHub Actions + Resend + Notion DB 構成で構築完了
- 週1回（月曜朝7:00 JST）配信、5〜7記事キュレーション
- 予算: Resend Free（750人まで無料）

### 6. Wamily AI チーム組成
- Claude を使った AI チームを構築
- サイト運営・コンテンツ生成の自動化をさらに進化

### 7. サイト公開
- 上記すべて完了後、本番公開

---

## 完了した作業（2026年4月7日）

### Wamily Letter（メルマガ）システム構築 — 全工程完了・稼働中

**2つの配信チャネル:**

| 種類 | 頻度 | トリガー | 内容 |
|---|---|---|---|
| 週刊キュレーション | 毎週月曜 7:00 JST | GitHub Actions cron | RSS → Claude AI → 5本の厳選記事 |
| お知らせ配信 | 不定期（サワディー指定日） | Notion ステータス管理 | 新機能・イベント等のお知らせ |

**① 週刊キュレーション パイプライン:**
```
毎週月曜 7:00 JST（GitHub Actions cron）
  ↓
scripts/newsletter.js
  ① RSS フィード収集（rss-parser — 20ソース）
  ② 配信履歴との重複チェック（data/newsletter-history.json）
  ③ Claude claude-haiku-4-5 でキュレーション（ちょうど5本選定）
  ④ Notion 購読者DB から全アクティブ購読者取得
  ⑤ HTML メール生成（Wamilyスタイル）& Resend API で配信
  ⑥ 配信履歴を保存（直近40記事 = 約8週分を保持）
```

**② お知らせ配信 パイプライン:**
```
サワディーが Notion「メルマガお知らせ」DB でお知らせを書く
  ↓
ステータスを「テスト」に → サワディーだけにテストメール送信
  ↓
確認OK → ステータスを「未配信」+ 配信予定日を設定
  ↓
毎朝 8:00 JST（GitHub Actions cron）で配信予定日チェック
  ↓
scripts/newsletter-announce.js
  ① Notion ページ本文（ブロック）を読み取り → HTML 変換
  ② 全購読者に配信 → ステータス自動で「配信済み」に
```

**お知らせ DB ステータス管理:**
| ステータス | 色 | 動作 |
|---|---|---|
| 🟡 未配信 | 黄 | 配信予定日に全購読者へ配信 |
| 🔵 テスト | 青 | サワディーだけにテスト送信 → 自動で「テスト済み」に |
| 🟣 テスト済み | 紫 | テスト完了。確認後「未配信」に変更 |
| 🟢 配信済み | 緑 | 配信完了（自動） |

**お知らせメール — Notion ブロック → HTML 変換対応:**
段落 / 見出し（H2・H3）/ 箇条書き / 番号リスト / 引用ブロック / コールアウト / 画像 / ブックマーク / 区切り線 / 太字・斜体・リンク

**購読者管理:**
```
サイトのフォーム → fetch POST → GAS → Notion 購読者DB（ステータス: アクティブ）
配信停止: メール内リンク → GAS → Notion ステータス「停止」に更新
```

**新規ファイル:**
| ファイル | 役割 |
|---|---|
| scripts/newsletter.js | 週刊キュレーション配信メインスクリプト |
| scripts/newsletter-announce.js | お知らせ配信スクリプト（Notion本文読み取り） |
| scripts/newsletter/rss-sources.js | RSSソース定義（Layer1: 10媒体 + Layer2: 10キーワード） |
| scripts/newsletter/rss-fetcher.js | RSS取得・正規化（7日以内・最大40記事） |
| scripts/newsletter/curate-prompt.js | Claude キュレーションプロンプト（5本固定・サマリー200-250字） |
| scripts/newsletter/email-template.js | 週刊キュレーション用HTMLメールテンプレート |
| scripts/newsletter/announce-template.js | お知らせ用HTMLメールテンプレート |
| .github/workflows/newsletter.yml | 週刊キュレーション ワークフロー（毎週月曜7:00 JST） |
| .github/workflows/newsletter-announce.yml | お知らせ配信 ワークフロー（毎日8:00 JST） |
| data/newsletter-history.json | 配信済み記事URL履歴（重複防止） |
| docs/gas-newsletter.js | GAS コード（メルマガ登録・配信停止） |

**変更ファイル:**
| ファイル | 変更内容 |
|---|---|
| connect/index.html | メルマガ登録フォーム + 旅のバトンフォーム |
| {10カ国}/index.html | インライン登録フォーム + JS追加 |
| scripts/package.json | resend パッケージ追加 |

**Notion DB（追加）:**
| DB名 | ID | 用途 |
|---|---|---|
| メルマガ購読者 | 4cb8342e-d95d-44bb-894d-0b882eba6e99 | 購読者管理（メール・ステータス・解除トークン） |
| メルマガお知らせ | 8735e684-62ce-47b1-8fb4-fd99e9a0725e | お知らせ管理（タイトル・本文・ステータス・配信予定日） |

**GitHub Secrets（追加済み）:**
| シークレット名 | 用途 |
|---|---|
| RESEND_API_KEY | Resend メール送信 |
| NEWSLETTER_SUBSCRIBERS_DB_ID | Notion 購読者DB ID |
| NEWSLETTER_GAS_URL | GAS 配信停止エンドポイント |
| NEWSLETTER_TEST_EMAIL | テスト送信先メールアドレス |

**RSSソース（20ソース）:**
- Layer 1（編集媒体10件）: The Guardian Travel / BBC Travel / The Atlantic / Wired / Reasons to be Cheerful / NYT Travel / Condé Nast Traveler / Monocle / The New Yorker Culture / TIME
- Layer 2（Google News 10キーワード）: family travel trend 2026 / slow travel family children / educational travel children / childhood outdoor culture trend / family friendly city design / cultural exchange family / expat family life / multigenerational travel / Europe family holiday destination trend / best family travel destinations 2026

**キュレーション基準:**
- まだマイノリティだがマジョリティになりつつある「種」を優先
- 現地に住む人のリアルな動き（観光客向け除外）
- 海外の家族（特に欧米）の旅行トレンドを積極的に拾う
- 4カテゴリ: URBAN LIFE / TRAVEL SHIFT / PARENTING / CULTURE
- サマリー200-250字（5-6文）+ サワダコメント120-180字（3-4文）

**GAS プロジェクト（追加）:**
| プロジェクト名 | アカウント | 用途 | デプロイURL |
|---|---|---|---|
| Wamily メルマガ | pr@tomoyukisawada.com | 登録・配信停止 → Notion | https://script.google.com/macros/s/AKfycbxXO-kU0h91mU7wZ6fmntSImTDZuG0Gus-naXaL36yCXNo95m42BNgh1YS9O2XsQkjc/exec |

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
| Notionメルマガ購読者DB | https://notion.so/4cb8342ed95d44bb894d0b882eba6e99 |
| Notionメルマガお知らせDB | https://notion.so/8735e68462ce47b18fb4fd99e9a0725e |
| Notion Integration設定 | https://www.notion.so/profile/integrations |
| Newsletter Actions（週刊） | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/newsletter.yml |
| Newsletter Actions（お知らせ） | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/newsletter-announce.yml |
