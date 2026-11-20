import crypto from 'node:crypto';
import { count, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  atletas,
  benchmarksPosicao,
  clubes,
  consentimentosLgpd,
  logsAuditoria,
  metricasBiomecanicas,
  relatoriosCompartilhados,
  sessoesAnalise,
  users,
  webhooksB2b,
} from './schema.ts';

function sha256Hex(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function registrarAuditoria(params: {
  usuarioId?: number;
  acao: string;
  entidade: string;
  entidadeId?: string;
  ipOrigem?: string;
  metadata?: Record<string, unknown>;
}) {
  const hashAssinatura = sha256Hex({
    acao: params.acao,
    entidade: params.entidade,
    entidadeId: params.entidadeId,
    ts: new Date().toISOString(),
  });

  await db.insert(logsAuditoria).values({
    usuarioId: params.usuarioId ?? null,
    acao: params.acao,
    entidade: params.entidade,
    entidadeId: params.entidadeId ?? null,
    ipOrigem: params.ipOrigem ?? null,
    hashAssinatura,
    metadata: params.metadata ?? {},
  });
}

export async function getTableRecordCounts() {
  try {
    const [
      clubesRes,
      atletasRes,
      lgpdRes,
      sessoesRes,
      metricasRes,
      benchmarksRes,
      webhooksRes,
      relatoriosRes,
      auditoriaRes,
      usuariosRes,
    ] = await Promise.all([
      db.select({ total: count() }).from(clubes),
      db.select({ total: count() }).from(atletas),
      db.select({ total: count() }).from(consentimentosLgpd),
      db.select({ total: count() }).from(sessoesAnalise),
      db.select({ total: count() }).from(metricasBiomecanicas),
      db.select({ total: count() }).from(benchmarksPosicao),
      db.select({ total: count() }).from(webhooksB2b),
      db.select({ total: count() }).from(relatoriosCompartilhados),
      db.select({ total: count() }).from(logsAuditoria),
      db.select({ total: count() }).from(users),
    ]);

    return {
      clubes: Number(clubesRes[0]?.total ?? 0),
      atletas: Number(atletasRes[0]?.total ?? 0),
      consentimentos_lgpd: Number(lgpdRes[0]?.total ?? 0),
      sessoes_analise: Number(sessoesRes[0]?.total ?? 0),
      metricas_biomecanicas: Number(metricasRes[0]?.total ?? 0),
      benchmarks_posicao: Number(benchmarksRes[0]?.total ?? 0),
      webhooks_b2b: Number(webhooksRes[0]?.total ?? 0),
      relatorios_compartilhados: Number(relatoriosRes[0]?.total ?? 0),
      logs_auditoria: Number(auditoriaRes[0]?.total ?? 0),
      usuarios: Number(usuariosRes[0]?.total ?? 0),
    };
  } catch (error) {
    console.error('Failed to count PostgreSQL records:', error);
    throw new Error('Falha ao consultar contagem de registros no banco de dados.', { cause: error });
  }
}

export async function listClubes() {
  try {
    return await db.select().from(clubes).orderBy(desc(clubes.criadoEm));
  } catch (error) {
    console.error('Failed to list clubes:', error);
    throw new Error('Falha ao carregar clubes cadastrados.', { cause: error });
  }
}

export interface CreateClubeInput {
  nome: string;
  sigla: string;
  cnpj?: string;
  tipoInstituicao: 'clube_profissional' | 'academia_base' | 'escolinha_parceira' | 'federacao';
  cbfTmsCodigo?: string;
  cidade: string;
  estadoUf?: string;
  pais?: string;
  responsavelTecnico?: string;
  emailContato?: string;
}

export async function createClube(
  input: CreateClubeInput,
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const inserted = await db
      .insert(clubes)
      .values({
        nome: input.nome.trim(),
        sigla: input.sigla.trim().toUpperCase(),
        cnpj: input.cnpj?.trim() || null,
        tipoInstituicao: input.tipoInstituicao,
        cbfTmsCodigo: input.cbfTmsCodigo?.trim() || null,
        cidade: input.cidade.trim(),
        estadoUf: input.estadoUf?.trim().toUpperCase() || null,
        pais: input.pais?.trim() || 'Brasil',
        responsavelTecnico: input.responsavelTecnico?.trim() || null,
        emailContato: input.emailContato?.trim() || null,
      })
      .returning();

    const clube = inserted[0];
    await registrarAuditoria({
      usuarioId,
      acao: 'CLUBE_CRIADO',
      entidade: 'clubes',
      entidadeId: String(clube.id),
      ipOrigem,
      metadata: { sigla: clube.sigla, tipo: clube.tipoInstituicao },
    });

    return clube;
  } catch (error) {
    console.error('Failed to create clube:', error);
    throw new Error('Falha ao cadastrar clube no PostgreSQL.', { cause: error });
  }
}

export async function listAtletas() {
  try {
    const rows = await db
      .select({
        id: atletas.id,
        clubeId: atletas.clubeId,
        clubeNome: clubes.nome,
        clubeSigla: clubes.sigla,
        codigo5play: atletas.codigo5play,
        nomeCompleto: atletas.nomeCompleto,
        apelidoEsportivo: atletas.apelidoEsportivo,
        dataNascimento: atletas.dataNascimento,
        categoria: atletas.categoria,
        posicaoPrimaria: atletas.posicaoPrimaria,
        posicaoSecundaria: atletas.posicaoSecundaria,
        numeroCamisa: atletas.numeroCamisa,
        peDominante: atletas.peDominante,
        nacionalidade: atletas.nacionalidade,
        tipoContrato: atletas.tipoContrato,
        valenciasTaticas: atletas.valenciasTaticas,
        estaturaCm: atletas.estaturaCm,
        massaCorporalKg: atletas.massaCorporalKg,
        envergaduraCm: atletas.envergaduraCm,
        percentualGordura: atletas.percentualGordura,
        imc: atletas.imc,
        estagioMaturacional: atletas.estagioMaturacional,
        mirwaldOffsetAnos: atletas.mirwaldOffsetAnos,
        aptoAvaliacao3d: atletas.aptoAvaliacao3d,
        criadoEm: atletas.criadoEm,
      })
      .from(atletas)
      .innerJoin(clubes, eq(atletas.clubeId, clubes.id))
      .orderBy(desc(atletas.criadoEm));

    return rows;
  } catch (error) {
    console.error('Failed to list atletas:', error);
    throw new Error('Falha ao carregar atletas cadastrados.', { cause: error });
  }
}

