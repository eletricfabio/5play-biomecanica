import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// ENUMS DE DOMÍNIO - 5PLAY SPORTS / KINEPITCH AI
// ============================================================================

export const tipoClubeEnum = pgEnum('tipo_clube_enum', [
  'clube_profissional',
  'academia_base',
  'escolinha_parceira',
  'federacao',
]);

export const papelUsuarioEnum = pgEnum('papel_usuario_enum', [
  'super_admin',
  'fisiologista',
  'head_scout',
  'treinador',
  'medico',
  'visualizador_convidado',
]);

export const categoriaCompetitivaEnum = pgEnum('categoria_competitiva_enum', [
  'sub9',
  'sub11',
  'sub13',
  'sub15',
  'sub17',
  'sub20',
  'profissional',
]);

export const posicaoCampoEnum = pgEnum('posicao_campo_enum', [
  'goleiro',
  'zagueiro',
  'lateral',
  'volante',
  'meia',
  'ponta',
  'centroavante',
]);

export const peDominanteEnum = pgEnum('pe_dominante_enum', [
  'destro',
  'canhoto',
  'ambidestro',
]);

export const tipoContratoEnum = pgEnum('tipo_contrato_enum', [
  'formacao_fdi',
  'profissional_cbf',
  'amador_federado',
  'avaliacao_trial',
  'agente_livre',
]);

export const estagioMaturacionalEnum = pgEnum('estagio_maturacional_enum', [
  'pre_pvc',
  'pvc_em_andamento',
  'pos_pvc',
]);

export const statusLgpdEnum = pgEnum('status_lgpd_enum', [
  'pendente',
  'autorizado',
  'revogado',
  'expirado',
]);

export const tipoTesteBiomecanicoEnum = pgEnum('tipo_teste_biomecanico_enum', [
  'finalizacao',
  'sprint_20m',
  'salto_vertical',
  'agilidade_cod',
  'chute_apoio',
]);

export const modoCapturaEnum = pgEnum('modo_captura_enum', [
  'pitch_cam_mobile',
  'stereo_4k_60fps',
  'vicon_12cam_240fps',
  'drone_tatico',
]);

export const statusProcessamentoEnum = pgEnum('status_processamento_enum', [
  'aguardando_upload',
  'na_fila_redis',
  'processando_ia',
  'concluida',
  'erro_calibracao',
  'auditada',
]);

export const nivelBenchmarkEnum = pgEnum('nivel_benchmark_enum', [
  'cbf_sub11',
  'cbf_sub13',
  'cbf_sub15',
  'cbf_sub17',
  'cbf_sub20',
  'serie_a_pro',
  'top5_europa',
]);

export const sistemaExternoB2bEnum = pgEnum('sistema_externo_b2b_enum', [
  'cbf_tms',
  'catapult_gps',
  'statsports',
  'vicon_nexus',
  'kistler_force_plate',
  'erp_clube_custom',
]);

