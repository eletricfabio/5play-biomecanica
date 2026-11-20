import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  UserPlus,
  ShieldAlert,
  Webhook,
  CheckCircle2,
  XCircle,
  Lock,
  BarChart3,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { POSICOES_CAMPO } from '../data/schemaBlueprint';
import { normalizeErrorText } from '../services/api';
import { Stage2PipelineWorkspace } from './Stage2PipelineWorkspace';

interface ClubeRow {
  id: number;
  nome: string;
  sigla: string;
  tipoInstituicao: string;
  cidade: string;
  estadoUf: string | null;
  cbfTmsCodigo: string | null;
  ativo: boolean;
}

interface AtletaRow {
  id: number;
  clubeId: number;
  clubeNome: string;
  clubeSigla: string;
  codigo5play: string;
  nomeCompleto: string;
  apelidoEsportivo: string | null;
  dataNascimento: string;
  categoria: string;
  posicaoPrimaria: string;
  peDominante: string;
  estaturaCm: string;
  massaCorporalKg: string;
  imc: string | null;
  estagioMaturacional: string;
  aptoAvaliacao3d: boolean;
}

interface LgpdRow {
  id: number;
  atletaId: number;
  atletaNome: string;
  atletaCodigo: string;
  atletaCategoria: string;
  responsavelLegalNome: string;
  responsavelLegalCpfFinal: string;
  responsavelTelefone: string;
  parentesco: string;
  status: 'pendente' | 'autorizado' | 'revogado' | 'expirado';
  assinadoEm: string | null;
}

interface BenchmarkRow {
  id: number;
  posicao: string;
  nivelReferencia: string;
  amostraN: number;
  vmaxKmh: string;
  split010mSeg: string;
  potenciaChuteKmh: string;
  assimetriaMaxPct: string;
  ipbMedio: string;
  speMedio: string;
  ietpMedio: string;
  ipsMedio: string;
}

interface WebhookRow {
  id: number;
  clubeNome: string;
  clubeSigla: string;
  nomeIntegracao: string;
  tipoSistema: string;
  endpointUrl: string;
  eventosAssinados: string[];
  ativo: boolean;
}

interface AuditRow {
  id: number;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  hashAssinatura: string;
  criadoEm: string;
}

interface LivePostgresWorkspaceProps {
  onCountsRefresh: () => void;
}

type SubTab = 'clubes' | 'atletas' | 'benchmarks' | 'webhooks' | 'pipeline';

