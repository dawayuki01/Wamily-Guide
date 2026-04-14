#!/usr/bin/env node
/**
 * キュレーション補充: 実在確認済みコンテンツをNotionに「候補」で投入
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CURATION_DB_ID = process.env.NOTION_CURATION_DB_ID || '4f146e35-f680-46e1-acf2-8e4cc86851fb';

const NEW_CURATIONS = [
  // ロンドン
  { name: 'Touring With The Kids', type: 'YouTube', country: 'ロンドン', url: 'https://www.youtube.com/@touringwiththekids', desc: 'イギリス在住5人家族が改造トラックでイギリス・ヨーロッパを巡るファミリー旅行Vlog' },
  { name: 'Local Passport Family', type: 'ブログ', country: 'ロンドン', url: 'https://www.localpassportfamily.com/tag/london', desc: 'ロンドン在住経験のある6人の子持ち家族が、子連れ観光ルートや穴場スポットを紹介' },
  { name: 'Mika｜ロンドン駐在ママ', type: 'Instagram', country: 'ロンドン', url: 'https://www.instagram.com/giz_london/', desc: 'ロンドン駐在4年目の日本人ワーキングママが、子連れでのロンドン生活を発信' },
  { name: 'くまみんブログ', type: 'ブログ', country: 'ロンドン', url: 'https://kumaminblog.com/', desc: 'ロンドンに3年半駐在した日本人ママが、子連れ向けプレイグラウンドやお出かけスポットを紹介' },
  { name: '棚ぼたログ', type: 'ブログ', country: 'ロンドン', url: 'https://tanabotalog.com/londoncity/', desc: '1歳児連れでロンドン観光した体験記。アフタヌーンティーやお買い物情報を掲載' },

  // 台湾
  { name: 'Away With The Steiners', type: 'YouTube', country: '台湾', url: 'https://www.youtube.com/@awaywiththesteiners', desc: 'NZ出身の4人家族が98カ国を旅行、台湾の子連れ旅ガイドが充実' },
  { name: 'Taiwan Obsessed', type: 'ブログ', country: '台湾', url: 'https://www.taiwanobsessed.com/taiwan-with-kids/', desc: '台湾在住のカナダ人パパが、子どもと台湾各地のおすすめスポットを紹介する専門サイト' },
  { name: 'ぐりぐらママ', type: 'Instagram', country: '台湾', url: 'https://www.instagram.com/wamoto_/', desc: '年100泊以上・52カ国訪問の子連れ旅行インフルエンサー、台湾含む海外家族旅行情報を発信' },
  { name: 'みぃ｜子連れ旅行ママ', type: 'Instagram', country: '台湾', url: 'https://www.instagram.com/mimama_travel/', desc: '関西在住の子連れ旅行好きママが、台湾を含む実体験ベースのモデルコースを紹介' },
  { name: 'オハヨーツーリズム（台湾編）', type: 'ブログ', country: '台湾', url: 'https://ohayotourism.com/koduretaipei/', desc: '73カ国を訪れた旅ブロガーが、子連れ台湾旅行のコツやおすすめホテルを網羅的に紹介' },

  // パリ
  { name: 'Les Frenchies Travel', type: 'YouTube', country: 'パリ', url: 'https://www.youtube.com/@LesFrenchiesTravel', desc: '仏米夫婦がパリ・フランスの文化・グルメ・観光を紹介するチャンネル' },
  { name: 'ダンエリ Erica in Paris', type: 'Instagram', country: 'パリ', url: 'https://www.instagram.com/ericadan_/', desc: 'パリ在住ワーママが子育てしながらパリ観光・レストラン情報を発信' },
  { name: 'パリの片隅でブログを綴る', type: 'ブログ', country: 'パリ', url: 'https://www.parisimpleco.life/entry/kodomo_odekake', desc: 'パリ近郊在住8年目ママが子連れお出かけスポットを実体験ベースで紹介' },

  // ストックホルム
  { name: 'THE SWEDISH FAMILY', type: 'YouTube', country: 'ストックホルム', url: 'https://www.youtube.com/@theswedishfamily', desc: 'ストックホルム在住5人家族の日常・旅行vlog（約80万登録）' },
  { name: 'BB Stockholm Family', type: 'Instagram', country: 'ストックホルム', url: 'https://www.instagram.com/bbstockholmfamily/', desc: 'ストックホルムの家族向けライフスタイル情報を発信' },
  { name: 'オハヨーツーリズム（ストックホルム編）', type: 'ブログ', country: 'ストックホルム', url: 'https://ohayotourism.com/gamlastan/', desc: '7歳娘と37カ国滞在した旅ブロガーによる子連れストックホルム旅行記' },

  // シンガポール
  { name: 'The World n Us', type: 'YouTube', country: 'シンガポール', url: 'https://www.youtube.com/@theworldnus', desc: '家族で東南アジアを旅するvlogチャンネル、シンガポールを子連れで紹介' },
  { name: 'ゼロママ｜シンガポール駐在妻', type: 'Instagram', country: 'シンガポール', url: 'https://www.instagram.com/kidsxtraveler/', desc: 'シンガポール駐在妻が子連れスポット・カフェ・最新情報を在住者目線で発信' },
  { name: 'SINGAPORE BOX', type: 'ブログ', country: 'シンガポール', url: 'https://singaporetabi.com/', desc: '世界75カ国以上旅した旅行ブロガーが子連れシンガポール旅行情報を網羅的に発信' },

  // バンコク
  { name: 'With the Blinks', type: 'YouTube', country: 'バンコク', url: 'https://withtheblinks.com/bangkok-thailand-with-kids-family-travel-guide/', desc: '5人家族でバンコクを30日間旅した詳細ファミリーガイド' },
  { name: 'なぽり｜バンコク在住ママ', type: 'Instagram', country: 'バンコク', url: 'https://www.instagram.com/naho.thailand/', desc: 'バンコク在住4年目ママが子連れスポット・キッズカフェ・寺院巡りをリアル発信' },
  { name: 'naho-lovelydays', type: 'ブログ', country: 'バンコク', url: 'https://naho-lovelydays.com/bangkok-trip-2/', desc: '子連れバンコク3泊4日モデルコース、映えスポットを子どもと大人で楽しむ実体験記' },

  // ソウル
  { name: 'Family Can Travel', type: 'YouTube', country: 'ソウル', url: 'https://www.familycantravel.com/seoul-with-kids/', desc: '62か国を旅した家族が6日間ソウルで宮殿・水族館・市場を子連れで体験' },
  { name: 'ゆうさん｜韓国旅ママ', type: 'Instagram', country: 'ソウル', url: 'https://www.instagram.com/youuuu18s/', desc: '息子19回以上の韓国渡航経験を持つママが子連れ韓国旅行・グルメを発信' },
  { name: 'ぽこきちままBLOG', type: 'ブログ', country: 'ソウル', url: 'https://pocokichi.com/travel-korea/', desc: '1歳半の子連れでソウルへ行った実体験、ホテル・食事・移動のリアルな記録' },

  // マニラ
  { name: 'Away With The Steiners（マニラ編）', type: 'YouTube', country: 'マニラ', url: 'https://awaywiththesteiners.com/manila-with-kids/', desc: 'NZ出身4人家族がマニラのイントラムロス・ジプニー体験など子連れ冒険を紹介' },
  { name: 'ゆるゆる駐在NOTE', type: 'ブログ', country: 'マニラ', url: 'https://yuru-chuzai-mama.blog.jp/archives/1968691.html', desc: 'フィリピン駐在ママがマニラ近郊の子連れおでかけスポットを詳細に紹介' },

  // LA
  { name: 'The Family Voyage', type: 'ブログ', country: 'LA', url: 'https://www.thefamilyvoyage.com/best-things-to-do-in-los-angeles-with-kids/', desc: 'LA在住20年のローカルママが子連れで楽しめるビーチ・博物館・テーマパークをガイド' },
  { name: 'もにとら', type: 'ブログ', country: 'LA', url: 'https://moni-tra.com/2023usatravel/', desc: '初めての子連れ海外旅行としてLA7泊9日の家族旅行記を詳細に記録' },

  // ハワイ
  { name: 'The Bucket List Family', type: 'YouTube', country: 'ハワイ', url: 'https://www.thebucketlistfamily.com/hawaii', desc: 'ハワイ在住の3児家族が65か国以上を旅した経験とハワイ生活をYouTube配信' },
  { name: 'aloha_momlife_hawaii', type: 'Instagram', country: 'ハワイ', url: 'https://www.instagram.com/aloha_momlife_hawaii/', desc: 'ハワイ在住6年目のママがオアフ島の子連れお出かけ・旅行準備情報を発信' },
  { name: 'D-CAMP Family BLOG', type: 'ブログ', country: 'ハワイ', url: 'https://dcampfamily.com/dcampfamiliy-hawaiitrip2024-4/', desc: '生後10ヶ月と3歳の子連れハワイ旅行記、ベビーカーレンタル情報など実用的' },
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
