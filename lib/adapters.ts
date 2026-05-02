import type { FontObfuscator, ObfuscateHtmlOptions } from "./fontObfuscator.ts";

/**
 * Options shared by all adapter helpers.
 * Extends {@link ObfuscateHtmlOptions} with adapter-specific controls.
 */
export interface AdapterObfuscationOptions extends ObfuscateHtmlOptions {
  /**
   * Request paths matching any of these patterns are passed through without
   * obfuscation.  Use this to skip static-asset prefixes such as
   * `/_next/`, `/_app/`, `/build/`, `/_astro/`.
   */
  skipPathPatterns?: RegExp[];
}

function shouldSkipPath(pathname: string, patterns: RegExp[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => p.test(pathname));
}

/**
 * Low-level helper that obfuscates the body of a `Response` when its
 * `content-type` is `text/html`.  Non-HTML responses are returned unchanged.
 *
 * Used internally by all adapter wrappers but also useful when you need direct
 * control over the request/response cycle (e.g. Astro middleware).
 *
 * Sets `cache-control: no-store` and removes `content-length` on the returned
 * response so that the modified body length is not misreported.
 */
export async function obfuscateHtmlResponse(
  response: Response,
  obfuscator: FontObfuscator,
  options: AdapterObfuscationOptions,
  req?: Request,
): Promise<Response> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const source = await response.text();
  const html = await obfuscator.obfuscateHtml(source, {
    selectors: options.selectors,
    fontFamilyName: options.fontFamilyName,
    pageKey: req ? new URL(req.url).pathname : "/",
    // Use the obfuscator's own getClientFingerprint so trustedProxies is respected.
    clientFingerprint: req ? obfuscator.getClientFingerprint(req) : undefined,
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wraps a fetch-compatible handler with font obfuscation.
 *
 * The wrapper:
 * 1. Intercepts one-time font requests (matching `fontRoutePrefix`) and
 *    returns the font file directly — the original handler is not called.
 * 2. Calls the original handler for all other requests.
 * 3. Obfuscates the response body when `content-type` is `text/html`.
 *
 * Works with any runtime that uses the Fetch API: Node (via `serveFetch`),
 * Bun (`Bun.serve`), Cloudflare Workers (`export default { fetch }`),
 * Deno (`Deno.serve`), Hono, Next.js route handlers, Remix, Astro, etc.
 *
 * @example
 * ```ts
 * const handler = withFetchObfuscation(baseHandler, obfuscator, {
 *   selectors: [".secret"],
 *   skipPathPatterns: [/^\/_next\//],
 * });
 * // Node:
 * serveFetch(handler, 3000);
 * // Cloudflare Workers:
 * export default { fetch: handler };
 * // Bun:
 * Bun.serve({ fetch: handler, port: 3000 });
 * ```
 */
export function withFetchObfuscation<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response> | Response,
  obfuscator: FontObfuscator,
  options: AdapterObfuscationOptions,
): (req: Request, ...args: Args) => Promise<Response> {
  return async (req: Request, ...args: Args): Promise<Response> => {
    const url = new URL(req.url);
    if (!shouldSkipPath(url.pathname, options.skipPathPatterns)) {
      const fontRes = await obfuscator.maybeHandleFontRequest(req);
      if (fontRes) return fontRes;
    }

    const response = await handler(req, ...args);
    return obfuscateHtmlResponse(response, obfuscator, options, req);
  };
}

export const withNextRouteHandlerObfuscation = withFetchObfuscation;
export const withRemixRequestHandlerObfuscation = withFetchObfuscation;
export const withAstroEndpointObfuscation = withFetchObfuscation;
export const withHonoObfuscation = withFetchObfuscation;

export interface SvelteKitEventLike {
  request: Request;
}

export interface SvelteKitHandleInput {
  event: SvelteKitEventLike;
  resolve: (event: SvelteKitEventLike) => Promise<Response>;
}

export function withSvelteKitHandleObfuscation(
  handle: (input: SvelteKitHandleInput) => Promise<Response> | Response,
  obfuscator: FontObfuscator,
  options: AdapterObfuscationOptions,
): (input: SvelteKitHandleInput) => Promise<Response> {
  return async (input: SvelteKitHandleInput): Promise<Response> => {
    const pathname = new URL(input.event.request.url).pathname;
    if (!shouldSkipPath(pathname, options.skipPathPatterns)) {
      const fontRes = await obfuscator.maybeHandleFontRequest(input.event.request);
      if (fontRes) return fontRes;
    }

    const response = await handle(input);
    return obfuscateHtmlResponse(response, obfuscator, options, input.event.request);
  };
}
