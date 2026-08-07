// HeleoX — sito di presentazione: interazioni della homepage.
//
// Nessuna libreria e nessuna richiesta a domini terzi: entrate allo scroll,
// sequenza di scansione, anello del punteggio e grafico stanno in poche
// decine di righe di JavaScript nativo. E' una scelta, non una mancanza:
// un movimento *binario* o temporizzato non giustifica una dipendenza, e un
// CDN esterno contraddirebbe la promessa "nessuna richiesta a servizi terzi"
// scritta in footer.

// ---------- Interruttore generale del movimento ----------
// Lo stato "invisibile" delle entrate vive in CSS SOLO sotto `.anim`.
// Se il JavaScript non parte, o se l'utente ha chiesto meno movimento, la
// classe non viene aggiunta e la pagina e' gia' interamente visibile: mai
// una pagina bianca in attesa di un'animazione.
const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!REDUCE_MOTION) document.documentElement.classList.add("anim");

// ---------- Entrate allo scroll ----------
// Una sola volta per elemento (unobserve): un contenuto che rientra ogni
// volta che lo si riscorre e' fastidioso, non elegante.
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
document.querySelectorAll(".reveal, .stagger, .from-left, .from-right").forEach((el) =>
  revealObserver.observe(el)
);

// ---------- La barra si "posa" appena la pagina si muove ----------
// Un solo bit di stato (sopra/sotto i 12px), aggiornato in un listener
// passivo: nessun rAF, nessun lavoro mentre la pagina sta ferma.
const navBar = document.querySelector(".nav");
if (navBar) {
  const syncNav = () => navBar.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", syncNav, { passive: true });
  syncNav();
}

// ================================================================
// SCANNER ESCA (livello 0, gratuito e passivo)
// ----------------------------------------------------------------
// Interfaccia predisposta. Oggi la pagina valida il dominio e passa la
// mano all'app; quando l'endpoint pubblico esistera' bastera' riscrivere
// il CORPO di avviaScanEsca() — markup, validazione e messaggi non vanno
// toccati.
//
// Confine da non spostare quando si collega il backend: sul livello
// gratuito girano SOLO controlli passivi su dato pubblico. Sondare il
// bersaglio (sottodomini, secret, iniezioni, WAF) resta dietro la verifica
// di proprieta' del dominio: e' la linea legale, non una leva di prezzo.
// ================================================================

// Accetta "sito.it", "www.sito.it", "https://sito.it/pagina" e ne estrae
// l'host. Volutamente permissiva sull'input e severa sul risultato.
function normalizzaDominio(grezzo) {
  let s = (grezzo || "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // via lo schema, se c'e'
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.split("@").pop();                        // via un eventuale userinfo
  s = s.replace(/:\d+$/, "");                    // via la porta
  if (s.endsWith(".")) s = s.slice(0, -1);
  // etichette valide separate da punti, TLD di almeno due lettere
  const ok = /^(?=.{4,253}$)([a-z0-9](([a-z0-9-]{0,61})[a-z0-9])?\.)+[a-z]{2,}$/.test(s);
  return ok ? s : null;
}

function avviaScanEsca(dominio, msg) {
  // --- PUNTO DI INTEGRAZIONE ---------------------------------------
  // Qui andra' la chiamata all'endpoint pubblico dello scan passivo, e il
  // rendering dei risultati sotto il form. Fino ad allora si dichiara cosa
  // succede e si passa all'app: nessun risultato finto, nessuna barra di
  // avanzamento che non avanza.
  msg.hidden = false;
  msg.classList.remove("err");
  msg.innerHTML =
    `Dominio <strong>${dominio}</strong> pronto per il controllo passivo. ` +
    `Lo scan pubblico senza registrazione sta arrivando: nel frattempo lo esegui ` +
    `— insieme ai moduli profondi — dentro l'app. ` +
    `<a href="https://app.heleox.it/?dominio=${encodeURIComponent(dominio)}" ` +
    `target="_blank" rel="noopener"><strong>Apri HeleoX su ${dominio} →</strong></a>`;
}

const scanForm = document.getElementById("scanForm");
if (scanForm) {
  const input = document.getElementById("scanDomain");
  const msg = document.getElementById("scanMsg");
  scanForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const dominio = normalizzaDominio(input.value);
    if (!dominio) {
      msg.hidden = false;
      msg.classList.add("err");
      msg.textContent = "Non riconosco un dominio valido. Scrivilo così: ilmiosito.it";
      input.focus();
      return;
    }
    input.value = dominio;
    avviaScanEsca(dominio, msg);
  });
}

