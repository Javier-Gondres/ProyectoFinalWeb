package com.pucmm.csti18104833.proyecto2.grpc;

import com.pucmm.csti18104833.proyecto2.domain.NivelEscolar;
import com.pucmm.csti18104833.proyecto2.formulario.FormularioService;
import com.pucmm.csti18104833.proyecto2.security.AuthPrincipal;
import io.grpc.Context;
import io.grpc.Status;
import io.grpc.stub.StreamObserver;
import org.bson.Document;

public final class EncuestaGrpcServiceImpl extends EncuestaServiceGrpc.EncuestaServiceImplBase {

    private final FormularioService formularioService;

    public EncuestaGrpcServiceImpl(FormularioService formularioService) {
        this.formularioService = formularioService;
    }

    @Override
    public void listarFormularios(
            ListarFormulariosRequest request,
            StreamObserver<ListarFormulariosReply> responseObserver) {
        AuthPrincipal p = principalActual();
        if (p == null) {
            responseObserver.onError(Status.INTERNAL.withDescription("contexto sin usuario").asRuntimeException());
            return;
        }
        try {
            boolean incluirImagen = request.getIncluirImagenBase64();
            int page = request.getPage() <= 0 ? 1 : request.getPage();
            int pageSize =
                    request.getPageSize() <= 0
                            ? FormularioService.LISTA_PAGE_SIZE_DEFAULT
                            : request.getPageSize();
            FormularioService.FormularioListadoPaginado listado =
                    formularioService.listarVisiblePorPaginado(p, incluirImagen, page, pageSize);
            ListarFormulariosReply.Builder reply = ListarFormulariosReply.newBuilder();
            for (Document d : listado.items()) {
                reply.addFormularios(FormularioProtoMapper.toProto(d));
            }
            reply.setTotal(listado.total());
            reply.setPage(listado.page());
            reply.setPageSize(listado.pageSize());
            responseObserver.onNext(reply.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void crearFormulario(
            CrearFormularioRequest request,
            StreamObserver<CrearFormularioReply> responseObserver) {
        AuthPrincipal p = principalActual();
        if (p == null) {
            responseObserver.onError(Status.INTERNAL.withDescription("contexto sin usuario").asRuntimeException());
            return;
        }
        var nivelOpt = NivelEscolar.parse(request.getNivelEscolar());
        if (nivelOpt.isEmpty()) {
            responseObserver.onError(
                    Status.INVALID_ARGUMENT.withDescription(
                            "nivel_escolar inválido (use BASICO, MEDIO, GRADO_UNIVERSITARIO, POSTGRADO, DOCTORADO)")
                    .asRuntimeException());
            return;
        }
        try {
            Document guardado = formularioService.crear(
                    p,
                    request.getNombre(),
                    request.getSector(),
                    nivelOpt.get(),
                    request.getLatitud(),
                    request.getLongitud(),
                    request.getImagenBase64());
            responseObserver.onNext(
                    CrearFormularioReply.newBuilder()
                            .setFormulario(FormularioProtoMapper.toProto(guardado))
                            .build());
            responseObserver.onCompleted();
        } catch (IllegalArgumentException e) {
            responseObserver.onError(Status.INVALID_ARGUMENT.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    private static AuthPrincipal principalActual() {
        return GrpcAuthContext.PRINCIPAL.get(Context.current());
    }
}
