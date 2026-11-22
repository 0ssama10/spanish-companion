// Spanish Companion — personal study app around Language Transfer's Complete Spanish.
// Audio is streamed only through the official SoundCloud embed. Progress lives in this browser.

const PLAYLIST = 'https://api.soundcloud.com/playlists/45266314';
let LESSONS = []; // loaded from lessons/index.json at boot
const IDLE_MS = 120000;
const view = document.getElementById('view');

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const minutes = sec => Math.floor((sec || 0) / 60);

/* ---------- storage ---------- */
const KEY = 'spanish-companion-v1';
const fresh = () => ({ v: 1, settings: { goal: 60 }, lessons: {}, days: {} });
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch {} return fresh(); }
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function L(id) {
  S.lessons[id] ||= { position: 0, finished: false, practice: null, best: null, mistakes: {}, updatedAt: 0 };
  return S.lessons[id];
}
const touch = id => { L(id).updatedAt = Date.now(); save(); };

const lessonCache = {};
async function getLesson(id) {
  if (!lessonCache[id]) {
    const r = await fetch(`lessons/${id}.json`);
    if (!r.ok) throw new Error('Lesson not found');
    lessonCache[id] = await r.json();
  }
  return lessonCache[id];
}

/* ---------- study timer (active time only) ---------- */
const timer = { playing: false, practicing: false, lastInput: 0, last: Date.now() };
const markInput = () => { timer.lastInput = Date.now(); };
['keydown', 'pointerdown', 'input'].forEach(ev => document.addEventListener(ev, markInput, true));
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(now - timer.last, 60000) / 1000; // cap gaps (sleep, throttled tabs)
  timer.last = now;
  const active = timer.playing || (timer.practicing && !document.hidden && now - timer.lastInput < IDLE_MS);
  if (active) {
    const k = dayKey();
    S.days[k] = (S.days[k] || 0) + dt;
    if (Math.floor(S.days[k]) % 10 === 0) save();
  }
  renderToday();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

function renderToday() {
  const el = document.getElementById('today');
  const sec = S.days[dayKey()] || 0;
  el.textContent = `Today ${minutes(sec)} / ${S.settings.goal} min` + (timer.playing || timer.practicing ? ' ●' : '');
}

function streak() {
  const goal = S.settings.goal * 60;
  const d = new Date();
  if ((S.days[dayKey(d)] || 0) < goal) d.setDate(d.getDate() - 1); // today still in progress
  let n = 0;
  while ((S.days[dayKey(d)] || 0) >= goal) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- router ---------- */
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  timer.playing = false; timer.practicing = false;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query || '');
  const [page, id, mode] = path.split('/');
  window.scrollTo(0, 0);
  if (page === 'lesson') return lessonView(id, params);
  if (page === 'practice') return practiceView(id, mode === 'mistakes');
  if (page === 'review') return reviewView(id);
  return homeView();
}
addEventListener('hashchange', route);

