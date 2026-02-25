// Ultimate Slayer Alt1 Image Detector
// Follows the same pattern as vorkath-gm-timer's haunt-detector.js
// Detects collection log areas and empty-slot (-n) images to auto-track obtained items

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // ── A1lib Resolution (same as vorkath) ──────────────────────────────
  function resolveLib() {
    var candidate =
      (typeof A1lib !== 'undefined' && A1lib && A1lib.captureHoldFullRs && A1lib) ||
      (typeof a1lib !== 'undefined' && a1lib && a1lib.captureHoldFullRs && a1lib) ||
      null;
    if (candidate) lib = candidate;
    return lib;
  }

  // ── Image Loading (same as vorkath) ─────────────────────────────────
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

  // ── Image Matching (same as vorkath) ────────────────────────────────
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

  // ── Screen Capture (same as vorkath) ────────────────────────────────
  function captureScreen() {
    try {
      screen = lib.captureHoldFullRs();
      return screen != null;
    } catch (e) {
      return false;
    }
  }

  // ── Build item slug for -n image key ────────────────────────────────
  function itemSlug(itemName) {
    return itemName.replace(/\s+/g, '_') + '-n';
  }

  function itemSlugPositive(itemName) {
    return itemName.replace(/\s+/g, '_');
  }

  function itemSlugFound(itemName) {
    return itemName.replace(/\s+/g, '_') + '-f';
  }

  // Items where -n detection is unreliable — detect the actual item image instead
  var REVERSE_DETECT = {
    'Steadfast Boots': true,
    'Glaiven Boots': true,
    'Ragefire Boots': true
  };

  // ── Initialize: load all area + item images ─────────────────────────
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

    // Load -n item images for all drops
    ULTIMATE_AREAS.forEach(function (area) {
      area.drops.forEach(function (drop) {
        var slug = itemSlug(drop.item);
        promises.push(loadRef(slug, 'images/ultimate/' + slug + '.png'));

        // For REVERSE_DETECT items: load -f and positive images
        if (REVERSE_DETECT[drop.item]) {
          var fSlug = itemSlugFound(drop.item);
          promises.push(loadRef(fSlug, 'images/ultimate/' + fSlug + '.png'));
          var posSlug = itemSlugPositive(drop.item);
          promises.push(loadRef(posSlug, 'images/ultimate/' + posSlug + '.png'));
        }
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
      console.log('[UltDetect] Loaded ' + areaCount + ' area images, ' + itemCount + ' item images.');
      initialized = true;
    });
  }

  // ── Single scan cycle ───────────────────────────────────────────────
  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};
    var hasChanges = false;

    ULTIMATE_AREAS.forEach(function (area) {
      // Check if this area's identifier is visible on screen
      if (!imageFound('area_' + area.id)) return;

      // Area is visible — check each item
      area.drops.forEach(function (drop) {
        var slug = itemSlug(drop.item);

        if (REVERSE_DETECT[drop.item]) {
          // Check -f (found) image — obtained item screenshot
          var fSlug = itemSlugFound(drop.item);
          if (refs[fSlug] && imageFound(fSlug)) {
            changes[drop.item] = true;
            hasChanges = true;
            return;
          }
          // Check positive image
          var posSlug = itemSlugPositive(drop.item);
          if (refs[posSlug] && imageFound(posSlug)) {
            changes[drop.item] = true;
            hasChanges = true;
            return;
          }
          // Neither matched — leave state unchanged
        } else {
          // Normal detection: look for the -n (empty slot) image
          if (!refs[slug]) return;

          if (imageFound(slug)) {
            // Empty slot found on screen — item NOT obtained
            changes[drop.item] = false;
          } else {
            // Empty slot NOT found — item IS obtained
            changes[drop.item] = true;
          }
          hasChanges = true;
        }
      });
    });

    if (hasChanges && onUpdateCb) {
      onUpdateCb(changes);
    }
  }

  // ── Start/Stop scanning ─────────────────────────────────────────────
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

  // ── Public API ──────────────────────────────────────────────────────
  window.UltimateDetector = {
    init: init,
    start: start,
    stop: stop,
    isRunning: function () { return !!scanInterval; },
    isAvailable: function () { return typeof alt1 !== 'undefined' && !!resolveLib(); }
  };

})();
