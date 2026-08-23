# Logistics School

Application monolithique modulaire de livraison : une API Laravel 13, une SPA React 18 et Reverb pour les notifications en temps réel.

Le parcours principal couvre la création tarifée côté serveur, la prise en charge atomique par un transporteur vérifié, les transitions d’état contrôlées, la remise finale par PIN, le paiement administratif séparé, la notation et le support.

## Architecture

```text
frontend/       React, Vite, Tailwind, Wouter, React Query, Reverb/Echo
backend-new/    Laravel, Sanctum SPA, Eloquent, queue, Reverb
scripts/        contrôles non destructifs de préparation production
```

Le navigateur s’authentifie avec la session first-party de Sanctum : cookie de session HttpOnly, cookie XSRF lisible par le client et requêtes `credentials: include`. Aucun bearer token n’est stocké dans `localStorage`.

## Garanties métier importantes

- Le prix final est calculé par `ShipmentPricingService`; tout champ `price` client est refusé.
- La création accepte une clé UUID d’idempotence et possède une contrainte unique par expéditeur.
- L’endpoint général de statut ne peut jamais livrer un colis; seul un PIN correct depuis `out_for_delivery` le peut.
- Les échecs PIN sont comptés, verrouillés temporairement et limités par utilisateur + colis.
- Une livraison ne confirme jamais automatiquement le paiement.
- Le destinataire privé est identifié par `destinataire_id`, lié uniquement à un téléphone vérifié.
- Un voyageur doit posséder un trajet actif côté serveur correspondant à la route.
- Les overrides, paiements et actions sensibles de modération sont explicites et audités.
- Le tracking public utilise une Resource allowlistée sans identifiant interne ni données personnelles.

## Prérequis locaux

- PHP 8.3 ou supérieur avec PDO, SQLite (local), mbstring, OpenSSL, fileinfo et XML;
- Composer 2;
- Node.js 24 et npm;
- Git.

## Installation locale

```powershell
cd backend-new
composer install
Copy-Item .env.example .env
php artisan key:generate
if (-not (Test-Path database\database.sqlite)) { New-Item database\database.sqlite -ItemType File }
php artisan migrate

cd ..\frontend
npm ci
Copy-Item .env.example .env
```

Lancer ensuite l’API, le worker, Reverb et Vite dans des terminaux séparés, ou utiliser `LANCER_SITE.bat`. Le script local n’injecte des données de démonstration que si `DEMO_SEED=1` est défini explicitement; le seeder refuse toujours l’environnement production.

## Qualité

Backend :

```powershell
cd backend-new
composer validate --strict
composer audit --locked
composer lint
composer analyse
php artisan test
```

Frontend :

```powershell
cd frontend
npm audit --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Le contrôle production complet est disponible via :

```powershell
.\scripts\preflight.ps1
```

Ce script ne déploie rien, ne modifie pas `.env` et n’exécute aucune migration.

## Documentation

- [PRODUCTION.md](PRODUCTION.md) : configuration générique, processus, sauvegarde et rollback.
- [README_SOUTENANCE.md](README_SOUTENANCE.md) : démonstration locale.
- `docs/FINAL_PRODUCTION_AUDIT.md` : état initial, corrections, résultats réels et bloqueurs restants.
