/**
 * Comandi a distanza (Alexa, o qualunque cosa sappia fare una POST HTTP).
 *
 * Alexa non parla Bluetooth e non potrà mai parlarlo: l'unico modo è che
 * qualcosa già connesso al topino stia in ascolto. Quel qualcosa è questa
 * stessa app, lasciata aperta e connessa su un dispositivo a casa.
 *
 * Il canale è ntfy.sh: un servizio pubblico di notifiche che non richiede
 * account. La skill Alexa ci scrive con una POST, qui restiamo in ascolto
 * con un EventSource. Nessun server da mantenere.
 *
 * Sicurezza: il segreto è il nome del canale, lungo e casuale. Chi lo
 * conosce può far muovere il topino — nient'altro, nessun accesso al
 * telefono o alla rete di casa. Per un topo di gomma è una soglia adeguata,
 * ma è giusto sapere che è quella.
 */

const NTFY = 'https://ntfy.sh';

/** Canale casuale, abbastanza lungo da non essere indovinabile. */
export function nuovoCanale() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return 'topino-' + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export class Remote extends EventTarget {
  /**
   * @param {import('./mouse-ble.js').MouseRacer} mouse
   * @param {import('./hunt.js').Hunt} hunt
   */
  constructor(mouse, hunt) {
    super();
    this.mouse = mouse;
    this.hunt = hunt;
    this.topic = '';
    this.es = null;
    this.lastCommand = null;
    this.lastAt = 0;
  }

  get listening() { return !!this.es; }
  get url() { return `${NTFY}/${this.topic}`; }

  start(topic) {
    this.stop();
    if (!topic) return;
    this.topic = topic;

    // EventSource riconnette da solo se la rete cade: esattamente quello che
    // serve a una cosa che deve restare in ascolto per ore.
    this.es = new EventSource(`${NTFY}/${topic}/sse`);
    this.es.onopen = () => this._emit('state', { on: true, error: null });
    this.es.onerror = () => this._emit('state', { on: true, error: 'rete assente, riprovo…' });
    this.es.onmessage = e => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.event !== 'message' || !d.message) return;   // gli altri sono keepalive
      this.exec(String(d.message).trim().toLowerCase());
    };
    this._emit('state', { on: true, error: null });
  }

  stop() {
    this.es?.close();
    this.es = null;
    this._emit('state', { on: false, error: null });
  }

  /** Esegue un comando testuale. Formato: `azione[:argomento[:extra]]`. */
  exec(cmd) {
    const [azione, arg, extra] = cmd.split(':');
    this.lastCommand = cmd;
    this.lastAt = Date.now();

    switch (azione) {
      case 'caccia': {
        if (arg === 'stop') { this.hunt.stop(); break; }
        if (arg) this.hunt.setProfile(arg);
        const minuti = parseFloat(extra);
        this.hunt.start(Number.isFinite(minuti) ? { minuti } : {});
        break;
      }

      case 'stop':
        this.hunt.stop();
        this.mouse.stop().catch(() => {});
        break;

      case 'velocita': {
        const n = parseInt(arg, 10);
        if (Number.isFinite(n)) this.mouse.setSpeedCap(Math.min(100, Math.max(10, n)) / 100);
        break;
      }

      default:
        this._emit('command', { cmd, ok: false });
        return;
    }
    this._emit('command', { cmd, ok: true });
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
