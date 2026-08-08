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

// --- Endpoint dello scan-esca -------------------------------------
// ESCA_API_BASE: origine dell'API pubblica dello scan passivo (es.
// "https://api.heleox.it", o l'URL grezzo di API Gateway). VUOTO = endpoint
// non ancora configurato: la pagina degrada al comportamento onesto di prima
// — valida il dominio e rimanda all'app, senza mai fingere un risultato.
// Al deploy del backend si scrive qui l'origine e non serve altro.
// ?escaMock=1 nell'URL forza dati finti locali: solo per lo sviluppo e la
// verifica del layout, mai in produzione (in produzione l'URL non ha quel
// parametro, quindi il ramo mock non viene mai preso).
const ESCA_API_BASE = "https://cz5kpi7ce5.execute-api.eu-west-1.amazonaws.com";
const ESCA_MOCK = new URLSearchParams(location.search).has("escaMock");
const ESCA_POLL_MS = 2500;
const ESCA_TIMEOUT_MS = 155000; // i moduli Fargate (TLS, conformità) hanno spin-up + browser

// Moduli passivi mostrati nel report, nell'ordine in cui compaiono.
const ESCA_MODULI = {
  headers:    "Header di sicurezza",
  tls:        "TLS e certificato",
  subdomain:  "Sottodomini (Certificate Transparency)",
  compliance: "Cookie e conformità",
};
const ESCA_SEV_LABEL = { critical: "critico", high: "alto", medium: "medio", low: "basso", ok: "a posto", info: "nota" };
const ESCA_SEV_ICO   = { critical: "✕", high: "✕", medium: "!", low: "!", ok: "✓", info: "·" };

// Piccolo escape HTML: il dominio e i testi del report vengono da input e da
// una risposta di rete, quindi non entrano mai grezzi nel DOM.
function escaEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Punto d'ingresso, chiamato dall'invio del form nell'hero.
function avviaScanEsca(dominio, msg) {
  const report = document.getElementById("escaReport");
  // Endpoint non configurato e non in mock: nessun risultato finto. Si
  // dichiara cosa succede e si passa all'app, esattamente come prima.
  if (!ESCA_API_BASE && !ESCA_MOCK) {
    msg.hidden = false;
    msg.classList.remove("err");
    msg.innerHTML =
      `Dominio <strong>${escaEsc(dominio)}</strong> pronto per il controllo passivo. ` +
      `Lo scan pubblico senza registrazione sta arrivando: nel frattempo lo esegui ` +
      `— insieme ai moduli profondi — dentro l'app. ` +
      `<a href="https://app.heleox.it/?dominio=${encodeURIComponent(dominio)}" ` +
      `target="_blank" rel="noopener"><strong>Apri HeleoX su ${escaEsc(dominio)} →</strong></a>`;
    return;
  }
  msg.hidden = true;
  if (report) escaRun(dominio, report);
}

// Mostra il pannello, lo porta in vista, avvia scan e rendering.
async function escaRun(dominio, report) {
  const body = document.getElementById("escaBody");
  const stato = document.getElementById("escaState");
  const domEl = document.getElementById("escaDomain");
  if (domEl) domEl.textContent = dominio;

  report.hidden = false;
  escaSetCollapsed(false);
  requestAnimationFrame(() => report.classList.add("is-in"));
  report.querySelector(".esca-panel")?.scrollIntoView({
    behavior: REDUCE_MOTION ? "auto" : "smooth", block: "start",
  });
  if (stato) stato.textContent = "in corso";
  escaRenderRunning(body);

  try {
    const data = ESCA_MOCK ? await escaMock(dominio) : await escaFetch(dominio);
    if (data.status === "done") {
      if (stato) stato.textContent = "completato";
      escaRenderResult(body, data);
    } else {
      if (stato) stato.textContent = "errore";
      escaRenderError(body, data.message || "Il controllo non è andato a buon fine.");
    }
  } catch {
    if (stato) stato.textContent = "errore";
    escaRenderError(body, "Non è stato possibile completare il controllo. Riprova tra poco.");
  }
}

