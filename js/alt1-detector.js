// Ultimate Slayer Alt1 Image Detector
// Position-based detection: compares screen regions against full empty page references
// Falls back to individual -n image matching when page reference unavailable

(function () {
  'use strict';

  var SCAN_MS = 2400; // 4 RuneScape ticks

  var lib = null;
  var refs = {};       // loaded image references keyed by name
  var screen = null;   // latest captured screen
  var scanInterval = null;
  var onUpdateCb = null;
  var initialized = false;

  // ── Grid Layout Constants (RS3 Collection Log) ────────────────────
  var GRID = {
    cols: 6,           // items per row
    colPitch: 42,      // px between column starts
    rowPitch: 38,      // px between row starts
    cellW: 36,         // cell content width
    cellH: 32          // cell content height
  };

  // Comparison threshold — average RGB difference per channel
  // Empty slots are dark grey; obtained items are full-color icons
  var DIFF_THRESHOLD = 15;

  // ── Per-area page reference configurations ──────────────────────────
  // Hardcoded from pixel analysis of each reference image.
  // hdrX/hdrY: where the area header image matches in the reference
  // gridX/gridY: where the first grid cell starts in the reference
  // scrollRows: data rows to skip (for scrolled pages)
  var PAGE_CONFIGS = {
    'asgarnia_misthalin': [
      { file: 'Asgarnia & Misthalin-n.png', hdrX: 20, hdrY: 4, gridX: 4, gridY: 40, scrollRows: 0 }
    ],
    'daemonheim': [
      { file: 'Daemonheim-n.png', hdrX: 20, hdrY: 0, gridX: 6, gridY: 37, scrollRows: 0 }
    ],
    'feldip_hills': [
      { file: 'Feldip Hills-n.png', hdrX: 21, hdrY: 1, gridX: 7, gridY: 38, scrollRows: 0 }
    ],
    'fremennik_province': [
      { file: 'Fremennik Province-n.png', hdrX: 21, hdrY: 2, gridX: 8, gridY: 38, scrollRows: 0 }
    ],
    'kandarin': [
      { file: 'Kandarin-n.png', hdrX: 18, hdrY: 0, gridX: 5, gridY: 34, scrollRows: 0 }
    ],
    'karamja': [
      { file: 'Karamja-n.png', hdrX: 19, hdrY: 0, gridX: 5, gridY: 36, scrollRows: 0 }
    ],
    'keldagrim': [
      { file: 'Keldagrim-n.png', hdrX: 21, hdrY: 0, gridX: 6, gridY: 36, scrollRows: 0 }
    ],
    'kharidian_desert': [
      { file: 'Kharidian Desert-n.png', hdrX: 21, hdrY: 1, gridX: 7, gridY: 37, scrollRows: 0 }
    ],
    'lost_lands': [
      { file: 'Lost Lands and Dungeons-n.png', hdrX: 21, hdrY: 1, gridX: 7, gridY: 66, scrollRows: 0 }
    ],
    'morytania': [
      { file: 'Morytania-n.png', hdrX: 21, hdrY: 2, gridX: 7, gridY: 38, scrollRows: 0 }
    ],
    'other_worlds': [
      { file: 'Other Worlds-n.png', hdrX: 22, hdrY: 4, gridX: 8, gridY: 39, scrollRows: 0 }
    ],
    'senntisten': [
      { file: 'Senntisten-n.png', hdrX: 22, hdrY: 1, gridX: 7, gridY: 37, scrollRows: 0 }
    ],
    'general': [
      { file: 'General Drops-n.png', hdrX: 21, hdrY: 3, gridX: 7, gridY: 39, scrollRows: 0 }
    ],
    'wilderness': [
      { file: 'Wilderness-1n.png', hdrX: 20, hdrY: 0, gridX: 5, gridY: 37, scrollRows: 0 },
      { file: 'Wilderness-2n.png', hdrX: 20, hdrY: 0, gridX: 5, gridY: 61, scrollRows: 2 }
    ]
  };

  // Stored page configs per area (populated during init with refKey added)
  var areaPageConfigs = {};

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

  // ── Image Matching (find subimage on screen) ──────────────────────
  function findImage(name) {
    if (!refs[name] || !screen) return null;
    try {
      var hits = typeof screen.findSubimage === 'function'
        ? screen.findSubimage(refs[name])
        : lib.findSubimage(screen, refs[name]);
      if (Array.isArray(hits) && hits.length >= 2) {
        return { x: hits[0], y: hits[1] };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function imageFound(name) {
    return findImage(name) !== null;
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

  // ── Compare two ImageData regions for similarity ──────────────────
  // Returns average RGB difference per channel (0 = identical)
  function compareRegions(imgA, ax, ay, imgB, bx, by, w, h) {
    if (!imgA || !imgA.data || !imgB || !imgB.data) return 999;
    var totalDiff = 0;
    var pixels = 0;
    for (var dy = 0; dy < h; dy++) {
      var aRow = ay + dy;
      var bRow = by + dy;
      if (aRow < 0 || aRow >= imgA.height || bRow < 0 || bRow >= imgB.height) continue;
      for (var dx = 0; dx < w; dx++) {
        var aCol = ax + dx;
        var bCol = bx + dx;
        if (aCol < 0 || aCol >= imgA.width || bCol < 0 || bCol >= imgB.width) continue;
        var ai = (aRow * imgA.width + aCol) * 4;
        var bi = (bRow * imgB.width + bCol) * 4;
        totalDiff += Math.abs(imgA.data[ai]     - imgB.data[bi]);
        totalDiff += Math.abs(imgA.data[ai + 1] - imgB.data[bi + 1]);
        totalDiff += Math.abs(imgA.data[ai + 2] - imgB.data[bi + 2]);
        pixels++;
      }
    }
    return pixels > 0 ? totalDiff / (pixels * 3) : 999;
  }

  // ── Build item slug for -n image key (fallback) ───────────────────
  function itemSlug(itemName) {
    return itemName.replace(/\s+/g, '_') + '-n';
  }

  function itemSlugFound(itemName) {
    return itemName.replace(/\s+/g, '_') + '-f';
  }

  // Items where -n detection is unreliable (fallback only)
  var REVERSE_DETECT = {
    'Steadfast Boots': true,
    'Glaiven Boots': true,
    'Ragefire Boots': true
  };

  // ── Initialize: load all images ───────────────────────────────────
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

    ULTIMATE_AREAS.forEach(function (area) {
      if (!area.areaImage) return;

      // Load area header image (used for screen detection)
      promises.push(loadRef('area_' + area.id, 'images/ultimate/' + area.areaImage));

      // Load page reference image(s) from hardcoded configs
      var configs = PAGE_CONFIGS[area.id];
      if (configs) {
        configs.forEach(function (cfg, idx) {
          var refKey = 'page_' + area.id + '_' + idx;
          promises.push(loadRef(refKey, 'images/ultimate/' + cfg.file));
        });
      }

      // Load individual -n item images (fallback)
      area.drops.forEach(function (drop) {
        var slug = itemSlug(drop.item);
        promises.push(loadRef(slug, 'images/ultimate/' + slug + '.png'));

        if (REVERSE_DETECT[drop.item]) {
          var fSlug = itemSlugFound(drop.item);
          promises.push(loadRef(fSlug, 'images/ultimate/' + fSlug + '.png'));
        }
      });
    });

    return Promise.all(promises).then(function () {
      // Build page configs with refKey references
      ULTIMATE_AREAS.forEach(function (area) {
        var configs = PAGE_CONFIGS[area.id];
        if (!configs) return;

        var builtConfigs = [];
        configs.forEach(function (cfg, idx) {
          var refKey = 'page_' + area.id + '_' + idx;
          if (refs[refKey]) {
            builtConfigs.push({
              refKey: refKey,
              hdrX: cfg.hdrX,
              hdrY: cfg.hdrY,
              gridX: cfg.gridX,
              gridY: cfg.gridY,
              scrollRows: cfg.scrollRows
            });
          }
        });
        if (builtConfigs.length > 0) {
          areaPageConfigs[area.id] = builtConfigs;
        }
      });

      var areaCount = ULTIMATE_AREAS.filter(function (a) { return refs['area_' + a.id]; }).length;
      var pageCount = Object.keys(areaPageConfigs).length;
      var itemCount = 0;
      ULTIMATE_AREAS.forEach(function (area) {
        area.drops.forEach(function (drop) {
          if (refs[itemSlug(drop.item)]) itemCount++;
        });
      });
      console.log('[UltDetect] Loaded ' + areaCount + ' area images, ' +
        pageCount + ' page-based areas, ' + itemCount + ' item images (fallback).');
      initialized = true;
    });
  }

  // ── Position-based scan using a specific page config ──────────────
  function scanWithConfig(area, screenHdrPos, config, screenData) {
    var pageRef = refs[config.refKey];
    if (!pageRef) return null;

    var scrollRows = config.scrollRows;
    var changes = {};
    var checked = 0;

    area.drops.forEach(function (drop, index) {
      var col = index % GRID.cols;
      var gridRow = Math.floor(index / GRID.cols);

      // Adjust for scroll offset
      var imageRow = gridRow - scrollRows;
      if (imageRow < 0) return; // item scrolled above visible area

      // Position in the page reference image
      var refX = config.gridX + col * GRID.colPitch;
      var refY = config.gridY + imageRow * GRID.rowPitch;

      // Bounds check against reference image
      if (refX + GRID.cellW > pageRef.width || refY + GRID.cellH > pageRef.height) return;

      // Corresponding position on screen (mapped via header anchor)
      var screenX = screenHdrPos.x + (refX - config.hdrX);
      var screenY = screenHdrPos.y + (refY - config.hdrY);

      // Bounds check against screen
      if (screenX < 0 || screenY < 0 ||
          screenX + GRID.cellW > screenData.width ||
          screenY + GRID.cellH > screenData.height) {
        return;
      }

      // Compare screen region against empty reference (skip 2px border)
      var inset = 2;
      var diff = compareRegions(
        screenData, screenX + inset, screenY + inset,
        pageRef, refX + inset, refY + inset,
        GRID.cellW - inset * 2, GRID.cellH - inset * 2
      );

      if (diff > DIFF_THRESHOLD) {
        changes[drop.item] = true;   // obtained
      } else {
        changes[drop.item] = false;  // not obtained
      }
      checked++;
    });

    return checked > 0 ? changes : null;
  }

  // ── Position-based scan for an area ───────────────────────────────
  function scanAreaPositionBased(area, screenHdrPos) {
    var configs = areaPageConfigs[area.id];
    if (!configs || configs.length === 0) return null;

    // Get the full screen as ImageData for pixel comparison
    var screenData;
    try {
      screenData = typeof screen.toData === 'function' ? screen.toData() : screen;
    } catch (e) {
      return null;
    }
    if (!screenData || !screenData.data) return null;

    if (configs.length === 1) {
      // Single page — straightforward
      return scanWithConfig(area, screenHdrPos, configs[0], screenData);
    }

    // Multi-page (e.g., Wilderness) — detect scroll state
    // Compare the first cell position on screen against each reference's first cell
    var bestConfig = configs[0];
    var bestDiff = Infinity;

    configs.forEach(function (config) {
      var pageRef = refs[config.refKey];
      if (!pageRef) return;

      // First cell position in reference
      var refX = config.gridX;
      var refY = config.gridY;

      // Corresponding screen position
      var screenX = screenHdrPos.x + (refX - config.hdrX);
      var screenY = screenHdrPos.y + (refY - config.hdrY);

      if (screenX >= 0 && screenY >= 0 &&
          screenX + GRID.cellW <= screenData.width &&
          screenY + GRID.cellH <= screenData.height) {
        var diff = compareRegions(
          screenData, screenX, screenY,
          pageRef, refX, refY,
          GRID.cellW, GRID.cellH
        );
        if (diff < bestDiff) {
          bestDiff = diff;
          bestConfig = config;
        }
      }
    });

    return scanWithConfig(area, screenHdrPos, bestConfig, screenData);
  }

  // ── Fallback -n image scan for a single area ──────────────────────
  function scanAreaFallback(area) {
    var changes = {};

    area.drops.forEach(function (drop) {
      var slug = itemSlug(drop.item);

      if (REVERSE_DETECT[drop.item]) {
        var fSlug = itemSlugFound(drop.item);
        if (refs[fSlug] && imageFound(fSlug)) {
          changes[drop.item] = true;
        }
      } else {
        if (!refs[slug]) return;
        if (imageFound(slug)) {
          changes[drop.item] = false;
        } else {
          changes[drop.item] = true;
        }
      }
    });

    return changes;
  }

  // ── Single scan cycle ─────────────────────────────────────────────
  function scan() {
    if (typeof alt1 === 'undefined' || !alt1.rsLinked) return;
    if (!captureScreen()) return;

    var changes = {};
    var hasChanges = false;

    ULTIMATE_AREAS.forEach(function (area) {
      var areaKey = 'area_' + area.id;
      var headerPos = findImage(areaKey);
      if (!headerPos) return; // area not visible on screen

      var areaChanges = null;

      // Try position-based detection first (if page reference available)
      if (areaPageConfigs[area.id]) {
        areaChanges = scanAreaPositionBased(area, headerPos);
      }

      // Fall back to individual -n image matching
      if (!areaChanges) {
        areaChanges = scanAreaFallback(area);
      }

      if (areaChanges) {
        Object.keys(areaChanges).forEach(function (item) {
          changes[item] = areaChanges[item];
        });
        hasChanges = true;
      }
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
