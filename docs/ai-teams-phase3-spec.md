# Wamily AI カンパニー — Phase 3 実装仕様書

> **このドキュメントの目的**: 新しいClaude Codeセッションがこのファイルを読むだけで、Phase 3 の全実装を開始できるようにする。

> **前提:** Phase 1（パトロール部・コンテンツ部・メルマガ部）および Phase 2（コミュニティ部 user・host）が実装・稼働済みであること。Phase 1 仕様は `docs/ai-teams-spec.md`、Phase 2 仕様は `docs/ai-teams-phase2-spec.md` を参照。

---

## 1. コンセプト概要

### Phase 3 = 最終フェーズ。7チーム体制完成

Phase 1 で「目と声」、Phase 2 で「人との関係」を自動化した。Phase 3 では「外への発信」「経営の頭脳」「編集の土台」を作り、AIカンパニーを完成させる。

| チーム | 役割 | Phase |
|---|---|---|
| パトロール部 | 自動化の監視・アラート・自動修復 | Phase 1 ✅ |
| コンテンツ部 | スポット・イベント・キュレーションの品質管理 | Phase 1 ✅ |
| メルマガ部 | 週刊配信 + シーケンスメール | Phase 1 ✅ |
| コミュニティ部（user） | ユーザーエンゲージメント分析・マイルストーン通知 | Phase 2 ✅ |
| コミュニティ部（host） | ホストリレーション管理・プロフィール自動生成 | Phase 2 ✅ |
| **SNS部** | **Instagramアナリティクス分析・コンテンツ生成支援** | **Phase 3** |
| **参謀室** | **月次業界レポート・壁打ちログアーカイブ** | **Phase 3** |
| **ガイドブック編集部** | **国の追加/公開管理・成熟度管理・countries.json一元化** | **Phase 3** |

### Phase 3 スコープ

| 含む | 含まない |
|---|---|
| Instagram Graph API 週次アナリティクス | Instagram 自動投稿（Phase 4 以降） |
| Claudeによるキャプション・ハッシュタグ生成 | リール動画の自動編集 |
| 月次業界レポート（ウォッチリスト + Claude分析） | リアルタイム競合監視 |
| 壁打ちログのNotionアーカイブ | AI同士の自動協調 |
| countries.json による国データ一元管理 | 多言語対応 |
| 国の公開/非公開/成熟度の自動判定 | 自動ページデザイン生成 |
| 国追加フロー（add-country.js） | 国削除の自動化 |

---

## 2. 前提条件 — サワディーが事前にやること

### Slack セットアップ（追加分）

Phase 1・2 で作成済みの Slack ワークスペース「Wamily」に3チャンネルを追加:

1. **`#sns`** — SNS部の通知
2. **`#editorial`** — ガイドブック編集部の通知
3. **`#strategy`** — 参謀室の通知

各チャンネルにIncoming Webhookを作成し、GitHub Secretsに登録:
- `SLACK_WEBHOOK_SNS` → `#sns` のWebhook URL
- `SLACK_WEBHOOK_EDITORIAL` → `#editorial` のWebhook URL
- `SLACK_WEBHOOK_STRATEGY` → `#strategy` のWebhook URL

### GA4 タグ貼付の確認

Phase 2 で GA4 プロパティを作成済み。全14 HTMLファイルの `<head>` 内最上部に以下が貼付されていること:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

対象ファイル（14ファイル）: `index.html`, `concept/index.html`, `connect/index.html`, `guidebook/index.html`, `london/index.html`, `taipei/index.html`, `paris/index.html`, `stockholm/index.html`, `singapore/index.html`, `bangkok/index.html`, `manila/index.html`, `la/index.html`, `hawaii/index.html`, `seoul/index.html`

### Instagram セットアップ

Instagram Graph API でアナリティクスを取得するための手順:

