import { FastifyInstance } from "fastify";
import {
  apiSessionService,
  DiscordGuildResponse,
  DiscordTokenResponse,
  DiscordUserResponse,
  getSessionCookieConfig,
} from "./apiSessionService.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/users/@me";
const DISCORD_GUILDS_URL = "https://discord.com/api/users/@me/guilds";
const OAUTH_STATE_COOKIE_NAME = "balkon_oauth_state";
const OAUTH_STATE_COOKIE_TTL_SECONDS = 10 * 60;

function isProduction(): boolean {
  return process.env.NODE_ENV === "prod";
}

function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  successRedirectUrl: string;
  errorRedirectUrl: string;
} {
  const clientId = (process.env.DISCORD_OAUTH_CLIENT_ID ?? process.env.CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.DISCORD_OAUTH_REDIRECT_URI ?? "").trim();
  const scopes = (process.env.DISCORD_OAUTH_SCOPES ?? "identify guilds").trim() || "identify guilds";
  const webAppUrl = (process.env.WEB_APP_URL ?? "").trim() || "http://localhost:3000";
  const successRedirectUrl = (process.env.WEB_APP_AUTH_SUCCESS_URL ?? webAppUrl).trim() || webAppUrl;
  const errorRedirectUrl = (process.env.WEB_APP_AUTH_ERROR_URL ?? webAppUrl).trim() || webAppUrl;

  return { clientId, clientSecret, redirectUri, scopes, successRedirectUrl, errorRedirectUrl };
}

function addErrorQuery(url: string, reason: string): string {
  try {
    const target = new URL(url);
    target.searchParams.set("error", reason);
    return target.toString();
  } catch {
    return url;
  }
}

async function exchangeCodeForToken(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Failed to exchange authorization code");
  }

  const tokenData = await response.json() as DiscordTokenResponse;
  if (!tokenData.access_token) {
    throw new Error("OAuth token response is missing access token");
  }

  return tokenData;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUserResponse> {
  const response = await fetch(DISCORD_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load Discord user profile");
  }

  return await response.json() as DiscordUserResponse;
}

async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuildResponse[]> {
  const response = await fetch(DISCORD_GUILDS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load Discord user guilds");
  }

  return await response.json() as DiscordGuildResponse[];
}

export async function registerDiscordOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/discord", async (_request, reply) => {
    const { clientId, redirectUri, scopes, errorRedirectUrl } = getOAuthConfig();
    if (!clientId || !redirectUri) {
      return reply.redirect(addErrorQuery(errorRedirectUrl, "oauth_config"));
    }

    const state = apiSessionService.createStateToken();

    reply.setCookie(OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
      path: "/api/auth",
      maxAge: OAUTH_STATE_COOKIE_TTL_SECONDS,
    });

    const authorizeUrl = new URL(DISCORD_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("state", state);

    return reply.redirect(authorizeUrl.toString());
  });

  app.get("/auth/discord/callback", async (request, reply) => {
    const { clientId, clientSecret, redirectUri, scopes, successRedirectUrl, errorRedirectUrl } = getOAuthConfig();

    const query = request.query as Record<string, unknown>;
    const code = typeof query.code === "string" ? query.code : "";
    const returnedState = typeof query.state === "string" ? query.state : "";
    const expectedState = request.cookies?.[OAUTH_STATE_COOKIE_NAME] ?? "";

    if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
      reply.clearCookie(OAUTH_STATE_COOKIE_NAME, {
        path: "/api/auth",
        httpOnly: true,
        secure: isProduction(),
        sameSite: "lax",
      });
      return reply.redirect(addErrorQuery(errorRedirectUrl, "oauth_state"));
    }

    reply.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      path: "/api/auth",
      httpOnly: true,
      secure: isProduction(),
      sameSite: "lax",
    });

    if (!clientId || !clientSecret || !redirectUri) {
      return reply.redirect(addErrorQuery(errorRedirectUrl, "oauth_config"));
    }

    try {
      const token = await exchangeCodeForToken({
        clientId,
        clientSecret,
        redirectUri,
        code,
      });

      const discordUser = await fetchDiscordUser(token.access_token);
      const scopeSet = new Set((token.scope || scopes).split(/\s+/).filter(Boolean));
      const discordGuilds = scopeSet.has("guilds")
        ? await fetchDiscordGuilds(token.access_token)
        : [];

      const { rawSessionToken, expiresAt } = await apiSessionService.createSession({
        discordUser,
        discordGuilds,
        token,
      });

      const sessionCookieConfig = getSessionCookieConfig();
      reply.setCookie(sessionCookieConfig.cookieName, rawSessionToken, {
        httpOnly: true,
        secure: sessionCookieConfig.isProduction,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return reply.redirect(successRedirectUrl);
    } catch (error) {
      request.log.warn({
        errName: error instanceof Error ? error.name : "OAuthCallbackError",
        message: error instanceof Error ? error.message : "oauth_callback_failed",
      }, "Discord OAuth callback failed");

      return reply.redirect(addErrorQuery(errorRedirectUrl, "oauth_callback"));
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionCookieConfig = getSessionCookieConfig();
    const rawSessionToken = request.cookies?.[sessionCookieConfig.cookieName];

    if (rawSessionToken) {
      await apiSessionService.revokeSessionByRawToken(rawSessionToken);
    }

    reply.clearCookie(sessionCookieConfig.cookieName, {
      httpOnly: true,
      secure: sessionCookieConfig.isProduction,
      sameSite: "lax",
      path: "/",
    });

    return reply.send({ ok: true });
  });
}
