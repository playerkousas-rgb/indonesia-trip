const SPREADSHEET_ID = '1yu0RbgYQyx4jPz63hqDp_aI_zyKXoV00jyUyOp7XCKU';

function doGet() {
  return output_({ ok: true, message: 'API running' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    let result = {};
    switch (req.action) {
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
      case 'appendLatestUpdates': result = appendLatestUpdates(); break;
      case 'initSheets': result = { message: '已停用 initSheets，避免覆寫你現有資料。' }; break;
      default: throw new Error('Unknown action');
    }
    return output_({ ok: true, ...result });
  } catch (err) {
    return output_({ ok: false, error: err.message });
  }
}

function output_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sh_(name) { const sh = ss_().getSheetByName(name); if (!sh) throw new Error('Missing sheet: ' + name); return sh; }
function bool_(v) { return String(v).toUpperCase() === 'TRUE' || String(v) === '✔' || v === true || v === 'Yes' || v === '是'; }
function norm_(v) { return String(v == null ? '' : v).trim(); }
function roleRank_(role) { return { public:0, member:1, leader:2, superadmin:3 }[role] ?? 0; }
function requireRole_(session, role) { if (roleRank_(session?.role || 'public') < roleRank_(role)) throw new Error('Permission denied'); }

function getRows_(sheetName) {
  const values = sh_(sheetName).getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function findUser_(username) {
  return getRows_('USER').find(r => norm_(r.username).toLowerCase() === norm_(username).toLowerCase());
}

function verifySession_(session) {
  if (!session || !session.username) return null;
  const user = findUser_(session.username);
  if (!user || !bool_(user.active)) throw new Error('Session invalid');
  return {
    username: user.username,
    role: user.role,
    display_name: user.display_name,
    member_id: user.member_id
  };
}

function login_(username, password) {
  const user = findUser_(username);
  if (!user || !bool_(user.active)) throw new Error('帳號不存在或已停用');
  if (String(user.password) !== String(password)) throw new Error('帳號或密碼錯誤');
  return { session: { username:user.username, role:user.role, display_name:user.display_name, member_id:user.member_id } };
}

function visibleFor_(card, session) {
  const role = session ? session.role : 'public';
  let allowed = roleRank_(role) >= roleRank_(card.visibility);
  if (session) {
    const overrides = getRows_('USER_CARD_ACCESS').filter(r => norm_(r.username).toLowerCase() === norm_(session.username).toLowerCase() && norm_(r.card_id) === norm_(card.card_id));
    if (overrides.length) allowed = bool_(overrides[overrides.length - 1].allowed);
  }
  return allowed;
}

function getBootstrap_(session) {
  const safe = session && session.username ? verifySession_(session) : null;
  const configMap = {};
  getRows_('CONFIG').forEach(r => configMap[r.key] = r.value);
  let cards = getRows_('CARDS').filter(r => bool_(r.enabled)).sort((a,b)=>(+a.sort_order)-(+b.sort_order));
  cards = cards.filter(c => visibleFor_(c, safe));

  /* ── 注入合成卡片 ── */
  // 個人緊急聯絡資料 — 只對 member+ 顯示
  if (safe && roleRank_(safe.role) >= roleRank_('member')) {
    cards.push({
      card_id: 'emergency_member_info',
      title: '個人緊急聯絡資料',
      description: '你的緊急聯絡資料、領袖聯絡、酒店電話及印尼官方緊急電話',
      icon: '🆘',
      target_sheet: 'MEMBERS',
      visibility: 'member',
      sort_order: 0.5,
      enabled: true,
      editable_in_admin: false
    });
  }
  // 行程路線圖 — public 可見（有座標才顯示內容）
  if (hasSheet_('route_map_locations')) {
    cards.push({
      card_id: 'route_map',
      title: '行程路線圖',
      description: '在地圖上標示行程各站地點及日期',
      icon: '🗺️',
      target_sheet: 'route_map_locations',
      visibility: 'public',
      sort_order: 1.5,
      enabled: true,
      editable_in_admin: false
    });
  }
  cards.sort((a,b)=>(+a.sort_order)-(+b.sort_order));

  return { bootstrap: { configMap, session: safe }, cards };
}

function hasSheet_(name) {
  try { return !!ss_().getSheetByName(name); } catch { return false; }
}

function getCardData_(session, cardId) {
  const safe = session && session.username ? verifySession_(session) : null;

  /* ── 合成卡片：不依賴 CARDS 工作表 ── */
  if (cardId === 'emergency_member_info') {
    requireRole_(safe, 'member');
    const syntheticCard = {
      card_id: 'emergency_member_info',
      title: '個人緊急聯絡資料',
      description: '你的緊急聯絡資料、領袖聯絡、酒店電話及印尼官方緊急電話',
      icon: '🆘',
      target_sheet: 'MEMBERS',
      visibility: 'member',
      sort_order: 0.5,
      enabled: true,
      editable_in_admin: false
    };
    return { card: syntheticCard, rows: getEmergencyMemberInfoRows_(safe), meta:{} };
  }

  if (cardId === 'route_map') {
    const syntheticCard = {
      card_id: 'route_map',
      title: '行程路線圖',
      description: '在地圖上標示行程各站地點及日期',
      icon: '🗺️',
      target_sheet: 'route_map_locations',
      visibility: 'public',
      sort_order: 1.5,
      enabled: true,
      editable_in_admin: false
    };
    const rows = getRows_('route_map_locations');
    return { card: syntheticCard, rows, meta:{} };
  }

  const card = getRows_('CARDS').find(r => norm_(r.card_id) === norm_(cardId));
  if (!card) throw new Error('Card not found');
  if (!visibleFor_(card, safe)) throw new Error('Permission denied');

  if (cardId === 'weather') return { card, rows: fetchWeather_(), meta:{} };
  if (cardId === 'exchange_rates') return { card, rows: fetchRates_(), meta:{} };
  if (cardId === 'emergency_contacts') return { card, rows: getEmergencyContactsFor_(safe), meta:{} };
  if (cardId === 'members_all') requireRole_(safe, 'leader');

  return { card, rows: getRows_(card.target_sheet), meta:{} };
}

function getMyProfile_(session) {
  const safe = verifySession_(session);
  requireRole_(safe, 'member');
  const row = getRows_('MEMBERS').find(r => norm_(r.member_id) === norm_(safe.member_id));
  return { profile: row || null };
}

function updateOwnPassword_(session, newPassword) {
  const safe = verifySession_(session);
  if (!newPassword) throw new Error('Missing password');
  const sh = sh_('USER');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idxUser = headers.indexOf('username');
  const idxPw = headers.indexOf('password');
  for (let i=1;i<values.length;i++) {
    if (norm_(values[i][idxUser]).toLowerCase() === norm_(safe.username).toLowerCase()) {
      sh.getRange(i+1, idxPw+1).setValue(newPassword);
      return { message:'updated' };
    }
  }
  throw new Error('User not found');
}

function adminListUsers_(session) { const safe = verifySession_(session); requireRole_(safe,'superadmin'); return { rows: getRows_('USER') }; }
function adminUpdateUser_(session, username, updates) {
  const safe = verifySession_(session); requireRole_(safe,'superadmin');
  const sh = sh_('USER');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const row = values.findIndex((r,i)=> i>0 && norm_(r[headers.indexOf('username')]).toLowerCase() === norm_(username).toLowerCase());
  if (row < 1) throw new Error('User not found');
  Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); });
  return { message:'updated' };
}
function adminToggleUserActive_(session, username) {
  const safe = verifySession_(session); requireRole_(safe,'superadmin');
  const sh = sh_('USER');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const iUser = headers.indexOf('username'), iActive = headers.indexOf('active');
  for (let i=1;i<values.length;i++) {
    if (norm_(values[i][iUser]).toLowerCase() === norm_(username).toLowerCase()) {
      sh.getRange(i+1, iActive+1).setValue(!bool_(values[i][iActive]));
      return { message:'toggled' };
    }
  }
  throw new Error('User not found');
}
function adminListCards_(session) { const safe = verifySession_(session); requireRole_(safe,'superadmin'); return { rows: getRows_('CARDS') }; }
function adminToggleCard_(session, cardId) {
  const safe = verifySession_(session); requireRole_(safe,'superadmin');
  const sh = sh_('CARDS');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const iId = headers.indexOf('card_id'), iEnabled = headers.indexOf('enabled');
  for (let i=1;i<values.length;i++) {
    if (norm_(values[i][iId]) === norm_(cardId)) {
      sh.getRange(i+1, iEnabled+1).setValue(!bool_(values[i][iEnabled]));
      return { message:'toggled' };
    }
  }
  throw new Error('Card not found');
}
function adminUpdateCard_(session, cardId, updates) {
  const safe = verifySession_(session); requireRole_(safe,'superadmin');
  const sh = sh_('CARDS');
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const row = values.findIndex((r,i)=> i>0 && norm_(r[headers.indexOf('card_id')]) === norm_(cardId));
  if (row < 1) throw new Error('Card not found');
  Object.keys(updates).forEach(k => { const col = headers.indexOf(k); if (col >= 0) sh.getRange(row+1, col+1).setValue(updates[k]); });
  return { message:'updated' };
}
function adminSetUserCardAccess_(session, username, cardId, allowed) {
  const safe = verifySession_(session); requireRole_(safe,'superadmin');
  sh_('USER_CARD_ACCESS').appendRow([username, cardId, allowed ? 'TRUE' : 'FALSE']);
  return { message:'saved' };
}

