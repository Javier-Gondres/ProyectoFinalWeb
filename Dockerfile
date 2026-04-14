FROM gradle:8.7-jdk17 AS builder
WORKDIR /workspace

COPY build.gradle settings.gradle ./
COPY gradle gradle
COPY src src

RUN gradle --no-daemon fatJar

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=builder /workspace/build/libs/*-all.jar /app/proyecto2.jar

EXPOSE 7000 7070

ENTRYPOINT ["java", "-jar", "/app/proyecto2.jar"]
