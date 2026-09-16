import crypto from 'crypto';

const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;
const BASE_URL = 'https://openapi.tuyaeu.com';

function signRequest(clientId, secret, timestamp, accessToken = '', stringToSign = '') {
  return crypto.createHmac('sha256', secret)
    .update(clientId + accessToken + timestamp + stringToSign)
    .digest('hex').toUpperCase();
}

async function tuyaRequest(path, method = 'GET', accessToken = '') {
  const timestamp = Date.now().toString();
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, bodyHash, '', path].join('\n');
  const headers = {
    client_id: CLIENT_ID,
    sign: signRequest(CLIENT_ID, CLIENT_SECRET, timestamp, accessToken, stringToSign),
    t: timestamp,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };
  if (accessToken) headers.access_token = accessToken;
  const response = await fetch(`${BASE_URL}${path}`, { method, headers });
  return response.json();
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function tenths(value) {
  return numeric(value) / 10;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!CLIENT_ID || !CLIENT_SECRET || !DEVICE_ID) {
    return res.status(500).json({ success: false, error: 'Variabili Tuya mancanti su Vercel' });
  }

  try {
    const tokenResponse = await tuyaRequest('/v1.0/token?grant_type=1');
    const token = tokenResponse?.result?.access_token;
    if (!tokenResponse?.success || !token) {
      return res.status(500).json({ success: false, error: 'Impossibile ottenere il token Tuya', details: tokenResponse });
    }

    const statusResponse = await tuyaRequest(`/v1.0/devices/${encodeURIComponent(DEVICE_ID)}/status`, 'GET', token);
    if (!statusResponse?.success) {
      return res.status(500).json({ success: false, error: 'Errore lettura dispositivo Tuya', details: statusResponse });
    }

    const raw = Array.isArray(statusResponse.result) ? statusResponse.result : [];
    const valueOf = (...codes) => raw.find(x => codes.includes(x.code))?.value;
    const switchValue = valueOf('switch_1', 'switch');
    const powerRaw = numeric(valueOf('cur_power'));
    const voltageRaw = numeric(valueOf('cur_voltage'));
    const currentRaw = numeric(valueOf('cur_current'));

    // Tuya usa normalmente decimi per potenza/tensione.
    // add_ele è spesso espresso in centesimi di kWh; viene restituito anche grezzo
    // per consentire al frontend di confrontarlo con il contatore dell'app Tuya.
    const energyRaw = valueOf('add_ele', 'total_forward_energy', 'forward_energy', 'energy');

    return res.status(200).json({
      success: true,
      data: {
        device_id: DEVICE_ID,
        online: Boolean(switchValue),
        power_watts: Number(tenths(powerRaw).toFixed(1)),
        voltage_volts: Number(tenths(voltageRaw).toFixed(1)),
        current_ma: currentRaw,
        energy_raw: energyRaw ?? null,
        energy_code: raw.find(x => ['add_ele', 'total_forward_energy', 'forward_energy', 'energy'].includes(x.code))?.code ?? null,
        raw
      },
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Tuya smart plug error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Errore sconosciuto' });
  }
}
