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
├── js/lie-bench.js             the interactive lie-angle bench
├── tools/bump.js               rewrites the ?v= cache-busters from file hashes
├── tests/                      the test suite — no dependencies, no config
└── .githooks/pre-commit        runs the tests, then bump.js
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

- **The bag to build** — an explicit, counted, club-by-club set with lofts and estimated carries
- **Named shafts** — a shortlist of widely stocked models matching your weight, flex and flight
- **Junior sizing** where the player is a child, and **women's-set traps** where relevant

The final question asks what is already in your bag. Answer it and you also get an **audit** — a
prioritised, costed list of which of your clubs is wrong and what it costs to put right, optionally
filtered to a budget — and the yardage table describes your clubs rather than a generic set. Say
you are starting fresh and the step is skipped entirely.

## The colour field

The chart is a continuous colour field rather than discrete bands, because **the scale was always
continuous** — a player is `+1.3°`, not merely "U1" — and hard band edges were an artefact of a
chart that had to be printed. Two players a fraction of a degree apart now look different, which is
the truth of it.

Colour follows the **deviation**, not the raw measurement, so the field is built from slices offset
along the reference curve. Sit on the line at any height and you are the same green.

Every fit therefore has a colour, named and referenced: **`Teal 63`**, hex `#3EB9BD`. The name comes
from the nearest code (Rust, Ember, Copper, Amber, Gold, Fairway, Teal, Sky, Cobalt, Indigo,
Violet) and the number runs 00–100 across the whole scale. Ink colour is chosen by relative
luminance so the chip stays readable on any shade.

`FIELD` in `renderChart` is the single constant controlling intensity. It is `1`, and it should
stay there unless something changes: at `0.62` the field was drawn over the near-black page at 62%,
so a fit named **`Teal 63`** (`#3EB8BF`, 50% lightness) was actually painted `#2B7B79` at 33% — the
right hue, a third too dark. People looked for their colour on the chart and could not find it.

Dimming it was never necessary. The axis labels, height ticks and code ruler are all drawn
**outside** the plot frame, on the page background, so `FIELD` never touched them. Everything
inside the frame — the reference curve, the LEVEL label, the marker and its annotation — is white
over a dark halo (`paint-order="stroke"`) precisely so it survives a saturated field.

**The reference is deliberately ours.** Pantone's library is licensed and actively enforced — Adobe
removed it from Photoshop in 2022 over licensing. Escaping one proprietary system by adopting
another, and paying for it, would have been a poor trade.

## Answering less than everything

A beginner cannot honestly answer half of these questions, and a tool that requires them to try is
one that treats guesses as data.

**Wrist-to-floor is optional.** It used to be a hard validation gate on question one, for a
measurement nobody has to hand. Without it the engine assumes average proportions for the height —
which is exactly what a height-only chart does — returns `LEVEL`, and says so. Height alone still
produces a length, a shaft, a driver loft and a full bag.

**"Not sure" is the default** on the five questions that need real self-knowledge: ball flight,
trajectory, angle of attack, tempo and putting stroke. Each falls back to the neutral option and is
recorded in `assumed`, so silence is never mistaken for an answer.

**Confidence is reported per area, not as one number**, because the parts of a fit degrade
separately: someone who measured carefully but does not know their swing speed has a rock-solid
length and a guessed shaft. Each soft area says what would fix it.

That combination created one way to give actively bad advice, which is guarded by a test: the audit
must **refuse to price a lie bend** when the lie was only assumed. Bending a set toward a number we
invented would leave a player further from their fit than they started.

## Design decisions worth knowing

**Handedness is a property of the text, not the logic.** Shot shapes are named from the player's
point of view and are already handedness-neutral — a slice always curves *away* from the player.
So the engine keeps `slice`/`hook`/`pull`/`push` as-is and routes every "left" and "right" in
user-facing copy through `sides(input)`. On the page, `.dir-away` / `.dir-home` spans are swapped
at runtime. Nothing branches on handedness, which means nothing can drift out of sync.

