import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { streamerService } from "../core/StreamerService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class StreamerCommand extends Command {
    commandName: CommandName = "streamer";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Manage streamers registered for this server.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("register")
                .setDescription("Register a streamer for this guild.")
                .addStringOption(option => option.setName("nickname").setDescription("Twitch nickname").setRequired(true))
                .addStringOption(option => option.setName("twitch_url").setDescription("Full Twitch URL").setRequired(false))
                .addBooleanOption(option => option.setName("primary").setDescription("Mark as primary streamer for this server").setRequired(false))
        )
        .addSubcommand(subcommand => subcommand.setName("list").setDescription("List streamers registered for this guild."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a streamer from this guild.")
                .addStringOption(option => option.setName("nickname").setDescription("Registered streamer nickname").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("agent_pair")
                .setDescription("Generate remote OBS agent credentials for a registered streamer.")
                .addStringOption(option => option.setName("nickname").setDescription("Registered streamer nickname").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("agent_id").setDescription("Optional stable agent id for the streamer PC").setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("agent_set")
                .setDescription("Bind an OBS agent to a registered streamer.")
                .addStringOption(option => option.setName("nickname").setDescription("Registered streamer nickname").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("agent_id").setDescription("Stable agent id running on the streamer PC").setRequired(true))
                .addStringOption(option => option.setName("agent_token").setDescription("Shared secret used by the local OBS agent").setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("agent_show")
                .setDescription("Show OBS agent config for a registered streamer.")
                .addStringOption(option => option.setName("nickname").setDescription("Registered streamer nickname").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("agent_clear")
                .setDescription("Remove OBS agent binding for a registered streamer.")
                .addStringOption(option => option.setName("nickname").setDescription("Registered streamer nickname").setAutocomplete(true).setRequired(true))
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        if (!interaction.guildId) {
            await interaction.reply({ content: t(locale, "commands.streamer.guild_only"), flags: ["Ephemeral"] });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            const response = await streamerService.listGuildStreamers(interaction.guildId);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.streamer.load_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "commands.streamer.title"))
                        .setDescription(response.data.length
                            ? response.data.map(streamer => [
                                `${streamer.isPrimary ? "⭐ " : ""}${streamer.nickname}`,
                                streamer.twitchUrl,
                                streamer.obsAgentId
                                    ? `Agent: ${streamer.obsAgentId} (${streamer.obsAgentOnline ? "online" : "offline"})`
                                    : "Agent: not configured",
                            ].join("\n")).join("\n\n")
                            : t(locale, "commands.streamer.empty"))
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (!await ensureBotAdmin(interaction)) return;

        if (subcommand === "register") {
            const response = await streamerService.registerGuildStreamer({
                discordGuildId: interaction.guildId,
                nickname: interaction.options.getString("nickname", true),
                twitchUrl: interaction.options.getString("twitch_url"),
                isPrimary: interaction.options.getBoolean("primary") ?? undefined,
                createdByDiscordId: interaction.user.id,
            });

            await interaction.reply({
                content: response.success
                    ? t(locale, "commands.streamer.register_success", { nickname: interaction.options.getString("nickname", true) })
                    : response.error.message ?? t(locale, "commands.streamer.register_failed"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "remove") {
            const nickname = interaction.options.getString("nickname", true);
            const response = await streamerService.removeGuildStreamer({
                discordGuildId: interaction.guildId,
                nickname,
            });

            await interaction.reply({
                content: response.success && response.data.removed
                    ? t(locale, "commands.streamer.remove_success", { nickname })
                    : t(locale, "commands.streamer.remove_missing"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "agent_pair") {
            const nickname = interaction.options.getString("nickname", true);
            const response = await streamerService.provisionStreamerObsAgent({
                discordGuildId: interaction.guildId,
                nickname,
                agentId: interaction.options.getString("agent_id"),
                updatedByDiscordId: interaction.user.id,
            });

            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? "Failed to generate OBS agent credentials.", flags: ["Ephemeral"] });
                return;
            }

            const envSnippet = [
                "OBS_AGENT_RELAY_URL=ws://YOUR_SERVER_HOST:8787",
                `OBS_AGENT_ID=${response.data.agentId}`,
                `OBS_AGENT_TOKEN=${response.data.agentToken}`,
                "",
                "OBS_WEBSOCKET_URL=ws://127.0.0.1:4455",
                "OBS_WEBSOCKET_PASSWORD=",
            ].join("\n");

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`OBS pairing for ${nickname}`)
                        .setDescription([
                            "Use this on the streamer PC where OBS is running.",
                            "The streamer machine opens an outgoing connection to your server relay, so the bot and OBS do not need to share one LAN.",
                        ].join("\n\n"))
                        .addFields(
                            { name: "Relay model", value: "Server bot hosts the relay. Streamer PC runs the local OBS agent and connects outward to it." },
                            { name: "Copy into .env.agent", value: `\`\`\`env\n${envSnippet}\n\`\`\`` },
                            { name: "Next steps", value: "1. Put these values on the streamer PC.\n2. Start the agent with `npm run agent`.\n3. Check `/streamer agent_show` or `/streamer list`." },
                        )
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "agent_set") {
            const nickname = interaction.options.getString("nickname", true);
            const response = await streamerService.setStreamerObsAgent({
                discordGuildId: interaction.guildId,
                nickname,
                agentId: interaction.options.getString("agent_id", true),
                agentToken: interaction.options.getString("agent_token", true),
                updatedByDiscordId: interaction.user.id,
            });

            await interaction.reply({
                content: response.success
                    ? `OBS agent '${response.data.agentId}' is now bound to streamer '${nickname}'.`
                    : response.error.message ?? "Failed to bind OBS agent.",
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "agent_show") {
            const nickname = interaction.options.getString("nickname", true);
            const response = await streamerService.getStreamerObsAgent({
                discordGuildId: interaction.guildId,
                nickname,
            });

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`OBS agent for ${nickname}`)
                        .setDescription(response.success && response.data
                            ? `Agent ID: ${response.data.agentId}\nToken: ${response.data.tokenMask}\nStatus: ${response.data.online ? "online" : "offline"}`
                            : "No OBS agent configured for this streamer.")
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "agent_clear") {
            const nickname = interaction.options.getString("nickname", true);
            const response = await streamerService.clearStreamerObsAgent({
                discordGuildId: interaction.guildId,
                nickname,
            });

            await interaction.reply({
                content: response.success
                    ? `OBS agent binding for '${nickname}' was removed.`
                    : response.error.message ?? "Failed to clear OBS agent binding.",
                flags: ["Ephemeral"],
            });
        }
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        if (!interaction.guildId) {
            await interaction.respond([]);
            return;
        }

        const focused = interaction.options.getFocused(true);
        if (focused.name !== "nickname") {
            await interaction.respond([]);
            return;
        }

        const response = await streamerService.searchGuildStreamers(interaction.guildId, String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}
