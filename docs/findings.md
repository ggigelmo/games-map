# Findings

Pitfalls found during development. They're here because each one explains
why some part of the code is the way it is, and because they're exactly the
kind of thing that breaks again if someone "cleans up" the code without
knowing about it.

## 1. Cyan light tints buildings RED, and that's on purpose

**Discovery:** with `light.color = '#00f0ff'` (cyan), the `fill-extrusion`
buildings came out maroon, even though `fill-extrusion-color` was set to dark
blues (`#090d1a` to `#4f657a`) and the style validated without a single
error.

**Cause:** `fill-extrusion`'s shader clamps color from below with
`0.3 * (1 - lightColor)`. With cyan light `(0, 1, 1)`, that `1 - color`
gives `(1, 0, 0)`, so the **red** channel gets a minimum of 0.3 while green
and blue stay at zero. Hence the maroon. The effect is two-toned: shaded
faces in red, lit faces tinted cyan — something a flat color doesn't
reproduce.

**Status: it's a decision, not a bug.** It was discovered while investigating
why the buildings didn't come out blue, the result was liked, and it was
kept. `style/build.mjs`'s `light` carries a comment warning that the cyan
light is deliberate.

**If blue buildings are ever wanted:** set the light to `#ffffff`. The
`fill-extrusion-color` colors are already blue, so they show up on their
own. What does **not** work is trying to tint them by changing the light's
color: it gives the complementary color instead.

## 2. MapLibre requires the sprite URL to be ABSOLUTE

Unlike tile and glyph URLs, which it accepts as relative, a
`sprite: '/sprites/night-city'` is rejected with:

> Invalid sprite URL "/sprites/night-city", must be absolute.

Putting the domain in the JSON would tie it to the environment and it
would stop working on localhost and Netlify at the same time. That's why
the style keeps a root-relative path and `resolveSprite()` in
`app/src/main.ts` resolves it against `location.origin` before handing the
style to the map. This is applied the same way on startup and on HMR.

## 3. MapLibre doesn't consume TTF: it needs SDF glyphs

Map fonts aren't CSS. MapLibre requests glyphs as signed distance fields
packaged into `.pbf` files per Unicode range, from the `glyphs` property's
URL.

OpenFreeMap only serves **Noto Sans** (checked: `Rajdhani Bold`,
`Chakra Petch Bold`, `Orbitron Bold`, `Share Tech Mono Regular`, and
`Roboto Mono Regular` all 404). For a custom typeface, glyphs need to be
generated with [MapLibre Font Maker](https://maplibre.org/font-maker/) (a
web app, 256 files per font), the folder hosted somewhere served over HTTP,
and `glyphs` pointed there.

**Important:** this only affects labels **inside** the map. The HUD is
plain HTML/CSS, so Rajdhani and Share Tech Mono have come in through Google
Fonts from day one there. That's why the app already looks Cyberpunk even
though the map's own labels are still in Noto Sans.

## 4. MapLibre measures the container exactly once

`new maplibregl.Map()` reads the container's size when it's constructed. If
it measures 0 at that point (backgrounded tab, PWA cold start, screen
rotation, keyboard appearing), the canvas gets stuck at its 400x300
emergency size and never paints again.

Hence the `ResizeObserver` in `app/src/map/map.ts`. It's not preventive
defense: the failure was reproduced with the container at 0x0.

## 5. MapLibre won't load the style if `requestAnimationFrame` never fires

Loading the style is deferred to a frame. In a tab with
`document.hidden === true`, rAF never fires (measured: 0 frames in 2 s,
while `setTimeout` kept running at ~1/s), so the style gets stuck halfway:
the `Map` object exists, but `style.stylesheet` never gets assigned,
`getStyle()` returns `null`, and **no error event is emitted**.

Symptom: a black map, zero tile requests, a clean console.

To verify this in an environment like that, what works is letting the page
load and waiting passively. What does **not** work is replacing
`requestAnimationFrame` with a `MessageChannel` pump: MapLibre reschedules a
frame inside every frame, the `postMessage` feeds back on itself, and it
freezes the renderer. Calling `triggerRepaint()` in a loop also ends up
jamming it.

None of this affects the app on a real phone; it only matters for
automating screenshots.

## 6. iOS risks still to be measured on the device

The `DIAG` panel exists to answer these with data, not assumptions:

- **Precise Location disabled for Safari** -> `watchPosition` returns 3-9 km
  accuracy and only refreshes every ~15 min, with no error raised at all.
  Detected via `accuracy` and the interval between fixes.
- **Location permission in standalone mode** -> there's a historical bug
  where the dialog never appears and the call **never times out either**.
  That's why the panel carries its own 12 s timer instead of relying on the
  API's.
- **Screen Wake Lock** -> supported in Safari on iOS since 16.4, but was
  broken inside installed PWAs until **iOS 18.4**. Without it, the screen
  turns off mid-trip.
