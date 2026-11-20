import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck2,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import {
  extractApiError,
  fetchCompartilhamentos,
  fetchPublicB2BDossier,
  type CompartilhamentoItem,
  type PublicB2BDossierResponse,
} from '../services/api';
import { KpiRadialGauge, Skeleton22PointsCanvas } from './BiomechanicalVisuals';

interface RelatorioCompartilhadoB2BProps {
  initialToken?: string | null;
  isPublicStandalone?: boolean;
  isAuthenticated?: boolean;
  onExitPublicMode?: () => void;
}

export function RelatorioCompartilhadoB2B({
  initialToken,
  isPublicStandalone = false,
  isAuthenticated = false,
  onExitPublicMode,
}: RelatorioCompartilhadoB2BProps) {
  const [tokenInput, setTokenInput] = useState(initialToken || '');
  const [activeToken, setActiveToken] = useState(initialToken || '');
  const [dossier, setDossier] = useState<PublicB2BDossierResponse | null>(null);
  const [recentShares, setRecentShares] = useState<CompartilhamentoItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ status: number | null; message: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  const loadDossier = useCallback(async (tok: string) => {
    const clean = tok.trim();
    if (!clean) return;
    setLoading(true);
    setErrorState(null);
    setDossier(null);
    try {
      const data = await fetchPublicB2BDossier(clean);
      setDossier(data);
    } catch (err) {
      setErrorState(extractApiError(err, 'Falha ao consultar dossiê B2B.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      setActiveToken(initialToken);
      void loadDossier(initialToken);
    }
  }, [initialToken, loadDossier]);

  // Se estiver autenticado dentro da plataforma sem token na URL, lista os tokens gerados para consulta rápida
  useEffect(() => {
    if (!isPublicStandalone && isAuthenticated) {
      fetchCompartilhamentos()
        .then((rows) => {
          setRecentShares(rows);
          if (!initialToken && rows.length > 0 && !activeToken) {
            setTokenInput(rows[0].token_acesso);
            setActiveToken(rows[0].token_acesso);
            void loadDossier(rows[0].token_acesso);
          }
        })
        .catch(() => {
          // Silencioso caso ainda não tenha tokens
        });
    }
  }, [activeToken, initialToken, isAuthenticated, isPublicStandalone, loadDossier]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActiveToken(tokenInput.trim());
    void loadDossier(tokenInput.trim());
  };

  const handleCopyPublicUrl = async () => {
    const tok = activeToken || tokenInput;
    if (!tok) return;
    await navigator.clipboard.writeText(`${window.location.origin}/?token=${tok}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const m = dossier?.sessao?.metricas;
  const atleta = dossier?.atleta;
  const alertaAssimetria = (m?.assimetria_bilateral_pct ?? 0) > 15;

  return (
    <div className="space-y-6">
      {/* Barra Superior do Dossiê */}
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <FileCheck2 className="w-5 h-5 text-[#10B981] shrink-0" />
          <div>
            <h1 className="text-base font-bold text-[#F9FAFB]">
              Relatório Executivo de Scouting B2B
            </h1>
            <p className="text-xs text-[#9CA3AF]">
              Acesso público tokenizado (GET /api/v1/compartilhamentos/publico/:token) com auditoria SHA-256
            </p>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Cole o Token UUID do dossiê..."
            className="w-64 sm:w-72 px-3 py-1.5 text-xs bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular focus:outline-none focus:border-[#06B6D4]"
          />
          <button
            type="submit"
            disabled={loading || !tokenInput.trim()}
            className="px-3.5 py-1.5 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            Carregar Dossiê
          </button>
          {isPublicStandalone && onExitPublicMode && (
            <button
              type="button"
              onClick={onExitPublicMode}
              className="px-3 py-1.5 text-xs bg-[#181C24] border border-[#1F2937] text-[#E5E7EB] rounded-md cursor-pointer whitespace-nowrap"
            >
              Acessar Studio
            </button>
          )}
        </form>
      </div>

      {/* Lista rápida de tokens recentes quando logado no painel interno */}
      {!isPublicStandalone && recentShares.length > 0 && (
        <div className="bg-[#0F131C] border border-[#1F2937] rounded-lg px-4 py-3 flex flex-wrap items-center gap-2 text-xs print:hidden">
          <span className="text-[#9CA3AF]">Tokens recentes:</span>
          {recentShares.slice(0, 5).map((sh) => (
            <button
              key={sh.id}
              type="button"
              onClick={() => {
                setTokenInput(sh.token_acesso);
                setActiveToken(sh.token_acesso);
                void loadDossier(sh.token_acesso);
              }}
              className={`px-2.5 py-1 rounded font-mono-tabular border cursor-pointer ${
                activeToken === sh.token_acesso
                  ? 'bg-[#06B6D4]/15 border-[#06B6D4] text-[#06B6D4]'
                  : 'bg-[#111827] border-[#1F2937] text-[#E5E7EB]'
              }`}
            >
              {sh.atleta_nome.split(' ')[0]} · {sh.codigo_sessao}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-24 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-[#111827] border border-[#1F2937] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!loading && errorState && (
        <div className="bg-[#111827] border border-[#EF4444]/40 rounded-lg p-8 text-center space-y-3 max-w-xl mx-auto">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <h2 className="text-base font-bold text-[#F9FAFB]">
            {errorState.status === 410
              ? 'Link de Compartilhamento Expirado'
              : 'Dossiê Não Encontrado ou Revogado'}
          </h2>
          <p className="text-xs text-[#9CA3AF]">{errorState.message}</p>
        </div>
      )}

      {!loading && !errorState && !dossier && (
        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-10 text-center space-y-2 text-xs text-[#9CA3AF]">
          <p>Informe um token B2B válido acima ou gere um link seguro na aba Análise Biomecânica 3D.</p>
        </div>
      )}

      {!loading && dossier && atleta && dossier.sessao && (
        <div className="space-y-6">
          {/* Banner de Compliance e Integridade SHA-256 */}
          <div className="bg-[#0F131C] border border-[#10B981]/30 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[#F9FAFB]">
                  Dossiê Auditado 5Play Sports · LGPD Verificada
                </div>
                <div className="font-mono-tabular text-[11px] text-[#9CA3AF] break-all mt-0.5">
                  SHA-256: {dossier.audit_hash_sha256}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 font-mono-tabular text-[11px] text-[#9CA3AF] shrink-0">
              <span className="inline-flex items-center gap-1 text-[#06B6D4]">
                <Clock className="w-3.5 h-3.5" />
                Válido até {new Date(dossier.expira_em).toLocaleDateString('pt-BR')}
              </span>
              <span>Visualizações: {dossier.visualizacoes_count}</span>
            </div>
          </div>

          {/* Card de Identificação do Atleta + Síntese Executiva */}
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-[#181C24] border border-[#1F2937] flex items-center justify-center text-xl font-bold text-[#10B981] shrink-0">
                {atleta.nome_completo.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-mono-tabular text-[#06B6D4]">
                  {atleta.codigo_5play} · {dossier.clube?.sigla || 'CLUBE'}
                </div>
                <h2 className="text-xl font-bold text-[#F9FAFB] mt-0.5">{atleta.nome_completo}</h2>
                <div className="text-xs text-[#9CA3AF] mt-1">
                  <span className="capitalize">{atleta.posicao_primaria}</span> ·{' '}
                  <span className="uppercase">{atleta.categoria}</span> · Pé {atleta.pe_dominante} ·{' '}
                  {atleta.estatura_cm} cm / {atleta.massa_corporal_kg} kg
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#0B0F17] border border-[#1F2937] rounded-md p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#10B981]">Síntese Biomecânica &amp; Scouting</span>
                <span className="font-mono-tabular text-[#9CA3AF]">
                  Sessão {dossier.sessao.codigo_sessao} · {dossier.sessao.tipo_teste.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-[#E5E7EB] leading-relaxed">
                {dossier.sessao.sintese_ia_texto ||
                  'Avaliação biomecânica de 22 pontos concluída e auditada.'}
              </p>
            </div>
          </div>

          {/* 4 Gauges Circulares de KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiRadialGauge
              sigla="IPB"
              titulo="Prontidão Biomecânica"
              valor={m?.ipb}
              subtitulo={`Assimetria ${m?.assimetria_bilateral_pct?.toFixed(1) ?? '--'}%`}
              accentColor={alertaAssimetria ? '#F59E0B' : '#10B981'}
              size="lg"
            />
            <KpiRadialGauge
              sigla="SPE"
              titulo="Potência & Explosão"
              valor={m?.spe}
              subtitulo={`Vmax ${m?.velocidade_pico_kmh?.toFixed(1) ?? '--'} km/h`}
              accentColor="#06B6D4"
              size="lg"
            />
            <KpiRadialGauge
              sigla="IETP"
              titulo="Eficiência Técnica"
              valor={m?.ietp}
              subtitulo={`Chute ${m?.velocidade_bola_kmh?.toFixed(1) ?? '--'} km/h`}
              accentColor="#10B981"
              size="lg"
            />
            <KpiRadialGauge
              sigla="IPS"
              titulo="Potencial Scouting"
              valor={m?.ips}
              subtitulo={`Posição ${atleta.posicao_primaria}`}
              accentColor="#06B6D4"
              size="lg"
            />
          </div>

          {/* Cinemática 22 Pontos + Tabela Comparativa de Benchmarks */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1F2937] flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F9FAFB]">Malha Óptica 22 Pontos</span>
                <span className="font-mono-tabular text-[#10B981]">
                  Confiança {m?.confianca_rastreamento_pct?.toFixed(1) ?? '--'}%
                </span>
              </div>
              <div className="h-72">
                <Skeleton22PointsCanvas
                  pontos={m?.pontos_opticos_22}
                  alertaAssimetria={alertaAssimetria}
                  compact
                />
              </div>
              <div className="p-4 grid grid-cols-3 gap-2 border-t border-[#1F2937] bg-[#0F131C] text-xs font-mono-tabular">
                <div>
                  <div className="text-[10px] text-[#9CA3AF]">Split 0-10m</div>
                  <div className="text-[#F9FAFB] font-semibold">
                    {m?.split_0_10m_seg?.toFixed(2) ?? '--'}s
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9CA3AF]">Salto CMJ</div>
                  <div className="text-[#06B6D4] font-semibold">
                    {m?.altura_salto_cm?.toFixed(1) ?? '--'} cm
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9CA3AF]">Valgo Dinâmico</div>
                  <div className={alertaAssimetria ? 'text-[#F59E0B] font-semibold' : 'text-[#10B981] font-semibold'}>
                    {m?.valgo_dinamico_joelho_graus?.toFixed(1) ?? '--'}°
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-7 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">
                  Tabela Comparativa · Atleta vs Benchmarks ({atleta.posicao_primaria})
                </h3>
                <p className="text-xs text-[#9CA3AF]">
                  Comparação direta com os benchmarks oficiais armazenados em benchmarks_posicao
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Referência</th>
                      <th className="py-2 px-3 text-right font-medium">Vmax (km/h)</th>
                      <th className="py-2 px-3 text-right font-medium">IPB</th>
                      <th className="py-2 px-3 text-right font-medium">SPE</th>
                      <th className="py-2 px-3 text-right font-medium">IETP</th>
                      <th className="py-2 pl-3 text-right font-medium">IPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70 font-mono-tabular">
                    <tr className="bg-[#06B6D4]/10">
                      <td className="py-2.5 pr-3 font-sans font-semibold text-[#06B6D4]">
                        {atleta.nome_completo} (Atleta)
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#F9FAFB]">
                        {m?.velocidade_pico_kmh?.toFixed(1) ?? '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#10B981]">
                        {m?.ipb?.toFixed(1) ?? '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#06B6D4]">
                        {m?.spe?.toFixed(1) ?? '--'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#F9FAFB]">
                        {m?.ietp?.toFixed(1) ?? '--'}
                      </td>
                      <td className="py-2.5 pl-3 text-right text-[#10B981]">
                        {m?.ips?.toFixed(1) ?? '--'}
                      </td>
                    </tr>
                    {dossier.benchmarks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center font-sans text-[#9CA3AF]">
                          Nenhum benchmark de posição cadastrado para comparação no momento.
                        </td>
                      </tr>
                    ) : (
                      dossier.benchmarks.map((b) => (
                        <tr key={b.nivel_referencia}>
                          <td className="py-2.5 pr-3 font-sans text-[#E5E7EB]">
                            {b.nivel_referencia.replace(/_/g, ' ').toUpperCase()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#9CA3AF]">
                            {b.vmax_kmh.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#9CA3AF]">
                            {b.ipb_medio.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#9CA3AF]">
                            {b.spe_medio.toFixed(1)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[#9CA3AF]">
                            {b.ietp_medio.toFixed(1)}
                          </td>
                          <td className="py-2.5 pl-3 text-right text-[#9CA3AF]">
                            {b.ips_medio.toFixed(1)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Barra de Ações do Dossiê */}
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2 text-xs text-[#10B981]">
              <CheckCircle2 className="w-4 h-4" />
              <span>Documento assinado eletronicamente · 5Play Sports B2B Scouting</span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopyPublicUrl()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs bg-[#181C24] hover:bg-[#1F2937] border border-[#1F2937] text-[#E5E7EB] rounded-md cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Link Copiado!' : 'Copiar Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Exportar PDF / Imprimir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
