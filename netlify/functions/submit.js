const { getStore } = require('@netlify/blobs');

const DAILY_CAP = parseInt(process.env.DAILY_CAP || '15', 10);
const MODEL = 'claude-sonnet-4-6';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SYSTEM_PROMPT = `You triage a manual work pain point submitted to an internal automation backlog.
Respond ONLY with a JSON object, no markdown fences, no preamble, in exactly this shape:
{"rating": <integer 1-10, how automatable this is>, "fix": "<one short sentence, the concrete fix>", "timeSaved": "<short estimate like '2hrs/week'>", "priority": "<LOW, MEDIUM, or HIGH>"}
Be decisive and specific. Never return prose outside the JSON object.`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const name = (body.name || 'Anonymous').toString().trim().slice(0, 60);
  const department = (body.department || 'General').toString().trim().slice(0, 40);
  const painPoint = (body.painPoint || '').toString().trim();

  if (!painPoint) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Pain point is required' }) };
  }
  if (painPoint.length > 1000) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Keep it under 1000 characters' }) };
  }

  const usageStore = getStore('aps-usage');
  const today = new Date().toISOString().slice(0, 10);
  const usageKey = `count-${today}`;
  const current = parseInt((await usageStore.get(usageKey)) || '0', 10);

  if (current >= DAILY_CAP) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Automation Priority Sorter has hit its free triage limit for today. Check back tomorrow.' })
    };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: painPoint }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Upstream error: ' + errText.slice(0, 200) }) };
    }

    const data = await resp.json();
    const raw = (data.content || []).map((b) => b.text || '').join('').trim();

    let triage;
    try {
      triage = JSON.parse(raw);
    } catch (e) {
      triage = { rating: 5, fix: 'Could not parse triage output.', timeSaved: 'unknown', priority: 'MEDIUM' };
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      department,
      painPoint,
      rating: Math.max(1, Math.min(10, parseInt(triage.rating, 10) || 5)),
      fix: (triage.fix || '').toString().slice(0, 200),
      timeSaved: (triage.timeSaved || '').toString().slice(0, 40),
      priority: ['LOW', 'MEDIUM', 'HIGH'].includes((triage.priority || '').toUpperCase()) ? triage.priority.toUpperCase() : 'MEDIUM',
      status: 'Pending',
      link: null,
      submittedAt: new Date().toISOString()
    };

    const backlogStore = getStore('aps');
    const existingRaw = await backlogStore.get('backlog');
    const backlog = existingRaw ? JSON.parse(existingRaw) : [];
    backlog.unshift(entry);
    await backlogStore.set('backlog', JSON.stringify(backlog.slice(0, 200)));

    await usageStore.set(usageKey, String(current + 1));

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry, remainingToday: Math.max(0, DAILY_CAP - (current + 1)) })
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
