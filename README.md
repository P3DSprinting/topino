# Topino

Joystick analogico via Bluetooth LE per il topo scattante **MORE App Mouse Racer**
(MultiFit / Fressnapf, EAN `4047777200697`), in sostituzione della croce
direzionale a quattro pulsanti dell'app ufficiale.

**App:** https://p3dsprinting.github.io/topino/app/

## Perché

Il giocattolo si comanda dal telefono, ma l'app ufficiale ha quattro pulsanti
direzionali e uno slider separato per la velocità: si va solo nelle quattro
direzioni cardinali, a scatti, e serve la seconda mano.

Qui c'è un joystick analogico — direzione e velocità con un pollice solo — su un
hardware che nativamente conosce **solo 8 direzioni discrete**. Le curve continue
si ottengono alternando le due direzioni adiacenti 20 volte al secondo, in
proporzione all'angolo richiesto: a quella frequenza l'inerzia del topino media i
due valori. Dettagli in [PROTOCOL.md](PROTOCOL.md).

## Funzioni

- **Joystick analogico** che nasce sotto il pollice, ovunque tu lo appoggi.
- **Due schemi di comando**: uno stick (direzione e velocità insieme) oppure
  **due stick stile radiocomandata** — sinistro acceleratore, destro sterzo.
  A gas fermo lo sterzo fa ruotare il topino sul posto.
- **Limite di velocità** regolabile + tasto **boost** che lo scavalca finché lo tieni premuto.
- **Modalità caccia**: il topino si muove da solo con pattern da preda
  (pause immobili, scatti, zigzag, retromarcia) in tre profili. Si spegne da sola dopo 10 minuti.
- **Joypad**: stick sinistro, R2 per il boost, cerchio per lo stop. Testato con DualSense.
- **PWA**: si installa dalla schermata Home, va a schermo intero e funziona offline.
- **Comandi vocali Alexa** da fuori casa — «Alexa, chiedi a topo scattante di avviare la caccia».
  Vedi [`alexa/README.md`](alexa/README.md): serve solo un account Amazon Developer
  gratuito, niente AWS e niente server.
- Fermate di sicurezza al rilascio, a schermo spento e in caso di disconnessione.

## Requisiti

| | |
|---|---|
| Android | Chrome. Serve anche la **posizione attiva** (lo impone Android per la ricerca BLE). |
| iPhone | Safari non supporta il Web Bluetooth: serve il browser gratuito **Bluefy**. |
| Desktop | Chrome o Edge. |

Il topino accetta **una sola connessione**: se l'app ufficiale è collegata, chiudila.

## Struttura

```
app/
  index.html          plancia di guida
  mouse-ble.js        driver BLE: vettore analogico → pacchetti a 8 direzioni
  hunt.js             modalità caccia (macchina a stati)
  app.js              input: pollice, joypad, tastiera
  remote.js           ascolto comandi a distanza via ntfy.sh (Alexa)
  sw.js               service worker (funziona offline)
alexa/
  index.js            codice della skill Alexa-hosted
  interaction-model.json  modello vocale italiano
  README.md           istruzioni passo passo per la console Amazon
tools/
  calib.html          calibrazione guidata: direzioni, watchdog, velocità minima
  diag.html           diagnostica BLE: albero GATT, pacchetti grezzi
  make-icons.py       genera le icone PWA
PROTOCOL.md           protocollo BLE verificato
```

## Sviluppo

```bash
python -m http.server 8080
```

Il Web Bluetooth richiede un contesto sicuro: `http://localhost` va bene,
`file://` no.

## Crediti

Protocollo BLE a partire dal reverse engineering di
[pinchies/WebBTLE_Mouse_Racer](https://github.com/pinchies/WebBTLE_Mouse_Racer)
(toy di Hangzhou Tianyuan Pet Products), verificato sull'esemplare Fressnapf.

Progetto non affiliato a MultiFit Tiernahrungs GmbH né a Fressnapf.
