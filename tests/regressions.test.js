/* ---------------------------------------------------------------------------
   regressions.test.js — bugs that actually shipped into a working build and
   were caught in review. Each one stays here so it cannot come back quietly.
   --------------------------------------------------------------------------- */
'use strict';

const G = require('./engine');
const { suite, test, assert, equal } = require('./harness');

const BASE = {
  heightIn: 73, wtfIn: 35.5, handLength: 7.9, age: 34, gender: 'male',
  handedness: 'right', joints: false, skill: 'mid', handicap: 11,
  ironCarry: 162, pwLoft: 44, shotShape: 'slice', trajectory: 'low',
  attack: 'steep', tempo: 'moderate', turf: 'soft', strokeArc: 'slight',
  priority: 'forgiveness'
};
const fit = (o) => G.fit(Object.assign({}, BASE, o));

module.exports = function () {

  suite('Regressions', () => {

    /* A tempo nudge near a flex boundary could push a mid-handicapper all the
       way to Tour X — a specialist shaft nobody should reach on a description
       of their transition. */
    test('tempo never nudges a player past X flex', () => {
      const r = fit({ ironCarry: 162, tempo: 'aggressive' });
      assert(r.shafts.driverFlex !== 'XX', 'tempo produced Tour X from a description');
      assert(r.shafts.ironFlex !== 'XX', 'tempo produced Tour X irons');
    });

    /* …but a genuinely measured 120 mph must still be allowed to reach it,
       and a smooth tempo must not demote them. */
    test('a measured 120 mph can still reach Tour X', () => {
      equal(fit({ driverSpeed: 122, ironCarry: null, tempo: 'aggressive' }).shafts.driverFlex, 'XX');
    });
    test('a smooth tempo softens by one flex, it does not reset to X', () => {
      equal(fit({ driverSpeed: 122, ironCarry: null, tempo: 'smooth' }).shafts.driverFlex, 'X');
    });

    /* The long-club carries were derived from driver speed while the irons
       were stepped off the 7-iron, so the two anchors could disagree and put
       a 4-hybrid below the 5-iron. */
    test('the carry ladder never rises', () => {
      [[100, 'mid'], [120, 'beginner'], [180, 'scratch']].forEach(([carry, skill]) => {
        const rows = fit({ ironCarry: carry, skill }).set.carries;
        for (let i = 1; i < rows.length; i++) {
          assert(rows[i].carry <= rows[i - 1].carry,
            skill + '/' + carry + ': ' + rows[i].club + ' carries further than ' + rows[i - 1].club);
        }
      });
    });

    /* A gapping "hole" was priced in its label but costed at zero, so the
       budget planner happily added a missing club for free. */
    test('a gapping hole carries a real cost, not just a priced label', () => {
      const f = G.audit(fit({}), {
        carries: [{ club: '3-wood', carry: 220 }, { club: '5-iron', carry: 180 }]
      }).actions.find((x) => /^Gapping/.test(x.area));
      assert(f, 'should raise a gapping finding');
      assert(f.costLo > 0, 'a missing club is not free');
      assert(!f.quickWin, 'buying a club is not a quick win');
    });

    /* Value-per-pound ordering buried a £580 replacement under a £100 wedge,
       so the plan recommended patching a set it had just told you to bin. */
    test('an affordable replacement is not outranked by a cheap wedge', () => {
      const a = G.audit(fit({}), {
        ironLie: 0, ironLength: 0, ironFlex: 'R', gripSize: 'Standard',
        longestIron: 3, wedgeLofts: [56]
      }, 700);
      assert(a.plan.now[0].isReplaceAdvice, 'the replacement must lead the plan');
    });

    /* The quick-win headline read "can be fixed for No extra cost" when every
       quick win happened to be free. */
    test('an all-free quick-win headline reads properly', () => {
      const a = G.audit(fit({}), {
        ironLie: fit({}).lie.code.deg, ironLength: fit({}).length.adj,
        ironFlex: fit({}).shafts.ironFlex, gripSize: fit({}).grip.key,
        ball: 'soft2p'
      });
      assert(!/for No extra cost/.test(a.headline), a.headline);
    });

    /* Direction words were baked into the copy, so left-handers were told to
       mentally invert every recommendation. */
    test('every direction word follows the player', () => {
      const rh = fit({ shotShape: 'hook', handedness: 'right' });
      const lh = fit({ shotShape: 'hook', handedness: 'left' });
      assert(rh.dynamicLie.text !== lh.dynamicLie.text, 'lie note did not flip');
      assert(/right-side/.test(lh.grip.mods[0]), 'grip note did not flip: ' + lh.grip.mods[0]);
    });

    /* Wedge lofts could come back unsorted or duplicated for unusual PW lofts. */
    test('wedge lofts are ordered and above the pitching wedge', () => {
      [40, 42, 43, 44, 45, 46, 48].forEach((pw) => {
        const w = fit({ pwLoft: pw }).wedges;
        let prev = w.pwLoft;
        w.lofts.forEach((L) => {
          assert(L > prev, 'pw ' + pw + ' produced ' + w.lofts.join('/'));
          prev = L;
        });
      });
    });

    /* The spec sheet applied the iron lie adjustment to woods and hybrids,
       which are not bent to the iron code. */
    test('only irons take the lie adjustment', () => {
      const sheet = fit({ wtfIn: 38 }).specSheet;
      const driver = sheet.find((r) => r.club === 'Driver');
      const seven = sheet.find((r) => r.club === '7-iron');
      equal(driver.lieAdj, 0, 'driver must not be bent to the iron code');
      assert(seven.lieAdj !== 0, '7-iron should take the adjustment');
    });
  });
};
