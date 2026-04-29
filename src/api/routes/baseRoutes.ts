import { FastifyInstance } from "fastify";

export async function registerBaseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "balkon-api",
  }));

  app.get("/version", async () => ({
    ok: true,
    service: "balkon-api",
    version: process.env.npm_package_version ?? "unknown",
  }));
}
