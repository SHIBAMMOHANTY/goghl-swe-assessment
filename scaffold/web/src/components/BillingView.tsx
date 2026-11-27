import { useCallback, useEffect, useState } from 'react';
import {
  fetchBilling,
  updateBilling,
  type BillingPlanId,
  type BillingResponse,
  type MeResponse,
} from '../api';

interface BillingViewProps {
  me: MeResponse;
  workspace: string;
}

type BillingTab = 'overview' | 'plans' | 'seats' | 'history';

const PLANS: Array<{
  id: BillingPlanId;
  name: string;
  tagline: string;
  monthlyInr: number | null;
  seatsLabel: string;
  popular?: boolean;
  features: string[];
}> = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Essential tools for small teams.',
    monthlyInr: 1499,
    seatsLabel: 'Up to 3 seats',
    features: [
      'Up to 3 seats',
      '5,000 conversations / month',
      'WhatsApp & Email',
      'Basic reports',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Everything you need to scale support.',
    monthlyInr: 3999,
    seatsLabel: 'Up to 10 seats',
    popular: true,
    features: [
      'Up to 10 seats',
      'Unlimited conversations',
      'All messaging channels',
      'Reports & analytics',
      'Integrations & API',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Advanced controls for larger organizations.',
    monthlyInr: null,
    seatsLabel: 'Unlimited seats',
    features: [
      'Unlimited seats',
      'Unlimited conversations',
      'Advanced analytics',
      'SSO & security controls',
      'Dedicated support',
    ],
  },
];

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
];

