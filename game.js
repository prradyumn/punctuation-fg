/* game.js — Letters: timing, content and the state machine.
 *
 * One file, three clearly separated sections:
 *
 *   1. TIMING   every duration and easing, so the whole feel tunes in one place
 *   2. CONTENT  the sentences and the stamp registry — plain data, no logic
 *   3. GAME     the nine-state machine and its animation sequences
 *
 * Loaded with a plain <script> tag, so the game runs straight from file://
 * with no server, no build step and no modules.
 */

/* =================================================================== */
/* 1. TIMING                                                            */
/* =================================================================== */
const TIMING = {
  SPEED: 2,

  /* --- easings ------------------------------------------------------- */
  ease: {
    deal:    'cubic-bezier(.22,.8,.28,1)',   /* letter flying in */
    thump:   'cubic-bezier(.3,1.6,.4,1)',    /* ink-thump on the stamp press */
    standard:'cubic-bezier(.22,.9,.24,1)',
    out:     'cubic-bezier(0,.6,.3,1)',
    in:      'cubic-bezier(.42,0,1,1)',
    linear:  'linear'
  },

  /* --- 2. deal — a letter flies in ----------------------------------- */
  deal: {
    total: 700,
    fromScale: 0.45, toScale: 1,
    fromRot: -12,
    overshoot: 1.02, overshootMs: 60
  },

  /* --- 3. open — the letter opens ------------------------------------ */
  open: {
    total: 500,
    flapMs: 300,              /* the flap lifts off the mouth        */
    drawMs: 380,              /* the folded letter is drawn out      */
    growMs: 300,              /* and opened up to full size          */
    unfoldMs: 400,            /* each third comes back flat          */
    stripesFadeMs: 200        /* over the LAST 200ms of the unfold   */
  },

  /* --- 4. read — text appears ---------------------------------------- */
  read: {
    total: 350,
    rise: 8,                  /* px */
    wordStagger: 25
  },

  /* --- 5. await-input ------------------------------------------------- */
  idleBob: { amplitude: 3, period: 2400, phaseOffset: 600 },
  hover:   { lift: 10, scale: 1.04, ms: 160 },

  /* --- 6. stamp — a correction is applied ----------------------------- */
  stamp: {
    total: 450,
    riseMs: 150,              /* out of the tray */
    travelMs: 190,            /* across to the slot */
    pressMs: 110,             /* the drive down */
    pressScale: [1, 1.12, 0.96],
    deskShift: 2,
    inkBloomMs: 120,
    inkBloomScale: 1.25,
    returnMs: 250
  },
  reject: { total: 420, shake: 7, tilt: 6 },

  /* --- 7. seal — the letter packs itself ------------------------------ */
  seal: {
    total: 900,
    holdMs: 250,              /* player reads the corrected sentence */
    foldBottomMs: 420,
    foldTopMs: 420,
    envInMs: 220,             /* the envelope opens up under the letter */
    insertMs: 460,            /* the letter goes down into the pocket   */
    flapMs: 320,              /* the flap comes over and shuts          */
    slamMs: 240, slamFromScale: 1.4, slamRot: 8,
    flashMs: 90
  },

  /* --- 8. post — envelope flies to the outbox ------------------------- */
  post: {
    total: 600,
    toScale: 0.35, toRot: 8, toOpacity: 0.9,
    pipPopMs: 260
  },

  /* --- 9. finale ------------------------------------------------------ */
  finale: {
    total: 1200,
    pullbackMs: 400, pullbackScale: 0.94,
    stagger: 140,
    flyMs: 520
  },

  /* beat between rounds, so the empty desk reads as its own frame and the
     next letter clearly arrives rather than snapping in */
  betweenLetters: 420
};

/* Scale a duration by the global multiplier. */
TIMING.ms = function (v) { return Math.max(0, v * TIMING.SPEED); };

/* =================================================================== */
/* 2. CONTENT — the full progression from the levelling sheet           */
/* =================================================================== */
/*
 * Eight numbered levels plus a tutorial, 24 letters in all. Source: the
 * "Punctuation Puzzle — Gameplay" sheet. Authored with a marker syntax so
 * the sentences stay readable; parseLetter() turns them into targets.
 *
 *   ^word   capitalise that word's first letter          -> a target
 *   [.]     a slot needing a full stop  (also [,] [?] [!])
 *   //      sentence break, for multi-sentence letters
 *   anything else is literal text and is never a target
 *
 * TWO RESOLUTIONS MADE WHILE READING THE SHEET — both flagged in README:
 *
 *  1. Levels 2A, 2C, 3A, 3C, 4B and 4C show a lowercase opening word and an
 *     expected answer with a capital, but their tray offers only end marks
 *     (no a->A). A capital cannot be a target with no stamp to place. Since
 *     those levels teach end punctuation, the opening word is rendered
 *     ALREADY capitalised and the only target is the end mark. The rule
 *     applied throughout: a capital is a target only where the tray includes
 *     the caps stamp.
 *  2. 5B's expected answer drops the final full stop that its shown text
 *     already has. Read as a typo; the full stop is kept.
 */

const STAMPS = {
  caps:        { id: 'caps',        art: 'assets/stamp-caps.png',        kind: 'capitalise', label: 'Capital letter',    say: 'Capital' },
  period:      { id: 'period',      art: 'assets/stamp-period.png',      kind: 'punctuate', char: '.', label: 'Full stop',        say: 'Full stop' },
  comma:       { id: 'comma',       art: 'assets/stamp-comma.png',       kind: 'punctuate', char: ',', label: 'Comma',            say: 'Comma' },
  question:    { id: 'question',    art: 'assets/stamp-question.png',    kind: 'punctuate', char: '?', label: 'Question mark',    say: 'Question mark' },
  exclamation: { id: 'exclamation', art: 'assets/stamp-exclamation.png', kind: 'punctuate', char: '!', label: 'Exclamation mark', say: 'Exclamation mark' },
  apostrophe:  { id: 'apostrophe',  art: 'assets/stamp-apostrophe.png',  kind: 'punctuate', char: '’', label: 'Apostrophe',  say: 'Apostrophe' }
};

/* The coach's lines. Tier 1 fires on the first miss at a target, tier 2 on
 * the second, tier 3 on the third (which also shows a ghost impression).
 * `idle` is the 9-second inactivity nudge. */
function lines(o) {
  return Object.assign({
    e1: 'Oops! Try again!',
    e2: 'Something still needs fixing.',
    e3: null,
    idle: 'Can you spot what needs fixing?'
  }, o);
}

/* General tips, drawn at random once a learner has already had the hint
 * belonging to this letter. Stalling twice on the same sentence should not
 * produce the same sentence of advice twice; none of these give away which
 * stamp is correct, which the levelling sheet is explicit about. */
const TIPS = [
  'Read the sentence out loud — where do you stop for breath?',
  'A full stop ends a sentence that tells you something.',
  'A question mark ends a sentence that asks something.',
  'An exclamation mark shows surprise or excitement.',
  'A comma is a short pause inside a sentence.',
  'A name always begins with a capital letter.',
  'Drag a stamp onto the spot, or tap the stamp and then tap the spot.',
  'Take your time — you can try as many times as you like.'
];
/* shuffled bag, refilled when empty, so tips cycle rather than repeat */
let tipBag = [];
function pickTip() {
  if (!tipBag.length) {
    tipBag = TIPS.slice();
    for (let i = tipBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = tipBag[i]; tipBag[i] = tipBag[j]; tipBag[j] = t;
    }
  }
  return tipBag.pop();
}

/* letter(id, source, stamps, opts) */
/* The sheet's Instruction column reads "Fix the sentence with the stamps"
 * for every level after the tutorial; the tutorial has its own two-part
 * instruction. */
const DEFAULT_INSTRUCTION = 'Fix the sentence with the stamps.';

function letter(id, source, stamps, opts) {
  return Object.assign({ id: id, source: source, stamps: stamps,
                         instruction: DEFAULT_INSTRUCTION }, opts);
}

