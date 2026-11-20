from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from models import (
    CategoriaCompetitivaEnum,
    EstagioMaturacionalEnum,
    ModoCapturaEnum,
    NivelBenchmarkEnum,
    PeDominanteEnum,
    PosicaoCampoEnum,
    SistemaExternoB2bEnum,
    StatusLgpdEnum,
    StatusProcessamentoEnum,
    TipoClubeEnum,
    TipoContratoEnum,
    TipoTesteBiomecanicoEnum,
)


# ============================================================================
# CLUBES
# ============================================================================
class ClubeCreate(BaseModel):
    nome: str = Field(..., min_length=2, max_length=180)
    sigla: str = Field(..., min_length=2, max_length=12)
    cnpj: str | None = Field(default=None, max_length=20)
    tipo_instituicao: TipoClubeEnum = TipoClubeEnum.clube_profissional
    cbf_tms_codigo: str | None = Field(default=None, max_length=64)
    cidade: str = Field(..., min_length=2, max_length=100)
    estado_uf: str | None = Field(default=None, min_length=2, max_length=2)
    pais: str = Field(default="Brasil", max_length=64)
    responsavel_tecnico: str | None = Field(default=None, max_length=150)
    email_contato: str | None = Field(default=None, max_length=255)


class ClubeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    sigla: str
    cnpj: str | None
    tipo_instituicao: TipoClubeEnum
    cbf_tms_codigo: str | None
    cidade: str
    estado_uf: str | None
    pais: str
    plano_contrato: str
    ativo: bool
    criado_em: datetime


# ============================================================================
# ATLETAS + ANTROPOMETRIA + MATURAÇÃO + LGPD MENORES
# ============================================================================
class ConsentimentoLgpdInput(BaseModel):
    responsavel_legal_nome: str = Field(..., min_length=3, max_length=200)
    responsavel_legal_cpf_final: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    responsavel_telefone: str = Field(..., min_length=8, max_length=32)
    parentesco: str = Field(default="Responsável Legal", max_length=60)
    finalidade_captura_biometrica: bool = True
    finalidade_scouting_b2b: bool = False
    termo_versao: str = Field(default="LGPD-BASE-2025.1", max_length=32)
    autorizar_imediatamente: bool = False


class AtletaCreate(BaseModel):
    clube_id: int
    nome_completo: str = Field(..., min_length=3, max_length=200)
    apelido_esportivo: str | None = Field(default=None, max_length=100)
    data_nascimento: date
    nacionalidade: str = Field(default="Brasileira", max_length=80)
    passaporte_comunitario: str | None = Field(default=None, max_length=80)

    categoria: CategoriaCompetitivaEnum
    posicao_primaria: PosicaoCampoEnum
    posicao_secundaria: PosicaoCampoEnum | None = None
    numero_camisa: int | None = Field(default=None, ge=1, le=99)
    pe_dominante: PeDominanteEnum = PeDominanteEnum.destro
    tipo_contrato: TipoContratoEnum = TipoContratoEnum.formacao_fdi
    empresario_agencia: str | None = None
    valencias_taticas: list[str] = Field(default_factory=list)

    estatura_cm: Decimal = Field(..., ge=Decimal("100.00"), le=Decimal("230.00"))
    massa_corporal_kg: Decimal = Field(..., ge=Decimal("25.00"), le=Decimal("150.00"))
    envergadura_cm: Decimal | None = Field(default=None, ge=Decimal("100.00"), le=Decimal("245.00"))
    altura_sentado_cm: Decimal | None = Field(
        default=None, ge=Decimal("50.00"), le=Decimal("130.00")
    )
    percentual_gordura: Decimal | None = Field(default=None, ge=Decimal("3.00"), le=Decimal("45.00"))

    estagio_maturacional: EstagioMaturacionalEnum = EstagioMaturacionalEnum.pvc_em_andamento
    mirwald_offset_anos: Decimal | None = Field(default=None, ge=Decimal("-5.00"), le=Decimal("5.00"))
    historico_clinico: list[dict[str, Any]] = Field(default_factory=list)
    alerta_assimetria_pelvica: bool = True
    limiar_assimetria_graus: Decimal = Field(default=Decimal("12.00"), ge=Decimal("1.00"), le=Decimal("30.00"))
    tag_gps_vinculada: str | None = None

    consentimento_lgpd: ConsentimentoLgpdInput | None = None


class AtletaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clube_id: int
    codigo_5play: str
    nome_completo: str
    apelido_esportivo: str | None
    data_nascimento: date
    categoria: CategoriaCompetitivaEnum
    posicao_primaria: PosicaoCampoEnum
    posicao_secundaria: PosicaoCampoEnum | None
    pe_dominante: PeDominanteEnum
    estatura_cm: Decimal
    massa_corporal_kg: Decimal
    envergadura_cm: Decimal | None
    percentual_gordura: Decimal | None
    imc: Decimal | None
    estagio_maturacional: EstagioMaturacionalEnum
    mirwald_offset_anos: Decimal | None
    apto_avaliacao_3d: bool
    criado_em: datetime


# ============================================================================
# VALIDAÇÃO DE TERMO LGPD
# ============================================================================
class LgpdValidacaoRequest(BaseModel):
    atleta_id: int
    status: StatusLgpdEnum
    finalidade_captura_biometrica: bool = True
    finalidade_scouting_b2b: bool = True
    responsavel_legal_nome: str | None = None
    responsavel_legal_cpf_final: str | None = Field(default=None, pattern=r"^\d{4}$")
    responsavel_telefone: str | None = None
    parentesco: str | None = None
    motivo_revogacao: str | None = None

    @field_validator("status")
    @classmethod
    def check_status(cls, value: StatusLgpdEnum) -> StatusLgpdEnum:
        if value not in (StatusLgpdEnum.autorizado, StatusLgpdEnum.revogado):
            raise ValueError("A validação deve definir status como 'autorizado' ou 'revogado'.")
        return value


class LgpdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    atleta_id: int
    atleta_menor_idade: bool
    responsavel_legal_nome: str
    responsavel_legal_cpf_final: str
    parentesco: str
    finalidade_captura_biometrica: bool
    finalidade_scouting_b2b: bool
    termo_versao: str
    hash_documento_assinado: str
    status: StatusLgpdEnum
    assinado_em: datetime | None
    valido_ate: datetime | None


# ============================================================================
# UPLOAD & FILA ASSÍNCRONA (202 ACCEPTED)
# ============================================================================
class SessaoUploadRequest(BaseModel):
    atleta_id: int
    clube_id: int
    tipo_teste: TipoTesteBiomecanicoEnum
    contexto: str = Field(default="treino", max_length=40)
    modo_captura: ModoCapturaEnum = ModoCapturaEnum.stereo_4k_60fps
    fps_captura: int = Field(default=60, ge=30, le=240)
    resolucao: str = Field(default="4K", max_length=20)
    nome_arquivo: str = Field(..., min_length=3, max_length=240)
    content_type: str = Field(default="video/mp4")
    distancia_estimada_m: Decimal | None = Field(default=Decimal("5.40"))
    iniciar_processamento_automatico: bool = True


class SessaoUploadAcceptedResponse(BaseModel):
    sessao_id: int
    codigo_sessao: str
    status_processamento: StatusProcessamentoEnum
    celery_task_id: str | None
    upload_signed_url: str
    s3_bucket: str
    s3_object_key: str
    expira_em_segundos: int


class PontoOptico3D(BaseModel):
    x: float
    y: float
    z: float
    confianca: float


class MetricaBiomecanicaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sessao_id: int
    atleta_id: int
    frame_referencia: int
    timestamp_segundos: Decimal
    ipb_prontidao_biomecanica: Decimal
    spe_potencia_explosao: Decimal
    ietp_eficiencia_tecnica: Decimal
    ips_potencial_scouting: Decimal
    pontos_opticos_22: dict[str, PontoOptico3D]
    confianca_rastreamento_pct: Decimal
    flexao_joelho_esq_graus: Decimal | None
    flexao_joelho_dir_graus: Decimal | None
    extensao_joelho_chute_graus: Decimal | None
    rotacao_quadril_graus: Decimal | None
    inclinacao_pelvica_lateral_graus: Decimal | None
    dorsiflexao_tornozelo_graus: Decimal | None
    valgo_dinamico_joelho_graus: Decimal | None
    velocidade_pico_kmh: Decimal | None
    velocidade_pe_chute_kmh: Decimal | None
    velocidade_bola_kmh: Decimal | None
    split_0_10m_seg: Decimal | None
    desaceleracao_max_ms2: Decimal | None
    vetor_grf_bw: Decimal | None
    torque_articular_nm: Decimal | None
    velocidade_angular_joelho_graus_s: Decimal | None
    altura_salto_cm: Decimal | None
    rsi_reativo: Decimal | None
    assimetria_bilateral_pct: Decimal | None


class SessaoStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo_sessao: str
    atleta_id: int
    tipo_teste: TipoTesteBiomecanicoEnum
    status_processamento: StatusProcessamentoEnum
    progresso_percentual: int
    redis_job_id: str | None
    worker_gpu_node: str | None
    latencia_inferencia_ms: Decimal | None
    acwr_carga_aguda_cronica: Decimal | None
    sintese_ia_texto: str | None
    metricas: MetricaBiomecanicaOut | None = None


# ============================================================================
# DASHBOARD DINÂMICO (ZERO DADOS HARDCODED)
# ============================================================================
class DashboardAtletaResumo(BaseModel):
    atleta_id: int
    codigo_5play: str
    nome_completo: str
    categoria: CategoriaCompetitivaEnum
    posicao_primaria: PosicaoCampoEnum
    ipb: float | None
    spe: float | None
    ietp: float | None
    ips: float | None
    velocidade_pico_kmh: float | None
    assimetria_bilateral_pct: float | None
    alerta_assimetria_critica: bool


class DashboardOverviewResponse(BaseModel):
    total_clubes_ativos: int
    total_atletas: int
    total_sessoes_concluidas: int
    eficiencia_biomecanica_media_pct: float
    velocidade_pico_media_kmh: float
    velocidade_pico_max_kmh: float
    assimetrias_criticas_count: int
    acwr_medio_elenco: float
    atletas_monitorados: list[DashboardAtletaResumo]


# ============================================================================
# COMPARTILHAMENTO B2B & WEBHOOKS
# ============================================================================
class CompartilhamentoB2BRequest(BaseModel):
    atleta_id: int
    sessao_id: int
    clube_destino_id: int | None = None
    dias_validade: int = Field(default=7, ge=1, le=30)
    disparar_webhooks: bool = True


class WebhookDispatchStatus(BaseModel):
    webhook_id: int
    nome_integracao: str
    endpoint_url: str
    status_http: int | None
    entregue: bool
    erro: str | None = None


class CompartilhamentoB2BResponse(BaseModel):
    relatorio_id: int
    token_acesso: UUID
    link_seguro_url: str
    audit_hash_sha256: str
    expira_em: datetime
    webhooks_disparados: list[WebhookDispatchStatus]


class WebhookCreate(BaseModel):
    clube_id: int
    nome_integracao: str = Field(..., min_length=2, max_length=150)
    tipo_sistema: SistemaExternoB2bEnum
    endpoint_url: HttpUrl
    eventos_assinados: list[str] = Field(
        default_factory=lambda: ["sessao.concluida", "dossie.compartilhado", "alerta.assimetria_critica"]
    )


class BenchmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    posicao: PosicaoCampoEnum
    nivel_referencia: NivelBenchmarkEnum
    amostra_n: int
    vmax_kmh: Decimal
    split_0_10m_seg: Decimal
    potencia_chute_kmh: Decimal
    assimetria_max_pct: Decimal
    ipb_medio: Decimal
    spe_medio: Decimal
    ietp_medio: Decimal
    ips_medio: Decimal