// Avvia lo scan (POST) e interroga lo stato (GET) finche' non e' pronto.
async function escaFetch(dominio) {
  const start = await fetch(ESCA_API_BASE + "/esca/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: dominio }),
  });
  if (start.status === 429)
    return { status: "error", message: "Troppi controlli in poco tempo. Riprova tra qualche minuto." };
  if (!start.ok) {
    // il backend spiega perché (dominio non valido, interno, non risolvibile):
    // si mostra il suo messaggio invece di uno generico.
    const body = await start.json().catch(() => ({}));
    return { status: "error", message: body.message || "Questo dominio non è controllabile." };
  }

  const { scan_id } = await start.json();
  const deadline = Date.now() + ESCA_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, ESCA_POLL_MS));
    let res;
    try { res = await fetch(`${ESCA_API_BASE}/esca/scan/${encodeURIComponent(scan_id)}`); }
    catch { continue; }
    // 4xx (es. 404 scan scaduto) è terminale: inutile insistere fino al timeout.
    // 5xx può essere transitorio: si riprova.
    if (res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => ({}));
      return { status: "error", message: body.message || "Il controllo non è più disponibile." };
    }
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === "done" || data.status === "error") return data;
    escaUpdateRunning(data);
  }
  return { status: "error", message: "Il controllo sta impiegando più del previsto. Riprova tra poco." };
}

// Stato "in corso": la lista dei moduli passivi.
function escaRenderRunning(body) {
  const passi = Object.entries(ESCA_MODULI).map(([k, v]) =>
    `<div class="esca-step" data-mod="${k}"><span class="s-ico" aria-hidden="true">·</span><span>${v}</span><span class="s-state">in coda</span></div>`
  ).join("");
  body.innerHTML =
    `<div class="esca-steps" role="status">${passi}</div>`;
}

// Segna come fatti i moduli che il backend riporta completati.
function escaUpdateRunning(data) {
  const done = new Set(data.progress?.modules_done || []);
  document.querySelectorAll(".esca-step").forEach((el) => {
    if (done.has(el.dataset.mod)) {
      el.classList.remove("run");
      el.classList.add("done");
      el.querySelector(".s-ico").textContent = "✓";
      el.querySelector(".s-state").textContent = "fatto";
    }
  });
}

// Report completo: sintesi (punteggio + fascia + conteggi), gruppi per
// modulo con voci apribili, blocco "sblocca con la verifica", CTA.
function escaRenderResult(body, data) {
  const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
  const band = String(data.band || "F").toUpperCase();
  const fcls = "f-" + band.toLowerCase();
  const c = data.counts || {};
  const findings = Array.isArray(data.findings) ? data.findings : [];

  const chip = (col, n, lab) => n ? `<span><i style="background:${col}"></i>${n} ${lab}</span>` : "";
  const counts =
    chip("var(--sev-hi)", (c.critical || 0) + (c.high || 0), "gravi") +
    chip("var(--sev-med)", (c.medium || 0) + (c.low || 0), "da sistemare") +
    chip("var(--sev-ok)", c.ok || 0, "a posto");

  // Quando il dominio reindirizza (tipico: apex → www) la misura avviene su
  // PIÙ host, e lo stesso rilievo può comparire due volte con lo stesso titolo.
  // Senza dire su quale host è stato misurato, quelle due righe si leggono come
  // un duplicato o un errore nostro — ed è invece l'informazione che serve per
  // sapere DOVE intervenire, visto che sono due server distinti con due
  // configurazioni distinte. L'host si mostra solo se ce n'è più d'uno: con un
  // host solo sarebbe una colonna sempre uguale, cioè rumore.
  const hosts = [...new Set(findings.map((f) => f.host).filter(Boolean))];
  const multiHost = hosts.length > 1;

  const perMod = {};
  findings.forEach((f) => { (perMod[f.modulo] ||= []).push(f); });
  const gruppi = Object.keys(ESCA_MODULI)
    .filter((k) => perMod[k]?.length)
    .map((k) => escaGroup(k, perMod[k], multiHost)).join("");

  const notaHost = multiHost
    ? `<p class="esca-hosts-note">
         Questo dominio <b>reindirizza</b>, quindi il controllo ha misurato
         ${hosts.length} host distinti: ${hosts.map((h) => `<code>${escaEsc(h)}</code>`).join(" e ")}.
         Sono server diversi con configurazioni diverse: un rilievo che compare
         due volte non è un doppione, va corretto su <b>entrambi</b>. Ogni voce
         indica l'host a cui si riferisce.
       </p>`
    : "";

  const locked = Array.isArray(data.locked) && data.locked.length
    ? escaLocked(data.locked, data.domain) : "";

  body.innerHTML =
    `<div class="esca-summary ${fcls}">
       <div class="esca-score">
         <div class="esca-ring" style="--v:${score}"><b>${score}</b></div>
         <div class="esca-band ${fcls}">${escaEsc(band)}<small>fascia</small></div>
       </div>
       <div class="esca-counts">${counts || '<span>nessun problema rilevato</span>'}</div>
     </div>
     ${notaHost}
     ${gruppi}
     ${locked}
     <div class="esca-foot">
       <span class="note">Controllo passivo su dato pubblico, come lo vedrebbe un browser. Nessuna sonda attiva sul sito.</span>
       <a class="btn btn-primary btn-sm" href="https://app.heleox.it/?dominio=${encodeURIComponent(data.domain || "")}" target="_blank" rel="noopener">Prova la versione plus gratuitamente →</a>
     </div>`;
}

