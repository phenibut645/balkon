import { FastifyReply, FastifyRequest } from "fastify";
import { isBotContributor } from "../../core/BotAdmin.js";

export async function requireBotContributor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.authUser;
  if (!user) {
    return reply.code(401).send({
      ok: false,
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }

  const contributorAllowed = user.roles.includes("bot_contributor") || await isBotContributor(user.discordId);
  if (contributorAllowed) {
    return;
  }

  return reply.code(403).send({
    ok: false,
    error: "Forbidden",
    message: "Bot contributor role required.",
  });
}
