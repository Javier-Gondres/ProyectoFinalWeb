import { tokenActual } from "/js/auth.js";
import { apiJson } from "/js/api.js";
import {
  guardarPendiente,
  listarPendientes,
  borrarPendiente,
  actualizarPendiente,
} from "/js/colas-local.js";
import { esFalloDeRed } from "/js/red-utils.js";
import { sincronizarColaRest } from "/js/sincronizar-cola.js";
import { initGrpcFormularioEncuestaLike } from "/grpc-web/grpc-form-ui.js";

import * as protobufMod from "https://esm.sh/protobufjs@7.4.0";
import * as longMod from "https://esm.sh/long@5.2.3";

const SERVICE = "proyecto2.encuesta.EncuestaService";
const STORAGE_BASE = "grpc_web_base_url";
const DEFAULT_GRPC_WEB_PROXY = "http://127.0.0.1:7080";
// Texto del .proto en caché para poder codificar sin red tras navegar
const PROTO_TEXT_SESSION = "encuesta_grpc_proto_text";
const PROTO_TEXT_LOCAL = "encuesta_grpc_proto_text";

const protobuf = unwrapDefault(protobufMod);
const LongCtor = unwrapLongCtor(longMod);

if (protobuf?.util && typeof LongCtor === "function") {
  protobuf.util.Long = LongCtor;
}

/** @type {import('protobufjs').Root | null} */
let protoRoot = null;

/**
 * @param {Record<string, unknown>} ns
 * @returns {unknown}
 */
function unwrapDefault(ns) {
  let x = /** @type {unknown} */ (ns?.default ?? ns);
  let guard = 0;
  while (
    x &&
    typeof x === "object" &&
    typeof /** @type {{ load?: unknown }} */ (x).load !== "function" &&
    "default" in /** @type {object} */ (x) &&
    guard++ < 5
  ) {
    x = /** @type {{ default?: unknown }} */ (x).default;
  }
  return x;
}

/**
 * @param {Record<string, unknown>} ns
 * @returns {new (...args: unknown[]) => unknown | null}
 */
function unwrapLongCtor(ns) {
  const d = /** @type {unknown} */ (ns?.default ?? ns);
  if (typeof d === "function") return /** @type {new (...args: unknown[]) => unknown} */ (d);
  if (d && typeof d === "object" && "default" in /** @type {object} */ (d)) {
    const inner = /** @type {{ default?: unknown }} */ (d).default;
    if (typeof inner === "function") return /** @type {new (...args: unknown[]) => unknown} */ (inner);
  }
  return null;
}

function guardarProtoEnCache(text) {
  if (!text || !text.includes("CrearFormularioRequest")) return;
  try {
    sessionStorage.setItem(PROTO_TEXT_SESSION, text);
  } catch (_) {}
  try {
    localStorage.setItem(PROTO_TEXT_LOCAL, text);
  } catch (_) {}
}

function leerProtoDesdeCache() {
  try {
    const s = sessionStorage.getItem(PROTO_TEXT_SESSION);
    if (s) return s;
  } catch (_) {}
  try {
    return localStorage.getItem(PROTO_TEXT_LOCAL);
  } catch (_) {
    return null;
  }
}

