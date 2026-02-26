// Ultimate Slayer Alt1 Image Detector
// Detects collection log areas using colored icon detection only:
//   colored icon found → item obtained (checked)
//   colored icon not found → no update (never auto-unchecks)

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // All items: only the colored icon (.png) is used for detection.
  // Found → check. Not found → no change (never auto-unchecks).

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

  // ── Build image reference key ─────────────────────────────────────
  function colorSlug(itemName) {
    return itemName.replace(/\s+/g, '_');
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

    // Load colored icon for every item
    ULTIMATE_AREAS.forEach(function (area) {
      area.drops.forEach(function (drop) {
        var cSlug = colorSlug(drop.item);
        promises.push(loadRef(cSlug, 'images/ultimate/' + cSlug + '.png'));
      });
    });

    return Promise.all(promises).then(function () {
      var areaCount = ULTIMATE_AREAS.filter(function (a) { return refs['area_' + a.id]; }).length;
      var colorCount = 0;
      ULTIMATE_AREAS.forEach(function (area) {
        area.drops.forEach(function (drop) {
          if (refs[colorSlug(drop.item)]) colorCount++;
        });
      });
      console.log('[UltDetect] Loaded ' + areaCount + ' area images, ' +
        colorCount + ' colored icons.');
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

      // Area is visible — check each item's colored icon only
      area.drops.forEach(function (drop) {
        var cSlug = colorSlug(drop.item);
        if (refs[cSlug] && imageFound(cSlug)) {
          changes[drop.item] = { v: true, method: 'color icon found' };
          hasChanges = true;
        }
        // Not found → no update (never auto-unchecks)
      });
    });

    if (hasChanges) {
      var checked = [];
      var cbChanges = {};
      Object.keys(changes).forEach(function (item) {
        checked.push(item);
        cbChanges[item] = true;
      });
      if (checked.length) console.log('[UltDetect] Checked: ' + checked.join(', '));
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
