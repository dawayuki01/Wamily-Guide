# Wamily AI カンパニー — Phase 2 実装仕様書

> **このドキュメントの目的**: 新しいClaude Codeセッションがこのファイルを読むだけで、Phase 2 の全実装を開始できるようにする。

> **前提:** Phase 1（パトロール部・コンテンツ部・メルマガ部）が実装・稼働済みであること。Phase 1 仕様は `docs/ai-teams-spec.md` を参照。

---

## 1. コンセプト概要

### Phase 2 = コミュニティ部

Phase 1 で自動化の「目」と「声」を作った。Phase 2 では「人との関係」を自動化する。

| チーム | 役割 | Phase |
|---|---|---|
| パトロール部 | 自動化の監視・アラート・自動修復 | Phase 1 ✅ |
| コンテンツ部 | スポット・イベント・キュレーションの品質管理 | Phase 1 ✅ |
| メルマガ部 | 週刊配信 + シーケンスメール | Phase 1 ✅ |
| **コミュニティ部（user）** | **ユーザーエンゲージメント分析・マイルストーン通知** | **Phase 2** |
| **コミュニティ部（host）** | **ホストリレーション管理・プロフィール自動生成** | **Phase 2** |
| SNS部 | Instagram運用 | Phase 3 |
| 参謀室 | 事業戦略・壁打ち | Phase 3 |

### Phase 2 スコープ

| 含む | 含まない |
|---|---|
| GA4 週次エンゲージメントレポート | リアルタイムアクセス解析 |
| マイルストーン通知（購読者数・バトン投稿数） | ユーザー個別のナーチャリング設計 |
| ホストDB（Notion）による動的管理 | ホストマッチング機能（アプリ化） |
| ホストプロフィール自動生成（Claude API） | ホストとの自動チャット対応 |
| ホストリマインダー（定期連絡ドラフト） | AI同士の自動協調 |
| Notionダッシュボード（週次集計） | BIツール連携 |
| hosts.json による動的サイト表示 | ホストカードのデザイン変更 |

---

## 2. 前提条件 — サワディーが事前にやること

### Slack セットアップ（追加分）

Phase 1 で作成済みの Slack ワークスペース「Wamily」に2チャンネルを追加:

1. **`#community-user`** — ユーザーコミュニティの通知（エンゲージメント・マイルストーン）
2. **`#community-host`** — ホストコミュニティの通知（リマインダー・新規応募）

各チャンネルにIncoming Webhookを作成し、GitHub Secretsに登録:
- `SLACK_WEBHOOK_COMMUNITY_USER` → `#community-user` のWebhook URL
- `SLACK_WEBHOOK_COMMUNITY_HOST` → `#community-host` のWebhook URL

### GA4 セットアップ

1. **GA4プロパティ作成:**
   - Google Analytics → 管理 → プロパティ作成
   - プロパティ名: `Wamily Guide`
   - ウェブストリーム追加 → URL: `https://dawayuki01.github.io/Wamily-Guide/`
   - 測定ID（`G-XXXXXXXXXX`）をメモ

2. **全12 HTMLファイルに gtag.js を貼付:**

   `<head>` 内の最上部に以下を追加:

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

   対象ファイル（12ファイル）:
   - `index.html`（トップページ）
   - `about.html`（Wamilyについて）
   - `london/index.html`
   - `taipei/index.html`
   - `paris/index.html`
   - `stockholm/index.html`
   - `singapore/index.html`
   - `bangkok/index.html`
   - `manila/index.html`
   - `la/index.html`
   - `hawaii/index.html`
   - `seoul/index.html`

3. **サービスアカウント作成:**
   - Google Cloud Console（プロジェクト: sawady-twitter）→ IAM → サービスアカウント作成
   - 名前: `wamily-ga4-reader`
   - GA4 プロパティの管理 → プロパティのアクセス管理 → サービスアカウントのメールアドレスを「閲覧者」として追加
   - JSON鍵をダウンロード → base64エンコード:
     ```bash
     cat wamily-ga4-reader-key.json | base64 | tr -d '\n'
     ```
   - エンコード結果を `GA4_CREDENTIALS` としてGitHub Secretsに登録

4. **GitHub Secretsに登録:**
   - `GA4_PROPERTY_ID` → 測定IDではなくプロパティID（数字のみ、例: `123456789`）
   - `GA4_CREDENTIALS` → base64エンコードしたJSON鍵

### Notion ホストDB（新規作成）

Notionに「ホストDB」を新規作成。以下のプロパティ構成:

**非公開情報（プロフィール管理用）:**

| プロパティ名 | 型 | 用途 |
|---|---|---|
| ホスト名 | Title | Notion上の表示名（本名 or ニックネーム） |
| 本名 | Rich text | 本名（非公開） |
| メール | Email | 連絡先メールアドレス |
| 住所/エリア | Rich text | 在住エリア（非公開） |
| 家族構成 | Rich text | 家族の人数・構成 |
| 子どもの年齢 | Rich text | 例: 「5歳・3歳」 |
| 在住歴 | Rich text | 例: 「7年」 |
| 連絡先（その他） | Rich text | LINE ID等 |

**公開情報（サイト表示用）:**

| プロパティ名 | 型 | 用途 |
|---|---|---|
| ニックネーム | Rich text | サイトに表示する名前 |
| キャッチフレーズ | Rich text | ホストカードの一言紹介 |
| 紹介文 | Rich text | サワディーからの紹介文 |
| 国スラッグ | Select | `london` / `taipei` / `paris` / `stockholm` / `singapore` / `bangkok` / `manila` / `la` / `hawaii` / `seoul` |
| プロフィール画像URL | URL | ホストの写真（外部URL） |

