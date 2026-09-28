# Sif-Eddine Laidi — Portfolio

Portfolio statique multilingue (français / anglais / arabe) avec chatbot IA.

- **Site** : https://sifeddine00.github.io/
- **Hébergement du site** : GitHub Pages (aucun serveur, aucun build)
- **API du chatbot** : Cloudflare Workers
- **Modèle** : Hugging Face Inference Providers, `Qwen/Qwen3-4B-Instruct-2507`

---

## Architecture

```
Visiteur (GitHub Pages)
  │
  │  js/chat.js  ── POST /api/chat  (SSE, streaming)
  ▼
Cloudflare Worker  ─── workers.dev
  │                   · garde le token HF secret
  │                   · CORS strict
  │                   · rate limiting via KV
  │                   · construit le prompt depuis profile.json
  ▼
Hugging Face  ──  https://router.huggingface.co/v1/chat/completions
```

Le token Hugging Face **n'est jamais exposé au navigateur** : seul le Worker le
détient. C'est la raison d'être du Worker, le site restant du HTML statique.

---

## Arborescence

| Chemin | Rôle |
|---|---|
| `index.html`, `project1-4.html` | pages du site, méta `ai-api` incluse |
| `css/chat.css` | widget de chat (FAB, panneau, RTL, sombre, mobile) |
| `js/chat.js` | widget, streaming SSE, historique, repli contact |
| `js/i18n.js` | 24 clés `chat.*` ajoutées en fr / en / ar |
| `ai-api/worker.js` | API Cloudflare : `/api/chat`, `/api/health` |
| `ai-api/profile.js` | import et décodage du profil |
| `ai-api/data/profile.json` | **source de vérité** du contenu du chatbot |
| `ai-api/wrangler.toml` | configuration du Worker |
| `tools/generate-content.mjs` | génération de texte en ligne de commande |
| `.opencode/plans/` | notes de travail, sans impact sur le site |

---

## Configuration côté Worker

### Secrets (via Wrangler, jamais dans un fichier versionné)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `HF_TOKEN` | oui | token HF avec la permission *Make calls to Inference Providers* |
| `ALLOWED_ORIGINS` | non | origines CORS, séparées par des virgules. Défaut : GitHub Pages + localhost |
| `CHAT_MODEL` | non | modèle HF. Défaut : `Qwen/Qwen3-4B-Instruct-2507` |
| `CHAT_MAX_TOKENS` | non | défaut : 450 |
| `CHAT_RATE_IP` | non | requêtes par IP et par fenêtre. Défaut : 10 |
| `CHAT_RATE_GLOBAL` | non | requêtes par jour, tous visiteurs confondus. Défaut : 40 |
| `CHAT_RATE_WINDOW_SEC` | non | durée de la fenêtre IP, en secondes. Défaut : 300 |
| `RATE_LIMIT_DISABLED` | non | `"true"` coupe le comptage. **Dev local uniquement** |

Les trois `CHAT_RATE_*` sont des valeurs de configuration, pas des credentials :
les poser en `var` suffit et elles restent lisibles dans `wrangler.toml`. Leur
défaut est également codé en dur dans `worker.js`, donc une variable absente ne
casse rien.

```powershell
wrangler.cmd var put CHAT_RATE_IP 15
wrangler.cmd var put CHAT_RATE_GLOBAL 80
```

### Points d'attention techniques

- **`compatibility_date = "2026-05-03"`** : date volontairement figée, pas celle du
  jour. Elle évite que la production diverge du runtime local. C'est la date
  maximale supportée par le workerd embarqué dans `wrangler 4.86.0`.
- **`[[rules]] type = "Data"`** est obligatoire pour `profile.json`. Avec
  `type = "Text"`, Cloudflare exporte le fichier en *string* : `profile.summary`
  vaut `undefined` et **toute** requête de chat répond 500. Le type `JSON`
  n'existe pas dans wrangler 4.86.0 (types acceptés : `ESModule`, `CommonJS`,
  `CompiledWasm`, `Text`, `Data`).
- **Plafond KV** : le plan gratuit Cloudflare autorise **1 000 écritures/jour**.
  Chaque requête acceptée en consomme 2 (compteur global + compteur IP), et le
  remboursement d'un échec amont en rajoute 2. `CHAT_RATE_GLOBAL = 40` par défaut
  reste largement sous la limite, et son plafond théorique est 500. Ne pas
  l'augmenter sans repenser le compteur.
