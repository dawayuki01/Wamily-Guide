# Wamily AI カンパニー — Phase 1 実装仕様書

> **このドキュメントの目的**: 新しいClaude Codeセッションがこのファイルを読むだけで、Phase 1 の全実装を開始できるようにする。

---

## 1. コンセプト概要

### 「AIカンパニー」とは

Wamilyの自動化を **7つの仮想チーム** として組織化し、最小の人的リソースで最高水準のアウトプットを持続する仕組み。

| チーム | 役割 | Phase |
|---|---|---|
| パトロール部 | 自動化の監視・アラート・自動修復 | **Phase 1** |
| コンテンツ部 | スポット・イベント・キュレーションの品質管理 | **Phase 1** |
| メルマガ部 | 週刊配信 + シーケンスメール | **Phase 1** |
| コミュニティ部（user） | ユーザーナーチャリング | Phase 2 |
| コミュニティ部（host） | ホストリレーション管理 | Phase 2 |
| SNS部 | Instagram運用 | Phase 2 |
| 参謀室 | 事業戦略・壁打ち | Phase 2 |

### 設計原則

- **「通知が来ない = すべて正常」** — 正常時も日次サマリーを送るが、異常時は即座にアラート
- **既存自動化を壊さない** — Slack未設定でも既存スクリプトは従来通り動作する
- **新しい有料サービスなし** — Slack無料プラン + 既存のGitHub Actions / Notion / Resend
- **永続サーバーなし** — すべてGitHub Actions のcronジョブで実行

### Phase 1 スコープ

| 含む | 含まない |
|---|---|
| Slack通知（成功/失敗/日次レポート） | AI同士の自動協調 |
| データファイル健全性チェック | GitHub API経由のワークフロー自動再実行 |
| 閉業スポットのNotion自動更新 | キュレーションURL切れの自動削除 |
| シーケンスメール（フレームワーク） | シーケンスメールの最終コピー |
| 週次品質レポート | デザイン崩れの自動修正 |

---

## 2. 前提条件 — サワディーが事前にやること

### Slack セットアップ

1. **ワークスペース「Wamily」を新規作成**（https://slack.com/create）
2. **3つのチャンネルを作成:**
   - `#patrol` — パトロール部の通知
   - `#content` — コンテンツ部の品質レポート
   - `#newsletter` — メルマガ配信レポート
3. **各チャンネルにIncoming Webhookを作成:**
   - Slack App管理画面 → 「Incoming Webhooks」アプリを追加
   - チャンネルごとに1つずつWebhook URLを生成（計3つ）
4. **GitHub Secretsに登録:**
   - `SLACK_WEBHOOK_PATROL` → `#patrol` のWebhook URL
   - `SLACK_WEBHOOK_CONTENT` → `#content` のWebhook URL
   - `SLACK_WEBHOOK_NEWSLETTER` → `#newsletter` のWebhook URL

> **なぜ3つ？** 2024年以降、Slack Incoming Webhookは作成時のチャンネルにしか投稿できない。Phase 2 で `#community-user`, `#community-host`, `#sns`, `#strategy` を追加するときも同じパターン。

### Notion DB 変更

メルマガ購読者DB（ID: `4cb8342e-d95d-44bb-894d-0b882eba6e99`）に以下を追加：

| プロパティ名 | 型 | デフォルト | 用途 |
|---|---|---|---|
| `登録日` | Date | なし | シーケンスメールの起点 |
| `シーケンスステップ` | Number | 0 | 現在のステップ（999=完了） |

**既存購読者の対応:** 全員の `シーケンスステップ` を `999` に設定（シーケンス完了済みとして扱い、ウェルカムメールが飛ばないようにする）。

### GitHub Secrets 追加

| シークレット名 | 用途 |
|---|---|
| `SLACK_WEBHOOK_PATROL` | パトロール部 Slack通知 |
| `SLACK_WEBHOOK_CONTENT` | コンテンツ部 Slack通知 |
| `SLACK_WEBHOOK_NEWSLETTER` | メルマガ部 Slack通知 |

