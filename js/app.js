// Slayer & Combat Calculations - Application Logic
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  var state = {
    boosts: {
      codexPct: 5,
      avatarPct: 6,
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
    showBlocked: false,
    taskView: false,
    expandedTasks: new Set(),
    prefer: new Set(DEFAULT_PREFER),
    block: new Set(DEFAULT_BLOCK),
    customKph: {},
    scrimshawMonsters: new Set(),
    persuadeUnlocks: new Set(), // which persuade tasks the player has unlocked
  };

  // Player data from hiscores lookup (set via callback)
  var _playerSkills = null;
  var _playerQuests = null;

  // ── Persistence ────────────────────────────────────────────────────
  function loadState() {
    try {
      var saved = localStorage.getItem('slayerCalcState');
      if (saved) {
        var p = JSON.parse(saved);
        if (p.boosts) Object.assign(state.boosts, p.boosts);
        if (typeof p.misc === 'number') state.misc = p.misc;
        if (p.prefer) state.prefer = new Set(p.prefer);
        if (p.block) state.block = new Set(p.block);
        if (p.showClusters !== undefined) state.showClusters = p.showClusters;
        if (p.showBlocked !== undefined) state.showBlocked = p.showBlocked;
        if (p.taskView !== undefined) state.taskView = p.taskView;
        if (p.sortCol) state.sortCol = p.sortCol;
        if (p.customKph) state.customKph = p.customKph;
        if (p.scrimshawMonsters) state.scrimshawMonsters = new Set(p.scrimshawMonsters);
        if (p.persuadeUnlocks) state.persuadeUnlocks = new Set(p.persuadeUnlocks);
      }
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try {
      localStorage.setItem('slayerCalcState', JSON.stringify({
        boosts: state.boosts,
        misc: state.misc,
        prefer: Array.from(state.prefer),
        block: Array.from(state.block),
        showClusters: state.showClusters,
        showBlocked: state.showBlocked,
        taskView: state.taskView,
        sortCol: state.sortCol,
        customKph: state.customKph,
        scrimshawMonsters: Array.from(state.scrimshawMonsters),
        persuadeUnlocks: Array.from(state.persuadeUnlocks),
      }));
    } catch (e) { /* ignore */ }
  }

  // Expose persuade unlocks for hiscores.js goal calculator
  window._persuadeUnlocks = state.persuadeUnlocks;

  // ── Multiplier Calculations ────────────────────────────────────────
  function getSlayerMult(useScrimshaw) {
    var m = 1;
    if (state.boosts.codexPct > 0) m += state.boosts.codexPct / 100;
    if (state.boosts.avatarPct > 0) m += state.boosts.avatarPct / 100;
    if (state.boosts.raf) m += 0.10;
    if (state.boosts.slayerBxp) m += 1.0;
    if (useScrimshaw !== undefined ? useScrimshaw : state.boosts.scrimshaw) m += 0.50;
    if (state.boosts.doubleXp) m += 1.0;
    if (state.misc > 0) m += state.misc / 100;
    return m;
  }

  function getCombatMult(useScrimshaw) {
    var m = 1;
    if (state.boosts.avatarPct > 0) m += state.boosts.avatarPct / 100;
    if (state.boosts.raf) m += 0.10;
    if (state.boosts.combatBxp) m += 1.0;
    if (useScrimshaw !== undefined ? useScrimshaw : state.boosts.scrimshaw) m += 0.50;
    if (state.boosts.doubleXp) m += 1.0;
    if (state.misc > 0) m += state.misc / 100;
    return m;
  }

  function getGpMult(useScrimshaw) {
    if (useScrimshaw !== undefined ? useScrimshaw : state.boosts.scrimshaw) return 0;
    return 1;
  }

  window.getSlayerMult = function () { return getSlayerMult(); };
  window.getCombatMult = function () { return getCombatMult(); };

  // ── Unique key for monster+cluster ─────────────────────────────────
  function monsterKey(m) {
    return m.cluster ? m.name + '|' + m.cluster : m.name;
  }

  // ── Check if monster is locked ─────────────────────────────────────
  function isMonsterLocked(m) {
    if (typeof checkMonsterLocked !== 'function') return { locked: false, reasons: [] };
    return checkMonsterLocked(m.name, _playerSkills, _playerQuests, state.persuadeUnlocks);
  }

  // ── Compute all derived values from base data ──────────────────────
  function computeMonster(m) {
    var key = monsterKey(m);
    var kph = state.customKph[key] || m.kph;
    var useScrim = state.scrimshawMonsters.has(key) || state.boosts.scrimshaw;

    var sm = getSlayerMult(useScrim);
    var cm = getCombatMult(useScrim);
    var gm = getGpMult(useScrim);

    var minsTask = kph > 0 ? (m.avgKills / kph) * 60 : 0;
    var slayXpHr = m.baseSlayXp * kph * sm;
    var combatXpHr = m.baseCombatXp * kph * cm;
    var slayXpTask = m.baseSlayXp * m.avgKills * sm;
    var combatXpTask = m.baseCombatXp * m.avgKills * cm;

    var gpPerKill = 0;
    if (typeof GP_PER_KILL !== 'undefined' && gm !== 0) {
      var gpData = GP_PER_KILL[m.name];
      if (gpData) {
        gpPerKill = state.boosts.offTask ? gpData.offTask : gpData.onTask;
        if (state.boosts.bindingContracts && gpData.contracts) {
          gpPerKill += gpData.contracts;
        }
      }
    }

    var gpHr = gpPerKill * kph * gm;
    var gpTask = gpPerKill * m.avgKills * gm;

    var lockInfo = isMonsterLocked(m);

    return {
      name: m.name,
      category: m.category,
      cluster: m.cluster,
      baseSlayXp: m.baseSlayXp,
      baseCombatXp: m.baseCombatXp,
      maxTask: m.maxTask,
      avgKills: m.avgKills,
      kph: kph,
      minsTask: minsTask,
      slayXpHr: slayXpHr,
      combatXpHr: combatXpHr,
      slayXpTask: slayXpTask,
      combatXpTask: combatXpTask,
      gpHr: gpHr,
      gpTask: gpTask,
      _key: key,
      _customKph: !!state.customKph[key],
      _scrim: useScrim,
      _locked: lockInfo.locked,
      _lockReasons: lockInfo.reasons,
    };
  }

  // ── Format helpers ─────────────────────────────────────────────────
  function fmt(n, decimals) {
    if (n === 0) return '0';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0,
    });
  }

  function fmtShort(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return fmt(n);
  }

  function monsterIcon(name) {
    if (typeof IMAGES !== 'undefined' && IMAGES[name]) {
      return '<img src="' + IMAGES[name] + '" alt="" class="monster-icon">';
    }
    return '';
  }

  function displayName(m) {
    if (m.cluster) return m.name + ' (' + m.cluster + ' Cluster)';
    return m.name;
  }

  // ── Tab Navigation ─────────────────────────────────────────────────
  function initTabs() {
    var btns = document.querySelectorAll('.tab-btn');
    var panels = document.querySelectorAll('.tab-panel');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });
  }

  // ── Boosts UI ──────────────────────────────────────────────────────
  function initBoosts() {
    var grid = document.getElementById('boosts-grid');

    var dropdownDefs = [
      { key: 'codexPct', label: 'Slayer Codex', options: [
        { value: 0, text: 'Off' }, { value: 1, text: '1%' }, { value: 2, text: '2%' },
        { value: 3, text: '3%' }, { value: 4, text: '4%' }, { value: 5, text: '5%' },
      ]},
      { key: 'avatarPct', label: 'Clan Avatar', options: [
        { value: 0, text: 'Off' }, { value: 3, text: '3%' }, { value: 4, text: '4%' },
        { value: 5, text: '5%' }, { value: 6, text: '6%' },
      ]},
    ];

    dropdownDefs.forEach(function (def) {
      var item = document.createElement('div');
      item.className = 'boost-item boost-dropdown-item' + (state.boosts[def.key] > 0 ? ' active' : '');
      var optionsHtml = def.options.map(function (o) {
        return '<option value="' + o.value + '">' + o.text + '</option>';
      }).join('');
      item.innerHTML =
        '<span class="label">' + def.label + '</span>' +
        '<select class="boost-select" data-key="' + def.key + '">' + optionsHtml + '</select>';
      var select = item.querySelector('select');
      select.value = state.boosts[def.key];
      select.addEventListener('click', function (e) { e.stopPropagation(); });
      select.addEventListener('change', function (e) {
        state.boosts[def.key] = parseInt(e.target.value) || 0;
        item.classList.toggle('active', state.boosts[def.key] > 0);
        updateAll();
        saveState();
      });
      grid.appendChild(item);
    });

    var boostDefs = [
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

    boostDefs.forEach(function (def) {
      var item = document.createElement('div');
      item.className = 'boost-item' + (state.boosts[def.key] ? ' active' : '');
      item.innerHTML =
        '<div class="toggle"></div>' +
        '<span class="label">' + def.label + '</span>' +
        (def.badge ? '<span class="badge">' + def.badge + '</span>' : '');
      item.addEventListener('click', function () {
        state.boosts[def.key] = !state.boosts[def.key];
        item.classList.toggle('active', state.boosts[def.key]);
        updateAll();
        saveState();
      });
      grid.appendChild(item);
    });

    var miscWrap = document.createElement('div');
    miscWrap.className = 'misc-input-wrap';
    miscWrap.innerHTML =
      '<label>Misc Boost</label>' +
      '<input type="number" id="misc-input" value="' + state.misc + '" min="0" max="500" step="1">' +
      '<span class="unit">%</span>';
    grid.appendChild(miscWrap);

    document.getElementById('misc-input').addEventListener('input', function (e) {
      state.misc = parseInt(e.target.value) || 0;
      updateAll();
      saveState();
    });
  }

  // ── Multiplier Bar ─────────────────────────────────────────────────
  function updateMultiplierBar() {
    var bar = document.getElementById('multiplier-bar');
    var sm = getSlayerMult();
    var cm = getCombatMult();
    var gm = getGpMult();
    bar.innerHTML =
      '<div class="mult-item"><span class="mult-label">Slayer XP</span> <span class="mult-value">' + sm.toFixed(2) + 'x</span></div>' +
      '<div class="mult-item"><span class="mult-label">Combat XP</span> <span class="mult-value">' + cm.toFixed(2) + 'x</span></div>' +
      '<div class="mult-item"><span class="mult-label">GP</span> <span class="mult-value">' + (gm === 0 ? 'None (Sacrifice)' : gm.toFixed(2) + 'x') + '</span></div>';
  }

  // ── Stats Bar ──────────────────────────────────────────────────────
  function updateStatsBar() {
    var boosted = MONSTERS.filter(function (m) { return !m.cluster; }).map(computeMonster);
    // Only include unlocked for "best" stats
    var unlocked = boosted.filter(function (m) { return !m._locked; });
    if (unlocked.length === 0) unlocked = boosted; // fallback if all locked

    var bestSlay = unlocked.reduce(function (a, b) { return a.slayXpHr > b.slayXpHr ? a : b; });
    var bestCombat = unlocked.reduce(function (a, b) { return a.combatXpHr > b.combatXpHr ? a : b; });
    var bestGp = unlocked.reduce(function (a, b) { return a.gpHr > b.gpHr ? a : b; });
    var fastest = unlocked.reduce(function (a, b) { return (a.minsTask > 0 && a.minsTask < b.minsTask) ? a : b; });

    document.getElementById('stats-bar').innerHTML =
      '<div class="stat-card"><div class="stat-value">' + fmtShort(bestSlay.slayXpHr) + '</div><div class="stat-label">Best Slay XP/Hr (' + bestSlay.name + ')</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + fmtShort(bestCombat.combatXpHr) + '</div><div class="stat-label">Best Combat XP/Hr (' + bestCombat.name + ')</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + fmtShort(bestGp.gpHr) + '</div><div class="stat-label">Best GP/Hr (' + bestGp.name + ')</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + fastest.minsTask.toFixed(1) + 'm</div><div class="stat-label">Fastest Task (' + fastest.name + ')</div></div>';
  }

  // ── Prefer / Block name sets ───────────────────────────────────────
  function getPreferredNames() {
    var names = new Set();
    state.prefer.forEach(function (catId) {
      var cat = TASK_CATEGORIES.find(function (c) { return c.id === catId; });
      if (cat) cat.monsters.forEach(function (m) { names.add(m); });
    });
    return names;
  }

  function getBlockedNames() {
    var names = new Set();
    state.block.forEach(function (catId) {
      var cat = TASK_CATEGORIES.find(function (c) { return c.id === catId; });
      if (cat) cat.monsters.forEach(function (m) { names.add(m); });
    });
    return names;
  }

  // ── Slayer Tasks Table ─────────────────────────────────────────────
  function renderTasksTable() {
    var tbody = document.getElementById('tasks-table-body');
    var sortKey = state.sortCol;
    var asc = state.sortAsc;
    var blockedNames = getBlockedNames();
    var preferredNames = getPreferredNames();

    if (state.taskView) {
      renderTaskViewTable(tbody, sortKey, asc, blockedNames, preferredNames);
    } else {
      renderMonsterViewTable(tbody, sortKey, asc, blockedNames, preferredNames);
    }

    // Update sort indicators on headers
    document.querySelectorAll('#tasks-table th').forEach(function (th) {
      th.classList.remove('sorted', 'asc');
      if (th.dataset.sort === sortKey) {
        th.classList.add('sorted');
        if (asc) th.classList.add('asc');
      }
    });

    // Update toggle button states
    var clusterBtn = document.getElementById('toggle-clusters');
    var taskViewBtn = document.getElementById('toggle-task-view');
    if (clusterBtn) {
      clusterBtn.style.display = state.taskView ? 'none' : '';
    }
    if (taskViewBtn) {
      taskViewBtn.classList.toggle('active', state.taskView);
    }
  }

  // ── Individual Monster View ──────────────────────────────────────
  function renderMonsterViewTable(tbody, sortKey, asc, blockedNames, preferredNames) {
    var data = MONSTERS.map(computeMonster);

    if (state.search) {
      var q = state.search.toLowerCase();
      data = data.filter(function (m) { return displayName(m).toLowerCase().indexOf(q) !== -1; });
    }

    if (!state.showClusters) {
      data = data.filter(function (m) { return !m.cluster; });
    }

    var visible = [];
    var blocked = [];
    data.forEach(function (m) {
      if (blockedNames.has(m.name)) {
        blocked.push(m);
      } else {
        visible.push(m);
      }
    });

    var sorter = function (a, b) {
      if (sortKey === 'name') {
        return asc ? displayName(a).localeCompare(displayName(b)) : displayName(b).localeCompare(displayName(a));
      }
      var va = a[sortKey] || 0;
      var vb = b[sortKey] || 0;
      return asc ? va - vb : vb - va;
    };
    visible.sort(sorter);
    blocked.sort(sorter);

    tbody.innerHTML = '';

    if (visible.length === 0 && (!state.showBlocked || blocked.length === 0)) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-results">No creatures found.</td></tr>';
      return;
    }

    var rank = 0;
    visible.forEach(function (m) {
      if (!m.cluster) rank++;
      var isPreferred = preferredNames.has(m.name);
      var tr = document.createElement('tr');
      if (m.cluster) tr.classList.add('cluster');
      if (m._locked) tr.classList.add('locked-row');
      if (isPreferred && !m._locked) tr.style.borderLeft = '3px solid var(--green)';
      tr.innerHTML = buildRow(m, rank, sortKey, isPreferred);
      attachRowEvents(tr, m);
      tbody.appendChild(tr);
    });

    if (state.showBlocked && blocked.length > 0) {
      var sep = document.createElement('tr');
      sep.className = 'blocked-separator';
      sep.innerHTML = '<td colspan="10" class="blocked-label">Blocked (' + blocked.length + ')</td>';
      tbody.appendChild(sep);

      blocked.forEach(function (m) {
        var tr = document.createElement('tr');
        tr.className = 'blocked-row';
        if (m.cluster) tr.classList.add('cluster');
        if (m._locked) tr.classList.add('locked-row');
        tr.innerHTML = buildRow(m, '', sortKey, false);
        attachRowEvents(tr, m);
        tbody.appendChild(tr);
      });
    }
  }

  // ── Task View (grouped by task assignment name) ──────────────────
  function renderTaskViewTable(tbody, sortKey, asc, blockedNames, preferredNames) {
    tbody.innerHTML = '';

    // Build grouped data: for each task category, find best stats
    var groups = TASK_CATEGORIES.map(function (cat) {
      var monsters = [];
      cat.monsters.forEach(function (mName) {
        MONSTERS.forEach(function (m) {
          if (m.name === mName && !m.cluster) {
            monsters.push(computeMonster(m));
          }
        });
      });
      if (monsters.length === 0) return null;

      // Best monster for the sort metric (among unlocked if possible)
      var unlocked = monsters.filter(function (m) { return !m._locked; });
      var pool = unlocked.length > 0 ? unlocked : monsters;

      var metric = sortKey === 'name' ? 'slayXpHr' : sortKey;
      var best = pool.reduce(function (a, b) {
        return (b[metric] || 0) > (a[metric] || 0) ? b : a;
      });

      var allLocked = unlocked.length === 0;
      var isBlocked = state.block.has(cat.id);
      var isPreferred = state.prefer.has(cat.id);

      return {
        cat: cat,
        best: best,
        monsters: monsters,
        allLocked: allLocked,
        isBlocked: isBlocked,
        isPreferred: isPreferred,
      };
    }).filter(Boolean);

    // Filter by search
    if (state.search) {
      var q = state.search.toLowerCase();
      groups = groups.filter(function (g) {
        if (g.cat.label.toLowerCase().indexOf(q) !== -1) return true;
        return g.monsters.some(function (m) { return m.name.toLowerCase().indexOf(q) !== -1; });
      });
    }

    // Split visible vs blocked
    var visible = [];
    var blocked = [];
    groups.forEach(function (g) {
      if (g.isBlocked) {
        blocked.push(g);
      } else {
        visible.push(g);
      }
    });

    // Sort
    var sorter = function (a, b) {
      if (sortKey === 'name') {
        return asc ? a.cat.label.localeCompare(b.cat.label) : b.cat.label.localeCompare(a.cat.label);
      }
      var va = a.best[sortKey] || 0;
      var vb = b.best[sortKey] || 0;
      return asc ? va - vb : vb - va;
    };
    visible.sort(sorter);
    blocked.sort(sorter);

    if (visible.length === 0 && (!state.showBlocked || blocked.length === 0)) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-results">No tasks found.</td></tr>';
      return;
    }

    var rank = 0;
    visible.forEach(function (g) {
      rank++;
      appendTaskGroup(tbody, g, rank, sortKey);
    });

    if (state.showBlocked && blocked.length > 0) {
      var sep = document.createElement('tr');
      sep.className = 'blocked-separator';
      sep.innerHTML = '<td colspan="10" class="blocked-label">Blocked (' + blocked.length + ')</td>';
      tbody.appendChild(sep);

      blocked.forEach(function (g) {
        appendTaskGroup(tbody, g, '', sortKey, true);
      });
    }
  }

  function appendTaskGroup(tbody, g, rank, sortKey, isBlockedSection) {
    var expanded = state.expandedTasks.has(g.cat.id);
    var m = g.best;
    var hl = function (col) { return sortKey === col ? ' highlight' : ''; };
    var lockedClass = g.allLocked ? ' locked-text' : '';
    var expandIcon = g.monsters.length > 1 ? (expanded ? '\u25BC ' : '\u25B6 ') : '';

    var tr = document.createElement('tr');
    tr.className = 'task-group-row';
    if (isBlockedSection) tr.classList.add('blocked-row');
    if (g.allLocked) tr.classList.add('locked-row');
    if (g.isPreferred && !g.allLocked) tr.style.borderLeft = '3px solid var(--green)';
    if (g.monsters.length > 1) tr.style.cursor = 'pointer';

    var monsterNames = g.monsters.map(function (mon) { return mon.name; });
    var uniqueNames = [];
    monsterNames.forEach(function (n) { if (uniqueNames.indexOf(n) === -1) uniqueNames.push(n); });
    var subLabel = g.monsters.length > 1 ? '<span class="task-monsters-list">' + uniqueNames.join(', ') + '</span>' : '';

    tr.innerHTML =
      '<td class="' + lockedClass + '">' +
        (rank !== '' ? '<span class="row-rank">' + rank + '</span>' : '') +
        '<span class="expand-icon">' + expandIcon + '</span>' +
        '<span class="creature-name">' + g.cat.label + '</span>' +
        (g.isPreferred && !g.allLocked ? ' <span class="prefer-tag">PREFER</span>' : '') +
        (g.allLocked ? ' <span class="locked-tag">LOCKED</span>' : '') +
        subLabel +
      '</td>' +
      '<td class="' + hl('kph') + '">' + fmt(m.kph) + '</td>' +
      '<td class="' + lockedClass + hl('slayXpHr') + '">' + fmt(m.slayXpHr) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpHr') + '">' + fmt(m.combatXpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpHr') + '">' + fmt(m.gpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpTask') + '">' + fmt(m.gpTask) + '</td>' +
      '<td class="' + lockedClass + hl('slayXpTask') + '">' + fmt(m.slayXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpTask') + '">' + fmt(m.combatXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('minsTask') + '">' + m.minsTask.toFixed(1) + '</td>' +
      '<td class="scrim-cell"></td>';

    if (g.monsters.length > 1) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.scrim-toggle')) return;
        if (expanded) {
          state.expandedTasks.delete(g.cat.id);
        } else {
          state.expandedTasks.add(g.cat.id);
        }
        renderTasksTable();
      });
    }

    tbody.appendChild(tr);

    // If expanded, show individual monsters below
    if (expanded) {
      var monsterSorter = function (a, b) {
        if (sortKey === 'name') return a.name.localeCompare(b.name);
        var va = a[sortKey] || 0;
        var vb = b[sortKey] || 0;
        return vb - va; // always desc within group
      };
      var sorted = g.monsters.slice().sort(monsterSorter);

      sorted.forEach(function (mon) {
        var subTr = document.createElement('tr');
        subTr.className = 'task-child-row';
        if (isBlockedSection) subTr.classList.add('blocked-row');
        if (mon._locked) subTr.classList.add('locked-row');
        subTr.innerHTML = buildRow(mon, '', sortKey, false);
        attachRowEvents(subTr, mon);
        tbody.appendChild(subTr);
      });
    }
  }

  function buildRow(m, rank, sortKey, isPreferred) {
    var hl = function (col) { return sortKey === col ? ' highlight' : ''; };
    var kphClass = 'kph-cell' + (m._customKph ? ' custom-kph' : '');
    var scrimChecked = m._scrim ? ' checked' : '';
    var lockedClass = m._locked ? ' locked-text' : '';
    var lockTitle = m._locked ? ' title="' + m._lockReasons.join(', ').replace(/"/g, '&quot;') + '"' : '';

    return (
      '<td class="' + lockedClass + '"' + lockTitle + '>' +
        (rank !== '' && !m.cluster ? '<span class="row-rank">' + rank + '</span>' : '') +
        monsterIcon(m.name) +
        '<span class="creature-name">' + displayName(m) + '</span>' +
        (isPreferred && !m._locked ? ' <span class="prefer-tag">PREFER</span>' : '') +
        (m._locked ? ' <span class="locked-tag">LOCKED</span>' : '') +
      '</td>' +
      '<td class="' + kphClass + hl('kph') + '" data-key="' + m._key + '" data-base="' + m.kph + '">' +
        '<span class="kph-value">' + fmt(m.kph) + '</span>' +
        (m._customKph ? '<span class="kph-reset" title="Reset to default">&#x21ba;</span>' : '') +
      '</td>' +
      '<td class="' + lockedClass + hl('slayXpHr') + '">' + fmt(m.slayXpHr) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpHr') + '">' + fmt(m.combatXpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpHr') + '">' + fmt(m.gpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpTask') + '">' + fmt(m.gpTask) + '</td>' +
      '<td class="' + lockedClass + hl('slayXpTask') + '">' + fmt(m.slayXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpTask') + '">' + fmt(m.combatXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('minsTask') + '">' + m.minsTask.toFixed(1) + '</td>' +
      '<td class="scrim-cell"><input type="checkbox" class="scrim-toggle" data-key="' + m._key + '"' + scrimChecked + '></td>'
    );
  }

  function attachRowEvents(tr, m) {
    var kphCell = tr.querySelector('.kph-cell');
    if (kphCell) {
      kphCell.addEventListener('click', function (e) {
        if (e.target.classList.contains('kph-reset')) {
          delete state.customKph[m._key];
          saveState();
          renderTasksTable();
          updateStatsBar();
          return;
        }
        if (kphCell.querySelector('input[type="number"]')) return;
        var current = state.customKph[m._key] || m.kph;
        var span = kphCell.querySelector('.kph-value');
        var resetBtn = kphCell.querySelector('.kph-reset');
        if (resetBtn) resetBtn.style.display = 'none';
        var input = document.createElement('input');
        input.type = 'number';
        input.className = 'kph-input';
        input.value = current;
        input.min = 1;
        input.max = 99999;
        span.style.display = 'none';
        kphCell.insertBefore(input, span);
        input.focus();
        input.select();

        var finish = function () {
          var val = parseInt(input.value);
          if (val && val > 0 && val !== m.kph) {
            state.customKph[m._key] = val;
          } else {
            delete state.customKph[m._key];
          }
          saveState();
          renderTasksTable();
          updateStatsBar();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') { input.value = m.kph; input.blur(); }
        });
      });
    }

    var scrimToggle = tr.querySelector('.scrim-toggle');
    if (scrimToggle) {
      scrimToggle.addEventListener('click', function (e) { e.stopPropagation(); });
      scrimToggle.addEventListener('change', function () {
        if (scrimToggle.checked) {
          state.scrimshawMonsters.add(m._key);
        } else {
          state.scrimshawMonsters.delete(m._key);
        }
        saveState();
        renderTasksTable();
        updateStatsBar();
      });
    }
  }

  function initTasksTable() {
    document.querySelectorAll('#tasks-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var col = th.dataset.sort;
        if (state.sortCol === col) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortCol = col;
          state.sortAsc = false;
        }
        saveState();
        renderTasksTable();
        var sel = document.getElementById('sort-select');
        if (sel) sel.value = state.sortCol;
      });
    });

    document.getElementById('task-search').addEventListener('input', function (e) {
      state.search = e.target.value;
      renderTasksTable();
    });

    var sortSel = document.getElementById('sort-select');
    sortSel.value = state.sortCol;
    sortSel.addEventListener('change', function () {
      state.sortCol = sortSel.value;
      state.sortAsc = false;
      saveState();
      renderTasksTable();
    });

    var clusterBtn = document.getElementById('toggle-clusters');
    clusterBtn.classList.toggle('active', state.showClusters);
    clusterBtn.addEventListener('click', function () {
      state.showClusters = !state.showClusters;
      clusterBtn.classList.toggle('active', state.showClusters);
      saveState();
      renderTasksTable();
    });

    var blockedBtn = document.getElementById('toggle-blocked');
    blockedBtn.classList.toggle('active', state.showBlocked);
    blockedBtn.addEventListener('click', function () {
      state.showBlocked = !state.showBlocked;
      blockedBtn.classList.toggle('active', state.showBlocked);
      saveState();
      renderTasksTable();
    });

    var taskViewBtn = document.getElementById('toggle-task-view');
    taskViewBtn.classList.toggle('active', state.taskView);
    taskViewBtn.addEventListener('click', function () {
      state.taskView = !state.taskView;
      state.expandedTasks = new Set();
      taskViewBtn.classList.toggle('active', state.taskView);
      saveState();
      renderTasksTable();
    });
  }

  // ── Prefer / Block List ────────────────────────────────────────────
  // Get best monster stats for a category (for display in prefer/block chips)
  function getBestForCategory(catId, metric) {
    var cat = TASK_CATEGORIES.find(function (c) { return c.id === catId; });
    if (!cat) return 0;
    var best = 0;
    cat.monsters.forEach(function (mName) {
      MONSTERS.filter(function (m) { return m.name === mName && !m.cluster; }).forEach(function (m) {
        var computed = computeMonster(m);
        // Skip locked monsters when finding best
        if (!computed._locked) {
          var val = computed[metric] || 0;
          if (val > best) best = val;
        }
      });
    });
    return best;
  }

  function renderPrefBlock() {
    var preferList = document.getElementById('prefer-list');
    var blockList = document.getElementById('block-list');
    var unassignedList = document.getElementById('unassigned-list');

    preferList.innerHTML = '';
    blockList.innerHTML = '';
    unassignedList.innerHTML = '';

    TASK_CATEGORIES.forEach(function (cat) {
      var chip = document.createElement('div');
      chip.className = 'task-chip';

      // Get best slay XP/hr for this category to display
      var bestVal = getBestForCategory(cat.id, state.sortCol || 'slayXpHr');
      var statLabel = bestVal > 0 ? ' <span class="chip-stat">' + fmtShort(bestVal) + '</span>' : '';

      if (state.prefer.has(cat.id)) {
        chip.innerHTML =
          '<span>' + cat.label + statLabel + '</span>' +
          '<div class="chip-actions"><button class="chip-btn remove-btn" title="Remove">&times;</button></div>';
        chip.querySelector('.remove-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          state.prefer.delete(cat.id);
          saveState();
          renderPrefBlock();
          renderTasksTable();
        });
        preferList.appendChild(chip);
      } else if (state.block.has(cat.id)) {
        chip.innerHTML =
          '<span>' + cat.label + statLabel + '</span>' +
          '<div class="chip-actions"><button class="chip-btn remove-btn" title="Remove">&times;</button></div>';
        chip.querySelector('.remove-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          state.block.delete(cat.id);
          saveState();
          renderPrefBlock();
          renderTasksTable();
        });
        blockList.appendChild(chip);
      } else {
        var preferFull = state.prefer.size >= MAX_PREFER;
        var blockFull = state.block.size >= MAX_BLOCK;
        chip.innerHTML =
          '<span>' + cat.label + statLabel + '</span>' +
          '<div class="chip-actions">' +
            '<button class="chip-btn prefer-btn' + (preferFull ? ' disabled' : '') + '" title="Prefer"' + (preferFull ? ' disabled' : '') + '>+</button>' +
            '<button class="chip-btn block-btn' + (blockFull ? ' disabled' : '') + '" title="Block"' + (blockFull ? ' disabled' : '') + '>&minus;</button>' +
          '</div>';
        chip.querySelector('.prefer-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          if (state.prefer.size >= MAX_PREFER) return;
          state.prefer.add(cat.id);
          saveState();
          renderPrefBlock();
          renderTasksTable();
        });
        chip.querySelector('.block-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          if (state.block.size >= MAX_BLOCK) return;
          state.block.add(cat.id);
          saveState();
          renderPrefBlock();
          renderTasksTable();
        });
        unassignedList.appendChild(chip);
      }
    });

    document.getElementById('prefer-count').textContent = state.prefer.size;
    document.getElementById('block-count').textContent = state.block.size;
  }

  // ── Auto-fill ──────────────────────────────────────────────────────
  function autoFillPrefer() {
    var metric = document.getElementById('auto-prefer-metric').value;
    if (!metric) return;
    var scored = TASK_CATEGORIES.map(function (cat) {
      return { id: cat.id, score: getBestForCategory(cat.id, metric) };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    state.prefer = new Set();
    var count = 0;
    for (var i = 0; i < scored.length && count < MAX_PREFER; i++) {
      if (!state.block.has(scored[i].id) && scored[i].score > 0) {
        state.prefer.add(scored[i].id);
        count++;
      }
    }
    saveState();
    renderPrefBlock();
    renderTasksTable();
  }

  function autoFillBlock() {
    var metric = document.getElementById('auto-block-metric').value;
    if (!metric) return;
    var scored = TASK_CATEGORIES.map(function (cat) {
      return { id: cat.id, score: getBestForCategory(cat.id, metric) };
    });
    scored.sort(function (a, b) { return a.score - b.score; });
    state.block = new Set();
    var count = 0;
    for (var i = 0; i < scored.length && count < MAX_BLOCK; i++) {
      if (!state.prefer.has(scored[i].id)) {
        state.block.add(scored[i].id);
        count++;
      }
    }
    saveState();
    renderPrefBlock();
    renderTasksTable();
  }

  // ── Persuade Toggles ──────────────────────────────────────────────
  function renderPersuadeToggles() {
    var container = document.getElementById('persuade-toggles');
    if (!container) return;
    container.innerHTML = '';

    PERSUADE_TASKS.forEach(function (taskId) {
      var cat = TASK_CATEGORIES.find(function (c) { return c.id === taskId; });
      if (!cat) return;

      var unlocked = state.persuadeUnlocks.has(taskId);
      var item = document.createElement('div');
      item.className = 'boost-item' + (unlocked ? ' active' : '');
      item.innerHTML =
        '<div class="toggle"></div>' +
        '<span class="label">' + cat.label + '</span>' +
        '<span class="badge" style="font-size:0.65rem;color:var(--text-muted);">50 pts</span>';
      item.addEventListener('click', function () {
        if (unlocked) {
          state.persuadeUnlocks.delete(taskId);
        } else {
          state.persuadeUnlocks.add(taskId);
        }
        unlocked = !unlocked;
        item.classList.toggle('active', unlocked);
        window._persuadeUnlocks = state.persuadeUnlocks;
        saveState();
        updateAll();
      });
      container.appendChild(item);
    });
  }

  function initPrefBlockControls() {
    document.getElementById('auto-prefer-btn').addEventListener('click', autoFillPrefer);
    document.getElementById('auto-block-btn').addEventListener('click', autoFillBlock);
    document.getElementById('reset-prefs').addEventListener('click', function () {
      state.prefer = new Set(DEFAULT_PREFER);
      state.block = new Set(DEFAULT_BLOCK);
      saveState();
      renderPrefBlock();
      renderTasksTable();
    });
  }

  // ── Changelog ──────────────────────────────────────────────────────
  function renderChangelog() {
    var tbody = document.getElementById('changelog-body');
    tbody.innerHTML = '';
    CHANGELOG.forEach(function (entry) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + entry.date + '</td>' +
        '<td class="ver">' + entry.version + '</td>' +
        '<td>' + entry.note + '</td>' +
        '<td>' + entry.change + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ── Update All ─────────────────────────────────────────────────────
  function updateAll() {
    updateMultiplierBar();
    updateStatsBar();
    renderTasksTable();
    renderPrefBlock();
  }

  // ── Player Lookup Callback ─────────────────────────────────────────
  window.onPlayerLookup = function (skills, quests) {
    _playerSkills = skills;
    _playerQuests = quests;
    updateAll();
  };

  // ── Init ───────────────────────────────────────────────────────────
  function init() {
    loadState();
    window._persuadeUnlocks = state.persuadeUnlocks;
    initTabs();
    initBoosts();
    initTasksTable();
    initPrefBlockControls();
    renderPersuadeToggles();
    updateAll();
    renderChangelog();
    if (typeof initGoalsTab === 'function') initGoalsTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
