# Skill Alexa per il topino

> **"Alexa, chiedi a topino di avviare la caccia"**

## Come funziona, in due righe

Alexa non parla Bluetooth e non potrà mai farlo. La skill si limita a
pubblicare un comando testuale su un canale di `ntfy.sh`; l'app aperta e
connessa al topino a casa lo riceve e lo esegue.

```
"Alexa, chiedi a topino…"  →  skill (ospitata da Amazon)  →  ntfy.sh
                                                               ↓
                        topino  ←──BLE──  app aperta a casa (in ascolto)
```

**Serve un solo account gratuito: Amazon Developer.** Niente AWS, niente carta
di credito, niente server: il codice gira dentro la console di Amazon e il
canale di ntfy.sh non richiede registrazione.

## Quello che serve avere acceso

| | |
|---|---|
| Il topino | **acceso** (nessun software può girare quell'interruttore) e carico — ~60 min |
| Un dispositivo a casa | PC o telefono con l'app **aperta in primo piano**, connessa al topino, con «Ascolta comandi a distanza» attivo |

Un PC fisso con la scheda di Chrome in primo piano è la soluzione più stabile:
sui telefoni il sistema sospende le schede in secondo piano e il collegamento cade.

---

## Passo 1 — Prendi il canale privato dall'app

Apri l'app → **⚙** → attiva **«Ascolta comandi a distanza»** → copia il
**canale privato** col pulsante 📋. È una stringa tipo `topino-a3f9k2m8x1qz4b`.

Sotto deve comparire **in ascolto ✓**.

> Chi conosce quel canale può far muovere il topino — nient'altro: nessun
> accesso al telefono, alla rete o alla webcam. Non pubblicarlo in giro. Se ti
> sfugge, il pulsante ↻ ne genera uno nuovo (poi va aggiornato anche qui).

## Passo 2 — Crea la skill

1. Vai su **developer.amazon.com/alexa/console/ask** e accedi con lo stesso
   account Amazon del tuo Echo (deve essere lo stesso, altrimenti non la vedrà).
2. **Create Skill**
   - Nome: `topino`
   - Lingua: **Italiano (IT)**
   - Tipo: **Custom**
   - Hosting: **Alexa-hosted (Node.js)** ← è questo che rende tutto gratuito
   - Template: **Start from Scratch**
3. Aspetta un paio di minuti che finisca di crearsi.

## Passo 3 — Incolla il modello vocale

Nella colonna a sinistra: **Interaction Model → JSON Editor**.
Cancella tutto e incolla il contenuto di [`interaction-model.json`](interaction-model.json).

Poi **Save Model** e **Build Model** (il build dura 1-2 minuti).

## Passo 4 — Incolla il codice

Scheda **Code** in alto. Apri `index.js`, cancella tutto e incolla il contenuto
di [`index.js`](index.js).

**Cambia la prima riga utile**, sostituendo il canale copiato al passo 1:

```js
const CANALE = 'topino-a3f9k2m8x1qz4b';
```

Poi **Save** e **Deploy** (un paio di minuti).

## Passo 5 — Prova

Scheda **Test** in alto, e imposta il menù a tendina da *Off* a **Development**.
Scrivi (o parla): `apri topino` e poi `avvia la caccia`.

Se l'app a casa è in ascolto, vedrai comparire un avviso `da Alexa: caccia:nervoso`
e il topino parte.

Da qui in poi funziona anche dagli Echo di casa, **senza pubblicare la skill**:
in modalità Development è già attiva su tutti i dispositivi del tuo account.

---

## Cosa puoi dire

| Frase | Effetto |
|---|---|
| «Alexa, chiedi a topino di avviare la caccia» | parte la modalità caccia, andatura *nervoso* |
| «…di avviare la caccia impazzita» | caccia con l'andatura più agitata |
| «…caccia timida» | pause lunghe, scatti corti |
| «Alexa, chiedi a topino di fermarsi» | stop immediato |
| «…di andare piano» / «…di andare forte» | tetto di velocità al 30% / 100% |
| «Alexa, apri topino» | apre la sessione: poi basta dire «avvia la caccia» |

## Se non funziona

| Sintomo | Causa quasi sempre |
|---|---|
| Alexa: «Non riesco a raggiungere il topino» | il codice ha risposto ma ntfy ha rifiutato: controlla che `CANALE` sia scritto giusto |
| Alexa risponde bene ma il topino non si muove | l'app a casa non è in ascolto, non è connessa, o è finita in secondo piano |
| «Non conosco questa skill» | la skill non è in **Development**, o l'Echo usa un account Amazon diverso |
| Funziona da Test ma non dall'Echo | lingua della skill diversa da quella dell'Echo (dev'essere Italiano) |

## Limiti, detti chiaramente

- **Il topino deve essere già acceso.** Nessun comando vocale può girare un
  interruttore fisico. Se esci e lo lasci spento, Alexa non può farci nulla.
- **Batteria ~60 minuti.** Non è pensato per stare acceso tutto il giorno.
- **Serve un dispositivo a casa** con l'app aperta e connessa: è lui il ponte.
- **Il comando è a senso unico.** Alexa non sa se il topino si è davvero mosso:
  conferma di aver mandato il comando, non l'esito.
