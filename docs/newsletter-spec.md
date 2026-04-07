# Wamily Letter（メルマガ）実装仕様書

> **このドキュメントの目的**: 新しいClaudeセッションがこのファイルを読むだけで、メルマガシステムの構築を開始できるようにする。

---

## 1. プロダクト概要

| 項目 | 内容 |
|---|---|
| 名称 | **Wamilyの手紙**（Wamily Letter） |
| 対象 | サイト登録者（フレンズ） |
| 配信頻度 | **週1回（毎週月曜 朝7:00 JST）** |
| コンセプト | 世界の英語メディアから「旅と家族」の種を選んで届けるキュレーションレター |
| トーン | サワダの視点で語る。押しつけない。一緒に考えている感じ |

### コピー（サイト掲載済み — connect/index.html）
```
Wamilyの手紙

毎週、親子での海外旅行にまつわるカルチャーやトレンドをキュレーションしてお届けします。
「こういうのが来てる」「こんな動きがある」を、Wamilyの視点でまとめたメルマガです。
新しい国の追加やイベントのお知らせも、このメルマガを通じてお届けします。
```

---

## 2. テストケースからの学び

### テストケースの構成（/Users/sawadatomoyuki/Documents/Wamily）
テストケースは **Next.js + Vercel + Resend + Supabase** で構築済み。稼働実績あり。

| コンポーネント | テストケースの技術 | ファイル |
|---|---|---|
| 配信サービス | **Resend**（無料枠: 100通/日, 3,000通/月） | — |
| メール送信 | Resend SDK（`resend.emails.send()`） | `src/app/api/newsletter/curated/route.ts` |
| RSS収集 | fast-xml-parser + fetch | `src/lib/rss/fetcher.ts` |
| RSSソース | Layer1: 編集媒体6件 + Layer2: Google News 4キーワード | `src/lib/rss/sources.ts` |
| AIキュレーション | Claude claude-haiku-4-5（記事選定＋日本語化＋コメント生成） | `src/lib/claude/curated-prompt.ts` |
| HTMLテンプレート | CREAスタイル準拠のインライン CSS テーブルレイアウト | `src/lib/email/curated-template.ts` |
| 購読者管理 | Supabase `waitlist_emails` テーブル | migration 0002 |
| 配信ログ | Supabase `curated_issues` テーブル | migration 0003 |
| 配信停止 | `/api/newsletter/unsubscribe?token=xxx`（is_active=false に更新） | `src/app/api/newsletter/unsubscribe/route.ts` |
| Cron実行 | Vercel Cron（`0 0 * * *` = 毎日9:00 JST） | `vercel.json` |
| ドメイン認証 | `send.tomoyukisawada.com`（Squarespace DNS） | Resend ダッシュボード |
| 送信元 | `Wamily <hello@send.tomoyukisawada.com>` | `.env.local` |

### テストケースの評価と改善点

| # | テストケースの状態 | 改善方針 |
|---|---|---|
| ❶ | 毎日配信 → 記事内容が重複する | **週1回（月曜朝7:00 JST）**に変更 |
| ❷ | 3〜4記事でボリューム少ない | **5〜7記事**に増量 |
| ❸ | 配信頻度が毎日 | 週1回に変更（上記❶と同じ） |
| ❹ | RSSソースが6媒体+4キーワードのみ | **ソース拡張**（下記「RSSソース拡張」参照） |

### テストケースからそのまま踏襲するもの
- **Resend** を配信サービスとして使用（無料枠で十分）
- **Claude claude-haiku-4-5** でキュレーション（コスト安・品質十分）
- **HTMLテンプレート構成**（CREAスタイル → Wamily-Guideスタイルに変更）
- **配信停止の仕組み**（トークンベースの is_active フラグ）
- **RSS → Claude → HTML → Resend** のパイプライン構成
- **ロブスタースタイル**のキュレーション形式（記事サマリー＋サワダのコメント）

---

## 3. Wamily-Guide への実装方針

### 技術的な違い（テストケース vs 本番）

| 項目 | テストケース（Wamily） | 本番（Wamily-Guide） |
|---|---|---|
| フレームワーク | Next.js + Vercel | **GitHub Pages（静的サイト）** |
| バックエンド | Next.js API Routes | **GitHub Actions** |
| DB | Supabase | **Notion DB** or **JSONファイル** |
| Cron | Vercel Cron | **GitHub Actions cron** |
| スタイル | CREAスタイル | **Wamilyスタイル**（WAMILY_DESIGN_SPEC.md 準拠） |

