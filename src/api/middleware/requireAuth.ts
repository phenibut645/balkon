import { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.code(401).send({
      ok: false,
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }
}
