const TOKEN_KEY = "encuesta_jwt";
const TOKEN_BACKUP = "encuesta_jwt_backup";

export function guardarToken(jwt) {
  if (!jwt) return;
  sessionStorage.setItem(TOKEN_KEY, jwt);
  try {
    localStorage.setItem(TOKEN_BACKUP, jwt);
  } catch (_) {}
}

export function tokenActual() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_BACKUP) || "";
}

export function cerrarSesion() {
  sessionStorage.removeItem(TOKEN_KEY);
  try {
    localStorage.removeItem(TOKEN_BACKUP);
  } catch (_) {}
}

export function requiereAuth() {
  if (!tokenActual()) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}
