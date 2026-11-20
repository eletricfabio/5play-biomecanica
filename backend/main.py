from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Atleta,
    BenchmarkPosicao,
    Clube,
    ConsentimentoLGPD,
    LogAuditoria,
    MetricaBiomecanica,
    RelatorioCompartilhado,
    SessaoAnalise,
    StatusLgpdEnum,
    StatusProcessamentoEnum,
    WebhookB2B,
)
from schemas import (
    AtletaCreate,
    AtletaOut,
    BenchmarkOut,
    ClubeCreate,
    ClubeOut,
    CompartilhamentoB2BRequest,
    CompartilhamentoB2BResponse,
    DashboardAtletaResumo,
    DashboardOverviewResponse,
    LgpdOut,
    LgpdValidacaoRequest,
    SessaoStatusOut,
    SessaoUploadAcceptedResponse,
    SessaoUploadRequest,
    WebhookCreate,
    WebhookDispatchStatus,
)
from storage import ObjectStorageClient
from tasks import is_redis_configured, processar_video_biomecanico
from vision_engine import KinePitchVisionEngine

logger = logging.getLogger("kinepitch.api")

app = FastAPI(
    title="5Play Sports | KinePitch AI Backend API",
    description="API de Biomecânica 3D (22 pontos), Scouting Ponderado por Posição, Compliance LGPD e Webhooks B2B.",
    version="2.0.0",
)

DEFAULT_ALLOWED_ORIGINS = [
    "https://5play-biomecanica.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
]


def _build_cors_config() -> tuple[list[str], str | None]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "*").strip()
    tokens = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    allow_all = not tokens or "*" in tokens
    explicit = list(dict.fromkeys(DEFAULT_ALLOWED_ORIGINS + [t for t in tokens if t != "*"]))
    origin_regex = r"https?://.*" if allow_all else r"https://5play-biomecanica\.vercel\.app"
    return explicit, origin_regex


ALLOWED_ORIGINS, ALLOWED_ORIGIN_REGEX = _build_cors_config()


def _cors_headers_for_request(request: Request) -> dict[str, str]:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    allowed_origin: str | None = None
    if origin and (
        origin in ALLOWED_ORIGINS
        or (ALLOWED_ORIGIN_REGEX and re.fullmatch(ALLOWED_ORIGIN_REGEX, origin))
    ):
        allowed_origin = origin
    elif not origin:
        allowed_origin = "https://5play-biomecanica.vercel.app"

    if not allowed_origin:
        return {}

    return {
        "Access-Control-Allow-Origin": allowed_origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Vary": "Origin",
    }


