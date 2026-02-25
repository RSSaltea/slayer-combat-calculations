# Slayer & Combat Calculations

An Alt1 Toolkit plugin and standalone web tool for RuneScape Slayer task calculations, Prefer/Block optimisation, and Ultimate Slayer collection log tracking with image detection.

## Installation

[![Install in Alt1](https://img.shields.io/badge/Install_in-Alt1_Toolkit-c98736?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABhSURBVDhPY/j//z8DEIMBIwMKwCdJECRBDmBioBIYNRgZkIIYJERNp/7//59BkJuNAUMjAwMDg5+jOQM2jTBNYIkzl+4zCHKxYWrEpgkscebyPQZBbnZMjbg0gSUoAQBZhCEPfNkKxgAAAABJRU5ErkJggg==)](alt1://addapp/https://rssaltea.github.io/slayer-combat-calculations/appconfig.json)

> Requires [Alt1 Toolkit](https://runeapps.org/alt1) to be installed.

## Features

### Home
- **Slayer boost toggles** — Slayer Helmet, Genocide, Scrimshaw, Contracts, 120 Cape perk, and more.
- **Real-time multiplier bar** — see your combined XP/GP multipliers at a glance.
- **Player lookup** — fetches your stats from RuneMetrics to auto-lock/unlock tasks.

### Slayer Tasks
- **Full Laniakea task list** with base XP, KPH, and GP data.
- **Editable KPH** — override any kill rate to match your setup.
- **Per-monster scrimshaw toggle** for GP calculations.
- **Cluster tasks** — Demons, Dragons, Undead, Strykewyrms with independent Prefer/Block.

### Prefer / Block
- **Weighted average calculator** — optimise Slay XP/Hr, Combat XP/Hr, or GP/Hr.
- **120 Slayer cape perk** — 20% chance to choose best task factored into averages.
- **Export to PNG** — share your Prefer/Block setup as an image.

### Ultimate Slayer
- **Collection log tracker** — 256 items across 14 areas.
- **Alt1 image detection** — automatically detects obtained items from the in-game collection log.
- **Check button** — continuous scanning when running inside Alt1.
- **Export** — export individual areas or the full log as PNG.

### Goals
- **XP calculator** — plan your remaining Slayer/Combat XP targets.

## Alt1 Image Detection

When running inside Alt1, the Ultimate Slayer tab gains a **Check** button:

1. Open your Slayer collection log in-game.
2. Click **Check** — the plugin starts scanning every 2.4 seconds.
3. Navigate through areas in the log — items auto-update as obtained/unobtained.
4. Click **Check** again to stop scanning.

The detection uses area identifier images to know which log page is open, then checks each item's empty-slot image. If the empty slot is visible, the item is not obtained; if it's gone, the item is obtained.

## GP Data

GP per kill data is auto-updated every 12 hours from a shared Google Sheet via GitHub Actions. Binding Contracts and Tetra Contracts GP bonuses are tracked separately.

## Hosting

This project is hosted on GitHub Pages and auto-deploys on push to `main`.

## Credits

- Data by the community (mionee, roarroar, Joshua B)
- Ultimate Slayer spreadsheet by Gooch Era
- Built with vanilla JS, HTML5 Canvas, and the Alt1 Toolkit API
