import { createServer } from "node:http";

export function serveFetch(handler: (req: Request) => Promise<Response> | Response, port: number): void {
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://${req.headers.host ?? `localhost:${port}`}`;
      const url = new URL(req.url ?? "/", origin);

      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
        duplex: "half",
      } as RequestInit);

      const response = await handler(request);
      res.statusCode = response.status;
      const setCookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
      response.headers.forEach((value, key) => {
        if (key === "set-cookie") return;
        res.setHeader(key, value);
      });
      if (setCookies.length > 0) {
        res.setHeader("set-cookie", setCookies);
      }

      if (req.method !== "HEAD" && response.body) {
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      }
      res.end();
    } catch (error) {
      console.error("[pua-font-obfuscator] unhandled error:", error);
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    }
  });

  server.listen(port);
}
