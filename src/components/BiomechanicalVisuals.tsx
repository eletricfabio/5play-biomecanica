import { useState } from 'react';
import type { BenchmarkItem, PontoOptico3D } from '../services/api';

const SKELETON_BONES: Array<[string, string, 'axial' | 'left' | 'right']> = [
  ['cabeca', 'pescoco', 'axial'],
  ['pescoco', 'ombro_dir', 'right'],
  ['pescoco', 'ombro_esq', 'left'],
  ['ombro_dir', 'ombro_esq', 'axial'],
  ['ombro_dir', 'cotovelo_dir', 'right'],
  ['cotovelo_dir', 'punho_dir', 'right'],
  ['punho_dir', 'mao_dir', 'right'],
  ['ombro_esq', 'cotovelo_esq', 'left'],
  ['cotovelo_esq', 'punho_esq', 'left'],
  ['punho_esq', 'mao_esq', 'left'],
  ['pescoco', 'lombar', 'axial'],
  ['lombar', 'sacro', 'axial'],
  ['sacro', 'quadril_dir', 'right'],
  ['sacro', 'quadril_esq', 'left'],
  ['quadril_dir', 'quadril_esq', 'axial'],
  ['quadril_dir', 'joelho_dir', 'right'],
  ['joelho_dir', 'tornozelo_dir', 'right'],
  ['tornozelo_dir', 'calcanhar_dir', 'right'],
  ['tornozelo_dir', 'halux_dir', 'right'],
  ['calcanhar_dir', 'halux_dir', 'right'],
  ['quadril_esq', 'joelho_esq', 'left'],
  ['joelho_esq', 'tornozelo_esq', 'left'],
  ['tornozelo_esq', 'calcanhar_esq', 'left'],
  ['tornozelo_esq', 'halux_esq', 'left'],
  ['calcanhar_esq', 'halux_esq', 'left'],
];

