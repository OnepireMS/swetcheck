'use strict';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');

const VERDICT = {
  chill: { word: 'Chill.', label: 'Chill' },
  skim: { word: 'Skim it.', label: 'Skim it' },
  lock_in: { word: 'Lock in.', label: 'Lock in' },
};
const ORDER = ['chill', 'skim', 'lock_in'];

const EXAM_LABEL = { yes: 'On the exam', maybe: 'Maybe on the exam', no: 'Not on the exam' };
const CONTENT_LABEL = { new: 'New material', mix: 'Some new material', recap: 'Recap or admin' };
const RECORDED_LABEL = { yes: 'Recorded', no: 'Not recorded', unsure: '' };

let status = { claude: false };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// crypto.randomUUID only exists on https or localhost, so fall back for phones on the LAN.
const rid = () =>
  (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
  Math.random().toString(36).slice(2) + Date.now().toString(36);

let memoryVoter = null;
function voterId() {
  try {
    let id = localStorage.getItem('sweatcheck_voter');
    if (!id) {
      id = rid();
      localStorage.setItem('sweatcheck_voter', id);
    }
    return id;
  } catch {
    return (memoryVoter = memoryVoter || rid());
  }
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (iso) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 864e5);

function when(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const ago = daysAgo(iso);
  if (ago === 0) return `Today at ${time}`;
  if (ago === 1) return `Yesterday at ${time}`;
  if (ago > 1 && ago < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} at ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`;
}

function dayGroup(iso) {
  const ago = daysAgo(iso);
  if (ago < 0) return 'Coming up';
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return 'Earlier this week';
  return 'Older';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

function localDateTimeValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

async function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <h1 class="hero-words">
        <span class="verdict-word v-chill">Chill.</span>
        <span class="verdict-word v-skim">Skim it.</span>
        <span class="verdict-word v-lock_in">Lock in.</span>
      </h1>
      <p class="hero-lede">Skipped a lecture? The people who went will tell you which one it is.</p>
    </section>
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter by module or topic" aria-label="Filter lectures">
      <button class="btn btn-quiet" id="add-toggle" type="button" aria-expanded="false" aria-controls="add-form">Add a lecture</button>
    </div>
    <form id="add-form" class="add-form" hidden novalidate>
      <div><label for="f-module">Module code</label><input id="f-module" name="module" type="text" placeholder="COMP0004" maxlength="12" autocomplete="off"></div>
      <div><label for="f-module-name">Module name</label><input id="f-module-name" name="moduleName" type="text" placeholder="Object-Oriented Programming" maxlength="80"></div>
      <div class="full"><label for="f-title">Lecture topic</label><input id="f-title" name="title" type="text" placeholder="Interfaces and generics" maxlength="100"></div>
      <div><label for="f-date">When</label><input id="f-date" name="date" type="datetime-local" value="${localDateTimeValue()}"></div>
      <div><label for="f-lecturer">Lecturer <span class="muted">(optional)</span></label><input id="f-lecturer" name="lecturer" type="text" maxlength="60"></div>
      <p class="form-error full" id="add-error" hidden></p>
      <div class="full"><button class="btn" type="submit">Add lecture</button></div>
    </form>
    <div id="list" aria-live="polite"><p class="loading">Loading lectures</p></div>`;

  const list = document.getElementById('list');
  const filter = document.getElementById('filter');
  const addForm = document.getElementById('add-form');
  const addToggle = document.getElementById('add-toggle');

  addToggle.addEventListener('click', () => {
    const open = addForm.hidden;
    addForm.hidden = !open;
    addToggle.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('f-module').focus();
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(addForm);
    const err = document.getElementById('add-error');
    const btn = addForm.querySelector('button[type=submit]');
    err.hidden = true;
    btn.disabled = true;
    try {
      const date = f.get('date') ? new Date(f.get('date')).toISOString() : undefined;
      const { lecture } = await api('/api/lectures', {
        method: 'POST',
        body: {
          module: f.get('module'),
          moduleName: f.get('moduleName'),
          title: f.get('title'),
          lecturer: f.get('lecturer'),
          date,
        },
      });
      toast('Lecture added');
      location.hash = `#/lecture/${lecture.id}/rate`;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });

  let lectures = [];
  try {
    ({ lectures } = await api('/api/lectures'));
  } catch (ex) {
    list.innerHTML = `<p class="empty">${esc(ex.message)}</p>`;
    return;
  }

  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = lectures.filter((l) =>
      !q || `${l.module} ${l.moduleName} ${l.title} ${l.lecturer}`.toLowerCase().includes(q)
    );
    if (!shown.length) {
      list.innerHTML = q
        ? `<p class="empty">No lectures match “${esc(q)}”. Add it if you were there.</p>`
        : `<p class="empty">No lectures yet. Add the last one you went to.</p>`;
      return;
    }
    const groups = [];
    for (const l of shown) {
      const g = dayGroup(l.date);
      if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, items: [] });
      groups[groups.length - 1].items.push(l);
    }
    list.innerHTML = groups
      .map(
        (g) => `<h2 class="group-label">${g.label}</h2>
        <ul class="lecture-list">${g.items.map((l) => `<li>${rowHtml(l)}</li>`).join('')}</ul>`
      )
      .join('');
  };

  filter.addEventListener('input', draw);
  draw();
}

