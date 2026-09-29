# feedWeb - Playwright POM tests (`/test`)

Localhost-only end-to-end suite for the full project.
**Does not edit dev code** (`backend/`, `frontend/`, `ai-service/` stay untouched).

## Endpoints (localhost)

| Service | URL | Paths used |
| --- | --- | --- |
| Frontend (vite) | `https://localhost:5174` | `/`, `/login`, `/register`, `/admin`, `/trainer`, `/participant`, `/verify-certificate`, `/privacy` |
| Backend (Express) | `http://localhost:3001` | `/api/health`, `/api/ai/health`, `/api/auth/login` |
| AI service (FastAPI) | `http://localhost:8000` | `/health`, `/ready` |

Frontend uses HTTPS because `frontend/.cert/` exists locally. If your vite dev
server is HTTP, set `FRONTEND_URL=http://localhost:5174` in `test/.env`.

## Layout (Page Object Model)

```
test/
  playwright.config.js          localhost config, chromium, html report
  .env.example                  copy to .env
  scripts/                      offline verification helpers
    verify-file-signatures.js   backend magic-byte validator check
  pages/
    BasePage.js                 shared goto/title/hasText
    LoginPage.js                email + password + submit
    RegisterPage.js             name + email + password
    DashboardPage.js            /admin /trainer /participant guards
    PublicPages.js              /, /verify-certificate, /privacy, /apply
  utils/
    endpoints.js                single source of localhost URLs
    routes.js                   full App.jsx route registry (56 routes)
  tests/
    app-smoke.spec.js           UI smoke                       @smoke
    api-health.spec.js          backend + AI health            @smoke
    public-pages.spec.js        public content assertions      @smoke
    routes-all.spec.js          every route: renders or guards
    auth.spec.js                route guards + login
    api-auth.spec.js            backend login API negatives
    csp-policy.spec.js          static CSP regression guards
    security-headers.spec.js    read-only header check
```

## Setup

```powershell
cd test
npm install
npx playwright install chromium      # browser download (once)
Copy-Item .env.example .env
```

Start the app first in separate terminals:

```powershell
# 1. backend
cd backend ; npm run dev
# 2. ai-service
cd ai-service ; uvicorn main:app --port 8000
# 3. frontend
cd frontend ; npm run dev
```

## Run

```powershell
cd test
npx playwright test                    # all tests
npx playwright test --grep "@smoke"    # smoke subset
npx playwright test tests/auth.spec.js
npx playwright test --headed           # watch it run
npx playwright show-report
```

Expected: **83 tests** (81 pass + 2 env-gated skips).

Offline check (no servers needed):

```powershell
node scripts/verify-file-signatures.js
```

Or via npm scripts:

```powershell
npm test
npm run test:smoke
npm run test:auth
npm run test:api
npm run report
```

## Environment overrides (`test/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `FRONTEND_URL` | `https://localhost:5174` | vite dev origin |
| `BACKEND_URL` | `http://localhost:3001` | Express API |
| `AI_SERVICE_URL` | `http://localhost:8000` | FastAPI service |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | empty | enables env-gated positive login tests |
| `TEST_TRAINER_EMAIL` / `TEST_PARTICIPANT_EMAIL` | empty | reserved for role-specific specs |

Positive-login tests **auto-skip** when credentials are not provided, so the
suite is green out of the box without touching any database.

## CI

`.github/workflows/test-suite.yml` runs on push/PR:

1. **static-checks** — backend syntax + security/GDPR tests, frontend policy
   test + production build, `py_compile` over the AI service, dependency audits.
2. **e2e-playwright** — boots MySQL, the backend, a vite preview server, then
   runs this whole suite.

## Notes

- `ignoreHTTPSErrors: true` because the vite dev cert is self-signed.
- `trace` / `video` are off by default to keep runs fast; enable per-run with
  `--trace on` if you need artifacts.
- `retries: 1` (2 in CI) and `workers: 4` keep cold vite compilations from
  being reported as application failures.
- The suite only performs read-only GETs plus negative auth POSTs, so it is safe
  against a real local database.
- `test/.env`, `test/node_modules/`, `test/test-results/`, `test/playwright-report/`
  are git-ignored; the specs themselves are tracked.