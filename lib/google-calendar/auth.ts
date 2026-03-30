import type { Session } from "next-auth";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import {
  encryptOAuthToken,
  OAuthTokenCryptoError,
} from "@/lib/security/oauth-token-crypto";
import { readOAuthTokenFromStorage } from "@/lib/security/oauth-token-storage";
import {
  GOOGLE_CALENDAR_READ_SCOPES,
  GOOGLE_CALENDAR_SYNC_SCOPES,
} from "@/lib/google-calendar/constants";

type GoogleAccountRecord = {
  userId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

type GoogleAuthResult = {
  userId: string;
  calendarId: string | null;
  oauth2Client: InstanceType<typeof google.auth.OAuth2>;
};

type GoogleCalendarAuthErrorCode =
  | "UNAUTHENTICATED"
  | "USER_NOT_FOUND"
  | "GOOGLE_ACCOUNT_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "SCOPE_MISSING"
  | "READ_SCOPE_MISSING"
  | "GOOGLE_ENV_MISSING";

type GoogleAuthScopeOptions = {
  requiredScopes: readonly string[];
  missingScopeCode: "SCOPE_MISSING" | "READ_SCOPE_MISSING";
  missingScopeMessage: string;
};

export class GoogleCalendarAuthError extends Error {
  constructor(
    public code: GoogleCalendarAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarAuthError";
  }
}

function requireGoogleEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new GoogleCalendarAuthError(
      "GOOGLE_ENV_MISSING",
      "Google OAuth の環境変数が不足しています",
    );
  }

  return { clientId, clientSecret };
}

function parseScopes(scope: string | null): Set<string> {
  if (!scope) {
    return new Set();
  }

  return new Set(scope.split(" ").filter((value) => value.length > 0));
}

function hasScopes(
  scope: string | null,
  requiredScopes: readonly string[],
): boolean {
  const scopeSet = parseScopes(scope);
  return requiredScopes.every((requiredScope) => scopeSet.has(requiredScope));
}

function findMissingScopes(
  scope: string | null,
  requiredScopes: readonly string[],
): string[] {
  const scopeSet = parseScopes(scope);
  return requiredScopes.filter((requiredScope) => !scopeSet.has(requiredScope));
}

function isTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) {
    return true;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds <= 60;
}

async function migrateLegacyPlainTextTokens(
  userId: string,
  accessToken: string | null,
  refreshToken: string | null,
): Promise<void> {
  try {
    await prisma.account.updateMany({
      where: {
        userId,
        provider: "google",
      },
      data: {
        access_token: encryptOAuthToken(accessToken),
        refresh_token: encryptOAuthToken(refreshToken),
      },
    });
  } catch (error) {
    console.warn("Failed to migrate legacy google oauth token format", error);
  }
}

async function getGoogleAccountByUserId(
  userId: string,
): Promise<GoogleAccountRecord> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
    select: {
      userId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });

  if (!account) {
    throw new GoogleCalendarAuthError(
      "GOOGLE_ACCOUNT_NOT_FOUND",
      "Googleアカウント連携情報が見つかりません",
    );
  }

  try {
    const accessToken = readOAuthTokenFromStorage(account.access_token);
    const refreshToken = readOAuthTokenFromStorage(account.refresh_token);

    if (accessToken.wasPlainText || refreshToken.wasPlainText) {
      await migrateLegacyPlainTextTokens(
        userId,
        accessToken.token,
        refreshToken.token,
      );
    }

    return {
      ...account,
      access_token: accessToken.token,
      refresh_token: refreshToken.token,
    };
  } catch (error) {
    console.error("Failed to decrypt Google OAuth token", error);
    if (
      error instanceof OAuthTokenCryptoError &&
      error.code === "MISSING_ENCRYPTION_SECRET"
    ) {
      throw new GoogleCalendarAuthError(
        "GOOGLE_ENV_MISSING",
        "Googleトークン復号鍵が未設定です。AUTH_SECRET または GOOGLE_TOKEN_ENCRYPTION_KEY を設定してください",
      );
    }

    throw new GoogleCalendarAuthError(
      "TOKEN_EXPIRED",
      "Googleトークンの復号に失敗しました。再ログインしてください",
    );
  }
}

