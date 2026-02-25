// Slayer & Combat Calculations - Application Logic
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  var state = {
    boosts: {
      codexPct: 5,
      avatarPct: 6,
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
    pinnedPrefer: new Set(),   // manually locked prefer tasks
    pinnedBlock: new Set(),    // manually locked block tasks
    skip: new Set(),           // always skip with points (excluded from averages)
    autoPreferMetric: 'slayXpHr',
    autoBlockMetric: 'slayXpHr',
    customKph: {},
    scrimshawMonsters: new Set(),
    persuadeUnlocks: new Set(), // which persuade tasks the player has unlocked
    introspectionChoices: {},   // category_id -> 'min' | 'max' (Slayer Introspection)
    ultimateObtained: {},       // item name -> true (Ultimate Slayer tracker)
    ultimateActiveArea: 'asgarnia_misthalin',
    ultimateExpanded: {},       // item name -> true
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
        if (p.pinnedPrefer) state.pinnedPrefer = new Set(p.pinnedPrefer);
        if (p.pinnedBlock) state.pinnedBlock = new Set(p.pinnedBlock);
        if (p.skip) state.skip = new Set(p.skip);
        if (p.autoPreferMetric !== undefined) state.autoPreferMetric = p.autoPreferMetric;
        if (p.autoBlockMetric !== undefined) state.autoBlockMetric = p.autoBlockMetric;
        if (p.showClusters !== undefined) state.showClusters = p.showClusters;
        if (p.showBlocked !== undefined) state.showBlocked = p.showBlocked;
        if (p.taskView !== undefined) state.taskView = p.taskView;
        if (p.sortCol) state.sortCol = p.sortCol;
        if (p.customKph) state.customKph = p.customKph;
        if (p.scrimshawMonsters) state.scrimshawMonsters = new Set(p.scrimshawMonsters);
        if (p.persuadeUnlocks) state.persuadeUnlocks = new Set(p.persuadeUnlocks);
        if (p.introspectionChoices) state.introspectionChoices = p.introspectionChoices;
        if (p.ultimateObtained) state.ultimateObtained = p.ultimateObtained;
        if (p.ultimateActiveArea) state.ultimateActiveArea = p.ultimateActiveArea;
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
        pinnedPrefer: Array.from(state.pinnedPrefer),
        pinnedBlock: Array.from(state.pinnedBlock),
        skip: Array.from(state.skip),
        autoPreferMetric: state.autoPreferMetric,
        autoBlockMetric: state.autoBlockMetric,
        showClusters: state.showClusters,
        showBlocked: state.showBlocked,
        taskView: state.taskView,
        sortCol: state.sortCol,
        customKph: state.customKph,
        scrimshawMonsters: Array.from(state.scrimshawMonsters),
        persuadeUnlocks: Array.from(state.persuadeUnlocks),
        introspectionChoices: state.introspectionChoices,
        ultimateObtained: state.ultimateObtained,
        ultimateActiveArea: state.ultimateActiveArea,
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
    if (state.boosts.slayerBxp) m += 1.0;
    if (useScrimshaw !== undefined ? useScrimshaw : state.boosts.scrimshaw) m += 0.50;
    if (state.boosts.doubleXp) m += 1.0;
    if (state.misc > 0) m += state.misc / 100;
    return m;
  }

  function getCombatMult(useScrimshaw) {
    var m = 1;
    if (state.boosts.avatarPct > 0) m += state.boosts.avatarPct / 100;
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

  // ── Check if a task category is eligible (not fully locked/persuade-locked) ──
  function isCategoryEligible(catId) {
    // Check persuade lock
    if (PERSUADE_TASKS.indexOf(catId) !== -1 && !state.persuadeUnlocks.has(catId)) return false;
    // Check if all non-cluster monsters in this category are locked
    var cat = TASK_CATEGORIES.find(function (c) { return c.id === catId; });
    if (!cat) return false;
    var hasUnlocked = false;
    cat.monsters.forEach(function (mName) {
      MONSTERS.filter(function (m) { return m.name === mName && !m.cluster; }).forEach(function (m) {
        if (!isMonsterLocked(m).locked) hasUnlocked = true;
      });
    });
    return hasUnlocked;
  }

  // ── Get best monster icon for a task category ────────────────────────
  // Uses the highest slayer-level monster the player can kill, or falls back to first
  function getBestIconForCategory(cat) {
    var bestName = '';
    var bestSlayLvl = -1;
    cat.monsters.forEach(function (mName) {
      MONSTERS.filter(function (m) { return m.name === mName && !m.cluster; }).forEach(function (m) {
        var lockInfo = isMonsterLocked(m);
        if (!lockInfo.locked) {
          var req = (typeof UNLOCK_REQUIREMENTS !== 'undefined') ? UNLOCK_REQUIREMENTS[m.name] : null;
          var lvl = (req && req.slayerLevel) ? req.slayerLevel : 0;
          if (lvl > bestSlayLvl) {
            bestSlayLvl = lvl;
            bestName = m.name;
          }
        }
      });
    });
    // Fallback: first monster if none unlocked
    if (!bestName && cat.monsters.length > 0) bestName = cat.monsters[0];
    return bestName;
  }

  // ── Get skip state for a monster's category ──────────────────────────
  function getCategoryForMonster(monsterName) {
    for (var i = 0; i < TASK_CATEGORIES.length; i++) {
      if (TASK_CATEGORIES[i].monsters.indexOf(monsterName) !== -1) {
        return TASK_CATEGORIES[i].id;
      }
    }
    return null;
  }

  // ── Compute all derived values from base data ──────────────────────
  function computeMonster(m) {
    var key = monsterKey(m);
    var kph = state.customKph[key] || m.kph;
    var useScrim = state.scrimshawMonsters.has(key) || state.boosts.scrimshaw;

    var sm = getSlayerMult(useScrim);
    var cm = getCombatMult(useScrim);
    var gm = getGpMult(useScrim);

    // Determine effective kills (Slayer Introspection: min or max instead of avg)
    var effectiveKills = m.avgKills;
    if (state.boosts.slayerIntrospection) {
      var taskCat = TASK_CATEGORIES.find(function (c) { return c.monsters.indexOf(m.name) !== -1; });
      if (taskCat) {
        var choice = state.introspectionChoices[taskCat.id] || 'max';
        effectiveKills = choice === 'min' ? m.minTask : m.maxTask;
      }
    }

    var minsTask = kph > 0 ? (effectiveKills / kph) * 60 : 0;
    var slayXpHr = m.baseSlayXp * kph * sm;
    var combatXpHr = m.baseCombatXp * kph * cm;
    var slayXpTask = m.baseSlayXp * effectiveKills * sm;
    var combatXpTask = m.baseCombatXp * effectiveKills * cm;

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
    var gpTask = gpPerKill * effectiveKills * gm;

    var lockInfo = isMonsterLocked(m);

    return {
      name: m.name,
      category: m.category,
      cluster: m.cluster,
      baseSlayXp: m.baseSlayXp,
      baseCombatXp: m.baseCombatXp,
      minTask: m.minTask,
      maxTask: m.maxTask,
      avgKills: m.avgKills,
      effectiveKills: effectiveKills,
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

    // Toggle introspection column visibility
    var table = document.getElementById('tasks-table');
    table.classList.toggle('introspection-active', state.boosts.slayerIntrospection);
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
      tbody.innerHTML = '<tr><td colspan="12" class="no-results">No creatures found.</td></tr>';
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
      sep.innerHTML = '<td colspan="12" class="blocked-label">Blocked (' + blocked.length + ')</td>';
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
      tbody.innerHTML = '<tr><td colspan="12" class="no-results">No tasks found.</td></tr>';
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
      sep.innerHTML = '<td colspan="12" class="blocked-label">Blocked (' + blocked.length + ')</td>';
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
    var isSkipped = state.skip.has(g.cat.id);

    var tr = document.createElement('tr');
    tr.className = 'task-group-row';
    if (isBlockedSection) tr.classList.add('blocked-row');
    if (g.allLocked) tr.classList.add('locked-row');
    if (isSkipped) tr.classList.add('skipped-row');
    if (g.isPreferred && !g.allLocked) tr.style.borderLeft = '3px solid var(--green)';
    if (g.monsters.length > 1) tr.style.cursor = 'pointer';

    var monsterNames = g.monsters.map(function (mon) { return mon.name; });
    var uniqueNames = [];
    monsterNames.forEach(function (n) { if (uniqueNames.indexOf(n) === -1) uniqueNames.push(n); });
    var subLabel = g.monsters.length > 1 ? '<span class="task-monsters-list">' + uniqueNames.join(', ') + '</span>' : '';

    // Get best icon for this task category
    var iconName = getBestIconForCategory(g.cat);
    var icon = monsterIcon(iconName);

    tr.innerHTML =
      '<td class="' + lockedClass + '">' +
        (rank !== '' ? '<span class="row-rank">' + rank + '</span>' : '') +
        icon +
        '<span class="expand-icon">' + expandIcon + '</span>' +
        '<span class="creature-name">' + g.cat.label + '</span>' +
        (g.isPreferred && !g.allLocked ? ' <span class="prefer-tag">PREFER</span>' : '') +
        (g.allLocked ? ' <span class="locked-tag">LOCKED</span>' : '') +
        subLabel +
      '</td>' +
      '<td class="' + hl('kph') + '">' + fmt(m.kph) + '</td>' +
      '<td class="intro-cell"><button class="intro-btn ' + (state.introspectionChoices[g.cat.id] || 'max') + '" data-cat="' + g.cat.id + '">' + (state.introspectionChoices[g.cat.id] || 'max').toUpperCase() + '</button></td>' +
      '<td class="' + lockedClass + hl('slayXpHr') + '">' + fmt(m.slayXpHr) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpHr') + '">' + fmt(m.combatXpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpHr') + '">' + fmt(m.gpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpTask') + '">' + fmt(m.gpTask) + '</td>' +
      '<td class="' + lockedClass + hl('slayXpTask') + '">' + fmt(m.slayXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpTask') + '">' + fmt(m.combatXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('minsTask') + '">' + m.minsTask.toFixed(1) + '</td>' +
      '<td class="scrim-cell"></td>' +
      '<td class="skip-cell"><input type="checkbox" class="skip-toggle" data-cat="' + g.cat.id + '"' + (isSkipped ? ' checked' : '') + '></td>';

    if (g.monsters.length > 1) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.scrim-toggle') || e.target.closest('.skip-toggle') || e.target.closest('.intro-btn')) return;
        if (expanded) {
          state.expandedTasks.delete(g.cat.id);
        } else {
          state.expandedTasks.add(g.cat.id);
        }
        renderTasksTable();
      });
    }

    // Skip toggle event
    var skipToggle = tr.querySelector('.skip-toggle');
    if (skipToggle) {
      skipToggle.addEventListener('click', function (e) { e.stopPropagation(); });
      skipToggle.addEventListener('change', function () {
        toggleSkip(g.cat.id);
      });
    }

    // Introspection toggle event
    var introBtn = tr.querySelector('.intro-btn');
    if (introBtn) {
      introBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var catId = introBtn.dataset.cat;
        var current = state.introspectionChoices[catId] || 'max';
        state.introspectionChoices[catId] = current === 'max' ? 'min' : 'max';
        saveState();
        updateAll();
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
      (function () {
        var catId = getCategoryForMonster(m.name);
        if (!catId) return '<td class="intro-cell"></td>';
        var choice = state.introspectionChoices[catId] || 'max';
        return '<td class="intro-cell"><button class="intro-btn ' + choice + '" data-cat="' + catId + '">' + choice.toUpperCase() + '</button></td>';
      })() +
      '<td class="' + lockedClass + hl('slayXpHr') + '">' + fmt(m.slayXpHr) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpHr') + '">' + fmt(m.combatXpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpHr') + '">' + fmt(m.gpHr) + '</td>' +
      '<td class="gp-col' + lockedClass + hl('gpTask') + '">' + fmt(m.gpTask) + '</td>' +
      '<td class="' + lockedClass + hl('slayXpTask') + '">' + fmt(m.slayXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('combatXpTask') + '">' + fmt(m.combatXpTask) + '</td>' +
      '<td class="' + lockedClass + hl('minsTask') + '">' + m.minsTask.toFixed(1) + '</td>' +
      '<td class="scrim-cell"><input type="checkbox" class="scrim-toggle" data-key="' + m._key + '"' + scrimChecked + '></td>' +
      (function () {
        if (m.cluster) return '<td class="skip-cell"></td>';
        var catId = getCategoryForMonster(m.name);
        var skipChecked = catId && state.skip.has(catId) ? ' checked' : '';
        return '<td class="skip-cell"><input type="checkbox" class="skip-toggle" data-cat="' + (catId || '') + '"' + skipChecked + '></td>';
      })()
    );
  }

  function attachRowEvents(tr, m) {
    var kphCell = tr.querySelector('.kph-cell');
    if (kphCell) {
      kphCell.addEventListener('click', function (e) {
        if (e.target.classList.contains('kph-reset')) {
          delete state.customKph[m._key];
          saveState();
          updateAll();
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
          updateAll();
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
        updateAll();
      });
    }

    var skipToggle = tr.querySelector('.skip-toggle');
    if (skipToggle) {
      skipToggle.addEventListener('click', function (e) { e.stopPropagation(); });
      skipToggle.addEventListener('change', function () {
        var catId = skipToggle.dataset.cat;
        if (catId) toggleSkip(catId);
      });
    }

    var introBtn = tr.querySelector('.intro-btn');
    if (introBtn) {
      introBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var catId = introBtn.dataset.cat;
        var current = state.introspectionChoices[catId] || 'max';
        state.introspectionChoices[catId] = current === 'max' ? 'min' : 'max';
        saveState();
        updateAll();
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
  function getBestForCategory(catId, metric) {
    var cat = TASK_CATEGORIES.find(function (c) { return c.id === catId; });
    if (!cat) return 0;
    var best = 0;
    cat.monsters.forEach(function (mName) {
      MONSTERS.filter(function (m) { return m.name === mName && !m.cluster; }).forEach(function (m) {
        var computed = computeMonster(m);
        if (!computed._locked) {
          var val = computed[metric] || 0;
          if (val > best) best = val;
        }
      });
    });
    return best;
  }

  // Auto-fill: keeps pinned tasks, fills remaining slots by metric
  function runAutoFill() {
    var preferMetric = state.autoPreferMetric;
    var blockMetric = state.autoBlockMetric;

    // Compute scores for all categories
    var metric = preferMetric || blockMetric || 'slayXpHr';
    var scored = TASK_CATEGORIES.map(function (cat) {
      return { id: cat.id, score: getBestForCategory(cat.id, metric) };
    });

    // Auto-fill prefer: keep pinned, fill rest by best metric
    if (preferMetric) {
      var preferScored = TASK_CATEGORIES.map(function (cat) {
        return { id: cat.id, score: getBestForCategory(cat.id, preferMetric) };
      });
      preferScored.sort(function (a, b) { return b.score - a.score; });

      var newPrefer = new Set(state.pinnedPrefer);
      for (var i = 0; i < preferScored.length && newPrefer.size < MAX_PREFER; i++) {
        var id = preferScored[i].id;
        if (!newPrefer.has(id) && !state.block.has(id) && !state.skip.has(id) && preferScored[i].score > 0 && isCategoryEligible(id)) {
          newPrefer.add(id);
        }
      }
      state.prefer = newPrefer;
    }

    // Auto-fill block: keep pinned, fill rest by worst metric
    if (blockMetric) {
      var blockScored = TASK_CATEGORIES.map(function (cat) {
        return { id: cat.id, score: getBestForCategory(cat.id, blockMetric) };
      });
      blockScored.sort(function (a, b) { return a.score - b.score; });

      var newBlock = new Set(state.pinnedBlock);
      for (var j = 0; j < blockScored.length && newBlock.size < MAX_BLOCK; j++) {
        var bid = blockScored[j].id;
        if (!newBlock.has(bid) && !state.prefer.has(bid) && !state.skip.has(bid) && isCategoryEligible(bid)) {
          newBlock.add(bid);
        }
      }
      state.block = newBlock;
    }

    saveState();
    renderPrefBlock();
    renderTasksTable();
    updateWeightedAverage();
  }

  // Add task to prefer (pinned), evicting worst non-pinned if full
  function pinPrefer(catId) {
    if (state.block.has(catId)) { state.block.delete(catId); state.pinnedBlock.delete(catId); }
    state.skip.delete(catId);
    state.pinnedPrefer.add(catId);
    state.prefer.add(catId);

    // Evict worst non-pinned if over limit
    if (state.prefer.size > MAX_PREFER) {
      var metric = state.autoPreferMetric || 'slayXpHr';
      var worst = null;
      var worstScore = Infinity;
      state.prefer.forEach(function (id) {
        if (state.pinnedPrefer.has(id)) return;
        var score = getBestForCategory(id, metric);
        if (score < worstScore) { worstScore = score; worst = id; }
      });
      if (worst) state.prefer.delete(worst);
    }
    saveState();
    runAutoFill();
  }

  // Add task to block (pinned), evicting worst non-pinned if full
  function pinBlock(catId) {
    if (state.prefer.has(catId)) { state.prefer.delete(catId); state.pinnedPrefer.delete(catId); }
    state.skip.delete(catId);
    state.pinnedBlock.add(catId);
    state.block.add(catId);

    if (state.block.size > MAX_BLOCK) {
      var metric = state.autoBlockMetric || 'slayXpHr';
      var worst = null;
      var worstScore = -Infinity;
      state.block.forEach(function (id) {
        if (state.pinnedBlock.has(id)) return;
        var score = getBestForCategory(id, metric);
        if (score > worstScore) { worstScore = score; worst = id; }
      });
      if (worst) state.block.delete(worst);
    }
    saveState();
    runAutoFill();
  }

  function unpinPrefer(catId) {
    state.pinnedPrefer.delete(catId);
    state.prefer.delete(catId);
    saveState();
    runAutoFill();
  }

  function unpinBlock(catId) {
    state.pinnedBlock.delete(catId);
    state.block.delete(catId);
    saveState();
    runAutoFill();
  }

  function toggleSkip(catId) {
    if (state.skip.has(catId)) {
      state.skip.delete(catId);
    } else {
      state.skip.add(catId);
      // Remove from prefer/block if skipped
      state.prefer.delete(catId); state.pinnedPrefer.delete(catId);
      state.block.delete(catId); state.pinnedBlock.delete(catId);
    }
    saveState();
    runAutoFill();
  }

  function renderPrefBlock() {
    var preferList = document.getElementById('prefer-list');
    var blockList = document.getElementById('block-list');
    var unassignedList = document.getElementById('unassigned-list');
    if (!preferList) return;

    preferList.innerHTML = '';
    blockList.innerHTML = '';
    unassignedList.innerHTML = '';

    var searchInput = document.getElementById('unassigned-search');
    var searchQ = searchInput ? searchInput.value.toLowerCase() : '';

    TASK_CATEGORIES.forEach(function (cat) {
      var bestVal = getBestForCategory(cat.id, state.sortCol || 'slayXpHr');
      var statLabel = bestVal > 0 ? ' <span class="chip-stat">' + fmtShort(bestVal) + '</span>' : '';
      var isPinned, chip;

      if (state.prefer.has(cat.id)) {
        isPinned = state.pinnedPrefer.has(cat.id);
        chip = document.createElement('div');
        chip.className = 'task-chip';
        chip.innerHTML =
          '<span>' + cat.label + statLabel +
            (isPinned ? '<span class="pin-icon" title="Manually pinned">\uD83D\uDD12</span>' : '') +
          '</span>' +
          '<div class="chip-actions"><button class="chip-btn remove-btn" title="Remove">&times;</button></div>';
        chip.querySelector('.remove-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          unpinPrefer(cat.id);
        });
        preferList.appendChild(chip);

      } else if (state.block.has(cat.id)) {
        isPinned = state.pinnedBlock.has(cat.id);
        chip = document.createElement('div');
        chip.className = 'task-chip';
        chip.innerHTML =
          '<span>' + cat.label + statLabel +
            (isPinned ? '<span class="pin-icon" title="Manually pinned">\uD83D\uDD12</span>' : '') +
          '</span>' +
          '<div class="chip-actions"><button class="chip-btn remove-btn" title="Remove">&times;</button></div>';
        chip.querySelector('.remove-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          unpinBlock(cat.id);
        });
        blockList.appendChild(chip);

      } else {
        // Unassigned
        if (searchQ && cat.label.toLowerCase().indexOf(searchQ) === -1) return;

        var isSkipped = state.skip.has(cat.id);
        var isLocked = !isCategoryEligible(cat.id);
        chip = document.createElement('div');
        chip.className = 'task-chip' + (isSkipped ? ' skipped' : '') + (isLocked ? ' locked-chip' : '');
        chip.innerHTML =
          '<span>' + cat.label + statLabel +
            (isSkipped ? ' <span class="skip-tag">SKIP</span>' : '') +
            (isLocked ? ' <span class="locked-tag">LOCKED</span>' : '') +
          '</span>' +
          '<div class="chip-actions">' +
            '<button class="chip-btn prefer-btn" title="Prefer (pin)"' + (isLocked ? ' disabled' : '') + '>+</button>' +
            '<button class="chip-btn block-btn" title="Block (pin)">&minus;</button>' +
          '</div>';
        if (!isLocked) {
          chip.querySelector('.prefer-btn').addEventListener('click', function (e) { e.stopPropagation(); pinPrefer(cat.id); });
        }
        chip.querySelector('.block-btn').addEventListener('click', function (e) { e.stopPropagation(); pinBlock(cat.id); });
        unassignedList.appendChild(chip);
      }
    });

    document.getElementById('prefer-count').textContent = state.prefer.size;
    document.getElementById('block-count').textContent = state.block.size;
  }

  // ── Weighted Average XP/Hr ──────────────────────────────────────────

  // Map LANIAKEA_WEIGHTS keys → category IDs (handles name mismatches)
  var WEIGHT_KEY_TO_CAT = {
    "Lost Grove Creatures": "lost_grove",
    "Acheron Mammoths": "acheron_mammoths",
    "Elves": "elves",
    "Shadow Creatures": "shadow_creatures",
    "Nightmares": "nightmares",
    "Lava Strykewyrms": "strykewyrms",
    "Vile Blooms": "vile_blooms",
    "Crystal Shapeshifters": "crystal_shapeshifters",
    "Soul Devourers": "soul_devourers",
    "Camel Warriors": "camel_warriors",
    "Living Wyverns": "living_wyverns",
    "Corrupted Workers": "corrupted_creatures",
    "Soulgazers": "soulgazers",
    "Creatures of Daemonheim": "daemonheim",
    "Edimmus": "edimmus",
    "Airuts": "airuts",
    "Aviansies": "aviansies",
    "Chaos Giants": "chaos_giants",
    "Cresbots": "cresbots",
    "Dagannoths": "dagannoths",
    "Dark Beasts": "dark_beasts",
    "Dinosaurs": "dinosaurs",
    "Black Demons": "black_demons",
    "Abyssal Demons": "abyssal_demons",
    "Kal'gerion Demons": "kalgerion_demons",
    "Ripper Demons": "ripper_demons",
    "Greater Demons": "greater_demons",
    "Black Dragons": "black_dragons",
    "Celestial Dragons": "celestial_dragons",
    "Rune Dragons": "rune_dragons",
    "Adamant Dragons": "adamant_dragons",
    "Gemstone Dragons": "gemstone_dragons",
    "Nodon Dragonkin": "nodon",
    "Ganodermic Creatures": "ganodermic",
    "Gargoyles": "gargoyles",
    "Ice Strykewyrms": "strykewyrms",
    "Iron Dragons": "iron_dragons",
    "Kalphites": "kalphites",
    "Mithril Dragons": "mithril_dragons",
    "Mutated Jadinkos": "jadinkos",
    "Order of Ascension": "ascension",
    "Steel Dragons": "steel_dragons",
    "Vyrewatch": "vyrewatch",
    "Profane Scabarites": "scabarites",
  };

  // Cluster tasks that span multiple categories (player picks best monster)
  var CLUSTER_WEIGHT_CATS = {
    "Demons": ["black_demons", "abyssal_demons", "kalgerion_demons", "ripper_demons", "greater_demons"],
    "Dragons": ["black_dragons", "celestial_dragons", "rune_dragons", "adamant_dragons", "gemstone_dragons", "iron_dragons", "mithril_dragons", "steel_dragons", "nodon"],
    "Strykewyrms": ["strykewyrms"],
  };

  function updateWeightedAverage() {
    var bar = document.getElementById('weighted-avg-bar');
    if (!bar) return;
    if (typeof LANIAKEA_WEIGHTS === 'undefined') return;

    var excludedSet = new Set();
    state.block.forEach(function (id) { excludedSet.add(id); });
    state.skip.forEach(function (id) { excludedSet.add(id); });

    // Check if persuade tasks are unlocked
    var persuadeSet = new Set(PERSUADE_TASKS);

    // Build entries from each LANIAKEA_WEIGHTS key
    var entries = [];
    var totalWeight = 0;
    var preferWeight = 0;

    for (var wKey in LANIAKEA_WEIGHTS) {
      var w = LANIAKEA_WEIGHTS[wKey];
      var catId = WEIGHT_KEY_TO_CAT[wKey];
      var clusterCats = CLUSTER_WEIGHT_CATS[wKey];

      var slayXpHr = 0, combatXpHr = 0, gpHr = 0;
      var isExcluded = false;
      var isPreferred = false;

      if (catId) {
        // Single category mapping
        if (excludedSet.has(catId)) { isExcluded = true; }
        if (persuadeSet.has(catId) && !state.persuadeUnlocks.has(catId)) { isExcluded = true; }
        if (!isExcluded) {
          isPreferred = state.prefer.has(catId);
          slayXpHr = getBestForCategory(catId, 'slayXpHr');
          combatXpHr = getBestForCategory(catId, 'combatXpHr');
          gpHr = getBestForCategory(catId, 'gpHr');
        }
      } else if (clusterCats) {
        // Cluster: excluded only if ALL sub-categories are excluded/locked
        var eligible = clusterCats.filter(function (id) {
          if (excludedSet.has(id)) return false;
          if (persuadeSet.has(id) && !state.persuadeUnlocks.has(id)) return false;
          return true;
        });
        if (eligible.length === 0) { isExcluded = true; }
        if (!isExcluded) {
          // Use best XP/hr across eligible sub-categories
          eligible.forEach(function (id) {
            slayXpHr = Math.max(slayXpHr, getBestForCategory(id, 'slayXpHr'));
            combatXpHr = Math.max(combatXpHr, getBestForCategory(id, 'combatXpHr'));
            gpHr = Math.max(gpHr, getBestForCategory(id, 'gpHr'));
          });
        }
      } else {
        continue; // Unknown key, skip
      }

      if (isExcluded) continue;

      totalWeight += w;
      if (isPreferred) preferWeight += w;
      entries.push({ w: w, isPreferred: isPreferred, slayXpHr: slayXpHr, combatXpHr: combatXpHr, gpHr: gpHr });
    }

    if (totalWeight === 0) {
      bar.innerHTML = '<div class="avg-item"><span class="avg-label">No eligible tasks</span></div>';
      return;
    }

    // Double-roll prefer mechanic (silent second roll):
    //   P(preferred task i) = pi * (2 - Sp/S)
    //   P(non-preferred task j) = pj * (1 - Sp/S)
    // where pi = wi/S, Sp = sum of preferred weights, S = totalWeight
    var spRatio = preferWeight / totalWeight;
    var avgSlay = 0, avgCombat = 0, avgGp = 0;

    entries.forEach(function (e) {
      var basePct = e.w / totalWeight;
      var pct = e.isPreferred ? basePct * (2 - spRatio) : basePct * (1 - spRatio);
      avgSlay += pct * e.slayXpHr;
      avgCombat += pct * e.combatXpHr;
      avgGp += pct * e.gpHr;
    });

    bar.innerHTML =
      '<div class="avg-item"><span class="avg-label">Weighted Avg Slay XP/Hr</span> <span class="avg-value">' + fmtShort(Math.round(avgSlay)) + '</span></div>' +
      '<div class="avg-item"><span class="avg-label">Weighted Avg Combat XP/Hr</span> <span class="avg-value">' + fmtShort(Math.round(avgCombat)) + '</span></div>' +
      '<div class="avg-item"><span class="avg-label">Weighted Avg GP/Hr</span> <span class="avg-value">' + fmtShort(Math.round(avgGp)) + '</span></div>';
  }

  // ── Persuade Toggles ──────────────────────────────────────────────
  function togglePersuade(taskId) {
    if (state.persuadeUnlocks.has(taskId)) {
      state.persuadeUnlocks.delete(taskId);
    } else {
      state.persuadeUnlocks.add(taskId);
    }
    window._persuadeUnlocks = state.persuadeUnlocks;
    saveState();
    renderPersuadeToggles();
    updateAll();
  }

  function renderPersuadeToggles() {
    // Home tab - full toggles
    var container = document.getElementById('persuade-toggles');
    if (container) {
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
        item.addEventListener('click', function () { togglePersuade(taskId); });
        container.appendChild(item);
      });
    }

    // Slayer Tasks tab - compact chips
    var tasksBar = document.getElementById('persuade-toggles-tasks');
    if (tasksBar) {
      tasksBar.innerHTML = '';
      PERSUADE_TASKS.forEach(function (taskId) {
        var cat = TASK_CATEGORIES.find(function (c) { return c.id === taskId; });
        if (!cat) return;

        var unlocked = state.persuadeUnlocks.has(taskId);
        var chip = document.createElement('div');
        chip.className = 'persuade-chip' + (unlocked ? ' active' : '');
        chip.innerHTML =
          '<span class="persuade-dot"></span>' +
          '<span>' + cat.label + '</span>';
        chip.addEventListener('click', function () { togglePersuade(taskId); });
        tasksBar.appendChild(chip);
      });
    }
  }

  function initPrefBlockControls() {
    var preferSel = document.getElementById('auto-prefer-metric');
    var blockSel = document.getElementById('auto-block-metric');

    if (preferSel) {
      preferSel.value = state.autoPreferMetric || '';
      preferSel.addEventListener('change', function () {
        state.autoPreferMetric = preferSel.value;
        saveState();
        runAutoFill();
      });
    }

    if (blockSel) {
      blockSel.value = state.autoBlockMetric || '';
      blockSel.addEventListener('change', function () {
        state.autoBlockMetric = blockSel.value;
        saveState();
        runAutoFill();
      });
    }

    var searchInput = document.getElementById('unassigned-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        renderPrefBlock();
      });
    }

    document.getElementById('reset-prefs').addEventListener('click', function () {
      state.prefer = new Set(DEFAULT_PREFER);
      state.block = new Set(DEFAULT_BLOCK);
      state.pinnedPrefer = new Set();
      state.pinnedBlock = new Set();
      state.skip = new Set();
      state.autoPreferMetric = '';
      state.autoBlockMetric = '';
      if (preferSel) preferSel.value = '';
      if (blockSel) blockSel.value = '';
      saveState();
      renderPrefBlock();
      renderTasksTable();
      updateWeightedAverage();
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

  // ── Ultimate Slayer Tab ────────────────────────────────────────────
  function getUltimateImagePath(itemName) {
    var slug = itemName.replace(/\s+/g, '_');
    return 'images/ultimate/' + slug + '.png';
  }

  function countObtainedInArea(area) {
    var count = 0;
    area.drops.forEach(function (d) {
      if (state.ultimateObtained[d.item]) count++;
    });
    return count;
  }

  function countTotalObtained() {
    var count = 0;
    ULTIMATE_AREAS.forEach(function (area) {
      count += countObtainedInArea(area);
    });
    return count;
  }

  function countTotalItems() {
    var count = 0;
    ULTIMATE_AREAS.forEach(function (area) {
      count += area.drops.length;
    });
    return count;
  }

  function renderUltimateProgress() {
    var container = document.getElementById('ultimate-progress');
    var obtained = countTotalObtained();
    var total = countTotalItems();
    var pct = total > 0 ? (obtained / total * 100) : 0;
    container.innerHTML =
      '<span class="ultimate-progress-text">Overall: <strong>' + obtained + ' / ' + total + '</strong> items obtained</span>' +
      '<div class="ultimate-progress-track">' +
        '<div class="ultimate-progress-fill" style="width:' + pct.toFixed(1) + '%"></div>' +
      '</div>';
  }

  function renderUltimateAreaTabs() {
    var container = document.getElementById('ultimate-area-tabs');
    container.innerHTML = '';
    ULTIMATE_AREAS.forEach(function (area) {
      var btn = document.createElement('button');
      btn.className = 'ultimate-area-btn' + (state.ultimateActiveArea === area.id ? ' active' : '');
      var obtained = countObtainedInArea(area);
      btn.innerHTML = area.name + '<span class="area-count">' + obtained + '/' + area.drops.length + '</span>';
      btn.addEventListener('click', function () {
        state.ultimateActiveArea = area.id;
        saveState();
        renderUltimateTab();
      });
      container.appendChild(btn);
    });
  }

  function renderUltimateItems() {
    var area = ULTIMATE_AREAS.find(function (a) { return a.id === state.ultimateActiveArea; });
    if (!area) return;

    var titleEl = document.getElementById('ultimate-area-title');
    titleEl.textContent = 'Title: ' + area.title;

    var grid = document.getElementById('ultimate-items');
    grid.innerHTML = '';

    area.drops.forEach(function (drop) {
      var isObtained = !!state.ultimateObtained[drop.item];
      var isExpanded = !!state.ultimateExpanded[drop.item];

      var card = document.createElement('div');
      card.className = 'ultimate-card' + (isObtained ? ' obtained' : '') + (isExpanded ? ' expanded' : '');

      var rateDisplay = drop.rate || '\u2014';
      var escapedItem = drop.item.replace(/"/g, '&quot;');

      card.innerHTML =
        '<div class="ultimate-card-header">' +
          '<img class="ultimate-card-img" src="' + getUltimateImagePath(drop.item) + '" alt="" onerror="this.style.display=\'none\'">' +
          '<span class="ultimate-card-name">' + drop.item + '</span>' +
          '<span class="ultimate-card-check" data-item="' + escapedItem + '">' +
            (isObtained ? '&#10003;' : '') +
          '</span>' +
        '</div>' +
        '<div class="ultimate-card-details">' +
          '<div class="ultimate-detail-row">' +
            '<span class="ultimate-detail-label">Monster</span>' +
            '<span class="ultimate-detail-value">' + drop.monster + '</span>' +
          '</div>' +
          '<div class="ultimate-detail-row">' +
            '<span class="ultimate-detail-label">Drop Rate</span>' +
            '<span class="ultimate-detail-value">' + rateDisplay +
              (drop.onTask ? ' <span class="on-task-badge">On-Task</span>' : '') +
            '</span>' +
          '</div>' +
        '</div>';

      // Checkbox click: toggle obtained
      var checkEl = card.querySelector('.ultimate-card-check');
      checkEl.addEventListener('click', function (e) {
        e.stopPropagation();
        if (state.ultimateObtained[drop.item]) {
          delete state.ultimateObtained[drop.item];
        } else {
          state.ultimateObtained[drop.item] = true;
        }
        saveState();
        renderUltimateTab();
      });

      // Header click: expand/collapse
      card.querySelector('.ultimate-card-header').addEventListener('click', function (e) {
        if (e.target.closest('.ultimate-card-check')) return;
        if (state.ultimateExpanded[drop.item]) {
          delete state.ultimateExpanded[drop.item];
        } else {
          state.ultimateExpanded[drop.item] = true;
        }
        card.classList.toggle('expanded');
      });

      grid.appendChild(card);
    });
  }

  function renderUltimateTab() {
    if (typeof ULTIMATE_AREAS === 'undefined') return;
    renderUltimateProgress();
    renderUltimateAreaTabs();
    renderUltimateItems();
  }

  // ── Update All ─────────────────────────────────────────────────────
  function updateAll() {
    updateMultiplierBar();
    updateStatsBar();
    renderTasksTable();
    renderPrefBlock();
    updateWeightedAverage();
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
    renderUltimateTab();
    if (typeof initPlayerLookup === 'function') initPlayerLookup();
    if (typeof initGoalsTab === 'function') initGoalsTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