---

## 3. 共通基盤 — Slack 通知モジュール

### 新規ファイル: `scripts/lib/slack-notify.js`

全スクリプトが共通で使うSlack通知モジュール。

#### API設計

```js
const { notifySlack } = require('./lib/slack-notify');

// 使用例
await notifySlack({
  channel: 'patrol',       // 'patrol' | 'content' | 'newsletter'
  icon: '🟢',             // メッセージ先頭のアイコン
  title: '[パトロール部] データ同期 完了',
  body: '全32ファイル正常',
  color: 'success',        // 'success' | 'warning' | 'error'
  fields: [                // オプション
    { label: 'スポット数', value: '215件' },
    { label: '更新時刻', value: '09:00 JST' },
  ],
});
```

#### 実装要件

1. **チャンネルマッピング:**
   ```js
   const CHANNEL_MAP = {
     patrol:     'SLACK_WEBHOOK_PATROL',
     content:    'SLACK_WEBHOOK_CONTENT',
     newsletter: 'SLACK_WEBHOOK_NEWSLETTER',
   };
   ```
   `channel` 引数 → 環境変数名 → `process.env` から Webhook URL を取得。

2. **フォールバック:** 環境変数が未設定の場合、`console.log` に出力して `return`。**絶対にthrowしない。**

3. **Slackペイロード形式:**
   ```json
   {
     "text": "🟢 [パトロール部] データ同期 完了",
     "attachments": [{
       "color": "#2a9d8f",
       "text": "全32ファイル正常",
       "fields": [
         { "title": "スポット数", "value": "215件", "short": true }
       ]
     }]
   }
   ```

4. **カラーマッピング:**
   - `success` → `#2a9d8f`（Wamilyブランドティール）
   - `warning` → `#e9c46a`（マスタード）
   - `error` → `#e76f51`（レッド）

5. **リトライ:** ネットワークエラー時に1回リトライ（5秒遅延）。2回目も失敗したら `console.error` して `return`。

6. **依存:** Node.js 20 の native `fetch()` のみ。npm追加なし。

7. **エクスポート:** `module.exports = { notifySlack };`

---

## 4. パトロール部

### 4.1 ヘルスチェック — `scripts/health-check.js`（新規作成）

sync.yml の最終ステップとして実行。全データファイルの健全性を検証し、結果をSlackに報告。

#### 検証ルール

| ファイルパターン | 件数 | 検証内容 |
|---|---|---|
| `data/live-feed.json` | 1 | `.items` が配列 & 1件以上、`.updatedAt` がISO文字列 & 48時間以内 |
| `data/spots-{slug}.json` | 10 | `.spots` が配列 & 1件以上、各spotに `name`, `category`, `layer` が存在 |
| `data/curation-{slug}.json` | 10 | `.items` が配列、`.updatedAt` がISO文字列 & 48時間以内 |
| `data/events-{slug}.json` | 10 | `.items` が配列 & 1件以上、`.updatedAt` がISO文字列 & 48時間以内 |
| `data/newsletter-history.json` | 1 | 配列であること |

国スラッグ一覧: `london`, `taipei`, `paris`, `stockholm`, `singapore`, `bangkok`, `manila`, `la`, `hawaii`, `seoul`

#### 追加チェック

- **閉業スポット検知:** `status: 'closed'` のスポットがあれば `⚠️ 閉業: {国名} - {スポット名}` を警告
- **座標欠損カウント:** `lat: null` または `lng: null` の件数を情報として報告（エラーではない）
- **placeId欠損カウント:** `placeId: null` の件数を情報として報告
- **スポット数異常変動:** 前回実行時のスポット数を `data/.health-baseline.json` に保存し、20%以上の増減があれば警告

#### Slack報告形式

**正常時:**
```
🟢 [パトロール部] 日次ヘルスチェック 完了
全32ファイル正常
┌ スポット総数: 215件（open:42 / check:170 / closed:3）
├ 座標あり: 138件 / placeIdあり: 78件
└ 最終更新: 2026-04-08 09:00 JST
```

