const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby3COQ-Fg-RPk1qmnEU6X5noUWf5MA0r9jXbQtYbUEtSjI-jCaIiEgM95o7Sk7TPQ5_/exec';

const state = {
  session: loadSession(),
  bootstrap: null,
  cards: [],
  currentCardId: null,
  adminTab: 'users'
};

function loadSession() { try { return JSON.parse(localStorage.getItem('tripLiveSession') || 'null'); } catch { return null; } }
function saveSession(session) { localStorage.setItem('tripLiveSession', JSON.stringify(session)); state.session = session; }
function clearSession() { localStorage.removeItem('tripLiveSession'); state.session = null; }
function roleRank(role) { return { public:0, member:1, leader:2, superadmin:3 }[role] ?? 0; }
function can(role) { return roleRank(state.session?.role || 'public') >= roleRank(role); }

async function api(action, payload = {}) {
  const res = await fetch(SCRIPT_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify({ action, ...payload }) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API Error');
  return data;
}

async function bootstrap() {
  try {
    const data = await api('getBootstrap', { session: state.session });
    state.bootstrap = data.bootstrap;
    state.cards = data.cards || [];
    renderShell();
    renderCards();
  } catch (err) {
    console.error(err);
    setStatus('未能讀取資料，請稍後再試。');
  }
}

function setStatus(text) { document.getElementById('statusBar').textContent = text || ''; }

function renderShell() {
  const cfg = state.bootstrap?.configMap || {};
  document.getElementById('siteTag').textContent = `🌏 ${cfg.site_name || '童遊世界‧印尼活動備忘'}`;
  document.getElementById('siteTitle').textContent = cfg.site_name || '童遊世界‧印尼活動備忘';
  document.getElementById('siteDesc').textContent = '家長可直接查看活動概況；登入後按角色顯示個人、領袖及管理資料。';
  document.getElementById('loginHint').innerHTML = '<strong>成員登入提示</strong><br>帳號 = 報名電郵｜初始密碼 = 電話號碼<br>如已更改密碼，請使用新密碼登入';
  document.getElementById('dateValue').textContent = formatDateRange(cfg.trip_start, cfg.trip_end);
  document.getElementById('showLoginBtn').classList.toggle('hidden', !!state.session);
  document.getElementById('logoutBtn').classList.toggle('hidden', !state.session);
  document.getElementById('myProfileBtn').classList.toggle('hidden', !can('member'));
  document.getElementById('leaderBtn').classList.toggle('hidden', !can('leader'));
  document.getElementById('adminBtn').classList.toggle('hidden', !can('superadmin'));
  if (state.session) setStatus(`已登入：${state.session.display_name}（${state.session.role}）`);
  renderHeroSummary();
  renderHeroEmergencyCard();
}

async function renderHeroSummary() {
  try {
    const [rateData, weatherData] = await Promise.all([
      api('getCardData', { session: state.session, cardId: 'exchange_rates' }),
      api('getCardData', { session: state.session, cardId: 'weather' })
    ]);
    const rates = (rateData.rows || []).slice(0, 3).map(r => `${r.pair}: ${r.rate ?? '-'}`).join(' ｜ ');
    const weather = (weatherData.rows || []).slice(0, 3).map(r => `${r.city} ${r.current_temp ?? '-'}°C`).join(' ｜ ');
    document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">匯率：${rates}</div><div class="small" style="margin-top:4px">天氣：${weather}</div></div>`;
  } catch {
    document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">暫時未能讀取即時資料</div></div>`;
  }
}

async function renderHeroEmergencyCard() {
  const box = document.getElementById('heroEmergencyCard');
  if (!can('member')) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<strong>🆘 個人緊急聯絡資料</strong><div class="small" style="margin-top:6px;color:var(--hero-sub)">點擊展開查看你的緊急聯絡資料、領袖聯絡及印尼緊急電話</div>`;
  box.style.cursor = 'pointer';
  box.onclick = () => openCard('emergency_member_info', false);
}

function formatDisplayDate(v) {
  if (v == null || v === '') return '-';
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d) && /^\d{4}-\d{2}-\d{2}/.test(s)) return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  return s;
}
function formatDateRange(start, end) { if (!start || !end) return '2026/7/11 → 2026/7/20'; return `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`; }

function renderCards() {
  const box = document.getElementById('cards');
  box.innerHTML = '';
  state.cards.forEach(card => {
    if (card.card_id === 'emergency_member_info') return;
    if (card.card_id === 'flights') return; // 航班由前端合成（public + member 版）
    if (card.card_id === 'hotels') return; // 酒店由前端合成（public + member 版）
    const el = document.createElement('div');
    el.className = 'card';
    el.id = `card-${card.card_id}`;
    el.innerHTML = `<div class="card-top"><div class="icon">${card.icon || '📄'}</div><div class="badge">${card.visibility || 'public'}</div></div><h3>${card.title}</h3><p>${card.description || ''}</p><div class="card-footer"><span class="small">由 Google Sheet 控制</span><button class="btn btn-light" data-card="${card.card_id}">進入</button></div><div class="inline-card-content hidden" id="inline-${card.card_id}"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  });
  // 航班資訊卡片（Public，家長也可看）
  {
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'card-flights';
    el.innerHTML = `<div class="card-top"><div class="icon">✈️</div><div class="badge">public</div></div><h3>航班資訊</h3><p>航班擇要、國泰航空聯絡及延誤處理</p><div class="card-footer"><span class="small">家長可見</span><button class="btn btn-light" data-card="flights">進入</button></div><div class="inline-card-content hidden" id="inline-flights"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  }
  // 酒店資訊卡片（Public，家長也可看）
  {
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'card-hotels';
    el.innerHTML = `<div class="card-top"><div class="icon">🏨</div><div class="badge">public</div></div><h3>酒店資訊</h3><p>酒店名稱、地點、地址及電話</p><div class="card-footer"><span class="small">家長可見</span><button class="btn btn-light" data-card="hotels">進入</button></div><div class="inline-card-content hidden" id="inline-hotels"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  }
  // 司機信息卡片（前端合成，不依賴後端 CARDS）
  if (can('member')) {
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'card-driver_info';
    el.innerHTML = `<div class="card-top"><div class="icon">🚕</div><div class="badge">member</div></div><h3>司機信息 Driver Info</h3><p>給的士司機看的酒店及機場地址（英文 / 印尼文）</p><div class="card-footer"><span class="small">離線可用</span><button class="btn btn-light" data-card="driver_info">進入</button></div><div class="inline-card-content hidden" id="inline-driver_info"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  }
  // 航班詳情卡片（member 專屬，看機票PDF）
  const myId = state.session?.member_id || '';
  if (FLIGHT_TICKETS[myId] || can('leader')) {
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'card-flight_details';
    el.innerHTML = `<div class="card-top"><div class="icon">🎫</div><div class="badge">member</div></div><h3>航班詳情</h3><p>你的機票及完整 PDF</p><div class="card-footer"><span class="small">含機票 PDF</span><button class="btn btn-light" data-card="flight_details">進入</button></div><div class="inline-card-content hidden" id="inline-flight_details"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  }
  // 酒店詳情卡片（member 專屬，看PDF）
  if (can('member')) {
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'card-hotel_details';
    el.innerHTML = `<div class="card-top"><div class="icon">📄</div><div class="badge">member</div></div><h3>酒店詳情</h3><p>入住憑證及完整 PDF</p><div class="card-footer"><span class="small">含酒店 PDF</span><button class="btn btn-light" data-card="hotel_details">進入</button></div><div class="inline-card-content hidden" id="inline-hotel_details"><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  }
  box.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => openCard(btn.dataset.card, false)));
}

async function openCard(cardId, shouldScroll = false) {
  document.querySelectorAll('.inline-card-content').forEach(el => el.classList.add('hidden'));

  if (cardId === 'emergency_member_info') {
    const heroBox = document.getElementById('heroEmergencyCard');
    heroBox.innerHTML = '<strong style="color:#0f172a">🆘 個人緊急聯絡資料</strong><div style="color:#64748b;margin-top:6px;font-size:12px">讀取資料中...</div>';
    heroBox.style.background = '#fff';
    heroBox.style.color = '#0f172a';
    heroBox.style.border = '1px solid #dbe3ee';
    heroBox.classList.remove('summary-box');
    heroBox.onclick = null;
    try {
      const data = await api('getCardData', { session: state.session, cardId });
      const rows = filterEmergencyRows(data.rows || []);
      heroBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong style="color:#0f172a">🆘 個人緊急聯絡資料</strong><button class="btn btn-light" style="font-size:12px;padding:6px 10px" onclick="closeHeroEmergency()">收合</button></div><div style="margin-top:10px;color:#0f172a">${renderEmergencyMemberInfo(rows)}</div>`;
    } catch (err) {
      console.warn('emergency_member_info API 失敗，使用備用方案:', err.message);
      try {
        const rows = await buildEmergencyMemberInfoFallback();
        heroBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong style="color:#0f172a">🆘 個人緊急聯絡資料</strong><button class="btn btn-light" style="font-size:12px;padding:6px 10px" onclick="closeHeroEmergency()">收合</button></div><div style="margin-top:10px;color:#0f172a">${renderEmergencyMemberInfo(rows)}</div>`;
      } catch (err2) {
        heroBox.classList.add('summary-box');
        heroBox.style.background = 'rgba(255,255,255,.14)';
        heroBox.style.color = '#fff';
        heroBox.style.border = '1px solid rgba(255,255,255,.2)';
        heroBox.innerHTML = `<strong>🆘 個人緊急聯絡資料</strong><div style="margin-top:6px;font-size:12px;color:var(--hero-sub)">載入失敗：${err2.message}</div>`;
      }
    }
    return;
  }

  if (cardId === 'flights') {
    const inline = document.getElementById('inline-flights');
    const inlineBody = inline?.querySelector('.inline-card-body');
    if (inline) { inline.classList.remove('hidden'); inlineBody.innerHTML = '<div class="small">讀取資料中...</div>'; }
    inlineBody.innerHTML = renderFlightsPublic([]);
    return;
  }

  if (cardId === 'hotels') {
    const inline = document.getElementById('inline-hotels');
    const inlineBody = inline?.querySelector('.inline-card-body');
    if (inline) { inline.classList.remove('hidden'); inlineBody.innerHTML = '<div class="small">讀取資料中...</div>'; }
    try {
      const hData = await api('getCardData', { session: state.session, cardId: 'hotels' });
      inlineBody.innerHTML = renderHotelsPublic(hData.rows || []);
    } catch {
      inlineBody.innerHTML = renderHotelsPublic([]);
    }
    return;
  }

  if (cardId === 'driver_info') {
    const inline = document.getElementById('inline-driver_info');
    const inlineBody = inline?.querySelector('.inline-card-body');
    if (inline) {
      inline.classList.remove('hidden');
      inlineBody.innerHTML = '<div class="small">讀取資料中...</div>';
    }
    try {
      const hData = await api('getCardData', { session: state.session, cardId: 'hotels' });
      inlineBody.innerHTML = renderDriverInfo(hData.rows || []);
    } catch {
      inlineBody.innerHTML = renderDriverInfo([]);
    }
    bindDriverAccordions();
    return;
  }

  if (cardId === 'flight_details') {
    const inline = document.getElementById('inline-flight_details');
    const inlineBody = inline?.querySelector('.inline-card-body');
    if (inline) { inline.classList.remove('hidden'); inlineBody.innerHTML = '<div class="small">讀取資料中...</div>'; }
    inlineBody.innerHTML = renderFlightDetails([]);
    return;
  }

  if (cardId === 'hotel_details') {
    const inline = document.getElementById('inline-hotel_details');
    const inlineBody = inline?.querySelector('.inline-card-body');
    if (inline) { inline.classList.remove('hidden'); inlineBody.innerHTML = '<div class="small">讀取資料中...</div>'; }
    try {
      const hData = await api('getCardData', { session: state.session, cardId: 'hotels' });
      inlineBody.innerHTML = renderHotelDetails(hData.rows || []);
    } catch {
      inlineBody.innerHTML = renderHotelDetails([]);
    }
    bindHotelTabs();
    return;
  }

  const inline = document.getElementById(`inline-${cardId}`);
  const inlineBody = inline?.querySelector('.inline-card-body');
  if (inline) {
    inline.classList.remove('hidden');
    inlineBody.innerHTML = '<div class="small">讀取資料中...</div>';
    if (shouldScroll) document.getElementById(`card-${cardId}`)?.scrollIntoView({ behavior:'smooth', block:'start' });
  }
  try {
    if (cardId === 'my_profile') {
      const data = await api('getMyProfile', { session: state.session });
      inlineBody.innerHTML = renderProfile(data.profile);
      return;
    }
    const data = await api('getCardData', { session: state.session, cardId });
    inlineBody.innerHTML = renderCardData(cardId, data.rows || [], data.meta || {});
    afterRenderCard(cardId);
  } catch (err) {
    inlineBody.innerHTML = `<div class="small">${err.message}</div>`;
  }
}

function afterRenderCard(cardId) { if (cardId === 'packing') bindPackingTabs(); if (cardId === 'members_all') bindMemberTabs(); if (cardId === 'hotels') bindHotelTabs(); if (cardId === 'route_map') initRouteMap(); }

function renderProfile(p) { if (!p) return '<div class="small">沒有資料</div>'; return `<div class="list-item"><strong>${p.chinese_name || ''} ${p.english_name ? ' / ' + p.english_name : ''}</strong><div class="meta"><span class="chip">${p.role_type || ''}</span><span class="chip">${p.scout_role || ''}</span></div><div class="table-wrap"><table class="table" style="margin-top:10px"><tr><td>電話</td><td>${p.phone || '-'}</td></tr><tr><td>Email</td><td>${p.email || '-'}</td></tr><tr><td>緊急聯絡人</td><td>${p.parent_name || '-'} ${p.parent_relation ? '（' + p.parent_relation + '）' : ''}</td></tr><tr><td>緊急聯絡電話</td><td>${p.parent_phone || '-'}</td></tr><tr><td>護照號碼</td><td>${p.passport_no || '-'}</td></tr><tr><td>護照到期日</td><td>${formatDisplayDate(p.passport_expiry) || '-'}</td></tr><tr><td>健康備註</td><td>${p.medical_notes || '-'}</td></tr></table></div><div style="margin-top:12px"><button class="btn btn-primary" onclick="changeMyPassword()">修改密碼</button></div></div>`; }

function renderCardData(cardId, rows) {
  if (cardId === 'packing') return renderPackingTabbed(rows);
  if (cardId === 'weather') return renderWeather(rows);
  if (cardId === 'exchange_rates') return renderRates(rows);
  if (cardId === 'emergency_actions') return renderEmergencyActions(rows);
  if (cardId === 'emergency_contacts') return renderEmergencyContacts(rows);
  if (cardId === 'emergency_member_info') return renderEmergencyMemberInfo(rows);
  if (cardId === 'members_all') return renderMembersTabbed(rows);
  if (cardId === 'hotels') return renderHotelsPublic(rows);
  if (cardId === 'hotel_details') return renderHotelDetails(rows);
  if (cardId === 'transport_info') return renderTransport(rows);
  if (cardId === 'team_rules') return renderRules(rows);
  if (cardId === 'route_map') return renderRouteMap(rows);
  if (cardId === 'flights') return renderFlightsPublic(rows);
  if (cardId === 'flight_details') return renderFlightDetails(rows);
  if (['restaurants','souvenirs','attractions','marine_life','phrases','apps'].includes(cardId)) return renderGroupedByCity(rows, cardId);
  return renderGenericTable(rows);
}

function renderGenericTable(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const headers = Object.keys(rows[0]); return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${formatCellByKey(h, r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function renderMembersTabbed(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const tabs = rows.map((r, i) => `<button class="btn btn-light member-tab ${i===0?'active':''}" data-member-tab="${i}">${r.chinese_name || r.display_name || '成員'}</button>`).join(''); const panels = rows.map((r, i) => `<div class="member-panel ${i===0?'':'hidden'}" data-member-panel="${i}"><div class="list-item"><strong>${r.chinese_name || ''} ${r.english_name ? ' / ' + r.english_name : ''}</strong><div class="meta"><span class="chip">${r.role_type || ''}</span><span class="chip">${r.scout_role || ''}</span></div><div class="table-wrap"><table class="table" style="margin-top:10px"><tr><td>電話</td><td>${formatCell(r.phone)}</td></tr><tr><td>Email</td><td>${formatCell(r.email)}</td></tr><tr><td>緊急聯絡人</td><td>${formatCell(r.parent_name)} ${r.parent_relation ? '（' + r.parent_relation + '）' : ''}</td></tr><tr><td>緊急聯絡電話</td><td>${formatCell(r.parent_phone)}</td></tr><tr><td>護照號碼</td><td>${formatCell(r.passport_no)}</td></tr><tr><td>護照到期日</td><td>${formatCellByKey('passport_expiry', r.passport_expiry)}</td></tr><tr><td>健康備註</td><td>${formatCell(r.medical_notes)}</td></tr></table></div></div></div>`).join(''); return `<div class="nav-tabs">${tabs}</div><div style="margin-top:14px">${panels}</div>`; }
function bindMemberTabs() { document.querySelectorAll('[data-member-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-member-tab]').forEach(b => b.classList.remove('active')); document.querySelectorAll('[data-member-panel]').forEach(p => p.classList.add('hidden')); btn.classList.add('active'); document.querySelector(`[data-member-panel="${btn.dataset.memberTab}"]`)?.classList.remove('hidden'); })); }
function bindHotelTabs() { document.querySelectorAll('[data-hotel-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-hotel-tab]').forEach(b => b.classList.remove('active')); document.querySelectorAll('[data-hotel-panel]').forEach(p => p.classList.add('hidden')); btn.classList.add('active'); document.querySelector(`[data-hotel-panel="${btn.dataset.hotelTab}"]`)?.classList.remove('hidden'); })); }

function renderEmergencyContacts(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.name)}</strong><div class="small" style="margin-top:6px">電話：${formatCell(r.phone)}</div>${r.whatsapp ? `<div class="small">WhatsApp：${formatCell(r.whatsapp)}</div>` : ''}${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }
function renderEmergencyActions(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.scenario}</strong><div class="small" style="margin-top:6px">先通知：${r.primary_contact || '-'}</div><div class="small">電話：${r.primary_phone || '-'}</div>${r.secondary_contact ? `<div class="small">後備：${r.secondary_contact} ${r.secondary_phone || ''}</div>`:''}${r.note ? `<div class="small">備註：${r.note}</div>`:''}</div>`).join('')}</div>`; }
function renderEmergencyMemberInfo(rows) { if (!rows.length) return '<div style="color:#64748b;font-size:13px">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item" style="color:#0f172a"><strong style="color:#0f172a">${formatCell(r.display_name)}</strong>${r.member_phone ? `<div style="margin-top:6px;font-size:13px;color:#334155">電話：${formatCell(r.member_phone)}</div>` : ''}${r.emergency_contact_name ? `<div style="font-size:13px;color:#334155">緊急聯絡人：${formatCell(r.emergency_contact_name)}</div>` : ''}${r.emergency_contact_phone ? `<div style="font-size:13px;color:#334155">緊急聯絡人電話：${formatCell(r.emergency_contact_phone)}</div>` : ''}${r.note ? `<div style="font-size:12px;color:#64748b;margin-top:4px">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }

