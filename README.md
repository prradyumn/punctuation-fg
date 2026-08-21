# Letters

Fix the punctuation and capitalisation of short sentences by stamping them, then post
each finished letter. One screen, 16:9, no navigation.

Plain HTML, CSS and JavaScript. No build step, no bundler, no framework, no npm, no
dependencies.

```
index.html     markup + the inlined letter-card SVG   <- the entry point
styles.css     layout in %, keyframes, reduced-motion block
game.js        1. TIMING  2. CONTENT  3. the nine-state machine
assets/        art (~1.6 MB), plus sfx/ (CC0 sounds + their licence)
test.py        headless acceptance suite (66 checks)
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
  snaps to the nearest target within 96 design px. Release to stamp. Released over
  nothing it slides home and *no* error is recorded.

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
| 1 | stamp wobbles back, soft boop, Pari's gentle line |
| 2 | + the unresolved sentence pulses, the target glows |
| 3 | + stronger glow, a **faint ghost impression** of the correct mark, and the right stamp lifts once in the tray |

Tier state is derived from `target.errors` inside `buildHits()`, never stored on the
element — drop zones are rebuilt after every press, so anything held only in a CSS class
would be wiped the moment they were rebuilt. That bug shipped once.

### Inactivity

After **9 seconds** of no interaction Pari offers the level's `idle` line, the unresolved
sentence pulses and the tray bounces — but the correct stamp is never singled out, which
the sheet is explicit about. Only in the tutorial does the nudge point at the exact spot.

---

## Progress

The HUD numeral is the **current level out of eight**; the marks beside it are the
**letters within that level** (three, or four for Level 4). The sheet settles what was
previously an open question: *"1/3 postal ticks fill for Level 1"*, *"progress header
advances to Level 2"*, and Level 4's *"1/4 fills"*.

A mark fills when the envelope lands, never earlier. **Every finished letter folds itself
into an envelope and flies to the pile at the bottom right** — text clears, the bottom
third folds up, the top third folds down, the strip cross-fades to `envelope.png`, and it
arcs away. Earlier letters used to just fade out, which read as the letter vanishing
rather than being sent. The **READY TO POST seal** is still reserved for a level's last
letter, so completing a level keeps its flourish.

**The tutorial scores nothing**: no mark, no envelope, no ceremony. Its pill reads
**Practice** rather than `01/8`, and it shows no marks — otherwise a deliberately
single-stamp tutorial reads as "Level 1 has one option". Every real level from 1 onward
offers the tray its row in the sheet specifies (two stamps through Levels 1-3, three in
Level 4, five in the final letter); `test.py` asserts those tray sizes.

---

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
| 2 | `deal` — a letter arcs in from the inbox | 700 |
| 3 | `open` — the card unfurls, flap swings, stripes fade in | 500 |
| 4 | `read` — text appears uncorrected, 25 ms per-word stagger | 350 |
| 5 | `await-input` — stamps idle-bob; waits for the player | — |
| 6 | `stamp` — press, ink bloom, sparkle, return (travel only if tapped) | 450 |
| 7 | `seal` — hold, fold in thirds, cross-fade to the envelope | 900 |
| 8 | `post` — fly to the mailbag; the mark fills on landing | 600 |
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

**Pari speaks through the browser's own speech synthesis**, so there are no voice files to
licence or ship. `prosody` on each letter shapes pitch and rate, so a question rises and
an exclamation lifts when she reads a finished sentence back. Everything she says is also
live DOM text in her narration box and in a polite live region.

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
- **No text in images.** Sentence, counter and narration are live DOM text; repairs are
  announced politely ("Capital I added", "Letter complete, 1 of 3").

---

## Asset gaps

Everything below is **wired and playable** — only the artwork is missing.

- **Pari herself.** `#pari-portrait` is an empty slot with a dashed placeholder. Her
  speech card, her `data-expression` states (`neutral · pleased · puzzled · delighted`),
  her lines and her voice all work now. Drop a sprite in and give the slot a
  `background-image`.
- **Per-level doodles.** The sheet asks for a gift (3A), trophy (3C), kite (4C), crayons
  and storybooks (5A/5C), monkeys and parrots (5B), Dadi (6A), Nani (6B), Raju (6C) and a
  card (7B). Each letter already carries a `doodle:` key; nothing reads it yet.
- **The comic beat in 6A** ("Let's eat, Dadi!") holds for timing, but has no
  shocked→relieved expression change without art.
- **5A's "items separate by a few pixels then settle"** is not built.
- **The tutorial's "palm nudge"** — placing the stamp for the learner after repeated
  struggle — is not built; tier 3 stops at the ghost impression.

## Two readings of the sheet

1. **Levels 2A, 2C, 3A, 3C, 4B and 4C** show a lowercase opening word and expect a
   capital, but their tray offers only end marks. A capital cannot be a target with no
   stamp to place it, so in those levels the opening word is rendered **already
   capitalised** and the end mark is the only target. Rule applied throughout: a capital
   is a target only where the tray includes `a→A`.
2. **5B's** expected answer drops the full stop its own shown text has. Read as a typo;
   the full stop is kept.

Also worth a check: the sheet's Figma note for Level 8 says *"Dear Nani, appears already
correct"* while its content column says *"Dear Raju,"*. The content column wins here.

---

## Where each visual came from

Figma `9xydFCYrapJ6V0ypxX1l3c`, section **Final** (`94:16`), frames `Slide 16:9 - 64`…`75`.

| Element | Node | Design px (1920×1080) |
|---|---|---|
| desk | `94:18` | (−114, −152) 2147×1376 |
| letter card | `94:28` | (383, 158) 1153×635 |
| card edge stripes | `94:402`, `94:412` | card-local x 14 and 1123, 27 wide |
| sentence | `94:39` | (507, 400) 906×108 — Josefin Sans **Light 54.164px**, black |
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
python test.py          # 66 checks, exit 0 = all passed
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
