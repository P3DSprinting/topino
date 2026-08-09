/**
 * Modalità caccia: fa muovere il topino da solo, in modo che sembri vivo.
 *
 * Un movimento regolare annoia il gatto in fretta: quello che innesca l'istinto
 * predatorio è l'alternanza fra immobilità e scatto improvviso — il topo che si
 * blocca quando si sente osservato e schizza via appena il gatto si avvicina.
 * Da qui la macchina a stati: pause vere (velocità zero), scatti brevi,
 * cambi di direzione netti e qualche retromarcia.
 */

const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = arr => arr[(Math.random() * arr.length) | 0];
/** Estrazione pesata: [[valore, peso], …] */
const weighted = pairs => {
  let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};

export const PROFILES = {
  timido: {
    label: 'Timido',
    pause: [0.9, 2.6], dart: [0.25, 0.7], speed: [0.35, 0.6],
    turnRange: [50, 160],
    actions: [['pause', 5], ['dart', 3], ['turn', 2], ['retreat', 1.5], ['skitter', 0.5]],
  },
  nervoso: {
    label: 'Nervoso',
    pause: [0.3, 1.3], dart: [0.45, 1.2], speed: [0.5, 0.85],
    turnRange: [40, 150],
    actions: [['pause', 3], ['dart', 5], ['turn', 2.5], ['retreat', 1], ['skitter', 1.5]],
  },
  impazzito: {
    label: 'Impazzito',
    pause: [0.1, 0.45], dart: [0.35, 0.9], speed: [0.75, 1],
    turnRange: [70, 180],
    actions: [['pause', 1], ['dart', 5], ['turn', 3], ['retreat', 1.5], ['skitter', 3]],
  },
};

export class Hunt extends EventTarget {
  /** @param {import('./mouse-ble.js').MouseRacer} mouse */
  constructor(mouse, { autoStopMinutes = 10 } = {}) {
    super();
    this.mouse = mouse;
    this.autoStopMs = autoStopMinutes * 60_000;
    this.profile = PROFILES.nervoso;

    this.running = false;
    this._heading = 0;        // gradi, 0 = avanti
    this._vec = { x: 0, y: 0 };
    this._pushTimer = null;   // tiene sveglio il watchdog del driver
    this._actionTimer = null;
    this._stopTimer = null;
  }

  setProfile(name) { this.profile = PROFILES[name] || PROFILES.nervoso; }

  start() {
    this.stop(true);
    this.running = true;
    this._heading = rand(0, 360);

    // Il driver si ferma se non riceve input per 400 ms: qui glielo rinfresco.
    this._pushTimer = setInterval(() => this.mouse.setVector(this._vec.x, this._vec.y), 120);
    this._stopTimer = setTimeout(() => { this.stop(); this._emit(); }, this.autoStopMs);

    this._next();
    this._emit();
  }

  stop(silent = false) {
    clearInterval(this._pushTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._stopTimer);
    this._pushTimer = this._actionTimer = this._stopTimer = null;
    if (!this.running) return;
    this.running = false;
    this._vec = { x: 0, y: 0 };
    this.mouse.stop().catch(() => {});
    if (!silent) this._emit();
  }

  _emit() { this.dispatchEvent(new Event('change')); }

  _setHeading(deg, speed) {
    this._heading = (deg % 360 + 360) % 360;
    const rad = this._heading * Math.PI / 180;
    // stesso sistema del driver: angolo orario a partire da "avanti"
    this._vec = { x: Math.sin(rad) * speed, y: Math.cos(rad) * speed };
  }

  _next() {
    if (!this.running) return;
    const p = this.profile;
    const action = weighted(p.actions);
    let duration;

    switch (action) {
      case 'pause':                        // immobile: il momento che fa avvicinare il gatto
        this._vec = { x: 0, y: 0 };
        duration = rand(...p.pause);
        break;

      case 'dart':                         // scatto in avanti nella direzione attuale
        this._setHeading(this._heading + rand(-18, 18), rand(...p.speed));
        duration = rand(...p.dart);
        break;

      case 'turn': {                       // virata secca e ripartenza
        const delta = pick([-1, 1]) * rand(...p.turnRange);
        this._setHeading(this._heading + delta, rand(p.speed[0], p.speed[1]) * 0.8);
        duration = rand(0.25, 0.6);
        break;
      }

      case 'retreat':                      // marcia indietro improvvisa
        this._setHeading(180 + rand(-35, 35), rand(0.4, 0.75));
        duration = rand(0.3, 0.8);
        break;

      case 'skitter': {                    // zigzag rapido: la fuga in panico
        const side = pick([-1, 1]);
        this._setHeading(this._heading + side * 55, rand(...p.speed));
        duration = rand(0.15, 0.3);
        // il secondo mezzo zigzag parte da solo a metà durata
        setTimeout(() => {
          if (this.running) this._setHeading(this._heading - side * 110, rand(...p.speed));
        }, duration * 1000);
        duration *= 2;
        break;
      }
    }

    this.mouse.setVector(this._vec.x, this._vec.y);
    this._actionTimer = setTimeout(() => this._next(), duration * 1000);
  }
}
