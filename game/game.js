// NovIQ Epic Chemistry – מנוע המשחק (אב-טיפוס פרק 1)
// פיתוח: נוי נוביק. כל הנתונים נשמרים במכשיר בלבד (localStorage), בכינוי ולא בשם מלא.
'use strict';

const SAVE_KEY = 'noviq_epic_v1';
const AI_PROXY_URL = 'https://chem-proxy.noynovik.workers.dev'; // אותו שרת מתווך של אפליקציית התרגול
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const stage = $('#stage');

/* ---------- מצב ושמירה ---------- */
const fresh = () => ({ name: '', team: '', xp: 0, cr: 0, done: {}, lab: Array(40).fill(null), inst: {}, labMist: 0, arenaBest: 0 });
let S = fresh();
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d && typeof d === 'object') {
      S = Object.assign(fresh(), d);
      if (!Array.isArray(S.lab) || S.lab.length !== 40) S.lab = Array(40).fill(null);
      if (!S.done || typeof S.done !== 'object') S.done = {};
    }
  } catch (e) { S = fresh(); }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* מצב פרטי: ממשיכים בלי שמירה */ } }

/* ---------- עזרים ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fm = f => '<span class="ltr">' + esc(f).replace(/(\d+)/g, '<sub>$1</sub>') + '</span>';
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const team = () => TEAMS.find(t => t.id === S.team) || TEAMS[0];
const rankOf = xp => { let r = RANKS[0]; for (const k of RANKS) if (xp >= k.xp) r = k; return r; };
const doneCount = () => Object.keys(S.done).length;
const labScore = () => S.lab.reduce((n, id) => n + (id ? (GEAR.find(g => g[0] === id) || [0, 0, 0, 0, 0])[4] : 0), 0);
const labLevel = () => { let l = LAB_LEVELS[0]; for (const k of LAB_LEVELS) if (labScore() >= k[0]) l = k; return l[1]; };
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

let cleanups = [];
let scene = '';
function go(name, arg) {
  cleanups.forEach(f => f()); cleanups = [];
  scene = name;
  window.scrollTo(0, 0);
  hud();
  (SCENES[name] || SCENES.map)(arg);
  const h = stage.querySelector('h1,h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function hud() {
  const el = $('#hud');
  el.hidden = !S.name;
  if (!S.name) return;
  const r = rankOf(S.xp), i = RANKS.indexOf(r), nx = RANKS[i + 1];
  $('#hudTeam').textContent = team().icon;
  $('#hudName').textContent = S.name;
  $('#hudRank').textContent = r.name;
  $('#hudXp').textContent = nx ? `${S.xp} / ${nx.xp} נק'` : `${S.xp} נק' · דרגה מרבית`;
  $('#hudBar').style.width = (nx ? Math.min(100, 100 * (S.xp - r.xp) / (nx.xp - r.xp)) : 100) + '%';
  $('#hudCr').textContent = S.cr;
  $$('#hud nav button').forEach(b => b.classList.toggle('on', b.dataset.go === scene));
}
function gain(xp, cr) {
  const before = rankOf(S.xp);
  S.xp += xp; S.cr += cr; save(); hud();
  const after = rankOf(S.xp);
  if (after !== before) setTimeout(() => toast('עלית דרגה: ' + after.name + ' 🎖️'), 900);
}

/* שאלה רב-ברירתית. התשובה הנכונה בנתונים היא תמיד לפי c, והסדר מעורבב בתצוגה */
function mcq(box, q, onDone) {
  const order = shuffle(q.o.map((t, i) => i));
  box.innerHTML = `<h3>${esc(q.t)}</h3><div class="opts">${order.map(i => `<button class="opt" data-i="${i}">${esc(q.o[i])}</button>`).join('')}</div><div class="fbx"></div>`;
  let wrong = 0;
  $$('.opt', box).forEach(b => b.onclick = () => {
    const right = +b.dataset.i === q.c;
    if (!right) {
      wrong++; b.classList.add('wrong'); b.disabled = true;
      $('.fbx', box).innerHTML = `<div class="fb no" role="alert">לא מדויק. נסה שוב.</div>`;
      return;
    }
    b.classList.add('right');
    $$('.opt', box).forEach(x => x.disabled = true);
    $('.fbx', box).innerHTML = `<div class="fb ok" role="alert"><b class="ok">נכון.</b> ${esc(q.why || '')}</div><p><button class="btn next">המשך</button></p>`;
    $('.next', box).onclick = () => onDone(wrong);
    $('.next', box).focus();
  });
}
function quizRun(box, list, onEnd) {
  let i = 0, mist = 0;
  const step = () => {
    if (i >= list.length) return onEnd(mist);
    box.innerHTML = `<div class="progress"><i style="width:${100 * i / list.length}%"></i></div><div class="qq"></div>`;
    mcq($('.qq', box), list[i], w => { mist += w; i++; step(); });
  };
  step();
}

/* סיום משימה: כוכבים, נקודות, קרדיטים */
function finish(id, mistakes, extra) {
  const m = MISSIONS.find(x => x.id === id);
  const stars = mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1;
  const prev = (S.done[id] && S.done[id].stars) || 0;
  let gx = 0, gc = 0;
  if (stars > prev) {
    gx = Math.round(m.xp * (stars - prev) / 3); gc = Math.round(m.cr * (stars - prev) / 3);
    S.done[id] = { stars };
  }
  gain(gx, gc);
  const unlocked = GEAR.filter(g => g[5] === id).map(g => g[2] + ' ' + g[1]);
  stage.innerHTML = `<div class="panel" style="text-align:center">
    <h2>המשימה הושלמה: ${esc(m.title)}</h2>
    <div class="big">${'★'.repeat(stars)}<span style="opacity:.25">${'★'.repeat(3 - stars)}</span></div>
    <p>${mistakes === 0 ? 'בלי אף טעות.' : 'טעויות בדרך: ' + mistakes + '. טעות היא חלק מהעבודה במעבדה.'}</p>
    <p>${gx ? `קיבלת <b class="ok">${gx} נקודות</b> ו-<b class="ok">${gc} קרדיטים</b>.` : 'התוצאה הקודמת שלך טובה לפחות באותה מידה, ולכן אין תוספת נקודות.'}</p>
    ${extra ? `<p class="story" style="text-align:start">${extra}</p>` : ''}
    ${unlocked.length && prev === 0 ? `<p>ציוד חדש נפתח לקנייה במעבדה: ${unlocked.map(esc).join(', ')}</p>` : ''}
    <p class="dim small">כשירויות שתרגלת: ${m.comps.map(c => COMPS[c]).join(' · ')}</p>
    <div class="row" style="justify-content:center">
      <button class="btn" id="toMap">חזרה למפה</button>
      ${stars < 3 ? '<button class="btn ghost" id="again">נסה שוב לשלושה כוכבים</button>' : ''}
      <button class="btn ghost" id="toBuild">למעבדה הניידת</button>
    </div></div>`;
  $('#toMap').onclick = () => go('map');
  $('#toBuild').onclick = () => go('build');
  if ($('#again')) $('#again').onclick = () => go('mission', id);
}
function head(m, right) {
  return `<div class="row sp"><h2>${m.icon} ${esc(m.title)}</h2><div class="row">${right || ''}<button class="btn ghost" id="quit">למפה</button></div></div>`;
}
const bindQuit = () => { const q = $('#quit'); if (q) q.onclick = () => go('map'); };

