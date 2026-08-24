# Démonstration locale

## Lancement

```powershell
.\scripts\init-staging.ps1
.\scripts\staging-up.ps1 -SeedTestData
```

Ces scripts préparent l’environnement puis démarrent l’application complète avec Docker Compose : API, frontend, MySQL, Redis, queue, scheduler, Reverb, Caddy et Mailpit.

Pour vérifier l’état des services :

```powershell
.\scripts\staging-status.ps1
.\scripts\smoke-test.ps1
```

Le seeder de staging refuse `APP_ENV=production`. Les secrets locaux restent dans `.env.staging`, qui n’est pas versionné.

## Vérifications avant présentation

```powershell
cd backend-new
php artisan test

cd ..\frontend
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Le suivi de démonstration `LOG2024ABC` n’est affiché dans l’interface qu’en mode Vite développement ou lorsque `VITE_DEMO_MODE=true` est configuré explicitement.