**異常時:**
```
🔴 [パトロール部] ヘルスチェック 異常検知
2件の問題を検出
┌ ❌ data/events-london.json: updatedAt が72時間前
└ ⚠️ 閉業検知: バンコク - キッザニア・バンコク
```

#### 実行環境

```yaml
# sync.yml の最終ステップとして追加
- name: Health check
  run: node scripts/health-check.js
  env:
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
    SLACK_WEBHOOK_CONTENT: ${{ secrets.SLACK_WEBHOOK_CONTENT }}
```

### 4.2 sync.yml 修正

#### ステップIDの追加

`continue-on-error: true` のステップは `if: failure()` が効かない。各ステップに `id` を付けて `steps.<id>.outcome` で結果を判定する。

```yaml
- name: Generate content (Monday only)
  id: generate_content
  if: github.event_name == 'workflow_dispatch' || ...
  run: node scripts/generate-guide.js
  continue-on-error: true
  env:
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
    # ... 既存のenv変数

- name: Fetch Notion data
  id: fetch_notion
  run: node scripts/fetch-notion.js
  continue-on-error: true
  env:
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
    # ... 既存のenv変数

# 同様に fetch_events, fetch_mymaps, check_spots にも id と SLACK_WEBHOOK_PATROL を追加
```

#### ヘルスチェックステップの追加

```yaml
- name: Health check & Slack report
  if: always()
  run: node scripts/health-check.js
  env:
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
    SLACK_WEBHOOK_CONTENT: ${{ secrets.SLACK_WEBHOOK_CONTENT }}
    STEP_GENERATE: ${{ steps.generate_content.outcome }}
    STEP_NOTION: ${{ steps.fetch_notion.outcome }}
    STEP_EVENTS: ${{ steps.fetch_events.outcome }}
    STEP_MYMAPS: ${{ steps.fetch_mymaps.outcome }}
    STEP_SPOTS: ${{ steps.check_spots.outcome }}
```

health-check.js はこれらの `STEP_*` 環境変数も読み取り、各ステップの成功/失敗をSlackレポートに含める。

### 4.3 既存スクリプトへの通知追加

各スクリプトの `main()` 関数末尾に通知を追加する。パターンは共通：

```js
// ファイル冒頭に追加
const { notifySlack } = require('./lib/slack-notify');

// main() の末尾（既存の try-catch の中）に追加
await notifySlack({
  channel: 'patrol',
  icon: errors.length ? '🔴' : '🟢',
  title: `[パトロール部] ${scriptName} ${errors.length ? '一部エラー' : '完了'}`,
  body: summaryText,
  color: errors.length ? 'error' : 'success',
  fields: [...],
});
```

#### スクリプト別の通知内容

| スクリプト | 成功時の通知例 | fields |
|---|---|---|
| `fetch-notion.js` | `Notion同期 完了` | フィード件数、スポット総数、キュレーション総数 |
| `fetch-events.js` | `イベント更新 完了` | 更新国数、イベント総数 |
| `fetch-mymaps.js` | `My Maps同期 完了` | 新規追加数（0件なら通知スキップ） |
| `check-spots.js` | `スポットチェック 完了` | チェック数、open/check/closed 内訳 |
| `generate-guide.js` | `コンテンツ生成 完了` | 生成国数、フィード数、キュレーション数 |
| `newsletter.js` | `週刊メルマガ 配信完了` | 記事数、購読者数、成功/失敗数 |
| `newsletter-announce.js` | `お知らせ配信 完了` | 件名、購読者数、成功/失敗数 |

**注意:** `newsletter.js` と `newsletter-announce.js` は `channel: 'newsletter'` を使用。他の5スクリプトは `channel: 'patrol'`。

### 4.4 自動修復

#### 閉業スポットのNotion自動更新

`check-spots.js` が `CLOSED_PERMANENTLY` を検知した場合：
1. 既存の処理: spots JSONファイルの `status` を `"closed"` に更新（これは既にやっている）
2. **追加:** Notion スポットDBの該当ページの「ステータス」プロパティも更新