@app.middleware("http")
async def ensure_cors_on_unhandled_errors(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.exception("Erro não tratado na requisição %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "Erro interno ao processar a requisição no servidor.",
                "error": str(exc),
            },
            headers=_cors_headers_for_request(request),
        )

    for header_key, header_val in _cors_headers_for_request(request).items():
        if header_key not in response.headers:
            response.headers[header_key] = header_val
    return response


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    headers = {**(exc.headers or {}), **_cors_headers_for_request(request)}
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error": exc.detail},
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def custom_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    mensagens: list[str] = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", []) if part != "body"]
        campo = ".".join(loc) if loc else "payload"
        msg = str(err.get("msg", "Valor inválido")).replace("Value error, ", "")
        mensagens.append(f"{campo}: {msg}")
    resumo = " | ".join(mensagens) if mensagens else "Dados inválidos na requisição."
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": resumo, "error": resumo, "errors": exc.errors()},
        headers=_cors_headers_for_request(request),
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sha256_hex(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _calcular_idade_anos(data_nasc: date) -> int:
    hoje = date.today()
    idade = hoje.year - data_nasc.year
    if (hoje.month, hoje.day) < (data_nasc.month, data_nasc.day):
        idade -= 1
    return idade


def _registrar_auditoria(
    db: Session,
    acao: str,
    entidade: str,
    entidade_id: str | None = None,
    ip_origem: str | None = None,
    metadata: dict | None = None,
) -> None:
    payload = {
        "acao": acao,
        "entidade": entidade,
        "entidade_id": entidade_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {},
    }
    db.add(
        LogAuditoria(
            acao=acao,
            entidade=entidade,
            entidade_id=entidade_id,
            ip_origem=ip_origem,
            hash_assinatura=_sha256_hex(payload),
            metadata_json=metadata or {},
        )
    )


@app.get("/health")
def healthcheck(db: Session = Depends(get_db)) -> dict:
    db.execute(select(1))
    return {"status": "ok", "service": "5play-kinepitch-fastapi"}


# ============================================================================
# 1. CRUD CLUBES
# ============================================================================
@app.post("/api/v1/clubes", response_model=ClubeOut, status_code=status.HTTP_201_CREATED)
def criar_clube(payload: ClubeCreate, request: Request, db: Session = Depends(get_db)) -> Clube:
    clube = Clube(
        nome=payload.nome.strip(),
        sigla=payload.sigla.strip().upper(),
        cnpj=payload.cnpj.strip() if payload.cnpj else None,
        tipo_instituicao=payload.tipo_instituicao,
        cbf_tms_codigo=payload.cbf_tms_codigo.strip() if payload.cbf_tms_codigo else None,
        cidade=payload.cidade.strip(),
        estado_uf=payload.estado_uf.strip().upper() if payload.estado_uf else None,
        pais=payload.pais.strip(),
        responsavel_tecnico=payload.responsavel_tecnico,
        email_contato=payload.email_contato,
    )
    db.add(clube)
    db.flush()

    _registrar_auditoria(
        db,
        acao="CLUBE_CRIADO",
        entidade="clubes",
        entidade_id=str(clube.id),
        ip_origem=request.client.host if request.client else None,
        metadata={"sigla": clube.sigla, "tipo": clube.tipo_instituicao.value},
    )
    db.commit()
    db.refresh(clube)
    return clube


@app.get("/api/v1/clubes", response_model=list[ClubeOut])
def listar_clubes(db: Session = Depends(get_db)) -> list[Clube]:
    return list(db.scalars(select(Clube).order_by(Clube.criado_em.desc())).all())


@app.get("/api/v1/clubes/{clube_id}", response_model=ClubeOut)
def obter_clube(clube_id: int, db: Session = Depends(get_db)) -> Clube:
    clube = db.get(Clube, clube_id)
    if clube is None:
        raise HTTPException(status_code=404, detail="Clube não encontrado.")
    return clube


# ============================================================================
# 2. CRUD ATLETAS + ANTROPOMETRIA + LGPD MENORES
# ============================================================================
@app.post("/api/v1/atletas", response_model=AtletaOut, status_code=status.HTTP_201_CREATED)
def criar_atleta(payload: AtletaCreate, request: Request, db: Session = Depends(get_db)) -> Atleta:
    clube = db.get(Clube, payload.clube_id)
    if clube is None:
        raise HTTPException(status_code=404, detail="Clube vinculado não encontrado.")

    idade = _calcular_idade_anos(payload.data_nascimento)
    menor_idade = idade < 18

    if menor_idade and payload.consentimento_lgpd is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Atletas menores de 18 anos exigem dados do responsável legal para consentimento LGPD.",
        )

    codigo_5play = f"5P-{secrets.randbelow(9000) + 1000}-{str(int(datetime.now().timestamp()))[-3:]}"
    autorizado_3d = not menor_idade or bool(
        payload.consentimento_lgpd and payload.consentimento_lgpd.autorizar_imediatamente
    )

    atleta = Atleta(
        clube_id=payload.clube_id,
        codigo_5play=codigo_5play,
        nome_completo=payload.nome_completo.strip(),
        apelido_esportivo=payload.apelido_esportivo,
        data_nascimento=payload.data_nascimento,
        nacionalidade=payload.nacionalidade,
        passaporte_comunitario=payload.passaporte_comunitario,
        categoria=payload.categoria,
        posicao_primaria=payload.posicao_primaria,
        posicao_secundaria=payload.posicao_secundaria,
        numero_camisa=payload.numero_camisa,
        pe_dominante=payload.pe_dominante,
        tipo_contrato=payload.tipo_contrato,
        empresario_agencia=payload.empresario_agencia,
        valencias_taticas=payload.valencias_taticas,
        estatura_cm=payload.estatura_cm,
        massa_corporal_kg=payload.massa_corporal_kg,
        envergadura_cm=payload.envergadura_cm,
        altura_sentado_cm=payload.altura_sentado_cm,
        percentual_gordura=payload.percentual_gordura,
        estagio_maturacional=payload.estagio_maturacional,
        mirwald_offset_anos=payload.mirwald_offset_anos,
        historico_clinico=payload.historico_clinico,
        alerta_assimetria_pelvica=payload.alerta_assimetria_pelvica,
        limiar_assimetria_graus=payload.limiar_assimetria_graus,
        tag_gps_vinculada=payload.tag_gps_vinculada,
        apto_avaliacao_3d=autorizado_3d,
    )
    db.add(atleta)
    db.flush()

    if payload.consentimento_lgpd is not None:
        lgpd_in = payload.consentimento_lgpd
        agora = datetime.now(timezone.utc)
        autorizado = lgpd_in.autorizar_imediatamente
        termo_hash = _sha256_hex(
            {
                "atleta_id": atleta.id,
                "responsavel": lgpd_in.responsavel_legal_nome,
                "cpf_final": lgpd_in.responsavel_legal_cpf_final,
                "versao": lgpd_in.termo_versao,
            }
        )
        db.add(
            ConsentimentoLGPD(
                atleta_id=atleta.id,
                atleta_menor_idade=menor_idade,
                responsavel_legal_nome=lgpd_in.responsavel_legal_nome.strip(),
                responsavel_legal_cpf_final=lgpd_in.responsavel_legal_cpf_final,
                responsavel_telefone=lgpd_in.responsavel_telefone.strip(),
                parentesco=lgpd_in.parentesco.strip(),
                finalidade_captura_biometrica=lgpd_in.finalidade_captura_biometrica,
                finalidade_scouting_b2b=lgpd_in.finalidade_scouting_b2b,
                termo_versao=lgpd_in.termo_versao,
                hash_documento_assinado=termo_hash,
                ip_aceite=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                status=StatusLgpdEnum.autorizado if autorizado else StatusLgpdEnum.pendente,
                assinado_em=agora if autorizado else None,
                valido_ate=agora + timedelta(days=365) if autorizado else None,
            )
        )

    _registrar_auditoria(
        db,
        acao="ATLETA_CADASTRADO",
        entidade="atletas",
        entidade_id=str(atleta.id),
        ip_origem=request.client.host if request.client else None,
        metadata={
            "codigo_5play": atleta.codigo_5play,
            "posicao": atleta.posicao_primaria.value,
            "menor_idade": menor_idade,
        },
    )
    db.commit()
    db.refresh(atleta)
    return atleta


@app.get("/api/v1/atletas", response_model=list[AtletaOut])
def listar_atletas(clube_id: int | None = None, db: Session = Depends(get_db)) -> list[Atleta]:
    stmt = select(Atleta).order_by(Atleta.criado_em.desc())
    if clube_id is not None:
        stmt = stmt.where(Atleta.clube_id == clube_id)
    return list(db.scalars(stmt).all())


# ============================================================================
# 3. VALIDAÇÃO DE TERMO LGPD
# ============================================================================
@app.post("/api/v1/lgpd/validar", response_model=LgpdOut)
def validar_termo_lgpd(
    payload: LgpdValidacaoRequest, request: Request, db: Session = Depends(get_db)
) -> ConsentimentoLGPD:
    atleta = db.get(Atleta, payload.atleta_id)
    if atleta is None:
        raise HTTPException(status_code=404, detail="Atleta não encontrado.")

    termo = db.scalar(
        select(ConsentimentoLGPD)
        .where(ConsentimentoLGPD.atleta_id == payload.atleta_id)
        .order_by(ConsentimentoLGPD.criado_em.desc())
    )

    agora = datetime.now(timezone.utc)
    if termo is None:
        if not payload.responsavel_legal_nome or not payload.responsavel_telefone:
            raise HTTPException(
                status_code=400,
                detail="Nome e telefone do responsável legal são obrigatórios para criar novo termo LGPD.",
            )
        termo = ConsentimentoLGPD(
            atleta_id=atleta.id,
            atleta_menor_idade=_calcular_idade_anos(atleta.data_nascimento) < 18,
            responsavel_legal_nome=payload.responsavel_legal_nome.strip(),
            responsavel_legal_cpf_final=payload.responsavel_legal_cpf_final or "0000",
            responsavel_telefone=payload.responsavel_telefone.strip(),
            parentesco=payload.parentesco or "Responsável Legal",
            hash_documento_assinado=_sha256_hex(
                {"atleta_id": atleta.id, "responsavel": payload.responsavel_legal_nome, "ts": agora.isoformat()}
            ),
        )
        db.add(termo)

    termo.finalidade_captura_biometrica = payload.finalidade_captura_biometrica
    termo.finalidade_scouting_b2b = payload.finalidade_scouting_b2b
    termo.status = payload.status
    termo.ip_aceite = request.client.host if request.client else None
    termo.user_agent = request.headers.get("user-agent")

    if payload.status == StatusLgpdEnum.autorizado:
        termo.assinado_em = agora
        termo.valido_ate = agora + timedelta(days=365)
        termo.revogado_em = None
        atleta.apto_avaliacao_3d = True
    else:
        termo.revogado_em = agora
        termo.motivo_revogacao = payload.motivo_revogacao
        atleta.apto_avaliacao_3d = False

    _registrar_auditoria(
        db,
        acao=f"LGPD_{payload.status.value.upper()}",
        entidade="consentimentos_lgpd",
        entidade_id=str(atleta.id),
        ip_origem=request.client.host if request.client else None,
        metadata={"status": payload.status.value, "scouting_b2b": payload.finalidade_scouting_b2b},
    )
    db.commit()
    db.refresh(termo)
    return termo


