// Cloudflare Worker – שרת מתווך לד"ר אטום / גלי-בוט / בדיקת בגרות (פיילוט)
// ─ המפתח נשמר כ-Secret בשם ANTHROPIC_API_KEY (לא בקוד!)
// ─ קודי כיתה מורשים: משתנה סביבה CLASS_CODES, מופרדים בפסיק (למשל: KIMIA10A,KIMIA11B)
// ─ מכסות (דורש KV בשם LIMITS): לכל תלמיד ביום, ולכל כיתה ביום
const ALLOWED_ORIGINS = ['https://noynovik-maker.github.io'];
const MODEL_CHAT  = 'claude-haiku-5-5';    // ד"ר אטום וגלי-בוט – זול ומהיר
const MODEL_GRADE = 'claude-sonnet-5-5';   // בדיקת שאלות פתוחות בבגרות – מדויק יותר
const MAX_TOKENS = 1500;
const DAILY_PER_STUDENT = 25;
const DAILY_PER_CLASS = 600;

function cors(origin){
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
function json(o, s, origin){ return new Response(JSON.stringify(o), { status: s, headers: { ...cors(origin), 'Content-Type': 'application/json' } }); }
const err = (msg, s, origin) => json({ error: { message: msg } }, s, origin);

async function bump(env, key, limit){
  const n = parseInt(await env.LIMITS.get(key) || '0', 10);
  if (n >= limit) return false;
  await env.LIMITS.put(key, String(n + 1), { expirationTtl: 90000 });
  return true;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (req.method !== 'POST') return err('Method not allowed', 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return err('Forbidden', 403, origin);

    let body;
    try { body = await req.json(); } catch { return err('bad json', 400, origin); }

    // קוד כיתה + כינוי
    const codes = String(env.CLASS_CODES || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const code = String(body.classCode || '').trim().toUpperCase();
    const student = String(body.student || '').trim().slice(0, 40);
    if (!codes.includes(code)) return err('NO_CLASS_CODE', 401, origin);
    if (!student) return err('NO_STUDENT', 401, origin);

    // מכסות יומיות
    if (env.LIMITS) {
      const day = new Date().toISOString().slice(0, 10);
      if (!await bump(env, `c:${code}:${day}`, DAILY_PER_CLASS)) return err('הכיתה הגיעה למכסה היומית של שאלות ל-AI. נסו שוב מחר.', 429, origin);
      // הערכה מעצבת בסוף תרגול לא נספרת במכסה של התלמיד – רק במכסה של הכיתה
      if (body.purpose !== 'feedback' && !await bump(env, `s:${code}:${student}:${day}`, DAILY_PER_STUDENT)) return err(`הגעת למכסה היומית (${DAILY_PER_STUDENT} שאלות). נסה שוב מחר.`, 429, origin);
    }

    let messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    while (messages.length && messages[0].role !== 'user') messages.shift();   // ה-API דורש שהראשונה תהיה של המשתמש
    if (!messages.length) return err('empty', 400, origin);

    const grading = body.purpose === 'grade';
    // prompt caching: ההנחיות הקבועות נשמרות אצל Anthropic לכמה דקות, וקריאה חוזרת שלהן זולה בהרבה
    const system = [{ type: 'text', text: String(body.system || '').slice(0, 30000), cache_control: { type: 'ephemeral' } }];
    const payload = {
      model: grading ? MODEL_GRADE : MODEL_CHAT,
      max_tokens: Math.min(body.max_tokens || 800, MAX_TOKENS),
      system,
      messages
    };
    // ניקוי רווחים, ירידות שורה ומירכאות שנכנסו בטעות בהדבקת המפתח
    const key = String(env.ANTHROPIC_API_KEY || '').replace(/[\s"'`]/g, '');
    if (!key) return err('KEY_MISSING: לא הוגדר מפתח בשרת', 500, origin);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload)
    });
    if (r.status === 401) return err(`KEY_BAD: המפתח לא תקין (אורך ${key.length}, מתחיל ב-${key.slice(0, 7)})`, 500, origin);
    return new Response(await r.text(), { status: r.status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
  }
};
