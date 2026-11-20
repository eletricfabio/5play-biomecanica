import { useMemo, useState } from 'react';
import { Check, Copy, Download, HardDrive, Server, Cpu, FileCode2 } from 'lucide-react';

interface ArtifactCodeViewProps {
  mode: 'sql' | 'docker' | 'python';
  sqlScript: string;
  dockerCompose: string;
  pythonFiles?: Record<string, string>;
  loading: boolean;
  error: string | null;
}

type SqlSection = 'all' | 'enums' | 'core' | 'lgpd' | 'biomechanics' | 'b2b';

const PYTHON_ORDER = [
  'main.py',
  'vision_engine.py',
  'tasks.py',
  'models.py',
  'schemas.py',
  'storage.py',
  'database.py',
  'requirements.txt',
  'Dockerfile',
] as const;

const PYTHON_DESCRIPTIONS: Record<string, string> = {
  'main.py': 'Rotas FastAPI (CRUD, LGPD, Dashboard Dinâmico, Upload 202 Accepted, B2B + Webhook)',
  'vision_engine.py': 'OpenCV + YOLOv8-Pose (22 pontos, ângulos, assimetria >15%, 4 KPIs por posição)',
  'tasks.py': 'Worker Celery + Redis: download MinIO S3, inferência 3D, upload overlay e Webhooks HMAC',
  'models.py': 'Modelos SQLAlchemy 2.0 mapeados 1:1 com o PostgreSQL da Etapa 1',
  'schemas.py': 'Contratos Pydantic v2 estritos para validação de entrada e resposta',
  'storage.py': 'Cliente boto3 compatível com AWS S3 / MinIO e geração de URL assinada PUT',
  'database.py': 'Engine SQLAlchemy, pool de conexões e dependência SessionLocal',
  'requirements.txt': 'Dependências Python fixadas (FastAPI, Celery, Redis, OpenCV, YOLOv8, Boto3)',
  Dockerfile: 'Imagem containerizada Python 3.12 com bibliotecas gráficas OpenCV/FFmpeg',
};

