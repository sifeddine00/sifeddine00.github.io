(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const particlesCanvas = document.getElementById("particles");
  if (particlesCanvas && !reducedMotion) {
    const ctx = particlesCanvas.getContext("2d");
    let particles = [];
    let rafId = null;

    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const count = mobile ? 40 : 85;
    const mouse = { x: null, y: null };

    const resize = () => {
      particlesCanvas.width = window.innerWidth;
      particlesCanvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * particlesCanvas.width,
        y: Math.random() * particlesCanvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
        base: Math.random() * 0.5 + 0.25,
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
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${(1 - dist / 110) * 0.22})`;
            ctx.lineWidth = 1;
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

    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    window.addEventListener("resize", () => {
      init();
    });

    document.addEventListener("mousemove", onMouseMove);

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

  const photoCard = document.getElementById("aboutPhoto");
  if (photoCard) {
    const img = photoCard.querySelector(".photo-img");
    const fallback = document.createElement("span");
    fallback.className = "photo-fallback";
    fallback.textContent = "SL";
    photoCard.appendChild(fallback);

    const handleError = () => {
      photoCard.classList.add("no-photo");
    };

    img.addEventListener("error", handleError);
    img.addEventListener("load", () => photoCard.classList.remove("no-photo"));
    if (img.complete && img.naturalWidth === 0) handleError();
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const navbar = document.getElementById("navbar");
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  const toggleMenu = (open) => {
    navMenu.classList.toggle("open", open);
    navToggle.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };

  navToggle.addEventListener("click", () => {
    const open = !navMenu.classList.contains("open");
    toggleMenu(open);
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => toggleMenu(false));
  });

  window.addEventListener("scroll", () => {
    navbar.classList.toggle("scrolled", window.scrollY > 10);
  });

  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-link");

  const setActiveLink = () => {
    const pos = window.scrollY + 90;
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
      typeTimeout = setTimeout(type, 90);
    } else if (!deleting && charIndex === word.length) {
      deleting = true;
      typeTimeout = setTimeout(type, 1800);
    } else if (deleting && charIndex > 0) {
      charIndex--;
      typeTimeout = setTimeout(type, 40);
    } else {
      deleting = false;
      wordIndex = (wordIndex + 1) % words.length;
      typeTimeout = setTimeout(type, 350);
    }
  };

  const resetTypewriter = () => {
    if (typeTimeout) clearTimeout(typeTimeout);
    wordIndex = 0;
    charIndex = 0;
    deleting = false;
    typedEl.textContent = "";
    typeTimeout = setTimeout(type, 350);
  };

  if (typedEl) type();

  window.addEventListener("langchange", resetTypewriter);

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
      { threshold: 0.12 }
    );
    revealElements.forEach((el) => observer.observe(el));
  }

  const langObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const fill = entry.target;
          fill.style.width = `${fill.dataset.level}%`;
          langObserver.unobserve(fill);
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

  const filters = document.querySelectorAll(".filter");
  const cards = document.querySelectorAll(".project-card");

  filters.forEach((filter) => {
    filter.addEventListener("click", () => {
      filters.forEach((f) => f.classList.remove("active"));
      filter.classList.add("active");

      const value = filter.dataset.filter;
      cards.forEach((card) => {
        const show = value === "all" || card.dataset.category === value;
        card.classList.toggle("hidden", !show);
      });
    });
  });

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

  window.i18n.init();

})();