function getEmergencyContactsFor_(safe) {
  return getRows_('emergency_contacts').sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0));
}

function getEmergencyMemberInfoRows_(safe) {
  requireRole_(safe, 'member');
  const members = getRows_('MEMBERS');
  const contacts = getEmergencyContactsFor_(safe);
  const hotels = getRows_('hotels').filter(r => r.hotel_name || r.phone);

  const emergencyHotlines = [
    { display_name:'印尼綜合緊急求助', member_phone:'112', note:'全國綜合緊急求助' },
    { display_name:'印尼警察', member_phone:'110', note:'警察' },
    { display_name:'印尼救護車', member_phone:'118 / 119', note:'救護車 / 醫療求助' },
    { display_name:'印尼消防', member_phone:'113', note:'消防' },
    { display_name:'印尼搜救 BASARNAS', member_phone:'115', note:'搜救' },
    { display_name:'印尼天災協助', member_phone:'129', note:'天災協助' }
  ];

  if (safe.role === 'leader' || safe.role === 'superadmin') {
    const rows = members.map(m => ({
      member_id: m.member_id,
      display_name: (m.chinese_name || '') + (m.english_name ? ' / ' + m.english_name : ''),
      member_phone: m.phone || '',
      emergency_contact_name: m.parent_name || '',
      emergency_contact_phone: m.parent_phone || '',
      note: '緊急時可先通知隨隊領袖或香港支援，另可直接聯絡此成員之家屬。'
    }));
    contacts.forEach((c, i) => rows.push({ member_id:'leader-' + (i+1), display_name:c.name || '', member_phone:c.phone || '', emergency_contact_name:'', emergency_contact_phone:'', note:c.note || '' }));
    emergencyHotlines.forEach((c, i) => rows.push({ member_id:'hotline-' + (i+1), display_name:c.display_name, member_phone:c.member_phone, emergency_contact_name:'', emergency_contact_phone:'', note:c.note }));
    const hotelSeen = {};
    hotels.forEach((h, i) => {
      const key = norm_(h.hotel_name) + '|' + norm_(h.phone);
      if (!key || hotelSeen[key]) return;
      hotelSeen[key] = true;
      rows.push({ member_id:'hotel-' + (i+1), display_name:(h.hotel_name || '酒店前台'), member_phone:h.phone || '', emergency_contact_name:'', emergency_contact_phone:'', note:'酒店前台電話' });
    });
    return rows;
  }

  const me = members.find(m => norm_(m.member_id) === norm_(safe.member_id));
  if (!me) return [];

  const rows = [{
    member_id: me.member_id,
    display_name: (me.chinese_name || '') + (me.english_name ? ' / ' + me.english_name : ''),
    member_phone: me.phone || '',
    emergency_contact_name: me.parent_name || '',
    emergency_contact_phone: me.parent_phone || '',
    note: '以下同時附上領袖、酒店及印尼官方緊急電話，以便當地緊急時即時聯絡。'
  }];

  contacts.forEach((c, i) => rows.push({
    member_id: 'leader-' + (i+1),
    display_name: c.name || '',
    member_phone: c.phone || '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    note: c.note || ''
  }));

  emergencyHotlines.forEach((c, i) => rows.push({
    member_id: 'hotline-' + (i+1),
    display_name: c.display_name,
    member_phone: c.member_phone,
    emergency_contact_name: '',
    emergency_contact_phone: '',
    note: c.note
  }));

  const hotelSeen = {};
  hotels.forEach((h, i) => {
    const key = norm_(h.hotel_name) + '|' + norm_(h.phone);
    if (!key || hotelSeen[key]) return;
    hotelSeen[key] = true;
    rows.push({
      member_id: 'hotel-' + (i+1),
      display_name: h.hotel_name || '酒店前台',
      member_phone: h.phone || '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      note: '酒店前台電話'
    });
  });

  return rows;
}

