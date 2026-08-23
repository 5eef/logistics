# Audit final de préparation à la production — Logistics School

Date de l’audit : 23 août 2026  
Branche examinée : `deployment-ready`  
Révision de départ : `7f36d40`  
Périmètre : code local uniquement. Aucun déploiement, aucune commande cloud, aucun commit, aucun push et aucune migration sur une base distante n’ont été effectués.

## Verdict exécutif du contre-audit

| Niveau | Verdict | Justification |
|---|---|---|
| **CODE READY** | **OUI** | Reset complet vers la SPA, téléphone réellement câblé en local/testing et explicitement désactivé/fail-closed en production, pagination UI, tracking public sans note libre, collision d’idempotence sans 500, invariants admin et révocation de l’approbation après modification du véhicule. |
| **STAGING READY** | **NON** | Le clone staging, la réconciliation du ledger SQLite, MySQL, le mailer réel, les domaines/cookies, Reverb, les sauvegardes et les E2E intégrés avec services réels ne sont pas encore validés. |
| **PRODUCTION READY** | **NON** | Aucun preflight avec valeurs finales ni preuve de restauration, de provider externe, de charge/concurrence MySQL et d’observabilité réelle n’a été fourni. |

## A. État initial

Le dépôt contenait une SPA React fonctionnelle et une API Laravel couverte par 35 tests backend (109 assertions), 3 tests frontend et un scénario Playwright public. Les builds étaient déjà opérationnels, et les audits Composer/npm ne signalaient pas de vulnérabilité connue.

Les problèmes réellement observés avant correction étaient néanmoins incompatibles avec une mise en production :

- la transition générale de statut permettait de marquer un colis `delivered` sans PIN ;
- la livraison marquait aussi automatiquement le paiement comme encaissé ;
- le prix envoyé par le navigateur était accepté comme autorité ;
- le prix était stocké et manipulé avec des flottants ;
- la SPA stockait un bearer token Sanctum dans `localStorage` ;
- l’accès destinataire reposait sur une comparaison de numéro de téléphone non vérifié ;
- un voyageur pouvait présenter une route provenant uniquement du navigateur ;
- le PIN ne disposait pas d’un verrou par colis ni d’un compteur persistant ;
- plusieurs réponses sérialisaient directement des modèles Eloquent ;
- plusieurs collections admin/utilisateur n’étaient pas paginées ;
- des statistiques chargeaient les lignes en mémoire et le regroupement mensuel n’incluait pas l’année ;
- les opérations de modération/override/paiement n’avaient pas de journal d’audit persistant complet ;
- la récupération de mot de passe n’existait pas ;
- les contrôleurs concentraient validation, autorisation et logique métier ;
- le fallback Reverb ne dépendait pas de l’état réel de la connexion ;
- le frontend Laravel résiduel doublonnait inutilement la vraie SPA située dans `frontend/` ;
- ESLint, le typecheck TSX, PHPStan/Larastan et un preflight production cohérent manquaient ;
- la documentation et le script de lancement ne correspondaient plus à l’architecture réelle.

## B. Problèmes corrigés