async function loadProto() {
  if (protoRoot) return protoRoot;
  if (!protobuf || typeof protobuf.parse !== "function") {
    throw new Error("protobufjs no cargó correctamente (import esm.sh).");
  }
  if (!protobuf.util || typeof protobuf.util.Long !== "function") {
    throw new Error(
      "La clase Long no está enlazada; int64 (creado_en_millis) no funcionará. Recargue la página."
    );
  }

  let text = null;
  try {
    const res = await fetch("/grpc-web/encuesta.proto", { cache: "default" });
    if (res.ok) {
      const t = await res.text();
      if (t.includes("syntax") && t.includes("CrearFormularioRequest")) {
        text = t;
        guardarProtoEnCache(t);
      }
    }
  } catch (_) {
    /* sin red u otro fallo de fetch */
  }

  if (!text) {
    text = leerProtoDesdeCache();
  }

  if (!text || !text.includes("CrearFormularioRequest")) {
    throw new Error(
      "No hay esquema protobuf en caché. Abra esta página al menos una vez con conexión para poder enviar o guardar en cola sin red."
    );
  }

  try {
    const RootCtor = protobuf.Root;
    if (typeof RootCtor === "function") {
      protoRoot = new RootCtor();
      protobuf.parse(text, protoRoot);
    } else {
      const parsed = protobuf.parse(text);
      protoRoot =
        parsed && typeof /** @type {{ lookup?: unknown }} */ (parsed).lookup === "function"
          ? /** @type {import('protobufjs').Root} */ (parsed)
          : /** @type {{ root?: import('protobufjs').Root }} */ (parsed).root;
    }
    if (!protoRoot || typeof protoRoot.lookup !== "function") {
      throw new Error("El esquema protobuf no produjo un Root válido.");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error("No se pudo leer encuesta.proto: " + msg);
  }
  return protoRoot;
}

/**
 * @param {import('protobufjs').Root} root
 * @param {string} fullName
 */
function lookupTipoEncuesta(root, fullName) {
  const shortName = fullName.includes(".") ? fullName.split(".").pop() : fullName;
  const candidates = [fullName, "." + fullName, shortName || fullName];
  for (const name of candidates) {
    if (!name) continue;
    try {
      const t = root.lookupType(name);
      if (t) return t;
    } catch (_) {
      // siguiente variante
    }
  }
  const viaLookup = root.lookup(fullName) || root.lookup("." + fullName) || (shortName ? root.lookup(shortName) : null);
  if (viaLookup && typeof /** @type {{ encode?: unknown }} */ (viaLookup).encode === "function") {
    return /** @type {import('protobufjs').Type} */ (viaLookup);
  }
  throw new Error("no such type: " + fullName);
}

/**
 * Errores de red, proxy, esquema no disponible sin caché o tipo protobuf roto → mismo tratamiento que offline (cola local).
 * @param {unknown} err
 */
function debeGuardarFormularioEnColaGrpc(err) {
  if (esFalloDeRed(err)) return true;
  const m = String(err instanceof Error ? err.message : err);
  if (/no such type:/i.test(m)) return true;
  if (/No hay esquema protobuf en caché/i.test(m)) return true;
  if (/No se pudo leer encuesta\.proto/i.test(m)) return true;
  return false;
}

function frameGrpcMessage(payload) {
  const n = payload.length;
  const out = new Uint8Array(5 + n);
  out[0] = 0;
  out[1] = (n >>> 24) & 255;
  out[2] = (n >>> 16) & 255;
  out[3] = (n >>> 8) & 255;
  out[4] = n & 255;
  out.set(payload, 5);
  return out;
}

function parseGrpcWebBody(arrayBuffer) {
  const u = new Uint8Array(arrayBuffer);
  const dataChunks = [];
  let o = 0;
  while (o < u.length) {
    const flag = u[o++];
    if (o + 4 > u.length) break;
    const len = (u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3];
    o += 4;
    if (len < 0 || o + len > u.length) break;
    const payload = u.subarray(o, o + len);
    o += len;
    if ((flag & 0x80) !== 0) continue;
    if ((flag & 0x01) !== 0) {
      throw new Error("El servidor devolvió mensaje comprimido; este cliente solo admite sin compresión.");
    }
    dataChunks.push(payload);
  }
  if (dataChunks.length === 0) return new Uint8Array(0);
  const total = dataChunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(total);
  let w = 0;
  for (const c of dataChunks) {
    merged.set(c, w);
    w += c.length;
  }
  return merged;
}

function decodeGrpcMessageHeader(raw) {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} methodName last path segment, e.g. ListarFormularios
 * @param {Uint8Array} requestBytes serialized protobuf body (sin marco gRPC)
 * @param {string} [bearer]
 */
async function grpcWebUnary(baseUrl, methodName, requestBytes, bearer) {
  const root = baseUrl.replace(/\/+$/, "");
  const path = `${root}/${SERVICE}/${methodName}`;
  const body = frameGrpcMessage(requestBytes);
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": "application/grpc-web+proto",
    Accept: "application/grpc-web+proto",
    "X-Grpc-Web": "1",
  };
  if (bearer) {
    headers["authorization"] = `Bearer ${bearer}`;
  }
  const res = await fetch(path, { method: "POST", headers, body });
  const code = res.headers.get("grpc-status");
  const desc = decodeGrpcMessageHeader(res.headers.get("grpc-message"));
  if (code !== null && code !== "" && code !== "0") {
    throw new Error(desc || `Error gRPC (código ${code})`);
  }
  const buf = await res.arrayBuffer();
  if (!res.ok && (code === null || code === "")) {
    throw new Error(`HTTP ${res.status}`);
  }
  return parseGrpcWebBody(buf);
}

