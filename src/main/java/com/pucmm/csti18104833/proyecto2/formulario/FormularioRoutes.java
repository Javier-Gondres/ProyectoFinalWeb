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

import java.util.List;
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
            List<Document> docs = service.listarVisiblePor(p, false);
            ctx.json(Map.of("formularios", docs.stream().map(FormularioRoutes::docToJson).collect(Collectors.toList())));
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
            try {
                Document guardado = service.crear(
                        authOpt.get(),
                        body.nombre(),
                        body.sector(),
                        nivelOpt.get(),
                        body.latitud(),
                        body.longitud(),
                        body.imagenBase64());
                ctx.status(HttpStatus.CREATED).json(Map.of("formulario", docToJson(guardado)));
            } catch (IllegalArgumentException e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", e.getMessage()));
            }
        });
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
