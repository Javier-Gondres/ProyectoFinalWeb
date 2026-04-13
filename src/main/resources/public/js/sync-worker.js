self.onmessage = (e) => {
  const { wsUrl, token, items } = e.data;
  const url = wsUrl + "?token=" + encodeURIComponent(token);
  const ws = new WebSocket(url);
  let finished = false;

  const to = setTimeout(() => {
    finish({ ok: false, error: "timeout" });
  }, 120000);

  function finish(payload) {
    if (finished) return;
    finished = true;
    clearTimeout(to);
    self.postMessage(payload);
    try {
      ws.close();
    } catch (_) {}
  }

  ws.onopen = () => {
    try {
      ws.send(JSON.stringify({ items }));
    } catch {
      finish({ ok: false, error: "send" });
    }
  };
  ws.onmessage = (ev) => {
    const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
    finish({ ok: true, raw });
  };
  ws.onerror = () => {
    finish({ ok: false, error: "websocket" });
  };
};