- **Fenêtre IP alignée sur l'époque** : le seau est
  `floor(now / windowSec) * windowSec`, donc toutes les IP basculent à la même
  frontière. Un visiteur ne peut pas faire glisser indéfiniment sa fenêtre.
- **Le KV local de `wrangler dev` survit aux redémarrages**, en plus de
  Cloudflare répliquer les données en écriture. Un compteur peut donc être
  incrémenté deux fois pour une même requête en dev local — d'où
  `RATE_LIMIT_DISABLED="true"` dans `.dev.vars`. En production, écrire la valeur
  directement dans le KV distant n'est pas possible de façon atomique ; le
  risque de dépassement est faible (deux requêtes concurrentes) et le plafond de
1 000 écritures/jour absorbe l'écart.

---

## Endpoint

### `GET /api/health`

```json
{
  "ok": true,
  "model": "Qwen/Qwen3-4B-Instruct-2507",
  "token_configured": true,
  "rate_limit_disabled": false,
  "ip_remaining": 8,
  "ip_retry_after_sec": 214,
  "remaining_today": 31
}
```

`token_configured: false` signale un déploiement incomplet. Utilisé par le widget
pour afficher l'état en ligne / indisponible.

Les quatre derniers champs permettent au widget de **désactiver la saisie avant
l'envoi** au lieu d'afficher une erreur après coup : `ip_remaining` à 0 démarre
un compte à rebours de `ip_retry_after_sec` secondes, `remaining_today` à 0
bloque jusqu'au lendemain.

### `POST /api/chat`

```json
{ "lang": "fr", "messages": [{ "role": "user", "content": "Quels sont tes projets ?" }] }
```

Réponse en `text/event-stream` :

```
data: {"type":"delta","text":"Il a realise "}
data: {"type":"delta","text":"quatre projets."}
data: {"type":"done"}
```

### Codes d'erreur

| Code | HTTP | Signification | Comportement du widget |
|---|---|---|---|
| `invalid_request` | 400 | payload malformé | message d'erreur, saisie conservée |
| `rate_limited` | 429 | quota IP ou global atteint | message transitoire, retry possible |
| `server_misconfigured` | 503 | `HF_TOKEN` absent du Worker | repli contacts |
| `quota_exhausted` | 503 | crédits HF épuisés (HTTP 402) | repli contacts |
| `hf_token_rejected` | 500 | token invalide ou sans permission | repli contacts |
| `upstream_timeout` | 502 | HF ne répond pas en 45 s | repli contacts |
| `upstream_unreachable` | 502 | HF injoignable | repli contacts |
| `origin_not_allowed` | 403 | origine hors `ALLOWED_ORIGINS` | — |

Le repli affiche email, GitHub et LinkedIn. Il est **intentionnel** : le quota
gratuit est petit, et un visiteur qui n'obtient pas de réponse doit avoir un
chemin vers un contact humain.

### Les trois origines de `rate_limited`

Un 429 ne dit pas la même chose selon qui l'a renvoyé. Le champ `scope` les
distingue, et le widget affiche un message différent pour chacune — un seul
« patientez quelques minutes » pour le quota du jour était trompeur, il faut
attendre le lendemain.

| `scope` | Origine | Réponse du widget |
|---|---|---|
| `ip` | fenêtre IP épuisée | compte à rebours `mm:ss`, puis réactivation automatique |
| `global` | quota du jour atteint (tous visiteurs) | « réessayez demain », saisie bloquée |
| `upstream` | HF a renvoyé 429 | message transitoire, aucune pénalité côté quota local |

Corps d'une réponse 429 :

```json
{
  "error": "rate_limited",
  "scope": "ip",
  "remaining_today": 31,
  "message": "too_many_requests",
  "retry_after_sec": 214
}
```

`retry_after_sec` est aussi renvoyé en en-tête `Retry-After`. Il est absent
pour `scope: "global"` : aucune attente courte n'y aiderait.

### Remboursement de la place IP

Le quota IP est consommé avant l'appel HF, puis **remboursé** quand HF n'a rien
produit : timeout, injoignable, flux coupé. Sans ce remboursement, une période de
lenteur de Hugging Face vidait le quota de tous les visiteurs alors que personne
n'avait reçu de réponse.

