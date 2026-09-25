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
    restoreUIs: [],     // windows hidden while chat is open
  };

  // ─── HELPERS ────────────────────────────────
  const el = (id) => document.getElementById(id);
  const isOpen = () => state.open;
  const roleName = (role) => role === 'hitman' ? 'القاتل المأجور' : 'صاحب العقد';

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
  function renderSummary(c) {
    el('chat-title').textContent = `العقد #${c.id}`;

    // Role-based partner label — never a player name or ID
    const partner = state.role === 'hitman'
      ? (c.anonymous == 1 ? 'صاحب العقد (مجهول)' : 'صاحب العقد')
      : 'القاتل المأجور';
    el('chat-subtitle').innerHTML = `${escapeHtml(partner)} • <span dir="ltr">${escapeHtml(fmt.money(c.price))}</span>`;

    const item = (label, value, cls) =>
      `<div class="summary-item"><span class="si-label">${label}</span><span class="si-value${cls ? ' ' + cls : ''}">${value}</span></div>`;

    el('chat-summary').innerHTML = [
      item('الحالة',   statusBadge(c.status)),
      item('المكافأة', escapeHtml(fmt.money(c.price)), 'cc-num'),
      item('الأولوية', priorityTag(c.priority)),
      item('التاريخ',  escapeHtml(fmtDate(c.created_at))),
      c.notes ? `<div class="summary-notes"><i class="fas fa-quote-right"></i><span>${escapeHtml(c.notes)}</span></div>` : '',
    ].join('');
  }

  function appendMessage(m) {
    const box = el('chat-messages');
    if (!box) return;

    // Remove loading / empty placeholder
    box.querySelectorAll('.chat-loading, .chat-empty').forEach((n) => n.remove());

    const mine = state.role && m.sender_role === state.role;
    const row = document.createElement('div');
    row.className = `chat-msg-row ${mine ? 'mine' : 'other'}`;

    row.innerHTML = `
      <div class="chat-bubble ${mine ? 'bubble-mine' : 'bubble-other'}">
        <div class="bubble-meta"><span>${mine ? 'أنت' : roleName(m.sender_role)}</span><span>${fmtTime(m.created_at)}</span></div>
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
    // Hide the window behind the popup so no dark panel shows through
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

    // Bring back the window that was visible before opening the chat
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
      '<div class="chat-loading"><span class="spinner"></span><span>جارٍ تحميل المحادثة...</span></div>';

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
    showNotification('info', 'رسالة جديدة', `${roleName(p.message.sender_role)}: ${p.message.message}`);
  }

  // ─── BIND ───────────────────────────────────
  el('chat-close').addEventListener('click', close);
  el('chat-send').addEventListener('click', send);
  el('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  return { openFor, close, isOpen, handleData, handleMessage, notifyIncoming };

})();
