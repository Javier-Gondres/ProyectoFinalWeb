package com.pucmm.csti18104833.proyecto2.auth;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Projections;
import com.mongodb.client.model.Sorts;
import com.mongodb.client.model.Updates;
import com.pucmm.csti18104833.proyecto2.mongo.MongoCollections;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.mindrot.jbcrypt.BCrypt;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

public final class UsuarioService {

    public static final String ROL_ENCUESTADOR = "ENCUESTADOR";
    public static final String ROL_ADMIN = "ADMIN";
    /** Puede gestionar roles de cualquier usuario (incluidos otros ADMIN). */
    public static final String ROL_SUPER_ADMIN = "SUPER_ADMIN";

    /** Ve todos los formularios como ADMIN. */
    public static boolean esRolGestorFormularios(String rol) {
        return ROL_ADMIN.equals(rol) || ROL_SUPER_ADMIN.equals(rol);
    }

    /** Puede acceder a /api/admin (listar usuarios, etc.). */
    public static boolean esRolStaffAdministracion(String rol) {
        return ROL_ADMIN.equals(rol) || ROL_SUPER_ADMIN.equals(rol);
    }

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

    // Registro publico: asigna rol ENCUESTADOR si existe en la coleccion roles.
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
        if (!opt.isPresent()) {
            return Optional.empty();
        }
        Document docLogin = opt.get();
        if (!BCrypt.checkpw(password, docLogin.getString("passwordHash"))) {
            return Optional.empty();
        }
        AuthPrincipal ap = new AuthPrincipal(
                docLogin.getObjectId("_id"),
                docLogin.getString("username"),
                docLogin.getString("rol"));
        return Optional.of(ap);
    }

    public Optional<AuthPrincipal> buscarPrincipalPorId(ObjectId id) {
        Document docUsuario = usuarios.find(Filters.eq("_id", id)).first();
        if (docUsuario == null) {
            return Optional.empty();
        }
        AuthPrincipal bp = new AuthPrincipal(
                docUsuario.getObjectId("_id"),
                docUsuario.getString("username"),
                docUsuario.getString("rol"));
        return Optional.of(bp);
    }

    // Listado para administracion sin passwordHash.
    public List<Document> listarUsuariosParaAdmin() {
        List<Document> out = new ArrayList<>();
        usuarios.find()
                .sort(Sorts.ascending("username"))
                .projection(Projections.include("_id", "username", "nombre", "rol", "creadoEn"))
                .into(out);
        return out;
    }

    /**
     * Cambia el rol. Solo {@link #ROL_SUPER_ADMIN} puede modificar roles; no puede cambiar el suyo propio.
     * No se permite asignar ni modificar cuentas con rol {@link #ROL_SUPER_ADMIN} por este endpoint.
     * No deja el sistema sin ningún usuario con rol ADMIN o SUPER_ADMIN (salvo el propio cambio).
     */
    public Document actualizarRol(ObjectId usuarioId, String nuevoRol, AuthPrincipal actor) {
        if (!existeNombreRol(nuevoRol)) {
            throw new IllegalArgumentException("Rol desconocido. Use un nombre definido en la colección roles.");
        }
        if (!ROL_SUPER_ADMIN.equals(actor.rol())) {
            throw new IllegalArgumentException("Solo SUPER_ADMIN puede modificar roles.");
        }
        if (usuarioId.equals(actor.id())) {
            throw new IllegalArgumentException("Un SUPER_ADMIN no puede modificar su propio rol.");
        }
        Document actual = usuarios.find(Filters.eq("_id", usuarioId)).first();
        if (actual == null) {
            throw new IllegalArgumentException("Usuario no encontrado.");
        }
        String anterior = actual.getString("rol");
        if (anterior != null && anterior.equals(nuevoRol)) {
            return actual;
        }
        if (ROL_SUPER_ADMIN.equals(nuevoRol)) {
            throw new IllegalArgumentException("No se permite asignar el rol SUPER_ADMIN desde este endpoint.");
        }
        if (ROL_SUPER_ADMIN.equals(anterior)) {
            throw new IllegalArgumentException("No se permite modificar el rol de un usuario SUPER_ADMIN.");
        }
        if (esRolGestorFormularios(anterior) && !esRolGestorFormularios(nuevoRol)) {
            long otrosGestores = usuarios.countDocuments(Filters.and(
                    Filters.in("rol", List.of(ROL_ADMIN, ROL_SUPER_ADMIN)),
                    Filters.ne("_id", usuarioId)));
            if (otrosGestores == 0) {
                throw new IllegalArgumentException(
                        "Debe existir al menos otro usuario con rol ADMIN o SUPER_ADMIN aparte de este.");
            }
        }
        usuarios.updateOne(Filters.eq("_id", usuarioId), Updates.set("rol", nuevoRol));
        Document post = usuarios.find(Filters.eq("_id", usuarioId)).first();
        if (post == null) {
            throw new IllegalArgumentException("Usuario actualizado no encontrado.");
        }
        return post;
    }
}
