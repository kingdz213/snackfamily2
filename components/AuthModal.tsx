import React, { useState } from 'react';
import { Portal } from './Portal';
import { X } from 'lucide-react';
import { useAuth } from '@/src/auth/AuthProvider';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';

interface AuthModalProps {
  isOpen: boolean;
  message?: string;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, message, onClose }) => {
  const { user, loading, login, register, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState<'login' | 'register' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailTrim = email.trim();
  const isEmailValid = emailTrim.length > 0 && emailTrim.includes('@') && emailTrim.includes('.');
  const isPasswordValid = password.length >= 6;
  const isRegisterDisabled = isSubmitting === 'register' || !isEmailValid || !isPasswordValid;

  if (!isOpen) return null;

  const getFirebaseErrorMessage = (firebaseError: unknown) => {
    const code = typeof firebaseError === 'object' && firebaseError !== null && 'code' in firebaseError
      ? String((firebaseError as { code: string }).code)
      : '';

    switch (code) {
      case 'auth/invalid-email':
        return { message: 'Email invalide', code };
      case 'auth/email-already-in-use':
        return { message: 'Cet email est déjà utilisé', code };
      case 'auth/weak-password':
        return { message: 'Mot de passe trop court (6 caractères min.)', code };
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return { message: 'Identifiants incorrects', code };
      case 'auth/user-not-found':
        return { message: 'Aucun compte trouvé avec cet email', code };
      default:
        return { message: 'Une erreur est survenue. Veuillez réessayer.', code };
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!emailTrim) {
      setError('Veuillez entrer une adresse email valide.');
      return;
    }
    if (!isEmailValid) {
      setError('Email invalide');
      return;
    }
    if (!isPasswordValid) {
      setError('Mot de passe: 6 caractères minimum');
      return;
    }
    if (import.meta.env.DEV) {
      console.info('[AuthModal] Tentative de connexion', { email: emailTrim });
    }
    setIsSubmitting('login');
    try {
      await login(emailTrim, password);
      setPassword('');
    } catch (err) {
      const { message: firebaseMessage, code } = getFirebaseErrorMessage(err);
      if (import.meta.env.DEV) {
        console.error('[AuthModal] Erreur connexion', { code, error: err });
      }
      setError(firebaseMessage);
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (import.meta.env.DEV) {
      console.info('[AuthModal] Tentative de création', {
        email: emailTrim,
        isEmailValid,
        isPasswordValid,
      });
    }
    if (!isEmailValid) {
      setError('Email invalide');
      return;
    }
    if (!isPasswordValid) {
      setError('Mot de passe: 6 caractères minimum');
      return;
    }
    setIsSubmitting('register');
    try {
      await register(emailTrim, password);
      setPassword('');
    } catch (err) {
      const { message: firebaseMessage, code } = getFirebaseErrorMessage(err);
      if (import.meta.env.DEV) {
        console.error('[AuthModal] Erreur création compte', { code, error: err });
      }
      setError(firebaseMessage);
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
                    disabled={isSubmitting === 'login'}
                    className="w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
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
