# The Fitting Bay

A static golf club fitting calculator. Plain HTML, CSS and JavaScript — no build step, no
dependencies, no back end. Open `index.html` in a browser and it works.

```
golffitting/
├── index.html                  the fitting tool: wizard, results, audit, Bay Scale chart
├── fitting-information.html    reference: how fitting works, all the tables
├── favicon.svg
├── og-image.png                social share card (1200×630)
├── css/styles.css
├── js/fitting-engine.js        all fitting logic, pure functions, no DOM
├── js/app.js                   wizard UI, SVG rendering, results, audit, persistence
├── tools/bump.js               rewrites the ?v= cache-busters from file hashes
└── .githooks/pre-commit        runs bump.js so they can never go stale
```

`app.js` is shared by both pages and is page-aware: the wizard initialises only where
`#fitForm` exists, while the chart, diagrams and reference tables render wherever their host
elements are present.

## Running it

Double-click `index.html`, or serve the folder:

```bash
python -m http.server 8123
```

The `?v=` query strings on the asset links are content hashes. They are generated, not
hand-written:

```bash
node tools/bump.js          # rewrite in place
node tools/bump.js --check  # exit 1 if stale, for CI
```

A pre-commit hook runs it automatically. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## What it outputs

From twelve inputs (height, wrist-to-floor, hand length, age, skill, speed, ball flight, attack
angle, tempo, turf, priority, putting stroke) it produces:

- **Lie angle** as a Bay Scale code, plus the unrounded deviation and per-club lie in degrees
- **Club length** from height, cross-checked against wrist-to-floor
- **Shaft** flex, weight and material for both irons and driver
- **Driver** loft range, playing length, head bias, swing weight
- **Iron head category** (blades → super game improvement)
- **Wedges** — loft gapping off your actual PW, plus bounce and grind
- **Grip size**, adjusted for miss pattern and joint health
- **Putter** length, lie, head style and toe hang
- **Golf ball** construction and compression
- **Set makeup** for all 14 slots with an estimated carry-gap table
- A **build sheet** table of every club: standard spec, adjustment, and the number to build to

- **Named shafts** — a shortlist of widely stocked models matching your weight, flex and flight
- **Junior sizing** where the player is a child, and **women's-set traps** where relevant

It then offers a second, separate pass — **"check the clubs you already own"** — which diffs your
current specs against the fit and returns a prioritised, costed list of what to change, optionally
filtered to a budget.

## Design decisions worth knowing

**Handedness is a property of the text, not the logic.** Shot shapes are named from the player's
point of view and are already handedness-neutral — a slice always curves *away* from the player.
So the engine keeps `slice`/`hook`/`pull`/`push` as-is and routes every "left" and "right" in
user-facing copy through `sides(input)`. On the page, `.dir-away` / `.dir-home` spans are swapped
at runtime. Nothing branches on handedness, which means nothing can drift out of sync.

**The carry table is editable.** It starts as a modelled ladder from your speed, but every number
is an input. Type your real yardages over the estimates and the gaps recalculate live, measured
rows are marked, and those numbers feed the audit as gapping findings — which is how you catch the
classic "my 4-iron and 5-iron go the same distance". Overrides persist in the draft.

**Sensitivity is reported, not hidden.** The result says whether ½" of measuring error either way
would change your lie code. If it would, that is exactly the case where a fitter tests both, and
the tool says so rather than projecting false precision.

**Wrist-to-floor gets a live sanity check.** Because everything rests on it, an entry more than
2.5" from typical for that height triggers a warning *while you type*, alongside an SVG diagram and
the three specific ways people take the measurement wrong.

## Provenance

### The Bay Scale

The Bay Scale is our own lie-angle scale. It exists because lie angle is driven by how far your
hands sit from the ground at address — which is **arm length**, not height. Two golfers of the same
height can need lie angles several degrees apart, and wrist-to-floor is what separates them.

The scale is the difference between your measured wrist-to-floor and the reference wrist-to-floor
for your height:

