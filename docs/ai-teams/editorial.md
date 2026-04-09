# ガイドブック編集部 運用ガイド

## 概要

国の追加・公開管理、成熟度の自動判定、countries.jsonの一元管理を行う。

## Slackチャンネル

`#editorial` — 週次レポート

## 通知パターン

| アイコン | 意味 | 対応 |
|---|---|---|
| 📝 | 週次レポート | 確認のみ |

## 主要スクリプト

- `scripts/editorial-report.js` — 週次レポート + 成熟度自動判定（community.yml 週次ジョブで実行）
- `scripts/add-country.js` — 新しい国の追加（対話式）

## countries.json

`data/countries.json` で全国データを一元管理。

### ステータス

| ステータス | 意味 |
|---|---|
| `public` | 公開中（サイト・ガイドブックページに表示） |
| `draft` | 準備中（ページは存在するがナビ・カルーセルから非表示） |
| `archived` | アーカイブ（非表示） |

### 成熟度の自動判定ルール

| 成熟度 | 条件 |
|---|---|
| 準備中 | スポット < 5 |
| 基本 | スポット >= 5 AND (ホストなし OR キュレーション < 3) |
| 充実 | スポット >= 15 AND ホストあり AND キュレーション >= 3 |

## 国追加手順

1. `node scripts/add-country.js` を実行（対話形式で情報入力）
2. countries.json に `draft` で自動追加
3. 国フォルダ + テンプレートHTML + 空データファイルが生成
4. Google My Maps にフォルダを手動追加
5. 準備ができたら countries.json の `status` を `"public"` に変更

## 環境変数

| 変数名 | 用途 |
|---|---|
| SLACK_WEBHOOK_EDITORIAL | Slack通知 |
