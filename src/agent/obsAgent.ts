import dotenv from "dotenv";
import OBSWebSocket from "obs-websocket-js";
import { WebSocket } from "ws";
import { ObsMediaAction } from "../core/ObsService.js";
import {
    ObsRelayCommandMessage,
    ObsRelayErrorMessage,
    ObsRelayGetStatusResult,
    ObsRelayHelloAckMessage,
    ObsRelayHelloMessage,
    ObsRelayMediaActionPayload,
    ObsRelayOutgoingMessage,
    ObsRelayResultMessage,
    ObsRelaySceneItem,
    ObsRelaySetSourceVisibilityPayload,
    ObsRelaySetTextInputPayload,
} from "../types/obs-agent.types.js";

interface ObsVersionResponse {
    obsVersion?: string | null;
    obsWebSocketVersion?: string | null;
}

interface ObsCurrentProgramSceneResponse {
    currentProgramSceneName?: string | null;
}

interface ObsSceneListEntry {
    sceneName?: string | null;
}

interface ObsSceneListResponse {
    scenes: ObsSceneListEntry[];
}

interface ObsSceneItemEntry {
    sceneItemId?: number | null;
    sourceName?: string | null;
    sceneItemEnabled?: boolean | null;
}

interface ObsSceneItemListResponse {
    sceneItems: ObsSceneItemEntry[];
}

interface ObsConnectResponse {
    obsWebSocketVersion?: string | null;
}

dotenv.config({ path: ".env.agent" });

const relayUrl = process.env.OBS_AGENT_RELAY_URL?.trim();
const agentId = process.env.OBS_AGENT_ID?.trim();
const agentToken = process.env.OBS_AGENT_TOKEN?.trim();
const obsUrl = process.env.OBS_WEBSOCKET_URL?.trim();
const obsPassword = process.env.OBS_WEBSOCKET_PASSWORD?.trim() || undefined;

if (!relayUrl || !agentId || !agentToken || !obsUrl) {
    console.error("Missing OBS agent configuration. Check .env.agent.");
    process.exit(1);
}

const resolvedRelayUrl = relayUrl;
const resolvedAgentId = agentId;
const resolvedAgentToken = agentToken;
const resolvedObsUrl = obsUrl;

class LocalObsAgent {
    private readonly obs = new OBSWebSocket();
    private relaySocket: WebSocket | null = null;
    private connectedToObs = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private lastObsVersion: string | null = null;
    private lastWsVersion: string | null = null;

    start() {
        this.connectRelay();
    }

