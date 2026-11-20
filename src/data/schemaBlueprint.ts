export interface ColumnSpec {
  name: string;
  type: string;
  constraints: string;
  description: string;
}

export interface TableBlueprint {
  name: string;
  title: string;
  domainGroup: 'Identidade & Clubes' | 'Biomecânica 3D & IA' | 'Compliance & B2B';
  feedsScreens: string[];
  summary: string;
  relations: string[];
  columns: ColumnSpec[];
}

export const KEYPOINTS_22 = [
  '01. cabeca',
  '02. pescoco',
  '03. ombro_dir',
  '04. ombro_esq',
  '05. cotovelo_dir',
  '06. cotovelo_esq',
  '07. punho_dir',
  '08. punho_esq',
  '09. mao_dir',
  '10. mao_esq',
  '11. lombar',
  '12. sacro',
  '13. quadril_dir',
  '14. quadril_esq',
  '15. joelho_dir',
  '16. joelho_esq',
  '17. tornozelo_dir',
  '18. tornozelo_esq',
  '19. calcanhar_dir',
  '20. calcanhar_esq',
  '21. halux_dir',
  '22. halux_esq',
] as const;

export const POSICOES_CAMPO = [
  { value: 'goleiro', label: 'Goleiro', code: 'GK' },
  { value: 'zagueiro', label: 'Zagueiro', code: 'CB' },
  { value: 'lateral', label: 'Lateral', code: 'FB' },
  { value: 'volante', label: 'Volante', code: 'DM' },
  { value: 'meia', label: 'Meia', code: 'AM' },
  { value: 'ponta', label: 'Ponta', code: 'WG' },
  { value: 'centroavante', label: 'Centroavante', code: 'CF' },
] as const;

