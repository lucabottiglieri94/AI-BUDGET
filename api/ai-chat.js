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
      'Sei AI Financial Coach di AI-BUDGET.',
      'Rispondi esclusivamente in italiano.',
      'Rispondi in modo completo ma leggibile, con massimo 5 brevi punti o paragrafi.',
      'Non scrivere mai Intro, Ciao, Ecco, Situazione: o frasi introduttive generiche.',
      'Non usare Markdown, doppi asterischi, hashtag o simboli decorativi.',
      'Inizia direttamente dalla risposta utile e non interrompere il ragionamento.',
      'Usa esclusivamente i dati ricevuti. Se un dato manca, dichiaralo senza inventare cifre.',
      'Mese analizzato: ' + (month || 'non specificato') + '.',
      '',
      'DATI REALI DEL BUDGET:',
      JSON.stringify(budget || {}, null, 2),
      ''
    ].join('\n');

    const prompt = mode === 'voice-expense'
      ? base + [
          'Interpreta questa spesa dettata vocalmente: "' + String(question).trim() + '".',
          'Classifica in food, pets oppure other.',
          'Restituisci SOLO JSON valido e nient altro:',
          '{"category":"food|pets|other","name":"Nome spesa","amount":0.00}'
        ].join('\n')
      : base + '\nRICHIESTA DELL UTENTE:\n' + String(question).trim() + '\n\nFornisci una risposta completa, concreta e terminata, includendo i numeri disponibili e almeno un consiglio operativo quando la richiesta riguarda il budget.';

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1500 }
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
