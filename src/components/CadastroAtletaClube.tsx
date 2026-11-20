import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Target,
  UserPlus,
  Webhook,
  XCircle,
} from 'lucide-react';
import {
  createAtletaApi,
  createClubeApi,
  createWebhookApi,
  extractApiError,
  fetchAtletas,
  fetchBenchmarks,
  fetchClubes,
  fetchLgpd,
  fetchWebhooks,
  upsertBenchmarkApi,
  validarLgpdApi,
  type AtletaItem,
  type BenchmarkItem,
  type CategoriaCompetitiva,
  type ClubeItem,
  type EstagioMaturacional,
  type LgpdItem,
  type PeDominante,
  type PosicaoCampo,
  type WebhookItem,
} from '../services/api';

interface CadastroAtletaClubeProps {
  isAuthenticated: boolean;
  onSignIn: () => void;
  onDataChanged?: () => void;
}

type CadastroTab = 'atleta' | 'clube' | 'governanca';

const POSICOES: Array<{ id: PosicaoCampo; label: string; sigla: string }> = [
  { id: 'goleiro', label: 'Goleiro', sigla: 'GOL' },
  { id: 'zagueiro', label: 'Zagueiro', sigla: 'ZAG' },
  { id: 'lateral', label: 'Lateral', sigla: 'LAT' },
  { id: 'volante', label: 'Volante', sigla: 'VOL' },
  { id: 'meia', label: 'Meia', sigla: 'MEI' },
  { id: 'ponta', label: 'Ponta', sigla: 'PON' },
  { id: 'centroavante', label: 'Centroavante', sigla: 'ATA' },
];

const VALENCIAS_DISPONIVEIS = [
  'Box-to-Box',
  'Pressing Alto',
  '1v1 Ofensivo',
  'Passe Vertical',
  'Saída Curta',
  'Amplitude',
  'Jogo Aéreo',
  'Transição Rápida',
];

