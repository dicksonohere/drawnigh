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

  function save() { E.saveState(state); }

  // ---------- Rendering ----------
  function renderBadges() {
    var plan = state.activePlanId ? E.getPlan(state, state.activePlanId) : null;
    // v9: two honest counters. 🎯 = verses credited to the active plan today
    // (owns the progress bar); 📖 = everything read today, anywhere.
    var bp = $('badgePlan');
    if (plan) {
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

  function prayVisible() {
    var on = !!(state.settings && state.settings.pray);
    $('praySlot').style.display = on ? '' : 'none';
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
  function holdScreen() {
    if (!E.prayRunning(state)) { return releaseScreen(); }
    if (wakeLock || !navigator.wakeLock) return;
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        // The prayer may have ended while the request was in the air.
        if (!E.prayRunning(state)) { try { l.release(); } catch (e) {} return; }
        wakeLock = l;
        l.addEventListener('release', function () { wakeLock = null; });
      }, function () { /* refused: nothing changes, the prayer runs on */ });
    } catch (e) { /* not offered here */ }
  }
  function releaseScreen() {
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
  }
  // Tapping the countdown holds it where it is; tapping again carries on from
  // exactly there. A held prayer is held for as long as it needs to be.
  function togglePausePray() {
    if (!E.prayActive(state)) return;
    if (E.prayIsPaused(state)) { E.prayResume(state); bookChime(E.prayLeftMs(state)); holdScreen(); }
    else { E.prayPause(state); cancelChime(); releaseScreen(); }
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
  }
  // A prayer that ran out — whether or not anyone was looking.
  function finishPray() {
    var wasBooked = bookedChime.length > 0;
    E.prayCancel(state); save();
    releaseScreen();
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
    var mode = (state.settings && state.settings.prayChime) || 'single';
    var vol = (state.settings && state.settings.prayVol);
    if (vol === undefined) vol = 0.5;
    return { mode: mode, vol: vol, times: (mode === 'double') ? [0, 0.42] : [0] };
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
  function renderMilestones() {
    var ms = (state.milestones || []).slice().reverse();
    var wrap = $('bMilestones'), list = $('bMilestoneList');
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!ms.length) { wrap.style.display = 'none'; return; }
    ms.forEach(function (m) {
      var row = document.createElement('div'); row.className = 'milestone-row';
      var a = document.createElement('b'); a.textContent = milestoneName(m.id);
      var c = document.createElement('span'); c.textContent = longDate(m.date);
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
  function showBookCard(b) {
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
    $('pbCustomField').style.display = (!well && $('pbDays').value === 'custom') ? 'block' : 'none';
    $('pbWellNote').style.display = well ? '' : 'none';
    $('pbCalc').style.display = well ? 'none' : '';
    pbCalc();
  }
  function pbDaysVal() {
    // Blank until the user decides — no quietly pre-chosen duration.
    var v = $('pbDays').value;
    if (v === '') return null;
    if (v === 'custom') {
      var n = parseInt($('pbCustom').value, 10);
      return n >= 1 ? n : null;
    }
    return parseInt(v, 10);
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
      $('pbCalc').textContent = def.name + ' has ' + pv0.size.toLocaleString() +
        ' verses. Choose how long you want to take.';
      return;
    }
    var pv = E.previewPlan(def.type, def.books, state.favorites.length, days);
    $('pbCalc').textContent = def.name + ' has ' + pv.size.toLocaleString() +
      ' verses. To finish in ' + days + ' day' + (days === 1 ? '' : 's') +
      ' you need ' + pv.perDay.toLocaleString() + ' verses/day. Lock it in?';
  }
  function pbReset() {
    // A truly fresh sheet every time the form opens — nothing carries over.
    $('pbScope').value = '';
    $('pbBook').value = '';
    document.querySelectorAll('#pbGroup input').forEach(function (i) { i.checked = false; });
    $('pbDays').value = '';
    $('pbCustom').value = '';
    $('pbBookField').style.display = 'none';
    $('pbGroupField').style.display = 'none';
    $('pbCustomField').style.display = 'none';
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
    var seen = {}, rows = [];
    function add(r, isGem, isFav) {
      var k = r.join(',');
      if (seen[k]) { seen[k].gem = seen[k].gem || isGem; seen[k].fav = seen[k].fav || isFav; return; }
      seen[k] = { ref: r, gem: isGem, fav: isFav }; rows.push(seen[k]);
    }
    (state.gems || []).forEach(function (r) { add(r, true, false); });
    (state.favorites || []).forEach(function (r) { add(r, false, true); });
    rows.reverse();                                   // newest first
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
    $('setPrayVol').value = String(Math.round((s.prayVol === undefined ? 0.5 : s.prayVol) * 100));
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
  }

  function setPills() {
    document.querySelectorAll('.pill').forEach(function (p) {
      p.classList.toggle('on', p.dataset.mode === mode);
    });
    // v1.0.7: the jump row is back on the main screen — show it only in Book mode.
    $('bookPicker').classList.toggle('show', mode === 'book');
    updateCatchChip();
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
      $('pbCustomField').style.display = $('pbDays').value === 'custom' ? 'block' : 'none';
      pbCalc();
    };
    $('pbCustom').oninput = pbCalc;
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
    $('setPrayVol').onchange = function (e) { state.settings.prayVol = parseInt(e.target.value, 10) / 100; save(); };
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

    // Backup
    $('btnCopyBackup').onclick = function () {
      var code = E.exportCode(state);
      var done = function () { $('backupNote').textContent = 'Backup code copied. Keep it somewhere safe — notes, email to yourself, anywhere.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () { $('backupBox').value = code; done(); });
      } else { $('backupBox').value = code; done(); }
    };
    /* v1.0.9, Decision 86 — the second door. COPY serves a transfer you are
       making now; SAVE THE FILE serves loss, where there is no second device to
       paste into and nothing to scan from. Neither covers the other.
       Recorded honestly: a phone backs files up to Google or iCloud on its own.
       That is exactly why it survives a dead phone, and it is the first time
       anything in this line sits on someone else's server — encrypted and
       useless to them, but there. Taken with open eyes, and said on the screen. */
    $('btnSaveBackup').onclick = function () {
      var code = E.exportCode(state);
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
      renderBadges(); renderSettings(); view = null; current = null; serveNext();
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
      renderBadges(); renderSettings(); view = null; current = null; serveNext();
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
      setPills();
      renderBadges();
      prayVisible();            // v1.0.4
      resumePrayOnLoad();       // v1.0.9 — Decision 51: a prayer survives being closed
      E.recordMilestones(state);// v1.0.9 — and dates anything reached while away
      updateDots();             // v1.0.4
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
