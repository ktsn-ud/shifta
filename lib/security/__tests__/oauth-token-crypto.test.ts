import {
  decryptOAuthToken,
  encryptOAuthToken,
  OAuthTokenCryptoError,
} from "@/lib/security/oauth-token-crypto";

describe("oauth-token-crypto", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalGoogleTokenKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    env.AUTH_SECRET = originalAuthSecret;
    env.GOOGLE_TOKEN_ENCRYPTION_KEY = originalGoogleTokenKey;
  });

  it("encrypts/decrypts tokens when AUTH_SECRET is configured", () => {
    env.NODE_ENV = "development";
    env.AUTH_SECRET = "test-auth-secret";
    delete env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    const encrypted = encryptOAuthToken("token-value");

    expect(encrypted).toBeTruthy();
    expect(encrypted?.startsWith("enc:v1:")).toBe(true);
    expect(decryptOAuthToken(encrypted)).toBe("token-value");
  });

  it("requires encryption secret even in development", () => {
    env.NODE_ENV = "development";
    delete env.AUTH_SECRET;
    delete env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptOAuthToken("token-value")).toThrow(
      OAuthTokenCryptoError,
    );
    expect(() => decryptOAuthToken("enc:v1:dummy:dummy:dummy")).toThrow(
      OAuthTokenCryptoError,
    );
  });

  it("rejects non-encrypted token format", () => {
    env.NODE_ENV = "development";
    env.AUTH_SECRET = "test-auth-secret";
    delete env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    expect(() => decryptOAuthToken("legacy-plain-token")).toThrow(
      "OAuthトークンが暗号化形式ではありません",
    );
  });

  it("requires encryption secret in production", () => {
    env.NODE_ENV = "production";
    delete env.AUTH_SECRET;
    delete env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptOAuthToken("token-value")).toThrow(
      "GOOGLE_TOKEN_ENCRYPTION_KEY または AUTH_SECRET を設定してください",
    );
  });
});
