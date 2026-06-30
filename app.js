const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby3COQ-Fg-RPk1qmnEU6X5noUWf5MA0r9jXbQtYbUEtSjI-jCaIiEgM95o7Sk7TPQ5_/exec';

const state = {
  session: loadSession(),
  bootstrap: null,
  cards: [],
  currentCardId: null,
  adminTab: 'users'
};

function loadSession() {
  try { return JSON.parse(localStorage.getItem('tripLiveSession') || 'null'); } catch { return null; }
}
function saveSession(session) {
  localStorage.setItem('tripLiveSession', JSON.stringify(session));
  state.session = session;
}
function clearSession() {
  localStorage.removeItem('tripLiveSession');
  state.session = null;
}
function roleRank(role) {
  return { public:0, member:1, leader:2, superadmin:3 }[role] ?? 0;
}
function can(role) {
  return roleRank(state.session?.role || 'public') >= roleRank(role);
}

async function api(action, payload = {}) {
  const body = { action, ...payload };
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
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

function setStatus(text) {
  document.getElementById('statusBar').textContent = text || '';
}

function renderShell() {
  const cfg = state.bootstrap?.configMap || {};
  document.getElementById('siteTag').textContent = `🌏 ${cfg.site_name || '童遊世界‧印尼活動備忘'}`;
  document.getElementById('siteTitle').textContent = cfg.site_name || '童遊世界‧印尼活動備忘';
  document.getElementById('siteDesc').textContent = '家長可直接查看活動概況；登入後按角色顯示個人、領袖及管理資料。';
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
    const rateData = await api('getCardData', { session: state.session, cardId: 'exchange_rates' });
    const weatherData = await api('getCardData', { session: state.session, cardId: 'weather' });
    const rates = (rateData.rows || []).slice(0, 3).map(r => `${r.pair}: ${r.rate ?? '-'}`).join(' ｜ ');
    const weather = (weatherData.rows || []).slice(0, 3).map(r => `${r.city} ${r.current_temp ?? '-'}°C`).join(' ｜ ');
    document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">匯率：${rates}</div><div class="small" style="margin-top:4px">天氣：${weather}</div></div>`;
  } catch (e) {
    document.getElementById('heroSummary').innerHTML = `<div class="summary-box"><strong>即時摘要</strong><div class="small" style="margin-top:6px">暫時未能讀取即時資料</div></div>`;
  }
}

function formatDateRange(start, end) {
  if (!start || !end) return '7 月 11–20 日';
  return `${start} → ${end}`;
}

