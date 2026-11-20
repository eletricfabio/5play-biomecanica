from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class TipoClubeEnum(str, enum.Enum):
    clube_profissional = "clube_profissional"
    academia_base = "academia_base"
    escolinha_parceira = "escolinha_parceira"
    federacao = "federacao"


class PapelUsuarioEnum(str, enum.Enum):
    super_admin = "super_admin"
    fisiologista = "fisiologista"
    head_scout = "head_scout"
    treinador = "treinador"
    medico = "medico"
    visualizador_convidado = "visualizador_convidado"


class CategoriaCompetitivaEnum(str, enum.Enum):
    sub9 = "sub9"
    sub11 = "sub11"
    sub13 = "sub13"
    sub15 = "sub15"
    sub17 = "sub17"
    sub20 = "sub20"
    profissional = "profissional"


class PosicaoCampoEnum(str, enum.Enum):
    goleiro = "goleiro"
    zagueiro = "zagueiro"
    lateral = "lateral"
    volante = "volante"
    meia = "meia"
    ponta = "ponta"
    centroavante = "centroavante"


class PeDominanteEnum(str, enum.Enum):
    destro = "destro"
    canhoto = "canhoto"
    ambidestro = "ambidestro"


class TipoContratoEnum(str, enum.Enum):
    formacao_fdi = "formacao_fdi"
    profissional_cbf = "profissional_cbf"
    amador_federado = "amador_federado"
    avaliacao_trial = "avaliacao_trial"
    agente_livre = "agente_livre"


class EstagioMaturacionalEnum(str, enum.Enum):
    pre_pvc = "pre_pvc"
    pvc_em_andamento = "pvc_em_andamento"
    pos_pvc = "pos_pvc"


class StatusLgpdEnum(str, enum.Enum):
    pendente = "pendente"
    autorizado = "autorizado"
    revogado = "revogado"
    expirado = "expirado"


class TipoTesteBiomecanicoEnum(str, enum.Enum):
    finalizacao = "finalizacao"
    sprint_20m = "sprint_20m"
    salto_vertical = "salto_vertical"
    agilidade_cod = "agilidade_cod"
    chute_apoio = "chute_apoio"


class ModoCapturaEnum(str, enum.Enum):
    pitch_cam_mobile = "pitch_cam_mobile"
    stereo_4k_60fps = "stereo_4k_60fps"
    vicon_12cam_240fps = "vicon_12cam_240fps"
    drone_tatico = "drone_tatico"


class StatusProcessamentoEnum(str, enum.Enum):
    aguardando_upload = "aguardando_upload"
    na_fila_redis = "na_fila_redis"
    processando_ia = "processando_ia"
    concluida = "concluida"
    erro_calibracao = "erro_calibracao"
    auditada = "auditada"


class NivelBenchmarkEnum(str, enum.Enum):
    cbf_sub11 = "cbf_sub11"
    cbf_sub13 = "cbf_sub13"
    cbf_sub15 = "cbf_sub15"
    cbf_sub17 = "cbf_sub17"
    cbf_sub20 = "cbf_sub20"
    serie_a_pro = "serie_a_pro"
    top5_europa = "top5_europa"