async function refreshGoogleTokenIfNeeded(
  userId: string,
  account: GoogleAccountRecord,
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
): Promise<void> {
  if (isTokenExpired(account.expires_at) === false) {
    return;
  }

  if (!account.refresh_token) {
    throw new GoogleCalendarAuthError(
      "TOKEN_EXPIRED",
      "Googleトークンの有効期限が切れています。再ログインしてください",
    );
  }

  oauth2Client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const refreshed = await oauth2Client.refreshAccessToken();
  const credentials = refreshed.credentials;

  const nextAccessToken = credentials.access_token ?? account.access_token;
  const nextRefreshToken = credentials.refresh_token ?? account.refresh_token;
  const nextExpiresAt = credentials.expiry_date
    ? Math.floor(credentials.expiry_date / 1000)
    : account.expires_at;
  const nextScope = credentials.scope ?? account.scope;

  await prisma.account.updateMany({
    where: {
      userId,
      provider: "google",
    },
    data: {
      access_token: encryptOAuthToken(nextAccessToken ?? null),
      refresh_token: encryptOAuthToken(nextRefreshToken ?? null),
      expires_at: nextExpiresAt ?? null,
      scope: nextScope ?? null,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleTokenExpiresAt: nextExpiresAt
        ? new Date(nextExpiresAt * 1000)
        : null,
    },
  });

  oauth2Client.setCredentials({
    access_token: nextAccessToken ?? undefined,
    refresh_token: nextRefreshToken ?? undefined,
    expiry_date: nextExpiresAt ? nextExpiresAt * 1000 : undefined,
    scope: nextScope ?? undefined,
  });
}

async function syncAccountScopeFromTokenInfo(
  userId: string,
  account: GoogleAccountRecord,
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  requiredScopes: readonly string[],
): Promise<string | null> {
  const currentScope = account.scope;
  if (hasScopes(currentScope, requiredScopes)) {
    return currentScope;
  }

  const accessToken = oauth2Client.credentials.access_token;
  if (!accessToken) {
    return currentScope;
  }

  try {
    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    const scopeFromToken =
      Array.isArray(tokenInfo.scopes) && tokenInfo.scopes.length > 0
        ? tokenInfo.scopes.join(" ")
        : currentScope;

    if (scopeFromToken !== currentScope) {
      await prisma.account.updateMany({
        where: {
          userId,
          provider: "google",
        },
        data: {
          scope: scopeFromToken ?? null,
        },
      });
    }

    return scopeFromToken;
  } catch (error) {
    console.warn("Failed to synchronize Google account scope", error);
    return currentScope;
  }
}

export async function getGoogleAuthByUserId(
  userId: string,
  options?: Partial<GoogleAuthScopeOptions>,
): Promise<GoogleAuthResult> {
  const scopeOptions: GoogleAuthScopeOptions = {
    requiredScopes: options?.requiredScopes ?? GOOGLE_CALENDAR_SYNC_SCOPES,
    missingScopeCode: options?.missingScopeCode ?? "SCOPE_MISSING",
    missingScopeMessage:
      options?.missingScopeMessage ??
      "Google Calendar の権限が不足しています。再ログインして再同意してください",
  };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      calendarId: true,
    },
  });

  if (!user) {
    throw new GoogleCalendarAuthError(
      "USER_NOT_FOUND",
      "ユーザーが見つかりません",
    );
  }

  const account = await getGoogleAccountByUserId(userId);
  const { clientId, clientSecret } = requireGoogleEnv();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
    scope: account.scope ?? undefined,
  });

  await refreshGoogleTokenIfNeeded(userId, account, oauth2Client);

  const effectiveScope = await syncAccountScopeFromTokenInfo(
    userId,
    account,
    oauth2Client,
    scopeOptions.requiredScopes,
  );
  const missingScopes = findMissingScopes(
    effectiveScope,
    scopeOptions.requiredScopes,
  );
  if (missingScopes.length > 0) {
    throw new GoogleCalendarAuthError(
      scopeOptions.missingScopeCode,
      scopeOptions.missingScopeMessage,
    );
  }

  const expiryDate = oauth2Client.credentials.expiry_date;
  if (expiryDate) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleTokenExpiresAt: new Date(expiryDate),
      },
    });
  }

  return {
    userId: user.id,
    calendarId: user.calendarId,
    oauth2Client,
  };
}

export async function getGoogleAuthBySession(
  session: Session,
  options?: Partial<GoogleAuthScopeOptions>,
): Promise<GoogleAuthResult> {
  const email = session.user?.email;
  if (!email) {
    throw new GoogleCalendarAuthError(
      "UNAUTHENTICATED",
      "セッション情報が不正です",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    throw new GoogleCalendarAuthError(
      "USER_NOT_FOUND",
      "ユーザーが見つかりません",
    );
  }

  return getGoogleAuthByUserId(user.id, options);
}

export async function getGoogleReadAuthByUserId(
  userId: string,
): Promise<GoogleAuthResult> {
  return getGoogleAuthByUserId(userId, {
    requiredScopes: GOOGLE_CALENDAR_READ_SCOPES,
    missingScopeCode: "READ_SCOPE_MISSING",
    missingScopeMessage:
      "全カレンダー予定表示に必要なGoogle権限が不足しています。再ログインして再同意してください",
  });
}

export async function getGoogleReadAuthBySession(
  session: Session,
): Promise<GoogleAuthResult> {
  return getGoogleAuthBySession(session, {
    requiredScopes: GOOGLE_CALENDAR_READ_SCOPES,
    missingScopeCode: "READ_SCOPE_MISSING",
    missingScopeMessage:
      "全カレンダー予定表示に必要なGoogle権限が不足しています。再ログインして再同意してください",
  });
}
