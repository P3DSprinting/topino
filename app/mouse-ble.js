/**
 * Driver BLE per il topino MORE App Mouse Racer
 * (Hangzhou Tianyuan Pet Products — rivenduto da Fressnapf col marchio MORE).
 *
 * Protocollo da reverse engineering di pinchies/WebBTLE_Mouse_Racer,
 * verificato sull'esemplare Fressnapf con tools/diag.html — vedi PROTOCOL.md.
 *
 * L'hardware accetta solo 8 direzioni discrete (bitmask) e una velocità 0-32.
 * Questo driver ci costruisce sopra un'API analogica: gli passi un vettore
 * (come lo stick di un joypad) e lui lo traduce in un flusso di pacchetti.
 */

/* ── protocollo ─────────────────────────────────────────────── */
export const SVC_MAIN  = 0xae00;
export const CH_WRITE  = 0xae01;
export const CH_NOTIFY = 0xae02;

const HEAD = 0x5a, TAIL = 0xa5;
const UNLOCK = Object.freeze([0x5a, 0x5f, 0x06, 0xdb, 0xb9, 0x2e, 0x28, 0x4f, 0xa5]);

/** Bitmask direzione: avanti 1, indietro 2, sinistra 4, destra 8; le diagonali sono l'OR.
 *  Indice = ottavo di giro in senso orario partendo da "avanti". */
/* Mappa confermata sul topino reale: 1→avanti, 2→indietro, 4→sinistra, 8→destra. */
const DIRS = Object.freeze([
  1,      // 0°   ↑
  1 | 8,  // 45°  ↗  = 9
  8,      // 90°  →
  2 | 8,  // 135° ↘  = 10
  2,      // 180° ↓
  2 | 4,  // 225° ↙  = 6
  4,      // 270° ←
  1 | 4,  // 315° ↖  = 5
]);

/* ── parametri regolabili ───────────────────────────────────── */
/* Valori misurati sull'esemplare reale con tools/calib.html — vedi PROTOCOL.md.
   Il firmware ha un watchdog: se smette di ricevere pacchetti si ferma da solo
   dopo 1-3 secondi. Quindi lo streaming continuo non è un'ottimizzazione, è
   l'unico modo per tenerlo in movimento — e ci regala una sicurezza gratis,
   perché se l'app si pianta o il telefono si blocca il topino si arresta. */
