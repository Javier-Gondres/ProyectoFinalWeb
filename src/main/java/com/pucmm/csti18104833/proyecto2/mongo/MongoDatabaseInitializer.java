package com.pucmm.csti18104833.proyecto2.mongo;

import com.pucmm.csti18104833.proyecto2.config.DotEnv;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import org.bson.Document;
import org.mindrot.jbcrypt.BCrypt;

import java.util.Date;
import java.util.List;
import java.util.Map;


public final class MongoDatabaseInitializer {

    private MongoDatabaseInitializer() {}

    public static void initialize(MongoDatabase db) {
        seedRoles(db);
        seedBootstrapAdmin(db);
        ensureUsuariosIndexes(db);
        ensureFormulariosIndexes(db);
    }

    private static void seedRoles(MongoDatabase db) {
        MongoCollection<Document> roles = db.getCollection(MongoCollections.ROLES);
        roles.createIndex(Indexes.ascending("nombre"), new IndexOptions().unique(true));
        if (roles.estimatedDocumentCount() > 0) {
            return;
        }
        roles.insertMany(List.of(
                new Document("nombre", "ADMIN").append("descripcion", "Administración"),
                new Document("nombre", "ENCUESTADOR").append("descripcion", "Levantamiento de encuestas")
        ));
    }

    /**
     * Opcional: si existen {@code ADMIN_BOOTSTRAP_USERNAME} y {@code ADMIN_BOOTSTRAP_PASSWORD}
     * en el entorno y aún no hay un usuario con ese nombre, crea un ADMIN (solo arranque).
     */
    private static void seedBootstrapAdmin(MongoDatabase db) {
        Map<String, String> dot = DotEnv.findAndLoad();
        String rawUser = firstNonBlank(System.getenv("ADMIN_BOOTSTRAP_USERNAME"), dot.get("ADMIN_BOOTSTRAP_USERNAME"));
        String rawPass = firstNonBlank(System.getenv("ADMIN_BOOTSTRAP_PASSWORD"), dot.get("ADMIN_BOOTSTRAP_PASSWORD"));
        if (rawUser == null || rawUser.isBlank() || rawPass == null || rawPass.isBlank()) {
            return;
        }
        String username = rawUser.trim().toLowerCase();
        if (username.length() < 3) {
            return;
        }
        MongoCollection<Document> usuarios = db.getCollection(MongoCollections.USUARIOS);
        if (usuarios.find(Filters.eq("username", username)).first() != null) {
            return;
        }
        String hash = BCrypt.hashpw(rawPass, BCrypt.gensalt(12));
        usuarios.insertOne(new Document("username", username)
                .append("passwordHash", hash)
                .append("nombre", username)
                .append("rol", "ADMIN")
                .append("creadoEn", new Date()));
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a.trim();
        }
        if (b != null && !b.isBlank()) {
            return b.trim();
        }
        return null;
    }

    private static void ensureUsuariosIndexes(MongoDatabase db) {
        MongoCollection<Document> usuarios = db.getCollection(MongoCollections.USUARIOS);
        usuarios.createIndex(Indexes.ascending("username"), new IndexOptions().unique(true));
    }

    private static void ensureFormulariosIndexes(MongoDatabase db) {
        MongoCollection<Document> formularios = db.getCollection(MongoCollections.FORMULARIOS);
        formularios.createIndex(Indexes.ascending("usuarioId"));
        formularios.createIndex(Indexes.compoundIndex(Indexes.ascending("usuarioId"), Indexes.descending("creadoEn")));
    }
}
