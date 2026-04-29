import { FastifyInstance } from "fastify";

export async function registerDiscordOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/discord", async (_request, reply) => {
    return reply.code(501).send({
      ok: false,
      message: "Discord OAuth is not implemented yet.",
      todo: "Implement OAuth redirect and state verification.",
    });
  });

  app.get("/auth/discord/callback", async (_request, reply) => {
    return reply.code(501).send({
      ok: false,
      message: "Discord OAuth callback is not implemented yet.",
      todo: "Exchange code for token and create server session.",
    });
  });

  app.post("/auth/logout", async (_request, reply) => {
    return reply.send({
      ok: true,
      message: "Logout placeholder. Real session invalidation will be added with OAuth.",
    });
  });
}
