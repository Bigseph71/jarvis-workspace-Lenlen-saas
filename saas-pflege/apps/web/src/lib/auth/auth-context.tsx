"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import "@/lib/api-setup";
import {
  login as apiLogin,
  logout as apiLogout,
  registerOrganization as apiRegister,
  restoreSession,
  type AuthUser,
  type LoginCredentials,
  type RegisterOrganizationInput,
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
  /**
   * Liefert das angemeldete Konto zurück (wie in der Mobile-App). Der Aufrufer
   * braucht die Rolle SOFORT, um das Ziel der Weiterleitung zu wählen; der
   * `user`-State steht in derselben Funktion noch nicht zur Verfügung.
   */
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  /** Selbstregistrierung: legt Organisation + ersten Admin an und meldet an. */
  register: (input: RegisterOrganizationInput) => Promise<void>;
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

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
    const loggedIn = await apiLogin(credentials);
    if (loggedIn.role === "FACHKRAFT") {
      await apiLogout();
      throw new Error(ROLE_NOT_ALLOWED);
    }
    setUser(loggedIn);
    setStatus("authenticated");
    return loggedIn;
  }, []);

  // Der Registrierung folgt KEIN zweiter Login: das Backend gibt bereits ein
  // Token-Paar zurück, der api-client hat es persistiert. Die Rollenprüfung
  // aus login() entfällt hier – wer sich registriert, wird per Definition
  // Struktur-Admin.
  const register = useCallback(async (input: RegisterOrganizationInput) => {
    const created = await apiRegister(input);
    setUser(created);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  }
  return ctx;
}
