import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";
import { initSessionHeader } from "./nav-session.js";

const ROL_LABEL = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  ENCUESTADOR: "Encuestador",
};

/** Roles que un SUPER_ADMIN puede asignar a otros (no incluye SUPER_ADMIN; el backend tampoco lo permite). */
const ROLES_ASIGNABLES_SUPER = ["ADMIN", "ENCUESTADOR"];
function flash(text, ok) {
  const msg = document.getElementById("msg");
  if (!msg) return;
  msg.innerHTML = '<div class="msg ' + (ok ? "ok" : "err") + '">' + text + "</div>";
}

function renderTabla(usuarios, rolActor, idActor) {
  const tbody = document.getElementById("tbodyUsuarios");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const u of usuarios) {
    const esMiFila = idActor && u.id === idActor;
    const soloLectura =
      rolActor !== "SUPER_ADMIN" ||
      esMiFila ||
      u.rol === "SUPER_ADMIN";

    const tr = document.createElement("tr");
    const tdUser = document.createElement("td");
    tdUser.textContent = u.username || "";
    const tdNombre = document.createElement("td");
    tdNombre.textContent = u.nombre || "";
    const tdRol = document.createElement("td");

    if (soloLectura) {
      const span = document.createElement("span");
      span.textContent = ROL_LABEL[u.rol] || u.rol || "";
      span.setAttribute("aria-label", "Rol de " + (u.username || "") + " (solo lectura)");
      tdRol.appendChild(span);
    } else {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", "Rol de " + (u.username || ""));
      for (const r of ROLES_ASIGNABLES_SUPER) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = ROL_LABEL[r] || r;
        if (r === u.rol) opt.selected = true;
        sel.appendChild(opt);
      }
      tdRol.appendChild(sel);
    }

    const tdBtn = document.createElement("td");
    tdBtn.className = "btn-cell";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = soloLectura ? "—" : "Guardar";
    btn.className = "secondary";
    btn.disabled = soloLectura;
    if (!soloLectura) {
      const sel = tdRol.querySelector("select");
      btn.addEventListener("click", async () => {
        const rol = sel.value;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await apiJson("/api/admin/usuarios/" + encodeURIComponent(u.id), {
            method: "PATCH",
            body: { rol },
          });
          flash("Rol actualizado para «" + u.username + "».", true);
          if (rol !== u.rol) {
            u.rol = rol;
          }
        } catch (e) {
          flash(e.message || "No se pudo guardar", false);
        } finally {
          btn.disabled = false;
          btn.textContent = "Guardar";
        }
      });
    }
    tdBtn.appendChild(btn);
    tr.appendChild(tdUser);
    tr.appendChild(tdNombre);
    tr.appendChild(tdRol);
    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  }
}

async function main() {
  if (!tokenActual()) {
    window.location.href = "/login.html";
    return;
  }
  await initSessionHeader();
  let rolActor = null;
  let idActor = null;
  try {
    const me = await apiJson("/api/auth/me");
    const u = me.usuario;
    rolActor = u && u.rol ? String(u.rol) : null;
    idActor = u && u.id != null ? String(u.id) : null;
  } catch {
    window.location.href = "/login.html";
    return;
  }
  try {
    const data = await apiJson("/api/admin/usuarios");
    renderTabla(data.usuarios || [], rolActor, idActor);
  } catch (e) {
    if (e.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (e.status === 403) {
      flash("Se requiere rol de administrador. Si acaba de promover su cuenta, cierre sesión y vuelva a entrar.", false);
      return;
    }
    flash(e.message || "Error al cargar usuarios", false);
  }
}

main();
