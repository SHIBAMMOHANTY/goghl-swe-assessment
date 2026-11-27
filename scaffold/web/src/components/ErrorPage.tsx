interface ErrorPageProps {
  code: '404' | '500';
  onGoToDashboard: () => void;
  onRetryOrBack: () => void;
}

export function ErrorPage({ code, onGoToDashboard, onRetryOrBack }: ErrorPageProps) {
  const is404 = code === '404';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f8f9fd] via-white to-[#f2edff] text-slate-900">
      {/* Standalone Minimal Header (no dashboard sidebar) */}
      <header className="px-6 py-4 bg-white/90 border-b border-slate-200/80 flex items-center justify-between">
        <button
          type="button"
          onClick={onGoToDashboard}
          className="flex items-center gap-2.5 cursor-pointer bg-transparent border-0 p-0"
        >
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7c4dff] to-[#4f26d6] text-white grid place-items-center font-bold text-sm shadow-sm">
            S
          </span>
          <span className="font-bold text-base text-slate-900 tracking-tight">Switchboard</span>
        </button>
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <div className="max-w-2xl w-full flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 text-center md:text-left">
          {/* Illustration */}
          <div className="w-52 sm:w-60 shrink-0">
            {is404 ? (
              <svg viewBox="0 0 240 200" fill="none" className="w-full h-auto" aria-hidden="true">
                <circle cx="120" cy="100" r="82" fill="#ede9fe" />
                <path
                  d="M45 148 Q120 120 195 148 L195 170 Q120 185 45 170 Z"
                  fill="#ddd6fe"
                />
                {/* Telescope */}
                <g transform="rotate(-18 120 92)">
                  <rect x="66" y="74" width="96" height="24" rx="10" fill="#6d28d9" />
                  <rect x="150" y="70" width="22" height="32" rx="6" fill="#4f24d6" />
                  <rect x="56" y="79" width="16" height="14" rx="4" fill="#8b5cf6" />
                </g>
                {/* Tripod */}
                <path
                  d="M114 98 L88 156 M114 98 L114 160 M114 98 L142 156"
                  stroke="#312e81"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <circle cx="114" cy="96" r="7" fill="#4f24d6" />
                <circle cx="62" cy="54" r="3" fill="#a78bfa" />
                <circle cx="176" cy="48" r="3.5" fill="#8b5cf6" />
              </svg>
            ) : (
              <svg viewBox="0 0 240 200" fill="none" className="w-full h-auto" aria-hidden="true">
                <circle cx="120" cy="102" r="82" fill="#ede9fe" />
                <rect x="52" y="54" width="136" height="90" rx="12" fill="#5b21b6" />
                <rect x="60" y="62" width="120" height="72" rx="6" fill="#ffffff" />
                <path d="M36 144 H204 L196 156 H44 Z" fill="#8b5cf6" />
                {/* Warning triangle */}
                <path d="M120 75 L142 115 H98 Z" fill="#6d28d9" />
                <rect x="118" y="88" width="4" height="14" rx="2" fill="#ffffff" />
                <circle cx="120" cy="108" r="2.5" fill="#ffffff" />
                <path
                  d="M174 36 L180 24 M186 42 L198 34 M190 52 L202 50"
                  stroke="#6d28d9"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>

          {/* Copy + Actions */}
          <div className="space-y-4">
            <div className="text-5xl sm:text-6xl font-extrabold text-[#602ee0] tracking-tight leading-none">
              {code}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 m-0">
                {is404 ? 'Page Not Found' : 'Something Went Wrong'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 mb-0 max-w-sm">
                {is404
                  ? "The page you're looking for doesn't exist or has been moved."
                  : "We're having trouble on our end. Please try again in a few minutes."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 pt-1">
              {is404 ? (
                <>
                  <button
                    type="button"
                    onClick={onGoToDashboard}
                    className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 shadow-sm cursor-pointer"
                  >
                    Go to Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={onRetryOrBack}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 cursor-pointer"
                  >
                    &larr; Go Back
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onRetryOrBack}
                    className="rounded-xl bg-gradient-to-r from-[#6532eb] to-[#5624d6] hover:from-[#5726d8] hover:to-[#471bb8] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 shadow-sm cursor-pointer"
                  >
                    ↻ Try Again
                  </button>
                  <button
                    type="button"
                    onClick={onGoToDashboard}
                    className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold px-4 py-2.5 cursor-pointer"
                  >
                    Go to Dashboard
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