const LEVELS = [
  {
    id: 'T', label: 'Tutorial', numeral: null, tutorial: true,
    focus: 'Select, drag and place a punctuation stamp',
    letters: [
      letter('T', 'I will visit you soon [.]', ['period'], {
        read: 'I will visit you soon.', prosody: 'statement',
        intro: 'This sentence needs a full stop.',
        intro2: 'Pick the full-stop stamp and place it at the end.',
        say: lines({
          e1: 'Try placing it at the end of the sentence.',
          e2: 'Try placing it at the end of the sentence.',
          e3: 'Here is where it goes.',
          idle: 'Place the full-stop stamp at the end of the sentence.'
        }),
        praise: "That's it! The full stop shows where the sentence ends."
      })
    ]
  },

  {
    id: 'L1', label: 'Level 1', numeral: 1, focus: 'Capital + full stop',
    letters: [
      letter('1A', '^i am coming to visit you [.]', ['caps', 'period'], {
        read: 'I am coming to visit you.', prosody: 'statement',
        say: lines({ e2: 'Look closely. Where does the sentence begin or end?',
                     idle: 'Look at the beginning and end of the sentence.' })
      }),
      letter('1B', '^we made hot samosas [.]', ['caps', 'period'], {
        read: 'We made hot samosas.', prosody: 'statement',
        say: lines({ e2: 'Where does this sentence begin or end?',
                     idle: 'Look at the beginning and end of the sentence.' })
      }),
      letter('1C', '^the fair was very busy [.]', ['caps', 'period'], {
        read: 'The fair was very busy.', prosody: 'statement',
        say: lines({ e1: null, e2: 'Something still needs fixing.',
                     idle: 'Look at the beginning and end of the sentence.' })
      })
    ]
  },

  {
    id: 'L2', label: 'Level 2', numeral: 2, focus: 'Statement vs question',
    letters: [
      /* opening capital pre-applied — no caps stamp in this tray (see note 1) */
      letter('2A', 'Are you excited [?]', ['period', 'question'], {
        read: 'Are you excited?', prosody: 'question',
        say: lines({ e2: 'Is the writer telling us something or asking something?',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2B', 'I hope you are well [.]', ['period', 'question'], {
        read: 'I hope you are well.', prosody: 'statement',
        say: lines({ e2: 'Is the writer telling us something or asking something?',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2C', 'Did you get my last letter [?]', ['period', 'question'], {
        read: 'Did you get my last letter?', prosody: 'question',
        say: lines({ e2: 'Is the writer telling us something or asking something?',
                     idle: 'Is the writer telling us something or asking something?' })
      })
    ]
  },

  {
    id: 'L3', label: 'Level 3', numeral: 3, focus: 'Statement vs exclamation',
    letters: [
      letter('3A', 'What a wonderful gift [!]', ['period', 'exclamation'], {
        read: 'What a wonderful gift!', prosody: 'exclamation', doodle: 'gift',
        say: lines({ e2: 'How does the writer feel?',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3B', 'I will come on Sunday [.]', ['period', 'exclamation'], {
        read: 'I will come on Sunday.', prosody: 'statement', calm: true,
        say: lines({ e2: 'Is this ordinary information or a strong feeling?',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3C', 'We won the match [!]', ['period', 'exclamation'], {
        read: 'We won the match!', prosody: 'exclamation', confetti: true, doodle: 'trophy',
        say: lines({ e2: 'How should this message sound?',
                     idle: 'Is this ordinary information or a strong feeling?' })
      })
    ]
  },

  {
    id: 'L4', label: 'Level 4', numeral: 4, focus: 'Choose among all end marks',
    letters: [
      letter('4A', 'I reached home safely [.]', ['period', 'question', 'exclamation'], {
        read: 'I reached home safely.', prosody: 'statement',
        say: lines({ e2: 'Read it again. Is it telling, asking, or showing strong feeling?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      letter('4B', 'Can you come tomorrow [?]', ['period', 'question', 'exclamation'], {
        read: 'Can you come tomorrow?', prosody: 'question',
        say: lines({ e2: 'Read it again. Is it telling, asking, or showing strong feeling?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      letter('4C', 'Look at that huge kite [!]', ['period', 'question', 'exclamation'], {
        read: 'Look at that huge kite!', prosody: 'exclamation', doodle: 'kite',
        say: lines({ e2: 'How should this message sound?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      /* first multi-sentence letter — three independent targets, any order */
      letter('4D', 'I have a new puppy [.] // Do you want to meet him [?] // I am so excited [!]',
             ['period', 'question', 'exclamation'], {
        read: 'I have a new puppy. Do you want to meet him? I am so excited!',
        prosody: 'mixed',
        say: lines({ e2: 'What is this sentence doing — telling, asking, or showing strong feeling?',
                     idle: "Let's fix one sentence at a time." })
      })
    ]
  },

  {
    id: 'L5', label: 'Level 5', numeral: 5, focus: 'Comma in a list',
    letters: [
      letter('5A', 'Please send me crayons [,] storybooks and stickers.', ['comma', 'period'], {
        read: 'Please send me crayons, storybooks and stickers.', prosody: 'list',
        doodle: 'list-crayons',
        say: lines({ e2: 'The writer is naming different things.',
                     idle: 'Which words are separate things in the list?' })
      }),
      /* 5B: the sheet's expected answer loses the full stop its own shown text
         has — read as a typo and kept (see note 2) */
      letter('5B', 'We saw monkeys [,] parrots and rabbits at the fair.', ['comma', 'period'], {
        read: 'We saw monkeys, parrots and rabbits at the fair.', prosody: 'list',
        doodle: 'list-animals',
        say: lines({ e2: 'Which words name different things in the list?',
                     idle: 'Which words are separate things in the list?' })
      }),
      letter('5C', 'Please send crayons [,] storybooks [,] stickers and a ball.', ['comma', 'period'], {
        read: 'Please send crayons, storybooks, stickers and a ball.', prosody: 'list',
        doodle: 'list-four',
        say: lines({ e2: 'Which words are separate things in the list?',
                     idle: 'Which words are separate things in the list?' })
      })
    ]
  },

  {
    id: 'L6', label: 'Level 6', numeral: 6, focus: 'Comma changes meaning / direct address',
    letters: [
      letter('6A', "^let's eat [,] Dadi!", ['caps', 'comma'], {
        read: "Let's eat, Dadi!", prosody: 'exclamation', doodle: 'dadi', comic: true,
        say: lines({ e2: 'Oh dear! Are we eating Dadi… or talking to Dadi?',
                     idle: 'Does this sentence say what the writer means?' })
      }),
      letter('6B', 'I miss you [,] Nani!', ['comma', 'period'], {
        read: 'I miss you, Nani!', prosody: 'exclamation', doodle: 'nani',
        say: lines({ e2: 'Who is the writer speaking to?',
                     idle: 'Who is the writer speaking to?' })
      }),
      letter('6C', '^see you soon [,] Raju!', ['caps', 'comma'], {
        read: 'See you soon, Raju!', prosody: 'exclamation', doodle: 'raju',
        say: lines({ e2: 'Who is being spoken to?',
                     idle: 'Who is the writer speaking to?' })
      })
    ]
  },

  {
    id: 'L7', label: 'Level 7', numeral: 7, focus: 'Mixed: capital + end punctuation',
    letters: [
      letter('7A', '^where is my red scarf [?]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'Where is my red scarf?', prosody: 'question',
        say: lines({ e1: null, e2: 'Something still needs fixing.',
                     idle: 'Can you spot what needs fixing?' })
      }),
      letter('7B', '^what a beautiful card [!]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'What a beautiful card!', prosody: 'exclamation', doodle: 'card',
        say: lines({ e2: 'How should this sentence begin? How should it sound at the end?',
                     idle: 'Can you spot what needs fixing?' })
      }),
      letter('7C', '^i will write again soon [.]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'I will write again soon.', prosody: 'statement',
        say: lines({ e2: 'Check the beginning and the end.',
                     idle: 'Can you spot what needs fixing?' })
      })
    ]
  },

  {
    id: 'L8', label: 'Final Letter', numeral: 8, final: true,
    focus: 'Capital + . , ? ! together',
    letters: [
      letter('8',
        'Dear Raju, ^i went to the fair [.] // I saw monkeys [,] parrots and rabbits [.] // ' +
        '^did you go too [?] // ^it was amazing [!]',
        ['caps', 'period', 'comma', 'question', 'exclamation'], {
        read: 'Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. ' +
              'Did you go too? It was amazing!',
        prosody: 'mixed', big: true,
        say: lines({ e1: 'Hmm… try that again.',
                     e2: 'Read this part again. What is the writer trying to say?',
                     idle: 'Check the letter carefully. What still needs fixing?' })
      })
    ]
  }
];

/* ------------------------------------------------------------------ *
 * parseLetter — marker syntax -> characters, sentences and targets.
 *
 * Targets carry a character index into the plain text, the sentence they
 * belong to (so a nudge can pulse just that sentence), and their own error
 * counter. Every target is independent and may be solved in any order.
 * ------------------------------------------------------------------ */
function parseLetter(spec) {
  const MARK = { '.': 'period', ',': 'comma', '?': 'question', '!': 'exclamation' };
  let text = '';
  const targets = [];
  const sentences = [];
  let sStart = 0, sIndex = 0;

  spec.source.split(/\s+/).forEach((tok, i, arr) => {
    if (tok === '//') {                                  /* sentence break */
      sentences.push({ index: sIndex++, start: sStart, end: text.length });
      if (text.length && text[text.length - 1] !== ' ') { text += ' '; }
      sStart = text.length;
      return;
    }
    const m = /^\[(.)\]$/.exec(tok);
    if (m) {
      targets.push({ id: 't' + targets.length, at: text.length, kind: 'punctuate',
                     char: m[1], stamp: MARK[m[1]], sentence: sIndex, errors: 0, done: false });
      return;
    }
    if (text.length && !text.endsWith(' ')) text += ' ';
    if (tok.charAt(0) === '^') {
      tok = tok.slice(1);
      targets.push({ id: 't' + targets.length, at: text.length, kind: 'capitalise',
                     stamp: 'caps', sentence: sIndex, errors: 0, done: false });
    }
    text += tok;
  });
  sentences.push({ index: sIndex, start: sStart, end: text.length });

  return Object.assign({}, spec, { text: text, targets: targets, sentences: sentences });
}

/* Does this stamp satisfy this target? A comma cannot stand in for a full
 * stop, so punctuation must match on the exact character. */
function stampSatisfies(stampId, target) {
  const s = STAMPS[stampId];
  if (!s || !target) return false;
  if (s.kind !== target.kind) return false;
  return target.kind === 'punctuate' ? s.char === target.char : true;
}

/* flat list of every letter, with its level attached */
const ALL_LETTERS = [];
LEVELS.forEach((lv) => lv.letters.forEach((lt, i) => {
  ALL_LETTERS.push(Object.assign({}, lt, { level: lv, indexInLevel: i }));
}));

const TOTAL_SETS = LEVELS.filter((l) => !l.tutorial).length;   /* the "/8" */

/* =================================================================== */
/* 3. GAME — the nine-state machine                                     */
/* =================================================================== */
/*
 *   idle → deal → open → read → await-input → stamp ─┬→ await-input
 *                                                     └→ seal → post ─┬→ idle
 *                                                                     └→ finale
 *
 * Rules the rest of this file depends on:
 *
 *  1. MOTION IS TRANSFORM AND OPACITY ONLY. Layout is percentages of the
 *     stage (styles.css); motion is computed here in real px from the live
 *     stage size, so an arc is correct at any scale without touching layout.
 *
 *  2. anim() NEVER REJECTS, and on finish it COMMITS its end value to inline
 *     style and cancels itself. A finished `fill: both` animation otherwise
 *     keeps applying from the animation cascade origin, which outranks inline
 *     styles — that is what once left the card invisible from letter two on.
 *
 *  3. TARGETS ARE INDEPENDENT AND SOLVED IN ANY ORDER. Each carries its own
 *     error counter driving a three-tier nudge, per the levelling sheet.
 */
(function () {
  'use strict';

  const DESIGN = { w: 1920, h: 1080 };

  /* design-px geometry, from Figma 9xydFCYrapJ6V0ypxX1l3c / 94:17 */
  const L = {
    card:     { x: 383, y: 158, w: 1153, h: 635 },
    sentence: { x: 507, y: 400, w: 906,  h: 108 },
    tray:     { x: 545.2, y: 804.1, w: 829.5, h: 276.5 },
    trayLipFrac: 458 / 724,
    stampInkW: 112,
    padBaseline: 998,
    slotPitch: 147,
    slotCentre: 944.5,
    inbox: [
      { x: -142.89, y: 961.33, w: 302.19, h: 231.63 },
      { x: -118.77, y: 979.21, w: 302.19, h: 231.63 }
    ],
    outboxVis: { cx: 1786, cy: 950, w: 192 },
    finaleVis: [
      { cx: 499, cy: 470, w: 442 },
      { cx: 960, cy: 470, w: 442 },
      { cx: 1421, cy: 470, w: 442 }
    ],
    /* generous drop zone around a target — touch-sized for children */
    hit: { w: 84, h: 112 },
    snapRadius: 96
  };

  const ENV = { box: 1254, fx0: 144 / 1254, fy0: 260 / 1254, fw: 974 / 1254, fh: 720 / 1254 };

  /* The drawn envelope's own coordinates (index.html, viewBox 0 0 974 720).
   * `mouth` is the top edge of the front panel — the line the letter passes
   * through — and `frontW` is the width of the pocket it has to fit. */
  const ENVV = { w: 974, h: 720, mouth: 330, frontW: 870, visW: 0.42 };

  /* measured stamp art; `scale` puts every stamp's ink at 112 design px wide */
  const STAMP_ART = {
    caps:        { w: 282, h: 446, cx: 140.0, padTop: 231, padBottom: 445, scale: 112 / 282 },
    period:      { w: 280, h: 446, cx: 138.5, padTop: 231, padBottom: 444, scale: 112 / 280 },
    comma:       { w: 281, h: 446, cx: 140.0, padTop: 232, padBottom: 443, scale: 112 / 281 },
    question:    { w: 280, h: 444, cx: 138.0, padTop: 231, padBottom: 442, scale: 112 / 280 },
    exclamation: { w: 285, h: 444, cx: 142.0, padTop: 230, padBottom: 441, scale: 112 / 285 },
    apostrophe:  { w: 281, h: 445, cx: 140.0, padTop: 230, padBottom: 442, scale: 112 / 281 }
  };

  /* =================================================================== */
  /* stage + animation helpers                                           */
  /* =================================================================== */
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), world = $('#world');
  let U = 1;
  const u = (n) => n * U;

  function fit() {
    U = stage.getBoundingClientRect().height / DESIGN.h;
    document.documentElement.style.setProperty('--u', U + 'px');
  }

  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => RM.matches;
  const D = (ms) => (reduced() ? 120 : TIMING.ms(ms));

  const running = new Set();

  function anim(el, frames, ms, easing, opts) {
    if (!el) return Promise.resolve();
    opts = opts || {};
    /* `easing` must be a CSS string. bezier() returns a SAMPLING FUNCTION for
     * arcFrames, and handing one of those to el.animate() throws — which the
     * catch below turned into an instantly-resolved promise, so a whole beat
     * of a sequence vanished behind a console warning nothing was reading. */
    if (easing != null && typeof easing !== 'string') {
      console.error('[anim] easing must be a CSS string, got ' + typeof easing);
      easing = TIMING.ease.standard;
    }
    let a;
    try {
      a = el.animate(frames, Object.assign({
        duration: Math.max(0, ms), easing: easing || TIMING.ease.standard, fill: 'both'
      }, opts));
    } catch (e) { console.error('[anim]', e); return Promise.resolve(); }
    running.add(a);
    return new Promise((res) => {
      let settled = false;
      const done = (commit) => {
        if (settled) return;
        settled = true;
        running.delete(a);
        if (commit && opts.commit !== false) { try { a.commitStyles(); } catch (e) {} }
        try { a.cancel(); } catch (e) {}
        res(a);
      };
      a.addEventListener('finish', () => done(true), { once: true });
      a.addEventListener('cancel', () => done(false), { once: true });
    });
  }

  let timerNode = null;
  function wait(ms) {
    if (!timerNode) {
      timerNode = document.createElement('div');
      timerNode.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(timerNode);
    }
    return anim(timerNode, [{ opacity: 0 }, { opacity: 0 }], Math.max(0, ms), 'linear',
                { fill: 'none', commit: false });
  }

  function finishAll() {
    Array.from(running).forEach((a) => {
      try { a.finish(); } catch (e) { try { a.cancel(); } catch (e2) {} }
    });
    running.clear();
  }

  const EASE_FNS = {};
  function bezier(x1, y1, x2, y2) {
    const key = [x1, y1, x2, y2].join();
    if (EASE_FNS[key]) return EASE_FNS[key];
    const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
    const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
    const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
    const f = (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const sl = slope(t, x1, x2); if (!sl) break;
        const e = calc(t, x1, x2) - x; if (Math.abs(e) < 1e-5) break;
        t -= e / sl;
      }
      return calc(t, y1, y2);
    };
    EASE_FNS[key] = f;
    return f;
  }

  const tf = (p) => `translate3d(${p.x || 0}px, ${p.y || 0}px, 0) rotate(${p.rot || 0}deg) scale(${p.s == null ? 1 : p.s})`;

  function arcFrames(from, to, lift, ease, steps) {
    steps = steps || 16;
    const f = typeof ease === 'function' ? ease : bezier(0.22, 0.8, 0.28, 1);
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 + lift;
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), p = f(t), q = 1 - p;
      out.push({
        transform: tf({
          x: q * q * from.x + 2 * q * p * mx + p * p * to.x,
          y: q * q * from.y + 2 * q * p * my + p * p * to.y,
          rot: (from.rot || 0) + ((to.rot || 0) - (from.rot || 0)) * p,
          s: (from.s == null ? 1 : from.s) + ((to.s == null ? 1 : to.s) - (from.s == null ? 1 : from.s)) * p
        }), offset: t, easing: 'linear'
      });
    }
    return out;
  }

  const emit = (name, detail) =>
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));


  /* =================================================================== */
  /* audio — CC0 sound effects + browser TTS for the coach               */
  /* =================================================================== */
  /*
   * Sound effects are Kenney "Interface Sounds", CC0 / public domain — free
   * for commercial use, credit optional. The pack licence ships verbatim in
   * assets/sfx/LICENSE.txt. They are .ogg, which Chrome (the stated target)
   * plays natively; anywhere the file fails to load or decode, a small
   * procedurally-synthesised tone stands in, so the game is never silent and
   * never depends on a download.
   *
   * The coach speaks through the browser's own speech synthesis, so there are no
   * voice files to license or ship. Everything she says is also live DOM text
   * in her narration box and in the polite live region.
   *
   * Autoplay policy: nothing can sound until the first user gesture, so the
   * whole engine arms itself on the first pointerdown/keydown.
   */
  const SFX_FILES = {
    thump:   'assets/sfx/thump.ogg',
    boop:    'assets/sfx/boop.ogg',
    chime:   'assets/sfx/chime.ogg',
    seal:    'assets/sfx/seal.ogg',
    whoosh:  'assets/sfx/whoosh.ogg',
    complete:'assets/sfx/complete.ogg',
    sparkle: 'assets/sfx/sparkle.ogg',
    pickup:  'assets/sfx/pickup.ogg'
  };
  /* fallback tones: [type, startHz, endHz, seconds, gain] */
  const SFX_TONES = {
    thump:   ['sine',     180,  60, 0.16, 0.5],
    boop:    ['triangle', 300, 190, 0.14, 0.28],
    chime:   ['sine',     880,1320, 0.30, 0.24],
    seal:    ['sine',     140,  50, 0.32, 0.55],
    whoosh:  ['sawtooth', 520, 120, 0.28, 0.16],
    complete:['sine',     660,1760, 0.55, 0.26],
    sparkle: ['sine',    1560,2400, 0.18, 0.16],
    pickup:  ['triangle', 520, 700, 0.09, 0.20]
  };

  const Audio_ = {
    on: true, armed: false, ctx: null, buffers: {}, el: {},

    init() {
      /* preload:'none' on purpose — eight audio requests fired during boot
         compete with the artwork for the browser's six connections. They are
         a few KB each and are fetched by warm() once the game is running. */
      Object.keys(SFX_FILES).forEach((k) => {
        const a = new Audio(SFX_FILES[k]);
        a.preload = 'none';
        a.volume = 0.55;
        this.el[k] = a;
      });
    },

    warm() {
      Object.keys(this.el).forEach((k) => {
        try { this.el[k].preload = 'auto'; this.el[k].load(); } catch (e) {}
      });
    },

    /* browsers refuse sound before a gesture; arm on the first one */
    arm() {
      if (this.armed) return;
      this.armed = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { this.ctx = new AC(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
      } catch (e) {}
      emit('audio:ready', {});
    },

    play(name) {
      if (!this.on || !this.armed) return;
      const a = this.el[name];
      if (a && a.readyState >= 2) {
        try { const c = a.cloneNode(); c.volume = a.volume; c.play().catch(() => this.tone(name)); return; }
        catch (e) {}
      }
      this.tone(name);           /* file missing or undecodable — synthesise */
    },

    tone(name) {
      const spec = SFX_TONES[name];
      if (!spec || !this.ctx) return;
      const [type, f0, f1, dur, gain] = spec;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },

    /* The coach's voice. prosody shapes pitch/rate so a question rises and an
       exclamation lifts — the sheet asks for statement/question/exclamation
       intonation when she reads a finished sentence back. */
    speak(text, prosody) {
      if (!this.on || !text || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.92; utt.pitch = 1.15; utt.volume = 0.9;
        if (prosody === 'question')    { utt.pitch = 1.3; }
        if (prosody === 'exclamation') { utt.pitch = 1.35; utt.rate = 1.0; }
        if (prosody === 'list')        { utt.rate = 0.85; }
        window.speechSynthesis.speak(utt);
      } catch (e) {}
    },

    stopSpeech() { try { window.speechSynthesis.cancel(); } catch (e) {} },

    mute(v) {
      this.on = !v;
      if (v) this.stopSpeech();
      document.body.dataset.muted = String(!!v);
    }
  };

  /* Wire the named game events to sound. Everything above stays decoupled:
     the animation code only ever emits an event. */
  function wireAudio() {
    Audio_.init();
    const on = (n, f) => document.addEventListener(n, f);
    on('stamp:press',       () => { Audio_.play('thump'); setTimeout(() => Audio_.play('sparkle'), 90); });
    on('stamp:reject',      () => Audio_.play('boop'));
    on('stamp:pickup',      () => Audio_.play('pickup'));
    on('letter:seal',       () => Audio_.play('chime'));
    on('letter:seal:stamp', () => Audio_.play('seal'));
    on('letter:post',       () => Audio_.play('whoosh'));
    on('set:complete',      () => Audio_.play('complete'));
    on('coach:read',         (e) => Audio_.speak(e.detail.text, e.detail.prosody));
    on('coach:say',          (e) => Audio_.speak(e.detail.text));
    ['pointerdown', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, () => Audio_.arm(), { passive: true }));
  }

  /* =================================================================== */
  /* coach panel — dialogue + tone                                       */
  /* =================================================================== */
  /* One narrator, one place on screen: the strip along the top. `tone`
   * drives the roundel and the panel's accent colour (neutral / puzzled /
   * pleased / delighted). Every line is live DOM text mirrored into the
   * polite live region, so the game reads correctly to a screen reader. */
  const coachEl = $('#coach'), coachLine = $('#coach-line'), sayEl = $('#say');
  let coachSpeakT = null;

  function coach(text, tone, opts) {
    opts = opts || {};
    if (tone) coachEl.dataset.tone = tone;
    if (text == null) return;
    coachLine.textContent = text;
    coachEl.classList.add('live');
    /* the roundel ticks for as long as the line is fresh, so a new line is
       noticed without the text itself moving */
    coachEl.classList.remove('speaking');
    void coachEl.offsetWidth;                 /* restart the keyframes */
    coachEl.classList.add('speaking');
    clearTimeout(coachSpeakT);
    coachSpeakT = setTimeout(() => coachEl.classList.remove('speaking'),
                             Math.min(4000, 900 + text.length * 45));
    if (sayEl && opts.announce !== false) sayEl.textContent = text;
    if (opts.speak !== false) emit('coach:say', { text, tone: coachEl.dataset.tone });
    if (!reduced()) {
      anim(coachLine, [{ opacity: 0.35, transform: 'translate3d(0,4px,0)' },
                       { opacity: 1, transform: 'translate3d(0,0,0)' }], D(220), TIMING.ease.out);
    }
  }
  /* the coach reads the finished sentence; prosody is passed to the audio hook */
  function coachRead(letter) {
    coach(letter.read, 'pleased', { speak: false });   /* coach:read speaks it */
    emit('coach:read', { text: letter.read, prosody: letter.prosody });
  }

  /* =================================================================== */
  /* runtime state                                                       */
  /* =================================================================== */
  const S = {
    name: 'idle',
    levelIndex: 0,        /* index into LEVELS, tutorial included */
    letterIndex: 0,       /* index within the level */
    letter: null,         /* parsed letter */
    solved: 0,            /* letters completed in this level */
    posted: 0,            /* completed level envelopes in the mailbag */
    repairsSolved: 0,     /* targets completed in the current letter */
    repairsTotal: 0,      /* targets in the current letter */
    selected: 0,          /* tray index, for the keyboard path */
    pick: null            /* {stampId, target} chosen this turn */
  };

  const level = () => LEVELS[S.levelIndex];
  const letterSpec = () => level().letters[S.letterIndex];
  /* TODO(data): swap for fetch('levels.json') if content ever moves to HTTP. */
  const loadContent = () => LEVELS;

  /* =================================================================== */
  /* sentence + targets                                                  */
  /* =================================================================== */
  const sentenceEl = $('#sentence'), targetsEl = $('#targets');
  let charEls = [], marks = {}, hits = {};

  function renderSentence(letter) {
    sentenceEl.innerHTML = '';
    targetsEl.innerHTML = '';
    charEls = []; marks = {}; hits = {};
    /* an inner block so #sentence can flex-centre it vertically while the
       text itself still flows and wraps normally */
    const line = document.createElement('span');
    line.className = 'sentence-inner';
    sentenceEl.appendChild(line);

    const text = letter.text;
    /* group characters into words so wrapping happens between words: with a
       span per character the browser would otherwise break anywhere */
    const words = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === ' ') { words.push({ space: true, s: i, e: i }); i++; continue; }
      const s = i;
      while (i < text.length && text[i] !== ' ') i++;
      words.push({ space: false, s, e: i - 1 });
    }

    words.forEach((w) => {
      if (w.space) { line.appendChild(document.createTextNode(' ')); return; }
      const wrap = document.createElement('span');
      wrap.className = 'wordwrap';
      for (let k = w.s; k <= w.e + 1; k++) {
        letter.targets.forEach((t) => {
          if (t.kind === 'punctuate' && t.at === k && k >= w.s && k <= w.e + 1) {
            wrap.appendChild(makeMark(t, k <= w.e));
          }
        });
        if (k > w.e) break;
        const c = document.createElement('span');
        c.className = 'ch';
        c.textContent = text[k];
        c.dataset.i = k;
        charEls[k] = c;
        wrap.appendChild(c);
      }
      wrap.dataset.sentence = sentenceOf(letter, w.s);
      line.appendChild(wrap);
    });

    letter.targets.forEach((t) => {
      if (t.kind !== 'capitalise') return;
      const c = charEls[t.at];
      if (c) { c.classList.add('pending'); marks[t.id] = c; }
    });
  }

  function sentenceOf(letter, at) {
    const s = letter.sentences.find((x) => at >= x.start && at <= x.end);
    return s ? s.index : 0;
  }

  function makeMark(t, tight) {
    const s = document.createElement('span');
    s.className = 'slot pending' + (tight ? ' slot-tight' : '');
    const m = document.createElement('span');
    m.className = 'mark';
    m.textContent = t.char;
    s.appendChild(m);
    marks[t.id] = s;
    return s;
  }

  /* One generous invisible drop zone per unsolved target. These are the tap
   * areas, the drag snap points, and the hosts for the pulse / glow / ghost
   * states — so all target feedback lives in one place. */
  function buildHits() {
    targetsEl.innerHTML = '';
    hits = {};
    const st = stage.getBoundingClientRect();
    S.letter.targets.forEach((t) => {
      if (t.done) return;
      const el = marks[t.id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = (r.left - st.left + r.width / 2) / U;
      const cy = (r.top - st.top + r.height / 2) / U;
      const h = document.createElement('button');
      h.type = 'button';
      h.className = 'hit';
      h.dataset.target = t.id;
      h.setAttribute('aria-label',
        t.kind === 'capitalise' ? 'Capitalise this letter' : 'Punctuation slot');
      h.style.left = ((cx - L.hit.w / 2) / DESIGN.w * 100) + '%';
      h.style.top = ((cy - L.hit.h / 2) / DESIGN.h * 100) + '%';
      h.style.width = (L.hit.w / DESIGN.w * 100) + '%';
      h.style.height = (L.hit.h / DESIGN.h * 100) + '%';
      const ghost = document.createElement('span');
      ghost.className = 'ghost';
      ghost.textContent = t.kind === 'capitalise'
        ? S.letter.text[t.at].toUpperCase() : t.char;
      h.appendChild(ghost);
      h.addEventListener('click', () => onTargetTap(t));
      /* Escalation state is derived from the target, never stored on the
         element: buildHits() runs after every press, so anything held only in
         a CSS class would be wiped the moment the zones were rebuilt. */
      if (t.errors >= 3) { h.classList.add('glow-strong', 'has-ghost'); }
      else if (t.errors >= 2) { h.classList.add('glow'); }
      targetsEl.appendChild(h);
      hits[t.id] = { el: h, cx, cy, target: t };
    });
  }

  const unsolved = () => S.letter.targets.filter((t) => !t.done);

  function readout() {
    const text = S.letter.text;
    let out = '';
    for (let k = 0; k <= text.length; k++) {
      S.letter.targets.forEach((t) => {
        if (t.kind === 'punctuate' && t.at === k && t.done) out += t.char;
      });
      if (k === text.length) break;
      let ch = text[k];
      S.letter.targets.forEach((t) => {
        if (t.kind === 'capitalise' && t.at === k && t.done) ch = ch.toUpperCase();
      });
      out += ch;
    }
    return out.replace(/\s+([.,?!])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  /* =================================================================== */
  /* geometry helpers                                                    */
  /* =================================================================== */
  function rectOf(el) {
    const a = el.getBoundingClientRect(), b = stage.getBoundingClientRect();
    return {
      x: (a.left - b.left) / U, y: (a.top - b.top) / U,
      w: a.width / U, h: a.height / U,
      cx: (a.left - b.left + a.width / 2) / U,
      cy: (a.top - b.top + a.height / 2) / U
    };
  }

  function envBox(cx, cy, visW) {
    const box = visW / ENV.fw;
    return { x: cx - (ENV.fx0 + ENV.fw / 2) * box, y: cy - (ENV.fy0 + ENV.fh / 2) * box,
             w: box, h: box };
  }

  function place(el, r) {
    el.style.left = (r.x / DESIGN.w * 100) + '%';
    el.style.top = (r.y / DESIGN.h * 100) + '%';
    el.style.width = (r.w / DESIGN.w * 100) + '%';
    if (r.h != null) el.style.height = (r.h / DESIGN.h * 100) + '%';
  }

  /* =================================================================== */
  /* the letter card                                                     */
  /* =================================================================== */
  const cardLayer = $('#card-layer'), cardFlat = $('#card-flat'), cardFold = $('#card-fold');
  const fbTop = $('#fb-top'), fbBot = $('#fb-bot'), cardFlap = $('#card-flap');
  const stripes = () => document.querySelectorAll('.card-stripes');
  const shadeOf = (b) => b.querySelector('.shade');
  const creaseOf = (b) => b.querySelector('.crease');

  const useFlat = () => { cardFlat.hidden = false; cardFold.hidden = true; };
  const useBands = () => { cardFlat.hidden = true; cardFold.hidden = false; };

  function resetCard() {
    useFlat();
    cardLayer.style.opacity = '0';
    cardLayer.style.transform = '';
    cardLayer.style.transformOrigin = '';
    cardFlap.style.opacity = '0';
    cardLayer.classList.remove('lift', 'land');
    cardFold.style.transform = '';
    [fbTop, fbBot].forEach((b) => {
      b.style.transform = '';
      shadeOf(b).style.opacity = '0';
      creaseOf(b).style.opacity = '0';
      const t = b.querySelector('.thick');
      if (t) t.style.opacity = '0';
    });
    document.querySelectorAll('.cast').forEach((c) => { c.style.opacity = '0'; });
    stripes().forEach((x) => { x.style.opacity = '0'; });
    sentenceEl.style.opacity = '0';
    targetsEl.innerHTML = '';
  }

  /* One third folding over. The band tilts in real depth, its shading comes
   * up as it turns away from the light, and a crease line firms up on the
   * hinge. translateZ lifts each fold above the one under it so the stack
   * reads in the right order. */
  function foldBand(band, deg, lift, ms, cast) {
    const shade = shadeOf(band), crease = creaseOf(band);
    const thick = band.querySelector('.thick');
    const sign = deg < 0 ? -1 : 1;
    return Promise.all([
      /* Most of the duration is spent between 30 and 150 degrees, which is
       * where the perspective actually shows; then a small overshoot past
       * flat and a settle, the way paper springs when you crease it. */
      anim(band, [
        { transform: 'rotateX(0deg) translateZ(0px)', offset: 0 },
        { transform: `rotateX(${sign * 42}deg) translateZ(${lift * 0.35}px)`, offset: 0.22 },
        { transform: `rotateX(${sign * 96}deg) translateZ(${lift * 0.7}px)`, offset: 0.55 },
        { transform: `rotateX(${deg + sign * 7}deg) translateZ(${lift}px)`, offset: 0.86 },
        { transform: `rotateX(${deg}deg) translateZ(${lift}px)`, offset: 1 }
      ], D(ms), 'cubic-bezier(.42,.02,.30,1)'),
      /* brightest edge-on, then settling to the shade of a turned-over face */
      anim(shade, [
        { opacity: 0 },
        { opacity: 0.95, offset: 0.55 },
        { opacity: 0.5 }
      ], D(ms), 'ease-out'),
      anim(crease, [{ opacity: 0 }, { opacity: 1 }], D(ms * 0.35), 'ease-out'),
      /* the stock's own thickness, only visible while the band is edge-on:
         brightest around 90 degrees, gone once the face lies flat again */
      thick ? anim(thick, [
        { opacity: 0 },
        { opacity: 0.9, offset: 0.5 },
        { opacity: 0.55, offset: 0.8 },
        { opacity: 0.25 }
      ], D(ms), 'ease-out') : Promise.resolve(),
      cast ? anim(cast, [
        { opacity: 0 },
        { opacity: 0.75, offset: 0.6 },
        { opacity: 0.42 }
      ], D(ms), 'ease-out') : Promise.resolve()
    ]);
  }

  /* The made stack drops the last millimetre and stops dead. Without it the
   * fold ends on a held pose, which is the tell that nothing has weight. */
  function settleThump() {
    if (reduced()) return Promise.resolve();
    deskShift();
    return anim(cardFold, [
      { transform: 'translate3d(0,0,0) scale(1)' },
      { transform: `translate3d(0,${u(5)}px,0) scale(.994)`, offset: 0.42 },
      { transform: 'translate3d(0,0,0) scale(1)' }
    ], D(190), TIMING.ease.thump);
  }

  /* The pose each band ends a fold in — shared by the fold, the unfold and
   * the pre-set that makes a letter arrive already folded. */
  const FOLDED = { bot: { deg: -171.5, lift: 4 }, top: { deg: 176.5, lift: 11 } };

  function setFolded() {
    useBands();
    [[fbBot, FOLDED.bot], [fbTop, FOLDED.top]].forEach(([b, f]) => {
      b.style.transform = `rotateX(${f.deg}deg) translateZ(${f.lift}px)`;
      shadeOf(b).style.opacity = '0.5';
      creaseOf(b).style.opacity = '1';
      const t = b.querySelector('.thick');
      if (t) t.style.opacity = '0.25';
    });
    document.querySelectorAll('.cast').forEach((c) => { c.style.opacity = '0.42'; });
  }

  /* A band coming back flat. Not foldBand reversed: the crease and the cast
   * shadow have to die away at the END of the move, not the start, and the
   * settle overshoots the other way. */
  function unfoldBand(band, deg, lift, ms, cast) {
    const shade = shadeOf(band), crease = creaseOf(band);
    const thick = band.querySelector('.thick');
    const sign = deg < 0 ? -1 : 1;
    return Promise.all([
      anim(band, [
        { transform: `rotateX(${deg}deg) translateZ(${lift}px)`, offset: 0 },
        { transform: `rotateX(${sign * 96}deg) translateZ(${lift * 0.7}px)`, offset: 0.42 },
        { transform: `rotateX(${sign * 40}deg) translateZ(${lift * 0.3}px)`, offset: 0.74 },
        { transform: `rotateX(${-sign * 5}deg) translateZ(0px)`, offset: 0.9 },
        { transform: 'rotateX(0deg) translateZ(0px)', offset: 1 }
      ], D(ms), 'cubic-bezier(.34,.02,.28,1)'),
      anim(shade, [{ opacity: 0.5 }, { opacity: 0.9, offset: 0.42 }, { opacity: 0 }],
           D(ms), 'ease-in'),
      anim(crease, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
           D(ms), 'ease-in'),
      thick ? anim(thick, [{ opacity: 0.25 }, { opacity: 0.85, offset: 0.45 }, { opacity: 0 }],
                   D(ms), 'ease-in') : Promise.resolve(),
      cast ? anim(cast, [{ opacity: 0.42 }, { opacity: 0.7, offset: 0.4 }, { opacity: 0 }],
                  D(ms), 'ease-in') : Promise.resolve()
    ]);
  }

  function miniCard(rect) {
    const d = document.createElement('div');
    d.className = 'mini';
    place(d, rect);
    d.innerHTML = '<svg viewBox="10.3 4.3 1152.34 635" preserveAspectRatio="none">' +
                  '<use href="#card-art" x="10.3" y="4.3" width="1152.34" height="635"/></svg>';
    return d;
  }

  /* =================================================================== */
  /* tray + stamps                                                       */
  /* =================================================================== */
  const trayEl = $('#tray'), lipEl = $('#tray-lip'), stampsEl = $('#stamps');
  let stampEls = [], stampSlots = [];

  function layoutTray() {
    const lipTop = L.tray.y + L.tray.h * L.trayLipFrac;
    lipEl.style.left = (L.tray.x / DESIGN.w * 100) + '%';
    lipEl.style.top = (lipTop / DESIGN.h * 100) + '%';
    lipEl.style.width = (L.tray.w / DESIGN.w * 100) + '%';
    lipEl.style.height = ((L.tray.y + L.tray.h - lipTop) / DESIGN.h * 100) + '%';
    lipEl.style.backgroundSize = u(L.tray.w) + 'px ' + u(L.tray.h) + 'px';
    lipEl.style.backgroundPosition = '0px ' + (-u(L.tray.h * L.trayLipFrac)) + 'px';
  }

  function buildStamps(ids) {
    stampsEl.innerHTML = '';
    stampEls = []; stampSlots = [];
    const n = ids.length;
    /* pitch shrinks so up to five stamps still sit inside the tray well */
    const pitch = Math.min(L.slotPitch, 700 / n);
    const left = L.slotCentre - (n - 1) * pitch / 2;

    ids.forEach((id, i) => {
      const def = STAMPS[id], art = STAMP_ART[id];
      if (!def || !art) { console.warn('[stamps] unknown', id); return; }
      const cx = left + i * pitch;
      const box = { x: cx - art.cx * art.scale, y: L.padBaseline - art.padBottom * art.scale,
                    w: art.w * art.scale, h: art.h * art.scale };
      stampSlots.push({ id, box, cx, art });

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stamp bob';
      b.dataset.stamp = id;
      b.setAttribute('aria-label', def.label);
      place(b, box);
      /* origin at the rubber pad, in percent so it holds at any scale */
      b.style.transformOrigin = (art.cx / art.w * 100) + '% ' + (art.padBottom / art.h * 100) + '%';

      /* handle stays rigid, pad squashes. Percentage clip — a px inset would
         crop the art at every stage scale but 1:1. */
      const padTopPct = art.padTop / art.h * 100;
      b.appendChild(stampPart(def.art, `inset(0 0 ${100 - padTopPct}% 0)`, null));
      b.appendChild(stampPart(def.art, `inset(${padTopPct}% 0 0 0)`, art.padBottom / art.h * 100));

      /* Tap and drag are the SAME gesture here: pointerdown arms the stamp,
       * pointerup decides whether it was a tap (stay armed, waiting for a
       * target) or a drag (submit, or slide home). There is deliberately no
       * click listener — a click fires after pointerup, so it used to re-enter
       * the toggle and disarm the stamp the instant it had been armed, which
       * made every tap do nothing at all. */
      b.addEventListener('pointerdown', (e) => onStampDown(e, i));
      stampsEl.appendChild(b);
      stampEls.push(b);
    });
    S.selected = 0;
    refreshStampState();
  }

  function stampPart(src, clip, originYPct) {
    const s = document.createElement('span');
    s.className = 'part';
    s.style.clipPath = clip;
    s.style.webkitClipPath = clip;
    if (originYPct != null) s.style.transformOrigin = '50% ' + originYPct + '%';
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.draggable = false;
    s.appendChild(img);
    return s;
  }

  function lockStamps(on) {
    stampsEl.classList.toggle('locked', !!on);
    stampEls.forEach((b) => { b.disabled = !!on; });
    refreshStampState();
  }

  function refreshStampState() {
    stampEls.forEach((b, i) => {
      /* A stamp that is being dragged or is held must NOT bob. `bob` animates
       * transform, and a running CSS animation sits in the animation cascade
       * origin, which outranks inline styles — so while it was on, every
       * `btn.style.transform` the drag wrote was silently discarded and the
       * stamp bobbed in place instead of following the pointer. onStampDown
       * removed the class and then arm() -> refreshStampState() put it right
       * back, which is how it survived. */
      const busy = (drag && drag.i === i) || (armed && armedStamp === i);
      b.classList.toggle('bob', !reduced() && !b.disabled && S.name === 'await-input' && !busy);
      b.classList.toggle('is-selected', i === S.selected && armed);
      b.setAttribute('aria-pressed', String(i === S.selected && armed));
    });
  }

  /* =================================================================== */
  /* HUD — level numeral + one postal mark per letter in the level       */
  /* =================================================================== */
  const hudCount = $('#hud-count'), hudPips = $('#hud-pips');
  const levelJumpNav = $('#temp-level-nav');
  const levelJumpButtons = $('#temp-level-buttons');

  function buildHud() {
    const lv = level();
    hudPips.innerHTML = '';
    /* The tutorial scores nothing, so it shows no marks at all. Showing
       "01/8" with three pips made it look like Level 1 — and since the
       tutorial deliberately offers a single stamp, that read as "Level 1 has
       one option". The whole pill is hidden for the tutorial instead — a
       "Practice" label was still a bar drawing the eye to a counter that
       was not counting. */
    if (lv.tutorial) { updateHud(); return; }
    const n = lv.letters.length;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'pip';
      /* spread evenly across the pill's right-hand area */
      p.style.left = ((152 + i * (195 / n)) / 382 * 100) + '%';
      p.style.width = ((195 / n - 8) / 382 * 100) + '%';
      p.innerHTML = '<img src="assets/envelope-icon.png" alt="">';
      hudPips.appendChild(p);
    }
    updateHud();
  }

  /* CONFIRMED BY THE LEVELLING SHEET: the numeral is the current level out of
   * eight ("progress header advances to Level 2"), and the marks are the
   * letters within it ("1/3 postal ticks fill for Level 1"; Level 4 has four).
   * The tutorial contributes no progress, so it shows the Level 1 numeral. */
  function updateHud() {
    const lv = level();
    document.body.dataset.tutorial = String(!!lv.tutorial);
    if (lv.tutorial) {
      hudCount.textContent = '';        /* the pill is hidden; see styles.css */
      document.body.dataset.level = lv.id;
      return;
    }
    const n = lv.numeral || 1;
    hudCount.textContent = (n < 10 ? '0' : '') + n + '/' + TOTAL_SETS;
    Array.from(hudPips.children).forEach((p, i) => p.classList.toggle('filled', i < S.solved));
    document.body.dataset.level = lv.id;
  }

  /* =================================================================== */
  /* inbox / outbox / mailbag                                            */
  /* =================================================================== */
  const inboxEl = $('#inbox'), outboxEl = $('#outbox'), mailbagEl = $('#mailbag');
  const envelopeEl = $('#envelope'), sealEl = $('#seal'), flashEl = $('#flash');
  const envUnder = $('#env-under'), envOver = $('#env-over'), envFlap = $('#env-flap');
  const flapShade = $('#env-flap .flap-shade');
  const envInside = $('#env-inside'), envMouth = $('#env-mouth');
  /* everything that is only true while the envelope is open */
  const envOpenBits = [envInside, envMouth];
  const setEnvOpen = (v) => envOpenBits.forEach((e) => { e.style.opacity = v ? '1' : '0'; });
  const FLAP_OPEN = -156;          /* degrees: laid back off the mouth */

  /* Everything the insertion needs, derived rather than typed, so it still
   * lines up if the card or the envelope is ever resized. The folded letter
   * is the MIDDLE third of #card-layer, which is centred on the card's own
   * centre — so scaling the layer about its centre keeps the strip put and
   * only a y offset is left to animate. */
  function envGeom() {
    const c = L.card;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const w = c.w * ENVV.visW, h = w * ENVV.h / ENVV.w;
    const mouthY = cy - h / 2 + h * (ENVV.mouth / ENVV.h);
    const sc = (w * (ENVV.frontW / ENVV.w) * 0.93) / c.w;
    const stripH = (c.h / 3) * sc;
    return {
      cx, cy, w, h, cardCy: cy, sc,
      /* held just clear of the mouth, then pushed down well inside it */
      yAbove:  mouthY - stripH / 2 - c.h * 0.03,
      yInside: mouthY + stripH / 2 + h * 0.12
    };
  }

  function placeEnvelope(g) {
    const r = { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h };
    place(envUnder, r);
    place(envOver, r);
  }

  const setFlap = (deg) => { envFlap.style.transform = `rotateX(${deg}deg)`; };

  /* The strip's pose at a given y, as a transform on #card-layer. */
  const stripPose = (g, y) =>
    `translate3d(0, ${u(y - g.cardCy)}px, 0) scale(${g.sc})`;

  function resetEnvelope() {
    [envUnder, envOver].forEach((e) => { e.style.opacity = '0'; e.style.transform = ''; });
    envFlap.style.transform = '';
    flapShade.style.opacity = '0';
    setEnvOpen(true);
  }

  /* The pile a letter is taken from. Envelopes, not loose cards, since an
     envelope is what now flies out of it. */
  function renderInbox(n) {
    inboxEl.innerHTML = '';
    for (let i = Math.min(n, L.inbox.length) - 1; i >= 0; i--) {
      const r = L.inbox[i];
      const img = document.createElement('img');
      img.src = 'assets/envelope.png'; img.alt = ''; img.draggable = false;
      place(img, envBox(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.86));
      img.style.height = 'auto';
      inboxEl.appendChild(img);
    }
  }

  /* the mailbag fills visibly as levels are completed */
  function renderMailbag(n) {
    mailbagEl.innerHTML = '';
    const shown = Math.min(n, 4);
    for (let i = 0; i < shown; i++) {
      const img = document.createElement('img');
      img.src = 'assets/envelope.png'; img.alt = '';
      const v = L.outboxVis;
      place(img, envBox(v.cx - i * 14, v.cy + i * 9, v.w * (1 + i * 0.05)));
      img.style.height = 'auto';
      img.style.opacity = String(0.92 - i * 0.05);
      mailbagEl.appendChild(img);
    }
  }

  /* =================================================================== */
  /* 1. idle                                                             */
  /* =================================================================== */
  async function stIdle() {
    lockStamps(true);
    stopIdleTimer();
    resetCard();
    resetEnvelope();
    envelopeEl.style.opacity = '0';
    sealEl.style.opacity = '0';

    S.letter = parseLetter(letterSpec());
    S.repairsSolved = 0;
    S.repairsTotal = S.letter.targets.length;
    document.body.dataset.repairsSolved = '0';
    document.body.dataset.repairsTotal = String(S.repairsTotal);
    renderSentence(S.letter);
    buildStamps(S.letter.stamps);
    lockStamps(true);
    renderInbox(level().letters.length - S.solved);
    renderMailbag(S.posted);
    buildHud();
    updateTemporaryLevelNav();

    /* Always set a line here. Passing null leaves the previous one on screen,
       which left the tutorial's "Pick the full-stop stamp" sitting over
       Levels 1-3. */
    coach(level().tutorial ? S.letter.intro : S.letter.instruction, 'neutral');
    await wait(TIMING.betweenLetters);
    return 'deal';
  }

  /* =================================================================== */
  /* 2. deal                                                             */
  /* =================================================================== */
  async function stDeal() {
    const from = L.inbox[0], T = TIMING.deal;
    const g = envGeom();
    /* The letter arrives the way it left: inside a closed envelope. It used
     * to fly in as a bare card and then grow on scaleY, which read as a
     * window blind rather than as paper — and never explained where the
     * letter had come from. */
    placeEnvelope(g);
    setFlap(0);
    setEnvOpen(false);
    resetCard();
    setFolded();
    cardLayer.style.transform = stripPose(g, g.yInside);
    cardLayer.style.opacity = '1';

    const dx = u((from.x + from.w / 2) - g.cx);
    const dy = u((from.y + from.h / 2) - g.cy);
    const pieces = [envUnder, envOver];
    pieces.forEach((e) => { e.style.opacity = '1'; });

    if (reduced()) {
      pieces.forEach((e) => { e.style.transform = ''; });
      await anim(envUnder, [{ opacity: 0 }, { opacity: 1 }], D(1), 'linear');
      return 'open';
    }

    envUnder.classList.add('lift');
    await Promise.all(pieces.map((e) => anim(e, arcFrames(
      { x: dx, y: dy, rot: T.fromRot, s: T.fromScale },
      { x: 0, y: 0, rot: 0, s: T.toScale },
      -u(180), bezier(0.22, 0.8, 0.28, 1), 18), D(T.total), 'linear')));
    envUnder.classList.remove('lift');
    await Promise.all(pieces.map((e) => anim(e, [
      { transform: tf({ s: 1 }) },
      { transform: tf({ s: T.overshoot }), offset: 0.5 },
      { transform: tf({ s: 1 }) }], D(T.overshootMs * 2), 'ease-out')));
    pieces.forEach((e) => { e.style.transform = ''; });
    deskShift();
    return 'open';
  }

  /* =================================================================== */
  /* 3. open — the one vector moment                                     */
  /* =================================================================== */
  async function stOpen() {
    const T = TIMING.open;
    const g = envGeom();

    if (reduced()) {
      resetEnvelope();
      useFlat();
      cardLayer.style.transform = '';
      cardLayer.style.opacity = '1';
      stripes().forEach((s2) => { s2.style.opacity = '1'; });
      cardFlap.style.opacity = '0';
      return 'read';
    }

    /* 1. the flap lifts off the mouth */
    await Promise.all([
      anim(envFlap, [
        { transform: 'rotateX(0deg)' },
        { transform: `rotateX(${FLAP_OPEN * 1.06}deg)`, offset: 0.82 },
        { transform: `rotateX(${FLAP_OPEN}deg)` }
      ], D(T.flapMs), 'cubic-bezier(.3,.05,.25,1)'),
      Promise.all(envOpenBits.map((e) =>
        anim(e, [{ opacity: 0 }, { opacity: 1 }], D(T.flapMs * 0.7), 'ease-out')))
    ]);

    /* 2. the folded letter is drawn up out of the pocket */
    await anim(cardLayer, [
      { transform: stripPose(g, g.yInside) },
      { transform: stripPose(g, g.yAbove) }
    ], D(T.drawMs), TIMING.ease.out);

    /* 3. and opened up to full size, the envelope dropping away behind it */
    await Promise.all([
      anim(cardLayer, [
        { transform: stripPose(g, g.yAbove) },
        { transform: tf({ s: 1 }) }
      ], D(T.growMs), TIMING.ease.deal),
      Promise.all([envUnder, envOver].map((e) =>
        anim(e, [{ opacity: 1, transform: 'scale(1)' },
                 { opacity: 0, transform: 'scale(.92)' }], D(T.growMs * 0.8), 'ease-in')))
    ]);
    resetEnvelope();

    /* 4. the thirds come back flat — the fold, run the other way */
    await unfoldBand(fbTop, FOLDED.top.deg, FOLDED.top.lift, T.unfoldMs, $('.cast-from-top'));
    const flat = unfoldBand(fbBot, FOLDED.bot.deg, FOLDED.bot.lift, T.unfoldMs, $('.cast-from-bot'));
    const fade = wait(T.unfoldMs - T.stripesFadeMs).then(() =>
      Promise.all(Array.from(stripes()).map((x) =>
        anim(x, [{ opacity: 0 }, { opacity: 1 }], D(T.stripesFadeMs), 'ease-out'))));
    await Promise.all([flat, fade]);

    /* back to the single un-sliced instance, so no seam can ever show */
    useFlat();
    stripes().forEach((x) => { x.style.opacity = '1'; });
    cardLayer.style.transform = '';
    cardFlap.style.opacity = '0';
    return 'read';
  }

  /* =================================================================== */
  /* 4. read — the sentence appears uncorrected                          */
  /* =================================================================== */
  async function stRead() {
    const T = TIMING.read;
    sentenceEl.style.opacity = '1';
    const words = sentenceEl.querySelectorAll('.wordwrap');
    if (reduced()) {
      await anim(sentenceEl, [{ opacity: 0 }, { opacity: 1 }], D(1), 'linear');
    } else {
      await Promise.all(Array.from(words).map((w, i) =>
        anim(w, [{ opacity: 0, transform: `translate3d(0, ${u(T.rise)}px, 0)` },
                 { opacity: 1, transform: 'translate3d(0,0,0)' }],
             D(T.total), TIMING.ease.standard, { delay: D(i * T.wordStagger) })));
    }
    buildHits();
    coach(level().tutorial ? S.letter.intro2 : S.letter.instruction, 'neutral');
    return 'await-input';
  }

  /* =================================================================== */
  /* 5. await-input — drag or tap, any target, any order                 */
  /* =================================================================== */
  let resolvePick = null;
  let armed = false;             /* a stamp is picked up, awaiting a target */
  let armedStamp = -1;
  let dragMoved = false;
  let idleTimer = null, idleTicks = 0;

  async function stAwait() {
    if (!unsolved().length) return 'seal';
    buildHits();
    lockStamps(false);
    startIdleTimer();
    const got = await new Promise((res) => { resolvePick = res; });
    stopIdleTimer();
    lockStamps(true);
    if (!got) return 'await-input';        /* released by restart/goto */
    S.pick = got;
    return 'stamp';
  }

  function submit(stampId, target, via, validLocation) {
    if (!resolvePick) return;
    disarm();
    const r = resolvePick;
    resolvePick = null;
    r({ stampId, target, via: via || 'tap', validLocation: validLocation !== false });
  }

  function cancelPick() {
    if (!resolvePick) return;
    const r = resolvePick;
    resolvePick = null;
    r(null);
  }

  function arm(i) {
    if (!armed || armedStamp !== i) emit('stamp:pickup', { stamp: stampSlots[i] && stampSlots[i].id });
    armed = true; armedStamp = i; S.selected = i;
    document.body.classList.add('armed');
    targetsEl.classList.add('live');
    refreshStampState();
  }
  function disarm() {
    armed = false; armedStamp = -1;
    document.body.classList.remove('armed');
    targetsEl.classList.remove('live');
    refreshStampState();
  }

  function onTargetTap(t) {
    if (S.name !== 'await-input' || !armed) return;
    submit(stampSlots[armedStamp].id, t);
  }

  /* Where a stamp hovers over a target, just before it presses. Used by BOTH
   * the drag (so the finger leaves it exactly here) and stStamp (so a tapped
   * stamp flies to the same place). Sharing it is what lets a dragged stamp
   * press from where it already is instead of flying home and back. */
  const HOVER_S = 0.58;
  function hoverPose(slot, hit) {
    const padX = slot.box.x + slot.art.cx * slot.art.scale;
    return { x: u(hit.cx - padX), y: u(hit.cy - 46 - L.padBaseline), s: HOVER_S };
  }

  /* --- drag path: press a stamp, drag it, snap to the nearest target ---
   * The sheet teaches drag-and-drop in the tutorial, so this is the primary
   * interaction; the tap path above is the accessible equivalent. */
  let drag = null;

  function onStampDown(e, i) {
    if (S.name !== 'await-input' || stampEls[i].disabled) return;
    if (e.button != null && e.button !== 0) return;      /* left / primary only */
    dragMoved = false;
    const btn = stampEls[i];
    const slot = stampSlots[i];

    /* Capture is an optimisation, not a requirement — see the window-level
     * listeners below. If it throws (it can, for a pointer the element does
     * not own) the drag must still start, so it is guarded. */
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}

    drag = { i, btn, slot, id: e.pointerId, x0: e.clientX, y0: e.clientY, snap: null,
             wasArmed: armed && armedStamp === i };
    btn.classList.remove('bob');
    btn.classList.add('dragging');
    document.body.classList.add('dragging');
    arm(i);
    /* lift it the instant it is touched, so the pickup reads before any
       movement — with no feedback the player cannot tell it worked */
    btn.style.transform = tf({ x: 0, y: -u(18), s: 1.06 });
    kickIdleTimer();

    /* Bound to WINDOW, not to the button. Bound to the button they only
     * arrive while the pointer is still over a 112px-wide stamp, so the drag
     * died the moment the finger left it unless pointer capture happened to
     * work. On window they arrive wherever the pointer goes. */
    window.addEventListener('pointermove', onStampMove, { passive: false });
    window.addEventListener('pointerup', onStampUp);
    window.addEventListener('pointercancel', onStampUp);
    e.preventDefault();
  }

  function onStampMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.cancelable) e.preventDefault();     /* stop touch scroll stealing it */
    const dx = (e.clientX - drag.x0) / U, dy = (e.clientY - drag.y0) / U;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragMoved = true;

    /* the pad's live position, in design px */
    const padX = drag.slot.box.x + drag.slot.art.cx * drag.slot.art.scale + dx;
    const padY = L.padBaseline + dy;

    /* magnetic snap to the nearest unsolved target */
    let best = null, bestD = Infinity;
    Object.keys(hits).forEach((k) => {
      const h = hits[k];
      const d = Math.hypot(h.cx - padX, h.cy - padY);
      if (d < bestD) { bestD = d; best = h; }
    });
    const snapped = best && bestD < L.snapRadius ? best : null;
    drag.nearest = best;
    if (snapped !== drag.snap) {
      if (drag.snap) drag.snap.el.classList.remove('snap');
      if (snapped) snapped.el.classList.add('snap');
      drag.snap = snapped;
    }

    if (snapped) {
      const hp = hoverPose(drag.slot, snapped);
      drag.btn.style.transform = tf(hp);
    } else {
      drag.btn.style.transform = tf({ x: u(dx), y: u(dy), s: 0.9 });
    }
  }

  function onStampUp(e) {
    if (!drag) return;
    if (e && e.pointerId != null && e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    window.removeEventListener('pointermove', onStampMove);
    window.removeEventListener('pointerup', onStampUp);
    window.removeEventListener('pointercancel', onStampUp);
    try { d.btn.releasePointerCapture(d.id); } catch (err) {}
    d.btn.classList.remove('dragging');
    document.body.classList.remove('dragging');
    if (d.snap) d.snap.el.classList.remove('snap');

    if (d.snap) { submit(d.slot.id, d.snap.target, 'drag'); return; }
    /* A deliberate off-target drop is an incorrect location. Associate it
       with the nearest unresolved target so that target owns the escalating
       error count, but never allow the right stamp to solve from the wrong
       place. Pointer cancellation is not a learner mistake. */
    if (dragMoved && (!e || e.type !== 'pointercancel') && d.nearest) {
      submit(d.slot.id, d.nearest.target, 'drag', false);
      return;
    }
    /* A tap, or a browser-cancelled drag, simply returns to the tray. */
    d.btn.style.transform = '';
    if (!dragMoved) {
      /* a tap: leave it armed and waiting for a target, unless this was a
         second tap on an already-armed stamp, which puts it back down */
      if (d.wasArmed) disarm();
      refreshStampState();
      return;
    }
    disarm();
    refreshStampState();
  }

  /* --- 9-second inactivity nudge -------------------------------------- */
  function startIdleTimer() {
    stopIdleTimer();
    idleTimer = setTimeout(onIdle, 9000);
  }
  function kickIdleTimer() { if (S.name === 'await-input') { idleTicks = 0; startIdleTimer(); } }
  function stopIdleTimer() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

  function onIdle() {
    if (S.name !== 'await-input') return;
    const t = unsolved()[0];
    /* first stall: the hint written for this letter. Any stall after that:
       a random general tip, so the panel never repeats itself. */
    coach(idleTicks++ === 0 ? S.letter.say.idle : pickTip(), 'neutral');
    emit('nudge:idle', { letter: S.letter.id });
    /* pulse the unresolved sentence, and bounce the tray — but never reveal
       which stamp is correct (the sheet is explicit about this) */
    pulseSentence(t ? t.sentence : 0);
    stampEls.forEach((b) => bounce(b));
    if (level().tutorial && t) glow(t, 'strong');
    startIdleTimer();
  }

  function pulseSentence(idx) {
    const ws = sentenceEl.querySelectorAll(`.wordwrap[data-sentence="${idx}"]`);
    const list = ws.length ? ws : sentenceEl.querySelectorAll('.wordwrap');
    list.forEach((w) => {
      w.classList.remove('pulse');
      void w.offsetWidth;
      w.classList.add('pulse');
    });
  }

  function bounce(el) {
    if (reduced()) return;
    anim(el, [{ transform: 'translate3d(0,0,0)' },
              { transform: `translate3d(0,${-u(10)}px,0)`, offset: 0.45 },
              { transform: 'translate3d(0,0,0)' }], D(340), 'ease-out');
  }

  /* target feedback tiers */
  function glow(t, strength) {
    const h = hits[t.id];
    if (!h) return;
    h.el.classList.add(strength === 'strong' ? 'glow-strong' : 'glow');
  }
  function showGhost(t) {
    const h = hits[t.id];
    if (!h) return;
    h.el.classList.add('has-ghost');
  }
  function clearGhosts() {
    Object.keys(hits).forEach((k) => hits[k].el.classList.remove('has-ghost'));
  }

  /* the tutorial is practice: it fills no mark and posts no envelope */
  const isTutorial = () => !!level().tutorial;

  /* =================================================================== */
  /* 6. stamp — apply, or reject with an escalating nudge                */
  /* =================================================================== */
  async function stStamp() {
    const T = TIMING.stamp;
    const { stampId, target } = S.pick;
    const i = stampSlots.findIndex((s) => s.id === stampId);
    const slot = stampSlots[i], btn = stampEls[i];
    const ok = S.pick.validLocation !== false && stampSatisfies(stampId, target);
    const h = hits[target.id];
    if (!h) return 'await-input';

    clearGhosts();
    btn.classList.remove('bob');
    btn.style.zIndex = '9';

    const hover = hoverPose(slot, h);
    const travelScale = HOVER_S;
    const toX = hover.x;
    const hoverY = hover.y;
    const pressY = u(h.cy + 8 - L.padBaseline);
    /* the arc apexes above the sentence but still on the card, so the stamp
       travels over blank paper — the sentence is never covered in transit */
    const arcLift = -u(420);

    if (!reduced()) {
      /* A DRAGGED stamp is already hovering over its target — the player put
       * it there. Flying it home and arcing it back was a second, unasked-for
       * journey that made the mark look like it appeared on its own. It now
       * presses from where it stands; only a TAPPED stamp travels. */
      if (S.pick.via !== 'drag') {
        await anim(btn, [{ transform: tf({ x: 0, y: 0, s: 1 }) },
                         { transform: tf({ x: 0, y: -u(26), s: 1.04 }) }],
                   D(T.riseMs), TIMING.ease.standard);
        await anim(btn, arcFrames({ x: 0, y: -u(26), s: 1.04 },
                                  { x: toX, y: hoverY, s: travelScale },
                                  arcLift, bezier(0.3, 0.85, 0.2, 1), 18), D(T.travelMs), 'linear');
      } else {
        btn.style.transform = tf(hover);      /* seamless hand-off from the drag */
        await wait(90);                       /* a beat, so the press reads */
      }
      await anim(btn, [
        { transform: tf({ x: toX, y: hoverY, s: travelScale }) },
        { transform: tf({ x: toX, y: pressY, s: travelScale * T.pressScale[1] }), offset: 0.6 },
        { transform: tf({ x: toX, y: pressY, s: travelScale * T.pressScale[2] }) }
      ], D(T.pressMs), TIMING.ease.thump);
      await wait(120);                        /* hold the impression */
    }

    if (ok) {
      emit('stamp:press', { stamp: stampId, target: target.id });
      deskShift();
      applyTarget(target);
    } else {
      emit('stamp:reject', { stamp: stampId, target: target.id });
      await reject(btn, toX, pressY, travelScale, target);
    }

    if (!reduced()) {
      await anim(btn, arcFrames({ x: toX, y: pressY, s: travelScale }, { x: 0, y: 0, s: 1 },
                                arcLift * 0.8, bezier(0.22, 0.9, 0.24, 1), 16),
                 D(T.returnMs), 'linear');
    }
    btn.style.transform = '';
    btn.style.zIndex = '';
    buildHits();

    if (!ok) return 'await-input';                 /* never advance on a miss */
    if (unsolved().length) return 'await-input';
    return 'seal';
  }

  function applyTarget(t) {
    t.done = true;
    S.repairsSolved = S.letter.targets.filter((target) => target.done).length;
    document.body.dataset.repairsSolved = String(S.repairsSolved);
    document.body.dataset.repairsTotal = String(S.repairsTotal);
    emit('repair:progress', {
      letter: S.letter.id,
      solved: S.repairsSolved,
      total: S.repairsTotal,
      target: t.id
    });
    const el = marks[t.id];
    if (el) {
      /* the element that actually carries the ink: the glyph for a
         punctuation slot, the letter itself for a capital */
      let glyph = el;
      if (t.kind === 'capitalise') {
        el.textContent = S.letter.text[t.at].toUpperCase();
        el.classList.remove('pending');
      } else {
        el.classList.remove('pending');
        el.classList.add('done');
        glyph = el.querySelector('.mark');
        glyph.style.opacity = '1';
      }
      /* A stamped correction is BLUE, heavier and a touch larger than the
       * printed text, and never perfectly square to the line — so the learner
       * can see at a glance exactly what they added. It stays that way for
       * the rest of the letter rather than fading into the sentence. */
      glyph.classList.add('inked');
      glyph.style.setProperty('--tilt', tiltFor(t.id) + 'deg');
      pressIn(glyph);
      impression(glyph);
    }
    const name = t.kind === 'capitalise'
      ? 'Capital ' + S.letter.text[t.at].toUpperCase()
      : STAMPS[t.stamp].say;
    if (sayEl) sayEl.textContent = name + ' added';
    if (unsolved().length) coach(null, 'pleased');
  }

  /* a small, stable tilt per target: a real stamp never lands square, but it
     must not jump around if the zones are rebuilt */
  function tiltFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((Math.abs(h) % 9) - 4) * 0.7;      /* about -2.8deg .. +2.8deg */
  }

  /* the glyph taking the hit: squashed by the pad, then springing to size */
  function pressIn(el) {
    if (reduced()) { el.style.opacity = '1'; return; }
    const t = 'rotate(var(--tilt, 0deg))';
    anim(el, [
      { opacity: 0, transform: `scale(1.55) ${t}`, filter: 'blur(2px)' },
      { opacity: 1, transform: `scale(.88) ${t}`, filter: 'blur(0px)', offset: 0.45 },
      { opacity: 1, transform: `scale(1.06) ${t}`, offset: 0.72 },
      { opacity: 1, transform: `scale(1) ${t}` }
    ], D(320), TIMING.ease.thump);
  }

  /* the ink itself hitting the paper: a pressure ring pushing outward and a
     blot soaking in underneath the glyph */
  function impression(el) {
    if (reduced()) return;
    const r = rectOf(el);
    const at = (n) => {
      const d = document.createElement('div');
      d.className = n;
      d.style.left = (r.cx / DESIGN.w * 100) + '%';
      d.style.top = (r.cy / DESIGN.h * 100) + '%';
      targetsEl.appendChild(d);
      return d;
    };
    const blot = at('ink-blot'), ring = at('ink-ring');
    anim(blot, [
      { opacity: 0.55, transform: 'translate(-50%,-50%) scale(1.5)' },
      { opacity: 0.28, transform: 'translate(-50%,-50%) scale(1.0)', offset: 0.45 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.85)' }
    ], D(420), 'ease-out').then(() => blot.remove());
    anim(ring, [
      { opacity: 0.75, transform: 'translate(-50%,-50%) scale(.3)' },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.45)' }
    ], D(460), 'cubic-bezier(.2,.7,.3,1)').then(() => ring.remove());
  }

  function bloom(el) {
    const T = TIMING.stamp;
    if (reduced()) { el.style.opacity = '1'; return; }
    anim(el, [{ opacity: 0, transform: `scale(${T.inkBloomScale})` },
              { opacity: 1, transform: 'scale(1)' }], D(T.inkBloomMs), TIMING.ease.out);
  }

  /* tiny sparkle at the fresh impression */
  function sparkle(el) {
    if (reduced()) return;
    const r = rectOf(el);
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.left = (r.cx / DESIGN.w * 100) + '%';
    s.style.top = (r.cy / DESIGN.h * 100) + '%';
    targetsEl.appendChild(s);
    anim(s, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)' },
             { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(40deg)', offset: 0.4 },
             { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5) rotate(90deg)' }],
         D(520), 'ease-out').then(() => s.remove());
  }

  function deskShift() {
    if (reduced()) return;
    anim(world, [{ transform: 'translate3d(0,0,0)' },
                 { transform: `translate3d(0, ${u(TIMING.stamp.deskShift)}px, 0)`, offset: 0.4 },
                 { transform: 'translate3d(0,0,0)' }], D(70), 'ease-out');
  }

  /* Three-tier escalation, counted PER TARGET (the sheet's Error 1/2/3). */
  async function reject(btn, x, y, s, target) {
    const T = TIMING.reject;
    target.errors++;
    const h = hits[target.id];
    if (h) {
      h.el.classList.add('wrong');
      setTimeout(() => h.el.classList.remove('wrong'), 420);
    }

    const say = S.letter.say;
    if (target.errors === 1) {
      coach(say.e1, 'puzzled');
    } else if (target.errors === 2) {
      coach(say.e2, 'puzzled');
      pulseSentence(target.sentence);
      glow(target);
    } else {
      coach(say.e3 || say.e2, 'puzzled');
      pulseSentence(target.sentence);
      glow(target, 'strong');
      showGhost(target);                 /* faint impression of the right mark */
      const right = stampEls[stampSlots.findIndex((z) => z.id === target.stamp)];
      if (right && right !== btn) bounce(right);
    }
    emit('nudge:error', { tier: Math.min(target.errors, 3), target: target.id });

    if (reduced()) return;
    /* A miss leaves no mark, so the stamp itself has to carry the whole
     * answer: it wobbles where it was put, glows red once, and then travels
     * home to its tray slot (the arc back is in stStamp). Rocking it about
     * its own centre reads as "this did not take" far more clearly than the
     * flat sideways shake it used to do. */
    btn.classList.remove('rejecting');
    void btn.offsetWidth;                    /* restart the glow keyframes */
    btn.classList.add('rejecting');
    const w = T.shake, k = T.tilt;
    await anim(btn, [
      { transform: tf({ x, y, s, rot: 0 }) },
      { transform: tf({ x: x - u(w), y: y - u(3), s: s * 1.03, rot: -k }), offset: 0.20 },
      { transform: tf({ x: x + u(w), y, s: s * 1.02, rot: k * 0.85 }),     offset: 0.44 },
      { transform: tf({ x: x - u(w * 0.55), y, s, rot: -k * 0.45 }),       offset: 0.66 },
      { transform: tf({ x: x + u(w * 0.25), y, s, rot: k * 0.2 }),         offset: 0.85 },
      { transform: tf({ x, y, s, rot: 0 }) }], D(T.total), 'ease-out');
    btn.classList.remove('rejecting');
  }

  /* =================================================================== */
  /* 7. seal — letter away, or the level's READY TO POST ceremony        */
  /* =================================================================== */
  const levelComplete = () => S.solved + 1 >= level().letters.length;
  /* the ceremony belongs to a real level's last letter — never the tutorial,
     which the sheet says must not touch progress at all */
  const runCeremony = () => levelComplete() && !isTutorial();

  async function stSeal() {
    const T = TIMING.seal;
    emit('letter:seal', { id: S.letter.id });
    targetsEl.innerHTML = '';

    coachRead(S.letter);
    if (level().tutorial && S.letter.praise) coach(S.letter.praise, 'pleased');
    if (S.letter.confetti) confetti();
    await wait(T.holdMs * 2);

    /* The tutorial and intermediate letters advance without entering the
       postal ceremony. The levelling sheet reserves folding, enveloping and
       posting for the last letter in each real level. */
    if (!runCeremony()) {
      if (reduced()) sentenceEl.style.opacity = '0';
      else await anim(sentenceEl, [{ opacity: 1 }, { opacity: 0 }], D(160), 'ease-in');
      sentenceEl.style.opacity = '0';
      return 'post';
    }

    /* eb is only the box the wax seal is centred on; envelope.png itself is
       no longer used for the letter in play, only for the piles. */
    const card = L.card;
    const eb = envBox(card.x + card.w / 2, card.y + card.h / 2, card.w * ENVV.visW);

    const g = envGeom();
    if (reduced()) {
      sentenceEl.style.opacity = '0';
      resetCard();
      placeEnvelope(g);
      setFlap(0);
      setEnvOpen(false);
      envUnder.style.opacity = '1';
      envOver.style.opacity = '1';
      if (runCeremony()) await slamSeal(eb);
      return 'post';
    }

    useBands();
    await anim(sentenceEl, [{ opacity: 1 }, { opacity: 0 }], D(160), 'ease-in');
    sentenceEl.style.opacity = '0';
    /* a real letter fold: bottom third up over the middle, then the top
       third down over that */
    /* The card lifts off the desk while it is being worked, so its shadow
       tightens; it settles again once the stack is made. */
    cardLayer.classList.add('lift');
    /* Real folds do not land perfectly flat and they do not land level with
       each other: the bottom third stops a couple of degrees shy of closed,
       the top third comes over a touch further and sits proud of it. */
    await foldBand(fbBot, -171.5, 4, T.foldBottomMs, $('.cast-from-bot'));
    await foldBand(fbTop, 176.5, 11, T.foldTopMs, $('.cast-from-top'));
    cardLayer.classList.remove('lift');
    cardLayer.classList.add('land');
    await settleThump();
    await wait(90);

    /* The envelope opens up underneath the folded letter. It used to be a
     * 160ms crossfade from a 1153-wide strip to a 484-wide picture of an
     * envelope — a dissolve doing the work the animation should do. Now the
     * letter is actually put into a pocket. */
    placeEnvelope(g);
    setFlap(FLAP_OPEN);
    /* The envelope opens up WHILE the letter is coming down to it. Fading it
       in first left a full-width 1153px strip lying across a 484px envelope
       for a fifth of a second, which read as a plank on a postcard. */
    await Promise.all([
      Promise.all([envUnder, envOver].map((e) =>
        anim(e, [{ opacity: 0, transform: 'scale(.92) translateY(4%)' },
                 { opacity: 1, transform: 'scale(1) translateY(0%)' }],
             D(T.envInMs), TIMING.ease.out))),
      /* down to the mouth. The front panel is painted after #card-layer,
         so from here on it is the front that hides the letter. */
      anim(cardLayer, [
        { transform: tf({ s: 1 }) },
        { transform: stripPose(g, g.yAbove) }
      ], D(T.insertMs * 0.58), TIMING.ease.standard)
    ]);
    await anim(cardLayer, [
      { transform: stripPose(g, g.yAbove) },
      { transform: stripPose(g, g.yInside) }
    ], D(T.insertMs * 0.42), 'cubic-bezier(.4,0,.25,1)');
    resetCard();

    /* and the flap comes over */
    await Promise.all([
      anim(envFlap, [
        { transform: `rotateX(${FLAP_OPEN}deg)` },
        { transform: 'rotateX(-26deg)', offset: 0.72 },
        { transform: 'rotateX(6deg)', offset: 0.9 },
        { transform: 'rotateX(0deg)' }
      ], D(T.flapMs), 'cubic-bezier(.36,.04,.28,1)'),
      anim(flapShade, [{ opacity: 0 }, { opacity: 0.55, offset: 0.7 }, { opacity: 0 }],
           D(T.flapMs), 'ease-out'),
      /* a shut envelope has no pocket to look into, and no lit cut edge
         across its middle: both fade back to the plain cream behind them */
      Promise.all(envOpenBits.map((e) =>
        anim(e, [{ opacity: 1 }, { opacity: 0 }], D(T.flapMs * 0.8), 'ease-in')))
    ]);
    deskShift();
    if (runCeremony()) await slamSeal(eb);
    return 'post';
  }

  async function slamSeal(eb) {
    const T = TIMING.seal;
    const size = eb.w * 0.36;
    place(sealEl, { x: eb.x + eb.w / 2 - size / 2, y: eb.y + eb.h / 2 - size / 2, w: size });
    sealEl.style.height = 'auto';
    sealEl.style.opacity = '0';
    coach('Ready to post!', 'delighted');
    emit('letter:seal:stamp', { level: level().id });
    if (reduced()) { sealEl.style.opacity = '1'; return; }
    const s = anim(sealEl,
      [{ opacity: 0, transform: `scale(${T.slamFromScale}) rotate(${-T.slamRot * 2}deg)` },
       { opacity: 1, transform: `scale(1) rotate(${-T.slamRot}deg)` }], D(T.slamMs), TIMING.ease.out);
    const f = wait(T.slamMs * 0.55).then(() =>
      anim(flashEl, [{ opacity: 0 }, { opacity: 0.5, offset: 0.2 }, { opacity: 0 }],
           D(T.flashMs), 'ease-out'));
    await Promise.all([s, f]);
    deskShift();
  }

  function confetti() {
    if (reduced()) return;
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (30 + Math.random() * 40) + '%';
      c.style.top = '38%';
      c.style.background = ['#E7902F', '#FB9B96', '#9DBBD5', '#6FBF4F'][i % 4];
      targetsEl.appendChild(c);
      anim(c, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0deg)' },
               { opacity: 0,
                 transform: `translate(${(Math.random() - 0.5) * 400}%, ${200 + Math.random() * 300}%) rotate(${Math.random() * 540}deg)` }],
           D(900), 'ease-out').then(() => c.remove());
    }
  }

  /* =================================================================== */
  /* 8. post — fill the mark; on a level's last letter, fly to the bag   */
  /* =================================================================== */
  async function stPost() {
    const T = TIMING.post;
    const wasLast = levelComplete();
    const shouldPost = wasLast && !isTutorial();

    if (shouldPost) {
      const eb = rectOf(envUnder);
      const v = L.outboxVis;
      const target = { x: v.cx - v.w / 2, y: v.cy - (v.w * ENVV.h / ENVV.w) / 2, w: v.w };
      const dx = u(target.x - eb.x), dy = u(target.y - eb.y);
      const sc = target.w / eb.w;
      const pair = [envUnder, envOver, sealEl];
      if (reduced()) {
        await Promise.all(pair.map((e) => anim(e, [{ opacity: 1 }, { opacity: 0 }], D(1), 'linear')));
      } else {
        await Promise.all(pair.map((e) => anim(e, arcFrames(
          { x: 0, y: 0, s: 1, rot: 0 }, { x: dx, y: dy, s: sc, rot: T.toRot },
          -u(150), bezier(0.22, 0.8, 0.28, 1), 18), D(T.total), 'linear')));
      }
      S.posted++;
      renderMailbag(S.posted);
      resetEnvelope();
      sealEl.style.opacity = '0';
      sealEl.style.transform = '';
      emit('letter:post', { level: level().id, posted: S.posted });
    }

    /* Letter progress advances after its completion transition. Only the
       level's last letter has an envelope landing in the mailbag. */
    if (!isTutorial()) {
      S.solved++;
      updateHud();
      const pip = hudPips.children[S.solved - 1];
      if (pip && !reduced()) {
        await anim(pip, [{ transform: 'scale(1)' },
                         { transform: 'scale(1.3)', offset: 0.45 },
                         { transform: 'scale(1)' }], D(T.pipPopMs), TIMING.ease.out);
      }
      if (sayEl) sayEl.textContent =
        `Letter complete, ${S.solved} of ${level().letters.length}`;
    }

    if (!wasLast) { S.letterIndex++; return 'idle'; }

    emit('set:complete', { level: level().id });
    if (S.levelIndex >= LEVELS.length - 1) return 'finale';
    S.levelIndex++;
    S.letterIndex = 0;
    S.solved = 0;
    return 'idle';
  }

  /* =================================================================== */
  /* 9. finale                                                           */
  /* =================================================================== */
  const finaleEl = $('#finale');

  async function stFinale() {
    const T = TIMING.finale;
    lockStamps(true);
    stopIdleTimer();
    coach('Every letter is ready to post. Wonderful work!', 'delighted');

    if (!reduced()) {
      await anim(world, [{ transform: 'scale(1)' }, { transform: `scale(${T.pullbackScale})` }],
                 D(T.pullbackMs), TIMING.ease.standard);
    }
    finaleEl.innerHTML = '';
    const from = L.outboxVis;

    await Promise.all(L.finaleVis.map((v, i) => {
      const box = envBox(v.cx, v.cy, v.w);
      const d = document.createElement('div');
      d.className = 'fin';
      place(d, box);
      d.style.height = 'auto';
      d.innerHTML = '<img src="assets/envelope.png" alt="Sealed letter, ready to post">' +
                    '<img class="fin-seal" src="assets/ready-to-post.png" alt="">';
      finaleEl.appendChild(d);

      const fb = envBox(from.cx, from.cy, from.w);
      const dx = u(fb.x - box.x), dy = u(fb.y - box.y), s0 = fb.w / box.w;
      if (reduced()) {
        d.style.opacity = '1';
        d.querySelector('.fin-seal').style.opacity = '0.95';
        return Promise.resolve();
      }
      return wait(i * T.stagger).then(() => {
        d.style.opacity = '1';
        return anim(d, arcFrames({ x: dx, y: dy, s: s0, rot: 8 }, { x: 0, y: 0, s: 1, rot: 0 },
                                 -u(120), bezier(0.22, 0.8, 0.28, 1), 18), D(T.flyMs), 'linear');
      }).then(() => anim(d, [{ transform: tf({ rot: 0 }) },
                             { transform: tf({ rot: -3 }), offset: 0.5 },
                             { transform: tf({ rot: 0 }) }], D(220), 'ease-out'))
        .then(() => {
          d.style.transform = '';
          const sl = d.querySelector('.fin-seal');
          return anim(sl, [{ opacity: 0, transform: 'scale(1.6) rotate(-14deg)' },
                           { opacity: 0.95, transform: 'scale(1) rotate(-8deg)' }],
                      D(240), TIMING.ease.out);
        });
    }));

    const btn = document.createElement('button');
    btn.id = 'finale-next';
    btn.type = 'button';
    btn.textContent = 'Play again';
    btn.addEventListener('click', restart);
    finaleEl.appendChild(btn);
    await anim(btn, [{ opacity: 0 }, { opacity: 1 }], D(280), 'ease-out');
    btn.focus();
    return null;
  }

  /* =================================================================== */
  /* THE STATE TABLE                                                     */
  /* =================================================================== */
  const STATES = {
    'idle':        stIdle,     /* 1  empty desk, tray, HUD, inbox            */
    'deal':        stDeal,     /* 2  a letter arcs in                  700ms */
    'open':        stOpen,     /* 3  flap up, letter out, unfold      1380ms */
    'read':        stRead,     /* 4  text appears, uncorrected         350ms */
    'await-input': stAwait,    /* 5  drag or tap; any target, any order      */
    'stamp':       stStamp,    /* 6  press + ink, or reject + nudge    450ms */
    'seal':        stSeal,     /* 7  letter away, or READY TO POST     900ms */
    'post':        stPost,     /* 8  fill the mark; fly to the mailbag 600ms */
    'finale':      stFinale    /* 9  after the final letter           1200ms */
  };

  let generation = 0, driving = false;

  function go(name) {
    S.name = name;
    generation++;
    cancelPick();
    stopIdleTimer();
    finishAll();
    if (!driving) drive();
  }

  async function drive() {
    if (driving) return;
    driving = true;
    try {
      for (;;) {
        const g = generation;
        const fn = STATES[S.name];
        if (!fn) { console.warn('[state] unknown', S.name); break; }
        document.body.dataset.state = S.name;
        refreshStampState();
        let next = null;
        try { next = await fn(); }
        catch (err) { console.error('[state] ' + S.name + ' threw:', err); break; }
        if (generation !== g) continue;
        if (!next) break;
        S.name = next;
      }
    } finally { driving = false; }
  }

  /* =================================================================== */
  /* keyboard                                                            */
  /* =================================================================== */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('#temp-level-nav')) return;
    if (S.name !== 'await-input' || !stampEls.length) return;
    kickIdleTimer();
    const targets = unsolved();

    if (e.key === 'Escape') { disarm(); return; }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      if (!armed) {
        S.selected = (S.selected + d + stampEls.length) % stampEls.length;
        refreshStampState();
        stampEls[S.selected].focus();
      } else {
        S.targetIdx = ((S.targetIdx || 0) + d + targets.length) % targets.length;
        const h = hits[targets[S.targetIdx].id];
        if (h) h.el.focus();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!armed) {
        arm(S.selected);
        S.targetIdx = 0;
        const h = hits[targets[0].id];
        if (h) h.el.focus();
      } else {
        const t = targets[S.targetIdx || 0];
        if (t) submit(stampSlots[armedStamp].id, t);
      }
    }
  });

  /* =================================================================== */
  /* boot                                                                */
  /* =================================================================== */
  /* Preload with a HARD CAP on every request.
   *
   * This used to be a bare Promise.all over img.onload/onerror. An image that
   * neither loads nor errors — a stalled request on one of the multi-megabyte
   * files, which is easy to hit when ~19 assets contend for the browser's six
   * HTTP/1.1 connections — left that promise unsettled forever, so boot never
   * reached go('idle'). The result was an empty desk with no stamps and
   * nothing to drag: the game looked frozen with no error anywhere.
   *
   * Now each request self-resolves after `capMs`, and boot never waits on the
   * batch for longer than its own budget (see boot()).
   */
  function preload(capMs) {
    const srcs = ['assets/desk-wood.jpg', 'assets/stamp-tray.png', 'assets/envelope.png',
                  'assets/envelope-icon.png', 'assets/ready-to-post.png'];
    Object.keys(STAMPS).forEach((k) => srcs.push(STAMPS[k].art));
    return Promise.all(srcs.map((src) => new Promise((res) => {
      const i = new Image();
      let done = false;
      const finish = (bad) => { if (done) return; done = true; res(bad); };
      i.onload = () => finish(null);
      i.onerror = () => finish(src);
      setTimeout(() => finish(src), capMs);
      i.src = src;
    }))).then((r) => r.filter(Boolean));
  }

  function bootError(missing) {
    console.error('[Letters] these files did not load:', missing);
    const d = document.createElement('div');
    d.id = 'boot-error';
    d.innerHTML =
      '<b>Some game files did not load.</b>' +
      '<p>Open <code>index.html</code> from the folder root — if you are using ' +
      'VS Code Live Server, stop it and hit <b>Go Live</b> again so it serves this ' +
      'folder, then hard-refresh (<b>Ctrl</b>+<b>Shift</b>+<b>R</b>).</p>' +
      '<ul>' + missing.map((m) => '<li>' + m + '</li>').join('') + '</ul>';
    document.body.appendChild(d);
  }

  /* Never let a webfont stall the game. document.fonts.ready waits on Google
   * Fonts, so offline or a slow network would otherwise hold up boot; the
   * CSS stack falls back on its own. */
  function fontsReady(ms) {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([
      document.fonts.ready.catch(() => {}),
      new Promise((res) => setTimeout(res, ms))
    ]);
  }

  function relayout() {
    fit();
    layoutTray();
    stampEls.forEach((b, i) => place(b, stampSlots[i].box));
    renderMailbag(S.posted);
    if (S.letter && S.name === 'await-input') buildHits();
  }

  function restart() {
    finaleEl.innerHTML = '';
    world.style.transform = '';
    S.levelIndex = 0; S.letterIndex = 0; S.solved = 0; S.posted = 0;
    S.repairsSolved = 0; S.repairsTotal = 0;
    go('idle');
  }

  function buildTemporaryLevelNav() {
    levelJumpButtons.innerHTML = '';
    LEVELS.forEach((lv, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.level = lv.id;
      btn.textContent = lv.tutorial ? 'Tutorial' : (lv.final ? 'Final' : String(lv.numeral));
      btn.setAttribute('aria-label', `Jump to ${lv.label}`);
      btn.addEventListener('click', () => jumpToLevel(index));
      levelJumpButtons.appendChild(btn);
    });
    updateTemporaryLevelNav();
  }

  function updateTemporaryLevelNav() {
    if (!levelJumpNav) return;
    Array.from(levelJumpButtons.children).forEach((btn, index) => {
      if (index === S.levelIndex) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function jumpToLevel(index) {
    if (index < 0 || index >= LEVELS.length) return false;
    finaleEl.innerHTML = '';
    world.style.transform = '';
    S.levelIndex = index;
    S.letterIndex = 0;
    S.solved = 0;
    /* Entering a level in review mode represents the preceding real levels
       as complete, while the tutorial contributes nothing. */
    S.posted = Math.max(0, index - 1);
    S.repairsSolved = 0;
    S.repairsTotal = 0;
    updateTemporaryLevelNav();
    go('idle');
    return true;
  }

  async function boot() {
    fit();
    layoutTray();
    window.addEventListener('resize', relayout);
    [stage, $('#viewport')].forEach((el) => el.addEventListener('scroll', () => {
      if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; }
    }, { passive: true }));
    ['pointerdown', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, kickIdleTimer, { passive: true }));
    buildTemporaryLevelNav();

    wireAudio();
    /* Give the art a short head start so the opening frame is not bare, but
       start the game regardless — a slow or stalled asset must never be able
       to stop the player from playing. */
    const job = preload(9000);
    await Promise.race([job, new Promise((r) => setTimeout(r, 2500))]);
    await fontsReady(2000);
    relayout();
    job.then((missing) => { if (missing && missing.length) bootError(missing); });

    window.LettersGame = {
      go, state: S, states: Object.keys(STATES),
      readout, restart,
      speed: (v) => { TIMING.SPEED = v; },
      mute: (v) => Audio_.mute(v !== false),
      audio: Audio_,
      levels: LEVELS, layout: L, timing: TIMING,
      /* test hook: anim()'s easing guard is the only thing standing between a
         mistyped easing and a whole beat of a sequence silently vanishing,
         so the suite has to be able to poke it directly */
      animProbe: (el, frames, ms, easing) => anim(el, frames, ms, easing),
      /* test/debug: play a specific level, and place a stamp directly */
      goToLevel: (id) => {
        const i = LEVELS.findIndex((l) => l.id === id);
        return jumpToLevel(i);
      },
      nextLevel: () => jumpToLevel((S.levelIndex + 1) % LEVELS.length),
      place: (stampId, targetId, validLocation) => {
        const t = S.letter && S.letter.targets.find((x) => x.id === targetId);
        if (!t || S.name !== 'await-input') return false;
        submit(stampId, t, 'tap', validLocation !== false);
        return true;
      },
      targets: () => (S.letter ? S.letter.targets.map((t) =>
        ({ id: t.id, kind: t.kind, char: t.char, stamp: t.stamp, done: t.done, errors: t.errors })) : [])
    };

    go('idle');
    setTimeout(() => Audio_.warm(), 400);   /* after the scene is up */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
