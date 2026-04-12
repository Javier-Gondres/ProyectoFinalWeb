package com.pucmm.csti18104833.proyecto2.formulario;

import com.pucmm.csti18104833.proyecto2.domain.NivelEscolar;
import com.pucmm.csti18104833.proyecto2.formulario.dto.CrearFormularioBody;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import com.pucmm.csti18104833.proyecto2.security.BearerAuth;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.javalin.Javalin;
import io.javalin.http.HttpStatus;
import org.bson.Document;
import org.bson.types.ObjectId;

import com.mongodb.client.MongoDatabase;

import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

public final class FormularioRoutes {

    private FormularioRoutes() {}

    public static void register(Javalin app, MongoDatabase database, JwtService jwtService) {
        FormularioService service = new FormularioService(database);

        app.get("/api/formularios", ctx -> {
            Optional<AuthPrincipal> authOpt = BearerAuth.parsePrincipal(ctx.header("Authorization"), jwtService);
            if (authOpt.isEmpty()) {
                ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Token inválido o ausente."));
                return;
            }
            AuthPrincipal p = authOpt.get();
            int page = Math.max(1, parseQueryInt(ctx.queryParam("page"), 1));
            int pageSize =
                    parseQueryInt(ctx.queryParam("pageSize"), FormularioService.LISTA_PAGE_SIZE_DEFAULT);
            FormularioService.FormularioListadoPaginado listado =
                    service.listarVisiblePorPaginado(p, false, page, pageSize);
            long total = listado.total();
            int ps = listado.pageSize();
            int totalPages = ps > 0 ? (int) Math.ceil((double) total / ps) : 0;
            ctx.json(Map.of(
                    "formularios",
                    listado.items().stream().map(FormularioRoutes::docToJson).collect(Collectors.toList()),
                    "total",
                    total,
                    "page",
                    listado.page(),
                    "pageSize",
                    ps,
                    "totalPages",
                    totalPages));
        });

        app.get("/api/formularios/{id}", ctx -> {
            Optional<AuthPrincipal> authOpt = BearerAuth.parsePrincipal(ctx.header("Authorization"), jwtService);
            if (authOpt.isEmpty()) {
                ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Token inválido o ausente."));
                return;
            }
            ObjectId id;
            try {
                id = new ObjectId(ctx.pathParam("id"));
            } catch (IllegalArgumentException e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "id inválido."));
                return;
            }
            Optional<Document> opt = service.buscarPorId(id);
            if (opt.isEmpty()) {
                ctx.status(HttpStatus.NOT_FOUND).json(Map.of("error", "Formulario no encontrado."));
                return;
            }
            Document doc = opt.get();
            if (!service.puedeVer(authOpt.get(), doc)) {
                ctx.status(HttpStatus.FORBIDDEN).json(Map.of("error", "No autorizado a ver este formulario."));
                return;
            }
            ctx.json(Map.of("formulario", docToJson(doc)));
        });

        app.post("/api/formularios", ctx -> {
            Optional<AuthPrincipal> authOpt = BearerAuth.parsePrincipal(ctx.header("Authorization"), jwtService);
            if (authOpt.isEmpty()) {
                ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Token inválido o ausente."));
                return;
            }
            CrearFormularioBody body;
            try {
                body = ctx.bodyAsClass(CrearFormularioBody.class);
            } catch (Exception e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "JSON inválido."));
                return;
            }
            Optional<NivelEscolar> nivelOpt = NivelEscolar.parse(body.nivelEscolar());
            if (nivelOpt.isEmpty()) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of(
                        "error",
                        "nivelEscolar inválido. Use: BASICO, MEDIO, GRADO_UNIVERSITARIO, POSTGRADO, DOCTORADO."));
                return;
            }
            Double lat = body.latitud();
            Double lon = body.longitud();
            if (lat == null || lon == null || !Double.isFinite(lat) || !Double.isFinite(lon)) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of(
                        "error",
                        "latitud y longitud deben ser números válidos (no pueden quedar vacíos o ser infinitos)."));
                return;
            }
            try {
                Document guardado = service.crear(
                        authOpt.get(),
                        body.nombre(),
                        body.sector(),
                        nivelOpt.get(),
                        lat,
                        lon,
                        body.imagenBase64());
                ctx.status(HttpStatus.CREATED).json(Map.of("formulario", docToJson(guardado)));
            } catch (IllegalArgumentException e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", e.getMessage()));
            }
        });
    }

    private static int parseQueryInt(String raw, int defaultValue) {
        if (raw == null || raw.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static Map<String, Object> docToJson(Document d) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        Object id = d.get("_id");
        m.put("id", id instanceof ObjectId oid ? oid.toHexString() : id);
        for (String key : d.keySet()) {
            if ("_id".equals(key)) {
                continue;
            }
            m.put(key, valorJson(d.get(key)));
        }
        return m;
    }

    /** ObjectId y tipos BSON raros: a string/valor compatible con JSON y con PowerShell. */
    private static Object valorJson(Object v) {
        if (v instanceof ObjectId oid) {
            return oid.toHexString();
        }
        return v;
    }
}
