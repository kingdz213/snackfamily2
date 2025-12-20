# Configuration rapide

## Variables d'environnement (Front Vite)
- `VITE_STRIPE_PUBLIC_KEY` : clé publique Stripe (pk_live... ou pk_test...).
- `VITE_WORKER_URL` : URL complète du backend checkout (peut déjà contenir `/create-checkout-session`).
- `VITE_WORKER_BASE_URL` : alias legacy si la prod utilise encore l'ancien nom (la librairie ajoute automatiquement `/create-checkout-session`).
- `VITE_PUBLIC_ORIGIN` : origin public attendu (ex: `https://snackfamily2.eu`), utile pour générer les URLs de retour.
- `VITE_FIREBASE_VAPID_KEY` : clé VAPID pour les notifications web push (front).

> ⚠️ Ne jamais exposer de clé secrète Stripe dans le front. Les secrets restent côté Worker/Firebase Functions (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`).

### Exemples de valeurs cohérentes
```
VITE_STRIPE_PUBLIC_KEY=pk_live_xxx
VITE_WORKER_URL=https://payments.snackfamily2.eu/create-checkout-session
# OU
VITE_WORKER_BASE_URL=https://payments.snackfamily2.eu

VITE_PUBLIC_ORIGIN=https://snackfamily2.eu
VITE_FIREBASE_VAPID_KEY=BOGUS_PUBLIC_VAPID_KEY
```

## Routage SPA (success / cancel)
- Les routes `/success` et `/cancel` sont gérées côté SPA (`App.tsx`).
- `public/_redirects` (copié dans le build `dist/`) redirige toutes les routes vers `index.html` pour Netlify & Cloudflare Pages.
- `vercel.json` contient déjà le rewrite équivalent pour Vercel.

## Checklist Déploiement
1. **Définir les variables** :
   - `VITE_STRIPE_PUBLIC_KEY`
   - `VITE_WORKER_URL` **ou** `VITE_WORKER_BASE_URL`
   - `VITE_PUBLIC_ORIGIN`
   - `VITE_FIREBASE_VAPID_KEY`
2. **Vérifier le backend** : un `POST` sur l'URL checkout doit répondre `200` JSON avec `{ "url": "https://checkout.stripe.com/..." }` (pas de HTML / page d'auth Cloudflare).
3. **Build** : `npm run build` doit passer sans erreur.
4. **Test manuel** :
   - En dev, utiliser le bouton `Test paiement (DEV)` pour déclencher `runDevTest()`.
   - Ajouter un article au panier puis cliquer « Payer avec Stripe » : redirection vers Stripe, puis retour sur `/success` ou `/cancel`.
5. **Routes SPA** : rafraîchir directement `/success` et `/cancel` doit toujours charger l'app grâce aux règles de réécriture.

## Notes backend
- Le front ajoute automatiquement `/create-checkout-session` si l'URL fournie est un simple domaine/base URL.
- Si le Worker est protégé (Cloudflare Access) ou retourne du HTML, l'app affiche un message `WORKER_HTML` pour aider au diagnostic ; assurez-vous que l'endpoint est public et renvoie du JSON.
