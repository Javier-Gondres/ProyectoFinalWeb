import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";
import { initSessionHeader } from "./nav-session.js";
import { guardarPendiente, listarPendientes, borrarPendiente, actualizarPendiente } from "./colas-local.js";
import { esFalloDeRed } from "./red-utils.js";
import { sincronizarColaWebSocket } from "./sincronizar-cola.js";

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
      const r = await sincronizarColaWebSocket();
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

  const NIVEL_LABEL = {
    BASICO: "Básico",
    MEDIO: "Medio",
    GRADO_UNIVERSITARIO: "Grado universitario",
    POSTGRADO: "Postgrado",
    DOCTORADO: "Doctorado",
  };

  function etiquetaNivelList(codigo) {
    if (codigo == null || codigo === "") return "—";
    const k = String(codigo).trim();
    return NIVEL_LABEL[/** @type {keyof typeof NIVEL_LABEL} */ (k)] || k;
  }

  function escapeHtmlRest(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {unknown} c
   */
  function creadoEnAMillis(c) {
    if (c == null) return null;
    if (typeof c === "number") return Number.isFinite(c) ? c : null;
    if (typeof c === "string") {
      const t = Date.parse(c);
      return Number.isNaN(t) ? null : t;
    }
    if (typeof c === "object" && c !== null && "$date" in /** @type {object} */ (c)) {
      const d = /** @type {{ $date: number | string }} */ (c).$date;
      if (typeof d === "number") return Number.isFinite(d) ? d : null;
      const t = Date.parse(String(d));
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }

  function fechaCortaMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return "—";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
  }

  function imagenDataUrlRest(imagenBase64) {
    if (imagenBase64 == null || typeof imagenBase64 !== "string") return null;
    const t = imagenBase64.trim();
    if (!t) return null;
    if (t.startsWith("data:")) {
      return t.startsWith("data:image/") ? t : null;
    }
    return "data:image/jpeg;base64," + t.replace(/\s/g, "");
  }

  function formatoFechaDetalleRest(iso) {
    if (iso == null || iso === "") return "—";
    try {
      const d = new Date(/** @type {string | number} */ (iso));
      if (Number.isNaN(d.getTime())) return escapeHtmlRest(String(iso));
      return escapeHtmlRest(
        d.toLocaleString("es-DO", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      );
    } catch {
      return escapeHtmlRest(String(iso));
    }
  }

  /**
   * @param {Record<string, unknown>} form
   */
  function buildDetailModalHtmlRest(form) {
    const nombre = escapeHtmlRest(String(form.nombre || "—"));
    const sector = escapeHtmlRest(String(form.sector || "—"));
    const nivel = escapeHtmlRest(etiquetaNivelList(form.nivelEscolar));
    const lat = form.latitud;
    const lon = form.longitud;
    const coordsText =
      typeof lat === "number" && typeof lon === "number"
        ? escapeHtmlRest(lat.toFixed(6) + ", " + lon.toFixed(6))
        : "—";
    const encuestador = escapeHtmlRest(String(form.usuarioRegistroUsername || "—"));
    const creado = formatoFechaDetalleRest(form.creadoEn);
    const src = imagenDataUrlRest(form.imagenBase64 != null ? String(form.imagenBase64) : "");
    const imgBlock = src
      ? '<div class="map-popup__img-wrap"><img class="map-popup__img" src="' + src + '" alt="" loading="lazy" /></div>'
      : '<p class="map-popup__muted">Sin imagen adjunta.</p>';

    return (
      '<article class="map-popup">' +
      '<h3 class="map-popup__title">' +
      nombre +
      "</h3>" +
      '<dl class="map-popup__dl">' +
      "<dt>Zona / sector</dt><dd>" +
      sector +
      "</dd>" +
      "<dt>Nivel escolar</dt><dd>" +
      nivel +
      "</dd>" +
      "<dt>Coordenadas</dt><dd>" +
      coordsText +
      "</dd>" +
      "<dt>Registrado por</dt><dd>" +
      encuestador +
      "</dd>" +
      "<dt>Fecha</dt><dd>" +
      creado +
      "</dd>" +
      "</dl>" +
      imgBlock +
      "</article>"
    );
  }

  const elListErr = document.getElementById("encRestListError");
  const elListBody = document.getElementById("encRestListBody");
  const elRestPag = document.getElementById("encRestPagination");
  const elRestPagInfo = document.getElementById("encRestPaginationInfo");
  const btnRestPrev = document.getElementById("encRestPrev");
  const btnRestNext = document.getElementById("encRestNext");
  const elBackdrop = document.getElementById("encRestModalBackdrop");
  const elModalBody = document.getElementById("encRestModalBody");

  const REST_PAGE_SIZE = 10;
  let restListPage = 1;

  function updateRestPaginationUi(total, page, totalPages) {
    if (!elRestPag || !elRestPagInfo || !btnRestPrev || !btnRestNext) return;
    if (total <= 0) {
      elRestPag.hidden = true;
      return;
    }
    elRestPag.hidden = false;
    const tp = Math.max(1, totalPages);
    const p = Math.min(Math.max(1, page), tp);
    elRestPagInfo.textContent =
      "Página " +
      p +
      " de " +
      tp +
      " · " +
      total +
      " formulario" +
      (total === 1 ? "" : "s");
    btnRestPrev.disabled = p <= 1;
    btnRestNext.disabled = p >= tp;
  }

  function showListErrorRest(msg) {
    if (!elListErr) return;
    elListErr.textContent = msg;
    elListErr.hidden = false;
  }

  function clearListErrorRest() {
    if (!elListErr) return;
    elListErr.textContent = "";
    elListErr.hidden = true;
  }

  function closeDetalleModalRest() {
    if (elBackdrop) elBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  function openDetalleModalRest() {
    if (elBackdrop) elBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  /**
   * @param {string} id
   */
  async function showDetalleFormularioRest(id) {
    if (!id || !elModalBody) return;
    openDetalleModalRest();
    elModalBody.innerHTML =
      '<article class="map-popup"><p class="map-popup__loading">Cargando detalle…</p></article>';
    try {
      const data = await apiJson("/api/formularios/" + encodeURIComponent(id));
      elModalBody.innerHTML = buildDetailModalHtmlRest(
        /** @type {Record<string, unknown>} */ (data.formulario || {})
      );
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : String(e);
      elModalBody.innerHTML =
        '<article class="map-popup map-popup--err"><p>' + escapeHtmlRest(msgErr) + "</p></article>";
    }
  }

  async function cargarListaRest(page) {
    const token = tokenActual();
    if (!token) {
      window.location.href = "/login.html";
      return;
    }
    clearListErrorRest();
    if (!elListBody) return;
    restListPage = page;
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(REST_PAGE_SIZE),
      });
      const data = await apiJson("/api/formularios?" + qs.toString());
      const total = Number(data.total ?? 0);
      const totalPages = Number(data.totalPages ?? 0);
      const curPage = Number(data.page ?? page);
      restListPage = curPage;
      const rows = /** @type {Record<string, unknown>[]} */ (data.formularios || []);
      elListBody.innerHTML = "";
      if (rows.length === 0) {
        elListBody.innerHTML =
          '<tr><td colspan="4" class="grpc-empty">No hay formularios visibles para su usuario.</td></tr>';
        updateRestPaginationUi(0, 1, 0);
        return;
      }
      for (const raw of rows) {
        const id = String(raw.id ?? "");
        const nombre = String(raw.nombre ?? "");
        const sector = String(raw.sector ?? "");
        const nivelRaw = String(raw.nivelEscolar ?? "").trim();
        const millis = creadoEnAMillis(raw.creadoEn);
        const tr = document.createElement("tr");
        tr.className = "grpc-row";
        tr.tabIndex = 0;
        tr.setAttribute("role", "button");
        tr.dataset.id = id;
        tr.innerHTML = `
          <td>${escapeHtmlRest(nombre)}</td>
          <td>${escapeHtmlRest(sector)}</td>
          <td>${escapeHtmlRest(etiquetaNivelList(nivelRaw))}</td>
          <td>${escapeHtmlRest(fechaCortaMs(millis))}</td>`;
        tr.addEventListener("click", () => showDetalleFormularioRest(id));
        tr.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            showDetalleFormularioRest(id);
          }
        });
        elListBody.appendChild(tr);
      }
      updateRestPaginationUi(total, curPage, totalPages);
    } catch (err) {
      showListErrorRest(err instanceof Error ? err.message : String(err));
    }
  }

  document.getElementById("btnListarRest")?.addEventListener("click", async () => {
    await cargarListaRest(1);
  });
  btnRestPrev?.addEventListener("click", async () => {
    if (restListPage <= 1) return;
    await cargarListaRest(restListPage - 1);
  });
  btnRestNext?.addEventListener("click", async () => {
    await cargarListaRest(restListPage + 1);
  });

  document.getElementById("encRestModalClose")?.addEventListener("click", closeDetalleModalRest);
  elBackdrop?.addEventListener("click", (e) => {
    if (e.target === elBackdrop) closeDetalleModalRest();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elBackdrop && !elBackdrop.hidden) closeDetalleModalRest();
  });

  setCapturaVisible(false);
  setBannerEdicion();
  renderPendientes();
  actualizarUIFoto();
}
