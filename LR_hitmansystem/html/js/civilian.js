/* ═══════════════════════════════════════════════
   نظام الاغتيال - واجهة المدني (Arabic Civilian UI)
═══════════════════════════════════════════════ */

'use strict';

window.CivilianUI = (() => {

  // ─── DOM REFS ──────────────────────────────
  const ui         = () => $('civilian-ui');
  const targetIdIn = () => $('target-id-input');
  const priceIn    = () => $('contract-price');
  const notesIn    = () => $('contract-notes');
  const anonToggle = () => $('anon-toggle');
  const submitBtn  = () => $('civ-submit');
  const cooldownEl = () => $('cooldown-notice');

  const SUBMIT_HTML = '<i class="fas fa-paper-plane"></i><span>نشر العقد</span>';

  let state = {
    players:   [],     // only used to preview the typed ID — never listed in the UI
    config:    {},
    selected:  null,
    priority:  'normal',
    cooldownTimer: null,
    lookupTimer:   null,
    previewToken: 0,   // ignores mugshot responses for a superseded selection
  };

  // ─── INIT ───────────────────────────────────
  function init(data) {
    state.config  = data;
    state.players = data.players || [];
    resetPreview();

    applyConfig(data);

    // An ID kept from the last session gets a fresh preview (headshots are released on close)
    lookupTarget(false);

    updateCostBreakdown();
    bindEvents();
    switchCivTab('new');

    clearTimeout(state.cooldownTimer); // a timer from a previous open would tick twice as fast
    if (data.cooldown > 0) {
      showCooldown(data.cooldown);
    } else {
      cooldownEl().classList.add('hidden');
      submitBtn().disabled = false;
    }
  }

  function applyConfig(cfg) {
    $('price-limits').innerHTML =
      `الحد الأدنى: <span dir="ltr">${fmt.money(cfg.minPrice)}</span> — الحد الأقصى: <span dir="ltr">${fmt.money(cfg.maxPrice)}</span>`;
    priceIn().min  = cfg.minPrice;
    priceIn().max  = cfg.maxPrice;

    $('cost-fee-label').innerHTML = `رسوم الخدمة (<span dir="ltr">${Math.round(feeRate() * 100)}%</span>)`;

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
      cfg.priorities.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'segmented-btn priority-btn' + (p.id === 'normal' ? ' active' : '');
        btn.dataset.priority = p.id;
        const lbl = LABELS.priority[p.id] || p.label;
        btn.innerHTML = `<span class="prio-dot"></span><span>${escapeHtml(lbl)}</span>` +
          (p.multiplier > 1 ? `<span class="seg-meta" dir="ltr">+${Math.round((p.multiplier - 1) * 100)}%</span>` : '');
        prioritySection.appendChild(btn);
      });
    }

    // Keep state in sync with the highlighted button (fallback: first option)
    const active = prioritySection.querySelector('.priority-btn.active') || prioritySection.querySelector('.priority-btn');
    if (active) setPriority(active.dataset.priority);
  }

  function feeRate() {
    return typeof state.config.fee === 'number' ? state.config.fee : 0.1;
  }

  // ─── TARGET LOOKUP ──────────────────────────
  // Mirrors the server: a typed ID is tried as a vRP user ID first, then as a server ID.
  function findPlayer(id) {
    return state.players.find(x => x.userId === id)
        || state.players.find(x => x.serverId === id)
        || null;
  }

  const EMPTY_STATES = {
    idle:    { icon: 'fa-user-plus',  title: 'لم يتم تحديد هدف',             desc: 'أدخل رقم اللاعب لعرض معاينته' },
    missing: { icon: 'fa-user-slash', title: 'لا يوجد لاعب متصل بهذا الرقم', desc: 'تأكد من الرقم — يجب أن يكون الهدف متصلاً' },
    self:    { icon: 'fa-ban',        title: 'لا يمكنك وضع عقد على نفسك',    desc: 'أدخل رقم لاعب آخر' },
  };

  function setEmptyState(kind) {
    const s = EMPTY_STATES[kind] || EMPTY_STATES.idle;
    $('target-empty').classList.toggle('is-missing', kind !== 'idle');
    $('target-empty-icon').className = 'fas ' + s.icon;
    $('target-empty-title').textContent = s.title;
    $('target-empty-desc').textContent  = s.desc;
  }

  // notifyLua: release the previous headshot when the preview goes away
  function lookupTarget(notifyLua) {
    const raw = targetIdIn().value.trim();
    const id  = parseInt(raw);
    const p   = isNaN(id) ? null : findPlayer(id);

    if (p && !p.isSelf) {
      if (!state.selected || state.selected.serverId !== p.serverId) selectPlayer(p);
      return;
    }

    if (state.selected) {
      resetPreview();
      if (notifyLua) post('stopPedPreview');
    }
    setEmptyState(!raw ? 'idle' : (p ? 'self' : 'missing'));
  }

  // ─── SELECT PLAYER ──────────────────────────
  function selectPlayer(p) {
    state.selected = p;
    AppState.selectedTarget = p;
    setEmptyState('idle');

    $('selected-target').classList.remove('hidden');
    $('target-name-display').textContent = p.name || 'غير معروف';
    $('target-id-display').textContent   = p.userId || p.serverId;

    // Trigger Mugshot Preview
    const mugshotImg = $('ped-mugshot-img');
    const fallback   = $('ped-fallback-icon');

    mugshotImg.classList.add('hidden');
    fallback.classList.remove('hidden');

    const token = ++state.previewToken;
    post('startPedPreview', { serverId: p.serverId }).then(r => r.json()).then(data => {
      if (token !== state.previewToken) return; // a newer selection or a clear happened
      if (data && data.mugshot) {
        mugshotImg.src = data.mugshot;
        mugshotImg.classList.remove('hidden');
        fallback.classList.add('hidden');
      }
    }).catch(() => {});
  }

  // Visual reset of the target preview (no NUI callback).
  function resetPreview() {
    state.selected = null;
    AppState.selectedTarget = null;
    state.previewToken++;
    $('selected-target').classList.add('hidden');

    // Clear Mugshot
    const mugshotImg = $('ped-mugshot-img');
    mugshotImg.removeAttribute('src');
    mugshotImg.classList.add('hidden');
    $('ped-fallback-icon').classList.remove('hidden');
  }

  function clearTarget() {
    clearTimeout(state.lookupTimer);
    resetPreview();
    targetIdIn().value = '';
    setEmptyState('idle');
    post('stopPedPreview');
  }

  // ─── COST BREAKDOWN ─────────────────────────
  // Mirrors the server: the requester pays price (+ anonymity fee); the
  // service fee comes out of the hitman's reward, which the priority multiplies.
  function updateCostBreakdown() {
    const price    = parseFloat(priceIn().value) || 0;
    const anon     = anonToggle()?.checked && state.config.anonymityEnabled;
    const anonFee  = anon ? (state.config.anonymityFee || 0) : 0;
    const total    = price + anonFee;
    const fee      = Math.floor(total * feeRate());
    const mult     = getPriorityMultiplier();
    const reward   = Math.floor((total - fee) * mult);
    const bonus    = reward - (total - fee);

    $('cost-base').textContent = fmt.money(price);

    $('anon-cost-row').classList.toggle('hidden', !anon);
    $('cost-anon').textContent = fmt.money(anonFee);

    $('cost-total').textContent  = fmt.money(total);
    $('cost-fee').textContent    = (fee > 0 ? '−' : '') + fmt.money(fee);

    const prioRow = $('priority-cost-row');
    prioRow.classList.toggle('hidden', !(mult > 1));
    if (mult > 1) {
      $('cost-priority-label').innerHTML = `زيادة الأولوية (<span dir="ltr">+${Math.round((mult - 1) * 100)}%</span>)`;
      $('cost-priority').textContent = '+' + fmt.money(bonus);
    }

    $('cost-reward').textContent = fmt.money(reward);
  }

  function getPriorityMultiplier() {
    const priorities = state.config.priorities || [];
    const p = priorities.find(x => x.id === state.priority);
    return p ? p.multiplier : 1.0;
  }

  function setPriority(id) {
    state.priority = id;
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.toggle('active', b.dataset.priority === id));
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
      $('cooldown-text').textContent = `يمكنك نشر عقد جديد بعد ${fmt.secs(remaining)}`;
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
    btn.innerHTML = SUBMIT_HTML;

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
  function requestMyContracts() {
    $('my-contracts-list').innerHTML = loadingState('جارٍ تحميل عقودك...');
    post('requestMyContracts');
  }

  function switchCivTab(tab) {
    document.querySelectorAll('.civ-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.civ-view').forEach(v => v.classList.remove('active'));

    const btn = document.querySelector(`.civ-tab-btn[data-civtab="${tab}"]`);
    const view = $(`civ-view-${tab}`);
    if (btn) btn.classList.add('active');
    if (view) view.classList.add('active');

    if (tab === 'my') {
      requestMyContracts();
    }
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
      list.innerHTML = emptyState('fas fa-inbox', 'لا توجد عقود — انشر عقودك أولاً');
      return;
    }

    contracts.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = `contract-card mc-card priority-${priorityKey(c.priority)}`;
      card.style.animationDelay = Math.min(i * 40, 400) + 'ms';

      card.innerHTML = `
        <div class="cc-avatar"><i class="fas fa-user-secret"></i></div>
        <div class="cc-info">
          <div class="cc-title"><span class="cc-title-muted">الهدف</span><span class="cc-num">${escapeHtml(c.target_name)}</span></div>
          <div class="cc-meta">
            ${statusBadge(c.status)}
            ${priorityTag(c.priority)}
            ${c.anonymous == 1 ? '<span class="tag tag-accent"><i class="fas fa-user-secret"></i> مجهول</span>' : ''}
            <span class="tag"><i class="fas fa-clock"></i> ${timeAgo(c.created_at)}</span>
          </div>
        </div>
        <div class="cc-reward">
          <div class="cc-price">${fmt.money(c.price)}</div>
          <div class="cc-price-label">المكافأة</div>
        </div>
        <div class="cc-actions">
          <button class="btn btn-secondary btn-sm btn-chat" data-id="${Number(c.id)}">
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

    $('my-contracts-refresh').addEventListener('click', requestMyContracts);

    $('clear-target').addEventListener('click', clearTarget);
    priceIn().addEventListener('input', updateCostBreakdown);

    if (anonToggle()) {
      anonToggle().addEventListener('change', updateCostBreakdown);
    }

    submitBtn().addEventListener('click', submit);

    // Debounced so typing an ID doesn't request a headshot per keystroke
    targetIdIn().addEventListener('input', () => {
      clearTimeout(state.lookupTimer);
      state.lookupTimer = setTimeout(() => lookupTarget(true), 250);
    });

    // Delegated: priority buttons are rebuilt from config on every open
    $('priority-selector').addEventListener('click', (e) => {
      const btn = e.target.closest('.priority-btn');
      if (!btn) return;
      setPriority(btn.dataset.priority);
      updateCostBreakdown();
    });
  }

  return { init, handleContractResult, handleMyContracts, switchCivTab };

})();
