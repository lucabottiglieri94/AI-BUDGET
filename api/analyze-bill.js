const MODEL = 'gemini-3.0-flash';

function cleanJson(text) {
  const t = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(t);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'GEMINI_API_KEY mancante su Vercel' });

  try {
    const { data, mimeType, fileName } = req.body || {};
    if (!data || !mimeType) return res.status(400).json({ success: false, error: 'File mancante' });

    const prompt = `Analizza questa bolletta italiana di energia elettrica. Estrai esclusivamente dati realmente presenti nel documento. Rispondi SOLO con JSON valido, senza markdown, usando esattamente queste chiavi: total (numero totale bolletta da pagare in euro), kwh (kWh fatturati/consumati nel periodo), period (periodo della bolletta come testo), confidence (numero da 0 a 1). Non inventare valori: se un dato non è leggibile usa 0 o stringa vuota. Preferisci il totale finale da pagare e il consumo totale del periodo, non acconti, stime o singole voci.`;

    const body = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data } }
      ] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    };

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ success: false, error: 'Errore Gemini', details: j });
    const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    const result = cleanJson(text);
    return res.status(200).json({ success: true, model: MODEL, fileName: fileName || '', data: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message || 'Analisi Gemini fallita' });
  }
}