class SistemaExternoB2bEnum(str, enum.Enum):
    cbf_tms = "cbf_tms"
    catapult_gps = "catapult_gps"
    statsports = "statsports"
    vicon_nexus = "vicon_nexus"
    kistler_force_plate = "kistler_force_plate"
    erp_clube_custom = "erp_clube_custom"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    nome_completo: Mapped[str] = mapped_column(String(180), nullable=False)
    cargo_institucional: Mapped[str | None] = mapped_column(String(150))
    departamento: Mapped[str | None] = mapped_column(String(150))
    registro_classe: Mapped[str | None] = mapped_column(String(80))
    telefone_corp: Mapped[str | None] = mapped_column(String(32))
    papel: Mapped[PapelUsuarioEnum] = mapped_column(
        SAEnum(PapelUsuarioEnum, name="papel_usuario_enum", create_type=False),
        default=PapelUsuarioEnum.head_scout,
        nullable=False,
    )
    idioma: Mapped[str] = mapped_column(String(16), default="pt-BR", nullable=False)
    fuso_horario: Mapped[str] = mapped_column(
        String(64), default="America/Sao_Paulo", nullable=False
    )
    mfa_fido2_ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultimo_login_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_ip: Mapped[str | None] = mapped_column(INET)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Clube(Base):
    __tablename__ = "clubes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(180), nullable=False)
    sigla: Mapped[str] = mapped_column(String(12), nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(20), unique=True)
    tipo_instituicao: Mapped[TipoClubeEnum] = mapped_column(
        SAEnum(TipoClubeEnum, name="tipo_clube_enum", create_type=False),
        default=TipoClubeEnum.clube_profissional,
        nullable=False,
    )
    cbf_tms_codigo: Mapped[str | None] = mapped_column(String(64))
    cidade: Mapped[str] = mapped_column(String(100), nullable=False)
    estado_uf: Mapped[str | None] = mapped_column(String(2))
    pais: Mapped[str] = mapped_column(String(64), default="Brasil", nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text)
    plano_contrato: Mapped[str] = mapped_column(
        String(40), default="enterprise_kinepitch", nullable=False
    )
    responsavel_tecnico: Mapped[str | None] = mapped_column(String(150))
    email_contato: Mapped[str | None] = mapped_column(String(255))
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    atletas: Mapped[list[Atleta]] = relationship("Atleta", back_populates="clube")
    webhooks: Mapped[list[WebhookB2B]] = relationship("WebhookB2B", back_populates="clube")


class Atleta(Base):
    __tablename__ = "atletas"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    clube_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clubes.id", ondelete="RESTRICT"), nullable=False
    )
    codigo_5play: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    nome_completo: Mapped[str] = mapped_column(String(200), nullable=False)
    apelido_esportivo: Mapped[str | None] = mapped_column(String(100))
    data_nascimento: Mapped[date] = mapped_column(Date, nullable=False)
    cpf_passaporte_cripto: Mapped[str | None] = mapped_column(String(255))
    nacionalidade: Mapped[str] = mapped_column(String(80), default="Brasileira", nullable=False)
    passaporte_comunitario: Mapped[str | None] = mapped_column(String(80))
    foto_url: Mapped[str | None] = mapped_column(Text)

    categoria: Mapped[CategoriaCompetitivaEnum] = mapped_column(
        SAEnum(CategoriaCompetitivaEnum, name="categoria_competitiva_enum", create_type=False),
        nullable=False,
    )
    posicao_primaria: Mapped[PosicaoCampoEnum] = mapped_column(
        SAEnum(PosicaoCampoEnum, name="posicao_campo_enum", create_type=False),
        nullable=False,
    )
    posicao_secundaria: Mapped[PosicaoCampoEnum | None] = mapped_column(
        SAEnum(PosicaoCampoEnum, name="posicao_campo_enum", create_type=False)
    )
    numero_camisa: Mapped[int | None] = mapped_column(SmallInteger)
    pe_dominante: Mapped[PeDominanteEnum] = mapped_column(
        SAEnum(PeDominanteEnum, name="pe_dominante_enum", create_type=False),
        default=PeDominanteEnum.destro,
        nullable=False,
    )
    tipo_contrato: Mapped[TipoContratoEnum] = mapped_column(
        SAEnum(TipoContratoEnum, name="tipo_contrato_enum", create_type=False),
        default=TipoContratoEnum.formacao_fdi,
        nullable=False,
    )
    empresario_agencia: Mapped[str | None] = mapped_column(String(180))
    valencias_taticas: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)

    estatura_cm: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    massa_corporal_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    envergadura_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    altura_sentado_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    percentual_gordura: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    imc: Mapped[Decimal | None] = mapped_column(
        Numeric(4, 2),
        Computed("ROUND(massa_corporal_kg / POWER(estatura_cm / 100.0, 2), 2)", persisted=True),
    )

    estagio_maturacional: Mapped[EstagioMaturacionalEnum] = mapped_column(
        SAEnum(EstagioMaturacionalEnum, name="estagio_maturacional_enum", create_type=False),
        default=EstagioMaturacionalEnum.pvc_em_andamento,
        nullable=False,
    )
    mirwald_offset_anos: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))

    historico_clinico: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    alerta_assimetria_pelvica: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    limiar_assimetria_graus: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), default=Decimal("12.00"), nullable=False
    )
    tag_gps_vinculada: Mapped[str | None] = mapped_column(String(64))
    apto_avaliacao_3d: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rascunho: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    clube: Mapped[Clube] = relationship("Clube", back_populates="atletas")
    consentimentos_lgpd: Mapped[list[ConsentimentoLGPD]] = relationship(
        "ConsentimentoLGPD", back_populates="atleta"
    )
    sessoes_analise: Mapped[list[SessaoAnalise]] = relationship(
        "SessaoAnalise", back_populates="atleta"
    )