**運用プロパティ:**

| プロパティ名 | 型 | デフォルト | 用途 |
|---|---|---|---|
| ステータス | Select | 審査中 | `アクティブ` / `休止` / `退会` / `審査中` |
| 最終連絡日 | Date | なし | 最後にサワディーが連絡した日 |
| リマインド間隔 | Number | 30 | 何日おきにリマインドするか |
| 連絡メモ | Rich text | なし | 直近の連絡内容メモ |
| フォーム回答 | Rich text | なし | GASから自動保存されるフォーム回答原文 |

### 既存ホストの手動登録

以下の3名を手動でNotion ホストDBに登録:

| ニックネーム | 国スラッグ | ステータス |
|---|---|---|
| Miyukiさん | london | アクティブ |
| Kanaさん | manila | アクティブ |
| Miyaさん | hawaii | アクティブ |

紹介文・キャッチフレーズは現在 `js/data-loader.js` にハードコードされている `HOST_INFO` の内容をそのまま転記。

### Notionダッシュボードページ

Notionに「Wamily ダッシュボード」ページを新規作成（空でOK）。スクリプトが内容を自動更新する。

### GitHub Secrets 追加（計7つ）

| シークレット名 | 用途 |
|---|---|
| `SLACK_WEBHOOK_COMMUNITY_USER` | コミュニティ部（user）Slack通知 |
| `SLACK_WEBHOOK_COMMUNITY_HOST` | コミュニティ部（host）Slack通知 |
| `GA4_PROPERTY_ID` | GA4 プロパティID（数字のみ） |
| `GA4_CREDENTIALS` | GA4 サービスアカウントJSON鍵（base64） |
| `NOTION_HOST_DB_ID` | ホストDB ID |
| `NOTION_DASHBOARD_PAGE_ID` | ダッシュボードページ ID |
| `NOTION_BATON_DB_ID` | 旅のバトンDB ID（`0d873caad48d4cf7aa841312ee9d5a3b`） |

---

## 3. 共通基盤の拡張

### 3.1 slack-notify.js の拡張

`scripts/lib/slack-notify.js` の `CHANNEL_MAP` に2チャンネルを追加:

```js
const CHANNEL_MAP = {
  patrol:          'SLACK_WEBHOOK_PATROL',
  content:         'SLACK_WEBHOOK_CONTENT',
  newsletter:      'SLACK_WEBHOOK_NEWSLETTER',
  community_user:  'SLACK_WEBHOOK_COMMUNITY_USER',   // 追加
  community_host:  'SLACK_WEBHOOK_COMMUNITY_HOST',   // 追加
};
```

### 3.2 npm 依存追加

`scripts/package.json` に `googleapis` を追加:

```bash
cd scripts && npm install googleapis
```

GA4 Data API（`google.analyticsdata.v1beta`）で使用。

### 3.3 新規ファイル: `scripts/lib/ga4-client.js`

GA4 Data API のヘルパーモジュール。

```js
const { google } = require('googleapis');

async function createGA4Client() {
  const credJson = Buffer.from(process.env.GA4_CREDENTIALS, 'base64').toString();
  const credentials = JSON.parse(credJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });

  const analyticsData = google.analyticsdata({
    version: 'v1beta',
    auth,
  });

  return analyticsData;
}

async function runReport(client, { propertyId, startDate, endDate, dimensions, metrics }) {
  const response = await client.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map(d => ({ name: d })),
      metrics: metrics.map(m => ({ name: m })),
    },
  });
  return response.data;
}

module.exports = { createGA4Client, runReport };
```

**使用例:**
```js
const { createGA4Client, runReport } = require('./lib/ga4-client');

const client = await createGA4Client();
const report = await runReport(client, {
  propertyId: process.env.GA4_PROPERTY_ID,
  startDate: '7daysAgo',
  endDate: 'today',
  dimensions: ['pagePath'],
  metrics: ['screenPageViews', 'totalUsers', 'sessions'],
});
```

---

## 4. コミュニティ部（user）

### scripts/community-report.js（新規作成）

1つのスクリプトで `--daily` と `--weekly` の2モードを持つ。

#### 実行方法

```bash
node scripts/community-report.js --daily   # 日次: バトン通知 + マイルストーン
node scripts/community-report.js --weekly  # 週次: GA4レポート + 全体サマリー
```

### 4.1 日次モード（`--daily`）

#### 処理フロー

```
1. Notion 旅のバトンDB をクエリ:
   - フィルター: 作成日が前回チェック以降
   - 前回チェック日は data/.community-last-check.json から読み取り

2. 新規バトン投稿があれば #community-user に個別通知

3. マイルストーン判定:
   a. Notion 購読者DB のアクティブ購読者数を取得
   b. Notion 旅のバトンDB の総投稿数を取得
   c. data/.milestone-state.json から前回到達済みマイルストーンを読み取り
   d. 閾値 [10, 25, 50, 100, 250, 500, 1000] と比較
   e. 新たに超えた閾値があれば通知 + state更新

4. data/.community-last-check.json を更新
```

#### ステートファイル

**data/.community-last-check.json:**
```json
{
  "lastCheckAt": "2026-04-08T00:30:00.000Z"
}
```

**data/.milestone-state.json:**
```json
{
  "subscribers": 10,
  "batons": 0
}
```

初回実行時にファイルが存在しない場合は、現在値を初期値として保存し通知をスキップ。

#### Slack通知形式

**新規バトン投稿:**
```
📮 [コミュニティ部] 新しい旅のバトンが届きました
ロンドン — 「子どもと一緒にテムズ川散歩」
┌ 投稿者: まりこさん
└ 投稿日: 2026-04-08
```

