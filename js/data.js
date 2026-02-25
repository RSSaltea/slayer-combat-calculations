// Slayer & Combat Calculations - Monster Base Data
// Based on spreadsheet v1.4 by .saltea
// Contributors: mionee, roarroar
//
// All values are BASE (unboosted). Computed values derived at runtime.
// kph = kills per hour, baseSlayXp/baseCombatXp = XP per kill, avgKills = average kills per task
// minTask/maxTask = assignment range from Laniakea (wiki data)

const MONSTERS = [
  // Lost Grove
  { name: "Moss Golems", kph: 990, baseSlayXp: 2408.8, baseCombatXp: 1750, minTask: 100, maxTask: 120, avgKills: 110, category: "lost_grove" },
  // Mammoths
  { name: "Acheron Mammoths", kph: 375, baseSlayXp: 3628.8, baseCombatXp: 2531.2, minTask: 30, maxTask: 55, avgKills: 45, category: "mammoths" },
  // Elves
  { name: "Elves", kph: 1742, baseSlayXp: 608.0, baseCombatXp: 500.0, minTask: 150, maxTask: 180, avgKills: 165, category: "elves" },
  // Shadow
  { name: "Shadow Creatures", kph: 980, baseSlayXp: 929.4, baseCombatXp: 750.0, minTask: 100, maxTask: 150, avgKills: 125, category: "shadow" },
  // Nightmares
  { name: "Nightmares", kph: 900, baseSlayXp: 1540.0, baseCombatXp: 1750.0, minTask: 110, maxTask: 162, avgKills: 130, category: "nightmares" },
  // Strykewyrms
  { name: "Lava Strykewyrms", kph: 520, baseSlayXp: 1896.8, baseCombatXp: 1500.0, minTask: 60, maxTask: 120, avgKills: 90, category: "strykewyrms" },
  { name: "Lava Strykewyrms", kph: 520, baseSlayXp: 1896.8, baseCombatXp: 1500.0, minTask: 101, maxTask: 150, avgKills: 126, category: "strykewyrms", cluster: "Strykewyrms" },
  { name: "Ice Strykewyrms", kph: 450, baseSlayXp: 693.2, baseCombatXp: 1250.0, minTask: 120, maxTask: 240, avgKills: 180, category: "strykewyrms" },
  { name: "Ice Strykewyrms", kph: 450, baseSlayXp: 693.2, baseCombatXp: 1250.0, minTask: 101, maxTask: 150, avgKills: 126, category: "strykewyrms", cluster: "Strykewyrms" },
  // Vile Blooms
  { name: "Vile Blooms", kph: 400, baseSlayXp: 3338.4, baseCombatXp: 3000.0, minTask: 70, maxTask: 110, avgKills: 90, category: "vile_blooms" },
  // Shapeshifters
  { name: "Crystal Shapeshifters", kph: 700, baseSlayXp: 1269.8, baseCombatXp: 1500.0, minTask: 110, maxTask: 150, avgKills: 130, category: "shapeshifters" },
  // Akhs
  { name: "Crocodile Akhs", kph: 1069, baseSlayXp: 761.2, baseCombatXp: 900.0, minTask: 150, maxTask: 250, avgKills: 200, category: "akhs" },
  // Camels
  { name: "Camel Warriors", kph: 300, baseSlayXp: 4768.8, baseCombatXp: 1006.2, minTask: 35, maxTask: 55, avgKills: 45, category: "camels" },
  // Wyverns
  { name: "Living Wyverns", kph: 760, baseSlayXp: 1878.8, baseCombatXp: 1125.0, minTask: 40, maxTask: 65, avgKills: 45, category: "wyverns" },
  // Workers
  { name: "Corrupted Workers", kph: 1049, baseSlayXp: 653.0, baseCombatXp: 750.0, minTask: 150, maxTask: 250, avgKills: 200, category: "workers" },
  // Soulgazers
  { name: "Soulgazers", kph: 420, baseSlayXp: 1950.4, baseCombatXp: 2000.0, minTask: 140, maxTask: 190, avgKills: 125, category: "soulgazers" },
  // Daemonheim
  { name: "Creatures of Daemonheim", kph: 400, baseSlayXp: 1950.4, baseCombatXp: 2000.0, minTask: 101, maxTask: 150, avgKills: 126, category: "daemonheim" },
  // Edimmus
  { name: "Edimmus", kph: 585, baseSlayXp: 880.2, baseCombatXp: 1600.0, minTask: 170, maxTask: 265, avgKills: 218, category: "edimmus" },
  // Airuts
  { name: "Airuts", kph: 1035, baseSlayXp: 800.2, baseCombatXp: 843.7, minTask: 150, maxTask: 180, avgKills: 165, category: "airuts" },
  // Aquanites
  { name: "Aquanites", kph: 340, baseSlayXp: 212.6, baseCombatXp: 350.0, minTask: 195, maxTask: 240, avgKills: 218, category: "aquanites" },
  // Aviansies
  { name: "Aviansies", kph: 500, baseSlayXp: 170.4, baseCombatXp: 491.8, minTask: 150, maxTask: 180, avgKills: 165, category: "aviansies" },
  // Giants
  { name: "Chaos Giants", kph: 450, baseSlayXp: 929.4, baseCombatXp: 1125.0, minTask: 80, maxTask: 120, avgKills: 100, category: "giants" },
  // Cresbots
  { name: "Cresbots", kph: 650, baseSlayXp: 624.0, baseCombatXp: 1000.0, minTask: 80, maxTask: 100, avgKills: 90, category: "cresbots" },
  // Dagannoths
  { name: "Dagannoths", kph: 3100, baseSlayXp: 56.0, baseCombatXp: 138.5, minTask: 205, maxTask: 290, avgKills: 248, category: "dagannoths" },
  // Dark Beasts
  { name: "Dark Beasts", kph: 1200, baseSlayXp: 295.6, baseCombatXp: 425.0, minTask: 180, maxTask: 300, avgKills: 240, category: "dark_beasts" },
  // Dinosaurs
  { name: "Brutish Dinosaurs", kph: 200, baseSlayXp: 3099.4, baseCombatXp: 3500.0, minTask: 70, maxTask: 110, avgKills: 90, category: "dinosaurs" },
  { name: "Feral Dinosaurs", kph: 300, baseSlayXp: 1809.6, baseCombatXp: 2250.0, minTask: 70, maxTask: 110, avgKills: 90, category: "dinosaurs" },
  { name: "Venomous Dinosaurs", kph: 600, baseSlayXp: 1332.4, baseCombatXp: 1750.0, minTask: 70, maxTask: 110, avgKills: 90, category: "dinosaurs" },
  { name: "Ripper Dinosaurs", kph: 200, baseSlayXp: 190.4, baseCombatXp: 3250.0, minTask: 70, maxTask: 110, avgKills: 90, category: "dinosaurs" },
  // Demons
  { name: "Black Demons", kph: 600, baseSlayXp: 294.4, baseCombatXp: 450.0, minTask: 230, maxTask: 300, avgKills: 265, category: "demons" },
  { name: "Black Demons", kph: 600, baseSlayXp: 294.4, baseCombatXp: 450.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Abyssal Demons", kph: 3000, baseSlayXp: 278.0, baseCombatXp: 425.0, minTask: 180, maxTask: 300, avgKills: 240, category: "demons" },
  { name: "Abyssal Demons", kph: 3000, baseSlayXp: 278.0, baseCombatXp: 425.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Abyssal Lords", kph: 290, baseSlayXp: 8235.0, baseCombatXp: 3700.0, minTask: 36, maxTask: 60, avgKills: 48, category: "demons" },
  { name: "Abyssal Lords", kph: 290, baseSlayXp: 8235.0, baseCombatXp: 3700.0, minTask: 20, maxTask: 30, avgKills: 25, category: "demons", cluster: "Demon" },
  { name: "Abyssal Savages", kph: 1680, baseSlayXp: 423.2, baseCombatXp: 750.0, minTask: 180, maxTask: 300, avgKills: 240, category: "demons" },
  { name: "Abyssal Savages", kph: 1680, baseSlayXp: 423.2, baseCombatXp: 750.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Abyssal Beasts", kph: 900, baseSlayXp: 1448.4, baseCombatXp: 1950.0, minTask: 180, maxTask: 300, avgKills: 240, category: "demons" },
  { name: "Abyssal Beasts", kph: 900, baseSlayXp: 1448.4, baseCombatXp: 1950.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Abyssal Beasts and Lords Combo", kph: 753, baseSlayXp: 5928.0, baseCombatXp: 4875.0, minTask: 64, maxTask: 106, avgKills: 85, category: "demons" },
  { name: "Abyssal Beasts and Lords Combo", kph: 753, baseSlayXp: 5928.0, baseCombatXp: 4875.0, minTask: 35, maxTask: 53, avgKills: 44, category: "demons", cluster: "Demon" },
  { name: "Kal'gerion Demons", kph: 435, baseSlayXp: 1858.8, baseCombatXp: 1125.0, minTask: 60, maxTask: 120, avgKills: 90, category: "demons" },
  { name: "Kal'gerion Demons", kph: 435, baseSlayXp: 1858.8, baseCombatXp: 1125.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Ripper Demons", kph: 1700, baseSlayXp: 2721.6, baseCombatXp: 1678.0, minTask: 60, maxTask: 85, avgKills: 65, category: "demons" },
  { name: "Ripper Demons", kph: 1700, baseSlayXp: 2721.6, baseCombatXp: 1678.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Greater Demons", kph: 750, baseSlayXp: 135.4, baseCombatXp: 300.0, minTask: 180, maxTask: 300, avgKills: 240, category: "demons" },
  { name: "Greater Demons", kph: 750, baseSlayXp: 135.4, baseCombatXp: 300.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  { name: "Ash Lord Greater Demons", kph: 150, baseSlayXp: 4400.0, baseCombatXp: 5500.0, minTask: 22, maxTask: 38, avgKills: 30, category: "demons" },
  { name: "Ash Lord Greater Demons", kph: 150, baseSlayXp: 4400.0, baseCombatXp: 5500.0, minTask: 13, maxTask: 19, avgKills: 16, category: "demons", cluster: "Demon" },
  { name: "Tormented Demons", kph: 200, baseSlayXp: 1136.0, baseCombatXp: 1000.0, minTask: 50, maxTask: 75, avgKills: 63, category: "demons" },
  { name: "Tormented Demons", kph: 200, baseSlayXp: 1136.0, baseCombatXp: 1000.0, minTask: 101, maxTask: 150, avgKills: 126, category: "demons", cluster: "Demon" },
  // Dragons
  { name: "Black Dragons", kph: 600, baseSlayXp: 245.0, baseCombatXp: 350.0, minTask: 50, maxTask: 110, avgKills: 80, category: "dragons" },
  { name: "Black Dragons", kph: 600, baseSlayXp: 245.0, baseCombatXp: 350.0, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Celestial Dragons", kph: 650, baseSlayXp: 976.6, baseCombatXp: 1137.5, minTask: 150, maxTask: 180, avgKills: 165, category: "dragons" },
  { name: "Celestial Dragons", kph: 400, baseSlayXp: 976.6, baseCombatXp: 1137.5, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Rune Dragons", kph: 200, baseSlayXp: 2051.0, baseCombatXp: 3412.5, minTask: 50, maxTask: 75, avgKills: 62, category: "dragons" },
  { name: "Rune Dragons", kph: 200, baseSlayXp: 2051.0, baseCombatXp: 3412.5, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Adamant Dragons", kph: 420, baseSlayXp: 655.6, baseCombatXp: 1640.6, minTask: 40, maxTask: 60, avgKills: 50, category: "dragons" },
  { name: "Adamant Dragons", kph: 420, baseSlayXp: 655.6, baseCombatXp: 1640.6, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Hydrix Dragons", kph: 350, baseSlayXp: 4768.8, baseCombatXp: 3000.0, minTask: 80, maxTask: 130, avgKills: 105, category: "dragons" },
  { name: "Hydrix Dragons", kph: 350, baseSlayXp: 4768.8, baseCombatXp: 3000.0, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Nodon Dragonkin", kph: 520, baseSlayXp: 1858.8, baseCombatXp: 1500.0, minTask: 110, maxTask: 150, avgKills: 130, category: "dragons" },
  { name: "Nodon Dragonkin", kph: 410, baseSlayXp: 1858.8, baseCombatXp: 1500.0, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Onyx Dragons", kph: 400, baseSlayXp: 1858.8, baseCombatXp: 2500.0, minTask: 80, maxTask: 130, avgKills: 105, category: "dragons" },
  { name: "Onyx Dragons", kph: 400, baseSlayXp: 1858.8, baseCombatXp: 2500.0, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Dragonstone Dragons", kph: 400, baseSlayXp: 1448.4, baseCombatXp: 2000.0, minTask: 80, maxTask: 130, avgKills: 105, category: "dragons" },
  { name: "Dragonstone Dragons", kph: 400, baseSlayXp: 1448.4, baseCombatXp: 2000.0, minTask: 101, maxTask: 150, avgKills: 126, category: "dragons", cluster: "Dragon" },
  { name: "Iron Dragons", kph: 576, baseSlayXp: 245.0, baseCombatXp: 375.0, minTask: 75, maxTask: 130, avgKills: 103, category: "dragons" },
  { name: "Mithril Dragons", kph: 730, baseSlayXp: 564.4, baseCombatXp: 890.0, minTask: 30, maxTask: 50, avgKills: 40, category: "dragons" },
  { name: "Steel Dragons", kph: 550, baseSlayXp: 350.0, baseCombatXp: 500.0, minTask: 50, maxTask: 125, avgKills: 88, category: "dragons" },
  // Ganodermic
  { name: "Ganodermic Beasts", kph: 1300, baseSlayXp: 564.4, baseCombatXp: 625.0, minTask: 85, maxTask: 110, avgKills: 98, category: "ganodermic" },
  // Gargoyles
  { name: "Gargoyles", kph: 1000, baseSlayXp: 197.4, baseCombatXp: 335.0, minTask: 180, maxTask: 300, avgKills: 240, category: "gargoyles" },
  // Glacors
  { name: "Glacors", kph: 200, baseSlayXp: 1918.8, baseCombatXp: 2000.0, minTask: 60, maxTask: 85, avgKills: 73, category: "glacors" },
  { name: "Glacytes", kph: 3080, baseSlayXp: 198.9, baseCombatXp: 250.0, minTask: 60, maxTask: 85, avgKills: 73, category: "glacors" },
  // Kalphites
  { name: "Kalphites", kph: 564, baseSlayXp: 145.0, baseCombatXp: 300.0, minTask: 205, maxTask: 300, avgKills: 253, category: "kalphites" },
  // Muspahs
  { name: "Muspahs", kph: 700, baseSlayXp: 469.0, baseCombatXp: 1070.0, minTask: 150, maxTask: 180, avgKills: 165, category: "muspahs" },
  // Jadinkos
  { name: "Mutated Jadinkos", kph: 1164, baseSlayXp: 209.6, baseCombatXp: 300.0, minTask: 195, maxTask: 265, avgKills: 230, category: "jadinkos" },
  // Nihils
  { name: "Nihils", kph: 790, baseSlayXp: 564.1, baseCombatXp: 1000.0, minTask: 50, maxTask: 110, avgKills: 80, category: "nihils" },
  // Ascension
  { name: "Rorarius", kph: 1000, baseSlayXp: 140.0, baseCombatXp: 300.0, minTask: 120, maxTask: 150, avgKills: 135, category: "ascension" },
  { name: "Capsarius", kph: 1800, baseSlayXp: 146.6, baseCombatXp: 187.5, minTask: 120, maxTask: 150, avgKills: 135, category: "ascension" },
  // Vyrewatch
  { name: "Vyrewatch", kph: 1040, baseSlayXp: 52.2, baseCombatXp: 135.0, minTask: 110, maxTask: 155, avgKills: 133, category: "vyrewatch" },
  // Scabarites
  { name: "Profane Scabarites", kph: 850, baseSlayXp: 900.0, baseCombatXp: 1575.0, minTask: 80, maxTask: 120, avgKills: 100, category: "scabarites" },
  { name: "Elite Profane Scabarites", kph: 300, baseSlayXp: 1890.0, baseCombatXp: 3325.0, minTask: 80, maxTask: 120, avgKills: 100, category: "scabarites" },
];

// Slayer task categories - uses actual Laniakea task assignment names
// Each entry = one task Laniakea can assign. monsters[] = which MONSTERS entries count for it.
// Prefer/block list shows these labels (no duplicates). Stats shown = best monster in group.
const TASK_CATEGORIES = [
  { id: "abyssal_demons", label: "Abyssal Demons", monsters: ["Abyssal Demons", "Abyssal Beasts", "Abyssal Lords", "Abyssal Beasts and Lords Combo", "Abyssal Savages"] },
  { id: "acheron_mammoths", label: "Acheron Mammoths", monsters: ["Acheron Mammoths"] },
  { id: "adamant_dragons", label: "Adamant Dragons", monsters: ["Adamant Dragons"] },
  { id: "airuts", label: "Airuts", monsters: ["Airuts"] },
  { id: "aquanites", label: "Aquanites", monsters: ["Aquanites"] },
  { id: "ascension", label: "Order of Ascension", monsters: ["Capsarius", "Rorarius"] },
  { id: "aviansies", label: "Aviansies", monsters: ["Aviansies"] },
  { id: "black_demons", label: "Black Demons", monsters: ["Black Demons"] },
  { id: "black_dragons", label: "Black Dragons", monsters: ["Black Dragons"] },
  { id: "camel_warriors", label: "Camel Warriors", monsters: ["Camel Warriors"] },
  { id: "celestial_dragons", label: "Celestial Dragons", monsters: ["Celestial Dragons"] },
  { id: "chaos_giants", label: "Chaos Giants", monsters: ["Chaos Giants"] },
  { id: "corrupted_creatures", label: "Corrupted Creatures", monsters: ["Corrupted Workers"] },
  { id: "cresbots", label: "Cres's Creations", monsters: ["Cresbots"] },
  { id: "crystal_shapeshifters", label: "Crystal Shapeshifters", monsters: ["Crystal Shapeshifters"] },
  { id: "daemonheim", label: "Creatures of Daemonheim", monsters: ["Creatures of Daemonheim"] },
  { id: "dagannoths", label: "Dagannoths", monsters: ["Dagannoths"] },
  { id: "dark_beasts", label: "Dark Beasts", monsters: ["Dark Beasts"] },
  { id: "dinosaurs", label: "Dinosaurs", monsters: ["Brutish Dinosaurs", "Venomous Dinosaurs", "Feral Dinosaurs", "Ripper Dinosaurs"] },
  { id: "edimmus", label: "Edimmus", monsters: ["Edimmus"] },
  { id: "elves", label: "Elves", monsters: ["Elves"] },
  { id: "ganodermic", label: "Ganodermic Creatures", monsters: ["Ganodermic Beasts"] },
  { id: "gargoyles", label: "Gargoyles", monsters: ["Gargoyles"] },
  { id: "gemstone_dragons", label: "Gemstone Dragons", monsters: ["Hydrix Dragons", "Onyx Dragons", "Dragonstone Dragons"] },
  { id: "glacors", label: "Glacors", monsters: ["Glacors", "Glacytes"] },
  { id: "greater_demons", label: "Greater Demons", monsters: ["Greater Demons", "Ash Lord Greater Demons"] },
  { id: "iron_dragons", label: "Iron Dragons", monsters: ["Iron Dragons"] },
  { id: "jadinkos", label: "Mutated Jadinkos", monsters: ["Mutated Jadinkos"] },
  { id: "kalgerion_demons", label: "Kal'gerion Demons", monsters: ["Kal'gerion Demons"] },
  { id: "kalphites", label: "Kalphites", monsters: ["Kalphites"] },
  { id: "living_wyverns", label: "Living Wyverns", monsters: ["Living Wyverns"] },
  { id: "lost_grove", label: "Lost Grove Creatures", monsters: ["Moss Golems"] },
  { id: "mithril_dragons", label: "Mithril Dragons", monsters: ["Mithril Dragons"] },
  { id: "muspahs", label: "Muspahs", monsters: ["Muspahs"] },
  { id: "nightmares", label: "Nightmare Creatures", monsters: ["Nightmares"] },
  { id: "nihils", label: "Nihils", monsters: ["Nihils"] },
  { id: "nodon", label: "Nodon Dragonkin", monsters: ["Nodon Dragonkin"] },
  { id: "scabarites", label: "Profane Scabarites", monsters: ["Profane Scabarites", "Elite Profane Scabarites"] },
  { id: "ripper_demons", label: "Ripper Demons", monsters: ["Ripper Demons"] },
  { id: "rune_dragons", label: "Rune Dragons", monsters: ["Rune Dragons"] },
  { id: "shadow_creatures", label: "Shadow Creatures", monsters: ["Shadow Creatures"] },
  { id: "soul_devourers", label: "Soul Devourers", monsters: ["Crocodile Akhs"] },
  { id: "soulgazers", label: "Soulgazers", monsters: ["Soulgazers"] },
  { id: "steel_dragons", label: "Steel Dragons", monsters: ["Steel Dragons"] },
  { id: "strykewyrms", label: "Strykewyrms", monsters: ["Lava Strykewyrms", "Ice Strykewyrms"] },
  { id: "tormented_demons", label: "Tormented Demons", monsters: ["Tormented Demons"] },
  { id: "vile_blooms", label: "Vile Blooms", monsters: ["Vile Blooms"] },
  { id: "vyrewatch", label: "Vyrewatch", monsters: ["Vyrewatch"] },
];

// Default prefer/block from the spreadsheet
const DEFAULT_PREFER = ["ripper_demons", "abyssal_demons", "lost_grove", "camel_warriors", "living_wyverns", "nightmares", "acheron_mammoths", "greater_demons"];
const DEFAULT_BLOCK = ["dinosaurs", "vyrewatch", "kalphites", "aviansies", "ascension", "iron_dragons", "black_dragons", "dagannoths"];

// Max prefer/block slots
const MAX_PREFER = 8;
const MAX_BLOCK = 8;

// Unlock requirements for slayer tasks
// quests: RuneMetrics API quest titles that must be COMPLETED
// slayerLevel: minimum slayer level
// persuade: requires buying "Persuade" unlock from Slayer shop (50 pts)
const UNLOCK_REQUIREMENTS = {
  // Persuade unlocks (cost 50 Slayer reward points each)
  "Nightmares":             { quests: ["Children of Mah"], persuade: true },
  "Glacors":                { quests: ["Ritual of the Mahjarrat"], persuade: true },
  "Glacytes":               { quests: ["Ritual of the Mahjarrat"], persuade: true },
  "Nihils":                 { quests: ["Fate of the Gods"], slayerLevel: 76, persuade: true },
  "Muspahs":                { quests: ["Fate of the Gods"], slayerLevel: 76, persuade: true },
  "Tormented Demons":       { quests: ["While Guthix Sleeps"], persuade: true },
  "Aquanites":              { slayerLevel: 78, persuade: true },
  // Quest-locked tasks
  "Crystal Shapeshifters":  { quests: ["The Light Within"], slayerLevel: 75 },
  "Celestial Dragons":      { quests: ["One of a Kind"] },
  "Rune Dragons":           { quests: ["Fate of the Gods", "Ritual of the Mahjarrat"] },
  "Chaos Giants":           { quests: ["Birthright of the Dwarves"] },
  "Cresbots":               { quests: ["The World Wakes"], slayerLevel: 67 },
  "Vyrewatch":              { quests: ["The Branches of Darkmeyer"] },
  "Mithril Dragons":        { quests: ["Barbarian Training"] },
  "Corrupted Workers":      { quests: ["Icthlarin's Little Helper"], slayerLevel: 88 },
  "Crocodile Akhs":         { quests: ["Icthlarin's Little Helper"], slayerLevel: 105 },
  "Edimmus":                { quests: ["Plague's End"], slayerLevel: 90 },
  "Nodon Dragonkin":        { slayerLevel: 92 },
  "Elves":                  { quests: ["Plague's End"] },
  "Shadow Creatures":       { quests: ["Plague's End"] },
  "Dagannoths":             { quests: ["Horror from the Deep"] },
  "Dark Beasts":            { quests: ["Mourning's End Part II"], slayerLevel: 90 },
  "Ice Strykewyrms":        { quests: ["The Tale of the Muspah"], slayerLevel: 93 },
  "Soulgazers":             { quests: ["Dishonour among Thieves"], slayerLevel: 99 },
  "Hydrix Dragons":         { quests: ["Shilo Village"], slayerLevel: 101 },
  "Onyx Dragons":           { quests: ["Shilo Village"], slayerLevel: 95 },
  "Dragonstone Dragons":    { quests: ["Shilo Village"], slayerLevel: 95 },
  // Dinosaurs
  "Brutish Dinosaurs":      { slayerLevel: 99 },
  "Venomous Dinosaurs":     { slayerLevel: 105 },
  "Feral Dinosaurs":        { slayerLevel: 90 },
  "Ripper Dinosaurs":       { slayerLevel: 114 },
  // Slayer level only
  "Moss Golems":            { slayerLevel: 104 },
  "Acheron Mammoths":       { slayerLevel: 96 },
  "Lava Strykewyrms":       { slayerLevel: 94 },
  "Vile Blooms":            { slayerLevel: 90 },
  "Camel Warriors":         { slayerLevel: 96 },
  "Living Wyverns":         { slayerLevel: 96 },
  "Airuts":                 { slayerLevel: 92 },
  "Abyssal Demons":         { slayerLevel: 85 },
  "Abyssal Lords":          { slayerLevel: 115 },
  "Abyssal Savages":        { slayerLevel: 95 },
  "Abyssal Beasts":         { slayerLevel: 105 },
  "Abyssal Beasts and Lords Combo": { slayerLevel: 105 },
  "Kal'gerion Demons":      { slayerLevel: 90 },
  "Ripper Demons":          { slayerLevel: 96 },
  "Ganodermic Beasts":      { slayerLevel: 95 },
  "Gargoyles":              { slayerLevel: 75 },
  "Mutated Jadinkos":       { slayerLevel: 80 },
  "Rorarius":               { slayerLevel: 81 },
  "Capsarius":              { slayerLevel: 81 },
  "Profane Scabarites":     { slayerLevel: 87 },
  "Elite Profane Scabarites": { slayerLevel: 87 },
};

// Persuade task IDs (map to TASK_CATEGORIES ids)
const PERSUADE_TASKS = ["aquanites", "muspahs", "nihils", "glacors", "tormented_demons", "nightmares"];

// Changelog data
const CHANGELOG = [
  { date: "25/02/2026", version: "2.2", note: "New Ultimate Slayer drop tracker tab with 13 areas, 244 items, item images, obtained/unobtained toggle, expandable drop details. Added Slayer Introspection min/max per-task toggle. Fixed private RuneMetrics assuming all quests completed.", change: "Ultimate Slayer tab + Introspection" },
  { date: "25/02/2026", version: "2.1", note: "Added minTask data, fixed scrim/KPH propagation to Prefer/Block, moved Skip to Slayer Tasks tab, added lock checks to Prefer/Block, added missing quest requirements.", change: "Major Prefer/Block overhaul" },
  { date: "24/02/2026", version: "2.0", note: "Major rewrite: base data, editable KPH, merged tabs, per-monster scrimshaw, prefer/block auto-fill.", change: "Restructured to GitHub Pages site" },
  { date: "01/09/2025", version: "1.3.5", note: "KPHs given by Joshua B", change: "Updated KPH of all monsters" },
  { date: "28/03/2025", version: "1.3", note: "Necromancy release changed a lot of base XP, this has been updated to reflect it.", change: "Updated the XP of all the monsters" },
  { date: "15/03/2025", version: "1.2", note: "No notes.", change: "Reworked a lot of GPData to make it easier to add in future" },
  { date: "15/03/2025", version: "1.1.5", note: "No notes.", change: "Added Capsarius as Order of Ascension option" },
  { date: "04/02/2025", version: "1.1.4", note: "Made Profane Scabarites appear correctly.", change: "Fixed Elite+Normal Profane Scabarites" },
  { date: "28/01/2025", version: "1.1.3", note: "Need to make Elite and Normal appear separately", change: "Added Profane Scabarites" },
  { date: "28/01/2025", version: "1.1.2", note: "Discord from Saltea#5509 to .saltea", change: "Changed Discord information" },
  { date: "03/03/2023", version: "1.1.1", note: "Made Prefer / Block list filter better, however with certain things with multiple methods, such as Abyssal Demons it's much more complex.", change: "Added more checks" },
  { date: "03/03/2023", version: "1.1", note: "Painge. This was a lot of work.", change: "Fixed Pref/Block filter" },
  { date: "02/03/2023", version: "1.0", note: "Released", change: "Initial release" },
];

// To-Do list
const TODO_LIST = [
  { text: "Make Alt1 Plugin", done: false },
];