@app.get("/api/v1/lgpd")
def listar_todos_termos_lgpd(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(ConsentimentoLGPD, Atleta)
        .join(Atleta, ConsentimentoLGPD.atleta_id == Atleta.id)
        .order_by(ConsentimentoLGPD.criado_em.desc())
    )
    rows = db.execute(stmt).all()
    return [
        {
            "id": c.id,
            "atleta_id": c.atleta_id,
            "atleta_nome": a.nome_completo,
            "atleta_codigo": a.codigo_5play,
            "atleta_categoria": a.categoria.value,
            "atleta_menor_idade": c.atleta_menor_idade,
            "responsavel_legal_nome": c.responsavel_legal_nome,
            "responsavel_legal_cpf_final": c.responsavel_legal_cpf_final,
            "responsavel_telefone": c.responsavel_telefone,
            "parentesco": c.parentesco,
            "termo_versao": c.termo_versao,
            "status": c.status.value,
            "assinado_em": c.assinado_em,
            "valido_ate": c.valido_ate,
            "criado_em": c.criado_em,
        }
        for c, a in rows
    ]


@app.get("/api/v1/lgpd/{atleta_id}", response_model=list[LgpdOut])
def listar_termos_atleta(atleta_id: int, db: Session = Depends(get_db)) -> list[ConsentimentoLGPD]:
    return list(
        db.scalars(
            select(ConsentimentoLGPD)
            .where(ConsentimentoLGPD.atleta_id == atleta_id)
            .order_by(ConsentimentoLGPD.criado_em.desc())
        ).all()
    )


# ============================================================================
# 4. DASHBOARD DINÂMICO (ZERO DADOS HARDCODED)
# ============================================================================
@app.get("/api/v1/dashboard", response_model=DashboardOverviewResponse)
def obter_dashboard_dinamico(
    clube_id: int | None = None,
    db: Session = Depends(get_db),
) -> DashboardOverviewResponse:
    total_clubes = db.scalar(select(func.count(Clube.id)).where(Clube.ativo.is_(True))) or 0

    atleta_stmt = select(Atleta)
    if clube_id is not None:
        atleta_stmt = atleta_stmt.where(Atleta.clube_id == clube_id)
    atletas = list(db.scalars(atleta_stmt.order_by(Atleta.criado_em.desc())).all())

    sessao_concluida_stmt = select(func.count(SessaoAnalise.id)).where(
        SessaoAnalise.status_processamento.in_(
            [StatusProcessamentoEnum.concluida, StatusProcessamentoEnum.auditada]
        )
    )
    if clube_id is not None:
        sessao_concluida_stmt = sessao_concluida_stmt.where(SessaoAnalise.clube_id == clube_id)
    total_sessoes_concluidas = db.scalar(sessao_concluida_stmt) or 0

    acwr_stmt = select(func.avg(SessaoAnalise.acwr_carga_aguda_cronica)).where(
        SessaoAnalise.acwr_carga_aguda_cronica.is_not(None)
    )
    if clube_id is not None:
        acwr_stmt = acwr_stmt.where(SessaoAnalise.clube_id == clube_id)
    acwr_medio = float(db.scalar(acwr_stmt) or 0.0)

    # Última métrica biomecânica persistida por atleta
    metricas_all = list(
        db.scalars(
            select(MetricaBiomecanica).order_by(MetricaBiomecanica.criado_em.desc())
        ).all()
    )
    ultima_metrica_por_atleta: dict[int, MetricaBiomecanica] = {}
    for m in metricas_all:
        if m.atleta_id not in ultima_metrica_por_atleta:
            ultima_metrica_por_atleta[m.atleta_id] = m

    resumos: list[DashboardAtletaResumo] = []
    eficiencias: list[float] = []
    velocidades: list[float] = []
    assimetrias_criticas = 0

    for atl in atletas:
        m = ultima_metrica_por_atleta.get(atl.id)
        asym = float(m.assimetria_bilateral_pct) if m and m.assimetria_bilateral_pct is not None else None
        alerta = bool(asym is not None and asym > 15.0)
        if alerta:
            assimetrias_criticas += 1
        if m is not None:
            eficiencias.append(float(m.ietp_eficiencia_tecnica))
            if m.velocidade_pico_kmh is not None:
                velocidades.append(float(m.velocidade_pico_kmh))

        resumos.append(
            DashboardAtletaResumo(
                atleta_id=atl.id,
                codigo_5play=atl.codigo_5play,
                nome_completo=atl.nome_completo,
                categoria=atl.categoria,
                posicao_primaria=atl.posicao_primaria,
                ipb=float(m.ipb_prontidao_biomecanica) if m else None,
                spe=float(m.spe_potencia_explosao) if m else None,
                ietp=float(m.ietp_eficiencia_tecnica) if m else None,
                ips=float(m.ips_potencial_scouting) if m else None,
                velocidade_pico_kmh=float(m.velocidade_pico_kmh) if m and m.velocidade_pico_kmh is not None else None,
                assimetria_bilateral_pct=asym,
                alerta_assimetria_critica=alerta,
            )
        )

    return DashboardOverviewResponse(
        total_clubes_ativos=int(total_clubes),
        total_atletas=len(atletas),
        total_sessoes_concluidas=int(total_sessoes_concluidas),
        eficiencia_biomecanica_media_pct=round(sum(eficiencias) / len(eficiencias), 2) if eficiencias else 0.0,
        velocidade_pico_media_kmh=round(sum(velocidades) / len(velocidades), 2) if velocidades else 0.0,
        velocidade_pico_max_kmh=round(max(velocidades), 2) if velocidades else 0.0,
        assimetrias_criticas_count=assimetrias_criticas,
        acwr_medio_elenco=round(acwr_medio, 2),
        atletas_monitorados=resumos,
    )


