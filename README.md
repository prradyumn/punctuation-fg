# Letters

Fix the punctuation and capitalisation of short sentences by stamping them, then post
each completed level. One screen, 16:9, no navigation.

Plain HTML, CSS and JavaScript. No build step, no bundler, no framework, no npm, no
dependencies.

During levelling review, a temporary button in the bottom-right jumps through the sheet
in order: Tutorial → Level 1 → … → Final Letter → Tutorial. `LettersGame.nextLevel()`
exposes the same action for QA; remove `#temp-next-level` after progression sign-off.

```
index.html     markup + the inlined letter-card SVG   <- the entry point
styles.css     layout in %, keyframes, reduced-motion block
game.js        1. TIMING  2. CONTENT  3. the nine-state machine
assets/        art (~2.1 MB), plus sfx/ (CC0 sounds + their licence)
test.py        headless acceptance suite (75 checks)
README.md
_source/       the original Figma exports + manifest — reference only,
               nothing in the game loads from here
```

## Running it

**Double-click `index.html`** — it runs from `file://` with no server and no install.

**Or hit "Go Live"** in VS Code. `index.html` sits at the root of this folder, so Live
Server opens the game straight away rather than a directory listing. Both routes are
tested.

> If you had Live Server running while the folder was reorganised, its old tab points at
> a path that no longer exists. Stop Live Server, start it again, and hard-refresh
> (**Ctrl+Shift+R**). If any game file genuinely fails to load, the game now says so on
> screen and names the files instead of rendering a silently broken scene.

The `file://` requirement is what rules out `fetch()` and ES modules anywhere: content is
a plain `const` loaded by a `<script>` tag, and motion is `transform`/`opacity` only.

---

## The progression

Eight numbered levels plus a tutorial — 24 letters, 41 scored repairs. Built from the
"Punctuation Puzzle — Gameplay" sheet.

| Level | Focus | Letters | Tray |
|---|---|---|---|
| **Practice** (tutorial) | select, drag and place | 1 | `.` — the sheet says *"only the full-stop stamp is available"* |
| 1 | capital + full stop | 1A 1B 1C | `a→A` `.` |
| 2 | statement vs question | 2A 2B 2C | `.` `?` |
| 3 | statement vs exclamation | 3A 3B 3C | `.` `!` |
| 4 | choose among all end marks | 4A 4B 4C **4D** | `.` `?` `!` |
| 5 | comma in a list | 5A 5B 5C | `,` `.` |
| 6 | comma changes meaning / direct address | 6A 6B 6C | `a→A` `,` |
| 7 | mixed: capital + end punctuation | 7A 7B 7C | `a→A` `.` `?` `!` |
| 8 | **Final Letter** — everything together | 8 | `a→A` `.` `,` `?` `!` |

4D and 8 are multi-sentence: three and four sentences on one card, each with its own
independent targets.

### Authoring a letter

Sentences use a marker syntax so they stay readable; `parseLetter()` turns them into
targets:

```js
letter('1A', '^i am coming to visit you [.]', ['caps', 'period'], {
  read: 'I am coming to visit you.', prosody: 'statement',
  say: lines({ e2:   'Look closely. Where does the sentence begin or end?',
               idle: 'Look at the beginning and end of the sentence.' })
})
```

| marker | meaning |
|---|---|
| `^word` | capitalise that word's first letter — a target |
| `[.]` `[,]` `[?]` `[!]` | a slot needing that mark — a target |
| `//` | sentence break, for multi-sentence letters |
| anything else | literal text, never a target |

`test.py` reconstructs every letter from its targets and asserts it equals `read`, so a
mistyped marker fails the suite rather than shipping.

---

## How a repair works

**Targets are independent and solved in any order.** Each owns its error counter.

