import { expect, it, vi } from "vitest";

let capturedListener: ((req: any, res: any) => Promise<void>) | undefined;

vi.mock("node:http", () => ({
  createServer: (listener: (req: any, res: any) => Promise<void>) => {
    capturedListener = listener;
    return {
      listen: vi.fn(),
    };
  },
}));

import { serveFetch } from "../lib/nodeServer.ts";

it("serveFetch does not stream response bodies for HEAD requests", async () => {
  const handler = vi.fn(async () => new Response("head-body-should-not-be-sent", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  }));

  serveFetch(handler, 43210);
  expect(capturedListener).toBeTypeOf("function");

  const req = {
    method: "HEAD",
    url: "/health",
    headers: { host: "localhost:43210" },
  };
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };

  await capturedListener!(req, res);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(res.write).not.toHaveBeenCalled();
  expect(res.end).toHaveBeenCalledTimes(1);
});

it("serveFetch preserves multiple Set-Cookie headers", async () => {
  const handler = vi.fn(async () => new Response("ok", {
    status: 200,
    headers: [
      ["content-type", "text/plain; charset=utf-8"],
      ["set-cookie", "a=1; Path=/"],
      ["set-cookie", "b=2; Path=/"],
    ],
  }));

  serveFetch(handler, 43210);
  expect(capturedListener).toBeTypeOf("function");

  const req = {
    method: "GET",
    url: "/cookies",
    headers: { host: "localhost:43210" },
  };
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };

  await capturedListener!(req, res);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(res.setHeader).toHaveBeenCalledWith("set-cookie", [
    "a=1; Path=/",
    "b=2; Path=/",
  ]);
});