/**
 * Topino — plancia di guida.
 * Raccoglie l'input (pollice, joypad, tastiera) e lo passa al driver come vettore.
 */
import { MouseRacer } from './mouse-ble.js';
import { Hunt } from './hunt.js';
import { Remote, nuovoCanale } from './remote.js';

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

const mouse = new MouseRacer();
const hunt = new Hunt(mouse);
const remote = new Remote(mouse, hunt);

/* ── preferenze ─────────────────────────────────────────────── */
const PREFS_KEY = 'topino.prefs.v1';
const prefs = {
  blend: true, invert: false, deadzone: 12, minSpeed: 2, hz: 20,
  cap: 55, profile: 'nervoso', dual: false,
  remote: false, topic: '',
  ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'),
};
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

function applyPrefs() {
  mouse.cfg.blend    = prefs.blend;
  mouse.cfg.deadzone = prefs.deadzone / 100;
  mouse.cfg.minSpeed = prefs.minSpeed;
  mouse.cfg.txHz     = prefs.hz;
  mouse.setSpeedCap(prefs.cap / 100);
  hunt.setProfile(prefs.profile);

  $('optBlend').checked    = prefs.blend;
  $('optInvert').checked   = prefs.invert;
  $('optDeadzone').value   = prefs.deadzone;  $('dzVal').textContent = prefs.deadzone + '%';
  $('optMinSpeed').value   = prefs.minSpeed;  $('msVal').textContent = prefs.minSpeed;
  $('optHz').value         = prefs.hz;        $('hzVal').textContent = prefs.hz + ' Hz';
  $('speedCap').value      = prefs.cap;       $('capVal').textContent = prefs.cap + '%';
  document.querySelectorAll('#huntProfile button')
    .forEach(b => b.classList.toggle('on', b.dataset.profile === prefs.profile));

  document.body.classList.toggle('dual', prefs.dual);
  $('stickZoneR').classList.toggle('hidden', !prefs.dual);
  document.querySelectorAll('#ctrlMode button')
    .forEach(b => b.classList.toggle('on', (b.dataset.mode === 'dual') === prefs.dual));
  const hint = $('stickZone').querySelector('.stick-hint');
  hint.textContent = prefs.dual ? hint.dataset.dual : hint.dataset.mono;
}

/* ── toast ──────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ── connessione ────────────────────────────────────────────── */
async function connect(anyDevice = false) {
  const btn = $('btnConnect');
  const msg = $('splashMsg');
  btn.disabled = true;
  msg.className = 'msg'; msg.textContent = 'ricerca in corso…';
  try {
    if (await navigator.bluetooth.getAvailability?.() === false)
      throw new Error('Il Bluetooth sembra spento: accendilo e riprova.');
    await mouse.connect({ anyDevice });
  } catch (e) {
    // Chiudere il selettore di Chrome lancia NotFoundError, esattamente come
    // quando la lista era vuota: i due casi non sono distinguibili, quindi
    // do il consiglio che risolve quello che capita più spesso.
    const cancelled = e.name === 'NotFoundError';
    msg.className = 'msg' + (cancelled ? '' : ' err');
    msg.textContent = cancelled
      ? (anyDevice
          ? 'Nessun dispositivo scelto. Se "pets" non compare nemmeno qui, spegni e riaccendi il topino.'
          : 'Non trovato? Il topino resta invisibile se è ancora collegato al PC o all\'app ufficiale. Vedi l\'elenco qui sotto.')
      : e.message;
    if (cancelled && !anyDevice) $('splash').querySelector('.help').open = true;
  } finally {
    btn.disabled = false;
  }
}
$('btnConnect').onclick  = () => connect(false);
$('btnAnyDevice').onclick = () => connect(true);

mouse.addEventListener('status', e => {
  const { state, message } = e.detail;
  const dot = $('dot'), label = $('state');

  if (state === 'connected') {
    $('splash').classList.add('hidden');
    $('hud').classList.remove('hidden');
    dot.className = 'dot ok';
    label.textContent = message || 'connesso';
    goImmersive();
  } else if (state === 'reconnecting') {
    dot.className = 'dot warn';
    label.textContent = 'riconnessione… ' + (message || '');
  } else if (state === 'disconnected') {
    hunt.stop();
    dot.className = 'dot err';
    label.textContent = 'disconnesso';
    $('hud').classList.add('hidden');
    $('splash').classList.remove('hidden');
    const m = $('splashMsg');
    m.className = 'msg' + (message ? ' err' : '');
    m.textContent = message || 'disconnesso';
    releaseWakeLock();
  } else {
    dot.className = 'dot warn';
    label.textContent = state === 'scanning' ? 'ricerca…' : 'connessione…';
  }
});

