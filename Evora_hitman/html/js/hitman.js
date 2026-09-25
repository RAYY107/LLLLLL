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
    EvoraSelect.closeOpen();

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const navBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const pane   = $(`tab-${tabId}`);

    if (navBtn) navBtn.classList.add('active');
    if (pane)   pane.classList.add('active');
  }

  function updateBadge(id, count) {
    const el = $(id);
    if (!el) return;
    el.textContent = count;
    el.classList.toggle('is-empty', !count);
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
      list.innerHTML = contracts.length > 0
        ? emptyState('fas fa-filter', 'لا توجد عقود بهذه الأولوية', 'غيّر عامل التصفية لعرض عقود أخرى')
        : emptyState('fas fa-inbox', 'لا توجد عقود متاحة حالياً', 'ستظهر العقود الجديدة هنا فور نشرها');
      return;
    }

    filtered.forEach((c, i) => {
      list.appendChild(buildContractCard(c, 'available', i));
    });
  }

  // ─── RENDER ACTIVE MISSIONS ─────────────────
  function renderActiveMissions(missions) {
    const list = $('active-list');
    list.innerHTML = '';

    if (missions.length === 0) {
      list.innerHTML = emptyState('fas fa-crosshairs', 'لا توجد مهمات نشطة', 'اقبل عقداً من قائمة العقود المتاحة للبدء');
      return;
    }

    missions.forEach((m, i) => {
      list.appendChild(buildContractCard(m, 'active', i));
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
      list.appendChild(buildContractCard(c, 'completed', i));
    });
  }

  // ─── BUILD CONTRACT CARD ─────────────────────
  function buildContractCard(c, type, index) {
    const card = document.createElement('div');
    card.className = `contract-card priority-${priorityKey(c.priority)}`;
    if (type === 'active')    card.classList.add('active-mission');
    if (type === 'completed') card.classList.add('completed');
    card.style.animationDelay = Math.min(index * 40, 400) + 'ms';

    const isAnon = c.anonymous == 1;
    const tags = [
      priorityTag(c.priority),
      isAnon ? '<span class="tag tag-accent"><i class="fas fa-user-secret"></i> مجهول الهوية</span>' : '',
    ];

    let avatarIcon = 'fa-user-secret';
    let extraHTML  = '';
    let actionsHTML = '';

    if (type === 'available') {
      const remaining = Math.max(0, (c.expires_at || 0) - Math.floor(Date.now() / 1000));
      const hours = Math.floor(remaining / 3600);
      const mins  = Math.floor((remaining % 3600) / 60);
      const timeStr = hours > 0 ? `${hours}س و ${mins}د` : `${mins}د`;
      tags.push(`<span class="tag${remaining < 3600 ? ' tag-warning' : ''}"><i class="fas fa-hourglass-half"></i> ينتهي خلال ${timeStr}</span>`);

      actionsHTML = `
        <button class="btn btn-ghost btn-sm btn-reject" data-id="${Number(c.id)}" title="رفض العقد يلغيه ويعيد المبلغ لصاحبه">
          <i class="fas fa-xmark"></i> رفض
        </button>
        <button class="btn btn-primary btn-sm btn-accept" data-id="${Number(c.id)}">
          <i class="fas fa-check"></i> قبول
        </button>`;
    } else if (type === 'active') {
      const elapsed = c.accepted_at ? Math.floor((Date.now()/1000) - c.accepted_at) : 0;
      avatarIcon = 'fa-crosshairs';
      extraHTML = `
        <div class="cc-live">
          <span class="live-dot"></span> جاري تعقب الهدف
          <span class="cc-elapsed">منذ ${fmt.secs(elapsed)}</span>
        </div>`;
      actionsHTML = `
        <button class="btn btn-danger btn-sm btn-abandon" data-id="${Number(c.id)}">
          <i class="fas fa-flag"></i> إلغاء المهمة
        </button>
        <button class="btn btn-secondary btn-sm btn-chat" data-id="${Number(c.id)}">
          <i class="fas fa-comments"></i> محادثة العقد
        </button>`;
    } else {
      avatarIcon = 'fa-check';
      tags.push('<span class="tag tag-success"><i class="fas fa-check"></i> مكتملة</span>');
      tags.push(`<span class="tag"><i class="fas fa-calendar"></i> ${escapeHtml(fmt.time(c.completed_at))}</span>`);
      actionsHTML = `
        <button class="btn btn-secondary btn-sm btn-chat" data-id="${Number(c.id)}">
          <i class="fas fa-comments"></i> المحادثة
        </button>`;
    }

    card.innerHTML = `
      <div class="cc-avatar"><i class="fas ${avatarIcon}"></i></div>
      <div class="cc-info">
        <div class="cc-title"><span class="cc-title-muted">الهدف</span><span class="cc-num">#${Number(c.target_id)}</span></div>
        <div class="cc-meta">${tags.join('')}</div>
        ${c.notes ? `<div class="cc-notes">${escapeHtml(c.notes)}</div>` : ''}
        ${extraHTML}
      </div>
      <div class="cc-reward">
        <div class="cc-price">${fmt.money(c.price)}</div>
        <div class="cc-price-label">المكافأة</div>
      </div>
      <div class="cc-actions">${actionsHTML}</div>`;

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
      rejectBtn.addEventListener('click', () =>
        confirmThen(rejectBtn, 'تأكيد؟', () => rejectContract(c.id, card)));
    }
    if (abandonBtn) {
      abandonBtn.addEventListener('click', () =>
        confirmThen(abandonBtn, 'تأكيد الإلغاء', () => abandonMission(c.id, abandonBtn)));
    }

    return card;
  }

  // Irreversible actions need a second click within 3s.
  function confirmThen(btn, label, action) {
    if (btn.classList.contains('is-armed')) {
      clearTimeout(btn._disarmTimer);
      action();
      return;
    }
    const original = btn.innerHTML;
    btn.classList.add('is-armed');
    btn.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${label}`;
    btn._disarmTimer = setTimeout(() => {
      btn.classList.remove('is-armed');
      btn.innerHTML = original;
    }, 3000);
  }

  // ─── CONTRACT ACTIONS ───────────────────────
  function acceptContract(contractId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    post('acceptContract', { contractId });
  }

  function rejectContract(contractId, card) {
    card.classList.add('is-leaving');
    setTimeout(() => {
      card.remove();
      const list = $('contracts-list');
      if (list && !list.querySelector('.contract-card')) renderContracts(state.data.contracts || []);
    }, 300);

    // Keep local data in sync so a re-filter doesn't bring the card back
    state.data.contracts = (state.data.contracts || []).filter(x => x.id !== contractId);

    post('rejectContract', { contractId });

    const remaining = parseInt($('contracts-badge').textContent || '0');
    updateBadge('contracts-badge', Math.max(0, remaining - 1));
  }

  function abandonMission(contractId, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    post('abandonMission', { contractId });
    // The server doesn't push fresh data after abandoning; pull it so the card clears
    setTimeout(() => post('refreshHitmanData'), 500);
  }

  function handleAcceptResult(success, message, data) {
    if (success) {
      showNotification('success', 'تم قبول العقد', 'تم قبول المهمة بنجاح! يتم تعقب الهدف الآن.');
      setTimeout(() => post('refreshHitmanData'), 300);
      switchTab('active');
    } else {
      showNotification('error', 'خطأ', message || 'فشل قبول العقد.');
      renderContracts(state.data.contracts || []); // restore the button spinner
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
      const rankColor = stats.rankColor || 'var(--evora-primary)';
      $('rank-name-display').textContent = stats.rank;
      $('rpc-rank').textContent = stats.rank;
      $('sidebar-rank').style.setProperty('--rank-color', rankColor);
      $('rank-progress-card').style.setProperty('--rank-color', rankColor);
    }

    if (stats.rankBonus !== undefined) {
      $('rank-bonus').innerHTML =
        `المكافأة النشطة: <strong dir="ltr">+${Math.round(stats.rankBonus * 100)}%</strong>`;
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
      $('rpb-next').textContent = `التالي: ${nextRank.name} عند ${nextRank.minKills} قتلى`;
    } else {
      fill.style.width = '100%';
      $('rpb-current-kills').textContent = kills + ' قتلى';
      $('rpb-next').textContent = 'أعلى رتبة';
    }
  }

  function renderRankLadder(kills, ranks) {
    const ladder = $('rank-ladder');
    if (!ladder) return;

    ladder.innerHTML = `
      <div class="rank-ladder-head">
        <span>سلم الرتب</span>
        <span>القتلى المطلوبة</span>
        <span>المكافأة</span>
      </div>`;

    ranks.forEach((r, i) => {
      const next      = ranks[i + 1];
      const reached   = kills >= r.minKills;
      const isCurrent = reached && (next == null || kills < next.minKills);

      const row = document.createElement('div');
      row.className = 'rank-row ' + (isCurrent ? 'is-current' : reached ? 'is-reached' : 'is-locked');
      if (r.color) row.style.setProperty('--rank-color', r.color);

      row.innerHTML = `
        <div class="rank-row-name">
          <span class="rank-dot"></span>
          <span>${escapeHtml(r.name)}</span>
          ${isCurrent ? '<span class="tag tag-accent">الحالية</span>' : ''}
        </div>
        <div class="rank-row-kills">${Number(r.minKills)}</div>
        <div class="rank-row-bonus"><span dir="ltr">+${Math.round(r.bonus * 100)}%</span></div>`;

      ladder.appendChild(row);
    });
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
