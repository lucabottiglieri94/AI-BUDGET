const MODEL = 'gemini-3.0-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY mancante nelle Environment Variables di Vercel'
    });
  }

  try {
    const { question, budget, month } = req.body || {};
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'Domanda mancante' });
    }

    const systemPrompt = `Sei il Coach AI personale dell'applicazione AI-BUDGET. Rispondi in italiano, in modo chiaro, concreto e breve. Analizza esclusivamente i dati del budget forniti dall'utente; non inventare cifre. Puoi dare consigli pratici su risparmio, spese, entrate, alimentari e organizzazione finanziaria. Se mancano dati, dichiaralo. Mese analizzato: ${month || 'non specificato'}.`;
    const userPrompt = `${systemPrompt}\n\nDATI BUDGET:\n${JSON.stringify(budget || {}, null, 2)}\n\nDOMANDA DELL'UTENTE:\n${String(question).trim()}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 700
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data);
      return res.status(502).json({ error: 'Errore del servizio AI', details: data });
    }

    const answer = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim();

    if (!answer) {
      return res.status(502).json({ error: 'Il servizio AI non ha restituito una risposta' });
    }

    return res.status(200).json({ answer, model: MODEL });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ error: error.message || 'Errore interno AI' });
  }
}
