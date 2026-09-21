# CTRS Expert Review

A blinded expert-rating website for simulated cognitive behavioral therapy sessions. It uses the same deployment pattern as the Sakina expert-feedback project:

- React + Vite static frontend on GitHub Pages
- access-code gate and expert profile
- Cloudflare Worker API with signed sessions
- Cloudflare D1 storage
- GitHub Actions deployment and database migrations

## Study behavior

Experts score all 11 core Cognitive Therapy Rating Scale (CTRS) items from 0 to 6. All items are required; overall comments are optional. Drafts are saved in the browser until submission.

The public study data and Worker assignment catalog contain only anonymous labels/IDs. Therapist method and patient simulator names are not included. The Worker uses its generated server-side catalog rather than trusting candidate pairs sent by a browser. For each expert, it:

1. excludes every hidden `(method, simulator)` pair already shown to that expert;
2. selects a remaining pair with the fewest completed expert evaluations;
3. within that pair, selects one of the three sessions with the fewest completed evaluations;
4. uses random tie-breaking.

An assignment is persisted as soon as the session is shown, so refreshing or signing in on another device returns the same session. An expert receives at most one session from each pair.

## Session data

Run this from the website directory:

```bash
npm install
npm run prepare-data
```

The importer scans `../../simulations/outputs/*/run_config.json`, keeps CBT runs whose patient model is GPT-5.1, groups them by `therapist_method` and `patient_simulator`, and imports the first three transcript-bearing profile directories in natural sort order. It writes the anonymized result to `public/data/study-data.json`.

It also writes `research/study-key.json`, which maps the opaque database IDs back to method, simulator, run, and source profile, plus `worker/src/catalog.generated.js`, which gives the Worker its anonymous allow-list. The private analysis key is git-ignored and must not be copied into `public/` or shared with raters. Keep a secure copy alongside each exported dataset; commit the public study JSON and generated Worker catalog.

The currently available repository data produces three sessions from one hidden pair. When the other simulator/method outputs (including TOPAS) are added, rerun `npm run prepare-data` and commit the updated JSON. If the parent simulation directory is absent in the standalone GitHub repository, builds retain the committed study data.

## Local development

Frontend-only testing stores profiles, assignments, drafts, and ratings in browser storage:

```bash
npm install
npm run dev
```

To test the Worker and D1 locally:

```bash
npm --prefix worker install
npm run worker:migrate:local
npm run worker:dev
```

Then create `.env.local` with:

```text
VITE_API_BASE=http://127.0.0.1:8787
```

The default source-tree access hash is the SHA-256 digest of the current study access code. For production, continue setting `ACCESS_CODE_HASH` as a GitHub secret so code rotation does not require a source change.

## GitHub Pages and Cloudflare deployment

Create a GitHub repository with this directory as its root, enable **Settings → Pages → Source: GitHub Actions**, and add these repository secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account containing Workers and D1 |
| `CLOUDFLARE_API_TOKEN` | Token with Workers Scripts edit and D1 edit permissions |
| `ACCESS_CODE_HASH` | SHA-256 hex digest of the expert access code |
| `TOKEN_SECRET` | Long random secret used to sign expert sessions |
| `ADMIN_EXPORT_TOKEN` | Optional long random token for data export |
| `VITE_API_BASE` | Optional explicit Worker URL; auto-detected when deployment prints a `workers.dev` URL |

Generate suitable values locally, for example:

```bash
node -e "crypto.subtle.digest('SHA-256',new TextEncoder().encode('YOUR ACCESS CODE')).then(x=>console.log(Buffer.from(x).toString('hex')))"
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The workflow creates or reuses the `ctrs_expert_rating` D1 database, applies migrations, deploys the Worker, writes the runtime API URL, builds the site with the repository base path, and deploys Pages.

If the GitHub organization/user is not `saif-daoud`, update `ALLOWED_ORIGINS` in `worker/wrangler.toml` before deploying.

## Export study data

The export route is protected by `ADMIN_EXPORT_TOKEN` and is intentionally not exposed in the expert UI:

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/export" \
  -H "Content-Type: application/json" \
  --data '{"admin_token":"YOUR_ADMIN_EXPORT_TOKEN"}' \
  --output ctrs-study-export.json
```

The export contains participant profiles, assignments, and ratings. Treat it as sensitive research data.
