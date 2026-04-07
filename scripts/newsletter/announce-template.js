/**
 * Wamily Letter — お知らせ専用 HTML メールテンプレート
 * Notion ページ本文から変換した HTML をそのまま埋め込む
 */

/**
 * お知らせメールの HTML を生成
 * @param {Object} input
 * @param {string} input.issueDate
 * @param {Array} input.announcements - { title, bodyHtml }[]
 * @param {string} input.unsubscribeUrl
 * @param {string} input.siteUrl
 * @returns {string} HTML文字列
 */
function buildAnnounceHtml(input) {
  const { issueDate, announcements, unsubscribeUrl, siteUrl } = input;

  const announcementsHtml = announcements
    .map((a, index) => {
      const isLast = index === announcements.length - 1;
      return `
          <!-- ===== ANNOUNCEMENT ${index + 1} ===== -->
          <tr>
            <td style="padding: 0 40px ${isLast ? '8px' : '28px'};">

              <!-- タイトル -->
              <h2 style="margin: 0 0 20px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
                ${a.title}
              </h2>

              <!-- 本文（Notion ページ本文から生成） -->
              ${a.bodyHtml}

              ${!isLast ? `
              <div style="border-top: 1px solid #e8e4de; margin-top: 12px;"></div>
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
  <title>Wamily からのお知らせ</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf8f4; font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;">

  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; color: #faf8f4;">
    Wamily からのお知らせがあります。
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
              <div style="font-size: 10px; color: #e4a853; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; font-weight: 600;">
                FROM WAMILY
              </div>
              <div style="width: 32px; height: 2px; background-color: #e4a853; margin-top: 12px;"></div>
            </td>
          </tr>

          <!-- ===== ANNOUNCEMENTS ===== -->
          ${announcementsHtml}

          <!-- ===== CTA ===== -->
          <tr>
            <td style="padding: 28px 40px 40px;">
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

module.exports = { buildAnnounceHtml };
