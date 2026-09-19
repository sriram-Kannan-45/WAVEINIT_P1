/**
 * Development-only performance instrumentation.
 *
 * Activated automatically in `development`, or in production when
 * `PERF_LOGGING=true` is set. Produces:
 *   [PERF]  GET /api/admin/training-stats total=842ms db=620ms phases=[...]
 *   [DB PERF] query=... duration=620ms
 *
 * Also keeps a lightweight in-memory aggregate (avg / P50 / P95 / P99 /
 * slowest / error rate per route) exposed at GET /api/debug/perf so latency
 * can be reviewed during development without external tools.
 *
 * Production traffic is NOT affected unless PERF_LOGGING=true is explicit.
 */
const { AsyncLocalStorage } = require('async_hooks');
const logger = require('./logger');

const PERF_ENABLED = () => process.env.NODE_ENV !== 'production' || process.env.PERF_LOGGING === 'true';
const DB_SLOW_MS = Number(process.env.PERF_DB_SLOW_MS || 200);
const MAX_SAMPLES_PER_ROUTE = 1000;

const als = new AsyncLocalStorage();

const stats = new Map();

function nowMs() {
  return process.hrtime.bigint();
}

function elapsedMs(t0) {
  return Number(nowMs() - t0) / 1e6;
}

function routeKeyFor(req) {
  if (req.route && req.route.path) {
    return `${req.baseUrl || ''}${req.route.path}`;
  }
  return req.originalUrl.replace(/\/\d+/g, '/:id');
}

function record(route, ms, isError) {
  let entry = stats.get(route);
  if (!entry) {
    entry = { count: 0, sum: 0, sumSq: 0, errors: 0, max: 0, latencies: [] };
    stats.set(route, entry);
  }
  entry.count += 1;
  entry.sum += ms;
  entry.sumSq += ms * ms;
  if (isError) entry.errors += 1;
  if (ms > entry.max) entry.max = ms;
  entry.latencies.push(ms);
  if (entry.latencies.length > MAX_SAMPLES_PER_ROUTE) entry.latencies.shift();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const idx = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[idx];
}

/**
 * Per-request middleware. Starts a timing context, exposes req.perf.mark(name)
 * and accumulates DB time reported by instrumented queries.
 */
function perfMiddleware(req, res, next) {
  if (!PERF_ENABLED()) return next();

  const store = { t0: nowMs(), dbMs: 0, phases: [] };
  req.perf = {
    mark: (label) => {
      store.phases.push([label, Math.round(elapsedMs(store.t0))]);
    },
    now: () => Math.round(elapsedMs(store.t0)),
  };

  als.run(store, () => {
    res.on('finish', () => {
      const total = elapsedMs(store.t0);
      const route = routeKeyFor(req);
      const isError = res.statusCode >= 400;
      record(route, total, isError);

      const slowEnough = total >= Number(process.env.PERF_SLOW_REQUEST_MS || 300) || isError;
      if (slowEnough) {
        const phases = store.phases.length ? ` phases=[${store.phases.map(([k, v]) => `${k}:${v}ms`).join(', ')}]` : '';
        logger.info(
          `[PERF] ${req.method} ${req.originalUrl} total=${Math.round(total)}ms db=${store.dbMs.toFixed(1)}ms${phases}${isError ? ` status=${res.statusCode}` : ''}`
        );
      }
    });
    next();
  });
}

function perfStatsReport() {
  const report = [];
  for (const [route, entry] of stats.entries()) {
    const sorted = entry.latencies.slice().sort((a, b) => a - b);
    report.push({
      endpoint: route,
      requests: entry.count,
      avgMs: Math.round(entry.sum / entry.count),
      p50Ms: Math.round(percentile(sorted, 50)),
      p95Ms: Math.round(percentile(sorted, 95)),
      p99Ms: Math.round(percentile(sorted, 99)),
      slowestMs: Math.round(entry.max),
      errorRate: Math.round((entry.errors / entry.count) * 1000) / 10,
    });
  }
  report.sort((a, b) => b.p95Ms - a.p95Ms || b.requests - a.requests);
  return report;
}

function resetPerfStats() {
  stats.clear();
}

function hasPerfStore() {
  return PERF_ENABLED();
}

/**
 * Wrap sequelize.query so every DB statement contributes its duration to the
 * current request store and logs slow queries as [DB PERF].
 */
function installDbHook(sequelize) {
  if (!sequelize || sequelize.__perfInstalled) return sequelize;
  const originalQuery = sequelize.query.bind(sequelize);

  sequelize.query = function wrappedQuery(...args) {
    const t0 = nowMs();
    const store = als.getStore();
    try {
      const result = originalQuery(...args);
      const done = () => {
        const ms = elapsedMs(t0);
        if (store) store.dbMs += ms;
        if (ms >= DB_SLOW_MS) {
          let sql = args[0] && typeof args[0] === 'string' ? args[0] : (args[0] && args[0].query) || '';
          if (sql.length > 400) sql = `${sql.slice(0, 400)}…`;
          logger.info(`[DB PERF] duration=${ms.toFixed(0)}ms query=${String(sql).replace(/\s+/g, ' ').trim()}`);
        }
      };
      if (result && typeof result.then === 'function') result.then(done, done);
      else done();
      return result;
    } catch (error) {
      if (store) store.dbMs += elapsedMs(t0);
      throw error;
    }
  };
  sequelize.__perfInstalled = true;
  return sequelize;
}

module.exports = { perfMiddleware, installDbHook, perfStatsReport, resetPerfStats, hasPerfStore };