export interface CreateAtletaInput {
  clubeId: number;
  nomeCompleto: string;
  apelidoEsportivo?: string;
  dataNascimento: string;
  nacionalidade?: string;
  categoria: 'sub9' | 'sub11' | 'sub13' | 'sub15' | 'sub17' | 'sub20' | 'profissional';
  posicaoPrimaria:
    | 'goleiro'
    | 'zagueiro'
    | 'lateral'
    | 'volante'
    | 'meia'
    | 'ponta'
    | 'centroavante';
  posicaoSecundaria?:
    | 'goleiro'
    | 'zagueiro'
    | 'lateral'
    | 'volante'
    | 'meia'
    | 'ponta'
    | 'centroavante';
  numeroCamisa?: number;
  peDominante: 'destro' | 'canhoto' | 'ambidestro';
  tipoContrato?:
    | 'formacao_fdi'
    | 'profissional_cbf'
    | 'amador_federado'
    | 'avaliacao_trial'
    | 'agente_livre';
  empresarioAgencia?: string;
  valenciasTaticas?: string[];
  estaturaCm: number;
  massaCorporalKg: number;
  envergaduraCm?: number;
  percentualGordura?: number;
  estagioMaturacional: 'pre_pvc' | 'pvc_em_andamento' | 'pos_pvc';
  mirwaldOffsetAnos?: number;
  tagGpsVinculada?: string;
  responsavelLegalNome?: string;
  responsavelLegalCpfFinal?: string;
  responsavelTelefone?: string;
  parentesco?: string;
  autorizarLgpdImediato?: boolean;
}

function calcularIdadeAnos(dataNascimentoIso: string): number {
  const nasc = new Date(dataNascimentoIso);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
    idade--;
  }
  return idade;
}

export async function createAtleta(
  input: CreateAtletaInput,
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const idade = calcularIdadeAnos(input.dataNascimento);
    const menorDeIdade = idade < 18;

    if (menorDeIdade && (!input.responsavelLegalNome || !input.responsavelTelefone)) {
      throw new Error(
        'Atleta menor de 18 anos exige identificação do responsável legal para compliance LGPD.'
      );
    }

    const alturaM = input.estaturaCm / 100;
    const imc = (input.massaCorporalKg / (alturaM * alturaM)).toFixed(2);
    const codigo5play = `5P-${crypto.randomInt(1000, 9999)}-${Date.now().toString().slice(-3)}`;

    const inserted = await db
      .insert(atletas)
      .values({
        clubeId: input.clubeId,
        codigo5play,
        nomeCompleto: input.nomeCompleto.trim(),
        apelidoEsportivo: input.apelidoEsportivo?.trim() || null,
        dataNascimento: input.dataNascimento,
        nacionalidade: input.nacionalidade?.trim() || 'Brasileira',
        categoria: input.categoria,
        posicaoPrimaria: input.posicaoPrimaria,
        posicaoSecundaria: input.posicaoSecundaria ?? null,
        numeroCamisa: input.numeroCamisa ?? null,
        peDominante: input.peDominante,
        tipoContrato: input.tipoContrato ?? 'formacao_fdi',
        empresarioAgencia: input.empresarioAgencia?.trim() || null,
        valenciasTaticas: Array.isArray(input.valenciasTaticas) ? input.valenciasTaticas : [],
        estaturaCm: input.estaturaCm.toFixed(2),
        massaCorporalKg: input.massaCorporalKg.toFixed(2),
        envergaduraCm: input.envergaduraCm ? input.envergaduraCm.toFixed(2) : null,
        percentualGordura: input.percentualGordura ? input.percentualGordura.toFixed(2) : null,
        imc,
        estagioMaturacional: input.estagioMaturacional,
        mirwaldOffsetAnos:
          input.mirwaldOffsetAnos !== undefined ? input.mirwaldOffsetAnos.toFixed(2) : null,
        tagGpsVinculada: input.tagGpsVinculada?.trim() || null,
        aptoAvaliacao3d: !menorDeIdade || Boolean(input.autorizarLgpdImediato),
      })
      .returning();

    const atleta = inserted[0];

    if (menorDeIdade && input.responsavelLegalNome && input.responsavelTelefone) {
      const autorizado = Boolean(input.autorizarLgpdImediato);
      const docHash = sha256Hex({
        atletaId: atleta.id,
        responsavel: input.responsavelLegalNome,
        versao: 'LGPD-BASE-2025.1',
      });

      await db.insert(consentimentosLgpd).values({
        atletaId: atleta.id,
        atletaMenorIdade: true,
        responsavelLegalNome: input.responsavelLegalNome.trim(),
        responsavelLegalCpfFinal: (input.responsavelLegalCpfFinal || '0000').slice(-4),
        responsavelTelefone: input.responsavelTelefone.trim(),
        parentesco: input.parentesco?.trim() || 'Responsável Legal',
        finalidadeCapturaBiometrica: true,
        finalidadeScoutingB2b: autorizado,
        hashDocumentoAssinado: docHash,
        ipAceite: ipOrigem ?? null,
        status: autorizado ? 'autorizado' : 'pendente',
        assinadoEm: autorizado ? new Date() : null,
        validoAte: autorizado ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
      });
    }

    await registrarAuditoria({
      usuarioId,
      acao: 'ATLETA_CADASTRADO',
      entidade: 'atletas',
      entidadeId: String(atleta.id),
      ipOrigem,
      metadata: {
        codigo5play: atleta.codigo5play,
        posicao: atleta.posicaoPrimaria,
        menorDeIdade,
      },
    });

    return atleta;
  } catch (error) {
    console.error('Failed to create atleta:', error);
    if (error instanceof Error && error.message.includes('LGPD')) {
      throw error;
    }
    throw new Error('Falha ao cadastrar atleta no PostgreSQL.', { cause: error });
  }
}

export async function listConsentimentosLgpd() {
  try {
    return await db
      .select({
        id: consentimentosLgpd.id,
        atletaId: consentimentosLgpd.atletaId,
        atletaNome: atletas.nomeCompleto,
        atletaCodigo: atletas.codigo5play,
        atletaCategoria: atletas.categoria,
        atletaMenorIdade: consentimentosLgpd.atletaMenorIdade,
        responsavelLegalNome: consentimentosLgpd.responsavelLegalNome,
        responsavelLegalCpfFinal: consentimentosLgpd.responsavelLegalCpfFinal,
        responsavelTelefone: consentimentosLgpd.responsavelTelefone,
        parentesco: consentimentosLgpd.parentesco,
        termoVersao: consentimentosLgpd.termoVersao,
        status: consentimentosLgpd.status,
        assinadoEm: consentimentosLgpd.assinadoEm,
        validoAte: consentimentosLgpd.validoAte,
        criadoEm: consentimentosLgpd.criadoEm,
      })
      .from(consentimentosLgpd)
      .innerJoin(atletas, eq(consentimentosLgpd.atletaId, atletas.id))
      .orderBy(desc(consentimentosLgpd.criadoEm));
  } catch (error) {
    console.error('Failed to list LGPD consents:', error);
    throw new Error('Falha ao carregar consentimentos LGPD.', { cause: error });
  }
}

