const MODEL = 'gemini-3-flash-preview';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY mancante nelle Environment Variables di Vercel' });

  try {
    const { question, budget, month, mode = 'chat' } = req.body || {};
    if (!question || !String(question).trim()) return res.status(400).json({ error: 'Domanda mancante' });

    const base = [
      'Sei il Coach AI personale di AI-BUDGET.',
      'Rispondi in italiano.',
      'Sii concreto, naturale e sintetico.',
      'Non inventare mai dati o cifre.',
      'Non scrivere introduzioni come Intro, Ciao, Ecco l analisi o frasi di apertura.',
      'Non usare markdown, asterischi, hashtag, titoli con # o simboli decorativi.',
      'Non ripetere la domanda dell utente.',
      'Vai direttamente alla risposta utile.',
      'Quando analizzi il budget, usa eventualmente questo formato semplice:',
      'Situazione: ...',
      'Indicazioni: ...',
      'Mese: ' + (month || 'non specificato') + '.',
      '',
      'DATI BUDGET:',
      JSON.stringify(budget || {}, null, 2),
      ''
    ].join('\n');

    const prompt = mode === 'voice-expense'
      ? base + [
          'L utente ha detto: "' + String(question).trim() + '".',
          'Determina la categoria: "food" per Spesa Luca e Lisa, "pets" per Spesa Animali, oppure "other" per un altra uscita.',
          'Estrai l importo numerico.',
          'Restituisci SOLO JSON valido, senza markdown:',
          '{"category":"food|pets|other","name":"Nome spesa","amount":0.00}'
        ].join('\n')
      : base + '\nDOMANDA UTENTE:\n' + String(question).trim() + '\n\nRispondi direttamente senza introduzione e senza markdown.';

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 700 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data);
      return res.status(502).json({ error: data?.error?.message || 'Errore del servizio AI' });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!answer) return res.status(502).json({ error: 'Il servizio AI non ha restituito una risposta' });

    return res.status(200).json({ answer, model: MODEL });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ error: error.message || 'Errore interno AI' });
  }
}
