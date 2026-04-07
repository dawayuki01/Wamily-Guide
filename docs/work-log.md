# Wamily Guide — 作業記録アーカイブ

CLAUDE.md から分離した過去の作業記録。新セッションでの参照用。

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
- **01 きっかけ**：「ロンドンでスマホを盗まれました」→「妻が、夢を追って海外へ挑戦するようになった」
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

### トップページ（index.html + css/top.css）大幅リデザイン
- **ヒーロー**: 地球儀（opacity .22, min(70vw,760px)）+ 浮遊イラストアイコン12個 + キラキラドット8個 + 家族パレード歩行アニメーション
- **About**: 「家族で海外が、好きな人の場所。」+ 左右にイラスト装飾
- **ガイドブック**: 世界地図（白背景）+ イラスト6個 + 人イラスト3人 + 飛行機アニメ
- **Features**: 4カード + 背景イラスト装飾
- **Connect CTA**: ダークフォレスト背景 + イラスト（opacity .85）+ 「フレンズ →」
- セクション区切りドット（マスタード・ティール・マスタード）
- ナビ「つながる」→「フレンズ」全ページ統一
- ニュースセクション削除（各国ページに集約）
- ギャラリーセクション削除（風景写真素材なしのため）

### ガイドブックページ（css/guidebook.css）アニメーション追加
- ヒーローテキスト: スライドアップ登場（GUIDEBOOK → タイトル → サブ → CTA → Stats の順）
- キャラクターイラスト: char-float / char-float-flip で上下浮遊
- グループイラスト: group-float で上下浮遊
- 背景「TRAVEL」テキスト: フェードイン

### コンセプトページ（css微調整）
- 写真グリッド: 台湾上部 object-position center 30%、おまけ center 20%
- バス写真: object-position center 30% → center 55%（子ども2人の顔が見切れない）
- 全文の改行位置を句読点・文の切れ目に最適化

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

### キュレーションリッチ化 — 候補管理システム導入

**Notion DB変更：**
- 「ステータス」プロパティ追加（候補🟡 / 公開🟢 / 非公開⚫）
- 「📋 候補一覧」ビュー作成（ステータス=候補でフィルタ）

**コード変更：**
- `fetch-notion.js` — 「公開」ステータスのみサイトに反映するようフィルタ追加
- `generate-guide.js` — キュレーション生成改善（5件/国、URL必須、HEAD検証、個人体験優先）

**データ整理：**
- 既存86件を全て「公開」に一括設定
- URLなし64件から「公開」ステータスを除去 → URLあり約22件のみ「公開」

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

**GAS プロジェクト一覧（最新）:**
| プロジェクト名 | アカウント | 用途 |
|---|---|---|
| Wamily お問い合わせ自動返信 | pr@tomoyukisawada.com | Google Form 自動返信 |
| Wamily 旅のバトン | pr@tomoyukisawada.com | バトンフォーム → Notion |
| Wamily メルマガ | pr@tomoyukisawada.com | 登録・配信停止 → Notion |

### スポットUI改善（ページ切替式ページネーション）
- data-loader.js: 蛇腹表示 → 5件ずつのページ切替式に変更
- キュレーションと同じUI（「1–5 / 43件」カウンター + 「次の5件 →」ボタン）
- フィルター時も独立したページネーション
- main.js: フィルターハンドラを `window._wamilySpots` API に委譲

### 各国ページ構成統一（全10カ国）
- 全9カ国に「知ってたら楽しい○○フレーズ」アコーディオンセクション追加
  - 4カテゴリ: 😊基本のひと言 / 👶子連れならでは / 🏥いざというとき / 🚇交通・移動
  - 非ラテン文字（タイ語・韓国語・中国語）はカタカナ読み付き
- ロンドンをリファレンスとして構成差分を解消
