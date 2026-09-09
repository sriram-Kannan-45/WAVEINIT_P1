const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'https://localhost:5174',
];

const DEFAULT_PRODUCTION_ORIGINS = ['https://www.waveinitlms.online'];

function normaliseOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch (_) {
    return null;
  }
}

function configuredOrigins(env) {
  return [env.FRONTEND_URL, env.ALLOWED_ORIGINS, env.SECURITY_CORS_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map(normaliseOrigin)
    .filter(Boolean);
}

function getAllowedOrigins(env = process.env) {
  const isDevelopment = env.NODE_ENV !== 'production';
  return new Set([
    ...DEFAULT_PRODUCTION_ORIGINS,
    ...configuredOrigins(env),
    ...(isDevelopment ? LOCAL_DEVELOPMENT_ORIGINS : []),
  ]);
}

function isOriginAllowed(origin, env = process.env) {
  const isDevelopment = env.NODE_ENV !== 'production';
  if (!origin || (isDevelopment && !env.SECURITY_CORS_ENFORCE_DEV)) return true;
  return getAllowedOrigins(env).has(origin);
}

function createCorsOptions(env = process.env) {
  return {
    origin(origin, callback) {
      // Native apps, health probes, and server-to-server calls do not carry Origin.
      return callback(null, isOriginAllowed(origin, env));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  };
}

function getTrustProxyHops(env = process.env) {
  if (env.NODE_ENV !== 'production' && env.TRUST_PROXY_HOPS === undefined) return false;
  const value = Number.parseInt(env.TRUST_PROXY_HOPS || '1', 10);
  return Number.isInteger(value) && value >= 0 && value <= 10 ? value : 1;
}

module.exports = {
  createCorsOptions,
  getTrustProxyHops,
  getAllowedOrigins,
  isOriginAllowed,
  normaliseOrigin,
};
