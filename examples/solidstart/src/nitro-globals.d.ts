// Ambient declarations for Nitro auto-imported globals in SolidStart/Vinxi.
// `defineNitroPlugin` is injected by Nitro at build time; this shim provides
// TypeScript with just enough typing to compile cleanly without adding
// nitropack as a direct dependency.

interface _NitroRenderResponse {
  body: string | undefined;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
}

interface _H3EventLike {
  path: string;
  node: { req: import("http").IncomingMessage };
}

interface _NitroAppLike {
  hooks: {
    hook(
      event: "render:response",
      handler: (
        response: Partial<_NitroRenderResponse>,
        context: { event: _H3EventLike },
      ) => void | Promise<void>,
    ): void;
  };
}

declare function defineNitroPlugin(
  setup: (nitroApp: _NitroAppLike) => void,
): (nitroApp: _NitroAppLike) => void;
