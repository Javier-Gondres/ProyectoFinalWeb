package com.pucmm.csti18104833.proyecto2.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LoginBody(String username, String password) {}