```js
// check-spots.js に追加する処理
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// 閉業検知時
if (newStatus === 'closed') {
  // Notion のスポットページを検索して status 更新
  // スポットDBのIDは NOTION_SPOTS_DB_ID
  // スポット名で検索 → ステータスプロパティを「閉業」に更新
}
```

**sync.yml の env 追加:**
```yaml
- name: Check spots (Monday only)
  id: check_spots
  run: node scripts/check-spots.js
  env:
    GOOGLE_PLACES_API_KEY: ${{ secrets.GOOGLE_PLACES_API_KEY }}
    NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}           # 追加
    NOTION_SPOTS_DB_ID: ${{ secrets.NOTION_SPOTS_DB_ID }}   # 追加
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
```

#### 自動修復しないもの（通知のみ）

- **キュレーションURL切れ:** HEAD リクエストは一時的なエラー（メンテナンス、レート制限）と本当のリンク切れの区別が困難。通知のみ。
- **ワークフロー自動再実行:** GitHub API トークンの権限設定が複雑。Phase 2 以降で検討。
- **デザイン崩れ:** コード変更が必要なため自動修正は危険。通知 + 修正案の提示まで。

---

## 5. コンテンツ部

コンテンツ部の機能は `health-check.js` に統合する（別スクリプトにはしない）。

### 5.1 日次チェック（毎日実行）

- **イベント鮮度:** 各国の `events-{slug}.json` の `updatedAt` が48時間以上前なら警告
- **live-feed鮮度:** `live-feed.json` の `updatedAt` が7日以上前なら警告
- 結果を `#content` チャンネルに送信

### 5.2 週次品質レポート（月曜のみ）

月曜のsync実行時のみ、詳細な品質レポートを `#content` に送信。

#### キュレーションURL疎通確認

各国の `curation-{slug}.json` の全URLに対してHTTP HEADリクエスト:
- ステータス 200, 405, 403 → OK（405 = HEAD非対応、403 = ログイン必須）
- ステータス 404, 410, ネットワークエラー → 警告
- タイムアウト: 5秒

> **参考:** `generate-guide.js` に同様のURL検証パターンが既に存在。再利用可能。

#### 週次レポート形式

```
📊 [コンテンツ部] 週次品質レポート

スポット状況:
┌ 🇬🇧 ロンドン: 43件（open:6 / check:37 / closed:0）
├ 🇹🇼 台北: 14件（open:0 / check:14 / closed:0）
├ 🇫🇷 パリ: 22件（open:3 / check:19 / closed:0）
├ 🇸🇪 ストックホルム: 20件（open:0 / check:20 / closed:0）
├ 🇸🇬 シンガポール: 10件（open:0 / check:10 / closed:0）
├ 🇹🇭 バンコク: 11件（open:0 / check:10 / closed:1）
├ 🇵🇭 マニラ: 10件（open:0 / check:10 / closed:0）
├ 🇺🇸 LA: 10件（open:0 / check:10 / closed:0）
├ 🇺🇸 ハワイ: 15件（open:0 / check:15 / closed:0）
└ 🇰🇷 ソウル: 10件（open:0 / check:10 / closed:0）

キュレーション:
┌ URL疎通OK: 18/22件
└ ⚠️ リンク切れ疑い: パリ - "Paris Mama Blog"（404）

イベント:
└ 全10カ国 更新済み ✅
```

### 5.3 自動修復しないもの

- **イベント再生成:** `fetch-events.js` が毎日実行されているため、鮮度問題は通常スクリプトの失敗を意味する。自動再生成ではなくアラートで対応
- **live-feed自動投稿:** `generate-guide.js` が週1実行。鮮度警告は情報提供のみ

---

## 6. メルマガ部 — シーケンスメール

### 6.1 設計方針

- **営業臭くない。** Wamilyに登録してくれた人は「共感」が入口。情報の押し売りではなく、愛を込めて迎える
- **テンプレートの最終コピーはサワディーと詰める。** この仕様書ではフレームワーク（ステップ定義・処理ロジック・メール構造）のみ定義
- **1日1ステップ上限。** スクリプトがダウンしていた場合のバースト送信を防止

