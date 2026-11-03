/**
 * portfolio-chat — Cloudflare Worker
 *
 * Proxy entre le widget js/chat.js (site GitHub Pages) et les fournisseurs LLM
 * (Groq Cloud par defaut, ou Hugging Face Inference Providers).
 *
 * Pourquoi un Worker : la cle API ne doit JAMAIS etre dans le navigateur.
 * Le system prompt ne doit JAMAIS etre visible du visiteur non plus.
 *
 * Modele par defaut : Llama 3.1 8B Instant sur Groq (gratuit, ultra-rapide ~300 tok/s).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

import profile from "./profile.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

const DEFAULTS = {
  // Origines autorisees. Remplace par ton domaine de production.
  allowedOrigins: [
    "https://sifeddine00.github.io",
    "http://localhost:8000",
    "http://localhost:5500",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
  ],
  model: "openai/gpt-oss-120b",
  maxTokens: 700,
  temperature: 0.4,
  // Garde-fous d'entree
  maxMessages: 8,
  maxCharsPerMessage: 2000,
  maxHistoryChars: 12000,
  // Rate limiting
  perIpPerWindow: 30, // requetes par IP
  perIpWindowSec: 300, // 5 minutes
  globalPerDay: 200, // Limite journaliere globale (400 ecritures KV sur les 1000 gratuites)
  ipWindowTtlSec: 3600,
  globalTtlSec: 172800,
  // Timeout
  upstreamTimeoutMs: 45000,
};

function getProvider(env) {
  // Support prioritaire de Groq, avec detection automatique si une cle Groq
  // (commencant par gsk_) a ete renseignee dans HF_TOKEN ou GROQ_API_KEY.
  const groqKey =
    env.GROQ_API_KEY ||
    (env.HF_TOKEN && String(env.HF_TOKEN).startsWith("gsk_") ? env.HF_TOKEN : null);

  if (groqKey) {
    return {
      name: "Groq",
      endpoint: GROQ_ENDPOINT,
      token: groqKey,
      defaultModel: "openai/gpt-oss-120b",
    };
  }

  if (env.HF_TOKEN) {
    return {
      name: "Hugging Face",
      endpoint: HF_ENDPOINT,
      token: env.HF_TOKEN,
      defaultModel: "Qwen/Qwen3-4B-Instruct-2507",
    };
  }

  return null;
}

let cachedGroqModel = null;
let cachedGroqModelList = [];
let cacheExpiry = 0;

async function getGroqModels(token) {
  if (cachedGroqModelList.length > 0 && Date.now() < cacheExpiry) {
    return cachedGroqModelList;
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const list = (data && data.data) || [];
      cachedGroqModelList = list.map((m) => m.id).filter(Boolean);
      cacheExpiry = Date.now() + 1800000; // 30 min cache
      return cachedGroqModelList;
    }
  } catch (err) {
    console.log("Error querying Groq models:", err && err.message);
  }
  return cachedGroqModelList;
}

async function resolveGroqModel(token) {
  if (cachedGroqModel && Date.now() < cacheExpiry) {
    return cachedGroqModel;
  }

  const available = await getGroqModels(token);
  if (available.length > 0) {
    // Priorité aux modèles de chat textuels actifs sur le palier gratuit
    const preferred = [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "llama-3.3-70b-versatile",
      "llama3-70b-8192",
      "llama3-8b-8192",
      "mixtral-8x7b-32768",
    ];

    for (const p of preferred) {
      if (available.includes(p)) {
        cachedGroqModel = p;
        return p;
      }
    }

    const fallback = available.find(
      (id) => !id.includes("whisper") && !id.includes("guard")
    );
    if (fallback) {
      cachedGroqModel = fallback;
      return fallback;
    }
  }

  return "openai/gpt-oss-120b";
}

const SUPPORTED_LANGS = ["fr", "en", "ar"];

const LANG_NAMES = {
  fr: "French (français)",
  en: "English (anglais)",
  ar: "Arabic (العربية)",
};

// ---------------------------------------------------------------------------
// System prompt — construit a partir de profile.json, jamais expose au client
// ---------------------------------------------------------------------------

function buildSystemPrompt(profile, lang) {
  const s = profile.summary[lang] || profile.summary.fr;
  const traits = profile.personality.traits[lang] || profile.personality.traits.fr;
  const statusText = {
    actively_looking:
      "Il recherche activement un poste de developpeur full stack.",
    open_to_offers:
      "Il est ouvert aux opportunites, sans recherche active en cours.",
    not_looking:
      "Il ne recherche pas d'emploi actuellement, mais reste ouvert a l'echange.",
  }[profile.availability.status] || "";

  const skills = profile.skills
    .map((k) => `- ${k.category} : ${k.items.join(", ")}`)
    .join("\n");

  const langs = profile.languages
    .map((l) => `- ${l.name} : ${l.level}`)
    .join("\n");

  const timeline = profile.timeline
    .map((t) => `- ${t.date} — ${t.title} (${t.place}). ${t.detail}`)
    .join("\n");

  const projects = profile.projects
    .map(
      (p) =>
        `### ${p.title}\n- Type : ${p.badge}\n- Periode : ${p.period}${p.place ? " — " + p.place : ""}\n- Description : ${p.description}\n- Technologies : ${p.tech.join(", ")}\n- Points cles : ${p.highlights.join(" ; ")}\n- Etude de cas : ${p.case_study_url}`
    )
    .join("\n\n");

  return `Tu es l'assistant du portfolio de ${profile.identity.full_name}, developpeur full stack base a ${profile.identity.location.city}, ${profile.identity.location.country}.

# IDENTITE
Nom : ${profile.identity.full_name}
Titre : ${profile.identity.title[lang] || profile.identity.title.fr}
Localisation : ${profile.identity.location.city}, ${profile.identity.location.country}
Email : ${profile.contact.email}
Telephone : ${profile.contact.phone}
GitHub : ${profile.contact.github}
LinkedIn : ${profile.contact.linkedin}
CV : telechargeable depuis le site, section Contact.

# RESUME
${s}

# COMPETENCES
${skills}

# LANGUES PARLEES
${langs}

# PARCOURS
${timeline}

# PROJETS
${projects}

# PERSONALITE
${traits.join(", ")}.

# DISPONIBILITE
${statusText}
${profile.availability.looking_for[lang] || profile.availability.looking_for.fr}
${profile.availability.location_flexibility[lang] || profile.availability.location_flexibility.fr}

# REGLES IMPERATIVES
1. Tu reponds UNIQUEMENT a partir des informations de ce prompt. Tu n'inventes jamais un projet, une competence, une date, un employeur, un salaire ou un resultat qui n'y figure pas.
2. Si l'information demandee est absente, tu reponds honnetement que tu n'as pas cette information et tu proposes un contact direct.
3. Tu parles de ${profile.identity.first_name || "Sif-Eddine"} a la premiere personne du pluriel ("je", "mes", "j'ai") quand tu parles de son experience, sauf indication contraire de la question.
4. ${profile.availability.instruction}
5. Si la question sort du perimetre du portfolio (politique, sport non lie, cuisine, assistance a une tache technique non documentee), tu refuses brievement en FR/EN/AR et tu recentres sur le portfolio.
6. Tu n'as aucune donnee sur d'autres personnes que ${profile.identity.full_name}. Si on te demande des informations sur quelqu'un d'autre, tu refuses.
7. Tu ne pretends jamais etre humain et tu ne pretends pas etre ${profile.identity.full_name} lui-meme.

# LANGUE
Tu reponds en ${LANG_NAMES[lang] || "French"}.
- Langue de l'interface du site = langue attendue par defaut.
- Si le visiteur t'ecrit dans une autre langue, tu reponds dans SA langue.
- Pour l'arabe, utilise l'arabe standard, texte de droite a gauche si possible.
- Les sections PARCOURS, PROJETS, COMPETENCES et LANGUES PARLEES sont fournies en francais uniquement : traduis-les dans la langue de reponse sans jamais mentionner que tu traduis.
- Sois naturel et fluide dans chaque langue. Ne melange pas les langues dans une meme phrase.

# STYLE
- Ton professionnel, direct et chaleureux. Pas de formules creuses type "tres honore de vous repondre".
- Maximum 6 phrases par reponse, sauf demande explicite de developpement.
- Pas de markdown, pas de titres, pas de listes a puces. Texte et paragraphes courts.
- Si tu cites une URL, ecris-la en entier.
- N-utilise jamais d'emoji.`;
}

// ---------------------------------------------------------------------------
// Rate limiting via KV
// ---------------------------------------------------------------------------

// --- Plafonds surcharges par variable d'environnement (wrangler.toml) ---
// Voir README.md. Un secret chiffre est inutile ici : ce sont des valeurs de
// configuration, pas des credentials.

function limits(env) {
  const num = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  return {
    perIp: num(env.CHAT_RATE_IP, DEFAULTS.perIpPerWindow),
    perDay: num(env.CHAT_RATE_GLOBAL, DEFAULTS.globalPerDay),
    windowSec: num(env.CHAT_RATE_WINDOW_SEC, DEFAULTS.perIpWindowSec),
  };
}

function rateLimitDisabled(env) {
  return env.RATE_LIMIT_DISABLED === "true" || env.RATE_LIMIT_DISABLED === "1";
}

function dayKey() {
  return new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
}

// La fenetre est un seau d'alignement sur epoch : toutes les IP repondent sur la
// meme frontiere, ce qui evite qu'un visiteur decale la sienne indefiniment.
function ipWindowStart(env) {
  const windowSec = limits(env).windowSec;
  return Math.floor(Date.now() / (windowSec * 1000)) * windowSec;
}

function ipWindowKey(env, ip) {
  return `ip:${ip}:${ipWindowStart(env)}`;
}

// Secondes restantes avant que le seau IP courant n'expire, au moins 1.
function ipRetryAfter(env) {
  const windowSec = limits(env).windowSec;
  const elapsed = Math.floor(Date.now() / 1000) - ipWindowStart(env);
  return Math.max(1, windowSec - elapsed);
}

async function readCounters(env, ip) {
  const [global, ipCount] = await Promise.all([
    env.CHAT.get(`global:${dayKey()}`, { type: "json" }),
    env.CHAT.get(ipWindowKey(env, ip), { type: "json" }),
  ]);
  return {
    global: (global && global.n) || 0,
    ip: (ipCount && ipCount.n) || 0,
  };
}

async function checkRateLimit(env, ip) {
  if (rateLimitDisabled(env)) {
    return { ok: true, skipped: true };
  }

  const cfg = limits(env);
  const counters = await readCounters(env, ip);

  // Le quota global est verifie en premier : quand il est atteint, dire
  // "reessaye dans 5 minutes" serait faux, c'est le lendemain qui retablit.
  if (counters.global >= cfg.perDay) {
    return { ok: false, scope: "global", remaining: 0 };
  }
  if (counters.ip >= cfg.perIp) {
    return {
      ok: false,
      scope: "ip",
      retryAfterSec: ipRetryAfter(env),
      remaining: cfg.perDay - counters.global,
    };
  }

  await Promise.all([
    env.CHAT.put(
      `global:${dayKey()}`,
      JSON.stringify({ n: counters.global + 1 }),
      { expirationTtl: DEFAULTS.globalTtlSec }
    ),
    env.CHAT.put(
      ipWindowKey(env, ip),
      JSON.stringify({ n: counters.ip + 1 }),
      { expirationTtl: cfg.windowSec + DEFAULTS.ipWindowTtlSec }
    ),
  ]);

  return { ok: true, remaining: cfg.perDay - counters.global - 1 };
}

// Un timeout ou un 5xx amont n'a consomme aucun token chez Hugging Face, donc la
// place ip n'aurait pas du etre comptee. On la rend, sinon un service HF lent
// vide le quota de tous les visiteurs sans qu'aucun n'ait obtenu de reponse.
async function refundIpQuota(env, ip) {
  if (rateLimitDisabled(env)) return;

  const key = ipWindowKey(env, ip);
  const counter = await env.CHAT.get(key, { type: "json" });
  const n = (counter && counter.n) || 0;
  if (n <= 0) return;

  await env.CHAT.put(key, JSON.stringify({ n: n - 1 }), {
    expirationTtl: limits(env).windowSec + DEFAULTS.ipWindowTtlSec,
  });
}

// ---------------------------------------------------------------------------
// Validation d'entree
// ---------------------------------------------------------------------------

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return { error: "messages must be an array" };
  if (raw.length === 0) return { error: "messages is empty" };
  if (raw.length > DEFAULTS.maxMessages) {
    return { error: `too many messages (max ${DEFAULTS.maxMessages})` };
  }

  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return { error: "invalid message" };
    const role = m.role;
    if (role !== "user" && role !== "assistant") {
      return { error: "invalid role" };
    }
    if (typeof m.content !== "string") return { error: "invalid content" };

    let content = m.content.trim();
    if (!content) return { error: "empty content" };
    if (content.length > DEFAULTS.maxCharsPerMessage) {
      content = content.slice(0, DEFAULTS.maxCharsPerMessage);
    }
    out.push({ role, content });
  }

  // Conserve au plus les N derniers echanges, et borne le volume total.
  const trimmed = out.slice(-DEFAULTS.maxMessages);
  let total = 0;
  const bounded = [];
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const len = trimmed[i].content.length;
    if (total + len > DEFAULTS.maxHistoryChars) break;
    total += len;
    bounded.unshift(trimmed[i]);
  }
  if (bounded.length === 0) return { error: "history too long" };

  // Doit finir par un message utilisateur.
  while (bounded.length && bounded[bounded.length - 1].role !== "user") {
    bounded.pop();
  }
  if (bounded.length === 0) return { error: "no user message" };

  return { messages: bounded };
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function corsHeaders(origin) {
  const h = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

// env est indispensable ici : sans lui, ALLOWED_ORIGINS (secret) est ignore et
// l'origine de production retombe sur la liste codee en dur. Une reponse d'erreur
// JSON sans Access-Control-Allow-Origin est opaque pour le navigateur, qui leve
// alors une erreur reseau au lieu de laisser le widget lire le code 429.
function json(request, env, body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(isAllowedOrigin(request, env)),
      ...(extraHeaders || {}),
    },
  });
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null; // appels serveur a serveur / curl
  const list = parseOrigins(env.ALLOWED_ORIGINS) || DEFAULTS.allowedOrigins;
  if (list.includes("*")) return "*";
  return list.includes(origin) ? origin : false;
}

function parseOrigins(raw) {
  if (!raw) return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

function sseHeaders(origin) {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
    ...corsHeaders(origin),
  };
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleChat(request, env, ctx) {
  const startTime = Date.now();
  const country = request.headers.get("cf-ipcountry") || "XX";
  const origin = isAllowedOrigin(request, env);

  if (origin === false) {
    return json(request, env, { error: "origin_not_allowed" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, env, { error: "invalid_json" }, 400);
  }

  const lang = SUPPORTED_LANGS.includes(payload.lang)
    ? payload.lang
    : "fr";

  const clean = sanitizeMessages(payload.messages);
  if (clean.error) {
    return json(request, env, { error: "invalid_request", detail: clean.error }, 400);
  }

  const userMsgObj = clean.messages.filter((m) => m.role === "user").pop();
  const userQuestion = userMsgObj ? userMsgObj.content : "";
  const sessionId = (payload && payload.sessionId) || ("sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6));

  const provider = getProvider(env);
  if (!provider) {
    // Secret non configure : ce n'est pas un quota epuise mais une erreur de
    // deploiement. Le widget bascule sur son repli de configuration.
    return json(
      request,
      env,
      { error: "server_misconfigured", detail: "API key missing (GROQ_API_KEY or HF_TOKEN)" },
      503
    );
  }

  const ip = getClientIp(request);
  const rate = await checkRateLimit(env, ip);
  if (!rate.ok) {
    const body = {
      error: "rate_limited",
      scope: rate.scope,
      remaining_today: rate.remaining,
      message:
        rate.scope === "global"
          ? "daily_limit_reached"
          : "too_many_requests",
    };
    // Le widget affiche un compte a rebours a partir de cette valeur, et
    // "Retry-After" sert aux outils et au cache HTTP.
    const extra = {};
    if (rate.retryAfterSec) {
      body.retry_after_sec = rate.retryAfterSec;
      extra["Retry-After"] = String(rate.retryAfterSec);
    }
    return json(request, env, body, 429, extra);
  }

  const profileData = profile;
  if (!profileData) {
    return json(request, env, { error: "server_misconfigured" }, 500);
  }

  let candidateModels;
  if (provider.name === "Groq") {
    const dynamicallyResolved = await resolveGroqModel(provider.token);
    const list = [
      env.CHAT_MODEL,
      dynamicallyResolved,
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "llama-3.3-70b-versatile",
      "llama3-70b-8192",
      "llama3-8b-8192",
    ].filter(Boolean);
    candidateModels = [...new Set(list)];
  } else {
    candidateModels = [env.CHAT_MODEL || provider.defaultModel];
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULTS.upstreamTimeoutMs
  );

  let upstream;
  let upstreamDetail = "";
  let usedModel = candidateModels[0] || "auto";

  for (const candidateModel of candidateModels) {
    usedModel = candidateModel;
    const body = {
      model: candidateModel,
      messages: [
        { role: "system", content: buildSystemPrompt(profileData, lang) },
        ...clean.messages,
      ],
      max_tokens: env.CHAT_MAX_TOKENS
        ? Number(env.CHAT_MAX_TOKENS)
        : DEFAULTS.maxTokens,
      temperature: DEFAULTS.temperature,
      stream: true,
    };

    try {
      upstream = await fetch(
        provider.endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );
    } catch (err) {
      clearTimeout(timeout);
      const aborted = err && err.name === "AbortError";
      await refundIpQuota(env, ip);
      return json(
        request,
        env,
        { error: aborted ? "upstream_timeout" : "upstream_unreachable" },
        502
      );
    }

    if (!upstream.ok) {
      upstreamDetail = await upstream
        .clone()
        .text()
        .catch(() => "");

      const isModelNotFound =
        upstream.status === 404 ||
        (upstream.status === 400 && upstreamDetail.includes("model_not_found"));

      if (isModelNotFound) {
        console.log(`${provider.name} model not found on ${candidateModel}, trying fallback model...`);
        continue;
      }
    }

    break;
  }

  // Journalise la vraie cause en amont, cote serveur uniquement : la reponse
  // envoyee au navigateur reste generique.
  if (!upstream.ok) {
    if (!upstreamDetail) {
      upstreamDetail = await upstream
        .clone()
        .text()
        .catch(() => "");
    }
    console.log(`${provider.name} ${upstream.status} ${upstreamDetail.slice(0, 300)}`);
  }

  // 402 = credits epuises, 401/403 = token invalide, 429 = LLM amont sature.
  if (upstream.status === 402) {
    clearTimeout(timeout);
    return json(request, env, { error: "quota_exhausted" }, 503);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    clearTimeout(timeout);
    return json(request, env, { error: "token_rejected", detail: upstreamDetail.slice(0, 200) }, 500);
  }
  if (upstream.status === 429) {
    clearTimeout(timeout);
    return json(request, env, { error: "rate_limited", scope: "upstream" }, 429);
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    return json(
      request,
      env,
      {
        error: "upstream_error",
        status: upstream.status,
        detail: upstreamDetail.slice(0, 300) || undefined,
      },
      502
    );
  }

  // --- Relai SSE ---
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(streamController) {
      const send = (obj) => {
        try {
          streamController.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        } catch {
          /* flux ferme */
        }
      };

      // Une trame SSE peut etre coupee entre deux lectures du flux amont : le
      // reste incomplet est conserve dans buffer et repris au tour suivant.
      // Sans ce report, la reponse etait tronquee a quelques caracteres.
      let buffer = "";
      let upstreamDone = false;
      let fullReply = "";

      const handleLine = (line) => {
        if (!line.startsWith("data:")) return false;
        const payloadStr = line.slice(5).trim();
        if (!payloadStr) return false;
        if (payloadStr === "[DONE]") {
          upstreamDone = true;
          return true;
        }
        try {
          const parsed = JSON.parse(payloadStr);

          if (parsed.error) {
            const code = parsed.error.code || parsed.error.type || "";
            if (String(code).includes("credit") || code === "billing") {
              send({ type: "error", error: "quota_exhausted" });
            } else {
              send({ type: "error", error: "upstream_error" });
            }
            return false;
          }

          const delta =
            parsed.choices &&
            parsed.choices[0] &&
            parsed.choices[0].delta &&
            parsed.choices[0].delta.content;

          if (typeof delta === "string" && delta.length) {
            fullReply += delta;
            send({ type: "delta", text: delta });
          }
        } catch {
          /* ligne JSON incomplete : reassemblee au tour suivant */
        }
        return false;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) handleLine(buffer.trim());
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          let nl;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (handleLine(line)) break;
          }

          if (upstreamDone) break;
        }

        // Sauvegarde de l'échange dans Cloudflare D1
        const durationMs = Date.now() - startTime;
        const savePromise = saveChatLog(env, {
          sessionId,
          lang,
          country,
          userQuestion,
          aiResponse: fullReply,
          modelUsed: usedModel,
          durationMs,
        });
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(savePromise);
        } else {
          savePromise.catch(() => {});
        }

        send({ type: "done" });
      } catch (err) {
        // Flux coupe avant la fin : rien n'a ete genere, la place est rendue.
        refundIpQuota(env, ip).catch(() => {});
        send({
          type: "error",
          error: err && err.name === "AbortError" ? "upstream_timeout" : "stream_error",
        });
      } finally {
        clearTimeout(timeout);
        try {
          reader.cancel();
        } catch {
          /* ignore */
        }
        try {
          streamController.close();
        } catch {
          /* ignore */
        }
      }
    },
    cancel() {
      clearTimeout(timeout);
      try {
        reader.cancel();
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders(origin) });
}

