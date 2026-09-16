import crypto from 'crypto';

const CLIENT_ID = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const DEVICE_ID = process.env.TUYA_DEVICE_ID;
const BASE_URL = 'https://openapi.tuyaeu.com';

function getSignature(clientId, secret, timestamp, accessToken = '', stringToSign = '') {
  const payload = clientId + accessToken + timestamp + stringToSign;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').toUpperCase();
}

async function requestTuya(path, method = 'GET', accessToken = '') {
  const t = Date.now().toString();
  const bodyHash = crypto.createHash('sha256').update('').digest('hex');
  const stringToSign = [method, bodyHash, '', path].join('\n');
  const sign = getSignature(CLIENT_ID, CLIENT_SECRET, t, accessToken, stringToSign);

  const headers = {
    client_id: CLIENT_ID,
    sign,
    t,
    sign_method: 'HMAC-SHA256',
    'Content-Type': 'application/json'
  };

  if (accessToken) headers.access_token = accessToken;

  const res = await fetch(`${BASE_URL}${path}`, { method, headers });
  const data = await res.json();
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!CLIENT_ID || !CLIENT_SECRET || !DEVICE_ID) {
    return res.status(500).json({
      success: false,
      error: 'Missing Tuya environment variables'
    });
  }

  try {
    const tokenData = await requestTuya('/v1.0/token?grant_type=1');
    if (!tokenData?.success || !tokenData?.result?.access_token) {
      return res.status(500).json({ success: false, error: 'Errore token Tuya', details: tokenData });
    }

    const token = tokenData.result.access_token;
    const statusData = await requestTuya(`/v1.0/devices/${encodeURIComponent(DEVICE_ID)}/status`, 'GET', token);

    if (!statusData?.success) {
      return res.status(500).json({ success: false, error: 'Errore lettura presa Tuya', details: statusData });
    }

    const result = Array.isArray(statusData.result) ? statusData.result : [];
    const findValue = (...codes) => result.find(item => codes.includes(item.code))?.value;

    const switchValue = findValue('switch_1', 'switch');
    const powerRaw = Number(findValue('cur_power') ?? 0);
    const voltageRaw = Number(findValue('cur_voltage') ?? 0);
    const currentRaw = Number(findValue('cur_current') ?? 0);

    const normalizeTenths = (value, fallback = 0) => {
      if (!Number.isFinite(value)) return fallback;
      return value > 1000 ? value / 10 : value / 10;
    };

    return res.status(200).json({
      success: true,
      data: {
        online: Boolean(switchValue),
        power_watts: Number(normalizeTenths(powerRaw).toFixed(1)),
        voltage_volts: Number(normalizeTenths(voltageRaw).toFixed(1)),
        current_ma: Number.isFinite(currentRaw) ? currentRaw : 0,
        raw: result
      },
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Tuya smart plug error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Unknown error' });
  }
}