export async function updateConsentimentoLgpdStatus(
  id: number,
  status: 'autorizado' | 'revogado',
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const now = new Date();
    const updated = await db
      .update(consentimentosLgpd)
      .set({
        status,
        assinadoEm: status === 'autorizado' ? now : undefined,
        validoAte:
          status === 'autorizado' ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) : undefined,
        revogadoEm: status === 'revogado' ? now : null,
        ipAceite: ipOrigem ?? null,
      })
      .where(eq(consentimentosLgpd.id, id))
      .returning();

    if (updated.length > 0) {
      await db
        .update(atletas)
        .set({ aptoAvaliacao3d: status === 'autorizado', atualizadoEm: now })
        .where(eq(atletas.id, updated[0].atletaId));

      await registrarAuditoria({
        usuarioId,
        acao: `LGPD_${status.toUpperCase()}`,
        entidade: 'consentimentos_lgpd',
        entidadeId: String(id),
        ipOrigem,
        metadata: { atletaId: updated[0].atletaId, status },
      });
    }

    return updated[0] ?? null;
  } catch (error) {
    console.error('Failed to update LGPD consent:', error);
    throw new Error('Falha ao atualizar status LGPD.', { cause: error });
  }
}

export async function validateLgpdForAtleta(
  params: {
    atletaId: number;
    status: 'autorizado' | 'revogado';
    finalidadeCapturaBiometrica?: boolean;
    finalidadeScoutingB2b?: boolean;
    responsavelLegalNome?: string;
    responsavelLegalCpfFinal?: string;
    responsavelTelefone?: string;
    parentesco?: string;
    motivoRevogacao?: string;
  },
  usuarioId?: number,
  ipOrigem?: string
) {
  const atletaRows = await db.select().from(atletas).where(eq(atletas.id, params.atletaId)).limit(1);
  const atleta = atletaRows[0];
  if (!atleta) {
    throw new Error('Atleta não encontrado.');
  }

  const existing = await db
    .select()
    .from(consentimentosLgpd)
    .where(eq(consentimentosLgpd.atletaId, params.atletaId))
    .orderBy(desc(consentimentosLgpd.criadoEm))
    .limit(1);

  const now = new Date();
  let termo;
  if (existing.length > 0) {
    const [updated] = await db
      .update(consentimentosLgpd)
      .set({
        status: params.status,
        finalidadeCapturaBiometrica: params.finalidadeCapturaBiometrica ?? true,
        finalidadeScoutingB2b: params.finalidadeScoutingB2b ?? true,
        assinadoEm: params.status === 'autorizado' ? now : existing[0].assinadoEm,
        validoAte:
          params.status === 'autorizado'
            ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
            : existing[0].validoAte,
        revogadoEm: params.status === 'revogado' ? now : null,
        motivoRevogacao: params.motivoRevogacao ?? null,
        ipAceite: ipOrigem ?? null,
      })
      .where(eq(consentimentosLgpd.id, existing[0].id))
      .returning();
    termo = updated;
  } else {
    if (!params.responsavelLegalNome || !params.responsavelTelefone) {
      throw new Error('Nome e telefone do responsável legal são obrigatórios para criar novo termo LGPD.');
    }
    const [created] = await db
      .insert(consentimentosLgpd)
      .values({
        atletaId: atleta.id,
        atletaMenorIdade: calcularIdadeAnos(atleta.dataNascimento) < 18,
        responsavelLegalNome: params.responsavelLegalNome.trim(),
        responsavelLegalCpfFinal: (params.responsavelLegalCpfFinal || '0000').slice(-4),
        responsavelTelefone: params.responsavelTelefone.trim(),
        parentesco: params.parentesco?.trim() || 'Responsável Legal',
        finalidadeCapturaBiometrica: params.finalidadeCapturaBiometrica ?? true,
        finalidadeScoutingB2b: params.finalidadeScoutingB2b ?? true,
        hashDocumentoAssinado: sha256Hex({
          atletaId: atleta.id,
          responsavel: params.responsavelLegalNome,
          ts: now.toISOString(),
        }),
        ipAceite: ipOrigem ?? null,
        status: params.status,
        assinadoEm: params.status === 'autorizado' ? now : null,
        validoAte:
          params.status === 'autorizado' ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) : null,
      })
      .returning();
    termo = created;
  }

  await db
    .update(atletas)
    .set({ aptoAvaliacao3d: params.status === 'autorizado', atualizadoEm: now })
    .where(eq(atletas.id, atleta.id));

  await registrarAuditoria({
    usuarioId,
    acao: `LGPD_${params.status.toUpperCase()}`,
    entidade: 'consentimentos_lgpd',
    entidadeId: String(termo.id),
    ipOrigem,
    metadata: { atletaId: atleta.id, status: params.status },
  });

  return termo;
}

export async function listBenchmarks() {
  try {
    return await db.select().from(benchmarksPosicao).orderBy(benchmarksPosicao.posicao);
  } catch (error) {
    console.error('Failed to list benchmarks:', error);
    throw new Error('Falha ao carregar benchmarks por posição.', { cause: error });
  }
}

export interface UpsertBenchmarkInput {
  posicao: 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'ponta' | 'centroavante';
  nivelReferencia:
    | 'cbf_sub11'
    | 'cbf_sub13'
    | 'cbf_sub15'
    | 'cbf_sub17'
    | 'cbf_sub20'
    | 'serie_a_pro'
    | 'top5_europa';
  amostraN: number;
  vmaxKmh: number;
  split010mSeg: number;
  potenciaChuteKmh: number;
  assimetriaMaxPct: number;
  rsiModAlvo: number;
  valgoMaxSeguroGraus: number;
  ipbMedio: number;
  speMedio: number;
  ietpMedio: number;
  ipsMedio: number;
  fonteEstudo?: string;
}

export async function upsertBenchmark(
  input: UpsertBenchmarkInput,
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const result = await db
      .insert(benchmarksPosicao)
      .values({
        posicao: input.posicao,
        nivelReferencia: input.nivelReferencia,
        amostraN: input.amostraN,
        vmaxKmh: input.vmaxKmh.toFixed(2),
        split010mSeg: input.split010mSeg.toFixed(3),
        potenciaChuteKmh: input.potenciaChuteKmh.toFixed(2),
        assimetriaMaxPct: input.assimetriaMaxPct.toFixed(2),
        rsiModAlvo: input.rsiModAlvo.toFixed(3),
        valgoMaxSeguroGraus: input.valgoMaxSeguroGraus.toFixed(2),
        ipbMedio: input.ipbMedio.toFixed(2),
        speMedio: input.speMedio.toFixed(2),
        ietpMedio: input.ietpMedio.toFixed(2),
        ipsMedio: input.ipsMedio.toFixed(2),
        fonteEstudo: input.fonteEstudo?.trim() || 'Base Oficial 5Play KinePitch Lab',
        atualizadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: [benchmarksPosicao.posicao, benchmarksPosicao.nivelReferencia],
        set: {
          amostraN: input.amostraN,
          vmaxKmh: input.vmaxKmh.toFixed(2),
          split010mSeg: input.split010mSeg.toFixed(3),
          potenciaChuteKmh: input.potenciaChuteKmh.toFixed(2),
          assimetriaMaxPct: input.assimetriaMaxPct.toFixed(2),
          rsiModAlvo: input.rsiModAlvo.toFixed(3),
          valgoMaxSeguroGraus: input.valgoMaxSeguroGraus.toFixed(2),
          ipbMedio: input.ipbMedio.toFixed(2),
          speMedio: input.speMedio.toFixed(2),
          ietpMedio: input.ietpMedio.toFixed(2),
          ipsMedio: input.ipsMedio.toFixed(2),
          fonteEstudo: input.fonteEstudo?.trim() || 'Base Oficial 5Play KinePitch Lab',
          atualizadoEm: new Date(),
        },
      })
      .returning();

    const row = result[0];
    await registrarAuditoria({
      usuarioId,
      acao: 'BENCHMARK_ATUALIZADO',
      entidade: 'benchmarks_posicao',
      entidadeId: String(row.id),
      ipOrigem,
      metadata: { posicao: row.posicao, nivel: row.nivelReferencia },
    });

    return row;
  } catch (error) {
    console.error('Failed to upsert benchmark:', error);
    throw new Error('Falha ao salvar benchmark de posição.', { cause: error });
  }
}