async function handleHealth(request, env) {
  const origin = isAllowedOrigin(request, env);
  if (origin === false) {
    return json(request, env, { error: "origin_not_allowed" }, 403);
  }

  const cfg = limits(env);
  const counters = await readCounters(env, getClientIp(request));
  const provider = getProvider(env);

  let activeModel = env.CHAT_MODEL;
  if (!activeModel && provider) {
    activeModel =
      provider.name === "Groq"
        ? await resolveGroqModel(provider.token)
        : provider.defaultModel;
  }

  return json(request, env, {
    ok: true,
    provider: provider ? provider.name : "none",
    model: activeModel || DEFAULTS.model,
    token_configured: Boolean(provider),
    // Le widget sert ces deux champs pour desactiver la saisie avant meme
    // d'envoyer, plutot que d'afficher une erreur apres coup.
    rate_limit_disabled: rateLimitDisabled(env),
    ip_remaining: Math.max(0, cfg.perIp - counters.ip),
    ip_retry_after_sec: rateLimitDisabled(env) ? 0 : ipRetryAfter(env),
    remaining_today: Math.max(0, cfg.perDay - counters.global),
  });
}

async function handleModels(request, env) {
  const origin = isAllowedOrigin(request, env);
  if (origin === false) {
    return json(request, env, { error: "origin_not_allowed" }, 403);
  }

  const provider = getProvider(env);
  if (!provider) {
    return json(request, env, {
      ok: false,
      error: "server_misconfigured",
      message: "Clé API non configurée.",
    }, 503);
  }

  if (provider.name !== "Groq") {
    return json(request, env, {
      ok: true,
      provider: provider.name,
      model: provider.defaultModel,
    }, 200);
  }

  const models = await getGroqModels(provider.token);
  const activeModel = await resolveGroqModel(provider.token);

  return json(request, env, {
    ok: true,
    provider: "Groq",
    selected_model: activeModel,
    total_available: models.length,
    available_models: models,
  }, 200);
}

