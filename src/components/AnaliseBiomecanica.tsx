import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Pause,
  Play,
  Share2,
  Upload,
} from 'lucide-react';
import {
  extractApiError,
  fetchClubes,
  fetchSessaoDetalhe,
  fetchSessoes,
  shareB2BDossierApi,
  type BenchmarkItem,
  type ClubeItem,
  type CompartilhamentoB2BResponse,
  type SessaoDetalheResponse,
  type SessaoResumoItem,
} from '../services/api';
import {
  KpiRadialGauge,
  RadarBenchmarkChart,
  Skeleton22PointsCanvas,
} from './BiomechanicalVisuals';
import type { AppView } from './Sidebar';

interface AnaliseBiomecanicaProps {
  isAuthenticated: boolean;
  onSignIn: () => void;
  initialSessaoId: number | null;
  onNavigateView: (view: AppView) => void;
  onOpenPublicToken: (token: string) => void;
}

const CATEGORIA_TO_BENCHMARK_LEVEL: Record<string, string> = {
  sub9: 'cbf_sub11',
  sub11: 'cbf_sub11',
  sub13: 'cbf_sub13',
  sub15: 'cbf_sub15',
  sub17: 'cbf_sub17',
  sub20: 'cbf_sub20',
  profissional: 'serie_a_pro',
};

