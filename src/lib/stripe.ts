const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function resolveWorkerBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_WORKER_BASE_URL;
  return normalizeBaseUrl(base);
}