- **Drag** (primary, as the tutorial teaches): press a stamp, drag it, and it magnetically
  snaps to the nearest target within 96 design px. Release to stamp. A deliberate drop
  outside a target is recorded against the nearest unresolved target and cannot solve it;
  a browser-cancelled gesture is never counted as a learner mistake.

  Three things make this survive real devices, and each one was a bug first:
  `.stamp` and `.hit` set **`touch-action: none`**, or the browser claims the gesture as
  a scroll and fires `pointercancel` the moment a finger moves; `pointermove`/`pointerup`
  are bound to **`window`**, not the button, so the drag does not die when the pointer
  leaves a 112px stamp; and **`setPointerCapture` is wrapped in try/catch**, because when
  it threw, the handler aborted before binding any listener and dragging became
  impossible with nothing logged. The suite drags with mouse, touch and pen, with capture
  deliberately broken, and drives one genuine finger drag through the browser's real
  input pipeline asserting `pointercancel` never fires.

  A **dragged stamp presses where you left it.** `stStamp` used to always replay
  rise → travel-arc → press from the tray, so after a drag the stamp flew home and came
  back on its own — a second, unasked-for journey that made the mark look like it appeared
  by itself. The drag and the press now share one `hoverPose()`, so the hand-off is
  seamless and only a *tapped* stamp travels.

  A fourth: the **idle bob must stop while a stamp is held**. `bob` animates `transform`,
  and a running CSS animation outranks inline styles, so every transform the drag wrote
  was silently discarded — the stamp bobbed in the tray while the pointer moved away, with
  no clue where the pad was. It survived because `onStampDown` removed the class and then
  `arm()` → `refreshStampState()` immediately put it back. The suite now asserts the
  stamp's **rendered** position tracks the pointer, not just its inline style.
- **Tap**: tap a stamp to arm it, then tap a target. Tapping a different stamp switches
  to it; tapping the armed one again puts it down.
- **Keyboard**: ←/→ select a stamp · Enter/Space picks it up · ←/→ then move between
  unsolved targets · Enter/Space places · Esc cancels.

Drop zones are 74 × 96 design px — far larger than the glyph, sized for children's touch.
The `#targets` layer spans the whole stage, so it never takes pointer events itself —
only `#targets.live .hit` does. Making the container clickable swallowed every click
outside a zone, including the tray, which left tapping completely dead.

### A wrong stamp never costs anything

No lives, no timer, no score decay, and the turn is not consumed. Escalation is per
target, as the sheet specifies:

| miss | what happens |
|---|---|
| 1 | the stamp rocks in place, glows red once, travels home; soft boop; a gentle line |
| 2 | + the unresolved sentence pulses, the target glows |
| 3 | + stronger glow, a **faint ghost impression** of the correct mark, and the right stamp lifts once in the tray |

Tier state is derived from `target.errors` inside `buildHits()`, never stored on the
element — drop zones are rebuilt after every press, so anything held only in a CSS class
would be wiped the moment they were rebuilt. That bug shipped once.

### Inactivity

After **9 seconds** of no interaction the coach panel offers the level's `idle` line, the unresolved
sentence pulses and the tray bounces — but the correct stamp is never singled out, which
the sheet is explicit about. Only in the tutorial does the nudge point at the exact spot.

Stall a second time on the same sentence and the panel switches to a **random general
tip** drawn from a shuffled bag (`TIPS` in `game.js`), refilled only when empty — so the
advice never repeats itself back to back, and none of it gives away which stamp is right.

---

## Progress

The HUD numeral is the **current level out of eight**; the marks beside it are the
**letters within that level** (three, or four for Level 4). The sheet settles what was
previously an open question: *"1/3 postal ticks fill for Level 1"*, *"progress header
advances to Level 2"*, and Level 4's *"1/4 fills"*.

A mark fills after its letter is completed. Intermediate letters advance without entering
the mailbag. On the final letter in each level, **READY TO POST** appears, the paper folds,
the envelope closes, and the completed level is posted to the pile at the bottom right.
The tutorial bypasses this postal flow entirely.

Every correct target also updates `state.repairsSolved` / `state.repairsTotal`, the body
`data-repairs-*` attributes, and a `repair:progress` event. These logic hooks support the
three internal steps in 4D, the two comma steps in 5C, and the eight Final Letter steps;
their distinct visual indicators can be added independently.