function renderCards() {
  const box = document.getElementById('cards');
  box.innerHTML = '';
  state.cards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="card-top">
        <div class="icon">${card.icon || '📄'}</div>
        <div class="badge">${card.visibility || 'public'}</div>
      </div>
      <h3>${card.title}</h3>
      <p>${card.description || ''}</p>
      <div class="card-footer">
        <span class="small">由 Google Sheet 控制</span>
        <button class="btn btn-light" data-card="${card.card_id}">進入</button>
      </div>`;
    box.appendChild(el);
  });
  box.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => openCard(btn.dataset.card)));
}

async function openCard(cardId) {
  state.currentCardId = cardId;
  document.getElementById('contentSection').classList.remove('hidden');
  document.getElementById('adminSection').classList.add('hidden');
  const panel = document.getElementById('contentPanel');
  const title = document.getElementById('contentTitle');
  title.textContent = '載入中...';
  panel.innerHTML = '<div class="small">讀取資料中...</div>';
  try {
    if (cardId === 'my_profile') {
      const data = await api('getMyProfile', { session: state.session });
      title.textContent = '我的資料';
      panel.innerHTML = renderProfile(data.profile);
      return;
    }
    const data = await api('getCardData', { session: state.session, cardId });
    title.textContent = data.card?.title || cardId;
    panel.innerHTML = renderCardData(cardId, data.rows || [], data.meta || {});
  } catch (err) {
    title.textContent = '讀取失敗';
    panel.innerHTML = `<div class="small">${err.message}</div>`;
  }
}

function renderProfile(p) {
  if (!p) return '<div class="small">沒有資料</div>';
  return `
    <div class="list-item">
      <strong>${p.chinese_name || ''} ${p.english_name ? ' / ' + p.english_name : ''}</strong>
      <div class="meta"><span class="chip">${p.role_type || ''}</span><span class="chip">${p.scout_role || ''}</span></div>
      <table class="table" style="margin-top:10px">
        <tr><td>電話</td><td>${p.phone || '-'}</td></tr>
        <tr><td>Email</td><td>${p.email || '-'}</td></tr>
        <tr><td>緊急聯絡人</td><td>${p.parent_name || '-'} ${p.parent_relation ? '（' + p.parent_relation + '）' : ''}</td></tr>
        <tr><td>緊急聯絡電話</td><td>${p.parent_phone || '-'}</td></tr>
        <tr><td>護照號碼</td><td>${p.passport_no || '-'}</td></tr>
        <tr><td>護照到期日</td><td>${p.passport_expiry || '-'}</td></tr>
        <tr><td>健康備註</td><td>${p.medical_notes || '-'}</td></tr>
      </table>
      <div style="margin-top:12px"><button class="btn btn-primary" onclick="changeMyPassword()">修改密碼</button></div>
    </div>`;
}

function renderCardData(cardId, rows, meta) {
  if (cardId === 'packing') return renderPacking(rows);
  if (cardId === 'weather') return renderWeather(rows, meta);
  if (cardId === 'exchange_rates') return renderRates(rows, meta);
  if (cardId === 'emergency_actions') return renderEmergencyActions(rows);
  if (['restaurants','souvenirs','attractions','marine_life'].includes(cardId)) return renderGroupedByCity(rows);
  return renderGenericTable(rows);
}

function renderGenericTable(rows) {
  if (!rows.length) return '<div class="small">暫無資料</div>';
  const headers = Object.keys(rows[0]);
  return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${formatCell(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderGroupedByCity(rows) {
  const groups = {};
  rows.forEach(r => { const city = r.city || '其他'; (groups[city] ||= []).push(r); });
  return Object.entries(groups).map(([city,list]) => `
    <div class="list-item">
      <strong>${city}</strong>
      <div class="list" style="margin-top:10px">${list.map(r => `<div class="list-item"><strong>${r.name || r.item_name || r.species_name || '-'}</strong>${Object.entries(r).filter(([k,v]) => !['city','name','item_name','species_name'].includes(k) && v).map(([k,v]) => `<div class="small" style="margin-top:6px">${labelize(k)}：${formatCell(v)}</div>`).join('')}</div>`).join('')}</div>
    </div>`).join('');
}

function renderPacking(rows) {
  const key = `packingChecklist:${state.session?.username || 'public'}`;
  const checked = JSON.parse(localStorage.getItem(key) || '{}');
  const total = rows.length;
  const count = rows.filter(r => checked[r.item_id]).length;
  const percent = total ? Math.round(count / total * 100) : 0;
  return `
    <div>
      <div class="small">已完成 ${count} / ${total} 項</div>
      <div class="progress"><div style="width:${percent}%"></div></div>
      <div style="display:flex;justify-content:flex-end;margin:12px 0"><button class="btn btn-light" onclick="clearPacking()">清除勾選</button></div>
      <div class="checklist">${rows.map(r => `<label class="check-item"><input type="checkbox" data-pack="${r.item_id}" ${checked[r.item_id] ? 'checked' : ''}><div><strong>${r.item_name}</strong><div class="meta"><span class="chip">${r.category || ''}</span><span class="chip">數量：${r.quantity || 1}</span>${truthy(r.required) ? '<span class="chip">必備</span>' : '<span class="chip">建議</span>'}</div>${r.note ? `<div class="small" style="margin-top:6px">${r.note}</div>` : ''}</div></label>`).join('')}</div>
    </div>`;
}

function bindPacking() {
  document.querySelectorAll('[data-pack]').forEach(cb => cb.addEventListener('change', () => {
    const key = `packingChecklist:${state.session?.username || 'public'}`;
    const checked = JSON.parse(localStorage.getItem(key) || '{}');
    checked[cb.dataset.pack] = cb.checked;
    localStorage.setItem(key, JSON.stringify(checked));
    openCard('packing');
  }));
}
function clearPacking() {
  const key = `packingChecklist:${state.session?.username || 'public'}`;
  localStorage.removeItem(key);
  openCard('packing');
}
window.clearPacking = clearPacking;

function renderWeather(rows, meta) {
  const cards = rows.map(r => `<div class="list-item"><strong>${r.city}</strong><div class="small" style="margin-top:6px">現時：${r.current_temp ?? '-'}°C｜體感：${r.apparent_temp ?? '-'}°C｜風速：${r.wind_speed ?? '-'} km/h</div><div class="small">今日：${r.temp_min ?? '-'}°C - ${r.temp_max ?? '-'}°C｜降雨：${r.precipitation ?? 0} mm</div><div class="small">更新：${r.time || '-'}</div></div>`).join('');
  return `<div class="list">${cards}<div class="list-item color-blue"><strong>資料來源</strong><div class="small">Open-Meteo forecast API（免 API key，非商業用途可用）</div></div></div>`;
}

function renderRates(rows, meta) {
  return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.pair}</strong><div style="margin-top:6px">${r.rate}</div><div class="small">更新：${r.updated_at || '-'}</div></div>`).join('')}</div>`;
}

function renderEmergencyActions(rows) {
  return `<div class="list">${rows.map(r => `<div class="list-item"><strong>${r.scenario}</strong><div class="small" style="margin-top:6px">先通知：${r.primary_contact || '-'}</div><div class="small">電話：${r.primary_phone || '-'}</div>${r.secondary_contact ? `<div class="small">後備：${r.secondary_contact} ${r.secondary_phone || ''}</div>`:''}${r.note ? `<div class="small">備註：${r.note}</div>`:''}</div>`).join('')}</div>`;
}

function formatCell(v) {
  if (v == null || v === '') return '-';
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return `<a class="link" href="${v}" target="_blank">連結</a>`;
  return String(v).replace(/\n/g, '<br>');
}
function labelize(k) { return k.replace(/_/g,' '); }
function truthy(v) { return String(v).toUpperCase() === 'TRUE' || v === true || v === 'Yes' || v === '是'; }

async function login() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  try {
    const data = await api('login', { username, password });
    saveSession(data.session);
    document.getElementById('loginModal').classList.remove('open');
    await bootstrap();
  } catch (err) {
    alert(err.message);
  }
}

async function changeMyPassword() {
  const pw = prompt('請輸入新密碼');
  if (!pw) return;
  try {
    await api('updateOwnPassword', { session: state.session, newPassword: pw });
    alert('密碼已更新');
  } catch (err) { alert(err.message); }
}
window.changeMyPassword = changeMyPassword;

async function openAdmin() {
  if (!can('superadmin')) return;
  document.getElementById('adminSection').classList.remove('hidden');
  document.getElementById('contentSection').classList.add('hidden');
  await renderAdmin();
}

async function renderAdmin() {
  const wrap = document.getElementById('adminTabContent');
  if (state.adminTab === 'users') {
    const data = await api('adminListUsers', { session: state.session });
    wrap.innerHTML = `<div class="list">${data.rows.map((u, i) => `<div class="list-item"><strong>${u.display_name || u.username}</strong><div class="small">${u.username}</div><div class="meta"><select data-role="${u.username}" class="input" style="max-width:180px"><option value="member" ${u.role==='member'?'selected':''}>member</option><option value="leader" ${u.role==='leader'?'selected':''}>leader</option><option value="superadmin" ${u.role==='superadmin'?'selected':''}>superadmin</option></select><button class="btn btn-light" data-active="${u.username}">${truthy(u.active) ? '停用' : '啟用'}</button><button class="btn btn-light" data-reset="${u.username}">重設密碼</button></div></div>`).join('')}</div>`;
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
    wrap.innerHTML = `<div class="list-item color-blue"><strong>個別權限覆寫</strong><div class="small">選擇用戶及卡片，寫入 USER_CARD_ACCESS。</div></div><div class="grid-2" style="margin-top:14px"><select id="permUser" class="input">${users.rows.map(u=>`<option value="${u.username}">${u.display_name || u.username}</option>`).join('')}</select><select id="permCard" class="input">${cards.rows.map(c=>`<option value="${c.card_id}">${c.title}</option>`).join('')}</select></div><div style="margin-top:12px"><button class="btn btn-primary" id="allowBtn">開通此卡片</button><button class="btn btn-light" id="denyBtn" style="margin-left:8px">停用此卡片</button></div>`;
    document.getElementById('allowBtn').addEventListener('click', async () => { await api('adminSetUserCardAccess', { session: state.session, username: permUser.value, cardId: permCard.value, allowed: true }); alert('已開通'); });
    document.getElementById('denyBtn').addEventListener('click', async () => { await api('adminSetUserCardAccess', { session: state.session, username: permUser.value, cardId: permCard.value, allowed: false }); alert('已停用'); });
  } else if (state.adminTab === 'sheets') {
    wrap.innerHTML = `<div class="grid-2"><div class="list"><div class="list-item color-blue"><strong>CONFIG / CARDS / USER_CARD_ACCESS</strong><div class="small">系統設定型</div></div><div class="list-item color-red"><strong>USER / MEMBERS</strong><div class="small">敏感資料型</div></div></div><div class="list"><div class="list-item color-yellow"><strong>內容型工作表</strong><div class="small">itinerary / flights / hotels / notes / packing_list / weather_locations / restaurants / souvenirs / attractions / marine_life / exchange_rates / emergency_actions</div></div></div></div>`;
  }
}

function bindStatic() {
  document.getElementById('showLoginBtn').addEventListener('click', () => document.getElementById('loginModal').classList.add('open'));
  document.getElementById('closeLoginBtn').addEventListener('click', () => document.getElementById('loginModal').classList.remove('open'));
  document.getElementById('submitLoginBtn').addEventListener('click', login);
  document.getElementById('logoutBtn').addEventListener('click', async () => { clearSession(); await bootstrap(); document.getElementById('contentSection').classList.add('hidden'); document.getElementById('adminSection').classList.add('hidden'); });
  document.getElementById('myProfileBtn').addEventListener('click', () => openCard('my_profile'));
  document.getElementById('leaderBtn').addEventListener('click', () => openCard('members_all'));
  document.getElementById('adminBtn').addEventListener('click', openAdmin);
  document.querySelectorAll('[data-admin-tab]').forEach(btn => btn.addEventListener('click', async () => { state.adminTab = btn.dataset.adminTab; await renderAdmin(); }));
}

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-pack]')) bindPacking();
});

document.addEventListener('DOMContentLoaded', async () => {
  bindStatic();
  await bootstrap();
});
