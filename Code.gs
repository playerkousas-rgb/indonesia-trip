const SPREADSHEET_ID = '1yu0RbgYQyx4jPz63hqDp_aI_zyKXoV00jyUyOp7XCKU';

const DEFAULT_CARDS = [
  ['overview','行程總覽','查看 10 天活動安排','🗓️','itinerary','public',1,'TRUE','TRUE'],
  ['flights','航班資訊','查看航班與機場安排','✈️','flights','public',2,'TRUE','TRUE'],
  ['hotels','酒店資訊','查看住宿資料','🏨','hotels','public',3,'TRUE','TRUE'],
  ['transport_info','交通資訊','機場、車站與酒店之間交通','🚐','transport_info','public',3.5,'TRUE','TRUE'],
  ['notes','備忘事項','出發前的重要提醒','📝','notes','public',4,'TRUE','TRUE'],
  ['packing','物資清單','家長 / 成員可自行核對','🎒','packing_list','public',5,'TRUE','TRUE'],
  ['emergency_actions','緊急時應如何處理','按情況快速知道應通知誰及如何做','🚨','emergency_actions','public',6,'TRUE','TRUE'],
  ['team_rules','團友手則','出發前必讀的重要守則','📘','team_rules','public',6.5,'TRUE','TRUE'],
  ['emergency_contacts','緊急聯絡清單','領袖及支援聯絡電話','📞','emergency_contacts','public',7,'TRUE','TRUE'],
  ['emergency_member_info','個人緊急聯絡資料','成員查看自己的電話及緊急聯絡資料；領袖可查看全體','🆘','emergency_member_info','member',7.2,'TRUE','FALSE'],
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

function doGet() { return output({ ok: true, message: 'API running' }); }
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    let result;
    switch (req.action) {
      case 'initSheets': result = initSheets_(); break;
      case 'appendLatestUpdates': result = appendLatestUpdates(); break;
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

function output(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sh_(name) { const s = ss_().getSheetByName(name); if (!s) throw new Error('Missing sheet: ' + name); return s; }
function bool_(v) { return String(v).toUpperCase() === 'TRUE' || v === true || v === 'Yes' || v === '是'; }
function requireRole_(session, role) { const ranks = { public:0, member:1, leader:2, superadmin:3 }; if ((ranks[session?.role || 'public'] || 0) < ranks[role]) throw new Error('Permission denied'); }
function getRows_(sheetName) {
  const sh = sh_(sheetName), values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h,i)=>[String(h).trim(), r[i]])));
}
function setSheetData_(name, headers, rows) {
  const ss = ss_(); let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  sh.clearContents(); sh.getRange(1,1,1,headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  sh.autoResizeColumns(1, headers.length); return sh;
}
function ensureSheetHeaders_(sheetName, headers) {
  const ss = ss_(); let sh = ss.getSheetByName(sheetName);
  if (!sh) { sh = ss.insertSheet(sheetName); sh.getRange(1,1,1,headers.length).setValues([headers]); return sh; }
  const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0].map(String);
  headers.forEach(h => { if (current.indexOf(h) === -1) sh.getRange(1, sh.getLastColumn()+1).setValue(h); });
  sh.autoResizeColumns(1, sh.getLastColumn()); return sh;
}
function upsertRowsByKey_(sheetName, headers, keyField, rows) {
  const sh = ensureSheetHeaders_(sheetName, headers), data = sh.getDataRange().getValues(), allHeaders = data[0].map(String), keyIndex = allHeaders.indexOf(keyField), keyMap = {};
  for (var i=1;i<data.length;i++) keyMap[String(data[i][keyIndex])] = i + 1;
  rows.forEach(obj => {
    const rowArray = allHeaders.map(h => obj[h] != null ? obj[h] : '');
    const key = String(obj[keyField]);
    if (keyMap[key]) sh.getRange(keyMap[key],1,1,allHeaders.length).setValues([rowArray]); else sh.appendRow(rowArray);
  });
  sh.autoResizeColumns(1, sh.getLastColumn());
}
function upsertCardRow_(card) { upsertRowsByKey_('CARDS', ['card_id','title','description','icon','target_sheet','visibility','sort_order','enabled','editable_in_admin'], 'card_id', [card]); }
function findUser_(username) { return getRows_('USER').find(r => String(r.username).trim() === String(username).trim()); }
function verifySession_(session) {
  if (!session || !session.username) return null;
  const user = findUser_(session.username);
  if (!user || !bool_(user.active)) throw new Error('Session invalid');
  return { username:user.username, role:user.role, display_name:user.display_name, member_id:user.member_id };
}

