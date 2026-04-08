import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";
import { initSessionHeader } from "./nav-session.js";

const msg = document.getElementById("msg");

const NIVEL_LABEL = {
  BASICO: "Básico",
  MEDIO: "Medio",
  GRADO_UNIVERSITARIO: "Grado universitario",
  POSTGRADO: "Postgrado",
  DOCTORADO: "Doctorado",
};

if (!tokenActual()) {
  window.location.href = "/login.html";
} else {
  (async () => {
    await initSessionHeader();
    const map = L.map("map").setView([19.4511, -70.7013], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);

    try {
      const data = await apiJson("/api/formularios");
      const list = data.formularios || [];
      const bounds = [];
      for (const f of list) {
        const lat = f.latitud;
        const lon = f.longitud;
        if (typeof lat !== "number" || typeof lon !== "number") continue;
        bounds.push([lat, lon]);
        const marker = L.marker([lat, lon]).addTo(layer);
        marker.bindPopup(popupResumenCargando(f), {
          maxWidth: 360,
          minWidth: 260,
          className: "map-popup-outer",
        });
        marker.on("popupopen", () => cargarDetallePopup(marker, f));
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      if (!list.length) msg.innerHTML = '<div class="msg neutral">No hay formularios para mostrar con este usuario.</div>';
    } catch (e) {
      msg.innerHTML = '<div class="msg err">' + escapeHtml(e.message || "Error al cargar") + "</div>";
    }
  })();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function popupResumenCargando(f) {
  const nombre = escapeHtml(String(f.nombre || "Sin nombre"));
  const sector = f.sector ? '<p class="map-popup__meta">' + escapeHtml(String(f.sector)) + "</p>" : "";
  return (
    '<article class="map-popup">' +
    "<h3 class=\"map-popup__title\">" +
    nombre +
    "</h3>" +
    sector +
    '<p class="map-popup__loading">Cargando detalle…</p>' +
    "</article>"
  );
}

function imagenDataUrl(imagenBase64) {
  if (imagenBase64 == null || typeof imagenBase64 !== "string") return null;
  const t = imagenBase64.trim();
  if (!t) return null;
  if (t.startsWith("data:")) {
    return t.startsWith("data:image/") ? t : null;
  }
  return "data:image/jpeg;base64," + t.replace(/\s/g, "");
}

function etiquetaNivel(codigo) {
  if (codigo == null || codigo === "") return "—";
  const k = String(codigo).trim();
  return NIVEL_LABEL[k] || k;
}

function formatoFecha(iso) {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escapeHtml(String(iso));
    return escapeHtml(
      d.toLocaleString("es-DO", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    );
  } catch {
    return escapeHtml(String(iso));
  }
}

function buildDetailPopupHtml(form) {
  const nombre = escapeHtml(String(form.nombre || "—"));
  const sector = escapeHtml(String(form.sector || "—"));
  const nivel = escapeHtml(etiquetaNivel(form.nivelEscolar));
  const lat = form.latitud;
  const lon = form.longitud;
  const coordsText =
    typeof lat === "number" && typeof lon === "number"
      ? escapeHtml(lat.toFixed(6) + ", " + lon.toFixed(6))
      : "—";
  const encuestador = escapeHtml(String(form.usuarioRegistroUsername || "—"));
  const creado = formatoFecha(form.creadoEn);
  const src = imagenDataUrl(form.imagenBase64);
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

async function cargarDetallePopup(marker, f) {
  const id = f.id;
  if (id == null || id === "") return;
  const popup = marker.getPopup();
  if (!popup) return;

  if (marker._detalleListo === true && marker._detalleHtml) {
    popup.setContent(marker._detalleHtml);
    return;
  }
  if (marker._detalleCargando) return;
  marker._detalleCargando = true;
  popup.setContent(popupResumenCargando(f));

  try {
    const data = await apiJson("/api/formularios/" + encodeURIComponent(String(id)));
    const html = buildDetailPopupHtml(data.formulario || {});
    marker._detalleHtml = html;
    marker._detalleListo = true;
    if (marker.isPopupOpen && marker.isPopupOpen()) popup.setContent(html);
  } catch (e) {
    const err =
      '<article class="map-popup map-popup--err"><p>' +
      escapeHtml(e.message || "No se pudo cargar el detalle.") +
      "</p></article>";
    marker._detalleHtml = err;
    marker._detalleListo = true;
    if (marker.isPopupOpen && marker.isPopupOpen()) popup.setContent(err);
  } finally {
    marker._detalleCargando = false;
  }
}
