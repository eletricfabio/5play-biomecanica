-- ============================================================================
-- 5PLAY SPORTS | KINEPITCH AI
-- Etapa 1: Script DDL Completo em PostgreSQL 16+
-- Arquitetura Multi-Tenant para Biomecânica Esportiva 3D, Scouting & LGPD
-- ============================================================================

BEGIN;

-- Extensões recomendadas para UUIDs v4/v7, buscas textuais e criptografia
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. TIPOS ENUMERADOS (DOMÍNIO ESPORTIVO, BIOMECÂNICO E COMPLIANCE)
-- ============================================================================

CREATE TYPE tipo_clube_enum AS ENUM (
  'clube_profissional',
  'academia_base',
  'escolinha_parceira',
  'federacao'
);

CREATE TYPE papel_usuario_enum AS ENUM (
  'super_admin',
  'fisiologista',
  'head_scout',
  'treinador',
  'medico',
  'visualizador_convidado'
);

CREATE TYPE categoria_competitiva_enum AS ENUM (
  'sub9',
  'sub11',
  'sub13',
  'sub15',
  'sub17',
  'sub20',
  'profissional'
);

-- Posições táticas solicitadas explicitamente para o domínio de futebol
CREATE TYPE posicao_campo_enum AS ENUM (
  'goleiro',
  'zagueiro',
  'lateral',
  'volante',
  'meia',
  'ponta',
  'centroavante'
);

CREATE TYPE pe_dominante_enum AS ENUM (
  'destro',
  'canhoto',
  'ambidestro'
);

CREATE TYPE tipo_contrato_enum AS ENUM (
  'formacao_fdi',
  'profissional_cbf',
  'amador_federado',
  'avaliacao_trial',
  'agente_livre'
);

-- Estágio maturacional baseado no Pico de Velocidade de Crescimento (Mirwald / PVC)
CREATE TYPE estagio_maturacional_enum AS ENUM (
  'pre_pvc',
  'pvc_em_andamento',
  'pos_pvc'
);

CREATE TYPE status_lgpd_enum AS ENUM (
  'pendente',
  'autorizado',
  'revogado',
  'expirado'
);

CREATE TYPE tipo_teste_biomecanico_enum AS ENUM (
  'finalizacao',
  'sprint_20m',
  'salto_vertical',
  'agilidade_cod',
  'chute_apoio'
);

CREATE TYPE modo_captura_enum AS ENUM (
  'pitch_cam_mobile',
  'stereo_4k_60fps',
  'vicon_12cam_240fps',
  'drone_tatico'
);

CREATE TYPE status_processamento_enum AS ENUM (
  'aguardando_upload',
  'na_fila_redis',
  'processando_ia',
  'concluida',
  'erro_calibracao',
  'auditada'
);

CREATE TYPE nivel_benchmark_enum AS ENUM (
  'cbf_sub11',
  'cbf_sub13',
  'cbf_sub15',
  'cbf_sub17',
  'cbf_sub20',
  'serie_a_pro',
  'top5_europa'
);

CREATE TYPE sistema_externo_b2b_enum AS ENUM (
  'cbf_tms',
  'catapult_gps',
  'statsports',
  'vicon_nexus',
  'kistler_force_plate',
  'erp_clube_custom'
);