/* ---------- home ---------- */
function homeView() {
  const goal = S.settings.goal;
  const todaySec = S.days[dayKey()] || 0;
  const pct = Math.min(100, (todaySec / (goal * 60)) * 100);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const maxMin = Math.max(goal, ...days.map(d => minutes(S.days[dayKey(d)])));
  const bars = days.map(d => {
    const m = minutes(S.days[dayKey(d)]);
    return `<div><div class="bar ${m >= goal ? 'met' : ''}" style="height:${Math.max(3, (m / maxMin) * 70)}px" title="${m} min"></div>
      <div class="lbl">${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</div></div>`;
  }).join('');

  const rows = LESSONS.map(l => {
    const st = S.lessons[l.id];
    const badge = st?.finished ? '<span class="badge done">listened</span>' : st?.position > 10 ? `<span class="badge">at ${mmss(st.position)}</span>` : '';
    const score = st?.practice ? `<span class="badge ${st.practice.score === st.practice.total ? 'done' : ''}">practice ${st.practice.score}/${st.practice.total}</span>` : '';
    const hasPractice = l.practice > 0;
    return `<div class="panel lesson-row">
      <span class="num">${l.track}</span><span class="ttl">${esc(l.title)} ${badge} ${score}</span>
      <a class="btn primary" href="#/lesson/${l.id}">Listen</a>
      ${hasPractice ? `<a class="btn" href="#/practice/${l.id}">Practice</a>` : ''}
      <a class="btn" href="#/review/${l.id}">Review</a></div>`;
  }).join('');

  view.innerHTML = `
    <h1>¡Hola!</h1>
    <p class="sub">Your study companion for Language Transfer's Complete Spanish.</p>
    <div class="panel goal">
      <div class="row"><b>Today: ${minutes(todaySec)} of ${goal} min</b><span class="spacer"></span>
        <label class="sub" style="margin:0">Daily goal
          <select id="goal"><option ${goal === 60 ? 'selected' : ''}>60</option><option ${goal === 120 ? 'selected' : ''}>120</option></select> min</label></div>
      <div class="goalbar"><span style="width:${pct}%"></span></div>
      <div class="row sub" style="margin:0"><span>Streak: <b>${streak()}</b> day${streak() === 1 ? '' : 's'} at goal</span><span class="spacer"></span><span>Counts only time spent listening or practising.</span></div>
      <div class="week">${bars}</div>
    </div>
    ${(() => {
      const next = LESSONS.find(l => !S.lessons[l.id]?.finished) || LESSONS[LESSONS.length - 1];
      const at = S.lessons[next.id]?.position > 10 ? ` · resume at ${mmss(S.lessons[next.id].position)}` : '';
      return `<div class="panel row" style="margin-top:16px"><span>Next up: <b>Track ${next.track}</b> — ${esc(next.title)}${at}</span>
        <span class="spacer"></span><a class="btn primary" href="#/lesson/${next.id}">Continue</a></div>`;
    })()}
    <h2>Lessons</h2>
    <div class="lessons">${rows}</div>
    ${LESSONS.length < 90 ? `<p class="sub" style="margin-top:10px">${LESSONS.length} of 90 tracks prepared so far; more are on the way.</p>` : ''}
    <h2>Your progress file</h2>
    <div class="panel">
      <p class="sub">Progress is saved in this browser only. To move it between your PC and iPhone, export here and import on the other device. Importing merges, keeping the newer data for each lesson.</p>
      <div class="row"><button id="exp">Export progress</button>
        <label class="btn">Import progress<input id="imp" type="file" accept="application/json,.json" hidden></label></div>
      <p class="status" id="ioStatus"></p>
    </div>`;

  document.getElementById('goal').onchange = e => { S.settings.goal = +e.target.value; save(); homeView(); renderToday(); };
  document.getElementById('exp').onclick = exportProgress;
  document.getElementById('imp').onchange = e => importProgress(e.target.files[0]);
}

