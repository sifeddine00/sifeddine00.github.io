/* =========================================================================
   portfolio-chat — widget de chat IA (cote navigateur)
   -------------------------------------------------------------------------
   - Construit tout le DOM en JS (aucune dependance)
   - Textes via window.i18n.t() + re-localisation sur l'evenement "langchange"
   - Streaming SSE via fetch + ReadableStream (seule option CORS-compatible)
   - Rendu sur texte uniquement : jamais innerHTML sur la sortie du modele
   ========================================================================= */

(() => {
  "use strict";

  const API_URL = (() => {
    const meta = document.querySelector('meta[name="ai-api"]');
    const url = meta ? meta.getAttribute("content") : "";
    return url ? url.replace(/\/+$/, "") : "";
  })();

  const STORAGE_KEY = "portfolio-chat-v1";
  const MAX_STORED = 12; // 6 allers-retours
  const MAX_SEND_CHARS = 1200;
  const HEALTH_TIMEOUT = 4000;
  const STREAM_TIMEOUT = 45000;

  // Codes d'erreur Worker => cles i18n de repli
  const FALLBACK_CODES = new Set([
    "quota_exhausted",
    "upstream_unreachable",
    "upstream_timeout",
    "stream_error",
    "hf_token_rejected",
    "server_misconfigured",
  ]);

  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------

  const t = (key) =>
    window.i18n && typeof window.i18n.t === "function" ? window.i18n.t(key) : key;

  const lang = () =>
    window.i18n && typeof window.i18n.getLang === "function"
      ? window.i18n.getLang()
      : "fr";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(paths) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach((d) => {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  // ---------------------------------------------------------------------
  // Rendu du texte du modele — SANS innerHTML (protection XSS)
  // ---------------------------------------------------------------------

  const URL_RE = /\b(https?:\/\/[^\s<>"')\]]+)/g;

  function appendRich(parent, text) {
    // 1) Gras **...**
    const boldParts = String(text).split(/(\*\*[^*]+\*\*)/g);

    boldParts.forEach((part) => {
      if (!part) return;

      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        parent.appendChild(el("strong", null, part.slice(2, -2)));
        return;
      }

      // 2) Liens http(s)
      let last = 0;
      let match;
      URL_RE.lastIndex = 0;
      while ((match = URL_RE.exec(part)) !== null) {
        if (match.index > last) {
          parent.appendChild(
            document.createTextNode(part.slice(last, match.index))
          );
        }
        const href = match[1];
        const a = document.createElement("a");
        a.setAttribute("href", href);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer nofollow");
        a.textContent = href;
        parent.appendChild(a);
        last = match.index + href.length;
      }
      if (last < part.length) {
        parent.appendChild(document.createTextNode(part.slice(last)));
      }
    });
  }

  function renderMessage(node, text) {
    node.textContent = "";
    if (!text) return;
    // Titres markdown "### X" ou "X :" => simple paragraphe en gras
    appendRich(node, text);
  }

  // ---------------------------------------------------------------------
  // Persistance
  // ---------------------------------------------------------------------

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "bot") &&
            typeof m.text === "string"
        )
        .slice(-MAX_STORED);
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED)));
    } catch {
      /* quota ou mode prive : on ignore */
    }
  }

  let history = [];

  // ---------------------------------------------------------------------
  // Construction du DOM
  // ---------------------------------------------------------------------

  let fab, panel, messagesEl, typingEl, suggestionsEl, inputEl, sendBtn;
  let statusEl, titleEl, avatarInitial, badge, fallbackEl, liveRegion;
  let isOpen = false;
  let streaming = false;
  let userStopped = false;
  let abortController = null;
  let online = null; // null = inconnu, true, false

  function build() {
    // --- Bouton flottant ---
    fab = el("button", "chat-fab");
    fab.type = "button";
    fab.appendChild(
      icon([
        "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      ])
    );
    badge = el("span", "chat-fab__badge", "1");
    badge.hidden = true;
    fab.appendChild(badge);

    // --- Panneau ---
    panel = el("div", "chat-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "chat-title");

    // En-tete
    const header = el("div", "chat-header");

    const av = el("div", "chat-header__avatar");
    avatarInitial = el("span", null, "S");
    av.appendChild(avatarInitial);
    const dot = el("span", "chat-header__dot");
    av.appendChild(dot);
    header.appendChild(av);

    const text = el("div", "chat-header__text");
    titleEl = el("h2", "chat-header__title");
    titleEl.id = "chat-title";
    statusEl = el("p", "chat-header__status");
    text.appendChild(titleEl);
    text.appendChild(statusEl);
    header.appendChild(text);

    const resetBtn = el("button", "chat-header__btn");
    resetBtn.type = "button";
    resetBtn.appendChild(
      icon(["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5"])
    );
    resetBtn.addEventListener("click", reset);
    header.appendChild(resetBtn);

    const closeBtn = el("button", "chat-header__btn");
    closeBtn.type = "button";
    closeBtn.appendChild(icon(["M18 6 6 18", "M6 6l12 12"]));
    closeBtn.addEventListener("click", () => toggle(false));
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Messages
    messagesEl = el("div", "chat-messages");
    messagesEl.setAttribute("role", "log");
    messagesEl.setAttribute("aria-live", "off");
    panel.appendChild(messagesEl);

    // Indicateur d'ecriture
    typingEl = el("div", "chat-typing");
    typingEl.hidden = true;
    typingEl.appendChild(el("span"));
    typingEl.appendChild(el("span"));
    typingEl.appendChild(el("span"));
    panel.appendChild(typingEl);

    // Suggestions
    suggestionsEl = el("div", "chat-suggestions");
    panel.appendChild(suggestionsEl);

    // Mention IA
    panel.appendChild(el("p", "chat-disclaimer"));

    // Repli
    fallbackEl = el("div", "chat-fallback");
    fallbackEl.hidden = true;
    panel.appendChild(fallbackEl);

    // Formulaire
    const form = el("form", "chat-form");

    inputEl = el("textarea", "chat-input");
    inputEl.rows = 1;
    inputEl.addEventListener("input", onInput);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    form.appendChild(inputEl);

    sendBtn = el("button", "chat-send");
    sendBtn.type = "submit";
    sendBtn.appendChild(icon(["M22 2 11 13", "M22 2l-7 20-4-9-9-4z"]));
    form.appendChild(sendBtn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });

    panel.appendChild(form);

    // Region live pour les lecteurs d'ecran
    liveRegion = el("div", "chat-sr-only");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    panel.appendChild(liveRegion);

    fab.addEventListener("click", () => toggle(!isOpen));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) toggle(false);
    });

    document.addEventListener("click", (e) => {
      if (!isOpen) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      toggle(false);
    });

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    applyLabels();
  }

  // ---------------------------------------------------------------------
  // Localisation
  // ---------------------------------------------------------------------

  const SUGGESTION_KEYS = [
    "chat.suggestion_1",
    "chat.suggestion_2",
    "chat.suggestion_3",
  ];

  function applyLabels() {
    fab.setAttribute("aria-label", t("chat.open"));
    fab.setAttribute("title", t("chat.open"));
    titleEl.textContent = t("chat.title");
    inputEl.setAttribute("placeholder", t("chat.placeholder"));
    inputEl.setAttribute("aria-label", t("chat.placeholder"));
    sendBtn.setAttribute("aria-label", t("chat.send"));
    panel.querySelector(".chat-disclaimer").textContent = t("chat.disclaimer");
    updateStatus();
    renderSuggestions();
    renderFallback();
  }

  function updateStatus() {
    if (online === true) {
      statusEl.textContent = t("chat.status_online");
    } else if (online === false) {
      statusEl.textContent = t("chat.status_offline");
    } else {
      statusEl.textContent = t("chat.status_checking");
    }
    const dot = panel.querySelector(".chat-header__dot");
    if (dot) {
      dot.classList.remove("is-online", "is-offline");
      if (online === true) dot.classList.add("is-online");
      if (online === false) dot.classList.add("is-offline");
    }
  }

  function renderSuggestions() {
    suggestionsEl.textContent = "";
    if (history.length > 0) {
      suggestionsEl.hidden = true;
      return;
    }
    suggestionsEl.hidden = false;
    SUGGESTION_KEYS.forEach((key) => {
      const label = t(key);
      if (!label || label === key) return;
      const chip = el("button", "chat-chip", label);
      chip.type = "button";
      chip.addEventListener("click", () => {
        if (streaming) return;
        inputEl.value = label;
        onInput();
        submit();
      });
      suggestionsEl.appendChild(chip);
    });
  }

  function renderFallback() {
    fallbackEl.textContent = "";
    if (fallbackEl.hidden) return;

    fallbackEl.appendChild(el("p", null, t("chat.fallback_text")));

    const actions = el("div", "chat-fallback__actions");

    const mail = el("a", "chat-fallback__link chat-fallback__link--primary", t("chat.fallback_email"));
    mail.href =
      "mailto:sifeddinelaidi@gmail.com?subject=" +
      encodeURIComponent(t("chat.fallback_mail_subject"));
    actions.appendChild(mail);

    const gh = el("a", "chat-fallback__link", t("chat.fallback_github"));
    gh.href = "https://github.com/sifeddine00";
    gh.target = "_blank";
    gh.rel = "noopener noreferrer";
    actions.appendChild(gh);

    const li = el("a", "chat-fallback__link", t("chat.fallback_linkedin"));
    li.href = "https://www.linkedin.com/in/sif-eddine-laidi-aa543a332";
    li.target = "_blank";
    li.rel = "noopener noreferrer";
    actions.appendChild(li);

    fallbackEl.appendChild(actions);
  }

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  function addMessage(role, text) {
    const cls =
      role === "user"
        ? "chat-msg chat-msg--user"
        : role === "error"
        ? "chat-msg chat-msg--error"
        : "chat-msg chat-msg--bot";

    const node = el("div", cls);
    if (role === "user" || role === "error") {
      node.textContent = text;
    } else {
      renderMessage(node, text);
    }
    messagesEl.appendChild(node);
    scrollToBottom();
    return node;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function announce(text) {
    liveRegion.textContent = text.slice(0, 200);
  }

  function reset() {
    stopStream();
    history = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    messagesEl.textContent = "";
    fallbackEl.hidden = true;
    renderSuggestions();
    addMessage("bot", t("chat.greeting"));
    inputEl.focus();
  }

  // ---------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------

  async function checkHealth() {
    if (!API_URL) {
      online = false;
      updateStatus();
      return;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT);
      const res = await fetch(API_URL + "/api/health", {
        method: "GET",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      online = res.ok;
    } catch {
      online = false;
    }
    updateStatus();
  }

  // ---------------------------------------------------------------------
  // Ouverture / fermeture
  // ---------------------------------------------------------------------

  function toggle(next) {
    isOpen = next;
    panel.hidden = !isOpen;

    if (isOpen) {
      document.body.classList.add("chat-open");
      badge.hidden = true;

      if (history.length === 0) {
        addMessage("bot", t("chat.greeting"));
      } else {
        history.forEach((m) => addMessage(m.role === "user" ? "user" : "bot", m.text));
      }
      renderSuggestions();

      inputEl.focus();
      checkHealth();
      scrollToBottom();
    } else {
      document.body.classList.remove("chat-open");
      fab.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Saisie
  // ---------------------------------------------------------------------

  function onInput() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + "px";
    sendBtn.disabled = !inputEl.value.trim();
  }

  function setBusy(busy) {
    streaming = busy;
    inputEl.disabled = busy;
    sendBtn.classList.toggle("is-streaming", busy);
    if (busy) {
      // Le bouton reste cliquable : il sert alors a interrompre le flux.
      sendBtn.setAttribute("aria-label", t("chat.stop"));
      sendBtn.setAttribute("title", t("chat.stop"));
    } else {
      sendBtn.removeAttribute("aria-label");
      sendBtn.removeAttribute("title");
      onInput();
    }
  }

  function stopStream() {
    userStopped = true;
    if (abortController) {
      try {
        abortController.abort();
      } catch {
        /* ignore */
      }
      abortController = null;
    }
    setBusy(false);
  }

  // ---------------------------------------------------------------------
  // Envoi
  // ---------------------------------------------------------------------

  async function submit() {
    if (streaming) {
      stopStream();
      return;
    }

    const text = inputEl.value.trim().slice(0, MAX_SEND_CHARS);
    if (!text) return;

    // Repli actif : on oriente vers le contact au lieu d'appeler l'API
    if (!fallbackEl.hidden) {
      history.push({ role: "user", text });
      saveHistory();
      addMessage("user", text);
      inputEl.value = "";
      onInput();
      addMessage("error", t("chat.fallback_text"));
      return;
    }

    addMessage("user", text);
    history.push({ role: "user", text });
    suggestionsEl.hidden = true;
    inputEl.value = "";
    onInput();
    saveHistory();

    if (!API_URL) {
      showFallback(t("chat.error_no_api"));
      return;
    }

    setBusy(true);
    userStopped = false;
    typingEl.hidden = false;
    scrollToBottom();

    const botNode = addMessage("bot", "");
    let answer = "";
    let rafId = null;

    const paint = () => {
      rafId = null;
      renderMessage(botNode, answer);
      scrollToBottom();
    };

    abortController = new AbortController();
    const timer = setTimeout(() => {
      try {
        abortController.abort();
      } catch {
        /* ignore */
      }
    }, STREAM_TIMEOUT);

    let failure = null;

    try {
      const payload = {
        lang: lang(),
        messages: history
          .slice(-8)
          .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })),
      };

      const res = await fetch(API_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        let code = "http_" + res.status;
        try {
          const data = await res.json();
          if (data && data.error) code = data.error;
        } catch {
          /* pas de corps JSON */
        }
        failure = code;
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";

          for (const frame of frames) {
            for (const line of frame.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const raw = trimmed.slice(5).trim();
              if (!raw) continue;
              try {
                const evt = JSON.parse(raw);
                if (evt.type === "delta" && typeof evt.text === "string") {
                  answer += evt.text;
                  if (!rafId) rafId = requestAnimationFrame(paint);
                } else if (evt.type === "error") {
                  failure = evt.error || "upstream_error";
                } else if (evt.type === "done") {
                  // fin normale
                }
              } catch {
                /* frame incomplete */
              }
            }
          }
        }
      }
    } catch (err) {
      // Arret volontaire de l'utilisateur : la reponse partielle est conservee.
      if (!userStopped) {
        failure =
          err && err.name === "AbortError" ? "upstream_timeout" : "network_error";
      }
    } finally {
      clearTimeout(timer);
      abortController = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        renderMessage(botNode, answer);
      }
      typingEl.hidden = true;
      setBusy(false);
    }

    if (failure) {
      botNode.remove();
      if (FALLBACK_CODES.has(failure)) {
        showFallback(failure);
      } else if (failure === "network_error") {
        showFallback(failure);
      } else {
        const msg =
          failure === "rate_limited" || failure === "http_429"
            ? t("chat.error_rate")
            : failure === "invalid_request"
            ? t("chat.error_request")
            : t("chat.error_generic");
        addMessage("error", msg);
        announce(msg);
      }
      return;
    }

    answer = answer.trim();
    if (!answer) {
      botNode.remove();
      showFallback("empty_answer");
      return;
    }

    history.push({ role: "bot", text: answer });
    saveHistory();
    renderMessage(botNode, answer);
    scrollToBottom();
    announce(answer);
  }

  function showFallback(code) {
    fallbackEl.hidden = false;
    renderFallback();
    const msg =
      code === "upstream_timeout" || code === "network_error"
        ? t("chat.error_network")
        : t("chat.error_quota");
    addMessage("error", msg);
    announce(msg);
  }

  // ---------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------

  function init() {
    if (!API_URL) return; // pas de widget si l'API n'est pas configuree
    build();
    history = loadHistory();

    if (!isOpen) {
      badge.hidden = history.length === 0;
    }

    // Re-localisation complete a chaque changement de langue du site
    window.addEventListener("langchange", () => {
      const wasOpen = isOpen;
      applyLabels();
      if (wasOpen) {
        // Re-rend la conversation pour la nouvelle langue de l'interface.
        // Le contenu de l'IA conserve la langue du message d'origine.
        messagesEl.textContent = "";
        addMessage("bot", t("chat.greeting"));
        history.forEach((m) =>
          addMessage(m.role === "user" ? "user" : "bot", m.text)
        );
        scrollToBottom();
      }
    });

    // Verifie la disponibilite de l'API sans attendre l'ouverture
    checkHealth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose pour le diagnostic
  window.portfolioChat = { toggle, reset, get history() { return history; } };
})();
