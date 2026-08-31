/**
 * Instance identity helpers.
 *
 * Every backend process (App Service instance) gets a stable, unique ID so the
 * health endpoints and multi-instance tooling can tell instances apart.
 *
 * Precedence:
 *   1. INSTANCE_ID env var (set by the platform / deployment / scale-out test)
 *   2. WEBSITE_INSTANCE_ID (Azure App Service instance marker — changes on
 *      replica modifications)
 *   3. HOSTNAME + PID + listening port
 */

const os = require('os');
const path = require('path');

const PORT = process.env.PORT || 3001;

let cachedInstanceId = null;

function getInstanceId() {
  if (cachedInstanceId) return cachedInstanceId;

  if (process.env.INSTANCE_ID && String(process.env.INSTANCE_ID).trim()) {
    cachedInstanceId = String(process.env.INSTANCE_ID).trim();
    return cachedInstanceId;
  }

  if (process.env.WEBSITE_INSTANCE_ID && String(process.env.WEBSITE_INSTANCE_ID).trim()) {
    cachedInstanceId = String(process.env.WEBSITE_INSTANCE_ID).trim();
    return cachedInstanceId;
  }

  const host = process.env.HOSTNAME || os.hostname() || 'localhost';
  cachedInstanceId = `inst-${host}-p${process.pid}-${PORT}`;
  return cachedInstanceId;
}

function getInstanceInfo() {
  return {
    instance_id: getInstanceId(),
    hostname: os.hostname(),
    pid: process.pid,
    port: PORT,
    cwd: process.cwd(),
    storage_root: require('./paths').getStorageRoot(),
    node_version: process.version,
    started_at: new Date().toISOString(),
  };
}

module.exports = { getInstanceId, getInstanceInfo };