/**
 * メルマガ件名生成プロンプト
 * その週のキュレーション5本から、雑誌の表紙見出しのような
 * 端的な件名を1本生成する。
 */

/**
 * @param {Array<{title_ja: string, category_label: string}>} items
 * @returns {string} Claude に渡すプロンプト
 */
function buildSubjectPrompt(items) {
  const list = items
    .map((it, i) => `${i + 1}. ${it.title_ja}（${it.category_label}）`)
    .join('\n');

  const today = new Date();
  const month = today.toLocaleDateString('ja-JP', { month: 'long', timeZone: 'Asia/Tokyo' });

  return `あなたは日本人ファミリー向け海外旅行メディア「Wamily」のメルマガ編集者です。
今週配信するキュレーション5本のタイトルを踏まえて、メルマガの件名を1つだけ作ってください。

【今週の5本】
${list}

【いまの時期】
${month}

【件名の条件】
- 15〜20文字程度（🌱含む）。長くても22文字まで
- 冒頭に🌱を1つだけ置く（他の絵文字は使わない）
- 今週のハイライトを端的に一言で表現する（雑誌の表紙見出しのイメージ）
- 静かで端的なトーン。煽り・営業臭は避ける
- 禁止ワード：必見／話題／驚き／完全ガイド／〇〇選／厳選
- 毎週違う切り口を選ぶ（場所 / 季節 / テーマ / 家族の視点 / 新しい兆し など）
- 「今週の旅と家族の種」という過去テンプレは使わない
- 鉤括弧（「」）は1箇所まで。多用しない

【件名のイメージ（そのまま使わず参考に）】
🌱 ロンドンと春の準備
🌱 桜前のアジア、3都市
🌱 ストックホルムの日常から
🌱 春休み前、子連れ視点の5本
🌱 欧州の新しい家族旅

【出力形式】
件名のみを1行で。引用符・説明・前置きは一切不要。`;
}

module.exports = { buildSubjectPrompt };
