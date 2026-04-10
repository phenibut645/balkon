import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { streamerService } from "../core/StreamerService.js";
import { Command } from "../core/commands/Command.js";
import { ObsMediaAction } from "../core/ObsService.js";
import { CommandAccessLevels, ItemServiceActionType } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { itemService } from "../core/ItemService.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ServiceActionCommand extends Command {
    commandName: CommandName = "serviceaction";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Bind OBS actions to service item templates.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("show")
                .setDescription("Show OBS action bound to a service item.")
                .addIntegerOption(option => option.setName("item_id").setDescription("Service item template id").setAutocomplete(true).setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("bind_scene")
                .setDescription("Bind a scene switch action to a service item.")
                .addIntegerOption(option => option.setName("item_id").setDescription("Service item template id").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("scene").setDescription("Target OBS scene").setRequired(true))
                .addBooleanOption(option => option.setName("consume").setDescription("Consume item on use").setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("bind_visibility")
                .setDescription("Bind a source visibility toggle to a service item.")
                .addIntegerOption(option => option.setName("item_id").setDescription("Service item template id").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("scene").setDescription("Target OBS scene").setRequired(true))
                .addStringOption(option => option.setName("source").setDescription("OBS source name").setRequired(true))
                .addBooleanOption(option => option.setName("visible").setDescription("Visibility state to apply").setRequired(true))
                .addBooleanOption(option => option.setName("consume").setDescription("Consume item on use").setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("bind_text")
                .setDescription("Bind a text update action to a service item.")
                .addIntegerOption(option => option.setName("item_id").setDescription("Service item template id").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("source").setDescription("OBS text input source").setRequired(true))
                .addStringOption(option => option.setName("template").setDescription("Text template with placeholders like {streamer}, {custom_text}, {item}").setRequired(false))
                .addBooleanOption(option => option.setName("consume").setDescription("Consume item on use").setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("bind_media")
                .setDescription("Bind a media input action to a service item.")
                .addIntegerOption(option => option.setName("item_id").setDescription("Service item template id").setAutocomplete(true).setRequired(true))
                .addStringOption(option => option.setName("source").setDescription("OBS media input source").setRequired(true))
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
                .addBooleanOption(option => option.setName("consume").setDescription("Consume item on use").setRequired(false))
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const locale = await getUserLocale(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();
        const itemId = interaction.options.getInteger("item_id", true);

        if (subcommand === "show") {
            const response = await streamerService.getItemServiceAction(itemId);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.serviceaction.load_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "commands.serviceaction.title", { itemId: String(itemId) }))
                        .setDescription(response.data
                            ? [
                                t(locale, "commands.serviceaction.type", { value: response.data.actionType }),
                                response.data.sceneName ? t(locale, "commands.serviceaction.scene", { value: response.data.sceneName }) : null,
                                response.data.sourceName ? t(locale, "commands.serviceaction.source", { value: response.data.sourceName }) : null,
                                response.data.textTemplate ? t(locale, "commands.serviceaction.template", { value: response.data.textTemplate }) : null,
                                response.data.mediaAction ? t(locale, "commands.serviceaction.media_action", { value: response.data.mediaAction }) : null,
                                response.data.visible !== null ? t(locale, "commands.serviceaction.visible", { value: response.data.visible ? "true" : "false" }) : null,
                                t(locale, "commands.serviceaction.consume", { value: response.data.consumeOnUse ? "true" : "false" }),
                            ].filter(Boolean).join("\n")
                            : t(locale, "commands.serviceaction.empty"))
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        const baseInput = {
            itemTemplateId: itemId,
            updatedByDiscordId: interaction.user.id,
            consumeOnUse: interaction.options.getBoolean("consume") ?? true,
        };

        let response;
        if (subcommand === "bind_scene") {
            response = await streamerService.upsertItemServiceAction({
                ...baseInput,
                actionType: "switch_scene",
                sceneName: interaction.options.getString("scene", true),
            });
        } else if (subcommand === "bind_visibility") {
            response = await streamerService.upsertItemServiceAction({
                ...baseInput,
                actionType: "source_visibility",
                sceneName: interaction.options.getString("scene", true),
                sourceName: interaction.options.getString("source", true),
                visible: interaction.options.getBoolean("visible", true),
            });
        } else if (subcommand === "bind_text") {
            response = await streamerService.upsertItemServiceAction({
                ...baseInput,
                actionType: "set_text",
                sourceName: interaction.options.getString("source", true),
                textTemplate: interaction.options.getString("template"),
            });
        } else {
            response = await streamerService.upsertItemServiceAction({
                ...baseInput,
                actionType: "media_action",
                sourceName: interaction.options.getString("source", true),
                mediaAction: interaction.options.getString("action", true) as ObsMediaAction,
            });
        }

        await interaction.reply({
            content: response.success
                ? t(locale, "commands.serviceaction.bind_success", { itemId: String(itemId) })
                : response.error.message ?? t(locale, "commands.serviceaction.bind_failed"),
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "item_id") {
            await interaction.respond([]);
            return;
        }

        const response = await itemService.searchItemTemplates(String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}