function setSheetColors_() {
  const map = { CONFIG:'#c7d2fe', CARDS:'#bfdbfe', USER_CARD_ACCESS:'#ddd6fe', USER:'#fecaca', MEMBERS:'#fecaca', itinerary:'#fef3c7', flights:'#fef3c7', hotels:'#fef3c7', notes:'#fef3c7', packing_list:'#fef3c7', weather_locations:'#bfdbfe', exchange_rates:'#bfdbfe', restaurants:'#dcfce7', souvenirs:'#dcfce7', attractions:'#dcfce7', marine_life:'#dcfce7', diving_notes:'#dcfce7', hiking_notes:'#dcfce7', phrases_id:'#e9d5ff', recommended_apps:'#e9d5ff', emergency_contacts:'#fecdd3', emergency_actions:'#fecdd3', emergency_member_info:'#fecdd3', transport_info:'#fef3c7', team_rules:'#fde68a' };
  ss_().getSheets().forEach(sh => { const color = map[sh.getName()]; if (color) sh.setTabColor(color); });
}

function initSheets_() {
  setSheetData_('CONFIG', ['key','value','note'], [
    ['site_name','童遊世界‧印尼活動備忘','網站名稱'], ['trip_start','2026-07-11','開始日期'], ['trip_end','2026-07-20','結束日期'], ['theme_color','#0f766e','主色'],
    ['public_enabled','TRUE','公開開關'], ['member_login_enabled','TRUE','成員登入'], ['leader_login_enabled','TRUE','領袖登入'], ['admin_panel_enabled','TRUE','管理頁']
  ]);
  setSheetData_('CARDS', ['card_id','title','description','icon','target_sheet','visibility','sort_order','enabled','editable_in_admin'], DEFAULT_CARDS);
  setSheetData_('USER_CARD_ACCESS', ['username','card_id','allowed'], [
    ['wingman','emergency_contacts','TRUE'], ['wingman','emergency_member_info','TRUE'],
    ['ddc.training@skwscout.org.hk','emergency_contacts','TRUE'], ['ddc.training@skwscout.org.hk','emergency_member_info','TRUE'],
    ['dc@skwscout.org.hk','emergency_contacts','TRUE'], ['dc@skwscout.org.hk','emergency_member_info','TRUE']
  ]);
  setSheetData_('weather_locations', ['location_id','city','label','api_type','api_url','marine_url','note','enabled'], [
    ['bali','Bali','峇里','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-8.65&longitude=115.2167&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&timezone=auto','https://marine-api.open-meteo.com/v1/marine?latitude=-8.65&longitude=115.2167&daily=sea_surface_temperature&timezone=auto','Denpasar / Bali（海水溫度只需要峇里）','TRUE'],
    ['yogyakarta','Yogyakarta','日惹','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-7.7956&longitude=110.3695&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&timezone=auto','','Yogyakarta','TRUE'],
    ['jakarta','Jakarta','雅加達','open-meteo','https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&current=temperature_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&timezone=auto','','Jakarta','TRUE']
  ]);
  setSheetData_('exchange_rates', ['pair','base','target','enabled'], [['HKD/USD','HKD','USD','TRUE'],['HKD/IDR','HKD','IDR','TRUE'],['USD/IDR','USD','IDR','TRUE']]);
  setSheetData_('packing_list', ['item_id','category','item_name','quantity','note','required','sort_order','prechecked'], [
    ['p1','出發必備文件','護照',1,'請自行確認有效期','TRUE',1,'FALSE'], ['p2','出發必備文件','印尼電子入境卡 QR Code',1,'截圖及離線保存','TRUE',2,'FALSE'],
    ['p3','出發必備文件','旅遊保險資料',1,'建議列印或 PDF 離線備份','TRUE',3,'FALSE'], ['p4','出發必備文件','機票 / 航班資料截圖',1,'由領袖預備，成員不用自行準備','TRUE',4,'TRUE'],
    ['p5','金錢與付款','港幣 / 美金 / 印尼盾',1,'建議分開存放','TRUE',5,'FALSE'], ['p6','金錢與付款','信用卡 / ATM 卡',1,'開通海外交易','FALSE',6,'FALSE'],
    ['p7','手機與充電','手機',1,'出發前充滿電','TRUE',7,'FALSE'], ['p8','手機與充電','充電線',1,'iPhone / Type-C 請帶對應線材','TRUE',8,'FALSE'], ['p9','手機與充電','尿袋',1,'留意飛行攜帶規定','TRUE',9,'FALSE'], ['p10','手機與充電','轉插 / 萬用插頭',1,'酒店房間插座未必完全相同','FALSE',10,'FALSE'], ['p11','手機與充電','SIM / eSIM / 漫遊',1,'建議出發前先開通','TRUE',11,'FALSE'],
    ['p12','日常換洗衣物','透氣短袖上衣',4,'炎熱天氣用','TRUE',12,'FALSE'], ['p13','日常換洗衣物','快乾長褲 / 長運動褲',2,'適合移動及戶外活動','TRUE',13,'FALSE'], ['p14','日常換洗衣物','內衣褲',8,'潛水、漂流及上山後都可能要額外更換','TRUE',14,'FALSE'], ['p15','日常換洗衣物','襪',6,'火山健行日特別要足夠','TRUE',15,'FALSE'], ['p16','日常換洗衣物','睡衣',1,'酒店住宿用','TRUE',16,'FALSE'],
    ['p17','鞋襪與外出穿著','步行鞋 / 運動鞋',1,'適合長時間步行與上下坡','TRUE',17,'FALSE'], ['p18','鞋襪與外出穿著','拖鞋 / 涼鞋',1,'酒店 / 沖身用','FALSE',18,'FALSE'],
    ['p19','防曬防雨用品','帽',1,'防曬用','FALSE',19,'FALSE'], ['p20','防曬防雨用品','太陽眼鏡',1,'日照強時有用','FALSE',20,'FALSE'], ['p21','防曬防雨用品','防曬用品',1,'SPF 建議足夠','FALSE',21,'FALSE'], ['p22','防曬防雨用品','輕便雨衣 / 摺傘',1,'天氣變化時備用','FALSE',22,'FALSE'],
    ['p23','個人清潔用品','牙刷牙膏',1,'個人用品','TRUE',23,'FALSE'], ['p24','個人清潔用品','快乾毛巾',1,'玩水活動後更方便','FALSE',24,'FALSE'], ['p25','個人清潔用品','紙巾 / 濕紙巾',1,'外出常用','TRUE',25,'FALSE'],
    ['p26','健康與安全用品','個人藥物',1,'如有需要必須自備','TRUE',26,'FALSE'], ['p27','健康與安全用品','腸胃藥 / 暈浪丸',1,'按個人情況','FALSE',27,'FALSE'], ['p28','健康與安全用品','驅蚊用品',1,'戶外活動較有用','FALSE',28,'FALSE'],
    ['p29','日間活動用品','水樽',1,'保持補水','FALSE',29,'FALSE'], ['p30','日間活動用品','小背囊 / 日用袋',1,'日間活動使用','TRUE',30,'FALSE'],
    ['p31','玩水及活動後更換用品','泳衣 / 內穿衣物',2,'潛水及玩水活動用','TRUE',31,'FALSE'], ['p32','玩水及活動後更換用品','活動後替換衣物',2,'潛水及漂流後更換','TRUE',32,'FALSE'], ['p33','玩水及活動後更換用品','防水袋 / 濕衣袋',2,'濕衣物及電子用品分開存放','FALSE',33,'FALSE'], ['p34','玩水及活動後更換用品','可下水的涼鞋 / 水陸兩用鞋',1,'潛水中心通常會提供面鏡、蛙鞋、呼吸器、BCD、配重及防寒衣；鞋是否提供視乎中心而定，自備較穩陣。一般岸潛或漂流建議自備可下水鞋。','FALSE',34,'FALSE'],
    ['p35','上山保暖用品','風衣 / 防風外套',1,'凌晨上山及看日出很需要','TRUE',35,'FALSE'], ['p36','上山保暖用品','保暖衣物 / 薄抓毛',1,'山區清晨較冷，建議可與風衣配搭','TRUE',36,'FALSE'], ['p37','上山保暖用品','長褲',1,'上山日建議穿著','TRUE',37,'FALSE'], ['p38','上山保暖用品','保暖襪',1,'清晨火山區較冷','FALSE',38,'FALSE'], ['p39','上山保暖用品','頭燈 / 小電筒',1,'如自行有可帶備；夜行更方便','FALSE',39,'FALSE'], ['p40','上山保暖用品','口罩',2,'火山灰或塵土時可用','FALSE',40,'FALSE'], ['p41','出發前家長確認','已向家長交代聯絡方法',1,'出發前確認','TRUE',41,'FALSE']
  ]);
  setSheetData_('marine_life', ['species_id','city','species_name','category','note','sort_order'], [['m1','峇里 Bali','海龜','大型海洋生物','在部分潛點有機會遇見',1],['m2','峇里 Bali','小丑魚','礁魚','常見於珊瑚區',2],['m3','峇里 Bali','鸚哥魚','礁魚','常見、顏色鮮豔',3],['m4','峇里 Bali','魔鬼魚 / Manta Ray','大型海洋生物','部分海域有機會見到',4],['m5','峇里 Bali','翻車魚 / Mola Mola','季節性大型魚類','通常 7-10 月較有機會',5],['m6','峇里 Bali','珊瑚','海洋生態','觀察時請勿觸摸或踩踏',6]]);
  setSheetData_('diving_notes', ['sort_order','title','note'], [[1,'下水前聽清楚 briefing','包括集合位置、下水方式、最大深度、上水訊號及 buddy 安排。'],[2,'保持慢而穩定呼吸','不要憋氣，不要因緊張而急促呼吸。'],[3,'耳壓不適立即示意','耳痛、頭暈或不舒服時不要勉強下潛。'],[4,'與 buddy 保持視線','不要單獨離開隊伍，隨時知道同伴位置。'],[5,'只看不碰','海龜、珊瑚、海葵、小丑魚等都不應觸摸或追逐。'],[6,'留意當地常見海洋生物','峇里常見可見小丑魚、蝶魚、神仙魚、海龜、鸚哥魚；部分地點及季節有機會見到 Manta Ray 或 Mola Mola。'],[7,'上水後先補水休息','完成活動後先補水、休息，再聽從下一步安排。']]);
  setSheetData_('hiking_notes', ['sort_order','title','note'], [[1,'凌晨出發屬正常','伊真及布羅莫行程多在深夜或清晨進行，要預早休息。'],[2,'保暖與防風要做足','山區清晨溫度可明顯較低，外套非常重要。'],[3,'跟緊隊伍不要逞強','不要自己衝前或落後太多，體力不足要盡早示意。'],[4,'火山地形碎石多','地面可能有火山灰、沙石及斜坡，每一步都要踏穩。'],[5,'身體不適立即講','頭暈、氣促、膝痛、作嘔等要立即通知領袖或教練。'],[6,'看日出時注意邊位安全','拍照前先站穩，不要只顧取景。']]);
  setSheetData_('restaurants', ['item_id','city','name','category','note','map_url','sort_order'], [['r1','峇里 Bali','Massimo (Sanur)','意大利 / 家庭友善','Sanur 區知名，適合較輕鬆用餐。','',1],['r2','峇里 Bali','Genius Cafe','海邊 Cafe','海邊環境輕鬆，適合早餐或簡餐。','',2],['r3','峇里 Bali','Soul on the Beach','海景餐廳','Sanur 海邊用餐選擇。','',3],['r4','日惹 Yogyakarta','Bale Raos','爪哇皇室料理','靠近王宮，適合體驗在地特色。','',4],['r5','日惹 Yogyakarta','The House of Raminten','特色印尼料理','氣氛特別，遊客常去。','',5],['r6','日惹 Yogyakarta','ViaVia Jogja','旅人友善 / 綜合菜式','選擇多。','',6],['r7','雅加達 Jakarta','Bandar Djakarta','海鮮','適合多人聚餐。','',7],['r8','雅加達 Jakarta','Plataran Menteng','高質印尼菜','環境較正式。','',8],['r9','雅加達 Jakarta','Lara Djonggrang','印尼特色餐廳','裝潢有特色。','',9]]);
  setSheetData_('souvenirs', ['item_id','city','item_name','best_place','note','sort_order'], [['s1','峇里 Bali','Batik / Sarong','Ubud / 當地市場','最常見又易帶走。',1],['s2','峇里 Bali','銀飾','Celuk Village','想買飾物可留意真材質。',2],['s3','峇里 Bali','木雕 / 面具','Mas / Ubud Art Market','有地方文化特色。',3],['s4','峇里 Bali','Kopi Luwak / 咖啡','包裝店 / 機場','建議買密封包裝。',4],['s5','日惹 Yogyakarta','Batik','Beringharjo Market / Mirota Batik','日惹代表性手信。',5],['s6','日惹 Yogyakarta','Bakpia','Bakpia Pathok','經典可食用手信。',6],['s7','日惹 Yogyakarta','銀器 / 銀飾','Kotagede','日惹著名銀器區。',7],['s8','日惹 Yogyakarta','地方零食 / 朱古力','Chocolate Monggo / souvenir shops','較易分送。',8],['s9','雅加達 Jakarta','Batik 配件','Sarinah / Thamrin City','城市中較方便買。',9],['s10','雅加達 Jakarta','Wayang 皮影 / 木偶','Pasar Seni / souvenir stores','具印尼文化特色。',10],['s11','雅加達 Jakarta','本地零食','Sarinah / 超市','回程前方便購買。',11]]);
  setSheetData_('attractions', ['item_id','city','name','type','note','map_url','sort_order'], [['a1','峇里 Bali','Sanur Beach','海灘','較悠閒、適合散步與看日出。','',1],['a2','峇里 Bali','Tanah Lot','寺廟 / 海景','峇里代表性景點之一。','',2],['a3','峇里 Bali','Uluwatu Temple','寺廟 / 懸崖景','知名海崖神廟與日落地點。','',3],['a4','日惹 Yogyakarta','Borobudur','世界遺產 / 佛塔','日惹最重要景點之一。','',4],['a5','日惹 Yogyakarta','Prambanan','寺廟群','大型印度教寺廟建築。','',5],['a6','日惹 Yogyakarta','Malioboro Street','購物 / 夜市','適合逛街與買手信。','',6],['a7','日惹 Yogyakarta','Taman Sari','歷史景點','水宮與古城區風格景點。','',7],['a8','雅加達 Jakarta','Monas','地標','雅加達最具代表性的紀念碑。','',8],['a9','雅加達 Jakarta','Kota Tua','歷史城區','可看舊城與殖民時期建築。','',9],['a10','雅加達 Jakarta','National Museum','博物館','了解印尼文化歷史。','',10],['a11','雅加達 Jakarta','Sarinah / Grand Indonesia','購物','方便最後市區購物。','',11]]);
  setSheetData_('notes', ['sort_order','note'], [[1,'請自行購買旅遊保險'],[2,'香港特區護照免簽但需要辦理印尼電子入境卡，並存儲 QR Code 以便入境時供移民官掃描。'],[3,'峇里島觀光稅已為香港出發成員繳付，在峇里匯合成員請自行辦理。'],[4,'現金可先在香港兌換美金，再到印尼當地找換店兌換印尼盾。'],[5,'網路：請先預備漫遊或購買 SIM 卡，必要時亦可在當地購買（Telkomsel 收訊較好）。'],[6,'飲水衛生：在印尼請嚴格飲用瓶裝水，避免生食冷飲。']]);
  setSheetData_('itinerary', ['day_no','date','weekday','main_program','stay'], [[1,'11/7','星期六','8:00 機場集合 → 10:00 CX785 飛往峇里島 → 15:00 抵達峇里島','峇里島'],[2,'12/7','星期日','全天潛水活動','峇里島'],[3,'13/7','星期一','7:00 退房 → 天堂之門 → 丹娜樂神廟 → 16:30 搭渡輪前往爪哇島','爪哇島 Banyuwangi'],[4,'14/7','星期二','00:30 退房 → 伊真火山藍火夜間健行 → 早餐後返回','爪哇島 Banyuwangi'],[5,'15/7','星期三','03:00 出發 → 布羅莫火山日出 → 下午驅車前往日惹','日惹'],[6,'16/7','星期四','瓊卜浪洞穴（Jomblang Cave）+ 卡利蘇奇洞穴（Kalisuci Cave）活動','日惹'],[7,'17/7','星期五','婆羅浮屠佛塔 → Kurnia Seafood 午餐 → Malioboro 夜市購物 → 晚上搭夜車前往雅加達','火車上'],[8,'18/7','星期六','凌晨約 03:30 抵達雅加達 Gambir 車站 → 雅加達參觀','雅加達'],[9,'19/7','星期日','雅加達分組活動','雅加達'],[10,'20/7','星期一','12:20 到達雅加達機場 → 14:20 CX776 返回香港 → 20:30 抵達香港','-']]);
  setSheetData_('flights', ['direction','route','flight_no','depart_time','arrive_time','checked_baggage','carry_on'], [['去程','香港至峇里','CX785','1000','1500','23KG','7KG'],['回程','雅加達至香港','CX776','1420','2030','23KG','7KG']]);
  setSheetData_('hotels', ['date','location','hotel_name','address','phone','booking_id','order_id','pin_code','map_url','transport_note'], [['11/7','峇里島','峇里島沙努爾大皇宮酒店','Jalan Hang Tuah, Sanur Kaja, Denpasar Selatan, Bali 80227, Indonesia','+62 361 2012000','1359044796652003','1359044796651644','1351','https://www.google.com/maps/search/?api=1&query=Bali+Beach+Hotel+Sanur','機場至酒店請參考 transport_info 工作表'],['12/7','峇里島','峇里島沙努爾大皇宮酒店','Jalan Hang Tuah, Sanur Kaja, Denpasar Selatan, Bali 80227, Indonesia','+62 361 2012000','1359044796652003','1359044796651644','1351','https://www.google.com/maps/search/?api=1&query=Bali+Beach+Hotel+Sanur','本地遊車接送'],['18/7','雅加達','Aryaduta Menteng','Jl. Prajurit KKO Usman Harun No.44-48, Jakarta Pusat, Indonesia','+62 21 23521234','1725058563','','','https://www.google.com/maps/search/?api=1&query=Aryaduta+Menteng+Jakarta','酒店至機場請參考 transport_info 工作表'],['19/7','雅加達','Aryaduta Menteng','Jl. Prajurit KKO Usman Harun No.44-48, Jakarta Pusat, Indonesia','+62 21 23521234','1725058563','','','https://www.google.com/maps/search/?api=1&query=Aryaduta+Menteng+Jakarta','酒店至機場請參考 transport_info 工作表']]);
  setSheetData_('transport_info', ['transport_id','route','from_place','to_place','method','estimated_time','estimated_cost','note','sort_order'], [['t1','機場 → 峇里酒店','Ngurah Rai International Airport (DPS)','峇里島沙努爾大皇宮酒店','的士 / Grab / 預約接送','約 25–40 分鐘','約 IDR 150,000–250,000','視乎交通及接送安排；如深夜或多人同行，預約接送較方便。',1],['t2','Gambir 車站 → 雅加達酒店','Gambir Station','Aryaduta Menteng','的士 / Grab','約 10–20 分鐘','約 IDR 40,000–100,000','凌晨抵達時建議全隊一同離站，先集合再上車。',2],['t3','雅加達酒店 → 機場','Aryaduta Menteng','Soekarno-Hatta International Airport (CGK)','的士 / Grab / 酒店代叫車','約 45–90 分鐘','約 IDR 180,000–350,000 + toll','雅加達交通浮動很大，建議預留充足時間。',3]]);
  setSheetData_('emergency_contacts', ['contact_id','name','phone','whatsapp','note','sort_order'], [['e1','莫穎民','61070452','61070452','隨隊領袖',1],['e2','袁可秀','90340099','90340099','區總監',2],['e3','文幹皓','68572996','68572996','副區總監',3]]);
  setSheetData_('emergency_actions', ['scenario','primary_contact','primary_phone','secondary_contact','secondary_phone','note'], [['護照遺失','莫穎民','61070452','','','先通知領隊，不要自行離隊處理'],['發燒或明顯不適','莫穎民','61070452','','','立即通知領隊及同房同工'],['走失 / 跟不上隊伍','莫穎民','61070452','','','原地等候並保持電話暢通'],['受傷','莫穎民','61070452','','','先確保安全，再等領隊安排'],['家長緊急查詢','莫穎民','61070452','','','由主要聯絡統一回覆']]);
  setSheetData_('emergency_member_info', ['member_id','display_name','member_phone','emergency_contact_name','emergency_contact_phone','note'], []);
  setSheetData_('team_rules', ['sort_order','rule'], [[1,'必須遵守領袖的規則及指示。'],[2,'時刻自我警惕，保持行為恰當。特別是在機場、飛機上及活動場地應保持良好儀態，維護香港童軍的形象。'],[3,'不論在活動前集訓、探訪期間、旅途中及活動期間，定必配合領袖之指示。'],[4,'除合法夫婦外，男女成員需要分開房間住宿。'],[5,'未滿十八歲者不準吸煙或飲酒，並遵守當地法律要求。'],[6,'本人明白行程中活動有一定風險，必須依教練指示進行活動。']]);
  setSheetData_('phrases_id', ['phrase_id','chinese','english','indonesian','note','sort_order'], [['p1','你好','Hello','Halo','',1],['p2','謝謝','Thank you','Terima kasih','',2],['p3','多少錢？','How much?','Berapa harganya?','',3],['p4','洗手間在哪裡？','Where is the toilet?','Di mana toilet?','',4],['p5','我需要幫助','I need help','Saya butuh bantuan','',5],['p6','請幫幫我','Please help me','Tolong bantu saya','緊急時可用',6],['p7','我迷路了','I am lost','Saya tersesat','走失時可用',7],['p8','這裡可以刷卡嗎？','Can I pay by card?','Bisa bayar pakai kartu?','付款時可用',8],['p9','我不吃辣','I do not eat spicy food','Saya tidak makan pedas','點餐時可用',9]]);
  setSheetData_('recommended_apps', ['app_id','name','platform','purpose','download_url','note','sort_order'], [['app1','Google Maps','iOS / Android','地圖與導航','https://www.google.com/maps','建議先儲存酒店及重要地點',1],['app2','Google Translate','iOS / Android','翻譯','https://translate.google.com/','可下載離線語言包',2],['app3','WhatsApp','iOS / Android','聯絡通訊','https://www.whatsapp.com/','印尼常用通訊工具',3],['app4','Grab','iOS / Android','叫車','https://www.grab.com/','東南亞常用',4],['app5','Gojek','iOS / Android','印尼本地叫車 / 外送','https://www.gojek.com/','印尼常用 app',5],['app6','MyTelkomsel','iOS / Android','管理 SIM / 數據','https://www.telkomsel.com/','如使用 Telkomsel 可考慮安裝',6],['app7','Google Lens / Google Translate 相機翻譯','iOS / Android','拍照翻譯','https://translate.google.com/','可用相機拍招牌、餐牌、告示做即時翻譯。',7],['app8','Google Translate 語音翻譯','iOS / Android','語音翻譯','https://translate.google.com/','可做即時語音對話翻譯，亦可先下載離線語言包。',8],['app9','Traveloka','iOS / Android','印尼常用旅遊 / 酒店 / 門票','https://www.traveloka.com/','常用搜尋旅遊資料。',9],['app10','Grab / GrabFood','iOS / Android','叫車 / 外賣 / 搜尋餐廳','https://www.grab.com/','印尼可用，接近 Foodpanda + 叫車結合。',10],['app11','Gojek / GoFood','iOS / Android','叫車 / 外賣 / 本地餐飲','https://www.gojek.com/','印尼本地最常見之一，GoFood 很像 Foodpanda / Deliveroo。',11],['app12','PergiKuliner','Web / Mobile','餐廳搜尋 / 評價','https://pergikuliner.com/','較接近本地食評 / 餐廳搜尋平台。',12]]);
  setSheetColors_();
  return { message: 'Sheets initialized' };
}

