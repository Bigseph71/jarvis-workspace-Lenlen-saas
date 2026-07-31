"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import "@/lib/api-setup";
import {
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  type AuthUser,
  type LoginCredentials,
} from "@len-len/api-client";

/**
 * Gegenstück zur Mobile-App: dort sind ausschließlich FACHKRAFT-Konten
 * zugelassen, hier alle anderen. Laut RBAC hat die Fachkraft nur die App –
 * im Web hätte sie ohnehin auf keinen Endpoint Zugriff.
 */
export const ROLE_NOT_ALLOWED = "RoleNotAllowed";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Beim Start einmalig versuchen, die Sitzung aus dem Refresh-Token zu laden.
  useEffect(() => {
    let active = true;
    restoreSession()
      .then(async (restored) => {
        if (restored && restored.role === "FACHKRAFT") {
          // Fachkraft-Token (z.B. aus einem früheren Versuch): Sitzung verwerfen.
          await apiLogout();
          restored = null;
        }
        if (!active) return;
        setUser(restored);
        setStatus(restored ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const loggedIn = await apiLogin(credentials);
    if (loggedIn.role === "FACHKRAFT") {
      await apiLogout();
      throw new Error(ROLE_NOT_ALLOWED);
    }
    setUser(loggedIn);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  }
  return ctx;
}