    private connectRelay() {
        console.log(`Connecting OBS agent '${resolvedAgentId}' to relay ${resolvedRelayUrl}`);
        const socket = new WebSocket(resolvedRelayUrl);
        this.relaySocket = socket;

        socket.on("open", () => {
            const hello: ObsRelayHelloMessage = {
                type: "hello",
                agentId: resolvedAgentId,
                agentToken: resolvedAgentToken,
            };

            socket.send(JSON.stringify(hello));
        });

        socket.on("message", async rawMessage => {
            try {
                const parsedMessage = JSON.parse(rawMessage.toString()) as ObsRelayHelloAckMessage | ObsRelayCommandMessage | ObsRelayErrorMessage;
                if (parsedMessage.type === "hello_ack") {
                    console.log(`OBS agent '${parsedMessage.agentId}' authenticated in relay.`);
                    return;
                }

                if (parsedMessage.type === "error") {
                    console.error(`Relay error: ${parsedMessage.error}`);
                    return;
                }

                if (parsedMessage.type === "command") {
                    await this.handleCommand(parsedMessage);
                }
            } catch (error) {
                console.error("Failed to process relay message", error);
            }
        });

        socket.on("close", () => {
            console.warn("Relay connection closed. Reconnecting in 5 seconds...");
            this.scheduleReconnect();
        });

        socket.on("error", error => {
            console.error("Relay socket error", error);
        });
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectRelay();
        }, 5_000);
    }

    private async handleCommand(message: ObsRelayCommandMessage) {
        try {
            const result = await this.executeCommand(message);
            const payload: ObsRelayResultMessage = {
                type: "result",
                requestId: message.requestId,
                result,
            };

            this.send(payload);
        } catch (error) {
            const payload: ObsRelayErrorMessage = {
                type: "error",
                requestId: message.requestId,
                error: error instanceof Error ? error.message : "Unknown OBS agent error.",
            };
            this.send(payload);
        }
    }

    private async executeCommand(message: ObsRelayCommandMessage) {
        await this.ensureObsConnected();

        switch (message.command) {
            case "obs.getStatus": {
                const currentScene = await this.obs.call("GetCurrentProgramScene") as ObsCurrentProgramSceneResponse;
                const versionInfo = await this.obs.call("GetVersion") as ObsVersionResponse;
                this.lastObsVersion = versionInfo.obsVersion ?? null;
                this.lastWsVersion = versionInfo.obsWebSocketVersion ?? null;

                const result: ObsRelayGetStatusResult = {
                    connected: true,
                    currentSceneName: String(currentScene.currentProgramSceneName ?? ""),
                    endpoint: resolvedObsUrl,
                    obsVersion: this.lastObsVersion,
                    websocketVersion: this.lastWsVersion,
                };

                return result;
            }
            case "obs.listScenes": {
                const result = await this.obs.call("GetSceneList") as ObsSceneListResponse;
                return result.scenes.map((scene: ObsSceneListEntry) => ({ sceneName: String(scene.sceneName ?? "") }));
            }
            case "obs.listSceneItems": {
                const sceneName = this.requireString(message.payload?.sceneName, "sceneName");
                const result = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
                return result.sceneItems.map((sceneItem: ObsSceneItemEntry) => ({
                    sceneItemId: Number(sceneItem.sceneItemId ?? NaN),
                    sourceName: String(sceneItem.sourceName ?? ""),
                    enabled: Boolean(sceneItem.sceneItemEnabled),
                } satisfies ObsRelaySceneItem));
            }
            case "obs.switchScene": {
                const sceneName = this.requireString(message.payload?.sceneName, "sceneName");
                await this.obs.call("SetCurrentProgramScene", { sceneName });
                return null;
            }
            case "obs.setSourceVisibility": {
                const payload = message.payload as ObsRelaySetSourceVisibilityPayload | undefined;
                const sceneName = this.requireString(payload?.sceneName, "sceneName");
                const sourceName = this.requireString(payload?.sourceName, "sourceName");
                const visible = this.requireBoolean(payload?.visible, "visible");
                const items = await this.obs.call("GetSceneItemList", { sceneName }) as ObsSceneItemListResponse;
                const targetItem = items.sceneItems.find((item: ObsSceneItemEntry) => String(item.sourceName ?? "").toLowerCase() === sourceName.toLowerCase());
                if (!targetItem) {
                    throw new Error(`Source '${sourceName}' not found in scene '${sceneName}'.`);
                }

                await this.obs.call("SetSceneItemEnabled", {
                    sceneName,
                    sceneItemId: Number(targetItem.sceneItemId),
                    sceneItemEnabled: visible,
                });
                return null;
            }
            case "obs.setTextInputText": {
                const payload = message.payload as ObsRelaySetTextInputPayload | undefined;
                const inputName = this.requireString(payload?.inputName, "inputName");
                const text = this.requireString(payload?.text, "text");
                await this.obs.call("SetInputSettings", {
                    inputName,
                    inputSettings: { text },
                    overlay: true,
                });
                return null;
            }
            case "obs.triggerMediaInputAction": {
                const payload = message.payload as ObsRelayMediaActionPayload | undefined;
                const inputName = this.requireString(payload?.inputName, "inputName");
                const mediaAction = this.requireString(payload?.mediaAction, "mediaAction") as ObsMediaAction;
                await this.obs.call("TriggerMediaInputAction", { inputName, mediaAction });
                return null;
            }
            default:
                throw new Error(`Unsupported relay command '${message.command}'.`);
        }
    }

    private async ensureObsConnected() {
        if (this.connectedToObs) {
            return;
        }

        const connectResult = await this.obs.connect(resolvedObsUrl, obsPassword) as ObsConnectResponse;
        this.connectedToObs = true;
        this.lastWsVersion = connectResult.obsWebSocketVersion ?? null;
        this.obs.on("ConnectionClosed", () => {
            this.connectedToObs = false;
        });
    }

    private send(payload: ObsRelayOutgoingMessage | ObsRelayResultMessage) {
        if (!this.relaySocket || this.relaySocket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.relaySocket.send(JSON.stringify(payload));
    }

    private requireString(value: unknown, fieldName: string) {
        if (typeof value !== "string" || !value.trim().length) {
            throw new Error(`Missing required field '${fieldName}'.`);
        }

        return value.trim();
    }

    private requireBoolean(value: unknown, fieldName: string) {
        if (typeof value !== "boolean") {
            throw new Error(`Missing required boolean field '${fieldName}'.`);
        }

        return value;
    }
}

new LocalObsAgent().start();