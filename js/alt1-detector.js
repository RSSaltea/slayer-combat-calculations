// Ultimate Slayer Alt1 Image Detector
// Detects collection log areas and empty-slot (-n) images to auto-track obtained items
// Items with unreliable -n matching also check for the colored icon as fallback

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // ── Items with unreliable -n detection ──────────────────────────
  // These get dual detection: -n first, then colored icon fallback.
  // 'f' = use -f.png, 'icon' = use normal .png (no suffix)
  // If -n found → not obtained. If colored icon found → obtained.
  // If neither found → state unchanged (safe, no false positives).
  // Items whose -n images NEVER match on screen (broken silhouettes).
  // These get dual detection: color icon + -n, with flash on ambiguity.
  // Items with reliable -n were removed — they work fine as normal items.
  var REVERSE_DETECT = {
    'Grifolic Wand': 'f',
    'Nightmare Gauntlets': 'f',
    'Grifolic Orb': 'icon',
    'Royal Cape': 'icon',
    'Razorback Gauntlets': 'icon',
    'Vital Spark': 'icon',
    'Dragon Rider Helm': 'icon',
    'Fremennik Equipment Patch': 'icon'
  };

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

        // For unreliable items, also load the colored icon as fallback
        if (REVERSE_DETECT[drop.item]) {
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
  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};
    var hasChanges = false;

    ULTIMATE_AREAS.forEach(function (area) {
      // Check if this area's identifier is visible on screen
      if (!imageFound('area_' + area.id)) return;

      var isScrollArea = !!SCROLL_AREAS[area.id];

      // Area is visible — check each item
      area.drops.forEach(function (drop) {
        var nSlug = itemSlug(drop.item);

        // ── REVERSE_DETECT items: dual detection ──
        if (REVERSE_DETECT[drop.item]) {
          var rSlug = reverseSlug(drop.item, REVERSE_DETECT[drop.item]);
          var colorFound = refs[rSlug] && imageFound(rSlug);
          var nFound = refs[nSlug] && imageFound(nSlug);

          if (colorFound && !nFound) {
            // Colored icon visible, empty slot gone → obtained
            changes[drop.item] = { v: true, method: 'color icon found, -n absent' };
            hasChanges = true;
          } else if (!colorFound && nFound) {
            // Empty slot visible, no colored icon → not obtained
            changes[drop.item] = { v: false, method: '-n found (empty slot visible)' };
            hasChanges = true;
          } else if (colorFound && nFound) {
            // Both visible → contradictory, flash for manual review
            changes[drop.item] = { v: 'conflict', reason: 'both found' };
            hasChanges = true;
          } else {
            // Neither visible → ambiguous, flash for manual review
            changes[drop.item] = { v: 'conflict', reason: 'both not found' };
            hasChanges = true;
          }
          return;
        }

        // ── Normal items: -n only detection ──
        if (refs[nSlug] && imageFound(nSlug)) {
          changes[drop.item] = { v: false, method: '-n found' };
          hasChanges = true;
          return;
        }

        if (refs[nSlug] && !isScrollArea) {
          changes[drop.item] = { v: true, method: '-n not found (no scroll)' };
          hasChanges = true;
        }
        // If scroll area and -n not found: don't update (might be off-screen)
      });
    });

    if (hasChanges) {
      var checked = [];
      var unchecked = [];
      var flashed = [];
      var cbChanges = {};
      Object.keys(changes).forEach(function (item) {
        var c = changes[item];
        if (c.v === 'conflict') {
          flashed.push(item + ' (' + c.reason + ')');
          cbChanges[item] = 'conflict';
        } else if (c.v) {
          checked.push(item + ' [' + c.method + ']');
          cbChanges[item] = true;
        } else {
          unchecked.push(item + ' [' + c.method + ']');
          cbChanges[item] = false;
        }
      });
      if (checked.length) console.log('[UltDetect] Checked: ' + checked.join(', '));
      if (unchecked.length) console.log('[UltDetect] Unchecked: ' + unchecked.join(', '));
      if (flashed.length) console.log('[UltDetect] Flash: ' + flashed.join(', '));
      if (onUpdateCb) onUpdateCb(cbChanges);
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
