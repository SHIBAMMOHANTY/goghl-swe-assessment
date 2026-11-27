const WORKSPACE_LABELS: Record<string, string> = {
  ws_acme: 'Acme Store',
  ws_globex: 'Globex Corp',
};

export function workspaceDisplayName(id: string): string {
  if (WORKSPACE_LABELS[id]) return WORKSPACE_LABELS[id];
  return id.replace(/^ws_/, '').replace(/_/g, ' ');
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}