**The tutorial scores nothing**: no mark, no envelope, no ceremony, and **no progress
pill at all** — it is `display:none` until Level 1. It used to read `01/8` (which made a
deliberately single-stamp tutorial look like "Level 1 has one option"), then "Practice",
but that was still a bar drawing the eye to a counter that was not counting. Every real level from 1 onward
offers the tray its row in the sheet specifies (two stamps through Levels 1-3, three in
Level 4, five in the final letter); `test.py` asserts those tray sizes.

---

## The sentence

Figma sets the type at **54.164px** in a **108px** (two-line) box. Two problems with
taking that literally: Josefin Sans has a small x-height so it reads smaller than it
measures, and **the final letter needs three lines — it was overflowing the box by 54px**
and spilling off the paper. Nothing caught it, because every earlier level happens to be
short.

The type is now **68px** and the box spans most of the card (`906 × 530`, centred on it),
with the text flex-centred inside, so a letter of any length sits well on the paper. The
punctuation sockets are sized in `em` and the word spacing is `.26em`, so both track the
type size instead of drifting from it. `test.py` measures every one of the 24 letters
against the box and fails on any overflow.

## The stamped mark

A correction has to be **visible as the learner's own work**, so it is inked in blue
(`--stamp-ink #1B4FA8`) rather than the black the sentence is printed in, set a little
larger and heavier, and tilted a degree or two off the line the way a real stamp lands.
It keeps that treatment for the rest of the letter instead of blending back into the
text. Punctuation gets the bigger bump (`1.22em`) because a full stop is tiny and is the
hardest thing on the page to notice.

The impression itself is three things landing together: the glyph is **squashed by the
pad and springs back** (`1.55 → 0.88 → 1.06 → 1`, blurred at the moment of contact), a
**pressure ring** pushes outward from the point of impact, and an **ink blot** soaks in
underneath and fades. The tilt is derived from the target's id, so it is stable — a real
stamp is never square, but it must not jitter when the drop zones are rebuilt.

The tier-3 ghost hint previews the same blue, so the hint and the answer read as the
same ink.

## The fold

The card is one `<symbol>`, instanced by every copy of it. `#card-flat` is a single
un-sliced instance and is what is on screen at rest, so no seam between slices can show.
`#card-fold` is the folding version: **three HTML bands**, each showing a third of that
same artwork.

The bands are HTML rather than SVG groups for a specific reason: **browsers do not honour
`transform-style: preserve-3d` on SVG elements**, so an SVG `<g>` rotated in X is
flattened to a vertical squash. The paper looked sliced off rather than folded over. In
HTML, with a perspective on the parent, the band genuinely tilts away and foreshortens.

**The perspective is `calc(820 * var(--u))`, not `820px`.** As a fixed pixel value it
stayed 820 while the card scaled with the stage, so the fold was about twice as
dimensional in a 960px window as in a 1920px one. `test.py` halves the viewport and
asserts the perspective halves with it.

Seven things make it read as paper rather than a panel sliding:

- **A short perspective.** At 1500px over a 1150px card the tilt barely foreshortens.
- **A shadow cast onto the sheet below.** `.cast` on the middle band comes up as each
  third folds over it — this is what sells it more than anything else.
- **Shading that peaks edge-on** and settles to the tone of a turned-over face.
- **A lit crease.** `.crease` is a bright rim with a dark hairline under it, not the flat
  dark gradient it used to be — a plain dark line reads as printed, not as an edge.
- **Paper thickness.** `.thick` is a sliver of stock on the leading edge, brightest at
  90° and gone once the face lies flat again.
- **Time spent between 30° and 150°**, where the perspective is actually visible, and a
  small overshoot past flat before settling — the way paper springs when you crease it.
- **A landing that is not level.** The bottom third stops a couple of degrees shy of
  closed and the top third comes over further and sits proud of it, then the whole stack
  drops the last millimetre and stops dead (`settleThump`). The card's shadow throws long
  while it is being worked (`.lift`) and pulls in tight once it is down (`.land`).

