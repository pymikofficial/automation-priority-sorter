const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const SEED = [
  {
    id: 'seed-2',
    name: 'Soumik',
    department: 'Founder\'s Office',
    painPoint: 'Teachers and ops leads jot down messy voice notes about their day, nobody has time to turn them into a clean report for parents or admin.',
    rating: 8,
    fix: 'Build a tool that turns a spoken or typed observation into a structured report automatically.',
    timeSaved: '3-5 hrs/week',
    priority: 'HIGH',
    status: 'Done',
    link: 'https://fieldnote.cosmik.work',
    linkLabel: 'View Fieldnote →',
    submittedAt: '2026-06-24T09:00:00.000Z'
  },
  {
    id: 'seed-1',
    name: 'Soumik',
    department: 'Operations',
    painPoint: 'Every new hire needs a joining or exit contract, and founders without an HR team end up copy-pasting old templates and hoping the numbers are right.',
    rating: 7,
    fix: 'Build a modular AI contract generator that only asks for what is actually needed.',
    timeSaved: '2 hrs per contract',
    priority: 'MEDIUM',
    status: 'Done',
    link: 'https://cosmik.work/shipped.html',
    linkLabel: 'View Contract Generator →',
    submittedAt: '2026-06-10T09:00:00.000Z'
  }
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    const store = getStore('aps');
    const existingRaw = await store.get('backlog');
    let backlog = existingRaw ? JSON.parse(existingRaw) : [];

    // Ensure seed entries are present at least once (idempotent)
    const hasSeed = backlog.some((e) => e.id === 'seed-1');
    if (!hasSeed) {
      backlog = [...backlog, ...SEED];
      await store.set('backlog', JSON.stringify(backlog));
    }

    backlog.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ backlog })
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
