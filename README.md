# The Fitting Bay

A static golf club fitting calculator. Plain HTML, CSS and JavaScript — no build step, no
dependencies, no back end. Open `index.html` in a browser and it works.

```
golffitting/
├── index.html              the whole site (wizard, chart, reference library)
├── css/styles.css
├── js/fitting-engine.js    all fitting logic, pure functions, no DOM
├── js/app.js               wizard UI, SVG chart rendering, results rendering
└── .claude/launch.json     dev-server config for the preview pane
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

- **Lie angle** as a PING-style colour code, plus per-club lie in degrees
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

## Provenance

### The lie/length chart

`BLACK_LOWER` in `js/fitting-engine.js` is the heart of the tool. It was derived by measuring the
published PING Colour Code Chart artwork directly:

1. The chart's axis tick marks were located in the source image to calibrate pixels → inches
   (269.7 px per inch of wrist-to-floor; 126.6 px per inch of height).
2. Every pixel in the plot area was classified against the ten band colours, and the band
   boundaries were read off for each of the twenty height columns from 5'0" to 6'7".
3. That produced a key structural fact: **every colour band is exactly 1" of wrist-to-floor tall**.
   So the entire 2-D chart collapses to a single curve — the wrist-to-floor value at the lower edge
   of the Black (standard) band, as a function of height. That curve is `BLACK_LOWER`.
4. The colour is then just `floor(wristToFloor − blackLower(height))`, clamped to Gold (−4) …
   Maroon (+5).

The curve has three visible regimes, which match the artwork: a steep left section (roughly
0.47" of wrist-to-floor per inch of height), a nearly flat section across the standard-length
heights of 5'7"–6'0", then steep again (roughly 0.43"/inch).

**Validation.** Three worked examples are published independently of the chart image. All three
reproduce exactly:

| Height | Wrist-to-floor | Published result | Engine result |
|---|---|---|---|
| 5'10" | 34" | Black (standard) | Black ✓ |
| 5'6" | 32" | Red (1° flat) | Red ✓ |
| 6'2" | 36.5" | Green (2° upright) | Green ✓ |

The length bands are transcribed directly from the chart's header row, including the metric
equivalents (151–155, 156–160, 161–168, 169–183, 184–191, 192–196, 197–201 cm).

Outside 5'0"–6'7" the curve is linearly extrapolated and the result is flagged in the UI as being
off the published chart.

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
and grind, putter length and toe hang, and ball compression bands are the consensus of the
published fitting guides linked in the Sources section of the page.

## Modifying it

`js/fitting-engine.js` is deliberately free of DOM code, so you can `require()` it in Node for
testing:

```js
global.window = {};
require('./js/fitting-engine.js');
const r = window.GolfFit.fit({ heightIn: 70, wtfIn: 34, skill: 'mid', ironCarry: 150, /* ... */ });
console.log(r.lie.code.name, r.length.adj, r.shafts.ironFlex);
```

Each recommendation lives in its own small function (`staticLie`, `shaftFit`, `driverFit`,
`wedgeFit`, `gripFit`, `putterFit`, `ballFit`, `setMakeup`), so a rule change is a local edit.

## Legal

Independent and unaffiliated. PING and the colour code system are trademarks of Karsten
Manufacturing Corporation; Takomo, Titleist/Vokey and all other brand names referenced are the
trademarks of their respective owners, used for identification only. The chart here is a
reconstruction for reference, not an official tool of any manufacturer.
