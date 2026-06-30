const SPREADSHEET_ID = '1yu0RbgYQyx4jPz63hqDp_aI_zyKXoV00jyUyOp7XCKU';
const DEFAULT_CARDS = [
  ['overview','行程總覽','查看 10 天活動安排','🗓️','itinerary','public',1,'TRUE','TRUE'],
  ['flights','航班資訊','查看航班與機場安排','✈️','flights','public',2,'TRUE','TRUE'],
  ['hotels','酒店資訊','查看住宿資料','🏨','hotels','public',3,'TRUE','TRUE'],
  ['notes','備忘事項','出發前的重要提醒','📝','notes','public',4,'TRUE','TRUE'],
  ['packing','物資清單','可勾選並顯示建議數量','🎒','packing_list','public',5,'TRUE','TRUE'],
  ['emergency_actions','緊急聯絡清單','按情況快速知道應通知誰','🚨','emergency_actions','public',6,'TRUE','TRUE'],
  ['emergency_contacts','緊急聯絡資訊','重要聯絡人與電話','📞','emergency_contacts','public',7,'TRUE','TRUE'],
  ['phrases','印尼常用會話','旅行實用語句','🗣️','phrases_id','public',8,'TRUE','TRUE'],
  ['apps','實用 App','印尼旅程常用應用程式','📱','recommended_apps','public',9,'TRUE','TRUE'],
  ['weather','天氣資訊','峇里 / 日惹 / 雅加達天氣','🌦️','weather_locations','public',10,'TRUE','TRUE'],
  ['exchange_rates','匯率資訊','HKD / USD / IDR 匯率','💱','exchange_rates','public',11,'TRUE','TRUE'],
  ['restaurants','餐廳資訊','三地餐廳建議','🍽️','restaurants','public',12,'TRUE','TRUE'],
  ['souvenirs','手信資訊','三地手信建議','🎁','souvenirs','public',13,'TRUE','TRUE'],
  ['attractions','景點資訊','三地景點整理','📍','attractions','public',14,'TRUE','TRUE'],
  ['marine_life','海洋生物資訊','潛水 / 浮潛常見海洋生物','🐠','marine_life','public',15,'TRUE','TRUE'],
  ['my_profile','我的資料','登入後查看自己的資料','🙋','MEMBERS','member',16,'TRUE','FALSE'],
  ['members_all','成員總表','領袖專用查閱','👥','MEMBERS','leader',17,'TRUE','FALSE']
];

function doGet(e) {
  return output({ ok: true, message: 'API running' });
}
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const action = req.action;
    let result;
    switch (action) {
      case 'initSheets': result = initSheets_(); break;
      case 'login': result = login_(req.username, req.password); break;
      case 'getBootstrap': result = getBootstrap_(req.session); break;
      case 'getCardData': result = getCardData_(req.session, req.cardId); break;
      case 'getMyProfile': result = getMyProfile_(req.session); break;
      case 'updateOwnPassword': result = updateOwnPassword_(req.session, req.newPassword); break;
      case 'adminListUsers': result = adminListUsers_(req.session); break;
      case 'adminUpdateUser': result = adminUpdateUser_(req.session, req.username, req.updates || {}); break;
      case 'adminToggleUserActive': result = adminToggleUserActive_(req.session, req.username); break;
      case 'adminListCards': result = adminListCards_(req.session); break;
      case 'adminToggleCard': result = adminToggleCard_(req.session, req.cardId); break;
      case 'adminUpdateCard': result = adminUpdateCard_(req.session, req.cardId, req.updates || {}); break;
      case 'adminSetUserCardAccess': result = adminSetUserCardAccess_(req.session, req.username, req.cardId, req.allowed); break;
      default: throw new Error('Unknown action');
    }
    return output({ ok: true, ...result });
  } catch (err) {
    return output({ ok: false, error: err.message });
  }
}

