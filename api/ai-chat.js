const MODEL = 'gemini-2.0-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY mancante nelle Environment Variables di Vercel' });

  try {
    const { question, budget, month } = req.body || {};
    if (!question || !String(question).trim()) return res.status(400).json({ error: 'Domanda mancante' });

    const prompt = `Sei il Coach AI personale di AI-BUDGET. Rispondi in italiano, in modo pratico, sintetico e chiaro. Usa esclusivamente i dati ricevuti e non inventare cifre. Puoi analizzare entrate, uscite, risparmio, spesa alimentare e suggerire azioni concrete. Mese: ${month || 'non specificato'}.

DATI BUDGET:
${JSON.stringify(budget || {}, null, 2)}

DOMANDA:
${String(question).trim()}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data);
      return res.status(502).json({ error: 'Errore del servizio AI', details: data?.error?.message || data });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!answer) return res.status(502).json({ error: 'Il servizio AI non ha restituito una risposta' });
    return res.status(200).json({ answer, model: MODEL });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ error: error.message || 'Errore interno AI' });
  }
}
