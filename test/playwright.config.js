// Playwright config for feedWeb localhost testing (POM).
// Local endpoints only. No dev-code changes required.
const { defineConfig, devices } = require('@playwright/test');

// Load test/.env without adding a dotenv dependency (keeps install minimal).
(function loadTestEnv() {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (_) {
    // .env is optional; env vars can be exported directly.
  }
})();

const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://localhost:5174').replace(/\/+$/, '');
const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');

// Resolve the chromium executable. Prefer an explicitly configured path, then a
// pre-installed ms-playwright build, and finally Playwright's own default
// resolution (i.e. `playwright install chromium`).
function resolveChromiumExecutable() {
  if (process.env.CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.CHROMIUM_EXECUTABLE_PATH)) {
    return process.env.CHROMIUM_EXECUTABLE_PATH;
  }
  const localAppData = process.env.LOCALAPPDATA || `${process.env.USERPROFILE}/AppData/Local`;
  const browsersRoot = path.join(localAppData, 'ms-playwright');
  if (!fs.existsSync(browsersRoot)) return undefined;
  const candidates = fs.readdirSync(browsersRoot)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const dir of candidates) {
    const exe = path.join(browsersRoot, dir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const chromiumExecutable = resolveChromiumExecutable();

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // A vite dev server compiles routes on demand, so keep parallelism modest to
  // avoid goto timeouts from cold-compile stampedes.
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    extraHTTPHeaders: {},
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
          args: ['--ignore-certificate-errors'],
        },
      },
    },
  ],
  // No webServer block on purpose: CI/dev already runs frontend:5174, backend:3001, ai-service:8000.
  // Override URLs with FRONTEND_URL / BACKEND_URL / AI_SERVICE_URL env vars if needed.
});

module.exports.FRONTEND_URL = FRONTEND_URL;
module.exports.BACKEND_URL = BACKEND_URL;
module.exports.AI_SERVICE_URL = AI_SERVICE_URL;