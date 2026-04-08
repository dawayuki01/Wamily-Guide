# パトロール部 運用ガイド

## 概要

Wamilyの自動化パイプライン（sync.yml）を監視し、異常をSlackで報告する。

## Slackチャンネル

`#patrol` — 全スクリプトの実行結果 + 日次ヘルスチェック

## 通知パターン

| アイコン | 意味 | 対応 |
|---|---|---|
| 🟢 | 正常完了 | なし |
| ⚠️ | 警告あり | 内容を確認、緊急でなければ次回実行で解消されることが多い |
| 🔴 | エラー | 即座に確認。スクリプトの失敗 or データ異常 |

## 通知元スクリプト

| スクリプト | 通知内容 |
|---|---|
| `generate-guide.js` | コンテンツ生成の成否 |
| `fetch-notion.js` | Notion同期の成否 |
| `fetch-events.js` | イベント更新の成否 + 国数 |
| `fetch-mymaps.js` | 新規スポット追加（0件ならスキップ） |
| `check-spots.js` | 営業状況チェック + 閉業検知 |
| `health-check.js` | 全ファイル健全性 + ステップ結果サマリー |

## ヘルスチェックの検証内容

- 全32データファイル（live-feed + spots*10 + curation*10 + events*10 + history）
- 各ファイルのJSON構造・必須フィールド・updatedAt鮮度
- スポット数の異常変動（前回比20%以上で警告）
- 閉業スポットの自動検知 + Notion自動更新

## 自動修復

- **閉業スポット:** `check-spots.js` が検知 → JSONファイル + Notion DB 両方を自動更新
- **その他:** 通知のみ（手動対応）

## 自動検知できないもの（手動チェック推奨）

以下はヘルスチェックでは検知できない。サイト公開後、定期的に手動確認を推奨。

- **フォーム送信のE2Eテスト:** メルマガ登録・旅のバトンフォームが正しく動作し、成功メッセージが表示されるか
- **CSSセレクタの一意性:** 同一ページ内で同じクラス名が競合していないか
- **GAS連携のレスポンス:** GAS Web Appのリダイレクトレスポンスをフロントエンドが正しく処理しているか

## トラブルシューティング

1. `#patrol` にエラー通知が来た場合:
   - GitHub Actions のログを確認: https://github.com/dawayuki01/Wamily-Guide/actions/workflows/sync.yml
   - `workflow_dispatch` で手動再実行

2. 通知が来ない場合:
   - `SLACK_WEBHOOK_PATROL` の設定を確認
   - Webhook URLが有効か Slack App管理画面で確認
