# HeleoX — sito di presentazione

Sito statico (HTML/CSS/JS vanilla), senza cookie né richieste a servizi terzi.

## Come aggiornare i contenuti

I contenuti che cambiano spesso vivono in file JSON: si modificano direttamente
da GitHub.com (icona matita sul file → commit) senza toccare HTML o JavaScript.
Al commit il sito viene ripubblicato automaticamente dall'hosting.

### Pubblicare una notizia sul blog — [`blog-posts.json`](blog-posts.json)

Aggiungi una voce **in cima** all'array (la prima è la più recente):

```json
{
  "date": "20 luglio 2026",
  "tag": "Rilascio",
  "title": "Titolo della notizia",
  "text": "Anteprima mostrata nella card della pagina blog.",
  "body": [
    "Primo paragrafo del dettaglio, mostrato nel pop-up.",
    "Secondo paragrafo. È consentito HTML semplice: <strong>, <em>, <a>."
  ]
}
```

Attenzione alla virgola tra una voce e l'altra: è l'errore più comune.

### Modificare i piani e i prezzi — [`plans.json`](plans.json)

Ogni piano ha `name`, `price`, `period`, `perDomain` (o `null`), `features`
(lista, HTML semplice consentito), `cta`, `ctaHref`, `featured` (evidenzia la
card, una sola a `true`) e `badge` (etichetta sopra la card, o `null`).
Il campo `note` in cima al file è la riga sotto le card.

### Osservatorio (grafico e "Ultime dal fronte")

Dati curati a mano negli array `NEWS_ITEMS` e `ATTACKS_BY_YEAR` in
[`script.js`](script.js), con la fonte citata su ogni voce.

## Sviluppo locale

Serve un qualsiasi server statico (le pagine caricano i JSON via `fetch`,
quindi `file://` non funziona):

```bash
npx serve .
```