### 重要な設計判断
Wamily-Guide は静的サイト（GitHub Pages）なので、Next.js API Routes は使えない。
代わりに **GitHub Actions** をバックエンドとして使い、以下の構成にする：

```
毎週月曜 7:00 JST（GitHub Actions cron）
  ↓
scripts/newsletter.js
  ① RSS フィード収集（fetch + fast-xml-parser）
  ② Claude claude-haiku-4-5 でキュレーション（Anthropic SDK）
  ③ HTML メール生成（テンプレート）
  ④ Resend API で配信
  ⑤ 送信ログ保存（Notion or JSON）
```

### フォルダ構成（追加分）

```
Wamily-Guide/
├── scripts/
│   ├── newsletter.js            ← NEW: メルマガ配信メインスクリプト
│   ├── newsletter/
│   │   ├── rss-sources.js       ← NEW: RSSソース定義
│   │   ├── rss-fetcher.js       ← NEW: RSS取得・正規化
│   │   ├── curate-prompt.js     ← NEW: Claudeキュレーションプロンプト
│   │   └── email-template.js    ← NEW: HTMLメールテンプレート
│   ├── fetch-notion.js          ← 既存
│   ├── fetch-mymaps.js          ← 既存
│   └── ...
├── .github/workflows/
│   ├── sync.yml                 ← 既存（毎日09:00）
│   └── newsletter.yml           ← NEW: メルマガ専用ワークフロー（毎週月曜07:00）
└── docs/
    └── newsletter-spec.md       ← このファイル
```

---

## 4. 購読者管理

### 方式の選択肢と推奨

| 方式 | メリット | デメリット | 推奨 |
|---|---|---|---|
| **A. Notion DB** | Wamily既存パイプラインと統一。管理画面不要 | Notion API のレート制限 | ✅ 推奨 |
| B. JSON ファイル | シンプル。GitHub で管理 | 個人情報がリポジトリに入る | ❌ |
| C. Supabase | テストケースと同じ | 追加サービス増える | △ |

### Notion DB スキーマ（購読者DB — 新規作成）

| プロパティ | タイプ | 用途 |
|---|---|---|
| メールアドレス | Title | 登録メール |
| ステータス | Select | アクティブ / 停止 |
| 解除トークン | Rich Text | UUID（配信停止用） |
| 登録日 | Date | 登録日時 |
| 登録元 | Select | フレンズページ / 各国ページ / etc. |

### 登録フロー
```
サイトのフォーム（connect/index.html or 各国ページ）
  ↓ fetch POST
GAS（Google Apps Script）
  ↓ Notion API
購読者DB に追加（ステータス: アクティブ / 解除トークン: UUID自動生成）
  ↓ 自動返信メール（任意）
登録完了
```

### 配信停止フロー
```
メール内の「配信停止」リンク
  ↓ GAS GET endpoint
購読者DB のステータスを「停止」に更新
  ↓
停止完了ページにリダイレクト
```

---

## 5. RSSソース拡張

### テストケースのソース（Layer 1 + Layer 2）
```
Layer 1（編集媒体）:
  - The Guardian Travel
  - BBC Travel
  - The Atlantic
  - Wired
  - Reasons to be Cheerful
  - NYT Parenting

Layer 2（Google News キーワード）:
  - family travel trend 2025
  - slow travel family children
  - educational travel children
  - childhood outdoor culture trend
```

### 本番で追加したいソース候補
```
Layer 1 追加候補:
  - Monocle（都市・旅・カルチャー）
  - Kinfolk（スローライフ・家族）
  - TimeOut（都市イベント — London用で実績あり）
  - Condé Nast Traveler（ファミリー旅行）
  - National Geographic Travel
  - Lonely Planet（ファミリー旅行記事）

Layer 2 追加キーワード候補:
  - "family friendly city design"
  - "children urban planning"
  - "cultural exchange family"
  - "expat family life"
  - "international school trend"
  - "multigenerational travel"

日本語ソース候補:
  - note.com の旅行カテゴリ RSS
  - トラベル Watch
  - 子連れ旅行系ブログ（要選定）
```

