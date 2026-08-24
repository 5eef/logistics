# Rapport de validation staging

Date : 24 août 2026

Périmètre : machine locale et services Docker uniquement. Aucun cloud, DNS public, SMTP externe, SMS, registre d’images, commit ou push.

## Verdict

```text
CODE READY: YES
LOCAL STAGING READY: YES
REMOTE STAGING READY: NO — infrastructure externe non fournie
PRODUCTION READY: NO — déploiement réel non effectué
```

## Preuves locales

- MySQL 8.4 avec volume persistant, utf8mb4, compte applicatif, healthcheck et aucun port hôte; 17 migrations exécutées et toutes marquées `Ran`.
- Caddy HTTPS local et WSS; frontend de production servi par Nginx non-root; backend PHP 8.4 sans dépendances dev et non-root.
- Huit services durables sains : mysql, backend, frontend, queue, scheduler, reverb, mailpit et reverse-proxy; migration one-shot terminée.
- Caches Laravel config/routes/views créés; `schedule:list` exécuté, aucune tâche applicative définie.
- Smoke HTTPS/Sanctum/MySQL/WSS/logout réussi.
- Playwright intégré réel final réussi en 4,4 s : inscription, trois rôles, quote/création, notification privée Reverb, cycle transporteur, PIN, destinataire, rating et logout.
- Password reset réel via SMTP/Mailpit et lien SPA HTTPS réussi; le compte fictif est ensuite reseedé.
- Dump MySQL compressé créé; restauration isolée, tables/migrations/cohérence validées.
- Pannes MySQL, Reverb, Mailpit et queue testées avec reprise; aucun job échoué restant.
- Fallback Reverb final validé dans Chromium : Reverb arrêté, notification visible par polling en 31,0 s, puis service relancé et queue vidée.
- Charge non destructive : 100 lectures `/api/health`, concurrence 10, 0 erreur, 90,52 req/s; latences min 3,28 ms, p50 6,45 ms, p95 90,08 ms, max 1 029,63 ms. Résultat local indicatif, pas un dimensionnement production.
- `EXPLAIN` confirme les index composites sur disponibilité, listes expéditeur/livreur/destinataire, notifications, modération et statistiques. Le petit dataset staging limite la valeur des estimations; aucun nouvel index n’a été ajouté sans preuve.

## Défauts découverts pendant l’intégration

1. La diffusion serveur tentait le DNS public depuis le worker. Ajout d’une cible interne Reverb distincte de la cible WSS navigateur.
2. Reverb compare les hôtes d’Origin, pas des URL complètes. Les origins sont maintenant strictes et sans schéma.
3. Pusher JS 8 n’envoyait pas les cookies cross-origin via son autoriseur XHR intégré. Un autoriseur `fetch` avec credentials et CSRF dynamique sécurise les canaux privés.
4. Le limiteur de readiness utilisait le cache DB et masquait une panne MySQL par un 500. Readiness est désormais indépendant et renvoie un 503 minimal.
5. La police Google externe était bloquée par la CSP. Elle a été supprimée au profit de la pile système.
6. Une limite Caddy de 64 PID était trop basse pendant les reconnexions WSS et empêchait le healthcheck de démarrer. La limite ciblée est passée à 128; Caddy est revenu `healthy` à 8 PID au repos.

## Limites qui interdisent les verdicts distants

Il manque volontairement un serveur, des domaines et certificats publics, une base durable distante, un SMTP réel, une destination de backup chiffrée hors hôte, une supervision externe et, si activée, une intégration SMS réellement supportée. Les tests locaux n’autorisent donc ni `REMOTE STAGING READY` ni `PRODUCTION READY`.
