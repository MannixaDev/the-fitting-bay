/* ============================================================================
   lie-bench.js — an interactive lie-angle bench.

   The point of this thing is one specific lesson, which almost no fitting
   article gets right: as loft goes up, the FACE ERROR from a given lie error
   grows enormously, while the YARDS OFFLINE barely move. Both meters are on
   screen at once so you can watch one grow and the other sit still.

   All geometry comes from GolfFit.lieImpact() so the page can never disagree
   with the engine. See fitting-engine.js section 1b for the derivation.

   Mount with a container:  <div data-lie-bench data-lie="-2" data-loft="31">
   or call LieBench.mount(el) after rendering it yourself.
   ========================================================================== */
(function (root) {
  'use strict';

  var G = root.GolfFit;
  if (!G) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var seq = 0;

  /* Loft -> club name and a representative carry, interpolated between
     anchors so the loft slider stays continuous. */
  var ANCHORS = [
    { loft: 19, name: '3-iron', carry: 190 },
    { loft: 23, name: '4-iron', carry: 172 },
    { loft: 27, name: '6-iron', carry: 157 },
    { loft: 31, name: '7-iron', carry: 145 },
    { loft: 35, name: '8-iron', carry: 134 },
    { loft: 40, name: '9-iron', carry: 124 },
    { loft: 44, name: 'Pitching wedge', carry: 114 },
    { loft: 50, name: 'Gap wedge', carry: 100 },
    { loft: 56, name: 'Sand wedge', carry: 85 },
    { loft: 60, name: 'Lob wedge', carry: 72 }
  ];

  function clubFor(loft) {
    var best = ANCHORS[0], bestD = 999;
    for (var i = 0; i < ANCHORS.length; i++) {
      var d = Math.abs(ANCHORS[i].loft - loft);
      if (d < bestD) { bestD = d; best = ANCHORS[i]; }
    }
    return best.name;
  }

  function carryFor(loft) {
    if (loft <= ANCHORS[0].loft) return ANCHORS[0].carry;
    var last = ANCHORS[ANCHORS.length - 1];
    if (loft >= last.loft) return last.carry;
    for (var i = 1; i < ANCHORS.length; i++) {
      var a = ANCHORS[i - 1], b = ANCHORS[i];
      if (loft <= b.loft) {
        var t = (loft - a.loft) / (b.loft - a.loft);
        return Math.round(a.carry + t * (b.carry - a.carry));
      }
    }
    return last.carry;
  }

  /* Typical stock lie for a loft, so the club is drawn at a believable angle.
     Long irons sit flatter, wedges more upright. */
  function stockLie(loft) { return 59.5 + (loft - 19) * 0.11; }

  function sides() {
    var el = document.querySelector('input[name="handedness"]:checked');
    return G.sides({ handedness: el ? el.value : 'right' });
  }

  /* A real lie error is a tiny visual angle — two degrees lifts the toe of a
     3.5" head by about a millimetre. Drawn true to scale you would see
     nothing at all, so the tilt is exaggerated and labelled as such on the
     graphic. Every NUMBER on the page is honest; only the picture is
     stretched. */
  var LIE_EXAG = 5;

  function rotPt(x, y, px, py, degA) {
    var a = degA * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    return [px + (x - px) * c - (y - py) * sn, py + (x - px) * sn + (y - py) * c];
  }

  /* ---------------------------------------------------------------------
     PANEL A — the club at impact, seen from in front of the player. Heel on
     the left with the shaft rising from it, toe on the right. The club
     pivots on whichever end is still touching the turf, so the gap opens
     under the raised side exactly as it does on a lie board.
     ------------------------------------------------------------------ */
  function clubSvg(loft, err, uid) {
    var GY = 212;
    /* Shifted right of centre so the grip clears the panel caption. */
    var HEEL = 164, TOE = 238, TOP = GY - 25;
    var BX = 204;
    var rad = stockLie(loft) * Math.PI / 180;
    /* Sized so the butt of the grip lands inside the canvas: the club rises
       sin(lie) x (shaft + grip) above the hosel, and the hosel sits at TOP-6. */
    var shaftLen = 150;

    var A = -err * LIE_EXAG;
    var pivotX = err > 0.01 ? HEEL : err < -0.01 ? TOE : BX;
    var raised = err > 0.01 ? TOE : err < -0.01 ? HEEL : null;

    var hx = HEEL - 2, hy = TOP - 6;                       // hosel top
    var sx = hx - Math.cos(rad) * shaftLen;
    var sy = hy - Math.sin(rad) * shaftLen;
    var gripDx = Math.cos(rad), gripDy = Math.sin(rad);

    var s = [];
    s.push('<svg viewBox="0 0 340 270" class="bench-svg" role="img" aria-label="A golf club soled at impact. A lie error lifts the toe or the heel clear of the turf.">');

    s.push('<defs>');
    s.push('<linearGradient id="hd' + uid + '" x1="0" y1="0" x2="0.4" y2="1">' +
      '<stop offset="0" stop-color="#e4ebe7"/><stop offset="0.45" stop-color="#aab8b0"/>' +
      '<stop offset="1" stop-color="#6f7d76"/></linearGradient>');
    s.push('<linearGradient id="sh' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#8d9b93"/><stop offset="0.35" stop-color="#f2f6f4"/>' +
      '<stop offset="0.7" stop-color="#b9c5be"/><stop offset="1" stop-color="#7f8d85"/></linearGradient>');
    s.push('<linearGradient id="gp' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#161d19"/><stop offset="0.4" stop-color="#3d4a43"/>' +
      '<stop offset="1" stop-color="#101613"/></linearGradient>');
    s.push('<linearGradient id="tf' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2c3a31"/><stop offset="1" stop-color="#151d18"/></linearGradient>');
    s.push('<filter id="sd' + uid + '" x="-30%" y="-40%" width="160%" height="200%">' +
      '<feGaussianBlur stdDeviation="4"/></filter>');
    s.push('</defs>');

    s.push('<text x="16" y="20" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">AT IMPACT</text>');

    // turf
    s.push('<rect x="16" y="' + GY + '" width="308" height="15" rx="3" fill="url(#tf' + uid + ')"/>');
    s.push('<line x1="16" y1="' + GY + '" x2="324" y2="' + GY + '" stroke="#4a5a50" stroke-width="2"/>');
    for (var g = 22; g < 322; g += 9) {
      var h = 3 + ((g * 7) % 4);
      s.push('<line x1="' + g + '" y1="' + GY + '" x2="' + (g - 2) + '" y2="' + (GY + h) + '" stroke="#3b4b41" stroke-width="1.3"/>');
    }

    // the gap the error opens up
    if (raised !== null) {
      var r = rotPt(raised, GY, pivotX, GY, A);
      s.push('<path d="M' + pivotX + ' ' + GY + ' L' + r[0].toFixed(1) + ' ' + GY +
        ' L' + r[0].toFixed(1) + ' ' + r[1].toFixed(1) + ' Z" fill="#e0a63c" opacity=".3"/>');
      s.push('<line x1="' + r[0].toFixed(1) + '" y1="' + GY + '" x2="' + r[0].toFixed(1) + '" y2="' + r[1].toFixed(1) +
        '" stroke="#e0a63c" stroke-width="1.6" stroke-dasharray="2 2"/>');
    }

    s.push('<g transform="rotate(' + A.toFixed(3) + ' ' + pivotX + ' ' + GY + ')">');

    // contact shadow
    s.push('<ellipse cx="' + ((HEEL + TOE) / 2) + '" cy="' + (GY + 2) + '" rx="40" ry="4" fill="#000" opacity=".55" filter="url(#sd' + uid + ')"/>');

    // grip, then shaft, then head so the head sits in front of the hosel
    s.push('<line x1="' + (sx + gripDx * 6).toFixed(1) + '" y1="' + (sy + gripDy * 6).toFixed(1) +
      '" x2="' + (sx - gripDx * 32).toFixed(1) + '" y2="' + (sy - gripDy * 32).toFixed(1) +
      '" stroke="url(#gp' + uid + ')" stroke-width="12" stroke-linecap="round"/>');
    s.push('<line x1="' + hx.toFixed(1) + '" y1="' + hy.toFixed(1) + '" x2="' + sx.toFixed(1) + '" y2="' + sy.toFixed(1) +
      '" stroke="url(#sh' + uid + ')" stroke-width="5.5" stroke-linecap="round"/>');
    // ferrule
    var fx = hx - Math.cos(rad) * 15, fy = hy - Math.sin(rad) * 15;
    s.push('<line x1="' + hx.toFixed(1) + '" y1="' + hy.toFixed(1) + '" x2="' + fx.toFixed(1) + '" y2="' + fy.toFixed(1) +
      '" stroke="#121815" stroke-width="7.5" stroke-linecap="round"/>');

    // head: sole with a touch of camber, leading edge, topline, hosel bulge
    s.push('<path d="M' + HEEL + ' ' + GY +
      ' Q' + ((HEEL + TOE) / 2) + ' ' + (GY + 1.6) + ' ' + TOE + ' ' + GY +
      ' L' + (TOE - 3) + ' ' + (TOP + 9) +
      ' Q' + (TOE - 7) + ' ' + (TOP + 1) + ' ' + (TOE - 16) + ' ' + TOP +
      ' L' + (HEEL + 9) + ' ' + TOP +
      ' Q' + HEEL + ' ' + (TOP + 3) + ' ' + HEEL + ' ' + GY + ' Z" ' +
      'fill="url(#hd' + uid + ')" stroke="#dfe7e2" stroke-width="1.2" stroke-linejoin="round"/>');
    // cavity
    s.push('<path d="M' + (HEEL + 16) + ' ' + (GY - 6) + ' L' + (TOE - 12) + ' ' + (GY - 6) +
      ' L' + (TOE - 14) + ' ' + (TOP + 6) + ' L' + (HEEL + 18) + ' ' + (TOP + 6) + ' Z" ' +
      'fill="#5d6b64" opacity=".55"/>');
    // grooves
    for (var gr = 1; gr <= 4; gr++) {
      s.push('<line x1="' + (HEEL + 13) + '" y1="' + (GY - 3 - 4.4 * gr) + '" x2="' + (TOE - 11) + '" y2="' + (GY - 3 - 4.4 * gr) +
        '" stroke="#eef3f0" stroke-width="0.9" opacity=".5"/>');
    }
    // leading edge highlight
    s.push('<path d="M' + HEEL + ' ' + GY + ' Q' + ((HEEL + TOE) / 2) + ' ' + (GY + 1.6) + ' ' + TOE + ' ' + GY +
      '" fill="none" stroke="#f4f8f6" stroke-width="1.6" opacity=".85"/>');
    s.push('</g>');

    // ball
    s.push('<circle cx="' + BX + '" cy="' + (GY - 8) + '" r="8" fill="#fbfdfc"/>');
    s.push('<circle cx="' + BX + '" cy="' + (GY - 8) + '" r="8" fill="none" stroke="#aab8b0" stroke-width="1"/>');
    s.push('<circle cx="' + (BX - 3) + '" cy="' + (GY - 11) + '" r="2.4" fill="#fff" opacity=".9"/>');

    // the point still touching
    s.push('<circle cx="' + pivotX + '" cy="' + GY + '" r="6" fill="none" stroke="#e0a63c" stroke-width="2"/>');

    var label = Math.abs(err) < 0.01 ? 'Sole flat — the whole sole is on the turf'
      : (err > 0 ? 'Toe in the air — only the heel touches' : 'Heel in the air — only the toe touches');
    s.push('<text x="170" y="258" text-anchor="middle" font-size="11.5" font-weight="650" fill="' +
      (Math.abs(err) < 0.01 ? '#34c07a' : '#e0a63c') + '" font-family="ui-sans-serif,system-ui,sans-serif">' + esc(label) + '</text>');
    s.push('<text x="152" y="' + (GY + 32) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">heel</text>');
    s.push('<text x="252" y="' + (GY + 32) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">toe</text>');
    if (Math.abs(err) > 0.01) {
      s.push('<text x="324" y="20" text-anchor="end" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">tilt shown &times;' + LIE_EXAG + '</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------------------------------------------------------------
     PANEL B — where it finishes. A true-to-scale yard ruler with the miss
     split into the part from the start line and the part from the curve.
     No fake flight path, no hidden exaggeration.
     ------------------------------------------------------------------ */
  function resultSvg(impact, carry, S) {
    var MID = 170, CY = 168;
    /* The ruler grows to fit the miss rather than letting the marker run off
       the end — four degrees on a lob wedge is over eleven yards. */
    var t = Math.abs(impact.totalYards);
    var maxYd = t <= 4 ? 6 : t <= 8 ? 10 : t <= 13 ? 15 : 20;
    var step = maxYd <= 10 ? 2 : 5;
    var px = function (yd) { return MID + (yd / maxYd) * 140; };
    var dir = impact.faceChange >= 0 ? -1 : 1;
    var startYd = Math.abs(impact.startYards) * dir;
    var totalYd = Math.abs(impact.totalYards) * dir;

    var s = [];
    s.push('<svg viewBox="0 0 340 270" class="bench-svg" role="img" aria-label="Where the ball finishes relative to the target, in yards.">');
    s.push('<text x="16" y="20" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">WHERE IT FINISHES</text>');

    // the face seen from above
    var fx = 170, fy = 74;
    s.push('<text x="' + fx + '" y="40" text-anchor="middle" font-size="10" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">the face, from above</text>');
    s.push('<line x1="' + (fx - 50) + '" y1="' + fy + '" x2="' + (fx + 50) + '" y2="' + fy + '" stroke="#2a3630" stroke-width="1.4" stroke-dasharray="4 4"/>');
    s.push('<g transform="rotate(' + (-impact.faceChange * 6).toFixed(2) + ' ' + fx + ' ' + fy + ')">');
    s.push('<line x1="' + (fx - 42) + '" y1="' + fy + '" x2="' + (fx + 42) + '" y2="' + fy + '" stroke="#dfe7e2" stroke-width="4.5" stroke-linecap="round"/>');
    s.push('<line x1="' + fx + '" y1="' + fy + '" x2="' + fx + '" y2="' + (fy - 26) + '" stroke="#34c07a" stroke-width="2"/>');
    s.push('<path d="M' + (fx - 4.5) + ' ' + (fy - 21) + ' L' + fx + ' ' + (fy - 30) + ' L' + (fx + 4.5) + ' ' + (fy - 21) + '" fill="#34c07a"/>');
    s.push('</g>');
    s.push('<text x="324" y="' + (fy + 4) + '" text-anchor="end" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">shown &times;6</text>');

    // the miss, on a true scale
    if (Math.abs(totalYd) > 0.05) {
      s.push('<line x1="' + px(0) + '" y1="' + (CY - 30) + '" x2="' + px(startYd) + '" y2="' + (CY - 30) +
        '" stroke="#3AA5D9" stroke-width="8" stroke-linecap="round"/>');
      s.push('<line x1="' + px(startYd) + '" y1="' + (CY - 30) + '" x2="' + px(totalYd) + '" y2="' + (CY - 30) +
        '" stroke="#A85BC9" stroke-width="8" stroke-linecap="round"/>');
      s.push('<line x1="' + px(totalYd) + '" y1="' + (CY - 24) + '" x2="' + px(totalYd) + '" y2="' + (CY - 6) +
        '" stroke="#f4f7f5" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>');
      s.push('<circle cx="' + px(totalYd) + '" cy="' + (CY - 30) + '" r="6.5" fill="#fbfdfc"/>');
    } else {
      s.push('<circle cx="' + px(0) + '" cy="' + (CY - 30) + '" r="6.5" fill="#34c07a"/>');
    }

    // ruler
    s.push('<line x1="' + px(-maxYd) + '" y1="' + CY + '" x2="' + px(maxYd) + '" y2="' + CY + '" stroke="#2a3630" stroke-width="2"/>');
    for (var y = -maxYd; y <= maxYd; y += step) {
      var big = y === 0;
      s.push('<line x1="' + px(y) + '" y1="' + (CY - (big ? 11 : 5)) + '" x2="' + px(y) + '" y2="' + (CY + (big ? 11 : 5)) +
        '" stroke="' + (big ? '#34c07a' : '#2a3630') + '" stroke-width="' + (big ? 2 : 1.2) + '"/>');
      if (!big && y % (step * 2) === 0) {
        s.push('<text x="' + px(y) + '" y="' + (CY + 23) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">' + Math.abs(y) + '</text>');
      }
    }
    s.push('<text x="' + px(0) + '" y="' + (CY + 23) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#34c07a" font-family="ui-sans-serif,system-ui,sans-serif">TARGET</text>');
    s.push('<text x="' + px(0) + '" y="' + (CY + 38) + '" text-anchor="middle" font-size="9" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">yards offline</text>');

    s.push('<g font-size="10" font-family="ui-sans-serif,system-ui,sans-serif">');
    s.push('<rect x="26" y="224" width="11" height="4" rx="2" fill="#3AA5D9"/>');
    s.push('<text x="43" y="229" fill="#a8b6ae">start line ' + Math.abs(impact.startYards).toFixed(1) + ' yd</text>');
    s.push('<rect x="26" y="243" width="11" height="4" rx="2" fill="#A85BC9"/>');
    s.push('<text x="43" y="248" fill="#a8b6ae">curve ' + Math.abs(impact.curveYards).toFixed(1) + ' yd <tspan fill="#74847b">(modelled)</tspan></text>');
    s.push('</g>');

    if (Math.abs(totalYd) > 0.05) {
      s.push('<text x="316" y="229" text-anchor="end" font-size="12" font-weight="700" fill="#fbfdfc" font-family="ui-sans-serif,system-ui,sans-serif">' +
        Math.abs(impact.totalYards).toFixed(1) + ' yd ' + (dir < 0 ? S.home : S.away) + '</text>');
      s.push('<text x="316" y="248" text-anchor="end" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">on a ' + carry + ' yard shot</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  function meters(loft, err) {
    var face = Math.abs(G.faceChangeFromLie(loft, err));
    var yards = Math.abs(G.lieImpact(loft, err, carryFor(loft)).totalYards);
    return '<div class="bench-meters">' +
      '<div><span>Face turned at impact</span>' +
      '<div class="meter"><i style="width:' + Math.min(100, (face / 4) * 100).toFixed(1) + '%;background:#A85BC9"></i></div>' +
      '<b>' + face.toFixed(2) + '&deg;</b></div>' +
      '<div><span>Ball finishes offline</span>' +
      '<div class="meter"><i style="width:' + Math.min(100, (yards / 8) * 100).toFixed(1) + '%;background:#3AA5D9"></i></div>' +
      '<b>' + yards.toFixed(1) + ' yd</b></div>' +
      '</div>';
  }

  function draw(host) {
    var uid = host.getAttribute('data-uid');
    var err = parseFloat($('.bench-lie', host).value);
    var loft = parseFloat($('.bench-loft', host).value);
    var carry = carryFor(loft);
    var S = sides();
    var impact = G.lieImpact(loft, err, carry);

    $('.bench-lie-out', host).textContent = err === 0 ? 'sole flat'
      : Math.abs(err).toFixed(1) + '° ' + (err > 0 ? 'toe up' : 'heel up');
    $('.bench-loft-out', host).textContent = loft.toFixed(0) + '° · ' + clubFor(loft) + ' · ' + carry + ' yd';

    $('.bench-a', host).innerHTML = clubSvg(loft, err, uid);
    $('.bench-b', host).innerHTML = resultSvg(impact, carry, S);
    $('.bench-m', host).innerHTML = meters(loft, err);

    var read = $('.bench-read', host);
    if (Math.abs(err) < 0.05) {
      read.innerHTML = 'Sole flat, face square, ball on line. Now drag the <b>lie error</b> slider.';
    } else {
      var wedge = Math.abs(G.faceChangeFromLie(60, err));
      var longIron = Math.abs(G.faceChangeFromLie(21, err));
      read.innerHTML = 'The same ' + Math.abs(err).toFixed(1) + '&deg; of lie error turns a <b>4-iron</b> face ' +
        longIron.toFixed(2) + '&deg; and a <b>60&deg; wedge</b> face ' + wedge.toFixed(2) + '&deg; &mdash; ' +
        (wedge / longIron).toFixed(1) + ' times as far. Drag the <b>loft</b> slider and watch the purple meter run ' +
        'away while the blue one barely moves.';
    }
  }

  function mount(host) {
    if (host.getAttribute('data-mounted')) return;
    host.setAttribute('data-mounted', '1');
    host.setAttribute('data-uid', String(++seq));

    var lie = host.getAttribute('data-lie');
    var loft = host.getAttribute('data-loft');
    var intro = host.getAttribute('data-intro');

    host.innerHTML =
      '<div class="bench">' +
        (intro ? '<p class="bench-intro">' + esc(intro) + '</p>' : '') +
        '<div class="bench-controls">' +
          '<label><span>Lie error <b class="bench-lie-out"></b></span>' +
            '<input type="range" class="bench-lie" min="-4" max="4" step="0.5" value="' + (lie || 2) + '"></label>' +
          '<label><span>Loft <b class="bench-loft-out"></b></span>' +
            '<input type="range" class="bench-loft" min="19" max="60" step="1" value="' + (loft || 31) + '"></label>' +
        '</div>' +
        '<div class="bench-panels"><div class="bench-a"></div><div class="bench-b"></div></div>' +
        '<div class="bench-m"></div>' +
        '<p class="bench-read"></p>' +
        '<p class="tiny bench-foot">Face angle is exact geometry: <code>arctan(sin(lie&nbsp;error) &times; tan(loft))</code>. ' +
        'Start line assumes about 75% of an iron’s direction comes from the face. Curve is modelled and anchored on ' +
        'published TrackMan face-to-path data, so treat the yards as indicative and the ratios as solid.</p>' +
      '</div>';

    $$('.bench-lie, .bench-loft', host).forEach(function (el) {
      el.addEventListener('input', function () { draw(host); });
    });
    draw(host);
  }

  function init() { $$('[data-lie-bench]').forEach(mount); }

  root.LieBench = { mount: mount, init: init };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
