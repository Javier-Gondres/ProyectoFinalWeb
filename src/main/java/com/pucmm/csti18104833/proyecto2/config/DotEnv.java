package com.pucmm.csti18104833.proyecto2.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Lee variables KEY=valor desde un archivo .env en la raíz del proyecto (UTF-8, sin dependencias).
 * El IDE suele ejecutar el main sin pasar por {@code gradlew run}, donde Gradle inyecta el .env.
 */
public final class DotEnv {

    private DotEnv() {}

    /**
     * Busca .env desde el directorio de trabajo actual y carpetas padre (útil si el IDE no usa la raíz del proyecto).
     */
    public static Map<String, String> findAndLoad() {
        Path dir = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        for (int i = 0; i < 8; i++) {
            Path env = dir.resolve(".env");
            if (Files.isRegularFile(env)) {
                return load(env);
            }
            if (dir.getParent() == null) {
                break;
            }
            dir = dir.getParent();
        }
        return Map.of();
    }

    public static Map<String, String> load(Path path) {
        if (!Files.isRegularFile(path)) {
            return Map.of();
        }
        Map<String, String> map = new LinkedHashMap<>();
        try {
            var lines = Files.readAllLines(path, StandardCharsets.UTF_8);
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                if (i == 0 && !line.isEmpty() && line.charAt(0) == '\uFEFF') {
                    line = line.substring(1).trim();
                }
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int eq = line.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = line.substring(0, eq).trim();
                String val = line.substring(eq + 1).trim();
                if (val.length() >= 2
                        && ((val.startsWith("\"") && val.endsWith("\""))
                                || (val.startsWith("'") && val.endsWith("'")))) {
                    val = val.substring(1, val.length() - 1);
                }
                map.put(key, val);
            }
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer " + path.toAbsolutePath(), e);
        }
        return map;
    }
}