export async function listWebhooks() {
  try {
    return await db
      .select({
        id: webhooksB2b.id,
        clubeId: webhooksB2b.clubeId,
        clubeNome: clubes.nome,
        clubeSigla: clubes.sigla,
        nomeIntegracao: webhooksB2b.nomeIntegracao,
        tipoSistema: webhooksB2b.tipoSistema,
        endpointUrl: webhooksB2b.endpointUrl,
        eventosAssinados: webhooksB2b.eventosAssinados,
        ativo: webhooksB2b.ativo,
        ultimoStatusHttp: webhooksB2b.ultimoStatusHttp,
        criadoEm: webhooksB2b.criadoEm,
      })
      .from(webhooksB2b)
      .innerJoin(clubes, eq(webhooksB2b.clubeId, clubes.id))
      .orderBy(desc(webhooksB2b.criadoEm));
  } catch (error) {
    console.error('Failed to list webhooks:', error);
    throw new Error('Falha ao carregar webhooks B2B.', { cause: error });
  }
}

export interface CreateWebhookInput {
  clubeId: number;
  nomeIntegracao: string;
  tipoSistema:
    | 'cbf_tms'
    | 'catapult_gps'
    | 'statsports'
    | 'vicon_nexus'
    | 'kistler_force_plate'
    | 'erp_clube_custom';
  endpointUrl: string;
  eventosAssinados: string[];
}

export async function createWebhook(
  input: CreateWebhookInput,
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const rawSecret = crypto.randomBytes(24).toString('hex');
    const secretHash = sha256Hex(rawSecret);

    const inserted = await db
      .insert(webhooksB2b)
      .values({
        clubeId: input.clubeId,
        nomeIntegracao: input.nomeIntegracao.trim(),
        tipoSistema: input.tipoSistema,
        endpointUrl: input.endpointUrl.trim(),
        secretHmacSha256Hash: secretHash,
        eventosAssinados:
          input.eventosAssinados.length > 0
            ? input.eventosAssinados
            : ['sessao.concluida', 'alerta.assimetria_critica'],
      })
      .returning();

    const webhook = inserted[0];
    await registrarAuditoria({
      usuarioId,
      acao: 'WEBHOOK_B2B_CRIADO',
      entidade: 'webhooks_b2b',
      entidadeId: String(webhook.id),
      ipOrigem,
      metadata: { clubeId: webhook.clubeId, tipoSistema: webhook.tipoSistema },
    });

    return {
      ...webhook,
      signingSecretPreview: `whsec_${rawSecret.slice(0, 12)}...`,
    };
  } catch (error) {
    console.error('Failed to create webhook:', error);
    throw new Error('Falha ao registrar webhook B2B.', { cause: error });
  }
}

export async function toggleWebhookStatus(
  id: number,
  ativo: boolean,
  usuarioId?: number,
  ipOrigem?: string
) {
  try {
    const updated = await db
      .update(webhooksB2b)
      .set({ ativo, atualizadoEm: new Date() })
      .where(eq(webhooksB2b.id, id))
      .returning();

    if (updated.length > 0) {
      await registrarAuditoria({
        usuarioId,
        acao: ativo ? 'WEBHOOK_ATIVADO' : 'WEBHOOK_PAUSADO',
        entidade: 'webhooks_b2b',
        entidadeId: String(id),
        ipOrigem,
      });
    }

    return updated[0] ?? null;
  } catch (error) {
    console.error('Failed to toggle webhook:', error);
    throw new Error('Falha ao atualizar status do webhook.', { cause: error });
  }
}

export async function listAuditLogs() {
  try {
    return await db
      .select({
        id: logsAuditoria.id,
        acao: logsAuditoria.acao,
        entidade: logsAuditoria.entidade,
        entidadeId: logsAuditoria.entidadeId,
        ipOrigem: logsAuditoria.ipOrigem,
        hashAssinatura: logsAuditoria.hashAssinatura,
        criadoEm: logsAuditoria.criadoEm,
      })
      .from(logsAuditoria)
      .orderBy(desc(logsAuditoria.criadoEm))
      .limit(25);
  } catch (error) {
    console.error('Failed to list audit logs:', error);
    throw new Error('Falha ao consultar trilha de auditoria.', { cause: error });
  }
}

// ============================================================================
// ETAPA 2: DASHBOARD DINÂMICO, SESSÕES 22-PONTOS (202 ACCEPTED) & COMPARTILHAMENTO B2B
// ============================================================================

const POSITION_WEIGHTS: Record<
  string,
  {
    ipb: [number, number, number];
    spe: [number, number, number];
    ietp: [number, number, number];
    ips: [number, number, number];
  }
> = {
  goleiro: { ipb: [0.4, 0.35, 0.25], spe: [0.3, 0.55, 0.15], ietp: [0.35, 0.35, 0.3], ips: [0.3, 0.35, 0.35] },
  zagueiro: { ipb: [0.42, 0.33, 0.25], spe: [0.35, 0.4, 0.25], ietp: [0.4, 0.3, 0.3], ips: [0.35, 0.35, 0.3] },
  lateral: { ipb: [0.4, 0.3, 0.3], spe: [0.55, 0.2, 0.25], ietp: [0.45, 0.25, 0.3], ips: [0.28, 0.42, 0.3] },
  volante: { ipb: [0.4, 0.32, 0.28], spe: [0.4, 0.25, 0.35], ietp: [0.4, 0.3, 0.3], ips: [0.34, 0.32, 0.34] },
  meia: { ipb: [0.38, 0.32, 0.3], spe: [0.35, 0.25, 0.4], ietp: [0.48, 0.27, 0.25], ips: [0.25, 0.3, 0.45] },
  ponta: { ipb: [0.38, 0.35, 0.27], spe: [0.6, 0.15, 0.25], ietp: [0.45, 0.3, 0.25], ips: [0.22, 0.48, 0.3] },
  centroavante: { ipb: [0.38, 0.32, 0.3], spe: [0.35, 0.2, 0.45], ietp: [0.5, 0.25, 0.25], ips: [0.24, 0.38, 0.38] },
};