**マイルストーン達成:**
```
🎉 [コミュニティ部] マイルストーン達成！
メルマガ購読者が 100人 を突破しました！（現在: 103人）
```

### 4.2 週次モード（`--weekly`）

#### 処理フロー

```
1. GA4 Data API で過去7日間のデータを取得:
   a. サマリー: screenPageViews, totalUsers, sessions
   b. 流入元トップ5: sessionSource × sessions
   c. 人気ページトップ10: pagePath × screenPageViews

2. Notion 購読者DB:
   a. 総アクティブ購読者数
   b. 過去7日間の新規登録数（登録日フィルター）

3. Notion 旅のバトンDB:
   a. 総投稿数
   b. 過去7日間の新規投稿数

4. 全データを #community-user に週次レポートとして送信
```

#### Slack通知形式（週次レポート）

```
📊 [コミュニティ部] 週次エンゲージメントレポート（4/1〜4/7）

アクセス:
┌ PV: 1,234（先週比 +12%は取得不可のため省略）
├ ユーザー: 567
└ セッション: 890

流入元トップ5:
┌ 1. google — 345
├ 2. (direct) — 234
├ 3. instagram — 123
├ 4. twitter — 89
└ 5. notion.so — 45

人気ページトップ5:
┌ 1. /london/ — 234 PV
├ 2. / — 198 PV
├ 3. /hawaii/ — 156 PV
├ 4. /taipei/ — 134 PV
└ 5. /paris/ — 98 PV

コミュニティ:
┌ メルマガ購読者: 103人（今週 +5）
└ 旅のバトン: 12件（今週 +2）
```

#### 環境変数

```
NOTION_API_KEY              — Notion API
NOTION_BATON_DB_ID          — 旅のバトンDB ID（0d873caad48d4cf7aa841312ee9d5a3b）
NEWSLETTER_SUBSCRIBERS_DB_ID — 購読者DB ID（4cb8342e-d95d-44bb-894d-0b882eba6e99）
GA4_PROPERTY_ID             — GA4 プロパティID
GA4_CREDENTIALS             — GA4 サービスアカウント鍵（base64）
SLACK_WEBHOOK_COMMUNITY_USER — Slack通知
```

#### GA4未設定時のフォールバック

`GA4_PROPERTY_ID` または `GA4_CREDENTIALS` が未設定の場合、GA4セクションをスキップしてNotion集計のみをレポート。**絶対にthrowしない。**

---

## 5. コミュニティ部（host）

### 5.1 GAS: ホスト応募フォーム → Notion 連携

ホスト応募フォーム（`https://docs.google.com/forms/d/e/1FAIpQLScyoeAMB3YqqreMo7KFWjQnlMfPF0RqDmOmhtV5DjCeGM7FqA/viewform`）の送信をトリガーに、GASで以下を実行。

#### GASプロジェクト: 「Wamily ホスト応募」

```javascript
// ── 設定 ─────────────────────────────────────────────
const NOTION_API_KEY     = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
const NOTION_HOST_DB_ID  = PropertiesService.getScriptProperties().getProperty('NOTION_HOST_DB_ID');
const SLACK_WEBHOOK_URL  = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_COMMUNITY_HOST');
const OWNER_EMAIL        = 'pr@tomoyukisawada.com';

// ── フォーム送信トリガー ──────────────────────────────
function onFormSubmit(e) {
  const responses = e.values;
  // フォームの列順序に合わせてインデックスを調整
  const name      = responses[1]; // 本名
  const email     = responses[2]; // メールアドレス
  const country   = responses[3]; // 在住国
  const area      = responses[4]; // 住所/エリア
  const family    = responses[5]; // 家族構成
  const kidsAge   = responses[6]; // 子どもの年齢
  const years     = responses[7]; // 在住歴
  const message   = responses[8]; // 自由記述

  // 1. Notion ホストDBに新規ページ作成
  createNotionHost({ name, email, country, area, family, kidsAge, years, message });

  // 2. 自動返信メール
  GmailApp.sendEmail(email,
    '【Wamily】ホストへのご関心ありがとうございます',
    [
      `${name}さん、こんにちは。`,
      'Wamilyオーナーのサワディーです。',
      '',
      'ホストにご興味を持っていただき、とても嬉しいです。',
      '内容を確認のうえ、サワディーから直接ご連絡させていただきます（通常3〜5日以内）。',
      '',
      'あなたの存在が、誰かの旅を変えると信じています。',
      '',
      '— サワディー / Wamily',
    ].join('\n')
  );

  // 3. サワディーへの通知メール
  GmailApp.sendEmail(OWNER_EMAIL,
    '【Wamily】新規ホスト応募',
    `名前: ${name}\n国: ${country}\nメール: ${email}\n家族構成: ${family}\n子どもの年齢: ${kidsAge}\n在住歴: ${years}\nメッセージ:\n${message}`
  );

  // 4. Slack通知
  notifySlack(`📩 新しいホスト応募がありました\n名前: ${name}\n国: ${country}\n家族構成: ${family}`);
}

// ── Notion API ────────────────────────────────────────
function createNotionHost({ name, email, country, area, family, kidsAge, years, message }) {
  const payload = {
    parent: { database_id: NOTION_HOST_DB_ID },
    properties: {
      'ホスト名':       { title: [{ text: { content: name } }] },
      '本名':          { rich_text: [{ text: { content: name } }] },
      'メール':         { email: email },
      '住所/エリア':    { rich_text: [{ text: { content: area || '' } }] },
      '家族構成':       { rich_text: [{ text: { content: family || '' } }] },
      '子どもの年齢':   { rich_text: [{ text: { content: kidsAge || '' } }] },
      '在住歴':         { rich_text: [{ text: { content: years || '' } }] },
      '国スラッグ':     { select: { name: countryToSlug(country) } },
      'ステータス':     { select: { name: '審査中' } },
      '最終連絡日':     { date: { start: new Date().toISOString().slice(0, 10) } },
      'リマインド間隔':  { number: 30 },
      'フォーム回答':   { rich_text: [{ text: { content: message || '' } }] },
    },
  };

  UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    payload: JSON.stringify(payload),
  });
}

// ── 国名 → スラッグ変換 ──────────────────────────────
function countryToSlug(country) {
  const map = {
    'ロンドン': 'london', 'イギリス': 'london',
    '台湾': 'taipei', '台北': 'taipei',
    'パリ': 'paris', 'フランス': 'paris',
    'ストックホルム': 'stockholm', 'スウェーデン': 'stockholm',
    'シンガポール': 'singapore',
    'バンコク': 'bangkok', 'タイ': 'bangkok',
    'マニラ': 'manila', 'フィリピン': 'manila',
    'LA': 'la', 'ロサンゼルス': 'la',
    'ハワイ': 'hawaii',
    'ソウル': 'seoul', '韓国': 'seoul',
  };
  return map[country] || country.toLowerCase();
}

// ── Slack通知（GASランタイム用） ──────────────────────
function notifySlack(message) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: message }),
    });
  } catch (e) {
    console.error('Slack通知失敗:', e);
  }
}
```

