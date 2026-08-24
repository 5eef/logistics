# Sauvegarde et restauration MySQL

## Sauvegarde locale staging

```powershell
.\scripts\backup-mysql.ps1
```

Ou depuis un hôte POSIX :

```bash
./scripts/backup-mysql.sh
```

Le script exécute `mysqldump`, contrôle son code de sortie, compresse en `backups/mysql/logistics_YYYY-MM-DD_HHMMSS.sql.gz` et supprime uniquement les fichiers correspondant exactement à ce motif au-delà de `BACKUP_RETENTION_DAYS`. Le mot de passe n’est jamais affiché. Le dossier de dumps est ignoré par Git.

## Preuve de restauration

```powershell
.\scripts\test-restore.ps1
```

Le dernier dump est restauré dans une base temporaire dont le nom porte un préfixe fixe et un identifiant aléatoire. Le test vérifie les tables critiques, le ledger `migrations` et les références orphelines. Le bloc `finally` supprime uniquement cette base temporaire; la base staging source n’est jamais modifiée.

## Politique production

Une exploitation réelle doit ajouter une destination chiffrée hors du serveur applicatif, des droits minimaux, une rétention validée, une alerte de fraîcheur et un exercice périodique de restauration. La copie locale Docker n’est pas une sauvegarde production hors site.
Avant migration : geler si nécessaire les écritures, produire et vérifier un dump, conserver l’artefact applicatif précédent, puis seulement exécuter `migrate --force`. Un rollback de schéma n’est autorisé qu’après examen manuel de la migration et de la compatibilité des données.
