import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";
import { initSessionHeader } from "./nav-session.js";
import { guardarPendiente, listarPendientes, borrarPendiente, actualizarPendiente } from "./colas-local.js";
import { esFalloDeRed } from "./red-utils.js";
import { sincronizarColaRest } from "./sincronizar-cola.js";

if (!tokenActual()) {
  window.location.href = "/login.html";
} else {
  (async () => {
    await initSessionHeader();
    initEncuesta();
  })();
}

function initEncuesta() {
  /** Si no es null, el formulario actualiza este borrador en cola al guardar local. */
  let editingLocalId = null;

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
    // JSON.stringify convierte NaN/Infinity en null; el servidor no puede mapear null a double.
    if (!Number.isFinite(p.latitud) || !Number.isFinite(p.longitud)) return "Coordenadas inválidas.";
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

  function setBannerEdicion() {
    const b = document.getElementById("bannerEdicion");
    const t = document.getElementById("bannerEdicionTexto");
    const btn = document.getElementById("btnCancelarEdicion");
    if (!b || !t) return;
    if (editingLocalId == null) {
      t.textContent = "";
      b.hidden = true;
      if (btn) btn.hidden = true;
      return;
    }
    b.hidden = false;
    if (btn) btn.hidden = false;
    t.textContent =
      "Editando borrador #" +
      editingLocalId;
  }

  function cancelarEdicionBorrador() {
    editingLocalId = null;
    document.getElementById("formEncuesta").reset();
    document.getElementById("lat").value = "";
    document.getElementById("lon").value = "";
    limpiarFoto();
    setBannerEdicion();
    renderPendientes();
    flash("Edición cancelada.", true);
  }

  document.getElementById("btnCancelarEdicion").addEventListener("click", () => {
    cancelarEdicionBorrador();
  });

  function cargarBorradorEnFormulario(it) {
    document.querySelector('[name="nombre"]').value = it.nombre || "";
    document.querySelector('[name="sector"]').value = it.sector || "";
    document.querySelector('[name="nivelEscolar"]').value = it.nivelEscolar || "";
    document.getElementById("lat").value = it.latitud != null ? String(it.latitud) : "";
    document.getElementById("lon").value = it.longitud != null ? String(it.longitud) : "";
    const b64 = (it.imagenBase64 || "").replace(/\s/g, "");
    document.getElementById("imagenBase64").value = b64;
    fotoPreviewUrl = b64 ? "data:image/jpeg;base64," + b64 : null;
    fotoOrigenTexto = "Borrador local";
    actualizarUIFoto();
    editingLocalId = it.localId;
    setBannerEdicion();
    renderPendientes();
    flash("Borrador cargado", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
    const form = e.target;
    const btnEnviar = form.querySelector('button[type="submit"]');
    const textoEnviar = btnEnviar ? btnEnviar.textContent : "";
    if (btnEnviar) {
      btnEnviar.disabled = true;
      btnEnviar.textContent = "Cargando...";
    }
    form.setAttribute("aria-busy", "true");
    try {
      await apiJson("/api/formularios", { method: "POST", body: p });
      if (editingLocalId != null) {
        await borrarPendiente(editingLocalId);
      }
      editingLocalId = null;
      setBannerEdicion();
      flash("Enviado al servidor correctamente.", true);
      form.reset();
      limpiarFoto();
      renderPendientes();
    } catch (ex) {
      if (esFalloDeRed(ex)) {
        try {
          if (editingLocalId != null) {
            await actualizarPendiente(editingLocalId, p);
          } else {
            await guardarPendiente(p);
          }
          editingLocalId = null;
          setBannerEdicion();
          flash(
            "Se guardó en la cola local porque no hay conexión con el servidor. Podrá sincronizarla cuando vuelva la red.",
            true
          );
          form.reset();
          limpiarFoto();
          await renderPendientes();
        } catch (idbErr) {
          flash(idbErr instanceof Error ? idbErr.message : String(idbErr), false);
        }
      } else {
        flash(ex instanceof Error ? ex.message : String(ex), false);
      }
    } finally {
      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.textContent = textoEnviar;
      }
      form.removeAttribute("aria-busy");
    }
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
      li.className = "queue-item" + (editingLocalId === it.localId ? " queue-item--editando" : "");
      const meta = document.createElement("span");
      meta.textContent = it.nombre + " · " + it.sector;
      const actions = document.createElement("div");
      actions.className = "queue-item__actions";
      const ed = document.createElement("button");
      ed.type = "button";
      ed.textContent = "Editar";
      ed.className = "secondary";
      ed.onclick = () => cargarBorradorEnFormulario(it);
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Quitar";
      del.className = "secondary";
      del.onclick = async () => {
        if (editingLocalId === it.localId) {
          editingLocalId = null;
          document.getElementById("formEncuesta").reset();
          document.getElementById("lat").value = "";
          document.getElementById("lon").value = "";
          limpiarFoto();
          setBannerEdicion();
        }
        await borrarPendiente(it.localId);
        renderPendientes();
        flash("Borrador quitado de la cola.", true);
      };
      actions.appendChild(ed);
      actions.appendChild(del);
      li.appendChild(meta);
      li.appendChild(actions);
      ul.appendChild(li);
    }
  }

  document.getElementById("btnSyncWs").addEventListener("click", async () => {
    if (!tokenActual()) return flash("Sin token. Inicie sesión.", false);
    const btn = document.getElementById("btnSyncWs");
    const texto = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sincronizando...";
    }
    try {
      const r = await sincronizarColaRest();
      if (r.sinPendientes) {
        flash("No hay pendientes.", false);
      } else if (r.errores.length) {
        flash(
          "Algunos borradores no se pudieron subir: " + r.errores.map((e) => e.mensaje).join("; "),
          false
        );
      } else {
        flash("Cola sincronizada (" + r.enviados + " enviados).", true);
      }
      await renderPendientes();
      if (editingLocalId != null) {
        const siguen = await listarPendientes();
        if (!siguen.some((x) => x.localId === editingLocalId)) {
          editingLocalId = null;
          setBannerEdicion();
        }
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = texto || "Sincronizar cola";
      }
    }
  });

  setCapturaVisible(false);
  setBannerEdicion();
  renderPendientes();
  actualizarUIFoto();
}
