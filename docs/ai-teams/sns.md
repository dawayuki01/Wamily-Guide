# SNS部 運用ガイド

## 概要

Instagram Graph APIを使った週次アナリティクス分析と、コンテンツ生成支援を行う。

## Slackチャンネル

`#sns` — 週次Instagramレポート + トークン期限リマインド

## 通知パターン

| アイコン | 意味 | 対応 |
|---|---|---|
| 📱 | 週次レポート | 確認のみ |
| ⚠️ | トークン期限リマインド（残10日） | 手動でトークン再取得 |
| 🚨 | トークン期限切れ / エラー | 即座に対応 |

## 主要スクリプト

- `scripts/sns-analytics.js` — 週次Instagram分析（community.yml 週次ジョブで実行）

## トークン更新手順

1. Meta Graph API Explorer でLong-lived Tokenを再取得
2. GitHub Secrets の `INSTAGRAM_ACCESS_TOKEN` を更新
3. `node scripts/sns-analytics.js --reset-token-date` を実行

## コンテンツ生成フロー

1. サワディーが写真 + 体験メモを用意
2. Claude Codeセッションでキャプション + ハッシュタグ生成
3. Notion Instagram投稿DB に下書き保存
4. サワディーが確認 → 手動でInstagramに投稿
5. 投稿後、Instagram投稿IDをNotionに記録

## ステートファイル

- `data/.sns-token-state.json` — トークン作成日（期限管理用）
- `data/.sns-followers-state.json` — フォロワー数の推移記録

## 環境変数

| 変数名 | 用途 |
|---|---|
| INSTAGRAM_ACCESS_TOKEN | Graph API Long-lived Token |
| INSTAGRAM_BUSINESS_ACCOUNT_ID | ビジネスアカウント ID |
| NOTION_API_KEY | Notion API |
| NOTION_INSTAGRAM_DB_ID | Instagram投稿DB |
| SLACK_WEBHOOK_SNS | Slack通知 |
