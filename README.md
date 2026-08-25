# Letters

Fix the punctuation and capitalisation of short sentences by stamping them, then post
each completed level. One screen, 16:9, no navigation.

Plain HTML, CSS and JavaScript. No build step, no bundler, no framework, no npm, no
dependencies.

During levelling review, a temporary bar shows every sheet level at once—Tutorial,
Levels 1–7, and Final—and jumps directly to the selected level. The current level is
highlighted. `LettersGame.nextLevel()` remains available for scripted QA; remove
`#temp-level-nav` after progression sign-off.

```
index.html     markup + the inlined letter-card SVG   <- the entry point
styles.css     layout in %, keyframes, reduced-motion block
game.js        1. TIMING  2. CONTENT  3. the nine-state machine
assets/        art (~2.1 MB), sfx/ (CC0 sounds + their licence),
               vo/ (51 recorded coach lines)
test.py        headless acceptance suite (122 checks)
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
  say: lines({ e1: 'Oops! Try again!',
               e2: 'Look closely. Where does the sentence begin or end?' })
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

Drop zones are **120 × 140 design px** and the magnetic snap reaches **150 px** — both far
larger than the glyph they stand for, and the snap deliberately reaches well past the zone
itself, so a drop that lands near the right spot counts as the right spot.
The `#targets` layer spans the whole stage, so it never takes pointer events itself —
only `#targets.live .hit` does. Making the container clickable swallowed every click
outside a zone, including the tray, which left tapping completely dead.

### A wrong stamp never costs anything

No lives, no timer, no score decay, and the turn is not consumed. Escalation is per
target, as the sheet specifies:

| miss | what happens |
|---|---|
| 1 | the stamp rocks where it is held, glows red once, goes straight home; soft boop. **Usually no words** |
| 2 | + the unresolved sentence pulses, the target glows, and the screen's own Wrong 2 line |
| 3 | + stronger glow, a **faint ghost impression** of the correct mark, and **the hand**. No words |

**Wrong 1 is usually silent, and Wrong 3 always is.** The sheet gives Wrong 1 a line on
exactly three of the twenty-four screens — the tutorial, 1A and the Final Letter — and
everywhere else it is mechanical only; 1C's cell says "No dialogue" in as many words. Wrong
3 has no line on *any* screen: it is a glow, a pulse, a ghost. `lines()` therefore defaults
`e1` and `e3` to null. Both used to be filled in: `e1` defaulted to *"Oops! Try again!"*,
which put it on twenty screens the sheet leaves quiet, and `e3` fell back to the Wrong 2
line via `say.e3 || say.e2`, restating it on the third miss. `test.py` now checks all 144
sheet cells — tray, expected answer, Wrong 1/2/3 and stall for each of the 24 screens — so
a default that looks like content cannot pass again.