function fetchWeather_() {
  const locations = getRows_('weather_locations').filter(r => bool_(r.enabled));
  return locations.map(loc => {
    const data = JSON.parse(UrlFetchApp.fetch(loc.api_url, { muteHttpExceptions:true }).getContentText());
    let marine = null;
    if (loc.marine_url) {
      try { marine = JSON.parse(UrlFetchApp.fetch(loc.marine_url, { muteHttpExceptions:true }).getContentText()); } catch (e) {}
    }
    return {
      city: loc.label || loc.city,
      current_temp: data.current && data.current.temperature_2m,
      apparent_temp: data.current && data.current.apparent_temperature,
      wind_speed: data.current && data.current.wind_speed_10m,
      temp_max: data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0],
      temp_min: data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[0],
      tomorrow_max: data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[1],
      tomorrow_min: data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[1],
      precipitation: data.daily && data.daily.precipitation_sum && data.daily.precipitation_sum[0],
      sunrise: data.daily && data.daily.sunrise && data.daily.sunrise[0],
      sunset: data.daily && data.daily.sunset && data.daily.sunset[0],
      sea_temp: marine && marine.daily && marine.daily.sea_surface_temperature ? marine.daily.sea_surface_temperature[0] : '',
      time: data.current && data.current.time
    };
  });
}

