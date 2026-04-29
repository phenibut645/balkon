import { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireBotAdmin } from "../middleware/requireBotAdmin.js";
import { getBotCommandQueue } from "../../core/BotCommandQueue.js";

interface KickBody {
  reason?: string;
}

const guildIdPattern = "^[0-9]{5,32}$";
const memberIdPattern = "^[0-9]{5,32}$";

export async function registerBridgeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { guildId: string; memberId: string }; Body: KickBody }>(
    "/guilds/:guildId/members/:memberId/kick",
    {
      preHandler: [requireAuth, requireBotAdmin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        params: {
          type: "object",
          required: ["guildId", "memberId"],
          properties: {
            guildId: { type: "string", pattern: guildIdPattern },
            memberId: { type: "string", pattern: memberIdPattern },
          },
          additionalProperties: false,
        },
        body: {
          type: "object",
          properties: {
            reason: { type: "string", minLength: 1, maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    async request => {
      const queue = getBotCommandQueue();
      const reason = request.body?.reason?.trim() || "Admin dashboard action";
      const { guildId, memberId } = request.params;

      const { commandId } = await queue.enqueue({
        type: "KICK_MEMBER",
        guildId,
        requestedByDiscordId: request.authUser!.discordId,
        payload: {
          memberId,
          reason,
          source: "web_api",
        },
      });

      request.log.warn({
        action: "enqueue_kick_member",
        guildId,
        memberId,
        commandId,
        requestedBy: request.authUser!.discordId,
      }, "Sensitive action queued");

      return {
        ok: true,
        commandId,
        status: "pending",
      };
    },
  );
}