function output(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sh_(name) { const s = ss_().getSheetByName(name); if (!s) throw new Error('Missing sheet: ' + name); return s; }
function getRows_(sheetName) {
  const sh = sh_(sheetName); const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h,i)=>[String(h).trim(), r[i]])));
}
function setSheetData_(name, headers, rows) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  sh.autoResizeColumns(1, headers.length);
  return sh;
}
function bool_(v) { return String(v).toUpperCase() === 'TRUE' || v === true || v === 'Yes' || v === '是'; }
function requireRole_(session, role) {
  const ranks = { public:0, member:1, leader:2, superadmin:3 };
  if ((ranks[session?.role || 'public'] || 0) < ranks[role]) throw new Error('Permission denied');
}
function findUser_(username) { return getRows_('USER').find(r => String(r.username).trim() === String(username).trim()); }
function verifySession_(session) {
  if (!session || !session.username) return null;
  const user = findUser_(session.username);
  if (!user || !bool_(user.active)) throw new Error('Session invalid');
  return { username: user.username, role: user.role, display_name: user.display_name, member_id: user.member_id };
}

function initSheets_() {
  setSheetData_('CONFIG', ['key','value','note'], [
    ['site_name','童遊世界‧印尼活動備忘','網站名稱'],
    ['trip_start','2026-07-11','開始日期'],
    ['trip_end','2026-07-20','結束日期'],
    ['theme_color','#0f766e','主色'],
    ['public_enabled','TRUE','公開開關'],
    ['member_login_enabled','TRUE','成員登入'],
    ['leader_login_enabled','TRUE','領袖登入'],
    ['admin_panel_enabled','TRUE','管理頁']
  ]);
  setSheetData_('CARDS', ['card_id','title','description','icon','target_sheet','visibility','sort_order','enabled','editable_in_admin'], DEFAULT_CARDS);
  setSheetData_('USER_CARD_ACCESS', ['username','card_id','allowed'], []);
  setSheetData_('weather_locations', ['location_id','city','label','api_type','api_url','note','enabled'], [
    ['bali','Bali','峇里','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-8.65&longitude=115.2167&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto','Denpasar','TRUE'],
    ['yogyakarta','Yogyakarta','日惹','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-7.7956&longitude=110.3695&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto','Yogyakarta','TRUE'],
    ['jakarta','Jakarta','雅加達','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto','Jakarta','TRUE']
  ]);
  setSheetData_('exchange_rates', ['pair','base','target','enabled'], [
    ['HKD/USD','HKD','USD','TRUE'],
    ['HKD/IDR','HKD','IDR','TRUE'],
    ['USD/IDR','USD','IDR','TRUE']
  ]);
  setSheetData_('packing_list', ['item_id','category','item_name','quantity','note','required','sort_order'], [
    ['p1','證件','護照',1,'確認有效期', 'TRUE',1],
    ['p2','證件','印尼電子入境卡 QR Code',1,'截圖及離線保存','TRUE',2],
    ['p3','證件','旅遊保險資料',1,'建議列印 / PDF 離線備份','TRUE',3],
    ['p4','衣物','替換衣物',5,'不要只帶一套，按天數及活動準備','TRUE',4],
    ['p5','衣物','內衣褲',6,'建議預留備用','TRUE',5],
    ['p6','衣物','襪',5,'按活動量準備','TRUE',6],
    ['p7','衣物','睡衣',1,'酒店 / 車程使用','TRUE',7],
    ['p8','鞋履','步行鞋 / 運動鞋',1,'適合長時間步行','TRUE',8],
    ['p9','鞋履','拖鞋 / 涼鞋',1,'洗澡或短距離使用','FALSE',9],
    ['p10','健康','個人藥物',1,'如有需要必須自備','TRUE',10],
    ['p11','通訊','SIM / eSIM / 漫遊',1,'出發前準備','TRUE',11],
    ['p12','財務','現金 / 美金',1,'方便換印尼盾','TRUE',12],
    ['p13','衛生','牙刷牙膏 / 洗漱用品',1,'個人用品','TRUE',13],
    ['p14','戶外','防曬用品',1,'太陽眼鏡、帽、防曬','FALSE',14],
    ['p15','戶外','水樽',1,'保持補水','FALSE',15]
  ]);
  setSheetData_('marine_life', ['species_id','city','species_name','category','note','sort_order'], [
    ['m1','峇里 Bali','海龜','大型海洋生物','在部分浮潛 / 潛水點有機會遇見',1],
    ['m2','峇里 Bali','小丑魚','礁魚','常見於珊瑚區',2],
    ['m3','峇里 Bali','鸚哥魚','礁魚','常見、顏色鮮豔',3],
    ['m4','峇里 Bali','魔鬼魚 / Manta Ray','大型海洋生物','部分海域及季節有機會見到',4],
    ['m5','峇里 Bali','翻車魚 / Mola Mola','季節性大型魚類','通常 7-10 月較有機會',5],
    ['m6','峇里 Bali','珊瑚','海洋生態','觀察時請勿觸摸或踩踏',6]
  ]);
  setSheetData_('diving_notes', ['sort_order','title','note'], [
    [1,'保持放鬆呼吸','下水前先穩定情緒，不要急促呼吸，跟從教練指示。'],
    [2,'耳壓不適要即時示意','如耳朵痛、頭暈或不舒服，立即向教練打手勢，不要勉強下潛。'],
    [3,'不要追逐海洋生物','看到海龜、魚群或其他生物時保持距離，只觀察不觸摸。'],
    [4,'與同伴保持視線','不要單獨離開，隨時知道 buddy 在哪裡。'],
    [5,'上水後慢慢整理','活動後先補水、休息及聽從下一步安排。']
  ]);
  setSheetData_('hiking_notes', ['sort_order','title','note'], [
    [1,'夜行前先有心理準備','凌晨出發、天黑、風大和地面不平是正常情況，不用過分緊張。'],
    [2,'跟緊隊伍不要逞強','不要自己衝前或落後太多，如體力不足要盡早示意。'],
    [3,'火山地形較滑','沙石路、斜坡及碎石較多，每一步都要踏穩。'],
    [4,'身體不適立即講','頭暈、氣促、膝痛、作嘔等要立即通知領隊。'],
    [5,'到達後先休息再拍照','安全和體力優先，不要一到達就衝去邊位影相。']
  ]);
  setSheetData_('restaurants', ['item_id','city','name','category','note','map_url','sort_order'], [
    ['r1','峇里 Bali','Massimo (Sanur)','意大利 / 家庭友善','Sanur 區知名，適合較輕鬆用餐。','',1],
    ['r2','峇里 Bali','Genius Cafe','海邊 Cafe','海邊環境輕鬆，適合早餐或簡餐。','',2],
    ['r3','峇里 Bali','Soul on the Beach','海景餐廳','Sanur 海邊用餐選擇。','',3],
    ['r4','日惹 Yogyakarta','Bale Raos','爪哇皇室料理','靠近王宮，適合體驗在地特色。','',4],
    ['r5','日惹 Yogyakarta','The House of Raminten','特色印尼料理','氣氛特別，遊客常去。','',5],
    ['r6','日惹 Yogyakarta','ViaVia Jogja','旅人友善 / 綜合菜式','選擇多。','',6],
    ['r7','雅加達 Jakarta','Bandar Djakarta','海鮮','適合多人聚餐。','',7],
    ['r8','雅加達 Jakarta','Plataran Menteng','高質印尼菜','環境較正式。','',8],
    ['r9','雅加達 Jakarta','Lara Djonggrang','印尼特色餐廳','裝潢有特色。','',9]
  ]);
  setSheetData_('souvenirs', ['item_id','city','item_name','best_place','note','sort_order'], [
    ['s1','峇里 Bali','Batik / Sarong','Ubud / 當地市場','最常見又易帶走。',1],
    ['s2','峇里 Bali','銀飾','Celuk Village','想買飾物可留意真材質。',2],
    ['s3','峇里 Bali','木雕 / 面具','Mas / Ubud Art Market','有地方文化特色。',3],
    ['s4','峇里 Bali','Kopi Luwak / 咖啡','包裝店 / 機場','建議買密封包裝。',4],
    ['s5','日惹 Yogyakarta','Batik','Beringharjo Market / Mirota Batik','日惹代表性手信。',5],
    ['s6','日惹 Yogyakarta','Bakpia','Bakpia Pathok','經典可食用手信。',6],
    ['s7','日惹 Yogyakarta','銀器 / 銀飾','Kotagede','日惹著名銀器區。',7],
    ['s8','日惹 Yogyakarta','地方零食 / 朱古力','Chocolate Monggo / souvenir shops','較易分送。',8],
    ['s9','雅加達 Jakarta','Batik 配件','Sarinah / Thamrin City','城市中較方便買。',9],
    ['s10','雅加達 Jakarta','Wayang 皮影 / 木偶','Pasar Seni / souvenir stores','具印尼文化特色。',10],
    ['s11','雅加達 Jakarta','本地零食','Sarinah / 超市','回程前方便購買。',11]
  ]);
  setSheetData_('attractions', ['item_id','city','name','type','note','map_url','sort_order'], [
    ['a1','峇里 Bali','Sanur Beach','海灘','較悠閒、適合散步與看日出。','',1],
    ['a2','峇里 Bali','Tanah Lot','寺廟 / 海景','峇里代表性景點之一。','',2],
    ['a3','峇里 Bali','Uluwatu Temple','寺廟 / 懸崖景','知名海崖神廟與日落地點。','',3],
    ['a4','日惹 Yogyakarta','Borobudur','世界遺產 / 佛塔','日惹最重要景點之一。','',4],
    ['a5','日惹 Yogyakarta','Prambanan','寺廟群','大型印度教寺廟建築。','',5],
    ['a6','日惹 Yogyakarta','Malioboro Street','購物 / 夜市','適合逛街與買手信。','',6],
    ['a7','日惹 Yogyakarta','Taman Sari','歷史景點','水宮與古城區風格景點。','',7],
    ['a8','雅加達 Jakarta','Monas','地標','雅加達最具代表性的紀念碑。','',8],
    ['a9','雅加達 Jakarta','Kota Tua','歷史城區','可看舊城與殖民時期建築。','',9],
    ['a10','雅加達 Jakarta','National Museum','博物館','了解印尼文化歷史。','',10],
    ['a11','雅加達 Jakarta','Sarinah / Grand Indonesia','購物','方便最後市區購物。','',11]
  ]);
  setSheetData_('notes', ['sort_order','note'], [
    [1,'請自行購買旅遊保險'],
    [2,'香港特區護照免簽但需要辦理印尼電子入境卡，並存儲 QR Code 以便入境時供移民官掃描。'],
    [3,'峇里島觀光稅已為香港出發成員繳付，在峇里匯合成員請自行辦理。'],
    [4,'現金可先在香港兌換美金，再到印尼當地找換店兌換印尼盾。'],
    [5,'網路：請先預備漫遊或購買 SIM 卡，必要時亦可在當地購買（Telkomsel 收訊較好）。'],
    [6,'飲水衛生：在印尼請嚴格飲用瓶裝水，避免生食冷飲。']
  ]);
  setSheetData_('itinerary', ['day_no','date','weekday','main_program','stay'], [
    [1,'11/7','星期六','8:00 機場集合 → 10:00 CX785 飛往峇里島 → 15:00 抵達峇里島','峇里島'],
    [2,'12/7','星期日','全天潛水活動','峇里島'],
    [3,'13/7','星期一','7:00 退房 → 天堂之門 → 丹娜樂神廟 → 16:30 搭渡輪前往爪哇島','爪哇島 Banyuwangi'],
    [4,'14/7','星期二','00:30 退房 → 伊真火山藍火夜間健行 → 早餐後返回','爪哇島 Banyuwangi'],
    [5,'15/7','星期三','03:00 出發 → 布羅莫火山日出 → 下午驅車前往日惹','日惹'],
    [6,'16/7','星期四','瓊卜浪洞穴（Jomblang Cave）+ 卡利蘇奇洞穴（Kalisuci Cave）活動','日惹'],
    [7,'17/7','星期五','婆羅浮屠佛塔 → Kurnia Seafood 午餐 → Malioboro 夜市購物 → 晚上搭夜車前往雅加達','火車上'],
    [8,'18/7','星期六','凌晨約 03:30 抵達雅加達 Gambir 車站 → 雅加達參觀','雅加達'],
    [9,'19/7','星期日','雅加達分組活動','雅加達'],
    [10,'20/7','星期一','12:20 到達雅加達機場 → 14:20 CX776 返回香港 → 20:30 抵達香港','-']
  ]);
  setSheetData_('flights', ['direction','route','flight_no','depart_time','arrive_time','checked_baggage','carry_on'], [
    ['去程','香港至峇里','CX785','1000','1500','23KG','7KG'],
    ['回程','雅加達至香港','CX776','1420','2030','23KG','7KG']
  ]);
  setSheetData_('hotels', ['date','location','hotel_name'], [
    ['11/7','峇里島','峇里島沙努爾皇宮大酒店'],
    ['12/7','峇里島','峇里島沙努爾皇宮大酒店'],
    ['18/7','雅加達','阿里亞杜塔門騰酒店'],
    ['19/7','雅加達','阿里亞杜塔門騰酒店']
  ]);
  setSheetData_('emergency_contacts', ['contact_id','category','name','phone','whatsapp','note','sort_order'], [
    ['e1','團隊','莫穎民','61070452','61070452','超管 / 主要聯絡',1],
    ['e2','集合','香港國際機場 Terminal 1','0745','','11/7 集合',2],
    ['e3','解散','香港國際機場 Terminal 1','2130','','20/7 解散',3]
  ]);
  setSheetData_('emergency_actions', ['scenario','primary_contact','primary_phone','secondary_contact','secondary_phone','note'], [
    ['護照遺失','莫穎民','61070452','','','先通知領隊，不要自行離隊處理'],
    ['發燒或明顯不適','莫穎民','61070452','','','立即通知領隊及同房同工'],
    ['走失 / 跟不上隊伍','莫穎民','61070452','','','原地等候並保持電話暢通'],
    ['受傷','莫穎民','61070452','','','先確保安全，再等領隊安排'],
    ['家長緊急查詢','莫穎民','61070452','','','由主要聯絡統一回覆']
  ]);
  setSheetData_('phrases_id', ['phrase_id','chinese','english','indonesian','note','sort_order'], [
    ['p1','你好','Hello','Halo','',1],
    ['p2','謝謝','Thank you','Terima kasih','',2],
    ['p3','多少錢？','How much?','Berapa harganya?','',3],
    ['p4','洗手間在哪裡？','Where is the toilet?','Di mana toilet?','',4],
    ['p5','我需要幫助','I need help','Saya butuh bantuan','',5]
  ]);
  setSheetData_('recommended_apps', ['app_id','name','platform','purpose','download_url','note','sort_order'], [
    ['app1','Google Maps','iOS / Android','地圖與導航','https://www.google.com/maps','建議先儲存酒店及重要地點',1],
    ['app2','Google Translate','iOS / Android','翻譯','https://translate.google.com/','可下載離線語言包',2],
    ['app3','WhatsApp','iOS / Android','聯絡通訊','https://www.whatsapp.com/','印尼常用通訊工具',3],
    ['app4','Grab','iOS / Android','叫車','https://www.grab.com/','東南亞常用',4],
    ['app5','Gojek','iOS / Android','印尼本地叫車 / 外送','https://www.gojek.com/','印尼常用 app',5],
    ['app6','MyTelkomsel','iOS / Android','管理 SIM / 數據','https://www.telkomsel.com/','如使用 Telkomsel 可考慮安裝',6]
  ]);
  return { message: 'Sheets initialized' };
}

