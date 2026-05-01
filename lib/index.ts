export {
  FontObfuscator,
  type FontObfuscatorOptions,
  type ObfuscateHtmlOptions,
} from "./fontObfuscator.ts";

export {
  obfuscateHtmlResponse,
  withAstroEndpointObfuscation,
  withFetchObfuscation,
  withHonoObfuscation,
  withNextRouteHandlerObfuscation,
  withRemixRequestHandlerObfuscation,
  withSvelteKitHandleObfuscation,
  type AdapterObfuscationOptions,
  type SvelteKitEventLike,
  type SvelteKitHandleInput,
} from "./adapters.ts";
