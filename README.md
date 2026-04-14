# Proyecto 2

URL de la pagina: https://app.jgdeveloper.me/index.html

Video: https://youtu.be/d7qsNf8TC84

Link del repo: https://github.com/Javier-Gondres/ProyectoFinalWeb

## Configuracion del entorno

Crear archivo `.env` en la raiz del proyecto con al menos:

MONGODB_URI=tu_uri_de_mongodb
MONGODB_DATABASE=encuesta_proyecto2
SERVER_PORT=7000
GRPC_PORT=7070
JWT_SECRET=minimo_32_caracteres
JWT_EXPIRES_HOURS=24
SUPER_ADMIN_BOOTSTRAP_USERNAME=superadmin
SUPER_ADMIN_BOOTSTRAP_PASSWORD=clave_segura

## Para correr la app local: 

.\gradlew.bat run

para correr el grpc: docker compose -f scripts/grpc-web/docker-compose.yml up -d

## Docker Compose

Para correrlo en el docker:

```powershell
docker compose up -d --build
```


