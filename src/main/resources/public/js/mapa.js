import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";
import { initSessionHeader } from "./nav-session.js";

const msg = document.getElementById("msg");

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
        L.marker([lat, lon])
          .bindPopup("<strong>" + escapeHtml(String(f.nombre || "")) + "</strong><br/>" + escapeHtml(String(f.sector || "")))
          .addTo(layer);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      if (!list.length) msg.innerHTML = '<div class="msg neutral">No hay formularios para mostrar con este usuario.</div>';
    } catch (e) {
      msg.innerHTML = '<div class="msg err">' + escapeHtml(e.message || "Error al cargar") + "</div>";
    }
  })();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
