#!/usr/bin/env node
/**
 * Outil local de generation de contenu pour le portfolio.
 * Utilise le meme modele que le chat du site, mais en ligne de commande,
 * pour produire des textes a inserer manuellement dans le HTML.
 *
 * Aucun secret n'est stocke dans le depot : le token vient de la variable
 * d'environnement HF_TOKEN.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(HERE, "..", "ai-api", "data", "profile.json");

const HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen3-4B-Instruct-2507";
const LANGS = ["fr", "en", "ar"];

const LANG_NAMES = { fr: "français", en: "anglais", ar: "arabe" };

const TASKS = {
  bio: {
    desc: "Biographie courte (section hero, meta, footer)",
    max: 300,
    prompt: `Rédige une biographie de 2 phrases pour la section hero d'un portfolio de développeur.
Contraintes : pas de tiret cadratin, pas de point-virgule, phrase concrete avec au moins une technologie
et un resultat mesurable. Retourne uniquement le texte, sans guillemets.`,
  },
  summary: {
    desc: "Résumé professionnel (LinkedIn, CV, en-tête de page projet)",
    max: 500,
    prompt: `Rédige un résumé professionnel de 4 phrases pour le profil d'un développeur full stack.
Contraintes : expérience actuelle en premier, puis compétences, puis projets, puis ouverture.
Retourne uniquement le texte, sans guillemets.`,
  },
  project: {
    desc: "Description de projet à partir d'un fichier .md (usage : --file notes.md)",
    max: 600,
    prompt: `À partir des notes brutes fournies, rédige une description de projet de portfolio.
Contraintes : une phrase d'accroche sur le problème, deux phrases sur la solution technique,
une phrase sur le résultat. Ne mentionne que ce qui est présent dans les notes, n'invente aucun chiffre.
Retourne uniquement le description, sans titre ni guillemets.`,
  },
  skills: {
    desc: "Résumé des compétences par catégorie",
    max: 400,
    prompt: `Regroupe les compétences en 3 catégories (langages, frameworks, outils) avec une phrase
d'explication par catégorie. Reste factuel, n'ajoute pas de compétence absente de la liste.
Retourne uniquement le texte, sans titre.`,
  },
  readme: {
    desc: "Section README (vue d'ensemble du projet)",
    max: 500,
    prompt: `Rédige une section "À propos" de README : ce que fait le projet, la stack, comment l'installer,
comment le lancer. 4 à 6 lignes. Retourne uniquement le texte, sans titre markdown.`,
  },
  custom: {
    desc: "Prompt libre (usage : --prompt \"...\")",
    max: 600,
    prompt: null,
  },
};

// ---------------------------------------------------------------- helpers

const parseArgs = (argv) => {
  const opts = { lang: "fr", out: null, max: null, model: null, file: null, prompt: null, list: false, help: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--lang") opts.lang = argv[++i];
    else if (a === "--out" || a === "-o") opts.out = argv[++i];
    else if (a === "--max") opts.max = Number(argv[++i]);
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--file" || a === "-f") opts.file = argv[++i];
    else if (a === "--prompt" || a === "-p") opts.prompt = argv[++i];
    else if (a.startsWith("--")) {
      fail(`Option inconnue : ${a}`);
    } else positional.push(a);
  }

  opts.task = positional[0] || null;
  return opts;
};

const fail = (msg) => {
  console.error(`\n  Erreur : ${msg}\n`);
  process.exit(1);
};

const help = () => {
  console.log(`
  portfolio-content — generation de texte pour le portfolio

  Usage
    node tools/generate-content.mjs <tache> [options]

  Taches
${Object.entries(TASKS)
  .map(([k, v]) => `    ${k.padEnd(9)} ${v.desc}`)
  .join("\n")}

  Options
    --lang fr|en|ar    langue de sortie (defaut : fr)
    --out <fichier>    ecrit le resultat dans un fichier (defaut : stdout)
    --max <n>          tokens max (defaut : selon la tache)
    --model <id>       modele Hugging Face
    --file <fichier>   notes source pour la tache "project"
    --prompt <texte>   prompt libre pour la tache "custom"
    --list             liste les taches
    -h, --help         cette aide

  Exemples
    node tools/generate-content.mjs bio --lang fr
    node tools/generate-content.mjs project --file notes-suivi.md --lang fr --out projet.md
    node tools/generate-content.mjs custom -p "Ecris 3 titres de projets Flutter" --lang en

  Prerequis
    Variable d'environnement HF_TOKEN (token Hugging Face, permission Inference)
`);
};

// Le profil est localise PAR CHAMP, pas par langue : identity.title.fr,
// summary.en, personality.traits.ar, etc. Les sections projets, parcours et
// competences n'existent qu'en francais, le modele les traduira si besoin.
const localized = (node, lang) => {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    return node[lang] || node.fr || node.en || node.ar || "";
  }
  return typeof node === "string" ? node : "";
};

const buildContext = (profile, lang) => {
  const id = profile.identity || {};
  const loc = id.location || {};
  const con = profile.contact || {};
  const av = profile.availability || {};
  const traits = localized((profile.personality || {}).traits, lang);

  return [
    "Voici les informations verifiees sur ce developpeur. N'invente rien qui n'y figure pas.",
    "",
    "# Identite",
    `Nom : ${id.full_name || ""}`,
    `Titre : ${localized(id.title, lang)}`,
    `Localisation : ${[loc.city, loc.country].filter(Boolean).join(", ")}`,
    `Email : ${con.email || ""}`,
    `Telephone : ${con.phone || ""}`,
    `GitHub : ${con.github || ""}`,
    `LinkedIn : ${con.linkedin || ""}`,
    "",
    "# Resume",
    localized(profile.summary, lang),
    "",
    "# Competences (source en francais)",
    ...(profile.skills || []).map((k) => `- ${k.category} : ${(k.items || []).join(", ")}`),
    "",
    "# Langues",
    ...(profile.languages || []).map((l) => `- ${l.name} : ${l.level}`),
    "",
    "# Parcours (source en francais)",
    ...(profile.timeline || []).map(
      (t) => `- ${t.date} - ${t.title} (${t.place}). ${t.detail}`
    ),
    "",
    "# Projets (source en francais)",
    ...(profile.projects || []).map(
      (p) =>
        `- ${p.title} [${p.badge || ""}] ` +
        `(${p.period || ""}${p.place ? ", " + p.place : ""}) : ${p.description} ` +
        `Technologies : ${(p.tech || []).join(", ")}. ` +
        `Points cles : ${(p.highlights || []).join(" ; ")}. ` +
        `Etude de cas : ${p.case_study_url || ""}`
    ),
    "",
    "# Personalite",
    Array.isArray(traits) ? traits.join(", ") : traits,
    "",
    "# Disponibilite",
    `Statut : ${av.status || ""}`,
    localized(av.looking_for, lang),
    (av.open_to || []).join(", "),
    localized(av.location_flexibility, lang),
  ].join("\n");
};

async function callModel({ token, model, system, user, max }) {
  const res = await fetch(HF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: max,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hugging Face a repondu ${res.status}\n${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Reponse vide du modele");
  }
  return text.trim();
}

// ------------------------------------------------------------------ main

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || (!opts.task && !opts.list)) {
    help();
    process.exit(opts.help ? 0 : 1);
  }

  if (opts.list) {
    console.log("\n  Taches disponibles :\n");
    for (const [k, v] of Object.entries(TASKS)) {
      console.log(`    ${k.padEnd(9)} ${v.desc}`);
    }
    console.log("");
    return;
  }

  const task = TASKS[opts.task];
  if (!task) {
    fail(`tache inconnue "${opts.task}". Use --list pour voir les taches.`);
  }

  if (!LANGS.includes(opts.lang)) {
    fail(`langue inconnue "${opts.lang}". Attendu : ${LANGS.join(", ")}.`);
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    fail("variable d'environnement HF_TOKEN absente.\n  PowerShell :  $env:HF_TOKEN = \"hf_...\"");
  }

  if (opts.task === "custom" && !opts.prompt) {
    fail('la tache "custom" requiert --prompt "...".');
  }

  let extra = "";
  if (opts.file) {
    extra = await readFile(opts.file, "utf8");
  }

  const profile = JSON.parse(await readFile(PROFILE_PATH, "utf8"));
  const context = buildContext(profile, opts.lang);
  const system = [
    `Tu es un redacteur web. Tu ecris en ${LANG_NAMES[opts.lang]}.`,
    "Regles : texte seul, sans guillemets, sans tiret cadratin, sans point-virgule, phrases courtes.",
    "Les sections Marquees (source en francais) doivent etre traduites dans la langue de sortie, sans mentionner que tu traduis.",
    context,
  ].join("\n\n");

  const user = [task.prompt, extra].filter(Boolean).join("\n\n---\n\n");
  const max = opts.max || task.max;

  process.stderr.write(`  Modele : ${opts.model || DEFAULT_MODEL}\n  Tache  : ${opts.task} (${opts.lang})\n\n  Generation en cours...\n`);

  let text;
  try {
    text = await callModel({
      token,
      model: opts.model || DEFAULT_MODEL,
      system,
      user,
      max,
    });
  } catch (err) {
    fail(err.message);
  }

  text = text.replace(/^["'«]\s*/, "").replace(/\s*["'»]$/, "").trim();

  if (opts.out) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(opts.out, text + "\n", "utf8");
    process.stderr.write(`\n  Ecrit dans ${opts.out} (${text.length} caracteres)\n\n`);
  } else {
    console.log("\n" + text + "\n");
  }
};

main().catch((err) => {
  console.error(`\n  Echec inattendu : ${err.message}\n`);
  process.exit(1);
});