export function Skeleton22PointsCanvas({
  pontos,
  framePhase = 0,
  showOverlay = true,
  alertaAssimetria = false,
  videoSrc,
  compact = false,
}: {
  pontos: Record<string, PontoOptico3D> | null | undefined;
  framePhase?: number;
  showOverlay?: boolean;
  alertaAssimetria?: boolean;
  videoSrc?: string | null;
  compact?: boolean;
}) {
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);

  const entries = pontos ? Object.entries(pontos) : [];
  if (entries.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0B0F17] text-xs text-[#9CA3AF] p-6 text-center">
        Nenhuma malha de 22 pontos disponível nesta sessão.
      </div>
    );
  }

  // Normaliza coordenadas da câmera (ex: 1280x720) para viewBox 800x450
  const xs = entries.map(([, p]) => p.x);
  const ys = entries.map(([, p]) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 80);
  const spanY = Math.max(maxY - minY, 160);

  const mapPoint = (name: string, p: PontoOptico3D) => {
    // Leve deslocamento cinemático proporcional ao scrubber de tempo quando ativo
    const phaseWave = Math.sin(framePhase * Math.PI * 2);
    const isLowerLimb =
      name.includes('joelho') ||
      name.includes('tornozelo') ||
      name.includes('calcanhar') ||
      name.includes('halux');
    const isArm =
      name.includes('cotovelo') || name.includes('punho') || name.includes('mao');
    const dx = isLowerLimb ? (name.includes('esq') ? phaseWave * 14 : -phaseWave * 14) : isArm ? phaseWave * 8 : 0;
    const dy = isLowerLimb ? Math.abs(phaseWave) * -8 : 0;

    const normX = 400 + ((p.x - (minX + spanX / 2)) / spanX) * (compact ? 170 : 210) + dx;
    const normY = 58 + ((p.y - minY) / spanY) * (compact ? 290 : 330) + dy;
    return { cx: normX, cy: normY, raw: p };
  };

  const mapped: Record<string, { cx: number; cy: number; raw: PontoOptico3D }> = {};
  for (const [key, pt] of entries) {
    mapped[key] = mapPoint(key, pt);
  }

  const activeJointInfo = hoveredJoint && mapped[hoveredJoint] ? mapped[hoveredJoint] : null;

  return (
    <div className="relative w-full h-full bg-[#090D14] overflow-hidden select-none">
      {videoSrc ? (
        <video
          src={videoSrc}
          controls
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 50% 42%, rgba(6, 182, 212, 0.09), rgba(11, 15, 23, 0.96) 72%), linear-gradient(rgba(16, 185, 129, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.05) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 40px 40px, 40px 40px',
          }}
        />
      )}

      {showOverlay && (
        <svg
          viewBox="0 0 800 450"
          className={`absolute inset-0 w-full h-full ${videoSrc ? 'pointer-events-none' : ''}`}
          role="img"
          aria-label="Overlay biomecânico de 22 pontos articulares"
        >
          {/* Plano de chão calibrado */}
          <ellipse
            cx="400"
            cy="402"
            rx="165"
            ry="24"
            fill="none"
            stroke="rgba(16, 185, 129, 0.28)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1="200"
            y1="402"
            x2="600"
            y2="402"
            stroke="rgba(6, 182, 212, 0.25)"
            strokeWidth="1"
          />

          {/* Conexões ósseas */}
          {SKELETON_BONES.map(([a, b, side]) => {
            const pA = mapped[a];
            const pB = mapped[b];
            if (!pA || !pB) return null;
            const strokeColor =
              alertaAssimetria && side === 'left' && (a.includes('joelho') || b.includes('joelho'))
                ? '#F59E0B'
                : side === 'axial'
                  ? '#10B981'
                  : side === 'right'
                    ? '#06B6D4'
                    : '#34D399';
            return (
              <line
                key={`${a}-${b}`}
                x1={pA.cx}
                y1={pA.cy}
                x2={pB.cx}
                y2={pB.cy}
                stroke={strokeColor}
                strokeWidth={compact ? 2.2 : 2.6}
                strokeLinecap="round"
                opacity={0.9}
              />
            );
          })}

          {/* 22 Pontos Articulares */}
          {Object.entries(mapped).map(([name, pt]) => {
            const isKneeAlert = alertaAssimetria && name.includes('joelho');
            const fill = isKneeAlert ? '#F59E0B' : name === hoveredJoint ? '#FFFFFF' : '#06B6D4';
            return (
              <g
                key={name}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredJoint(name)}
                onMouseLeave={() => setHoveredJoint(null)}
              >
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r={compact ? 5.5 : 7}
                  fill={isKneeAlert ? 'rgba(245, 158, 11, 0.22)' : 'rgba(6, 182, 212, 0.22)'}
                />
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r={compact ? 3 : 3.8}
                  fill={fill}
                  stroke="#0B0F17"
                  strokeWidth="1.2"
                />
              </g>
            );
          })}
        </svg>
      )}

      {activeJointInfo && hoveredJoint && (
        <div className="absolute top-3 right-3 bg-[#111827]/95 border border-[#1F2937] rounded-md px-3 py-2 text-xs pointer-events-none">
          <div className="font-semibold text-[#F9FAFB]">{hoveredJoint.replace(/_/g, ' ')}</div>
          <div className="font-mono-tabular text-[#06B6D4] mt-0.5">
            X:{activeJointInfo.raw.x} · Y:{activeJointInfo.raw.y} · Z:{activeJointInfo.raw.z.toFixed(2)}m
          </div>
          <div className="font-mono-tabular text-[#10B981]">
            Confiança: {(activeJointInfo.raw.confianca * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}

export function KpiRadialGauge({
  sigla,
  titulo,
  valor,
  subtitulo,
  accentColor,
  size = 'md',
}: {
  sigla: string;
  titulo: string;
  valor: number | null | undefined;
  subtitulo: string;
  accentColor: string;
  size?: 'md' | 'lg';
}) {
  const numericVal = typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : 0;
  const radius = size === 'lg' ? 42 : 36;
  const viewSize = size === 'lg' ? 104 : 88;
  const center = viewSize / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (numericVal / 100) * circumference;

  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-4 flex flex-col items-center text-center">
      <div className="relative flex items-center justify-center" style={{ width: viewSize, height: viewSize }}>
        <svg width={viewSize} height={viewSize} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1F2937"
            strokeWidth={size === 'lg' ? 7 : 6}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth={size === 'lg' ? 7 : 6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={valor !== null && valor !== undefined ? dashOffset : circumference}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-bold font-mono-tabular text-[#F9FAFB] ${
              size === 'lg' ? 'text-xl' : 'text-lg'
            }`}
          >
            {valor !== null && valor !== undefined ? numericVal.toFixed(1) : '--'}
          </span>
          <span className="text-[10px] font-semibold tracking-wider text-[#9CA3AF]">{sigla}</span>
        </div>
      </div>
      <div className="mt-2.5 text-xs font-semibold text-[#F9FAFB]">{titulo}</div>
      <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{subtitulo}</div>
    </div>
  );
}

export function RadarBenchmarkChart({
  atletaScores,
  categoriaBenchmark,
  proBenchmark,
}: {
  atletaScores: {
    velocidade: number;
    spe: number;
    ietp: number;
    ipb: number;
    ips: number;
  };
  categoriaBenchmark: BenchmarkItem | null;
  proBenchmark: BenchmarkItem | null;
}) {
  const axes = [
    { key: 'velocidade', label: 'Velocidade' },
    { key: 'spe', label: 'Potência (SPE)' },
    { key: 'ietp', label: 'Eficiência (IETP)' },
    { key: 'ipb', label: 'Prontidão (IPB)' },
    { key: 'ips', label: 'Scouting (IPS)' },
  ] as const;

  const cx = 160;
  const cy = 148;
  const maxR = 96;

  const getCoords = (index: number, valuePct: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / axes.length;
    const r = (Math.max(0, Math.min(100, valuePct)) / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const toPointsString = (vals: number[]) =>
    vals
      .map((v, idx) => {
        const { x, y } = getCoords(idx, v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const athletePolygon = toPointsString([
    atletaScores.velocidade,
    atletaScores.spe,
    atletaScores.ietp,
    atletaScores.ipb,
    atletaScores.ips,
  ]);

  const catPolygon = categoriaBenchmark
    ? toPointsString([
        Math.min(100, (categoriaBenchmark.vmax_kmh / 36) * 100),
        categoriaBenchmark.spe_medio,
        categoriaBenchmark.ietp_medio,
        categoriaBenchmark.ipb_medio,
        categoriaBenchmark.ips_medio,
      ])
    : null;

  const proPolygon = proBenchmark
    ? toPointsString([
        Math.min(100, (proBenchmark.vmax_kmh / 36) * 100),
        proBenchmark.spe_medio,
        proBenchmark.ietp_medio,
        proBenchmark.ipb_medio,
        proBenchmark.ips_medio,
      ])
    : null;

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 290" className="w-full max-w-[340px] mx-auto overflow-visible">
        {[20, 40, 60, 80, 100].map((ring) => (
          <polygon
            key={ring}
            points={toPointsString(axes.map(() => ring))}
            fill="none"
            stroke="#1F2937"
            strokeWidth="1"
          />
        ))}
        {axes.map((ax, idx) => {
          const end = getCoords(idx, 100);
          const lbl = getCoords(idx, 122);
          return (
            <g key={ax.key}>
              <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#1F2937" strokeWidth="1" />
              <text
                x={lbl.x}
                y={lbl.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9CA3AF"
                fontSize="10"
                fontWeight="500"
              >
                {ax.label}
              </text>
            </g>
          );
        })}

        {proPolygon && (
          <polygon
            points={proPolygon}
            fill="rgba(148, 163, 184, 0.06)"
            stroke="#94A3B8"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {catPolygon && (
          <polygon
            points={catPolygon}
            fill="rgba(16, 185, 129, 0.10)"
            stroke="#10B981"
            strokeWidth="1.8"
            strokeDasharray="5 3"
          />
        )}

        <polygon
          points={athletePolygon}
          fill="rgba(6, 182, 212, 0.22)"
          stroke="#06B6D4"
          strokeWidth="2.2"
        />
        {[
          atletaScores.velocidade,
          atletaScores.spe,
          atletaScores.ietp,
          atletaScores.ipb,
          atletaScores.ips,
        ].map((v, idx) => {
          const pt = getCoords(idx, v);
          return (
            <circle
              key={axes[idx].key}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#06B6D4"
              stroke="#0B0F17"
              strokeWidth="1.2"
            />
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#9CA3AF]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#06B6D4]" />
          <span className="text-[#F9FAFB]">Atleta</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#10B981]" />
          <span>
            {categoriaBenchmark
              ? `Categoria (${categoriaBenchmark.nivel_referencia.replace(/_/g, ' ')})`
              : 'Categoria (não cadastrado)'}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#94A3B8]" />
          <span>
            {proBenchmark
              ? `Profissional (${proBenchmark.nivel_referencia.replace(/_/g, ' ')})`
              : 'Profissional (não cadastrado)'}
          </span>
        </span>
      </div>
    </div>
  );
}
