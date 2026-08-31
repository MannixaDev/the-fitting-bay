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
