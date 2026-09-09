import { useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';

let configuredMonaco;

function configureMonaco() {
  if (!configuredMonaco) {
    configuredMonaco = import('monaco-editor').then((monaco) => {
      // The wrapper otherwise downloads Monaco's AMD runtime from jsDelivr.
      // Loading the bundled ESM module only when an editor is opened keeps the
      // coding experience CSP-compatible without preloading it for every page.
      loader.config({ monaco });
      return monaco;
    });
  }
  return configuredMonaco;
}

export default function SecureMonacoEditor({ loading = null, ...props }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    configureMonaco().then(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  return ready ? <Editor {...props} /> : loading;
}
