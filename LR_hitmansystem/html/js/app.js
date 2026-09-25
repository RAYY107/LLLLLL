/* ═══════════════════════════════════════════════
   نظام الاغتيال - المتحكم الرئيسي
   Arabic RTL Tablet App Controller
═══════════════════════════════════════════════ */

'use strict';

// ─── UTILITIES ──────────────────────────────
const $ = (id) => document.getElementById(id);
const fmt = {
  money:  (n) => '$' + Number(n || 0).toLocaleString('en-US'),
  time:   (ts) => ts ? new Date(ts * 1000).toLocaleString('ar-SA', { hour12: true }) : '—',
  secs:   (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}د و ${sec}ث` : `${sec}ث`;
  }
};

function post(event, data) {
  let resourceName = 'LR_hitmansystem';
  if (typeof window.GetParentResourceName === 'function') {
    try {
      const res = window.GetParentResourceName();
      if (res && res !== '') resourceName = res;
    } catch(e) {}
  }
  return fetch(`https://${resourceName}/${event}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
}

// ─── STATE ──────────────────────────────────
window.AppState = {
  mode:          null,
  civilianData:  null,
  hitmanData:    null,
  selectedTarget: null,
  currentTab:    'contracts',
};

// ─── NUI MESSAGE HANDLER ─────────────────────
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.action) return;

  switch (msg.action) {
    case 'open':
      handleOpen(msg.mode, msg.data);
      break;
    case 'close':
      handleClose();
      break;
    case 'contractResult':
      if (window.CivilianUI) CivilianUI.handleContractResult(msg.success, msg.message);
      break;
    case 'acceptResult':
      if (window.HitmanUI) HitmanUI.handleAcceptResult(msg.success, msg.message, msg.data);
      break;
    case 'updateHitmanData':
      if (window.HitmanUI) HitmanUI.loadData(msg.data);
      break;
    case 'notify':
      showNotification(msg.type, msg.title, msg.message);
      break;
    case 'ping':
      post('nuiPong').catch(() => {});
      break;
    case 'myContracts':
      if (window.CivilianUI) CivilianUI.handleMyContracts(msg.data);
      break;
    case 'contractChatData':
      if (window.ChatUI) ChatUI.handleData(msg.data);
      break;
    case 'chatMessage':
      if (!msg.data || !msg.data.message) break;
      if (window.ChatUI && ChatUI.isOpen()) {
        ChatUI.handleMessage(msg.data);
      } else if (window.ChatUI) {
        ChatUI.notifyIncoming(msg.data);
      }
      break;
  }
});

function showNotification(type, title, message) {
  const container = $('notification-container');
  if (!container) return;

  const notif = document.createElement('div');
  notif.className = `custom-notification ${type || 'info'}`;
  
  // Icon mapping
  let icon = 'fas fa-info-circle';
  if (type === 'error')   icon = 'fas fa-circle-xmark';
  if (type === 'success') icon = 'fas fa-circle-check';
  if (type === 'warning') icon = 'fas fa-triangle-exclamation';

  notif.innerHTML = `
    <div class="notif-icon"><i class="${icon}"></i></div>
    <div class="notif-content">
      <div class="notif-title">${title || (type === 'error' ? 'خطأ' : 'تنبيه')}</div>
      <div class="notif-message">${message}</div>
    </div>
  `;

  container.appendChild(notif);

  // Auto remove after 5s
  setTimeout(() => {
    notif.classList.add('removing');
    setTimeout(() => notif.remove(), 600);
  }, 5000);
}

// ─── UI BACKGROUND (image / GIF) ─────────────
// Scales ANY image/GIF to fill the tablet screens (cover),
// with a dim veil so text stays readable.
function applyBackground(bg, dim) {
  const style = document.documentElement.style;
  if (bg) {
    const d = (typeof dim === 'number') ? Math.max(0, Math.min(1, dim)) : 0.45;
    style.setProperty('--ui-bg-img', `url("${bg}")`);
    style.setProperty('--ui-bg-dim', String(d));
  } else {
    style.setProperty('--ui-bg-img', 'none');
  }
}

function handleOpen(mode, data) {
  AppState.mode = mode;
  document.body.style.pointerEvents = 'auto';

  // Optional custom background (GIF/image) — fills the UI automatically
  if (data && data.uiBackground !== undefined) {
    applyBackground(data.uiBackground || '', data.uiBackgroundDim);
  }

  // Hide any currently visible tablet (mode switch support)
  $('civilian-ui')?.classList.add('hidden');
  $('hitman-ui')?.classList.add('hidden');

  if (mode === 'civilian') {
    AppState.civilianData = data;
    $('civilian-ui').classList.remove('hidden');
    CivilianUI.init(data);
  } else if (mode === 'hitman') {
    AppState.hitmanData = data;
    $('hitman-ui').classList.remove('hidden');
    HitmanUI.init(data);
  }
}

function handleClose() {
  $('civilian-ui')?.classList.add('hidden');
  $('hitman-ui')?.classList.add('hidden');
  document.body.style.pointerEvents = 'none';
  AppState.mode = null;
  AppState.selectedTarget = null;
}

// ─── CLOSE ON ESCAPE ────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close the chat modal first if it's open
    if (window.ChatUI && ChatUI.isOpen()) {
      ChatUI.close();
      return;
    }
    post('closeUI');
    handleClose();
  }
});
