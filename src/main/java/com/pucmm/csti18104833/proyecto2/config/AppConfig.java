package com.pucmm.csti18104833.proyecto2.config;

import java.util.Map;


public final class AppConfig {

    private final String mongoUri;
    private final String databaseName;
    private final int serverPort;

    private AppConfig(String mongoUri, String databaseName, int serverPort) {
        this.mongoUri = mongoUri;
        this.databaseName = databaseName;
        this.serverPort = serverPort;
    }

    public static AppConfig fromEnvironment() {
        Map<String, String> dot = DotEnv.findAndLoad();

        String uri = firstNonBlank(
                System.getenv("MONGODB_URI"),
                System.getProperty("mongodb.uri"),
                dot.get("MONGODB_URI"));
        if (uri == null || uri.isBlank()) {
            throw new IllegalStateException(
                    "Defina MONGODB_URI: variable de entorno, archivo .env en la raíz del proyecto, "
                            + "o -Dmongodb.uri=... (al ejecutar con gradlew run, Gradle también puede cargar .env).");
        }
        uri = uri.trim();

        String dbName = firstNonBlank(System.getenv("MONGODB_DATABASE"), dot.get("MONGODB_DATABASE"));
        if (dbName == null || dbName.isBlank()) {
            dbName = "encuesta_proyecto2";
        } else {
            dbName = dbName.trim();
        }

        String portRaw = firstNonBlank(System.getenv("SERVER_PORT"), dot.get("SERVER_PORT"));
        if (portRaw == null || portRaw.isBlank()) {
            portRaw = "7000";
        }
        int port = parsePort(portRaw.trim());

        return new AppConfig(uri, dbName, port);
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }

    private static int parsePort(String raw) {
        try {
            int p = Integer.parseInt(raw.trim());
            if (p < 1 || p > 65535) {
                throw new IllegalArgumentException("Puerto fuera de rango");
            }
            return p;
        } catch (NumberFormatException e) {
            throw new IllegalStateException("SERVER_PORT inválido: " + raw, e);
        }
    }

    public String getMongoUri() {
        return mongoUri;
    }

    public String getDatabaseName() {
        return databaseName;
    }

    public int getServerPort() {
        return serverPort;
    }
}
