/* DrawNigh — sync.js (v1.1.5, Decisions 230–251)

   YOUR READING, IN YOUR OWN GOOGLE DRIVE.
   This file is the road to Google and nothing else: signing in, and keeping
   ONE small file in the hidden folder Google gives each app inside a reader's
   own Drive. What goes into that file, and how two copies combine, is decided
   in engine.js and app.js.

   What DrawNigh can reach, and what it cannot (Decision 230): it asks Google
   for one permission only — drive.appdata, "its own hidden folder". It cannot
   see, open or change any other file in the reader's Drive, and it asks for
   no email, no contacts and no photos. The copy goes between the reader's
   device and Google; it never passes through SpiritWrought or the Outreach,
   because there is no server of ours for it to pass through.

   Google's sign-in hands the app a key that lasts one hour and cannot be
   renewed in the background by a page with no server. So when it has run out,
   the app asks Google again WITHOUT showing anything (prompt=none). On the
   website that is a quick hop to Google and back as the app opens; in the
   add-on it is a tab opened behind the reader and closed again by itself.
   If Google wants the reader to choose or agree to something, nothing is
   forced: the app says sync is waiting, and one tap signs in again.

   The website gets its key back at its own address. The add-on gets it back
   at a small "hand-back" page on the DrawNigh website (handback.html), where
   the add-on's own content script reads it and passes it straight to the
   add-on. A key is only accepted with the random "state" this device sent
   with the request, so no other page can slip one in. */
