import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Lock,
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  EMPTY_DASHBOARD,
  enqueueSessaoUploadApi,
  extractApiError,
  fetchAtletas,
  fetchClubes,
  fetchDashboard,
  fetchSessoes,
  type AtletaItem,
  type ClubeItem,
  type DashboardOverview,
  type SessaoResumoItem,
  type SessaoUploadResponse,
} from '../services/api';
import { Skeleton22PointsCanvas } from './BiomechanicalVisuals';
import type { AppView } from './Sidebar';

interface DashboardGeralProps {
  isAuthenticated: boolean;
  onSignIn: () => void;
  onNavigateView: (view: AppView) => void;
  onOpenSessao3D: (sessaoId: number) => void;
  onCountsChange?: (counts: { atletas: number; sessoes: number }) => void;
}

export function DashboardGeral({
  isAuthenticated,
  onSignIn,
  onNavigateView,
  onOpenSessao3D,
  onCountsChange,
}: DashboardGeralProps) {
  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null);
  const [sessoes, setSessoes] = useState<SessaoResumoItem[]>([]);
  const [clubes, setClubes] = useState<ClubeItem[]>([]);
  const [atletas, setAtletas] = useState<AtletaItem[]>([]);
  const [selectedClubeId, setSelectedClubeId] = useState<number | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendOfflineMsg, setBackendOfflineMsg] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  // Modal de Upload Assíncrono (202 Accepted)
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<SessaoUploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({
    atleta_id: '',
    tipo_teste: 'finalizacao' as const,
    modo_captura: 'stereo_4k_60fps' as const,
    nome_arquivo: 'captura_4k_campo.mp4',
    velocidade_pico_kmh: '32.4',
    flexao_joelho_esq_graus: '44',
    flexao_joelho_dir_graus: '39',
    valgo_dinamico_graus: '3.6',
    altura_salto_cm: '43',
    acwr: '1.08',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setBackendOfflineMsg(null);
    setNeedsAuth(false);
    try {
      const clubeParam = selectedClubeId === '' ? undefined : Number(selectedClubeId);
      const [dashData, sessoesData, clubesData, atletasData] = await Promise.all([
        fetchDashboard(clubeParam),
        fetchSessoes(),
        fetchClubes(),
        fetchAtletas(clubeParam),
      ]);
      setDashboard(dashData);
      setSessoes(sessoesData);
      setClubes(clubesData);
      setAtletas(atletasData);
      onCountsChange?.({ atletas: dashData.total_atletas, sessoes: sessoesData.length });
      if (!uploadForm.atleta_id && atletasData.length > 0) {
        const apto = atletasData.find((a) => a.apto_avaliacao_3d) || atletasData[0];
        setUploadForm((prev) => ({ ...prev, atleta_id: String(apto.id) }));
      }
    } catch (err) {
      const parsed = extractApiError(err, 'Falha ao carregar telemetria do Dashboard.');
      if (parsed.status === 401) {
        setNeedsAuth(true);
      } else if (parsed.isBackendUnavailable) {
        setDashboard(EMPTY_DASHBOARD);
        setSessoes([]);
        setClubes([]);
        setAtletas([]);
        setBackendOfflineMsg(parsed.message);
      } else {
        setErrorMsg(parsed.message);
      }
    } finally {
      setLoading(false);
    }
  }, [onCountsChange, selectedClubeId, uploadForm.atleta_id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setNeedsAuth(true);
      return;
    }
    void loadAll();
  }, [isAuthenticated, loadAll]);

  const filteredAthletes = useMemo(() => {
    if (!dashboard) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return dashboard.atletas_monitorados;
    return dashboard.atletas_monitorados.filter(
      (a) =>
        a.nome_completo.toLowerCase().includes(q) ||
        a.codigo_5play.toLowerCase().includes(q) ||
        a.posicao_primaria.toLowerCase().includes(q)
    );
  }, [dashboard, searchTerm]);

  const latestSessionWithMesh = useMemo(() => {
    return sessoes.find((s) => s.pontos_opticos_22 && Object.keys(s.pontos_opticos_22).length > 0) || sessoes[0] || null;
  }, [sessoes]);

  const sparklinePoints = useMemo(() => {
    const vals = sessoes
      .slice(0, 8)
      .reverse()
      .map((s) => s.ietp ?? 0);
    if (vals.length < 2) return null;
    const width = 120;
    const height = 32;
    return vals
      .map((v, idx) => {
        const x = (idx / (vals.length - 1)) * width;
        const y = height - (Math.max(0, Math.min(100, v)) / 100) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [sessoes]);

  const handleEnqueueSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadResult(null);
    const atletaObj = atletas.find((a) => a.id === Number(uploadForm.atleta_id));
    if (!atletaObj) {
      setUploadError('Selecione um atleta válido.');
      return;
    }
    setUploading(true);
    try {
      const resp = await enqueueSessaoUploadApi({
        atleta_id: atletaObj.id,
        clube_id: atletaObj.clube_id,
        tipo_teste: uploadForm.tipo_teste,
        modo_captura: uploadForm.modo_captura,
        nome_arquivo: uploadForm.nome_arquivo,
        velocidade_pico_kmh: Number(uploadForm.velocidade_pico_kmh),
        flexao_joelho_esq_graus: Number(uploadForm.flexao_joelho_esq_graus),
        flexao_joelho_dir_graus: Number(uploadForm.flexao_joelho_dir_graus),
        valgo_dinamico_graus: Number(uploadForm.valgo_dinamico_graus),
        altura_salto_cm: Number(uploadForm.altura_salto_cm),
        acwr: Number(uploadForm.acwr),
      });
      setUploadResult(resp);
      await loadAll();
    } catch (err) {
      setUploadError(extractApiError(err, 'Erro ao enfileirar vídeo.').message);
    } finally {
      setUploading(false);
    }
  };

  if (needsAuth) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-8 max-w-2xl mx-auto my-8 space-y-4">
        <div className="flex items-center gap-3 text-[#F9FAFB]">
          <Lock className="w-5 h-5 text-[#10B981]" />
          <h2 className="text-lg font-bold">Autenticação do Operador Necessária</h2>
        </div>
        <p className="text-sm text-[#9CA3AF] leading-relaxed">
          Por governança LGPD e proteção de dados biométricos de atletas de base, o painel KinePitch AI exige sessão autenticada para consultar o PostgreSQL em tempo real.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onSignIn}
            className="px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            Entrar com Google
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('relatorio')}
            className="px-4 py-2 text-xs font-medium text-[#E5E7EB] bg-[#181C24] hover:bg-[#1F2937] border border-[#1F2937] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            Consultar Token B2B Público
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho Operacional */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1F2937] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#F9FAFB] tracking-tight">
            Dashboard Geral · KinePitch AI
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Telemetria de elenco, sessões 22 pontos e alertas de assimetria em tempo real via FastAPI / PostgreSQL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedClubeId}
            onChange={(e) => setSelectedClubeId(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 text-xs bg-[#111827] border border-[#1F2937] rounded-md text-[#F9FAFB] focus:outline-none focus:border-[#06B6D4]"
            aria-label="Filtrar por clube"
          >
            <option value="">Todos os Clubes ({clubes.length})</option>
            {clubes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sigla} · {c.nome}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#E5E7EB] bg-[#111827] hover:bg-[#181C24] border border-[#1F2937] rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadResult(null);
              setUploadError(null);
              setShowUploadModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Análise 3D</span>
          </button>
        </div>
      </div>

      {backendOfflineMsg && (
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-md px-4 py-3 text-xs text-[#FCD34D] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#F59E0B]" />
            <span>{backendOfflineMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="text-[#F9FAFB] underline cursor-pointer whitespace-nowrap"
          >
            Reconectar
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-md px-4 py-3 text-xs text-[#FCA5A5] flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="text-[#F9FAFB] underline cursor-pointer whitespace-nowrap"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      {loading && !dashboard ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-28 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Atletas Monitorados</span>
              <Users className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="text-2xl font-bold font-mono-tabular text-[#F9FAFB]">
              {dashboard?.total_atletas ?? 0}
            </div>
            <div className="text-[11px] text-[#9CA3AF] font-mono-tabular">
              {dashboard?.total_clubes_ativos ?? 0} clubes ativos vinculados
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Sessões 22 Pontos</span>
              <Video className="w-4 h-4 text-[#06B6D4]" />
            </div>
            <div className="text-2xl font-bold font-mono-tabular text-[#F9FAFB]">
              {dashboard?.total_sessoes_concluidas ?? 0}
            </div>
            <div className="text-[11px] text-[#06B6D4] font-mono-tabular">
              ACWR médio elenco: {dashboard?.acwr_medio_elenco?.toFixed(2) ?? '0.00'}
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="text-xs text-[#9CA3AF]">Eficiência Técnica (IETP)</div>
              <div className="text-2xl font-bold font-mono-tabular text-[#10B981]">
                {dashboard?.eficiencia_biomecanica_media_pct?.toFixed(1) ?? '0.0'}%
              </div>
              <div className="text-[11px] text-[#9CA3AF]">Média global das sessões</div>
            </div>
            {sparklinePoints && (
              <svg width="104" height="34" viewBox="0 0 120 32" className="shrink-0">
                <polyline
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparklinePoints}
                />
              </svg>
            )}
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>Velocidade Pico &amp; Alertas</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  (dashboard?.assimetrias_criticas_count ?? 0) > 0
                    ? 'text-[#F59E0B]'
                    : 'text-[#10B981]'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono-tabular text-[#F9FAFB]">
                {dashboard?.velocidade_pico_max_kmh?.toFixed(1) ?? '0.0'}
              </span>
              <span className="text-xs text-[#9CA3AF]">km/h máx</span>
            </div>
            <div className="text-[11px] font-mono-tabular">
              {(dashboard?.assimetrias_criticas_count ?? 0) > 0 ? (
                <span className="text-[#F59E0B]">
                  {dashboard?.assimetrias_criticas_count} alerta(s) assimetria &gt; 15%
                </span>
              ) : (
                <span className="text-[#10B981]">0 assimetrias críticas (&gt;15%)</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bento Grid Principal */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Esquerda (8 colunas): Viewport 3D Ativo + Histórico ACWR/IETP */}
        <div className="xl:col-span-8 space-y-6">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#1F2937] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#F9FAFB]">
                  Captura Recente · Malha YOLOv8-Pose (22 Pontos)
                </h2>
                {latestSessionWithMesh ? (
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    {latestSessionWithMesh.atleta_nome} · {latestSessionWithMesh.codigo_sessao} ·{' '}
                    {latestSessionWithMesh.tipo_teste.replace(/_/g, ' ')}
                  </p>
                ) : (
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    Aguardando primeira sessão processada no banco
                  </p>
                )}
              </div>

              {latestSessionWithMesh && (
                <button
                  type="button"
                  onClick={() => onOpenSessao3D(latestSessionWithMesh.sessao_id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#042116] bg-[#06B6D4] hover:bg-[#0891B2] rounded-md transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Abrir Análise 3D</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {latestSessionWithMesh ? (
              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-8 h-72 sm:h-80 border-b lg:border-b-0 lg:border-r border-[#1F2937]">
                  <Skeleton22PointsCanvas
                    pontos={latestSessionWithMesh.pontos_opticos_22}
                    alertaAssimetria={(latestSessionWithMesh.assimetria_bilateral_pct ?? 0) > 15}
                    compact
                  />
                </div>
                <div className="lg:col-span-4 p-4 flex flex-col justify-between gap-4 bg-[#0F131C]">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#111827] border border-[#1F2937] rounded-md p-2.5">
                      <div className="text-[11px] text-[#9CA3AF]">IPB Prontidão</div>
                      <div className="text-lg font-bold font-mono-tabular text-[#10B981]">
                        {latestSessionWithMesh.ipb?.toFixed(1) ?? '--'}
                      </div>
                    </div>
                    <div className="bg-[#111827] border border-[#1F2937] rounded-md p-2.5">
                      <div className="text-[11px] text-[#9CA3AF]">SPE Explosão</div>
                      <div className="text-lg font-bold font-mono-tabular text-[#06B6D4]">
                        {latestSessionWithMesh.spe?.toFixed(1) ?? '--'}
                      </div>
                    </div>
                    <div className="bg-[#111827] border border-[#1F2937] rounded-md p-2.5">
                      <div className="text-[11px] text-[#9CA3AF]">IETP Técnica</div>
                      <div className="text-lg font-bold font-mono-tabular text-[#F9FAFB]">
                        {latestSessionWithMesh.ietp?.toFixed(1) ?? '--'}
                      </div>
                    </div>
                    <div className="bg-[#111827] border border-[#1F2937] rounded-md p-2.5">
                      <div className="text-[11px] text-[#9CA3AF]">IPS Scouting</div>
                      <div className="text-lg font-bold font-mono-tabular text-[#10B981]">
                        {latestSessionWithMesh.ips?.toFixed(1) ?? '--'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>Assimetria Bilateral</span>
                      <span
                        className={`font-mono-tabular font-semibold ${
                          (latestSessionWithMesh.assimetria_bilateral_pct ?? 0) > 15
                            ? 'text-[#F59E0B]'
                            : 'text-[#10B981]'
                        }`}
                      >
                        {latestSessionWithMesh.assimetria_bilateral_pct?.toFixed(1) ?? '--'}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>Velocidade Pico</span>
                      <span className="font-mono-tabular text-[#F9FAFB]">
                        {latestSessionWithMesh.velocidade_pico_kmh?.toFixed(1) ?? '--'} km/h
                      </span>
                    </div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>ACWR Sessão</span>
                      <span className="font-mono-tabular text-[#06B6D4]">
                        {latestSessionWithMesh.acwr?.toFixed(2) ?? '--'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <Activity className="w-8 h-8 text-[#4B5563] mx-auto" />
                <div className="text-sm font-medium text-[#F9FAFB]">
                  Nenhuma sessão biomecânica registrada no PostgreSQL
                </div>
                <p className="text-xs text-[#9CA3AF] max-w-md mx-auto">
                  Cadastre um clube e atleta elegível (com LGPD autorizada) e envie um vídeo para visualizar a malha de 22 pontos e os 4 KPIs.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigateView('cadastro')}
                    className="px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md cursor-pointer"
                  >
                    Cadastrar Clube / Atleta
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Histórico Real das Sessões (ACWR & Eficiência) */}
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">
                  Histórico de Sessões &amp; Carga Aguda/Crônica (ACWR)
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  Últimas sessões persistidas em sessoes_analise e metricas_biomecanicas
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-[#9CA3AF]">
                {sessoes.length} registro(s)
              </span>
            </div>

            {sessoes.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#9CA3AF]">
                Sem sessões recentes para plotagem.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Sessão</th>
                      <th className="py-2 px-3 font-medium">Atleta</th>
                      <th className="py-2 px-3 font-medium">Teste</th>
                      <th className="py-2 px-3 font-medium text-right">IPB</th>
                      <th className="py-2 px-3 font-medium text-right">SPE</th>
                      <th className="py-2 px-3 font-medium text-right">Assimetria</th>
                      <th className="py-2 px-3 font-medium text-right">ACWR</th>
                      <th className="py-2 pl-3 text-right font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70">
                    {sessoes.slice(0, 8).map((s) => (
                      <tr key={s.sessao_id} className="hover:bg-[#181C24]/60 transition-colors">
                        <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4]">
                          {s.codigo_sessao}
                        </td>
                        <td className="py-2.5 px-3 text-[#F9FAFB] font-medium">
                          {s.atleta_nome}
                          <span className="text-[#9CA3AF] ml-1.5">· {s.clube_sigla}</span>
                        </td>
                        <td className="py-2.5 px-3 text-[#9CA3AF]">
                          {s.tipo_teste.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#10B981]">
                          {s.ipb?.toFixed(1) ?? '--'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#06B6D4]">
                          {s.spe?.toFixed(1) ?? '--'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono-tabular font-medium ${
                            (s.assimetria_bilateral_pct ?? 0) > 15
                              ? 'text-[#F59E0B]'
                              : 'text-[#E5E7EB]'
                          }`}
                        >
                          {s.assimetria_bilateral_pct?.toFixed(1) ?? '--'}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular text-[#E5E7EB]">
                          {s.acwr?.toFixed(2) ?? '--'}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenSessao3D(s.sessao_id)}
                            className="text-[#06B6D4] hover:text-[#38BDF8] font-medium cursor-pointer whitespace-nowrap"
                          >
                            3D View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Direita (4 colunas): Monitoramento Individual do Elenco */}
        <div className="xl:col-span-4 bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#F9FAFB]">
              Monitoramento de Atletas
            </h3>
            <button
              type="button"
              onClick={() => onNavigateView('cadastro')}
              className="text-xs text-[#10B981] hover:underline cursor-pointer whitespace-nowrap"
            >
              + Cadastrar
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, código ou posição..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] placeholder-[#6B7280] focus:outline-none focus:border-[#06B6D4]"
            />
          </div>

          {filteredAthletes.length === 0 ? (
            <div className="py-8 text-center space-y-2 text-xs text-[#9CA3AF]">
              <p>Nenhum atleta encontrado para os filtros aplicados.</p>
              <button
                type="button"
                onClick={() => onNavigateView('cadastro')}
                className="text-[#10B981] hover:underline cursor-pointer"
              >
                Ir para Cadastro &amp; Elenco
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#1F2937] max-h-[540px] overflow-y-auto pr-1">
              {filteredAthletes.map((a) => {
                const sessaoAtleta = sessoes.find((s) => s.atleta_id === a.atleta_id);
                return (
                  <div key={a.atleta_id} className="py-3 first:pt-1 last:pb-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F9FAFB] truncate">
                          {a.nome_completo}
                        </div>
                        <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                          <span className="font-mono-tabular text-[#06B6D4]">{a.codigo_5play}</span>
                          {' · '}
                          <span className="capitalize">{a.posicao_primaria}</span>
                          {' · '}
                          <span className="uppercase">{a.categoria}</span>
                        </div>
                      </div>

                      {sessaoAtleta ? (
                        <button
                          type="button"
                          onClick={() => onOpenSessao3D(sessaoAtleta.sessao_id)}
                          className="px-2.5 py-1 text-[11px] font-medium bg-[#181C24] hover:bg-[#1F2937] text-[#06B6D4] border border-[#1F2937] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          3D View
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadForm((prev) => ({ ...prev, atleta_id: String(a.atleta_id) }));
                            setShowUploadModal(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Avaliar
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#9CA3AF]">
                      <span>
                        IPB:{' '}
                        <strong className="text-[#10B981]">
                          {a.ipb !== null ? a.ipb.toFixed(1) : '--'}
                        </strong>
                      </span>
                      <span>
                        SPE:{' '}
                        <strong className="text-[#06B6D4]">
                          {a.spe !== null ? a.spe.toFixed(1) : '--'}
                        </strong>
                      </span>
                      <span>
                        Assimetria:{' '}
                        <strong
                          className={
                            a.alerta_assimetria_critica ? 'text-[#F59E0B]' : 'text-[#E5E7EB]'
                          }
                        >
                          {a.assimetria_bilateral_pct !== null
                            ? `${a.assimetria_bilateral_pct.toFixed(1)}%`
                            : '--'}
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Enfileirar Sessão 202 Accepted */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1F2937] pb-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-[#10B981]" />
                <h3 className="text-sm font-bold text-[#F9FAFB]">
                  Enfileirar Vídeo Biomecânico (POST /api/v1/sessoes/upload-url)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-[#9CA3AF] hover:text-[#F9FAFB] cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {atletas.length === 0 ? (
              <div className="py-4 space-y-3 text-xs text-[#9CA3AF]">
                <p>É necessário cadastrar ao menos um atleta com LGPD autorizada antes de iniciar uma análise.</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    onNavigateView('cadastro');
                  }}
                  className="px-4 py-2 font-semibold bg-[#10B981] text-[#042116] rounded-md cursor-pointer"
                >
                  Ir para Cadastro &amp; Elenco
                </button>
              </div>
            ) : (
              <form onSubmit={handleEnqueueSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Atleta</label>
                    <select
                      value={uploadForm.atleta_id}
                      onChange={(e) => setUploadForm({ ...uploadForm, atleta_id: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                    >
                      {atletas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome_completo} ({a.posicao_primaria}) {!a.apto_avaliacao_3d ? '· LGPD Pendente' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Tipo de Teste</label>
                    <select
                      value={uploadForm.tipo_teste}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, tipo_teste: e.target.value as typeof uploadForm.tipo_teste })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                    >
                      <option value="finalizacao">Finalização</option>
                      <option value="sprint_20m">Sprint 20m</option>
                      <option value="salto_vertical">Salto Vertical (CMJ)</option>
                      <option value="agilidade_cod">Agilidade COD</option>
                      <option value="chute_apoio">Chute com Perna de Apoio</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Modo de Captura</label>
                    <select
                      value={uploadForm.modo_captura}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, modo_captura: e.target.value as typeof uploadForm.modo_captura })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                    >
                      <option value="stereo_4k_60fps">Stereo 4K 60fps</option>
                      <option value="pitch_cam_mobile">Pitch Cam Mobile</option>
                      <option value="vicon_12cam_240fps">Vicon 12 Câmeras 240fps</option>
                      <option value="drone_tatico">Drone Tático</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Arquivo de Vídeo</label>
                    <input
                      type="text"
                      required
                      value={uploadForm.nome_arquivo}
                      onChange={(e) => setUploadForm({ ...uploadForm, nome_arquivo: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Velocidade Pico (km/h)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={uploadForm.velocidade_pico_kmh}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, velocidade_pico_kmh: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Flexão Joelho Esq (°)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={uploadForm.flexao_joelho_esq_graus}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, flexao_joelho_esq_graus: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Flexão Joelho Dir (°)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={uploadForm.flexao_joelho_dir_graus}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, flexao_joelho_dir_graus: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Valgo Dinâmico (°)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={uploadForm.valgo_dinamico_graus}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, valgo_dinamico_graus: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Salto CMJ (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={uploadForm.altura_salto_cm}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, altura_salto_cm: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">ACWR</label>
                    <input
                      type="number"
                      step="0.01"
                      value={uploadForm.acwr}
                      onChange={(e) => setUploadForm({ ...uploadForm, acwr: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                    />
                  </div>
                </div>

                {uploadError && (
                  <div className="bg-[#EF4444]/10 border border-[#EF4444]/40 rounded p-3 text-[#FCA5A5]">
                    {uploadError}
                  </div>
                )}

                {uploadResult && (
                  <div className="bg-[#10B981]/10 border border-[#10B981]/40 rounded p-3 space-y-1.5 text-[#D1FAE5]">
                    <div className="font-semibold">
                      202 Accepted · Sessão {uploadResult.codigo_sessao} processada
                    </div>
                    <div className="font-mono-tabular text-[11px] break-all">
                      Task Redis/Celery: {uploadResult.celery_task_id}
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowUploadModal(false);
                          onOpenSessao3D(uploadResult.sessao_id);
                        }}
                        className="text-[#06B6D4] underline font-semibold cursor-pointer"
                      >
                        Visualizar Análise Biomecânica 3D agora
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 bg-[#181C24] text-[#E5E7EB] border border-[#1F2937] rounded-md cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-[#042116] font-semibold rounded-md cursor-pointer disabled:opacity-50"
                  >
                    {uploading ? 'Processando 22 Pontos...' : 'Enviar & Extrair 22 Pontos'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