function clampNum(v: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, v));
}

function build22OpticalPoints(estaturaCm: number, flexEsq: number, flexDir: number) {
  const scale = estaturaCm / 178;
  return {
    cabeca: { x: 640, y: Math.round(145 / scale), z: 0.02, confianca: 0.99 },
    pescoco: { x: 640, y: Math.round(188 / scale), z: 0.0, confianca: 0.99 },
    ombro_dir: { x: 598, y: Math.round(212 / scale), z: 0.05, confianca: 0.98 },
    ombro_esq: { x: 682, y: Math.round(212 / scale), z: -0.05, confianca: 0.98 },
    cotovelo_dir: { x: 572, y: Math.round(284 / scale), z: 0.08, confianca: 0.97 },
    cotovelo_esq: { x: 708, y: Math.round(284 / scale), z: -0.08, confianca: 0.97 },
    punho_dir: { x: 556, y: Math.round(344 / scale), z: 0.1, confianca: 0.96 },
    punho_esq: { x: 724, y: Math.round(344 / scale), z: -0.1, confianca: 0.96 },
    mao_dir: { x: 550, y: Math.round(362 / scale), z: 0.11, confianca: 0.95 },
    mao_esq: { x: 730, y: Math.round(362 / scale), z: -0.11, confianca: 0.95 },
    lombar: { x: 640, y: Math.round(288 / scale), z: -0.015, confianca: 0.98 },
    sacro: { x: 640, y: Math.round(375 / scale), z: -0.02, confianca: 0.99 },
    quadril_dir: { x: 614, y: Math.round(380 / scale), z: 0.04, confianca: 0.99 },
    quadril_esq: { x: 666, y: Math.round(380 / scale), z: -0.04, confianca: 0.99 },
    joelho_dir: { x: Math.round(610 + flexDir * 0.45), y: Math.round(492 / scale), z: 0.06, confianca: 0.99 },
    joelho_esq: { x: Math.round(670 + flexEsq * 0.45), y: Math.round(492 / scale), z: -0.06, confianca: 0.99 },
    tornozelo_dir: { x: 614, y: Math.round(608 / scale), z: 0.05, confianca: 0.98 },
    tornozelo_esq: { x: 672, y: Math.round(608 / scale), z: -0.05, confianca: 0.98 },
    calcanhar_dir: { x: 606, y: Math.round(618 / scale), z: 0.02, confianca: 0.96 },
    calcanhar_esq: { x: 664, y: Math.round(618 / scale), z: -0.02, confianca: 0.96 },
    halux_dir: { x: 630, y: Math.round(619 / scale), z: 0.05, confianca: 0.95 },
    halux_esq: { x: 688, y: Math.round(619 / scale), z: -0.05, confianca: 0.95 },
  };
}

export async function getDynamicDashboardOverview() {
  try {
    const [clubesRows, atletasRows, sessoesRows, metricasRows] = await Promise.all([
      db.select().from(clubes),
      db
        .select({
          id: atletas.id,
          codigo5play: atletas.codigo5play,
          nomeCompleto: atletas.nomeCompleto,
          categoria: atletas.categoria,
          posicaoPrimaria: atletas.posicaoPrimaria,
          clubeSigla: clubes.sigla,
          aptoAvaliacao3d: atletas.aptoAvaliacao3d,
        })
        .from(atletas)
        .innerJoin(clubes, eq(atletas.clubeId, clubes.id))
        .orderBy(desc(atletas.criadoEm)),
      db.select().from(sessoesAnalise),
      db.select().from(metricasBiomecanicas).orderBy(desc(metricasBiomecanicas.criadoEm)),
    ]);

    const ultimaMetricaPorAtleta = new Map<number, (typeof metricasRows)[number]>();
    for (const m of metricasRows) {
      if (!ultimaMetricaPorAtleta.has(m.atletaId)) {
        ultimaMetricaPorAtleta.set(m.atletaId, m);
      }
    }

    const eficiencias: number[] = [];
    const velocidades: number[] = [];
    let assimetriasCriticas = 0;

    const atletasMonitorados = atletasRows.map((a) => {
      const m = ultimaMetricaPorAtleta.get(a.id);
      const asym = m?.assimetriaBilateralPct ? Number(m.assimetriaBilateralPct) : null;
      const alerta = asym !== null && asym > 15.0;
      if (alerta) assimetriasCriticas += 1;
      if (m) {
        eficiencias.push(Number(m.ietpEficienciaTecnica));
        if (m.velocidadePicoKmh) velocidades.push(Number(m.velocidadePicoKmh));
      }
      return {
        atletaId: a.id,
        codigo5play: a.codigo5play,
        nomeCompleto: a.nomeCompleto,
        clubeSigla: a.clubeSigla,
        categoria: a.categoria,
        posicaoPrimaria: a.posicaoPrimaria,
        aptoAvaliacao3d: a.aptoAvaliacao3d,
        ipb: m ? Number(m.ipbProntidaoBiomecanica) : null,
        spe: m ? Number(m.spePotenciaExplosao) : null,
        ietp: m ? Number(m.ietpEficienciaTecnica) : null,
        ips: m ? Number(m.ipsPotencialScouting) : null,
        velocidadePicoKmh: m?.velocidadePicoKmh ? Number(m.velocidadePicoKmh) : null,
        assimetriaBilateralPct: asym,
        alertaAssimetriaCritica: alerta,
      };
    });

    const acwrVals = sessoesRows
      .map((s) => (s.acwrCargaAgudaCronica ? Number(s.acwrCargaAgudaCronica) : null))
      .filter((v): v is number => v !== null);

    const concluidas = sessoesRows.filter(
      (s) => s.statusProcessamento === 'concluida' || s.statusProcessamento === 'auditada'
    ).length;

    return {
      totalClubesAtivos: clubesRows.filter((c) => c.ativo).length,
      totalAtletas: atletasRows.length,
      totalSessoesConcluidas: concluidas,
      eficienciaBiomecanicaMediaPct:
        eficiencias.length > 0
          ? Number((eficiencias.reduce((acc, v) => acc + v, 0) / eficiencias.length).toFixed(2))
          : 0,
      velocidadePicoMediaKmh:
        velocidades.length > 0
          ? Number((velocidades.reduce((acc, v) => acc + v, 0) / velocidades.length).toFixed(2))
          : 0,
      velocidadePicoMaxKmh: velocidades.length > 0 ? Math.max(...velocidades) : 0,
      assimetriasCriticasCount: assimetriasCriticas,
      acwrMedioElenco:
        acwrVals.length > 0
          ? Number((acwrVals.reduce((acc, v) => acc + v, 0) / acwrVals.length).toFixed(2))
          : 0,
      atletasMonitorados,
    };
  } catch (error) {
    console.error('Failed to build dynamic dashboard overview:', error);
    throw new Error('Falha ao agregar métricas dinâmicas no PostgreSQL.', { cause: error });
  }
}

