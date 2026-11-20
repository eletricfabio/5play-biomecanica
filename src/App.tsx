import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar, type AppView } from './components/Sidebar';
import { DashboardGeral } from './components/DashboardGeral';
import { AnaliseBiomecanica } from './components/AnaliseBiomecanica';
import { CadastroAtletaClube } from './components/CadastroAtletaClube';
import { RelatorioCompartilhadoB2B } from './components/RelatorioCompartilhadoB2B';
import { SchemaExplorerView } from './components/SchemaExplorerView';
import { ArtifactCodeView } from './components/ArtifactCodeView';

type ArchSubTab = 'erd' | 'sql' | 'docker' | 'python';

function extractUrlToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('token');
  if (queryToken && queryToken.trim().length > 0) return queryToken.trim();

  const pathMatch = window.location.pathname.match(/\/(?:relatorio|dossie)\/([a-fA-F0-9-]{8,64})/);
  return pathMatch ? pathMatch[1] : null;
}

function KinePitchStudioShell() {
  const { user, signInWithGoogle, logout, getToken } = useAuth();

  const [urlPublicToken, setUrlPublicToken] = useState<string | null>(() => extractUrlToken());
  const [activeView, setActiveView] = useState<AppView>(() =>
    extractUrlToken() ? 'relatorio' : 'dashboard'
  );
  const [selectedSessaoId, setSelectedSessaoId] = useState<number | null>(null);
  const [selectedPublicToken, setSelectedPublicToken] = useState<string | null>(urlPublicToken);

  const [counts, setCounts] = useState<{ atletas?: number; sessoes?: number }>({});

  // Etapa 1 & 2 Architecture Artifacts state (para a aba Arquitetura & API)
  const [archTab, setArchTab] = useState<ArchSubTab>('python');
  const [sqlScript, setSqlScript] = useState('');
  const [dockerCompose, setDockerCompose] = useState('');
  const [pythonFiles, setPythonFiles] = useState<Record<string, string>>({});
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [tableCounts, setTableCounts] = useState<Record<string, number> | null>(null);

  const loadArchitectureArtifacts = useCallback(async () => {
    if (sqlScript && Object.keys(pythonFiles).length > 0) return;
    setLoadingArtifacts(true);
    setArtifactError(null);
    try {
      const [stage1Res, stage2Res] = await Promise.all([
        fetch('/api/architecture/artifacts'),
        fetch('/api/stage2/artifacts'),
      ]);
      if (!stage1Res.ok || !stage2Res.ok) {
        throw new Error('Falha ao carregar artefatos de arquitetura.');
      }
      const [s1, s2] = await Promise.all([stage1Res.json(), stage2Res.json()]);
      setSqlScript(s1.sqlScript || '');
      setDockerCompose(s1.dockerCompose || '');
      setPythonFiles(s2.files || {});
    } catch (err) {
      setArtifactError(err instanceof Error ? err.message : 'Erro ao carregar artefatos.');
    } finally {
      setLoadingArtifacts(false);
    }
  }, [pythonFiles, sqlScript]);

  useEffect(() => {
    if (activeView === 'arquitetura') {
      void loadArchitectureArtifacts();
      if (user) {
        getToken().then((tok) => {
          if (!tok) return;
          fetch('/api/stage1/overview', {
            headers: { Authorization: `Bearer ${tok}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.counts) setTableCounts(d.counts);
            })
            .catch(() => {});
        });
      }
    }
  }, [activeView, getToken, loadArchitectureArtifacts, user]);

  // Se acessado via link público ?token=<uuid>, exibe diretamente o RelatorioCompartilhadoB2B sem sidebar administrativa
  if (urlPublicToken) {
    return (
      <div className="min-h-screen bg-[#0B0F17] text-[#E5E7EB]">
        <header className="border-b border-[#1F2937] bg-[#0F131C] px-6 h-16 flex items-center justify-between gap-6 print:hidden">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/logo_insta_perfil_br.png_acbb1053.png"
              alt="5Play Sports"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded object-contain bg-black"
            />
            <span className="text-sm font-bold text-[#F9FAFB]">
              5Play Sports · KinePitch AI Scouting B2B
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setUrlPublicToken(null);
              setActiveView('dashboard');
            }}
            className="px-3.5 py-1.5 text-xs font-medium bg-[#181C24] hover:bg-[#1F2937] border border-[#1F2937] text-[#E5E7EB] rounded-md cursor-pointer"
          >
            Entrar no Studio
          </button>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          <RelatorioCompartilhadoB2B
            initialToken={urlPublicToken}
            isPublicStandalone
            onExitPublicMode={() => {
              window.history.replaceState({}, '', '/');
              setUrlPublicToken(null);
              setActiveView('dashboard');
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E5E7EB] flex">
      <Sidebar
        activeView={activeView}
        onSelectView={(view) => setActiveView(view)}
        user={user}
        onSignIn={() => void signInWithGoogle()}
        onLogout={() => void logout()}
        counts={counts}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar Compacta (3 zonas) */}
        <header className="sticky top-0 z-30 h-16 border-b border-[#1F2937] bg-[#0B0F17]/95 backdrop-blur-md px-6 flex items-center justify-between gap-8">
          <div className="text-xs text-[#9CA3AF] truncate">
            <span className="text-[#F9FAFB] font-semibold">5Play Sports</span>
            <span className="mx-2">/</span>
            <span className="text-[#06B6D4]">
              {activeView === 'dashboard' && 'Dashboard Geral'}
              {activeView === 'analise' && 'Análise Biomecânica 3D'}
              {activeView === 'cadastro' && 'Cadastro & Elenco'}
              {activeView === 'relatorio' && 'Relatório Executivo B2B'}
              {activeView === 'arquitetura' && 'Arquitetura SQL, Docker & FastAPI'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!user && (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                Entrar com Google
              </button>
            )}
            {user && (
              <button
                type="button"
                onClick={() => setActiveView('analise')}
                className="px-3.5 py-1.5 text-xs font-medium text-[#E5E7EB] bg-[#111827] hover:bg-[#181C24] border border-[#1F2937] rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                Estúdio 22 Pontos
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6">
          {activeView === 'dashboard' && (
            <DashboardGeral
              isAuthenticated={Boolean(user)}
              onSignIn={() => void signInWithGoogle()}
              onNavigateView={(v) => setActiveView(v)}
              onOpenSessao3D={(sessaoId) => {
                setSelectedSessaoId(sessaoId);
                setActiveView('analise');
              }}
              onCountsChange={(c) => setCounts(c)}
            />
          )}

          {activeView === 'analise' && (
            <AnaliseBiomecanica
              isAuthenticated={Boolean(user)}
              onSignIn={() => void signInWithGoogle()}
              initialSessaoId={selectedSessaoId}
              onNavigateView={(v) => setActiveView(v)}
              onOpenPublicToken={(token) => {
                setSelectedPublicToken(token);
                setActiveView('relatorio');
              }}
            />
          )}

          {activeView === 'cadastro' && (
            <CadastroAtletaClube
              isAuthenticated={Boolean(user)}
              onSignIn={() => void signInWithGoogle()}
            />
          )}

          {activeView === 'relatorio' && (
            <RelatorioCompartilhadoB2B
              initialToken={selectedPublicToken}
              isAuthenticated={Boolean(user)}
            />
          )}

          {activeView === 'arquitetura' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1F2937] pb-4">
                <div>
                  <h1 className="text-xl font-bold text-[#F9FAFB]">
                    Arquitetura PostgreSQL, Docker &amp; Backend FastAPI
                  </h1>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Artefatos reais das Etapas 1 e 2 conectados ao ambiente de execução
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-lg">
                  {(
                    [
                      { id: 'python', label: 'Backend FastAPI' },
                      { id: 'erd', label: 'Modelo Relacional' },
                      { id: 'sql', label: 'Script SQL' },
                      { id: 'docker', label: 'Docker Compose' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setArchTab(item.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        archTab === item.id
                          ? 'bg-[#10B981] text-[#042116] font-semibold'
                          : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {archTab === 'erd' && (
                <SchemaExplorerView
                  counts={tableCounts}
                  onNavigateTab={(t) => {
                    if (t === 'operacao') setActiveView('cadastro');
                    else if (t === 'sql' || t === 'docker' || t === 'python') setArchTab(t);
                  }}
                />
              )}
              {archTab === 'sql' && (
                <ArtifactCodeView
                  mode="sql"
                  sqlScript={sqlScript}
                  dockerCompose={dockerCompose}
                  loading={loadingArtifacts}
                  error={artifactError}
                />
              )}
              {archTab === 'docker' && (
                <ArtifactCodeView
                  mode="docker"
                  sqlScript={sqlScript}
                  dockerCompose={dockerCompose}
                  loading={loadingArtifacts}
                  error={artifactError}
                />
              )}
              {archTab === 'python' && (
                <ArtifactCodeView
                  mode="python"
                  sqlScript={sqlScript}
                  dockerCompose={dockerCompose}
                  pythonFiles={pythonFiles}
                  loading={loadingArtifacts}
                  error={artifactError}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <KinePitchStudioShell />
    </AuthProvider>
  );
}