// ============================================================================
// 1. USUÁRIOS (Governança, Autenticação Firebase & RBAC)
// ============================================================================
export const users = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  uid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  nomeCompleto: varchar('nome_completo', { length: 180 }).notNull(),
  cargoInstitucional: varchar('cargo_institucional', { length: 150 }),
  departamento: varchar('departamento', { length: 150 }),
  registroClasse: varchar('registro_classe', { length: 80 }),
  telefoneCorp: varchar('telefone_corp', { length: 32 }),
  papel: papelUsuarioEnum('papel').notNull().default('head_scout'),
  idioma: varchar('idioma', { length: 16 }).notNull().default('pt-BR'),
  fusoHorario: varchar('fuso_horario', { length: 64 }).notNull().default('America/Sao_Paulo'),
  mfaFido2Ativo: boolean('mfa_fido2_ativo').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  ultimoLoginEm: timestamp('ultimo_login_em', { withTimezone: true }),
  ultimoIp: varchar('ultimo_ip', { length: 64 }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 2. CLUBES & ACADEMIAS PARCEIRAS
// ============================================================================
export const clubes = pgTable('clubes', {
  id: serial('id').primaryKey(),
  nome: varchar('nome', { length: 180 }).notNull(),
  sigla: varchar('sigla', { length: 12 }).notNull(),
  cnpj: varchar('cnpj', { length: 20 }).unique(),
  tipoInstituicao: tipoClubeEnum('tipo_instituicao').notNull().default('clube_profissional'),
  cbfTmsCodigo: varchar('cbf_tms_codigo', { length: 64 }),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estadoUf: varchar('estado_uf', { length: 4 }),
  pais: varchar('pais', { length: 64 }).notNull().default('Brasil'),
  logoUrl: text('logo_url'),
  planoContrato: varchar('plano_contrato', { length: 40 }).notNull().default('enterprise_kinepitch'),
  responsavelTecnico: varchar('responsavel_tecnico', { length: 150 }),
  emailContato: varchar('email_contato', { length: 255 }),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 3. ATLETAS (Antropometria, Maturação Mirwald/PVC e 7 Posições)
// ============================================================================
export const atletas = pgTable('atletas', {
  id: serial('id').primaryKey(),
  clubeId: integer('clube_id')
    .notNull()
    .references(() => clubes.id, { onDelete: 'restrict' }),
  codigo5play: varchar('codigo_5play', { length: 32 }).notNull().unique(),
  nomeCompleto: varchar('nome_completo', { length: 200 }).notNull(),
  apelidoEsportivo: varchar('apelido_esportivo', { length: 100 }),
  dataNascimento: date('data_nascimento').notNull(),
  cpfPassaporteCripto: varchar('cpf_passaporte_cripto', { length: 255 }),
  nacionalidade: varchar('nacionalidade', { length: 80 }).notNull().default('Brasileira'),
  passaporteComunitario: varchar('passaporte_comunitario', { length: 80 }),
  fotoUrl: text('foto_url'),

  categoria: categoriaCompetitivaEnum('categoria').notNull(),
  posicaoPrimaria: posicaoCampoEnum('posicao_primaria').notNull(),
  posicaoSecundaria: posicaoCampoEnum('posicao_secundaria'),
  numeroCamisa: smallint('numero_camisa'),
  peDominante: peDominanteEnum('pe_dominante').notNull().default('destro'),
  tipoContrato: tipoContratoEnum('tipo_contrato').notNull().default('formacao_fdi'),
  empresarioAgencia: varchar('empresario_agencia', { length: 180 }),
  valenciasTaticas: jsonb('valencias_taticas').$type<string[]>().notNull().default([]),

  // Antropometria
  estaturaCm: numeric('estatura_cm', { precision: 5, scale: 2 }).notNull(),
  massaCorporalKg: numeric('massa_corporal_kg', { precision: 5, scale: 2 }).notNull(),
  envergaduraCm: numeric('envergadura_cm', { precision: 5, scale: 2 }),
  alturaSentadoCm: numeric('altura_sentado_cm', { precision: 5, scale: 2 }),
  percentualGordura: numeric('percentual_gordura', { precision: 4, scale: 2 }),
  imc: numeric('imc', { precision: 4, scale: 2 }),

  // Maturação Biológica (Mirwald / PVC)
  estagioMaturacional: estagioMaturacionalEnum('estagio_maturacional').notNull().default('pvc_em_andamento'),
  mirwaldOffsetAnos: numeric('mirwald_offset_anos', { precision: 4, scale: 2 }),

  // Saúde e Guardrails IA
  historicoClinico: jsonb('historico_clinico')
    .$type<Array<{ ocorrencia: string; status: string }>>()
    .notNull()
    .default([]),
  alertaAssimetriaPelvica: boolean('alerta_assimetria_pelvica').notNull().default(true),
  limiarAssimetriaGraus: numeric('limiar_assimetria_graus', { precision: 4, scale: 2 })
    .notNull()
    .default('12.00'),
  tagGpsVinculada: varchar('tag_gps_vinculada', { length: 64 }),
  aptoAvaliacao3d: boolean('apto_avaliacao_3d').notNull().default(true),
  rascunho: boolean('rascunho').notNull().default(false),

  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 4. CONSENTIMENTOS LGPD (Obrigatório para Menores de Base)
// ============================================================================
export const consentimentosLgpd = pgTable('consentimentos_lgpd', {
  id: serial('id').primaryKey(),
  atletaId: integer('atleta_id')
    .notNull()
    .references(() => atletas.id, { onDelete: 'cascade' }),
  atletaMenorIdade: boolean('atleta_menor_idade').notNull().default(true),
  responsavelLegalNome: varchar('responsavel_legal_nome', { length: 200 }).notNull(),
  responsavelLegalCpfFinal: varchar('responsavel_legal_cpf_final', { length: 4 }).notNull(),
  responsavelTelefone: varchar('responsavel_telefone', { length: 32 }).notNull(),
  parentesco: varchar('parentesco', { length: 60 }).notNull(),
  finalidadeCapturaBiometrica: boolean('finalidade_captura_biometrica').notNull().default(true),
  finalidadeScoutingB2b: boolean('finalidade_scouting_b2b').notNull().default(false),
  termoVersao: varchar('termo_versao', { length: 32 }).notNull().default('LGPD-BASE-2025.1'),
  hashDocumentoAssinado: varchar('hash_documento_assinado', { length: 64 }).notNull(),
  ipAceite: varchar('ip_aceite', { length: 64 }),
  userAgent: text('user_agent'),
  status: statusLgpdEnum('status').notNull().default('pendente'),
  assinadoEm: timestamp('assinado_em', { withTimezone: true }),
  validoAte: timestamp('valido_ate', { withTimezone: true }),
  revogadoEm: timestamp('revogado_em', { withTimezone: true }),
  motivoRevogacao: text('motivo_revogacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 5. SESSÕES DE ANÁLISE (Pipeline Vídeo S3/MinIO + Fila Redis + GPU)
// ============================================================================
export const sessoesAnalise = pgTable('sessoes_analise', {
  id: serial('id').primaryKey(),
  codigoSessao: varchar('codigo_sessao', { length: 40 }).notNull().unique(),
  atletaId: integer('atleta_id')
    .notNull()
    .references(() => atletas.id, { onDelete: 'cascade' }),
  clubeId: integer('clube_id')
    .notNull()
    .references(() => clubes.id, { onDelete: 'restrict' }),
  operadorId: integer('operador_id').references(() => users.id, { onDelete: 'set null' }),

  tipoTeste: tipoTesteBiomecanicoEnum('tipo_teste').notNull(),
  contexto: varchar('contexto', { length: 40 }).notNull().default('treino'),
  modoCaptura: modoCapturaEnum('modo_captura').notNull().default('stereo_4k_60fps'),
  fpsCaptura: smallint('fps_captura').notNull().default(60),
  resolucao: varchar('resolucao', { length: 20 }).notNull().default('4K'),
  distanciaEstimadaM: numeric('distancia_estimada_m', { precision: 5, scale: 2 }),
  calibracaoPitchAtiva: boolean('calibracao_pitch_ativa').notNull().default(true),

  statusProcessamento: statusProcessamentoEnum('status_processamento')
    .notNull()
    .default('aguardando_upload'),
  progressoPercentual: smallint('progresso_percentual').notNull().default(0),
  redisJobId: varchar('redis_job_id', { length: 128 }),
  workerGpuNode: varchar('worker_gpu_node', { length: 80 }),
  latenciaInferenciaMs: numeric('latencia_inferencia_ms', { precision: 6, scale: 2 }),

  videoS3Bucket: varchar('video_s3_bucket', { length: 120 })
    .notNull()
    .default('kinepitch-videos-raw'),
  videoS3Key: text('video_s3_key').notNull(),
  videoOverlayS3Key: text('video_overlay_s3_key'),
  thumbnailS3Key: text('thumbnail_s3_key'),
  duracaoSegundos: numeric('duracao_segundos', { precision: 7, scale: 2 }),
  totalFrames: integer('total_frames'),

  keyframesCriticos: jsonb('keyframes_criticos')
    .$type<Array<{ tempoSeg: number; rotulo: string }>>()
    .notNull()
    .default([]),
  seloCertificacao: varchar('selo_certificacao', { length: 40 }).notNull().default('studio_ouro'),
  acwrCargaAgudaCronica: numeric('acwr_carga_aguda_cronica', { precision: 4, scale: 2 }),
  sinteseIaTexto: text('sintese_ia_texto'),

  capturadaEm: timestamp('capturada_em', { withTimezone: true }).notNull().defaultNow(),
  concluidaEm: timestamp('concluida_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 6. MÉTRICAS BIOMECÂNICAS (22 Pontos, Ângulos, Simetria & 4 KPIs)
// ============================================================================
export const metricasBiomecanicas = pgTable('metricas_biomecanicas', {
  id: serial('id').primaryKey(),
  sessaoId: integer('sessao_id')
    .notNull()
    .unique()
    .references(() => sessoesAnalise.id, { onDelete: 'cascade' }),
  atletaId: integer('atleta_id')
    .notNull()
    .references(() => atletas.id, { onDelete: 'cascade' }),
  frameReferencia: integer('frame_referencia').notNull().default(395),
  timestampSegundos: numeric('timestamp_segundos', { precision: 8, scale: 3 })
    .notNull()
    .default('6.580'),

  // 4 KPIs Principais
  ipbProntidaoBiomecanica: numeric('ipb_prontidao_biomecanica', { precision: 5, scale: 2 }).notNull(),
  spePotenciaExplosao: numeric('spe_potencia_explosao', { precision: 5, scale: 2 }).notNull(),
  ietpEficienciaTecnica: numeric('ietp_eficiencia_tecnica', { precision: 5, scale: 2 }).notNull(),
  ipsPotencialScouting: numeric('ips_potencial_scouting', { precision: 5, scale: 2 }).notNull(),

  // 22 Pontos Ópticos 3D
  pontosOpticos22: jsonb('pontos_opticos_22')
    .$type<Record<string, { x: number; y: number; z: number; confianca: number }>>()
    .notNull(),
  confiancaRastreamentoPct: numeric('confianca_rastreamento_pct', { precision: 5, scale: 2 })
    .notNull()
    .default('99.40'),

  // Micro-ângulos Articulares
  flexaoJoelhoEsqGraus: numeric('flexao_joelho_esq_graus', { precision: 6, scale: 2 }),
  flexaoJoelhoDirGraus: numeric('flexao_joelho_dir_graus', { precision: 6, scale: 2 }),
  extensaoJoelhoChuteGraus: numeric('extensao_joelho_chute_graus', { precision: 6, scale: 2 }),
  rotacaoQuadrilGraus: numeric('rotacao_quadril_graus', { precision: 6, scale: 2 }),
  inclinacaoPelvicaLateralGraus: numeric('inclinacao_pelvica_lateral_graus', {
    precision: 6,
    scale: 2,
  }),
  dorsiflexaoTornozeloGraus: numeric('dorsiflexao_tornozelo_graus', { precision: 6, scale: 2 }),
  valgoDinamicoJoelhoGraus: numeric('valgo_dinamico_joelho_graus', { precision: 6, scale: 2 }),

  // Força, Velocidade e Simetria
  velocidadePicoKmh: numeric('velocidade_pico_kmh', { precision: 6, scale: 2 }),
  velocidadePeChuteKmh: numeric('velocidade_pe_chute_kmh', { precision: 6, scale: 2 }),
  velocidadeBolaKmh: numeric('velocidade_bola_kmh', { precision: 6, scale: 2 }),
  split010mSeg: numeric('split_0_10m_seg', { precision: 5, scale: 3 }),
  desaceleracaoMaxMs2: numeric('desaceleracao_max_ms2', { precision: 6, scale: 2 }),
  vetorGrfBw: numeric('vetor_grf_bw', { precision: 5, scale: 2 }),
  torqueArticularNm: numeric('torque_articular_nm', { precision: 7, scale: 2 }),
  velocidadeAngularJoelhoGrausS: numeric('velocidade_angular_joelho_graus_s', {
    precision: 7,
    scale: 2,
  }),
  alturaSaltoCm: numeric('altura_salto_cm', { precision: 5, scale: 2 }),
  rsiReativo: numeric('rsi_reativo', { precision: 5, scale: 3 }),
  assimetriaBilateralPct: numeric('assimetria_bilateral_pct', { precision: 5, scale: 2 }),

  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 7. BENCHMARKS POR POSIÇÃO
// ============================================================================
export const benchmarksPosicao = pgTable(
  'benchmarks_posicao',
  {
    id: serial('id').primaryKey(),
    posicao: posicaoCampoEnum('posicao').notNull(),
    nivelReferencia: nivelBenchmarkEnum('nivel_referencia').notNull(),
    amostraN: integer('amostra_n').notNull().default(100),

    vmaxKmh: numeric('vmax_kmh', { precision: 6, scale: 2 }).notNull(),
    split010mSeg: numeric('split_0_10m_seg', { precision: 5, scale: 3 }).notNull(),
    potenciaChuteKmh: numeric('potencia_chute_kmh', { precision: 6, scale: 2 }).notNull(),
    assimetriaMaxPct: numeric('assimetria_max_pct', { precision: 5, scale: 2 }).notNull(),
    rsiModAlvo: numeric('rsi_mod_alvo', { precision: 5, scale: 3 }).notNull(),
    valgoMaxSeguroGraus: numeric('valgo_max_seguro_graus', { precision: 5, scale: 2 }).notNull(),

    ipbMedio: numeric('ipb_medio', { precision: 5, scale: 2 }).notNull(),
    speMedio: numeric('spe_medio', { precision: 5, scale: 2 }).notNull(),
    ietpMedio: numeric('ietp_medio', { precision: 5, scale: 2 }).notNull(),
    ipsMedio: numeric('ips_medio', { precision: 5, scale: 2 }).notNull(),

    fonteEstudo: varchar('fonte_estudo', { length: 150 })
      .notNull()
      .default('Base Oficial 5Play KinePitch Lab'),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_benchmark_posicao_nivel').on(table.posicao, table.nivelReferencia)]
);

// ============================================================================
// 8. WEBHOOKS B2B PARA INTEGRAÇÃO COM CLUBES
// ============================================================================
export const webhooksB2b = pgTable('webhooks_b2b', {
  id: serial('id').primaryKey(),
  clubeId: integer('clube_id')
    .notNull()
    .references(() => clubes.id, { onDelete: 'cascade' }),
  nomeIntegracao: varchar('nome_integracao', { length: 150 }).notNull(),
  tipoSistema: sistemaExternoB2bEnum('tipo_sistema').notNull(),
  endpointUrl: text('endpoint_url').notNull(),
  secretHmacSha256Hash: varchar('secret_hmac_sha256_hash', { length: 64 }).notNull(),
  eventosAssinados: jsonb('eventos_assinados')
    .$type<string[]>()
    .notNull()
    .default(['sessao.concluida', 'alerta.assimetria_critica']),
  headersCustom: jsonb('headers_custom').$type<Record<string, string>>().notNull().default({}),
  ativo: boolean('ativo').notNull().default(true),
  ultimaEntregaEm: timestamp('ultima_entrega_em', { withTimezone: true }),
  ultimoStatusHttp: smallint('ultimo_status_http'),
  totalFalhasConsecutivas: smallint('total_falhas_consecutivas').notNull().default(0),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// 9. RELATÓRIOS COMPARTILHADOS & LOGS DE AUDITORIA
// ============================================================================
export const relatoriosCompartilhados = pgTable('relatorios_compartilhados', {
  id: serial('id').primaryKey(),
  tokenAcesso: uuid('token_acesso').defaultRandom().notNull().unique(),
  atletaId: integer('atleta_id')
    .notNull()
    .references(() => atletas.id, { onDelete: 'cascade' }),
  sessaoId: integer('sessao_id')
    .notNull()
    .references(() => sessoesAnalise.id, { onDelete: 'cascade' }),
  criadoPorId: integer('criado_por_id').references(() => users.id, { onDelete: 'set null' }),
  auditHashSha256: varchar('audit_hash_sha256', { length: 64 }).notNull(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  visualizacoesCount: integer('visualizacoes_count').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const logsAuditoria = pgTable('logs_auditoria', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => users.id, { onDelete: 'set null' }),
  acao: varchar('acao', { length: 120 }).notNull(),
  entidade: varchar('entidade', { length: 80 }).notNull(),
  entidadeId: varchar('entidade_id', { length: 80 }),
  ipOrigem: varchar('ip_origem', { length: 64 }),
  hashAssinatura: varchar('hash_assinatura', { length: 64 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================
export const clubesRelations = relations(clubes, ({ many }) => ({
  atletas: many(atletas),
  sessoesAnalise: many(sessoesAnalise),
  webhooksB2b: many(webhooksB2b),
}));

export const atletasRelations = relations(atletas, ({ one, many }) => ({
  clube: one(clubes, {
    fields: [atletas.clubeId],
    references: [clubes.id],
  }),
  consentimentosLgpd: many(consentimentosLgpd),
  sessoesAnalise: many(sessoesAnalise),
  metricasBiomecanicas: many(metricasBiomecanicas),
}));

export const consentimentosLgpdRelations = relations(consentimentosLgpd, ({ one }) => ({
  atleta: one(atletas, {
    fields: [consentimentosLgpd.atletaId],
    references: [atletas.id],
  }),
}));

export const sessoesAnaliseRelations = relations(sessoesAnalise, ({ one }) => ({
  atleta: one(atletas, {
    fields: [sessoesAnalise.atletaId],
    references: [atletas.id],
  }),
  clube: one(clubes, {
    fields: [sessoesAnalise.clubeId],
    references: [clubes.id],
  }),
  operador: one(users, {
    fields: [sessoesAnalise.operadorId],
    references: [users.id],
  }),
  metricas: one(metricasBiomecanicas),
}));

export const metricasBiomecanicasRelations = relations(metricasBiomecanicas, ({ one }) => ({
  sessao: one(sessoesAnalise, {
    fields: [metricasBiomecanicas.sessaoId],
    references: [sessoesAnalise.id],
  }),
  atleta: one(atletas, {
    fields: [metricasBiomecanicas.atletaId],
    references: [atletas.id],
  }),
}));

export const webhooksB2bRelations = relations(webhooksB2b, ({ one }) => ({
  clube: one(clubes, {
    fields: [webhooksB2b.clubeId],
    references: [clubes.id],
  }),
}));