export function LivePostgresWorkspace({ onCountsRefresh }: LivePostgresWorkspaceProps) {
  const { user, loading: authLoading, authError, signInWithGoogle, getToken } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>('clubes');

  const [clubes, setClubes] = useState<ClubeRow[]>([]);
  const [atletas, setAtletas] = useState<AtletaRow[]>([]);
  const [lgpds, setLgpds] = useState<LgpdRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [auditoria, setAuditoria] = useState<AuditRow[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Forms state
  const [clubeForm, setClubeForm] = useState({
    nome: '',
    sigla: '',
    tipoInstituicao: 'clube_profissional',
    cidade: '',
    estadoUf: 'SP',
    cbfTmsCodigo: '',
  });

  const [atletaForm, setAtletaForm] = useState({
    clubeId: '',
    nomeCompleto: '',
    apelidoEsportivo: '',
    dataNascimento: '2009-05-14',
    categoria: 'sub17',
    posicaoPrimaria: 'ponta',
    peDominante: 'canhoto',
    estaturaCm: '178',
    massaCorporalKg: '71.4',
    envergaduraCm: '182',
    percentualGordura: '8.6',
    estagioMaturacional: 'pvc_em_andamento',
    mirwaldOffsetAnos: '0.8',
    responsavelLegalNome: '',
    responsavelLegalCpfFinal: '',
    responsavelTelefone: '',
    parentesco: 'Pai',
    autorizarLgpdImediato: true,
  });

  const [benchmarkForm, setBenchmarkForm] = useState({
    posicao: 'ponta',
    nivelReferencia: 'cbf_sub17',
    amostraN: '240',
    vmaxKmh: '32.4',
    split010mSeg: '1.74',
    potenciaChuteKmh: '88.5',
    assimetriaMaxPct: '8.0',
    rsiModAlvo: '2.25',
    valgoMaxSeguroGraus: '4.0',
    ipbMedio: '82',
    speMedio: '85',
    ietpMedio: '80',
    ipsMedio: '81',
  });

  const [webhookForm, setWebhookForm] = useState({
    clubeId: '',
    nomeIntegracao: '',
    tipoSistema: 'cbf_tms',
    endpointUrl: '',
  });

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Sessão não autenticada.');
      const res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        throw new Error('Backend não publicado neste domínio (resposta HTML para rota /api).');
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          normalizeErrorText(
            json?.error ?? json?.detail ?? json,
            `Falha na requisição ao servidor (HTTP ${res.status}).`
          )
        );
      }
      return json;
    },
    [getToken]
  );

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const [c, a, l, b, w, au] = await Promise.all([
        authFetch('/api/clubes'),
        authFetch('/api/atletas'),
        authFetch('/api/lgpd'),
        authFetch('/api/benchmarks'),
        authFetch('/api/webhooks'),
        authFetch('/api/auditoria'),
      ]);
      setClubes(c);
      setAtletas(a);
      setLgpds(l);
      setBenchmarks(b);
      setWebhooks(w);
      setAuditoria(au);
      if (c.length > 0) {
        setAtletaForm((prev) => ({ ...prev, clubeId: prev.clubeId || String(c[0].id) }));
        setWebhookForm((prev) => ({ ...prev, clubeId: prev.clubeId || String(c[0].id) }));
      }
      onCountsRefresh();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao carregar dados do PostgreSQL.',
      });
    } finally {
      setLoadingData(false);
    }
  }, [authFetch, onCountsRefresh, user]);

  useEffect(() => {
    if (user) {
      void loadAll();
    }
  }, [user, loadAll]);

  const isMinorSelected = (() => {
    if (!atletaForm.dataNascimento) return true;
    const birth = new Date(atletaForm.dataNascimento);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age < 18;
  })();

  const handleCreateClube = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await authFetch('/api/clubes', {
        method: 'POST',
        body: JSON.stringify(clubeForm),
      });
      setClubeForm({
        nome: '',
        sigla: '',
        tipoInstituicao: 'clube_profissional',
        cidade: '',
        estadoUf: 'SP',
        cbfTmsCodigo: '',
      });
      setFeedback({ type: 'ok', text: 'Clube persistido no PostgreSQL com auditoria SHA-256.' });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao salvar clube.',
      });
    }
  };

  const handleCreateAtleta = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await authFetch('/api/atletas', {
        method: 'POST',
        body: JSON.stringify(atletaForm),
      });
      setAtletaForm((prev) => ({
        ...prev,
        nomeCompleto: '',
        apelidoEsportivo: '',
        responsavelLegalNome: '',
        responsavelLegalCpfFinal: '',
        responsavelTelefone: '',
      }));
      setFeedback({
        type: 'ok',
        text: 'Atleta salvo no PostgreSQL com cálculo de IMC e vínculo LGPD.',
      });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao salvar atleta.',
      });
    }
  };

  const handleLgpdAction = async (id: number, status: 'autorizado' | 'revogado') => {
    setFeedback(null);
    try {
      await authFetch(`/api/lgpd/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setFeedback({ type: 'ok', text: `Termo LGPD atualizado para: ${status}.` });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao atualizar termo LGPD.',
      });
    }
  };

  const handleUpsertBenchmark = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await authFetch('/api/benchmarks', {
        method: 'POST',
        body: JSON.stringify(benchmarkForm),
      });
      setFeedback({
        type: 'ok',
        text: 'Benchmark de posição salvo no PostgreSQL (upsert por posição + nível).',
      });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao salvar benchmark.',
      });
    }
  };

  const handleCreateWebhook = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await authFetch('/api/webhooks', {
        method: 'POST',
        body: JSON.stringify(webhookForm),
      });
      setWebhookForm((prev) => ({
        ...prev,
        nomeIntegracao: '',
        endpointUrl: '',
      }));
      setFeedback({
        type: 'ok',
        text: `Webhook B2B registrado. Assinatura HMAC gerada (${created.signingSecretPreview}).`,
      });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao criar webhook B2B.',
      });
    }
  };

  const handleToggleWebhook = async (id: number, currentAtivo: boolean) => {
    setFeedback(null);
    try {
      await authFetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: !currentAtivo }),
      });
      await loadAll();
    } catch (error) {
      setFeedback({
        type: 'err',
        text: error instanceof Error ? error.message : 'Erro ao alterar status do webhook.',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-8 text-sm text-[#9CA3AF]">
        Verificando sessão autenticada...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-8 max-w-xl mx-auto text-center space-y-5">
        <div className="w-12 h-12 rounded-lg bg-[#1F2937] mx-auto flex items-center justify-center text-[#10B981]">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-[#F9FAFB]">
            Autenticação Necessária para Gravação no PostgreSQL
          </h2>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Os registros de clubes, atletas, termos LGPD de menores e webhooks B2B são protegidos por autenticação corporativa e gravados em banco PostgreSQL real, sem dados mockados.
          </p>
        </div>
        {authError && (
          <div className="text-xs text-[#FCA5A5] bg-[#7F1D1D]/30 border border-[#EF4444]/40 rounded-md p-3">
            {authError}
          </div>
        )}
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="px-5 py-2.5 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navegação Secundária */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-lg overflow-x-auto">
          {(
            [
              { id: 'clubes', label: `Clubes (${clubes.length})`, icon: Building2 },
              { id: 'atletas', label: `Atletas & LGPD (${atletas.length})`, icon: UserPlus },
              { id: 'pipeline', label: 'Pipeline IA & B2B', icon: Activity },
              { id: 'benchmarks', label: `Benchmarks (${benchmarks.length})`, icon: BarChart3 },
              { id: 'webhooks', label: `Webhooks B2B (${webhooks.length})`, icon: Webhook },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  subTab === item.id
                    ? 'bg-[#1F2937] text-[#F9FAFB]'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-[#9CA3AF]">
          Operador autenticado: <span className="text-[#F9FAFB] font-medium">{user.email}</span>
        </div>
      </div>

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

      {/* TAB 1: CLUBES */}
      {subTab === 'clubes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateClube}
            className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-[#F9FAFB]">Cadastrar Clube / Academia</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#9CA3AF] mb-1">Nome do Clube *</label>
                <input
                  required
                  value={clubeForm.nome}
                  onChange={(e) => setClubeForm({ ...clubeForm, nome: e.target.value })}
                  placeholder="Ex: 5Play Academy"
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Sigla *</label>
                <input
                  required
                  maxLength={12}
                  value={clubeForm.sigla}
                  onChange={(e) => setClubeForm({ ...clubeForm, sigla: e.target.value })}
                  placeholder="5PA"
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] uppercase focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Tipo de Instituição</label>
                <select
                  value={clubeForm.tipoInstituicao}
                  onChange={(e) => setClubeForm({ ...clubeForm, tipoInstituicao: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                >
                  <option value="clube_profissional">Clube Profissional</option>
                  <option value="academia_base">Academia de Base</option>
                  <option value="escolinha_parceira">Escolinha Parceira</option>
                  <option value="federacao">Federação</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Código CBF / TMS</label>
                <input
                  value={clubeForm.cbfTmsCodigo}
                  onChange={(e) => setClubeForm({ ...clubeForm, cbfTmsCodigo: e.target.value })}
                  placeholder="Opcional"
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-[#9CA3AF] mb-1">Cidade *</label>
                <input
                  required
                  value={clubeForm.cidade}
                  onChange={(e) => setClubeForm({ ...clubeForm, cidade: e.target.value })}
                  placeholder="São Paulo"
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">UF</label>
                <input
                  maxLength={2}
                  value={clubeForm.estadoUf}
                  onChange={(e) => setClubeForm({ ...clubeForm, estadoUf: e.target.value })}
                  placeholder="SP"
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] uppercase focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
            >
              Salvar Clube no PostgreSQL
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#111827] border border-[#1F2937] rounded-lg p-6">
            <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
              Clubes Persistidos no Banco
            </h3>
            {loadingData ? (
              <div className="h-32 bg-[#0B0F17] rounded animate-pulse" />
            ) : clubes.length === 0 ? (
              <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-6 text-center text-sm text-[#9CA3AF]">
                Nenhum clube cadastrado ainda. Utilize o formulário ao lado para gravar o primeiro clube no PostgreSQL.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Sigla</th>
                      <th className="py-2 pr-3 font-medium">Nome</th>
                      <th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Cidade / UF</th>
                      <th className="py-2 font-medium text-right">TMS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70">
                    {clubes.map((c) => (
                      <tr key={c.id} className="hover:bg-[#161E2E]/50">
                        <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4] font-semibold">
                          {c.sigla}
                        </td>
                        <td className="py-2.5 pr-3 text-[#F9FAFB] font-medium">{c.nome}</td>
                        <td className="py-2.5 pr-3 text-[#9CA3AF]">{c.tipoInstituicao}</td>
                        <td className="py-2.5 pr-3 text-[#D1D5DB]">
                          {c.cidade}
                          {c.estadoUf ? ` / ${c.estadoUf}` : ''}
                        </td>
                        <td className="py-2.5 font-mono-tabular text-right text-[#9CA3AF]">
                          {c.cbfTmsCodigo || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ATLETAS & LGPD */}
      {subTab === 'atletas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleCreateAtleta}
              className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
            >
              <h3 className="text-base font-semibold text-[#F9FAFB]">
                Cadastrar Atleta &amp; Antropometria
              </h3>

              {clubes.length === 0 ? (
                <div className="text-xs text-[#FCD34D] bg-[#78350F]/30 border border-[#F59E0B]/40 rounded-md p-3">
                  Cadastre primeiro ao menos um clube na aba Clubes para vincular o atleta.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-[#9CA3AF] mb-1">Clube Atual *</label>
                    <select
                      required
                      value={atletaForm.clubeId}
                      onChange={(e) => setAtletaForm({ ...atletaForm, clubeId: e.target.value })}
                      className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                    >
                      {clubes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} ({c.sigla})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Nome Completo *</label>
                      <input
                        required
                        value={atletaForm.nomeCompleto}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, nomeCompleto: e.target.value })
                        }
                        placeholder="Ex: Lucas Silveira"
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Data Nascimento *</label>
                      <input
                        required
                        type="date"
                        value={atletaForm.dataNascimento}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, dataNascimento: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB] font-mono-tabular focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Categoria</label>
                      <select
                        value={atletaForm.categoria}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, categoria: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                      >
                        <option value="sub9">Sub-9</option>
                        <option value="sub11">Sub-11</option>
                        <option value="sub13">Sub-13</option>
                        <option value="sub15">Sub-15</option>
                        <option value="sub17">Sub-17</option>
                        <option value="sub20">Sub-20</option>
                        <option value="profissional">Profissional</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Posição</label>
                      <select
                        value={atletaForm.posicaoPrimaria}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, posicaoPrimaria: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                      >
                        {POSICOES_CAMPO.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Pé Dominante</label>
                      <select
                        value={atletaForm.peDominante}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, peDominante: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                      >
                        <option value="destro">Destro</option>
                        <option value="canhoto">Canhoto</option>
                        <option value="ambidestro">Ambidestro</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Estatura (cm)</label>
                      <input
                        required
                        type="number"
                        step="0.5"
                        value={atletaForm.estaturaCm}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, estaturaCm: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Massa (kg)</label>
                      <input
                        required
                        type="number"
                        step="0.1"
                        value={atletaForm.massaCorporalKg}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, massaCorporalKg: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">Enverg. (cm)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={atletaForm.envergaduraCm}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, envergaduraCm: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">% Gordura</label>
                      <input
                        type="number"
                        step="0.1"
                        value={atletaForm.percentualGordura}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, percentualGordura: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">
                        Estágio Maturacional (PVC)
                      </label>
                      <select
                        value={atletaForm.estagioMaturacional}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, estagioMaturacional: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs text-[#F9FAFB]"
                      >
                        <option value="pre_pvc">Pré-PVC</option>
                        <option value="pvc_em_andamento">PVC em Andamento</option>
                        <option value="pos_pvc">Pós-PVC</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1">
                        Offset Mirwald (anos)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={atletaForm.mirwaldOffsetAnos}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, mirwaldOffsetAnos: e.target.value })
                        }
                        className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                      />
                    </div>
                  </div>

                  {isMinorSelected && (
                    <div className="bg-[#0B0F17] border border-[#F59E0B]/40 rounded-md p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#F59E0B]">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Consentimento LGPD Obrigatório (Atleta Menor de Idade)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          required
                          value={atletaForm.responsavelLegalNome}
                          onChange={(e) =>
                            setAtletaForm({ ...atletaForm, responsavelLegalNome: e.target.value })
                          }
                          placeholder="Nome do Responsável Legal *"
                          className="w-full bg-[#111827] border border-[#374151] rounded px-2.5 py-1.5 text-xs text-[#F9FAFB]"
                        />
                        <input
                          required
                          value={atletaForm.responsavelTelefone}
                          onChange={(e) =>
                            setAtletaForm({ ...atletaForm, responsavelTelefone: e.target.value })
                          }
                          placeholder="Telefone / WhatsApp *"
                          className="w-full bg-[#111827] border border-[#374151] rounded px-2.5 py-1.5 text-xs text-[#F9FAFB]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <input
                          required
                          maxLength={4}
                          value={atletaForm.responsavelLegalCpfFinal}
                          onChange={(e) =>
                            setAtletaForm({
                              ...atletaForm,
                              responsavelLegalCpfFinal: e.target.value,
                            })
                          }
                          placeholder="4 últimos dígitos CPF *"
                          className="w-full bg-[#111827] border border-[#374151] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                        />
                        <select
                          value={atletaForm.parentesco}
                          onChange={(e) =>
                            setAtletaForm({ ...atletaForm, parentesco: e.target.value })
                          }
                          className="w-full bg-[#111827] border border-[#374151] rounded px-2.5 py-1.5 text-xs text-[#F9FAFB]"
                        >
                          <option value="Pai">Pai</option>
                          <option value="Mãe">Mãe</option>
                          <option value="Tutor Legal">Tutor Legal</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-[#D1D5DB] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={atletaForm.autorizarLgpdImediato}
                          onChange={(e) =>
                            setAtletaForm({
                              ...atletaForm,
                              autorizarLgpdImediato: e.target.checked,
                            })
                          }
                          className="accent-[#10B981]"
                        />
                        <span>Termo assinado presencialmente (liberar captura 3D)</span>
                      </label>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
                  >
                    Salvar Atleta no PostgreSQL
                  </button>
                </>
              )}
            </form>

            {/* Lista de Atletas + LGPD */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
                  Atletas Cadastrados
                </h3>
                {atletas.length === 0 ? (
                  <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-6 text-center text-sm text-[#9CA3AF]">
                    Nenhum atleta registrado no banco de dados ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                          <th className="py-2 pr-3 font-medium">Código</th>
                          <th className="py-2 pr-3 font-medium">Atleta / Clube</th>
                          <th className="py-2 pr-3 font-medium">Posição / Cat.</th>
                          <th className="py-2 pr-3 font-medium text-right">Antropometria</th>
                          <th className="py-2 font-medium text-right">Status 3D</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F2937]/70">
                        {atletas.map((a) => (
                          <tr key={a.id} className="hover:bg-[#161E2E]/50">
                            <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4]">
                              {a.codigo5play}
                            </td>
                            <td className="py-2.5 pr-3">
                              <div className="text-[#F9FAFB] font-medium">{a.nomeCompleto}</div>
                              <div className="text-[#9CA3AF]">{a.clubeSigla} · {a.estagioMaturacional}</div>
                            </td>
                            <td className="py-2.5 pr-3 text-[#D1D5DB]">
                              {a.posicaoPrimaria} · {a.categoria}
                            </td>
                            <td className="py-2.5 pr-3 font-mono-tabular text-right text-[#D1D5DB]">
                              {a.estaturaCm}cm · {a.massaCorporalKg}kg · IMC {a.imc}
                            </td>
                            <td className="py-2.5 text-right font-mono-tabular">
                              <span
                                className={
                                  a.aptoAvaliacao3d ? 'text-[#10B981]' : 'text-[#F59E0B]'
                                }
                              >
                                {a.aptoAvaliacao3d ? 'Apto' : 'Bloq. LGPD'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
                  Consentimentos LGPD (Menores de Base)
                </h3>
                {lgpds.length === 0 ? (
                  <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-5 text-center text-xs text-[#9CA3AF]">
                    Termos LGPD serão listados aqui automaticamente ao cadastrar atletas menores de 18 anos.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                          <th className="py-2 pr-3 font-medium">Atleta</th>
                          <th className="py-2 pr-3 font-medium">Responsável Legal</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F2937]/70">
                        {lgpds.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2.5 pr-3">
                              <div className="text-[#F9FAFB] font-medium">{item.atletaNome}</div>
                              <div className="font-mono-tabular text-[#9CA3AF]">
                                {item.atletaCodigo} · {item.atletaCategoria}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 text-[#D1D5DB]">
                              {item.responsavelLegalNome} ({item.parentesco}) · CPF *{item.responsavelLegalCpfFinal}
                            </td>
                            <td className="py-2.5 pr-3 font-mono-tabular">
                              <span
                                className={
                                  item.status === 'autorizado'
                                    ? 'text-[#10B981]'
                                    : item.status === 'revogado'
                                    ? 'text-[#EF4444]'
                                    : 'text-[#F59E0B]'
                                }
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-right space-x-2">
                              {item.status !== 'autorizado' && (
                                <button
                                  type="button"
                                  onClick={() => void handleLgpdAction(item.id, 'autorizado')}
                                  className="px-2 py-1 text-xs bg-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/30 rounded cursor-pointer"
                                >
                                  Autorizar
                                </button>
                              )}
                              {item.status !== 'revogado' && (
                                <button
                                  type="button"
                                  onClick={() => void handleLgpdAction(item.id, 'revogado')}
                                  className="px-2 py-1 text-xs bg-[#EF4444]/20 text-[#FCA5A5] hover:bg-[#EF4444]/30 rounded cursor-pointer"
                                >
                                  Revogar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BENCHMARKS POR POSIÇÃO */}
      {subTab === 'benchmarks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleUpsertBenchmark}
            className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-[#F9FAFB]">
              Parametrizar Benchmark por Posição
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Posição</label>
                <select
                  value={benchmarkForm.posicao}
                  onChange={(e) => setBenchmarkForm({ ...benchmarkForm, posicao: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-xs text-[#F9FAFB]"
                >
                  {POSICOES_CAMPO.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Nível Referência</label>
                <select
                  value={benchmarkForm.nivelReferencia}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, nivelReferencia: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-xs text-[#F9FAFB]"
                >
                  <option value="cbf_sub11">CBF Sub-11</option>
                  <option value="cbf_sub13">CBF Sub-13</option>
                  <option value="cbf_sub15">CBF Sub-15</option>
                  <option value="cbf_sub17">CBF Sub-17</option>
                  <option value="cbf_sub20">CBF Sub-20</option>
                  <option value="serie_a_pro">Série A Pro</option>
                  <option value="top5_europa">Top 5 Europa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Vmax (km/h)</label>
                <input
                  type="number"
                  step="0.1"
                  value={benchmarkForm.vmaxKmh}
                  onChange={(e) => setBenchmarkForm({ ...benchmarkForm, vmaxKmh: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Split 0-10m (s)</label>
                <input
                  type="number"
                  step="0.01"
                  value={benchmarkForm.split010mSeg}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, split010mSeg: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Chute (km/h)</label>
                <input
                  type="number"
                  step="0.5"
                  value={benchmarkForm.potenciaChuteKmh}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, potenciaChuteKmh: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-2.5 py-2 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">IPB Alvo</label>
                <input
                  type="number"
                  value={benchmarkForm.ipbMedio}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, ipbMedio: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">SPE Alvo</label>
                <input
                  type="number"
                  value={benchmarkForm.speMedio}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, speMedio: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">IETP Alvo</label>
                <input
                  type="number"
                  value={benchmarkForm.ietpMedio}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, ietpMedio: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">IPS Alvo</label>
                <input
                  type="number"
                  value={benchmarkForm.ipsMedio}
                  onChange={(e) =>
                    setBenchmarkForm({ ...benchmarkForm, ipsMedio: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-[#374151] rounded px-2 py-1.5 text-xs font-mono-tabular text-[#F9FAFB]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
            >
              Salvar Benchmark no PostgreSQL
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#111827] border border-[#1F2937] rounded-lg p-6">
            <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
              Benchmarks Persistidos (Radar &amp; Relatório B2B)
            </h3>
            {benchmarks.length === 0 ? (
              <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-6 text-center text-sm text-[#9CA3AF]">
                Nenhum benchmark parametrizado ainda. Salve o primeiro registro ao lado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Posição / Nível</th>
                      <th className="py-2 pr-3 font-medium text-right">Vmax</th>
                      <th className="py-2 pr-3 font-medium text-right">0-10m</th>
                      <th className="py-2 pr-3 font-medium text-right">Chute</th>
                      <th className="py-2 font-medium text-right">IPB / SPE / IETP / IPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70 font-mono-tabular">
                    {benchmarks.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2.5 pr-3 font-sans">
                          <span className="text-[#F9FAFB] font-medium capitalize">{b.posicao}</span>
                          <span className="text-[#9CA3AF]"> · {b.nivelReferencia}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[#06B6D4]">{b.vmaxKmh} km/h</td>
                        <td className="py-2.5 pr-3 text-right text-[#D1D5DB]">{b.split010mSeg} s</td>
                        <td className="py-2.5 pr-3 text-right text-[#D1D5DB]">
                          {b.potenciaChuteKmh} km/h
                        </td>
                        <td className="py-2.5 text-right text-[#10B981]">
                          {b.ipbMedio} / {b.speMedio} / {b.ietpMedio} / {b.ipsMedio}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WEBHOOKS B2B & AUDITORIA */}
      {subTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleCreateWebhook}
              className="lg:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4"
            >
              <h3 className="text-base font-semibold text-[#F9FAFB]">
                Registrar Webhook B2B (Integração Clube)
              </h3>
              {clubes.length === 0 ? (
                <div className="text-xs text-[#FCD34D] bg-[#78350F]/30 border border-[#F59E0B]/40 rounded-md p-3">
                  Cadastre primeiro ao menos um clube para associar o webhook B2B.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-[#9CA3AF] mb-1">Clube *</label>
                    <select
                      value={webhookForm.clubeId}
                      onChange={(e) => setWebhookForm({ ...webhookForm, clubeId: e.target.value })}
                      className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-xs text-[#F9FAFB]"
                    >
                      {clubes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome} ({c.sigla})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#9CA3AF] mb-1">Nome da Integração *</label>
                    <input
                      required
                      value={webhookForm.nomeIntegracao}
                      onChange={(e) =>
                        setWebhookForm({ ...webhookForm, nomeIntegracao: e.target.value })
                      }
                      placeholder="Ex: Sincronização Catapult GPS"
                      className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm text-[#F9FAFB]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9CA3AF] mb-1">Sistema Externo</label>
                    <select
                      value={webhookForm.tipoSistema}
                      onChange={(e) =>
                        setWebhookForm({ ...webhookForm, tipoSistema: e.target.value })
                      }
                      className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-xs text-[#F9FAFB]"
                    >
                      <option value="cbf_tms">CBF / TMS</option>
                      <option value="catapult_gps">Catapult GPS</option>
                      <option value="statsports">STATSports</option>
                      <option value="vicon_nexus">Vicon Nexus</option>
                      <option value="kistler_force_plate">Kistler Force Plate</option>
                      <option value="erp_clube_custom">ERP Clube Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#9CA3AF] mb-1">Endpoint HTTPS *</label>
                    <input
                      required
                      type="url"
                      value={webhookForm.endpointUrl}
                      onChange={(e) =>
                        setWebhookForm({ ...webhookForm, endpointUrl: e.target.value })
                      }
                      placeholder="https://api.clube.com.br/webhooks/kinepitch"
                      className="w-full bg-[#0B0F17] border border-[#374151] rounded-md px-3 py-2 text-sm font-mono-tabular text-[#F9FAFB]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 text-sm font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors cursor-pointer"
                  >
                    Salvar Webhook B2B
                  </button>
                </>
              )}
            </form>

            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
                  Webhooks B2B Ativos
                </h3>
                {webhooks.length === 0 ? (
                  <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-6 text-center text-xs text-[#9CA3AF]">
                    Nenhum webhook B2B configurado ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                          <th className="py-2 pr-3 font-medium">Integração / Clube</th>
                          <th className="py-2 pr-3 font-medium">Sistema</th>
                          <th className="py-2 pr-3 font-medium">Status</th>
                          <th className="py-2 font-medium text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F2937]/70">
                        {webhooks.map((w) => (
                          <tr key={w.id}>
                            <td className="py-2.5 pr-3">
                              <div className="text-[#F9FAFB] font-medium">{w.nomeIntegracao}</div>
                              <div className="font-mono-tabular text-[#9CA3AF] truncate max-w-[260px]">
                                {w.clubeSigla} · {w.endpointUrl}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4]">
                              {w.tipoSistema}
                            </td>
                            <td className="py-2.5 pr-3 font-mono-tabular">
                              <span className={w.ativo ? 'text-[#10B981]' : 'text-[#9CA3AF]'}>
                                {w.ativo ? 'Ativo' : 'Pausado'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => void handleToggleWebhook(w.id, w.ativo)}
                                className="px-2.5 py-1 text-xs bg-[#1F2937] hover:bg-[#374151] text-[#F9FAFB] rounded cursor-pointer"
                              >
                                {w.ativo ? 'Pausar' : 'Ativar'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6">
                <h3 className="text-base font-semibold text-[#F9FAFB] mb-4">
                  Logs de Auditoria SHA-256 (Últimos 25 Eventos)
                </h3>
                {auditoria.length === 0 ? (
                  <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-5 text-center text-xs text-[#9CA3AF]">
                    Cada escrita no PostgreSQL gera automaticamente um registro assinado em SHA-256.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono-tabular">
                      <thead>
                        <tr className="border-b border-[#1F2937] text-[#9CA3AF] font-sans">
                          <th className="py-2 pr-3 font-medium">Data</th>
                          <th className="py-2 pr-3 font-medium">Evento</th>
                          <th className="py-2 pr-3 font-medium">Tabela</th>
                          <th className="py-2 font-medium text-right">Assinatura SHA-256</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1F2937]/70">
                        {auditoria.map((log) => (
                          <tr key={log.id}>
                            <td className="py-2 pr-3 text-[#9CA3AF]">
                              {new Date(log.criadoEm).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 pr-3 text-[#F9FAFB]">{log.acao}</td>
                            <td className="py-2 pr-3 text-[#06B6D4]">
                              {log.entidade}#{log.entidadeId || '-'}
                            </td>
                            <td className="py-2 text-right text-[#10B981]">
                              {log.hashAssinatura.slice(0, 14)}...
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ETAPA 2 — PIPELINE BIOMECÂNICO 22 PONTOS, DASHBOARD DINÂMICO & COMPARTILHAMENTO B2B */}
      {subTab === 'pipeline' && (
        <Stage2PipelineWorkspace
          clubes={clubes}
          atletas={atletas}
          authFetch={authFetch}
          onRefreshCounts={onCountsRefresh}
        />
      )}
    </div>
  );
}