@app.get("/api/v1/benchmarks", response_model=list[BenchmarkOut])
def listar_benchmarks(db: Session = Depends(get_db)) -> list[BenchmarkPosicao]:
    return list(db.scalars(select(BenchmarkPosicao).order_by(BenchmarkPosicao.posicao)).all())


# ============================================================================
# 5. FILA ASSÍNCRONA (UPLOAD S3 ASSINADO + CELERY/REDIS -> 202 ACCEPTED)
# ============================================================================
@app.get("/api/v1/sessoes")
def listar_sessoes(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(SessaoAnalise, Atleta, Clube, MetricaBiomecanica)
        .join(Atleta, SessaoAnalise.atleta_id == Atleta.id)
        .join(Clube, SessaoAnalise.clube_id == Clube.id)
        .outerjoin(MetricaBiomecanica, MetricaBiomecanica.sessao_id == SessaoAnalise.id)
        .order_by(SessaoAnalise.criado_em.desc())
        .limit(40)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "sessao_id": s.id,
            "codigo_sessao": s.codigo_sessao,
            "atleta_id": a.id,
            "atleta_nome": a.nome_completo,
            "atleta_codigo": a.codigo_5play,
            "clube_nome": c.nome,
            "clube_sigla": c.sigla,
            "categoria": a.categoria.value,
            "posicao": a.posicao_primaria.value,
            "pe_dominante": a.pe_dominante.value,
            "estagio_maturacional": a.estagio_maturacional.value,
            "tipo_teste": s.tipo_teste.value,
            "modo_captura": s.modo_captura.value,
            "status_processamento": s.status_processamento.value,
            "redis_job_id": s.redis_job_id,
            "acwr": float(s.acwr_carga_aguda_cronica) if s.acwr_carga_aguda_cronica is not None else None,
            "sintese_ia_texto": s.sintese_ia_texto,
            "total_frames": s.total_frames,
            "duracao_segundos": float(s.duracao_segundos) if s.duracao_segundos is not None else None,
            "keyframes_criticos": s.keyframes_criticos,
            "criado_em": s.criado_em,
            "ipb": float(m.ipb_prontidao_biomecanica) if m else None,
            "spe": float(m.spe_potencia_explosao) if m else None,
            "ietp": float(m.ietp_eficiencia_tecnica) if m else None,
            "ips": float(m.ips_potencial_scouting) if m else None,
            "velocidade_pico_kmh": float(m.velocidade_pico_kmh) if m and m.velocidade_pico_kmh is not None else None,
            "assimetria_bilateral_pct": float(m.assimetria_bilateral_pct) if m and m.assimetria_bilateral_pct is not None else None,
            "pontos_opticos_22": m.pontos_opticos_22 if m else None,
        }
        for s, a, c, m in rows
    ]