```
delta   = measuredWTF − referenceWTF(height)
code    = round(delta)      one code per 1" of deviation
degrees = delta             also reported unrounded
```

Codes are self-documenting: `U2` is two degrees upright, `F1` is one degree flat, `LEVEL` is
standard. The scale is symmetric, `F5` … `LEVEL` … `U5`.

Reporting the unrounded figure alongside the code matters: a player at `+1.4°` and a player at
`+1.6°` both get a code, but one is comfortably inside U1 and the other is on the edge of U2. The
tool flags the second case, which is exactly where a fitter would test both.

#### The reference curve

`REFERENCE_WTF` in `js/fitting-engine.js` is the wrist-to-floor at the centre of the LEVEL band,
per inch of height from 5'0" to 6'7". It is anchored to the one reference point the fitting industry
publishes in common — **a 5'10" golfer with a 34" wrist-to-floor plays standard length and standard
lie** — and shaped by two principles:

1. **Inside a length band**, nothing about the club changes, so the curve rises only with body
   proportion — about 0.1" per inch of height.
2. **Crossing a length band** changes the club by ½", and a ½" length change is worth roughly ½° of
   effective lie, so the curve steepens to about 0.4" per inch of height where length is changing.

That produces the shape you see on the chart: gentle across the standard-length heights of
5'7"–6'0", steeper at both ends. Values are round quarter-inch figures.

**Validation.** The scale is checked against the three body/lie combinations that appear as worked
examples across the published fitting literature:

| Height | Wrist-to-floor | Published fitting result | Bay Scale |
|---|---|---|---|
| 5'10" | 34" | standard lie | `LEVEL` (+0.2°) ✓ |
| 5'6" | 32" | 1° flat | `F1` (−1.2°) ✓ |
| 6'2" | 36.5" | 2° upright | `U2` (+1.9°) ✓ |

Outside 5'0"–6'7" the curve is linearly extrapolated, and beyond `F5`/`U5` the result is clamped
and flagged — most cast iron heads only bend reliably 2–3° either way, so a player off the end of
the scale needs a head that supports more bending and an in-person fitter.

### Club length

Length comes from height in ½" steps, which is the increment club builders actually work in.
Wrist-to-floor provides an independent second opinion, and when the two disagree the tool says so
rather than hiding it — that disagreement is itself the signal that your arms are long or short for
your height.

### The audit model

Most visitors are not buying a full set; they want to know what on their existing clubs is wrong
and what to fix first. `audit(fitResult, currentSpecs)` produces one finding per spec, each with a
severity, the concrete cost of being wrong, the fix, and an indicative price.

Ordering is **impact first, money second**, and findings that are both significant and cheap
(≤ £120) are tagged as quick wins and surfaced in the headline. That ordering is the whole point:
a lie bend and a re-grip cost about £100 together and fix two of the most common errors in golf,
while a reshaft costs £250–£450 and should almost always wait until the cheap work is done.

Three findings can come back free, and they matter disproportionately:

- a **driver loft** error inside the range of an adjustable hosel — a wrench and ten minutes
- a **ball** in the wrong category — you buy balls anyway
- anything already correct, which lands in a *"leave this alone"* group, because telling someone
  what **not** to spend money on is half the value

Unknown specs are not silently skipped. Each returns a finding explaining how to find that number
out, since "I don't know my lie angle" is the normal state for most golfers.

Costs are indicative UK shop rates, set in one constant (`CUR`) plus the per-finding figures.

**Repair has a ceiling.** Past a point, fixing a set of irons costs more than replacing it, and the
audit says so rather than cheerfully quoting you £700 of bench work. `SET_BENCHMARK` holds the price
of the cheapest credible new set built to your specs (currently £580 — a direct-to-consumer set
priced *as configured*, since custom length and lie come with the build but premium shafts and
non-stock grips carry an upcharge, so the sticker price is not what you pay).

