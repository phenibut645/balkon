import { Client, Collection, Guild, GuildMember, Role } from "discord.js";
import {
    balkonPlusRoleId,
    balkonPlusSkuId,
    subscriptionGuildId,
    subscriptionSyncIntervalMs,
} from "../config.js";

export class BalkonPlusSubscriptionService {
    private syncTimer: NodeJS.Timeout | null = null;
    private targetGuildUnavailable = false;

    constructor(private readonly client: Client) {}

    async start() {
        if (!this.isConfigured()) {
            console.log("ℹ️ Balkon Plus subscription sync disabled: missing SKU or role configuration.");
            return;
        }

        await this.reconcileAll("startup");

        if (!this.syncTimer) {
            this.syncTimer = setInterval(() => {
                void this.reconcileAll("interval");
            }, subscriptionSyncIntervalMs);
            this.syncTimer.unref();
        }
    }

    async handleEntitlementEvent(userId: string | null | undefined, reason: string) {
        if (!userId || !this.isConfigured()) {
            return;
        }

        await this.syncMemberRole(userId, reason);
    }

    private isConfigured() {
        return Boolean(balkonPlusSkuId && balkonPlusRoleId && subscriptionGuildId);
    }

    private async getTargetGuild(): Promise<Guild | null> {
        const cachedGuild = this.client.guilds.cache.get(subscriptionGuildId);
        if (cachedGuild) {
            this.targetGuildUnavailable = false;
            return cachedGuild;
        }

        try {
            const guild = await this.client.guilds.fetch(subscriptionGuildId);
            this.targetGuildUnavailable = false;
            return guild;
        } catch (error) {
            if (this.isUnknownGuildError(error)) {
                if (!this.targetGuildUnavailable) {
                    console.error(
                        `❌ Subscription sync disabled for guild ${subscriptionGuildId}: Discord returned Unknown Guild. ` +
                        `Check SUBSCRIPTION_GUILD_ID and make sure the bot has been invited to that server.`
                    );
                    this.targetGuildUnavailable = true;
                }

                return null;
            }

            console.error(`❌ Failed to fetch subscription guild ${subscriptionGuildId}:`, error);
            return null;
        }
    }

    private isUnknownGuildError(error: unknown): error is { code: number } {
        return typeof error === "object" && error !== null && "code" in error && error.code === 10004;
    }

    private async getTargetRole(guild: Guild): Promise<Role | null> {
        try {
            return await guild.roles.fetch(balkonPlusRoleId!);
        } catch (error) {
            console.error(`❌ Failed to fetch Balkon Plus role ${balkonPlusRoleId}:`, error);
            return null;
        }
    }

    private async getMember(guild: Guild, userId: string): Promise<GuildMember | null> {
        try {
            return await guild.members.fetch(userId);
        } catch {
            return null;
        }
    }

    private async fetchAllEntitlementsForSku() {
        const application = this.client.application;

        if (!application || !balkonPlusSkuId) {
            return new Collection<string, import("discord.js").Entitlement>();
        }

        const result = new Collection<string, import("discord.js").Entitlement>();
        let after: string | undefined;

        while (true) {
            const batch = await application.entitlements.fetch({
                after,
                cache: false,
                excludeDeleted: false,
                excludeEnded: false,
                limit: 100,
                skus: [balkonPlusSkuId],
            });

            for (const [entitlementId, entitlement] of batch) {
                result.set(entitlementId, entitlement);
            }

            if (batch.size < 100) {
                break;
            }

            after = batch.lastKey();
            if (!after) {
                break;
            }
        }

        return result;
    }

    private async hasActiveEntitlement(userId: string) {
        const application = this.client.application;

        if (!application || !balkonPlusSkuId) {
            return false;
        }

        const entitlements = await application.entitlements.fetch({
            cache: false,
            excludeDeleted: false,
            excludeEnded: false,
            skus: [balkonPlusSkuId],
            user: userId,
        });

        return entitlements.some(entitlement => entitlement.userId === userId && entitlement.skuId === balkonPlusSkuId && entitlement.isActive());
    }

    private async syncMemberRole(userId: string, reason: string) {
        const guild = await this.getTargetGuild();
        if (!guild) {
            return;
        }

        const role = await this.getTargetRole(guild);
        if (!role) {
            return;
        }

        const member = await this.getMember(guild, userId);
        if (!member) {
            console.log(`ℹ️ Subscription sync skipped for user ${userId}: user is not in guild ${guild.id}.`);
            return;
        }

        const shouldHaveRole = await this.hasActiveEntitlement(userId);
        const hasRole = member.roles.cache.has(role.id);

        if (shouldHaveRole && !hasRole) {
            await member.roles.add(role, `Balkon Plus entitlement sync: ${reason}`);
            console.log(`✅ Granted Balkon Plus role to ${member.user.tag} (${member.id}) via ${reason}.`);
            return;
        }

        if (!shouldHaveRole && hasRole) {
            await member.roles.remove(role, `Balkon Plus entitlement sync: ${reason}`);
            console.log(`✅ Removed Balkon Plus role from ${member.user.tag} (${member.id}) via ${reason}.`);
        }
    }

    private async reconcileAll(reason: string) {
        try {
            const guild = await this.getTargetGuild();
            if (!guild) {
                return;
            }

            const role = await this.getTargetRole(guild);
            if (!role) {
                return;
            }

            await guild.members.fetch();

            const entitlements = await this.fetchAllEntitlementsForSku();
            const entitledUserIds = new Set(
                entitlements
                    .filter(entitlement => entitlement.skuId === balkonPlusSkuId && entitlement.userId && entitlement.isActive())
                    .map(entitlement => entitlement.userId),
            );

            for (const userId of entitledUserIds) {
                await this.syncMemberRole(userId, reason);
            }

            for (const member of role.members.values()) {
                if (!entitledUserIds.has(member.id)) {
                    await member.roles.remove(role, `Balkon Plus entitlement sync: ${reason}`);
                    console.log(`✅ Removed stale Balkon Plus role from ${member.user.tag} (${member.id}) via ${reason}.`);
                }
            }

            console.log(`✅ Balkon Plus subscription reconciliation completed via ${reason}. Active subscribers: ${entitledUserIds.size}.`);
        } catch (error) {
            console.error(`❌ Balkon Plus subscription reconciliation failed via ${reason}:`, error);
        }
    }
}