# Automation Priority Sorter

A live triage engine. Submit a manual pain point, Claude scores it in real time, and it joins an open backlog. This is the front door to everything Soumik Chatterjee has shipped, the tool that decides what gets built next.

**Live:** [automation-priority-sorter.netlify.app](https://automation-priority-sorter.netlify.app)

## The headache

Every founder's office has a running list of "someone should really automate this," and it usually lives nowhere, half-remembered across Slack threads and hallway conversations. Nothing gets prioritized because nothing gets written down in one place with an honest estimate attached.

## The machinery

Unlike the rest of the cosmik.work suite, this tool has no background-function-plus-polling pipeline. `submit.js` answers synchronously in a single request, since a triage call is short enough to fit inside Netlify's ~10s function timeout.

1. Visitor submits a pain point (name and department optional). `submit.js` checks the daily and per-IP rate limits, then makes one Claude call with a strict-JSON system prompt asking for an automatability rating (1-10), a concrete fix, an estimated time saved, and a priority band.
2. The scored entry is unshifted onto a shared `backlog` Blob (capped at 200 entries) and returned to the client immediately.
3. `list.js` reads the same Blob for the "Open backlog" section every visitor sees, seeding two example entries (Fieldnote, Contract Generator) on first read so the list is never empty.

### Guardrails

- **Daily + per-IP rate limits**: a Blob-backed counter caps total triages per day and per IP, keeping a public free tool's API spend bounded.
- **Output escaping**: every backlog card renders submitted names, departments, and pain-point text through `escapeHtml()` before `innerHTML`, so a hostile submission can't inject markup into the public page.
- **CORS locked to origin**: `submit.js` only accepts requests from `automation-priority-sorter.netlify.app`.

## Environment variables (all three required)

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Per-project Anthropic API key |
| `NETLIFY_SITE_ID` | This site's ID, from Project details |
| `NETLIFY_BLOBS_TOKEN` | Netlify Personal Access Token |

Optional overrides: `DAILY_CAP` (default 15), `DAILY_CAP_PER_IP` (default 5).

Note: `getStore()` must be called with explicit `siteID` and `token`. Relying on ambient environment configuration throws `"The environment has not been configured to use Netlify Blobs"` in this deployment setup.

## Run it locally

1. Clone this repo.
2. `npm install`
3. `netlify dev` (with the three env vars set in a `.env` file or the Netlify CLI)

## Smoke test

`npm test` (or `node scripts/smoke-test.mjs`) submits a real pain point to the live site and checks the triage response is well-formed (rating in range, priority one of LOW/MEDIUM/HIGH, time-saved estimate present), then confirms `list.js` still serves the seed entries correctly.

The submission uses a reserved `department: "__smoketest__"` marker, which `submit.js` checks to skip writing to the shared public backlog. This still exercises the real rate limiter and the real Anthropic call, it just never leaves a fake entry in the list every site visitor sees. Do not run the test with any other department value unless you're fine with a permanent test entry showing up on the live site.

Part of the [cosmik.work](https://cosmik.work) Business OS suite. Netlify Functions + Blobs for background processing and backlog storage.

Built by [Soumik Chatterjee](https://cosmik.work).
