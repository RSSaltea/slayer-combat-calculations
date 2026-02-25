// Laniakea Slayer Master - Task Weighting
// Source: AVGData sheet from the spreadsheet
//
// How weighting works:
//   Probability of receiving a task = weight / totalEligibleWeight
//   where totalEligibleWeight = sum of weights of all non-blocked, eligible tasks
//
// Blocking a task removes its weight entirely from the pool, increasing the
// probability of all remaining tasks proportionally.
//
// Preferred tasks use a "silent second roll" mechanic (confirmed by Mod Rowley):
//   1. Roll 1: random task selected by weight/total
//   2. Roll 2: independent random task selected by weight/total
//   3. If either roll lands on a preferred task, that task is assigned
//   4. If neither is preferred, Roll 1 result is used
//
// Effective probability of a preferred task with weight w:
//   P = 1 - (1 - w/S)^2  (approximately 2w/S for small w/S)
//
// VIP Ticket adds a third independent roll (prefer does NOT apply to it),
// giving the player a choice between the prefer-system result and the VIP roll.

const LANIAKEA_WEIGHTS = {
  "Lost Grove Creatures": 24,
  "Acheron Mammoths": 16,
  "Elves": 12,
  "Shadow Creatures": 10,
  "Nightmares": 16,
  "Lava Strykewyrms": 8,
  "Vile Blooms": 9,
  "Crystal Shapeshifters": 12,
  "Soul Devourers": 12,
  "Camel Warriors": 16,
  "Living Wyverns": 16,
  "Corrupted Workers": 10,
  "Soulgazers": 8,
  "Creatures of Daemonheim": 4,
  "Edimmus": 10,
  "Airuts": 10,
  "Aviansies": 9,
  "Chaos Giants": 8,
  "Cresbots": 8,
  "Dagannoths": 10,
  "Dark Beasts": 12,
  "Dinosaurs": 9,
  "Black Demons": 10,
  "Abyssal Demons": 20,
  "Kal'gerion Demons": 5,
  "Ripper Demons": 16,
  "Greater Demons": 11,
  "Demons": 8,
  "Black Dragons": 5,
  "Celestial Dragons": 10,
  "Rune Dragons": 8,
  "Adamant Dragons": 8,
  "Gemstone Dragons": 10,
  "Nodon Dragonkin": 8,
  "Dragons": 4,
  "Ganodermic Creatures": 7,
  "Gargoyles": 8,
  "Ice Strykewyrms": 8,
  "Iron Dragons": 7,
  "Kalphites": 5,
  "Mithril Dragons": 8,
  "Mutated Jadinkos": 8,
  "Order of Ascension": 10,
  "Steel Dragons": 9,
  "Strykewyrms": 4,
  "Undead": 4,
  "Vyrewatch": 7,
  "Profane Scabarites": 12,
};

// Total base weight (all tasks eligible)
const LANIAKEA_TOTAL_WEIGHT = Object.values(LANIAKEA_WEIGHTS).reduce((a, b) => a + b, 0);

// Calculate task probability given current blocked tasks
function getTaskProbability(taskName, blockedTasks = []) {
  const blockedSet = new Set(blockedTasks);
  if (blockedSet.has(taskName)) return 0;

  const eligibleWeight = Object.entries(LANIAKEA_WEIGHTS)
    .filter(([name]) => !blockedSet.has(name))
    .reduce((sum, [, w]) => sum + w, 0);

  const weight = LANIAKEA_WEIGHTS[taskName] || 0;
  return weight / eligibleWeight;
}

// Calculate probability with prefer (double-roll mechanic)
function getPreferredProbability(taskName, blockedTasks = []) {
  const base = getTaskProbability(taskName, blockedTasks);
  // P(preferred) = 1 - (1 - base)^2
  return 1 - Math.pow(1 - base, 2);
}
