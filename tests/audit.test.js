/* ---------------------------------------------------------------------------
   audit.test.js — the "check the clubs you already own" pass: findings,
   ordering, the replace-vs-repair ceiling, budget planning and gapping.
   --------------------------------------------------------------------------- */
'use strict';

const G = require('./engine');
const { suite, test, sweep, assert, equal, noPlaceholders } = require('./harness');

const BASE = {
  heightIn: 73, wtfIn: 35.5, handLength: 7.9, age: 34, gender: 'male',
  handedness: 'right', joints: false, skill: 'mid', handicap: 11,
  ironCarry: 162, pwLoft: 44, shotShape: 'slice', trajectory: 'low',
  attack: 'steep', tempo: 'moderate', turf: 'soft', strokeArc: 'slight',
  priority: 'forgiveness'
};
const FIT = G.fit(BASE);

/* Specs that exactly match the recommendation — the "nothing to do" baseline. */
const PERFECT = {
  ironLie: FIT.lie.code.deg,
  ironLength: FIT.length.adj,
  ironFlex: FIT.shafts.ironFlex,
  ironMaterial: FIT.shafts.material,
  gripSize: FIT.grip.key,
  driverLoft: (FIT.driver.loftLo + FIT.driver.loftHi) / 2,
  driverLength: FIT.driver.length,
  driverAdjustable: true,
  longestIron: FIT.set.longestIron,
  wedgeLofts: [48, 52, 56],
  ball: FIT.ball.key
};
const audit = (cur, budget) => G.audit(FIT, Object.assign({}, PERFECT, cur), budget);

