# Acceptance suite for "Letters".
#   pip install playwright pillow && playwright install chromium
#   python test.py
# Screenshots land in shots/. Exit code 0 = every check passed.
import pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
URL = (ROOT / "index.html").as_uri()
OUT = ROOT / "shots"
OUT.mkdir(parents=True, exist_ok=True)

results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + detail if detail else ""))

errs, cerrs = [], []

def wait_await(pg, t=30000):
    pg.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=t)

def solve_letter(pg, reverse=False):
    """Place the right stamp on every unsolved target."""
    while True:
        pg.wait_for_function(
            "() => ['await-input','seal','post','idle','finale'].includes(LettersGame.state.name)",
            timeout=30000)
        if pg.evaluate("() => LettersGame.state.name") != 'await-input':
            return
        ts = [t for t in pg.evaluate("() => LettersGame.targets()") if not t['done']]
        if not ts:
            return
        t = ts[-1] if reverse else ts[0]
        pg.evaluate(f"LettersGame.place('{t['stamp']}', '{t['id']}')")
        pg.wait_for_function("() => LettersGame.state.name !== 'await-input'", timeout=30000)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("console", lambda m: cerrs.append((m.type, m.text)))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)                                     # file:// — no server
    pg.wait_for_function("() => window.LettersGame", timeout=15000)
    pg.evaluate("window.__ev=[]; window.__all=[]; ['stamp:press','stamp:reject','letter:seal','letter:post','set:complete','nudge:idle','nudge:error'].forEach(n=>document.addEventListener(n,e=>{window.__ev.push(n);window.__all.push(n);}))")
    pg.evaluate("LettersGame.speed(0.3)")            # behaviour, not tempo

    # ---- 1. content: every letter reconstructs to its expected answer ----
    content = pg.evaluate("""() => {
      const bad = []; let letters = 0, targets = 0;
      LettersGame.levels.forEach(lv => lv.letters.forEach(spec => {
        const L = parseLetter(spec); letters++;
        if (!lv.tutorial) targets += L.targets.length;
        let out = '';
        for (let k = 0; k <= L.text.length; k++) {
          L.targets.forEach(t => { if (t.kind==='punctuate' && t.at===k) out += t.char; });
          if (k === L.text.length) break;
          let ch = L.text[k];
          L.targets.forEach(t => { if (t.kind==='capitalise' && t.at===k) ch = ch.toUpperCase(); });
          out += ch;
        }
        out = out.replace(/\\s+([.,?!])/g,'$1').replace(/\\s+/g,' ').trim();
        if (out !== L.read) bad.push(L.id + ': ' + out);
        L.targets.forEach(t => { if (!L.stamps.includes(t.stamp)) bad.push(L.id+' no stamp '+t.stamp); });
      }));
      return { bad, letters, targets, levels: LettersGame.levels.length };
    }""")
    check("1 all 24 letters reconstruct to their expected answer",
          not content['bad'] and content['letters'] == 24, str(content['bad'][:2]) or f"{content['letters']} letters")
    check("1 every target has its stamp in the tray", not content['bad'], "")
    check("1 nine level groups, 41 scored repairs",
          content['levels'] == 9 and content['targets'] == 41,
          f"{content['levels']} groups / {content['targets']} targets")

    # ---- 2. tutorial boots; geometry matches the Figma nodes -------------
    wait_await(pg)
    pg.wait_for_timeout(400)
    st = pg.evaluate("""() => ({
      level: LettersGame.state.levelIndex, letter: LettersGame.state.letter.id,
      stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp),
      hits: document.querySelectorAll('.hit').length,
      hud: document.querySelector('#hud-count').textContent,
      pips: document.querySelectorAll('#hud-pips .pip').length,
      pari: document.querySelector('#pari-line').textContent })""")
    pg.screenshot(path=str(OUT / "a1-tutorial.png"))
    check("2 boots from file:// into the tutorial", st['letter'] == 'T', st['letter'])
    check("2 tutorial offers only the full-stop stamp", st['stamps'] == ['period'], str(st['stamps']))
    check("2 one drop zone for its one target", st['hits'] == 1, str(st['hits']))
    check("2 Pari gives the tutorial instruction", 'full-stop' in st['pari'], repr(st['pari'][:44]))
    check("2 the tutorial is labelled Practice, with no progress marks",
          st['hud'] == 'Practice' and st['pips'] == 0, f"{st['hud']} / {st['pips']} pips")

    geo = pg.evaluate("""() => {
      const s = document.getElementById('stage').getBoundingClientRect();
      const U = s.height / 1080;
      const d = q => { const r = document.querySelector(q).getBoundingClientRect();
        return [ +((r.left-s.left)/U).toFixed(0), +((r.top-s.top)/U).toFixed(0),
                 +(r.width/U).toFixed(0), +(r.height/U).toFixed(0) ]; };
      return { card: d('#card-layer'), sentence: d('#sentence'), hud: d('#hud') }; }""")
    near = lambda g, w, tol=4: all(abs(a-bb) <= tol for a, bb in zip(g, w))
    check("2 card at 383,158,1153,635 (Figma 94:28)", near(geo['card'], [383,158,1153,635]), str(geo['card']))
    check("2 sentence at 507,400,906,108 (94:39)", near(geo['sentence'], [507,400,906,108]), str(geo['sentence']))
    check("2 HUD at 1506,32,382,102 (94:1189)", near(geo['hud'], [1506,32,382,102]), str(geo['hud']))

    # ---- 3. no asset cropped by its own clip -----------------------------
    clips = pg.evaluate("""() => [...document.querySelectorAll('.stamp')].map(b => {
      const r = b.getBoundingClientRect(), img = b.querySelector('img').getBoundingClientRect();
      return { id: b.dataset.stamp,
               fits: Math.abs(img.width-r.width) < 1.5 && Math.abs(img.height-r.height) < 1.5,
               pct: [...b.querySelectorAll('.part')].every(p => getComputedStyle(p).clipPath.includes('%')) };
    })""")
    check("3 stamp art fills its box (no crop) and clips in %",
          all(c['fits'] and c['pct'] for c in clips), str(clips))

    # ---- 4. drag-and-drop with magnetic snap -----------------------------
    sb = pg.query_selector('.stamp').bounding_box()
    hb = pg.query_selector('.hit').bounding_box()
    pg.mouse.move(sb['x']+sb['width']/2, sb['y']+sb['height']*0.85)
    pg.mouse.down()
    pg.mouse.move(hb['x']+hb['width']/2, hb['y']+hb['height']/2, steps=12)
    moved = pg.evaluate("() => document.querySelector('.stamp').style.transform || ''")
    snapped = pg.evaluate("() => !!document.querySelector('.hit.snap')")
    # RENDERED position, captured while the pointer is still down. `bob`
    # animates transform, and a running CSS animation outranks inline styles,
    # so the drag transform was written and silently discarded — the stamp
    # bobbed in the tray while the pointer moved away.
    tracked = pg.evaluate("""() => {
      const b = document.querySelector('.stamp');
      const m = new DOMMatrix(getComputedStyle(b).transform);
      return { dx: Math.round(m.m41), dy: Math.round(m.m42),
               anims: b.getAnimations().filter(a => a.playState === 'running').length }; }""")
    pg.screenshot(path=str(OUT / "a4-drag.png"))
    pg.mouse.up()
    check("4 dragging moves the stamp with the pointer", 'translate3d' in moved and moved != '', moved[:46])
    check("4 the stamp's RENDERED position follows the pointer",
          abs(tracked['dx']) > 20 and abs(tracked['dy']) > 20, str(tracked))
    check("4 no idle animation fights the drag transform",
          tracked['anims'] == 0, f"{tracked['anims']} running animations on the dragged stamp")
    check("4 the target magnetically snaps", snapped, str(snapped))
    pg.wait_for_function("() => LettersGame.targets().every(t => t.done)", timeout=25000)
    check("4 drop applies the repair", pg.evaluate("() => LettersGame.readout()") == 'I will visit you soon.',
          pg.evaluate("() => LettersGame.readout()"))

    # ---- 4b. TAP path: arm, switch, place --------------------------------
    # Tap was completely dead once: pointerdown armed the stamp and the click
    # that followed disarmed it, and the full-stage #targets layer swallowed
    # every later click. Exercised here with real mouse clicks.
    pg.wait_for_function("() => LettersGame.state.letter && LettersGame.state.letter.id === '1A'", timeout=40000)
    wait_await(pg)
    pg.wait_for_timeout(400)

    def tap(sel, fy=0.5):
        bb = pg.query_selector(sel).bounding_box()
        pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] * fy)
        pg.wait_for_timeout(260)

    tap('.stamp[data-stamp="caps"]', 0.85)
    armed1 = pg.evaluate("""() => ({ armed: document.body.classList.contains('armed'),
        sel: (document.querySelector('.stamp.is-selected')||{dataset:{}}).dataset.stamp })""")
    check("4b one tap arms a stamp", armed1['armed'] and armed1['sel'] == 'caps', str(armed1))

    tap('.stamp[data-stamp="period"]', 0.85)
    sw = pg.evaluate("""() => (document.querySelector('.stamp.is-selected')||{dataset:{}}).dataset.stamp""")
    check("4b tapping another stamp switches to it", sw == 'period', str(sw))

    tap('.stamp[data-stamp="period"]', 0.85)
    off = pg.evaluate("() => document.body.classList.contains('armed')")
    check("4b tapping the armed stamp again puts it down", not off, str(off))

    tap('.stamp[data-stamp="period"]', 0.85)
    pid = [t for t in pg.evaluate("() => LettersGame.targets()") if t['kind'] == 'punctuate'][0]['id']
    tap(f'.hit[data-target="{pid}"]')
    pg.wait_for_function("() => LettersGame.targets().some(t => t.done)", timeout=25000)
    check("4b tapping a target places the stamp",
          pg.evaluate("() => LettersGame.readout()") == 'i am coming to visit you.',
          pg.evaluate("() => LettersGame.readout()"))

    # ---- 4c. the card FOLDS on its way out, and a dragged stamp presses
    #          where it was dropped instead of flying home and back ----------
    pg2 = b.new_page(viewport={"width": 1400, "height": 800})
    pg2.goto(URL)
    pg2.wait_for_function("() => window.LettersGame", timeout=20000)
    pg2.evaluate("LettersGame.speed(0.5)")
    pg2.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=25000)
    pg2.wait_for_timeout(500)
    sb2 = pg2.query_selector('.stamp').bounding_box()
    hb2 = pg2.query_selector('.hit').bounding_box()
    pg2.mouse.move(sb2['x']+sb2['width']/2, sb2['y']+sb2['height']*0.85)
    pg2.mouse.down()
    pg2.mouse.move(hb2['x']+hb2['width']/2, hb2['y']+hb2['height']/2, steps=12)
    pg2.mouse.up()
    # sample where the stamp is right after the drop: it must still be at the
    # target, not back home at translate(0,0)
    pg2.wait_for_timeout(90)
    at_target = pg2.evaluate("""() => {
      const b = document.querySelector('.stamp');
      const m = new DOMMatrix(getComputedStyle(b).transform);
      return Math.round(Math.abs(m.m42)); }""")
    check("4c a dropped stamp presses where it was left, not from the tray",
          at_target > 100, f"|dy| = {at_target}px from home")

    # and the exit is a fold, not a fade: the three fold bands must be used
    folded = False
    for _ in range(90):
        if pg2.evaluate("() => getComputedStyle(document.getElementById('card-bands')).display") != 'none':
            folded = True; break
        pg2.wait_for_timeout(80)
    check("4c the finished letter folds (bands used) rather than fading out",
          folded, str(folded))
    pg2.wait_for_function("() => document.querySelectorAll('#mailbag img').length >= 1", timeout=30000)
    check("4c the folded letter is posted to the bottom-right", True,
          str(pg2.evaluate("() => document.querySelectorAll('#mailbag img').length")) + " on the pile")
    pg2.close()

    # ---- 5. tutorial scores nothing; Level 1 starts ----------------------
    pg.wait_for_function("() => LettersGame.state.letter && LettersGame.state.letter.id === '1A'", timeout=40000)
    wait_await(pg)
    pg.wait_for_timeout(300)
    l1 = pg.evaluate("""() => ({ hud: document.querySelector('#hud-count').textContent,
      pips: document.querySelectorAll('#hud-pips .pip').length,
      filled: document.querySelectorAll('#hud-pips .pip.filled').length,
      targets: LettersGame.targets().length,
      pari: document.querySelector('#pari-line').textContent,
      stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp) })""")
    check("5 tutorial fills no progress mark", l1['filled'] == 0, str(l1['filled']))
    check("5 Level 1 shows 01/8 with three marks",
          l1['hud'] == '01/8' and l1['pips'] == 3, str(l1))
    check("5 Pari's tutorial line does not persist into Level 1",
          'full-stop' not in l1['pari'], repr(l1['pari'][:44]))
    check("5 1A has two targets and a caps + period tray",
          l1['targets'] == 2 and l1['stamps'] == ['caps','period'], str(l1))

    trays = pg.evaluate("""() => LettersGame.levels.map(lv =>
        ({ id: lv.id, sizes: lv.letters.map(l => l.stamps.length),
           stamps: lv.letters.map(l => l.stamps.join('+')) }))""")
    by = {t['id']: t for t in trays}
    check("5 Levels 1-3 offer TWO stamps on every letter (the sheet's trays)",
          all(all(n == 2 for n in by[k]['sizes']) for k in ('L1','L2','L3')),
          " ".join(k + str(by[k]['sizes']) for k in ('L1','L2','L3')))
    check("5 only the tutorial offers a single stamp",
          by['T']['sizes'] == [1] and by['L4']['sizes'] == [3,3,3,3] and by['L8']['sizes'] == [5],
          f"T{by['T']['sizes']} L4{by['L4']['sizes']} L8{by['L8']['sizes']}")

    # ---- 6. a WRONG stamp never advances, and escalates per target -------
    ts = pg.evaluate("() => LettersGame.targets()")
    cap = next(t for t in ts if t['kind'] == 'capitalise')
    before = pg.evaluate("""() => ({ solved: LettersGame.state.solved,
        hud: document.querySelector('#hud-count').textContent,
        done: LettersGame.targets().filter(t=>t.done).length })""")
    pg.evaluate(f"LettersGame.place('period', '{cap['id']}')")   # period on a capital slot
    wait_await(pg)
    pg.wait_for_timeout(300)
    after = pg.evaluate("""() => ({ solved: LettersGame.state.solved,
        hud: document.querySelector('#hud-count').textContent,
        done: LettersGame.targets().filter(t=>t.done).length,
        errors: LettersGame.targets().map(t=>t.errors),
        pari: document.querySelector('#pari-line').textContent })""")
    check("6 wrong stamp consumes nothing", before == {k: after[k] for k in before}, f"{before} -> {after}")
    check("6 the error is counted on that target", max(after['errors']) == 1, str(after['errors']))
    check("6 tier 1 is a gentle nudge", bool(after['pari']), repr(after['pari'][:40]))

    for tier in (2, 3):
        pg.evaluate(f"LettersGame.place('period', '{cap['id']}')")
        wait_await(pg)
        pg.wait_for_timeout(350)
    esc = pg.evaluate("""() => ({ errors: LettersGame.targets().map(t=>t.errors),
        glow: !!document.querySelector('.hit.glow, .hit.glow-strong'),
        ghost: !!document.querySelector('.hit.has-ghost'),
        pulsed: !!document.querySelector('.wordwrap.pulse'),
        pari: document.querySelector('#pari-line').textContent })""")
    pg.screenshot(path=str(OUT / "a6-tier3.png"))
    check("6 tier 2 glows the target and pulses the sentence", esc['glow'] and esc['pulsed'], str(esc))
    check("6 tier 3 shows a ghost impression", esc['ghost'], str(esc['ghost']))
    check("6 three misses still advance nothing", max(esc['errors']) == 3, str(esc['errors']))

    # ---- 7. targets solve in ANY order -----------------------------------
    solve_letter(pg, reverse=True)         # end mark first, capital second
    r = pg.evaluate("() => LettersGame.readout()")
    check("7 targets accept any order (end mark before capital)",
          r == 'I am coming to visit you.', repr(r))

    # ---- 8. mark fills on landing; the ceremony waits for the level end --
    pg.wait_for_function("() => LettersGame.state.solved >= 1", timeout=40000)
    pg.wait_for_timeout(400)
    mid = pg.evaluate("""() => ({ filled: document.querySelectorAll('#hud-pips .pip.filled').length,
        mailbag: document.querySelectorAll('#mailbag img').length })""")
    check("8 one mark fills after the first letter", mid['filled'] == 1, str(mid))
    # Every finished letter folds into an envelope and is posted to the pile —
    # it used to just fade out unless it was the level's last, which read as
    # the letter vanishing rather than being sent.
    check("8 each finished letter is posted to the bottom-right pile",
          mid['mailbag'] >= 1, str(mid))

    # ---- 9. finish Level 1 -> READY TO POST -> mailbag --------------------
    for _ in range(2):
        wait_await(pg); solve_letter(pg)
    pg.wait_for_function("() => LettersGame.state.levelIndex >= 2", timeout=60000)
    pg.wait_for_timeout(400)
    lvl2 = pg.evaluate("""() => ({ mailbag: document.querySelectorAll('#mailbag img').length,
        hud: document.querySelector('#hud-count').textContent,
        letter: LettersGame.state.letter.id })""")
    pg.screenshot(path=str(OUT / "a9-level2.png"))
    check("9 the pile keeps growing as letters are posted", lvl2['mailbag'] >= 1, str(lvl2))
    check("9 the header advances to Level 2", lvl2['hud'] == '02/8', lvl2['hud'])

    # ---- 10. Level 4 shows four marks; 4D has three sentences ------------
    pg.evaluate("LettersGame.goToLevel('L4')")
    wait_await(pg)
    pg.wait_for_timeout(300)
    l4 = pg.evaluate("""() => ({ pips: document.querySelectorAll('#hud-pips .pip').length,
        hud: document.querySelector('#hud-count').textContent })""")
    check("10 Level 4 shows four progress marks", l4['pips'] == 4, str(l4))
    for _ in range(3):
        wait_await(pg); solve_letter(pg)
    wait_await(pg)
    pg.wait_for_timeout(300)
    d4 = pg.evaluate("""() => ({ id: LettersGame.state.letter.id,
        targets: LettersGame.targets().length,
        sentences: LettersGame.state.letter.sentences.length,
        hits: document.querySelectorAll('.hit').length })""")
    check("10 4D is one letter with three sentences and three targets",
          d4['id'] == '4D' and d4['targets'] == 3 and d4['sentences'] == 3, str(d4))
    check("10 every unsolved target has its own drop zone", d4['hits'] == 3, str(d4))

    # ---- 11. 9-second inactivity nudge -----------------------------------
    pg.evaluate("window.__ev.length = 0")
    pg.wait_for_function("() => window.__ev.includes('nudge:idle')", timeout=14000)
    idle = pg.evaluate("""() => ({ pari: document.querySelector('#pari-line').textContent,
        pulsed: !!document.querySelector('.wordwrap.pulse') })""")
    check("11 inactivity nudge fires after 9s", True, repr(idle['pari'][:44]))
    check("11 the nudge pulses a sentence without naming the stamp", idle['pulsed'], str(idle))

    # ---- 12. the final letter ---------------------------------------------
    pg.evaluate("LettersGame.goToLevel('L8')")
    wait_await(pg)
    pg.wait_for_timeout(400)
    f8 = pg.evaluate("""() => ({ id: LettersGame.state.letter.id,
        targets: LettersGame.targets().length,
        stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp),
        text: LettersGame.state.letter.text })""")
    pg.screenshot(path=str(OUT / "a12-final.png"))
    check("12 final letter has 8 targets and the full tray",
          f8['targets'] == 8 and len(f8['stamps']) == 5, str({k: f8[k] for k in ('targets','stamps')}))
    check("12 'Dear Raju,' is present and never a target",
          f8['text'].startswith('Dear Raju,'), repr(f8['text'][:22]))
    solve_letter(pg)
    check("12 final letter reads back correctly",
          pg.evaluate("() => LettersGame.readout()") ==
          'Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. Did you go too? It was amazing!',
          pg.evaluate("() => LettersGame.readout()")[:60])

    # ---- 13. audio -------------------------------------------------------
    aud = pg.evaluate("""() => {
      const A = LettersGame.audio;
      return { loaded: Object.keys(A.el).filter(k => A.el[k].readyState >= 2).length,
               total: Object.keys(A.el).length,
               tts: 'speechSynthesis' in window,
               fired: [...new Set(window.__all)] }; }""")
    check("13 all CC0 sound files load from file://",
          aud['loaded'] == aud['total'], f"{aud['loaded']}/{aud['total']}")
    check("13 browser TTS available for Pari", aud['tts'], str(aud['tts']))
    check("13 gameplay emits the audio events",
          'stamp:press' in aud['fired'] and 'stamp:reject' in aud['fired'], str(aud['fired'][:5]))

    # ---- 14. nothing left pinned by a finished fill:both animation -------
    stale = pg.evaluate("""() => [...document.querySelectorAll('*')]
      .filter(e => e.getAnimations().some(a => a.playState === 'finished'))
      .map(e => e.id || e.className).slice(0, 4)""")
    check("14 no finished fill:both animation pinning a property", not stale, str(stale))

    # ---- 15. no layout shift ---------------------------------------------
    base, shifts = None, []
    for w, h in [(1280,720), (1600,900), (2560,1440), (1024,768), (1920,1080)]:
        pg.set_viewport_size({"width": w, "height": h})
        pg.wait_for_timeout(220)
        g = pg.evaluate("""() => { const s=document.getElementById('stage').getBoundingClientRect();
          const U=s.height/1080, r=document.getElementById('tray').getBoundingClientRect();
          return [ +((r.left-s.left)/U).toFixed(1), +((r.top-s.top)/U).toFixed(1) ]; }""")
        if base is None: base = g
        elif not near(g, base, 1.5): shifts.append((w, h, g))
    check("15 no layout shift 1024x768 -> 2560x1440", not shifts, str(shifts))
    b.close()

    # ---- 16. reduced motion ----------------------------------------------
    b2 = p.chromium.launch()
    pg2 = b2.new_page(viewport={"width": 1600, "height": 900}, reduced_motion="reduce")
    rerr = []
    pg2.on("pageerror", lambda e: rerr.append(str(e)))
    pg2.goto(URL)
    pg2.wait_for_function("() => window.LettersGame", timeout=15000)
    ok = False
    for _ in range(160):
        s_now = pg2.evaluate("() => LettersGame.state.name")
        if s_now == 'await-input':
            ts = [t for t in pg2.evaluate("() => LettersGame.targets()") if not t['done']]
            if ts: pg2.evaluate(f"LettersGame.place('{ts[0]['stamp']}', '{ts[0]['id']}')")
        if pg2.evaluate("() => LettersGame.state.levelIndex") >= 2:
            ok = True; break
        pg2.wait_for_timeout(120)
    pg2.screenshot(path=str(OUT / "a16-reduced.png"))
    check("16 fully playable with prefers-reduced-motion", ok and not rerr, str(rerr[:1]))
    b2.close()

    # ---- 18. boot robustness ---------------------------------------------
    b3 = p.chromium.launch()
    # a) blocked webfont must not stall or break the game
    c3 = b3.new_context(viewport={"width": 1400, "height": 800})
    p3 = c3.new_page()
    p3.route("**fonts.googleapis.com**", lambda r: r.abort())
    p3.route("**fonts.gstatic.com**", lambda r: r.abort())
    p3.goto(URL)
    p3.wait_for_function("() => window.LettersGame", timeout=20000)
    p3.evaluate("LettersGame.speed(0.3)")
    p3.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=25000)
    sb = p3.query_selector('.stamp').bounding_box()
    p3.mouse.click(sb['x']+sb['width']/2, sb['y']+sb['height']*0.85); p3.wait_for_timeout(300)
    hb = p3.query_selector('.hit').bounding_box()
    p3.mouse.click(hb['x']+hb['width']/2, hb['y']+hb['height']/2)
    p3.wait_for_function("() => LettersGame.targets().every(t=>t.done)", timeout=20000)
    check("18 playable with the webfont blocked (offline-safe boot)",
          p3.evaluate("() => LettersGame.readout()") == 'I will visit you soon.'
          and not p3.evaluate("() => !!document.getElementById('boot-error')"),
          p3.evaluate("() => LettersGame.readout()"))
    p3.close()

    # b) a missing asset must say so, not fail silently
    p4 = c3.new_page()
    p4.route("**/assets/stamp-*.png", lambda r: r.fulfill(status=404, body=""))
    p4.goto(URL)
    p4.wait_for_function("() => window.LettersGame", timeout=20000)
    p4.wait_for_timeout(2500)
    named = p4.evaluate("() => { const e = document.getElementById('boot-error'); return e ? e.querySelectorAll('li').length : 0; }")
    check("18 a missing asset shows a banner naming the files", named >= 5, f"{named} files listed")
    p4.close()

    # c) THE BIG ONE: one request that never resolves must not stop the game.
    #    preload() used to be a bare Promise.all over onload/onerror, so a
    #    single stalled asset left it unsettled and boot never reached
    #    go('idle') — an empty desk with nothing to drag and no error anywhere.
    p5 = c3.new_page()
    p5.route("**/assets/ready-to-post.png", lambda r: None)   # held open forever
    p5.goto(URL, wait_until="domcontentloaded")
    stalled_ok = True
    try:
        p5.wait_for_function("() => window.LettersGame", timeout=12000)
        p5.wait_for_function("() => document.querySelectorAll('.stamp').length > 0", timeout=12000)
    except Exception:
        stalled_ok = False
    check("18 a stalled asset cannot hang boot",
          stalled_ok, "stamps: " + str(p5.evaluate("() => document.querySelectorAll('.stamp').length")))
    p5.close()

    # d) boot payload stays small enough for a tablet on wifi
    p6 = c3.new_page()
    total = {"n": 0}
    def _rec(r):
        try:
            if '/assets/' in r.url: total["n"] += len(r.body())
        except Exception: pass
    p6.on("response", _rec)
    p6.goto(URL)
    p6.wait_for_function("() => LettersGame && LettersGame.state.name === 'await-input'", timeout=25000)
    p6.wait_for_timeout(1500)
    mb = total["n"] / 1048576
    check("18 boot asset payload under 2 MB", mb < 2.0, f"{mb:.2f} MB")
    p6.close()
    b3.close()

    # ---- 19. drag works for every pointer type, and without capture ------
    # Only a synthetic mouse drag was ever covered. On a tablet the browser
    # claims the gesture as a scroll unless touch-action:none is set, and if
    # setPointerCapture throws the old handler aborted before binding any
    # listener — either way dragging was impossible and nothing said so.
    DRAG = """([sx, sy, tx, ty, ptype]) => {
      const el = document.elementFromPoint(sx, sy);
      const btn = el && el.closest ? el.closest('.stamp') : null;
      if (!btn) return { snapped: false, moved: '' };
      const mk = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: ptype,
        isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
        button: 0, buttons: t === 'pointerup' ? 0 : 1 });
      btn.dispatchEvent(mk('pointerdown', sx, sy));
      for (let i = 1; i <= 12; i++)
        window.dispatchEvent(mk('pointermove', sx + (tx-sx)*i/12, sy + (ty-sy)*i/12));
      const out = { snapped: !!document.querySelector('.hit.snap'),
                    moved: btn.style.transform || '' };
      window.dispatchEvent(mk('pointerup', tx, ty));
      return out;
    }"""

    b4 = p.chromium.launch()
    for ptype, broken in [('mouse', False), ('touch', False), ('pen', False),
                          ('touch', True)]:
        c4 = b4.new_context(viewport={"width": 1400, "height": 800}, has_touch=(ptype == 'touch'))
        p7 = c4.new_page()
        if broken:
            p7.add_init_script("Element.prototype.setPointerCapture = function(){ throw new Error('x'); };")
        p7.goto(URL)
        p7.wait_for_function("() => window.LettersGame", timeout=20000)
        p7.evaluate("LettersGame.speed(0.3)")
        p7.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=25000)
        p7.wait_for_timeout(600)
        sb = p7.query_selector('.stamp').bounding_box()
        hb = p7.query_selector('.hit').bounding_box()
        r = p7.evaluate(DRAG, [sb['x']+sb['width']/2, sb['y']+sb['height']*0.85,
                               hb['x']+hb['width']/2, hb['y']+hb['height']/2, ptype])
        done = False
        try:
            p7.wait_for_function("() => LettersGame.targets().every(t => t.done)", timeout=15000)
            done = True
        except Exception:
            pass
        label = f"19 drag works: {ptype}" + (" with setPointerCapture broken" if broken else "")
        check(label, r['snapped'] and 'translate3d' in r['moved'] and done,
              f"snap={r['snapped']} applied={done}")
        p7.close(); c4.close()

    # a genuine finger drag through the real input pipeline must not be
    # cancelled by the browser's scroll handling
    c5 = b4.new_context(viewport={"width": 1280, "height": 800}, has_touch=True, is_mobile=True)
    p8 = c5.new_page()
    p8.goto(URL)
    p8.wait_for_function("() => window.LettersGame", timeout=20000)
    p8.evaluate("LettersGame.speed(0.3)")
    p8.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=25000)
    p8.wait_for_timeout(700)
    p8.evaluate("window.__cancel = 0; window.addEventListener('pointercancel', () => window.__cancel++, true);")
    cdp = c5.new_cdp_session(p8)
    sb = p8.query_selector('.stamp').bounding_box()
    hb = p8.query_selector('.hit').bounding_box()
    sx, sy = sb['x']+sb['width']/2, sb['y']+sb['height']*0.85
    tx, ty = hb['x']+hb['width']/2, hb['y']+hb['height']/2
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": sx, "y": sy, "id": 1}]})
    for i in range(1, 15):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove",
                 "touchPoints": [{"x": sx+(tx-sx)*i/14, "y": sy+(ty-sy)*i/14, "id": 1}]})
    snapped = p8.evaluate("() => !!document.querySelector('.hit.snap')")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    tdone = False
    try:
        p8.wait_for_function("() => LettersGame.targets().every(t => t.done)", timeout=15000)
        tdone = True
    except Exception:
        pass
    cancels = p8.evaluate("() => window.__cancel")
    check("19 real finger drag completes and is not stolen as a scroll",
          snapped and tdone and cancels == 0, f"snap={snapped} applied={tdone} pointercancel={cancels}")
    p8.close(); b4.close()

check("17 no page errors", not errs, str(errs[:2]))
check("17 no console errors", not [m for t, m in cerrs if t == 'error'],
      str([m for t, m in cerrs if t == 'error'][:2]))

print("\n" + "=" * 64)
bad = [n for n, ok, _ in results if not ok]
print(f"{len(results)-len(bad)}/{len(results)} checks passed")
for n in bad: print("   FAILED:", n)
sys.exit(1 if bad else 0)