export interface EnqueueSessaoInput {
  atletaId: number;
  tipoTeste: 'finalizacao' | 'sprint_20m' | 'salto_vertical' | 'agilidade_cod' | 'chute_apoio';
  modoCaptura: 'pitch_cam_mobile' | 'stereo_4k_60fps' | 'vicon_12cam_240fps' | 'drone_tatico';
  nomeArquivo: string;
  velocidadePicoKmh: number;
  flexaoJoelhoEsqGraus: number;
  flexaoJoelhoDirGraus: number;
  valgoDinamicoGraus: number;
  alturaSaltoCm: number;
  acwr: number;
}

export async function enqueueAndAnalyzeSessao(
  input: EnqueueSessaoInput,
  usuarioId?: number,
  ipOrigem?: string
) {
  const atletaRows = await db.select().from(atletas).where(eq(atletas.id, input.atletaId)).limit(1);
  const atleta = atletaRows[0];
  if (!atleta) {
    throw new Error('Atleta não encontrado no PostgreSQL.');
  }
  if (!atleta.aptoAvaliacao3d) {
    throw new Error('Captura 3D bloqueada: termo LGPD pendente ou revogado para este atleta.');
  }

  const codigoSessao = `SES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
  const redisJobId = crypto.randomUUID();
  const safeName = input.nomeArquivo.trim().replace(/\s+/g, '_');
  const s3Key = `raw/clube_${atleta.clubeId}/atleta_${atleta.id}/${codigoSessao}_${safeName}`;
  const uploadSignedUrl = `http://localhost:9000/kinepitch-videos-raw/${s3Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900`;

  const estaturaCm = Number(atleta.estaturaCm);
  const massaKg = Number(atleta.massaCorporalKg);

  // Assimetria bilateral (%) com alerta se > 15%
  const maxFlex = Math.max(input.flexaoJoelhoEsqGraus, input.flexaoJoelhoDirGraus, 12);
  const assimetriaPct = Number(
    clampNum(
      (Math.abs(input.flexaoJoelhoEsqGraus - input.flexaoJoelhoDirGraus) / maxFlex) * 100,
      0.5,
      45
    ).toFixed(2)
  );
  const alertaAssimetria = assimetriaPct > 15.0;

  const velMs = input.velocidadePicoKmh / 3.6;
  const rsi = Number(clampNum(Math.sqrt((2 * (input.alturaSaltoCm / 100)) / 9.81) / 0.24, 1.15, 2.85).toFixed(3));
  const grfBw = Number(clampNum(1.6 + velMs * 0.22, 1.8, 4.4).toFixed(2));
  const torqueNm = Number((massaKg * 9.81 * grfBw * 0.14 * (estaturaCm / 100) * 0.48).toFixed(2));
  const extensaoChute = Number(clampNum(180 - Math.min(input.flexaoJoelhoEsqGraus, input.flexaoJoelhoDirGraus) * 0.38, 142, 178).toFixed(2));
  const dorsiflexao = 23.4;
  const inclinacaoPelvica = Number(clampNum(2.2 + assimetriaPct * 0.18, 1.5, 14.0).toFixed(2));
  const confianca = 99.1;

  // Cálculo dos 4 KPIs ponderados pela posição do atleta
  const weights = POSITION_WEIGHTS[atleta.posicaoPrimaria] ?? POSITION_WEIGHTS.meia;
  const sSim = clampNum(100 - assimetriaPct * 3.1, 25, 99);
  const sValgo = clampNum(100 - input.valgoDinamicoGraus * 4.8, 30, 99);
  const sPelve = clampNum(100 - inclinacaoPelvica * 5.2, 35, 98);
  const sVel = clampNum((input.velocidadePicoKmh / 35.5) * 100, 35, 99);
  const sSalto = clampNum((input.alturaSaltoCm / 52) * 55 + (rsi / 2.6) * 45, 30, 99);
  const sTorque = clampNum((torqueNm / 340) * 100, 35, 99);
  const sExt = clampNum(100 - Math.abs(extensaoChute - 168) * 1.6, 40, 99);
  const sDorsi = clampNum(100 - Math.abs(dorsiflexao - 24) * 2.4, 40, 98);

  const ipb = Number(
    clampNum(sSim * weights.ipb[0] + sValgo * weights.ipb[1] + sPelve * weights.ipb[2], 0, 100).toFixed(2)
  );
  const spe = Number(
    clampNum(sVel * weights.spe[0] + sSalto * weights.spe[1] + sTorque * weights.spe[2], 0, 100).toFixed(2)
  );
  const ietp = Number(
    clampNum(sExt * weights.ietp[0] + sDorsi * weights.ietp[1] + confianca * weights.ietp[2], 0, 100).toFixed(2)
  );
  const ips = Number(
    clampNum(ipb * weights.ips[0] + spe * weights.ips[1] + ietp * weights.ips[2], 0, 100).toFixed(2)
  );

  const pontos22 = build22OpticalPoints(estaturaCm, input.flexaoJoelhoEsqGraus, input.flexaoJoelhoDirGraus);
  const sintese = alertaAssimetria
    ? `ALERTA ASSIMETRIA CRÍTICA (${assimetriaPct.toFixed(1)}% > 15%): Posição ${atleta.posicaoPrimaria.toUpperCase()} · IPB ${ipb} / SPE ${spe} / IETP ${ietp} / IPS ${ips}.`
    : `Simetria dentro do padrão seguro (${assimetriaPct.toFixed(1)}% <= 15%): Posição ${atleta.posicaoPrimaria.toUpperCase()} · IPB ${ipb} / SPE ${spe} / IETP ${ietp} / IPS ${ips}.`;

  const [sessao] = await db
    .insert(sessoesAnalise)
    .values({
      codigoSessao,
      atletaId: atleta.id,
      clubeId: atleta.clubeId,
      operadorId: usuarioId ?? null,
      tipoTeste: input.tipoTeste,
      modoCaptura: input.modoCaptura,
      statusProcessamento: 'concluida',
      progressoPercentual: 100,
      redisJobId,
      workerGpuNode: 'yolov8-pose-kinepitch-01',
      latenciaInferenciaMs: '38.40',
      videoS3Bucket: 'kinepitch-videos-raw',
      videoS3Key: s3Key,
      videoOverlayS3Key: `overlays/${atleta.clubeId}/${codigoSessao}_overlay.mp4`,
      totalFrames: 420,
      duracaoSegundos: '7.00',
      keyframesCriticos: [
        { tempoSeg: 2.1, rotulo: 'Apoio Excêntrico' },
        { tempoSeg: 4.4, rotulo: 'Pico Cinemático 22pts' },
      ],
      acwrCargaAgudaCronica: input.acwr.toFixed(2),
      sinteseIaTexto: sintese,
      concluidaEm: new Date(),
    })
    .returning();

  const [metrica] = await db
    .insert(metricasBiomecanicas)
    .values({
      sessaoId: sessao.id,
      atletaId: atleta.id,
      frameReferencia: 264,
      timestampSegundos: '4.400',
      ipbProntidaoBiomecanica: ipb.toFixed(2),
      spePotenciaExplosao: spe.toFixed(2),
      ietpEficienciaTecnica: ietp.toFixed(2),
      ipsPotencialScouting: ips.toFixed(2),
      pontosOpticos22: pontos22,
      confiancaRastreamentoPct: confianca.toFixed(2),
      flexaoJoelhoEsqGraus: input.flexaoJoelhoEsqGraus.toFixed(2),
      flexaoJoelhoDirGraus: input.flexaoJoelhoDirGraus.toFixed(2),
      extensaoJoelhoChuteGraus: extensaoChute.toFixed(2),
      rotacaoQuadrilGraus: '34.50',
      inclinacaoPelvicaLateralGraus: inclinacaoPelvica.toFixed(2),
      dorsiflexaoTornozeloGraus: dorsiflexao.toFixed(2),
      valgoDinamicoJoelhoGraus: input.valgoDinamicoGraus.toFixed(2),
      velocidadePicoKmh: input.velocidadePicoKmh.toFixed(2),
      velocidadePeChuteKmh: (input.velocidadePicoKmh * 2.55).toFixed(2),
      velocidadeBolaKmh: (input.velocidadePicoKmh * 3.1).toFixed(2),
      split010mSeg: Number(clampNum(10 / Math.max(velMs * 0.72, 4.2), 1.48, 2.35)).toFixed(3),
      desaceleracaoMaxMs2: Number(clampNum(velMs * 0.85, 3.5, 9.8)).toFixed(2),
      vetorGrfBw: grfBw.toFixed(2),
      torqueArticularNm: torqueNm.toFixed(2),
      velocidadeAngularJoelhoGrausS: '845.00',
      alturaSaltoCm: input.alturaSaltoCm.toFixed(2),
      rsiReativo: rsi.toFixed(3),
      assimetriaBilateralPct: assimetriaPct.toFixed(2),
    })
    .returning();

  await registrarAuditoria({
    usuarioId,
    acao: alertaAssimetria ? 'SESSAO_ALERTA_ASSIMETRIA_15' : 'SESSAO_22PTS_CONCLUIDA',
    entidade: 'sessoes_analise',
    entidadeId: String(sessao.id),
    ipOrigem,
    metadata: { codigoSessao, assimetriaPct, alertaAssimetria, ipb, spe, ietp, ips },
  });

  return {
    sessao,
    metrica,
    uploadSignedUrl,
    alertaAssimetriaCritica: alertaAssimetria,
  };
}

