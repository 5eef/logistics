# Démonstration locale

## Lancement

```powershell
.\LANCER_SITE.bat
```

Le script vérifie PHP, Composer, Node et npm, installe les dépendances de développement, applique uniquement les migrations en attente sur la base locale et démarre l’API, la queue, Reverb et Vite.

Pour injecter volontairement les données de démonstration dans un environnement non-production :

```powershell
$env:DEMO_SEED = '1'
.\LANCER_SITE.bat
```

Le seeder refuse `APP_ENV=production`. Le script n’affiche aucun mot de passe de démonstration.

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