function rowHtml(l) {
  const v = l.verdict;
  const n = l.stats.n;
  return `<a class="row v-${v || 'none'}" href="#/lecture/${l.id}">
    <span class="verdict-word">${v ? VERDICT[v].label : 'Not rated yet'}</span>
    <span class="row-main">
      <span class="row-module">${esc(l.module)} ${esc(l.moduleName)}</span>
      <span class="row-title">${esc(l.title)}</span>
    </span>
    <span class="row-meta">${
      n ? `<strong>${l.stats.avgUsefulness}/5</strong>${plural(n, 'rating', 'ratings')}` : `${when(l.date).replace(' at ', '<br>')}`
    }</span>
  </a>`;
}

// ---------------------------------------------------------------------------
// Lecture page
// ---------------------------------------------------------------------------

async function renderLecture(id, tab) {
  app.innerHTML = `<a class="back" href="#/">All lectures</a><p class="loading">Loading</p>`;
  let data;
  try {
    data = await api(`/api/lectures/${encodeURIComponent(id)}?voter=${encodeURIComponent(voterId())}`);
  } catch (ex) {
    app.innerHTML = `<a class="back" href="#/">All lectures</a><p class="empty">${esc(ex.message)}</p>`;
    return;
  }

  const ctx = { id, ...data, tab, token: 0 };
  const l = ctx.lecture;

  app.innerHTML = `
    <a class="back" href="#/">All lectures</a>
    <header class="lecture-head">
      <p class="module">${esc(l.module)} ${esc(l.moduleName)}</p>
      <h1>${esc(l.title)}</h1>
      <p class="meta">${when(l.date)}${l.lecturer ? `, ${esc(l.lecturer)}` : ''}</p>
    </header>
    <div class="tabs" role="tablist" aria-label="Did you go?">
      <button type="button" role="tab" id="tab-skipped" data-tab="skipped" aria-controls="panel">I skipped it</button>
      <button type="button" role="tab" id="tab-rate" data-tab="rate" aria-controls="panel">I was there</button>
    </div>
    <section id="panel" role="tabpanel"></section>`;

  app.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(ctx, b.dataset.tab)));
  setTab(ctx, tab);
}

function setTab(ctx, tab) {
  ctx.tab = tab;
  ctx.token++;
  app.querySelectorAll('.tabs button').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const panel = document.getElementById('panel');
  panel.setAttribute('aria-labelledby', `tab-${tab}`);
  history.replaceState(null, '', `#/lecture/${ctx.id}${tab === 'rate' ? '/rate' : ''}`);
  if (tab === 'rate') renderRate(ctx, panel);
  else renderSkipped(ctx, panel);
}

async function refresh(ctx) {
  const data = await api(`/api/lectures/${encodeURIComponent(ctx.id)}?voter=${encodeURIComponent(voterId())}`);
  Object.assign(ctx, data);
}

async function renderSkipped(ctx, panel) {
  const n = ctx.ratings.length;
  if (!n) {
    panel.innerHTML = `<div class="nobody">
      <p>Nobody’s rated this one yet. If you went, you can be the first.</p>
      <button class="btn" type="button" id="be-first">Rate this lecture</button>
    </div>`;
    document.getElementById('be-first').addEventListener('click', () => setTab(ctx, 'rate'));
    return;
  }

  const token = ctx.token;
  panel.innerHTML = `<p class="loading">Reading what ${plural(n, 'person', 'people')} said</p>`;
  let data;
  try {
    data = await api(`/api/lectures/${encodeURIComponent(ctx.id)}/report`);
  } catch (ex) {
    if (token === ctx.token) panel.innerHTML = `<p class="empty">${esc(ex.message)}</p>`;
    return;
  }
  if (token !== ctx.token) return; // they switched tabs while we waited

  const { report, stats } = data;
  panel.innerHTML = reportHtml(report, stats, ctx);

  const cover = panel.querySelector('.meter-cover');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => cover.style.setProperty('--cover', String((100 - report.sweat_score) / 100)))
  );

  const askForm = panel.querySelector('.ask-form');
  if (askForm) askForm.addEventListener('submit', (e) => ask(e, ctx));
}