---

## 6. メールテンプレート

### デザイン方針
テストケースの CREAスタイルから **Wamily-Guide スタイル**に変更：

| 要素 | CREAスタイル（テスト） | Wamilyスタイル（本番） |
|---|---|---|
| 背景 | `#F8F5F1`（クリーム） | `#faf8f4`（Wamily背景） |
| アクセント | `#C8765A`（テラコッタ） | `#2a9d8f`（ティール）+ `#e4a853`（マスタード） |
| テキスト | `#1C1C1C` | `#2c2c2c`（Wamily本文色） |
| フォント | Georgia, serif | Noto Serif JP / Noto Sans JP |
| ロゴ | `Wamily`（Georgia italic） | `Wamily`（Noto Serif JP） |
| カード角 | 角型（border-radius: 0） | 角丸（border-radius: 12px）|

### テンプレート構成（1通あたり）
```
┌─────────────────────────────────┐
│  Wamily ロゴ          配信日    │
├─────────────────────────────────┤
│  今週のキュレーション           │
│  （リード文）                   │
│  ────────────                   │
│                                 │
│  [CATEGORY] カテゴリ和名        │
│  ■ 記事タイトル（日本語）       │
│  サマリー（3〜4文）             │
│  │ サワダのコメント（3〜4文）   │
│  ソース — 元記事を読む →        │
│  ────────────                   │
│  （× 5〜7記事）                │
│                                 │
├─────────────────────────────────┤
│  [CTA] ガイドブックはこちら →   │
├─────────────────────────────────┤
│  配信停止リンク                 │
│  wamily-guide サイトリンク      │
└─────────────────────────────────┘
```

### カテゴリラベル
| ラベル | 和名 | 内容 |
|---|---|---|
| URBAN LIFE | 都市と暮らし | 都市設計・子育て環境・まちづくり |
| TRAVEL SHIFT | 旅の変化 | 旅のスタイル変化・新しい旅の形 |
| PARENTING | 子育て | 教育・育児・家族のあり方 |
| CULTURE | カルチャー | 食・アート・テクノロジー・社会の動き |

---

## 7. Claudeキュレーション プロンプト

### 基本方針（テストケースから踏襲）
- サワダトモユキの視点で選ぶ
- 「まだマイノリティだが、マジョリティになりつつある現象の種」を優先
- 現地の人のリアルな動き（観光客向け情報は除外）
- 日本にまだ届いていない、でも来そうな匂い
- 政治的・ネガティブすぎる記事は除外

### テストケースからの変更点
- 選択記事数: **3〜4本 → 5〜7本**に増量
- 配信頻度が週1なので「今週」の記事から選ぶニュアンスに
- RSS取得の過去日数: **7日 → 7日**（変更なし、週1なので十分）
- Claude へ渡す最大記事数: **20件 → 40件**（ソース拡張に合わせて）

---

## 8. 予算設計

### Resend 料金プラン

| プラン | 月額 | 送信上限 | 推奨フェーズ |
|---|---|---|---|
| Free | $0 | 100通/日, 3,000通/月 | 〜100人（週1なら月400通で余裕） |
| Pro | $20（約3,000円） | 50,000通/月 | 100人超 or カスタムドメイン必須時 |

### 登録者数シミュレーション

| 登録者数 | 月間送信数（週1） | Resendプラン | 月額コスト |
|---|---|---|---|
| 30人 | 120通 | Free | **¥0** |
| 50人 | 200通 | Free | **¥0** |
| 100人 | 400通 | Free | **¥0** |
| 200人 | 800通 | Free | **¥0** |
| 500人 | 2,000通 | Free | **¥0** |
| 750人 | 3,000通 | Free（上限ギリギリ） | **¥0** |
| 1,000人 | 4,000通 | Pro | **約¥3,000** |

### 結論
- **初期〜中期（〜750人）は完全無料**で運用可能
- 月5,000円の予算があれば、Resend Pro で 50,000通/月まで対応可能
- Claude claude-haiku-4-5 の API コスト: 週1回の呼び出しで月4回 ≒ 月額数円レベル（既にGitHub Secretsに ANTHROPIC_API_KEY 設定済み）

---

## 9. GitHub Actions ワークフロー設計

