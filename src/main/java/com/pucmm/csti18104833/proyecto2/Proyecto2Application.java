package com.pucmm.csti18104833.proyecto2;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.auth.AdminUsuarioRoutes;
import com.pucmm.csti18104833.proyecto2.auth.AuthRoutes;
import com.pucmm.csti18104833.proyecto2.formulario.FormularioRoutes;
import com.pucmm.csti18104833.proyecto2.config.AppConfig;
import com.pucmm.csti18104833.proyecto2.grpc.EncuestaGrpcServer;
import com.pucmm.csti18104833.proyecto2.mongo.MongoDatabaseInitializer;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import com.pucmm.csti18104833.proyecto2.websocket.FormularioSyncWebSocket;
import io.grpc.Server;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import org.bson.Document;

import java.io.IOException;
import java.util.Map;

public class Proyecto2Application {

    public static void main(String[] args) {
        AppConfig config = AppConfig.fromEnvironment();

        MongoClient mongoClient = MongoClients.create(config.getMongoUri());
        MongoDatabase database = mongoClient.getDatabase(config.getDatabaseName());

        try {
            MongoDatabaseInitializer.initialize(database);
        } catch (RuntimeException e) {
            mongoClient.close();
            throw e;
        }

        JwtService jwtService = new JwtService(config.getJwtSecret(), config.getJwtExpirationMs());

        Server grpcServer;
        try {
            grpcServer = EncuestaGrpcServer.start(config.getGrpcPort(), database, jwtService);
        } catch (IOException e) {
            mongoClient.close();
            throw new IllegalStateException("No se pudo iniciar gRPC en puerto " + config.getGrpcPort(), e);
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            EncuestaGrpcServer.shutdownGracefully(grpcServer);
            mongoClient.close();
        }));

        Javalin app = Javalin.create(javalinConfig -> {
            javalinConfig.http.maxRequestSize = 16L * 1024 * 1024; //16 mb
            // Por defecto Jetty limita mensajes WS (~64 KiB); la cola envía JSON con base64.
            javalinConfig.jetty.modifyWebSocketServletFactory(factory ->
                    factory.setMaxTextMessageSize(16 * 1024 * 1024));
            javalinConfig.bundledPlugins.enableCors(cors -> cors.addRule(rule -> rule.anyHost()));
            javalinConfig.staticFiles.add(staticFiles -> {
                staticFiles.hostedPath = "/";
                staticFiles.directory = "/public";
                staticFiles.location = Location.CLASSPATH;
            });
        });

        registerRoutes(app, database, jwtService);

        app.start(config.getServerPort());
    }

    private static void registerRoutes(Javalin app, MongoDatabase database, JwtService jwtService) {
        AuthRoutes.register(app, database, jwtService);
        AdminUsuarioRoutes.register(app, database, jwtService);
        FormularioRoutes.register(app, database, jwtService);
        FormularioSyncWebSocket.register(app, database, jwtService);

        app.get("/", ctx -> ctx.redirect("/index.html"));

        app.get("/api/health", ctx -> {
            database.runCommand(new Document("ping", 1));
            ctx.json(Map.of(
                    "status", "ok",
                    "mongo", "connected",
                    "database", database.getName()
            ));
        });

    }
}
