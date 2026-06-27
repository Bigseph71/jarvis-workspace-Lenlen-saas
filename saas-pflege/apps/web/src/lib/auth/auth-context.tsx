"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  type AuthUser,
  type LoginCredentials,
} from "@/lib/api/auth";

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
    restoreSession().then((restored) => {
      if (!active) return;
      setUser(restored);
      setStatus(restored ? "authenticated" : "unauthenticated");
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const loggedIn = await apiLogin(credentials);
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