### 6.2 シーケンス定義

```js
const SEQUENCE = [
  { step: 1, daysAfter: 1,  template: 'welcome',   subject: 'Wamilyへようこそ' },
  { step: 2, daysAfter: 3,  template: 'howToUse',   subject: '（サワディーと相談して決定）' },
  { step: 3, daysAfter: 7,  template: 'recommend',  subject: '（サワディーと相談して決定）' },
  { step: 4, daysAfter: 14, template: 'baton',      subject: '（サワディーと相談して決定）' },
];
```

- `daysAfter`: 登録日からの経過日数
- `template`: `scripts/newsletter/sequence-templates.js` 内のテンプレート関数名
- `subject`: メールの件名

### 6.3 テンプレートファイル: `scripts/newsletter/sequence-templates.js`（新規作成）

```js
// 各テンプレートは HTML を返す関数
module.exports = {
  welcome(subscriber) {
    return `
      <div style="...">
        <h1>Wamilyへようこそ</h1>
        <p><!-- サワディーと相談して決定 --></p>
        <!-- 配信停止リンク -->
      </div>
    `;
  },
  howToUse(subscriber) { /* ... */ },
  recommend(subscriber) { /* ... */ },
  baton(subscriber) { /* ... */ },
};
```

テンプレートのHTML構造は `scripts/newsletter/email-template.js` のスタイルを踏襲（ブランドカラー、フッター構成など）。

### 6.4 処理スクリプト: `scripts/newsletter-sequence.js`（新規作成）

#### 処理フロー

```
1. Notion購読者DB をクエリ:
   フィルター: ステータス = "アクティブ" AND シーケンスステップ < 999

2. 各購読者について:
   a. 登録日 が null → スキップ（console.warn）
   b. 経過日数 = 今日 - 登録日
   c. 現在のステップ = シーケンスステップ（0なら未開始）
   d. 次のステップ = SEQUENCE[現在のステップ]（配列は0-indexed、ステップは1-indexed）
   e. 経過日数 >= 次のステップの daysAfter → メール送信
   f. 送信成功 → Notion の シーケンスステップ を更新
   g. 最終ステップ完了 → シーケンスステップ = 999

3. 結果を #newsletter に報告
```

#### エッジケース処理

| ケース | 処理 |
|---|---|
| `登録日` が null | スキップ + console.warn |
| ステータスが「停止」 | クエリフィルターで除外済み |
| Resend APIエラー | 1回リトライ → 失敗したらスキップ（翌日再試行される） |
| 複数ステップが溜まっている | 次の1ステップだけ送信（バースト防止） |
| 全ステップ完了 | シーケンスステップ = 999 に更新 |

#### DRY_RUN モード

```bash
DRY_RUN=true node scripts/newsletter-sequence.js
```

`DRY_RUN=true` の場合、メール送信とNotion更新をスキップし、代わりに処理内容をコンソールに出力。

#### 環境変数

```
NOTION_API_KEY              — Notion API
NEWSLETTER_SUBSCRIBERS_DB_ID — 購読者DB ID
RESEND_API_KEY              — Resend メール送信
RESEND_FROM_EMAIL           — 送信元（デフォルト: hello@send.tomoyukisawada.com）
SLACK_WEBHOOK_NEWSLETTER    — Slack通知
```

### 6.5 ワークフロー: `.github/workflows/newsletter-sequence.yml`（新規作成）

```yaml
name: Newsletter Sequence
on:
  schedule:
    - cron: '30 22 * * *'  # 毎日 07:30 JST
  workflow_dispatch:

jobs:
  sequence:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd scripts && npm ci
      - name: Send sequence emails
        run: node scripts/newsletter-sequence.js
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NEWSLETTER_SUBSCRIBERS_DB_ID: ${{ secrets.NEWSLETTER_SUBSCRIBERS_DB_ID }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          SLACK_WEBHOOK_NEWSLETTER: ${{ secrets.SLACK_WEBHOOK_NEWSLETTER }}
```