// ---------- Avanzamento della lettura ----------
// Dove il browser supporta le animazioni legate allo scroll la barra e'
// gestita interamente in CSS (fuori dal thread principale) e qui non si fa
// nulla. Altrove si aggiorna una variabile CSS a ogni scroll.
const supportsScrollTimeline = CSS.supports("animation-timeline: scroll()");
const progressEl = document.querySelector(".progress");
if (progressEl && !supportsScrollTimeline) {
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
    progressEl.style.setProperty("--p", String(p));
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress, { passive: true });
  updateProgress();
}

// ---------- Menu mobile (hamburger) ----------
// Su mobile .nav-links e' nascosto e compare come pannello quando .nav ha
// .open. Chiusura: tocco su un link, Escape, o tocco fuori dal menu.
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
  navEl.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", closeNav));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
  document.addEventListener("click", (e) => {
    if (navEl.classList.contains("open") && !navEl.contains(e.target)) closeNav();
  });
}

// ---------- Dropdown "Moduli" nella nav ----------
// L'apertura al passaggio del mouse e' gia' gestita in CSS (:hover /
// :focus-within); il click serve per il touch e per chi preferisce cliccare.
document.querySelectorAll(".nav-drop").forEach((drop) => {
  const toggle = drop.querySelector(".nav-drop-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.classList.toggle("open");
  });
  document.addEventListener("click", (e) => { if (!drop.contains(e.target)) drop.classList.remove("open"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") drop.classList.remove("open"); });
});

// ================================================================
// LA FIRMA — questa pagina si controlla da sola
// ----------------------------------------------------------------
// I controlli qui sotto girano DAVVERO, nel browser del visitatore,
// sulla pagina che sta leggendo. Nessun valore e' precompilato: se un
// controllo va male, il pannello lo dice. Un pannello verde per
// costruzione non sarebbe una prova, sarebbe un'altra grafica.
//
// Nulla esce dalla pagina: sono tutte letture locali (document.cookie,
// gli storage, il Resource Timing gia' registrato dal browser) piu' una
// sola richiesta HEAD alla pagina stessa, stesso dominio.
// ================================================================

// I cinque header che guardiamo, nell'ordine in cui contano
const SEC_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
];

const CHECKS = {
  // Connessione cifrata
  tls() {
    const https = location.protocol === "https:";
    return https
      ? { esito: "ok", val: "https" }
      : { esito: "warn", val: location.protocol.replace(":", "") };
  },

  // Cookie realmente impostati su questa pagina
  cookie() {
    const n = document.cookie.split(";").map((c) => c.trim()).filter(Boolean).length;
    return { esito: n === 0 ? "ok" : "warn", val: n === 0 ? "nessuno" : `${n}` };
  },

  // Dati lasciati nel browser
  storage() {
    let n = 0;
    try { n += localStorage.length + sessionStorage.length; }
    catch { return { esito: "warn", val: "non leggibile" }; }
    return { esito: n === 0 ? "ok" : "warn", val: n === 0 ? "nessuno" : `${n} chiavi` };
  },

  // Richieste partite verso domini diversi da questo
  terze() {
    const origini = new Set();
    for (const r of performance.getEntriesByType("resource")) {
      try {
        const o = new URL(r.name).origin;
        if (o !== location.origin) origini.add(o);
      } catch { /* URL non parsabile: si ignora, non si conta */ }
    }
    const n = origini.size;
    return { esito: n === 0 ? "ok" : "bad", val: n === 0 ? "nessuna" : `${n}` };
  },

  // Header di sicurezza: una sola HEAD sulla pagina stessa (stesso dominio,
  // quindi gli header sono leggibili). E' l'unica richiesta che facciamo.
  async headers() {
    let res;
    try { res = await fetch(location.href, { method: "HEAD", cache: "no-store" }); }
    catch { return { esito: "warn", val: "non verificabile" }; }
    const presenti = SEC_HEADERS.filter((h) => res.headers.get(h));
    const n = presenti.length;
    const hint = document.getElementById("auditHeadersHint");
    if (hint && n) hint.textContent = presenti.join(", ");
    return { esito: n >= 5 ? "ok" : n >= 3 ? "warn" : "bad", val: `${n}/5` };
  },
};

async function runAudit() {
  const panel = document.getElementById("audit");
  if (!panel) return;
  const rows = [...panel.querySelectorAll(".audit-row")];
  const stateText = document.getElementById("auditStateText");
  const clock = document.getElementById("auditClock");
  const foot = document.getElementById("auditFoot");
  const pausa = (ms) => new Promise((r) => setTimeout(r, REDUCE_MOTION ? 0 : ms));

  if (stateText) stateText.textContent = "in corso";
  await pausa(500);

  for (const row of rows) {
    const check = CHECKS[row.dataset.check];
    const val = row.querySelector(".audit-val");
    row.classList.add("is-in", "is-checking");
    if (val) val.textContent = "…";
    await pausa(380);

    let esito = { esito: "warn", val: "—" };
    try { esito = await check(); }
    catch { /* un controllo che esplode resta "—": mai un verde inventato */ }

    row.classList.remove("is-checking");
    row.classList.add(esito.esito);
    if (val) val.textContent = esito.val;
    row.querySelector(".audit-ico").textContent =
      esito.esito === "ok" ? "✓" : esito.esito === "warn" ? "!" : "✕";
    await pausa(140);
  }

  if (clock) clock.textContent = "alle " + new Date().toLocaleTimeString("it-IT");
  if (stateText) stateText.textContent = "completato";
  if (foot) foot.classList.add("is-in");
}

const auditPanel = document.getElementById("audit");
if (auditPanel) {
  if (REDUCE_MOTION) {
    runAudit();
  } else {
    const auditObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          auditObserver.disconnect();
          runAudit();
        }
      },
      { threshold: 0.25 }
    );
    auditObserver.observe(auditPanel);
  }
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
      if (REDUCE_MOTION) {
        el.textContent = target.toFixed(decimals).replace(".", ",");
        continue;
      }
      const duration = 1400;
      const start = performance.now();
      (function tick(now) {
        const t = Math.min(((now || start) - start) / duration, 1);
        el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(decimals).replace(".", ",");
        if (t < 1) requestAnimationFrame(tick);
      })(start);
    }
  },
  { threshold: 0.6 }
);
document.querySelectorAll(".counter").forEach((el) => counterObserver.observe(el));

