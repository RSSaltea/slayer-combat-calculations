// RS3 Hiscores Lookup, Quest Checking & Goal Calculator

// XP table - computed using the RS3 formula
const XP_TABLE = (function () {
  const table = [0]; // level 1 = 0 xp
  for (let level = 2; level <= 120; level++) {
    let xp = 0;
    for (let n = 1; n < level; n++) {
      xp += Math.floor(n + 300 * Math.pow(2, n / 7));
    }
    table.push(Math.floor(xp / 4));
  }
  return table;
})();

function xpForLevel(level) {
  if (level < 1) return 0;
  if (level > 120) return 200000000;
  return XP_TABLE[level - 1];
}

function levelForXp(xp) {
  for (let i = XP_TABLE.length - 1; i >= 0; i--) {
    if (xp >= XP_TABLE[i]) return i + 1;
  }
  return 1;
}

// Skill indices in the hiscores CSV response
const SKILL_INDICES = {
  overall: 0,
  attack: 1,
  defence: 2,
  strength: 3,
  constitution: 4,
  ranged: 5,
  prayer: 6,
  magic: 7,
  slayer: 19,
  summoning: 24,
  necromancy: 29,
};

// Skills available for the goal calculator
const GOAL_SKILLS = [
  { id: 'attack', name: 'Attack', maxLevel: 99 },
  { id: 'strength', name: 'Strength', maxLevel: 99 },
  { id: 'defence', name: 'Defence', maxLevel: 99 },
  { id: 'constitution', name: 'Constitution', maxLevel: 99 },
  { id: 'ranged', name: 'Ranged', maxLevel: 99 },
  { id: 'magic', name: 'Magic', maxLevel: 99 },
  { id: 'necromancy', name: 'Necromancy', maxLevel: 120 },
  { id: 'slayer', name: 'Slayer', maxLevel: 120 },
];

// RuneScape's APIs do not allow browser cross-origin reads. GitHub Pages has no
// server component, so requests go through CORS-enabled relays instead. Routes
// are tried in order until one returns usable data; an empty prefix is a direct
// request, kept in case the APIs ever start sending CORS headers.
// json: relay wraps the body in { contents }. plainUrl: relay takes the target
// URL unencoded on its path.
const CORS_ROUTES = [
  { prefix: 'https://api.allorigins.win/get?url=', json: true },
  { prefix: 'https://api.allorigins.win/raw?url=' },
  { prefix: 'https://api.cors.lol/?url=' },
  { prefix: 'https://r.jina.ai/', plainUrl: true },
  { prefix: 'https://api.codetabs.com/v1/proxy?quest=' },
  { prefix: '' },
];

function isLocalDevelopment() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}

function unwrapReaderContent(text) {
  var marker = 'Markdown Content:';
  var markerIndex = text.indexOf(marker);
  return markerIndex === -1 ? text.trim() : text.slice(markerIndex + marker.length).trim();
}