1. **ビジネスアカウントに切り替え:** Instagramアプリ → 設定 → アカウント → プロアカウントに切り替え（アカウント: `@wamily_travel`）
2. **Facebook Page を作成してリンク:** Meta Business Suite（https://business.facebook.com/）でFacebook Pageを作成し、Instagramビジネスアカウントと連携
3. **Meta Developer App を作成:** Meta for Developers でアプリ作成 → 「Instagram Graph API」プロダクト追加 → 権限: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`
4. **Long-lived User Access Token を取得:**
   ```
   GET https://graph.facebook.com/v19.0/oauth/access_token
     ?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}
   ```
5. **Instagram Business Account ID を取得:**
   ```
   GET https://graph.facebook.com/v19.0/me/accounts?access_token={token}
   → page_id → GET /v19.0/{page_id}?fields=instagram_business_account → .id
   ```
6. **トークン有効期限の管理:** Long-lived Token は60日で期限切れ。GitHub Secrets はプログラムから自動更新できないため、`sns-analytics.js` がトークン作成日を `data/.sns-token-state.json` に記録し、**50日経過時点で `#sns` にリマインド通知**を送信。サワディーが手動でトークンを再取得して更新する。

### Notion セットアップ（追加分）

#### 参謀室DB（新規作成）

| プロパティ名 | 型 | 用途 |
|---|---|---|
| タイトル | Title | レポート名 or 壁打ちテーマ |
| タイプ | Select | `月次レポート` / `壁打ちメモ` / `意思決定ログ` |
| 日付 | Date | レポート対象月 or 壁打ち日 |
| ステータス | Select | `下書き` / `確定` |

#### ウォッチリストDB（新規作成）

| プロパティ名 | 型 | 用途 |
|---|---|---|
| 企業名 | Title | 企業名 or キーワード |
| URL | URL | 企業サイト / ニュースソース URL |
| カテゴリ | Select | `大手旅行` / `スタートアップ` / `メディア` / `テック` |
| タイプ | Select | `企業` / `キーワード` / `情報源` |
| メモ | Rich text | 注目ポイント |
| 最終チェック日 | Date | スクリプトが最後にチェックした日 |

#### Instagram投稿DB（新規作成）

| プロパティ名 | 型 | 用途 |
|---|---|---|
| タイトル | Title | 投稿の要約タイトル |
| キャプション | Rich text | Claude生成のキャプション |
| ハッシュタグ | Rich text | Claude生成のハッシュタグ |
| 国スラッグ | Select | 対象国 |
| カテゴリ | Select | `体験談` / `スポット紹介` / `Tips` / `リール` |
| ステータス | Select | `下書き` / `投稿済み` / `ボツ` |
| 投稿日 | Date | 実際の投稿日 |
| Instagram投稿ID | Rich text | Graph APIから取得した投稿ID |
| リーチ / いいね / 保存数 / コメント数 | Number | Graph APIから取得 |

### GitHub Secrets 追加（計8つ）

| シークレット名 | 用途 |
|---|---|
| `SLACK_WEBHOOK_SNS` | SNS部 Slack通知 |
| `SLACK_WEBHOOK_EDITORIAL` | ガイドブック編集部 Slack通知 |
| `SLACK_WEBHOOK_STRATEGY` | 参謀室 Slack通知 |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API Long-lived Token |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagramビジネスアカウント ID |
| `NOTION_STRATEGY_DB_ID` | 参謀室DB ID |
| `NOTION_WATCHLIST_DB_ID` | ウォッチリストDB ID |
| `NOTION_INSTAGRAM_DB_ID` | Instagram投稿DB ID |

---

## 3. 共通基盤の拡張

### 3.1 slack-notify.js の拡張

`scripts/lib/slack-notify.js` の `CHANNEL_MAP` に3チャンネルを追加:

```js
const CHANNEL_MAP = {
  patrol:          'SLACK_WEBHOOK_PATROL',
  content:         'SLACK_WEBHOOK_CONTENT',
  newsletter:      'SLACK_WEBHOOK_NEWSLETTER',
  community_user:  'SLACK_WEBHOOK_COMMUNITY_USER',
  community_host:  'SLACK_WEBHOOK_COMMUNITY_HOST',
  sns:             'SLACK_WEBHOOK_SNS',              // Phase 3 追加
  editorial:       'SLACK_WEBHOOK_EDITORIAL',        // Phase 3 追加
  strategy:        'SLACK_WEBHOOK_STRATEGY',         // Phase 3 追加
};
```

### 3.2 countries.json — 国データの一元管理