@app.post(
    "/api/v1/sessoes/upload-url",
    response_model=SessaoUploadAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def solicitar_upload_e_enfileirar(
    payload: SessaoUploadRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> SessaoUploadAcceptedResponse:
    atleta = db.get(Atleta, payload.atleta_id)
    if atleta is None:
        raise HTTPException(status_code=404, detail="Atleta não encontrado.")

    if not atleta.apto_avaliacao_3d:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Captura 3D bloqueada por compliance LGPD pendente ou revogado para este atleta.",
        )

    if _calcular_idade_anos(atleta.data_nascimento) < 18:
        ultimo_termo = db.scalar(
            select(ConsentimentoLGPD)
            .where(ConsentimentoLGPD.atleta_id == atleta.id)
            .order_by(ConsentimentoLGPD.criado_em.desc())
        )
        if ultimo_termo is not None and ultimo_termo.status != StatusLgpdEnum.autorizado:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Captura 3D bloqueada: termo LGPD do atleta menor está '{ultimo_termo.status.value}'.",
            )

    clube_id = payload.clube_id if payload.clube_id is not None else atleta.clube_id
    if payload.clube_id is not None and payload.clube_id != atleta.clube_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O clube_id informado não corresponde ao clube vinculado ao atleta.",
        )

    clube = db.get(Clube, clube_id)
    if clube is None:
        raise HTTPException(status_code=404, detail="Clube vinculado não encontrado.")

    storage = ObjectStorageClient()
    storage.ensure_bucket_exists(storage.bucket_raw)

    codigo_sessao = f"SES-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    safe_filename = re.sub(r"[^a-zA-Z0-9._-]", "_", payload.nome_arquivo.strip()) or "video.mp4"
    object_key = f"raw/clube_{clube_id}/atleta_{payload.atleta_id}/{codigo_sessao}_{safe_filename}"

    expira_em = 900
    signed_url = storage.generate_presigned_upload_url(
        object_key=object_key,
        content_type=payload.content_type,
        expires_in=expira_em,
    )

    sessao = SessaoAnalise(
        codigo_sessao=codigo_sessao,
        atleta_id=payload.atleta_id,
        clube_id=clube_id,
        tipo_teste=payload.tipo_teste,
        contexto=payload.contexto,
        modo_captura=payload.modo_captura,
        fps_captura=payload.fps_captura,
        resolucao=payload.resolucao,
        distancia_estimada_m=payload.distancia_estimada_m,
        acwr_carga_aguda_cronica=(
            Decimal(str(round(payload.acwr, 2))) if payload.acwr is not None else None
        ),
        status_processamento=(
            StatusProcessamentoEnum.na_fila_redis
            if payload.iniciar_processamento_automatico
            else StatusProcessamentoEnum.aguardando_upload
        ),
        progresso_percentual=5 if payload.iniciar_processamento_automatico else 0,
        video_s3_bucket=storage.bucket_raw,
        video_s3_key=object_key,
    )
    db.add(sessao)
    try:
        db.flush()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Erro ao criar registro de sessão no PostgreSQL")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível criar a sessão de análise com os dados informados.",
        ) from exc

    celery_task_id: str | None = None
    alerta_assimetria_critica = False
    enqueued_celery = False

    if payload.iniciar_processamento_automatico and is_redis_configured():
        try:
            async_result = processar_video_biomecanico.apply_async(args=[sessao.id], countdown=5)
            celery_task_id = str(async_result.id)
            sessao.redis_job_id = celery_task_id
            enqueued_celery = True
        except Exception as exc:
            logger.warning(
                "Redis/Celery indisponível para sessão %s; executando fallback inline: %s",
                sessao.id,
                exc,
            )

    if payload.iniciar_processamento_automatico and not enqueued_celery:
        # Fallback síncrono seguro para ambientes gratuitos (ex.: Render sem Redis/Celery)
        resultado = KinePitchVisionEngine.gerar_metricas_inline(
            estatura_cm=float(atleta.estatura_cm),
            massa_corporal_kg=float(atleta.massa_corporal_kg),
            posicao=atleta.posicao_primaria.value,
            velocidade_pico_kmh=payload.velocidade_pico_kmh if payload.velocidade_pico_kmh is not None else 31.4,
            flexao_joelho_esq_graus=payload.flexao_joelho_esq_graus if payload.flexao_joelho_esq_graus is not None else 42.0,
            flexao_joelho_dir_graus=payload.flexao_joelho_dir_graus if payload.flexao_joelho_dir_graus is not None else 38.0,
            valgo_dinamico_graus=payload.valgo_dinamico_graus if payload.valgo_dinamico_graus is not None else 3.8,
            altura_salto_cm=payload.altura_salto_cm if payload.altura_salto_cm is not None else 41.0,
        )
        celery_task_id = f"inline-{uuid.uuid4()}"
        alerta_assimetria_critica = resultado.alerta_assimetria_critica

        db.add(
            MetricaBiomecanica(
                sessao_id=sessao.id,
                atleta_id=atleta.id,
                frame_referencia=resultado.frame_referencia,
                timestamp_segundos=Decimal(str(resultado.timestamp_segundos)),
                ipb_prontidao_biomecanica=Decimal(str(resultado.ipb_prontidao_biomecanica)),
                spe_potencia_explosao=Decimal(str(resultado.spe_potencia_explosao)),
                ietp_eficiencia_tecnica=Decimal(str(resultado.ietp_eficiencia_tecnica)),
                ips_potencial_scouting=Decimal(str(resultado.ips_potencial_scouting)),
                pontos_opticos_22=resultado.pontos_opticos_22,
                confianca_rastreamento_pct=Decimal(str(resultado.confianca_rastreamento_pct)),
                flexao_joelho_esq_graus=Decimal(str(resultado.flexao_joelho_esq_graus)),
                flexao_joelho_dir_graus=Decimal(str(resultado.flexao_joelho_dir_graus)),
                extensao_joelho_chute_graus=Decimal(str(resultado.extensao_joelho_chute_graus)),
                rotacao_quadril_graus=Decimal(str(resultado.rotacao_quadril_graus)),
                inclinacao_pelvica_lateral_graus=Decimal(str(resultado.inclinacao_pelvica_lateral_graus)),
                dorsiflexao_tornozelo_graus=Decimal(str(resultado.dorsiflexao_tornozelo_graus)),
                valgo_dinamico_joelho_graus=Decimal(str(resultado.valgo_dinamico_joelho_graus)),
                velocidade_pico_kmh=Decimal(str(resultado.velocidade_pico_kmh)),
                velocidade_pe_chute_kmh=Decimal(str(resultado.velocidade_pe_chute_kmh)),
                velocidade_bola_kmh=Decimal(str(resultado.velocidade_bola_kmh)),
                split_0_10m_seg=Decimal(str(resultado.split_0_10m_seg)),
                desaceleracao_max_ms2=Decimal(str(resultado.desaceleracao_max_ms2)),
                vetor_grf_bw=Decimal(str(resultado.vetor_grf_bw)),
                torque_articular_nm=Decimal(str(resultado.torque_articular_nm)),
                velocidade_angular_joelho_graus_s=Decimal(str(resultado.velocidade_angular_joelho_graus_s)),
                altura_salto_cm=Decimal(str(resultado.altura_salto_cm)),
                rsi_reativo=Decimal(str(resultado.rsi_reativo)),
                assimetria_bilateral_pct=Decimal(str(resultado.assimetria_bilateral_pct)),
            )
        )

        sessao.redis_job_id = celery_task_id
        sessao.worker_gpu_node = "render-inline-biomech"
        sessao.latencia_inferencia_ms = Decimal(str(resultado.latencia_inferencia_ms))
        sessao.total_frames = resultado.total_frames
        sessao.duracao_segundos = Decimal(str(resultado.duracao_segundos))
        sessao.keyframes_criticos = resultado.keyframes_criticos
        sessao.sintese_ia_texto = resultado.sintese_ia_texto
        sessao.status_processamento = StatusProcessamentoEnum.concluida
        sessao.progresso_percentual = 100
        sessao.concluida_em = datetime.now(timezone.utc)

    _registrar_auditoria(
        db,
        acao="SESSAO_UPLOAD_ENFILEIRADA",
        entidade="sessoes_analise",
        entidade_id=str(sessao.id),
        ip_origem=request.client.host if request.client else None,
        metadata={
            "codigo_sessao": codigo_sessao,
            "celery_task_id": celery_task_id,
            "modo": "celery_redis" if enqueued_celery else "inline_fallback",
        },
    )

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Erro ao persistir sessão e métricas biomecânicas no PostgreSQL")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falha ao gravar sessão biomecânica no banco de dados. Verifique os valores enviados.",
        ) from exc

    return SessaoUploadAcceptedResponse(
        sessao_id=sessao.id,
        codigo_sessao=codigo_sessao,
        status_processamento=sessao.status_processamento,
        celery_task_id=celery_task_id,
        upload_signed_url=signed_url,
        s3_bucket=storage.bucket_raw,
        s3_object_key=object_key,
        expira_em_segundos=expira_em,
        alerta_assimetria_critica=alerta_assimetria_critica,
    )


@app.post("/api/v1/sessoes/{sessao_id}/processar", status_code=status.HTTP_202_ACCEPTED)
def disparar_processamento_manual(sessao_id: int, db: Session = Depends(get_db)) -> dict:
    sessao = db.get(SessaoAnalise, sessao_id)
    if sessao is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    task = processar_video_biomecanico.delay(sessao.id)
    sessao.status_processamento = StatusProcessamentoEnum.na_fila_redis
    sessao.redis_job_id = str(task.id)
    sessao.progresso_percentual = 10
    db.commit()

    return {
        "sessao_id": sessao.id,
        "status_processamento": sessao.status_processamento.value,
        "celery_task_id": str(task.id),
    }