The reverse of each band is bare cream: the artwork layer is `backface-visibility: hidden`
over a paper-coloured band, so once a third turns past 90° you see the back of the paper.
Both faces carry a fractal-noise grain at 8% so the card is not a flat vector fill.

`unfoldBand()` runs the whole thing backwards for the entry, and it is a separate
function rather than a reversed playback: the crease and the cast shadow have to die away
at the *end* of the move, not the start, and the settle overshoots the other way.

---

## The envelope

`envelope.png` is a single flat picture of a *closed* envelope. The best it could ever do
was be crossfaded to — and that is exactly what the seal used to do: a 160 ms dissolve
from a 1153px-wide folded strip to a 484px-wide photograph. A dissolve was doing the work
the animation should have been doing, and it was the main reason the fold looked cheap.

A pocket needs a **back** and a **front** with the letter between them, so the envelope is
drawn instead:

| piece | where | what it is |
|---|---|---|
| `#env-under` | **before** `#card-layer` | airmail border, the cream back panel, and `#env-inside` — the darker pocket interior you see while it is open |
| `#env-over` | **after** `#card-layer` | the front panel, whose top edge at `y=330` *is* the mouth, plus the seams and the postage stamp |
| `#env-flap` | inside `#env-over` | hinged on the top edge, swinging on a real `rotateX` under `perspective` |

There is **no `z-index` anywhere in it**. Paint order is document order, which both makes
the pocket work and keeps the envelope under the tray exactly where the old `<img>` was.
`test.py` asserts that ordering directly.

The insertion geometry is derived, never typed: the folded letter is the *middle* third of
`#card-layer`, which is centred on the card's own centre, so scaling the layer about its
centre keeps the strip put and only a `y` offset is left to animate. `envGeom()` returns
the scale, the height just clear of the mouth, and the height well inside it.

`#env-inside` fades out as the flap closes — a shut envelope has no pocket to look into.

### The strokes

Three weights, held in CSS custom properties so they stay in step:

| token | used for |
|---|---|
| `--env-edge` `#5A2A08` @9 | the dark outer border |
| `--env-line` `#A9611F` @4.5 | the flap crease |
| `--env-body` `rgba(140,58,0,.45)` @4 | the cream body's border |
| `--env-seam` `rgba(140,58,0,.22)` @4 | the folded side flaps |

Three things were wrong and are fixed:

- **The front panel is fill-only.** It used to be stroked all the way round,
  so its top edge — the mouth — drew a hard line straight across the middle of a
  *closed* envelope, where a real one has none.
- **One border for the whole body,** and it lives in `#env-over`, because in `#env-under`
  the front panel's fill covers it. Outlining the panel separately from the body left a
  visible step half way down each side where one stroke handed over to the other.
- **The flap's V is a soft shadow plus a light crease,** not a single hard outline that was
  twice the weight of everything else on the envelope.

The lit cut edge of the paper at the mouth is in `#env-mouth`, which fades with
`#env-inside` — on a shut envelope it is just another line across the middle.

`test.py` asserts the front panel has no stroke, that exactly one body border exists and
sits where the fill cannot cover it, and then screenshots a closed envelope and samples a
pixel column clear of the flap and both seams: the luminance range across the mouth must
be flat.

`envelope.png` is still used for the inbox and mailbag piles, where it is under 200px wide
and none of this would read.

## The nine states

The whole flow is the `STATES` table at the bottom of `game.js`.

```
idle → deal → open → read → await-input → stamp ─┬→ await-input   (more targets, or a miss)
                                                  └→ seal → post ─┬→ idle
                                                                  └→ finale
```

