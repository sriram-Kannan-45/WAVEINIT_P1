const path = require('path');
const backendDir = process.argv[2];
const express = require('express');

const routes = [];
const routerBase = new Map();

const origFactory = express.Router;
express.Router = function (...args) {
  const r = origFactory.apply(this, args);
  routerBase.set(r, '');
  return r;
};

const proto = express.Router.prototype;
for (const m of ['get', 'post', 'put', 'delete', 'patch', 'all']) {
  const orig = proto[m];
  proto[m] = function (p, ...handlers) {
    const base = routerBase.get(this) || '';
    routes.push(`${m.toUpperCase()} ${(base + p).replace(/\/+/g, '/')}`);
    return orig.apply(this, [p, ...handlers]);
  };
}

const origUse = proto.use;
proto.use = function (...args) {
  const isPath = typeof args[0] === 'string';
  const mountPath = isPath ? args[0] : '/';
  const handlers = isPath ? args.slice(1) : args;
  const parentBase = routerBase.get(this) || '';
  const joined = (parentBase + mountPath).replace(/\/+/g, '/');
  for (const h of handlers) {
    if (h && h.stack && !h.route) {
      routerBase.set(h, joined === '/' ? '' : joined);
    }
  }
  return origUse.apply(this, args);
};

require(path.join(backendDir, 'src', 'app.js'));

const uniq = [...new Set(routes)].sort();
for (const r of uniq) console.log(r);
