export const OBS_AGENT_BINDING_PREFIX = "obs_agent_binding:";
export const OBS_AGENT_STALE_MS = 120_000;
export const OBS_COMMAND_TIMEOUT_MS = 20_000;
export const OBS_COMMAND_POLL_MS = 400;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeJsonObjectParse(jsonText: string | null): Record<string, unknown> | null {
  if (!jsonText) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