function appendLatestUpdates() { setSheetColors_(); return { message: 'Latest updates ready' }; }

function login_(username, password) {
  const user = findUser_(username); if (!user || !bool_(user.active)) throw new Error('帳號不存在或已停用');
  if (String(user.password) !== String(password)) throw new Error('帳號或密碼錯誤');
  return { session: { username:user.username, role:user.role, display_name:user.display_name, member_id:user.member_id } };
}
function getBootstrap_(session) {
  const safeSession = session && session.username ? verifySession_(session) : null;
  const configMap = {}; getRows_('CONFIG').forEach(r => configMap[r.key] = r.value);
  let cards = getRows_('CARDS').filter(r => bool_(r.enabled)).sort((a,b)=>(+a.sort_order)-(+b.sort_order));
  cards = cards.filter(card => visibleFor_(card, safeSession));
  return { bootstrap: { configMap, session: safeSession }, cards };
}
function visibleFor_(card, session) {
  const ranks = { public:0, member:1, leader:2, superadmin:3 }, role = session ? session.role : 'public';
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
  if (cardId === 'emergency_member_info') return { card, rows: getEmergencyMemberInfoRows_(safe), meta: {} };
  if (cardId === 'members_all') requireRole_(safe, 'leader');
  return { card, rows: getRows_(card.target_sheet), meta: {} };
}
function getMyProfile_(session) { const safe = verifySession_(session); requireRole_(safe, 'member'); const row = getRows_('MEMBERS').find(r => String(r.member_id) === String(safe.member_id)); return { profile: row || null }; }
function updateOwnPassword_(session, newPassword) {
  const safe = verifySession_(session); if (!newPassword) throw new Error('Missing password');
  const sh = sh_('USER'), values = sh.getDataRange().getValues(), headers = values[0], idxUser = headers.indexOf('username'), idxPw = headers.indexOf('password');
  for (let i=1;i<values.length;i++) if (String(values[i][idxUser]) === String(safe.username)) { sh.getRange(i+1, idxPw+1).setValue(newPassword); return { message:'updated' }; }
  throw new Error('User not found');
}

