# Mise en production

## Pré-requis obligatoires

- Utiliser une base de données managée MySQL ou PostgreSQL. SQLite est réservé au développement local.
- Créer un environnement depuis `backend-new/.env.production.example`; ne jamais versionner le fichier `.env` réel.
- Générer une clé unique avec `php artisan key:generate --show` et définir des secrets Reverb différents pour chaque environnement.
- Remplacer `app.example.com`, `api.example.com` et `ws.example.com` par les domaines HTTPS réels.
- Configurer les sauvegardes automatisées de la base et la rétention des journaux avant l’ouverture publique.

## Déploiement

```bash
# API
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Frontend, avec frontend/.env.production renseigné
npm ci
npm run build
```

Ne lancez pas `php artisan db:seed` en production : les comptes et colis de démonstration ne doivent pas être exposés.

## Processus à maintenir

L’API HTTP, le worker de queue et Reverb doivent être supervisés séparément et redémarrés automatiquement :

```bash
php artisan queue:work --tries=3 --max-time=3600
php artisan reverb:start
```

Placez Reverb derrière un proxy HTTPS WebSocket (Nginx, Azure Application Gateway ou équivalent) sur `wss://ws.example.com`. Le proxy doit transmettre les en-têtes `Upgrade` et `Connection`.

## Contrôles avant ouverture

- `APP_ENV=production` et `APP_DEBUG=false`.
- CORS et `REVERB_ALLOWED_ORIGINS` ne contiennent que le domaine frontend HTTPS.
- Certificats TLS actifs sur frontend, API et WebSocket.
- Les services API, queue et Reverb sont surveillés avec alertes sur erreur et indisponibilité.
- Lancer `php artisan test`, `npm run test`, `npm run test:e2e` et `npm run build` dans la CI.