function fetchRates_() {
  const pairs = getRows_('exchange_rates').filter(r => bool_(r.enabled));
  const neededBases = [...new Set(pairs.map(r => r.base))];
  const cache = {};
  neededBases.forEach(base => {
    cache[base] = JSON.parse(UrlFetchApp.fetch('https://open.er-api.com/v6/latest/' + encodeURIComponent(base), { muteHttpExceptions:true }).getContentText());
  });
  return pairs.map(p => ({ pair:p.pair, rate:cache[p.base] && cache[p.base].rates ? cache[p.base].rates[p.target] : null, updated_at:cache[p.base] && cache[p.base].time_last_update_utc }));
}

function ensureSheetHeaders_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    return sh;
  }
  const first = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0].map(v => String(v || '').trim());
  let changed = false;
  headers.forEach((h, i) => {
    if (first[i] !== h) { sh.getRange(1, i + 1).setValue(h); changed = true; }
  });
  return sh;
}

function appendLatestUpdates() {
  // 確保 route_map_locations 工作表存在（行程路線圖用）
  ensureSheetHeaders_('route_map_locations', [
    'sort_order', 'date', 'location_name', 'lat', 'lng', 'note', 'icon'
  ]);

  // 預填已知的行程地點（如已有資料則不覆寫）
  const sh = ss_().getSheetByName('route_map_locations');
  if (sh.getLastRow() <= 1) {
    const seed = [
      [1, '11/7', '香港國際機場', 22.3080, 113.9185, '出發', '✈️'],
      [2, '11/7', '峇里島沙努爾皇宮大酒店', -8.6921, 115.2626, '抵達入住', '🏨'],
      [3, '12/7', '峇里島（本地遊）', -8.65, 115.22, '本地遊（待補座標）', '🌴'],
      [4, '13/7', '峇里島（潛水）', -8.72, 115.20, '潛水活動', '🤿'],
      [5, '14/7', '峇里 → 雅加達', -6.2088, 106.8456, '內陸機轉飛', '✈️'],
      [6, '14/7', 'Aryaduta Menteng 酒店', -6.1980, 106.8430, '入住', '🏨'],
      [7, '15/7', '雅加達（本地遊）', -6.20, 106.85, '本地遊（待補座標）', '🌴'],
      [8, '18/7', '雅加達 → 泗水', -7.2575, 112.7521, '內陸機轉飛', '✈️'],
      [9, '18/7', '泗水（登山）', -7.94, 112.95, '登山活動', '⛰️'],
      [10, '20/7', '雅加達 → 香港', 22.3080, 113.9185, '回程解散', '✈️']
    ];
    seed.forEach(row => sh.appendRow(row));
  }

  return { message: '已確保 route_map_locations 工作表存在並預填基本地點。' };
}