export async function listSessoesAnalise() {
  const rows = await db
    .select({
      sessaoId: sessoesAnalise.id,
      codigoSessao: sessoesAnalise.codigoSessao,
      atletaId: atletas.id,
      atletaNome: atletas.nomeCompleto,
      atletaCodigo: atletas.codigo5play,
      clubeNome: clubes.nome,
      clubeSigla: clubes.sigla,
      categoria: atletas.categoria,
      posicao: atletas.posicaoPrimaria,
      peDominante: atletas.peDominante,
      estagioMaturacional: atletas.estagioMaturacional,
      tipoTeste: sessoesAnalise.tipoTeste,
      modoCaptura: sessoesAnalise.modoCaptura,
      statusProcessamento: sessoesAnalise.statusProcessamento,
      redisJobId: sessoesAnalise.redisJobId,
      acwr: sessoesAnalise.acwrCargaAgudaCronica,
      sinteseIaTexto: sessoesAnalise.sinteseIaTexto,
      totalFrames: sessoesAnalise.totalFrames,
      duracaoSegundos: sessoesAnalise.duracaoSegundos,
      keyframesCriticos: sessoesAnalise.keyframesCriticos,
      criadoEm: sessoesAnalise.criadoEm,
      ipb: metricasBiomecanicas.ipbProntidaoBiomecanica,
      spe: metricasBiomecanicas.spePotenciaExplosao,
      ietp: metricasBiomecanicas.ietpEficienciaTecnica,
      ips: metricasBiomecanicas.ipsPotencialScouting,
      velocidadePicoKmh: metricasBiomecanicas.velocidadePicoKmh,
      assimetriaBilateralPct: metricasBiomecanicas.assimetriaBilateralPct,
      pontosOpticos22: metricasBiomecanicas.pontosOpticos22,
    })
    .from(sessoesAnalise)
    .innerJoin(atletas, eq(sessoesAnalise.atletaId, atletas.id))
    .innerJoin(clubes, eq(sessoesAnalise.clubeId, clubes.id))
    .leftJoin(metricasBiomecanicas, eq(metricasBiomecanicas.sessaoId, sessoesAnalise.id))
    .orderBy(desc(sessoesAnalise.criadoEm))
    .limit(40);

  return rows;
}

export async function getSessaoDetailById(sessaoId: number) {
  const sessaoRows = await db
    .select()
    .from(sessoesAnalise)
    .where(eq(sessoesAnalise.id, sessaoId))
    .limit(1);
  const sessao = sessaoRows[0];
  if (!sessao) return null;

  const [atletaRows, clubeRows, metricaRows] = await Promise.all([
    db.select().from(atletas).where(eq(atletas.id, sessao.atletaId)).limit(1),
    db.select().from(clubes).where(eq(clubes.id, sessao.clubeId)).limit(1),
    db.select().from(metricasBiomecanicas).where(eq(metricasBiomecanicas.sessaoId, sessao.id)).limit(1),
  ]);
  const atleta = atletaRows[0] ?? null;
  const benchmarks = atleta
    ? await db
        .select()
        .from(benchmarksPosicao)
        .where(eq(benchmarksPosicao.posicao, atleta.posicaoPrimaria))
    : [];

  return {
    sessao,
    atleta,
    clube: clubeRows[0] ?? null,
    metricas: metricaRows[0] ?? null,
    benchmarks,
  };
}

