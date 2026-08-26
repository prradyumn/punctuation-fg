# Acceptance suite for "Letters".
#   pip install playwright pillow && playwright install chromium
#   python test.py
# Screenshots land in shots/. Exit code 0 = every check passed.
import pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
# Every page below boots STRAIGHT ONTO THE DESK. The shipped entry point is the
# title card, and a 1:05 film in front of each of the dozen pages this suite
# opens would put the run beyond a quarter of an hour of watching video. The
# real way in — cover, PLAY, film, game, closing film, cover again — is walked
# once, in section 25, at TITLE_URL.
TITLE_URL = (ROOT / "index.html").as_uri()
URL = TITLE_URL + "?nointro=1"
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
    pg.evaluate("window.__ev=[]; window.__all=[]; ['stamp:press','stamp:reject','repair:progress','letter:seal','letter:post','set:complete','nudge:idle','nudge:error'].forEach(n=>document.addEventListener(n,e=>{window.__ev.push(n);window.__all.push(n);}))")
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
    check("1 all 23 letters reconstruct to their expected answer",
          not content['bad'] and content['letters'] == 23, str(content['bad'][:2]) or f"{content['letters']} letters")
    check("1 every target has its stamp in the tray", not content['bad'], "")
    # Level 4 opened with a fourth screen, "I reached home safely.", and it was
    # removed — so 23 letters and 40 repairs, not 24 and 41.
    check("1 nine level groups, 40 scored repairs",
          content['levels'] == 9 and content['targets'] == 40,
          f"{content['levels']} groups / {content['targets']} targets")

    # ---- 1a. the feedback table is the source of truth -------------------
    # Every dialogue line in the game must trace to a cell in the tables, and
    # every cell must be in the game. Checked cell by cell, because the failure
    # it catches is silent: a default that LOOKS like content.
    #
    # Columns checked, six per screen: the tray, the expected answer, the three
    # Incorrect-feedback lines, and the inactivity nudge. The three feedback
    # lines are transcribed from "The Punctuation Puzzle - Incorrect Feedback",
    # which supersedes the gameplay sheet's Wrong 1/2/3 columns: error 1 is one
    # shared line on every screen, error 2 a one-layer hint, and error 3 — silent
    # on the old sheet — a direct instruction. The tray, answer and stall columns
    # still come from the gameplay sheet, which the feedback table does not
    # cover, and the tutorial keeps its own lines: it is the practice set, which
    # the feedback table excludes and which has no failure state.
    OOPS = 'Oops! Try again.'
    SHEET = [
      # screen, id,   tray,                  expected answer,
      #                error 1, error 2, error 3, stall
      # `screen` is the GAMEPLAY SHEET's own number, kept as the sheet writes
      # it — so there is no screen 11 here: that row was "I reached home
      # safely." and the screen is gone. Renumbering would have quietly broken
      # the one thing the column is for, which is finding the row again.
      (1, 'T', ['period'], 'I will visit you soon.',
       'Try placing it at the end of the sentence.', None, None,
       'Place the full-stop stamp at the end of the sentence.'),
      (2, '1A', ['caps', 'period'], 'I am coming to visit you.',
       OOPS, 'Check the beginning and end. Choose the stamps that fix them.',
       'Make ‘i’ a capital ‘I’ and put a full stop at the end.', None),
      (3, '1B', ['caps', 'period'], 'We made hot samosas.',
       OOPS, 'Check the beginning and end. Choose the stamps that fix them.',
       'Make ‘we’ begin with a capital ‘W’ and put a full stop at the end.',
       'Look at the beginning and end of the sentence.'),
      (4, '1C', ['caps', 'period'], 'The fair was very busy.',
       OOPS, 'Something is wrong at the beginning and end. Fix them.',
       'Make ‘the’ begin with a capital ‘T’ and put a full stop at the end.',
       'Look at the beginning and end of the sentence.'),
      (5, '2A', ['period', 'question'], 'Are you excited?',
       OOPS, 'This sentence is asking something. Choose the stamp that shows this at the end.',
       'It is asking a question. Put the question mark at the end.',
       'Is the writer telling us something or asking something?'),
      (6, '2B', ['period', 'question'], 'I hope you are well.',
       OOPS, 'This sentence is telling something. Choose the stamp that ends it.',
       'It is telling something. Put the full stop at the end.',
       'Is the writer telling us something or asking something?'),
      (7, '2C', ['period', 'question'], 'Did you get my last letter?',
       OOPS, 'This sentence is asking something. Choose the stamp that shows this at the end.',
       'It is asking a question. Put the question mark at the end.',
       'Is the writer telling us something or asking something?'),
      (8, '3A', ['period', 'exclamation'], 'What a wonderful gift!',
       OOPS, 'This sentence shows a strong feeling. Choose the stamp that shows this at the end.',
       'It shows a strong feeling. Put the exclamation mark at the end.',
       'Is this ordinary information or a strong feeling?'),
      (9, '3B', ['period', 'exclamation'], 'I will come on Sunday.',
       OOPS, 'This sentence is telling something. Choose the stamp that ends it.',
       'It is telling something. Put the full stop at the end.',
       'Is this ordinary information or a strong feeling?'),
      (10, '3C', ['period', 'exclamation'], 'We won the match!',
       OOPS, 'This sentence shows excitement. Choose the stamp that shows this at the end.',
       'It shows a strong feeling. Put the exclamation mark at the end.',
       'Is this ordinary information or a strong feeling?'),
      # The table's level-4 rows are labelled 4A/4B/4C against this game's
      # 4B/4C/4D — matched by content, not by label. The statement screen the
      # level used to open with ("I reached home safely.") was the one row the
      # table did not have, and it has been removed, so the level's three
      # screens and the table's three rows now correspond exactly.
      (12, '4B', ['period', 'question', 'exclamation'], 'Can you come tomorrow?',
       OOPS, 'This sentence is asking something. Choose the right stamp for the end.',
       'It is asking a question. Put the question mark at the end.',
       'Is it telling, asking, or showing a strong feeling?'),
      (13, '4C', ['period', 'question', 'exclamation'], 'Look at that huge kite!',
       OOPS, 'This sentence shows excitement. Choose the right stamp for the end.',
       'It shows a strong feeling. Put the exclamation mark at the end.',
       'Is it telling, asking, or showing a strong feeling?'),
      # 4D states its lines per sentence, in `each` — checked below.
      (14, '4D', ['period', 'question', 'exclamation'],
       'I have a new puppy. Do you want to meet him? I am so excited!',
       OOPS, 'What is this sentence doing — telling, asking, or showing strong feeling?',
       None, "Let's fix one sentence at a time."),
      (15, '5A', ['comma', 'period'], 'Please send me crayons, storybooks and stickers.',
       OOPS, 'These are different things in a list. Choose the stamp that separates them.',
       'Put a comma after ‘crayons’ to separate the items.',
       'Which words are separate things in the list?'),
      (16, '5B', ['comma', 'period'], 'We saw monkeys, parrots and rabbits at the fair.',
       OOPS, 'These animals form a list. Choose the stamp that separates them.',
       'Put a comma after ‘monkeys’ to separate the animals.',
       'Which words are separate things in the list?'),
      (17, '5C', ['comma', 'period'], 'Please send crayons, storybooks, stickers and a ball.',
       OOPS, 'These things form a list. Choose the stamp that separates them.',
       'Put commas after ‘crayons’ and ‘storybooks’ to separate the items.',
       'Which words are separate things in the list?'),
      (18, '6A', ['caps', 'comma'], "Let's eat, Dadi!",
       OOPS, 'You are speaking to Dadi. Choose the stamp that separates her name.',
       'You are speaking to Dadi. Put a comma before ‘Dadi’.',
       'Does this sentence say what the writer means?'),
      (19, '6B', ['comma', 'period'], 'I miss you, Nani!',
       OOPS, 'You are speaking to Nani. Choose the stamp that separates her name.',
       'You are speaking to Nani. Put a comma before ‘Nani’.',
       'Who is the writer speaking to?'),
      (20, '6C', ['caps', 'comma'], 'See you soon, Raju!',
       OOPS, 'You are speaking to Raju. Choose the stamp that separates his name.',
       'You are speaking to Raju. Put a comma before ‘Raju’.',
       'Who is the writer speaking to?'),
      (21, '7A', ['caps', 'period', 'question', 'exclamation'], 'Where is my red scarf?',
       OOPS, 'Fix how the sentence begins and how the question ends.',
       'Make ‘where’ begin with a capital ‘W’ and put a question mark at the end.',
       'Can you spot what needs fixing?'),
      (22, '7B', ['caps', 'period', 'question', 'exclamation'], 'What a beautiful card!',
       OOPS, 'Fix how the sentence begins and how the excitement ends.',
       'Make ‘what’ begin with a capital ‘W’ and put an exclamation mark at the end.',
       'Can you spot what needs fixing?'),
      (23, '7C', ['caps', 'period', 'question', 'exclamation'], 'I will write again soon.',
       OOPS, 'Fix how the sentence begins and how the statement ends.',
       'Make ‘i’ a capital ‘I’ and put a full stop at the end.',
       'Can you spot what needs fixing?'),
      # the Final Letter states its error-3 instruction per repair, in `each`.
      (24, '8', ['caps', 'period', 'comma', 'question', 'exclamation'],
       'Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. '
       'Did you go too? It was amazing!',
       OOPS, 'Look at this part. Choose the stamp that fixes it.', None,
       'Check the letter carefully. What still needs fixing?'),
    ]
    authored = pg.evaluate("""() => {
      const out = {};
      LettersGame.levels.forEach(lv => lv.letters.forEach(L => {
        out[L.id] = { stamps: L.stamps, read: L.read, instruction: L.instruction,
                      e1: L.say.e1 || null, e2: L.say.e2 || null,
                      e3: L.say.e3 || null, idle: L.say.idle || null,
                      each: L.each || null, w2: L.w2 || null }; }));
      return out; }""")
    off = []
    for screen, lid, tray, answer, e1, e2, e3, stall in SHEET:
        g = authored.get(lid)
        if not g:
            off.append(f"screen {screen}: no letter {lid}")
            continue
        for col, got, want in (('tray', g['stamps'], tray),
                               ('answer', g['read'], answer),
                               ('error 1', g['e1'], e1), ('error 2', g['e2'], e2),
                               ('error 3', g['e3'], e3), ('stall', g['idle'], stall)):
            if got != want:
                off.append(f"screen {screen} {lid} {col}: {got!r} != {want!r}")
    check(f"1a all {len(SHEET) * 6} sheet + feedback-table cells match the game",
          not off, "; ".join(off[:3]))

    # Every screen the table covers says something at all three tiers. Error 3
    # is the one that regressed silently before: it was null on all twenty-four
    # screens under the old sheet, and reject() fell through to the error-2 line.
    quiet = [l for _, l, *_ in SHEET if l != 'T'
             and not (authored[l]['e3'] or authored[l]['each'])]
    check("1a every screen but the practice set gives a direct instruction at error 3",
          not quiet, str(quiet))
    check("1a error 1 is the same line on every screen the table covers",
          {authored[l]['e1'] for _, l, *_ in SHEET if l != 'T'} == {OOPS},
          str(sorted({authored[l]['e1'] for _, l, *_ in SHEET if l != 'T'})))

    # The two screens whose repairs are different questions state a line per
    # repair — one per sentence for 4D, one per cell for the Final Letter.
    check("1a 4D states an error 2 and 3 for each of its three sentences",
          [len(authored['4D']['each'])] == [3]
          and all(e.get('e2') and e.get('e3') for e in authored['4D']['each']),
          str(authored['4D']['each']))
    check("1a the Final Letter states all eight of its error-3 instructions",
          [e['e3'] for e in authored['8']['each']] == [
            'Make ‘i’ a capital ‘I’.', 'Put a full stop after ‘fair’.',
            'Put a comma after ‘monkeys’.', 'Put a full stop after ‘rabbits’.',
            'Make ‘did’ begin with a capital ‘D’.', 'Put a question mark after ‘too’.',
            'Make ‘it’ begin with a capital ‘I’.',
            'Put an exclamation mark after ‘amazing’.'],
          str([e['e3'] for e in authored['8']['each']]))

    # Which area the second error lights, per the table's animation column.
    W2 = {'1A': 'ends', '1B': 'ends', '1C': 'ends',
          '2A': 'end', '2B': 'end', '2C': 'end',
          '3A': 'end', '3B': 'end', '3C': 'end',
          '4B': 'end', '4C': 'end', '4D': 'end',
          '5A': 'list', '5B': 'list', '5C': 'list',
          '6A': 'name', '6B': 'name', '6C': 'name',
          '7A': 'ends', '7B': 'ends', '7C': 'ends', '8': 'sentence'}
    bad_w2 = {k: authored[k]['w2'] for k, v in W2.items() if authored[k]['w2'] != v}
    check("1a every screen lights the area its error-2 cell names", not bad_w2, str(bad_w2))
    # No screen after the tutorial gets its own instruction: the sheet's
    # Instruction column reads the same sentence for all 23.
    inst = {authored[l]['instruction'] for _, l, *_ in SHEET if l != 'T'}
    check("1a every level after the tutorial shares one instruction line",
          inst == {'Fix the sentence with the stamps.'}, str(sorted(inst)))

    # ---- 1c. the stall cue is per screen ---------------------------------
    # The sheet gives every screen its own inactivity visual and they are not
    # interchangeable: Levels 2-4 bounce their stamps and leave the words
    # alone, Levels 5-8 do the exact reverse, 1B/1C pulse only the two ends of
    # the sentence, and 7A says "no stamp animates" in as many words. All 24
    # used to get the same staggered tray wave — the wrong cue on fourteen of
    # them and the forbidden one on 7A.
    STALL = {
      'T': ('one', 'word'), '1A': ('all', 'ends'),
      '1B': (None, 'ends'), '1C': (None, 'ends'),
      '2A': ('all', None), '2B': ('all', None), '2C': ('all', None),
      '3A': ('all', None), '3B': ('all', None), '3C': ('all', None),
      '4B': ('all', None), '4C': ('all', None),
      '4D': (None, 'sentence'),
      '5A': (None, 'sentence'), '5B': (None, 'sentence'), '5C': (None, 'sentence'),
      '6A': (None, 'sentence'), '6B': (None, 'sentence'), '6C': (None, 'sentence'),
      '7A': (None, 'sentence'), '7B': (None, 'sentence'), '7C': (None, 'sentence'),
      '8':  (None, 'letter'),
    }
    p_s = b.new_page(viewport={"width": 1920, "height": 1080})
    p_s.goto(URL)
    p_s.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                          timeout=40000)
    p_s.evaluate("LettersGame.mute(true); LettersGame.speed(0.25)")
    off = []
    for lid, (want_stamps, want_text) in STALL.items():
        lvl = 'T' if lid == 'T' else ('L8' if lid == '8' else 'L' + lid[0])
        p_s.evaluate(f"LettersGame.goToLevel('{lvl}')")
        p_s.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=30000)
        p_s.evaluate("""async (id) => {
          const t0 = performance.now();
          while (performance.now() - t0 < 120000 && LettersGame.state.letter.id !== id) {
            if (LettersGame.state.name === 'await-input') {
              const t = LettersGame.targets().find(x => !x.done);
              if (t) LettersGame.place(t.stamp, t.id);
            }
            await new Promise(r => setTimeout(r, 40));
          } }""", lid)
        p_s.wait_for_function(
            "(id) => LettersGame.state.name==='await-input' && LettersGame.state.letter.id===id",
            arg=lid, timeout=60000)
        got = p_s.evaluate("""async () => {
          /* the INSTRUCTION line waves the tray too — a different cue for a
             different purpose. Let it finish before sampling the stall. */
          await new Promise(r => setTimeout(r, 1400));
          document.querySelectorAll('.wordwrap.pulse').forEach(w => w.classList.remove('pulse'));
          let moved = 0;
          const iv = setInterval(() => {
            [...document.querySelectorAll('.stamp')].forEach((s, i) => {
              if (s.getAnimations().some(a => !a.animationName && a.playState === 'running'))
                moved |= (1 << i);
            }); }, 8);
          LettersGame.nudge();
          await new Promise(r => setTimeout(r, 600));
          clearInterval(iv);
          const pulsed = [...document.querySelectorAll('.wordwrap.pulse')];
          const all = [...document.querySelectorAll('.wordwrap')];
          return { moved, nStamps: document.querySelectorAll('.stamp').length,
                   nPulsed: pulsed.length, nAll: all.length,
                   sentences: new Set(pulsed.map(w => w.dataset.sentence)).size,
                   firstIsFirst: pulsed[0] === all[0] }; }""")
        full = 2 ** got['nStamps'] - 1
        want_mask = full if want_stamps == 'all' else (1 if want_stamps == 'one' else 0)
        if got['moved'] != want_mask:
            off.append(f"{lid} stamps {got['moved']}/{full} want {want_mask}")
        n, tot = got['nPulsed'], got['nAll']
        ok = (n == 0 if want_text is None else
              n == 1 if want_text == 'word' else
              (n == 2 and got['firstIsFirst']) if want_text == 'ends' else
              n == tot if want_text == 'letter' else
              (n > 0 and got['sentences'] == 1))
        if not ok:
            off.append(f"{lid} pulsed {n}/{tot} want {want_text}")
    p_s.close()
    check(f"1c all {len(STALL)} stall cues match the sheet", not off, "; ".join(off[:4]))

    # ---- 1d. the sheet's completion beats --------------------------------
    # Three animations the sheet asks for by name, each on the screens that ask
    # for it and nowhere else. All three were authored as content flags —
    # `comic`, `calm`, `big` — that no code read.
    p_b = b.new_page(viewport={"width": 1920, "height": 1080})
    p_b.goto(URL)
    p_b.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                          timeout=40000)
    p_b.evaluate("LettersGame.mute(true)")

    def goto_letter(page, lvl, lid):
        page.evaluate(f"LettersGame.goToLevel('{lvl}')")
        page.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=30000)
        page.evaluate("""async (id) => { const t0 = performance.now();
          while (performance.now() - t0 < 120000 && LettersGame.state.letter.id !== id) {
            if (LettersGame.state.name === 'await-input') {
              const t = LettersGame.targets().find(x => !x.done);
              if (t) LettersGame.place(t.stamp, t.id); }
            await new Promise(r => setTimeout(r, 40)); } }""", lid)
        page.wait_for_function(
            "(id) => LettersGame.state.name==='await-input' && LettersGame.state.letter.id===id",
            arg=lid, timeout=60000)
        page.wait_for_timeout(300)

    SOLVE_ONE = """async () => {
      const g = document.getElementById('card-glow');
      const words = [...document.querySelectorAll('.wordwrap')];
      let peak = 0, shift = 0;
      const iv = setInterval(() => {
        peak = Math.max(peak, +getComputedStyle(g).opacity);
        words.forEach(w => { const m = new DOMMatrixReadOnly(getComputedStyle(w).transform);
                             shift = Math.max(shift, Math.abs(m.e)); }); }, 12);
      for (;;) {
        if (LettersGame.state.name === 'await-input') {
          const t = LettersGame.targets().find(x => !x.done);
          if (!t) break;
          LettersGame.place(t.stamp, t.id);
        }
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 2200));
      clearInterval(iv);
      return { peak: +peak.toFixed(2), shift: Math.round(shift) }; }"""

    beats = {}
    for lvl, lid in (('L4', '4D'), ('L5', '5A'), ('L5', '5B')):
        goto_letter(p_b, lvl, lid)
        beats[lid] = p_b.evaluate(SOLVE_ONE)
    check("1d 4D glows when its last sentence is finished",
          beats['4D']['peak'] > 0.5 and beats['4D']['shift'] == 0, str(beats['4D']))
    check("1d 5A settles its list apart when the comma lands",
          beats['5A']['shift'] > 4 and beats['5A']['peak'] == 0, str(beats['5A']))
    check("1d a screen the sheet gives no completion beat gets neither",
          beats['5B']['peak'] == 0 and beats['5B']['shift'] == 0, str(beats['5B']))

    # 6A's comic pause: "Comma lands -> THUMP -> comic pause -> ... -> reads".
    PAUSE = """async () => {
      const line = document.getElementById('coach-line');
      return await new Promise((res) => {
        let sealAt = null;
        const before = line.textContent;
        document.addEventListener('letter:seal', () => { sealAt = performance.now(); }, {once: true});
        const iv = setInterval(() => {
          if (sealAt && line.textContent !== before) {
            clearInterval(iv); res(Math.round(performance.now() - sealAt)); } }, 8);
        setTimeout(() => { clearInterval(iv); res(-1); }, 12000);
        (async () => { for (;;) {
          if (LettersGame.state.name !== 'await-input') { await new Promise(r=>setTimeout(r,30)); continue; }
          const t = LettersGame.targets().find(x => !x.done);
          if (!t) break;
          LettersGame.place(t.stamp, t.id);
          await new Promise(r=>setTimeout(r,30)); } })();
      }); }"""
    goto_letter(p_b, 'L6', '6A'); comic = p_b.evaluate(PAUSE)
    goto_letter(p_b, 'L6', '6B'); plain = p_b.evaluate(PAUSE)
    p_b.close()
    check("1d 6A holds a comic pause before its punchline",
          comic >= 600 and plain < 300, f"6A {comic}ms vs 6B {plain}ms")

    # ---- 1b. no letter may overflow the paper ----------------------------
    # The final letter needed three lines in a two-line box and was spilling
    # off the card by 54px. Nothing caught it because the earlier levels all
    # happen to be short.
    fit = pg.evaluate("""() => {
      const el = document.getElementById('sentence');
      const box = el.clientHeight;
      const bad = [];
      LettersGame.levels.forEach(lv => lv.letters.forEach(spec => {
        const L = parseLetter(spec);
        el.innerHTML = '';
        const inner = document.createElement('span');
        inner.className = 'sentence-inner';
        inner.textContent = L.text;
        el.appendChild(inner);
        const need = inner.getBoundingClientRect().height;
        if (need > box + 2) bad.push(L.id + ' needs ' + Math.round(need) + ' of ' + box);
      }));
      el.innerHTML = '';
      /* report in DESIGN px: the stage is scaled to the viewport, so the
         rendered size is design px x (stageHeight / 1080) */
      const U = document.getElementById('stage').getBoundingClientRect().height / 1080;
      return { bad, box: Math.round(box / U),
               font: +(parseFloat(getComputedStyle(el).fontSize) / U).toFixed(1) };
    }""")
    check("1b every letter fits the paper without overflowing",
          not fit['bad'], str(fit['bad'][:3]))
    check("1b sentence type is large enough to read on the card",
          fit['font'] >= 62, f"{fit['font']} design px in a {fit['box']}px box")

    # ---- 2. tutorial boots; geometry matches the Figma nodes -------------
    wait_await(pg)
    pg.wait_for_timeout(400)
    st = pg.evaluate("""() => ({
      level: LettersGame.state.levelIndex, letter: LettersGame.state.letter.id,
      stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp),
      hits: document.querySelectorAll('.hit').length,
      hud: document.querySelector('#hud-count').textContent,
      pips: document.querySelectorAll('#hud-pips .pip').length,
      coach: document.querySelector('#coach-line').textContent })""")
    pg.screenshot(path=str(OUT / "a1-tutorial.png"))
    check("2 boots from file:// into the tutorial", st['letter'] == 'T', st['letter'])
    check("2 tutorial offers only the full-stop stamp", st['stamps'] == ['period'], str(st['stamps']))
    check("2 one drop zone for its one target", st['hits'] == 1, str(st['hits']))
    check("2 the coach panel gives the tutorial instruction", 'full-stop' in st['coach'], repr(st['coach'][:44]))
    # The coach panel replaced the character: it must sit along the TOP of
    # the stage, clear of both the letter card and the HUD, and be readable.
    cp = pg.evaluate("""() => {
      const s = document.getElementById('stage').getBoundingClientRect();
      const U = s.height / 1080;
      const el = document.getElementById('coach');
      const r  = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const card = document.getElementById('card-layer').getBoundingClientRect();
      const hudEl = document.getElementById('hud'), wasD = hudEl.style.display;
      hudEl.style.display = 'block';            /* hidden during the tutorial */
      const hud = hudEl.getBoundingClientRect();
      hudEl.style.display = wasD;
      return { top: Math.round((r.top - s.top) / U),
               bottom: Math.round((r.bottom - s.top) / U),
               left: Math.round((r.left - s.left) / U),
               right: Math.round((r.right - s.left) / U),
               cardTop: Math.round((card.top - s.top) / U),
               hudLeft: Math.round((hud.left - s.left) / U),
               opacity: +cs.opacity,
               font: Math.round(parseFloat(getComputedStyle(
                       document.getElementById('coach-line')).fontSize) / U),
               badge: !!document.getElementById('coach-badge') }; }""")
    check("2 the coach panel is at the top of the stage, above the letter",
          cp['top'] < 60 and cp['bottom'] <= cp['cardTop'],
          f"y {cp['top']}..{cp['bottom']} vs card top {cp['cardTop']}")
    check("2 the coach panel does not run under the HUD",
          cp['right'] <= cp['hudLeft'], f"right {cp['right']} vs HUD left {cp['hudLeft']}")
    check("2 the coach panel is visible and its text is readable",
          cp['opacity'] > 0.9 and cp['font'] >= 30,
          f"opacity {cp['opacity']}, {cp['font']} design px")

    # The narrator's own typeface and size. It is a display face at 46 design px
    # against the letter's 68px Josefin Sans, so the two voices never look like
    # the same voice — and 14 of the 78 lines need a second row at that size,
    # which the design's 102px band cannot hold. Every line must sit INSIDE the
    # panel: the height is a floor and the panel grows for the long ones.
    narr = pg.evaluate("""async () => {
      await document.fonts.ready;
      const st = document.getElementById('stage').getBoundingClientRect(), U = st.height/1080;
      const coach = document.getElementById('coach'), line = document.getElementById('coach-line');
      const card = document.getElementById('card-layer').getBoundingClientRect();
      const was = line.textContent, wasLive = coach.classList.contains('live');
      coach.classList.add('live');
      const cs = getComputedStyle(line);
      const lh = parseFloat(cs.lineHeight);
      const lines = [];
      LettersGame.levels.forEach(lv => lv.letters.forEach(L => {
        [L.instruction, L.intro, L.intro2, L.read, L.praise,
         L.say.e1, L.say.e2, L.say.e3, L.say.idle].forEach(v => { if (v) lines.push(v); });
      }));
      let spill = 0, clipped = 0, rows2 = 0, minCardGap = 1e9;
      for (const t of [...new Set(lines)]) {
        line.textContent = t;
        const cr = coach.getBoundingClientRect(), lr = line.getBoundingClientRect();
        if (Math.round(line.scrollHeight / lh) >= 2) rows2++;
        if (line.scrollHeight > line.clientHeight + 1) clipped++;
        spill = Math.max(spill, (cr.top - lr.top) / U, (lr.bottom - cr.bottom) / U);
        minCardGap = Math.min(minCardGap, (card.top - cr.bottom) / U);
      }
      line.textContent = was; if (!wasLive) coach.classList.remove('live');
      return { family: cs.fontFamily.split(',')[0].replace(/"/g, ''),
               size: +(parseFloat(cs.fontSize) / U).toFixed(0),
               loaded: document.fonts.check('16px "Lilita One"'),
               rows2, clipped, spill: +spill.toFixed(1),
               minCardGap: Math.round(minCardGap) }; }""")
    check("2 the narrator is set in Lilita One at 46 design px",
          narr['family'] == 'Lilita One' and narr['size'] == 46 and narr['loaded'],
          f"{narr['family']} {narr['size']}px, loaded={narr['loaded']}")
    check("2 every coach line fits inside the panel, none clipped",
          narr['spill'] <= 0 and narr['clipped'] == 0,
          f"worst spill {narr['spill']}px, {narr['clipped']} clipped, {narr['rows2']} lines wrap")
    check("2 the panel still clears the letter card on its longest line",
          narr['minCardGap'] > 0, f"{narr['minCardGap']}px clearance")
    check("2 no character art is left in the scene",
          pg.evaluate("() => !document.getElementById('pari')"), "#pari absent")
    hud_vis = pg.evaluate("() => getComputedStyle(document.getElementById('hud')).display")
    check("2 the tutorial shows no progress bar at all",
          hud_vis == 'none' and st['pips'] == 0, f"#hud display:{hud_vis} / {st['pips']} pips")

    geo = pg.evaluate("""() => {
      const s = document.getElementById('stage').getBoundingClientRect();
      const U = s.height / 1080;
      const d = q => { const r = document.querySelector(q).getBoundingClientRect();
        return [ +((r.left-s.left)/U).toFixed(0), +((r.top-s.top)/U).toFixed(0),
                 +(r.width/U).toFixed(0), +(r.height/U).toFixed(0) ]; };
      /* the pill is display:none during the tutorial (it scores nothing),
         so show it just long enough to measure where it lands */
      const hud = document.getElementById('hud'), was = hud.style.display;
      hud.style.display = 'block';
      const hudBox = d('#hud');
      hud.style.display = was;
      return { card: d('#card-layer'), sentence: d('#sentence'), hud: hudBox }; }""")
    near = lambda g, w, tol=4: all(abs(a-bb) <= tol for a, bb in zip(g, w))
    check("2 card at 383,158,1153,635 (Figma 94:28)", near(geo['card'], [383,158,1153,635]), str(geo['card']))
    check("2 sentence box at 507,210,906,530 (centred on the card)",
          near(geo['sentence'], [507, 210, 906, 530]), str(geo['sentence']))
    check("2 HUD at 1506,32,382,102 (94:1189)", near(geo['hud'], [1506,32,382,102]), str(geo['hud']))

    # The Figma export drew the card as a slight trapezoid — both sides leaned
    # outward going down, which against the vertical airmail stripes read as a
    # bent border. Walk the outline and confirm each side is a single x.
    edges = pg.evaluate("""() => {
      const p = document.getElementById('card-paper');
      const L = p.getTotalLength(), pts = [];
      for (let i = 0; i < 900; i++) { const q = p.getPointAtLength(L * i / 900); pts.push(q); }
      const ys = pts.map(q => q.y), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const mid = pts.filter(q => q.y > y0 + 40 && q.y < y1 - 40);   /* skip the corner arcs */
      const cx = (Math.min(...pts.map(q=>q.x)) + Math.max(...pts.map(q=>q.x))) / 2;
      const l = mid.filter(q => q.x < cx).map(q => q.x);
      const r = mid.filter(q => q.x > cx).map(q => q.x);
      const sp = a => +(Math.max(...a) - Math.min(...a)).toFixed(3);
      /* and the stripes must sit the same distance inside each edge */
      const st = [...document.querySelectorAll('#card-art .card-stripes rect')];
      const gapL = +(st[0].x.baseVal.value - Math.min(...l)).toFixed(2);
      const gapR = +(Math.max(...r) - (st[1].x.baseVal.value + st[1].width.baseVal.value)).toFixed(2);
      return { l: sp(l), r: sp(r), gapL, gapR }; }""")
    check("2 the card's left and right edges are vertical",
          edges['l'] < 0.5 and edges['r'] < 0.5,
          f"left drifts {edges['l']}, right drifts {edges['r']} design px")
    check("2 the airmail stripes sit the same distance inside each edge",
          abs(edges['gapL'] - edges['gapR']) < 0.5, f"{edges['gapL']} vs {edges['gapR']}")

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

    # A stamped correction must be unmistakable: blue ink, heavier and larger
    # than the printed text. Rendered in the same black as the sentence, the
    # learner has no way to see what they just added.
    pg.wait_for_timeout(700)
    ink = pg.evaluate("""() => {
      const m = document.querySelector('.mark.inked');
      const body = document.getElementById('sentence');
      if (!m) return null;
      const a = getComputedStyle(m), b = getComputedStyle(body);
      return { colour: a.color, textColour: b.color,
               size: parseFloat(a.fontSize), textSize: parseFloat(b.fontSize),
               weight: +a.fontWeight,
               angle: +(Math.atan2(new DOMMatrixReadOnly(a.transform).b,
                                   new DOMMatrixReadOnly(a.transform).a) * 180 / Math.PI).toFixed(2),
               dots: [...document.querySelectorAll('#sentence .slot, #sentence .ch')]
                 .filter(el => { const af = getComputedStyle(el, '::after');
                   return af.content !== 'none' && af.borderBottomStyle === 'dotted'; }).length }; }""")
    check("4b the stamped mark is inked in blue, not the text colour",
          ink and ink['colour'] == 'rgb(27, 79, 168)' and ink['colour'] != ink['textColour'],
          str(ink and ink['colour']))
    check("4b the stamped mark is larger and heavier than the text",
          ink and ink['size'] > ink['textSize'] and ink['weight'] >= 600,
          ink and f"{ink['size']:.0f}px w{ink['weight']} vs text {ink['textSize']:.0f}px")
    # The mark used to land a couple of degrees off-square, meant to read as a
    # real stamp. On a capitalised letter it just read as a wonky capital.
    check("4b the stamped mark sits square on the line",
          ink and abs(ink['angle']) < 0.01, ink and f"{ink['angle']} deg")
    # No dotted rule under a slot or a pending capital: it crowded the sentence
    # and pointed at the answer before the child had looked for it.
    check("4b nothing marks the target spot in the sentence itself",
          ink and ink['dots'] == 0, ink and f"{ink['dots']} dotted markers")

    # ---- 4c. a dragged stamp presses where dropped; tutorial skips post ---
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

    pg2.wait_for_function("() => LettersGame.state.letter && LettersGame.state.letter.id === '1A'", timeout=30000)
    tutorial_exit = pg2.evaluate("""() => ({ posted: LettersGame.state.posted,
      mailbag: document.querySelectorAll('#mailbag img').length })""")
    check("4c the tutorial bypasses folding/posting and adds no envelope",
          tutorial_exit['posted'] == 0 and tutorial_exit['mailbag'] == 0,
          str(tutorial_exit))
    jump_labels = pg2.locator('#temp-level-buttons button').all_text_contents()
    pg2.click('#temp-level-buttons button[data-level="L2"]')
    pg2.wait_for_function("() => LettersGame.state.letter && LettersGame.state.letter.id === '2A'", timeout=30000)
    active_jump = pg2.get_attribute('#temp-level-buttons button[data-level="L2"]', 'aria-current')
    check("4c the temporary review bar shows all levels in sheet order",
          jump_labels == ['Tutorial','1','2','3','4','5','6','7','Final'] and active_jump == 'true',
          repr(jump_labels))
    pg2.close()

    # ---- 5. tutorial scores nothing; Level 1 starts ----------------------
    pg.wait_for_function("() => LettersGame.state.letter && LettersGame.state.letter.id === '1A'", timeout=40000)
    wait_await(pg)
    pg.wait_for_timeout(300)
    l1 = pg.evaluate("""() => ({ hud: document.querySelector('#hud-count').textContent,
      pips: document.querySelectorAll('#hud-pips .pip').length,
      filled: document.querySelectorAll('#hud-pips .pip.filled').length,
      targets: LettersGame.targets().length,
      coach: document.querySelector('#coach-line').textContent,
      stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp) })""")
    check("5 tutorial fills no progress mark", l1['filled'] == 0, str(l1['filled']))
    check("5 Level 1 shows 01/8 with three marks",
          l1['hud'] == '01/8' and l1['pips'] == 3, str(l1))
    check("5 the tutorial line does not persist into Level 1",
          'full-stop' not in l1['coach'], repr(l1['coach'][:44]))
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
        coach: document.querySelector('#coach-line').textContent })""")
    check("6 wrong stamp consumes nothing", before == {k: after[k] for k in before}, f"{before} -> {after}")
    check("6 the error is counted on that target", max(after['errors']) == 1, str(after['errors']))
    check("6 tier 1 is a gentle nudge", bool(after['coach']), repr(after['coach'][:40]))

    # THE SHAPE OF THE ESCALATION, per the incorrect-feedback table. Error 1
    # puts nothing on the paper — its whole cell is the stamp wobbling back
    # onto the tray. Error 2 lights the relevant unresolved area softly and
    # pulses the tray, with no individual stamp singled out. Error 3 lights the
    # exact location AND the one stamp that fixes it, strongly, and the hand
    # takes that stamp there. Sampled per tier, because "the hand appears
    # eventually" would pass even if it appeared on the first miss.
    TIER = """() => ({
      soft: document.querySelectorAll('.hit.glow').length,
      strong: document.querySelectorAll('.hit.glow-strong').length,
      cue: document.querySelectorAll('.stamp.cue').length,
      pulsed: document.querySelectorAll('.wordwrap.pulse').length,
      coach: document.querySelector('#coach-line').textContent,
      hand: +getComputedStyle(document.getElementById('hand-hint')).opacity > 0.05 })"""
    seen = [pg.evaluate(TIER)]                       # tier 1 — already missed once
    for _ in (2, 3):
        pg.evaluate(f"LettersGame.place('period', '{cap['id']}')")
        wait_await(pg)
        pg.wait_for_timeout(350)
        seen.append(pg.evaluate(TIER))
    pg.screenshot(path=str(OUT / "a6-tier3.png"))
    # 1A: two targets in one sentence, and its cell says "beginning and end
    # pulse/glow softly", so both light and both ends pulse.
    check("6 the first error puts nothing on the paper",
          seen[0]['soft'] == 0 and seen[0]['strong'] == 0
          and seen[0]['cue'] == 0 and not seen[0]['hand'], str(seen[0]))
    check("6 the second error glows the area softly and pulses no single stamp",
          seen[1]['soft'] == 2 and seen[1]['strong'] == 0
          and seen[1]['pulsed'] == 2 and seen[1]['cue'] == 0
          and not seen[1]['hand'], str(seen[1]))
    check("6 the third error lights only the exact place, and its stamp",
          seen[2]['strong'] == 1 and seen[2]['soft'] == 0
          and seen[2]['cue'] == 1, str(seen[2]))
    check("6 the third error brings the hand out", seen[2]['hand'], str(seen[2]))
    check("6 the answer is never previewed in the target zone",
          not pg.evaluate("() => !!document.querySelector('.hit .ghost, .hit.has-ghost')"))
    check("6 each tier says its own line",
          len({s['coach'] for s in seen}) == 3, str([s['coach'][:26] for s in seen]))

    # The tutorial does NOT escalate. It is the practice set, which the
    # incorrect-feedback table excludes, and its notes say there is no failure
    # state — so every miss gets the same one answer: the line, and the stronger
    # glow that line asks for. It used to climb all three tiers, showing the
    # answer and then the hand on the one screen whose whole job is a free go.
    p_t = b.new_page(viewport={"width": 1920, "height": 1080})
    p_t.goto(URL)
    p_t.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                          timeout=40000)
    p_t.evaluate("LettersGame.mute(true)")
    tut_esc = p_t.evaluate("""async () => {
      const hand = document.getElementById('hand-hint');
      const line = document.getElementById('coach-line');
      const t = LettersGame.targets().find(x => !x.done);
      const rows = [];
      for (let k = 1; k <= 4; k++) {
        LettersGame.place('period', t.id, false);      /* a miss, off-target */
        const t0 = performance.now();
        while (performance.now() - t0 < 9000) {
          await new Promise(r => setTimeout(r, 40));
          if (LettersGame.state.name === 'await-input' && performance.now() - t0 > 700) break;
        }
        await new Promise(r => setTimeout(r, 250));
        const h = document.querySelector('.hit');
        rows.push({ line: line.textContent,
                    strong: h.classList.contains('glow-strong'),
                    cue: document.querySelectorAll('.stamp.cue').length,
                    hand: +getComputedStyle(hand).opacity > 0.05 });
      }
      return rows; }""")
    p_t.close()
    want = 'Try placing it at the end of the sentence.'
    check("6 the tutorial answers every miss with its one Wrong 1 line",
          all(r['line'] == want for r in tut_esc),
          str([r['line'][:28] for r in tut_esc]))
    check("6 the tutorial glows strongly from the first miss",
          all(r['strong'] for r in tut_esc), str([r['strong'] for r in tut_esc]))
    check("6 no miss in the tutorial shows the answer — no stamp cue, no hand",
          not any(r['cue'] or r['hand'] for r in tut_esc),
          str([(r['cue'], r['hand']) for r in tut_esc]))

    # BUT ITS STALL DOES SHOW THE HAND. The practice screen is the one with no
    # failure state, so a child stalled there has nothing to gain from another
    # repetition — they have not worked out what the gesture IS. A real level's
    # stall stays a cue and keeps the hand for the third error, where it is
    # earned. Driven through the nudge hook rather than nine real seconds.
    p_h = b.new_page(viewport={"width": 1920, "height": 1080})
    p_h.goto(URL)
    p_h.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                          timeout=40000)
    p_h.evaluate("LettersGame.mute(true)")
    stall_hand = p_h.evaluate("""async () => {
      const hand = document.getElementById('hand-hint');
      const seen = { tutorial: false, level: false };
      const watch = async (key) => {
        LettersGame.nudge();
        for (let i = 0; i < 60; i++) {
          if (+getComputedStyle(hand).opacity > 0.05) { seen[key] = true; break; }
          await new Promise(r => setTimeout(r, 40));
        }
        await new Promise(r => setTimeout(r, 250));
      };
      await watch('tutorial');
      LettersGame.goToLevel('L1');
      for (let i = 0; i < 200 && LettersGame.state.name !== 'await-input'; i++)
        await new Promise(r => setTimeout(r, 60));
      await new Promise(r => setTimeout(r, 400));
      await watch('level');
      return seen; }""")
    p_h.close()
    check("6 the practice stall shows the hand; a level's stall does not",
          stall_hand['tutorial'] and not stall_hand['level'], str(stall_hand))

    # It demonstrates from the RIGHT stamp to the RIGHT place, and it gets out
    # of the way the moment the player touches anything.
    demo = pg.evaluate("""async () => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const U = st.height / 1080, hand = document.getElementById('hand-hint');
      /* the fingertip, not the middle of the hand: 32.79% across and 4% down
         in the supplied artwork — the same fractions as HAND.tipX/tipY */
      const tip = () => { const r = hand.getBoundingClientRect();
        return [Math.round((r.left - st.left + r.width * 0.3279) / U),
                Math.round((r.top - st.top + r.height * 0.04) / U)]; };
      const t = LettersGame.targets().find(x => !x.done);
      const bad = [...document.querySelectorAll('.stamp')]
        .map(e => e.dataset.stamp).find(s => s !== t.stamp);
      LettersGame.place(bad, t.id);
      const path = [];
      const iv = setInterval(() => {
        if (+getComputedStyle(hand).opacity > 0.05) path.push(tip()); }, 50);
      await new Promise(r => setTimeout(r, 2400));
      clearInterval(iv);
      const right = [...document.querySelectorAll('.stamp')].find(e => e.dataset.stamp === t.stamp);
      const sr = right.getBoundingClientRect();
      const hr = document.querySelector('.hit').getBoundingClientRect();
      const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 60;
      const startedAt = near(path[0] || [0, 0],
        [(sr.left - st.left + sr.width / 2) / U, (sr.top - st.top + sr.height * 0.3) / U]);
      const endedAt = near(path[path.length - 1] || [0, 0],
        [(hr.left - st.left + hr.width / 2) / U, (hr.top - st.top + hr.height / 2) / U]);
      /* The drop: once the hand has ARRIVED — stopped travelling in x — it
         must still move in y, lifting and coming down. Measured over the
         arrived samples rather than a fixed tail slice, because how much of
         the trace the journey takes up depends on the speed multiplier. */
      const endX = (path[path.length - 1] || [0])[0];
      const ys = path.filter(p => Math.abs(p[0] - endX) < 30).map(p => p[1]);
      const dipped = ys.length > 2 && Math.max(...ys) - Math.min(...ys) > 8;
      document.dispatchEvent(new Event('pointerdown'));
      await new Promise(r => setTimeout(r, 60));
      return { startedAt, endedAt, dipped,
               cleared: +getComputedStyle(hand).opacity < 0.05 }; }""")
    check("6 the hand starts on the stamp that is needed", demo['startedAt'], str(demo))
    check("6 the hand ends on the place the mark belongs", demo['endedAt'], str(demo))
    check("6 the hand shows a DROP, not just a journey", demo['dipped'], str(demo))
    check("6 the first touch clears the hand out of the way", demo['cleared'], str(demo))

    # The stamp cue is derived from the counters, not painted on and forgotten,
    # so it must go out when the repair it was pointing at lands. Last in the
    # section, because solving that target ends the escalation the rest of it
    # depends on.
    cued = pg.evaluate("() => document.querySelectorAll('.stamp.cue').length")
    pg.evaluate(f"LettersGame.place('caps', '{cap['id']}')")
    wait_await(pg)
    pg.wait_for_timeout(300)
    check("6 the third error's stamp cue clears when that repair lands",
          cued == 1 and pg.evaluate("() => document.querySelectorAll('.stamp.cue').length") == 0,
          f"lit before={cued}")
    check("6 three misses still advance nothing", max(esc['errors']) == 3, str(esc['errors']))

    # A miss leaves no mark, so the stamp itself is the whole feedback: it
    # must rock (not just slide), glow, and end up back in its tray slot.
    # Sampling the rendered angle under-reads it (rAF is throttled headless),
    # so read the wobble's own keyframes instead — one sample anywhere inside
    # the animation gives the exact peak.
    wait_await(pg)
    pg.wait_for_timeout(500)
    wob = pg.evaluate(r"""async () => {
      const b = document.querySelector('.stamp[data-stamp="period"]');
      let maxRot = 0, glowed = false;
      const scan = () => {
        if (b.classList.contains('rejecting')) glowed = true;
        b.getAnimations().forEach(a => {
          const kf = (a.effect && a.effect.getKeyframes) ? a.effect.getKeyframes() : [];
          kf.forEach(k => { const m = /rotate\(([-\d.]+)deg\)/.exec(k.transform || '');
                            if (m) maxRot = Math.max(maxRot, Math.abs(+m[1])); });
        });
      };
      const iv = setInterval(scan, 10);
      if (LettersGame.state.name !== 'await-input') { clearInterval(iv); throw new Error('not idle'); }
      LettersGame.place('period', '%s');
      const t0 = performance.now();
      while (performance.now() - t0 < 9000) {
        await new Promise(r => setTimeout(r, 40));
        if (LettersGame.state.name === 'await-input' && performance.now() - t0 > 800) break;
      }
      await new Promise(r => setTimeout(r, 200));
      clearInterval(iv);
      const m = new DOMMatrixReadOnly(getComputedStyle(b).transform);
      return { maxRot: +maxRot.toFixed(2), glowed,
               dx: Math.round(m.e), dy: Math.round(m.f),
               rejecting: b.classList.contains('rejecting') }; }""" % cap['id'])
    check("6 a wrong placement wobbles the stamp", wob['maxRot'] >= 3,
          f"peak tilt {wob['maxRot']} deg")
    check("6 a wrong placement re-glows the stamp", wob['glowed'], str(wob['glowed']))
    check("6 the stamp returns to its original place",
          abs(wob['dx']) <= 2 and abs(wob['dy']) <= 2 and not wob['rejecting'],
          f"offset ({wob['dx']},{wob['dy']}) from home")

    # Even the correct stamp must fail when it is released away from a target.
    off_before = pg.evaluate(f"() => LettersGame.targets().find(t => t.id === '{cap['id']}').errors")
    pg.evaluate(f"LettersGame.place('caps', '{cap['id']}', false)")
    wait_await(pg)
    off_after = pg.evaluate(f"""() => {{ const t = LettersGame.targets().find(x => x.id === '{cap['id']}');
      return {{ errors: t.errors, done: t.done }}; }}""")
    check("6 an off-target drop records an error and cannot solve",
          off_after['errors'] == off_before + 1 and not off_after['done'], str(off_after))

    # ...but only if it was AIMED AT THE LETTER. A drop on the desk, on the
    # tray, or back where it started is a change of mind, not a wrong answer.
    # Any drag that moved six px and let go anywhere at all used to be scored
    # against the nearest target, so putting a stamp back cost the same as
    # guessing and a child could reach the third-error hand without ever having
    # aimed at the sentence. Driven through the real pointer path, because
    # onCard() guards the DRAG release specifically.
    away = pg.evaluate("""async () => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const U = st.height / 1080;
      const L = LettersGame.layout, c = L.card;
      const btn = document.querySelector('.stamp');
      const total = () => LettersGame.targets().reduce((n, t) => n + t.errors, 0);
      const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
        pointerId: 21, isPrimary: true, pointerType: 'mouse', bubbles: true,
        cancelable: true, clientX: x, clientY: y }));
      const r = btn.getBoundingClientRect();
      const x0 = r.left + r.width / 2, y0 = r.top + r.height * 0.25;
      const out = {};
      /* dx,dy are DESIGN px added to the pad's resting position; the card
         spans y 158..793 and the pad starts at y 1029.75 */
      for (const [name, dx, dy] of [['tray', 0, -60], ['desk', -560, -40]]) {
        const before = total();
        ev(btn, 'pointerdown', x0, y0);
        for (let k = 1; k <= 6; k++) {
          ev(window, 'pointermove', x0 + dx * U * k / 6, y0 + dy * U * k / 6);
          await new Promise(z => setTimeout(z, 16));
        }
        ev(window, 'pointerup', x0 + dx * U, y0 + dy * U);
        await new Promise(z => setTimeout(z, 700));
        out[name] = total() - before;
      }
      return out; }""")
    check("6 a drop away from the letter is not counted as an error",
          away.get('tray') == 0 and away.get('desk') == 0,
          f"errors added — on the tray: {away.get('tray')}, on the desk: {away.get('desk')}")

    # ---- 7. targets solve in ANY order -----------------------------------
    solve_letter(pg, reverse=True)         # end mark first, capital second
    r = pg.evaluate("() => LettersGame.readout()")
    check("7 targets accept any order (end mark before capital)",
          r == 'I am coming to visit you.', repr(r))

    # ---- 8. letter progress advances; posting waits for the level end -----
    pg.wait_for_function("() => LettersGame.state.solved >= 1", timeout=40000)
    pg.wait_for_timeout(400)
    mid = pg.evaluate("""() => ({ filled: document.querySelectorAll('#hud-pips .pip.filled').length,
        mailbag: document.querySelectorAll('#mailbag .bag').length })""")
    check("8 one mark fills after the first letter", mid['filled'] == 1, str(mid))
    check("8 an intermediate letter does not enter the mailbag",
          mid['mailbag'] == 0, str(mid))

    # ---- 9. finish Level 1 -> the pile fills, then clears for Level 2 -----
    # The pile belongs to ONE level. Carrying it forward meant every level
    # after the first was played beside franked envelopes, saying "done"
    # before anything was done.
    for _ in range(2):
        wait_await(pg); solve_letter(pg)
    pg.wait_for_function("() => LettersGame.state.levelIndex >= 2", timeout=60000)
    pg.wait_for_timeout(400)
    lvl2 = pg.evaluate("""() => ({ mailbag: document.querySelectorAll('#mailbag .bag').length,
        posted: LettersGame.state.posted,
        hud: document.querySelector('#hud-count').textContent,
        letter: LettersGame.state.letter.id })""")
    pg.screenshot(path=str(OUT / "a9-level2.png"))
    check("9 a fresh level starts with an empty pile",
          lvl2['mailbag'] == 0 and lvl2['posted'] == 0, str(lvl2))
    check("9 the header advances to Level 2", lvl2['hud'] == '02/8', lvl2['hud'])

    # ---- 10. Level 4's marks; 4D has three sentences ---------------------
    # Three, not four: the level's opening statement screen was removed.
    pg.evaluate("LettersGame.goToLevel('L4')")
    wait_await(pg)
    pg.wait_for_timeout(300)
    l4 = pg.evaluate("""() => ({ pips: document.querySelectorAll('#hud-pips .pip').length,
        hud: document.querySelector('#hud-count').textContent })""")
    check("10 Level 4 shows three progress marks", l4['pips'] == 3, str(l4))
    for _ in range(2):
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
    pg.evaluate("""() => { const t = LettersGame.targets()[0];
      LettersGame.place(t.stamp, t.id); }""")
    wait_await(pg)
    repair_progress = pg.evaluate("""() => ({
      solved: LettersGame.state.repairsSolved,
      total: LettersGame.state.repairsTotal,
      dataSolved: document.body.dataset.repairsSolved,
      event: window.__all.includes('repair:progress') })""")
    check("10 each 4D repair exposes independent progress",
          repair_progress['solved'] == 1 and repair_progress['total'] == 3 and
          repair_progress['dataSolved'] == '1' and repair_progress['event'],
          str(repair_progress))

    # ---- 11. 9-second inactivity nudge -----------------------------------
    # A STALL SAYS NOTHING. Waiting is not a mistake, and the panel used to
    # treat it as one — the letter's hint, and then a fresh random tip every
    # nine seconds after that, so a motionless screen had text marching
    # through it. All that is left is the hint about WHAT TO TAP: the tray
    # waves, and the words on the card are not touched.
    pg.evaluate("window.__ev.length = 0")
    idle = pg.evaluate("""async () => {
      const line = document.getElementById('coach-line');
      const before = line.textContent;
      /* a WAAPI animation has no animationName; the stamps' resting bob is a
         CSS animation and would otherwise read as the nudge */
      const waving = () => [...document.querySelectorAll('.stamp')].some((b) =>
        b.getAnimations().some((a) => !a.animationName && a.playState === 'running'));
      let waved = false;
      const iv = setInterval(() => { if (waving()) waved = true; }, 20);
      await new Promise((res) => {
        document.addEventListener('nudge:idle', () => setTimeout(res, 400), { once: true });
        setTimeout(res, 14000);
      });
      clearInterval(iv);
      return { before, after: line.textContent, waved,
               cue: LettersGame.state.letter.stall || { stamps: false, text: 'sentence' },
               pulsed: document.querySelectorAll('.wordwrap.pulse').length,
               fired: window.__ev.includes('nudge:idle') }; }""")
    check("11 inactivity nudge fires after 9s", idle['fired'], str(idle['fired']))
    check("11 a stall adds no dialogue", idle['after'] == idle['before'],
          f"{idle['before'][:32]!r} -> {idle['after'][:32]!r}")
    # WHAT it shows is per screen — section 1c walks all 23. Here it only has
    # to be the cue this screen actually asks for, and never nothing at all.
    cue = idle['cue']
    check("11 a stall shows this screen's own cue",
          (idle['waved'] == bool(cue.get('stamps')))
          and (idle['pulsed'] > 0) == bool(cue.get('text')),
          f"cue={cue} waved={idle['waved']} pulsed={idle['pulsed']}")
    check("11 a stall always shows something",
          idle['waved'] or idle['pulsed'] > 0,
          f"waved={idle['waved']} pulsed={idle['pulsed']}")

    # A stall SAYS THE LINE AGAIN — the same words, not new ones. Saying
    # nothing left a child who had stopped listening with only a silent pulse;
    # saying something new made a motionless screen read as though something
    # had happened. Skipped while a line is still in flight, or the stall would
    # cut it off, so the check drains the voice first.
    replay = pg.evaluate("""async () => {
      const line = document.getElementById('coach-line');
      const A = LettersGame.audio;
      const clips = []; const oVo = A.playVo.bind(A);
      A.playVo = (n) => { clips.push(n[0]); return oVo(n); };
      A.arm();
      const before = line.textContent;
      A.stopSpeech();                      /* nothing in flight */
      await new Promise(r => setTimeout(r, 120));
      LettersGame.nudge();
      await new Promise(r => setTimeout(r, 500));
      A.playVo = oVo;
      return { clips, before, after: line.textContent,
               ticking: document.getElementById('coach').classList.contains('speaking') }; }""")
    check("11 a stall says the line on screen again",
          len(replay['clips']) == 1 and replay['after'] == replay['before'],
          f"clips={replay['clips']} line unchanged={replay['after'] == replay['before']}")

    # ---- 12. the final letter ---------------------------------------------
    pg.evaluate("LettersGame.goToLevel('L8')")
    wait_await(pg)
    pg.wait_for_timeout(400)
    f8 = pg.evaluate("""() => ({ id: LettersGame.state.letter.id,
        targets: LettersGame.targets().length,
        repairsSolved: LettersGame.state.repairsSolved,
        repairsTotal: LettersGame.state.repairsTotal,
        stamps: [...document.querySelectorAll('.stamp')].map(x=>x.dataset.stamp),
        text: LettersGame.state.letter.text })""")
    pg.screenshot(path=str(OUT / "a12-final.png"))
    check("12 final letter has 8 targets and the full tray",
          f8['targets'] == 8 and len(f8['stamps']) == 5, str({k: f8[k] for k in ('targets','stamps')}))
    check("12 final-letter repair progress starts at 0 of 8",
          f8['repairsSolved'] == 0 and f8['repairsTotal'] == 8, str(f8))
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
    check("13 browser TTS available for the coach", aud['tts'], str(aud['tts']))
    check("13 gameplay emits the audio events",
          'stamp:press' in aud['fired'] and 'stamp:reject' in aud['fired'], str(aud['fired'][:5]))
    # The two newest sounds. `hud:progress` is the ting on a mark filling and
    # `letter:seal:stamp` the frank landing; both have been played by now, since
    # the run above finished several levels. Checked as EVENTS and as ROUTED
    # sounds, because a wired-up event with no clip behind it is silent and a
    # clip with no event never plays.
    check("13 a filling progress mark and a landing frank both have a sound",
          'hud:progress' in aud['fired'] and 'letter:seal:stamp' in aud['fired'],
          str([e for e in aud['fired'] if e.startswith(('hud:', 'letter:'))]))
    routed = pg.evaluate("""async () => {
      const A = LettersGame.audio, log = [];
      const o = A.play.bind(A);
      A.play = (n, f) => { log.push(n); return o(n, f); };
      document.dispatchEvent(new CustomEvent('hud:progress', { detail: {} }));
      document.dispatchEvent(new CustomEvent('letter:seal:stamp', { detail: {} }));
      await new Promise(r => setTimeout(r, 300));
      A.play = o;
      return log; }""")
    check("13 the ting and the two-part frank are routed to real clips",
          routed.count('ting') == 1 and routed.count('stamp') == 1
          and routed.count('seal') == 1, str(routed))

    # ---- 14. nothing left pinned by a finished fill:both animation -------
    # An animation is 'finished' for one task before anim()'s finish listener
    # gets to cancel it, so a single sample races the cleanup. Settle, then
    # poll: a genuine leak stays put, a mid-cleanup animation clears at once.
    stale = ['(not sampled)']
    for _ in range(12):
        pg.wait_for_timeout(200)
        stale = pg.evaluate("""() => [...document.querySelectorAll('*')]
          .filter(e => e.getAnimations().some(a => a.playState === 'finished'))
          .map(e => e.id || e.className).slice(0, 4)""")
        if not stale:
            break
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
    # Reduced motion collapses the ANIMATION, not the voice: the coach still
    # finishes each line before the screen moves on, so a playthrough here is
    # paced by speech rather than by D(). Hence the long patience.
    for _ in range(500):
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
    # the deliberately-never-answered route is still pending; drop it before
    # closing or playwright prints an asyncio CancelledError at teardown
    p5.unroute_all(behavior="ignoreErrors")
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
      const top0 = btn.getBoundingClientRect().top;
      btn.dispatchEvent(mk('pointerdown', sx, sy));
      for (let i = 1; i <= 12; i++)
        window.dispatchEvent(mk('pointermove', sx + (tx-sx)*i/12, sy + (ty-sy)*i/12));
      /* THE RENDERED POSITION, not just the inline style. A running animation
         sits in the animation cascade origin and outranks an inline transform,
         so the drag can write a perfectly correct `style.transform` that the
         screen never shows — which is what stRead()'s tray pulse did for the
         first few hundred ms of every letter. Reading style.transform alone
         passed happily through that whole bug. */
      const cm = new DOMMatrixReadOnly(getComputedStyle(btn).transform);
      const out = { snapped: !!document.querySelector('.hit.snap'),
                    moved: btn.style.transform || '',
                    renderedDy: Math.round(btn.getBoundingClientRect().top - top0),
                    liveDy: Math.round(cm.f) };
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
    p8.close()

    # HOW FAR THE MAGNET REACHES, measured from the MARK in each direction with
    # a real mouse. It reads from two points now — the pad, which is where the
    # ink would land, and the pointer, which is where the player is aiming. With
    # the pad alone the catch area sat 360px above the mark and only 60px below,
    # so pointing straight at it was the weakest place on the card.
    cm = b4.new_context(viewport={"width": 1920, "height": 1080})
    pm = cm.new_page()
    pm.goto(URL)
    pm.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                         timeout=40000)
    pm.evaluate("() => { LettersGame.mute(true); LettersGame.goToLevel('L1'); }")
    pm.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=40000)
    pm.wait_for_timeout(400)
    g = pm.evaluate("""() => {
      const t = LettersGame.targets()[0];
      const hr = document.querySelector('.hit[data-target="' + t.id + '"]').getBoundingClientRect();
      const c = document.querySelector('.stamp').getBoundingClientRect();
      return { t: [hr.left + hr.width / 2, hr.top + hr.height / 2],
               s: [c.left + c.width / 2, c.top + c.height * 0.25] }; }""")
    (tx, ty), (sx, sy) = g['t'], g['s']
    reach = {}
    for name, dx, dy in (("right", 1, 0), ("left", -1, 0), ("down", 0, 1), ("up", 0, -1)):
        far = -1
        for d in range(0, 261, 20):
            pm.mouse.move(sx, sy); pm.mouse.down()
            pm.mouse.move(sx + (tx - sx) * 0.5, sy + (ty - sy) * 0.5)
            pm.mouse.move(tx + dx * d, ty + dy * d)
            pm.wait_for_timeout(10)
            if pm.evaluate("() => !!document.querySelector('.hit.snap')"):
                far = d
            pm.mouse.move(sx, sy)          # release off the card: not an attempt
            pm.mouse.up()
            pm.wait_for_timeout(10)
        reach[name] = far
    check("19 the magnet catches at least 180px from the mark in every direction",
          all(v >= 180 for v in reach.values()),
          ", ".join(f"{k} {v}px" for k, v in reach.items()))
    # ...and none of that sweeping counted as a mistake, because every release
    # was away from the letter.
    check("19 sweeping the stamp around without dropping it on the letter costs nothing",
          pm.evaluate("() => LettersGame.targets().every(t => t.errors === 0)"),
          str(pm.evaluate("() => LettersGame.targets().map(t => t.errors)")))
    pm.close(); cm.close()
    b4.close()

    # ---- 20. the exit: a sheet leaves, it is never folded away ----------
    # A sheet arrives and the same sheet leaves. The 3D fold and the drawn
    # envelope it was lowered into are gone, so the tells to guard against
    # are a matrix3d transform on the card and any surviving fold markup.
    b5 = p.chromium.launch()
    p9 = b5.new_page(viewport={"width": 1920, "height": 1080})
    e5 = []
    p9.on("pageerror", lambda e: e5.append(str(e)))
    p9.on("console", lambda m: e5.append(m.type + ": " + m.text) if m.type == "error" else None)
    p9.goto(URL)
    p9.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                         timeout=40000)
    gone = p9.evaluate("""() => ({
      fold: !!document.getElementById('card-fold'),
      bands: document.querySelectorAll('.fband').length,
      envUnder: !!document.getElementById('env-under'),
      envOver: !!document.getElementById('env-over'),
      envFlap: !!document.getElementById('env-flap'),
      envImg: !!document.getElementById('envelope') })""")
    check("20 no fold or drawn-envelope markup is left in the scene",
          not any(gone.values()), str(gone))

    # anim() must refuse a non-string easing loudly. Handing it bezier()'s
    # sampling function used to throw, get swallowed, and silently drop a
    # whole beat of the sequence.
    bad = p9.evaluate("""() => {
      const errs = [];
      const orig = console.error;
      console.error = (...a) => { errs.push(a.join(' ')); };
      const el = document.getElementById('hand-hint');
      const a = el.animate([{opacity:0},{opacity:0}], {duration:1});
      a.cancel();
      const p = LettersGame.animProbe(el, [{opacity:0},{opacity:0}], 10, function(){});
      console.error = orig;
      return { warned: errs.some(x => x.indexOf('easing') >= 0) }; }""")
    check("20 anim() refuses a non-string easing instead of dropping the beat",
          bad['warned'], str(bad))

    # The last letter of a real level arcs away to the pile, flat, without
    # ever going three-dimensional — and WITHOUT being franked on the desk.
    # READY TO POST belongs to the level-complete ceremony now, where the
    # whole set takes it together; franking this one letter announced the
    # level as over a beat early and left its two classmates unstamped.
    p9.evaluate("LettersGame.speed(0.5); LettersGame.goToLevel('L7')")
    for _ in range(2):
        wait_await(p9); solve_letter(p9)
    wait_await(p9)
    exit_ = p9.evaluate("""async () => {
      const cl = document.getElementById('card-layer');
      let m3 = false, maxDx = 0, minScale = 1;
      /* anything franked ON THE DESK — the pile in the far corner is another
         matter, and by Level 7 it is rightly full */
      let sawSeal = !!document.getElementById('seal');
      const card = document.getElementById('card-layer').getBoundingClientRect();
      const iv = setInterval(() => {
        const cs = getComputedStyle(cl);
        if (cs.transform.indexOf('matrix3d') === 0) m3 = true;
        document.querySelectorAll('.fin-seal').forEach((s) => {
          const r = s.getBoundingClientRect();
          if (+getComputedStyle(s).opacity > 0.05 &&
              r.right > card.left && r.left < card.right &&
              r.bottom > card.top && r.top < card.bottom) sawSeal = true;
        });
        if (+cs.opacity > 0.05) {
          const m = new DOMMatrixReadOnly(cs.transform);
          maxDx = Math.max(maxDx, Math.abs(m.e));
          minScale = Math.min(minScale, m.a);
        }
      }, 20);
      const t0 = performance.now();
      for (;;) {
        const n = LettersGame.state.name;
        if (n === 'await-input') {
          const t = LettersGame.targets().find(x => !x.done);
          if (t) LettersGame.place(t.stamp, t.id); else break;
        }
        if (n === 'levelup' || n === 'finale') break;
        if (performance.now() - t0 > 90000) break;
        await new Promise(r => setTimeout(r, 25));
      }
      clearInterval(iv);
      return { m3, sawSeal, maxDx: Math.round(maxDx), minScale: +minScale.toFixed(2) };
    }""")
    check("20 the finished sheet arcs away to the pile", exit_['maxDx'] > 300 and exit_['minScale'] < 0.6,
          f"travelled {exit_['maxDx']}px, shrank to {exit_['minScale']}")
    check("20 it leaves flat — never a 3D fold", not exit_['m3'], str(exit_['m3']))
    check("20 nothing is franked on the desk before the level is finished",
          not exit_['sawSeal'], str(exit_['sawSeal']))
    check("20 no page errors through a full letter exit", not e5, str(e5[:2]))
    p9.close(); b5.close()

    # ---- 22. voice-over --------------------------------------------------
    # The map is keyed by the exact displayed string so the voice can never
    # drift from the words on screen. A key that no longer matches any line
    # is a silent regression: the panel says one thing, synthesis says it in
    # a different voice, and nothing errors.
    b6 = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pa = b6.new_page(viewport={"width": 1920, "height": 1080})
    pa.goto(URL)
    pa.wait_for_function("() => window.LettersGame && LettersGame.state.name==='await-input'",
                         timeout=40000)
    vo = pa.evaluate("""async () => {
      const map = LettersGame.vo;
      const said = new Set();
      LettersGame.levels.forEach(lv => lv.letters.forEach(L => {
        [L.instruction, L.intro, L.intro2, L.praise, L.read,
         L.say.e1, L.say.e2, L.say.e3, L.say.idle].forEach(s => { if (s) said.add(s); });
        /* 4D and the Final Letter state a line per repair — see `each` */
        (L.each || []).forEach(e => ['e1', 'e2', 'e3'].forEach(k => { if (e[k]) said.add(e[k]); }));
      }));
      const orphan = Object.keys(map).filter(k => !said.has(k));
      const files = new Set();
      Object.keys(map).forEach(k => {
        const v = map[k]; (Array.isArray(v) ? v : [v]).forEach(f => files.add(f));
      });
      const bad = [];
      for (const f of files) {
        const a = new Audio('assets/vo/' + f + '.ogg');
        const ok = await new Promise(r => {
          a.addEventListener('loadedmetadata', () => r(a.duration > 0.2), { once: true });
          a.addEventListener('error', () => r(false), { once: true });
          a.load();
          setTimeout(() => r(false), 8000);
        });
        if (!ok) bad.push(f);
      }
      return { mapped: Object.keys(map).length, lines: said.size,
               orphan, files: files.size, bad };
    }""")
    check("22 every recorded line still matches a line the coach can say",
          not vo['orphan'], str(vo['orphan'][:3]))
    check("22 all VO clips load and decode from file://",
          not vo['bad'], f"{vo['files'] - len(vo['bad'])}/{vo['files']} ok, bad={vo['bad'][:3]}")

    # A line with no recording must still be spoken, not dropped.
    route = pa.evaluate("""async () => {
      LettersGame.audio.arm();
      const log = [];
      const oVo = LettersGame.audio.playVo.bind(LettersGame.audio);
      const oSy = LettersGame.audio.synth.bind(LettersGame.audio);
      LettersGame.audio.playVo = (n) => { log.push('vo:' + n[0]); return oVo(n); };
      LettersGame.audio.synth  = (t) => { log.push('synth'); return oSy(t); };
      LettersGame.audio.speak('Fix the sentence with the stamps.');
      await new Promise(r => setTimeout(r, 200));
      LettersGame.audio.speak('a line that is deliberately not recorded');
      await new Promise(r => setTimeout(r, 200));
      LettersGame.audio.playVo = oVo; LettersGame.audio.synth = oSy;
      return log;
    }""")
    check("22 a recorded line plays its clip, an unrecorded one falls back to synthesis",
          any(x.startswith('vo:') for x in route) and 'synth' in route, str(route))

    # A LONG LINE IS NOT TRUNCATED, AND A STALLED ONE STILL RELEASES. The gate's
    # cap used to be a flat 8s from the moment of asking, so the two longest
    # lines in the game — both on the Final Letter, its praise at 9.03s and its
    # read-back at 12.70s — were cut off, and `post` began while the corrected
    # letter was still being read out. The cap is now an allowance of SILENCE:
    # playback position advancing extends the wait. Both halves are checked,
    # because "wait longer" is only correct if a hung clip still lets go.
    gate = pa.evaluate("""async () => {
      const A = LettersGame.audio;
      A.arm();
      const READ = 'Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. '
                 + 'Did you go too? It was amazing!';
      /* 1. the longest recorded line, played out */
      A.speak(READ);
      await new Promise(r => setTimeout(r, 400));
      const dur = A.voice && isFinite(A.voice.duration) ? A.voice.duration : null;
      let t0 = performance.now();
      await A.whenSpoken();
      const waited = (performance.now() - t0) / 1000;

      /* 2. the same line, stalled a second in: the wait must still end */
      A.speak(READ);
      await new Promise(r => setTimeout(r, 1000));
      const hung = !!A.voice;
      if (A.voice) A.voice.pause();
      t0 = performance.now();
      await A.whenSpoken(1200);            /* a short allowance, to keep this quick */
      const released = (performance.now() - t0) / 1000;
      A.stopSpeech();
      return { dur, waited: +waited.toFixed(2), hung, released: +released.toFixed(2) };
    }""")
    check("22 the longest read-back plays to the end before the game moves on",
          gate['dur'] is not None and gate['dur'] > 8
          and gate['waited'] > gate['dur'] - 1.2,
          f"clip {gate['dur']}s, waited {gate['waited']}s")
    check("22 a stalled clip still releases the game",
          gate['hung'] and gate['released'] < 4,
          f"released after {gate['released']}s on a 1.2s allowance")

    # ---- 23. the level jump ----------------------------------------------
    # The review control that ships in the scene (#temp-level-nav). It must
    # jump without disturbing the stage, and must not swallow the gestures
    # the game itself listens for.
    before = pa.evaluate("() => { const r = document.getElementById('stage').getBoundingClientRect();"
                         "  return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }")
    pick = pa.evaluate("""() => {
      const bs = [...document.querySelectorAll('#temp-level-buttons button')];
      return { n: bs.length, labels: bs.map(b => b.textContent.trim()),
               levels: bs.map(b => b.dataset.level) }; }""")
    check("23 the level jump offers the tutorial plus all eight levels",
          pick['n'] == 9, str(pick['labels']))
    pa.click('#temp-level-buttons button:nth-of-type(7)')
    pa.wait_for_function("() => LettersGame.state.name==='await-input' "
                         "&& LettersGame.state.levelIndex === 6", timeout=30000)
    after = pa.evaluate("() => { const r = document.getElementById('stage').getBoundingClientRect();"
                        "  return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }")
    cur = pa.evaluate("""() => [...document.querySelectorAll('#temp-level-buttons button')]
        .filter(b => b.getAttribute('aria-current') === 'true').length""")
    check("23 a jump loads that level and marks it current",
          pa.evaluate("() => LettersGame.state.letter.id") == '6A' and cur == 1,
          f"letter={pa.evaluate('() => LettersGame.state.letter.id')} current={cur}")
    check("23 the level jump never moves the stage", before == after, f"{before} -> {after}")

    # ---- 24. the level-complete beat -------------------------------------
    # Every letter the level taught comes back out and is franked. Three per
    # level now that Level 4's opening screen is gone, but the row geometry is
    # still derived rather than tabulated, so both levels are walked.
    for lvl, want in (("L1", 3), ("L4", 3)):
        pa.evaluate(f"LettersGame.goToLevel('{lvl}'); LettersGame.mute(true)")
        pa.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=30000)
        beat = pa.evaluate("""async () => {
          const st = document.getElementById('stage').getBoundingClientRect();
          const U = st.height / 1080;
          const at = (el) => { const r = el.getBoundingClientRect();
            return [Math.round((r.left - st.left + r.width/2)/U),
                    Math.round((r.top - st.top + r.height/2)/U)]; };
          let peak = null, saw = false, first = null, plainOnArrival = true, stuck = null;
          let bagPeak = 0, bagPeakFranked = false, collapsed = 0;
          /* THE ROW MOVES AS A ROW. Sampled across the whole beat over the
             VISIBLE cards only: how far apart their tops get, and how far
             apart their sizes get. Both used to blow out to 368 and 201
             design px on the flight down to the pile, and to 31 and 159 on the
             way in, because each card was released on its own timer and so sat
             at a different point along an otherwise identical arc. */
          let ySpread = 0, wSpread = 0;
          /* EVERY LETTER LEAVES THE SAME WAY. The level's last letter used to
             arc off to the pile in the bottom right while the others simply
             lifted and faded — ~700 design px of horizontal travel on one
             letter of three, delivering it before the ceremony that seals it.
             Tracked per letter so "the last one is different" cannot come back
             without a failure. */
          const exits = {};
          const bagBefore = document.querySelectorAll('#mailbag .bag').length;
          const iv = setInterval(() => {
            if (LettersGame.state.name === 'post') {
              const m = new DOMMatrixReadOnly(getComputedStyle(
                document.getElementById('card-layer')).transform);
              const id = LettersGame.state.letter.id;
              exits[id] = Math.max(exits[id] || 0, Math.abs(m.e) / U);
            }
            if (LettersGame.state.name !== 'levelup') return;
            /* the pile has to be sampled DURING the beat: the next level
               clears it, so reading it afterwards reads the reset */
            const bag = [...document.querySelectorAll('#mailbag .bag')];
            if (bag.length > bagPeak) {
              bagPeak = bag.length;
              bagPeakFranked = bag.every((d) =>
                +getComputedStyle(d.querySelector('.fin-seal')).opacity > 0.5);
            }
            const c = [...document.querySelectorAll('#finale .fin')];
            const shown = c.filter(x => +getComputedStyle(x).opacity > 0.05)
                           .map(x => x.getBoundingClientRect());
            if (shown.length > 1) {
              const ys = shown.map(r => r.top), ws = shown.map(r => r.width);
              ySpread = Math.max(ySpread, (Math.max(...ys) - Math.min(...ys)) / U);
              wSpread = Math.max(wSpread, (Math.max(...ws) - Math.min(...ws)) / U);
            }
            /* A card whose height depends on its <img> is zero-high for a
               frame after insertion, which puts its contents at its top edge
               and made the row appear to start half a card too high. */
            c.forEach((x) => { const r = x.getBoundingClientRect();
              if (+getComputedStyle(x).opacity > 0.05 && r.height / U < 4) collapsed++; });
            if (c.length && !first && +getComputedStyle(c[0]).opacity > 0.05) first = at(c[0]);
            const lit = c.filter(x => +getComputedStyle(x.querySelector('.fin-seal')).opacity > 0.5).length;
            /* the row must ARRIVE plain: at the moment the first seal shows,
               every card must already be at rest in the row */
            if (lit && plainOnArrival === true && peak && !peak.lit) {
              plainOnArrival = !c.some((x) => {
                const m = new DOMMatrixReadOnly(getComputedStyle(x).transform);
                return Math.abs(m.e) > 4 || Math.abs(m.f) > 4;
              });
            }
            if (!peak || lit > peak.lit) peak = { n: c.length, lit,
              hud: document.getElementById('hud-count').textContent };
          }, 40);
          const t0 = Date.now();
          for (;;) {
            const n = LettersGame.state.name;
            if (n === 'levelup') saw = true;
            if (n === 'await-input') {
              const t = LettersGame.targets().find(x => !x.done);
              if (t) LettersGame.place(t.stamp, t.id);
            }
            if (saw && n !== 'levelup') break;
            if (Date.now() - t0 > 240000) { stuck = n; break; }
            await new Promise(r => setTimeout(r, 30));
          }
          clearInterval(iv);
          return { saw, peak, first, plainOnArrival, stuck, collapsed,
                   bagBefore, bagPeak, bagPeakFranked,
                   ySpread: +ySpread.toFixed(1), wSpread: +wSpread.toFixed(1),
                   exits }; }""")
        pa.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=30000)
        pa.wait_for_timeout(500)
        beat['bagAfter'] = pa.evaluate(
            "() => document.querySelectorAll('#mailbag .bag').length")
        check(f"24 {lvl} completes with a franked row of {want}",
              beat['saw'] and beat['peak'] and beat['peak']['n'] == want
              and beat['peak']['lit'] == want, str(beat))
        # The letters come out of the HUD marks that have been counting them,
        # top right — not out of the pile they are on their way to.
        # Bounded on BOTH sides: an unbounded "above the middle" passed once on
        # a card that was momentarily zero-high and measured 240px off-stage.
        check(f"24 {lvl}'s row enters from the HUD marks",
              beat['first'] and 1450 < beat['first'][0] < 1920
              and 30 < beat['first'][1] < 150,
              f"first seen at {beat['first']} (the pip row centres on y=84)")
        check(f"24 {lvl}'s cards are never laid out zero-high",
              beat['collapsed'] == 0, f"{beat['collapsed']} collapsed frames")
        check(f"24 {lvl}'s row arrives plain and is franked only once it is at rest",
              beat['plainOnArrival'] is True, str(beat['plainOnArrival']))
        # ...and the franked set lands on the outgoing pile, bottom right —
        # which the level started with EMPTY, and which the next level clears
        # again, so READY TO POST is only ever on screen because the level in
        # front of you has just been finished.
        check(f"24 {lvl} starts with an empty pile and lands {want} franked on it",
              beat['bagBefore'] == 0 and beat['bagPeak'] == want
              and beat['bagPeakFranked'],
              f"pile {beat['bagBefore']} -> peak {beat['bagPeak']} "
              f"(franked={beat['bagPeakFranked']})")
        check(f"24 the pile clears again for the level after {lvl}",
              beat['bagAfter'] == 0, f"{beat['bagAfter']} left on the pile")
        # 60 design px of slack covers the frank's own scale pulse (4) and the
        # stacked offsets the pile itself draws (~27), and nothing else.
        # 8 design px of slack: the exit is a straight rise, so any real
        # horizontal travel means one letter is flying somewhere the others
        # are not.
        ex = beat['exits'] or {}
        check(f"24 every letter of {lvl} leaves the same way, the last included",
              len(ex) == want and all(v < 8 for v in ex.values()),
              f"horizontal travel per letter: "
              + ", ".join(f"{k}={v:.0f}px" for k, v in sorted(ex.items())))
        check(f"24 {lvl}'s row stays level and same-sized for the whole beat",
              beat['ySpread'] < 60 and beat['wSpread'] < 60,
              f"worst y spread {beat['ySpread']}px, worst size spread {beat['wSpread']}px")

    # The tutorial is practice: it must not get the ceremony at all.
    pa.evaluate("LettersGame.goToLevel('T')")
    pa.wait_for_function("() => LettersGame.state.name==='await-input'", timeout=30000)
    tut = pa.evaluate("""async () => {
      let sawLevelup = false, sawSeal = false;
      const t0 = Date.now();
      for (;;) {
        const n = LettersGame.state.name;
        if (n === 'levelup') sawLevelup = true;
        if (document.querySelectorAll('#finale .fin').length) sawSeal = true;
        if (n === 'await-input') {
          const t = LettersGame.targets().find(x => !x.done);
          if (t) LettersGame.place(t.stamp, t.id);
          else if (LettersGame.state.letter.id !== 'T') break;
        }
        if (LettersGame.state.letter && LettersGame.state.letter.id === '1A') break;
        if (Date.now() - t0 > 90000) break;
        await new Promise(r => setTimeout(r, 30));
      }
      return { sawLevelup, sawSeal, now: LettersGame.state.letter.id }; }""")
    check("24 the tutorial gets no franking ceremony",
          not tut['sawLevelup'] and not tut['sawSeal'] and tut['now'] == '1A', str(tut))
    pa.close(); b6.close()

    # ---- 25. the way in and the way out ----------------------------------
    # The shipped entry point, walked once at the real URL: cover art with PLAY
    # -> the 1:05 film -> the game -> the 9s film -> the cover again. Every
    # other page in this suite boots with ?nointro=1 and never sees it.
    HELD_JS = """() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const U = st.height / 1080;
      const f = document.getElementById('film');
      const b = document.getElementById('play').getBoundingClientRect();
      return { state: LettersGame.state.name, film: LettersGame.film(),
               paused: f.paused,
               cx: Math.round((b.left - st.left + b.width / 2) / U),
               cy: Math.round((b.top - st.top + b.height / 2) / U),
               w: Math.round(b.width / U) }; }"""
    b7 = p.chromium.launch()
    pt = b7.new_page(viewport={"width": 1920, "height": 1080})
    e7 = []
    pt.on("pageerror", lambda e: e7.append(str(e)))
    pt.goto(TITLE_URL)
    pt.wait_for_function("() => window.LettersGame", timeout=30000)
    pt.wait_for_function("() => LettersGame.state.name === 'title'", timeout=30000)
    pt.wait_for_timeout(500)
    t0 = pt.evaluate("""() => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const U = st.height / 1080;
      const b = document.getElementById('play').getBoundingClientRect();
      return { title: !document.getElementById('title').hidden,
               film: LettersGame.film(),
               cover: document.getElementById('cover').naturalWidth,
               btn: { cx: +((b.left - st.left + b.width / 2) / U).toFixed(0),
                      cy: +((b.top - st.top + b.height / 2) / U).toFixed(0),
                      w: +(b.width / U).toFixed(0) },
               armed: LettersGame.audio.armed }; }""")
    pt.screenshot(path=str(OUT / "a25-title.png"))
    check("25 the game opens on the cover, not on the desk",
          t0['title'] and not t0['film']['shown'] and t0['cover'] > 0,
          f"title={t0['title']} film={t0['film']} cover px={t0['cover']}")
    # Centred across, and low enough to clear the title art: the letters of
    # "PUZZLE" — bodies, legs, feet and shadows — end at y 900 in this column,
    # and the button used to sit at the art's own y of 493, square on top of
    # them. It must also stay on the stage: its glow is 243 design px tall.
    check("25 PLAY sits centred, below the title art, and fully on the stage",
          abs(t0['btn']['cx'] - 960) <= 6 and 860 < t0['btn']['cy'] < 990
          and t0['btn']['w'] > 300,
          f"centre ({t0['btn']['cx']},{t0['btn']['cy']}) width {t0['btn']['w']}")
    check("25 nothing is downloaded for the films before PLAY is pressed",
          t0['film']['src'] is None, str(t0['film']['src']))
    # PLAY is the gesture that unlocks sound, so the game's own first line is
    # already allowed to be a recording rather than synthesis.
    check("25 sound is not armed until PLAY is pressed", not t0['armed'], str(t0['armed']))

    pt.evaluate("() => LettersGame.play()")
    pt.wait_for_function("() => LettersGame.state.name === 'intro'", timeout=20000)
    pt.wait_for_timeout(600)
    t1 = pt.evaluate("() => ({ film: LettersGame.film(), armed: LettersGame.audio.armed, "
                     "        t: document.getElementById('film').currentTime }) ")
    check("25 PLAY starts the opening film and arms sound",
          t1['film']['shown'] and (t1['film']['src'] or '').endswith('intro.mp4')
          and t1['armed'], str(t1))
    # THE FILM ENDS ON ITS OWN CALL TO ACTION. Its last frame is the children
    # pointing at a PLAY drawn into the picture, so the film stops there, on
    # that frame, and the real button goes over the drawn one — measured from
    # the frame at x 794..1081, y 922..1007. Held, not cleared: a video whose
    # src had been dropped would show black behind the button. The film is cut
    # short here rather than sat through for 65 seconds.
    pt.evaluate("() => LettersGame.endFilm()")
    pt.wait_for_function("() => LettersGame.film().playShown === true", timeout=30000)
    pt.wait_for_timeout(300)
    held = pt.evaluate(HELD_JS)
    pt.screenshot(path=str(OUT / "a25-film-end.png"))
    check("25 the opening film holds its last frame and PLAY lands on the drawn button",
          held['state'] == 'intro' and held['film']['shown'] and held['paused']
          and abs(held['cx'] - 937) <= 12 and abs(held['cy'] - 964) <= 14
          and 300 < held['w'] < 400,
          f"state={held['state']} held={held['film']['shown']} paused={held['paused']} "
          f"button at ({held['cx']},{held['cy']}) w={held['w']}")

    pt.evaluate("() => LettersGame.play()")
    pt.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=40000)
    t2 = pt.evaluate("() => ({ film: LettersGame.film(), letter: LettersGame.state.letter.id })")
    check("25 pressing it starts the game and clears the film off the screen",
          not t2['film']['shown'] and t2['film']['src'] is None
          and not t2['film']['playShown'] and t2['letter'] == 'T', str(t2))

    # ...and the closing film. Jump to the last level, finish it, and the
    # finale must hand over to the 9s film rather than stopping on a button.
    pt.evaluate("() => LettersGame.goToLevel('L8')")
    pt.wait_for_function("() => LettersGame.state.name === 'await-input'", timeout=40000)
    end = pt.evaluate("""async () => {
      const t0 = Date.now();
      let sawFinale = false;
      for (;;) {
        const n = LettersGame.state.name;
        if (n === 'finale') sawFinale = true;
        if (n === 'outro') return { sawFinale, film: LettersGame.film() };
        if (n === 'await-input') {
          const t = LettersGame.targets().find(x => !x.done);
          if (t) LettersGame.place(t.stamp, t.id);
        }
        if (Date.now() - t0 > 200000) return { sawFinale, stuck: n };
        await new Promise(r => setTimeout(r, 40));
      }
    }""")
    check("25 finishing the game plays the closing film",
          end.get('sawFinale') and end.get('film', {}).get('shown')
          and (end.get('film', {}).get('src') or '').endswith('outro.mp4'), str(end))
    pt.evaluate("() => LettersGame.endFilm()")
    pt.wait_for_function("() => LettersGame.state.name === 'title'", timeout=30000)
    back = pt.evaluate("() => ({ film: LettersGame.film() })")
    check("25 the closing film returns to the cover, ready to play again",
          back['film']['title'] and not back['film']['shown'], str(back))
    check("25 no page errors on the title/film path", not e7, str(e7[:2]))
    pt.close(); b7.close()

    # ---- 26. nothing zooms, nothing copies out ---------------------------
    # The stage sizes itself to the viewport and letterboxes the rest, so a
    # zoom cannot reveal more of the scene — it only breaks the fit. Checked as
    # PREVENTED EVENTS rather than by trying to zoom, because a headless
    # browser will not honour a real pinch anyway.
    b8 = p.chromium.launch()
    pz = b8.new_page(viewport={"width": 1920, "height": 1080})
    pz.goto(URL)
    pz.wait_for_function("() => window.LettersGame", timeout=40000)
    pz.wait_for_timeout(400)
    z = pz.evaluate("""() => {
      const kd = (init) => { const e = new KeyboardEvent('keydown',
          Object.assign({ bubbles: true, cancelable: true }, init));
        document.dispatchEvent(e); return e.defaultPrevented; };
      const wh = (init) => { const e = new WheelEvent('wheel',
          Object.assign({ bubbles: true, cancelable: true, deltaY: -120 }, init));
        window.dispatchEvent(e); return e.defaultPrevented; };
      const ev = (type, el) => { const e = new Event(type,
          { bubbles: true, cancelable: true });
        (el || document.getElementById('cover')).dispatchEvent(e);
        return e.defaultPrevented; };
      const nav = document.querySelector('#temp-level-buttons button');
      const vp = document.querySelector('meta[name=viewport]').content;
      return {
        userScalable: /user-scalable\\s*=\\s*no/.test(vp) && /maximum-scale\\s*=\\s*1/.test(vp),
        touchAction: getComputedStyle(document.body).touchAction,
        ctrlWheel: wh({ ctrlKey: true }), plainWheel: wh({}),
        ctrlPlus: kd({ ctrlKey: true, key: '+' }),
        ctrlMinus: kd({ ctrlKey: true, key: '-' }),
        ctrlZero: kd({ ctrlKey: true, key: '0' }),
        metaPlus: kd({ metaKey: true, key: '+' }),
        gesture: ev('gesturestart', document),
        arrowKey: kd({ key: 'ArrowRight' }),
        contextmenu: ev('contextmenu'), dragstart: ev('dragstart'),
        selectstart: ev('selectstart'), copy: ev('copy'),
        userSelect: getComputedStyle(document.getElementById('cover')).userSelect,
        navRightClick: nav ? ev('contextmenu', nav) : true };
    }""")
    check("26 pinch and double-tap zoom are off on touch",
          z['userScalable'] and z['touchAction'] == 'none',
          f"viewport ok={z['userScalable']} touch-action={z['touchAction']}")
    check("26 ctrl+wheel and ctrl+/-/0 cannot zoom the desktop view",
          z['ctrlWheel'] and z['ctrlPlus'] and z['ctrlMinus'] and z['ctrlZero']
          and z['metaPlus'] and z['gesture'], str(z))
    # ...and the game's own input is untouched: the stamps are driven by plain
    # arrow keys, and a plain scroll must not be swallowed either.
    check("26 the game's own keys and a plain scroll still work",
          not z['arrowKey'] and not z['plainWheel'],
          f"arrow prevented={z['arrowKey']} plain wheel prevented={z['plainWheel']}")
    check("26 the artwork cannot be right-clicked, dragged out, or copied",
          z['contextmenu'] and z['dragstart'] and z['selectstart'] and z['copy']
          and z['userSelect'] == 'none', str(z))
    # the review bar stays usable
    check("26 the temporary level bar is exempt from the copy guards",
          not z['navRightClick'], str(z['navRightClick']))
    pz.close(); b8.close()

    # ---- 27. the cover speaks, but only the button commits ----------------
    # TWO DIFFERENT THINGS ON ONE SCREEN. A tap anywhere on the cover plays the
    # title line and NOTHING else — the card stays up. Only PLAY starts the
    # film. Getting this the wrong way round meant a child who touched the
    # postbox was committed to a 65-second film.
    b9 = p.chromium.launch()
    pc = b9.new_page(viewport={"width": 1280, "height": 720})
    pc.goto(TITLE_URL)
    pc.wait_for_function("() => LettersGame && LettersGame.state.name === 'title'",
                         timeout=30000)
    pc.wait_for_timeout(1200)
    pc.mouse.click(250, 250)          # the cover art, far from PLAY
    pc.wait_for_timeout(700)
    tap = pc.evaluate("""() => ({ state: LettersGame.state.name,
        vo: LettersGame.titleVo(), film: LettersGame.film(),
        armed: LettersGame.audio.armed })""")
    check("27 a tap on the cover art plays the title line and arms sound",
          tap['vo']['started'] and tap['armed'], str(tap))
    check("27 a tap on the cover art does NOT start the film",
          tap['state'] == 'title' and not tap['film']['shown']
          and tap['film']['src'] is None, str(tap))
    # ...and the button does.
    pc.evaluate("() => LettersGame.play()")
    pc.wait_for_function("() => LettersGame.state.name === 'intro'", timeout=15000)
    pc.wait_for_timeout(300)
    check("27 only PLAY starts the film, and it stops the title line",
          (pc.evaluate("() => LettersGame.film().src") or '').endswith('intro.mp4')
          and not pc.evaluate("() => LettersGame.titleVo().playing"),
          str(pc.evaluate("() => [LettersGame.film(), LettersGame.titleVo()]")))
    pc.close(); b9.close()

    # Autoplay is a browser policy, not something code decides, so BOTH answers
    # are checked. Either way the cover STAYS UP — the difference is only
    # whether the title line got to speak before it was asked.
    for label, args, spoke in (("allowed", ["--autoplay-policy=no-user-gesture-required"], True),
                               ("blocked", [], False)):
        ba = p.chromium.launch(args=args)
        pa2 = ba.new_page(viewport={"width": 1280, "height": 720})
        pa2.goto(TITLE_URL)
        pa2.wait_for_function("() => window.LettersGame", timeout=40000)
        pa2.wait_for_timeout(2600)
        got = pa2.evaluate("""() => ({ state: LettersGame.state.name,
            vo: LettersGame.titleVo(), film: LettersGame.film().src })""")
        check(f"27 with autoplay {label}, the cover waits for PLAY either way",
              got['state'] == 'title' and got['film'] is None, str(got))
        check(f"27 with autoplay {label}, the title line "
              + ("speaks unasked" if spoke else "holds for the first tap"),
              got['vo']['playing'] is spoke, str(got['vo']))
        pa2.close(); ba.close()

check("17 no page errors", not errs, str(errs[:2]))
check("17 no console errors", not [m for t, m in cerrs if t == 'error'],
      str([m for t, m in cerrs if t == 'error'][:2]))

print("\n" + "=" * 64)
bad = [n for n, ok, _ in results if not ok]
print(f"{len(results)-len(bad)}/{len(results)} checks passed")
for n in bad: print("   FAILED:", n)
sys.exit(1 if bad else 0)
