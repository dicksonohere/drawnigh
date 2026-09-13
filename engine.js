/* ============================================================
   DrawNigh — engine.js
   "Nearer to God, bit by bit."
   The single source of truth for state, counting rules, plans,
   streaks, favorites, catch-up, and BB1. backup codes.
   Runs in the app page, the launcher popup, the content script,
   and Node (for tests). No UI code lives here.
   ============================================================ */
(function (root) {
  'use strict';

  // ---------- Bible structure (names + verses per chapter) ----------
  // Full text is NOT embedded here; only the shape, so the engine can
  // map references <-> global verse numbers without the 4.4 MB text.
  var COUNTS = [["Genesis",[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26]],["Exodus",[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38]],["Leviticus",[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34]],["Numbers",[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13]],["Deuteronomy",[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12]],["Joshua",[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33]],["Judges",[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25]],["Ruth",[22,23,18,22]],["1 Samuel",[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,29,22,44,25,12,25,11,31,13]],["2 Samuel",[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25]],["1 Kings",[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,54]],["2 Kings",[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30]],["1 Chronicles",[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30]],["2 Chronicles",[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23]],["Ezra",[11,70,13,24,17,22,28,36,15,44]],["Nehemiah",[11,20,32,23,19,19,73,18,38,39,36,47,31]],["Esther",[22,23,15,17,14,14,10,17,32,3]],["Job",[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17]],["Psalms",[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6]],["Proverbs",[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31]],["Ecclesiastes",[18,26,22,16,20,12,29,17,18,20,10,14]],["Song of Solomon",[17,17,11,16,16,13,13,14]],["Isaiah",[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24]],["Jeremiah",[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34]],["Lamentations",[22,22,66,22,22]],["Ezekiel",[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35]],["Daniel",[21,49,30,37,31,28,28,27,27,21,45,13]],["Hosea",[11,23,5,19,15,11,16,14,17,15,12,14,16,9]],["Joel",[20,32,21]],["Amos",[15,16,15,13,27,14,17,14,15]],["Obadiah",[21]],["Jonah",[17,10,10,11]],["Micah",[16,13,12,13,15,16,20]],["Nahum",[15,13,19]],["Habakkuk",[17,20,19]],["Zephaniah",[18,15,20]],["Haggai",[15,23]],["Zechariah",[21,13,10,14,11,15,14,23,17,12,17,14,9,21]],["Malachi",[14,17,18,6]],["Matthew",[25,22,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,45,39,51,46,74,66,20]],["Mark",[45,28,35,40,43,56,36,37,50,52,33,44,37,72,47,20]],["Luke",[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53]],["John",[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25]],["Acts",[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31]],["Romans",[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27]],["1 Corinthians",[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24]],["2 Corinthians",[24,17,18,18,21,18,16,24,15,18,33,21,14]],["Galatians",[24,21,29,31,26,18]],["Ephesians",[23,22,21,32,33,24]],["Philippians",[30,30,21,23]],["Colossians",[29,23,25,18]],["1 Thessalonians",[10,20,13,18,28]],["2 Thessalonians",[12,17,18]],["1 Timothy",[20,15,16,16,25,21]],["2 Timothy",[18,26,17,22]],["Titus",[16,15,15]],["Philemon",[25]],["Hebrews",[14,18,19,16,14,20,28,13,28,39,40,29,25]],["James",[27,26,18,17,20]],["1 Peter",[25,25,22,19,14]],["2 Peter",[21,22,18]],["1 John",[10,29,24,21,21]],["2 John",[13]],["3 John",[15]],["Jude",[25]],["Revelation",[20,29,22,11,14,17,17,13,21,11,19,18,18,20,8,21,18,24,21,15,27,21]]];

  var BOOKS = COUNTS.map(function (b) { return b[0]; });
  var TOTAL_VERSES = 0;
  var BOOK_OFFSET = [];   // global index of each book's first verse
  var CHAP_OFFSET = [];   // per book: global index of each chapter's first verse
  (function () {
    for (var b = 0; b < COUNTS.length; b++) {
      BOOK_OFFSET.push(TOTAL_VERSES);
      var chs = COUNTS[b][1], co = [];
      for (var c = 0; c < chs.length; c++) { co.push(TOTAL_VERSES); TOTAL_VERSES += chs[c]; }
      CHAP_OFFSET.push(co);
    }
  })();
  var OT_END = BOOK_OFFSET[39]; // Matthew's first verse = end of OT

  // ---------- Reference <-> global index ----------
  function refToIndex(b, c, v) { return CHAP_OFFSET[b][c] + v; }
  function indexToRef(i) {
    var b = 0;
    while (b + 1 < BOOK_OFFSET.length && BOOK_OFFSET[b + 1] <= i) b++;
    var co = CHAP_OFFSET[b], c = 0;
    while (c + 1 < co.length && co[c + 1] <= i) c++;
    return [b, c, i - co[c]];
  }
  function refLabel(b, c, v) { return BOOKS[b] + ' ' + (c + 1) + ':' + (v + 1); }
  function bookOf(i) {                                          // v1.0.4
    var b = 0;
    while (b + 1 < BOOK_OFFSET.length && BOOK_OFFSET[b + 1] <= i) b++;
    return b;
  }

  // ---------- Bitsets (stored as base64) ----------
  function bitsNew(n) { return new Uint8Array(Math.ceil(n / 8)); }
  function bitGet(u8, i) { return (u8[i >> 3] >> (i & 7)) & 1; }
  function bitSet(u8, i) { u8[i >> 3] |= (1 << (i & 7)); }
  function bitClear(u8, i) { u8[i >> 3] &= ~(1 << (i & 7)); }   // v1.0.4 (laps)
  function bitCount(u8) {
    var n = 0;
    for (var i = 0; i < u8.length; i++) { var x = u8[i]; while (x) { n += x & 1; x >>= 1; } }
    return n;
  }
  function b64FromBits(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return _btoa(s);
  }
  function bitsFromB64(str, n) {
    var u8 = bitsNew(n);
    if (!str) return u8;
    var s = _atob(str);
    for (var i = 0; i < s.length && i < u8.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  // btoa/atob that also work in Node
  function _btoa(s) {
    if (typeof btoa === 'function') return btoa(s);
    return Buffer.from(s, 'binary').toString('base64');
  }
  function _atob(s) {
    if (typeof atob === 'function') return atob(s);
    return Buffer.from(s, 'base64').toString('binary');
  }

  // ---------- Dates (phone's local time) ----------
  function todayStr(now) {
    var d = now ? new Date(now) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayStr(now) {
    var d = now ? new Date(now) : new Date();
    d.setDate(d.getDate() - 1);
    return todayStr(d.getTime());
  }

  // ---------- Fresh state ----------
  function newState() {
    return {
      v: 1,
      today: { date: todayStr(), count: 0, seen: [] },   // v13: seen = verses already credited today
      streak: { days: 0, last: null },
      positions: {},            // bookIndex -> [chapter, verse] (next to read)
      favorites: [],            // [ [b,c,v], ... ] in the order saved
      globalRead: '',           // base64 bitset over all 31,100 verses
      plans: [],                // see makePlan()
      activePlanId: null,
      settings: {
        momentSource: 'plan',   // 'plan' = active reading plan, 'pp' = Psalms & Proverbs, 'fav' = Favorites
        momentMins: 60,         // Verse of the Moment (inside the app)
        siteEnabled: true,      // comic-time pop-ups on websites
        siteMins: 20,           // minutes on a page before a card appears
        showNotes: false,       // v13: translators' margin notes under the verse
        cardPos: null           // v13: dragged card position on desktop {x,y}
      },
      vod: null,                // { date, ref:[b,c,v] } Verse of the Day
      planSeq: 0                // id counter for plans
    };
  }
  // Everything added in v1.0.4 is filled in by migrate(), so a fresh state and
  // an updated one end up identical — one definition, no drift.
  function newStateFull() { return migrate(newState()); }

  // ---------- Day rollover (call on every load / before counting) ----------
  function rollover(state, now) {
    migrate(state);                                     // v1.0.4
    var t = todayStr(now);
    if (state.today.date !== t) {
      // v1.0.4: before the day is cleared, write it into the day log the plan
      // ladder reads. Nothing here counts anything; it only records what was.
      logDay(state, state.today.date, state.today.count);
      state.today.date = t; state.today.count = 0; state.today.seen = [];
    }
    if (!state.today.seen) state.today.seen = [];
    // A streak survives only if the last reading day is today or yesterday.
    if (state.streak.last && state.streak.last !== t && state.streak.last !== yesterdayStr(now)) {
      state.streak.days = 0; state.streak.last = null;
    }
  }

  // v1.0.4: fills in anything a older saved state does not have yet. Additive
  // only — it never overwrites a value the reader already has, so an update
  // cannot disturb existing reading, plans, streaks or settings.
  function migrate(state) {
    var s = state.settings || (state.settings = {});
    if (s.pray === undefined)        s.pray = false;      // timer off unless switched on
    // v1.0.5: prayer lengths are held in SECONDS, because a breath prayer is
    // seconds long — the practice this was built for. Anyone who set a length
    // when these were whole minutes keeps exactly what they chose.
    if (s.praySecs === undefined) {
      s.praySecs = (s.prayMins !== undefined) ? s.prayMins * 60 : 300;
    }
    if (s.prayStretchSecs === undefined) {
      s.prayStretchSecs = (s.prayStretch !== undefined) ? s.prayStretch * 60 : 300;
    }
    delete s.prayMins; delete s.prayStretch;              // superseded
    if (s.prayChime === undefined)   s.prayChime = 'single';
    if (s.prayVol === undefined)     s.prayVol = 0.5;
    if (s.dryMins === undefined)     s.dryMins = 5;       // dry-out card interval
    if (state.lap === undefined)         state.lap = '';
    if (state.completions === undefined) state.completions = {};   // bookIndex -> times finished
    if (state.declared === undefined)    state.declared = 0;       // Bibles finished before DrawNigh
    if (state.declaredAsked === undefined) state.declaredAsked = false;
    if (state.dayLog === undefined)      state.dayLog = {};        // 'YYYY-MM-DD' -> verses that day
    if (state.badgeSeen === undefined)   state.badgeSeen = [];     // badge ids already looked at
    if (state.ladder === undefined)      state.ladder = { lastCheck: null, offer: null };
    // v1.0.9
    if (state.prayRun === undefined)     state.prayRun = null;     // a prayer outlives the screen
    if (state.gems === undefined)        state.gems = [];          // ⚡ Gems of Light
    if (state.gapClaim === undefined)    state.gapClaim = null;    // an honest claim, still confessable
    if (state.milestones === undefined)  state.milestones = [];    // dated record of tiers reached
    // v1.1.0
    if (state.markAt === undefined)      state.markAt = {};        // the day a ⚡ or ♥ was made
    if (state.seasons === undefined)     state.seasons = { now: null, past: [] };
    if (state.room === undefined)        state.room = null;        // The Secret Place, sealed
    if (state.audioRun === undefined)    state.audioRun = null;    // where a reading aloud had reached
    seedLapFromHistory(state);                                     // v1.0.6
    repairCatchUpLaps(state);                                      // v1.1.0, finding 6
    // v1.0.9: history starts when dates start. Everything already earned on the
    // day this lands is the baseline and never gets a date — no backfill, no
    // undated entries, no fill-in screen. Only what is reached from now is dated.
    if (state.msBase === undefined)      state.msBase = earnedBadges(state);
    return state;
  }

  /* v1.1.0 — repairing what finding 6 already cost.
     Fixing catchUpApply stops the loss from here on; it cannot give back a
     completion that was never banked. This does, and only where it is provably
     safe: a book whose every verse is in globalRead but which has never been
     banked at all. seedLapFromHistory already banked every complete book once
     (and set lapSeeded), so after that a fully-read book carries a completion —
     unless a Catch me up finished it and the lap never heard about it.
     A book already banked is left alone: its lap was cleared on purpose, and a
     partial lap there is a second reading in progress, not damage.
     Once only, and the flag is what guarantees it. */
  function repairCatchUpLaps(state) {
    if (state.lapRepaired) return 0;
    state.lapRepaired = true;
    if (!state.lapSeeded) return 0;          // seeding has not run yet; it will bank them
    var g = bitsFromB64(state.globalRead, TOTAL_VERSES), fixed = 0;
    for (var b = 0; b < 66; b++) {
      if ((state.completions && state.completions[b]) > 0) continue;
      var r = bookRange(b), whole = true, i;
      for (i = r[0]; i < r[1]; i++) { if (!bitGet(g, i)) { whole = false; break; } }
      if (!whole) continue;
      /* Banked directly, not by walking lapMark over the book: lapMark clears
         the lap the moment the book fills, so the remaining calls would write
         the cleared verses straight back in and leave a part-read book behind.
         (It did exactly that on the first attempt — 816 of Genesis left in a
         lap that should have been empty.) One bank, one clear. */
      var lap = bitsFromB64(state.lap, TOTAL_VERSES);
      for (i = r[0]; i < r[1]; i++) bitClear(lap, i);
      state.lap = b64FromBits(lap);
      state.completions[b] = (state.completions[b] || 0) + 1;
      fixed++;
    }
    return fixed;
  }

  // ---------- v1.0.6: crediting reading done before badges existed ----------
  // globalRead has always held a tick against every verse the reader has ever
  // read, and it has always travelled inside the backup code. The badges read
  // the lap instead, which is new — so restoring an older code left every book
  // dark despite the reading being right there. This fills the lap in from that
  // record ONCE and banks every book already complete.
  //
  // Once only, and the flag is what guarantees it: banking a book clears it
  // from the lap, so a second run would see those books whole again and credit
  // them twice. A reader's Well would climb on its own every time they opened
  // the app. It must happen exactly one time and never again.
  //
  // What it can and cannot know: globalRead records THAT a verse was read, never
  // how often. So a book read nine times comes back as one. That is the honest
  // floor, not a guess — whole-Bible history is declared at setup instead.
  function seedLapFromHistory(state) {
    if (state.lapSeeded) return;
    state.lapSeeded = true;
    if (!state.globalRead) return;                 // nothing to credit
    if (state.lap) return;                         // already keeping a lap
    var lap = bitsFromB64(state.globalRead, TOTAL_VERSES);
    for (var b = 0; b < 66; b++) {
      var r = bookRange(b), done = true;
      for (var i = r[0]; i < r[1]; i++) { if (!bitGet(lap, i)) { done = false; break; } }
      if (!done) continue;                         // partly read: leave it in the lap
      for (var j = r[0]; j < r[1]; j++) bitClear(lap, j);
      if (!state.completions[b]) state.completions[b] = 1;
    }
    state.lap = b64FromBits(lap);
  }

  // ---------- v1.0.4: the day log (the ladder's only memory) ----------
  // It records what WAS read, never what was missed. There is no debt here and
  // no missed-day tally — an absent day is simply a day with no entry.
  function logDay(state, date, count) {
    if (!date || !count) return;
    if (!state.dayLog) state.dayLog = {};
    state.dayLog[date] = (state.dayLog[date] || 0) + count;
    // keep roughly two years; the deepest ladder rung only looks back one
    var keys = Object.keys(state.dayLog).sort();
    while (keys.length > 800) { delete state.dayLog[keys.shift()]; }
  }
  function versesOn(state, date, now) {
    if (date === todayStr(now)) return state.today.count || 0;
    return (state.dayLog && state.dayLog[date]) || 0;
  }

  // ---------- v1.0.4: laps and completions ----------
  function bookRange(b) {
    return [BOOK_OFFSET[b], (b + 1 < 66) ? BOOK_OFFSET[b + 1] : TOTAL_VERSES];
  }
  function lapMark(state, gi) {
    var lap = bitsFromB64(state.lap, TOTAL_VERSES);
    if (bitGet(lap, gi)) return;
    bitSet(lap, gi);
    // did that finish the book?
    var b = bookOf(gi), r = bookRange(b), done = true;
    for (var i = r[0]; i < r[1]; i++) { if (!bitGet(lap, i)) { done = false; break; } }
    if (done) {
      for (var j = r[0]; j < r[1]; j++) bitClear(lap, j);   // the lap starts again
      state.completions[b] = (state.completions[b] || 0) + 1;
    }
    state.lap = b64FromBits(lap);
  }
  function bookCompletions(state, b) { return (state.completions && state.completions[b]) || 0; }
  // A Bible is finished when every book has been finished — so the number of
  // whole Bibles is the number of times the LEAST-read book has come round.
  function bibleCompletions(state) {
    var least = Infinity;
    for (var b = 0; b < 66; b++) least = Math.min(least, bookCompletions(state, b));
    return (least === Infinity ? 0 : least) + (state.declared || 0);
  }

  function creditDay(state, n, now) {
    rollover(state, now);
    var t = todayStr(now);
    if (state.streak.last !== t) {
      state.streak.days = (state.streak.last === yesterdayStr(now)) ? state.streak.days + 1 : 1;
      state.streak.last = t;
    }
    state.today.count += n;
  }

  // v9: per-plan today counter (🎯). Rolls over lazily by date.
  function planCreditToday(plan, n, now) {
    var t = todayStr(now);
    if (plan.todayDate !== t) { plan.todayDate = t; plan.todayCount = 0; }
    plan.todayCount += n;
  }
  function planTodayCount(plan, now) {
    return plan.todayDate === todayStr(now) ? (plan.todayCount || 0) : 0;
  }

  // ---------- Plan scope ----------
  // scopeType: 'full' | 'nt' | 'ot' | 'books' | 'favorites'
  // 'books' uses plan.scopeBooks = [bookIndex,...] in canonical order.
  // 'favorites' uses plan.scopeRefs = snapshot of favorites at creation.
  function scopeIndices(plan) {
    var out = [], i;
    if (plan.scopeType === 'full') { for (i = 0; i < TOTAL_VERSES; i++) out.push(i); }
    else if (plan.scopeType === 'ot') { for (i = 0; i < OT_END; i++) out.push(i); }
    else if (plan.scopeType === 'nt') { for (i = OT_END; i < TOTAL_VERSES; i++) out.push(i); }
    else if (plan.scopeType === 'books' || plan.scopeType === 'well') {   // v1.0.9: a Well is one book
      var bs = plan.scopeBooks.slice().sort(function (a, b) { return a - b; });
      for (var k = 0; k < bs.length; k++) {
        var b = bs[k], start = BOOK_OFFSET[b];
        var end = (b + 1 < 66) ? BOOK_OFFSET[b + 1] : TOTAL_VERSES;
        for (i = start; i < end; i++) out.push(i);
      }
    } else if (plan.scopeType === 'favorites') {
      for (i = 0; i < plan.scopeRefs.length; i++) {
        var r = plan.scopeRefs[i];
        out.push(refToIndex(r[0], r[1], r[2]));
      }
    }
    return out;
  }
  function scopeSize(plan) {
    if (plan.scopeType === 'full') return TOTAL_VERSES;
    if (plan.scopeType === 'ot') return OT_END;
    if (plan.scopeType === 'nt') return TOTAL_VERSES - OT_END;
    if (plan.scopeType === 'favorites') return plan.scopeRefs.length;
    var n = 0;
    for (var k = 0; k < plan.scopeBooks.length; k++) {
      var b = plan.scopeBooks[k];
      n += ((b + 1 < 66) ? BOOK_OFFSET[b + 1] : TOTAL_VERSES) - BOOK_OFFSET[b];
    }
    return n;
  }
  // Position of a global verse index inside a plan's scope, or -1.
  function scopePos(plan, gi) {
    if (plan.scopeType === 'full') return gi;
    if (plan.scopeType === 'ot') return gi < OT_END ? gi : -1;
    if (plan.scopeType === 'nt') return gi >= OT_END ? gi - OT_END : -1;
    if (plan.scopeType === 'favorites') {
      for (var i = 0; i < plan.scopeRefs.length; i++) {
        var r = plan.scopeRefs[i];
        if (refToIndex(r[0], r[1], r[2]) === gi) return i;
      }
      return -1;
    }
    var bs = plan.scopeBooks.slice().sort(function (a, b) { return a - b; });
    var off = 0;
    for (var k = 0; k < bs.length; k++) {
      var b = bs[k], start = BOOK_OFFSET[b];
      var end = (b + 1 < 66) ? BOOK_OFFSET[b + 1] : TOTAL_VERSES;
      if (gi >= start && gi < end) return off + (gi - start);
      off += end - start;
    }
    return -1;
  }
  // Global index of the verse at a given scope position.
  function scopeIndexAt(plan, pos) {
    if (plan.scopeType === 'full') return pos;
    if (plan.scopeType === 'ot') return pos;
    if (plan.scopeType === 'nt') return OT_END + pos;
    if (plan.scopeType === 'favorites') {
      var r = plan.scopeRefs[pos];
      return refToIndex(r[0], r[1], r[2]);
    }
    var bs = plan.scopeBooks.slice().sort(function (a, b) { return a - b; });
    for (var k = 0; k < bs.length; k++) {
      var b = bs[k], start = BOOK_OFFSET[b];
      var len = ((b + 1 < 66) ? BOOK_OFFSET[b + 1] : TOTAL_VERSES) - start;
      if (pos < len) return start + pos;
      pos -= len;
    }
    return -1;
  }

  // ---------- Plans ----------
  function makePlan(state, opts) {
    var size = 0;
    var plan = {
      id: 'p' + (++state.planSeq),
      name: opts.name,
      scopeType: opts.scopeType,
      scopeBooks: opts.scopeBooks || null,
      scopeRefs: opts.scopeType === 'favorites' ? state.favorites.slice() : null,
      days: opts.days,
      created: todayStr(),
      countEverything: false,
      read: '',                 // base64 bitset over scope positions
      pointer: 0,               // scope position of the next in-order verse
      todayDate: null,          // v9: which day todayCount belongs to
      todayCount: 0,            // v9: verses credited to THIS plan today (🎯)
      featured: !!opts.featured
    };
    size = scopeSize(plan);
    plan.target = Math.ceil(size / opts.days);
    plan.size = size;
    state.plans.push(plan);
    if (!state.activePlanId) state.activePlanId = plan.id;
    return plan;
  }
  function previewPlan(scopeType, scopeBooks, favCount, days) {
    var p = { scopeType: scopeType, scopeBooks: scopeBooks, scopeRefs: new Array(favCount || 0) };
    var size = scopeSize(p);
    return { size: size, perDay: Math.ceil(size / days) };
  }
  function getPlan(state, id) {
    for (var i = 0; i < state.plans.length; i++) if (state.plans[i].id === id) return state.plans[i];
    return null;
  }
  function planReadCount(plan) { return bitCount(bitsFromB64(plan.read, plan.size)); }
  function planRemaining(plan) { return plan.size - planReadCount(plan); }

  // ---------- v1.0.9: self-service plan controls (v15.1 §3.8) ----------
  // The daily number and the end date are two views of one fact: how much is
  // left, and how fast it is being taken. Move either and the other moves with
  // it, in BOTH directions — unlike the ladder, which can only ever lighten.
  //
  // NOTHING here touches a verse already read, the daily total, or the streak.
  // Adjusting a plan changes only what the plan asks of tomorrow.
  //
  // A note on plan.days, because it carries two meanings and the display must
  // not inherit the confusion: at creation it is the duration the reader chose;
  // ladderAccept rewrites it to mean days remaining at the current pace. The
  // end date is therefore never computed from plan.days — always from what is
  // actually left, divided by the number in force today.
  function planDaysLeft(plan) {
    if (!plan || !plan.target) return 0;
    var left = planRemaining(plan);
    if (left <= 0) return 0;
    return Math.ceil(left / plan.target);
  }
  function addDays(dateStr, n) {
    var d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return todayStr(d.getTime());
  }
  function daysBetween(a, b) {
    var A = new Date(a + 'T12:00:00'), B = new Date(b + 'T12:00:00');
    return Math.round((B - A) / 86400000);
  }
  // The last day of reading if the plan is kept at today's number, counting
  // today as the first of them.
  function planEndDate(plan, now) {
    var n = planDaysLeft(plan);
    if (!n) return null;
    return addDays(todayStr(now), n - 1);
  }
  // Set the daily number; the end date follows. Floor of 1 — the same floor the
  // ladder holds to, so no route through the app can ever reach zero.
  function planSetTarget(state, plan, n) {
    if (!plan) return null;
    var left = planRemaining(plan);
    n = Math.floor(n);
    if (!(n >= 1)) n = 1;
    if (left > 0 && n > left) n = left;      // asking for more than is left is just "finish it"
    plan.target = n;
    plan.days = planDaysLeft(plan);
    return plan;
  }
  // Set the end date; the daily number follows. Today is a valid answer and
  // means "finish it today".
  function planSetEndDate(state, plan, dateStr, now) {
    if (!plan || !dateStr) return null;
    var left = planRemaining(plan);
    if (left <= 0) return plan;
    var span = daysBetween(todayStr(now), dateStr) + 1;   // inclusive of today
    if (!(span >= 1)) span = 1;
    return planSetTarget(state, plan, Math.ceil(left / span));
  }

  // ---------- v1.0.9: Digging the Well (v16.1 §4) ----------
  // "A Well is simply a stationary book plan." A normal plan moves on when a
  // book is finished; a Well returns to the beginning of the same book.
  //
  // It carries NO daily number, and therefore no end date, no percentage and no
  // ladder — the ladder exists to lighten a daily number and there is none to
  // lighten. A man throwing a bucket watches it come closer; he does not count
  // the pulls. Depth, not pace.
  function isWell(plan) { return !!plan && plan.scopeType === 'well'; }
  function activeWell(state) {
    for (var i = 0; i < state.plans.length; i++) if (isWell(state.plans[i])) return state.plans[i];
    return null;
  }
  function makeWell(state, bookIndex) {
    if (activeWell(state)) return null;          // one Well at a time: digging two books is not digging
    var plan = {
      id: 'p' + (++state.planSeq),
      name: BOOKS[bookIndex],
      scopeType: 'well',
      scopeBooks: [bookIndex],
      scopeRefs: null,
      days: null,
      created: todayStr(),
      countEverything: false,
      read: '',
      pointer: 0,
      todayDate: null,
      todayCount: 0,
      featured: false,
      target: null,                              // deliberately none
      laps: 0                                    // completed returns, counted
    };
    plan.size = ((bookIndex + 1 < 66) ? BOOK_OFFSET[bookIndex + 1] : TOTAL_VERSES) - BOOK_OFFSET[bookIndex];
    state.plans.push(plan);
    return plan;
  }
  function wellLapDone(plan) { return isWell(plan) && planRemaining(plan) === 0; }
  // The lap ends, it names the count, and he chooses. Nothing rolls over
  // silently — the whole point of the Well is that the returns are counted.
  function wellContinue(state, plan) {
    if (!isWell(plan)) return null;
    plan.laps = (plan.laps || 0) + 1;
    plan.read = '';
    plan.pointer = 0;
    return plan;
  }
  // Ending is not abandoning. He finished a lap and chose to stop; the count
  // stays in that book's Well tier, permanently.
  function wellEnd(state, plan) {
    if (!isWell(plan)) return null;
    plan.laps = (plan.laps || 0) + 1;
    state.plans = state.plans.filter(function (p) { return p.id !== plan.id; });
    if (state.activePlanId === plan.id) {
      state.activePlanId = state.plans.length ? state.plans[0].id : null;
    }
    return plan;
  }

  // ---------- v1.0.4: Badges ----------
  // Everything badged is TIME, never throughput. A streak cannot be hurried, a
  // book takes as long as the book takes. None of it can be faked by tapping.
  // And nothing here is ever measured against another person: in this journey,
  // you are outranking yourself.
  var STREAK_BADGES = [
    [1, 'A Flicker'], [5, 'A Flicker Held'], [10, 'A Flame'], [25, 'A Steady Flame'],
    [50, 'A Rising Fire'], [100, 'A Fire Kept'], [250, 'A Firestorm'], [500, 'A Firenado'],
    [1000, 'An Inferno'], [5000, 'A Living Flame'], [10000, 'An Eternal Flame']
  ];
  // The Well: tiered off the RAW number of times one book has been finished.
  // The same thresholds apply to every book whatever its length — for Genesis
  // the top rungs are beyond a lifetime, for Jude they are reachable. Both are
  // honest: the Bible is God's, and God is endless.
  var WELL_TIERS = [
    [1, 'A First Draw'], [5, 'A Second Thirst'], [10, 'A Deepening Thirst'],
    [25, 'Waters Rising'], [50, 'A Flowing Well'], [100, 'Fountains'],
    [250, 'Tehom Ephphatha'], [500, 'A Wall of Water'], [1000, "Heaven's Torrent"],
    [5000, 'Tehom El-Tehom'], [10000, 'El-Ruach']
  ];
  // Rank: whole Bibles finished. Phase 1 is the soldier; phase 2 leaves the
  // army for the house — Revelation 3:12, a pillar in the temple of my God.
  var RANKS = [
    [0, 'Recruit'], [1, 'Cadet'], [2, 'Lieutenant'], [3, 'Captain'], [5, 'Major'],
    [7, 'Colonel'], [10, 'General'], [15, 'Watchman'], [20, 'Steward'], [30, 'Pillar'],
    [45, 'Servant of the House'], [60, 'Keeper of the Flame'], [75, 'Bearer of Light'],
    [90, 'At His Feet'], [100, 'El-Ruach-Chai']
  ];
  function tierFor(table, n) {
    var got = null;
    for (var i = 0; i < table.length; i++) if (n >= table[i][0]) got = table[i];
    return got;                                     // [threshold, name] or null
  }
  function nextTier(table, n) {
    for (var i = 0; i < table.length; i++) if (n < table[i][0]) return table[i];
    return null;
  }
  function streakBadge(state) { return tierFor(STREAK_BADGES, state.streak.days || 0); }
  function rankFor(state) { return tierFor(RANKS, bibleCompletions(state)) || RANKS[0]; }
  function wellTier(state, b) { return tierFor(WELL_TIERS, bookCompletions(state, b)); }
  // The Road: the book's own name, earned once, the first time it is finished.
  function hasRoad(state, b) { return bookCompletions(state, b) > 0; }
  // Which books have been touched at all (for the 66-tile overview).
  function bookTouched(state, b) {
    if (bookCompletions(state, b) > 0) return true;
    var lap = bitsFromB64(state.lap, TOTAL_VERSES), r = bookRange(b);
    for (var i = r[0]; i < r[1]; i++) if (bitGet(lap, i)) return true;
    return false;
  }
  function bookProgress(state, b) {          // verses of this book read this lap
    var lap = bitsFromB64(state.lap, TOTAL_VERSES), r = bookRange(b), n = 0;
    for (var i = r[0]; i < r[1]; i++) if (bitGet(lap, i)) n++;
    return { read: n, size: r[1] - r[0] };
  }
  // Every badge currently earned, as stable ids, so a new one can be noticed.
  function earnedBadges(state) {
    var out = [];
    var s = streakBadge(state); if (s) out.push('streak:' + s[0]);
    var r = rankFor(state); if (r && r[0] > 0) out.push('rank:' + r[0]);
    for (var b = 0; b < 66; b++) {
      if (hasRoad(state, b)) out.push('road:' + b);
      var w = wellTier(state, b); if (w) out.push('well:' + b + ':' + w[0]);
    }
    return out;
  }
  function unseenBadges(state) {
    var seen = state.badgeSeen || [];
    return earnedBadges(state).filter(function (id) { return seen.indexOf(id) < 0; });
  }
  function markBadgesSeen(state) { state.badgeSeen = earnedBadges(state); }

  // ---------- v1.0.4: the plan ladder ----------
  // DrawNigh nudges, never pushes. The ladder can only ever offer to LIGHTEN a
  // plan, never to increase it, and it never counts what was not read: there is
  // no debt here, no missed-day tally, and the word "behind" appears nowhere.
  var LADDER = [
    { level: 1, days: 5,   showing: 'You showed up. That’s what matters. Want the plan to match your pace right now?',
                           absent:  'It’s been a few days — and the door’s still open. Want to read just one verse today?' },
    { level: 2, days: 14,  showing: 'You showed up when you could. That’s what matters. Want this plan to ease down and fit your pace?',
                           absent:  'It’s been a couple weeks — and the door’s still open. Want to read just one verse right now?' },
    { level: 3, days: 30,  showing: 'You showed up when you could. That’s what matters. Want a smaller number that actually fits?',
                           absent:  'It’s been a month — and the door’s still open. Want to read just one verse right now?' },
    { level: 4, days: 90,  showing: 'You showed up when you could. That’s what matters. Want to simplify it down to a number that actually fits?',
                           absent:  'It’s been a while — and the door’s still open. Want to read just one verse right now?' },
    { level: 5, days: 180, showing: 'You showed up when you could, all this time. That’s what matters. Want a smaller number that fits your pace?',
                           absent:  'It’s been a while — and the door’s still open. One verse, whenever you’re ready for it.' },
    { level: 6, days: 365, showing: 'You showed up when you could, across a whole year. That’s what matters more than any number. One verse a day — no plan, just presence.',
                           absent:  'It’s been a while — and the door’s still open. One verse a day. Come back however small.' }
  ];
  function dayBefore(date, n) {
    var d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - n);
    return todayStr(d.getTime());
  }
  // The gap is CONSECUTIVE low days, not a rolling average. Meeting the daily
  // number — even landing exactly on it — resets the run to zero. A heavy day
  // never cancels earlier low days; it only starts the count again from itself.
  // Today is not judged: the day is not over yet.
  function planGap(state, plan, now) {
    if (!plan || !plan.target) return { days: 0, anyLight: false };
    var t = todayStr(now), run = 0, light = false;
    for (var i = 1; i <= 400; i++) {
      var d = dayBefore(t, i);
      if (plan.created && d < plan.created) break;      // before the plan existed
      var n = versesOn(state, d, now);
      if (n >= plan.target) break;                      // met it: the run ends here
      run++;
      if (n > 0) light = true;                          // present, just under
    }
    return { days: run, anyLight: light };
  }
  // Which rung fits the gap as it stands NOW — re-evaluated weekly, so an offer
  // that was declined is not silenced forever, and the rung offered next may be
  // a different one if life has moved. If the gap has closed, nothing is said.
  function ladderOffer(state, now) {
    var plan = state.activePlanId ? getPlan(state, state.activePlanId) : null;
    if (!plan || !plan.target) return null;
    var gap = planGap(state, plan, now);
    if (!gap.days) return null;
    var rung = null;
    for (var i = 0; i < LADDER.length; i++) if (gap.days >= LADDER[i].days) rung = LADDER[i];
    if (!rung) return null;
    // One light day anywhere in the run is enough for the showing-up voice. A
    // single day of presence is never outweighed by the absent days around it.
    var voice = gap.anyLight ? 'showing' : 'absent';
    var suggested;
    if (voice === 'absent' || rung.level >= 6) {
      suggested = 1;                                    // no reading to fit a pace to
    } else {
      var sum = 0, n = 0;
      for (var k = 1; k <= Math.min(gap.days, 30); k++) {
        sum += versesOn(state, dayBefore(todayStr(now), k), now); n++;
      }
      suggested = Math.max(1, Math.round(sum / Math.max(1, n)));
      if (suggested >= plan.target) suggested = Math.max(1, plan.target - 1);
    }
    return {
      level: rung.level, days: gap.days, voice: voice,
      text: voice === 'showing' ? rung.showing : rung.absent,
      suggested: suggested,                             // the floor is 1, never 0
      planId: plan.id
    };
  }
  // Accepting only ever lowers the daily number. It never touches the daily
  // total, the streak, or a single verse already read.
  function ladderAccept(state, offer) {
    var plan = getPlan(state, offer.planId);
    if (!plan) return null;
    plan.target = Math.max(1, Math.min(offer.suggested, plan.target));
    plan.days = Math.ceil(planRemaining(plan) / plan.target);
    state.ladder = state.ladder || {};
    state.ladder.offer = null;
    state.ladder.lastCheck = todayStr();
    return plan;
  }
  function ladderDecline(state) {
    state.ladder = state.ladder || {};
    state.ladder.offer = null;
    state.ladder.lastCheck = todayStr();               // asked again in a week, not sooner
  }
  function ladderDue(state, now) {
    var last = state.ladder && state.ladder.lastCheck;
    if (!last) return true;
    return dayBefore(todayStr(now), 7) >= last;
  }
  // Growth back up — offered ONLY in the Plans screen, never pushed at the
  // reader, and one step at a time. This is the reader reaching, not the app.
  function growthStep(state, plan, now) {
    if (!plan || !plan.target || plan.target >= 5) return null;
    var t = todayStr(now);
    for (var i = 1; i <= 5; i++) {
      if (versesOn(state, dayBefore(t, i), now) < plan.target) return null;
    }
    return plan.target + 1;
  }
  // A fully-absent run shortens the browsing card's timer so a single verse can
  // reach the reader sooner. It changes only the TIMING — never which verses,
  // never the reader's chosen mode. Any verse read, in any mode, ends it at once.
  function isDriedOut(state, now) {
    var t = todayStr(now);
    if ((state.today.count || 0) > 0) return false;
    for (var i = 1; i <= 3; i++) if (versesOn(state, dayBefore(t, i), now) > 0) return false;
    return true;
  }

  // ---------- v1.0.9: the prayer that outlives the screen (OMS §10.5) ----------
  // Decision 50 — the prayer knows the MOMENT it ends and reads the clock
  // against it. Never a count of ticks. A sleeping phone stops handing out
  // ticks; it does not stop time, so however long the screen was dark every
  // reading here is the truth.
  //
  // Decision 51 — it is written down with the rest of the state, on the device.
  // Nothing leaves the phone. Reopening inside the window returns you to the
  // prayer with the count still running; a prayer that ran out while nobody was
  // looking resolves the moment the app is opened again.
  //
  // Decision 52 is Order My Steps' and does not apply here: DrawNigh has no
  // mark, and a prayer in DrawNigh still counts nothing at all.
  function prayRunning(state) { return !!(state.prayRun && state.prayRun.endsAt); }
  function prayIsPaused(state) { return !!(state.prayRun && state.prayRun.left != null); }
  function prayActive(state) { return prayRunning(state) || prayIsPaused(state); }
  function prayLeftMs(state, now) {
    if (!state.prayRun) return 0;
    if (state.prayRun.left != null) return Math.max(0, state.prayRun.left);
    return Math.max(0, state.prayRun.endsAt - (now || Date.now()));
  }
  function prayStart(state, secs, now) {
    var t = now || Date.now();
    state.prayRun = { endsAt: t + Math.max(1, secs) * 1000, left: null, total: secs };
    return state.prayRun;
  }
  // Stretch works while paused and does NOT un-pause. Adding time is not a
  // decision to carry on. (v15.2 §3.1, unchanged.)
  function prayStretch(state, secs, now) {
    if (!state.prayRun) return null;
    if (state.prayRun.left != null) state.prayRun.left += secs * 1000;
    else state.prayRun.endsAt += secs * 1000;
    state.prayRun.total = (state.prayRun.total || 0) + secs;
    return state.prayRun;
  }
  function prayPause(state, now) {
    if (!prayRunning(state)) return null;
    state.prayRun.left = prayLeftMs(state, now);
    state.prayRun.endsAt = null;
    return state.prayRun;
  }
  function prayResume(state, now) {
    if (!prayIsPaused(state)) return null;
    state.prayRun.endsAt = (now || Date.now()) + state.prayRun.left;
    state.prayRun.left = null;
    return state.prayRun;
  }
  // ✕ ends it instantly and in silence. Nothing is lost, so nothing is asked.
  function prayCancel(state) { state.prayRun = null; }
  function prayExpired(state, now) {
    return prayRunning(state) && prayLeftMs(state, now) <= 0;
  }

  // ---------- v1.0.9: milestone history (v16.1 §2.1) ----------
  // A date says something happened. A rank says where you stand. This is the
  // first kind — a record, never a standing, and nothing here is a count.
  function recordMilestones(state, now) {
    if (!state.milestones) state.milestones = [];
    var base = state.msBase || [], have = {}, i;
    for (i = 0; i < state.milestones.length; i++) have[state.milestones[i].id] = 1;
    for (i = 0; i < base.length; i++) have[base[i]] = 1;
    var earned = earnedBadges(state), added = [];
    for (i = 0; i < earned.length; i++) {
      if (have[earned[i]]) continue;
      var m = { id: earned[i], date: todayStr(now) };
      state.milestones.push(m); added.push(m); have[earned[i]] = 1;
    }
    if (state.milestones.length > 400) state.milestones = state.milestones.slice(-400);
    return added;
  }

  // ---------- v1.0.9: ⚡ Gems of Light (v16.1 §1) ----------
  // A favourite is a verse he liked. A gem is a verse that ARRESTED him — and
  // the arrow only points one way, so prayer can never identify one. It has to
  // be a deliberate mark. A verse may be both, independently: starred in March
  // and struck in July loses neither event.
  function isGem(state, b, c, v) {
    var g = state.gems || [];
    for (var i = 0; i < g.length; i++) if (g[i][0] === b && g[i][1] === c && g[i][2] === v) return true;
    return false;
  }
  /* v1.1.0, finding 2 — the day a mark was made.
     v1.0.9 kept marks as bare [b,c,v] in two arrays, so the ONE list it
     promised could only ever be two blocks: order was known inside each array
     and unknown between them. A verse marked minutes ago could sit ninth,
     below eight older hearts — the exact retrieval problem Gems exists to
     solve (v16.1 §1).
     The mark now records its own day. Kept in a separate map rather than a
     fourth element, because the triples are joined as keys in three places and
     a fourth element would quietly change every one of them. */
  function markKey(kind, b, c, v) { return kind + '|' + b + ':' + c + ':' + v; }
  /* The MOMENT, not the day.
     A first cut stored the day only, and every mark made on one day tied — so
     the sort fell back to which array happened to be walked first, and the two
     stacked drawers came straight back for anything marked today. A man marks a
     dozen verses in one sitting; the day cannot tell them apart. Found in a
     screenshot of the real list, not by a check. */
  function markStamp(state, kind, b, c, v, now) {
    if (!state.markAt) state.markAt = {};
    state.markAt[markKey(kind, b, c, v)] = (now ? new Date(now) : new Date()).getTime();
  }
  function markUnstamp(state, kind, b, c, v) {
    if (state.markAt) delete state.markAt[markKey(kind, b, c, v)];
  }
  function markDate(state, kind, b, c, v) {
    return (state.markAt && state.markAt[markKey(kind, b, c, v)]) || null;
  }

  function toggleGem(state, b, c, v, now) {
    if (!state.gems) state.gems = [];
    for (var i = 0; i < state.gems.length; i++) {
      var f = state.gems[i];
      if (f[0] === b && f[1] === c && f[2] === v) {
        state.gems.splice(i, 1); markUnstamp(state, 'g', b, c, v); return false;
      }
    }
    state.gems.push([b, c, v]);
    markStamp(state, 'g', b, c, v, now);
    return true;
  }

  // ---------- v1.0.9: where you are in the chapter (item 13) ----------
  // Counted the same inclusive way as the two lines above it: the verse on
  // screen is one of the verses that remain.
  function chapterInfo(b, c, v) {
    var chs = COUNTS[b][1];
    return { chapter: c + 1, chapters: chs.length, remain: chs[c] - v, size: chs[c] };
  }

  // v1.0.3: how many verses of ONE book are still unread inside a plan's scope.
  // Counting only — it reads the plan and changes nothing, exactly like
  // planRemaining above. Verses of the book that fall outside the plan's scope
  // are not counted, so a plan covering half a book reports only its own half.
  function planBookRemaining(plan, bookIndex) {
    if (!plan || bookIndex == null) return 0;
    var start = BOOK_OFFSET[bookIndex];
    var end = (bookIndex + 1 < 66) ? BOOK_OFFSET[bookIndex + 1] : TOTAL_VERSES;
    var bits = bitsFromB64(plan.read, plan.size);
    var n = 0;
    for (var gi = start; gi < end; gi++) {
      var pos = scopePos(plan, gi);
      if (pos >= 0 && !bitGet(bits, pos)) n++;
    }
    return n;
  }

  // Next unread in-order verse for a plan (advances past already-read).
  function planNextIndex(plan) {
    var bits = bitsFromB64(plan.read, plan.size);
    var p = plan.pointer;
    while (p < plan.size && bitGet(bits, p)) p++;
    if (p >= plan.size) return -1; // plan finished
    return scopeIndexAt(plan, p);
  }

  // ---------- v13: backward navigation (position, not memory) ----------
  // Prev is worked out from where the reader IS, so it survives a restore,
  // a restart, or a Catch me up jump. Nothing about it ever un-counts.

  // The next/previous verse inside a plan's own order, ignoring read marks —
  // a review trip walks past verses already read, including skipped ones.
  function planStepIndex(plan, gi, dir) {
    var pos = scopePos(plan, gi);
    if (pos < 0) {                       // reader is outside the scope: fall back
      return dir < 0 ? -1 : planNextIndex(plan);
    }
    var next = pos + dir;
    if (next < 0 || next >= plan.size) return -1;
    return scopeIndexAt(plan, next);
  }
  function planPrevIndex(plan, gi) { return planStepIndex(plan, gi, -1); }
  function planNextInOrder(plan, gi) { return planStepIndex(plan, gi, 1); }

  // Book mode steps across book boundaries (v13 decision B); it stops for
  // good at Genesis 1:1, since nothing stands before it.
  function bookPrevRef(b, c, v) {
    if (v > 0) return [b, c, v - 1];
    if (c > 0) return [b, c - 1, COUNTS[b][1][c - 1] - 1];
    if (b > 0) {
      var pb = b - 1, pc = COUNTS[pb][1].length - 1;
      return [pb, pc, COUNTS[pb][1][pc] - 1];
    }
    return null;                          // Genesis 1:1
  }
  function bookNextRef(b, c, v) {
    if (v + 1 < COUNTS[b][1][c]) return [b, c, v + 1];
    if (c + 1 < COUNTS[b][1].length) return [b, c + 1, 0];
    if (b + 1 < COUNTS.length) return [b + 1, 0, 0];
    return null;                          // Revelation 22:21
  }

  // ---------- v13: merging two states ----------
  // Restore can ADD instead of REPLACE. The rule is per verse, not per code:
  // a verse read on either side is read; the longer streak wins; the further
  // position wins. Nothing true is ever thrown away, so pasting a stale code
  // into an up-to-date device is harmless.
  function orBits(aStr, bStr, n) {
    var A = bitsFromB64(aStr, n), B = bitsFromB64(bStr, n);
    for (var i = 0; i < A.length; i++) A[i] |= B[i];
    return b64FromBits(A);
  }
  function samePlan(x, y) {
    return x.name === y.name && x.scopeType === y.scopeType && x.size === y.size;
  }
  function mergeStates(mine, theirs) {
    var out = JSON.parse(JSON.stringify(mine));

    // Verses read anywhere — union.
    out.globalRead = orBits(mine.globalRead, theirs.globalRead, TOTAL_VERSES);

    // v1.0.4 — the lap and the completions. Nothing is ever lost here either:
    // the lap is a union like globalRead, and a book's completion count takes
    // whichever device saw more. Merge stays safe in both directions.
    migrate(out); migrate(mine); migrate(theirs);
    out.lap = orBits(mine.lap, theirs.lap, TOTAL_VERSES);
    for (var cb = 0; cb < 66; cb++) {
      var mc = (mine.completions && mine.completions[cb]) || 0;
      var tc = (theirs.completions && theirs.completions[cb]) || 0;
      if (mc || tc) out.completions[cb] = Math.max(mc, tc);
    }
    out.declared = Math.max(mine.declared || 0, theirs.declared || 0);
    out.declaredAsked = !!(mine.declaredAsked || theirs.declaredAsked);
    // The day log is a record of what WAS read; the fuller day wins.
    out.dayLog = {};
    [mine.dayLog || {}, theirs.dayLog || {}].forEach(function (log) {
      for (var d in log) out.dayLog[d] = Math.max(out.dayLog[d] || 0, log[d]);
    });
    // A badge already looked at on either device stays looked at.
    var bs = {};
    (mine.badgeSeen || []).concat(theirs.badgeSeen || []).forEach(function (id) { bs[id] = 1; });
    out.badgeSeen = Object.keys(bs);

    // Streak — the longer one, and the later reading day.
    out.streak = {
      days: Math.max(mine.streak.days || 0, theirs.streak.days || 0),
      last: (theirs.streak.last || '') > (mine.streak.last || '') ? theirs.streak.last : mine.streak.last
    };

    // Today's counter — only comparable on the same day.
    if (theirs.today && theirs.today.date === mine.today.date) {
      var seen = (mine.today.seen || []).slice();
      (theirs.today.seen || []).forEach(function (g) { if (seen.indexOf(g) < 0) seen.push(g); });
      out.today = { date: mine.today.date, count: Math.max(mine.today.count, theirs.today.count), seen: seen };
    } else if (theirs.today && theirs.today.date > mine.today.date) {
      // Carry the seen list too, or a verse already counted on that day could
      // be counted a second time here — §2d says re-reading never re-counts.
      out.today = { date: theirs.today.date, count: theirs.today.count, seen: (theirs.today.seen || []).slice() };
    }

    // Book bookmarks — whichever is further through the book.
    for (var k in theirs.positions) {
      var t = theirs.positions[k], m = out.positions[k];
      if (!m || refToIndex(+k, t[0], t[1]) > refToIndex(+k, m[0], m[1])) out.positions[k] = t.slice();
    }

    // Favorites — both lists, joined, mine first, no duplicates.
    var seen = {};
    out.favorites.forEach(function (r) { seen[r.join(',')] = 1; });
    (theirs.favorites || []).forEach(function (r) {
      if (!seen[r.join(',')]) { out.favorites.push(r.slice()); seen[r.join(',')] = 1; }
    });

    /* v1.1.0, finding 5 — found by a test written for finding 3.
       v1.0.9 shipped Gems of Light and taught mergeStates nothing about them,
       so ⚡ marks made on the other phone were silently dropped by a Merge —
       the one path the app describes as "nothing was lost". A ♥ survived and a
       ⚡ did not, which is the same drawer fault as finding 2 wearing a
       different coat. Unioned exactly like favourites. */
    var gseen = {};
    out.gems = (out.gems || []).slice();
    out.gems.forEach(function (r) { gseen[r.join(',')] = 1; });
    (theirs.gems || []).forEach(function (r) {
      if (!gseen[r.join(',')]) { out.gems.push(r.slice()); gseen[r.join(',')] = 1; }
    });

    // Plans — matched by name + scope + size, never by id alone, since two
    // devices number their plans independently.
    (theirs.plans || []).forEach(function (tp) {
      var mine_ = null;
      for (var i = 0; i < out.plans.length; i++) if (samePlan(out.plans[i], tp)) { mine_ = out.plans[i]; break; }
      if (!mine_) {
        var copy = JSON.parse(JSON.stringify(tp));
        copy.id = 'p' + (++out.planSeq);
        out.plans.push(copy);
        return;
      }
      mine_.read = orBits(mine_.read, tp.read, mine_.size);
      // The lower pointer is the safe one: planNextIndex skips read verses
      // anyway, so nothing unread can be stranded behind it.
      mine_.pointer = Math.min(mine_.pointer, tp.pointer);
      if (tp.todayDate === mine_.todayDate) mine_.todayCount = Math.max(mine_.todayCount, tp.todayCount);
      else if ((tp.todayDate || '') > (mine_.todayDate || '')) { mine_.todayDate = tp.todayDate; mine_.todayCount = tp.todayCount; }
    });

    out.planSeq = Math.max(out.planSeq || 0, theirs.planSeq || 0, out.plans.length);
    if (!out.activePlanId && theirs.activePlanId) {
      for (var j = 0; j < out.plans.length; j++) {
        var tap = getPlan(theirs, theirs.activePlanId);
        if (tap && samePlan(out.plans[j], tap)) { out.activePlanId = out.plans[j].id; break; }
      }
    }
    /* v1.1.0, finding 3 — milestones must not be backfilled by a merge.
       v1.0.9 unioned the reading but left msBase as THIS device's baseline.
       The merge then earned badges this device had never earned, none of them
       in the baseline, and recordMilestones stamped every one of them with
       today's date — dating Acts and Romans to the day of the merge when they
       were finished weeks earlier on the other phone.
       A merge cannot know when the other device reached something. So it never
       guesses: dated records from either side are kept as they stand, and
       anything the merge newly earns joins the BASELINE undated. That is
       v16.1 §2.1's own rule — no backfill — applied to the path that missed it.
       Replace was always clean, because migrate() seeds msBase from scratch. */
    var ms = {}, k2;
    (mine.milestones || []).concat(theirs.milestones || []).forEach(function (m) {
      if (!m || !m.id) return;
      if (!ms[m.id] || (m.date && m.date < ms[m.id].date)) ms[m.id] = { id: m.id, date: m.date };
    });
    out.milestones = [];
    for (k2 in ms) out.milestones.push(ms[k2]);
    out.milestones.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    var base = {};
    (mine.msBase || []).concat(theirs.msBase || []).forEach(function (id) { base[id] = 1; });
    earnedBadges(out).forEach(function (id) { if (!ms[id]) base[id] = 1; });
    out.msBase = Object.keys(base);

    // The day a mark was made travels with it, and the earliest known day wins
    // — a verse is not newly marked because a second device met it later.
    out.markAt = {};
    [mine.markAt || {}, theirs.markAt || {}].forEach(function (src) {
      for (var mk in src) {
        if (!out.markAt[mk] || src[mk] < out.markAt[mk]) out.markAt[mk] = src[mk];
      }
    });

    // Seasons: one man, one season. The season standing on this device is kept,
    // and every former season from either device is preserved, dated, unduplicated.
    out.seasons = mergeSeasons(mine.seasons, theirs.seasons);

    /* The Secret Place never merges. A room is opened by its own three locks or
       not at all, and two rooms cannot be reconciled by a machine that can read
       neither. This device's room stands.

       v1.1.4, Decision 153 — but where there is NO room on this device there is
       nothing to reconcile, and dropping the one in the code threw away the
       whole room for no reason. A man merging his reading onto a new phone lost
       his letters silently. So: this device's room wins if it has one; if it has
       none, the room in the code comes across, still sealed, and Settings offers
       it exactly as a restore does. */
    out.room = mine.room || theirs.room || null;

    // Settings stay this device's own — card position and pop-up timing
    // belong to the device, not to the reading.
    return out;
  }

  // ---------- The one counting function ----------
  // Every "this verse was read" event goes through here.
  // opts: { planInOrder: planId|null, creditToday: true|false, now: ms|null }
  // Rules (v4/v5, unchanged in v6):
  //  - plan-mode in-order reading ALWAYS counts toward that plan
  //  - other reading counts toward a plan only if its countEverything is ON
  //  - unique verses only — a verse counts once per plan, ever
  //  - the daily counter counts every reading action (creditToday)
  function countRead(state, b, c, v, opts) {
    opts = opts || {};
    var gi = refToIndex(b, c, v);
    // v13 decision C — the counter means verses read today, not taps. Walking
    // back with ‹ Prev and forward again over the same verse cannot inflate it.
    if (opts.creditToday !== false) {
      if (!state.today.seen) state.today.seen = [];
      if (state.today.seen.indexOf(gi) < 0) {
        state.today.seen.push(gi);
        if (state.today.seen.length > 5000) state.today.seen.shift();
        creditDay(state, 1, opts.now);
      }
    }

    // Global read record
    var g = bitsFromB64(state.globalRead, TOTAL_VERSES);
    bitSet(g, gi);
    state.globalRead = b64FromBits(g);

    // v1.0.4: the lap — a SEPARATE record from globalRead, used only to count
    // completions. globalRead stays a lifetime record so "re-reading never
    // re-counts" still holds; the lap clears per book so a second reading of a
    // book can be counted as a second completion.
    lapMark(state, gi);

    // Plans
    for (var i = 0; i < state.plans.length; i++) {
      var plan = state.plans[i];
      var inOrder = opts.planInOrder === plan.id;
      if (!inOrder && !plan.countEverything) continue;
      var pos = scopePos(plan, gi);
      if (pos < 0) continue;
      var bits = bitsFromB64(plan.read, plan.size);
      if (!bitGet(bits, pos)) {
        bitSet(bits, pos);
        plan.read = b64FromBits(bits);
        planCreditToday(plan, 1, opts.now);   // v9: 🎯 moves only when the plan truly gains a verse
      }
      if (inOrder) {
        // move the pointer past everything already read
        var p = Math.max(plan.pointer, pos + 1);
        while (p < plan.size && bitGet(bits, p)) p++;
        plan.pointer = p;
      }
    }
  }

  // ---------- Catch Up (paper-Bible bridge, v5 §5b) ----------
  // Marks every unread verse in the plan from its start through the chosen
  // verse. Preview first; then apply.
  // v13.1: verseIndex added. Omitted (undefined/null) means the chapter's
  // last verse, which is exactly the old behaviour — so nothing that called
  // this with three arguments changes meaning.
  function catchUpEndIndex(bookIndex, chapterIndex, verseIndex) {
    var vCount = COUNTS[bookIndex][1][chapterIndex];
    var vi = (verseIndex === undefined || verseIndex === null) ? vCount - 1 : verseIndex;
    if (!(vi >= 0)) vi = 0;
    if (vi > vCount - 1) vi = vCount - 1;
    return CHAP_OFFSET[bookIndex][chapterIndex] + vi;
  }
  function catchUpPreview(plan, bookIndex, chapterIndex, verseIndex) {
    var lastGi = catchUpEndIndex(bookIndex, chapterIndex, verseIndex);
    var endPos = scopePos(plan, lastGi);
    if (endPos < 0) return { ok: false, count: 0 };
    var bits = bitsFromB64(plan.read, plan.size);
    var n = 0;
    for (var p = 0; p <= endPos; p++) if (!bitGet(bits, p)) n++;
    return { ok: true, count: n, endPos: endPos };
  }
  function catchUpApply(state, planId, bookIndex, chapterIndex, verseIndex, readToday, now) {
    var plan = getPlan(state, planId);
    if (!plan) return 0;
    var pv = catchUpPreview(plan, bookIndex, chapterIndex, verseIndex);
    if (!pv.ok || pv.count === 0) return 0;
    var bits = bitsFromB64(plan.read, plan.size);
    var marked = []; // global indices newly marked
    for (var p = 0; p <= pv.endPos; p++) {
      if (!bitGet(bits, p)) { bitSet(bits, p); marked.push(scopeIndexAt(plan, p)); }
    }
    plan.read = b64FromBits(bits);
    // pointer continues from the verse after
    var np = Math.max(plan.pointer, pv.endPos + 1);
    while (np < plan.size && bitGet(bits, np)) np++;
    plan.pointer = np;

    // Global record + cross-plan flow (countEverything plans only)
    var g = bitsFromB64(state.globalRead, TOTAL_VERSES);
    for (var m = 0; m < marked.length; m++) bitSet(g, marked[m]);
    state.globalRead = b64FromBits(g);

    /* v1.1.0, finding 6 — reported by Dickson, 5 September.
       THE LAP WAS NEVER MARKED HERE. countRead() calls lapMark() for every
       verse; catchUpApply() wrote globalRead and the plan and stopped. The lap
       is the record that banks a completion (lapMark clears the book and adds
       to completions when it fills), so a book finished with Catch me up was
       complete in globalRead, complete in the plan, and STILL SHOWED "not yet
       drawn" — no First Draw, no Well tier, no rank movement.
       In Dickson's own data: Genesis 1533/1533 in globalRead, 1446/1533 in the
       lap. The 87 verses he caught up on were the ones missing.
       Present since v1.0.4, when the lap was introduced. */
    for (var lm = 0; lm < marked.length; lm++) lapMark(state, marked[lm]);
    for (var i = 0; i < state.plans.length; i++) {
      var other = state.plans[i];
      if (other.id === planId || !other.countEverything) continue;
      var ob = bitsFromB64(other.read, other.size), touched = 0;
      for (var k = 0; k < marked.length; k++) {
        var pos = scopePos(other, marked[k]);
        if (pos >= 0 && !bitGet(ob, pos)) { bitSet(ob, pos); touched++; }
      }
      if (touched) {
        other.read = b64FromBits(ob);
        if (readToday) planCreditToday(other, touched, now);   // v9
      }
    }

    // Today's counter + streak, only if the reading truly happened today
    if (readToday) {
      creditDay(state, pv.count, now);
      planCreditToday(plan, pv.count, now);                    // v9
    }
    /* v1.1.3, F30 — reported by Dickson, 7 September, reproduced twice.
       The same shape of fault as v1.1.0's finding 6 directly above, one step
       further along. That one fixed the LAP, so a book caught up on stopped
       saying "not yet drawn". But the dated record is written by
       recordMilestones(), which the reading path calls after every counted
       verse and this path never called at all — so Exodus took its First Draw
       on the book card and never appeared in "the last five you banked".
       Banked here rather than at the caller, so every way into catch-up gets
       it, exactly as lapMark is handled above. */
    recordMilestones(state, now);
    return pv.count;
  }

  // ---------- Favorites ----------
  function favKey(r) { return r[0] + ':' + r[1] + ':' + r[2]; }
  function isFavorite(state, b, c, v) {
    for (var i = 0; i < state.favorites.length; i++) {
      var f = state.favorites[i];
      if (f[0] === b && f[1] === c && f[2] === v) return true;
    }
    return false;
  }
  function toggleFavorite(state, b, c, v, now) {
    for (var i = 0; i < state.favorites.length; i++) {
      var f = state.favorites[i];
      if (f[0] === b && f[1] === c && f[2] === v) {
        state.favorites.splice(i, 1); markUnstamp(state, 'f', b, c, v); return false;
      }
    }
    state.favorites.push([b, c, v]);
    markStamp(state, 'f', b, c, v, now);
    return true;
  }

  /* One row per verse, newest first — the single list v16.1 §1 asked for.
     A row carrying both marks takes the newer of the two.
     Marks made before v1.1.0 carry no date and cannot be given one; the app
     does not invent what it does not know. They sort below every dated mark,
     and among themselves a ⚡ outranks a bare ♥ — not a guess, a fact about
     the app's own history: the ⚡ mark did not exist before v1.0.9, so every
     undated gem is newer than every undated favourite. */
  function markDay(ms) {
    if (!ms) return null;
    var d = new Date(ms);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function gemRows(state) {
    var seen = {}, rows = [], i;
    function add(r, isGem, isFav) {
      var k = r[0] + ',' + r[1] + ',' + r[2], row = seen[k];
      var d = markDate(state, isGem ? 'g' : 'f', r[0], r[1], r[2]);
      if (row) {
        row.gem = row.gem || isGem; row.fav = row.fav || isFav;
        if (d && (!row.date || d > row.date)) row.date = d;
        return;
      }
      seen[k] = { ref: r, gem: isGem, fav: isFav, date: d, seq: rows.length };
      rows.push(seen[k]);
    }
    var g = state.gems || [], f = state.favorites || [];
    for (i = 0; i < g.length; i++) add(g[i], true, false);
    for (i = 0; i < f.length; i++) add(f[i], false, true);
    rows.sort(function (a, b) {
      if (a.date && b.date) return b.date - a.date || b.seq - a.seq;
      if (a.date) return -1;
      if (b.date) return 1;
      if (a.gem !== b.gem) return a.gem ? -1 : 1;
      return b.seq - a.seq;
    });
    return rows;
  }

  // ---------- Verse of the Day / Moment sources ----------
  // Drawn from Psalms (18) & Proverbs (19), or from Favorites.
  function ppRandomIndex(seed) {
    var psStart = BOOK_OFFSET[18], prEnd = BOOK_OFFSET[20];
    var span = prEnd - psStart;
    var x = seed % span;
    return psStart + x;
  }
  function hashDate(dstr) {
    var h = 0;
    for (var i = 0; i < dstr.length; i++) { h = (h * 31 + dstr.charCodeAt(i)) >>> 0; }
    return h;
  }
  function verseOfTheDay(state, now) {
    var t = todayStr(now);
    if (state.vod && state.vod.date === t) return state.vod.ref;
    var ref = indexToRef(ppRandomIndex(hashDate(t)));
    state.vod = { date: t, ref: ref };
    return ref;
  }
  function momentVerse(state) {
    var src = state.settings.momentSource || 'plan';
    if (src === 'plan') {
      // Serve the active plan's next verse; fall back to Psalms & Proverbs
      // when no plan is active or the plan is finished.
      var plan = state.activePlanId ? getPlan(state, state.activePlanId) : null;
      if (plan) {
        var gi = planNextIndex(plan);
        if (gi >= 0) return indexToRef(gi);
      }
    }
    if (src === 'fav' && state.favorites.length) {
      return state.favorites[Math.floor(Math.random() * state.favorites.length)];
    }
    return indexToRef(ppRandomIndex(Math.floor(Math.random() * 1e9)));
  }
  function randomVerse() { return indexToRef(Math.floor(Math.random() * TOTAL_VERSES)); }

  // ---------- Book mode positions ----------
  function bookPosition(state, b) { return state.positions[b] || [0, 0]; }
  function bookAdvance(state, b) {
    var p = bookPosition(state, b), c = p[0], v = p[1];
    v++;
    if (v >= COUNTS[b][1][c]) { v = 0; c++; }
    if (c >= COUNTS[b][1].length) { c = 0; v = 0; } // wrap to the beginning
    state.positions[b] = [c, v];
    return [c, v];
  }

  // ============================================================
  //  Backup codes — reads BB1., writes BB2.
  // ============================================================
  //
  // Decision 84 — reads BB1., writes BB2.
  // Decision 85 — backward is a duty; forward is refused BY NAME, never called
  //   invalid. A generic "invalid code" is a lie that could make a man throw
  //   away his only copy.
  // Decision 82 — the code is exactly the code. No padding, no ceiling, no
  //   dead weight. Shorter when there is less to say.
  // Decision 83 (+ Ruling 94) — a book is described in whichever of three
  //   shapes is SMALLEST, and all three are exact:
  //     · a clean run from the book's start  -> one number
  //     · a handful of scattered verses      -> a list of them
  //     · anything else                      -> its full detail
  //   Small by default, exact always. No promise is broken; "re-reading never
  //   re-counts" still holds to the verse.
  // Ruling 93 — the same treatment reaches all FOUR bulky fields, not one:
  //   globalRead, the lap, today's verses, and each plan's own record.

  function _b64Len(nBytes) { return Math.ceil(nBytes / 3) * 4; }

  function packRanges(b64, n, ranges) {
    var bits = bitsFromB64(b64, n), out = [], any = false;
    for (var k = 0; k < ranges.length; k++) {
      var s = ranges[k][0], len = ranges[k][1];
      var cnt = 0, last = -1, list = [], i;
      for (i = 0; i < len; i++) {
        if (bitGet(bits, s + i)) { cnt++; last = i; list.push(i); }
      }
      if (cnt === 0) { out.push(0); continue; }
      any = true;
      if (last === cnt - 1) { out.push(cnt); continue; }        // a clean run from the start
      var sparseCost = JSON.stringify(list).length + 5;
      var fullCost = _b64Len(Math.ceil(len / 8)) + 7;
      if (sparseCost <= fullCost) { out.push(['s', list]); continue; }
      var sub = bitsNew(len);
      for (i = 0; i < len; i++) if (bitGet(bits, s + i)) bitSet(sub, i);
      out.push(['f', b64FromBits(sub)]);
    }
    return any ? out : null;         // nothing set at all travels as nothing
  }
  function unpackRanges(packed, n, ranges) {
    if (!packed) return '';          // matches a state that never wrote one
    var bits = bitsNew(n);
    for (var k = 0; k < ranges.length && k < packed.length; k++) {
      var s = ranges[k][0], len = ranges[k][1], e = packed[k], i;
      if (!e) continue;
      if (typeof e === 'number') { for (i = 0; i < e && i < len; i++) bitSet(bits, s + i); continue; }
      if (e[0] === 's') { for (i = 0; i < e[1].length; i++) if (e[1][i] < len) bitSet(bits, s + e[1][i]); continue; }
      if (e[0] === 'f') {
        var sub = bitsFromB64(e[1], len);
        for (i = 0; i < len; i++) if (bitGet(sub, i)) bitSet(bits, s + i);
      }
    }
    return b64FromBits(bits);
  }
  function bookRanges() {
    var r = [];
    for (var b = 0; b < 66; b++) { var x = bookRange(b); r.push([x[0], x[1] - x[0]]); }
    return r;
  }

  // Today's verses are read in order far more often than not, so a run of 274
  // of them is two numbers rather than 274.
  function packSeen(seen) {
    if (!seen || !seen.length) return null;
    var a = seen.slice().sort(function (x, y) { return x - y; });
    if (a[a.length - 1] - a[0] + 1 === a.length) return ['r', a[0], a[a.length - 1]];
    return ['l', seen];
  }
  function unpackSeen(p) {
    if (!p) return [];
    if (p[0] === 'r') { var out = []; for (var i = p[1]; i <= p[2]; i++) out.push(i); return out; }
    return p[1].slice();
  }

  // The day log is dates against counts, and the dates are nearly all
  // consecutive — so one date and a run of offsets replaces 800 of them.
  function packLog(log) {
    var keys = Object.keys(log || {}).sort();
    if (!keys.length) return null;
    var base = keys[0], out = [];
    for (var i = 0; i < keys.length; i++) out.push([daysBetween(base, keys[i]), log[keys[i]]]);
    return [base, out];
  }
  function unpackLog(p) {
    var out = {};
    if (!p) return out;
    for (var i = 0; i < p[1].length; i++) out[addDays(p[0], p[1][i][0])] = p[1][i][1];
    return out;
  }

  var BADGE_SHORT = { 'streak': 's', 'rank': 'k', 'road': 'r', 'well': 'w' };
  var BADGE_LONG = { s: 'streak', k: 'rank', r: 'road', w: 'well' };
  function packBadges(ids) {
    return (ids || []).map(function (id) {
      var i = id.indexOf(':');
      var head = id.slice(0, i), tail = id.slice(i + 1);
      return BADGE_SHORT[head] ? BADGE_SHORT[head] + tail : id;
    });
  }
  function unpackBadges(ids) {
    return (ids || []).map(function (id) {
      var head = BADGE_LONG[id.charAt(0)];
      return head ? head + ':' + id.slice(1) : id;
    });
  }

  /* v1.1.0 — the mark dates, packed.
     Written plainly they were the LARGEST field in the code, bigger than a
     year of reading, to record which of a dozen verses was marked first.
     Each becomes one character of kind, the verse's global index in base 36,
     and the day in base 36 counted from 2020. */
  var MARK_EPOCH = Date.UTC(2020, 0, 1);   // minutes from here, in base 36
  function packMarks(map) {
    var out = [];
    for (var k in (map || {})) {
      var bits = k.split('|'); if (bits.length !== 2) continue;
      var r = bits[1].split(':');
      var gi = refToIndex(+r[0], +r[1], +r[2]);
      out.push(bits[0] + gi.toString(36) + '.' +
        Math.round((map[k] - MARK_EPOCH) / 60000).toString(36));
    }
    return out.join(';');
  }
  function unpackMarks(packed) {
    var out = {};
    if (!packed) return out;
    String(packed).split(';').forEach(function (item) {
      if (!item) return;
      var kind = item.charAt(0), rest = item.slice(1).split('.');
      var ref = indexToRef(parseInt(rest[0], 36));
      out[markKey(kind, ref[0], ref[1], ref[2])] = MARK_EPOCH + parseInt(rest[1], 36) * 60000;
    });
    return out;
  }

  function packPlan(plan) {
    var p = JSON.parse(JSON.stringify(plan));
    p.read = packRanges(plan.read, plan.size, [[0, plan.size]]);
    return p;
  }
  function unpackPlan(p) {
    var plan = JSON.parse(JSON.stringify(p));
    plan.read = unpackRanges(p.read, p.size, [[0, p.size]]);
    return plan;
  }

  function toPacked(state) {
    var R = bookRanges();
    return {
      v: 2,
      t: [state.today.date, state.today.count, packSeen(state.today.seen)],
      s: [state.streak.days, state.streak.last],
      po: state.positions,
      f: state.favorites,
      gm: state.gems || [],
      G: packRanges(state.globalRead, TOTAL_VERSES, R),
      L: packRanges(state.lap, TOTAL_VERSES, R),
      P: (state.plans || []).map(packPlan),
      A: state.activePlanId,
      S: state.settings,
      vo: state.vod,
      q: state.planSeq,
      C: state.completions,
      d: state.declared,
      da: state.declaredAsked,
      DL: packLog(state.dayLog),
      B: packBadges(state.badgeSeen),
      ld: state.ladder,
      ls: state.lapSeeded,
      M: state.milestones || [],
      MB: packBadges(state.msBase || []),
      gc: state.gapClaim || null,
      // v1.1.0 — the day a mark was made, and the season a man is in.
      // The room is NOT here: it travels sealed, after a ~ (v0.4 §9).
      ma: packMarks(state.markAt),
      se: state.seasons || null
    };
  }
  function fromPacked(p) {
    var R = bookRanges();
    return {
      v: 1,
      today: { date: p.t[0], count: p.t[1], seen: unpackSeen(p.t[2]) },
      streak: { days: p.s[0], last: p.s[1] },
      positions: p.po || {},
      favorites: p.f || [],
      gems: p.gm || [],
      globalRead: unpackRanges(p.G, TOTAL_VERSES, R),
      lap: unpackRanges(p.L, TOTAL_VERSES, R),
      plans: (p.P || []).map(unpackPlan),
      activePlanId: p.A || null,
      settings: p.S || {},
      vod: p.vo || null,
      planSeq: p.q || 0,
      completions: p.C || {},
      declared: p.d || 0,
      declaredAsked: !!p.da,
      dayLog: unpackLog(p.DL),
      badgeSeen: unpackBadges(p.B),
      ladder: p.ld || { lastCheck: null, offer: null },
      lapSeeded: !!p.ls,
      milestones: p.M || [],
      msBase: unpackBadges(p.MB),
      gapClaim: p.gc || null,
      markAt: unpackMarks(p.ma),
      seasons: p.se || { now: null, past: [] },
      prayRun: null,                // a prayer belongs to the phone it was prayed on
      audioRun: null                // and so does a reading aloud
    };
  }

  function _encode(obj, prefix) {
    var json = JSON.stringify(obj);
    var bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(json)
      : Buffer.from(json, 'utf8');
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return prefix + _btoa(bin);
  }
  function _decode(s) {
    var bin = _atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var json = typeof TextDecoder !== 'undefined'
      ? new TextDecoder().decode(bytes)
      : Buffer.from(bytes).toString('utf8');
    return JSON.parse(json);
  }

  function exportCode(state) { return _encode(toPacked(state), 'BB2.'); }
  // Kept so a v1.0.8 device can still be handed something it understands, and
  // so the tests can prove BB1. reading is untouched.
  function exportCodeV1(state) {
    var s = JSON.parse(JSON.stringify(state));
    delete s.prayRun; delete s.gems; delete s.milestones; delete s.msBase; delete s.gapClaim;
    delete s.markAt; delete s.seasons; delete s.room; delete s.audioRun;      // v1.1.0
    return _encode(s, 'BB1.');
  }

  // What kind of code is this? Returns 'bb1' | 'bb2' | 'newer' | 'unreadable'.
  // 'newer' is the whole point of Decision 85: his code is untouched and
  // unblamed, and the app says plainly that it was made by a newer DrawNigh.
  function codeKind(code) {
    if (!code) return 'unreadable';
    var s = splitCode(code).body;                      // v1.1.0: a sealed room may follow a ~
    var m = /^BB(\d+)\./.exec(s);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n === 1) return 'bb1';
      if (n === 2) return 'bb2';
      return 'newer';
    }
    return 'bb1';                    // tolerant: a bare BB1.-era body, prefix lost in a paste
  }

  function fillDefaults(st) {
    var fresh = newState();
    for (var k in fresh) if (!(k in st)) st[k] = fresh[k];
    if (!st.settings) st.settings = {};
    if (!st.settings.siteMins) st.settings.siteMins = 20;
    if (st.settings.siteEnabled === undefined) st.settings.siteEnabled = true;
    if (st.settings.showNotes === undefined) st.settings.showNotes = false;   // v13
    if (!st.today.seen) st.today.seen = [];                                   // v13
    if (st.settings.cardPos === undefined) st.settings.cardPos = null;        // v13
    // v7: three-way verse source. Legacy 'pp'/'fav' values remain valid;
    // only a missing value gets the new default.
    if (!st.settings.momentSource) st.settings.momentSource = 'plan';
    for (var p = 0; p < st.plans.length; p++) {
      var pl = st.plans[p];
      if (!pl.size) pl.size = scopeSize(pl);
      // A Well has no daily number by design and must never be given one.
      if (!pl.target && pl.scopeType !== 'well') pl.target = Math.ceil(pl.size / (pl.days || 365));
      if (pl.todayCount === undefined) { pl.todayCount = 0; pl.todayDate = null; }  // v9
    }
    return st;
  }

  function importCode(code) {
    if (!code) return null;
    var kind = codeKind(code);
    if (kind === 'newer' || kind === 'unreadable') return null;
    var parts = splitCode(code);
    var s = parts.body.replace(/^BB\d+\./, '');
    try {
      var raw = _decode(s);
      if (!raw || typeof raw !== 'object') return null;
      var st;
      if (kind === 'bb2' || raw.v === 2) {
        if (!raw.t || !raw.s) return null;
        st = fromPacked(raw);
      } else {
        if (raw.v !== 1) return null;
        st = raw;
      }
      st = fillDefaults(st);
      // The room arrives sealed and stays sealed. Nothing is announced —
      // restore is silent (v0.4 §9). It is opened from Settings, with the PIN.
      if (parts.room) st.room = { door: null, knock: null, sealed: parts.room };
      return st;
    } catch (e) { return null; }
  }

  // ---------- v1.0.9: date-aware codes (v16 §1, Ruling 92) ----------
  // The app has no server and nothing to verify against. When a restored code
  // shows days it has no record of, the only honest move is to say so and let
  // the man answer for himself. "Let the honest claim be on them."
  //
  // Ruling 92 — Decision 81 assumed an old code carries no date at all. It
  // does: streak.last is the day it last saw reading, which is exactly the
  // anchor the gap needs. So a BB1. code carrying a date takes the full prompt,
  // and only a code genuinely without one takes the apology.
  function codeAnchorDate(st) {
    var best = null;
    function take(d) { if (d && (!best || d > best)) best = d; }
    if (st.streak) take(st.streak.last);
    if (st.today) take(st.today.date);
    if (st.vod) take(st.vod.date);
    if (st.ladder) take(st.ladder.lastCheck);
    var keys = Object.keys(st.dayLog || {});
    for (var i = 0; i < keys.length; i++) take(keys[i]);
    for (var p = 0; p < (st.plans || []).length; p++) take(st.plans[p].todayDate);
    return best;
  }
  // The gap is the days AFTER the code's last known day and BEFORE today —
  // the days the app has no record of and no way to check.
  function gapInfo(st, now) {
    var anchor = codeAnchorDate(st);
    if (!anchor) return { anchor: null, days: 0, dated: false };
    var span = daysBetween(anchor, todayStr(now));
    return { anchor: anchor, days: Math.max(0, span - 1), dated: true };
  }
  // Yes: the days are counted and added, and the streak is left alive so
  // today's reading carries it on. No: it breaks, and today starts again at one.
  function gapClaim(state, info, claimed, now) {
    if (!info || !info.days) return state;
    if (claimed) {
      state.streak.days = (state.streak.days || 0) + info.days;
      state.streak.last = yesterdayStr(now);        // alive, and today extends it
      state.gapClaim = { at: todayStr(now), days: info.days, anchor: info.anchor };
    } else {
      state.streak.days = 0;
      state.streak.last = null;
      state.gapClaim = null;
    }
    return state;
  }
  // Decision 77 — the door never seals. Decision 78 — a confession costs a man
  // nothing he really read. Honesty never costs a day that was truly kept.
  // Counted from the day of the restore INCLUSIVE — a man who restored this
  // morning and read this morning read today, and the rule is that honesty
  // never costs him a day he really read.
  function daysReadSince(state, dateStr, now) {
    var n = 0, t = todayStr(now);
    var log = state.dayLog || {};
    for (var d in log) if (d >= dateStr && d <= t && log[d] > 0) n++;
    if ((state.today.count || 0) > 0 && t >= dateStr && !(log[t] > 0)) n++;
    return n;
  }
  function confessGap(state, now) {
    if (!state.gapClaim) return null;
    var n = daysReadSince(state, state.gapClaim.at, now);
    // The floor: never below 1 on a day the reader has read. The man who
    // restores an old code and confesses the same hour still read today.
    if ((state.today.count || 0) > 0) n = Math.max(1, n);
    state.streak.days = n;
    state.streak.last = n > 0 ? todayStr(now) : null;
    state.gapClaim = null;
    return n;
  }

  // ---------- v1.0.9: the hidden ladder test mode (v15.2 §3.4) ----------
  // The ladder's rungs run from five days to a year, so real use cannot reach
  // them. This writes a run of low days into the log so a rung can be seen.
  // Hidden on purpose, and it only ever writes days that WERE read — it cannot
  // invent a debt, because the app has no concept of one.
  function testSeedGap(state, days, perDay, now) {
    var t = todayStr(now);
    for (var i = 1; i <= days; i++) {
      var d = dayBefore(t, i);
      if (perDay > 0) state.dayLog[d] = perDay; else delete state.dayLog[d];
    }
    state.ladder.lastCheck = null;
    return ladderOffer(state, now);
  }

  // ---------- Storage (extension storage, localStorage fallback) ----------
  var KEY = 'drawnigh-state-v1';
  function _ext() {
    if (typeof browser !== 'undefined' && browser.storage) return browser.storage.local;
    if (typeof chrome !== 'undefined' && chrome.storage) return chrome.storage.local;
    return null;
  }
  function loadState(cb) {
    var ext = _ext();
    if (ext) {
      var res = ext.get(KEY, function (obj) {
        var st = (obj && obj[KEY]) ? obj[KEY] : newStateFull();
        rollover(st); cb(st);
      });
      // Firefox returns a promise when no callback API is used
      if (res && typeof res.then === 'function') {
        res.then(function (obj) {
          var st = (obj && obj[KEY]) ? obj[KEY] : newStateFull();
          rollover(st); cb(st);
        });
      }
      return;
    }
    var st;
    try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
    if (!st) st = newStateFull();
    rollover(st); cb(st);
  }
  function saveState(state, cb) {
    var ext = _ext();
    if (ext) {
      var obj = {}; obj[KEY] = state;
      var res = ext.set(obj, cb || function () {});
      if (res && typeof res.then === 'function' && cb) res.then(cb);
      return;
    }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (cb) cb();
  }

  // ================= v1.1.0 =================

  // ---------- Seasons (v16.1 §3) ----------
  // What a man is reaching toward, across months. One at a time. Setting a new
  // one never destroys the old — it is archived in dated succession, and the
  // archive lives wherever the season is set, so a man with no room has one too.
  //
  // It is a GENERAL feature on purpose. A season drawn from The Secret Place
  // would have been a tell: a line on the main screen that could only have come
  // from one place. Any reader can set one, so a season on screen says nothing
  // about whether a room exists.
  function seasonSet(state, text, now) {
    if (!state.seasons) state.seasons = { now: null, past: [] };
    var t = String(text == null ? '' : text).trim();
    var cur = state.seasons.now;
    if (cur && cur.text) {
      state.seasons.past.push({ text: cur.text, from: cur.from, to: todayStr(now) });
      if (state.seasons.past.length > 200) state.seasons.past = state.seasons.past.slice(-200);
    }
    state.seasons.now = t ? { text: t, from: todayStr(now) } : null;
    return state.seasons.now;
  }
  function seasonCurrent(state) {
    return (state.seasons && state.seasons.now) || null;
  }
  // One man, one season. Two devices are reconciled by keeping the season that
  // was set most recently, and every former season from either side is kept.
  function mergeSeasons(mine, theirs) {
    mine = mine || { now: null, past: [] };
    theirs = theirs || { now: null, past: [] };
    var out = { now: null, past: [] }, seen = {};
    function take(list) {
      (list || []).forEach(function (s) {
        if (!s || !s.text) return;
        var k = s.text + '|' + (s.from || '');
        if (seen[k]) return;
        seen[k] = 1; out.past.push({ text: s.text, from: s.from, to: s.to });
      });
    }
    take(mine.past); take(theirs.past);
    var a = mine.now, b = theirs.now;
    if (a && b) {
      var newer = (b.from || '') > (a.from || '') ? b : a;
      var older = newer === b ? a : b;
      var ok = older.text + '|' + (older.from || '');
      if (older.text !== newer.text && !seen[ok]) {
        seen[ok] = 1; out.past.push({ text: older.text, from: older.from, to: newer.from });
      }
      out.now = { text: newer.text, from: newer.from };
    } else {
      out.now = a || b || null;
      if (out.now) out.now = { text: out.now.text, from: out.now.from };
    }
    out.past.sort(function (x, y) { return (x.from || '') < (y.from || '') ? -1 : 1; });
    if (out.past.length > 200) out.past = out.past.slice(-200);
    return out;
  }

  // ---------- Base32 for the square (v17, Decision 101) ----------
  // QR's alphanumeric table holds uppercase letters, digits and nine symbols and
  // nothing else, so a base64 code falls to byte mode and the smaller column of
  // the capacity table. Base32 is about 20% more characters and buys the
  // alphanumeric table — which means a smaller square at STRONGER error
  // correction. A longer code that makes a tougher picture.
  //
  // The square only. Copy and file keep the format they have.
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32Encode(str) {
    var out = '', bits = 0, val = 0, i;
    for (i = 0; i < str.length; i++) {
      val = (val << 8) | (str.charCodeAt(i) & 255); bits += 8;
      while (bits >= 5) { out += B32.charAt((val >>> (bits - 5)) & 31); bits -= 5; }
    }
    if (bits > 0) out += B32.charAt((val << (5 - bits)) & 31);
    return out;
  }
  function b32Decode(s) {
    var out = '', bits = 0, val = 0, i, idx;
    s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
    for (i = 0; i < s.length; i++) {
      idx = B32.indexOf(s.charAt(i));
      if (idx < 0) continue;
      val = (val << 5) | idx; bits += 5;
      if (bits >= 8) { out += String.fromCharCode((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return out;
  }

  // ---------- The squares (v17, Decisions 102 and 103) ----------
  /* v1.1.3, DECISION 142 — THE BUDGET GOES BACK TO VERSION 40.
     This reverses v1.1.1's Decision 112, and it is reversed on evidence rather
     than on second thoughts, so both halves are kept here.

     Decision 112 set the budget at version 20 (702 characters) because
     v1.1.0's version-40 square could not be scanned at all — measured on a
     real phone against a ladder of six squares, where version 26 was the last
     that read and only with a dedicated scanner app.

     On 7 September 2026 that ladder was run again, on the phone the feature
     exists to serve. The real backup square read with the phone's ORDINARY
     camera app, and so did generated squares at versions 5, 6, 26 and 40 —
     version 40 twice over, on two separately generated squares, with the
     plain camera, with Google Lens and with CamScanner. The premise Decision
     112 rested on no longer holds on this hardware.

     What that premise was costing: a code carrying a room ran to 22 squares,
     and 22 squares is 22 scans. At version 40 the same code is a handful.
     Dickson's ruling: "the QR build for the app should be version 40 and not
     22 anymore" — and, on being asked whether one square should therefore be
     the ceiling: "a plain back-up can be more than one — the QR code is just a
     channel to move data. We can't for only one QR code — the user is already
     aware of how many QR code the transfer will take."

     So the square count is whatever the data needs, at version 40 apiece, with
     the count stated. 2420 alphanumeric characters fit a version-40 square at
     error correction Q (measured against the shipped qrcode.js, not read off a
     table); the header "DN2*TAG*12*12*" costs seventeen of them, and the
     budget is set at 2400 to leave room for a three-figure count.

     Decision 103 is untouched: above three squares the app states the scan
     count and offers the file as the easier road. It does not refuse.

     Not changed, and deliberately: the squares are stepped through BY HAND.
     Dickson considered advancing them automatically and rejected it himself —
     "the phone may not capture it on time before it changes." */
  var QR_PAYLOAD = 2400;

  /* v1.1.4, Decision 155 — F34. Version 40 read on the phone, but only just:
     4x zoom and ten to fifteen seconds, and two of the three squares refused
     until they were tried twice. The one that read first time was the short
     remainder, drawn at a far lower version. So version 40 is at the EDGE, not
     comfortably inside it — which is what v1.1.0's controlled test measured
     when it put the threshold at version 26.

     The answer is not to overturn Decision 142 and make everyone scan more
     squares. It is to let a reader fighting his camera choose. Three budgets,
     each measured against the shipped qrcode.js rather than read off a table,
     each leaving nineteen characters for the worst-case header
     "DN2*TAGTAG*123*123*":

       fewest    2400 of 2420  →  version 40, 177 modules  (today's behaviour)
       balanced  1410 of 1429  →  version 30, 137 modules
       easiest   1075 of 1094  →  version 26, 121 modules

     Nobody is made to scan more squares than he needs, and a man in trouble
     has a way out. Decision 103's warning above three squares simply fires. */
  var QR_MODES = { fewest: 2400, balanced: 1410, easiest: 1075 };
  function qrBudget(mode) {
    var n = QR_MODES[String(mode || 'fewest')];
    return n || QR_PAYLOAD;
  }

  /* The square carries the code's BYTES, not its text.
     A first cut base32-encoded the base64 string itself, which is encoding an
     encoding: base64 text is 8 bits a character, so re-encoding it at 5 bits a
     character costs 60% instead of 20% and pushed an ordinary code to two
     squares. Decoding the base64 back to bytes first restores the arithmetic
     the design was built on — base32 is 6/5 of base64, and a real code is one
     square. Caught by a test, not by reading. */
  function _binToBytes(bin) {
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i) & 255;
    return u;
  }
  function _bytesToBin(u) {
    var out = '';
    for (var i = 0; i < u.length; i++) out += String.fromCharCode(u[i]);
    return out;
  }
  function _u32(n) {
    return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  }
  function _readU32(s, at) {
    return ((s.charCodeAt(at) << 24) | (s.charCodeAt(at + 1) << 16) |
            (s.charCodeAt(at + 2) << 8) | s.charCodeAt(at + 3)) >>> 0;
  }
  function codeToBinary(code) {
    var parts = splitCode(code);
    var m = /^BB(\d+)\./.exec(parts.body);
    var ver = m ? parseInt(m[1], 10) : 1;
    var b64 = m ? parts.body.slice(m[0].length) : parts.body;
    var body;
    try {
      body = _atob(b64);
    } catch (e) {
      // Not base64 after all. Carry the code as plain text rather than
      // refusing to draw a square at all — a square that works is worth more
      // than a rule about how it was packed.
      var raw = String(code), t = '';
      for (var z = 0; z < raw.length; z++) t += String.fromCharCode(raw.charCodeAt(z) & 255);
      return String.fromCharCode(2, 0) + _u32(t.length) + t + String.fromCharCode(0);
    }
    var out = String.fromCharCode(1, ver) + _u32(body.length) + body;
    if (parts.room) {
      var seg = String(parts.room).split('.');       // R1.salt.iv.data
      out += String.fromCharCode(1);
      for (var k = 1; k < 4; k++) {
        var raw = _atob(seg[k] || '');
        out += _u32(raw.length) + raw;
      }
    } else {
      out += String.fromCharCode(0);
    }
    return out;
  }
  function binaryToCode(bin) {
    if (!bin) return null;
    if (bin.charCodeAt(0) === 2) {                  // carried as plain text
      var n0 = _readU32(bin, 2);
      return bin.slice(6, 6 + n0);
    }
    if (bin.charCodeAt(0) !== 1) return null;
    var ver = bin.charCodeAt(1);
    var len = _readU32(bin, 2), at = 6;
    var body = bin.slice(at, at + len); at += len;
    var code = 'BB' + ver + '.' + _btoa(body);
    if (bin.charCodeAt(at) === 1) {
      at++;
      var seg = ['R1'];
      for (var k = 0; k < 3; k++) {
        var n = _readU32(bin, at); at += 4;
        seg.push(_btoa(bin.slice(at, at + n))); at += n;
      }
      code += '~' + seg.join('.');
    }
    return code;
  }

  function qrChunks(code, mode) {
    var body = b32Encode(codeToBinary(code));
    // A short check value over the whole code, so a square from one code can
    // never be mistaken for a square from another.
    var sum = 0, i;
    for (i = 0; i < body.length; i++) sum = (sum * 31 + body.charCodeAt(i)) >>> 0;
    var tag = sum.toString(36).toUpperCase().slice(0, 6);
    var budget = qrBudget(mode);
    var total = Math.max(1, Math.ceil(body.length / budget));
    /* v1.1.4, Decision 154 — a square stays only as dense as its content needs.
       The old cut filled each square to the budget and left whatever remained
       in the last one, so a three-square code was two squares at version 40 and
       one small one. Spreading the body evenly across the same number of squares
       costs nothing — the count is identical — and every square comes out at the
       lower version the short remainder already enjoyed. F34's own evidence is
       that the short square was the one that read first time.

       A code that fits one square is untouched by this and always was: it is
       drawn at whatever version its own length needs, never padded out. */
    var each = Math.ceil(body.length / total);
    var out = [];
    for (i = 0; i < total; i++) {
      out.push('DN2*' + tag + '*' + (i + 1) + '*' + total + '*' +
               body.slice(i * each, (i + 1) * each));
    }
    return { tag: tag, total: total, squares: out, mode: String(mode || 'fewest') };
  }
  function qrParse(text) {
    var m = /^DN2\*([A-Z0-9]+)\*(\d+)\*(\d+)\*([\s\S]*)$/.exec(String(text).trim());
    if (!m) return null;
    return { tag: m[1], index: parseInt(m[2], 10), total: parseInt(m[3], 10), body: m[4] };
  }
  // Any order, nothing written until every square is in. A half-restored
  // reading history is worse than none — Decision 85's own reasoning.
  function qrCollect(bag, part) {
    if (!part) return bag;
    if (!bag || bag.tag !== part.tag || bag.total !== part.total) {
      bag = { tag: part.tag, total: part.total, parts: {} };
    }
    bag.parts[part.index] = part.body;
    return bag;
  }
  function qrMissing(bag) {
    var out = [];
    if (!bag) return out;
    for (var i = 1; i <= bag.total; i++) if (bag.parts[i] === undefined) out.push(i);
    return out;
  }
  function qrAssemble(bag) {
    if (!bag || qrMissing(bag).length) return null;
    var body = '';
    for (var i = 1; i <= bag.total; i++) body += bag.parts[i];
    try { return binaryToCode(b32Decode(body)); } catch (e) { return null; }
  }

  // ---------- The Secret Place (v0.4) ----------
  // Three locks in sequence, each invisible until the one before it is passed:
  // the place (a verse), the knock (a count AND a rhythm, made on the prayer
  // timer's pause), and the word (a PIN, on a panel that does not exist until
  // the first two are right).
  //
  // The clock pauses every time, on every verse, including the door verse. The
  // count runs silently underneath and nothing marks a tap. A door that
  // behaved differently would announce itself with one tap.

  // A rhythm cannot be stumbled through: a guesser tapping steadily sails
  // through any bare count, because he never waits where the waiting belongs.
  /* ============ v1.1.1 — THE KNOCK IS A NUMBER (Decisions 114, 116, 117) ======
     WHY THIS REPLACES THE FELT RHYTHM OF v0.4 §2.3.
     Dickson was locked out of a room he had made minutes earlier, using the
     option the design offered as the forgiving one. Three faults were stacked
     in one door and the redesign removes all three:

       1. THE BANDS. "By feel" never compared seconds — gapClass() sorted every
          gap into quick (<3s), hold (3–8s) or wait (>8s) and matched band for
          band. His 3.3s sat three tenths of a second inside "hold"; tapped
          again at 2.9 it fell into "quick" and the door stayed shut. Generous
          in the middle of a band, merciless at its edges, and the pad showed
          him the number without ever showing him the band.
       2. THE MEASUREMENT. Gaps were pause-to-pause wall clock, so a gap was
          hesitation-before-resume PLUS running time, delivered as one number
          with no way to see how it split. Fixed at the caller: a gap is now
          RUNNING time only, resume to pause, in both places (finding F9).
       3. THE INSTRUMENT. The number appeared only after the tap, so a man
          could not aim. Fixed at the caller with a live counter.

     WHAT A KNOCK IS NOW: whole seconds, 3 to 6 of them, each 1 to 9 — "4567"
     means let the clock run 4, pause; run 5, pause; run 6, pause; run 7, pause.
     One rule the whole way along, with no hidden cliff a third of a second wide.

     AND IT ENDS ON A RESUME, not a pause. After the last pause the man resumes
     and simply prays; five unbroken seconds of running clock open the word
     panel. A stranger working through rhythms is pausing constantly — leaving
     the clock to run five seconds is the one thing he never does, so he passes
     straight through the moment he was right and never learns he was. The owner
     does it without thinking, because he has finished knocking. */
  var KNOCK_MIN = 3, KNOCK_MAX = 6;      // gaps: fewer stumbles in, more is forgotten
  var KNOCK_LOW = 1, KNOCK_HIGH = 9;     // seconds per gap — so a knock is a number
  var KNOCK_TOLS = [1, 2, 3];            // not 4: see knockCheck's 'spread' below
  var KNOCK_SETTLE = 5;                  // unbroken running seconds that open the panel

  function knockGapsOf(knock) { return (knock && knock.gaps) || []; }
  function knockTol(knock) {
    var t = knock && knock.tol;
    return (t === 1 || t === 2 || t === 3) ? t : 1;
  }
  function knockSpread(gaps) {
    if (!gaps.length) return 0;
    var lo = gaps[0], hi = gaps[0];
    for (var i = 1; i < gaps.length; i++) { if (gaps[i] < lo) lo = gaps[i]; if (gaps[i] > hi) hi = gaps[i]; }
    return hi - lo;
  }
  /* THE SPREAD RULE, AND IT IS ARITHMETIC RATHER THAN JUDGEMENT.
     A guesser tapping at one constant interval t passes when every target sits
     within tolerance of t, which is possible exactly when
         max(gap) - min(gap) <= 2 x tolerance.
     4-5-6-7 at +/-1 is safe: no steady interval fits. The same knock at +/-2 is
     open to any man tapping steadily every five seconds — he is within 2 of 4,
     of 5, of 6 and of 7, and walks in knowing nothing. 2-6-3-9 at +/-2 is safe,
     because its spread is 7.
     This is v0.4 §2.3's own central fear — "a guesser tapping steadily sails
     straight through" — stated as a number instead of a feeling. It is why the
     tolerance list stops at 3: inside a 1–9 range a +/-4 tolerance needs a
     spread above 8 to stay safe, which forces every knock to the extremes. A
     tolerance that can only be used one way is not a choice.
     The app WARNS and does not refuse. It already told the truth about the
     all-quick-taps knock rather than forbidding it; this is the same rule
     generalised, and the app has never decided for a man what he can be
     trusted with. */
  function knockCheck(knock) {
    var g = knockGapsOf(knock), tol = knockTol(knock), out = [], i;
    if (!g.length) return ['none'];
    for (i = 0; i < g.length; i++) {
      if (!(g[i] >= KNOCK_LOW && g[i] <= KNOCK_HIGH && g[i] === Math.round(g[i]))) { out.push('digits'); break; }
    }
    if (g.length < KNOCK_MIN) out.push('short');
    if (g.length > KNOCK_MAX) out.push('long');
    if (knockSpread(g) <= 2 * tol) out.push('spread');
    return out;
  }
  // Kept under its old name so callers read the same. 'weak' now means the
  // spread rule is broken rather than that every tap was a quick one.
  function knockStrength(knock) {
    var c = knockCheck(knock);
    if (c.indexOf('none') >= 0) return 'none';
    return c.length ? 'weak' : 'ok';
  }
  // How long the whole thing takes on a running clock, settle included. The
  // knock is made by pausing a RUNNING prayer, so all of it has to fit inside
  // the prayer — 4567 needs 27 seconds. A door that makes a man stretch the
  // timer before he can reach it is friction at best; the room states this at
  // the making rather than letting him find out at the door.
  function knockSeconds(knock) {
    var g = knockGapsOf(knock), t = 0;
    for (var i = 0; i < g.length; i++) t += g[i];
    return t + KNOCK_SETTLE;
  }
  function knockMatches(knock, gaps) {
    if (!knock) return false;
    var want = knockGapsOf(knock), tol = knockTol(knock);
    if (!gaps || gaps.length !== want.length) return false;
    for (var i = 0; i < want.length; i++) {
      if (Math.abs(gaps[i] - want[i]) > tol) return false;
    }
    return true;
  }
  /* Decision 119a — a wrong word costs a wait that grows.
     The word can be one tapped out of the door verse, and by the time the panel
     is open that verse is on the screen: about twenty-five candidates, in plain
     sight. Hiding which shape the owner used does not stop a guesser trying
     them — they are cheap and obvious — it only stops him concluding anything
     when they fail. The wait is what does the work, and it turns twenty-five
     guesses from a minute of tapping into hours of holding a phone.
     This app has always been willing to make a man wait: the Gate's five
     seconds in Order My Steps, three months in the seal, five seconds of
     stillness at the door. */
  var TRY_WAITS = [0, 0, 5, 15, 60, 300];
  function tryWaitMs(wrongCount) {
    var n = wrongCount | 0;
    if (n <= 0) return 0;
    var s = n < TRY_WAITS.length ? TRY_WAITS[n] : TRY_WAITS[TRY_WAITS.length - 1];
    return s * 1000;
  }
  function roomExists(state) { return !!(state.room && (state.room.door || state.room.sealed)); }
  // Locks one and two, on the device. They never touch the PIN, and they say
  // nothing either way — a wrong knock does nothing at all.
  function roomKnockOk(state, ref, gaps) {
    var r = state.room;
    if (!r || !r.door || !ref) return false;
    if (r.door[0] !== ref[0] || r.door[1] !== ref[1] || r.door[2] !== ref[2]) return false;
    return knockMatches(r.knock, gaps);
  }
  /* v1.1.1 — `hint` is the owner's own cue for his word (Decision 118a), shown
     only after two wrong words, on a panel nobody reaches without passing the
     verse and the knock first. It is not recovery and does not breach §7:
     nothing is unlocked by it and nothing stored in it opens the room.
     `wordShape` records where he took his word from — the door verse, any
     verse, or his own head. It steers the making and nothing else: the panel
     at the door looks identical whichever it is, because a panel that asked
     differently would announce which of the three a stranger was facing. */
  function newRoom(door, knock, now) {
    return {
      door: door.slice(), knock: knock, made: todayStr(now),
      entries: [], cats: [], seq: 0,
      badgeChoice: 'room',
      reminder: null,
      // v1.1.2, Decision 128 (the vault) — whether the word panel offers the
      // door verse's words as chips at all. On by default, matching every
      // room made before this existed. Independent of wordShape: a bare box
      // never proves the word was typed, because it might belong to any of
      // the three shapes with chips simply turned off.
      wordShape: 'typed', hint: '', showWords: true,
      pinCheck: null, sealed: null
    };
  }
  function roomAddEntry(room, text, now) {
    room.seq = (room.seq || 0) + 1;
    var e = {
      id: 'e' + room.seq, date: todayStr(now), title: '',
      body: String(text == null ? '' : text),
      letter: false, struggle: false, testimony: false, other: false,
      cats: [], open: false, endNote: '', endAt: null, endIsTestimony: false,
      // v1.1.4, Decisions 166–173 — a letter's own seal, with its own clock.
      // A letter written on an older build has neither field; both read back
      // as unsealed, which is what it was.
      sealed: false, sealedAt: null
    };
    room.entries.push(e);
    return e;
  }
  function roomEntry(room, id) {
    for (var i = 0; i < (room.entries || []).length; i++) if (room.entries[i].id === id) return room.entries[i];
    return null;
  }
  // Nothing inside counts toward anything — no streak, no badge, no tally, and
  // no category counts. Categories are for finding, never for tallying.
  function roomCats(room) {
    var names = {}, out = [];
    (room.cats || []).forEach(function (c) { names[c.name] = c; });
    (room.entries || []).forEach(function (e) {
      (e.cats || []).forEach(function (n) { if (!names[n]) { names[n] = { name: n, sealed: false, sealedAt: null }; } });
    });
    for (var k in names) out.push(names[k]);
    out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return out;
  }
  function roomSealCat(room, name, sealed, now) {
    var list = room.cats || (room.cats = []), found = null;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) found = list[i];
    if (!found) { found = { name: name, sealed: false, sealedAt: null }; list.push(found); }
    found.sealed = !!sealed;
    /* v1.1.2, finding F16 — CORRECTED. The design (§23) and this function's own
       neighbour promised the exact moment, to the second; this stored only the
       day, so the seal lifted up to a day early (about two hours short, in
       Dickson's own case). Fixed the same way v1.1.0 fixed the identical slip
       in Gems: the moment, not the day. */
    found.sealedAt = sealed ? (now ? new Date(now).getTime() : Date.now()) : null;
    return found;
  }
  // Three months in the seal first. A man in the state that makes him want to
  // burn his own words is exactly the man who should not be able to. The room
  // states the exact moment, to the second — a man can argue with a fuzzy
  // delay; there is nothing to argue with in a timestamp.
  function catDeletableAt(cat) {
    if (!cat || !cat.sealed || !cat.sealedAt) return null;
    // A category sealed under v1.1.1 stored a day string ("YYYY-MM-DD"); one
    // sealed from v1.1.2 on stores a timestamp. Both are read back correctly.
    var base = (typeof cat.sealedAt === 'number') ? new Date(cat.sealedAt) : new Date(cat.sealedAt + 'T00:00:00');
    var d = new Date(base.getTime());
    d.setMonth(d.getMonth() + 3);
    return d;
  }
  function catCanDelete(cat, now) {
    var when = catDeletableAt(cat);
    if (!when) return false;
    return (now ? new Date(now) : new Date()).getTime() >= when.getTime();
  }

  /* ---------- v1.1.4: sealing ONE letter (Decisions 166–173) ----------
     Decision 138 gave the room sealing at the level of a category a man named
     himself, and that shipped. Sealing a single letter had never been designed,
     and Decision 148 made its absence the reason there is a v1.1.4 at all.

     A letter's seal is the same shape as a category's — a flag and the moment,
     to the second — and it runs its own three-month clock. Decision 169: each
     seal stands on its own. Unsealing a category returns only the letters the
     owner never sealed himself; one he sealed by hand stays sealed, with its
     clock untouched. Nothing a man chose is undone by something else he chose,
     and a category unsealed after a month must not hand back a letter whose
     cooling had two months to run. */
  function roomSealEntry(room, id, sealed, now) {
    var e = roomEntry(room, id);
    if (!e) return null;
    e.sealed = !!sealed;
    e.sealedAt = sealed ? (now ? new Date(now).getTime() : Date.now()) : null;
    return e;
  }
  // The same clock as a category's, read off whichever object carries the seal,
  // so the two can never drift apart. §11 and F16's fix: the moment, not the day.
  function entryDeletableAt(e) { return catDeletableAt(e); }
  function entryCanDelete(e, now) { return catCanDelete(e, now); }
  function roomSealedEntries(room) {
    return ((room && room.entries) || []).filter(function (e) { return !!e.sealed; });
  }
  // Deleting one letter, after its three months. Decision 173 asks for the word
  // from inside the opened letter; this only does the removing.
  function roomDeleteEntry(room, id) {
    var before = ((room && room.entries) || []).length;
    room.entries = ((room && room.entries) || []).filter(function (e) { return e.id !== id; });
    return room.entries.length < before;
  }

  /* ---------- v1.1.4: renaming a category (Decisions 174–177) ----------
     Raised in v1.1.2, carried undesigned, ruled in by Decision 160.

     174 — it is the same folder with a new name on it. Every letter follows;
           nothing moves and nothing is left behind.
     176 — the old name vanishes. Not kept on the category, not kept in a
           history. A man may rename a category precisely to stop reading a
           word, and keeping that word in small grey text underneath would
           defeat the whole act.
     177 — a name already taken is refused plainly. Capitals do not make a
           different name (the same reasoning normPin already applies to the
           word), and a SEALED category counts — the room says the name is
           taken without naming, opening or revealing anything in the seal.

     A merge was offered and refused: moving every letter out of one category
     into another is a different feature, and a destructive one. */
  function catKey(name) { return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function roomRenameCat(room, oldName, newName) {
    var from = String(oldName == null ? '' : oldName);
    var to = String(newName == null ? '' : newName).replace(/\s+/g, ' ').trim();
    if (!to) return { ok: false, why: 'empty' };
    /* Decision 175 — a sealed category is unsealed before it can be renamed.
       The screen does not offer Rename on one, and this refuses it as well, so
       that if some future screen ever reaches for it the seal still holds. The
       same two-guard shape as Decision 161. */
    var cats = roomCats(room), fromCat = null;
    cats.forEach(function (c) { if (c.name === from) fromCat = c; });
    if (fromCat && fromCat.sealed) return { ok: false, why: 'sealed' };
    if (catKey(to) === catKey(from)) {
      // The same name in different capitals is not a collision with itself —
      // it is a man tidying his own capitals, and it is allowed through.
      if (to === from) return { ok: false, why: 'same' };
    } else {
      var taken = null;
      roomCats(room).forEach(function (c) { if (catKey(c.name) === catKey(to)) taken = c.name; });
      if (taken !== null) return { ok: false, why: 'taken', taken: taken };
    }
    ((room && room.entries) || []).forEach(function (e) {
      e.cats = (e.cats || []).map(function (n) { return n === from ? to : n; });
    });
    var list = room.cats || (room.cats = []), seen = null;
    for (var i = 0; i < list.length; i++) if (list[i].name === from) { list[i].name = to; seen = list[i]; }
    return { ok: true, cat: seen, name: to };
  }

  /* ---------- v1.1.4, Decision 159 — F40's one call, at one place ----------
     unsealRoom hands back a room with pinCheck null, and nothing ever wrote a
     new one. So a restored room opened once could never be opened again: the
     door had nothing left to test a word against, and the panel closed in
     silence. The worst of the twelve findings, because it fell on the reader
     who did the careful thing.

     At the moment a restore succeeds the app is holding the correct word — it
     has just decrypted the room with it. This seals a fresh check-scrap from
     that same word, so nothing is asked of the reader. A scrap is a sealed
     EMPTY room: it proves the word and carries nothing. */
  function sealCheck(room, pin) {
    return sealRoom({
      door: room.door, knock: room.knock, made: room.made,
      entries: [], cats: [], seq: 0
    }, pin);
  }
  // Every three days, fixed. Not a notification to be tuned so it does not
  // become noise — a rhythm that makes the memory permanent. The phones that
  // let you choose are the ones where you forget.
  function reminderDue(state, now) {
    var r = state.room;
    if (!r || !r.reminder || !r.reminder.on) return false;
    var last = r.reminder.lastShown;
    if (!last) return true;
    return dayBefore(todayStr(now), 3) >= last;
  }
  function reminderShown(state, now) {
    if (state.room && state.room.reminder) state.room.reminder.lastShown = todayStr(now);
  }

  // ---------- Sealing the room for the code (v0.4 §9) ----------
  // The room travels with the backup code, sealed with the PIN. The code can
  // reveal that something is sealed; it cannot reveal the door, the knock, the
  // rhythm, the PIN, or one word of what is inside.
  //
  // So the DOOR AND KNOCK GO INSIDE THE SEAL TOO, not only the writing. That
  // has one consequence, recorded rather than hidden: a restored code cannot
  // work locks one and two until it has been opened once with the PIN, because
  // the device genuinely does not know where the door is. Settings already
  // offers the room in plain sight, and that is where the one deliberate act
  // happens. Afterwards the three locks work silently, exactly as designed.
  function _crypto() {
    var c = (typeof self !== 'undefined' && self.crypto) || (typeof global !== 'undefined' && global.crypto) || null;
    return (c && c.subtle) ? c : null;
  }
  function _bytesToB64(u8) {
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return _btoa(bin);
  }
  function _b64ToBytes(s) {
    var bin = _atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  /* v1.1.3 — F18/F25. The word is no longer case-sensitive, and stray spaces
     at either end no longer count.

     This was found the hard way. A word tapped from the door verse's chips
     goes into a MASKED box: the owner never reads it, he only points at it.
     While the door verse stands the same chip is there to tap again, so the
     room opens. Move the door and the chip is gone — and the only way left is
     to type, exactly, a word he never actually saw. Under §7 there is no
     recovery, so a capital letter was enough to cost a man his letters.

     Nothing is weakened that matters. The lock's strength is the word nobody
     else knows plus a knock nobody else can find plus the growing wait; a
     stranger who has the word is not stopped by its capitals. What case
     sensitivity was actually protecting was a trap for the owner. */
  function normPin(pin) {
    return String(pin == null ? '' : pin).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function _pinKey(c, pin, salt) {
    var enc = new TextEncoder();
    return c.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        // A four-figure PIN is a small space. The work factor is what makes
        // guessing it expensive, so it is set high on purpose.
        return c.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function sealRoom(room, pin) {
    var c = _crypto();
    if (!c) return Promise.reject(new Error('no-crypto'));
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    var payload = JSON.stringify({
      door: room.door, knock: room.knock, made: room.made,
      entries: room.entries || [], cats: room.cats || [], seq: room.seq || 0,
      badgeChoice: room.badgeChoice || 'room', reminder: room.reminder || null,
      // v1.1.2 — found while building the room's inside-editing: these three
      // were never carried by the sealed payload, so a room restored from a
      // backup code silently lost its word shape, its hint, and (once it
      // existed) whether the word panel showed chips. Added rather than left
      // freshly broken now that showWords exists too.
      wordShape: room.wordShape || 'typed', hint: room.hint || '',
      showWords: room.showWords !== false
    });
    return _pinKey(c, normPin(pin), salt).then(function (key) {
      return c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(payload));
    }).then(function (buf) {
      return 'R1.' + _bytesToB64(salt) + '.' + _bytesToB64(iv) + '.' + _bytesToB64(new Uint8Array(buf));
    });
  }
  function unsealRoom(blob, pin) {
    var c = _crypto();
    if (!c) return Promise.reject(new Error('no-crypto'));
    var p = String(blob || '').split('.');
    if (p.length !== 4 || p[0] !== 'R1') return Promise.reject(new Error('bad-blob'));
    var salt = _b64ToBytes(p[1]), iv = _b64ToBytes(p[2]), data = _b64ToBytes(p[3]);
    /* v1.1.3 — the tidied word is tried first, then the word exactly as typed.
       The second attempt is for anything sealed before F18's fix, so a room
       made on an older build still opens on this one. Nothing is announced
       either way: to the owner it is simply his word, and to anyone else it is
       still two failures, not one clue. */
    function attempt(p2) {
      return _pinKey(c, p2, salt).then(function (key) {
        return c.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
      });
    }
    var tidy = normPin(pin), raw = String(pin == null ? '' : pin);
    return attempt(tidy).catch(function (err) {
      return (raw === tidy) ? Promise.reject(err) : attempt(raw);
    }).then(function (buf) {
      var obj = JSON.parse(new TextDecoder().decode(buf));
      return {
        door: obj.door, knock: obj.knock, made: obj.made,
        entries: obj.entries || [], cats: obj.cats || [], seq: obj.seq || 0,
        badgeChoice: obj.badgeChoice || 'room', reminder: obj.reminder || null,
        // v1.1.2 — restored alongside everything else now that sealRoom
        // carries them. A blob sealed before this existed has none of the
        // three, so they fall back the same way a brand-new room does.
        wordShape: obj.wordShape || 'typed', hint: obj.hint || '',
        showWords: (obj.showWords === undefined) ? true : !!obj.showWords,
        pinCheck: null, sealed: null
      };
    });
  }
  // A code carries its sealed room after a ~. Decision 82: the code is exactly
  // the code — no padding, no ceiling. If it has a sealed room so be it; if it
  // does not, so be it.
  function splitCode(code) {
    var s = String(code || '').trim().replace(/\s+/g, '');
    var i = s.indexOf('~');
    return i < 0 ? { body: s, room: null } : { body: s.slice(0, i), room: s.slice(i + 1) };
  }

  // ---------- Reading aloud (v18) ----------
  // A verse heard is a verse read. The counting is the app's ordinary counting;
  // this only remembers where a reading had reached, so a chapter stop can be
  // resumed without hunting.
  function audioMark(state, ref) {
    state.audioRun = ref ? { ref: ref.slice(), at: Date.now() } : null;
  }

  // ---------- Exports ----------
  var Engine = {
    COUNTS: COUNTS, BOOKS: BOOKS, TOTAL_VERSES: TOTAL_VERSES, OT_END: OT_END,
    refToIndex: refToIndex, indexToRef: indexToRef, refLabel: refLabel,
    newState: newStateFull, rollover: rollover, todayStr: todayStr,
    countRead: countRead,
    makePlan: makePlan, previewPlan: previewPlan, getPlan: getPlan,
    scopeSize: scopeSize, planNextIndex: planNextIndex,
    planReadCount: planReadCount, planRemaining: planRemaining, planTodayCount: planTodayCount,
    planBookRemaining: planBookRemaining,
    // v1.0.4
    migrate: migrate, versesOn: versesOn, logDay: logDay,
    STREAK_BADGES: STREAK_BADGES, WELL_TIERS: WELL_TIERS, RANKS: RANKS,
    streakBadge: streakBadge, rankFor: rankFor, wellTier: wellTier, nextTier: nextTier,
    hasRoad: hasRoad, bookTouched: bookTouched, bookProgress: bookProgress,
    bookCompletions: bookCompletions, bibleCompletions: bibleCompletions,
    earnedBadges: earnedBadges, unseenBadges: unseenBadges, markBadgesSeen: markBadgesSeen,
    ladderOffer: ladderOffer, ladderAccept: ladderAccept, ladderDecline: ladderDecline,
    ladderDue: ladderDue, planGap: planGap, growthStep: growthStep, isDriedOut: isDriedOut,
    catchUpPreview: catchUpPreview, catchUpApply: catchUpApply,
    isFavorite: isFavorite, toggleFavorite: toggleFavorite,
    verseOfTheDay: verseOfTheDay, momentVerse: momentVerse, randomVerse: randomVerse,
    bookPosition: bookPosition, bookAdvance: bookAdvance,
    planPrevIndex: planPrevIndex, planNextInOrder: planNextInOrder,
    bookPrevRef: bookPrevRef, bookNextRef: bookNextRef,
    mergeStates: mergeStates,
    exportCode: exportCode, importCode: importCode,
    // v1.0.9
    exportCodeV1: exportCodeV1, codeKind: codeKind,
    codeAnchorDate: codeAnchorDate, gapInfo: gapInfo, gapClaim: gapClaim,
    confessGap: confessGap, daysReadSince: daysReadSince,
    planDaysLeft: planDaysLeft, planEndDate: planEndDate,
    planSetTarget: planSetTarget, planSetEndDate: planSetEndDate,
    addDays: addDays, daysBetween: daysBetween,
    isWell: isWell, activeWell: activeWell, makeWell: makeWell,
    wellLapDone: wellLapDone, wellContinue: wellContinue, wellEnd: wellEnd,
    prayStart: prayStart, prayStretch: prayStretch, prayPause: prayPause,
    prayResume: prayResume, prayCancel: prayCancel, prayLeftMs: prayLeftMs,
    prayRunning: prayRunning, prayIsPaused: prayIsPaused, prayActive: prayActive,
    prayExpired: prayExpired,
    recordMilestones: recordMilestones,
    isGem: isGem, toggleGem: toggleGem,
    chapterInfo: chapterInfo, testSeedGap: testSeedGap,
    // v1.1.0
    gemRows: gemRows, markDate: markDate, markDay: markDay,
    seasonSet: seasonSet, seasonCurrent: seasonCurrent, mergeSeasons: mergeSeasons,
    b32Encode: b32Encode, b32Decode: b32Decode,
    qrChunks: qrChunks, qrParse: qrParse, qrCollect: qrCollect,
    codeToBinary: codeToBinary, binaryToCode: binaryToCode,
    qrMissing: qrMissing, qrAssemble: qrAssemble, QR_PAYLOAD: QR_PAYLOAD,
    QR_MODES: QR_MODES, qrBudget: qrBudget,
    knockMatches: knockMatches, knockStrength: knockStrength, knockCheck: knockCheck,
    knockSeconds: knockSeconds, knockSpread: knockSpread, tryWaitMs: tryWaitMs,
    KNOCK_MIN: KNOCK_MIN, KNOCK_MAX: KNOCK_MAX, KNOCK_LOW: KNOCK_LOW,
    KNOCK_HIGH: KNOCK_HIGH, KNOCK_TOLS: KNOCK_TOLS, KNOCK_SETTLE: KNOCK_SETTLE,
    roomExists: roomExists, roomKnockOk: roomKnockOk, newRoom: newRoom,
    roomAddEntry: roomAddEntry, roomEntry: roomEntry, roomCats: roomCats,
    roomSealCat: roomSealCat, catDeletableAt: catDeletableAt, catCanDelete: catCanDelete,
    // v1.1.4 — per-letter sealing (166–173), renaming (174–177), F40's fix (159)
    roomSealEntry: roomSealEntry, entryDeletableAt: entryDeletableAt,
    entryCanDelete: entryCanDelete, roomSealedEntries: roomSealedEntries,
    roomDeleteEntry: roomDeleteEntry, roomRenameCat: roomRenameCat,
    catKey: catKey, sealCheck: sealCheck,
    reminderDue: reminderDue, reminderShown: reminderShown,
    sealRoom: sealRoom, unsealRoom: unsealRoom, splitCode: splitCode,
    // v1.1.4, Decision 152 — the app compares a typed word against the door
    // verse's own words, and it must tidy them exactly as the lock does.
    normPin: normPin,
    audioMark: audioMark, repairCatchUpLaps: repairCatchUpLaps,
    loadState: loadState, saveState: saveState, KEY: KEY
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.DrawNighEngine = Engine;

})(typeof self !== 'undefined' ? self : this);