async function fetchViaRoute(route, url, timeoutMs) {
  var response = await fetch(route.prefix + (route.prefix && !route.plainUrl ? encodeURIComponent(url) : url), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('Route unavailable.');
  if (!route.json) return unwrapReaderContent(await response.text());
  var payload = await response.json();
  if (typeof payload.contents !== 'string') throw new Error('Unexpected relay response.');
  return payload.contents;
}

// Returns the first non-null result of parse(text) across all routes, or null.
async function fetchViaRelay(url, timeoutMs, parse) {
  for (var i = 0; i < CORS_ROUTES.length; i++) {
    try {
      var result = parse(await fetchViaRoute(CORS_ROUTES[i], url, timeoutMs));
      if (result) return result;
    } catch (e) { /* try next route */ }
  }
  return null;
}

// ── Hiscores Fetch ─────────────────────────────────────────────────
async function fetchHiscores(playerName) {
  const baseUrl = 'https://secure.runescape.com/m=hiscore/index_lite.ws?player=' + encodeURIComponent(playerName);

  function parse(text) {
    if (!text.includes(',')) return null;
    var skills = parseHiscores(normalizeHiscoresCsv(text));
    return skills.slayer ? skills : null;
  }

  var skills;
  if (isLocalDevelopment()) {
    var response = await fetch('/api/hiscores?player=' + encodeURIComponent(playerName), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Could not fetch hiscores. Check the player name and try again.');
    skills = parse(unwrapReaderContent(await response.text()));
  } else {
    skills = await fetchViaRelay(baseUrl, 8000, parse);
  }
  if (skills) return skills;
  throw new Error('No hiscore data was found. Check the spelling, or enter your stats manually if the lookup service is down.');
}

// Reader relays sometimes collapse the source CSV's newlines into spaces.
// The first 30 RS3 hiscore records (through Necromancy) are always rank,level,xp.
function normalizeHiscoresCsv(csv) {
  var lines = csv.trim().split(/\r?\n/);
  if (lines.length >= 30) return csv;
  var skillRows = csv.match(/-?\d+,-?\d+,-?\d+(?=\s|$)/g);
  return skillRows && skillRows.length >= 30 ? skillRows.join('\n') : csv;
}

function parseHiscores(csv) {
  var lines = csv.trim().split('\n');
  var skills = {};

  for (var skillId in SKILL_INDICES) {
    var index = SKILL_INDICES[skillId];
    if (index < lines.length) {
      var parts = lines[index].split(',');
      skills[skillId] = {
        rank: parseInt(parts[0]) || -1,
        level: parseInt(parts[1]) || 1,
        xp: parseInt(parts[2]) || 0,
      };
    }
  }

  return skills;
}

// ── Quest Fetch (RuneMetrics API) ──────────────────────────────────
async function fetchQuests(playerName) {
  var baseUrl = 'https://apps.runescape.com/runemetrics/quests?user=' + encodeURIComponent(playerName);

  function parse(text) {
    var data = JSON.parse(text);
    // API returns { quests: [...] } array
    var quests = data.quests || data;
    return Array.isArray(quests) ? parseQuests(quests) : null;
  }

  try {
    if (isLocalDevelopment()) {
      var response = await fetch('/api/quests?user=' + encodeURIComponent(playerName), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      return parse(unwrapReaderContent(await response.text()));
    }
    return await fetchViaRelay(baseUrl, 5000, parse);
  } catch (e) { /* Quest data is optional. */ }

  // Return null if we can't fetch quests (non-fatal)
  return null;
}

function parseQuests(questArray) {
  var completed = new Set();
  var started = new Set();

  questArray.forEach(function (q) {
    var title = q.title || q.name || '';
    if (q.status === 'COMPLETED') {
      completed.add(title);
    } else if (q.status === 'STARTED') {
      started.add(title);
    }
  });

  return { completed: completed, started: started };
}

// ── Check if a monster is locked for a player ──────────────────────
// Returns { locked: bool, reasons: string[] }
function checkMonsterLocked(monsterName, playerSkills, playerQuests, persuadeUnlocks) {
  var req = (typeof UNLOCK_REQUIREMENTS !== 'undefined') ? UNLOCK_REQUIREMENTS[monsterName] : null;
  if (!req) return { locked: false, reasons: [] };

  var reasons = [];

  // Check slayer level
  if (req.slayerLevel && playerSkills) {
    var slayerData = playerSkills.slayer;
    if (slayerData && slayerData.level < req.slayerLevel) {
      reasons.push('Slayer ' + req.slayerLevel + ' required (have ' + slayerData.level + ')');
    }
  }

  // Check quests
  if (req.quests && playerQuests) {
    req.quests.forEach(function (questName) {
      if (!playerQuests.completed.has(questName)) {
        reasons.push('Quest: ' + questName);
      }
    });
  }

  // Check persuade unlock
  if (req.persuade && persuadeUnlocks) {
    // Find which task category this monster belongs to
    var taskId = null;
    if (typeof TASK_CATEGORIES !== 'undefined') {
      TASK_CATEGORIES.forEach(function (cat) {
        if (cat.monsters.indexOf(monsterName) !== -1) {
          taskId = cat.id;
        }
      });
    }
    if (taskId && !persuadeUnlocks.has(taskId)) {
      reasons.push('Persuade unlock required');
    }
  }

  return { locked: reasons.length > 0, reasons: reasons };
}

// ── Goal Calculator ────────────────────────────────────────────────
function calculateGoal(currentXp, goalType, goalValue, xpPerHour) {
  var targetXp;
  if (goalType === 'level') {
    targetXp = xpForLevel(goalValue);
  } else {
    targetXp = goalValue;
  }

  var xpNeeded = Math.max(0, targetXp - currentXp);
  var hoursNeeded = xpPerHour > 0 ? xpNeeded / xpPerHour : Infinity;

  return {
    currentXp: currentXp,
    currentLevel: levelForXp(currentXp),
    targetXp: targetXp,
    targetLevel: levelForXp(targetXp),
    xpNeeded: xpNeeded,
    hoursNeeded: hoursNeeded,
    minutesNeeded: hoursNeeded * 60,
  };
}

// ── Player data (shared across tabs) ───────────────────────────────
var playerData = null;   // hiscores skills
var playerQuests = null; // quest completion data
var playerName = '';

// All skills to display in the lookup stats grid
var DISPLAY_SKILLS = [
  { id: 'attack', name: 'Attack' },
  { id: 'strength', name: 'Strength' },
  { id: 'defence', name: 'Defence' },
  { id: 'constitution', name: 'Constitution' },
  { id: 'ranged', name: 'Ranged' },
  { id: 'magic', name: 'Magic' },
  { id: 'necromancy', name: 'Necromancy' },
  { id: 'slayer', name: 'Slayer' },
];

// ── Player Lookup (Home tab) ──────────────────────────────────────
function initPlayerLookup() {
  var btn = document.getElementById('lookup-btn');
  var nameInput = document.getElementById('player-name');
  var manualBtn = document.getElementById('manual-stats-btn');
  if (!btn || !nameInput || !manualBtn) return;

  btn.addEventListener('click', doLookup);
  manualBtn.addEventListener('click', toggleManualStats);
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLookup();
  });
  renderManualStats();
  if (Object.keys(getSavedManualSkills()).length) applyManualStats(true);
  else restorePlayerProfile();
}

function savePlayerProfile() {
  if (!playerData || playerName === 'manual') return;
  var quests = playerQuests ? {
    completed: Array.from(playerQuests.completed),
    started: Array.from(playerQuests.started),
  } : null;
  try {
    localStorage.setItem('slayerCalcPlayerProfile', JSON.stringify({ name: playerName, skills: playerData, quests: quests }));
  } catch (e) { /* Local storage is optional. */ }
}

function restorePlayerProfile() {
  try {
    var saved = JSON.parse(localStorage.getItem('slayerCalcPlayerProfile'));
    if (!saved || !saved.skills || !saved.skills.slayer) return;
    playerData = saved.skills;
    playerName = saved.name || '';
    playerQuests = saved.quests ? {
      completed: new Set(saved.quests.completed || []),
      started: new Set(saved.quests.started || []),
    } : null;
    var nameInput = document.getElementById('player-name');
    if (nameInput) nameInput.value = playerName;
    renderManualStats(playerData);
    renderPlayerStats();
    var status = document.getElementById('lookup-status');
    status.textContent = 'Restored saved stats.';
    status.style.color = 'var(--text-muted)';
    if (typeof window.onPlayerLookup === 'function') window.onPlayerLookup(playerData, playerQuests);
  } catch (e) { /* Ignore incomplete or old saved profiles. */ }
}

function renderPlayerStats() {
  var statsDiv = document.getElementById('player-stats');
  if (!statsDiv || !playerData) return;
  var html = '<div class="player-stats-grid">';
  for (var i = 0; i < DISPLAY_SKILLS.length; i++) {
    var skill = DISPLAY_SKILLS[i];
    var data = playerData[skill.id];
    if (!data) continue;
    var img = (typeof IMAGES !== 'undefined' && IMAGES[skill.name])
      ? '<img src="' + IMAGES[skill.name] + '" class="skill-icon" alt="">'
      : '';
    html += '<div class="player-stat-item">' + img + '<div><div class="stat-skill-name">' + skill.name + '</div><div class="stat-skill-level">Lv ' + data.level + '</div><div class="stat-skill-xp">' + data.xp.toLocaleString() + ' XP</div></div></div>';
  }
  statsDiv.innerHTML = html + '</div>';
  statsDiv.style.display = 'block';
}

function getSavedManualSkills() {
  try { return JSON.parse(localStorage.getItem('slayerCalcManualSkills')) || {}; } catch (e) { return {}; }
}

function renderManualStats(values) {
  var container = document.getElementById('manual-stats');
  if (!container) return;
  var saved = values || ((playerData && playerName !== 'manual') ? playerData : getSavedManualSkills());
  var html = '<p>Use this when the player lookup is unavailable. Enter a level, XP, or both; these values are saved in this browser and update task locks and the Goals tab.</p>' +
    '<div class="manual-stats-grid">';
  DISPLAY_SKILLS.forEach(function (skill) {
    var data = saved[skill.id] || {};
    html += '<div class="manual-stat-row"><label for="manual-' + skill.id + '-level">' + skill.name + '</label>' +
      '<input id="manual-' + skill.id + '-level" class="player-input" type="number" min="1" max="120" placeholder="Level" value="' + (data.level || '') + '">' +
      '<input id="manual-' + skill.id + '-xp" class="player-input" type="number" min="0" max="200000000" placeholder="XP" value="' + (data.xp || '') + '"></div>';
  });
  html += '</div><div class="manual-stats-actions"><button id="save-manual-stats" class="lookup-btn" type="button">Use manual stats</button><button id="clear-manual-stats" class="secondary-btn" type="button">Clear</button></div>';
  container.innerHTML = html;
  document.getElementById('save-manual-stats').addEventListener('click', function () { applyManualStats(false); });
  document.getElementById('clear-manual-stats').addEventListener('click', clearManualStats);
}

function toggleManualStats() {
  var container = document.getElementById('manual-stats');
  if (!container) return;
  container.hidden = !container.hidden;
  if (!container.hidden) renderManualStats();
}

function applyManualStats(silent) {
  var skills = {};
  DISPLAY_SKILLS.forEach(function (skill) {
    var level = parseInt(document.getElementById('manual-' + skill.id + '-level').value, 10);
    var xp = parseInt(document.getElementById('manual-' + skill.id + '-xp').value, 10);
    if (!Number.isFinite(xp) && Number.isFinite(level)) xp = xpForLevel(level);
    if (!Number.isFinite(level) && Number.isFinite(xp)) level = levelForXp(xp);
    skills[skill.id] = { rank: -1, level: Math.min(120, Math.max(1, level || 1)), xp: Math.min(200000000, Math.max(0, xp || 0)) };
  });
  localStorage.setItem('slayerCalcManualSkills', JSON.stringify(skills));
  localStorage.removeItem('slayerCalcPlayerProfile');
  playerData = skills;
  playerQuests = null;
  playerName = 'manual';
  var status = document.getElementById('lookup-status');
  status.textContent = silent ? 'Restored manual stats.' : 'Using manual stats.';
  status.style.color = 'var(--green)';
  document.getElementById('player-stats').style.display = 'none';
  if (typeof window.onPlayerLookup === 'function') window.onPlayerLookup(playerData, playerQuests);
}

function clearManualStats() {
  localStorage.removeItem('slayerCalcManualSkills');
  playerData = null;
  playerQuests = null;
  var status = document.getElementById('lookup-status');
  status.textContent = 'Manual stats cleared.';
  status.style.color = 'var(--text-muted)';
  if (typeof window.onPlayerLookup === 'function') window.onPlayerLookup(null, null);
  renderManualStats();
}

// ── Goals Tab UI ───────────────────────────────────────────────────
function initGoalsTab() {
  var container = document.getElementById('goals-content');
  if (!container) return;

  container.innerHTML =
    '<div class="card" style="margin-bottom:1.5rem;">' +
      '<h3 class="section-title" style="margin-bottom:1rem;">Goal Calculator</h3>' +
      '<p class="page-intro">Choose the skills and target you want. Your best currently available task is used for the time estimate.</p>' +
      '<div class="goal-controls">' +
        '<div class="goal-row">' +
          '<label>Skills:</label>' +
          '<div id="skill-checkboxes" class="skill-checks"></div>' +
        '</div>' +
        '<div class="goal-row">' +
          '<label>Goal type:</label>' +
          '<select id="goal-type" class="focus-select">' +
            '<option value="level">Target Level</option>' +
            '<option value="xp">Target XP</option>' +
          '</select>' +
          '<input type="number" id="goal-value" class="goal-input" placeholder="99" value="99" min="1">' +
        '</div>' +
        '<button id="calc-btn" class="lookup-btn">Calculate</button>' +
      '</div>' +
      '<div id="goal-results" style="margin-top:1rem;"></div>' +
    '</div>';

  // Skill checkboxes
  var checksDiv = document.getElementById('skill-checkboxes');
  GOAL_SKILLS.forEach(function (skill) {
    var label = document.createElement('label');
    label.className = 'skill-check-label';
    label.innerHTML =
      '<input type="checkbox" value="' + skill.id + '"' + (skill.id === 'slayer' ? ' checked' : '') + '>' +
      '<span>' + skill.name + '</span>';
    checksDiv.appendChild(label);
  });

  document.getElementById('calc-btn').addEventListener('click', doCalculation);
  document.getElementById('goal-type').addEventListener('change', function (e) {
    var input = document.getElementById('goal-value');
    var isLevel = e.target.value === 'level';
    input.min = '1';
    input.max = isLevel ? '120' : '200000000';
    input.placeholder = isLevel ? '99' : '200000000';
    if (isLevel && parseInt(input.value, 10) > 120) input.value = '99';
  });
}

async function doLookup() {
  var nameInput = document.getElementById('player-name');
  var status = document.getElementById('lookup-status');
  var statsDiv = document.getElementById('player-stats');
  var questDiv = document.getElementById('quest-status');
  var name = nameInput.value.trim();
  var previousPlayerData = playerData;
  var previousPlayerQuests = playerQuests;

  if (!name) {
    status.textContent = 'Please enter a player name.';
    status.style.color = 'var(--red)';
    return;
  }

  status.textContent = 'Looking up...';
  status.style.color = 'var(--text-muted)';
  statsDiv.style.display = 'none';
  questDiv.style.display = 'none';

  try {
    // Fetch hiscores and quests in parallel
    var results = await Promise.allSettled([
      fetchHiscores(name),
      fetchQuests(name),
    ]);

    // Hiscores
    if (results[0].status === 'fulfilled') {
      playerData = results[0].value;
      playerName = name;
      localStorage.removeItem('slayerCalcManualSkills');
      // Keep the manual form useful as an editable copy of the lookup result.
      renderManualStats(playerData);
      status.textContent = 'Found!';
      status.style.color = 'var(--green)';

      renderPlayerStats();
    } else {
      status.textContent = (results[0].reason ? results[0].reason.message : 'Failed to fetch hiscores.') + (previousPlayerData ? ' Keeping your saved stats.' : '');
      status.style.color = 'var(--red)';
      playerData = previousPlayerData;
      playerQuests = previousPlayerQuests;
      if (playerData) renderPlayerStats();
      var manualContainer = document.getElementById('manual-stats');
      if (manualContainer) manualContainer.hidden = false;
    }

    // Quests
    if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled' && results[1].value) {
      playerQuests = results[1].value;
      if (playerQuests.completed.size === 0) {
        // RuneMetrics is private — assume all quests completed
        playerQuests = null;
        questDiv.innerHTML =
          '<span style="color:var(--text-muted);font-size:0.8rem;">' +
            'RuneMetrics private \u2014 assuming all quests completed' +
          '</span>';
      } else {
        questDiv.innerHTML =
          '<span style="color:var(--green);font-size:0.8rem;">' +
            playerQuests.completed.size + ' quests completed' +
          '</span>';
      }
      questDiv.style.display = 'block';
    } else if (results[0].status === 'fulfilled') {
      playerQuests = null;
      questDiv.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Quest data unavailable</span>';
      questDiv.style.display = 'block';
    }

    // Notify app.js to refresh locked state
    if (typeof window.onPlayerLookup === 'function') {
      window.onPlayerLookup(playerData, playerQuests);
    }
    savePlayerProfile();

  } catch (err) {
    status.textContent = err.message;
    status.style.color = 'var(--red)';
    playerData = null;
    playerQuests = null;
  }
}

