export const appVersion = import.meta.env.VITE_APP_VERSION || 'development'
export type Diagnostic = {
  code: string; message?: string; timestamp: string; requestId?: string; appVersion: string;
  workerVersion?: string; endpoint: string; method: string; status?: number;
  category: string; dependency: string; responseReceived: boolean; online: boolean;
  visibility: string; errorName: string;
}
export function diagnosticContext(endpoint: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code: 'NETWORK_ERROR', timestamp: new Date().toISOString(), appVersion,
    endpoint: endpoint.split('?')[0], method: 'GET', category: 'network', dependency: 'worker',
    responseReceived: false, online: typeof navigator === 'undefined' || navigator.onLine,
    visibility: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
    errorName: 'Error', ...extra }
}
