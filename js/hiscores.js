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
  { id: 'prayer', name: 'Prayer', maxLevel: 99 },
  { id: 'magic', name: 'Magic', maxLevel: 99 },
  { id: 'summoning', name: 'Summoning', maxLevel: 99 },
  { id: 'necromancy', name: 'Necromancy', maxLevel: 120 },
  { id: 'slayer', name: 'Slayer', maxLevel: 120 },
];

// CORS proxy fallbacks
const CORS_PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

// ── Hiscores Fetch ─────────────────────────────────────────────────
async function fetchHiscores(playerName) {
  const baseUrl = 'https://secure.runescape.com/m=hiscore/index_lite.ws?player=' + encodeURIComponent(playerName);

  for (var i = -1; i < CORS_PROXIES.length; i++) {
    try {
      var proxy = i < 0 ? '' : CORS_PROXIES[i];
      var url = proxy ? proxy + encodeURIComponent(baseUrl) : baseUrl;
      var resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        var text = await resp.text();
        if (text.includes(',')) return parseHiscores(text);
      }
    } catch (e) { /* try next */ }
  }

  throw new Error('Could not fetch hiscores. The RS3 API may be down or blocked by CORS.');
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

  for (var i = -1; i < CORS_PROXIES.length; i++) {
    try {
      var proxy = i < 0 ? '' : CORS_PROXIES[i];
      var url = proxy ? proxy + encodeURIComponent(baseUrl) : baseUrl;
      var resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        var data = await resp.json();
        // API returns { quests: [...] } array
        var quests = data.quests || data;
        if (Array.isArray(quests)) {
          return parseQuests(quests);
        }
      }
    } catch (e) { /* try next */ }
  }

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

// ── Goals Tab UI ───────────────────────────────────────────────────
function initGoalsTab() {
  var container = document.getElementById('goals-content');
  if (!container) return;

  container.innerHTML =
    '<div class="card" style="margin-bottom:1.5rem;">' +
      '<h3 class="section-title" style="margin-bottom:1rem;">Player Lookup</h3>' +
      '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">' +
        '<input type="text" id="player-name" placeholder="Enter RuneScape name..." class="player-input">' +
        '<button id="lookup-btn" class="lookup-btn">Look Up</button>' +
        '<span id="lookup-status" style="font-size:0.8rem;color:var(--text-muted);"></span>' +
      '</div>' +
      '<div id="player-stats" style="margin-top:1rem;display:none;"></div>' +
      '<div id="quest-status" style="margin-top:0.75rem;display:none;"></div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:1.5rem;">' +
      '<h3 class="section-title" style="margin-bottom:1rem;">Goal Calculator</h3>' +
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

  document.getElementById('lookup-btn').addEventListener('click', doLookup);
  document.getElementById('player-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLookup();
  });
  document.getElementById('calc-btn').addEventListener('click', doCalculation);
}

async function doLookup() {
  var nameInput = document.getElementById('player-name');
  var status = document.getElementById('lookup-status');
  var statsDiv = document.getElementById('player-stats');
  var questDiv = document.getElementById('quest-status');
  var name = nameInput.value.trim();

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
      status.textContent = 'Found!';
      status.style.color = 'var(--green)';

      var html = '<div class="player-stats-grid">';
      for (var i = 0; i < GOAL_SKILLS.length; i++) {
        var skill = GOAL_SKILLS[i];
        var data = playerData[skill.id];
        if (data) {
          var img = (typeof IMAGES !== 'undefined' && IMAGES[skill.name])
            ? '<img src="' + IMAGES[skill.name] + '" class="skill-icon" alt="">'
            : '';
          html +=
            '<div class="player-stat-item">' +
              img +
              '<div>' +
                '<div class="stat-skill-name">' + skill.name + '</div>' +
                '<div class="stat-skill-level">Lv ' + data.level + '</div>' +
                '<div class="stat-skill-xp">' + data.xp.toLocaleString() + ' XP</div>' +
              '</div>' +
            '</div>';
        }
      }
      html += '</div>';
      statsDiv.innerHTML = html;
      statsDiv.style.display = 'block';
    } else {
      status.textContent = results[0].reason ? results[0].reason.message : 'Failed to fetch hiscores.';
      status.style.color = 'var(--red)';
      playerData = null;
    }

    // Quests
    if (results[1].status === 'fulfilled' && results[1].value) {
      playerQuests = results[1].value;
      questDiv.innerHTML =
        '<span style="color:var(--green);font-size:0.8rem;">' +
          playerQuests.completed.size + ' quests completed' +
        '</span>';
      questDiv.style.display = 'block';
    } else {
      playerQuests = null;
      questDiv.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Quest data unavailable</span>';
      questDiv.style.display = 'block';
    }

    // Notify app.js to refresh locked state
    if (typeof window.onPlayerLookup === 'function') {
      window.onPlayerLookup(playerData, playerQuests);
    }

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

  var slayerMult = typeof getSlayerMult === 'function' ? getSlayerMult() : 1;
  var combatMult = typeof getCombatMult === 'function' ? getCombatMult() : 1;

  // Find best XP/hr from unlocked monsters only
  var bestSlayXpHr = 0;
  var bestCombatXpHr = 0;
  var bestMonsterSlay = '';
  var bestMonsterCombat = '';

  if (typeof MONSTERS !== 'undefined') {
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
