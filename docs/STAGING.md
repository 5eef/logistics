# Production-like staging local

Ce staging reproduit localement la topologie de production sans créer de ressource cloud et sans utiliser de données réelles. Google Cloud / Google Console is NOT required. Azure n’est pas requis non plus.

## Topologie

```text
Navigateur
  -> Caddy 2.10.2, HTTPS/WSS sur 127.0.0.1:443
     -> Nginx non-root, build React dist/ uniquement
     -> Apache/PHP 8.4 non-root, API Laravel
     -> Reverb dédié sur le réseau interne
     -> Mailpit privé, publié uniquement via Caddy local
  -> MySQL 8.4 persistant, sans port hôte
  -> worker database queue dédié
  -> scheduler dédié
```

Les services applicatifs partagent le réseau Docker `internal`; seul Caddy rejoint aussi `public`. Aucun socket Docker, mode privilégié ou port MySQL/Reverb direct n’est exposé.

## Premier démarrage

Prérequis : Docker Desktop, Node.js 24 pour les tests hôte, PowerShell et des ports locaux 80/443 libres.

```powershell
.\scripts\init-staging.ps1
.\scripts\install-local-hosts.ps1
.\scripts\staging-up.ps1 -SeedTestData
```

`init-staging.ps1` crée `.env.staging`, ignoré par Git, avec des secrets cryptographiquement aléatoires. Il ne remplace jamais un fichier existant sans `-Force`. Le seeder refuse tout environnement autre que `staging` et crée uniquement des identités `example.test` et des adresses fictives.

Les noms locaux sont :

- `https://logistics.local` : SPA ;
- `https://api.logistics.local` : API et WSS ;
- `https://mail.logistics.local` : interface Mailpit locale.

Le script hosts gère un bloc idempotent dans le fichier hosts Windows. Pour le retirer :

```powershell
.\scripts\install-local-hosts.ps1 -Remove
```

## Certificats locaux

La configuration par défaut utilise l’autorité locale interne de Caddy. Les tests automatisés acceptent uniquement cette CA locale. Pour une confiance navigateur native, importer explicitement la racine Caddy locale ou utiliser `mkcert`, placer les fichiers hors Git dans `.docker/tls`, puis adapter `docker/caddy/Caddyfile.mkcert.example`. Les clés et certificats réels sont ignorés.

HSTS n’est pas activé sur les domaines `.local`. Le modèle `docker/caddy/Caddyfile.production.example` active HSTS uniquement pour de vrais domaines HTTPS.

## Commandes opérateur

```powershell
.\scripts\staging-status.ps1
.\scripts\staging-logs.ps1
.\scripts\staging-logs.ps1 -Service backend
.\scripts\staging-down.ps1
```

`staging-down.ps1` conserve les volumes. Il ne lance jamais `down -v`.

## Validation

```powershell
.\scripts\preflight.ps1 -Environment staging -RequireRunning -SkipTests
.\scripts\smoke-test.ps1
.\scripts\test-staging-e2e.ps1
.\scripts\test-realtime-fallback.ps1
.\scripts\test-password-reset.ps1
.\scripts\backup-mysql.ps1
.\scripts\test-restore.ps1
.\scripts\test-failures.ps1

$env:LOAD_TEST_ALLOW_LOCAL_CA='true'
node .\scripts\basic-load-test.mjs
Remove-Item Env:LOAD_TEST_ALLOW_LOCAL_CA

.\scripts\database-explain.ps1
```

Le smoke test couvre HTTPS, health, CSRF, login, `/me`, mutation protégée, MySQL, upgrade WSS et logout. Playwright couvre l’inscription, les rôles, le prix serveur, la création idempotente, la notification privée réelle, la prise transporteur, le refus du bypass `delivered`, la progression, le PIN, le destinataire, la note et les logouts. Le test mail couvre réellement Laravel -> SMTP -> Mailpit -> lien React -> nouveau mot de passe -> login.

## Configuration importante

- Sanctum : cookies `Secure`, session HttpOnly, `SameSite=Lax`, domaine `.logistics.local`, origins explicites.
- Reverb public : `REVERB_HOST=api.logistics.local` et `VITE_REVERB_*` en HTTPS/WSS.
- Diffusion serveur : `REVERB_INTERNAL_HOST=reverb`, port `8080`, HTTP privé. Les secrets restent identiques.
- `REVERB_ALLOWED_ORIGINS` contient des noms d’hôte sans schéma, jamais `*`.
- Queue, cache et sessions utilisent MySQL/database; Redis n’ajoutait ici aucune valeur nécessaire.
- SMTP staging utilise Mailpit. Aucun email externe n’est envoyé.
- `PHONE_VERIFICATION_ENABLED=false` et driver `fail_closed`. Aucun OTP fixe n’est accepté ni journalisé.

## Ressources locales initiales

Les limites Compose sont des garde-fous de staging, pas un dimensionnement production : MySQL 768 Mio/1 CPU, backend 512 Mio/1 CPU, queue 384 Mio/0,75 CPU, Reverb et scheduler 256 Mio, frontend et Caddy 128 Mio. Elles doivent être recalibrées avec des métriques réelles avant tout hébergement distant.