function adminListUsers_(session) { const safe = verifySession_(session); requireRole_(safe, 'superadmin'); return { rows: getRows_('USER') }; }
function adminUpdateUser_(session, username, updates) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('USER'), values = sh.getDataRange().getValues(), headers = values[0], row = values.findIndex((r,i)=> i>0 && String(r[headers.indexOf('username')]) === String(username));
  if (row < 1) throw new Error('User not found'); Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); }); return { message:'updated' };
}
function adminToggleUserActive_(session, username) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('USER'), values = sh.getDataRange().getValues(), headers = values[0], iUser = headers.indexOf('username'), iActive = headers.indexOf('active');
  for (let i=1;i<values.length;i++) if (String(values[i][iUser]) === String(username)) { sh.getRange(i+1, iActive+1).setValue(!bool_(values[i][iActive])); return { message:'toggled' }; }
  throw new Error('User not found');
}
function adminListCards_(session) { const safe = verifySession_(session); requireRole_(safe, 'superadmin'); return { rows: getRows_('CARDS') }; }
function adminToggleCard_(session, cardId) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('CARDS'), values = sh.getDataRange().getValues(), headers = values[0], iId = headers.indexOf('card_id'), iEnabled = headers.indexOf('enabled');
  for (let i=1;i<values.length;i++) if (String(values[i][iId]) === String(cardId)) { sh.getRange(i+1, iEnabled+1).setValue(!bool_(values[i][iEnabled])); return { message:'toggled' }; }
  throw new Error('Card not found');
}
function adminUpdateCard_(session, cardId, updates) {
  const safe = verifySession_(session); requireRole_(safe, 'superadmin');
  const sh = sh_('CARDS'), values = sh.getDataRange().getValues(), headers = values[0], row = values.findIndex((r,i)=> i>0 && String(r[headers.indexOf('card_id')]) === String(cardId));
  if (row < 1) throw new Error('Card not found'); Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); }); return { message:'updated' };
}
function adminSetUserCardAccess_(session, username, cardId, allowed) { const safe = verifySession_(session); requireRole_(safe, 'superadmin'); sh_('USER_CARD_ACCESS').appendRow([username, cardId, allowed ? 'TRUE' : 'FALSE']); return { message:'saved' }; }

