import Fastify from "fastify";
import { FontObfuscator } from "pua-font-obfuscator";
import { registerDemoRoutes } from "./routes/demoRoutes.ts";

const app = Fastify();
const port = Number(process.env.PORT ?? 3000);

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

registerDemoRoutes(app, obfuscator);

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`[fastify-example] http://localhost:${port}/`);
});