class ConsentimentoLGPD(Base):
    __tablename__ = "consentimentos_lgpd"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    atleta_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("atletas.id", ondelete="CASCADE"), nullable=False
    )
    atleta_menor_idade: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    responsavel_legal_nome: Mapped[str] = mapped_column(String(200), nullable=False)
    responsavel_legal_cpf_final: Mapped[str] = mapped_column(String(4), nullable=False)
    responsavel_telefone: Mapped[str] = mapped_column(String(32), nullable=False)
    parentesco: Mapped[str] = mapped_column(String(60), nullable=False)
    finalidade_captura_biometrica: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    finalidade_scouting_b2b: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    termo_versao: Mapped[str] = mapped_column(
        String(32), default="LGPD-BASE-2025.1", nullable=False
    )
    hash_documento_assinado: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_aceite: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    status: Mapped[StatusLgpdEnum] = mapped_column(
        SAEnum(StatusLgpdEnum, name="status_lgpd_enum", create_type=False),
        default=StatusLgpdEnum.pendente,
        nullable=False,
    )
    assinado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valido_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_revogacao: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    atleta: Mapped[Atleta] = relationship("Atleta", back_populates="consentimentos_lgpd")


class SessaoAnalise(Base):
    __tablename__ = "sessoes_analise"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo_sessao: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    atleta_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("atletas.id", ondelete="CASCADE"), nullable=False
    )
    clube_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clubes.id", ondelete="RESTRICT"), nullable=False
    )
    operador_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuarios.id", ondelete="SET NULL")
    )

    tipo_teste: Mapped[TipoTesteBiomecanicoEnum] = mapped_column(
        SAEnum(TipoTesteBiomecanicoEnum, name="tipo_teste_biomecanico_enum", create_type=False),
        nullable=False,
    )
    contexto: Mapped[str] = mapped_column(String(40), default="treino", nullable=False)
    modo_captura: Mapped[ModoCapturaEnum] = mapped_column(
        SAEnum(ModoCapturaEnum, name="modo_captura_enum", create_type=False),
        default=ModoCapturaEnum.stereo_4k_60fps,
        nullable=False,
    )
    fps_captura: Mapped[int] = mapped_column(SmallInteger, default=60, nullable=False)
    resolucao: Mapped[str] = mapped_column(String(20), default="4K", nullable=False)
    distancia_estimada_m: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    calibracao_pitch_ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    status_processamento: Mapped[StatusProcessamentoEnum] = mapped_column(
        SAEnum(StatusProcessamentoEnum, name="status_processamento_enum", create_type=False),
        default=StatusProcessamentoEnum.aguardando_upload,
        nullable=False,
    )
    progresso_percentual: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    redis_job_id: Mapped[str | None] = mapped_column(String(128))
    worker_gpu_node: Mapped[str | None] = mapped_column(String(80))
    latencia_inferencia_ms: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    video_s3_bucket: Mapped[str] = mapped_column(
        String(120), default="kinepitch-videos-raw", nullable=False
    )
    video_s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    video_overlay_s3_key: Mapped[str | None] = mapped_column(Text)
    thumbnail_s3_key: Mapped[str | None] = mapped_column(Text)
    duracao_segundos: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    total_frames: Mapped[int | None] = mapped_column(Integer)

    keyframes_criticos: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, nullable=False
    )
    selo_certificacao: Mapped[str] = mapped_column(
        String(40), default="studio_ouro", nullable=False
    )
    acwr_carga_aguda_cronica: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    sintese_ia_texto: Mapped[str | None] = mapped_column(Text)

    capturada_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    atleta: Mapped[Atleta] = relationship("Atleta", back_populates="sessoes_analise")
    metricas: Mapped[MetricaBiomecanica | None] = relationship(
        "MetricaBiomecanica", back_populates="sessao", uselist=False
    )