function renderGroupedByCity(rows, cardId) {
  if (!rows.length) return '<div class="small">暫無資料</div>';
  if (cardId === 'phrases') return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.chinese)}</strong><div class="small" style="margin-top:6px">英文：${formatCell(r.english)}</div><div class="small">印尼文：${formatCell(r.indonesian)}</div>${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`;
  if (cardId === 'apps') return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.name)}</strong><div class="small" style="margin-top:6px">用途：${formatCell(r.purpose)}</div><div class="small">平台：${formatCell(r.platform)}</div>${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}${r.download_url ? `<div class="small" style="margin-top:8px">${formatCell(r.download_url)}</div>` : ''}</div>`).join('')}</div>`;
  const groups = {}; rows.forEach(r => { const city = r.city || '其他'; (groups[city] ||= []).push(r); });
  return Object.entries(groups).map(([city,list]) => `<div class="list-item"><strong>${city}</strong><div class="list" style="margin-top:10px">${list.map(r => `<div class="list-item"><strong>${r.name || r.item_name || r.species_name || '-'}</strong>${Object.entries(r).filter(([k,v]) => !['city','name','item_name','species_name'].includes(k) && v).map(([k,v]) => `<div class="small" style="margin-top:6px">${labelize(k)}：${formatCellByKey(k, v)}</div>`).join('')}</div>`).join('')}</div></div>`).join('');
}

function renderPackingTabbed(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const key = `packingChecklistDraft:${state.session?.username || 'public'}`; const checked = JSON.parse(localStorage.getItem(key) || '{}'); const grouped = {}; rows.slice().sort((a, b) => { const ar = truthy(a.required) ? 0 : 1; const br = truthy(b.required) ? 0 : 1; if (ar !== br) return ar - br; return (+a.sort_order || 0) - (+b.sort_order || 0); }).forEach(r => { const g = friendlyPackingCategory(r.category || '其他'); (grouped[g] ||= []).push(r); }); const categories = Object.keys(grouped); const tabs = categories.map((cat, i) => `<button class="btn btn-light packing-tab ${i===0?'active':''}" data-packing-tab="${i}">${cat}</button>`).join(''); const panels = categories.map((cat, i) => `<div class="packing-panel ${i===0?'':'hidden'}" data-packing-panel="${i}"><div class="checklist">${grouped[cat].map(r => { const isChecked = checked[r.item_id] || truthy(r.prechecked); return `<label class="check-item ${truthy(r.required) ? 'required-item' : ''}"><input type="checkbox" data-pack="${r.item_id}" ${isChecked ? 'checked' : ''}><div><strong>${r.item_name}</strong><div class="meta"><span class="chip">數量：${r.quantity || 1}</span>${truthy(r.required) ? '<span class="chip">必備</span>' : '<span class="chip">建議</span>'}</div>${r.note ? `<div class="small" style="margin-top:6px">${formatCell(r.note)}</div>` : ''}</div></label>`; }).join('')}</div></div>`).join(''); return `<div><div class="small">此清單只供成員 / 家長自行核對，不會提交或記錄到系統。</div><div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 10px;gap:10px;flex-wrap:wrap"><div class="nav-tabs">${tabs}</div><button class="btn btn-light" onclick="clearPacking()">清除勾選</button></div><div>${panels}</div></div>`; }
function bindPackingTabs() { document.querySelectorAll('[data-pack]').forEach(cb => cb.addEventListener('change', () => { const key = `packingChecklistDraft:${state.session?.username || 'public'}`; const checked = JSON.parse(localStorage.getItem(key) || '{}'); checked[cb.dataset.pack] = cb.checked; localStorage.setItem(key, JSON.stringify(checked)); })); document.querySelectorAll('[data-packing-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-packing-tab]').forEach(b => b.classList.remove('active')); document.querySelectorAll('[data-packing-panel]').forEach(p => p.classList.add('hidden')); btn.classList.add('active'); document.querySelector(`[data-packing-panel="${btn.dataset.packingTab}"]`)?.classList.remove('hidden'); })); }
function clearPacking() { localStorage.removeItem(`packingChecklistDraft:${state.session?.username || 'public'}`); openCard('packing'); }
window.clearPacking = clearPacking;

