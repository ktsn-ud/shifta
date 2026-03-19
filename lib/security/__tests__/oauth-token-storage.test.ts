import { encryptOAuthToken } from "@/lib/security/oauth-token-crypto";
import { readOAuthTokenFromStorage } from "@/lib/security/oauth-token-storage";

describe("oauth-token-storage", () => {
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalTokenKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalAuthSecret;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = originalTokenKey;
  });

  it("returns decrypted token for encrypted value", () => {
    const encrypted = encryptOAuthToken("access-token");
    expect(encrypted).not.toBeNull();

    const result = readOAuthTokenFromStorage(encrypted);
    expect(result).toEqual({
      token: "access-token",
      wasPlainText: false,
    });
  });

  it("treats non-encrypted token as legacy plain text", () => {
    const result = readOAuthTokenFromStorage("legacy-plain-token");
    expect(result).toEqual({
      token: "legacy-plain-token",
      wasPlainText: true,
    });
  });

  it("handles null token", () => {
    const result = readOAuthTokenFromStorage(null);
    expect(result).toEqual({
      token: null,
      wasPlainText: false,
    });
  });
});
