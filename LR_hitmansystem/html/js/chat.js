/* ═══════════════════════════════════════════════
   نظام الاغتيال - تفاصيل العقد + الدردشة
   Shared contract details & chat modal (civilian + hitman)
═══════════════════════════════════════════════ */

'use strict';

window.ChatUI = (() => {

  const state = {
    open:       false,
    contractId: null,
    role:       null,   // 'requester' | 'hitman'
    restoreUIs: [],     // tablets hidden while chat is open
  };

  // ─── HELPERS ────────────────────────────────
  const el = (id) => document.getElementById(id);
  const isOpen = () => state.open;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(s) {
    const map = {
      open:      { t: 'مفتوح',       c: 'var(--accent-green)' },
      active:    { t: 'قيد التنفيذ', c: 'var(--accent-orange)' },
      completed: { t: 'مكتمل',       c: '#22c55e' },
      failed:    { t: 'فاشل',        c: 'var(--accent-red)' },
      cancelled: { t: 'ملغي',        c: 'var(--text-muted)' },
      expired:   { t: 'منتهي',       c: 'var(--text-muted)' },
    };
    return map[s] || { t: s || '—', c: 'var(--text-secondary)' };
  }

  function fmtTime(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts * 1000).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts * 1000).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  // ─── RENDER ─────────────────────────────────
  function priorityLabel(p) {
    const map = { normal: 'عادي', high: 'عالي', urgent: 'عاجل' };
    return map[p] || 'عادي';
  }

  function renderSummary(c) {
    el('chat-title').textContent = `العقد #${c.id}`;

    // Role-based partner label — never a player name or ID
    const partner = state.role === 'hitman'
      ? (c.anonymous == 1 ? 'صاحب العقد (مجهول)' : 'صاحب العقد')
      : 'القاتل المأجور';
    el('chat-subtitle').textContent = `${partner} • ${fmt.money(c.price)}`;

    const st = statusLabel(c.status);
    const chips = [
      `<span class="chat-chip" style="color:${st.c};border-color:${st.c}"><i class="fas fa-circle" style="font-size:7px"></i> ${st.t}</span>`,
      `<span class="chat-chip"><i class="fas fa-dollar-sign"></i> ${fmt.money(c.price)}</span>`,
      `<span class="chat-chip"><i class="fas fa-bolt"></i> ${priorityLabel(c.priority)}</span>`,
      c.notes ? `<span class="chat-chip chat-chip-wide"><i class="fas fa-sticky-note"></i> ${escapeHtml(c.notes)}</span>` : '',
      `<span class="chat-chip"><i class="fas fa-calendar"></i> ${fmtDate(c.created_at)}</span>`,
    ];

    el('chat-summary').innerHTML = chips.filter(Boolean).join('');
  }

  function appendMessage(m) {
    const box = el('chat-messages');
    if (!box) return;

    // Remove loading placeholder
    const loader = box.querySelector('.chat-loading');
    if (loader) loader.remove();

    const mine = state.role && m.sender_role === state.role;
    const row = document.createElement('div');
    row.className = `chat-msg-row ${mine ? 'mine' : 'other'}`;

    const who = m.sender_role === 'hitman' ? 'القاتل المأجور' : 'صاحب العقد';
    row.innerHTML = `
      <div class="chat-bubble ${mine ? 'bubble-mine' : 'bubble-other'}">
        <div class="bubble-meta"><span>${mine ? 'أنت' : who}</span><span>${fmtTime(m.created_at)}</span></div>
        <div class="bubble-text">${escapeHtml(m.message)}</div>
      </div>`;

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function loadMessages(list) {
    const box = el('chat-messages');
    box.innerHTML = '';

    if (!list || list.length === 0) {
      box.innerHTML = `
        <div class="chat-empty">
          <i class="fas fa-comments"></i>
          <p>لا توجد رسائل بعد — ابدأ المحادثة الآن</p>
        </div>`;
      return;
    }
    list.forEach(appendMessage);
  }

  // ─── OPEN / CLOSE ───────────────────────────
  function open() {
    // Hide the tablet behind the popup so no dark panel shows through
    state.restoreUIs = [];
    ['civilian-ui', 'hitman-ui'].forEach((id) => {
      const e = el(id);
      if (e && !e.classList.contains('hidden')) {
        state.restoreUIs.push(e);
        e.classList.add('hidden');
      }
    });

    el('chat-modal').classList.remove('hidden');
    state.open = true;
    setTimeout(() => el('chat-input')?.focus(), 150);
  }

  function close() {
    el('chat-modal').classList.add('hidden');
    state.open = false;
    state.contractId = null;
    state.role = null;

    // Bring back the tablet that was visible before opening the chat
    (state.restoreUIs || []).forEach((e) => e.classList.remove('hidden'));
    state.restoreUIs = [];
  }

  function openFor(contractId) {
    const cid = parseInt(contractId);
    if (!cid || isNaN(cid)) return;

    state.contractId = cid;
    state.role = null;
    el('chat-title').textContent = 'تفاصيل العقد';
    el('chat-subtitle').textContent = 'جارٍ التحميل...';
    el('chat-summary').innerHTML = '';
    el('chat-messages').innerHTML =
      '<div class="chat-loading"><i class="fas fa-circle-notch fa-spin"></i></div>';

    open();
    post('openContractChat', { contractId: cid });
  }

  function send() {
    const input = el('chat-input');
    const text = (input.value || '').trim();
    if (!text || !state.contractId) return;

    post('sendChatMessage', { contractId: state.contractId, message: text });
    input.value = '';
  }

  // ─── SERVER RESPONSE HANDLERS ───────────────
  function handleData(payload) {
    if (!payload || !payload.ok) {
      showNotification('error', 'خطأ', payload?.error || 'تعذر فتح تفاصيل العقد.');
      close();
      return;
    }

    state.role = payload.role;
    renderSummary(payload.contract || {});
    loadMessages(payload.messages || []);
  }

  function handleMessage(p) {
    if (!p || !p.message) return;
    if (Number(p.contractId) !== Number(state.contractId)) return;
    appendMessage(p.message);
  }

  function notifyIncoming(p) {
    // Called when a message arrives while the chat is closed
    if (!p || !p.message) return;
    if (p.yourRole && p.yourRole === p.message.sender_role) return; // own echo
    const who = p.message.sender_role === 'hitman' ? 'القاتل المأجور' : 'صاحب العقد';
    showNotification('info', '💬 رسالة جديدة', `${who}: ${p.message.message}`);
  }

  // ─── BIND ───────────────────────────────────
  el('chat-close').addEventListener('click', close);
  el('chat-send').addEventListener('click', send);
  el('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  return { openFor, close, isOpen, handleData, handleMessage, notifyIncoming };

})();
