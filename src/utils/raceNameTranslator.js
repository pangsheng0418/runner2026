/**
 * 中文賽事名稱自動轉英文賽事名稱（輸入中文時即時自動產生，承辦人仍可自行修改）
 */

const PHRASE_DICT = [
  // 複合長詞優先匹配
  ['台灣超級馬拉松', 'TAIWAN ULTRA MARATHON'],
  ['臺灣超級馬拉松', 'TAIWAN ULTRA MARATHON'],
  ['超級馬拉松', 'ULTRA MARATHON'],
  ['半程馬拉松', 'HALF MARATHON'],
  ['全程馬拉松', 'FULL MARATHON'],
  ['迷你馬拉松', 'MINI MARATHON'],
  ['城市馬拉松', 'CITY MARATHON'],
  ['國際馬拉松', 'INTERNATIONAL MARATHON'],
  ['台灣超馬', 'TAIWAN ULTRA'],
  ['臺灣超馬', 'TAIWAN ULTRA'],
  ['鐵人三項', 'TRIATHLON'],
  ['鐵人二項', 'DUATHLON'],
  ['自行車賽', 'CYCLING RACE'],
  ['越野挑戰賽', 'TRAIL CHALLENGE'],
  ['山林越野', 'MOUNTAIN TRAIL'],
  ['越野跑', 'TRAIL RUN'],
  ['越野賽', 'TRAIL RACE'],
  ['路跑賽', 'ROAD RUN'],
  ['夜跑賽', 'NIGHT RUN'],
  ['接力賽', 'RELAY RACE'],
  ['挑戰賽', 'CHALLENGE'],
  ['邀請賽', 'INVITATIONAL'],
  ['錦標賽', 'CHAMPIONSHIP'],
  ['公開賽', 'OPEN'],
  ['嘉年華', 'CARNIVAL'],
  ['公益路跑', 'CHARITY RUN'],
  ['慈善路跑', 'CHARITY RUN'],
  ['親子路跑', 'FAMILY RUN'],
  ['女子路跑', 'WOMENS RUN'],
  ['河濱公園', 'RIVERSIDE PARK'],
  ['大佳河濱', 'DAJIA RIVERSIDE'],
  ['美堤河濱', 'MEITI RIVERSIDE'],
  ['高美濕地', 'GAOMEI WETLANDS'],
  ['石門水庫', 'SHIMEN RESERVOIR'],
  ['曾文水庫', 'ZENGWEN RESERVOIR'],
  ['冬山河', 'DONGSHAN RIVER'],
  ['日月潭', 'SUN MOON LAKE'],
  ['太魯閣', 'TAROKO'],
  ['陽明山', 'YANGMINGSHAN'],
  ['阿里山', 'ALISHAN'],
  ['萬金石', 'WAN JIN SHI'],
  ['八卦山', 'BAGUASHAN'],
  ['合歡山', 'HEHUANSHAN'],
  ['七星潭', 'QIXINGTAN'],
  ['鯉魚潭', 'LIYU LAKE'],
  ['澄清湖', 'CHENGQING LAKE'],
  ['杉林溪', 'SUN LINK SEA'],
  ['東海岸', 'EAST COAST'],
  ['翡翠灣', 'GREEN BAY'],
  ['螢火蟲', 'FIREFLY'],
  ['繞圈賽', 'LAP RACE'],
  ['限時賽', 'TIMED RACE'],
  ['計時賽', 'TIME TRIAL'],
  ['24小時', '24H'],
  ['12小時', '12H'],
  ['6小時', '6H'],
  ['小時', 'H'],

  // 台灣縣市與熱門地標
  ['台灣', 'TAIWAN'],
  ['臺灣', 'TAIWAN'],
  ['台北', 'TAIPEI'],
  ['臺北', 'TAIPEI'],
  ['新北', 'NEW TAIPEI'],
  ['桃園', 'TAOYUAN'],
  ['台中', 'TAICHUNG'],
  ['臺中', 'TAICHUNG'],
  ['台南', 'TAINAN'],
  ['臺南', 'TAINAN'],
  ['高雄', 'KAOHSIUNG'],
  ['基隆', 'KEELUNG'],
  ['新竹', 'HSINCHU'],
  ['苗栗', 'MIAOLI'],
  ['彰化', 'CHANGHUA'],
  ['南投', 'NANTOU'],
  ['雲林', 'YUNLIN'],
  ['嘉義', 'CHIAYI'],
  ['屏東', 'PINGTUNG'],
  ['宜蘭', 'YILAN'],
  ['花蓮', 'HUALIEN'],
  ['台東', 'TAITUNG'],
  ['臺東', 'TAITUNG'],
  ['澎湖', 'PENGHU'],
  ['金門', 'KINMEN'],
  ['馬祖', 'MATSU'],
  ['淡水', 'TAMSUI'],
  ['墾丁', 'KENTING'],
  ['福隆', 'FULONG'],
  ['田中', 'TIANZHONG'],
  ['鹿港', 'LUKANG'],
  ['羅東', 'LUODONG'],
  ['北港', 'BEIGANG'],
  ['古都', 'ANCIENT CAPITAL'],
  ['港都', 'HARBOR CITY'],
  ['花東', 'HUADONG'],
  ['駁二', 'PIER-2'],
  ['愛河', 'LOVE RIVER'],
  ['碧潭', 'BITAN'],
  ['武嶺', 'WULING'],
  ['溪頭', 'XITOU'],
  ['玉山', 'YUSHAN'],
  ['雪霸', 'SHEI-PA'],
  ['中橫', 'CENTRAL CROSS-ISLAND'],
  ['南橫', 'SOUTH CROSS-ISLAND'],
  ['北橫', 'NORTH CROSS-ISLAND'],
  ['柴山', 'CHAISHAN'],
  ['大安', 'DAAN'],
  ['信義', 'XINYI'],
  ['板橋', 'BANQIAO'],
  ['三重', 'SANCHONG'],
  ['左營', 'ZUOYING'],
  ['安平', 'ANPING'],

  // 賽事類型與修飾詞
  ['馬拉松', 'MARATHON'],
  ['超馬', 'ULTRA'],
  ['全馬', 'FULL MARATHON'],
  ['半馬', 'HALF MARATHON'],
  ['路跑', 'RUN'],
  ['越野', 'TRAIL'],
  ['夜跑', 'NIGHT RUN'],
  ['晨跑', 'MORNING RUN'],
  ['慢跑', 'JOGGING'],
  ['健走', 'WALK'],
  ['健行', 'HIKING'],
  ['接力', 'RELAY'],
  ['公益', 'CHARITY'],
  ['慈善', 'CHARITY'],
  ['親子', 'FAMILY'],
  ['女子', 'WOMENS'],
  ['國際', 'INTERNATIONAL'],
  ['全國', 'NATIONAL'],
  ['城市', 'CITY'],
  ['河濱', 'RIVERSIDE'],
  ['濱海', 'COASTAL'],
  ['海岸', 'COASTAL'],
  ['海灣', 'BAY'],
  ['山林', 'MOUNTAIN'],
  ['森林', 'FOREST'],
  ['公園', 'PARK'],
  ['環島', 'ROUND-ISLAND'],
  ['環湖', 'LAKE'],
  ['繞圈', 'LAP'],
  ['限時', 'TIMED'],
  ['疾速', 'SPEED'],
  ['極速', 'SPEED'],
  ['極限', 'EXTREME'],
  ['挑戰', 'CHALLENGE'],
  ['大賽', 'GRAND PRIX'],
  ['歡樂', 'FUN'],
  ['健康', 'HEALTHY'],
  ['活力', 'ENERGY'],
  ['熱血', 'PASSION'],
  ['春季', 'SPRING'],
  ['夏季', 'SUMMER'],
  ['秋季', 'AUTUMN'],
  ['冬季', 'WINTER'],
  ['跨年', 'NEW YEAR'],
  ['元旦', 'NEW YEAR'],
  ['端午', 'DRAGON BOAT'],
  ['中秋', 'MID-AUTUMN'],
  ['國慶', 'NATIONAL DAY'],
  ['聖誕', 'CHRISTMAS'],
  ['日出', 'SUNRISE'],
  ['日落', 'SUNSET'],
  ['星光', 'STARLIGHT'],
  ['星空', 'STARRY'],
  ['櫻花', 'SAKURA'],
  ['賞楓', 'MAPLE'],
  ['田園', 'COUNTRYSIDE'],
  ['稻田', 'RICE FIELD'],
  ['溫泉', 'HOT SPRING'],
  ['古道', 'HISTORIC TRAIL'],
  ['自行車', 'CYCLING'],
  ['鐵人', 'IRONMAN'],
  ['協會', 'ASSOCIATION'],
  ['跑者', 'RUNNERS'],
  ['盃', 'CUP'],
  ['賽', 'RACE'],
  ['跑', 'RUN'],
];

function ordinalSuffix(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return String(num);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}TH`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}ST`;
  if (mod10 === 2) return `${n}ND`;
  if (mod10 === 3) return `${n}RD`;
  return `${n}TH`;
}

export function generateEnglishEventName(chineseName) {
  const raw = String(chineseName || '').trim();
  if (!raw) return '';

  let text = raw
    .replace(/[（(][^）)]*(籌備中|已結案|開放中|測試)[^）)]*[）)]/g, ' ')
    .replace(/第\s*(\d+)\s*屆/g, (_, num) => ` ${ordinalSuffix(num)} `);

  for (const [zh, en] of PHRASE_DICT) {
    if (text.includes(zh)) {
      text = text.split(zh).join(` ${en} `);
    }
  }

  const tokens = text
    .replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g, ' ')
    .replace(/[^A-Za-z0-9'\- ]+/g, ' ')
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  const deduped = [];
  for (const t of tokens) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== t) {
      deduped.push(t);
    }
  }

  const result = deduped.join(' ').trim();
  if (!result) {
    return 'TUR RUNNING EVENT';
  }
  if (/^\d{4}$/.test(result)) {
    return `${result} TUR RUNNING EVENT`;
  }
  return result;
}