$('btnDisconnect').onclick = () => { closeSheet(); mouse.disconnect(); };

/* ── schermo sempre acceso + schermo intero ─────────────────── */
let wakeLock = null;
async function goImmersive() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* non supportato */ }
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* rifiutato */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* non consentito su desktop */ }
}
function releaseWakeLock() { wakeLock?.release?.(); wakeLock = null; }
// il wake lock cade quando la pagina va in background: va ripreso al ritorno
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    hunt.stop();
    mouse.stop().catch(() => {});   // telefono in tasca ⇒ topino fermo
  } else if (mouse.connected && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* ignora */ }
  }
});

/* ── joystick ───────────────────────────────────────────────── */

const stickRadius = () => clamp(Math.min(innerWidth, innerHeight) * 0.26, 76, 130);

/**
 * Joystick fluttuante su una zona dello schermo: l'origine nasce dove atterra
 * il pollice, non in un punto fisso.
 * `axis` limita la corsa — a due stick il gas è solo verticale e lo sterzo solo
 * orizzontale, così un pollice non può sporcare l'asse dell'altro.
 */
function makeStick(zone, axis = 'both') {
  const base = zone.querySelector('.stick-base');
  const knob = zone.querySelector('.stick-knob');
  let id = null, ox = 0, oy = 0, radius = 110;
  const vec = { x: 0, y: 0 };

  const down = e => {
    if (id !== null) return;                   // un solo pollice per zona
    id = e.pointerId;
    radius = stickRadius();

    // L'origine va fissata PRIMA di qualunque cosa possa fallire: se restasse
    // a zero, lo stick crederebbe il pollice all'estremità e lancerebbe il
    // topino a tutta velocità nella direzione sbagliata.
    const r = zone.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    base.style.left = ox + 'px';
    base.style.top = oy + 'px';
    base.style.width = base.style.height = radius * 2 + 'px';
    base.style.margin = `${-radius}px 0 0 ${-radius}px`;

    // il pollice che esce dalla zona non deve perdere il comando
    try { zone.setPointerCapture(e.pointerId); } catch { /* puntatore già chiuso */ }

    zone.classList.add('active');
    hunt.stop();                               // il tocco riprende il controllo manuale
    move(e);
    startBeat();
  };

  const move = e => {
    if (e.pointerId !== id) return;
    const r = zone.getBoundingClientRect();
    let dx = axis === 'y' ? 0 : e.clientX - r.left - ox;
    let dy = axis === 'x' ? 0 : e.clientY - r.top - oy;

    const d = Math.hypot(dx, dy);
    if (d > radius) { dx *= radius / d; dy *= radius / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    vec.x = dx / radius;
    vec.y = -dy / radius;                      // lo schermo cresce in basso, il topino in avanti
    pushSticks();
  };

  const up = e => {
    if (e.pointerId !== id) return;
    id = null;
    vec.x = vec.y = 0;
    zone.classList.remove('active');
    knob.style.transform = 'translate(0,0)';
    stopBeatIfIdle();
  };

  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  zone.addEventListener('contextmenu', e => e.preventDefault());

  return { vec, get active() { return id !== null; } };
}

const stickL = makeStick($('stickZone'));
const stickR = makeStick($('stickZoneR'), 'x');

/** Da angolo (gradi, 0 = avanti, orario) e intensità al vettore che vuole il driver. */
const polar = (deg, mag) => {
  const r = deg * Math.PI / 180;
  return { x: Math.sin(r) * mag, y: Math.cos(r) * mag };
};

/**
 * Schema radiocomandata: il gas decide *quanto* e in che verso, lo sterzo
 * *quanto piega*. Il topino conosce solo 8 direzioni, quindi lo sterzo pieno
 * corrisponde a una diagonale (45° dalla marcia) e il driver interpola il resto.
 * A gas fermo lo sterzo lo fa ruotare sul posto — comodo per puntarlo.
 */
function dualToVector(gas, steer) {
  const dz = prefs.deadzone / 100;
  const ag = Math.abs(gas), as = Math.abs(steer);

  if (ag < dz) return as < dz ? { x: 0, y: 0 } : polar(steer > 0 ? 90 : 270, as);

  // in retromarcia specchio l'angolo, così "destra" resta la destra dello schermo
  return gas >= 0 ? polar(steer * 45, ag) : polar(180 - steer * 45, ag);
}

function pushSticks() {
  const inv = prefs.invert ? -1 : 1;
  if (prefs.dual) {
    const v = dualToVector(stickL.vec.y * inv, stickR.vec.x);
    mouse.setVector(v.x, v.y);
  } else {
    mouse.setVector(stickL.vec.x, stickL.vec.y * inv);
  }
}

/* Un pollice fermo non genera eventi: senza questo battito il driver crederebbe
   che l'input sia sparito e fermerebbe il topino dopo 400 ms, proprio mentre
   stai tenendo lo stick premuto. */
let stickBeat = null;
function startBeat() {
  if (!stickBeat) stickBeat = setInterval(pushSticks, 100);
}
function stopBeatIfIdle() {
  if (stickL.active || stickR.active) { pushSticks(); return; }
  clearInterval(stickBeat); stickBeat = null;
  mouse.stop().catch(() => {});
}

/* ── boost / stop / caccia ──────────────────────────────────── */
const boostBtn = $('btnBoost');
const setBoost = on => {
  mouse.setBoost(on);
  boostBtn.classList.toggle('on', on);
  document.body.classList.toggle('boosting', on);
  if (on) navigator.vibrate?.(18);
};
boostBtn.addEventListener('pointerdown', e => { e.preventDefault(); setBoost(true); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  boostBtn.addEventListener(ev, () => setBoost(false)));

$('btnStop').onclick = () => { hunt.stop(); mouse.stop(); navigator.vibrate?.(30); toast('fermo'); };

$('btnHunt').onclick = () => {
  if (hunt.running) { hunt.stop(); toast('caccia finita'); }
  else { hunt.start(); toast(`caccia: ${prefs.profile} · si ferma da sola dopo 10 min`); }
};
hunt.addEventListener('change', () => {
  $('btnHunt').classList.toggle('on', hunt.running);
  $('btnHunt').textContent = hunt.running ? '⏹ STOP' : '🐾 CACCIA';
});

$('speedCap').addEventListener('input', e => {
  prefs.cap = +e.target.value;
  mouse.setSpeedCap(prefs.cap / 100);
  $('capVal').textContent = prefs.cap + '%';
  savePrefs();
});

/* ── joypad (DualSense e simili) ────────────────────────────── */
/* Lo stick fisico è più preciso del pollice sul vetro: comodo per provare dal PC. */
let padIndex = null;
addEventListener('gamepadconnected', e => {
  padIndex = e.gamepad.index;
  toast('joypad collegato: ' + e.gamepad.id.slice(0, 32));
});
addEventListener('gamepaddisconnected', e => { if (padIndex === e.gamepad.index) padIndex = null; });

function pollGamepad() {
  requestAnimationFrame(pollGamepad);
  if (padIndex === null || stickL.active || stickR.active) return;  // il tocco ha la precedenza
  const pad = navigator.getGamepads?.()[padIndex];
  if (!pad) return;

  const inv = prefs.invert ? -1 : 1;
  let x, y;
  if (prefs.dual) {
    // stick sinistro verticale = gas, stick destro orizzontale = sterzo
    const v = dualToVector(-(pad.axes[1] ?? 0) * inv, pad.axes[2] ?? 0);
    x = v.x; y = v.y;
  } else {
    x = pad.axes[0] ?? 0;
    y = -(pad.axes[1] ?? 0) * inv;
  }
  if (Math.hypot(x, y) > 0.02) { hunt.stop(); mouse.setVector(x, y); }

  const r2 = pad.buttons[7]?.value ?? 0;               // grilletto destro
  setBoostFromPad(r2 > 0.5);
  if (pad.buttons[1]?.pressed) { hunt.stop(); mouse.stop(); }  // cerchio = stop
}
let padBoost = false;
function setBoostFromPad(on) { if (on !== padBoost) { padBoost = on; setBoost(on); } }
requestAnimationFrame(pollGamepad);

/* ── tastiera (comodo per provare dal PC) ───────────────────── */
const keys = new Set();
const KEYMAP = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r' };
addEventListener('keydown', e => {
  if (e.key === ' ') { e.preventDefault(); hunt.stop(); mouse.stop(); return; }
  if (e.key === 'Shift') setBoost(true);
  const k = KEYMAP[e.key];
  if (k && !keys.has(k)) { keys.add(k); hunt.stop(); pushKeys(); }
});
addEventListener('keyup', e => {
  if (e.key === 'Shift') setBoost(false);
  const k = KEYMAP[e.key];
  if (k) { keys.delete(k); pushKeys(); }
});
function pushKeys() {
  const x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
  const y = (keys.has('u') ? 1 : 0) - (keys.has('d') ? 1 : 0);
  if (!x && !y) mouse.stop().catch(() => {});
  else mouse.setVector(x, y * (prefs.invert ? -1 : 1));
}
// la tastiera non "rilascia" da sola: senza questo il topino resterebbe lanciato
setInterval(() => { if (keys.size) pushKeys(); }, 100);

/* ── impostazioni ───────────────────────────────────────────── */
const closeSheet = () => $('sheet').classList.add('hidden');
$('btnMenu').onclick = () => $('sheet').classList.remove('hidden');
$('btnCloseSheet').onclick = closeSheet;
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });

const bindCheck = (id, key) => $(id).addEventListener('change', e => {
  prefs[key] = e.target.checked; applyPrefs(); savePrefs();
});
bindCheck('optBlend', 'blend');
bindCheck('optInvert', 'invert');

const bindRange = (id, key) => $(id).addEventListener('input', e => {
  prefs[key] = +e.target.value; applyPrefs(); savePrefs();
});
bindRange('optDeadzone', 'deadzone');
bindRange('optMinSpeed', 'minSpeed');
bindRange('optHz', 'hz');

/* ── comandi a distanza (Alexa) ─────────────────────────────── */
if (!prefs.topic) { prefs.topic = nuovoCanale(); savePrefs(); }

function applyRemote() {
  $('remoteTopic').textContent = prefs.topic;
  $('optRemote').checked = prefs.remote;
  if (prefs.remote) remote.start(prefs.topic); else remote.stop();
}

remote.addEventListener('state', e => {
  const { on, error } = e.detail;
  const el = $('remoteState');
  el.className = on && !error ? 'on' : '';
  el.textContent = !on ? 'non in ascolto' : (error || 'in ascolto ✓');
});
remote.addEventListener('command', e => {
  const { cmd, ok } = e.detail;
  toast(ok ? `da Alexa: ${cmd}` : `comando sconosciuto: ${cmd}`);
  navigator.vibrate?.(ok ? 25 : [20, 60, 20]);
});