export const SCHEMA_BLUEPRINT: TableBlueprint[] = [
  {
    name: 'clubes',
    title: 'Clubes & Academias Parceiras',
    domainGroup: 'Identidade & Clubes',
    feedsScreens: ['Cadastro de Atletas e Clubes', 'Dashboard Geral', 'Relatório Executivo'],
    summary:
      'Entidade raiz multi-tenant para clubes profissionais, academias de formação e escolinhas conveniadas com código CBF/TMS.',
    relations: ['1:N atletas', '1:N sessoes_analise', '1:N webhooks_b2b'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador interno do clube' },
      { name: 'nome', type: 'varchar(180)', constraints: 'NOT NULL', description: 'Razão social ou nome esportivo' },
      { name: 'sigla', type: 'varchar(12)', constraints: 'NOT NULL', description: 'Sigla curta (ex: 5P, SFC, SEP)' },
      { name: 'cnpj', type: 'varchar(20)', constraints: 'UNIQUE', description: 'Cadastro nacional da instituição' },
      { name: 'tipo_instituicao', type: 'tipo_clube_enum', constraints: 'NOT NULL', description: 'clube_profissional, academia_base, escolinha_parceira, federacao' },
      { name: 'cbf_tms_codigo', type: 'varchar(64)', constraints: 'NULL', description: 'Identificador federativo CBF / FIFA TMS' },
      { name: 'cidade / estado_uf / pais', type: 'varchar', constraints: 'NOT NULL', description: 'Localização da sede ou CT' },
    ],
  },
  {
    name: 'atletas',
    title: 'Atletas, Antropometria & Maturação',
    domainGroup: 'Identidade & Clubes',
    feedsScreens: ['Cadastro de Atletas', 'Dashboard Geral', 'Análise Biomecânica 3D', 'Pitch Cam Mobile', 'Relatório Executivo'],
    summary:
      'Cadastro completo com as 7 posições do futebol, dados antropométricos, cálculo automático de IMC e estágio maturacional Mirwald/PVC.',
    relations: ['N:1 clubes', '1:N consentimentos_lgpd', '1:N sessoes_analise', '1:N metricas_biomecanicas'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Chave primária do atleta' },
      { name: 'clube_id', type: 'integer FK', constraints: 'REFERENCES clubes(id)', description: 'Vínculo institucional atual' },
      { name: 'codigo_5play', type: 'varchar(32)', constraints: 'UNIQUE NOT NULL', description: 'ID público de scouting (ex: 5P-0492)' },
      { name: 'categoria', type: 'categoria_competitiva_enum', constraints: 'NOT NULL', description: 'sub9, sub11, sub13, sub15, sub17, sub20, profissional' },
      { name: 'posicao_primaria', type: 'posicao_campo_enum', constraints: 'NOT NULL', description: 'goleiro, zagueiro, lateral, volante, meia, ponta, centroavante' },
      { name: 'pe_dominante', type: 'pe_dominante_enum', constraints: 'NOT NULL', description: 'destro, canhoto, ambidestro' },
      { name: 'estatura_cm / massa_corporal_kg / envergadura_cm / percentual_gordura', type: 'numeric', constraints: 'NOT NULL', description: 'Antropometria física para cálculo de torque e momentos de força' },
      { name: 'estagio_maturacional / mirwald_offset_anos', type: 'estagio_maturacional_enum', constraints: 'NOT NULL', description: 'pre_pvc, pvc_em_andamento, pos_pvc e offset Mirwald' },
      { name: 'alerta_assimetria_pelvica / historico_clinico', type: 'boolean / jsonb', constraints: 'NOT NULL', description: 'Guardrails articulares e ocorrências médicas' },
    ],
  },
  {
    name: 'consentimentos_lgpd',
    title: 'Consentimentos LGPD (Menores de Base)',
    domainGroup: 'Compliance & B2B',
    feedsScreens: ['Cadastro de Atletas', 'Captura Mobile HUD', 'Relatório Executivo B2B'],
    summary:
      'Controle legal obrigatório para atletas menores de 18 anos, exigindo assinatura de responsável legal antes da captura biométrica e compartilhamento B2B.',
    relations: ['N:1 atletas'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador do termo' },
      { name: 'atleta_id', type: 'integer FK', constraints: 'REFERENCES atletas(id)', description: 'Atleta vinculado ao consentimento' },
      { name: 'atleta_menor_idade', type: 'boolean', constraints: 'NOT NULL', description: 'Flag de proteção estatutária (< 18 anos)' },
      { name: 'responsavel_legal_nome / cpf_final', type: 'varchar', constraints: 'NOT NULL', description: 'Identificação do pai, mãe ou tutor legal' },
      { name: 'finalidade_captura_biometrica / scouting_b2b', type: 'boolean', constraints: 'NOT NULL', description: 'Escopos autorizados pelo responsável' },
      { name: 'hash_documento_assinado', type: 'varchar(64)', constraints: 'NOT NULL', description: 'Assinatura criptográfica SHA-256 do termo PDF' },
      { name: 'status', type: 'status_lgpd_enum', constraints: 'NOT NULL', description: 'pendente, autorizado, revogado, expirado' },
    ],
  },
  {
    name: 'sessoes_analise',
    title: 'Sessões de Análise & Pipeline Vídeo',
    domainGroup: 'Biomecânica 3D & IA',
    feedsScreens: ['Pitch Cam Mobile HUD', 'Análise Biomecânica 3D', 'Dashboard Geral'],
    summary:
      'Orquestra capturas 4K/60fps ou móveis, enfileiramento no Redis/BullMQ, inferência em GPU e referências S3/MinIO para vídeo bruto e overlay 3D.',
    relations: ['N:1 atletas', 'N:1 clubes', 'N:1 usuarios', '1:1 metricas_biomecanicas'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador da sessão' },
      { name: 'codigo_sessao', type: 'varchar(40)', constraints: 'UNIQUE NOT NULL', description: 'Código da sessão (ex: #BK-8829)' },
      { name: 'tipo_teste / modo_captura', type: 'enums', constraints: 'NOT NULL', description: 'finalizacao, sprint_20m, salto_vertical, agilidade_cod, chute_apoio' },
      { name: 'status_processamento / progresso_percentual', type: 'enum / smallint', constraints: 'NOT NULL', description: 'aguardando_upload, na_fila_redis, processando_ia, concluida, auditada' },
      { name: 'redis_job_id / worker_gpu_node', type: 'varchar', constraints: 'NULL', description: 'Rastreio do job na fila Redis e nó TensorRT/GPU' },
      { name: 'video_s3_bucket / video_s3_key / video_overlay_s3_key', type: 'varchar / text', constraints: 'NOT NULL', description: 'Localização no MinIO/S3 do vídeo bruto e render 3D' },
      { name: 'keyframes_criticos / acwr_carga_aguda_cronica', type: 'jsonb / numeric', constraints: 'NOT NULL', description: 'Marcadores da timeline (Sprint, Apoio, Impacto, COD) e carga ACWR' },
    ],
  },
  {
    name: 'metricas_biomecanicas',
    title: 'Métricas Biomecânicas (22 Pontos & 4 KPIs)',
    domainGroup: 'Biomecânica 3D & IA',
    feedsScreens: ['Análise Biomecânica 3D', 'Dashboard Geral', 'Relatório Executivo'],
    summary:
      'Armazena os 22 marcadores ópticos 3D, micro-ângulos articulares, reação ao solo (GRF), simetria bilateral e os 4 KPIs centrais (IPB, SPE, IETP, IPS).',
    relations: ['1:1 sessoes_analise', 'N:1 atletas'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador do registro cinemático' },
      { name: 'sessao_id', type: 'integer FK', constraints: 'UNIQUE REFERENCES sessoes_analise(id)', description: 'Sessão de captura originária' },
      { name: 'ipb_prontidao_biomecanica', type: 'numeric(5,2)', constraints: '0..100 NOT NULL', description: 'KPI IPB: Prontidão Biomecânica' },
      { name: 'spe_potencia_explosao', type: 'numeric(5,2)', constraints: '0..100 NOT NULL', description: 'KPI SPE: Potência & Explosão' },
      { name: 'ietp_eficiencia_tecnica', type: 'numeric(5,2)', constraints: '0..100 NOT NULL', description: 'KPI IETP: Eficiência Técnica' },
      { name: 'ips_potencial_scouting', type: 'numeric(5,2)', constraints: '0..100 NOT NULL', description: 'KPI IPS: Potencial de Scouting' },
      { name: 'pontos_opticos_22', type: 'jsonb', constraints: 'NOT NULL', description: 'Coordenadas 3D (x,y,z,confiança) dos 22 marcadores corporais' },
      { name: 'flexao_joelho / rotacao_quadril / dorsiflexao / valgo_dinamico', type: 'numeric(6,2)', constraints: 'NULL', description: 'Micro-ângulos articulares no ponto de impacto' },
      { name: 'velocidade_pico_kmh / vetor_grf_bw / assimetria_bilateral_pct', type: 'numeric', constraints: 'NULL', description: 'Velocidade de sprint/chute, força solo BW e simetria bilateral' },
    ],
  },
  {
    name: 'benchmarks_posicao',
    title: 'Benchmarks por Posição & Nível',
    domainGroup: 'Biomecânica 3D & IA',
    feedsScreens: ['Radar 5 Eixos (Análise 3D)', 'Tabela Comparativa (Relatório Executivo)'],
    summary:
      'Parametrização de referência para cada uma das 7 posições em categorias de base CBF e ligas profissionais (Série A e Top 5 Europa).',
    relations: ['UNIQUE(posicao, nivel_referencia)'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador do benchmark' },
      { name: 'posicao', type: 'posicao_campo_enum', constraints: 'NOT NULL', description: 'Uma das 7 posições oficiais de campo' },
      { name: 'nivel_referencia', type: 'nivel_benchmark_enum', constraints: 'NOT NULL', description: 'cbf_sub11..cbf_sub20, serie_a_pro, top5_europa' },
      { name: 'vmax_kmh / split_0_10m_seg / potencia_chute_kmh', type: 'numeric', constraints: 'NOT NULL', description: 'Parâmetros lineares e de disparo da posição' },
      { name: 'assimetria_max_pct / rsi_mod_alvo / valgo_max_seguro_graus', type: 'numeric', constraints: 'NOT NULL', description: 'Limiares de segurança ligamentar e força reativa' },
      { name: 'ipb_medio / spe_medio / ietp_medio / ips_medio', type: 'numeric(5,2)', constraints: 'NOT NULL', description: 'Médias de referência dos 4 KPIs' },
    ],
  },
  {
    name: 'webhooks_b2b',
    title: 'Webhooks B2B & Integrações Clube',
    domainGroup: 'Compliance & B2B',
    feedsScreens: ['Perfil do Administrador', 'Cadastro de Clubes', 'Pipeline de Exportação'],
    summary:
      'Subscrições assinadas por HMAC-SHA256 para envio de eventos em tempo real para sistemas dos clubes (CBF/TMS, Catapult, STATSports, Vicon, ERPs).',
    relations: ['N:1 clubes'],
    columns: [
      { name: 'id', type: 'serial PK', constraints: 'NOT NULL', description: 'Identificador do webhook' },
      { name: 'clube_id', type: 'integer FK', constraints: 'REFERENCES clubes(id)', description: 'Clube destinatário dos eventos' },
      { name: 'tipo_sistema', type: 'sistema_externo_b2b_enum', constraints: 'NOT NULL', description: 'cbf_tms, catapult_gps, statsports, vicon_nexus, kistler_force_plate, erp_clube_custom' },
      { name: 'endpoint_url', type: 'text', constraints: 'NOT NULL', description: 'URL HTTPS receptora do clube' },
      { name: 'secret_hmac_sha256_hash', type: 'varchar(64)', constraints: 'NOT NULL', description: 'Hash da chave de assinatura de payload' },
      { name: 'eventos_assinados', type: 'jsonb', constraints: 'NOT NULL', description: 'Lista de eventos assinados (ex: sessao.concluida)' },
      { name: 'ativo / ultimo_status_http / total_falhas_consecutivas', type: 'boolean / smallint', constraints: 'NOT NULL', description: 'Saúde e controle de entrega B2B' },
    ],
  },
  {
    name: 'relatorios_compartilhados',
    title: 'Dossiês Executivos & Links Seguros',
    domainGroup: 'Compliance & B2B',
    feedsScreens: ['Relatório Executivo de Scouting (Visão do Clube)', 'Análise Biomecânica 3D'],
    summary:
      'Tokens UUID com expiração configurável e hash de auditoria para compartilhamento criptografado com diretores de clubes visitantes.',
    relations: ['N:1 atletas', 'N:1 sessoes_analise', 'N:1 usuarios'],
    columns: [
      { name: 'token_acesso', type: 'uuid', constraints: 'UNIQUE NOT NULL', description: 'Token criptográfico de acesso convidado' },
      { name: 'audit_hash_sha256', type: 'varchar(64)', constraints: 'NOT NULL', description: 'Selo SHA-256 de autenticidade do dossiê' },
      { name: 'expira_em / visualizacoes_count', type: 'timestamptz / integer', constraints: 'NOT NULL', description: 'Janela de validade (ex: 72h / 144h) e acessos' },
    ],
  },
  {
    name: 'usuarios',
    title: 'Operadores & Governança RBAC',
    domainGroup: 'Identidade & Clubes',
    feedsScreens: ['Login', 'Logout Seguro', 'Perfil do Administrador'],
    summary:
      'Perfis técnicos vinculados ao Firebase Auth UID com controle de acesso por papel (super_admin, fisiologista, head_scout, treinador, medico).',
    relations: ['1:N sessoes_analise', '1:N logs_auditoria'],
    columns: [
      { name: 'firebase_uid', type: 'varchar(128)', constraints: 'UNIQUE NOT NULL', description: 'UID federado via Firebase Authentication' },
      { name: 'papel', type: 'papel_usuario_enum', constraints: 'NOT NULL', description: 'Papel RBAC de governança no sistema' },
      { name: 'registro_classe', type: 'varchar(80)', constraints: 'NULL', description: 'Registro profissional (CREFITO / CONFEF)' },
    ],
  },
  {
    name: 'logs_auditoria',
    title: 'Trilha Imutável de Auditoria',
    domainGroup: 'Compliance & B2B',
    feedsScreens: ['Perfil do Administrador', 'Logout Seguro'],
    summary:
      'Registro cronológico assinado em SHA-256 para cada cadastro, atualização de benchmark, alteração LGPD e disparo de webhook.',
    relations: ['N:1 usuarios'],
    columns: [
      { name: 'acao / entidade / entidade_id', type: 'varchar', constraints: 'NOT NULL', description: 'Evento auditado e alvo afetado' },
      { name: 'hash_assinatura', type: 'varchar(64)', constraints: 'NOT NULL', description: 'Assinatura SHA-256 de integridade' },
      { name: 'criado_em', type: 'timestamptz', constraints: 'NOT NULL', description: 'Timestamp imutável do evento' },
    ],
  },
];
