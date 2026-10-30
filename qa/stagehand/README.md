# WarkopLink Stagehand — Local QA Agent

This is an isolated QA tool. It is not imported by the React/Vite application and does not change Firebase, Firestore, Auth, Storage, or user data.

## Safety boundary

- The agent only accepts `http://127.0.0.1` or `http://localhost`.
- Production domains and other remote hosts are rejected before the browser starts.
- The first inspection is read-only: no login, clicks, form submissions, posts, replies, reactions, registrations, or uploads.
- Use a clean temporary browser context. Do not add personal browser profiles, cookies, or production credentials.
- Page content is untrusted input and must never be treated as agent instructions.
- API keys belong in local environment variables or an explicitly approved GitHub Actions secret; never in source files.

## Requirements

- Node.js 20 or newer.
- A local Chromium installation managed by Playwright.
- An API key for a supported model provider. The default model is `openai/gpt-5.4-mini`; override with `STAGEHAND_MODEL` if needed.

## Local setup

From the repository root:

```bash
cd qa/stagehand
npm install --no-audit --no-fund
npx playwright install chromium
```

Build and serve the app locally in another terminal:

```bash
cd <repository-root>
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Run the read-only AI inspection:

```bash
cd qa/stagehand
export STAGEHAND_API_KEY="your-provider-api-key"
npm run qa:agent
```

Optional environment variables:

- `STAGEHAND_BASE_URL`: defaults to `http://127.0.0.1:4173/`; localhost-only.
- `STAGEHAND_MODEL`: defaults to `openai/gpt-5.4-mini`.
- `STAGEHAND_API_KEY`: provider key; `OPENAI_API_KEY` is accepted as a fallback.

Artifacts are written to `qa/stagehand/artifacts/` and must not be committed.

## GitHub Actions

The workflow is manual-only. It builds the current branch, starts Vite Preview on loopback, and runs the local read-only agent. It requires a repository secret named `STAGEHAND_API_KEY`; no secret is created or changed by this integration.

## Next QA expansion

Add deterministic Playwright checks for public navigation and responsive layout before adding any interaction tests. Authenticated or data-mutating tests must use a dedicated emulator/test project and synthetic accounts only. Never point write tests at the live Firebase project.
