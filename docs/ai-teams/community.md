# コミュニティ部 — 運用ガイド

## 概要

Phase 2 で追加されたチーム。ユーザーエンゲージメント分析とホストリレーション管理を担当。

## チーム構成

| サブチーム | 担当 | Slackチャンネル |
|---|---|---|
| コミュニティ部（user） | GA4レポート・マイルストーン通知 | `#community-user` |
| コミュニティ部（host） | ホストリマインダー・プロフィール自動生成 | `#community-host` |

## スケジュール

| モード | cron | JST | 内容 |
|---|---|---|---|
| 日次 | `30 0 * * *` | 毎日 09:30 | バトン通知 + マイルストーン + ホストリマインダー |
| 週次 | `0 1 * * 1` | 毎週月曜 10:00 | GA4レポート + Notionダッシュボード更新 |

## スクリプト

| ファイル | 用途 |
|---|---|
| `scripts/community-report.js --daily` | 日次: バトン通知 + マイルストーン判定 |
| `scripts/community-report.js --weekly` | 週次: GA4 + Notion集計レポート |
| `scripts/host-reminder.js` | ホストリマインダー + プロフィール自動生成 |
| `scripts/update-dashboard.js` | Notionダッシュボード週次更新 |
| `scripts/lib/ga4-client.js` | GA4 Data API ヘルパー |

## マイルストーン閾値

購読者数・バトン投稿数ともに: 10 / 25 / 50 / 100 / 250 / 500 / 1000

## ホスト運用フロー

1. 応募 → GAS がフォーム回答を Notion ホストDB に保存（ステータス: 審査中）
2. `host-reminder.js` が紹介文・キャッチフレーズを Claude API で自動生成
3. サワディーが Notion で確認 → ステータスを「アクティブ」に変更
4. `fetch-notion.js` が `hosts.json` を生成 → サイトにホストカード表示

## 安全設計

- プロフィール生成は自動、**公開は手動**（サワディーが「アクティブ」に変更するまで非表示）
- 連絡ドラフトは Slack 通知のみ（自動送信しない）
- GA4 未設定時は GA4 セクションをスキップ（エラーにならない）
- 全環境変数が未設定でもスクリプトは正常終了する

## ステートファイル

| ファイル | 内容 |
|---|---|
| `data/.community-last-check.json` | 最終チェック日時 |
| `data/.milestone-state.json` | 到達済みマイルストーン値 |

## 手動実行

```bash
# 日次テスト
NOTION_API_KEY=xxx NOTION_BATON_DB_ID=xxx NEWSLETTER_SUBSCRIBERS_DB_ID=xxx \
  node scripts/community-report.js --daily

# 週次テスト
NOTION_API_KEY=xxx GA4_PROPERTY_ID=xxx GA4_CREDENTIALS=xxx \
  NOTION_BATON_DB_ID=xxx NEWSLETTER_SUBSCRIBERS_DB_ID=xxx \
  node scripts/community-report.js --weekly

# ホストリマインダーテスト
NOTION_API_KEY=xxx NOTION_HOST_DB_ID=xxx ANTHROPIC_API_KEY=xxx \
  node scripts/host-reminder.js

# ダッシュボード更新テスト
NOTION_API_KEY=xxx NOTION_DASHBOARD_PAGE_ID=xxx \
  NOTION_SPOTS_DB_ID=xxx NOTION_CURATION_DB_ID=xxx \
  NOTION_HOST_DB_ID=xxx NEWSLETTER_SUBSCRIBERS_DB_ID=xxx \
  NOTION_BATON_DB_ID=xxx \
  node scripts/update-dashboard.js
```

## GitHub Actions 手動トリガー

- 日次: Actions → Community → Run workflow（デフォルト）
- 週次: Actions → Community → Run workflow → `weekly_report: true`
