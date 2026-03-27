package com.pucmm.csti18104833.proyecto2.auth;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.pucmm.csti18104833.proyecto2.mongo.MongoCollections;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.mindrot.jbcrypt.BCrypt;

import java.util.Date;
import java.util.Optional;

public final class UsuarioService {

    public static final String ROL_ENCUESTADOR = "ENCUESTADOR";
    public static final String ROL_ADMIN = "ADMIN";

    private final MongoCollection<Document> usuarios;
    private final MongoCollection<Document> roles;

    public UsuarioService(MongoDatabase db) {
        this.usuarios = db.getCollection(MongoCollections.USUARIOS);
        this.roles = db.getCollection(MongoCollections.ROLES);
    }

    public boolean existeNombreRol(String nombreRol) {
        return roles.find(Filters.eq("nombre", nombreRol)).first() != null;
    }

    public Optional<Document> buscarPorUsername(String username) {
        Document doc = usuarios.find(Filters.eq("username", username.trim().toLowerCase())).first();
        return Optional.ofNullable(doc);
    }

    /**
     * Registro público: siempre asigna rol {@link #ROL_ENCUESTADOR} si existe en la colección roles.
     */
    public AuthPrincipal registrar(String username, String password, String nombreVisible) {
        if (!existeNombreRol(ROL_ENCUESTADOR)) {
            throw new IllegalStateException("Rol ENCUESTADOR no está definido en la base.");
        }
        String user = username.trim().toLowerCase();
        if (user.length() < 3 || user.length() > 64) {
            throw new IllegalArgumentException("Usuario: entre 3 y 64 caracteres.");
        }
        if (password.length() < 6) {
            throw new IllegalArgumentException("Contraseña: mínimo 6 caracteres.");
        }
        if (buscarPorUsername(user).isPresent()) {
            throw new IllegalArgumentException("Ya existe un usuario con ese nombre.");
        }

        String hash = BCrypt.hashpw(password, BCrypt.gensalt(12));
        Date ahora = new Date();
        Document doc = new Document("username", user)
                .append("passwordHash", hash)
                .append("nombre", nombreVisible == null || nombreVisible.isBlank() ? user : nombreVisible.trim())
                .append("rol", ROL_ENCUESTADOR)
                .append("creadoEn", ahora);
        usuarios.insertOne(doc);
        ObjectId id = doc.getObjectId("_id");
        return new AuthPrincipal(id, user, ROL_ENCUESTADOR);
    }

    public Optional<AuthPrincipal> autenticar(String username, String password) {
        Optional<Document> opt = buscarPorUsername(username);
        if (opt.isEmpty()) {
            return Optional.empty();
        }
        Document u = opt.get();
        if (!BCrypt.checkpw(password, u.getString("passwordHash"))) {
            return Optional.empty();
        }
        return Optional.of(new AuthPrincipal(
                u.getObjectId("_id"),
                u.getString("username"),
                u.getString("rol")));
    }

    public Optional<AuthPrincipal> buscarPrincipalPorId(ObjectId id) {
        Document u = usuarios.find(Filters.eq("_id", id)).first();
        if (u == null) {
            return Optional.empty();
        }
        return Optional.of(new AuthPrincipal(
                u.getObjectId("_id"),
                u.getString("username"),
                u.getString("rol")));
    }
}
