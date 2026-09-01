/* ============================================================================
   fitting-engine.js — pure fitting logic, no DOM.
   All public API on window.GolfFit
   ---------------------------------------------------------------------------
   The Bay Scale (section 2) is our own static lie-angle scale. Data sources
   and validation are documented in README.md > "Provenance".
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------
     1. UNITS
     ------------------------------------------------------------------ */
  var U = {
    cmToIn: function (cm) { return cm / 2.54; },
    inToCm: function (i) { return i * 2.54; },
    ftInToIn: function (ft, inch) { return (ft || 0) * 12 + (inch || 0); },
    fmtHeight: function (inches) {
      var ft = Math.floor(inches / 12), i = inches - ft * 12;
      return ft + "'" + (Math.round(i * 10) / 10) + '"';
    },
    fmtIn: function (v, dp) {
      dp = dp == null ? 2 : dp;
      return (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)) + '"';
    },
    fmtAdj: function (v) {
      if (Math.abs(v) < 0.01) return 'Standard';
      var s = v > 0 ? '+' : '−';
      var a = Math.abs(v);
      var frac = a === 0.25 ? '¼' : a === 0.5 ? '½' : a === 0.75 ? '¾'
        : a === 1.25 ? '1¼' : a === 1.5 ? '1½' : a === 1.75 ? '1¾' : String(a);
      return s + frac + '"';
    }
  };

  /* ---------------------------------------------------------------------
     1b. LIE-ANGLE PHYSICS
     ---------------------------------------------------------------------
     A lie error is the club rotated about the target line — toe up or heel
     up as seen down the line. Rotating a lofted face about that axis swings
     where the face points, and the amount depends on the loft:

         face change = arctan( sin(lie error) x tan(loft) )

     Derived from the rotation of the face normal and checked numerically.
     Two sanity checks it must pass: a 0-degree face (a putter) is completely
     immune to lie error, and the sign flips with the direction of the error.

     The consequence is much larger than most fitting copy suggests. One
     degree of lie error moves a 4-iron face 0.38 degrees and a 60-degree
     wedge face 1.73 degrees — a factor of four and a half.

     Ball flight then has two parts:
       - START LINE. About 75% of an iron's start direction comes from the
         face (85% for a driver); the rest follows the path.
       - CURVE. The face is now closed or open to an unchanged path, so the
         ball keeps turning. Anchored on published TrackMan figures: one
         degree of face-to-path is about 12 yards of curve at 300 yards, and
         an iron carrying ~150 yards curves about 3 yards per degree. Both
         fit curve = f2p x 3.0 x (distance/150)^2 to within a few percent.

     Curve is the approximate half of this and is labelled as such wherever
     it is shown.
     ------------------------------------------------------------------ */
  function faceChangeFromLie(loftDeg, lieErrorDeg) {
    var E = lieErrorDeg * Math.PI / 180, L = loftDeg * Math.PI / 180;
    return Math.atan(Math.sin(E) * Math.tan(L)) * 180 / Math.PI;
  }

  /**
   * What one lie error does to one club.
   * Positive lieError = toe up = face closes = miss to the player's home side.
   */
  function lieImpact(loftDeg, lieErrorDeg, carryYards, isDriver) {
    var face = faceChangeFromLie(loftDeg, lieErrorDeg);
    var startFraction = isDriver ? 0.85 : 0.75;
    var startDeg = face * startFraction;
    var startYards = carryYards * Math.tan(startDeg * Math.PI / 180);
    var curveYards = face * 3.0 * Math.pow(carryYards / 150, 2);
    var total = startYards + curveYards;
    return {
      faceChange: Math.round(face * 100) / 100,
      startYards: Math.round(startYards * 10) / 10,
      curveYards: Math.round(curveYards * 10) / 10,
      totalYards: Math.round(total * 10) / 10,
      percentOfShot: Math.round((total / carryYards) * 1000) / 10
    };
  }

  /* Length and lie are coupled, and the standard clubmaking rule is 1 degree
     per half inch — twice what a lot of published copy claims. A LONGER club
     plays MORE UPRIGHT, because soling it with the grip at the same height
     lifts the toe. Shorter plays flatter. */
  var LIE_DEG_PER_INCH = 2;

  function lieFromLengthChange(inches) {
    return inches * LIE_DEG_PER_INCH;
  }

  /* ---------------------------------------------------------------------
     2. THE BAY SCALE — our static lie-angle scale
     ---------------------------------------------------------------------
     What the scale measures
     -----------------------
     Two golfers of the same height can need lie angles several degrees
     apart, because lie angle is driven by how far the hands sit from the
     ground at address — which is arm length, not height. Wrist-to-floor
     captures that; height alone cannot.

     So the scale works on the DIFFERENCE between a player's measured
     wrist-to-floor and the reference wrist-to-floor for their height:

         delta   = measuredWTF − referenceWTF(height)
         code    = round(delta)        one code per 1" of deviation
         degrees = delta               reported to one decimal place

     Positive delta means short arms for your height: your hands sit high at
     address, so the club must be more UPRIGHT. Negative delta means long
     arms: hands low, club must be FLATTER.

     Codes are self-documenting. U2 means two degrees upright. F1 means one
     degree flat. LEVEL means standard. No lookup table required.

     The reference curve
     -------------------
     REFERENCE_WTF is the wrist-to-floor at the CENTRE of the LEVEL band,
     per inch of height. It is anchored to the one reference point the whole
     fitting industry publishes in common — a 5'10" golfer with a 34"
     wrist-to-floor plays standard length and standard lie — and shaped by
     two principles:

       1. Inside a length band nothing about the club changes, so the curve
          rises only with body proportion (about 0.1"/inch of height).
       2. Crossing a length band changes the club by 1/2", and a 1/2" length
          change is worth a full degree of effective lie (see LIE_DEG_PER_INCH
          above), so the curve steepens where length is changing — about
          0.4-0.5"/inch of height, which is what the measured curve does.

     Values are round quarter-inch figures we chose, not a transcription of
     any manufacturer's chart. See README.md for validation.
     ------------------------------------------------------------------ */
  var REFERENCE_WTF = {
    60: 30.75, 61: 31.25, 62: 31.75, 63: 32.25, 64: 32.75,
    65: 33.00, 66: 33.25, 67: 33.50, 68: 33.60, 69: 33.70,
    70: 33.80, 71: 33.90, 72: 34.00, 73: 34.25, 74: 34.60,
    75: 35.00, 76: 35.40, 77: 35.80, 78: 36.20, 79: 36.60
  };

  /* ---------------------------------------------------------------------
     HANDEDNESS
     ---------------------------------------------------------------------
     Shot shapes are named from the player's point of view and are therefore
     handedness-neutral: a slice always curves AWAY from the player, a hook
     always curves toward them. Only the words "left" and "right" flip, so
     every direction in user-facing text is written through this helper.
     ------------------------------------------------------------------ */
  function sides(input) {
    var lh = input && input.handedness === 'left';
    return {
      away: lh ? 'left' : 'right',   // where a slice/push finishes
      home: lh ? 'right' : 'left'    // where a hook/pull finishes
    };
  }

  function levelCentre(heightIn) {
    if (heightIn <= 60) return REFERENCE_WTF[60] - (60 - heightIn) * 0.50;
    if (heightIn >= 79) return REFERENCE_WTF[79] + (heightIn - 79) * 0.40;
    var lo = Math.floor(heightIn), t = heightIn - lo;
    return REFERENCE_WTF[lo] * (1 - t) + REFERENCE_WTF[lo + 1] * t;
  }

  /* The Bay Scale. Symmetric, 11 steps, warm for flat through our signature
     green at level to cool for upright. Index 0 == LEVEL == standard lie. */
  var BAY_SCALE = [
    { i: -5, code: 'F5', deg: -5, label: '5° Flat',    hex: '#7A2E1F', ink: '#FFFFFF', name: 'Rust' },
    { i: -4, code: 'F4', deg: -4, label: '4° Flat',    hex: '#A84324', ink: '#FFFFFF', name: 'Ember' },
    { i: -3, code: 'F3', deg: -3, label: '3° Flat',    hex: '#C7622A', ink: '#FFFFFF', name: 'Copper' },
    { i: -2, code: 'F2', deg: -2, label: '2° Flat',    hex: '#E08A34', ink: '#1B1B1B', name: 'Amber' },
    { i: -1, code: 'F1', deg: -1, label: '1° Flat',    hex: '#EFBB50', ink: '#1B1B1B', name: 'Gold' },
    { i:  0, code: 'LEVEL', deg: 0, label: 'Standard', hex: '#34C07A', ink: '#08130D', name: 'Fairway' },
    { i:  1, code: 'U1', deg:  1, label: '1° Upright', hex: '#3FC0B4', ink: '#08130D', name: 'Teal' },
    { i:  2, code: 'U2', deg:  2, label: '2° Upright', hex: '#3AA5D9', ink: '#08130D', name: 'Sky' },
    { i:  3, code: 'U3', deg:  3, label: '3° Upright', hex: '#4F7FE0', ink: '#FFFFFF', name: 'Cobalt' },
    { i:  4, code: 'U4', deg:  4, label: '4° Upright', hex: '#7B62D9', ink: '#FFFFFF', name: 'Indigo' },
    { i:  5, code: 'U5', deg:  5, label: '5° Upright', hex: '#A85BC9', ink: '#FFFFFF', name: 'Violet' }
  ];

  var SCALE_MIN = -5, SCALE_MAX = 5;

  /* ---------------------------------------------------------------------
     THE COLOUR FIELD
     ---------------------------------------------------------------------
     The scale was always continuous — a player is +1.3 degrees, not merely
     "U1" — and hard band edges were an artefact of a chart that had to be
     printed. So colour is interpolated across the whole range: two players a
     tenth of a degree apart get visibly different colours, which is the
     truth of it.

     The reference is ours. Pantone's library is licensed and enforced, and
     borrowing a proprietary colour system to escape a proprietary chart
     would be a poor trade.
     ------------------------------------------------------------------ */
  function hexToRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function rgbToHex(c) {
    return '#' + c.map(function (v) {
      var n = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return n.length < 2 ? '0' + n : n;
    }).join('').toUpperCase();
  }

  function colourAt(deviation) {
    var d = Math.max(SCALE_MIN, Math.min(SCALE_MAX, deviation));
    var lo = Math.floor(d), hi = Math.ceil(d), t = d - lo;
    var a = hexToRgb(codeByIndex(lo).hex), b = hexToRgb(codeByIndex(hi).hex);
    return rgbToHex([0, 1, 2].map(function (k) { return a[k] + (b[k] - a[k]) * t; }));
  }

  /* Readable ink for an arbitrary background, by relative luminance. */
  function inkFor(hex) {
    var c = hexToRgb(hex).map(function (v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return L > 0.36 ? '#0B1310' : '#FFFFFF';
  }

  /**
   * Your colour, named and referenced. "Teal 63" plus the hex.
   * The reference runs 00 at 5 degrees flat to 100 at 5 degrees upright.
   */
  function swatchFor(deviation) {
    var d = Math.max(SCALE_MIN, Math.min(SCALE_MAX, deviation));
    var hex = colourAt(d);
    var base = codeByIndex(Math.round(d));
    var ref = Math.round(((d - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100);
    var padded = ref < 10 ? '0' + ref : String(ref);
    return {
      hex: hex, ink: inkFor(hex), name: base.name, ref: padded,
      label: base.name + ' ' + padded, code: base.code
    };
  }

  function codeByIndex(k) {
    k = Math.max(SCALE_MIN, Math.min(SCALE_MAX, k));
    for (var n = 0; n < BAY_SCALE.length; n++) if (BAY_SCALE[n].i === k) return BAY_SCALE[n];
    return BAY_SCALE[5];
  }

  /**
   * Static lie-angle fit. heightIn and wtfIn in inches.
   * Returns the Bay Scale code plus the precise deviation, so a player can
   * see whether they sit in the middle of a band or on its edge.
   */
  function staticLie(heightIn, wtfIn) {
    var centre = levelCentre(heightIn);
    var delta = wtfIn - centre;                 // degrees, unrounded
    var k = Math.round(delta);
    var clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, k));
    var code = codeByIndex(clamped);
    var offset = delta - k;                     // −0.5 .. +0.5 within the band
    var borderline = Math.abs(offset) > 0.35;
    var neighbour = (borderline && clamped === k) ? codeByIndex(k + (offset > 0 ? 1 : -1)) : null;
    return {
      code: code,
      swatch: swatchFor(delta),
      preciseDegrees: Math.round(delta * 10) / 10,
      bandOffset: Math.round(offset * 100) / 100,
      borderline: borderline,
      neighbour: neighbour,
      clampedOffScale: k !== clamped,
      levelBand: [centre - 0.5, centre + 0.5],
      levelCentre: centre
    };
  }

  /* Length from height. Half-inch steps, because that is the increment club
     builders actually work in. */
  var LENGTH_BANDS = [
    { min: -Infinity, max: 59.99, adj: -2.0, note: 'below the range this table covers — extrapolated' },
    { min: 60, max: 61.99, adj: -1.5 },
    { min: 62, max: 63.99, adj: -1.0 },
    { min: 64, max: 66.99, adj: -0.5 },
    { min: 67, max: 72.99, adj: 0 },
    { min: 73, max: 75.99, adj: 0.5 },
    { min: 76, max: 77.99, adj: 1.0 },
    { min: 78, max: 79.99, adj: 1.5 },
    { min: 80, max: Infinity, adj: 2.0, note: 'above the range this table covers — extrapolated' }
  ];

  function staticLength(heightIn) {
    for (var i = 0; i < LENGTH_BANDS.length; i++) {
      if (heightIn >= LENGTH_BANDS[i].min && heightIn <= LENGTH_BANDS[i].max) {
        return { adj: LENGTH_BANDS[i].adj, note: LENGTH_BANDS[i].note || null };
      }
    }
    return { adj: 0, note: null };
  }

  /* Wrist-to-floor cross-check: a second opinion on length, because WTF
     captures arm length where height alone does not. */
  function wtfLengthCheck(wtfIn) {
    if (wtfIn < 32) return { adj: -1.0, band: 'under 32"' };
    if (wtfIn < 34) return { adj: -0.5, band: '32"–34"' };
    if (wtfIn <= 36) return { adj: 0, band: '34"–36"' };
    if (wtfIn <= 37.5) return { adj: 0.5, band: '36"–37.5"' };
    return { adj: 1.0, band: 'over 37.5"' };
  }

  /* ---------------------------------------------------------------------
     3. SPEED ESTIMATION
     ---------------------------------------------------------------------
     Ratios from TrackMan / published tour + amateur averages:
       7-iron club speed ~= 0.80 x driver club speed (stable across levels)
       7-iron carry / 7-iron club speed = strike efficiency, which DOES move
       with strike quality: ~1.66 (beginner) to ~1.90 (tour).
     ------------------------------------------------------------------ */
  /* Strike quality by skill level.
       ironEff       = 7-iron carry yards per mph of 7-iron clubhead speed
       driverYdsPerMph = driver carry yards per mph of driver clubhead speed
     Anchors: TrackMan average male amateur (driver 93 mph / 214 yd carry,
     7-iron 133 yd carry) and PGA Tour (driver 113 mph / 275 yd carry,
     7-iron 172 yd carry). */
  var SKILL_EFF = {
    beginner: { ironEff: 1.72, driverYdsPerMph: 2.05 },
    high:     { ironEff: 1.80, driverYdsPerMph: 2.20 },
    mid:      { ironEff: 1.88, driverYdsPerMph: 2.30 },
    low:      { ironEff: 1.94, driverYdsPerMph: 2.38 },
    scratch:  { ironEff: 2.00, driverYdsPerMph: 2.45 }
  };

  function skillEff(skill) { return SKILL_EFF[skill] || SKILL_EFF.mid; }
  function ironEfficiency(skill) { return skillEff(skill).ironEff; }

  function estimateSpeeds(input) {
    var se = skillEff(input.skill);
    var eff = se.ironEff;
    var driverSS = null, ironSS = null, source = null, confidence = 'low';

    if (isNum(input.driverSpeed)) {
      driverSS = input.driverSpeed;
      ironSS = driverSS * 0.80;
      source = 'measured driver clubhead speed';
      confidence = 'high';
    } else if (isNum(input.ironSpeed)) {
      ironSS = input.ironSpeed;
      driverSS = ironSS / 0.80;
      source = 'measured 7-iron clubhead speed';
      confidence = 'high';
    } else if (isNum(input.ironCarry)) {
      ironSS = input.ironCarry / eff;
      driverSS = ironSS / 0.80;
      source = '7-iron carry distance';
      confidence = 'medium';
    } else if (isNum(input.driverCarry)) {
      driverSS = input.driverCarry / se.driverYdsPerMph;
      ironSS = driverSS * 0.80;
      source = 'driver carry distance';
      confidence = 'medium';
    } else {
      var g = input.gender === 'female' ? 78 : 93;
      if (input.skill === 'scratch') g += 12;
      else if (input.skill === 'low') g += 6;
      else if (input.skill === 'high') g -= 5;
      else if (input.skill === 'beginner') g -= 9;
      var age = isNum(input.age) ? input.age : 40;
      if (age >= 50) g -= (Math.min(age, 80) - 50) * 0.45;
      if (age < 25) g += 3;
      driverSS = g;
      ironSS = g * 0.80;
      source = 'estimated from age, gender and skill level (no speed supplied)';
      confidence = 'low';
    }
    return {
      driver: round1(driverSS),
      iron7: round1(ironSS),
      iron7Carry: isNum(input.ironCarry) ? input.ironCarry : Math.round(ironSS * eff),
      driverCarry: isNum(input.driverCarry) ? input.driverCarry : Math.round(driverSS * se.driverYdsPerMph),
      source: source,
      confidence: confidence,
      efficiency: eff
    };
  }

  /* ---------------------------------------------------------------------
     4. SHAFT FLEX / WEIGHT / MATERIAL
     ------------------------------------------------------------------ */
  var FLEX_ORDER = ['L', 'A', 'R', 'S', 'X', 'XX'];
  var FLEX_NAME = {
    L: 'Ladies (L)', A: 'Senior / Light (A)', R: 'Regular (R)',
    S: 'Stiff (S)', X: 'Extra Stiff (X)', XX: 'Tour X / TX'
  };

  function driverFlexFromSpeed(mph) {
    if (mph < 72) return 'L';
    if (mph < 84) return 'A';
    if (mph < 97) return 'R';
    if (mph < 105) return 'S';
    if (mph < 118) return 'X';
    return 'XX';
  }

  function flexBoundaryDistance(mph) {
    var edges = [72, 84, 97, 105, 118], best = 99;
    for (var i = 0; i < edges.length; i++) best = Math.min(best, Math.abs(mph - edges[i]));
    return best;
  }

  /* Tempo nudges never push past X — XX/TX is a specialist shaft that should
     only be reached on measured speed, never on a described tempo. */
  function bump(flex, n) {
    var i = FLEX_ORDER.indexOf(flex) + n;
    var cur = FLEX_ORDER.indexOf(flex);
    var cap = n > 0 ? Math.max(cur, FLEX_ORDER.indexOf('X')) : FLEX_ORDER.length - 1;
    return FLEX_ORDER[Math.max(0, Math.min(cap, i))];
  }

  function shaftFit(speeds, input) {
    var base = driverFlexFromSpeed(speeds.driver);
    var driverFlex = base, tempoNote = null;
    var near = flexBoundaryDistance(speeds.driver) <= 4;

    if (input.tempo === 'aggressive') {
      if (near) {
        driverFlex = bump(base, 1);
        tempoNote = 'Bumped up one flex: you are within 4 mph of a flex boundary and describe an aggressive transition, which loads a shaft like extra speed does.';
      } else {
        tempoNote = 'An aggressive transition means you should favour the stiffer and heavier end of this flex, and pay attention to the shaft’s butt stiffness and torque rather than just the letter printed on it.';
      }
    } else if (input.tempo === 'smooth') {
      if (near) {
        driverFlex = bump(base, -1);
        tempoNote = 'Softened one flex: you are within 4 mph of a flex boundary and describe a smooth transition, so the stiffer option is likely to feel boardy and launch low.';
      } else {
        tempoNote = 'A smooth tempo means favour the softer and lighter end of this flex band.';
      }
    }

    var i7 = speeds.iron7;
    var ironFlex = i7 < 58 ? 'L' : i7 < 67 ? 'A' : i7 < 78 ? 'R' : i7 < 84 ? 'S' : i7 < 94 ? 'X' : 'XX';
    if (input.tempo === 'aggressive' && near) ironFlex = bump(ironFlex, 1);
    if (input.tempo === 'smooth' && near) ironFlex = bump(ironFlex, -1);

    var wantsGraphite = false, graphiteReasons = [];
    if (i7 < 70) { wantsGraphite = true; graphiteReasons.push('7-iron speed under 70 mph — lighter shafts buy you speed you cannot otherwise generate.'); }
    if (isNum(input.age) && input.age >= 60) { wantsGraphite = true; graphiteReasons.push('Age 60+ — graphite reduces the load through hands, wrists and elbows.'); }
    if (input.joints) { wantsGraphite = true; graphiteReasons.push('You flagged joint pain or arthritis — graphite damps impact vibration significantly.'); }
    if (input.gender === 'female' && i7 < 76) { wantsGraphite = true; graphiteReasons.push('Your speed profile is better served by a lighter graphite iron shaft.'); }

    var material = wantsGraphite ? 'Graphite' : 'Steel';
    if (!wantsGraphite && i7 >= 70 && i7 < 76) {
      graphiteReasons.push('Borderline — modern premium graphite iron shafts (95–105 g) are worth testing head-to-head against steel at your speed.');
    }

    var driverWeight, ironWeight, driverRange, ironRange;
    switch (driverFlex) {
      case 'L': driverRange = [40, 50]; break;
      case 'A': driverRange = [45, 55]; break;
      case 'R': driverRange = [55, 65]; break;
      case 'S': driverRange = [60, 70]; break;
      case 'X': driverRange = [70, 80]; break;
      default: driverRange = [75, 90];
    }
    driverWeight = driverRange[0] + '–' + driverRange[1] + ' g';
    if (material === 'Graphite') {
      ironRange = i7 < 62 ? [45, 55] : i7 < 70 ? [55, 70] : i7 < 78 ? [70, 85] : [85, 105];
    } else {
      ironRange = ironFlex === 'A' ? [85, 95] : ironFlex === 'R' ? [95, 110]
        : ironFlex === 'S' ? [105, 120] : [120, 130];
    }
    ironWeight = ironRange[0] + '–' + ironRange[1] + ' g';
    if (input.tempo === 'smooth') ironWeight += ' (favour the lighter end)';
    if (input.tempo === 'aggressive') ironWeight += ' (favour the heavier end)';

    var profile = 'Mid launch / mid spin.';
    if (input.trajectory === 'low') profile = 'Mid-high launch / mid-high spin — you need help getting the ball up and holding greens.';
    else if (input.trajectory === 'high') profile = 'Low-mid launch / low spin — your flight is already high enough, and a ballooning flight bleeds carry into any wind.';

    return {
      driverFlex: driverFlex, driverFlexName: FLEX_NAME[driverFlex],
      ironFlex: ironFlex, ironFlexName: FLEX_NAME[ironFlex],
      baseFlex: base, baseFlexName: FLEX_NAME[base], tempoNote: tempoNote,
      material: material, graphiteReasons: graphiteReasons,
      driverWeight: driverWeight, ironWeight: ironWeight,
      driverRange: driverRange, ironRange: ironRange,
      profile: profile, nearBoundary: near
    };
  }

  /* ---------------------------------------------------------------------
     4b. SHAFT LIBRARY
     ---------------------------------------------------------------------
     "Buy something 105-120 g" is not actionable. These are widely stocked
     models that a fitter or a club shop will have in the building rack, so a
     player can walk in and ask for one by name. Weight is the real spec; the
     letter on the shaft is not standardised between manufacturers.

     Reviewed August 2026. Models come and go — treat as a starting shortlist,
     not gospel, and check what your fitter actually has.
     ------------------------------------------------------------------ */
  var SHAFT_LIBRARY = {
    ironSteel: [
      { name: 'True Temper Elevate MPH 85', g: [83, 88], flex: ['A', 'R'], launch: 'high' },
      { name: 'Nippon N.S. Pro 850GH', g: [85, 90], flex: ['A', 'R', 'S'], launch: 'high' },
      { name: 'True Temper Elevate 95', g: [94, 99], flex: ['R', 'S'], launch: 'high' },
      { name: 'KBS Tour Lite', g: [95, 105], flex: ['R', 'S'], launch: 'mid-high' },
      { name: 'Project X LZ', g: [95, 125], flex: ['R', 'S', 'X'], launch: 'mid' },
      { name: 'Nippon N.S. Pro Modus³ Tour 105', g: [103, 107], flex: ['R', 'S', 'X'], launch: 'mid' },
      { name: 'True Temper Dynamic Gold 105', g: [103, 108], flex: ['R', 'S'], launch: 'mid-low' },
      { name: 'KBS Tour', g: [110, 130], flex: ['R', 'S', 'X'], launch: 'mid' },
      { name: 'Nippon N.S. Pro Modus³ Tour 120', g: [114, 120], flex: ['S', 'X'], launch: 'mid-low' },
      { name: 'True Temper Dynamic Gold 120 / VSS', g: [119, 132], flex: ['S', 'X', 'XX'], launch: 'low' }
    ],
    ironGraphite: [
      { name: 'UST Mamiya Recoil ES 460', g: [45, 55], flex: ['L', 'A'], launch: 'high' },
      { name: 'Mitsubishi MMT 60', g: [55, 65], flex: ['A', 'R'], launch: 'mid-high' },
      { name: 'UST Mamiya Recoil 660 / 680', g: [63, 72], flex: ['A', 'R', 'S'], launch: 'mid-high' },
      { name: 'Aerotech SteelFiber i70 / i80', g: [68, 85], flex: ['R', 'S'], launch: 'mid' },
      { name: 'Mitsubishi MMT 80', g: [75, 85], flex: ['R', 'S'], launch: 'mid' },
      { name: 'Aerotech SteelFiber i95', g: [90, 98], flex: ['R', 'S', 'X'], launch: 'mid' },
      { name: 'Aerotech SteelFiber i110', g: [105, 115], flex: ['S', 'X'], launch: 'mid-low' }
    ],
    driver: [
      { name: 'Aldila Ascent / UST Attas Speed', g: [40, 52], flex: ['L', 'A'], launch: 'high' },
      { name: 'Mitsubishi Tensei AV Blue', g: [50, 62], flex: ['A', 'R', 'S'], launch: 'mid-high' },
      { name: 'Fujikura Ventus Red', g: [50, 66], flex: ['A', 'R', 'S'], launch: 'high' },
      { name: 'Project X HZRDUS Smoke Red RDX', g: [55, 65], flex: ['R', 'S'], launch: 'mid-high' },
      { name: 'Fujikura Ventus Blue', g: [55, 75], flex: ['R', 'S', 'X'], launch: 'mid' },
      { name: 'Mitsubishi Tensei 1K Black', g: [60, 80], flex: ['S', 'X'], launch: 'low' },
      { name: 'Fujikura Ventus Black', g: [60, 85], flex: ['S', 'X', 'XX'], launch: 'low' },
      { name: 'Graphite Design Tour AD series', g: [55, 85], flex: ['R', 'S', 'X'], launch: 'mid' }
    ]
  };

  var LAUNCH_ORDER = ['low', 'mid-low', 'mid', 'mid-high', 'high'];

  function wantedLaunch(trajectory) {
    if (trajectory === 'low') return 'mid-high';
    if (trajectory === 'high') return 'mid-low';
    return 'mid';
  }

  function pickShafts(list, flex, range, trajectory) {
    var want = wantedLaunch(trajectory);
    var wantIdx = LAUNCH_ORDER.indexOf(want);
    return list
      .filter(function (x) {
        var overlaps = x.g[0] <= range[1] && x.g[1] >= range[0];
        return overlaps && x.flex.indexOf(flex) !== -1;
      })
      .map(function (x) {
        var d = Math.abs(LAUNCH_ORDER.indexOf(x.launch) - wantIdx);
        return { shaft: x, dist: d };
      })
      .sort(function (a, b) { return a.dist - b.dist; })
      .slice(0, 3)
      .map(function (o) {
        return {
          name: o.shaft.name,
          weight: o.shaft.g[0] === o.shaft.g[1] ? o.shaft.g[0] + ' g' : o.shaft.g[0] + '–' + o.shaft.g[1] + ' g',
          launch: o.shaft.launch,
          onProfile: o.dist === 0
        };
      });
  }

  function shaftSuggestions(shafts, input) {
    return {
      irons: pickShafts(shafts.material === 'Graphite' ? SHAFT_LIBRARY.ironGraphite : SHAFT_LIBRARY.ironSteel,
        shafts.ironFlex, shafts.ironRange, input.trajectory),
      driver: pickShafts(SHAFT_LIBRARY.driver, shafts.driverFlex, shafts.driverRange, input.trajectory),
      note: 'Shortlist only, reviewed August 2026. Weight is the spec that matters; flex letters are not standardised between manufacturers, so a Stiff in one model can play like a Regular in another. Hit them before you buy.'
    };
  }

  /* ---------------------------------------------------------------------
     5. DRIVER
     ------------------------------------------------------------------ */
  function driverFit(speeds, input, lengthAdj) {
    var s = speeds.driver, lo, hi;
    if (s < 75) { lo = 12.0; hi = 13.5; }
    else if (s < 85) { lo = 11.5; hi = 12.5; }
    else if (s < 95) { lo = 10.5; hi = 11.5; }
    else if (s < 105) { lo = 9.5; hi = 10.5; }
    else { lo = 8.5; hi = 9.5; }

    var adjust = 0, reasons = [];
    if (input.attack === 'steep') { adjust += 1.0; reasons.push('You hit down on the ball. A descending strike with the driver kills launch and adds spin, so you need more static loft to reach a usable launch window.'); }
    if (input.attack === 'shallow') { adjust -= 0.5; reasons.push('You sweep or hit up on the ball. A positive attack angle adds launch for free, so you can afford less loft.'); }
    if (input.trajectory === 'low') { adjust += 0.5; reasons.push('Your natural ball flight is low.'); }
    if (input.trajectory === 'high') { adjust -= 0.5; reasons.push('Your natural flight is already high — too much loft will balloon and lose carry.'); }
    if (input.shotShape === 'slice' || input.shotShape === 'fade') { adjust += 0.5; reasons.push('More loft reduces sidespin. A slice curves measurably less off a 10.5° head than off a 9° one.'); }

    lo = clamp(lo + adjust, 7.5, 15);
    hi = clamp(hi + adjust, 8.5, 16);
    var loft = (Math.round(lo * 2) / 2) + '°–' + (Math.round(hi * 2) / 2) + '°';

    var stock = input.gender === 'female' ? 44.5 : 45.75;
    var target = input.gender === 'female' ? 44.0 : 45.0;
    if (input.skill === 'beginner' || input.skill === 'high') target -= 0.25;
    if (input.priority === 'accuracy') target -= 0.25;
    if (input.priority === 'distance') target += 0.25;
    target += lengthAdj * 0.5;
    target = clamp(Math.round(target * 4) / 4, 42.5, 46.0);

    var head = [];
    if (input.shotShape === 'slice') head.push('Draw-biased or adjustable head set to the draw setting. Heel-weighted and offset drivers can be worth 15–25 yards of reduced curve to a slicer — the single biggest equipment lever available to you.');
    else if (input.shotShape === 'fade') head.push('Neutral head with a movable weight you can slide toward the heel.');
    else if (input.shotShape === 'hook') head.push('Neutral-to-fade-biased head, weight toward the toe, and consider a lower-torque shaft — a soft tip section helps the face close.');
    else head.push('Neutral head with an adjustable hosel so you can trim launch and face angle once you see it on a launch monitor.');

    if (input.skill === 'beginner' || input.skill === 'high' || input.priority === 'forgiveness') {
      head.push('Choose the maximum-MOI "max forgiveness" model rather than the low-spin tour head. Low-spin heads are punishing on heel and toe strikes.');
    } else if (speeds.driver > 105 && (input.skill === 'low' || input.skill === 'scratch')) {
      head.push('A low-spin model is genuinely appropriate at your speed — you have enough speed to carry the reduced launch.');
    }

    return {
      loft: loft, loftLo: Math.round(lo * 2) / 2, loftHi: Math.round(hi * 2) / 2,
      loftReasons: reasons,
      length: target, stockLength: stock,
      lengthDelta: Math.round((stock - target) * 100) / 100,
      head: head,
      swingWeight: input.tempo === 'aggressive' ? 'D3–D5' : input.tempo === 'smooth' ? 'C9–D1' : 'D1–D3'
    };
  }

  /* ---------------------------------------------------------------------
     6. IRON HEAD CATEGORY
     ------------------------------------------------------------------ */
  function ironHeadFit(input, speeds) {
    var S = sides(input);
    var hcp = isNum(input.handicap) ? input.handicap
      : (input.skill === 'scratch' ? 2 : input.skill === 'low' ? 8 : input.skill === 'mid' ? 15 : input.skill === 'high' ? 22 : 30);
    var cat, why, alt;

    if (hcp <= 4 && input.priority === 'workability') {
      cat = 'Players / Muscle-back';
      why = 'Single-figure handicap with a stated preference for shaping shots. Minimal offset, thin topline, short blade length: all feedback, no help.';
      alt = 'A combo set (4–6 iron in a players-distance head, 7–PW in blades) is what most tour players actually carry, and it is the smarter build for almost everyone who wants blades.';
    } else if (hcp <= 9) {
      cat = 'Players Cavity / Players Distance';
      why = 'Compact head and modest offset, but a perimeter-weighted cavity so that heel and toe strikes still hold a green. This is the sweet spot for single-figure players who are not trying to shape every shot.';
      alt = 'If you miss the centre more often than you would like, a players-distance head gives up almost nothing in looks and adds real ball speed on mishits.';
    } else if (hcp <= 18) {
      cat = 'Players Distance / Game Improvement';
      why = 'Mid handicap is the transition zone. Players-distance heads keep a clean look with a hollow body or forged face for ball speed; game improvement adds a wider sole and more offset if you fight low shots to the ' + S.away + '.';
      alt = (input.shotShape === 'slice' || input.shotShape === 'fade')
        ? 'Given your ' + S.home + '-to-' + S.away + ' miss, take the game-improvement option — the extra offset genuinely helps you square the face.'
        : 'With your ball flight either category works. Pick on looks and turf interaction, and hit both off real grass if you can.';
    } else if (hcp <= 27) {
      cat = 'Game Improvement';
      why = 'Wide sole, deep and low centre of gravity, strong perimeter weighting and noticeable offset. Gets the ball airborne from imperfect lies and rescues the thin and heel strikes that cost you most.';
      alt = 'Avoid players irons entirely at this stage. The distance loss on a mishit with a blade is 15–25 yards, and you will hit more mishits than centres.';
    } else {
      cat = 'Super Game Improvement';
      why = 'Maximum sole width, hybrid-like long irons, very low centre of gravity and generous offset. Designed to make an imperfect strike playable rather than to reward a perfect one.';
      alt = 'Many sets in this category replace the 4–6 irons with iron-shaped hybrids as standard. Take them — do not special-order the long irons back in.';
    }

    if (speeds.iron7 < 65 && hcp <= 12) {
      alt += ' One more thing: your speed is lower than your handicap suggests, so prioritise a low-CG head and a slightly stronger loft over a compact blade profile.';
    }
    return { category: cat, why: why, alternative: alt, handicapUsed: hcp };
  }

  /* ---------------------------------------------------------------------
     7. GRIP
     ------------------------------------------------------------------ */
  function gripFit(input) {
    var S = sides(input);
    var h = input.handLength;
    var size, why, key;
    if (!isNum(h)) {
      var g = input.gloveSize;
      size = (g === 'S') ? 'Undersize / Standard'
        : (g === 'XL' || g === 'XXL') ? 'Midsize'
        : (g === 'L') ? 'Standard (+2 wraps) or Midsize' : 'Standard';
      key = (g === 'S') ? 'Standard' : (g === 'XL' || g === 'XXL') ? 'Midsize' : (g === 'L') ? 'Midsize' : 'Standard';
      why = 'Based on glove size alone. Measure hand length (wrist crease to the tip of your middle finger) for a firmer answer.';
    } else if (h < 6.9) {
      size = 'Undersize'; key = 'Undersize'; why = 'Hand length under 6.9". An undersize grip is roughly 1/64" smaller in diameter than standard.';
    } else if (h < 7.6) {
      size = 'Standard'; key = 'Standard'; why = 'Hand length 6.9"–7.6" is squarely standard — the size almost every club ships with.';
    } else if (h <= 8.25) {
      size = 'Midsize (or Standard + 2 wraps)'; key = 'Midsize'; why = 'Hand length 7.6"–8.25". Midsize is roughly 1/16" larger in diameter than standard.';
    } else {
      size = 'Jumbo / Oversize'; key = 'Jumbo'; why = 'Hand length over 8.25". Jumbo is around 1/8" larger in diameter than standard.';
    }

    var mods = [];
    if (input.shotShape === 'hook' || input.shotShape === 'pull') mods.push('Your ' + S.home + '-side miss is a reason to go one size LARGER than the measurement suggests. A thicker grip quietens hand and wrist action and slows face rotation through impact.');
    if (input.shotShape === 'slice' || input.shotShape === 'push') mods.push('Your ' + S.away + '-side miss is a reason to stay at or slightly below the measured size. A thinner grip lets the hands release and helps the face square up.');
    if (input.joints) mods.push('With joint pain, go up a size and choose a softer compound. A larger, softer grip lets you hold the club with less grip pressure, which is worth more to arthritic hands than any other single spec in the bag.');
    if (isNum(input.age) && input.age >= 65) mods.push('Grip diameter tends to want to go up with age as hand strength drops. Midsize is very common past 65.');
    mods.push('Cross-check against your glove: a men’s Medium or Medium-Large glove usually lands on standard; XL and above usually points to midsize.');
    mods.push('Wraps of build-up tape are not a full substitute for a bigger grip — tape thickens the butt end but leaves the lower-hand area largely unchanged.');
    return { size: size, key: key, why: why, mods: mods };
  }

  /* ---------------------------------------------------------------------
     8. WEDGES
     ------------------------------------------------------------------ */
  function defaultPwLoft(cat) {
    if (/Muscle/.test(cat)) return 46;
    if (/Players Cavity/.test(cat)) return 45;
    if (/Super/.test(cat)) return 42;
    if (/Game Improvement/.test(cat)) return 43;
    return 44;
  }

  function wedgeFit(input, ironHead) {
    var pw = isNum(input.pwLoft) ? input.pwLoft : defaultPwLoft(ironHead.category);
    var lofts = [];
    var lowest = (input.skill === 'beginner' || input.skill === 'high') ? 56 : 58;
    if (input.turf === 'firm' && input.skill !== 'beginner' && input.skill !== 'high') lowest = 60;

    var span = lowest - pw;
    var steps = Math.max(1, Math.round(span / 5));
    for (var i = 1; i <= steps; i++) lofts.push(Math.round(pw + (span * i) / steps));
    lofts = lofts.filter(function (v, idx, a) { return a.indexOf(v) === idx; });

    var bounce, bounceWhy;
    var steep = input.attack === 'steep', shallow = input.attack === 'shallow';
    var soft = input.turf === 'soft', firm = input.turf === 'firm';
    if (steep && !firm) { bounce = 'High (12–14°)'; bounceWhy = 'A steep angle of attack drives the leading edge into the turf. High bounce is what stops the club digging, and too little bounce for a steep swing is the single most common wedge miss-fit in golf.'; }
    else if (shallow && !soft) { bounce = 'Low (4–8°)'; bounceWhy = 'You sweep the ball and play firm turf. Low bounce lets the leading edge get under the ball off tight lies without the sole skipping into the equator.'; }
    else if (soft) { bounce = 'Mid-High (10–14°)'; bounceWhy = 'Soft turf and soft sand swallow a low-bounce sole. More bounce keeps the club moving through wet turf and fluffy bunkers.'; }
    else if (firm) { bounce = 'Low-Mid (6–10°)'; bounceWhy = 'Firm turf and tight lies punish excess bounce — the sole bounces into the middle of the ball and you thin it over the green.'; }
    else { bounce = 'Mid (8–12°)'; bounceWhy = 'A neutral attack angle on normal turf is the classic mid-bounce fit, and mid bounce is the most versatile single choice across conditions.'; }

    var grind, grindWhy;
    if (steep || soft) {
      grind = 'Full / wide sole (Vokey S or D, Cleveland Full, PING WS)';
      grindWhy = 'Maximum sole width with no heel relief. You want support under the club, not versatility you will not use.';
    } else if (shallow && (input.skill === 'low' || input.skill === 'scratch')) {
      grind = 'Heel-and-toe relieved (Vokey M or L, PING SS/TS)';
      grindWhy = 'Relief lets you open the face for flops and short-sided lobs without the leading edge rising off the turf.';
    } else {
      grind = 'Mid / versatile (Vokey F or S, PING SS)';
      grindWhy = 'A trailing-edge-relieved sole that works square and slightly open. The safest single choice if you are unsure.';
    }

    return {
      pwLoft: pw, lofts: lofts,
      bounce: bounce, bounceWhy: bounceWhy,
      grind: grind, grindWhy: grindWhy,
      shaftNote: 'Build wedges with the same shaft as your irons or one slightly heavier — a dedicated "wedge flex" is fine. Wedges reward stability, not speed, so resist the urge to put the lightest shaft in the bag into your lob wedge.',
      gapNote: 'Gap your wedges 4–6° apart, which is roughly 10–15 yards. More than that and you leave a hole you have to manufacture a shot to cover; less than that and two clubs go the same distance and you have wasted one of your 14 slots.'
    };
  }

  /* ---------------------------------------------------------------------
     9. SET MAKEUP + GAPPING
     ------------------------------------------------------------------ */
  /* ---------------------------------------------------------------------
     Carry ladder.

     This has to describe the bag the player ACTUALLY carries, not a
     representative one. Bags vary enormously — a 7-wood here, three wedges
     there, a 2-iron for the wind — and a table that quietly leaves out
     somebody's 60° is worse than no table, because the gap it reports at the
     bottom of the bag is simply wrong.

     So: irons are stepped off the measured 7-iron at 7% per club, long clubs
     are spread evenly between the driver and the longest iron (which keeps
     the ladder monotonic however the two speed anchors disagree), and wedges
     come off the pitching wedge at ~2.55 yards per degree of loft.
     ------------------------------------------------------------------ */
  function buildLadder(speeds, bag) {
    var i7 = speeds.iron7Carry, f = 1.07;
    var rows = [];
    function push(club, yds) { rows.push({ club: club, carry: Math.round(Math.max(yds, 0)) }); }
    function ironCarry(n) { return i7 * Math.pow(f, 7 - n); }

    var longest = bag.longestIron;
    var topIron = ironCarry(longest);
    var dc = Math.max(speeds.driverCarry, topIron + 25);

    if (bag.hasDriver !== false) push('Driver', dc);

    var longs = bag.longs || [];
    for (var k = 0; k < longs.length; k++) {
      push(longs[k], dc - (dc - topIron) * ((k + 1) / (longs.length + 1)));
    }
    for (var c = longest; c <= 9; c++) push(c + '-iron', ironCarry(c));

    var pwCarry = ironCarry(10);
    push('PW (' + bag.pwLoft + '°)', pwCarry);
    /* Yards per degree of wedge loft is not a constant — it scales with how
       far the player hits it. 2.55 is right for a 150-yard 7-iron; a beginner
       loses proportionally less distance per degree. */
    var yardsPerDeg = 2.55 * (i7 / 150);
    (bag.wedgeLofts || []).forEach(function (L) {
      push(L + '° wedge', pwCarry - (L - bag.pwLoft) * yardsPerDeg);
    });
    return rows;
  }

  /* ---------------------------------------------------------------------
     9b. THE BAG TO BUILD
     ---------------------------------------------------------------------
     Prose like "3-wood, 5-wood, maybe a hybrid" is no use to somebody buying
     a set: it does not count, and the old version of this could recommend
     fifteen clubs to a fast player. This produces an explicit, counted list
     that respects the fourteen-club limit, with a loft against every slot.

     Long clubs are chosen from a speed-appropriate ladder, taken from the
     top down, because the gap that has to be covered first is the one
     directly below the driver.
     ------------------------------------------------------------------ */
  var LONG_LADDERS = {
    slow:    [['3-wood', 16], ['5-wood', 19], ['7-wood', 22], ['9-wood', 25], ['6-hybrid', 28]],
    midSlow: [['3-wood', 15], ['5-wood', 18], ['7-wood', 21], ['5-hybrid', 25], ['6-hybrid', 28]],
    mid:     [['3-wood', 15], ['5-wood', 18], ['4-hybrid', 21], ['5-hybrid', 25]],
    fast:    [['3-wood', 15], ['5-wood', 18], ['3-hybrid', 21]]
  };

  /* A HYBRID within a couple of degrees of the longest iron is a wasted slot:
     similar loft, similar shaft, same distance. A fairway wood at the same
     loft is a different matter — the shaft is inches longer, so it carries
     far further and earns its place. Loft alone does not decide this. */
  var MIN_HYBRID_LOFT_GAP = 2.5;

  function recommendedLongestIron(d) {
    return d < 82 ? 7 : d < 92 ? 6 : d < 102 ? 5 : 4;
  }

  function ladderFor(driverSpeed) {
    if (driverSpeed < 82) return LONG_LADDERS.slow;
    if (driverSpeed < 92) return LONG_LADDERS.midSlow;
    if (driverSpeed < 102) return LONG_LADDERS.mid;
    return LONG_LADDERS.fast;
  }

  function ironLoft(n, pwLoft) { return pwLoft - (10 - n) * 4; }

  function buildBag(speeds, input, wedges, longestIron, driverLoft) {
    var pw = wedges.pwLoft;
    var clubs = [];
    var notes = [];
    var starter = input.skill === 'beginner';
    /* Whether this is a set to buy or a set to carry changes every word we
       put around it. It used to change none of them, so a beginner who told
       us they already owned clubs was still handed "Your first set". */
    var owns = !!(input.bag && input.bag.hasClubs);

    if (starter) {
      /* A beginner does not need fourteen clubs. Ten covers the course, and
         the gaps get filled as the swing arrives. */
      clubs.push({ slot: 'Driver', name: 'Driver', loft: driverLoft });
      clubs.push({ slot: 'Fairway', name: '5-wood', loft: 18 });
      clubs.push({ slot: 'Hybrid', name: '6-hybrid', loft: 28 });
      clubs.push({ slot: 'Iron', name: '7-iron', loft: ironLoft(7, pw) });
      clubs.push({ slot: 'Iron', name: '8-iron', loft: ironLoft(8, pw) });
      clubs.push({ slot: 'Iron', name: '9-iron', loft: ironLoft(9, pw) });
      clubs.push({ slot: 'Wedge', name: 'Pitching wedge', loft: pw });
      clubs.push({ slot: 'Wedge', name: '52° wedge', loft: 52 });
      clubs.push({ slot: 'Wedge', name: 'Sand wedge', loft: 56 });
      clubs.push({ slot: 'Putter', name: 'Putter', loft: 3 });
      notes.push(owns
        ? 'Ten clubs, not fourteen. You are allowed fourteen, but a beginner carrying fourteen mostly carries four clubs they cannot yet hit. These ten cover every distance on the course with gaps you can manage. If you already own more than this, leave the extras at home rather than replacing them — that costs nothing and makes the bag easier to play.'
        : 'Ten clubs, not fourteen. You are allowed fourteen, but a beginner who buys fourteen mostly buys four clubs they cannot yet hit. This covers every distance on the course with gaps you can manage, and it costs far less.');
      notes.push('The 52° matters more than it looks. Without it there is a thirty-yard hole between your pitching wedge and your sand wedge, right in the range you will score from most.');
      notes.push(owns
        ? 'Add the rest as your swing settles — a 5-hybrid next, then the 6-iron. Check the audit above before you buy either: one of them may already be in your bag.'
        : 'Fill the rest as your swing settles — a 5-hybrid next, then the 6-iron.');
      notes.push('Plenty of beginners score better teeing off with the 5-wood than the driver. Carry the driver, but do not feel obliged to use it.');
      return {
        clubs: clubs, count: clubs.length, target: 10, starter: true, owns: owns,
        title: owns ? 'The clubs worth carrying' : 'Your first set',
        lead: owns
          ? clubs.length + ' clubs that cover the course while you are learning. You may already own some of them.'
          : clubs.length + ' clubs chosen to cover the course without spending money on clubs you cannot yet use.',
        notes: notes,
        longs: ['5-wood', '6-hybrid'],
        ladder: { longestIron: 7, longs: ['5-wood', '6-hybrid'], pwLoft: pw, wedgeLofts: [52, 56], hasDriver: true }
      };
    }

    /* Reserve the fixed slots first, then spend what is left on the long
       clubs — they are the flexible part of any bag. */
    var ironNames = [];
    for (var n = longestIron; n <= 9; n++) ironNames.push(n);
    var reserved = 1 /* driver */ + 1 /* putter */ + ironNames.length + 1 /* PW */ + wedges.lofts.length;
    var remaining = Math.max(0, 14 - reserved);

    var topIronLoft = ironLoft(longestIron, pw);
    var ladder = ladderFor(speeds.driver).filter(function (L) {
      if (!/hybrid/.test(L[0])) return true;
      return L[1] <= topIronLoft - MIN_HYBRID_LOFT_GAP;
    });
    var longs = ladder.slice(0, remaining);

    clubs.push({ slot: 'Driver', name: 'Driver', loft: driverLoft });
    longs.forEach(function (L) {
      clubs.push({ slot: /wood/.test(L[0]) ? 'Fairway' : 'Hybrid', name: L[0], loft: L[1] });
    });
    ironNames.forEach(function (n) {
      clubs.push({ slot: 'Iron', name: n + '-iron', loft: ironLoft(n, pw) });
    });
    clubs.push({ slot: 'Wedge', name: 'Pitching wedge', loft: pw });
    wedges.lofts.forEach(function (L) {
      clubs.push({ slot: 'Wedge', name: L + '° wedge', loft: L });
    });
    clubs.push({ slot: 'Putter', name: 'Putter', loft: 3 });

    if (remaining < ladder.length) {
      notes.push('There are only ' + remaining + ' slots left between the driver and the ' + longestIron +
        '-iron once the irons, wedges and putter are counted, so this takes the ' + remaining +
        ' that cover the biggest gaps. If you would rather carry another wedge, drop the shortest of them.');
    }
    if (remaining > ladder.length) {
      var spare = remaining - ladder.length;
      notes.push('That leaves ' + spare + ' spare slot' + (spare > 1 ? 's' : '') +
        ', because anything longer would sit within a couple of degrees of your ' + longestIron +
        '-iron and go the same distance. An extra wedge is the usual way to spend it — decide that on the course, not in the shop.');
    }
    notes.push('Fourteen is a limit, not a target. If two of these go the same distance, leave one at home.');

    var longNames = longs.map(function (L) { return L[0]; });
    return {
      clubs: clubs, count: clubs.length, target: 14, starter: false, owns: owns,
      title: owns ? 'The bag to aim for' : 'The bag to build',
      lead: clubs.length + ' clubs, gapped and inside the 14-club limit, built around your speed and your wedge lofts.',
      notes: notes,
      longs: longNames,
      ladder: {
        longestIron: longestIron, longs: longNames, pwLoft: pw,
        wedgeLofts: wedges.lofts, hasDriver: true
      }
    };
  }

  function setMakeup(speeds, input, wedges, bag) {
    var d = speeds.driver;
    var irons, why, woods, hybrids, defaultLongs;

    var longestIron;
    if (d < 82) {
      longestIron = 7;
      defaultLongs = ['3-wood', '5-wood', '7-wood', '5-hybrid', '6-hybrid'];
      irons = '7-iron through pitching wedge';
      hybrids = ['4-hybrid (22°)', '5-hybrid (25°)', '6-hybrid (28°)'];
      woods = ['3-wood or a high-lofted "heaven wood" (16–18°)', '5-wood (18°)', '7-wood (21°)'];
      why = 'Below roughly 82 mph with the driver there is no realistic case for a long iron. Fairway woods and hybrids have a deeper face and a much lower centre of gravity, and they launch off turf where a 4-iron simply will not.';
    } else if (d < 92) {
      longestIron = 6;
      defaultLongs = ['3-wood', '5-wood', '4-hybrid', '5-hybrid'];
      irons = '6-iron through pitching wedge';
      hybrids = ['4-hybrid (22°)', '5-hybrid (25°)'];
      woods = ['3-wood (15°)', '5-wood (18°)'];
      why = 'At your speed a 5-iron is already marginal from a normal fairway lie. Replacing it and everything above it with hybrids costs you nothing and gains you height and stopping power on long approaches.';
    } else if (d < 102) {
      longestIron = 5;
      defaultLongs = ['3-wood', '5-wood', '4-hybrid'];
      irons = '5-iron through pitching wedge';
      hybrids = ['4-hybrid (22°), or keep the 4-iron if you strike it well'];
      woods = ['3-wood (15°)', '5-wood (18°) or 3-hybrid (19°)'];
      why = 'You have enough speed to use a 5-iron properly. The honest test for the 4-iron: if you do not hit it well from a flat fairway lie at least half the time, that slot belongs to a hybrid.';
    } else {
      longestIron = 4;
      defaultLongs = ['3-wood', '5-wood'];
      irons = '4-iron through pitching wedge';
      hybrids = ['Optional 3-hybrid (19°), or a driving iron if you play in wind'];
      woods = ['3-wood (15°)', '5-wood (18°) — or drop it for an extra wedge if you rarely need 240 yards'];
      why = 'At 102+ mph long irons are genuinely playable. The choice between a 3-hybrid and a 2/3-iron is about turf and wind: hybrids launch higher and are far easier from rough, driving irons flight down and run out.';
    }

    /* Describe the player's own bag when they have told us what is in it,
       and the recommended one when they have not — using the same long clubs
       the bag card recommends, so the two can never disagree. */
    var own = bag && bag.hasClubs;
    /* When the player has no clubs, the carry table must describe the bag we
       are actually recommending — including its wedges and its longest iron,
       not just its woods. */
    var rec = (!own && bag && bag.recommendedLadder) ? bag.recommendedLadder : null;
    var ladderBag = {
      longestIron: own && isNum(bag.longestIron) ? bag.longestIron : (rec ? rec.longestIron : longestIron),
      longs: own && bag.longs && bag.longs.length ? bag.longs : (rec ? rec.longs : defaultLongs),
      pwLoft: wedges.pwLoft,
      wedgeLofts: own && bag.wedgeLofts && bag.wedgeLofts.length ? bag.wedgeLofts
        : (rec ? rec.wedgeLofts : wedges.lofts),
      hasDriver: !own || bag.hasDriver !== false
    };

    return {
      irons: irons, longestIron: longestIron, hybrids: hybrids, woods: woods, why: why,
      carries: buildLadder(speeds, ladderBag),
      ladderIsYours: !!own,
      ladderBag: ladderBag
    };
  }

  /* ---------------------------------------------------------------------
     10. PUTTER
     ------------------------------------------------------------------ */
  function putterFit(input, heightIn, wtfIn) {
    var S = sides(input);
    var len;
    if (heightIn < 62) len = 32;
    else if (heightIn < 65) len = 32.5;
    else if (heightIn < 68) len = 33;
    else if (heightIn < 71) len = 34;
    else if (heightIn < 74) len = 34.5;
    else if (heightIn < 77) len = 35;
    else len = 35.5;

    var expectedWtf = levelCentre(heightIn);
    var armDelta = wtfIn - expectedWtf;
    var lenNote = null;
    if (armDelta > 1.2) { len -= 0.5; lenNote = 'Shortened ½": your wrist-to-floor is high for your height, so your hands hang lower at address than a height-only chart assumes.'; }
    else if (armDelta < -1.2) { len += 0.5; lenNote = 'Lengthened ½": your wrist-to-floor is low for your height, so your hands sit higher at address.'; }
    len = Math.round(len * 2) / 2;

    var lie = 70;
    if (heightIn >= 74) lie = 71;
    if (heightIn < 65) lie = 69;

    var head, hang, headWhy;
    switch (input.strokeArc) {
      case 'straight':
        head = 'Face-balanced mallet (high MOI)'; hang = 'Face-balanced (0° toe hang)';
        headWhy = 'A straight-back-straight-through stroke wants a head that resists rotation. Face-balanced mallets are the match.';
        break;
      case 'strong':
        head = 'Blade / heel-shafted'; hang = 'Strong toe hang (45°+)';
        headWhy = 'A strongly arced stroke rotates the face open and closed through the ball. A toe-hung blade lets that happen naturally instead of fighting it.';
        break;
      default:
        head = 'Mid-mallet or wide blade'; hang = 'Slight-to-moderate toe hang (20–35°)';
        headWhy = 'A slight arc — which is what most golfers actually have, whatever they think — pairs with a small amount of toe hang.';
    }

    return {
      length: len, lengthNote: lenNote, lie: lie,
      head: head, hang: hang, headWhy: headWhy,
      grip: (input.shotShape === 'hook' || input.joints)
        ? 'Oversize or counterbalanced pistol — quietens the hands'
        : 'Standard pistol, or oversize if you are wristy through the ball',
      check: 'The length check that beats every chart: set up comfortably and let your arms hang. Your eyes should be over the ball or a fraction inside it, and the putter should sit flat on its sole. If the toe is in the air, the putter is too long or too upright for you — and a toe-up putter pushes putts to the ' + S.away + '.'
    };
  }

  /* ---------------------------------------------------------------------
     11. BALL
     ------------------------------------------------------------------ */
  function ballFit(speeds, input) {
    var d = speeds.driver, type, compression, why;
    var key;
    if (d < 85) {
      key = 'soft2p'; type = '2-piece / low-compression soft ball'; compression = '35–65';
      why = 'Below 85 mph you cannot fully compress a tour ball, and you lose both distance and feel trying. A soft, low-compression ball gives you more ball speed and a softer feel at your speed.';
    } else if (d < 95) {
      key = 'mid3p'; type = '3-piece mid-compression, ionomer or soft urethane cover'; compression = '65–85';
      why = 'This is the biggest and best-served speed band in golf. A mid-compression 3-piece gives you most of the greenside spin of a tour ball without the driver-spin penalty.';
    } else if (d < 105) {
      key = 'tour3p'; type = '3-piece urethane (tour performance)'; compression = '85–95';
      why = 'You have the speed to compress a urethane cover and to actually use its wedge spin. This is where the standard tour ball starts to make sense.';
    } else {
      key = 'tourfirm'; type = '3- or 4-piece tour urethane, firm'; compression = '95–105';
      why = 'At 105+ mph a soft ball spins too much off the driver and goes short. A firm, multi-layer tour ball is the fit.';
    }
    var extra = [];
    if (input.skill === 'beginner' || input.skill === 'high') extra.push('Be honest about how much greenside spin you actually use. If most of your shots into greens are running approaches, a low-spin distance ball will save you strokes and a lot of money.');
    if (input.shotShape === 'slice' || input.shotShape === 'hook') extra.push('A lower-spin ball also curves less. Until the curve is under control, that is worth more to you than wedge spin.');
    if (input.priority === 'accuracy') extra.push('Firmer, lower-spin covers curve less, which is consistent with your stated accuracy priority.');
    return { type: type, key: key, compression: compression, why: why, extra: extra };
  }

  /* ---------------------------------------------------------------------
     12. DYNAMIC LIE CONSIDERATION
     ------------------------------------------------------------------ */
  function dynamicLieNote(input, staticCode) {
    var S = sides(input);
    var shape = input.shotShape;
    if (shape === 'hook' || shape === 'pull') {
      return {
        adjust: -1, severity: 'warn',
        text: 'Your iron miss is to the ' + S.home + '. A lie angle that is too upright produces exactly that — a high pull. If a lie-board test shows a toe-up impact, your dynamic fit may come out 1° flatter than the static ' + staticCode.code + ' result.'
      };
    }
    if (shape === 'slice' || shape === 'push') {
      return {
        adjust: 1, severity: 'warn',
        text: 'Your iron miss is to the ' + S.away + '. A lie angle that is too flat produces a low push. If a lie-board test shows a heel-down impact, your dynamic fit may come out 1° more upright than the static ' + staticCode.code + ' result. One caution: a slice caused by an open clubface is not a lie-angle problem, and adding upright lie will not fix it.'
      };
    }
    return { adjust: 0, severity: 'info', text: 'Your ball flight does not suggest a lie-angle error, so the static result stands as your build spec.' };
  }

  /* ---------------------------------------------------------------------
     12b. JUNIOR FITTING
     ---------------------------------------------------------------------
     Adult charts stop at 5'0" and adult logic gives bad advice to a growing
     player. Juniors are fitted almost entirely on height, in 3" bands, with
     much lighter shafts and smaller grips — and the single most useful thing
     you can tell a parent is how often to expect to do it again.
     ------------------------------------------------------------------ */
  var JUNIOR_BANDS = [
    { max: 39, label: 'up to 3\'3"', driver: 26, seven: 20.5 },
    { max: 42, label: '3\'3"–3\'6"', driver: 29, seven: 23 },
    { max: 45, label: '3\'6"–3\'9"', driver: 32, seven: 25.5 },
    { max: 48, label: '3\'9"–4\'0"', driver: 35, seven: 28 },
    { max: 51, label: '4\'0"–4\'3"', driver: 37, seven: 30 },
    { max: 54, label: '4\'3"–4\'6"', driver: 39, seven: 31.5 },
    { max: 57, label: '4\'6"–4\'9"', driver: 41, seven: 33 },
    { max: 60, label: '4\'9"–5\'0"', driver: 42, seven: 34.5 }
  ];

  function juniorFit(input) {
    var h = input.heightIn;
    var age = isNum(input.age) ? input.age : null;
    var isJunior = h < 60 || (age !== null && age < 15 && h < 66);
    if (!isJunior) return null;

    var band = null;
    for (var i = 0; i < JUNIOR_BANDS.length; i++) {
      if (h <= JUNIOR_BANDS[i].max) { band = JUNIOR_BANDS[i]; break; }
    }
    var outgrown = !band;

    return {
      band: band,
      outgrown: outgrown,
      driverLength: band ? band.driver : 43,
      sevenLength: band ? band.seven : 35.5,
      shaft: 'Junior graphite. Weight matters far more than flex at this stage — a shaft a child cannot swing is the single biggest reason juniors slice.',
      grip: 'Junior or undersize. An adult grip in a child\'s hand forces the club into the palms and kills any chance of a release.',
      setSize: h < 48 ? '5 clubs is plenty: driver or fairway, a mid iron, a wedge, and a putter.'
        : h < 57 ? '7 clubs: driver, fairway, 7-iron, 9-iron, wedge, putter, and one hybrid.'
          : '9–11 clubs. Full adult set makeup can wait until growth slows.',
      refit: 'Re-check every 2" of growth, which for most juniors is roughly every 9–12 months. A club that was right last summer is usually wrong by the next one.',
      spend: outgrown
        ? 'At this height a junior is close to adult sizing. It is worth fitting properly now, because the next set should last several years.'
        : 'Do not custom-build for a growing junior. Buy a good boxed junior set or a used one, size up when they grow, and put the money you save into lessons — the swing is worth more than the spec at this stage.',
      note: 'Length here is by height, not age. Two 11-year-olds can be six inches apart and need different clubs.'
    };
  }

  /* ---------------------------------------------------------------------
     12c. NOTES SPECIFIC TO WOMEN'S SETS
     ------------------------------------------------------------------ */
  function womensNotes(input, speeds, shafts) {
    if (input.gender !== 'female') return [];
    var out = [];
    if (shafts.driverFlex !== 'L') {
      out.push('Most women\'s stock sets ship in L flex whatever the buyer\'s speed. Yours works out at ' +
        FLEX_NAME[shafts.driverFlex] + '. If you buy off the rack you will very likely be under-flexed, which costs you both distance and left-side dispersion — specify the flex, or buy from a brand that lets you.');
    }
    out.push('Women\'s stock sets are usually built about 1" shorter than men\'s and in graphite only. That is a reasonable starting point, but it is an average, not a fit — the length recommendation above comes from your actual height and arm length.');
    if (speeds.driver >= 85) {
      out.push('At ' + speeds.driver + ' mph you are faster than most women\'s stock equipment is designed for. Look at men\'s heads in a lighter shaft rather than a women\'s set, or a brand that builds either way.');
    }
    out.push('Watch the lofts. Women\'s sets are often built weaker through the short irons and stronger in the fairway woods, which can leave a gap of 25 yards or more between your longest iron and your shortest wood.');
    return out;
  }

  /* ---------------------------------------------------------------------
     12d. WHAT WE WERE ACTUALLY TOLD
     ---------------------------------------------------------------------
     A beginner cannot answer half of these questions, and pretending they
     can is how a tool ends up sounding confident about a guess. Anything
     answered "not sure" falls back to the neutral option and is recorded, so
     the confidence report can say which parts of the fit are soft.
     ------------------------------------------------------------------ */
  var UNSURE_FIELDS = [
    ['shotShape', 'straight', 'your ball flight'],
    ['trajectory', 'mid', 'your trajectory'],
    ['attack', 'neutral', 'your angle of attack'],
    ['tempo', 'moderate', 'your tempo'],
    ['turf', 'normal', 'the turf you play'],
    ['strokeArc', 'slight', 'your putting stroke']
  ];

  function normalise(raw) {
    var input = {}, assumed = [];
    for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) input[k] = raw[k];

    UNSURE_FIELDS.forEach(function (f) {
      var v = input[f[0]];
      if (!v || v === 'unsure') { input[f[0]] = f[1]; assumed.push(f[2]); }
    });

    /* Wrist-to-floor is the one measurement that used to block the whole
       tool. Without it, assume average proportions for the height — which is
       exactly what a height-only chart does — and say so loudly. */
    if (!isNum(input.wtfIn)) {
      input.wtfIn = levelCentre(input.heightIn);
      input.wtfAssumed = true;
      assumed.push('your wrist-to-floor');
    }
    input.assumed = assumed;
    return input;
  }

  /* ---------------------------------------------------------------------
     12e. CONFIDENCE
     ---------------------------------------------------------------------
     One number would be useless — the parts of a fit degrade separately. A
     player who measured carefully but does not know their swing speed has a
     rock-solid length and a guessed shaft. Report it that way.
     ------------------------------------------------------------------ */
  function confidence(input, speeds) {
    var areas = [];
    function add(name, level, why, fix) { areas.push({ name: name, level: level, why: why, fix: fix }); }

    add('Club length', 'high',
      'Comes from your height, which you gave us.', null);

    if (input.wtfAssumed) {
      add('Lie angle', 'low',
        'We assumed average arm length for your height, so this is the average answer rather than yours.',
        'Measure wrist-to-floor. It takes a minute and it is the only thing standing between you and a real lie recommendation.');
    } else {
      add('Lie angle', 'high', 'Based on your measured wrist-to-floor.', null);
    }

    if (speeds.confidence === 'high') {
      add('Shaft and driver loft', 'high', 'Based on a measured clubhead speed.', null);
    } else if (speeds.confidence === 'medium') {
      add('Shaft and driver loft', 'medium',
        'Derived from your carry distance, which mixes speed with how well you strike it.',
        'Fifteen minutes on a launch monitor would firm this up more than any other answer.');
    } else {
      add('Shaft and driver loft', 'low',
        'Estimated from your age, gender and standard of play, because no speed or distance was given.',
        'Even a rough 7-iron carry would move this from a guess to an estimate.');
    }

    add('Set makeup and gapping', speeds.confidence === 'low' ? 'low' : 'medium',
      speeds.confidence === 'low'
        ? 'Built on the same guessed speed as the shaft recommendation.'
        : 'Built on your speed, with typical lofts. Real yardages would make it exact.',
      'Type your real carry distances into the yardage table.');

    add('Grips', isNum(input.handLength) ? 'high' : input.gloveSize ? 'medium' : 'low',
      isNum(input.handLength) ? 'Based on your measured hand length.'
        : input.gloveSize ? 'Based on your glove size, which is a reasonable proxy.'
          : 'Nothing to go on, so this is the most common size.',
      isNum(input.handLength) ? null : 'Measure wrist crease to the tip of your middle finger.');

    var wedgeKnown = isNum(input.pwLoft);
    add('Wedges', wedgeKnown ? 'high' : 'medium',
      wedgeKnown ? 'Gapped from the pitching wedge loft you gave us.'
        : 'Gapped from a typical pitching wedge loft for this type of iron.',
      wedgeKnown ? null : 'Check your pitching wedge loft — it is in the spec table for your set.');

    var scores = { high: 2, medium: 1, low: 0 };
    var total = 0;
    areas.forEach(function (a) { total += scores[a.level]; });
    var pct = total / (areas.length * 2);
    var overall = pct >= 0.8 ? 'high' : pct >= 0.5 ? 'medium' : 'low';

    var headline;
    if (overall === 'high') {
      headline = 'Everything here rests on answers you actually gave. Build to it.';
    } else if (overall === 'low') {
      headline = 'Treat this as a starting sketch. Several parts are assumptions rather than answers, and they are marked below.';
    } else {
      headline = 'The solid parts are marked below, and so are the guesses. Fill in what you can and it sharpens.';
    }

    return {
      areas: areas, overall: overall, headline: headline,
      assumed: input.assumed || [],
      answered: areas.filter(function (a) { return a.level === 'high'; }).length,
      total: areas.length
    };
  }

  /* ---------------------------------------------------------------------
     13. TOP LEVEL
     ------------------------------------------------------------------ */
  var STD_SPECS = [
    { club: 'Driver',    men: 45.75, women: 44.00, lie: 57.5 },
    { club: '3-wood',    men: 43.00, women: 42.00, lie: 56.5 },
    { club: '5-wood',    men: 42.00, women: 41.00, lie: 57.0 },
    { club: '4-hybrid',  men: 39.50, women: 38.50, lie: 58.5 },
    { club: '4-iron',    men: 38.50, women: 37.50, lie: 60.5 },
    { club: '5-iron',    men: 38.00, women: 37.00, lie: 61.0 },
    { club: '6-iron',    men: 37.50, women: 36.50, lie: 61.5 },
    { club: '7-iron',    men: 37.00, women: 36.00, lie: 62.0 },
    { club: '8-iron',    men: 36.50, women: 35.50, lie: 62.5 },
    { club: '9-iron',    men: 36.00, women: 35.00, lie: 63.0 },
    { club: 'PW',        men: 35.50, women: 34.50, lie: 63.5 },
    { club: 'Sand wedge',men: 35.25, women: 34.25, lie: 63.5 }
  ];

  function fit(rawInput) {
    var input = normalise(rawInput);
    var heightIn = input.heightIn, wtfIn = input.wtfIn;
    var lie = staticLie(heightIn, wtfIn);
    var len = staticLength(heightIn);
    var wtfCheck = wtfLengthCheck(wtfIn);
    var speeds = estimateSpeeds(input);
    var shafts = shaftFit(speeds, input);
    var driver = driverFit(speeds, input, len.adj);
    var head = ironHeadFit(input, speeds);
    var grip = gripFit(input);
    var wedges = wedgeFit(input, head);
    var recommended = buildBag(speeds, input, wedges, recommendedLongestIron(speeds.driver), driver.loftLo);
    var bagInput = input.bag || {};
    bagInput.recommendedLadder = recommended.ladder;
    var set = setMakeup(speeds, input, wedges, bagInput);
    var putter = putterFit(input, heightIn, wtfIn);
    var ball = ballFit(speeds, input);
    var dyn = dynamicLieNote(input, lie.code);
    var conf = null;   // filled in below, once speeds exist
    var junior = juniorFit(input);
    var womens = womensNotes(input, speeds, shafts);
    var shaftPicks = shaftSuggestions(shafts, input);

    /* How much a measuring error would move the answer.

       Note the metric: a fixed half-inch probe is useless here, because bands
       are exactly 1" wide, so a half-inch error moves ANYONE who is not dead
       centre. What matters is the distance to the nearer band edge — that is
       the size of measuring error this player can actually absorb. */
    var margin = Math.round((0.5 - Math.abs(lie.bandOffset)) * 100) / 100;
    var sensitivity = {
      margin: margin,
      fragile: margin < 0.25,
      nearer: codeByIndex(lie.code.i + (lie.bandOffset >= 0 ? 1 : -1)),
      probes: [-0.5, 0.5].map(function (d) {
        var alt = staticLie(heightIn, wtfIn + d);
        return { delta: d, code: alt.code, changes: alt.code.i !== lie.code.i };
      })
    };
    var expectedWtf = levelCentre(heightIn);
    var wtfOutlier = Math.abs(wtfIn - expectedWtf) > 2.5;

    var lengthAgreement;
    if (input.wtfAssumed) {
      lengthAgreement = {
        status: 'assumed',
        text: 'Normally we cross-check your height against your wrist-to-floor, and a disagreement between the two is the signal that your arms are long or short for your height. Without the measurement there is nothing to cross-check, so this length is the one that suits an average build of your height.'
      };
    } else if (Math.abs(len.adj - wtfCheck.adj) < 0.26) {
      lengthAgreement = { status: 'agree', text: 'Your height-based and wrist-to-floor-based length recommendations agree. That is a strong signal — build to it with confidence.' };
    } else {
      var mid = Math.round(((len.adj + wtfCheck.adj) / 2) * 4) / 4;
      lengthAgreement = {
        status: 'conflict', midpoint: mid,
        text: 'Your height says ' + U.fmtAdj(len.adj) + ' and your wrist-to-floor says ' + U.fmtAdj(wtfCheck.adj) + '. That means your arms are ' +
          (wtfCheck.adj < len.adj ? 'long' : 'short') + ' relative to your height. The Bay Scale resolves this the way fitters do — length comes from height, and the arm-length difference is expressed as lie instead, which is what the headline recommendation does — but a midpoint build of ' + U.fmtAdj(mid) + ' is legitimate and worth hitting side by side.'
      };
    }

    var isW = input.gender === 'female';
    var specSheet = STD_SPECS.map(function (r) {
      var base = isW ? r.women : r.men;
      var isIron = /iron|PW|wedge/.test(r.club);
      var adj;
      if (r.club === 'Driver') adj = driver.length - base;
      else if (isIron) adj = len.adj;
      else adj = len.adj * 0.5;
      return {
        club: r.club,
        stdLength: base,
        length: Math.round((base + adj) * 100) / 100,
        adj: Math.round(adj * 100) / 100,
        stdLie: r.lie,
        lie: isIron ? Math.round((r.lie + lie.code.deg) * 10) / 10 : r.lie,
        lieAdj: isIron ? lie.code.deg : 0
      };
    });

    var flags = [];
    if (lie.clampedOffScale) flags.push({ level: 'warn', text: 'Your height and wrist-to-floor combination lands beyond the ends of the Bay Scale, so the result has been clamped. Re-measure before spending money — wrist-to-floor is the most commonly mis-taken measurement in golf. If it is correct you are a genuine custom build: most cast iron heads only bend reliably 2–3° either way, so you need a head that supports more, and you need to see a fitter in person.' });
    if (lie.borderline && lie.neighbour) flags.push({ level: 'info', text: 'You sit close to the edge of your band on the Bay Scale. ' + lie.neighbour.code + ' (' + lie.neighbour.label + ') is a legitimate alternative, and a small measuring error would put you there. Have both checked on a lie board.' });
    if (speeds.confidence === 'low') flags.push({ level: 'warn', text: 'You did not supply a swing speed or a carry distance, so everything speed-driven — flex, shaft weight, driver loft, set makeup, ball — is an educated guess from your age, gender and skill level. Fifteen minutes on a launch monitor would move these numbers more than any other input you could give this tool.' });
    if (speeds.confidence === 'medium') flags.push({ level: 'info', text: 'Speed was derived from carry distance, which blends clubhead speed with strike quality. If you strike it poorly for your level, this tool will under-read your speed and under-flex your shaft.' });
    if (isNum(input.age) && input.age >= 60 && shafts.material === 'Steel') flags.push({ level: 'info', text: 'You are 60 or over and the speed numbers still point to steel. That is fine — but test a premium graphite iron shaft anyway. A lot of players in that bracket gain speed and lose nothing in dispersion.' });
    if (input.wtfAssumed) flags.push({ level: 'warn', text: 'You did not give us a wrist-to-floor measurement, so we assumed the average arm length for someone ' +
      U.fmtHeight(heightIn) + ' tall — about ' + U.fmtIn(wtfIn, 1) + '. Everything else on this page stands, but the lie angle is the average answer rather than yours, and it is the one spec that most often differs. It takes a minute with a tape measure and someone to read it.' });
    if (!input.wtfAssumed && wtfOutlier) flags.push({ level: 'warn', text: 'Your wrist-to-floor of ' + U.fmtIn(wtfIn, 1) +
      ' is a long way from the ' + U.fmtIn(expectedWtf, 1) + ' that is typical at ' + U.fmtHeight(heightIn) +
      '. Unusual proportions are real and this may well be right — but the most common cause is measuring from the wrong point. Check it from the crease of the wrist, in your golf shoes, with someone else reading the tape, before you act on this.' });
    /* borderline is a stricter version of fragile, so only one of the two
       messages is ever worth showing. */
    if (!input.wtfAssumed && sensitivity.fragile && !lie.borderline) flags.push({ level: 'info', text: 'You are only ' + U.fmtIn(sensitivity.margin, 2) +
      ' from the edge of your band, so a measuring error that small would make you ' + sensitivity.nearer.code +
      ' instead. Re-measure once before anyone bends anything.' });
    flags.push({ level: 'info', text: 'This is a STATIC fit. It gets you to a very good starting point — which is exactly what a fitter uses it for — but only hitting balls off a lie board with a launch monitor produces a DYNAMIC fit, and the two can differ by a full step on the scale.' });

    return {
      input: input, lie: lie, length: len, wtfCheck: wtfCheck,
      lengthAgreement: lengthAgreement, speeds: speeds, shafts: shafts,
      driver: driver, ironHead: head, grip: grip, wedges: wedges,
      set: set, putter: putter, ball: ball, dynamicLie: dyn,
      junior: junior, womensNotes: womens, shaftPicks: shaftPicks,
      recommendedBag: recommended,
      confidence: confidence(input, speeds),
      wtfAssumed: !!input.wtfAssumed, assumed: input.assumed,
      sensitivity: sensitivity, expectedWtf: Math.round(expectedWtf * 10) / 10,
      wtfOutlier: wtfOutlier,
      specSheet: specSheet, flags: flags
    };
  }

  /* ---------------------------------------------------------------------
     13b. GAPPING REVIEW
     ---------------------------------------------------------------------
     Works on whatever carry numbers it is handed — the modelled ladder, or
     the player's own measured yardages once they have typed them in. Real
     numbers are where this earns its keep: two clubs that go the same
     distance is the most common and least noticed fault in a golf bag.
     ------------------------------------------------------------------ */
  /* A fixed "under 8 yards is too close" rule punishes slow players for
     nothing: if your 7-iron goes 105 yards then 6 yards between irons is
     exactly right, and the same 6 yards in a 172-yard player's bag is a
     wasted slot. So the too-close test is proportional to the shorter club's
     carry, with an absolute floor. A hole stays absolute, because 20-odd
     yards with no club is a problem whoever you are. */
  function gapVerdict(gap, shorterCarry) {
    if (gap == null) return null;
    if (gap <= 0) return 'inverted';
    if (gap < Math.max(4, shorterCarry * 0.045)) return 'close';
    if (gap > Math.max(20, shorterCarry * 0.13)) return 'wide';
    return 'ok';
  }

  /* Findings of the same kind are one finding. Order is preserved, and a run
     is only merged when it is genuinely the same story with the same fix. */
  function gapIssueGroups(issues) {
    var groups = [], byType = {};
    issues.forEach(function (g) {
      if (byType[g.type]) { byType[g.type].push(g); return; }
      byType[g.type] = [g];
      groups.push(byType[g.type]);
    });
    return groups;
  }

  function gapFinding(grp) {
    var g = grp[0], n = grp.length, isHole = g.type === 'hole';

    if (n === 1) {
      return {
        area: 'Gapping: ' + g.clubs[0] + ' → ' + g.clubs[1],
        severity: g.severity,
        costLo: isHole ? 100 : 0, costHi: isHole ? 220 : 0,
        costLabel: isHole ? CUR + '100–' + CUR + '220 for the missing club' : 'Free — drop or re-loft a club',
        quickWin: !isHole,
        current: g.gap + ' yards apart', recommended: '10–20 yards apart',
        detail: g.text,
        fix: isHole
          ? 'Add a club to cover the window, or re-loft what you have to spread the ladder.'
          : 'Take one of the two out of the bag. That slot is worth more as a wedge or a hybrid you do not currently carry.'
      };
    }

    var worst = grp.reduce(function (a, b) {
      return SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a;
    });
    var pairs = grp.map(function (x) {
      return x.clubs[0] + ' → ' + x.clubs[1] + ' (' + x.gap + ' yd)';
    });
    var label = isHole ? n + ' holes in your ladder'
      : g.type === 'inverted' ? n + ' clubs out of order'
      : n + ' pairs too close together';

    return {
      area: 'Gapping: ' + label,
      severity: worst.severity,
      /* Adjacent holes often share a solution — one club dropped into the
         middle can close two windows — so the low end of the range stays
         one club rather than n of them. */
      costLo: isHole ? 100 : 0, costHi: isHole ? 220 * n : 0,
      costLabel: isHole
        ? CUR + '100–' + CUR + (220 * n) + ', depending on how many clubs it takes'
        : 'Free — drop or re-loft a club',
      quickWin: !isHole,
      current: pairs.join(', '), recommended: '10–20 yards apart',
      detail: grp.map(function (x) { return x.text; }).join(' '),
      fix: isHole
        ? 'Work from the widest window first. One club in the right place often closes two of these at once, so re-check the ladder after each change rather than buying ' + n + ' clubs.'
        : 'Take one club out of each pair. Those slots are worth more as wedges or hybrids you do not currently carry.'
    };
  }

  function reviewGapping(rows) {
    var issues = [], measured = 0;
    rows.forEach(function (r) { if (r.measured) measured++; });

    for (var i = 1; i < rows.length; i++) {
      var a = rows[i - 1], b = rows[i];
      var gap = a.carry - b.carry;
      var verdict = gapVerdict(gap, b.carry);
      if (gap <= 0) {
        issues.push({
          type: 'inverted', severity: 'high', clubs: [a.club, b.club], gap: gap,
          text: 'Your ' + b.club + ' carries as far as or further than your ' + a.club +
            '. One of those two is doing nothing for you, and it is almost always the longer club — either the loft is wrong or you cannot launch it.'
        });
      } else if (verdict === 'close') {
        issues.push({
          type: 'overlap', severity: 'medium', clubs: [a.club, b.club], gap: gap,
          text: 'Only ' + gap + ' yards between your ' + a.club + ' and your ' + b.club +
            '. That is inside your own shot-to-shot scatter, so you are carrying two clubs to cover one distance and wasting a slot out of your fourteen.'
        });
      } else if (verdict === 'wide') {
        issues.push({
          type: 'hole', severity: gap > 28 ? 'high' : 'medium', clubs: [a.club, b.club], gap: gap,
          text: 'A ' + gap + '-yard hole between your ' + a.club + ' and your ' + b.club +
            '. Every approach that lands in that window has to be a manufactured half swing, which is where big numbers come from.'
        });
      }
    }

    var summary;
    if (!issues.length) {
      summary = measured
        ? 'No gapping problems in the numbers you entered. Your ladder is even.'
        : 'No gapping problems in the modelled ladder.';
    } else {
      var holes = issues.filter(function (x) { return x.type === 'hole'; }).length;
      var overlaps = issues.filter(function (x) { return x.type !== 'hole'; }).length;
      summary = [
        holes ? holes + ' gap' + (holes > 1 ? 's' : '') + ' too wide' : null,
        overlaps ? overlaps + ' pair' + (overlaps > 1 ? 's' : '') + ' too close together' : null
      ].filter(Boolean).join(' and ') + '.';
      summary = summary.charAt(0).toUpperCase() + summary.slice(1);
    }
    return { issues: issues, summary: summary, measuredCount: measured };
  }

  /* ---------------------------------------------------------------------
     14. AUDIT — diff the clubs you already own against the fit
     ---------------------------------------------------------------------
     Most people are not buying a full set. They want to know which of their
     current clubs is actually wrong, what it is costing them, and what it
     costs to put right — so the ordering here is impact first and money
     second, and the cheap-but-significant fixes are called out separately.

     Costs are indicative shop rates for a set of irons unless stated.
     ------------------------------------------------------------------ */
  var CUR = '£';
  /* Cheapest credible NEW set built to your specs, used as the ceiling on how
     much repair work is worth doing.

     Important: this is the CUSTOMISED price, not the sticker price. Custom
     length and lie come as part of the build, but premium shafts and non-stock
     grips carry an upcharge, so a real configured set lands above the headline
     figure. Benchmark below is an observed Takomo Iron 101 MKII customised
     build (7 clubs, KBS Tour steel, -1/2" length, -2 deg lie, standard grip)
     at UK pricing. Base models start nearer 549; other models run to ~700.

     Update SET_BENCHMARK when pricing moves — everything else follows from it. */
  var SET_BENCHMARK = 580;
  var SET_BENCHMARK_NOTE = 'a custom-built 7-club set from a direct-to-consumer brand such as Takomo';
  var FLEX_IDX = { L: 0, A: 1, R: 2, S: 3, X: 4, XX: 5 };
  var GRIP_IDX = { Undersize: 0, Standard: 1, Midsize: 2, Jumbo: 3 };
  var BALL_NAME = {
    soft2p: '2-piece low-compression',
    mid3p: '3-piece mid-compression',
    tour3p: '3-piece tour urethane',
    tourfirm: 'firm tour urethane'
  };
  var SEV_RANK = { high: 3, medium: 2, low: 1, unknown: 0.5, ok: 0 };

  function money(lo, hi) {
    if (lo === 0 && hi === 0) return 'No extra cost';
    if (lo === hi) return CUR + lo;
    return CUR + lo + '–' + CUR + hi;
  }
  function fmtDeg(d) {
    if (Math.abs(d) < 0.05) return 'Standard';
    return Math.abs(Math.round(d * 10) / 10) + '° ' + (d > 0 ? 'upright' : 'flat');
  }
  function isNumOrZero(v) { return typeof v === 'number' && isFinite(v); }

  /* Given a budget, pick the combination of fixes that buys the most
     improvement per pound. Free fixes always go in first — there is no reason
     not to turn an adjustable hosel. */
  function planForBudget(actions, budget, replaceAdvice, benchmark, superseded) {
    if (typeof budget !== 'number' || !isFinite(budget) || budget < 0) return null;

    var canAffordSet = !replaceAdvice || replaceAdvice.level !== 'replace' || budget >= benchmark;
    /* If a new set is the right answer but is out of reach, the cheap bench
       work we set aside becomes worth doing again in the meantime. */
    var pool = (canAffordSet ? actions : actions.filter(function (x) { return !x.isReplaceAdvice; })
      .concat(superseded.filter(function (x) { return x.costHi <= 120; }))).slice();

    var scored = pool.map(function (x) {
      var score = SEV_RANK[x.severity] + (x.quickWin ? 0.5 : 0);
      return { f: x, cost: x.costLo, value: x.cost === 0 ? 999 : score / Math.max(x.costLo, 1) };
    });
    scored.sort(function (a, b) {
      if ((a.cost === 0) !== (b.cost === 0)) return a.cost === 0 ? -1 : 1;
      return b.value - a.value;
    });

    var remaining = budget, now = [], later = [], spentLo = 0, spentHi = 0;

    /* Value-per-pound would bury a £580 replacement under a £100 wedge. If the
       budget covers a new set and a new set is the recommendation, that is the
       plan for the irons — take it first, then spend what is left. */
    var forced = scored.filter(function (o) { return o.f.isReplaceAdvice; });
    if (canAffordSet && forced.length) {
      forced.forEach(function (o) {
        now.push(o.f); remaining -= o.cost; spentLo += o.f.costLo; spentHi += o.f.costHi;
      });
      scored = scored.filter(function (o) { return !o.f.isReplaceAdvice; });
    }

    scored.forEach(function (o) {
      if (o.cost <= remaining) {
        now.push(o.f); remaining -= o.cost; spentLo += o.f.costLo; spentHi += o.f.costHi;
      } else later.push(o.f);
    });

    var headline;
    if (!canAffordSet) {
      headline = money(budget, budget) + ' will not stretch to the ' + CUR + benchmark +
        ' a new set costs, and it is not worth putting into a reshaft you are going to throw away. ' +
        (now.length
          ? 'Do the cheap bench work below to make the current set playable, and save the rest.'
          : 'Save it toward the new set instead.');
    } else if (!now.length) {
      headline = 'Nothing on your list comes in under ' + CUR + budget + '. The cheapest single fix is ' +
        (later.length ? later[later.length - 1].area.toLowerCase() + ' at ' + later[later.length - 1].costLabel : 'out of reach') + '.';
    } else if (!later.length) {
      headline = CUR + budget + ' covers everything on your list — about ' + money(spentLo, spentHi) + ' of work.';
    } else {
      headline = 'For ' + CUR + budget + ' do these ' + now.length + ' first (' + money(spentLo, spentHi) +
        '). The remaining ' + later.length + ' can wait — none of them change as much per pound.';
    }

    return {
      budget: budget, now: now, later: later,
      spend: [spentLo, spentHi], leftover: Math.max(0, remaining),
      canAffordSet: canAffordSet, headline: headline
    };
  }

  function audit(result, cur, budget) {
    cur = cur || {};
    var f = [];

    function add(o) {
      if (!o.costLabel) o.costLabel = money(o.costLo, o.costHi);
      if (o.quickWin === undefined) o.quickWin = SEV_RANK[o.severity] >= 2 && o.costHi <= 120;
      f.push(o);
    }

    /* ---- iron lie ---------------------------------------------------- */
    var recLie = result.lie.code.deg;
    if (result.wtfAssumed) {
      add({
        area: 'Iron lie angle', severity: 'unknown', costLo: 0, costHi: 0,
        current: isNumOrZero(cur.ironLie) ? fmtDeg(cur.ironLie) : 'Unknown',
        recommended: 'Cannot say yet',
        detail: 'We do not know what lie angle suits you, because no wrist-to-floor measurement was given and we assumed an average build. Bending a set on that assumption could easily move you further from your fit than you are now.',
        fix: 'Measure wrist-to-floor and run this again before anyone touches your lie angle. It is the cheapest fix in golf, but only if it is aimed at the right number.'
      });
    } else if (!isNumOrZero(cur.ironLie)) {
      add({
        area: 'Iron lie angle', severity: 'unknown', costLo: 0, costHi: 0,
        current: 'Unknown', recommended: result.lie.code.code + ' (' + result.lie.code.label + ')',
        detail: 'Worth finding out, because it is both the most commonly wrong spec and the cheapest to fix. Any shop with a loft-lie machine will measure your set in about ten minutes, and most will do it free if you are buying anything. Off-the-rack clubs are stamped standard but frequently leave the factory a degree out.',
        fix: 'Ask a shop to check the loft and lie on your 7-iron.'
      });
    } else {
      var lieGap = recLie - cur.ironLie;
      var lieAbs = Math.abs(lieGap);
      if (lieAbs < 0.5) {
        add({
          area: 'Iron lie angle', severity: 'ok', costLo: 0, costHi: 0,
          current: fmtDeg(cur.ironLie), recommended: fmtDeg(recLie),
          detail: 'Your lie angle already matches the fit. Leave it alone.'
        });
      } else {
        add({
          area: 'Iron lie angle', job: 'bend', severity: lieAbs > 1.5 ? 'high' : 'medium',
          costLo: 40, costHi: 70,
          current: fmtDeg(cur.ironLie), recommended: fmtDeg(recLie),
          detail: 'You are ' + round1(lieAbs) + '° too ' + (lieGap > 0 ? 'flat' : 'upright') +
            '. On a 7-iron that turns the face ' + Math.abs(faceChangeFromLie(31, lieAbs)).toFixed(2) +
            '° at impact, which is worth roughly ' + Math.abs(lieImpact(31, lieAbs, 145).totalYards) +
            ' yards offline once the start line and the curve it puts on the ball are both counted. ' +
            'The yards are similar across the bag, but the face-angle error itself is about four times larger ' +
            'in a wedge than in a long iron, on a shot you are trying to hit far more precisely.',
          fix: 'Bend the set ' + round1(lieAbs) + '° ' + (lieGap > 0 ? 'upright' : 'flat') + '.',
          caveat: 'Forged heads bend freely. Cast heads usually take 2° either way and no more, and some hollow-body or multi-material heads cannot be bent at all — ask before you pay.'
        });
      }
    }

    /* ---- iron length ------------------------------------------------- */
    var recLen = result.length.adj;
    if (!isNumOrZero(cur.ironLength)) {
      add({
        area: 'Iron length', severity: 'unknown', costLo: 0, costHi: 0,
        current: 'Unknown', recommended: U.fmtAdj(recLen),
        detail: 'Measure your 7-iron: sole it in playing position and measure along the back of the shaft from the ground to the butt end. Standard is 37" for men and 36" for women.',
        fix: 'Measure your 7-iron and come back.'
      });
    } else {
      var lenGap = cur.ironLength - recLen;
      var lenAbs = Math.abs(lenGap);
      if (lenAbs < 0.26) {
        add({
          area: 'Iron length', severity: 'ok', costLo: 0, costHi: 0,
          current: U.fmtAdj(cur.ironLength), recommended: U.fmtAdj(recLen),
          detail: 'Your length is already right for your height.'
        });
      } else {
        var tooLong = lenGap > 0;
        add({
          area: 'Iron length', job: 'length', severity: lenAbs > 0.75 ? 'high' : 'medium',
          costLo: tooLong ? 40 : 60, costHi: tooLong ? 80 : 140,
          current: U.fmtAdj(cur.ironLength), recommended: U.fmtAdj(recLen),
          detail: 'Your irons are ' + U.fmtIn(lenAbs, 2) + ' too ' + (tooLong ? 'long' : 'short') +
            '. Length does two things at once: it moves where your hands sit at address, and it changes the ' +
            'effective lie by a degree for every half inch — so at ' + U.fmtIn(lenAbs, 2) + ' out, yours already play about ' +
            round1(lieFromLengthChange(lenAbs)) + '° ' + (tooLong ? 'more upright' : 'flatter') +
            ' than the number stamped on them.',
          fix: tooLong
            ? 'Shorten by ' + U.fmtIn(lenAbs, 2) + ' and re-grip. Trimming also stiffens the shaft slightly, which at your speed is usually welcome.'
            : 'Lengthen by ' + U.fmtIn(lenAbs, 2) + ' with shaft extensions, or reshaft to the correct length. Extensions soften the shaft a little.',
          caveat: 'Do length and lie in the same visit. Changing one changes the other by a degree per half inch, so a shop that adjusts length without re-checking lie has moved you further from your fit, not closer.'
        });
      }
    }

    /* ---- iron shaft flex --------------------------------------------- */
    var recFlex = result.shafts.ironFlex;
    if (!cur.ironFlex) {
      add({
        area: 'Iron shaft flex', severity: 'unknown', costLo: 0, costHi: 0,
        current: 'Unknown', recommended: recFlex,
        detail: 'Usually printed on the shaft just above the hosel, or on the shaft band near the grip.',
        fix: 'Look at the shaft.'
      });
    } else {
      var recIdx = FLEX_IDX[recFlex] === undefined ? 2 : FLEX_IDX[recFlex];
      var flexGap = recIdx - FLEX_IDX[cur.ironFlex];
      var flexAbs = Math.abs(flexGap);
      if (flexAbs === 0) {
        add({
          area: 'Iron shaft flex', severity: 'ok', costLo: 0, costHi: 0,
          current: cur.ironFlex, recommended: recFlex,
          detail: 'Your flex matches. Bear in mind flex is not standardised between brands, so this is a match on the letter rather than on the actual stiffness profile.'
        });
      } else {
        add({
          area: 'Iron shaft flex', job: 'reshaft', severity: flexAbs >= 2 ? 'high' : 'medium',
          costLo: 250, costHi: 450,
          current: cur.ironFlex, recommended: recFlex,
          detail: flexGap > 0
            ? 'Your shafts are ' + flexAbs + ' flex' + (flexAbs > 1 ? 'es' : '') + ' too soft for your speed. Too soft shows up as a high, left, inconsistent flight and a shaft that feels like it arrives late.'
            : 'Your shafts are ' + flexAbs + ' flex' + (flexAbs > 1 ? 'es' : '') + ' too stiff for your speed. Too stiff shows up as a low flight that will not hold a green, shots leaking right, and a harsh feel at impact.',
          fix: 'Reshaft to ' + recFlex + '. This is the expensive one, so do it last — and only once lie, length and grips are right.',
          caveat: 'Shaft weight matters at least as much as the letter does. Fix weight and flex together or you have only solved half of it.'
        });
      }
    }

    /* ---- iron shaft material ----------------------------------------- */
    if (cur.ironMaterial && cur.ironMaterial !== result.shafts.material) {
      var wantsGraphite = result.shafts.material === 'Graphite';
      add({
        area: 'Iron shaft material', job: 'reshaft', severity: wantsGraphite ? 'medium' : 'low',
        costLo: 250, costHi: 500,
        current: cur.ironMaterial, recommended: result.shafts.material,
        detail: wantsGraphite
          ? 'The fit points to graphite and you are playing steel. At your speed, age or joint profile, a lighter graphite shaft usually buys back clubhead speed and takes a lot of the impact shock out of your hands and elbows.'
          : 'The fit points to steel and you are playing graphite. Steel would give you more feedback and typically a tighter dispersion at your speed.',
        fix: 'Test both back to back before committing — this is a feel decision as much as a numbers one.'
      });
    }

    /* ---- grips -------------------------------------------------------- */
    var recGrip = result.grip.key;
    if (!cur.gripSize) {
      add({
        area: 'Grip size', severity: 'unknown', costLo: 0, costHi: 0,
        current: 'Unknown', recommended: recGrip,
        detail: 'The size is usually printed on the grip itself, or a shop will tell you in seconds.',
        fix: 'Check the grip, or ask.'
      });
    } else if (GRIP_IDX[cur.gripSize] === GRIP_IDX[recGrip]) {
      add({
        area: 'Grip size', severity: 'ok', costLo: 0, costHi: 0,
        current: cur.gripSize, recommended: recGrip,
        detail: 'Right size. Replace them when they go shiny or hard — worn grips make you hold on tighter, and grip pressure wrecks more swings than grip size does.'
      });
    } else {
      var gripGap = GRIP_IDX[recGrip] - GRIP_IDX[cur.gripSize];
      add({
        area: 'Grip size', job: 'grips', severity: Math.abs(gripGap) >= 2 ? 'high' : 'medium',
        costLo: 60, costHi: 110,
        current: cur.gripSize, recommended: recGrip,
        detail: 'Your grips are ' + (gripGap > 0 ? 'too small' : 'too big') + ' by ' + Math.abs(gripGap) +
          ' size' + (Math.abs(gripGap) > 1 ? 's' : '') + '. Grip diameter is a ball-flight tool: too small lets the hands over-rotate and shut the face, too big stops them releasing and leaves it open.',
        fix: 'Re-grip the set in ' + recGrip + '.'
      });
    }

    /* ---- driver loft --------------------------------------------------- */
    var lo = result.driver.loftLo, hi = result.driver.loftHi;
    if (!isNum(cur.driverLoft)) {
      add({
        area: 'Driver loft', severity: 'unknown', costLo: 0, costHi: 0,
        current: 'Unknown', recommended: lo + '°–' + hi + '°',
        detail: 'Stamped on the sole or on the hosel.',
        fix: 'Look at the sole of your driver.'
      });
    } else if (cur.driverLoft >= lo - 0.25 && cur.driverLoft <= hi + 0.25) {
      add({
        area: 'Driver loft', severity: 'ok', costLo: 0, costHi: 0,
        current: cur.driverLoft + '°', recommended: lo + '°–' + hi + '°',
        detail: 'Inside your window. Loft is only half the story though — attack angle moves the right answer by two or three degrees, so confirm it on a launch monitor if you get the chance.'
      });
    } else {
      var loftGap = cur.driverLoft < lo ? lo - cur.driverLoft : cur.driverLoft - hi;
      var fixable = cur.driverAdjustable === true && loftGap <= 2;
      add({
        area: 'Driver loft', severity: loftGap > 1.5 ? 'high' : 'medium',
        costLo: 0, costHi: fixable ? 0 : 400,
        costLabel: fixable ? 'Free — you already own the fix'
          : cur.driverAdjustable === false
            ? CUR + '250–' + CUR + '400 for a head that suits you'
            : 'Free if your hosel adjusts, ' + CUR + '250–' + CUR + '400 if not',
        quickWin: fixable,
        current: cur.driverLoft + '°', recommended: lo + '°–' + hi + '°',
        detail: 'You are playing ' + round1(loftGap) + '° too ' + (cur.driverLoft < lo ? 'little' : 'much') +
          ' loft. Too little and you launch low with low spin, and the ball falls out of the sky short. Too much and it climbs, spins, and gets eaten by any wind.',
        fix: fixable
          ? 'Turn the hosel. Your driver is adjustable and the gap is inside its range, so this costs nothing but a wrench and ten minutes.'
          : (cur.driverAdjustable === false
            ? 'A fixed hosel cannot be changed, so this is one to note for your next driver purchase rather than a reason to buy one now.'
            : 'Check whether your driver has an adjustable hosel first — most made in the last decade do, and if so this is free.')
      });
    }

    /* ---- driver length -------------------------------------------------- */
    if (isNum(cur.driverLength)) {
      var dGap = cur.driverLength - result.driver.length;
      if (dGap > 0.6) {
        add({
          area: 'Driver length', severity: 'medium', costLo: 30, costHi: 60,
          current: U.fmtIn(cur.driverLength, 2), recommended: U.fmtIn(result.driver.length, 2),
          detail: 'Your driver is ' + U.fmtIn(dGap, 2) + ' longer than the fit suggests. The face is only about four inches wide, and finding the middle of it gets measurably harder with every half inch of shaft. The couple of yards of theoretical speed you give up by shortening is usually paid back several times over in centre contact.',
          fix: 'Trim the shaft and re-grip. Add a little head weight or lead tape afterwards to keep the swing weight where it was.'
        });
      } else {
        add({
          area: 'Driver length', severity: 'ok', costLo: 0, costHi: 0,
          current: U.fmtIn(cur.driverLength, 2), recommended: U.fmtIn(result.driver.length, 2),
          detail: 'Sensible length. Nothing to do.'
        });
      }
    }

    /* ---- set makeup ------------------------------------------------------ */
    if (isNum(cur.longestIron)) {
      var recLongest = result.set.longestIron;
      if (cur.longestIron < recLongest) {
        var n = recLongest - cur.longestIron;
        add({
          area: 'Long irons', severity: n >= 2 ? 'high' : 'medium',
          costLo: 120 * n, costHi: 220 * n,
          current: cur.longestIron + '-iron', recommended: recLongest + '-iron',
          detail: 'You carry a ' + cur.longestIron + '-iron, but at your speed the longest iron worth carrying is a ' +
            recLongest + '-iron. A long iron you cannot launch is a wasted slot out of your fourteen — it goes the same distance as the club below it, from a worse lie, with less height to hold a green.',
          fix: 'Replace the ' + cur.longestIron + '-iron' + (n > 1 ? ' through ' + (recLongest - 1) + '-iron' : '') +
            ' with hybrid' + (n > 1 ? 's' : '') + ' of matching loft.',
          caveat: 'The honest test: from a flat fairway lie, do you hit it well at least half the time? If yes, keep it.'
        });
      } else {
        add({
          area: 'Long irons', severity: 'ok', costLo: 0, costHi: 0,
          current: cur.longestIron + '-iron', recommended: recLongest + '-iron',
          detail: 'Your long-iron cut-off suits your speed.'
        });
      }
    }

    /* ---- wedge gapping ---------------------------------------------------- */
    if (cur.wedgeLofts && cur.wedgeLofts.length) {
      var lofts = [result.wedges.pwLoft].concat(cur.wedgeLofts).sort(function (a, b) { return a - b; });
      var worst = 0, worstPair = null;
      for (var i = 1; i < lofts.length; i++) {
        var g = lofts[i] - lofts[i - 1];
        if (g > worst) { worst = g; worstPair = [lofts[i - 1], lofts[i]]; }
      }
      if (worst > 7) {
        add({
          area: 'Wedge gapping', severity: worst > 9 ? 'high' : 'medium',
          costLo: 100, costHi: 170,
          current: lofts.join('° / ') + '°', recommended: 'no gap wider than 6°',
          detail: 'There is a ' + worst + '° gap between your ' + worstPair[0] + '° and ' + worstPair[1] +
            '°, which is roughly ' + Math.round(worst * 2.5) + ' yards with no club to cover it. That is the distance you end up manufacturing a half swing for, and half swings with a wedge are where big numbers come from.',
          fix: 'Add a wedge at about ' + Math.round((worstPair[0] + worstPair[1]) / 2) + '°.'
        });
      } else {
        add({
          area: 'Wedge gapping', severity: 'ok', costLo: 0, costHi: 0,
          current: lofts.join('° / ') + '°', recommended: 'no gap wider than 6°',
          detail: 'Your wedges are evenly spaced. The widest gap is ' + worst + '°.'
        });
      }
    }

    /* ---- measured yardages ------------------------------------------------- */
    var gapping = null;
    if (cur.carries && cur.carries.length > 1) {
      gapping = reviewGapping(cur.carries);
      /* Three separate "27-yard hole" findings say one thing three times and
         push everything else down the list. Same problem, same fix, same
         price: report it once and name every pair inside it. */
      gapIssueGroups(gapping.issues).forEach(function (grp) { add(gapFinding(grp)); });
    }

    /* ---- ball -------------------------------------------------------------- */
    if (cur.ball) {
      if (cur.ball === result.ball.key) {
        add({
          area: 'Golf ball', severity: 'ok', costLo: 0, costHi: 0,
          current: BALL_NAME[cur.ball], recommended: BALL_NAME[result.ball.key],
          detail: 'Right category for your speed.'
        });
      } else {
        add({
          area: 'Golf ball', severity: 'medium', costLo: 0, costHi: 0,
          costLabel: 'No extra cost — you buy balls anyway', quickWin: true,
          current: BALL_NAME[cur.ball], recommended: BALL_NAME[result.ball.key],
          detail: result.ball.why,
          fix: 'Buy a box of the recommended category next time instead of your usual, and play it for three rounds before judging it.'
        });
      }
    }

    /* ---- length and lie interact, so the ORDER of the work matters ---------
       A club that is an inch long already plays two degrees upright whatever
       is stamped on it. Bending to the stamped target without fixing the
       length first would leave the player further out than they started. */
    var lieFinding = null, lenFinding = null;
    f.forEach(function (x) {
      if (x.severity === 'ok' || x.severity === 'unknown') return;
      if (x.job === 'bend') lieFinding = x;
      if (x.job === 'length') lenFinding = x;
    });
    if (lieFinding && lenFinding) {
      var effective = round1(lieFromLengthChange(Math.abs(cur.ironLength - result.length.adj)));
      var dir = cur.ironLength > result.length.adj ? 'upright' : 'flat';
      lieFinding.caveat = 'Order matters here. Your length is out too, which already makes these play about ' +
        effective + '° ' + dir + ' whatever is stamped on them. Have the length corrected FIRST, then bend the lie ' +
        'to the target — bending to the stamped number while the length is still wrong would leave you further out ' +
        'than you are now. ' + lieFinding.caveat;
    }

    /* ---- replace vs repair -------------------------------------------------
       There is a point where fixing a set of irons costs more than replacing
       it. Only bench work on the IRONS counts toward that — a driver, a wedge
       or a box of balls are separate purchases. Overlapping jobs are counted
       once: a flex change and a material change are the same reshaft, not two.
       ---------------------------------------------------------------------- */
    var jobs = {};
    f.forEach(function (x) {
      if (!x.job || x.severity === 'ok' || x.severity === 'unknown') return;
      var j = jobs[x.job] || (jobs[x.job] = { lo: 0, hi: 0 });
      j.lo = Math.max(j.lo, x.costLo);
      j.hi = Math.max(j.hi, x.costHi);
    });
    var ironLo = 0, ironHi = 0;
    Object.keys(jobs).forEach(function (k) { ironLo += jobs[k].lo; ironHi += jobs[k].hi; });
    var ironMid = (ironLo + ironHi) / 2;

    var replaceAdvice = null;
    if (ironMid >= SET_BENCHMARK) {
      replaceAdvice = { level: 'replace', ironLo: ironLo, ironHi: ironHi, benchmark: SET_BENCHMARK };
      f.forEach(function (x) { if (x.job && x.severity !== 'ok' && x.severity !== 'unknown') x.superseded = true; });
      add({
        area: 'Replace the set rather than repair it', severity: 'high', job: null,
        costLo: SET_BENCHMARK, costHi: SET_BENCHMARK,
        costLabel: 'From ' + CUR + SET_BENCHMARK + ' for a new fitted set',
        quickWin: false, isReplaceAdvice: true,
        current: money(ironLo, ironHi) + ' of bench work',
        recommended: 'A new set built to your specs from ' + CUR + SET_BENCHMARK,
        detail: 'Putting your current irons right comes to ' + money(ironLo, ironHi) +
          ', and ' + SET_BENCHMARK_NOTE + ' comes to roughly ' + CUR + SET_BENCHMARK +
          ' once it is configured to your length, lie, shaft and grip. At that point you are paying close to the price of a new set to modify an old one — and you would still have the old grooves, the old finish, and whatever the last owner did to it.',
        fix: 'Price a new custom-built set before you book any of the work below. If you like your current heads enough to keep them, do the cheap jobs only and skip the reshaft.',
        caveat: 'Two things flip this back the other way: heads you genuinely love and cannot buy any more, and a set young enough that the grooves still bite. Bending and re-gripping a nearly new set is still good value.'
      });
    } else if (ironMid >= SET_BENCHMARK * 0.6 && ironMid > 0) {
      replaceAdvice = { level: 'warn', ironLo: ironLo, ironHi: ironHi, benchmark: SET_BENCHMARK };
    }

    /* ---- rank ------------------------------------------------------------- */
    var actions = f.filter(function (x) { return x.severity !== 'ok' && x.severity !== 'unknown'; });
    var fine = f.filter(function (x) { return x.severity === 'ok'; });
    var unknowns = f.filter(function (x) { return x.severity === 'unknown'; });

    actions.sort(function (a, b) {
      if (!!a.isReplaceAdvice !== !!b.isReplaceAdvice) return a.isReplaceAdvice ? -1 : 1;
      if (!!a.superseded !== !!b.superseded) return a.superseded ? 1 : -1;
      if (SEV_RANK[b.severity] !== SEV_RANK[a.severity]) return SEV_RANK[b.severity] - SEV_RANK[a.severity];
      if (a.quickWin !== b.quickWin) return a.quickWin ? -1 : 1;
      return a.costLo - b.costLo;
    });

    var live = actions.filter(function (x) { return !x.superseded; });
    var superseded = actions.filter(function (x) { return x.superseded; });
    var quick = live.filter(function (x) { return x.quickWin; });
    var quickLo = 0, quickHi = 0, allLo = 0, allHi = 0;
    quick.forEach(function (x) { quickLo += x.costLo; quickHi += x.costHi; });
    live.forEach(function (x) { allLo += x.costLo; allHi += x.costHi; });

    var headline;
    if (!actions.length) {
      headline = unknowns.length
        ? 'Nothing you told us about is wrong. Fill in the gaps below and we can check the rest.'
        : 'Everything checks out. Your clubs already match your fit — spend the money on lessons instead.';
    } else if (replaceAdvice && replaceAdvice.level === 'replace') {
      headline = 'Do not spend this money. Putting your irons right costs ' + money(ironLo, ironHi) +
        ', and a new set configured to your specs comes to about ' + CUR + SET_BENCHMARK + '. Replace them instead.';
    } else if (quick.length) {
      var ofYours = quick.length + ' of your ' + live.length + ' issue' + (live.length > 1 ? 's' : '');
      headline = quickHi === 0
        ? ofYours + ' cost' + (quick.length > 1 ? '' : 's') + ' nothing at all to fix. Start there.'
        : ofYours + ' can be fixed for ' + money(quickLo, quickHi) + ' without buying a single new club. Start there.';
    } else {
      headline = live.length + ' thing' + (live.length > 1 ? 's' : '') +
        ' worth changing, but none of them are cheap. Work down the list as budget allows.';
    }
    if (replaceAdvice && replaceAdvice.level === 'warn') {
      headline += ' Worth knowing: the iron work alone comes to ' + money(ironLo, ironHi) +
        ', and a new set configured to your specs comes to about ' + CUR + SET_BENCHMARK + ' — price both before you commit.';
    }

    var plan = planForBudget(live, budget, replaceAdvice, SET_BENCHMARK, superseded);

    return {
      headline: headline, plan: plan, gapping: gapping,
      actions: live, superseded: superseded, fine: fine, unknowns: unknowns, quickWins: quick,
      quickCost: [quickLo, quickHi], totalCost: [allLo, allHi],
      ironWork: [ironLo, ironHi], replaceAdvice: replaceAdvice,
      benchmark: SET_BENCHMARK, currency: CUR
    };
  }

  /* helpers */
  function isNum(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  root.GolfFit = {
    units: U,
    levelCentre: levelCentre,
    scale: BAY_SCALE,
    colourAt: colourAt,
    swatchFor: swatchFor,
    scaleRange: [SCALE_MIN, SCALE_MAX],
    staticLie: staticLie,
    staticLength: staticLength,
    lengthBands: LENGTH_BANDS,
    wtfLengthCheck: wtfLengthCheck,
    estimateSpeeds: estimateSpeeds,
    standardSpecs: STD_SPECS,
    fit: fit,
    audit: audit,
    confidence: confidence,
    sides: sides,
    reviewGapping: reviewGapping,
    gapVerdict: gapVerdict,
    faceChangeFromLie: faceChangeFromLie,
    lieImpact: lieImpact,
    lieFromLengthChange: lieFromLengthChange,
    buildLadder: buildLadder,
    buildBag: buildBag,
    FLEX_NAME: FLEX_NAME
  };
})(window);