**GASスクリプトプロパティに設定する値:**
| キー | 値 |
|---|---|
| `NOTION_API_KEY` | Notion Integration トークン |
| `NOTION_HOST_DB_ID` | ホストDB ID |
| `SLACK_WEBHOOK_COMMUNITY_HOST` | `#community-host` のWebhook URL |

> **注意:** GASはNode.jsとは別ランタイムのため、`scripts/lib/slack-notify.js` は使えない。GAS内に簡易版の `notifySlack()` を直接記述する。

### 5.2 fetch-notion.js の拡張 — `fetchHosts()`

`scripts/fetch-notion.js` に `fetchHosts()` 関数を追加。既存の `fetchSpots()` / `fetchCuration()` と同じパターンに従う。

#### 追加する関数

```js
// ──────────────────────────────────────────────────────────
// 4. ホストDB
// ──────────────────────────────────────────────────────────

async function fetchHosts(notion) {
  const dbId = process.env.NOTION_HOST_DB_ID;
  if (!dbId) {
    console.warn('⚠  NOTION_HOST_DB_ID が設定されていません。スキップします。');
    return null;
  }

  const response = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: 'ステータス',
      select: { equals: 'アクティブ' },
    },
  });

  const hosts = response.results.map(page => ({
    id: page.id,
    nickname:    richText(page.properties['ニックネーム']),
    catchphrase: richText(page.properties['キャッチフレーズ']),
    intro:       richText(page.properties['紹介文']),
    slug:        selectName(page.properties['国スラッグ']),
    imageUrl:    urlProp(page.properties['プロフィール画像URL']),
  }));

  return hosts;
}
```

#### main() への追加

```js
// main() 内に追加
const hosts = await fetchHosts(notion);
if (hosts) {
  const hostsPath = path.join(DATA_DIR, 'hosts.json');
  fs.writeFileSync(hostsPath, JSON.stringify(hosts, null, 2), 'utf8');
  console.log(`  ✅ hosts.json: ${hosts.length}件`);
}
```

#### 出力: `data/hosts.json`

```json
[
  {
    "id": "page-id-xxx",
    "nickname": "Miyukiさん",
    "catchphrase": "ロンドン親子旅の図書館",
    "intro": "「ロンドンのホストとは、子どもが高熱を出した夜のことが忘れられない...」",
    "slug": "london",
    "imageUrl": ""
  }
]
```

**公開情報のみを出力する。** 本名・メール・住所などの非公開情報はJSONに含めない。

#### sync.yml の env 追加

```yaml
- name: Fetch Notion data
  id: fetch_notion
  run: node scripts/fetch-notion.js
  env:
    NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
    NOTION_LIVEFEED_DB_ID: ${{ secrets.NOTION_LIVEFEED_DB_ID }}
    NOTION_SPOTS_DB_ID: ${{ secrets.NOTION_SPOTS_DB_ID }}
    NOTION_CURATION_DB_ID: ${{ secrets.NOTION_CURATION_DB_ID }}
    NOTION_HOST_DB_ID: ${{ secrets.NOTION_HOST_DB_ID }}          # 追加
    SLACK_WEBHOOK_PATROL: ${{ secrets.SLACK_WEBHOOK_PATROL }}
```

### 5.3 data-loader.js の修正 — ホスト動的化

#### 変更概要

- `HOST_COUNTRIES` 定数を**削除**
- `HOST_INFO` オブジェクトを**削除**
- `hosts.json` を動的に fetch して判定する

#### 修正後の `loadHostSection()`

