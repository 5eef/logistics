# Audit final — staging local et préparation production

Date : 24 août 2026

Branche : `deployment-ready`

Périmètre : dépôt et Docker local. Aucun déploiement, commande cloud, DNS public, email/SMS réel, commit ou push.

## Verdict exécutif

| Niveau | Verdict | Motif |
|---|---|---|
| CODE READY | **YES** | Suites backend et frontend, analyses statiques, audits et builds verts. |
| LOCAL STAGING READY | **YES** | MySQL, HTTPS, Sanctum, SMTP/Mailpit, Reverb/WSS privé, queue, scheduler, backup/restauration, smoke et E2E réels validés. |
| REMOTE STAGING READY | **NO** | Serveur, domaines, TLS public, DB distante/persistante, SMTP réel et backup hors hôte non fournis. |
| PRODUCTION READY | **NO** | Aucun environnement réel n’a été déployé ni validé. |

Baseline réellement exécutée avant les changements :

- Composer validate/audit : succès, aucun advisory ;
- Pint : 99 fichiers, succès ;
- PHPStan niveau configuré : 53 fichiers, 0 erreur ;
- Laravel : 43 routes, 64 tests et 298 assertions, succès ;
- npm ci/audit : 398 paquets, 0 vulnérabilité ;
- ESLint et typecheck : succès ;
- Vitest : 4 fichiers, 9 tests, succès ;
- Vite : 2 251 modules, succès ;
- Playwright existant : 3 tests Chromium, succès.

Le PHP Windows local quittait anormalement sans diagnostic; les validations PHP ont donc été exécutées dans l’image officielle Composer 2.8, sans modifier le code pour contourner l’environnement hôte.

## Architecture livrée

- `docker-compose.staging.yml` sépare frontend, backend, MySQL, migration one-shot, queue, scheduler, Reverb, Mailpit et Caddy.
- MySQL 8.4 conserve son volume, utilise utf8mb4, un utilisateur applicatif et aucun port publié.
- Images multi-stage : Composer sans dev pour PHP 8.4/Apache; Node 24 pour le build puis Nginx non-root servant uniquement `dist/`.
- Caddy termine HTTPS/WSS, redirige HTTP, limite les uploads à 3 Mio et applique CSP, anti-sniffing, referrer et permissions. HSTS reste réservé au modèle production.
- Réseaux `public`/`internal`, aucun mode privilégié ou socket Docker, limites CPU/mémoire/PID et rotation `json-file`.
- Sessions/cache/queue `database`; Redis n’a pas été ajouté sans nécessité.
- Laravel écrit sur stderr; Caddy et tous les services utilisent la rotation Docker.

## Secrets et données

`.env.staging.example` ne contient que des placeholders. `scripts/init-staging.ps1` génère localement `.env.staging` ignoré avec APP_KEY Laravel standard et secrets aléatoires; aucune valeur n’est imprimée. Certificats privés et dumps réels sont ignorés.

`StagingSeeder` refuse tout autre environnement que `staging`, exige un mot de passe de test fort fourni par environnement et ne crée que des personnes/adresses fictives `example.test`. Aucune base de développement ou distante n’a été copiée.

La vérification téléphonique reste désactivée et fail-closed. Les futures clés provider sont prévues, mais aucun fournisseur fictif ou OTP production n’a été ajouté. Google Cloud / Google Console is NOT required. Le mail production reste SMTP provider-agnostic.

## Validation infrastructure réelle

- Toutes les 17 migrations passent de zéro sur MySQL et `migrate:status` les marque `Ran`.
- `config:cache`, `route:cache` et `view:cache` passent. La route racine a été rendue cacheable.
- Health public : `{"status":"ok"}` uniquement; readiness DB/cache/queue, avec 503 minimal pendant une panne MySQL.
- Huit services durables sont `healthy`; le scheduler est isolé et `schedule:list` confirme qu’aucune tâche n’est encore définie.
- Sanctum sous HTTPS valide CSRF, login, `/me`, mutation et logout.
- WSS atteint Reverb via Caddy et les canaux privés sont autorisés par session/CSRF.
- Le worker persiste les broadcasts dans MySQL; les jobs échoués de diagnostic ont été rejoués, puis `queue:failed` est revenu vide.
- Le reset de mot de passe a traversé Laravel, SMTP, Mailpit, un lien React HTTPS, le changement de mot de passe et un nouveau login.
- Le backup compressé a été restauré dans une base temporaire et contrôlé sans toucher à la source.

