/* Loaded before the Vite entry point and covered by the response CSP. */
(function bootstrapWaveInit() {
  const nonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');

  // React and Monaco create style elements at runtime. Apply the page nonce before
  // a style is attached so strict style-src remains compatible with the application.
  if (nonce) {
    const addNonce = (node) => {
      if (!node) return;
      const apply = (element) => {
        if (element?.nodeType === Node.ELEMENT_NODE && element.tagName === 'STYLE' && !element.nonce) {
          element.setAttribute('nonce', nonce);
        }
      };
      apply(node);
      node.querySelectorAll?.('style:not([nonce])').forEach(apply);
    };

    for (const method of ['appendChild', 'insertBefore', 'replaceChild']) {
      const original = Node.prototype[method];
      Node.prototype[method] = function patchStyleNonce(node, ...args) {
        addNonce(node);
        return original.call(this, node, ...args);
      };
    }
    for (const prototype of [Element.prototype, DocumentFragment.prototype]) {
      for (const method of ['append', 'prepend']) {
        const original = prototype[method];
        if (!original) continue;
        prototype[method] = function patchStyleNonceList(...nodes) {
          nodes.forEach(addNonce);
          return original.apply(this, nodes);
        };
      }
    }
  }

  function showStartupError(message) {
    const loader = document.getElementById('app-initial-loader');
    if (!loader) return;
    loader.replaceChildren();
    loader.setAttribute('role', 'alert');
    const title = document.createElement('h3');
    title.textContent = 'Unable to Load Application';
    const detail = document.createElement('p');
    detail.textContent = message || 'An unexpected startup error occurred.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload Application';
    reload.addEventListener('click', () => window.location.reload());
    loader.append(title, detail, reload);
  }

  window.addEventListener('error', (event) => {
    if (document.getElementById('app-initial-loader')) showStartupError(event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (document.getElementById('app-initial-loader')) {
      showStartupError(event.reason?.message || String(event.reason || 'Async startup error'));
    }
  });
})();
