import type { Hono } from "hono";
import { renderDemoView } from "../views/demoViews.tsx";

export function registerDemoRoutes(app: Hono): void {
  const paths = ["/", "/counter", "/pre-encoded"];
  for (const path of paths) {
    app.get(path, (c) => c.html(renderDemoView(c.req.path)));
  }
}
