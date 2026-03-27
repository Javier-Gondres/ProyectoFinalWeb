package com.pucmm.csti18104833.proyecto2.config;

import java.util.Map;


public final class AppConfig {

    private final String mongoUri;
    private final String databaseName;
    private final int serverPort;
    private final String jwtSecret;
    /** Validez del token en milisegundos. */
    private final long jwtExpirationMs;

    private AppConfig(
            String mongoUri,
            String databaseName,
            int serverPort,
            String jwtSecret,
            long jwtExpirationMs) {
        this.mongoUri = mongoUri;
        this.databaseName = databaseName;
        this.serverPort = serverPort;
        this.jwtSecret = jwtSecret;
        this.jwtExpirationMs = jwtExpirationMs;
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

        String jwtSecret = firstNonBlank(
                System.getenv("JWT_SECRET"),
                dot.get("JWT_SECRET"),
                "dev-only-cambiar-con-JWT_SECRET-min-32-caracteres!!");
        if (jwtSecret.length() < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET debe tener al menos 32 caracteres (256 bits) para HS256.");
        }
        long jwtExpirationMs = parseExpirationHours(
                firstNonBlank(System.getenv("JWT_EXPIRES_HOURS"), dot.get("JWT_EXPIRES_HOURS"), "24"));

        return new AppConfig(uri, dbName, port, jwtSecret, jwtExpirationMs);
    }

    private static long parseExpirationHours(String raw) {
        try {
            double h = Double.parseDouble(raw.trim().replace(',', '.'));
            if (h <= 0 || h > 24 * 365) {
                throw new IllegalArgumentException("fuera de rango");
            }
            return Math.round(h * 60 * 60 * 1000);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("JWT_EXPIRES_HOURS inválido: " + raw, e);
        }
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

    public String getJwtSecret() {
        return jwtSecret;
    }

    public long getJwtExpirationMs() {
        return jwtExpirationMs;
    }
}
