package com.pucmm.csti18104833.proyecto2.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.domain.NivelEscolar;
import com.pucmm.csti18104833.proyecto2.formulario.FormularioService;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.javalin.Javalin;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sincronización de borradores: el cliente envía un JSON con {@code items} (misma forma que POST /api/formularios).
 * Autenticación: query {@code ?token=JWT} al conectar.
 */
public final class FormularioSyncWebSocket {

    private static final Logger log = LoggerFactory.getLogger(FormularioSyncWebSocket.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private FormularioSyncWebSocket() {}

    public static void register(Javalin app, MongoDatabase database, JwtService jwtService) {
        FormularioService service = new FormularioService(database);
        Map<io.javalin.websocket.WsContext, AuthPrincipal> sesiones = new ConcurrentHashMap<>();

        app.ws("/ws/sync", ws -> {
            ws.onConnect(ctx -> {
                String token = ctx.queryParam("token");
                if (token == null || token.isBlank()) {
                    ctx.closeSession(4401, "Falta query token");
                    return;
                }
                AuthPrincipal p = jwtService.parseValid(token.trim());
                if (p == null) {
                    ctx.closeSession(4401, "Token inválido o expirado");
                    return;
                }
                sesiones.put(ctx, p);
            });
            ws.onClose(ctx -> sesiones.remove(ctx));
            ws.onMessage(ctx -> {
                AuthPrincipal principal = sesiones.get(ctx);
                if (principal == null) {
                    ctx.send("{\"error\":\"Sesión no autenticada\"}");
                    return;
                }
                try {
                    JsonNode root = MAPPER.readTree(ctx.message());
                    JsonNode items = root.get("items");
                    if (items == null || !items.isArray()) {
                        ctx.send("{\"error\":\"Se espera objeto con array items\"}");
                        return;
                    }
                    ObjectNode reply = MAPPER.createObjectNode();
                    reply.put("ok", true);
                    var guardados = MAPPER.createArrayNode();
                    var errores = MAPPER.createArrayNode();
                    int i = 0;
                    for (JsonNode it : items) {
                        try {
                            String nombre = text(it, "nombre");
                            String sector = text(it, "sector");
                            String nivelRaw = text(it, "nivelEscolar");
                            double lat = it.path("latitud").asDouble();
                            double lon = it.path("longitud").asDouble();
                            String img = text(it, "imagenBase64");
                            var nivelOpt = NivelEscolar.parse(nivelRaw);
                            if (nivelOpt.isEmpty()) {
                                throw new IllegalArgumentException("nivelEscolar inválido");
                            }
                            Document doc = service.crear(principal, nombre, sector, nivelOpt.get(), lat, lon, img);
                            guardados.add(doc.getObjectId("_id").toHexString());
                        } catch (Exception ex) {
                            ObjectNode err = MAPPER.createObjectNode();
                            err.put("indice", i);
                            err.put("mensaje", ex.getMessage() != null ? ex.getMessage() : "error");
                            errores.add(err);
                        }
                        i++;
                    }
                    reply.set("guardados", guardados);
                    reply.set("errores", errores);
                    ctx.send(MAPPER.writeValueAsString(reply));
                } catch (Exception e) {
                    log.warn("WS sync: {}", e.toString());
                    ctx.send("{\"error\":\"JSON inválido\"}");
                }
            });
        });
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? "" : v.asText("");
    }
}
