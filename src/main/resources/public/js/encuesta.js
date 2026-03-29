import { tokenActual } from "./auth.js";
import { apiJson, wsSyncUrl } from "./api.js";
import { initSessionHeader } from "./nav-session.js";

if (!tokenActual()) {
  window.location.href = "/login.html";
} else {
  (async () => {
    await initSessionHeader();
    initEncuesta();
  })();
}

function initEncuesta() {
  const DB = "encuesta_offline_v1";
  const STORE = "pendientes";

  function openDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onerror = () => rej(r.error);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "localId", autoIncrement: true });
      r.onsuccess = () => res(r.result);
    });
  }

  async function guardarPendiente(payload) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add({ ...payload, creadoLocal: Date.now() });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async function listarPendientes() {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const q = tx.objectStore(STORE).getAll();
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => rej(q.error);
    });
  }

  async function borrarPendiente(localId) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(localId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  function leerFormulario() {
    const nombre = document.querySelector('[name="nombre"]').value.trim();
    const sector = document.querySelector('[name="sector"]').value.trim();
    const nivelEscolar = document.querySelector('[name="nivelEscolar"]').value;
    const latitud = parseFloat(document.getElementById("lat").value);
    const longitud = parseFloat(document.getElementById("lon").value);
    const imagenBase64 = document.getElementById("imagenBase64").value.trim();
    return { nombre, sector, nivelEscolar, latitud, longitud, imagenBase64 };
  }

  function validar(p) {
    if (!p.nombre || !p.sector || !p.nivelEscolar) return "Complete nombre, sector y nivel.";
    if (Number.isNaN(p.latitud) || Number.isNaN(p.longitud)) return "Coordenadas inválidas.";
    if (!p.imagenBase64) return "Tome o elija una foto.";
    return null;
  }

  const msg = document.getElementById("msg");
  function flash(text, ok) {
    msg.innerHTML = '<div class="msg ' + (ok ? "ok" : "err") + '">' + text + "</div>";
  }

  /** Data URL completa solo para vista previa (conserva MIME de archivo o JPEG de la webcam). */
  let fotoPreviewUrl = null;
  /** Texto para el resumen: nombre de archivo o origen. */
  let fotoOrigenTexto = "";

  /** Extrae el payload base64 de un data URL (evita fallos si hubiera más comas). */
  function base64DesdeDataUrl(dataUrl) {
    const s = String(dataUrl);
    const mark = "base64,";
    const i = s.indexOf(mark);
    if (i >= 0) return s.slice(i + mark.length).replace(/\s/g, "");
    const c = s.indexOf(",");
    return c >= 0 ? s.slice(c + 1).replace(/\s/g, "") : "";
  }

  function setVistaPreviaSrc(img, url) {
    if (!url) {
      img.removeAttribute("src");
      return;
    }
    img.src = url;
  }

  function actualizarUIFoto() {
    const raw = document.getElementById("imagenBase64").value;
    const b64 = raw.replace(/\s/g, "");
    const block = document.getElementById("fotoInputBlock");
    const res = document.getElementById("fotoResumen");
    const img = document.getElementById("fotoPreview");
    const texto = document.getElementById("fotoEstadoTexto");
    if (!block || !res || !img || !texto) return;

    if (!b64) {
      fotoPreviewUrl = null;
      fotoOrigenTexto = "";
      block.hidden = false;
      res.setAttribute("hidden", "");
      setVistaPreviaSrc(img, null);
      texto.textContent = "";
      return;
    }

    block.hidden = true;
    res.removeAttribute("hidden");
    const dataUrl = fotoPreviewUrl || "data:image/jpeg;base64," + b64;
    setVistaPreviaSrc(img, dataUrl);
    texto.textContent = "Foto lista · " + (fotoOrigenTexto || "imagen cargada");
  }

  function limpiarFoto() {
    document.getElementById("imagenBase64").value = "";
    const fi = document.getElementById("fotoFile");
    if (fi) fi.value = "";
    fotoPreviewUrl = null;
    fotoOrigenTexto = "";
    actualizarUIFoto();
  }

  function setCapturaVisible(visible) {
    const btnFoto = document.getElementById("btnFoto");
    if (btnFoto) btnFoto.hidden = !visible;
  }

  document.getElementById("btnCambiarFoto").addEventListener("click", () => {
    limpiarFoto();
    flash("Elija un archivo o use la cámara de nuevo.", true);
  });

  const btnGeo = document.getElementById("btnGeo");
  const textoBtnGeo = btnGeo ? btnGeo.textContent : "Obtener ubicación actual";
  btnGeo.addEventListener("click", () => {
    if (!navigator.geolocation) return flash("Geolocalización no disponible", false);
    btnGeo.textContent = "Cargando...";
    btnGeo.disabled = true;
    const restaurarBotonGeo = () => {
      btnGeo.textContent = textoBtnGeo;
      btnGeo.disabled = false;
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById("lat").value = pos.coords.latitude.toFixed(6);
        document.getElementById("lon").value = pos.coords.longitude.toFixed(6);
        flash("Ubicación obtenida.", true);
        restaurarBotonGeo();
      },
      () => {
        flash("No se pudo obtener la ubicación.", false);
        restaurarBotonGeo();
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  /** Instancia de webcam-easy (script global en encuesta.html). */
  let webcamEasy = null;
  let webcamEncendida = false;

  function asegurarWebcamEasy() {
    const WebcamCls = typeof window !== "undefined" ? window.Webcam : null;
    if (!WebcamCls) return null;
    if (!webcamEasy) {
      const video = document.getElementById("webcam");
      const canvas = document.getElementById("fotoCanvas");
      webcamEasy = new WebcamCls(video, "user", canvas, null);
    }
    return webcamEasy;
  }

  function cerrarWebcamUI() {
    const cam = webcamEasy;
    const video = document.getElementById("webcam");
    const wrap = document.getElementById("webcamContainer");
    const btnCam = document.getElementById("btnCam");
    if (cam) cam.stop();
    webcamEncendida = false;
    setCapturaVisible(false);
    if (wrap) wrap.hidden = true;
    if (video) video.srcObject = null;
    if (btnCam) {
      btnCam.hidden = false;
      btnCam.textContent = "Iniciar webcam";
    }
  }

  document.getElementById("btnCam").addEventListener("click", () => {
    const btnCam = document.getElementById("btnCam");
    const wrap = document.getElementById("webcamContainer");

    if (webcamEncendida) {
      cerrarWebcamUI();
      flash("Cámara cerrada.", true);
      return;
    }

    const cam = asegurarWebcamEasy();
    if (!cam) {
      flash("No se pudo cargar el control de la cámara.", false);
      return;
    }
    cam
      .start()
      .then(() => {
        webcamEncendida = true;
        if (wrap) wrap.hidden = false;
        btnCam.hidden = false;
        btnCam.textContent = "Cerrar cámara";
        setCapturaVisible(true);
        flash("Cámara activa. Pulse «Capturar foto» cuando esté listo.", true);
      })
      .catch(() => {
        setCapturaVisible(false);
        flash("No se pudo abrir la webcam.", false);
      });
  });

  document.getElementById("fotoFile").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const data = String(r.result);
      fotoPreviewUrl = data;
      fotoOrigenTexto = f.name || "Archivo seleccionado";
      document.getElementById("imagenBase64").value = base64DesdeDataUrl(data);
      actualizarUIFoto();
      flash("Imagen cargada desde archivo.", true);
    };
    r.readAsDataURL(f);
  });

  document.getElementById("btnFoto").addEventListener("click", () => {
    const video = document.getElementById("webcam");
    const cam = webcamEasy;
    if (!cam || !video.videoWidth) {
      flash("Inicie la webcam o elija un archivo.", false);
      return;
    }
    try {
      cam.snap();
      const canvas = document.getElementById("fotoCanvas");
      const jpeg = canvas.toDataURL("image/jpeg", 0.85);
      const b64 = base64DesdeDataUrl(jpeg);
      document.getElementById("imagenBase64").value = b64;
      fotoPreviewUrl = jpeg;
      fotoOrigenTexto = "Cámara web";
      actualizarUIFoto();
      cerrarWebcamUI();
      flash("Foto capturada.", true);
    } catch {
      flash("No se pudo capturar. Intente de nuevo.", false);
    }
  });

  document.getElementById("formEncuesta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = leerFormulario();
    const err = validar(p);
    if (err) return flash(err, false);
    try {
      await apiJson("/api/formularios", { method: "POST", body: p });
      flash("Enviado al servidor correctamente.", true);
      e.target.reset();
      limpiarFoto();
    } catch (ex) {
      flash(ex.message || "Error al enviar", false);
    }
  });

  document.getElementById("btnLocal").addEventListener("click", async () => {
    const p = leerFormulario();
    const err = validar(p);
    if (err) return flash(err, false);
    await guardarPendiente(p);
    flash("Guardado en cola local (IndexedDB).", true);
    document.getElementById("formEncuesta").reset();
    limpiarFoto();
    renderPendientes();
  });

  async function renderPendientes() {
    const ul = document.getElementById("pendientes");
    const items = await listarPendientes();
    ul.innerHTML = "";
    if (!items.length) {
      ul.innerHTML = '<li class="queue-empty">No hay borradores en cola.</li>';
      return;
    }
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "queue-item";
      const meta = document.createElement("span");
      meta.textContent = it.nombre + " · " + it.sector;
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Quitar";
      del.className = "secondary";
      del.onclick = async () => {
        await borrarPendiente(it.localId);
        renderPendientes();
      };
      li.appendChild(meta);
      li.appendChild(del);
      ul.appendChild(li);
    }
  }

  document.getElementById("btnSyncWs").addEventListener("click", () => {
    const token = tokenActual();
    if (!token) return flash("Sin token. Inicie sesión.", false);
    listarPendientes().then((items) => {
      if (!items.length) return flash("No hay pendientes.", false);
      const payload = items.map(({ localId, creadoLocal, ...rest }) => rest);
      const worker = new Worker("/js/sync-worker.js", { type: "module" });
      worker.onmessage = async (ev) => {
        worker.terminate();
        const d = ev.data;
        if (!d.ok) return flash("Fallo WebSocket: " + (d.error || "red"), false);
        let r;
        try {
          r = JSON.parse(d.raw);
        } catch {
          return flash("Respuesta WS inesperada: " + d.raw, false);
        }
        if (r.error) return flash(String(r.error), false);
        const fallidos = new Set((r.errores || []).map((e) => e.indice));
        for (let i = 0; i < items.length; i++) {
          if (!fallidos.has(i)) await borrarPendiente(items[i].localId);
        }
        if (r.errores?.length) flash("Algunos ítems fallaron: " + JSON.stringify(r.errores), false);
        else flash("Cola sincronizada por WebSocket.", true);
        renderPendientes();
      };
      worker.postMessage({
        wsUrl: wsSyncUrl(),
        token,
        items: payload,
      });
    });
  });

  setCapturaVisible(false);
  renderPendientes();
  actualizarUIFoto();
}
