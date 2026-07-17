// HeleoX — sito di presentazione: reveal on scroll, gauge animato, contatori.

// ---------- Reveal on scroll ----------
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ---------- Sfondo video legato allo scroll (homepage) ----------
// Il video non va MAI in play: a ogni scroll si calcola la frazione di
// pagina scorsa e si porta il video al fotogramma corrispondente, con un
// piccolo inseguimento (lerp) per rendere fluido anche uno scroll a scatti.
// Sito fermo = nessun rAF attivo = animazione ferma, zero lavoro in idle.
const bgVideo = document.getElementById("bgVideo");
if (bgVideo && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let target = 0; // frazione di scroll desiderata (0..1)
  let current = 0; // frazione attualmente mostrata
  let rafId = null;

  const readScrollFraction = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
  };

  const tick = () => {
    current += (target - current) * 0.14;
    if (bgVideo.duration && bgVideo.readyState >= 1 && !bgVideo.seeking) {
      // -0.05s: mai esattamente sull'ultimo frame, alcuni browser vi mostrano nero
      bgVideo.currentTime = current * Math.max(bgVideo.duration - 0.05, 0);
    }
    if (Math.abs(target - current) > 0.0005) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  };

  const onScroll = () => {
    readScrollFraction();
    if (rafId === null) rafId = requestAnimationFrame(tick);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  bgVideo.addEventListener("loadedmetadata", onScroll);

  // Mobile (in particolare iOS/Safari): finché l'utente non interagisce, il
  // browser può rifiutarsi di decodificare il video — lo sfondo resterebbe
  // vuoto anche con il codice corretto. Un play/pause silenzioso al primo
  // tocco "sblocca" la pipeline di decodifica; da lì in poi il seek legato
  // allo scroll funziona come su desktop. Il video è muted+playsinline,
  // quindi il play è consentito e comunque dura una frazione di frame.
  const unlockDecode = () => {
    const p = bgVideo.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        bgVideo.pause();
        onScroll();
      }).catch(() => {
        /* es. risparmio energetico: il seek da solo resta comunque tentato */
      });
    }
  };
  window.addEventListener("touchstart", unlockDecode, { once: true, passive: true });

  // Se il video non si carica (file mancante, rete), lo sfondo sparisce
  // senza lasciare artefatti: resta il colore di base di html.
  bgVideo.addEventListener("error", () => {
    const wrap = bgVideo.closest(".video-bg");
    if (wrap) wrap.remove();
  });
}

// ---------- Menu mobile (hamburger) ----------
// Su mobile .nav-links è nascosto e compare come pannello quando .nav ha .open.
// Chiusura: tocco su un link, tasto Escape, o tocco fuori dal menu.
const navEl = document.querySelector(".nav");
const navToggle = document.querySelector(".nav-toggle");
if (navEl && navToggle) {
  const closeNav = () => {
    navEl.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };
  navToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = navEl.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  // un tocco su una voce (anche nel sottomenu Moduli) chiude il pannello
  navEl.querySelectorAll(".nav-links a").forEach((a) =>
    a.addEventListener("click", closeNav)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });
  document.addEventListener("click", (e) => {
    if (navEl.classList.contains("open") && !navEl.contains(e.target)) closeNav();
  });
}

// ---------- Dropdown "Moduli" nella nav ----------
// L'apertura al passaggio del mouse è già gestita in CSS (:hover/:focus-within);
// il click serve per il touch e per chi preferisce cliccare. Escape o un click
// fuori chiudono il menu.
document.querySelectorAll(".nav-drop").forEach((drop) => {
  const toggle = drop.querySelector(".nav-drop-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!drop.contains(e.target)) drop.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") drop.classList.remove("open");
  });
});

// ---------- Gauge del risk score (hero) ----------
// score demo 84 (fascia B): coerente con l'esempio di finding mostrati.
const GAUGE_TARGET = 84;
const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 come nel markup SVG

