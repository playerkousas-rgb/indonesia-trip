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
    state.bootstrap = data.bootstrap; state.cards = data.cards || [];
    renderShell(); renderCards();
  } catch (err) { console.error(err); setStatus('未能讀取資料，請稍後再試。'); }
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
}
async function renderHeroSummary() {
  try {
    const [rateData, weatherData] = await Promise.all([api('getCardData', { session: state.session, cardId: 'exchange_rates' }), api('getCardData', { session: state.session, cardId: 'weather' })]);
    const rates = (rateData.rows || []).slice(0, 3).map(r => `${r.pair}: ${r.rate ?? '-'}`).join(' ｜ ');
    const weather = (weatherData.rows || []).slice(0, 3).map(r => `${r.city} ${r.current_temp ?? '-'}°C`).join(' ｜ ');
    document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">匯率：${rates}</div><div class="small" style="margin-top:4px">天氣：${weather}</div></div>`;
  } catch { document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">暫時未能讀取即時資料</div></div>`; }
}

function formatDisplayDate(v) { if (v == null || v === '') return '-'; const s = String(v).trim(); const d = new Date(s); if (!isNaN(d) && /^\d{4}-\d{2}-\d{2}/.test(s)) return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`; return s; }
function formatDateRange(start, end) { if (!start || !end) return '2026/7/11 → 2026/7/20'; return `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`; }

function renderCards() {
  const box = document.getElementById('cards'); box.innerHTML = '';
  state.cards.forEach(card => {
    const el = document.createElement('div'); el.className = 'card'; el.id = `card-${card.card_id}`;
    el.innerHTML = `<div class="card-top"><div class="icon">${card.icon || '📄'}</div><div class="badge">${card.visibility || 'public'}</div></div><h3>${card.title}</h3><p>${card.description || ''}</p><div class="card-footer"><span class="small">由 Google Sheet 控制</span><button class="btn btn-light" data-card="${card.card_id}">進入</button></div><div class="inline-card-content hidden" id="inline-${card.card_id}"><div class="inline-card-head"><strong id="inline-title-${card.card_id}">${card.title}</strong></div><div class="inline-card-body small">讀取資料中...</div></div>`;
    box.appendChild(el);
  });
  box.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => openCard(btn.dataset.card)));
}

async function openCard(cardId) {
  const inline = document.getElementById(`inline-${cardId}`); const inlineTitle = document.getElementById(`inline-title-${cardId}`); const inlineBody = inline?.querySelector('.inline-card-body');
  document.querySelectorAll('.inline-card-content').forEach(el => el.classList.add('hidden'));
  if (inline) { inline.classList.remove('hidden'); inlineBody.innerHTML = '<div class="small">讀取資料中...</div>'; document.getElementById(`card-${cardId}`)?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  try {
    if (cardId === 'my_profile') {
      const data = await api('getMyProfile', { session: state.session }); inlineTitle.textContent = '我的資料'; inlineBody.innerHTML = renderProfile(data.profile); return;
    }
    const data = await api('getCardData', { session: state.session, cardId }); inlineTitle.textContent = data.card?.title || cardId; inlineBody.innerHTML = renderCardData(cardId, data.rows || [], data.meta || {}); afterRenderCard(cardId);
  } catch (err) { inlineTitle.textContent = '讀取失敗'; inlineBody.innerHTML = `<div class="small">${err.message}</div>`; }
}

function afterRenderCard(cardId) { if (cardId === 'packing') bindPackingTabs(); if (cardId === 'members_all') bindMemberTabs(); if (cardId === 'hotels') bindHotelTabs(); }

function renderProfile(p) { if (!p) return '<div class="small">沒有資料</div>'; return `<div class="list-item"><strong>${p.chinese_name || ''} ${p.english_name ? ' / ' + p.english_name : ''}</strong><div class="meta"><span class="chip">${p.role_type || ''}</span><span class="chip">${p.scout_role || ''}</span></div><div class="table-wrap"><table class="table" style="margin-top:10px"><tr><td>電話</td><td>${p.phone || '-'}</td></tr><tr><td>Email</td><td>${p.email || '-'}</td></tr><tr><td>緊急聯絡人</td><td>${p.parent_name || '-'} ${p.parent_relation ? '（' + p.parent_relation + '）' : ''}</td></tr><tr><td>緊急聯絡電話</td><td>${p.parent_phone || '-'}</td></tr><tr><td>護照號碼</td><td>${p.passport_no || '-'}</td></tr><tr><td>護照到期日</td><td>${formatDisplayDate(p.passport_expiry) || '-'}</td></tr><tr><td>健康備註</td><td>${p.medical_notes || '-'}</td></tr></table></div><div style="margin-top:12px"><button class="btn btn-primary" onclick="changeMyPassword()">修改密碼</button></div></div>`; }

function renderCardData(cardId, rows, meta) {
  if (cardId === 'packing') return renderPackingTabbed(rows);
  if (cardId === 'weather') return renderWeather(rows);
  if (cardId === 'exchange_rates') return renderRates(rows);
  if (cardId === 'emergency_actions') return renderEmergencyActions(rows);
  if (cardId === 'emergency_contacts') return renderEmergencyContacts(rows);
  if (cardId === 'emergency_member_info') return renderEmergencyMemberInfo(rows);
  if (cardId === 'members_all') return renderMembersTabbed(rows);
  if (cardId === 'hotels') return renderHotels(rows);
  if (cardId === 'transport_info') return renderTransport(rows);
  if (cardId === 'team_rules') return renderRules(rows);
  if (['restaurants','souvenirs','attractions','marine_life','phrases','apps'].includes(cardId)) return renderGroupedByCity(rows, cardId);
  return renderGenericTable(rows);
}

function renderGenericTable(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const headers = Object.keys(rows[0]); return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${formatCellByKey(h, r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function renderMembersTabbed(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const tabs = rows.map((r, i) => `<button class="btn btn-light member-tab ${i===0?'active':''}" data-member-tab="${i}">${r.chinese_name || r.display_name || '成員'}</button>`).join(''); const panels = rows.map((r, i) => `<div class="member-panel ${i===0?'':'hidden'}" data-member-panel="${i}"><div class="list-item"><strong>${r.chinese_name || ''} ${r.english_name ? ' / ' + r.english_name : ''}</strong><div class="meta"><span class="chip">${r.role_type || ''}</span><span class="chip">${r.scout_role || ''}</span></div><div class="table-wrap"><table class="table" style="margin-top:10px"><tr><td>電話</td><td>${formatCell(r.phone)}</td></tr><tr><td>Email</td><td>${formatCell(r.email)}</td></tr><tr><td>緊急聯絡人</td><td>${formatCell(r.parent_name)} ${r.parent_relation ? '（' + r.parent_relation + '）' : ''}</td></tr><tr><td>緊急聯絡電話</td><td>${formatCell(r.parent_phone)}</td></tr><tr><td>護照號碼</td><td>${formatCell(r.passport_no)}</td></tr><tr><td>護照到期日</td><td>${formatCellByKey('passport_expiry', r.passport_expiry)}</td></tr><tr><td>健康備註</td><td>${formatCell(r.medical_notes)}</td></tr></table></div></div></div>`).join(''); return `<div class="nav-tabs">${tabs}</div><div style="margin-top:14px">${panels}</div>`; }
function bindMemberTabs() { document.querySelectorAll('[data-member-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-member-tab]').forEach(b => b.classList.remove('active')); document.querySelectorAll('[data-member-panel]').forEach(p => p.classList.add('hidden')); btn.classList.add('active'); document.querySelector(`[data-member-panel="${btn.dataset.memberTab}"]`)?.classList.remove('hidden'); })); }
function bindHotelTabs() { document.querySelectorAll('[data-hotel-tab]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-hotel-tab]').forEach(b => b.classList.remove('active')); document.querySelectorAll('[data-hotel-panel]').forEach(p => p.classList.add('hidden')); btn.classList.add('active'); document.querySelector(`[data-hotel-panel="${btn.dataset.hotelTab}"]`)?.classList.remove('hidden'); })); }

function renderEmergencyContacts(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.name)}</strong><div class="small" style="margin-top:6px">電話：${formatCell(r.phone)}</div>${r.whatsapp ? `<div class="small">WhatsApp：${formatCell(r.whatsapp)}</div>` : ''}${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }
function renderEmergencyActions(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.scenario}</strong><div class="small" style="margin-top:6px">先通知：${r.primary_contact || '-'}</div><div class="small">電話：${r.primary_phone || '-'}</div>${r.secondary_contact ? `<div class="small">後備：${r.secondary_contact} ${r.secondary_phone || ''}</div>`:''}${r.note ? `<div class="small">備註：${r.note}</div>`:''}</div>`).join('')}</div>`; }
function renderEmergencyMemberInfo(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.display_name)}</strong>${r.member_phone ? `<div class="small" style="margin-top:6px">本人電話：${formatCell(r.member_phone)}</div>` : ''}${r.emergency_contact_name ? `<div class="small">緊急聯絡人：${formatCell(r.emergency_contact_name)}</div>` : ''}${r.emergency_contact_phone ? `<div class="small">緊急聯絡人電話：${formatCell(r.emergency_contact_phone)}</div>` : ''}${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }

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

function renderWeather(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.city}</strong><div class="small" style="margin-top:6px">現時：${r.current_temp ?? '-'}°C｜體感：${r.apparent_temp ?? '-'}°C｜風速：${r.wind_speed ?? '-'} km/h</div><div class="small">今日：${r.temp_min ?? '-'}°C - ${r.temp_max ?? '-'}°C｜降雨：${r.precipitation ?? 0} mm</div><div class="small">明日：${r.tomorrow_min ?? '-'}°C - ${r.tomorrow_max ?? '-'}°C</div><div class="small">日出：${formatTimeOnly(r.sunrise)}｜日落：${formatTimeOnly(r.sunset)}</div>${r.sea_temp !== '' && r.sea_temp != null ? `<div class="small">海水溫度：${r.sea_temp}°C</div>` : ''}<div class="small">更新：${formatDateTime(r.time)}</div></div>`).join('')}<div class="list-item color-blue"><strong>資料來源</strong><div class="small">Open-Meteo forecast API；海水溫度只顯示峇里。</div></div></div>`; }
function renderRates(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.pair}</strong><div style="margin-top:6px">${r.rate}</div><div class="small">更新：${formatCellByKey('updated_at', r.updated_at)}</div></div>`).join('')}</div>`; }
function renderHotels(rows) { if (!rows.length) return '<div class="small">暫無資料</div>'; const grouped = {}; rows.forEach(r => { const key = [r.location || '', r.hotel_name || '', r.address || ''].join('|'); if (!grouped[key]) grouped[key] = { ...r, dates: [] }; if (r.date) grouped[key].dates.push(r.date); }); const list = Object.values(grouped); const tabs = list.map((r, i) => `<button class="btn btn-light hotel-tab ${i===0?'active':''}" data-hotel-tab="${i}">${r.location || r.hotel_name || '酒店'}</button>`).join(''); const panels = list.map((r, i) => `<div class="hotel-panel ${i===0?'':'hidden'}" data-hotel-panel="${i}"><div class="list-item"><strong>${formatCell(r.hotel_name)}</strong><div class="small" style="margin-top:6px">日期：${r.dates.map(d => formatCellByKey('date', d)).join('、')}</div><div class="small">地點：${formatCell(r.location)}</div>${r.address ? `<div class="small">地址：${formatCell(r.address)}</div>` : ''}${r.phone ? `<div class="small">電話：${formatCell(r.phone)}</div>` : ''}${r.booking_id ? `<div class="small">預訂 / 確認編號：${formatCell(r.booking_id)}</div>` : ''}${r.order_id ? `<div class="small">訂單編號：${formatCell(r.order_id)}</div>` : ''}${r.pin_code ? `<div class="small">PIN 碼：${formatCell(r.pin_code)}</div>` : ''}${r.map_url ? `<div class="small">地圖：${formatCell(r.map_url)}</div>` : ''}${r.transport_note ? `<div class="small">交通：${formatCell(r.transport_note)}</div>` : ''}</div></div>`).join(''); return `<div class="nav-tabs">${tabs}</div><div style="margin-top:14px">${panels}</div>`; }
function renderTransport(rows) { return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${formatCell(r.route)}</strong><div class="small" style="margin-top:6px">由：${formatCell(r.from_place)}</div><div class="small">到：${formatCell(r.to_place)}</div><div class="small">方式：${formatCell(r.method)}</div><div class="small">車程：約 ${formatCell(r.estimated_time)}</div><div class="small">費用：約 ${formatCell(r.estimated_cost)}</div>${r.note ? `<div class="small">備註：${formatCell(r.note)}</div>` : ''}</div>`).join('')}</div>`; }
function renderRules(rows) { return `<div class="list">${[...rows].sort((a,b)=>(+a.sort_order||0)-(+b.sort_order||0)).map(r => `<div class="list-item"><div>${formatCell(r.rule)}</div></div>`).join('')}</div>`; }

function formatCell(v) { if (v == null || v === '') return '-'; if (typeof v === 'string' && /^https?:\/\//.test(v)) return `<a class="link" href="${v}" target="_blank">開啟連結</a>`; return String(v).replace(/\n/g, '<br>'); }
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
  document.getElementById('myProfileBtn').addEventListener('click', () => openCard('my_profile'));
  document.getElementById('leaderBtn').addEventListener('click', () => openCard('members_all'));
  document.getElementById('adminBtn').addEventListener('click', openAdmin);
  document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', async () => { state.adminTab = btn.dataset.adminTab; await renderAdmin(); }));
}

document.addEventListener('DOMContentLoaded', async () => { bindStatic(); await bootstrap(); });