新規ファイル `data/countries.json`:

```json
{
  "countries": [
    { "slug": "london", "nameJa": "ロンドン", "nameEn": "London", "flag": "🇬🇧", "status": "public", "maturity": "充実", "tripDate": null, "spots": 43, "hasHost": true, "center": { "lat": 51.5074, "lng": -0.1278 }, "zoom": 12 },
    { "slug": "taipei", "nameJa": "台北", "nameEn": "Taipei", "flag": "🇹🇼", "status": "public", "maturity": "基本", "tripDate": null, "spots": 14, "hasHost": false, "center": { "lat": 25.033, "lng": 121.5654 }, "zoom": 13 },
    { "slug": "paris", "nameJa": "パリ", "nameEn": "Paris", "flag": "🇫🇷", "status": "public", "maturity": "充実", "tripDate": null, "spots": 22, "hasHost": false, "center": { "lat": 48.8566, "lng": 2.3522 }, "zoom": 12 },
    { "slug": "stockholm", "nameJa": "ストックホルム", "nameEn": "Stockholm", "flag": "🇸🇪", "status": "public", "maturity": "充実", "tripDate": null, "spots": 20, "hasHost": false, "center": { "lat": 59.3293, "lng": 18.0686 }, "zoom": 12 },
    { "slug": "singapore", "nameJa": "シンガポール", "nameEn": "Singapore", "flag": "🇸🇬", "status": "public", "maturity": "基本", "tripDate": null, "spots": 10, "hasHost": false, "center": { "lat": 1.3521, "lng": 103.8198 }, "zoom": 12 },
    { "slug": "bangkok", "nameJa": "バンコク", "nameEn": "Bangkok", "flag": "🇹🇭", "status": "public", "maturity": "基本", "tripDate": null, "spots": 11, "hasHost": false, "center": { "lat": 13.7563, "lng": 100.5018 }, "zoom": 12 },
    { "slug": "manila", "nameJa": "マニラ", "nameEn": "Manila", "flag": "🇵🇭", "status": "public", "maturity": "基本", "tripDate": null, "spots": 10, "hasHost": true, "center": { "lat": 14.5995, "lng": 120.9842 }, "zoom": 12 },
    { "slug": "la", "nameJa": "LA", "nameEn": "Los Angeles", "flag": "🇺🇸", "status": "public", "maturity": "基本", "tripDate": null, "spots": 10, "hasHost": false, "center": { "lat": 34.0522, "lng": -118.2437 }, "zoom": 11 },
    { "slug": "hawaii", "nameJa": "ハワイ", "nameEn": "Hawaii", "flag": "🇺🇸", "status": "public", "maturity": "充実", "tripDate": null, "spots": 15, "hasHost": true, "center": { "lat": 21.3069, "lng": -157.8583 }, "zoom": 11 },
    { "slug": "seoul", "nameJa": "ソウル", "nameEn": "Seoul", "flag": "🇰🇷", "status": "public", "maturity": "基本", "tripDate": null, "spots": 10, "hasHost": false, "center": { "lat": 37.5665, "lng": 126.978 }, "zoom": 12 }
  ]
}
```

**ステータス定義:** `public`（公開）/ `draft`（準備中・非表示）/ `archived`（アーカイブ）

**成熟度の自動判定ルール:**
- `準備中`: spots < 5
- `基本`: spots >= 5 AND (hasHost = false OR curation < 3)
- `充実`: spots >= 15 AND hasHost = true AND curation >= 3

`editorial-report.js` が `spots`, `hasHost`, `maturity` を毎週自動更新する。

---

## 4. SNS部

### 4.1 コンテンツ生成フロー

```
サワディーが写真 + 体験メモを共有（Claude Codeセッション or Notion）
  → Claude がキャプション + ハッシュタグ生成
  → Notion「Instagram投稿DB」に下書き保存
  → サワディーが確認 → 手動でInstagramに投稿
  → 投稿後、Instagram投稿IDをNotionに記録
```

投稿はサワディーが手動。ハッシュタグは固定タグ（`#wamily_travel` `#子連れ海外`）+ 国別タグ（`#wamily_london`）+ ジャンル別タグで計15〜20個。

