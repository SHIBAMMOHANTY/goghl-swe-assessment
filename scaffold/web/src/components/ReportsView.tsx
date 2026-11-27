import { useEffect, useState } from 'react';
import { fetchReports, type ReportsResponse } from '../api';

interface ReportsViewProps {
  workspace: string;
}

type ReportsTab = 'overview' | 'agents' | 'conversations' | 'response';

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-800',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function exportCsv(report: ReportsResponse) {
  const rows: string[] = [
    'Section,Label,Value1,Value2,Value3',
    `Summary,Total Conversations,${report.summary.totalConversations},,`,
    `Summary,Resolved,${report.summary.resolved},${report.summary.resolutionRate}%`,
    `Summary,Open,${report.summary.open},,`,
    `Summary,Avg First Response (s),${report.summary.avgFirstResponseSec ?? ''},,`,
    `Summary,Avg Resolution (s),${report.summary.avgResolutionSec ?? ''},,`,
    ...report.volumeSeries.map(
      (d) => `Daily,${d.date},${d.conversations},${d.messages},${d.resolved}`
    ),
    ...report.agentPerformance.map(
      (a) => `Agent,"${a.name.replace(/"/g, '""')}",${a.conversations},${a.resolved},${a.resolutionRate}%`
    ),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `switchboard-report-${report.workspace}-${report.days}d.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsView({ workspace }: ReportsViewProps) {
  const [tab, setTab] = useState<ReportsTab>('overview');
  const [days, setDays] = useState<7 | 14 | 30>(7);
  const [report, setReport] = useState<ReportsResponse | null>(null);
  const [hoveredVolIdx, setHoveredVolIdx] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    void fetchReports(workspace, days)
      .then(setReport)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load analytics'));
  }, [workspace, days]);

  const s = report?.summary ?? {
    totalConversations: 0,
    resolved: 0,
    open: 0,
    assignedOpen: 0,
    unassigned: 0,
    resolutionRate: 0,
    avgFirstResponseSec: null,
    avgResolutionSec: null,
  };

  const series = report?.volumeSeries ?? [];
  const labelStride = series.length > 14 ? 5 : series.length > 7 ? 2 : 1;

  // Volume SVG geometry
  const W = 520;
  const H = 175;
  const padL = 32;
  const padR = 16;
  const padT = 18;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVol = Math.max(5, ...series.map((d) => d.conversations));
  const stepX = series.length > 1 ? plotW / (series.length - 1) : plotW;
  const volPoints = series.map((d, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - (d.conversations / maxVol) * plotH,
    ...d,
  }));
  const volLine = buildSmoothPath(volPoints);
  const volArea =
    volPoints.length > 0
      ? `${volLine} L ${volPoints[volPoints.length - 1].x} ${padT + plotH} L ${volPoints[0].x} ${padT + plotH} Z`
      : '';

  // Response time SVG geometry
  const maxSec = Math.max(
    60,
    ...series.flatMap((d) => [d.avgFirstResponseSec ?? 0, d.avgResolutionSec ?? 0])
  );
  const respPoints = series.map((d, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - ((d.avgFirstResponseSec ?? 0) / maxSec) * plotH,
  }));
  const resPoints = series.map((d, i) => ({
    x: padL + i * stepX,
    y: padT + plotH - ((d.avgResolutionSec ?? 0) / maxSec) * plotH,
  }));
  const respLine = buildSmoothPath(respPoints);
  const resLine = buildSmoothPath(resPoints);

  // Donut chart segments
  const totalForDonut = Math.max(1, s.totalConversations);
  const statusSlices = [
    { label: 'Resolved', value: s.resolved, color: '#22c55e', dot: 'bg-emerald-500' },
    { label: 'Assigned Open', value: s.assignedOpen, color: '#0ea5e9', dot: 'bg-sky-500' },
    { label: 'Unassigned', value: s.unassigned, color: '#8b5cf6', dot: 'bg-violet-500' },
  ];
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  const volumeChartCard = (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">Conversation Volume</h2>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">
        Total conversations over the last {days} days
      </p>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
          <defs>
            <linearGradient id="repVolFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((t) => {
            const y = padT + plotH - t * plotH;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {Math.round(t * maxVol)}
                </text>
              </g>
            );
          })}

          {volArea && <path d={volArea} fill="url(#repVolFill)" />}
          {volLine && (
            <path
              d={volLine}
              fill="none"
              stroke="#6d28d9"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          )}

          {volPoints.map((pt, i) => (
            <g key={pt.date}>
              {i % labelStride === 0 && (
                <text x={pt.x} y={H - 5} textAnchor="middle" fontSize="10" fill="#64748b">
                  {pt.label}
                </text>
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoveredVolIdx === i ? 5 : 3.5}
                fill="#6d28d9"
                stroke="#ffffff"
                strokeWidth="1.5"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredVolIdx(i)}
                onMouseLeave={() => setHoveredVolIdx(null)}
              />
            </g>
          ))}
        </svg>

        {hoveredVolIdx !== null && volPoints[hoveredVolIdx] && (
          <div className="absolute top-1 right-2 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs shadow-md pointer-events-none">
            <div className="font-bold text-slate-900">{volPoints[hoveredVolIdx].label}</div>
            <div className="text-slate-600">
              {volPoints[hoveredVolIdx].conversations} conversations ·{' '}
              {volPoints[hoveredVolIdx].messages} messages
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const statusDonutCard = (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
      <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-0 mb-3">
        Conversations by Status
      </h2>

      <div className="flex flex-col sm:flex-row items-center justify-around gap-4 my-auto">
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="16"
            />
            {s.totalConversations > 0 &&
              statusSlices.map((sl) => {
                const segLen = (sl.value / totalForDonut) * circumference;
                const dashOffset = -offsetAcc;
                offsetAcc += segLen;
                return (
                  <circle
                    key={sl.label}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={sl.color}
                    strokeWidth="16"
                    strokeDasharray={`${segLen} ${circumference - segLen}`}
                    strokeDashoffset={dashOffset}
                  />
                );
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-slate-900 leading-none">
              {s.totalConversations}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">Total</span>
          </div>
        </div>

        <div className="w-full sm:w-auto space-y-2.5 text-xs">
          {statusSlices.map((sl) => {
            const pct =
              s.totalConversations > 0
                ? Math.round((sl.value / s.totalConversations) * 1000) / 10
                : 0;
            return (
              <div key={sl.label} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className={`w-2.5 h-2.5 rounded-full ${sl.dot}`} />
                  {sl.label}
                </span>
                <span className="font-semibold text-slate-900">
                  {sl.value}{' '}
                  <span className="text-slate-400 font-normal">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );

  const responseTrendCard = (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
            Response Time Trend
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">
            Average first response and resolution time
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#6d28d9]" /> First Response
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-500" /> Resolution
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
        {[0, 0.5, 1].map((t) => {
          const y = padT + plotH - t * plotH;
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {formatDuration(Math.round(t * maxSec))}
              </text>
            </g>
          );
        })}

        {resLine && (
          <path d={resLine} fill="none" stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" />
        )}
        {respLine && (
          <path d={respLine} fill="none" stroke="#6d28d9" strokeWidth="2.2" strokeLinecap="round" />
        )}

        {series.map(
          (pt, i) =>
            i % labelStride === 0 && (
              <text
                key={pt.date}
                x={padL + i * stepX}
                y={H - 5}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
              >
                {pt.label}
              </text>
            )
        )}
      </svg>
    </section>
  );

  const agentTableCard = (limit?: number) => {
    const list =
      typeof limit === 'number'
        ? (report?.agentPerformance ?? []).slice(0, limit)
        : (report?.agentPerformance ?? []);
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
            Agent Performance {typeof limit === 'number' ? `(Top ${limit})` : ''}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2 font-semibold">Agent</th>
                <th className="py-2 font-semibold">Conversations</th>
                <th className="py-2 font-semibold">Resolved</th>
                <th className="py-2 font-semibold text-right">Resolution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    No agent metrics in this range yet.
                  </td>
                </tr>
              ) : (
                list.map((a, idx) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
                            AVATAR_TONES[idx % AVATAR_TONES.length]
                          }`}
                        >
                          {initials(a.name)}
                        </span>
                        <span className="font-semibold text-slate-900">{a.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 font-medium text-slate-800">{a.conversations}</td>
                    <td className="py-2.5 font-semibold text-emerald-700">
                      {a.resolved} ({a.resolutionRate}%)
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {formatDuration(a.avgResolutionSec)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6 space-y-5">
      {/* Section Tabs + Date Range Filter + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-5 overflow-x-auto">
          {(
            [
              ['overview', 'Overview'],
              ['agents', 'Agent Performance'],
              ['conversations', 'Conversation Reports'],
              ['response', 'Response Time'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`pb-2 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap cursor-pointer ${
                tab === id
                  ? 'border-[#602ee0] text-[#602ee0]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Date range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>

          <button
            type="button"
            disabled={!report}
            onClick={() => report && exportCsv(report)}
            className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-1.5 shadow-sm cursor-pointer"
          >
            &darr; Export CSV
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-[#f1ecfe] border border-violet-200/70 p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white/80 text-[#602ee0] grid place-items-center shrink-0">
            💬
          </span>
          <div>
            <div className="text-xl font-bold text-[#4c1d95] leading-none">
              {s.totalConversations}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">Total Conversations</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#eaf8f0] border border-emerald-200/70 p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white/80 text-emerald-600 grid place-items-center shrink-0">
            ✓
          </span>
          <div>
            <div className="text-xl font-bold text-emerald-700 leading-none">{s.resolved}</div>
            <div className="text-[11px] text-slate-600 mt-1">Resolved ({s.resolutionRate}%)</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#eaf4fd] border border-sky-200/70 p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white/80 text-sky-600 grid place-items-center shrink-0">
            ⚡
          </span>
          <div>
            <div className="text-xl font-bold text-sky-800 leading-none">
              {formatDuration(s.avgFirstResponseSec)}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">Avg. First Response</div>
          </div>
        </div>

        <div className="rounded-2xl bg-[#fef4e4] border border-amber-200/70 p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-white/80 text-amber-700 grid place-items-center shrink-0">
            ◷
          </span>
          <div>
            <div className="text-xl font-bold text-amber-800 leading-none">
              {formatDuration(s.avgResolutionSec)}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">Avg. Resolution Time</div>
          </div>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
            {volumeChartCard}
            {statusDonutCard}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {agentTableCard(5)}
            {responseTrendCard}
          </div>

          {/* Key Insights Strip */}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mt-0 mb-3">Key Insights</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-lg font-bold text-emerald-600">{s.resolutionRate}%</div>
                <div className="font-semibold text-slate-800">Overall resolution rate</div>
                <div className="text-[11px] text-slate-500">
                  {s.resolved} of {s.totalConversations} conversations
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-[#602ee0]">
                  {formatDuration(s.avgFirstResponseSec)}
                </div>
                <div className="font-semibold text-slate-800">First response speed</div>
                <div className="text-[11px] text-slate-500">Last {days} days average</div>
              </div>
              <div>
                <div className="text-lg font-bold text-sky-600">{s.unassigned}</div>
                <div className="font-semibold text-slate-800">Unassigned open queue</div>
                <div className="text-[11px] text-slate-500">Waiting for agent claim</div>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-700">{s.open}</div>
                <div className="font-semibold text-slate-800">Active open conversations</div>
                <div className="text-[11px] text-slate-500">{s.assignedOpen} currently assigned</div>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === 'agents' && agentTableCard()}

      {tab === 'conversations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
            {volumeChartCard}
            {statusDonutCard}
          </div>
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs overflow-x-auto">
            <h2 className="text-sm font-bold text-slate-900 mt-0 mb-3">Date-wise Breakdown</h2>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Conversations</th>
                  <th className="py-2 font-semibold">Messages</th>
                  <th className="py-2 font-semibold">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map((d) => (
                  <tr key={d.date}>
                    <td className="py-2 font-medium text-slate-800">{d.label}</td>
                    <td className="py-2">{d.conversations}</td>
                    <td className="py-2">{d.messages}</td>
                    <td className="py-2 text-emerald-700 font-semibold">{d.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === 'response' && (
        <div className="space-y-4">
          {responseTrendCard}
          <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs overflow-x-auto">
            <h2 className="text-sm font-bold text-slate-900 mt-0 mb-3">
              Daily Response &amp; Resolution Times
            </h2>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Avg. First Response</th>
                  <th className="py-2 font-semibold">Avg. Resolution Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map((d) => (
                  <tr key={d.date}>
                    <td className="py-2 font-medium text-slate-800">{d.label}</td>
                    <td className="py-2 text-[#602ee0] font-semibold">
                      {formatDuration(d.avgFirstResponseSec)}
                    </td>
                    <td className="py-2 text-sky-700 font-semibold">
                      {formatDuration(d.avgResolutionSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