| Criticité | Cause et fichiers principaux | Correction | Preuves associées |
|---|---|---|---|
| Critique | Transition finale dispersée dans `ColisController` | `ShipmentStateMachine` et `DeliveryService` centralisent les transitions. `delivered` est refusé par `/status`, y compris lors d’un retry ; seul `/validate-pin` peut finaliser. L’override admin est une action séparée avec raison et audit. | `ColisSecurityTest`, `ProductionHardeningTest` : bypass, états invalides, transporteur assigné/non assigné, idempotence, override admin. |
| Critique | Prix calculé et envoyé par React | `ShipmentPricingService`, `config/logistics.php` et `POST /api/colis/quote`. `POST /api/colis` prohibe `price` et recalcule en centimes entiers. Le champ React est readonly et alimenté par la quote serveur. | Tests des montants 0/1/-10/999999, quote à 67,50 MAD, E2E de création sans champ `price`. |
| Critique | Bearer token dans `localStorage` | Sanctum SPA stateful, session Laravel régénérée au login, invalidée au logout, cookie HttpOnly, cookie XSRF lisible, credentials CORS, retry 419 unique et gestion globale 401. Echo utilise aussi la session. | Tests session/login/logout, test API frontend des credentials/XSRF, E2E sans `logistics_token`. |
| Élevée | Livraison couplée au paiement | Ajout de `payment_status`, `payment_method`, `paid_at`; le PIN ne modifie plus le paiement. Les anciens `is_paid=true` deviennent `legacy_unverified`, jamais `paid` sans rapprochement. | Test livraison non payée, double appel paiement avec un seul audit et runbook de rapprochement historique. |
| Élevée | `FLOAT` pour les montants | Nouvelle migration vers `DECIMAL(12,2)` et cast Eloquent `decimal:2`; calcul en grammes/centimes sans flottants binaires. | Tests de prix décimal et idempotence. |
| Élevée | Téléphone revendiqué utilisé comme identité | E.164 Maroc canonical appliqué aux comptes et colis, endpoints start/confirm avec Form Requests et limiteurs, provider invoqué, liaison transactionnelle après confirmation. Driver local limité à `local/testing`; production désactivée et fail-closed. | Tests start, mauvais/bon code, rate limit, provider absent, changement de numéro, absence de privilège, liaison, formats équivalents, backfill et collision. |
| Élevée | Route voyageur contrôlée par le navigateur | Modèle et endpoints `TravelerTrip`; prise conditionnée à un trajet actif serveur concordant, au compte vérifié, à l’éligibilité et à une transaction `lockForUpdate()`. | Tests trajet absent, route incorrecte, trajet correspondant et prise unique. |
| Élevée | PIN bruteforceable au niveau colis | Hash conservé, compteur et verrou temporaire persistants, limiteur utilisateur+colis, échecs structurés sans PIN dans les logs, reset au succès. | Tests mauvais PIN répété, lock, bon PIN après délai, utilisateur non assigné, idempotence. |
| Élevée | Sérialisation Eloquent et risque de fuite PII | Resources allowlistées : utilisateur, admin, transporteur public, colis, suivi public, historique, ticket/réponse et notification. Le suivi public ne renvoie plus l’ID numérique, les adresses, téléphones ou champs de contrôle. | Tests PII/PIN/hash absents et profil transporteur public limité. |
| Élevée | Autorisations objet dispersées | `ColisPolicy` et `TicketPolicy`, Gates dans les services/contrôleurs, middleware de rôle conservé pour l’admin. | Suite de tests d’IDOR, rôle, statut, rating et ticket. |
| Élevée | Modération non traçable | Table `audit_logs`, `AuditLogger` avec filtrage des clés sensibles, raison obligatoire, état avant/après, acteur et timestamp. Rejet, vérification, avertissement, ban, override et paiement sont journalisés. | Tests de persistance des raisons, trois actions de modération auditées, override/paiement audités. |
| Moyenne | Création duplicable après timeout | UUID `client_request_id`, unicité DB par expéditeur, réponse de replay et génération unique par soumission React. | Test de deux requêtes identiques créant une seule ligne et E2E vérifiant l’UUID. |
| Moyenne | Rating sujet aux courses et doublons | Transaction, verrou du colis, table `ratings` comme source de vérité, `AVG/COUNT` SQL, contrainte unique et conflit 409 explicite. | Tests transporteur incorrect, utilisateur incorrect et doublon conservant un seul agrégat. |
| Moyenne | Collections et stats non scalables | Pagination bornée à 100, filtres validés, agrégations SQL, mois `YYYY-MM`, revenus payés seulement, nouveaux index composites. | Tests `per_page`, filtre rôle/statut et statistiques existantes. |
| Moyenne | Réinitialisation de mot de passe absente | `Notifiable`, broker Laravel officiel, URL `FRONTEND_URL/reset-password`, formulaire SPA complet, réponse anti-énumération, token temporaire et révocation des tokens/sessions. | Notification/URL SPA, compte absent identique, token valide/invalide/expiré, sessions révoquées, logs sans secret et test React. |
| Moyenne | Upload avatar insuffisamment borné | MIME image allowlisté, 2 MiB max, dimensions max 4096, nom généré côté serveur et absence de SVG/HTML/PHP. | `ProfileTest` upload et mise à jour. |
| Moyenne | CORS/headers incomplets | Origins explicites sans `*`, credentials activés, endpoint CSRF inclus ; CSP restrictive sur l’API en plus des headers existants. | Tests CORS de configuration et headers de sécurité. |
| Moyenne | Gestion d’erreurs/realtime fragile | `ApiError` centralisé pour 401/403/419/422/429/500/503, timeout borné, Error Boundary, erreurs de pages visibles, polling toutes les 30 s uniquement si Echo est réellement déconnecté. | Tests API, build et scénarios Playwright. |
| Faible | Accessibilité et mobile | Labels associés aux champs critiques, logo/boutons sémantiques, attributs ARIA du hamburger, fermeture Escape, notifications mobiles, prix readonly et états disabled/loading. | E2E par rôles accessibles et lint JSX. |
| Faible | Double stack Vite | Suppression du scaffold Node/Blade Laravel après vérification de l’absence de vue consommatrice ; `frontend/` est l’unique client. | Route racine JSON, route:list et build SPA. |
| Faible | Tooling/CI insuffisants | Pint, Larastan/PHPStan niveau 5, ESLint, typecheck TSX, audits et E2E dans la CI ; script `scripts/preflight.ps1` non destructif. | Toutes les commandes de la section G passent ; syntaxe PowerShell validée. |

