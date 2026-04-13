import { listarPendientes, borrarPendiente } from "./colas-local.js";
import { tokenActual } from "./auth.js";
import { apiJson } from "./api.js";

/**
 * @returns {{ enviados: number, errores: { localId: number, mensaje: string }[], sinPendientes: boolean }}
 */
export async function sincronizarColaRest() {
  const items = await listarPendientes();
  if (!items.length) {
    return { enviados: 0, errores: [], sinPendientes: true };
  }
  let enviados = 0;
  /** @type {{ localId: number, mensaje: string }[]} */
  const errores = [];
  for (const it of items) {
    try {
      await apiJson("/api/formularios", {
        method: "POST",
        body: {
          nombre: it.nombre,
          sector: it.sector,
          nivelEscolar: it.nivelEscolar,
          latitud: it.latitud,
          longitud: it.longitud,
          imagenBase64: it.imagenBase64,
        },
      });
      await borrarPendiente(it.localId);
      enviados++;
    } catch (e) {
      errores.push({
        localId: it.localId,
        mensaje: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { enviados, errores, sinPendientes: false };
}

export function urlWebSocketSync() {
  const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof location !== "undefined" ? location.host : "";
  return proto + "//" + host + "/ws/sync";
}

export async function sincronizarColaWebSocket() {
  const items = await listarPendientes();
  if (!items.length) {
    return { enviados: 0, errores: [], sinPendientes: true };
  }
  const token = tokenActual();
  if (!token) {
    return {
      enviados: 0,
      errores: items.map((it) => ({ localId: it.localId, mensaje: "Sin sesión (token)." })),
      sinPendientes: false,
    };
  }

  const payload = items.map((it) => ({
    nombre: it.nombre,
    sector: it.sector,
    nivelEscolar: it.nivelEscolar,
    latitud: it.latitud,
    longitud: it.longitud,
    imagenBase64: it.imagenBase64,
  }));

  const worker = new Worker(new URL("./sync-worker.js", import.meta.url), { type: "classic" });

  return new Promise((resolve) => {
    worker.onmessage = async (ev) => {
      worker.terminate();
      const { ok, raw, error } = ev.data || {};
      if (!ok) {
        resolve({
          enviados: 0,
          errores: items.map((it) => ({
            localId: it.localId,
            mensaje: typeof error === "string" ? error : "Error de WebSocket",
          })),
          sinPendientes: false,
        });
        return;
      }
      try {
        const data = JSON.parse(/** @type {string} */ (raw));
        if (data.error) {
          resolve({
            enviados: 0,
            errores: items.map((it) => ({
              localId: it.localId,
              mensaje: String(data.error),
            })),
            sinPendientes: false,
          });
          return;
        }
        const fallos = /** @type {{ indice: number, mensaje: string }[]} */ (data.errores || []);
        const falloPorIndice = new Map(fallos.map((f) => [f.indice, f.mensaje]));
        let enviados = 0;
        /** @type {{ localId: number, mensaje: string }[]} */
        const errores = [];
        for (const f of fallos) {
          const it = items[f.indice];
          if (it) errores.push({ localId: it.localId, mensaje: f.mensaje || "Error" });
        }
        for (let i = 0; i < items.length; i++) {
          if (falloPorIndice.has(i)) continue;
          await borrarPendiente(items[i].localId);
          enviados++;
        }
        resolve({ enviados, errores, sinPendientes: false });
      } catch (parseErr) {
        resolve({
          enviados: 0,
          errores: items.map((it) => ({
            localId: it.localId,
            mensaje: parseErr instanceof Error ? parseErr.message : String(parseErr),
          })),
          sinPendientes: false,
        });
      }
    };
    worker.onerror = () => {
      worker.terminate();
      resolve({
        enviados: 0,
        errores: items.map((it) => ({ localId: it.localId, mensaje: "Error del Web Worker" })),
        sinPendientes: false,
      });
    };
    worker.postMessage({ wsUrl: urlWebSocketSync(), token, items: payload });
  });
}
