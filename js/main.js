(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ========== THEME TOGGLE ========== */
  const THEME_KEY = "portfolio-theme";

  const getSavedTheme = () => {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  };

  const getSystemTheme = () =>
    window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  };

  const savedTheme = getSavedTheme() || "dark";
  applyTheme(savedTheme);

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  /* ========== PARTICLES ========== */
  const particlesCanvas = document.getElementById("particles");
  if (particlesCanvas && !reducedMotion) {
    const ctx = particlesCanvas.getContext("2d");
    let particles = [];
    let rafId = null;

    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const count = mobile ? 35 : 70;

    const resize = () => {
      particlesCanvas.width = window.innerWidth;
      particlesCanvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * particlesCanvas.width,
        y: Math.random() * particlesCanvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.4 + 0.5,
        base: Math.random() * 0.4 + 0.2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = particlesCanvas.width + 20;
        if (p.x > particlesCanvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = particlesCanvas.height + 20;
        if (p.y > particlesCanvas.height + 20) p.y = -20;

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${(1 - dist / 100) * 0.18})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${p.base})`;
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", init);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        rafId = requestAnimationFrame(draw);
      }
    });

    init();
    rafId = requestAnimationFrame(draw);
  }

  /* ========== PHOTO FALLBACK ========== */
  const photoCard = document.getElementById("aboutPhoto");
  if (photoCard) {
    const img = photoCard.querySelector(".photo-img");
    const fallback = document.createElement("span");
    fallback.className = "photo-fallback";
    fallback.textContent = "SL";
    photoCard.appendChild(fallback);

    const handleError = () => photoCard.classList.add("no-photo");
    img.addEventListener("error", handleError);
    img.addEventListener("load", () => photoCard.classList.remove("no-photo"));
    if (img.complete && img.naturalWidth === 0) handleError();
  }

  /* ========== YEAR ========== */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ========== NAVBAR ========== */
  const navbar = document.getElementById("navbar");
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  const toggleMenu = (open) => {
    navMenu.classList.toggle("open", open);
    navToggle.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };

  navToggle.addEventListener("click", () => {
    toggleMenu(!navMenu.classList.contains("open"));
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => toggleMenu(false));
  });

  window.addEventListener("scroll", () => {
    navbar.classList.toggle("scrolled", window.scrollY > 10);
  });

  /* ========== ACTIVE NAV LINK ========== */
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-link");

  const setActiveLink = () => {
    const pos = window.scrollY + 100;
    let current = "home";
    sections.forEach((section) => {
      if (pos >= section.offsetTop) current = section.id;
    });
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
    });
  };

  window.addEventListener("scroll", setActiveLink);
  setActiveLink();

  /* ========== TYPEWRITER ========== */
  const typedEl = document.getElementById("typed");
  let typeTimeout = null;
  let wordIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const getTypewriterWords = () => {
    if (window.i18n) {
      const words = window.i18n.t("typewriter.words");
      if (Array.isArray(words)) return words;
    }
    return ["Full Stack", "Passionné du Web", "et de l'IA"];
  };

  const type = () => {
    if (typeTimeout) clearTimeout(typeTimeout);
    const words = getTypewriterWords();
    const word = words[wordIndex];
    typedEl.textContent = word.slice(0, charIndex);

    if (!deleting && charIndex < word.length) {
      charIndex++;
      typeTimeout = setTimeout(type, 80);
    } else if (!deleting && charIndex === word.length) {
      deleting = true;
      typeTimeout = setTimeout(type, 2000);
    } else if (deleting && charIndex > 0) {
      charIndex--;
      typeTimeout = setTimeout(type, 35);
    } else {
      deleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeTimeout = setTimeout(type, 400);
    }
  };

  const resetTypewriter = () => {
    if (typeTimeout) clearTimeout(typeTimeout);
    wordIndex = 0;
    charIndex = 0;
    deleting = false;
    typedEl.textContent = "";
    typeTimeout = setTimeout(type, 400);
  };

  if (typedEl) type();
  window.addEventListener("langchange", resetTypewriter);

  /* ========== REVEAL ON SCROLL ========== */
  const revealElements = document.querySelectorAll(".section, .hero-content, .footer-content");
  revealElements.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = `${(i % 3) * 0.05}s`;
  });

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealElements.forEach((el) => el.classList.add("visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    revealElements.forEach((el) => observer.observe(el));
  }

  /* ========== LANGUAGE BARS ========== */
  const langObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.width = `${entry.target.dataset.level}%`;
          langObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  document.querySelectorAll(".lang-fill").forEach((fill) => {
    if (reducedMotion) {
      fill.style.width = `${fill.dataset.level}%`;
    } else {
      langObserver.observe(fill);
    }
  });

  /* ========== PROJECT FILTERS ========== */
  const filters = document.querySelectorAll(".filter");
  const cards = document.querySelectorAll(".project-card");
  const countNum = document.getElementById("projectsCountNum");

  const updateProjectsCount = () => {
    if (!countNum) return;
    const visible = document.querySelectorAll(".project-card:not(.hidden)").length;
    countNum.textContent = visible;
  };

  const applyFilter = (value) => {
    cards.forEach((card) => {
      const show = value === "all" || card.dataset.category === value;
      if (show) {
        card.classList.remove("hidden");
        requestAnimationFrame(() => card.classList.add("filter-in"));
      } else {
        card.classList.remove("filter-in");
        card.classList.add("hidden");
      }
    });
    updateProjectsCount();
  };

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      filters.forEach((f) => f.classList.remove("active"));
      filter.classList.add("active");
      applyFilter(filter.dataset.filter);
    });
  });

  filters.forEach((rfilter) => {
    if (rfilter.classList.contains("active")) {
      cards.forEach((card) => {
        if (card.dataset.category === rfilter.dataset.filter || rfilter.dataset.filter === "all") {
          card.classList.add("filter-in");
        }
      });
    }
  });
  updateProjectsCount();

  /* ========== TESTIMONIALS SLIDER ========== */
  const track = document.getElementById("testimonialsTrack");
  const dotsContainer = document.getElementById("testimonialsDots");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (track && dotsContainer) {
    const slides = track.querySelectorAll(".testimonial-card");
    let current = 0;
    let autoInterval = null;

    const updateSlider = () => {
      track.style.transform = `translateX(-${current * 100}%)`;
      dotsContainer.querySelectorAll("button").forEach((dot, i) => {
        dot.classList.toggle("active", i === current);
      });
    };

    const createDots = () => {
      slides.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.setAttribute("aria-label", `Témoignage ${i + 1}`);
        if (i === 0) dot.classList.add("active");
        dot.addEventListener("click", () => {
          current = i;
          updateSlider();
          resetAutoPlay();
        });
        dotsContainer.appendChild(dot);
      });
    };

    const next = () => {
      current = (current + 1) % slides.length;
      updateSlider();
    };

    const prev = () => {
      current = (current - 1 + slides.length) % slides.length;
      updateSlider();
    };

    const resetAutoPlay = () => {
      if (autoInterval) clearInterval(autoInterval);
      autoInterval = setInterval(next, 5000);
    };

    if (prevBtn) prevBtn.addEventListener("click", () => { prev(); resetAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { next(); resetAutoPlay(); });

    createDots();
    resetAutoPlay();
  }

  /* ========== CONTACT FORM (Formspree) ========== */
  const contactForm = document.getElementById("contactForm");
  const formStatus = document.getElementById("formStatus");

  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = contactForm.querySelector('[name="name"]').value.trim();
      const email = contactForm.querySelector('[name="email"]').value.trim();
      const subject = contactForm.querySelector('[name="subject"]').value.trim();
      const message = contactForm.querySelector('[name="message"]').value.trim();

      if (!name || !email || !subject || !message) {
        formStatus.textContent = window.i18n ? window.i18n.t("contact.form_error") : "Veuillez remplir tous les champs.";
        formStatus.className = "form-status error";
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        formStatus.textContent = window.i18n ? window.i18n.t("contact.form_email_error") : "Adresse email invalide.";
        formStatus.className = "form-status error";
        return;
      }

      const submitBtn = contactForm.querySelector(".btn-submit");
      submitBtn.classList.add("loading");
      formStatus.textContent = "";
      formStatus.className = "form-status";

      try {
        const response = await fetch(contactForm.action, {
          method: "POST",
          body: new FormData(contactForm),
          headers: { Accept: "application/json" }
        });

        if (response.ok) {
          formStatus.textContent = window.i18n ? window.i18n.t("contact.form_success") : "Message envoyé avec succès !";
          formStatus.className = "form-status success";
          contactForm.reset();
        } else {
          const statusKey = "contact.form_status_" + response.status;
          const fallbackMsg = "Erreur " + response.status + ". " + (window.i18n ? window.i18n.t("contact.form_submit_error") : "Une erreur est survenue lors de l'envoi. Veuillez réessayer.");
          formStatus.textContent = window.i18n && window.i18n.t(statusKey) !== statusKey
            ? window.i18n.t(statusKey)
            : fallbackMsg;
          formStatus.className = "form-status error";
          console.error("Formspree submission error:", response.status, response.statusText);
          throw new Error("Form submission failed: " + response.status);
        }
      } catch {
        const __host = window.location.hostname;
        const isLocal = window.location.protocol === "file:" || __host === "localhost" || __host === "127.0.0.1";
        formStatus.textContent = isLocal
          ? (window.i18n ? window.i18n.t("contact.form_local_error") : "Le formulaire de contact ne fonctionne que sur le site en ligne.")
          : (window.i18n ? window.i18n.t("contact.form_submit_error") : "Une erreur est survenue lors de l'envoi. Veuillez réessayer.");
        formStatus.className = "form-status error";
      } finally {
        submitBtn.classList.remove("loading");
        setTimeout(() => {
          formStatus.textContent = "";
          formStatus.className = "form-status";
        }, 6000);
      }
    });
  }

  /* ========== LANG SWITCHER ========== */
  const langToggle = document.querySelector(".lang-toggle");
  const langDropdown = document.querySelector(".lang-dropdown");

  if (langToggle && langDropdown) {
    langToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = langDropdown.classList.toggle("open");
      langToggle.setAttribute("aria-expanded", String(open));
    });

    langDropdown.querySelectorAll(".lang-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        window.i18n.setLanguage(opt.dataset.lang);
        langDropdown.classList.remove("open");
        langToggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", () => {
      langDropdown.classList.remove("open");
      langToggle.setAttribute("aria-expanded", "false");
    });
  }

  /* ========== I18N INIT ========== */
  window.i18n.init();

})();
