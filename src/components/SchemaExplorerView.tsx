import { useMemo, useState } from 'react';
import { Database, Layers, ShieldCheck, Activity, ArrowRight } from 'lucide-react';
import {
  KEYPOINTS_22,
  POSICOES_CAMPO,
  SCHEMA_BLUEPRINT,
  type TableBlueprint,
} from '../data/schemaBlueprint';

interface SchemaExplorerViewProps {
  counts: Record<string, number> | null;
  onNavigateTab: (tab: 'sql' | 'docker' | 'operacao') => void;
}

type DomainFilter = 'all' | TableBlueprint['domainGroup'];

export function SchemaExplorerView({ counts, onNavigateTab }: SchemaExplorerViewProps) {
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
  const [selectedTableName, setSelectedTableName] = useState<string>('atletas');

  const filteredTables = useMemo(() => {
    if (domainFilter === 'all') return SCHEMA_BLUEPRINT;
    return SCHEMA_BLUEPRINT.filter((t) => t.domainGroup === domainFilter);
  }, [domainFilter]);

  const selectedTable = useMemo(() => {
    return (
      SCHEMA_BLUEPRINT.find((t) => t.name === selectedTableName) ?? SCHEMA_BLUEPRINT[0]
    );
  }, [selectedTableName]);

  return (
    <div className="space-y-8">
      {/* Resumo Estrutural da Etapa 1 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <div className="text-xs text-[#9CA3AF] font-medium">Modelo Relacional</div>
          <div className="mt-2 text-2xl font-bold text-[#F9FAFB] tabular-nums">
            10 Tabelas · 13 Enums
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            PostgreSQL 16 com integridade referencial
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <div className="text-xs text-[#9CA3AF] font-medium">Posições &amp; Maturação</div>
          <div className="mt-2 text-2xl font-bold text-[#06B6D4] tabular-nums">
            7 Posições · 3 Estágios PVC
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            Antropometria + offset Mirwald calculado
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <div className="text-xs text-[#9CA3AF] font-medium">Cinemática &amp; KPIs</div>
          <div className="mt-2 text-2xl font-bold text-[#10B981] tabular-nums">
            22 Pontos · 4 KPIs
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            IPB, SPE, IETP, IPS + micro-ângulos 3D
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <div className="text-xs text-[#9CA3AF] font-medium">Compliance &amp; B2B</div>
          <div className="mt-2 text-2xl font-bold text-[#F59E0B] tabular-nums">
            LGPD Menores · HMAC
          </div>
          <div className="mt-1 text-xs text-[#9CA3AF]">
            Termo obrigatório &lt; 18 anos e webhooks
          </div>
        </div>
      </section>

      {/* Filtros de Domínio */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1F2937] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-[#F9FAFB]">
            01. Catálogo de Entidades do Banco de Dados
          </h2>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Selecione qualquer tabela para inspecionar colunas, restrições e telas alimentadas.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-lg overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Todas (10)' },
              { id: 'Identidade & Clubes', label: 'Identidade & Clubes' },
              { id: 'Biomecânica 3D & IA', label: 'Biomecânica 3D & IA' },
              { id: 'Compliance & B2B', label: 'Compliance & B2B' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDomainFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                domainFilter === tab.id
                  ? 'bg-[#1F2937] text-[#F9FAFB]'
                  : 'text-[#9CA3AF] hover:text-[#F9FAFB]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Master-Detail: Lista de Tabelas + Inspetor */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista de Tabelas */}
        <div className="lg:col-span-5 space-y-2">
          {filteredTables.map((table) => {
            const isSelected = table.name === selectedTable.name;
            const rowCount = counts ? counts[table.name] : undefined;

            return (
              <button
                key={table.name}
                type="button"
                onClick={() => setSelectedTableName(table.name)}
                className={`w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#161E2E] border-[#06B6D4]'
                    : 'bg-[#111827] border-[#1F2937] hover:border-[#374151]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-sm font-semibold text-[#F9FAFB]">
                    {table.name}
                  </span>
                  <span className="font-mono-tabular text-xs text-[#9CA3AF]">
                    {rowCount !== undefined ? `${rowCount} registros` : table.domainGroup}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#9CA3AF] leading-relaxed">
                  {table.title}
                </div>
                <div className="mt-2 text-[11px] text-[#6B7280]">
                  Telas: {table.feedsScreens.join(' · ')}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detalhe da Tabela Selecionada */}
        <div className="lg:col-span-7 bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#1F2937] pb-4">
            <div>
              <div className="text-xs text-[#06B6D4] font-medium">
                {selectedTable.domainGroup}
              </div>
              <h3 className="text-xl font-bold text-[#F9FAFB] font-mono-tabular mt-1">
                public.{selectedTable.name}
              </h3>
              <p className="text-sm text-[#9CA3AF] mt-2 leading-relaxed">
                {selectedTable.summary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('sql')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#1F2937] hover:bg-[#374151] text-[#F9FAFB] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Ver no DDL SQL</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Relações e Telas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-3.5">
              <div className="text-[#9CA3AF] font-medium mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#06B6D4]" />
                <span>Relacionamentos</span>
              </div>
              <div className="font-mono-tabular text-[#E5E7EB] space-y-1">
                {selectedTable.relations.map((rel) => (
                  <div key={rel}>{rel}</div>
                ))}
              </div>
            </div>

            <div className="bg-[#0B0F17] border border-[#1F2937] rounded-md p-3.5">
              <div className="text-[#9CA3AF] font-medium mb-1.5 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Telas Alimentadas</span>
              </div>
              <div className="text-[#E5E7EB] space-y-1">
                {selectedTable.feedsScreens.map((scr) => (
                  <div key={scr}>{scr}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela de Colunas */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1F2937] text-xs text-[#9CA3AF]">
                  <th className="py-2.5 pr-4 font-medium">Coluna</th>
                  <th className="py-2.5 pr-4 font-medium">Tipo PostgreSQL</th>
                  <th className="py-2.5 pr-4 font-medium">Restrição</th>
                  <th className="py-2.5 font-medium">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]/70 text-xs">
                {selectedTable.columns.map((col) => (
                  <tr key={col.name} className="hover:bg-[#161E2E]/60">
                    <td className="py-2.5 pr-4 font-mono-tabular text-[#F9FAFB] font-medium">
                      {col.name}
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular text-[#06B6D4]">
                      {col.type}
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular text-[#9CA3AF]">
                      {col.constraints}
                    </td>
                    <td className="py-2.5 text-[#D1D5DB]">{col.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Especificação do Domínio: 7 Posições, 4 KPIs e 22 Pontos Ópticos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              <span>Posições Táticas (posicao_campo_enum) &amp; KPIs</span>
            </h3>
            <span className="font-mono-tabular text-xs text-[#9CA3AF]">7 posições</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {POSICOES_CAMPO.map((pos) => (
              <div
                key={pos.value}
                className="bg-[#0B0F17] border border-[#1F2937] rounded-md px-3 py-2"
              >
                <div className="font-mono-tabular text-xs text-[#06B6D4]">{pos.code}</div>
                <div className="text-sm font-medium text-[#F9FAFB]">{pos.label}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#1F2937] pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="font-mono-tabular font-semibold text-[#10B981]">IPB</div>
              <div className="text-[#9CA3AF]">Prontidão Biomecânica</div>
            </div>
            <div>
              <div className="font-mono-tabular font-semibold text-[#06B6D4]">SPE</div>
              <div className="text-[#9CA3AF]">Potência &amp; Explosão</div>
            </div>
            <div>
              <div className="font-mono-tabular font-semibold text-[#10B981]">IETP</div>
              <div className="text-[#9CA3AF]">Eficiência Técnica</div>
            </div>
            <div>
              <div className="font-mono-tabular font-semibold text-[#F59E0B]">IPS</div>
              <div className="text-[#9CA3AF]">Potencial Scouting</div>
            </div>
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#F9FAFB] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#06B6D4]" />
              <span>Mapa dos 22 Marcadores Ópticos (JSONB 3D)</span>
            </h3>
            <span className="font-mono-tabular text-xs text-[#9CA3AF]">OpenCap / KinePitch</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 font-mono-tabular text-xs text-[#D1D5DB]">
            {KEYPOINTS_22.map((kp) => (
              <div key={kp} className="py-0.5 border-b border-[#1F2937]/60">
                {kp}
              </div>
            ))}
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#9CA3AF]">
              Armazenados com coordenadas (x, y, z) e confiança percentual por frame-chave.
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('operacao')}
              className="px-3.5 py-2 text-xs font-semibold bg-[#10B981] hover:bg-[#059669] text-[#042116] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Testar Persistência Real
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
