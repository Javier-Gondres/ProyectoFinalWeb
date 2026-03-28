package com.pucmm.csti18104833.proyecto2.grpc;

import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import io.grpc.Context;

public final class GrpcAuthContext {

    public static final Context.Key<AuthPrincipal> PRINCIPAL = Context.key("principal");

    private GrpcAuthContext() {}
}
