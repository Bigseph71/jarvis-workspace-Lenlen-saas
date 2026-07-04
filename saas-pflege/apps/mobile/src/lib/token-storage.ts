import * as SecureStore from "expo-secure-store";
import type { TokenStorage } from "@len-len/api-client";

/**
 * Token-Ablage für Mobile: Access-Token nur im Speicher (kurzlebig, 15 min),
 * Refresh-Token verschlüsselt in SecureStore (Keychain / Android Keystore).
 */
const REFRESH_KEY = "lenlen.refreshToken";

let accessToken: string | null = null;

export const tokenStorage: TokenStorage = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefreshToken: async (token) => {
    if (token) {
      await SecureStore.setItemAsync(REFRESH_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    }
  },
};