**The carry table describes the player's actual bag.** Bags vary enormously — a 7-wood here, four
wedges there, a 2-iron for the wind — and a table that quietly omits somebody's 60° is worse than
no table, because the gap it reports at the bottom of the bag is simply wrong. The final wizard
step asks what is in the bag, and `buildLadder()` assembles the ladder from exactly those clubs:
irons stepped off the measured 7-iron at 7% per club, long clubs spread evenly between the driver
and the longest iron (which keeps it monotonic however the two speed anchors disagree), and wedges
off the pitching wedge at ~2.55 yards per degree. With no bag supplied it falls back to a
representative set for that speed, and says so.

**The carry table is also editable.** Every number is an input. Type your real yardages over the
estimates and the gaps recalculate live, measured rows are marked, and those numbers feed the
audit as gapping findings — which is how you catch the classic "my 4-iron and 5-iron go the same
distance". Overrides persist in the draft.

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
2. **Crossing a length band** changes the club by ½", and a ½" length change is worth a *full degree* of
   effective lie (the standard clubmaking rule is 1° per ½", and a longer club plays more upright), so
   the curve steepens to about 0.4–0.5" per inch of height where length is changing.

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

### The bag to build

`buildBag()` answers the question someone with no clubs actually has: *what do I buy?* Prose like
"3-wood, 5-wood, maybe a hybrid" does not count, and the version this replaced could recommend
fifteen clubs to a fast player. It now reserves the fixed slots — driver, irons, wedges, putter —
and spends what is left on long clubs from a speed-appropriate ladder, taken from the top down
because the gap below the driver is the one that has to be covered first.

A **beginner** gets ten clubs, not fourteen, with the reasoning stated: buying fourteen mostly buys
four clubs you cannot yet hit.

The strongest check on all of this is a test asserting that **every bag we recommend passes the
gapping check we apply to everybody else's**. Three bugs fell out of writing it, all the same
shape — a fixed threshold applied to players of very different speeds:

- **"Under 8 yards is too close"** told a player whose 7-iron carries 105 yards that their normal
  6-yard iron gaps were a fault. The too-close test is now proportional to the shorter club's
  carry, with an absolute floor.
- **"Over 20 yards is a hole"** flagged a 110 mph player's driver-to-3-wood gap, which is normal and
  unfillable. That threshold is proportional now too.
- **Wedge carries** used a flat 2.55 yards per degree of loft, which is right for a 150-yard 7-iron
  and wrong for everyone else; it now scales with the player.

A fourth was subtler: the bag builder dropped a 5-wood because it sat 2° from the 4-iron, but loft
alone does not decide distance — the wood's shaft is inches longer and it carries 27 yards further.
Loft proximity now only rules out *hybrids*, which really do share an iron's shaft length.

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

## The lie-angle bench

`js/lie-bench.js` is an interactive on the fitting-information page. It exists for one lesson that
almost no fitting article gets right: as loft rises, the **face error** from a given lie error grows
enormously while the **yards offline** barely move. Both meters are on screen together, so dragging
the loft slider shows one running away from the other — face 0.69° → 3.46° across the bag at 2° of
error, while the miss stays between 5.0 and 6.3 yards.

Two rules kept it honest:

- **Every number comes from `GolfFit.lieImpact()`**, so the picture can never disagree with the
  engine.
- **Only the picture is exaggerated, and it says so.** Two degrees of lie lifts the toe of a real
  head about a millimetre — drawn true to scale you would see nothing. The club tilt is shown ×5
  and the face indicator ×6, both labelled on the graphic.

The result panel splits the miss into the part from the **start line** (geometry, solid) and the
part from the **curve** (modelled, labelled as such) on a true-to-scale yard ruler, rather than
drawing a fake flight path. The ruler rescales itself rather than letting the marker run off the
end — four degrees on a lob wedge is over eleven yards.

It appears twice: as a section on the fitting-information page, and inside the results seeded with
the player's own code — needing `U2` means a standard head sits 2° flat for you, so the bench opens
showing exactly that, heel in the air.

## Results layout

The results lead with what the reader acts on — the verdict, the warnings, the audit, and the
bench — and fold the reference detail into `<details>` sections that open on demand: the per-club
recommendations, the carry gaps and the build sheet. A `beforeprint` handler opens them all, since
a collapsed section that vanishes from a printout is a trap.

## Tests

```bash
node tests/run.js
```

No framework, no config, no dependencies — `tests/harness.js` is eighty lines and the engine is
pure functions, so that is all it needs. Roughly **29,000 generated cases** in under a second.

| File | Covers |
|---|---|
| `fit.test.js` | Bay Scale anchors and structure, club length, speed estimation, sensitivity, handedness, junior and women's paths, shaft shortlist, plus a sweep over the whole `fit()` surface |
| `audit.test.js` | Individual findings, ordering, the replace-vs-repair ceiling, budget planning, gapping, plus a sweep asserting internal consistency for every combination of current specs |
| `regressions.test.js` | Bugs that actually shipped and were caught in review. Each stays so it cannot come back quietly. |

Two ideas do most of the work:

- **Sweeps** generate thousands of inputs and assert invariants rather than exact values — the
  carry ladder never rises, a "quick win" is never expensive, superseded work never counts toward a
  total, the replace threshold fires at exactly the benchmark and not a pound either side.
- **`noPlaceholders()`** greps every user-facing string for `undefined`, `NaN` and
  `[object Object]`. That single assertion caught a live bug the first time it ran: a flag left
  over from an earlier scale was printing "undefined (4° Flat)" to real users.

The pre-commit hook runs the suite and refuses the commit if it fails. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## Type and palette

**Archivo**, self-hosted in `fonts/`, one variable file per style (35KB roman, 39KB italic,
latin subset, 400–700). No CDN and no build step — the files are in the repo and the page still
opens from disk.

It was chosen for its **figures**, not its headlines. Almost everything on this site is a number
— `37"`, `63.0°`, `+1.3°`, `145 yd`, `#3EB8BF` — so unambiguous digits and real tabular
figures matter more than a characterful lowercase. Verified rather than assumed: with
`tabular-nums` on, all ten digits measure exactly the same width, and without it they take seven
different widths, so the font genuinely ships both figure sets. Tabular is the default for the
body, tables and controls; prose opts back out, where proportional figures read better
mid-sentence.

**The palette is the fitting scale.** The eleven Bay Scale codes are CSS variables
(`--scale-rust` through `--scale-violet`), and a 3px gradient of all eleven sits inside the
sticky header on every page — inside, so it does not scroll away, which makes it the one element
present on every screen of the site. It is also the one palette nobody can copy without copying
the scale underneath it.

Two things fell out of writing it down. `--green` was already *exactly* Fairway, the LEVEL code;
it had simply never been said. And `--brass` was an unrelated `#d9b168`, now Gold (`#EFBB50`,
the F1 code), so both accents are derived rather than chosen.

Colour semantics survive intact: the scale is for identity surfaces — rules, marks, section
heads — while green, amber and red stay reserved for verdicts (`.note.good`, `.note.warn`).

## Page structure

The results page used to be sixteen sibling panels, all the same border, all the same heading, so
nothing looked more important than anything else. It is now three tiers:

1. **The verdict** — the only panel with a shadow, wearing the player's own interpolated colour
   along its top edge via `--fit-colour`.
2. **What to do about it** — the caveats, the confidence report, the costed audit and the lie
   bench. Flat panels, so the verdict keeps the emphasis.
3. **The detail** — everything else, collapsed into four `details.result-group` rows that read as
   an index rather than as more page.

`tierHead(label, note)` draws the rules between them.

Icons survive only on the structural blocks, drawn from one `ICONS` vocabulary. The eight spec
cards (`card()`, class `.panel .card .spec`) dropped theirs — "Driver" was never ambiguous, and
eight more decorated squares only added noise to a long page.

Colour is load-bearing and single-meaning: a plain `.note` is neutral small print, `.note.good` is
a result in your favour, `.note.warn` is a caution. Green had been doing the first two jobs at
once.

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
`audit(fitResult, currentSpecs, budget)` is likewise pure and testable on its own. Add a test
alongside any rule change — the sweeps will usually catch a structural mistake for free, but a
changed threshold or a reworded recommendation needs its own case.

## Legal

Independent and unaffiliated with any equipment manufacturer. The Bay Scale is our own fitting
scale. Brand and product names that appear inside recommendations — wedge grinds, for example —
are the trademarks of their respective owners and are named only to help a reader find comparable
products.
