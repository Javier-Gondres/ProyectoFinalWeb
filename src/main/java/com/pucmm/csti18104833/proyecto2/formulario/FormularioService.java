package com.pucmm.csti18104833.proyecto2.formulario;

import com.mongodb.client.FindIterable;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import com.pucmm.csti18104833.proyecto2.auth.UsuarioService;
import com.pucmm.csti18104833.proyecto2.domain.NivelEscolar;
import com.pucmm.csti18104833.proyecto2.mongo.MongoCollections;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

public final class FormularioService {

    public static final int LISTA_PAGE_SIZE_DEFAULT = 10;
    public static final int LISTA_PAGE_SIZE_MAX = 100;

    private final MongoCollection<Document> formularios;

    public FormularioService(MongoDatabase db) {
        this.formularios = db.getCollection(MongoCollections.FORMULARIOS);
    }

    public Document crear(
            AuthPrincipal autor,
            String nombre,
            String sector,
            NivelEscolar nivel,
            double latitud,
            double longitud,
            String imagenBase64) {
        validarGeo(latitud, longitud);
        validarTexto("nombre", nombre, 200);
        validarTexto("sector", sector, 200);
        if (imagenBase64 == null || imagenBase64.isBlank()) {
            throw new IllegalArgumentException("imagenBase64 es obligatoria.");
        }
        if (imagenBase64.length() > 12_000_000) {
            throw new IllegalArgumentException("imagenBase64 demasiado grande (máx. ~12 MB en texto base64).");
        }

        Date ahora = new Date();
        Document doc = new Document("usuarioRegistroId", autor.id())
                .append("usuarioRegistroUsername", autor.username())
                .append("nombre", nombre.trim())
                .append("sector", sector.trim())
                .append("nivelEscolar", nivel.apiValue())
                .append("latitud", latitud)
                .append("longitud", longitud)
                .append("imagenBase64", imagenBase64.trim())
                .append("creadoEn", ahora);
        formularios.insertOne(doc);
        return doc;
    }

    private static void validarGeo(double lat, double lon) {
        if (lat < -90 || lat > 90 || Double.isNaN(lat)) {
            throw new IllegalArgumentException("latitud debe estar entre -90 y 90.");
        }
        if (lon < -180 || lon > 180 || Double.isNaN(lon)) {
            throw new IllegalArgumentException("longitud debe estar entre -180 y 180.");
        }
    }

    private static void validarTexto(String campo, String valor, int max) {
        if (valor == null || valor.isBlank()) {
            throw new IllegalArgumentException(campo + " es obligatorio.");
        }
        if (valor.length() > max) {
            throw new IllegalArgumentException(campo + " excede " + max + " caracteres.");
        }
    }

    /**
     * Listado paginado según rol (ADMIN y SUPER_ADMIN ven todo; resto solo lo propio).
     *
     * @param page página 1-based
     * @param pageSize tamaño (se limita a {@link #LISTA_PAGE_SIZE_MAX})
     * @param incluirImagenBase64 si false, excluye el campo imagenBase64 de cada documento.
     */
    public FormularioListadoPaginado listarVisiblePorPaginado(
            AuthPrincipal viewer, boolean incluirImagenBase64, int page, int pageSize) {
        int p = Math.max(1, page);
        int ps = Math.min(Math.max(1, pageSize), LISTA_PAGE_SIZE_MAX);
        Bson filtro = UsuarioService.esRolGestorFormularios(viewer.rol())
                ? null
                : Filters.eq("usuarioRegistroId", viewer.id());
        long total = filtro == null ? formularios.countDocuments() : formularios.countDocuments(filtro);
        List<Document> out = new ArrayList<>();
        FindIterable<Document> query = filtro == null ? formularios.find() : formularios.find(filtro);
        if (!incluirImagenBase64) {
            query = query.projection(new Document("imagenBase64", 0));
        }
        int skip = (p - 1) * ps;
        query.sort(Sorts.descending("creadoEn")).skip(skip).limit(ps).into(out);
        return new FormularioListadoPaginado(out, total, p, ps);
    }

    public record FormularioListadoPaginado(List<Document> items, long total, int page, int pageSize) {}

    public Optional<Document> buscarPorId(ObjectId id) {
        return Optional.ofNullable(formularios.find(Filters.eq("_id", id)).first());
    }

    public boolean puedeVer(AuthPrincipal viewer, Document formulario) {
        if (UsuarioService.esRolGestorFormularios(viewer.rol())) {
            return true;
        }
        return formulario.getObjectId("usuarioRegistroId").equals(viewer.id());
    }
}