**The tutorial does not escalate at all.** Its Wrong 2 and Wrong 3 cells are both "—" and
its developer notes say there is no failure state, so every miss gets the same Wrong 1
answer: the line, plus the stronger glow that line asks for ("End position glows more
strongly"). No ghost, no hand — on the one screen whose whole job is a free practice go.
That rule has to be enforced in **two** places, because `buildHits()` re-derives the tier
from `target.errors` on its own: teaching `reject()` alone left the glow and then the ghost
climbing anyway.

**By the third miss of a real level, telling has failed.** Tiers 1 and 2 are words and a light; a child
who is still missing has not understood the words, so tier 3 stops explaining and
demonstrates instead. `handHint()` brings a pointing hand onto the correct stamp, presses
it (the stamp bounces in the same beat, so the two read as one act), carries it across on
an arc, and **drops** it on the place the mark belongs — a lift, a fall and a rebound,
which is the gesture the child has to make.

It only ever demonstrates; it never plays the turn. And it is deliberately **not awaited**:
the tray unlocks the moment the refused stamp is home, so a child who has already worked
it out is never made to sit through the lesson. Every `pointerdown` and `keydown` in the
document reaches `kickIdleTimer()`, which calls `stopHand()` — the first touch cancels the
demonstration mid-flight.

The hand is drawn as a **union**, not as outlined parts: the same four shapes are painted
once fat in ink to make the silhouette, then again in a warm fill on top (`.hand-edge` /
`.hand-fill`). Stroking each shape individually would draw the seams where the finger
meets the fist. Its **fingertip is the hot spot** — `pinHand()` places the element so the
tip lands on the anchor, and `#hand-hint`'s `transform-origin` is that same point, so the
tap dips and grows about what is being pointed at rather than about the middle of a fist.

**Only a correct stamp ever presses.** A wrong one used to drive down into the paper
exactly like a real stamping — squash, hold and all — and only then rock and leave along
a lofted arc, which read as the mark having been made and then taken back. A miss now
never touches the paper: it refuses at the height the player is holding it and moves
straight back to its slot, so nothing about it looks like a stamping that happened.

Tier state is derived from `target.errors` inside `buildHits()`, never stored on the
element — drop zones are rebuilt after every press, so anything held only in a CSS class
would be wiped the moment they were rebuilt. That bug shipped once.

### Inactivity

**A stall says nothing.** After 9 seconds of no interaction the tray waves — and that is
all. The screen is otherwise left exactly as the player left it: the panel keeps the line
it already had, and the words on the card are not touched.

This is a deliberate reversal. The nudge used to replace the line with the letter's `idle`
hint, and then, every nine seconds after that, with another **random general tip** dealt
from a shuffled bag of eight. Nothing had happened, and yet text kept marching through the
panel — a motionless screen reading as though something were going on. Waiting is not a
mistake, so there is nothing new to say; what a stalled player actually needs is a hint
about **what to tap**, which is the tray. `TIPS` and `pickTip()` are gone. Only in the
tutorial does the nudge also point at the exact spot, which the sheet allows.

> The per-letter `idle` lines are **still in the content and still recorded** — they are
> the sheet's own words, and they have clips in `assets/vo`. They are simply not spoken any
> more. Restoring them is one `coach()` call in `onIdle()`, not a content and voice-over
> rewrite, which is why they were kept rather than deleted. Six recordings are idle-only
> and therefore silent; the other stall lines double as their screen's Wrong 2 and are
> still heard. **This is the sheet's biggest open disagreement with the game** — 23 of its
> 24 screens specify a stall line. See [Where the sheet and the game disagree](#where-the-sheet-and-the-game-disagree).
>
> The sheet also varies the stall *visual* per screen, which the game does not: the
> tutorial bounces the stamp and pulses the end position; 1A pulses the tray and the
> beginning/end; Levels 2–4 bounce the stamps together; Levels 5–7 and the Final Letter
> pulse the sentence, and **7A says explicitly "no stamp animates"**. The game waves the
> tray on every screen.

The tray pulses on the **instruction line** too, not just on a stall: that line is the one
telling the player to pick a stamp, and the words on their own left children reading the
sentence with no idea the stamps were the thing to act on. It is a rise-and-scale pulse,
staggered across the tray so it reads as the tray being pointed at rather than every stamp
twitching at once — deliberately bigger than the continuous idle bob, which is a resting
motion and cannot double as a "look here".

---

## Progress

The HUD numeral is the **current level out of eight**; the marks beside it are the
**letters within that level** (three, or four for Level 4). The sheet settles what was
previously an open question: *"1/3 postal ticks fill for Level 1"*, *"progress header
advances to Level 2"*, and Level 4's *"1/4 fills"*.

A mark fills after its letter is completed. Intermediate letters lift and fade; the level's
last letter arcs away towards the pile at the bottom right. **Nothing is franked and
nothing lands on the pile until the level is finished** — that is the level-complete
ceremony's job, and it brings the whole set down together, after which the next level
**clears the pile again**. The tutorial bypasses this postal flow entirely.

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
(`--stamp-ink #1B4FA8`) rather than the black the sentence is printed in, and set a little
larger and heavier. It keeps that treatment for the rest of the letter instead of blending
back into the text. Punctuation gets the bigger bump (`1.22em`) because a full stop is tiny
and is the hardest thing on the page to notice.

**The mark sits square on the line.** It used to land a degree or two off, derived from the
target's id so it was stable rather than jittery — meant to read as a real stamp. On a
capital it did not: `I` and `A` tilted out of the run of the sentence just read as sloppy
handwriting, which is the opposite of what a correction should look like.

The impression itself is three things landing together: the glyph is **squashed by the
pad and springs back** (`1.55 → 0.88 → 1.06 → 1`, blurred at the moment of contact), a
**pressure ring** pushes outward from the point of impact, and an **ink blot** soaks in
underneath and fades.

**Nothing marks the spot before the stamp lands.** An empty punctuation slot reserves its
width and a pending capital is just the lowercase letter — both used to carry a dotted
rule underneath. Two rows of dots under the exact answer crowded the sentence and pointed
at it before the child had looked. The drop zone is invisible and generous; that is the
whole affordance.

The tier-3 ghost hint previews the same blue, so the hint and the answer read as the
same ink.

## How a letter leaves

**A sheet arrives and the same sheet leaves.** The finished paper lifts off the desk and
arcs away to the pile at the bottom right — the arrival run backwards, at the same scale
and along the same kind of curve, so the two ends of a letter tell one story about what a
letter is.

Getting here meant deleting the most elaborate thing in the project, so it is worth saying
what went and why. The exit used to be: the card sliced into **three HTML bands** folded in
real 3D (HTML, not SVG, because browsers do not honour `transform-style: preserve-3d` on
SVG elements — a rotated `<g>` is flattened to a vertical squash); a **drawn envelope** of a
back panel, a front panel and a hinged flap, sandwiching `#card-layer` in paint order with
no `z-index` anywhere so the pocket genuinely hid the letter; and the folded strip lowered
through the mouth and shut in. It had a cast shadow on the sheet below, a lit crease, a
sliver of paper thickness on each leading edge, and a landing that stopped a couple of
degrees shy of flat.

It was also a long, ornate answer to "this letter is done", and it left the arrival and the
departure disagreeing — a plain sheet flew in, and a folded envelope flew out. All of it is
gone: `foldBand`, `settleThump`, `FOLDED`, the whole `envGeom`/`placeEnvelope`/`stripPose`
family, `#card-fold` and its three `.fband`s, `#env-under` / `#env-over` / `#env-flap`, the
`--env-*` line-weight tokens, and the `TIMING.seal` keys that drove them. `envelope.png`
still stands in for a posted letter on the piles and in the level-complete row, where it is
under 300px wide and none of that machinery would have read anyway.

**Nothing is franked on the desk.** A level's last letter used to take **READY TO POST**
on its way out, riding away on one shared transform with the paper. That went too: it
announced the level as over a beat before the ceremony that shows it ending, and it franked
one letter of three while its two classmates had already left unstamped. The seal now
belongs entirely to `levelup`, where the whole set takes it together. `#seal`, `#flash`,
`slamSeal()`, `sealBox()` and the `TIMING.seal` slam keys are all gone with it.

> Two traps worth recording from that machinery, because both are easy to write again.
> The seal and the card left on the same animation, faded as `opacity: 1 -> 0` — and on
> every letter that had *not* earned a seal, that made an already-invisible element briefly
> **visible**, flashing READY TO POST onto ordinary letters for the length of the fade.
> Separately, the arrival transforms were built from **top-left** deltas while the transform
> origin is the element's **centre**, which lands a shrinking card short by half the size
> difference — over a hundred design px on the level-complete row. `ontoBox()` is now the
> single place that answers "what transform carries this element onto that box".

> A third, subtler one, caught by a test that *passed*. Every envelope was placed with an
> explicit square box by `envBox()` and then had its height overridden to `auto`, letting
> the `<img>` decide. That makes layout wait on the image: for one frame after insertion the
> div is **zero-high**, its contents sit at its top edge, and anything measuring or animating
> it works from the wrong box. It read as the level-complete row starting 240 design px —
> half a card — above where it belonged. Preloading does not help; the frame exists either
> way. The lesson for the assertion, not just the code: `y < 260` was satisfied by `y = -156`.
> Bound a position check on **both** sides.

---

## The nine states

The whole flow is the `STATES` table at the bottom of `game.js`.

```
idle → deal → read → await-input → stamp ─┬→ await-input   (more targets, or a miss)
                                           └→ seal → post ─┬→ idle       (more letters)
                                                           ├→ levelup → idle
                                                           └→ finale
```

| # | State | ms @ SPEED 1 |
|---|---|---|
| 1 | `idle` — empty desk, tray, HUD, inbox | — |
| 2 | `deal` — a sheet arcs in from the inbox pile, whole | 700 |
| 3 | `read` — text appears uncorrected, 25 ms per-word stagger | 350 |
| 4 | `await-input` — stamps idle-bob; waits for the player | — |
| 5 | `stamp` — press, ink bloom, sparkle, return (travel only if tapped; a miss never presses) | 450 |
| 6 | `seal` — praise, and the sentence read back | 900 + voice |
| 7 | `post` — the sheet arcs away towards the pile; the mark fills on landing | 600 |
| 8 | `levelup` — the level's letters come out of the HUD, are franked, and land on the pile | ~4200 |
| 9 | `finale` — pull back, three envelopes fly in | 1200 |

### A state function can outlive its own turn

`go()` bumps a `generation` counter and `drive()` throws away the return value of any
state function whose generation has moved on. What it cannot throw away is that function's
**side effects** — and once the machine started awaiting the voice, those functions stay
alive much longer, so the window got wide enough to hit.

The symptom: jump to a level while `levelup` is finishing, and the interrupted state's
`advanceLevel()` still runs and bumps the cursor *on top of your jump* — ask for Level 4,
land on Level 5. `stale(g)` closes it. `stPost` and `stLevelUp` capture the generation on
entry and check it before touching `S.levelIndex`, `S.letterIndex`, `S.solved` or
`S.posted`; if the run is stale they return `null` and let the newer one own the machine.

### Nothing moves while the coach is still talking

The durations above are floors, not the whole story: **the machine waits for the voice.**
Hearing the corrected sentence read back is the point of a letter, and `seal` used to run
on its own timer — so the paper left the desk mid-word and the next screen cancelled the
rest of the line. `coachSpoken()` now gates the three places where a line was being talked
over: the tutorial's praise before its read-back, the read-back before the letter leaves,
and the level-complete line before the next level loads.

It waits on **two clocks and takes the later one** — the voice (a real clip's `ended`, or
synthesis's `end`) and `readMs`, so a muted player still gets time to read. The voice half
is capped at 8s, following the same rule as the asset loader: a stalled `<audio>` delays a
beat, it never parks the game. Nothing is waited on when nothing is playing, which is what
keeps a muted run at full speed. `prefers-reduced-motion` collapses the animation but *not*
the voice — audio is not motion — so a reduced-motion playthrough is paced by speech.

### The level-complete beat

A finished level gets its own moment, from `Slide 16:9 - 75` and `79`, and it is the whole
journey told once:

1. **Out of the HUD.** The marks in the top right have been ticking off a letter each all
   level; those marks are where the letters come from. Each envelope arcs down out of its
   own pip (`pipBox(i)`, measured rather than derived — the pips are laid out in per-cent
   of a pill that is itself in per-cent of the stage) into a row across the desk.
2. **Franked.** The row arrives **plain**, and only once every card is at rest does each
   take its **READY TO POST** in turn, left to right, with the desk shifting under each
   impression. A card that already wore the seal on the way in would make this step nothing
   to watch.
3. **Onto the pile.** The franked set then arcs down and stacks in the bottom right, where
   the outgoing letters live.

The hand-off at the end is invisible by construction. Each card lands on the **exact box
its pile slot is about to occupy** — both read that geometry from `bagSlot()`, the single
description of where the pile sits — and then `renderMailbag()` draws the pile underneath
and the flying cards are removed in the same frame. They land on the **top** slots of the
finished pile (`first = min(posted + n, BAG_SLOTS) - n`), not on slots 0..n-1: once the pile
is at full depth the newest letters are the ones showing, and landing on the first slots
left the deepest one popping into being from nowhere the moment the pile redrew.

Two other things are derived rather than typed. The row comes from `levelRow(n)`, which
centres *n* envelopes and shrinks them to fit, because Level 4 has four letters
and every other level has three — a table of positions would have been wrong for
exactly one level. And the level cursor moves in one place only, `advanceLevel()`,
so the tutorial's skip past this beat and the beat's own exit cannot disagree
about what "next" means.

`state.posted` counts **letters resting on the pile**, not levels, and it is the ceremony
that adds them — `post` no longer touches it. The sheet still arcs off towards the corner
as it leaves the desk, but nothing actually lands there until the set is finished and
franked; adding that one letter to the pile early put a READY TO POST on screen a beat
before the ceremony that awards it.

**The pile belongs to one level.** `advanceLevel()` clears it, so every level starts with an
empty corner and fills it only by finishing. Carrying the stack forward meant Levels 2
through 8 were all played beside three franked envelopes, which said *done* before anything
had been done — the seal stops meaning "you finished this" the moment it is also on screen
while you are still working. The landing therefore gets its own hold (`bagHoldMs`) before
the next level loads: it is the last thing the level shows, and without the beat it would
exist for a single frame.

The **tutorial does not get one** — it is practice, it fills no mark, and the
sheet is explicit that it must not show READY TO POST. The **final level does not
either**: `finale` already ends the game with the same gesture, and running both
would frank the last letter twice.

**There is no `open` state.** A sheet has nothing to open — it is already flat paper when
it leaves the pile — so it arrives complete, stripes and all, and the text is next. The
state used to grow the card from `scaleY(.15)` with a triangular flap swinging off its top
edge, both left over from when the card stood in for an envelope. On a plain sheet that
read as a window blind rolling down over paper that was already there, so the state, its
`TIMING.open` block, and the `#card-flap` artwork are all gone rather than tuned down.

### Console handle

```js
LettersGame.go('levelup')         // jump to a state
LettersGame.goToLevel('L6')       // jump to a level (or use the picker)
LettersGame.targets()             // targets, with done + error counts
LettersGame.place('comma','t1')   // place a stamp directly
LettersGame.readout()             // the sentence as plain text
LettersGame.speed(0.4)            // global time multiplier
LettersGame.vo                    // the recorded-line map
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

### The coach's voice

**50 of the coach's 56 lines are recorded**, in `assets/vo/`. The map is keyed by the
**exact string the panel displays**:

```js
"Are you excited?": "are-you-excited",
"This sentence needs a full stop. Pick the full-stop stamp and place it at the end.":
  ["this-sentence-needs-a-full-stop", "pick-the-full-stop-stamp-and-place-it-at-the-end"],
```

Keying on the displayed text rather than on a line id is deliberate: **the voice cannot
drift from the words on screen**. Edit a line and the lookup misses, which falls back to
synthesis rather than confidently saying something the child cannot read. A value may be
an array, because the tutorial's one-line instruction was delivered as two clips and is
played in order.

Three things keep it from ever going silent:

- **Synthesis is the fallback, not the exception.** A missing key, a browser that cannot
  decode Ogg (Safari), or a clip that 404s all land on `synth()`. The error path matters
  as much as the happy one — a decode failure is only discovered *after* `speak()` has
  returned, so the `error` listener re-speaks the line rather than leaving a gap.
- **Nothing is fetched at boot.** Clips are constructed on demand, so 1.9 MB of voice
  never competes with the artwork; `test.py` still measures the boot payload at 0.07 MB.
- **`prosody`** shapes pitch and rate for synthesised lines, so a question rises and an
  exclamation lifts. Recorded lines carry their own delivery.

**Four lines have no recording** and fall back to synthesis. They are, with the screen
that says them:

| line | said by |
|---|---|
| "Look closely. Where does the sentence begin or end?" | 1A, wrong attempt 2 |
| "Where does this sentence begin or end?" | 1B, wrong attempt 2 |
| "Check the beginning and the end." | 7C, wrong attempt 2 |
| "Hmm… try that again." | Final Letter, wrong attempt 1 |

The two 1A/1B lines are the reason two delivered clips went unused: the recordings say
"…the sentence begin." and "…the sentence end." as separate takes, where both letters ask
"begin **or** end" in one breath.

**There are no unrecorded ceremony lines left, because there are no ceremony lines.** The
sheet's level-completion and final-completion cells describe only what happens — *"3/3 →
READY TO POST → envelope → mailbag"* — and give the coach nothing to say. *"Level N
complete. Every letter is ready to post!"*, *"Every letter is ready to post. Wonderful
work!"* and *"Ready to post!"* were all mine, and all three are gone.

Going the other way, **six clips are recorded but no longer play**, all of them stall-only
lines: `place-the-full-stop-stamp-at-the-end-of-the-sentence`,
`look-at-the-beginning-and-end-of-the-sentence`,
`is-it-telling-asking-or-showing-a-strong-feeling`, `let-s-fix-one-sentence-at-a-time`,
`can-you-spot-what-needs-fixing` and `check-the-letter-carefully-what-still-needs-fixing`.
The rest of the stall lines double as their screen's Wrong 2 and are still heard. All are
kept, not deleted, so the decision stays reversible.

Every line is also live DOM text in the panel and in a polite live region, so the game
reads correctly with the sound off entirely.

Nothing can sound before the first user gesture (autoplay policy), so the engine arms
itself on the first pointerdown or keydown.

---

## Where the sheet and the game disagree

**The gameplay sheet is the source of truth** — *The Punctuation Puzzle, Gameplay Sheet,
original Excel rows 34–58*, 24 screens. Its content is transcribed into `test.py` section
1a and checked cell by cell: tray, expected answer, Wrong 1/2/3 and stall for all 24
screens, 144 cells. Every line of dialogue in the game traces to a cell.

Where the game still departs from it, it is for one of three reasons, and each is listed
below so nobody has to re-derive it.

### 1. A later instruction overrode the sheet

These are deliberate. Each one reverses something the sheet asks for, and each is a
one-flag change back.

| the sheet says | the game does |
|---|---|
| A stall speaks: 23 of 24 screens have an inactivity line | A stall says nothing; the tray waves. See [Inactivity](#inactivity) |
| The wrong mark **appears briefly** then fades (Screens 5–9, 11–13; 5A's notes say so outright) | A miss never touches the paper — it refuses where it is held and goes straight home |
| Wrong 3 is a **pulse**: "relevant stamp lifts once", "correct tool + location pulse together" | Wrong 3 runs the **hand**, a full pick-up-and-drop demonstration |
| READY TO POST lands on the level's **last letter**, which then folds into an envelope | Nothing is franked on the desk; the whole set takes the seal together in `levelup`, and the sheet leaves flat — no fold |
| The mailbag **accumulates**: "Mailbag visibly fuller", "accumulated mailbag visible", "filled mailbag visible" | The pile is cleared at the start of every level |
| **Pari** is on screen throughout, with expressions — shocked, relieved, delighted | An instruction panel with a static avatar; `data-tone` is the only expression |
| 7A's stall: "**no stamp animates**" | The tray waves on every screen, 7A included |

### 2. The sheet contradicts itself

- **Six screens show a lowercase opening but offer no capital stamp.** 2A *"are you
  excited"*, 2C *"did you get my last letter"*, 3A *"what a wonderful gift"*, 3C *"we won
  the match"*, 4B *"can you come tomorrow"* and 4C *"look at that huge kite"* all have an
  Expected answer that capitalises the first word, while their Available-options cell lists
  only end marks. The only self-consistent reading is that the capital is already there, so
  the game ships those six sentences pre-capitalised and the single target is the end mark.
- **Screen 1's instruction breaks its own column limit.** The header says "Instruction ≤10w"
  and the cell holds 17 words. Splitting it in two — *"This sentence needs a full stop."*
  (6) then *"Pick the full-stop stamp and place it at the end."* (10) — satisfies the limit
  and is what the game does.

### 3. Specified but not built

Authored in the content and inert in the engine, so the data is ready when the art is:

- **Illustrations, 9 screens.** `doodle` carries `gift · trophy · kite · list-crayons ·
  list-animals · list-four · dadi · nani · raju · card`; nothing renders them. `comic: true`
  (6A's shocked-to-relieved pause), `calm: true` (3B's quieter feedback) and `big: true`
  (the Final Letter) are likewise unread.
- **Mini seals.** 4D's "each solved sentence fills 1/3 mini seals", 5C's "first comma fills
  half mini-seal" and Screen 24's gradually-filling postal seal. The logic exists —
  `state.repairsSolved` / `repairsTotal`, the `data-repairs-*` attributes and the
  `repair:progress` event — but there is no such indicator drawn.
- **The Correct-feedback (Hint Screen) column**, 24 teaching lines. Only the tutorial's is
  spoken, and that is faithful: Screen 1 attributes its line to Pari in the
  animation column, while the other 23 screens have Pari only *reading the sentence back*.
  The hint-screen lines read as a separate surface the game does not have — a teaching card,
  not panel dialogue — so they are neither implemented nor invented into the panel.

### Normalisations

Three lines are typographically normalised, not reworded: the sheet's `...` becomes `…`
(*"Hmm… try that again."*, *"Oh dear! Are we eating Dadi… or talking to Dadi?"*) and 4D's
unspaced em dash gains its spaces (*"…this sentence doing — telling, asking…"*). The VO map
is keyed on the exact displayed string, so these are the strings the recordings match.

---

## The level jump

`#temp-level-nav` is a bar along the bottom of the desk — **Jump to · Tutorial 1…7 Final** —
that loads any level straight away. It is a review control, and its id says so: it is
temporary, and deleting the `<nav>`, its `#temp-level-*` CSS and the two lookups in
`game.js` removes it completely.

It lives *inside* `#stage`, so it scales with the scene like everything else. That means it
sits over the desk rather than beside it, which is the trade for keeping one coordinate
system. Two details keep it from interfering: it carries `aria-current` on the level being
played, and the global gesture handlers skip events that originate inside it
(`e.target.closest('#temp-level-nav')`) so clicking it cannot arm a stamp or reset the
inactivity timer as a side effect.

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

Everything the game says lands in one place: a strip along the top of the desk, `#coach`,
drawn in CSS apart from the portrait. It runs from x 40 to x 1470 and stops short of the
HUD, so the panel and the counter read as one band; it borrows the HUD's fill, stroke,
radius and dashed inner plate.

**The character is a single round portrait** (`coach-avatar.png`, 74 × 74 design px) seated
in the panel's left rounded corner and pulled 10px out of it, the way a chat avatar sits
proud of its bubble. Sized with its ring it exactly fills the dashed inner plate, so it
looks set into the stationery rather than dropped on top of it. It is the whole of the
character — there is no body, no pose set and nothing to keep in sync with what is being
said, so a new line costs one string and no artwork.

The **tone travels in colour** rather than in a second icon: the ring around the portrait
and the panel's own border and dashed plate all take `--tone` together (orange neutral →
burnt orange puzzled → green pleased / delighted), so the mood of a line is legible before
it is read. This replaced a postmark roundel that carried ✉ / ? / ★ marks as inline SVG —
with a face in the panel, a second symbol competing beside it was one tone signal too
many. The portrait ticks once on a fresh line — the only movement in the panel, so a new
line is noticed without the text jumping. `data-tone` carries
`neutral · pleased · puzzled · delighted`.

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
| tray | `94:30` | visible art spans x 562→1359, y 877→1093 (see below) |
| stamp slots | `94:33`, `94:38` | ink 112 wide, pads resting on y 1029.75 |
| inbox | `94:707`, `94:727` | two **letter cards** (not envelopes), 302×232 |

The tray sits **31.75px lower than the Figma node** — 5% of the card's height — to open up
the gap between the card's bottom edge (y 793) and the tray, which the node had at 11px and
which read as the two touching. Its `y` and `padBaseline` move together and by the same
amount: `padBaseline` is what the drag maths and the press aim at, so moving the art alone
would leave the stamps hanging off the tray. The cost is that the tray's bottom rim now
falls at y 1112, past the 1080 stage floor, so about the last 12% of its art is clipped —
only decorative base, with every stamp still fully on screen.

`STAMP_ART` in `game.js` is **measured** off each PNG — `padBottom` is the contact edge
and is what gets aimed at the paper, never the file box. The handle/pad split is a
`clip-path` in **percentages**; a px inset would crop the art at every stage scale but 1:1.

---

## Tests

```
pip install playwright pillow && playwright install chromium
python test.py          # 122 checks, exit 0 = all passed
```

Covers: **all 144 gameplay-sheet cells** (tray, expected answer, Wrong 1/2/3 and stall
for each of the 24 screens) so no invented line or silently-inherited default can pass,
all 24 letters reconstructing to their expected answers, boot from `file://`,
geometry against the Figma nodes, no asset cropped by its own clip, real drag-and-drop
with magnetic snap, the tap path (arm, switch, put down, place), a wrong stamp advancing nothing, all three escalation tiers
(including that the tutorial never escalates past its one Wrong 1 answer and never shows
the answer, and that the second miss glows but does not yet show the hand, and that the third
brings it out — starting on the stamp that is needed, ending on the place the mark belongs,
showing a drop rather than just a journey, and clearing on the first touch),
any-order solving, the tutorial scoring nothing, per-level marks and the once-per-level
ceremony, Level 4's four marks, 4D's three sentences, the 9-second stall adding no dialogue
and leaving the sentence alone while still hinting what to tap, the final
letter's eight targets, CC0 audio loading with TTS available, no finished `fill: both`
animation left pinning a property, no layout shift from 1024×768 to 2560×1440, a
reduced-motion playthrough, an offline-safe boot with the webfont blocked, a missing-asset
banner, a stalled asset being unable to hang boot, a boot payload under 2 MB, every VO clip decoding and unrecorded lines falling back to synthesis, the level jump loading a level without moving the stage, the franked row at the end of a level (three envelopes, four for Level 4) entering from the HUD marks, arriving plain and only then being franked, and landing on a pile the level started empty and the next level clears again — with the tutorial never getting one, nothing franked on the desk before the level is finished, the finished sheet arcing away flat with no 3D fold and no fold or envelope markup left in the scene, dragging
with mouse / touch / pen / broken pointer-capture, a real finger drag that the browser
does not steal, and zero console errors.
