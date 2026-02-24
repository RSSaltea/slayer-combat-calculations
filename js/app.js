// Slayer & Combat Calculations - Application Logic
(function () {
  'use strict';

  // State
  const state = {
    boosts: {
      codex: true,
      avatar: true,
      raf: false,
      slayerBxp: false,
      combatBxp: false,
      offTask: false,
      lv120Slayer: true,
      bindingContracts: false,
      tetraContracts: false,
      scrimshaw: false,
      doubleXp: false,
      slayerIntrospection: false,
    },
    misc: 0,
    sortCol: 'slayXpHr',
    sortAsc: false,
    search: '',
    showClusters: true,
    focusMetric: 'slayXpHr',
    prefer: new Set(DEFAULT_PREFER),
    block: new Set(DEFAULT_BLOCK),
  };

  // Load state from localStorage
  function loadState() {
    try {
      const saved = localStorage.getItem('slayerCalcState');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.boosts) Object.assign(state.boosts, parsed.boosts);
        if (typeof parsed.misc === 'number') state.misc = parsed.misc;
        if (parsed.prefer) state.prefer = new Set(parsed.prefer);
        if (parsed.block) state.block = new Set(parsed.block);
        if (parsed.showClusters !== undefined) state.showClusters = parsed.showClusters;
        if (parsed.focusMetric) state.focusMetric = parsed.focusMetric;
      }
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try {
      localStorage.setItem('slayerCalcState', JSON.stringify({
        boosts: state.boosts,
        misc: state.misc,
        prefer: [...state.prefer],
        block: [...state.block],
        showClusters: state.showClusters,
        focusMetric: state.focusMetric,
      }));
    } catch (e) { /* ignore */ }
  }

  // Boost calculation
  function getSlayerMult() {
    let m = 1;
    if (state.boosts.codex) m += 0.05;
    if (state.boosts.avatar) m += 0.06;
    if (state.boosts.raf) m += 0.10;
    if (state.boosts.slayerBxp) m += 1.0;
    if (state.boosts.scrimshaw) m += 0.50;
    if (state.boosts.doubleXp) m += 1.0;
    if (state.misc > 0) m += state.misc / 100;
    return m;
  }

  function getCombatMult() {
    let m = 1;
    if (state.boosts.avatar) m += 0.06;
    if (state.boosts.raf) m += 0.10;
    if (state.boosts.combatBxp) m += 1.0;
    if (state.boosts.scrimshaw) m += 0.50;
    if (state.boosts.doubleXp) m += 1.0;
    if (state.misc > 0) m += state.misc / 100;
    return m;
  }

  function getGpMult() {
    if (state.boosts.scrimshaw) return 0;
    return 1;
  }

  function applyBoosts(monster) {
    const sm = getSlayerMult();
    const cm = getCombatMult();
    const gm = getGpMult();
    return {
      ...monster,
      slayXpHr: monster.slayXpHr * sm,
      combatXpHr: monster.combatXpHr * cm,
      gpHr: monster.gpHr * gm,
      gpTask: monster.gpTask * gm,
      slayXpTask: monster.slayXpTask * sm,
      combatXpTask: monster.combatXpTask * cm,
    };
  }

  // Format number with commas
  function fmt(n, decimals = 0) {
    if (n === 0) return '0';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtShort(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return fmt(n);
  }

  // Display name for monster (with cluster label)
  function displayName(m) {
    if (m.cluster) return m.name + ' (' + m.cluster + ' Cluster)';
    return m.name;
  }

  // Tab navigation
  function initTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });
  }

  // Boosts UI
  function initBoosts() {
    const grid = document.getElementById('boosts-grid');
    const boostDefs = [
      { key: 'codex', label: 'Slayer Codex', badge: '+5%' },
      { key: 'avatar', label: 'Clan Avatar', badge: '+6%' },
      { key: 'raf', label: 'Refer a Friend', badge: '+10%' },
      { key: 'slayerBxp', label: 'Slayer BXP', badge: '+100%' },
      { key: 'combatBxp', label: 'Combat BXP', badge: '+100%' },
      { key: 'offTask', label: 'Off Task (GP/HR)', badge: '' },
      { key: 'lv120Slayer', label: '120 Slayer', badge: '' },
      { key: 'bindingContracts', label: 'Binding Contracts', badge: '' },
      { key: 'tetraContracts', label: 'Tetra Contracts', badge: '' },
      { key: 'scrimshaw', label: 'Scrimshaw of Sacrifice', badge: '+50%' },
      { key: 'doubleXp', label: 'Double XP', badge: '+100%' },
      { key: 'slayerIntrospection', label: 'Slayer Introspection', badge: '' },
    ];

    boostDefs.forEach(def => {
      const item = document.createElement('div');
      item.className = 'boost-item' + (state.boosts[def.key] ? ' active' : '');
      item.innerHTML = `
        <div class="toggle"></div>
        <span class="label">${def.label}</span>
        ${def.badge ? `<span class="badge">${def.badge}</span>` : ''}
      `;
      item.addEventListener('click', () => {
        state.boosts[def.key] = !state.boosts[def.key];
        item.classList.toggle('active', state.boosts[def.key]);
        updateAll();
        saveState();
      });
      grid.appendChild(item);
    });

    // Misc input
    const miscWrap = document.createElement('div');
    miscWrap.className = 'misc-input-wrap';
    miscWrap.innerHTML = `
      <label>Misc Boost</label>
      <input type="number" id="misc-input" value="${state.misc}" min="0" max="500" step="1">
      <span class="unit">%</span>
    `;
    grid.appendChild(miscWrap);

    document.getElementById('misc-input').addEventListener('input', (e) => {
      state.misc = parseInt(e.target.value) || 0;
      updateAll();
      saveState();
    });
  }

  // Multiplier bar
  function updateMultiplierBar() {
    const bar = document.getElementById('multiplier-bar');
    const sm = getSlayerMult();
    const cm = getCombatMult();
    const gm = getGpMult();
    bar.innerHTML = `
      <div class="mult-item"><span class="mult-label">Slayer XP</span> <span class="mult-value">${sm.toFixed(2)}x</span></div>
      <div class="mult-item"><span class="mult-label">Combat XP</span> <span class="mult-value">${cm.toFixed(2)}x</span></div>
      <div class="mult-item"><span class="mult-label">GP</span> <span class="mult-value">${gm === 0 ? 'None (Sacrifice)' : gm.toFixed(2) + 'x'}</span></div>
    `;
  }

  // Stats bar
  function updateStatsBar() {
    const boosted = MONSTERS.filter(m => !m.cluster).map(applyBoosts);
    const bestSlay = boosted.reduce((a, b) => a.slayXpHr > b.slayXpHr ? a : b);
    const bestCombat = boosted.reduce((a, b) => a.combatXpHr > b.combatXpHr ? a : b);
    const bestGp = boosted.reduce((a, b) => a.gpHr > b.gpHr ? a : b);
    const fastest = boosted.reduce((a, b) => a.minsTask < b.minsTask ? a : b);

    document.getElementById('stats-bar').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${fmtShort(bestSlay.slayXpHr)}</div>
        <div class="stat-label">Best Slay XP/Hr (${bestSlay.name})</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtShort(bestCombat.combatXpHr)}</div>
        <div class="stat-label">Best Combat XP/Hr (${bestCombat.name})</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtShort(bestGp.gpHr)}</div>
        <div class="stat-label">Best GP/Hr (${bestGp.name})</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fastest.minsTask.toFixed(1)}m</div>
        <div class="stat-label">Fastest Task (${fastest.name})</div>
      </div>
    `;
  }

  // Experience table
  function renderExpTable() {
    const tbody = document.getElementById('exp-table-body');
    const sortKey = state.sortCol;
    const asc = state.sortAsc;

    let data = MONSTERS.map(applyBoosts);

    // Filter by search
    if (state.search) {
      const q = state.search.toLowerCase();
      data = data.filter(m => displayName(m).toLowerCase().includes(q));
    }

    // Filter clusters
    if (!state.showClusters) {
      data = data.filter(m => !m.cluster);
    }

    // Sort
    data.sort((a, b) => {
      const va = a[sortKey] || 0;
      const vb = b[sortKey] || 0;
      return asc ? va - vb : vb - va;
    });

    tbody.innerHTML = '';
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-results">No monsters found.</td></tr>';
      return;
    }

    let rank = 0;
    data.forEach((m, i) => {
      if (!m.cluster) rank++;
      const tr = document.createElement('tr');
      if (m.cluster) tr.classList.add('cluster');
      tr.innerHTML = `
        <td>${m.cluster ? '' : '<span class="row-rank">' + rank + '</span>'}${displayName(m)}</td>
        <td class="${sortKey === 'slayXpHr' ? 'highlight' : ''}">${fmt(m.slayXpHr)}</td>
        <td class="${sortKey === 'combatXpHr' ? 'highlight' : ''}">${fmt(m.combatXpHr)}</td>
        <td class="gp-col ${sortKey === 'gpHr' ? 'highlight' : ''}">${fmt(m.gpHr)}</td>
        <td class="gp-col ${sortKey === 'gpTask' ? 'highlight' : ''}">${fmt(m.gpTask)}</td>
        <td class="${sortKey === 'slayXpTask' ? 'highlight' : ''}">${fmt(m.slayXpTask)}</td>
        <td class="${sortKey === 'combatXpTask' ? 'highlight' : ''}">${fmt(m.combatXpTask)}</td>
        <td class="${sortKey === 'minsTask' ? 'highlight' : ''}">${m.minsTask.toFixed(1)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Update sort indicators
    document.querySelectorAll('#exp-table th').forEach(th => {
      th.classList.remove('sorted', 'asc');
      if (th.dataset.sort === sortKey) {
        th.classList.add('sorted');
        if (asc) th.classList.add('asc');
      }
    });
  }

  function initExpTable() {
    document.querySelectorAll('#exp-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.sortCol === col) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortCol = col;
          state.sortAsc = false;
        }
        renderExpTable();
      });
    });

    document.getElementById('exp-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderExpTable();
    });

    document.getElementById('toggle-clusters').addEventListener('click', (e) => {
      state.showClusters = !state.showClusters;
      e.target.classList.toggle('active', state.showClusters);
      saveState();
      renderExpTable();
      renderFilterTable();
    });
  }

  // Filter table (same data but filtered by prefer/block)
  function renderFilterTable() {
    const tbody = document.getElementById('filter-table-body');
    const focusKey = state.focusMetric;

    // Get preferred and blocked monster names
    const preferredNames = new Set();
    const blockedNames = new Set();
    state.prefer.forEach(catId => {
      const cat = TASK_CATEGORIES.find(c => c.id === catId);
      if (cat) cat.monsters.forEach(m => preferredNames.add(m));
    });
    state.block.forEach(catId => {
      const cat = TASK_CATEGORIES.find(c => c.id === catId);
      if (cat) cat.monsters.forEach(m => blockedNames.add(m));
    });

    let data = MONSTERS.map(applyBoosts);

    // Remove blocked
    data = data.filter(m => !blockedNames.has(m.name));

    // Filter clusters
    if (!state.showClusters) {
      data = data.filter(m => !m.cluster);
    }

    // Sort by focus metric
    data.sort((a, b) => (b[focusKey] || 0) - (a[focusKey] || 0));

    tbody.innerHTML = '';
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-results">All monsters are blocked.</td></tr>';
      return;
    }

    let rank = 0;
    data.forEach((m) => {
      if (!m.cluster) rank++;
      const isPreferred = preferredNames.has(m.name);
      const tr = document.createElement('tr');
      if (m.cluster) tr.classList.add('cluster');
      if (isPreferred) tr.style.borderLeft = '3px solid var(--green)';
      tr.innerHTML = `
        <td>${m.cluster ? '' : '<span class="row-rank">' + rank + '</span>'}${displayName(m)}${isPreferred ? ' <span style="color:var(--green);font-size:0.7rem;">PREFER</span>' : ''}</td>
        <td class="${focusKey === 'slayXpHr' ? 'highlight' : ''}">${fmt(m.slayXpHr)}</td>
        <td class="${focusKey === 'combatXpHr' ? 'highlight' : ''}">${fmt(m.combatXpHr)}</td>
        <td class="gp-col ${focusKey === 'gpHr' ? 'highlight' : ''}">${fmt(m.gpHr)}</td>
        <td class="gp-col ${focusKey === 'gpTask' ? 'highlight' : ''}">${fmt(m.gpTask)}</td>
        <td class="${focusKey === 'slayXpTask' ? 'highlight' : ''}">${fmt(m.slayXpTask)}</td>
        <td class="${focusKey === 'combatXpTask' ? 'highlight' : ''}">${fmt(m.combatXpTask)}</td>
        <td class="${focusKey === 'minsTask' ? 'highlight' : ''}">${m.minsTask.toFixed(1)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Update sort indicators on filter table
    document.querySelectorAll('#filter-table th').forEach(th => {
      th.classList.remove('sorted', 'asc');
      if (th.dataset.sort === focusKey) {
        th.classList.add('sorted');
      }
    });
  }

  function initFilterTable() {
    const select = document.getElementById('focus-select');
    select.value = state.focusMetric;
    select.addEventListener('change', (e) => {
      state.focusMetric = e.target.value;
      saveState();
      renderFilterTable();
    });

    // Also allow clicking headers to sort
    document.querySelectorAll('#filter-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        state.focusMetric = th.dataset.sort;
        document.getElementById('focus-select').value = state.focusMetric;
        saveState();
        renderFilterTable();
      });
    });
  }

  // Prefer / Block List
  function renderPrefBlock() {
    const preferList = document.getElementById('prefer-list');
    const blockList = document.getElementById('block-list');
    const unassignedList = document.getElementById('unassigned-list');

    preferList.innerHTML = '';
    blockList.innerHTML = '';
    unassignedList.innerHTML = '';

    TASK_CATEGORIES.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = 'task-chip';

      if (state.prefer.has(cat.id)) {
        chip.innerHTML = `
          <span>${cat.label}</span>
          <div class="chip-actions">
            <button class="chip-btn remove-btn" title="Remove">&times;</button>
          </div>
        `;
        chip.querySelector('.remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.prefer.delete(cat.id);
          saveState();
          renderPrefBlock();
          renderFilterTable();
        });
        preferList.appendChild(chip);
      } else if (state.block.has(cat.id)) {
        chip.innerHTML = `
          <span>${cat.label}</span>
          <div class="chip-actions">
            <button class="chip-btn remove-btn" title="Remove">&times;</button>
          </div>
        `;
        chip.querySelector('.remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.block.delete(cat.id);
          saveState();
          renderPrefBlock();
          renderFilterTable();
        });
        blockList.appendChild(chip);
      } else {
        chip.innerHTML = `
          <span>${cat.label}</span>
          <div class="chip-actions">
            <button class="chip-btn prefer-btn" title="Prefer">+</button>
            <button class="chip-btn block-btn" title="Block">&minus;</button>
          </div>
        `;
        chip.querySelector('.prefer-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.prefer.add(cat.id);
          saveState();
          renderPrefBlock();
          renderFilterTable();
        });
        chip.querySelector('.block-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          state.block.add(cat.id);
          saveState();
          renderPrefBlock();
          renderFilterTable();
        });
        unassignedList.appendChild(chip);
      }
    });

    // Update counts
    document.getElementById('prefer-count').textContent = state.prefer.size;
    document.getElementById('block-count').textContent = state.block.size;
  }

  // Changelog
  function renderChangelog() {
    const tbody = document.getElementById('changelog-body');
    tbody.innerHTML = '';
    CHANGELOG.forEach(entry => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${entry.date}</td>
        <td class="ver">${entry.version}</td>
        <td>${entry.note}</td>
        <td>${entry.change}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Update all dynamic content
  function updateAll() {
    updateMultiplierBar();
    updateStatsBar();
    renderExpTable();
    renderFilterTable();
  }

  // Reset preferences
  function initResetBtn() {
    document.getElementById('reset-prefs').addEventListener('click', () => {
      state.prefer = new Set(DEFAULT_PREFER);
      state.block = new Set(DEFAULT_BLOCK);
      saveState();
      renderPrefBlock();
      renderFilterTable();
    });
  }

  // Init
  function init() {
    loadState();
    initTabs();
    initBoosts();
    initExpTable();
    initFilterTable();
    initResetBtn();
    updateAll();
    renderPrefBlock();
    renderChangelog();

    // Apply saved cluster toggle state
    const clusterBtn = document.getElementById('toggle-clusters');
    clusterBtn.classList.toggle('active', state.showClusters);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
