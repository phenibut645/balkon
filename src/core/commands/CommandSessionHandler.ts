export interface Sessions {
    [key: string]: any;
}

const defaultSessionExpirationTime = 30000;

class CommandSessionHandler {
    sessions: Map<string, Map<string, any>> = new Map();
    expirations: Map<string, Map<string, NodeJS.Timeout>> = new Map();

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

    createSession(
        memberId: string,
        command: string,
        data: any,
        ttlMs: number = defaultSessionExpirationTime,
    ) {
        const memberSessions = this.ensureMemberMap(this.sessions, memberId);
        memberSessions.set(command, data);

        this.setExpiration(memberId, command, ttlMs)
        return command;
    }

    setExpiration(memberId: string, command: string, ttlMs: number) {
        this.clearExpiration(memberId, command);

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

        if (memberSessions.size === 0) {
            this.sessions.delete(memberId);
        }
    }
    
    updateSession(memberId: string, command: string, data: any, ttlMs: number = defaultSessionExpirationTime) {
        const memberSessions = this.sessions.get(memberId)
        if(!memberSessions) return;

        memberSessions.set(command, data)
        this.setExpiration(memberId, command, ttlMs);
    }

    getSession(memberId: string, command: string) {
        return this.sessions.get(memberId)?.get(command);
    }
}


export const commandSessionHandler = new CommandSessionHandler();
