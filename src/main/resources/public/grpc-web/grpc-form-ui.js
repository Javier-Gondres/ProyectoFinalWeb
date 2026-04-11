/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

/**
 * @param {string} dataUrl
 */
export function base64DesdeDataUrl(dataUrl) {
  const s = String(dataUrl);
  const mark = "base64,";
  const i = s.indexOf(mark);
  if (i >= 0) return s.slice(i + mark.length).replace(/\s/g, "");
  const c = s.indexOf(",");
  return c >= 0 ? s.slice(c + 1).replace(/\s/g, "") : "";
}

/**
 * @param {HTMLImageElement} img
 * @param {string | null} url
 */
function setVistaPreviaSrc(img, url) {
  if (!url) {
    img.removeAttribute("src");
    return;
  }
  img.src = url;
}

/**
 * @param {(text: string, ok: boolean) => void} flash
 */
export function initGrpcFormularioEncuestaLike(flash) {
  /** @type {string | null} */
  let fotoPreviewUrl = null;
  let fotoOrigenTexto = "";

  const hiddenB64 = /** @type {HTMLInputElement | null} */ ($("grpcImagenBase64"));
  const block = $("grpcFotoInputBlock");
  const res = $("grpcFotoResumen");
  const img = /** @type {HTMLImageElement | null} */ ($("grpcFotoPreview"));
  const texto = $("grpcFotoEstadoTexto");

  function actualizarUIFoto() {
    const raw = hiddenB64?.value || "";
    const b64 = raw.replace(/\s/g, "");
    if (!block || !res || !img || !texto || !hiddenB64) return;

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
    if (hiddenB64) hiddenB64.value = "";
    const fi = /** @type {HTMLInputElement | null} */ ($("grpcFotoFile"));
    if (fi) fi.value = "";
    fotoPreviewUrl = null;
    fotoOrigenTexto = "";
    actualizarUIFoto();
  }

  /**
   * Carga un borrador desde IndexedDB
   * @param {string} b64Raw base64 sin prefijo data:
   */
  function cargarBorradorFoto(b64Raw) {
    const b64 = String(b64Raw || "").replace(/\s/g, "");
    if (!hiddenB64) return;
    hiddenB64.value = b64;
    fotoPreviewUrl = b64 ? "data:image/jpeg;base64," + b64 : null;
    fotoOrigenTexto = "Borrador local";
    const fi = /** @type {HTMLInputElement | null} */ ($("grpcFotoFile"));
    if (fi) fi.value = "";
    actualizarUIFoto();
  }

  function setCapturaVisible(visible) {
    const btnFoto = $("grpcBtnFoto");
    if (btnFoto) btnFoto.hidden = !visible;
  }

  $("grpcBtnCambiarFoto")?.addEventListener("click", () => {
    limpiarFoto();
    flash("Elija un archivo o use la cámara de nuevo.", true);
  });

  const btnGeo = $("grpcBtnGeo");
  const textoBtnGeo = btnGeo ? btnGeo.textContent : "";
  btnGeo?.addEventListener("click", () => {
    if (!navigator.geolocation) return flash("Geolocalización no disponible", false);
    btnGeo.textContent = "Cargando...";
    btnGeo.disabled = true;
    const restaurar = () => {
      btnGeo.textContent = textoBtnGeo || "Obtener ubicación actual";
      btnGeo.disabled = false;
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
        const lon = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
        if (lat) lat.value = pos.coords.latitude.toFixed(6);
        if (lon) lon.value = pos.coords.longitude.toFixed(6);
        flash("Ubicación obtenida.", true);
        restaurar();
      },
      () => {
        flash("No se pudo obtener la ubicación.", false);
        restaurar();
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  /** @type {unknown} */
  let webcamEasy = null;
  let webcamEncendida = false;

  function asegurarWebcamEasy() {
    const WebcamCls = typeof window !== "undefined" ? /** @type {unknown} */ (window).Webcam : null;
    if (typeof WebcamCls !== "function") return null;
    if (!webcamEasy) {
      const video = $("grpcWebcam");
      const canvas = $("grpcFotoCanvas");
      if (!video || !canvas) return null;
      webcamEasy = new WebcamCls(video, "user", canvas, null);
    }
    return webcamEasy;
  }

  function cerrarWebcamUI() {
    const cam = webcamEasy;
    const video = /** @type {HTMLVideoElement | null} */ ($("grpcWebcam"));
    const wrap = $("grpcWebcamContainer");
    const btnCam = $("grpcBtnCam");
    if (cam && typeof cam === "object" && "stop" in cam && typeof /** @type {{ stop?: () => void }} */ (cam).stop === "function") {
      /** @type {{ stop: () => void }} */ (cam).stop();
    }
    webcamEncendida = false;
    setCapturaVisible(false);
    if (wrap) wrap.hidden = true;
    if (video) video.srcObject = null;
    if (btnCam) {
      btnCam.hidden = false;
      btnCam.textContent = "Iniciar webcam";
    }
  }

  $("grpcBtnCam")?.addEventListener("click", () => {
    const btnCam = $("grpcBtnCam");
    const wrap = $("grpcWebcamContainer");

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
        if (btnCam) {
          btnCam.hidden = false;
          btnCam.textContent = "Cerrar cámara";
        }
        setCapturaVisible(true);
        flash("Cámara activa. Pulse «Capturar foto» cuando esté listo.", true);
      })
      .catch(() => {
        setCapturaVisible(false);
        flash("No se pudo abrir la webcam.", false);
      });
  });

  $("grpcFotoFile")?.addEventListener("change", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const f = t.files?.[0];
    if (!f || !hiddenB64) return;
    const r = new FileReader();
    r.onload = () => {
      const data = String(r.result);
      fotoPreviewUrl = data;
      fotoOrigenTexto = f.name || "Archivo seleccionado";
      hiddenB64.value = base64DesdeDataUrl(data);
      actualizarUIFoto();
      flash("Imagen cargada desde archivo.", true);
    };
    r.readAsDataURL(f);
  });

  $("grpcBtnFoto")?.addEventListener("click", () => {
    const video = /** @type {HTMLVideoElement | null} */ ($("grpcWebcam"));
    const cam = webcamEasy;
    if (!cam || !video?.videoWidth || !hiddenB64) {
      flash("Inicie la webcam o elija un archivo.", false);
      return;
    }
    try {
      if (cam && typeof cam === "object" && "snap" in cam && typeof /** @type {{ snap?: () => void }} */ (cam).snap === "function") {
        /** @type {{ snap: () => void }} */ (cam).snap();
      }
      const canvas = /** @type {HTMLCanvasElement | null} */ ($("grpcFotoCanvas"));
      if (!canvas) return;
      const jpeg = canvas.toDataURL("image/jpeg", 0.85);
      const b64 = base64DesdeDataUrl(jpeg);
      hiddenB64.value = b64;
      fotoPreviewUrl = jpeg;
      fotoOrigenTexto = "Cámara web";
      actualizarUIFoto();
      cerrarWebcamUI();
      flash("Foto capturada.", true);
    } catch {
      flash("No se pudo capturar. Intente de nuevo.", false);
    }
  });

  setCapturaVisible(false);
  actualizarUIFoto();

  return { limpiarFoto, actualizarUIFoto, cargarBorradorFoto };
}
