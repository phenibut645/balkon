import { commandSessionInteractionCooldownMs, commandSessionMaxActive, commandSessionTtlMs } from "../../config.js";

export interface Sessions {
    [key: string]: any;
}

const defaultSessionExpirationTime = commandSessionTtlMs;

interface SessionMeta {
    lastTouchedAt: number;
    expiresAt: number;
}

class CommandSessionHandler {
    sessions: Map<string, Map<string, any>> = new Map();
    expirations: Map<string, Map<string, NodeJS.Timeout>> = new Map();
    metadata: Map<string, Map<string, SessionMeta>> = new Map();
    pendingInteractions: Set<string> = new Set();
    lastInteractionFinishedAt: Map<string, number> = new Map();

    private ensureMemberMap<T>(store: Map<string, Map<string, T>>, memberId: string): Map<string, T> {
        if (!store.has(memberId)) {
            store.set(memberId, new Map());
        }

        return store.get(memberId)!;
    }

    private clearExpiration(memberId: string, command: string) {
        const memberExpirations = this.expirations.get(memberId);
        const timer = memberExpirations?.get(command);

        if (timer) {
            clearTimeout(timer);
            memberExpirations?.delete(command);
        }

        if (memberExpirations && memberExpirations.size === 0) {
            this.expirations.delete(memberId);
        }
    }

    private makeInteractionKey(memberId: string, command: string): string {
        return `${memberId}:${command}`;
    }

    private setMeta(memberId: string, command: string, ttlMs: number) {
        const memberMetadata = this.ensureMemberMap(this.metadata, memberId);
        memberMetadata.set(command, {
            lastTouchedAt: Date.now(),
            expiresAt: Date.now() + ttlMs,
        });
    }

    private clearMeta(memberId: string, command: string) {
        const memberMetadata = this.metadata.get(memberId);
        memberMetadata?.delete(command);

        if (memberMetadata && memberMetadata.size === 0) {
            this.metadata.delete(memberId);
        }
    }

    private countActiveSessions(): number {
        let total = 0;
        for (const memberSessions of this.sessions.values()) {
            total += memberSessions.size;
        }

        return total;
    }

    private pruneOldestSessions(maxSessions: number = commandSessionMaxActive) {
        const activeSessions = this.countActiveSessions();
        if (activeSessions <= maxSessions) {
            return;
        }

        const candidates: Array<{ memberId: string; command: string; lastTouchedAt: number }> = [];
        for (const [memberId, memberMetadata] of this.metadata.entries()) {
            for (const [command, meta] of memberMetadata.entries()) {
                candidates.push({ memberId, command, lastTouchedAt: meta.lastTouchedAt });
            }
        }

        candidates
            .sort((left, right) => left.lastTouchedAt - right.lastTouchedAt)
            .slice(0, activeSessions - maxSessions)
            .forEach(candidate => this.deleteSession(candidate.memberId, candidate.command));
    }

    createSession(
        memberId: string,
        command: string,
        data: any,
        ttlMs: number = defaultSessionExpirationTime,
    ) {
        const memberSessions = this.ensureMemberMap(this.sessions, memberId);
        memberSessions.set(command, data);
        this.setMeta(memberId, command, ttlMs);

        this.setExpiration(memberId, command, ttlMs)
        this.pruneOldestSessions();
        return command;
    }

    setExpiration(memberId: string, command: string, ttlMs: number) {
        this.clearExpiration(memberId, command);
        this.setMeta(memberId, command, ttlMs);

        const memberExpirations = this.ensureMemberMap(this.expirations, memberId);
        const timer = setTimeout(() => {
            this.deleteSession(memberId, command);
        }, ttlMs);

        memberExpirations.set(command, timer);
    }

    deleteSession(memberId: string, command: string) {
        const memberSessions = this.sessions.get(memberId);
        if (!memberSessions) return;

        memberSessions.delete(command);
        this.clearExpiration(memberId, command);
        this.clearMeta(memberId, command);
        this.pendingInteractions.delete(this.makeInteractionKey(memberId, command));
        this.lastInteractionFinishedAt.delete(this.makeInteractionKey(memberId, command));

        if (memberSessions.size === 0) {
            this.sessions.delete(memberId);
        }
    }
    
    updateSession(memberId: string, command: string, data: any, ttlMs: number = defaultSessionExpirationTime) {
        const memberSessions = this.sessions.get(memberId)
        if(!memberSessions) return;

        memberSessions.set(command, data)
        this.setExpiration(memberId, command, ttlMs);
        this.pruneOldestSessions();
    }

    getSession(memberId: string, command: string) {
        return this.sessions.get(memberId)?.get(command);
    }

    touchSession(memberId: string, command: string, ttlMs: number = defaultSessionExpirationTime) {
        const existingSession = this.getSession(memberId, command);
        if (!existingSession) {
            return;
        }

        this.setExpiration(memberId, command, ttlMs);
    }

    beginInteraction(memberId: string, command: string, cooldownMs: number = commandSessionInteractionCooldownMs): boolean {
        const key = this.makeInteractionKey(memberId, command);
        if (this.pendingInteractions.has(key)) {
            return false;
        }

        const lastFinishedAt = this.lastInteractionFinishedAt.get(key);
        if (typeof lastFinishedAt === "number" && Date.now() - lastFinishedAt < cooldownMs) {
            return false;
        }

        this.pendingInteractions.add(key);
        return true;
    }

    endInteraction(memberId: string, command: string) {
        const key = this.makeInteractionKey(memberId, command);
        this.pendingInteractions.delete(key);
        this.lastInteractionFinishedAt.set(key, Date.now());
    }
}


export const commandSessionHandler = new CommandSessionHandler();
