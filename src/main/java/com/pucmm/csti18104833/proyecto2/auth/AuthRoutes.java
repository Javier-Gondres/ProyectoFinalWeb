package com.pucmm.csti18104833.proyecto2.auth;

import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.auth.dto.LoginBody;
import com.pucmm.csti18104833.proyecto2.auth.dto.RegisterBody;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.javalin.Javalin;
import io.javalin.http.HttpStatus;

import java.util.Map;
import java.util.Optional;

public final class AuthRoutes {

    private AuthRoutes() {}

    public static void register(
            Javalin app,
            MongoDatabase database,
            JwtService jwtService) {
        UsuarioService usuarios = new UsuarioService(database);

        app.post("/api/auth/registro", ctx -> {
            RegisterBody body;
            try {
                body = ctx.bodyAsClass(RegisterBody.class);
            } catch (Exception e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "JSON inválido o campos faltantes."));
                return;
            }
            if (body.username() == null || body.username().isBlank()
                    || body.password() == null || body.password().isBlank()) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "username y password son obligatorios."));
                return;
            }
            try {
                AuthPrincipal p = usuarios.registrar(body.username(), body.password(), body.nombre());
                String token = jwtService.createToken(p);
                ctx.status(HttpStatus.CREATED).json(Map.of(
                        "token", token,
                        "usuario", usuarioJson(p)));
            } catch (IllegalArgumentException e) {
                boolean duplicado = e.getMessage() != null && e.getMessage().contains("Ya existe");
                ctx.status(duplicado ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST)
                        .json(Map.of("error", e.getMessage()));
            } catch (IllegalStateException e) {
                ctx.status(HttpStatus.SERVICE_UNAVAILABLE).json(Map.of("error", e.getMessage()));
            }
        });

        app.post("/api/auth/login", ctx -> {
            LoginBody body;
            try {
                body = ctx.bodyAsClass(LoginBody.class);
            } catch (Exception e) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "JSON inválido."));
                return;
            }
            if (body.username() == null || body.password() == null) {
                ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "username y password son obligatorios."));
                return;
            }
            var opt = usuarios.autenticar(body.username(), body.password());
            if (opt.isEmpty()) {
                ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Credenciales incorrectas."));
                return;
            }
            AuthPrincipal p = opt.get();
            ctx.json(Map.of(
                    "token", jwtService.createToken(p),
                    "usuario", usuarioJson(p)));
        });

        app.get("/api/auth/me", ctx -> {
            Optional<AuthPrincipal> opt = obtenerPrincipalBearer(ctx.header("Authorization"), jwtService);
            if (opt.isEmpty()) {
                ctx.status(HttpStatus.UNAUTHORIZED).json(Map.of("error", "Token inválido o ausente."));
                return;
            }
            ctx.json(Map.of("usuario", usuarioJson(opt.get())));
        });
    }

    private static Optional<AuthPrincipal> obtenerPrincipalBearer(
            String authorization,
            JwtService jwtService) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, "Bearer ".length())) {
            return Optional.empty();
        }
        String token = authorization.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            return Optional.empty();
        }
        AuthPrincipal p = jwtService.parseValid(token);
        return Optional.ofNullable(p);
    }

    static Map<String, Object> usuarioJson(AuthPrincipal p) {
        return Map.of(
                "id", p.idHex(),
                "username", p.username(),
                "rol", p.rol());
    }
}