### 4.2 アナリティクス分析 — `scripts/sns-analytics.js`（新規作成）

#### 処理フロー

```
1. トークン有効期限チェック（data/.sns-token-state.json）
   - 50日経過 → #sns にリマインド通知
   - 60日経過 → 処理中断 + エラー通知

2. Instagram Graph API でデータ取得:
   - アカウント: followers_count, media_count
   - インサイト（7日間）: profile_views, website_clicks
   - 最新投稿（20件）: reach, likes, comments, saved, engagement

3. Notion Instagram投稿DB の「投稿済み」ページに数値を書き戻し

4. 分析: ベスト投稿 / カテゴリ別平均リーチ / フォロワー増減

5. #sns に週次レポート送信
```

#### Slack通知形式

```
📱 [SNS部] 週次Instagramレポート

📊 アカウント状況
┌ フォロワー: 127人（+8 今週）
├ プロフィール閲覧: 45回
└ ウェブサイトクリック: 12回

🔥 今週のベスト投稿
┌ 「ロンドンの自然史博物館で...」
├ リーチ: 892 / いいね: 67 / 保存: 23
└ エンゲージメント率: 10.1%

📈 カテゴリ別パフォーマンス
┌ 体験談: avg リーチ 650
├ スポット紹介: avg リーチ 420
└ Tips: avg リーチ 380
```

#### トークン期限リマインド

```
⚠️ [SNS部] Instagram トークン更新リマインド
Long-lived Token の有効期限が残り10日です。
手順: Meta Graph API Explorer → 新トークン取得 → GitHub Secrets 更新
更新後: node scripts/sns-analytics.js --reset-token-date
```

#### 月次分析

月末付近（25日以降）の週次実行時に自動判定し、月間集計を追加送信: 月間投稿数・平均リーチ・カテゴリ別比較・フォロワー推移・ガイドブック遷移率・来月のコンテンツ提案（Claude API生成）。

#### 環境変数

```
INSTAGRAM_ACCESS_TOKEN        — Instagram Graph API Long-lived Token
INSTAGRAM_BUSINESS_ACCOUNT_ID — Instagram ビジネスアカウント ID
NOTION_API_KEY                — Notion API
NOTION_INSTAGRAM_DB_ID        — Instagram投稿DB ID
SLACK_WEBHOOK_SNS             — Slack通知
```

Instagram未設定時: 全処理をスキップして console.log に出力。**絶対にthrowしない。**

---

## 5. 参謀室

### 5.1 月次業界レポート — `scripts/strategy-report.js`（新規作成）

#### 処理フロー

```
1. Notion ウォッチリストDB から全エントリを取得

2. 企業タイプ: 各URLにアクセス（タイムアウト10秒）、ニュース・更新を確認
3. キーワードタイプ: Claude API で最新トレンドを分析
4. 情報源タイプ: 各URLにアクセスし関連記事を取得

5. Claude API で統合分析 → 企業動向・トレンド・Wamilyへの示唆

6. Notion 参謀室DB に「月次レポート」ページとして保存
7. ウォッチリストDB の「最終チェック日」を更新
8. #strategy にレポート通知
```

#### Slack通知形式

```
📋 [参謀室] 2026年4月 月次レポート

🏢 企業動向
├ HIS: 家族向け海外パッケージを刷新（4/5発表）
├ TABICA: 体験型旅行の海外展開を発表
└ ...

📰 トレンド
├ 「子連れ海外」検索ボリューム前月比+15%
├ 円安傾向続く → 近場アジアの人気上昇
└ ...

💡 示唆
├ 体験型・ローカル志向が加速。Wamilyのポジションに追い風
└ 競合はパッケージ型。「みんなで作る」は差別化要因として健在

→ 詳細: Notion参謀室DB
```

### 5.2 壁打ちログアーカイブ — `scripts/save-strategy-note.js`（新規作成）

Claude Codeセッションでの壁打ち結論をNotionに保存するユーティリティ:

```bash
node scripts/save-strategy-note.js --type "壁打ちメモ" --title "SNS戦略について" --content "..."
```

新しいセッションが壁打ちを始める前に、Notion参謀室DBの直近5件を読み込んでコンテキストとする。