function reportHtml(r, stats, ctx) {
  const v = VERDICT[r.verdict];
  const total = r.catch_up.reduce((s, x) => s + x.minutes, 0);
  const rv = r.ratings_verdict;
  const overridden = r.source === 'claude' && rv && rv !== r.verdict;
  const raised = overridden && ORDER.indexOf(r.verdict) > ORDER.indexOf(rv);
  const li = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join('');

  return `
    <div class="verdict v-${r.verdict}">
      <p class="verdict-word">${v.word}</p>
      <div class="meter" role="img" aria-label="Sweat level ${r.sweat_score} out of 100"><div class="meter-cover"></div></div>
      <div class="meter-scale"><span>No sweat</span><span>Sweat level ${r.sweat_score}/100</span><span>Panic</span></div>
      ${r.headline ? `<p class="headline">${esc(r.headline)}</p>` : ''}
      ${r.why ? `<p class="why">${esc(r.why)}</p>` : ''}
      ${r.disagreement ? `<p class="why">${esc(r.disagreement)}</p>` : ''}
      ${
        overridden
          ? `<p class="override">The ratings alone said <strong class="verdict-word v-${rv}">${VERDICT[rv].label}</strong>. Claude ${
              raised ? 'raised' : 'lowered'
            } it after reading the notes.</p>`
          : ''
      }
      ${r.note ? `<p class="override">${esc(r.note)}</p>` : ''}
    </div>

    ${
      r.said_in_room.length
        ? `<section class="section heads-up"><h2>Said in the room</h2><ul class="bullets">${li(r.said_in_room)}</ul></section>`
        : ''
    }
    ${r.covered.length ? `<section class="section"><h2>What you missed</h2><ul class="bullets">${li(r.covered)}</ul></section>` : ''}
    ${
      r.catch_up.length
        ? `<section class="section"><h2>Catch-up plan <small>about ${fmtMin(total)}</small></h2>
          <ol class="plan">${r.catch_up
            .map((s) => `<li><span>${esc(s.step)}</span><span class="mins">${fmtMin(s.minutes)}</span></li>`)
            .join('')}</ol></section>`
        : ''
    }

    <section class="section">
      <h2>Ask the people who went</h2>
      ${
        status.claude
          ? `<form class="ask-form">
              <input type="text" name="q" placeholder="Did they say what’s on the exam?" maxlength="300" aria-label="Your question" required>
              <button class="btn" type="submit">Ask</button>
            </form>
            <div class="answers" aria-live="polite"></div>`
          : `<p class="muted">Connect Claude to ask questions about this lecture.</p>`
      }
    </section>

    <section class="section">
      <h2>From the room <small>${plural(stats.n, 'rating', 'ratings')}</small></h2>
      <dl class="stats">
        <div><dt>Usefulness</dt><dd>${stats.avgUsefulness}/5</dd></div>
        <div><dt>Say it’s on the exam</dt><dd>${stats.examShare}%</dd></div>
        <div><dt>Say it was new</dt><dd>${stats.newShare}%</dd></div>
        <div><dt>Recorded</dt><dd>${{ yes: 'Yes', no: 'No', unsure: 'Unclear' }[stats.recorded]}</dd></div>
      </dl>
      <ul class="notes">${ctx.ratings.map(noteHtml).join('')}</ul>
    </section>

    <p class="source">${
      r.source === 'claude'
        ? `Written by Claude from ${plural(stats.n, 'attendee rating', 'attendee ratings')}. Confidence: ${r.confidence}.`
        : `Estimated from the ratings alone. Connect Claude for a written summary.`
    }</p>`;
}

function noteHtml(r) {
  const pips = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= r.usefulness ? 'on' : ''}"></i>`).join('');
  const tags = [EXAM_LABEL[r.exam], CONTENT_LABEL[r.content], RECORDED_LABEL[r.recorded]]
    .filter(Boolean)
    .map((t) => `<span class="tag">${t}</span>`)
    .join('');
  return `<li class="note">
    <div class="note-top"><span class="pips" role="img" aria-label="Usefulness ${r.usefulness} out of 5">${pips}</span>${tags}</div>
    <p>${esc(r.covered)}</p>
    ${r.announcements ? `<p class="said">Said in the room: ${esc(r.announcements)}</p>` : ''}
  </li>`;
}

