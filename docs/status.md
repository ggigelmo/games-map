# Project status

What's done, what's left, and the decisions that shaped this. For the
concrete technical pitfalls, see [findings.md](findings.md).

## Constraints that shape everything

- iPhone, **no Mac**, and **no paying for the Apple Developer Program**.
- A deployed website is enough; no native app needed.
- **CarPlay ruled out**: it requires an entitlement Apple grants sparingly,
  and on top of that Apple draws the interface with its own templates, so the
  aesthetic — which is the whole point of the project — wouldn't show.

## Decisions that shape the project

**Google Maps' SDK doesn't cut it.** Its restyling only lets you change the
colors of predefined categories: no custom fonts, no textures, no sprites.
**MapLibre** is used instead, where the style is your own JSON with full
control. That decision is what makes the whole project possible.

**PWA instead of a native app.** Drops React, Expo, the Mac, and the Apple
fee. Added to the iPhone home screen it launches fullscreen and behaves like
an app.

**No UI framework.** MapLibre is imperative and the HUD is a handful of
panels. Plain TypeScript avoids React's learning curve entirely.

**Cloudflare Workers, not Pages.** Pages is in maintenance mode. Workers was
chosen expecting a proxy would be needed to hide the API key… and it turned
out not to be (see below). The choice is still the right one, but the
original reason no longer applies.

**No proxy, no keys in the code.** Stadia Maps authenticates by domain,
validating the headers only the browser sends. This was discovered by reading
their docs *and testing it against the API*, and it saved an entire
subsystem.

## Done

| Phase | What | Verified |
|---|---|---|
| 0 | Cyberpunk style (35 layers), HUD, PWA icons, DIAG panel | Browser |
| 0b | Whether a PWA on iOS holds up: GPS and permissions in standalone mode | **Real iPhone** |
| 0.5 | Touch controls: the map didn't respond to touch or follow the user | Browser |
| — | POI icons by business type (130 categories) | Browser |
| — | Compass: the map turns with you even while stopped | Partial |
| 2 | Search for a destination and draw a route | **Production** |
| 3a | Navigation mode, GO/STOP, maneuver card, screen wake lock | Browser |
| 3b | Automatic reroute on leaving the route | Browser + real API |

### The firewall: phase 0b

This was the only risk capable of invalidating the whole approach, which is
why it was tested before anything else. Measured on a real iPhone with the
app **added to the home screen**, which is where the risk lived:

| Reading | Result |
|---|---|
| Accuracy | ±5 to ±30 m |
| Interval between fixes | < 5 s |
| Location permission in standalone | Granted |

There's a historical iOS bug where, in installed PWAs, the permission dialog
never appears and the call **doesn't time out either**. It didn't show up.
The PWA path holds.

## What's left

**Voice** (the missing piece of phase 3b). Valhalla already returns three
instruction variants written out — early alert, right before, and after —
so the work isn't *what* to say but *when*. Two things to keep in mind: on
iOS the first `speak()` must come from a user gesture (the **GO** button is
the natural place), and `verbal_multi_cue: true` means the instruction
already chains in the next maneuver, so adding anything would duplicate it.

**A custom map typeface.** Labels currently render in Noto Sans: MapLibre
needs packaged SDF glyphs, not TTF, and the tile provider only serves that
font. They need to be generated with MapLibre Font Maker and hosted. The HUD
already uses the game's typeface, because it's HTML and doesn't go through
that path ([findings.md](findings.md) §3).

**Viewfinder polish.** Smoothing position between readings and an accuracy
ring.

**Offline maps.** A regional extract in `.pmtiles` with Protomaps. In areas
with poor coverage this matters more than it seems.

## What hasn't been verified

Worth keeping in mind before trusting anything:

- **The navigation camera** (zoom, pitch, marker offset) hasn't been seen
  working. Verifying camera animations requires frames the automated test
  environment doesn't provide.
- **The route line after a reroute** either: same cause.
- **Nothing about actual driving.** The tests use synthetic traces generated
  over a real polyline, which is as close as you can get without a car.

### Numbers chosen by eye

They have the right shape, but the constants will need tuning by using it:

| Constant | Where | What happens if it's wrong |
|---|---|---|
| 32 px drag intent | `map/map.ts` | Too low: following turns off with a brush. Too high: hard to release the camera |
| `max(35, accuracy × 2.5)` | `nav/off-route.ts` | Too low: OFF ROUTE while doing fine. Too high: slow to notice |
| 15 s between reroutes | `nav/session.ts` | Too low: extra requests. Too high: slow to correct |
| 1.5 m/s to trust the GPS | `services/heading.ts` | Decides when the compass leads and when the GPS does |

## Structural risks

**No background navigation.** A PWA can't track your position with the
screen off. For driving navigation that's acceptable, since the screen stays
on, but it's a limit of the approach, not a bug that can be fixed.

**GPS accuracy in the city.** Urban canyons degrade the signal. That's why
the deviation threshold is tied to each reading's accuracy instead of being
a fixed number.

**Stadia's free, non-commercial plan.** Enough for personal use (200,000
credits/month ≈ 10,000 searches). If that ever stopped being enough, all
three server-side pieces are open source and can be self-hosted without
touching the app.