function login_(username, password) {
  const user = findUser_(username);
  if (!user || !bool_(user.active)) throw new Error('帳號不存在或已停用');
  if (String(user.password) !== String(password)) throw new Error('帳號或密碼錯誤');
  return { session: { username: user.username, role: user.role, display_name: user.display_name, member_id: user.member_id } };
}

function getBootstrap_(session) {
  const safeSession = session && session.username ? verifySession_(session) : null;
  const configRows = getRows_('CONFIG');
  const configMap = {}; configRows.forEach(r => configMap[r.key] = r.value);
  let cards = getRows_('CARDS').filter(r => bool_(r.enabled)).sort((a,b)=>(+a.sort_order)-(+b.sort_order));
  cards = cards.filter(card => visibleFor_(card, safeSession));
  return { bootstrap: { configMap, session: safeSession }, cards };
}
function visibleFor_(card, session) {
  const ranks = { public:0, member:1, leader:2, superadmin:3 };
  const role = session ? session.role : 'public';
  let allowed = (ranks[role] || 0) >= (ranks[card.visibility] || 0);
  if (session) {
    const overrides = getRows_('USER_CARD_ACCESS').filter(r => r.username == session.username && r.card_id == card.card_id);
    if (overrides.length) allowed = bool_(overrides[overrides.length - 1].allowed);
  }
  return allowed;
}

