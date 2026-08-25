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

  /* --- 3. read — text appears ---------------------------------------- */
  read: {
    total: 350,
    rise: 8,                  /* px */
    wordStagger: 25
  },

  /* --- 4. await-input ------------------------------------------------- */
  idleBob: { amplitude: 3, period: 2400, phaseOffset: 600 },
  hover:   { lift: 10, scale: 1.04, ms: 160 },

  /* --- 5. stamp — a correction is applied ----------------------------- */
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
  /* a quick refusal — it happens where the stamp is held, without a press,
     so it no longer has a stamping to be slower than */
  reject: { total: 300, shake: 7, tilt: 6 },

  /* the third-miss hand: pick the stamp up, carry it, drop it */
  hand: { inMs: 260, pressMs: 200, travelMs: 620, dropMs: 380, outMs: 240 },

  /* --- 6. seal — praise, read-back, and the level's READY TO POST ----- */
  seal: {
    total: 900,
    holdMs: 250,              /* a beat once the read-back has been said */
    comicMs: 700,             /* 6A's comic pause, before the punchline   */
    glowMs: 900,              /* 4D / 24: "letter glows"                  */
    settleMs: 520,            /* 5A: the list settles apart               */
    slamMs: 240, slamFromScale: 1.4, slamRot: 8,
    flashMs: 90
  },

  /* --- 7. post — the sheet arcs away to the pile ---------------------- */
  post: {
    total: 600,
    toScale: 0.35, toRot: 8, toOpacity: 0.9,
    pipPopMs: 260
  },

  /* --- 8. levelup — the level's letters line up and are sealed -------- */
  levelup: {
    flyMs: 520,               /* each letter down out of its HUD mark */
    stagger: 150,
    settleMs: 300,            /* a beat with the row complete         */
    sealStagger: 200,         /* then each takes its READY TO POST    */
    sealMs: 260,
    holdMs: 900,              /* the row is read before it goes       */
    outMs: 420,               /* and lands on the outgoing pile       */
    outStagger: 110,
    landMs: 160,
    bagHoldMs: 750            /* the stack is read before it clears   */
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

/* The coach's lines, one key per Incorrect-feedback column on the sheet.
 * Tier 1 fires on the first miss at a target, tier 2 on the second, tier 3 on
 * the third.
 *
 * WRONG 1 IS USUALLY SILENT. The sheet gives it a line on exactly three of the
 * twenty-four screens — the tutorial, 1A and the Final Letter. Everywhere else
 * Wrong 1 is mechanical only: the stamp returns, a soft boop, and a change of
 * expression. "Oops! Try again!" used to be the DEFAULT here, which put it on
 * twenty screens the sheet deliberately leaves quiet — 1C's cell even says
 * "No dialogue" in as many words. So `e1` defaults to null and is stated only
 * where the sheet states it.
 *
 * WRONG 3 IS SILENT ON EVERY SCREEN. All twenty-four describe it as a glow, a
 * pulse or a ghost impression and none of them give it words. `e3` is null
 * throughout, and reject() no longer falls back to the Wrong 2 line.
 *
 * `e2` defaults to the sheet's own 1C and 7A wording, the only two screens
 * that use it; every other screen states its own.
 *
 * `idle` IS AUTHORED BUT NOT SPOKEN — a stall says nothing, see onIdle() and
 * the README. It has no default either, so 1A — the one screen whose stall the
 * sheet leaves wordless — has none, rather than silently inheriting another
 * screen's line. */
function lines(o) {
  return Object.assign({ e1: null, e2: 'Something still needs fixing.',
                         e3: null, idle: null }, o);
}

/* THERE IS NO BAG OF GENERAL TIPS ANY MORE. A rotating set of eight ("A comma
 * is a short pause inside a sentence", and so on) used to be dealt out one per
 * nine-second stall, drawn from a shuffled bag so that none repeated back to
 * back. It made a motionless screen read as though something were happening:
 * the panel kept changing while the game sat exactly where the player had left
 * it. A stall now says nothing at all — see onIdle(). None of them were
 * recorded, so no voice-over goes unused. */

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
        /* Two beats, as the sheet writes them: what is wrong, and then what to
           do about it. They were briefly merged into one line because the
           second used to replace the first after 1.9s, cutting its voice off
           mid-word. The voice gate fixes that properly — `read` now waits for
           the first line to finish before giving the second. */
        intro: 'This sentence needs a full stop.',
        intro2: 'Pick the full-stop stamp and place it at the end.',
        /* ONE RESPONSE TO A MISS, AND NO ESCALATION. The tutorial's Wrong 2 and
           Wrong 3 cells are both empty and its developer notes say there is no
           failure state, so this line answers every miss however often it
           happens — see reject(). It used to escalate like a real level, which
           meant inventing a Wrong 2 (a repeat of this line) and a Wrong 3
           ("Here is where it goes.") that the sheet does not have. */
        stall: { stamps: 'one', text: 'word' },
        say: lines({
          e1: 'Try placing it at the end of the sentence.',
          e2: null,                     /* both cells are "—" on the sheet, and */
          e3: null,                     /* reject() cannot reach them here anyway */
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
        /* the one screen the sheet gives a Wrong 1 line other than the tutorial
           and the Final Letter — and the one whose stall it leaves wordless
           ("Stamp tray + beginning/end subtly pulse once") */
        w2: 'ends',         /* Wrong 2, per the sheet */
        ghost: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: 'ends' },
        praise: 'Great! A sentence begins with a capital letter.',
        say: lines({ e1: 'Oops! Try again!',
                     e2: 'Look closely. Where does the sentence begin or end?' })
      }),
      letter('1B', '^we made hot samosas [.]', ['caps', 'period'], {
        read: 'We made hot samosas.', prosody: 'statement',
        w2: 'ends',         /* Wrong 2, per the sheet */
        ghost: true,   /* Wrong 3, per the sheet */
        stall: { text: 'ends' },
        praise: "That's right! The sentence now begins and ends correctly.",
        say: lines({ e2: 'Where does this sentence begin or end?',
                     idle: 'Look at the beginning and end of the sentence.' })
      }),
      letter('1C', '^the fair was very busy [.]', ['caps', 'period'], {
        read: 'The fair was very busy.', prosody: 'statement',
        w2: 'area',         /* Wrong 2, per the sheet */
        stall: { text: 'ends' },
        praise: 'Well done! You fixed the beginning and end of the sentence.',
        say: lines({ idle: 'Look at the beginning and end of the sentence.' })
      })
    ]
  },

  {
    id: 'L2', label: 'Level 2', numeral: 2, focus: 'Statement vs question',
    letters: [
      /* opening capital pre-applied — no caps stamp in this tray (see note 1) */
      letter('2A', 'Are you excited [?]', ['period', 'question'], {
        read: 'Are you excited?', prosody: 'question',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: "That's right! We use a question mark at the end of a question.",
        say: lines({ e2: 'Is the writer telling us something or asking something?',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2B', 'I hope you are well [.]', ['period', 'question'], {
        read: 'I hope you are well.', prosody: 'statement',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence tells something, so it ends with a full stop.',
        say: lines({ e2: 'Is the writer telling us something or asking something?',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2C', 'Did you get my last letter [?]', ['period', 'question'], {
        read: 'Did you get my last letter?', prosody: 'question',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Great! This sentence asks a question, so it ends with a question mark.',
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
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: "That's it! An exclamation mark goes at the end to show a strong feeling.",
        say: lines({ e2: 'How does the writer feel?',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3B', 'I will come on Sunday [.]', ['period', 'exclamation'], {
        read: 'I will come on Sunday.', prosody: 'statement', calm: true,
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence tells something, so it ends with a full stop.',
        say: lines({ e2: 'Is this ordinary information or a strong feeling?',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3C', 'We won the match [!]', ['period', 'exclamation'], {
        read: 'We won the match!', prosody: 'exclamation', confetti: true, doodle: 'trophy',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Great! The exclamation mark shows the excitement of winning the match!',
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
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: "That's right! This sentence tells something, so a full stop fits at the end.",
        say: lines({ e2: 'Read it again. Is it telling, asking, or showing strong feeling?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      letter('4B', 'Can you come tomorrow [?]', ['period', 'question', 'exclamation'], {
        read: 'Can you come tomorrow?', prosody: 'question',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence asks a question, so a question mark fits at the end.',
        say: lines({ e2: 'Read it again. Is it telling, asking, or showing strong feeling?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      letter('4C', 'Look at that huge kite [!]', ['period', 'question', 'exclamation'], {
        read: 'Look at that huge kite!', prosody: 'exclamation', doodle: 'kite',
        markOnly: true,   /* Wrong 3, per the sheet */
        stall: { stamps: 'all', text: false },
        praise: 'Great! The exclamation mark shows the excitement about the huge kite!',
        say: lines({ e2: 'How should this message sound?',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      /* first multi-sentence letter — three independent targets, any order */
      letter('4D', 'I have a new puppy [.] // Do you want to meet him [?] // I am so excited [!]',
             ['period', 'question', 'exclamation'], {
        read: 'I have a new puppy. Do you want to meet him? I am so excited!',
        prosody: 'mixed',
        glowDone: true,   /* the sheet's completion beat */
        w2: 'sentence',         /* Wrong 2, per the sheet */
        praise: 'Excellent! You gave each sentence the ending that matches what it says.',
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
        settle: true,   /* the sheet's completion beat */
        praise: "That's it! A comma separates different items in a list.",
        say: lines({ e2: 'The writer is naming different things.',
                     idle: 'Which words are separate things in the list?' })
      }),
      /* 5A-5C all arrive WITH their full stop already in place: the sheet's
         shown text and expected answer differ only by the commas, so the
         period stamp sits in the tray with nothing to do — which is the sheet's
         own tray ("`,` `.`"), not an oversight here. */
      letter('5B', 'We saw monkeys [,] parrots and rabbits at the fair.', ['comma', 'period'], {
        read: 'We saw monkeys, parrots and rabbits at the fair.', prosody: 'list',
        doodle: 'list-animals',
        praise: 'Great! The comma separates the animals in the list.',
        say: lines({ e2: 'Which words name different things in the list?',
                     idle: 'Which words are separate things in the list?' })
      }),
      letter('5C', 'Please send crayons [,] storybooks [,] stickers and a ball.', ['comma', 'period'], {
        read: 'Please send crayons, storybooks, stickers and a ball.', prosody: 'list',
        doodle: 'list-four',
        praise: 'Well done! The commas separate the different things in the list.',
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
        praise: 'The comma shows that you are speaking to Dadi, not eating her!',
        say: lines({ e2: 'Oh dear! Are we eating Dadi… or talking to Dadi?',
                     idle: 'Does this sentence say what the writer means?' })
      }),
      letter('6B', 'I miss you [,] Nani!', ['comma', 'period'], {
        read: 'I miss you, Nani!', prosody: 'exclamation', doodle: 'nani',
        praise: 'The comma shows that you are telling Nani that you miss her.',
        say: lines({ e2: 'Who is the writer speaking to?',
                     idle: 'Who is the writer speaking to?' })
      }),
      letter('6C', '^see you soon [,] Raju!', ['caps', 'comma'], {
        read: 'See you soon, Raju!', prosody: 'exclamation', doodle: 'raju',
        praise: "The comma shows that you are telling Raju that you'll see him soon.",
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
        w2: 'area',         /* Wrong 2, per the sheet */
        praise: 'Great! The sentence begins with a capital letter and ends as a question.',
        say: lines({ idle: 'Can you spot what needs fixing?' })
      }),
      letter('7B', '^what a beautiful card [!]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'What a beautiful card!', prosody: 'exclamation', doodle: 'card',
        praise: "That's right! The sentence begins with a capital letter and ends with excitement.",
        say: lines({ e2: 'How should this sentence begin? How should it sound at the end?',
                     idle: 'Can you spot what needs fixing?' })
      }),
      letter('7C', '^i will write again soon [.]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'I will write again soon.', prosody: 'statement',
        praise: "That's right! The sentence begins with a capital letter and ends as a statement.",
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
        glowDone: true,   /* the sheet's completion beat */
        w2: 'sentence',         /* Wrong 2, per the sheet */
        ghost: true,   /* Wrong 3, per the sheet */
        stall: { text: 'letter' },
        praise: 'Excellent! Capital letters and punctuation make the whole letter clear and easy to read.',
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
 *   idle → deal → read → await-input → stamp ─┬→ await-input
 *                                              └→ seal → post ─┬→ idle
 *                                                              ├→ levelup → idle
 *                                                              └→ finale
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
    tray:     { x: 545.2, y: 835.85, w: 829.5, h: 276.5 },
    trayLipFrac: 458 / 724,
    stampInkW: 112,
    padBaseline: 1029.75,
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
    /* Drop zones and the magnetic pull are sized for a child's aim, not for
       the glyph: both are deliberately far larger than the mark they stand
       for, and the snap reaches well past the zone itself. */
    hit: { w: 120, h: 140 },
    snapRadius: 150
  };

  const ENV = { box: 1254, fx0: 144 / 1254, fy0: 260 / 1254, fw: 974 / 1254, fh: 720 / 1254 };

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
  /* ------------------------------------------------------------------ *
   * VOICE-OVER
   *
   * Recorded lines, keyed by the exact string the coach displays, so the
   * panel and the voice can never drift apart: change the text and the
   * lookup misses, which falls back to speech synthesis rather than saying
   * something the child cannot read. Six lines have no recording yet and
   * are on synthesis today; the tutorial's instruction is two clips played
   * in order, which is why a value may be an array.
   * ------------------------------------------------------------------ */
  const VO = {
    "Are you excited?": "are-you-excited",
    "Can you come tomorrow?": "can-you-come-tomorrow",
    "Can you spot what needs fixing?": "can-you-spot-what-needs-fixing",
    "Check the beginning and the end.": "check-the-beginning-and-the-end",
    "Check the letter carefully. What still needs fixing?": "check-the-letter-carefully-what-still-needs-fixing",
    "Correct! This sentence asks a question, so a question mark fits at the end.": "correct-this-sentence-asks-a-question-so-a-question-mark-fits-at-the-end",
    "Correct! This sentence tells something, so it ends with a full stop.": "correct-this-sentence-tells-something-so-it-ends-with-a-full-stop",
    "Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. Did you go too? It was amazing!": "dear-raju-i-went-to-the-fair-i-saw-monkeys-parrots-and-rabbits-did-you-go-too-it-was-amazing",
    "Did you get my last letter?": "did-you-get-my-last-letter",
    "Does this sentence say what the writer means?": "does-this-sentence-say-what-the-writer-means",
    "Excellent! Capital letters and punctuation make the whole letter clear and easy to read.": "excellent-capital-letters-and-punctuation-make-the-whole-letter-clear-and-easy-to-read",
    "Excellent! You gave each sentence the ending that matches what it says.": "excellent-you-gave-each-sentence-the-ending-that-matches-what-it-says",
    "Fix the sentence with the stamps.": "fix-the-sentence-with-the-stamps",
    "Great! A sentence begins with a capital letter.": "great-a-sentence-begins-with-a-capital-letter",
    "Great! The comma separates the animals in the list.": "great-the-comma-separates-the-animals-in-the-list",
    "Great! The exclamation mark shows the excitement about the huge kite!": "great-the-exclamation-mark-shows-the-excitement-about-the-huge-kite",
    "Great! The exclamation mark shows the excitement of winning the match!": "great-the-exclamation-mark-shows-the-excitement-of-winning-the-match",
    "Great! The sentence begins with a capital letter and ends as a question.": "great-the-sentence-begins-with-a-capital-letter-and-ends-as-a-question",
    "Great! This sentence asks a question, so it ends with a question mark.": "great-this-sentence-asks-a-question-so-it-ends-with-a-question-mark",
    "Hmm\u2026 try that again.": "hmm-try-that-again",
    "How does the writer feel?": "how-does-the-writer-feel",
    "How should this message sound?": "how-should-this-message-sound",
    "How should this sentence begin? How should it sound at the end?": "how-should-this-sentence-begin-how-should-it-sound-at-the-end",
    "I am coming to visit you.": "i-am-coming-to-visit-you",
    "I have a new puppy. Do you want to meet him? I am so excited!": "i-have-a-new-puppy-do-you-want-to-meet-him-i-am-so-excited",
    "I hope you are well.": "i-hope-you-are-well",
    "I miss you, Nani!": "i-miss-you-nani",
    "I reached home safely.": "i-reached-home-safely",
    "I will come on Sunday.": "i-will-come-on-sunday",
    "I will visit you soon.": "i-will-visit-you-soon",
    "I will write again soon.": "i-will-write-again-soon",
    "Is it telling, asking, or showing a strong feeling?": "is-it-telling-asking-or-showing-a-strong-feeling",
    "Is the writer telling us something or asking something?": "is-the-writer-telling-us-something-or-asking-something",
    "Is this ordinary information or a strong feeling?": "is-this-ordinary-information-or-a-strong-feeling",
    "Let's eat, Dadi!": "let-s-eat-dadi",
    "Let's fix one sentence at a time.": "let-s-fix-one-sentence-at-a-time",
    "Look at that huge kite!": "look-at-that-huge-kite",
    "Look at the beginning and end of the sentence.": "look-at-the-beginning-and-end-of-the-sentence",
    "Look closely. Where does the sentence begin or end?": "look-closely-where-does-the-sentence-begin-or-end",
    "Oh dear! Are we eating Dadi\u2026 or talking to Dadi?": "oh-dear-are-we-eating-dadi-or-talking-to-dadi",
    "Oops! Try again!": "oops-try-again",
    "Pick the full-stop stamp and place it at the end.": "pick-the-full-stop-stamp-and-place-it-at-the-end",
    "Place the full-stop stamp at the end of the sentence.": "place-the-full-stop-stamp-at-the-end-of-the-sentence",
    "Please send crayons, storybooks, stickers and a ball.": "please-send-crayons-storybooks-stickers-and-a-ball",
    "Please send me crayons, storybooks and stickers.": "please-send-me-crayons-storybooks-and-stickers",
    "Read it again. Is it telling, asking, or showing strong feeling?": "read-it-again-is-it-telling-asking-or-showing-strong-feeling",
    "Read this part again. What is the writer trying to say?": "read-this-part-again-what-is-the-writer-trying-to-say",
    "See you soon, Raju!": "see-you-soon-raju",
    "Something still needs fixing.": "something-still-needs-fixing",
    "That's it! A comma separates different items in a list.": "that-s-it-a-comma-separates-different-items-in-a-list",
    "That's it! An exclamation mark goes at the end to show a strong feeling.": "that-s-it-an-exclamation-mark-goes-at-the-end-to-show-a-strong-feeling",
    "That's it! The full stop shows where the sentence ends.": "that-s-it-the-full-stop-shows-where-the-sentence-ends",
    "That's right! The sentence begins with a capital letter and ends as a statement.": "that-s-right-the-sentence-begins-with-a-capital-letter-and-ends-as-a-statement",
    "That's right! The sentence begins with a capital letter and ends with excitement.": "that-s-right-the-sentence-begins-with-a-capital-letter-and-ends-with-excitement",
    "That's right! The sentence now begins and ends correctly.": "that-s-right-the-sentence-now-begins-and-ends-correctly",
    "That's right! This sentence tells something, so a full stop fits at the end.": "that-s-right-this-sentence-tells-something-so-a-full-stop-fits-at-the-end",
    "That's right! We use a question mark at the end of a question.": "that-s-right-we-use-a-question-mark-at-the-end-of-a-question",
    "The comma shows that you are speaking to Dadi, not eating her!": "the-comma-shows-that-you-are-speaking-to-dadi-not-eating-her",
    "The comma shows that you are telling Nani that you miss her.": "the-comma-shows-that-you-are-telling-nani-that-you-miss-her",
    "The comma shows that you are telling Raju that you'll see him soon.": "the-comma-shows-that-you-are-telling-raju-that-you-ll-see-him-soon",
    "The fair was very busy.": "the-fair-was-very-busy",
    "The writer is naming different things.": "the-writer-is-naming-different-things",
    "This sentence needs a full stop.": "this-sentence-needs-a-full-stop",
    "Try placing it at the end of the sentence.": "try-placing-it-at-the-end-of-the-sentence",
    "We made hot samosas.": "we-made-hot-samosas",
    "We saw monkeys, parrots and rabbits at the fair.": "we-saw-monkeys-parrots-and-rabbits-at-the-fair",
    "We won the match!": "we-won-the-match",
    "Well done! The commas separate the different things in the list.": "well-done-the-commas-separate-the-different-things-in-the-list",
    "Well done! You fixed the beginning and end of the sentence.": "well-done-you-fixed-the-beginning-and-end-of-the-sentence",
    "What a beautiful card!": "what-a-beautiful-card",
    "What a wonderful gift!": "what-a-wonderful-gift",
    "What is this sentence doing \u2014 telling, asking, or showing strong feeling?": "what-is-this-sentence-doing-telling-asking-or-showing-strong-feeling",
    "Where does this sentence begin or end?": "where-does-this-sentence-begin-or-end",
    "Where is my red scarf?": "where-is-my-red-scarf",
    "Which words are separate things in the list?": "which-words-are-separate-things-in-the-list",
    "Which words name different things in the list?": "which-words-name-different-things-in-the-list",
    "Who is being spoken to?": "who-is-being-spoken-to",
    "Who is the writer speaking to?": "who-is-the-writer-speaking-to"
  };

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
    voice: null, voiceText: '', voicePros: null,   /* the clip in flight */
    busy: false, gate: null, openGate: null,       /* the "line finished" gate */

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

    /* `force` scales the impression. The sheet grades it: a "stronger THUMP"
       for the exclamation, a "calm THUMP" where the feedback should be calmer
       than an exclamation's, a "light" chime against a "strong success chime".
       One flat volume for every mark flattened all of that. */
    play(name, force) {
      if (!this.on || !this.armed) return;
      const a = this.el[name];
      const f = force == null ? 1 : force;
      if (a && a.readyState >= 2) {
        try {
          const c = a.cloneNode();
          c.volume = Math.max(0, Math.min(1, a.volume * f));
          c.play().catch(() => this.tone(name, f));
          return;
        } catch (e) {}
      }
      this.tone(name, f);        /* file missing or undecodable — synthesise */
    },

    tone(name, force) {
      const spec = SFX_TONES[name];
      if (!spec || !this.ctx) return;
      const [type, f0, f1, dur, gain0] = spec;
      const gain = Math.max(0.001, Math.min(1, gain0 * (force == null ? 1 : force)));
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

    /* The coach's voice: the recorded line if there is one, otherwise the
     * browser's own synthesis. A miss in VO is not an error — six lines are
     * not recorded yet, and Safari cannot decode Ogg at all — so every path
     * out of here still speaks. */
    speak(text, prosody) {
      if (!this.on || !text) return;
      this.stopSpeech();
      /* kept so the error path below can still say the line out loud */
      this.voiceText = text; this.voicePros = prosody;
      /* A fresh line opens a new gate. Anything waiting on the previous one
         was released by stopSpeech() above, so a gate can never outlive the
         line it belongs to. */
      this.gate = new Promise((res) => { this.openGate = res; });
      this.busy = true;
      const clips = VO[text];
      if (clips && this.playVo(Array.isArray(clips) ? clips : [clips])) return;
      this.synth(text, prosody);
    },

    /* Called when the line finishes, is cut off, or turns out never to have
       started. Idempotent: whoever gets there first releases the waiters. */
    endLine() {
      this.busy = false;
      if (this.openGate) { const r = this.openGate; this.openGate = null; r(); }
    },

    /* Resolves when the line being spoken has finished. Capped, because a
     * stalled <audio> or a synthesis engine that never fires `end` must not
     * be able to hold the game — the same rule the asset loader follows.
     * Resolves immediately when nothing is playing, which is what keeps a
     * muted run (and the suite) at full speed. */
    whenSpoken(capMs) {
      if (!this.busy || !this.gate) return Promise.resolve();
      return Promise.race([
        this.gate,
        new Promise((res) => setTimeout(res, capMs == null ? 8000 : capMs))
      ]);
    },

    /* Recorded clips, played in order. Returns false if the browser will not
     * take the first one, so the caller can fall back rather than go silent. */
    playVo(names) {
      if (!this.armed) return false;
      let a;
      try { a = new Audio('assets/vo/' + names[0] + '.ogg'); }
      catch (e) { return false; }
      if (a.canPlayType && !a.canPlayType('audio/ogg')) return false;
      a.volume = 0.95;
      this.voice = a;
      /* If the file is missing or undecodable we only find out here, well
         after speak() returned — so the fallback has to live on the error
         path too, or a bad clip is silence with no line spoken. */
      const fail = () => { if (this.voice === a) { this.voice = null; this.synth(this.voiceText, this.voicePros); } };
      a.addEventListener('error', fail, { once: true });
      a.addEventListener('ended', () => {
        if (this.voice !== a) return;
        this.voice = null;
        /* only the LAST clip of a line closes the gate */
        if (names.length > 1) this.playVo(names.slice(1));
        else this.endLine();
      }, { once: true });
      a.play().catch(fail);
      return true;
    },

    /* prosody shapes pitch/rate so a question rises and an exclamation lifts —
       the sheet asks for statement/question/exclamation intonation when she
       reads a finished sentence back. Recorded lines carry their own. */
    synth(text, prosody) {
      if (!this.on || !text || !('speechSynthesis' in window)) { this.endLine(); return; }
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.92; utt.pitch = 1.15; utt.volume = 0.9;
        if (prosody === 'question')    { utt.pitch = 1.3; }
        if (prosody === 'exclamation') { utt.pitch = 1.35; utt.rate = 1.0; }
        if (prosody === 'list')        { utt.rate = 0.85; }
        utt.addEventListener('end', () => this.endLine(), { once: true });
        utt.addEventListener('error', () => this.endLine(), { once: true });
        window.speechSynthesis.speak(utt);
      } catch (e) { this.endLine(); }
    },

    stopSpeech() {
      if (this.voice) { try { this.voice.pause(); } catch (e) {} this.voice = null; }
      try { window.speechSynthesis.cancel(); } catch (e) {}
      /* whoever was waiting on this line is released, or a cut-off line
         would leave the state machine parked until the cap expired */
      this.endLine();
    },

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
    on('stamp:press',       (e) => { Audio_.play('thump', e.detail.force);
                                 setTimeout(() => Audio_.play('sparkle'), 90); });
    on('stamp:reject',      () => Audio_.play('boop'));
    on('stamp:pickup',      () => Audio_.play('pickup'));
    on('letter:seal',       (e) => Audio_.play('chime', e.detail.force));
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

  /* How long a line must stay before anything the player did not ask for may
   * replace it. This is HUMAN reading time, so unlike every other duration in
   * the file it is NOT scaled by TIMING.SPEED. Two bugs came from not having
   * it: the tutorial's praise and its read-back were set in the same tick, so
   * the praise replaced the sentence instantly and cut its speech off. */
  let coachHoldUntil = 0, coachQueueT = null;
  const readMs = (t) => Math.min(7000, 1500 + t.length * 55);
  const coachRemaining = () => Math.max(0, coachHoldUntil - performance.now());
  function clearCoachQueue() { clearTimeout(coachQueueT); coachQueueT = null; }

  function coach(text, tone, opts) {
    opts = opts || {};
    if (tone) coachEl.dataset.tone = tone;
    if (text == null) return;
    /* Saying what is already on screen is not a new line. Restating it used to
     * restart the badge tick and re-emit the VO, so every letter announced its
     * instruction TWICE — once from `idle`, then again from `read`, the second
     * one cutting off the first mid-word. */
    if (text === coachLine.textContent && coachEl.classList.contains('live')) return;
    /* an `after` line waits its turn instead of talking over the current one */
    if (opts.after && coachRemaining() > 0) {
      const ms = coachRemaining();
      clearCoachQueue();
      coachQueueT = setTimeout(() => {
        coachQueueT = null;
        coach(text, tone, Object.assign({}, opts, { after: false }));
      }, ms);
      return;
    }
    clearCoachQueue();
    coachHoldUntil = performance.now() + readMs(text);
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

  /* Wait for the line just given to be finished BOTH out loud and on the page.
   *
   * Two clocks, and the later one wins: the voice (real clip or synthesis
   * duration, whichever is playing) and `readMs` (so a muted player still gets
   * time to read). Without this the machine ran on its own timers and the
   * screen moved on mid-sentence — the read-back of a finished letter was
   * regularly cut off by its own fold. Audio_.whenSpoken caps its half, so a
   * stalled clip delays a beat rather than parking the game. */
  function coachSpoken(capMs) {
    return Promise.all([
      Audio_.whenSpoken(capMs),
      wait(coachRemaining())
    ]);
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
    posted: 0,            /* letters resting on the outgoing pile */
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
      /* MEASURE THE GLYPH, NOT THE SLOT. For a punctuation target marks[] holds
       * the `.slot`, and the slot now carries the gap that keeps the mark clear
       * of the word before it — so measuring the slot puts its left edge flush
       * against that word, and any halo at all starts inside it. The `.mark`
       * child is the glyph itself (invisible until stamped, but occupying its
       * space). A capitalise target is already the character. */
      const inkEl = el.querySelector('.mark') || el;
      const r = inkEl.getBoundingClientRect();
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
      /* The zone is sized for a child's aim; the HIGHLIGHT is a rounded square
       * around the mark, with the same halo on every screen.
       *
       * It used to be the mark's measured box outright — and a mark's box is a
       * full LINE box, 24.6 x 111.2 design px for a full stop, so what got
       * drawn was a tall capsule four and a half times its own width. Squaring
       * it off means deriving the size from the width and ignoring that height.
       *
       * Punctuation gets an 11px halo, which is exactly the gap the slot keeps
       * ahead of the mark, so the highlight stops short of the word before it.
       * A capitalise target has to cover the letter it points at, so it gets a
       * wider one — and pointing at a letter inside a word cannot help
       * reaching its neighbours.
       *
       * Real px, so it stays right at any scale — the zones are rebuilt on
       * resize. */
      const halo = (t.kind === 'capitalise' ? 26 : 16) * U;
      const gw = r.width + halo;
      h.style.setProperty('--gw', gw + 'px');
      h.style.setProperty('--gh', gw * 1.15 + 'px');
      /* A LINE BOX IS NOT CENTRED ON ITS INK. Punctuation sits down at the
         baseline, roughly a sixth of the box below its middle, so a square
         centred on the box would float above a full stop instead of around it.
         A capital spans the x-height and is already near the middle. */
      h.style.setProperty('--gy', (t.kind === 'capitalise' ? 0 : r.height * 0.10) + 'px');
      const ghost = document.createElement('span');
      ghost.className = 'ghost';
      ghost.textContent = t.kind === 'capitalise'
        ? S.letter.text[t.at].toUpperCase() : t.char;
      h.appendChild(ghost);
      h.addEventListener('click', () => onTargetTap(t));
      /* Escalation state is derived from the target, never stored on the
       * element: buildHits() runs after every press, so anything held only in
       * a CSS class would be wiped the moment the zones were rebuilt.
       *
       * It has to derive the TUTORIAL'S rule too, not just a real level's.
       * reject() stops the tutorial escalating, but this ran on its own count
       * and put the tier-2 glow and then the tier-3 ghost back on a screen
       * whose Wrong 2 and Wrong 3 cells are empty. The tutorial gets exactly
       * what its Wrong 1 asks for — "End position glows more strongly" — from
       * the first miss on, and never a ghost of the answer. */
      if (t.errors < 1) { /* nothing yet */ }
      else if (isTutorial()) { h.classList.add('glow-strong'); }
      else if (t.errors >= 3) {
        /* the same per-screen rules reject() applies — see the Wrong 3 note
           there. Nine screens point at the stamp and never at the paper, and
           only three ever show a ghost. */
        if (!S.letter.markOnly) h.classList.add('glow-strong');
        if (S.letter.ghost) h.classList.add('has-ghost');
      } else if (t.errors >= 2 && S.letter.w2 === 'area') { h.classList.add('glow'); }
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

  /* envelope.png is a square file whose artwork fills only part of it, so this
   * takes the width the ART should read at and returns the FILE's box — which
   * is square, and is set explicitly.
   *
   * Every caller used to override that height with `auto` and let the <img>
   * decide. That makes the layout wait on the image: for one frame after the
   * element is inserted the div is zero-high, its contents are stacked at its
   * top edge, and anything measuring or animating it is working from the wrong
   * box. It showed up as the level-complete row starting 240 design px — half
   * a card — above where it should. Preloading does not help; the frame exists
   * either way. The box is known, so it is stated. */
  function envBox(cx, cy, visW) {
    const box = visW / ENV.fw;
    return { x: cx - (ENV.fx0 + ENV.fw / 2) * box, y: cy - (ENV.fy0 + ENV.fh / 2) * box,
             w: box, h: box };
  }

  /* The transform that carries an element sitting at `from` onto `to`.
   * CENTRE TO CENTRE — the transform origin is the element's own middle, so a
   * top-left delta lands it short by half the size difference, which for the
   * level-complete row is over a hundred design px. */
  function ontoBox(from, to) {
    return {
      x: u((to.x + to.w / 2) - (from.x + from.w / 2)),
      y: u((to.y + to.h / 2) - (from.y + from.h / 2)),
      s: to.w / from.w
    };
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
  /* THE CARD NEVER FOLDS. A sheet arrives and the same sheet leaves, so the
   * three-band 3D fold, the drawn envelope it was lowered into, and every
   * helper that served them are gone — see the README. What is left is one
   * un-sliced instance of the artwork, which is also what the inbox pile is
   * made of. */
  const cardLayer = $('#card-layer');
  const stripes = () => document.querySelectorAll('.card-stripes');

  function resetCard() {
    stopHand();
    cardLayer.style.opacity = '0';
    cardLayer.style.transform = '';
    cardLayer.style.transformOrigin = '';
    cardLayer.classList.remove('lift', 'land');
    stripes().forEach((x) => { x.style.opacity = '0'; });
    sentenceEl.style.opacity = '0';
    targetsEl.innerHTML = '';
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

  /* The DRAWN envelope is gone with the fold that fed it. It existed so a
   * folded letter could be lowered into a real pocket — a back panel, a front
   * panel and a hinged flap sandwiching #card-layer in paint order. Nothing
   * folds any more, so there is nothing to put away: `envelope.png` still
   * stands in for a posted letter on the piles and in the level-complete row,
   * where it is under 300px wide and none of that machinery would read. */

  /* The pile a letter is taken from: loose sheets, not envelopes — a sheet
     arrives, and the same sheet leaves. */
  function renderInbox(n) {
    inboxEl.innerHTML = '';
    for (let i = Math.min(n, L.inbox.length) - 1; i >= 0; i--) {
      inboxEl.appendChild(miniCard(L.inbox[i]));
    }
  }

  /* ONE SLOT PER SENT LETTER, and the only description of where the pile
   * sits. `levelup` flies its franked row down onto these exact boxes and
   * then lets the pile redraw underneath, so the hand-off is invisible —
   * which only works while both read the geometry from here. The pile stops
   * deepening at four; past that the newest letter lands on the top of it. */
  const BAG_SLOTS = 4;
  function bagSlot(i) {
    const v = L.outboxVis, k = Math.min(i, BAG_SLOTS - 1);
    return envBox(v.cx - k * 14, v.cy + k * 9, v.w * (1 + k * 0.05));
  }
  const bagOpacity = (i) => 0.92 - Math.min(i, BAG_SLOTS - 1) * 0.05;

  /* a sealed letter: the envelope with READY TO POST franked across it */
  function envCard(cls, alt) {
    const d = document.createElement('div');
    d.className = cls;
    /* the envelope carries a class of its own: the seal is also an <img> in
       here, and a bare `img` sizing rule would swallow it */
    d.innerHTML = '<img class="env-art" src="assets/envelope.png" alt="' + (alt || '') + '">' +
                  '<img class="fin-seal" src="assets/ready-to-post.png" alt="">';
    return d;
  }

  /* the pile fills visibly as letters are sent */
  function renderMailbag(n) {
    mailbagEl.innerHTML = '';
    const shown = Math.min(n, BAG_SLOTS);
    for (let i = 0; i < shown; i++) {
      const d = envCard('bag');
      place(d, bagSlot(i));
      d.style.opacity = String(bagOpacity(i));
      mailbagEl.appendChild(d);
    }
  }

  /* =================================================================== */
  /* 1. idle                                                             */
  /* =================================================================== */
  async function stIdle() {
    lockStamps(true);
    stopIdleTimer();
    resetCard();

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
  /* 2. deal — the sheet flies in from the inbox, whole                  */
  /* =================================================================== */
  /* There is no `open` state. A sheet has nothing to open: it is already a
   * flat piece of paper when it leaves the pile, so it arrives complete —
   * stripes and all — and the text is next. It used to grow from scaleY(.15)
   * with a triangular flap swinging off the top edge, which was left over
   * from the card standing in for an envelope; on a plain sheet that read as
   * a window blind rolling down over paper that was already there. */
  async function stDeal() {
    const from = L.inbox[0], card = L.card, T = TIMING.deal;
    const dx = u((from.x + from.w / 2) - (card.x + card.w / 2));
    const dy = u((from.y + from.h / 2) - (card.y + card.h / 2));

    stripes().forEach((s) => { s.style.opacity = '1'; });
    cardLayer.style.opacity = '1';

    if (reduced()) {
      cardLayer.style.transform = '';
      await anim(cardLayer, [{ opacity: 0 }, { opacity: 1 }], D(1), 'linear');
      return 'read';
    }

    await anim(cardLayer, arcFrames(
      { x: dx, y: dy, rot: T.fromRot, s: T.fromScale },
      { x: 0, y: 0, rot: 0, s: T.toScale },
      -u(180), bezier(0.22, 0.8, 0.28, 1), 18), D(T.total), 'linear');
    await anim(cardLayer, [
      { transform: tf({ s: 1 }) },
      { transform: tf({ s: T.overshoot }), offset: 0.5 },
      { transform: tf({ s: 1 }) }], D(T.overshootMs * 2), 'ease-out');
    cardLayer.style.transform = '';
    deskShift();
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
    /* This line is the one that tells the player to pick a stamp, so the tray
       pulses with it — the words alone left children looking at the sentence
       with no idea the stamps were the thing to act on. The tutorial says it
       in two beats, and the second waits for the first to be finished rather
       than talking over it. */
    if (level().tutorial) {
      await coachSpoken();
      coach(S.letter.intro2, 'neutral');
    } else {
      coach(S.letter.instruction, 'neutral');
    }
    pulseStamps();
    return 'await-input';
  }

  /* =================================================================== */
  /* 5. await-input — drag or tap, any target, any order                 */
  /* =================================================================== */
  let resolvePick = null;
  let armed = false;             /* a stamp is picked up, awaiting a target */
  let armedStamp = -1;
  let dragMoved = false;
  let idleTimer = null;

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
  /* Every pointerdown and keydown in the document reaches this (see the
     listeners at the bottom), which makes it the one place that knows the
     player has done something — so it is also where the demonstrating hand
     gets out of their way. */
  function kickIdleTimer() {
    stopHand();
    if (S.name === 'await-input') startIdleTimer();
  }
  function stopIdleTimer() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

  /* A STALL SAYS NOTHING. Waiting is not a mistake, and it used to be treated
   * as one: the panel replaced its line with the letter's hint, and then, every
   * nine seconds after that, with another random tip — so a still screen had
   * text marching through it for no reason the player could see. Nothing has
   * happened, so there is nothing new to say.
   *
   * WHAT IT SHOWS IS PER SCREEN, and the sheet is specific about it — these are
   * not interchangeable. The tutorial bounces its one stamp and pulses the gap
   * after "soon". 1A pulses the tray AND the two ends of the sentence; 1B and
   * 1C pulse the ends only. Levels 2 to 4 bounce their stamps together and
   * leave the words alone. Levels 5 to 8 do the reverse: the words pulse and
   * nothing in the tray moves — 7A says "no stamp animates" outright. The
   * Final Letter pulses the whole letter while it is untouched and narrows to
   * the unresolved sentence once it is not.
   *
   * All twenty-four used to get the same staggered tray wave, which was the
   * wrong cue on fourteen of them and the forbidden one on 7A. */
  const DEFAULT_STALL = { stamps: false, text: 'sentence' };

  function onIdle() {
    if (S.name !== 'await-input') return;
    const t = unsolved()[0];
    const cue = S.letter.stall || DEFAULT_STALL;
    emit('nudge:idle', { letter: S.letter.id });

    /* "bounce TOGETHER once" — not the staggered wave the instruction line
       uses, which is a different gesture for a different purpose */
    if (cue.stamps === 'all') stampEls.forEach((b) => bounce(b));
    else if (cue.stamps === 'one' && stampEls[0]) bounce(stampEls[0]);

    if (cue.text === 'ends') pulseWords(endsOfSentence(t ? t.sentence : 0));
    else if (cue.text === 'word' && t) pulseWords([wordOfTarget(t)]);
    else if (cue.text === 'letter') {
      const touched = S.letter.targets.some((x) => x.done);
      pulseWords(touched && t ? wordsOfSentence(t.sentence) : allWords());
    } else if (cue.text === 'sentence' && t) pulseWords(wordsOfSentence(t.sentence));
    startIdleTimer();
  }

  /* ---- pulsing words ------------------------------------------------- */
  const allWords = () => Array.from(sentenceEl.querySelectorAll('.wordwrap'));

  function wordsOfSentence(idx) {
    const ws = sentenceEl.querySelectorAll(`.wordwrap[data-sentence="${idx}"]`);
    return ws.length ? Array.from(ws) : allWords();
  }

  /* the first and last word of a sentence — the sheet's "beginning/end", which
     is narrower than the whole line it used to pulse */
  function endsOfSentence(idx) {
    const ws = wordsOfSentence(idx);
    return ws.length < 2 ? ws : [ws[0], ws[ws.length - 1]];
  }

  /* the one word a target sits in, mark or capital alike */
  function wordOfTarget(t) {
    const el = marks[t.id] || charEls[t.at];
    return el ? el.closest('.wordwrap') : null;
  }

  function pulseWords(list) {
    list.filter(Boolean).forEach((w) => {
      w.classList.remove('pulse');
      void w.offsetWidth;
      w.classList.add('pulse');
    });
  }

  const pulseSentence = (idx) => pulseWords(wordsOfSentence(idx));

  /* A more insistent "look here" than the continuous idle bob — used when
   * the coach is actively directing attention to a stamp (the instruction
   * line, the idle nudge, and the tier-3 lift of the correct stamp), so it
   * reads as a pulse rather than the stamp's usual gentle resting motion. */
  function bounce(el, delay) {
    if (reduced()) return;
    anim(el, [
      { transform: 'translate3d(0,0,0) scale(1)' },
      { transform: `translate3d(0,${-u(20)}px,0) scale(1.16)`, offset: 0.3 },
      { transform: 'translate3d(0,0,0) scale(1)', offset: 0.56 },
      { transform: `translate3d(0,${-u(11)}px,0) scale(1.08)`, offset: 0.8 },
      { transform: 'translate3d(0,0,0) scale(1)' }
    ], D(600), 'ease-out', delay ? { delay: D(delay) } : undefined);
  }

  /* the whole tray, as a wave across it rather than every stamp at once —
     which reads as the tray being pointed at, not as a glitch */
  function pulseStamps() {
    stampEls.forEach((b, i) => bounce(b, i * 90));
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

  /* --- the third-miss hand -------------------------------------------- */
  /* BY THE THIRD MISS, TELLING HAS FAILED. The first two misses are words and
   * a glow; a child who is still missing has not understood the words, so the
   * third shows the move instead — the hand goes to the right stamp, picks it
   * up, carries it across and drops it on the place it belongs. It only ever
   * demonstrates; it never plays the turn, so the child still makes the move
   * themselves.
   *
   * The fingertip is the hot spot: the element is placed so its tip lands on
   * the anchor, and #hand-hint's transform-origin is that same point. */
  const handEl = $('#hand-hint');
  const HAND = { w: 96, vbW: 114, vbH: 146, tipX: 40 / 114, tipY: 10 / 146 };
  HAND.h = HAND.w * HAND.vbH / HAND.vbW;
  let handRun = 0;

  /* any real move by the player outranks the demonstration */
  function stopHand() {
    handRun++;
    handEl.style.opacity = '0';
    handEl.style.transform = '';
  }

  function pinHand(cx, cy) {
    handEl.style.left = ((cx - HAND.tipX * HAND.w) / DESIGN.w * 100) + '%';
    handEl.style.top = ((cy - HAND.tipY * HAND.h) / DESIGN.h * 100) + '%';
    handEl.style.width = (HAND.w / DESIGN.w * 100) + '%';
  }

  async function handHint(target) {
    const T = TIMING.hand;
    const btn = stampEls[stampSlots.findIndex((z) => z.id === target.stamp)];
    const h = hits[target.id];
    if (reduced() || !btn || !h) return;
    const run = ++handRun;
    const live = () => handRun === run;

    /* the knob of the stamp, not the middle of its button */
    const a = rectOf(btn), b = rectOf(h.el);
    pinHand(a.cx, a.y + a.h * 0.3);
    const dx = u(b.cx - a.cx), dy = u(b.cy - (a.y + a.h * 0.3));

    /* 1. the hand comes in low and settles onto the stamp */
    await anim(handEl, [{ opacity: 0, transform: tf({ y: u(34), s: 0.86 }) },
                        { opacity: 1, transform: tf({ y: 0, s: 1 }) }],
               D(T.inMs), TIMING.ease.out);
    if (!live()) return;

    /* 2. it presses it — and the stamp answers, so the pair read as one act */
    bounce(btn);
    await anim(handEl, [{ transform: tf({ y: 0, s: 1 }) },
                        { transform: tf({ y: u(10), s: 0.96 }), offset: 0.4 },
                        { transform: tf({ y: 0, s: 1 }) }], D(T.pressMs), TIMING.ease.thump);
    if (!live()) return;

    /* 3. and carries it across to the place it belongs */
    await anim(handEl, arcFrames({ x: 0, y: 0, s: 1, rot: 0 }, { x: dx, y: dy, s: 1, rot: 0 },
                                 -u(120), bezier(0.3, 0.7, 0.3, 1), 18), D(T.travelMs), 'linear');
    if (!live()) return;

    /* 4. THE DROP — the whole point of the hint. It lifts, comes down hard on
     *    the target and rebounds, which is the gesture the child has to make. */
    await anim(handEl, [{ transform: tf({ x: dx, y: dy, s: 1 }) },
                        { transform: tf({ x: dx, y: dy - u(26), s: 1.05 }), offset: 0.34 },
                        { transform: tf({ x: dx, y: dy + u(6), s: 0.97 }), offset: 0.72 },
                        { transform: tf({ x: dx, y: dy, s: 1 }) }],
               D(T.dropMs), TIMING.ease.thump);
    if (!live()) return;
    deskShift();

    await anim(handEl, [{ opacity: 1 }, { opacity: 0 }], D(T.outMs), 'ease-in');
    if (!live()) return;
    handEl.style.opacity = '0';
    handEl.style.transform = '';
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

    /* A MISS NEVER TRAVELS. The stamp goes straight back to its slot from
     * wherever the player let go, and refuses there. It used to be pulled to
     * the target's exact hover pose first — the magnetic snap doing its job —
     * so a stamp dropped in the wrong place appeared to move ITSELF to the
     * right place, wobble, and only then leave. That reads as the game
     * correcting the aim and then changing its mind. */
    if (!ok) {
      emit('stamp:reject', { stamp: stampId, target: target.id });
      const from = btn.style.transform || tf({ x: 0, y: 0, s: 1 });
      if (!reduced()) {
        await anim(btn, [{ transform: from }, { transform: tf({ x: 0, y: 0, s: 1 }) }],
                   D(T.returnMs * 0.7), TIMING.ease.standard);
      }
      btn.style.transform = '';
      await reject(btn, 0, 0, 1, target);      /* the refusal plays in the tray */
      btn.style.transform = '';
      btn.style.zIndex = '';
      buildHits();
      return 'await-input';                    /* never advance on a miss */
    }

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

    /* 3A and 3C ask for a "stronger THUMP" on the exclamation; 3B for a "calm
       THUMP", its notes adding "correct feedback calmer than exclamation
       feedback". `calm` was authored for exactly this and never read. */
    emit('stamp:press', { stamp: stampId, target: target.id,
                          force: stampId === 'exclamation' ? 1.35
                                 : (S.letter.calm ? 0.75 : 1) });
    deskShift();
    applyTarget(target);

    if (!reduced()) {
      await anim(btn, arcFrames({ x: toX, y: pressY, s: travelScale }, { x: 0, y: 0, s: 1 },
                                arcLift * 0.8, bezier(0.22, 0.9, 0.24, 1), 16),
                 D(T.returnMs), 'linear');
    }
    btn.style.transform = '';
    btn.style.zIndex = '';
    buildHits();

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
       * printed text, so the learner can see at a glance exactly what they
       * added. It sits SQUARE on the line: the couple of degrees of stamp
       * tilt read as a wonky capital rather than as a real stamp landing. */
      glyph.classList.add('inked');
      pressIn(glyph);
      impression(glyph);
    }
    const name = t.kind === 'capitalise'
      ? 'Capital ' + S.letter.text[t.at].toUpperCase()
      : STAMPS[t.stamp].say;
    if (sayEl) sayEl.textContent = name + ' added';
    if (unsolved().length) coach(null, 'pleased');
  }

  /* the glyph taking the hit: squashed by the pad, then springing to size */
  function pressIn(el) {
    if (reduced()) { el.style.opacity = '1'; return; }
    anim(el, [
      { opacity: 0, transform: 'scale(1.55)', filter: 'blur(2px)' },
      { opacity: 1, transform: 'scale(.88)', filter: 'blur(0px)', offset: 0.45 },
      { opacity: 1, transform: 'scale(1.06)', offset: 0.72 },
      { opacity: 1, transform: 'scale(1)' }
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

  /* Three-tier escalation, counted PER TARGET (the sheet's Wrong 1/2/3) — and
     one tier only in the tutorial, which the sheet gives no Wrong 2 or 3. */
  async function reject(btn, x, y, s, target) {
    const T = TIMING.reject;
    target.errors++;
    const h = hits[target.id];
    if (h) {
      h.el.classList.add('wrong');
      setTimeout(() => h.el.classList.remove('wrong'), 420);
    }

    const say = S.letter.say;
    /* THE TUTORIAL DOES NOT ESCALATE. Its Wrong 2 and Wrong 3 cells are empty
     * and its developer notes say there is no failure state, so every miss
     * gets the Wrong 1 response — however many there are. It used to climb the
     * same three tiers as a real level, which meant showing a ghost of the
     * answer and, latterly, the hand, in a screen whose whole job is to let a
     * child try the gesture without being marked. */
    const tier = isTutorial() ? 1 : Math.min(target.errors, 3);
    if (tier === 1) {
      coach(say.e1, 'puzzled');
      /* the tutorial's Wrong 1 is the only one that also points: its cell ends
         "End position glows more strongly" */
      if (isTutorial()) glow(target, 'strong');
    } else if (tier === 2) {
      coach(say.e2, 'puzzled');
      /* WHAT PULSES AT THE SECOND MISS VARIES. Six screens name something —
       * 1A and 1B "beginning/end zones pulse", 1C and 7A "unresolved area
       * pulses", 4D "attempted sentence pulses", 24 "specific unresolved
       * sentence/section highlights" — and the other seventeen give the line
       * alone, because they have a single target and where it goes was never
       * the question. All twenty-three used to pulse the whole sentence and
       * glow the target. */
      const w2 = S.letter.w2;
      if (w2 === 'ends') pulseWords(endsOfSentence(target.sentence));
      else if (w2 === 'sentence') pulseSentence(target.sentence);
      else if (w2 === 'area') glow(target);
    } else {
      /* Wrong 3 has no words on any of the twenty-four screens: it is a glow,
       * a ghost and the hand. `e3` is null throughout, so this leaves the
       * Wrong 2 line standing rather than restating it — which is what the
       * old `say.e3 || say.e2` fallback did.
       *
       * WHERE IT POINTS IS NOT THE SAME EVERYWHERE EITHER. Nine screens — 2A
       * through 4C — say only "? pulses" or ". pulses": the STAMP, and nothing
       * about the paper, because on those the position was never in doubt and
       * only the choice of mark is. The rest name the place too ("relevant
       * tool + unresolved target pulse together"). And a ghost of the answer
       * is asked for on three screens only: 1A, 1B, and the Final Letter's
       * "ghost impression if needed". All of it used to fire on all twenty-
       * three, and it pulsed the whole sentence besides — where the sheet asks
       * for the gap ("Space before Dadi + comma stamp pulse"), not the line. */
      coach(say.e3, 'puzzled');
      if (!S.letter.markOnly) glow(target, 'strong');
      if (S.letter.ghost) showGhost(target);
      /* and the hand shows the move itself — which is also the sheet's "the
         relevant stamp lifts once", since the hand starts by pressing it. NOT
         awaited: the tray unlocks the moment the refused stamp is home, so a
         child who has already worked it out is never made to sit through the
         demonstration — their first touch calls stopHand() and it gets out of
         the way. */
      handHint(target);
    }
    emit('nudge:error', { tier: tier, target: target.id });

    if (reduced()) return;
    /* A miss leaves no mark, so the stamp itself has to carry the whole
     * answer: it wobbles where the player is holding it — never pressed into
     * the paper — glows red once, and then goes straight home to its tray
     * slot (the return is in stStamp). Rocking it about its own centre reads
     * as "this did not take" far more clearly than the flat sideways shake it
     * used to do. */
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
  /* 7. seal — praise, read-back, and the letter goes                    */
  /* =================================================================== */
  const levelComplete = () => S.solved + 1 >= level().letters.length;

  async function stSeal() {
    const T = TIMING.seal;
    /* "light completion chime" (1B) through to "strong success chime" (24) */
    emit('letter:seal', { id: S.letter.id,
                          force: S.letter.big ? 1.3 : (S.letter.calm ? 0.8 : 1) });
    targetsEl.innerHTML = '';

    /* 6A: "Comma lands → THUMP → COMIC PAUSE → Pari goes from shocked to
     * relieved → reads". Its developer notes single the timing out: "preserve
     * comic pause/reaction timing". The joke is that the sentence said
     * something alarming and the comma fixes it, and a joke needs the beat
     * before the punchline. `comic` was authored for this and never read. */
    if (S.letter.comic) await wait(T.comicMs);

    /* 5A: "Comma stamps → list items subtly SEPARATE/SETTLE". The comma's
       whole job is to hold things apart, so the list shows itself being held
       apart. */
    if (S.letter.settle) settleList(S.letter);

    /* 4D: "All 3 correct → LETTER GLOWS → Pari reads whole message". 24 the
       same, on the final repair. Only those two — they are the letters where
       finishing means finishing several sentences at once. */
    if (S.letter.glowDone) cardGlow();

    /* The sheet's order: the praise, and THEN the sentence read back. Both
     * used to be set in the same tick, so the praise replaced the read-back
     * instantly — the line was on screen for no time at all and its speech was
     * cut off.
     *
     * EVERY SCREEN GETS ITS PRAISE, not just the tutorial. This is the sheet's
     * "Correct feedback (Hint Screen)" column — the line that says WHY the
     * answer was right, which is the teaching the letter exists for. It used
     * to be authored for the tutorial alone, because on the other twenty-three
     * screens the sheet does not name Pari as the speaker and there is no
     * separate hint surface to put it on. All twenty-four are now recorded,
     * which settles it: they are spoken. */
    if (S.letter.praise) {
      coach(S.letter.praise, 'pleased');
      await coachSpoken();
    }
    coachRead(S.letter);
    if (S.letter.confetti) confetti();
    /* NOTHING MOVES UNTIL THE READ-BACK HAS BEEN SAID. Hearing the corrected
     * sentence is the point of the whole letter, and the machine used to run
     * on its own timer — so the letter left the desk mid-word and the next
     * screen cancelled the rest of it. */
    await coachSpoken();

    /* NO READY TO POST HERE. It used to be slammed onto a level's last letter
     * on its way out, which announced the level as finished one beat before
     * the ceremony that shows the level finishing — and franked one letter of
     * three while its two classmates had left unstamped. The seal now belongs
     * entirely to `levelup`, where all of the level's letters take it
     * together. */
    await wait(T.holdMs);
    return 'post';
  }

  /* the completion glow (4D, 24) — opacity only, so the card's own filter,
     which is its shadow, is never touched */
  const cardGlowEl = $('#card-glow');
  function cardGlow() {
    if (reduced()) return;
    anim(cardGlowEl, [{ opacity: 0 }, { opacity: 1, offset: 0.32 }, { opacity: 0 }],
         D(TIMING.seal.glowMs), 'ease-out');
  }

  /* 5A's "list items subtly separate/settle": each word of the list steps
   * outward from the comma and eases back, so the mark that holds things apart
   * is seen holding them apart. Small on purpose — the sheet says "subtly",
   * and the words must stay readable while they move. */
  function settleList(letter) {
    if (reduced()) return;
    const t = letter.targets.find((x) => x.kind === 'punctuate');
    const words = wordsOfSentence(t ? t.sentence : 0);
    const pivot = t ? words.indexOf(wordOfTarget(t)) : 0;
    words.forEach((w, i) => {
      const dir = i <= pivot ? -1 : 1;
      const step = Math.min(3, Math.abs(i - pivot)) * dir;
      if (!step) return;
      anim(w, [{ transform: 'translateX(0)' },
               { transform: `translateX(${u(step * 4)}px)`, offset: 0.45 },
               { transform: 'translateX(0)' }],
           D(TIMING.seal.settleMs), TIMING.ease.out);
    });
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
  /* THE EXIT IS THE ARRIVAL, RUN BACKWARDS. The finished sheet lifts off the
   * desk and arcs away to the pile at bottom right — no fold, no envelope. It
   * used to fold itself in thirds in real 3D and be lowered into a drawn
   * envelope, which was a long, elaborate answer to "the letter is done" and
   * left the arrival and the departure telling two different stories about
   * what a letter is. A sheet arrives; the same sheet leaves. */
  async function stPost() {
    const T = TIMING.post;
    const g0 = generation;
    const wasLast = levelComplete();
    /* Unchanged by the new exit: the mailbag still takes only a level's last
       letter. What changed is how the paper leaves, not which paper counts. */
    const shouldPost = wasLast && !isTutorial();

    /* the text goes first, so what flies away is paper rather than words */
    if (reduced()) sentenceEl.style.opacity = '0';
    else await anim(sentenceEl, [{ opacity: 1 }, { opacity: 0 }], D(160), 'ease-in');
    sentenceEl.style.opacity = '0';

    const c = L.card;
    const v = L.outboxVis;
    /* land at about the width of the envelopes already on the pile, so the
       sheet reads as joining them rather than as a different object */
    const toW = v.w * 1.3;
    const dx = u(v.cx - (c.x + c.w / 2)), dy = u(v.cy - (c.y + c.h / 2));
    const sc = toW / c.w;
    /* Nothing rides along any more: no seal is put on the sheet here, so the
       card leaves on its own. */
    if (reduced()) {
      await anim(cardLayer, [{ opacity: 1 }, { opacity: 0 }], D(1), 'linear');
    } else if (shouldPost) {
      cardLayer.classList.remove('land');
      cardLayer.classList.add('lift');
      await anim(cardLayer, arcFrames(
        { x: 0, y: 0, s: 1, rot: 0 }, { x: dx, y: dy, s: sc, rot: T.toRot },
        -u(170), bezier(0.22, 0.8, 0.28, 1), 18), D(T.total), 'linear');
      await anim(cardLayer, [{ opacity: 1 }, { opacity: 0 }], D(120), 'ease-in');
    } else {
      /* the tutorial has nowhere to post to: the sheet just lifts and goes */
      await anim(cardLayer, [
        { opacity: 1, transform: tf({ s: 1 }) },
        { opacity: 0, transform: tf({ s: 0.96, y: -u(40) }) }], D(T.total * 0.7), 'ease-in');
    }
    cardLayer.classList.remove('lift', 'land');
    /* everything below moves the cursor, so it only runs if this is still
       the current run of the machine — see stale() */
    if (stale(g0)) return null;

    /* THE PILE IS NOT TOUCHED HERE. The sheet arcs off towards it, but the
     * letters only actually land — franked — in the level-complete ceremony,
     * all of them together. Adding this one to the pile first put a READY TO
     * POST on screen a beat before the ceremony that awards it. */
    if (shouldPost) emit('letter:post', { level: level().id, posted: S.posted });

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
    /* A finished level gets its own beat: every letter it taught comes back
     * out and is sealed. The tutorial is not a level and does not get one. */
    if (isTutorial()) { return advanceLevel(); }
    return 'levelup';
  }

  /* the only place the level cursor moves, so `levelup` and the tutorial's
     skip past it cannot disagree about what "next" means */
  function advanceLevel() {
    S.levelIndex++;
    S.letterIndex = 0;
    S.solved = 0;
    /* THE PILE BELONGS TO ONE LEVEL. It is cleared here, so a fresh level
     * starts with an empty corner and READY TO POST is only ever on screen
     * because the level in front of you has just been finished. Carrying the
     * stack forward meant every level after the first was played next to
     * three franked envelopes, which said "done" before anything was. */
    S.posted = 0;
    return 'idle';
  }

  /* A state function can still be mid-await when go() moves the machine on —
   * a level jump, a restart. drive() discards its RETURN value, but nothing
   * discards its SIDE EFFECTS, so anything that moves the cursor has to check
   * it is still the current run first. Without this, jumping to a level while
   * `levelup` was finishing let the interrupted state bump the cursor on top
   * of the jump: you asked for Level 4 and landed on Level 5. */
  const stale = (g) => generation !== g;

  /* =================================================================== */
  /* 8. levelup — the level's letters line up and take their seal        */
  /* =================================================================== */
  /* THE CEREMONY IS THE WHOLE JOURNEY, TOLD ONCE. The HUD has been ticking
   * off a mark per letter in the top right all level; those marks are where
   * the letters come from. They line up, take READY TO POST together, and go
   * down onto the outgoing pile in the bottom right. Nothing else in the game
   * frets a letter, so the seal reads as the reward for finishing the set
   * rather than as decoration on whichever letter happened to be last. */
  const finaleEl = $('#finale');

  /* the HUD mark a letter was recorded on — the ceremony's starting box.
     Measured rather than derived, because the pips are laid out in per-cent
     of the pill and the pill in per-cent of the stage. */
  function pipBox(i) {
    const pip = hudPips.children[i];
    if (!pip) return envBox(1786, 82, 60);        /* the HUD, if it has no marks */
    const r = rectOf(pip);
    return envBox(r.cx, r.cy, r.w * 0.86);
  }

  /* n envelopes centred in a row, sized so four fit as comfortably as three.
     Derived from the stage rather than a table of positions, because Level 4
     has four letters and every other level has three. */
  function levelRow(n) {
    const gap = 28, avail = DESIGN.w * 0.82;
    const w = Math.min(442, (avail - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    const x0 = (DESIGN.w - total) / 2;
    return Array.from({ length: n }, (_, i) => ({ cx: x0 + w / 2 + i * (w + gap), cy: 470, w: w }));
  }

  async function stLevelUp() {
    const T = TIMING.levelup;
    const g0 = generation;
    lockStamps(true);
    stopIdleTimer();
    resetCard();
    finaleEl.innerHTML = '';

    const n = level().letters.length;
    const row = levelRow(n);
    /* NO LINE HERE. The sheet's level-completion cells describe only what
       happens — "3/3 → READY TO POST → envelope → mailbag" — and give the
       coach nothing to say, so "Level N complete. Every letter is ready to
       post!" was mine. The panel keeps the read-back of the letter that
       finished the level, which is the last thing the sheet does put in it. */
    coach(null, 'delighted');

    /* The row arrives PLAIN. READY TO POST is step 2, and a card that already
       wore it on the way in would make step 2 nothing to watch. */
    const cards = row.map((v) => {
      const box = envBox(v.cx, v.cy, v.w);
      const d = envCard('fin', 'Sealed letter, ready to post');
      place(d, box);
      finaleEl.appendChild(d);
      return { el: d, box: box };
    });

    /* the whole set joins the pile at once, and only once it is franked —
       which is what makes the hand-off invisible: the cards land on the boxes
       the pile is about to draw, then the pile draws them */
    const landed = () => {
      if (stale(g0)) return;
      S.posted += n;
      renderMailbag(S.posted);
      finaleEl.innerHTML = '';
    };

    if (reduced()) {
      cards.forEach((c) => {
        c.el.style.opacity = '1';
        c.el.querySelector('.fin-seal').style.opacity = '0.95';
      });
      emit('letter:seal:stamp', { level: level().id });
      await wait(T.holdMs);
      landed();
      await wait(T.bagHoldMs);
      return stale(g0) ? null : advanceLevel();
    }

    /* 1. each letter arcs down out of the HUD mark that recorded it */
    await Promise.all(cards.map((c, i) => {
      const p = ontoBox(c.box, pipBox(i));
      return wait(i * T.stagger).then(() => {
        c.el.style.opacity = '1';
        /* the lift is POSITIVE here: the letters are coming DOWN out of the
           HUD, so the control point sits below the straight line and the card
           drops first and slides into the row, instead of bowing back up
           towards the corner it just left */
        return anim(c.el, arcFrames({ x: p.x, y: p.y, s: p.s, rot: -8 }, { x: 0, y: 0, s: 1, rot: 0 },
                                    u(70), bezier(0.22, 0.8, 0.28, 1), 18), D(T.flyMs), 'linear');
      }).then(() => { c.el.style.transform = ''; });
    }));
    await wait(T.settleMs);

    /* 2. and then each is stamped, left to right, so the row reads as a
     *    batch being franked rather than as one picture fading up */
    await Promise.all(cards.map((c, i) => wait(i * T.sealStagger).then(() => {
      emit('letter:seal:stamp', { level: level().id, index: i });
      deskShift();
      const sl = c.el.querySelector('.fin-seal');
      return Promise.all([
        anim(sl, [{ opacity: 0, transform: 'scale(1.7) rotate(-16deg)' },
                  { opacity: 1, transform: 'scale(.96) rotate(-8deg)', offset: 0.62 },
                  { opacity: 0.95, transform: 'scale(1) rotate(-8deg)' }],
             D(T.sealMs), TIMING.ease.thump),
        anim(c.el, [{ transform: tf({ s: 1 }) },
                    { transform: tf({ s: 0.985 }), offset: 0.45 },
                    { transform: tf({ s: 1 }) }], D(T.sealMs), TIMING.ease.thump)
      ]);
    })));

    /* the row holds until the level-complete line has been said, so the next
       level never loads over the top of it */
    await Promise.all([wait(T.holdMs), coachSpoken()]);

    /* 3. and the franked set goes onto the outgoing pile, bottom right. Each
     *    card lands on the exact box its pile slot will occupy, so when the
     *    pile redraws underneath and these are removed, nothing jumps — see
     *    bagSlot(). The row used to just fade upwards, which left the set
     *    with nowhere to have gone. */
    /* They land on the TOP of the finished pile, not on its first slots: once
       the pile is at its full depth the newest letters are the ones showing,
       and landing on slots 0..n-1 left the deepest slot popping into being
       from nowhere the moment the pile redrew. */
    const first = Math.max(0, Math.min(S.posted + n, BAG_SLOTS) - n);
    await Promise.all(cards.map((c, i) => {
      const slot = first + i;
      const b = ontoBox(c.box, bagSlot(slot));
      /* it must come to rest SQUARE, at the pile's own scale and angle: the
         pile draws its envelopes unrotated, and anything left over here would
         show as a jump the moment the pile redraws underneath */
      return wait(i * T.outStagger).then(() =>
        anim(c.el, arcFrames({ x: 0, y: 0, s: 1, rot: 0 }, { x: b.x, y: b.y, s: b.s, rot: 0 },
                             -u(110), bezier(0.3, 0.7, 0.3, 1), 18), D(T.outMs), 'linear')
      ).then(() => {
        c.el.style.opacity = String(bagOpacity(slot));
        return anim(c.el, [{ transform: tf({ x: b.x, y: b.y, s: b.s * 1.06 }) },
                           { transform: tf({ x: b.x, y: b.y, s: b.s }) }],
                    D(T.landMs), TIMING.ease.thump);
      });
    }));
    landed();
    /* The stack is the last thing the level shows, and the next level clears
       it — without this beat it would exist for a single frame. */
    await wait(T.bagHoldMs);
    return stale(g0) ? null : advanceLevel();
  }

  /* =================================================================== */
  /* 9. finale                                                           */
  /* =================================================================== */

  async function stFinale() {
    const T = TIMING.finale;
    lockStamps(true);
    stopIdleTimer();
    /* Also no line. Screen 24's own account of the ending is "Pari reads
       entire corrected letter → strong success chime → ... → READY TO POST",
       and `seal` has already done the reading. */
    coach(null, 'delighted');

    if (!reduced()) {
      await anim(world, [{ transform: 'scale(1)' }, { transform: `scale(${T.pullbackScale})` }],
                 D(T.pullbackMs), TIMING.ease.standard);
    }
    finaleEl.innerHTML = '';
    const from = L.outboxVis;

    await Promise.all(L.finaleVis.map((v, i) => {
      const box = envBox(v.cx, v.cy, v.w);
      const d = envCard('fin', 'Sealed letter, ready to post');
      place(d, box);
      finaleEl.appendChild(d);

      const p = ontoBox(box, envBox(from.cx, from.cy, from.w));
      if (reduced()) {
        d.style.opacity = '1';
        d.querySelector('.fin-seal').style.opacity = '0.95';
        return Promise.resolve();
      }
      return wait(i * T.stagger).then(() => {
        d.style.opacity = '1';
        return anim(d, arcFrames({ x: p.x, y: p.y, s: p.s, rot: 8 }, { x: 0, y: 0, s: 1, rot: 0 },
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
    'deal':        stDeal,     /* 2  a sheet arcs in, whole            700ms */
    'read':        stRead,     /* 3  text appears, uncorrected         350ms */
    'await-input': stAwait,    /* 4  drag or tap; any target, any order      */
    'stamp':       stStamp,    /* 5  press + ink, or reject + nudge    450ms */
    'seal':        stSeal,     /* 6  letter away, or READY TO POST     900ms */
    'post':        stPost,     /* 7  fill the mark; fly to the mailbag 600ms */
    'levelup':     stLevelUp,  /* 8  the level's letters, sealed      ~3.4s */
    'finale':      stFinale    /* 9  after the final letter           1200ms */
  };

  let generation = 0, driving = false;

  function go(name) {
    S.name = name;
    generation++;
    cancelPick();
    stopIdleTimer();
    /* a queued line belongs to the screen that queued it — without this a
       jump or a restart lets it surface over the next one */
    clearCoachQueue();
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
    /* an empty corner, like any freshly started level — the pile is this
       level's own, and this level has posted nothing yet */
    S.posted = 0;
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
      audio: Audio_, vo: VO,
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
      /* test hook: fire the stall cue now instead of waiting out the real
         nine seconds twenty-four times over */
      nudge: () => { onIdle(); },
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
