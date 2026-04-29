import { FastifyReply, FastifyRequest } from "fastify";

export async function requireGuildFounder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.authUser;
  if (!user) {
    return reply.code(401).send({
      ok: false,
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }

  // TODO: Implement guild founder checks against guild membership and owner status.
  if (user.roles.includes("guild_founder")) {
    return;
  }

  return reply.code(501).send({
    ok: false,
    error: "NotImplemented",
    message: "Guild founder permission check is not implemented yet.",
  });
}
