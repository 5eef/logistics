# Guide de préparation production

Ce document décrit une infrastructure générique. Il ne lance aucun déploiement.

## Topologie recommandée

- un reverse proxy HTTPS servant les fichiers statiques de `frontend/dist`;
- un serveur d’application PHP pour `backend-new/public`;
- MySQL 8 avec sauvegardes chiffrées et restauration testée;
- un ou plusieurs workers `queue:work` supervisés;
- un processus Reverb supervisé derrière un proxy WebSocket TLS;
- le scheduler Laravel déclenché chaque minute;
- un stockage persistant privé/public selon la nature des fichiers.

La SPA et l’API doivent rester sur le même site registrable lorsque Sanctum utilise `SameSite=Lax`. Si l’architecture impose deux sites distincts, utiliser exclusivement HTTPS, `SameSite=None`, `Secure=true` et valider ce choix avec un audit CSRF/CORS.

## Versions et extensions

- PHP `>= 8.3` : ctype, curl, fileinfo, filter, hash, mbstring, OpenSSL, PDO MySQL, tokenizer, XML;
- Composer 2;
- Node.js 24 pour le build;
- MySQL 8;
- un reverse proxy compatible HTTP/2, TLS et WebSocket.

## Environnement backend

Partir de `backend-new/.env.production.example`. Les valeurs suivantes sont obligatoires :

| Variable | Exigence |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | secret généré une fois, sauvegardé hors dépôt |
| `APP_URL` | URL HTTPS exacte de l’API |
| `FRONTEND_URL` | URL HTTPS exacte de la SPA |
| `CORS_ALLOWED_ORIGINS` | liste explicite, jamais `*` |
| `SANCTUM_STATEFUL_DOMAINS` | hôtes frontend autorisés, sans schéma |
| `SESSION_DRIVER` | `database` ou Redis durable |
| `SESSION_DOMAIN` | domaine partagé approprié |
| `SESSION_SECURE_COOKIE` | `true` |
| `SESSION_HTTP_ONLY` | `true` |
| `SESSION_SAME_SITE` | `lax`, sauf architecture inter-sites justifiée |
| `DB_*` | compte MySQL dédié avec privilèges minimaux |
| `QUEUE_CONNECTION` | `database` ou Redis |
| `MAIL_*` | véritable fournisseur SMTP/API |
| `PHONE_VERIFICATION_ENABLED` | `false` tant qu’un provider SMS production réel n’est pas branché |
| `PHONE_VERIFICATION_DRIVER` | jamais `local` en production ; `fail_closed` uniquement si la fonctionnalité est désactivée |
| `REVERB_*` | identifiants uniques, origins explicites, TLS |

Ne jamais journaliser ou afficher `APP_KEY`, mots de passe, cookies, XSRF, bearer tokens historiques, PIN ou secret Reverb.

## Build et release

Avant toute release, exécuter `scripts/preflight.ps1` dans un environnement configuré comme la production. Construire des artefacts immuables :

```bash
cd backend-new
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction

cd ../frontend
npm ci
npm run build
```

Lors de la mise en service orchestrée par l’opérateur : placer l’application en maintenance si nécessaire, sauvegarder la base, exécuter `php artisan migrate --force`, puis reconstruire les caches avec `php artisan optimize`. Ne jamais exécuter `db:seed`, `migrate:fresh` ou `db:wipe`.

## Processus supervisés

```bash
php artisan queue:work --sleep=3 --tries=3 --max-time=3600
php artisan reverb:start
php artisan schedule:run
```

Le scheduler est déclenché chaque minute par le système. Les workers et Reverb doivent redémarrer automatiquement, recevoir un arrêt gracieux et exposer leurs erreurs aux alertes.

Le proxy WebSocket doit transmettre `Upgrade`, `Connection`, l’hôte et l’adresse cliente de confiance. Les origins Reverb doivent correspondre exactement au frontend.

## Headers et CORS