function formatInr(amount: number, decimals = 0): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function downloadInvoiceText(
  workspace: string,
  inv: BillingResponse['billing']['invoices'][number]
) {
  const lines = [
    'Switchboard — Tax Invoice / Receipt',
    '====================================',
    `Invoice ID : ${inv.id}`,
    `Workspace  : ${workspace}`,
    `Date       : ${new Date(inv.date).toLocaleDateString('en-IN')}`,
    `Plan       : ${inv.planLabel}`,
    `Amount     : ${formatInr(inv.amountInr, 2)}`,
    `Status     : ${inv.status}`,
    '',
    'Note: Illustrative billing receipt for local Switchboard UI.',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inv.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BillingView({ me, workspace }: BillingViewProps) {
  const [tab, setTab] = useState<BillingTab>('overview');
  const [data, setData] = useState<BillingResponse | null>(null);
  const [cyclePreview, setCyclePreview] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = me.workspaces.find((w) => w.id === workspace)?.role === 'admin';

  const loadBilling = useCallback(async () => {
    try {
      const res = await fetchBilling(workspace);
      setData(res);
      setCyclePreview(res.billing.cycle);
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to load billing',
      });
    }
  }, [workspace]);

  useEffect(() => {
    setFeedback(null);
    void loadBilling();
  }, [loadBilling]);

  async function applyBillingPatch(
    patch: Partial<{ plan: BillingPlanId; cycle: 'monthly' | 'annual'; totalSeats: number }>,
    okMsg: string
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      await updateBilling(workspace, patch);
      setFeedback({ kind: 'ok', text: okMsg });
      await loadBilling();
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Failed to update billing',
      });
    } finally {
      setBusy(false);
    }
  }

  const billing = data?.billing;
  const activePlan =
    PLANS.find((p) => p.id === (billing?.plan ?? 'professional')) ?? PLANS[1];
  const activeUnitPrice = activePlan.monthlyInr
    ? billing?.cycle === 'annual'
      ? Math.round(activePlan.monthlyInr * 0.8)
      : activePlan.monthlyInr
    : 9999;

  const usedSeats = data?.usage.usedSeats ?? 0;
  const totalSeats = billing?.totalSeats ?? 10;
  const seatPct = Math.min(100, Math.round((usedSeats / Math.max(1, totalSeats)) * 100));
  const convCount = data?.usage.conversations ?? 0;
  const convLimit = billing?.plan === 'starter' ? 5000 : null;
  const convPct = convLimit ? Math.min(100, Math.round((convCount / convLimit) * 100)) : 65;
  const msgCount = data?.usage.messages ?? 0;
  const msgPct = Math.min(100, Math.max(8, Math.round((msgCount / 100) * 100)));

  const plansSection = (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
            Subscription Plans
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">
            Choose a plan that fits your team&apos;s needs (prices in INR ₹).
          </p>
        </div>

        {/* Monthly / Annual Toggle */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setCyclePreview('monthly')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
              cyclePreview === 'monthly'
                ? 'bg-[#602ee0] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCyclePreview('annual')}
            className={`rounded-lg px-3 py-1 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              cyclePreview === 'annual'
                ? 'bg-[#602ee0] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Annual</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                cyclePreview === 'annual'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              Save 20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {PLANS.map((p) => {
          const isCurrent = billing?.plan === p.id && billing?.cycle === cyclePreview;
          const displayPrice =
            p.monthlyInr === null
              ? null
              : cyclePreview === 'annual'
                ? Math.round(p.monthlyInr * 0.8)
                : p.monthlyInr;

          return (
            <div
              key={p.id}
              className={`relative rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all ${
                p.popular
                  ? 'border-2 border-[#602ee0] bg-gradient-to-b from-violet-50/40 to-white shadow-md shadow-indigo-950/5'
                  : 'border border-slate-200 bg-white'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#602ee0] text-white px-3 py-0.5 text-[10px] font-bold">
                  Most Popular
                </span>
              )}

              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="w-8 h-8 rounded-lg bg-violet-100 text-[#602ee0] grid place-items-center text-sm">
                    {p.id === 'starter' ? '⚡' : p.id === 'professional' ? '👑' : '🏢'}
                  </span>
                  <div>
                    <div className="font-bold text-sm text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-slate-500">{p.tagline}</div>
                  </div>
                </div>

                <div className="my-3">
                  {displayPrice !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-900">
                        {formatInr(displayPrice)}
                      </span>
                      <span className="text-xs text-slate-500">/month</span>
                    </div>
                  ) : (
                    <div className="text-xl font-bold text-slate-900">Custom pricing</div>
                  )}
                </div>

                <ul className="space-y-2 text-xs text-slate-700 list-none p-0 m-0">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={busy || isCurrent || !isAdmin}
                onClick={() =>
                  void applyBillingPatch(
                    { plan: p.id, cycle: cyclePreview },
                    `Switched to ${p.name} (${cyclePreview})`
                  )
                }
                className={`w-full rounded-xl py-2 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'bg-gradient-to-r from-[#6532eb] to-[#5624d6] text-white'
                    : p.popular
                      ? 'bg-[#602ee0] hover:bg-[#4e22c2] text-white disabled:opacity-50'
                      : 'border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] text-slate-800 disabled:opacity-50'
                }`}
              >
                {isCurrent
                  ? '✓ Current Plan'
                  : p.id === 'enterprise'
                    ? 'Select Enterprise'
                    : `Choose ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#f6f7fc] p-4 sm:p-6 pb-16 lg:pb-6 space-y-5">
      <div className="flex items-center gap-5 border-b border-slate-200 overflow-x-auto">
        {(
          [
            ['overview', 'Overview'],
            ['plans', 'Plans'],
            ['seats', 'Seats'],
            ['history', 'Payment History'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`pb-2.5 text-xs sm:text-[13px] font-semibold border-b-2 whitespace-nowrap cursor-pointer ${
              tab === id
                ? 'border-[#602ee0] text-[#602ee0]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`rounded-xl px-4 py-2.5 text-xs font-medium border ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800">
          Signed in as <strong>agent</strong> — only workspace admins can modify plans or seat
          allocations.
        </div>
      )}

      {tab === 'overview' && (
        <>
          {/* Top Row: Current Subscription + Usage This Cycle */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
            <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                  Current Subscription
                </h2>
                <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold">
                  {billing?.status ?? 'Active'}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <span className="w-12 h-12 rounded-2xl bg-violet-100 text-[#602ee0] grid place-items-center text-xl shrink-0">
                    👑
                  </span>
                  <div>
                    <div className="font-bold text-base text-slate-900">
                      {activePlan.name} Plan
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Billed {billing?.cycle ?? 'monthly'} · Next billing:{' '}
                      {billing
                        ? new Date(billing.nextBillingAt).toLocaleDateString('en-IN')
                        : '—'}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="text-xl font-bold text-slate-900">
                        {formatInr(activeUnitPrice)}
                      </span>
                      <span className="text-xs text-slate-500">/month</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('plans')}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Manage Plan
                  </button>
                  <button
                    type="button"
                    disabled={busy || !isAdmin || billing?.plan === 'enterprise'}
                    onClick={() => setTab('plans')}
                    className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    &uarr; Upgrade
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
                {activePlan.features.slice(0, 4).map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5">
                    <span className="text-emerald-600 font-bold">✓</span> {f}
                  </span>
                ))}
              </div>
            </section>

            {/* Usage This Cycle */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                  Usage This Cycle
                </h2>
                <span className="text-[11px] text-slate-400">Current month</span>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-700">Seats</span>
                    <span className="text-slate-500">
                      {usedSeats} of {totalSeats} used ({seatPct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6532eb] to-[#8b5cf6]"
                      style={{ width: `${seatPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-700">Conversations</span>
                    <span className="text-slate-500">
                      {convCount} / {convLimit ?? 'Unlimited'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6532eb] to-[#8b5cf6]"
                      style={{ width: `${convPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold text-slate-700">Messages Exchanged</span>
                    <span className="text-slate-500">{msgCount} msgs</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6532eb] to-[#8b5cf6]"
                      style={{ width: `${msgPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Bottom Row: Subscription Plans + Manage Seats + Payment History */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 items-start">
            {plansSection}

            <div className="space-y-4">
              {/* Manage Seats Preview Card */}
              <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 m-0">Manage Seats</h2>
                  <button
                    type="button"
                    onClick={() => setTab('seats')}
                    className="text-xs font-semibold text-[#602ee0] hover:underline cursor-pointer"
                  >
                    Manage Seats &rarr;
                  </button>
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900 mb-1.5">
                    {usedSeats} <span className="text-xs font-normal text-slate-500">/ {totalSeats} seats used</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6532eb] to-[#8b5cf6]"
                      style={{ width: `${seatPct}%` }}
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {(data?.members ?? []).slice(0, 3).map((m, idx) => (
                    <div key={m.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
                            AVATAR_TONES[idx % AVATAR_TONES.length]
                          }`}
                        >
                          {initials(m.name)}
                        </span>
                        <span className="font-medium text-slate-900 truncate">{m.name}</span>
                      </div>
                      <span className="rounded-full bg-violet-100 text-[#602ee0] px-2 py-0.5 text-[10px] font-semibold capitalize">
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Payment History Preview Card */}
              <section className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 m-0">Payment History</h2>
                  <button
                    type="button"
                    onClick={() => setTab('history')}
                    className="text-xs font-semibold text-[#602ee0] hover:underline cursor-pointer"
                  >
                    View All &rarr;
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="py-1.5 font-semibold">Date</th>
                        <th className="py-1.5 font-semibold">Plan</th>
                        <th className="py-1.5 font-semibold">Amount</th>
                        <th className="py-1.5 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(billing?.invoices ?? []).slice(0, 3).map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-2 text-slate-700">
                            {new Date(inv.date).toLocaleDateString('en-IN')}
                          </td>
                          <td className="py-2 text-slate-600">{inv.planLabel}</td>
                          <td className="py-2 font-semibold text-slate-900">
                            {formatInr(inv.amountInr, 2)}
                          </td>
                          <td className="py-2 text-right">
                            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold">
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {tab === 'plans' && plansSection}

      {tab === 'seats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
              <div className="text-xs text-slate-500">Total Seats</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{totalSeats}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
              <div className="text-xs text-slate-500">Used Seats</div>
              <div className="text-2xl font-bold text-[#602ee0] mt-1">{usedSeats}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4">
              <div className="text-xs text-slate-500">Available Seats</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {Math.max(0, totalSeats - usedSeats)}
              </div>
            </div>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                  Seat Allocation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 mb-0">
                  Adjust seat capacity for {workspace}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !isAdmin || totalSeats <= Math.max(1, usedSeats)}
                  onClick={() =>
                    void applyBillingPatch(
                      { totalSeats: totalSeats - 1 },
                      `Updated seat allocation to ${totalSeats - 1}`
                    )
                  }
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  -
                </button>
                <span className="px-3 text-sm font-bold text-slate-900">{totalSeats} seats</span>
                <button
                  type="button"
                  disabled={busy || !isAdmin}
                  onClick={() =>
                    void applyBillingPatch(
                      { totalSeats: totalSeats + 1 },
                      `Updated seat allocation to ${totalSeats + 1}`
                    )
                  }
                  className="w-8 h-8 rounded-lg bg-[#602ee0] text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {(data?.members ?? []).map((m, idx) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold ${
                        AVATAR_TONES[idx % AVATAR_TONES.length]
                      }`}
                    >
                      {initials(m.name)}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-[11px] text-slate-500">{m.email}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-violet-100 text-[#602ee0] px-2.5 py-0.5 text-[11px] font-semibold capitalize">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'history' && (
        <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs overflow-x-auto">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 mt-0 mb-3">
            Payment History (INR)
          </h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2.5 font-semibold">Invoice</th>
                <th className="py-2.5 font-semibold">Date</th>
                <th className="py-2.5 font-semibold">Plan</th>
                <th className="py-2.5 font-semibold">Amount</th>
                <th className="py-2.5 font-semibold">Status</th>
                <th className="py-2.5 font-semibold text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(billing?.invoices ?? []).map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 font-mono text-slate-800">{inv.id}</td>
                  <td className="py-3 text-slate-600">
                    {new Date(inv.date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3 text-slate-800">{inv.planLabel}</td>
                  <td className="py-3 font-semibold text-slate-900">
                    {formatInr(inv.amountInr, 2)}
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold">
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => downloadInvoiceText(workspace, inv)}
                      className="rounded-lg border border-slate-200 bg-white hover:border-[#602ee0] hover:text-[#602ee0] px-2.5 py-1 text-[11px] font-semibold text-slate-700 cursor-pointer"
                    >
                      &darr; Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
