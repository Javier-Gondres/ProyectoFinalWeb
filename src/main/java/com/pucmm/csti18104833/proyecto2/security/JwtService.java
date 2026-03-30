package com.pucmm.csti18104833.proyecto2.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.bson.types.ObjectId;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public final class JwtService {

    private final SecretKey key;
    private final long expirationMs;

    public JwtService(String secret, long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String createToken(AuthPrincipal principal) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(principal.idHex())
                .claim("username", principal.username())
                .claim("rol", principal.rol())
                .issuedAt(new Date(now))
                .expiration(new Date(now + expirationMs))
                .signWith(key)
                .compact();
    }

    /** Devuelve el usuario del token o null si es inválido o expiró. */
    public AuthPrincipal parseValid(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            ObjectId id = new ObjectId(claims.getSubject());
            String username = claims.get("username", String.class);
            String rol = claims.get("rol", String.class);
            if (username == null || rol == null) {
                return null;
            }
            return new AuthPrincipal(id, username, rol);
        } catch (RuntimeException e) {
            // JJWT lanza JwtException (subtipo de RuntimeException); ObjectId puede lanzar IllegalArgumentException.
            return null;
        }
    }
}
