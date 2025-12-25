import React, { useEffect, useState } from 'react';
import { Page } from '../types';
import { useAuth } from '@/src/auth/AuthProvider';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { getStoredPushToken, requestPushPermissionAndRegister, unregisterPushToken } from '@/src/lib/push';

interface AccountPageProps {
  navigateTo: (page: Page) => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({ navigateTo }) => {
  const { user, loading, login, register, loginAnonymously, logout, profile, saveProfile, isAnonymous } = useAuth();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [supportsPush, setSupportsPush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<'login' | 'register' | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.name ?? '',
        phone: profile.phone ?? '',
        address: profile.address ?? '',
        postalCode: profile.postalCode ?? '',
        city: profile.city ?? '',
      });
    }
  }, [profile]);

  useEffect(() => {
    setNotificationsEnabled(Boolean(getStoredPushToken()));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupportsPush('Notification' in window);
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting('login');
    try {
      await login(loginEmail.trim(), loginPassword);
      setLoginPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting('register');
    try {
      await register(registerEmail.trim(), registerPassword);
      setRegisterPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création du compte impossible.');
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleGuest = async () => {
    setError(null);
    try {
      await loginAnonymously();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion invitée impossible.');
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

  const handleProfileChange = (field: keyof typeof profileForm) => (value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingProfile(true);
    try {
      await saveProfile(profileForm);
      setToast('Informations sauvegardées ✅');
      window.setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sauvegarde impossible.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleNotificationToggle = async () => {
    if (!user) return;
    setError(null);
    try {
      if (notificationsEnabled) {
        await unregisterPushToken(user.uid);
        setNotificationsEnabled(false);
        setToast('Notifications désactivées');
      } else {
        const result = await requestPushPermissionAndRegister(user.uid);
        if (result.status === 'granted') {
          setNotificationsEnabled(true);
        }
        setToast(result.message ?? 'Notifications mises à jour');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notifications impossibles.');
    } finally {
      window.setTimeout(() => setToast(null), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-display font-bold text-snack-black">Mon compte</h1>
          <p className="text-sm text-gray-600">Accédez à vos commandes et suivez vos statuts en direct.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner label="Chargement..." size={28} />
          </div>
        ) : user ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Connecté</div>
                <div className="text-xl font-semibold text-snack-black">{user.email ?? 'Invité'}</div>
                {isAnonymous && <div className="text-xs text-gray-500">Session invitée</div>}
              </div>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
              >
                Se déconnecter
              </button>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Notifications</div>
              <button
                onClick={handleNotificationToggle}
                disabled={!supportsPush}
                className={`w-full rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-60 ${
                  notificationsEnabled
                    ? 'bg-snack-black text-snack-gold hover:bg-snack-gold hover:text-snack-black'
                    : 'border border-snack-gold bg-snack-gold/10 text-snack-black hover:bg-snack-gold'
                }`}
              >
                {notificationsEnabled ? 'Désactiver les notifications' : 'Activer les notifications'}
              </button>
              <p className="text-xs text-gray-500">Recevez un push dès que le statut de votre commande change.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigateTo('myOrders')}
                className="cta-premium flex-1 rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
              >
                Mes commandes
              </button>
              <button
                onClick={() => navigateTo('commander')}
                className="flex-1 rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:bg-snack-gold transition-colors"
              >
                Passer commande
              </button>
            </div>
            <form onSubmit={handleProfileSave} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Mes informations</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Nom</label>
                  <input
                    value={profileForm.name}
                    onChange={(event) => handleProfileChange('name')(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                    placeholder="Nom et prénom"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Téléphone</label>
                  <input
                    value={profileForm.phone}
                    onChange={(event) => handleProfileChange('phone')(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                    placeholder="06..."
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Adresse</label>
                <input
                  value={profileForm.address}
                  onChange={(event) => handleProfileChange('address')(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                  placeholder="Rue, numéro"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Code postal</label>
                  <input
                    value={profileForm.postalCode}
                    onChange={(event) => handleProfileChange('postalCode')(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                    placeholder="59000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Ville</label>
                  <input
                    value={profileForm.city}
                    onChange={(event) => handleProfileChange('city')(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                    placeholder="Colfontaine"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full rounded-lg bg-snack-black px-4 py-2 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors disabled:opacity-70"
              >
                {isSavingProfile ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </form>
            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleLogin}
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-snack-black">Déjà client ?</h2>
                <p className="text-sm text-gray-500">Connectez-vous pour suivre vos commandes.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                  placeholder="vous@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Mot de passe</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting === 'login'}
                className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors disabled:opacity-70"
              >
                {isSubmitting === 'login' ? <LoadingSpinner label="Connexion..." size={20} /> : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={handleGuest}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold uppercase tracking-wide text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
              >
                Continuer en invité
              </button>
            </form>

            <form
              onSubmit={handleRegister}
              className="bg-snack-black text-white border border-snack-gold/40 rounded-2xl p-6 shadow-lg space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-snack-gold">Créer un compte</h2>
                <p className="text-sm text-white/70">Sauvegardez vos commandes et suivez les statuts.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">Email</label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-snack-gold"
                  placeholder="vous@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/70">Mot de passe</label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-snack-gold"
                  placeholder="Créer un mot de passe"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting === 'register'}
                className="cta-premium w-full rounded-lg bg-snack-gold px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:bg-white transition-colors disabled:opacity-70"
              >
                {isSubmitting === 'register' ? <LoadingSpinner label="Création..." size={20} /> : 'Créer mon compte'}
              </button>
            </form>
          </div>
        )}

        {toast && (
          <div className="rounded-lg border border-snack-gold/20 bg-snack-gold/10 px-4 py-3 text-sm text-snack-black">
            {toast}
          </div>
        )}

        {error && !user && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
};
