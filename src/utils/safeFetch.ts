/**
 * Resilient Network Fetch Utilities (Timeout + Graceful Fallback)
 *
 * Prevents external APIs, webhooks, or blocked corporate endpoints from stalling
 * UI rendering or causing unhandled rejections.
 */

export interface SafeFetchOptions extends RequestInit {
  /** Request timeout in milliseconds (default: 6000ms) */
  timeoutMs?: number;
}

/**
 * Wraps native `fetch` with a strict AbortController timeout so slow or
 * firewalled network requests fail fast and cleanly without hanging the UI.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 6000, signal: externalSignal, ...fetchInit } = options;

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(500, timeoutMs));

  try {
    return await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (timedOut) {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timerId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Fetches JSON safely with a short timeout. Returns `fallback` silently on
 * network failure, timeout, non-2xx status, or HTML fallback responses.
 */
export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  fallback: T,
  options: SafeFetchOptions = {}
): Promise<T> {
  try {
    const resp = await fetchWithTimeout(input, options);
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok || !contentType.includes('application/json')) {
      return fallback;
    }
    return (await resp.json()) as T;
  } catch {
    return fallback;
  }
}