#### 環境変数

```
NOTION_API_KEY         — Notion API
NOTION_STRATEGY_DB_ID  — 参謀室DB ID
NOTION_WATCHLIST_DB_ID — ウォッチリストDB ID
ANTHROPIC_API_KEY      — Claude API（レポート生成）
SLACK_WEBHOOK_STRATEGY — Slack通知
```

---

## 6. ガイドブック編集部

### 6.1 公開/非公開の制御

#### data-loader.js の修正

```js
// 変更前（ハードコード）
const ALL_COUNTRIES = ['london', 'taipei', 'paris', ...];

// 変更後（countries.json から動的読み込み）
let ALL_COUNTRIES = [];
let COUNTRIES_DATA = [];

async function loadCountriesConfig() {
  try {
    const res = await fetch(`${window.WAMILY_BASE || './'}data/countries.json`);
    if (res.ok) {
      const data = await res.json();
      COUNTRIES_DATA = data.countries;
      ALL_COUNTRIES = COUNTRIES_DATA.filter(c => c.status === 'public').map(c => c.slug);
    }
  } catch (e) {
    console.warn('countries.json の取得に失敗。デフォルト値を使用:', e);
    ALL_COUNTRIES = ['london','taipei','paris','stockholm','singapore','bangkok','manila','la','hawaii','seoul'];
  }
}
```

`loadCountriesConfig()` を `DOMContentLoaded` の最初に呼び出し、他のデータ読み込みの前に完了させる。

#### spots-map.js の修正

`COUNTRY_CONFIG` ハードコードを廃止し、countries.json から動的に読み込む。フォールバック付き。

#### guidebook/index.html の修正

国カード・地図ピンの生成で `status === "public"` の国のみ表示。draft国のページ自体は存在するが、ナビ・カルーセル・地図から非表示。

### 6.2 国追加フロー — `scripts/add-country.js`（新規作成）

```bash
node scripts/add-country.js --slug hongkong --nameJa 香港 --nameEn "Hong Kong" --flag 🇭🇰 --lat 22.3193 --lng 114.1694 --zoom 12 --tripDate 2026-06
```

処理: countries.json に draft で追加 → 国フォルダ作成 → テンプレートから index.html 生成 → 空データファイル生成（spots/curation/events）→ fetch-mymaps.js の FOLDER_TO_SLUG への追加を案内

### 6.3 成熟度管理 + 編集レポート — `scripts/editorial-report.js`（新規作成）

週次実行。各国の data/ ファイルを読み取り、成熟度を自動判定し countries.json を更新。

#### Slack通知形式

```
📝 [ガイドブック編集部] 週次レポート

🗺 国別ステータス
┌ 🇬🇧 ロンドン: 公開 / 充実（43スポット・ホストあり）
├ 🇹🇼 台北: 公開 / 基本（14スポット・ホストなし）
├ 🇫🇷 パリ: 公開 / 充実（22スポット・ホストなし）
├ 🇸🇪 ストックホルム: 公開 / 充実（20スポット・ホストなし）
├ 🇸🇬 シンガポール: 公開 / 基本（10スポット・ホストなし）
├ 🇹🇭 バンコク: 公開 / 基本（11スポット・ホストなし）
├ 🇵🇭 マニラ: 公開 / 基本（10スポット・ホストあり）
├ 🇺🇸 LA: 公開 / 基本（10スポット・ホストなし）
├ 🇺🇸 ハワイ: 公開 / 充実（15スポット・ホストあり）
└ 🇰🇷 ソウル: 公開 / 基本（10スポット・ホストなし）

📊 全体サマリー
┌ 公開国: 10 / 下書き: 0
├ スポット総数: 215件
└ ホスト国: 3カ国
```

draft 国がある場合: `└ 🇭🇰 香港: 下書き / 準備中（0スポット・渡航予定: 2026-06）`

環境変数: `SLACK_WEBHOOK_EDITORIAL` のみ（ローカルのデータファイルのみ参照）。

### 6.4 CLAUDE.md トラブルシューティング追加

