/* VClock.pro — online alarm clock, timer, stopwatch, world clock, countdown & pomodoro.
   Vanilla JS, no dependencies. All timing runs locally in the browser. */
(function () {
  'use strict';

  /* ---------------- storage (safe) ---------------- */
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('vclock.' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('vclock.' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  /* ---------------- sound engine ---------------- */
  var Sound = (function () {
    var ctx = null, timer = null, gain = null, unlocked = false;

    var PATTERNS = {
      beep:    { period: 1.0,  notes: [{f: 880, t: 0,    d: 0.16, w: 'square'}, {f: 880, t: 0.28, d: 0.16, w: 'square'}] },
      digital: { period: 1.2,  notes: [{f: 1046, t: 0,   d: 0.09, w: 'square'}, {f: 1046, t: 0.15, d: 0.09, w: 'square'}, {f: 1046, t: 0.30, d: 0.09, w: 'square'}] },
      bell:    { period: 0.9,  notes: [{f: 1200, t: 0,   d: 0.07, w: 'triangle'}, {f: 950, t: 0.09, d: 0.07, w: 'triangle'}, {f: 1200, t: 0.18, d: 0.07, w: 'triangle'}, {f: 950, t: 0.27, d: 0.07, w: 'triangle'}, {f: 1200, t: 0.36, d: 0.07, w: 'triangle'}, {f: 950, t: 0.45, d: 0.07, w: 'triangle'}] },
      chime:   { period: 2.6,  notes: [{f: 660, t: 0,    d: 1.1,  w: 'sine'}, {f: 880, t: 0.5, d: 1.1, w: 'sine'}, {f: 1100, t: 1.0, d: 1.3, w: 'sine'}] },
      siren:   { period: 1.6,  sweep: true },
      soft:    { period: 3.0,  notes: [{f: 523, t: 0,    d: 0.5,  w: 'sine'}, {f: 659, t: 0.55, d: 0.5, w: 'sine'}, {f: 784, t: 1.1, d: 0.9, w: 'sine'}] }
    };

    function makeCtx() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = 0.5;
      gain.connect(ctx.destination);
      return ctx;
    }

    function unlock() {
      var c = makeCtx();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      if (!unlocked) {
        // silent blip to satisfy autoplay policies
        var o = c.createOscillator(), g = c.createGain();
        g.gain.value = 0.0001;
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.02);
        unlocked = true;
      }
    }

    function note(at, n) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n.w || 'sine';
      o.frequency.setValueAtTime(n.f, at);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, at + n.d);
      o.connect(g); g.connect(gain);
      o.start(at); o.stop(at + n.d + 0.05);
    }

    function sweep(at, dur) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(440, at);
      o.frequency.linearRampToValueAtTime(1000, at + dur / 2);
      o.frequency.linearRampToValueAtTime(440, at + dur);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.85, at + 0.08);
      g.gain.setValueAtTime(0.85, at + dur - 0.1);
      g.gain.linearRampToValueAtTime(0, at + dur);
      o.connect(g); g.connect(gain);
      o.start(at); o.stop(at + dur + 0.05);
    }

    function cycle(name) {
      var p = PATTERNS[name] || PATTERNS.beep;
      var at = ctx.currentTime + 0.03;
      if (p.sweep) sweep(at, p.period - 0.15);
      else p.notes.forEach(function (n) { note(at + n.t, n); });
    }

    return {
      unlock: unlock,
      volume: function (v) { if (gain) gain.gain.value = Math.max(0, Math.min(1, v)); },
      preview: function (name) {
        unlock();
        if (!ctx) return;
        stopAll();
        cycle(name);
      },
      play: function (name) {
        unlock();
        if (!ctx) return;
        this.stop();
        cycle(name);
        var p = PATTERNS[name] || PATTERNS.beep;
        timer = setInterval(function () { cycle(name); }, p.period * 1000);
      },
      stop: function () { if (timer) { clearInterval(timer); timer = null; } },
      list: Object.keys(PATTERNS)
    };
    function stopAll() { if (timer) { clearInterval(timer); timer = null; } }
  })();

  // unlock audio on first interaction anywhere
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function once() {
      Sound.unlock();
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (e2) { window.removeEventListener(e2, once); });
    }, { once: true, passive: true });
  });

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n, l) { n = String(Math.floor(Math.abs(n))); while (n.length < (l || 2)) n = '0' + n; return n; }

  var baseTitle = document.title;
  var titleTimer = null;
  function flashTitle(msg) {
    stopFlash();
    var on = false;
    titleTimer = setInterval(function () { on = !on; document.title = on ? '⏰ ' + msg : baseTitle; }, 900);
    document.title = '⏰ ' + msg;
  }
  function stopFlash() { if (titleTimer) { clearInterval(titleTimer); titleTimer = null; } document.title = baseTitle; }
  function setTitle(t) { if (!titleTimer) document.title = t; }

  var wakeLock = null;
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; w.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
      } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  function notify(title, body) {
    try {
      if (window.Notification && Notification.permission === 'granted') new Notification(title, { body: body });
    } catch (e) {}
  }
  function askNotify(cb) {
    try {
      if (!window.Notification) return cb(false);
      if (Notification.permission === 'granted') return cb(true);
      Notification.requestPermission().then(function (p) { cb(p === 'granted'); });
    } catch (e) { cb(false); }
  }

  function soundOptions(sel, selected) {
    if (!sel) return;
    var names = { beep: 'Beep', digital: 'Digital', bell: 'Alarm Bell', chime: 'Chime', siren: 'Siren', soft: 'Soft Wake' };
    Sound.list.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = names[k] || k;
      if (k === selected) o.selected = true;
      sel.appendChild(o);
    });
  }

  /* ---------------- shared ring UI ---------------- */
  function ringUI(opts) {
    // opts: {display, stopBtn, snoozeBtn, label, sound}
    var el = opts.display;
    if (el) el.classList.add('ring');
    Sound.play(opts.sound || 'beep');
    flashTitle(opts.label || 'Time is up!');
    notify(opts.label || 'Time is up!', opts.body || 'VClock');
    if (opts.onRing) opts.onRing();
  }
  function ringStop(display) {
    Sound.stop();
    stopFlash();
    if (display) display.classList.remove('ring');
  }

  /* ================= CLOCK (current time) ================= */
  function initClock() {
    var el = $('#nowClock');
    if (!el) return;
    var dateEl = $('#nowDate');
    var h12 = store.get('h12', true);
    var toggle = $('#fmtToggle');
    if (toggle) {
      toggle.checked = !h12;
      toggle.addEventListener('change', function () { h12 = !toggle.checked; store.set('h12', h12); tick(); });
    }
    function tick() {
      var d = new Date(), h = d.getHours(), ap = '';
      if (h12) { ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; }
      el.innerHTML = pad(h) + ':' + pad(d.getMinutes()) + '<span class="ms">:' + pad(d.getSeconds()) + '</span>' + (ap ? '<span class="ampm">' + ap + '</span>' : '');
      if (dateEl) dateEl.textContent = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    tick(); setInterval(tick, 1000);
  }

  /* ================= ALARM CLOCK ================= */
  function initAlarm() {
    var wrap = $('#alarmTool');
    if (!wrap) return;
    var hEl = $('#alHour'), mEl = $('#alMin'), apEl = $('#alAmPm'),
        labelEl = $('#alLabel'), soundEl = $('#alSound'), setBtn = $('#alSet'),
        listEl = $('#alarmList'), display = $('#nowClock'), stopBtn = $('#alStop'),
        snoozeBtn = $('#alSnooze'), statusEl = $('#alStatus'), notifyEl = $('#alNotify');

    soundOptions(soundEl, store.get('alSound', 'beep'));
    var alarms = store.get('alarms', []);
    var ringing = null;

    var preH = wrap.getAttribute('data-hour'), preM = wrap.getAttribute('data-min'), preAp = wrap.getAttribute('data-ampm');
    if (preH) { hEl.value = preH; mEl.value = preM || '00'; if (apEl && preAp) apEl.value = preAp; }
    else {
      var n = new Date(); n.setMinutes(n.getMinutes() + 10);
      var h = n.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
      hEl.value = pad(h); mEl.value = pad(n.getMinutes()); if (apEl) apEl.value = ap;
    }

    function to24(h, ap) { h = parseInt(h, 10) % 12; return ap === 'PM' ? h + 12 : h; }
    function fmt(a) {
      var h = a.h % 12 || 12;
      return pad(h) + ':' + pad(a.m) + ' ' + (a.h >= 12 ? 'PM' : 'AM');
    }
    function save() { store.set('alarms', alarms); render(); }

    function render() {
      if (!listEl) return;
      if (!alarms.length) { listEl.innerHTML = '<p class="center" style="color:#94a3b8;margin-top:18px">No alarms set yet. Choose a time above and press <strong>Set Alarm</strong>.</p>'; return; }
      listEl.innerHTML = '<table style="width:100%;border-collapse:collapse"><tbody>' + alarms.map(function (a, i) {
        return '<tr style="border-bottom:1px solid rgba(255,255,255,.1)">' +
          '<td style="padding:11px 8px;font-size:1.4rem;font-weight:800;color:#fff;font-variant-numeric:tabular-nums">' + fmt(a) + '</td>' +
          '<td style="padding:11px 8px;color:#cbd5e1">' + (a.label ? String(a.label).replace(/[<>]/g, '') : 'Alarm') + '</td>' +
          '<td style="padding:11px 8px;text-align:right"><button class="btn ghost sm" data-del="' + i + '">Remove</button></td></tr>';
      }).join('') + '</tbody></table>';
      $$('[data-del]', listEl).forEach(function (b) {
        b.addEventListener('click', function () { alarms.splice(parseInt(b.getAttribute('data-del'), 10), 1); save(); });
      });
    }

    setBtn.addEventListener('click', function () {
      Sound.unlock();
      var h = to24(hEl.value || '7', apEl ? apEl.value : 'AM');
      var m = Math.max(0, Math.min(59, parseInt(mEl.value || '0', 10)));
      alarms.push({ h: h, m: m, label: (labelEl.value || '').slice(0, 60), sound: soundEl.value, fired: '' });
      store.set('alSound', soundEl.value);
      labelEl.value = '';
      save();
      if (statusEl) { statusEl.textContent = 'Alarm set for ' + fmt({ h: h, m: m }) + ' — keep this tab open.'; }
      if (notifyEl && notifyEl.checked) askNotify(function () {});
      keepAwake(true);
    });

    if (soundEl) soundEl.addEventListener('change', function () { Sound.preview(soundEl.value); });

    function startRing(a) {
      ringing = a;
      wrap.classList.add('is-ringing');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (snoozeBtn) snoozeBtn.classList.remove('hidden');
      if (statusEl) statusEl.textContent = (a.label || 'Alarm') + ' — ringing now!';
      ringUI({ display: display, sound: a.sound, label: a.label || 'Alarm!', body: 'VClock alarm' });
    }
    function stopRing() {
      ringing = null;
      wrap.classList.remove('is-ringing');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (snoozeBtn) snoozeBtn.classList.add('hidden');
      if (statusEl) statusEl.textContent = '';
      ringStop(display);
      keepAwake(false);
    }
    if (stopBtn) stopBtn.addEventListener('click', stopRing);
    if (snoozeBtn) snoozeBtn.addEventListener('click', function () {
      var mins = parseInt(($('#alSnoozeMin') || {}).value || '9', 10);
      var d = new Date(Date.now() + mins * 60000);
      alarms.push({ h: d.getHours(), m: d.getMinutes(), label: 'Snooze', sound: ringing ? ringing.sound : 'beep', fired: '' });
      stopRing(); save();
      if (statusEl) statusEl.textContent = 'Snoozed for ' + mins + ' minutes.';
    });

    setInterval(function () {
      if (ringing) return;
      var d = new Date(), key = d.toDateString() + ' ' + d.getHours() + ':' + d.getMinutes();
      for (var i = 0; i < alarms.length; i++) {
        var a = alarms[i];
        if (a.h === d.getHours() && a.m === d.getMinutes() && a.fired !== key) {
          a.fired = key; store.set('alarms', alarms);
          startRing(a);
          break;
        }
      }
    }, 1000);

    render();
  }

  /* ================= TIMER ================= */
  function initTimer() {
    var wrap = $('#timerTool');
    if (!wrap) return;
    var disp = $('#tmDisplay'), hEl = $('#tmH'), mEl = $('#tmM'), sEl = $('#tmS'),
        startBtn = $('#tmStart'), pauseBtn = $('#tmPause'), resetBtn = $('#tmReset'),
        stopBtn = $('#tmStop'), soundEl = $('#tmSound'), statusEl = $('#tmStatus'),
        ringEl = $('#tmRing'), setter = $('#tmSetter');

    soundOptions(soundEl, store.get('tmSound', 'beep'));

    var total = 0, remain = 0, endAt = 0, iv = null, state = 'idle';

    var pre = parseInt(wrap.getAttribute('data-seconds') || '0', 10);
    if (pre > 0) {
      hEl.value = pad(Math.floor(pre / 3600));
      mEl.value = pad(Math.floor(pre / 60) % 60);
      sEl.value = pad(pre % 60);
    }

    function readInputs() {
      var h = parseInt(hEl.value || '0', 10) || 0,
          m = parseInt(mEl.value || '0', 10) || 0,
          s = parseInt(sEl.value || '0', 10) || 0;
      return Math.max(0, h * 3600 + m * 60 + s);
    }
    function fmt(sec) {
      sec = Math.max(0, Math.ceil(sec));
      var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
      return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
    }
    function paint() {
      disp.textContent = fmt(remain);
      if (ringEl && total > 0) {
        var c = 2 * Math.PI * 54;
        ringEl.style.strokeDasharray = c;
        ringEl.style.strokeDashoffset = c * (1 - remain / total);
      }
      if (state === 'running') setTitle(fmt(remain) + ' — Timer | VClock');
    }
    function tick() {
      remain = (endAt - Date.now()) / 1000;
      if (remain <= 0) { remain = 0; paint(); finish(); return; }
      paint();
    }
    function finish() {
      clearInterval(iv); iv = null; state = 'done';
      if (setter) setter.classList.add('hidden');
      startBtn.classList.add('hidden'); pauseBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden'); resetBtn.classList.remove('hidden');
      if (statusEl) statusEl.textContent = 'Time is up!';
      ringUI({ display: disp, sound: soundEl.value, label: 'Timer finished!', body: fmt(total) + ' timer is done' });
      keepAwake(false);
    }
    function start() {
      Sound.unlock();
      if (state === 'paused') { endAt = Date.now() + remain * 1000; }
      else {
        total = readInputs();
        if (total <= 0) { if (statusEl) statusEl.textContent = 'Please set a duration first.'; return; }
        remain = total; endAt = Date.now() + total * 1000;
      }
      state = 'running';
      store.set('tmSound', soundEl.value);
      if (setter) setter.classList.add('hidden');
      startBtn.classList.add('hidden'); pauseBtn.classList.remove('hidden'); resetBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      if (statusEl) statusEl.textContent = 'Running — you can leave this tab open in the background.';
      paint();
      clearInterval(iv); iv = setInterval(tick, 100);
      keepAwake(true);
    }
    function pause() {
      if (state !== 'running') return;
      state = 'paused'; clearInterval(iv); iv = null;
      remain = Math.max(0, (endAt - Date.now()) / 1000);
      pauseBtn.classList.add('hidden'); startBtn.classList.remove('hidden');
      startBtn.querySelector('.lbl').textContent = 'Resume';
      if (statusEl) statusEl.textContent = 'Paused.';
      stopFlash(); keepAwake(false);
    }
    function reset() {
      clearInterval(iv); iv = null; state = 'idle';
      ringStop(disp);
      remain = 0; total = 0;
      if (setter) setter.classList.remove('hidden');
      startBtn.classList.remove('hidden'); startBtn.querySelector('.lbl').textContent = 'Start';
      pauseBtn.classList.add('hidden'); resetBtn.classList.add('hidden'); stopBtn.classList.add('hidden');
      if (statusEl) statusEl.textContent = '';
      remain = readInputs(); total = remain; paint();
      keepAwake(false);
    }

    startBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', pause);
    resetBtn.addEventListener('click', reset);
    if (stopBtn) stopBtn.addEventListener('click', function () { ringStop(disp); reset(); });
    if (soundEl) soundEl.addEventListener('change', function () { Sound.preview(soundEl.value); });

    $$('[data-preset]', document).forEach(function (b) {
      b.addEventListener('click', function () {
        var sec = parseInt(b.getAttribute('data-preset'), 10);
        reset();
        hEl.value = pad(Math.floor(sec / 3600)); mEl.value = pad(Math.floor(sec / 60) % 60); sEl.value = pad(sec % 60);
        remain = sec; total = sec; paint();
        start();
      });
    });

    [hEl, mEl, sEl].forEach(function (el) {
      el.addEventListener('input', function () { if (state === 'idle') { remain = readInputs(); total = remain; paint(); } });
    });

    remain = readInputs(); total = remain; paint();
    if (pre > 0 && wrap.getAttribute('data-autostart') === '1') start();
  }

  /* ================= STOPWATCH ================= */
  function initStopwatch() {
    var wrap = $('#swTool');
    if (!wrap) return;
    var disp = $('#swDisplay'), startBtn = $('#swStart'), pauseBtn = $('#swPause'),
        lapBtn = $('#swLap'), resetBtn = $('#swReset'), lapsEl = $('#swLaps');
    var t0 = 0, acc = 0, iv = null, running = false, laps = [];

    function fmt(ms) {
      var t = Math.floor(ms), h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60,
          s = Math.floor(t / 1000) % 60, cs = Math.floor(t / 10) % 100;
      return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s) + '<span class="ms">.' + pad(cs) + '</span>';
    }
    function el() { return acc + (running ? Date.now() - t0 : 0); }
    function paint() { disp.innerHTML = fmt(el()); }
    function start() {
      Sound.unlock();
      running = true; t0 = Date.now();
      iv = setInterval(paint, 31);
      startBtn.classList.add('hidden'); pauseBtn.classList.remove('hidden');
      lapBtn.classList.remove('hidden'); resetBtn.classList.remove('hidden');
      keepAwake(true);
    }
    function pause() {
      running = false; acc += Date.now() - t0; clearInterval(iv); iv = null;
      paint();
      pauseBtn.classList.add('hidden'); startBtn.classList.remove('hidden');
      startBtn.querySelector('.lbl').textContent = 'Resume';
      keepAwake(false);
    }
    function reset() {
      running = false; clearInterval(iv); iv = null; acc = 0; laps = [];
      paint(); renderLaps();
      startBtn.classList.remove('hidden'); startBtn.querySelector('.lbl').textContent = 'Start';
      pauseBtn.classList.add('hidden'); lapBtn.classList.add('hidden'); resetBtn.classList.add('hidden');
      keepAwake(false);
    }
    function lap() {
      var t = el(), prev = laps.length ? laps[0].total : 0;
      laps.unshift({ n: laps.length + 1, total: t, split: t - prev });
      renderLaps();
    }
    function plain(ms) { return fmt(ms).replace(/<[^>]+>/g, function (m) { return ''; }).replace('.', '.'); }
    function renderLaps() {
      if (!lapsEl) return;
      if (!laps.length) { lapsEl.innerHTML = ''; return; }
      lapsEl.innerHTML = '<table><thead><tr><th>Lap</th><th>Split</th><th>Total</th></tr></thead><tbody>' +
        laps.map(function (l) {
          return '<tr><td>#' + l.n + '</td><td>' + fmt(l.split) + '</td><td>' + fmt(l.total) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    startBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', pause);
    lapBtn.addEventListener('click', lap);
    resetBtn.addEventListener('click', reset);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); running ? pause() : start(); }
      if (e.key === 'l' || e.key === 'L') { if (running) lap(); }
      if (e.key === 'r' || e.key === 'R') reset();
    });
    paint();
  }

  /* ================= WORLD CLOCK ================= */
  var ZONES = [
    ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Chicago', 'America/Chicago'],
    ['Denver', 'America/Denver'], ['Phoenix', 'America/Phoenix'], ['Anchorage', 'America/Anchorage'],
    ['Honolulu', 'Pacific/Honolulu'], ['Toronto', 'America/Toronto'], ['Vancouver', 'America/Vancouver'],
    ['Mexico City', 'America/Mexico_City'], ['São Paulo', 'America/Sao_Paulo'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
    ['London', 'Europe/London'], ['Dublin', 'Europe/Dublin'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'],
    ['Madrid', 'Europe/Madrid'], ['Rome', 'Europe/Rome'], ['Amsterdam', 'Europe/Amsterdam'], ['Stockholm', 'Europe/Stockholm'],
    ['Moscow', 'Europe/Moscow'], ['Istanbul', 'Europe/Istanbul'], ['Dubai', 'Asia/Dubai'], ['Riyadh', 'Asia/Riyadh'],
    ['Karachi', 'Asia/Karachi'], ['Delhi', 'Asia/Kolkata'], ['Dhaka', 'Asia/Dhaka'], ['Bangkok', 'Asia/Bangkok'],
    ['Jakarta', 'Asia/Jakarta'], ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'],
    ['Shanghai', 'Asia/Shanghai'], ['Seoul', 'Asia/Seoul'], ['Tokyo', 'Asia/Tokyo'],
    ['Sydney', 'Australia/Sydney'], ['Melbourne', 'Australia/Melbourne'], ['Perth', 'Australia/Perth'],
    ['Auckland', 'Pacific/Auckland'], ['Johannesburg', 'Africa/Johannesburg'], ['Cairo', 'Africa/Cairo'],
    ['Lagos', 'Africa/Lagos'], ['Nairobi', 'Africa/Nairobi'], ['UTC', 'UTC']
  ];

  function initWorldClock() {
    var grid = $('#wcGrid');
    if (!grid) return;
    var sel = $('#wcSelect'), addBtn = $('#wcAdd');
    var fixed = grid.getAttribute('data-fixed');
    var cities = fixed ? JSON.parse(fixed) : store.get('wcCities', ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']);

    if (sel) {
      ZONES.slice().sort(function (a, b) { return a[0].localeCompare(b[0]); }).forEach(function (z) {
        var o = document.createElement('option'); o.value = z[1]; o.textContent = z[0] + ' (' + z[1] + ')';
        sel.appendChild(o);
      });
    }
    function name(tz) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i][1] === tz) return ZONES[i][0]; return tz.split('/').pop().replace(/_/g, ' '); }
    function render() {
      grid.innerHTML = cities.map(function (tz, i) {
        return '<div class="wc-card" data-tz="' + tz + '">' + (fixed ? '' : '<button class="rm" data-rm="' + i + '" aria-label="Remove">×</button>') +
          '<div class="city">' + name(tz) + '</div><div class="zone">' + tz + '</div>' +
          '<div class="t">--:--</div><div class="d"></div></div>';
      }).join('');
      if (!fixed) $$('[data-rm]', grid).forEach(function (b) {
        b.addEventListener('click', function () { cities.splice(parseInt(b.getAttribute('data-rm'), 10), 1); store.set('wcCities', cities); render(); tick(); });
      });
      tick();
    }
    function tick() {
      var now = new Date();
      $$('.wc-card', grid).forEach(function (c) {
        var tz = c.getAttribute('data-tz');
        try {
          c.querySelector('.t').textContent = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
          c.querySelector('.d').textContent = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
        } catch (e) {}
      });
    }
    if (addBtn) addBtn.addEventListener('click', function () {
      if (!sel.value || cities.indexOf(sel.value) > -1) return;
      cities.push(sel.value); store.set('wcCities', cities); render();
    });
    render(); setInterval(tick, 1000);
  }

  /* ================= COUNTDOWN TO DATE ================= */
  function initCountdown() {
    var wrap = $('#cdTool');
    if (!wrap) return;
    var disp = $('#cdDisplay'), dEl = $('#cdDate'), tEl = $('#cdTime'), titleEl = $('#cdTitle'),
        startBtn = $('#cdStart'), resetBtn = $('#cdReset'), statusEl = $('#cdStatus'), soundEl = $('#cdSound');
    soundOptions(soundEl, 'chime');
    var target = 0, iv = null;

    var pre = wrap.getAttribute('data-target');
    var n = new Date(Date.now() + 86400000);
    dEl.value = pre || (n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()));
    tEl.value = wrap.getAttribute('data-time') || '00:00';

    function paint() {
      var diff = target - Date.now();
      if (diff <= 0) {
        disp.innerHTML = '00<span class="ms">d</span> 00<span class="ms">h</span> 00<span class="ms">m</span> 00<span class="ms">s</span>';
        clearInterval(iv); iv = null;
        if (statusEl) statusEl.textContent = 'Countdown complete!';
        ringUI({ display: disp, sound: soundEl.value, label: (titleEl.value || 'Countdown') + ' — time!', body: 'VClock countdown finished' });
        startBtn.classList.remove('hidden');
        return;
      }
      var s = Math.floor(diff / 1000), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24,
          m = Math.floor(s / 60) % 60, sec = s % 60;
      disp.innerHTML = pad(d) + '<span class="ms">d</span> ' + pad(h) + '<span class="ms">h</span> ' + pad(m) + '<span class="ms">m</span> ' + pad(sec) + '<span class="ms">s</span>';
      setTitle(d + 'd ' + pad(h) + ':' + pad(m) + ':' + pad(sec) + ' — Countdown | VClock');
    }
    function start() {
      Sound.unlock();
      var v = (dEl.value || '') + 'T' + (tEl.value || '00:00');
      var t = new Date(v);
      if (isNaN(t.getTime())) { if (statusEl) statusEl.textContent = 'Please pick a valid date and time.'; return; }
      target = t.getTime();
      if (target <= Date.now()) { if (statusEl) statusEl.textContent = 'Please choose a date in the future.'; return; }
      if (statusEl) statusEl.textContent = 'Counting down to ' + t.toLocaleString() + (titleEl.value ? ' — ' + titleEl.value : '');
      startBtn.classList.add('hidden'); resetBtn.classList.remove('hidden');
      paint(); clearInterval(iv); iv = setInterval(paint, 1000);
    }
    startBtn.addEventListener('click', start);
    resetBtn.addEventListener('click', function () {
      clearInterval(iv); iv = null; ringStop(disp); stopFlash();
      startBtn.classList.remove('hidden'); resetBtn.classList.add('hidden');
      if (statusEl) statusEl.textContent = '';
      disp.innerHTML = '00<span class="ms">d</span> 00<span class="ms">h</span> 00<span class="ms">m</span> 00<span class="ms">s</span>';
    });
    if (soundEl) soundEl.addEventListener('change', function () { Sound.preview(soundEl.value); });
    if (wrap.getAttribute('data-autostart') === '1') start();
  }

  /* ================= POMODORO ================= */
  function initPomodoro() {
    var wrap = $('#pmTool');
    if (!wrap) return;
    var disp = $('#pmDisplay'), phaseEl = $('#pmPhase'), roundEl = $('#pmRound'),
        startBtn = $('#pmStart'), pauseBtn = $('#pmPause'), resetBtn = $('#pmReset'), skipBtn = $('#pmSkip'),
        wEl = $('#pmWork'), bEl = $('#pmBreak'), lEl = $('#pmLong'), soundEl = $('#pmSound'), ringEl = $('#pmRing');
    soundOptions(soundEl, 'chime');

    var phase = 'work', round = 1, remain = 0, endAt = 0, iv = null, running = false, total = 0;

    function mins(el, d) { var v = parseInt(el.value || d, 10); return (isNaN(v) || v < 1) ? d : v; }
    function dur() { return phase === 'work' ? mins(wEl, 25) * 60 : phase === 'break' ? mins(bEl, 5) * 60 : mins(lEl, 15) * 60; }
    function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); }
    function label() { return phase === 'work' ? 'Focus Time' : phase === 'break' ? 'Short Break' : 'Long Break'; }
    function paint() {
      disp.textContent = fmt(remain);
      if (phaseEl) phaseEl.textContent = label();
      if (roundEl) roundEl.textContent = 'Round ' + round + ' of 4';
      if (ringEl && total > 0) {
        var c = 2 * Math.PI * 54;
        ringEl.style.strokeDasharray = c;
        ringEl.style.strokeDashoffset = c * (1 - remain / total);
      }
      if (running) setTitle(fmt(remain) + ' — ' + label() + ' | VClock');
    }
    function next() {
      Sound.play(soundEl.value);
      setTimeout(function () { Sound.stop(); }, 2600);
      notify(label() + ' finished', 'VClock Pomodoro');
      if (phase === 'work') {
        if (round % 4 === 0) phase = 'long'; else phase = 'break';
      } else {
        if (phase === 'long') round = 1; else round++;
        phase = 'work';
      }
      total = dur(); remain = total; endAt = Date.now() + total * 1000;
      paint();
    }
    function tick() {
      remain = (endAt - Date.now()) / 1000;
      if (remain <= 0) { next(); return; }
      paint();
    }
    function start() {
      Sound.unlock();
      if (!running) {
        if (remain <= 0) { total = dur(); remain = total; }
        endAt = Date.now() + remain * 1000;
        running = true;
        clearInterval(iv); iv = setInterval(tick, 200);
        startBtn.classList.add('hidden'); pauseBtn.classList.remove('hidden');
        resetBtn.classList.remove('hidden'); if (skipBtn) skipBtn.classList.remove('hidden');
        keepAwake(true);
      }
      paint();
    }
    function pause() {
      running = false; clearInterval(iv); iv = null;
      remain = Math.max(0, (endAt - Date.now()) / 1000);
      pauseBtn.classList.add('hidden'); startBtn.classList.remove('hidden');
      startBtn.querySelector('.lbl').textContent = 'Resume';
      stopFlash(); keepAwake(false);
    }
    function reset() {
      running = false; clearInterval(iv); iv = null;
      phase = 'work'; round = 1; total = dur(); remain = total;
      Sound.stop(); stopFlash();
      startBtn.classList.remove('hidden'); startBtn.querySelector('.lbl').textContent = 'Start';
      pauseBtn.classList.add('hidden'); resetBtn.classList.add('hidden'); if (skipBtn) skipBtn.classList.add('hidden');
      paint(); keepAwake(false);
    }
    startBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', pause);
    resetBtn.addEventListener('click', reset);
    if (skipBtn) skipBtn.addEventListener('click', function () { next(); if (!running) { running = false; } });
    [wEl, bEl, lEl].forEach(function (el) { if (el) el.addEventListener('input', function () { if (!running) { total = dur(); remain = total; paint(); } }); });
    if (soundEl) soundEl.addEventListener('change', function () { Sound.preview(soundEl.value); });
    total = dur(); remain = total; paint();
  }

  /* ---------------- nav ---------------- */
  function initNav() {
    var btn = $('#menuBtn'), links = $('#navLinks');
    if (btn && links) btn.addEventListener('click', function () { links.classList.toggle('open'); });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initNav(); initClock(); initAlarm(); initTimer(); initStopwatch();
    initWorldClock(); initCountdown(); initPomodoro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