### 6.6 既存メルマガスクリプトへの通知追加

#### newsletter.js

`main()` の末尾に追加:
```js
await notifySlack({
  channel: 'newsletter',
  icon: errors.length ? '🔴' : '🟢',
  title: `[メルマガ部] 週刊配信 ${errors.length ? '一部エラー' : '完了'}`,
  body: `${curatedItems.length}記事を${successCount}名に配信`,
  color: errors.length ? 'warning' : 'success',
  fields: [
    { label: '記事数', value: `${curatedItems.length}本` },
    { label: '購読者数', value: `${subscribers.length}名` },
    { label: '成功', value: `${successCount}名` },
    { label: '失敗', value: `${errors.length}名` },
  ],
});
```

#### newsletter-announce.js

配信完了後に同様の通知を `#newsletter` に送信。

---

## 7. 実装ファイル一覧

### 新規ファイル

| ファイル | 推定行数 | 概要 |
|---|---|---|
| `scripts/lib/slack-notify.js` | ~60 | Slack通知共通モジュール |
| `scripts/health-check.js` | ~200 | データ検証 + 品質レポート（パトロール部 + コンテンツ部） |
| `scripts/newsletter-sequence.js` | ~150 | シーケンスメール配信 |
| `scripts/newsletter/sequence-templates.js` | ~100 | シーケンスメールHTMLテンプレート |
| `.github/workflows/newsletter-sequence.yml` | ~30 | シーケンスメール日次ワークフロー |
| `docs/ai-teams/patrol.md` | ~50 | パトロール部 運用ガイド |
| `docs/ai-teams/content.md` | ~50 | コンテンツ部 運用ガイド |
| `docs/ai-teams/newsletter.md` | ~50 | メルマガ部 運用ガイド |

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `scripts/fetch-notion.js` | `require('./lib/slack-notify')` + main末尾に通知追加 |
| `scripts/fetch-events.js` | 同上 |
| `scripts/fetch-mymaps.js` | 同上 |
| `scripts/check-spots.js` | 通知追加 + Notion閉業スポット自動更新 |
| `scripts/generate-guide.js` | 通知追加 |
| `scripts/newsletter.js` | 通知追加（channel: newsletter） |
| `scripts/newsletter-announce.js` | 通知追加（channel: newsletter） |
| `.github/workflows/sync.yml` | 各ステップにid追加 + health-checkステップ + env追加 |
| `.github/workflows/newsletter.yml` | SLACK_WEBHOOK_NEWSLETTER をenvに追加 |
| `.github/workflows/newsletter-announce.yml` | SLACK_WEBHOOK_NEWSLETTER をenvに追加 |

### 依存関係（変更なし）

既存の `scripts/package.json` で十分。新しいnpm依存は不要（Node.js 20 の native fetch を使用）。

---

## 8. 実装順序

各ステップは前のステップが完了してから着手する（依存関係あり）。

### Step 1: 共通基盤
1. `scripts/lib/` ディレクトリ作成
2. `scripts/lib/slack-notify.js` 実装
3. ローカルテスト: 実Webhook URLで通知が届くことを確認

### Step 2: ヘルスチェック
1. `scripts/health-check.js` 実装
2. ローカルテスト: `node scripts/health-check.js` で data/ を検証、コンソール出力確認

### Step 3: 既存スクリプト修正
1. 7スクリプトに `require('./lib/slack-notify')` + 通知追加
2. 3ワークフローに `SLACK_WEBHOOK_*` env追加
3. `sync.yml` に各ステップの `id` と health-check ステップ追加
4. `check-spots.js` に Notion 自動更新ロジック追加

### Step 4: シーケンスメール
1. `scripts/newsletter/sequence-templates.js` 作成（プレースホルダーコピー）
2. `scripts/newsletter-sequence.js` 実装
3. `.github/workflows/newsletter-sequence.yml` 作成
4. DRY_RUN テスト

