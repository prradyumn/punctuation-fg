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
    /* `toScale`, `toRot` and `toOpacity` described the arc to the pile that a
       level's last letter used to fly. Every letter now lifts and fades the
       same way and nothing reads them — see stPost. */
    pipPopMs: 260
  },

  /* --- 8. levelup — the level's letters line up and are sealed -------- */
  levelup: {
    flyMs: 520,               /* each letter down out of its HUD mark */
    /* NO STAGGER ON THE WAY IN — see stLevelUp step 1. The HUD marks all sit
       at the same height and are drawn the same size, so letters released
       together stay level with each other for the whole flight and the row
       reads as a row from the first frame. A 150ms stagger used to offset them,
       and because they then sat at different points along identical arcs they
       were at different heights AND different sizes at every instant: three
       envelopes climbing a staircase. The stagger belongs to the franking,
       which does not move them. */
    stagger: 0,
    settleMs: 300,            /* a beat with the row complete         */
    sealStagger: 200,         /* then each takes its READY TO POST    */
    sealMs: 260,
    holdMs: 900,              /* the row is read before it goes       */
    outMs: 420,               /* and lands on the outgoing pile       */
    /* NO STAGGER ON THE WAY OUT EITHER, for the same reason as `stagger`
       above: the franked row is one thing and it leaves as one thing. At 110ms
       apart the three were a descending staircase for the whole flight —
       measured at 368 design px between the highest and the lowest — which is
       the row falling apart at the last moment, right after two beats spent
       building it. They still land on the pile's own stacked slots, so the
       small offset that remains at rest is the pile's look, not a stagger. */
    outStagger: 0,
    landMs: 160,
    bagHoldMs: 750            /* the stack is read before it clears   */
  },

  /* --- 9. finale ------------------------------------------------------ */
  finale: {
    total: 1200,
    pullbackMs: 400, pullbackScale: 0.94,
    stagger: 140,
    flyMs: 520,
    holdMs: 900               /* the three sealed letters are read, then the film */
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

/* ==================================================================== *
 * INCORRECT FEEDBACK — "The Punctuation Puzzle - Incorrect Feedback"
 *
 * This table is the source of truth for what a miss does, on every screen
 * except the practice set (the tutorial, which has no failure state — see
 * reject()). It replaced the per-screen patchwork the earlier gameplay
 * sheet described, and its shape is the same on all twenty-three screens:
 *
 *   Error 1  line "Oops! Try again."   the stamp wobbles and bounces back
 *                                      onto the tray. Nothing on the paper.
 *   Error 2  a ONE-LAYER HINT          the relevant unresolved area pulses
 *                                      and glows softly, and the tray gives
 *                                      one general pulse — no individual
 *                                      stamp is highlighted.
 *   Error 3  a DIRECT INSTRUCTION      the unresolved location AND the stamp
 *                                      that fixes it pulse and glow strongly,
 *                                      then the hand carries the stamp there.
 *
 * So `e1` now defaults to the one line every screen shares, and `e3` — silent
 * on the old sheet — is stated on every screen. Three things the old sheet
 * asked for are gone with it: the nine screens that pointed at the stamp and
 * never at the paper (`markOnly`), the three that showed a ghost impression of
 * the answer (`ghost`), and the seventeen whose second miss was a line with no
 * animation at all.
 *
 * `w2` says WHICH AREA the second miss lights; `w2Words` names the words for
 * the list and direct-address screens. See hintArea().
 *
 * `each` carries per-target lines for the two screens whose repairs are
 * different questions: 4D, one sentence each, and the Final Letter, whose
 * eight cells the table writes out one by one.
 *
 * `idle` IS AUTHORED BUT NOT SPOKEN — a stall says nothing new, see onIdle()
 * and the README. It has no default, so a screen the sheet leaves wordless
 * has none rather than silently inheriting another screen's line. */
function lines(o) {
  return Object.assign({ e1: 'Oops! Try again.', e2: 'Something still needs fixing.',
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
        /* "Beginning and end pulse/glow softly. Stamp tray gives one general
           pulse; no individual stamp is highlighted." */
        w2: 'ends',
        stall: { stamps: 'all', text: 'ends' },
        praise: 'Great! A sentence begins with a capital letter.',
        say: lines({ e2: 'Check the beginning and end. Choose the stamps that fix them.',
                     e3: 'Make ‘i’ a capital ‘I’ and put a full stop at the end.' })
      }),
      letter('1B', '^we made hot samosas [.]', ['caps', 'period'], {
        read: 'We made hot samosas.', prosody: 'statement',
        w2: 'ends',
        stall: { text: 'ends' },
        praise: "That's right! The sentence now begins and ends correctly.",
        say: lines({ e2: 'Check the beginning and end. Choose the stamps that fix them.',
                     e3: 'Make ‘we’ begin with a capital ‘W’ and put a full stop at the end.',
                     idle: 'Look at the beginning and end of the sentence.' })
      }),
      letter('1C', '^the fair was very busy [.]', ['caps', 'period'], {
        read: 'The fair was very busy.', prosody: 'statement',
        w2: 'ends',
        stall: { text: 'ends' },
        praise: 'Well done! You fixed the beginning and end of the sentence.',
        say: lines({ e2: 'Something is wrong at the beginning and end. Fix them.',
                     e3: 'Make ‘the’ begin with a capital ‘T’ and put a full stop at the end.',
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
        /* "Sentence end pulses/glows. Entire tray gives one subtle pulse." */
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: "That's right! We use a question mark at the end of a question.",
        say: lines({ e2: 'This sentence is asking something. Choose the stamp that shows this at the end.',
                     e3: 'It is asking a question. Put the question mark at the end.',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2B', 'I hope you are well [.]', ['period', 'question'], {
        read: 'I hope you are well.', prosody: 'statement',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence tells something, so it ends with a full stop.',
        say: lines({ e2: 'This sentence is telling something. Choose the stamp that ends it.',
                     e3: 'It is telling something. Put the full stop at the end.',
                     idle: 'Is the writer telling us something or asking something?' })
      }),
      letter('2C', 'Did you get my last letter [?]', ['period', 'question'], {
        read: 'Did you get my last letter?', prosody: 'question',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Great! This sentence asks a question, so it ends with a question mark.',
        say: lines({ e2: 'This sentence is asking something. Choose the stamp that shows this at the end.',
                     e3: 'It is asking a question. Put the question mark at the end.',
                     idle: 'Is the writer telling us something or asking something?' })
      })
    ]
  },

  {
    id: 'L3', label: 'Level 3', numeral: 3, focus: 'Statement vs exclamation',
    letters: [
      letter('3A', 'What a wonderful gift [!]', ['period', 'exclamation'], {
        read: 'What a wonderful gift!', prosody: 'exclamation', doodle: 'gift',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: "That's it! An exclamation mark goes at the end to show a strong feeling.",
        say: lines({ e2: 'This sentence shows a strong feeling. Choose the stamp that shows this at the end.',
                     e3: 'It shows a strong feeling. Put the exclamation mark at the end.',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3B', 'I will come on Sunday [.]', ['period', 'exclamation'], {
        read: 'I will come on Sunday.', prosody: 'statement', calm: true,
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence tells something, so it ends with a full stop.',
        say: lines({ e2: 'This sentence is telling something. Choose the stamp that ends it.',
                     e3: 'It is telling something. Put the full stop at the end.',
                     idle: 'Is this ordinary information or a strong feeling?' })
      }),
      letter('3C', 'We won the match [!]', ['period', 'exclamation'], {
        read: 'We won the match!', prosody: 'exclamation', confetti: true, doodle: 'trophy',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Great! The exclamation mark shows the excitement of winning the match!',
        say: lines({ e2: 'This sentence shows excitement. Choose the stamp that shows this at the end.',
                     e3: 'It shows a strong feeling. Put the exclamation mark at the end.',
                     idle: 'Is this ordinary information or a strong feeling?' })
      })
    ]
  },

  {
    id: 'L4', label: 'Level 4', numeral: 4, focus: 'Choose among all end marks',
    letters: [
      /* THIS LEVEL HAS THREE SCREENS, NOT FOUR. It used to open with "I reached
         home safely." — the statement case — and that screen is gone. It was
         also the one screen with no row of its own in the incorrect-feedback
         table, whose level-4 rows are "asking", "excitement" and the
         three-sentence letter; its labels are one step behind this game's, so
         the table's 4A is the question below, its 4B is the kite, and its 4C is
         the puppy letter (4D here). Removing the statement screen settles that:
         every screen in the level now maps to exactly one row.

         The ids keep their letters — 4B, 4C, 4D — so the table, the VO
         filenames and the level-jump nav all still line up. The HUD draws a
         mark per letter, so the level simply shows three. */
      letter('4B', 'Can you come tomorrow [?]', ['period', 'question', 'exclamation'], {
        read: 'Can you come tomorrow?', prosody: 'question',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Correct! This sentence asks a question, so a question mark fits at the end.',
        say: lines({ e2: 'This sentence is asking something. Choose the right stamp for the end.',
                     e3: 'It is asking a question. Put the question mark at the end.',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      letter('4C', 'Look at that huge kite [!]', ['period', 'question', 'exclamation'], {
        read: 'Look at that huge kite!', prosody: 'exclamation', doodle: 'kite',
        w2: 'end',
        stall: { stamps: 'all', text: false },
        praise: 'Great! The exclamation mark shows the excitement about the huge kite!',
        say: lines({ e2: 'This sentence shows excitement. Choose the right stamp for the end.',
                     e3: 'It shows a strong feeling. Put the exclamation mark at the end.',
                     idle: 'Is it telling, asking, or showing a strong feeling?' })
      }),
      /* first multi-sentence letter — three independent targets, any order, and
         the table gives each of the three its own pair of lines: "End of puppy
         pulses", "End of him pulses", "End of excited pulses". */
      letter('4D', 'I have a new puppy [.] // Do you want to meet him [?] // I am so excited [!]',
             ['period', 'question', 'exclamation'], {
        read: 'I have a new puppy. Do you want to meet him? I am so excited!',
        prosody: 'mixed',
        glowDone: true,   /* the sheet's completion beat */
        w2: 'end',
        each: [
          { e2: 'This sentence is telling something. Choose the right stamp for the end.',
            e3: 'It is telling something. Put a full stop at the end.' },
          { e2: 'This sentence is asking something. Choose the right stamp for the end.',
            e3: 'It is asking a question. Put the question mark at the end.' },
          { e2: 'This sentence shows excitement. Choose the right stamp for the end.',
            e3: 'It shows excitement. Put the exclamation mark at the end.' }
        ],
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
        /* "List items pulse one after another; required gap pulses softly." */
        w2: 'list', w2Words: ['crayons', 'storybooks', 'stickers'],
        praise: "That's it! A comma separates different items in a list.",
        say: lines({ e2: 'These are different things in a list. Choose the stamp that separates them.',
                     e3: 'Put a comma after ‘crayons’ to separate the items.',
                     idle: 'Which words are separate things in the list?' })
      }),
      /* 5A-5C all arrive WITH their full stop already in place: the sheet's
         shown text and expected answer differ only by the commas, so the
         period stamp sits in the tray with nothing to do — which is the sheet's
         own tray ("`,` `.`"), not an oversight here. */
      letter('5B', 'We saw monkeys [,] parrots and rabbits at the fair.', ['comma', 'period'], {
        read: 'We saw monkeys, parrots and rabbits at the fair.', prosody: 'list',
        doodle: 'list-animals',
        w2: 'list', w2Words: ['monkeys', 'parrots', 'rabbits'],
        praise: 'Great! The comma separates the animals in the list.',
        say: lines({ e2: 'These animals form a list. Choose the stamp that separates them.',
                     e3: 'Put a comma after ‘monkeys’ to separate the animals.',
                     idle: 'Which words are separate things in the list?' })
      }),
      letter('5C', 'Please send crayons [,] storybooks [,] stickers and a ball.', ['comma', 'period'], {
        read: 'Please send crayons, storybooks, stickers and a ball.', prosody: 'list',
        doodle: 'list-four',
        /* "unresolved gaps pulse softly" — plural, so both commas light while
           either is outstanding, and the hand still shows only the one missed */
        w2: 'list', w2Words: ['crayons', 'storybooks', 'stickers', 'ball'],
        praise: 'Well done! The commas separate the different things in the list.',
        say: lines({ e2: 'These things form a list. Choose the stamp that separates them.',
                     e3: 'Put commas after ‘crayons’ and ‘storybooks’ to separate the items.',
                     idle: 'Which words are separate things in the list?' })
      })
    ]
  },

  {
    id: 'L6', label: 'Level 6', numeral: 6, focus: 'Comma changes meaning / direct address',
    letters: [
      letter('6A', "^let's eat [,] Dadi!", ['caps', 'comma'], {
        read: "Let's eat, Dadi!", prosody: 'exclamation', doodle: 'dadi', comic: true,
        /* "Dadi pulses; space before Dadi glows softly; tray pulses once." */
        w2: 'name', w2Words: ['Dadi'],
        praise: 'The comma shows that you are speaking to Dadi, not eating her!',
        say: lines({ e2: 'You are speaking to Dadi. Choose the stamp that separates her name.',
                     e3: 'You are speaking to Dadi. Put a comma before ‘Dadi’.',
                     idle: 'Does this sentence say what the writer means?' })
      }),
      letter('6B', 'I miss you [,] Nani!', ['comma', 'period'], {
        read: 'I miss you, Nani!', prosody: 'exclamation', doodle: 'nani',
        w2: 'name', w2Words: ['Nani'],
        praise: 'The comma shows that you are telling Nani that you miss her.',
        say: lines({ e2: 'You are speaking to Nani. Choose the stamp that separates her name.',
                     e3: 'You are speaking to Nani. Put a comma before ‘Nani’.',
                     idle: 'Who is the writer speaking to?' })
      }),
      letter('6C', '^see you soon [,] Raju!', ['caps', 'comma'], {
        read: 'See you soon, Raju!', prosody: 'exclamation', doodle: 'raju',
        w2: 'name', w2Words: ['Raju'],
        praise: "The comma shows that you are telling Raju that you'll see him soon.",
        say: lines({ e2: 'You are speaking to Raju. Choose the stamp that separates his name.',
                     e3: 'You are speaking to Raju. Put a comma before ‘Raju’.',
                     idle: 'Who is the writer speaking to?' })
      })
    ]
  },

  {
    id: 'L7', label: 'Level 7', numeral: 7, focus: 'Mixed: capital + end punctuation',
    letters: [
      letter('7A', '^where is my red scarf [?]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'Where is my red scarf?', prosody: 'question',
        w2: 'ends',
        praise: 'Great! The sentence begins with a capital letter and ends as a question.',
        say: lines({ e2: 'Fix how the sentence begins and how the question ends.',
                     e3: 'Make ‘where’ begin with a capital ‘W’ and put a question mark at the end.',
                     idle: 'Can you spot what needs fixing?' })
      }),
      letter('7B', '^what a beautiful card [!]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'What a beautiful card!', prosody: 'exclamation', doodle: 'card',
        w2: 'ends',
        praise: "That's right! The sentence begins with a capital letter and ends with excitement.",
        say: lines({ e2: 'Fix how the sentence begins and how the excitement ends.',
                     e3: 'Make ‘what’ begin with a capital ‘W’ and put an exclamation mark at the end.',
                     idle: 'Can you spot what needs fixing?' })
      }),
      letter('7C', '^i will write again soon [.]', ['caps', 'period', 'question', 'exclamation'], {
        read: 'I will write again soon.', prosody: 'statement',
        w2: 'ends',
        praise: "That's right! The sentence begins with a capital letter and ends as a statement.",
        say: lines({ e2: 'Fix how the sentence begins and how the statement ends.',
                     e3: 'Make ‘i’ a capital ‘I’ and put a full stop at the end.',
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
        /* "Only the current unresolved section/target area pulses." */
        w2: 'sentence',
        /* The table writes this screen's third-error instruction out one repair
           at a time, in the order the letter is authored: capital, full stop,
           comma, full stop, capital, question mark, capital, exclamation. */
        each: [
          { e3: 'Make ‘i’ a capital ‘I’.' },
          { e3: 'Put a full stop after ‘fair’.' },
          { e3: 'Put a comma after ‘monkeys’.' },
          { e3: 'Put a full stop after ‘rabbits’.' },
          { e3: 'Make ‘did’ begin with a capital ‘D’.' },
          { e3: 'Put a question mark after ‘too’.' },
          { e3: 'Make ‘it’ begin with a capital ‘I’.' },
          { e3: 'Put an exclamation mark after ‘amazing’.' }
        ],
        stall: { text: 'letter' },
        praise: 'Excellent! Capital letters and punctuation make the whole letter clear and easy to read.',
        say: lines({ e2: 'Look at this part. Choose the stamp that fixes it.',
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
      targets.push({ id: 't' + targets.length, index: targets.length,
                     at: text.length, kind: 'punctuate',
                     char: m[1], stamp: MARK[m[1]], sentence: sIndex, errors: 0, done: false });
      return;
    }
    if (text.length && !text.endsWith(' ')) text += ' ';
    if (tok.charAt(0) === '^') {
      tok = tok.slice(1);
      targets.push({ id: 't' + targets.length, index: targets.length,
                     at: text.length, kind: 'capitalise',
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
    /* PLAY on the cover. The art was drawn on its own 1920x1080 canvas with
       this box centred horizontally (centre x 959 against the stage's 960) and
       74 design px below the middle; the file is cropped to exactly that box,
       so the width and height are the art's own.
       It sits LOWER than the art placed it. At the drawn y of 493 the button
       landed square on the word "PUZZLE" and hid most of it. The letters —
       bodies, legs, feet and shadows — end at y 900 in this column, so 820
       drops the button's pill into the clear sand below them while keeping 17px
       under its glow. Raise or lower it by changing this one number. */
    play: { x: 665, y: 820, w: 588, h: 243 },
    /* PLAY again, over the one drawn into the opening film's last frame, where
       the children are pointing at it. Measured from that frame: its green pill
       occupies x 794..1081, y 922..1007. Our art carries its own glow, so the
       box is sized so OUR pill lands on THEIRS — 348 wide puts it at 287px,
       and the glow then covers the drawn button's own. */
    introPlay: { x: 757, y: 896, w: 348, h: 144 },
    finaleVis: [
      { cx: 499, cy: 470, w: 442 },
      { cx: 960, cy: 470, w: 442 },
      { cx: 1421, cy: 470, w: 442 }
    ],
    /* generous drop zone around a target — touch-sized for children */
    /* Drop zones and the magnetic pull are sized for a CHILD'S AIM, not for the
     * glyph: both are deliberately far larger than the mark they stand for,
     * and the snap reaches well past the zone itself. They were still too
     * mean — a stamp had to be brought almost onto the mark before it would
     * take, which is a fine-motor test the game is not trying to set.
     *
     * They can be this generous because a drop resolves by NEAREST CENTRE, not
     * by which box was hit: the zones overlap freely (the closest pair of
     * targets in the game, in the Final Letter, is 65 design px apart) and the
     * right one still wins as long as the pointer is nearer to it than to any
     * other. The visible highlight is sized separately — see .hit::before —
     * so none of this widens what the player sees. */
    hit: { w: 180, h: 150 },
    snapRadius: 220
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
    "Check the beginning and end. Choose the stamps that fix them.": "check-the-beginning-and-end-choose-the-stamps-that-fix-them",
    "Check the letter carefully. What still needs fixing?": "check-the-letter-carefully-what-still-needs-fixing",
    "Correct! This sentence asks a question, so a question mark fits at the end.": "correct-this-sentence-asks-a-question-so-a-question-mark-fits-at-the-end",
    "Correct! This sentence tells something, so it ends with a full stop.": "correct-this-sentence-tells-something-so-it-ends-with-a-full-stop",
    "Dear Raju, I went to the fair. I saw monkeys, parrots and rabbits. Did you go too? It was amazing!": "dear-raju-i-went-to-the-fair-i-saw-monkeys-parrots-and-rabbits-did-you-go-too-it-was-amazing",
    "Did you get my last letter?": "did-you-get-my-last-letter",
    "Does this sentence say what the writer means?": "does-this-sentence-say-what-the-writer-means",
    "Excellent! Capital letters and punctuation make the whole letter clear and easy to read.": "excellent-capital-letters-and-punctuation-make-the-whole-letter-clear-and-easy-to-read",
    "Excellent! You gave each sentence the ending that matches what it says.": "excellent-you-gave-each-sentence-the-ending-that-matches-what-it-says",
    "Fix how the sentence begins and how the excitement ends.": "fix-how-the-sentence-begins-and-how-the-excitement-ends",
    "Fix how the sentence begins and how the question ends.": "fix-how-the-sentence-begins-and-how-the-question-ends",
    "Fix how the sentence begins and how the statement ends.": "fix-how-the-sentence-begins-and-how-the-statement-ends",
    "Fix the sentence with the stamps.": "fix-the-sentence-with-the-stamps",
    "Great! A sentence begins with a capital letter.": "great-a-sentence-begins-with-a-capital-letter",
    "Great! The comma separates the animals in the list.": "great-the-comma-separates-the-animals-in-the-list",
    "Great! The exclamation mark shows the excitement about the huge kite!": "great-the-exclamation-mark-shows-the-excitement-about-the-huge-kite",
    "Great! The exclamation mark shows the excitement of winning the match!": "great-the-exclamation-mark-shows-the-excitement-of-winning-the-match",
    "Great! The sentence begins with a capital letter and ends as a question.": "great-the-sentence-begins-with-a-capital-letter-and-ends-as-a-question",
    "Great! This sentence asks a question, so it ends with a question mark.": "great-this-sentence-asks-a-question-so-it-ends-with-a-question-mark",
    "I am coming to visit you.": "i-am-coming-to-visit-you",
    "I have a new puppy. Do you want to meet him? I am so excited!": "i-have-a-new-puppy-do-you-want-to-meet-him-i-am-so-excited",
    "I hope you are well.": "i-hope-you-are-well",
    "I miss you, Nani!": "i-miss-you-nani",
    "I will come on Sunday.": "i-will-come-on-sunday",
    "I will visit you soon.": "i-will-visit-you-soon",
    "I will write again soon.": "i-will-write-again-soon",
    "Is it telling, asking, or showing a strong feeling?": "is-it-telling-asking-or-showing-a-strong-feeling",
    "Is the writer telling us something or asking something?": "is-the-writer-telling-us-something-or-asking-something",
    "Is this ordinary information or a strong feeling?": "is-this-ordinary-information-or-a-strong-feeling",
    "It is asking a question. Put the question mark at the end.": "it-is-asking-a-question-put-the-question-mark-at-the-end",
    "It is telling something. Put a full stop at the end.": "it-is-telling-something-put-a-full-stop-at-the-end",
    "It is telling something. Put the full stop at the end.": "it-is-telling-something-put-the-full-stop-at-the-end",
    "It shows a strong feeling. Put the exclamation mark at the end.": "it-shows-a-strong-feeling-put-the-exclamation-mark-at-the-end",
    "It shows excitement. Put the exclamation mark at the end.": "it-shows-excitement-put-the-exclamation-mark-at-the-end",
    "Let's eat, Dadi!": "let-s-eat-dadi",
    "Let's fix one sentence at a time.": "let-s-fix-one-sentence-at-a-time",
    "Look at that huge kite!": "look-at-that-huge-kite",
    "Look at the beginning and end of the sentence.": "look-at-the-beginning-and-end-of-the-sentence",
    "Look at this part. Choose the stamp that fixes it.": "look-at-this-part-choose-the-stamp-that-fixes-it",
    "Make \u2018i\u2019 a capital \u2018I\u2019 and put a full stop at the end.": "make-i-a-capital-i-and-put-a-full-stop-at-the-end",
    "Make \u2018the\u2019 begin with a capital \u2018T\u2019 and put a full stop at the end.": "make-the-begin-with-a-capital-t-and-put-a-full-stop-at-the-end",
    "Make \u2018we\u2019 begin with a capital \u2018W\u2019 and put a full stop at the end.": "make-we-begin-with-a-capital-w-and-put-a-full-stop-at-the-end",
    "Make \u2018what\u2019 begin with a capital \u2018W\u2019 and put an exclamation mark at the end.": "make-what-begin-with-a-capital-w-and-put-an-exclamation-mark-at-the-end",
    "Make \u2018where\u2019 begin with a capital \u2018W\u2019 and put a question mark at the end.": "make-where-begin-with-a-capital-w-and-put-a-question-mark-at-the-end",
    "Oops! Try again.": "oops-try-again",
    "Pick the full-stop stamp and place it at the end.": "pick-the-full-stop-stamp-and-place-it-at-the-end",
    "Place the full-stop stamp at the end of the sentence.": "place-the-full-stop-stamp-at-the-end-of-the-sentence",
    "Please send crayons, storybooks, stickers and a ball.": "please-send-crayons-storybooks-stickers-and-a-ball",
    "Please send me crayons, storybooks and stickers.": "please-send-me-crayons-storybooks-and-stickers",
    "Put a comma after \u2018crayons\u2019 to separate the items.": "put-a-comma-after-crayons-to-separate-the-items",
    "Put a comma after \u2018monkeys\u2019 to separate the animals.": "put-a-comma-after-monkeys-to-separate-the-animals",
    "Put commas after \u2018crayons\u2019 and \u2018storybooks\u2019 to separate the items.": "put-commas-after-crayons-and-storybooks-to-separate-the-items",
    "See you soon, Raju!": "see-you-soon-raju",
    "Something is wrong at the beginning and end. Fix them.": "something-is-wrong-at-the-beginning-and-end-fix-them",
    "That's it! A comma separates different items in a list.": "that-s-it-a-comma-separates-different-items-in-a-list",
    "That's it! An exclamation mark goes at the end to show a strong feeling.": "that-s-it-an-exclamation-mark-goes-at-the-end-to-show-a-strong-feeling",
    "That's it! The full stop shows where the sentence ends.": "that-s-it-the-full-stop-shows-where-the-sentence-ends",
    "That's right! The sentence begins with a capital letter and ends as a statement.": "that-s-right-the-sentence-begins-with-a-capital-letter-and-ends-as-a-statement",
    "That's right! The sentence begins with a capital letter and ends with excitement.": "that-s-right-the-sentence-begins-with-a-capital-letter-and-ends-with-excitement",
    "That's right! The sentence now begins and ends correctly.": "that-s-right-the-sentence-now-begins-and-ends-correctly",
    "That's right! We use a question mark at the end of a question.": "that-s-right-we-use-a-question-mark-at-the-end-of-a-question",
    "The comma shows that you are speaking to Dadi, not eating her!": "the-comma-shows-that-you-are-speaking-to-dadi-not-eating-her",
    "The comma shows that you are telling Nani that you miss her.": "the-comma-shows-that-you-are-telling-nani-that-you-miss-her",
    "The comma shows that you are telling Raju that you'll see him soon.": "the-comma-shows-that-you-are-telling-raju-that-you-ll-see-him-soon",
    "The fair was very busy.": "the-fair-was-very-busy",
    "These animals form a list. Choose the stamp that separates them.": "these-animals-form-a-list-choose-the-stamp-that-separates-them",
    "These are different things in a list. Choose the stamp that separates them.": "these-are-different-things-in-a-list-choose-the-stamp-that-separates-them",
    "These things form a list. Choose the stamp that separates them.": "these-things-form-a-list-choose-the-stamp-that-separates-them",
    "This sentence is asking something. Choose the right stamp for the end.": "this-sentence-is-asking-something-choose-the-right-stamp-for-the-end",
    "This sentence is asking something. Choose the stamp that shows this at the end.": "this-sentence-is-asking-something-choose-the-stamp-that-shows-this-at-the-end",
    "This sentence is telling something. Choose the right stamp for the end.": "this-sentence-is-telling-something-choose-the-right-stamp-for-the-end",
    "This sentence is telling something. Choose the stamp that ends it.": "this-sentence-is-telling-something-choose-the-stamp-that-ends-it",
    "This sentence needs a full stop.": "this-sentence-needs-a-full-stop",
    "This sentence shows a strong feeling. Choose the stamp that shows this at the end.": "this-sentence-shows-a-strong-feeling-choose-the-stamp-that-shows-this-at-the-end",
    "This sentence shows excitement. Choose the right stamp for the end.": "this-sentence-shows-excitement-choose-the-right-stamp-for-the-end",
    "This sentence shows excitement. Choose the stamp that shows this at the end.": "this-sentence-shows-excitement-choose-the-stamp-that-shows-this-at-the-end",
    "Try placing it at the end of the sentence.": "try-placing-it-at-the-end-of-the-sentence",
    "We made hot samosas.": "we-made-hot-samosas",
    "We saw monkeys, parrots and rabbits at the fair.": "we-saw-monkeys-parrots-and-rabbits-at-the-fair",
    "We won the match!": "we-won-the-match",
    "Well done! The commas separate the different things in the list.": "well-done-the-commas-separate-the-different-things-in-the-list",
    "Well done! You fixed the beginning and end of the sentence.": "well-done-you-fixed-the-beginning-and-end-of-the-sentence",
    "What a beautiful card!": "what-a-beautiful-card",
    "What a wonderful gift!": "what-a-wonderful-gift",
    "What is this sentence doing \u2014 telling, asking, or showing strong feeling?": "what-is-this-sentence-doing-telling-asking-or-showing-strong-feeling",
    "Where is my red scarf?": "where-is-my-red-scarf",
    "Which words are separate things in the list?": "which-words-are-separate-things-in-the-list",
    "Who is the writer speaking to?": "who-is-the-writer-speaking-to",
    "You are speaking to Dadi. Choose the stamp that separates her name.": "you-are-speaking-to-dadi-choose-the-stamp-that-separates-her-name",
    "You are speaking to Dadi. Put a comma before \u2018Dadi\u2019.": "you-are-speaking-to-dadi-put-a-comma-before-dadi",
    "You are speaking to Nani. Choose the stamp that separates her name.": "you-are-speaking-to-nani-choose-the-stamp-that-separates-her-name",
    "You are speaking to Nani. Put a comma before \u2018Nani\u2019.": "you-are-speaking-to-nani-put-a-comma-before-nani",
    "You are speaking to Raju. Choose the stamp that separates his name.": "you-are-speaking-to-raju-choose-the-stamp-that-separates-his-name",
    "You are speaking to Raju. Put a comma before \u2018Raju\u2019.": "you-are-speaking-to-raju-put-a-comma-before-raju"
  };

  const SFX_FILES = {
    thump:   'assets/sfx/thump.ogg',
    boop:    'assets/sfx/boop.ogg',
    chime:   'assets/sfx/chime.ogg',
    seal:    'assets/sfx/seal.ogg',
    whoosh:  'assets/sfx/whoosh.ogg',
    complete:'assets/sfx/complete.ogg',
    sparkle: 'assets/sfx/sparkle.ogg',
    pickup:  'assets/sfx/pickup.ogg',
    stamp:   'assets/sfx/stamp.ogg',
    ting:    'assets/sfx/ting.ogg'
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
    pickup:  ['triangle', 520, 700, 0.09, 0.20],
    /* the synthesised stand-ins track the real clips' measured character —
       a mid thock for the frank, a bright short ping for the progress mark */
    stamp:   ['triangle', 900, 420, 0.14, 0.42],
    ting:    ['sine',    2400,2900, 0.13, 0.20]
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
      /* NOT ARMED YET IS NOT A MISSING RECORDING. A browser refuses <audio>
       * until the first gesture, so playVo() cannot start — but speechSynthesis
       * is usually allowed without one, so falling through to it meant the
       * opening lines, the first thing a child ever hears, came out in a robot
       * voice while every line after the first tap was the real recording.
       * The line is held instead, and spoken properly as soon as sound is
       * allowed; the gate is released so nothing waits on a silence. */
      if (!this.armed) { this.endLine(); return; }
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
     * stalled <audio> or a synthesis engine that never fires `end` must not be
     * able to hold the game — the same rule the asset loader follows.
     * Resolves immediately when nothing is playing, which is what keeps a
     * muted run (and the suite) at full speed.
     *
     * THE CAP IS A STALL WATCHDOG, NOT A DEADLINE. It used to be a flat 8s from
     * the moment of asking, which quietly truncated every line longer than
     * that — and the two longest in the game are both on the Final Letter: its
     * praise runs 9.03s and its read-back 12.70s. So the read-back was cut off
     * 4.7s early and the letter lifted off the desk mid-sentence, which is the
     * one beat the whole letter exists for. A flat cap cannot tell "still
     * talking" from "hung"; playback POSITION can. While the clip's
     * currentTime is advancing the wait keeps extending, and the allowance is
     * only spent once nothing has moved — so a long line plays out in full and
     * a genuinely stalled one still releases after the same 8s of silence.
     *
     * Synthesis reports no position, so `speechSynthesis.speaking` stands in
     * for it: alive is alive. If the engine drops the utterance without firing
     * `end` — the failure this cap was written for — `speaking` goes false and
     * the allowance runs out as before. */
    whenSpoken(capMs) {
      if (!this.busy || !this.gate) return Promise.resolve();
      const allowMs = capMs == null ? 8000 : capMs;
      const STEP = 200;
      return Promise.race([this.gate, new Promise((res) => {
        let seen = -1, quiet = 0;
        const tick = () => {
          if (!this.busy) { res(); return; }
          const a = this.voice;
          let moving;
          if (a) {
            moving = a.currentTime > seen + 0.02;
            if (moving) seen = a.currentTime;
          } else {
            moving = 'speechSynthesis' in window && speechSynthesis.speaking;
          }
          quiet = moving ? 0 : quiet + STEP;
          if (quiet >= allowMs) { res(); return; }
          setTimeout(tick, STEP);
        };
        setTimeout(tick, STEP);
      })]);
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
    /* THE FRANK IS TWO SOUNDS, like the mark press above it: the stamp meeting
       the envelope, and then the low bong of it having taken. It used to be the
       bong alone — 86% of its energy below 500 Hz — which read as a soft thud
       and never as a stamp. Same shape as stamp:press, one beat shorter. */
    on('letter:seal:stamp', () => { Audio_.play('stamp');
                                 setTimeout(() => Audio_.play('seal'), 60); });
    on('letter:post',       () => Audio_.play('whoosh'));
    /* one bright ting per mark as the level's progress fills */
    on('hud:progress',      () => Audio_.play('ting'));
    on('set:complete',      () => Audio_.play('complete'));
    on('coach:read',         (e) => Audio_.speak(e.detail.text, e.detail.prosody));
    on('coach:say',          (e) => Audio_.speak(e.detail.text));
    on('audio:ready',        () => speakCurrentLine());
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

  /* THE LINE IS ALWAYS ONE ROW. The panel is `nowrap`, so a line too wide for
   * the design's 46 design px is SET SMALLER rather than wrapped: the size is
   * solved from the overflow in one step (widths scale linearly with font-size
   * for a given string) and then checked, because hinting and letter-spacing
   * make the first solve a hair optimistic.
   *
   * It used to be allowed two rows and clamp there, which was fine when the
   * longest line in the game was 67 characters. The incorrect-feedback table
   * made two rows the common case — its longest is 84 characters — and a panel
   * that changes height between lines moves the whole top band of the screen.
   *
   * The floor is 30 design px. Nothing in the content reaches it: the worst
   * line lands around 37. */
  const LINE_PX = 46, LINE_FLOOR = 30;
  function fitCoachLine() {
    coachLine.style.removeProperty('--line-size');
    if (!coachLine.textContent) return;
    const room = coachLine.clientWidth;
    if (!room) return;                     /* not laid out yet — relayout refits */
    let size = LINE_PX;
    for (let pass = 0; pass < 4; pass++) {
      const over = coachLine.scrollWidth - room;
      if (over <= 0) break;
      size = Math.max(LINE_FLOOR, size * room / coachLine.scrollWidth);
      coachLine.style.setProperty('--line-size', u(size) + 'px');
      if (size === LINE_FLOOR) break;
    }
  }

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
    fitCoachLine();
    coachEl.classList.add('live');
    /* the roundel ticks for as long as the line is fresh, so a new line is
       noticed without the text itself moving */
    tickBadge(text);
    if (sayEl && opts.announce !== false) sayEl.textContent = text;
    if (opts.speak !== false) {
      lastAsked = { text: text, prosody: null };
      emit('coach:say', { text, tone: coachEl.dataset.tone });
    }
    if (!reduced()) {
      anim(coachLine, [{ opacity: 0.35, transform: 'translate3d(0,4px,0)' },
                       { opacity: 1, transform: 'translate3d(0,0,0)' }], D(220), TIMING.ease.out);
    }
  }
  /* the coach reads the finished sentence; prosody is passed to the audio hook */
  /* the portrait ticks for as long as the line is fresh, so a new line — or
     the same line said again on a stall — is noticed without the text moving */
  function tickBadge(text) {
    coachEl.classList.remove('speaking');
    void coachEl.offsetWidth;                 /* restart the keyframes */
    coachEl.classList.add('speaking');
    clearTimeout(coachSpeakT);
    coachSpeakT = setTimeout(() => coachEl.classList.remove('speaking'),
                             Math.min(4000, 900 + text.length * 45));
  }

  function coachRead(letter) {
    coach(letter.read, 'pleased', { speak: false });   /* coach:read speaks it */
    lastAsked = { text: letter.read, prosody: letter.prosody };
    emit('coach:read', { text: letter.read, prosody: letter.prosody });
  }

  /* The line the coach last asked to have spoken. Sound is forbidden until the
   * first gesture, so the opening lines are held rather than synthesised (see
   * speak()) — and this is what lets them be said for real once it arrives. */
  let lastAsked = null;
  function speakCurrentLine() {
    if (!lastAsked) return;
    /* only if it is still the line on screen; by the time a child touches
       something the panel may have moved on, and speaking a line they can no
       longer read is worse than staying quiet */
    if (coachLine.textContent !== lastAsked.text) return;
    tickBadge(lastAsked.text);
    Audio_.speak(lastAsked.text, lastAsked.prosody);
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
   * areas, the drag snap points, and the hosts for the pulse and glow states —
   * so all target feedback lives in one place. */
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
      h.addEventListener('click', () => onTargetTap(t));
      /* Escalation state is DERIVED from the error counters, never stored on
       * the element: buildHits() runs after every press and on every resize, so
       * anything held only in a CSS class would be wiped the moment the zones
       * were rebuilt. reject() paints the same classes for the immediate beat;
       * this is what makes them survive. */
      const g = glowTier(t);
      if (g) h.classList.add(g === 'strong' ? 'glow-strong' : 'glow');
      targetsEl.appendChild(h);
      hits[t.id] = { el: h, cx, cy, target: t };
    });
    syncStampCues();
  }

  /* Which glow, if any, this target is owed right now.
   *
   * THE TUTORIAL DOES NOT ESCALATE — it is the practice set, outside the
   * incorrect-feedback table, and its own cell asks for one thing from the
   * first miss on: "End position glows more strongly".
   *
   * Everywhere else the table is uniform. Error 2 lights "the relevant
   * unresolved area" softly and error 3 lights "the exact unresolved location"
   * strongly. On the two screens whose second-error cell names BOTH ends of a
   * sentence or a whole list of gaps, the soft glow covers every unresolved
   * target in that sentence, not only the one that was missed. */
  function glowTier(t) {
    if (t.done) return null;
    if (isTutorial()) return t.errors >= 1 ? 'strong' : null;
    if (t.errors >= 3) return 'strong';
    if (t.errors >= 2) return 'soft';
    if (!w2SpansSentence()) return null;
    /* A NEIGHBOUR ONLY BORROWS THE SECOND ERROR'S GLOW, never the third's. Once
       anything in this sentence is at three the cell reads "only the required
       stamp and the exact unresolved location", so the area hint stands down
       and the one place that is being demonstrated is the only one lit. */
    const worst = S.letter.targets.reduce(
      (n, x) => (!x.done && x.sentence === t.sentence ? Math.max(n, x.errors) : n), 0);
    return worst === 2 ? 'soft' : null;
  }

  /* "Beginning and end pulse/glow softly" and "unresolved gaps pulse softly"
     are the two cells that mean more than the one target that was missed. */
  const w2SpansSentence = () =>
    S.letter.w2 === 'ends' || S.letter.w2 === 'list';

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
  /* 0. title, and the two films                                         */
  /* =================================================================== */
  /* The order is: cover art with PLAY -> the 1:05 film -> the game -> the 9s
   * film -> back to the cover. So the title card is both the way in and what
   * the ending returns to, which is why nothing needs a "play again" button of
   * its own any more.
   *
   * PLAY IS ALSO THE GESTURE THAT UNLOCKS SOUND. A browser refuses <audio>
   * until the page has been interacted with, so before this the first coach
   * line of the game was spoken by synthesis while every line after the first
   * tap was the real recording. Arming here means the game's own first line is
   * already allowed by the time it is said. */
  const titleEl = $('#title'), playBtn = $('#play');
  const movieEl = $('#movie'), filmEl = $('#film');

  /* ONE BUTTON, WAITED ON TWICE — on the cover, and on the film's last frame.
     `releasePlay` is whichever state is currently waiting for it. */
  let releasePlay = null;

  function showPlay(box) {
    place(playBtn, box);
    playBtn.hidden = false;
    return new Promise((res) => { releasePlay = res; });
  }
  function hidePlay() {
    playBtn.hidden = true;
    releasePlay = null;
  }

  /* ONLY THE BUTTON STARTS THE FILM. */
  function pressed() {
    Audio_.arm();
    if (releasePlay) { const r = releasePlay; releasePlay = null; r(true); }
  }
  playBtn.addEventListener('click', pressed);

  /* A TAP ANYWHERE ON THE COVER PLAYS THE TITLE LINE, and nothing else — the
   * card stays up and the film still waits for PLAY. So a child who taps the
   * girl, or the postbox, or the letters hears the game introduce itself, and
   * only the button commits them to starting.
   *
   * Played with a plain Audio element rather than through Audio_.speak(): that
   * path falls back to speech synthesis when a clip is missing, and a title
   * line spoken by a robot voice over the cover art would be worse than
   * silence. If the file is not there, nothing is heard.
   *
   * IT ALSO TRIES WITHOUT BEING ASKED. Sound is refused until a page has been
   * interacted with and no code changes that — but the policy is per-browser
   * and per-setting, and where it is relaxed the line should simply play. So
   * the cover asks with the real clip at its real volume and believes the
   * answer; if it is refused, the first tap does it instead. */
  const TITLE_VO = 'assets/vo/title.ogg';
  let titleAudio = null;

  function playTitleVo() {
    if (titleAudio && !titleAudio.paused && !titleAudio.ended) {
      return Promise.resolve(true);          /* already speaking; let it finish */
    }
    let a;
    try { a = new Audio(TITLE_VO); } catch (e) { return Promise.resolve(false); }
    a.volume = 0.95;
    titleAudio = a;
    const p = a.play();
    if (!p || !p.then) return Promise.resolve(false);
    return p.then(() => true).catch(() => false);
  }

  function stopTitleVo() {
    if (!titleAudio) return;
    try { titleAudio.pause(); } catch (e) {}
    titleAudio = null;
  }

  titleEl.addEventListener('click', () => {
    Audio_.arm();                            /* the gesture the game needs too */
    playTitleVo();
  });

  function hideOverlays() {
    titleEl.hidden = true;
    movieEl.hidden = true;
    hidePlay();
    stopFilm();
    stopTitleVo();
  }

  async function stTitle() {
    const g0 = generation;
    lockStamps(true);
    stopIdleTimer();
    resetCard();
    sentenceEl.style.opacity = '0';
    targetsEl.innerHTML = '';
    finaleEl.innerHTML = '';
    coach(null, 'neutral');
    coachEl.classList.remove('live');
    movieEl.hidden = true;
    titleEl.hidden = false;
    /* PLAY is NOT focused programmatically. Chrome treats a scripted focus on a
       fresh page as keyboard focus, so :focus-visible matched and the cover
       loaded with a focus ring around the button, held at its hover scale —
       which reads as a stuck hover, not as a starting state. It is the only
       interactive thing on the card, so Tab reaches it in one press.

       The wait is resolved by the click, or by go() with false, so a level jump
       or a restart from the title card is never deadlocked behind a button
       nobody is going to press. Same shape as stAwait's pick. */
    /* the title line, unasked; a tap does it if the browser said no */
    playTitleVo();

    const started = await showPlay(L.play);
    stopTitleVo();
    hidePlay();
    titleEl.hidden = true;
    if (!started) return null;
    return 'intro';
  }

  /* THE OPENING FILM ENDS ON ITS OWN CALL TO ACTION. Its last frame is the
   * children gathered round the desk pointing at a PLAY button drawn into the
   * picture — so the film stops there, on that frame, and our real button is
   * placed exactly over the drawn one. The game starts when it is pressed,
   * which keeps the film's own ending as the thing that invites the press.
   *
   * If the film could not play at all — no decoder, a missing file, a refused
   * autoplay — there is no frame to hold and no drawn button to point at, so
   * that path goes straight through to the desk rather than asking the player
   * to press PLAY over a black rectangle. */
  async function stIntro() {
    const how = await playFilm('assets/intro.mp4', true);
    if (how !== 'ended') {
      movieEl.hidden = true;
      stopFilm();
      /* PLAY was pressed to get here, so the page has certainly had a
         gesture: a refusal now means the file itself will not play, and the
         answer is to carry on to the desk rather than sit on black. */
      return 'idle';
    }
    const started = await showPlay(L.introPlay);
    hidePlay();
    movieEl.hidden = true;
    stopFilm();
    return started ? 'idle' : null;
  }

  async function stOutro() { await playFilm('assets/outro.mp4'); return 'title'; }

  /* Play one film to the end, and DO NOT LET IT PARK THE GAME. Three ways out:
   * it ends, it errors, or it stops making progress — the same stall-watchdog
   * rule the voice gate and the asset loader follow. A build with no H.264
   * decoder, a file that will not open, an autoplay refusal: all of them land
   * on "carry on" rather than on a black rectangle forever.
   *
   * `src` is set here rather than in the markup so `preload="none"` keeps 20MB
   * of video out of the boot payload, and cleared afterwards so the decoder and
   * the buffer are handed back. */
  const FILM_STALL_MS = 4000;
  let filmWatch = 0;

  function stopFilm() {
    filmWatch++;
    try { filmEl.pause(); } catch (e) {}
    filmEl.removeAttribute('src');
    try { filmEl.load(); } catch (e) {}
  }

  /* `hold` leaves the last frame on screen and the src loaded, for a film whose
     ending is a picture the player is meant to act on. Resolves with HOW it
     finished, so a caller can tell "played to the end" from "never played". */
  function playFilm(src, hold) {
    const run = ++filmWatch;
    movieEl.hidden = false;
    filmEl.src = src;
    return new Promise((res) => {
      let settled = false;
      const done = (how) => {
        if (settled || filmWatch !== run) return;
        settled = true;
        clearInterval(iv);
        if (!(hold && how === 'ended')) { movieEl.hidden = true; stopFilm(); }
        res(how);
      };
      filmEl.addEventListener('ended', () => done('ended'), { once: true });
      filmEl.addEventListener('error', () => done('error'), { once: true });
      /* progress, not a deadline: a 65-second film is not a stalled one. The
         watchdog is also why a held frame must not keep being polled — a paused
         video makes no progress, which is exactly what a stall looks like. */
      let seen = -1, quiet = 0;
      const iv = setInterval(() => {
        if (filmWatch !== run) { clearInterval(iv); return; }
        if (filmEl.currentTime > seen + 0.02) { seen = filmEl.currentTime; quiet = 0; }
        else quiet += 250;
        if (quiet >= FILM_STALL_MS) done('stalled');
      }, 250);
      const p = filmEl.play();
      if (p && p.catch) p.catch(() => done('error'));   /* refused, or no decoder */
    });
  }

  /* =================================================================== */
  /* 1. idle                                                             */
  /* =================================================================== */
  async function stIdle() {
    hideOverlays();
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
  /* Was the stamp's pad over the letter when it was let go? The card is the
     letter, and the margin is a stamp-pad's width of grace at its edges, so a
     drop that overlaps the paper at all counts as aimed at it. */
  const CARD_SLOP = 56;
  function onCard(pad) {
    if (!pad) return false;
    const c = L.card;
    return pad.x > c.x - CARD_SLOP && pad.x < c.x + c.w + CARD_SLOP
        && pad.y > c.y - CARD_SLOP && pad.y < c.y + c.h + CARD_SLOP;
  }

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
             /* cached so onStampMove can put the pointer in design px without a
                layout read on every move — see the two-point magnet there */
             st: stage.getBoundingClientRect(),
             wasArmed: armed && armedStamp === i };
    btn.classList.remove('bob');
    btn.classList.add('dragging');
    document.body.classList.add('dragging');
    arm(i);
    /* A RUNNING ANIMATION OUTRANKS AN INLINE STYLE, so anything still playing
     * on this stamp has to be stopped before the drag writes a transform.
     *
     * This is the `.bob` bug again, from the other direction. `bob` is a CSS
     * animation and removing the class kills it; the tray's attention pulse is
     * a Web Animations one, and no class controls it. stRead() fires
     * pulseStamps() and hands straight over to the player, so for the first
     * few hundred milliseconds of EVERY letter each stamp had a bounce in
     * flight — 600ms of it, plus up to 180ms of stagger delay, and `fill:
     * 'both'` means even the delay phase pins the property. Grab a stamp in
     * that window and every transform the drag wrote was silently discarded:
     * the stamp sat in the tray while the pointer moved away, with nothing to
     * show where the pad was. The snap still worked, because it is computed
     * from numbers rather than from what is on screen — so a placement could
     * succeed while nothing appeared to move, which is exactly what "I can
     * only place the stamp around the tolerance area" looks like from the
     * player's side.
     *
     * cancel() rather than finish(): anim()'s cancel path deliberately skips
     * commitStyles, so nothing of the bounce is left behind. */
    btn.getAnimations().forEach((a) => { try { a.cancel(); } catch (err) {} });
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

    /* THE MAGNET MEASURES FROM TWO POINTS: the pad, and the pointer itself.
     *
     * The pad is where the ink would land, so it is the honest one — but it
     * hangs below the hand, by however far up the stamp the player happened to
     * grab it, which for a press near the knob is about 160 design px. Measured
     * from the MARK, that put the catch area 360px above it and only 60px below:
     * aim at the mark with your finger and the pull is weakest exactly where
     * you are pointing. Taking whichever of the two is nearer means "put the
     * pad on the mark" and "put your finger on the mark" both work, and the
     * reach is never smaller than it was. */
    const pointerX = (e.clientX - drag.st.left) / U;
    const pointerY = (e.clientY - drag.st.top) / U;
    let best = null, bestD = Infinity;
    Object.keys(hits).forEach((k) => {
      const h = hits[k];
      const d = Math.min(Math.hypot(h.cx - padX, h.cy - padY),
                         Math.hypot(h.cx - pointerX, h.cy - pointerY));
      if (d < bestD) { bestD = d; best = h; }
    });
    const snapped = best && bestD < L.snapRadius ? best : null;
    drag.nearest = best;
    /* kept so onStampUp can ask WHERE the stamp was let go — a drop that never
       reached the letter is not an attempt at anything. See onCard(). */
    drag.pad = { x: padX, y: padY };
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
    /* A MISS HAS TO HAVE BEEN AN ATTEMPT. A drop somewhere ON THE LETTER but
     * not near enough to a target is a wrong answer: it owns an error, counted
     * against the nearest unresolved target so that target carries the
     * escalation, and the right stamp still cannot solve from the wrong place.
     *
     * A drop ANYWHERE ELSE — the desk, the tray, back where it started, a
     * change of mind halfway — is not a wrong answer and is not counted. It
     * used to be: any drag that moved more than six px and let go anywhere at
     * all was scored against the nearest target, so putting a stamp back cost
     * the same as guessing, and a child could climb to the third-error hand
     * without ever having aimed at the sentence.
     *
     * Pointer cancellation is not a learner mistake either. */
    if (dragMoved && (!e || e.type !== 'pointercancel') && d.nearest && onCard(d.pad)) {
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

    /* SAY IT AGAIN, don't say something new. A stall used to reach for fresh
     * words, which made a motionless screen read as though something had
     * happened; saying nothing at all left a child who had stopped listening
     * with only a silent pulse. Repeating the line that is already on screen
     * is the nudge without the new information — and it is the line they can
     * still read, so voice and panel never disagree. Skipped while something
     * is already being said, or the stall would cut it off. */
    if (!Audio_.busy) speakCurrentLine();

    /* THE PRACTICE SET GETS THE HAND WHEN IT GOES QUIET. It is the one screen
     * with no failure state, so a child who has stalled there has nothing to
     * learn from another repetition — they have not worked out what the gesture
     * IS. So the stall shows it: the line again, out loud, and the hand taking
     * the stamp to the end of the sentence. A real level's stall stays a cue
     * and keeps the hand for the third error, where it is earned. */
    if (isTutorial() && t) handHint(t);

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

  /* the last word of a sentence — the table's "sentence end", "End of puppy",
     "End of him", "End of excited" */
  function lastWordOfSentence(idx) {
    const ws = wordsOfSentence(idx);
    return ws.length ? [ws[ws.length - 1]] : [];
  }

  /* the words a screen names by hand — the items of a list, or the person being
     spoken to. Matched on letters only, because a rendered word carries its
     punctuation slot with it ("crayons," and "Dadi!"). */
  function namedWords(names) {
    if (!names || !names.length) return [];
    const bare = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = names.map(bare);
    return allWords().filter((w) => want.indexOf(bare(w.textContent)) !== -1);
  }

  /* the one word a target sits in, mark or capital alike */
  function wordOfTarget(t) {
    const el = marks[t.id] || charEls[t.at];
    return el ? el.closest('.wordwrap') : null;
  }

  function pulseWords(list) {
    list.filter(Boolean).forEach((w) => {
      w.classList.remove('pulse');
      w.style.animationDelay = '';      /* a sequential pulse may have left one */
      void w.offsetWidth;
      w.classList.add('pulse');
    });
  }

  /* "List items pulse ONE AFTER ANOTHER" — the same pulse, walked along the
     list, so it reads as the items being counted off rather than as the line
     twitching all at once. */
  function pulseWordsSeq(list, stepMs) {
    const step = stepMs == null ? 220 : stepMs;
    list.filter(Boolean).forEach((w, i) => {
      w.classList.remove('pulse');
      void w.offsetWidth;
      w.style.animationDelay = reduced() ? '0ms' : (i * step) + 'ms';
      w.classList.add('pulse');
      setTimeout(() => { w.style.animationDelay = ''; }, i * step + 2600);
    });
  }

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

  /* Bring every live zone up to date with what its counters say it is owed —
     the same derivation buildHits() runs, without rebuilding the zones. This
     is what reject() calls, so there is ONE rule for what glows and not a copy
     of it in the immediate feedback and another in the rebuild. */
  function paintGlows() {
    Object.keys(hits).forEach((k) => {
      const g = glowTier(hits[k].target);
      hits[k].el.classList.toggle('glow', g === 'soft');
      hits[k].el.classList.toggle('glow-strong', g === 'strong');
    });
  }

  /* WHICH WORDS PULSE at the second error, per the table's animation cell. */
  function hintArea(t) {
    const mode = S.letter.w2;
    if (mode === 'ends') pulseWords(endsOfSentence(t.sentence));           /* "beginning and end" */
    else if (mode === 'end') pulseWords(lastWordOfSentence(t.sentence));   /* "sentence end" */
    else if (mode === 'list') pulseWordsSeq(namedWords(S.letter.w2Words)); /* "one after another" */
    else if (mode === 'name') pulseWords(namedWords(S.letter.w2Words));    /* "Dadi pulses" */
    else pulseWords(wordsOfSentence(t.sentence));                          /* "this section" */
  }

  /* THE THIRD ERROR ALSO LIGHTS THE STAMP. Derived from the counters like the
     target glow is, so it survives a rebuild and clears when the repair lands
     — "only the required stamp", so nothing else in the tray is touched. */
  function syncStampCues() {
    if (!stampEls.length) return;
    const wanted = {};
    if (!isTutorial()) {
      S.letter.targets.forEach((t) => { if (!t.done && t.errors >= 3) wanted[t.stamp] = true; });
    }
    stampEls.forEach((b, i) => {
      b.classList.toggle('cue', !!wanted[stampSlots[i] && stampSlots[i].id]);
    });
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
  /* The supplied artwork, trimmed to its own ink: 61 x 75, with the fingertip
     at (20, 3). Those two fractions are the hot spot, and styles.css puts the
     transform origin on the same point — so a scale or a tilt pivots about the
     fingertip rather than about the middle of the hand. It replaced a hand
     drawn from four CSS rounded rectangles, whose box was 114 x 146. */
  const HAND = { w: 96, vbW: 61, vbH: 75, tipX: 20 / 61, tipY: 3 / 75 };
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

    /* A MISS NEVER TRAVELS, AND IT REFUSES BEFORE IT LEAVES. The sheet's order
     * is "stamp wobbles -> soft boop -> returns": the refusal happens where
     * the player put it, and only then does it go home. Two wrong versions
     * came before this one. First it was pulled to the target's exact hover
     * pose and wobbled THERE, so a stamp dropped in the wrong place appeared
     * to move itself to the right place before changing its mind. Then it went
     * home first and wobbled in the tray, which answered the wrong question —
     * by the time the shake arrived the stamp was nowhere near the mistake, so
     * nothing connected the refusal to the place it was refusing.
     *
     * The pose is read off the live transform rather than tracked, so it is
     * right for both paths: where the drag left it, or the tray for a tap that
     * never moved. */
    if (!ok) {
      emit('stamp:reject', { stamp: stampId, target: target.id });
      const m = new DOMMatrixReadOnly(getComputedStyle(btn).transform);
      const dropX = m.e, dropY = m.f, dropS = m.a || 1;
      await reject(btn, dropX, dropY, dropS, target);   /* refuse where it landed */
      if (!reduced()) {                                 /* and only then go home */
        await anim(btn, [{ transform: tf({ x: dropX, y: dropY, s: dropS }) },
                         { transform: tf({ x: 0, y: 0, s: 1 }) }],
                   D(T.returnMs * 0.7), TIMING.ease.standard);
      }
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

  /* The coaching line for a miss. Most screens state one line per tier for the
     whole letter; 4D and the Final Letter state one per repair, because their
     targets are different questions — see `each` in the content. */
  function lineFor(target, key) {
    const each = S.letter.each && S.letter.each[target.index];
    const own = each && each[key];
    return own == null ? S.letter.say[key] : own;
  }

  /* Three-tier escalation, counted PER TARGET, exactly as the incorrect-
   * feedback table lays it out — and one tier only in the practice set, which
   * the table does not cover and which has no failure state. */
  async function reject(btn, x, y, s, target) {
    const T = TIMING.reject;
    target.errors++;
    const tier = isTutorial() ? 1 : Math.min(target.errors, 3);

    /* THE FIRST ERROR PUTS NOTHING ON THE PAPER. Its whole cell is "stamp
     * wobbles and bounces back onto the tray" — the refusal belongs to the
     * stamp, which rocks and glows red where the player let go of it. The red
     * flash on the target zone used to fire here too, which pointed at a
     * target on a miss that is supposed to say only "not like that". */
    const h = hits[target.id];
    if (h && tier >= 2) {
      h.el.classList.add('wrong');
      setTimeout(() => h.el.classList.remove('wrong'), 420);
    }

    if (tier === 1) {
      coach(lineFor(target, 'e1'), 'puzzled');
      /* the practice set's one cell also points: "End position glows more
         strongly", from the first miss on and never escalating past it */
      if (isTutorial()) paintGlows();
    } else if (tier === 2) {
      /* ONE LAYER OF HINT: the relevant unresolved area pulses and glows
       * softly, and the tray gives one general pulse. Not a single stamp is
       * singled out — the table says so in as many words, because at this tier
       * the child is being asked to choose, not shown what to choose. */
      coach(lineFor(target, 'e2'), 'puzzled');
      hintArea(target);
      paintGlows();
      pulseStamps();
    } else {
      /* DIRECT INSTRUCTION, and the move itself. The exact unresolved location
       * and the one stamp that fixes it both glow strongly — on every screen
       * now; nine of them used to point at the stamp and never at the paper —
       * and then the hand carries that stamp there.
       *
       * The hand is NOT awaited: the tray unlocks the moment the refused stamp
       * is home, so a child who has already worked it out is never made to sit
       * through the demonstration — their first touch calls stopHand() and it
       * gets out of the way. */
      coach(lineFor(target, 'e3'), 'puzzled');
      paintGlows();
      syncStampCues();
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
  /* 8. post — the sheet leaves and the mark fills                       */
  /* =================================================================== */
  /* EVERY LETTER LEAVES THE SAME WAY: it lifts off the desk and goes. No fold,
   * no envelope, and — since the level's last letter stopped being special —
   * no flight to the corner either.
   *
   * The last letter USED to arc away to the pile at bottom right while the
   * other two simply lifted and faded, which told the story twice and told it
   * differently each time: the ceremony that follows brings every letter of the
   * level back out of its HUD mark, franks the set together and takes all of
   * them down to the pile. A letter that had already flown there was being
   * delivered before it was sealed, and it was the only one of the three the
   * player ever saw arrive. The exit is now uniform and the pile is the
   * ceremony's alone. */
  async function stPost() {
    const T = TIMING.post;
    const g0 = generation;
    const wasLast = levelComplete();
    const shouldPost = wasLast && !isTutorial();

    /* the text goes first, so what flies away is paper rather than words */
    if (reduced()) sentenceEl.style.opacity = '0';
    else await anim(sentenceEl, [{ opacity: 1 }, { opacity: 0 }], D(160), 'ease-in');
    sentenceEl.style.opacity = '0';

    if (reduced()) {
      await anim(cardLayer, [{ opacity: 1 }, { opacity: 0 }], D(1), 'linear');
    } else {
      await anim(cardLayer, [
        { opacity: 1, transform: tf({ s: 1 }) },
        { opacity: 0, transform: tf({ s: 0.96, y: -u(40) }) }], D(T.total * 0.7), 'ease-in');
    }
    cardLayer.classList.remove('lift', 'land');
    /* everything below moves the cursor, so it only runs if this is still
       the current run of the machine — see stale() */
    if (stale(g0)) return null;

    /* THE PILE IS NOT TOUCHED HERE, by any letter. The event is the whoosh and
     * the note that the level has produced something to post; the letters only
     * actually land — franked — in the level-complete ceremony, all of them
     * together. Adding this one to the pile first put a READY TO POST on screen
     * a beat before the ceremony that awards it. */
    if (shouldPost) emit('letter:post', { level: level().id, posted: S.posted });

    /* Letter progress advances after its completion transition. */
    if (!isTutorial()) {
      S.solved++;
      updateHud();
      /* the mark fills and tings in the same beat, so the sound belongs to the
         thing the eye is on rather than arriving on its own */
      emit('hud:progress', { level: level().id, solved: S.solved,
                             of: level().letters.length });
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

    /* 1. each letter arcs down out of the HUD mark that recorded it, and they
     *    all go AT ONCE. Every mark is at the same height and the same size, so
     *    releasing them together means the three share a y and a scale for the
     *    whole flight: the row is level from the first frame to the last. They
     *    used to be staggered, which put each card at a different point along
     *    an otherwise identical arc — so they arrived as a diagonal of three
     *    different sizes, and only became a row once the last one landed. */
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

    /* AND THEN THE CLOSING FILM. This used to end on a "Play again" button and
       stop the machine; the film is the ending now, and it returns to the cover
       art, which already has PLAY on it. */
    await wait(TIMING.finale.holdMs || 900);
    return 'outro';
  }

  /* =================================================================== */
  /* THE STATE TABLE                                                     */
  /* =================================================================== */
  const STATES = {
    'title':       stTitle,    /* 0  cover art, waiting on PLAY              */
    'intro':       stIntro,    /* 0a the 1:05 film                           */
    'idle':        stIdle,     /* 1  empty desk, tray, HUD, inbox            */
    'deal':        stDeal,     /* 2  a sheet arcs in, whole            700ms */
    'read':        stRead,     /* 3  text appears, uncorrected         350ms */
    'await-input': stAwait,    /* 4  drag or tap; any target, any order      */
    'stamp':       stStamp,    /* 5  press + ink, or reject + nudge    450ms */
    'seal':        stSeal,     /* 6  letter away, or READY TO POST     900ms */
    'post':        stPost,     /* 7  fill the mark; fly to the mailbag 600ms */
    'levelup':     stLevelUp,  /* 8  the level's letters, sealed      ~3.4s */
    'finale':      stFinale,   /* 9  after the final letter           1200ms */
    'outro':       stOutro     /* 10 the 9s film, then back to the cover     */
  };

  let generation = 0, driving = false;

  function go(name) {
    S.name = name;
    generation++;
    cancelPick();
    /* a card waiting on PLAY is released the same way a pending pick is, so a
       jump or a restart is never stuck behind a button nobody will press */
    if (releasePlay) { const r = releasePlay; releasePlay = null; r(false); }
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
  /* nothing zooms, nothing is copied out                                */
  /* =================================================================== */
  /* The stage sizes itself to the viewport, so there is nothing a zoom can
   * reveal — it only breaks the fit. The viewport tag and `touch-action: none`
   * handle touch; these are the routes neither of those reaches.
   *
   * `passive: false` on wheel matters: a listener the browser assumes is
   * passive cannot preventDefault, and a trackpad pinch arrives as a wheel
   * event with ctrlKey set. */
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (['+', '-', '=', '_', '0'].indexOf(e.key) !== -1) e.preventDefault();
  });

  /* Safari's own pinch, which ignores the viewport tag entirely */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
    document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));

  /* THE ARTWORK STAYS PUT. Right-click-and-save, drag-to-desktop,
   * select-and-copy and iOS long-press are all off. A deterrent rather than
   * protection — anything the browser draws can still be taken from its
   * network log — but it closes the casual routes, and it stops a stamp being
   * dragged off the page mid-game, which left a ghost image trailing the
   * cursor and the drag dead. The temporary level bar is exempt so it stays
   * usable while reviewing. */
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('#temp-level-nav')) return;
    e.preventDefault();
  });
  ['dragstart', 'selectstart', 'copy', 'cut'].forEach((n) =>
    document.addEventListener(n, (e) => {
      if (e.target.closest && e.target.closest('#temp-level-nav')) return;
      e.preventDefault();
    }));

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
    /* The cover and PLAY are the FIRST thing on screen, so they belong here
       even though nothing else on the title card needs waiting for. The two
       films deliberately do not: 20 MB fetched at boot would be 20 MB fetched
       before the cover appeared, and playFilm() already survives a file that
       will not open. */
    const srcs = ['assets/desk-wood.jpg', 'assets/stamp-tray.png', 'assets/envelope.png',
                  'assets/envelope-icon.png', 'assets/ready-to-post.png',
                  'assets/cover.jpg', 'assets/play-button.png',
                  'assets/hand.png'];
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
    /* whichever box it is currently using — the cover's, or the film's */
    if (!playBtn.hidden) place(playBtn, S.name === 'intro' ? L.introPlay : L.play);
    /* the fitted size is real px, so it has to be solved again at a new scale */
    fitCoachLine();
    if (S.letter && S.name === 'await-input') buildHits();
  }

  function restart() {
    finaleEl.innerHTML = '';
    world.style.transform = '';
    hideOverlays();
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
    /* a jump out of the title card or a film goes straight to the desk */
    hideOverlays();
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
      /* test hook: press PLAY, and skip a film without waiting out its runtime */
      play: () => { playBtn.click(); },
      endFilm: () => { filmEl.dispatchEvent(new Event('ended')); },
      film: () => ({ shown: !movieEl.hidden, src: filmEl.getAttribute('src') || null,
                     title: !titleEl.hidden, playShown: !playBtn.hidden }),
      /* test hook: is the cover's own line playing, and from where */
      titleVo: () => ({ src: TITLE_VO, started: !!titleAudio,
                        playing: !!(titleAudio && !titleAudio.paused && !titleAudio.ended) }),
      /* test hook: re-solve the narrator line's size, so the suite can walk
         every line in the content through the fitter without playing the game */
      fitLine: () => { fitCoachLine(); },
      place: (stampId, targetId, validLocation) => {
        const t = S.letter && S.letter.targets.find((x) => x.id === targetId);
        if (!t || S.name !== 'await-input') return false;
        submit(stampId, t, 'tap', validLocation !== false);
        return true;
      },
      targets: () => (S.letter ? S.letter.targets.map((t) =>
        ({ id: t.id, kind: t.kind, char: t.char, stamp: t.stamp, done: t.done, errors: t.errors })) : [])
    };

    /* THE TITLE CARD IS THE WAY IN, except for review and for the suite. A
       65-second film in front of every page load would make the acceptance run
       impossible, and the level-jump bar exists for the same reason, so
       `?nointro=1` (or `#nointro`) drops straight onto the desk. It is the only
       difference between the two boots. */
    const noIntro = /[?&]nointro=1(?:&|$)/.test(location.search)
                 || location.hash === '#nointro';
    go(noIntro ? 'idle' : 'title');
    setTimeout(() => Audio_.warm(), 400);   /* after the scene is up */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