function escaGroup(modulo, items, multiHost) {
  const voci = items.map((f) => escaItem(f, multiHost)).join("");
  return `<div class="esca-group">
    <div class="esca-group-head"><h5>${escaEsc(ESCA_MODULI[modulo] || modulo)}</h5><span class="g-count">${items.length}</span></div>
    ${voci}</div>`;
}

// Una voce = un <details>: apertura/chiusura accessibile, anche senza JS.
function escaItem(f, multiHost) {
  const sev = String(f.severita || "info").toLowerCase();
  // Nell'ELENCO, non solo nel dettaglio: due voci con lo stesso titolo devono
  // distinguersi senza doverle aprire una per una.
  const hostChip = multiHost && f.host
    ? `<span class="rep-host" title="Host su cui è stata fatta questa misura">${escaEsc(f.host)}</span>`
    : "";
  const hostRiga = f.host
    ? `<p class="rep-host-line">Misurato su <code>${escaEsc(f.host)}</code></p>`
    : "";
  const rem = f.remediation ? `<div class="rep-remedy"><span class="rep-remedy-label">Come si risolve</span><p>${escaEsc(f.remediation)}</p></div>` : "";
  const ref = f.riferimento ? `<p class="rep-ref">Riferimento: ${escaEsc(f.riferimento)}</p>` : "";
  const ev  = f.evidenza ? `<p class="rep-evidence">Evidenza: <code>${escaEsc(f.evidenza)}</code></p>` : "";
  return `<details class="rep-item rep-${escaEsc(sev)}">
    <summary>
      <span class="rep-ico" aria-hidden="true">${ESCA_SEV_ICO[sev] || "·"}</span>
      <span class="rep-title">${escaEsc(f.titolo || f.tipo || "Osservazione")}${hostChip}</span>
      <span class="rep-sev">${escaEsc(ESCA_SEV_LABEL[sev] || sev)}</span>
      <span class="rep-caret" aria-hidden="true"></span>
    </summary>
    <div class="rep-detail">
      ${hostRiga}
      <p class="rep-desc">${escaEsc(f.descrizione || "")}</p>
      ${rem}${ref}${ev}
    </div>
  </details>`;
}

function escaLocked(items, domain) {
  const li = items.map((l) => {
    const n = typeof l.count === "number" ? `<b>${l.count}</b> ` : "";
    const d = l.descrizione ? ` — ${escaEsc(l.descrizione)}` : "";
    return `<li><span class="lk" aria-hidden="true">+</span><span>${n}${escaEsc(l.titolo)}${d}</span></li>`;
  }).join("");
  return `<div class="esca-locked">
    <h5>Cosa sblocchi verificando la proprietà del dominio</h5>
    <ul>${li}</ul>
    <a class="btn btn-primary" href="https://app.heleox.it/?dominio=${encodeURIComponent(domain || "")}" target="_blank" rel="noopener">Prova la versione plus gratuitamente →</a>
  </div>`;
}

function escaRenderError(body, message) {
  body.innerHTML =
    `<div class="esca-error">${escaEsc(message)}</div>
     <div class="esca-foot">
       <span class="note">Il controllo gratuito è passivo e su alcuni domini può non riuscire.</span>
       <a class="btn btn-sm" href="#top">Prova con un altro dominio</a>
     </div>`;
}

// Pulsante che apre/chiude l'intero report (la testata resta sempre visibile).
function escaSetCollapsed(collapsed) {
  const btn = document.getElementById("escaCollapse");
  const body = document.getElementById("escaBody");
  if (!btn || !body) return;
  btn.setAttribute("aria-expanded", String(!collapsed));
  body.hidden = collapsed;
}
const escaCollapseBtn = document.getElementById("escaCollapse");
if (escaCollapseBtn) {
  escaCollapseBtn.addEventListener("click", () => {
    const expanded = escaCollapseBtn.getAttribute("aria-expanded") === "true";
    escaSetCollapsed(expanded);
  });
}

// --- Mock locale (solo con ?escaMock=1) ---------------------------
// Serve a verificare il layout del report senza backend. I moduli
// "completano" uno a uno, poi arriva un risultato realistico.
async function escaMock(dominio) {
  const wait = (ms) => new Promise((r) => setTimeout(r, REDUCE_MOTION ? 0 : ms));
  const done = [];
  for (const k of Object.keys(ESCA_MODULI)) {
    const el = document.querySelector(`.esca-step[data-mod="${k}"]`);
    if (el) { el.classList.add("run"); el.querySelector(".s-state").textContent = "in corso"; }
    await wait(700);
    done.push(k);
    escaUpdateRunning({ progress: { modules_done: done } });
  }
  await wait(350);
  return escaMockData(dominio);
}

