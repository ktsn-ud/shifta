import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const TOKEN_PREFIX = "enc:v1:";
const IV_LENGTH = 12;

export type OAuthTokenCryptoErrorCode =
  | "MISSING_ENCRYPTION_SECRET"
  | "INVALID_TOKEN_FORMAT";

export class OAuthTokenCryptoError extends Error {
  constructor(
    public readonly code: OAuthTokenCryptoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OAuthTokenCryptoError";
  }
}

function resolveEncryptionSecret(): string {
  const secret =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (secret) {
    return secret;
  }

  throw new OAuthTokenCryptoError(
    "MISSING_ENCRYPTION_SECRET",
    "GOOGLE_TOKEN_ENCRYPTION_KEY または AUTH_SECRET を設定してください",
  );
}

function buildEncryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptOAuthToken(token: string | null): string | null {
  if (!token) {
    return null;
  }

  const key = buildEncryptionKey(resolveEncryptionSecret());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${TOKEN_PREFIX}${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptOAuthToken(token: string | null): string | null {
  if (!token) {
    return null;
  }

  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new OAuthTokenCryptoError(
      "INVALID_TOKEN_FORMAT",
      "OAuthトークンが暗号化形式ではありません",
    );
  }

  const payload = token.slice(TOKEN_PREFIX.length);
  const [ivBase64Url, tagBase64Url, encryptedBase64Url] = payload.split(":");

  if (!ivBase64Url || !tagBase64Url || !encryptedBase64Url) {
    throw new OAuthTokenCryptoError(
      "INVALID_TOKEN_FORMAT",
      "OAuthトークンの形式が不正です",
    );
  }

  const key = buildEncryptionKey(resolveEncryptionSecret());
  const iv = Buffer.from(ivBase64Url, "base64url");
  const authTag = Buffer.from(tagBase64Url, "base64url");
  const encrypted = Buffer.from(encryptedBase64Url, "base64url");

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