```markdown
## トラブルシューティング

| 状況 | 対応 |
|---|---|
| メルマガ配信エラー | Slack #newsletter 確認 → scripts/newsletter.js のログ |
| スポットが表示されない | data/spots-{slug}.json 確認 → fetch-notion.js 再実行 |
| ホストを追加したい | Notion ホストDB に登録 → ステータス「アクティブ」に |
| 新しい国を追加したい | `node scripts/add-country.js` → countries.json に draft で追加 |
| 国を公開したい | countries.json の status を "public" に変更 |
| GitHub Actions が失敗 | Slack #patrol 確認 → Actions タブでログ確認 |
| サイトが更新されない | sync.yml の手動実行（workflow_dispatch） |
| Instagram分析が動かない | Slack #sns 確認 → トークン期限チェック |
| 壁打ちログを保存したい | `node scripts/save-strategy-note.js --type "壁打ちメモ" --title "..." --content "..."` |
| 過去の壁打ちを参照したい | Notion 参謀室DB の直近5件を確認 |
```

---

## 7. ワークフロー

### 7.1 community.yml の拡張

Phase 2 で作成した `community.yml` の**週次ジョブ**に SNS分析 と 編集レポート を追加:

```yaml
      # ── Phase 3 追加（週次ジョブの既存ステップの後に追加）──
      - name: SNS analytics
        run: node scripts/sns-analytics.js
        env:
          INSTAGRAM_ACCESS_TOKEN: ${{ secrets.INSTAGRAM_ACCESS_TOKEN }}
          INSTAGRAM_BUSINESS_ACCOUNT_ID: ${{ secrets.INSTAGRAM_BUSINESS_ACCOUNT_ID }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_INSTAGRAM_DB_ID: ${{ secrets.NOTION_INSTAGRAM_DB_ID }}
          SLACK_WEBHOOK_SNS: ${{ secrets.SLACK_WEBHOOK_SNS }}

      - name: Editorial report
        run: node scripts/editorial-report.js
        env:
          SLACK_WEBHOOK_EDITORIAL: ${{ secrets.SLACK_WEBHOOK_EDITORIAL }}
```

git add にステートファイルを追加: `data/.sns-token-state.json`, `data/.sns-followers-state.json`, `data/countries.json`

### 7.2 strategy.yml — 月次ワークフロー（新規作成）

```yaml
name: Strategy
on:
  schedule:
    - cron: '0 1 1 * *'   # 毎月1日 10:00 JST
  workflow_dispatch:

jobs:
  monthly:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd scripts && npm ci
      - name: Monthly strategy report
        run: node scripts/strategy-report.js
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_STRATEGY_DB_ID: ${{ secrets.NOTION_STRATEGY_DB_ID }}
          NOTION_WATCHLIST_DB_ID: ${{ secrets.NOTION_WATCHLIST_DB_ID }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_WEBHOOK_STRATEGY: ${{ secrets.SLACK_WEBHOOK_STRATEGY }}
```

---

## 8. 実装ファイル一覧

### 新規ファイル（10ファイル）

| ファイル | 推定行数 | 概要 |
|---|---|---|
| `scripts/sns-analytics.js` | ~250 | Instagram Graph API 分析・週次レポート |
| `scripts/strategy-report.js` | ~200 | 月次業界レポート生成・Notion保存 |
| `scripts/save-strategy-note.js` | ~80 | 壁打ちログ保存ユーティリティ |
| `scripts/editorial-report.js` | ~180 | 編集部週次チェック・成熟度自動判定 |
| `scripts/add-country.js` | ~150 | 国追加スクリプト（テンプレート生成） |
| `data/countries.json` | ~120 | 国データ一元管理 |
| `.github/workflows/strategy.yml` | ~30 | 参謀室月次ワークフロー |
| `docs/ai-teams/sns.md` | ~50 | SNS部 運用ガイド |
| `docs/ai-teams/strategy.md` | ~50 | 参謀室 運用ガイド |
| `docs/ai-teams/editorial.md` | ~50 | ガイドブック編集部 運用ガイド |

### 修正ファイル（6ファイル）

