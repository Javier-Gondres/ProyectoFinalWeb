package com.pucmm.csti18104833.proyecto2;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import com.pucmm.csti18104833.proyecto2.auth.AuthRoutes;
import com.pucmm.csti18104833.proyecto2.formulario.FormularioRoutes;
import com.pucmm.csti18104833.proyecto2.config.AppConfig;
import com.pucmm.csti18104833.proyecto2.mongo.MongoDatabaseInitializer;
import com.pucmm.csti18104833.proyecto2.security.JwtService;
import io.javalin.Javalin;
import org.bson.Document;

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

        Runtime.getRuntime().addShutdownHook(new Thread(mongoClient::close));

        JwtService jwtService = new JwtService(config.getJwtSecret(), config.getJwtExpirationMs());

        Javalin app = Javalin.create(javalinConfig ->
                javalinConfig.bundledPlugins.enableCors(cors ->
                        cors.addRule(rule -> rule.anyHost())));

        registerRoutes(app, database, jwtService);

        app.start(config.getServerPort());
    }

    private static void registerRoutes(Javalin app, MongoDatabase database, JwtService jwtService) {
        AuthRoutes.register(app, database, jwtService);
        FormularioRoutes.register(app, database, jwtService);

        app.get("/api/health", ctx -> {
            database.runCommand(new Document("ping", 1));
            ctx.json(Map.of(
                    "status", "ok",
                    "mongo", "connected",
                    "database", database.getName()
            ));
        });

        app.get("/", ctx -> ctx.result("Encuesta PUCMM — API en /api/health"));
    }
}
