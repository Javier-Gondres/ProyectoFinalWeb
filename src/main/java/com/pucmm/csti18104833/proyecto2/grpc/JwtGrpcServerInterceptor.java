package com.pucmm.csti18104833.proyecto2.grpc;

import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import com.pucmm.csti18104833.proyecto2.security.BearerAuth;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.grpc.Context;
import io.grpc.Contexts;
import io.grpc.Metadata;
import io.grpc.ServerCall;
import io.grpc.ServerCallHandler;
import io.grpc.ServerInterceptor;
import io.grpc.Status;

import java.util.Optional;

/**
 * Espera la misma cabecera que REST: {@code authorization: Bearer <jwt>}.
 */
public final class JwtGrpcServerInterceptor implements ServerInterceptor {

    private static final Metadata.Key<String> AUTHORIZATION =
            Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER);

    private final JwtService jwtService;

    public JwtGrpcServerInterceptor(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {
        String auth = headers.get(AUTHORIZATION);
        if (auth == null) {
            call.close(Status.UNAUTHENTICATED.withDescription("Falta metadata authorization: Bearer <token>"), new Metadata());
            return new ServerCall.Listener<>() {};
        }
        Optional<AuthPrincipal> opt = BearerAuth.parsePrincipal(auth, jwtService);
        if (opt.isEmpty()) {
            call.close(Status.UNAUTHENTICATED.withDescription("Token inválido o expirado"), new Metadata());
            return new ServerCall.Listener<>() {};
        }
        Context ctx = Context.current().withValue(GrpcAuthContext.PRINCIPAL, opt.get());
        return Contexts.interceptCall(ctx, call, headers, next);
    }
}
