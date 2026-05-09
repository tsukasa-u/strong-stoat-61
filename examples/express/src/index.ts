import express from "express";
import { FontObfuscator } from "font-obfuscator";
import { registerDemoRoutes } from "./routes/demoRoutes.ts";

const app = express();
const port = Number(process.env.PORT ?? 3000);

const obfuscator = new FontObfuscator({
  fontUrl:
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  fontRoutePrefix: "/_obf/font",
});

registerDemoRoutes(app, obfuscator);

app.listen(port, () => {
  console.log(`[express-example] http://localhost:${port}/`);
});