### Step 5: 運用ドキュメント
1. `docs/ai-teams/patrol.md` 作成
2. `docs/ai-teams/content.md` 作成
3. `docs/ai-teams/newsletter.md` 作成

---

## 9. テスト・検証計画

### ローカルテスト

| テスト | コマンド | 期待結果 |
|---|---|---|
| Slack通知 | `SLACK_WEBHOOK_PATROL=https://... node -e "require('./scripts/lib/slack-notify').notifySlack({channel:'patrol',title:'テスト',body:'OK',color:'success'})"` | `#patrol` に通知が届く |
| Slack未設定時 | `node -e "require('./scripts/lib/slack-notify').notifySlack({channel:'patrol',title:'テスト',body:'OK',color:'success'})"` | console.log に出力、エラーなし |
| ヘルスチェック | `node scripts/health-check.js` | data/ の検証結果がコンソールに出力 |
| シーケンスメール | `DRY_RUN=true NOTION_API_KEY=... NEWSLETTER_SUBSCRIBERS_DB_ID=... node scripts/newsletter-sequence.js` | 送信対象者とステップがコンソールに出力（実送信なし） |

### GitHub Actions テスト

1. 全変更をコミット & プッシュ
2. `workflow_dispatch` で `sync.yml` を手動トリガー
3. `#patrol` と `#content` に通知が届くことを確認
4. `workflow_dispatch` で `newsletter-sequence.yml` を手動トリガー
5. `#newsletter` に通知が届くことを確認

### 障害シミュレーション

1. `data/events-london.json` を一時的にリネーム
2. `node scripts/health-check.js` を実行
3. `#patrol` にエラー通知が届くことを確認
4. ファイルを元に戻す

### 回帰テスト

- `SLACK_WEBHOOK_*` 環境変数を全て未設定の状態で、既存7スクリプトを実行
- **結果:** 従来通りコンソール出力のみで正常動作すること（Slack通知はスキップされる）

---

## 10. Phase 2 以降の展望

Phase 1 が安定稼働した後、以下のチームを順次追加:

| チーム | 主な機能 | Slackチャンネル |
|---|---|---|
| コミュニティ部（user） | シーケンスメール後のナーチャリング設計、エンゲージメント分析 | `#community-user` |
| コミュニティ部（host） | ホストリマインダー、プロフィール自動生成、連絡ドラフト | `#community-host` |
| SNS部 | Instagramコンテンツ生成、投稿スケジュール管理 | `#sns` |
| 参謀室 | 事業戦略ドキュメント、壁打ち環境、意思決定ログ | `#strategy` |

各チームも同じパターンで追加: Slackチャンネル + Webhook + GitHub Actions + 専用スクリプト。

---

## 付録: 新規セッション用の初動プロンプト

```
docs/ai-teams-spec.md を読んで、Wamily AI カンパニー Phase 1 を実装してください。

前提:
- Slack ワークスペースとWebhook URLは設定済みです
- Notion 購読者DBにプロパティ追加済みです
- GitHub Secrets に SLACK_WEBHOOK_PATROL / CONTENT / NEWSLETTER を登録済みです

実装順序は仕様書の「セクション8」に従ってください。
```

---

## 付録: 既存インフラの参照情報

### GitHub Actions スケジュール（JST）

| ワークフロー | cron | JST |
|---|---|---|
| sync.yml | `0 0 * * *` | 毎日 09:00 |
| newsletter.yml | `0 22 * * 0` | 毎週月曜 07:00 |
| newsletter-announce.yml | `0 23 * * *` | 毎日 08:00 |
| newsletter-sequence.yml（新規） | `30 22 * * *` | 毎日 07:30 |

### 既存スクリプトのエラーパターン

全スクリプトに共通するパターン:
- `console.log('  ✅ ...')` — 成功
- `console.error('  ❌ ...')` — エラー
- `console.warn('  ⚠️ ...')` — 警告
- `continue-on-error: true` — ワークフローは止まらない
- 個別の国/項目の失敗 → try-catch で次に進む

Slack通知はこの既存パターンに **追加** する形で組み込む（既存のconsole出力は残す）。
