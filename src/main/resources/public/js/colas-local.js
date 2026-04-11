const DB = "encuesta_offline_v1";
const STORE = "pendientes";

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onerror = () => rej(r.error);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "localId", autoIncrement: true });
    r.onsuccess = () => res(r.result);
  });
}

/**
 * @param {{ nombre: string, sector: string, nivelEscolar: string, latitud: number, longitud: number, imagenBase64: string }} payload
 */
export async function guardarPendiente(payload) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...payload, creadoLocal: Date.now() });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function listarPendientes() {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).getAll();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
}

/**
 * @param {number} localId
 */
export async function borrarPendiente(localId) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(localId);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/**
 * @param {number} localId
 * @param {{ nombre: string, sector: string, nivelEscolar: string, latitud: number, longitud: number, imagenBase64: string }} payload
 */
export async function actualizarPendiente(localId, payload) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const r = store.get(localId);
    r.onsuccess = () => {
      const prev = r.result;
      if (!prev) {
        rej(new Error("Borrador no encontrado."));
        return;
      }
      store.put({
        localId,
        creadoLocal: prev.creadoLocal,
        nombre: payload.nombre,
        sector: payload.sector,
        nivelEscolar: payload.nivelEscolar,
        latitud: payload.latitud,
        longitud: payload.longitud,
        imagenBase64: payload.imagenBase64,
      });
    };
    r.onerror = () => rej(r.error);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