Les anciennes migrations restent sémantiquement inchangées. Le seul écart Git sur `2024_01_01_000008_create_personal_access_tokens_table.php` est l’ajout d’un saut de ligne final, sans modification de schéma ou d’instruction.

## C. Architecture finale

- **Client** : SPA React 18/Vite dans `frontend/`, routes lazy-loadées, Wouter, Tailwind/Radix, graphiques Recharts chargés avec les dashboards.
- **API** : monolithe modulaire Laravel 13.26.1 dans `backend-new/`, contrôleurs minces pour les flux critiques, Form Requests, Policies, Resources et services métier.
- **Authentification** : session first-party Laravel/Sanctum, cookie de session HttpOnly et CSRF double-submit Laravel. Aucun secret d’authentification SPA n’est persisté par JavaScript.
- **Données** : MySQL cible ; SQLite isolé pour les tests. Les nouvelles migrations préservent et backfillent les lignes existantes.
- **Temps réel** : Reverb/Echo sur canaux privés authentifiés par session, avec polling modéré seulement pendant une déconnexion.
- **Asynchrone** : worker de queue Laravel et scheduler attendus comme processus supervisés en production.
- **Client statique** : le reverse proxy/CDN qui sert React doit appliquer ses propres headers ; le middleware Laravel ne protège que les réponses API.

## D. Sécurité

- Login limité par email normalisé+IP et par IP globale ; register, tracking public et PIN possèdent des limiteurs nommés.
- Session régénérée après authentification ; logout avec invalidation de session et rotation CSRF.
- CORS credentialé limité aux origins configurées ; aucun wildcard n’est conservé.
- Policies et ressources explicites réduisent IDOR, mass assignment et exposition future de champs sensibles.
- Le suivi public accepte les IDs historiques et les nouveaux IDs à entropie accrue, sans ID interne ni PII.
- Le PIN reste haché, n’est jamais journalisé et ne peut confirmer qu’un colis `out_for_delivery` assigné.
- Les actions admin sensibles sont séparées du flux transporteur, exigent une raison et laissent un audit immuable applicativement.
- Le logger d’audit filtre mot de passe, PIN, token, Authorization, cookies et secrets de configuration.
- Les avatars utilisent une allowlist MIME et des limites de taille/dimensions ; aucun nom client n’est réutilisé.
- Les headers API incluent anti-sniffing, anti-framing, referrer/permissions, HSTS sous HTTPS et une CSP adaptée à une API JSON.

