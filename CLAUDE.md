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

## 作業ルール
- カラーパレット・言葉のトーンはWAMILY_DESIGN_SPEC.mdに従う
- 新機能追加前に設計書のフェーズを確認する
- 作業前にgit commitで現状を保存する

---

## 構築済みの自動化パイプライン（2026年3月〜4月）

### 全体フロー
```
Claude API → Notion DB → GitHub Actions → data/*.json → GitHub Pages
```

毎日09:00 JST（UTC 00:00）に自動実行。月曜のみコンテンツ生成も走る。

### GitHub Actions（.github/workflows/sync.yml）
| ステップ | 内容 | 頻度 |
|---|---|---|
| generate-guide.js | Claude → Notion にフィード・キュレーション自動生成 | 週1（月曜） |
| fetch-notion.js | Notion → data/*.json に同期 | 毎日 |
| fetch-events.js | TimeOut London RSS + Claude → イベント情報 | 毎日 |
| check-spots.js | Google Places → スポット営業状況更新 | 週1（月曜）※未稼働 |

### Notion DB 構成
| DB名 | ID | 用途 |
|---|---|---|
| 最近の動きDB | NOTION_LIVEFEED_DB_ID（GitHub Secrets） | フィード投稿管理 |
| スポットDB | 61864001-cf96-4afb-b7f2-94b07cd445a1 | 全10カ国スポット管理 |
| キュレーションDB | 4f146e35-f680-46e1-acf2-8e4cc86851fb | YouTube/Instagram/ブログ管理 |

各DBに10カ国のビュー（フィルター）を設定済み。

### 対応国（10カ国）
ロンドン / 台湾 / パリ / ストックホルム / シンガポール / バンコク / マニラ / LA / ハワイ / ソウル

### 各国ページ（/{slug}/index.html）
- `<body data-country="{slug}">` で国を識別
- `window.WAMILY_BASE = '../'` でパス解決
- タブ構成：① その国について ② 行く前に ③ スポット ④ 旅のバトン
- 「最近の動き」セクション（id="feed-list"）：各国の投稿のみ最大5件表示
- スポット：data/spots-{slug}.json から動的読み込み
- キュレーション：data/curation-{slug}.json から動的読み込み

### data/*.json ファイル一覧
| ファイル | 生成元 | 内容 |
|---|---|---|
| live-feed.json | Notion最近の動きDB | 全国フィード（10件） |
| spots-{slug}.json | Notionスポット DB | 各国10スポット |
| curation-{slug}.json | Notionキュレーション DB | 各国おすすめコンテンツ |
| events-london.json | TimeOut RSS + Claude | ロンドンイベント |

---

## 次にやること（優先順）

1. **Google Places API キーを取得・設定**（check-spots.js を稼働させる）
   - Google Cloud Console でAPIキー取得
   - GitHub Secrets に `GOOGLE_PLACES_API_KEY` を追加
   - 各スポットに `placeId` を設定すると営業状況が自動更新される

2. **他国のイベント情報を追加**
   - 現状ロンドンのみ対応
   - 各国のイベントRSSまたはClaude生成で補完

3. **サイト導線・表示確認**
   - トップページ国カード → 各国ページのリンク確認
   - スポット・キュレーション表示の最終確認

---

## 重要なURL

| 場所 | URL |
|---|---|
| サイト本番 | https://dawayuki01.github.io/Wamily-Guide/ |
| GitHubリポジトリ | https://github.com/dawayuki01/Wamily-Guide |
| GitHub Actions | https://github.com/dawayuki01/Wamily-Guide/actions/workflows/sync.yml |
| Notionスポット DB | https://notion.so/61864001cf964afbb7f294b07cd445a1 |
| Notionキュレーション DB | https://notion.so/4f146e35f6804 6e1acf28e4cc86851fb |
| Notion Integration設定 | https://www.notion.so/profile/integrations |