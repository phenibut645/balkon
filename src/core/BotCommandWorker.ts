import { Client, PermissionsBitField } from "discord.js";
import { BotCommandRecord, getBotCommandQueue } from "./BotCommandQueue.js";
import { isBotAdmin } from "./BotAdmin.js";

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_KICK_REASON = "Requested via API command queue";

export class BotCommandWorker {
  private readonly queue = getBotCommandQueue();
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(private readonly client: Client, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
    this.pollIntervalMs = Math.max(2_000, Math.min(pollIntervalMs, 5_000));
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);

    void this.pollOnce();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private async pollOnce(): Promise<void> {
    if (this.isPolling || !this.client.isReady()) {
      return;
    }

    this.isPolling = true;

    try {
      const command = await this.queue.claimNextPending();
      if (!command) {
        return;
      }

      await this.processCommand(command);
    } catch (error) {
      console.error("[BotCommandWorker] Failed to poll command queue:", this.getErrorMessage(error));
    } finally {
      this.isPolling = false;
    }
  }

  private async processCommand(command: BotCommandRecord): Promise<void> {
    try {
      switch (command.type) {
        case "KICK_MEMBER":
          await this.handleKickMember(command);
          return;
        case "BAN_MEMBER":
        case "UNBAN_MEMBER":
        case "ADD_ROLE":
        case "REMOVE_ROLE":
        case "SEND_CHANNEL_MESSAGE":
          await this.queue.markFailed(command.id, `Unsupported command type: ${command.type}`);
          return;
        default:
          await this.queue.markFailed(command.id, "Unsupported command type");
      }
    } catch (error) {
      await this.queue.markFailed(command.id, this.getErrorMessage(error));
      console.error(`[BotCommandWorker] Command ${command.id} failed:`, this.getErrorMessage(error));
    }
  }

  private async handleKickMember(command: BotCommandRecord): Promise<void> {
    if (!command.guildId) {
      throw new Error("guildId is required for KICK_MEMBER");
    }

    const payload = this.validateKickPayload(command.payload);
    const requesterAllowed = await this.isRequesterAllowed(command.guildId, command.requestedByDiscordId);
    if (!requesterAllowed) {
      throw new Error("Requester is not allowed to kick members");
    }

    const guild = this.client.guilds.cache.get(command.guildId) ?? await this.client.guilds.fetch(command.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    const targetMember = await guild.members.fetch(payload.memberId);
    if (!targetMember) {
      throw new Error("Target member not found");
    }

    if (!targetMember.kickable) {
      throw new Error("Bot cannot kick target member");
    }

    await targetMember.kick(payload.reason);

    await this.queue.markCompleted(command.id, {
      action: "KICK_MEMBER",
      guildId: command.guildId,
      memberId: payload.memberId,
      reason: payload.reason,
      processedAt: new Date().toISOString(),
    });

    console.log(`[BotCommandWorker] Completed KICK_MEMBER command ${command.id}`);
  }

  private validateKickPayload(payload: Record<string, unknown>): { memberId: string; reason: string } {
    const memberId = typeof payload.memberId === "string" ? payload.memberId.trim() : "";
    if (!memberId) {
      throw new Error("Invalid payload: memberId must be a non-empty string");
    }

    const reasonValue = payload.reason;
    if (reasonValue !== undefined && typeof reasonValue !== "string") {
      throw new Error("Invalid payload: reason must be a string");
    }

    const reason = typeof reasonValue === "string" && reasonValue.trim()
      ? reasonValue.trim()
      : DEFAULT_KICK_REASON;

    if (reason.length > 512) {
      throw new Error("Invalid payload: reason must be 512 characters or less");
    }

    return { memberId, reason };
  }

  private async isRequesterAllowed(guildId: string, requesterDiscordId: string): Promise<boolean> {
    if (isBotAdmin(requesterDiscordId)) {
      return true;
    }

    try {
      const guild = this.client.guilds.cache.get(guildId) ?? await this.client.guilds.fetch(guildId);
      if (!guild) {
        return false;
      }

      const requesterMember = await guild.members.fetch(requesterDiscordId);
      return requesterMember.permissions.has(PermissionsBitField.Flags.Administrator)
        || requesterMember.permissions.has(PermissionsBitField.Flags.KickMembers);
    } catch {
      return false;
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return "Unknown worker error";
  }
}