```js
async function loadHostSection() {
  const container = document.getElementById('host-section');
  if (!container) return;

  const slug   = document.body.dataset.country || 'london';
  const nameJa = COUNTRY_NAME_JA[slug] || slug;

  // hosts.json を取得
  let hosts = [];
  try {
    const res = await fetch(`${window.WAMILY_BASE || './'}data/hosts.json`);
    if (res.ok) hosts = await res.json();
  } catch (e) {
    console.warn('hosts.json の取得に失敗:', e);
  }

  const host = hosts.find(h => h.slug === slug);

  const INQUIRY_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScEBeQA3p8bZOm3Wd-H1v5QUz5A-8AjCmgMo6E9g5yZsUgs3g/viewform';
  const RECRUIT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScyoeAMB3YqqreMo7KFWjQnlMfPF0RqDmOmhtV5DjCeGM7FqA/viewform';

  if (host) {
    // ホストあり国 — 既存のホストカードHTML生成ロジックをそのまま使用
    // host.nickname, host.catchphrase, host.intro を参照
    const catchphraseHtml = host.catchphrase
      ? `<p class="host-card-catchphrase">「${host.catchphrase}」と、僕は呼んでいます。</p>`
      : '';
    const introHtml = host.intro
      ? `<blockquote class="ed-voice-quote"><p>${host.intro}</p><cite>— サワディー</cite></blockquote>`
      : '';

    container.innerHTML = `
      <div class="host-card">
        <div class="host-card-icon">${hostSvgIcon()}</div>
        <h3>${nameJa}には素敵なWamilyホストがいます</h3>
        <p class="host-card-name">${host.nickname}</p>
        ${catchphraseHtml}
        ${introHtml}
        <a href="${INQUIRY_FORM_URL}" target="_blank" class="host-card-cta">
          ホストに相談してみる
        </a>
      </div>
    `;
  } else {
    // ホストなし国 — 募集カード（既存ロジックと同じ）
    container.innerHTML = `
      <div class="host-recruit-card">
        <div class="host-card-icon">${hostSvgIcon()}</div>
        <h3>${nameJa}に住む日本人家族の方へ</h3>
        <p>あなたの「住んでいるからこそ知っている情報」が、誰かの家族旅行を変えるかもしれません。</p>
        <a href="${RECRUIT_FORM_URL}" target="_blank" class="host-recruit-cta">
          Wamilyホストに応募する
        </a>
      </div>
    `;
  }
}
```

**注意:** `loadHostSection()` を `async function` に変更するため、呼び出し元の `DOMContentLoaded` リスナー内でも `await` するか、`.catch()` でエラーをハンドリングする。

### 5.4 scripts/host-reminder.js（新規作成）

ホストとの定期連絡リマインドおよび新規ホストのプロフィール自動生成。

#### 実行方法

```bash
node scripts/host-reminder.js
```

#### 処理フロー

```
1. Notion ホストDB から全ホストを取得（ステータス ≠ 退会）

2. リマインダー判定:
   a. 各ホストの 最終連絡日 と リマインド間隔 を確認
   b. 経過日数 >= リマインド間隔 → 連絡ドラフトをClaude APIで生成
   c. #community-host に通知

3. 新規ホストプロフィール生成:
   a. ステータス = 審査中 AND 紹介文が空のホストを抽出
   b. Claude APIでプロフィール（紹介文 + キャッチフレーズ）を生成
   c. Notion ホストDBの該当ページに書き込み
   d. #community-host に通知
```

#### Claude API プロンプト（連絡ドラフト生成）

```js
const CONTACT_DRAFT_PROMPT = `あなたはWamilyオーナーの「サワディー」です。
Wamilyは子連れ家族向け海外旅行ガイドブックサイトで、現地在住の日本人家族が「Wamilyホスト」として旅する家族を助けています。

以下のホストへの定期連絡メッセージを書いてください。

ホスト情報:
- ニックネーム: {nickname}
- 在住国: {country}
- 在住歴: {years}
- 家族構成: {family}
- 前回の連絡メモ: {lastNote}

ルール:
- サワディーの口調で書く（カジュアルだけど丁寧、居酒屋の常連に話しかけるような温かさ）
- 営業臭くしない。「何かお願い」ではなく「元気？最近どう？」のスタンス
- 200文字以内
- LINEメッセージを想定（メールではない）
- 季節の話題や子どもの成長に触れると自然`;
```

#### Claude API プロンプト（プロフィール生成）

```js
const PROFILE_GENERATE_PROMPT = `あなたはWamilyオーナーの「サワディー」です。
新しくWamilyホストに応募してくれた方のプロフィールを作成してください。

応募者情報:
- 名前: {name}
- 在住国: {country}
- 家族構成: {family}
- 子どもの年齢: {kidsAge}
- 在住歴: {years}
- フォーム回答（自由記述）: {formResponse}

参考: 既存ホストの紹介文のトーン
- 「ロンドン親子旅の図書館」と、僕は呼んでいます。
- 「マニラの太陽みたいな家族」と、僕は呼んでいます。
- 「ハワイのお母さん」と、僕は呼んでいます。

以下の2つを生成してください:
1. キャッチフレーズ（15文字以内）: 「〇〇」と、僕は呼んでいます。の「〇〇」部分
2. 紹介文（100〜150文字）: サワディーがその人を温かく紹介する文章。スペック説明ではなく、その人の魅力が伝わる表現で。

JSON形式で返してください:
{ "catchphrase": "...", "intro": "..." }`;
```

#### Slack通知形式

**リマインダー:**
```
🔔 [コミュニティ部] ホストリマインダー
Miyukiさん（ロンドン）— 最終連絡から35日経過

📝 連絡ドラフト:
「Miyukiさん、こんにちは！ロンドンもそろそろ春本番ですね。
お子さん元気にしてますか？最近のロンドン親子事情、また教えてください〜」

→ Notionで確認: https://notion.so/xxx
```

**新規プロフィール生成:**
```
✨ [コミュニティ部] 新規ホストプロフィール生成
田中さん（バンコク）のプロフィールを自動生成しました

キャッチフレーズ: 「バンコクの冒険隊長」
紹介文: 「バンコクで3人の子どもを育てながら...」

⚠️ サワディーの確認後、ステータスを「アクティブ」に変更してください
→ Notionで確認: https://notion.so/xxx
```