async function handleTest(request, env) {
  const origin = isAllowedOrigin(request, env);
  if (origin === false) {
    return json(request, env, { error: "origin_not_allowed" }, 403);
  }

  const provider = getProvider(env);
  if (!provider) {
    return json(request, env, {
      ok: false,
      error: "server_misconfigured",
      message: "Clé API non configurée. Utilisez 'wrangler secret put GROQ_API_KEY'.",
    }, 503);
  }

  let model = env.CHAT_MODEL;
  if (!model && provider) {
    model =
      provider.name === "Groq"
        ? await resolveGroqModel(provider.token)
        : provider.defaultModel;
  }

  try {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Bonjour, réponds 'OK' en 1 mot." }],
        max_tokens: 10,
        temperature: 0.3,
        stream: false,
      }),
    });

    const status = res.status;
    const raw = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    if (!res.ok) {
      return json(request, env, {
        ok: false,
        status,
        provider: provider.name,
        model_tested: model,
        error_from_provider: parsed,
      }, 502);
    }

    const reply =
      parsed &&
      parsed.choices &&
      parsed.choices[0] &&
      parsed.choices[0].message &&
      parsed.choices[0].message.content;

    return json(request, env, {
      ok: true,
      status: 200,
      provider: provider.name,
      model: model,
      reply: (reply || "").trim(),
      message: "Test direct réussi ! L'API Groq fonctionne et génère du texte.",
    }, 200);
  } catch (err) {
    return json(request, env, {
      ok: false,
      error: "fetch_failed",
      detail: err && err.message,
    }, 502);
  }
}