function getEmergencyContactsFor_(safe) { return getRows_('emergency_contacts').sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0)); }
function getEmergencyMemberInfoRows_(safe) {
  const members = getRows_('MEMBERS');
  const contacts = getEmergencyContactsFor_(safe);
  requireRole_(safe, 'member');
  if (safe.role === 'leader' || safe.role === 'superadmin') {
    return members.map(function(m) { return { member_id:m.member_id, display_name:(m.chinese_name || '') + (m.english_name ? ' / ' + m.english_name : ''), member_phone:m.phone || '', emergency_contact_name:m.parent_name || '', emergency_contact_phone:m.parent_phone || '', note:'緊急時可先通知隨隊領袖或香港支援，另可直接聯絡此成員之家屬。' }; });
  }
  const me = members.find(function(m) { return String(m.member_id) === String(safe.member_id); });
  if (!me) return [];
  const rows = [{ member_id:me.member_id, display_name:(me.chinese_name || '') + (me.english_name ? ' / ' + me.english_name : ''), member_phone:me.phone || '', emergency_contact_name:me.parent_name || '', emergency_contact_phone:me.parent_phone || '', note:'以下同時附上領袖及支援聯絡電話，以便當地緊急時即時聯絡。' }];
  contacts.forEach(function(c, i) { rows.push({ member_id:'leader-' + (i+1), display_name:c.name || '', member_phone:c.phone || '', emergency_contact_name:'', emergency_contact_phone:'', note:c.note || '' }); });
  return rows;
}

