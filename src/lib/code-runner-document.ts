export function codeRunnerCsp(origin: string) {
  // The opaque-origin worker may fetch only public runtime assets.
  const assets = new URL("/code-runtime/", origin).href;
  return `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: ${assets}; worker-src blob:; connect-src ${assets}; child-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`;
}
export function codeRunnerDocument(origin: string) {
  const assets = JSON.stringify(new URL("/code-runtime/", origin).href);
  return `<!doctype html><title>Studyspace code runner</title><script>
  const assets = ${assets};
  let token, worker;
  const send = data => parent.postMessage({...data, token}, '*');
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (worker && event.data?.token === token && event.data?.type === 'stop') { worker.terminate(); return; }
    if (worker || typeof event.data?.code !== 'string' || typeof event.data?.token !== 'string') return;
    token = event.data.token;
    try {
      const bootstrap = 'const pending=[]; self.onmessage=e=>pending.push(e); import(' + JSON.stringify(assets + 'worker.mjs') + ').then(()=>pending.forEach(e=>self.onmessage(e))).catch(e=>self.postMessage({type:"error",text:"Runtime loading failed: "+e}));';
      const url = URL.createObjectURL(new Blob([bootstrap], {type:'text/javascript'}));
      worker = new Worker(url);
      // Keep the bootstrap URL alive until this frame is removed.
      worker.onmessage = e => send(e.data);
      worker.onerror = e => send({type:'error', text:'The runtime could not load. ' + (e.message || 'Check your connection and try Run again.')});
      worker.postMessage({...event.data, assets});
    } catch (error) { send({type:'error', text:String(error)}); }
  });
  addEventListener('pagehide', () => worker?.terminate());
  send({type:'ready', channel:'studyspace-code'});
<\/script>`;
}
