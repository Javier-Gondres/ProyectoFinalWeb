/**
 * Web Worker: abre WebSocket con token en query y envía { items: [...] }.
 */
self.onmessage = (e) => {
  const { wsUrl, token, items } = e.data;
  const url = wsUrl + "?token=" + encodeURIComponent(token);
  const ws = new WebSocket(url);
  const to = setTimeout(() => {
    try {
      ws.close();
    } catch (_) {}
    self.postMessage({ ok: false, error: "timeout" });
  }, 60000);

  ws.onopen = () => {
    ws.send(JSON.stringify({ items }));
  };
  ws.onmessage = (ev) => {
    clearTimeout(to);
    self.postMessage({ ok: true, raw: ev.data });
    ws.close();
  };
  ws.onerror = () => {
    clearTimeout(to);
    self.postMessage({ ok: false, error: "websocket" });
  };
};