| # | State | ms @ SPEED 1 |
|---|---|---|
| 1 | `idle` — empty desk, tray, HUD, inbox | — |
| 2 | `deal` — a closed envelope arcs in from the inbox | 700 |
| 3 | `open` — flap lifts, the folded letter is drawn out, grows, unfolds | 1380 |
| 4 | `read` — text appears uncorrected, 25 ms per-word stagger | 350 |
| 5 | `await-input` — stamps idle-bob; waits for the player | — |
| 6 | `stamp` — press, ink bloom, sparkle, return (travel only if tapped) | 450 |
| 7 | `seal` — feedback; on a level end, fold, envelope and apply READY TO POST | 900 |
| 8 | `post` — advance progress; on a level end, fly to the mailbag | 600 |
| 9 | `finale` — pull back, three envelopes fly in | 1200 |

### Console handle

```js
LettersGame.go('seal')            // jump to a state
LettersGame.goToLevel('L6')       // jump to a level
LettersGame.targets()             // targets, with done + error counts
LettersGame.place('comma','t1')   // place a stamp directly
LettersGame.readout()             // the sentence as plain text
LettersGame.speed(0.4)            // global time multiplier
LettersGame.mute(true)
```

---

## Boot and assets

The whole scene loads in about **0.6 MB** and boots in well under a second. Three rules
keep it that way, and each fixed a real failure:

- **No request can hang the game.** `preload()` caps every image with its own timeout and
  `boot()` waits at most 2.5s for the batch before starting anyway. It used to be a bare
  `Promise.all` over `onload`/`onerror`: one stalled request on a multi-megabyte file left
  it unsettled forever, so boot never reached `go('idle')` and the player got an empty
  desk with no stamps, nothing to drag, and no error anywhere.
- **The webfont cannot stall boot either.** `document.fonts.ready` is raced against a 2s
  timeout; the CSS stack falls back on its own.
- **Audio loads after the scene is up.** Eight `preload="auto"` sound files were competing
  with the artwork for the browser's six HTTP/1.1 connections; they are `preload="none"`
  now and warmed 400 ms after the game starts.

The art was also right-sized against its actual display size — `ready-to-post.png` was
1254px for a ~300px slot, the tray 2× oversized, and `desk-wood` was an opaque photo
texture stored as PNG (now JPEG). **7.0 MB → 1.6 MB on disk, ~0.6 MB fetched at boot**,
with no visible quality change. Every resize was proportional, because the layout depends
on ratios inside those images (`padTop/padBottom`, `ENV.fx0/fw`, `trayLipFrac`) — cropping
any of them would silently move the geometry. Originals are in `_source/`.

If a file genuinely fails, the game names it on screen rather than rendering a broken
scene.

## Tuning the pacing

Every duration lives in the `TIMING` block at the top of `game.js` and passes through one
multiplier:

```js
TIMING.SPEED = 2;      // 1.0 is the sheet's literal timing
```

It ships at **2** because the literal values play back much too fast on a real screen.
Relative rhythm is untouched — only tempo. One letter takes about 11.9 s.

---

## Sound and voice

**Sound effects are CC0.** They come from Kenney's *Interface Sounds* pack — public
domain, free for commercial use, credit optional. The licence ships verbatim at
`assets/sfx/LICENSE.txt` with a map of which original file became which sound.

| event | sound |
|---|---|
| `stamp:press` | thump + sparkle |
| `stamp:reject` | soft boop |
| `stamp:pickup` | click |
| `letter:seal` | chime |
| `letter:seal:stamp` | seal slam |
| `letter:post` | whoosh |
| `set:complete` | fanfare |

If a file ever fails to load or decode — Safari does not play Ogg, for instance — a small
procedurally-synthesised tone stands in, so the game is never silent and never depends on
the download. The animation code only emits named events; nothing in it knows about audio.

**The coach speaks through the browser's own speech synthesis**, so there are no voice
files to licence or ship. `prosody` on each letter shapes pitch and rate, so a question
rises and an exclamation lifts when a finished sentence is read back. Every line is also
live DOM text in the panel and in a polite live region.

Nothing can sound before the first user gesture (autoplay policy), so the engine arms
itself on the first pointerdown or keydown.

---

## Accessibility

- **Never punished** — see above.
- **The sentence is never covered.** The travel arc apexes at y≈280 — above the text
  (y 400) but still on the card — so the stamp passes over blank paper, not across words.
