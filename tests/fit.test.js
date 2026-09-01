/* ---------------------------------------------------------------------------
   fit.test.js — the Bay Scale, club length, speed estimation, and a broad
   sweep over the whole fit() surface.
   --------------------------------------------------------------------------- */
'use strict';

const G = require('./engine');
const { suite, test, sweep, assert, equal, near, noPlaceholders } = require('./harness');

/* A complete, valid input. Individual tests override only what they care
   about, so a new required field breaks one place rather than forty. */
const BASE = {
  heightIn: 70, wtfIn: 34, handLength: 7.4, gloveSize: 'ML', age: 38,
  gender: 'male', handedness: 'right', joints: false, skill: 'mid',
  handicap: 14, pwLoft: 44, ironCarry: 150, shotShape: 'straight',
  trajectory: 'mid', attack: 'neutral', tempo: 'moderate', turf: 'normal',
  priority: 'forgiveness', strokeArc: 'slight'
};
const fit = (o) => G.fit(Object.assign({}, BASE, o));

module.exports = function () {

  suite('Bay Scale — published anchors', () => {
    /* These three body/lie combinations appear as worked examples across the
       published fitting literature. They are the scale's calibration, and if
       any of them moves, the reference curve has been broken. */
    test("5'10\" / 34\" plays standard", () => {
      equal(G.staticLie(70, 34).code.code, 'LEVEL');
    });
    test("5'6\" / 32\" plays 1° flat", () => {
      equal(G.staticLie(66, 32).code.code, 'F1');
    });
    test("6'2\" / 36.5\" plays 2° upright", () => {
      equal(G.staticLie(74, 36.5).code.code, 'U2');
    });
  });

  suite('Bay Scale — structure', () => {
    test('the scale is symmetric F5…LEVEL…U5', () => {
      equal(G.scale.length, 11);
      equal(G.scale[0].code, 'F5');
      equal(G.scale[5].code, 'LEVEL');
      equal(G.scale[10].code, 'U5');
    });
    test('code index equals degrees of lie', () => {
      G.scale.forEach((c) => equal(c.deg, c.i, c.code));
    });
    test('one code per inch of deviation', () => {
      const centre = G.levelCentre(70);
      equal(G.staticLie(70, centre).code.code, 'LEVEL');
      equal(G.staticLie(70, centre + 1).code.code, 'U1');
      equal(G.staticLie(70, centre - 1).code.code, 'F1');
      equal(G.staticLie(70, centre + 3).code.code, 'U3');
    });
    test('band edges round to the nearer code', () => {
      const centre = G.levelCentre(70);
      equal(G.staticLie(70, centre + 0.49).code.code, 'LEVEL');
      equal(G.staticLie(70, centre + 0.51).code.code, 'U1');
    });
    test('extremes clamp and are flagged rather than silently wrong', () => {
      const r = G.staticLie(70, G.levelCentre(70) + 9);
      equal(r.code.code, 'U5');
      assert(r.clampedOffScale, 'should be flagged as off the scale');
    });
    test('reference curve rises monotonically with height', () => {
      for (let h = 56; h < 84; h += 0.5) {
        assert(G.levelCentre(h + 0.5) >= G.levelCentre(h), 'curve dipped at ' + h);
      }
    });
    test('borderline cases name the neighbouring code', () => {
      const r = G.staticLie(70, G.levelCentre(70) + 0.45);
      assert(r.borderline, 'should be borderline');
      equal(r.neighbour.code, 'U1');
    });
  });

  suite('Lie-angle physics', () => {
    /* face change = arctan( sin(lie error) x tan(loft) ), derived from the
       rotation of the face normal about the target line and checked against a
       numeric rotation matrix. An earlier version of this used
       tan(error) x sin(loft), which halves the wedge effect. */
    test('a putter face is completely immune to lie error', () => {
      near(G.faceChangeFromLie(0, 3), 0, 1e-9);
      near(G.faceChangeFromLie(0, -5), 0, 1e-9);
    });
    test('the sign follows the direction of the error', () => {
      assert(G.faceChangeFromLie(34, 2) > 0);
      assert(G.faceChangeFromLie(34, -2) < 0);
    });
    test('face change matches the closed form at known lofts', () => {
      near(G.faceChangeFromLie(21, 1), 0.384, 0.005, '4-iron');
      near(G.faceChangeFromLie(31, 1), 0.601, 0.005, '7-iron');
      near(G.faceChangeFromLie(60, 1), 1.731, 0.005, '60 degree');
    });
    test('a wedge face turns about 4.5x as far as a long iron', () => {
      const ratio = G.faceChangeFromLie(60, 1) / G.faceChangeFromLie(21, 1);
      near(ratio, 4.5, 0.2);
    });
    test('face change grows monotonically with loft', () => {
      for (let L = 5; L < 62; L++) {
        assert(G.faceChangeFromLie(L + 1, 1) > G.faceChangeFromLie(L, 1), 'dipped at ' + L);
      }
    });

    /* The curve model is anchored on published TrackMan figures. If someone
       retunes the constant, these two anchors must still hold. */
    test('curve reproduces the published 300-yard anchor', () => {
      // 1 degree of face-to-path is ~12 yards of curve at 300 yards
      const loft = 45, err = 1;
      const face = G.faceChangeFromLie(loft, err);
      const scaled = G.lieImpact(loft, err, 300).curveYards / face;
      near(scaled, 12, 0.5, 'yards of curve per degree at 300 yd');
    });
    test('curve reproduces the published mid-iron anchor', () => {
      const loft = 27, err = 2;
      const face = G.faceChangeFromLie(loft, err);
      const perDeg = G.lieImpact(loft, err, 152).curveYards / face;
      near(perDeg, 3.1, 0.3, 'yards of curve per degree at ~150 yd');
    });

    /* The finding that corrected the site's copy: yards offline are roughly
       flat across the bag, while the face error is not. */
    test('yards offline stay flat across the bag', () => {
      const clubs = [[21, 175], [31, 145], [44, 115], [56, 85], [60, 70]];
      const totals = clubs.map((c) => G.lieImpact(c[0], 1, c[1]).totalYards);
      const lo = Math.min.apply(null, totals), hi = Math.max.apply(null, totals);
      assert(hi / lo < 1.5, 'offline yards vary too much: ' + totals.join(', '));
      totals.forEach((t) => assert(t > 2 && t < 4, 'outside the 2-4 yard band: ' + t));
    });
    test('but the miss grows sharply as a share of the shot', () => {
      const longIron = G.lieImpact(21, 1, 175).percentOfShot;
      const wedge = G.lieImpact(60, 1, 70).percentOfShot;
      assert(wedge / longIron > 2.4, 'wedge should be far worse proportionally');
    });
    test('a driver starts more of its flight on the face than an iron', () => {
      assert(G.lieImpact(10.5, 2, 250, true).startYards > G.lieImpact(10.5, 2, 250, false).startYards);
    });

    /* Length and lie: 1 degree per half inch, and longer plays MORE UPRIGHT.
       The site previously had this at half strength and in the wrong
       direction, in two user-facing places. */
    test('length couples to lie at a degree per half inch', () => {
      near(G.lieFromLengthChange(0.5), 1, 1e-9);
      near(G.lieFromLengthChange(1), 2, 1e-9);
      near(G.lieFromLengthChange(-0.5), -1, 1e-9);
    });
  });

  suite('Answering less than everything', () => {
    /* Wrist-to-floor used to be a hard gate on question one, for a
       measurement most people cannot take on the spot. */
    test('a fit works from height alone', () => {
      const r = G.fit({ heightIn: 68, skill: 'beginner' });
      assert(r.lie.code, 'should still produce a lie code');
      assert(r.recommendedBag.count > 0, 'should still recommend a bag');
      assert(r.specSheet.length === 12, 'should still produce a build sheet');
    });
    test('a missing measurement is assumed, not invented, and is declared', () => {
      const r = G.fit({ heightIn: 68 });
      assert(r.wtfAssumed, 'should be flagged as assumed');
      near(r.input.wtfIn, G.levelCentre(68), 0.001, 'should assume average proportions');
      equal(r.lie.code.code, 'LEVEL', 'average proportions means a standard lie');
      assert(r.flags.some((f) => /did not give us a wrist-to-floor/.test(f.text)), 'should say so');
    });
    test('a supplied measurement is never overridden', () => {
      const r = G.fit({ heightIn: 68, wtfIn: 36 });
      assert(!r.wtfAssumed);
      equal(r.input.wtfIn, 36);
    });
    test('"not sure" falls back to neutral and is recorded', () => {
      const r = G.fit({ heightIn: 70, wtfIn: 34, shotShape: 'unsure', attack: 'unsure', tempo: 'unsure' });
      equal(r.input.shotShape, 'straight');
      equal(r.input.attack, 'neutral');
      assert(r.assumed.indexOf('your ball flight') !== -1, 'should record the assumption');
      assert(r.assumed.length >= 3);
    });
    test('the length cross-check does not pretend to agree with an assumption', () => {
      equal(G.fit({ heightIn: 68 }).lengthAgreement.status, 'assumed');
      assert(['agree', 'conflict'].indexOf(G.fit({ heightIn: 68, wtfIn: 36 }).lengthAgreement.status) !== -1);
    });
    test('an assumed measurement is never called an outlier or fragile', () => {
      const r = G.fit({ heightIn: 68 });
      assert(!r.wtfOutlier, 'cannot be an outlier against itself');
      assert(!r.flags.some((f) => /edge of (your|this) band/.test(f.text)), 'no false precision');
    });
  });

  suite('Confidence', () => {
    test('answering nothing but height reports low confidence', () => {
      const c = G.fit({ heightIn: 68, skill: 'beginner' }).confidence;
      equal(c.overall, 'low');
      assert(c.areas.some((a) => a.name === 'Lie angle' && a.level === 'low'));
    });
    test('a fully answered fit reports high confidence', () => {
      const c = fit({ driverSpeed: 96, ironCarry: null, wtfIn: 34, handLength: 7.4, pwLoft: 44 }).confidence;
      equal(c.overall, 'high');
    });
    test('club length is always solid, because height is always given', () => {
      [{ heightIn: 60 }, { heightIn: 78, wtfIn: 37 }].forEach((o) => {
        const a = G.fit(o).confidence.areas.find((x) => x.name === 'Club length');
        equal(a.level, 'high');
      });
    });
    test('every soft area explains what would fix it', () => {
      G.fit({ heightIn: 68 }).confidence.areas.forEach((a) => {
        if (a.level !== 'high') assert(a.fix, a.name + ' is soft but offers no fix');
      });
    });
    test('measuring wrist-to-floor lifts the lie angle out of low', () => {
      const before = G.fit({ heightIn: 68 }).confidence.areas.find((a) => a.name === 'Lie angle');
      const after = G.fit({ heightIn: 68, wtfIn: 33 }).confidence.areas.find((a) => a.name === 'Lie angle');
      equal(before.level, 'low');
      equal(after.level, 'high');
    });
  });

  suite('The colour field', () => {
    /* The scale was always continuous, so the colour is too — hard band
       edges were an artefact of a chart that had to be printed. */
    test('two players a fraction of a degree apart get different colours', () => {
      assert(G.colourAt(1.4) !== G.colourAt(1.6), 'colour should be continuous');
      assert(G.colourAt(0.05) !== G.colourAt(0.45), 'and within a single code');
    });
    test('the anchors are exactly the scale colours', () => {
      G.scale.forEach((c) => equal(G.colourAt(c.i), c.hex.toUpperCase(), c.code));
    });
    test('colour clamps at the ends rather than running off', () => {
      equal(G.colourAt(-9), G.colourAt(-5));
      equal(G.colourAt(12), G.colourAt(5));
    });
    test('every code has a colour name', () => {
      G.scale.forEach((c) => assert(c.name && c.name.length > 2, c.code + ' has no name'));
    });
    test('the reference runs 00 to 100 across the scale', () => {
      equal(G.swatchFor(-5).ref, '00');
      equal(G.swatchFor(0).ref, '50');
      equal(G.swatchFor(5).ref, '100');
    });
    test('the label pairs a name with the reference', () => {
      equal(G.swatchFor(0).label, 'Fairway 50');
      equal(G.swatchFor(1.3).name, 'Teal');
    });
    test('ink stays readable on any background', () => {
      for (let d = -5; d <= 5; d += 0.25) {
        const s = G.swatchFor(d);
        const rgb = [1, 3, 5].map((i) => parseInt(s.hex.slice(i, i + 2), 16));
        const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
        const darkInk = s.ink === '#0B1310';
        assert(darkInk === lum > 0.42 || Math.abs(lum - 0.42) < 0.2,
          'ink ' + s.ink + ' on ' + s.hex + ' (lum ' + lum.toFixed(2) + ')');
      }
    });
    test('a fit carries its own swatch', () => {
      const sw = G.fit({ heightIn: 73, wtfIn: 35.5 }).lie.swatch;
      assert(/^#[0-9A-F]{6}$/.test(sw.hex), 'bad hex: ' + sw.hex);
      assert(sw.label.indexOf(sw.name) === 0, 'label should lead with the name');
      equal(sw.code, 'U1');
    });
  });

  suite('Club length', () => {
    test('length bands match the published half-inch steps', () => {
      const cases = [[60, -1.5], [62, -1], [64, -0.5], [67, 0], [70, 0], [72, 0],
                     [73, 0.5], [76, 1], [78, 1.5]];
      cases.forEach(([h, adj]) => equal(G.staticLength(h).adj, adj, h + '"'));
    });
    test('off-chart heights are extrapolated and flagged', () => {
      assert(G.staticLength(56).note, 'short player should carry a note');
      assert(G.staticLength(84).note, 'tall player should carry a note');
    });
    test('wrist-to-floor gives an independent second opinion', () => {
      equal(G.wtfLengthCheck(31).adj, -1);
      equal(G.wtfLengthCheck(35).adj, 0);
      equal(G.wtfLengthCheck(38).adj, 1);
    });
  });

  suite('Speed estimation', () => {
    test('a measured driver speed is used as given', () => {
      const r = fit({ driverSpeed: 100, ironCarry: null });
      equal(r.speeds.driver, 100);
      equal(r.speeds.confidence, 'high');
    });
    test('7-iron speed is 80% of driver speed', () => {
      near(fit({ driverSpeed: 100, ironCarry: null }).speeds.iron7, 80, 0.1);
    });
    test('carry-derived speed is marked medium confidence', () => {
      equal(fit({ ironCarry: 150 }).speeds.confidence, 'medium');
    });
    test('with no speed at all it guesses and says so', () => {
      const r = fit({ ironCarry: null });
      equal(r.speeds.confidence, 'low');
      assert(r.flags.some((f) => /educated guess/.test(f.text)), 'should warn');
    });
    test('the same carry implies less speed for a better striker', () => {
      const weak = fit({ ironCarry: 150, skill: 'high' }).speeds.driver;
      const strong = fit({ ironCarry: 150, skill: 'scratch' }).speeds.driver;
      assert(strong < weak, 'better strikers get more carry per mph');
    });
  });

  suite('Sensitivity and measurement sanity', () => {
    test('a mid-band measurement is reported as robust', () => {
      const r = fit({ wtfIn: G.levelCentre(70) });
      assert(!r.sensitivity.fragile, 'dead centre must not be called fragile');
      assert(r.sensitivity.margin > 0.45, 'margin should be near half an inch');
    });
    test('a band-edge measurement is flagged as fragile', () => {
      const r = fit({ wtfIn: G.levelCentre(70) + 0.45 });
      assert(r.sensitivity.fragile, 'should be flagged');
      assert(r.sensitivity.nearer.code === 'U1', 'should name the nearer code');
    });
    test('the margin is the real distance to the band edge', () => {
      const r = fit({ wtfIn: G.levelCentre(70) + 0.3 });
      near(r.sensitivity.margin, 0.2, 0.02);
    });
    test('the fragile and borderline warnings never both fire', () => {
      for (let d = 0; d <= 0.5; d += 0.01) {
        const r = fit({ wtfIn: G.levelCentre(70) + d });
        const said = r.flags.filter((f) => /edge of (your|this) band/.test(f.text)).length;
        assert(said <= 1, 'two edge warnings at offset ' + d.toFixed(2));
      }
    });
    test('an implausible wrist-to-floor is called out', () => {
      assert(fit({ wtfIn: 40 }).wtfOutlier, 'should be an outlier at 5\'10"');
      assert(!fit({ wtfIn: 34 }).wtfOutlier, 'should not be an outlier');
    });
  });

  suite('Handedness', () => {
    test('shot-shape vocabulary is handedness-neutral', () => {
      equal(G.sides({ handedness: 'right' }).away, 'right');
      equal(G.sides({ handedness: 'left' }).away, 'left');
    });
    test('a hook misses left for a right-hander', () => {
      assert(/to the left/.test(fit({ shotShape: 'hook', handedness: 'right' }).dynamicLie.text));
    });
    test('a hook misses right for a left-hander', () => {
      assert(/to the right/.test(fit({ shotShape: 'hook', handedness: 'left' }).dynamicLie.text));
    });
  });

  suite('Junior and women\'s paths', () => {
    test('a child gets junior sizing by height band', () => {
      const j = fit({ heightIn: 52, wtfIn: 26, age: 11 }).junior;
      assert(j, 'should produce a junior block');
      assert(j.driverLength < 40, 'junior driver should be short');
      assert(/every 2"/.test(j.refit), 'should give a re-fit cadence');
    });
    test('an adult never gets junior sizing', () => {
      assert(!fit({ heightIn: 70 }).junior, 'no junior block for an adult');
    });
    test("women's sets get the L-flex warning when speed says otherwise", () => {
      const notes = fit({ gender: 'female', ironCarry: 150 }).womensNotes;
      assert(notes.length, 'should produce notes');
      assert(notes.some((n) => /L flex/.test(n)), 'should warn about stock L flex');
    });
    test('men get no women\'s notes', () => {
      equal(fit({ gender: 'male' }).womensNotes.length, 0);
    });
  });

  suite("Carry ladder — the player's own bag", () => {
    /* Reported by a real user: their 60° wedge was missing, because the table
       listed the RECOMMENDED wedges rather than the ones in their bag. */
    test('the ladder lists the clubs actually carried', () => {
      const rows = fit({ bag: { hasClubs: true, longs: ['3-wood', '5-hybrid'],
        longestIron: 6, wedgeLofts: [50, 54, 60] } }).set.carries;
      const clubs = rows.map((r) => r.club);
      equal(clubs[0], 'Driver');
      assert(clubs.includes('5-hybrid'), 'missing a carried hybrid: ' + clubs.join(', '));
      assert(clubs.some((c) => /60°/.test(c)), 'the 60° wedge is missing: ' + clubs.join(', '));
      assert(!clubs.includes('5-iron'), 'listed an iron above the longest carried');
      assert(!clubs.includes('5-wood'), 'listed a wood that is not in the bag');
    });
    test('a player with no driver does not get one in the ladder', () => {
      const clubs = fit({ bag: { hasClubs: true, hasDriver: false, longs: ['3-wood'],
        longestIron: 5, wedgeLofts: [56] } }).set.carries.map((r) => r.club);
      assert(!clubs.includes('Driver'), 'invented a driver');
      equal(clubs[0], '3-wood');
    });
    test('without a bag it falls back to a representative set', () => {
      const r = fit({});
      assert(!r.set.ladderIsYours, "should not claim to be the player's bag");
      assert(r.set.carries.length > 6, 'should still model something useful');
    });
    test('any bag still produces a monotonic ladder', () => {
      [[['3-wood'], 7, [50, 56]], [[], 4, [58]], [['3-wood', '5-wood', '7-wood', '4-hybrid', '5-hybrid'], 7, [50, 54, 58, 62]]]
        .forEach(([longs, longestIron, wedgeLofts]) => {
          const rows = fit({ bag: { hasClubs: true, longs, longestIron, wedgeLofts } }).set.carries;
          for (let i = 1; i < rows.length; i++) {
            assert(rows[i].carry <= rows[i - 1].carry,
              'ladder rises at ' + rows[i].club + ' for ' + JSON.stringify(longs));
          }
        });
    });
    test('four wedges are all listed, in loft order', () => {
      const clubs = fit({ bag: { hasClubs: true, longs: ['3-wood'], longestIron: 6,
        wedgeLofts: [50, 54, 58, 62] } }).set.carries.map((r) => r.club);
      [50, 54, 58, 62].forEach((L) => assert(clubs.some((c) => c.indexOf(L + '°') === 0),
        L + '° missing from ' + clubs.join(', ')));
    });
  });

  suite('The recommended bag', () => {
    const PLAYERS = [
      { n: 'beginner', o: { ironCarry: 105, skill: 'beginner', handicap: 32 } },
      { n: 'slow', o: { ironCarry: 118, skill: 'high', handicap: 24 } },
      { n: 'mid-slow', o: { ironCarry: 132 } },
      { n: 'mid', o: { ironCarry: 150 } },
      { n: 'fast', o: { driverSpeed: 110, ironCarry: null, skill: 'low', handicap: 6 } },
      { n: 'very fast', o: { driverSpeed: 122, ironCarry: null, skill: 'scratch', handicap: 0 } }
    ];

    test('never recommends more than fourteen clubs', () => {
      PLAYERS.forEach((p) => {
        const b = fit(p.o).recommendedBag;
        assert(b.count <= 14, p.n + ' got ' + b.count + ' clubs');
      });
    });
    test('always includes a driver and a putter', () => {
      PLAYERS.forEach((p) => {
        const names = fit(p.o).recommendedBag.clubs.map((c) => c.name);
        assert(names.indexOf('Driver') === 0, p.n + ' has no driver first');
        assert(names[names.length - 1] === 'Putter', p.n + ' has no putter last');
      });
    });
    test('lofts increase all the way down the bag', () => {
      PLAYERS.forEach((p) => {
        const lofts = fit(p.o).recommendedBag.clubs
          .filter((c) => c.slot !== 'Putter').map((c) => c.loft);
        for (let i = 1; i < lofts.length; i++) {
          assert(lofts[i] > lofts[i - 1], p.n + ' loft order: ' + lofts.join(', '));
        }
      });
    });

    /* The strongest check available: a bag we recommend must not fail the
       gapping test we apply to everybody else's. */
    test('every recommended bag passes our own gapping check', () => {
      PLAYERS.forEach((p) => {
        const r = fit(p.o);
        const issues = G.reviewGapping(r.set.carries).issues;
        assert(issues.length === 0,
          p.n + ' recommended bag has ' + issues.length + ' fault(s): ' +
          issues.map((i) => i.type + ' ' + i.gap + 'yd ' + i.clubs.join('/')).join('; '));
      });
    });

    test('a beginner is told to carry fewer clubs', () => {
      const b = fit({ ironCarry: 105, skill: 'beginner', handicap: 32 }).recommendedBag;
      assert(b.starter, 'should be flagged as a starter set');
      assert(b.count <= 11, 'a beginner does not need ' + b.count + ' clubs');
      assert(b.notes.some((n) => /not fourteen/.test(n)), 'should explain why');
    });
    test('a beginner still gets a club between the pitching and sand wedge', () => {
      const names = fit({ ironCarry: 105, skill: 'beginner' }).recommendedBag.clubs.map((c) => c.name);
      assert(names.some((n) => /52/.test(n)), 'no gap wedge: ' + names.join(', '));
    });
    test('faster players carry fewer woods and more irons', () => {
      const slow = fit({ ironCarry: 115, skill: 'high' }).recommendedBag.clubs;
      const fast = fit({ driverSpeed: 110, ironCarry: null, skill: 'low' }).recommendedBag.clubs;
      const woods = (c) => c.filter((x) => x.slot === 'Fairway' || x.slot === 'Hybrid').length;
      const irons = (c) => c.filter((x) => x.slot === 'Iron').length;
      assert(woods(slow) > woods(fast), 'slow player should carry more woods');
      assert(irons(fast) > irons(slow), 'fast player should carry more irons');
    });
  });

  /* "Your first set" was shown to anyone who answered "beginner", including
     people who had just told us exactly what was already in their bag. */
  suite('The bag knows whether you own clubs', () => {
    const bagFor = (skill, hasClubs) => fit({
      heightIn: 69, wtfIn: 35, skill, ironCarry: 140,
      bag: hasClubs === null ? undefined : { hasClubs }
    }).recommendedBag;

    test('a beginner who owns clubs is not sold a first set', () => {
      const b = bagFor('beginner', true);
      equal(b.starter, true);
      equal(b.owns, true);
      assert(!/first set/i.test(b.title), b.title);
      assert(!/first set/i.test(b.lead), b.lead);
    });

    test('a beginner starting from nothing still gets one', () => {
      equal(bagFor('beginner', false).title, 'Your first set');
      equal(bagFor('beginner', null).title, 'Your first set');
    });

    test('owning clubs changes the words, not the ten-club set', () => {
      equal(bagFor('beginner', true).count, bagFor('beginner', false).count);
    });

    test('an owner is never told to spend money they need not spend', () => {
      const buying = bagFor('beginner', false).notes.join(' ');
      const owning = bagFor('beginner', true).notes.join(' ');
      assert(/costs far less/.test(buying), 'the buying case still says it');
      assert(!/costs far less/.test(owning), 'the owning case must not');
      assert(/leave the extras at home/.test(owning), owning);
    });

    test('every skill level produces a title and a lead', () => {
      ['beginner', 'high', 'mid', 'low', 'scratch'].forEach((skill) => {
        [true, false].forEach((has) => {
          const b = bagFor(skill, has);
          assert(b.title && b.title.length > 3, skill + '/' + has + ' title');
          assert(b.lead && b.lead.length > 10, skill + '/' + has + ' lead');
        });
      });
    });
  });

  suite('Gapping thresholds scale with the player', () => {
    /* A fixed 8-yard "too close" rule told a player whose 7-iron goes 105
       yards that their perfectly normal 6-yard iron gaps were a fault. */
    test('six yards is fine for a short hitter and too close for a long one', () => {
      equal(G.gapVerdict(6, 92), 'ok', 'short hitter');
      equal(G.gapVerdict(6, 180), 'close', 'long hitter');
    });
    test('anything under four yards is always too close', () => {
      equal(G.gapVerdict(3, 60), 'close');
    });
    test('a club that outdrives the one above it is inverted', () => {
      equal(G.gapVerdict(-4, 150), 'inverted');
      equal(G.gapVerdict(0, 150), 'inverted');
    });
    /* And the mirror image: a long hitter's driver-to-3-wood gap is naturally
       big and is not a fault. */
    test('twenty-six yards is fine at the top of a long bag, a hole in a short one', () => {
      equal(G.gapVerdict(26, 240), 'ok', 'long hitter');
      equal(G.gapVerdict(26, 120), 'wide', 'short hitter');
    });
  });

  suite('Shaft shortlist', () => {
    test('suggestions match the recommended flex', () => {
      const r = fit({ driverSpeed: 100, ironCarry: null });
      r.shaftPicks.irons.forEach((p) => assert(p.name, 'named shaft'));
      assert(r.shaftPicks.irons.length > 0, 'should suggest iron shafts');
      assert(r.shaftPicks.driver.length > 0, 'should suggest driver shafts');
    });
    test('a low ball flight is pushed toward higher-launch shafts', () => {
      const low = fit({ trajectory: 'low' }).shaftPicks.irons[0];
      const high = fit({ trajectory: 'high' }).shaftPicks.irons[0];
      assert(low.name !== high.name, 'flight should change the shortlist');
    });
  });

  /* ----------------------------------------------------------------------
     Broad sweep: every combination must produce a complete, sane result.
     ---------------------------------------------------------------------- */
  const cases = [];
  for (const heightIn of [56, 60, 64, 66, 68, 70, 72, 74, 76, 79, 84]) {
    for (const wtfIn of [26, 29, 31, 33, 34, 35, 37, 39, 42]) {
      for (const skill of ['beginner', 'high', 'mid', 'low', 'scratch']) {
        for (const shotShape of ['slice', 'straight', 'hook', 'pull', 'push']) {
          for (const handedness of ['right', 'left']) {
            cases.push({ heightIn, wtfIn, skill, shotShape, handedness });
          }
        }
      }
    }
  }

  suite('Sweep — fit()', () => {
    sweep('every combination produces a complete result', cases, (c) => {
      const r = fit(c);

      assert(r.lie.code, 'missing lie code');
      assert(r.wedges.lofts.length, 'missing wedges');
      equal(r.specSheet.length, 12, 'build sheet row count');

      // carry ladder must never go back up
      for (let i = 1; i < r.set.carries.length; i++) {
        assert(r.set.carries[i].carry <= r.set.carries[i - 1].carry,
          'carry ladder rises at ' + r.set.carries[i].club);
      }

      // wedges ascend in loft, and all sit above the pitching wedge
      let prev = r.wedges.pwLoft;
      r.wedges.lofts.forEach((L) => {
        assert(L > prev, 'wedge lofts out of order: ' + r.wedges.lofts.join('/'));
        prev = L;
      });

      // nothing user-facing may contain a placeholder
      noPlaceholders([r.dynamicLie.text, r.grip.mods, r.ironHead, r.putter,
        r.womensNotes, r.junior, r.shaftPicks, r.lengthAgreement.text,
        r.flags.map((f) => f.text)]);
    });
  });
};
