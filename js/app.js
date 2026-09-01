/* ==========================================================================
   app.js — UI: wizard, chart rendering, results.
   Depends on js/fitting-engine.js (window.GolfFit).
   ========================================================================== */
(function () {
  'use strict';

  var G = window.GolfFit, U = G.units;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var num = function (el) {
    if (!el) return null;
    var v = parseFloat(el.value);
    return isFinite(v) && v > 0 ? v : null;
  };
  /* Zero is a real answer to "what can you spend?", so the budget field needs
     a reader that does not treat it as blank. */
  var numZero = function (el) {
    if (!el) return null;
    var v = parseFloat(el.value);
    return isFinite(v) && v >= 0 ? v : null;
  };
  var radio = function (name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  };

  /* =====================================================================
     FORM READERS — shared by the wizard and by URL restore
     ================================================================== */
  function isMetric() { return radio('units') === 'metric'; }

  function readHeightInches() {
    if (isMetric()) {
      var cm = num($('#heightCm'));
      return cm ? U.cmToIn(cm) : null;
    }
    var ft = parseFloat($('#heightFt').value);
    var i = parseFloat($('#heightIn').value);
    if (!isFinite(ft)) return null;
    return ft * 12 + (isFinite(i) ? i : 0);
  }
  function readWtfInches() {
    var v = num($('#wtf'));
    if (!v) return null;
    return isMetric() ? U.cmToIn(v) : v;
  }
  function readHandInches() {
    var v = num($('#handLength'));
    if (!v) return null;
    return isMetric() ? U.cmToIn(v) : v;
  }

  /* ---------- the bag ---------- */
  function hasClubs() { return radio('hasClubs') !== 'no'; }

  function checkedValues(name) {
    return $$('input[name="' + name + '"]:checked').map(function (el) { return el.value; });
  }

  function parseWedges(raw) {
    return String(raw || '').split(/[^0-9.]+/)
      .map(parseFloat)
      .filter(function (n) { return isFinite(n) && n >= 44 && n <= 66; })
      .sort(function (a, b) { return a - b; });
  }

  /* Long clubs in playing order, driver first. The checkbox order in the
     markup is already longest-to-shortest, so `checkedValues` preserves it. */
  function readBag() {
    if (!$('#curLongestIron')) return null;
    var picked = checkedValues('curLongs');
    var wedges = parseWedges($('#curWedges') && $('#curWedges').value);
    return {
      hasClubs: hasClubs(),
      hasDriver: picked.indexOf('Driver') !== -1,
      longs: picked.filter(function (v) { return v !== 'Driver'; }),
      longestIron: selNum('#curLongestIron'),
      wedgeLofts: wedges.length ? wedges : null
    };
  }

  /* ---------- collect ---------- */
  function buildInput() {
    return {
      heightIn: readHeightInches(),
      wtfIn: readWtfInches(),
      handLength: readHandInches(),
      gloveSize: $('#gloveSize').value || null,
      age: num($('#age')),
      gender: radio('gender'),
      joints: radio('joints') === 'yes',
      skill: radio('skill'),
      handicap: (function () { var v = parseFloat($('#handicap').value); return isFinite(v) ? v : null; })(),
      pwLoft: num($('#pwLoft')),
      ironCarry: num($('#ironCarry')),
      ironSpeed: num($('#ironSpeed')),
      driverSpeed: num($('#driverSpeed')),
      driverCarry: num($('#driverCarry')),
      shotShape: radio('shotShape'),
      trajectory: radio('trajectory'),
      attack: radio('attack'),
      tempo: radio('tempo'),
      turf: radio('turf'),
      priority: radio('priority'),
      strokeArc: radio('strokeArc'),
      bag: readBag()
    };
  }


  /* =====================================================================
     DRAFT PERSISTENCE
     ---------------------------------------------------------------------
     The URL carries a finished fit, but it is only written on submit — so a
     refresh halfway through the wizard used to lose everything. This keeps a
     rolling copy of whatever is typed, in this browser only, and puts the
     player back on the step they were on.
     ================================================================== */
  var DRAFT_KEY = 'fittingbay.draft.v1';
  var draftTimer = null;

  function store() {
    try {
      var t = window.localStorage;
      t.setItem('__fb', '1'); t.removeItem('__fb');
      return t;
    } catch (e) { return null; }   // private mode, blocked storage, file://
  }

  function collectForm(sel) {
    var out = {};
    $$(sel + ' input, ' + sel + ' select').forEach(function (el) {
      if (el.type === 'radio') { if (el.checked) out['r:' + el.name] = el.value; }
      else if (el.type === 'checkbox') { out['c:' + el.name + ':' + el.value] = el.checked ? 1 : 0; }
      else if (el.id) out['#' + el.id] = el.value;
    });
    return out;
  }

  function applyForm(data) {
    if (!data) return;
    Object.keys(data).forEach(function (k) {
      if (k.indexOf('r:') === 0) { setRadio(k.slice(2), data[k]); return; }
      if (k.indexOf('c:') === 0) {
        var bits = k.split(':');
        var box = document.querySelector('input[name="' + bits[1] + '"][value="' + bits[2] + '"]');
        if (box) box.checked = !!data[k];
        return;
      }
      var el = $(k);
      if (el) el.value = data[k];
    });
  }

  function saveDraft(step) {
    var t = store();
    if (!t || !$('#fitForm')) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try {
        t.setItem(DRAFT_KEY, JSON.stringify({
          v: 1, at: Date.now(),
          step: typeof step === 'number' ? step : currentStepIndex(),
          fit: collectForm('#fitForm'),
          carries: carryOverrides
        }));
      } catch (e) { /* quota or blocked — the tool still works */ }
    }, 250);
  }

  function readDraft() {
    var t = store();
    if (!t) return null;
    try {
      var d = JSON.parse(t.getItem(DRAFT_KEY) || 'null');
      return d && d.v === 1 && d.fit ? d : null;
    } catch (e) { return null; }
  }

  function clearDraft() {
    var t = store();
    if (t) { try { t.removeItem(DRAFT_KEY); } catch (e) { } }
  }

  function syncUnitFields() {
    var el = document.querySelector('input[name="units"]:checked');
    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* =====================================================================
     URL STATE — makes a fit bookmarkable and shareable
     ---------------------------------------------------------------------
     Answers are written into the query string with short, readable keys, so
     a link can be sent to a fitter, saved, or hand-edited. Nothing is stored
     anywhere else and nothing leaves the browser.
     ================================================================== */
  var STATE_VERSION = '1';

  var ENUMS = {
    skill:      { beginner: 'b', high: 'h', mid: 'm', low: 'l', scratch: 's' },
    gender:     { male: 'm', female: 'f' },
    shotShape:  { slice: 'sl', fade: 'fa', straight: 'st', draw: 'dr', hook: 'hk', pull: 'pl', push: 'pu' },
    trajectory: { low: 'l', mid: 'm', high: 'h' },
    attack:     { steep: 'st', neutral: 'ne', shallow: 'sh' },
    tempo:      { smooth: 'sm', moderate: 'mo', aggressive: 'ag' },
    turf:       { soft: 'so', normal: 'no', firm: 'fi' },
    priority:   { forgiveness: 'f', distance: 'd', accuracy: 'a', workability: 'w' },
    strokeArc:  { straight: 'st', slight: 'sl', strong: 'sg' }
  };
  var ENUMS_REV = {};
  Object.keys(ENUMS).forEach(function (k) {
    ENUMS_REV[k] = {};
    Object.keys(ENUMS[k]).forEach(function (full) { ENUMS_REV[k][ENUMS[k][full]] = full; });
  });

  /* fit answers: [query key, element id or radio name, kind] */
  var FIT_FIELDS = [
    ['gl', 'gloveSize', 'val'], ['age', 'age', 'val'], ['hcp', 'handicap', 'val'],
    ['pw', 'pwLoft', 'val'], ['ic', 'ironCarry', 'val'], ['is', 'ironSpeed', 'val'],
    ['ds', 'driverSpeed', 'val'], ['dc', 'driverCarry', 'val'],
    ['gd', 'gender', 'enum:gender'], ['sk', 'skill', 'enum:skill'],
    ['ss', 'shotShape', 'enum:shotShape'], ['tj', 'trajectory', 'enum:trajectory'],
    ['ak', 'attack', 'enum:attack'], ['tp', 'tempo', 'enum:tempo'],
    ['tf', 'turf', 'enum:turf'], ['pr', 'priority', 'enum:priority'],
    ['sa', 'strokeArc', 'enum:strokeArc']
  ];

  /* audit answers */
  var AUDIT_FIELDS = [
    ['aL', 'curIronLength'], ['aA', 'curIronLie'], ['aF', 'curIronFlex'],
    ['aM', 'curIronMaterial'], ['aG', 'curGripSize'], ['aI', 'curLongestIron'],
    ['aDL', 'curDriverLoft'], ['aDN', 'curDriverLength'], ['aW', 'curWedges'],
    ['aB', 'curBall'], ['aBU', 'curBudget']
  ];

  function r2(v) { return Math.round(v * 100) / 100; }

  function buildQuery(includeAudit) {
    var p = [];
    function put(k, v) {
      if (v === null || v === undefined || v === '') return;
      p.push(k + '=' + encodeURIComponent(v));
    }
    put('sv', STATE_VERSION);
    if (isMetric()) put('u', 'm');
    put('h', r2(readHeightInches()));
    put('w', r2(readWtfInches()));
    var hand = readHandInches();
    if (hand) put('hl', r2(hand));
    if (radio('joints') === 'yes') put('jt', '1');

    FIT_FIELDS.forEach(function (f) {
      var key = f[0], id = f[1], kind = f[2];
      if (kind === 'val') {
        var el = $('#' + id);
        put(key, el && el.value !== '' ? el.value : null);
      } else {
        var name = kind.split(':')[1];
        var v = radio(id);
        put(key, v ? ENUMS[name][v] : null);
      }
    });

    if (includeAudit && $('#curLongestIron')) {
      AUDIT_FIELDS.forEach(function (f) {
        var el = $('#' + f[1]);
        if (el && el.value !== '') put(f[0], el.value);
      });
      var adj = radio('curAdj');
      if (adj) put('aDA', adj === 'yes' ? '1' : '0');
      put('aHC', hasClubs() ? '1' : '0');
      var longs = checkedValues('curLongs');
      put('aLG', longs.join('.'));
    }
    return p.join('&');
  }

  function parseQuery(search) {
    var out = {};
    (search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      if (k) out[k] = v;
    });
    return out;
  }

  function setVal(id, v) {
    var el = $('#' + id);
    if (el && v !== undefined && v !== null && v !== '') el.value = v;
  }
  function setRadio(name, value) {
    if (!value) return;
    var el = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  /**
   * Write the query string into the form. Returns false if the state is
   * missing or unusable, in which case the caller leaves the wizard alone.
   */
  function applyState(q) {
    var h = parseFloat(q.h), w = parseFloat(q.w);
    if (!isFinite(h) || !isFinite(w)) return false;
    if (h < 42 || h > 90 || w < 20 || w > 48 || w > h * 0.75) return false;

    var metric = q.u === 'm';
    setRadio('units', metric ? 'metric' : 'imperial');
    var unitsEl = document.querySelector('input[name="units"]:checked');
    if (unitsEl) unitsEl.dispatchEvent(new Event('change', { bubbles: true }));

    if (metric) {
      setVal('heightCm', Math.round(U.inToCm(h) * 10) / 10);
      setVal('wtf', Math.round(U.inToCm(w) * 10) / 10);
      if (q.hl) setVal('handLength', Math.round(U.inToCm(parseFloat(q.hl)) * 10) / 10);
    } else {
      var ft = Math.floor(h / 12);
      setVal('heightFt', ft);
      setVal('heightIn', Math.round((h - ft * 12) * 10) / 10);
      setVal('wtf', w);
      if (q.hl) setVal('handLength', q.hl);
    }
    setRadio('joints', q.jt === '1' ? 'yes' : 'no');

    FIT_FIELDS.forEach(function (f) {
      var key = f[0], id = f[1], kind = f[2];
      if (q[key] === undefined) return;
      if (kind === 'val') setVal(id, q[key]);
      else {
        var name = kind.split(':')[1];
        setRadio(id, ENUMS_REV[name][q[key]]);
      }
    });
    return true;
  }

  function applyAuditState(q) {
    var any = false;
    AUDIT_FIELDS.forEach(function (f) {
      if (q[f[0]] !== undefined) { setVal(f[1], q[f[0]]); any = true; }
    });
    if (q.aDA !== undefined) { setRadio('curAdj', q.aDA === '1' ? 'yes' : 'no'); any = true; }
    if (q.aHC !== undefined) { setRadio('hasClubs', q.aHC === '1' ? 'yes' : 'no'); any = true; }
    if (q.aLG !== undefined) {
      var want = q.aLG.split('.');
      $$('input[name="curLongs"]').forEach(function (el) { el.checked = want.indexOf(el.value) !== -1; });
      any = true;
    }
    syncBagFields();
    return any;
  }

  function writeUrl(push, includeAudit) {
    if (!window.history || !history.replaceState) return;
    var qs = buildQuery(includeAudit);
    var url = location.pathname + (qs ? '?' + qs : '');
    try {
      if (push) history.pushState({ fit: 1 }, '', url);
      else history.replaceState({ fit: 1 }, '', url);
    } catch (e) { /* file:// in some browsers — the tool still works */ }
  }

  function clearUrl() {
    if (!window.history || !history.replaceState) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
  }

  /* ---------- run the fit from whatever is currently in the form ---------- */
  function runFitFromForm() {
    var input = buildInput();
    var result = G.fit(input);
    lastFit = result;
    renderResults(result);
    renderChart($('#chartFull'), input.heightIn, input.wtfIn, true);
    if (hasClubs()) runAudit();
    $('#wizardSection').style.display = 'none';
    $('#results').classList.add('show');
    return result;
  }

  function runAudit() {
    if (!lastFit || !$('#auditResults')) return;
    var cur = readAuditInput();
    cur.carries = currentCarries();
    renderAudit(G.audit(lastFit, cur, numZero($('#curBudget'))));
  }

  function restoreFromUrl(scroll) {
    if (!$('#fitForm')) return false;
    var q = parseQuery(location.search);
    if (!q.h || !applyState(q)) return false;
    var d = readDraft();
    if (d && d.carries) carryOverrides = d.carries;
    /* The bag has to be in place BEFORE the fit runs, or the carry ladder is
       built from the recommended set instead of the player's own clubs.
       runFitFromForm() runs the audit itself once the bag is present. */
    applyAuditState(q);
    runFitFromForm();
    if (scroll) scrollToFit();
    return true;
  }

  /* Someone opening a link you sent them wants the fit, not the pitch. The
     browser restores its own scroll position after load, which used to undo
     this, so ownership of the scroll has to be taken first and the move made
     after the layout has settled. */
  function scrollToFit() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { }
    var go = function () {
      var el = $('#fit');
      if (!el) return;
      /* html { scroll-behavior: smooth } wins over behavior:'auto' passed in
         the options object, and a glide is wrong here anyway: the reader
         should already be at the fit, not watch the page travel to it. */
      var de = document.documentElement, was = de.style.scrollBehavior;
      de.style.scrollBehavior = 'auto';
      window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 74);
      de.style.scrollBehavior = was;
    };
    go();
    requestAnimationFrame(function () { requestAnimationFrame(go); });
    window.addEventListener('load', go, { once: true });
  }

  function restoreDraft() {
    var d = readDraft();
    if (!d) return false;
    applyForm(d.fit);
    syncUnitFields();
    applyForm(d.fit);            // re-apply: switching units re-shows fields
    if (d.carries) carryOverrides = d.carries;
    syncBagFields();
    if (typeof d.step === 'number' && d.step > 0) goToStep(d.step);
    var n = $('#draftNotice');
    if (n) {
      n.hidden = false;
      $('#draftClearBtn').addEventListener('click', function () {
        clearDraft();
        location.href = location.pathname;
      });
    }
    return true;
  }

  /* ---------- copy link ---------- */
  function copyLink(btn) {
    var url = location.href;
    var done = function (ok) {
      var was = btn.textContent;
      btn.textContent = ok ? 'Link copied' : 'Press Ctrl+C';
      btn.disabled = ok;
      setTimeout(function () { btn.textContent = was; btn.disabled = false; }, ok ? 2000 : 4000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { legacyCopy(url, done); });
    } else {
      legacyCopy(url, done);
    }
  }

  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!ok) {
      // last resort: show it so the user can copy it by hand
      var box = $('#shareFallback');
      if (box) {
        box.hidden = false;
        var inp = $('#shareUrl');
        inp.value = text;
        inp.focus();
        inp.select();
      }
    }
    done(ok);
  }

  /* =====================================================================
     WIZARD
     ================================================================== */
  var currentStepIndex = function () { return 0; };
  var goToStep = function () { };

  function initWizard() {
    var steps = $$('#fitForm .step');
    var current = 0;
    currentStepIndex = function () { return current; };
    goToStep = function (i) { showStep(i); };
    var progress = $('#progress');
    var stepTitle = $('#stepTitle'), stepNum = $('#stepNum'), stepTotal = $('#stepTotal');
    var backBtn = $('#backBtn'), nextBtn = $('#nextBtn'), submitBtn = $('#submitBtn');
    var formErr = $('#formErr');
    var painted = false;

    stepTotal.textContent = steps.length;
    steps.forEach(function (s) {
      var h = $('[data-role="help"]', s);
      if (h) h.textContent = s.getAttribute('data-help') || '';
      progress.insertAdjacentHTML('beforeend', '<i></i>');
    });

    function showStep(i) {
      current = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (s, n) { s.classList.toggle('active', n === current); });
      $$('#progress i').forEach(function (b, n) {
        b.className = n < current ? 'done' : n === current ? 'now' : '';
      });
      stepTitle.textContent = steps[current].getAttribute('data-title') || '';
      stepNum.textContent = current + 1;
      if (painted) stepTitle.focus();
      painted = true;
      /* Disabled it still occupied the row and still looked like a control.
         There is nothing behind step one, so there is nothing to show. */
      backBtn.hidden = current === 0;
      var last = current === steps.length - 1;
      nextBtn.hidden = last;
      submitBtn.hidden = !last;
      formErr.textContent = '';
      var top = $('#fit').getBoundingClientRect().top + window.pageYOffset - 74;
      if (window.pageYOffset > top + 40 || current > 0) window.scrollTo({ top: top, behavior: 'smooth' });
    }

    function validateStep(i) {
      if (i === 0) {
        var h = readHeightInches();
        if (!h) return 'Enter your height.';
        if (h < 42 || h > 90) return 'That height looks wrong — check the units.';
        /* Optional: without it we assume average proportions for the height
           and say so. Only validate what was actually typed. */
        var w = readWtfInches();
        if (w) {
          if (w < 20 || w > 48) return 'That wrist-to-floor looks wrong — it should be roughly 27"–40" (69–102 cm). Leave it blank if you have not measured it.';
          if (w > h * 0.75) return 'Your wrist-to-floor is larger than three quarters of your height, which is not physically possible. Check you have not swapped the two, or mixed inches and centimetres.';
        }
      }
      return null;
    }

    nextBtn.addEventListener('click', function () {
      var err = validateStep(current);
      if (err) { formErr.textContent = err; return; }
      showStep(current + 1);
      saveDraft();
    });
    backBtn.addEventListener('click', function () { showStep(current - 1); saveDraft(); });

    $('#fitForm').addEventListener('input', function () { saveDraft(); });
    $('#fitForm').addEventListener('change', function () { saveDraft(); });

    $$('input[name="units"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var m = isMetric();
        $$('[data-unit="imperial"]').forEach(function (el) { el.hidden = m; });
        $$('[data-unit="metric"]').forEach(function (el) { el.hidden = !m; });
        $('#wtfHint').innerHTML = (m ? 'Centimetres. ' : 'Inches. ') +
          'Stand straight on a hard floor, shoulders relaxed, arms hanging naturally at your sides. Measure from the ' +
          '<b>crease of your wrist</b> straight down to the floor. Get someone else to do it — reaching down ' +
          'yourself changes the answer.';
        $('#handHint').innerHTML = (m ? 'Centimetres, ' : 'Inches, ') +
          'from the crease of your wrist to the tip of your middle finger. Keep the tape flat against your palm — ' +
          'do not curve it over the fingertip or around the heel pad.';
        $('#wtf').placeholder = m ? 'e.g. 86' : 'e.g. 34';
        $('#handLength').placeholder = m ? 'e.g. 19' : 'e.g. 7.5';
        $('#wtfUnit').textContent = m ? 'cm' : 'in';
        $('#handUnit').textContent = m ? 'cm' : 'in';
      });
    });

    $('#fitForm').addEventListener('submit', function (e) {
      e.preventDefault();
      for (var i = 0; i < steps.length; i++) {
        var err = validateStep(i);
        if (err) { showStep(i); formErr.textContent = err; return; }
      }
      formErr.textContent = '';
      runFitFromForm();
      writeUrl(true, true);
      saveDraft(0);
      window.scrollTo({ top: $('#fit').getBoundingClientRect().top + window.pageYOffset - 74, behavior: 'smooth' });
    });

    $('#editBtn').addEventListener('click', function () {
      $('#results').classList.remove('show');
      $('#wizardSection').style.display = '';
      clearUrl();
      showStep(0);
    });
      $('#printBtn').addEventListener('click', function () { window.print(); });

    showStep(0);
  }

  /* =====================================================================
     CHART
     ================================================================== */
  /* ---------------------------------------------------------------------
     The Bay Scale chart.

     Deliberately not a filled colour-zone lookup table. That format exists
     because a printed chart had to be read with a finger on paper; we do the
     arithmetic, so the drawing can show the arithmetic instead.

     What you get: a reference curve (the wrist-to-floor that plays a
     standard lie at each height), faint contours at each whole code, ONE
     tinted band — the one you are in — and your measurement plotted with a
     dimension line down to the curve. The length of that line is the answer.

     Code labels sit at the ends of the contours like any contour plot, not
     written inside the bands.
     ------------------------------------------------------------------ */
  function renderChart(host, playerH, playerW, big) {
    if (!host) return;
    var W = big ? 900 : 420, H = big ? 500 : 300;
    var padL = big ? 58 : 40, padR = big ? 78 : 20, padT = big ? 30 : 22, padB = big ? 48 : 34;
    var pw = W - padL - padR, ph = H - padT - padB;
    var h0 = 60, h1 = 79, w0 = 28.5, w1 = 40.5;
    var SMIN = G.scaleRange[0], SMAX = G.scaleRange[1];
    var uid = big ? 'B' : 'S';

    var x = function (h) { return padL + (h - h0) / (h1 - h0) * pw; };
    var y = function (w) { return padT + (w1 - w) / (w1 - w0) * ph; };
    var inY = function (v) { return v >= padT - 1 && v <= padT + ph + 1; };

    /* One polyline sampled along the reference curve, offset by `off`. The
       gradient slices can be sampled coarsely — they are filled shapes, not
       lines, so nobody sees the facets. */
    function curvePts(off, step) {
      var p = [], st = step || 0.5;
      /* The sample step does not divide the height range evenly, so walking it
         with a <= test used to stop an inch short and leave an unpainted strip
         down the right edge of the small chart. Finish on h1 explicitly. */
      for (var h = h0; h < h1 - 0.0001; h += st) p.push(x(h) + ',' + y(G.levelCentre(h) + off));
      p.push(x(h1) + ',' + y(G.levelCentre(h1) + off));
      return p.join(' ');
    }
    function band(lo, hi, fill, step) {
      return '<polygon points="' + curvePts(lo, step) + ' ' +
        curvePts(hi, step).split(' ').reverse().join(' ') + '" fill="' + fill + '" shape-rendering="crispEdges"/>';
    }

    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="scale-chart" xmlns="http://www.w3.org/2000/svg" role="img" ' +
      'aria-label="The Bay Scale: the reference wrist-to-floor for each height, with your measurement plotted against it.">');
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0d1210"/>');
    s.push('<defs><clipPath id="sc' + uid + '"><rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>');

    /* ---- grid ---- */
    s.push('<g stroke="#ffffff" stroke-opacity=".05" stroke-width="1">');
    for (var gw = 29; gw <= 40; gw++) s.push('<line x1="' + padL + '" y1="' + y(gw) + '" x2="' + (padL + pw) + '" y2="' + y(gw) + '"/>');
    for (var gh = h0; gh <= h1; gh += (big ? 1 : 2)) s.push('<line x1="' + x(gh) + '" y1="' + padT + '" x2="' + x(gh) + '" y2="' + (padT + ph) + '"/>');
    s.push('</g>');

    var code = (playerH && playerW) ? G.staticLie(playerH, playerW).code : null;

    s.push('<g clip-path="url(#sc' + uid + ')">');

    /* ---- the colour field ----------------------------------------------
       Colour follows the DEVIATION, not the raw measurement, so the field is
       built from slices offset along the reference curve. Sit on the line at
       any height and you are the same green.

       FIELD is the one number to change if this wants to be louder or
       quieter. It was 0.62, on the reasoning that full strength would fight
       the axis labels. That reasoning was wrong: the axis labels, the height
       ticks and the code ruler are all drawn OUTSIDE the plot frame, on the
       page background, so this opacity never touched them. Everything inside
       the frame — the reference curve, the LEVEL label, the marker and its
       annotation — is white on a dark halo precisely so it survives a
       saturated field.

       Dimming it also broke the promise the swatch makes. At 0.62 a fit named
       Teal 63 (#3EB8BF, 50% lightness) was painted #2B7B79 at 33% — the right
       hue, a third too dark — so people looked for their colour on the chart
       and could not find it. At 1 the chart shows the colour it names. */
    var FIELD = 1;
    var slice = big ? 0.2 : 0.3;
    var sample = big ? 1 : 1.5;

    s.push('<g opacity="' + FIELD + '">');
    s.push(band(-20, SMIN, G.scale[0].hex, sample));
    for (var d = SMIN; d < SMAX - 0.0001; d += slice) {
      s.push(band(d, d + slice, G.colourAt(d + slice / 2), sample));
    }
    s.push(band(SMAX, 20, G.scale[G.scale.length - 1].hex, sample));
    s.push('</g>');

    /* ---- contours between codes: dark over colour, so they recede ---- */
    if (big) {
      for (var k = SMIN; k < SMAX; k++) {
        s.push('<polyline points="' + curvePts(k + 0.5) + '" fill="none" stroke="#0d1210" stroke-opacity=".3" stroke-width="1"/>');
      }
    }

    /* ---- the reference curve itself ---- */
    s.push('<polyline points="' + curvePts(0) + '" fill="none" stroke="#ffffff" stroke-opacity=".92" stroke-width="' +
      (big ? 2.6 : 2) + '" stroke-linecap="round"/>');
    s.push('</g>');

    /* ---- frame ---- */
    s.push('<rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="#2a3630"/>');

    var F = 'ui-sans-serif,system-ui,sans-serif';
    /* These were set when the plot area was empty. They now sit alongside a
       fully saturated colour field, and needed to come up to meet it. */
    var axis = '#94a39a';

    /* ---- code labels at the ends of the contours, not inside the bands ---- */
    if (big) {
      var endCentre = G.levelCentre(h1);
      G.scale.forEach(function (c) {
        var yy = y(endCentre + c.i);
        if (!inY(yy)) return;
        var here = code && c.i === code.i;
        s.push('<text x="' + (padL + pw + 10) + '" y="' + (yy + 3.5) + '" font-size="11" font-family="' + F + '" ' +
          'font-weight="' + (here ? '800' : '600') + '" fill="' + (here ? '#e8eeea' : axis) + '">' + esc(c.code) + '</text>');
      });
      s.push('<text x="' + (padL + pw + 10) + '" y="' + (padT - 10) + '" font-size="9" letter-spacing="1" font-family="' + F + '" fill="' + axis + '">CODE</text>');
    }

    /* ---- label the reference line where there is room ---- */
    var lx = big ? x(64) : x(63);
    s.push('<text x="' + lx + '" y="' + (y(G.levelCentre(big ? 64 : 63)) - 9) + '" font-size="' + (big ? 11.5 : 10) +
      '" font-weight="800" font-family="' + F + '" fill="#ffffff" stroke="#0d1210" stroke-width="3" paint-order="stroke" ' +
      'stroke-linejoin="round">LEVEL' + (big ? ' — standard lie' : '') + '</text>');

    /* ---- axes ---- */
    s.push('<g font-size="' + (big ? 10.5 : 9.6) + '" font-family="' + F + '" fill="' + axis + '">');
    for (var lw = 29; lw <= 40; lw += (big ? 2 : 3)) {
      s.push('<text x="' + (padL - 8) + '" y="' + (y(lw) + 3.5) + '" text-anchor="end">' + lw + '"</text>');
    }
    for (var lh = h0; lh <= h1; lh += (big ? 3 : 5)) {
      s.push('<text x="' + x(lh) + '" y="' + (padT + ph + 16) + '" text-anchor="middle">' +
        Math.floor(lh / 12) + "'" + (lh % 12) + '"</text>');
    }
    s.push('<text x="' + (padL - (big ? 44 : 32)) + '" y="' + (padT + ph / 2) + '" text-anchor="middle" transform="rotate(-90 ' +
      (padL - (big ? 44 : 32)) + ' ' + (padT + ph / 2) + ')">Wrist to floor</text>');
    s.push('<text x="' + (padL + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">Height</text>');
    s.push('</g>');

    /* ---- you, and the distance from the line that IS your code ---- */
    if (code) {
      var px = x(Math.max(h0, Math.min(h1, playerH)));
      var pyYou = y(Math.max(w0, Math.min(w1, playerW)));
      var pyRef = y(G.levelCentre(Math.max(h0, Math.min(h1, playerH))));
      var delta = G.staticLie(playerH, playerW).preciseDegrees;
      var tick = big ? 7 : 5;

      s.push('<g stroke="#ffffff" stroke-width="' + (big ? 1.8 : 1.5) + '">');
      s.push('<line x1="' + px + '" y1="' + pyYou + '" x2="' + px + '" y2="' + pyRef + '"/>');
      s.push('<line x1="' + (px - tick) + '" y1="' + pyRef + '" x2="' + (px + tick) + '" y2="' + pyRef + '"/>');
      s.push('</g>');

      s.push('<circle cx="' + px + '" cy="' + pyYou + '" r="' + (big ? 7 : 5.5) + '" fill="#0d1210" stroke="#ffffff" stroke-width="3"/>');
      s.push('<circle cx="' + px + '" cy="' + pyYou + '" r="' + (big ? 2.4 : 2) + '" fill="#f4f7f5"/>');

      /* annotation, flipped to whichever side has room */
      var left = px > padL + pw * 0.62;
      var ax = left ? px - (big ? 16 : 12) : px + (big ? 16 : 12);
      var anchor = left ? 'end' : 'start';
      var ay = (pyYou + pyRef) / 2;
      s.push('<text x="' + ax + '" y="' + (ay - 2) + '" text-anchor="' + anchor + '" font-size="' + (big ? 13 : 11.5) +
        '" font-weight="800" font-family="' + F + '" fill="#ffffff" stroke="#0d1210" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">' +
        (delta > 0 ? '+' : '') + delta.toFixed(1) + '&#176;</text>');
      s.push('<text x="' + ax + '" y="' + (ay + (big ? 14 : 12)) + '" text-anchor="' + anchor + '" font-size="' + (big ? 11 : 10) +
        '" font-weight="700" font-family="' + F + '" fill="#ffffff" stroke="#0d1210" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">' + esc(code.code) + '</text>');
      if (big) {
        s.push('<text x="' + ax + '" y="' + (ay + 29) + '" text-anchor="' + anchor + '" font-size="10" font-family="' + F +
          '" fill="' + axis + '">from the line</text>');
      }
    }

    s.push('</svg>');
    host.innerHTML = s.join('');
  }

  /* =====================================================================
     RESULTS
     ================================================================== */
  function kv(label, value, sub) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + value + (sub ? '<br><i class="tiny">' + esc(sub) + '</i>' : '') + '</b></div>';
  }
  /* Detail the reader can reach for, rather than has to scroll past. The
     headline verdict, the warnings and the audit stay open; the per-club
     breakdown, the yardages and the build sheet fold away. */
  function group(title, note, body, open) {
    return '<details class="result-group"' + (open ? ' open' : '') + '>' +
      '<summary><b>' + esc(title) + '</b>' + (note ? ' <span class="tiny">' + esc(note) + '</span>' : '') + '</summary>' +
      '<div class="result-group-body">' + body + '</div></details>';
  }

  /* One vocabulary, drawn the same way, instead of the old mix of single
     letters (I, D, W, G, P, B, S) and punctuation glyphs. Icons are kept for
     the structural blocks, where they mark a change of purpose; the eight spec
     cards drop them, because "Driver" was never ambiguous and eight more
     decorated squares only added noise to an already long page. */
  var ICONS = {
    trust:  '<path d="M8 1.4 14 4v4.2c0 3.4-2.4 5.5-6 6.4-3.6-.9-6-3-6-6.4V4z"/>',
    warn:   '<path d="M8 1.6 15 14H1z"/><path d="M8 6.2v3.4M8 11.4v.6"/>',
    bench:  '<circle cx="8" cy="8" r="6.3"/><path d="M3.6 11.2 12.4 4.4"/>',
    bag:    '<path d="M4.4 5.5h7.2l-.7 8.6H5.1z"/><path d="M6 5.5V3.1M8 5.5V1.9M10 5.5V3.6"/>',
    ladder: '<path d="M2.2 13.4h11.6"/><path d="M4.4 13.4V9.6M8 13.4V6.2M11.6 13.4V2.9"/>',
    sheet:  '<rect x="2.4" y="1.9" width="11.2" height="12.2" rx="1.4"/><path d="M5.2 5.6h5.6M5.2 8h5.6M5.2 10.4h3.4"/>',
    fix:    '<path d="M10.2 1.9a3.6 3.6 0 0 0-3.1 5.4L2 12.4l1.6 1.6 5.1-5.1a3.6 3.6 0 0 0 4.6-4.7l-2 2-1.9-1.9 2-2a3.6 3.6 0 0 0-1.2-.4z"/>'
  };
  function icon(name) {
    return '<span class="ico"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] + '</svg></span>';
  }

  /* Sixteen sibling panels made "How much to trust this" look exactly as
     important as "Golf ball". These rules split the page into the answer,
     what to do about it, and the reference behind it. */
  function tierHead(label, note) {
    return '<div class="tier-head"><b>' + esc(label) + '</b>' +
      (note ? '<i>' + esc(note) + '</i>' : '') + '</div>';
  }

  function card(title, body) {
    return '<div class="panel card spec"><h3>' + esc(title) + '</h3>' + body + '</div>';
  }
  function list(items) {
    if (!items || !items.length) return '';
    return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  function renderResults(r) {
    var c = r.lie.code;
    var sw = r.lie.swatch;
    var out = [];

    /* ---- verdict ---- */
    var v = [];
    /* The verdict wears the player's own interpolated colour along its top
       edge — two people in the same code are not quite the same shade. */
    v.push('<div class="panel verdict" style="--fit-colour:' + sw.hex + '"><div class="verdict-main">');
    v.push('<p class="eyebrow" style="margin-bottom:.7rem">Static fit &mdash; irons</p>');
    v.push('<div class="dot-badge"><span class="code-chip" style="background:' + sw.hex + ';color:' + sw.ink + '">' + esc(c.code) + '</span>' +
      '<span><b>' + esc(c.label) + ' lie angle</b><em>measured deviation ' +
      (r.lie.preciseDegrees > 0 ? '+' : '') + r.lie.preciseDegrees + '°</em></span></div>');
    v.push('<div class="spec-row">');
    v.push('<div class="spec-cell"><span>Lie angle</span><b>' + esc(c.label) + '</b><i>7-iron: ' + (62 + c.deg).toFixed(1) + '&deg;</i></div>');
    v.push('<div class="spec-cell"><span>Length</span><b>' + esc(U.fmtAdj(r.length.adj)) + '</b><i>7-iron: ' + U.fmtIn(specFor(r, '7-iron').length, 2) + '</i></div>');
    v.push('<div class="spec-cell"><span>Iron shaft</span><b>' + esc(r.shafts.ironFlex) + '</b><i>' + esc(r.shafts.material) + ', ' + esc(r.shafts.ironWeight.split(' (')[0]) + '</i></div>');
    v.push('<div class="spec-cell"><span>Grip</span><b>' + esc(r.grip.size.split(' (')[0]) + '</b><i>' + (r.input.handLength ? U.fmtIn(r.input.handLength, 1) + ' hand' : 'from glove size') + '</i></div>');
    v.push('</div>');

    var sens = r.sensitivity;
    if (sens && sens.fragile) {
      v.push('<p class="sens-line">You are <b>' + esc(U.fmtIn(sens.margin, 2)) + '</b> from the edge of this band. ' +
        'A measuring error that small would make you <b>' + esc(sens.nearer.code) + '</b> instead, so measure ' +
        'twice before anyone bends anything.</p>');
    } else if (sens) {
      v.push('<p class="sens-line ok">Comfortably inside the band &mdash; your wrist-to-floor would have to be ' +
        '<b>' + esc(U.fmtIn(sens.margin, 2)) + '</b> out before this stopped reading <b>' + esc(r.lie.code.code) + '</b>.</p>');
    }

    if (r.length.note) v.push('<div class="note warn">Height ' + esc(U.fmtHeight(r.input.heightIn)) + ' is ' + esc(r.length.note) + '.</div>');
    v.push('<div class="note ' + (r.lengthAgreement.status === 'agree' ? 'good'
      : r.lengthAgreement.status === 'conflict' ? 'warn' : '') + '">' + esc(r.lengthAgreement.text) + '</div>');
    v.push('</div>');
    v.push('<div class="verdict-chart"><h4>Where you sit on the chart</h4><div id="miniChart"></div>' +
      '<div class="swatch-line"><span class="swatch-dot" style="background:' + sw.hex + '"></span>' +
      '<b>' + esc(sw.label) + '</b><i>' + esc(sw.hex) + '</i></div>' +
      '<p class="tiny" style="margin-top:12px">Height ' + esc(U.fmtHeight(r.input.heightIn)) + ' &middot; wrist-to-floor ' +
      esc(U.fmtIn(r.input.wtfIn, 1)) + '. The LEVEL band at your height runs ' +
      esc(U.fmtIn(r.lie.levelBand[0], 1)) + '&ndash;' + esc(U.fmtIn(r.lie.levelBand[1], 1)) + '.</p></div>');
    v.push('</div>');
    out.push(v.join(''));

    out.push(tierHead('What to do about it', 'the caveats, the confidence, and the changes worth making'));
    out.push('<div class="tier-act">');

    /* "Read this first" was the third thing on the page. It is now the first
       thing after the verdict, which is what the words promise. */
    if (r.flags.length) {
      out.push('<div class="panel card" style="margin-bottom:18px"><h3>' + icon('warn') + 'Read this first</h3>' +
        r.flags.map(function (f) {
          return '<div class="note' + (f.level === 'warn' ? ' warn' : '') + '">' + esc(f.text) + '</div>';
        }).join('') + '</div>');
    }

    var cf = r.confidence;
    out.push('<div class="panel card conf conf-' + cf.overall + '" style="margin-bottom:18px">' +
      '<h3>' + icon('trust') + 'How much to trust this' +
      '<span class="conf-badge conf-' + cf.overall + '">' + esc(cf.overall) + ' confidence</span></h3>' +
      '<p class="small">' + esc(cf.headline) + '</p>' +
      '<div class="conf-grid">' + cf.areas.map(function (a) {
        return '<div class="conf-area conf-' + a.level + '">' +
          '<span class="conf-pip"></span>' +
          '<div><b>' + esc(a.name) + '</b><em>' + esc(a.why) + '</em>' +
          (a.fix ? '<i>' + esc(a.fix) + '</i>' : '') + '</div></div>';
      }).join('') + '</div>' +
      (cf.assumed.length
        ? '<div class="note">You told us you were not sure about ' + esc(listWords(cf.assumed)) +
          ', so we used the neutral answer in each case. That is fine &mdash; but the parts marked amber or red above ' +
          'are the ones that would change if you came back and filled them in.</div>'
        : '') +
      '</div>');

    /* The audit is the actionable part, so it sits above the explanation of
       the recommendation rather than below it. */
    out.push('<div id="auditResults"></div>');

    /* Seed the bench with what THIS player would feel playing standard-lie
       clubs. Needing U2 means standard heads sit 2 degrees flat for you,
       which shows up as heel-up — so the sign flips. */
    if (r.lie.code.deg !== 0) {
      var seedErr = Math.max(-4, Math.min(4, -r.lie.code.deg));
      out.push('<div class="panel card no-print" style="margin-bottom:18px">' +
        '<h3>' + icon('bench') + 'What ' + esc(r.lie.code.code) + ' actually means</h3>' +
        '<div data-lie-bench data-lie="' + seedErr + '" data-loft="31" data-intro="' +
        'You came out ' + esc(r.lie.code.code) + '. That means a standard-lie head sits about ' +
        Math.abs(r.lie.code.deg) + '\u00b0 too ' + (r.lie.code.deg > 0 ? 'flat' : 'upright') +
        ' for you, which at impact looks like this. Drag the loft slider to see why it matters more in your wedges."></div>' +
        '</div>');
    }

    out.push('</div>');
    out.push(tierHead('The detail', 'every recommendation, and the numbers behind it'));

    var cards = [];

    /* ---- irons ---- */
    var ironBody = kv('Head category', esc(r.ironHead.category)) +
      kv('Lie angle', esc(c.code) + ' &mdash; ' + esc(c.label), 'measured deviation ' + (r.lie.preciseDegrees > 0 ? '+' : '') + r.lie.preciseDegrees + '°') +
      kv('Length', esc(U.fmtAdj(r.length.adj)) + ' from standard') +
      kv('Shaft', esc(r.shafts.material) + ', ' + esc(r.shafts.ironFlexName)) +
      kv('Shaft weight', esc(r.shafts.ironWeight)) +
      kv('Launch profile', esc(r.shafts.profile)) +
      '<div class="why"><b>Why this head:</b> ' + esc(r.ironHead.why) + '</div>' +
      '<div class="why" style="border-top:0;padding-top:0"><b>Worth considering:</b> ' + esc(r.ironHead.alternative) + '</div>';
    if (r.shafts.graphiteReasons.length) ironBody += '<div class="why"><b>On shaft material:</b>' + list(r.shafts.graphiteReasons) + '</div>';
    if (r.shafts.tempoNote) ironBody += '<div class="note">' + esc(r.shafts.tempoNote) + '</div>';
    ironBody += '<div class="note' + (r.dynamicLie.severity === 'warn' ? ' warn' : '') + '">' + esc(r.dynamicLie.text) + '</div>';
    ironBody += '<p class="small" style="margin-top:12px"><a href="fitting-information.html#bench">See what ' +
      esc(r.lie.code.code) + ' actually does to a clubface &rarr;</a></p>';
    cards.push(card('Irons', ironBody));

    /* ---- driver ---- */
    var d = r.driver;
    var drvBody = kv('Loft', esc(d.loft)) +
      kv('Playing length', U.fmtIn(d.length, 2), 'stock is ' + U.fmtIn(d.stockLength, 2)) +
      kv('Shaft flex', esc(r.shafts.driverFlexName)) +
      kv('Shaft weight', esc(r.shafts.driverWeight)) +
      kv('Swing weight', esc(d.swingWeight)) +
      kv('Est. clubhead speed', r.speeds.driver + ' mph', r.speeds.source);
    if (d.lengthDelta > 0.01) {
      drvBody += '<div class="note">Building ' + esc(U.fmtIn(d.lengthDelta, 2)) + ' under stock costs roughly 2&ndash;3 yards of theoretical distance and typically returns more than that in centre-face contact.</div>';
    }
    drvBody += '<div class="why"><b>Head:</b>' + list(d.head) + '</div>';
    if (d.loftReasons.length) drvBody += '<div class="why"><b>Why this loft:</b>' + list(d.loftReasons) + '</div>';
    cards.push(card('Driver', drvBody));

    /* ---- wedges ---- */
    var w = r.wedges;
    var wedgeBody = kv('Your pitching wedge', w.pwLoft + '&deg;', r.input.pwLoft ? 'as entered' : 'assumed from head category') +
      kv('Wedges to add', w.lofts.map(function (l) { return l + '&deg;'; }).join(' &middot; ')) +
      kv('Bounce', esc(w.bounce)) +
      kv('Grind', esc(w.grind)) +
      '<div class="why"><b>Bounce:</b> ' + esc(w.bounceWhy) + '</div>' +
      '<div class="why" style="border-top:0;padding-top:0"><b>Grind:</b> ' + esc(w.grindWhy) + '</div>' +
      '<div class="note">' + esc(w.gapNote) + '</div>' +
      '<div class="why">' + esc(w.shaftNote) + '</div>';
    cards.push(card('Wedges', wedgeBody));

    /* ---- grip ---- */
    cards.push(card('Grips',
      kv('Size', esc(r.grip.size)) +
      (r.input.handLength ? kv('Hand length', U.fmtIn(r.input.handLength, 1)) : '') +
      (r.input.gloveSize ? kv('Glove', esc(r.input.gloveSize)) : '') +
      '<div class="why">' + esc(r.grip.why) + '</div>' + list(r.grip.mods)));

    /* ---- putter ---- */
    var p = r.putter;
    cards.push(card('Putter',
      kv('Length', U.fmtIn(p.length, 1)) +
      kv('Lie', p.lie + '&deg;') +
      kv('Head style', esc(p.head)) +
      kv('Toe hang', esc(p.hang)) +
      kv('Grip', esc(p.grip)) +
      (p.lengthNote ? '<div class="note">' + esc(p.lengthNote) + '</div>' : '') +
      '<div class="why">' + esc(p.headWhy) + '</div>' +
      '<div class="note">' + esc(p.check) + '</div>'));

    /* ---- ball ---- */
    cards.push(card('Golf ball',
      kv('Type', esc(r.ball.type)) +
      kv('Compression', esc(r.ball.compression)) +
      '<div class="why">' + esc(r.ball.why) + '</div>' + list(r.ball.extra)));

    /* ---- shaft shortlist ---- */
    var sp = r.shaftPicks;
    function shaftList(items) {
      if (!items.length) return '<p class="small muted">Nothing in our shortlist covers that weight and flex combination &mdash; ask a fitter what they build in.</p>';
      return '<ul class="shaft-list">' + items.map(function (x) {
        return '<li><b>' + esc(x.name) + '</b><span>' + esc(x.weight) + ' &middot; ' + esc(x.launch) + ' launch' +
          (x.onProfile ? ' <em>&mdash; matches your flight</em>' : '') + '</span></li>';
      }).join('') + '</ul>';
    }
    cards.push(card('Shafts to ask for',
      '<h4>Irons &mdash; ' + esc(r.shafts.material) + ', ' + esc(r.shafts.ironFlex) + ', ' + esc(r.shafts.ironWeight) + '</h4>' +
      shaftList(sp.irons) +
      '<h4 style="margin-top:16px">Driver &mdash; ' + esc(r.shafts.driverFlex) + ', ' + esc(r.shafts.driverWeight) + '</h4>' +
      shaftList(sp.driver) +
      '<div class="why">' + esc(sp.note) + '</div>'));

    /* ---- women's specifics ---- */
    if (r.womensNotes && r.womensNotes.length) {
      cards.push(card('Buying a women\u2019s set',
        '<p class="small muted">Women\u2019s stock equipment is built to an average that fits far fewer people than it is sold to. These are the traps.</p>' +
        list(r.womensNotes)));
    }

    /* ---- junior ---- */
    if (r.junior) {
      var j = r.junior;
      cards.push(card('Fitting a junior',
        (j.band ? kv('Height band', esc(j.band.label)) : '') +
        kv('Driver length', j.driverLength + '"') +
        kv('7-iron length', j.sevenLength + '"') +
        kv('Shaft', 'Junior graphite') +
        kv('Grip', 'Junior / undersize') +
        '<div class="note">' + esc(j.refit) + '</div>' +
        '<div class="why"><b>How much to spend:</b> ' + esc(j.spend) + '</div>' +
        '<div class="why" style="border-top:0;padding-top:0"><b>Set size:</b> ' + esc(j.setSize) + '</div>' +
        '<div class="why" style="border-top:0;padding-top:0">' + esc(j.shaft) + ' ' + esc(j.grip) + '</div>' +
        '<p class="tiny" style="margin-top:10px">' + esc(j.note) + '</p>'));
    }

    /* ---- the bag to build ---- */
    var bag = r.recommendedBag;
    var bagCarries = {};
    G.buildLadder(r.speeds, bag.ladder).forEach(function (row) { bagCarries[row.club] = row.carry; });
    function carryOf(c) {
      if (c.slot === 'Putter') return '—';
      var key = c.name === 'Pitching wedge' ? 'PW (' + bag.ladder.pwLoft + '°)'
        : c.name === 'Sand wedge' ? '56° wedge' : c.name;
      return bagCarries[key] != null ? bagCarries[key] + ' yd' : '—';
    }
    var bagRows = bag.clubs.map(function (c) {
      return '<tr><td><span class="slot-tag">' + esc(c.slot) + '</span></td>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td class="num">' + (c.slot === 'Putter' ? '—' : c.loft + '&deg;') + '</td>' +
        '<td class="num">' + esc(carryOf(c)) + '</td></tr>';
    }).join('');

    /* Title and lead come from the engine, because both turn on whether the
       player already owns clubs and the view should not be re-deciding it. */
    var bagBody = '<div class="panel card"><h3>' + icon('bag') + esc(bag.title) + '</h3>' +
      '<p class="small muted">' + esc(bag.lead) + '</p>' +
      '<div class="bag-count"><b>' + bag.count + '</b><span>club' + (bag.count > 1 ? 's' : '') +
      '</span><i>limit is 14</i></div>' +
      '<div class="table-scroll"><table><thead><tr><th></th><th>Club</th>' +
      '<th class="num">Loft</th><th class="num">Est. carry</th></tr></thead><tbody>' + bagRows +
      '</tbody></table></div>' +
      bag.notes.map(function (n) { return '<div class="note">' + esc(n) + '</div>'; }).join('') +
      '<div class="why">Lofts are typical rather than universal — brands vary by two or three degrees, ' +
      'especially through the short irons. Match the <em>gaps</em>, not the numbers stamped on the sole.</div>' +
      '</div>';

    var buying = !(r.input.bag && r.input.bag.hasClubs);
    out.push(group(bag.title, bag.count + ' clubs with lofts and estimated carries', bagBody, buying));

    /* ---- set makeup ---- */
    var setBody = kv('Irons', esc(r.set.irons)) +
      '<div class="why"><b>Hybrids / rescues:</b>' + list(r.set.hybrids) + '</div>' +
      '<div class="why" style="border-top:0;padding-top:0"><b>Fairway woods:</b>' + list(r.set.woods) + '</div>' +
      '<div class="why">' + esc(r.set.why) + '</div>';
    cards.push(card('Set makeup', setBody));

    out.push(group('Every recommendation in detail',
      cards.length + ' cards — irons, driver, wedges, grips, putter, ball, shafts and set makeup',
      '<div class="cards">' + cards.join('') + '</div>'));

    /* ---- gapping table ---- */
    var carryCard = ('<div class="panel card"><h3>' + icon('ladder') + 'Carry gaps</h3>' +
      '<p class="small muted">' +
      (r.set.ladderIsYours
        ? 'These are <b>your</b> clubs, modelled from your speed. '
        : 'A representative bag for your speed &mdash; tell us what you actually carry on the last question and this ' +
          'table will describe your bag instead. ') +
      '<b>If you know your real numbers, type them straight into the table</b> &mdash; the gaps recalculate as ' +
      'you go, and measured yardages turn this from an illustration into an actual audit of your bag.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Club</th><th class="num">Carry (yd)</th>' +
      '<th class="num">Gap</th><th>Verdict</th></tr></thead><tbody id="carryRows"></tbody></table></div>' +
      '<div id="carrySummary" class="note"></div>' +
      '<button type="button" class="btn btn-ghost no-print" id="carryReset" hidden style="margin-top:14px">Reset to estimates</button>' +
      '</div>');
    out.push(group('Carry gaps', 'your yardage ladder, and the holes in it', carryCard));

    /* ---- full spec sheet ---- */
    var specRows = r.specSheet.map(function (s) {
      return '<tr><td>' + esc(s.club) + '</td>' +
        '<td class="num">' + s.stdLength.toFixed(2) + '"</td>' +
        '<td class="num">' + (Math.abs(s.adj) < 0.005 ? '&mdash;' : esc(U.fmtAdj(s.adj))) + '</td>' +
        '<td class="num"><b>' + s.length.toFixed(2) + '"</b></td>' +
        '<td class="num">' + s.stdLie.toFixed(1) + '&deg;</td>' +
        '<td class="num">' + (s.lieAdj === 0 ? '&mdash;' : (s.lieAdj > 0 ? '+' : '−') + Math.abs(s.lieAdj) + '&deg;') + '</td>' +
        '<td class="num"><b>' + s.lie.toFixed(1) + '&deg;</b></td></tr>';
    }).join('');
    var buildCard = ('<div class="panel card"><h3>' + icon('sheet') + 'Build sheet &mdash; hand this to your fitter</h3>' +
      '<p class="small muted">Length adjustments come from height; lie adjustments from the colour code. Woods and ' +
      'hybrids take half the iron length adjustment, because their longer shafts are less sensitive to it and ' +
      'over-lengthening them costs you the middle of the face.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Club</th><th class="num">Std length</th><th class="num">Adj</th>' +
      '<th class="num">Build to</th><th class="num">Std lie</th><th class="num">Adj</th><th class="num">Build to</th></tr></thead><tbody>' +
      specRows + '</tbody></table></div>' +
      '<div class="note">Ask for these to be <b>checked after building</b>. Loft and lie drift during manufacture, ' +
      'and a set that leaves the factory nominally standard can be a degree out club to club. Any decent fitter has ' +
      'a loft-lie machine and will check the set for you.</div></div>');
    out.push(group('Build sheet', 'every club, every number, ready to hand over', buildCard));

    $('#resultsBody').innerHTML = out.join('');
    renderChart($('#miniChart'), r.input.heightIn, r.input.wtfIn, false);
    renderCarryRows();
    initCarryTable();
    if (root_LieBench()) root_LieBench().init();
    resultsRendered = true;
  }

  function root_LieBench() { return window.LieBench || null; }

  function listWords(a) {
    if (a.length === 1) return a[0];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }

  function specFor(r, club) {
    for (var i = 0; i < r.specSheet.length; i++) if (r.specSheet[i].club === club) return r.specSheet[i];
    return { length: 0 };
  }

  /* =====================================================================
     AUDIT — "check the clubs you already own"
     ================================================================== */
  var lastFit = null;

  function initAudit() {
    /* The bag questions now live in the wizard, so there is no separate panel
       to open. All that is left is keeping the fields visible or hidden. */
    $$('input[name="hasClubs"]').forEach(function (el) {
      el.addEventListener('change', syncBagFields);
    });
    syncBagFields();
  }

  function syncBagFields() {
    var box = $('#bagFields');
    if (box) box.hidden = !hasClubs();
  }

  function selNum(id) {
    var v = $(id) && $(id).value;
    if (v === '' || v == null) return null;
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }
  function selStr(id) { return ($(id) && $(id).value) || null; }

  function readAuditInput() {
    var adj = radio('curAdj');
    var wedges = parseWedges($('#curWedges') && $('#curWedges').value);

    return {
      ironLength: selNum('#curIronLength'),
      ironLie: selNum('#curIronLie'),
      ironFlex: selStr('#curIronFlex'),
      ironMaterial: selStr('#curIronMaterial'),
      gripSize: selStr('#curGripSize'),
      longestIron: selNum('#curLongestIron'),
      driverLoft: selNum('#curDriverLoft'),
      driverLength: selNum('#curDriverLength'),
      driverAdjustable: adj === 'yes' ? true : adj === 'no' ? false : null,
      wedgeLofts: wedges.length ? wedges : null,
      ball: selStr('#curBall')
    };
  }

  var SEV_LABEL = { high: 'Fix this first', medium: 'Worth fixing', low: 'Minor' };

  function findingCard(x, n) {
    var h = ['<div class="finding sev-' + x.severity + (x.isReplaceAdvice ? ' is-replace' : '') + '">'];
    h.push('<div class="finding-head">');
    h.push('<span class="finding-n">' + n + '</span>');
    h.push('<div class="finding-title"><b>' + esc(x.area) + '</b>');
    h.push('<span class="finding-diff">' + esc(x.current) + ' <em>&rarr;</em> ' + esc(x.recommended) + '</span></div>');
    h.push('<div class="finding-tags">');
    if (x.quickWin) h.push('<span class="pill">Quick win</span>');
    h.push('<span class="pill ' + (x.severity === 'high' ? 'warn' : 'brass') + '">' + esc(SEV_LABEL[x.severity] || x.severity) + '</span>');
    h.push('<span class="cost">' + esc(x.costLabel) + '</span>');
    h.push('</div></div>');
    h.push('<p class="finding-detail">' + esc(x.detail) + '</p>');
    if (x.fix) h.push('<p class="finding-fix"><b>Fix:</b> ' + esc(x.fix) + '</p>');
    if (x.caveat) h.push('<p class="finding-caveat">' + esc(x.caveat) + '</p>');
    h.push('</div>');
    return h.join('');
  }

  function renderAudit(a) {
    var o = [];
    o.push('<div class="panel card" style="margin-top:18px" id="auditReport">');
    o.push('<h3>' + icon('fix') + 'What to change, and in what order</h3>');
    o.push('<p class="audit-headline">' + esc(a.headline) + '</p>');

    if (a.plan) {
      var pl = a.plan;
      o.push('<div class="budget-plan">');
      o.push('<h4>Your ' + esc(a.currency + pl.budget) + ' plan</h4>');
      o.push('<p>' + esc(pl.headline) + '</p>');
      if (pl.now.length) {
        o.push('<ol class="plan-list">' + pl.now.map(function (x) {
          return '<li><b>' + esc(x.area) + '</b><span>' + esc(x.costLabel) + '</span></li>';
        }).join('') + '</ol>');
        if (pl.leftover > 0) o.push('<p class="tiny">Leaves about ' + esc(a.currency + pl.leftover) + ' spare.</p>');
      }
      if (pl.later.length) {
        o.push('<p class="tiny">Waiting: ' + pl.later.map(function (x) { return esc(x.area); }).join(', ') + '.</p>');
      }
      o.push('</div>');
    }

    if (a.actions.length) {
      o.push('<div class="audit-summary">');
      o.push('<div><span>Changes worth making</span><b>' + a.actions.length + '</b></div>');
      o.push('<div><span>Quick wins</span><b>' + a.quickWins.length + '</b></div>');
      o.push('<div><span>Quick-win cost</span><b>' + esc(costRange(a, a.quickCost)) + '</b></div>');
      o.push('<div><span>Everything</span><b>' + esc(costRange(a, a.totalCost)) + '</b></div>');
      o.push('</div>');
      o.push('<div class="findings">' + a.actions.map(function (x, i) { return findingCard(x, i + 1); }).join('') + '</div>');
    }

    if (a.superseded && a.superseded.length) {
      var sLo = 0, sHi = 0;
      a.superseded.forEach(function (x) { sLo += x.costLo; sHi += x.costHi; });
      o.push('<details class="audit-group superseded"><summary><b>' + a.superseded.length +
        ' repair' + (a.superseded.length > 1 ? 's' : '') + ' you would be paying for instead</b> ' +
        '<span class="tiny">&mdash; ' + esc(costRange(a, [sLo, sHi])) + ' of work on irons you would be replacing</span></summary><div>');
      a.superseded.forEach(function (x, i) { o.push(findingCard(x, i + 1)); });
      o.push('</div></details>');
    }

    if (a.fine.length) {
      o.push('<details class="audit-group"><summary><b>' + a.fine.length +
        ' thing' + (a.fine.length > 1 ? 's' : '') + ' you should leave alone</b> ' +
        '<span class="tiny">&mdash; knowing what not to spend money on is half the value</span></summary><div>');
      a.fine.forEach(function (x) {
        o.push('<div class="finding sev-ok"><div class="finding-head"><span class="finding-n ok">&#10003;</span>' +
          '<div class="finding-title"><b>' + esc(x.area) + '</b><span class="finding-diff">' + esc(x.current) + '</span></div></div>' +
          '<p class="finding-detail">' + esc(x.detail) + '</p></div>');
      });
      o.push('</div></details>');
    }

    if (a.unknowns.length) {
      o.push('<details class="audit-group"><summary><b>' + a.unknowns.length +
        ' thing' + (a.unknowns.length > 1 ? 's' : '') + ' we could not check</b> ' +
        '<span class="tiny">&mdash; how to find each one out</span></summary><div>');
      a.unknowns.forEach(function (x) {
        o.push('<div class="finding sev-unknown"><div class="finding-head"><span class="finding-n unk">?</span>' +
          '<div class="finding-title"><b>' + esc(x.area) + '</b><span class="finding-diff">Recommended: ' + esc(x.recommended) + '</span></div></div>' +
          '<p class="finding-detail">' + esc(x.detail) + '</p></div>');
      });
      o.push('</div></details>');
    }

    o.push('<div class="note">Prices are indicative UK shop rates for a set of irons and will vary. ' +
      'The ordering assumes you want the biggest improvement per pound spent, which is why a bend and a re-grip ' +
      'come before a reshaft even when the reshaft is the larger error. The ' + esc(a.currency) + esc(a.benchmark) +
      ' replacement benchmark is a direct-to-consumer set priced <em>as configured</em> &mdash; custom length and lie ' +
      'come with the build, but premium shafts and non-stock grips add to it, so the sticker price is not what you pay.</div>');
    o.push('</div>');
    $('#auditResults').innerHTML = o.join('');
  }

  function costRange(a, pair) {
    if (pair[1] === 0) return 'Nothing';
    if (pair[0] === pair[1]) return a.currency + pair[0];
    return a.currency + pair[0] + '–' + a.currency + pair[1];
  }


  /* =====================================================================
     ACCESSIBILITY WIRING
     ---------------------------------------------------------------------
     Done in JS rather than by hand-editing forty radio groups: each group of
     option cards becomes a labelled radiogroup, and every hint becomes the
     accessible description of the control it sits under.
     ================================================================== */
  function wireA11y() {
    var n = 0;
    $$('.field').forEach(function (field) {
      var label = field.querySelector(':scope > label');
      var opts = field.querySelector(':scope > .opts');
      if (label && opts) {
        n++;
        if (!label.id) label.id = 'grp-label-' + n;
        opts.setAttribute('role', 'radiogroup');
        opts.setAttribute('aria-labelledby', label.id);
      }
      var control = field.querySelector('input:not([type="radio"]), select');
      var hint = field.querySelector(':scope > .hint');
      if (control && hint) {
        n++;
        if (!hint.id) hint.id = 'hint-' + n;
        var existing = control.getAttribute('aria-describedby');
        control.setAttribute('aria-describedby', existing ? existing + ' ' + hint.id : hint.id);
      }
    });
  }

  /* =====================================================================
     MEASUREMENT DIAGRAM
     ---------------------------------------------------------------------
     Everything downstream rests on wrist-to-floor, and a picture removes
     more error than another paragraph of instructions would.
     ================================================================== */
  function wtfDiagram() {
    return [
      '<svg viewBox="0 0 300 250" xmlns="http://www.w3.org/2000/svg" class="diagram" role="img"',
      ' aria-label="Diagram: measure from the crease of the wrist straight down to the floor, standing upright with arms relaxed.">',
      // ground
      '<line x1="30" y1="216" x2="278" y2="216" stroke="#2a3630" stroke-width="2"/>',
      '<path d="M30 222 L278 222" stroke="#1f7d4d" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/>',
      // figure
      '<g stroke="#a8b6ae" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">',
      '<circle cx="104" cy="40" r="17"/>',
      '<path d="M104 57 V143"/>',                    // torso
      '<path d="M104 143 L90 208 M104 143 L120 208"/>', // legs
      '<path d="M82 208 h18 M112 208 h18"/>',          // feet
      '<path d="M104 72 C 128 88, 134 112, 132 138"/>', // arm hanging naturally
      '</g>',
      // wrist marker
      '<circle cx="132" cy="140" r="5.5" fill="#34c07a"/>',
      '<circle cx="132" cy="140" r="10" fill="none" stroke="#34c07a" stroke-width="1.2" opacity=".55"/>',
      '<line x1="140" y1="134" x2="176" y2="118" stroke="#34c07a" stroke-width="1.2"/>',
      '<text x="180" y="115" font-size="11" font-weight="700" fill="#34c07a" font-family="ui-sans-serif,system-ui,sans-serif">wrist crease</text>',
      '<text x="180" y="129" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">where palm meets wrist</text>',
      // dimension line
      '<g stroke="#d9b168" stroke-width="1.6">',
      '<line x1="212" y1="140" x2="212" y2="216"/>',
      '<path d="M207 145 L212 138 L217 145" fill="none"/>',
      '<path d="M207 211 L212 218 L217 211" fill="none"/>',
      '<line x1="132" y1="140" x2="218" y2="140" stroke-dasharray="3 4" stroke-width="1" opacity=".6"/>',
      '</g>',
      '<text x="222" y="182" font-size="11.5" font-weight="700" fill="#d9b168" font-family="ui-sans-serif,system-ui,sans-serif">wrist</text>',
      '<text x="222" y="196" font-size="11.5" font-weight="700" fill="#d9b168" font-family="ui-sans-serif,system-ui,sans-serif">to floor</text>',
      // posture cue
      '<text x="30" y="30" font-size="10.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">Stand tall,</text>',
      '<text x="30" y="44" font-size="10.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">look ahead,</text>',
      '<text x="30" y="58" font-size="10.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">arms relaxed.</text>',
      '<text x="30" y="240" font-size="10" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">In the shoes you play in.</text>',
      '</svg>'
    ].join('');
  }

  function renderDiagrams() {
    $$('[data-diagram="wtf"]').forEach(function (el) { el.innerHTML = wtfDiagram(); });
  }

  /* =====================================================================
     HANDEDNESS — every "left" and "right" on the page follows the player
     ================================================================== */
  function applyHandedness() {
    var S = G.sides({ handedness: radio('handedness') || 'right' });
    $$('.dir-away').forEach(function (el) { el.textContent = S.away; });
    $$('.dir-home').forEach(function (el) { el.textContent = S.home; });
  }

  /* =====================================================================
     LIVE WRIST-TO-FLOOR SANITY CHECK
     ================================================================== */
  function wtfLiveCheck() {
    var box = $('#wtfLive');
    if (!box) return;
    var h = readHeightInches(), w = readWtfInches();
    if (!h || !w || h < 42 || h > 90) { box.hidden = true; return; }
    var expected = G.levelCentre(h);
    var d = w - expected;
    if (Math.abs(d) <= 2.5) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'hint wtf-live';
    box.innerHTML = '<b>Worth a second look.</b> At ' + esc(U.fmtHeight(h)) + ' a wrist-to-floor of about ' +
      esc(U.fmtIn(expected, 1)) + ' is typical, and you have entered ' + esc(U.fmtIn(w, 1)) + '. ' +
      'Unusual proportions are real and this may be exactly right — but the most common cause is measuring ' +
      'from the wrong point. Open the guide above and check before you continue.';
  }

  /* =====================================================================
     SAVED PROFILES — several fits on one device
     ================================================================== */
  var PROFILES_KEY = 'fittingbay.profiles.v1';

  function readProfiles() {
    var t = store();
    if (!t) return [];
    try {
      var a = JSON.parse(t.getItem(PROFILES_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeProfiles(list) {
    var t = store();
    if (!t) return false;
    try { t.setItem(PROFILES_KEY, JSON.stringify(list.slice(0, 12))); return true; } catch (e) { return false; }
  }

  function saveProfile(name) {
    var list = readProfiles().filter(function (x) { return x.name !== name; });
    list.unshift({ name: name, qs: buildQuery(true), at: Date.now() });
    writeProfiles(list);
    renderProfiles();
  }

  function renderProfiles() {
    var wrap = $('#profileBar');
    if (!wrap) return;
    var list = readProfiles();
    if (!list.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var sel = $('#profileSelect');
    sel.innerHTML = '<option value="">Saved fits…</option>' + list.map(function (x, i) {
      return '<option value="' + i + '">' + esc(x.name) + '</option>';
    }).join('');
  }

  function initProfiles() {
    var wrap = $('#profileBar');
    if (!wrap) return;

    $('#profileLoad').addEventListener('click', function () {
      var i = $('#profileSelect').value;
      if (i === '') return;
      var pfl = readProfiles()[+i];
      if (pfl) location.href = location.pathname + '?' + pfl.qs;
    });
    $('#profileDelete').addEventListener('click', function () {
      var i = $('#profileSelect').value;
      if (i === '') return;
      var list = readProfiles();
      list.splice(+i, 1);
      writeProfiles(list);
      renderProfiles();
    });

    var openBtn = $('#saveFitBtn'), form = $('#saveFitForm'), input = $('#saveFitName');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        form.hidden = false;
        input.value = '';
        input.focus();
      });
      $('#saveFitCancel').addEventListener('click', function () { form.hidden = true; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = (input.value || '').trim().slice(0, 40);
        if (!name) { input.focus(); return; }
        saveProfile(name);
        form.hidden = true;
        openBtn.textContent = 'Saved as "' + name + '"';
        setTimeout(function () { openBtn.textContent = 'Save this fit'; }, 2500);
      });
    }
    renderProfiles();
  }

  /* =====================================================================
     CARRY TABLE — editable, so modelled gaps become measured ones
     ================================================================== */
  var carryOverrides = {};
  var resultsRendered = false;

  function currentCarries() {
    if (!lastFit) return [];
    return lastFit.set.carries.map(function (r) {
      var o = carryOverrides[r.club];
      return { club: r.club, carry: (o != null ? o : r.carry), measured: o != null };
    });
  }

  /* Both of these defer to the engine so the table and the findings can never
     disagree about what counts as a bad gap. */
  function gapClass(gap, carry) {
    var v = G.gapVerdict(gap, carry);
    return v === null ? '' : v === 'ok' ? 'gap-ok' : v === 'wide' ? 'gap-wide' : 'gap-tight';
  }
  function gapWord(gap, carry) {
    var v = G.gapVerdict(gap, carry);
    return v === null ? '' : v === 'inverted' ? 'overlaps' : v === 'close' ? 'too close'
      : v === 'wide' ? 'wide' : 'good';
  }

  function renderCarryRows() {
    var rows = currentCarries();
    var review = G.reviewGapping(rows);
    var html = rows.map(function (r, i, arr) {
      var gap = i === 0 ? null : arr[i - 1].carry - r.carry;
      return '<tr' + (r.measured ? ' class="measured"' : '') + '>' +
        '<td>' + esc(r.club) + (r.measured ? ' <span class="pill">measured</span>' : '') + '</td>' +
        '<td class="num"><input type="number" class="carry-input" data-club="' + esc(r.club) +
        '" value="' + r.carry + '" min="10" max="400" step="1" inputmode="numeric" aria-label="Carry for ' + esc(r.club) + '"></td>' +
        '<td class="num ' + gapClass(gap, r.carry) + '">' + (gap == null ? '&mdash;' : gap) + '</td>' +
        '<td class="' + gapClass(gap, r.carry) + '">' + gapWord(gap, r.carry) + '</td></tr>';
    }).join('');
    $('#carryRows').innerHTML = html;

    var sum = $('#carrySummary');
    var measured = review.measuredCount;
    sum.className = 'note' + (review.issues.length ? ' warn' : '');
    sum.innerHTML = '<b>' + esc(review.summary) + '</b>' +
      (review.issues.length ? '<ul style="margin:8px 0 0;padding-left:18px">' +
        review.issues.map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '') +
      (measured ? '' : '<br><span class="tiny">These are modelled from your speed. Type over any number you actually know and the gaps recalculate.</span>');
    $('#carryReset').hidden = !measured;
  }

  function initCarryTable() {
    var host = $('#carryRows');
    if (!host) return;
    host.addEventListener('input', function (e) {
      var el = e.target;
      if (!el.classList.contains('carry-input')) return;
      var v = parseFloat(el.value);
      var club = el.getAttribute('data-club');
      var est = null;
      lastFit.set.carries.forEach(function (r) { if (r.club === club) est = r.carry; });
      if (isFinite(v) && v > 0 && Math.round(v) !== est) carryOverrides[club] = Math.round(v);
      else delete carryOverrides[club];
      clearTimeout(host._t);
      host._t = setTimeout(function () {
        renderCarryRows();
        if (hasClubs()) runAudit();
        saveDraft();
      }, 600);
    });
    $('#carryReset').addEventListener('click', function () {
      carryOverrides = {};
      renderCarryRows();
      if (hasClubs()) runAudit();
      saveDraft();
    });
  }

  /* =====================================================================
     STATIC TABLES + INITIAL CHART
     ================================================================== */
  function initReferenceTables() {
    var ct = $('#codeTable');
    if (ct) {
      ct.innerHTML = G.scale.slice().reverse().map(function (c) {
        var miss = c.i > 0 ? 'Too upright for you &rarr; pulls and hooks'
          : c.i < 0 ? 'Too flat for you &rarr; pushes and slices'
            : 'Neutral &mdash; the reference point';
        var wtf = c.i === 0 ? 'reference' : (c.i > 0 ? '+' : '−') + Math.abs(c.i) + '" vs reference';
        return '<tr><td><span class="code-chip sm" style="background:' + c.hex + ';color:' + c.ink + '">' + esc(c.code) + '</span></td>' +
          '<td>' + esc(c.label) + '</td><td class="small muted">' + wtf + '</td>' +
          '<td class="small muted">' + miss + '</td></tr>';
      }).join('');
    }
    /* Generated from the verified geometry rather than typed in, so the page
       can never drift away from what the engine actually computes. */
    var lt = $('#lieTable');
    if (lt) {
      var CLUBS = [['4-iron', 21, 175], ['6-iron', 27, 155], ['7-iron', 31, 145],
        ['9-iron', 40, 125], ['PW', 44, 115], ['52° wedge', 52, 100], ['60° wedge', 60, 70]];
      lt.innerHTML = CLUBS.map(function (c) {
        var i = G.lieImpact(c[1], 1, c[2]);
        return '<tr><td>' + esc(c[0]) + '</td><td class="num">' + c[1] + '&deg;</td>' +
          '<td class="num">' + c[2] + ' yd</td>' +
          '<td class="num"><b>' + i.faceChange.toFixed(2) + '&deg;</b></td>' +
          '<td class="num">' + i.totalYards.toFixed(1) + ' yd</td>' +
          '<td class="num">' + i.percentOfShot.toFixed(1) + '%</td></tr>';
      }).join('');
    }

    var st = $('#stdTable');
    if (st) {
      st.innerHTML = G.standardSpecs.map(function (s) {
        return '<tr><td>' + esc(s.club) + '</td><td class="num">' + s.men.toFixed(2) + '"</td>' +
          '<td class="num">' + s.women.toFixed(2) + '"</td><td class="num">' + s.lie.toFixed(1) + '&deg;</td></tr>';
      }).join('');
    }
  }

  /* Both pages share this file. Each block runs only if its host page has
     the elements for it: index.html has the wizard, fitting-information.html
     does not, and both render the chart and the reference tables. */
  initReferenceTables();
  if ($('#chartFull')) renderChart($('#chartFull'), null, null, true);
  if ($('#heroChart')) renderChart($('#heroChart'), null, null, false);
  if ($('#fitForm')) initWizard();
  initAudit();

  wireA11y();
  /* A collapsed section must still print. Open everything before the dialog
     appears, and leave it open — the reader just asked to see it all. */
  window.addEventListener('beforeprint', function () {
    $$('details.result-group, details.audit-group').forEach(function (d) { d.open = true; });
  });

  renderDiagrams();
  applyHandedness();
  initProfiles();
  $$('input[name="handedness"]').forEach(function (el) {
    el.addEventListener('change', applyHandedness);
  });
  ['#wtf', '#heightFt', '#heightIn', '#heightCm'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', wtfLiveCheck);
  });
  $$('input[name="units"]').forEach(function (el) { el.addEventListener('change', wtfLiveCheck); });

  if ($('#copyLinkBtn')) {
    $('#copyLinkBtn').addEventListener('click', function () { copyLink(this); });
  }
  if ($('#fitForm')) {
    /* A link wins over a local draft: if someone opens a shared fit, that is
       the fit they meant to see. Otherwise fall back to whatever they had
       typed on this device. */
    if (!restoreFromUrl(true)) restoreDraft();
    window.addEventListener('popstate', function () {
      if (!restoreFromUrl(false)) {
        $('#results').classList.remove('show');
        $('#wizardSection').style.display = '';
      }
    });
  }
})();