Validation finale du code réellement exécutée : Composer valide et sans advisory; Pint 102 fichiers; PHPStan 54 fichiers et 0 erreur; 45 routes; PHPUnit 66 tests/302 assertions; npm ci 398 paquets et 0 vulnérabilité; lint/typecheck verts; Vitest 4 fichiers/9 tests; build Vite 2 251 modules; Playwright existant 3 tests. La campagne staging finale a ensuite réussi le preflight, le smoke, le Playwright intégré, le reset Mailpit, le dump et la restauration.

## Tests de panne et performance

`scripts/test-failures.ps1` a validé : MySQL arrêté -> readiness 503 sans détail; Reverb arrêté -> API disponible et fallback polling possible; Mailpit arrêté -> erreur mail isolée; worker arrêté -> job persistant puis drainé à la reprise. Chaque service est redémarré dans un `finally`.

Un test Chromium dédié a ensuite prouvé le fallback de bout en bout : Reverb arrêté, notification récupérée par le polling SPA en 31,0 s, Reverb redémarré, broadcast rejoué et aucune entrée restante dans `jobs` ou `failed_jobs`.

Le test local de 100 lectures HTTPS avec concurrence 10 a mesuré 0 erreur, 90,52 requêtes/s, p50 6,45 ms et p95 90,08 ms. Ce résultat léger ne prédit pas la capacité d’un serveur réel.

Les `EXPLAIN` MySQL ont utilisé les index de disponibilité, listes par propriétaire/transporteur/destinataire, notifications, recherche/modération et agrégations expéditeur. Un filesort demeure sur la disponibilité triée car l’index métier privilégie les filtres ville/statut; avec le faible volume fictif, aucun index supplémentaire n’est justifié.

## Incidents d’intégration corrigés

- Cible broadcast serveur séparée du WSS public (`reverb:8080` interne contre `api.logistics.local:443` public).
- Origins Reverb corrigées au format hôte réellement comparé par le serveur.
- Autorisation Pusher privée remplacée par `fetch` credentialé avec CSRF dynamique.
- Readiness découplé du rate limiter stocké en base afin de répondre proprement pendant une panne DB.
- Dépendance Google Fonts supprimée pour respecter la CSP et éliminer un appel externe.
- Limite PID Caddy relevée de 64 à 128 après preuve que les reconnexions WSS empêchaient le processus de healthcheck de démarrer; le conteneur final est sain.

## Exploitation et rollback

Les procédures sont dans `docs/STAGING.md`, `docs/BACKUP_RESTORE.md` et `docs/OPERATIONS.md`. Les scripts start/stop ne créent pas de secrets faibles et ne suppriment jamais les volumes par défaut. Les failed jobs nécessitent une action explicite. Un rollback production doit réutiliser l’artefact précédent et une sauvegarde vérifiée; aucun `migrate:fresh`, `db:wipe`, `down -v` ou rollback de schéma aveugle.

## Bloqueurs externes restants

Avant un staging distant ou la production, un opérateur doit fournir et tester :

1. serveur et domaines réels ;
2. certificats publics, redirection et HSTS ;
3. MySQL durable avec réseau privé et sauvegardes hors hôte chiffrées ;
4. SMTP réel et réputation/retours email ;
5. WSS public et supervision ;
6. alertes, métriques, centralisation/rétention de logs ;
7. provider SMS supporté uniquement si la vérification est activée ;
8. tests de charge, capacité, restauration et rollback sur cette infrastructure réelle ;
9. exécution réussie du preflight production avec les valeurs finales.

Ces absences sont des prérequis d’infrastructure, pas des échecs du staging local.