function doCalculation() {
  var resultsDiv = document.getElementById('goal-results');
  var goalType = document.getElementById('goal-type').value;
  var goalValue = parseInt(document.getElementById('goal-value').value) || 0;

  var selectedSkills = Array.from(
    document.querySelectorAll('#skill-checkboxes input:checked')
  ).map(function (cb) { return cb.value; });

  if (selectedSkills.length === 0) {
    resultsDiv.innerHTML = '<p style="color:var(--red);">Please select at least one skill.</p>';
    return;
  }

  if (goalType === 'level' && (goalValue < 1 || goalValue > 120)) {
    resultsDiv.innerHTML = '<p style="color:var(--red);">Level must be between 1 and 120.</p>';
    return;
  }
  if (goalType === 'xp' && (goalValue < 1 || goalValue > 200000000)) {
    resultsDiv.innerHTML = '<p style="color:var(--red);">XP must be between 1 and 200,000,000.</p>';
    return;
  }

  var slayerMult = typeof getSlayerMult === 'function' ? getSlayerMult() : 1;
  var combatMult = typeof getCombatMult === 'function' ? getCombatMult() : 1;

  // Use the application calculation so goals honour custom KPH, boosts, and per-task scrimshaws.
  var bestSlayXpHr = 0;
  var bestCombatXpHr = 0;
  var bestMonsterSlay = '';
  var bestMonsterCombat = '';

  if (typeof window.getGoalBestRates === 'function') {
    var bestRates = window.getGoalBestRates();
    if (bestRates.slayer) {
      bestSlayXpHr = bestRates.slayer.xpPerHour;
      bestMonsterSlay = bestRates.slayer.name;
    }
    if (bestRates.combat) {
      bestCombatXpHr = bestRates.combat.xpPerHour;
      bestMonsterCombat = bestRates.combat.name;
    }
  } else if (typeof MONSTERS !== 'undefined') {
    MONSTERS.filter(function (m) { return !m.cluster; }).forEach(function (m) {
      // Skip locked monsters
      var lockInfo = checkMonsterLocked(m.name, playerData, playerQuests, window._persuadeUnlocks);
      if (lockInfo.locked) return;

      var slayXpHr = m.baseSlayXp * m.kph * slayerMult;
      var combatXpHr = m.baseCombatXp * m.kph * combatMult;

      if (slayXpHr > bestSlayXpHr) {
        bestSlayXpHr = slayXpHr;
        bestMonsterSlay = m.name;
      }
      if (combatXpHr > bestCombatXpHr) {
        bestCombatXpHr = combatXpHr;
        bestMonsterCombat = m.name;
      }
    });
  }

  var html = '<div class="goal-results-list">';

  selectedSkills.forEach(function (skillId) {
    var skill = GOAL_SKILLS.find(function (s) { return s.id === skillId; });
    var currentXp = playerData && playerData[skillId] ? playerData[skillId].xp : 0;
    var currentLevel = playerData && playerData[skillId] ? playerData[skillId].level : 1;

    var xpPerHour, usingMonster;
    if (skillId === 'slayer') {
      xpPerHour = bestSlayXpHr;
      usingMonster = bestMonsterSlay;
    } else {
      xpPerHour = bestCombatXpHr;
      usingMonster = bestMonsterCombat;
    }

    if (xpPerHour <= 0) {
      html += '<div class="goal-result-card"><div class="goal-skill-name">' + skill.name + '</div><div class="goal-detail">No eligible task is available with the current unlocks and settings.</div></div>';
      return;
    }

    var result = calculateGoal(currentXp, goalType, goalValue, xpPerHour);

    if (result.xpNeeded <= 0) {
      html +=
        '<div class="goal-result-card achieved">' +
          '<div class="goal-skill-name">' + skill.name + '</div>' +
          '<div class="goal-achieved">Already achieved! (Lv ' + currentLevel + ', ' + currentXp.toLocaleString() + ' XP)</div>' +
        '</div>';
    } else {
      var hours = result.hoursNeeded;
      var days = hours / 24;
      var timeStr;
      if (hours < 1) {
        timeStr = Math.ceil(result.minutesNeeded) + ' minutes';
      } else if (hours < 24) {
        timeStr = hours.toFixed(1) + ' hours';
      } else {
        timeStr = days.toFixed(1) + ' days (' + hours.toFixed(1) + ' hrs)';
      }

      html +=
        '<div class="goal-result-card">' +
          '<div class="goal-skill-name">' + skill.name + '</div>' +
          '<div class="goal-detail">Current: Lv ' + currentLevel + ' (' + currentXp.toLocaleString() + ' XP)</div>' +
          '<div class="goal-detail">Target: ' + (goalType === 'level' ? 'Lv ' + goalValue : goalValue.toLocaleString() + ' XP') + ' (' + result.targetXp.toLocaleString() + ' XP)</div>' +
          '<div class="goal-xp-needed">' + result.xpNeeded.toLocaleString() + ' XP needed</div>' +
          '<div class="goal-time">~' + timeStr + '</div>' +
          '<div class="goal-detail" style="color:var(--text-muted);font-size:0.75rem;">' +
            'Using ' + usingMonster + ' at ' + Math.round(xpPerHour).toLocaleString() + ' ' + (skillId === 'slayer' ? 'slay' : 'combat') + ' XP/hr' +
          '</div>' +
        '</div>';
    }
  });

  html += '</div>';

  if (!playerData) {
    html += '<p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem;">Tip: Look up a player first to auto-fill current XP. Without a lookup, calculations start from 0 XP.</p>';
  }

  resultsDiv.innerHTML = html;
}