function grpcProxyBase() {
  try {
    const s = localStorage.getItem(STORAGE_BASE);
    if (s && s.trim()) return s.replace(/\/+$/, "");
  } catch (_) {}
  return DEFAULT_GRPC_WEB_PROXY;
}

const NIVEL_LABEL = {
  BASICO: "Básico",
  MEDIO: "Medio",
  GRADO_UNIVERSITARIO: "Grado universitario",
  POSTGRADO: "Postgrado",
  DOCTORADO: "Doctorado",
};

/**
 * @param {unknown} v
 */
function millisFromProto(v) {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    const n = /** @type {{ toNumber: () => number }} */ (v).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * protobufjs puede devolver `nivel_escolar` o `nivelEscolar` según opciones.
 * @param {Record<string, unknown>} f
 */
function normalizeGrpcFormulario(f) {
  const id = String(f.id ?? "");
  const nombre = String(f.nombre ?? "");
  const sector = String(f.sector ?? "");
  const nivelRaw = String(f.nivel_escolar ?? f.nivelEscolar ?? "").trim();
  const millis = millisFromProto(f.creado_en_millis ?? f.creadoEnMillis);
  const imagenRaw = f.imagen_base64 ?? f.imagenBase64;
  const imagenStr = imagenRaw != null ? String(imagenRaw) : "";
  return { id, nombre, sector, nivelRaw, millis, imagenStr };
}

function etiquetaNivel(codigo) {
  if (codigo == null || codigo === "") return "—";
  const k = String(codigo).trim();
  return NIVEL_LABEL[/** @type {keyof typeof NIVEL_LABEL} */ (k)] || k;
}

/** Fecha corta para la tabla (solo día/mes/año). */
function fechaCorta(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" });
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

function formatoFechaDetalle(iso) {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(/** @type {string | number} */ (iso));
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

/**
 * @param {Record<string, unknown>} form
 */
function buildDetailModalHtml(form) {
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
  const creado = formatoFechaDetalle(form.creadoEn);
  const src = imagenDataUrl(form.imagenBase64 != null ? String(form.imagenBase64) : "");
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

/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

export function initGrpcWebPage() {
  const elListErr = document.getElementById("grpcListError");
  const elList = document.getElementById("grpcListBody");
  const elGrpcPag = $("grpcPagination");
  const elGrpcPagInfo = $("grpcPaginationInfo");
  const btnGrpcListPrev = $("grpcListPrev");
  const btnGrpcListNext = $("grpcListNext");
  const elGrpcMsg = document.getElementById("grpcMsg");
  const elFormCrear = /** @type {HTMLFormElement | null} */ (document.getElementById("grpcCrear"));
  const elBackdrop = document.getElementById("grpcModalBackdrop");
  const elModalBody = document.getElementById("grpcModalBody");
  const btnModalClose = document.getElementById("grpcModalClose");

  function showListError(msg) {
    if (!elListErr) return;
    elListErr.textContent = msg;
    elListErr.hidden = false;
  }

  function clearListError() {
    if (!elListErr) return;
    elListErr.textContent = "";
    elListErr.hidden = true;
  }

  function flashGrpc(text, ok) {
    if (!elGrpcMsg) return;
    elGrpcMsg.innerHTML =
      '<div class="msg ' + (ok ? "ok" : "err") + '">' + escapeHtml(text) + "</div>";
  }

  const grpcFormUi = initGrpcFormularioEncuestaLike(flashGrpc);

  /** @type {number | null} */
  let editingLocalId = null;

  const elBannerGrpc = $("bannerEdicionGrpc");
  const elBannerTextoGrpc = $("bannerEdicionTextoGrpc");
  const btnCancelarEdicionGrpc = $("btnCancelarEdicionGrpc");
  const grpcPendientesUl = $("grpcPendientes");

  /**
   * @returns {{ nombre: string, sector: string, nivelEscolar: string, latitud: number, longitud: number, imagenBase64: string }}
   */
  function leerFormularioGrpc() {
    const nombre =
      /** @type {HTMLInputElement | null} */ (elFormCrear?.querySelector('[name="nombre"]'))?.value.trim() ?? "";
    const sector =
      /** @type {HTMLInputElement | null} */ (elFormCrear?.querySelector('[name="sector"]'))?.value.trim() ?? "";
    const nivelEscolar =
      /** @type {HTMLSelectElement | null} */ (elFormCrear?.querySelector('[name="nivelEscolar"]'))?.value ?? "";
    const latitud = parseFloat(String(/** @type {HTMLInputElement | null} */ ($("grpcLat"))?.value ?? ""));
    const longitud = parseFloat(String(/** @type {HTMLInputElement | null} */ ($("grpcLon"))?.value ?? ""));
    const imagenBase64 = /** @type {HTMLInputElement | null} */ ($("grpcImagenBase64"))?.value.trim() ?? "";
    return { nombre, sector, nivelEscolar, latitud, longitud, imagenBase64 };
  }

  /**
   * @param {{ nombre: string, sector: string, nivelEscolar: string, latitud: number, longitud: number, imagenBase64: string }} p
   */
  function validarGrpc(p) {
    if (!p.nombre || !p.sector || !p.nivelEscolar) return "Complete nombre, sector y nivel.";
    if (!Number.isFinite(p.latitud) || !Number.isFinite(p.longitud)) return "Coordenadas inválidas.";
    if (!p.imagenBase64) return "Tome o elija una foto.";
    return null;
  }

  function setBannerEdicionGrpc() {
    if (!elBannerGrpc || !elBannerTextoGrpc) return;
    if (editingLocalId == null) {
      elBannerTextoGrpc.textContent = "";
      elBannerGrpc.hidden = true;
      if (btnCancelarEdicionGrpc) btnCancelarEdicionGrpc.hidden = true;
      return;
    }
    elBannerGrpc.hidden = false;
    if (btnCancelarEdicionGrpc) btnCancelarEdicionGrpc.hidden = false;
    elBannerTextoGrpc.textContent = "Editando borrador #" + editingLocalId;
  }

  function cancelarEdicionGrpc() {
    editingLocalId = null;
    elFormCrear?.reset();
    const latEl = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
    const lonEl = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
    if (latEl) latEl.value = "";
    if (lonEl) lonEl.value = "";
    grpcFormUi.limpiarFoto();
    setBannerEdicionGrpc();
    void renderPendientesGrpc();
    flashGrpc("Edición cancelada.", true);
  }

  btnCancelarEdicionGrpc?.addEventListener("click", () => {
    cancelarEdicionGrpc();
  });

  /**
   * @param {{ localId: number, nombre?: string, sector?: string, nivelEscolar?: string, latitud?: number, longitud?: number, imagenBase64?: string }} it
   */
  function cargarBorradorEnFormularioGrpc(it) {
    const n = /** @type {HTMLInputElement | null} */ (elFormCrear?.querySelector('[name="nombre"]'));
    const s = /** @type {HTMLInputElement | null} */ (elFormCrear?.querySelector('[name="sector"]'));
    const nv = /** @type {HTMLSelectElement | null} */ (elFormCrear?.querySelector('[name="nivelEscolar"]'));
    if (n) n.value = it.nombre || "";
    if (s) s.value = it.sector || "";
    if (nv) nv.value = it.nivelEscolar || "";
    const latEl = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
    const lonEl = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
    if (latEl) latEl.value = it.latitud != null ? String(it.latitud) : "";
    if (lonEl) lonEl.value = it.longitud != null ? String(it.longitud) : "";
    grpcFormUi.cargarBorradorFoto(it.imagenBase64 || "");
    editingLocalId = it.localId;
    setBannerEdicionGrpc();
    void renderPendientesGrpc();
    flashGrpc("Borrador cargado.", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function renderPendientesGrpc() {
    if (!grpcPendientesUl) return;
    const items = await listarPendientes();
    grpcPendientesUl.innerHTML = "";
    if (!items.length) {
      grpcPendientesUl.innerHTML = '<li class="queue-empty">No hay borradores en cola.</li>';
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
      ed.onclick = () => cargarBorradorEnFormularioGrpc(it);
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Quitar";
      del.className = "secondary";
      del.onclick = async () => {
        if (editingLocalId === it.localId) {
          editingLocalId = null;
          elFormCrear?.reset();
          const latEl = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
          const lonEl = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
          if (latEl) latEl.value = "";
          if (lonEl) lonEl.value = "";
          grpcFormUi.limpiarFoto();
          setBannerEdicionGrpc();
        }
        await borrarPendiente(it.localId);
        await renderPendientesGrpc();
        flashGrpc("Borrador quitado de la cola.", true);
      };
      actions.appendChild(ed);
      actions.appendChild(del);
      li.appendChild(meta);
      li.appendChild(actions);
      grpcPendientesUl.appendChild(li);
    }
  }

  $("grpcBtnSyncWs")?.addEventListener("click", async () => {
    if (!tokenActual()) return flashGrpc("Sin token. Inicie sesión.", false);
    const btn = /** @type {HTMLButtonElement | null} */ ($("grpcBtnSyncWs"));
    const texto = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sincronizando...";
    }
    try {
      const r = await sincronizarColaRest();
      if (r.sinPendientes) {
        flashGrpc("No hay pendientes.", false);
      } else if (r.errores.length) {
        flashGrpc(
          "Algunos borradores no se pudieron subir: " + r.errores.map((e) => e.mensaje).join("; "),
          false
        );
      } else {
        flashGrpc("Cola sincronizada (" + r.enviados + " enviados).", true);
      }
      await renderPendientesGrpc();
      if (editingLocalId != null) {
        const siguen = await listarPendientes();
        if (!siguen.some((x) => x.localId === editingLocalId)) {
          editingLocalId = null;
          setBannerEdicionGrpc();
        }
      }
    } catch (e) {
      flashGrpc(e instanceof Error ? e.message : String(e), false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = texto || "Sincronizar cola";
      }
    }
  });

  setBannerEdicionGrpc();
  void renderPendientesGrpc();

  function closeDetalleModal() {
    if (elBackdrop) elBackdrop.hidden = true;
    document.body.style.overflow = "";
  }

  function openDetalleModal() {
    if (elBackdrop) elBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  /**
   * @param {string} id
   */
  async function showDetalleFormulario(id) {
    if (!id || !elModalBody) return;
    openDetalleModal();
    elModalBody.innerHTML =
      '<article class="map-popup"><p class="map-popup__loading">Cargando detalle…</p></article>';
    try {
      const data = await apiJson("/api/formularios/" + encodeURIComponent(id));
      elModalBody.innerHTML = buildDetailModalHtml(
        /** @type {Record<string, unknown>} */ (data.formulario || {})
      );
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : String(e);
      elModalBody.innerHTML =
        '<article class="map-popup map-popup--err"><p>' + escapeHtml(msgErr) + "</p></article>";
    }
  }

  btnModalClose?.addEventListener("click", closeDetalleModal);
  elBackdrop?.addEventListener("click", (e) => {
    if (e.target === elBackdrop) closeDetalleModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elBackdrop && !elBackdrop.hidden) closeDetalleModal();
  });

  const GRPC_LIST_PAGE_SIZE = 10;
  let grpcListPage = 1;

  function updateGrpcPaginationUi(total, page, totalPages) {
    if (!elGrpcPag || !elGrpcPagInfo || !btnGrpcListPrev || !btnGrpcListNext) return;
    if (total <= 0) {
      elGrpcPag.hidden = true;
      return;
    }
    elGrpcPag.hidden = false;
    const tp = Math.max(1, totalPages);
    const p = Math.min(Math.max(1, page), tp);
    elGrpcPagInfo.textContent =
      "Página " +
      p +
      " de " +
      tp +
      " · " +
      total +
      " formulario" +
      (total === 1 ? "" : "s");
    btnGrpcListPrev.disabled = p <= 1;
    btnGrpcListNext.disabled = p >= tp;
  }

  async function listarGrpcPagina(page) {
    const base = grpcProxyBase();
    const token = tokenActual();
    if (!token) {
      window.location.href = "/login.html";
      return;
    }
    clearListError();
    if (!elList) return;
    grpcListPage = page;
    try {
      const proto = await loadProto();
      const ListarReq = lookupTipoEncuesta(proto, "proyecto2.encuesta.ListarFormulariosRequest");
      const incluirEl = /** @type {HTMLInputElement | null} */ (document.getElementById("incluirImagen"));
      const incluir = incluirEl?.checked ?? false;
      const bytes = ListarReq.encode(
        ListarReq.create({
          incluirImagenBase64: incluir,
          page: page,
          pageSize: GRPC_LIST_PAGE_SIZE,
        })
      ).finish();
      const replyBytes = await grpcWebUnary(base, "ListarFormularios", bytes, token);
      const ListarReply = lookupTipoEncuesta(proto, "proyecto2.encuesta.ListarFormulariosReply");
      const decoded = ListarReply.decode(replyBytes);
      const obj = ListarReply.toObject(decoded, { longs: Number, defaults: true });
      const total = Number(obj.total ?? 0);
      const curPage = Number(obj.page ?? page);
      const ps = Number(obj.pageSize ?? GRPC_LIST_PAGE_SIZE);
      grpcListPage = curPage;
      const totalPages = ps > 0 ? Math.ceil(total / ps) : 0;
      elList.innerHTML = "";
      const rows = /** @type {Record<string, unknown>[]} */ (obj.formularios || []);
      if (rows.length === 0) {
        elList.innerHTML =
          '<tr><td colspan="4" class="grpc-empty">No hay formularios visibles para su usuario.</td></tr>';
        updateGrpcPaginationUi(0, 1, 0);
        return;
      }
      for (const raw of rows) {
        const f = normalizeGrpcFormulario(raw);
        const tr = document.createElement("tr");
        tr.className = "grpc-row";
        tr.tabIndex = 0;
        tr.setAttribute("role", "button");
        tr.dataset.id = f.id;
        tr.innerHTML = `
          <td>${escapeHtml(f.nombre)}</td>
          <td>${escapeHtml(f.sector)}</td>
          <td>${escapeHtml(etiquetaNivel(f.nivelRaw))}</td>
          <td>${escapeHtml(fechaCorta(f.millis))}</td>`;
        tr.addEventListener("click", () => showDetalleFormulario(f.id));
        tr.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            showDetalleFormulario(f.id);
          }
        });
        elList.appendChild(tr);
      }
      updateGrpcPaginationUi(total, curPage, totalPages);
    } catch (err) {
      showListError(err instanceof Error ? err.message : String(err));
    }
  }

  document.getElementById("btnListar")?.addEventListener("click", async () => {
    await listarGrpcPagina(1);
  });
  btnGrpcListPrev?.addEventListener("click", async () => {
    if (grpcListPage <= 1) return;
    await listarGrpcPagina(grpcListPage - 1);
  });
  btnGrpcListNext?.addEventListener("click", async () => {
    await listarGrpcPagina(grpcListPage + 1);
  });

  elFormCrear?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const base = grpcProxyBase();
    const token = tokenActual();
    if (!token) {
      window.location.href = "/login.html";
      return;
    }

    const p = leerFormularioGrpc();
    const vErr = validarGrpc(p);
    if (vErr) {
      flashGrpc(vErr, false);
      return;
    }

    const btnEnviar = /** @type {HTMLButtonElement | null} */ ($("grpcBtnEnviar"));
    const textoEnviar = btnEnviar?.textContent ?? "";
    if (btnEnviar) {
      btnEnviar.disabled = true;
      btnEnviar.textContent = "Cargando...";
    }
    elFormCrear.setAttribute("aria-busy", "true");
    try {
      const proto = await loadProto();
      const CrearReq = lookupTipoEncuesta(proto, "proyecto2.encuesta.CrearFormularioRequest");
      // protobufjs usa nombres camelCase en JS (p. ej. nivelEscolar), no nivel_escolar del .proto.
      const body = CrearReq.encode(
        CrearReq.create({
          nombre: p.nombre,
          sector: p.sector,
          nivelEscolar: p.nivelEscolar,
          latitud: p.latitud,
          longitud: p.longitud,
          imagenBase64: p.imagenBase64,
        })
      ).finish();
      const replyBytes = await grpcWebUnary(base, "CrearFormulario", body, token);
      const CrearReply = lookupTipoEncuesta(proto, "proyecto2.encuesta.CrearFormularioReply");
      const decoded = CrearReply.decode(replyBytes);
      CrearReply.toObject(decoded, { longs: Number, defaults: true });
      if (editingLocalId != null) {
        await borrarPendiente(editingLocalId);
      }
      editingLocalId = null;
      setBannerEdicionGrpc();
      await renderPendientesGrpc();
      flashGrpc("Enviado al servidor correctamente (gRPC).", true);
      elFormCrear.reset();
      grpcFormUi.limpiarFoto();
      const latEl = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
      const lonEl = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
      if (latEl) latEl.value = "";
      if (lonEl) lonEl.value = "";
    } catch (err) {
      if (debeGuardarFormularioEnColaGrpc(err)) {
        try {
          if (editingLocalId != null) {
            await actualizarPendiente(editingLocalId, p);
          } else {
            await guardarPendiente(p);
          }
          editingLocalId = null;
          setBannerEdicionGrpc();
          flashGrpc(
            "Se guardó en la cola local porque no hay conexión con el servidor. Podrá sincronizarla con el botón de la cola.",
            true
          );
          elFormCrear.reset();
          grpcFormUi.limpiarFoto();
          const latEl = /** @type {HTMLInputElement | null} */ ($("grpcLat"));
          const lonEl = /** @type {HTMLInputElement | null} */ ($("grpcLon"));
          if (latEl) latEl.value = "";
          if (lonEl) lonEl.value = "";
          await renderPendientesGrpc();
        } catch (idbErr) {
          flashGrpc(idbErr instanceof Error ? idbErr.message : String(idbErr), false);
        }
      } else {
        flashGrpc(err instanceof Error ? err.message : String(err), false);
      }
    } finally {
      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.textContent = textoEnviar;
      }
      elFormCrear.removeAttribute("aria-busy");
    }
  });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
