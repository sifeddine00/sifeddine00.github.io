/**
 * portfolio-chat — Cloudflare Worker
 *
 * Proxy entre le widget js/chat.js (site GitHub Pages) et Hugging Face
 * Inference Providers (endpoint OpenAI-compatible router.huggingface.co).
 *
 * Pourquoi un Worker : le token HF ne doit JAMAIS etre dans le navigateur.
 * Le system prompt ne doit JAMAIS etre visible du visiteur non plus.
 *
 * Cout : ~0.00002 $ par tour (Qwen3-4B-Instruct-2507, 0.01$/M in, 0.03$/M out).
 * Le quota gratuit HF est de 0.10 $/mois. D'ou le plafond global ci-dessous.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

import profile from "./profile.js";

const DEFAULTS = {
  // Origines autorisees. Remplace par ton domaine de production.
  allowedOrigins: [
    "https://sifeddine00.github.io",
    "http://localhost:8000",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5500",
  ],
  model: "Qwen/Qwen3-4B-Instruct-2507",
  maxTokens: 700,
  temperature: 0.4,
  // Garde-fous d'entree
  maxMessages: 8,
  maxCharsPerMessage: 2000,
  maxHistoryChars: 12000,
  // Rate limiting
  perIpPerWindow: 10, // requetes
  perIpWindowSec: 300, // 5 minutes
  globalPerDay: 40, // ATTENTION : KV gratuit = 1000 ecritures/jour. Voir README.
  ipWindowTtlSec: 3600,
  globalTtlSec: 172800,
  // Timeout
  upstreamTimeoutMs: 45000,
};

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

function dayKey() {
  return new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
}

function ipWindowKey(ip) {
  const bucket = Math.floor(Date.now() / (DEFAULTS.perIpWindowSec * 1000));
  return `ip:${ip}:${bucket}`;
}

async function checkRateLimit(env, ip) {
  const globalKey = `global:${dayKey()}`;

  const [global, ipCount] = await Promise.all([
    env.CHAT.get(globalKey, { type: "json" }),
    env.CHAT.get(ipWindowKey(ip), { type: "json" }),
  ]);

  const globalCount = (global && global.n) || 0;
  const ipCountValue = (ipCount && ipCount.n) || 0;

  if (globalCount >= DEFAULTS.globalPerDay) {
    return { ok: false, scope: "global" };
  }
  if (ipCountValue >= DEFAULTS.perIpPerWindow) {
    return { ok: false, scope: "ip" };
  }

  await Promise.all([
    env.CHAT.put(
      globalKey,
      JSON.stringify({ n: globalCount + 1 }),
      { expirationTtl: DEFAULTS.globalTtlSec }
    ),
    env.CHAT.put(
      ipWindowKey(ip),
      JSON.stringify({ n: ipCountValue + 1 }),
      { expirationTtl: DEFAULTS.ipWindowTtlSec }
    ),
  ]);

  return { ok: true, remaining: DEFAULTS.globalPerDay - globalCount - 1 };
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

function json(request, body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(isAllowedOrigin(request, {})),
      ...(extraHeaders || {}),
    },
  });
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

async function handleChat(request, env) {
  const origin = isAllowedOrigin(request, env);

  if (origin === false) {
    return json(request, { error: "origin_not_allowed" }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "invalid_json" }, 400);
  }

  const lang = SUPPORTED_LANGS.includes(payload.lang)
    ? payload.lang
    : "fr";

  const clean = sanitizeMessages(payload.messages);
  if (clean.error) {
    return json(request, { error: "invalid_request", detail: clean.error }, 400);
  }

  if (!env.HF_TOKEN) {
    // Secret non configure : ce n'est pas un quota epuise mais une erreur de
    // deploiement. Le widget bascule quand meme sur son repli contact, car
    // "server_misconfigured" fait partie de ses codes de repli.
    return json(request, { error: "server_misconfigured", detail: "HF_TOKEN missing" }, 503);
  }

  const rate = await checkRateLimit(env, getClientIp(request));
  if (!rate.ok) {
    return json(
      request,
      {
        error: "rate_limited",
        scope: rate.scope,
        message:
          rate.scope === "global"
            ? "daily_limit_reached"
            : "too_many_requests",
      },
      429
    );
  }

  const profileData = profile;
  if (!profileData) {
    return json(request, { error: "server_misconfigured" }, 500);
  }

  const body = {
    model: env.CHAT_MODEL || DEFAULTS.model,
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

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULTS.upstreamTimeoutMs
  );

  let upstream;
  try {
    upstream = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err && err.name === "AbortError";
    return json(
      request,
      { error: aborted ? "upstream_timeout" : "upstream_unreachable" },
      502
    );
  }

  // Journalise la vraie cause en amont, cote serveur uniquement : la reponse
  // envoyee au navigateur reste generique.
  if (!upstream.ok) {
    const detail = await upstream
      .clone()
      .text()
      .catch(() => "");
    console.log(`HF ${upstream.status} ${detail.slice(0, 300)}`);
  }

  // 402 = credits epuises sur le compte HF. 403 = token sans permission Inference.
  if (upstream.status === 402) {
    clearTimeout(timeout);
    return json(request, { error: "quota_exhausted" }, 503);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    clearTimeout(timeout);
    return json(request, { error: "hf_token_rejected" }, 500);
  }
  if (upstream.status === 429) {
    clearTimeout(timeout);
    return json(request, { error: "rate_limited", scope: "upstream" }, 429);
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout);
    return json(request, { error: "upstream_error" }, 502);
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
        send({ type: "done" });
      } catch (err) {
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
    return json(request, { error: "origin_not_allowed" }, 403);
  }
  return json(request, {
    ok: true,
    model: env.CHAT_MODEL || DEFAULTS.model,
    token_configured: Boolean(env.HF_TOKEN),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const origin = isAllowedOrigin(request, env);
      if (origin === false) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === "/api/health") {
        return await handleHealth(request, env);
      }
      if (url.pathname === "/api/chat" && request.method === "POST") {
        return await handleChat(request, env);
      }
      return json(request, { error: "not_found" }, 404);
    } catch (err) {
      return json(
        request,
        { error: "internal_error", detail: String(err && err.message) },
        500
      );
    }
  },
};
