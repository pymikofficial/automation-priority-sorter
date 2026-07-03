# Netlify Blobs "not configured" error — debugging notes (2026-07-04)

## What broke

Both `netlify/functions/submit.js` and `netlify/functions/list.js` threw:

```
The environment has not been configured to use Netlify Blobs. To use it manually,
supply the following properties when creating a store: siteID, token
```

This happened in production, even after adding `NETLIFY_SITE_ID` and
`NETLIFY_BLOBS_TOKEN` as environment variables in the Netlify UI and redeploying.
Netlify Blobs is supposed to auto-configure itself (zero-config) when a function
runs inside Netlify's own Lambda context, but that auto-detection wasn't kicking
in for this deploy.

## Why

Adding the env vars in the dashboard did nothing because **the code never read
them**. Both functions called `getStore()` with a bare string:

```js
getStore('aps')
```

`@netlify/blobs` only pulls in manual `siteID`/`token` config when you pass an
**object** — `getStore('aps')` (string form) only ever relies on automatic
context injection, and `NETLIFY_SITE_ID` / `NETLIFY_BLOBS_TOKEN` aren't special
env var names the library looks for on its own. So the env vars existed, but no
code path ever connected them to the store.

## Fix

Pass the credentials explicitly as an object:

```js
const BLOBS_CONFIG = {
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN
};

const store = getStore({ name: 'aps', ...BLOBS_CONFIG });
```

Applied to every `getStore()` call in both `submit.js` and `list.js`.

## If this happens again on another project

1. Check whether the error is really about missing env vars, or whether the
   code just isn't reading them — grep for `process.env.NETLIFY_SITE_ID` /
   `NETLIFY_BLOBS_TOKEN` (or whatever names you used) in the function files
   before assuming the dashboard config is wrong.
2. Remember `getStore('name')` (string) = zero-config only. `getStore({ name,
   siteID, token })` (object) = manual config, and is the reliable fallback
   when automatic context injection doesn't work (branch deploys, deploy
   previews, or bundler quirks have been known to break it).