function escaMockData(dominio) {
  return {
    status: "done", domain: dominio, score: 68, band: "C",
    counts: { critical: 0, high: 1, medium: 3, low: 2, ok: 2 },
    findings: [
      { modulo: "headers", tipo: "missing-csp", severita: "high", titolo: "Content-Security-Policy assente",
        descrizione: "La pagina non invia l'header Content-Security-Policy: il browser non ha una policy che limiti da dove possono arrivare script e risorse, quindi un'eventuale iniezione di codice non incontra questa barriera.",
        remediation: "Aggiungi un header Content-Security-Policy restrittivo, partendo da default-src 'self' e allargando solo alle origini che servono davvero. Evita 'unsafe-inline' e 'unsafe-eval'.",
        evidenza: "header assente sulla risposta di https://" + dominio + "/" },
      { modulo: "headers", tipo: "weak-hsts", severita: "medium", titolo: "HSTS con durata troppo breve",
        descrizione: "Strict-Transport-Security è presente ma con un max-age basso: la protezione contro il downgrade a HTTP dura troppo poco per essere efficace.",
        remediation: "Porta max-age ad almeno 15552000 (180 giorni) e aggiungi includeSubDomains.", evidenza: "max-age=3600" },
      { modulo: "headers", tipo: "missing-referrer", severita: "low", titolo: "Referrer-Policy assente",
        descrizione: "Senza Referrer-Policy il browser può inviare l'URL completo della pagina di provenienza a siti terzi.",
        remediation: "Imposta Referrer-Policy: strict-origin-when-cross-origin." },
      { modulo: "tls", tipo: "tls-1-0-enabled", severita: "medium", titolo: "Protocollo TLS 1.0 ancora attivo",
        descrizione: "Il server accetta ancora handshake TLS 1.0, un protocollo obsoleto e deprecato che indebolisce la cifratura.",
        remediation: "Disabilita TLS 1.0 e 1.1 nella configurazione del server o del CDN; lascia attivi solo TLS 1.2 e 1.3." },
      { modulo: "tls", tipo: "cert-expiring", severita: "low", titolo: "Certificato in scadenza tra 21 giorni",
        descrizione: "Il certificato TLS scade a breve. Se il rinnovo non è automatico, il sito diventerà irraggiungibile alla scadenza.",
        remediation: "Verifica che il rinnovo automatico (ACME/Let's Encrypt) sia attivo, o pianifica la sostituzione del certificato.", evidenza: "notAfter tra 21 giorni" },
      { modulo: "subdomain", tipo: "subdomain-count", severita: "ok", titolo: "7 sottodomini trovati nei log di trasparenza",
        descrizione: "Enumerazione passiva via Certificate Transparency (crt.sh): nessun traffico diretto verso i tuoi server, solo la lettura di ciò che è già pubblico.",
        remediation: "Rivedi periodicamente l'elenco: gli ambienti dimenticati (staging, test, api vecchie) sono un bersaglio frequente." },
      { modulo: "compliance", tipo: "cookie-before-consent", severita: "medium", titolo: "Cookie impostati prima del consenso",
        descrizione: "Alla prima visita, prima di qualsiasi interazione con il banner, la pagina ha già impostato 2 cookie non tecnici.",
        remediation: "Blocca i cookie non strettamente necessari finché l'utente non presta un consenso esplicito attraverso il banner.",
        riferimento: "art. 122 Codice Privacy (D.lgs. 196/2003) · Direttiva ePrivacy", evidenza: "_ga, _fbp presenti al primo caricamento" },
      { modulo: "compliance", tipo: "privacy-link-ok", severita: "ok", titolo: "Informativa privacy raggiungibile dal footer",
        descrizione: "Trovato un collegamento a una pagina di informativa privacy nel footer del sito.",
        remediation: "Assicurati che l'informativa sia aggiornata e copra tutti i trattamenti realmente effettuati.",
        riferimento: "artt. 13-14 GDPR" },
    ],
    locked: [
      { titolo: "Sottodomini rivendicabili da un estraneo (subdomain takeover)", count: 1 },
      { titolo: "Chiavi e segreti esposti nel JavaScript pubblico" },
      { titolo: "Form e parametri iniettabili (XSS, SQL injection)" },
      { titolo: "Cookie osservati prima del consenso, con evidenza e timestamp per il registro" },
      { titolo: "Confronto settimanale: non «com'è» oggi, ma «cos'è cambiato»" },
    ],
  };
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
