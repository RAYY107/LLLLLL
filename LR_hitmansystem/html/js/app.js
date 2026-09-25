/* ═══════════════════════════════════════════════
   نظام الاغتيال - المتحكم الرئيسي
   Arabic RTL App Controller (EVORA)
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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared labels (priority / contract status)
const LABELS = {
  priority: { normal: 'عادي', high: 'عالي', urgent: 'عاجل' },
  status: {
    open:      'مفتوح',
    active:    'قيد التنفيذ',
    completed: 'مكتمل',
    failed:    'فاشل',
    cancelled: 'ملغي',
    expired:   'منتهي',
  },
};

const priorityKey   = (p) => (LABELS.priority[p] ? p : 'normal');
const priorityLabel = (p) => LABELS.priority[priorityKey(p)];

function priorityTag(p) {
  const key = priorityKey(p);
  const variant = key === 'urgent' ? ' tag-danger' : key === 'high' ? ' tag-warning' : '';
  return `<span class="tag${variant}"><i class="fas fa-bolt"></i> ${LABELS.priority[key]}</span>`;
}

function statusBadge(s) {
  const known = LABELS.status[s] !== undefined;
  const label = known ? LABELS.status[s] : (s || '—');
  return `<span class="status-badge${known ? ' status-' + s : ''}">${escapeHtml(label)}</span>`;
}

function emptyState(icon, msg, sub) {
  return `<div class="empty-state"><i class="${icon}"></i><p>${escapeHtml(msg)}</p>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}</div>`;
}

function loadingState(msg) {
  return `<div class="loading-state"><span class="spinner"></span><span>${escapeHtml(msg || 'جارٍ التحميل...')}</span></div>`;
}

function post(event, data) {
  let resourceName = 'LR_hitmansystem';
  if (typeof window.GetParentResourceName === 'function') {
    try {
      const res = window.GetParentResourceName();
      if (res && res !== '') resourceName = res;
    } catch(e) {}
  }
  const req = fetch(`https://${resourceName}/${event}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  });
  req.catch(() => {}); // fire-and-forget callers: never surface an unhandled rejection
  return req;
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
      post('nuiPong');
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

// ─── NOTIFICATIONS ───────────────────────────
const NOTIFY_ICONS = {
  info:    'fas fa-circle-info',
  success: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  error:   'fas fa-circle-exclamation',
};

// The toast already carries a typed icon, so leading emoji from server strings are dropped.
const stripLeadingEmoji = (s) => String(s ?? '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');

function showNotification(type, title, message) {
  const container = $('notification-container');
  if (!container) return;

  const kind  = NOTIFY_ICONS[type] ? type : 'info';
  const head  = stripLeadingEmoji(title) || (kind === 'error' ? 'خطأ' : 'تنبيه');
  const body  = stripLeadingEmoji(message);

  const notif = document.createElement('div');
  notif.className = `custom-notification ${kind}`;
  // Text is escaped: messages can carry player-written chat content
  notif.innerHTML = `
    <div class="notif-icon"><i class="${NOTIFY_ICONS[kind]}"></i></div>
    <div class="notif-content">
      <div class="notif-title">${escapeHtml(head)}</div>
      <div class="notif-message">${escapeHtml(body)}</div>
    </div>
    <span class="notif-timer"></span>
  `;

  container.appendChild(notif);

  // Auto remove after 5s
  setTimeout(() => {
    notif.classList.add('removing');
    setTimeout(() => notif.remove(), 600);
  }, 5000);
}

// ─── UI BACKGROUND (image / GIF) ─────────────
// Scales ANY image/GIF to fill the windows (cover),
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

// ─── THEME (Config.UITheme) ─────────────────
// Config key → CSS variable. Variables with an "-rgb" twin also drive the alpha
// tints (hover fills, borders, focus ring…), so one key recolors every shade.
const THEME_KEYS = {
  primary:       '--evora-primary',
  primaryHover:  '--evora-primary-hover',
  primaryDark:   '--evora-primary-dark',
  accent:        '--evora-lavender',
  background:    '--evora-bg',
  surface:       '--evora-surface',
  surface2:      '--evora-surface-2',
  surface3:      '--evora-surface-3',
  input:         '--evora-input-bg',
  border:        '--evora-border',
  borderStrong:  '--evora-border-strong',
  text:          '--evora-text',
  textSecondary: '--evora-text-secondary',
  textMuted:     '--evora-text-muted',
  textOnAccent:  '--evora-text-on-accent',
  success:       '--evora-success',
  warning:       '--evora-warning',
  danger:        '--evora-danger',
};
const THEME_RGB = ['--evora-primary', '--evora-primary-dark', '--evora-lavender', '--evora-bg',
                   '--evora-surface', '--evora-success', '--evora-warning', '--evora-danger'];

// "auto" shades are generated from primary; these HSL offsets reproduce the default palette.
const THEME_AUTO = {
  primaryHover: { s: 12,  l: 7 },
  primaryDark:  { s: -12, l: -26 },
  accent:       { s: 21,  l: 14 },
};

function parseHex(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shiftHsl(rgb, delta) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0, l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    s = Math.min(1, Math.max(0, s + delta.s / 100)); // greys stay grey
  }
  l = Math.min(1, Math.max(0, l + delta.l / 100));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                     : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map((v) => Math.round((v + m) * 255));
}

function applyTheme(theme) {
  if (!theme || typeof theme !== 'object') return;
  const style = document.documentElement.style;
  const primary = parseHex(theme.primary);

  Object.entries(THEME_KEYS).forEach(([key, cssVar]) => {
    let rgb = parseHex(theme[key]);
    if (!rgb && THEME_AUTO[key] && primary) rgb = shiftHsl(primary, THEME_AUTO[key]); // "auto"
    if (!rgb) return; // missing or invalid: keep the stylesheet default
    style.setProperty(cssVar, `rgb(${rgb.join(', ')})`);
    if (THEME_RGB.includes(cssVar)) style.setProperty(cssVar + '-rgb', rgb.join(', '));
  });
}

// Ask Lua for the theme as soon as the page loads, so notifications are themed
// before any window opens. Every 'open' payload re-applies it as well.
(function requestTheme(attempt) {
  post('nuiReady')
    .then((r) => r.json())
    .then((res) => applyTheme(res && res.theme))
    .catch(() => { if (attempt < 4) setTimeout(() => requestTheme(attempt + 1), 1000 * (attempt + 1)); });
})(0);

function handleOpen(mode, data) {
  AppState.mode = mode;
  document.body.style.pointerEvents = 'auto';

  if (data && data.theme) applyTheme(data.theme);

  // Optional custom background (GIF/image) — fills the UI automatically
  if (data && data.uiBackground !== undefined) {
    applyBackground(data.uiBackground || '', data.uiBackgroundDim);
  }

  // Hide any currently visible window (mode switch support)
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
  EvoraSelect.closeOpen();
  $('civilian-ui')?.classList.add('hidden');
  $('hitman-ui')?.classList.add('hidden');
  document.body.style.pointerEvents = 'none';
  AppState.mode = null;
  AppState.selectedTarget = null;
}

// ─── CUSTOM SELECT ──────────────────────────
// Progressive enhancement of native <select>: the native element stays in
// the DOM as the source of truth and still fires 'change', so existing
// listeners keep working unchanged.
const EvoraSelect = (() => {
  let current = null;

  function closeOpen() {
    if (!current) return false;
    current.classList.remove('open');
    current = null;
    return true;
  }

  function enhance(select) {
    if (!select || select.dataset.enhanced) return;
    select.dataset.enhanced = 'true';

    const wrap = document.createElement('div');
    wrap.className = 'select';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('select-native');
    select.tabIndex = -1;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (select.getAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    trigger.innerHTML = '<span class="select-value"></span><i class="fas fa-chevron-down select-chevron"></i>';

    const menu = document.createElement('div');
    menu.className = 'select-menu';
    menu.setAttribute('role', 'listbox');

    Array.from(select.options).forEach((opt) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'select-option';
      item.dataset.value = opt.value;
      item.setAttribute('role', 'option');
      item.innerHTML = `<span>${escapeHtml(opt.text)}</span><i class="fas fa-check"></i>`;
      item.addEventListener('click', () => {
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closeOpen();
      });
      menu.appendChild(item);
    });

    const sync = () => {
      const opt = select.options[select.selectedIndex];
      trigger.querySelector('.select-value').textContent = opt ? opt.text : '';
      menu.querySelectorAll('.select-option').forEach((o) => {
        const on = o.dataset.value === select.value;
        o.classList.toggle('selected', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('open');
      closeOpen();
      if (!wasOpen) {
        wrap.classList.add('open');
        current = wrap;
      }
    });

    select.addEventListener('change', sync);
    wrap.append(trigger, menu);
    sync();
  }

  document.addEventListener('click', (e) => {
    if (current && !current.contains(e.target)) closeOpen();
  });

  return { enhance, closeOpen };
})();

document.querySelectorAll('select.filter-select').forEach(EvoraSelect.enhance);

// ─── CLOSE ON ESCAPE ────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // An open dropdown closes first
    if (EvoraSelect.closeOpen()) return;
    // Close the chat modal first if it's open
    if (window.ChatUI && ChatUI.isOpen()) {
      ChatUI.close();
      return;
    }
    post('closeUI');
    handleClose();
  }
});
