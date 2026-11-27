interface LoginScreenProps {
  error: string | null;
}

export function LoginScreen({ error }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center p-6 text-slate-900">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white grid place-items-center font-bold text-lg">
            S
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 m-0">Switchboard</h1>
            <p className="text-xs text-slate-500 m-0">Multi-tenant shared support inbox</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          Manage live customer conversations across workspaces with atomic conversation claiming,
          durable message delivery, real-time WebSocket updates, and end-to-end encrypted agent
          notes.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <a
          className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          href="/auth/login"
        >
          Sign in with OpenID Connect (PKCE)
        </a>

        <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500">
          <div className="font-semibold text-slate-800 mb-1.5">Mock IdP Test Accounts</div>
          <ul className="space-y-1 pl-4 list-disc">
            <li>
              <code className="text-slate-700">u_asha</code> · ws_acme (admin)
            </li>
            <li>
              <code className="text-slate-700">u_ben</code> · ws_acme (agent)
            </li>
            <li>
              <code className="text-slate-700">u_chloe</code> · ws_globex (admin)
            </li>
            <li>
              <code className="text-slate-700">u_dev</code> · ws_globex (agent)
            </li>
            <li>
              <code className="text-slate-700">u_eli</code> · ws_acme &amp; ws_globex (agent)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