function calcularIdade(iso: string): number | null {
  if (!iso) return null;
  const nasc = new Date(iso);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

export function CadastroAtletaClube({
  isAuthenticated,
  onSignIn,
  onDataChanged,
}: CadastroAtletaClubeProps) {
  const [tab, setTab] = useState<CadastroTab>('atleta');
  const [clubes, setClubes] = useState<ClubeItem[]>([]);
  const [atletas, setAtletas] = useState<AtletaItem[]>([]);
  const [lgpds, setLgpds] = useState<LgpdItem[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Formulário Atleta
  const [atletaForm, setAtletaForm] = useState({
    clube_id: '',
    nome_completo: '',
    apelido_esportivo: '',
    data_nascimento: '2008-05-14',
    nacionalidade: 'Brasileira',
    categoria: 'sub17' as CategoriaCompetitiva,
    posicao_primaria: 'meia' as PosicaoCampo,
    posicao_secundaria: '' as '' | PosicaoCampo,
    numero_camisa: '10',
    pe_dominante: 'destro' as PeDominante,
    tipo_contrato: 'formacao_fdi' as
      | 'formacao_fdi'
      | 'profissional_cbf'
      | 'amador_federado'
      | 'avaliacao_trial'
      | 'agente_livre',
    empresario_agencia: '',
    valencias_taticas: ['Passe Vertical', 'Pressing Alto'] as string[],
    estatura_cm: '176',
    massa_corporal_kg: '68',
    envergadura_cm: '179',
    percentual_gordura: '9.4',
    estagio_maturacional: 'pvc_em_andamento' as EstagioMaturacional,
    mirwald_offset_anos: '0.6',
    tag_gps_vinculada: '',
    responsavel_legal_nome: '',
    responsavel_legal_cpf_final: '',
    responsavel_telefone: '',
    parentesco: 'Mãe / Pai',
    autorizar_imediatamente: true,
  });

  // Formulário Clube
  const [clubeForm, setClubeForm] = useState({
    nome: '',
    sigla: '',
    cnpj: '',
    tipo_instituicao: 'clube_profissional' as
      | 'clube_profissional'
      | 'academia_base'
      | 'escolinha_parceira'
      | 'federacao',
    cbf_tms_codigo: '',
    cidade: '',
    estado_uf: '',
    responsavel_tecnico: '',
    email_contato: '',
  });

  // Formulário Benchmark
  const [benchForm, setBenchForm] = useState({
    posicao: 'meia' as PosicaoCampo,
    nivel_referencia: 'cbf_sub17',
    vmax_kmh: '32.2',
    split_0_10m_seg: '1.74',
    potencia_chute_kmh: '106',
    assimetria_max_pct: '12.0',
    ipb_medio: '84.0',
    spe_medio: '82.0',
    ietp_medio: '86.0',
    ips_medio: '85.0',
  });

  // Formulário Webhook
  const [webhookForm, setWebhookForm] = useState({
    clube_id: '',
    nome_integracao: '',
    tipo_sistema: 'catapult_gps',
    endpoint_url: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setNeedsAuth(false);
    try {
      const [cData, aData, lData, bData, wData] = await Promise.all([
        fetchClubes(),
        fetchAtletas(),
        fetchLgpd(),
        fetchBenchmarks(),
        fetchWebhooks(),
      ]);
      setClubes(cData);
      setAtletas(aData);
      setLgpds(lData);
      setBenchmarks(bData);
      setWebhooks(wData);
      if (cData.length > 0) {
        setAtletaForm((prev) => (prev.clube_id ? prev : { ...prev, clube_id: String(cData[0].id) }));
        setWebhookForm((prev) => (prev.clube_id ? prev : { ...prev, clube_id: String(cData[0].id) }));
      }
    } catch (err) {
      const parsed = extractApiError(err, 'Falha ao carregar cadastros.');
      if (parsed.status === 401) setNeedsAuth(true);
      else setFeedback({ type: 'err', text: parsed.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setNeedsAuth(true);
      return;
    }
    void loadAll();
  }, [isAuthenticated, loadAll]);

  const idadeAtleta = useMemo(
    () => calcularIdade(atletaForm.data_nascimento),
    [atletaForm.data_nascimento]
  );
  const menorIdade = idadeAtleta !== null && idadeAtleta < 18;

  const imcPreview = useMemo(() => {
    const est = Number(atletaForm.estatura_cm);
    const kg = Number(atletaForm.massa_corporal_kg);
    if (!est || !kg || est <= 0) return null;
    const m = est / 100;
    return (kg / (m * m)).toFixed(2);
  }, [atletaForm.estatura_cm, atletaForm.massa_corporal_kg]);

  const completudePct = useMemo(() => {
    const checks = [
      Boolean(atletaForm.clube_id),
      atletaForm.nome_completo.trim().length >= 3,
      Boolean(atletaForm.data_nascimento),
      Boolean(atletaForm.posicao_primaria),
      Number(atletaForm.estatura_cm) > 100,
      Number(atletaForm.massa_corporal_kg) > 25,
      !menorIdade ||
        (atletaForm.responsavel_legal_nome.trim().length >= 3 &&
          atletaForm.responsavel_telefone.trim().length >= 8),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [atletaForm, menorIdade]);

  const toggleValencia = (v: string) => {
    setAtletaForm((prev) => ({
      ...prev,
      valencias_taticas: prev.valencias_taticas.includes(v)
        ? prev.valencias_taticas.filter((item) => item !== v)
        : [...prev.valencias_taticas, v],
    }));
  };

  const handleSubmitAtleta = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!atletaForm.clube_id) {
      setFeedback({ type: 'err', text: 'Cadastre ou selecione um clube antes de salvar o atleta.' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAtletaApi({
        clube_id: Number(atletaForm.clube_id),
        nome_completo: atletaForm.nome_completo,
        apelido_esportivo: atletaForm.apelido_esportivo || undefined,
        data_nascimento: atletaForm.data_nascimento,
        nacionalidade: atletaForm.nacionalidade,
        categoria: atletaForm.categoria,
        posicao_primaria: atletaForm.posicao_primaria,
        posicao_secundaria: atletaForm.posicao_secundaria || null,
        numero_camisa: atletaForm.numero_camisa ? Number(atletaForm.numero_camisa) : null,
        pe_dominante: atletaForm.pe_dominante,
        tipo_contrato: atletaForm.tipo_contrato,
        empresario_agencia: atletaForm.empresario_agencia || undefined,
        valencias_taticas: atletaForm.valencias_taticas,
        estatura_cm: Number(atletaForm.estatura_cm),
        massa_corporal_kg: Number(atletaForm.massa_corporal_kg),
        envergadura_cm: atletaForm.envergadura_cm ? Number(atletaForm.envergadura_cm) : null,
        percentual_gordura: atletaForm.percentual_gordura
          ? Number(atletaForm.percentual_gordura)
          : null,
        estagio_maturacional: atletaForm.estagio_maturacional,
        mirwald_offset_anos: atletaForm.mirwald_offset_anos
          ? Number(atletaForm.mirwald_offset_anos)
          : null,
        tag_gps_vinculada: atletaForm.tag_gps_vinculada || undefined,
        consentimento_lgpd: menorIdade
          ? {
              responsavel_legal_nome: atletaForm.responsavel_legal_nome,
              responsavel_legal_cpf_final: atletaForm.responsavel_legal_cpf_final || '0000',
              responsavel_telefone: atletaForm.responsavel_telefone,
              parentesco: atletaForm.parentesco || 'Responsável Legal',
              finalidade_captura_biometrica: true,
              finalidade_scouting_b2b: atletaForm.autorizar_imediatamente,
              autorizar_imediatamente: atletaForm.autorizar_imediatamente,
            }
          : null,
      });

      setFeedback({
        type: 'ok',
        text: `Atleta ${created.nome_completo} (${created.codigo_5play}) persistido no PostgreSQL com sucesso.`,
      });
      setAtletaForm((prev) => ({
        ...prev,
        nome_completo: '',
        apelido_esportivo: '',
        responsavel_legal_nome: '',
        responsavel_legal_cpf_final: '',
        responsavel_telefone: '',
      }));
      await loadAll();
      onDataChanged?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractApiError(err, 'Erro ao cadastrar atleta.').message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClube = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const created = await createClubeApi(clubeForm);
      setFeedback({
        type: 'ok',
        text: `Clube ${created.nome} (${created.sigla}) cadastrado no PostgreSQL.`,
      });
      setClubeForm({
        nome: '',
        sigla: '',
        cnpj: '',
        tipo_instituicao: 'clube_profissional',
        cbf_tms_codigo: '',
        cidade: '',
        estado_uf: '',
        responsavel_tecnico: '',
        email_contato: '',
      });
      await loadAll();
      setAtletaForm((prev) => ({ ...prev, clube_id: String(created.id) }));
      onDataChanged?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractApiError(err, 'Erro ao cadastrar clube.').message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidarLgpd = async (atletaId: number, status: 'autorizado' | 'revogado') => {
    setFeedback(null);
    try {
      await validarLgpdApi({
        atleta_id: atletaId,
        status,
        finalidade_captura_biometrica: true,
        finalidade_scouting_b2b: status === 'autorizado',
      });
      setFeedback({
        type: 'ok',
        text: `Consentimento LGPD atualizado para "${status}".`,
      });
      await loadAll();
      onDataChanged?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractApiError(err, 'Falha ao validar LGPD.').message,
      });
    }
  };

  const handleSaveBenchmark = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await upsertBenchmarkApi({
        posicao: benchForm.posicao,
        nivel_referencia: benchForm.nivel_referencia,
        vmax_kmh: Number(benchForm.vmax_kmh),
        split_0_10m_seg: Number(benchForm.split_0_10m_seg),
        potencia_chute_kmh: Number(benchForm.potencia_chute_kmh),
        assimetria_max_pct: Number(benchForm.assimetria_max_pct),
        ipb_medio: Number(benchForm.ipb_medio),
        spe_medio: Number(benchForm.spe_medio),
        ietp_medio: Number(benchForm.ietp_medio),
        ips_medio: Number(benchForm.ips_medio),
      });
      setFeedback({
        type: 'ok',
        text: `Benchmark ${benchForm.posicao} · ${benchForm.nivel_referencia} salvo no PostgreSQL.`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractApiError(err, 'Erro ao salvar benchmark.').message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveWebhook = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await createWebhookApi({
        clube_id: Number(webhookForm.clube_id),
        nome_integracao: webhookForm.nome_integracao,
        tipo_sistema: webhookForm.tipo_sistema,
        endpoint_url: webhookForm.endpoint_url,
        eventos_assinados: ['sessao.concluida', 'dossie.compartilhado', 'alerta.assimetria_critica'],
      });
      setFeedback({ type: 'ok', text: 'Webhook B2B registrado com assinatura HMAC-SHA256.' });
      setWebhookForm((prev) => ({ ...prev, nome_integracao: '', endpoint_url: '' }));
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractApiError(err, 'Erro ao registrar webhook B2B.').message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (needsAuth) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-8 max-w-2xl mx-auto my-8 space-y-4">
        <div className="flex items-center gap-3 text-[#F9FAFB]">
          <Lock className="w-5 h-5 text-[#10B981]" />
          <h2 className="text-lg font-bold">Autenticação Necessária · Cadastro &amp; LGPD</h2>
        </div>
        <p className="text-sm text-[#9CA3AF]">
          Para cadastrar clubes, atletas com antropometria, termos LGPD de menores e webhooks B2B, faça login com Google.
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

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Abas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1F2937] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#F9FAFB] tracking-tight">
            Cadastro de Atletas, Clubes &amp; Compliance LGPD
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Persistência direta via POST /api/v1/clubes, /api/v1/atletas e /api/v1/lgpd/validar
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-lg">
          <button
            type="button"
            onClick={() => setTab('atleta')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'atleta'
                ? 'bg-[#10B981] text-[#042116] font-semibold'
                : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            Novo Atleta ({atletas.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('clube')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'clube'
                ? 'bg-[#10B981] text-[#042116] font-semibold'
                : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            Clubes ({clubes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('governanca')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'governanca'
                ? 'bg-[#10B981] text-[#042116] font-semibold'
                : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
            }`}
          >
            LGPD, Benchmarks &amp; Webhooks
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-md px-4 py-3 text-xs flex items-center gap-2 border ${
            feedback.type === 'ok'
              ? 'bg-[#10B981]/10 border-[#10B981]/40 text-[#A7F3D0]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/40 text-[#FCA5A5]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#10B981]" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 text-[#EF4444]" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: CADASTRO DE ATLETA + PREVIEW LATERAL */}
      {tab === 'atleta' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Preview do Card do Atleta (4 cols) */}
          <div className="xl:col-span-4 space-y-5">
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#181C24] border border-[#1F2937] flex items-center justify-center text-base font-bold text-[#06B6D4]">
                  {atletaForm.nome_completo
                    ? atletaForm.nome_completo.slice(0, 2).toUpperCase()
                    : 'AT'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F9FAFB] truncate">
                    {atletaForm.nome_completo || 'Novo Atleta KinePitch'}
                  </div>
                  <div className="text-xs text-[#9CA3AF] mt-0.5">
                    <span className="uppercase">{atletaForm.categoria}</span> ·{' '}
                    <span className="capitalize">{atletaForm.posicao_primaria}</span>
                    {atletaForm.numero_camisa ? ` · #${atletaForm.numero_camisa}` : ''}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#9CA3AF]">Completude do Prontuário</span>
                  <span className="font-mono-tabular text-[#10B981] font-semibold">
                    {completudePct}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#0B0F17] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10B981] transition-all"
                    style={{ width: `${completudePct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-[#0B0F17] border border-[#1F2937] rounded p-2">
                  <div className="text-[10px] text-[#9CA3AF]">Idade</div>
                  <div className="text-xs font-bold font-mono-tabular text-[#F9FAFB] mt-0.5">
                    {idadeAtleta !== null ? `${idadeAtleta} anos` : '--'}
                  </div>
                </div>
                <div className="bg-[#0B0F17] border border-[#1F2937] rounded p-2">
                  <div className="text-[10px] text-[#9CA3AF]">IMC</div>
                  <div className="text-xs font-bold font-mono-tabular text-[#06B6D4] mt-0.5">
                    {imcPreview || '--'}
                  </div>
                </div>
                <div className="bg-[#0B0F17] border border-[#1F2937] rounded p-2">
                  <div className="text-[10px] text-[#9CA3AF]">LGPD 3D</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      !menorIdade || atletaForm.autorizar_imediatamente
                        ? 'text-[#10B981]'
                        : 'text-[#F59E0B]'
                    }`}
                  >
                    {!menorIdade || atletaForm.autorizar_imediatamente ? 'Apto' : 'Pendente'}
                  </div>
                </div>
              </div>
            </div>

            {/* Clubes Disponíveis */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F9FAFB]">Clubes Cadastrados</span>
                <button
                  type="button"
                  onClick={() => setTab('clube')}
                  className="text-xs text-[#10B981] hover:underline cursor-pointer"
                >
                  + Novo Clube
                </button>
              </div>
              {clubes.length === 0 ? (
                <p className="text-xs text-[#9CA3AF]">
                  Nenhum clube cadastrado ainda. Crie o primeiro clube na aba ao lado.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {clubes.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-xs bg-[#0B0F17] border border-[#1F2937] rounded px-3 py-2"
                    >
                      <span className="text-[#F9FAFB] font-medium truncate">{c.nome}</span>
                      <span className="font-mono-tabular text-[#06B6D4] ml-2 shrink-0">
                        {c.sigla}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Formulário Completo em 3 Seções (8 cols) */}
          <form
            onSubmit={handleSubmitAtleta}
            className="xl:col-span-8 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-6 text-xs"
          >
            {/* Seção 01 */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#F9FAFB] border-b border-[#1F2937] pb-2">
                01. Dados Pessoais &amp; Vínculo Institucional
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Clube / Academia *</label>
                  <select
                    required
                    value={atletaForm.clube_id}
                    onChange={(e) => setAtletaForm({ ...atletaForm, clube_id: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  >
                    <option value="">Selecione o clube...</option>
                    {clubes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sigla} · {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={atletaForm.nome_completo}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, nome_completo: e.target.value })
                    }
                    placeholder="Ex: Matheus Henrique Silva"
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1">Apelido Esportivo</label>
                  <input
                    type="text"
                    value={atletaForm.apelido_esportivo}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, apelido_esportivo: e.target.value })
                    }
                    placeholder="Ex: Matheusinho"
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1">Data de Nascimento *</label>
                  <input
                    type="date"
                    required
                    value={atletaForm.data_nascimento}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, data_nascimento: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1">Categoria Competitiva *</label>
                  <select
                    value={atletaForm.categoria}
                    onChange={(e) =>
                      setAtletaForm({
                        ...atletaForm,
                        categoria: e.target.value as CategoriaCompetitiva,
                      })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
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
                  <label className="block text-[#9CA3AF] mb-1">Tipo de Contrato</label>
                  <select
                    value={atletaForm.tipo_contrato}
                    onChange={(e) =>
                      setAtletaForm({
                        ...atletaForm,
                        tipo_contrato: e.target.value as typeof atletaForm.tipo_contrato,
                      })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  >
                    <option value="formacao_fdi">Formação (FDI)</option>
                    <option value="profissional_cbf">Profissional (CBF)</option>
                    <option value="amador_federado">Amador Federado</option>
                    <option value="avaliacao_trial">Avaliação / Trial</option>
                    <option value="agente_livre">Agente Livre</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Seção 02 */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#F9FAFB] border-b border-[#1F2937] pb-2">
                02. Perfil Tático &amp; 7 Posições de Campo
              </h2>

              <div>
                <label className="block text-[#9CA3AF] mb-2">Posição Primária (Ponderação KPI) *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {POSICOES.map((p) => {
                    const active = atletaForm.posicao_primaria === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setAtletaForm({ ...atletaForm, posicao_primaria: p.id })}
                        className={`px-2.5 py-2.5 rounded-md border text-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#10B981]/15 border-[#10B981] text-[#10B981] font-semibold'
                            : 'bg-[#0B0F17] border-[#1F2937] text-[#9CA3AF] hover:text-[#F9FAFB]'
                        }`}
                      >
                        <div className="text-[11px] font-mono-tabular">{p.sigla}</div>
                        <div className="text-[11px] mt-0.5 truncate">{p.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[#9CA3AF] mb-1.5">Pé Dominante</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['destro', 'canhoto', 'ambidestro'] as const).map((pe) => (
                      <button
                        key={pe}
                        type="button"
                        onClick={() => setAtletaForm({ ...atletaForm, pe_dominante: pe })}
                        className={`py-2 rounded-md border capitalize text-[11px] cursor-pointer ${
                          atletaForm.pe_dominante === pe
                            ? 'bg-[#06B6D4]/15 border-[#06B6D4] text-[#06B6D4] font-semibold'
                            : 'bg-[#0B0F17] border-[#1F2937] text-[#9CA3AF]'
                        }`}
                      >
                        {pe}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1.5">Camisa</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={atletaForm.numero_camisa}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, numero_camisa: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3AF] mb-1.5">Tag GPS / Sensor</label>
                  <input
                    type="text"
                    value={atletaForm.tag_gps_vinculada}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, tag_gps_vinculada: e.target.value })
                    }
                    placeholder="Ex: CAT-204"
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#9CA3AF] mb-2">Valências Táticas</label>
                <div className="flex flex-wrap gap-2">
                  {VALENCIAS_DISPONIVEIS.map((v) => {
                    const active = atletaForm.valencias_taticas.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleValencia(v)}
                        className={`px-3 py-1 rounded-md border text-[11px] cursor-pointer ${
                          active
                            ? 'bg-[#06B6D4]/15 border-[#06B6D4]/50 text-[#06B6D4]'
                            : 'bg-[#0B0F17] border-[#1F2937] text-[#9CA3AF]'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Seção 03 */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#F9FAFB] border-b border-[#1F2937] pb-2">
                03. Antropometria, Maturação Biológica (Mirwald/PVC) &amp; LGPD
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Estatura (cm) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={atletaForm.estatura_cm}
                    onChange={(e) => setAtletaForm({ ...atletaForm, estatura_cm: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Massa Corporal (kg) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={atletaForm.massa_corporal_kg}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, massa_corporal_kg: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Envergadura (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={atletaForm.envergadura_cm}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, envergadura_cm: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">% Gordura</label>
                  <input
                    type="number"
                    step="0.1"
                    value={atletaForm.percentual_gordura}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, percentual_gordura: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Estágio Maturacional</label>
                  <select
                    value={atletaForm.estagio_maturacional}
                    onChange={(e) =>
                      setAtletaForm({
                        ...atletaForm,
                        estagio_maturacional: e.target.value as EstagioMaturacional,
                      })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  >
                    <option value="pre_pvc">Pré-PVC</option>
                    <option value="pvc_em_andamento">PVC em Andamento</option>
                    <option value="pos_pvc">Pós-PVC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Offset Mirwald (anos)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={atletaForm.mirwald_offset_anos}
                    onChange={(e) =>
                      setAtletaForm({ ...atletaForm, mirwald_offset_anos: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
              </div>

              {menorIdade && (
                <div className="bg-[#0F131C] border border-[#10B981]/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[#10B981] font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Consentimento LGPD Obrigatório (Atleta Menor de 18 Anos)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[#9CA3AF] mb-1">Responsável Legal *</label>
                      <input
                        type="text"
                        required={menorIdade}
                        value={atletaForm.responsavel_legal_nome}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, responsavel_legal_nome: e.target.value })
                        }
                        placeholder="Nome completo do responsável"
                        className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                      />
                    </div>
                    <div>
                      <label className="block text-[#9CA3AF] mb-1">Telefone Responsável *</label>
                      <input
                        type="text"
                        required={menorIdade}
                        value={atletaForm.responsavel_telefone}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, responsavel_telefone: e.target.value })
                        }
                        placeholder="(11) 99999-9999"
                        className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                      />
                    </div>
                    <div>
                      <label className="block text-[#9CA3AF] mb-1">4 Últimos Dígitos CPF *</label>
                      <input
                        type="text"
                        maxLength={4}
                        pattern="\d{4}"
                        required={menorIdade}
                        value={atletaForm.responsavel_legal_cpf_final}
                        onChange={(e) =>
                          setAtletaForm({
                            ...atletaForm,
                            responsavel_legal_cpf_final: e.target.value.replace(/\D/g, '').slice(0, 4),
                          })
                        }
                        placeholder="4821"
                        className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[#9CA3AF] mb-1">Parentesco</label>
                      <input
                        type="text"
                        value={atletaForm.parentesco}
                        onChange={(e) =>
                          setAtletaForm({ ...atletaForm, parentesco: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[#E5E7EB] pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={atletaForm.autorizar_imediatamente}
                      onChange={(e) =>
                        setAtletaForm({
                          ...atletaForm,
                          autorizar_imediatamente: e.target.checked,
                        })
                      }
                      className="accent-[#10B981]"
                    />
                    <span>
                      Autorizar captura biométrica 3D e compartilhamento B2B imediatamente
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#1F2937]">
              <button
                type="submit"
                disabled={submitting || loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? 'Salvando no PostgreSQL...' : 'Cadastrar Atleta'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: CLUBES */}
      {tab === 'clube' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSubmitClube}
            className="xl:col-span-5 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4 text-xs"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F9FAFB] border-b border-[#1F2937] pb-2">
              <Building2 className="w-4 h-4 text-[#10B981]" />
              <span>Novo Clube ou Academia Parceira</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[#9CA3AF] mb-1">Nome da Instituição *</label>
                <input
                  type="text"
                  required
                  value={clubeForm.nome}
                  onChange={(e) => setClubeForm({ ...clubeForm, nome: e.target.value })}
                  placeholder="Ex: Sport Club KinePitch"
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">Sigla *</label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={clubeForm.sigla}
                  onChange={(e) => setClubeForm({ ...clubeForm, sigla: e.target.value })}
                  placeholder="Ex: SCK"
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] uppercase font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">Tipo *</label>
                <select
                  value={clubeForm.tipo_instituicao}
                  onChange={(e) =>
                    setClubeForm({
                      ...clubeForm,
                      tipo_instituicao: e.target.value as typeof clubeForm.tipo_instituicao,
                    })
                  }
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                >
                  <option value="clube_profissional">Clube Profissional</option>
                  <option value="academia_base">Academia de Base</option>
                  <option value="escolinha_parceira">Escolinha Parceira</option>
                  <option value="federacao">Federação</option>
                </select>
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">Cidade *</label>
                <input
                  type="text"
                  required
                  value={clubeForm.cidade}
                  onChange={(e) => setClubeForm({ ...clubeForm, cidade: e.target.value })}
                  placeholder="São Paulo"
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={clubeForm.estado_uf}
                  onChange={(e) => setClubeForm({ ...clubeForm, estado_uf: e.target.value })}
                  placeholder="SP"
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] uppercase"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">Código CBF TMS</label>
                <input
                  type="text"
                  value={clubeForm.cbf_tms_codigo}
                  onChange={(e) => setClubeForm({ ...clubeForm, cbf_tms_codigo: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-[#9CA3AF] mb-1">Responsável Técnico</label>
                <input
                  type="text"
                  value={clubeForm.responsavel_tecnico}
                  onChange={(e) =>
                    setClubeForm({ ...clubeForm, responsavel_tecnico: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[#10B981] hover:bg-[#059669] text-[#042116] font-semibold rounded-md cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Salvando...' : 'Salvar Clube (POST /api/v1/clubes)'}
            </button>
          </form>

          <div className="xl:col-span-7 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#F9FAFB]">Clubes Cadastrados</h3>
            {clubes.length === 0 ? (
              <p className="text-xs text-[#9CA3AF]">Nenhum clube cadastrado no PostgreSQL.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Sigla</th>
                      <th className="py-2 px-3 font-medium">Instituição</th>
                      <th className="py-2 px-3 font-medium">Cidade/UF</th>
                      <th className="py-2 pl-3 font-medium">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70">
                    {clubes.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 pr-3 font-mono-tabular text-[#06B6D4] font-semibold">
                          {c.sigla}
                        </td>
                        <td className="py-2.5 px-3 text-[#F9FAFB]">{c.nome}</td>
                        <td className="py-2.5 px-3 text-[#9CA3AF]">
                          {c.cidade}
                          {c.estado_uf ? `/${c.estado_uf}` : ''}
                        </td>
                        <td className="py-2.5 pl-3 text-[#9CA3AF]">
                          {c.tipo_instituicao.replace(/_/g, ' ')}
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

      {/* TAB 3: LGPD + BENCHMARKS + WEBHOOKS */}
      {tab === 'governanca' && (
        <div className="space-y-6">
          {/* Validação LGPD */}
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#F9FAFB]">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              <span>Termos de Consentimento LGPD (Menores de Base)</span>
            </div>
            {lgpds.length === 0 ? (
              <p className="text-xs text-[#9CA3AF]">
                Nenhum termo LGPD pendente ou registrado. Eles são gerados automaticamente ao cadastrar atletas menores de 18 anos.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                      <th className="py-2 pr-3 font-medium">Atleta</th>
                      <th className="py-2 px-3 font-medium">Responsável Legal</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 pl-3 text-right font-medium">Validar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]/70">
                    {lgpds.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 pr-3 text-[#F9FAFB]">
                          {l.atleta_nome}{' '}
                          <span className="font-mono-tabular text-[#9CA3AF]">
                            ({l.atleta_codigo})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#9CA3AF]">
                          {l.responsavel_legal_nome} · CPF ***{l.responsavel_legal_cpf_final}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-semibold uppercase ${
                            l.status === 'autorizado'
                              ? 'text-[#10B981]'
                              : l.status === 'revogado'
                                ? 'text-[#EF4444]'
                                : 'text-[#F59E0B]'
                          }`}
                        >
                          {l.status}
                        </td>
                        <td className="py-2.5 pl-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => void handleValidarLgpd(l.atleta_id, 'autorizado')}
                            className="text-[#10B981] hover:underline cursor-pointer"
                          >
                            Autorizar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleValidarLgpd(l.atleta_id, 'revogado')}
                            className="text-[#EF4444] hover:underline cursor-pointer"
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Benchmarks Posicionais */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4 text-xs">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F9FAFB]">
                <Target className="w-4 h-4 text-[#06B6D4]" />
                <span>Parametrização de Benchmarks (Radar &amp; Relatório B2B)</span>
              </div>
              <form onSubmit={handleSaveBenchmark} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Posição</label>
                  <select
                    value={benchForm.posicao}
                    onChange={(e) =>
                      setBenchForm({ ...benchForm, posicao: e.target.value as PosicaoCampo })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  >
                    {POSICOES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Nível Referência</label>
                  <select
                    value={benchForm.nivel_referencia}
                    onChange={(e) =>
                      setBenchForm({ ...benchForm, nivel_referencia: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  >
                    <option value="cbf_sub15">CBF Sub-15</option>
                    <option value="cbf_sub17">CBF Sub-17</option>
                    <option value="cbf_sub20">CBF Sub-20</option>
                    <option value="serie_a_pro">Série A Profissional</option>
                    <option value="top5_europa">Top 5 Europa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">IPB Médio</label>
                  <input
                    type="number"
                    step="0.1"
                    value={benchForm.ipb_medio}
                    onChange={(e) => setBenchForm({ ...benchForm, ipb_medio: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">SPE Médio</label>
                  <input
                    type="number"
                    step="0.1"
                    value={benchForm.spe_medio}
                    onChange={(e) => setBenchForm({ ...benchForm, spe_medio: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">IETP Médio</label>
                  <input
                    type="number"
                    step="0.1"
                    value={benchForm.ietp_medio}
                    onChange={(e) => setBenchForm({ ...benchForm, ietp_medio: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">IPS Médio</label>
                  <input
                    type="number"
                    step="0.1"
                    value={benchForm.ips_medio}
                    onChange={(e) => setBenchForm({ ...benchForm, ips_medio: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <div className="col-span-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-[#06B6D4] hover:bg-[#0891B2] text-[#042116] font-semibold rounded-md cursor-pointer"
                  >
                    Salvar Benchmark Posicional
                  </button>
                </div>
              </form>
              <div className="pt-2 border-t border-[#1F2937] text-[11px] text-[#9CA3AF]">
                {benchmarks.length} benchmark(s) ativos no PostgreSQL.
              </div>
            </div>

            {/* Webhooks B2B */}
            <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4 text-xs">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F9FAFB]">
                <Webhook className="w-4 h-4 text-[#10B981]" />
                <span>Webhooks B2B (Integração Clubes)</span>
              </div>
              <form onSubmit={handleSaveWebhook} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Clube</label>
                    <select
                      required
                      value={webhookForm.clube_id}
                      onChange={(e) =>
                        setWebhookForm({ ...webhookForm, clube_id: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                    >
                      <option value="">Selecione...</option>
                      {clubes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.sigla} · {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#9CA3AF] mb-1">Sistema</label>
                    <select
                      value={webhookForm.tipo_sistema}
                      onChange={(e) =>
                        setWebhookForm({ ...webhookForm, tipo_sistema: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                    >
                      <option value="catapult_gps">Catapult GPS</option>
                      <option value="cbf_tms">CBF TMS</option>
                      <option value="statsports">STATSports</option>
                      <option value="erp_clube_custom">ERP Clube Custom</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Nome da Integração</label>
                  <input
                    type="text"
                    required
                    value={webhookForm.nome_integracao}
                    onChange={(e) =>
                      setWebhookForm({ ...webhookForm, nome_integracao: e.target.value })
                    }
                    placeholder="Portal Scouting Clube"
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB]"
                  />
                </div>
                <div>
                  <label className="block text-[#9CA3AF] mb-1">Endpoint URL (HTTPS)</label>
                  <input
                    type="url"
                    required
                    value={webhookForm.endpoint_url}
                    onChange={(e) =>
                      setWebhookForm({ ...webhookForm, endpoint_url: e.target.value })
                    }
                    placeholder="https://api.clube.com.br/webhooks/kinepitch"
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-[#1F2937] rounded-md text-[#F9FAFB] font-mono-tabular"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 bg-[#10B981] hover:bg-[#059669] text-[#042116] font-semibold rounded-md cursor-pointer"
                >
                  Registrar Webhook B2B
                </button>
              </form>
              <div className="pt-2 border-t border-[#1F2937] space-y-1.5">
                {webhooks.map((w) => (
                  <div key={w.id} className="flex justify-between text-[11px] font-mono-tabular">
                    <span className="text-[#E5E7EB]">
                      {w.clube_sigla} · {w.nome_integracao}
                    </span>
                    <span className={w.ativo ? 'text-[#10B981]' : 'text-[#9CA3AF]'}>
                      {w.ativo ? 'Ativo' : 'Pausado'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
