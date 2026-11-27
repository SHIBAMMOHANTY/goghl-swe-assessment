import heroInboxImg from '../assets/hero-inbox.png';

interface LoginScreenProps {
  error: string | null;
}

function BrandBubbleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.75c-4.97 0-9 3.47-9 7.75 0 2.13 1 4.06 2.63 5.45-.19 1.24-.75 2.47-1.58 3.45 1.54-.17 3.1-.77 4.26-1.61 1.15.3 2.4.46 3.69.46 4.97 0 9-3.47 9-7.75S16.97 3.75 12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="11.5" r="1.05" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1.05" fill="currentColor" />
      <circle cx="15.5" cy="11.5" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function LoginScreen({ error }: LoginScreenProps) {
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[1.22fr_1fr] bg-[#190f42] lg:bg-[#f8f9fd] text-slate-900">
      {/* Left Hero Showcase (Top compact purple hero on mobile, left panel on desktop) */}
      <section className="order-1 relative overflow-hidden bg-gradient-to-b lg:bg-gradient-to-br from-[#190f42] via-[#2b1768] to-[#432098] text-white px-6 pt-8 pb-10 sm:px-8 lg:px-12 lg:py-9 flex flex-col justify-between">
        {/* Ambient radial glows */}
        <div
          className="pointer-events-none absolute -top-20 left-1/3 w-96 h-96 rounded-full bg-violet-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 -right-12 w-80 h-80 rounded-full bg-indigo-400/20 blur-3xl"
          aria-hidden="true"
        />

        {/* Layered bottom purple waves */}
        <svg
          viewBox="0 0 900 220"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0 w-full h-28 sm:h-36 lg:h-44"
          aria-hidden="true"
        >
          <path
            d="M0,120 C165,20 340,185 550,105 C700,45 815,130 900,85 L900,220 L0,220 Z"
            fill="url(#heroWave1)"
          />
          <path
            d="M0,165 C220,105 420,210 660,130 C770,95 845,150 900,125 L900,220 L0,220 Z"
            fill="url(#heroWave2)"
          />
          <defs>
            <linearGradient id="heroWave1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6d28d9" stopOpacity="0.48" />
              <stop offset="55%" stopColor="#5b21b6" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#4338ca" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="heroWave2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.32" />
            </linearGradient>
          </defs>
        </svg>

        {/* Brand lockup: centered on mobile, top-left on desktop */}
        <div className="relative z-10 flex items-center justify-center lg:justify-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#4f26d6] shadow-lg shadow-indigo-950/40 grid place-items-center text-white shrink-0">
            <BrandBubbleIcon className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="font-bold text-xl lg:text-lg leading-tight tracking-tight">
              Switchboard
            </div>
            <div className="text-xs text-violet-200/80">Shared Team Inbox</div>
          </div>
        </div>

        {/* Hero Middle: centered on mobile, split text + illustration on desktop */}
        <div className="relative z-10 mt-6 lg:my-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 lg:gap-4">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left shrink-0 lg:max-w-[330px] xl:max-w-[360px]">
            <h1 className="text-[26px] sm:text-3xl lg:text-[38px] xl:text-[42px] font-bold tracking-tight leading-[1.14] m-0">
              Customer support
              <br />
              for <span className="text-[#b197ff]">modern teams</span>
            </h1>
            <p className="mt-2.5 lg:mt-3 text-xs sm:text-sm text-violet-100/85 leading-relaxed max-w-[300px] lg:max-w-[330px] mb-0">
              A shared, reliable inbox for your whole team. Manage conversations, collaborate, and
              respond faster.
            </p>

            {/* 4 feature bullets (desktop only so mobile stays compact like reference) */}
            <ul className="hidden lg:grid mt-7 grid-cols-1 gap-4 list-none p-0 m-0 text-left">
              <li className="flex items-start gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 grid place-items-center shrink-0 text-violet-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-4 h-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M3 13l2.4-6.4A2 2 0 0 1 7.3 5h9.4a2 2 0 0 1 1.9 1.6L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
                    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">Shared inbox</div>
                  <div className="text-xs text-violet-200/75 leading-snug">
                    One place for all customer conversations
                  </div>
                </div>
              </li>

              <li className="flex items-start gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 grid place-items-center shrink-0 text-violet-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-4 h-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="3.5" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a3.5 3.5 0 0 1 0 6.75" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">Team collaboration</div>
                  <div className="text-xs text-violet-200/75 leading-snug">
                    Assign, claim, and work together
                  </div>
                </div>
              </li>

              <li className="flex items-start gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 grid place-items-center shrink-0 text-violet-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-4 h-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">Real-time updates</div>
                  <div className="text-xs text-violet-200/75 leading-snug">
                    Live messages and delivery status
                  </div>
                </div>
              </li>

              <li className="flex items-start gap-3.5">
                <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 grid place-items-center shrink-0 text-violet-100">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-4 h-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M12 3 4 6.5v5.5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z" />
                    <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">Secure &amp; multi-tenant</div>
                  <div className="text-xs text-violet-200/75 leading-snug">
                    Workspace isolation and role-based access
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* 3D Inbox Illustration */}
          <div className="w-56 sm:w-64 lg:w-[340px] xl:w-[410px] self-center shrink-0 flex justify-center lg:-mr-6 xl:-mr-8 lg:mt-6">
            <img
              src={heroInboxImg}
              alt="Switchboard shared inbox preview"
              className="w-full h-auto drop-shadow-[0_24px_40px_rgba(12,7,35,0.7)] select-none"
            />
          </div>
        </div>

        {/* Bottom carousel dots (desktop only) */}
        <div
          className="hidden lg:flex relative z-10 items-center justify-center gap-2 pt-0"
          aria-hidden="true"
        >
          <span className="w-2 h-2 rounded-full bg-violet-300" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
        </div>
      </section>

      {/* Right Sign-In Panel (Rounded-top white bottom sheet on mobile, centered card on desktop) */}
      <section className="order-2 relative z-20 -mt-5 lg:mt-0 flex-1 flex items-start lg:items-center justify-center bg-white lg:bg-gradient-to-br lg:from-[#f8f9fc] lg:via-[#fbfbfe] lg:to-[#f0ecff] rounded-t-[28px] lg:rounded-none px-5 pt-7 pb-8 sm:p-8 lg:p-10 shadow-[0_-10px_30px_rgba(15,10,45,0.2)] lg:shadow-none">
        <div className="w-full max-w-[430px] lg:bg-white lg:rounded-3xl lg:border lg:border-slate-200/70 lg:shadow-[0_20px_55px_rgba(30,27,75,0.08)] lg:px-9 lg:py-10">
          {/* Centered Brand Header (desktop only; mobile shows Switchboard at top of purple hero) */}
          <div className="hidden lg:flex items-center justify-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6e3ff3] to-[#4f24d6] shadow-md shadow-indigo-500/25 grid place-items-center text-white shrink-0">
              <BrandBubbleIcon className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="font-bold text-[22px] leading-tight text-slate-900 tracking-tight">
                Switchboard
              </div>
              <div className="text-xs text-slate-500">Shared Team Inbox</div>
            </div>
          </div>

          <div className="text-center mb-5 sm:mb-6">
            <h2 className="text-[21px] sm:text-[23px] font-bold text-slate-900 tracking-tight m-0">
              Sign in to your workspace
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 mb-0">
              Continue with your organization account
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <a
            href={
              typeof window !== 'undefined'
                ? `/auth/login?next=${encodeURIComponent(`${window.location.origin}/`)}`
                : '/auth/login'
            }
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#5826d9] to-[#6b34ea] hover:from-[#4c1ec4] hover:to-[#5b28d6] active:scale-[0.99] text-white text-sm font-semibold py-3.5 px-4 shadow-lg shadow-indigo-600/25 transition-all no-underline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-4 h-4 shrink-0"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="m10 17 5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
            Continue with Goghl.ai (OIDC)
          </a>

          {/* Divider */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full border-t border-slate-200/90" />
            <span className="bg-white px-3 text-xs text-slate-400 absolute">or</span>
          </div>

          {/* PKCE Security Notice */}
          <div className="rounded-xl bg-[#f6f7fb] border border-[#e7e9f2] p-3.5 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#ebe5ff] text-[#5e2ce0] grid place-items-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800">
                Secure login with OpenID Connect and PKCE
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed mt-0.5 mb-0">
                You&apos;ll be redirected to your organization&apos;s identity provider to sign in
                securely.
              </p>
            </div>
          </div>

          {/* Footer Trust Badges with vertical dividers */}
          <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 divide-x divide-slate-200/80 text-center">
            <div className="flex flex-col items-center gap-1 px-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 text-[#5b2be0]"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M12 3 4 6.5v5.5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z" />
                <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-slate-800">Secure</span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                Industry-standard OIDC + PKCE
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 px-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 text-[#5b2be0]"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
                <path d="m3 12 9 4.5 9-4.5" />
                <path d="m3 16.5 9 4.5 9-4.5" />
              </svg>
              <span className="text-xs font-semibold text-slate-800">Multi-workspace</span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                Access your workspaces
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 px-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-4 h-4 text-[#5b2be0]"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-slate-800">Fast &amp; reliable</span>
              <span className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                Get started in seconds
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
