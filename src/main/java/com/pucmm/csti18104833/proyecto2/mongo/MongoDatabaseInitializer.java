package com.pucmm.csti18104833.proyecto2.mongo;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import org.bson.Document;

import java.util.List;


public final class MongoDatabaseInitializer {

    private MongoDatabaseInitializer() {}

    public static void initialize(MongoDatabase db) {
        seedRoles(db);
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

    private static void ensureFormulariosIndexes(MongoDatabase db) {
        MongoCollection<Document> formularios = db.getCollection(MongoCollections.FORMULARIOS);
        formularios.createIndex(Indexes.ascending("usuarioId"));
        formularios.createIndex(Indexes.compoundIndex(Indexes.ascending("usuarioId"), Indexes.descending("creadoEn")));
    }
}
