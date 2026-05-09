declare module "opentype.js";
declare module "wawoff2";
declare module "he";
declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
	export default component;
}