(function (root) {
  'use strict';

  var CFG = {
    clientWeb: '119480319680-cmgnirh7ag2akknfuiaftar6ltru6h9j.apps.googleusercontent.com',
    clientExt: '119480319680-hai6g7mruao1dafpfmahaf6alpleftk5.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    api: 'https://www.googleapis.com',
    revoke: 'https://oauth2.googleapis.com/revoke',
    handback: 'https://dicksonohere.github.io/drawnigh/handback.html',
    file: 'drawnigh-sync.json',
    waitSilent: 25000,          // a sign-in nobody sees is given this long
    waitAsk: 10 * 60 * 1000     // a sign-in the reader is doing himself, this long
  };
  /* The build's own tests use a stand-in Google running on the test machine.
     These addresses can be swapped ONLY when the page itself is on this
     computer's own address — never on the real website, never in the add-on. */
  try {
    if (root.DN_SYNC_TEST && typeof location !== 'undefined' &&
        /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      for (var k in root.DN_SYNC_TEST) CFG[k] = root.DN_SYNC_TEST[k];
    }
  } catch (e) {}

  var TOKEN_KEY = 'drawnigh-auth', PENDING_KEY = 'drawnigh-auth-pending', RESULT_KEY = 'drawnigh-auth-result';
  var isExt = false, XA = null;

  function extApi() {
    if (typeof browser !== 'undefined' && browser.storage && browser.runtime) return browser;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime) return chrome;
    return null;
  }
  function kvGet(key) {
    if (isExt && XA) {
      return new Promise(function (res) {
        var r = XA.storage.local.get(key, function (o) { res(o ? o[key] : undefined); });
        if (r && r.then) r.then(function (o) { res(o ? o[key] : undefined); }, function () { res(undefined); });
      });
    }
    try { var v = localStorage.getItem(key); return Promise.resolve(v ? JSON.parse(v) : undefined); }
    catch (e) { return Promise.resolve(undefined); }
  }
  function kvSet(key, val) {
    if (isExt && XA) {
      return new Promise(function (res) {
        var o = {}; o[key] = val;
        var r = XA.storage.local.set(o, function () { res(); });
        if (r && r.then) r.then(res, res);
      });
    }
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    return Promise.resolve();
  }
  function kvDel(key) {
    if (isExt && XA) {
      return new Promise(function (res) {
        var r = XA.storage.local.remove(key, function () { res(); });
        if (r && r.then) r.then(res, res);
      });
    }
    try { localStorage.removeItem(key); } catch (e) {}
    return Promise.resolve();
  }
  function randomState() {
    var a = new Uint8Array(16), s = '';
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < a.length; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  function parseHash(h) {
    var out = {};
    String(h || '').replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k2 = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      out[k2] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return out;
  }
  // The website's own address, as Google must be told it — without index.html,
  // so the Home Screen icon and the address bar come back to the same place.
  function webReturn() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }
  function signInUrl(opts) {
    var p = {
      client_id: isExt ? CFG.clientExt : CFG.clientWeb,
      redirect_uri: isExt ? CFG.handback : webReturn(),
      response_type: 'token',
      scope: CFG.scope,
      include_granted_scopes: 'true',
      state: opts.state
    };
    if (opts.silent) p.prompt = 'none';
    else if (opts.choose) p.prompt = 'select_account';
    if (opts.hint) p.login_hint = opts.hint;
    var q = [];
    for (var k in p) q.push(encodeURIComponent(k) + '=' + encodeURIComponent(p[k]));
    return CFG.authUrl + '?' + q.join('&');
  }
  function tokenFrom(q) {
    var secs = parseInt(q.expires_in, 10) || 3600;
    // Taken as running out a minute early, so a request never meets it dying.
    return { t: q.access_token, exp: Date.now() + secs * 1000 - 60000, scope: q.scope || '' };
  }
  function getToken() {
    return kvGet(TOKEN_KEY).then(function (tok) {
      return (tok && tok.t && tok.exp > Date.now()) ? tok : null;
    });
  }

  /* ---------- signing in ---------- */
  // Resolves {ok:true} or {error:'...'}. On the website the page leaves for
  // Google, so the promise never settles here; the answer is read when the
  // page comes back (takeRedirect).
  function signIn(opts) {
    opts = opts || {};
    var st = randomState();
    var pend = { state: st, at: Date.now(), silent: !!opts.silent };
    if (!isExt) {
      return kvSet(PENDING_KEY, pend).then(function () {
        location.assign(signInUrl({ state: st, silent: opts.silent, hint: opts.hint, choose: opts.choose }));
        return new Promise(function () {});
      });
    }
    return currentTabId().then(function (tabId) {
      pend.tab = tabId;
      return kvDel(RESULT_KEY).then(function () { return kvSet(PENDING_KEY, pend); });
    }).then(function () {
      return new Promise(function (resolve) {
        var done = false, timer = null;
        function finish(r) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { XA.storage.onChanged.removeListener(watch); } catch (e) {}
          resolve(r);
        }
        function watch(changes, area) {
          if (area && area !== 'local') return;
          var c = changes[RESULT_KEY];
          if (!c || !c.newValue || c.newValue.state !== st) return;
          finish(c.newValue.error ? { error: c.newValue.error } : { ok: true });
        }
        XA.storage.onChanged.addListener(watch);
        timer = setTimeout(function () { finish({ error: 'timeout' }); }, opts.silent ? CFG.waitSilent : CFG.waitAsk);
        try {
          var made = XA.tabs.create({ url: signInUrl({ state: st, silent: opts.silent, hint: opts.hint, choose: opts.choose }), active: !opts.silent });
          if (made && made.then) made.then(null, function () { finish({ error: 'tab' }); });
        } catch (e) { finish({ error: 'tab' }); }
      });
    });
  }
  function currentTabId() {
    return new Promise(function (res) {
      try {
        var r = XA.tabs.getCurrent(function (t) { res(t ? t.id : null); });
        if (r && r.then) r.then(function (t) { res(t ? t.id : null); }, function () { res(null); });
      } catch (e) { res(null); }
    });
  }
  /* The website, coming back from Google. Reads the answer out of the
     address, checks it was this device that asked, keeps the key, and clears
     the address so the key is not left in the history. */
  function takeRedirect() {
    if (isExt || typeof location === 'undefined') return Promise.resolve(null);
    var h = location.hash || '';
    if (!/(^|[#&])(access_token|error)=/.test(h)) return Promise.resolve(null);
    var q = parseHash(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return kvGet(PENDING_KEY).then(function (pend) {
      return kvDel(PENDING_KEY).then(function () {
        if (!pend || !q.state || pend.state !== q.state) return { error: 'state' };
        if (q.error) return { error: q.error, silent: !!pend.silent };
        if (!q.access_token) return { error: 'empty', silent: !!pend.silent };
        return kvSet(TOKEN_KEY, tokenFrom(q)).then(function () { return { ok: true, silent: !!pend.silent }; });
      });
    });
  }

  /* ---------- the one file ---------- */
  function call(method, path, body, ctype) {
    return getToken().then(function (tok) {
      if (!tok) { var e = new Error('auth'); e.auth = true; throw e; }
      var h = { Authorization: 'Bearer ' + tok.t };
      if (ctype) h['Content-Type'] = ctype;
      return fetch(CFG.api + path, { method: method, headers: h, body: body });
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        return kvDel(TOKEN_KEY).then(function () { var e = new Error('auth'); e.auth = true; e.status = res.status; throw e; });
      }
      if (res.status === 404) { var n = new Error('gone'); n.gone = true; throw n; }
      if (!res.ok) { var s = new Error('http'); s.status = res.status; throw s; }
      return res;
    }, function (err) {
      if (err && err.auth) throw err;
      var e = new Error('net'); e.net = true; throw e;
    });
  }
  function find() {
    var q = encodeURIComponent("name='" + CFG.file + "'");
    return call('GET', '/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,version,modifiedTime)&pageSize=10')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var f = (j && j.files) || [];
        if (!f.length) return null;
        // Should there ever be two, the most recently changed is the one.
        f.sort(function (a, b) { return (a.modifiedTime || '') < (b.modifiedTime || '') ? 1 : -1; });
        return { fileId: f[0].id, version: String(f[0].version || '') };
      });
  }
  // The file as it stands. `knownVersion`: if Drive's copy is still the one
  // this device last saw, it is not downloaded again.
  function read(knownVersion) {
    return find().then(function (meta) {
      if (!meta) return null;
      if (knownVersion && meta.version === String(knownVersion)) { meta.data = null; meta.same = true; return meta; }
      return call('GET', '/drive/v3/files/' + encodeURIComponent(meta.fileId) + '?alt=media')
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          try { meta.data = JSON.parse(txt); } catch (e) { meta.data = null; meta.broken = true; }
          return meta;
        });
    });
  }
  function write(fileId, data) {
    var body = JSON.stringify(data);
    if (fileId) {
      return call('PATCH', '/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=id,version',
        body, 'application/json').then(function (r) { return r.json(); })
        .then(function (j) { return { fileId: j.id || fileId, version: String(j.version || '') }; });
    }
    var b = 'dn' + randomState();
    var multi = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: CFG.file, parents: ['appDataFolder'], mimeType: 'application/json' }) +
      '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
    return call('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,version', multi,
      'multipart/related; boundary=' + b).then(function (r) { return r.json(); })
      .then(function (j) { return { fileId: j.id, version: String(j.version || '') }; });
  }
  function remove(fileId) {
    var go = fileId ? Promise.resolve({ fileId: fileId }) : find();
    return go.then(function (m) {
      if (!m) return true;
      return call('DELETE', '/drive/v3/files/' + encodeURIComponent(m.fileId)).then(function () { return true; },
        function (e) { if (e && e.gone) return true; throw e; });
    });
  }
  // Which Google account this is — shown on the screen, and handed back to
  // Google as a hint so a quiet sign-in does not stop at a list of accounts.
  function who() {
    return call('GET', '/drive/v3/about?fields=user(emailAddress)').then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.user && j.user.emailAddress) || ''; }, function () { return ''; });
  }
  // Turning sync off: the key is handed back to Google, so DrawNigh leaves the
  // reader's list of connected apps, and this device forgets it.
  function forget() {
    return getToken().then(function (tok) {
      if (tok) {
        try { fetch(CFG.revoke + '?token=' + encodeURIComponent(tok.t), { method: 'POST', mode: 'no-cors' }).catch(function () {}); } catch (e) {}
      }
      return kvDel(TOKEN_KEY);
    });
  }

  var Drive = {
    configure: function (asExt) { isExt = !!asExt; XA = isExt ? extApi() : null; },
    hasToken: function () { return getToken().then(function (t) { return !!t; }); },
    signIn: signIn, takeRedirect: takeRedirect,
    read: read, write: write, remove: remove, who: who, forget: forget,
    FILE: CFG.file
  };
  root.DrawNighDrive = Drive;
})(typeof self !== 'undefined' ? self : this);
