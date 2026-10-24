// Cloudflare Worker – שרת מתווך לד"ר אטום / גלי-בוט / בדיקת בגרות
// המפתח נשמר כ-Secret בשם ANTHROPIC_API_KEY (לא בקוד!)
// הגבלות: רק מהאתר של האפליקציה, רק מודל אחד, תקרת אורך, ותקרת בקשות לכל כתובת IP ביום.
const ALLOWED_ORIGINS = ['https://noynovik-maker.github.io'];   // לעדכן אם שם המשתמש/הדומיין שונה
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1500;
const DAILY_LIMIT_PER_IP = 80;

function cors(origin){
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors(origin) });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors(origin) });

    // תקרה יומית לכל IP (דורש KV בשם LIMITS; אם לא הוגדר – מדלגים)
    if (env.LIMITS) {
      const ip = req.headers.get('CF-Connecting-IP') || 'x';
      const key = ip + ':' + new Date().toISOString().slice(0, 10);
      const n = parseInt(await env.LIMITS.get(key) || '0', 10);
      if (n >= DAILY_LIMIT_PER_IP) return json({ error: { message: 'הגעת למכסה היומית של שאלות ל-AI. נסה שוב מחר.' } }, 429, origin);
      await env.LIMITS.put(key, String(n + 1), { expirationTtl: 90000 });
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: { message: 'bad json' } }, 400, origin); }
    const payload = {
      model: MODEL,
      max_tokens: Math.min(body.max_tokens || 800, MAX_TOKENS),
      system: String(body.system || '').slice(0, 20000),
      messages: (body.messages || []).slice(-20)
    };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    return new Response(await r.text(), { status: r.status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
  }
};
function json(o, s, origin){ return new Response(JSON.stringify(o), { status: s, headers: { ...cors(origin), 'Content-Type': 'application/json' } }); }