Les codes 401, 402, 403 et 429 de HF ne sont **pas** remboursés. Ils signalent un
état que le visiteur ne peut pas résoudre, et les rembourser ouvrirait une boucle
d'écritures KV gratuite pour un tiers (chaque requête en coûte 2).

---

## Développement local

Prérequis : Node 20.17 ou plus récent. Le projet est dans un dossier synchronisé
OneDrive, donc **ne jamais créer de fichier de secret** — utiliser
`.dev.vars`, qui est gitignoré.

```powershell
# 1. tests locaux de l'API, sur le port 8787
cd ai-api
wrangler.cmd dev --port 8787

# 2. site local, dans un second terminal
python -m http.server 8000
```

Pour tester les 429 sans attendre 5 minutes, surcharger les variables en ligne
de commande — elles priment sur `.dev.vars` :

```powershell
# limite IP a 3, fenetre de 20 s, pour voir le compte a rebours du widget
wrangler.cmd dev --port 8787 --var CHAT_RATE_IP:3 --var CHAT_RATE_WINDOW_SEC:20
```

Vider le KV local pour repartir de zéro :

```powershell
Remove-Item -Recurse -Force ai-api\.wrangler\state\v3\kv
```

`http://localhost:8000` et `http://127.0.0.1:8000` sont déjà dans les origines
autorisées par défaut. Le widget est désactivé si la balise
`<meta name="ai-api">` est absente ou vide.

Pour tester avec un jeton réel, créer `ai-api/.dev.vars` :

```
HF_TOKEN="hf_..."
```

et redémarrer le serveur — `.dev.vars` n'est pas rechargé à chaud.

---

## Outil de génération de contenu

Produit des textes à insérer manuellement dans le HTML, en s'appuyant sur
`profile.json`.

```powershell
node tools/generate-content.mjs --list
node tools/generate-content.mjs bio --lang fr
node tools/generate-content.mjs summary --lang en
node tools/generate-content.mjs project --file notes-suivi.md --out projet.md
node tools/generate-content.mjs custom -p "3 titres de projets Flutter" --lang ar
```

Nécessite `HF_TOKEN` dans l'environnement de la session :

```powershell
$env:HF_TOKEN = "hf_..."
```

Variable de session : elle disparaît au redémarrage du PC, c'est normal.
L'outil lit `profile.json` avec le même schéma que le Worker, donc les deux
restent cohérents quand le profil évolue.

---

## Déploiement

Une seule fois, dans cet ordre :

```powershell
cd ai-api

# 1. créer le namespace KV
wrangler.cmd kv:namespace create CHAT
#    -> remplacer l'id dans wrangler.toml

# 2. définir le secret (colle interactivement, ne jamais dans le chat)
wrangler.cmd secret put HF_TOKEN

# 3. déployer
wrangler.cmd deploy
```

Puis, si l'URL obtenue n'est pas
`https://portfolio-chat.sifeddinelaidi.workers.dev`, la remplacer dans les 5 fichiers
HTML, dans la balise `<meta name="ai-api">`.

Après le déploiement, **le PC n'héberge plus rien** : GitHub Pages sert le site,
Cloudflare sert l'API. La session Wrangler est stockée dans
`%APPDATA%\xdg.config\.wrangler\config\default.toml` et survit au redémarrage.

---

## Le profil `ai-api/data/profile.json`

Seule source de vérité du contenu du chatbot. Le prompt système est dérivé de ce
fichier à chaque requête, et le fichier n'est jamais envoyé au navigateur.

**Localisation par champ, pas par langue** — `identity.title.fr`,
`summary.en`, `personality.traits.ar`, etc. Les sections *projets*, *parcours*,
*compétences* et *langues* n'existent qu'en français ; le prompt demande au
modèle de les traduire dans la langue de la réponse.

À tenir à jour manuellement :

- `availability.status` — la donnée qui périme le plus vite
- le bloc `_review` — notes de travail, à supprimer une fois la relecture faite

---

## Langue de réponse

Le modèle reçoit `lang` depuis `<html lang>`. Il répond dans la langue de
l'interface, **sauf** si le visiteur écrit dans une autre langue : il suit alors
celle du visiteur. Les trois langues sont `fr`, `en`, `ar`.