| ファイル | 変更内容 |
|---|---|
| `scripts/lib/slack-notify.js` | `CHANNEL_MAP` に `sns`, `editorial`, `strategy` 追加 |
| `js/data-loader.js` | `ALL_COUNTRIES` ハードコード廃止 → `countries.json` 動的読み込み + 公開/非公開制御 |
| `js/spots-map.js` | `COUNTRY_CONFIG` ハードコード廃止 → `countries.json` から読み込み |
| `guidebook/index.html` | 国カード生成を `countries.json` ベースに変更（public のみ表示） |
| `.github/workflows/community.yml` | 週次ジョブに SNS分析 + 編集レポートステップ追加 |
| `CLAUDE.md` | トラブルシューティングセクション追加 |

### 依存関係（変更なし）

既存の `scripts/package.json` で十分。新しいnpm依存は不要（Instagram Graph API は native fetch で呼び出し）。

---

## 9. 実装順序

### Step 1: 共通基盤拡張
1. `scripts/lib/slack-notify.js` に `sns`, `editorial`, `strategy` を追加
2. `data/countries.json` を作成（全10カ国のデータ）

### Step 2: ガイドブック編集部
1. `js/data-loader.js` を countries.json 動的読み込みに変更
2. `js/spots-map.js` を countries.json から読み込みに変更
3. `guidebook/index.html` の国カード生成を変更
4. ブラウザテスト: 既存10カ国ページが正常に表示されることを確認
5. `scripts/editorial-report.js` を作成
6. `scripts/add-country.js` を作成

### Step 3: SNS部
1. `scripts/sns-analytics.js` を作成
2. ローカルテスト: Instagram未設定時のフォールバック確認

### Step 4: 参謀室
1. `scripts/strategy-report.js` を作成
2. `scripts/save-strategy-note.js` を作成
3. `.github/workflows/strategy.yml` を作成

### Step 5: ワークフロー統合
1. `community.yml` に SNS分析 + 編集レポートステップ追加
2. `workflow_dispatch` で手動トリガーテスト

### Step 6: CLAUDE.md + 運用ドキュメント
1. `CLAUDE.md` にトラブルシューティングセクション追加
2. `docs/ai-teams/sns.md` / `strategy.md` / `editorial.md` 作成

---

## 10. テスト・検証計画

### ローカルテスト

| テスト | コマンド | 期待結果 |
|---|---|---|
| countries.json | `node -e "JSON.parse(require('fs').readFileSync('data/countries.json','utf8'))"` | パースエラーなし |
| 編集レポート | `node scripts/editorial-report.js` | コンソールにレポート出力 |
| 国追加 | `node scripts/add-country.js --slug hongkong --nameJa 香港 --nameEn "Hong Kong" --flag 🇭🇰 --lat 22.3193 --lng 114.1694 --zoom 12` | countries.json に追加 + ファイル生成 |
| SNS（未設定時） | `node scripts/sns-analytics.js` | 全スキップ、エラーなし |
| SNS（設定後） | `INSTAGRAM_ACCESS_TOKEN=xxx INSTAGRAM_BUSINESS_ACCOUNT_ID=xxx node scripts/sns-analytics.js` | データ取得 + レポート出力 |
| 月次レポート | `NOTION_API_KEY=xxx NOTION_STRATEGY_DB_ID=xxx NOTION_WATCHLIST_DB_ID=xxx ANTHROPIC_API_KEY=xxx node scripts/strategy-report.js` | Notionにレポート保存 |

### 回帰テスト

- `SLACK_WEBHOOK_SNS` / `EDITORIAL` / `STRATEGY` 未設定で全スクリプト実行 → エラーなし
- `INSTAGRAM_ACCESS_TOKEN` 未設定で `sns-analytics.js` → 全スキップ、エラーなし
- `data/countries.json` 削除 → data-loader.js / spots-map.js がデフォルト値でフォールバック

### 障害シミュレーション

| シナリオ | 期待結果 |
|---|---|
| Instagram トークン期限切れ | エラー通知 + 処理中断（他ステップは継続） |
| countries.json 破損 | フロントエンドがフォールバック値を使用 |
| Notion参謀室DB アクセスエラー | エラーログ出力、ワークフロー自体は完了 |
| Claude API エラー | レポート生成スキップ、console.error 出力 |

---

## 付録: 新規セッション用の初動プロンプト

