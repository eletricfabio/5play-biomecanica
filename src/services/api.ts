import axios, { type AxiosError } from 'axios';
import { auth } from '../lib/firebase';

const RAW_BASE_URL = (import.meta.env.VITE_FASTAPI_URL || '').trim().replace(/\/+$/, '');

export const apiClient = axios.create({
  baseURL: RAW_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

apiClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Detecta quando um host estático (ex.: Vercel SPA rewrite) devolve index.html em vez de JSON
apiClient.interceptors.response.use(
  (response) => {
    const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
    if (
      contentType.includes('text/html') ||
      (typeof response.data === 'string' && response.data.trim().toLowerCase().startsWith('<!doctype'))
    ) {
      const err = new Error(
        'O servidor respondeu HTML em vez de JSON para /api/v1. Verifique se o backend está publicado ou configure VITE_FASTAPI_URL.'
      ) as Error & { isBackendUnavailable?: boolean; status?: number };
      err.isBackendUnavailable = true;
      err.status = 404;
      return Promise.reject(err);
    }
    return response;
  },
  (error) => Promise.reject(error)
);

/**
 * Normaliza qualquer formato de erro (string, Error, objeto {code, message}, array Pydantic 422)
 * para uma string segura — evitando o erro React #31 ao renderizar erros no JSX.
 */
export function normalizeErrorText(value: unknown, fallback = 'Erro de comunicação com a API.'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')) {
      return fallback;
    }
    return trimmed;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeErrorText(item, ''))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' | ') : fallback;
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['detail', 'message', 'msg', 'error', 'title', 'statusText']) {
      if (obj[key] !== undefined && obj[key] !== null) {
        const nested = normalizeErrorText(obj[key], '');
        if (nested) {
          const code = typeof obj.code === 'string' || typeof obj.code === 'number' ? String(obj.code) : '';
          return code && !nested.includes(code) ? `[${code}] ${nested}` : nested;
        }
      }
    }
    try {
      const serialized = JSON.stringify(obj);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

export interface ParsedApiError {
  message: string;
  status: number | null;
  isBackendUnavailable: boolean;
}

export function extractApiError(
  err: unknown,
  fallback = 'Erro de comunicação com a API.'
): ParsedApiError {
  const customErr = err as { isBackendUnavailable?: boolean; status?: number; message?: unknown };
  if (customErr?.isBackendUnavailable) {
    return {
      message: normalizeErrorText(customErr.message, fallback),
      status: customErr.status ?? 404,
      isBackendUnavailable: true,
    };
  }

  const axiosErr = err as AxiosError<{ detail?: unknown; error?: unknown; message?: unknown }>;
  const status = axiosErr?.response?.status ?? null;
  const isNetworkError = Boolean(axiosErr?.isAxiosError && !axiosErr?.response);
  const isBackendUnavailable =
    isNetworkError || status === 404 || status === 502 || status === 503 || status === 504;

  const rawPayload =
    axiosErr?.response?.data?.detail ??
    axiosErr?.response?.data?.error ??
    axiosErr?.response?.data?.message ??
    axiosErr?.response?.data;

  const normalized = normalizeErrorText(
    rawPayload ?? (err instanceof Error ? err.message : err),
    fallback
  );

  if (isBackendUnavailable) {
    const hint = RAW_BASE_URL
      ? `Backend configurado em (${RAW_BASE_URL}) não respondeu corretamente (HTTP ${status ?? 'rede'}).`
      : `Backend FastAPI/Express não publicado neste domínio (HTTP ${status ?? '404'}). Configure a variável VITE_FASTAPI_URL na Vercel.`;
    return {
      message: hint,
      status,
      isBackendUnavailable: true,
    };
  }

  return {
    message: normalized,
    status,
    isBackendUnavailable: false,
  };
}

export interface PontoOptico3D {
  x: number;
  y: number;
  z: number;
  confianca: number;
}

export type PosicaoCampo =
  | 'goleiro'
  | 'zagueiro'
  | 'lateral'
  | 'volante'
  | 'meia'
  | 'ponta'
  | 'centroavante';

export type CategoriaCompetitiva =
  | 'sub9'
  | 'sub11'
  | 'sub13'
  | 'sub15'
  | 'sub17'
  | 'sub20'
  | 'profissional';

export type EstagioMaturacional = 'pre_pvc' | 'pvc_em_andamento' | 'pos_pvc';
export type PeDominante = 'destro' | 'canhoto' | 'ambidestro';

export interface DashboardAtletaResumo {
  atleta_id: number;
  codigo_5play: string;
  nome_completo: string;
  clube_sigla?: string;
  categoria: CategoriaCompetitiva;
  posicao_primaria: PosicaoCampo;
  apto_avaliacao_3d?: boolean;
  ipb: number | null;
  spe: number | null;
  ietp: number | null;
  ips: number | null;
  velocidade_pico_kmh: number | null;
  assimetria_bilateral_pct: number | null;
  alerta_assimetria_critica: boolean;
}

export interface DashboardOverview {
  total_clubes_ativos: number;
  total_atletas: number;
  total_sessoes_concluidas: number;
  eficiencia_biomecanica_media_pct: number;
  velocidade_pico_media_kmh: number;
  velocidade_pico_max_kmh: number;
  assimetrias_criticas_count: number;
  acwr_medio_elenco: number;
  atletas_monitorados: DashboardAtletaResumo[];
}

export const EMPTY_DASHBOARD: DashboardOverview = {
  total_clubes_ativos: 0,
  total_atletas: 0,
  total_sessoes_concluidas: 0,
  eficiencia_biomecanica_media_pct: 0,
  velocidade_pico_media_kmh: 0,
  velocidade_pico_max_kmh: 0,
  assimetrias_criticas_count: 0,
  acwr_medio_elenco: 0,
  atletas_monitorados: [],
};

export interface ClubeItem {
  id: number;
  nome: string;
  sigla: string;
  cnpj: string | null;
  tipo_instituicao: string;
  cbf_tms_codigo: string | null;
  cidade: string;
  estado_uf: string | null;
  pais: string;
  plano_contrato: string;
  responsavel_tecnico?: string | null;
  email_contato?: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface CreateClubePayload {
  nome: string;
  sigla: string;
  cnpj?: string;
  tipo_instituicao: 'clube_profissional' | 'academia_base' | 'escolinha_parceira' | 'federacao';
  cbf_tms_codigo?: string;
  cidade: string;
  estado_uf?: string;
  pais?: string;
  responsavel_tecnico?: string;
  email_contato?: string;
}

export interface AtletaItem {
  id: number;
  clube_id: number;
  clube_nome?: string;
  clube_sigla?: string;
  codigo_5play: string;
  nome_completo: string;
  apelido_esportivo: string | null;
  data_nascimento: string;
  nacionalidade?: string;
  categoria: CategoriaCompetitiva;
  posicao_primaria: PosicaoCampo;
  posicao_secundaria: PosicaoCampo | null;
  numero_camisa?: number | null;
  pe_dominante: PeDominante;
  tipo_contrato?: string;
  valencias_taticas?: string[];
  estatura_cm: number;
  massa_corporal_kg: number;
  envergadura_cm: number | null;
  percentual_gordura: number | null;
  imc: number | null;
  estagio_maturacional: EstagioMaturacional;
  mirwald_offset_anos: number | null;
  apto_avaliacao_3d: boolean;
  criado_em: string;
}

export interface CreateAtletaPayload {
  clube_id: number;
  nome_completo: string;
  apelido_esportivo?: string;
  data_nascimento: string;
  nacionalidade?: string;
  categoria: CategoriaCompetitiva;
  posicao_primaria: PosicaoCampo;
  posicao_secundaria?: PosicaoCampo | null;
  numero_camisa?: number | null;
  pe_dominante: PeDominante;
  tipo_contrato?:
    | 'formacao_fdi'
    | 'profissional_cbf'
    | 'amador_federado'
    | 'avaliacao_trial'
    | 'agente_livre';
  empresario_agencia?: string;
  valencias_taticas?: string[];
  estatura_cm: number;
  massa_corporal_kg: number;
  envergadura_cm?: number | null;
  percentual_gordura?: number | null;
  estagio_maturacional: EstagioMaturacional;
  mirwald_offset_anos?: number | null;
  tag_gps_vinculada?: string;
  consentimento_lgpd?: {
    responsavel_legal_nome: string;
    responsavel_legal_cpf_final: string;
    responsavel_telefone: string;
    parentesco: string;
    finalidade_captura_biometrica: boolean;
    finalidade_scouting_b2b: boolean;
    autorizar_imediatamente: boolean;
  } | null;
}

export interface LgpdItem {
  id: number;
  atleta_id: number;
  atleta_nome: string;
  atleta_codigo: string;
  atleta_categoria: string;
  atleta_menor_idade: boolean;
  responsavel_legal_nome: string;
  responsavel_legal_cpf_final: string;
  responsavel_telefone: string;
  parentesco: string;
  termo_versao: string;
  status: 'pendente' | 'autorizado' | 'revogado' | 'expirado';
  assinado_em: string | null;
  valido_ate: string | null;
  criado_em: string;
}

export interface BenchmarkItem {
  id: number;
  posicao: PosicaoCampo;
  nivel_referencia: string;
  amostra_n?: number;
  vmax_kmh: number;
  split_0_10m_seg: number;
  potencia_chute_kmh: number;
  assimetria_max_pct: number;
  rsi_mod_alvo?: number;
  valgo_max_seguro_graus?: number;
  ipb_medio: number;
  spe_medio: number;
  ietp_medio: number;
  ips_medio: number;
  fonte_estudo?: string;
}

export interface SessaoResumoItem {
  sessao_id: number;
  codigo_sessao: string;
  atleta_id: number;
  atleta_nome: string;
  atleta_codigo: string;
  clube_nome: string;
  clube_sigla: string;
  categoria: CategoriaCompetitiva;
  posicao: PosicaoCampo;
  pe_dominante: PeDominante;
  estagio_maturacional: EstagioMaturacional;
  tipo_teste: string;
  modo_captura: string;
  status_processamento: string;
  redis_job_id: string | null;
  acwr: number | null;
  sintese_ia_texto: string | null;
  total_frames: number | null;
  duracao_segundos: number | null;
  keyframes_criticos: Array<{ tempoSeg: number; rotulo: string }> | null;
  criado_em: string;
  ipb: number | null;
  spe: number | null;
  ietp: number | null;
  ips: number | null;
  velocidade_pico_kmh: number | null;
  assimetria_bilateral_pct: number | null;
  pontos_opticos_22: Record<string, PontoOptico3D> | null;
}

export interface MetricasDetalhadas {
  id: number;
  frame_referencia: number;
  timestamp_segundos: number;
  ipb_prontidao_biomecanica: number;
  spe_potencia_explosao: number;
  ietp_eficiencia_tecnica: number;
  ips_potencial_scouting: number;
  pontos_opticos_22: Record<string, PontoOptico3D>;
  confianca_rastreamento_pct: number;
  flexao_joelho_esq_graus: number;
  flexao_joelho_dir_graus: number;
  extensao_joelho_chute_graus: number;
  rotacao_quadril_graus: number;
  inclinacao_pelvica_lateral_graus: number;
  dorsiflexao_tornozelo_graus: number;
  valgo_dinamico_joelho_graus: number;
  velocidade_pico_kmh: number;
  velocidade_pe_chute_kmh: number;
  velocidade_bola_kmh: number;
  split_0_10m_seg: number;
  desaceleracao_max_ms2: number;
  vetor_grf_bw: number;
  torque_articular_nm: number;
  altura_salto_cm: number;
  rsi_reativo: number;
  assimetria_bilateral_pct: number;
}

export interface SessaoDetalheResponse {
  sessao: {
    id: number;
    codigo_sessao: string;
    atleta_id: number;
    clube_id: number;
    tipo_teste: string;
    modo_captura: string;
    status_processamento: string;
    progresso_percentual: number;
    redis_job_id: string | null;
    worker_gpu_node: string | null;
    latencia_inferencia_ms: number | null;
    video_s3_key: string | null;
    total_frames: number | null;
    duracao_segundos: number | null;
    keyframes_criticos: Array<{ tempoSeg: number; rotulo: string }> | null;
    acwr_carga_aguda_cronica: number | null;
    sintese_ia_texto: string | null;
    criado_em: string;
  };
  atleta: {
    id: number;
    codigo_5play: string;
    nome_completo: string;
    apelido_esportivo: string | null;
    data_nascimento: string;
    categoria: CategoriaCompetitiva;
    posicao_primaria: PosicaoCampo;
    pe_dominante: PeDominante;
    estatura_cm: number;
    massa_corporal_kg: number;
    estagio_maturacional: EstagioMaturacional;
    apto_avaliacao_3d: boolean;
  } | null;
  clube: {
    id: number;
    nome: string;
    sigla: string;
    cidade: string;
  } | null;
  metricas: MetricasDetalhadas | null;
  benchmarks: BenchmarkItem[];
}

export interface SessaoUploadPayload {
  atleta_id: number;
  clube_id: number;
  tipo_teste: 'finalizacao' | 'sprint_20m' | 'salto_vertical' | 'agilidade_cod' | 'chute_apoio';
  modo_captura: 'pitch_cam_mobile' | 'stereo_4k_60fps' | 'vicon_12cam_240fps' | 'drone_tatico';
  nome_arquivo: string;
  velocidade_pico_kmh?: number;
  flexao_joelho_esq_graus?: number;
  flexao_joelho_dir_graus?: number;
  valgo_dinamico_graus?: number;
  altura_salto_cm?: number;
  acwr?: number;
}

export interface SessaoUploadResponse {
  sessao_id: number;
  codigo_sessao: string;
  status_processamento: string;
  celery_task_id: string | null;
  upload_signed_url: string;
  s3_bucket: string;
  s3_object_key: string;
  expira_em_segundos: number;
  alerta_assimetria_critica?: boolean;
}

export interface WebhookItem {
  id: number;
  clube_id: number;
  clube_nome: string;
  clube_sigla: string;
  nome_integracao: string;
  tipo_sistema: string;
  endpoint_url: string;
  eventos_assinados: string[];
  ativo: boolean;
  ultimo_status_http: number | null;
  criado_em: string;
}

export interface CompartilhamentoItem {
  id: number;
  token_acesso: string;
  atleta_nome: string;
  codigo_sessao: string;
  audit_hash_sha256: string;
  expira_em: string;
  visualizacoes_count: number;
  ativo: boolean;
  criado_em: string;
}

export interface CompartilhamentoB2BResponse {
  relatorio_id: number;
  token_acesso: string;
  link_seguro_url: string;
  audit_hash_sha256: string;
  expira_em: string;
  webhooks_disparados: Array<{
    webhook_id: number;
    nome_integracao: string;
    endpoint_url: string;
    status_http: number | null;
    entregue: boolean;
    erro: string | null;
  }>;
}

export interface PublicB2BDossierResponse {
  audit_hash_sha256: string;
  expira_em: string;
  criado_em: string;
  visualizacoes_count: number;
  clube: {
    nome: string;
    sigla: string;
    cidade: string;
  } | null;
  atleta: {
    codigo_5play: string;
    nome_completo: string;
    apelido_esportivo: string | null;
    data_nascimento: string;
    categoria: CategoriaCompetitiva;
    posicao_primaria: PosicaoCampo;
    pe_dominante: PeDominante;
    estatura_cm: number;
    massa_corporal_kg: number;
    estagio_maturacional: EstagioMaturacional;
  } | null;
  sessao: {
    codigo_sessao: string;
    tipo_teste: string;
    modo_captura: string;
    acwr: number | null;
    sintese_ia_texto: string | null;
    metricas: {
      ipb: number;
      spe: number;
      ietp: number;
      ips: number;
      confianca_rastreamento_pct: number;
      velocidade_pico_kmh: number;
      velocidade_pe_chute_kmh: number;
      velocidade_bola_kmh: number;
      split_0_10m_seg: number;
      assimetria_bilateral_pct: number;
      flexao_joelho_esq_graus: number;
      flexao_joelho_dir_graus: number;
      extensao_joelho_chute_graus: number;
      dorsiflexao_tornozelo_graus: number;
      inclinacao_pelvica_lateral_graus: number;
      valgo_dinamico_joelho_graus: number;
      vetor_grf_bw: number;
      torque_articular_nm: number;
      altura_salto_cm: number;
      rsi_reativo: number;
      pontos_opticos_22: Record<string, PontoOptico3D>;
    } | null;
  } | null;
  benchmarks: BenchmarkItem[];
}

export async function fetchDashboard(clubeId?: number): Promise<DashboardOverview> {
  const res = await apiClient.get<DashboardOverview>('/api/v1/dashboard', {
    params: clubeId ? { clube_id: clubeId } : undefined,
  });
  return {
    ...EMPTY_DASHBOARD,
    ...(res.data && typeof res.data === 'object' ? res.data : {}),
    atletas_monitorados: Array.isArray(res.data?.atletas_monitorados)
      ? res.data.atletas_monitorados
      : [],
  };
}

export async function fetchClubes(): Promise<ClubeItem[]> {
  const res = await apiClient.get<ClubeItem[]>('/api/v1/clubes');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createClubeApi(payload: CreateClubePayload): Promise<ClubeItem> {
  const res = await apiClient.post<ClubeItem>('/api/v1/clubes', payload);
  return res.data;
}

export async function fetchAtletas(clubeId?: number): Promise<AtletaItem[]> {
  const res = await apiClient.get<AtletaItem[]>('/api/v1/atletas', {
    params: clubeId ? { clube_id: clubeId } : undefined,
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createAtletaApi(payload: CreateAtletaPayload): Promise<AtletaItem> {
  const res = await apiClient.post<AtletaItem>('/api/v1/atletas', payload);
  return res.data;
}

export async function fetchLgpd(): Promise<LgpdItem[]> {
  const res = await apiClient.get<LgpdItem[]>('/api/v1/lgpd');
  return Array.isArray(res.data) ? res.data : [];
}

export async function validarLgpdApi(payload: {
  atleta_id: number;
  status: 'autorizado' | 'revogado';
  finalidade_captura_biometrica?: boolean;
  finalidade_scouting_b2b?: boolean;
}) {
  const res = await apiClient.post('/api/v1/lgpd/validar', payload);
  return res.data;
}

export async function fetchBenchmarks(): Promise<BenchmarkItem[]> {
  const res = await apiClient.get<BenchmarkItem[]>('/api/v1/benchmarks');
  return Array.isArray(res.data) ? res.data : [];
}

export async function upsertBenchmarkApi(payload: {
  posicao: PosicaoCampo;
  nivel_referencia: string;
  vmax_kmh: number;
  split_0_10m_seg: number;
  potencia_chute_kmh: number;
  assimetria_max_pct: number;
  ipb_medio: number;
  spe_medio: number;
  ietp_medio: number;
  ips_medio: number;
}) {
  const res = await apiClient.post('/api/v1/benchmarks', payload);
  return res.data;
}

export async function fetchSessoes(): Promise<SessaoResumoItem[]> {
  const res = await apiClient.get<SessaoResumoItem[]>('/api/v1/sessoes');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchSessaoDetalhe(sessaoId: number): Promise<SessaoDetalheResponse> {
  const res = await apiClient.get<SessaoDetalheResponse>(`/api/v1/sessoes/${sessaoId}`);
  return res.data;
}

export async function enqueueSessaoUploadApi(
  payload: SessaoUploadPayload
): Promise<SessaoUploadResponse> {
  const res = await apiClient.post<SessaoUploadResponse>('/api/v1/sessoes/upload-url', payload);
  return res.data;
}

export async function fetchWebhooks(): Promise<WebhookItem[]> {
  const res = await apiClient.get<WebhookItem[]>('/api/v1/webhooks');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createWebhookApi(payload: {
  clube_id: number;
  nome_integracao: string;
  tipo_sistema: string;
  endpoint_url: string;
  eventos_assinados: string[];
}) {
  const res = await apiClient.post('/api/v1/webhooks', payload);
  return res.data;
}

export async function fetchCompartilhamentos(): Promise<CompartilhamentoItem[]> {
  const res = await apiClient.get<CompartilhamentoItem[]>('/api/v1/compartilhamentos');
  return Array.isArray(res.data) ? res.data : [];
}

export async function shareB2BDossierApi(payload: {
  atleta_id: number;
  sessao_id: number;
  clube_destino_id?: number;
  dias_validade?: number;
}): Promise<CompartilhamentoB2BResponse> {
  const res = await apiClient.post<CompartilhamentoB2BResponse>(
    '/api/v1/compartilhamentos/b2b',
    payload
  );
  return res.data;
}

export async function fetchPublicB2BDossier(token: string): Promise<PublicB2BDossierResponse> {
  const res = await apiClient.get<PublicB2BDossierResponse>(
    `/api/v1/compartilhamentos/publico/${encodeURIComponent(token)}`
  );
  return res.data;
}
