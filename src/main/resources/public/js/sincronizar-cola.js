import { apiJson } from "./api.js";
import { listarPendientes, borrarPendiente } from "./colas-local.js";

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