La CSP et les headers du site statique doivent encore être configurés sur le serveur qui hébergera le build React.

## E. Scalabilité

- Pagination serveur avec `page`/`per_page` et maximum 100 pour colis, utilisateurs, tickets, notifications et recherches concernées.
- Filtres de recherche, ville, rôle et statut validés avant construction des requêtes.
- Agrégations SQL `COUNT`, `SUM`, `CASE`, `AVG` et `GROUP BY`; aucun chargement complet pour les statistiques principales.
- Données mensuelles groupées par année et mois sur une fenêtre de 12 mois.
- Index composites ajoutés pour disponibilité des colis, propriétaires/transporteurs, paiements, modération, tickets, notifications, trajets et audit.
- Prise de colis, PIN, rating et changements financiers sensibles protégés par transaction/verrou.
- Routes React lazy-loadées. Le chunk Recharts reste isolé des pages publiques.

## F. UI/UX

L’identité visuelle existante a été conservée. Les changements portent sur la robustesse : erreurs visibles plutôt qu’avalées, Error Boundary, formulaires désactivés pendant les soumissions, prix non éditable, villes serveur avec état d’échec, navigation mobile/notifications accessibles, fermeture clavier, labels reliés aux inputs et vocabulaire exact « informations de vérification ».

Les gros dashboards n’ont pas été redessinés ni fractionnés artificiellement. Une extraction progressive de composants communs reste souhaitable, mais n’est pas un prérequis de sécurité.

## G. Tests et validations exécutés

### Baseline

Baseline de cette passe de contre-audit, avant modification : `git diff --check` sans erreur ; 48 tests backend/203 assertions ; Pint, PHPStan, Composer validate/audit, route list, npm ci/audit/lint/typecheck/build, 4 tests Vitest et 3 E2E Playwright réussis. Vitest et Playwright ont d’abord été bloqués par le sandbox de fichiers lors du chargement des configs esbuild, puis ont réussi sans modification lorsqu’ils ont été relancés hors de ce sandbox.

- `php artisan test` : **35 tests, 109 assertions, succès**.
- `composer validate --strict` : **succès**.
- `composer audit` : **0 vulnérabilité**.
- `npm ci` : **succès**.
- `npm test` : **3 tests, succès**.
- `npm run build` : **succès**.
- `npm run test:e2e` : **1 test Chromium, succès**.
- `npm audit` : **0 vulnérabilité**.

### Validation finale

- `composer validate --strict --no-check-publish` : **composer.json valide**.
- `composer audit --locked` : **aucun avis de sécurité**.
- `composer lint` / `vendor/bin/pint --test` : **succès**.
- `composer analyse` / PHPStan-Larastan niveau 5 : **53 fichiers, 0 erreur**.
- `php artisan route:list --except-vendor` : **43 routes applicatives**.
- `php artisan test` : **64 tests, 298 assertions, succès**.
- `npm ci` : **398 paquets installés, 399 audités, 0 vulnérabilité**. Un premier essai a rencontré un verrou OneDrive `ENOTEMPTY`; la reconstruction suivante a réussi.
- `npm audit --audit-level=high` : **0 vulnérabilité**.
- `npm run lint` : **0 erreur, 0 avertissement**.
- `npm run typecheck` : **succès**.
- `npm test -- --run` : **4 fichiers, 9 tests, succès**.
- `npm run build` : **2 251 modules transformés, succès** ; chunk Recharts isolé de 464,70 kB (123,67 kB gzip).
- `npm run test:e2e` : **3 scénarios Chromium, succès** : suivi/auth public, session login/logout sans bearer persistant, création avec quote serveur/idempotence.
- analyse syntaxique de `scripts/preflight.ps1` : **succès**.
- recherche des marqueurs d’encodage corrompu : **aucun résultat**.
- `git diff --check` : **aucune erreur de whitespace** ; seul avertissement Git attendu sur la future normalisation LF→CRLF du fichier batch.

