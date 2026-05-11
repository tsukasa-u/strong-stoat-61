import type { EntryContext } from "@remix-run/node";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { withRemixRequestHandlerObfuscation } from "font-obfuscator";
import { obfuscator, OBF_SELECTORS } from "./obfuscator.server";

async function baseHandleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady() {
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError: reject,
      },
    );
  });
}

export default withRemixRequestHandlerObfuscation(baseHandleRequest, obfuscator, {
  selectors: OBF_SELECTORS,
  skipPathPatterns: [/^\/build\//, /^\/_data/],
});
