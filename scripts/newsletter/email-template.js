/**
 * Wamily Letter HTMLメールテンプレート
 * Wamily-Guide スタイル準拠（#faf8f4 / #2a9d8f / #e4a853 / Noto系フォント）
 */

/** カテゴリラベルの日本語補足 */
const CATEGORY_SUB = {
  'URBAN LIFE': '都市と暮らし',
  'TRAVEL SHIFT': '旅の変化',
  'PARENTING': '子育て',
  'CULTURE': 'カルチャー',
};

/**
 * キュレーションメルマガの HTML を生成
 * @param {Object} input
 * @param {string} input.subject
 * @param {string} input.issueDate
 * @param {Array} input.items - CuratedItem[]
 * @param {string} input.unsubscribeUrl
 * @param {string} input.siteUrl
 * @returns {string} HTML文字列
 */
function buildCuratedHtml(input) {
  const { issueDate, items, unsubscribeUrl, siteUrl } = input;

  const itemsHtml = items
    .map((item, index) => {
      const isLast = index === items.length - 1;
      const sub = CATEGORY_SUB[item.category_label] || item.category_label;

      return `
          <!-- ===== ITEM ${index + 1} ===== -->
          <tr>
            <td style="padding: ${index === 0 ? '8px' : '0'} 40px 0;">

              <!-- カテゴリラベル -->
              <div style="margin-bottom: 10px;">
                <span style="font-size: 9px; color: #2a9d8f; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600;">
                  ${item.category_label}
                </span>
                <span style="font-size: 9px; color: #8a8a8a; letter-spacing: 0.06em; margin-left: 6px;">
                  ${sub}
                </span>
              </div>

              <!-- 記事タイトル -->
              <h2 style="margin: 0 0 14px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
                ${item.title_ja}
              </h2>

              <!-- 記事サマリー -->
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
                ${item.summary}
              </p>

              <!-- サワダのコメント -->
              <p style="margin: 0 0 14px 0; font-size: 13px; color: #6b6b6b; line-height: 1.9; font-weight: 300; font-style: italic; padding-left: 14px; border-left: 2px solid #2a9d8f;">
                ${item.comment}
              </p>

              <!-- ソースリンク -->
              <p style="margin: 0 0 28px 0;">
                <a href="${item.url}"
                   style="font-size: 12px; color: #2a9d8f; text-decoration: none; letter-spacing: 0.06em;">
                  ${item.source} — 元記事を読む →
                </a>
              </p>

              ${!isLast ? `
              <!-- 区切り線 -->
              <div style="border-top: 1px solid #e8e4de; margin-bottom: 28px;"></div>
              ` : ''}

            </td>
          </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wamily Letter</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf8f4; font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;">

  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; color: #faf8f4;">
    世界から届いた、まだ日本に来ていない「旅と家族」の種。
  </div>

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf8f4;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Container -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.04);">

          <!-- ===== HEADER ===== -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid #e8e4de;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; letter-spacing: 0.04em;">
                      <span style="color: #2a9d8f;">W</span>amily
                    </div>
                    <div style="font-size: 10px; color: #8a8a8a; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px;">
                      Family Travel Guide
                    </div>
                  </td>
                  <td align="right" style="vertical-align: bottom;">
                    <div style="font-size: 11px; color: #8a8a8a;">${issueDate}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== EYEBROW ===== -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <div style="font-size: 10px; color: #2a9d8f; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px;">
                今週のキュレーション
              </div>
              <p style="margin: 0; font-size: 13px; color: #6b6b6b; line-height: 1.7; font-weight: 300;">
                世界の英語メディアから、まだ日本に届いていない<br>
                「旅と家族」の種を選びました。
              </p>
              <div style="width: 32px; height: 2px; background-color: #e4a853; margin-top: 20px;"></div>
            </td>
          </tr>

          <!-- ===== ITEMS ===== -->
          ${itemsHtml}

          <!-- ===== CTA ===== -->
          <tr>
            <td style="padding: 8px 40px 40px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #2a9d8f; border-radius: 999px;">
                    <a href="${siteUrl}/guidebook/"
                       style="display: block; padding: 14px 28px; color: #FFFFFF; text-decoration: none; font-size: 12px; letter-spacing: 0.1em;">
                      Wamilyのガイドブックはこちら →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== DIVIDER ===== -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e8e4de;"></div>
            </td>
          </tr>

          <!-- ===== FOOTER ===== -->
          <tr>
            <td style="padding: 24px 40px 32px;">
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #8a8a8a; line-height: 1.7;">
                このメールは Wamily Letter の登録者にお送りしています。<br>
                配信停止をご希望の方は
                <a href="${unsubscribeUrl}" style="color: #2a9d8f; text-decoration: none;">こちら</a>
                からお手続きください。
              </p>
              <p style="margin: 0; font-size: 11px; color: #8a8a8a;">
                <a href="${siteUrl}" style="color: #8a8a8a; text-decoration: none;">Wamily Guide</a>
                &nbsp;&middot;&nbsp;
                <a href="https://note.com/tomosawa" style="color: #8a8a8a; text-decoration: none;">note</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { buildCuratedHtml };