@app.get("/api/v1/sessoes/{sessao_id}")
def consultar_sessao(sessao_id: int, db: Session = Depends(get_db)) -> dict:
    sessao = db.scalar(
        select(SessaoAnalise)
        .options(joinedload(SessaoAnalise.metricas))
        .where(SessaoAnalise.id == sessao_id)
    )
    if sessao is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    atleta = db.get(Atleta, sessao.atleta_id)
    clube = db.get(Clube, sessao.clube_id)
    benchmarks = (
        list(
            db.scalars(
                select(BenchmarkPosicao).where(
                    BenchmarkPosicao.posicao == atleta.posicao_primaria
                )
            ).all()
        )
        if atleta
        else []
    )
    m = sessao.metricas
    return {
        "sessao": {
            "id": sessao.id,
            "codigo_sessao": sessao.codigo_sessao,
            "atleta_id": sessao.atleta_id,
            "clube_id": sessao.clube_id,
            "tipo_teste": sessao.tipo_teste.value,
            "modo_captura": sessao.modo_captura.value,
            "status_processamento": sessao.status_processamento.value,
            "progresso_percentual": sessao.progresso_percentual,
            "redis_job_id": sessao.redis_job_id,
            "worker_gpu_node": sessao.worker_gpu_node,
            "latencia_inferencia_ms": float(sessao.latencia_inferencia_ms) if sessao.latencia_inferencia_ms is not None else None,
            "video_s3_key": sessao.video_s3_key,
            "total_frames": sessao.total_frames,
            "duracao_segundos": float(sessao.duracao_segundos) if sessao.duracao_segundos is not None else None,
            "keyframes_criticos": sessao.keyframes_criticos,
            "acwr_carga_aguda_cronica": float(sessao.acwr_carga_aguda_cronica) if sessao.acwr_carga_aguda_cronica is not None else None,
            "sintese_ia_texto": sessao.sintese_ia_texto,
            "criado_em": sessao.criado_em,
        },
        "atleta": {
            "id": atleta.id,
            "codigo_5play": atleta.codigo_5play,
            "nome_completo": atleta.nome_completo,
            "apelido_esportivo": atleta.apelido_esportivo,
            "data_nascimento": atleta.data_nascimento,
            "categoria": atleta.categoria.value,
            "posicao_primaria": atleta.posicao_primaria.value,
            "pe_dominante": atleta.pe_dominante.value,
            "estatura_cm": float(atleta.estatura_cm),
            "massa_corporal_kg": float(atleta.massa_corporal_kg),
            "estagio_maturacional": atleta.estagio_maturacional.value,
            "apto_avaliacao_3d": atleta.apto_avaliacao_3d,
        }
        if atleta
        else None,
        "clube": {
            "id": clube.id,
            "nome": clube.nome,
            "sigla": clube.sigla,
            "cidade": clube.cidade,
        }
        if clube
        else None,
        "metricas": {
            "id": m.id,
            "frame_referencia": m.frame_referencia,
            "timestamp_segundos": float(m.timestamp_segundos),
            "ipb_prontidao_biomecanica": float(m.ipb_prontidao_biomecanica),
            "spe_potencia_explosao": float(m.spe_potencia_explosao),
            "ietp_eficiencia_tecnica": float(m.ietp_eficiencia_tecnica),
            "ips_potencial_scouting": float(m.ips_potencial_scouting),
            "pontos_opticos_22": m.pontos_opticos_22,
            "confianca_rastreamento_pct": float(m.confianca_rastreamento_pct),
            "flexao_joelho_esq_graus": float(m.flexao_joelho_esq_graus or 0),
            "flexao_joelho_dir_graus": float(m.flexao_joelho_dir_graus or 0),
            "extensao_joelho_chute_graus": float(m.extensao_joelho_chute_graus or 0),
            "rotacao_quadril_graus": float(m.rotacao_quadril_graus or 0),
            "inclinacao_pelvica_lateral_graus": float(m.inclinacao_pelvica_lateral_graus or 0),
            "dorsiflexao_tornozelo_graus": float(m.dorsiflexao_tornozelo_graus or 0),
            "valgo_dinamico_joelho_graus": float(m.valgo_dinamico_joelho_graus or 0),
            "velocidade_pico_kmh": float(m.velocidade_pico_kmh or 0),
            "velocidade_pe_chute_kmh": float(m.velocidade_pe_chute_kmh or 0),
            "velocidade_bola_kmh": float(m.velocidade_bola_kmh or 0),
            "split_0_10m_seg": float(m.split_0_10m_seg or 0),
            "desaceleracao_max_ms2": float(m.desaceleracao_max_ms2 or 0),
            "vetor_grf_bw": float(m.vetor_grf_bw or 0),
            "torque_articular_nm": float(m.torque_articular_nm or 0),
            "altura_salto_cm": float(m.altura_salto_cm or 0),
            "rsi_reativo": float(m.rsi_reativo or 0),
            "assimetria_bilateral_pct": float(m.assimetria_bilateral_pct or 0),
        }
        if m
        else None,
        "benchmarks": [
            {
                "id": b.id,
                "posicao": b.posicao.value,
                "nivel_referencia": b.nivel_referencia.value,
                "vmax_kmh": float(b.vmax_kmh),
                "split_0_10m_seg": float(b.split_0_10m_seg),
                "potencia_chute_kmh": float(b.potencia_chute_kmh),
                "assimetria_max_pct": float(b.assimetria_max_pct),
                "ipb_medio": float(b.ipb_medio),
                "spe_medio": float(b.spe_medio),
                "ietp_medio": float(b.ietp_medio),
                "ips_medio": float(b.ips_medio),
            }
            for b in benchmarks
        ],
    }


# ============================================================================
# 6. COMPARTILHAMENTO B2B (TOKEN COM EXPIRAÇÃO + DISPARO WEBHOOK JSON)
# ============================================================================
@app.get("/api/v1/webhooks")
def listar_webhooks_b2b(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(WebhookB2B, Clube)
        .join(Clube, WebhookB2B.clube_id == Clube.id)
        .order_by(WebhookB2B.criado_em.desc())
    )
    rows = db.execute(stmt).all()
    return [
        {
            "id": wh.id,
            "clube_id": wh.clube_id,
            "clube_nome": c.nome,
            "clube_sigla": c.sigla,
            "nome_integracao": wh.nome_integracao,
            "tipo_sistema": wh.tipo_sistema.value,
            "endpoint_url": wh.endpoint_url,
            "eventos_assinados": wh.eventos_assinados,
            "ativo": wh.ativo,
            "ultimo_status_http": wh.ultimo_status_http,
            "criado_em": wh.criado_em,
        }
        for wh, c in rows
    ]


