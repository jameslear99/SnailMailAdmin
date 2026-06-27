"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  user: User | null;
  isAdmin: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function userHasAdminClaim(user: User): Promise<boolean> {
  const result = await user.getIdTokenResult();
  return result.claims.admin === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }

    const unsub = onAuthStateChanged(getFirebaseAuth(), async (u) => {
      setUser(u);
      if (u) {
        try {
          setIsAdmin(await userHasAdminClaim(u));
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setReady(true);
    });

    return () => unsub();
  }, [configured]);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    const admin = await userHasAdminClaim(cred.user);
    if (!admin) {
      await fbSignOut(getFirebaseAuth());
      throw new Error("This account does not have admin access.");
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      configured,
      user,
      isAdmin,
      signInEmail,
      signOut,
    }),
    [ready, configured, user, isAdmin, signInEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
