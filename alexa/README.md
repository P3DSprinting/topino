# Skill Alexa per il topino

> **"Alexa, chiedi a topo robot di avviare la caccia"**

## Come funziona, in due righe

Alexa non può parlare Bluetooth e non potrà mai. La skill si limita a pubblicare
un comando testuale su un canale di `ntfy.sh`; l'app aperta e connessa al topino
a casa lo riceve e lo esegue.

```
"Alexa, chiedi a topo robot…"  →  skill (ospitata da Amazon)  →  ntfy.sh
                                                               ↓
                        topino  ←──BLE──  app aperta a casa (in ascolto)
```

**Serve un solo account gratuito: Amazon Developer.** Niente AWS, niente carta di
credito, niente server: il codice gira dentro la console di Amazon, e il canale
di ntfy.sh non richiede registrazione.

## Quello che deve essere acceso

| | |
|---|---|
| Il topino | **acceso** (nessun software può girare quell'interruttore) e carico — ~60 min |
| Un dispositivo a casa | PC o telefono con l'app **aperta in primo piano**, connessa al topino, con «Ascolta comandi a distanza» attivo |

Un PC con la scheda di Chrome in primo piano è la soluzione più stabile: i
telefoni sospendono le schede in secondo piano e il collegamento cade.

---

## Passo 1 — Prendi il canale privato dall'app

Apri l'app → **⚙** → attiva **«Ascolta comandi a distanza»** → copia il
**canale privato** col pulsante 📋. È una stringa tipo `topino-a3f9k2m8x1qz4b`.

Sotto deve comparire **in ascolto ✓**.

> Chi conosce quel canale può far muovere il topino — nient'altro: nessun accesso
> al telefono, alla rete di casa o alla webcam. Non pubblicarlo. Se ti sfugge, il
> pulsante ↻ ne genera uno nuovo (poi va aggiornato anche nella skill).

## Passo 2 — Crea la skill importandola da GitHub

Su **developer.amazon.com/alexa/console/ask**, accedi **con lo stesso account
Amazon del tuo Echo** (se è diverso, l'Echo non vedrà mai la skill).

1. **Create Skill**
2. **Skill name**: `topo robot`
3. **Primary locale / Default language**: **Italiano (IT)** — dev'essere la stessa
   lingua del tuo Echo
4. **Choose a model**: **Custom**
5. **Choose a method to host**: **Alexa-Hosted (Node.js)** ← è questo che rende
   tutto gratuito
6. **Create Skill**
7. Nella pagina dei template **non scegliere un template**: premi **Import skill**
   in alto a destra
8. Incolla questo indirizzo e premi **Continue**:

   ```
   https://github.com/P3DSprinting/topino.git
   ```

Amazon scarica il progetto e in un paio di minuti la skill è pronta, già con il
modello vocale italiano e il codice al posto giusto.

> Se l'importazione dovesse fallire, in fondo trovi la via manuale: funziona
> uguale, richiede solo due copia-incolla in più.

## Passo 3 — Incolla il tuo canale e pubblica

Scheda **Code** in alto → apri `lambda/index.js` → trova questa riga vicino
all'inizio:

```js
const CANALE = 'INCOLLA-QUI-IL-CANALE';
```

Sostituisci con il canale copiato al passo 1:

```js
const CANALE = 'topino-a3f9k2m8x1qz4b';
```

**Save** e poi **Deploy** (un paio di minuti).

## Passo 4 — Prova

Scheda **Test** in alto, e sposta il menù a tendina da *Off* a **Development**.

Scrivi (o parla): `apri topo robot`, poi `avvia la caccia`.

Se l'app a casa è in ascolto, compare un avviso `da Alexa: caccia:nervoso` e il
topino parte.

Da qui in poi funziona anche dagli Echo di casa **senza pubblicare la skill**: in
modalità Development è già attiva su tutti i dispositivi del tuo account.

---

## Cosa puoi dire

| Frase | Effetto |
|---|---|
| «Alexa, chiedi a topo robot di avviare la caccia» | parte la caccia, andatura *nervoso* |
| «…di avviare la caccia impazzita» | andatura più agitata |
| «…caccia timida» | pause lunghe, scatti corti |
| «…di giocare per cinque minuti» | **si ferma da sola dopo il tempo detto** |
| «Alexa, chiedi a topo robot di fermarsi» | stop immediato |
| «…di andare piano» / «…di andare forte» | tetto di velocità al 30% / 100% |
| «Alexa, apri topo robot» | apre la sessione: poi basta dire «avvia la caccia» |

Il modello riconosce una sessantina di formulazioni: *fai giocare il gatto*,
*libera il topo*, *fai partire il topino*, *scappa*, *corri*, *fermalo*,
*spegni il topino*, *basta così*, *alt*…

## Frasi brevi: le Routine

Fermare la caccia a voce è scomodo per un motivo strutturale: appena la skill
risponde, **la sessione si chiude**. Da quel momento «Alexa, ferma» non arriva
più alla skill — Alexa lo interpreta come "ferma la musica". Serve ogni volta la
frase lunga.

La soluzione sono le **Routine**, che ti fanno inventare la scorciatoia che vuoi:

1. App Alexa → **Altro** → **Routine** → **+**
2. **Quando accade questo** → *Voce* → scrivi la frase che vuoi, es. `caccia al topo`
3. **Aggiungi azione** → **Personalizzato** → scrivi
   `chiedi a topo robot di avviare la caccia`
4. Salva.

Da lì basta dire **«Alexa, caccia al topo»**. Fanne una seconda con `basta topo`
→ `chiedi a topo robot di fermarsi` e hai anche lo stop in due parole.

> In alternativa, il modo più semplice per non doverlo fermare è **dire quanto
> deve durare fin dall'inizio**: «…di giocare per cinque minuti».

## Se non funziona

| Sintomo | Causa quasi sempre |
|---|---|
| «Non riesco a raggiungere il topino» | `CANALE` scritto male nel codice, o Deploy non fatto |
| Alexa risponde bene ma il topino sta fermo | l'app a casa non è in ascolto, non è connessa, o è finita in secondo piano |
| «Non conosco questa skill» | la skill non è in **Development**, o l'Echo usa un altro account Amazon |
| Funziona da Test ma non dall'Echo | lingua della skill diversa da quella dell'Echo |
| L'importazione da Git fallisce | usa la via manuale qui sotto |

## Via manuale (se l'import da Git non va)

Crea la skill come al passo 2 ma scegli il template **Start from Scratch**, poi:

1. **Build → Interaction Model → JSON Editor**: cancella tutto e incolla il
   contenuto di
   [`skill-package/interactionModels/custom/it-IT.json`](../skill-package/interactionModels/custom/it-IT.json).
   Poi **Save Model** e **Build Model**.
2. **Code → `index.js`**: cancella tutto e incolla il contenuto di
   [`lambda/index.js`](../lambda/index.js), cambia la riga `CANALE`, poi **Save**
   e **Deploy**.

## Limiti, detti chiaramente

- **Il topino deve essere già acceso.** Nessun comando vocale può girare un
  interruttore fisico.
- **Batteria ~60 minuti**: non è pensato per restare pronto tutto il giorno.
- **Serve un dispositivo a casa** con l'app aperta e connessa: è lui il ponte.
- **Il comando è a senso unico.** Alexa conferma di aver inviato il comando, non
  che il topino si sia mosso davvero.