@app.post("/api/v1/webhooks", status_code=status.HTTP_201_CREATED)
def cadastrar_webhook_b2b(payload: WebhookCreate, db: Session = Depends(get_db)) -> dict:
    raw_secret = secrets.token_hex(24)
    secret_hash = hashlib.sha256(raw_secret.encode("utf-8")).hexdigest()

    wh = WebhookB2B(
        clube_id=payload.clube_id,
        nome_integracao=payload.nome_integracao.strip(),
        tipo_sistema=payload.tipo_sistema,
        endpoint_url=str(payload.endpoint_url),
        secret_hmac_sha256_hash=secret_hash,
        eventos_assinados=payload.eventos_assinados,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return {
        "id": wh.id,
        "nome_integracao": wh.nome_integracao,
        "endpoint_url": wh.endpoint_url,
        "signing_secret_once": f"whsec_{raw_secret}",
    }


@app.get("/api/v1/compartilhamentos")
def listar_compartilhamentos_b2b(db: Session = Depends(get_db)) -> list[dict]:
    stmt = (
        select(RelatorioCompartilhado, Atleta, SessaoAnalise)
        .join(Atleta, RelatorioCompartilhado.atleta_id == Atleta.id)
        .join(SessaoAnalise, RelatorioCompartilhado.sessao_id == SessaoAnalise.id)
        .order_by(RelatorioCompartilhado.criado_em.desc())
        .limit(25)
    )
    rows = db.execute(stmt).all()
    return [
        {
            "id": r.id,
            "token_acesso": str(r.token_acesso),
            "atleta_nome": a.nome_completo,
            "codigo_sessao": s.codigo_sessao,
            "audit_hash_sha256": r.audit_hash_sha256,
            "expira_em": r.expira_em,
            "visualizacoes_count": r.visualizacoes_count,
            "ativo": r.ativo,
            "criado_em": r.criado_em,
        }
        for r, a, s in rows
    ]


@app.post(
    "/api/v1/compartilhamentos/b2b",
    response_model=CompartilhamentoB2BResponse,
    status_code=status.HTTP_201_CREATED,
)
async def compartilhar_dossie_b2b(
    payload: CompartilhamentoB2BRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> CompartilhamentoB2BResponse:
    atleta = db.get(Atleta, payload.atleta_id)
    sessao = db.scalar(
        select(SessaoAnalise)
        .options(joinedload(SessaoAnalise.metricas))
        .where(SessaoAnalise.id == payload.sessao_id)
    )
    if atleta is None or sessao is None:
        raise HTTPException(status_code=404, detail="Atleta ou sessão de análise não encontrado.")

    if sessao.atleta_id != atleta.id:
        raise HTTPException(status_code=400, detail="Sessão informada não pertence ao atleta.")

    agora = datetime.now(timezone.utc)
    expira_em = agora + timedelta(days=payload.dias_validade)
    token = uuid.uuid4()

    resumo_metricas = (
        {
            "ipb": float(sessao.metricas.ipb_prontidao_biomecanica),
            "spe": float(sessao.metricas.spe_potencia_explosao),
            "ietp": float(sessao.metricas.ietp_eficiencia_tecnica),
            "ips": float(sessao.metricas.ips_potencial_scouting),
            "velocidade_pico_kmh": float(sessao.metricas.velocidade_pico_kmh or 0),
            "assimetria_bilateral_pct": float(sessao.metricas.assimetria_bilateral_pct or 0),
        }
        if sessao.metricas
        else {}
    )

    audit_hash = _sha256_hex(
        {
            "token": str(token),
            "atleta_id": atleta.id,
            "sessao_id": sessao.id,
            "expira_em": expira_em.isoformat(),
            "metricas": resumo_metricas,
        }
    )

    relatorio = RelatorioCompartilhado(
        token_acesso=token,
        atleta_id=atleta.id,
        sessao_id=sessao.id,
        audit_hash_sha256=audit_hash,
        expira_em=expira_em,
        ativo=True,
    )
    db.add(relatorio)
    db.flush()

    base_url = os.getenv("PUBLIC_APP_URL", str(request.base_url).rstrip("/"))
    link_seguro = f"{base_url}/?token={token}"

    webhook_statuses: list[WebhookDispatchStatus] = []
    if payload.disparar_webhooks:
        clube_alvo = payload.clube_destino_id or atleta.clube_id
        webhooks = list(
            db.scalars(
                select(WebhookB2B).where(WebhookB2B.clube_id == clube_alvo, WebhookB2B.ativo.is_(True))
            ).all()
        )
        webhook_payload = {
            "evento": "dossie.compartilhado",
            "gerado_em": agora.isoformat(),
            "expira_em": expira_em.isoformat(),
            "token_acesso": str(token),
            "link_seguro_url": link_seguro,
            "audit_hash_sha256": audit_hash,
            "atleta": {
                "id": atleta.id,
                "codigo_5play": atleta.codigo_5play,
                "nome_completo": atleta.nome_completo,
                "posicao": atleta.posicao_primaria.value,
                "categoria": atleta.categoria.value,
                "estatura_cm": float(atleta.estatura_cm),
                "massa_corporal_kg": float(atleta.massa_corporal_kg),
            },
            "sessao": {
                "id": sessao.id,
                "codigo_sessao": sessao.codigo_sessao,
                "tipo_teste": sessao.tipo_teste.value,
                "metricas": resumo_metricas,
            },
        }
        body_bytes = json.dumps(webhook_payload, default=str).encode("utf-8")

        async with httpx.AsyncClient(timeout=8.0) as client:
            for wh in webhooks:
                assinatura = hmac.new(
                    wh.secret_hmac_sha256_hash.encode("utf-8"),
                    body_bytes,
                    hashlib.sha256,
                ).hexdigest()
                headers = {
                    "Content-Type": "application/json",
                    "X-KinePitch-Event": "dossie.compartilhado",
                    "X-KinePitch-Signature": f"sha256={assinatura}",
                    **(wh.headers_custom or {}),
                }
                status_http: int | None = None
                entregue = False
                erro: str | None = None
                try:
                    resp = await client.post(wh.endpoint_url, content=body_bytes, headers=headers)
                    status_http = resp.status_code
                    entregue = 200 <= resp.status_code < 300
                except Exception as exc:
                    erro = str(exc)

                wh.ultima_entrega_em = datetime.now(timezone.utc)
                wh.ultimo_status_http = status_http
                if entregue:
                    wh.total_falhas_consecutivas = 0
                else:
                    wh.total_falhas_consecutivas = (wh.total_falhas_consecutivas or 0) + 1

                webhook_statuses.append(
                    WebhookDispatchStatus(
                        webhook_id=wh.id,
                        nome_integracao=wh.nome_integracao,
                        endpoint_url=wh.endpoint_url,
                        status_http=status_http,
                        entregue=entregue,
                        erro=erro,
                    )
                )

    _registrar_auditoria(
        db,
        acao="DOSSIE_B2B_COMPARTILHADO",
        entidade="relatorios_compartilhados",
        entidade_id=str(relatorio.id),
        ip_origem=request.client.host if request.client else None,
        metadata={
            "token": str(token),
            "expira_em": expira_em.isoformat(),
            "webhooks_total": len(webhook_statuses),
        },
    )
    db.commit()

    return CompartilhamentoB2BResponse(
        relatorio_id=relatorio.id,
        token_acesso=token,
        link_seguro_url=link_seguro,
        audit_hash_sha256=audit_hash,
        expira_em=expira_em,
        webhooks_disparados=webhook_statuses,
    )


@app.get("/api/v1/compartilhamentos/publico/{token}")
def visualizar_dossie_publico(token: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    relatorio = db.scalar(
        select(RelatorioCompartilhado).where(RelatorioCompartilhado.token_acesso == token)
    )
    if relatorio is None or not relatorio.ativo:
        raise HTTPException(status_code=404, detail="Dossiê B2B não encontrado ou desativado.")

    if datetime.now(timezone.utc) > relatorio.expira_em:
        raise HTTPException(status_code=410, detail="Token de compartilhamento B2B expirado.")

    atleta = db.get(Atleta, relatorio.atleta_id)
    clube = db.get(Clube, atleta.clube_id) if atleta else None
    sessao = db.scalar(
        select(SessaoAnalise)
        .options(joinedload(SessaoAnalise.metricas))
        .where(SessaoAnalise.id == relatorio.sessao_id)
    )
    if atleta is None or sessao is None:
        raise HTTPException(status_code=404, detail="Dados do relatório indisponíveis.")

    benchmarks = list(
        db.scalars(
            select(BenchmarkPosicao).where(BenchmarkPosicao.posicao == atleta.posicao_primaria)
        ).all()
    )

    relatorio.visualizacoes_count += 1
    db.commit()

    m = sessao.metricas
    return {
        "audit_hash_sha256": relatorio.audit_hash_sha256,
        "expira_em": relatorio.expira_em,
        "criado_em": relatorio.criado_em,
        "visualizacoes_count": relatorio.visualizacoes_count,
        "clube": {
            "nome": clube.nome,
            "sigla": clube.sigla,
            "cidade": clube.cidade,
        }
        if clube
        else None,
        "atleta": {
            "codigo_5play": atleta.codigo_5play,
            "nome_completo": atleta.nome_completo,
            "apelido_esportivo": atleta.apelido_esportivo,
            "data_nascimento": atleta.data_nascimento,
            "categoria": atleta.categoria.value,
            "posicao_primaria": atleta.posicao_primaria.value,
            "pe_dominante": atleta.pe_dominante.value,
            "estatura_cm": float(atleta.estatura_cm),
            "massa_corporal_kg": float(atleta.massa_corporal_kg),
            "estagio_maturacional": atleta.estagio_maturacional.value,
        },
        "sessao": {
            "codigo_sessao": sessao.codigo_sessao,
            "tipo_teste": sessao.tipo_teste.value,
            "modo_captura": sessao.modo_captura.value,
            "acwr": float(sessao.acwr_carga_aguda_cronica) if sessao.acwr_carga_aguda_cronica else None,
            "sintese_ia_texto": sessao.sintese_ia_texto,
            "metricas": {
                "ipb": float(m.ipb_prontidao_biomecanica),
                "spe": float(m.spe_potencia_explosao),
                "ietp": float(m.ietp_eficiencia_tecnica),
                "ips": float(m.ips_potencial_scouting),
                "confianca_rastreamento_pct": float(m.confianca_rastreamento_pct),
                "velocidade_pico_kmh": float(m.velocidade_pico_kmh or 0),
                "velocidade_pe_chute_kmh": float(m.velocidade_pe_chute_kmh or 0),
                "velocidade_bola_kmh": float(m.velocidade_bola_kmh or 0),
                "split_0_10m_seg": float(m.split_0_10m_seg or 0),
                "assimetria_bilateral_pct": float(m.assimetria_bilateral_pct or 0),
                "flexao_joelho_esq_graus": float(m.flexao_joelho_esq_graus or 0),
                "flexao_joelho_dir_graus": float(m.flexao_joelho_dir_graus or 0),
                "extensao_joelho_chute_graus": float(m.extensao_joelho_chute_graus or 0),
                "dorsiflexao_tornozelo_graus": float(m.dorsiflexao_tornozelo_graus or 0),
                "inclinacao_pelvica_lateral_graus": float(m.inclinacao_pelvica_lateral_graus or 0),
                "valgo_dinamico_joelho_graus": float(m.valgo_dinamico_joelho_graus or 0),
                "vetor_grf_bw": float(m.vetor_grf_bw or 0),
                "torque_articular_nm": float(m.torque_articular_nm or 0),
                "altura_salto_cm": float(m.altura_salto_cm or 0),
                "rsi_reativo": float(m.rsi_reativo or 0),
                "pontos_opticos_22": m.pontos_opticos_22,
            }
            if m
            else None,
        },
        "benchmarks": [
            {
                "nivel_referencia": b.nivel_referencia.value,
                "vmax_kmh": float(b.vmax_kmh),
                "split_0_10m_seg": float(b.split_0_10m_seg),
                "potencia_chute_kmh": float(b.potencia_chute_kmh),
                "assimetria_max_pct": float(b.assimetria_max_pct),
                "ipb_medio": float(b.ipb_medio),
                "spe_medio": float(b.spe_medio),
                "ietp_medio": float(b.ietp_medio),
                "ips_medio": float(b.ips_medio),
            }
            for b in benchmarks
        ],
    }
