// Ultimate Slayer Alt1 Image Detector
// Primary: -n (empty slot) subimage matching for most items
// Fallback: saturation check at grid positions for items where -n matching is unreliable

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // ── Grid Layout (RS3 Collection Log) ──────────────────────────────
  var GRID = {
    cols: 6,           // items per row
    colPitch: 42,      // px between column starts
    rowPitch: 38,      // px between row starts
    cellW: 36,         // cell content width
    cellH: 32          // cell content height
  };

  // Default offset from area header to first grid cell (on screen)
  // Measured from multiple areas, consistent within ±2px
  var HEADER_DX = -14;
  var HEADER_DY = 36;

  // Per-area overrides where the offset differs significantly
  var HEADER_DY_OVERRIDE = {
    'lost_lands': 65    // two-line header text
  };

  // Saturation threshold: avg saturation below this = grey (not obtained)
  var SAT_THRESHOLD = 12;

  // ── Items where -n detection is unreliable ────────────────────────
  // These use saturation check at their grid position instead
  var SATURATION_DETECT = {
    // False positives — -n image not found even when item IS empty
    'Grifolic Shield': true,
    'Grifolic Wand': true,
    'Grifolic Orb': true,
    'Grifolic Gloves': true,
    'Nightmare Gauntlets': true,
    // Items that don't detect correctly with -n matching
    'Shade Robe (top)': true,
    'Shade Robe (bottom)': true,
    'Tortoise Shell': true,
    'Perfect Shell': true,
    'Dwarf Multicannon Upgrade Kit': true,
    'Kinetic Cyclone Upgrade Kit': true,
    'Oldak Coil Upgrade Kit': true,
    'Red Dragon Egg': true,
    'Blue Dragon Egg': true,
    'Green Dragon Egg': true,
    'Black Dragon Egg': true,
    // Boots — previously REVERSE_DETECT, now saturation
    'Steadfast Boots': true,
    'Glaiven Boots': true,
    'Ragefire Boots': true
  };

  // ── A1lib Resolution ──────────────────────────────────────────────
  function resolveLib() {
    var candidate =
      (typeof A1lib !== 'undefined' && A1lib && A1lib.captureHoldFullRs && A1lib) ||
      (typeof a1lib !== 'undefined' && a1lib && a1lib.captureHoldFullRs && a1lib) ||
      null;
    if (candidate) lib = candidate;
    return lib;
  }

  // ── Image Loading ─────────────────────────────────────────────────
  function loadRef(name, path) {
    var l = resolveLib();
    if (l && typeof l.imageDataFromUrl === 'function') {
      return l.imageDataFromUrl(path)
        .then(function (imgData) {
          refs[name] = imgData;
        })
        .catch(function (e) {
          console.warn('[UltDetect] Failed "' + name + '":', e);
          refs[name] = null;
        });
    }

    // Fallback: canvas-based image conversion for browser/testing
    return fetch(path)
      .then(function (r) { return r.blob(); })
      .then(function (blob) { return createImageBitmap(blob, { colorSpaceConversion: 'none' }); })
      .then(function (bitmap) {
        var c = document.createElement('canvas');
        c.width = bitmap.width;
        c.height = bitmap.height;
        c.getContext('2d').drawImage(bitmap, 0, 0);
        refs[name] = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      })
      .catch(function (e) {
        console.warn('[UltDetect] Could not load "' + name + '":', e);
        refs[name] = null;
      });
  }

  // ── Image Matching ────────────────────────────────────────────────
  // Returns true if the named reference image is found on screen
  function imageFound(name) {
    if (!refs[name] || !screen) return false;
    try {
      var hits = typeof screen.findSubimage === 'function'
        ? screen.findSubimage(refs[name])
        : lib.findSubimage(screen, refs[name]);
      return Array.isArray(hits) && hits.length > 0;
    } catch (e) {
      return false;
    }
  }

  // Returns position {x, y} if found, null otherwise
  // Handles both flat arrays [x, y, ...] and object arrays [{x, y}, ...]
  function findImage(name) {
    if (!refs[name] || !screen) return null;
    try {
      var hits = typeof screen.findSubimage === 'function'
        ? screen.findSubimage(refs[name])
        : lib.findSubimage(screen, refs[name]);
      if (!Array.isArray(hits) || hits.length === 0) return null;
      // Object array format: [{x, y}, ...]
      if (typeof hits[0] === 'object' && hits[0] !== null) {
        return { x: hits[0].x, y: hits[0].y };
      }
      // Flat array format: [x, y, ...]
      if (hits.length >= 2) {
        return { x: hits[0], y: hits[1] };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ── Screen Capture ────────────────────────────────────────────────
  function captureScreen() {
    try {
      screen = lib.captureHoldFullRs();
      return screen != null;
    } catch (e) {
      return false;
    }
  }

  // ── Saturation Check ──────────────────────────────────────────────
  // Reads pixels at the item's grid position and checks if they're
  // grey (not obtained) or colored (obtained).
  // Returns: true = obtained, false = not obtained, null = couldn't read
  function checkSlotSaturation(slotScreenX, slotScreenY) {
    try {
      // Inset by 4px to avoid borders and handle ±2px offset tolerance
      var inset = 4;
      var cropX = slotScreenX + inset;
      var cropY = slotScreenY + inset;
      var cropW = GRID.cellW - inset * 2;   // 28px
      var cropH = GRID.cellH - inset * 2;   // 24px

      // Use A1lib's toData(x, y, w, h) to read pixels from screen
      var imgData = screen.toData(cropX, cropY, cropW, cropH);
      if (!imgData || !imgData.data) return null;

      var data = imgData.data;
      var totalSat = 0;
      var pixels = 0;

      for (var i = 0; i < data.length; i += 4) {
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        // Saturation = max - min of RGB channels
        var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        totalSat += mx - mn;
        pixels++;
      }

      if (pixels === 0) return null;
      var avgSat = totalSat / pixels;

      return avgSat > SAT_THRESHOLD;
    } catch (e) {
      console.warn('[UltDetect] Saturation check failed:', e);
      return null;
    }
  }

  // ── Build item slug for -n image key ──────────────────────────────
  function itemSlug(itemName) {
    return itemName.replace(/\s+/g, '_') + '-n';
  }

  function itemSlugFound(itemName) {
    return itemName.replace(/\s+/g, '_') + '-f';
  }

  // ── Initialize: load all area + item images ───────────────────────
  function init(options) {
    if (options && options.onUpdate) {
      onUpdateCb = options.onUpdate;
    }

    if (initialized) {
      return Promise.resolve();
    }

    if (!resolveLib()) {
      console.error('[UltDetect] A1lib not available.');
      return Promise.reject(new Error('A1lib not available'));
    }

    if (typeof ULTIMATE_AREAS === 'undefined') {
      console.error('[UltDetect] ULTIMATE_AREAS not defined.');
      return Promise.reject(new Error('ULTIMATE_AREAS not defined'));
    }

    var promises = [];

    // Load area identifier images
    ULTIMATE_AREAS.forEach(function (area) {
      if (area.areaImage) {
        promises.push(loadRef('area_' + area.id, 'images/ultimate/' + area.areaImage));
      }
    });

    // Load -n item images for drops that use -n detection
    ULTIMATE_AREAS.forEach(function (area) {
      area.drops.forEach(function (drop) {
        if (SATURATION_DETECT[drop.item]) return; // skip, uses saturation
        var slug = itemSlug(drop.item);
        promises.push(loadRef(slug, 'images/ultimate/' + slug + '.png'));
      });
    });

    return Promise.all(promises).then(function () {
      var areaCount = ULTIMATE_AREAS.filter(function (a) { return refs['area_' + a.id]; }).length;
      var itemCount = 0;
      ULTIMATE_AREAS.forEach(function (area) {
        area.drops.forEach(function (drop) {
          if (refs[itemSlug(drop.item)]) itemCount++;
        });
      });
      var satCount = Object.keys(SATURATION_DETECT).length;
      console.log('[UltDetect] Loaded ' + areaCount + ' area images, ' +
        itemCount + ' item images, ' + satCount + ' saturation-detect items.');
      initialized = true;
    });
  }

  // ── Single scan cycle ─────────────────────────────────────────────
  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};
    var hasChanges = false;

    ULTIMATE_AREAS.forEach(function (area) {
      // Find area header position on screen
      var headerPos = findImage('area_' + area.id);
      if (!headerPos) return; // area not visible

      // Calculate grid origin on screen for saturation checks
      var dy = HEADER_DY_OVERRIDE[area.id] || HEADER_DY;
      var gridOriginX = headerPos.x + HEADER_DX;
      var gridOriginY = headerPos.y + dy;

      // Check each item
      area.drops.forEach(function (drop, index) {
        if (SATURATION_DETECT[drop.item]) {
          // ── Saturation-based detection ──
          var col = index % GRID.cols;
          var row = Math.floor(index / GRID.cols);
          var slotX = gridOriginX + col * GRID.colPitch;
          var slotY = gridOriginY + row * GRID.rowPitch;

          var obtained = checkSlotSaturation(slotX, slotY);
          if (obtained !== null) {
            changes[drop.item] = obtained;
            hasChanges = true;
          }
          // null = couldn't read, leave state unchanged
        } else {
          // ── Normal -n image detection ──
          var slug = itemSlug(drop.item);
          if (!refs[slug]) return;

          if (imageFound(slug)) {
            changes[drop.item] = false;  // empty slot visible = not obtained
          } else {
            changes[drop.item] = true;   // empty slot not found = obtained
          }
          hasChanges = true;
        }
      });
    });

    if (hasChanges && onUpdateCb) {
      onUpdateCb(changes);
    }
  }

  // ── Start/Stop scanning ───────────────────────────────────────────
  function start() {
    if (scanInterval) return;
    scanInterval = setInterval(scan, SCAN_MS);
    console.log('[UltDetect] Scanning started (' + SCAN_MS + 'ms interval).');
  }

  function stop() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
      console.log('[UltDetect] Scanning stopped.');
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  window.UltimateDetector = {
    init: init,
    start: start,
    stop: stop,
    isRunning: function () { return !!scanInterval; },
    isAvailable: function () { return typeof alt1 !== 'undefined' && !!resolveLib(); }
  };

})();
