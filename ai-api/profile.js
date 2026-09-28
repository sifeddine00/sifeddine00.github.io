// Import du profil : le Worker lit ces donnees au build, pas au runtime.
// Le system prompt est ainsi derive de ce fichier uniquement, et le fichier
// lui-meme n'est jamais servi au navigateur.
//
// Import JSON natif : esbuild transforme le fichier en objet au moment du build,
// donc profile est directement l'objet attendu. Ce comportement est identique en
// `wrangler dev` et en `wrangler deploy`. Ne pas ajouter de regle
// [[rules]] type = "Data" : son resultat diverge entre les deux environnements
// (Uint8Array en local, objet en production) et le TextDecoder faisait alors
// echouer le module au chargement, erreur Cloudflare 1042 sur toutes les routes.
import profile from "./data/profile.json";

export default profile;
