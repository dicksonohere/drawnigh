/* DrawNigh — app.js (UI only; all rules live in engine.js) */
(function () {
  'use strict';
  var E = self.DrawNighEngine;
  var $ = function (id) { return document.getElementById(id); };

  var BIBLE = null;       // full text, loaded once
  var state = null;
  var mode = 'plan';      // 'book' | 'random' | 'plan'
  var currentBook = 0;
  var current = null;     // { ref:[b,c,v], counted:bool, planId:string|null }
  var NOTES = {};         // v13: translators' margin notes, keyed "b.c.v"
  var view = null;        // v13: {ref, planId} while on a review trip; null = live
  var randTrail = [];     // Random mode has no order, so it keeps a session trail
  var randPos = -1;
  var momentTimer = null;
  var cuPlanId = null;

  function verseText(b, c, v) { return BIBLE[b][1][c][v]; }
  function verseNote(b, c, v) { return NOTES[b + '.' + c + '.' + v] || ''; }

  // v13 — Prev works from POSITION, not from a remembered trail, so it
  // survives a restore, a restart, and a Catch me up jump.
  function stepFrom(ref, dir) {
    if (mode === 'plan') {
      var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
      if (!plan) return null;
      var gi = dir < 0 ? E.planPrevIndex(plan, E.refToIndex(ref[0], ref[1], ref[2]))
                       : E.planNextInOrder(plan, E.refToIndex(ref[0], ref[1], ref[2]));
      return gi < 0 ? null : E.indexToRef(gi);
    }
    if (mode === 'book') {
      return dir < 0 ? E.bookPrevRef(ref[0], ref[1], ref[2])
                     : E.bookNextRef(ref[0], ref[1], ref[2]);
    }
    return null;  // random: handled by its own trail
  }
  function shownRef() { return view ? view.ref : (current ? current.ref : null); }

  /* v1.1.1, findings F1 and F4 — DATA WAS ALWAYS RIGHT; THE SCREEN WAS LATE.
     Two sightings of one fault. After a Replace the book card kept showing the
     pre-repair lap until you left the screen and came back — so on a new phone
     a reader sees his old unbanked state staring back and concludes the fix
     failed. And a milestone banked while the badge sheet was open never
     appeared in the list until the sheet was closed and reopened; that was
     what made Jude look as though it had not been recorded when it had.
     Both are the same thing: nothing redrew the sheet after the state moved.
     save() is the one place every change passes through, so the redraw lives
     here. It costs nothing when the sheet is shut. */
  function save() {
    E.saveState(state);
    if ($('badgeSheet').classList.contains('show')) {
      renderBadgeSheet();
      if (bShown != null) showBookCard(bShown);
    }
  }

  // ---------- Rendering ----------
  function renderBadges() {
    var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    // v9: two honest counters. 🎯 = verses credited to the active plan today
    // (owns the progress bar); 📖 = everything read today, anywhere.
    var bp = $('badgePlan');
    /* v1.1.0, finding 1 — a Well has no daily number BY DESIGN, so it has no
       target pill: "no daily number, and therefore no end date, no percentage,
       no progress bar and no ladder" (v16.1 §4). v1.0.9 shipped without this
       guard and rendered "🎯 0 / null" on every Well, which is developer output
       in front of a reader. The pill belongs to a target; no target, no pill. */
    if (plan && plan.target) {
      var pt = E.planTodayCount(plan);
      var pct = Math.min(100, Math.round(100 * pt / plan.target));
      bp.style.display = '';
      bp.innerHTML = '🎯 ' + pt + ' / ' + plan.target + ' ' +
        '<span class="bar"><span style="width:' + pct + '%"></span></span>';
      bp.title = plan.name + ' — today';
    } else {
      bp.style.display = 'none';
    }
    $('badgeCount').textContent = '📖 ' + state.today.count + ' verse' + (state.today.count === 1 ? '' : 's') + ' today';
    $('badgeStreak').textContent = '🔥 ' + state.streak.days + '-day streak';
    updateCatchChip(); // v10: plan may have changed (activate/delete/restore)
    if ($('dotsDot')) updateDots();   // v1.0.4: a new badge or offer may be waiting
  }

  function showVerse(ref, foot) {
    var b = ref[0], c = ref[1], v = ref[2];
    var t = verseText(b, c, v);
    $('verseRef').textContent = E.refLabel(b, c, v);
    var first = t.charAt(0), rest = t.slice(1);
    if (t.charAt(0) === '[') { // Psalm titles like "[A Psalm of David.] The LORD…"
      var close = t.indexOf(']');
      first = t.charAt(close + 2) || t.charAt(0);
      rest = t.slice(0, close + 2) === '' ? rest : t.slice(t.indexOf(first, close) + 1);
      $('verseText').innerHTML = '<span class="cap">' + esc(first) + '</span>' + esc(rest);
      $('verseText').insertAdjacentHTML('afterbegin', '<div class="verse-foot" style="margin:0 0 8px">' + esc(t.slice(1, close)) + '</div>');
    } else {
      $('verseText').innerHTML = '<span class="cap">' + esc(first) + '</span>' + esc(rest);
    }
    // v13: the translators' margin note, separated from Scripture and shown
    // only if the reader asked for it.
    var note = verseNote(b, c, v);
    var nEl = $('verseNote');
    if (note && state.settings.showNotes) { nEl.textContent = note; nEl.style.display = ''; }
    else { nEl.textContent = ''; nEl.style.display = 'none'; }

    $('verseFoot').textContent = foot || '';
    $('verseBookFoot').textContent = bookFoot(b);
    $('verseChapFoot').textContent = chapFoot(b, c, v);
    var fav = E.isFavorite(state, b, c, v);
    $('btnFav').classList.toggle('on', fav);
    $('btnGem').classList.toggle('on', E.isGem(state, b, c, v));
    maybeMarkHint();
    updatePrevButton();
    renderBadges();
  }

  // v1.0.9 item 13 — the third line. The two above it say how far there is to
  // go across the whole plan and across this book; this one says where he is
  // standing right now. Counted the same inclusive way as both of them: the
  // verse on screen is one of the verses that remain.
  //
  // Unlike the book line it does NOT need a plan — a chapter is a fact about
  // the Bible, not about a plan, so it is true in Book and Random mode too.
  function chapFoot(b, c, v) {
    if (b == null || c == null) return '';
    var ci = E.chapterInfo(b, c, v);
    return 'Chapter ' + ci.chapter + ' out of ' + ci.chapters +
           (ci.chapters === 1 ? ' chapter' : ' chapters') + ' — ' +
           ci.remain.toLocaleString() + (ci.remain === 1 ? ' verse remains' : ' verses remain');
  }

  // ♥ and ⚡ side by side are two symbols a reader must guess between. Said
  // once, at first use, and never again.
  function maybeMarkHint() {
    var el = $('markHint');
    if (!el) return;
    var known = (state.favorites.length + (state.gems || []).length) > 0;
    el.style.display = known ? 'none' : '';
  }

  // v1.0.3: the book line. Under the plan line, it names the book the reader is
  // in and how much of it is left — so a long plan shows near ground as well as
  // far. Plan mode only: in Book and Random mode there is no plan to measure
  // against. Counts nothing; it only reads what the plan already knows.
  function bookFoot(bookIndex) {
    if (mode !== 'plan' || bookIndex == null) return '';
    var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    if (!plan) return '';
    var left = E.planBookRemaining(plan, bookIndex);
    if (left <= 0) return '';
    return E.BOOKS[bookIndex] + ' — ' + left.toLocaleString() +
           (left === 1 ? ' verse left in this book' : ' verses left in this book');
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  /* ============================================================
     v1.0.4 — the prayer timer
     Its value is not in stopping the reader. It is in giving them
     permission to stop watching the clock. It counts nothing.
     ============================================================ */
  /* v1.0.9 — Decisions 50-53, 74, 91.
     The prayer no longer counts ticks. It knows the MOMENT it ends and reads
     the clock against it, so a sleeping phone cannot freeze it; it is written
     down with the rest of the state, so closing the app cannot kill it; and its
     bell is booked ahead on the audio clock, so it can sound while nobody is
     watching. The screen is held awake for its length and not one moment
     longer. What remains — a phone locked by hand — is stated in Settings
     rather than hidden. */
  var prayPaint = null, audioCtx = null, bookedChime = [], wakeLock = null;
  /* WEB BUILD — the long press. `audioHold` is true for a sitting begun with a
     long press on the listen button; `holdRefused` records that this browser
     would not hold the screen, so the app can say so instead of staying mute. */
  var audioHold = false, holdRefused = false;

  function prayVisible() {
    var on = !!(state.settings && state.settings.pray);
    /* v1.1.0 — the slot holds two things now. Reading aloud must not depend on
       the prayer timer being switched on: they sit together because both belong
       to the verse on screen, not because one needs the other. */
    var listen = !!(state.settings && state.settings.audio) && speechOK();
    $('praySlot').style.display = (on || listen) ? '' : 'none';
    $('btnPray').style.display = on ? '' : 'none';
    if (!on) $('prayLive').style.display = 'none';
    if (!on && E.prayActive(state)) endPray();
  }
  function fmt(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  // v1.0.5: a paused prayer says so in words. Nothing here is ever ambiguous —
  // the reader should not have to guess whether the clock is still moving.
  function paintPray() {
    var live = E.prayActive(state);
    $('prayLive').style.display = live ? '' : 'none';
    $('btnPray').style.display = live ? 'none' : '';
    if (!live) { $('prayLeft').classList.remove('paused'); return; }
    var paused = E.prayIsPaused(state);
    var el = $('prayLeft');
    el.textContent = paused ? '❙❙ Paused' : fmt(Math.ceil(E.prayLeftMs(state) / 1000));
    el.classList.toggle('paused', paused);
    el.title = paused ? 'Tap to carry on' : 'Tap to pause';
    $('btnPrayStretch').textContent = stretchLabel();
  }
  // Lengths are seconds now, so a breath prayer — the thing this was built for —
  // finally fits inside the timer.
  function praySetting(k, fallback) {
    var v = state.settings && state.settings[k];
    return (typeof v === 'number' && v > 0) ? v : fallback;
  }
  function stretchLabel() {
    var s = praySetting('prayStretchSecs', 300);
    return s < 60 ? '+' + s + 's' : '+' + Math.round(s / 60);
  }

  /* Decision 74 — the screen is held while a prayer RUNS, and given straight
     back when it ends, is cancelled, or is paused. A paused prayer holds
     nothing: nothing is counting down, so nothing needs the screen, and a
     prayer paused overnight must not keep the phone awake till morning.
     A phone that does not offer this, or refuses it, still prays and still
     rings — the fallback is untouched. */
  /* v1.1.0 — two things can want the screen now: a prayer running, and a
     reading aloud with the hold switched on (v18 §4.1). The hold is taken while
     either wants it and given straight back when neither does. */
  /* WEB BUILD, settled 13 Sep 2026 — the long press.

     What changed and why. The old rule read the `audioWake` SETTING, and it
     was on by default, and his screen still went dark: Firefox refused the
     request and said nothing. Two faults, not one — the wrong control, and
     silence when it failed.

     The control is now the press itself. A normal press listens; the phone may
     sleep, which is right for cooking and driving. A LONG press says "keep the
     light on", because he reads along with the voice and a dark screen breaks
     that. One long press covers the whole sitting.

     `audioWaiting` is deliberately included. The reading stops at each chapter
     and waits for a tap (Decision 107) — and the old rule dropped the light at
     exactly that moment, so a man reading along was pushed back into tapping
     his phone awake at every chapter. He is standing right there, about to
     carry on. The light stays.

     `audioHold` is a sitting, not a setting: it lives only as long as the
     reading does, and stopping the reading clears it. */
  function screenWanted() {
    if (E.prayRunning(state)) return true;
    if ((audioOn || audioWaiting) && audioHold) return true;
    return false;
  }
  function holdScreen() {
    if (!screenWanted()) { return releaseScreen(); }
    if (wakeLock) return;
    // Decision 3 — say it, rather than leave a man tapping and wondering.
    if (!navigator.wakeLock) { holdRefused = true; paintAudioBar(); return; }
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        // Whatever wanted it may have ended while the request was in the air.
        if (!screenWanted()) { try { l.release(); } catch (e) {} return; }
        wakeLock = l;
        holdRefused = false; paintAudioBar();
        l.addEventListener('release', function () { wakeLock = null; });
      }, function () {
        // Refused. The prayer still runs and the reading still reads.
        holdRefused = true; paintAudioBar();
      });
    } catch (e) { holdRefused = true; paintAudioBar(); }
  }
  function releaseScreen() {
    if (screenWanted()) return;                   // the other one still wants it
    if (!wakeLock) return;
    try { wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }

  // The painter only draws. Every reading it shows comes from the wall clock,
  // so however long the screen was dark the number is the truth.
  function prayLoop() {
    if (prayPaint) { clearInterval(prayPaint); prayPaint = null; }
    if (!E.prayActive(state)) return;
    prayPaint = setInterval(function () {
      if (E.prayExpired(state)) { finishPray(); return; }
      paintPray();
    }, 250);
  }
  function startPray() {
    E.prayStart(state, praySetting('praySecs', 300));
    save();
    bookChime(E.prayLeftMs(state));
    paintPray(); prayLoop(); holdScreen();
    // The clock has begun running. On the door verse that is where the first
    // gap starts, if its owner chose the prayer as the start (Decision 117).
    knockOnRun(shownRef());
  }
  // Tapping the countdown holds it where it is; tapping again carries on from
  // exactly there. A held prayer is held for as long as it needs to be.
  function togglePausePray() {
    if (!E.prayActive(state)) return;
    if (E.prayIsPaused(state)) {
      E.prayResume(state); bookChime(E.prayLeftMs(state)); holdScreen();
      /* v1.1.1 — the clock is running again, so a gap begins here and the
         settle is armed. The knock ends on a RESUME: five unbroken seconds
         from this moment open the word panel (Decision 116). */
      knockOnRun(shownRef());
    } else {
      E.prayPause(state); cancelChime(); releaseScreen();
      /* v1.1.0 — The Secret Place, lock two. The clock pauses every time, on
         every verse, INCLUDING the door verse; the count runs silently
         underneath and nothing marks a tap. A door that behaved differently
         would give itself away with one tap (v0.4 §2.2). */
      knockOnPause();
    }
    save(); paintPray();
  }
  // A stretch ADDS to the time remaining. Nothing restarts, there is no limit,
  // and it works while paused too — someone still praying is not being counted
  // down to anything.
  function stretchPray() {
    if (!E.prayActive(state)) return;
    E.prayStretch(state, praySetting('prayStretchSecs', 300));
    save();
    // A held prayer stays held. Adding time is not a decision to carry on yet.
    if (E.prayRunning(state)) bookChime(E.prayLeftMs(state));
    paintPray();
  }
  // v1.0.5: ✕ ends the prayer at once and in silence — no chime, and nothing to
  // confirm, because nothing is lost. Built for the moment a customer walks up.
  function endPray() {
    E.prayCancel(state); save();
    cancelChime(); releaseScreen();
    if (prayPaint) { clearInterval(prayPaint); prayPaint = null; }
    paintPray();
    knockReset();   // no clock, no knock
  }
  // A prayer that ran out — whether or not anyone was looking.
  function finishPray() {
    var wasBooked = bookedChime.length > 0;
    E.prayCancel(state); save();
    releaseScreen();
    knockReset();   // the clock ran out mid-knock; nothing is carried over
    if (prayPaint) { clearInterval(prayPaint); prayPaint = null; }
    paintPray();
    // Decision 53: if the bell was booked it has already sounded on time. If the
    // page was suspended and never got there, it lands now — the instant the
    // phone is picked up. Recorded, not hidden.
    if (!wasBooked) chime();
    bookedChime = [];
  }
  // Reopening inside the window returns you to the prayer, still running.
  // A prayer that ended while the app was closed resolves quietly on opening.
  function resumePrayOnLoad() {
    if (!E.prayActive(state)) return;
    if (E.prayExpired(state)) { finishPray(); return; }
    if (E.prayRunning(state)) { bookChime(E.prayLeftMs(state)); holdScreen(); }
    paintPray(); prayLoop();
  }

  // The chime is generated, not a file — no download, no network, and it works
  // with the extension offline. Soft and brief: built for a desk with a customer
  // sitting across it, not for a bedside alarm.
  //
  // Decision 53 — it is BOOKED AHEAD on the audio clock the moment the prayer
  // starts, so it can sound with the screen out rather than waiting for someone
  // to be looking. The media-track method that would guarantee it is refused:
  // it takes audio focus and stops whatever the man is listening to, and §16
  // says no notifications and means it.
  function chimeParts() {
    /* v1.1.0, Ruling 95 — the shared-timer exception closes here.
       Order My Steps has carried one-to-five chimes (Decision 68) and a
       nine-position volume (Decision 67) since v11; DrawNigh kept single/double
       and a slider. One timer again, in both products. */
    var mode = (state.settings && state.settings.prayChime) || 'single';
    var vol = (state.settings && state.settings.prayVol);
    if (vol === undefined) vol = 0.55;
    var COUNT = { off: 0, single: 1, double: 2, three: 3, four: 4, five: 5 };
    var n = COUNT[mode];
    if (n === undefined) n = 1;
    var times = [];
    for (var i = 0; i < n; i++) times.push(i * 0.42);
    return { mode: mode, vol: vol, times: times };
  }
  function audio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function strike(ctx, at, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;                       // gentle, bell-like
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.28), at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g); g.connect(ctx.destination);
    o.start(at); o.stop(at + 1.0);
    return o;
  }
  function bookChime(msFromNow) {
    cancelChime();
    var p = chimeParts();
    if (p.mode === 'off' || p.vol <= 0) return;
    try {
      var ctx = audio(); if (!ctx) return;
      var base = ctx.currentTime + Math.max(0, msFromNow) / 1000;
      p.times.forEach(function (t) { bookedChime.push(strike(ctx, base + t, p.vol)); });
    } catch (e) { /* a silent failure is better than a broken screen */ }
  }
  function cancelChime() {
    bookedChime.forEach(function (o) { try { o.stop(); } catch (e) {} });
    bookedChime = [];
  }
  function chime(force) {
    var p = chimeParts();
    if (p.mode === 'off' && !force) return;
    if (p.vol <= 0 && !force) return;
    try {
      var ctx = audio(); if (!ctx) return;
      var vol = force ? Math.max(p.vol, 0.2) : p.vol;
      p.times.forEach(function (t) { strike(ctx, ctx.currentTime + t, vol); });
    } catch (e) { /* a silent failure is better than a broken screen */ }
  }

  // v1.0.4: the history question is asked ONCE, at setup, and never again —
  // never assumed, never nudged, and never stacked on top of another card.
  // Refusing it is a complete answer.
  function maybeAskDeclare() {
    if (state.declaredAsked) return;
    if ($('vodOverlay').classList.contains('show')) return;   // wait its turn
    state.declaredAsked = true; save();
    setTimeout(function () { $('declareOverlay').classList.add('show'); }, 500);
  }

  /* ============================================================
     v1.0.4 — the ⋮ menu
     A dot means something is waiting. It does NOT clear from merely
     opening the menu — only from answering, or from looking at the
     badge itself. God's word should stay on the reader's mind.
     ============================================================ */
  function openMenu() {
    refreshMenu();
    positionMenuAnchor();
    $('menuSheet').classList.add('show');
  }
  // v1.0.7: on desktop/laptop the panel drops from directly under the ⋮
  // button. header/main are centered in a 720px column at these widths, so
  // the button is not at the window's true right edge — measure it fresh
  // each time, rather than guessing a fixed offset in CSS.
  function positionMenuAnchor() {
    var panel = document.querySelector('#menuSheet .sheet-panel');
    if (window.innerWidth < 700) { panel.style.top = ''; panel.style.right = ''; return; }
    var btn = $('btnDots').getBoundingClientRect();
    panel.style.top = Math.round(btn.bottom + 8) + 'px';
    panel.style.right = Math.round(window.innerWidth - btn.right) + 'px';
  }
  function closeMenu() { $('menuSheet').classList.remove('show'); }
  function refreshMenu() {
    updateCatchChip();
    fillJump(shownRef() || [currentBook, 0, 0]);
    var offer = pendingOffer();
    $('miLadder').style.display = offer ? '' : 'none';
    if (offer) $('miLadderText').textContent = 'A word about ' + planName();
    $('badgeDot').style.display = E.unseenBadges(state).length ? '' : 'none';
  }
  function planName() {
    var p = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    return p ? p.name : 'your plan';
  }
  function updateDots() {
    var waiting = !!pendingOffer() || E.unseenBadges(state).length > 0;
    $('dotsDot').style.display = waiting ? '' : 'none';
  }

  /* ============================================================
     v1.0.4 — the plan ladder
     It can only ever offer to lighten. It never proposes reading more,
     never counts what was not read, and the word "behind" appears
     nowhere in it.
     ============================================================ */
  var cachedOffer = null;
  function pendingOffer() {
    if (!E.ladderDue(state)) return state.ladder && state.ladder.offer;
    cachedOffer = E.ladderOffer(state);
    if (state.ladder) state.ladder.offer = cachedOffer;
    return cachedOffer;
  }
  function openLadder() {
    var o = pendingOffer();
    if (!o) return;
    closeMenu();
    $('ladderTitle').textContent = planName();
    $('ladderText').textContent = o.text;
    $('ladderNote').textContent = o.voice === 'absent'
      ? 'One verse a day. Nothing is lost, and nothing is owed.'
      : 'This would set the plan to about ' + o.suggested + ' a day. Nothing already read is touched.';
    $('ladderAccept').textContent = o.voice === 'absent' ? 'Yes, one verse' : 'Match my pace';
    $('ladderOverlay').classList.add('show');
  }

  /* ============================================================
     v1.0.4 — badges
     Everything badged is time, never throughput. Discovered rather
     than announced: nothing ever appears over a verse.
     ============================================================ */
  function openBadges() {
    closeMenu();
    bShown = null;
    renderBadgeSheet();
    $('badgeSheet').classList.add('show');
    E.markBadgesSeen(state);      // the dot clears from LOOKING, per the rule
    save();
    updateDots();
  }
  function renderBadgeSheet() {
    // v1.0.9, Decision 89 — the count AND the gap, on every card. Not the count
    // alone, and never a progress bar: a bar is the one visual language that
    // exists purely to make an incomplete thing feel unfinished. Hiding a number
    // the app already knows, to protect a man from a thought the inscription has
    // already answered, would be the pretending the house rule forbids.
    var rank = E.rankFor(state), done = E.bibleCompletions(state);
    $('bRank').textContent = rank[1];
    var nextR = E.nextTier(E.RANKS, done);
    $('bRankNote').textContent = done + ' whole Bible' + (done === 1 ? '' : 's') +
      (nextR ? ' — ' + (nextR[0] - done) + ' more to ' + nextR[1] : ' — the last rung');

    var sb = E.streakBadge(state), days = state.streak.days || 0;
    var nextS = E.nextTier(E.STREAK_BADGES, days);
    $('bStreakName').textContent = sb ? '🔥 ' + sb[1] : '🔥 Not lit yet';
    $('bStreakNote').textContent = days + ' day' + (days === 1 ? '' : 's') +
      (nextS ? ' — ' + (nextS[0] - days) + ' more to ' + nextS[1] : ' — nothing burns longer');

    var grid = $('bTiles');
    grid.innerHTML = '';
    for (var b = 0; b < 66; b++) {
      (function (bi) {
        var t = document.createElement('button');
        var comp = E.bookCompletions(state, bi);
        t.className = 'tile' + (comp > 0 ? ' done' : (E.bookTouched(state, bi) ? ' on' : ''));
        t.textContent = E.BOOKS[bi].slice(0, 3);
        t.title = E.BOOKS[bi];
        t.onclick = function () { showBookCard(bi); };
        grid.appendChild(t);
      })(b);
    }
    $('bDetail').style.display = 'none';
    $('bLadder').style.display = 'none';
    renderMilestones();
  }

  /* v1.0.9, Decision 88 + 90 — every tier is visible from the first day,
     beneath the fixed inscription. Hiding the names makes them a reward for
     progress; showing them makes them a description of the road, which is what
     they were written to be. One screen, sections, each heading opening its own
     full ladder — nothing scrolls forever and nothing hides. */
  function openTierLadder(which) {
    var el = $('bLadder');
    while (el.firstChild) el.removeChild(el.firstChild);
    var table, now, unit, title;
    if (which === 'rank') {
      table = E.RANKS; now = E.bibleCompletions(state); unit = 'whole Bibles'; title = 'The ranks';
    } else {
      table = E.STREAK_BADGES; now = state.streak.days || 0; unit = 'days'; title = 'The flame';
    }
    var block = document.createElement('div'); block.className = 'badge-block';
    var h = document.createElement('div'); h.className = 'badge-title'; h.textContent = title;
    block.appendChild(h);
    var note = document.createElement('div'); note.className = 'note';
    note.textContent = 'The whole road, from the first day. ' + now.toLocaleString() + ' ' + unit + ' so far.';
    block.appendChild(note);
    var reachedIdx = -1, i;
    for (i = 0; i < table.length; i++) if (now >= table[i][0]) reachedIdx = i;
    for (i = 0; i < table.length; i++) {
      var r = document.createElement('div');
      r.className = 'ladder-row' + (i < reachedIdx ? ' reached' : (i === reachedIdx ? ' here' : ''));
      var a = document.createElement('span'); a.textContent = table[i][1];
      var c = document.createElement('span'); c.className = 'n';
      c.textContent = (i === reachedIdx ? 'you are here · ' : '') + table[i][0].toLocaleString();
      r.appendChild(a); r.appendChild(c); block.appendChild(r);
    }
    el.appendChild(block);
    el.style.display = '';
    el.scrollIntoView({ block: 'nearest' });
  }

  /* v1.0.9, v16.1 §2.1 — a date says something happened. A rank says where you
     stand. Nothing already earned on the day this landed is backfilled: history
     starts when dates start. */
  /* v1.1.1, Decisions 113 and 115 — THE LAST FIVE, AND THE DATE SAYS BANKED.
     Dickson asked what the list was for, and he was right to: the book card
     already carries The Road and The Well, the streak card carries its tier,
     rank carries its own. The only thing the list held that nothing else did
     was the date — and it grew to a hundred rows saying it.
     So it is the last five, across the whole journey: streak, rank, books and
     wells all come through earnedBadges() and all have always been recorded
     here. Nothing is destroyed — the store still keeps 400.
     And the date is the date BANKED, not the date reached. The app cannot know
     when a book was finished (reading history carries no per-verse dates), and
     the one-time lap repair therefore stamps today on books finished long ago.
     Keeping the date and fixing the label is truer than either keeping it
     falsely or throwing away a real fact. It is also true of every other row:
     a milestone earned in the ordinary way is banked the day it is reached. */
  var MILESTONES_SHOWN = 5;
  // v1.1.2 — a first completion always earns The Road and The Well's first
  // tier together, in the same instant (recordMilestones pushes road:B then
  // well:B:1 in one call, both dated today). One event, not two — collapsed
  // to one row. A later lap that earns a new Well tier (no new Road) still
  // gets its own row, because there is no road entry beside it to collapse
  // with.
  function milestoneNameFirst(book) {
    return '📖🪣 ' + E.BOOKS[book] + ' — walked · A First Draw';
  }
  function renderMilestones() {
    var ms = (state.milestones || []).slice().reverse().slice(0, MILESTONES_SHOWN);
    var wrap = $('bMilestones'), list = $('bMilestoneList');
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!ms.length) { wrap.style.display = 'none'; return; }
    var rows = [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i], p = m.id.split(':');
      if (p[0] === 'well' && p[2] === '1' && i + 1 < ms.length) {
        var n = ms[i + 1], q = n.id.split(':');
        if (q[0] === 'road' && q[1] === p[1] && n.date === m.date) {
          rows.push({ name: milestoneNameFirst(+p[1]), date: m.date });
          i++;
          continue;
        }
      }
      rows.push({ name: milestoneName(m.id), date: m.date });
    }
    rows.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'milestone-row';
      var a = document.createElement('b'); a.textContent = r.name;
      var c = document.createElement('span'); c.textContent = 'banked ' + longDate(r.date);
      row.appendChild(a); row.appendChild(c); list.appendChild(row);
    });
    wrap.style.display = '';
  }
  function milestoneName(id) {
    var p = id.split(':');
    if (p[0] === 'streak') { var s = tierName(E.STREAK_BADGES, +p[1]); return s ? '🔥 ' + s : id; }
    if (p[0] === 'rank') { var r = tierName(E.RANKS, +p[1]); return r ? '★ ' + r : id; }
    if (p[0] === 'road') return '📖 ' + E.BOOKS[+p[1]] + ' — walked';
    if (p[0] === 'well') { var w = tierName(E.WELL_TIERS, +p[2]); return '🪣 ' + E.BOOKS[+p[1]] + ' — ' + (w || p[2] + '×'); }
    return id;
  }
  function tierName(table, threshold) {
    for (var i = 0; i < table.length; i++) if (table[i][0] === threshold) return table[i][1];
    return null;
  }
  // One book at a time, because the rank star is LIVE — it shows the rank the
  // reader holds now, not the one they held when the book was finished. Drawing
  // that for all 66 at once would be needless work and an unreadable screen.
  var bShown = null;      // which book card is open, so a redraw can find it
  function showBookCard(b) {
    bShown = b;
    var comp = E.bookCompletions(state, b), well = E.wellTier(state, b);
    var prog = E.bookProgress(state, b), rank = E.rankFor(state);
    var nextW = E.nextTier(E.WELL_TIERS, comp);
    // Built as nodes, not markup, so this screen adds nothing to the linter's
    // list — the release baseline stays exactly where it has always been.
    var el = $('bDetail');
    while (el.firstChild) el.removeChild(el.firstChild);
    var card = document.createElement('div'); card.className = 'detail-card';
    var title = document.createElement('div'); title.className = 'badge-title';
    title.textContent = E.BOOKS[b];
    card.appendChild(title);
    function row(k, v) {
      var r = document.createElement('div'); r.className = 'detail-row';
      var a = document.createElement('span'); a.textContent = k;
      var c = document.createElement('span'); c.textContent = v;
      r.appendChild(a); r.appendChild(c); card.appendChild(r);
    }
    row('The Road', comp > 0 ? 'Walked' : prog.read + ' / ' + prog.size + ' this time round');
    row('The Well', well ? well[1] + ' · ' + comp + '×' : 'not yet drawn');
    if (nextW) row('Next', nextW[1] + ' at ' + nextW[0] + '×');
    row('Rank', '★ ' + rank[1]);
    el.appendChild(card);
    el.style.display = '';
    el.scrollIntoView({ block: 'nearest' });
  }

  // v13: at a book's first verse the button names its destination rather
  // than greying out — visible, one tap, impossible to trigger by accident.
  function updatePrevButton() {
    var btn = $('btnPrev'), here = shownRef();
    if (!here) { btn.disabled = true; btn.textContent = '‹ Prev'; return; }
    if (mode === 'random') {
      btn.textContent = '‹ Prev';
      btn.disabled = randTrail.length < 2 || randPos === 0;
      return;
    }
    var p = stepFrom(here, -1);
    btn.disabled = !p;
    btn.textContent = (p && mode === 'book' && p[0] !== here[0])
      ? '‹ ' + E.refLabel(p[0], p[1], p[2])
      : '‹ Prev';
  }

  // ---------- Serving verses ----------
  function serveNext() {
    // v13 — a review trip retraces forward first. Nothing on a review trip
    // counts: the reader is walking back over ground already covered, and the
    // live position was never moved.
    if (view) {
      var fwd = stepFrom(view.ref, 1);
      if (!fwd || (current && fwd[0] === current.ref[0] && fwd[1] === current.ref[1] && fwd[2] === current.ref[2])) {
        view = null;                              // caught up: normal reading resumes
        showVerse(current.ref, footFor(current));
        if (mode === 'book') fillJump(current.ref);
        return;
      }
      view = { ref: fwd, planId: view.planId };
      showVerse(fwd, footFor(view));
      if (mode === 'book') fillJump(fwd);
      return;
    }
    if (mode === 'random' && randPos >= 0 && randPos < randTrail.length - 1) {
      randPos++;
      current = randTrail[randPos];
      showVerse(current.ref, footFor(current));
      return;
    }
    randPos = -1;
    // Count the verse being left behind FIRST, so plan pointers and book
    // positions have moved before we ask "what comes next?"
    if (current && !current.counted) countCurrent();
    var ref, planId = null, foot = '';
    if (mode === 'plan') {
      var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
      if (!plan) { switchScreen('plans'); return; }
      var gi = E.planNextIndex(plan);
      if (gi < 0) {
        // v1.0.9 — a Well does not finish. The lap ends, it names the count,
        // and he chooses: draw again, or stop. Nothing rolls over silently,
        // because the returns are the whole point of the Well.
        if (E.isWell(plan)) { askWell(plan); return; }
        $('verseRef').textContent = plan.name;
        $('verseText').innerHTML = '<span class="cap">F</span>inished! Every verse in this plan has been read. 🎉';
        $('verseNote').style.display = 'none';
        $('verseFoot').textContent = 'Start a new plan, or read on in Book or Random mode.';
        $('verseBookFoot').textContent = '';   // v1.0.3: nothing left to measure
        $('verseChapFoot').textContent = '';
        return;
      }
      ref = E.indexToRef(gi);
      planId = plan.id;
      // A Well counts depth, not pace: how far down the rope, and nothing else.
      foot = E.isWell(plan)
        ? '🪣 ' + plan.name + ' — ' + E.planRemaining(plan).toLocaleString() + ' verses to the bottom of this draw'
        : plan.name + ' — ' + E.planRemaining(plan).toLocaleString() + ' verses remain';
    } else if (mode === 'random') {
      ref = E.randomVerse();
    } else {
      var p = E.bookPosition(state, currentBook);
      ref = [currentBook, p[0], p[1]];
    }
    // A verse is counted when the reader moves past it with Next › —
    // a verse merely shown is never counted (same rule as the pop-up cards).
    current = { ref: ref, counted: false, planId: planId };
    if (mode === 'random') {
      randTrail.push(current);
      if (randTrail.length > 500) randTrail.shift();
      randPos = -1;
    }
    showVerse(ref, foot);
    if (mode === 'book') fillJump(ref);
  }

  function footFor(cur) {
    if (cur.planId) {
      var plan = E.getPlan(state, cur.planId);
      if (plan) return plan.name + ' — ' + E.planRemaining(plan).toLocaleString() + ' verses remain';
    }
    return '';
  }

  // v8: the jump row (Book · Chapter · Verse) always reflects the verse on stage.
  function fillJump(ref) {
    var b = ref[0], c = ref[1], v = ref[2];
    var bs = $('bookSelect'), cs = $('chapSelect'), vs = $('verseSelect');
    bs.value = String(b);
    if (cs.dataset.book !== String(b)) {
      cs.innerHTML = '';
      E.COUNTS[b][1].forEach(function (_, i) {
        var o = document.createElement('option'); o.value = i; o.textContent = 'Ch ' + (i + 1); cs.appendChild(o);
      });
      cs.dataset.book = String(b);
      vs.dataset.key = '';
    }
    cs.value = String(c);
    var key = b + ':' + c;
    if (vs.dataset.key !== key) {
      vs.innerHTML = '';
      for (var i = 0; i < E.COUNTS[b][1][c]; i++) {
        var o = document.createElement('option'); o.value = i; o.textContent = 'v ' + (i + 1); vs.appendChild(o);
      }
      vs.dataset.key = key;
    }
    vs.value = String(v);
  }

  // v8: jumping shows a verse and moves the book's bookmark there.
  // Jumping itself counts nothing — only reading (Next ›) counts.
  function jumpTo(b, c, v) {
    currentBook = b;
    state.positions[b] = [c, v];
    save();
    current = null;             // the verse being left was never read past — not counted
    serveNext();
  }

  function countCurrent() {
    if (!current || current.counted) return;
    var r = current.ref;
    E.countRead(state, r[0], r[1], r[2], { planInOrder: current.planId });
    current.counted = true;
    if (mode === 'book' && current.planId === null) {
      // advance the bookmark only when the verse actually belongs to book mode
      var p = E.bookPosition(state, currentBook);
      if (p[0] === r[1] && p[1] === r[2] && r[0] === currentBook) E.bookAdvance(state, currentBook);
    }
    // v1.0.9 — a tier reached now gets a date. It records that something
    // happened; it is not a standing and it is never counted.
    E.recordMilestones(state);
    save();
  }

  /* v1.0.9, v16.1 §4.4 — the end of a lap. Rolling over silently was rejected:
     a man would pass his own milestone without noticing. Offering another book
     was rejected too — that quietly nudges him out, which contradicts stay. */
  var wellPending = null;
  function askWell(plan) {
    wellPending = plan.id;
    var n = (plan.laps || 0) + 1;
    $('wellTitle').textContent = plan.name + ', ' + ordinal(n) + ' time';
    $('wellText').textContent = 'You have drawn ' + plan.name + ' through, ' + ordinal(n) +
      ' time since this Well was dug. Draw again, or stop here.';
    $('wellOverlay').classList.add('show');
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // v13 — Prev is navigation only. It NEVER decrements the daily total,
  // plan progress or the streak, and it never moves the live position.
  function goPrev() {
    if (mode === 'random') {
      if (randTrail.length === 0) return;
      if (randPos === -1) randPos = randTrail.length - 1;
      if (randPos > 0) randPos--;
      current = randTrail[randPos];
      showVerse(current.ref, footFor(current));
      return;
    }
    var here = shownRef();
    if (!here) return;
    var p = stepFrom(here, -1);
    if (!p) return;                       // Genesis 1:1, or the plan's first verse
    if (mode === 'book' && p[0] !== currentBook) {
      currentBook = p[0];                 // crossing books: the pill follows
      var bs = $('bookSelect'); if (bs) bs.value = String(currentBook);
    }
    view = { ref: p, planId: current ? current.planId : null };
    showVerse(p, footFor(view));
    fillJump(p);
  }

  // ---------- Screens ----------
  function switchScreen(name) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + name).classList.add('active');
    document.querySelectorAll('nav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.screen === name);
    });
    if (name === 'books') renderBooks();
    if (name === 'plans') renderPlans();
    if (name === 'favs') renderFavs();
    if (name === 'settings') renderSettings();
  }

  // ---------- Books ----------
  function renderBooks() {
    var g = $('booksGrid'); g.innerHTML = '';
    E.BOOKS.forEach(function (name, b) {
      var pos = state.positions[b];
      var el = document.createElement('button');
      el.className = 'book-card' + (pos ? ' started' : '');
      el.innerHTML = '<b>' + name + '</b><span>' +
        (pos ? 'Resume at ' + (pos[0] + 1) + ':' + (pos[1] + 1) : E.COUNTS[b][1].length + ' chapters') + '</span>';
      el.onclick = function () {
        currentBook = b; mode = 'book';
        setPills(); $('bookSelect').value = b;
        switchScreen('read'); serveNext();
      };
      g.appendChild(el);
    });
  }

  // ---------- Plans ----------
  function renderPlans() {
    var list = $('plansList'); list.innerHTML = '';
    if (!state.plans.length) {
      list.innerHTML = '<div class="empty">No plans yet. The ⭐ Thanksgiving &amp; Wisdom starter (Psalms + Proverbs in a month) is one tap away below.</div>';
    }
    state.plans.forEach(function (plan) {
      var read = E.planReadCount(plan);
      var pct = Math.round(100 * read / plan.size);
      var el = document.createElement('div');
      el.className = 'plan-card' + (plan.featured ? ' featured' : '');
      // v1.0.9 — a Well counts depth, not pace. Verses remaining and nothing
      // else: no daily number, no end date, no percentage and no bar. A bar is
      // the one visual language that exists to make an incomplete thing feel
      // unfinished, and a man drawing water is not behind on anything.
      var body = E.isWell(plan)
        ? '<div class="plan-title"><b>🪣 ' + esc(plan.name) + '</b><span class="star">the Well</span></div>' +
          '<div class="well-meta">' + E.planRemaining(plan).toLocaleString() + ' verses to the bottom of this draw</div>' +
          '<div class="note">' + (plan.laps
            ? esc(plan.name) + ' drawn ' + plan.laps + (plan.laps === 1 ? ' time' : ' times') + ' since this Well was dug.'
            : 'Finish it and it begins again at the first verse.') + '</div>'
        : '<div class="plan-title"><b>' + esc(plan.name) + '</b>' +
          (plan.featured ? '<span class="star">⭐ featured</span>' : '') + '</div>' +
          '<div class="plan-meta">' + read.toLocaleString() + ' / ' + plan.size.toLocaleString() +
          ' verses · ' + plan.target.toLocaleString() + '/day · ' + pct + '%</div>' +
          '<div class="progress"><span style="width:' + pct + '%"></span></div>';
      el.innerHTML = body + '<div class="plan-actions"></div>';
      var acts = el.querySelector('.plan-actions');

      var readBtn = document.createElement('button');
      readBtn.className = 'small-btn gold';
      readBtn.textContent = state.activePlanId === plan.id ? '▶ Reading' : 'Read this plan';
      readBtn.onclick = function () {
        state.activePlanId = plan.id; save();
        mode = 'plan'; setPills(); switchScreen('read'); serveNext();
      };
      acts.appendChild(readBtn);

      if (plan.scopeType !== 'favorites' && !E.isWell(plan)) {
        var cuBtn = document.createElement('button');
        cuBtn.className = 'small-btn';
        cuBtn.textContent = 'Catch up';
        cuBtn.onclick = function () { openCatchUp(plan.id); };
        acts.appendChild(cuBtn);
      }

      var tog = document.createElement('label');
      tog.className = 'toggle';
      tog.innerHTML = '<input type="checkbox"' + (plan.countEverything ? ' checked' : '') + '> Count everything';
      tog.querySelector('input').onchange = function (e) {
        plan.countEverything = e.target.checked; save();
      };
      acts.appendChild(tog);

      var del = document.createElement('button');
      del.className = 'small-btn danger';
      del.textContent = 'Remove';
      del.onclick = function () {
        if (!confirm('Remove the plan "' + plan.name + '"? Its progress record goes with it.')) return;
        state.plans = state.plans.filter(function (p) { return p.id !== plan.id; });
        if (state.activePlanId === plan.id) state.activePlanId = state.plans.length ? state.plans[0].id : null;
        save(); renderPlans();
      };
      acts.appendChild(del);

      /* v1.0.9 item 2 — self-service plan controls (v15.1 §3.8).
         Both numbers are on screen, because the whole point is seeing one move
         when you change the other. It goes BOTH ways — stretch, tighten, or
         finish sooner — unlike the ladder, which can only ever lighten.
         Nothing here touches a verse already read, the daily total or the
         streak: it changes only what the plan asks of tomorrow.
         A Well has no daily number by design, so it is offered none. */
      if (!E.isWell(plan) && E.planRemaining(plan) > 0) {
        var ed = document.createElement('div');
        ed.className = 'plan-edit';
        function mkRow(labelText, input) {
          var r = document.createElement('div'); r.className = 'row';
          var l = document.createElement('label'); l.textContent = labelText;
          r.appendChild(l); r.appendChild(input); ed.appendChild(r);
        }
        var tIn = document.createElement('input');
        tIn.type = 'number'; tIn.min = '1'; tIn.className = 'pe-target';
        mkRow('Verses a day', tIn);
        var dIn = document.createElement('input');
        dIn.type = 'date'; dIn.className = 'pe-end';
        mkRow('Finish by', dIn);
        var eff = document.createElement('div'); eff.className = 'effect'; ed.appendChild(eff);
        var edActs = document.createElement('div'); edActs.className = 'plan-actions';
        var keepBtn = document.createElement('button');
        keepBtn.className = 'small-btn gold pe-keep'; keepBtn.textContent = 'Keep it';
        var undoBtn = document.createElement('button');
        undoBtn.className = 'small-btn pe-undo'; undoBtn.textContent = 'Put it back';
        edActs.appendChild(keepBtn); edActs.appendChild(undoBtn); ed.appendChild(edActs);
        var was = plan.target, draft = plan.target;
        function paintEffect() {
          var left = E.planRemaining(plan);
          var days = Math.ceil(left / draft);
          var end = E.addDays(E.todayStr(), days - 1);
          tIn.value = draft; dIn.value = end;
          eff.textContent = left.toLocaleString() + ' verses left · ' +
            draft.toLocaleString() + ' a day · ' + days.toLocaleString() +
            (days === 1 ? ' day' : ' days') + ' · finishing ' + longDate(end) +
            (draft === was ? '' : '  (was ' + was.toLocaleString() + ' a day)');
        }
        tIn.oninput = function () {
          var n = parseInt(tIn.value, 10);
          if (!(n >= 1)) return;
          draft = Math.min(n, E.planRemaining(plan)); paintEffect();
        };
        dIn.onchange = function () {
          if (!dIn.value) return;
          var span = E.daysBetween(E.todayStr(), dIn.value) + 1;
          if (!(span >= 1)) span = 1;
          draft = Math.max(1, Math.ceil(E.planRemaining(plan) / span)); paintEffect();
        };
        keepBtn.onclick = function () {
          E.planSetTarget(state, plan, draft); save(); renderPlans();
        };
        undoBtn.onclick = function () { draft = was; paintEffect(); };
        paintEffect();
        el.appendChild(ed);
      }

      list.appendChild(el);
    });
    updateCatchChip(); // v10: activating, locking, or deleting plans changes the chip
  }
  function longDate(d) {
    try {
      return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return d; }
  }

  function pbScopeOpts() {
    var scope = $('pbScope').value;
    var well = scope === 'well';
    $('pbBookField').style.display = (scope === 'book' || well) ? 'block' : 'none';
    $('pbGroupField').style.display = scope === 'group' ? 'block' : 'none';
    // v1.0.9 — a Well carries no daily number, so it is offered no duration.
    // The rope has an end; he is not measuring pulls.
    $('pbDays').parentNode.style.display = well ? 'none' : '';
    pbShapeFields();
    $('pbWellNote').style.display = well ? '' : 'none';
    $('pbCalc').style.display = well ? 'none' : '';
    pbCalc();
  }
  /* v1.1.4, Decision 149 — two more ways of saying the same thing. A man with a
     date in mind should not have to count the days to it, and a man who knows
     what he can read in a sitting should not have to work backwards from a
     duration. Each reveals its own box, exactly as Custom… already does, and the
     presets stay untouched. */
  function pbShapeFields() {
    var well = $('pbScope').value === 'well', v = $('pbDays').value;
    $('pbCustomField').style.display = (!well && v === 'custom') ? 'block' : 'none';
    $('pbDateField').style.display = (!well && v === 'date') ? 'block' : 'none';
    $('pbPerDayField').style.display = (!well && v === 'perday') ? 'block' : 'none';
  }
  // Days to a chosen finish date. null when nothing is chosen; zero or less when
  // the date is today or already past, which Decision 149 says plainly rather
  // than turning into a nonsense plan.
  function pbDateDays() {
    var s = $('pbDate').value;
    if (!s) return null;
    var target = new Date(s + 'T00:00:00');
    if (isNaN(target.getTime())) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }
  function pbScopeSize() {
    var def = pbScopeDef();
    if (!def) return 0;
    var pv = E.previewPlan(def.type, def.books, state.favorites.length, 1);
    return (pv && pv.size) || 0;
  }
  function pbDaysVal() {
    // Blank until the user decides — no quietly pre-chosen duration.
    var v = $('pbDays').value;
    if (v === '') return null;
    if (v === 'custom') {
      var n = parseInt($('pbCustom').value, 10);
      return n >= 1 ? n : null;
    }
    if (v === 'date') {
      var d = pbDateDays();
      return (d !== null && d >= 1) ? d : null;
    }
    if (v === 'perday') {
      var per = parseInt($('pbPerDay').value, 10);
      if (!(per >= 1)) return null;
      var size = pbScopeSize();
      if (!size) return null;
      return Math.max(1, Math.ceil(size / per));
    }
    return parseInt(v, 10);
  }
  // The date a plan of this many days finishes on, said in full — so the choice
  // is seen before Lock it in, not discovered afterwards.
  function pbFinishOn(days) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(0, days - 1));
    try {
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }
  function pbScopeDef() {
    var scope = $('pbScope').value;
    if (scope === '') return null;
    if (scope === 'full') return { type: 'full', books: null, name: 'Full Bible' };
    if (scope === 'nt') return { type: 'nt', books: null, name: 'New Testament' };
    if (scope === 'ot') return { type: 'ot', books: null, name: 'Old Testament' };
    if (scope === 'favorites') return { type: 'favorites', books: null, name: 'My Favorites' };
    if (scope === 'featured') return { type: 'books', books: [18, 19], name: 'Thanksgiving & Wisdom', featured: true };
    if (scope === 'well') {
      if ($('pbBook').value === '') return null;
      var wb = parseInt($('pbBook').value, 10);
      return { type: 'well', books: [wb], name: E.BOOKS[wb] };
    }
    if (scope === 'book') {
      if ($('pbBook').value === '') return null;
      var b = parseInt($('pbBook').value, 10);
      return { type: 'books', books: [b], name: E.BOOKS[b] };
    }
    var books = [];
    document.querySelectorAll('#pbGroup input:checked').forEach(function (i) { books.push(parseInt(i.value, 10)); });
    var nm = books.length ? books.map(function (b) { return E.BOOKS[b]; }).join(', ') : 'Choose books';
    if (nm.length > 42) nm = books.length + ' books';
    return { type: 'books', books: books, name: nm };
  }
  function pbCalc() {
    if ($('pbScope').value === 'well') return;      // v1.0.9: no pace to compute
    var def = pbScopeDef(), days = pbDaysVal();
    if (def === null) {
      $('pbCalc').textContent = $('pbScope').value === 'book'
        ? 'Choose which book you will read.'
        : 'Choose what you will read to begin.';
      return;
    }
    if (def.type === 'books' && (!def.books || !def.books.length)) {
      $('pbCalc').textContent = 'Choose at least one book to see the daily requirement.';
      return;
    }
    if (def.type === 'favorites' && !state.favorites.length) {
      $('pbCalc').textContent = 'You have no favorites saved yet — tap ♥ on verses you love first.';
      return;
    }
    if (days === null) {
      var pv0 = E.previewPlan(def.type, def.books, state.favorites.length, 1);
      var shape = $('pbDays').value;
      /* v1.1.4, Decision 149's first guard — a finish date of today or earlier
         is said plainly rather than made into a nonsense plan. */
      var dd = (shape === 'date') ? pbDateDays() : null;
      $('pbCalc').textContent =
        (shape === 'date' && dd !== null && dd < 1)
          ? (dd === 0
              ? 'That is today. A plan needs at least one day ahead of it — choose tomorrow or later.'
              : 'That date has already passed. Choose one ahead of today.')
        : (shape === 'date')
          ? def.name + ' has ' + pv0.size.toLocaleString() + ' verses. Choose the day you want to finish on.'
        : (shape === 'perday')
          ? def.name + ' has ' + pv0.size.toLocaleString() + ' verses. Say how many you will read a day.'
        : def.name + ' has ' + pv0.size.toLocaleString() + ' verses. Choose how long you want to take.';
      return;
    }
    var pv = E.previewPlan(def.type, def.books, state.favorites.length, days);
    /* v1.1.4, Decision 149's second guard — the line beneath shows what the
       choice works out to, in both directions, before Lock it in. */
    $('pbCalc').textContent = def.name + ' has ' + pv.size.toLocaleString() +
      ' verses. That is ' + pv.perDay.toLocaleString() + ' a day for ' +
      days.toLocaleString() + ' day' + (days === 1 ? '' : 's') +
      ', finishing ' + pbFinishOn(days) + '. Lock it in?';
  }
  function pbReset() {
    // A truly fresh sheet every time the form opens — nothing carries over.
    $('pbScope').value = '';
    $('pbBook').value = '';
    document.querySelectorAll('#pbGroup input').forEach(function (i) { i.checked = false; });
    $('pbDays').value = '';
    $('pbCustom').value = '';
    $('pbDate').value = '';
    $('pbPerDay').value = '';
    $('pbBookField').style.display = 'none';
    $('pbGroupField').style.display = 'none';
    $('pbCustomField').style.display = 'none';
    $('pbDateField').style.display = 'none';
    $('pbPerDayField').style.display = 'none';
  }
  function lockPlan() {
    var def = pbScopeDef();
    if (def === null) return;
    // v1.0.9 — the Well takes no duration, and only one may stand at a time.
    if (def.type === 'well') {
      if (!E.makeWell(state, def.books[0])) {
        $('pbCalc').style.display = '';
        $('pbCalc').textContent = 'You are already digging ' + E.activeWell(state).name +
          '. One Well at a time — digging two books at once is not digging.';
        return;
      }
      save();
      $('planBuilder').style.display = 'none';
      renderPlans();
      return;
    }
    var days = pbDaysVal();
    if (days === null) return;
    if (def.type === 'books' && (!def.books || !def.books.length)) return;
    if (def.type === 'favorites' && !state.favorites.length) return;
    E.makePlan(state, { name: def.name, scopeType: def.type, scopeBooks: def.books, days: days, featured: def.featured });
    save();
    $('planBuilder').style.display = 'none';
    renderPlans();
  }

  // ---------- Catch Up ----------
  function openCatchUp(planId) {
    cuPlanId = planId;
    var plan = E.getPlan(state, planId);
    // v10 nameplate: from the Read screen you haven't just tapped a named
    // card, so the window itself says which plan it will credit.
    $('cuTitle').textContent = 'Catch up — ' + plan.name;
    var sel = $('cuBook'); sel.innerHTML = '';
    var books = [];
    if (plan.scopeType === 'full') books = E.BOOKS.map(function (_, i) { return i; });
    else if (plan.scopeType === 'ot') books = E.BOOKS.slice(0, 39).map(function (_, i) { return i; });
    else if (plan.scopeType === 'nt') books = E.BOOKS.slice(39).map(function (_, i) { return i + 39; });
    else books = plan.scopeBooks.slice().sort(function (a, b) { return a - b; });
    books.forEach(function (b) {
      var o = document.createElement('option'); o.value = b; o.textContent = E.BOOKS[b];
      sel.appendChild(o);
    });
    cuChapters(); cuVerses(); cuUpdate();
    $('cuOverlay').classList.add('show');
  }
  function cuChapters() {
    var b = parseInt($('cuBook').value, 10);
    var sel = $('cuChapter'); sel.innerHTML = '';
    E.COUNTS[b][1].forEach(function (_, c) {
      var o = document.createElement('option'); o.value = c; o.textContent = 'Ch ' + (c + 1);
      sel.appendChild(o);
    });
  }
  // v13.1: the verse dropdown. It lands on the chapter's LAST verse, so the
  // dialog opened and confirmed without touching it behaves exactly as it
  // always has — a whole chapter. Stopping partway is now one tap away.
  function cuVerses() {
    var b = parseInt($('cuBook').value, 10), c = parseInt($('cuChapter').value, 10);
    var sel = $('cuVerse'); sel.innerHTML = '';
    var n = E.COUNTS[b][1][c];
    for (var v = 0; v < n; v++) {
      var o = document.createElement('option'); o.value = v; o.textContent = 'v ' + (v + 1);
      sel.appendChild(o);
    }
    sel.value = String(n - 1);
  }
  function cuUpdate() {
    var plan = E.getPlan(state, cuPlanId);
    var b = parseInt($('cuBook').value, 10), c = parseInt($('cuChapter').value, 10),
        v = parseInt($('cuVerse').value, 10);
    var pv = E.catchUpPreview(plan, b, c, v);
    var where = E.BOOKS[b] + ' ' + (c + 1) + ':' + (v + 1);
    $('cuPreview').textContent = pv.ok
      ? (pv.count === 0
        ? 'Everything up to there is already marked read. Nothing to do.'
        : pv.count.toLocaleString() + ' unread verse' + (pv.count === 1 ? '' : 's') +
          ' will be marked as read, through ' + where + '. Reading continues from the verse after.')
      : 'That verse is outside this plan.';
  }
  function cuConfirm() {
    var b = parseInt($('cuBook').value, 10), c = parseInt($('cuChapter').value, 10),
        v = parseInt($('cuVerse').value, 10);
    var n = E.catchUpApply(state, cuPlanId, b, c, v, $('cuToday').checked);
    save();
    $('cuOverlay').classList.remove('show');
    renderPlans(); renderBadges();
    if (n > 0) toastVerse('Marked ' + n.toLocaleString() + ' verses as read. The plan continues from the next verse.', 'Catch up');
  }

  // ---------- Gems of Light — v1.0.9 (v16.1 §1) ----------
  // ONE list, newest first, every kept verse together, each carrying ⚡ or ♥ or
  // both. Two lists would be tidier on paper and would make a man choose a
  // drawer before he could look — and §1.2 is exactly that sometimes he does
  // not yet know why the verse stopped him.
  var gemFilter = 'all';
  function renderFavs() {
    var list = $('favsList'); list.innerHTML = '';
    /* v1.1.0, finding 2 — ONE list, genuinely. v1.0.9 added every gem, then
       every favourite, then reversed the lot, which could only ever produce two
       stacked blocks: hearts above bolts, whatever their age. The ordering now
       lives in the engine, on the day each mark was made. */
    var rows = E.gemRows(state);
    var shown = rows.filter(function (r) {
      return gemFilter === 'all' || (gemFilter === 'gem' ? r.gem : r.fav);
    });
    if (!shown.length) {
      // A node, not markup: this screen must add nothing to the linter's list,
      // so the release baseline stays exactly where it has always been.
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = rows.length
        ? 'Nothing under that mark yet.'
        : 'Nothing kept yet. While reading, tap ⚡ for a verse that stopped you, or ♥ for one you want again.';
      list.appendChild(empty);
      return;
    }
    shown.forEach(function (r) {
      var f = r.ref;
      var row = document.createElement('div');
      row.className = 'fav-row';
      var t = verseText(f[0], f[1], f[2]);
      var marks = (r.gem ? '<span class="gem-mark">⚡</span>' : '') + (r.fav ? '<span class="fav-mark">♥</span>' : '');
      row.innerHTML = '<div><div class="ref">' + marks + E.refLabel(f[0], f[1], f[2]) + '</div>' +
        '<div class="txt">' + esc(t) + '</div></div><button title="Remove">✕</button>';
      row.querySelector('button').onclick = function (e) {
        e.stopPropagation();
        // Removing takes off whichever marks it carries — both, if it has both.
        if (r.fav) E.toggleFavorite(state, f[0], f[1], f[2]);
        if (r.gem) E.toggleGem(state, f[0], f[1], f[2]);
        save(); renderFavs();
      };
      row.onclick = function () {
        // read it in context: Book mode at that verse
        mode = 'book'; currentBook = f[0];
        state.positions[f[0]] = [f[1], f[2]];
        setPills(); $('bookSelect').value = f[0];
        switchScreen('read'); serveNext();
      };
      list.appendChild(row);
    });
  }

  // ---------- Settings ----------
  function renderSettings() {
    $('setSiteEnabled').checked = state.settings.siteEnabled;
    $('setShowNotes').checked = !!state.settings.showNotes;   // v13
    $('setSiteMins').value = state.settings.siteMins;
    $('setMomentMins').value = String(state.settings.momentMins);
    // v7: the plan option names the active plan live, so the choice is never a mystery.
    var planOpt = $('setMomentSource').querySelector('option[value="plan"]');
    var active = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    planOpt.textContent = active
      ? 'My reading plan (now: ' + active.name + ')'
      : 'My reading plan (none active — Psalms & Proverbs for now)';
    $('setMomentSource').value = state.settings.momentSource || 'plan';
    // v1.0.4: prayer timer + dry-out interval
    var s = state.settings;
    $('setPray').checked = !!s.pray;
    $('setPrayMins').value = String(s.praySecs || 300);
    $('setPrayStretch').value = String(s.prayStretchSecs || 300);
    $('setPrayChime').value = s.prayChime || 'single';
    // v1.1.0
    $('setAudio').checked = !!s.audio;
    $('setAudioStop').checked = s.audioStop === undefined ? true : !!s.audioStop;
    $('setAudioNums').checked = !!s.audioNums;
    $('setAudioWake').checked = s.audioWake === undefined ? true : !!s.audioWake;
    $('setAudioRate').value = String(s.audioRate === undefined ? 1 : s.audioRate);
    $('setPrayVol').value = String(s.prayVol === undefined ? 0.55 : s.prayVol);
    // v1.0.9, Decision 77 — the confession door stands only while a claim does.
    $('confessRow').style.display = state.gapClaim ? '' : 'none';
    $('setDryMins').value = String(s.dryMins === undefined ? 5 : s.dryMins);
    renderAboutLinks();
  }
  // v1.0.0 ships with support links hidden.
  // v1.0.2 switches on the suggestion box (design v14.1).
  // v1.0.8 switches on giving. Note the domain is paystack.SHOP, not .com —
  // that is what Paystack issued for this page; do not "correct" it.
  var LINKS = {
    donate:  'https://paystack.shop/pay/drawnigh',   // v1.0.8 — live. Trading name DRAWNIGH.
    suggest: 'https://forms.gle/pLpcUCw14qr3KBVj9',  // v1.0.2 — live.
    email:   ''
  };
  function renderAboutLinks() {
    var bits = [];
    if (LINKS.donate) bits.push('<a href="' + LINKS.donate + '" target="_blank" rel="noopener noreferrer" style="color:var(--gold-bright)">🤲 Support DrawNigh</a>');
    if (LINKS.email) bits.push('<a href="mailto:' + LINKS.email + '" style="color:var(--gold-bright)">✉ Contact</a>');
    $('aboutLinks').innerHTML = bits.join(' · ');
    // v1.0.8: the "this leaves DrawNigh" note rides with the giving link and
    // disappears with it. No donate link, no note.
    var dn = $('donateNote');
    if (dn) dn.style.display = LINKS.donate ? '' : 'none';
    // v1.0.2: the suggestion box has its own block below Backup & Restore, so it is
    // not repeated inline here. An empty LINKS.suggest keeps that whole block hidden.
    var fb = $('feedbackSetting');
    if (fb) {
      if (LINKS.suggest) {
        $('feedbackLink').href = LINKS.suggest;
        fb.style.display = '';
      } else {
        fb.style.display = 'none';
      }
    }
  }

  // ---------- Verse of the Day / Moment ----------
  function toastVerse(text, title, ref) {
    $('vodTitle').textContent = title || 'Verse of the Day';
    if (ref) {
      var t = verseText(ref[0], ref[1], ref[2]);
      $('vodText').innerHTML = '<span class="cap">' + esc(t.charAt(0)) + '</span>' + esc(t.slice(1));
      $('vodRef').textContent = E.refLabel(ref[0], ref[1], ref[2]);
    } else {
      $('vodText').textContent = text;
      $('vodRef').textContent = '';
    }
    $('vodOverlay').classList.add('show');
  }
  function greetVOD() {
    var shownKey = 'dn-vod-shown';
    var t = E.todayStr();
    try { if (sessionStorage.getItem(shownKey) === t) return; sessionStorage.setItem(shownKey, t); } catch (e) {}
    var ref = E.verseOfTheDay(state); save();
    toastVerse(null, 'Verse of the Day', ref);
  }
  function armMoment() {
    if (momentTimer) clearTimeout(momentTimer);
    var mins = state.settings.momentMins;
    if (!mins) return;
    momentTimer = setTimeout(function () {
      var ref = E.momentVerse(state);
      toastVerse(null, 'Verse of the Moment', ref);
      armMoment();
    }, mins * 60 * 1000);
  }

  // ---------- Wiring ----------
  // v10: the Catch me up chip lives beside the mode pills. It shows only when
  // mode is Plan AND there is an active plan AND that plan is not a Favorites
  // plan (Favorites has no catch-up). It re-decides at every point this
  // knowledge can change: mode switches, plan changes, restore-from-code.
  // v1.0.4: Catch me up moved into the ⋮ menu, so the chip is gone from the
  // reading screen and the item inside the menu is what shows or hides.
  function updateCatchChip() {
    var item = $('miCatchUp');
    if (!item) return;
    var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    var show = plan && plan.scopeType !== 'favorites';
    item.style.display = show ? '' : 'none';
    /* WEB BUILD — Quick access follows the same rule as the ⋮ item, governed
       here rather than separately, so the two can never disagree about whether
       there is a plan to catch up on. */
    var quick = $('setCatchUp');
    if (quick) quick.style.display = show ? '' : 'none';
  }

  function setPills() {
    document.querySelectorAll('.pill').forEach(function (p) {
      p.classList.toggle('on', p.dataset.mode === mode);
    });
    // v1.0.7: the jump row is back on the main screen — show it only in Book mode.
    $('bookPicker').classList.toggle('show', mode === 'book');
    updateCatchChip();
  }

  // ================= v1.1.0 =================

  // ---------- Seasons (v16.1 §3) ----------
  // A general feature, on purpose. A season drawn from The Secret Place would
  // have been a tell: a line on the main screen that could only have come from
  // one place. Any reader can set one, so a season on screen says nothing about
  // whether a room exists.
  function renderSeasonLine() {
    var el = $('seasonLine'), s = E.seasonCurrent(state);
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!s) { el.style.display = 'none'; return; }
    var lbl = document.createElement('span');
    lbl.className = 'season-lbl'; lbl.textContent = 'This season';
    var txt = document.createElement('span'); txt.textContent = s.text;
    el.appendChild(lbl); el.appendChild(txt);
    el.style.display = '';
  }
  function renderRemindLine() {
    var el = $('remindLine');
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!E.reminderDue(state)) { el.style.display = 'none'; return; }
    el.textContent = state.room.reminder.text || '';
    el.style.display = '';
    E.reminderShown(state); save();
  }
  function renderSeasonSheet() {
    var s = E.seasonCurrent(state);
    $('seasonBox').value = s ? s.text : '';
    $('seasonNote').textContent = s
      ? 'Standing since ' + longDate(s.from) + '.'
      : 'Nothing set. A season is optional, and an empty one costs nothing.';
    var wrap = $('seasonPast');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var past = ((state.seasons && state.seasons.past) || []).slice().reverse();
    if (!past.length) {
      var none = document.createElement('div');
      none.className = 'note'; none.textContent = 'None yet.';
      wrap.appendChild(none); return;
    }
    past.forEach(function (p) {
      var row = document.createElement('div'); row.className = 'room-entry';
      var when = document.createElement('div'); when.className = 'when';
      when.textContent = longDate(p.from) + ' — ' + (p.to ? longDate(p.to) : 'now');
      var body = document.createElement('div'); body.className = 'body';
      body.textContent = p.text;
      row.appendChild(when); row.appendChild(body); wrap.appendChild(row);
    });
  }
  function openSeasons() {
    renderSeasonSheet();
    $('seasonSheet').classList.add('show');
  }

  // ---------- Reading aloud (v18) ----------
  // The voice already in the phone. Nothing downloaded, nothing sent, offline
  // like everything else. A verse heard is a verse read — so the audio simply
  // drives the ordinary reading path, and the counting is the counting the app
  // has always done.
  var audioOn = false, audioWaiting = false, audioVoices = [], audioLastCh = null;
  function aSet(k, d) {
    var v = state.settings ? state.settings[k] : undefined;
    return v === undefined ? d : v;
  }
  function speechOK() { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; }
  function loadVoices() {
    if (!speechOK()) return;
    audioVoices = speechSynthesis.getVoices() || [];
    var sel = $('setAudioVoice');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var any = document.createElement('option');
    any.value = ''; any.textContent = 'Whatever this device offers';
    sel.appendChild(any);
    audioVoices.forEach(function (v, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = v.name;
      sel.appendChild(o);
    });
    // Where the device offers no choice, nothing is shown — no empty picker,
    // and no apology for something that was never DrawNigh's to give.
    $('voiceRow').style.display = audioVoices.length ? '' : 'none';
    var want = aSet('audioVoice', '');
    if (want !== '') sel.value = want;
  }
  /* The bar remembers what it was last told, so the refusal line can be added
     or removed without the caller having to say the whole sentence again. */
  var barText = '', barWaiting = false;
  function audioBar(text, waiting) {
    barText = text; barWaiting = waiting;
    paintAudioBar();
  }
  function paintAudioBar() {
    var t = barText;
    /* The hold clause is added HERE rather than baked into any one message,
       so it survives every state the bar passes through — reading, and the
       chapter pause especially. Caught in testing: the hold outlived the
       chapter stop correctly, but the bar stopped saying so the moment the
       chapter ended, which is the one place a man most needs to know the
       light is still his. Nothing is said to a man who pressed normally: he
       is not being refused anything.

       Decision 3, settled 13 Sep 2026 — when the browser will not hold the
       screen, say so rather than leave him tapping and wondering. */
    if (audioHold && (audioOn || barWaiting)) {
      t = t + (holdRefused
        ? ' This browser will not hold the screen.'
        : ' Screen held.');
    }
    $('audioState').textContent = t;
    $('btnAudioGo').style.display = barWaiting ? '' : 'none';
    $('audioBar').style.display = (audioOn || barWaiting) ? '' : 'none';
  }
  /* v1.1.1 — one utterance per part, spoken in turn. The gap between two
     utterances IS the pause: "Verse one." … "In the beginning God created…".
     Dickson's own correction — a bare number runs into the sentence behind it
     and is heard as part of it. */
  function speakParts(parts, onDone) {
    var rate = parseFloat(aSet('audioRate', 1)) || 1;
    var vi = aSet('audioVoice', '');
    var last = parts.length - 1;
    parts.forEach(function (text, i) {
      var u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      if (vi !== '' && audioVoices[vi]) u.voice = audioVoices[vi];
      u.onerror = function () { stopAudio('The device stopped speaking.'); };
      if (i === last) u.onend = onDone;
      try { speechSynthesis.speak(u); } catch (e) { stopAudio(''); }
    });
  }
  function speakNow(ref) {
    if (!speechOK() || !ref) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    var t = verseText(ref[0], ref[1], ref[2]);
    var parts = [];
    /* FINDING F5 — the chapter is named when the reading crosses into it.
       v18 §3 required this and it was never built: with the chapter stop turned
       off — the walking, cooking, driving case the whole feature exists for —
       there was no marker of any kind that a chapter had changed. The one man
       who cannot look at the screen was the one man with nothing to tell him.
       Never before the first chapter he chose himself, which he already knows. */
    if (audioLastCh && (audioLastCh[0] !== ref[0] || audioLastCh[1] !== ref[1])) {
      parts.push(E.BOOKS[ref[0]] + ', chapter ' + (ref[1] + 1) + '.');
    }
    audioLastCh = [ref[0], ref[1]];
    // D2 — "verse one", then a pause, then the verse. The app already speaks
    // the word for chapters, so a bare number was out of step with its own
    // voice. Off by default: the flow is what the voice adds.
    if (aSet('audioNums', false)) parts.push('Verse ' + (ref[2] + 1) + '.');
    // notes.json is never spoken. The margin notes were separated from
    // Scripture for exactly this reason — a stray word can be skipped on
    // screen and cannot be un-heard.
    parts.push(t);
    E.audioMark(state, ref);
    speakParts(parts, function () { if (audioOn) afterSpoken(ref); });
  }
  function afterSpoken(spokenRef) {
    serveNext();                                  // counts it, exactly like reading
    var next = shownRef();
    if (!next) { stopAudio('That is the end of it.'); return; }
    // Decision 107 — it reads a chapter, then stops and waits. A man cooking
    // can tap. A phone on a table cannot. Decision 108 turns it off in Settings,
    // and Settings says plainly what that means.
    var crossed = (next[0] !== spokenRef[0] || next[1] !== spokenRef[1]);
    if (crossed && aSet('audioStop', true)) {
      audioOn = false; audioWaiting = true;
      releaseScreen();
      audioBar('Chapter ended. ' + E.BOOKS[next[0]] + ' ' + (next[1] + 1) + ' is next.', true);
      return;
    }
    speakNow(next);
  }
  /* `fresh` false means we are carrying on from a chapter stop, so audioLastCh
     is deliberately left holding the OLD chapter and the crossing is announced.
     A fresh start from the verse announces nothing: he chose that chapter. */
  /* `hold` is only passed on a FRESH start, from the press itself. Carrying on
     from a chapter stop leaves it exactly as it was — that is the whole point:
     one long press covers the sitting, chapter stops and all. */
  function startAudio(fresh, hold) {
    if (!speechOK()) return;
    if (fresh !== false) {
      var r0 = shownRef(); audioLastCh = r0 ? [r0[0], r0[1]] : null;
      audioHold = !!hold; holdRefused = false;
    }
    audioOn = true; audioWaiting = false;
    $('btnListen').classList.add('on');
    $('btnListen').classList.toggle('holding', audioHold);
    audioBar('Reading aloud…', false);   // paintAudioBar adds the hold clause
    holdScreen();
    speakNow(shownRef());
  }
  function stopAudio(msg) {
    audioOn = false; audioWaiting = false; audioLastCh = null;
    // The hold is a sitting, not a setting. Stopping the reading ends it.
    audioHold = false; holdRefused = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    $('btnListen').classList.remove('on');
    $('btnListen').classList.remove('holding');
    $('audioBar').style.display = 'none';
    if (msg) $('verseFoot').textContent = msg;
    releaseScreen();
    E.audioMark(state, null);
    save();
  }
  function audioVisible() {
    var on = !!aSet('audio', false) && speechOK();
    $('btnListen').style.display = on ? '' : 'none';
    if (!on && (audioOn || audioWaiting)) stopAudio('');
    prayVisible();
  }

  // ---------- The square (v17) ----------
  var sqSet = null, sqAt = 0;
  function drawSquare(text) {
    var cv = $('squareCanvas'), ctx = cv.getContext('2d');
    var q = qrcode(0, 'Q');                       // Decision 101: error correction Q
    q.addData(text, 'Alphanumeric');
    q.make();
    /* A full square runs to about 170 modules a side. Drawn into 360px that is
       two pixels a module, which a phone camera struggles with — the format is
       fine and the picture was the problem. Rendered at 4 pixels a module and
       let CSS scale it down, so the square is crisp at whatever size the screen
       gives it. */
    var n = q.getModuleCount(), quiet = 4, px = 4;
    var size = (n + quiet * 2) * px;
    cv.width = size; cv.height = size;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (q.isDark(r, c)) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
      }
    }
  }
  function paintSquare() {
    if (!sqSet) return;
    drawSquare(sqSet.squares[sqAt]);
    $('squareCount').textContent = sqSet.total === 1
      ? 'One square. Point the other phone at it.'
      : 'Square ' + (sqAt + 1) + ' of ' + sqSet.total + '.';
    $('squarePrev').style.display = sqSet.total > 1 ? '' : 'none';
    $('squareNext').style.display = sqSet.total > 1 ? '' : 'none';
  }
  /* v1.1.4, Decision 155 — the same code, redrawn looser. The code itself is
     held so that changing the row never asks for the word a second time. */
  var sqCode = null, sqMode = 'fewest';
  var SQ_WORDS = {
    fewest: 'Densest squares, fewest scans. This is what DrawNigh has always drawn.',
    balanced: 'A middle setting — a little looser, a few more squares.',
    easiest: 'The loosest squares DrawNigh draws. Most squares to scan, and each one the kindest to a camera that is struggling.'
  };
  function rebuildSquares() {
    if (sqCode === null) return;
    sqSet = E.qrChunks(sqCode, sqMode); sqAt = 0;
    document.querySelectorAll('#squareModes .pill').forEach(function (p) {
      if (p.dataset.sqmode === sqMode) p.classList.add('on'); else p.classList.remove('on');
    });
    $('squareModeNote').textContent = SQ_WORDS[sqMode] +
      ' · ' + sqSet.total + (sqSet.total === 1 ? ' square' : ' squares');
    // Decision 103 — above three squares the app states the count and the
    // file is offered as the easier road. It does not hide the button, grey
    // it out, or decide for him.
    $('squareNote').textContent = sqSet.total > 3
      ? 'This is ' + sqSet.total + ' squares, so ' + sqSet.total + ' scans. Saving the file is the easier road — but if you have no way to move a file, this still works, and you can do all ' + sqSet.total + '.'
      : 'Any phone’s own camera reads this. It does not need DrawNigh to be installed there yet — read it, then paste the code into Restore.';
    paintSquare();
  }
  function openSquare() {
    backupCode(function (code) {
      sqCode = code; sqMode = 'fewest';
      $('squareWrap').classList.remove('full');
      rebuildSquares();
      $('squareSheet').classList.add('show');
    });
  }

  // ---------- Scanning one (Decisions 99 and 102) ----------
  var scanStream = null, scanTimer = null, scanBag = null;
  function scanTell() {
    if (!scanBag) { $('scanCount').textContent = 'Point this phone at the other one.'; return; }
    var miss = E.qrMissing(scanBag);
    $('scanCount').textContent = miss.length
      ? 'Got ' + (scanBag.total - miss.length) + ' of ' + scanBag.total + '. Still needed: ' + miss.join(', ') + '.'
      : 'All ' + scanBag.total + ' captured.';
  }
  function openScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    scanBag = null; scanTell();
    $('scanNote').textContent = '';
    $('scanSheet').classList.add('show');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (st) {
      scanStream = st;
      var v = $('scanVideo');
      v.srcObject = st; v.play();
      var cv = document.createElement('canvas');
      scanTimer = setInterval(function () {
        if (!v.videoWidth) return;
        cv.width = v.videoWidth; cv.height = v.videoHeight;
        var g = cv.getContext('2d');
        g.drawImage(v, 0, 0, cv.width, cv.height);
        var img = g.getImageData(0, 0, cv.width, cv.height);
        var found = null;
        try { found = jsQR(img.data, img.width, img.height); } catch (e) { return; }
        if (!found) return;
        var part = E.qrParse(found.data);
        if (!part) { $('scanNote').textContent = 'That square is not a DrawNigh code.'; return; }
        if (scanBag && scanBag.tag !== part.tag) {
          // A square from another code is refused by name, never merged in.
          $('scanNote').textContent = 'That square belongs to a different code. Start again with one set.';
          return;
        }
        scanBag = E.qrCollect(scanBag, part);
        scanTell();
        if (!E.qrMissing(scanBag).length) {
          var code = E.qrAssemble(scanBag);
          closeScan();
          $('backupBox').value = code || '';
          $('backupNote').textContent = code
            ? 'Code read from the square. Choose Merge or Replace.'
            : 'Those squares did not come back as a code.';
        }
      }, 300);
    }, function () {
      $('scanNote').textContent = 'This phone would not open the camera. The square still works — read it with the phone’s own camera app and paste the code below.';
    });
  }
  function closeScan() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    if (scanStream) { scanStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); scanStream = null; }
    $('scanVideo').srcObject = null;
    $('scanSheet').classList.remove('show');
  }
  // Decision 99 — the button exists only if the phone answers. A button that
  // cannot work does not stand on the screen.
  function scanVisible() {
    var ok = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof jsQR === 'function';
    $('btnScan').style.display = ok ? '' : 'none';
  }

  // ---------- The Secret Place (v0.4) ----------
  // The clock pauses every time, on every verse, including the door verse. The
  // count runs silently underneath, and nothing marks a tap. A door that
  // behaved differently would give itself away with one tap.
  var knockRef = null, roomOpen = false, pinFor = null;
  var makeStep = 0, makeDoor = null, makeKnock = null;
  // v1.1.2, Decision 127 — the room the making flow is building. It is not
  // committed to state.room until "I have it" is pressed at the reveal, so
  // the reveal is a confirmation and not a receipt; Back and Cancel before
  // then discard it cleanly.
  var pendingRoom = null;
  // v1.1.2, Decision 126 — null while making a brand-new room; 'door', 'knock'
  // or 'word' while changing one part of the room that already exists. The
  // same overlay and the same step markup serve both, entered at the one step
  // that matters and completed by mutating state.room rather than creating a
  // new one.
  var editMode = null;
  /* v1.1.3, F18 — the new door verse, held while a fresh word is set for it.
     A word taken from the door verse cannot survive that door moving: the
     chip that stands for it is gone, and the box that holds it is masked, so
     the owner has nothing left to type. The door and the word therefore move
     together in one act, or neither moves. Nothing is written to state.room
     until both are in hand. */
  var editDoorPending = null;
  /* v1.1.1 — A GAP IS RUNNING TIME, RESUME TO PAUSE. Finding F9.
     v1.1.0 pushed Date.now() on every pause and took the differences, so every
     gap silently included however long the reader sat paused before pressing
     resume. A gap was hesitation PLUS run-time delivered as one number, with no
     way to see how it split — hesitate half a second longer and the clock must
     run half a second shorter to compensate, which nobody can do. It also made
     the making and the door measure different things, since only the door has a
     resume press inside every gap.
     Now: knockSince is the moment the clock last STARTED RUNNING, and a gap is
     closed by a pause. One measurement, in both places. */
  var KNOCK_STALE = 15;     // seconds; a gap this long is not part of a knock
  /* v1.1.2, Decision 123 — Dickson's own arithmetic. Every gap is 1-9 seconds,
     so at the loosest tolerance (+/-3) anything past 12 has already failed.
     15 sits clear of every legitimate tap while catching abandonment twice as
     fast as the 30 this replaces. */
  var knockRun = [];        // completed gaps, in running seconds
  var knockSince = null;    // ms when the clock last began running, null while paused
  var knockMarked = false;  // the marker pause has been seen (start === 'pause')
  var knockSettleAt = null; // timer id for the settle

  function knockClearSettle() {
    if (knockSettleAt) { clearTimeout(knockSettleAt); knockSettleAt = null; }
  }
  function knockReset() {
    knockClearSettle();
    knockRun = []; knockSince = null; knockMarked = false; knockRef = null;
  }
  function knockSameVerse(ref) {
    return !!(knockRef && ref && knockRef[0] === ref[0] && knockRef[1] === ref[1] && knockRef[2] === ref[2]);
  }
  function knockStartMode() {
    var r = state.room;
    return (r && r.knock && r.knock.start === 'pause') ? 'pause' : 'prayer';
  }
  // The clock has begun running: a prayer started, or a held one carried on.
  function knockOnRun(ref) {
    if (!ref) return;
    if (!knockSameVerse(ref)) { knockReset(); knockRef = ref.slice(); }
    knockSince = Date.now();
    knockArmSettle();
  }
  // The clock has stopped: a gap is closed. Nothing is marked, on any verse.
  function knockOnPause() {
    var ref = shownRef();
    knockClearSettle();
    if (!ref || !knockSameVerse(ref) || knockSince == null) {
      knockReset();
      if (ref) knockRef = ref.slice();
      knockSince = null;
      return;
    }
    var gap = (Date.now() - knockSince) / 1000;
    knockSince = null;
    /* A gap this long is a man doing something else, not knocking. The attempt
       starts again — which is also the only way back for a man who has
       miscounted, and it costs a guesser half a minute for every fresh run at
       it. The shipped code had the same idea at ninety seconds, when gaps were
       wall-clock; gaps are at most nine seconds now, so fifteen is plenty. */
    if (gap > KNOCK_STALE) { knockRun = []; knockMarked = false; return; }
    /* Decision 117 — where the first gap starts counting is the owner's choice,
       and a stranger does not know which he is facing. With 'pause', the first
       pause is only a marker saying NOW and the counting begins on the resume
       after it — which is what lets a man ten minutes into a prayer still go to
       his room without stopping and starting again. */
    if (knockStartMode() === 'pause' && !knockMarked) { knockMarked = true; return; }
    /* NO SLIDING WINDOW. A first cut kept the last few gaps and dropped the
       rest, which quietly turned the knock into a window a persistent tapper
       could sweep through — he would keep tapping until the right sequence
       happened to be the trailing one, which is the free shot Decision 116
       exists to close. Caught by the steady-tapper test, not by reading.
       Once the count runs past the longest knock allowed it can never equal
       any of them again, so the attempt is simply dead until it resets. */
    if (knockRun.length <= E.KNOCK_MAX) knockRun.push(gap);
  }
  /* Decision 116 — THE SETTLE. The knock ends on a RESUME. Five unbroken
     seconds of running clock open the word panel, and the door opens while the
     man is praying. A stranger working through rhythms is pausing constantly,
     so he never leaves it running that long: he passes straight through the
     moment he was right and never learns he was.
     A PARTIAL knock can never match — knockMatches compares the whole sequence
     or nothing — so a five-second silence inside a six- or seven-second gap
     passes harmlessly and the reader carries on. The two rules do not collide. */
  function knockArmSettle() {
    knockClearSettle();
    if (!state.room || state.room.sealed || !state.room.knock) return;
    var armedAt = knockSince, armedRef = knockRef;
    knockSettleAt = setTimeout(function () {
      knockSettleAt = null;
      if (knockSince == null || knockSince !== armedAt) return;   // paused or re-armed since
      if (!E.prayRunning(state)) return;                          // the clock must be running
      if (!knockSameVerse(armedRef)) return;
      var ref = shownRef();
      if (ref && E.roomKnockOk(state, ref, knockRun)) {
        knockReset();
        askPin('room');
      }
    }, E.KNOCK_SETTLE * 1000);
  }
  /* ---------- v1.1.1: the word panel (Decisions 118, 119) ----------
     Decision 119a — A WRONG WORD COSTS A WAIT THAT GROWS: 5s, 15s, a minute,
     then five. The word may be one tapped out of the door verse, and by the
     time this panel is open that verse is on the screen — about twenty-five
     candidates in plain sight. Hiding which shape the owner used does not stop
     a guesser trying them; it only stops him concluding anything when they
     fail. THE WAIT IS WHAT DOES THE WORK, and it turns twenty-five guesses
     from a minute of tapping into hours of holding a phone.
     It is kept in state so that closing the app does not wipe it. It is not
     exported: exportCode names the fields it carries, one by one. */
  var pinWaitTick = null;
  function pinWrongCount() { return (state.roomTry && state.roomTry.n) || 0; }
  function pinWaitLeftMs() {
    var t = state.roomTry && state.roomTry.until;
    return t ? Math.max(0, t - Date.now()) : 0;
  }
  function paintPinWait() {
    var left = pinWaitLeftMs();
    $('pinGo').disabled = left > 0;
    if (left > 0) {
      $('pinNote').textContent = 'Wait ' + Math.ceil(left / 1000) + 's.';
    } else if (pinWaitTick) {
      clearInterval(pinWaitTick); pinWaitTick = null;
      $('pinNote').textContent = '';
    }
  }
  function armPinWait() {
    if (pinWaitTick) { clearInterval(pinWaitTick); pinWaitTick = null; }
    if (pinWaitLeftMs() > 0) pinWaitTick = setInterval(paintPinWait, 250);
    paintPinWait();
  }
  function askPin(why) {
    pinFor = why;
    $('pinBox').value = '';
    resetReveal('pinBox', 'pinShow');
    /* v1.1.4 — the panel says what the word is being asked FOR at the two places
       where that is not obvious. At the door it says nothing, as it always has:
       a panel that explained itself would be telling a stranger what he had
       reached. (The old 'unseal' test never fired — the caller passes
       "unseal:NAME" — and it is gone with Decision 168, which ends the second
       ask at an unsealing altogether.) */
    $('pinNote').textContent =
      why === 'sealed' ? 'Your word opens what you have put away. Sealed categories and sealed letters are both behind it.'
      : why === 'delEntry' ? 'Your word, once more. Deleting is the one act here that cannot be undone.'
      : '';
    $('pinTitle').textContent = 'Your word';
    var r = state.room;
    // The same box and the same chips for everyone who gets chips at all,
    // whatever shape was chosen — Decision 119. Decision 128 adds a second,
    // independent choice: whether the panel shows any word list. A bare box
    // never proves the word was typed, because it might belong to any of the
    // three shapes with chips simply turned off.
    var chips = $('pinWords');
    if (r && !r.sealed && r.door && r.showWords !== false) {
      fillWordChips(chips, r.door, function (w) { $('pinBox').value = w; });
      chips.style.display = '';
    } else {
      while (chips.firstChild) chips.removeChild(chips.firstChild);
      chips.style.display = 'none';
    }
    /* Decision 118a — the owner's own hint, after two wrong words. Nobody
       reaches this panel without the verse and the knock, and nobody sees the
       hint without also having failed at the word. It unlocks nothing, so §7
       stands: this is not recovery, it is his own cue handed back to him. */
    var hint = r && !r.sealed && r.hint;
    if (hint && pinWrongCount() >= 2) {
      $('pinHint').textContent = 'Your hint: ' + hint;
      $('pinHint').style.display = '';
    } else {
      $('pinHint').textContent = ''; $('pinHint').style.display = 'none';
    }
    $('pinOverlay').classList.add('show');
    armPinWait();
    setTimeout(function () { try { $('pinBox').focus(); } catch (e) {} }, 60);
  }
  function pinWrong() {
    var n = pinWrongCount() + 1;
    state.roomTry = { n: n, until: Date.now() + E.tryWaitMs(n) };
    save();
    var r = state.room;
    if (r && !r.sealed && r.hint && n >= 2) {
      $('pinHint').textContent = 'Your hint: ' + r.hint;
      $('pinHint').style.display = '';
    }
    $('pinNote').textContent = 'That is not the word.';
    armPinWait();
  }
  function pinRight() {
    if (state.roomTry) { state.roomTry = null; save(); }
    if (pinWaitTick) { clearInterval(pinWaitTick); pinWaitTick = null; }
    $('pinGo').disabled = false;
  }
  function pinEntered(pin) {
    if (pinWaitLeftMs() > 0) return;      // the wait is the lock's own patience
    var r = state.room;
    /* v1.1.4, Decision 161 — F42, second guard. 'open' is the WORD-ALONE door
       offered in Settings after a restore, and it was one-off by design and not
       in the build: the button stayed on screen for the rest of the session and
       still worked, falling through to the pinCheck branch and opening the room
       on the word with no verse and no knock. A word alone can now only ever
       open a room that is still genuinely sealed. Once it is unsealed on this
       device the path refuses, whatever calls it — so if some future screen ever
       reaches for that door by mistake it cannot quietly reopen the hole, and
       nobody would have to notice it had. */
    if (pinFor === 'open') {
      if (!r || !r.sealed) {
        $('pinOverlay').classList.remove('show');
        roomStatusLine();
        return;
      }
      E.unsealRoom(r.sealed, pin).then(function (opened) {
        /* v1.1.4, Decision 159 — F40, the worst of the twelve. unsealRoom hands
           back pinCheck null and nothing ever wrote a new one, so a restored
           room opened once could never be opened again: the door had nothing
           left to test a word against and the panel closed in silence. At this
           instant the app is holding the correct word — it has just decrypted
           the room with it — so it seals a fresh check-scrap and asks nothing.
           The door mends itself quietly; Decision 157's screen is what speaks. */
        E.sealCheck(opened, pin).then(function (blob) {
          opened.pinCheck = blob;
          finishRestore(opened, true);
        }, function () {
          // No crypto at all is the only way here. The room still opens, but the
          // door cannot be mended silently, so the new door is not optional.
          finishRestore(opened, false);
        });
      }, pinWrong);
      return;
    }
    if (pinFor === 'room') {
      if (!r || !r.pinCheck) { $('pinOverlay').classList.remove('show'); return; }
      E.unsealRoom(r.pinCheck, pin).then(function () {
        pinRight();
        $('pinOverlay').classList.remove('show');
        openRoom();
      }, pinWrong);
      return;
    }
    /* v1.1.4, Decision 171 — the word stands at the door of the Sealed list,
       once, and Decision 168 is what follows from that: lifting a category or a
       letter back out from inside asks nothing further. §10's second word is
       not lost, it has moved one step earlier — and it now covers letters as
       well as categories. Decision 173 keeps a second ask where it matters. */
    if (pinFor === 'sealed' || pinFor === 'delEntry' || (pinFor && pinFor.indexOf('unseal:') === 0)) {
      if (!r || !r.pinCheck) { $('pinOverlay').classList.remove('show'); return; }
      var was = pinFor;
      E.unsealRoom(r.pinCheck, pin).then(function () {
        pinRight();
        $('pinOverlay').classList.remove('show');
        if (was === 'sealed') { sealedUnlocked = true; renderRoomAdmin(); return; }
        if (was === 'delEntry') { doDeleteSealedEntry(); return; }
        E.roomSealCat(state.room, was.slice(7), false); save();
        renderRoomList();
      }, pinWrong);
    }
  }
  /* v1.1.4, Decisions 157 + 159 + 161. One moment, not three: the lock is
     repaired, the screen repaints so the stale "A room arrived with a restored
     code…" line and the open-it-once button both go at once, and the man is
     told plainly that the ordinary door is back. */
  var restoreMustChange = false;
  function finishRestore(opened, mended) {
    state.room = opened; pinRight(); save();
    $('pinOverlay').classList.remove('show');
    roomStatusLine();
    restoreMustChange = !mended;
    $('restoredKeep').style.display = mended ? '' : 'none';
    $('restoredOverlay').classList.add('show');
  }

  /* v1.1.4, Decision 144 — the room's questions are asked by the room. A
     browser confirm() is visibly the browser's: in the extension it is headed
     with the add-on's name, and on the web build it would carry the web
     address instead. The same reasoning that took prompt() out of a man's
     writing in Decision 134. One box, reused, so every question in the room
     looks like the room. */
  var askCb = null;
  function roomAsk(title, text, okLabel, cb) {
    askCb = cb;
    $('askTitle').textContent = title;
    $('askText').textContent = text;
    $('askGo').textContent = okLabel || 'Yes';
    $('askOverlay').classList.add('show');
  }
  function askClose() { $('askOverlay').classList.remove('show'); askCb = null; }
  /* v1.1.4, Decision 151 — one reveal, wired the same way on every word box.
     Dots by default; the tap is the owner's own choice, which is what keeps it
     safe in a public place. */
  function wireReveal(inputId, btnId, alsoId) {
    var box = $(inputId), btn = $(btnId), also = alsoId ? $(alsoId) : null;
    if (!box || !btn) return;
    btn.onclick = function () {
      var showing = box.type === 'text';
      box.type = showing ? 'password' : 'text';
      // Where a word is typed twice, one control covers the pair: a man checking
      // his own word is usually checking whether the two agree.
      if (also) also.type = box.type;
      btn.textContent = showing ? 'Show' : 'Hide';
      try { box.focus(); } catch (e) {}
    };
  }
  function resetReveal(inputId, btnId, alsoId) {
    var box = $(inputId), btn = $(btnId), also = alsoId ? $(alsoId) : null;
    if (box) box.type = 'password';
    if (also) also.type = 'password';
    if (btn) btn.textContent = 'Show';
  }
  // v1.1.4, Decision 171 — the word opens the Sealed list for this visit only.
  // Closing the room closes it again; nothing is remembered across a visit.
  var sealedUnlocked = false;
  function roomShow(which) {
    // v1.1.2 — 'roomFile' no longer exists as its own screen (Decision 132:
    // filing now happens on the writing page itself, plus the fileOverlay).
    ['roomWrite', 'roomList', 'roomThread', 'roomAdmin'].forEach(function (id) {
      $(id).style.display = (id === which) ? '' : 'none';
    });
    /* v1.1.3, Decisions 135 + 143 — one Back, in the head, beside Close. The
       screens used to carry their own, stacked under a Close that looked like
       the way out of the screen rather than the way out of the room.

       v1.1.4, Decision 145 — Back only where there is something behind it. The
       writing page is the room's main panel and the list sits beside it, not
       behind it: each already has its own way across ("Just reading today" and
       "Write something"). So Back belongs to the two screens you reach FROM the
       list, and nowhere else. An arrow that does nothing is worse than none. */
    $('roomHeadBack').style.display = (which === 'roomThread' || which === 'roomAdmin') ? '' : 'none';
  }
  function renderRoomSeason() {
    var el = $('roomSeason'), s = E.seasonCurrent(state);
    while (el.firstChild) el.removeChild(el.firstChild);
    // v1.1.2, F14 — a category a reader names himself and this header could
    // say the same bare word with nothing to tell them apart (Dickson named a
    // category SEASONS and then asked why the room still said "No season
    // set"). This label is fixed chrome a typed category can never carry, so
    // the header always reads as the app's own furniture.
    var label = document.createElement('span'); label.className = 'season-label'; label.textContent = 'This season';
    el.appendChild(label);
    var span = document.createElement('span');
    if (s) { span.className = 'season-value'; span.textContent = s.text; } else { span.className = 'none'; span.textContent = 'No season set.'; }
    el.appendChild(span);
  }
  // §4.6 — badges in the room, in the ⋮ menu, or both. Decided from inside,
  // and obeyed outside.
  function applyBadgeChoice() {
    var where = (state.room && !state.room.sealed && state.room.badgeChoice) || 'menu';
    if (!state.room || state.room.sealed) where = 'menu';
    $('miBadges').style.display = (where === 'room') ? 'none' : '';
    $('roomBadges').style.display = (where === 'room' || where === 'both') ? '' : 'none';
  }
  function openRoom() {
    roomOpen = true;
    // v1.1.4, Decision 171 — every visit asks for the word at the Sealed door.
    sealedUnlocked = false;
    applyBadgeChoice();
    renderRoomSeason();
    $('roomBox').value = '';
    $('mkCatPicker').style.display = 'none';   // v1.1.3 — opens closed, every time
    // Write first, file after. Nothing is asked of him at the door — and the
    // page can be walked past, because a man may come only to read.
    $('roomWriteNote').textContent = 'Nothing here is counted, scored or seen. You can also just read what is here.';
    roomShow('roomWrite');
    $('roomSheet').classList.add('show');
  }
  function closeRoom() {
    roomOpen = false; sealedUnlocked = false;
    $('roomSheet').classList.remove('show');
  }

  var fileTarget = null;
  /* v1.1.3, Decision 141 — F28. Struggle and Testimony stop being labels a man
     can only see once he has already opened the letter, and become lists he
     can walk into, exactly as a category he named himself.

     The reasoning, recorded because the finding was raised as a question and
     not a fault: the filing prompt offers Struggle, Testimony and "Put it
     under" side by side, as three ways of filing the same letter. If two of
     them only tag it while the third makes a real list, one screen behaves
     three different ways depending on which word is tapped. And a man reading
     his own faithfulness back to himself wants all of it at once — every
     testimony together is the whole point of writing them down.

     The two keys are NUL-prefixed so no category a man could ever type can
     collide with them. */
  var LIST_STRUGGLES = '\u0000struggles', LIST_TESTIMONIES = '\u0000testimonies';
  function isBuiltInList(key) { return key === LIST_STRUGGLES || key === LIST_TESTIMONIES; }
  /* One filter, used by both the list and the thread, so the count on the row
     and the letters behind it can never disagree. A letter marked Struggle
     leaves Dated Letters the same way a named category takes it out — that is
     what "the same as a named category" means. It can stand in more than one
     list at once, which named categories already allow. */
  /* v1.1.4, Decision 167 — a sealed letter leaves completely. Filtered here, at
     the one place both the list and the thread read from, so no screen can ever
     disagree about it. In Dickson's words: "GONE COMPLETELY… BUT WITHIN THE
     LETTERS, NOTHING REMINDS YOU OF ANY SEALED LETTER." No row holding its
     place, no count at the foot of the category, no gap. A middle was put to
     him — the letter gone with a small line reading "2 sealed letters here" —
     and refused: a count is a reminder, and the point of sealing is to stop
     being reminded. The only place it exists is the Sealed list, behind the
     word, in the room's own Settings. */
  function roomEntriesFor(key) {
    var all = ((state.room && state.room.entries) || []).filter(function (e) { return !e.sealed; });
    if (key === LIST_STRUGGLES) return all.filter(function (e) { return !!e.struggle; });
    if (key === LIST_TESTIMONIES) return all.filter(function (e) { return !!e.testimony; });
    if (key) return all.filter(function (e) { return (e.cats || []).indexOf(key) >= 0; });
    return all.filter(function (e) {
      return !(e.cats || []).length && !e.struggle && !e.testimony;
    });
  }
  // Whether a category holds anything a man has sealed by hand. Used only to
  // decide whether an emptied category row would itself be the reminder
  // Decision 167 forbids — never to show a count.
  function catHoldsSealed(key) {
    if (!key || isBuiltInList(key)) return false;
    return ((state.room && state.room.entries) || []).some(function (e) {
      return e.sealed && (e.cats || []).indexOf(key) >= 0;
    });
  }
  function renderRoomList() {
    renderRoomSeason();
    var wrap = $('roomCats');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var cats = E.roomCats(state.room);
    /* v1.1.4, Decision 167 — a category emptied by sealing does not stand there
       empty. A row he knows held letters, now saying "Nothing under this yet",
       is exactly the reminder the decision forbids. A category that never held
       anything still shows, as it always has: that is a folder he made, not a
       trace of something put away. It comes back the moment a letter in it is
       lifted out of the seal. */
    var open = cats.filter(function (c) {
      if (c.sealed) return false;
      if (roomEntriesFor(c.name).length) return true;
      return !catHoldsSealed(c.name);
    });
    if (!open.length && !roomEntriesFor('').length &&
        !roomEntriesFor(LIST_STRUGGLES).length && !roomEntriesFor(LIST_TESTIMONIES).length) {
      var none = document.createElement('div');
      none.className = 'note'; none.textContent = 'Nothing written yet.';
      wrap.appendChild(none);
    }
    // Categories, then threads, then the entry. Never testimony first — a man
    // knows what he came to read; he was there when he wrote it.
    open.forEach(function (c) { wrap.appendChild(catRow(c.name, c.name)); });
    // v1.1.2, Decision 136 — "Dated Letters", not "Unfiled". Nothing here is
    // incomplete; it is simply letters shown by date.
    if (roomEntriesFor('').length) wrap.appendChild(catRow('Dated Letters', ''));
    if (roomEntriesFor(LIST_STRUGGLES).length) wrap.appendChild(catRow('Struggles', LIST_STRUGGLES));
    if (roomEntriesFor(LIST_TESTIMONIES).length) wrap.appendChild(catRow('Testimonies', LIST_TESTIMONIES));
    roomShow('roomList');
  }
  function catRow(label, key) {
    var row = document.createElement('div'); row.className = 'room-cat';
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = label;
    row.appendChild(nm);
    // Sealed, never deleted. Put away, not thrown away — nothing a man wrote is
    // destroyed by a tap on a bad day (§10). Decision 138: only a category he
    // named himself is sealed whole. Dated Letters cannot be, and v1.1.3 holds
    // Struggles and Testimonies to the same rule — they are the room's own
    // lists, not folders he built.
    if (key && !isBuiltInList(key)) {
      /* v1.1.4, Decisions 174–177 — renaming, raised in v1.1.2 and carried
         undesigned until Decision 160 ruled it in. It is the same folder with a
         new name on it: every letter follows, nothing is left behind, and the
         old name vanishes rather than sitting underneath in small grey text. */
      var ren = document.createElement('button'); ren.className = 'small-btn';
      ren.textContent = 'Rename';
      ren.onclick = function (e) { e.stopPropagation(); openRename(row, key); };
      row.appendChild(ren);
      var seal = document.createElement('button'); seal.className = 'small-btn';
      seal.textContent = 'Seal';
      seal.onclick = function (e) {
        e.stopPropagation();
        // v1.1.4, Decision 144 — the room's own box, not the browser's.
        roomAsk('Seal “' + key + '”?',
          'It goes out of sight, not out of existence. Everything in it stays exactly as you wrote it, and nothing in it can be deleted for three months. You will find it under Sealed, in this room’s Settings.',
          'Seal it',
          function () { E.roomSealCat(state.room, key, true); save(); renderRoomList(); });
      };
      row.appendChild(seal);
    }
    // v1.1.4, Decision 147 — F32. Open holds the last column on every row.
    // Seal is the rare button and takes the inner place; it used to push Open
    // into the middle on sealable rows and leave it at the end everywhere else.
    var go = document.createElement('button'); go.className = 'small-btn'; go.textContent = 'Open';
    go.onclick = function (e) { e.stopPropagation(); openThread(key); };
    row.appendChild(go);
    row.onclick = function () { openThread(key); };
    return row;
  }
  /* v1.1.4, Decisions 174–177 — renaming happens on the row, in the room's own
     look, the same way Decision 134 put editing on the letter. */
  function openRename(row, key) {
    while (row.firstChild) row.removeChild(row.firstChild);
    row.className = 'room-cat renaming';
    // The row's own tap opened the thread. While it is a rename it opens nothing.
    row.onclick = null;
    var lead = document.createElement('div'); lead.className = 'note';
    lead.textContent = 'A new name for this. Every letter filed under it follows, and the old name is not kept anywhere.';
    row.appendChild(lead);
    var box = document.createElement('input');
    box.type = 'text'; box.className = 'edit-title'; box.value = key;
    row.appendChild(box);
    var warn = document.createElement('div'); warn.className = 'note'; row.appendChild(warn);
    var acts = document.createElement('div'); acts.className = 'edit-acts';
    var ok = document.createElement('button'); ok.className = 'small-btn'; ok.textContent = 'Rename it';
    var no = document.createElement('button'); no.className = 'small-btn'; no.textContent = 'Leave it as it was';
    acts.appendChild(ok); acts.appendChild(no); row.appendChild(acts);
    no.onclick = function (e) { e.stopPropagation(); renderRoomList(); };
    ok.onclick = function (e) {
      e.stopPropagation();
      var res = E.roomRenameCat(state.room, key, box.value);
      if (!res.ok) {
        // Decision 177 — said plainly, and a sealed category is counted without
        // being named, opened or revealed.
        warn.textContent =
          res.why === 'empty' ? 'A category needs a name.'
          : res.why === 'same' ? 'That is the name it already has.'
          : res.why === 'sealed' ? 'This is sealed. Lift it out of the seal first, and it can be renamed in the room.'
          : 'You already have a category called “' + res.taken + '”. Capital letters do not make it a different name. Choose another.';
        return;
      }
      save(); renderRoomList();
    };
    box.onkeydown = function (e) { if (e.key === 'Enter') ok.onclick(e); };
    setTimeout(function () { try { box.focus(); box.select(); } catch (err) {} }, 60);
  }
  // v1.1.3 — which list the thread screen is showing, so an edit finished on
  // the page returns to the list it was opened from and not to another.
  var currentThread = '';
  function openThread(cat) {
    currentThread = cat || '';
    var wrap = $('roomEntries');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var list = roomEntriesFor(cat).slice().reverse();   // newest first
    list.forEach(function (e) { wrap.appendChild(entryRow(e)); });
    if (!list.length) {
      var none = document.createElement('div'); none.className = 'note';
      none.textContent = 'Nothing under this yet.'; wrap.appendChild(none);
    }
    roomShow('roomThread');
  }
  /* v1.1.2, Decision 132 item 3 — "one of his own named categories offered
     right there". A box he has to retype from memory is not an offer, and a
     typo in it makes a second category rather than finding the first. Built
     as nodes, never markup. */
  function fillCatList() {
    var dl = document.getElementById('catList');
    if (!dl) return;
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    if (!state.room || state.room.sealed) return;
    E.roomCats(state.room).forEach(function (c) {
      var o = document.createElement('option'); o.value = c.name; dl.appendChild(o);
    });
  }
  /* v1.1.3, Decision 140 — the full list, on a button beside the box.
     Type-ahead is only an offer to a man who remembers how the name begins.
     Sealed categories are left out: they were put away on purpose, and
     offering one back here would be the room deciding he had changed his
     mind. */
  function toggleCatPicker(pickerId, inputId) {
    var wrap = $(pickerId), input = $(inputId);
    if (!wrap || !input) return;
    if (wrap.style.display !== 'none') { wrap.style.display = 'none'; return; }
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var cats = (state.room && !state.room.sealed)
      ? E.roomCats(state.room).filter(function (c) { return !c.sealed; })
      : [];
    if (!cats.length) {
      var none = document.createElement('div'); none.className = 'none';
      none.textContent = 'No categories yet. Type a name and this becomes the first.';
      wrap.appendChild(none);
    }
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = c.name;
      b.onclick = function () { input.value = c.name; wrap.style.display = 'none'; };
      wrap.appendChild(b);
    });
    wrap.style.display = '';
  }
  // v1.1.2, Decision 132 — top-level (not nested in wire()) because
  // entryRow's own "Filed as..." button needs to call this too.
  /* v1.1.4, Decision 146 — in 'auto' mode the thing being filed is a DRAFT that
     has not been written yet, so Back returns to the writing and nothing is
     saved. In 'manual' mode the letter really does exist (it was reached from
     its own "Filed as…" button), so Back must simply close and change nothing. */
  var fileDraft = null;
  function openFileOverlay(entry, mode) {
    fileTarget = (mode === 'auto') ? null : entry;
    fillCatList();
    $('foStruggle').checked = !!entry.struggle;
    $('foTestimony').checked = !!entry.testimony;
    $('foCat').value = (entry.cats && entry.cats[0]) || '';
    $('foDontAsk').checked = false;
    $('foCatPicker').style.display = 'none';   // v1.1.3 — opens closed, every time
    $('foTitle').textContent = mode === 'auto' ? 'Filed as a letter.' : 'Filing';
    $('foNote').textContent = mode === 'auto'
      ? 'Nothing was ticked, so this would be filed as a plain letter — nothing more. If you want it under Struggle, Testimony, or a category, choose it now. Nothing is written until you press Done.'
      : 'Change how this is filed. It can always be changed again later.';
    $('foDontAskRow').style.display = mode === 'auto' ? '' : 'none';
    $('foBack').textContent = mode === 'auto' ? '‹ Back to the writing' : '‹ Back';
    $('fileOverlay').classList.add('show');
  }
  function entryRow(e, sealedView) {
    var row = document.createElement('div'); row.className = 'room-entry';
    /* v1.1.3, Decision 133 — F21/F22. The heading is whatever names the letter.
       A title, when there is one, stands centred with its date small beneath
       it; with no title the date itself takes that place, rather than sitting
       above the writing as a caption a man's eye slides straight past. §4.5
       is kept either way — the date is always there, and always his. */
    var head = document.createElement('div'); head.className = 'head';
    head.textContent = e.title ? e.title : longDate(e.date);
    row.appendChild(head);
    if (e.title) {
      var sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = longDate(e.date);
      row.appendChild(sub);
    }
    var body = document.createElement('div'); body.className = 'body'; body.textContent = e.body;
    row.appendChild(body);
    var marks = [];
    if (e.letter) marks.push('Letter');
    if (e.struggle) marks.push(e.endAt ? 'Struggle — ended ' + longDate(e.endAt) : 'Struggle — open');
    if (e.testimony) marks.push('Testimony');
    if (e.other) marks.push('Other');
    if (marks.length) {
      var m = document.createElement('div'); m.className = 'marks'; m.textContent = marks.join(' · ');
      row.appendChild(m);
    }
    if (e.endNote) {
      var en = document.createElement('div'); en.className = 'body';
      en.textContent = '— ' + e.endNote; row.appendChild(en);
    }
    /* v1.1.3, Decision 134 — an edit is not a silent overwrite. What he wrote
       on the day stands as the letter; that it was touched later is said
       quietly underneath, with the moment it happened. */
    if (e.editedAt) {
      var edm = document.createElement('div'); edm.className = 'edited';
      edm.textContent = 'edited ' + stampWhen(e.editedAt);
      row.appendChild(edm);
    }
    // A struggle is ended with a note, and the note is the testimony. Both stay
    // editable: a struggle changes shape over months, and an answer often looks
    // like one thing in September and something larger the following year.
    /* v1.1.4, Decision 170 — inside the Sealed list a letter is READ, not
       changed. Put away means put away, and the writing should not change while
       the three months are counting on it. So the sealed view carries none of
       the three ordinary actions; renderSealedLetters gives it its own. */
    if (sealedView) return row;
    if (e.struggle && !e.endAt) {
      var end = document.createElement('button'); end.className = 'small-btn';
      end.textContent = 'It ended'; row.appendChild(end);
      /* v1.1.3, Decision 134 — ending a struggle is writing, so it happens on
         the page in the room's own hand, not in a box the browser drew. The
         old prompt() lost every line break the moment it opened. */
      end.onclick = function (ev) {
        ev.stopPropagation();
        openEntryEditor(row, e, 'end');
      };
    }
    /* v1.1.4, Decision 166 — three actions in one row, in the same place on
       every letter: Edit, Filed as…, and Seal. Nothing hidden behind a dot menu
       and nothing moving about. Seal stays confirm-only with no word asked,
       unchanged from Decision 138's session-two confirmation — the word's job is
       guarding what has already been put away, not putting it away. */
    var acts = document.createElement('div'); acts.className = 'entry-acts';
    row.appendChild(acts);
    var ed = document.createElement('button'); ed.className = 'small-btn'; ed.textContent = 'Edit';
    acts.appendChild(ed);
    ed.onclick = function (ev) {
      ev.stopPropagation();
      openEntryEditor(row, e, 'edit');
    };
    // v1.1.2, Decision 132 item 5 — filing can always be changed afterward.
    var rf = document.createElement('button'); rf.className = 'small-btn'; rf.textContent = 'Filed as…';
    acts.appendChild(rf);
    rf.onclick = function (ev) { ev.stopPropagation(); openFileOverlay(e, 'manual'); };
    var sl = document.createElement('button'); sl.className = 'small-btn'; sl.textContent = 'Seal';
    acts.appendChild(sl);
    sl.onclick = function (ev) {
      ev.stopPropagation();
      roomAsk('Seal this letter?',
        'It leaves this list completely — nothing here will show that it was ever filed under it. You will find it under Sealed, in this room’s Settings, behind your word. Nothing in it can be deleted for three months.',
        'Seal it',
        function () {
          E.roomSealEntry(state.room, e.id, true); save();
          openThread(currentThread);
        });
    };
    return row;
  }
  // v1.1.3 — the moment an edit happened, to the minute. A date alone would
  // not tell two edits on the same afternoon apart.
  function stampWhen(ms) {
    try {
      return new Date(ms).toLocaleString(undefined, {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
    } catch (err) { return ''; }
  }
  /* v1.1.3, Decision 134 — F19/F20. Editing happens ON the letter, in the
     room's own look, and never in a browser dialog.

     Two things were wrong with prompt(). It is visibly the browser's, not the
     room's — it even offers to stop the page making more of them, which on a
     page holding a man's letters to God reads as a fault. And it is a single
     line: an entry written as two paragraphs came back as one run-on
     sentence, because the newline never survived the box. A textarea keeps
     what he wrote exactly as he wrote it. */
  function openEntryEditor(row, e, mode) {
    while (row.firstChild) row.removeChild(row.firstChild);
    row.className = 'room-entry editing';
    var isEnd = (mode === 'end');
    var lead = document.createElement('div'); lead.className = 'note';
    lead.textContent = isEnd
      ? 'What ended it? This is the testimony, in your words.'
      : 'Your letter, as you wrote it. A title is optional — with none, the date is the heading.';
    row.appendChild(lead);
    var tIn = null;
    if (!isEnd) {
      tIn = document.createElement('input');
      tIn.type = 'text'; tIn.className = 'edit-title';
      tIn.placeholder = 'A title, if one has come';
      tIn.value = e.title || '';
      row.appendChild(tIn);
    }
    var bIn = document.createElement('textarea');
    bIn.className = 'edit-body'; bIn.rows = isEnd ? 4 : 8;
    bIn.value = isEnd ? (e.endNote || '') : (e.body || '');
    row.appendChild(bIn);
    /* The testimony question, asked on the page rather than in a confirm(),
       and still only a mark he makes himself — the app never decides that an
       answered struggle is a testimony. */
    var tickWrap = null, tick = null;
    if (isEnd) {
      tickWrap = document.createElement('label'); tickWrap.className = 'edit-tick';
      tick = document.createElement('input'); tick.type = 'checkbox';
      tick.checked = !!e.endIsTestimony;
      var tx = document.createElement('span');
      tx.textContent = 'Let this stand among my testimonies. It appears as you wrote it, carrying a small mark that it closed a struggle. Left unticked, it stays an end-note, found only here.';
      tickWrap.appendChild(tick); tickWrap.appendChild(tx);
      row.appendChild(tickWrap);
    }
    var acts = document.createElement('div'); acts.className = 'edit-acts';
    var ok = document.createElement('button'); ok.className = 'small-btn';
    ok.textContent = isEnd ? 'That is how it ended' : 'Keep the change';
    var no = document.createElement('button'); no.className = 'small-btn';
    no.textContent = 'Leave it as it was';
    acts.appendChild(ok); acts.appendChild(no);
    row.appendChild(acts);
    function backToList() { openThread(currentThread); }
    no.onclick = function (ev) { ev.stopPropagation(); backToList(); };
    ok.onclick = function (ev) {
      ev.stopPropagation();
      if (isEnd) {
        e.endNote = bIn.value;
        e.endAt = E.todayStr();
        e.endIsTestimony = !!tick.checked;
        if (e.endIsTestimony) e.testimony = true;
      } else {
        var newTitle = String(tIn.value || ''), newBody = String(bIn.value || '');
        // Only an actual change is stamped. Opening the editor and closing it
        // again untouched is not an edit, and should not say it was one.
        if (newTitle !== (e.title || '') || newBody !== (e.body || '')) {
          e.title = newTitle; e.body = newBody;
          e.editedAt = Date.now();
        }
      }
      save(); backToList();
    };
    setTimeout(function () { try { (isEnd ? bIn : (tIn || bIn)).focus(); } catch (err) {} }, 60);
  }
  function renderRoomAdmin() {
    $('roomSeasonBox').value = (E.seasonCurrent(state) || {}).text || '';
    var r = state.room.reminder || { on: false, text: '' };
    $('remOn').checked = !!r.on;
    $('remText').value = r.text || '';
    $('roomBadgeChoice').value = state.room.badgeChoice || 'room';
    /* v1.1.4, Decision 171 — ONE sealed door, in two parts, behind the word.
       Sealed categories were already here; sealed letters join them, because a
       sealed letter has nowhere else to exist (Decision 167). The word is asked
       once, at the door of the list, and from inside nothing asks again —
       Decision 168. §10's second word is not lost; it has moved one step
       earlier, and it now covers letters as well as categories. */
    $('roomSealedGate').style.display = sealedUnlocked ? 'none' : '';
    $('roomSealedBody').style.display = sealedUnlocked ? '' : 'none';
    if (sealedUnlocked) { renderSealedCats(); renderSealedLetters(); }
    roomShow('roomAdmin');
  }
  function renderSealedCats() {
    var wrap = $('roomSealed');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var sealed = E.roomCats(state.room).filter(function (c) { return c.sealed; });
    if (!sealed.length) {
      var none = document.createElement('div'); none.className = 'note';
      none.textContent = 'No categories sealed.'; wrap.appendChild(none);
      return;
    }
    sealed.forEach(function (c) {
      var row = document.createElement('div'); row.className = 'room-entry';
      var nm = document.createElement('div'); nm.className = 'title'; nm.textContent = c.name;
      row.appendChild(nm);
      var when = E.catDeletableAt(c);
      var can = E.catCanDelete(c);
      var note = document.createElement('div'); note.className = 'when';
      // The room states the exact moment, to the second. A man can argue with a
      // fuzzy delay; there is nothing to argue with in a timestamp.
      note.textContent = can
        ? 'Deletable now.'
        : 'Deletable from ' + when.toLocaleString() + '.';
      row.appendChild(note);
      var acts = document.createElement('div'); acts.className = 'entry-acts';
      row.appendChild(acts);
      var un = document.createElement('button'); un.className = 'small-btn';
      un.textContent = 'Lift it out of the seal'; acts.appendChild(un);
      /* v1.1.4, Decision 168 — no second ask. The word opened this list; asking
         again seconds later guards nothing. Decision 169 is why the letters
         inside are untouched: each seal stands on its own, so a letter he sealed
         by hand stays sealed with its own clock still running. */
      un.onclick = function () {
        E.roomSealCat(state.room, c.name, false); save();
        renderSealedCats(); renderSealedLetters();
      };
      if (can) {
        var del = document.createElement('button'); del.className = 'small-btn';
        del.textContent = 'Delete for good'; acts.appendChild(del);
        del.onclick = function () {
          roomAsk('Delete “' + c.name + '” for good?',
            'This removes the category and every letter filed under it. Three months have passed and it is yours to do. There is no recovery and nobody can undo it for you.',
            'Delete it',
            function () {
              state.room.entries = (state.room.entries || []).filter(function (e) {
                return (e.cats || []).indexOf(c.name) < 0;
              });
              state.room.cats = (state.room.cats || []).filter(function (x) { return x.name !== c.name; });
              save(); renderSealedCats(); renderSealedLetters();
            });
        };
      }
      wrap.appendChild(row);
    });
  }
  /* v1.1.4, Decision 172 — what a row shows before it is opened: the letter's
     date, its title if it has one, and the category it was sealed out of. He has
     to be able to find the one he means without opening five, and the row reads
     like the letter's own heading — which is what he saw when he wrote it.
     The category is read off the letter itself rather than stored, so a rename
     (Decision 174) carries here too and no stale name is ever kept. */
  function entryHome(e) {
    if ((e.cats || []).length) return e.cats.join(' · ');
    if (e.struggle && e.testimony) return 'Struggles · Testimonies';
    if (e.struggle) return 'Struggles';
    if (e.testimony) return 'Testimonies';
    return 'Dated Letters';
  }
  var sealedOpenId = null;
  function renderSealedLetters() {
    var wrap = $('roomSealedLetters');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    var list = E.roomSealedEntries(state.room).slice().reverse();   // newest first
    if (!list.length) {
      var none = document.createElement('div'); none.className = 'note';
      none.textContent = 'No letters sealed.'; wrap.appendChild(none);
      return;
    }
    list.forEach(function (e) {
      if (sealedOpenId === e.id) { wrap.appendChild(sealedLetterOpen(e)); return; }
      var row = document.createElement('div'); row.className = 'room-entry';
      var head = document.createElement('div'); head.className = 'head';
      head.textContent = e.title ? e.title : longDate(e.date);
      row.appendChild(head);
      var sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = (e.title ? longDate(e.date) + ' · ' : '') + entryHome(e);
      row.appendChild(sub);
      var when = E.entryDeletableAt(e), can = E.entryCanDelete(e);
      var note = document.createElement('div'); note.className = 'when';
      note.textContent = can ? 'Deletable now.' : 'Deletable from ' + when.toLocaleString() + '.';
      row.appendChild(note);
      var acts = document.createElement('div'); acts.className = 'entry-acts';
      row.appendChild(acts);
      var rd = document.createElement('button'); rd.className = 'small-btn';
      rd.textContent = 'Read it'; acts.appendChild(rd);
      rd.onclick = function () { sealedOpenId = e.id; renderSealedLetters(); };
      var un = document.createElement('button'); un.className = 'small-btn';
      un.textContent = 'Lift it out of the seal'; acts.appendChild(un);
      un.onclick = function () {
        E.roomSealEntry(state.room, e.id, false); save();
        sealedOpenId = null; renderSealedLetters(); renderSealedCats();
      };
      wrap.appendChild(row);
    });
  }
  /* v1.1.4, Decisions 170 and 173. The letter is read where it lies and edited
     nowhere but its own place among the others. And deletion is not on the row:
     he opens the letter, reads what he is about to destroy, and the word is
     asked at the foot of it. The three months cool the heat; this puts the
     writing itself in front of him at the moment it goes. */
  var pendingDelete = null;
  function sealedLetterOpen(e) {
    var row = entryRow(e, true);
    var home = document.createElement('div'); home.className = 'when';
    home.textContent = 'Sealed out of ' + entryHome(e) + '.';
    row.appendChild(home);
    var can = E.entryCanDelete(e), when = E.entryDeletableAt(e);
    var clock = document.createElement('div'); clock.className = 'when';
    clock.textContent = can
      ? 'Three months have passed. This can be deleted.'
      : 'Deletable from ' + when.toLocaleString() + '.';
    row.appendChild(clock);
    var note = document.createElement('div'); note.className = 'note';
    note.textContent = 'Read here, and lifted out before it can be edited. Nothing in the seal is changed while its three months are counting.';
    row.appendChild(note);
    var acts = document.createElement('div'); acts.className = 'entry-acts';
    row.appendChild(acts);
    var back = document.createElement('button'); back.className = 'small-btn';
    back.textContent = '‹ Back'; acts.appendChild(back);
    back.onclick = function () { sealedOpenId = null; renderSealedLetters(); };
    var un = document.createElement('button'); un.className = 'small-btn';
    un.textContent = 'Lift it out of the seal'; acts.appendChild(un);
    un.onclick = function () {
      E.roomSealEntry(state.room, e.id, false); save();
      sealedOpenId = null; renderSealedLetters(); renderSealedCats();
    };
    if (can) {
      var del = document.createElement('button'); del.className = 'small-btn';
      del.textContent = 'Delete for good'; acts.appendChild(del);
      del.onclick = function () {
        pendingDelete = e.id;
        askPin('delEntry');
      };
    }
    return row;
  }
  function doDeleteSealedEntry() {
    if (!pendingDelete) return;
    var id = pendingDelete; pendingDelete = null;
    E.roomDeleteEntry(state.room, id); save();
    sealedOpenId = null;
    renderSealedLetters(); renderSealedCats();
  }
  // v1.1.2, F11 — the version currently in the manifest, shown in both
  // About & Support and Settings, so a hand-tester running several builds in
  // a row can always say which one he is on.
  /* WEB BUILD, settled 13 Sep 2026. A website has no manifest to ask, so this
     returned nothing and the version line stayed blank — the exact confusion
     F11 existed to end. The number matches the add-on it was built from; the
     word "Web" is what tells the two apart, because they are not identical:
     this build carries the long-press screen hold and the add-on does not. */
  var WEB_VERSION = 'Web 1.1.4';
  function extVersion() { return WEB_VERSION; }
  function paintVersion() {
    var v = extVersion();
    if (!v) return;
    /* No "Version" prefix on the web build — the string already carries the
       word that tells it apart from the add-on. */
    $('aboutVersion').textContent = v;
    $('settingsVersion').textContent = v;
  }
  function roomStatusLine() {
    var el = $('roomStatus');
    if (!state.room) { el.textContent = ''; $('btnRoomMake').style.display = ''; $('btnRoomOpenSealed').style.display = 'none'; return; }
    if (state.room.sealed) {
      el.textContent = 'A room arrived with a restored code. It is sealed, and this device does not know where its door is until it is opened once.';
      $('btnRoomMake').style.display = 'none';
      $('btnRoomOpenSealed').style.display = '';
      return;
    }
    el.textContent = 'A room stands. Go to your verse and knock.';
    $('btnRoomMake').style.display = 'none';
    $('btnRoomOpenSealed').style.display = 'none';
  }
  function fillMakePickers() {
    var b = $('mkBook');
    if (b.options.length) return;
    E.BOOKS.forEach(function (n, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = n; b.appendChild(o);
    });
    function chaps() {
      var bi = parseInt(b.value, 10) || 0, c = $('mkChap');
      while (c.firstChild) c.removeChild(c.firstChild);
      E.COUNTS[bi][1].forEach(function (_, i) {
        var o = document.createElement('option'); o.value = i; o.textContent = String(i + 1); c.appendChild(o);
      });
      verses();
    }
    function verses() {
      var bi = parseInt(b.value, 10) || 0, ci = parseInt($('mkChap').value, 10) || 0, v = $('mkVerse');
      while (v.firstChild) v.removeChild(v.firstChild);
      for (var i = 0; i < E.COUNTS[bi][1][ci]; i++) {
        var o = document.createElement('option'); o.value = i; o.textContent = String(i + 1); v.appendChild(o);
      }
    }
    b.onchange = chaps; $('mkChap').onchange = verses;
    chaps();
  }
  /* ---------- v1.1.1: the words of a verse, as chips ----------
     Punctuation is stripped and duplicates dropped, so what is offered is what
     a man would call "a word in that verse". Built as nodes, never markup. */
  function verseWords(ref) {
    if (!ref) return [];
    var raw = String(verseText(ref[0], ref[1], ref[2]) || '').split(/\s+/);
    var seen = {}, out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i].replace(/[^A-Za-z'-]/g, '');
      if (!w) continue;
      var k = w.toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1; out.push(w);
    }
    return out;
  }
  function fillWordChips(el, ref, onPick) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var words = verseWords(ref);
    words.forEach(function (w) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = w;
      b.onclick = function () { onPick(w); };
      el.appendChild(b);
    });
    return words.length;
  }
  // "4567" -> [4,5,6,7]. Anything that is not a digit 1–9 is simply not a knock.
  function knockDigits(str) {
    var out = [], s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      var n = s.charCodeAt(i) - 48;
      if (n < 1 || n > 9) return null;
      out.push(n);
    }
    return out.length ? out : null;
  }
  /* The app states what a choice costs and leaves the choice alone. It does not
     refuse a knock a steady tapper could walk through — it says so. */
  function knockWarnText(knock) {
    var codes = E.knockCheck(knock), out = [];
    if (codes.indexOf('short') >= 0) out.push('Three digits at least — two is close to something a man could stumble into.');
    if (codes.indexOf('long') >= 0) out.push('Six digits at most. Seven was what shut the last room, and nobody remembers seven.');
    if (codes.indexOf('spread') >= 0) {
      out.push('Your digits sit too close together for that tolerance: a man tapping steadily every ' +
        Math.round((Math.min.apply(null, knock.gaps) + Math.max.apply(null, knock.gaps)) / 2) +
        ' seconds would match all of them without knowing anything. Spread them further apart, or allow yourself less.');
    }
    return out.join(' ');
  }
  function knockFits(knock) {
    var need = E.knockSeconds(knock), have = praySetting('praySecs', 300);
    return { need: need, have: have, ok: need <= have };
  }

  var padRunning = false, padSince = 0, padGaps = [], padTick = null;
  function padStop() { if (padTick) { clearInterval(padTick); padTick = null; } padRunning = false; }
  function padReset() {
    padStop(); padGaps = [];
    $('knockPad').classList.remove('armed');
    $('knockPad').textContent = 'Tap to practise — the seconds run here';
    $('mkKnockNote').textContent = '';
  }
  function padPaint() {
    var live = padRunning ? ((Date.now() - padSince) / 1000) : 0;
    $('knockPad').textContent = padRunning
      ? live.toFixed(1) + 's — tap to pause'
      : (padGaps.length ? 'paused — tap to carry on' : 'Tap to practise — the seconds run here');
  }
  /* v1.1.2 — these four were declared inside wire(). openEdit (Decision 126)
     is a top-level function and calls paintKnockWarn/paintWordShape to preset
     the step it opens at, which threw ReferenceError: a function declared in
     wire() is invisible to one declared beside it. They live out here now;
     wire() can still see them to hang its handlers on. */
  // v1.1.2, F17 — Settings states the prayer length in the same words it
  // shows on its own screen ("5 minutes", not "300"). Every value here
  // comes from that one select, so the same handful of labels always apply.
  function fmtPraySecs(s) {
    s = s | 0;
    if (s >= 60 && s % 60 === 0) { var m = s / 60; return m + (m === 1 ? ' minute' : ' minutes'); }
    return s + (s === 1 ? ' second' : ' seconds');
  }
  function paintKnockWarn() {
    var g = knockDigits($('mkKnockNum').value);
    if (!g) { $('mkKnockWarn').textContent = ''; $('mkKnockWarn2').textContent = ''; return; }
    var k = { gaps: g, tol: parseInt($('mkKnockTol').value, 10), start: $('mkKnockStart').value };
    var msg = knockWarnText(k), fit = knockFits(k);
    // The knock is made by pausing a RUNNING clock, so all of it — the settle
    // included — has to fit inside the prayer. A door that makes a man stretch
    // the timer before he can reach it is friction at best, and the room says
    // so here rather than letting him find out at the door.
    // v1.1.2, F17 — the second figure now carries its unit too.
    var fitMsg = 'Your knock takes ' + E.knockSeconds(k) + ' seconds of praying, the five-second wait included. Your prayer is set to ' + fmtPraySecs(fit.have) + '.';
    if (!fit.ok) fitMsg += ' That is not long enough — lengthen the prayer in Settings, or use smaller digits.';
    // v1.1.2 — the spread/length warning and the fit-line warning were one
    // dense paragraph. Two separate lines now, in their own notes.
    $('mkKnockWarn').textContent = msg;
    $('mkKnockWarn2').textContent = fitMsg;
  }

  /* Decision 119 — three shapes for the word. The shape steers the making and
     nothing else: the panel at the door offers the same box and the same chips
     to everyone, because a panel that asked differently would announce which
     of the three a stranger was facing. */
  function paintWordShape() {
    var shape = $('mkWordShape').value, chips = $('mkWordChips');
    if (shape === 'door') {
      var n = fillWordChips(chips, makeDoor, function (w) { $('mkPin').value = w; $('mkPin2').value = w; });
      chips.style.display = '';
      // Decision 119b — "Jesus wept" offers two candidates. A verse too short
      // to hide a word in is not a lock, and the room says so at the making.
      $('mkWordNote').textContent = n < 8
        ? 'That verse holds only ' + n + ' words, and every one of them is on the screen when the panel opens. It is too short to hide a word in — choose another shape, or another door.'
        : 'Tap the word you will remember. Nothing new to learn: you already know this verse.';
    } else {
      chips.style.display = 'none';
      $('mkWordNote').textContent = shape === 'kjv'
        ? 'Type a word from a verse only you would think of. Nothing on the screen will narrow it down for anyone.'
        : 'Type anything. This is the only shape that can be covered from someone watching over your shoulder.';
    }
  }
  /* v1.1.4, Decision 152 — a typed word that is not in the door verse is quietly
     let through as an ordinary typed word.

     The shape matters for exactly one thing: F18's rule that a door-shaped word
     cannot outlive its door moving, so moving the door carries straight on to a
     new word. If a man chose "a word from my door verse" and then typed
     something that is not in that verse, the shape is simply wrong — and making
     him set a new word every time he moves his door would be a price paid for a
     label, not for a lock.

     NOTHING IS REFUSED AND NOTHING IS ANNOUNCED. The only change the owner ever
     feels is that moving his door stops forcing a new word for a word that never
     came from the verse. */
  function settleWordShape(shape, word, door) {
    if (shape !== 'door') return shape;
    var ref = door || makeDoor || (state.room && state.room.door);
    if (!ref) return 'typed';
    var want = E.normPin ? E.normPin(word) : String(word || '').trim().toLowerCase();
    var words = verseWords(ref).map(function (w) { return String(w).trim().toLowerCase(); });
    return words.indexOf(want) >= 0 ? 'door' : 'typed';
  }
  // v1.1.2, Decision 128 — the vault's warning is said once, plainly, when
  // the choice is made, not discovered later at a locked door.
  function paintVaultNote() {
    $('mkVaultNote').style.display = ($('mkShowWords').value === 'no') ? '' : 'none';
  }
  function openMake() {
    editMode = null; pendingRoom = null;
    makeStep = 1; makeDoor = null; makeKnock = null;
    fillMakePickers();
    $('makeStep1').style.display = ''; $('makeStep2').style.display = 'none';
    $('makeStep3').style.display = 'none'; $('makeStep4').style.display = 'none';
    $('makeStep5').style.display = 'none';
    $('makeCancel').style.display = ''; $('makeBack').style.display = 'none';
    $('makeStartAgain').style.display = 'none';
    $('makeNext').textContent = 'Next';
    $('makeNext').disabled = false;
    $('makeNote').textContent = '';
    // v1.1.4, Decisions 164 + 165 — both belong to the making, and both start clean.
    $('mkWroteRow').style.display = 'none'; $('mkWrote').checked = false;
    $('mkWroteNote').textContent = '';
    $('mkRemText').value = '';
    resetReveal('mkPin', 'mkPinShow', 'mkPin2');
    $('mkKnockNum').value = ''; $('mkKnockWarn').textContent = ''; $('mkKnockWarn2').textContent = '';
    $('mkKnockStart').value = 'prayer'; $('mkKnockTol').value = '1';
    $('mkWordShape').value = 'door'; $('mkWordNote').textContent = '';
    $('mkWordChips').style.display = 'none';
    $('mkShowWords').value = 'yes'; $('mkVaultNote').style.display = 'none';
    $('mkPin').value = ''; $('mkPin2').value = ''; $('mkHint').value = '';
    padReset();
    $('makeOverlay').classList.add('show');
  }
  /* v1.1.2, Decision 126 — F15. Reuses the making overlay for one field of an
     existing room. Enters directly at the relevant step, preset with the
     room's current value, and completes by mutating state.room rather than
     creating a new one (see the editMode branch in makeNext's handler). */
  function openEdit(which) {
    editMode = which; pendingRoom = null; editDoorPending = null;
    fillMakePickers();
    $('makeStep1').style.display = 'none'; $('makeStep2').style.display = 'none';
    $('makeStep3').style.display = 'none'; $('makeStep4').style.display = 'none';
    $('makeStep5').style.display = 'none';
    $('makeCancel').style.display = ''; $('makeBack').style.display = 'none';
    $('makeStartAgain').style.display = 'none';
    $('makeNote').textContent = '';
    $('makeNext').disabled = false;
    $('mkWroteRow').style.display = 'none'; $('mkWrote').checked = false;
    $('mkWroteNote').textContent = '';
    resetReveal('mkPin', 'mkPinShow', 'mkPin2');
    var r = state.room;
    /* v1.1.4, Decision 158 — all three in one pass, reusing the making flow
       exactly. It walks verse → knock → word and writes nothing until the word
       is sealed, so Cancel or Back at any point leaves the room as it stands. */
    if (which === 'all') {
      makeStep = 1;
      makeDoor = null; makeKnock = null;
      $('mkBook').value = r.door[0]; $('mkBook').dispatchEvent(new Event('change'));
      $('mkChap').value = r.door[1]; $('mkChap').dispatchEvent(new Event('change'));
      $('mkVerse').value = r.door[2];
      $('mkKnockNum').value = r.knock.gaps.join('');
      $('mkKnockTol').value = String(r.knock.tol);
      $('mkKnockStart').value = r.knock.start === 'pause' ? 'pause' : 'prayer';
      $('mkWordShape').value = r.wordShape || 'typed';
      $('mkShowWords').value = (r.showWords === false) ? 'no' : 'yes';
      $('mkHint').value = r.hint || '';
      $('mkPin').value = ''; $('mkPin2').value = '';
      $('mkKnockWarn').textContent = ''; $('mkKnockWarn2').textContent = '';
      padReset();
      $('makeStep1').style.display = '';
      $('makeNote').textContent = 'All three, in one pass: the verse, then the knock, then the word. Nothing changes until the word at the end is set — cancel or go back at any point and the room stands exactly as it does now. Your letters are unaffected either way.';
      $('makeNext').textContent = 'Next — the knock';
      $('makeOverlay').classList.add('show');
      return;
    }
    if (which === 'door') {
      makeStep = 1;
      $('mkBook').value = r.door[0]; $('mkBook').dispatchEvent(new Event('change'));
      $('mkChap').value = r.door[1]; $('mkChap').dispatchEvent(new Event('change'));
      $('mkVerse').value = r.door[2];
      $('makeStep1').style.display = '';
      // v1.1.3, F18 — said before he moves anything, not after he is stranded.
      if ((r.wordShape || 'typed') === 'door') {
        $('makeNote').textContent = 'Your word came from this verse. Move the door and that word can never be offered to you again, so you will set a new word on the next screen — the two move together, or neither does. Your letters are unaffected either way.';
        $('makeNext').textContent = 'Next — then your new word';
      } else {
        $('makeNext').textContent = 'Save the new verse';
      }
    } else if (which === 'knock') {
      makeStep = 2;
      $('mkKnockNum').value = r.knock.gaps.join('');
      $('mkKnockTol').value = String(r.knock.tol);
      $('mkKnockStart').value = r.knock.start === 'pause' ? 'pause' : 'prayer';
      padReset();
      paintKnockWarn();
      $('makeStep2').style.display = '';
      $('makeNext').textContent = 'Save the new knock';
    } else if (which === 'word') {
      makeStep = 3;
      makeDoor = r.door; makeKnock = r.knock;
      $('mkWordShape').value = r.wordShape || 'typed';
      $('mkShowWords').value = (r.showWords === false) ? 'no' : 'yes';
      $('mkHint').value = r.hint || '';
      $('mkPin').value = ''; $('mkPin2').value = '';
      paintWordShape();
      $('makeStep3').style.display = '';
      $('makeNext').textContent = 'Save the new word';
    }
    $('makeOverlay').classList.add('show');
  }

  function backupCode(cb) {
    // The room travels with the code, sealed with the PIN. A man with no room
    // carries no dead weight — the code is exactly the code.
    var body = E.exportCode(state);
    if (!state.room || state.room.sealed) return cb(state.room && state.room.sealed ? body + '~' + state.room.sealed : body);
    askPinFor(function (pin) {
      if (!pin) return cb(body);
      E.sealRoom(state.room, pin).then(function (blob) { cb(body + '~' + blob); },
                                       function () { cb(body); });
    });
  }
  /* v1.1.4, Decision 150 — F33 and F39. This used to be a browser prompt() that
     took whatever was typed and handed it straight to sealRoom, comparing it
     against nothing. Two costs, and the second is the one that mattered:

       F33 — a mistyped word sealed the room under the typo, silently, and the
             file downloaded with no warning. Reproduced by hand on 8 September.
       F39 — Backup & Restore sits in ORDINARY Settings, outside the room. No
             verse, no knock, no word is needed to reach it. So a stranger
             holding the unlocked phone could press "Copy my backup code", type
             any word he liked, and walk away with every letter, the door verse
             and the knock, sealed under a word HE chose — then restore it on his
             own machine and open it with his own word. He never needed the
             owner's. The three locks guarded the screen; this door handed the
             contents to whoever asked.

     So: DrawNigh's own box (never the browser's), dots by default with a tap to
     reveal (Decision 151), and THE WORD CHECKED AGAINST THE ROOM before
     anything is sealed. Anything but the room's own word is refused, exactly as
     at the door — and the same growing wait applies, because this is now a
     second place a word can be guessed at. */
  var bkCb = null, bkWaitTick = null;
  function paintBkWait() {
    var left = pinWaitLeftMs();
    $('bkGo').disabled = left > 0;
    if (left > 0) {
      $('bkNote').textContent = 'Wait ' + Math.ceil(left / 1000) + 's.';
    } else if (bkWaitTick) {
      clearInterval(bkWaitTick); bkWaitTick = null;
      $('bkNote').textContent = '';
    }
  }
  function armBkWait() {
    if (bkWaitTick) { clearInterval(bkWaitTick); bkWaitTick = null; }
    if (pinWaitLeftMs() > 0) bkWaitTick = setInterval(paintBkWait, 250);
    paintBkWait();
  }
  function askPinFor(cb) {
    bkCb = cb;
    $('bkPin').value = '';
    resetReveal('bkPin', 'bkPinShow');
    $('bkNote').textContent = '';
    armBkWait();
    $('bkOverlay').classList.add('show');
    setTimeout(function () { try { $('bkPin').focus(); } catch (e) {} }, 60);
  }
  function bkClose() {
    if (bkWaitTick) { clearInterval(bkWaitTick); bkWaitTick = null; }
    bkCb = null;
    $('bkOverlay').classList.remove('show');
  }
  function bkSubmit() {
    if (pinWaitLeftMs() > 0) return;
    var pin = $('bkPin').value;
    if (!pin) { $('bkNote').textContent = 'A word is needed to seal the room into the code.'; return; }
    var r = state.room;
    if (!r || !r.pinCheck) {
      // There is nothing on this device to test a word against. Rather than seal
      // under an unchecked word — which is the whole of F39 — the room stays out
      // of the code and the reason is said plainly.
      $('bkNote').textContent = 'This device cannot check your word yet. Open the room once first, and the code will carry it.';
      return;
    }
    $('bkNote').textContent = 'Checking…';
    E.unsealRoom(r.pinCheck, pin).then(function () {
      if (state.roomTry) { state.roomTry = null; save(); }
      var cb = bkCb;
      bkClose();
      if (cb) cb(pin);
    }, function () {
      var n = pinWrongCount() + 1;
      state.roomTry = { n: n, until: Date.now() + E.tryWaitMs(n) };
      save();
      $('bkNote').textContent = 'That is not the word. Nothing has been sealed.';
      armBkWait();
    });
  }

  function wire() {
    document.querySelectorAll('nav button').forEach(function (b) {
      b.onclick = function () { switchScreen(b.dataset.screen); };
    });
    document.querySelectorAll('.pill').forEach(function (p) {
      p.onclick = function () { mode = p.dataset.mode; setPills(); view = null; randTrail = []; randPos = -1; current = null; serveNext(); };
    });
    var bs = $('bookSelect');
    E.BOOKS.forEach(function (n, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = n; bs.appendChild(o);
    });
    // v8: choosing a book resumes at its bookmark (same as the Books screen);
    // choosing a chapter jumps to its verse 1; choosing a verse jumps straight there.
    bs.onchange = function () { currentBook = parseInt(bs.value, 10); view = null; current = null; serveNext(); };
    // v1.0.4: Catch me up now opens from inside the ⋮ menu.
    $('miCatchUp').onclick = function () {
      closeMenu();
      if (state.activePlanId) openCatchUp(state.activePlanId);
    };
    $('chapSelect').onchange = function (e) {
      jumpTo(currentBook, parseInt(e.target.value, 10), 0);
    };
    $('verseSelect').onchange = function (e) {
      jumpTo(currentBook, parseInt($('chapSelect').value, 10), parseInt(e.target.value, 10));
    };

    $('btnNext').onclick = serveNext;
    $('verseStage').onclick = serveNext;
    $('btnPrev').onclick = goPrev;
    $('btnFav').onclick = function () {
      if (!current) return;
      var r = current.ref;
      var on = E.toggleFavorite(state, r[0], r[1], r[2]);
      $('btnFav').classList.toggle('on', on);
      save(); maybeMarkHint();
    };
    // v1.0.9 — ⚡ a verse that arrested him. Independent of ♥: starred in March
    // and struck in July loses neither event.
    $('btnGem').onclick = function () {
      if (!current) return;
      var r = current.ref;
      var on = E.toggleGem(state, r[0], r[1], r[2]);
      $('btnGem').classList.toggle('on', on);
      save(); maybeMarkHint();
    };
    document.querySelectorAll('[data-gemfilter]').forEach(function (p) {
      p.onclick = function () {
        gemFilter = p.dataset.gemfilter;
        document.querySelectorAll('[data-gemfilter]').forEach(function (q) {
          q.classList.toggle('on', q === p);
        });
        renderFavs();
      };
    });
    // v1.0.9, Decision 90 — each heading opens its own full ladder.
    $('bRank').onclick = function () { openTierLadder('rank'); };
    $('bStreakName').onclick = function () { openTierLadder('streak'); };

    // Plan builder
    var pb = $('pbBook');
    var ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Choose…'; pb.appendChild(ph);
    E.BOOKS.forEach(function (n, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = n; pb.appendChild(o);
    });
    // v7: Old Testament down the left, New Testament down the right,
    // each in biblical order with the checkbox snug beside its name.
    var colOT = $('pbGroupOT'), colNT = $('pbGroupNT');
    E.BOOKS.forEach(function (n, i) {
      var l = document.createElement('label');
      l.innerHTML = '<input type="checkbox" value="' + i + '"> ' + n;
      l.querySelector('input').onchange = pbCalc;
      (i < 39 ? colOT : colNT).appendChild(l);
    });
    $('btnNewPlan').onclick = function () { pbReset(); $('planBuilder').style.display = 'block'; pbCalc(); };
    $('btnCancelPlan').onclick = function () { $('planBuilder').style.display = 'none'; };
    $('pbScope').onchange = pbScopeOpts;
    $('pbBook').onchange = pbCalc;
    $('pbDays').onchange = function () {
      pbShapeFields();
      pbCalc();
    };
    $('pbCustom').oninput = pbCalc;
    // v1.1.4, Decision 149 — both new shapes recalculate as he types or picks.
    $('pbDate').onchange = pbCalc;
    $('pbDate').oninput = pbCalc;
    $('pbPerDay').oninput = pbCalc;
    $('btnLockPlan').onclick = lockPlan;

    // Catch up
    $('cuBook').onchange = function () { cuChapters(); cuVerses(); cuUpdate(); };
    $('cuChapter').onchange = function () { cuVerses(); cuUpdate(); };   // v13.1
    $('cuVerse').onchange = cuUpdate;                                    // v13.1
    $('cuCancel').onclick = function () { $('cuOverlay').classList.remove('show'); };
    $('cuConfirm').onclick = cuConfirm;

    // Settings
    // ---- v1.0.4 wiring: ⋮ menu, prayer timer, ladder, badges ----
    $('btnDots').onclick = openMenu;
    $('miClose').onclick = closeMenu;
    $('menuSheet').onclick = function (e) { if (e.target === $('menuSheet')) closeMenu(); };

    // ---------- v1.1.0 wiring ----------
    $('miSeasons').onclick = function () { closeMenu(); openSeasons(); };
    $('seasonClose').onclick = function () { $('seasonSheet').classList.remove('show'); };
    $('seasonSheet').onclick = function (e) { if (e.target === $('seasonSheet')) $('seasonSheet').classList.remove('show'); };
    $('seasonSave').onclick = function () {
      E.seasonSet(state, $('seasonBox').value); save();
      renderSeasonLine(); renderSeasonSheet();
    };
    $('seasonClear').onclick = function () {
      if (!E.seasonCurrent(state)) return;
      if (!confirm('End this season? It is kept, dated, among your former seasons — nothing is deleted.')) return;
      E.seasonSet(state, ''); save();
      renderSeasonLine(); renderSeasonSheet();
    };

    // Reading aloud
    /* WEB BUILD — the long press, settled 13 Sep 2026.

       A normal press listens. A press held for half a second listens AND keeps
       the light on for the whole sitting. The press is timed on pointerdown and
       read on the click that follows, so one handler serves finger and mouse
       alike. Any movement away cancels it — a scroll that began on the button
       must never be read as a long press. */
    var holdTimer = null, holdFired = false;
    function listenPressStart() {
      holdFired = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        holdFired = true;
        $('btnListen').classList.add('arming');
      }, 500);
    }
    function listenPressCancel(keep) {
      clearTimeout(holdTimer); holdTimer = null;
      $('btnListen').classList.remove('arming');
      if (!keep) holdFired = false;
    }
    var bl = $('btnListen');
    bl.addEventListener('pointerdown', listenPressStart);
    bl.addEventListener('pointerup', function () { listenPressCancel(true); });
    bl.addEventListener('pointerleave', function () { listenPressCancel(false); });
    bl.addEventListener('pointercancel', function () { listenPressCancel(false); });
    // A long press on a phone otherwise raises the text-selection menu.
    bl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    bl.onclick = function (e) {
      e.stopPropagation();
      var wasLong = holdFired; holdFired = false;
      if (audioOn || audioWaiting) { stopAudio(''); return; }
      startAudio(true, wasLong);
    };
    $('btnAudioStop').onclick = function (e) { e.stopPropagation(); stopAudio(''); };
    $('btnAudioGo').onclick = function (e) { e.stopPropagation(); startAudio(false); };
    $('setAudio').onchange = function (e) {
      state.settings.audio = e.target.checked; save(); audioVisible();
    };
    $('setAudioStop').onchange = function (e) { state.settings.audioStop = e.target.checked; save(); };
    $('setAudioNums').onchange = function (e) { state.settings.audioNums = e.target.checked; save(); };
    $('setAudioWake').onchange = function (e) { state.settings.audioWake = e.target.checked; save(); };
    $('setAudioRate').onchange = function (e) { state.settings.audioRate = parseFloat(e.target.value); save(); };
    $('setAudioVoice').onchange = function (e) { state.settings.audioVoice = e.target.value; save(); };
    if (typeof speechSynthesis !== 'undefined') {
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    // The square, and reading one
    $('btnShowSquare').onclick = openSquare;
    $('squareClose').onclick = function () {
      $('squareWrap').classList.remove('full');
      $('squareSheet').classList.remove('show');
    };
    $('squareSheet').onclick = function (e) { if (e.target === $('squareSheet')) $('squareSheet').classList.remove('show'); };
    // v1.1.4, Decision 155 — three budgets, opening on Fewest squares.
    document.querySelectorAll('#squareModes .pill').forEach(function (p) {
      p.onclick = function () { sqMode = p.dataset.sqmode; rebuildSquares(); };
    });
    /* v1.1.4, Decision 156 — tapping the square fills the screen: heading,
       buttons and the bottom bar out of the way, for the most modules-per-inch
       obtainable without adding a square. Tapping again comes back. */
    $('squareWrap').onclick = function (e) {
      e.stopPropagation();
      $('squareWrap').classList.toggle('full');
    };
    $('squareNext').onclick = function () { if (!sqSet) return; sqAt = (sqAt + 1) % sqSet.total; paintSquare(); };
    $('squarePrev').onclick = function () { if (!sqSet) return; sqAt = (sqAt + sqSet.total - 1) % sqSet.total; paintSquare(); };
    $('btnScan').onclick = openScan;
    $('scanClose').onclick = closeScan;

    // The Secret Place
    $('btnRoomMake').onclick = openMake;
    $('btnRoomOpenSealed').onclick = function () { askPin('open'); };
    /* v1.1.3, Decision 143 — F29. Close no longer walks a man out of his own
       room on one tap. Nothing inside is lost by leaving, but getting back in
       costs the verse, the knock and the word again, and that is enough to be
       asked first. */
    /* v1.1.4, Decision 144 — the room's own screen, not the browser's box. In
       the extension that box is headed with the add-on's name; on the web build
       at dicksonohere.github.io it would carry the web address instead, which is
       worse still on a page holding a man's letters. */
    $('roomClose').onclick = function () {
      roomAsk('Leave the room?',
        'Nothing here is lost. To come back in you will need your verse, your knock and your word again.',
        'Leave it',
        closeRoom);
    };
    $('roomHeadBack').onclick = function () { renderRoomList(); };
    // v1.1.3, Decision 140 — the full category list, on both filing screens.
    $('mkCatBrowse').onclick = function () { toggleCatPicker('mkCatPicker', 'mkCat'); };
    $('foCatBrowse').onclick = function () { toggleCatPicker('foCatPicker', 'foCat'); };
    $('pinCancel').onclick = function () { $('pinOverlay').classList.remove('show'); };
    $('pinGo').onclick = function () { pinEntered($('pinBox').value); };
    $('pinBox').onkeydown = function (e) { if (e.key === 'Enter') pinEntered($('pinBox').value); };
    // v1.1.2, Decision 132 — the ticks live on the writing page itself now.
    // Something ticked, or a category named, is an explicit choice and needs
    // no further prompt. Neither is the one case that gets a chance to refile
    // before it saves — offered once, dismissible for good.
    /* v1.1.4, Decision 146 — F31. "Keep this" no longer saves. Where the filing
       screen is going to be offered, the letter is held as a draft and written
       only when Done is pressed there; where it is not offered (something ticked,
       a category named, or the prompt turned off for good) the choice has already
       been made explicitly and the letter is written here, as before. */
    function writeDraft(d) {
      var e = E.roomAddEntry(state.room, d.text);
      e.struggle = !!d.struggle;
      e.testimony = !!d.testimony;
      e.cats = d.cat ? [d.cat] : [];
      if (d.cat) E.roomSealCat(state.room, d.cat, false);
      save();
      // Only now is the writing page cleared — anything earlier and a man who
      // changed his mind would have lost the words he came in with.
      $('roomBox').value = '';
      $('mkStruggle').checked = false; $('mkTestimony').checked = false; $('mkCat').value = '';
      return e;
    }
    $('roomKeep').onclick = function () {
      var t = $('roomBox').value;
      if (!t.trim()) { renderRoomList(); return; }
      var d = {
        text: t,
        struggle: $('mkStruggle').checked,
        testimony: $('mkTestimony').checked,
        cat: $('mkCat').value.trim()
      };
      if (!d.struggle && !d.testimony && !d.cat && !state.settings.roomFilePromptOff) {
        fileDraft = d;
        openFileOverlay({ struggle: false, testimony: false, cats: [] }, 'auto');
        return;
      }
      writeDraft(d);
      renderRoomList();
    };
    $('roomToList').onclick = renderRoomList;
    $('foDone').onclick = function () {
      var c = $('foCat').value.trim();
      if (fileDraft) {
        // Written for the first time, here, with whatever he has just chosen.
        fileDraft.struggle = $('foStruggle').checked;
        fileDraft.testimony = $('foTestimony').checked;
        fileDraft.cat = c;
        if ($('foDontAsk').checked) state.settings.roomFilePromptOff = true;
        writeDraft(fileDraft);
        fileDraft = null;
      } else if (fileTarget) {
        fileTarget.struggle = $('foStruggle').checked;
        fileTarget.testimony = $('foTestimony').checked;
        fileTarget.cats = c ? [c] : [];
        if (c) E.roomSealCat(state.room, c, false);
        save();
      }
      fileTarget = null;
      $('fileOverlay').classList.remove('show');
      renderRoomList();
    };
    $('foBack').onclick = function () {
      $('fileOverlay').classList.remove('show');
      if (fileDraft) {
        // Nothing was written. The words, the ticks and the category are all
        // exactly as he left them.
        fileDraft = null;
        fillCatList();
        roomShow('roomWrite');
        return;
      }
      // An existing letter's own "Filed as…" — Back changes nothing at all.
      fileTarget = null;
      renderRoomList();
    };
    $('roomNew').onclick = function () {
      $('roomBox').value = ''; $('mkCatPicker').style.display = 'none';
      fillCatList(); roomShow('roomWrite');
    };
    $('roomSettingsBtn').onclick = renderRoomAdmin;
    $('roomSeasonSave').onclick = function () {
      E.seasonSet(state, $('roomSeasonBox').value); save();
      renderRoomSeason(); renderSeasonLine();
    };
    $('remOn').onchange = function (e) {
      state.room.reminder = state.room.reminder || { on: false, text: '', lastShown: null };
      state.room.reminder.on = e.target.checked; save();
    };
    $('remSave').onclick = function () {
      state.room.reminder = state.room.reminder || { on: true, text: '', lastShown: null };
      state.room.reminder.text = $('remText').value;
      state.room.reminder.on = $('remOn').checked;
      save(); renderRemindLine();
    };
    $('roomBadgeChoice').onchange = function (e) {
      state.room.badgeChoice = e.target.value; save(); applyBadgeChoice();
    };
    // v1.1.2, F15 (Decision 126) — the last three of the six things §6/§14
    // name as changed from inside only.
    $('roomChangeDoor').onclick = function () { openEdit('door'); };
    $('roomChangeKnock').onclick = function () { openEdit('knock'); };
    $('roomChangeWord').onclick = function () { openEdit('word'); };
    // v1.1.4, Decision 158 — a fourth button. "there should be a place for all
    // reset where you change word, verse and knock at once instead of doing them
    // one after the other like we have now." A man who wants only a new word
    // still gets one screen; a man starting fresh gets one pass. It is also what
    // Decision 157's "set a new door now" hands him.
    $('roomChangeAll').onclick = function () { openEdit('all'); };
    $('roomBadges').onclick = function () { closeRoom(); openBadges(); };
    // v1.1.4, Decision 144 — asked twice, both times by the room.
    $('roomReset').onclick = function () {
      roomAsk('Close this room for good?',
        'This closes the room and everything in it. There is no recovery and nobody can undo it for you.',
        'Close it',
        function () {
          roomAsk('Once more, because there is no way back.',
            'Every letter, every category, the door verse and the knock. Gone, and not recoverable by anyone.',
            'Delete this room',
            function () { state.room = null; save(); closeRoom(); roomStatusLine(); });
        });
    };
    // v1.1.4, Decisions 144, 151, 157, 171 — the new screens.
    $('askGo').onclick = function () { var cb = askCb; askClose(); if (cb) cb(); };
    $('askNo').onclick = askClose;
    $('askOverlay').onclick = function (e) { if (e.target === $('askOverlay')) askClose(); };
    $('roomSealedOpen').onclick = function () { askPin('sealed'); };
    wireReveal('pinBox', 'pinShow');
    wireReveal('mkPin', 'mkPinShow', 'mkPin2');
    wireReveal('bkPin', 'bkPinShow');
    /* v1.1.4, Decision 157 — offered, not required. A man who knows his own door
       is not made to change it, and a man who skips it has been told what it
       costs. The one exception is a browser that could not seal a fresh check
       (no crypto at all), where the door cannot be mended silently — there
       "Keep them" is not offered, because keeping them would cost him the room
       the moment he closed it. */
    $('restoredKeep').onclick = function () {
      $('restoredOverlay').classList.remove('show');
      openRoom();
    };
    $('restoredSet').onclick = function () {
      $('restoredOverlay').classList.remove('show');
      openRoom();
      openEdit('all');
    };
    // v1.1.4, Decision 150 — the backup door's own box.
    $('bkGo').onclick = bkSubmit;
    $('bkPin').onkeydown = function (e) { if (e.key === 'Enter') bkSubmit(); };
    $('bkPlain').onclick = function () {
      var cb = bkCb; bkClose(); if (cb) cb(null);
    };
    $('bkCancel').onclick = bkClose;

    // Making a room: the place, then the knock, then the word — and then it is
    // read back once, and never again.

    /* THE PRACTICE PAD. Dickson's own requirement: "i hope a seconds reading
       shows when creating the room." The old pad showed a gap only AFTER it was
       made, so a man could not aim — he tapped, then learned he had made 4.2.
       This one runs the seconds in front of him, exactly as the prayer clock
       will at the door, so he can rehearse the number he has just set. */
    $('knockPad').onclick = function () {
      var want = knockDigits($('mkKnockNum').value) || [];
      if (!padRunning && padGaps.length >= want.length && want.length) { padReset(); }
      if (padRunning) {
        padGaps.push((Date.now() - padSince) / 1000);
        padStop();
        $('knockPad').classList.remove('armed');
      } else {
        padSince = Date.now(); padRunning = true;
        $('knockPad').classList.add('armed');
        padTick = setInterval(padPaint, 100);
      }
      padPaint();
      var shown = padGaps.map(function (g) { return g.toFixed(1) + 's'; }).join(' · ');
      if (!want.length) {
        $('mkKnockNote').textContent = shown ? 'You tapped: ' + shown + '. Set your number above and try it against that.' : '';
        return;
      }
      var note = 'You tapped: ' + (shown || '—') + '   ·   your knock is ' + want.join('-');
      if (padGaps.length === want.length) {
        var tol = parseInt($('mkKnockTol').value, 10);
        if (E.knockMatches({ gaps: want, tol: tol }, padGaps)) {
          note += '   ·   that would have opened it. Now resume and let it run five seconds.';
        } else {
          // v1.1.2 — names the gap that missed, rather than only the verdict.
          // "That would not have opened it" is true; it does not teach.
          var ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'], bad = '';
          for (var gi = 0; gi < want.length; gi++) {
            if (Math.abs(padGaps[gi] - want[gi]) > tol) {
              bad = 'Your ' + ORD[gi + 1] + ' gap was ' + padGaps[gi].toFixed(1) + 's — outside the ±' + tol + 's you chose.';
              break;
            }
          }
          note += '   ·   that would NOT have opened it. ' + (bad || 'Watch the seconds and try again.');
        }
      }
      $('mkKnockNote').textContent = note;
    };

    $('mkKnockNum').oninput = paintKnockWarn;
    $('mkKnockTol').onchange = paintKnockWarn;
    $('mkKnockStart').onchange = paintKnockWarn;
    $('mkWordShape').onchange = paintWordShape;
    $('mkShowWords').onchange = paintVaultNote;

    $('makeCancel').onclick = function () {
      /* v1.1.4, Decision 164 — at the reminder step the room already exists and
         this button is "No reminder, thank you". Skipping it is the whole point
         of the offer, so it closes cleanly and changes nothing. */
      if (makeStep === 5) {
        $('makeCancel').textContent = 'Cancel';
        $('makeOverlay').classList.remove('show');
        return;
      }
      // v1.1.3 — a half-finished door move is dropped whole. The door was
      // never written, so cancelling leaves the room exactly as it stands.
      editMode = null; pendingRoom = null; editDoorPending = null;
      padReset(); $('makeOverlay').classList.remove('show');
    };
    // v1.1.4, Decision 165 — the tick releases the button. Nothing else.
    $('mkWrote').onchange = function () {
      $('makeNext').disabled = !$('mkWrote').checked;
      if ($('mkWrote').checked) $('mkWroteNote').textContent = '';
    };
    $('makeNext').onclick = function () {
      // v1.1.2, Decision 126 — "Done" pressed after an edit's one-fact reveal.
      // Checked first so it does not fall back into the edit branches below,
      // which would just redo the same save and show the reveal again.
      if (editMode && makeStep === 4) {
        editMode = null; editDoorPending = null;
        $('makeOverlay').classList.remove('show');
        return;
      }
      /* v1.1.4, Decision 158 — all three, in one pass. The making flow's own
         steps, with state.room written only once the word is sealed. */
      if (editMode === 'all') {
        if (makeStep === 1) {
          makeDoor = [parseInt($('mkBook').value, 10), parseInt($('mkChap').value, 10), parseInt($('mkVerse').value, 10)];
          makeStep = 2;
          $('makeStep1').style.display = 'none'; $('makeStep2').style.display = '';
          $('makeBack').style.display = '';
          $('makeNote').textContent = 'Still nothing changed. The knock next, then the word.';
          $('makeNext').textContent = 'Next — the word';
          paintKnockWarn();
          return;
        }
        if (makeStep === 2) {
          var ag = knockDigits($('mkKnockNum').value);
          if (!ag) { $('mkKnockWarn').textContent = 'A knock is whole seconds, each one between 1 and 9 — like 4567.'; return; }
          makeKnock = { gaps: ag, tol: parseInt($('mkKnockTol').value, 10), start: $('mkKnockStart').value };
          var acodes = E.knockCheck(makeKnock);
          if (acodes.indexOf('short') >= 0 || acodes.indexOf('long') >= 0) { paintKnockWarn(); return; }
          makeStep = 3;
          $('makeStep2').style.display = 'none'; $('makeStep3').style.display = '';
          $('makeBack').style.display = '';
          $('makeNote').textContent = 'The last one. When this is saved, all three change together.';
          $('makeNext').textContent = 'Save all three';
          padReset();
          paintWordShape(); paintVaultNote();
          return;
        }
        var aa = $('mkPin').value, ab = $('mkPin2').value;
        if (!aa) { $('makeNote').textContent = 'A word is needed. There is no way in without one.'; return; }
        if (aa !== ab) { $('makeNote').textContent = 'Those two do not match.'; return; }
        if (aa === makeKnock.gaps.join('') && $('makeNote').textContent.indexOf('That word is your knock') < 0) {
          $('makeNote').textContent = 'That word is your knock. Anyone who works out the tapping is then straight in, and anyone holding an old backup code of yours needs only the rhythm. Press again to use it anyway.';
          return;
        }
        $('makeNote').textContent = 'Saving…';
        E.sealRoom({ door: makeDoor, knock: makeKnock, made: state.room.made, entries: [], cats: [], seq: 0 }, aa)
          .then(function (blob) {
            state.room.door = makeDoor;
            state.room.knock = makeKnock;
            state.room.pinCheck = blob;
            state.room.wordShape = settleWordShape($('mkWordShape').value, aa, makeDoor);
            state.room.showWords = ($('mkShowWords').value !== 'no');
            state.room.hint = String($('mkHint').value || '').slice(0, 140);
            state.roomTry = null;
            save();
            roomStatusLine();
            showEditReveal('all', { door: makeDoor, knock: makeKnock });
          }, function () {
            $('makeNote').textContent = 'This browser would not seal the room. Nothing was changed — your verse, your knock and your word all stand as they were.';
          });
        return;
      }
      // Changing one existing part of a room the reader already has. Each
      // branch mutates state.room directly (never creates a fresh one) and
      // ends at a one-fact reveal, read back once just as at the making.
      if (editMode === 'door') {
        var newDoor = [parseInt($('mkBook').value, 10), parseInt($('mkChap').value, 10), parseInt($('mkVerse').value, 10)];
        /* v1.1.3, F18 — a word taken from the door verse cannot outlive that
           door moving, so the move carries straight on to the word step and
           nothing is written until both are set. Any other shape of word is
           the owner's own and survives untouched, exactly as Decision 126
           promised, so it saves here as before. */
        if ((state.room.wordShape || 'typed') === 'door') {
          editDoorPending = newDoor;
          editMode = 'door-word';
          makeStep = 3;
          makeDoor = newDoor; makeKnock = state.room.knock;
          $('mkWordShape').value = 'door';
          $('mkShowWords').value = (state.room.showWords === false) ? 'no' : 'yes';
          $('mkHint').value = state.room.hint || '';
          $('mkPin').value = ''; $('mkPin2').value = '';
          paintWordShape(); paintVaultNote();
          $('makeStep1').style.display = 'none'; $('makeStep3').style.display = '';
          $('makeBack').style.display = '';
          $('makeNote').textContent = 'The door has not moved yet. Set the word that will open it, and the two are saved together.';
          $('makeNext').textContent = 'Save the new verse and word';
          return;
        }
        state.room.door = newDoor; save();
        showEditReveal('door', newDoor);
        return;
      }
      /* v1.1.3, F18 — the second half of a door move for a door-shaped word.
         The door and the word are written in the same breath, after the seal
         succeeds, so a browser that cannot seal leaves the room exactly as it
         was rather than standing at a door whose word was never made. */
      if (editMode === 'door-word') {
        var da = $('mkPin').value, db = $('mkPin2').value;
        if (!da) { $('makeNote').textContent = 'A word is needed. There is no way in without one.'; return; }
        if (da !== db) { $('makeNote').textContent = 'Those two do not match.'; return; }
        if (da === state.room.knock.gaps.join('') && $('makeNote').textContent.indexOf('That word is your knock') < 0) {
          $('makeNote').textContent = 'That word is your knock. Anyone who works out the tapping is then straight in, and anyone holding an old backup code of yours needs only the rhythm. Press again to use it anyway.';
          return;
        }
        $('makeNote').textContent = 'Saving…';
        E.sealRoom({ door: editDoorPending, knock: state.room.knock, made: state.room.made, entries: [], cats: [], seq: 0 }, da)
          .then(function (blob) {
            state.room.door = editDoorPending;
            state.room.pinCheck = blob;
            // v1.1.4, Decision 152 — quietly filed as typed if it is not in the verse.
            state.room.wordShape = settleWordShape($('mkWordShape').value, da, editDoorPending);
            state.room.showWords = ($('mkShowWords').value !== 'no');
            state.room.hint = String($('mkHint').value || '').slice(0, 140);
            state.roomTry = null;
            editDoorPending = null;
            save();
            showEditReveal('door-word', state.room.door);
          }, function () {
            $('makeNote').textContent = 'This browser would not seal the room. Nothing was changed — your door and your word both stand as they were.';
          });
        return;
      }
      if (editMode === 'knock') {
        var eg = knockDigits($('mkKnockNum').value);
        if (!eg) { $('mkKnockWarn').textContent = 'A knock is whole seconds, each one between 1 and 9 — like 4567.'; return; }
        var newKnock = { gaps: eg, tol: parseInt($('mkKnockTol').value, 10), start: $('mkKnockStart').value };
        var ecodes = E.knockCheck(newKnock);
        if (ecodes.indexOf('short') >= 0 || ecodes.indexOf('long') >= 0) { paintKnockWarn(); return; }
        state.room.knock = newKnock; save();
        showEditReveal('knock', newKnock);
        return;
      }
      if (editMode === 'word') {
        var ea = $('mkPin').value, eb = $('mkPin2').value;
        if (!ea) { $('makeNote').textContent = 'A word is needed. There is no way in without one.'; return; }
        if (ea !== eb) { $('makeNote').textContent = 'Those two do not match.'; return; }
        if (ea === state.room.knock.gaps.join('') && !$('makeNote').textContent) {
          $('makeNote').textContent = 'That word is your knock. Anyone who works out the tapping is then straight in, and anyone holding an old backup code of yours needs only the rhythm. Press again to use it anyway.';
          return;
        }
        $('makeNote').textContent = 'Saving…';
        E.sealRoom({ door: state.room.door, knock: state.room.knock, made: state.room.made, entries: [], cats: [], seq: 0 }, ea)
          .then(function (blob) {
            state.room.pinCheck = blob;
            // v1.1.4, Decision 152 — quietly filed as typed if it is not in the verse.
            state.room.wordShape = settleWordShape($('mkWordShape').value, ea, state.room.door);
            state.room.showWords = ($('mkShowWords').value !== 'no');
            state.room.hint = String($('mkHint').value || '').slice(0, 140);
            state.roomTry = null;
            save();
            showEditReveal('word', null);
          }, function () {
            $('makeNote').textContent = 'This browser would not seal the room. Nothing was saved.';
          });
        return;
      }

      if (makeStep === 1) {
        makeDoor = [parseInt($('mkBook').value, 10), parseInt($('mkChap').value, 10), parseInt($('mkVerse').value, 10)];
        makeStep = 2;
        $('makeStep1').style.display = 'none'; $('makeStep2').style.display = '';
        $('makeBack').style.display = '';
        paintKnockWarn();
        return;
      }
      if (makeStep === 2) {
        var g = knockDigits($('mkKnockNum').value);
        if (!g) { $('mkKnockWarn').textContent = 'A knock is whole seconds, each one between 1 and 9 — like 4567.'; return; }
        makeKnock = { gaps: g, tol: parseInt($('mkKnockTol').value, 10), start: $('mkKnockStart').value };
        var codes = E.knockCheck(makeKnock);
        // Length is refused because it is arithmetic; the spread is only warned
        // about, because the app has never decided for a man what he can be
        // trusted with. Both are said plainly either way.
        if (codes.indexOf('short') >= 0 || codes.indexOf('long') >= 0) { paintKnockWarn(); return; }
        makeStep = 3;
        $('makeStep2').style.display = 'none'; $('makeStep3').style.display = '';
        $('makeNext').textContent = 'Make the room';
        $('makeBack').style.display = '';
        padReset();
        paintWordShape();
        return;
      }
      if (makeStep === 3) {
        var a = $('mkPin').value, b = $('mkPin2').value;
        if (!a) { $('makeNote').textContent = 'A word is needed. There is no way in without one.'; return; }
        if (a !== b) { $('makeNote').textContent = 'Those two do not match.'; return; }
        // Decision 118 — the word is the only real lock; the knock is the
        // doorbell nobody else can find. If they are the same thing, three locks
        // become one. Warned, not refused.
        if (a === makeKnock.gaps.join('') && !$('makeNote').textContent) {
          $('makeNote').textContent = 'That word is your knock. Anyone who works out the tapping is then straight in, and anyone holding an old backup code of yours needs only the rhythm. Press again to use it anyway.';
          return;
        }
        var room = E.newRoom(makeDoor, makeKnock);
        // v1.1.4, Decision 152 — quietly filed as typed if it is not in the verse.
        room.wordShape = settleWordShape($('mkWordShape').value, a, makeDoor);
        room.showWords = ($('mkShowWords').value !== 'no');
        room.hint = String($('mkHint').value || '').slice(0, 140);
        $('makeNote').textContent = 'Making it…';
        // The word itself is never stored. What is kept is a sealed scrap only
        // the right word can open — the same lock the travelling room uses.
        // v1.1.2, Decision 127 — NOT written to state.room here any more. The
        // room lives in pendingRoom until "I have it" is pressed at the
        // reveal, so the reveal is a confirmation, not a receipt.
        E.sealRoom({ door: makeDoor, knock: makeKnock, made: room.made, entries: [], cats: [], seq: 0 }, a)
          .then(function (blob) {
            room.pinCheck = blob;
            pendingRoom = room;
            showReveal(room);
          }, function () {
            $('makeNote').textContent = 'This browser would not seal the room. Nothing was made.';
          });
        return;
      }
      if (makeStep === 4) {
        // v1.1.4, Decision 165 — the tick is the gate, not a decoration. The
        // button is disabled until it is marked; this is the belt to that brace.
        if (!$('mkWrote').checked) {
          $('mkWroteNote').textContent = 'Mark that you have written them down. The word cannot be recovered by anyone — not the app, not anyone.';
          return;
        }
        // The reveal has been read. Only now does the room exist.
        if (pendingRoom) {
          state.room = pendingRoom; pendingRoom = null; state.roomTry = null; save();
          roomStatusLine();
        }
        /* v1.1.4, Decision 164 — the reminder becomes a step at the end of the
           making, offered with §12's own reasoning and skippable. It lives in
           the room's Settings and starts off, and Dickson had a room for three
           days without ever seeing the switch. A reader will not go looking for
           a setting he was never shown. */
        makeStep = 5;
        $('makeStep4').style.display = 'none'; $('makeStep5').style.display = '';
        $('makeNext').textContent = 'Keep this reminder';
        $('makeNext').disabled = false;
        $('makeStartAgain').style.display = 'none';
        $('makeBack').style.display = 'none';
        $('makeCancel').style.display = '';
        $('makeCancel').textContent = 'No reminder, thank you';
        $('makeNote').textContent = '';
        return;
      }
      if (makeStep === 5) {
        var rt = String($('mkRemText').value || '').trim();
        if (!rt) {
          $('makeNote').textContent = 'Put a few words in, or press “No reminder, thank you”. It can be set at any time from inside the room.';
          return;
        }
        state.room.reminder = { on: true, text: rt, lastShown: null };
        save();
        renderRemindLine();
        $('makeCancel').textContent = 'Cancel';
        $('makeOverlay').classList.remove('show');
        return;
      }
      $('makeOverlay').classList.remove('show');
    };

    $('makeBack').onclick = function () {
      /* v1.1.3, F18 — Back out of the word half of a door move returns to the
         verse, not to the making flow's knock step, and forgets the door that
         was never written. */
      if (editMode === 'door-word') {
        editMode = 'door'; editDoorPending = null;
        makeStep = 1;
        $('makeStep3').style.display = 'none'; $('makeStep1').style.display = '';
        $('makeBack').style.display = 'none';
        $('makeNext').textContent = 'Next — then your new word';
        $('makeNote').textContent = 'Your word came from this verse. Move the door and that word can never be offered to you again, so you will set a new word on the next screen — the two move together, or neither does. Your letters are unaffected either way.';
        return;
      }
      // v1.1.4, Decision 158 — Back through the all-three pass. Nothing has been
      // written at any point in it, so stepping backwards costs nothing.
      var isAll = (editMode === 'all');
      if (makeStep === 2) {
        makeStep = 1;
        $('makeStep2').style.display = 'none'; $('makeStep1').style.display = '';
        $('makeBack').style.display = 'none';
        $('makeNext').textContent = isAll ? 'Next — the knock' : 'Next';
        $('makeNote').textContent = isAll ? 'Nothing has changed yet.' : '';
        return;
      }
      if (makeStep === 3) {
        makeStep = 2;
        $('makeStep3').style.display = 'none'; $('makeStep2').style.display = '';
        $('makeNext').textContent = isAll ? 'Next — the word' : 'Next';
        $('makeNote').textContent = isAll ? 'Nothing has changed yet.' : '';
        paintKnockWarn();
      }
    };
    // v1.1.2, Decision 124 — discards the room just made and returns to step
    // 1. This is not the knock being shown a second time (Decision 114
    // forbids that) — it is destroying a draft, not disclosing it, at the one
    // screen where the man has already been told everything.
    $('makeStartAgain').onclick = function () {
      pendingRoom = null;
      openMake();
    };

    /* Decision 114 — READ BACK ONCE, AND NEVER AGAIN. If Settings could show
       this a second time, anyone holding the unlocked phone would read the key
       and all three locks would be worth nothing. §6 already requires the knock
       to be changed from inside the room only. */
    function showReveal(room) {
      makeStep = 4;
      $('makeStep3').style.display = 'none'; $('makeStep4').style.display = '';
      $('makeStep5').style.display = 'none';
      $('makeNote').textContent = '';
      $('makeNext').textContent = 'I have it';
      $('makeCancel').style.display = 'none';
      $('makeBack').style.display = 'none';
      $('makeStartAgain').style.display = '';
      /* v1.1.4, Decision 165 — the tick. It gates "I have it" rather than
         sitting beside it as decoration: this is the single moment in the whole
         app where a tick can actually save someone, and Dickson forgot his own
         knock within three days — recovering it only because it happened to be
         in a chat. A reader has no chat to look in. */
      $('mkWroteRow').style.display = '';
      $('mkWrote').checked = false;
      $('mkWroteNote').textContent = 'The word cannot be recovered by anyone. Write these down before you go on.';
      $('makeNext').disabled = true;
      var el = $('mkReveal');
      while (el.firstChild) el.removeChild(el.firstChild);
      function row(label, value) {
        var r = document.createElement('div'); r.className = 'reveal-row';
        var a = document.createElement('span'); a.textContent = label;
        var b = document.createElement('b'); b.textContent = value;
        r.appendChild(a); r.appendChild(b); el.appendChild(r);
      }
      row('Your door', E.BOOKS[room.door[0]] + ' ' + (room.door[1] + 1) + ':' + (room.door[2] + 1));
      row('Your knock', room.knock.gaps.join(' – '));
      row('Counting starts', room.knock.start === 'pause' ? 'after your first pause' : 'when the prayer starts');
      row('You may be out by', room.knock.tol + (room.knock.tol === 1 ? ' second' : ' seconds'));
      row('Then let it run', E.KNOCK_SETTLE + ' seconds, without pausing');
      var n = document.createElement('div'); n.className = 'reveal-note';
      n.textContent = 'Go to your verse, start a prayer, and pause the clock at each of those seconds in turn. '
        + 'When the last one is done, resume and simply pray — after ' + E.KNOCK_SETTLE
        + ' unbroken seconds the word panel appears. Do not tap again while you wait: a man tapping his way in never stops, '
        + 'and that is exactly what keeps him out. Nothing here will ever be shown to you again.';
      el.appendChild(n);
    }
    // v1.1.2, Decision 126 — the smaller reveal for changing one existing
    // part. editMode is cleared on close, whichever way the overlay closes.
    function showEditReveal(which, value) {
      $('makeStep1').style.display = 'none'; $('makeStep2').style.display = 'none';
      $('makeStep3').style.display = 'none'; $('makeStep4').style.display = '';
      $('makeStep5').style.display = 'none';
      $('makeNote').textContent = '';
      $('makeNext').textContent = 'Done';
      $('makeNext').disabled = false;
      $('makeCancel').style.display = 'none';
      $('makeBack').style.display = 'none';
      $('makeStartAgain').style.display = 'none';
      // Decision 165's tick belongs to the making, where the room does not yet
      // exist. Changing one part of a room he already has is not that moment.
      $('mkWroteRow').style.display = 'none';
      $('mkWroteNote').textContent = '';
      var el = $('mkReveal');
      while (el.firstChild) el.removeChild(el.firstChild);
      function row(label, value2) {
        var r = document.createElement('div'); r.className = 'reveal-row';
        var a = document.createElement('span'); a.textContent = label;
        var b = document.createElement('b'); b.textContent = value2;
        r.appendChild(a); r.appendChild(b); el.appendChild(r);
      }
      var note = '';
      if (which === 'door') {
        row('Your new door', E.BOOKS[value[0]] + ' ' + (value[1] + 1) + ':' + (value[2] + 1));
        note = 'This is read back once, exactly as at the making, and will not be shown again. Your letters are unaffected — they open with the current word regardless of where the door now stands.';
      } else if (which === 'door-word') {
        // v1.1.3, F18 — both facts read back once, in the one act that set them.
        row('Your new door', E.BOOKS[value[0]] + ' ' + (value[1] + 1) + ':' + (value[2] + 1));
        note = 'Your door and your word both moved, together. This is read back once, exactly as at the making, and will not be shown again. Your letters are unaffected — they open with the new word from now on.';
      } else if (which === 'knock') {
        row('Your new knock', value.gaps.join(' – '));
        row('Counting starts', value.start === 'pause' ? 'after your first pause' : 'when the prayer starts');
        row('You may be out by', value.tol + (value.tol === 1 ? ' second' : ' seconds'));
        note = 'This is read back once, exactly as at the making, and will not be shown again. Your letters are unaffected.';
      } else if (which === 'all') {
        // v1.1.4, Decision 158 — all three, read back once in the one act that
        // set them. This is also where Decision 157's "set a new door now" ends.
        row('Your new door', E.BOOKS[value.door[0]] + ' ' + (value.door[1] + 1) + ':' + (value.door[2] + 1));
        row('Your new knock', value.knock.gaps.join(' – '));
        row('Counting starts', value.knock.start === 'pause' ? 'after your first pause' : 'when the prayer starts');
        row('You may be out by', value.knock.tol + (value.knock.tol === 1 ? ' second' : ' seconds'));
        row('Then let it run', E.KNOCK_SETTLE + ' seconds, without pausing');
        note = 'All three have changed, together. This is read back once, exactly as at the making, and will not be shown again. Your letters are unaffected — they open with the new word from now on. Write these down before you leave this screen: the word cannot be recovered by anyone.';
      } else {
        note = 'Your word has changed. Existing letters are unaffected — they open with the new word from now on. Nothing here will ever be shown to you again.';
      }
      var n = document.createElement('div'); n.className = 'reveal-note';
      n.textContent = note;
      el.appendChild(n);
      makeStep = 4;
    }

    $('miBadges').onclick = openBadges;
    $('miLadder').onclick = openLadder;
    $('bClose').onclick = function () { $('badgeSheet').classList.remove('show'); };
    $('badgeSheet').onclick = function (e) { if (e.target === $('badgeSheet')) $('badgeSheet').classList.remove('show'); };

    $('ladderAccept').onclick = function () {
      var o = pendingOffer(); if (!o) return;
      E.ladderAccept(state, o); save();
      $('ladderOverlay').classList.remove('show');
      renderBadges(); renderPlans(); updateDots();
      if (mode === 'plan') { view = null; current = null; serveNext(); }
    };
    $('ladderDecline').onclick = function () {
      E.ladderDecline(state); save();
      $('ladderOverlay').classList.remove('show');
      updateDots();
    };

    $('btnPray').onclick = function (e) { e.stopPropagation(); startPray(); };
    $('btnPrayStretch').onclick = function (e) { e.stopPropagation(); stretchPray(); };
    $('prayLeft').onclick = function (e) { e.stopPropagation(); togglePausePray(); };   // v1.0.5
    $('btnPrayCancel').onclick = function (e) { e.stopPropagation(); endPray(); };      // v1.0.5
    $('praySlot').onclick = function (e) { e.stopPropagation(); };   // never serves a verse
    $('setPray').onchange = function (e) {
      state.settings.pray = e.target.checked; save(); prayVisible();
    };
    $('setPrayMins').onchange = function (e) { state.settings.praySecs = parseInt(e.target.value, 10); save(); };
    $('setPrayStretch').onchange = function (e) {
      state.settings.prayStretchSecs = parseInt(e.target.value, 10); save();
      $('btnPrayStretch').textContent = stretchLabel();
    };
    $('setPrayChime').onchange = function (e) { state.settings.prayChime = e.target.value; save(); };
    $('setPrayVol').onchange = function (e) { state.settings.prayVol = parseFloat(e.target.value); save(); };
    $('btnPrayTest').onclick = function () { chime(true); };
    $('setDryMins').onchange = function (e) { state.settings.dryMins = parseInt(e.target.value, 10); save(); };

    /* v1.0.9, item 12 — Android takes the hold back every time the page is
       hidden, so it is asked for again on the way back. Only ever while the
       prayer is actually running. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (E.prayExpired(state)) { finishPray(); return; }
      if (E.prayRunning(state)) { holdScreen(); paintPray(); }
    });

    /* v1.0.9, item 11 (v15.2 §8.6) — the anchor was measured on open only, so
       resizing the window while the menu stood left it where it had been. One
       line, cosmetic, and it was the last thing on the outstanding list. */
    window.addEventListener('resize', function () {
      if ($('menuSheet').classList.contains('show')) positionMenuAnchor();
    });

    /* v1.0.9, item 10 — the hidden ladder test mode. Seven taps on the James
       4:8 line. Hidden because it is a builder's tool, not a reader's. */
    var revealTaps = 0;
    $('aboutVerse').onclick = function () {
      if (++revealTaps < 7) return;
      revealTaps = 0;
      $('ladderTestSetting').style.display = '';
      $('ladderTestSetting').scrollIntoView({ block: 'nearest' });
    };
    $('btnLadderTest').onclick = function () {
      var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
      if (!plan || !plan.target) { $('ltNote').textContent = 'Start a plan with a daily number first — a Well has none, and the ladder has nothing to lighten.'; return; }
      var d = parseInt($('ltDays').value, 10) || 0, per = parseInt($('ltPer').value, 10) || 0;
      var offer = E.testSeedGap(state, d, per, null);
      save();
      if (!offer) { $('ltNote').textContent = 'No rung fits that gap — the first is five consecutive days below ' + plan.target + ' a day.'; return; }
      $('ltNote').textContent = 'Level ' + offer.level + ', the "' + offer.voice + '" voice, suggesting ' + offer.suggested + ' a day.';
      state.ladder.offer = offer; save(); openLadder();
    };
    $('btnLadderClear').onclick = function () {
      E.testSeedGap(state, 400, 0, null);
      state.ladder.offer = null; save();
      $('ltNote').textContent = 'Cleared. The day log holds only real reading again.';
      updateDots();
    };

    $('declareSave').onclick = function () {
      var n = Math.max(0, parseInt($('declareCount').value, 10) || 0);
      state.declared = n; state.declaredAsked = true;
      E.markBadgesSeen(state); save();
      $('declareOverlay').classList.remove('show'); updateDots();
    };
    $('declareSkip').onclick = function () {
      state.declared = 0; state.declaredAsked = true;
      E.markBadgesSeen(state); save();
      $('declareOverlay').classList.remove('show'); updateDots();
    };

    $('setSiteEnabled').onchange = function (e) { state.settings.siteEnabled = e.target.checked; save(); };
    $('setSiteMins').onchange = function (e) {
      state.settings.siteMins = Math.max(1, parseInt(e.target.value, 10) || 20); save();
    };
    $('setMomentMins').onchange = function (e) {
      state.settings.momentMins = parseInt(e.target.value, 10) || 0; save(); armMoment();
    };
    $('setMomentSource').onchange = function (e) { state.settings.momentSource = e.target.value; save(); };
    $('setShowNotes').onchange = function (e) {   // v13
      state.settings.showNotes = e.target.checked; save();
      var r = shownRef(); if (r) showVerse(r, $('verseFoot').textContent);
    };
    $('btnResetCard').onclick = function () {     // v13
      state.settings.cardPos = null; save();
      $('backupNote').textContent = 'Verse card position reset — it will appear at the bottom again.';
    };

    /* WEB BUILD — Quick access. The ⋮ menu's two items, wired to the very same
       functions the menu calls, so nothing can drift between the two paths. */
    $('setBadges').onclick = function () { openBadges(); };
    $('setCatchUp').onclick = function () { openCatchUp(state.activePlanId); };

    // Backup
    $('btnCopyBackup').onclick = function () {
      // v1.1.0 — the room travels with the code, sealed with the word (v0.4 §9).
      backupCode(function (code) {
        var done = function () { $('backupNote').textContent = 'Backup code copied. Keep it somewhere safe — notes, email to yourself, anywhere.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, function () { $('backupBox').value = code; done(); });
        } else { $('backupBox').value = code; done(); }
      });
    };
    /* v1.0.9, Decision 86 — the second door. COPY serves a transfer you are
       making now; SAVE THE FILE serves loss, where there is no second device to
       paste into and nothing to scan from. Neither covers the other.
       Recorded honestly: a phone backs files up to Google or iCloud on its own.
       That is exactly why it survives a dead phone, and it is the first time
       anything in this line sits on someone else's server — encrypted and
       useless to them, but there. Taken with open eyes, and said on the screen. */
    /* v1.1.1, Decision 120 — reading a saved file back in.
       A file the reader picks himself needs no manifest permission: the picker
       IS the permission, granted per file at the moment he chooses it. So this
       costs nothing in the review and adds nothing to `permissions`.
       It deliberately does NOT restore. It fills the same box a paste would
       fill, and the man still chooses Merge or Replace — the two doors he
       already knows, one of which wipes the device. A button that read a file
       and acted on it in one go would be a Replace with no deliberate act in
       front of it. */
    $('btnLoadFile').onclick = function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.txt,text/plain';
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var text = String(r.result || '').trim();
          if (!text) { $('backupNote').textContent = 'That file is empty. Nothing was changed.'; return; }
          $('backupBox').value = text;
          /* codeKind() is deliberately TOLERANT — it answers 'bb1' for anything
             it does not recognise, so that a real code whose prefix was lost in
             a paste is still tried rather than refused. That makes it useless
             for telling a shopping list from a backup, so the parser itself is
             the test here, exactly as readCode() does it below. */
          if (E.importCode(text)) {
            $('backupNote').textContent = 'Loaded from ' + f.name + '. Nothing has changed yet — choose Merge or Replace.';
          } else if (E.codeKind(text) === 'newer') {
            // Named, never a generic "invalid" — Decision 85's reasoning. A man
            // told his only copy is rubbish may throw it away.
            $('backupNote').textContent = 'That code came from a newer DrawNigh than this one. It is in the box, but this version cannot read it. Your file is untouched.';
          } else {
            $('backupNote').textContent = 'That file does not hold a DrawNigh code that this version can read. Nothing was changed.';
          }
        };
        r.onerror = function () { $('backupNote').textContent = 'That file could not be read. Nothing was changed.'; };
        r.readAsText(f);
      };
      inp.click();
    };
    $('btnSaveBackup').onclick = function () {
      backupCode(function (code) {
      try {
        var blob = new Blob([code], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'drawnigh-' + E.todayStr() + '.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        $('backupNote').textContent = 'Saved as drawnigh-' + E.todayStr() + '.txt, wherever your browser puts downloads.';
      } catch (e) {
        $('backupBox').value = code;
        $('backupNote').textContent = 'This browser would not save a file. The code is in the box instead — copy it from there.';
      }
      });
    };

    // v13 — two clearly-named doors. Merge ADDS (safe in both directions,
    // and a stale code can never destroy good progress). Replace overwrites,
    // which is what you want after losing a phone.
    //
    // v1.0.9, Decision 85 — a code from a newer DrawNigh is refused BY NAME.
    // His code is untouched and unblamed; a generic "invalid" is a lie that
    // could make a man throw away his only copy.
    function readCode() {
      var raw = $('backupBox').value;
      var st = E.importCode(raw);
      if (st) return st;
      var kind = E.codeKind(raw);
      $('backupNote').textContent = (kind === 'newer')
        ? 'That code was made by a newer version of DrawNigh. Update DrawNigh, then paste it again — the code itself is fine, and nothing about it has been changed.'
        : 'That code could not be read. Check that the whole code was pasted, from BB2. or BB1. right to the end.';
      return null;
    }
    $('btnMerge').onclick = function () {
      var st = readCode(); if (!st) return;
      var sBefore = state.streak.days;
      state = E.mergeStates(state, st); save();
      $('backupNote').textContent = 'Merged. Nothing was lost — verses read on either device now count as read' +
        (state.streak.days > sBefore ? ', and your streak is now ' + state.streak.days + ' days' : '') + '.';
      renderBadges(); renderSettings();
      /* v1.1.3, F26 — reported by Dickson: after a Replace, "Make a room" did
         nothing until the tab was refreshed. The state was swapped whole, but
         the Secret Place block, the season line, the reminder and the badge
         placement were all still painted from the state that had just been
         thrown away, so the screen described a device that no longer existed.
         Repainted here with exactly the same calls the app makes at startup —
         a restored code should look like a fresh open, because that is what it
         is. Merge gets it too: it can bring a season, and it used to leave the
         old one on the reading screen. */
      closeRoom(); roomStatusLine(); applyBadgeChoice();
      renderSeasonLine(); renderRemindLine(); audioVisible(); scanVisible();
      view = null; current = null; serveNext();
    };
    $('btnRestore').onclick = function () {
      var st = readCode(); if (!st) return;
      if (!confirm('Replace everything on this device with this code? Anything read here and not in the code will be lost.\n\nIf you are moving between two devices you are still using, choose Merge instead.')) return;
      /* v1.0.9, item 3 — the gap is read BEFORE the state is saved, and that
         ordering is load-bearing: rollover() zeroes a streak whose last reading
         day is neither today nor yesterday, and it runs on every load. Ask
         afterwards and there is nothing left to ask about. */
      var info = E.gapInfo(st, null);
      state = st; save();
      $('backupNote').textContent = 'Progress restored. Welcome back.';
      renderBadges(); renderSettings();
      /* v1.1.3, F26 — reported by Dickson: after a Replace, "Make a room" did
         nothing until the tab was refreshed. The state was swapped whole, but
         the Secret Place block, the season line, the reminder and the badge
         placement were all still painted from the state that had just been
         thrown away, so the screen described a device that no longer existed.
         Repainted here with exactly the same calls the app makes at startup —
         a restored code should look like a fresh open, because that is what it
         is. Merge gets it too: it can bring a season, and it used to leave the
         old one on the reading screen. */
      closeRoom(); roomStatusLine(); applyBadgeChoice();
      renderSeasonLine(); renderRemindLine(); audioVisible(); scanVisible();
      view = null; current = null; serveNext();
      if (info.days > 0) askGap(info);
    };

    /* Decision 76 — the app has no server and nothing to verify against, so it
       says exactly that and lets the man answer for himself.
       Ruling 92 — a code carrying a date gets the real question; only a code
       genuinely without one gets the apology. */
    var gapPending = null;
    function askGap(info) {
      gapPending = info;
      var d = info.days;
      $('gapText').textContent = info.dated
        ? 'This code was last used on ' + longDate(info.anchor) + '. That leaves ' + d.toLocaleString() +
          (d === 1 ? ' day' : ' days') + ' DrawNigh has no record of, and no way to check. Was a verse of Scripture read on every one of them — here, in any other Bible, or in any book at all?'
        : 'This code predates DrawNigh keeping dates, so there is no way to tell when it was made. Your streak comes back as it stood, and the counting begins again today.';
      $('gapYes').style.display = info.dated ? '' : 'none';
      $('gapNo').textContent = info.dated ? 'No, it broke' : 'I understand';
      $('gapOverlay').classList.add('show');
    }
    $('gapYes').onclick = function () {
      E.gapClaim(state, gapPending, true, null); save();
      $('gapOverlay').classList.remove('show');
      $('backupNote').textContent = 'Restored, and the days are counted. Your streak stands at ' + state.streak.days + '.';
      renderBadges(); renderSettings();
    };
    $('gapNo').onclick = function () {
      E.gapClaim(state, gapPending, false, null); save();
      $('gapOverlay').classList.remove('show');
      renderBadges(); renderSettings();
    };
    /* Decision 77 — the door never seals. Decision 78 — and it never costs a
       man a day he really read. */
    $('btnConfess').onclick = function () {
      if (!state.gapClaim) return;
      if (!confirm('Set the streak to the days you have truly read since ' + longDate(state.gapClaim.at) + '?\n\nNothing you really read is taken from you.')) return;
      var n = E.confessGap(state, null); save();
      $('backupNote').textContent = 'Recalibrated. Your streak stands at ' + n + ' — the days you actually read.';
      renderBadges(); renderSettings();
    };

    $('wellAgain').onclick = function () {
      var p = E.getPlan(state, wellPending); if (!p) return;
      E.wellContinue(state, p); save();
      $('wellOverlay').classList.remove('show');
      renderPlans(); renderBadges(); view = null; current = null; serveNext();
    };
    $('wellStop').onclick = function () {
      var p = E.getPlan(state, wellPending); if (!p) return;
      var name = p.name, laps = (p.laps || 0) + 1;
      E.wellEnd(state, p); save();
      $('wellOverlay').classList.remove('show');
      renderPlans(); renderBadges();
      switchScreen('plans');
      toastVerse(name + ' drawn ' + laps + (laps === 1 ? ' time' : ' times') +
        '. The Well is closed; the count stays with the book.', 'Enough for now');
    };

    $('vodClose').onclick = function () {
      $('vodOverlay').classList.remove('show');
      maybeAskDeclare();          // v1.0.4: never two overlays at once
    };
  }

  // ---------- Start ----------
  Promise.all([
    fetch('bible.json').then(function (r) { return r.json(); }),
    fetch('notes.json').then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (both) {
    BIBLE = both[0];
    NOTES = both[1];
    E.loadState(function (st) {
      state = st; save(); // persist rollover
      wire();
      paintVersion();
      setPills();
      renderBadges();
      prayVisible();            // v1.0.4
      resumePrayOnLoad();       // v1.0.9 — Decision 51: a prayer survives being closed
      E.recordMilestones(state);// v1.0.9 — and dates anything reached while away
      updateDots();             // v1.0.4
      // v1.1.0
      renderSeasonLine();
      renderRemindLine();
      audioVisible();
      scanVisible();
      roomStatusLine();
      applyBadgeChoice();
      serveNext();
      greetVOD();
      armMoment();
      maybeAskDeclare();        // v1.0.4
      // deep links from popup/content: #plans etc.
      var h = location.hash.replace('#', '');
      if (['books', 'plans', 'favs', 'settings'].indexOf(h) >= 0) switchScreen(h);
    });
  });
})();
