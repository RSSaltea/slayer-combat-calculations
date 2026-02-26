// Supplementary detector for SKIP_DETECT items
// Uses -f (colored icon) image detection only — positive detection, never auto-unchecks
// Safe to experiment with: only checks items when a match is found, never unchecks
//
// To enable detection for an item, add a -f.png screenshot image in images/ultimate/
// e.g. Royal_Cape-f.png, Tortoise_Shell-f.png, etc.
// Image must be a cropped screenshot of that item slot when obtained (coloured icon visible)

(function () {
  'use strict';

  var SCAN_MS = 2400;

  // All current SKIP_DETECT items — detection activates automatically when a -f.png exists
  var SKIP_TRY = [
    'Grifolic Shield',
    'Grifolic Orb',
    'Tortoise Shell',
    'Perfect Shell',
    'Dwarf Multicannon Upgrade Kit',
    'Kinetic Cyclone Upgrade Kit',
    'Oldak Coil Upgrade Kit',
    'Red Dragon Egg',
    'Blue Dragon Egg',
    'Green Dragon Egg',
    'Black Dragon Egg',
    'Royal Cape',
    'Razorback Gauntlets',
    'Vital Spark',
    'Dragon Rider Helm'
  ];

  var lib = null;
  var refs = {};       // area images + item -f images
  var screen = null;
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

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
        .then(function (imgData) { refs[name] = imgData; })
        .catch(function () { refs[name] = null; });
    }
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
      .catch(function () { refs[name] = null; });
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

  function itemSlugFound(itemName) {
    return itemName.replace(/\s+/g, '_') + '-f';
  }

  // ── Initialize ────────────────────────────────────────────────────
  function init(options) {
    if (options && options.onUpdate) onUpdateCb = options.onUpdate;
    if (initialized) return Promise.resolve();

    if (!resolveLib()) {
      console.error('[SkipDetect] A1lib not available.');
      return Promise.reject(new Error('A1lib not available'));
    }
    if (typeof ULTIMATE_AREAS === 'undefined') {
      console.error('[SkipDetect] ULTIMATE_AREAS not defined.');
      return Promise.reject(new Error('ULTIMATE_AREAS not defined'));
    }

    var promises = [];

    // Load area identifier images (same as main detector — needed to know which area is open)
    ULTIMATE_AREAS.forEach(function (area) {
      if (area.areaImage) {
        promises.push(loadRef('area_' + area.id, 'images/ultimate/' + area.areaImage));
      }
    });

    // Load -f images for SKIP_TRY items (silently skips missing files)
    SKIP_TRY.forEach(function (item) {
      var fSlug = itemSlugFound(item);
      promises.push(loadRef(fSlug, 'images/ultimate/' + fSlug + '.png'));
    });

    return Promise.all(promises).then(function () {
      var active = SKIP_TRY.filter(function (item) { return !!refs[itemSlugFound(item)]; });
      var inactive = SKIP_TRY.filter(function (item) { return !refs[itemSlugFound(item)]; });

      console.log('[SkipDetect] Loaded -f images for ' + active.length + '/' + SKIP_TRY.length + ' skip items.');
      if (active.length) console.log('[SkipDetect] Active: ' + active.join(', '));
      if (inactive.length) console.log('[SkipDetect] No -f image (manual only): ' + inactive.join(', '));
      initialized = true;
    });
  }

  // ── Single scan cycle ─────────────────────────────────────────────
  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};

    ULTIMATE_AREAS.forEach(function (area) {
      if (!imageFound('area_' + area.id)) return;

      var areaFound = [];
      var areaNotFound = [];
      var areaNoImage = [];

      area.drops.forEach(function (drop) {
        // Only handle items in SKIP_TRY
        if (SKIP_TRY.indexOf(drop.item) === -1) return;

        var fSlug = itemSlugFound(drop.item);

        if (!refs[fSlug]) {
          areaNoImage.push(drop.item);
          return;
        }

        if (imageFound(fSlug)) {
          // Colored icon found — item obtained
          changes[drop.item] = { v: true, method: '-f found (skip-try)' };
          areaFound.push(drop.item);
        } else {
          // Not found — leave state unchanged (no auto-uncheck)
          areaNotFound.push(drop.item);
        }
      });

      // Per-area log
      var parts = [];
      if (areaFound.length) parts.push('Found: ' + areaFound.join(', '));
      if (areaNotFound.length) parts.push('Not found: ' + areaNotFound.join(', '));
      if (areaNoImage.length) parts.push('No image (manual): ' + areaNoImage.join(', '));
      if (parts.length) console.log('[SkipDetect] ' + area.id + ' | ' + parts.join(' | '));
    });

    if (Object.keys(changes).length && onUpdateCb) {
      onUpdateCb(changes);
    }
  }

  // ── Start/Stop ────────────────────────────────────────────────────
  function start() {
    if (scanInterval) return;
    scanInterval = setInterval(scan, SCAN_MS);
    console.log('[SkipDetect] Scanning started (' + SCAN_MS + 'ms interval).');
  }

  function stop() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
      console.log('[SkipDetect] Scanning stopped.');
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  window.SkipDetector = {
    init: init,
    start: start,
    stop: stop,
    isRunning: function () { return !!scanInterval; },
    isAvailable: function () { return typeof alt1 !== 'undefined' && !!resolveLib(); }
  };

})();