Le preflight complet n’a pas été déclaré réussi contre le `.env` local : il exige volontairement `APP_ENV=production`, des domaines réels et une base de production configurée. L’exécuter avant mise en service est une action opérateur obligatoire.

## H. Audit des dépendances

- Composer : aucun advisory. Laravel a été mis à jour de 13.13.0 à 13.26.1, Sanctum de 4.3.2 à 4.3.3, Pint de 1.29.1 à 1.30.5, ainsi que les dépendances transitives compatibles. PHPUnit 13 n’a pas été adopté car il s’agit d’une version majeure.
- npm : aucun advisory. Les patchs/minors autorisés par le lockfile ont été actualisés. `@tanstack/react-query`, installé mais inutilisé, a été supprimé.
- Recharts 2.15.4 émet un avertissement de fin de maintenance. La migration vers Recharts 3 est volontairement différée : c’est un changement majeur d’API qui demande une passe dédiée sur les dashboards et le composant chart.
- React 19, Vite 8, Zod 4 et autres versions majeures n’ont pas été forcés dans une mission de hardening afin de limiter le risque de régression.

## I. Migrations créées

1. `2026_08_23_000001_harden_users_and_colis_tables.php`
   - vérification téléphone et traçabilité de modération utilisateur ;
   - prix `DECIMAL(12,2)` ;
   - UUID d’idempotence ;
   - paiement explicite ;
   - compteur/verrou PIN ;
   - date de livraison ;
   - backfill des paiements/livraisons historiques.
2. `2026_08_23_000002_create_traveler_trips_and_audit_logs.php`
   - trajets voyageurs autoritatifs ;
   - journal d’audit ;
   - table officielle des tokens de reset de mot de passe.
3. `2026_08_23_000003_add_query_indexes.php`
   - index composites pour colis, paiement, transporteurs, tickets et notifications.
4. `2026_08_23_000004_canonicalize_moroccan_phone_numbers.php`
   - détection préalable des collisions de comptes avec IDs opérateur ;
   - canonicalisation E.164 Maroc des comptes et téléphones destinataires ;
   - arrêt sans fusion silencieuse en cas de collision ou de format compte non supporté.

`php artisan migrate:status` confirme que ces quatre migrations sont **Pending**, conformément à l’interdiction d’exécuter une migration sur la base locale existante. Il reproduit aussi le décalage connu : `2026_08_12_000001_add_unique_phone_to_users_table` est pending alors que le ledger fourni contient le nom `2026_08_18_000001...` et que l’index existe déjà. Le ledger n’a pas été modifié. Une base SQLite temporaire neuve a exécuté toutes les migrations de zéro avec succès.

## J. Breaking changes et compatibilité

Les changements suivants sont nécessaires et documentés :

- la SPA n’accepte plus le contrat bearer token/localStorage ; les clients first-party doivent utiliser CSRF+cookies ;
- `POST /api/colis` rejette désormais `price`; le client appelle `/api/colis/quote` ;
- les réponses de collections paginées utilisent `data`, `meta` et `links` ;
- un voyageur fournit un `trip_id` serveur correspondant lors de la prise ;
- `delivered` est interdit sur l’endpoint général et nécessite le PIN ;
- paiement et livraison sont deux actions distinctes ;
- les actions admin sensibles exigent une raison ;
- le suivi public ne renvoie plus l’ID interne ni les données personnelles ;
- le scaffold Vite/Blade Laravel inutilisé est supprimé ; la SPA `frontend/` est l’unique interface.

Les anciens tracking IDs de 10 caractères restent acceptés. Les colonnes ajoutées sont nullables ou backfillées pour préserver les données. `client_request_id` reste nullable côté API pour ne pas casser immédiatement d’éventuels anciens clients, mais la SPA l’envoie systématiquement.

## K. Bloqueurs de production restants