Only bench work on the irons counts toward that ceiling — a driver, a wedge or a box of balls are
separate purchases. Overlapping jobs are counted once: a flex change and a material change are the
same reshaft, not two. When the midpoint of the iron work reaches the benchmark, a
replace-rather-than-repair card goes to the top and the individual iron repairs are demoted into a
*"repairs you would be paying for instead"* group, out of the running totals. Between 60% and 100%
of the benchmark it adds a warning to the headline instead.

### Budget planning

`audit(fit, current, budget)` picks the combination of fixes that buys the most improvement per
pound: free fixes first, then greedy by severity-per-pound. Two special cases matter more than the
arithmetic:

- If a **new set** is the recommendation and the budget covers it, it is forced to the top of the
  plan rather than competing on value-per-pound — otherwise a £100 wedge buries a £580 decision.
- If a new set is the recommendation and the budget **does not** cover it, the cheap bench work
  that was set aside becomes available again as an interim plan, and the tool says plainly that
  the rest should be saved rather than sunk into a reshaft you are about to throw away.

## Persistence

Nothing leaves the browser. Three mechanisms, and a link always wins over a local draft:

- **The URL** carries a finished fit (and its audit) in readable short keys, so a result can be
  bookmarked, shared with a fitter, or hand-edited. `?sv=1&h=73&w=35.5&sk=m…`
- **`localStorage`** keeps a rolling draft of whatever is typed, including the wizard step and any
  carry overrides, so a refresh mid-questionnaire does not lose the answers. Wrapped in try/catch
  throughout, since private mode and blocked storage both throw.
- **Saved profiles** hold up to a dozen named fits on the device (`Me`, `Dad`, `after lessons`),
  each stored as its query string so loading one is just a navigation.

## Accessibility

Radio groups get `role="radiogroup"` and `aria-labelledby`, and hints become `aria-describedby`
descriptions — wired in JS at init rather than hand-edited across forty groups, so new fields
inherit it for free. The step heading is focused on each wizard advance (but not on first paint),
the step counter is an `aria-live` region, there is a skip link, and `prefers-reduced-motion` is
honoured.

### Speed and distance model

- 7-iron clubhead speed ≈ **0.80 × driver clubhead speed**. This ratio is stable across ability
  levels (PGA Tour 90/113, LPGA 76/94, average male amateur 76.8/93.4).
- Carry per unit of speed is *not* stable — it is strike quality. `SKILL_EFF` scales it from 1.72
  yards per mph of 7-iron speed (beginner) to 2.00 (scratch), anchored to TrackMan's published
  amateur and tour averages.
- The carry-gap ladder steps the irons off the measured 7-iron at 7% per club, and interpolates
  the long clubs between the 5-iron and the driver so the ladder is always monotonic even when the
  two speed anchors disagree slightly.

### Everything else

Flex bands, shaft weight ranges, driver loft by speed, grip sizing by hand length, wedge bounce
and grind, putter length and toe hang, and ball compression bands are the consensus of published
fitting guidance, cross-checked across multiple independent sources and set out in full on the
fitting information page.

## Modifying it

`js/fitting-engine.js` is deliberately free of DOM code, so you can `require()` it in Node for
testing:

```js
global.window = {};
require('./js/fitting-engine.js');
const r = window.GolfFit.fit({ heightIn: 70, wtfIn: 34, skill: 'mid', ironCarry: 150, /* ... */ });
console.log(r.lie.code.code, r.lie.preciseDegrees, r.length.adj, r.shafts.ironFlex);
```

Each recommendation lives in its own small function (`staticLie`, `shaftFit`, `driverFit`,
`wedgeFit`, `gripFit`, `putterFit`, `ballFit`, `setMakeup`), so a rule change is a local edit.
`audit(fitResult, currentSpecs)` is likewise pure and testable on its own.

## Legal

Independent and unaffiliated with any equipment manufacturer. The Bay Scale is our own fitting
scale. Brand and product names that appear inside recommendations — wedge grinds, for example —
are the trademarks of their respective owners and are named only to help a reader find comparable
products.
