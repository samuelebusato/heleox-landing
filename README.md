# HeleoX — sito di presentazione

Sito statico (HTML/CSS/JS vanilla), senza cookie né richieste a servizi terzi.

## Stato: redesign pubblicato, con lo scan-esca vero (2026-08-08)

Il redesign del **2026-08-07** è stato unito a `main` e pubblicato il
**2026-08-08**, quando la condizione che lo teneva fermo è venuta meno: il
backend dello scan-esca esiste, è deployato e collaudato. La homepage espone un
campo «scrivi un dominio» che ora **produce un risultato vero**.

> La regola che ha tenuto il ramo fermo per un giorno era: *non unire finché il
> backend non esiste*, perché `main` va in produzione a ogni push e unirlo prima
> avrebbe pubblicato una promessa che il sito non manteneva. È stata rispettata,
> ed è il motivo per cui vale la pena riscriverla invece di cancellarla: se un
> domani si aggiunge un altro campo che promette un risultato, il criterio è lo
> stesso — prima il risultato esiste, poi lo si mette in homepage.

**Punto di integrazione dello scan**: `avviaScanEsca()` in [`script.js`](script.js),
agganciata all'API tramite la costante `ESCA_API_BASE` in cima al file. Se quella
costante venisse svuotata, la pagina **degrada in modo onesto** — valida il
dominio e rimanda all'app, senza mai fingere un risultato. `?escaMock=1` forza
dati finti per il solo sviluppo del layout.

## ⚠️ La cache di Cloudflare, e perché ogni asset ha `?v=N`

**Davanti a CloudFront c'è Cloudflare**, e il workflow di deploy invalida solo
CloudFront. Conseguenza misurata il **2026-08-08**: dopo la pubblicazione del
redesign il sito serviva i CSS nuovi ma il **JavaScript vecchio di undici
giorni** — `last-modified: 28 Jul`, `Age: 7717` — perché i CSS erano referenziati
come `home.css?v=5` (chiave di cache nuova → miss → file fresco) mentre gli
script erano `script.js` nudo, ancora in cache Cloudflare con `max-age=86400`.

L'effetto è particolarmente insidioso perché **il deploy risulta riuscito** e
l'origine è corretta: interrogando direttamente CloudFront il file era quello
nuovo. Solo passando dal dominio pubblico si vedeva quello vecchio. Il sintomo
per chi guarda il sito è "le animazioni non partono e lo scan non funziona",
cioè un guasto che sembra del codice e invece è di consegna.

**Regola**: ogni riferimento a un asset versionabile (`.css`, `.js`) porta un
`?v=N`, e **si incrementa N a ogni modifica di quel file**. L'HTML non ne ha
bisogno: il workflow lo carica con `no-cache`. Per verificare che una modifica
sia davvero arrivata al pubblico, confrontare `curl https://www.heleox.it/<file>`
con `curl https://d2n9o351dpmg7i.cloudfront.net/<file>`: se differiscono, è
cache Cloudflare, non un deploy fallito.

## Fogli di stile — tre file, un sistema solo

| File | Chi lo carica | Cosa contiene |
|---|---|---|
| [`base.css`](base.css) | **tutte** le pagine | caratteri, token, reset, tipografia, atmosfera, barra, bottoni, pannelli, piè di pagina, animazioni |
| [`home.css`](home.css) | solo `index.html` | ciò che esiste unicamente in prima pagina |
| [`pagina.css`](pagina.css) | moduli, blog, documenti legali | testata compatta, blocchi dei moduli, blog, impaginato dei documenti |

L'ordine conta: `base.css` **prima** dell'altro. `styles.css` è il vecchio
foglio e non è più caricato da nessuna pagina.

### Caratteri

Self-hosted in [`fonts/`](fonts/): **Bricolage Grotesque** per i titoli,
**Inter** per il testo, entrambi variabili col solo asse dei pesi (40 e 47 KB).
Licenze SIL accanto ai file. **Nessuna richiesta a Google Fonts**: la promessa
«nessun servizio terzo» del footer vale anche per i caratteri. Precaricati nel
`<head>` di ogni pagina, perché il browser li scoprirebbe solo dopo il CSS.

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

> **⚠️ Prezzi temporaneamente nascosti (da luglio 2026).** La sezione piani e
> ogni menzione dei prezzi sono nascoste con l'attributo `hidden` — nulla è
> stato eliminato, `plans.json` compreso. Al loro posto in homepage c'è la
> sezione **Demo** (`#demo`). Per riattivare i prezzi: cerca `PREZZI-TEMP` in
> tutti i file del sito e rimuovi gli attributi `hidden` marcati (nav di tutte
> le pagine, sezione `#piani`, etichette delle personas, riga prezzi della
> tabella confronto, box "Facciamo i conti", note "founding member"). La
> sezione Demo può restare o essere rimossa: non ha dipendenze. La regola
> `[hidden]` (ora in `base.css`) e il controllo in `script.js` possono restare.

### Osservatorio (grafico e "Ultime dal fronte")

Dati curati a mano negli array `NEWS_ITEMS` e `ATTACKS_BY_YEAR` in
[`script.js`](script.js), con la fonte citata su ogni voce.

## Sviluppo locale

Serve un qualsiasi server statico (le pagine caricano i JSON via `fetch`,
quindi `file://` non funziona):

```bash
npx serve .
```
