/**
 * シーケンスメール HTMLテンプレート
 * email-template.js のスタイルを踏襲（#faf8f4 / #2a9d8f / #e4a853 / Noto系フォント）
 *
 * 各テンプレートは subscriber オブジェクトを受け取り、HTMLを返す。
 * 最終コピーはサワディーと相談して決定。ここではフレームワーク＋プレースホルダー。
 */

const SITE_URL = 'https://dawayuki01.github.io/Wamily-Guide';

function wrapLayout(title, bodyHtml, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf8f4; font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;">

  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; color: #faf8f4;">
    ${title}
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf8f4;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.04);">

          <!-- HEADER -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid #e8e4de;">
              <div style="font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; letter-spacing: 0.04em;">
                <span style="color: #2a9d8f;">W</span>amily
              </div>
              <div style="font-size: 10px; color: #8a8a8a; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px;">
                Family Travel Guide
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding: 32px 40px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding: 8px 40px 40px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #2a9d8f; border-radius: 999px;">
                    <a href="${SITE_URL}/guidebook/"
                       style="display: block; padding: 14px 28px; color: #FFFFFF; text-decoration: none; font-size: 12px; letter-spacing: 0.1em;">
                      Wamilyのガイドブックはこちら &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e8e4de;"></div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding: 24px 40px 32px;">
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #8a8a8a; line-height: 1.7;">
                このメールは Wamily Letter の登録者にお送りしています。<br>
                配信停止をご希望の方は
                <a href="${unsubscribeUrl}" style="color: #2a9d8f; text-decoration: none;">こちら</a>
                からお手続きください。
              </p>
              <p style="margin: 0; font-size: 11px; color: #8a8a8a;">
                <a href="${SITE_URL}" style="color: #8a8a8a; text-decoration: none;">Wamily Guide</a>
                &nbsp;&middot;&nbsp;
                <a href="https://note.com/tomosawa" style="color: #8a8a8a; text-decoration: none;">note</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = {
  /**
   * Step 1: ウェルカムメール（登録翌日）
   */
  welcome(subscriber, unsubscribeUrl) {
    const bodyHtml = `
      <div style="width: 32px; height: 2px; background-color: #e4a853; margin-bottom: 20px;"></div>
      <h1 style="margin: 0 0 20px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
        Wamilyへようこそ
      </h1>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        <!-- サワディーと相談して決定 -->
        登録ありがとうございます。<br>
        Wamilyは「子連れで海外に行きたい」と思ったときに、<br>
        いちばん最初に開くガイドブックを目指しています。
      </p>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        毎週月曜日に、世界の英語メディアから選んだ<br>
        「旅と家族」の種をお届けします。
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        サワディー
      </p>
    `;
    return wrapLayout('Wamilyへようこそ', bodyHtml, unsubscribeUrl);
  },

  /**
   * Step 2: 使い方ガイド（登録3日後）
   */
  howToUse(subscriber, unsubscribeUrl) {
    const bodyHtml = `
      <div style="width: 32px; height: 2px; background-color: #e4a853; margin-bottom: 20px;"></div>
      <h1 style="margin: 0 0 20px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
        <!-- サワディーと相談して件名・本文を決定 -->
        Wamilyの歩き方
      </h1>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        Wamilyのガイドブックには、10カ国の子連れ情報が詰まっています。<br>
        各国のページでは、地元のおすすめスポットや<br>
        季節のイベント情報を見ることができます。
      </p>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        気になる国のページを覗いてみてください。
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        サワディー
      </p>
    `;
    return wrapLayout('Wamilyの歩き方', bodyHtml, unsubscribeUrl);
  },

  /**
   * Step 3: おすすめ紹介（登録7日後）
   */
  recommend(subscriber, unsubscribeUrl) {
    const bodyHtml = `
      <div style="width: 32px; height: 2px; background-color: #e4a853; margin-bottom: 20px;"></div>
      <h1 style="margin: 0 0 20px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
        <!-- サワディーと相談して件名・本文を決定 -->
        今月のおすすめ
      </h1>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        Wamilyが今月おすすめしたい旅先やコンテンツを<br>
        ご紹介します。
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        サワディー
      </p>
    `;
    return wrapLayout('今月のおすすめ', bodyHtml, unsubscribeUrl);
  },

  /**
   * Step 4: 旅のバトン紹介（登録14日後）
   */
  baton(subscriber, unsubscribeUrl) {
    const bodyHtml = `
      <div style="width: 32px; height: 2px; background-color: #e4a853; margin-bottom: 20px;"></div>
      <h1 style="margin: 0 0 20px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">
        <!-- サワディーと相談して件名・本文を決定 -->
        旅のバトン
      </h1>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        Wamilyには「旅のバトン」という仕組みがあります。<br>
        子連れ旅行の体験を次の家族へつなげる場所です。
      </p>
      <p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        あなたの旅の体験も、ぜひ教えてください。
      </p>
      <p style="margin: 0 0 0 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">
        サワディー
      </p>
    `;
    return wrapLayout('旅のバトン', bodyHtml, unsubscribeUrl);
  },
};