1. Définir les domaines réels et valider ensemble `APP_URL`, `FRONTEND_URL`, CORS, Sanctum, session domain/SameSite/Secure et origins Reverb.
2. Provisionner et tester une base MySQL réelle, sauvegarder, répéter les migrations pending sur staging, vérifier le backfill puis préparer un rollback testé.
3. Configurer un vrai mailer SMTP et tester le cycle complet de reset de mot de passe.
4. Brancher un vrai provider de vérification téléphonique si les privilèges destinataire doivent être activés. Le provider actuel échoue volontairement de manière sûre et ne valide aucun téléphone en production.
5. Générer/configurer les credentials Reverb, TLS/WSS et tester les canaux privés derrière le reverse proxy.
6. Configurer HTTPS, headers/CSP du frontend statique, secrets hors dépôt, rotation et permissions minimales.
7. Superviser API/PHP, queue worker, scheduler et Reverb ; configurer alertes, métriques, logs structurés et rétention.
8. Définir une destination de backup chiffrée et prouver une restauration complète.
9. Exécuter `scripts/preflight.ps1` avec la configuration finale puis réaliser des E2E intégrés sur staging avec MySQL, queue, mail et Reverb. Les E2E frontend actuels isolent l’UI avec des réponses API contrôlées ; ils ne remplacent pas ce test intégré.
10. Effectuer des tests de concurrence réels sur MySQL et des tests de charge sur claim, PIN, tracking, notifications et statistiques.
11. Planifier la migration Recharts 3 et élargir la matrice E2E aux parcours complets transporteur, destinataire et administration sur backend réel.

Le dépôt constitue désormais une base de release candidate nettement durcie, mais les éléments d’infrastructure, d’identité téléphonique et de validation intégrée ci-dessus empêchent objectivement une autorisation de mise en production immédiate.

## L. Contre-audit final du 23 août 2026

Les constats indépendants ont été reproduits avant correction. Cette passe a ajouté :

- le lien officiel de reset Laravel vers la route SPA `/reset-password`, avec formulaire, erreurs 422, confirmation et redirection ;
- les endpoints de vérification téléphone, leurs Form Requests/limiteurs, un provider local/testing et un fallback production désactivé/fail-closed ;
- la canonicalisation E.164 Maroc dans les entrées, modèles, recherches et une migration qui bloque avant collision ;
- le contrat paginé `{data, meta, links}`, la pagination accessible de toutes les collections et les totaux serveur ;
- la récupération ciblée de la collision DB `colis_sender_request_unique`, sans masquer les autres `QueryException` ;
- des messages publics déterministes qui ne sérialisent jamais les notes transporteur/admin ;
- les invariants `status`/`delivered_at`/`pin_validated` pour les overrides admin ;
- le retour en `pending`, la mise hors ligne et l’audit lorsqu’un transporteur modifie véhicule/plaque ;
- la déduplication, limite, horizon, liste et annulation des trajets, avec avertissement qu’une déclaration n’est pas une preuve de voyage ;
- la suppression des références PII dans les cartes disponibles, la notation du voyageur réel, les labels manquants et les erreurs silencieuses/`alert()` ;
- un preflight qui refuse migrations pending, HTTP, debug, cookies faibles, wildcard CORS, domaines incohérents, mailer placeholder, téléphone actif sans provider réel, Reverb placeholder, SQLite et secrets placeholders sans jamais afficher leurs valeurs.

Limites des preuves : la collision d’idempotence est forcée au niveau de la contrainte SQLite et récupérée via l’API, mais un test de concurrence multiprocessus reste requis sur MySQL. Les tests mail utilisent le transport `array`; l’envoi réel et la réception du lien doivent être validés sur staging. Les E2E Playwright interceptent l’API et ne constituent pas un E2E intégré avec MySQL, mail, SMS et Reverb.

## M. Verdict

- **CODE READY : OUI**, sous réserve de conserver `PHONE_VERIFICATION_ENABLED=false` en production tant qu’un provider réel n’est pas implémenté et validé.
- **STAGING READY : NON**, jusqu’à la réconciliation contrôlée du ledger et au branchement/test des services réels.
- **PRODUCTION READY : NON**, jusqu’à validation complète du preflight, restauration, sécurité, charge et E2E intégrés.
