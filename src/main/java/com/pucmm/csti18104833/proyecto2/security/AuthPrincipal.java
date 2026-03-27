package com.pucmm.csti18104833.proyecto2.security;

import org.bson.types.ObjectId;

public record AuthPrincipal(ObjectId id, String username, String rol) {

    public String idHex() {
        return id.toHexString();
    }
}
