package com.pucmm.csti18104833.proyecto2.grpc;

import org.bson.Document;

import java.util.Date;

final class FormularioProtoMapper {

    private FormularioProtoMapper() {}

    static Formulario toProto(Document d) {
        Formulario.Builder b = Formulario.newBuilder()
                .setId(d.getObjectId("_id").toHexString())
                .setUsuarioRegistroId(d.getObjectId("usuarioRegistroId").toHexString())
                .setUsuarioRegistroUsername(safeString(d, "usuarioRegistroUsername"))
                .setNombre(safeString(d, "nombre"))
                .setSector(safeString(d, "sector"))
                .setNivelEscolar(safeString(d, "nivelEscolar"))
                .setLatitud(d.getDouble("latitud"))
                .setLongitud(d.getDouble("longitud"));
        if (d.containsKey("imagenBase64")) {
            Object img = d.get("imagenBase64");
            b.setImagenBase64(img != null ? img.toString() : "");
        } else {
            b.setImagenBase64("");
        }
        Date creado = d.getDate("creadoEn");
        if (creado != null) {
            b.setCreadoEnMillis(creado.getTime());
        }
        return b.build();
    }

    private static String safeString(Document d, String key) {
        Object v = d.get(key);
        return v != null ? v.toString() : "";
    }
}
