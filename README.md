# NetHome Manager

Application web de gestion d'un réseau domestique/mini-entreprise.

## Lancement simple

```bash
node server.js
```

L'application est disponible sur `http://localhost:8080`.

## Stockage des données

Les données sont enregistrées dans le fichier `data/network-data.json`. Ce fichier reste dans le dossier de l'application et n'est pas écrasé par les fichiers statiques lors d'une mise à jour, tant qu'il est conservé sur le serveur.

## Exemple nginx

Utilisez nginx comme reverse proxy vers le serveur Node :

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
}
```