function closeHeroEmergency() {
  const heroBox = document.getElementById('heroEmergencyCard');
  heroBox.classList.add('summary-box');
  heroBox.style.background = 'rgba(255,255,255,.14)';
  heroBox.style.color = '#fff';
  heroBox.style.border = '1px solid rgba(255,255,255,.2)';
  heroBox.innerHTML = `<strong style="color:#fff">🆘 個人緊急聯絡資料</strong><div style="margin-top:6px;font-size:12px;color:var(--hero-sub)">點擊展開查看你的緊急聯絡資料、領袖聯絡及印尼緊急電話</div>`;
  heroBox.onclick = () => openCard('emergency_member_info', false);
}
window.closeHeroEmergency = closeHeroEmergency;

function renderWeather(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.city}</strong><div class="small" style="margin-top:6px">現時：${r.current_temp ?? '-'}°C｜體感：${r.apparent_temp ?? '-'}°C｜風速：${r.wind_speed ?? '-'} km/h</div><div class="small">今日：${r.temp_min ?? '-'}°C - ${r.temp_max ?? '-'}°C｜降雨：${r.precipitation ?? 0} mm</div><div class="small">明日：${r.tomorrow_min ?? '-'}°C - ${r.tomorrow_max ?? '-'}°C</div><div class="small">日出：${formatTimeOnly(r.sunrise)}｜日落：${formatTimeOnly(r.sunset)}</div>${r.sea_temp !== '' && r.sea_temp != null ? `<div class="small">海水溫度：${r.sea_temp}°C</div>` : ''}<div class="small">更新：${formatDateTime(r.time)}</div></div>`).join('')}<div class="list-item color-blue"><strong>資料來源</strong><div class="small">Open-Meteo forecast API；海水溫度只顯示峇里。</div></div></div>`; }
function renderRates(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.pair}</strong><div style="margin-top:6px">${r.rate}</div><div class="small">更新：${formatCellByKey('updated_at', r.updated_at)}</div></div>`).join('')}</div>`; }
function renderHotelsPublic(rows) {
  if (!rows.length) return '<div class="small">暫無資料</div>';
  const grouped = {};
  rows.forEach(r => {
    const key = [r.location || '', r.hotel_name || '', r.address || ''].join('|');
    if (!grouped[key]) grouped[key] = { ...r, dates: [] };
    if (r.date) grouped[key].dates.push(r.date);
  });
  const list = Object.values(grouped);
  return `<div class="list">${list.map(r => `<div class="list-item">
    <strong style="color:#0f172a">${formatCell(r.hotel_name)}</strong>
    <div style="margin-top:6px;font-size:13px;color:#334155">地點：${formatCell(r.location)}</div>
    <div style="font-size:13px;color:#334155">日期：${r.dates.map(d => formatCellByKey('date', d)).join('、')}</div>
    ${r.address && r.address !== 'same address' ? `<div style="font-size:13px;color:#334155">地址：${formatCell(r.address)}</div>` : ''}
    ${r.phone ? `<div style="font-size:13px;color:#334155">電話：${formatCell(r.phone)}</div>` : ''}
    ${r.map_url ? `<div style="font-size:13px;margin-top:4px">地圖：${formatCell(r.map_url)}</div>` : ''}
  </div>`).join('')}</div>`;
}