```yaml
# .github/workflows/newsletter.yml
name: Wamily Letter
on:
  schedule:
    - cron: '0 22 * * 0'  # 月曜 7:00 JST = 日曜 22:00 UTC
  workflow_dispatch:        # 手動実行も可能

jobs:
  send-newsletter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: node scripts/newsletter.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
          NEWSLETTER_SUBSCRIBERS_DB_ID: ${{ secrets.NEWSLETTER_SUBSCRIBERS_DB_ID }}
```

---

## 10. GitHub Secrets（追加分）

| シークレット名 | 用途 | 備考 |
|---|---|---|
| RESEND_API_KEY | Resend メール送信 | テストケースのキーを流用可能 |
| NEWSLETTER_SUBSCRIBERS_DB_ID | Notion 購読者DB ID | 新規作成が必要 |

※ ANTHROPIC_API_KEY / NOTION_API_KEY は既存のものを共用

---

## 11. 既存サイトとの連携ポイント

### 実装済み（UI のみ）
| 場所 | ファイル | 状態 |
|---|---|---|
| フレンズページ メルマガ登録フォーム | `connect/index.html` | HTML/CSSのみ。バックエンド未接続 |
| 各国ページ「メルマガを受け取る」ボタン | `{slug}/index.html` × 10 | `href="#"`。バックエンド未接続 |
| フレンズページ CSSスタイル | `css/connect.css` | `.cn-nl-section` 等 |
| 各国ページ CSSスタイル | `css/style.css` | `.baton-newsletter-btn` |

### 実装が必要なもの
1. **GAS エンドポイント**（メルマガ登録受付 → Notion DB 保存）
2. **JavaScript**（フォーム送信処理 → GAS に POST）
3. **GAS エンドポイント**（配信停止 → Notion DB 更新）
4. **newsletter.js**（RSS → Claude → HTML → Resend 配信）
5. **GitHub Actions ワークフロー**（weekly cron）
6. **Notion 購読者DB** 作成

---

## 12. Resend ドメイン認証（テストケースから流用）

テストケースで認証済み:
- **ドメイン**: `send.tomoyukisawada.com`（Verified）
- **送信元**: `Wamily <hello@send.tomoyukisawada.com>`
- **DNSプロバイダ**: Squarespace

将来 `wamily.jp` を取得した場合は Resend でドメイン追加して切り替え。

---

## 13. テストケースのソースコード参照先

テストケースの全ファイルは以下にある。新セッションで実装時に参照すること：

```
/Users/sawadatomoyuki/Documents/Wamily/
├── src/app/api/newsletter/
│   ├── curated/route.ts          ← メイン配信ロジック（★最重要）
│   ├── unsubscribe/route.ts      ← 配信停止
│   └── send/route.ts             ← AIガイド型（不使用）
├── src/lib/claude/
│   └── curated-prompt.ts         ← キュレーションプロンプト（★最重要）
├── src/lib/email/
│   └── curated-template.ts       ← HTMLテンプレート（★最重要）
├── src/lib/rss/
│   ├── sources.ts                ← RSSソース定義
│   └── fetcher.ts                ← RSSフェッチャー
├── vercel.json                   ← Cron設定
└── CLAUDE.md                     ← テストケース全体の記録
```

---

## 14. 実装チェックリスト

新セッションで以下の順序で実装する：

- [ ] Notion に購読者DB を作成
- [ ] GAS エンドポイント作成（メルマガ登録 → Notion）
- [ ] GAS エンドポイント作成（配信停止 → Notion）
- [ ] connect/index.html のフォームに JS 接続
- [ ] 各国ページの「メルマガを受け取る」ボタンに JS 接続
- [ ] scripts/newsletter/ フォルダ作成（RSS/Claude/Template/Main）
- [ ] テストケースのコードを GitHub Pages 構成に移植
- [ ] RSSソース拡張
- [ ] HTMLテンプレートを Wamily スタイルに変更
- [ ] プロンプト調整（5〜7記事、週1対応）
- [ ] GitHub Secrets に RESEND_API_KEY 追加
- [ ] .github/workflows/newsletter.yml 作成
- [ ] テスト送信（手動実行）
- [ ] 読者体験確認（モバイル・PC）
- [ ] 本番稼働開始
