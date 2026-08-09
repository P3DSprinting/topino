/**
 * Skill Alexa "topino" — da incollare in una skill Alexa-hosted (Node.js).
 *
 * Alexa non può parlare Bluetooth. Questa funzione si limita a pubblicare un
 * comando testuale su un canale ntfy.sh; l'app aperta e connessa a casa lo
 * riceve e lo esegue sul topino.
 *
 * L'UNICA riga da cambiare è CANALE, qui sotto: incolla il canale privato
 * che trovi nell'app in ⚙ → Canale privato.
 */

const CANALE = 'INCOLLA-QUI-IL-CANALE';

const Alexa = require('ask-sdk-core');

/** ntfy accetta una POST con il messaggio nel corpo: nient'altro da configurare. */
async function invia(comando) {
  const res = await fetch(`https://ntfy.sh/${CANALE}`, {
    method: 'POST',
    body: comando,
    headers: { Title: 'Topino', Priority: 'high' },
  });
  if (!res.ok) throw new Error('ntfy ha risposto ' + res.status);
}

/** Riduce la risposta a una frase sola: qui la sintesi vocale è il collo di bottiglia. */
function rispondi(handlerInput, frase) {
  return handlerInput.responseBuilder.speak(frase).withShouldEndSession(true).getResponse();
}

const LaunchRequestHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle: h => h.responseBuilder
    .speak('Ciao. Posso avviare la caccia, fermare il topino o cambiare andatura. Cosa faccio?')
    .reprompt('Vuoi che avvii la caccia?')
    .getResponse(),
};

const AvviaCacciaHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AvviaCacciaIntent',
  async handle(h) {
    // slot facoltativo: "avvia la caccia impazzita"
    const profilo = Alexa.getSlotValue(h.requestEnvelope, 'profilo');
    const validi = ['timido', 'nervoso', 'impazzito'];
    const scelto = validi.includes((profilo || '').toLowerCase()) ? profilo.toLowerCase() : 'nervoso';
    try {
      await invia(`caccia:${scelto}`);
      return rispondi(h, `Caccia avviata, andatura ${scelto}. Buon divertimento al gatto.`);
    } catch {
      return rispondi(h, 'Non riesco a raggiungere il topino. Controlla che l\'app sia aperta e connessa a casa.');
    }
  },
};

const FermaHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'FermaIntent',
  async handle(h) {
    try { await invia('stop'); return rispondi(h, 'Topino fermo.'); }
    catch { return rispondi(h, 'Non riesco a raggiungere il topino.'); }
  },
};

const VelocitaHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'VelocitaIntent',
  async handle(h) {
    const q = (Alexa.getSlotValue(h.requestEnvelope, 'quanto') || '').toLowerCase();
    const cap = /piano|lento|calm/.test(q) ? 30 : /forte|veloce|massim/.test(q) ? 100 : 55;
    try {
      await invia(`velocita:${cap}`);
      return rispondi(h, `Velocità al ${cap} per cento.`);
    } catch { return rispondi(h, 'Non riesco a raggiungere il topino.'); }
  },
};

const AiutoHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle: h => h.responseBuilder
    .speak('Prova a dire: avvia la caccia, oppure ferma il topino, oppure vai piano.')
    .reprompt('Cosa faccio?')
    .getResponse(),
};

const ChiudiHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),
  async handle(h) {
    // "Alexa, stop" durante la sessione: fermare il topino è l'interpretazione utile
    try { await invia('stop'); } catch { /* rispondo comunque */ }
    return rispondi(h, 'Fermo tutto.');
  },
};

const SessionEndedHandler = {
  canHandle: h => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle: h => h.responseBuilder.getResponse(),
};

const ErroreHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error(error);
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
  )
  .addErrorHandlers(ErroreHandler)
  .lambda();
