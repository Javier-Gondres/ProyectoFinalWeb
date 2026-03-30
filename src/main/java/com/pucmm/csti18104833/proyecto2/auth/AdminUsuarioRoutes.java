package com.pucmm.csti18104833.proyecto2.auth;

import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.auth.dto.CambiarRolBody;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import com.pucmm.csti18104833.proyecto2.security.BearerAuth;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.javalin.Javalin;
import io.javalin.http.HttpStatus;
import org.bson.Document;
import org.bson.types.ObjectId;

import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

public final class AdminUsuarioRoutes {

    private AdminUsuarioRoutes() {}

    public static void register(Javalin app, MongoDatabase database, JwtService jwtService) {
        UsuarioService usuarios = new UsuarioService(database);

        app.get("/api/admin/usuarios", ctx -> {
            if (denyUnlessAdmin(ctx, jwtService)) {
                return;
            }
            List<Document> docs = usuarios.listarUsuariosParaAdmin();
            ctx.json(Map.of(
                    "usuarios",
                    docs.stream().map(AdminUsuarioRoutes::docToJson).collect(Collectors.toList())));
        });

        app.patch("/api/admin/usuarios/{id}", ctx -> {
            if (denyUnlessAdmin(ctx, jwtService)) {
                return;
            }
            ObjectId id;
            try {
                id = new ObjectId(ctx.pathParam("id"));
            } catch (IllegalArgumentException e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "id inválido."));
                return;
            }
            CambiarRolBody body;
            try {
                body = ctx.bodyAsClass(CambiarRolBody.class);
            } catch (Exception e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "JSON inválido."));
                return;
            }
            if (body.rol() == null || body.rol().isBlank()) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "rol es obligatorio."));
                return;
            }
            try {
                Document actualizado = usuarios.actualizarRol(id, body.rol().trim());
                ctx.json(Map.of("usuario", docToJson(actualizado)));
            } catch (IllegalArgumentException e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", e.getMessage()));
            }
        });
    }

    /** @return true si ya se respondió con error (401 o 403). */
    private static boolean denyUnlessAdmin(io.javalin.http.Context ctx, JwtService jwtService) {
        Optional<AuthPrincipal> opt = BearerAuth.parsePrincipal(ctx.header("Authorization"), jwtService);
        if (opt.isEmpty()) {
            ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Token inválido o ausente."));
            return true;
        }
        if (!UsuarioService.ROL_ADMIN.equals(opt.get().rol())) {
            ctx.status(HttpStatus.FORBIDDEN).json(Map.of("error", "Se requiere rol ADMIN."));
            return true;
        }
        return false;
    }

    private static Map<String, Object> docToJson(Document d) {
        Map<String, Object> m = new LinkedHashMap<>();
        Object id = d.get("_id");
        if (id instanceof ObjectId) {
            m.put("id", ((ObjectId) id).toHexString());
        } else {
            m.put("id", id);
        }
        m.put("username", d.getString("username"));
        m.put("nombre", d.getString("nombre"));
        m.put("rol", d.getString("rol"));
        Object creado = d.get("creadoEn");
        if (creado instanceof Date date) {
            m.put("creadoEn", date.toInstant().toString());
        } else {
            m.put("creadoEn", creado);
        }
        return m;
    }
}