function getCardData_(session, cardId) {
  const safe = session && session.username ? verifySession_(session) : null;
  const card = getRows_('CARDS').find(r => r.card_id == cardId);
  if (!card) throw new Error('Card not found');
  if (!visibleFor_(card, safe)) throw new Error('Permission denied');
  if (cardId === 'weather') return { card, rows: fetchWeather_(), meta: {} };
  if (cardId === 'exchange_rates') return { card, rows: fetchRates_(), meta: {} };
  if (cardId === 'emergency_contacts') return { card, rows: getEmergencyContactsFor_(safe), meta: {} };
  let rows = getRows_(card.target_sheet);
  if (cardId === 'members_all') requireRole_(safe, 'leader');
  return { card, rows, meta: {} };
}
function getMyProfile_(session) {
  const safe = verifySession_(session); requireRole_(safe, 'member');
  const row = getRows_('MEMBERS').find(r => String(r.member_id) === String(safe.member_id));
  return { profile: row || null };
}
function updateOwnPassword_(session, newPassword) {
  const safe = verifySession_(session); if (!newPassword) throw new Error('Missing password');
  const sh = sh_('USER'); const values = sh.getDataRange().getValues();
  const headers = values[0]; const idxUser = headers.indexOf('username'); const idxPw = headers.indexOf('password');
  for (let i=1;i<values.length;i++) if (String(values[i][idxUser]) === String(safe.username)) { sh.getRange(i+1, idxPw+1).setValue(newPassword); return { message:'updated' }; }
  throw new Error('User not found');
}