function fetchWeather_() {
  const locations = getRows_('weather_locations').filter(r => bool_(r.enabled));
  return locations.map(loc => {
    const data = JSON.parse(UrlFetchApp.fetch(loc.api_url, { muteHttpExceptions:true }).getContentText());
    let marine = null; if (loc.marine_url) { try { marine = JSON.parse(UrlFetchApp.fetch(loc.marine_url, { muteHttpExceptions:true }).getContentText()); } catch (e) {} }
    return { city:loc.label || loc.city, current_temp:data.current && data.current.temperature_2m, apparent_temp:data.current && data.current.apparent_temperature, wind_speed:data.current && data.current.wind_speed_10m, temp_max:data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0], temp_min:data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[0], tomorrow_max:data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[1], tomorrow_min:data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[1], precipitation:data.daily && data.daily.precipitation_sum && data.daily.precipitation_sum[0], sunrise:data.daily && data.daily.sunrise && data.daily.sunrise[0], sunset:data.daily && data.daily.sunset && data.daily.sunset[0], sea_temp:marine && marine.daily && marine.daily.sea_surface_temperature ? marine.daily.sea_surface_temperature[0] : '', time:data.current && data.current.time };
  });
}
function fetchRates_() {
  const pairs = getRows_('exchange_rates').filter(r => bool_(r.enabled)), neededBases = [...new Set(pairs.map(r => r.base))], cache = {};
  neededBases.forEach(base => { cache[base] = JSON.parse(UrlFetchApp.fetch('https://open.er-api.com/v6/latest/' + encodeURIComponent(base), { muteHttpExceptions:true }).getContentText()); });
  return pairs.map(p => ({ pair:p.pair, rate:cache[p.base] && cache[p.base].rates ? cache[p.base].rates[p.target] : null, updated_at:cache[p.base] && cache[p.base].time_last_update_utc }));
}
