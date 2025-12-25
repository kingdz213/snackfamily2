import React from 'react';
import { AdminNotifications } from './AdminNotifications';
import { Page } from '../types';

interface AdminPageProps {
  navigateTo: (page: Page) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ navigateTo }) => {
  return (
    <div className="min-h-screen bg-snack-light pt-28 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-display font-bold text-snack-black">Espace admin</h1>
          <p className="text-gray-600">Activez les notifications push pour être alerté dès qu\'une commande Stripe est payée.</p>
        </div>

        <AdminNotifications />

        <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 space-y-2">
          <p className="font-bold">Fonctionnement</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Une notification « 🛎️ Nouvelle commande – XX€ » est envoyée dès le checkout Stripe terminé.</li>
            <li>Le corps reprend les items : « Nom xQté ».</li>
            <li>Cliquer ouvre automatiquement <span className="font-mono">/admin</span> pour traiter la commande.</li>
          </ul>
        </div>

        <button
          onClick={() => navigateTo('adminOrders')}
          className="px-4 py-3 rounded-lg bg-snack-gold text-snack-black font-bold uppercase tracking-wide hover:bg-snack-black hover:text-snack-gold transition-colors"
        >
          Gérer les commandes
        </button>

        <button
          onClick={() => navigateTo('home')}
          className="px-4 py-3 rounded-lg bg-snack-black text-white font-bold uppercase tracking-wide hover:bg-snack-gold hover:text-snack-black transition-colors"
        >
          Retour au site
        </button>
      </div>
    </div>
  );
};
