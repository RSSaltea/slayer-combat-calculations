// Ultimate Slayer Alt1 Image Detector
// Detects collection log areas and empty-slot (-n) images to auto-track obtained items
// Items with unreliable -n matching use reverse detection (colored icon matching)

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // ── Reverse-detect items ────────────────────────────────────────
  // Items where -n detection gives false results.
  // Instead of looking for the empty-slot icon (-n), we look for the
  // colored obtained icon. 'f' = use -f.png, 'icon' = use normal .png
  var REVERSE_DETECT = {
    // -f images (specifically captured colored icons)
    'Steadfast Boots': 'f',
    'Glaiven Boots': 'f',
    'Ragefire Boots': 'f',
    'Grifolic Wand': 'f',
    'Grifolic Gloves': 'f',
    'Nightmare Gauntlets': 'f',
    // Normal icon images (no reliable -f available)
    'Grifolic Shield': 'icon',
    'Grifolic Orb': 'icon',
    'Shade Robe (top)': 'icon',
    'Shade Robe (bottom)': 'icon',
    'Tortoise Shell': 'icon',
    'Perfect Shell': 'icon',
    'Dwarf Multicannon Upgrade Kit': 'icon',
    'Kinetic Cyclone Upgrade Kit': 'icon',
    'Oldak Coil Upgrade Kit': 'icon',
    'Red Dragon Egg': 'icon',
    'Blue Dragon Egg': 'icon',
    'Green Dragon Egg': 'icon',
    'Black Dragon Egg': 'icon',
    'Royal Cape': 'icon',
    'Razorback Gauntlets': 'icon',
    'Vital Spark': 'icon',
    'Dragon Rider Helm': 'icon',
    'Fremennik Equipment Patch': 'icon'
  };

  // Bump this when detection list changes to re-clear stale state
  var STALE_VERSION = '3';

  // Areas that require scrolling (more items than fit on one page).
  // For these, only mark items as NOT obtained when -n IS found.
  // Don't infer obtained from absence — item might be scrolled off screen.
  var SCROLL_AREAS = {
    'wilderness': true
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

  // ── Screen Capture ────────────────────────────────────────────────
  function captureScreen() {
    try {
      screen = lib.captureHoldFullRs();
      return screen != null;
    } catch (e) {
      return false;
    }
  }

  // ── Build image reference keys ────────────────────────────────────
  function itemSlug(itemName) {
    return itemName.replace(/\s+/g, '_') + '-n';
  }

  function reverseSlug(itemName, type) {
    var base = itemName.replace(/\s+/g, '_');
    return type === 'f' ? base + '-f' : base;
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

    // Load item images
    ULTIMATE_AREAS.forEach(function (area) {
      area.drops.forEach(function (drop) {
        // Always load -n image
        var nSlug = itemSlug(drop.item);
        promises.push(loadRef(nSlug, 'images/ultimate/' + nSlug + '.png'));

        if (REVERSE_DETECT[drop.item]) {
          // Also load colored icon as fallback (-f.png or normal .png)
          var rSlug = reverseSlug(drop.item, REVERSE_DETECT[drop.item]);
          promises.push(loadRef(rSlug, 'images/ultimate/' + rSlug + '.png'));
        }
      });
    });

    return Promise.all(promises).then(function () {
      var areaCount = ULTIMATE_AREAS.filter(function (a) { return refs['area_' + a.id]; }).length;
      var itemCount = 0;
      var reverseCount = 0;
      ULTIMATE_AREAS.forEach(function (area) {
        area.drops.forEach(function (drop) {
          if (refs[itemSlug(drop.item)]) itemCount++;
          if (REVERSE_DETECT[drop.item]) {
            var rSlug = reverseSlug(drop.item, REVERSE_DETECT[drop.item]);
            if (refs[rSlug]) reverseCount++;
          }
        });
      });
      console.log('[UltDetect] Loaded ' + areaCount + ' area images, ' +
        itemCount + ' -n items, ' + reverseCount + ' reverse-detect fallbacks.');
      initialized = true;
    });
  }

  // ── Single scan cycle ─────────────────────────────────────────────
  function clearStaleState(changes) {
    // One-time clear: uncheck items that had false-positive detection
    // in previous code versions. Runs once per STALE_VERSION bump.
    try {
      if (localStorage.getItem('_skipDetectV') === STALE_VERSION) return false;
      var cleared = false;
      ULTIMATE_AREAS.forEach(function (area) {
        area.drops.forEach(function (drop) {
          if (REVERSE_DETECT[drop.item] === 'icon') {
            changes[drop.item] = false;
            cleared = true;
          }
        });
      });
      localStorage.setItem('_skipDetectV', STALE_VERSION);
      return cleared;
    } catch (e) { return false; }
  }

  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};
    var hasChanges = false;

    // Clear stale state for previously-false-positive items (one-time)
    if (clearStaleState(changes)) hasChanges = true;

    ULTIMATE_AREAS.forEach(function (area) {
      // Check if this area's identifier is visible on screen
      if (!imageFound('area_' + area.id)) return;

      var isScrollArea = !!SCROLL_AREAS[area.id];

      // Area is visible — check each item
      area.drops.forEach(function (drop) {
        var nSlug = itemSlug(drop.item);

        // Step 1: Try -n detection (empty slot image)
        if (refs[nSlug] && imageFound(nSlug)) {
          // Empty slot found on screen — item NOT obtained
          changes[drop.item] = false;
          hasChanges = true;
          return;
        }

        // Step 2: -n not found — try reverse detection fallback if available
        if (REVERSE_DETECT[drop.item]) {
          var rSlug = reverseSlug(drop.item, REVERSE_DETECT[drop.item]);
          if (refs[rSlug] && imageFound(rSlug)) {
            // Colored icon found — item IS obtained
            changes[drop.item] = true;
            hasChanges = true;
          }
          // Neither -n nor colored icon found — leave state unchanged
          return;
        }

        // Step 3: Normal -n only item, -n not found
        if (refs[nSlug] && !isScrollArea) {
          // Area doesn't scroll — item IS obtained
          changes[drop.item] = true;
          hasChanges = true;
        }
        // If scroll area and -n not found: don't update (might be off-screen)
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