class MetricaBiomecanica(Base):
    __tablename__ = "metricas_biomecanicas"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sessao_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sessoes_analise.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    atleta_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("atletas.id", ondelete="CASCADE"), nullable=False
    )
    frame_referencia: Mapped[int] = mapped_column(Integer, default=395, nullable=False)
    timestamp_segundos: Mapped[Decimal] = mapped_column(
        Numeric(8, 3), default=Decimal("6.580"), nullable=False
    )

    ipb_prontidao_biomecanica: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    spe_potencia_explosao: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    ietp_eficiencia_tecnica: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    ips_potencial_scouting: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    pontos_opticos_22: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    confianca_rastreamento_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("99.40"), nullable=False
    )

    flexao_joelho_esq_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    flexao_joelho_dir_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    extensao_joelho_chute_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    rotacao_quadril_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    inclinacao_pelvica_lateral_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    dorsiflexao_tornozelo_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    valgo_dinamico_joelho_graus: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    velocidade_pico_kmh: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    velocidade_pe_chute_kmh: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    velocidade_bola_kmh: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    split_0_10m_seg: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    desaceleracao_max_ms2: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    vetor_grf_bw: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    torque_articular_nm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    velocidade_angular_joelho_graus_s: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    altura_salto_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    rsi_reativo: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    assimetria_bilateral_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessao: Mapped[SessaoAnalise] = relationship("SessaoAnalise", back_populates="metricas")


class BenchmarkPosicao(Base):
    __tablename__ = "benchmarks_posicao"
    __table_args__ = (UniqueConstraint("posicao", "nivel_referencia"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    posicao: Mapped[PosicaoCampoEnum] = mapped_column(
        SAEnum(PosicaoCampoEnum, name="posicao_campo_enum", create_type=False), nullable=False
    )
    nivel_referencia: Mapped[NivelBenchmarkEnum] = mapped_column(
        SAEnum(NivelBenchmarkEnum, name="nivel_benchmark_enum", create_type=False), nullable=False
    )
    amostra_n: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    vmax_kmh: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    split_0_10m_seg: Mapped[Decimal] = mapped_column(Numeric(5, 3), nullable=False)
    potencia_chute_kmh: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    assimetria_max_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    rsi_mod_alvo: Mapped[Decimal] = mapped_column(Numeric(5, 3), nullable=False)
    valgo_max_seguro_graus: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    ipb_medio: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    spe_medio: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    ietp_medio: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    ips_medio: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    fonte_estudo: Mapped[str] = mapped_column(
        String(150), default="Base Oficial 5Play KinePitch Lab", nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WebhookB2B(Base):
    __tablename__ = "webhooks_b2b"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    clube_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("clubes.id", ondelete="CASCADE"), nullable=False
    )
    nome_integracao: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo_sistema: Mapped[SistemaExternoB2bEnum] = mapped_column(
        SAEnum(SistemaExternoB2bEnum, name="sistema_externo_b2b_enum", create_type=False),
        nullable=False,
    )
    endpoint_url: Mapped[str] = mapped_column(Text, nullable=False)
    secret_hmac_sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    eventos_assinados: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    headers_custom: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultima_entrega_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_status_http: Mapped[int | None] = mapped_column(SmallInteger)
    total_falhas_consecutivas: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    clube: Mapped[Clube] = relationship("Clube", back_populates="webhooks")


class RelatorioCompartilhado(Base):
    __tablename__ = "relatorios_compartilhados"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    token_acesso: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False
    )
    atleta_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("atletas.id", ondelete="CASCADE"), nullable=False
    )
    sessao_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sessoes_analise.id", ondelete="CASCADE"), nullable=False
    )
    criado_por_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuarios.id", ondelete="SET NULL")
    )
    audit_hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    visualizacoes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LogAuditoria(Base):
    __tablename__ = "logs_auditoria"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("usuarios.id", ondelete="SET NULL")
    )
    acao: Mapped[str] = mapped_column(String(120), nullable=False)
    entidade: Mapped[str] = mapped_column(String(80), nullable=False)
    entidade_id: Mapped[str | None] = mapped_column(String(80))
    ip_origem: Mapped[str | None] = mapped_column(INET)
    hash_assinatura: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict, nullable=False
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
