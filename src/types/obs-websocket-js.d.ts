declare module "obs-websocket-js" {
    export interface OBSWebSocketConnectResult {
        obsWebSocketVersion?: string | null;
    }

    export default class OBSWebSocket {
        connect(url: string, password?: string): Promise<OBSWebSocketConnectResult>;
        disconnect(): Promise<void>;
        call(requestType: string, requestData?: Record<string, unknown>): Promise<unknown>;
        on(eventName: string, listener: (...args: unknown[]) => void): void;
    }
}