/* טבלה מחזורית (20 היסודות הראשונים) */
function ptHTML() {
  let h = '<div class="pt">' + GROUP_LABELS.map(g => `<div class="hd">טור ${g}</div>`).join('');
  for (let per = 1; per <= 4; per++) for (let col = 1; col <= 8; col++) {
    const e = ELEMENTS.find(x => x[5] === per && x[4] === col);
    h += e ? `<div class="cell ${e[6]}" title="${esc(e[2])}"><i>${e[1]}</i><b>${e[0]}</b><small>${esc(e[2])}</small><small>${e[3]}</small></div>` : '<div></div>';
  }
  h += '</div><div class="legend">' +
    [['alkali', '#ffb347'], ['earth', '#ffe08a'], ['halogen', '#3ee6c1'], ['noble', '#5cc8ff']].map(([k, c]) => `<span><i style="border-color:${c}"></i>${FAMILY[k]}</span>`).join('') +
    '<span>מספר למעלה: מספר אטומי · מספר למטה: מסה אטומית</span></div>';
  return h;
}

/* ================= סצנות ================= */
const SCENES = {};

SCENES.title = () => {
  stage.innerHTML = `<section class="title"><div>
    <h1>NovIQ <em>Epic Chemistry</em></h1>
    <p class="tagline">פרק 1: העמק האפור. העולם קרס, והכימיה נשכחה. מישהו צריך לבנות אותה מחדש, מהיסודות.</p>
    <div class="panel">
      <label class="field"><span>כינוי (לא שם מלא, לשמירה על הפרטיות)</span>
        <input type="text" id="nm" maxlength="16" autocomplete="off" value="${esc(S.name)}"></label>
      <div class="field"><span>בחר שבט. הנקודות שלך נספרות גם לשבט</span>
        <div class="teams">${TEAMS.map(t => `<button class="team ${S.team === t.id ? 'on' : ''}" data-t="${t.id}" style="--tc:${t.color}" aria-pressed="${S.team === t.id}"><i>${t.icon}</i><b>${t.name}</b><small>${t.motto}</small></button>`).join('')}</div></div>
      <div class="row sp"><button class="btn" id="start">${S.name ? 'המשך משחק' : 'יוצאים לדרך'}</button>
        <a class="dim small" href="../" style="color:var(--dim)">לאפליקציית התרגול</a></div>
      <p class="fbx small no" role="alert"></p>
    </div></div></section>`;
  let pick = S.team;
  $$('.team').forEach(b => b.onclick = () => { pick = b.dataset.t; $$('.team').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  $('#start').onclick = () => {
    const n = $('#nm').value.trim().slice(0, 16);
    if (!n) return $('.fbx').textContent = 'כתוב כינוי כדי להתחיל.';
    if (!pick) return $('.fbx').textContent = 'בחר שבט.';
    S.name = n; S.team = pick; save(); go('map');
  };
};

SCENES.map = () => {
  const dc = doneCount();
  const nextId = (MISSIONS.find(m => !S.done[m.id] && dc >= m.need) || {}).id;
  const pts = MISSIONS.map(m => `${100 - m.pos[0]},${m.pos[1]}`).join(' ');
  stage.innerHTML = `<div class="row sp" style="margin-bottom:10px"><h2>העמק האפור</h2>
      <span class="tag">${dc} מתוך ${MISSIONS.length} משימות · ${labLevel()}</span></div>
    <div class="map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#ff8a3d" stroke-opacity=".45" stroke-width=".5" stroke-dasharray="1.5 1.5" vector-effect="non-scaling-stroke"/></svg>
      <div class="truck" aria-hidden="true">🚚</div>
      ${MISSIONS.map(m => {
        const d = S.done[m.id], lock = dc < m.need;
        return `<button class="node ${d ? 'done' : ''} ${lock ? 'lock' : ''} ${m.id === nextId ? 'next' : ''}" data-m="${m.id}" style="right:${m.pos[0]}%;top:${m.pos[1]}%" ${lock ? 'aria-disabled="true"' : ''}>
          <div class="orb">${lock ? '🔒' : m.icon}</div><b>${esc(m.title)}</b>
          <small>${lock ? (m.need === 1 ? 'נפתח אחרי משימה אחת' : `נפתח אחרי ${m.need} משימות`) : esc(m.sub)}</small>
          ${d ? `<div class="stars">${'★'.repeat(d.stars)}</div>` : ''}</button>`;
      }).join('')}
    </div>
    <div class="panel"><div class="row sp"><div><b>${dc === MISSIONS.length ? 'סיימת את פרק 1.' : 'המטרה:'}</b>
      ${dc === MISSIONS.length ? 'המעבדה הניידת מוכנה לצאת מהעמק. הפרקים הבאים: מבנה וקישור, סטוכיומטריה, חמצון-חיזור.' : 'להשלים את המשימות, לצבור קרדיטים ולבנות מעבדה ניידת שתחזיר את הכימיה לעולם.'}</div>
      <button class="btn ghost" id="prof">פרופיל הבוגר שלי</button></div></div>`;
  $$('.node').forEach(b => b.onclick = () => {
    if (b.classList.contains('lock')) return toast('המשימה נעולה. השלם קודם משימות פתוחות.');
    go('mission', b.dataset.m);
  });
  $('#prof').onclick = () => go('profile');
};

SCENES.mission = id => {
  const m = MISSIONS.find(x => x.id === id);
  stage.innerHTML = `<div class="panel">${head(m)}<p class="tag">${esc(m.sub)}</p>
    <p class="story">${esc(m.story)}</p>
    <p class="dim small">שלושה כוכבים: עד טעות אחת. פרס מרבי: ${m.xp} נקודות ו-${m.cr} קרדיטים.</p>
    <button class="btn" id="begin">מתחילים</button></div>`;
  bindQuit();
  $('#begin').onclick = () => PLAY[id](m);
};

const PLAY = {};

/* --- 1. מיון השרידים --- */
PLAY.sort = m => {
  let left = shuffle(SORT_ITEMS), sel = null, mist = 0;
  const placed = { element: [], compound: [], homo: [], hetero: [] };
  const draw = (fb) => {
    stage.innerHTML = `<div class="panel">${head(m, `<span class="tag">נשארו ${left.length}</span>`)}
      <p>בחר פריט ואז לחץ על הארגז המתאים.</p>
      <div class="chips">${left.map((it, i) => `<button class="chip ${sel === i ? 'sel' : ''}" data-i="${i}" aria-pressed="${sel === i}">${esc(it.n)} ${it.f ? fm(it.f) : ''}</button>`).join('')}</div>
      <div class="bins">${SORT_BINS.map(b => `<button class="bin" data-b="${b.id}"><b>${b.name}</b>${placed[b.id].map(n => `<span>✓ ${esc(n)}</span>`).join('')}</button>`).join('')}</div>
      <div class="fbx">${fb || ''}</div></div>`;
    bindQuit();
    $$('.chip').forEach(c => c.onclick = () => { sel = +c.dataset.i; draw(); });
    $$('.bin').forEach(b => b.onclick = () => {
      if (sel === null) return toast('קודם בחר פריט.');
      const it = left[sel];
      if (it.a === b.dataset.b) {
        placed[it.a].push(it.n); left.splice(sel, 1); sel = null;
        if (!left.length) return finish('sort', mist, 'המשאית מסודרת. עכשיו אתה יודע מה יש לך: יסודות, תרכובות ותערובות.');
        draw(`<div class="fb ok" role="alert"><b class="ok">נכון.</b> ${esc(it.why)}</div>`);
      } else {
        mist++;
        draw(`<div class="fb no" role="alert">לא מדויק. שאל את עצמך: האם יש כאן חומר אחד או כמה? ואם חומר אחד, האם הוא בנוי מסוג אחד של אטומים?</div>`);
      }
    });
  };
  draw();
};

/* --- 2. המכרה: בניית אטומים --- */
function drawBohr(cv, p, n, e) {
  const c = cv.getContext('2d'), W = cv.width, R = W / 2;
  c.clearRect(0, 0, W, W);
  const caps = [2, 8, 8, 2]; let rest = Math.min(e, 20);
  caps.forEach((cap, k) => {
    const r = 62 + k * 34, cnt = Math.min(cap, rest); rest -= cnt;
    c.strokeStyle = cnt ? '#3ee6c188' : '#ffffff1c'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(R, R, r, 0, 7); c.stroke();
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 - Math.PI / 2;
      c.fillStyle = '#3ee6c1'; c.beginPath(); c.arc(R + r * Math.cos(a), R + r * Math.sin(a), 6, 0, 7); c.fill();
    }
  });
  const g = c.createRadialGradient(R, R, 4, R, R, 40); g.addColorStop(0, '#ffb347'); g.addColorStop(1, '#b3400c');
  c.fillStyle = g; c.beginPath(); c.arc(R, R, 38, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = 'bold 17px Arial'; c.textAlign = 'center';
  c.fillText(p + ' p⁺', R, R - 4); c.fillText(n + ' n⁰', R, R + 17);
}
PLAY.atoms = m => {
  let i = 0, mist = 0;
  const round = () => {
    if (i >= ATOM_ROUNDS.length) return finish('atoms', mist, 'אספת פחמן, נתרן, כלור, סידן וגופרית. היסודות האלה ישמשו אותך בסדנת הסינתזה.');
    const r = ATOM_ROUNDS[i], v = { p: 1, n: 0, e: 1 };
    const chTxt = r.ch === 0 ? '' : (Math.abs(r.ch) > 1 ? Math.abs(r.ch) : '') + (r.ch > 0 ? '+' : '−');
    stage.innerHTML = `<div class="panel">${head(m, `<span class="tag">מינרל ${i + 1} מתוך ${ATOM_ROUNDS.length}</span>`)}
      <div class="progress"><i style="width:${100 * i / ATOM_ROUNDS.length}%"></i></div>
      <div class="atom"><canvas width="400" height="400" role="img" aria-label="מודל האטום שבנית"></canvas>
      <div><p>במינרל <b>${esc(r.mineral)}</b> זיהית את החלקיק:</p>
        <p><span class="nuclide"><sup>${r.A}</sup>${r.sym}<sup>${chTxt}</sup></span>
          <span class="dim small"> ${r.ch ? 'יון' : 'אטום ניטרלי'}, מספר מסה ${r.A}</span></p>
        ${[['p', 'פרוטונים'], ['n', 'נויטרונים'], ['e', 'אלקטרונים']].map(([k, n]) => `<div class="ctr"><span>${n}</span>
          <span class="step"><button data-k="${k}" data-d="-1" aria-label="פחות ${n}">−</button><output id="v${k}">${v[k]}</output><button data-k="${k}" data-d="1" aria-label="עוד ${n}">+</button></span></div>`).join('')}
        <div class="row"><button class="btn" id="chk">בדיקה</button><button class="btn ghost" id="showpt">טבלה מחזורית</button></div>
        <div class="fbx"></div></div></div>
      <div id="ptbox" hidden>${ptHTML()}</div><div id="qbox"></div></div>`;
    bindQuit();
    const cv = $('.atom canvas'); drawBohr(cv, v.p, v.n, v.e);
    $$('.step button').forEach(b => b.onclick = () => {
      const k = b.dataset.k; v[k] = Math.max(0, Math.min(30, v[k] + (+b.dataset.d)));
      $('#v' + k).textContent = v[k]; drawBohr(cv, v.p, v.n, v.e);
    });
    $('#showpt').onclick = () => { $('#ptbox').hidden = !$('#ptbox').hidden; };
    $('#chk').onclick = () => {
      let msg = '';
      if (v.p !== r.p) msg = 'מספר הפרוטונים שווה למספר האטומי של היסוד. מצא אותו בטבלה המחזורית.';
      else if (v.n !== r.n) msg = 'מספר הנויטרונים הוא מספר המסה פחות מספר הפרוטונים.';
      else if (v.e !== r.e) msg = r.ch ? 'זה יון. יון חיובי מסר אלקטרונים, ויון שלילי קיבל אלקטרונים.' : 'באטום ניטרלי מספר האלקטרונים שווה למספר הפרוטונים.';
      if (msg) { mist++; $('.fbx').innerHTML = `<div class="fb no" role="alert">${msg}</div>`; return; }
      $('.fbx').innerHTML = `<div class="fb ok" role="alert"><b class="ok">האטום יציב.</b> ${r.p} פרוטונים, ${r.n} נויטרונים, ${r.e} אלקטרונים.</div>`;
      $('#chk').disabled = true; $$('.step button').forEach(b => b.disabled = true);
      mcq($('#qbox'), r.q, w => { mist += w; i++; round(); });
      $('#qbox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  };
  round();
};

/* --- 3. מי הבאר: הפרדת תערובות --- */
PLAY.water = m => {
  let i = 0, mist = 0;
  const step = fb => {
    if (i >= WATER_STAGES.length) return finish('water', mist, 'יש מים נקיים במחנה. שים לב: לכל שיטת הפרדה יש תכונה מפרידה אחרת.');
    const s = WATER_STAGES[i];
    stage.innerHTML = `<div class="panel">${head(m, `<span class="tag">שלב ${i + 1} מתוך ${WATER_STAGES.length}</span>`)}
      <div class="progress"><i style="width:${100 * i / WATER_STAGES.length}%"></i></div>
      <p>🪣 <b>בדלי יש:</b> ${esc(s.has)}</p><p>🎯 <b>המטרה בשלב הזה:</b> ${esc(s.goal)}</p>
      <div class="inst" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${WATER_METHODS.map(w => `<button data-w="${w.id}"><i>${w.i}</i>${w.n}</button>`).join('')}</div>
      <div class="fbx">${fb || ''}</div></div>`;
    bindQuit();
    $$('.inst button').forEach(b => b.onclick = () => {
      if (b.dataset.w === s.c) {
        $$('.inst button').forEach(x => x.disabled = true); b.classList.add('done');
        $('.fbx').innerHTML = `<div class="fb ok" role="alert"><b class="ok">נכון.</b> ${esc(s.why)}</div><p><button class="btn next">המשך</button></p>`;
        $('.next').onclick = () => { i++; step(); }; $('.next').focus();
      } else { mist++; step(`<div class="fb no" role="alert">${esc(WATER_WRONG[b.dataset.w])}</div>`); }
    });
  };
  step();
};

/* --- 4. סדנת הסינתזה: איזון תגובות --- */
PLAY.forge = m => {
  let i = 0, mist = 0;
  const round = () => {
    if (i >= EQUATIONS.length) return finish('forge', mist, 'הגנרטור עובד, השלדה מרותכת ויש דשן לשדות. בכל תגובה מספר האטומים מכל סוג נשמר.');
    const q = EQUATIONS[i], co = q.sp.map(() => 1);
    const els = [...new Set(q.sp.flatMap(s => Object.keys(s.a)))];
    const cnt = (el, side) => q.sp.reduce((n, s, k) => n + (s.side === side ? co[k] * (s.a[el] || 0) : 0), 0);
    const tally = () => `<table class="tally"><tr><th>אטום</th><th>מגיבים</th><th>תוצרים</th></tr>${els.map(el => { const a = cnt(el, 0), b = cnt(el, 1); return `<tr class="${a === b ? 'eqv' : 'neq'}"><td>${el}</td><td>${a}</td><td>${b}</td></tr>`; }).join('')}</table>`;
    const part = side => q.sp.map((s, k) => s.side !== side ? '' : `<div class="sp"><span>${fm(s.f)}<small>(${s.s})</small></span><span class="step"><button data-k="${k}" data-d="-1" aria-label="הקטן מקדם של ${s.f}">−</button><output id="c${k}">1</output><button data-k="${k}" data-d="1" aria-label="הגדל מקדם של ${s.f}">+</button></span></div>`).filter(Boolean).join('<span class="op">+</span>');
    stage.innerHTML = `<div class="panel">${head(m, `<span class="tag">תגובה ${i + 1} מתוך ${EQUATIONS.length}</span>`)}
      <div class="progress"><i style="width:${100 * i / EQUATIONS.length}%"></i></div>
      <h3>${esc(q.name)}</h3><p class="dim">${esc(q.note)}</p>
      <div class="eq">${part(0)}<span class="op">→</span>${part(1)}</div>
      <div id="tally">${tally()}</div>
      <p style="text-align:center;margin-top:14px"><button class="btn" id="chk">הפעל תגובה</button></p><div class="fbx"></div></div>`;
    bindQuit();
    $$('.step button').forEach(b => b.onclick = () => {
      const k = +b.dataset.k; co[k] = Math.max(1, Math.min(9, co[k] + (+b.dataset.d)));
      $('#c' + k).textContent = co[k]; $('#tally').innerHTML = tally();
    });
    $('#chk').onclick = () => {
      const bal = els.every(el => cnt(el, 0) === cnt(el, 1));
      if (!bal) { mist++; $('.fbx').innerHTML = `<div class="fb no" role="alert">התגובה לא מאוזנת. בדוק בטבלה איזה אטום אינו שווה בשני הצדדים. משנים רק מקדמים, לא את הנוסחאות.</div>`; return; }
      if (co.some((c, k) => c !== q.ans[k])) { $('.fbx').innerHTML = `<div class="fb" role="alert">מאוזן, אבל אפשר לצמצם. כותבים את המקדמים השלמים הקטנים ביותר.</div>`; return; }
      $('#chk').disabled = true; $$('.step button').forEach(b => b.disabled = true);
      $('.fbx').innerHTML = `<div class="fb ok" role="alert"><b class="ok">התגובה מאוזנת.</b> חוק שימור החומר מתקיים.</div><p style="text-align:center"><button class="btn next">המשך</button></p>`;
      $('.next').onclick = () => { i++; round(); }; $('.next').focus();
    };
  };
  round();
};

/* --- 5. הבונקר: חדר בריחה --- */
PLAY.bunker = m => {
  const open = {}; let cur = null, mist = 0, hints = 0, sec = 0;
  const t = setInterval(() => { sec++; const el = $('#tm'); if (el) el.textContent = fmtT(sec); }, 1000);
  cleanups.push(() => clearInterval(t));
  const fmtT = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const draw = () => {
    const n = Object.keys(open).length;
    if (n === LOCKS.length) {
      clearInterval(t);
      const fast = sec <= 360 && !S.done.bunker; if (fast) gain(40, 0);
      return finish('bunker', mist + hints, `יצאת בתוך ${fmtT(sec)}.${fast ? ' בונוס מהירות: 40 נקודות.' : ''} מאחורי הדלת חיכו שלושה מכשירים אנליטיים: ICP, GC ו-HPLC.`);
    }
    const L = LOCKS.find(l => l.id === cur);
    stage.innerHTML = `<div class="panel">${head(m, `<span class="timer" id="tm" aria-label="זמן">${fmtT(sec)}</span>`)}
      <p>הדלת נעולה. ${n} מתוך ${LOCKS.length} מנעולים נפתחו. בחר חפץ בחדר.</p>
      <div class="room">${LOCKS.map(l => `<button class="lockbtn ${open[l.id] ? 'open' : ''} ${cur === l.id ? 'cur' : ''}" data-l="${l.id}"><i>${open[l.id] ? '🔓' : l.icon}</i>${l.name}</button>`).join('')}</div>
      ${L ? `<div class="fb"><h3>${L.icon} ${L.name}</h3><p>${esc(L.clue)}</p>
        <div class="row"><input type="text" class="code" id="code" inputmode="numeric" maxlength="${L.code.length}" aria-label="קוד" autocomplete="off">
          <button class="btn" id="try">פתח</button><button class="btn ghost" id="hint">רמז (10 קרדיטים)</button></div>
        <div class="fbx"></div></div>` : ''}
      <details style="margin-top:12px"><summary>📋 טבלה מחזורית תלויה על הקיר</summary>${ptHTML()}</details>
      <p class="dim small">יציאה בתוך 6 דקות מזכה בבונוס. כל רמז נחשב כטעות.</p></div>`;
    bindQuit();
    $$('.lockbtn').forEach(b => b.onclick = () => { if (open[b.dataset.l]) return toast('המנעול הזה כבר פתוח.'); cur = b.dataset.l; draw(); });
    if (!L) return;
    const tryIt = () => {
      if ($('#code').value.trim() === L.code) { open[L.id] = true; cur = null; toast('קליק. המנעול נפתח: ' + L.why); draw(); }
      else { mist++; $('.fbx').innerHTML = `<div class="fb no" role="alert">הקוד שגוי. קרא שוב את הרמז והיעזר בטבלה.</div>`; }
    };
    $('#try').onclick = tryIt;
    $('#code').onkeydown = e => { if (e.key === 'Enter') tryIt(); };
    $('#code').focus();
    $('#hint').onclick = () => {
      if (S.cr < 10) return toast('אין מספיק קרדיטים לרמז.');
      S.cr -= 10; hints++; save(); hud();
      $('.fbx').innerHTML = `<div class="fb" role="alert">💡 ${esc(L.hint)}</div>`;
    };
  };
  draw();
};

/* --- 6. המעבדה האנליטית --- */
function plotAxes(c, W, H, x0, x1, xl, yl) {
  c.fillStyle = '#06090c'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#2c3a4a'; c.fillStyle = '#9db0c2'; c.font = '13px Arial'; c.textAlign = 'center'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(50, 20); c.lineTo(50, H - 40); c.lineTo(W - 15, H - 40); c.stroke();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const x = 50 + (W - 65) * i / n, v = x0 + (x1 - x0) * i / n;
    c.beginPath(); c.moveTo(x, H - 40); c.lineTo(x, H - 35); c.stroke();
    c.fillText(Number.isInteger(v) ? v : v.toFixed(1), x, H - 20);
  }
  c.fillText(xl, W / 2, H - 4);
  c.save(); c.translate(16, H / 2); c.rotate(-Math.PI / 2); c.fillText(yl, 0, 0); c.restore();
  return v => 50 + (W - 65) * (v - x0) / (x1 - x0);
}
function plotICP(cv) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const X = plotAxes(c, W, H, 200, 600, 'אורך גל (ננומטר)', 'עוצמת פליטה');
  ICP_SAMPLE.forEach(p => {
    const x = X(p.wl), top = H - 40 - p.h * (H - 80);
    const g = c.createLinearGradient(0, top, 0, H - 40); g.addColorStop(0, '#3ee6c1'); g.addColorStop(1, '#3ee6c111');
    c.strokeStyle = g; c.lineWidth = 4; c.beginPath(); c.moveTo(x, H - 40); c.lineTo(x, top); c.stroke();
    c.fillStyle = '#ffd166'; c.font = 'bold 14px Arial'; c.fillText(p.wl.toFixed(1), x, top - 6);
  });
}
function plotGC(cv) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height;
  const X = plotAxes(c, W, H, 0, 8, 'זמן שהייה (דקות)', 'אות הגלאי');
  c.strokeStyle = '#ff8a3d'; c.lineWidth = 2.5; c.beginPath();
  for (let px = 50; px <= W - 15; px++) {
    const tm = (px - 50) / (W - 65) * 8;
    const y = GC_SAMPLE.reduce((s, p) => s + p.h * Math.exp(-Math.pow((tm - p.rt) / 0.16, 2)), 0);
    const py = H - 40 - y * (H - 80);
    px === 50 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.stroke();
  c.fillStyle = '#ffd166'; c.font = 'bold 14px Arial';
  GC_SAMPLE.forEach(p => c.fillText(p.rt.toFixed(1), X(p.rt), H - 40 - p.h * (H - 80) - 6));
}
PLAY.lab = m => {
  const menu = () => {
    if (INSTRUMENTS.every(x => S.inst[x.id])) {
      const mi = S.labMist; S.inst = {}; S.labMist = 0; save();
      return finish('lab', mi, 'הכרת שלושה מכשירים אנליטיים וקראת את הנתונים שלהם. עכשיו אפשר לקנות אותם ולהתקין אותם במעבדה הניידת.');
    }
    stage.innerHTML = `<div class="panel">${head(m)}<p>בחר מכשיר. לכל מכשיר: היכרות, נתונים אמיתיים מהשטח ושלוש שאלות.</p>
      <div class="inst">${INSTRUMENTS.map(x => `<button data-x="${x.id}" class="${S.inst[x.id] ? 'done' : ''}"><i>${x.icon}</i><b class="ltr">${x.name}</b><br><small class="dim">${x.full}</small>${S.inst[x.id] ? '<br><span class="ok">✓ הושלם</span>' : ''}</button>`).join('')}</div></div>`;
    bindQuit();
    $$('.inst button').forEach(b => b.onclick = () => show(INSTRUMENTS.find(x => x.id === b.dataset.x)));
  };
  const show = x => {
    let data = '';
    if (x.id === 'icp') data = `<h3>דגימה: מי הבאר</h3><canvas class="plot" width="900" height="300" role="img" aria-label="ספקטרום פליטה עם קווים ב-220.4, 393.4 ו-589.0 ננומטר"></canvas>
      <table class="ref"><tr><th>יסוד</th>${ICP_REF.map(r => `<td>${r.n} <span class="ltr">${r.el}</span></td>`).join('')}</tr><tr><th>קו פליטה (ננומטר)</th>${ICP_REF.map(r => `<td>${r.wl.toFixed(1)}</td>`).join('')}</tr></table>`;
    if (x.id === 'gc') data = `<h3>דגימה: דלק שנמצא במכל</h3><canvas class="plot" width="900" height="300" role="img" aria-label="כרומטוגרמה עם שיא גבוה ב-3.4 דקות ושיא נמוך ב-7.2 דקות"></canvas>
      <table class="ref"><tr><th>חומר</th>${GC_REF.map(r => `<td>${r.n} ${fm(r.f)}</td>`).join('')}</tr><tr><th>זמן שהייה (דקות)</th>${GC_REF.map(r => `<td>${r.rt.toFixed(1)}</td>`).join('')}</tr><tr><th>טמפרטורת רתיחה (°C)</th>${GC_REF.map(r => `<td>${r.bp}</td>`).join('')}</tr></table>`;
    if (x.id === 'hplc') data = `<h3>דגימה: תוסף מזון שנמצא בבונקר</h3><p>על התווית: ויטמין C (מסיס במים) וויטמין A (מסיס בשמן). המשימה: לחזות את סדר היציאה מהעמודה.</p>`;
    stage.innerHTML = `<div class="panel"><div class="row sp"><h2>${x.icon} <span class="ltr">${x.name}</span> · ${x.full}</h2><button class="btn ghost" id="back">למכשירים</button></div>
      <p><b>מה המכשיר עושה:</b> ${esc(x.what)}</p><b>איך הוא עובד:</b><ol class="how">${x.how.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
      <p class="tag">${esc(x.link)}</p>${data}<div id="qz"></div></div>`;
    $('#back').onclick = menu;
    const cv = $('canvas.plot'); if (cv) (x.id === 'icp' ? plotICP : plotGC)(cv);
    quizRun($('#qz'), LAB_QUIZ[x.id], mi => { S.labMist += mi; S.inst[x.id] = true; save(); toast(x.name + ' הושלם'); menu(); });
  };
  menu();
};

/* --- 7. ביקורת על אטום: כשירות בינה מלאכותית --- */
PLAY.audit = m => {
  let i = 0, mist = 0;
  const claim = () => {
    if (i >= AI_CLAIMS.length) return part2();
    const c = AI_CLAIMS[i];
    stage.innerHTML = `<div class="panel">${head(m, `<span class="tag">טענה ${i + 1} מתוך ${AI_CLAIMS.length}</span>`)}
      <div class="progress"><i style="width:${100 * i / (AI_CLAIMS.length + AI_QUIZ.length)}%"></i></div>
      <p class="dim">אטום עונה לשאלה של אחד השורדים. האם אפשר לסמוך על התשובה?</p>
      <div class="msg ai" style="max-width:100%">🤖 ${esc(c.say)}</div>
      <div class="row" style="margin-top:12px"><button class="btn teal" data-v="1">התשובה תקינה</button><button class="btn" data-v="0">יש כאן טעות</button></div>
      <div id="fx"></div></div>`;
    bindQuit();
    const next = () => { i++; claim(); };
    $$('[data-v]').forEach(b => b.onclick = () => {
      const saysOk = b.dataset.v === '1';
      $$('[data-v]').forEach(x => x.disabled = true);
      if (saysOk !== c.ok) mist++;
      if (c.ok) {
        $('#fx').innerHTML = `<div class="fb ${saysOk ? 'ok' : 'no'}" role="alert">${saysOk ? '<b class="ok">נכון.</b> ' : 'דווקא כאן אטום צדק. ביקורתיות אינה חשדנות עיוורת: בודקים מול ידע. '}${esc(c.why)}</div><p><button class="btn next">המשך</button></p>`;
        $('.next').onclick = next; return;
      }
      if (saysOk) {
        $('#fx').innerHTML = `<div class="fb no" role="alert">יש כאן טעות, והיא נשמעת משכנעת. ${esc(c.why)}</div><p><button class="btn next">המשך</button></p>`;
        $('.next').onclick = next; return;
      }
      $('#fx').innerHTML = '<div class="fb"><div id="fq"></div></div>';
      mcq($('#fq'), { t: 'זיהית טעות. מה התיקון הנכון?', o: c.fix, c: 0, why: c.why }, w => { mist += w; next(); });
    });
  };
  const part2 = () => {
    stage.innerHTML = `<div class="panel">${head(m, '<span class="tag">חלק ב: עבודה נכונה עם AI</span>')}<div id="qz"></div></div>`;
    bindQuit();
    quizRun($('#qz'), AI_QUIZ, mi => finish('audit', mist + mi, 'אטום חזר לשירות, אבל עם כלל ברזל: כל פלט של AI נבדק מול ידע כימי ומול מקור שאפשר לאמת. ההחלטה נשארת אצל בני האדם.'));
  };
  claim();
};

/* ================= המעבדה הניידת (בנייה) ================= */
SCENES.build = () => {
  let sel = null;
  const draw = () => {
    const sc = labScore(), nx = LAB_LEVELS.find(l => l[0] > sc);
    stage.innerHTML = `<div class="panel"><div class="row sp"><h2>🚚 המעבדה הניידת שלי</h2><span class="tag">${labLevel()} · ציון מעבדה ${sc}${nx ? ` · הרמה הבאה ב-${nx[0]}` : ''}</span></div>
      <p class="dim">בחר ציוד מהמחסן ולחץ על משבצת פנויה כדי להתקין. לחיצה על ציוד מותקן מפרקת אותו ומחזירה את הקרדיטים. התכנון שלך.</p>
      <div class="grid">${S.lab.map((id, i) => { const g = id && GEAR.find(x => x[0] === id); return `<button class="tile ${g ? 'full' : ''}" data-i="${i}" aria-label="${g ? esc(g[1]) + ', לחץ לפירוק' : 'משבצת פנויה ' + (i + 1)}" title="${g ? esc(g[1]) : ''}">${g ? g[2] : ''}</button>`; }).join('')}</div>
      <h3 style="margin-top:14px">מחסן הציוד</h3>
      <div class="shop">${GEAR.map(g => { const ok = !!S.done[g[5]]; const ms = MISSIONS.find(x => x.id === g[5]);
        return `<button data-g="${g[0]}" class="${sel === g[0] ? 'sel' : ''}" ${ok ? '' : 'disabled'} aria-pressed="${sel === g[0]}"><i>${g[2]}</i><b>${g[1]}</b><small>${ok ? `🔩 ${g[3]} · ערך ${g[4]}` : '🔒 אחרי "' + esc(ms.title) + '"'}</small></button>`; }).join('')}</div></div>`;
    $$('.shop button').forEach(b => b.onclick = () => { sel = sel === b.dataset.g ? null : b.dataset.g; draw(); });
    $$('.tile').forEach(t => t.onclick = () => {
      const i = +t.dataset.i, cur = S.lab[i];
      if (cur) { const g = GEAR.find(x => x[0] === cur); S.lab[i] = null; S.cr += g[3]; save(); hud(); toast(g[1] + ' פורק. הקרדיטים הוחזרו.'); return draw(); }
      if (!sel) return toast('קודם בחר ציוד מהמחסן.');
      const g = GEAR.find(x => x[0] === sel);
      if (S.cr < g[3]) return toast('חסרים קרדיטים. השלם משימות או שפר כוכבים.');
      const before = labLevel();
      S.cr -= g[3]; S.lab[i] = sel; save(); hud(); draw();
      if (labLevel() !== before) toast('המעבדה עלתה רמה: ' + labLevel());
    });
  };
  draw();
};

/* ================= זירה ותחרות ================= */
function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 46655; return h.toString(36); }
function scoreCode() {
  const s = JSON.stringify([S.name, S.team, S.xp, S.arenaBest, doneCount(), labScore()]);
  return 'NQ1.' + btoa(unescape(encodeURIComponent(s))) + '.' + hash(s);
}
function readCode(line) {
  try {
    const m = /^NQ1\.([A-Za-z0-9+/=]+)\.([a-z0-9]+)$/.exec(line.trim()); if (!m) return null;
    const s = decodeURIComponent(escape(atob(m[1]))); if (hash(s) !== m[2]) return null;
    const a = JSON.parse(s); if (!Array.isArray(a)) return null;
    return { name: String(a[0]).slice(0, 16), team: String(a[1]), xp: +a[2] || 0, arena: +a[3] || 0, done: +a[4] || 0, lab: +a[5] || 0 };
  } catch (e) { return null; }
}
SCENES.arena = () => {
  const rows = [{ name: S.name, team: S.team, xp: S.xp, me: true }, ...DEMO_RIVALS].sort((a, b) => b.xp - a.xp);
  const tt = TEAMS.map(t => ({ t, xp: rows.filter(r => r.team === t.id).reduce((n, r) => n + r.xp, 0) })).sort((a, b) => b.xp - a.xp);
  stage.innerHTML = `<div class="panel"><h2>🏆 הזירה</h2>
      <div class="row sp"><div><b>דו-קרב בזק</b><p class="dim small">60 שניות, שאלות מהירות. תשובה נכונה 10 נקודות, שגויה מורידה 3. שיפור השיא שלך מוסיף נקודות ניסיון.</p></div>
      <div style="text-align:center"><div class="big">${S.arenaBest}</div><small class="dim">השיא שלי</small></div></div>
      <button class="btn" id="duel">התחל דו-קרב</button></div>
    <div class="panel"><h3>טבלת השבטים</h3>
      <table class="board">${tt.map((x, i) => `<tr class="${x.t.id === S.team ? 'me' : ''}"><td>${i + 1}</td><td>${x.t.icon} ${x.t.name}</td><td>${x.xp} נק'</td></tr>`).join('')}</table>
      <h3 style="margin-top:14px">שחקנים</h3>
      <table class="board">${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.me ? ' (אני)' : ''}</td><td>${(TEAMS.find(t => t.id === r.team) || TEAMS[0]).name}</td><td>${r.xp} נק'</td></tr>`).join('')}</table>
      <p class="dim small">הקבוצות האחרות כאן הן נתוני הדגמה. תחרות אמיתית בכיתה נעשית דרך קוד התוצאה ולוח הכיתה.</p></div>
    <div class="panel"><h3>קוד התוצאה שלי</h3><p class="dim small">שלח את הקוד למורה. הקוד מכיל כינוי, שבט ונקודות בלבד.</p>
      <div class="scorecode" id="sc">${scoreCode()}</div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" id="copy">העתק קוד</button><button class="btn ghost" id="tboard">לוח כיתה (למורה)</button></div></div>`;
  $('#duel').onclick = () => go('duel');
  $('#tboard').onclick = () => go('board');
  $('#copy').onclick = () => { const t = $('#sc').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('הקוד הועתק.'), () => toast('סמן את הקוד והעתק ידנית.')); };
};
SCENES.duel = () => {
  let left = 60, score = 0, right = 0, total = 0, pool = shuffle(ARENA_Q), k = 0, over = false;
  const t = setInterval(() => { left--; const el = $('#tl'); if (el) el.textContent = left; if (left <= 0) end(); }, 1000);
  cleanups.push(() => clearInterval(t));
  const end = () => {
    if (over) return; over = true; clearInterval(t);
    const gainXp = Math.min(300, Math.max(0, score - S.arenaBest));
    if (score > S.arenaBest) S.arenaBest = score;
    gain(gainXp, Math.round(gainXp / 4));
    stage.innerHTML = `<div class="panel" style="text-align:center"><h2>הדו-קרב הסתיים</h2><div class="big">${score}</div>
      <p>${right} תשובות נכונות מתוך ${total}.</p><p>${gainXp ? `שיא חדש. קיבלת <b class="ok">${gainXp} נקודות</b>.` : 'השיא שלך נשאר ' + S.arenaBest + '.'}</p>
      <div class="row" style="justify-content:center"><button class="btn" id="re">עוד סיבוב</button><button class="btn ghost" id="bk">לזירה</button></div></div>`;
    $('#re').onclick = () => go('duel'); $('#bk').onclick = () => go('arena');
  };
  const ask = () => {
    if (over) return;
    if (k >= pool.length) { pool = shuffle(ARENA_Q); k = 0; }
    const q = pool[k++], order = shuffle([0, 1, 2, 3]);
    stage.innerHTML = `<div class="panel"><div class="row sp"><span class="timer">⏱ <span id="tl">${left}</span></span><span class="big" style="font-size:30px">${score}</span></div>
      <h3 style="margin-top:10px">${esc(q[0])}</h3><div class="opts" style="grid-template-columns:1fr 1fr">${order.map(i => `<button class="opt" data-i="${i}">${esc(q[1][i])}</button>`).join('')}</div></div>`;
    $$('.opt').forEach(b => b.onclick = () => {
      if (over) return;
      total++; const ok = +b.dataset.i === q[2];
      if (ok) { score += 10; right++; } else score = Math.max(0, score - 3);
      b.classList.add(ok ? 'right' : 'wrong'); $$('.opt').forEach(x => x.disabled = true);
      setTimeout(ask, ok ? 250 : 700);
    });
  };
  ask();
};
SCENES.board = () => {
  stage.innerHTML = `<div class="panel"><div class="row sp"><h2>📋 לוח כיתה</h2><button class="btn ghost" id="bk">לזירה</button></div>
    <p class="dim">הדבק כאן את קודי התוצאה של התלמידים, קוד בכל שורה. הנתונים נשארים בדפדפן הזה בלבד.</p>
    <textarea id="codes" rows="6" dir="ltr" aria-label="קודי תוצאה"></textarea>
    <p><button class="btn" id="mk">בנה טבלה</button></p><div id="out"></div></div>`;
  $('#bk').onclick = () => go('arena');
  $('#mk').onclick = () => {
    const best = {}; let bad = 0;
    $('#codes').value.split(/\s+/).filter(Boolean).forEach(l => { const r = readCode(l); if (!r) return bad++; if (!best[r.name] || best[r.name].xp < r.xp) best[r.name] = r; });
    const rows = Object.values(best).sort((a, b) => b.xp - a.xp);
    if (!rows.length) return $('#out').innerHTML = `<div class="fb no" role="alert">לא נמצאו קודים תקינים.</div>`;
    const tt = TEAMS.map(t => { const r = rows.filter(x => x.team === t.id); return { t, n: r.length, xp: r.reduce((n, x) => n + x.xp, 0) }; }).sort((a, b) => b.xp - a.xp);
    $('#out').innerHTML = `${bad ? `<p class="no small">${bad} קודים לא תקינים דולגו.</p>` : ''}
      <h3>שבטים</h3><table class="board"><tr><th>#</th><th>שבט</th><th>תלמידים</th><th>סך נקודות</th><th>ממוצע</th></tr>${tt.map((x, i) => `<tr><td>${i + 1}</td><td>${x.t.icon} ${x.t.name}</td><td>${x.n}</td><td>${x.xp}</td><td>${x.n ? Math.round(x.xp / x.n) : 0}</td></tr>`).join('')}</table>
      <h3 style="margin-top:14px">תלמידים</h3><table class="board"><tr><th>#</th><th>כינוי</th><th>שבט</th><th>נקודות</th><th>משימות</th><th>שיא בזירה</th><th>ציון מעבדה</th></tr>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc((TEAMS.find(t => t.id === r.team) || { name: '' }).name)}</td><td>${r.xp}</td><td>${r.done}</td><td>${r.arena}</td><td>${r.lab}</td></tr>`).join('')}</table>`;
  };
};

/* ================= פרופיל הבוגר ================= */
SCENES.profile = () => {
  const comp = {}; Object.keys(COMPS).forEach(k => comp[k] = [0, 0]);
  MISSIONS.forEach(m => m.comps.forEach(c => { comp[c][1] += 3; comp[c][0] += (S.done[m.id] && S.done[m.id].stars) || 0; }));
  const lit1 = ['sort', 'atoms', 'forge'].every(x => S.done[x]), lit2 = ['bunker', 'lab', 'audit'].every(x => S.done[x]);
  stage.innerHTML = `<div class="panel"><div class="row sp"><h2>${team().icon} ${esc(S.name)} · ${rankOf(S.xp).name}</h2><button class="btn ghost" id="bk">למפה</button></div>
      <p class="dim">הפרופיל בנוי לפי "דמות הבוגר בכימיה": שלוש קומות בפירמידה, ושלושה כוחות שמניעים לאורך כל הדרך.</p>
      <div class="pyr">
        <div style="width:46%">ראש: ניווט וצמיחה בעולם משתנה<br><small class="dim">אתגר פתוח, ייפתח בפרקים הבאים</small></div>
        <div style="width:72%" class="${lit2 ? 'lit' : ''}">אמצע: פתרון בעיות מורכבות ${lit2 ? '✓' : ''}<br><small class="dim">הבונקר, המעבדה האנליטית, ביקורת על אטום</small></div>
        <div style="width:100%" class="${lit1 ? 'lit' : ''}">בסיס: חשיבה כימית, מאקרו, מיקרו וסמל ${lit1 ? '✓' : ''}<br><small class="dim">מיון השרידים, המכרה, סדנת הסינתזה</small></div>
      </div>
      <p class="small"><b>תחושת מסוגלות:</b> דרגה ${rankOf(S.xp).name}, ${S.xp} נקודות. <b>מוטיבציה להשפיע:</b> ${labLevel()}. <b>שייכות לקהילה:</b> ${team().name}.</p></div>
    <div class="panel"><h3>כשירויות</h3><div class="bars">${Object.keys(COMPS).map(k => `<div class="bar"><span>${COMPS[k]}</span><div role="img" aria-label="${comp[k][0]} מתוך ${comp[k][1]}"><i style="width:${comp[k][1] ? 100 * comp[k][0] / comp[k][1] : 0}%"></i></div><span>${comp[k][0]}/${comp[k][1]}</span></div>`).join('')}</div></div>
    <div class="panel"><div class="row sp"><span class="dim small">ההתקדמות נשמרת במכשיר הזה בלבד.</span><button class="btn ghost" id="reset">איפוס המשחק</button></div></div>`;
  $('#bk').onclick = () => go('map');
  let armed = false;
  $('#reset').onclick = e => {
    if (!armed) { armed = true; e.target.textContent = 'לחץ שוב לאישור המחיקה'; return; }
    try { localStorage.removeItem(SAVE_KEY); } catch (er) { /* אין שמירה */ }
    S = fresh(); go('title');
  };
};

/* ================= אטום: מורה AI חי (דרך השרת המתווך הקיים) ================= */
const ATOM_SYSTEM = `אתה "אטום", הבינה המלאכותית של מעבדה ניידת במשחק לימודי בכימיה לתלמידי תיכון בישראל (5 יח"ל, כיתה י). העולם במשחק קרס והתלמיד בונה את הכימיה מחדש.
כללים: ענה בעברית, קצר (עד 120 מילים). אל תיתן תשובה סופית לתרגיל: שאל שאלה מנחה אחת או תן רמז אחד, ובקש מהתלמיד לנסות. היצמד לתוכנית הלימודים (מושגי יסוד, מבנה האטום, טבלה מחזורית, ניסוח ואיזון, הפרדת תערובות, היכרות עם ICP, GC, HPLC).
הזכר לתלמיד מדי פעם לבדוק את דבריך מול הטבלה המחזורית או הספר, כי גם אתה יכול לטעות. אל תבקש ואל תשמור פרטים אישיים. אם השאלה אינה קשורה לכימיה או למשחק, החזר בעדינות לנושא.`;
let chatLog = [];
SCENES.atom = () => {
  let code = '', busy = false;
  try { code = localStorage.getItem('chem_class_code') || ''; } catch (e) { /* אין אחסון */ }
  stage.innerHTML = `<div class="panel"><h2>🤖 אטום</h2>
    <p class="dim small">אטום הוא מודל שפה. הוא נותן רמזים ולא תשובות, והוא יכול לטעות: בדוק אותו. אל תכתוב פרטים אישיים. נדרש קוד כיתה מהמורה.</p>
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="row" style="margin-top:10px">
      <input type="text" id="cc" placeholder="קוד כיתה" maxlength="20" style="max-width:150px" value="${esc(code)}" aria-label="קוד כיתה" dir="ltr">
      <input type="text" id="q" placeholder="שאל את אטום על כימיה..." maxlength="400" style="flex:1;min-width:180px" aria-label="שאלה לאטום">
      <button class="btn" id="send">שלח</button></div></div>`;
  const chat = $('#chat');
  const add = (who, text) => { const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = (who === 'ai' ? '🤖 ' : '') + text; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; };
  if (!chatLog.length) add('ai', 'מערכות חלקיות פעילות. במה נתקעת? תאר לי מה ניסית, ואתן רמז.');
  chatLog.forEach(m => add(m.role === 'user' ? 'me' : 'ai', m.content));
  const send = async () => {
    const q = $('#q').value.trim(), cc = $('#cc').value.trim().toUpperCase();
    if (busy || !q) return;
    if (!cc) return toast('כתוב את קוד הכיתה שקיבלת מהמורה.');
    busy = true; $('#send').disabled = true; $('#q').value = '';
    add('me', q); chatLog.push({ role: 'user', content: q });
    const wait = add('ai', 'חושב...');
    try {
      const r = await fetch(AI_PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: ATOM_SYSTEM, messages: chatLog.slice(-10), max_tokens: 500, purpose: 'chat', classCode: cc, student: S.name }) });
      const d = await r.json();
      if (d && d.error) throw new Error(d.error.message === 'NO_CLASS_CODE' ? 'קוד הכיתה לא מוכר. בדוק אותו מול המורה.' : (d.error.message || 'שגיאה בשרת.'));
      const txt = Array.isArray(d && d.content) ? d.content.filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim() : '';
      if (!txt) throw new Error('לא התקבלה תשובה.');
      try { localStorage.setItem('chem_class_code', cc); } catch (e) { /* אין אחסון */ }
      wait.textContent = '🤖 ' + txt; chatLog.push({ role: 'assistant', content: txt });
    } catch (e) {
      chatLog.pop();
      wait.textContent = '🤖 אין קשר עם אטום כרגע. ' + (e && e.message && !/fetch|network|load/i.test(e.message) ? e.message : 'בדוק את החיבור לרשת ונסה שוב.');
    }
    busy = false; $('#send').disabled = false; $('#q').focus();
  };
  $('#send').onclick = send;
  $('#q').onkeydown = e => { if (e.key === 'Enter') send(); };
};

/* ================= רקע: שמי העמק האפור ================= */
function sky() {
  const cv = $('#sky'), c = cv.getContext('2d');
  let W, H, bld = [], dust = [];
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const size = () => {
    W = cv.width = innerWidth; H = cv.height = innerHeight; seed = 11; bld = [];
    for (let layer = 0; layer < 3; layer++) { let x = -20; while (x < W + 40) { const w = 30 + rnd() * 70, h = (60 + rnd() * 190) * (1 - layer * 0.22); bld.push({ layer, x, w, h, cut: rnd() < 0.45, tilt: rnd() }); x += w + rnd() * 26; } }
    dust = Array.from({ length: Math.min(90, Math.round(W / 14)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.8, v: 0.15 + Math.random() * 0.5, a: 0.15 + Math.random() * 0.4 }));
  };
  const frame = () => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0d13'); g.addColorStop(0.5, '#1c1a22'); g.addColorStop(0.78, '#5a2c1c'); g.addColorStop(1, '#0b0f14');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sx = W * 0.72, sy = H * 0.7, sg = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.5);
    sg.addColorStop(0, '#ffb86b55'); sg.addColorStop(0.15, '#ff8a3d2e'); sg.addColorStop(1, '#ff8a3d00');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd9a8'; c.globalAlpha = 0.55; c.beginPath(); c.arc(sx, sy, 34, 0, 7); c.fill(); c.globalAlpha = 1;
    const base = H * 0.86;
    ['#2a1c1f', '#17141a', '#0c0d12'].forEach((col, layer) => {
      c.fillStyle = col;
      bld.filter(b => b.layer === 2 - layer).forEach(b => {
        const top = base - b.h + layer * 26;
        c.beginPath(); c.moveTo(b.x, H); c.lineTo(b.x, top + (b.cut ? b.tilt * 40 : 0));
        if (b.cut) { c.lineTo(b.x + b.w * 0.35, top); c.lineTo(b.x + b.w * 0.6, top + 22 * b.tilt); c.lineTo(b.x + b.w, top + 8); }
        else c.lineTo(b.x + b.w, top);
        c.lineTo(b.x + b.w, H); c.fill();
      });
    });
    dust.forEach(d => {
      c.globalAlpha = d.a; c.fillStyle = '#ffcf9a'; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill();
      d.x -= d.v; d.y += Math.sin(d.x / 40) * 0.15; if (d.x < -5) { d.x = W + 5; d.y = Math.random() * H; }
    });
    c.globalAlpha = 1;
    if (!still) requestAnimationFrame(frame);
  };
  addEventListener('resize', () => { size(); if (still) frame(); });
  size(); frame();
}

/* ================= הפעלה ================= */
$$('#hud nav button').forEach(b => b.onclick = () => go(b.dataset.go));
$('#hudProfile').onclick = () => go('profile');
load(); sky();
go(S.name ? 'map' : 'title');