Laravel applique les headers de sécurité aux réponses API. Le serveur statique du frontend doit appliquer séparément : `X-Content-Type-Options`, `X-Frame-Options` ou `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, HSTS et une CSP adaptée aux assets Vite/API/WebSocket.

Avec les cookies Sanctum, `Access-Control-Allow-Credentials` est actif. Une origin wildcard est interdite et filtrée par la configuration. Vérifier les requêtes preflight et les cookies dans un navigateur sur les domaines réels.

## Données, fichiers et confidentialité

- La colonne `price` est `DECIMAL(12,2)` et le revenu utilise seulement `payment_status=paid` avec `paid_at`.
- Les documents d’identité ne doivent jamais être copiés dans un stockage public.
- Les avatars sont limités à JPEG/PNG/WebP, 2 Mio et 4096×4096.
- Le téléphone n’accorde aucun droit privé avant vérification réelle.
- Aucun fournisseur SMS fictif n’est autorisé en production; l’implémentation par défaut échoue de manière sûre.
- Un trajet déclaré par un voyageur sert à la correspondance applicative d’itinéraire. Il ne constitue jamais une preuve externe du voyage.

## Réconciliation du ledger de migrations

Une base SQLite locale connue contient l’entrée `2026_08_18_000001_add_unique_phone_to_users_table` alors que le fichier versionné se nomme `2026_08_12_000001_add_unique_phone_to_users_table.php`, avec l’index `users_phone_unique` déjà présent. Ne jamais corriger ce cas en supprimant l’index, en modifiant aveuglément la table `migrations` ou en lançant `migrate:fresh`.

Procédure obligatoire pour une base existante :

1. prendre une sauvegarde complète et en vérifier la restauration ;
2. cloner la base dans un staging isolé ;
3. comparer le schéma réel (`users_phone_unique`, colonnes et contraintes) au ledger `migrations` ;
4. confirmer que le changement de schéma correspondant a effectivement été appliqué ;
5. corriger le seul enregistrement de ledger concerné, dans une transaction et avec une revue opérateur, uniquement si cette preuve est acquise ;
6. exécuter `migrate:status`, puis les migrations pending sur le clone et la suite complète avant toute fenêtre de production.

Pour une base neuve, toutes les migrations doivent passer de zéro. La migration de canonicalisation téléphonique détecte les comptes qui convergeraient vers le même E.164 et s’arrête avec les IDs concernés ; elle ne fusionne jamais silencieusement des comptes.

## Paiements historiques

L’ancien booléen `is_paid` pouvait être positionné automatiquement lors d’une livraison. Il ne constitue donc pas une preuve de paiement. Le backfill classe ces lignes `legacy_unverified`, sans `paid_at` et sans les inclure dans le revenu. Si une base historique doit être conservée, un opérateur doit rapprocher chaque ligne avec une source fiable (prestataire de paiement, caisse ou pièce comptable), puis utiliser l’action admin auditée de mise à jour du paiement. En l’absence de données historiques destinées à la production, documenter explicitement que ce rapprochement est sans objet.

## Sauvegarde et restauration

- sauvegarde MySQL automatisée, chiffrée et versionnée;
- rétention définie avec le responsable des données;
- copie hors de l’hôte applicatif;
- test de restauration périodique documenté;
- sauvegarde avant chaque migration de release;
- conservation indépendante et limitée des journaux d’audit.

## Observabilité et santé

- `GET /up` pour la disponibilité HTTP;
- métriques 5xx, 429, latence, profondeur de queue et reconnexions Reverb;
- alertes sur échecs de jobs, base indisponible et espace disque;
- logs structurés sans données sensibles;
- rotation et rétention des logs.

## Rollback

1. arrêter l’admission de nouvelles mutations;
2. conserver les logs et prendre une sauvegarde;
3. restaurer l’artefact applicatif précédent;
4. ne lancer un `migrate:rollback` qu’après examen manuel de la migration et de la compatibilité des données;
5. restaurer la base uniquement depuis une sauvegarde vérifiée lorsque la migration n’est pas réversible sans perte;
6. relancer les smoke tests et surveiller les métriques.

## Bloqueurs à lever avant ouverture

- domaines et certificats TLS réels;
- base MySQL réelle et restauration validée;
- mailer réel;
- fournisseur de vérification téléphonique réel si les privilèges destinataire sont activés;
- identifiants Reverb et proxy WSS;
- destinations de sauvegarde et d’alertes;
- revue de confidentialité des CIN, permis et plaques;
- test de charge et E2E intégral sur un environnement isolé.
