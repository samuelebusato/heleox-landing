// HeleoX — recensioni.
//
// Le recensioni MOSTRATE vivono in recensioni.json: pubblichi solo quelle che
// approvi (moderazione curata). Per aggiungerne una NON serve toccare questo
// file — aggiungi una voce all'array di recensioni.json. Campi:
//   nome     — nome/etichetta di chi scrive (testo semplice)
//   stelle   — voto intero da 1 a 5
//   commento — testo della recensione (testo semplice)
//   data     — (opzionale) data leggibile, es. "agosto 2026"
//
// Il FORM "lascia una recensione" NON salva nulla e non traccia: compone
// un'email precompilata verso info@heleox.it (si apre il client di posta
// dell'utente). Coerente con la promessa del sito: nessun cookie, nessuna
// richiesta a terzi. La recensione viene pubblicata solo dopo verifica,
// aggiungendola a mano a recensioni.json.

(function () {
  "use strict";

  const EMAIL = "info@heleox.it";
  const MAX = 5;

  // ---------- Helper: riga di stelle (sola visualizzazione) ----------
  function starsMarkup(n) {
    const v = Math.max(0, Math.min(MAX, Math.round(n)));
    let out = "";
    for (let i = 1; i <= MAX; i++) {
      out += `<span class="star ${i <= v ? "on" : ""}" aria-hidden="true">★</span>`;
    }
    return out;
  }

  // ---------- Render elenco recensioni + riepilogo media ----------
  function renderReviews(list) {
    const grid = document.getElementById("reviewsGrid");
    const empty = document.getElementById("reviewsEmpty");
    const summary = document.getElementById("reviewsSummary");
    if (!grid) return;

    const valid = Array.isArray(list)
      ? list.filter((r) => r && r.nome && r.commento && Number(r.stelle) >= 1)
      : [];

    if (valid.length === 0) {
      if (empty) empty.hidden = false;
      if (summary) summary.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;

    // Riepilogo: media e conteggio
    if (summary) {
      const avg = valid.reduce((s, r) => s + Math.min(MAX, Number(r.stelle)), 0) / valid.length;
      const avgEl = document.getElementById("reviewsAvg");
      const starsEl = document.getElementById("reviewsAvgStars");
      const countEl = document.getElementById("reviewsCount");
      if (avgEl) avgEl.textContent = avg.toFixed(1).replace(".", ",");
      if (starsEl) starsEl.innerHTML = starsMarkup(avg);
      if (countEl) countEl.textContent = valid.length === 1 ? "1 recensione" : `${valid.length} recensioni`;
      summary.hidden = false;
    }

    for (const r of valid) {
      const stelle = Math.min(MAX, Number(r.stelle));
      const card = document.createElement("figure");
      card.className = "review-card";
      card.innerHTML = `
        <div class="review-stars" role="img" aria-label="${stelle} su ${MAX} stelle">${starsMarkup(stelle)}</div>
        <blockquote class="review-text">${escapeHtml(r.commento)}</blockquote>
        <figcaption class="review-author">
          <span class="review-name">${escapeHtml(r.nome)}</span>
          ${r.data ? `<span class="review-date">${escapeHtml(r.data)}</span>` : ""}
        </figcaption>`;
      grid.appendChild(card);
    }
  }

  // testo semplice: neutralizza eventuale HTML nei dati
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ---------- Selettore di stelle del form (radiogroup accessibile) ----------
  function buildStarInput() {
    const box = document.getElementById("rfStars");
    if (!box) return () => 0;
    let value = 0;
    const btns = [];

    function paint(hover) {
      const active = hover || value;
      btns.forEach((b, idx) => {
        b.classList.toggle("on", idx < active);
        b.setAttribute("aria-checked", String(idx + 1 === value));
        b.tabIndex = idx + 1 === (value || 1) ? 0 : -1;
      });
    }

    for (let i = 1; i <= MAX; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rf-star";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", i === 1 ? "1 stella" : `${i} stelle`);
      b.textContent = "★";
      b.addEventListener("click", () => { value = i; paint(); });
      b.addEventListener("mouseenter", () => paint(i));
      b.addEventListener("focus", () => paint(i));
      b.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); value = Math.min(MAX, (value || 0) + 1); paint(); btns[value - 1].focus(); }
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); value = Math.max(1, (value || 1) - 1); paint(); btns[value - 1].focus(); }
        else if (e.key === " " || e.key === "Enter") { e.preventDefault(); value = i; paint(); }
      });
      btns.push(b);
      box.appendChild(b);
    }
    box.addEventListener("mouseleave", () => paint());
    paint();
    return () => value;
  }

  // ---------- Form: compone l'email precompilata ----------
  function wireForm(getStars) {
    const form = document.getElementById("reviewForm");
    if (!form) return;
    const err = document.getElementById("rfError");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = (document.getElementById("rfName").value || "").trim();
      const commento = (document.getElementById("rfComment").value || "").trim();
      const stelle = getStars();

      if (!nome || !commento || stelle < 1) {
        if (err) {
          err.textContent = stelle < 1
            ? "Seleziona un voto da 1 a 5 stelle."
            : "Compila nome e commento per continuare.";
          err.hidden = false;
        }
        return;
      }
      if (err) err.hidden = true;

      const subject = `Recensione HeleoX — ${stelle} ${stelle === 1 ? "stella" : "stelle"}`;
      const body =
        `Nome: ${nome}\n` +
        `Valutazione: ${stelle}/${MAX} stelle\n\n` +
        `Commento:\n${commento}\n\n` +
        `— Inviato dal form recensioni di heleox.it`;
      window.location.href =
        `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      const ok = document.getElementById("rfOk");
      if (ok) ok.hidden = false;
    });
  }

  // ---------- Avvio ----------
  const getStars = buildStarInput();
  wireForm(getStars);

  fetch("recensioni.json", { cache: "no-cache" })
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then((list) => renderReviews(list))
    .catch(() => renderReviews([]));
})();