#### 環境変数

```
NOTION_API_KEY          — Notion API
NOTION_HOST_DB_ID       — ホストDB ID
ANTHROPIC_API_KEY       — Claude API（プロフィール生成・ドラフト生成）
SLACK_WEBHOOK_COMMUNITY_HOST — Slack通知
```

#### 安全設計

- **プロフィール生成は自動、公開は手動。** Claudeが生成した紹介文はNotionに書き込まれるが、ステータスは「審査中」のまま。サワディーがNotionで確認し「アクティブ」に変更するまでサイトには表示されない
- **連絡ドラフトはSlack通知のみ。** 自動送信はしない。サワディーがドラフトを参考にLINEで連絡する
- **Claude APIエラー時:** スキップしてconsole.errorに出力。次回実行時に再試行される

---

## 6. Notionダッシュボード

### scripts/update-dashboard.js（新規作成）

週次実行。各Notion DBと GA4 から集計データを取得し、Notionダッシュボードページに書き込む。

#### 処理フロー

```
1. 各DBから集計:
   a. 購読者DB → アクティブ購読者数
   b. 旅のバトンDB → 総投稿数
   c. スポットDB → 国別スポット数
   d. キュレーションDB → 国別キュレーション数
   e. ホストDB → 国別アクティブホスト数

2. GA4 Data API:
   a. 過去7日間: PV、ユーザー、セッション
   b. 過去30日間: 同上（月間参考値）

3. Notionダッシュボードページのブロックを全削除 → 新しいブロックで置換
```

#### Notionページの内容構成

```markdown
# Wamily ダッシュボード
最終更新: 2026-04-08 10:00 JST

## アクセス（GA4）
| 期間 | PV | ユーザー | セッション |
|---|---|---|---|
| 過去7日 | 1,234 | 567 | 890 |
| 過去30日 | 4,567 | 2,345 | 3,456 |

## コミュニティ
| 指標 | 数値 |
|---|---|
| メルマガ購読者 | 103人 |
| 旅のバトン | 12件 |
| アクティブホスト | 3人 |

## スポット（国別）
| 国 | スポット数 | キュレーション数 | ホスト |
|---|---|---|---|
| ロンドン | 43 | 5 | Miyukiさん |
| 台北 | 14 | 3 | — |
| パリ | 22 | 4 | — |
| ストックホルム | 20 | 2 | — |
| シンガポール | 10 | 2 | — |
| バンコク | 11 | 2 | — |
| マニラ | 10 | 2 | Kanaさん |
| LA | 10 | 2 | — |
| ハワイ | 15 | 3 | Miyaさん |
| ソウル | 10 | 2 | — |
```

#### Notion API でのページ更新

```js
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// 1. 既存ブロックを全削除
const existingBlocks = await notion.blocks.children.list({
  block_id: process.env.NOTION_DASHBOARD_PAGE_ID,
});
for (const block of existingBlocks.results) {
  await notion.blocks.delete({ block_id: block.id });
}

// 2. 新しいブロックを追加
await notion.blocks.children.append({
  block_id: process.env.NOTION_DASHBOARD_PAGE_ID,
  children: [
    // heading_2, table, paragraph などのブロック配列
  ],
});
```

#### 環境変数

```
NOTION_API_KEY               — Notion API
NOTION_DASHBOARD_PAGE_ID     — ダッシュボードページ ID
NOTION_SPOTS_DB_ID           — スポットDB ID
NOTION_CURATION_DB_ID        — キュレーションDB ID
NOTION_HOST_DB_ID            — ホストDB ID
NEWSLETTER_SUBSCRIBERS_DB_ID — 購読者DB ID
NOTION_BATON_DB_ID           — 旅のバトンDB ID
GA4_PROPERTY_ID              — GA4 プロパティID
GA4_CREDENTIALS              — GA4 サービスアカウント鍵（base64）
SLACK_WEBHOOK_COMMUNITY_USER — Slack通知
```

---

## 7. ワークフロー: `.github/workflows/community.yml`（新規作成）