function exportProgress() {
  save();
  const blob = new Blob([JSON.stringify({ ...S, exportedAt: new Date().toISOString() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spanish-progress-${dayKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  document.getElementById('ioStatus').textContent = 'Exported. On iPhone, choose "Save to Files" to keep it.';
}

async function importProgress(file) {
  const status = document.getElementById('ioStatus');
  if (!file) return;
  try {
    const inc = JSON.parse(await file.text());
    if (inc.v !== 1 || typeof inc.lessons !== 'object' || typeof inc.days !== 'object') throw new Error('Not a progress file from this app.');
    if (!confirm('Merge this progress file into this device?')) return;
    for (const [k, sec] of Object.entries(inc.days)) S.days[k] = Math.max(S.days[k] || 0, +sec || 0);
    for (const [id, l] of Object.entries(inc.lessons)) {
      if (!S.lessons[id] || (l.updatedAt || 0) > (S.lessons[id].updatedAt || 0)) S.lessons[id] = l;
    }
    if (inc.settings?.goal) S.settings.goal = inc.settings.goal;
    save(); homeView(); renderToday();
    document.getElementById('ioStatus').textContent = 'Imported and merged.';
  } catch (err) { status.textContent = 'Import failed: ' + err.message; }
}

/* ---------- lesson player ---------- */
function cardHTML(c) {
  const ex = (c.examples || []).map(e => `<div class="ex"><span class="en">${esc(e.en)}</span><span class="arrow">→</span>
    <span class="es" lang="es">${esc(e.es)}</span>${e.say ? `<span class="say">${esc(e.say)}</span>` : ''}</div>`).join('');
  return `${ex ? `<div class="examples">${ex}</div>` : ''}
    ${c.pron ? `<div class="note"><b>Sound:</b> ${esc(c.pron)}</div>` : ''}
    ${c.caveat ? `<div class="note"><b>Keep in mind:</b> ${esc(c.caveat)}</div>` : ''}`;
}

async function lessonView(id, params) {
  const meta = LESSONS.find(l => l.id === id);
  if (!meta) return homeView();
  const lesson = await getLesson(id);
  const st = L(id);
  const cards = lesson.cards;
  const startAt = params.has('t') ? +params.get('t') : null;

  view.innerHTML = `
    <p class="sub" style="margin:0"><a href="#/">← Lessons</a></p>
    <h1>Track ${lesson.track} · ${esc(lesson.title)}</h1>
    <div class="lesson-grid">
      <div class="player-col">
        <iframe class="sc" id="sc" allow="autoplay" title="Lesson audio"
          src="https://w.soundcloud.com/player/?url=${encodeURIComponent(lesson.scId ? 'https://api.soundcloud.com/tracks/' + lesson.scId : PLAYLIST)}${lesson.scId ? '' : '&start_track=' + (lesson.track - 1)}&visual=false&show_artwork=false&show_comments=false&sharing=false&download=false&buying=false"></iframe>
        <div class="status" id="status">Loading player…</div>
        <div id="warns"></div>
        <div class="row">
          <button id="play" class="primary" disabled>Play</button>
          <button id="prev">◀ Previous card</button>
          <button id="next">Next card ▶</button>
          <button id="resume" hidden></button>
        </div>
        <div class="row" style="margin-top:10px">
          ${lesson.practice.length ? `<a class="btn" href="#/practice/${id}">Practice this lesson</a>` : ''}
          <a class="btn" href="#/review/${id}">Review notes</a>
        </div>
        <p class="sub" style="margin-top:12px">Pause whenever the teacher asks a question and answer out loud before the student does.</p>
      </div>
      <div class="cards-col">
        <div class="panel card-now" id="now"></div>
        <ul class="cardlist" id="list"></ul>
      </div>
    </div>`;

  const $ = s => document.getElementById(s);
  let idx = -1, pos = 0, gotProgress = false, pendingSeek = null, lastSaved = 0, playing = false, watchdog = null;

  const idxAt = t => { let i = 0; cards.forEach((c, k) => { if (c.t <= t + 0.3) i = k; }); return i; };
  function setCard(i, force) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    if (i === idx && !force) return;
    idx = i;
    const c = cards[i];
    $('now').innerHTML = `<div class="card-time">${mmss(c.t)} · card ${i + 1} of ${cards.length}</div><h3>${esc(c.title)}</h3><div>${esc(c.body)}</div>${cardHTML(c)}`;
    $('list').innerHTML = cards.map((c, k) => `<li class="${k === i ? 'active' : k > i ? 'future' : ''}"><button data-k="${k}">
      <span class="card-time">${mmss(c.t)}</span> ${esc(c.title)}</button></li>`).join('');
    $('prev').disabled = i === 0; $('next').disabled = i === cards.length - 1;
  }
  const initial = startAt ?? (st.position > 10 && !st.finished ? st.position : 0);
  setCard(idxAt(initial), true);
  pos = initial;

  if (st.position > 10 && startAt == null) {
    $('resume').hidden = false;
    $('resume').textContent = `Resume at ${mmss(st.position)}`;
  }
  if (startAt != null) pendingSeek = startAt;

  if (!window.SC?.Widget) { $('status').textContent = 'The SoundCloud player could not load. Check your internet connection.'; return; }
  const w = SC.Widget($('sc'));
  const E = SC.Widget.Events;
  const warn = msg => { $('warns').insertAdjacentHTML('beforeend', `<div class="warn">${esc(msg)}</div>`); };

  function seek(sec) {
    pos = sec; setCard(idxAt(sec));
    if (playing) w.seekTo(sec * 1000); else { pendingSeek = sec; w.play(); }
  }
  function persist(force) {
    if (!force && Date.now() - lastSaved < 5000) return;
    lastSaved = Date.now();
    st.position = pos;
    if (pos >= lesson.duration - 15) st.finished = true;
    touch(id);
  }

  w.bind(E.READY, () => {
    $('play').disabled = false;
    $('status').textContent = 'Ready. Press Play (if nothing happens, tap ▶ in the player).';
    w.getCurrentSound(s => {
      if (!s) return;
      const m = /Track\s*0*(\d+)/i.exec(s.title || '');
      if (!m || +m[1] !== lesson.track) warn(`The player loaded "${s.title}", not track ${lesson.track}. Card timings won't match.`);
      else if (Math.abs(s.duration / 1000 - lesson.duration) > 3) warn(`This audio is ${mmss(s.duration / 1000)} long, but the notes were timed on ${mmss(lesson.duration)}. Cards may be out of step.`);
    });
  });
  w.bind(E.PLAY, () => {
    playing = true; timer.playing = true;
    $('play').textContent = 'Pause';
    $('status').textContent = 'Playing — cards follow the audio.';
    if (pendingSeek != null) { const t = pendingSeek; pendingSeek = null; setTimeout(() => w.seekTo(t * 1000), 150); }
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (!gotProgress) {
        $('status').textContent = 'This device isn’t reporting the playback position.';
        warn('Automatic sync isn’t available here. Use Previous / Next card to follow along.');
      }
    }, 8000);
  });
  w.bind(E.PAUSE, e => {
    playing = false; timer.playing = false;
    $('play').textContent = 'Play';
    $('status').textContent = 'Paused at ' + mmss(e.currentPosition / 1000);
    pos = e.currentPosition / 1000; persist(true);
  });
  w.bind(E.FINISH, () => {
    playing = false; timer.playing = false; st.finished = true; st.position = 0; touch(id);
    $('play').textContent = 'Play';
    $('status').innerHTML = lesson.practice.length ? `Lesson finished. <a href="#/practice/${id}">Start the practice set →</a>` : 'Lesson finished.';
  });
  w.bind(E.PLAY_PROGRESS, e => {
    gotProgress = true;
    pos = e.currentPosition / 1000;
    setCard(idxAt(pos));
    persist(false);
  });
  w.bind(E.SEEK, e => { pos = e.currentPosition / 1000; setCard(idxAt(pos)); });

  $('play').onclick = () => w.toggle();
  $('prev').onclick = () => gotProgress || playing ? seek(cards[Math.max(0, idx - 1)].t) : setCard(idx - 1);
  $('next').onclick = () => gotProgress || playing ? seek(cards[Math.min(cards.length - 1, idx + 1)].t) : setCard(idx + 1);
  $('resume').onclick = () => { $('resume').hidden = true; seek(st.position); };
  $('list').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) seek(cards[+b.dataset.k].t); };

  cleanup = () => { clearTimeout(watchdog); if (playing) { st.position = pos; touch(id); } try { w.pause(); } catch {} };
}

