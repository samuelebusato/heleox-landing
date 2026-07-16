// HeleoX — blog: le notizie vivono in blog-posts.json.
//
// Per pubblicare una nuova news NON serve toccare questo file:
// aggiungi una voce IN CIMA all'array di blog-posts.json (la prima
// voce è la più recente). Campi:
//   date  — data leggibile, es. "16 luglio 2026"
//   tag   — categoria breve, es. "Rilascio", "Beta", "Guida"
//   title — titolo dell'articolo
//   text  — anteprima mostrata nella card (HTML semplice consentito)
//   body  — contenuto completo mostrato nel pop-up: array di paragrafi
//           (HTML semplice consentito: <strong>, <em>, <a>)
// La fetch è locale (stesso dominio): nessun servizio terzo, nessun cookie.

async function loadBlog() {
  const blogGrid = document.getElementById("blogGrid");
  if (!blogGrid) return;
  const blogEmpty = document.getElementById("blogEmpty");

  let posts = [];
  try {
    const res = await fetch("blog-posts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    posts = await res.json();
  } catch (err) {
    if (blogEmpty) {
      blogEmpty.textContent = "Impossibile caricare gli articoli — riprova più tardi.";
      blogEmpty.hidden = false;
    }
    return;
  }

  if (posts.length === 0 && blogEmpty) {
    blogEmpty.hidden = false;
    return;
  }

  // ---------- Pop-up dettaglio (dialog nativo: Esc gestito dal browser) ----------
  const blogModal = document.getElementById("blogModal");

  function openPost(post) {
    if (!blogModal) return;
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

  // ---------- Render delle card ----------
  for (const post of posts) {
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
    article.addEventListener("click", () => openPost(post));
    article.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPost(post);
      }
    });
    blogGrid.appendChild(article);
  }
}

loadBlog();
