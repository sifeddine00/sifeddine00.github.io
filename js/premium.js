(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  /* ========== LOADING SCREEN ========== */
  const loadingScreen = document.querySelector(".loading-screen");
  const loadingBarFill = document.querySelector(".loading-bar-fill");

  if (loadingScreen && loadingBarFill) {
    let progress = 0;
    const tick = () => {
      if (progress < 90) {
        progress += Math.random() * 15 + 5;
        if (progress > 90) progress = 90;
        loadingBarFill.style.width = progress + "%";
        requestAnimationFrame(tick);
      }
    };
    tick();

    const hideLoading = () => {
      loadingBarFill.style.width = "100%";
      setTimeout(() => {
        loadingScreen.classList.add("hidden");
        setTimeout(() => loadingScreen.remove(), 600);
      }, 400);
    };

    if (document.readyState === "complete") {
      hideLoading();
    } else {
      window.addEventListener("load", hideLoading);
    }
  }

  /* ========== SCROLL PROGRESS BAR ========== */
  const scrollProgress = document.querySelector(".scroll-progress");
  if (scrollProgress) {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      scrollProgress.style.width = pct + "%";
    };
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
  }

  /* ========== WAVING HAND (re-trigger on lang change) ========== */
  const heroWave = document.querySelector(".hero-wave");
  document.addEventListener("langchange", () => {
    if (!heroWave) return;
    heroWave.style.animation = "none";
    void heroWave.offsetWidth;
    heroWave.style.animation = "";
  });

  /* ========== MAGNETIC BUTTONS ========== */
  if (!isTouch && !reducedMotion) {
    const magneticEls = document.querySelectorAll(".btn-primary, .social-link, .nav-link");
    magneticEls.forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        el.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "";
      });
    });
  }

  /* ========== 3D TILT CARDS ========== */
  if (!isTouch && !reducedMotion) {
    const tiltCards = document.querySelectorAll(".skill-card, .project-card, .contact-card");
    tiltCards.forEach((card) => {
      card.classList.add("tilt-card");
      const inner = document.createElement("div");
      inner.className = "tilt-card-inner";
      inner.style.cssText = "position:relative;z-index:2;";
      while (card.firstChild) inner.appendChild(card.firstChild);
      card.appendChild(inner);

      const shine = document.createElement("div");
      shine.className = "tilt-shine";
      card.appendChild(shine);

      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const tiltX = (y - 0.5) * -10;
        const tiltY = (x - 0.5) * 10;
        inner.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02,1.02,1.02)`;
        card.style.setProperty("--mouse-x", (x * 100) + "%");
        card.style.setProperty("--mouse-y", (y * 100) + "%");
      });

      card.addEventListener("mouseleave", () => {
        inner.style.transform = "";
      });
    });
  }

  /* ========== GLASSMORPHISM ========== */
  document.querySelectorAll(".skill-card, .project-card, .contact-card, .about-card, .timeline-content, .testimonial-card").forEach((el) => {
    el.classList.add("glass", "gradient-border");
  });

  /* ========== STAGGER REVEAL ========== */
  const staggerGroups = document.querySelectorAll(".skills-grid, .projects-grid, .contact-grid, .hero-actions, .hero-socials");
  staggerGroups.forEach((group) => {
    group.classList.add("stagger-reveal");
  });

  if (!reducedMotion && "IntersectionObserver" in window) {
    const staggerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            staggerObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll(".stagger-reveal").forEach((el) => staggerObserver.observe(el));
  } else {
    document.querySelectorAll(".stagger-reveal").forEach((el) => el.classList.add("revealed"));
  }

  /* ========== BACK TO TOP ========== */
  const backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    window.addEventListener("scroll", () => {
      backToTop.classList.toggle("visible", window.scrollY > 400);
    }, { passive: true });

    backToTop.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

})();