async function ask(e, ctx) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.elements.q;
  const btn = form.querySelector('button');
  const out = form.nextElementSibling;
  const question = input.value.trim();
  if (question.length < 3) return input.focus();

  const item = document.createElement('div');
  item.className = 'answer';
  item.innerHTML = `<span class="q">${esc(question)}</span><span class="loading">Checking the notes</span>`;
  out.prepend(item);
  btn.disabled = true;
  try {
    const { answer } = await api(`/api/lectures/${encodeURIComponent(ctx.id)}/ask`, { method: 'POST', body: { question } });
    item.innerHTML = `<span class="q">${esc(question)}</span>${esc(answer)}`;
    input.value = '';
  } catch (ex) {
    item.innerHTML = `<span class="q">${esc(question)}</span><span class="form-error">${esc(ex.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

function choices(name, options, current) {
  return options
    .map(
      ([value, label]) =>
        `<label><input type="radio" name="${name}" value="${value}" ${String(current) === String(value) ? 'checked' : ''}><span>${label}</span></label>`
    )
    .join('');
}

function renderRate(ctx, panel) {
  const m = ctx.myRating || {};
  const mine = Boolean(ctx.myRating);
  panel.innerHTML = `
    <form class="rate-form" novalidate>
      ${mine ? `<p class="muted">You already rated this lecture. Changing it updates your rating.</p>` : ''}
      <fieldset class="field">
        <legend>How useful was it?</legend>
        <div class="choices scale">${choices('usefulness', [1, 2, 3, 4, 5].map((n) => [n, n]), m.usefulness)}</div>
        <div class="scale-ends" aria-hidden="true"><span>Waste of time</span><span>Unmissable</span></div>
      </fieldset>
      <fieldset class="field">
        <legend>Will it be on the exam?</legend>
        <div class="choices">${choices('exam', [['yes', 'Definitely'], ['maybe', 'Maybe'], ['no', 'Not really']], m.exam)}</div>
      </fieldset>
      <fieldset class="field">
        <legend>Was it new material?</legend>
        <div class="choices">${choices('content', [['new', 'Mostly new'], ['mix', 'A bit of both'], ['recap', 'Recap or admin']], m.content)}</div>
      </fieldset>
      <fieldset class="field">
        <legend>Was it recorded on Panopto?</legend>
        <div class="choices">${choices('recorded', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], m.recorded || 'unsure')}</div>
      </fieldset>
      <div class="field">
        <label for="covered">What was covered?</label>
        <p class="hint">Topics, examples, anything that wasn’t on the slides.</p>
        <textarea id="covered" name="covered" maxlength="400">${esc(m.covered || '')}</textarea>
      </div>
      <div class="field">
        <label for="announcements">Anything said in the room?</label>
        <p class="hint">Deadlines, exam hints, changes. Leave it blank if nothing.</p>
        <textarea id="announcements" name="announcements" maxlength="300">${esc(m.announcements || '')}</textarea>
      </div>
      <p class="form-error" id="form-error" role="alert" hidden></p>
      <div><button class="btn" type="submit">${mine ? 'Update rating' : 'Post rating'}</button></div>
    </form>`;

  const form = panel.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const err = form.querySelector('#form-error');
    const btn = form.querySelector('button[type=submit]');
    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = false;
    };
    err.hidden = true;
    if (!f.get('usefulness')) return fail('Pick how useful it was, from 1 to 5.');
    if (!f.get('exam')) return fail('Say whether it’s on the exam.');
    if (!f.get('content')) return fail('Say whether it was new material.');
    if (String(f.get('covered') || '').trim().length < 3) return fail('Write a line about what was covered.');

    btn.disabled = true;
    try {
      const res = await api(`/api/lectures/${encodeURIComponent(ctx.id)}/ratings`, {
        method: 'POST',
        body: {
          voterId: voterId(),
          usefulness: Number(f.get('usefulness')),
          exam: f.get('exam'),
          content: f.get('content'),
          recorded: f.get('recorded'),
          covered: f.get('covered'),
          announcements: f.get('announcements'),
        },
      });
      await refresh(ctx);
      toast(res.updated ? 'Rating updated' : 'Rating posted');
      setTab(ctx, 'skipped');
      window.scrollTo({ top: 0 });
    } catch (ex) {
      fail(ex.message);
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function route() {
  const m = location.hash.match(/^#\/lecture\/([\w-]+)(\/rate)?/);
  if (m) renderLecture(m[1], m[2] ? 'rate' : 'skipped');
  else renderHome();
  window.scrollTo(0, 0);
}

async function loadStatus() {
  try {
    status = await api('/api/status');
  } catch {
    status = { claude: false };
  }
  statusEl.textContent = status.claude
    ? `Verdicts are written by Claude (${status.model}) from what attendees say.`
    : 'Claude isn’t connected, so verdicts are estimated from the ratings. Add ANTHROPIC_API_KEY to .env to connect it.';
}

window.addEventListener('hashchange', route);
loadStatus().then(route);
