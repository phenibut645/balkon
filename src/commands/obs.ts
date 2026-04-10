import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { ObsMediaAction, obsService } from "../core/ObsService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getNotAvailable, getUnknown, getUserLocale, getVisibleState, getYesNo } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ObsCommand extends Command {
    commandName: CommandName = "obs";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("OBS WebSocket control commands.")
        .addSubcommand(subcommand => subcommand.setName("status").setDescription("Show OBS connection status."))
        .addSubcommand(subcommand => subcommand.setName("config_show").setDescription("Show current OBS connection configuration."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("config_set")
                .setDescription("Save OBS WebSocket URL and password in the database.")
                .addStringOption(option => option.setName("url").setDescription("OBS WebSocket URL like ws://127.0.0.1:4455").setRequired(true))
                .addStringOption(option => option.setName("password").setDescription("OBS WebSocket password. Leave empty in OBS and skip here if not used.").setRequired(false))
        )
        .addSubcommand(subcommand => subcommand.setName("config_clear").setDescription("Clear OBS config from database and fallback to .env values."))
        .addSubcommand(subcommand => subcommand.setName("reconnect").setDescription("Reconnect to OBS."))
        .addSubcommand(subcommand => subcommand.setName("scenes").setDescription("List available OBS scenes."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("set_text")
                .setDescription("Update a text input source.")
                .addStringOption(option => option.setName("source").setDescription("Text input source name").setRequired(true))
                .addStringOption(option => option.setName("text").setDescription("New text value").setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("media_action")
                .setDescription("Trigger a media input action.")
                .addStringOption(option => option.setName("source").setDescription("Media input source name").setRequired(true))
                .addStringOption(option =>
                    option
                        .setName("action")
                        .setDescription("Media action")
                        .setRequired(true)
                        .addChoices(
                            { name: "Play", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY" },
                            { name: "Pause", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" },
                            { name: "Stop", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP" },
                            { name: "Restart", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" },
                            { name: "Next", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT" },
                            { name: "Previous", value: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS" },
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("switch_scene")
                .setDescription("Switch the current program scene.")
                .addStringOption(option => option.setName("scene").setDescription("Scene name").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("source_visibility")
                .setDescription("Toggle source visibility in a scene.")
                .addStringOption(option => option.setName("scene").setDescription("Scene name").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("source").setDescription("Source name").setAutocomplete(true).setRequired(true))
                .addBooleanOption(option => option.setName("visible").setDescription("Whether the source should be visible").setRequired(true))
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const locale = await getUserLocale(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === "status") {
                const status = await obsService.getStatus();
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(t(locale, "commands.obs.status_title"))
                            .addFields(
                                { name: t(locale, "commands.obs.connected"), value: getYesNo(locale, status.connected), inline: true },
                                { name: t(locale, "commands.obs.endpoint"), value: status.endpoint ?? getNotAvailable(locale), inline: true },
                                { name: t(locale, "commands.obs.config_source"), value: status.configSource, inline: true },
                                { name: t(locale, "commands.obs.current_scene"), value: status.currentSceneName ?? getUnknown(locale), inline: true },
                                { name: t(locale, "commands.obs.obs_version"), value: status.obsVersion ?? getUnknown(locale), inline: true },
                                { name: t(locale, "commands.obs.websocket_version"), value: status.websocketVersion ?? getUnknown(locale), inline: true },
                            )
                    ],
                    flags: ["Ephemeral"],
                });
                return;
            }

            if (subcommand === "config_show") {
                const config = await obsService.getMaskedConnectionConfig();
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(t(locale, "commands.obs.config_title"))
                            .addFields(
                                { name: t(locale, "commands.obs.config_source"), value: config.source, inline: true },
                                { name: t(locale, "commands.obs.url"), value: config.url ?? getNotAvailable(locale), inline: false },
                                { name: t(locale, "commands.obs.password"), value: config.passwordMask ?? t(locale, "commands.obs.not_set"), inline: false },
                            )
                    ],
                    flags: ["Ephemeral"],
                });
                return;
            }

            if (subcommand === "config_set") {
                const url = interaction.options.getString("url", true);
                const password = interaction.options.getString("password");
                await obsService.setConnectionConfig({
                    url,
                    password,
                    updatedByDiscordId: interaction.user.id,
                });
                await interaction.reply({ content: t(locale, "commands.obs.config_saved"), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "config_clear") {
                await obsService.clearConnectionConfig(interaction.user.id);
                await interaction.reply({ content: t(locale, "commands.obs.config_cleared"), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "reconnect") {
                const status = await obsService.reconnect();
                await interaction.reply({ content: t(locale, "commands.obs.reconnect_done", { connected: getYesNo(locale, status.connected), scene: status.currentSceneName ?? getUnknown(locale) }), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "scenes") {
                const scenes = await obsService.listScenes();
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(t(locale, "commands.obs.scenes_title"))
                            .setDescription(scenes.length ? scenes.map(scene => scene.sceneName).join("\n") : t(locale, "commands.obs.no_scenes"))
                    ],
                    flags: ["Ephemeral"],
                });
                return;
            }

            if (subcommand === "set_text") {
                const sourceName = interaction.options.getString("source", true);
                const text = interaction.options.getString("text", true);
                await obsService.setTextInputText(sourceName, text);
                await interaction.reply({ content: t(locale, "commands.obs.text_updated", { source: sourceName }), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "media_action") {
                const sourceName = interaction.options.getString("source", true);
                const action = interaction.options.getString("action", true) as ObsMediaAction;
                await obsService.triggerMediaInputAction(sourceName, action);
                await interaction.reply({ content: t(locale, "commands.obs.media_sent", { action, source: sourceName }), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "switch_scene") {
                const sceneName = interaction.options.getString("scene", true);
                await obsService.switchScene(sceneName);
                await interaction.reply({ content: t(locale, "commands.obs.switched", { scene: sceneName }), flags: ["Ephemeral"] });
                return;
            }

            if (subcommand === "source_visibility") {
                const sceneName = interaction.options.getString("scene", true);
                const sourceName = interaction.options.getString("source", true);
                const visible = interaction.options.getBoolean("visible", true);
                await obsService.setSourceVisibility(sceneName, sourceName, visible);
                await interaction.reply({ content: t(locale, "commands.obs.visibility", { source: sourceName, scene: sceneName, state: getVisibleState(locale, visible) }), flags: ["Ephemeral"] });
            }
        } catch (error) {
            await interaction.reply({ content: error instanceof Error ? error.message : t(locale, "commands.obs.failed"), flags: ["Ephemeral"] });
        }
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "scene") {
            await interaction.respond(await obsService.searchScenes(String(focused.value ?? "")));
            return;
        }

        if (focused.name === "source") {
            const rawScene = interaction.options.data.find(option => option.name === "scene")?.value;
            const sceneName = typeof rawScene === "string" ? rawScene : "";
            if (!sceneName) {
                await interaction.respond([]);
                return;
            }

            await interaction.respond(await obsService.searchSceneItems(sceneName, String(focused.value ?? "")));
            return;
        }

        await interaction.respond([]);
    };
}