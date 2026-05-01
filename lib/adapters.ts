import type { FontObfuscator, ObfuscateHtmlOptions } from "./fontObfuscator.ts";

export interface AdapterObfuscationOptions extends ObfuscateHtmlOptions {
  skipPathPatterns?: RegExp[];
}

function shouldSkipPath(pathname: string, patterns: RegExp[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => p.test(pathname));
}

export async function obfuscateHtmlResponse(
  response: Response,
  obfuscator: FontObfuscator,
  options: AdapterObfuscationOptions,
): Promise<Response> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const source = await response.text();
  const html = await obfuscator.obfuscateHtml(source, {
    selectors: options.selectors,
    fontFamilyName: options.fontFamilyName,
    observeMutations: options.observeMutations,
  });

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
    return obfuscateHtmlResponse(response, obfuscator, options);
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
    return obfuscateHtmlResponse(response, obfuscator, options);
  };
}
