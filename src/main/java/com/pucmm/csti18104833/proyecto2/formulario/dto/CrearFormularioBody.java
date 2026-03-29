package com.pucmm.csti18104833.proyecto2.formulario.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CrearFormularioBody(
        String nombre,
        String sector,
        String nivelEscolar,
        Double latitud,
        Double longitud,
        String imagenBase64) {}
