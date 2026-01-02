import React, { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Portal } from './Portal';
import { X } from 'lucide-react';
import { useAuth } from '@/src/auth/AuthProvider';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { auth, firebaseInitError } from '@/src/firebase';

interface AuthModalProps {
  isOpen: boolean;
  message?: string;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, message, onClose }) => {
  const { user, loading, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState<'login' | 'register' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const isPasswordValid = password.length >= 6;
  const isBusy = isSubmitting !== null;
  const isRegisterDisabled = isBusy || !isEmailValid || !isPasswordValid;
  const isLoginDisabled = isBusy || !isEmailValid || !isPasswordValid;

  const logAuthAttempt = (context: 'login' | 'register') => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[AuthModal:${context}] emailLength=${trimmedEmail.length} passwordLength=${password.length}`);
    }
  };

  const getAuthErrorMessage = (err: unknown) => {
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          return 'Email déjà utilisé.';
        case 'auth/weak-password':
          return 'Mot de passe trop faible.';
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          return 'Identifiants incorrects ou compte inexistant.';
        case 'auth/invalid-email':
          return 'Email invalide.';
        default:
          return err.message;
      }
    }
    return err instanceof Error ? err.message : 'Une erreur est survenue.';
  };

  if (!isOpen) return null;

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!isEmailValid) {
      setError('Email invalide.');
      return;
    }
    if (!isPasswordValid) {
      setError('Mot de passe trop court (min. 6).');
      return;
    }
    setIsSubmitting('login');
    try {
      if (!auth) {
        setError(firebaseInitError ?? 'Vérifiez vos variables VITE_FIREBASE_*.');
        return;
      }
      logAuthAttempt('login');
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      setPassword('');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!isEmailValid) {
      setError('Email invalide.');
      return;
    }
    if (!isPasswordValid) {
      setError('Mot de passe trop court (min. 6).');
      return;
    }
    setIsSubmitting('register');
    try {
      if (!auth) {
        setError(firebaseInitError ?? 'Vérifiez vos variables VITE_FIREBASE_*.');
        return;
      }
      logAuthAttempt('register');
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      setPassword('');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Déconnexion impossible.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <button
          type="button"
          aria-label="Fermer"
          className="absolute inset-0 bg-black/70"
          onClick={onClose}
        />
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-display font-bold uppercase text-snack-black">Connexion obligatoire</h3>
              <p className="text-sm text-gray-600">{message ?? 'Connexion obligatoire pour commander.'}</p>
            </div>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <LoadingSpinner label="Chargement..." size={24} />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {user && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  Connecté en tant que <span className="font-semibold text-snack-black">{user.email ?? 'Utilisateur'}</span>
                </div>
              )}

              {!user && (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) {
                          setError(null);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                      placeholder="email@exemple.com"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Mot de passe</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (error) {
                          setError(null);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoginDisabled}
                    className="w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting === 'login' ? <LoadingSpinner label="Connexion..." size={20} /> : 'Connexion'}
                  </button>
                </form>
              )}

              {!user && (
                <form onSubmit={handleRegister}>
                  <button
                    type="submit"
                    disabled={isRegisterDisabled}
                    className="w-full rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:bg-snack-gold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting === 'register' ? <LoadingSpinner label="Création..." size={20} /> : 'Créer un compte'}
                  </button>
                </form>
              )}

              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold uppercase tracking-wide text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
                >
                  Se déconnecter
                </button>
              )}

              {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};