function adminListUsers_(session) { const safe = verifySession_(session); requireRole_(safe, 'superadmin'); return { rows: getRows_('USER') }; }
function adminUpdateUser_(session, username, updates) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('USER'); const values = sh.getDataRange().getValues(); const headers = values[0];
  const row = values.findIndex((r,i)=> i>0 && String(r[headers.indexOf('username')]) === String(username));
  if (row < 1) throw new Error('User not found');
  Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); });
  return { message:'updated' };
}
function adminToggleUserActive_(session, username) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('USER'); const values = sh.getDataRange().getValues(); const headers = values[0];
  const iUser = headers.indexOf('username'), iActive = headers.indexOf('active');
  for (let i=1;i<values.length;i++) if (String(values[i][iUser]) === String(username)) { sh.getRange(i+1, iActive+1).setValue(!bool_(values[i][iActive])); return { message:'toggled' }; }
  throw new Error('User not found');
}
function adminListCards_(session) { const safe = verifySession_(session); requireRole_(safe, 'superadmin'); return { rows: getRows_('CARDS') }; }
function adminToggleCard_(session, cardId) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('CARDS'); const values = sh.getDataRange().getValues(); const headers = values[0];
  const iId = headers.indexOf('card_id'), iEnabled = headers.indexOf('enabled');
  for (let i=1;i<values.length;i++) if (String(values[i][iId]) === String(cardId)) { sh.getRange(i+1, iEnabled+1).setValue(!bool_(values[i][iEnabled])); return { message:'toggled' }; }
  throw new Error('Card not found');
}
function adminUpdateCard_(session, cardId, updates) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('CARDS'); const values = sh.getDataRange().getValues(); const headers = values[0];
  const row = values.findIndex((r,i)=> i>0 && String(r[headers.indexOf('card_id')]) === String(cardId));
  if (row < 1) throw new Error('Card not found');
  Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); });
  return { message:'updated' };
}
function adminSetUserCardAccess_(session, username, cardId, allowed) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('USER_CARD_ACCESS'); sh.appendRow([username, cardId, allowed ? 'TRUE' : 'FALSE']);
  return { message:'saved' };
}

