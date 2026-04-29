import { FastifyReply, FastifyRequest } from "fastify";
import { isBotAdmin } from "../../core/BotAdmin.js";

export async function requireBotAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.authUser;
  if (!user) {
    return reply.code(401).send({
      ok: false,
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }

  if (user.roles.includes("bot_admin") || isBotAdmin(user.discordId)) {
    return;
  }

  return reply.code(403).send({
    ok: false,
    error: "Forbidden",
    message: "Bot admin role required.",
  });
}
