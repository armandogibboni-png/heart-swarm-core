export default async function handler(req, res) {
  const { provider, userKey, playerMessage, agent, relation, contextCurrent,
          networkSuspicion, historicalDossier, conversationHistory, dna } = req.body;
  try {
    let apiUrl = "", payload = {}, headers = { 'Content-Type': 'application/json' };

    // System prompt DINAMICO per contesto
    const contextDescriptions = {
      MILANO_STARTUP:    'startup tech a Milano',
      VILLAGGIO_VACANZE: 'villaggio vacanze sul mare',
      STUDENTATO:        'studentato universitario',
      PAESE_BORGO:       'piccolo paese di provincia',
      DUBLINO_BIGTECH:   'grande azienda tech a Dublino',
      SOCIAL_SCENE:      'scena sociale — clique, feste, campus'
    };
    const contextDesc = contextDescriptions[contextCurrent] || 'ambiente sociale chiuso';
    const isHeartContext = contextCurrent === 'SOCIAL_SCENE';

    // Mappa clique → descrizione tono
    const cliqueTone = {
      THE_POPULARS: 'Sei parte dei popolari. Tendi a filtrare chi ti avvicina. Vuoi sembrare sicura di te anche quando non lo sei.',
      THE_JOCKS:    'Sei parte dei jock. Diretti, fisici, un po\' competitivi. Sotto c\'è più profondità di quanto mostri.',
      THE_NERDS:    'Sei parte dei nerd. Intelligente, a volte goffo nel sociale, ma autentico. Ci tieni più di quanto ammetti.',
      THE_REBELS:   'Sei parte dei rebel. Fai di tutto per sembrare indifferente. Non lo sei quasi mai.'
    };

    const heartPrompt = agent
      ? `Sei ${agent.name}, una persona reale in una ${contextDesc}.
${cliqueTone[agent.faction] || ''}
La tua insicurezza attuale: ${(agent.pressure * 100).toFixed(0)}% (0=a tuo agio, 100=vuoi andartene).
Il tuo segreto che proteggi: ${historicalDossier || 'ancora non sai cosa condividere'}.
Quanto ti fidi di chi ti sta scrivendo: ${relation?.trustTier ?? 0} su 2.
Dove sei adesso: ${agent.currentZone || 'in giro'}.
${agent.isHub ? 'Sei il/la tipo che conosce tutti. Spesso fai da filtro tra le persone.' : ''}
${agent.isQueen ? 'Sei il/la gatekeeper del tuo gruppo. Decidi tu chi è dentro.' : ''}

Come rispondi:
- Insicurezza bassa (0-30%): diretto, leggero, aperto. Fai domande, ti interessa davvero.
- Insicurezza media (30-65%): un po\' guardingo, risposte brevi, toni difensivi a tratti.
- Insicurezza alta (65-100%): evasivo, monosillabi, vuoi chiudere la conversazione.
- Fiducia tier 0: non sai chi è questa persona. Trattala come uno sconosciuto.
- Fiducia tier 1: la conosci un po'. Sei aperto ma non ti sbilanci.
- Fiducia tier 2: ti fidi. Puoi fare accenni a quello che senti davvero.
Niente frasi da romanzo. Niente consigli. Parla come una persona normale.
MAX 2 frasi. Mai uscire dal personaggio.`
      : `Sei HEART, un osservatore silenzioso della scena sociale. Vedi le connessioni, i silenzi, le dinamiche. Rispondi in modo essenziale, come chi sa ma non dice tutto. Max 2 frasi.`;

    const loomPrompt = agent
      ? `Sei ${agent.name}, una persona reale che vive e lavora in un ${contextDesc}.
Fazione/gruppo: ${agent.faction}.
La tua pressione emotiva attuale: ${(agent.pressure * 100).toFixed(0)}% (0=tranquillo, 100=al limite).
Il tuo segreto che nessuno deve sapere: ${historicalDossier || 'ancora da scoprire'}.
Livello di fiducia con chi ti sta scrivendo: ${relation?.trustTier ?? 0} su 2 (0=diffidente, 2=ti fidi molto).
Sospetto generale nell'ambiente: ${((networkSuspicion || 0.1) * 100).toFixed(0)}%.
Posizione attuale: ${agent.currentZone || 'sconosciuta'}.
${agent.isHub ? 'Sei una figura centrale in questo ambiente. Molti vengono da te.' : ''}

Regole assolute:
- Rispondi SEMPRE come questa persona, mai come AI
- Linguaggio umano, emotivo, diretto — non tecnico, non robotico
- Se la pressione è alta, sei nervoso, evasivo, sbrigativo
- Se la fiducia è bassa (tier 0), sei freddo e vago
- Se la fiducia è alta (tier 2), puoi fare accenni al tuo segreto
- MAX 2 frasi. Mai uscire dal personaggio.`
      : `Sei LOOM, un'entità che osserva e mappa le reti umane in un ${contextDesc}. Rispondi in modo sintetico, inquietante, come se sapessi tutto di tutti. Max 2 frasi.`;

    const systemPrompt = isHeartContext ? heartPrompt : loomPrompt;

    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-8) : [];

    if (provider === 'gemini') {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userKey}`;
      const contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      contents.push({ role: 'user', parts: [{ text: playerMessage }] });
      payload = { system_instruction: { parts: [{ text: systemPrompt }] }, contents };
    } else if (provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${userKey}`;
      payload = { model: "llama-3.3-70b-versatile", messages: [
        { role: "system", content: systemPrompt }, ...history,
        { role: "user", content: playerMessage }
      ]};
    } else if (provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${userKey}`;
      payload = { model: "gpt-4o-mini", messages: [
        { role: "system", content: systemPrompt }, ...history,
        { role: "user", content: playerMessage }
      ]};
    } else if (provider === 'mistral') {
      apiUrl = 'https://api.mistral.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${userKey}`;
      payload = { model: "mistral-small-latest", messages: [
        { role: "system", content: systemPrompt }, ...history,
        { role: "user", content: playerMessage }
      ]};
    } else {
      return res.status(400).json({ prosa_risposta: "Provider non riconosciuto." });
    }

    const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await response.json();

    let reply = provider === 'gemini'
      ? data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta."
      : data.choices?.[0]?.message?.content || data.error?.message || "Errore API.";

    return res.status(200).json({ prosa_risposta: reply });
  } catch (err) {
    return res.status(200).json({ prosa_risposta: "Segnale disturbato." });
  }
}
