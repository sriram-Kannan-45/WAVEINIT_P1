// CI runs Jest over test/, while the focused local command uses node --test.
// Use Jest's global when present and Node's test runner otherwise.
const test = global.test || require('node:test').test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCorsOptions, getTrustProxyHops, isOriginAllowed, normaliseOrigin } = require('../src/config/security');

function evaluateOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
  });
}

test('production CORS only allows exact configured origins', async () => {
  const options = createCorsOptions({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://admin.waveinitlms.online, https://partners.example.org',
  });
  assert.equal(await evaluateOrigin(options, 'https://www.waveinitlms.online'), true);
  assert.equal(await evaluateOrigin(options, 'https://admin.waveinitlms.online'), true);
  assert.equal(await evaluateOrigin(options, 'https://evil.waveinitlms.online'), false);
  assert.equal(await evaluateOrigin(options, 'https://partners.example.org.evil.test'), false);
  assert.equal(isOriginAllowed('https://evil.waveinitlms.online', { NODE_ENV: 'production' }), false);
});

test('origin configuration rejects paths and malformed values', () => {
  assert.equal(normaliseOrigin('https://www.waveinitlms.online'), 'https://www.waveinitlms.online');
  assert.equal(normaliseOrigin('https://www.waveinitlms.online/path'), null);
  assert.equal(normaliseOrigin('not-a-url'), null);
});

test('proxy trust defaults safely and accepts bounded explicit hop counts', () => {
  assert.equal(getTrustProxyHops({ NODE_ENV: 'development' }), false);
  assert.equal(getTrustProxyHops({ NODE_ENV: 'production' }), 1);
  assert.equal(getTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' }), 2);
  assert.equal(getTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '100' }), 1);
});

test('proctoring event ingestion requires participant auth and attempt ownership', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/proctoringRoutes.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/proctoringController.js'), 'utf8');

  assert.match(
    routes,
    /router\.post\('\/events', auth, requireUserId, roleMiddleware\('PARTICIPANT'\), ctrl\.recordMonitoringEvent\)/,
  );
  assert.match(controller, /Attempt does not belong to the authenticated participant/);
  assert.match(controller, /if \(!attempt && !codingAttempt\)/);
});