/* ---------- practice ---------- */
const norm = s => String(s).normalize('NFC').toLowerCase().replace(/[¿¡.,!?;:"'()]/g, ' ').replace(/\s+/g, ' ').trim();
const bare = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function check(item, answer) {
  const a = norm(answer), ab = bare(answer);
  if (!a) return { ok: false, tips: ['Type your answer first.'], empty: true };
  for (const exp of item.es) {
    if (a === norm(exp)) return { ok: true };
    if (ab === bare(exp)) return { ok: true, accent: `Accepted — but check the accents: ${exp}` };
  }
  // A subject pronoun is correct Spanish, just not needed here
  const noPron = ab.replace(/^(el|ella|usted|eso)\s+/, '');
  if (noPron !== ab && item.es.some(exp => noPron === bare(exp)))
    return { ok: true, accent: 'Also correct Spanish — but as this lesson shows, you can drop the pronoun when it’s clear who you mean.' };
  const exp = bare(item.es[0]), ew = exp.split(' '), aw = ab.split(' '), tips = [];
  const verb = ew[ew.indexOf('no') + 1];
  if (ew.includes('no') && aw.includes('no') && verb && aw.includes(verb) && aw.indexOf('no') > aw.indexOf(verb)) tips.push(`no goes before the verb: "no ${verb} …".`);
  else if (ew.includes('no') && !aw.includes('no')) tips.push(`This sentence is negative: put no in front of ${verb || 'the verb'}.`);
  else if (ew[0] !== 'no' && aw.includes('no')) tips.push('This one is positive, so no "no" is needed.');
  if (aw.some(w => ['el', 'ella', 'eso', 'esto', 'usted', 'he', 'she', 'it'].includes(w))) tips.push('Spanish usually leaves out he / she / it / you here — es on its own is enough.');
  if (aw.includes('is') || aw.includes('its')) tips.push('Use es for "is".');
  if (ew.includes('es') && !aw.includes('es') && !aw.includes('is')) tips.push('You need es ("is") in this sentence.');
  const key = ew[ew.length - 1], close = aw.find(w => w !== key && lev(w, key) <= 2 && w.length > 2);
  if (close) tips.push(`Check the spelling of "${close}".`);
  return { ok: false, tips };
}

async function practiceView(id, mistakesOnly) {
  const lesson = await getLesson(id);
  const st = L(id);
  let items = lesson.practice;
  if (mistakesOnly) items = items.filter(p => st.mistakes[p.id]?.open);
  timer.practicing = true; markInput();

  if (!items.length) {
    view.innerHTML = `<p class="sub"><a href="#/">← Lessons</a></p><h1>Practice · Track ${lesson.track}</h1>
      <div class="panel">${mistakesOnly ? 'No open mistakes — nicely done.' : 'This lesson has no practice set.'}
      <div class="row" style="margin-top:12px"><a class="btn" href="#/review/${id}">Review notes</a><a class="btn" href="#/">Home</a></div></div>`;
    return;
  }

  let i = 0, firstTry = 0, tries = 0, done = false;
  const firstResult = {};

  function render() {
    const it = items[i];
    tries = 0; done = false;
    view.innerHTML = `<p class="sub"><a href="#/">← Lessons</a></p>
      <h1>${mistakesOnly ? 'Drill your mistakes' : 'Practice'} · Track ${lesson.track}</h1>
      <div class="panel">
        <div class="progress">Item ${i + 1} of ${items.length} · say it in Spanish (accents optional)</div>
        <div class="q-en">${esc(it.en)}</div>
        <form id="f" autocomplete="off"><input type="text" id="ans" lang="es" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type in Spanish…" enterkeyhint="go">
          <div class="row" style="margin-top:10px"><button class="primary" id="go">Check</button><button type="button" id="show">Show answer</button></div></form>
        <div id="fb"></div>
      </div>`;
    const ans = document.getElementById('ans');
    ans.focus();
    document.getElementById('f').onsubmit = e => { e.preventDefault(); done ? next() : submit(ans.value); };
    document.getElementById('show').onclick = () => reveal(true);
  }

  function recordMistake(it, answer) {
    const m = st.mistakes[it.id] ||= { count: 0, answers: [], open: true };
    m.count++; m.open = true; m.at = Date.now();
    if (answer) m.answers = [answer, ...m.answers.filter(x => x !== answer)].slice(0, 3);
    touch(id);
  }

  function submit(value) {
    const it = items[i], r = check(it, value), fb = document.getElementById('fb');
    if (r.empty) { fb.innerHTML = `<div class="fb bad">${esc(r.tips[0])}</div>`; return; }
    tries++;
    if (r.ok) {
      if (tries === 1) { firstTry++; firstResult[it.id] = true; if (mistakesOnly && st.mistakes[it.id]) { st.mistakes[it.id].open = false; touch(id); } }
      done = true;
      fb.innerHTML = `<div class="fb ok"><b>Correct!</b> <span lang="es">${esc(it.es[0])}</span>${r.accent ? `<div class="why">${esc(r.accent)}</div>` : ''}<div class="why">${esc(it.why)}</div></div>`;
      setNextButton();
    } else {
      if (tries === 1) { firstResult[it.id] = false; recordMistake(it, value.trim()); }
      fb.innerHTML = `<div class="fb bad"><b>Not quite.</b>${r.tips.map(t => `<div class="why">${esc(t)}</div>`).join('')}
        <div class="row" style="margin-top:8px"><button type="button" id="retry">Try again</button><button type="button" id="reveal">Show answer</button></div></div>`;
      document.getElementById('retry').onclick = () => { const a = document.getElementById('ans'); a.select(); a.focus(); };
      document.getElementById('reveal').onclick = () => reveal(false);
    }
  }

  function reveal(beforeTrying) {
    const it = items[i];
    if (beforeTrying && tries === 0) { firstResult[it.id] = false; recordMistake(it, ''); }
    done = true;
    document.getElementById('fb').innerHTML = `<div class="fb bad">Answer: <b lang="es">${esc(it.es[0])}</b><div class="why">${esc(it.why)}</div></div>`;
    setNextButton();
  }

  function setNextButton() {
    const go = document.getElementById('go');
    go.textContent = i === items.length - 1 ? 'See results' : 'Next →';
    document.getElementById('show').hidden = true;
    go.focus();
  }

  function next() { i++; i < items.length ? render() : finish(); }

  function finish() {
    if (!mistakesOnly) {
      st.practice = { score: firstTry, total: items.length, at: Date.now() };
      if (!st.best || firstTry > st.best) st.best = firstTry;
      touch(id);
    }
    const missed = items.filter(p => !firstResult[p.id]);
    view.innerHTML = `<p class="sub"><a href="#/">← Lessons</a></p><h1>Results · Track ${lesson.track}</h1>
      <div class="panel"><div class="score">${firstTry} / ${items.length}</div><p class="sub">correct on the first try</p>
      ${missed.length ? `<p>To revisit: ${missed.map(p => `<b lang="es">${esc(p.es[0])}</b>`).join(', ')}</p>` : '<p>Everything right first time.</p>'}
      <div class="row">${Object.values(st.mistakes).some(m => m.open) ? `<a class="btn primary" href="#/practice/${id}/mistakes">Drill my mistakes</a>` : ''}
      <a class="btn" href="#/review/${id}">Review notes</a><a class="btn" href="#/practice/${id}">Practice again</a><a class="btn" href="#/">Home</a></div></div>`;
  }

  render();
}

/* ---------- review ---------- */
async function reviewView(id) {
  const lesson = await getLesson(id);
  const st = L(id);
  const items = Object.fromEntries(lesson.practice.map(p => [p.id, p]));
  const mist = Object.entries(st.mistakes).filter(([k]) => items[k]).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const open = mist.filter(([, m]) => m.open).length;
  const cards = lesson.cards.map(c => `<div class="panel review-card"><div class="row"><h3>${esc(c.title)}</h3><span class="spacer"></span>
      <a class="card-time" href="#/lesson/${id}?t=${c.t}">▶ ${mmss(c.t)}</a></div><div>${esc(c.body)}</div>${cardHTML(c)}</div>`).join('');
  const table = mist.length ? `<table class="mist"><tr><th>English</th><th>You wrote</th><th>Answer</th><th></th></tr>
    ${mist.map(([k, m]) => `<tr><td>${esc(items[k].en)}</td><td>${m.answers.length ? m.answers.map(esc).join('<br>') : '<i>revealed</i>'}</td>
      <td><b lang="es">${esc(items[k].es[0])}</b><div class="sub" style="margin:2px 0 0">${esc(items[k].why)}</div></td>
      <td>${m.open ? '<span class="badge">open</span>' : '<span class="badge done">fixed</span>'}</td></tr>`).join('')}</table>`
    : '<p class="sub">No mistakes recorded yet.</p>';

  view.innerHTML = `<p class="sub"><a href="#/">← Lessons</a></p>
    <h1>Review · Track ${lesson.track}</h1><p class="sub">${esc(lesson.title)} — key ideas, examples and your mistakes. Tap a time to hear that moment.</p>
    ${lesson.practice.length ? `<h2>Your mistakes</h2><div class="panel">${table}
      <div class="row" style="margin-top:12px">${open ? `<a class="btn primary" href="#/practice/${id}/mistakes">Drill ${open} open mistake${open === 1 ? '' : 's'}</a>` : ''}
      <a class="btn" href="#/practice/${id}">Practice set</a></div></div>` : ''}
    <h2>Key ideas</h2>${cards}`;
}

/* ---------- boot ---------- */
renderToday();
fetch('lessons/index.json').then(r => r.json()).then(list => { LESSONS = list; }).catch(() => {
  view.innerHTML = '<div class="panel">Couldn’t load the lesson list. Check your connection and reload.</div>';
}).finally(() => { if (LESSONS.length) route(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
