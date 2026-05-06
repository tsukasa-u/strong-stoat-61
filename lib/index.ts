export {
  FontObfuscator,
  encodeText,
  preEncodeShuffled,
  type BudgetPolicy,
  type VariantAllocator,
  type BudgetDegradeEvent,
  type FontObfuscatorOptions,
  type ObfuscateHtmlOptions,
  type PrecomputedPage,
  type PrecomputedMapping,
  type ServePrecomputedOptions,
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
