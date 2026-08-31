# The Fitting Bay

A static golf club fitting calculator. Plain HTML, CSS and JavaScript — no build step, no
dependencies, no back end. Open `index.html` in a browser and it works.

```
golffitting/
├── index.html                  the fitting tool: wizard, results, Bay Scale chart
├── fitting-information.html    reference pages: how fitting works, all the tables
├── css/styles.css
├── js/fitting-engine.js        all fitting logic, pure functions, no DOM
├── js/app.js                   wizard UI, SVG chart rendering, results rendering
└── .claude/launch.json         dev-server config for the preview pane

`app.js` is shared by both pages and is page-aware: the wizard initialises only where
`#fitForm` exists, while the chart and reference tables render wherever their host elements
are present.
```

## Running it

Double-click `index.html`, or serve the folder:

```bash
python -m http.server 8123
```

The `?v=N` query strings on the asset links are cache-busters. Bump them when you edit
`styles.css` or the JS, or browsers will keep serving the old file.

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

It then offers a second, separate pass — **"check the clubs you already own"** — which diffs your
current specs against the fit and returns a prioritised, costed list of what to change.

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

## Persistence

Nothing leaves the browser. Two mechanisms, and a link always wins over a local draft:

- **The URL** carries a finished fit (and its audit) in readable short keys, so a result can be
  bookmarked, shared with a fitter, or hand-edited. `?sv=1&h=73&w=35.5&sk=m…`
- **`localStorage`** keeps a rolling draft of whatever is typed, including the wizard step, so a
  refresh mid-questionnaire does not lose the answers. Wrapped in try/catch throughout, since
  private mode and blocked storage both throw.

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
