import {
  decryptOAuthToken,
  isEncryptedOAuthToken,
} from "@/lib/security/oauth-token-crypto";

export type StoredOAuthTokenReadResult = {
  token: string | null;
  wasPlainText: boolean;
};

export function readOAuthTokenFromStorage(
  token: string | null,
): StoredOAuthTokenReadResult {
  if (!token) {
    return {
      token: null,
      wasPlainText: false,
    };
  }

  if (!isEncryptedOAuthToken(token)) {
    return {
      token,
      wasPlainText: true,
    };
  }

  return {
    token: decryptOAuthToken(token),
    wasPlainText: false,
  };
}