function renderHotelDetails(rows) {
  if (!rows.length) return '<div class="small">暫無資料</div>';
  const grouped = {};
  rows.forEach(r => {
    const key = [r.location || '', r.hotel_name || '', r.address || ''].join('|');
    if (!grouped[key]) grouped[key] = { ...r, dates: [] };
    if (r.date) grouped[key].dates.push(r.date);
  });
  const list = Object.values(grouped);

  const HOTEL_PDFS = [
    { label: '峇里島 — 入住憑證', pdf: 'hotels/bali-voucher.pdf', desc: 'Grand Palace Hotel Sanur｜5房2晚｜7/11-7/13' },
    { label: '雅加達 — 收據', pdf: 'hotels/jakarta-receipt.pdf', desc: 'Aryaduta Menteng｜5房2晚｜7/18-7/20' },
    { label: '雅加達 — 確認通知', pdf: 'hotels/jakarta-confirmation.pdf', desc: 'Agoda 確認郵件｜Booking ID 1725058563' }
  ];

  let html = '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px">📄 酒店正式文件</div>';
  HOTEL_PDFS.forEach(h => {
    html += `<div class="list-item" style="margin-bottom:10px">
      <strong style="color:#0f766e;font-size:14px">${h.label}</strong>
      <div style="font-size:12px;color:#64748b;margin-top:4px">${h.desc}</div>
      <iframe src="${h.pdf}" style="width:100%;height:400px;border:1px solid #dbe3ee;border-radius:10px;margin-top:8px" loading="lazy"></iframe>
      <div style="margin-top:4px"><a href="${h.pdf}" target="_blank" class="link" style="font-size:12px">在新分頁開啟 PDF</a></div>
    </div>`;
  });

  html += '<div style="font-size:14px;font-weight:700;color:#0f172a;margin:10px 0 8px">📋 酒店擇要</div>';
  const tabs = list.map((r, i) => `<button class="btn btn-light hotel-tab ${i===0?'active':''}" data-hotel-tab="${i}">${r.location || r.hotel_name || '酒店'}</button>`).join('');
  const panels = list.map((r, i) => `<div class="hotel-panel ${i===0?'':'hidden'}" data-hotel-panel="${i}"><div class="list-item"><strong>${formatCell(r.hotel_name)}</strong><div class="small" style="margin-top:6px">日期：${r.dates.map(d => formatCellByKey('date', d)).join('、')}</div><div class="small">地點：${formatCell(r.location)}</div>${r.address && r.address !== 'same address' ? `<div class="small">地址：${formatCell(r.address)}</div>` : ''}${r.phone ? `<div class="small">電話：${formatCell(r.phone)}</div>` : ''}${r.booking_id ? `<div class="small">預訂 / 確認編號：${formatCell(r.booking_id)}</div>` : ''}${r.order_id ? `<div class="small">訂單編號：${formatCell(r.order_id)}</div>` : ''}${r.pin_code ? `<div class="small">PIN 碼：${formatCell(r.pin_code)}</div>` : ''}${r.map_url ? `<div class="small">地圖：${formatCell(r.map_url)}</div>` : ''}${r.transport_note ? `<div class="small">交通：${formatCell(r.transport_note)}</div>` : ''}</div></div>`).join('');
  html += `<div class="nav-tabs">${tabs}</div><div style="margin-top:14px">${panels}</div>`;
  return html;
}