-- ============================================================================
-- 2. TABELA: usuarios (Governança, Perfil do Administrador & RBAC)
-- Feeds: Login, Logout Seguro, Perfil do Administrador
-- ============================================================================
CREATE TABLE usuarios (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firebase_uid          VARCHAR(128) NOT NULL UNIQUE,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  nome_completo         VARCHAR(180) NOT NULL,
  cargo_institucional   VARCHAR(150),
  departamento          VARCHAR(150),
  registro_classe       VARCHAR(80), -- Ex: CREFITO-3 / 118492-F
  telefone_corp         VARCHAR(32),
  papel                 papel_usuario_enum NOT NULL DEFAULT 'head_scout',
  idioma                VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  fuso_horario          VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  mfa_fido2_ativo       BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login_em       TIMESTAMPTZ,
  ultimo_ip             INET,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_papel ON usuarios(papel);

-- ============================================================================
-- 3. TABELA: clubes (Tenant B2B, Academias e Escolinhas Parceiras)
-- Feeds: Cadastro e Gestão de Clubes, Dashboard Geral, Relatório Executivo
-- ============================================================================
CREATE TABLE clubes (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome                  VARCHAR(180) NOT NULL,
  sigla                 VARCHAR(12) NOT NULL,
  cnpj                  VARCHAR(20) UNIQUE,
  tipo_instituicao      tipo_clube_enum NOT NULL DEFAULT 'clube_profissional',
  cbf_tms_codigo        VARCHAR(64),
  cidade                VARCHAR(100) NOT NULL,
  estado_uf             CHAR(2),
  pais                  VARCHAR(64) NOT NULL DEFAULT 'Brasil',
  logo_url              TEXT,
  plano_contrato        VARCHAR(40) NOT NULL DEFAULT 'enterprise_kinepitch',
  responsavel_tecnico   VARCHAR(150),
  email_contato         VARCHAR(255),
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clubes_ativo_tipo ON clubes(ativo, tipo_instituicao);

-- ============================================================================
-- 4. TABELA: atletas (Perfil Cadastral, Posição, Antropometria & Maturação)
-- Feeds: Cadastro de Atletas, Dashboard Geral, Análise 3D, Pitch Cam, Relatório
-- ============================================================================
CREATE TABLE atletas (
  id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clube_id                      BIGINT NOT NULL REFERENCES clubes(id) ON DELETE RESTRICT,
  codigo_5play                  VARCHAR(32) NOT NULL UNIQUE, -- Ex: 5P-0492
  nome_completo                 VARCHAR(200) NOT NULL,
  apelido_esportivo             VARCHAR(100),
  data_nascimento               DATE NOT NULL,
  cpf_passaporte_cripto         VARCHAR(255), -- Armazenar tokenizado/criptografado em repouso
  nacionalidade                 VARCHAR(80) NOT NULL DEFAULT 'Brasileira',
  passaporte_comunitario        VARCHAR(80), -- Ex: UE Comunitário (Itália)
  foto_url                      TEXT,

  -- Vínculo Esportivo e Posicionamento Tático
  categoria                     categoria_competitiva_enum NOT NULL,
  posicao_primaria              posicao_campo_enum NOT NULL,
  posicao_secundaria            posicao_campo_enum,
  numero_camisa                 SMALLINT CHECK (numero_camisa BETWEEN 1 AND 99),
  pe_dominante                  pe_dominante_enum NOT NULL DEFAULT 'destro',
  tipo_contrato                 tipo_contrato_enum NOT NULL DEFAULT 'formacao_fdi',
  empresario_agencia            VARCHAR(180),
  valencias_taticas             JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Antropometria (Métricas Físicas em Unidade Internacional)
  estatura_cm                   NUMERIC(5,2) NOT NULL CHECK (estatura_cm BETWEEN 100.00 AND 230.00),
  massa_corporal_kg             NUMERIC(5,2) NOT NULL CHECK (massa_corporal_kg BETWEEN 25.00 AND 150.00),
  envergadura_cm                NUMERIC(5,2) CHECK (envergadura_cm BETWEEN 100.00 AND 245.00),
  altura_sentado_cm             NUMERIC(5,2) CHECK (altura_sentado_cm BETWEEN 50.00 AND 130.00),
  percentual_gordura            NUMERIC(4,2) CHECK (percentual_gordura BETWEEN 3.00 AND 45.00),
  imc                           NUMERIC(4,2) GENERATED ALWAYS AS (
                                  ROUND(massa_corporal_kg / POWER(estatura_cm / 100.0, 2), 2)
                                ) STORED,

  -- Maturação Biológica (Mirwald / Pico de Velocidade de Crescimento - PVC)
  estagio_maturacional          estagio_maturacional_enum NOT NULL DEFAULT 'pvc_em_andamento',
  mirwald_offset_anos           NUMERIC(4,2), -- Ex: +1.40 anos pós-PHV

  -- Saúde, Monitoramento Articular & Guardrails de IA
  historico_clinico             JSONB NOT NULL DEFAULT '[]'::jsonb,
  alerta_assimetria_pelvica     BOOLEAN NOT NULL DEFAULT TRUE,
  limiar_assimetria_graus       NUMERIC(4,2) NOT NULL DEFAULT 12.00,
  tag_gps_vinculada             VARCHAR(64),
  apto_avaliacao_3d             BOOLEAN NOT NULL DEFAULT TRUE,
  rascunho                      BOOLEAN NOT NULL DEFAULT FALSE,

  criado_em                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atletas_clube_categoria ON atletas(clube_id, categoria);
CREATE INDEX idx_atletas_posicao ON atletas(posicao_primaria);
CREATE INDEX idx_atletas_nome_trgm ON atletas USING GIN (nome_completo gin_trgm_ops);

-- ============================================================================
-- 5. TABELA: consentimentos_lgpd (Compliance Obrigatório para Menores de Base)
-- Feeds: Cadastro de Atletas, Bloqueio de Captura Mobile/3D, Relatório B2B
-- ============================================================================
CREATE TABLE consentimentos_lgpd (
  id                            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  atleta_id                     BIGINT NOT NULL REFERENCES atletas(id) ON DELETE CASCADE,
  atleta_menor_idade            BOOLEAN NOT NULL DEFAULT TRUE,
  responsavel_legal_nome        VARCHAR(200) NOT NULL,
  responsavel_legal_cpf_final   CHAR(4) NOT NULL, -- Últimos 4 dígitos para auditoria sem exposição integral
  responsavel_telefone          VARCHAR(32) NOT NULL,
  parentesco                    VARCHAR(60) NOT NULL, -- Pai, Mãe, Tutor Legal
  finalidade_captura_biometrica BOOLEAN NOT NULL DEFAULT TRUE,
  finalidade_scouting_b2b       BOOLEAN NOT NULL DEFAULT FALSE,
  termo_versao                  VARCHAR(32) NOT NULL DEFAULT 'LGPD-BASE-2025.1',
  hash_documento_assinado       CHAR(64) NOT NULL, -- SHA-256 do PDF assinado
  ip_aceite                     INET,
  user_agent                    TEXT,
  status                        status_lgpd_enum NOT NULL DEFAULT 'pendente',
  assinado_em                   TIMESTAMPTZ,
  valido_ate                    TIMESTAMPTZ,
  revogado_em                   TIMESTAMPTZ,
  motivo_revogacao              TEXT,
  criado_em                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_lgpd_menor_autorizado CHECK (
    (status <> 'autorizado') OR (assinado_em IS NOT NULL AND finalidade_captura_biometrica = TRUE)
  )
);

CREATE INDEX idx_lgpd_atleta_status ON consentimentos_lgpd(atleta_id, status);

-- ============================================================================
-- 6. TABELA: sessoes_analise (Ingestão de Vídeo S3/MinIO, Fila Redis & Status IA)
-- Feeds: Pitch Cam Mobile HUD, Análise Biomecânica 3D, Dashboard Geral
-- ============================================================================
CREATE TABLE sessoes_analise (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_sessao             VARCHAR(40) NOT NULL UNIQUE, -- Ex: #BK-8829 / KINE-2025-089A
  atleta_id                 BIGINT NOT NULL REFERENCES atletas(id) ON DELETE CASCADE,
  clube_id                  BIGINT NOT NULL REFERENCES clubes(id) ON DELETE RESTRICT,
  operador_id               BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,

  tipo_teste                tipo_teste_biomecanico_enum NOT NULL,
  contexto                  VARCHAR(40) NOT NULL DEFAULT 'treino', -- treino | partida_oficial | studio
  modo_captura              modo_captura_enum NOT NULL DEFAULT 'stereo_4k_60fps',
  fps_captura               SMALLINT NOT NULL DEFAULT 60 CHECK (fps_captura IN (30, 60, 120, 240)),
  resolucao                 VARCHAR(20) NOT NULL DEFAULT '4K',
  distancia_estimada_m      NUMERIC(5,2),
  calibracao_pitch_ativa    BOOLEAN NOT NULL DEFAULT TRUE,

  -- Pipeline Assíncrono (Redis / BullMQ + Cluster GPU)
  status_processamento      status_processamento_enum NOT NULL DEFAULT 'aguardando_upload',
  progresso_percentual      SMALLINT NOT NULL DEFAULT 0 CHECK (progresso_percentual BETWEEN 0 AND 100),
  redis_job_id              VARCHAR(128),
  worker_gpu_node           VARCHAR(80), -- Ex: Cluster TensorRT A100 / Alpha-Compute-02
  latencia_inferencia_ms    NUMERIC(6,2),

  -- Armazenamento Compatível S3 / MinIO
  video_s3_bucket           VARCHAR(120) NOT NULL DEFAULT 'kinepitch-videos-raw',
  video_s3_key              TEXT NOT NULL,
  video_overlay_s3_key      TEXT,
  thumbnail_s3_key          TEXT,
  duracao_segundos          NUMERIC(7,2),
  total_frames              INTEGER,

  -- Eventos e Síntese Clínica
  keyframes_criticos        JSONB NOT NULL DEFAULT '[]'::jsonb, -- Ex: [00:03.20 Sprint, 00:06.58 Apoio, 00:07.12 Impacto]
  selo_certificacao         VARCHAR(40) NOT NULL DEFAULT 'studio_ouro',
  acwr_carga_aguda_cronica  NUMERIC(4,2), -- Ex: 1.05 Sweet Spot
  sintese_ia_texto          TEXT,

  capturada_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em              TIMESTAMPTZ,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessoes_atleta_data ON sessoes_analise(atleta_id, capturada_em DESC);
CREATE INDEX idx_sessoes_status ON sessoes_analise(status_processamento);

-- ============================================================================
-- 7. TABELA: metricas_biomecanicas (22 Pontos Ópticos, Ângulos, Simetria & 4 KPIs)
-- Feeds: Análise Biomecânica 3D, Dashboard Geral, Relatório Executivo
-- ============================================================================
CREATE TABLE metricas_biomecanicas (
  id                                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sessao_id                         BIGINT NOT NULL UNIQUE REFERENCES sessoes_analise(id) ON DELETE CASCADE,
  atleta_id                         BIGINT NOT NULL REFERENCES atletas(id) ON DELETE CASCADE,
  frame_referencia                  INTEGER NOT NULL DEFAULT 395,
  timestamp_segundos                NUMERIC(8,3) NOT NULL DEFAULT 6.580,

  -- Os 4 KPIs Executivos da Plataforma (0 a 100)
  ipb_prontidao_biomecanica         NUMERIC(5,2) NOT NULL CHECK (ipb_prontidao_biomecanica BETWEEN 0 AND 100),
  spe_potencia_explosao             NUMERIC(5,2) NOT NULL CHECK (spe_potencia_explosao BETWEEN 0 AND 100),
  ietp_eficiencia_tecnica           NUMERIC(5,2) NOT NULL CHECK (ietp_eficiencia_tecnica BETWEEN 0 AND 100),
  ips_potencial_scouting            NUMERIC(5,2) NOT NULL CHECK (ips_potencial_scouting BETWEEN 0 AND 100),

  -- Esqueleto 3D de 22 Pontos Ópticos (OpenCap / KinePitch Markerless)
  -- Estrutura esperada de chaves (22 pontos):
  -- cabeca, pescoco, ombro_dir, ombro_esq, cotovelo_dir, cotovelo_esq,
  -- punho_dir, punho_esq, mao_dir, mao_esq, lombar, sacro, quadril_dir, quadril_esq,
  -- joelho_dir, joelho_esq, tornozelo_dir, tornozelo_esq, calcanhar_dir, calcanhar_esq, halux_dir, halux_esq
  pontos_opticos_22                 JSONB NOT NULL,
  confianca_rastreamento_pct        NUMERIC(5,2) NOT NULL DEFAULT 99.40 CHECK (confianca_rastreamento_pct BETWEEN 0 AND 100),

  -- Micro-ângulos Cinemáticos Articulares (em Graus)
  flexao_joelho_esq_graus           NUMERIC(6,2),
  flexao_joelho_dir_graus           NUMERIC(6,2),
  extensao_joelho_chute_graus       NUMERIC(6,2),
  rotacao_quadril_graus             NUMERIC(6,2),
  inclinacao_pelvica_lateral_graus  NUMERIC(6,2),
  dorsiflexao_tornozelo_graus       NUMERIC(6,2),
  valgo_dinamico_joelho_graus       NUMERIC(6,2),

  -- Cinemática Linear, Força de Reação do Solo (GRF) e Simetria Bilateral
  velocidade_pico_kmh               NUMERIC(6,2),
  velocidade_pe_chute_kmh           NUMERIC(6,2),
  velocidade_bola_kmh               NUMERIC(6,2),
  split_0_10m_seg                   NUMERIC(5,3),
  desaceleracao_max_ms2             NUMERIC(6,2),
  vetor_grf_bw                      NUMERIC(5,2), -- Body Weight (ex: 2.40 BW)
  torque_articular_nm               NUMERIC(7,2),
  velocidade_angular_joelho_graus_s NUMERIC(7,2),
  altura_salto_cm                   NUMERIC(5,2),
  rsi_reativo                       NUMERIC(5,3),
  assimetria_bilateral_pct          NUMERIC(5,2) CHECK (assimetria_bilateral_pct BETWEEN 0 AND 100),

  criado_em                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_22_pontos_opticos CHECK (jsonb_typeof(pontos_opticos_22) = 'object')
);

CREATE INDEX idx_metricas_atleta ON metricas_biomecanicas(atleta_id);
CREATE INDEX idx_metricas_kpis ON metricas_biomecanicas(ipb_prontidao_biomecanica, spe_potencia_explosao, ietp_eficiencia_tecnica, ips_potencial_scouting);

-- ============================================================================
-- 8. TABELA: benchmarks_posicao (Comparação por Posição & Nível Competitivo)
-- Feeds: Radar de 5 Eixos (Análise 3D), Tabela Comparativa (Relatório Executivo)
-- ============================================================================
CREATE TABLE benchmarks_posicao (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  posicao                 posicao_campo_enum NOT NULL,
  nivel_referencia        nivel_benchmark_enum NOT NULL,
  amostra_n               INTEGER NOT NULL DEFAULT 100 CHECK (amostra_n > 0),

  vmax_kmh                NUMERIC(6,2) NOT NULL,
  split_0_10m_seg         NUMERIC(5,3) NOT NULL,
  potencia_chute_kmh      NUMERIC(6,2) NOT NULL,
  assimetria_max_pct      NUMERIC(5,2) NOT NULL,
  rsi_mod_alvo            NUMERIC(5,3) NOT NULL,
  valgo_max_seguro_graus  NUMERIC(5,2) NOT NULL,

  ipb_medio               NUMERIC(5,2) NOT NULL,
  spe_medio               NUMERIC(5,2) NOT NULL,
  ietp_medio              NUMERIC(5,2) NOT NULL,
  ips_medio               NUMERIC(5,2) NOT NULL,

  fonte_estudo            VARCHAR(150) NOT NULL DEFAULT 'Base Oficial 5Play KinePitch Lab',
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (posicao, nivel_referencia)
);

-- ============================================================================
-- 9. TABELA: webhooks_b2b (Integrações B2B com Clubes, TMS & Telemetria)
-- Feeds: Perfil do Administrador, Cadastro de Clubes, Pipeline de Exportação
-- ============================================================================
CREATE TABLE webhooks_b2b (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clube_id                    BIGINT NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nome_integracao             VARCHAR(150) NOT NULL,
  tipo_sistema                sistema_externo_b2b_enum NOT NULL,
  endpoint_url                TEXT NOT NULL,
  secret_hmac_sha256_hash     CHAR(64) NOT NULL,
  eventos_assinados           JSONB NOT NULL DEFAULT '["sessao.concluida", "alerta.assimetria_critica"]'::jsonb,
  headers_custom              JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo                       BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_entrega_em           TIMESTAMPTZ,
  ultimo_status_http          SMALLINT,
  total_falhas_consecutivas   SMALLINT NOT NULL DEFAULT 0,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_clube_ativo ON webhooks_b2b(clube_id, ativo);

-- ============================================================================
-- 10. TABELA: relatorios_compartilhados & logs_auditoria (Segurança & Compliance)
-- Feeds: Relatório Executivo de Scouting (Link Seguro), Perfil Admin, Logout
-- ============================================================================
CREATE TABLE relatorios_compartilhados (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_acesso          UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  atleta_id             BIGINT NOT NULL REFERENCES atletas(id) ON DELETE CASCADE,
  sessao_id             BIGINT NOT NULL REFERENCES sessoes_analise(id) ON DELETE CASCADE,
  criado_por_id         BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  audit_hash_sha256     CHAR(64) NOT NULL,
  expira_em             TIMESTAMPTZ NOT NULL,
  visualizacoes_count   INTEGER NOT NULL DEFAULT 0,
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logs_auditoria (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id            BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao                  VARCHAR(120) NOT NULL,
  entidade              VARCHAR(80) NOT NULL,
  entidade_id           VARCHAR(80),
  ip_origem             INET,
  hash_assinatura       CHAR(64) NOT NULL,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auditoria_data ON logs_auditoria(criado_em DESC);

COMMIT;
