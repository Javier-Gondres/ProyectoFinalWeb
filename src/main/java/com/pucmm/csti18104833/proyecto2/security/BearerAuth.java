package com.pucmm.csti18104833.proyecto2.security;

import java.util.Optional;

public final class BearerAuth {

    private BearerAuth() {}

    public static Optional<AuthPrincipal> parsePrincipal(String authorizationHeader, JwtService jwtService) {
        if (authorizationHeader == null
                || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, "Bearer ".length())) {
            return Optional.empty();
        }
        String token = authorizationHeader.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            return Optional.empty();
        }
        return Optional.ofNullable(jwtService.parseValid(token));
    }
}
