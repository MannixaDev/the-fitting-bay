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
  var radio = function (name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  };

  /* =====================================================================
     WIZARD
     ================================================================== */
  function initWizard() {
    var steps = $$('#fitForm .step');
    var current = 0;
    var progress = $('#progress');
    var stepTitle = $('#stepTitle'), stepNum = $('#stepNum'), stepTotal = $('#stepTotal');
    var backBtn = $('#backBtn'), nextBtn = $('#nextBtn'), submitBtn = $('#submitBtn');
    var formErr = $('#formErr');

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
      backBtn.disabled = current === 0;
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
        var w = readWtfInches();
        if (!w) return 'Enter your wrist-to-floor measurement.';
        if (w < 20 || w > 48) return 'That wrist-to-floor looks wrong — it should be roughly 27"–40" (69–102 cm).';
        if (w > h * 0.75) return 'Your wrist-to-floor is larger than three quarters of your height, which is not physically possible. Check you have not swapped the two, or mixed inches and centimetres.';
      }
      return null;
    }

    nextBtn.addEventListener('click', function () {
      var err = validateStep(current);
      if (err) { formErr.textContent = err; return; }
      showStep(current + 1);
    });
    backBtn.addEventListener('click', function () { showStep(current - 1); });

    /* ---------- units ---------- */
    function isMetric() { return radio('units') === 'metric'; }

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
        $('#wtf').placeholder = m ? '86' : '34';
        $('#handLength').placeholder = m ? '19' : '7.5';
      });
    });

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
        strokeArc: radio('strokeArc')
      };
    }

    $('#fitForm').addEventListener('submit', function (e) {
      e.preventDefault();
      for (var i = 0; i < steps.length; i++) {
        var err = validateStep(i);
        if (err) { showStep(i); formErr.textContent = err; return; }
      }
      formErr.textContent = '';
      var input = buildInput();
      var result = G.fit(input);
      lastFit = result;
      renderResults(result);
      resetAuditUI();
      renderChart($('#chartFull'), input.heightIn, input.wtfIn, true);
      $('#wizardSection').style.display = 'none';
      $('#results').classList.add('show');
      window.scrollTo({ top: $('#fit').getBoundingClientRect().top + window.pageYOffset - 74, behavior: 'smooth' });
    });

    $('#editBtn').addEventListener('click', function () {
      $('#results').classList.remove('show');
      $('#wizardSection').style.display = '';
      showStep(0);
    });
    $('#printBtn').addEventListener('click', function () { window.print(); });

    showStep(0);
  }

  /* =====================================================================
     CHART
     ================================================================== */
  function renderChart(host, playerH, playerW, big) {
    if (!host) return;
    var W = big ? 900 : 400, H = big ? 560 : 340;
    var padL = big ? 52 : 34, padR = big ? 16 : 10, padT = big ? 54 : 30, padB = big ? 44 : 28;
    var pw = W - padL - padR, ph = H - padT - padB;
    var h0 = 60, h1 = 79, w0 = 28.5, w1 = 40.5;

    var x = function (h) { return padL + (h - h0) / (h1 - h0) * pw; };
    var y = function (w) { return padT + (w1 - w) / (w1 - w0) * ph; };

    var SMIN = G.scaleRange[0], SMAX = G.scaleRange[1];
    var uid = big ? 'B' : 'S';
    var s = ['<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The Bay Scale chart: height against wrist-to-floor">'];
    s.push('<defs><clipPath id="cc' + uid + '"><rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '" rx="6"/></clipPath></defs>');
    s.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0d1210"/>');

    // scale bands
    s.push('<g clip-path="url(#cc' + uid + ')">');
    G.scale.forEach(function (c) {
      var top = [], bot = [];
      for (var h = h0; h <= h1 + 0.001; h += 0.25) {
        var centre = G.levelCentre(h);
        var lo = c.i === SMIN ? w0 - 4 : centre + c.i - 0.5;
        var hi = c.i === SMAX ? w1 + 5 : centre + c.i + 0.5;
        bot.push(x(h) + ',' + y(lo));
        top.push(x(h) + ',' + y(hi));
      }
      s.push('<polygon points="' + top.join(' ') + ' ' + bot.reverse().join(' ') + '" fill="' + c.hex + '"/>');
    });
    // hairline between bands, and a brighter edge around LEVEL
    G.scale.forEach(function (c) {
      if (c.i === SMIN) return;
      var pts = [];
      for (var h = h0; h <= h1 + 0.001; h += 0.25) pts.push(x(h) + ',' + y(G.levelCentre(h) + c.i - 0.5));
      var isLevelEdge = (c.i === 0 || c.i === 1);
      s.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' +
        (isLevelEdge ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.22)') + '" stroke-width="' +
        (isLevelEdge ? (big ? 1.8 : 1.2) : (big ? .9 : .6)) + '"/>');
    });
    // the reference curve: wrist-to-floor that plays standard lie at each height
    var refPts = [];
    for (var rh = h0; rh <= h1 + 0.001; rh += 0.25) refPts.push(x(rh) + ',' + y(G.levelCentre(rh)));
    s.push('<polyline points="' + refPts.join(' ') + '" fill="none" stroke="#08130D" stroke-width="' +
      (big ? 2 : 1.4) + '" stroke-dasharray="' + (big ? '7 5' : '4 3') + '" opacity=".7"/>');
    // grid
    for (var gw = 29; gw <= 40; gw++) {
      s.push('<line x1="' + padL + '" y1="' + y(gw) + '" x2="' + (padL + pw) + '" y2="' + y(gw) + '" stroke="rgba(255,255,255,.13)" stroke-width="' + (big ? 1 : .6) + '"/>');
    }
    for (var gh = h0; gh <= h1; gh += 1) {
      s.push('<line x1="' + x(gh) + '" y1="' + padT + '" x2="' + x(gh) + '" y2="' + (padT + ph) + '" stroke="rgba(255,255,255,.08)" stroke-width="' + (big ? 1 : .6) + '"/>');
    }
    s.push('</g>');
    s.push('<rect x="' + padL + '" y="' + padT + '" width="' + pw + '" height="' + ph + '" rx="6" fill="none" stroke="#2a3630"/>');

    // band labels (big only)
    if (big) {
      G.scale.forEach(function (c) {
        var hMid = 69.5;
        var yy = y(G.levelCentre(hMid) + c.i);
        if (yy < padT + 10 || yy > padT + ph - 10) return;
        // stroke in the band colour so the label stays legible over the
        // reference dashes and the band hairlines
        s.push('<text x="' + x(hMid) + '" y="' + (yy + 4.5) + '" text-anchor="middle" font-size="12.5" font-weight="800" letter-spacing=".6" fill="' + c.ink + '" stroke="' + c.hex + '" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round" font-family="ui-sans-serif,system-ui,sans-serif">' +
          esc(c.code) + '<tspan font-weight="600" letter-spacing="0" opacity=".8">   ' + esc(c.label) + '</tspan></text>');
      });
    }

    // axes
    var axisFill = '#74847b', axisFont = big ? 11 : 8.5;
    for (var lw = 29; lw <= 40; lw += (big ? 1 : 2)) {
      s.push('<text x="' + (padL - 8) + '" y="' + (y(lw) + 4) + '" text-anchor="end" font-size="' + axisFont + '" fill="' + axisFill + '" font-family="ui-sans-serif,system-ui,sans-serif">' + lw + '"</text>');
    }
    for (var lh = h0; lh <= h1; lh += (big ? 2 : 4)) {
      s.push('<text x="' + x(lh + 0.5) + '" y="' + (padT + ph + (big ? 18 : 13)) + '" text-anchor="middle" font-size="' + axisFont + '" fill="' + axisFill + '" font-family="ui-sans-serif,system-ui,sans-serif">' +
        Math.floor(lh / 12) + "'" + (lh % 12) + '"</text>');
    }
    s.push('<text x="' + (padL - (big ? 40 : 26)) + '" y="' + (padT + ph / 2) + '" transform="rotate(-90 ' + (padL - (big ? 40 : 26)) + ' ' + (padT + ph / 2) + ')" text-anchor="middle" font-size="' + axisFont + '" fill="' + axisFill + '" font-family="ui-sans-serif,system-ui,sans-serif">Wrist to floor</text>');
    s.push('<text x="' + (padL + pw / 2) + '" y="' + (H - (big ? 8 : 3)) + '" text-anchor="middle" font-size="' + axisFont + '" fill="' + axisFill + '" font-family="ui-sans-serif,system-ui,sans-serif">Height</text>');

    // length header band (big only)
    if (big) {
      G.lengthBands.forEach(function (b) {
        if (!isFinite(b.min) || !isFinite(b.max)) return;
        var a = Math.max(b.min, h0), z = Math.min(b.max + 1, h1 + 1);
        if (z <= a) return;
        s.push('<rect x="' + x(a) + '" y="' + (padT - 26) + '" width="' + (x(z) - x(a) - 2) + '" height="20" rx="4" fill="#1e2823" stroke="#2a3630"/>');
        s.push('<text x="' + ((x(a) + x(z)) / 2 - 1) + '" y="' + (padT - 12) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#a8b6ae" font-family="ui-sans-serif,system-ui,sans-serif">' +
          esc(U.fmtAdj(b.adj)) + '</text>');
      });
      s.push('<text x="' + padL + '" y="' + (padT - 34) + '" font-size="9.5" font-weight="700" letter-spacing="1.4" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">SHAFT LENGTH ADJUSTMENT</text>');
    }

    // player marker
    if (playerH && playerW) {
      var px = x(Math.max(h0, Math.min(h1, playerH)));
      var py = y(Math.max(w0, Math.min(w1, playerW)));
      var r = big ? 9 : 6;
      s.push('<g>');
      s.push('<line x1="' + padL + '" y1="' + py + '" x2="' + (padL + pw) + '" y2="' + py + '" stroke="#fff" stroke-width="1.2" stroke-dasharray="4 4" opacity=".85"/>');
      s.push('<line x1="' + px + '" y1="' + padT + '" x2="' + px + '" y2="' + (padT + ph) + '" stroke="#fff" stroke-width="1.2" stroke-dasharray="4 4" opacity=".85"/>');
      s.push('<circle cx="' + px + '" cy="' + py + '" r="' + (r + 4) + '" fill="rgba(0,0,0,.45)"/>');
      s.push('<circle cx="' + px + '" cy="' + py + '" r="' + r + '" fill="none" stroke="#fff" stroke-width="3"/>');
      s.push('<circle cx="' + px + '" cy="' + py + '" r="2.4" fill="#fff"/>');
      if (big) {
        var lx = px > padL + pw - 130 ? px - 118 : px + 14;
        s.push('<rect x="' + lx + '" y="' + (py - 30) + '" width="104" height="22" rx="5" fill="rgba(13,18,16,.92)" stroke="#fff" stroke-opacity=".5"/>');
        s.push('<text x="' + (lx + 52) + '" y="' + (py - 15) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="ui-sans-serif,system-ui,sans-serif">You: ' +
          esc(U.fmtHeight(playerH)) + ' / ' + esc(U.fmtIn(playerW, 1)) + '</text>');
      }
      s.push('</g>');
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
  function card(title, icon, body) {
    return '<div class="panel card"><h3><span class="ico">' + icon + '</span>' + esc(title) + '</h3>' + body + '</div>';
  }
  function list(items) {
    if (!items || !items.length) return '';
    return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
  }

  function renderResults(r) {
    var c = r.lie.code;
    var out = [];

    /* ---- verdict ---- */
    var v = [];
    v.push('<div class="panel verdict"><div class="verdict-main">');
    v.push('<p class="eyebrow" style="margin-bottom:.7rem">Static fit &mdash; irons</p>');
    v.push('<div class="dot-badge"><span class="code-chip" style="background:' + c.hex + ';color:' + c.ink + '">' + esc(c.code) + '</span>' +
      '<span><b>' + esc(c.label) + ' lie angle</b><em>Bay Scale ' + esc(c.code) + ' · measured deviation ' +
      (r.lie.preciseDegrees > 0 ? '+' : '') + r.lie.preciseDegrees + '°</em></span></div>');
    v.push('<div class="spec-row">');
    v.push('<div class="spec-cell"><span>Lie angle</span><b>' + esc(c.label) + '</b><i>7-iron: ' + (62 + c.deg).toFixed(1) + '&deg;</i></div>');
    v.push('<div class="spec-cell"><span>Length</span><b>' + esc(U.fmtAdj(r.length.adj)) + '</b><i>7-iron: ' + U.fmtIn(specFor(r, '7-iron').length, 2) + '</i></div>');
    v.push('<div class="spec-cell"><span>Iron shaft</span><b>' + esc(r.shafts.ironFlex) + '</b><i>' + esc(r.shafts.material) + ', ' + esc(r.shafts.ironWeight.split(' (')[0]) + '</i></div>');
    v.push('<div class="spec-cell"><span>Grip</span><b>' + esc(r.grip.size.split(' (')[0]) + '</b><i>' + (r.input.handLength ? U.fmtIn(r.input.handLength, 1) + ' hand' : 'from glove size') + '</i></div>');
    v.push('</div>');

    if (r.length.note) v.push('<div class="note warn">Height ' + esc(U.fmtHeight(r.input.heightIn)) + ' is ' + esc(r.length.note) + '.</div>');
    v.push('<div class="note">' + esc(r.lengthAgreement.text) + '</div>');
    v.push('</div>');
    v.push('<div class="verdict-chart"><h4>Where you sit on the chart</h4><div id="miniChart"></div>' +
      '<p class="tiny" style="margin-top:12px">Height ' + esc(U.fmtHeight(r.input.heightIn)) + ' &middot; wrist-to-floor ' +
      esc(U.fmtIn(r.input.wtfIn, 1)) + '. The LEVEL band at your height runs ' +
      esc(U.fmtIn(r.lie.levelBand[0], 1)) + '&ndash;' + esc(U.fmtIn(r.lie.levelBand[1], 1)) + '.</p></div>');
    v.push('</div>');
    out.push(v.join(''));

    /* ---- flags ---- */
    if (r.flags.length) {
      out.push('<div class="panel card" style="margin-bottom:18px"><h3><span class="ico">!</span>Read this first</h3>' +
        r.flags.map(function (f) {
          return '<div class="note' + (f.level === 'warn' ? ' warn' : '') + '">' + esc(f.text) + '</div>';
        }).join('') + '</div>');
    }

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
    cards.push(card('Irons', 'I', ironBody));

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
    cards.push(card('Driver', 'D', drvBody));

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
    cards.push(card('Wedges', 'W', wedgeBody));

    /* ---- grip ---- */
    cards.push(card('Grips', 'G',
      kv('Size', esc(r.grip.size)) +
      (r.input.handLength ? kv('Hand length', U.fmtIn(r.input.handLength, 1)) : '') +
      (r.input.gloveSize ? kv('Glove', esc(r.input.gloveSize)) : '') +
      '<div class="why">' + esc(r.grip.why) + '</div>' + list(r.grip.mods)));

    /* ---- putter ---- */
    var p = r.putter;
    cards.push(card('Putter', 'P',
      kv('Length', U.fmtIn(p.length, 1)) +
      kv('Lie', p.lie + '&deg;') +
      kv('Head style', esc(p.head)) +
      kv('Toe hang', esc(p.hang)) +
      kv('Grip', esc(p.grip)) +
      (p.lengthNote ? '<div class="note">' + esc(p.lengthNote) + '</div>' : '') +
      '<div class="why">' + esc(p.headWhy) + '</div>' +
      '<div class="note">' + esc(p.check) + '</div>'));

    /* ---- ball ---- */
    cards.push(card('Golf ball', 'B',
      kv('Type', esc(r.ball.type)) +
      kv('Compression', esc(r.ball.compression)) +
      '<div class="why">' + esc(r.ball.why) + '</div>' + list(r.ball.extra)));

    /* ---- set makeup ---- */
    var setBody = kv('Irons', esc(r.set.irons)) +
      '<div class="why"><b>Hybrids / rescues:</b>' + list(r.set.hybrids) + '</div>' +
      '<div class="why" style="border-top:0;padding-top:0"><b>Fairway woods:</b>' + list(r.set.woods) + '</div>' +
      '<div class="why">' + esc(r.set.why) + '</div>';
    cards.push(card('Set makeup', 'S', setBody));

    out.push('<div class="cards" style="margin-bottom:18px">' + cards.join('') + '</div>');

    /* ---- gapping table ---- */
    var rows = r.set.carries.map(function (row, i, arr) {
      var gap = i === 0 ? null : arr[i - 1].carry - row.carry;
      var cls = gap == null ? '' : gap > 20 ? 'gap-wide' : gap < 8 ? 'gap-tight' : 'gap-ok';
      var note = gap == null ? '' : gap > 20 ? 'wide' : gap < 8 ? 'too close' : 'good';
      return '<tr><td>' + esc(row.club) + '</td><td class="num">' + row.carry + '</td><td class="num ' + cls + '">' +
        (gap == null ? '&mdash;' : gap) + '</td><td class="' + cls + '">' + note + '</td></tr>';
    }).join('');
    out.push('<div class="panel card" style="margin-bottom:18px"><h3><span class="ico">&#8801;</span>Estimated carry gaps</h3>' +
      '<p class="small muted">Modelled from your speed and skill level, stepped off your 7-iron. Treat these as the ' +
      '<em>shape</em> of your bag rather than exact yardages &mdash; but the gaps are what matter, and a gap over ' +
      '20 yards is a hole you have to manufacture a shot to cover.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Club</th><th class="num">Carry (yd)</th><th class="num">Gap</th><th>Verdict</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></div>');

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
    out.push('<div class="panel card"><h3><span class="ico">&#9776;</span>Build sheet &mdash; hand this to your fitter</h3>' +
      '<p class="small muted">Length adjustments come from height; lie adjustments from the colour code. Woods and ' +
      'hybrids take half the iron length adjustment, because their longer shafts are less sensitive to it and ' +
      'over-lengthening them costs you the middle of the face.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Club</th><th class="num">Std length</th><th class="num">Adj</th>' +
      '<th class="num">Build to</th><th class="num">Std lie</th><th class="num">Adj</th><th class="num">Build to</th></tr></thead><tbody>' +
      specRows + '</tbody></table></div>' +
      '<div class="note">Ask for these to be <b>checked after building</b>. Loft and lie drift during manufacture, ' +
      'and a set that leaves the factory nominally standard can be a degree out club to club. Any decent fitter has ' +
      'a loft-lie machine and will check the set for you.</div></div>');

    $('#resultsBody').innerHTML = out.join('');
    renderChart($('#miniChart'), r.input.heightIn, r.input.wtfIn, false);
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
    var openBtn = $('#auditOpenBtn'), panel = $('#auditPanel'), intro = $('#auditIntro');
    var form = $('#auditForm'), cancel = $('#auditCancelBtn');
    if (!form) return;

    openBtn.addEventListener('click', function () {
      intro.hidden = true;
      panel.hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    cancel.addEventListener('click', function () {
      panel.hidden = true;
      intro.hidden = false;
      $('#auditResults').innerHTML = '';
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!lastFit) return;
      renderAudit(G.audit(lastFit, readAuditInput()));
      $('#auditResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
    var wedgeRaw = ($('#curWedges') && $('#curWedges').value) || '';
    var wedges = wedgeRaw.split(/[^0-9.]+/)
      .map(parseFloat)
      .filter(function (n) { return isFinite(n) && n >= 44 && n <= 66; })
      .sort(function (a, b) { return a - b; });

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
    var h = ['<div class="finding sev-' + x.severity + '">'];
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
    o.push('<h3><span class="ico">&#10003;</span>What to change, and in what order</h3>');
    o.push('<p class="audit-headline">' + esc(a.headline) + '</p>');

    if (a.actions.length) {
      o.push('<div class="audit-summary">');
      o.push('<div><span>Changes worth making</span><b>' + a.actions.length + '</b></div>');
      o.push('<div><span>Quick wins</span><b>' + a.quickWins.length + '</b></div>');
      o.push('<div><span>Quick-win cost</span><b>' + esc(costRange(a, a.quickCost)) + '</b></div>');
      o.push('<div><span>Everything</span><b>' + esc(costRange(a, a.totalCost)) + '</b></div>');
      o.push('</div>');
      o.push('<div class="findings">' + a.actions.map(function (x, i) { return findingCard(x, i + 1); }).join('') + '</div>');
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
      'come before a reshaft even when the reshaft is the larger error.</div>');
    o.push('</div>');
    $('#auditResults').innerHTML = o.join('');
  }

  function resetAuditUI() {
    if (!$('#auditPanel')) return;
    $('#auditPanel').hidden = true;
    $('#auditIntro').hidden = false;
    $('#auditResults').innerHTML = '';
  }

  function costRange(a, pair) {
    if (pair[1] === 0) return 'Nothing';
    if (pair[0] === pair[1]) return a.currency + pair[0];
    return a.currency + pair[0] + '–' + a.currency + pair[1];
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
  if ($('#fitForm')) initWizard();
  initAudit();
})();
