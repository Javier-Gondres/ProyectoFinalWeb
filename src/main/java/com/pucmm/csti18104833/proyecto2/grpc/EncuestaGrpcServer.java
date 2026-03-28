package com.pucmm.csti18104833.proyecto2.grpc;

import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.formulario.FormularioService;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.grpc.Server;
import io.grpc.ServerBuilder;
import io.grpc.ServerInterceptors;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

public final class EncuestaGrpcServer {

    private EncuestaGrpcServer() {}

    public static Server start(int port, MongoDatabase database, JwtService jwtService) throws IOException {
        FormularioService formularioService = new FormularioService(database);
        EncuestaGrpcServiceImpl impl = new EncuestaGrpcServiceImpl(formularioService);
        Server server = ServerBuilder.forPort(port)
                .addService(ServerInterceptors.intercept(
                        impl.bindService(),
                        new JwtGrpcServerInterceptor(jwtService)))
                .build();
        server.start();
        return server;
    }

    public static void shutdownGracefully(Server server) {
        if (server == null) {
            return;
        }
        server.shutdown();
        try {
            if (!server.awaitTermination(8, TimeUnit.SECONDS)) {
                server.shutdownNow();
            }
        } catch (InterruptedException e) {
            server.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