export function ArtifactCodeView({
  mode,
  sqlScript,
  dockerCompose,
  pythonFiles = {},
  loading,
  error,
}: ArtifactCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [sqlSection, setSqlSection] = useState<SqlSection>('all');
  const [selectedPyFile, setSelectedPyFile] = useState<string>('main.py');

  const availablePyFiles = useMemo(() => {
    const keys = Object.keys(pythonFiles);
    return PYTHON_ORDER.filter((name) => keys.includes(name));
  }, [pythonFiles]);

  const activePyFile = availablePyFiles.includes(selectedPyFile as (typeof PYTHON_ORDER)[number])
    ? selectedPyFile
    : availablePyFiles[0] || 'main.py';

  const displayedSql = useMemo(() => {
    if (!sqlScript || sqlSection === 'all') return sqlScript;
    const markers: Record<Exclude<SqlSection, 'all'>, [string, string | null]> = {
      enums: ['-- 1. TIPOS ENUMERADOS', '-- 2. TABELA: usuarios'],
      core: ['-- 2. TABELA: usuarios', '-- 5. TABELA: consentimentos_lgpd'],
      lgpd: ['-- 5. TABELA: consentimentos_lgpd', '-- 6. TABELA: sessoes_analise'],
      biomechanics: ['-- 6. TABELA: sessoes_analise', '-- 9. TABELA: webhooks_b2b'],
      b2b: ['-- 9. TABELA: webhooks_b2b', null],
    };

    const [startMarker, endMarker] = markers[sqlSection];
    const startIdx = sqlScript.indexOf(startMarker);
    if (startIdx === -1) return sqlScript;
    const endIdx = endMarker ? sqlScript.indexOf(endMarker, startIdx) : -1;
    return endIdx === -1 ? sqlScript.slice(startIdx) : sqlScript.slice(startIdx, endIdx);
  }, [sqlScript, sqlSection]);

  const rawContent =
    mode === 'sql'
      ? sqlScript
      : mode === 'docker'
      ? dockerCompose
      : pythonFiles[activePyFile] || '';

  const visibleContent = mode === 'sql' ? displayedSql : rawContent;

  const handleCopy = async () => {
    if (!rawContent) return;
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!rawContent) return;
    const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      mode === 'sql'
        ? '01_schema_5play_kinepitch.sql'
        : mode === 'docker'
        ? 'docker-compose.yml'
        : activePyFile;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
        <div className="h-6 w-64 bg-[#1F2937] rounded animate-pulse" />
        <div className="h-96 w-full bg-[#0B0F17] rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#111827] border border-[#EF4444]/40 rounded-lg p-6 text-sm text-[#FCA5A5]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mode === 'docker' && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#06B6D4]" />
                PostgreSQL 16 + FastAPI
              </span>
              <span className="font-mono-tabular text-xs text-[#9CA3AF]">:5432 / :8000</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Banco relacional inicializado com{' '}
              <span className="font-mono-tabular text-[#E5E7EB]">database/01_schema.sql</span> e API{' '}
              <span className="font-mono-tabular text-[#E5E7EB]">uvicorn main:app</span>.
            </p>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#10B981]" />
                Redis 7 + Celery Worker
              </span>
              <span className="font-mono-tabular text-xs text-[#9CA3AF]">:6379</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Broker AOF com política <span className="font-mono-tabular text-[#E5E7EB]">noeviction</span>{' '}
              alimentando o worker OpenCV + YOLOv8-Pose.
            </p>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#F59E0B]" />
                MinIO S3 + Bootstrap
              </span>
              <span className="font-mono-tabular text-xs text-[#9CA3AF]">:9000 / :9001</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Buckets privados provisionados para vídeos brutos, overlays 3D 22 pontos e dossiês B2B.
            </p>
          </div>
        </section>
      )}

      {mode === 'python' && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] text-sm">Motor OpenCV + YOLOv8-Pose</span>
              <span className="font-mono-tabular text-xs text-[#06B6D4]">22 pontos</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Extração dos 22 marcos anatômicos, ângulos articulares, velocidade linear/angular, alerta
              automático de assimetria &gt; 15% e KPIs IPB/SPE/IETP/IPS ponderados por posição.
            </p>
          </div>
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] text-sm">Fila Assíncrona Celery + Redis</span>
              <span className="font-mono-tabular text-xs text-[#10B981]">202 Accepted</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Geração de URL assinada PUT no MinIO S3, enfileiramento imediato no Redis e processamento
              em background com persistência automática no PostgreSQL.
            </p>
          </div>
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9FAFB] text-sm">Compartilhamento B2B &amp; LGPD</span>
              <span className="font-mono-tabular text-xs text-[#F59E0B]">HMAC-SHA256</span>
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Bloqueio automático para menores sem aceite LGPD, token UUID com validade configurável (7
              dias) e disparo de Webhook JSON assinado para clubes parceiros.
            </p>
          </div>
        </section>
      )}

      <section className="bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-[#1F2937] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
              {mode === 'python' && <FileCode2 className="w-4 h-4 text-[#06B6D4]" />}
              {mode === 'sql'
                ? 'database/01_schema.sql — Script DDL PostgreSQL Completo'
                : mode === 'docker'
                ? 'docker-compose.yml — Stack PostgreSQL + Redis + MinIO + FastAPI + Celery'
                : `backend/${activePyFile}`}
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {mode === 'sql'
                ? 'Script pronto para execução direta ou bootstrap automático no container PostgreSQL.'
                : mode === 'docker'
                ? 'Orquestração completa com healthchecks, volumes persistentes, FastAPI e worker Celery.'
                : PYTHON_DESCRIPTIONS[activePyFile] || 'Módulo Python FastAPI da Etapa 2.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1F2937] hover:bg-[#374151] text-[#F9FAFB] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Código</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {mode === 'sql' ? 'Baixar .sql' : mode === 'docker' ? 'Baixar .yml' : `Baixar ${activePyFile}`}
              </span>
            </button>
          </div>
        </div>

        {/* Seletor de módulos Python da Etapa 2 */}
        {mode === 'python' && (
          <div className="px-5 py-2.5 bg-[#0E1420] border-b border-[#1F2937] flex items-center gap-1.5 overflow-x-auto">
            {availablePyFiles.map((fileName) => (
              <button
                key={fileName}
                type="button"
                onClick={() => setSelectedPyFile(fileName)}
                className={`px-2.5 py-1 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activePyFile === fileName
                    ? 'bg-[#1F2937] text-[#10B981] font-medium'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                {fileName}
              </button>
            ))}
          </div>
        )}

        {/* Filtro de seções SQL */}
        {mode === 'sql' && (
          <div className="px-5 py-2.5 bg-[#0E1420] border-b border-[#1F2937] flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Script Completo' },
                { id: 'enums', label: '1. Enums (Posições & Maturação)' },
                { id: 'core', label: '2. Usuários, Clubes & Atletas' },
                { id: 'lgpd', label: '3. Consentimentos LGPD' },
                { id: 'biomechanics', label: '4. Sessões, 22 Pontos & Benchmarks' },
                { id: 'b2b', label: '5. Webhooks B2B & Auditoria' },
              ] as const
            ).map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSqlSection(sec.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sqlSection === sec.id
                    ? 'bg-[#1F2937] text-[#06B6D4] font-medium'
                    : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        )}

        {/* Code Viewer */}
        <pre className="p-5 bg-[#0B0F17] text-xs font-mono-tabular text-[#D1D5DB] overflow-x-auto max-h-[640px] leading-relaxed">
          <code>{visibleContent}</code>
        </pre>
      </section>
    </div>
  );
}