// ---------------------------------------------------------------------------
// Base de données D1 (Persistance des conversations)
// ---------------------------------------------------------------------------

async function saveChatLog(env, data) {
  const { sessionId, lang, country, userQuestion, aiResponse, modelUsed, durationMs } = data;
  if (!userQuestion || !aiResponse) return;

  // 1. Insertion dans Cloudflare D1 SQL
  if (env.DB) {
    try {
      const stmt = env.DB.prepare(
        `INSERT INTO chat_logs (session_id, lang, country, user_question, ai_response, model_used, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      await stmt.bind(
        sessionId || "anon",
        lang || "fr",
        country || "XX",
        userQuestion,
        aiResponse,
        modelUsed || "auto",
        durationMs || 0
      ).run();
      return;
    } catch (err) {
      console.log("D1 insert error:", err && err.message);
    }
  }

  // 2. Repli KV si D1 n'est pas lié ou en cas d'erreur
  if (env.CHAT) {
    try {
      const logItem = {
        id: Date.now(),
        sessionId: sessionId || "anon",
        createdAt: new Date().toISOString(),
        lang: lang || "fr",
        country: country || "XX",
        userQuestion,
        aiResponse,
        modelUsed: modelUsed || "auto",
        durationMs: durationMs || 0,
      };
      const key = `log:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      await env.CHAT.put(key, JSON.stringify(logItem), { expirationTtl: 86400 * 30 });
    } catch (kvErr) {
      console.log("KV fallback error:", kvErr && kvErr.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Administration & Dashboard Privé (/admin)
// ---------------------------------------------------------------------------

function getAdminKey(env) {
  return env.ADMIN_KEY || "sif_admin_2026";
}

function checkAdminAuth(request, env) {
  const url = new URL(request.url);
  const keyParam = url.searchParams.get("key");
  const authHeader = request.headers.get("Authorization");
  const expectedKey = getAdminKey(env);

  if (keyParam && keyParam === expectedKey) return true;
  if (authHeader && authHeader.replace(/^Bearer\s+/i, "") === expectedKey) return true;
  return false;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderLoginHtml(error = false) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accès Sécurisé · SifEddine IA</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #070a13; color: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 2.5rem 2rem; max-width: 420px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(34,211,238,0.15); text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.9rem; background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.4); border-radius: 20px; color: #22d3ee; font-size: 0.8rem; font-weight: 600; margin-bottom: 1.25rem; }
    .badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 8px #22d3ee; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: #fff; }
    p { color: #94a3b8; font-size: 0.885rem; line-height: 1.5; margin-bottom: 1.75rem; }
    .error-msg { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; padding: 0.6rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem; }
    input { width: 100%; padding: 0.85rem 1rem; background: #020617; border: 1.5px solid #334155; border-radius: 12px; color: #fff; font-size: 0.95rem; margin-bottom: 1.25rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    input:focus { border-color: #22d3ee; box-shadow: 0 0 0 3px rgba(34,211,238,0.25); }
    button { width: 100%; padding: 0.85rem 1rem; background: linear-gradient(135deg, #22d3ee, #0284c7); border: none; border-radius: 12px; color: #04121a; font-weight: 700; font-size: 1rem; cursor: pointer; transition: transform 0.2s, opacity 0.2s; box-shadow: 0 4px 14px rgba(34,211,238,0.35); }
    button:hover { opacity: 0.95; transform: translateY(-1px); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="badge-dot"></span> Espace Privé SifEddine</div>
    <h1>Administration IA</h1>
    <p>Consultez en temps réel les questions posées par les recruteurs et visiteurs de votre portfolio.</p>
    ${error ? `<div class="error-msg">Clé secrète invalide. Veuillez réessayer.</div>` : ""}
    <form method="GET" action="/admin">
      <input type="password" name="key" placeholder="Entrez votre mot de passe secret..." required autofocus>
      <button type="submit">Déverrouiller le Dashboard</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboardHtml(logs, totalCount, todayCount, key) {
  const langCounts = { fr: 0, en: 0, ar: 0, other: 0 };
  const countryCounts = {};

  logs.forEach((item) => {
    const l = (item.lang || "fr").toLowerCase();
    if (langCounts[l] !== undefined) langCounts[l]++;
    else langCounts.other++;

    const c = (item.country || "XX").toUpperCase();
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  });

  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `${c} (${n})`)
    .join(", ") || "Aucun";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard IA · Sif-Eddine Laidi</title>
  <style>
    :root {
      --bg: #070a13;
      --surface: #0f172a;
      --surface-2: #1e293b;
      --border: #334155;
      --accent: #22d3ee;
      --accent-strong: #0284c7;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem; }
    .container { max-width: 1080px; margin: 0 auto; }
    
    .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-logo { font-size: 1.2rem; font-weight: 800; color: var(--accent); background: rgba(34,211,238,0.1); padding: 0.4rem 0.8rem; border-radius: 10px; border: 1px solid rgba(34,211,238,0.3); }
    .brand-title { font-size: 1.25rem; font-weight: 700; color: #fff; }
    .brand-subtitle { font-size: 0.8rem; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .btn { padding: 0.5rem 1rem; border-radius: 10px; font-size: 0.85rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s; border: none; }
    .btn--primary { background: linear-gradient(135deg, var(--accent), var(--accent-strong)); color: #04121a; }
    .btn--primary:hover { opacity: 0.92; transform: translateY(-1px); }
    .btn--secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
    .btn--secondary:hover { border-color: var(--accent); color: var(--accent); }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .kpi-card__title { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 0.5rem; }
    .kpi-card__value { font-size: 1.85rem; font-weight: 800; color: #fff; }
    .kpi-card__value--accent { color: var(--accent); }
    .kpi-card__sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem; }

    .filter-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; background: var(--surface); padding: 0.85rem 1.25rem; border-radius: 14px; border: 1px solid var(--border); }
    .search-input { flex: 1; min-width: 240px; padding: 0.6rem 1rem; background: #020617; border: 1px solid var(--border); border-radius: 10px; color: #fff; font-size: 0.875rem; outline: none; }
    .search-input:focus { border-color: var(--accent); }
    .filter-pills { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .pill { padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; background: var(--surface-2); color: var(--text-muted); border: 1px solid transparent; cursor: pointer; transition: all 0.2s; }
    .pill.is-active, .pill:hover { background: rgba(34,211,238,0.15); color: var(--accent); border-color: rgba(34,211,238,0.4); }

    .feed-list { display: flex; flex-direction: column; gap: 1.25rem; }
    .chat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 1.35rem; transition: transform 0.2s, border-color 0.2s; }
    .chat-card:hover { border-color: rgba(34,211,238,0.4); transform: translateY(-2px); }
    .chat-card__header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.8rem; color: var(--text-muted); }
    .tags { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .tag { padding: 0.2rem 0.55rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
    .tag--lang { background: rgba(56,189,248,0.15); color: #38bdf8; }
    .tag--country { background: rgba(168,85,247,0.15); color: #c084fc; }
    .tag--model { background: rgba(34,197,94,0.15); color: #4ade80; }
    .tag--time { background: rgba(255,255,255,0.06); color: var(--text-muted); }

    .msg-group { display: flex; flex-direction: column; gap: 0.75rem; }
    .msg-bubble { padding: 0.85rem 1.1rem; border-radius: 12px; font-size: 0.9rem; line-height: 1.6; word-break: break-word; white-space: pre-wrap; }
    .msg-bubble--user { background: rgba(34,211,238,0.1); border-left: 3px solid var(--accent); color: #f1f5f9; }
    .msg-bubble--user::before { content: "👤 Question Visiteur : "; font-weight: 700; color: var(--accent); display: block; margin-bottom: 0.25rem; font-size: 0.8rem; }
    .msg-bubble--ai { background: rgba(15,23,42,0.8); border: 1px solid var(--border); color: #e2e8f0; }
    .msg-bubble--ai::before { content: "🤖 Réponse IA : "; font-weight: 700; color: #38bdf8; display: block; margin-bottom: 0.25rem; font-size: 0.8rem; }

    .empty-state { text-align: center; padding: 4rem 1rem; color: var(--text-muted); background: var(--surface); border: 1px dashed var(--border); border-radius: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="brand">
        <div class="brand-logo">&lt;Sif /&gt;</div>
        <div>
          <h1 class="brand-title">Dashboard Conversations IA</h1>
          <p class="brand-subtitle">Base de données Cloudflare D1 · Enregistrement en direct</p>
        </div>
      </div>
      <div class="header-actions">
        <a href="/api/admin/export?key=${encodeURIComponent(key)}&format=csv" class="btn btn--secondary" download>📥 Exporter CSV (Excel)</a>
        <a href="/api/admin/export?key=${encodeURIComponent(key)}&format=json" class="btn btn--secondary" target="_blank">📄 Exporter JSON</a>
        <a href="/admin?key=${encodeURIComponent(key)}" class="btn btn--primary">🔄 Actualiser</a>
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card__title">Total Questions</div>
        <div class="kpi-card__value kpi-card__value--accent">${totalCount}</div>
        <div class="kpi-card__sub">Échanges archivés en base D1</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__title">Aujourd'hui</div>
        <div class="kpi-card__value">${todayCount}</div>
        <div class="kpi-card__sub">Questions posées ce jour</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__title">Langues</div>
        <div class="kpi-card__value" style="font-size:1.4rem;">🇫🇷 ${langCounts.fr} · 🇬🇧 ${langCounts.en} · 🇸🇦 ${langCounts.ar}</div>
        <div class="kpi-card__sub">Répartition des visiteurs</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__title">Top Pays Visiteurs</div>
        <div class="kpi-card__value" style="font-size:1.25rem;">${topCountries}</div>
        <div class="kpi-card__sub">Détection Cloudflare IP</div>
      </div>
    </section>

    <div class="filter-bar">
      <input type="text" id="searchInput" class="search-input" placeholder="🔍 Rechercher dans les questions ou réponses en direct...">
      <div class="filter-pills">
        <button class="pill is-active" data-lang="all">Toutes (${logs.length})</button>
        <button class="pill" data-lang="fr">🇫🇷 FR (${langCounts.fr})</button>
        <button class="pill" data-lang="en">🇬🇧 EN (${langCounts.en})</button>
        <button class="pill" data-lang="ar">🇸🇦 AR (${langCounts.ar})</button>
      </div>
    </div>

    <div class="feed-list" id="feedList">
      ${logs.length === 0 ? `
        <div class="empty-state">
          <p style="font-size:1.1rem; margin-bottom:0.5rem; color:#fff;">Aucune conversation enregistrée pour le moment.</p>
          <p>Dès qu'un visiteur pose une question sur votre portfolio, elle apparaîtra ici instantanément !</p>
        </div>
      ` : logs.map((log) => `
        <article class="chat-card" data-lang="${escapeHtml(log.lang || 'fr')}" data-content="${escapeHtml((log.user_question || '') + ' ' + (log.ai_response || '')).toLowerCase()}">
          <div class="chat-card__header">
            <div class="tags">
              <span class="tag tag--lang">${escapeHtml((log.lang || 'fr').toUpperCase())}</span>
              <span class="tag tag--country">🌍 ${escapeHtml(log.country || 'XX')}</span>
              <span class="tag tag--model">${escapeHtml(log.model_used || 'auto')}</span>
              ${log.duration_ms ? `<span class="tag tag--time">⚡ ${log.duration_ms} ms</span>` : ''}
            </div>
            <div>📅 ${escapeHtml(log.created_at || '')}</div>
          </div>
          <div class="msg-group">
            <div class="msg-bubble msg-bubble--user">${escapeHtml(log.user_question || '')}</div>
            <div class="msg-bubble msg-bubble--ai">${escapeHtml(log.ai_response || '')}</div>
          </div>
        </article>
      `).join('')}
    </div>
  </div>

  <script>
    const searchInput = document.getElementById("searchInput");
    const pills = document.querySelectorAll(".pill");
    const cards = document.querySelectorAll(".chat-card");

    let currentLang = "all";
    let currentQuery = "";

    function filterCards() {
      cards.forEach(card => {
        const lang = card.getAttribute("data-lang");
        const content = card.getAttribute("data-content") || "";
        const matchesLang = currentLang === "all" || lang === currentLang;
        const matchesQuery = !currentQuery || content.includes(currentQuery);
        card.style.display = (matchesLang && matchesQuery) ? "" : "none";
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentQuery = e.target.value.toLowerCase().trim();
        filterCards();
      });
    }

    pills.forEach(pill => {
      pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("is-active"));
        pill.classList.add("is-active");
        currentLang = pill.getAttribute("data-lang");
        filterCards();
      });
    });
  </script>
</body>
</html>`;
}

async function handleAdminDashboard(request, env) {
  if (!checkAdminAuth(request, env)) {
    const url = new URL(request.url);
    const hasKeyParam = url.searchParams.has("key");
    return new Response(renderLoginHtml(hasKeyParam), {
      status: hasKeyParam ? 401 : 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const key = getAdminKey(env);
  let totalCount = 0;
  let todayCount = 0;
  let logs = [];

  if (env.DB) {
    try {
      const totalRes = await env.DB.prepare("SELECT COUNT(*) as count FROM chat_logs").first();
      totalCount = (totalRes && totalRes.count) || 0;

      const todayRes = await env.DB.prepare("SELECT COUNT(*) as count FROM chat_logs WHERE created_at >= date('now')").first();
      todayCount = (todayRes && todayRes.count) || 0;

      const listRes = await env.DB.prepare("SELECT * FROM chat_logs ORDER BY id DESC LIMIT 150").all();
      logs = (listRes && listRes.results) || [];
    } catch (err) {
      console.log("DB query error in admin:", err);
    }
  }

  return new Response(renderDashboardHtml(logs, totalCount, todayCount, key), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleAdminExport(request, env) {
  if (!checkAdminAuth(request, env)) {
    return json(request, env, { error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  let logs = [];
  if (env.DB) {
    try {
      const res = await env.DB.prepare("SELECT * FROM chat_logs ORDER BY id DESC").all();
      logs = (res && res.results) || [];
    } catch (err) {
      return json(request, env, { error: "db_error", detail: err && err.message }, 500);
    }
  }

  if (format === "csv") {
    const csvHeader = "ID,SessionID,Date,Langue,Pays,Question,Reponse,Modele,Duree_ms\r\n";
    const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

    const csvRows = logs.map(l => [
      l.id,
      escapeCsv(l.session_id),
      escapeCsv(l.created_at),
      escapeCsv(l.lang),
      escapeCsv(l.country),
      escapeCsv(l.user_question),
      escapeCsv(l.ai_response),
      escapeCsv(l.model_used),
      l.duration_ms || 0
    ].join(",")).join("\r\n");

    const csvContent = "\uFEFF" + csvHeader + csvRows;
    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="chat_logs_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return json(request, env, {
    total: logs.length,
    exported_at: new Date().toISOString(),
    logs,
  }, 200);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const origin = isAllowedOrigin(request, env);
      if (origin === false) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === "/admin" || url.pathname === "/admin/") {
        return await handleAdminDashboard(request, env);
      }
      if (url.pathname === "/api/admin/export") {
        return await handleAdminExport(request, env);
      }
      if (url.pathname === "/api/health") {
        return await handleHealth(request, env);
      }
      if (url.pathname === "/api/models") {
        return await handleModels(request, env);
      }
      if (url.pathname === "/api/test") {
        return await handleTest(request, env);
      }
      if (url.pathname === "/api/chat") {
        if (request.method === "GET") {
          return json(request, env, {
            status: "active",
            endpoint: "/api/chat",
            method_required: "POST",
            message: "L'endpoint /api/chat attend une requête POST en streaming JSON. Pour vérifier la santé de l'API, consultez /api/health.",
          }, 200);
        }
        if (request.method === "POST") {
          return await handleChat(request, env, ctx);
        }
      }
      return json(request, env, { error: "not_found" }, 404);
    } catch (err) {
      return json(
        request,
        env,
        { error: "internal_error", detail: String(err && err.message) },
        500
      );
    }
  },
};
