package com.pucmm.csti18104833.proyecto2;

import io.javalin.Javalin;

public class Proyecto2Application {

    public static void main(String[] args) {
        Javalin app = Javalin.create(config -> {

        });

        app.get("/", ctx -> ctx.result("Hello World"));

        app.start(7000);
    }
}
