// HeleoX — blog: news relative all'applicazione.
//
// Per pubblicare una nuova news basta aggiungere una voce IN CIMA
// all'array BLOG_POSTS qui sotto (la prima voce è la più recente).
// Campi:
//   date  — data leggibile, es. "16 luglio 2026"
//   tag   — categoria breve, es. "Rilascio", "Beta", "Guida"
//   title — titolo dell'articolo
//   text  — anteprima mostrata nella card (HTML semplice consentito)
//   body  — contenuto completo mostrato nel pop-up: array di paragrafi
//           (HTML semplice consentito: <strong>, <em>, <a>)
// Nessuna richiesta di rete a runtime: il sito resta senza cookie.

const BLOG_POSTS = [
  {
    date: "16 luglio 2026",
    tag: "Beta",
    title: "La beta di HeleoX è aperta: 5 domini, tutto sbloccato",
    text: "Cerchiamo sviluppatori e agenzie che usino HeleoX su siti veri e ci dicano cosa migliorare. In cambio: <strong>5 domini, ogni funzionalità attiva, zero costi</strong>.",
    body: [
      "Cerchiamo sviluppatori e agenzie che usino HeleoX su siti veri e ci dicano cosa migliorare. In cambio: <strong>5 domini, ogni funzionalità attiva, zero costi</strong> — e prezzo founding member bloccato a vita (-40%) se poi decidi di restare.",
      "Durante la beta hai accesso a tutti i moduli: security headers, TLS e certificati, sottodomini dimenticati, chiavi e secret esposti, rilevamento XSS/SQLi e conformità GDPR a runtime con consigli di rimediazione che citano la norma esatta.",
      "I posti sono limitati ai primi 50 iscritti e non è richiesta alcuna carta di credito. Per candidarti scrivi a <a href='mailto:samuele.busato@heleox.it?subject=Beta%20HeleoX'>samuele.busato@heleox.it</a> oppure prova subito la dashboard su <a href='https://app.heleox.it' target='_blank' rel='noopener'>app.heleox.it</a>.",
    ],
  },
  {
    date: "10 luglio 2026",
    tag: "Rilascio",
    title: "Nuovo modulo: rilevamento subdomain takeover",
    text: "HeleoX ora enumera i sottodomini via Certificate Transparency e segnala quelli a rischio <strong>takeover</strong>.",
    body: [
      "HeleoX ora enumera i sottodomini dei tuoi domini in modo passivo, tramite i log pubblici di <strong>Certificate Transparency</strong> — senza generare traffico sospetto verso l'infrastruttura.",
      "Per ogni sottodominio trovato verifica se punta a un servizio dismesso o non reclamato (hosting, CDN, piattaforme SaaS): è lo scenario classico del <strong>subdomain takeover</strong>, in cui lo staging dimenticato di due anni fa può diventare una pagina di phishing a nome tuo.",
      "Il modulo è attivo da subito su tutti i piani che includono i moduli security completi. I sottodomini a rischio compaiono nel report settimanale con severità dedicata e istruzioni per la bonifica.",
    ],
  },
  {
    date: "1 luglio 2026",
    tag: "Prodotto",
    title: "I consigli di rimediazione ora citano la norma esatta",
    text: "Ogni finding GDPR è accompagnato da un consiglio pratico di rimediazione <strong>con la citazione dell'articolo di legge</strong>.",
    body: [
      "Ogni finding GDPR è ora accompagnato da un consiglio pratico di rimediazione <strong>con la citazione dell'articolo di legge</strong> a cui fa riferimento — ad esempio l'art. 122 del Codice Privacy per i cookie installati prima del consenso.",
      "Non una lista statica di cookie noti: HeleoX osserva il sito come un utente vero — cookie prima e dopo il consenso, richieste di rete reali — e collega ogni problema alla norma che lo rende sanzionabile.",
      "È il modo più rapido per spiegare al cliente <em>perché</em> qualcosa va sistemato, e la stessa citazione finisce nel report PDF che puoi girare al cliente finale così com'è. Nessun altro strumento lo fa.",
    ],
  },
];

// ---------- Render delle card ----------
const blogGrid = document.getElementById("blogGrid");
const blogEmpty = document.getElementById("blogEmpty");
if (blogGrid) {
  if (BLOG_POSTS.length === 0 && blogEmpty) {
    blogEmpty.hidden = false;
  }
  BLOG_POSTS.forEach((post, i) => {
    const article = document.createElement("article");
    article.className = "blog-card reveal visible";
    article.setAttribute("role", "button");
    article.setAttribute("tabindex", "0");
    article.setAttribute("aria-haspopup", "dialog");
    article.innerHTML = `
      <div class="news-meta">
        <span class="news-date">${post.date}</span>
        <span class="news-tag">${post.tag}</span>
      </div>
      <h3 class="blog-title">${post.title}</h3>
      <p class="blog-text">${post.text}</p>
      <span class="blog-more">Leggi tutto →</span>`;
    article.addEventListener("click", () => openPost(i));
    article.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPost(i);
      }
    });
    blogGrid.appendChild(article);
  });
}

// ---------- Pop-up dettaglio (dialog nativo: Esc gestito dal browser) ----------
const blogModal = document.getElementById("blogModal");

function openPost(index) {
  const post = BLOG_POSTS[index];
  if (!blogModal || !post) return;
  blogModal.querySelector(".modal-date").textContent = post.date;
  blogModal.querySelector(".modal-tag").textContent = post.tag;
  blogModal.querySelector(".modal-title").textContent = post.title;
  blogModal.querySelector(".modal-body").innerHTML = post.body
    .map((p) => `<p>${p}</p>`)
    .join("");
  blogModal.showModal();
}

if (blogModal) {
  blogModal.querySelector(".modal-close").addEventListener("click", () => blogModal.close());
  // click sul backdrop: il target è il <dialog> stesso, non il contenuto
  blogModal.addEventListener("click", (e) => {
    if (e.target === blogModal) blogModal.close();
  });
}
