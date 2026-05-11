#!/usr/bin/env node
/**
 * キュレーション補充: 実在確認済みコンテンツをNotionに「候補」で投入
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CURATION_DB_ID = process.env.NOTION_CURATION_DB_ID || '4f146e35-f680-46e1-acf2-8e4cc86851fb';

// サワディーさんのおすすめソース 2026-05-11追加分（16件）
// 注意：前回投入分（2025年〜2026年初頭）は既にNotion投入済みのためここからは除外
const NEW_CURATIONS = [
  // ストックホルム
  { name: '北欧ポスター屋さん ismirai home', type: 'Instagram', country: 'ストックホルム', url: 'https://www.instagram.com/interior_poster_ismirai', desc: '北欧の暮らしを彩るインテリアポスターを発信。ストックホルムの感性の源流に触れたい人へ。' },
  { name: 'だてチャンネル｜ヨーロッパ33ヵ国70都市', type: 'Instagram', country: 'ストックホルム', url: 'https://www.instagram.com/d__channel', desc: 'ヨーロッパ33ヵ国70都市を巡る家族旅行アカウント。ストックホルム情報の参考にも。' },

  // ロンドン
  { name: 'ひまり｜イギリス大学院生', type: 'Instagram', country: 'ロンドン', url: 'https://www.instagram.com/himari_europe', desc: 'イギリス大学院生がヨーロッパ全域を旅して発信。在英目線のリアルが詰まる。' },
  { name: '地球の歩き方 aruco ロンドン 2024〜2025', type: '書籍', country: 'ロンドン', url: 'https://amzn.asia/d/056Hhtii', desc: '定番ガイド「aruco」シリーズのロンドン編。最新の見どころと旅情報を網羅した1冊。' },
  { name: 'Charlie｜イギリス旅案内人', type: 'ブログ', country: 'ロンドン', url: 'https://note.com/cute_london', desc: 'ロンドン在住14年の旅案内人。観光客が知らない"通の旅"を、穴場・無料スポット・スイーツの切り口で発信。' },

  // パリ
  { name: 'Eiko Shigeta 食いしん坊コーディネーター', type: 'Instagram', country: 'パリ', url: 'https://www.instagram.com/eico0614', desc: '甘いもの大好きパリ食コーディネーター。パン・スイーツ・カフェの最前線を発信。' },
  { name: 'Paris Magazine', type: 'ブログ', country: 'パリ', url: 'https://paris-mag.com/', desc: 'パリ在住者が運営する観光マガジン。アート・食・買い物・季節イベントまで網羅的に紹介。' },
  { name: 'el BLANCO', type: 'ブログ', country: 'パリ', url: 'https://www.encanta-europa10.com/', desc: '"暮らすような旅"の魅力を、写真と臨場感で綴るパリ・南仏・スペインの旅ブログ。' },

  // バンコク
  { name: 'タイ人ガイドのター', type: 'Instagram', country: 'バンコク', url: 'https://www.instagram.com/tasan_tai_trip', desc: 'タイ人ガイドが現地目線でバンコクを案内。観光ガイドにはない地元の温度感が伝わる。' },
  { name: 'kana｜タイおすすめスポット', type: 'Instagram', country: 'バンコク', url: 'https://www.instagram.com/kana.days_', desc: 'バンコクのおすすめスポットを日本人目線でセレクト発信。穴場とトレンドの両面が見える。' },
  { name: 'BANGKOK GIRLS NOTE', type: 'ブログ', country: 'バンコク', url: 'https://www.bangkok-pukuko.com/', desc: 'タイ・バンコク専門メディア。観光・グルメ・暮らし・子育てまで、ぷくこさんが現地のリアルを発信。' },

  // 香港
  { name: 'えり｜香港在住 食べ歩きブロガー', type: 'Instagram', country: '香港', url: 'https://www.instagram.com/petitfeilee', desc: '香港在住の食べ歩きブロガー。地元の点心からカフェまで、生活者目線の食情報を発信。' },
  { name: 'M｜香港アカウント（要確認）', type: 'Instagram', country: '香港', url: 'https://www.instagram.com/m_fromjapan', desc: '日本人視点で香港の日常を発信するアカウント。※プロフィール詳細はNotionで確認・調整してください。' },
  { name: '地球の歩き方 aruco 香港 2025〜2026', type: '書籍', country: '香港', url: 'https://amzn.asia/d/0ijHA5nf', desc: '定番ガイド「aruco」シリーズの香港編。最新の見どころと旅情報を網羅した1冊。' },
  { name: '香港の歴史と地政学（書名要確認）', type: '書籍', country: '香港', url: 'https://amzn.asia/d/0h8Rce2X', desc: '香港の歴史と地政学を一冊でまとめた書籍。旅をもっと深く楽しむための背景知識に。※書名はNotionで確認・修正してください。' },

  // マニラ
  { name: 'Yuko_ih_bkk.ph', type: 'ブログ', country: 'マニラ', url: 'https://note.com/yuko_ih_bkk', desc: 'タイ6年・フィリピン1年の駐在妻が発信する、海外子育て・旅行・駐在生活のリアルなnote。' },

  // ────────────────────────────────────────
  // 2026-05-11追加 第2弾（カルチャー寄り、各国 +α）
  // ────────────────────────────────────────

  // 香港
  { name: 'meliluu__｜香港インスタグラマー', type: 'Instagram', country: '香港', url: 'https://www.instagram.com/meliluu__', desc: '香港の街と暮らしを切り取るインスタグラマー。日常の一コマに、香港の空気感がにじむ印象。' },
  { name: 'Little Steps Asia', type: 'Instagram', country: '香港', url: 'https://www.instagram.com/littlestepsasia/', desc: 'アジア各地の子連れ家族向け情報メディア。香港の公園・遊び場・雨の日の過ごし方など、子連れ目線のヒントが集まる。' },

  // 台湾
  { name: 'ajiji4329｜台湾インスタグラマー', type: 'Instagram', country: '台湾', url: 'https://www.instagram.com/ajiji4329', desc: '台湾の日常と空気感を発信するインスタグラマー。観光ガイドにはない街の手触りが見えてきそう。' },
  { name: 'Taiwan Scene', type: 'ブログ', country: '台湾', url: 'https://taiwan-scene.com/', desc: '台湾のカフェ・アート・地方・文化を扱うトラベルマガジン。"台湾aesthetic"の感度が高め。雰囲気から味わいたい人に。' },
  { name: 'Shopping Design', type: 'Instagram', country: '台湾', url: 'https://www.instagram.com/shoppingdesign_official/', desc: '台湾のブランド・編集・空間感覚を発信するメディアアカウント。台湾のクリエイティブの今が見えてくる。' },

  // LA
  { name: 'Secret Los Angeles', type: 'Instagram', country: 'LA', url: 'https://www.instagram.com/secret.losangeles/', desc: 'LAローカル発のカルチャー情報。最新イベントや新しい空間情報が早く、子連れイベントの拾い物にも。' },
  { name: 'Eater LA', type: 'Instagram', country: 'LA', url: 'https://www.instagram.com/eater_la', desc: 'LAグルメシーンの定点観測メディア。"今どこが熱いか"の手がかりになりそう。' },
  { name: 'The Infatuation LA', type: 'Instagram', country: 'LA', url: 'https://www.instagram.com/infatuation_la', desc: 'LAのレストランレビューを人間的なトーンで発信。雰囲気から店を選びたいときの参考に。' },
  { name: 'Mommy Poppins Los Angeles', type: 'ブログ', country: 'LA', url: 'https://mommypoppins.com/los-angeles', desc: 'LAの子連れ向け情報を集めたファミリーメディア。公園・無料スポット・週末イベントの参考に。' },

  // シンガポール
  { name: 'The Smart Local Singapore', type: 'ブログ', country: 'シンガポール', url: 'https://thesmartlocal.com/', desc: 'シンガポールのローカルが見るメディア。カフェ・公園・モール・新スポットなど、"今シンガポール人がどこに行っているか"が見えてきそう。' },
  { name: 'sethluicious｜シンガポールフード', type: 'Instagram', country: 'シンガポール', url: 'https://www.instagram.com/sethluicious/', desc: 'シンガポールのローカルB級グルメに特化したフードアカウント。観光客向けじゃないシンガポールの食が見えてくる。' },
  { name: 'Daniel Food Diary', type: 'Instagram', country: 'シンガポール', url: 'https://www.instagram.com/danielfooddiary/', desc: 'シンガポールのカフェ・ベーカリー・最新店を発信。"今っぽいシンガポール"を感じたいときに。' },
  { name: 'HoneyKids Asia', type: 'Instagram', country: 'シンガポール', url: 'https://www.instagram.com/honeykidsasia/', desc: 'アジアの子連れ家族向けメディア。シンガポールの公園・水遊び・雨の日の過ごし方など、子連れ目線の情報が集まる。' },
  { name: 'SingaLife', type: 'ブログ', country: 'シンガポール', url: 'https://singalife.com', desc: '在シンガポールの日本人向けメディア。生活者目線の情報が日々更新され、現地のリアルが届きやすい。' },

  // ソウル
  { name: 'VISIT SEOUL（公式）', type: 'Instagram', country: 'ソウル', url: 'https://www.instagram.com/visitseoul_official/', desc: 'ソウル市の観光公式アカウント。公式ながら感度が高く、今のソウルのカルチャーがフィードからにじむ。' },
  { name: 'Creatrip Japan', type: 'Instagram', country: 'ソウル', url: 'https://www.instagram.com/creatrip.jp/', desc: '日本人旅行者向けに、ソウルの最新スポット・グルメ・カフェ情報を発信。実用度の高さで頼りやすい印象。' },
  { name: 'Seoul Walker', type: 'YouTube', country: 'ソウル', url: 'https://www.youtube.com/@SeoulWalker', desc: 'ソウルの街を無言で歩く街歩き映像チャンネル。今のソウルの空気感が、編集なしの時間で伝わってきそう。' },

  // マニラ
  { name: 'When in Manila', type: 'Instagram', country: 'マニラ', url: 'https://www.instagram.com/wheninmanila', desc: 'マニラのイベント・グルメ・週末情報を発信。ローカルの若者カルチャーが見えてきそう。' },
  { name: 'Our Awesome Planet', type: 'Instagram', country: 'マニラ', url: 'https://www.instagram.com/ourawesomeplanet/', desc: 'フィリピンのフードカルチャーを軸に、家族で楽しむ食シーンを発信。"家族文化"の温度感も伝わりやすい。' },
  { name: 'Becoming Filipino', type: 'YouTube', country: 'マニラ', url: 'https://www.youtube.com/@BecomingFilipino', desc: 'フィリピンのローカル文化を深掘りするYouTubeチャンネル。観光情報というより、文化理解のための一本。' },
  { name: 'GRID Magazine Philippines', type: 'Instagram', country: 'マニラ', url: 'https://www.instagram.com/gridmagazineph/', desc: 'フィリピンの文化・暮らし・地域を扱うマガジン。観光より"国そのもの"を知りたい人に。' },

  // ハワイ
  { name: 'LeaLeaハワイ', type: 'Instagram', country: 'ハワイ', url: 'https://www.instagram.com/lealeahawaii', desc: 'ワイキキの最新情報を発信する日本語メディア（HIS運営）。子連れOKのレストランや施設情報も多め。' },
  { name: 'KAUKAU Hawaii', type: 'Instagram', country: 'ハワイ', url: 'https://www.instagram.com/kaukau_hawaii', desc: 'ハワイの日本人旅行者向けに、グルメ・スーパー・お土産情報を発信。実用度が高い印象。' },
  { name: 'Aloha Street（アロハストリート）', type: 'Instagram', country: 'ハワイ', url: 'https://www.instagram.com/alohastreetcom_hawaii', desc: 'ハワイの日本語情報メディア。初めての人から子連れまで使いやすく、定番から穴場まで幅広い。' },
  { name: 'allhawaii（ハワイ州観光局公式）', type: 'ブログ', country: 'ハワイ', url: 'https://www.allhawaii.jp/', desc: 'ハワイ州観光局の日本語公式サイト。公式ながら実用的で、旅の準備から現地情報まで参考になる。' },

  // ストックホルム
  { name: 'thatsup Stockholm', type: 'Instagram', country: 'ストックホルム', url: 'https://www.instagram.com/thatsup_stockholm/', desc: 'ストックホルム版TimeOut的な存在感のメディア。カフェ・レストラン・イベントが豊富で、今のストックホルムが見えてきそう。' },
];

async function main() {
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });
  const today = new Date().toISOString().split('T')[0];

  console.log(`🎬 キュレーション補充: ${NEW_CURATIONS.length} 件を「候補」で投入\n`);

  let added = 0;
  for (const c of NEW_CURATIONS) {
    try {
      await notion.pages.create({
        parent: { database_id: CURATION_DB_ID },
        properties: {
          '名前': { title: [{ text: { content: c.name } }] },
          '国名': { select: { name: c.country } },
          'タイプ': { select: { name: c.type } },
          '説明': { rich_text: [{ text: { content: c.desc } }] },
          'URL': { url: c.url },
          'ステータス': { select: { name: '候補' } },
          '追加日': { date: { start: today } },
        },
      });
      console.log(`  ✅ ${c.country} | ${c.type} | ${c.name}`);
      added++;
    } catch (err) {
      console.error(`  ❌ ${c.name}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\n✅ ${added} 件を候補として追加完了`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