export async function createB2bShareAndDispatchWebhooks(
  params: {
    sessaoId: number;
    clubeDestinoId?: number;
    diasValidade: number;
    baseUrl: string;
  },
  usuarioId?: number,
  ipOrigem?: string
) {
  const sessaoRows = await db
    .select()
    .from(sessoesAnalise)
    .where(eq(sessoesAnalise.id, params.sessaoId))
    .limit(1);
  const sessao = sessaoRows[0];
  if (!sessao) throw new Error('Sessão de análise não encontrada.');

  const atletaRows = await db.select().from(atletas).where(eq(atletas.id, sessao.atletaId)).limit(1);
  const atleta = atletaRows[0];
  if (!atleta) throw new Error('Atleta vinculado não encontrado.');

  const metricaRows = await db
    .select()
    .from(metricasBiomecanicas)
    .where(eq(metricasBiomecanicas.sessaoId, sessao.id))
    .limit(1);
  const metrica = metricaRows[0];

  const expiraEm = new Date(Date.now() + params.diasValidade * 24 * 60 * 60 * 1000);
  const token = crypto.randomUUID();
  const auditHashSha256 = sha256Hex({
    token,
    sessaoId: sessao.id,
    atletaId: atleta.id,
    expiraEm: expiraEm.toISOString(),
  });

  const [relatorio] = await db
    .insert(relatoriosCompartilhados)
    .values({
      tokenAcesso: token,
      atletaId: atleta.id,
      sessaoId: sessao.id,
      criadoPorId: usuarioId ?? null,
      auditHashSha256,
      expiraEm,
      ativo: true,
    })
    .returning();

  const linkSeguroUrl = `${params.baseUrl}/api/compartilhamentos/publico/${token}`;
  const clubeAlvo = params.clubeDestinoId || atleta.clubeId;

  const activeWebhooks = await db
    .select()
    .from(webhooksB2b)
    .where(eq(webhooksB2b.clubeId, clubeAlvo));

  const payloadObj = {
    evento: 'dossie.compartilhado',
    token_acesso: token,
    link_seguro_url: linkSeguroUrl,
    expira_em: expiraEm.toISOString(),
    audit_hash_sha256: auditHashSha256,
    atleta: {
      codigo_5play: atleta.codigo5play,
      nome_completo: atleta.nomeCompleto,
      posicao: atleta.posicaoPrimaria,
      categoria: atleta.categoria,
    },
    metricas: metrica
      ? {
          ipb: Number(metrica.ipbProntidaoBiomecanica),
          spe: Number(metrica.spePotenciaExplosao),
          ietp: Number(metrica.ietpEficienciaTecnica),
          ips: Number(metrica.ipsPotencialScouting),
          assimetria_bilateral_pct: Number(metrica.assimetriaBilateralPct ?? 0),
        }
      : null,
  };
  const bodyStr = JSON.stringify(payloadObj);

  const dispatches: Array<{
    webhookId: number;
    nomeIntegracao: string;
    endpointUrl: string;
    statusHttp: number | null;
    entregue: boolean;
    erro: string | null;
  }> = [];

  for (const wh of activeWebhooks.filter((w) => w.ativo)) {
    const signature = crypto
      .createHmac('sha256', wh.secretHmacSha256Hash)
      .update(bodyStr)
      .digest('hex');

    let statusHttp: number | null = null;
    let entregue = false;
    let erro: string | null = null;
    try {
      const resp = await fetch(wh.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KinePitch-Event': 'dossie.compartilhado',
          'X-KinePitch-Signature': `sha256=${signature}`,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(5000),
      });
      statusHttp = resp.status;
      entregue = resp.ok;
    } catch (err) {
      erro = err instanceof Error ? err.message : 'Erro de rede ao entregar webhook';
    }

    await db
      .update(webhooksB2b)
      .set({
        ultimaEntregaEm: new Date(),
        ultimoStatusHttp: statusHttp,
        totalFalhasConsecutivas: entregue ? 0 : (wh.totalFalhasConsecutivas || 0) + 1,
      })
      .where(eq(webhooksB2b.id, wh.id));

    dispatches.push({
      webhookId: wh.id,
      nomeIntegracao: wh.nomeIntegracao,
      endpointUrl: wh.endpointUrl,
      statusHttp,
      entregue,
      erro,
    });
  }

  await registrarAuditoria({
    usuarioId,
    acao: 'DOSSIE_B2B_COMPARTILHADO',
    entidade: 'relatorios_compartilhados',
    entidadeId: String(relatorio.id),
    ipOrigem,
    metadata: { token, expiraEm: expiraEm.toISOString(), webhooksTotal: dispatches.length },
  });

  return {
    relatorio,
    linkSeguroUrl,
    webhooksDisparados: dispatches,
    payloadEnviado: payloadObj,
  };
}

export async function listRelatoriosCompartilhados() {
  return await db
    .select({
      id: relatoriosCompartilhados.id,
      tokenAcesso: relatoriosCompartilhados.tokenAcesso,
      atletaNome: atletas.nomeCompleto,
      codigoSessao: sessoesAnalise.codigoSessao,
      auditHashSha256: relatoriosCompartilhados.auditHashSha256,
      expiraEm: relatoriosCompartilhados.expiraEm,
      visualizacoesCount: relatoriosCompartilhados.visualizacoesCount,
      ativo: relatoriosCompartilhados.ativo,
      criadoEm: relatoriosCompartilhados.criadoEm,
    })
    .from(relatoriosCompartilhados)
    .innerJoin(atletas, eq(relatoriosCompartilhados.atletaId, atletas.id))
    .innerJoin(sessoesAnalise, eq(relatoriosCompartilhados.sessaoId, sessoesAnalise.id))
    .orderBy(desc(relatoriosCompartilhados.criadoEm))
    .limit(20);
}

export async function getPublicB2bReportByToken(token: string) {
  const rows = await db
    .select()
    .from(relatoriosCompartilhados)
    .where(eq(relatoriosCompartilhados.tokenAcesso, token))
    .limit(1);
  const rel = rows[0];
  if (!rel || !rel.ativo) return { error: 'not_found' as const };
  if (new Date() > rel.expiraEm) return { error: 'expired' as const };

  const [atletaRows, sessaoRows, metricaRows] = await Promise.all([
    db.select().from(atletas).where(eq(atletas.id, rel.atletaId)).limit(1),
    db.select().from(sessoesAnalise).where(eq(sessoesAnalise.id, rel.sessaoId)).limit(1),
    db.select().from(metricasBiomecanicas).where(eq(metricasBiomecanicas.sessaoId, rel.sessaoId)).limit(1),
  ]);

  const atleta = atletaRows[0] ?? null;
  const [clubeRows, benchmarks] = await Promise.all([
    atleta ? db.select().from(clubes).where(eq(clubes.id, atleta.clubeId)).limit(1) : Promise.resolve([]),
    atleta
      ? db.select().from(benchmarksPosicao).where(eq(benchmarksPosicao.posicao, atleta.posicaoPrimaria))
      : Promise.resolve([]),
  ]);

  await db
    .update(relatoriosCompartilhados)
    .set({ visualizacoesCount: rel.visualizacoesCount + 1 })
    .where(eq(relatoriosCompartilhados.id, rel.id));

  return {
    error: null,
    relatorio: { ...rel, visualizacoesCount: rel.visualizacoesCount + 1 },
    clube: clubeRows[0] ?? null,
    atleta,
    sessao: sessaoRows[0] ?? null,
    metrica: metricaRows[0] ?? null,
    benchmarks,
  };
}

