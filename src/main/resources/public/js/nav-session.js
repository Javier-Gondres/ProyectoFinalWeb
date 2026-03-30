import { tokenActual, cerrarSesion } from "./auth.js";
import { apiJson } from "./api.js";

const ROL_LABEL = {
  ADMIN: "Administrador",
  ENCUESTADOR: "Encuestador",
};

/** Lee claims username/rol del JWT (solo visualización; la API sigue validando). */
function readJwtClaims(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const json = atob(b64);
    const o = JSON.parse(json);
    const username = o.username;
    const rol = o.rol;
    if (username == null || rol == null) return null;
    return { username: String(username), rol: String(rol) };
  } catch {
    return null;
  }
}

function ensureSepBetweenNameAndRol() {
  const slot = document.getElementById("sessionSlot");
  const nameEl = document.getElementById("sessionUserName");
  const rolEl = document.getElementById("sessionUserRol");
  if (!slot || !nameEl || !rolEl || slot.querySelector(".session-slot__sep")) return;
  const sep = document.createElement("span");
  sep.className = "session-slot__sep";
  sep.setAttribute("aria-hidden", "true");
  sep.textContent = "·";
  nameEl.after(sep);
}

function aplicarUsuarioRol(nameEl, rolEl, username, rol) {
  const rolTxt = ROL_LABEL[rol] || rol || "";
  nameEl.textContent = username || "";
  rolEl.textContent = rolTxt;
}

function ocultarSlot(slot, nameEl, rolEl) {
  slot.setAttribute("hidden", "");
  nameEl.textContent = "";
  rolEl.textContent = "";
}

/**
 * Si hay JWT: oculta #navLogin, muestra nombre y rol en #sessionSlot, añade «Salir».
 * Relleno inmediato desde el token; luego se confirma con /api/auth/me.
 */
export async function initSessionHeader() {
  const token = tokenActual();
  const navLogin = document.getElementById("navLogin");
  const navAdmin = document.getElementById("navAdmin");
  const slot = document.getElementById("sessionSlot");
  const nameEl = document.getElementById("sessionUserName");
  const rolEl = document.getElementById("sessionUserRol");

  if (!slot || !nameEl || !rolEl) return;

  /** Solo visible con sesión válida y rol ADMIN (la API sigue validando). */
  const setNavAdminVisible = (rol) => {
    if (!navAdmin) return;
    if (token && rol === "ADMIN") navAdmin.removeAttribute("hidden");
    else navAdmin.setAttribute("hidden", "");
  };

  if (navAdmin) navAdmin.setAttribute("hidden", "");

  if (!token) {
    ocultarSlot(slot, nameEl, rolEl);
    return;
  }

  if (navLogin) navLogin.remove();

  const nav = document.querySelector(".site-header .nav-links");
  if (nav && !document.getElementById("navSalir")) {
    const salir = document.createElement("a");
    salir.id = "navSalir";
    salir.className = "nav-link";
    salir.href = "#";
    salir.textContent = "Salir";
    salir.addEventListener("click", (e) => {
      e.preventDefault();
      cerrarSesion();
      location.href = "/";
    });
    nav.appendChild(salir);
  }

  const claims = readJwtClaims(token);
  if (claims) {
    aplicarUsuarioRol(nameEl, rolEl, claims.username, claims.rol);
    ensureSepBetweenNameAndRol();
    slot.removeAttribute("hidden");
    setNavAdminVisible(claims.rol);
  }

  try {
    const data = await apiJson("/api/auth/me");
    const u = data.usuario;
    aplicarUsuarioRol(nameEl, rolEl, u.username, u.rol);
    ensureSepBetweenNameAndRol();
    slot.removeAttribute("hidden");
    setNavAdminVisible(u.rol);
  } catch (e) {
    if (!claims || e.status === 401) {
      ocultarSlot(slot, nameEl, rolEl);
      setNavAdminVisible(null);
    } else {
      setNavAdminVisible(claims.rol);
    }
  }
}