```yaml
name: Community
on:
  schedule:
    - cron: '30 0 * * *'   # 毎日 09:30 JST（日次）
    - cron: '0 1 * * 1'    # 毎週月曜 10:00 JST（週次）
  workflow_dispatch:
    inputs:
      weekly_report:
        description: '週次レポートを実行する'
        required: false
        type: boolean
        default: false

jobs:
  daily:
    runs-on: ubuntu-latest
    if: github.event.schedule == '30 0 * * *' || (github.event_name == 'workflow_dispatch' && !inputs.weekly_report)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd scripts && npm ci

      - name: Community daily report
        run: node scripts/community-report.js --daily
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_BATON_DB_ID: ${{ secrets.NOTION_BATON_DB_ID }}
          NEWSLETTER_SUBSCRIBERS_DB_ID: ${{ secrets.NEWSLETTER_SUBSCRIBERS_DB_ID }}
          SLACK_WEBHOOK_COMMUNITY_USER: ${{ secrets.SLACK_WEBHOOK_COMMUNITY_USER }}

      - name: Host reminder
        run: node scripts/host-reminder.js
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_HOST_DB_ID: ${{ secrets.NOTION_HOST_DB_ID }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_WEBHOOK_COMMUNITY_HOST: ${{ secrets.SLACK_WEBHOOK_COMMUNITY_HOST }}

      - name: Commit state files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/.community-last-check.json data/.milestone-state.json
          git diff --staged --quiet || git commit -m "chore: update community state files"
          git push

  weekly:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 1 * * 1' || (github.event_name == 'workflow_dispatch' && inputs.weekly_report)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd scripts && npm ci

      - name: Community weekly report
        run: node scripts/community-report.js --weekly
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_BATON_DB_ID: ${{ secrets.NOTION_BATON_DB_ID }}
          NEWSLETTER_SUBSCRIBERS_DB_ID: ${{ secrets.NEWSLETTER_SUBSCRIBERS_DB_ID }}
          GA4_PROPERTY_ID: ${{ secrets.GA4_PROPERTY_ID }}
          GA4_CREDENTIALS: ${{ secrets.GA4_CREDENTIALS }}
          SLACK_WEBHOOK_COMMUNITY_USER: ${{ secrets.SLACK_WEBHOOK_COMMUNITY_USER }}

      - name: Update dashboard
        run: node scripts/update-dashboard.js
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NOTION_DASHBOARD_PAGE_ID: ${{ secrets.NOTION_DASHBOARD_PAGE_ID }}
          NOTION_SPOTS_DB_ID: ${{ secrets.NOTION_SPOTS_DB_ID }}
          NOTION_CURATION_DB_ID: ${{ secrets.NOTION_CURATION_DB_ID }}
          NOTION_HOST_DB_ID: ${{ secrets.NOTION_HOST_DB_ID }}
          NEWSLETTER_SUBSCRIBERS_DB_ID: ${{ secrets.NEWSLETTER_SUBSCRIBERS_DB_ID }}
          NOTION_BATON_DB_ID: ${{ secrets.NOTION_BATON_DB_ID }}
          GA4_PROPERTY_ID: ${{ secrets.GA4_PROPERTY_ID }}
          GA4_CREDENTIALS: ${{ secrets.GA4_CREDENTIALS }}
          SLACK_WEBHOOK_COMMUNITY_USER: ${{ secrets.SLACK_WEBHOOK_COMMUNITY_USER }}

      - name: Commit state files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/.community-last-check.json data/.milestone-state.json
          git diff --staged --quiet || git commit -m "chore: update community state files"
          git push
```

---

## 8. 実装ファイル一覧

### 新規ファイル（9ファイル）

| ファイル | 推定行数 | 概要 |
|---|---|---|
| `scripts/lib/ga4-client.js` | ~40 | GA4 Data API ヘルパーモジュール |
| `scripts/community-report.js` | ~250 | ユーザーコミュニティ日次/週次レポート |
| `scripts/host-reminder.js` | ~200 | ホストリマインダー + プロフィール自動生成 |
| `scripts/update-dashboard.js` | ~180 | Notionダッシュボード週次更新 |
| `.github/workflows/community.yml` | ~90 | コミュニティ部ワークフロー |
| `data/.community-last-check.json` | ~3 | バトンチェック日時ステートファイル |
| `data/.milestone-state.json` | ~4 | マイルストーン到達値ステートファイル |
| `data/hosts.json` | ~30 | ホスト公開情報（fetch-notion.jsが生成） |
| `docs/ai-teams/community.md` | ~60 | コミュニティ部 運用ガイド |

### 修正ファイル（5ファイル）

| ファイル | 変更内容 |
|---|---|
| `scripts/lib/slack-notify.js` | `CHANNEL_MAP` に `community_user`, `community_host` 追加 |
| `scripts/package.json` | `googleapis` 依存追加 |
| `scripts/fetch-notion.js` | `fetchHosts()` 追加 + main()に呼び出し追加 |
| `js/data-loader.js` | `HOST_COUNTRIES`/`HOST_INFO` 削除 → `hosts.json` 動的読み込み |
| `.github/workflows/sync.yml` | fetch-notion ステップに `NOTION_HOST_DB_ID` env追加 |

---

## 9. 実装順序

各ステップは前のステップが完了してから着手する（依存関係あり）。

### Step 1: Phase 1 動作確認
1. Phase 1 のSlack通知が正常に動いていることを確認
2. `scripts/lib/slack-notify.js` が存在することを確認

### Step 2: 共通基盤の拡張
1. `slack-notify.js` に `community_user`, `community_host` を追加
2. `cd scripts && npm install googleapis`
3. `scripts/lib/ga4-client.js` を作成

### Step 3: ホスト動的化（fetch-notion.js + data-loader.js）
1. `fetch-notion.js` に `fetchHosts()` を追加
2. ローカルテスト: `NOTION_HOST_DB_ID=xxx node scripts/fetch-notion.js` で `data/hosts.json` が生成されることを確認
3. `data-loader.js` の `HOST_COUNTRIES`/`HOST_INFO` を削除し、`hosts.json` 動的読み込みに変更
4. ブラウザでホストカードが表示されることを確認

### Step 4: コミュニティ部（user）
1. `scripts/community-report.js` を作成
2. ローカルテスト: `--daily` モードでバトンDB読み取り確認
3. ローカルテスト: `--weekly` モードでGA4レポート確認（GA4未設定時のフォールバック含む）

### Step 5: コミュニティ部（host）
1. `scripts/host-reminder.js` を作成
2. ローカルテスト: リマインダー判定とClaude APIドラフト生成を確認
3. ローカルテスト: 新規ホストのプロフィール自動生成を確認

### Step 6: Notionダッシュボード
1. `scripts/update-dashboard.js` を作成
2. ローカルテスト: ダッシュボードページにデータが書き込まれることを確認

### Step 7: ワークフロー
1. `.github/workflows/community.yml` を作成
2. `sync.yml` に `NOTION_HOST_DB_ID` を追加
3. `workflow_dispatch` で手動トリガーテスト

### Step 8: 運用ドキュメント
1. `docs/ai-teams/community.md` を作成