export const CONFIG = {
  txHz: 20,            // pacchetti al secondo: ben dentro il watchdog del firmware
  minSpeed: 2,         // misurato: sotto 2 i motori non girano
  maxSpeed: 32,        // massimo accettato dal firmware
  deadzone: 0.12,      // escursione stick ignorata attorno al centro
  inputTimeoutMs: 400, // nessun input più recente di così ⇒ stop di sicurezza
  blend: true,         // duty-cycle fra direzioni adiacenti (curve continue)
  reconnectDelayMs: 1200,
  reconnectTries: 5,
};

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const toHex = b => [...b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');

/* ── driver ─────────────────────────────────────────────────── */
export class MouseRacer extends EventTarget {
  constructor(config = {}) {
    super();
    this.cfg = { ...CONFIG, ...config };

    this.device = null;
    this.chWrite = null;
    this.chNotify = null;
    this._noResponse = false;

    /** vettore desiderato, coordinate schermo: x destra, y avanti, entrambi in [-1,1] */
    this._vec = { x: 0, y: 0 };
    this._lastInputAt = 0;
    this._speedCap = 1;      // tetto 0..1 impostato dallo slider
    this._boost = false;

    this._running = false;
    this._blendAcc = 0;      // accumulatore di error diffusion per il duty-cycle
    this._lastSent = null;
    this._reconnecting = false;
    this._manualDisconnect = false;

    this.stats = { tx: 0, errors: 0, lastWriteMs: 0 };
  }

  get connected() { return !!this.device?.gatt?.connected && !!this.chWrite; }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _status(state, message = '') { this._emit('status', { state, message }); }

  /* ── connessione ─────────────────────────────────────────── */

  /** Va chiamata da un gesto dell'utente: Web Bluetooth non apre il selettore altrimenti. */
  async connect({ anyDevice = false } = {}) {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth non disponibile: serve Chrome su Android/desktop (su iPhone usa Bluefy) e la pagina deve stare su HTTPS.');
    }
    this._manualDisconnect = false;
    this._status('scanning');

    this.device = await navigator.bluetooth.requestDevice(
      anyDevice
        ? { acceptAllDevices: true, optionalServices: [SVC_MAIN] }
        : { filters: [{ name: 'pets' }], optionalServices: [SVC_MAIN] }
    );
    this.device.addEventListener('gattserverdisconnected', () => this._onDisconnected());

    await this._openGatt();
  }

  async _openGatt() {
    this._status('connecting');
    const server = await this.device.gatt.connect();
    const svc = await server.getPrimaryService(SVC_MAIN);

    this.chWrite = await svc.getCharacteristic(CH_WRITE);
    this._noResponse = !!this.chWrite.properties.writeWithoutResponse;

    // Le notifiche non sono indispensabili: se il firmware non le espone, si tira dritto.
    try {
      this.chNotify = await svc.getCharacteristic(CH_NOTIFY);
      await this.chNotify.startNotifications();
      this.chNotify.addEventListener('characteristicvaluechanged', e =>
        this._emit('notify', { bytes: new Uint8Array(e.target.value.buffer) }));
    } catch { this.chNotify = null; }

    await this.unlock();
    this._status('connected', this.device.name || '');
    this.start();
  }

  async _onDisconnected() {
    this._running = false;
    this.chWrite = this.chNotify = null;
    if (this._manualDisconnect) { this._status('disconnected'); return; }

    // Caduta involontaria (topino spento, fuori portata, batteria): riprovo qualche volta.
    if (this._reconnecting) return;
    this._reconnecting = true;
    for (let i = 1; i <= this.cfg.reconnectTries; i++) {
      this._status('reconnecting', `tentativo ${i}/${this.cfg.reconnectTries}`);
      await sleep(this.cfg.reconnectDelayMs);
      try { await this._openGatt(); this._reconnecting = false; return; }
      catch { /* riprova */ }
    }
    this._reconnecting = false;
    this._status('disconnected', 'riconnessione fallita');
  }

  async disconnect() {
    this._manualDisconnect = true;
    this._running = false;
    try { await this.sendStop(); } catch { /* già andato */ }
    this.device?.gatt?.disconnect();
  }

  /* ── comandi ─────────────────────────────────────────────── */

  /** Il firmware ignora i comandi di movimento finché non riceve questa sequenza. */
  unlock() { return this._write(UNLOCK, 'unlock'); }

  /**
   * Input analogico. x = destra, y = avanti, in coordinate cartesiane [-1,1].
   * Chiamala a ogni frame: è anche il "sono vivo" per il watchdog.
   */
  setVector(x, y) {
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }   // il quadrato dello stick diventa un cerchio
    this._vec.x = x;
    this._vec.y = y;
    this._lastInputAt = performance.now();
  }

  /** Tetto di velocità 0..1 (lo slider). Il boost lo scavalca. */
  setSpeedCap(cap) { this._speedCap = clamp(cap, 0, 1); }
  setBoost(on) { this._boost = !!on; }

  /** Ferma tutto: azzera il vettore e manda subito i pacchetti di stop. */
  async stop() {
    this._vec.x = this._vec.y = 0;
    this._lastInputAt = performance.now();
    await this.sendStop();
  }

  /** Lo stop è l'unico comando che non possiamo permetterci di perdere: lo ripeto. */
  async sendStop(times = 3) {
    this._lastSent = null;
    for (let i = 0; i < times; i++) {
      await this._write([HEAD, 0x00, 0x00, 0x00, 0x00, TAIL], 'stop');
      if (i < times - 1) await sleep(20);
    }
  }

  /* ── loop di trasmissione ────────────────────────────────── */

  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  /**
   * Loop auto-cadenzato: aspetta che la write precedente sia finita prima di
   * pensare alla successiva. GATT serve una write per volta — accodandole si
   * accumula un ritardo che cresce senza limite e il topino risponde in ritardo
   * di secondi. Qui se il canale è lento il loop rallenta, non si ingolfa.
   */
  async _loop() {
    while (this._running && this.connected) {
      const t0 = performance.now();
      try { await this._tick(); } catch { this.stats.errors++; }
      await sleep(Math.max(0, 1000 / this.cfg.txHz - (performance.now() - t0)));
    }
    this._running = false;
  }

  async _tick() {
    // Watchdog: se il pollice ha lasciato lo schermo o la pagina è finita in
    // background, il topino non deve continuare a correre da solo.
    if (performance.now() - this._lastInputAt > this.cfg.inputTimeoutMs) {
      this._vec.x = this._vec.y = 0;
    }

    const { x, y } = this._vec;
    const mag = Math.min(1, Math.hypot(x, y));

    if (mag < this.cfg.deadzone) {
      if (this._lastSent !== 'stop') { this._lastSent = 'stop'; await this.sendStop(1); }
      return;
    }

    // fuori dalla deadzone rimappo 0..1 sull'escursione utile
    const t = (mag - this.cfg.deadzone) / (1 - this.cfg.deadzone);
    const cap = this._boost ? 1 : this._speedCap;
    const speed = Math.round(this.cfg.minSpeed + t * cap * (this.cfg.maxSpeed - this.cfg.minSpeed));

    // atan2(x, y) e non (y, x): voglio l'angolo da "avanti", in senso orario
    const angle = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    const dir = this._pickDirection(angle);

    this._lastSent = 'move';
    await this._write([HEAD, dir, speed, 0x00, (dir + speed) & 0xff, TAIL], 'move');
  }

  /**
   * Da angolo continuo a bitmask discreta.
   *
   * Il firmware conosce solo 8 direzioni: preso alla lettera, sterzare darebbe
   * otto scatti secchi (il difetto della croce direzionale ufficiale). Qui
   * alterno le due direzioni adiacenti tick per tick, in proporzione a quanto
   * l'angolo è vicino all'una o all'altra — a 20 Hz l'inerzia del topino media
   * i due valori e la curva viene continua.
   *
   * La distribuzione usa error diffusion, non il caso: con frazione 0.25 esce
   * A A A B A A A B (regolare) invece di grappoli casuali che si sentirebbero
   * come strattoni.
   */
  _pickDirection(angle) {
    const pos = angle / 45;
    const i = Math.floor(pos) % 8;
    const frac = pos - Math.floor(pos);

    if (!this.cfg.blend) return DIRS[Math.round(pos) % 8];

    this._blendAcc += frac;
    if (this._blendAcc >= 1) { this._blendAcc -= 1; return DIRS[(i + 1) % 8]; }
    return DIRS[i];
  }

  /* ── I/O ─────────────────────────────────────────────────── */
  async _write(bytes, tag) {
    if (!this.chWrite) return;
    const data = new Uint8Array(bytes);
    const t0 = performance.now();
    if (this._noResponse) await this.chWrite.writeValueWithoutResponse(data);
    else await this.chWrite.writeValue(data);
    this.stats.lastWriteMs = performance.now() - t0;
    this.stats.tx++;
    this._emit('packet', { bytes: data, tag });
  }
}