function animateGauge() {
  const fill = document.querySelector(".gauge-fill");
  const label = document.getElementById("gaugeScore");
  if (!fill || !label) return;

  // riempimento dell'arco
  fill.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - GAUGE_TARGET / 100));

  // conteggio numerico sincronizzato con la transizione CSS (1.8s)
  const duration = 1800;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubico
    label.textContent = String(Math.round(GAUGE_TARGET * eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
// parte quando il gauge è davvero visibile (gestisce anche tab in background)
const gaugeWrap = document.querySelector(".gauge-wrap");
if (gaugeWrap) {
  const gaugeObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        gaugeObserver.disconnect();
        setTimeout(animateGauge, 350);
      }
    },
    { threshold: 0.4 }
  );
  gaugeObserver.observe(gaugeWrap);
}

// ---------- Contatori statistiche ----------
// data-decimals (opzionale) per target non interi, es. 48,7 — virgola italiana.
const counterObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      counterObserver.unobserve(el);
      const target = Number(el.dataset.target);
      const decimals = Number(el.dataset.decimals || 0);
      const duration = 1400;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals).replace(".", ",");
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  },
  { threshold: 0.6 }
);
document.querySelectorAll(".counter").forEach((el) => counterObserver.observe(el));

// ---------- Piani (sezione #piani) ----------
// I dati vivono in plans.json: per cambiare prezzi, domini o feature
// basta modificare quel file. La fetch è locale (stesso dominio):
// nessun servizio terzo, nessun cookie.
const plansGrid = document.getElementById("plansGrid");
if (plansGrid) {
  fetch("plans.json", { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(({ plans, note }) => {
      plans.forEach((plan, i) => {
        const div = document.createElement("div");
        div.className =
          "plan" + (plan.featured ? " plan-featured" : "") +
          " reveal" + (i > 0 ? ` delay-${Math.min(i, 3)}` : "");
        div.innerHTML = `
          ${plan.badge ? `<span class="plan-badge">${plan.badge}</span>` : ""}
          <h3>${plan.name}</h3>
          <div class="plan-price">${plan.price}<span>${plan.period}</span></div>
          ${plan.perDomain ? `<div class="plan-per">${plan.perDomain}</div>` : ""}
          <ul>${plan.features.map((f) => `<li>${f}</li>`).join("")}</ul>
          <a href="${plan.ctaHref}" class="btn ${plan.featured ? "btn-primary" : "btn-ghost"} btn-block">${plan.cta}</a>`;
        plansGrid.appendChild(div);
        revealObserver.observe(div);
      });
      const noteEl = document.getElementById("plansNote");
      if (noteEl && note) noteEl.textContent = note;
    })
    .catch(() => {
      // in caso di errore la sezione resta vuota ma il resto del sito funziona
    });
}

// ================================================================
// Osservatorio — dati statici curati a mano, nessuna richiesta di
// rete a runtime (il sito resta senza cookie né chiamate a terzi:
// coerente con la cookie policy). Per aggiornare: modificare gli
// array qui sotto e la data in #osservatorio, niente altro.
// Tutte le voci citano la fonte pubblica da cui provengono.
// ================================================================

// ---------- Feed news (aggiornato a luglio 2026) ----------
const NEWS_ITEMS = [
  {
    date: "Giu 2026",
    tag: "Ransomware",
    title: "Italia: oltre 20 aziende colpite in un solo mese",
    text: "Ondata di rivendicazioni ransomware contro imprese italiane — manifattura, elettronica e food i settori più colpiti. Da inizio anno le rivendicazioni contro target italiani sono 116.",
    impact: "116 rivendicazioni nel 2026",
    source: "Bismark.it",
    url: "https://www.bismark.it/8859/ondata-di-ransomware-contro-le-imprese-italiane-oltre-20-aziende-colpite-a-giugno-2026",
  },
  {
    date: "Giu 2026",
    tag: "Data breach",
    title: "Foxconn conferma l'attacco alle fabbriche nordamericane",
    text: "Il gruppo Nitrogen rivendica il furto di 8 terabyte di dati sensibili dagli stabilimenti USA del colosso dell'elettronica.",
    impact: "8 TB di dati esfiltrati",
    source: "Tech.co",
    url: "https://tech.co/news/data-breaches-updated-list",
  },
  {
    date: "Apr 2026",
    tag: "Report",
    title: "Clusit: il 2025 è l'anno peggiore di sempre",
    text: "Oltre 500 attacchi gravi noti in Italia (+40% sul 2024), circa il 9,6% degli incidenti mondiali. Quasi una PMI su quattro ha subito una violazione negli ultimi tre anni.",
    impact: "+48,7% di incidenti nel mondo",
    source: "Rapporto Clusit 2026",
    url: "https://clusit.it/rapporto-clusit/",
  },
  {
    date: "Feb 2026",
    tag: "Trend",
    title: "Italia: incidenti cyber +60% in un mese",
    text: "Picco di attacchi e data breach notificati a febbraio; il cybercrime pesa per circa il 61% degli incidenti contro target italiani.",
    impact: "+60% in 30 giorni",
    source: "Analisi Difesa",
    url: "https://www.analisidifesa.it/2026/02/nuovi-attacchi-in-italia-notificati-data-breach-ai-e-cybersecurity/",
  },
  {
    date: "2026",
    tag: "Costi",
    title: "USA: perdite record da crimine informatico",
    text: "20,9 miliardi di dollari di perdite denunciate in un anno; il costo medio di un data breach supera i 4,4 milioni di dollari.",
    impact: "20,9 Mld $ di perdite",
    source: "Memeburn",
    url: "https://memeburn.com/cybersecurity-data-breach-statistics-2026/",
  },
  {
    date: "2026",
    tag: "Sanzioni",
    title: "Il riscatto da 12.000 € pagato quattro volte",
    text: "Studio professionale italiano colpito da ransomware: al riscatto si sommano sanzione del Garante, analisi forense e spese legali. Costo finale: 40-50.000 €.",
    impact: "≈ 50.000 € totali",
    source: "Onorato Informatica",
    url: "https://www.onoratoinformatica.it/ransomware-news-attack/attacchi-ransomware-aziende-italiane/",
  },
];

const feedEl = document.getElementById("newsFeed");
if (feedEl) {
  for (const item of NEWS_ITEMS) {
    const li = document.createElement("li");
    li.className = "news-item";
    li.innerHTML = `
      <div class="news-meta">
        <span class="news-date">${item.date}</span>
        <span class="news-tag">${item.tag}</span>
      </div>
      <h4 class="news-title">${item.title}</h4>
      <p class="news-text">${item.text}</p>
      <div class="news-foot">
        <span class="news-impact">💸 ${item.impact}</span>
        <a class="news-source" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.source} ↗</a>
      </div>`;
    feedEl.appendChild(li);
  }
}

// ---------- Grafico: attacchi gravi noti in Italia per anno ----------
// Fonte: Rapporti Clusit 2023-2026 (ogni rapporto copre l'anno precedente).
const ATTACKS_BY_YEAR = [
  { year: "2022", value: 188 },
  { year: "2023", value: 310 },
  { year: "2024", value: 357 },
  { year: "2025", value: 507 },
];

const barsEl = document.getElementById("obsBars");
if (barsEl) {
  const max = Math.max(...ATTACKS_BY_YEAR.map((d) => d.value));
  for (const d of ATTACKS_BY_YEAR) {
    const bar = document.createElement("div");
    bar.className = "bar";
    // altezza finale in custom property: l'animazione parte quando la
    // sezione entra in viewport (classe .grown aggiunta dall'observer).
    bar.style.setProperty("--h", `${Math.round((d.value / max) * 100)}%`);
    bar.innerHTML = `
      <span class="bar-val">${d.value}</span>
      <div class="bar-fill" role="img" aria-label="${d.year}: ${d.value} attacchi gravi noti"></div>
      <span class="bar-year">${d.year}</span>`;
    barsEl.appendChild(bar);
  }
  const barsObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        barsObserver.disconnect();
        barsEl.classList.add("grown");
      }
    },
    { threshold: 0.4 }
  );
  barsObserver.observe(barsEl);
}