---

## 10. テスト・検証計画

### ローカルテスト

| テスト | コマンド | 期待結果 |
|---|---|---|
| GA4クライアント | `GA4_PROPERTY_ID=xxx GA4_CREDENTIALS=xxx node -e "const {createGA4Client,runReport}=require('./scripts/lib/ga4-client'); ..."` | GA4レポートデータが取得できる |
| コミュニティ日次 | `NOTION_API_KEY=xxx NOTION_BATON_DB_ID=xxx NEWSLETTER_SUBSCRIBERS_DB_ID=xxx node scripts/community-report.js --daily` | バトンDB読み取り + マイルストーン判定がコンソールに出力 |
| コミュニティ週次 | 上記 + `GA4_PROPERTY_ID` + `GA4_CREDENTIALS` + `--weekly` | GA4 + Notion集計がコンソールに出力 |
| GA4未設定時 | GA4環境変数なしで `--weekly` | GA4セクションスキップ、Notion集計のみ出力、エラーなし |
| ホストリマインダー | `NOTION_API_KEY=xxx NOTION_HOST_DB_ID=xxx ANTHROPIC_API_KEY=xxx node scripts/host-reminder.js` | リマインド対象の判定 + Claude APIドラフトがコンソールに出力 |
| ダッシュボード更新 | 全環境変数設定 + `node scripts/update-dashboard.js` | Notionダッシュボードページに集計表が表示される |
| hosts.json生成 | `NOTION_HOST_DB_ID=xxx node scripts/fetch-notion.js` | `data/hosts.json` にアクティブホストのみ出力 |

### 回帰テスト

- `SLACK_WEBHOOK_COMMUNITY_*` 環境変数を全て未設定の状態で、全スクリプトを実行
- **結果:** 従来通りコンソール出力のみで正常動作すること（Slack通知はスキップされる）
- `NOTION_HOST_DB_ID` 未設定で `fetch-notion.js` を実行
- **結果:** 既存のフィード・スポット・キュレーション同期は正常動作、ホストのみスキップ

### 障害シミュレーション

| シナリオ | 手順 | 期待結果 |
|---|---|---|
| GA4認証エラー | `GA4_CREDENTIALS` に不正な値を設定 | GA4セクションスキップ、Notion集計のみレポート |
| Claude APIエラー | `ANTHROPIC_API_KEY` を無効値に | プロフィール生成スキップ、console.error出力、次回再試行 |
| Notionダッシュボード書き込みエラー | `NOTION_DASHBOARD_PAGE_ID` に不正IDを設定 | エラーログ出力、ワークフロー自体は完了 |
| hosts.json 未生成時 | `data/hosts.json` を削除 | data-loader.js がフォールバック（全国募集カード表示） |

### GitHub Actions テスト

1. 全変更をコミット & プッシュ
2. `workflow_dispatch` で `community.yml` を手動トリガー（日次モード）
3. `#community-user` と `#community-host` に通知が届くことを確認
4. `workflow_dispatch` で `community.yml` を手動トリガー（`weekly_report: true`）
5. 週次レポートとダッシュボード更新を確認

---

## 11. 付録

### 新規セッション用の初動プロンプト

```
docs/ai-teams-phase2-spec.md を読んで、Wamily AI カンパニー Phase 2 を実装してください。

前提:
- Phase 1（パトロール・コンテンツ・メルマガ）は実装・稼働済みです
- Slack に #community-user と #community-host チャンネルを追加済みです
- GA4 プロパティ作成 + gtag.js を全ページに貼付済みです
- Notion ホストDB を作成し、既存3ホストを手動登録済みです
- Notion ダッシュボードページを作成済みです
- GitHub Secrets に全7つ登録済みです

実装順序は仕様書の「セクション9」に従ってください。
```

### GitHub Actions スケジュール一覧（Phase 2 追加後）

| ワークフロー | cron | JST | 備考 |
|---|---|---|---|
| sync.yml | `0 0 * * *` | 毎日 09:00 | 既存 |
| newsletter.yml | `0 22 * * 0` | 毎週月曜 07:00 | 既存 |
| newsletter-announce.yml | `0 23 * * *` | 毎日 08:00 | 既存 |
| newsletter-sequence.yml | `30 22 * * *` | 毎日 07:30 | Phase 1 |
| **community.yml（日次）** | `30 0 * * *` | **毎日 09:30** | **Phase 2** |
| **community.yml（週次）** | `0 1 * * 1` | **毎週月曜 10:00** | **Phase 2** |

### Notion DB ID リファレンス

| DB名 | 環境変数名 | ID |
|---|---|---|
| 最近の動きDB | `NOTION_LIVEFEED_DB_ID` | GitHub Secrets参照 |
| スポットDB | `NOTION_SPOTS_DB_ID` | `61864001-cf96-4afb-b7f2-94b07cd445a1` |
| キュレーションDB | `NOTION_CURATION_DB_ID` | `4f146e35-f680-46e1-acf2-8e4cc86851fb` |
| メルマガ購読者DB | `NEWSLETTER_SUBSCRIBERS_DB_ID` | `4cb8342e-d95d-44bb-894d-0b882eba6e99` |
| メルマガお知らせDB | — | `8735e684-62ce-47b1-8fb4-fd99e9a0725e` |
| 旅のバトンDB | `NOTION_BATON_DB_ID` | `0d873caad48d4cf7aa841312ee9d5a3b` |
| ホストDB | `NOTION_HOST_DB_ID` | **新規作成（セクション2参照）** |
| ダッシュボードページ | `NOTION_DASHBOARD_PAGE_ID` | **新規作成（セクション2参照）** |