// ---------- Piani (sezione #piani) ----------
// I dati vivono in plans.json: per cambiare prezzi, domini o feature basta
// modificare quel file. La fetch e' locale (stesso dominio): nessun servizio
// terzo, nessun cookie.
const plansGrid = document.getElementById("plansGrid");
// PREZZI-TEMP: se la sezione piani e' nascosta (attributo hidden su un
// antenato) si salta la fetch — nessuna richiesta inutile.
if (plansGrid && !plansGrid.closest("[hidden]")) {
  fetch("plans.json", { cache: "no-cache" })
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
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
          <a href="${plan.ctaHref}" class="btn ${plan.featured ? "btn-primary" : ""} btn-block">${plan.cta}</a>`;
        plansGrid.appendChild(div);
        revealObserver.observe(div);
      });
      const noteEl = document.getElementById("plansNote");
      if (noteEl && note) noteEl.textContent = note;
    })
    .catch(() => { /* in caso di errore la sezione resta vuota, il resto funziona */ });
}

// ================================================================
// Osservatorio — dati statici curati a mano, nessuna richiesta di
// rete a runtime (il sito resta senza cookie ne' chiamate a terzi:
// coerente con la cookie policy). Per aggiornare: modificare gli
// array qui sotto e la data in #perche, niente altro.
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
        <span class="news-impact">${item.impact}</span>
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
      <span class="bar-val num">${d.value}</span>
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