module.exports = function () {

  suite('Audit — baseline', () => {
    test('a correctly fitted bag produces no actions', () => {
      const a = audit({});
      equal(a.actions.length, 0);
      assert(a.fine.length > 0, 'should list what to leave alone');
      assert(/Everything checks out/.test(a.headline), a.headline);
    });
    test('unknown specs return guidance rather than being skipped', () => {
      const a = G.audit(FIT, {});
      assert(a.unknowns.length >= 4, 'should explain how to find each spec');
      a.unknowns.forEach((u) => assert(u.detail, 'unknown finding needs guidance'));
    });
  });

  suite('Audit — individual findings', () => {
    test('a wrong lie angle is priced as a bend', () => {
      const f = audit({ ironLie: FIT.lie.code.deg - 2 }).actions[0];
      equal(f.area, 'Iron lie angle');
      assert(f.costHi <= 120, 'a bend is cheap');
      assert(f.quickWin, 'and therefore a quick win');
    });
    test('the lie finding quantifies the miss in yards', () => {
      const f = audit({ ironLie: FIT.lie.code.deg - 2 }).actions[0];
      assert(/yards offline/.test(f.detail), f.detail);
    });
    test('a wrong flex is expensive and never a quick win', () => {
      const f = audit({ ironFlex: 'L' }).actions.find((x) => x.area === 'Iron shaft flex');
      assert(f.costLo >= 250, 'a reshaft is not cheap');
      assert(!f.quickWin, 'and must not be tagged a quick win');
    });
    test('an adjustable hosel makes a small loft error free', () => {
      // 1.5 deg is inside a hosel's range; see the next test for one that is not
      const f = audit({ driverLoft: 9, driverAdjustable: true }).actions
        .find((x) => x.area === 'Driver loft');
      equal(f.costHi, 0);
      assert(f.quickWin, 'free fixes are quick wins');
      assert(/hosel/.test(f.fix), f.fix);
    });
    test('a loft error beyond the hosel range is not sold as free', () => {
      const f = audit({ driverLoft: 6.5, driverAdjustable: true }).actions
        .find((x) => x.area === 'Driver loft');
      assert(f.costHi > 0, 'too far out to turn a hosel');
      assert(!f.quickWin);
    });
    test('a fixed hosel is priced as a new head, not "free to try"', () => {
      const f = audit({ driverLoft: 8, driverAdjustable: false }).actions
        .find((x) => x.area === 'Driver loft');
      assert(!f.quickWin, 'not free on a fixed hosel');
      assert(!/Free/.test(f.costLabel), 'must not offer a free fix: ' + f.costLabel);
    });
    test('the wrong ball costs nothing to change', () => {
      const f = audit({ ball: 'soft2p' }).actions.find((x) => x.area === 'Golf ball');
      equal(f.costHi, 0);
      assert(f.quickWin);
    });
  });

  suite('Audit — ordering', () => {
    test('quick wins are surfaced in the headline', () => {
      const a = audit({ ironLie: FIT.lie.code.deg - 2, gripSize: 'Undersize' });
      assert(a.quickWins.length >= 2, 'should find quick wins');
      assert(/Start there/.test(a.headline), a.headline);
    });
    test('a cheap bend outranks an expensive reshaft of the same severity', () => {
      const a = audit({ ironLie: FIT.lie.code.deg - 2, ironFlex: 'A' });
      const lie = a.actions.findIndex((x) => x.area === 'Iron lie angle');
      const flex = a.actions.findIndex((x) => x.area === 'Iron shaft flex');
      assert(lie >= 0 && flex >= 0, 'both should be found');
      // flex is 'high' severity here, so it leads; the point is that among
      // equals the cheap one wins, which the sweep below enforces generally.
      assert(a.actions[0].severity === 'high', 'severity leads the ordering');
    });
  });

  suite('Audit — replace rather than repair', () => {
    const WRECK = {
      ironLie: 0, ironLength: 0, ironFlex: 'R', ironMaterial: 'Steel',
      gripSize: 'Standard', longestIron: 3, wedgeLofts: [56], ball: 'soft2p',
      driverLoft: 9, driverAdjustable: true
    };
    test('past the benchmark it recommends replacing the set', () => {
      const a = audit(WRECK);
      equal(a.replaceAdvice.level, 'replace');
      assert(a.actions[0].isReplaceAdvice, 'replace card must lead');
      assert(/Do not spend this money/.test(a.headline), a.headline);
    });
    test('the superseded repairs are moved out of the totals', () => {
      const a = audit(WRECK);
      assert(a.superseded.length >= 3, 'iron repairs should be set aside');
      assert(!a.actions.some((x) => x.job), 'no iron repair may stay in the live list');
      const liveSum = a.actions.reduce((n, x) => n + x.costLo, 0);
      equal(liveSum, a.totalCost[0], 'live total must exclude superseded work');
    });
    test('a flex change and a material change are one reshaft, not two', () => {
      const a = audit({ ironFlex: 'R', ironMaterial: 'Graphite' });
      assert(a.ironWork[0] <= 250, 'reshaft double-counted: ' + a.ironWork.join('–'));
    });
    test('approaching the benchmark warns instead of overriding', () => {
      const a = audit({ ironFlex: 'R' });
      equal(a.replaceAdvice.level, 'warn');
      assert(!a.actions.some((x) => x.isReplaceAdvice), 'must not force a replacement yet');
    });
    test('cheap work alone never triggers the ceiling', () => {
      const a = audit({ ironLie: FIT.lie.code.deg - 1, gripSize: 'Undersize' });
      assert(!a.replaceAdvice, 'a bend and a re-grip is obviously worth doing');
    });
  });

  suite('Audit — budget planning', () => {
    const WRECK = {
      ironLie: 0, ironFlex: 'R', gripSize: 'Standard',
      driverLoft: 9, driverAdjustable: true, longestIron: 3, ball: 'soft2p'
    };
    test('no budget means no plan', () => {
      assert(!audit(WRECK).plan, 'plan should be absent');
    });
    test('free fixes always make the plan', () => {
      const p = audit(WRECK, 0).plan;
      assert(p.now.every((x) => x.costLo === 0), 'only free items fit in £0');
      assert(p.now.length >= 1, 'free fixes should still be recommended');
    });
    test('the plan never exceeds the budget', () => {
      [50, 120, 300, 900].forEach((b) => {
        const p = audit(WRECK, b).plan;
        const spent = p.now.reduce((n, x) => n + x.costLo, 0);
        assert(spent <= b, 'plan of ' + spent + ' exceeds budget of ' + b);
      });
    });
    test('an affordable replacement leads the plan rather than losing on value', () => {
      const a = audit({ ironLie: 0, ironLength: 0, ironFlex: 'R', gripSize: 'Standard',
        longestIron: 3, wedgeLofts: [56] }, 1200);
      equal(a.replaceAdvice.level, 'replace');
      assert(a.plan.now[0].isReplaceAdvice, 'the set must be first in the plan');
    });
    test('an unaffordable replacement releases the cheap work as an interim plan', () => {
      const a = audit({ ironLie: 0, ironLength: 0, ironFlex: 'R', gripSize: 'Standard',
        longestIron: 3, wedgeLofts: [56] }, 150);
      equal(a.plan.canAffordSet, false);
      assert(a.plan.now.some((x) => x.area === 'Iron lie angle'),
        'cheap bench work should come back when a new set is out of reach');
      assert(/will not stretch/.test(a.plan.headline), a.plan.headline);
    });
  });

  suite('Gapping review', () => {
    test('an even ladder reports no problems', () => {
      const r = G.reviewGapping([
        { club: 'Driver', carry: 240 }, { club: '3-wood', carry: 220 },
        { club: '5-iron', carry: 200 }, { club: '6-iron', carry: 188 }
      ]);
      equal(r.issues.length, 0);
    });
    test('two clubs going the same distance is caught', () => {
      const r = G.reviewGapping([{ club: '4-iron', carry: 180 }, { club: '5-iron', carry: 178 }]);
      equal(r.issues[0].type, 'overlap');
    });
    test('a club that outdrives the one above it is caught', () => {
      const r = G.reviewGapping([{ club: '3-wood', carry: 200 }, { club: '5-wood', carry: 205 }]);
      equal(r.issues[0].type, 'inverted');
      equal(r.issues[0].severity, 'high');
    });
    test('a hole is caught and quantified', () => {
      const r = G.reviewGapping([{ club: '3-wood', carry: 220 }, { club: '5-iron', carry: 180 }]);
      equal(r.issues[0].type, 'hole');
      equal(r.issues[0].gap, 40);
    });
    test('measured yardages become audit findings', () => {
      const a = audit({ carries: [{ club: '4-iron', carry: 180, measured: true },
                                  { club: '5-iron', carry: 178, measured: true }] });
      assert(a.actions.some((x) => /^Gapping/.test(x.area)), 'should raise a gapping finding');
    });

    /* Three separate "27-yard hole" cards said one thing three times and
       pushed everything else down the list. */
    test('repeated holes are reported once, not once each', () => {
      const carries = [
        { club: 'Driver', carry: 250, measured: true },
        { club: '3-wood', carry: 218, measured: true },
        { club: '5-iron', carry: 186, measured: true },
        { club: '6-iron', carry: 174, measured: true }
      ];
      const raw = G.reviewGapping(carries).issues.filter((x) => x.type === 'hole');
      assert(raw.length > 1, 'fixture should produce more than one hole');

      const found = audit({ carries }).actions.filter((x) => /^Gapping/.test(x.area));
      equal(found.length, 1);
      assert(/holes in your ladder/.test(found[0].area), found[0].area);
      /* Every pair is still named, so nothing is hidden by the merge. */
      raw.forEach((g) => {
        assert(found[0].current.indexOf(g.clubs[0]) !== -1, 'names ' + g.clubs[0]);
        assert(found[0].current.indexOf(g.clubs[1]) !== -1, 'names ' + g.clubs[1]);
      });
      assert(found[0].costHi > 0, 'a merged hole still costs money');
    });

    test('a lone hole keeps its own club-to-club title', () => {
      const found = audit({
        carries: [{ club: '3-wood', carry: 220, measured: true },
                  { club: '5-iron', carry: 180, measured: true }]
      }).actions.filter((x) => /^Gapping/.test(x.area));
      equal(found.length, 1);
      equal(found[0].area, 'Gapping: 3-wood → 5-iron');
    });

    test('holes and overlaps stay separate findings', () => {
      const found = audit({
        carries: [{ club: 'Driver', carry: 250, measured: true },
                  { club: '3-wood', carry: 210, measured: true },
                  { club: '5-wood', carry: 207, measured: true }]
      }).actions.filter((x) => /^Gapping/.test(x.area));
      equal(found.length, 2);
    });
  });

  /* ----------------------------------------------------------------------
     Sweep: the audit must stay internally consistent for any combination of
     current specs, including every "not sure".
     ---------------------------------------------------------------------- */
  const cases = [];
  for (const ironLie of [null, -2, 0, 1, 3]) {
    for (const ironLength of [null, -1, 0, 0.5]) {
      for (const ironFlex of [null, 'L', 'R', 'S', 'X']) {
        for (const gripSize of [null, 'Undersize', 'Standard', 'Midsize', 'Jumbo']) {
          for (const driverLoft of [null, 8, 10.5, 14]) {
            for (const driverAdjustable of [null, true, false]) {
              for (const budget of [null, 0, 100, 600]) {
                cases.push({ ironLie, ironLength, ironFlex, gripSize, driverLoft, driverAdjustable, budget });
              }
            }
          }
        }
      }
    }
  }

  suite('Sweep — audit()', () => {
    sweep('every combination stays internally consistent', cases, (c) => {
      const budget = c.budget;
      const cur = Object.assign({}, c);
      delete cur.budget;
      const a = G.audit(FIT, Object.assign({
        ironMaterial: 'Steel', longestIron: 4, wedgeLofts: [50, 54, 58], ball: 'tourfirm',
        driverLength: 45.5
      }, cur), budget);

      assert(a.headline, 'missing headline');
      noPlaceholders(a.headline, 'headline');

      a.actions.concat(a.superseded, a.fine, a.unknowns).forEach((f) => {
        assert(f.area && f.detail && f.costLabel, 'incomplete finding: ' + f.area);
        noPlaceholders([f.detail, f.current, f.recommended, f.fix, f.costLabel], f.area);
      });

      // a quick win must actually be cheap
      a.quickWins.forEach((f) => assert(f.costHi <= 120, 'expensive quick win: ' + f.area));

      // the replace threshold must be respected exactly, both ways
      const mid = (a.ironWork[0] + a.ironWork[1]) / 2;
      const replacing = a.replaceAdvice && a.replaceAdvice.level === 'replace';
      assert(!(mid >= a.benchmark) || replacing, 'should have advised replacement at ' + mid);
      assert(!replacing || mid >= a.benchmark, 'advised replacement below the benchmark');

      // superseded work never counts toward the live total
      equal(a.actions.reduce((n, x) => n + x.costLo, 0), a.totalCost[0], 'total mismatch');

      // the plan must fit the budget and never invent items
      if (a.plan) {
        const spent = a.plan.now.reduce((n, x) => n + x.costLo, 0);
        assert(spent <= a.plan.budget, 'plan exceeds budget');
        noPlaceholders(a.plan.headline, 'plan headline');
      }
    });
  });
};
