/* Web Worker: сверка силуэта в фоне, чтобы интерфейс и анимации не подвисали.
   Если воркер не запустился, app.js считает то же самое в основном потоке. */
importScripts('scan-core.js');
self.onmessage = e => {
  const msg = e.data;
  if (msg.cmd === 'ping'){ self.postMessage({ id: msg.id, ok: true, pong: true }); return; }
  try {
    const out = ScanCore.run(msg);
    self.postMessage({ id: msg.id, ok: true, out }, out.mask ? [out.mask.buffer] : []);
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
  }
};
