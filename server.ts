import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  createAtleta,
  createB2bShareAndDispatchWebhooks,
  createClube,
  createWebhook,
  enqueueAndAnalyzeSessao,
  getDynamicDashboardOverview,
  getPublicB2bReportByToken,
  getSessaoDetailById,
  getTableRecordCounts,
  listAtletas,
  listAuditLogs,
  listBenchmarks,
  listClubes,
  listConsentimentosLgpd,
  listRelatoriosCompartilhados,
  listSessoesAnalise,
  listWebhooks,
  toggleWebhookStatus,
  updateConsentimentoLgpdStatus,
  upsertBenchmark,
  validateLgpdForAtleta,
} from './src/db/architecture.ts';

function getClientIp(req: express.Request): string | undefined {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    undefined
  );
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Artefatos estruturais da Etapa 1 (SQL DDL + Docker Compose reais do disco)
  app.get('/api/architecture/artifacts', (_req, res) => {
    try {
      const sqlScript = fs.readFileSync(
        path.join(process.cwd(), 'database', '01_schema.sql'),
        'utf-8'
      );
      const dockerCompose = fs.readFileSync(
        path.join(process.cwd(), 'docker-compose.yml'),
        'utf-8'
      );
      res.json({ sqlScript, dockerCompose });
    } catch (error) {
      console.error('Error reading Stage 1 architecture artifacts:', error);
      res.status(500).json({ error: 'Falha ao carregar artefatos da Etapa 1.' });
    }
  });

  // Artefatos Python FastAPI + Celery + OpenCV/YOLOv8 da Etapa 2
  app.get('/api/stage2/artifacts', (_req, res) => {
    try {
      const backendDir = path.join(process.cwd(), 'backend');
      const fileNames = [
        'main.py',
        'models.py',
        'schemas.py',
        'vision_engine.py',
        'tasks.py',
        'storage.py',
        'database.py',
        'requirements.txt',
        'Dockerfile',
      ];
      const files: Record<string, string> = {};
      for (const name of fileNames) {
        const filePath = path.join(backendDir, name);
        if (fs.existsSync(filePath)) {
          files[name] = fs.readFileSync(filePath, 'utf-8');
        }
      }
      res.json({ files });
    } catch (error) {
      console.error('Error reading Stage 2 Python artifacts:', error);
      res.status(500).json({ error: 'Falha ao carregar módulos Python da Etapa 2.' });
    }
  });

  // Endpoints protegidos por Firebase Auth + persistência PostgreSQL via Drizzle
  app.get('/api/stage1/overview', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const counts = await getTableRecordCounts();
      res.json({ counts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/clubes', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listClubes();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/clubes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { nome, sigla, tipoInstituicao, cidade } = req.body ?? {};
      if (!nome || !sigla || !cidade) {
        res.status(400).json({ error: 'Nome, sigla e cidade são obrigatórios.' });
        return;
      }
      const created = await createClube(
        {
          ...req.body,
          tipoInstituicao: tipoInstituicao || 'clube_profissional',
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/atletas', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listAtletas();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/atletas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      if (
        !body.clubeId ||
        !body.nomeCompleto ||
        !body.dataNascimento ||
        !body.categoria ||
        !body.posicaoPrimaria ||
        !body.estaturaCm ||
        !body.massaCorporalKg
      ) {
        res.status(400).json({
          error:
            'Campos obrigatórios: clube, nome completo, data de nascimento, categoria, posição, estatura e massa corporal.',
        });
        return;
      }

      const created = await createAtleta(
        {
          ...body,
          clubeId: Number(body.clubeId),
          estaturaCm: Number(body.estaturaCm),
          massaCorporalKg: Number(body.massaCorporalKg),
          envergaduraCm: body.envergaduraCm ? Number(body.envergaduraCm) : undefined,
          percentualGordura: body.percentualGordura ? Number(body.percentualGordura) : undefined,
          mirwaldOffsetAnos:
            body.mirwaldOffsetAnos !== undefined && body.mirwaldOffsetAnos !== ''
              ? Number(body.mirwaldOffsetAnos)
              : undefined,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      const status = msg.includes('LGPD') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  app.get('/api/lgpd', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listConsentimentosLgpd();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/lgpd/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body ?? {};
      if (!Number.isFinite(id) || (status !== 'autorizado' && status !== 'revogado')) {
        res.status(400).json({ error: 'ID ou status LGPD inválido.' });
        return;
      }
      const updated = await updateConsentimentoLgpdStatus(
        id,
        status,
        req.dbUserId,
        getClientIp(req)
      );
      if (!updated) {
        res.status(404).json({ error: 'Termo LGPD não encontrado.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/benchmarks', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listBenchmarks();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/benchmarks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.posicao || !body.nivelReferencia) {
        res.status(400).json({ error: 'Posição e nível de referência são obrigatórios.' });
        return;
      }
      const saved = await upsertBenchmark(
        {
          posicao: body.posicao,
          nivelReferencia: body.nivelReferencia,
          amostraN: Number(body.amostraN || 100),
          vmaxKmh: Number(body.vmaxKmh),
          split010mSeg: Number(body.split010mSeg),
          potenciaChuteKmh: Number(body.potenciaChuteKmh),
          assimetriaMaxPct: Number(body.assimetriaMaxPct),
          rsiModAlvo: Number(body.rsiModAlvo),
          valgoMaxSeguroGraus: Number(body.valgoMaxSeguroGraus),
          ipbMedio: Number(body.ipbMedio),
          speMedio: Number(body.speMedio),
          ietpMedio: Number(body.ietpMedio),
          ipsMedio: Number(body.ipsMedio),
          fonteEstudo: body.fonteEstudo,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(saved);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/webhooks', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listWebhooks();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/webhooks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.clubeId || !body.nomeIntegracao || !body.tipoSistema || !body.endpointUrl) {
        res.status(400).json({
          error: 'Clube, nome da integração, sistema e URL de endpoint são obrigatórios.',
        });
        return;
      }
      const created = await createWebhook(
        {
          clubeId: Number(body.clubeId),
          nomeIntegracao: body.nomeIntegracao,
          tipoSistema: body.tipoSistema,
          endpointUrl: body.endpointUrl,
          eventosAssinados: Array.isArray(body.eventosAssinados) ? body.eventosAssinados : [],
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/webhooks/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { ativo } = req.body ?? {};
      if (!Number.isFinite(id) || typeof ativo !== 'boolean') {
        res.status(400).json({ error: 'Parâmetros inválidos.' });
        return;
      }
      const updated = await toggleWebhookStatus(id, ativo, req.dbUserId, getClientIp(req));
      if (!updated) {
        res.status(404).json({ error: 'Webhook não encontrado.' });
        return;
      }
      res.json(updated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/auditoria', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listAuditLogs();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  // Etapa 2: Dashboard Dinâmico, Fila Assíncrona (202 Accepted) & Compartilhamento B2B
  app.get('/api/dashboard', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const overview = await getDynamicDashboardOverview();
      res.json(overview);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/sessoes', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listSessoesAnalise();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/sessoes/enqueue', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.atletaId || !body.tipoTeste || !body.nomeArquivo) {
        res.status(400).json({ error: 'Atleta, tipo de teste e nome do arquivo são obrigatórios.' });
        return;
      }
      const result = await enqueueAndAnalyzeSessao(
        {
          atletaId: Number(body.atletaId),
          tipoTeste: body.tipoTeste,
          modoCaptura: body.modoCaptura || 'stereo_4k_60fps',
          nomeArquivo: String(body.nomeArquivo),
          velocidadePicoKmh: Number(body.velocidadePicoKmh ?? 31.4),
          flexaoJoelhoEsqGraus: Number(body.flexaoJoelhoEsqGraus ?? 42),
          flexaoJoelhoDirGraus: Number(body.flexaoJoelhoDirGraus ?? 38),
          valgoDinamicoGraus: Number(body.valgoDinamicoGraus ?? 3.8),
          alturaSaltoCm: Number(body.alturaSaltoCm ?? 41),
          acwr: Number(body.acwr ?? 1.08),
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(202).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      const status = msg.includes('LGPD') ? 403 : 500;
      res.status(status).json({ error: msg });
    }
  });

  app.get('/api/compartilhamentos', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listRelatoriosCompartilhados();
      res.json(rows);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/compartilhamentos/b2b', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      if (!body.sessaoId) {
        res.status(400).json({ error: 'Sessão de análise é obrigatória.' });
        return;
      }
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers.host || 'localhost:3000';
      const result = await createB2bShareAndDispatchWebhooks(
        {
          sessaoId: Number(body.sessaoId),
          clubeDestinoId: body.clubeDestinoId ? Number(body.clubeDestinoId) : undefined,
          diasValidade: Number(body.diasValidade ?? 7),
          baseUrl: `${protocol}://${host}`,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/compartilhamentos/publico/:token', async (req, res) => {
    try {
      const data = await getPublicB2bReportByToken(req.params.token);
      if (data.error === 'not_found') {
        res.status(404).json({ error: 'Token B2B não encontrado ou revogado.' });
        return;
      }
      if (data.error === 'expired') {
        res.status(410).json({ error: 'Token B2B expirado.' });
        return;
      }
      res.json(data);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // ETAPA 3: API CANÔNICA /api/v1/* (CONTRATO IDÊNTICO AO FASTAPI DA ETAPA 2)
  // ============================================================================
  app.get('/api/v1/dashboard', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clubeIdFilter = req.query.clube_id ? Number(req.query.clube_id) : null;
      const d = await getDynamicDashboardOverview();
      const filteredAtletas = clubeIdFilter
        ? (await listAtletas()).filter((a) => a.clubeId === clubeIdFilter).map((a) => a.id)
        : null;

      const monitorados = d.atletasMonitorados
        .filter((a) => (!filteredAtletas ? true : filteredAtletas.includes(a.atletaId)))
        .map((a) => ({
          atleta_id: a.atletaId,
          codigo_5play: a.codigo5play,
          nome_completo: a.nomeCompleto,
          clube_sigla: a.clubeSigla,
          categoria: a.categoria,
          posicao_primaria: a.posicaoPrimaria,
          apto_avaliacao_3d: a.aptoAvaliacao3d,
          ipb: a.ipb,
          spe: a.spe,
          ietp: a.ietp,
          ips: a.ips,
          velocidade_pico_kmh: a.velocidadePicoKmh,
          assimetria_bilateral_pct: a.assimetriaBilateralPct,
          alerta_assimetria_critica: a.alertaAssimetriaCritica,
        }));

      res.json({
        total_clubes_ativos: d.totalClubesAtivos,
        total_atletas: monitorados.length,
        total_sessoes_concluidas: d.totalSessoesConcluidas,
        eficiencia_biomecanica_media_pct: d.eficienciaBiomecanicaMediaPct,
        velocidade_pico_media_kmh: d.velocidadePicoMediaKmh,
        velocidade_pico_max_kmh: d.velocidadePicoMaxKmh,
        assimetrias_criticas_count: d.assimetriasCriticasCount,
        acwr_medio_elenco: d.acwrMedioElenco,
        atletas_monitorados: monitorados,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/clubes', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listClubes();
      res.json(
        rows.map((c) => ({
          id: c.id,
          nome: c.nome,
          sigla: c.sigla,
          cnpj: c.cnpj,
          tipo_instituicao: c.tipoInstituicao,
          cbf_tms_codigo: c.cbfTmsCodigo,
          cidade: c.cidade,
          estado_uf: c.estadoUf,
          pais: c.pais,
          plano_contrato: c.planoContrato,
          responsavel_tecnico: c.responsavelTecnico,
          email_contato: c.emailContato,
          ativo: c.ativo,
          criado_em: c.criadoEm,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/clubes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      if (!b.nome || !b.sigla || !b.cidade) {
        res.status(400).json({ detail: 'Nome, sigla e cidade são obrigatórios.' });
        return;
      }
      const c = await createClube(
        {
          nome: b.nome,
          sigla: b.sigla,
          cnpj: b.cnpj,
          tipoInstituicao: b.tipo_instituicao || b.tipoInstituicao || 'clube_profissional',
          cbfTmsCodigo: b.cbf_tms_codigo || b.cbfTmsCodigo,
          cidade: b.cidade,
          estadoUf: b.estado_uf || b.estadoUf,
          pais: b.pais || 'Brasil',
          responsavelTecnico: b.responsavel_tecnico || b.responsavelTecnico,
          emailContato: b.email_contato || b.emailContato,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json({
        id: c.id,
        nome: c.nome,
        sigla: c.sigla,
        cnpj: c.cnpj,
        tipo_instituicao: c.tipoInstituicao,
        cbf_tms_codigo: c.cbfTmsCodigo,
        cidade: c.cidade,
        estado_uf: c.estadoUf,
        pais: c.pais,
        plano_contrato: c.planoContrato,
        ativo: c.ativo,
        criado_em: c.criadoEm,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/atletas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clubeId = req.query.clube_id ? Number(req.query.clube_id) : null;
      const rows = (await listAtletas()).filter((a) => (!clubeId ? true : a.clubeId === clubeId));
      res.json(
        rows.map((a) => ({
          id: a.id,
          clube_id: a.clubeId,
          clube_nome: a.clubeNome,
          clube_sigla: a.clubeSigla,
          codigo_5play: a.codigo5play,
          nome_completo: a.nomeCompleto,
          apelido_esportivo: a.apelidoEsportivo,
          data_nascimento: a.dataNascimento,
          nacionalidade: a.nacionalidade,
          categoria: a.categoria,
          posicao_primaria: a.posicaoPrimaria,
          posicao_secundaria: a.posicaoSecundaria,
          numero_camisa: a.numeroCamisa,
          pe_dominante: a.peDominante,
          tipo_contrato: a.tipoContrato,
          valencias_taticas: a.valenciasTaticas,
          estatura_cm: Number(a.estaturaCm),
          massa_corporal_kg: Number(a.massaCorporalKg),
          envergadura_cm: a.envergaduraCm ? Number(a.envergaduraCm) : null,
          percentual_gordura: a.percentualGordura ? Number(a.percentualGordura) : null,
          imc: a.imc ? Number(a.imc) : null,
          estagio_maturacional: a.estagioMaturacional,
          mirwald_offset_anos: a.mirwaldOffsetAnos ? Number(a.mirwaldOffsetAnos) : null,
          apto_avaliacao_3d: a.aptoAvaliacao3d,
          criado_em: a.criadoEm,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/atletas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      const clubeId = Number(b.clube_id ?? b.clubeId);
      const nomeCompleto = b.nome_completo ?? b.nomeCompleto;
      const dataNascimento = b.data_nascimento ?? b.dataNascimento;
      const categoria = b.categoria;
      const posicaoPrimaria = b.posicao_primaria ?? b.posicaoPrimaria;
      const estaturaCm = Number(b.estatura_cm ?? b.estaturaCm);
      const massaCorporalKg = Number(b.massa_corporal_kg ?? b.massaCorporalKg);

      if (
        !clubeId ||
        !nomeCompleto ||
        !dataNascimento ||
        !categoria ||
        !posicaoPrimaria ||
        !Number.isFinite(estaturaCm) ||
        !Number.isFinite(massaCorporalKg)
      ) {
        res.status(422).json({
          detail:
            'Campos obrigatórios: clube, nome completo, data de nascimento, categoria, posição, estatura e massa corporal.',
        });
        return;
      }

      const lgpd = b.consentimento_lgpd;
      const a = await createAtleta(
        {
          clubeId,
          nomeCompleto,
          apelidoEsportivo: b.apelido_esportivo ?? b.apelidoEsportivo,
          dataNascimento,
          nacionalidade: b.nacionalidade,
          categoria,
          posicaoPrimaria,
          posicaoSecundaria: b.posicao_secundaria ?? b.posicaoSecundaria ?? undefined,
          numeroCamisa:
            b.numero_camisa !== undefined && b.numero_camisa !== '' && b.numero_camisa !== null
              ? Number(b.numero_camisa)
              : undefined,
          peDominante: b.pe_dominante ?? b.peDominante ?? 'destro',
          tipoContrato: b.tipo_contrato ?? b.tipoContrato ?? 'formacao_fdi',
          empresarioAgencia: b.empresario_agencia ?? b.empresarioAgencia,
          valenciasTaticas: Array.isArray(b.valencias_taticas ?? b.valenciasTaticas)
            ? (b.valencias_taticas ?? b.valenciasTaticas)
            : [],
          estaturaCm,
          massaCorporalKg,
          envergaduraCm:
            b.envergadura_cm ?? b.envergaduraCm ? Number(b.envergadura_cm ?? b.envergaduraCm) : undefined,
          percentualGordura:
            b.percentual_gordura ?? b.percentualGordura
              ? Number(b.percentual_gordura ?? b.percentualGordura)
              : undefined,
          estagioMaturacional: b.estagio_maturacional ?? b.estagioMaturacional ?? 'pvc_em_andamento',
          mirwaldOffsetAnos:
            b.mirwald_offset_anos !== undefined && b.mirwald_offset_anos !== '' && b.mirwald_offset_anos !== null
              ? Number(b.mirwald_offset_anos)
              : b.mirwaldOffsetAnos !== undefined && b.mirwaldOffsetAnos !== ''
                ? Number(b.mirwaldOffsetAnos)
                : undefined,
          tagGpsVinculada: b.tag_gps_vinculada ?? b.tagGpsVinculada,
          responsavelLegalNome: lgpd?.responsavel_legal_nome ?? b.responsavelLegalNome,
          responsavelLegalCpfFinal: lgpd?.responsavel_legal_cpf_final ?? b.responsavelLegalCpfFinal,
          responsavelTelefone: lgpd?.responsavel_telefone ?? b.responsavelTelefone,
          parentesco: lgpd?.parentesco ?? b.parentesco,
          autorizarLgpdImediato: lgpd?.autorizar_imediatamente ?? b.autorizarLgpdImediato,
        },
        req.dbUserId,
        getClientIp(req)
      );

      res.status(201).json({
        id: a.id,
        clube_id: a.clubeId,
        codigo_5play: a.codigo5play,
        nome_completo: a.nomeCompleto,
        apelido_esportivo: a.apelidoEsportivo,
        data_nascimento: a.dataNascimento,
        categoria: a.categoria,
        posicao_primaria: a.posicaoPrimaria,
        posicao_secundaria: a.posicaoSecundaria,
        pe_dominante: a.peDominante,
        estatura_cm: Number(a.estaturaCm),
        massa_corporal_kg: Number(a.massaCorporalKg),
        imc: a.imc ? Number(a.imc) : null,
        estagio_maturacional: a.estagioMaturacional,
        apto_avaliacao_3d: a.aptoAvaliacao3d,
        criado_em: a.criadoEm,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(msg.includes('LGPD') ? 422 : 500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/lgpd', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listConsentimentosLgpd();
      res.json(
        rows.map((r) => ({
          id: r.id,
          atleta_id: r.atletaId,
          atleta_nome: r.atletaNome,
          atleta_codigo: r.atletaCodigo,
          atleta_categoria: r.atletaCategoria,
          atleta_menor_idade: r.atletaMenorIdade,
          responsavel_legal_nome: r.responsavelLegalNome,
          responsavel_legal_cpf_final: r.responsavelLegalCpfFinal,
          responsavel_telefone: r.responsavelTelefone,
          parentesco: r.parentesco,
          termo_versao: r.termoVersao,
          status: r.status,
          assinado_em: r.assinadoEm,
          valido_ate: r.validoAte,
          criado_em: r.criadoEm,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/lgpd/validar', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      const atletaId = Number(b.atleta_id ?? b.atletaId);
      const status = b.status;
      if (!Number.isFinite(atletaId) || (status !== 'autorizado' && status !== 'revogado')) {
        res.status(400).json({ detail: 'atleta_id e status ("autorizado" ou "revogado") são obrigatórios.' });
        return;
      }
      const termo = await validateLgpdForAtleta(
        {
          atletaId,
          status,
          finalidadeCapturaBiometrica: b.finalidade_captura_biometrica ?? true,
          finalidadeScoutingB2b: b.finalidade_scouting_b2b ?? true,
          responsavelLegalNome: b.responsavel_legal_nome,
          responsavelLegalCpfFinal: b.responsavel_legal_cpf_final,
          responsavelTelefone: b.responsavel_telefone,
          parentesco: b.parentesco,
          motivoRevogacao: b.motivo_revogacao,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.json({
        id: termo.id,
        atleta_id: termo.atletaId,
        status: termo.status,
        assinado_em: termo.assinadoEm,
        valido_ate: termo.validoAte,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(400).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/benchmarks', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listBenchmarks();
      res.json(
        rows.map((b) => ({
          id: b.id,
          posicao: b.posicao,
          nivel_referencia: b.nivelReferencia,
          amostra_n: b.amostraN,
          vmax_kmh: Number(b.vmaxKmh),
          split_0_10m_seg: Number(b.split010mSeg),
          potencia_chute_kmh: Number(b.potenciaChuteKmh),
          assimetria_max_pct: Number(b.assimetriaMaxPct),
          rsi_mod_alvo: Number(b.rsiModAlvo),
          valgo_max_seguro_graus: Number(b.valgoMaxSeguroGraus),
          ipb_medio: Number(b.ipbMedio),
          spe_medio: Number(b.speMedio),
          ietp_medio: Number(b.ietpMedio),
          ips_medio: Number(b.ipsMedio),
          fonte_estudo: b.fonteEstudo,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/benchmarks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      if (!b.posicao || !(b.nivel_referencia ?? b.nivelReferencia)) {
        res.status(400).json({ detail: 'Posição e nível de referência são obrigatórios.' });
        return;
      }
      const saved = await upsertBenchmark(
        {
          posicao: b.posicao,
          nivelReferencia: b.nivel_referencia ?? b.nivelReferencia,
          amostraN: Number(b.amostra_n ?? b.amostraN ?? 120),
          vmaxKmh: Number(b.vmax_kmh ?? b.vmaxKmh ?? 32.5),
          split010mSeg: Number(b.split_0_10m_seg ?? b.split010mSeg ?? 1.72),
          potenciaChuteKmh: Number(b.potencia_chute_kmh ?? b.potenciaChuteKmh ?? 108),
          assimetriaMaxPct: Number(b.assimetria_max_pct ?? b.assimetriaMaxPct ?? 12),
          rsiModAlvo: Number(b.rsi_mod_alvo ?? b.rsiModAlvo ?? 2.1),
          valgoMaxSeguroGraus: Number(b.valgo_max_seguro_graus ?? b.valgoMaxSeguroGraus ?? 5),
          ipbMedio: Number(b.ipb_medio ?? b.ipbMedio ?? 84),
          speMedio: Number(b.spe_medio ?? b.speMedio ?? 82),
          ietpMedio: Number(b.ietp_medio ?? b.ietpMedio ?? 85),
          ipsMedio: Number(b.ips_medio ?? b.ipsMedio ?? 84),
          fonteEstudo: b.fonte_estudo ?? b.fonteEstudo,
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json(saved);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/sessoes', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listSessoesAnalise();
      res.json(
        rows.map((s) => ({
          sessao_id: s.sessaoId,
          codigo_sessao: s.codigoSessao,
          atleta_id: s.atletaId,
          atleta_nome: s.atletaNome,
          atleta_codigo: s.atletaCodigo,
          clube_nome: s.clubeNome,
          clube_sigla: s.clubeSigla,
          categoria: s.categoria,
          posicao: s.posicao,
          pe_dominante: s.peDominante,
          estagio_maturacional: s.estagioMaturacional,
          tipo_teste: s.tipoTeste,
          modo_captura: s.modoCaptura,
          status_processamento: s.statusProcessamento,
          redis_job_id: s.redisJobId,
          acwr: s.acwr ? Number(s.acwr) : null,
          sintese_ia_texto: s.sinteseIaTexto,
          total_frames: s.totalFrames,
          duracao_segundos: s.duracaoSegundos ? Number(s.duracaoSegundos) : null,
          keyframes_criticos: s.keyframesCriticos,
          criado_em: s.criadoEm,
          ipb: s.ipb ? Number(s.ipb) : null,
          spe: s.spe ? Number(s.spe) : null,
          ietp: s.ietp ? Number(s.ietp) : null,
          ips: s.ips ? Number(s.ips) : null,
          velocidade_pico_kmh: s.velocidadePicoKmh ? Number(s.velocidadePicoKmh) : null,
          assimetria_bilateral_pct: s.assimetriaBilateralPct ? Number(s.assimetriaBilateralPct) : null,
          pontos_opticos_22: s.pontosOpticos22,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/sessoes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ detail: 'ID de sessão inválido.' });
        return;
      }
      const detail = await getSessaoDetailById(id);
      if (!detail) {
        res.status(404).json({ detail: 'Sessão não encontrada.' });
        return;
      }
      const { sessao, atleta, clube, metricas, benchmarks } = detail;
      res.json({
        sessao: {
          id: sessao.id,
          codigo_sessao: sessao.codigoSessao,
          atleta_id: sessao.atletaId,
          clube_id: sessao.clubeId,
          tipo_teste: sessao.tipoTeste,
          modo_captura: sessao.modoCaptura,
          status_processamento: sessao.statusProcessamento,
          progresso_percentual: sessao.progressoPercentual,
          redis_job_id: sessao.redisJobId,
          worker_gpu_node: sessao.workerGpuNode,
          latencia_inferencia_ms: sessao.latenciaInferenciaMs ? Number(sessao.latenciaInferenciaMs) : null,
          video_s3_key: sessao.videoS3Key,
          total_frames: sessao.totalFrames,
          duracao_segundos: sessao.duracaoSegundos ? Number(sessao.duracaoSegundos) : null,
          keyframes_criticos: sessao.keyframesCriticos,
          acwr_carga_aguda_cronica: sessao.acwrCargaAgudaCronica
            ? Number(sessao.acwrCargaAgudaCronica)
            : null,
          sintese_ia_texto: sessao.sinteseIaTexto,
          criado_em: sessao.criadoEm,
        },
        atleta: atleta
          ? {
              id: atleta.id,
              codigo_5play: atleta.codigo5play,
              nome_completo: atleta.nomeCompleto,
              apelido_esportivo: atleta.apelidoEsportivo,
              data_nascimento: atleta.dataNascimento,
              categoria: atleta.categoria,
              posicao_primaria: atleta.posicaoPrimaria,
              pe_dominante: atleta.peDominante,
              estatura_cm: Number(atleta.estaturaCm),
              massa_corporal_kg: Number(atleta.massaCorporalKg),
              estagio_maturacional: atleta.estagioMaturacional,
              apto_avaliacao_3d: atleta.aptoAvaliacao3d,
            }
          : null,
        clube: clube
          ? {
              id: clube.id,
              nome: clube.nome,
              sigla: clube.sigla,
              cidade: clube.cidade,
            }
          : null,
        metricas: metricas
          ? {
              id: metricas.id,
              frame_referencia: metricas.frameReferencia,
              timestamp_segundos: Number(metricas.timestampSegundos),
              ipb_prontidao_biomecanica: Number(metricas.ipbProntidaoBiomecanica),
              spe_potencia_explosao: Number(metricas.spePotenciaExplosao),
              ietp_eficiencia_tecnica: Number(metricas.ietpEficienciaTecnica),
              ips_potencial_scouting: Number(metricas.ipsPotencialScouting),
              pontos_opticos_22: metricas.pontosOpticos22,
              confianca_rastreamento_pct: Number(metricas.confiancaRastreamentoPct),
              flexao_joelho_esq_graus: Number(metricas.flexaoJoelhoEsqGraus ?? 0),
              flexao_joelho_dir_graus: Number(metricas.flexaoJoelhoDirGraus ?? 0),
              extensao_joelho_chute_graus: Number(metricas.extensaoJoelhoChuteGraus ?? 0),
              rotacao_quadril_graus: Number(metricas.rotacaoQuadrilGraus ?? 0),
              inclinacao_pelvica_lateral_graus: Number(metricas.inclinacaoPelvicaLateralGraus ?? 0),
              dorsiflexao_tornozelo_graus: Number(metricas.dorsiflexaoTornozeloGraus ?? 0),
              valgo_dinamico_joelho_graus: Number(metricas.valgoDinamicoJoelhoGraus ?? 0),
              velocidade_pico_kmh: Number(metricas.velocidadePicoKmh ?? 0),
              velocidade_pe_chute_kmh: Number(metricas.velocidadePeChuteKmh ?? 0),
              velocidade_bola_kmh: Number(metricas.velocidadeBolaKmh ?? 0),
              split_0_10m_seg: Number(metricas.split010mSeg ?? 0),
              desaceleracao_max_ms2: Number(metricas.desaceleracaoMaxMs2 ?? 0),
              vetor_grf_bw: Number(metricas.vetorGrfBw ?? 0),
              torque_articular_nm: Number(metricas.torqueArticularNm ?? 0),
              altura_salto_cm: Number(metricas.alturaSaltoCm ?? 0),
              rsi_reativo: Number(metricas.rsiReativo ?? 0),
              assimetria_bilateral_pct: Number(metricas.assimetriaBilateralPct ?? 0),
            }
          : null,
        benchmarks: benchmarks.map((b) => ({
          id: b.id,
          posicao: b.posicao,
          nivel_referencia: b.nivelReferencia,
          vmax_kmh: Number(b.vmaxKmh),
          split_0_10m_seg: Number(b.split010mSeg),
          potencia_chute_kmh: Number(b.potenciaChuteKmh),
          assimetria_max_pct: Number(b.assimetriaMaxPct),
          ipb_medio: Number(b.ipbMedio),
          spe_medio: Number(b.speMedio),
          ietp_medio: Number(b.ietpMedio),
          ips_medio: Number(b.ipsMedio),
        })),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/sessoes/upload-url', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      const atletaId = Number(b.atleta_id ?? b.atletaId);
      const tipoTeste = b.tipo_teste ?? b.tipoTeste;
      const nomeArquivo = b.nome_arquivo ?? b.nomeArquivo;
      if (!atletaId || !tipoTeste || !nomeArquivo) {
        res.status(400).json({ detail: 'Atleta, tipo de teste e nome do arquivo são obrigatórios.' });
        return;
      }
      const result = await enqueueAndAnalyzeSessao(
        {
          atletaId,
          tipoTeste,
          modoCaptura: b.modo_captura ?? b.modoCaptura ?? 'stereo_4k_60fps',
          nomeArquivo: String(nomeArquivo),
          velocidadePicoKmh: Number(b.velocidade_pico_kmh ?? b.velocidadePicoKmh ?? 31.4),
          flexaoJoelhoEsqGraus: Number(b.flexao_joelho_esq_graus ?? b.flexaoJoelhoEsqGraus ?? 42),
          flexaoJoelhoDirGraus: Number(b.flexao_joelho_dir_graus ?? b.flexaoJoelhoDirGraus ?? 38),
          valgoDinamicoGraus: Number(b.valgo_dinamico_graus ?? b.valgoDinamicoGraus ?? 3.8),
          alturaSaltoCm: Number(b.altura_salto_cm ?? b.alturaSaltoCm ?? 41),
          acwr: Number(b.acwr ?? 1.08),
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(202).json({
        sessao_id: result.sessao.id,
        codigo_sessao: result.sessao.codigoSessao,
        status_processamento: result.sessao.statusProcessamento,
        celery_task_id: result.sessao.redisJobId,
        upload_signed_url: result.uploadSignedUrl,
        s3_bucket: result.sessao.videoS3Bucket,
        s3_object_key: result.sessao.videoS3Key,
        expira_em_segundos: 900,
        alerta_assimetria_critica: result.alertaAssimetriaCritica,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(msg.includes('LGPD') ? 403 : 500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/webhooks', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listWebhooks();
      res.json(
        rows.map((w) => ({
          id: w.id,
          clube_id: w.clubeId,
          clube_nome: w.clubeNome,
          clube_sigla: w.clubeSigla,
          nome_integracao: w.nomeIntegracao,
          tipo_sistema: w.tipoSistema,
          endpoint_url: w.endpointUrl,
          eventos_assinados: w.eventosAssinados,
          ativo: w.ativo,
          ultimo_status_http: w.ultimoStatusHttp,
          criado_em: w.criadoEm,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/webhooks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      const clubeId = Number(b.clube_id ?? b.clubeId);
      const nomeIntegracao = b.nome_integracao ?? b.nomeIntegracao;
      const tipoSistema = b.tipo_sistema ?? b.tipoSistema;
      const endpointUrl = b.endpoint_url ?? b.endpointUrl;
      if (!clubeId || !nomeIntegracao || !tipoSistema || !endpointUrl) {
        res.status(400).json({ detail: 'clube_id, nome_integracao, tipo_sistema e endpoint_url são obrigatórios.' });
        return;
      }
      const created = await createWebhook(
        {
          clubeId,
          nomeIntegracao,
          tipoSistema,
          endpointUrl,
          eventosAssinados: Array.isArray(b.eventos_assinados ?? b.eventosAssinados)
            ? (b.eventos_assinados ?? b.eventosAssinados)
            : [],
        },
        req.dbUserId,
        getClientIp(req)
      );
      res.status(201).json({
        id: created.id,
        nome_integracao: created.nomeIntegracao,
        endpoint_url: created.endpointUrl,
        signing_secret_once: created.signingSecretPreview,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/compartilhamentos', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await listRelatoriosCompartilhados();
      res.json(
        rows.map((r) => ({
          id: r.id,
          token_acesso: r.tokenAcesso,
          atleta_nome: r.atletaNome,
          codigo_sessao: r.codigoSessao,
          audit_hash_sha256: r.auditHashSha256,
          expira_em: r.expiraEm,
          visualizacoes_count: r.visualizacoesCount,
          ativo: r.ativo,
          criado_em: r.criadoEm,
        }))
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.post('/api/v1/compartilhamentos/b2b', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body ?? {};
      const sessaoId = Number(b.sessao_id ?? b.sessaoId);
      if (!sessaoId) {
        res.status(400).json({ detail: 'sessao_id é obrigatório.' });
        return;
      }
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers.host || 'localhost:3000';
      const result = await createB2bShareAndDispatchWebhooks(
        {
          sessaoId,
          clubeDestinoId: b.clube_destino_id ?? b.clubeDestinoId ? Number(b.clube_destino_id ?? b.clubeDestinoId) : undefined,
          diasValidade: Number(b.dias_validade ?? b.diasValidade ?? 7),
          baseUrl: `${protocol}://${host}`,
        },
        req.dbUserId,
        getClientIp(req)
      );
      const tokenStr = result.relatorio.tokenAcesso;
      res.status(201).json({
        relatorio_id: result.relatorio.id,
        token_acesso: tokenStr,
        link_seguro_url: `${protocol}://${host}/?token=${tokenStr}`,
        audit_hash_sha256: result.relatorio.auditHashSha256,
        expira_em: result.relatorio.expiraEm,
        webhooks_disparados: result.webhooksDisparados.map((w) => ({
          webhook_id: w.webhookId,
          nome_integracao: w.nomeIntegracao,
          endpoint_url: w.endpointUrl,
          status_http: w.statusHttp,
          entregue: w.entregue,
          erro: w.erro,
        })),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  app.get('/api/v1/compartilhamentos/publico/:token', async (req, res) => {
    try {
      const data = await getPublicB2bReportByToken(req.params.token);
      if (data.error === 'not_found') {
        res.status(404).json({ detail: 'Dossiê B2B não encontrado ou desativado.' });
        return;
      }
      if (data.error === 'expired') {
        res.status(410).json({ detail: 'Token de compartilhamento B2B expirado.' });
        return;
      }
      const { relatorio, clube, atleta, sessao, metrica, benchmarks } = data;
      res.json({
        audit_hash_sha256: relatorio.auditHashSha256,
        expira_em: relatorio.expiraEm,
        criado_em: relatorio.criadoEm,
        visualizacoes_count: relatorio.visualizacoesCount,
        clube: clube
          ? {
              nome: clube.nome,
              sigla: clube.sigla,
              cidade: clube.cidade,
            }
          : null,
        atleta: atleta
          ? {
              codigo_5play: atleta.codigo5play,
              nome_completo: atleta.nomeCompleto,
              apelido_esportivo: atleta.apelidoEsportivo,
              data_nascimento: atleta.dataNascimento,
              categoria: atleta.categoria,
              posicao_primaria: atleta.posicaoPrimaria,
              pe_dominante: atleta.peDominante,
              estatura_cm: Number(atleta.estaturaCm),
              massa_corporal_kg: Number(atleta.massaCorporalKg),
              estagio_maturacional: atleta.estagioMaturacional,
            }
          : null,
        sessao: sessao
          ? {
              codigo_sessao: sessao.codigoSessao,
              tipo_teste: sessao.tipoTeste,
              modo_captura: sessao.modoCaptura,
              acwr: sessao.acwrCargaAgudaCronica ? Number(sessao.acwrCargaAgudaCronica) : null,
              sintese_ia_texto: sessao.sinteseIaTexto,
              metricas: metrica
                ? {
                    ipb: Number(metrica.ipbProntidaoBiomecanica),
                    spe: Number(metrica.spePotenciaExplosao),
                    ietp: Number(metrica.ietpEficienciaTecnica),
                    ips: Number(metrica.ipsPotencialScouting),
                    confianca_rastreamento_pct: Number(metrica.confiancaRastreamentoPct),
                    velocidade_pico_kmh: Number(metrica.velocidadePicoKmh ?? 0),
                    velocidade_pe_chute_kmh: Number(metrica.velocidadePeChuteKmh ?? 0),
                    velocidade_bola_kmh: Number(metrica.velocidadeBolaKmh ?? 0),
                    split_0_10m_seg: Number(metrica.split010mSeg ?? 0),
                    assimetria_bilateral_pct: Number(metrica.assimetriaBilateralPct ?? 0),
                    flexao_joelho_esq_graus: Number(metrica.flexaoJoelhoEsqGraus ?? 0),
                    flexao_joelho_dir_graus: Number(metrica.flexaoJoelhoDirGraus ?? 0),
                    extensao_joelho_chute_graus: Number(metrica.extensaoJoelhoChuteGraus ?? 0),
                    dorsiflexao_tornozelo_graus: Number(metrica.dorsiflexaoTornozeloGraus ?? 0),
                    inclinacao_pelvica_lateral_graus: Number(metrica.inclinacaoPelvicaLateralGraus ?? 0),
                    valgo_dinamico_joelho_graus: Number(metrica.valgoDinamicoJoelhoGraus ?? 0),
                    vetor_grf_bw: Number(metrica.vetorGrfBw ?? 0),
                    torque_articular_nm: Number(metrica.torqueArticularNm ?? 0),
                    altura_salto_cm: Number(metrica.alturaSaltoCm ?? 0),
                    rsi_reativo: Number(metrica.rsiReativo ?? 0),
                    pontos_opticos_22: metrica.pontosOpticos22,
                  }
                : null,
            }
          : null,
        benchmarks: (benchmarks ?? []).map((b) => ({
          nivel_referencia: b.nivelReferencia,
          vmax_kmh: Number(b.vmaxKmh),
          split_0_10m_seg: Number(b.split010mSeg),
          potencia_chute_kmh: Number(b.potenciaChuteKmh),
          assimetria_max_pct: Number(b.assimetriaMaxPct),
          ipb_medio: Number(b.ipbMedio),
          spe_medio: Number(b.speMedio),
          ietp_medio: Number(b.ietpMedio),
          ips_medio: Number(b.ipsMedio),
        })),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro interno';
      res.status(500).json({ detail: msg, error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`5Play Sports KinePitch AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
