# Notion セットアップガイド

Wamily のデータ管理に使用する Notion データベースの構築手順です。

---

## 1. Notion インテグレーションの作成

1. https://www.notion.so/my-integrations にアクセス
2. **「+ 新しいインテグレーション」** をクリック
3. 名前：`Wamily`、関連ワークスペースを選択
4. **「送信」** → 表示された **Internal Integration Secret** をコピー
5. GitHub の Settings → Secrets → Actions に `NOTION_API_KEY` として登録

---

## 2. 最近の動き DB（既存）

既にこの DB がある場合は DB の ID を確認して GitHub Secrets に登録するだけです。

### プロパティ構造

| プロパティ名 | 種別 | 備考 |
|---|---|---|
| 投稿者 | リッチテキスト | 例：サワディー、田中さん |
| 投稿者種別 | セレクト | `owner` / `resident` / `traveler` |
| 国名 | セレクト | 例：🇬🇧 ロンドン、🇹🇼 台湾 |
| 本文 | リッチテキスト | 表示されるテキスト |
| 投稿日 | 日付 | |

### DB ID の取得方法

DB を Notion で開いた URL から取得します：
```
https://www.notion.so/{workspace}/{DB_ID}?v=...
```
`DB_ID`（32文字の英数字）をコピーして `NOTION_LIVEFEED_DB_ID` として登録。

---

## 3. スポット DB（新規作成）

### 作成手順

1. Notion で新規ページを作成
2. `/database` と入力して「テーブルビュー（フルページ）」を選択
3. 以下のプロパティを追加

### プロパティ構造

| プロパティ名 | 種別 | 備考 |
|---|---|---|
| スポット名 | タイトル（デフォルト） | 例：自然史博物館 |
| 国名 | セレクト | 例：ロンドン、台湾 |
| カテゴリ | セレクト | `親子で食べる` / `遊びに行く` / `現地の日常へ` / `いざという時` |
| 層 | セレクト | `vital`（緊急）/ `local`（ローカル）/ `play`（可変） |
| 説明 | リッチテキスト | 1〜2行の説明文 |
| 料金 | チェックボックス | チェックあり＝無料 |
| 絵文字 | リッチテキスト | 例：🦕、🏥、🛒 |
| Google Place ID | リッチテキスト | Google Maps の Place ID（自動営業確認に使用） |

### Google Place ID の調べ方

1. Google Maps で場所を検索
2. URL の `place/` 以降または `0x...` 形式のIDを確認
3. または https://developers.google.com/maps/documentation/places/web-service/place-id で検索

### インテグレーションと DB を接続する

1. DB を開いた状態で右上「…」→「接続を追加」
2. 作成した「Wamily」インテグレーションを選択

### DB ID を GitHub Secrets に登録

URL から ID を取得して `NOTION_SPOTS_DB_ID` として登録。

---

## 4. キュレーション DB（新規作成）

### プロパティ構造

| プロパティ名 | 種別 | 備考 |
|---|---|---|
| 名前 | タイトル（デフォルト） | 例：子連れロンドン旅行 完全ガイド |
| 国名 | セレクト | 例：ロンドン、台湾 |
| タイプ | セレクト | `YouTube` / `Instagram` / `ブログ` |
| 説明 | リッチテキスト | 1〜2行のコメント（サワディーの言葉で） |
| URL | URL | リンク先 |
| 追加日 | 日付 | |

DB を作成後、インテグレーションを接続して `NOTION_CURATION_DB_ID` を登録。

---

## 5. GitHub Secrets への登録まとめ

GitHub リポジトリの **Settings → Secrets and variables → Actions** に以下を追加：

| シークレット名 | 説明 | 必須 |
|---|---|---|
| `NOTION_API_KEY` | Notion インテグレーションのシークレット | ✅ |
| `NOTION_LIVEFEED_DB_ID` | 最近の動き DB の ID | ✅ |
| `NOTION_SPOTS_DB_ID` | スポット DB の ID | 任意 |
| `NOTION_CURATION_DB_ID` | キュレーション DB の ID | 任意 |
| `ANTHROPIC_API_KEY` | Claude API キー（イベントフィルタリング用） | ✅ |
| `GOOGLE_PLACES_API_KEY` | Google Places API キー（営業確認用） | 任意 |

> **注意**: `NOTION_API_KEY` と `NOTION_LIVEFEED_DB_ID` は最低限必要です。
> `SPOTS`・`CURATION` は DB 未作成時はスキップされます。

---

## 6. 動作確認

### 手動で GitHub Actions を実行する

1. GitHub リポジトリ → **Actions** タブ
2. 左メニューから **「Update Wamily Data」** を選択
3. **「Run workflow」** ボタンをクリック
4. ログを確認 → `data/*.json` が更新されてコミットされることを確認

### ローカルでのテスト（APIキーがある場合）

```bash
cd scripts
npm install

# 最近の動きのみテスト
NOTION_API_KEY=xxx NOTION_LIVEFEED_DB_ID=yyy node fetch-notion.js

# イベント取得テスト
ANTHROPIC_API_KEY=xxx node fetch-events.js

# スポット確認テスト（placeId が設定されているスポットのみ更新）
GOOGLE_PLACES_API_KEY=xxx node check-spots.js
```

---

## 7. 自動実行スケジュール

`.github/workflows/update-data.yml` の設定により、毎週日曜 AM3:00 JST に自動実行されます。

- スポットの営業状況が更新される
- Notion に追加した最近の動き・スポット・キュレーションがサイトに反映される
- TimeOut London の最新イベントが自動取得・フィルタリングされる

---

*このドキュメントは Wamily の自動化仕様（WAMILY_DESIGN_SPEC.md セクション7）をもとに作成されました。*
