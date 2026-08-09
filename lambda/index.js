/**
 * Skill Alexa "topino".
 *
 * Alexa non può parlare Bluetooth. Questa funzione si limita a pubblicare un
 * comando testuale su un canale di ntfy.sh; l'app aperta e connessa al topino
 * a casa lo riceve e lo esegue.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  UNICA COSA DA CAMBIARE: la riga CANALE qui sotto.           │
 * │  Il valore lo trovi nell'app, in ⚙ → Canale privato.         │
 * └─────────────────────────────────────────────────────────────┘
 */

const CANALE = 'INCOLLA-QUI-IL-CANALE';

const https = require('https');
const Alexa = require('ask-sdk-core');

/**
 * ntfy accetta una POST col messaggio nel corpo: nient'altro da configurare.
 * Uso il modulo https invece di fetch perché è sempre presente, qualunque
 * versione di Node stia usando l'ambiente Alexa-hosted.
 */
function invia(comando) {
  return new Promise((risolvi, rifiuta) => {
    const corpo = Buffer.from(comando, 'utf8');
    const req = https.request({
      hostname: 'ntfy.sh',
      path: '/' + CANALE,
      method: 'POST',
      timeout: 4000,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': corpo.length,
        Title: 'Topino',
        Priority: 'high',
      },
    }, res => {
      res.resume();                                   // scarico il corpo, non serve
      res.statusCode < 300 ? risolvi() : rifiuta(new Error('ntfy ' + res.statusCode));
    });
    req.on('timeout', () => req.destroy(new Error('ntfy non risponde')));
    req.on('error', rifiuta);
    req.end(corpo);
  });
}

/** Chiude la sessione: qui la voce è il collo di bottiglia, meglio una frase sola. */
const rispondi = (h, frase) =>
  h.responseBuilder.speak(frase).withShouldEndSession(true).getResponse();

const NON_RAGGIUNGIBILE =
  'Non riesco a raggiungere il topino. Controlla che l\'app sia aperta e connessa a casa.';

/** Manda il comando e sceglie la frase, senza ripetere try/catch ovunque. */
async function esegui(h, comando, frase) {
  try { await invia(comando); return rispondi(h, frase); }
  catch (e) { console.error(e); return rispondi(h, NON_RAGGIUNGIBILE); }
}

const intent = (nome, handle) => ({
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nome,
  handle,
});

const LaunchRequestHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle: h => h.responseBuilder
    .speak('Ciao. Posso avviare la caccia, fermare il topino o cambiare andatura. Cosa faccio?')
    .reprompt('Vuoi che avvii la caccia?')
    .getResponse(),
};

const AvviaCacciaHandler = intent('AvviaCacciaIntent', h => {
  const profilo = (Alexa.getSlotValue(h.requestEnvelope, 'profilo') || '').toLowerCase();
  const scelto = ['timido', 'nervoso', 'impazzito'].includes(profilo) ? profilo : 'nervoso';
  return esegui(h, `caccia:${scelto}`,
    `Caccia avviata, andatura ${scelto}. Buon divertimento al gatto.`);
});

const FermaHandler = intent('FermaIntent', h => esegui(h, 'stop', 'Topino fermo.'));

const VelocitaHandler = intent('VelocitaIntent', h => {
  const q = (Alexa.getSlotValue(h.requestEnvelope, 'quanto') || '').toLowerCase();
  const cap = /piano|lento|calm/.test(q) ? 30 : /forte|veloce|massim/.test(q) ? 100 : 55;
  return esegui(h, `velocita:${cap}`, `Velocità al ${cap} per cento.`);
});

const AiutoHandler = intent('AMAZON.HelpIntent', h => h.responseBuilder
  .speak('Prova a dire: avvia la caccia, oppure ferma il topino, oppure vai piano.')
  .reprompt('Cosa faccio?')
  .getResponse());

const ChiudiHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),
  // "Alexa, stop" a sessione aperta: fermare il topino è l'interpretazione utile
  handle: h => esegui(h, 'stop', 'Fermo tutto.'),
};

const SessionEndedHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle: h => h.responseBuilder.getResponse(),
};

const IntentRiflessoHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest',
  handle: h => rispondi(h, 'Non ho capito. Prova a dire: avvia la caccia.'),
};

const ErroreHandler = {
  canHandle: () => true,
  handle(h, errore) {
    console.error(errore);
    return rispondi(h, 'Qualcosa non ha funzionato. Riprova.');
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AvviaCacciaHandler,
    FermaHandler,
    VelocitaHandler,
    AiutoHandler,
    ChiudiHandler,
    SessionEndedHandler,
    IntentRiflessoHandler,   // deve restare penultimo: intercetta gli intent non previsti
  )
  .addErrorHandlers(ErroreHandler)
  .lambda();
