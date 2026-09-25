/* ═══════════════════════════════════════════════
   نظام الاغتيال - لوحة القاتل (Arabic Hitman UI)
═══════════════════════════════════════════════ */

'use strict';

window.HitmanUI = (() => {

  let state = {
    data:        {},
    currentTab:  'contracts',
    filterPrio:  'all',
    sortBy:      'price_desc',
  };

  // ─── INIT ───────────────────────────────────
  function init(data) {
    state.data = data;
    state.currentTab = 'contracts';

    bindEvents();
    loadData(data);
    switchTab('contracts');
  }

  function loadData(data) {
    state.data = data;

    renderContracts(data.contracts || []);
    renderActiveMissions(data.activeMissions || []);
    renderCompleted(data.completedMissions || []);
    renderStats(data.stats || {});

    updateBadge('contracts-badge', (data.contracts || []).length);
    updateBadge('active-badge',    (data.activeMissions || []).length);
  }

  // ─── TAB SWITCHING ──────────────────────────
  function switchTab(tabId) {
    state.currentTab = tabId;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const pane   = $(`tab-${tabId}`);

    if (navBtn) navBtn.classList.add('active');
    if (pane)   pane.classList.add('active');
  }

  function updateBadge(id, count) {
    const el = $(id);
    if (el) el.textContent = count;
  }

  // ─── RENDER CONTRACTS ───────────────────────
  function renderContracts(contracts) {
    const list = $('contracts-list');
    list.innerHTML = '';

    let filtered = [...contracts];

    if (state.filterPrio !== 'all') {
      filtered = filtered.filter(c => c.priority === state.filterPrio);
    }

    filtered.sort((a, b) => {
      if (state.sortBy === 'price_desc') return b.price - a.price;
      if (state.sortBy === 'price_asc')  return a.price - b.price;
      if (state.sortBy === 'newest')     return b.created_at - a.created_at;
      return 0;
    });

    if (filtered.length === 0) {
      list.innerHTML = emptyState('fas fa-inbox', 'لا توجد عقود متاحة حالياً');
      return;
    }

    filtered.forEach((c, i) => {
      const card = buildContractCard(c, 'available', i);
      list.appendChild(card);
    });
  }

  // ─── RENDER ACTIVE MISSIONS ─────────────────
  function renderActiveMissions(missions) {
    const list = $('active-list');
    list.innerHTML = '';

    if (missions.length === 0) {
      list.innerHTML = emptyState('fas fa-crosshairs', 'لا توجد مهمات نشطة');
      return;
    }

    missions.forEach((m, i) => {
      const card = buildContractCard(m, 'active', i);
      list.appendChild(card);
    });
  }

  // ─── RENDER COMPLETED ───────────────────────
  function renderCompleted(completed) {
    const list = $('completed-list');
    list.innerHTML = '';

    if (completed.length === 0) {
      list.innerHTML = emptyState('fas fa-trophy', 'لم تقم بإنجاز أي مهمة بعد');
      return;
    }

    completed.forEach((c, i) => {
      const card = buildContractCard(c, 'completed', i);
      list.appendChild(card);
    });
  }

  // ─── BUILD CONTRACT CARD ─────────────────────
  function buildContractCard(c, type, index) {
    const card = document.createElement('div');
    card.className = `contract-card priority-${c.priority || 'normal'}`;
    if (type === 'active')    card.classList.add('active-mission');
    if (type === 'completed') card.classList.add('completed');
    card.style.animationDelay = (index * 40) + 'ms';

    const priorityLabel = getPriorityLabel(c.priority);
    const isAnon = c.anonymous == 1;

    let actionsHTML = '';
    if (type === 'available') {
      const remaining = Math.max(0, (c.expires_at || 0) - Math.floor(Date.now() / 1000));
      const hours = Math.floor(remaining / 3600);
      const mins  = Math.floor((remaining % 3600) / 60);
      const timeStr = hours > 0 ? `${hours}س و ${mins}د` : `${mins}د`;

      actionsHTML = `
        <div class="cc-actions">
          <div class="cc-time-left"><i class="fas fa-clock"></i> ينتهي خلال: ${timeStr}</div>
          <button class="btn-accept" data-id="${c.id}">
            <i class="fas fa-check"></i> قبول
          </button>
          <button class="btn-reject" data-id="${c.id}">
            <i class="fas fa-times"></i> رفض
          </button>
        </div>`;
    } else if (type === 'active') {
      const elapsed = c.accepted_at ? Math.floor((Date.now()/1000) - c.accepted_at) : 0;
      actionsHTML = `
        <div class="cc-actions">
          <div style="font-size:11px;color:#ef4444;text-align:center;margin-bottom:6px;font-family:var(--font-display);direction:ltr">
            ${fmt.secs(elapsed)} <i class="fas fa-clock"></i>
          </div>
          <button class="btn-chat" data-id="${c.id}">
            <i class="fas fa-comments"></i> محادثة العقد
          </button>
          <button class="btn-abandon" data-id="${c.id}">
            <i class="fas fa-flag"></i> إلغاء المهمة
          </button>
        </div>`;
    } else {
      actionsHTML = `
        <div class="cc-actions">
          <div style="text-align:center">
            <div style="color:var(--accent-green);font-size:18px"><i class="fas fa-check-circle"></i></div>
            <div class="cc-completed-info" style="direction:ltr">${fmt.time(c.completed_at)}</div>
          </div>
          <button class="btn-chat" data-id="${c.id}">
            <i class="fas fa-comments"></i> المحادثة
          </button>
        </div>`;
    }

    card.innerHTML = `
      <div class="cc-avatar">
        <i class="fas fa-user-secret"></i>
      </div>
      <div class="cc-info">
        <div class="cc-target-name">الهدف #${c.target_id}</div>
        <div class="cc-meta">
          <span class="cc-tag priority-${c.priority || 'normal'}">${priorityLabel}</span>
          ${isAnon ? '<span class="cc-tag" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)">مجهول الهوية</span>' : ''}
        </div>
        ${c.notes ? `<div class="cc-notes"><i class="fas fa-quote-right" style="font-size:9px;margin-left:4px"></i>${escapeHtml(c.notes)}</div>` : ''}
        ${type === 'active' ? '<div style="font-size:11px;color:var(--accent-red);margin-top:6px;font-family:var(--font-arabic);font-weight:700;"><i class="fas fa-bolt pulse-glow" style="border-radius:50%"></i> جاري تعقب الهدف...</div>' : ''}
      </div>
      <div class="cc-reward">
        <div class="cc-price">${fmt.money(c.price)}</div>
        <div class="cc-price-label">المكافأة</div>
      </div>
      ${actionsHTML}`;

    const acceptBtn  = card.querySelector('.btn-accept');
    const rejectBtn  = card.querySelector('.btn-reject');
    const abandonBtn = card.querySelector('.btn-abandon');

    const chatBtn = card.querySelector('.btn-chat');
    if (chatBtn) {
      chatBtn.addEventListener('click', () => {
        if (window.ChatUI) ChatUI.openFor(c.id);
      });
    }

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => acceptContract(c.id, acceptBtn));
    }
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => rejectContract(c.id, card));
    }
    if (abandonBtn) {
      abandonBtn.addEventListener('click', () => abandonMission(c.id, abandonBtn));
    }

    return card;
  }

  // ─── CONTRACT ACTIONS ───────────────────────
  function acceptContract(contractId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    post('acceptContract', { contractId });
  }

  function rejectContract(contractId, card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px) scale(0.95)';
    card.style.transition = 'all 0.3s ease';
    setTimeout(() => card.remove(), 300);

    post('rejectContract', { contractId });

    const remaining = parseInt($('contracts-badge').textContent || '0');
    updateBadge('contracts-badge', Math.max(0, remaining - 1));
  }

  function abandonMission(contractId, btn) {
    // We cannot use standard prompt in JS natively in NUI cleanly without blocking,
    // so we just send the command. If user abandons, they abandon.
    // Real implementation could use a custom Modal.
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    post('abandonMission', { contractId });
  }

  function handleAcceptResult(success, message, data) {
    if (success) {
      showNotification('success', '✅ تم الإنجاز', 'تم قبول المهمة بنجاح! يتم تعقب الهدف الآن.');
      setTimeout(() => post('refreshHitmanData'), 300);
      switchTab('active');
    } else {
      showNotification('error', 'خطأ', message || 'فشل قبول العقد.');
    }
  }

  // ─── RENDER STATS ───────────────────────────
  function renderStats(stats) {
    $('stat-kills').textContent    = stats.kills || 0;
    $('stat-earnings').textContent = fmt.money(stats.earnings || 0);
    $('stat-missions').textContent = stats.missions_taken || 0;

    const taken  = stats.missions_taken || 0;
    const failed = stats.missions_failed || 0;
    const rate   = taken > 0 ? Math.round(((taken - failed) / taken) * 100) : 0;
    $('stat-rate').textContent     = rate + '%';

    if (stats.rank) {
      const rName = stats.rank;
      
      $('rank-name-display').textContent = rName;
      $('rank-name-display').style.color = stats.rankColor || 'var(--accent-gold)';
      $('rpc-rank').textContent = rName;
      $('rpc-rank').style.color = stats.rankColor || 'var(--accent-gold)';
    }

    if (stats.rankBonus !== undefined) {
      $('rank-bonus').innerHTML =
        `المكافأة الإضافية الحالية: <strong dir="ltr">+${Math.round(stats.rankBonus * 100)}%</strong>`;
    }

    renderRankProgress(stats.kills || 0, state.data.ranks || []);
    renderRankLadder(stats.kills || 0, state.data.ranks || []);
  }

  function renderRankProgress(kills, ranks) {
    let currentRank = ranks[0];
    let nextRank    = null;

    for (let i = 0; i < ranks.length; i++) {
      if (kills >= ranks[i].minKills) {
        currentRank = ranks[i];
        nextRank    = ranks[i + 1] || null;
      }
    }

    const fill = $('rank-bar-fill');
    if (!fill) return;

    if (nextRank) {
      const progress = ((kills - currentRank.minKills) /
                        (nextRank.minKills - currentRank.minKills)) * 100;
      fill.style.width = Math.min(100, progress) + '%';
      $('rpb-current-kills').textContent = kills + ' قتلى';
      $('rpb-next').textContent = `التالي: ${nextRank.minKills} قتلى`;
    } else {
      fill.style.width = '100%';
      $('rpb-current-kills').textContent = kills + ' قتلى';
      $('rpb-next').textContent = 'أعلى رتبة';
    }
  }

  function renderRankLadder(kills, ranks) {
    const ladder = $('rank-ladder');
    if (!ladder) return;

    ladder.innerHTML = `<div class="rank-ladder-title">سلم الرتب</div>`;

    ranks.forEach(r => {
      const isCurrent = kills >= r.minKills &&
        (ranks[ranks.indexOf(r) + 1] == null || kills < ranks[ranks.indexOf(r) + 1].minKills);

      const row = document.createElement('div');
      row.className = 'rank-row' + (isCurrent ? ' current-rank' : '');

      row.innerHTML = `
        <div class="rank-dot" style="background:${r.color}"></div>
        <div class="rank-row-name" style="color:${isCurrent ? r.color : 'var(--text-secondary)'}">${r.name}</div>
        <div class="rank-row-kills"><span dir="ltr">+${r.minKills}</span> قتلى</div>
        <div class="rank-row-bonus" dir="ltr">+${Math.round(r.bonus * 100)}%</div>`;

      ladder.appendChild(row);
    });
  }

  // ─── HELPERS ────────────────────────────────
  function emptyState(icon, msg) {
    return `<div class="empty-state"><i class="${icon}"></i><p>${msg}</p></div>`;
  }

  function getPriorityLabel(p) {
    const map = { normal: 'عادي', high: 'عالي', urgent: 'عاجل' };
    return map[p] || 'عادي';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─── BIND EVENTS ────────────────────────────
  function bindEvents() {
    if (window._hitmanEventsBound) return;
    window._hitmanEventsBound = true;

    $('hitman-close').addEventListener('click', () => {
      post('closeUI');
      handleClose();
    });

    $('hitman-refresh').addEventListener('click', () => {
      const icon = document.querySelector('#hitman-refresh i');
      icon.style.animation = 'spin 0.6s linear';
      setTimeout(() => icon.style.animation = '', 600);
      post('refreshHitmanData');
    });

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('filter-priority').addEventListener('change', (e) => {
      state.filterPrio = e.target.value;
      renderContracts(state.data.contracts || []);
    });

    $('sort-by').addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderContracts(state.data.contracts || []);
    });
  }

  return { init, loadData, handleAcceptResult };

})();
