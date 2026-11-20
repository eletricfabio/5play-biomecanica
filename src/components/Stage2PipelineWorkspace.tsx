import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Share2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { normalizeErrorText } from '../services/api';

interface ClubeOption {
  id: number;
  nome: string;
  sigla: string;
}

interface AtletaOption {
  id: number;
  codigo5play: string;
  nomeCompleto: string;
  posicaoPrimaria: string;
  aptoAvaliacao3d: boolean;
}

interface DashboardData {
  totalClubesAtivos: number;
  totalAtletas: number;
  totalSessoesConcluidas: number;
  eficienciaBiomecanicaMediaPct: number;
  velocidadePicoMediaKmh: number;
  velocidadePicoMaxKmh: number;
  assimetriasCriticasCount: number;
  acwrMedioElenco: number;
  atletasMonitorados: Array<{
    atletaId: number;
    codigo5play: string;
    nomeCompleto: string;
    clubeSigla: string;
    categoria: string;
    posicaoPrimaria: string;
    aptoAvaliacao3d: boolean;
    ipb: number | null;
    spe: number | null;
    ietp: number | null;
    ips: number | null;
    velocidadePicoKmh: number | null;
    assimetriaBilateralPct: number | null;
    alertaAssimetriaCritica: boolean;
  }>;
}

interface SessaoRow {
  sessaoId: number;
  codigoSessao: string;
  atletaNome: string;
  atletaCodigo: string;
  posicao: string;
  tipoTeste: string;
  statusProcessamento: string;
  redisJobId: string | null;
  sinteseIaTexto: string | null;
  ipb: string | null;
  spe: string | null;
  ietp: string | null;
  ips: string | null;
  velocidadePicoKmh: string | null;
  assimetriaBilateralPct: string | null;
  pontosOpticos22: Record<string, { x: number; y: number; z: number; confianca: number }> | null;
}

interface ShareRow {
  id: number;
  tokenAcesso: string;
  atletaNome: string;
  codigoSessao: string;
  auditHashSha256: string;
  expiraEm: string;
  visualizacoesCount: number;
}

interface Stage2PipelineWorkspaceProps {
  clubes: ClubeOption[];
  atletas: AtletaOption[];
  authFetch: (url: string, init?: RequestInit) => Promise<unknown>;
  onRefreshCounts: () => void;
}

