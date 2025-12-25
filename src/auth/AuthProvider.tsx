import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/src/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  profile: UserProfile | null;
  isAnonymous: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
  saveProfile: (profile: UserProfileInput) => Promise<void>;
  refreshProfile: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

type UserProfile = {
  name?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
};

type UserProfileInput = UserProfile;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    const ref = doc(db, 'users', auth.currentUser.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      setProfile(snapshot.data() as UserProfile);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    void refreshProfile();
  }, [refreshProfile, user]);

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    if (auth.currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credential(normalizedEmail, password);
      await linkWithCredential(auth.currentUser, credential);
      return;
    }
    await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  }, []);

  const loginAnonymously = useCallback(async () => {
    await signInAnonymously(auth);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const saveProfile = useCallback(async (input: UserProfileInput) => {
    if (!auth.currentUser) return;
    const ref = doc(db, 'users', auth.currentUser.uid);
    await setDoc(
      ref,
      {
        ...input,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setProfile((prev) => ({ ...(prev ?? {}), ...input }));
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      profile,
      isAnonymous: Boolean(user?.isAnonymous),
      login,
      register,
      loginAnonymously,
      logout,
      saveProfile,
      refreshProfile,
      getIdToken,
    }),
    [getIdToken, loading, login, loginAnonymously, logout, profile, refreshProfile, register, saveProfile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  }
  return ctx;
};
