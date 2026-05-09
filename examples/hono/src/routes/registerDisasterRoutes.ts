import type { Hono } from "hono";
import { renderDisasterView } from "../views/disasterViews.ts";

export function registerDisasterRoutes(app: Hono): void {
  const paths = ["/", "/evacuation", "/alerts"];
  for (const path of paths) {
    app.get(path, (c) => c.html(renderDisasterView(c.req.path)));
  }
}
