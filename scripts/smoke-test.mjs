#!/usr/bin/env node
// Smoke test for Automation Priority Sorter, run against the LIVE deployed
// site (not local dev), since it hits real Netlify Functions + Blobs + the
// real Anthropic API. Unlike the rest of the cosmik.work suite this tool has
// no background-function-plus-polling pipeline, submit.js answers
// synchronously in one request, so this test is a single round trip rather
// than a poll loop.
//
// Submits with department "__smoketest__", a marker submit.js checks to
// skip writing to the shared public backlog store. This still exercises the
// real rate limiter and the real Anthropic call, it just never touches the
// list every site visitor sees. Do not remove the marker, or every run of
// this script permanently adds a fake entry to the live public backlog.
//
// Usage: node scripts/smoke-test.mjs [base_url]
// Default base_url: https://automation-priority-sorter.netlify.app

const BASE_URL = process.argv[2] || 'https://automation-priority-sorter.netlify.app';

const TEST_PAIN_POINT =
  'Every Friday I manually copy the same sales numbers from three spreadsheets into one summary email, takes about 40 minutes each time.';

function log(msg) { console.log(msg); }
function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function pass(msg) { console.log('PASS: ' + msg); }

async function main() {
  log(`Testing ${BASE_URL}\n`);

  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${BASE_URL}/.netlify/functions/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Test',
        department: '__smoketest__',
        painPoint: TEST_PAIN_POINT
      })
    });
  } catch (e) {
    fail(`Could not reach submit: ${e.message}`);
    return;
  }
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (res.status === 429) {
    fail(`Hit the daily/per-IP rate limit (429). Can't verify further this run: ${await res.text()}`);
    return;
  }
  if (res.status !== 200) {
    fail(`Unexpected status from submit: ${res.status}: ${await res.text().catch(() => '')}`);
    return;
  }
  pass(`submit responded 200 in ${elapsedSec}s.`);

  const data = await res.json();
  const entry = data.entry || {};

  const issues = [];
  if (typeof entry.id !== 'string' || !entry.id) issues.push('missing id');
  if (!Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 10) issues.push(`rating out of range: ${entry.rating}`);
  if (typeof entry.fix !== 'string' || !entry.fix) issues.push('missing fix');
  if (typeof entry.timeSaved !== 'string' || !entry.timeSaved) issues.push('missing timeSaved');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(entry.priority)) issues.push(`priority not LOW/MEDIUM/HIGH: ${entry.priority}`);
  if (entry.status !== 'Pending') issues.push(`status should start as Pending, got ${entry.status}`);
  if (entry.painPoint !== TEST_PAIN_POINT) issues.push('painPoint echoed back does not match what was submitted');

  if (issues.length === 0) {
    pass(`Triage entry well-formed: rating ${entry.rating}/10, priority ${entry.priority}, "${entry.fix}"`);
  } else {
    fail(`Triage entry issues: ${issues.join(', ')}`);
  }

  if (typeof data.remainingToday === 'number' && data.remainingToday >= 0) {
    pass(`remainingToday is a sane number: ${data.remainingToday}.`);
  } else {
    fail(`remainingToday missing or not a non-negative number: ${data.remainingToday}`);
  }

  let listRes;
  try {
    listRes = await fetch(`${BASE_URL}/.netlify/functions/list`);
  } catch (e) {
    fail(`Could not reach list: ${e.message}`);
    return;
  }
  if (listRes.status !== 200) {
    fail(`Unexpected status from list: ${listRes.status}`);
    return;
  }
  const listData = await listRes.json();
  const backlog = listData.backlog || [];

  if (!backlog.some((e) => e.id === entry.id)) {
    pass(`Smoke-test entry (${entry.id}) correctly did NOT get written to the public backlog.`);
  } else {
    fail(`Smoke-test entry (${entry.id}) leaked into the public backlog, the __smoketest__ marker isn't excluding it.`);
  }

  if (backlog.some((e) => e.id === 'seed-1') && backlog.some((e) => e.id === 'seed-2')) {
    pass('Seed entries (Contract Generator, Fieldnote) present in the backlog.');
  } else {
    fail('Expected seed entries seed-1 and seed-2 to be present in the backlog.');
  }

  log('\n--- Submitted entry (for manual eyeballing) ---');
  log(JSON.stringify(entry, null, 2));
}

main();
