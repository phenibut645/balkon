import Fastify, { FastifyError } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import { registerBaseRoutes } from "./routes/baseRoutes.js";
import { registerDashboardRoutes } from "./routes/dashboardRoutes.js";
import { registerBridgeRoutes } from "./routes/bridgeRoutes.js";
import { registerDiscordOAuthRoutes } from "./auth/discordOAuth.js";
import { attachDevSession } from "./auth/session.js";

const webPort = Number(process.env.WEB_PORT ?? 3001);
const host = process.env.WEB_HOST ?? "0.0.0.0";
const allowedOrigins = (process.env.WEB_CORS_ORIGIN ?? "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true,
});

await app.register(fastifyCors, {
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
});

await app.register(fastifyRateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
});

await app.register(fastifyCookie);

app.addHook("preHandler", attachDevSession);

app.setErrorHandler((error: FastifyError, _request, reply) => {
  if (error.validation) {
    return reply.code(400).send({
      ok: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
      details: error.validation,
    });
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({
      ok: false,
      error: error.code ?? "REQUEST_ERROR",
      message: error.message,
    });
  }

  requestSafeLog(app, error);
  return reply.code(500).send({
    ok: false,
    error: "INTERNAL_ERROR",
    message: "Unexpected server error.",
  });
});

await app.register(async api => {
  await registerBaseRoutes(api);
  await registerDiscordOAuthRoutes(api);
  await registerDashboardRoutes(api);
  await registerBridgeRoutes(api);
}, { prefix: "/api" });

await app.listen({ host, port: webPort });

function requestSafeLog(instance: typeof app, error: FastifyError): void {
  instance.log.error({
    err: {
      name: error.name,
      message: error.message,
    },
  }, "Unhandled API error");
}