- **`prefers-reduced-motion`** collapses every sequence to a 120 ms cross-fade and skips
  the arcs. Fully playable; covered by the suite.
- **Keyboard** path is complete (above). Focus rings are light (`#FFF3D6`) against the
  dark wood.
- **No text in images.** Sentence, counter and instruction panel are live DOM text;
  repairs are announced politely ("Capital I added", "Letter complete, 1 of 3").

---

## The instruction panel

There is **no character**. Everything the game says lands in one place: a strip along the
top of the desk, `#coach`, drawn entirely in CSS — no artwork to load, nothing to keep in
sync with a pose. It runs from x 40 to x 1470 and stops short of the HUD, so the panel and
the counter read as one band; it borrows the HUD's fill, stroke, radius and dashed inner
plate.

A postmark roundel on the left carries the tone, so the mood of a line is legible before
it is read: **✉ neutral · ? puzzled · ★ pleased / delighted**, with the panel's accent
colour following it (orange → burnt orange → green). The roundel ticks once on a fresh
line — the only movement in the panel, so a new line is noticed without the text jumping.
`data-tone` carries `neutral · pleased · puzzled · delighted`.

The panel is hidden until it has something to say (an empty pill is worse than no pill),
and the line clamps to two rows: the longest string in the content is 67 characters and
fits on one, so the clamp only ever catches an overflow.

`test.py` asserts it sits above the letter card, never runs under the HUD, is visible,
that its type is at least 30 design px, and that no `#pari` element is left in the scene.

---

## Where each visual came from

Figma `9xydFCYrapJ6V0ypxX1l3c`, section **Final** (`94:16`), frames `Slide 16:9 - 64`…`75`.

| Element | Node | Design px (1920×1080) |
|---|---|---|
| desk | `94:18` | (−114, −152) 2147×1376 |
| letter card | `94:28` | (383, 158) 1153×635 |
| card edge stripes | `94:402`, `94:412` | card-local x 14 and 1123, 27 wide |
| sentence | `94:39` | (507, 400) 906×108 — Josefin Sans **Light 54.164px**, black (see below) |
| HUD pill | `94:1189` | (1506, 32) 382×102 — `#FBEAD2`, 3px solid `#E7902F`, inner 2px dashed |
| counter | `94:1195` | Josefin Sans **SemiBold 48px**, `#602B05` |
| pips | `94:1192-4` | 65×65, opacity .38 when empty |
| tray | `94:30` | visible art spans x 562→1359, y 845→1061 |
| stamp slots | `94:33`, `94:38` | ink 112 wide, pads resting on y 998 |
| inbox | `94:707`, `94:727` | two **letter cards** (not envelopes), 302×232 |

`STAMP_ART` in `game.js` is **measured** off each PNG — `padBottom` is the contact edge
and is what gets aimed at the paper, never the file box. The handle/pad split is a
`clip-path` in **percentages**; a px inset would crop the art at every stage scale but 1:1.

---

## Tests

```
pip install playwright pillow && playwright install chromium
python test.py          # 75 checks, exit 0 = all passed
```

Covers: all 24 letters reconstructing to their expected answers, boot from `file://`,
geometry against the Figma nodes, no asset cropped by its own clip, real drag-and-drop
with magnetic snap, the tap path (arm, switch, put down, place), a wrong stamp advancing nothing, all three escalation tiers,
any-order solving, the tutorial scoring nothing, per-level marks and the once-per-level
ceremony, Level 4's four marks, 4D's three sentences, the 9-second nudge, the final
letter's eight targets, CC0 audio loading with TTS available, no finished `fill: both`
animation left pinning a property, no layout shift from 1024×768 to 2560×1440, a
reduced-motion playthrough, an offline-safe boot with the webfont blocked, a missing-asset
banner, a stalled asset being unable to hang boot, a boot payload under 2 MB, dragging
with mouse / touch / pen / broken pointer-capture, a real finger drag that the browser
does not steal, and zero console errors.
