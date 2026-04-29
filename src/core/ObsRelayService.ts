import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import { WebSocket, WebSocketServer } from "ws";
import { obsAgentRelayPort, obsAgentRequestTimeoutMs } from "../config.js";
import pool from "../db.js";
import { ObsRelayCommandMessage, ObsRelayCommandName, ObsRelayGetStatusResult, ObsRelayIncomingMessage, ObsRelayOutgoingMessage, ObsRelayPongMessage } from "../types/obs-agent.types.js";

interface AgentCredentialRow extends RowDataPacket {
    setting_value: string | null;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    timeout: NodeJS.Timeout;
}

export class ObsRelayService {
    private static instance: ObsRelayService;
    private server: WebSocketServer | null = null;
    private readonly agentSockets = new Map<string, WebSocket>();
    private readonly socketAgents = new WeakMap<WebSocket, string>();
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private started = false;

    static getInstance(): ObsRelayService {
        if (!ObsRelayService.instance) {
            ObsRelayService.instance = new ObsRelayService();
        }

        return ObsRelayService.instance;
    }

    start() {
        if (this.started) {
            return;
        }

        this.server = new WebSocketServer({ port: obsAgentRelayPort });
        this.started = true;

        this.server.on("connection", socket => {
            socket.once("message", async rawMessage => {
                try {
                    const parsedMessage = this.parseIncomingMessage(rawMessage);
                    if (parsedMessage.type !== "hello") {
                        socket.send(JSON.stringify({ type: "error", error: "Expected hello message first." } satisfies ObsRelayOutgoingMessage));
                        socket.close();
                        return;
                    }

                    const authenticated = await this.authenticateAgent(parsedMessage.agentId, parsedMessage.agentToken);
                    if (!authenticated) {
                        socket.send(JSON.stringify({ type: "error", error: "Authentication failed." } satisfies ObsRelayOutgoingMessage));
                        socket.close();
                        return;
                    }

                    this.registerAgentSocket(parsedMessage.agentId, socket);
                    socket.send(JSON.stringify({ type: "hello_ack", agentId: parsedMessage.agentId } satisfies ObsRelayOutgoingMessage));

                    socket.on("message", message => {
                        this.handleAgentMessage(socket, message);
                    });

                    socket.on("close", () => {
                        this.unregisterAgentSocket(socket);
                    });

                    socket.on("error", error => {
                        console.error("OBS agent socket error", error);
                        this.unregisterAgentSocket(socket);
                    });
                } catch (error) {
                    socket.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Invalid hello message." } satisfies ObsRelayOutgoingMessage));
                    socket.close();
                }
            });
        });

        this.server.on("listening", () => {
            console.log(`OBS relay server listening on port ${obsAgentRelayPort}`);
        });
    }

    isAgentConnected(agentId: string): boolean {
        const socket = this.agentSockets.get(agentId);
        return Boolean(socket && socket.readyState === WebSocket.OPEN);
    }

    async sendCommand<T>(agentId: string, command: ObsRelayCommandName, payload?: Record<string, unknown>): Promise<T> {
        const socket = this.agentSockets.get(agentId);
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error(`OBS agent '${agentId}' is offline.`);
        }

        const requestId = crypto.randomUUID();
        const message: ObsRelayCommandMessage = {
            type: "command",
            requestId,
            command,
            payload,
        };

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`OBS agent '${agentId}' did not respond in time.`));
            }, obsAgentRequestTimeoutMs);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            socket.send(JSON.stringify(message));
        });
    }

    async getAgentStatus(agentId: string): Promise<ObsRelayGetStatusResult> {
        return this.sendCommand<ObsRelayGetStatusResult>(agentId, "obs.getStatus");
    }

    private parseIncomingMessage(rawMessage: WebSocket.RawData): ObsRelayIncomingMessage {
        return JSON.parse(rawMessage.toString()) as ObsRelayIncomingMessage;
    }

    private async authenticateAgent(agentId: string, agentToken: string): Promise<boolean> {
        const [rows] = await pool.query<AgentCredentialRow[]>(
            `SELECT setting_value FROM bot_settings WHERE setting_key = ? LIMIT 1`,
            [this.getAgentCredentialKey(agentId)]
        );

        return Boolean(rows[0]?.setting_value && rows[0].setting_value === agentToken);
    }

    private handleAgentMessage(socket: WebSocket, rawMessage: WebSocket.RawData) {
        try {
            const parsedMessage = this.parseIncomingMessage(rawMessage);
            if (parsedMessage.type === "ping") {
                if (typeof parsedMessage.ts !== "number" || !Number.isFinite(parsedMessage.ts)) {
                    return;
                }

                const pong: ObsRelayPongMessage = {
                    type: "pong",
                    ts: parsedMessage.ts,
                };

                socket.send(JSON.stringify(pong));
                return;
            }

            if (parsedMessage.type === "result") {
                const pending = this.pendingRequests.get(parsedMessage.requestId);
                if (!pending) {
                    return;
                }

                clearTimeout(pending.timeout);
                this.pendingRequests.delete(parsedMessage.requestId);
                pending.resolve(parsedMessage.result);
                return;
            }

            if (parsedMessage.type === "command_result") {
                const pending = this.pendingRequests.get(parsedMessage.requestId);
                if (!pending) {
                    return;
                }

                clearTimeout(pending.timeout);
                this.pendingRequests.delete(parsedMessage.requestId);
                if (parsedMessage.ok) {
                    pending.resolve(parsedMessage.data);
                    return;
                }

                pending.reject(new Error(parsedMessage.error ?? "OBS agent command failed."));
                return;
            }

            if (parsedMessage.type === "error" && parsedMessage.requestId) {
                const pending = this.pendingRequests.get(parsedMessage.requestId);
                if (!pending) {
                    return;
                }

                clearTimeout(pending.timeout);
                this.pendingRequests.delete(parsedMessage.requestId);
                pending.reject(new Error(parsedMessage.error));
            }
        } catch (error) {
            console.error("Failed to handle OBS agent message", error);
            this.unregisterAgentSocket(socket);
        }
    }

    private registerAgentSocket(agentId: string, socket: WebSocket) {
        const previousSocket = this.agentSockets.get(agentId);
        if (previousSocket && previousSocket !== socket) {
            previousSocket.close();
        }

        this.agentSockets.set(agentId, socket);
        this.socketAgents.set(socket, agentId);
    }

    private unregisterAgentSocket(socket: WebSocket) {
        const agentId = this.socketAgents.get(socket);
        if (!agentId) {
            return;
        }

        const currentSocket = this.agentSockets.get(agentId);
        if (currentSocket === socket) {
            this.agentSockets.delete(agentId);
        }
    }

    private getAgentCredentialKey(agentId: string) {
        return `obs_agent_credentials:${agentId}`;
    }
}

export const obsRelayService = ObsRelayService.getInstance();