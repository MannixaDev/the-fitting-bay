/* ============================================================================
   lie-bench.js — an interactive lie-angle bench.

   The point of this thing is one specific lesson, which almost no fitting
   article gets right: as loft goes up, the FACE ERROR from a given lie error
   grows enormously, while the YARDS OFFLINE barely move. Both meters are on
   screen at once so you can watch one grow and the other sit still.

   All geometry comes from GolfFit.lieImpact() so the page can never disagree
   with the engine. See fitting-engine.js section 1b for the derivation.
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

  /* Typical stock lie for a given loft, so the club is drawn at a believable
     angle. Long irons sit flatter, wedges more upright. */
  function stockLie(loft) { return 59.5 + (loft - 19) * 0.11; }

  function sides() {
    var el = document.querySelector('input[name="handedness"]:checked');
    return G.sides({ handedness: el ? el.value : 'right' });
  }

  /* ---------------------------------------------------------------------
     PANEL A — the club at impact, seen from in front of the player.
     Heel on the left with the shaft rising from it, toe on the right. The
     whole club rotates about the ball, so the gap under toe or heel opens
     up exactly as it does on a lie board.
     ------------------------------------------------------------------ */
  /* A real lie error is a tiny visual angle — two degrees lifts the toe of a
     3.5" head by about a millimetre. Drawn true to scale you would see
     nothing at all, so the rotation is exaggerated and labelled as such, the
     same way the face indicator is. Every NUMBER on the page is honest; only
     the picture is stretched. */
  var LIE_EXAG = 5;

  function rotPt(x, y, px, py, degA) {
    var a = degA * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    return [px + (x - px) * c - (y - py) * sn, py + (x - px) * sn + (y - py) * c];
  }

  function clubSvg(loft, err, S) {
    var GY = 200;                       // ground
    var HEEL = 150, TOE = 222;          // sole, kept near a real head's proportion
    var TOP = GY - 22;
    var BX = 188;                       // ball, roughly the middle of the face
    var lie = stockLie(loft);
    var rad = lie * Math.PI / 180;
    var shaftLen = 178;

    var A = -err * LIE_EXAG;                                  // screen rotation
    var pivotX = err > 0.01 ? HEEL : err < -0.01 ? TOE : BX;   // the bit still touching

    var sx = HEEL - Math.cos(rad) * shaftLen;
    var sy = TOP - Math.sin(rad) * shaftLen;

    var rotAttr = 'rotate(' + A.toFixed(3) + ' ' + pivotX + ' ' + GY + ')';
    var raised = err > 0.01 ? [TOE, GY] : err < -0.01 ? [HEEL, GY] : null;

    var s = [];
    s.push('<svg viewBox="0 0 340 250" class="bench-svg" role="img" aria-label="A club soled at impact. A lie error lifts the toe or the heel off the ground.">');
    s.push('<text x="16" y="20" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">AT IMPACT</text>');

    // the gap the error opens up, drawn before the head so the head sits on top
    if (raised) {
      var r = rotPt(raised[0], raised[1], pivotX, GY, A);
      s.push('<path d="M' + pivotX + ' ' + GY + ' L' + r[0].toFixed(1) + ' ' + GY +
        ' L' + r[0].toFixed(1) + ' ' + r[1].toFixed(1) + ' Z" fill="#e0a63c" opacity=".26"/>');
      s.push('<line x1="' + r[0].toFixed(1) + '" y1="' + GY + '" x2="' + r[0].toFixed(1) + '" y2="' + r[1].toFixed(1) +
        '" stroke="#e0a63c" stroke-width="1.6"/>');
    }

    // ground
    s.push('<line x1="16" y1="' + GY + '" x2="324" y2="' + GY + '" stroke="#3a463f" stroke-width="2.5"/>');
    for (var g = 24; g < 324; g += 15) {
      s.push('<line x1="' + g + '" y1="' + (GY + 2) + '" x2="' + (g - 6) + '" y2="' + (GY + 9) + '" stroke="#222c27" stroke-width="1.6"/>');
    }

    s.push('<g transform="' + rotAttr + '">');
    // head — a compact iron profile, heel left, toe right
    s.push('<path d="M' + HEEL + ' ' + GY + ' L' + TOE + ' ' + GY + ' L' + (TOE - 4) + ' ' + (TOP + 4) +
      ' Q' + (TOE - 10) + ' ' + TOP + ' ' + (TOE - 18) + ' ' + TOP +
      ' L' + (HEEL + 6) + ' ' + TOP + ' Z" fill="#9aa8a0" stroke="#ccd6cf" stroke-width="1.5" stroke-linejoin="round"/>');
    for (var gr = 1; gr <= 3; gr++) {
      s.push('<line x1="' + (HEEL + 12) + '" y1="' + (GY - 4 - 5 * gr) + '" x2="' + (TOE - 10) + '" y2="' + (GY - 4 - 5 * gr) + '" stroke="#77857d" stroke-width="1"/>');
    }
    // hosel and shaft
    s.push('<line x1="' + (HEEL + 4) + '" y1="' + (TOP + 2) + '" x2="' + (HEEL - 3) + '" y2="' + (TOP - 12) + '" stroke="#ccd6cf" stroke-width="7" stroke-linecap="round"/>');
    s.push('<line x1="' + (HEEL - 2) + '" y1="' + (TOP - 8) + '" x2="' + sx.toFixed(1) + '" y2="' + sy.toFixed(1) + '" stroke="#dde4df" stroke-width="5" stroke-linecap="round"/>');
    s.push('<line x1="' + sx.toFixed(1) + '" y1="' + sy.toFixed(1) + '" x2="' + (sx + Math.cos(rad) * 40).toFixed(1) + '" y2="' + (sy + Math.sin(rad) * 40).toFixed(1) +
      '" stroke="#39453e" stroke-width="10" stroke-linecap="round"/>');
    s.push('</g>');

    // ball, and the point still in contact with the turf
    s.push('<circle cx="' + BX + '" cy="' + (GY - 7) + '" r="7" fill="#f4f7f5" stroke="#c3cfc8"/>');
    s.push('<circle cx="' + pivotX + '" cy="' + GY + '" r="5.5" fill="none" stroke="#e0a63c" stroke-width="2"/>');

    var label = Math.abs(err) < 0.01 ? 'Sole flat — the whole sole is on the turf'
      : (err > 0 ? 'Toe in the air — only the heel touches' : 'Heel in the air — only the toe touches');
    s.push('<text x="170" y="232" text-anchor="middle" font-size="11.5" font-weight="650" fill="' +
      (Math.abs(err) < 0.01 ? '#34c07a' : '#e0a63c') + '" font-family="ui-sans-serif,system-ui,sans-serif">' + esc(label) + '</text>');
    s.push('<text x="138" y="' + (GY + 22) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">heel</text>');
    s.push('<text x="236" y="' + (GY + 22) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">toe</text>');
    if (Math.abs(err) > 0.01) {
      s.push('<text x="324" y="20" text-anchor="end" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">tilt shown &times;' + LIE_EXAG + '</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------------------------------------------------------------
     PANEL B — where it finishes. A true-to-scale yard ruler, with the miss
     split into the part that comes from the start line and the part that
     comes from the curve. No fake flight path and no hidden exaggeration.
     ------------------------------------------------------------------ */
  function resultSvg(impact, carry, err, S) {
    var W = 340, MID = 170, CY = 150;
    var maxYd = 10;
    var px = function (yd) { return MID + (yd / maxYd) * 140; };
    var dir = impact.faceChange >= 0 ? -1 : 1;          // face closed -> home side
    var startYd = Math.abs(impact.startYards) * dir;
    var totalYd = Math.abs(impact.totalYards) * dir;

    var s = [];
    s.push('<svg viewBox="0 0 340 250" class="bench-svg" role="img" aria-label="Where the ball finishes relative to the target, in yards.">');
    s.push('<text x="16" y="20" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">WHERE IT FINISHES</text>');

    // clubface seen from above, rotated by the face change
    var fx = 170, fy = 62;
    s.push('<text x="' + fx + '" y="40" text-anchor="middle" font-size="10" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">the face, from above</text>');
    s.push('<line x1="' + (fx - 46) + '" y1="' + fy + '" x2="' + (fx + 46) + '" y2="' + fy + '" stroke="#2a3630" stroke-width="1.5" stroke-dasharray="4 4"/>');
    s.push('<g transform="rotate(' + (-impact.faceChange * 6) + ' ' + fx + ' ' + fy + ')">');
    s.push('<line x1="' + (fx - 40) + '" y1="' + fy + '" x2="' + (fx + 40) + '" y2="' + fy + '" stroke="#e8eeea" stroke-width="4" stroke-linecap="round"/>');
    s.push('<line x1="' + fx + '" y1="' + fy + '" x2="' + fx + '" y2="' + (fy - 26) + '" stroke="#34c07a" stroke-width="2"/>');
    s.push('<path d="M' + (fx - 4) + ' ' + (fy - 22) + ' L' + fx + ' ' + (fy - 30) + ' L' + (fx + 4) + ' ' + (fy - 22) + '" fill="#34c07a"/>');
    s.push('</g>');
    s.push('<text x="' + (fx + 56) + '" y="' + (fy + 4) + '" font-size="10" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">&times;6 for clarity</text>');

    // ruler
    s.push('<line x1="' + px(-maxYd) + '" y1="' + CY + '" x2="' + px(maxYd) + '" y2="' + CY + '" stroke="#2a3630" stroke-width="2"/>');
    for (var y = -maxYd; y <= maxYd; y += 2) {
      var big = y === 0;
      s.push('<line x1="' + px(y) + '" y1="' + (CY - (big ? 12 : 5)) + '" x2="' + px(y) + '" y2="' + (CY + (big ? 12 : 5)) +
        '" stroke="' + (big ? '#34c07a' : '#2a3630') + '" stroke-width="' + (big ? 2 : 1.2) + '"/>');
      if (!big && y % 4 === 0) {
        s.push('<text x="' + px(y) + '" y="' + (CY + 24) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">' + Math.abs(y) + '</text>');
      }
    }
    s.push('<text x="' + px(0) + '" y="' + (CY - 20) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#34c07a" font-family="ui-sans-serif,system-ui,sans-serif">TARGET</text>');
    s.push('<text x="' + px(0) + '" y="' + (CY + 40) + '" text-anchor="middle" font-size="9.5" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">yards offline</text>');

    if (Math.abs(totalYd) > 0.05) {
      // start-line share, then the curve on top of it
      s.push('<line x1="' + px(0) + '" y1="' + (CY - 46) + '" x2="' + px(startYd) + '" y2="' + (CY - 46) +
        '" stroke="#3AA5D9" stroke-width="7" stroke-linecap="round"/>');
      s.push('<line x1="' + px(startYd) + '" y1="' + (CY - 46) + '" x2="' + px(totalYd) + '" y2="' + (CY - 46) +
        '" stroke="#A85BC9" stroke-width="7" stroke-linecap="round"/>');
      s.push('<circle cx="' + px(totalYd) + '" cy="' + (CY - 46) + '" r="6" fill="#f4f7f5"/>');
      s.push('<line x1="' + px(totalYd) + '" y1="' + (CY - 40) + '" x2="' + px(totalYd) + '" y2="' + (CY - 8) + '" stroke="#f4f7f5" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>');
    } else {
      s.push('<circle cx="' + px(0) + '" cy="' + (CY - 46) + '" r="6" fill="#34c07a"/>');
    }

    // legend
    s.push('<g font-size="10" font-family="ui-sans-serif,system-ui,sans-serif">');
    s.push('<rect x="34" y="196" width="10" height="4" rx="2" fill="#3AA5D9"/>');
    s.push('<text x="50" y="201" fill="#a8b6ae">start line ' + Math.abs(impact.startYards).toFixed(1) + ' yd</text>');
    s.push('<rect x="34" y="216" width="10" height="4" rx="2" fill="#A85BC9"/>');
    s.push('<text x="50" y="221" fill="#a8b6ae">curve ' + Math.abs(impact.curveYards).toFixed(1) + ' yd <tspan fill="#74847b">(modelled)</tspan></text>');
    s.push('</g>');

    if (Math.abs(totalYd) > 0.05) {
      s.push('<text x="306" y="201" text-anchor="end" font-size="11" font-weight="700" fill="#f4f7f5" font-family="ui-sans-serif,system-ui,sans-serif">' +
        Math.abs(impact.totalYards).toFixed(1) + ' yd ' + (dir < 0 ? S.home : S.away) + '</text>');
      s.push('<text x="306" y="220" text-anchor="end" font-size="10" fill="#74847b" font-family="ui-sans-serif,system-ui,sans-serif">on a ' + carry + ' yard shot</text>');
    }
    s.push('</svg>');
    return s.join('');
  }

  /* ---------------------------------------------------------------------
     The two meters that carry the lesson.
     ------------------------------------------------------------------ */
  function meters(loft, err) {
    var face = Math.abs(G.faceChangeFromLie(loft, err));
    var yards = Math.abs(G.lieImpact(loft, err, carryFor(loft)).totalYards);
    var facePct = Math.min(100, (face / 4) * 100);
    var yardPct = Math.min(100, (yards / 8) * 100);
    return '<div class="bench-meters">' +
      '<div><span>Face turned at impact</span>' +
      '<div class="meter"><i style="width:' + facePct.toFixed(1) + '%;background:#A85BC9"></i></div>' +
      '<b>' + face.toFixed(2) + '&deg;</b></div>' +
      '<div><span>Ball finishes offline</span>' +
      '<div class="meter"><i style="width:' + yardPct.toFixed(1) + '%;background:#3AA5D9"></i></div>' +
      '<b>' + yards.toFixed(1) + ' yd</b></div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  function draw(host) {
    var err = parseFloat($('.bench-lie', host).value);
    var loft = parseFloat($('.bench-loft', host).value);
    var carry = carryFor(loft);
    var S = sides();
    var impact = G.lieImpact(loft, err, carry);

    $('.bench-lie-out', host).textContent = err === 0 ? 'sole flat'
      : Math.abs(err).toFixed(1) + '° ' + (err > 0 ? 'toe up' : 'heel up');
    $('.bench-loft-out', host).textContent = loft.toFixed(0) + '° · ' + clubFor(loft) + ' · ' + carry + ' yd';

    $('.bench-a', host).innerHTML = clubSvg(loft, err, S);
    $('.bench-b', host).innerHTML = resultSvg(impact, carry, err, S);
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

  function build(host) {
    host.innerHTML =
      '<div class="bench">' +
        '<div class="bench-controls">' +
          '<label><span>Lie error <b class="bench-lie-out"></b></span>' +
            '<input type="range" class="bench-lie" min="-4" max="4" step="0.5" value="2"></label>' +
          '<label><span>Loft <b class="bench-loft-out"></b></span>' +
            '<input type="range" class="bench-loft" min="19" max="60" step="1" value="31"></label>' +
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

  function init() {
    $$('[data-lie-bench]').forEach(build);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