$('optRemote').addEventListener('change', e => {
  prefs.remote = e.target.checked; savePrefs(); applyRemote();
  if (prefs.remote) toast('in ascolto. Lascia l\'app aperta e connessa.', 4000);
});
$('btnCopyTopic').onclick = () => navigator.clipboard.writeText(prefs.topic)
  .then(() => toast('canale copiato'));
$('btnNewTopic').onclick = () => {
  prefs.topic = nuovoCanale(); savePrefs(); applyRemote();
  toast('canale nuovo: va aggiornato anche nella skill Alexa', 4000);
};

document.querySelectorAll('#ctrlMode button').forEach(b => b.onclick = () => {
  prefs.dual = b.dataset.mode === 'dual';
  mouse.stop().catch(() => {});
  applyPrefs(); savePrefs();
  toast(prefs.dual ? 'due stick: sinistro gas, destro sterzo' : 'uno stick: direzione e velocità insieme');
});

document.querySelectorAll('#huntProfile button').forEach(b => b.onclick = () => {
  prefs.profile = b.dataset.profile; applyPrefs(); savePrefs();
  if (hunt.running) hunt.start();   // riparte col profilo nuovo
});

/* ── indicatori ─────────────────────────────────────────────── */
const ARROWS = { 1: '↑', 9: '↗', 8: '→', 10: '↘', 2: '↓', 6: '↙', 4: '←', 5: '↖', 0: '·' };
let lastPacket = null;
mouse.addEventListener('packet', e => { if (e.detail.tag !== 'unlock') lastPacket = e.detail.bytes; });

setInterval(() => {
  if (!mouse.connected) return;
  if (lastPacket) {
    const [, dir, speed] = lastPacket;
    const pct = Math.round(speed / mouse.cfg.maxSpeed * 100);
    $('readout').textContent = `${ARROWS[dir] ?? '?'} ${String(pct).padStart(3)}%`;
  }
  $('stats').textContent =
    `pacchetti inviati ${mouse.stats.tx} · errori ${mouse.stats.errors}\n` +
    `ultima scrittura ${mouse.stats.lastWriteMs.toFixed(1)} ms · frequenza ${mouse.cfg.txHz} Hz\n` +
    `caccia ${hunt.running ? 'attiva (' + prefs.profile + ')' : 'ferma'}`;
}, 250);

/* ── service worker ─────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

applyPrefs();
applyRemote();

// gancio per provare la plancia da locale senza il topino acceso
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__topino = { mouse, hunt, remote, prefs };
}

if (!navigator.bluetooth) {
  const m = $('splashMsg');
  m.className = 'msg err';
  m.textContent = /iPhone|iPad/.test(navigator.userAgent)
    ? 'Safari non supporta il Bluetooth web. Apri questa pagina con l\'app gratuita Bluefy.'
    : 'Questo browser non supporta il Bluetooth web: usa Chrome o Edge.';
  $('btnConnect').disabled = true;
}
