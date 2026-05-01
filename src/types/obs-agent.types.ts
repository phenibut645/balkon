import { ObsMediaAction } from "../core/ObsService.js";

export type ObsRelayCommandName =
    | "obs.getStatus"
    | "obs.listScenes"
    | "obs.listSceneItems"
    | "obs.scenes.list"
    | "obs.scene.items.list"
    | "obs.scene.item.transform.set"
    | "obs.scene.item.index.set"
    | "obs.scene.source.text.create"
    | "obs.switchScene"
    | "obs.setSourceVisibility"
    | "obs.setTextInputText"
    | "obs.triggerMediaInputAction"
    | "obs.media.show";

export interface ObsRelayHelloMessage {
    type: "hello";
    agentId: string;
    agentToken: string;
}

export interface ObsRelayHelloAckMessage {
    type: "hello_ack";
    agentId: string;
}

export interface ObsRelayPingMessage {
    type: "ping";
    ts: number;
}

export interface ObsRelayPongMessage {
    type: "pong";
    ts: number;
}

export interface ObsRelayCommandMessage {
    type: "command";
    requestId: string;
    command: ObsRelayCommandName;
    payload?: Record<string, unknown>;
}

export interface ObsRelayResultMessage {
    type: "result";
    requestId: string;
    result?: unknown;
}

export interface ObsRelayCommandResultMessage {
    type: "command_result";
    requestId: string;
    ok: boolean;
    data?: unknown;
    error?: string;
}

export interface ObsRelayErrorMessage {
    type: "error";
    requestId?: string;
    error: string;
}

export type ObsRelayIncomingMessage = ObsRelayHelloMessage | ObsRelayResultMessage | ObsRelayCommandResultMessage | ObsRelayErrorMessage | ObsRelayPingMessage;
export type ObsRelayOutgoingMessage = ObsRelayHelloAckMessage | ObsRelayCommandMessage | ObsRelayErrorMessage | ObsRelayPongMessage;

export interface ObsRelayGetStatusResult {
    connected: boolean;
    currentSceneName: string | null;
    endpoint: string | null;
    obsVersion: string | null;
    websocketVersion: string | null;
}

export interface ObsRelaySceneItem {
    sceneItemId: number;
    sourceName: string;
    enabled: boolean;
}

export interface ObsRelaySetSourceVisibilityPayload {
    sceneName: string;
    sourceName: string;
    visible: boolean;
}

export interface ObsRelaySetTextInputPayload {
    inputName: string;
    text: string;
}

export interface ObsRelayMediaActionPayload {
    inputName: string;
    mediaAction: ObsMediaAction;
}

export interface ObsRelayMediaShowPayload {
    kind: "image" | "gif";
    url: string;
    durationMs: number;
    title: string;
}

export interface ObsRelayMediaShowResult {
    ok: true;
}

export interface ObsRelaySceneItemTransformSetPayload {
    sceneName: string;
    sceneItemId: number;
    sourceName?: string | null;
    transform: {
        positionX: number;
        positionY: number;
        scaleX: number;
        scaleY: number;
        rotation?: number;
    };
}

export interface ObsRelaySceneItemTransformSetResult {
    sceneName: string;
    sceneItemId: number;
    sourceName: string | null;
    transform: {
        positionX: number;
        positionY: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
        width?: number;
        height?: number;
    };
}

export interface ObsRelaySceneItemIndexSetPayload {
    sceneName: string;
    sceneItemId: number;
    sourceName?: string | null;
    sceneItemIndex: number;
}

export interface ObsRelaySceneItemIndexListItem {
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
}

export interface ObsRelaySceneItemIndexSetResult {
    sceneName: string;
    sceneItemId: number;
    sourceName: string | null;
    sceneItemIndex: number;
    items: ObsRelaySceneItemIndexListItem[];
}

export interface ObsRelayTextSourceCreatePayload {
    sceneName: string;
    sourceName?: string | null;
    text: string;
    positionX?: number;
    positionY?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
}

export interface ObsRelayTextSourceCreateResult {
    sceneName: string;
    sceneItemId: number;
    sourceName: string;
    inputKind: string;
    transform: {
        positionX: number;
        positionY: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
        width?: number;
        height?: number;
    };
    items: ObsRelaySceneItemIndexListItem[];
}