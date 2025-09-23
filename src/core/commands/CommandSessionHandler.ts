export interface Sessions {
    [key: string]: any;
}

const defaultSessionExpirationTime = 30000;

class CommandSessionHandler {
    sessions: Map<string, Map<string, any>> = new Map();
    updateSessions: Record<string, string> = {}

    createSession(
        memberId: string,
        command: string,
        data: any,
        ttlMs: number = defaultSessionExpirationTime,
    ) {
        if (!this.sessions.has(memberId)) {
            this.sessions.set(memberId, new Map());
        }
        const memberSessions = this.sessions.get(memberId)!;
        memberSessions.set(command, data);
        this.setExpiration(memberId, command, ttlMs,)
        return command;
    }

    setExpiration(memberId: string, command: string, ttlMs: number) {
        setTimeout(() => {
            const session = this.getSession(memberId, command)
            session.ttlMs
            if(this.updateSessions[memberId] && this.updateSessions[memberId] === command){
                this.setExpiration(memberId, command, ttlMs)
            }
            else{
                this.deleteSession(memberId, command)
            }
        }, ttlMs);
    }

    deleteSession(memberId: string, command: string) {
        const memberSessions = this.sessions.get(memberId);
        if (!memberSessions) return;

        memberSessions.delete(command);

        if (memberSessions.size === 0) {
            this.sessions.delete(memberId);
        }
    }
    
    updateSession(memberId: string, command: string, data: any) {
        const memberSessions = this.sessions.get(memberId)
        this.updateSessions[memberId] = command
        if(!memberSessions) return;

        memberSessions.set(command, data)
    }

    getSession(memberId: string, command: string) {
        return this.sessions.get(memberId)?.get(command);
    }
}


export const commandSessionHandler = new CommandSessionHandler();

// пофиксить обновление таймера на удаление сессии, сейчас криво