function renderTransport(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.route)}</strong><div class="small" style="margin-top:6px">由：${formatCell(r.from_place)}</div><div class="small">到：${formatCell(r.to_place)}</div><div class="small">方式：${formatCell(r.method)}</div><div class="small">車程：約 ${formatCell(r.estimated_time)}</div><div class="small">費用：約 ${formatCell(r.estimated_cost)}</div>${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }
function renderRules(rows) { return `<div class="list">${[...rows].sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0)).map(r => `<div class="list-item"><div>${formatCell(r.rule)}</div></div>`).join('')}</div>`; }

/* ── 航班資訊（含航空公司聯絡） ── */
const AIRLINE_INFO = {
  'CX': { name: '國泰航空 Cathay Pacific', phone_hk: '+852 2747 3342', phone_bali: '+62 361 936 6964', phone_jkt: '+62 21 2903 4033', website: 'https://www.cathaypacific.com' }
};

/* ── 機票資料 ── */
const FLIGHT_TICKETS = {
  'M001': { name_en: 'Cheng Lok Yin', pdf: 'tickets/CHENG LOK YIN 11JUL HKG.pdf' },
  'M002': { name_en: 'Kok Chun', pdf: 'tickets/KOK CHUN 11JUL HKG.pdf' },
  'M003': { name_en: 'Ho Yee Tak', pdf: 'tickets/HO YEE TAK 11JUL HKG.pdf' },
  'M004': { name_en: 'Ng Wing Hei', pdf: 'tickets/NG WING HEI 11JUL HKG.pdf' },
  'L001': { name_en: 'Pang Chi Fung Arthur', pdf: null, note: '自行購票，同班機 CX785 / CX776' },
  'L004': { name_en: 'Yeung Tsz Yan Vico', pdf: 'tickets/YEUNG TSZ YAN VICO 11JUL HKG.pdf' },
  'L005': { name_en: 'Mok Wing Man', pdf: 'tickets/MOK WING MAN 11JUL HKG.pdf' }
};

const SHARED_FLIGHTS = [
  { leg: '去程', route: '香港 HKG → 峇里 DPS', flight: 'CX785', date: '11 Jul 2026', depart: '10:00', arrive: '15:00', terminal_from: 'T1', terminal_to: 'TI', duration: '5小時' },
  { leg: '回程', route: '雅加達 CGK → 香港 HKG', flight: 'CX776', date: '20 Jul 2026', depart: '14:20', arrive: '20:30', terminal_from: 'T3', terminal_to: 'T1', duration: '5小時10分' }
];

function renderFlightsPublic(rows) {
  const cx = AIRLINE_INFO['CX'];
  let html = '';
  SHARED_FLIGHTS.forEach(f => {
    html += `<div class="list-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="color:#0f172a">${f.leg} ${f.flight}</strong>
        <span style="font-size:12px;color:#64748b">${f.date}</span>
      </div>
      <div style="margin-top:6px;font-size:14px;font-weight:700;color:#0f766e">${f.route}</div>
      <div style="margin-top:6px;font-size:13px;color:#334155">出發 ${f.depart}（Terminal ${f.terminal_from}）→ 抵達 ${f.arrive}（Terminal ${f.terminal_to}）</div>
      <div style="font-size:13px;color:#334155">飛行時間：${f.duration}｜航空公司：${cx.name}</div>
    </div>`;
  });
  html += `<div class="list-item" style="border-left:4px solid #0f766e">
    <strong style="color:#0f766e;font-size:15px">✈️ ${cx.name} 聯絡</strong>
    <div style="margin-top:6px;font-size:13px;color:#334155">香港：${cx.phone_hk}</div>
    <div style="font-size:13px;color:#334155">峇里：${cx.phone_bali}</div>
    <div style="font-size:13px;color:#334155">雅加達：${cx.phone_jkt}</div>
    <div style="font-size:13px;margin-top:4px"><a href="${cx.website}" target="_blank" class="link">${cx.website}</a></div>
  </div>`;
  html += `<div class="list-item" style="border-left:4px solid #f59e0b">
    <strong style="color:#b45309">⚠️ 航班延誤或意外處理</strong>
    <div style="margin-top:8px;font-size:13px;color:#334155;line-height:1.7">
      1. 立即通知領隊，由領隊統一處理<br>
      2. 向航空公司櫃台查詢，保留登機證及行李票<br>
      3. 如需改簽，致電國泰客服：香港 ${cx.phone_hk}｜峇里 ${cx.phone_bali}｜雅加達 ${cx.phone_jkt}<br>
      4. 延誤超過 2 小時可要求航空公司提供餐飲<br>
      5. 如航班取消，可要求退款或改簽下一班<br>
      6. 家長可致電香港支援（袁可秀女士：90340099）
    </div>
  </div>`;
  return html;
}

function renderFlightDetails(rows) {
  const myId = state.session?.member_id || '';
  const myTicket = FLIGHT_TICKETS[myId];
  const isLeader = can('leader');
  let html = '';
  if (myTicket && myTicket.pdf) {
    html += `<div style="margin-bottom:14px">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px">🎫 你的機票</div>
      <iframe src="${myTicket.pdf}" style="width:100%;height:500px;border:1px solid #dbe3ee;border-radius:14px" loading="lazy"></iframe>
      <div style="margin-top:6px"><a href="${myTicket.pdf}" target="_blank" class="link" style="font-size:13px">在新分頁開啟 PDF</a></div>
    </div>`;
  } else if (myTicket && !myTicket.pdf) {
    html += `<div class="list-item" style="border-left:4px solid #0f766e;margin-bottom:10px">
      <strong style="color:#0f766e">🎫 你的機票</strong>
      <div style="margin-top:6px;font-size:13px;color:#334155">${myTicket.note}</div>
    </div>`;
  }
  if (isLeader) {
    html += `<div style="margin-top:4px;font-size:12px;color:#64748b;font-weight:700">全部機票</div>`;
    Object.entries(FLIGHT_TICKETS).forEach(([id, t]) => {
      if (t.pdf) {
        html += `<div class="list-item" style="padding:10px">
          <strong style="color:#0f172a;font-size:14px">${id} ${t.name_en}</strong>
          <div style="margin-top:6px"><a href="${t.pdf}" target="_blank" class="link" style="font-size:13px">開啟機票 PDF</a></div>
        </div>`;
      } else {
        html += `<div class="list-item" style="padding:10px;border-left:4px solid #0f766e">
          <strong style="color:#0f172a;font-size:14px">${id} ${t.name_en}</strong>
          <div style="font-size:12px;color:#0f766e;margin-top:4px">${t.note}</div>
        </div>`;
      }
    });
    html += `<div class="list-item" style="padding:10px;border-left:4px solid #f59e0b">
      <div style="font-size:13px;color:#b45309"><strong>⚠️ 以下成員自行出發，不在此訂單：</strong></div>
      <div style="font-size:12px;color:#334155;margin-top:4px">L002 劉嘉韻、L003 方天蔚</div>
    </div>`;
  }
  return html;
}