- **Speech synthesis** -> iOS requires the first `speak()` to come from a
  user gesture. That's why the voice test is a button and not automatic.

## 7. The icons are original, not the game's own

The glyphs in `assets/lib/poi-icons.mjs` are drawn in Cyberpunk 2077's
visual language (cut-corner plate, cyan border, thick glyph with a glow),
but they're original. The game's own assets are the property of CD Projekt
Red and aren't reproduced here.

## 8. A lockfile generated on Windows breaks the Linux build

**Symptom:** Cloudflare's build installed fine and `tsc` passed, but
`vite build` died with:

> Cannot find module @rollup/rollup-linux-x64-gnu

**Cause:** rollup and esbuild ship their native binaries as
`optionalDependencies`, one per platform. `package-lock.json` was generated
on Windows **on top of a `node_modules` that already existed** from a
previous, workspace-less install, so npm only recorded the variants it
actually had installed: 2 for rollup, both `win32`. All 52 of esbuild's
were there, which made the failure even more confusing. This is
npm/cli#4828.

**Fix:** regenerate the lockfile clean, which is exactly what the error
message says.

```bash
rm -rf node_modules app/node_modules package-lock.json
npm install
```

A good lockfile has ~25 `@rollup/rollup-*` variants, including
`linux-x64-gnu`, and hoists dependencies to the root's `node_modules/`
instead of leaving them nested in `app/node_modules/`.

**How to check before pushing:**

```bash
node -e "const k=Object.keys(require('./package-lock.json').packages); \
console.log(k.filter(x=>x.includes('@rollup/rollup-')).length)"
```

If it prints 2, the lockfile is broken. If it prints ~25, it's fine.

## 9. `display: flex` overrides the `hidden` attribute

**Symptom:** the search overlay showed up open right after the app loaded,
and the route card was visible without any route ever having been drawn,
even though the code did `el.hidden = true` and reading `el.hidden` returned
`true`.

**Cause:** `hidden` isn't DOM magic. The browser implements it with a
`[hidden] { display: none }` rule in **its own** stylesheet, which has lower
priority than any rule of ours. As soon as `.search` and `.route-card`
declared `display: flex`, `hidden` stopped having any visual effect.

The treacherous part is that the property still reports `true`, so checking
it from the console doesn't catch it. It only shows up by looking at the
screen, or by asking for `getComputedStyle(el).display`.

**Fix**, one line in `app/src/style.css`, which closes off the whole
category instead of patching the two individual cases:

```css
[hidden] { display: none !important; }
```

## 10. The compass: two different APIs and one inverted rotation direction

The `deviceorientation` event doesn't give a compass heading directly, and
on iOS it goes through a different path than everywhere else:

- **iOS** exposes `event.webkitCompassHeading`: it's already a heading
  relative to north, clockwise. Used as-is.
- **The standard** gives `event.alpha`, which measures **counter**clockwise.
  It has to be inverted: `(360 - alpha) % 360`. Without that the map turns
  the wrong way, which is a subtle failure because at a glance it looks like
  it "works".
- `alpha` is only useful if `event.absolute` is true; otherwise the origin
  is arbitrary and the value doesn't mean anything.

On top of that, **iOS requires requesting permission with
`DeviceOrientationEvent.requestPermission()` from a user gesture**. Calling
it outside a click handler throws instead of prompting. That's why
permission is granted from a button on the `DIAG` panel instead of on app
startup.

Two filters that aren't optional: a **dead band** of a couple of degrees,
because magnetometer noise makes the map shake while the phone is sitting
still on a table; and a **rate limit**, because the event fires dozens of
times a second and turning the camera on every one of them leaves it
shaking.

The rule for who's in charge (GPS while moving, compass while stopped)
lives in `app/src/services/heading.ts` as pure, tested logic, because
actually verifying it would require moving and turning a phone around.

## 11. Using `0` as a "never" sentinel collides with a legitimate timestamp

The brake between reroutes stored the instant of the last attempt in
`lastRerouteAt`, and used `0` to mean "none yet":

```ts
if (this.lastRerouteAt !== 0 && now - this.lastRerouteAt < MIN_REROUTE_MS) return;
```

But **zero is a perfectly valid timestamp**: it's exactly what
`performance.now()` returns right after startup. When the first reroute
landed on that instant, the condition read it as "I've never rerouted" and
the brake stopped existing: one API request per GPS reading.

This showed up with fake clocks in a test, which start at 0 by definition,
and in production it would have appeared only occasionally, on the
session's first route. The fix is making the "never" value impossible to
confuse with an actual time:

```ts
private lastRerouteAt = -Infinity;
// and the condition stays a single comparison
if (now - this.lastRerouteAt < MIN_REROUTE_MS) return;
```
