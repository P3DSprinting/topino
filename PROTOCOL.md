# Protocollo BLE — MORE App Mouse Racer

Giocattolo: **MORE APP MOUSE RACER**, MultiFit Tiernahrungs GmbH (marchio Fressnapf),
EAN `4047777200697`, manuale "März 2024 V2".
Produttore reale: **Hangzhou Tianyuan Pet Products Co., Ltd**.
App ufficiali: `com.tianyuanpet.mouseracer` (Android) / "More FOR Mouse Racer" (iOS).

Punto di partenza: reverse engineering di
[pinchies/WebBTLE_Mouse_Racer](https://github.com/pinchies/WebBTLE_Mouse_Racer),
ottenuto catturando l'HCI snoop log Bluetooth di Android con Wireshark.

**Tutto quello che segue è stato verificato sull'esemplare Fressnapf** con
`tools/diag.html` e `tools/calib.html` — non è ripreso a scatola chiusa.

---

## Connessione

| | |
|---|---|
| Nome BLE | `pets` — confermato |
| Primary service | `0xAE00` |
| Characteristic scrittura | `0xAE01` |
| Characteristic notifiche | `0xAE02` |

Nessun bonding o pairing a livello di sistema operativo: basta connettersi al GATT.
Il topino accetta **una sola connessione**: se l'app ufficiale sul telefono è
collegata, il PC non riesce a prenderlo (e viceversa).

## Sblocco

Prima di qualunque comando di movimento va inviata questa sequenza, altrimenti
il firmware ignora tutto:

```
5A 5F 06 DB B9 2E 28 4F A5
```

Va rimandata a ogni riconnessione.

## Pacchetto di movimento

```
5A  <dir>  <speed>  00  <checksum>  A5
```

- `dir` — bitmask della direzione
- `speed` — `0`–`32`
- `checksum` — `(dir + speed) & 0xFF`
- header `0x5A`, footer `0xA5`

Stop = `5A 00 00 00 00 A5`.

### Mappa delle direzioni (verificata)

| bitmask | movimento |
|---:|---|
| `1` | avanti |
| `2` | indietro |
| `4` | sinistra |
| `8` | destra |

Le diagonali sono l'OR dei due bit: `1\|8 = 9` avanti-destra, `1\|4 = 5` avanti-sinistra,
`2\|8 = 10` indietro-destra, `2\|4 = 6` indietro-sinistra.

### Velocità

Soglia minima misurata: **2**. Sotto questo valore i motori non girano.
Massimo utile: 32.

---

## Comportamento del firmware: watchdog

Il topino **si ferma da solo dopo 1-3 secondi** se smette di ricevere pacchetti.
Non è un latch: mandare un comando una volta sola non basta a tenerlo in moto.

Due conseguenze pratiche, entrambe rilevanti per il progetto:

1. **Bisogna trasmettere in continuazione.** Il driver manda a 20 Hz.
2. **È una sicurezza gratuita.** Se l'app va in crash, il telefono si blocca o
   la connessione cade, il topino si arresta da solo entro pochi secondi.
   Per questo il watchdog applicativo (`inputTimeoutMs`) è una seconda rete,
   non l'unica.

### Perché l'app ufficiale sembra "a scatti"

Il controller di riferimento — e con ogni probabilità anche l'app ufficiale —
manda `move` e subito dopo `stop`, cioè un impulso per ogni pressione.
Con le write BLE senza risposta i due pacchetti arrivano a distanza di un
millisecondo e i motori quasi non partono: da qui il movimento a singhiozzo.

Nella prima diagnostica questo era il default, ed è il motivo per cui il topino
non si muoveva affatto. Streammando invece pacchetti `move` continui il
movimento diventa fluido.

---

## Curve continue su hardware a 8 direzioni

L'hardware conosce solo 8 direzioni discrete. Sterzare passando bruscamente da
una all'altra dà otto scatti — il difetto della croce direzionale ufficiale.

`app/mouse-ble.js` alterna invece le **due direzioni adiacenti** tick per tick,
in proporzione a quanto l'angolo richiesto è vicino all'una o all'altra
(a 20 Hz l'inerzia del topino media i due valori). La distribuzione usa
*error diffusion*, non il caso: con frazione 0.44 la sequenza è
`1,1,9,1,9,1,9…` — regolare, mentre grappoli casuali si sentirebbero come
strattoni.

Verificato: 20° → 57% avanti + 43% avanti-destra.

---

## Vincoli fisici

- Autonomia dichiarata **60 minuti**, batteria 3.7 V / 400 mAh, ricarica USB.
- Il topino **non si accende da solo**: qualsiasi uso a distanza richiede che
  sia già acceso.
- Nessun sensore, encoder, IMU o camera a bordo: **non sa dove si trova**.
  Qualunque funzione "torna a casa" richiede un riferimento esterno (visione).