```
docs/ai-teams-phase3-spec.md を読んで、Wamily AI カンパニー Phase 3 を実装してください。

前提:
- Phase 1（パトロール・コンテンツ・メルマガ）は実装・稼働済みです
- Phase 2（コミュニティ user・host）は実装・稼働済みです
- Slack に #sns, #editorial, #strategy チャンネルを追加済みです
- Instagram ビジネスアカウント設定 + Graph API トークン取得済みです
- Notion に参謀室DB・ウォッチリストDB・Instagram投稿DB を作成済みです
- GitHub Secrets に全8つ登録済みです

実装順序は仕様書の「セクション9」に従ってください。
```

## 付録: GitHub Actions スケジュール一覧（Phase 3 追加後）

| ワークフロー | cron | JST | 備考 |
|---|---|---|---|
| sync.yml | `0 0 * * *` | 毎日 09:00 | Phase 1 |
| newsletter.yml | `0 22 * * 0` | 毎週月曜 07:00 | Phase 1 |
| newsletter-announce.yml | `0 23 * * *` | 毎日 08:00 | Phase 1 |
| newsletter-sequence.yml | `30 22 * * *` | 毎日 07:30 | Phase 1 |
| community.yml（日次） | `30 0 * * *` | 毎日 09:30 | Phase 2 |
| community.yml（週次） | `0 1 * * 1` | 毎週月曜 10:00 | Phase 2 + **Phase 3 拡張** |
| **strategy.yml** | `0 1 1 * *` | **毎月1日 10:00** | **Phase 3** |

## 付録: Notion DB ID リファレンス

| DB名 | 環境変数名 | ID |
|---|---|---|
| 最近の動きDB | `NOTION_LIVEFEED_DB_ID` | GitHub Secrets参照 |
| スポットDB | `NOTION_SPOTS_DB_ID` | `61864001-cf96-4afb-b7f2-94b07cd445a1` |
| キュレーションDB | `NOTION_CURATION_DB_ID` | `4f146e35-f680-46e1-acf2-8e4cc86851fb` |
| メルマガ購読者DB | `NEWSLETTER_SUBSCRIBERS_DB_ID` | `4cb8342e-d95d-44bb-894d-0b882eba6e99` |
| メルマガお知らせDB | — | `8735e684-62ce-47b1-8fb4-fd99e9a0725e` |
| 旅のバトンDB | `NOTION_BATON_DB_ID` | `0d873caad48d4cf7aa841312ee9d5a3b` |
| ホストDB | `NOTION_HOST_DB_ID` | Phase 2 で作成済み |
| ダッシュボードページ | `NOTION_DASHBOARD_PAGE_ID` | Phase 2 で作成済み |
| **参謀室DB** | `NOTION_STRATEGY_DB_ID` | **新規作成（セクション2参照）** |
| **ウォッチリストDB** | `NOTION_WATCHLIST_DB_ID` | **新規作成（セクション2参照）** |
| **Instagram投稿DB** | `NOTION_INSTAGRAM_DB_ID` | **新規作成（セクション2参照）** |

## 付録: 全チーム Slack チャンネル一覧

| チャンネル | チーム | Phase | 環境変数 |
|---|---|---|---|
| `#patrol` | パトロール部 | Phase 1 | `SLACK_WEBHOOK_PATROL` |
| `#content` | コンテンツ部 | Phase 1 | `SLACK_WEBHOOK_CONTENT` |
| `#newsletter` | メルマガ部 | Phase 1 | `SLACK_WEBHOOK_NEWSLETTER` |
| `#community-user` | コミュニティ部（user） | Phase 2 | `SLACK_WEBHOOK_COMMUNITY_USER` |
| `#community-host` | コミュニティ部（host） | Phase 2 | `SLACK_WEBHOOK_COMMUNITY_HOST` |
| `#sns` | SNS部 | Phase 3 | `SLACK_WEBHOOK_SNS` |
| `#editorial` | ガイドブック編集部 | Phase 3 | `SLACK_WEBHOOK_EDITORIAL` |
| `#strategy` | 参謀室 | Phase 3 | `SLACK_WEBHOOK_STRATEGY` |
