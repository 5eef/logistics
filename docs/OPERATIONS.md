# Opérations et incidents

## Surveillance sans service externe

```powershell
.\scripts\status.ps1
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker-compose.staging.yml logs --tail 200 backend queue reverb reverse-proxy
```

Le statut montre les conteneurs, healthchecks, disponibilité HTTP/MySQL/Reverb, état des failed jobs, dernier backup et espace disque, sans afficher de secret. Tous les services utilisent la rotation Docker `json-file` de 10 Mio × 5 fichiers. Laravel écrit sur stderr dans les conteneurs.

Endpoints : `GET /up`, `GET /api/health` pour la liveness minimale et `GET /api/health/ready` pour DB/cache/queue. Les réponses publiques ne révèlent ni version, chemin, environnement ni détail d’erreur.

## Queue et scheduler

```powershell
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T backend php artisan queue:failed
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T backend php artisan queue:retry <id>
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T backend php artisan queue:forget <id>
docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T scheduler php artisan schedule:list
```

Les failed jobs ne sont jamais supprimés automatiquement. Aucun job planifié applicatif n’est défini actuellement; le service scheduler est néanmoins isolé et prêt. Ne lancer qu’une instance de scheduler par environnement.

## Pannes contrôlées

`scripts/test-failures.ps1` arrête puis restaure chaque service dans un bloc `finally`. Les preuves attendues sont : readiness 503 minimal sans MySQL, API utilisable sans Reverb, panne SMTP isolée, job durable lorsque le worker est arrêté puis drainé au redémarrage.

En incident réel :

1. lire `staging-status.ps1` et les healthchecks ;
2. préserver les logs, failed jobs et données ;
3. vérifier disque, fraîcheur du backup et MySQL ;
4. redémarrer seulement le service fautif avec Compose ;
5. rejouer explicitement un failed job après analyse ;
6. exécuter smoke et readiness après reprise.

## Rollback applicatif

Revenir à l’image immuable précédente, sans modifier la base à l’aveugle. Ne jamais utiliser `migrate:fresh`, `db:wipe`, `down -v` ou une restauration sur la base active. Si un rollback de données est indispensable, restaurer une sauvegarde testée dans une nouvelle base, vérifier la cohérence, puis effectuer une bascule opérée.

## Production externe

Sentry, Prometheus ou Grafana restent optionnels. Une production réelle doit fournir ses propres alertes sur 5xx, latence, capacité disque, MySQL, profondeur/échecs de queue, reconnexions Reverb, certificat et fraîcheur des backups. Aucun compte Google, Azure ou autre compte cloud n’est requis par le code.
