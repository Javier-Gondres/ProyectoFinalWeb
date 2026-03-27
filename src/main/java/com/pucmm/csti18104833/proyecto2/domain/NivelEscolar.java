package com.pucmm.csti18104833.proyecto2.domain;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;

/**
 * Niveles del enunciado: Básico, Medio, Grado Universitario, Postgrado, Doctorado.
 */
public enum NivelEscolar {
    BASICO,
    MEDIO,
    GRADO_UNIVERSITARIO,
    POSTGRADO,
    DOCTORADO;

    /** Valor almacenado en MongoDB y en JSON de la API. */
    public String apiValue() {
        return name();
    }

    public static Optional<NivelEscolar> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String n = Normalizer.normalize(raw.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toUpperCase(Locale.ROOT)
                .replace(' ', '_');
        n = n.replace("GRADO_", "");
        if ("UNIVERSITARIO".equals(n)) {
            n = "GRADO_UNIVERSITARIO";
        }
        try {
            return Optional.of(NivelEscolar.valueOf(n));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
