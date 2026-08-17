(() => {
  "use strict";

  const SUPPORTED = ["fr", "en", "ar"];
  const DEFAULT = "fr";
  const STORAGE_KEY = "portfolio-lang";

  let currentLang = DEFAULT;
  let translations = {};

  const I18N_DATA = {
    fr: {
      "meta.title": "Sif-Eddine Laidi — Développeur Full Stack",
      "meta.description": "Portfolio de Sif-Eddine Laidi, développeur full stack basé à Casablanca, Maroc.",
      "nav.home": "Accueil",
      "nav.about": "À propos",
      "nav.skills": "Compétences",
      "nav.projects": "Projets",
      "nav.contact": "Contact",
      "nav.download_cv": "Télécharger CV",
      "nav.aria.toggle": "Ouvrir le menu",
      "nav.aria.main": "Navigation principale",
      "hero.greeting": "Bonjour, je suis",
      "hero.title_prefix": "Développeur",
      "hero.text": "Full stack junior, passionné par le web, les bases de données et l'intelligence artificielle. Je crée des solutions concrètes et innovantes.",
      "hero.see_projects": "Voir mes projets",
      "hero.contact_me": "Me contacter",
      "hero.download_cv": "Télécharger mon CV",
      "about.tag": "À propos",
      "about.title": "Qui suis-je ?",
      "about.p1": "Développeur full stack junior, formé aux technologies front-end et back-end (React, Node.js, PHP/Laravel, Spring Boot) et à la gestion de bases de données relationnelles et NoSQL.",
      "about.p2": "Auteur de plusieurs projets concrets : une plateforme de gestion des ordonnances médicales et une plateforme de gestion des surveillances d'examens.",
      "about.p3": "Curieux, rigoureux et autonome, je recherche un poste de développeur full stack pour mettre ces compétences au service de projets innovants.",
      "about.photo_alt": "Photo de Sif-Eddine Laidi",
      "about.info_name": "Nom",
      "about.info_location": "Localisation",
      "about.info_email": "Email",
      "about.info_phone": "Téléphone",
      "about.download_cv": "Télécharger mon CV",
      "skills.tag": "Compétences",
      "skills.title": "Mes compétences",
      "skills.frontend": "Front-end",
      "skills.frontend_techs": "HTML, CSS, JavaScript, React, Bootstrap",
      "skills.backend": "Back-end",
      "skills.backend_techs": "Node.js, PHP, Laravel, Spring Boot",
      "skills.database": "Bases de données",
      "skills.database_techs": "MySQL, MongoDB, Oracle",
      "skills.versioning": "Versioning",
      "skills.versioning_techs": "Git, GitHub, GitLab",
      "skills.api": "API",
      "skills.api_techs": "Création et intégration RESTful",
      "skills.tools": "Outils",
      "skills.tools_techs": "Docker, Postman, CI/CD, Keycloak, Hostinger",
      "skills.ai": "Intelligence Artificielle",
      "skills.ai_techs": "Systèmes multi-agents, Prompt Engineering (CoStar), OCR, Python",
      "skills.languages": "Langues",
      "skills.arabic": "Arabe",
      "skills.french": "Français",
      "skills.english": "Anglais",
      "skills.native": "Natif",
      "skills.fluent": "Courant",
      "skills.conversational": "Conversationnel",
      "projects.tag": "Projets",
      "projects.title": "Mes projets",
      "projects.filter_all": "Tous",
      "projects.filter_internship": "Stage",
      "projects.filter_hackathon": "Hackathon",
      "projects.filter_academic": "Académique",
      "projects.badge_internship_final": "Stage de fin d'études",
      "projects.badge_internship": "Stage",
      "projects.badge_hackathon": "Hackathon · Finaliste Top 5/85",
      "projects.badge_academic": "Projet académique",
      "projects.p1_title": "Plateforme de surveillance d'examens",
      "projects.p1_desc": "Planification automatisée, affectation des surveillants et suivi en temps réel. Authentification et gestion des rôles avec Keycloak.",
      "projects.p1_date": "15/05/2026 – 15/08/2026 · Faculté des Sciences Ben M'Sik",
      "projects.p2_title": "Plateforme d'ordonnances médicales",
      "projects.p2_desc": "Gestion des ordonnances médicales avec génération automatique de PDF. Conception de l'interface utilisateur et intégration de l'API back-end.",
      "projects.p2_date": "01/03/2024 – 01/04/2024",
      "projects.p3_title": "Solution documentaire multi-agents",
      "projects.p3_desc": "Automatisation du traitement documentaire avec raisonnement et prise de décision autonome (Intake, Classification, Extraction, Validation). Intégration OCR et prompt engineering (framework CoStar).",
      "projects.p3_date": "Début 2026 · Capgemini Maroc, Équipe FiveLinks",
      "projects.p4_title": "Plateforme d'apprentissage et d'évaluation",
      "projects.p4_desc": "Plateforme éducative numérique : gestion intégrée des cours, des exercices et des statistiques de progression des apprenants.",
      "projects.p4_date": "09/2024 – 09/2025",
      "projects.view_demo": "Voir la démo",
      "projects.github": "GitHub",
      "contact.tag": "Contact",
      "contact.title": "Travaillons ensemble",
      "contact.intro": "Une question, un projet, une opportunité ? N'hésitez pas à me contacter.",
      "contact.email": "Email",
      "contact.phone": "Téléphone",
      "contact.github": "GitHub",
      "contact.linkedin": "LinkedIn",
      "contact.download_cv": "Télécharger mon CV (PDF)",
      "footer.rights": "Développeur Full Stack.",
      "footer.back_to_top": "↑ Retour en haut",
      "footer.aria.back_to_top": "Retour en haut",
      "typewriter.words": ["Full Stack", "Passionné du Web", "et de l'IA"]
    },
    en: {
      "meta.title": "Sif-Eddine Laidi — Full Stack Developer",
      "meta.description": "Portfolio of Sif-Eddine Laidi, full stack developer based in Casablanca, Morocco.",
      "nav.home": "Home",
      "nav.about": "About",
      "nav.skills": "Skills",
      "nav.projects": "Projects",
      "nav.contact": "Contact",
      "nav.download_cv": "Download CV",
      "nav.aria.toggle": "Open menu",
      "nav.aria.main": "Main navigation",
      "hero.greeting": "Hello, I'm",
      "hero.title_prefix": "Developer",
      "hero.text": "Junior full stack developer, passionate about web, databases and artificial intelligence. I create concrete and innovative solutions.",
      "hero.see_projects": "See my projects",
      "hero.contact_me": "Contact me",
      "hero.download_cv": "Download my CV",
      "about.tag": "About",
      "about.title": "Who am I?",
      "about.p1": "Junior full stack developer, trained in front-end and back-end technologies (React, Node.js, PHP/Laravel, Spring Boot) and in relational and NoSQL database management.",
      "about.p2": "Author of several concrete projects: a medical prescriptions management platform and an exam supervision management platform.",
      "about.p3": "Curious, rigorous and autonomous, I'm looking for a full stack developer position to put these skills at the service of innovative projects.",
      "about.photo_alt": "Photo of Sif-Eddine Laidi",
      "about.info_name": "Name",
      "about.info_location": "Location",
      "about.info_email": "Email",
      "about.info_phone": "Phone",
      "about.download_cv": "Download my CV",
      "skills.tag": "Skills",
      "skills.title": "My skills",
      "skills.frontend": "Front-end",
      "skills.frontend_techs": "HTML, CSS, JavaScript, React, Bootstrap",
      "skills.backend": "Back-end",
      "skills.backend_techs": "Node.js, PHP, Laravel, Spring Boot",
      "skills.database": "Databases",
      "skills.database_techs": "MySQL, MongoDB, Oracle",
      "skills.versioning": "Versioning",
      "skills.versioning_techs": "Git, GitHub, GitLab",
      "skills.api": "API",
      "skills.api_techs": "RESTful creation and integration",
      "skills.tools": "Tools",
      "skills.tools_techs": "Docker, Postman, CI/CD, Keycloak, Hostinger",
      "skills.ai": "Artificial Intelligence",
      "skills.ai_techs": "Multi-agent systems, Prompt Engineering (CoStar), OCR, Python",
      "skills.languages": "Languages",
      "skills.arabic": "Arabic",
      "skills.french": "French",
      "skills.english": "English",
      "skills.native": "Native",
      "skills.fluent": "Fluent",
      "skills.conversational": "Conversational",
      "projects.tag": "Projects",
      "projects.title": "My projects",
      "projects.filter_all": "All",
      "projects.filter_internship": "Internship",
      "projects.filter_hackathon": "Hackathon",
      "projects.filter_academic": "Academic",
      "projects.badge_internship_final": "End-of-studies internship",
      "projects.badge_internship": "Internship",
      "projects.badge_hackathon": "Hackathon · Finalist Top 5/85",
      "projects.badge_academic": "Academic project",
      "projects.p1_title": "Exam Supervision Platform",
      "projects.p1_desc": "Automated planning, supervisor assignment and real-time monitoring. Authentication and role management with Keycloak.",
      "projects.p1_date": "05/15/2026 – 08/15/2026 · Faculty of Sciences Ben M'Sik",
      "projects.p2_title": "Medical Prescriptions Platform",
      "projects.p2_desc": "Medical prescriptions management with automatic PDF generation. User interface design and back-end API integration.",
      "projects.p2_date": "03/01/2024 – 04/01/2024",
      "projects.p3_title": "Multi-agent Document Solution",
      "projects.p3_desc": "Document processing automation with autonomous reasoning and decision-making (Intake, Classification, Extraction, Validation). OCR integration and prompt engineering (CoStar framework).",
      "projects.p3_date": "Early 2026 · Capgemini Morocco, FiveLinks Team",
      "projects.p4_title": "Learning and Evaluation Platform",
      "projects.p4_desc": "Digital educational platform: integrated management of courses, exercises and learner progression statistics.",
      "projects.p4_date": "09/2024 – 09/2025",
      "projects.view_demo": "View demo",
      "projects.github": "GitHub",
      "contact.tag": "Contact",
      "contact.title": "Let's work together",
      "contact.intro": "A question, a project, an opportunity? Don't hesitate to contact me.",
      "contact.email": "Email",
      "contact.phone": "Phone",
      "contact.github": "GitHub",
      "contact.linkedin": "LinkedIn",
      "contact.download_cv": "Download my CV (PDF)",
      "footer.rights": "Full Stack Developer.",
      "footer.back_to_top": "↑ Back to top",
      "footer.aria.back_to_top": "Back to top",
      "typewriter.words": ["Full Stack", "Web Enthusiast", "and AI"]
    },
    ar: {
      "meta.title": "سديد الدين لايدي — مطور ويب متكامل",
      "meta.description": "محترف سديد الدين لايدي، مطور ويب متكامل مقيم في الدار البيضاء، المغرب.",
      "nav.home": "الرئيسية",
      "nav.about": "عني",
      "nav.skills": "المهارات",
      "nav.projects": "المشاريع",
      "nav.contact": "اتصال",
      "nav.download_cv": "تحميل السيرة الذاتية",
      "nav.aria.toggle": "فتح القائمة",
      "nav.aria.main": "التنقل الرئيسي",
      "hero.greeting": "مرحبا، أنا",
      "hero.title_prefix": "مطور",
      "hero.text": "مطور ويب متكامل مبتدئ، شغوف بالويب وقواعد البيانات والذكاء الاصطناعي. أبتكر حلولاً ملموسة ومبتكرة.",
      "hero.see_projects": "عرض مشاريعي",
      "hero.contact_me": "اتصل بي",
      "hero.download_cv": "تحميل سيرتي الذاتية",
      "about.tag": "عني",
      "about.title": "من أنا؟",
      "about.p1": "مطور ويب متكامل مبتدئ، تدرب على تقنيات الواجهة الأمامية والخلفية (React, Node.js, PHP/Laravel, Spring Boot) وإدارة قواعد البيانات العلائقية وغير العلائقية.",
      "about.p2": "مؤلف عدة مشاريع ملموسة: منصة لإدارة الوصفات الطبية ومنصة لإدارة مراقبة الامتحانات.",
      "about.p3": "فضولي، دقيق ومستقل، أبحث عن وظيفة مطور ويب متكامل لخدمة المشاريع المبتكرة بمهاراتي.",
      "about.photo_alt": "صورة سديد الدين لايدي",
      "about.info_name": "الاسم",
      "about.info_location": "الموقع",
      "about.info_email": "البريد الإلكتروني",
      "about.info_phone": "الهاتف",
      "about.download_cv": "تحميل سيرتي الذاتية",
      "skills.tag": "المهارات",
      "skills.title": "مهاراتي",
      "skills.frontend": "الواجهة الأمامية",
      "skills.frontend_techs": "HTML, CSS, JavaScript, React, Bootstrap",
      "skills.backend": "الواجهة الخلفية",
      "skills.backend_techs": "Node.js, PHP, Laravel, Spring Boot",
      "skills.database": "قواعد البيانات",
      "skills.database_techs": "MySQL, MongoDB, Oracle",
      "skills.versioning": "التحكم بالإصدارات",
      "skills.versioning_techs": "Git, GitHub, GitLab",
      "skills.api": "API",
      "skills.api_techs": "إنشاء ودمج RESTful",
      "skills.tools": "الأدوات",
      "skills.tools_techs": "Docker, Postman, CI/CD, Keycloak, Hostinger",
      "skills.ai": "الذكاء الاصطناعي",
      "skills.ai_techs": "أنظمة الوكيل المتعدد, Prompt Engineering (CoStar), OCR, Python",
      "skills.languages": "اللغات",
      "skills.arabic": "العربية",
      "skills.french": "الفرنسية",
      "skills.english": "الإنجليزية",
      "skills.native": "اللغة الأم",
      "skills.fluent": "طيّب",
      "skills.conversational": "محادثة",
      "projects.tag": "المشاريع",
      "projects.title": "مشاريعي",
      "projects.filter_all": "الكل",
      "projects.filter_internship": "تدريب",
      "projects.filter_hackathon": "هاكاثون",
      "projects.filter_academic": "أكاديمي",
      "projects.badge_internship_final": "تدريب نهاية الدراسة",
      "projects.badge_internship": "تدريب",
      "projects.badge_hackathon": "هاكاثون · نهائي Top 5/85",
      "projects.badge_academic": "مشروع أكاديمي",
      "projects.p1_title": "منصة مراقبة الامتحانات",
      "projects.p1_desc": "التخطيط الآلي، تعيين المراقبين والمتابعة في الوقت الفعلي. المصادقة وإدارة الأدوار باستخدام Keycloak.",
      "projects.p1_date": "15/05/2026 – 15/08/2026 · كلية العلوم بن مسيك",
      "projects.p2_title": "منصة الوصفات الطبية",
      "projects.p2_desc": "إدارة الوصفات الطبية مع إنشاء تلقائي لملفات PDF. تصميم واجهة المستخدم ودمج API الواجهة الخلفية.",
      "projects.p2_date": "01/03/2024 – 01/04/2024",
      "projects.p3_title": "حل الوثائق متعدد الوكلاء",
      "projects.p3_desc": "أتمتة معالجة الوثائق مع التفكير والاستقلالية في اتخاذ القرار (الاستقبال، التصنيف، الاستخراج، التحقق). دمج OCR وهندسة الأوامر (إطار CoStar).",
      "projects.p3_date": "بداية 2026 · كابتشيني المغرب، فريق FiveLinks",
      "projects.p4_title": "منصة التعلم والتقييم",
      "projects.p4_desc": "منصة تعليمية رقمية: الإدارة المتكاملة للدورات والتمارين وإحصاءات تقدم المتعلمین.",
      "projects.p4_date": "09/2024 – 09/2025",
      "projects.view_demo": "عرض العرض التوضيحي",
      "projects.github": "GitHub",
      "contact.tag": "اتصال",
      "contact.title": "لنعمل معاً",
      "contact.intro": "سؤال، مشروع، فرصة؟ لا تتردد في الاتصال بي.",
      "contact.email": "البريد الإلكتروني",
      "contact.phone": "الهاتف",
      "contact.github": "GitHub",
      "contact.linkedin": "LinkedIn",
      "contact.download_cv": "تحميل سيرتي الذاتية (PDF)",
      "footer.rights": "مطور ويب متكامل.",
      "footer.back_to_top": "↑ العودة للأعلى",
      "footer.aria.back_to_top": "العودة للأعلى",
      "typewriter.words": ["Full Stack", "شغوف بالويب", "والذكاء الاصطناعي"]
    }
  };

  const getSaved = () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  };

  const detect = () => {
    const saved = getSaved();
    if (saved && SUPPORTED.includes(saved)) return saved;
    const nav = navigator.language || navigator.userLanguage || "";
    if (nav.startsWith("ar")) return "ar";
    if (nav.startsWith("en")) return "en";
    return DEFAULT;
  };

  const load = (lang) => {
    if (I18N_DATA[lang]) {
      translations = I18N_DATA[lang];
      currentLang = lang;
    } else if (lang !== DEFAULT) {
      translations = I18N_DATA[DEFAULT];
      currentLang = DEFAULT;
    }
  };

  const t = (key) => translations[key] || key;

  const applyToDOM = () => {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(key);
      if (val !== key) el.textContent = val;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(key);
      if (val !== key) el.placeholder = val;
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      const val = t(key);
      if (val !== key) el.setAttribute("aria-label", val);
    });

    document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
      const key = el.getAttribute("data-i18n-alt");
      const val = t(key);
      if (val !== key) el.alt = val;
    });

    const titleEl = document.querySelector("title");
    const metaDesc = document.querySelector('meta[name="description"]');
    if (titleEl) titleEl.textContent = t("meta.title");
    if (metaDesc) metaDesc.setAttribute("content", t("meta.description"));

    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";

    document.querySelectorAll(".lang-switcher .lang-option").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.lang === currentLang);
    });

    const langCodeEl = document.querySelector(".lang-code");
    if (langCodeEl) langCodeEl.textContent = currentLang.toUpperCase();
  };

  const setLanguage = (lang) => {
    if (!SUPPORTED.includes(lang) || lang === currentLang) return;
    load(lang);
    applyToDOM();
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    window.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
  };

  const init = () => {
    currentLang = detect();
    load(currentLang);
    applyToDOM();
  };

  window.i18n = { init, t, setLanguage, getLang: () => currentLang, SUPPORTED };
})();
