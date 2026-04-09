# 参謀室 運用ガイド

## 概要

月次業界レポートの自動生成と、壁打ちログのNotionアーカイブを管理する。

## Slackチャンネル

`#strategy` — 月次レポート通知

## 通知パターン

| アイコン | 意味 | 対応 |
|---|---|---|
| 📋 | 月次レポート完了 | Notionで詳細確認 |
| 🚨 | エラー | ログ確認 |

## 主要スクリプト

- `scripts/strategy-report.js` — 月次業界レポート（strategy.yml で毎月1日実行）
- `scripts/save-strategy-note.js` — 壁打ちログ保存ユーティリティ

## 月次レポートの仕組み

1. Notion ウォッチリストDB から企業・キーワード・情報源を取得
2. 企業URLにアクセスしてニュースを確認
3. Claude API で統合分析（企業動向・トレンド・Wamilyへの示唆）
4. Notion 参謀室DB にレポートページとして保存
5. Slack `#strategy` に要約を通知

## 壁打ちログの保存

```bash
node scripts/save-strategy-note.js \
  --type "壁打ちメモ" \
  --title "SNS戦略について" \
  --content "結論: ..."
```

タイプ: `壁打ちメモ` / `意思決定ログ`

## ワークフロー

- `strategy.yml` — 毎月1日 10:00 JST に自動実行
- 手動実行: GitHub Actions の workflow_dispatch

## 環境変数

| 変数名 | 用途 |
|---|---|
| NOTION_API_KEY | Notion API |
| NOTION_STRATEGY_DB_ID | 参謀室DB |
| NOTION_WATCHLIST_DB_ID | ウォッチリストDB |
| ANTHROPIC_API_KEY | Claude API |
| SLACK_WEBHOOK_STRATEGY | Slack通知 |