function fetchWeather_() {
  const locations = getRows_('weather_locations').filter(r => bool_(r.enabled));
  return locations.map(loc => {
    const data = JSON.parse(UrlFetchApp.fetch(loc.api_url, { muteHttpExceptions: true }).getContentText());
    return {
      city: loc.label || loc.city,
      current_temp: data.current && data.current.temperature_2m,
      apparent_temp: data.current && data.current.apparent_temperature,
      wind_speed: data.current && data.current.wind_speed_10m,
      temp_max: data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0],
      temp_min: data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[0],
      precipitation: data.daily && data.daily.precipitation_sum && data.daily.precipitation_sum[0],
      time: data.current && data.current.time
    };
  });
}
function fetchRates_() {
  const pairs = getRows_('exchange_rates').filter(r => bool_(r.enabled));
  const neededBases = [...new Set(pairs.map(r => r.base))];
  const cache = {};
  neededBases.forEach(base => {
    const url = 'https://open.er-api.com/v6/latest/' + encodeURIComponent(base);
    cache[base] = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  });
  return pairs.map(p => ({ pair: p.pair, rate: cache[p.base] && cache[p.base].rates ? cache[p.base].rates[p.target] : null, updated_at: cache[p.base] && cache[p.base].time_last_update_utc }));
}