function formatCell(v) { if (v == null || v === '') return '-'; if (typeof v === 'string' && /^https?:\/\//.test(v)) return `<a class="link" href="${v}" target="_blank">開啟連結</a>`; return String(v).replace(/\n/g, '<br>'); }

/* ── 司機信息（可收合手風琴） ── */
function renderDriverInfo(hotelRows) {
  const hotels = {};
  hotelRows.forEach(r => {
    const key = (r.location || '') + '|' + (r.hotel_name || '');
    if (!hotels[key]) hotels[key] = { ...r };
  });
  const hotelList = Object.values(hotels);

  const airports = [
    { name_en: 'Soekarno-Hatta International Airport', name_id: 'Bandara Soekarno-Hatta', address: 'Tangerang, Banten 15126, Indonesia', code: 'CGK' },
    { name_en: 'Ngurah Rai International Airport (Bali)', name_id: 'Bandara Ngurah Rai (Bali)', address: 'Jl. Airport Ngurah Rai, Tuban, Kuta, Badung, Bali 80362, Indonesia', code: 'DPS' }
  ];

  const phrases = [
    { en: 'Please take me to this hotel.', id: 'Tolong antar saya ke hotel ini.' },
    { en: 'Please take me to the airport.', id: 'Tolong antar saya ke bandara.' },
    { en: 'How much?', id: 'Berapa harganya?' },
    { en: 'Please use the meter.', id: 'Tolong pakai argo.' },
    { en: 'Thank you.', id: 'Terima kasih.' }
  ];

  let html = '';
  let idx = 0;

  // 酒店地址
  hotelList.forEach(h => {
    const addr = (h.address && h.address !== 'same address') ? h.address : '';
    html += `<div class="driver-accordion">
      <div class="driver-accordion-head" data-da="${idx}" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid #dbe3ee;border-radius:14px;cursor:pointer;background:#f0fdfa">
        <div><strong style="font-size:15px;color:#0f766e">🏨 ${h.hotel_name || '-'}</strong>${h.location ? `<span style="margin-left:8px;font-size:13px;color:#64748b">${h.location}</span>` : ''}</div>
        <div style="font-size:18px;color:#0f766e" data-da-icon="${idx}">▼</div>
      </div>
      <div class="driver-accordion-body hidden" data-da-body="${idx}" style="padding:14px;border:1px solid #dbe3ee;border-top:0;border-radius:0 0 14px 14px;margin-top:-1px">
        ${addr ? `<div style="font-size:15px;line-height:1.7;margin-bottom:6px">${addr}</div>` : ''}
        ${h.phone ? `<div style="font-size:15px">📞 ${h.phone}</div>` : ''}
      </div>
    </div>`;
    idx++;
  });

  // 機場地址
  airports.forEach(a => {
    html += `<div class="driver-accordion">
      <div class="driver-accordion-head" data-da="${idx}" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid #dbe3ee;border-radius:14px;cursor:pointer;background:#dbeafe">
        <div><strong style="font-size:15px;color:#2563eb">✈️ ${a.name_en} (${a.code})</strong></div>
        <div style="font-size:18px;color:#2563eb" data-da-icon="${idx}">▼</div>
      </div>
      <div class="driver-accordion-body hidden" data-da-body="${idx}" style="padding:14px;border:1px solid #dbe3ee;border-top:0;border-radius:0 0 14px 14px;margin-top:-1px">
        <div style="font-size:15px;color:#2563eb;font-weight:700">${a.name_id}</div>
        <div style="font-size:14px;line-height:1.7;margin-top:6px">${a.address}</div>
      </div>
    </div>`;
    idx++;
  });

  // 常用句子
  html += `<div class="driver-accordion">
    <div class="driver-accordion-head" data-da="${idx}" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid #dbe3ee;border-radius:14px;cursor:pointer;background:#fef3c7">
      <div><strong style="font-size:15px;color:#b45309">💬 Useful Phrases</strong></div>
      <div style="font-size:18px;color:#b45309" data-da-icon="${idx}">▼</div>
    </div>
    <div class="driver-accordion-body hidden" data-da-body="${idx}" style="padding:14px;border:1px solid #dbe3ee;border-top:0;border-radius:0 0 14px 14px;margin-top:-1px">
      ${phrases.map(p => `<div style="margin-bottom:10px"><div style="font-size:15px;font-weight:700">${p.en}</div><div style="font-size:14px;color:#0f766e;font-weight:600">${p.id}</div></div>`).join('')}
    </div>
  </div>`;

  return `<div style="display:grid;gap:10px">${html}</div>`;
}

function bindDriverAccordions() {
  document.querySelectorAll('.driver-accordion-head').forEach(el => {
    el.addEventListener('click', () => {
      const idx = el.dataset.da;
      const body = document.querySelector(`[data-da-body="${idx}"]`);
      const icon = document.querySelector(`[data-da-icon="${idx}"]`);
      if (body) {
        body.classList.toggle('hidden');
        if (icon) icon.textContent = body.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  });
}

/* ── 個人緊急聯絡資料：去重處理 ── */
function filterEmergencyRows(rows) {
  const isLeader = can('leader');
  if (!isLeader) return rows; // 成員不去重，全部顯示

  // 領袖/超管：用電話號碼去重（後端可能把 members_all + emergency_contacts 混在一起）
  const seen = new Set();
  return rows.filter(r => {
    const phone = String(r.member_phone || '').trim();
    const name = String(r.display_name || '').trim();
    if (!phone || phone === '-') return true; // 沒有電話的行（如熱線）保留
    if (seen.has(phone)) return false;
    seen.add(phone);
    return true;
  });
}

/* ── 個人緊急聯絡資料：後端未更新時的容錯備用方案 ── */
async function buildEmergencyMemberInfoFallback() {
  const rows = [];
  const isLeader = can('leader');

  if (isLeader) {
    // ── 領袖/超管 ──
    // 1. 全部成員的緊急聯絡（from members_all）
    try {
      const mData = await api('getCardData', { session: state.session, cardId: 'members_all' });
      (mData.rows || []).forEach(m => {
        rows.push({
          display_name: (m.chinese_name || '') + (m.english_name ? ' / ' + m.english_name : ''),
          member_phone: m.phone || '',
          emergency_contact_name: m.parent_name || '',
          emergency_contact_phone: m.parent_phone || '',
          note: m.role_type || m.scout_role || ''
        });
      });
    } catch {}

    // 2. emergency_contacts 只取 sort_order >= 4（香港支援等，不重覆隨隊領袖）
    try {
      const cData = await api('getCardData', { session: state.session, cardId: 'emergency_contacts' });
      (cData.rows || []).filter(c => (+c.sort_order || 0) >= 4).forEach(c => {
        rows.push({ display_name: c.name || '', member_phone: c.phone || '', emergency_contact_name: '', emergency_contact_phone: '', note: c.note || '' });
      });
    } catch {}

    // 3. 印尼熱線
    rows.push(...indonesiaHotlines());

    // 4. 酒店前台
    try {
      const hData = await api('getCardData', { session: state.session, cardId: 'hotels' });
      const seen = {};
      (hData.rows || []).forEach(h => {
        const key = (h.hotel_name || '') + '|' + (h.phone || '');
        if (!key || seen[key]) return;
        seen[key] = true;
        rows.push({ display_name: '🏨 ' + (h.hotel_name || '酒店前台'), member_phone: h.phone || '', emergency_contact_name: '', emergency_contact_phone: '', note: '酒店前台電話' });
      });
    } catch {}

  } else {
    // ── 普通成員 ──
    // 1. 只看自己
    try {
      const pData = await api('getMyProfile', { session: state.session });
      const p = pData.profile;
      if (p) rows.push({
        display_name: (p.chinese_name || '') + (p.english_name ? ' / ' + p.english_name : ''),
        member_phone: p.phone || '',
        emergency_contact_name: p.parent_name || '',
        emergency_contact_phone: p.parent_phone || '',
        note: '你的個人緊急聯絡資料'
      });
    } catch {}

    // 2. 全部 emergency_contacts（5位都看）
    try {
      const cData = await api('getCardData', { session: state.session, cardId: 'emergency_contacts' });
      (cData.rows || []).forEach(c => {
        rows.push({ display_name: c.name || '', member_phone: c.phone || '', emergency_contact_name: '', emergency_contact_phone: '', note: c.note || '' });
      });
    } catch {}

    // 3. 印尼熱線
    rows.push(...indonesiaHotlines());

    // 成員不加酒店電話
  }

  return rows;
}

function indonesiaHotlines() {
  return [
    { display_name: '🇮🇩 印尼綜合緊急求助', member_phone: '112', note: '全國綜合緊急求助' },
    { display_name: '🇮🇩 印尼警察', member_phone: '110', note: '警察' },
    { display_name: '🇮🇩 印尼救護車', member_phone: '118 / 119', note: '救護車 / 醫療求助' },
    { display_name: '🇮🇩 印尼消防', member_phone: '113', note: '消防' },
    { display_name: '🇮🇩 印尼搜救 BASARNAS', member_phone: '115', note: '搜救' },
    { display_name: '🇮🇩 印尼天災協助', member_phone: '129', note: '天災協助' },
    { display_name: '🇨🇳 中國駐印尼大使館（雅加達）', member_phone: '+62-21-5764135', note: '領事保護熱線；地址：Jl. Mega Kuningan No.2, Jakarta Selatan 12950' },
    { display_name: '🇨🇳 中國駐登巴薩總領事館（峇里）', member_phone: '+62-361-239902', note: '領事保護熱線；地址：Jl. Tukad Badung 8X, Renon, Denpasar, Bali 80226' },
    { display_name: '🇨🇳 中國駐泗水總領事館', member_phone: '+62-31-5678284', note: '領事保護熱線（登山活動區域）' },
    { display_name: '🇨🇳 外交部全球領事保護應急熱線', member_phone: '+86-10-12308', note: '24小時；或 +86-10-65612308' }
  ];
}

/* ── 行程路線圖 ── */
let _routeMapRows = [];
function renderRouteMap(rows) {
  _routeMapRows = rows || [];
  if (!_routeMapRows.length) return '<div class="small">暫無路線資料。請先在 Apps Script 執行 appendLatestUpdates 建立工作表。</div>';
  const sorted = [..._routeMapRows].sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0));
  const listHtml = sorted.map(r => `<div class="list-item" style="padding:10px"><strong>${r.icon || '📍'} ${formatCell(r.date)}</strong><div class="small" style="margin-top:4px">${formatCell(r.location_name)}</div>${r.note ? `<div class="small">${formatCell(r.note)}</div>`:''}</div>`).join('');
  return `<div id="routeMap"></div><div class="list" style="margin-top:14px">${listHtml}</div>`;
}
function initRouteMap() {
  if (typeof L === 'undefined') return;
  const rows = _routeMapRows;
  if (!rows.length) return;
  const sorted = [...rows].sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0));
  const mapEl = document.getElementById('routeMap');
  if (!mapEl) return;

  const map = L.map(mapEl).setView([-7.0, 112.0], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);

  const markers = [];
  sorted.forEach(r => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    const customIcon = L.divIcon({
      className: '',
      html: `<div style="font-size:24px;text-shadow:1px 1px 2px rgba(0,0,0,.4)">${r.icon || '📍'}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 24]
    });
    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
    marker.bindPopup(`<strong>${r.icon || ''} ${r.date || ''}</strong><br>${r.location_name || ''}${r.note ? '<br><small>' + r.note + '</small>' : ''}`);
    markers.push(marker);
  });

  // 畫路線
  if (markers.length >= 2) {
    const latlngs = markers.map(m => m.getLatLng());
    L.polyline(latlngs, { color: '#0f766e', weight: 3, opacity: 0.7, dashArray: '8 6' }).addTo(map);
  }

  if (markers.length) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
  }
}
function formatCellByKey(key, value) { if (value == null || value === '') return '-'; const k = String(key || '').toLowerCase(); if (k.includes('date') || k.includes('expiry')) return formatDisplayDate(value); if (k === 'updated_at' || k === 'time' || k.includes('sunrise') || k.includes('sunset')) return formatDateTime(value); return formatCell(value); }
function formatDateTime(v) { if (v == null || v === '') return '-'; const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}t/i.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); if (!isNaN(d)) return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } return s; }
function formatTimeOnly(v) { if (v == null || v === '') return '-'; const d = new Date(String(v).trim()); if (!isNaN(d)) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; const m = String(v).match(/(\d{2}:\d{2})/); return m ? m[1] : String(v); }
function friendlyPackingCategory(name) { const map = { '證件文件':'出發必備文件','出發必備文件':'出發必備文件','財物支付':'金錢與付款','金錢與付款':'金錢與付款','通訊電子':'手機與充電','手機與充電':'手機與充電','日常衣物':'日常換洗衣物','衣物穿著':'日常換洗衣物','日常換洗衣物':'日常換洗衣物','鞋履':'鞋襪與外出穿著','鞋襪與外出穿著':'鞋襪與外出穿著','防曬防雨':'防曬防雨用品','防曬防雨用品':'防曬防雨用品','盥洗衛生':'個人清潔用品','個人清潔用品':'個人清潔用品','健康安全':'健康與安全用品','健康與安全用品':'健康與安全用品','活動專用':'日間活動用品','日間活動用品':'日間活動用品','潛水 / 漂流':'玩水及活動後更換用品','玩水及活動後更換用品':'玩水及活動後更換用品','上山保暖':'上山保暖用品','上山保暖用品':'上山保暖用品','家長提醒':'出發前家長確認','出發前家長確認':'出發前家長確認' }; return map[name] || name; }
function labelize(k) { return k.replace(/_/g,' '); }
function truthy(v) { return String(v).toUpperCase() === 'TRUE' || v === true || v === 'Yes' || v === '是'; }

async function login() { try { const data = await api('login', { username: document.getElementById('usernameInput').value.trim(), password: document.getElementById('passwordInput').value.trim() }); saveSession(data.session); document.getElementById('loginModal').classList.remove('open'); await bootstrap(); } catch (err) { alert(err.message); } }
async function changeMyPassword() { const pw = prompt('請輸入新密碼'); if (!pw) return; try { await api('updateOwnPassword', { session: state.session, newPassword: pw }); alert('密碼已更新'); } catch (err) { alert(err.message); } }
window.changeMyPassword = changeMyPassword;

async function openAdmin() { if (!can('superadmin')) return; document.getElementById('adminSection').classList.remove('hidden'); await renderAdmin(); }
async function renderAdmin() {
  const wrap = document.getElementById('adminTabContent');
  if (state.adminTab === 'users') {
    const data = await api('adminListUsers', { session: state.session });
    wrap.innerHTML = `<div class="list">${data.rows.map(u => `<div class="list-item"><strong>${u.display_name || u.username}</strong><div class="small">${u.username}</div><div class="meta"><select data-role="${u.username}" class="input" style="max-width:180px"><option value="member" ${u.role==='member'?'selected':''}>member</option><option value="leader" ${u.role==='leader'?'selected':''}>leader</option><option value="superadmin" ${u.role==='superadmin'?'selected':''}>superadmin</option></select><button class="btn btn-light" data-active="${u.username}">${truthy(u.active) ? '停用' : '啟用'}</button><button class="btn btn-light" data-reset="${u.username}">重設密碼</button></div></div>`).join('')}</div>`;
    wrap.querySelectorAll('[data-role]').forEach(el => el.addEventListener('change', async () => { await api('adminUpdateUser', { session: state.session, username: el.dataset.role, updates: { role: el.value } }); await bootstrap(); await renderAdmin(); }));
    wrap.querySelectorAll('[data-active]').forEach(el => el.addEventListener('click', async () => { await api('adminToggleUserActive', { session: state.session, username: el.dataset.active }); await renderAdmin(); }));
    wrap.querySelectorAll('[data-reset]').forEach(el => el.addEventListener('click', async () => { const pw = prompt('輸入新密碼'); if (!pw) return; await api('adminUpdateUser', { session: state.session, username: el.dataset.reset, updates: { password: pw } }); alert('已更新'); }));
  } else if (state.adminTab === 'cards') {
    const data = await api('adminListCards', { session: state.session });
    wrap.innerHTML = `<div class="list">${data.rows.map(c => `<div class="list-item"><strong>${c.title}</strong><div class="small">${c.card_id}</div><div class="meta"><button class="btn btn-light" data-card-enabled="${c.card_id}">${truthy(c.enabled) ? '關閉卡片' : '開啟卡片'}</button><select data-card-visibility="${c.card_id}" class="input" style="max-width:180px"><option value="public" ${c.visibility==='public'?'selected':''}>public</option><option value="member" ${c.visibility==='member'?'selected':''}>member</option><option value="leader" ${c.visibility==='leader'?'selected':''}>leader</option><option value="superadmin" ${c.visibility==='superadmin'?'selected':''}>superadmin</option></select></div></div>`).join('')}</div>`;
    wrap.querySelectorAll('[data-card-enabled]').forEach(el => el.addEventListener('click', async () => { await api('adminToggleCard', { session: state.session, cardId: el.dataset.cardEnabled }); await bootstrap(); await renderAdmin(); }));
    wrap.querySelectorAll('[data-card-visibility]').forEach(el => el.addEventListener('change', async () => { await api('adminUpdateCard', { session: state.session, cardId: el.dataset.cardVisibility, updates: { visibility: el.value } }); await bootstrap(); await renderAdmin(); }));
  } else if (state.adminTab === 'permissions') {
    const users = await api('adminListUsers', { session: state.session });
    const cards = await api('adminListCards', { session: state.session });
    wrap.innerHTML = `<div class="list-item color-blue"><strong>個別權限覆寫</strong><div class="small">前端按鈕會寫入 USER_CARD_ACCESS。你亦可直接去 Google Sheet 的 USER_CARD_ACCESS 工作表手動新增 / 修改：username、card_id、allowed。</div></div><div class="grid-2" style="margin-top:14px"><select id="permUser" class="input">${users.rows.map(u=>`<option value="${u.username}">${u.display_name || u.username}</option>`).join('')}</select><select id="permCard" class="input">${cards.rows.map(c=>`<option value="${c.card_id}">${c.title}</option>`).join('')}</select></div><div style="margin-top:12px"><button class="btn btn-primary" id="allowBtn">開通此卡片</button><button class="btn btn-light" id="denyBtn" style="margin-left:8px">停用此卡片</button></div>`;
    document.getElementById('allowBtn').addEventListener('click', async () => { await api('adminSetUserCardAccess', { session: state.session, username: permUser.value, cardId: permCard.value, allowed: true }); alert('已開通（已寫入 USER_CARD_ACCESS）'); });
    document.getElementById('denyBtn').addEventListener('click', async () => { await api('adminSetUserCardAccess', { session: state.session, username: permUser.value, cardId: permCard.value, allowed: false }); alert('已停用（已寫入 USER_CARD_ACCESS）'); });
  } else if (state.adminTab === 'sheets') {
    wrap.innerHTML = `<div class="grid-2"><div class="list"><div class="list-item color-blue"><strong>CONFIG / CARDS / USER_CARD_ACCESS</strong><div class="small">系統設定型。個別帳戶卡片開通 / 停用就在 USER_CARD_ACCESS。</div></div><div class="list-item color-red"><strong>USER / MEMBERS</strong><div class="small">敏感資料型</div></div></div><div class="list"><div class="list-item color-yellow"><strong>內容型工作表</strong><div class="small">itinerary / flights / hotels / notes / packing_list / weather_locations / transport_info / team_rules 等</div></div></div></div>`;
  }
}

function bindStatic() {
  document.getElementById('showLoginBtn').addEventListener('click', () => document.getElementById('loginModal').classList.add('open'));
  document.getElementById('closeLoginBtn').addEventListener('click', () => document.getElementById('loginModal').classList.remove('open'));
  document.getElementById('submitLoginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', async () => { clearSession(); await bootstrap(); document.querySelectorAll('.inline-card-content').forEach(el => el.classList.add('hidden')); document.getElementById('adminSection').classList.add('hidden'); });
  document.getElementById('myProfileBtn').addEventListener('click', () => openCard('my_profile', false));
  document.getElementById('leaderBtn').addEventListener('click', () => openCard('members_all', false));
  document.getElementById('adminBtn').addEventListener('click', openAdmin);
  document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', async () => { state.adminTab = btn.dataset.adminTab; await renderAdmin(); }));
}

document.addEventListener('DOMContentLoaded', async () => { bindStatic(); await bootstrap(); });
