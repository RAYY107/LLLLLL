/* ═══════════════════════════════════════════════
   نظام الاغتيال - واجهة المدني (Arabic Civilian UI)
═══════════════════════════════════════════════ */

'use strict';

window.CivilianUI = (() => {

  // ─── DOM REFS ──────────────────────────────
  const ui         = () => $('civilian-ui');
  const playerGrid = () => $('player-grid');
  const searchIn   = () => $('player-search');
  const targetIdIn = () => $('target-id-input');
  const priceIn    = () => $('contract-price');
  const notesIn    = () => $('contract-notes');
  const anonToggle = () => $('anon-toggle');
  const submitBtn  = () => $('civ-submit');
  const feedback   = () => $('civ-feedback');
  const cooldownEl = () => $('cooldown-notice');

  let state = {
    players:   [],
    config:    {},
    selected:  null,
    priority:  'normal',
    cooldownTimer: null,
  };

  // ─── INIT ───────────────────────────────────
  function init(data) {
    state.config  = data;
    state.players = data.players || [];
    state.selected = null;
    AppState.selectedTarget = null;

    applyConfig(data);
    renderPlayers(state.players);
    updateCostBreakdown();
    bindEvents();
    switchCivTab('new');

    if (data.cooldown > 0) {
      showCooldown(data.cooldown);
    } else {
      cooldownEl().classList.add('hidden');
      submitBtn().disabled = false;
    }
  }

  function applyConfig(cfg) {
    $('price-limits').textContent =
      `الحد الأدنى: ${fmt.money(cfg.minPrice)} — الحد الأقصى: ${fmt.money(cfg.maxPrice)}`;
    priceIn().min  = cfg.minPrice;
    priceIn().max  = cfg.maxPrice;

    const anonGroup = $('anon-group');
    if (!cfg.anonymityEnabled) {
      anonGroup.style.display = 'none';
    } else {
      $('anon-fee-label').textContent = '+' + fmt.money(cfg.anonymityFee);
    }

    // Priority buttons
    const prioritySection = $('priority-selector');
    if (cfg.priorities && cfg.priorities.length) {
      prioritySection.innerHTML = '';
      const arabicLabels = { 'normal': 'عادي', 'high': 'عالي', 'urgent': 'عاجل' };
      
      cfg.priorities.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'priority-btn' + (p.id === 'normal' ? ' active' : '');
        btn.dataset.priority = p.id;
        const lbl = arabicLabels[p.id] || p.label;
        btn.textContent = p.multiplier > 1
          ? `${lbl} +${Math.round((p.multiplier - 1) * 100)}%`
          : lbl;
        prioritySection.appendChild(btn);
      });
      bindPriorityButtons();
    }
  }

  // ─── RENDER PLAYER GRID ─────────────────────
  function renderPlayers(players) {
    const grid = playerGrid();
    grid.innerHTML = '';

    if (!players || players.length === 0) {
      grid.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-user-slash" style="font-size:32px;opacity:0.3"></i>
          <span>لا يوجد لاعبين متصلين</span>
        </div>`;
      return;
    }

    players.forEach((p, i) => {
      const displayId = p.userId || p.serverId;
      const card = document.createElement('div');
      card.className = 'player-card' + (p.isSelf ? ' is-self' : '');
      card.style.animationDelay = (i * 30) + 'ms';
      card.dataset.id   = displayId;
      card.dataset.name = p.name || 'غير معروف';

      card.innerHTML = `
        <div class="pc-avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="pc-name">${escapeHtml(p.name || 'غير معروف')}</div>
        <div class="pc-id">ID: ${displayId}</div>`;

      card.dataset.sid = p.serverId; // stable server-id for highlight matching

      card.addEventListener('click', () => selectPlayer(p));
      grid.appendChild(card);
    });
  }

  function filterPlayers(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      renderPlayers(state.players);
      return;
    }
    const filtered = state.players.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      String(p.userId || p.serverId).includes(q)
    );
    renderPlayers(filtered);
  }

  // ─── SELECT PLAYER ──────────────────────────
  function selectPlayer(p) {
    state.selected = p;
    AppState.selectedTarget = p;

    const displayId = p.userId || p.serverId;
    targetIdIn().value = displayId;

    const preview = $('selected-target');
    preview.classList.remove('hidden');
    $('target-name-display').textContent = escapeHtml(p.name || 'غير معروف');
    $('target-id-display').textContent   = displayId;

    // Trigger Mugshot Preview
    const mugshotImg = $('ped-mugshot-img');
    const fallback   = $('ped-fallback-icon');
    
    mugshotImg.classList.add('hidden');
    fallback.classList.remove('hidden');

    post('startPedPreview', { serverId: p.serverId }).then(r => r.json()).then(data => {
      if (data && data.mugshot) {
        mugshotImg.src = data.mugshot;
        mugshotImg.classList.remove('hidden');
        fallback.classList.add('hidden');
      }
    });

    document.querySelectorAll('.player-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.player-card').forEach(c => {
      if (parseInt(c.dataset.sid) === parseInt(p.serverId)) {
        c.classList.add('selected');
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    updateCostBreakdown();
  }

  function clearTarget() {
    state.selected = null;
    AppState.selectedTarget = null;
    targetIdIn().value = '';
    $('selected-target').classList.add('hidden');
    
    // Clear Mugshot
    const mugshotImg = $('ped-mugshot-img');
    mugshotImg.src = '';
    mugshotImg.classList.add('hidden');
    $('ped-fallback-icon').classList.remove('hidden');

    post('stopPedPreview');

    document.querySelectorAll('.player-card').forEach(c => c.classList.remove('selected'));
    updateCostBreakdown();
  }

  // ─── COST BREAKDOWN ─────────────────────────
  function updateCostBreakdown() {
    const price     = parseFloat(priceIn().value) || 0;
    const anon      = anonToggle()?.checked && state.config.anonymityEnabled;
    const anonFee   = anon ? (state.config.anonymityFee || 0) : 0;
    const base      = price;
    const subtotal  = base + anonFee;
    const fee       = Math.floor(subtotal * (state.config.fee || 0.1));
    const total     = subtotal;
    const reward    = Math.floor((subtotal - fee) * getPriorityMultiplier());

    $('cost-base').textContent   = fmt.money(base);
    // Hide/show anon cost row safely
    const anonRow = $('anon-cost-row');
    if (anonRow) {
      if (anon) {
        anonRow.classList.remove('hidden');
        $('cost-anon').textContent = fmt.money(anonFee);
      } else {
        anonRow.classList.add('hidden');
        $('cost-anon').textContent = '$0';
      }
    }

    $('cost-fee').textContent    = fmt.money(fee);
    $('cost-total').textContent  = fmt.money(total);
    $('cost-reward').textContent = fmt.money(reward);
  }

  function getPriorityMultiplier() {
    const priorities = state.config.priorities || [];
    const p = priorities.find(x => x.id === state.priority);
    return p ? p.multiplier : 1.0;
  }

  // ─── COOLDOWN DISPLAY ───────────────────────
  function showCooldown(seconds) {
    const el = cooldownEl();
    el.classList.remove('hidden');
    submitBtn().disabled = true;

    let remaining = seconds;
    const tick = () => {
      if (remaining <= 0) {
        el.classList.add('hidden');
        submitBtn().disabled = false;
        return;
      }
      $('cooldown-text').textContent = `الانتظار: ${fmt.secs(remaining)}`;
      remaining--;
      state.cooldownTimer = setTimeout(tick, 1000);
    };
    tick();
  }

  // ─── FEEDBACK ───────────────────────────────
  function showFeedback(msg, type) {
    showNotification(type, type === 'error' ? 'خطأ' : 'تنبيه', msg);
  }

  // ─── SUBMIT ─────────────────────────────────
  function submit() {
    if (state.isSubmitting || submitBtn().disabled) return;

    const targetId = parseInt(targetIdIn().value);
    const price    = parseInt(priceIn().value);
    const notes    = notesIn().value.trim();
    const anon     = anonToggle()?.checked && state.config.anonymityEnabled;

    if (!targetId || isNaN(targetId)) {
      showFeedback('يرجى تحديد أو إدخال رقم اللاعب المستهدف.', 'error');
      return;
    }
    if (!price || isNaN(price)) {
      showFeedback('يرجى إدخال سعر العقد.', 'error');
      return;
    }
    if (price < (state.config.minPrice || 0)) {
      showFeedback(`الحد الأدنى هو ${fmt.money(state.config.minPrice)}`, 'error');
      return;
    }
    if (price > (state.config.maxPrice || Infinity)) {
      showFeedback(`الحد الأقصى هو ${fmt.money(state.config.maxPrice)}`, 'error');
      return;
    }

    state.isSubmitting = true;
    submitBtn().disabled = true;
    submitBtn().innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>جاري المعالجة...</span>';

    post('submitContract', {
      targetId:  targetId,
      price:     price,
      notes:     notes,
      anonymous: anon,
      priority:  state.priority
    });
  }

  function handleContractResult(success, message) {
    state.isSubmitting = false;
    const btn = submitBtn();
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>نشر العقد</span>';

    showFeedback(message, success ? 'success' : 'error');

    if (success) {
      targetIdIn().value = '';
      priceIn().value = '';
      notesIn().value = '';
      if (anonToggle()) anonToggle().checked = false;
      clearTarget();
    }
  }

  // ─── MY CONTRACTS TAB ───────────────────────
  function switchCivTab(tab) {
    document.querySelectorAll('.civ-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.civ-view').forEach(v => v.classList.remove('active'));

    const btn = document.querySelector(`.civ-tab-btn[data-civtab="${tab}"]`);
    const view = $(`civ-view-${tab}`);
    if (btn) btn.classList.add('active');
    if (view) view.classList.add('active');

    if (tab === 'my') {
      post('requestMyContracts');
    }
  }

  function myStatusBadge(s) {
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

  function timeAgo(ts) {
    if (!ts) return '—';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60)     return 'الآن';
    if (diff < 3600)   return `قبل ${Math.floor(diff / 60)} د`;
    if (diff < 86400)  return `قبل ${Math.floor(diff / 3600)} س`;
    return `قبل ${Math.floor(diff / 86400)} يوم`;
  }

  function renderMyContracts(contracts) {
    const list = $('my-contracts-list');
    if (!list) return;
    list.innerHTML = '';

    if (!contracts || contracts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>لا توجد عقود — انشر عقودك أولاً</p>
        </div>`;
      return;
    }

    contracts.forEach((c, i) => {
      const st = myStatusBadge(c.status);
      const card = document.createElement('div');
      card.className = `contract-card mc-card priority-${c.priority || 'normal'}`;
      card.style.animationDelay = (i * 40) + 'ms';

      card.innerHTML = `
        <div class="cc-avatar"><i class="fas fa-user-secret"></i></div>
        <div class="cc-info">
          <div class="cc-target-name">الهدف: ${escapeHtml(c.target_name)}</div>
          <div class="cc-meta">
            <span class="cc-tag" style="color:${st.c};border-color:${st.c}">${st.t}</span>
            ${c.anonymous == 1 ? '<span class="cc-tag" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)">مجهول</span>' : ''}
            <span class="cc-tag">${timeAgo(c.created_at)}</span>
          </div>
        </div>
        <div class="cc-reward">
          <div class="cc-price">${fmt.money(c.price)}</div>
          <div class="cc-price-label">المكافأة</div>
        </div>
        <div class="cc-actions">
          <button class="btn-chat" data-id="${c.id}">
            <i class="fas fa-comments"></i> التفاصيل والمحادثة
          </button>
        </div>`;

      card.querySelector('.btn-chat').addEventListener('click', () => {
        if (window.ChatUI) ChatUI.openFor(c.id);
      });

      list.appendChild(card);
    });
  }

  function handleMyContracts(data) {
    renderMyContracts((data && data.contracts) || []);
  }

  // ─── BIND EVENTS ────────────────────────────
  function bindEvents() {
    // Only bind once to avoid duplicate listeners
    if (ui().dataset.bound) return;
    ui().dataset.bound = "true";

    $('civ-close').addEventListener('click', () => {
      post('closeUI');
      handleClose();
      if (state.cooldownTimer) clearTimeout(state.cooldownTimer);
    });

    document.querySelectorAll('.civ-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchCivTab(btn.dataset.civtab));
    });

    const myRefresh = $('my-contracts-refresh');
    if (myRefresh) {
      myRefresh.addEventListener('click', () => post('requestMyContracts'));
    }

    $('clear-target').addEventListener('click', clearTarget);
    searchIn().addEventListener('input', (e) => filterPlayers(e.target.value));
    priceIn().addEventListener('input', updateCostBreakdown);

    if (anonToggle()) {
      anonToggle().addEventListener('change', updateCostBreakdown);
    }

    submitBtn().addEventListener('click', submit);

    targetIdIn().addEventListener('input', (e) => {
      const id = parseInt(e.target.value);
      if (!isNaN(id)) {
        const p = state.players.find(x => x.serverId === id || x.userId === id);
        if (p) selectPlayer(p);
      }
      updateCostBreakdown();
    });

    bindPriorityButtons();
  }

  function bindPriorityButtons() {
    document.querySelectorAll('.priority-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.priority = btn.dataset.priority;
        updateCostBreakdown();
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, handleContractResult, handleMyContracts, switchCivTab };

})();