export function AnaliseBiomecanica({
  isAuthenticated,
  onSignIn,
  initialSessaoId,
  onNavigateView,
  onOpenPublicToken,
}: AnaliseBiomecanicaProps) {
  const [sessoes, setSessoes] = useState<SessaoResumoItem[]>([]);
  const [selectedSessaoId, setSelectedSessaoId] = useState<number | null>(initialSessaoId);
  const [detail, setDetail] = useState<SessaoDetalheResponse | null>(null);
  const [clubes, setClubes] = useState<ClubeItem[]>([]);

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Player & Overlay Controls
  const [showOverlay, setShowOverlay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.25 | 0.5 | 1>(1);
  const [framePhase, setFramePhase] = useState(0);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  // B2B Share State
  const [shareOpen, setShareOpen] = useState(false);
  const [shareClubDestino, setShareClubDestino] = useState<number | ''>('');
  const [shareDays, setShareDays] = useState(7);
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<CompartilhamentoB2BResponse | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (initialSessaoId) {
      setSelectedSessaoId(initialSessaoId);
    }
  }, [initialSessaoId]);

  const loadSessions = useCallback(async () => {
    setLoadingList(true);
    setErrorMsg(null);
    setNeedsAuth(false);
    try {
      const [sessoesData, clubesData] = await Promise.all([fetchSessoes(), fetchClubes()]);
      setSessoes(sessoesData);
      setClubes(clubesData);
      if (sessoesData.length > 0) {
        setSelectedSessaoId((prev) =>
          prev && sessoesData.some((s) => s.sessao_id === prev) ? prev : sessoesData[0].sessao_id
        );
      }
    } catch (err) {
      const parsed = extractApiError(err, 'Falha ao carregar sessões biomecânicas.');
      if (parsed.status === 401) setNeedsAuth(true);
      else setErrorMsg(parsed.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoadingList(false);
      setNeedsAuth(true);
      return;
    }
    void loadSessions();
  }, [isAuthenticated, loadSessions]);

  useEffect(() => {
    if (!isAuthenticated || !selectedSessaoId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoadingDetail(true);
    setShareResult(null);
    fetchSessaoDetalhe(selectedSessaoId)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err) => {
        if (active) {
          const parsed = extractApiError(err, 'Erro ao carregar detalhes da sessão.');
          setErrorMsg(parsed.message);
        }
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, selectedSessaoId]);

  // Scrubber animation loop when playing
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setFramePhase((prev) => (prev + 0.015 * playbackSpeed) % 1);
    }, 33);
    return () => window.clearInterval(timer);
  }, [playing, playbackSpeed]);

  const handleLocalVideoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    setLocalVideoUrl(URL.createObjectURL(file));
  };

  const handleGenerateB2BShare = async () => {
    if (!detail?.atleta || !detail.sessao) return;
    setSharing(true);
    setErrorMsg(null);
    try {
      const resp = await shareB2BDossierApi({
        atleta_id: detail.atleta.id,
        sessao_id: detail.sessao.id,
        clube_destino_id: shareClubDestino === '' ? undefined : Number(shareClubDestino),
        dias_validade: shareDays,
      });
      setShareResult(resp);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Erro ao gerar link seguro B2B.').message);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareResult) return;
    const url = `${window.location.origin}/?token=${shareResult.token_acesso}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  const matchedBenchmarks = useMemo<{
    categoria: BenchmarkItem | null;
    pro: BenchmarkItem | null;
  }>(() => {
    if (!detail) return { categoria: null, pro: null };
    const catLevel = detail.atleta
      ? CATEGORIA_TO_BENCHMARK_LEVEL[detail.atleta.categoria] || 'cbf_sub17'
      : 'cbf_sub17';
    const categoria =
      detail.benchmarks.find((b) => b.nivel_referencia === catLevel) ||
      detail.benchmarks.find((b) => b.nivel_referencia !== 'serie_a_pro') ||
      null;
    const pro =
      detail.benchmarks.find((b) => b.nivel_referencia === 'serie_a_pro') ||
      detail.benchmarks.find((b) => b.nivel_referencia === 'top5_europa') ||
      null;
    return { categoria, pro };
  }, [detail]);

  if (needsAuth) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-8 max-w-2xl mx-auto my-8 space-y-4">
        <div className="flex items-center gap-3 text-[#F9FAFB]">
          <Lock className="w-5 h-5 text-[#10B981]" />
          <h2 className="text-lg font-bold">Autenticação Necessária · Estúdio Biomecânico</h2>
        </div>
        <p className="text-sm text-[#9CA3AF]">
          Conecte-se com sua conta Google para carregar sessões de vídeo 22 pontos, métricas articulares e gerar tokens de scouting B2B.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  if (loadingList) {
    return (
      <div className="space-y-4">
        <div className="h-16 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 h-96 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
          <div className="xl:col-span-5 h-96 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (sessoes.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-10 text-center space-y-4 max-w-2xl mx-auto my-8">
        <h2 className="text-lg font-bold text-[#F9FAFB]">Nenhuma Análise 3D Encontrada</h2>
        <p className="text-xs text-[#9CA3AF]">
          Não há sessões processadas no PostgreSQL ainda. Enfileire uma análise de vídeo no Dashboard Geral ou cadastre um atleta primeiro.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigateView('dashboard')}
            className="px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md cursor-pointer"
          >
            Ir para Dashboard Geral
          </button>
          <button
            type="button"
            onClick={() => onNavigateView('cadastro')}
            className="px-4 py-2 text-xs font-medium text-[#E5E7EB] bg-[#181C24] border border-[#1F2937] rounded-md cursor-pointer"
          >
            Cadastrar Clube &amp; Atleta
          </button>
        </div>
      </div>
    );
  }

  const m = detail?.metricas;
  const alertaAssimetria = (m?.assimetria_bilateral_pct ?? 0) > 15;
  const duracao = detail?.sessao.duracao_segundos || 7;
  const totalFrames = detail?.sessao.total_frames || 420;
  const currentFrame = Math.round(framePhase * totalFrames);

  return (
    <div className="space-y-6">
      {/* Barra Superior de Seleção de Sessão e Ação B2B */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#181C24] border border-[#1F2937] flex items-center justify-center text-sm font-bold text-[#06B6D4] shrink-0">
            {detail?.atleta?.nome_completo.slice(0, 2).toUpperCase() || 'AT'}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold text-[#F9FAFB]">
                {detail?.atleta?.nome_completo || 'Carregando atleta...'}
              </h1>
              {detail?.atleta && (
                <span className="text-xs font-mono-tabular text-[#06B6D4]">
                  {detail.atleta.codigo_5play}
                </span>
              )}
            </div>
            {detail?.atleta && (
              <div className="text-xs text-[#9CA3AF] mt-0.5">
                {detail.clube?.sigla} · <span className="capitalize">{detail.atleta.posicao_primaria}</span> ·{' '}
                <span className="uppercase">{detail.atleta.categoria}</span> · Pé{' '}
                {detail.atleta.pe_dominante} · {detail.atleta.estatura_cm} cm / {detail.atleta.massa_corporal_kg} kg
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedSessaoId ?? ''}
            onChange={(e) => setSelectedSessaoId(Number(e.target.value))}
            className="px-3 py-2 text-xs bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] focus:outline-none focus:border-[#06B6D4]"
            aria-label="Selecionar sessão de análise"
          >
            {sessoes.map((s) => (
              <option key={s.sessao_id} value={s.sessao_id}>
                {s.codigo_sessao} · {s.atleta_nome} ({s.tipo_teste})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShareOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartilhar Link B2B</span>
          </button>
        </div>
      </div>

      {/* Painel Expansível de Compartilhamento B2B */}
      {shareOpen && detail && (
        <div className="bg-[#0F131C] border border-[#10B981]/40 rounded-lg p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#F9FAFB]">
                Gerar Token Seguro B2B + Disparo Webhook JSON
              </h3>
              <p className="text-[#9CA3AF] mt-0.5">
                Cria um link público auditado por SHA-256 com validade configurável e notifica webhooks ativos do clube.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={shareClubDestino}
                onChange={(e) =>
                  setShareClubDestino(e.target.value ? Number(e.target.value) : '')
                }
                className="px-3 py-1.5 bg-[#111827] border border-[#1F2937] rounded-md text-[#F9FAFB]"
              >
                <option value="">Clube de origem ({detail.clube?.sigla})</option>
                {clubes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sigla} · {c.nome}
                  </option>
                ))}
              </select>
              <select
                value={shareDays}
                onChange={(e) => setShareDays(Number(e.target.value))}
                className="px-3 py-1.5 bg-[#111827] border border-[#1F2937] rounded-md text-[#F9FAFB]"
              >
                <option value={3}>3 dias</option>
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </select>
              <button
                type="button"
                onClick={() => void handleGenerateB2BShare()}
                disabled={sharing}
                className="px-4 py-1.5 bg-[#06B6D4] hover:bg-[#0891B2] text-[#042116] font-semibold rounded-md cursor-pointer disabled:opacity-50"
              >
                {sharing ? 'Gerando Token...' : 'Gerar & Disparar'}
              </button>
            </div>
          </div>

          {shareResult && (
            <div className="bg-[#111827] border border-[#1F2937] rounded-md p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[#10B981] font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Dossiê B2B Gerado · Expira em {new Date(shareResult.expira_em).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyShareUrl()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#181C24] border border-[#1F2937] rounded text-[#E5E7EB] cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedLink ? 'Copiado!' : 'Copiar URL'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPublicToken(shareResult.token_acesso)}
                    className="px-2.5 py-1 bg-[#06B6D4] text-[#042116] font-semibold rounded cursor-pointer"
                  >
                    Abrir Visão Pública
                  </button>
                </div>
              </div>
              <div className="font-mono-tabular text-[11px] text-[#06B6D4] break-all">
                {`${window.location.origin}/?token=${shareResult.token_acesso}`}
              </div>
              <div className="font-mono-tabular text-[11px] text-[#9CA3AF] break-all">
                SHA-256: {shareResult.audit_hash_sha256}
              </div>
              {shareResult.webhooks_disparados.length > 0 && (
                <div className="pt-1 border-t border-[#1F2937] space-y-1">
                  <div className="text-[11px] text-[#9CA3AF] font-medium">
                    Webhooks B2B Notificados:
                  </div>
                  {shareResult.webhooks_disparados.map((w) => (
                    <div key={w.webhook_id} className="text-[11px] font-mono-tabular flex justify-between">
                      <span className="text-[#E5E7EB]">{w.nome_integracao}</span>
                      <span className={w.entregue ? 'text-[#10B981]' : 'text-[#F59E0B]'}>
                        {w.entregue ? `HTTP ${w.status_http}` : w.erro || `HTTP ${w.status_http ?? 'ERR'}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-md px-4 py-3 text-xs text-[#FCA5A5]">
          {errorMsg}
        </div>
      )}

      {alertaAssimetria && m && (
        <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-lg px-4 py-3 flex items-center gap-3 text-xs text-[#FCD34D]">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#F59E0B]" />
          <span>
            Alerta Clínico: Assimetria bilateral medida em{' '}
            <strong className="font-mono-tabular">{m.assimetria_bilateral_pct.toFixed(1)}%</strong>{' '}
            (acima do limiar seguro de 15.0%). Recomenda-se reequilíbrio neuromuscular antes de progressão de carga.
          </span>
        </div>
      )}

      {loadingDetail || !detail ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 h-[420px] bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
          <div className="xl:col-span-5 h-[420px] bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda (7 cols): Player 22 Pontos + Scrubber + Micro-Ângulos */}
          <div className="xl:col-span-7 space-y-5">
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1F2937] flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[#9CA3AF] font-mono-tabular">
                  {detail.sessao.codigo_sessao} · {detail.sessao.modo_captura} · Confiança{' '}
                  <span className="text-[#10B981]">
                    {m?.confianca_rastreamento_pct.toFixed(1) ?? '--'}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#181C24] hover:bg-[#1F2937] text-[#E5E7EB] border border-[#1F2937] rounded cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>Anexar Vídeo Local</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleLocalVideoSelect}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOverlay((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                      showOverlay
                        ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                        : 'bg-[#181C24] border-[#1F2937] text-[#9CA3AF]'
                    }`}
                  >
                    {showOverlay ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>22 Pontos</span>
                  </button>
                </div>
              </div>

              <div className="aspect-video w-full">
                <Skeleton22PointsCanvas
                  pontos={m?.pontos_opticos_22}
                  framePhase={framePhase}
                  showOverlay={showOverlay}
                  alertaAssimetria={alertaAssimetria}
                  videoSrc={localVideoUrl}
                />
              </div>

              {/* Barra de Controle Cinemático Frame-a-Frame */}
              <div className="px-4 py-3 bg-[#0F131C] border-t border-[#1F2937] space-y-2.5">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    className="p-2 rounded bg-[#10B981] hover:bg-[#059669] text-[#042116] cursor-pointer shrink-0"
                    aria-label={playing ? 'Pausar análise' : 'Reproduzir análise'}
                  >
                    {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1 relative flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={Math.round(framePhase * 1000)}
                      onChange={(e) => {
                        setPlaying(false);
                        setFramePhase(Number(e.target.value) / 1000);
                      }}
                      className="w-full accent-[#06B6D4] cursor-pointer"
                      aria-label="Linha do tempo cinemática"
                    />
                  </div>

                  <span className="text-xs font-mono-tabular text-[#9CA3AF] shrink-0">
                    F{currentFrame}/{totalFrames} ({(framePhase * duracao).toFixed(2)}s)
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    {([0.25, 0.5, 1] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd)}
                        className={`px-2 py-1 text-[11px] font-mono-tabular rounded cursor-pointer ${
                          playbackSpeed === spd
                            ? 'bg-[#06B6D4]/20 text-[#06B6D4] border border-[#06B6D4]/40'
                            : 'bg-[#181C24] text-[#9CA3AF]'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Marcadores de Keyframes Críticos */}
                {detail.sessao.keyframes_criticos && detail.sessao.keyframes_criticos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-[#9CA3AF]">Keyframes:</span>
                    {detail.sessao.keyframes_criticos.map((kf, idx) => (
                      <button
                        key={`${kf.rotulo}-${idx}`}
                        type="button"
                        onClick={() => {
                          setPlaying(false);
                          setFramePhase(Math.min(1, Math.max(0, kf.tempoSeg / duracao)));
                        }}
                        className="px-2 py-0.5 bg-[#181C24] hover:bg-[#1F2937] border border-[#1F2937] rounded text-[#06B6D4] font-mono-tabular cursor-pointer"
                      >
                        ◆ {kf.rotulo} ({kf.tempoSeg}s)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Micro-Ângulos Articulares */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-3.5">
                <div className="text-[11px] text-[#9CA3AF]">Flexão Joelho (E/D)</div>
                <div className="text-base font-bold font-mono-tabular text-[#F9FAFB] mt-1">
                  {m?.flexao_joelho_esq_graus.toFixed(1) ?? '--'}° /{' '}
                  {m?.flexao_joelho_dir_graus.toFixed(1) ?? '--'}°
                </div>
                <div className="text-[11px] text-[#06B6D4] mt-0.5 font-mono-tabular">
                  Assimetria {m?.assimetria_bilateral_pct.toFixed(1) ?? '--'}%
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-3.5">
                <div className="text-[11px] text-[#9CA3AF]">Extensão Joelho Chute</div>
                <div className="text-base font-bold font-mono-tabular text-[#10B981] mt-1">
                  {m?.extensao_joelho_chute_graus.toFixed(1) ?? '--'}°
                </div>
                <div className="text-[11px] text-[#9CA3AF] mt-0.5 font-mono-tabular">
                  Pé {m?.velocidade_pe_chute_kmh.toFixed(1) ?? '--'} km/h
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-3.5">
                <div className="text-[11px] text-[#9CA3AF]">Dorsiflexão Tornozelo</div>
                <div className="text-base font-bold font-mono-tabular text-[#F9FAFB] mt-1">
                  {m?.dorsiflexao_tornozelo_graus.toFixed(1) ?? '--'}°
                </div>
                <div className="text-[11px] text-[#9CA3AF] mt-0.5 font-mono-tabular">
                  GRF {m?.vetor_grf_bw.toFixed(2) ?? '--'} BW
                </div>
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-3.5">
                <div className="text-[11px] text-[#9CA3AF]">Valgo Dinâmico / Pelve</div>
                <div
                  className={`text-base font-bold font-mono-tabular mt-1 ${
                    (m?.valgo_dinamico_joelho_graus ?? 0) > 6 ? 'text-[#F59E0B]' : 'text-[#10B981]'
                  }`}
                >
                  {m?.valgo_dinamico_joelho_graus.toFixed(1) ?? '--'}°
                </div>
                <div className="text-[11px] text-[#9CA3AF] mt-0.5 font-mono-tabular">
                  Pelve {m?.inclinacao_pelvica_lateral_graus.toFixed(1) ?? '--'}°
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita (5 cols): 4 Gauges KPI + Insight IA + Radar Comparativo */}
          <div className="xl:col-span-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <KpiRadialGauge
                sigla="IPB"
                titulo="Prontidão Biomecânica"
                valor={m?.ipb_prontidao_biomecanica}
                subtitulo={`Assimetria ${m?.assimetria_bilateral_pct.toFixed(1) ?? '--'}%`}
                accentColor={alertaAssimetria ? '#F59E0B' : '#10B981'}
              />
              <KpiRadialGauge
                sigla="SPE"
                titulo="Potência & Explosão"
                valor={m?.spe_potencia_explosao}
                subtitulo={`Pico ${m?.velocidade_pico_kmh.toFixed(1) ?? '--'} km/h`}
                accentColor="#06B6D4"
              />
              <KpiRadialGauge
                sigla="IETP"
                titulo="Eficiência Técnica"
                valor={m?.ietp_eficiencia_tecnica}
                subtitulo={`Bola ${m?.velocidade_bola_kmh.toFixed(1) ?? '--'} km/h`}
                accentColor="#10B981"
              />
              <KpiRadialGauge
                sigla="IPS"
                titulo="Potencial Scouting"
                valor={m?.ips_potencial_scouting}
                subtitulo={`Índice posicional ${detail.atleta?.posicao_primaria ?? ''}`}
                accentColor="#06B6D4"
              />
            </div>

            {/* Card de Insight da IA */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#10B981]">Síntese Automatizada KinePitch AI</span>
                <span className="font-mono-tabular text-[#9CA3AF]">
                  Torque {m?.torque_articular_nm.toFixed(0) ?? '--'} Nm · RSI {m?.rsi_reativo.toFixed(2) ?? '--'}
                </span>
              </div>
              <p className="text-xs text-[#E5E7EB] leading-relaxed">
                {detail.sessao.sintese_ia_texto ||
                  'Sessão concluída pelo motor YOLOv8-Pose. Métricas calculadas e auditadas.'}
              </p>
            </div>

            {/* Gráfico de Radar Comparativo via API */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#F9FAFB]">
                    Radar Comparativo · {detail.atleta?.posicao_primaria}
                  </h3>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Atleta vs Média da Categoria vs Benchmark Profissional (API)
                  </p>
                </div>
                {!matchedBenchmarks.categoria && !matchedBenchmarks.pro && (
                  <button
                    type="button"
                    onClick={() => onNavigateView('cadastro')}
                    className="text-[11px] text-[#06B6D4] hover:underline cursor-pointer"
                  >
                    Parametrizar
                  </button>
                )}
              </div>

              <RadarBenchmarkChart
                atletaScores={{
                  velocidade: Math.min(100, ((m?.velocidade_pico_kmh ?? 0) / 36) * 100),
                  spe: m?.spe_potencia_explosao ?? 0,
                  ietp: m?.ietp_eficiencia_tecnica ?? 0,
                  ipb: m?.ipb_prontidao_biomecanica ?? 0,
                  ips: m?.ips_potencial_scouting ?? 0,
                }}
                categoriaBenchmark={matchedBenchmarks.categoria}
                proBenchmark={matchedBenchmarks.pro}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
