#!/usr/bin/env node
/**
 * Faux serveur SSE pour developper et tester le widget SANS deploiement.
 *
 *   node tools/mock-api.mjs            # port 8788
 *   node tools/mock-api.mjs --port 9000
 *
 * Repond sur /api/health et /api/chat avec le meme format que le Worker
 * (text/event-stream, data: {type:"delta"}). Les reponses sont predeterminees,
 * une par langue, et volontairement coupees en petits morceaux pour imiter le
 * streaming reel.
 *
 * Pour l'utiliser, pointer temporairement la balise meta de index.html :
 *   <meta name="ai-api" content="http://127.0.0.1:8788">
 */

import { createServer } from "node:http";
import process from "node:process";

const argPort = process.argv.indexOf("--port");
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8788;

const answers = {
  fr: `Bonjour ! Oui, **Sif-Eddine** est disponible pour un poste de developpeur full stack.

Il a realise **quatre projets** : une plateforme de surveillance d'examens avec React et Spring Boot, une plateforme d'ordonnances medicales avec React et Laravel, une solution documentaire multi-agents au hackathon de Capgemini, et une plateforme d'apprentissage.

Son stack principal : **React**, **Node.js**, **Laravel**, **Spring Boot**, **PostgreSQL** et **MongoDB**. Le detail est sur le site : https://sifeddine00.github.io/

Pour une candidature, le plus simple est de l'ecrire directement a sifeddinelaidi@gmail.com.`,
  en: `Hello! Yes, **Sif-Eddine** is open to a full stack developer position.

He has built **four projects**: an exam-supervision platform with React and Spring Boot, a medical-prescription platform with React and Laravel, a multi-agents document solution at Capgemini's hackathon, and a learning platform.

His core stack: **React**, **Node.js**, **Laravel**, **Spring Boot**, **PostgreSQL** and **MongoDB**. Full details: https://sifeddine00.github.io/

For an application, the simplest route is to email sifeddinelaidi@gmail.com directly.`,
  ar: `مرحباً! نعم، **سيف الدين** مفتوح لوظيفة مطوّر ويب متكامل.

أنجز **أربعة مشاريع**: منصة surveillances الامتحانات بتقنية React و Spring Boot، منصة الوصفات الطبية بتقنية React و Laravel، حلوثققي متعدد الوكلاء في هاكاثون Capgemini، ومنصة للتعلّم.

تقنياته الأساسية: **React** و **Node.js** و **Laravel** و **Spring Boot** و **PostgreSQL** و **MongoDB**.

للتقديم على الوظيفة، أسهل طريقة هي مراسلته مباشرة على sifeddinelaidi@gmail.com.`,
};

// Coupe une reponse en morceaux de 2 a 5 mots, pour simuler le flux reel.
function chunk(text) {
  const parts = text.split(/(\s+)/);
  const out = [];
  let buffer = "";
  for (const part of parts) {
    buffer += part;
    const words = buffer.trim().split(/\s+/).length;
    if (words >= 3) {
      out.push(buffer);
      buffer = "";
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

const cors = (req) => ({
  "Access-Control-Allow-Origin": req.headers.origin || "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
});

const json = (res, req, body, status = 200) => {
  res.writeHead(status, {
    ...cors(req),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors(req));
    res.end();
    return;
  }

  if (url === "/api/health") {
    json(res, req, { ok: true, model: "mock", token_configured: true });
    return;
  }

  if (url === "/api/chat" && req.method === "POST") {
    let raw = "";
    for await (const chunkStream of req) raw += chunkStream;

    let lang = "fr";
    let message = "";
    try {
      const payload = JSON.parse(raw);
      lang = ["fr", "en", "ar"].includes(payload.lang) ? payload.lang : "fr";
      const last = [...(payload.messages || [])].reverse().find((m) => m.role === "user");
      message = last ? last.content : "";
    } catch {
      json(res, req, { error: "invalid_request" }, 400);
      return;
    }

    process.stderr.write(`  [mock] ${lang} <- ${message}\n`);

    res.writeHead(200, {
      ...cors(req),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    const send = (obj) => {
      if (!aborted) res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    // Pause initiale : le widget affiche l'indicateur d'ecriture.
    await new Promise((r) => setTimeout(r, 350));

    for (const piece of chunk(answers[lang])) {
      await new Promise((r) => setTimeout(r, 55));
      send({ type: "delta", text: piece });
    }

    send({ type: "done" });
    res.end();
    process.stderr.write("  [mock] diffuse\n");
    return;
  }

  json(res, req, { error: "not_found" }, 404);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stderr.write(`\n  mock-api en ecoute sur http://127.0.0.1:${PORT}\n`);
  process.stderr.write(`  pointez la balise meta ai-api sur cette URL\n\n`);
});