export function Stage2PipelineWorkspace({
  clubes,
  atletas,
  authFetch,
  onRefreshCounts,
}: Stage2PipelineWorkspaceProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [sessoes, setSessoes] = useState<SessaoRow[]>([]);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [last202Receipt, setLast202Receipt] = useState<{
    codigoSessao: string;
    redisJobId: string;
    uploadSignedUrl: string;
    alertaAssimetria: boolean;
  } | null>(null);
  const [lastShareResult, setLastShareResult] = useState<{
    linkSeguroUrl: string;
    webhooksCount: number;
    payloadEnviado: unknown;
  } | null>(null);

  const [sessaoForm, setSessaoForm] = useState({
    atletaId: '',
    tipoTeste: 'finalizacao',
    modoCaptura: 'stereo_4k_60fps',
    nomeArquivo: 'treino_chute_cam4k.mp4',
    velocidadePicoKmh: '32.6',
    flexaoJoelhoEsqGraus: '44',
    flexaoJoelhoDirGraus: '36',
    valgoDinamicoGraus: '3.6',
    alturaSaltoCm: '42',
    acwr: '1.12',
  });

  const [shareForm, setShareForm] = useState({
    sessaoId: '',
    clubeDestinoId: '',
    diasValidade: '7',
  });

  const loadPipelineData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, sess, sh] = await Promise.all([
        authFetch('/api/dashboard') as Promise<DashboardData>,
        authFetch('/api/sessoes') as Promise<SessaoRow[]>,
        authFetch('/api/compartilhamentos') as Promise<ShareRow[]>,
      ]);
      setDashboard(dash);
      setSessoes(sess);
      setShares(sh);
      if (atletas.length > 0 && !sessaoForm.atletaId) {
        setSessaoForm((prev) => ({ ...prev, atletaId: String(atletas[0].id) }));
      }
      if (sess.length > 0 && !shareForm.sessaoId) {
        setShareForm((prev) => ({ ...prev, sessaoId: String(sess[0].sessaoId) }));
      }
      if (clubes.length > 0 && !shareForm.clubeDestinoId) {
        setShareForm((prev) => ({ ...prev, clubeDestinoId: String(clubes[0].id) }));
      }
    } catch (error) {
      setFeedback({
        type: 'err',
        text: normalizeErrorText(error, 'Erro ao carregar dados da Etapa 2.'),
      });
    } finally {
      setLoading(false);
    }
  }, [atletas, authFetch, clubes, sessaoForm.atletaId, shareForm.clubeDestinoId, shareForm.sessaoId]);

  useEffect(() => {
    void loadPipelineData();
  }, [loadPipelineData]);

  const handleEnqueueSession = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = (await authFetch('/api/sessoes/enqueue', {
        method: 'POST',
        body: JSON.stringify(sessaoForm),
      })) as {
        sessao: { codigoSessao: string; redisJobId: string };
        uploadSignedUrl: string;
        alertaAssimetriaCritica: boolean;
      };
      setLast202Receipt({
        codigoSessao: res.sessao.codigoSessao,
        redisJobId: res.sessao.redisJobId,
        uploadSignedUrl: res.uploadSignedUrl,
        alertaAssimetria: res.alertaAssimetriaCritica,
      });
      setFeedback({
        type: 'ok',
        text: `202 Accepted · Sessão ${res.sessao.codigoSessao} processada com 22 pontos ópticos e 4 KPIs posicionais.`,
      });
      onRefreshCounts();
      await loadPipelineData();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: normalizeErrorText(error, 'Falha ao enfileirar análise biomecânica.'),
      });
    }
  };

  const handleShareB2b = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = (await authFetch('/api/compartilhamentos/b2b', {
        method: 'POST',
        body: JSON.stringify(shareForm),
      })) as {
        linkSeguroUrl: string;
        webhooksDisparados: unknown[];
        payloadEnviado: unknown;
      };
      setLastShareResult({
        linkSeguroUrl: res.linkSeguroUrl,
        webhooksCount: res.webhooksDisparados.length,
        payloadEnviado: res.payloadEnviado,
      });
      setFeedback({
        type: 'ok',
        text: `Token B2B gerado (validade ${shareForm.diasValidade} dias) e ${res.webhooksDisparados.length} webhook(s) notificado(s).`,
      });
      onRefreshCounts();
      await loadPipelineData();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: normalizeErrorText(error, 'Falha ao compartilhar dossiê B2B.'),
      });
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-3.5 rounded-md text-xs border flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-[#064E3B]/30 border-[#10B981]/40 text-[#6EE7B7]'
              : 'bg-[#7F1D1D]/30 border-[#EF4444]/40 text-[#FCA5A5]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 1. DASHBOARD DINÂMICO AGREGADO DO POSTGRESQL */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#10B981]" />
            Dashboard Dinâmico em Tempo Real (Agregação PostgreSQL)
          </h3>
          <span className="text-xs text-[#9CA3AF]">Zero dados estáticos</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
            <div className="text-xs text-[#9CA3AF]">Eficiência Biomecânica Média</div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#10B981]">
              {loading ? '...' : `${dashboard?.eficienciaBiomecanicaMediaPct ?? 0}%`}
            </div>
            <div className="mt-1 text-xs text-[#9CA3AF]">
              {dashboard?.totalSessoesConcluidas ?? 0} sessões concluídas
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
            <div className="text-xs text-[#9CA3AF]">Velocidade Pico Média / Máx</div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#06B6D4]">
              {loading ? '...' : `${dashboard?.velocidadePicoMediaKmh ?? 0} km/h`}
            </div>
            <div className="mt-1 text-xs font-mono-tabular text-[#9CA3AF]">
              Pico elenco: {dashboard?.velocidadePicoMaxKmh ?? 0} km/h
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
            <div className="text-xs text-[#9CA3AF]">Alertas de Assimetria (&gt;15%)</div>
            <div
              className={`mt-1 text-2xl font-bold font-mono-tabular ${
                (dashboard?.assimetriasCriticasCount ?? 0) > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'
              }`}
            >
              {loading ? '...' : dashboard?.assimetriasCriticasCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-[#9CA3AF]">Monitoramento preventivo LCA</div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
            <div className="text-xs text-[#9CA3AF]">ACWR Médio do Elenco</div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular text-[#F59E0B]">
              {loading ? '...' : dashboard?.acwrMedioElenco ?? 0}
            </div>
            <div className="mt-1 text-xs text-[#9CA3AF]">
              {dashboard?.totalAtletas ?? 0} atletas em {dashboard?.totalClubesAtivos ?? 0} clube(s)
            </div>
          </div>
        </div>
      </section>

      {/* 2. FILA 202 ACCEPTED + COMPARTILHAMENTO B2B */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleEnqueueSession}
          className="lg:col-span-6 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-[#06B6D4]" />
            Enfileirar Vídeo (202 Accepted) &amp; Motor 22 Pontos
          </h3>

          {atletas.length === 0 ? (
            <div className="text-xs text-[#FCD34D] bg-[#78350F]/30 border border-[#F59E0B]/40 rounded-md p-3">
              Cadastre ao menos um atleta com LGPD autorizada na aba Atletas &amp; LGPD.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Atleta Avaliado *</label>
                  <select
                    required
                    value={sessaoForm.atletaId}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, atletaId: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                  >
                    {atletas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nomeCompleto} ({a.posicaoPrimaria} · {a.aptoAvaliacao3d ? 'LGPD OK' : 'Bloq.'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Protocolo Biomecânico</label>
                  <select
                    value={sessaoForm.tipoTeste}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, tipoTeste: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                  >
                    <option value="finalizacao">Finalização (Chute 3D)</option>
                    <option value="sprint_20m">Sprint Linear 20m</option>
                    <option value="salto_vertical">Salto Vertical CMJ</option>
                    <option value="agilidade_cod">Mudança de Direção (COD)</option>
                    <option value="chute_apoio">Pé de Apoio &amp; Valgo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Arquivo MP4 (MinIO S3)</label>
                  <input
                    required
                    value={sessaoForm.nomeArquivo}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, nomeArquivo: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Modo de Captura</label>
                  <select
                    value={sessaoForm.modoCaptura}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, modoCaptura: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                  >
                    <option value="stereo_4k_60fps">Estéreo 4K 60fps</option>
                    <option value="pitch_cam_mobile">PitchCam Mobile HUD</option>
                    <option value="vicon_12cam_240fps">Vicon Studio 240fps</option>
                    <option value="drone_tatico">Drone Tático</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Flexão Joelho Esq (°)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={sessaoForm.flexaoJoelhoEsqGraus}
                    onChange={(e) =>
                      setSessaoForm({ ...sessaoForm, flexaoJoelhoEsqGraus: e.target.value })
                    }
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Flexão Joelho Dir (°)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={sessaoForm.flexaoJoelhoDirGraus}
                    onChange={(e) =>
                      setSessaoForm({ ...sessaoForm, flexaoJoelhoDirGraus: e.target.value })
                    }
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Vmax (km/h)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sessaoForm.velocidadePicoKmh}
                    onChange={(e) =>
                      setSessaoForm({ ...sessaoForm, velocidadePicoKmh: e.target.value })
                    }
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Valgo Dinâmico (°)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={sessaoForm.valgoDinamicoGraus}
                    onChange={(e) =>
                      setSessaoForm({ ...sessaoForm, valgoDinamicoGraus: e.target.value })
                    }
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Salto CMJ (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={sessaoForm.alturaSaltoCm}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, alturaSaltoCm: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">ACWR Carga</label>
                  <input
                    type="number"
                    step="0.01"
                    value={sessaoForm.acwr}
                    onChange={(e) => setSessaoForm({ ...sessaoForm, acwr: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
              >
                Gerar URL S3 &amp; Processar 22 Pontos (202 Accepted)
              </button>

              {last202Receipt && (
                <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-3 text-xs space-y-1 font-mono-tabular">
                  <div className="flex items-center justify-between">
                    <span className="text-[#10B981]">HTTP 202 Accepted · {last202Receipt.codigoSessao}</span>
                    {last202Receipt.alertaAssimetria && (
                      <span className="text-[#EF4444] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Assimetria &gt; 15%
                      </span>
                    )}
                  </div>
                  <div className="text-[#9CA3AF] truncate">Job ID: {last202Receipt.redisJobId}</div>
                  <div className="text-[#06B6D4] truncate">S3 PUT: {last202Receipt.uploadSignedUrl}</div>
                </div>
              )}
            </>
          )}
        </form>

        {/* COMPARTILHAMENTO B2B + WEBHOOK */}
        <form
          onSubmit={handleShareB2b}
          className="lg:col-span-6 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#F59E0B]" />
            Compartilhamento B2B (Token 7 Dias + Webhook JSON)
          </h3>

          {sessoes.length === 0 ? (
            <div className="text-xs text-[#9CA3AF] bg-[#0B0F17] border border-[#1F2937] rounded-md p-4">
              Processe ao menos uma sessão biomecânica ao lado para gerar o token de compartilhamento B2B.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Sessão de Análise *</label>
                <select
                  required
                  value={shareForm.sessaoId}
                  onChange={(e) => setShareForm({ ...shareForm, sessaoId: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                >
                  {sessoes.map((s) => (
                    <option key={s.sessaoId} value={s.sessaoId}>
                      {s.codigoSessao} · {s.atletaNome} (IPS {s.ips ?? '—'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Clube Destino (Webhook)</label>
                  <select
                    value={shareForm.clubeDestinoId}
                    onChange={(e) => setShareForm({ ...shareForm, clubeDestinoId: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                  >
                    {clubes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.sigla})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1">Expiração (dias)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={shareForm.diasValidade}
                    onChange={(e) => setShareForm({ ...shareForm, diasValidade: e.target.value })}
                    className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-sm font-semibold bg-[#06B6D4] hover:bg-[#0891B2] text-[#041820] rounded-md transition-colors cursor-pointer"
              >
                Gerar Token B2B &amp; Disparar Webhook JSON
              </button>

              {lastShareResult && (
                <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-3 text-xs space-y-1.5 font-mono-tabular">
                  <div className="text-[#10B981] truncate">Link: {lastShareResult.linkSeguroUrl}</div>
                  <div className="text-[#9CA3AF]">
                    Webhooks disparados nesta execução: {lastShareResult.webhooksCount}
                  </div>
                  <pre className="text-[11px] text-[#D1D5DB] max-h-28 overflow-auto bg-[#070A10] p-2 rounded">
                    {JSON.stringify(lastShareResult.payloadEnviado, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </form>
      </div>

      {/* 3. TABELA DE SESSÕES PROCESSADAS (22 PONTOS + 4 KPIS + ASSIMETRIA) */}
      <section className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
        <h3 className="text-base font-semibold text-[#F9FAFB]">
          Sessões Processadas — 4 KPIs Ponderados por Posição &amp; Alerta de Assimetria
        </h3>
        {sessoes.length === 0 ? (
          <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-6 text-center text-xs text-[#9CA3AF]">
            Nenhuma sessão processada ainda. Enfileire a primeira captura no formulário acima.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                  <th className="py-2 pr-3 font-medium">Sessão</th>
                  <th className="py-2 pr-3 font-medium">Atleta / Posição</th>
                  <th className="py-2 pr-3 font-medium text-right">Vmax</th>
                  <th className="py-2 pr-3 font-medium text-right">Assimetria</th>
                  <th className="py-2 pr-3 font-medium text-right">IPB / SPE / IETP / IPS</th>
                  <th className="py-2 font-medium text-right">Pontos 3D</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]/70">
                {sessoes.map((s) => {
                  const asym = Number(s.assimetriaBilateralPct ?? 0);
                  const alerta = asym > 15.0;
                  const ptsCount = s.pontosOpticos22 ? Object.keys(s.pontosOpticos22).length : 0;
                  return (
                    <tr key={s.sessaoId} className="hover:bg-[#161E2E]/50">
                      <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4]">
                        {s.codigoSessao}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="text-[#F9FAFB] font-medium">{s.atletaNome}</div>
                        <div className="text-[#9CA3AF] capitalize">
                          {s.posicao} · {s.tipoTeste}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono-tabular text-[#D1D5DB]">
                        {s.velocidadePicoKmh ? `${s.velocidadePicoKmh} km/h` : '—'}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-mono-tabular font-semibold ${
                          alerta ? 'text-[#EF4444]' : 'text-[#10B981]'
                        }`}
                      >
                        {asym.toFixed(2)}% {alerta ? '(ALERTA >15%)' : ''}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono-tabular text-[#10B981]">
                        {s.ipb ?? '-'} / {s.spe ?? '-'} / {s.ietp ?? '-'} / {s.ips ?? '-'}
                      </td>
                      <td className="py-2.5 text-right font-mono-tabular text-[#9CA3AF]">
                        {ptsCount} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {shares.length > 0 && (
          <div className="pt-4 border-t border-[#1F2937]">
            <h4 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">
              Dossiês B2B Compartilhados Recentemente
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono-tabular">
                <thead>
                  <tr className="border-b border-[#1F2937] text-[#9CA3AF] font-sans">
                    <th className="py-2 pr-3 font-medium">Atleta / Sessão</th>
                    <th className="py-2 pr-3 font-medium">Token UUID</th>
                    <th className="py-2 pr-3 font-medium">Expira em</th>
                    <th className="py-2 font-medium text-right">Visualizações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937]/70">
                  {shares.map((sh) => (
                    <tr key={sh.id}>
                      <td className="py-2 pr-3 font-sans text-[#F9FAFB]">
                        {sh.atletaNome} · <span className="text-[#06B6D4]">{sh.codigoSessao}</span>
                      </td>
                      <td className="py-2 pr-3 text-[#10B981]">{sh.tokenAcesso}</td>
                      <td className="py-2 pr-3 text-[#9CA3AF]">
                        {new Date(sh.expiraEm).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2 text-right text-[#D1D5DB]">{sh.visualizacoesCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
