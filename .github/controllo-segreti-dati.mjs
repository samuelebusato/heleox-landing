#!/usr/bin/env node
// controllo-segreti-dati.mjs — Ferma i segreti e i dati veri prima che arrivino su GitHub.
//
// La regola: Rule/regole-sviluppo-sicuro.md §9 (i segreti) e Rule/regole-dati-sensibili.md DS1 (i
// dati veri: mai in git né nella CI di GitHub). Il controllo gira tre volte:
//   1. prima del commit e 2. prima del push, dagli hook che Code/setup-dispositivo.mjs installa
//      nei progetti, con QUESTO file, l'originale del brain;
//   3. nella pipeline dei progetti che hanno una CI, con una COPIA di questo file in .github/,
//      perché la pipeline di un progetto non vede il brain. Lì, accanto, gira anche gitleaks.
// La copia si aggiorna da qui (--copia). Chi lancia l'originale su un progetto è avvisato se la
// copia del progetto è diversa.
//
// Uso, dalla cartella del repository (oppure con --repo <cartella>):
//   node controllo-segreti-dati.mjs --staged            i file del commit che si sta facendo
//   node controllo-segreti-dati.mjs --push              i commit del push (le righe del pre-push, su stdin)
//   node controllo-segreti-dati.mjs --intervallo A..B   i commit dell'intervallo
//   node controllo-segreti-dati.mjs --albero            tutti i file di HEAD
//   node controllo-segreti-dati.mjs --storia            ogni contenuto mai committato, su ogni ramo (la pipeline)
//   node controllo-segreti-dati.mjs --copia <repo>      porta questo file in <repo>/.github/
// Esce con 0 se è tutto a posto, 1 se ha trovato qualcosa, 2 per un errore d'uso o di configurazione.
//
// Le eccezioni stanno nel progetto, in .github/controllo-segreti-dati.json:
//   { "eccezioni": [ { "percorso": "tests/**", "regole": ["assegnazione-segreto"], "perche": "…" } ] }
//   - percorso: un file o un modello (* dentro una cartella, ** attraverso le cartelle);
//   - regole: i nomi fra parentesi quadre nel rapporto, oppure ["*"];
//   - perche: obbligatorio, almeno 10 caratteri: chi legge deve capire perché non è un problema;
//   - facoltativi, per stringere: «impronta» (le 12 cifre che il rapporto stampa accanto a un segreto:
//     ammette quel valore e nessun altro), «contenuto» (lo sha che --storia stampa: ammette quella
//     versione del file e nessun'altra), «fino» (AAAA-MM-GG: dopo, l'eccezione è un errore).
//   Un'eccezione che --albero o --storia non usano mai si segnala, perché la si tolga.
//
// I criteri di accettazione, scritti prima del codice (regole-sviluppo-sicuro.md §4, passo 0):
//   C1 un segreto (chiave privata, token di un servizio noto, password in una stringa di connessione o
//      assegnata a un nome da segreto, un file .env o di chiavi) ferma il commit, col file e la riga;
//   C2 un file di dati (database, backup, foglio di calcolo, dati tabellari grandi), un file in una
//      cartella di dati, o un file oltre i 10 MB, ferma il commit;
//   C3 dati personali ne fermano il commit: un codice fiscale o un IBAN validi, o almeno 5 email o
//      5 telefoni diversi nello stesso file;
//   C4 il segreto non si stampa mai per intero, e i dati personali trovati non si stampano;
//   C5 le eccezioni stanno nel progetto, in .github/controllo-segreti-dati.json, ognuna col suo perché:
//      un'eccezione senza perché, o scaduta, è un errore;
//   C6 un commit fatto con --no-verify si ferma al push; un push fatto con --no-verify, nella pipeline;
//   C7 gira uguale su Windows e su macOS, con node e git e nient'altro;
//   C8 ogni regola ha un test che la fa scattare e uno che non la fa scattare
//      (Code/controllo-segreti-dati.test.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QUESTO_FILE = fileURLToPath(import.meta.url);
const COPIA = '.github/controllo-segreti-dati.mjs';
const ECCEZIONI = '.github/controllo-segreti-dati.json';
const MB = 1024 * 1024;
const LIMITE_FILE = 10 * MB;        // oltre, un file è troppo grande per stare in git, qualunque cosa sia
const LIMITE_TABELLARE = 1 * MB;    // oltre, un .csv, un .tsv o un .sql è un'esportazione di dati
const LIMITE_LETTURA = LIMITE_FILE; // ogni file che non è già «grande» si legge: un'esportazione JSON da 5 MB è dati
const LOTTO = 64 * MB;              // i contenuti si leggono a lotti di questa dimensione, per non tenere tutto in memoria
const SOGLIA_QUANTITA = 5;          // email o telefoni diversi nello stesso file: da qui sono un elenco di persone
const ZERI = /^0+$/;

// --- Le regole ---------------------------------------------------------------------------------

const ESTENSIONI_DATI = new Set(['.bak', '.bacpac', '.mdf', '.ldf', '.ndf', '.trn', '.dmp', '.sqlite', '.sqlite3',
  '.db', '.mdb', '.accdb', '.dbf', '.pst', '.ost']);
const ESTENSIONI_FOGLI = new Set(['.xls', '.xlsx', '.xlsm', '.ods']);
const ESTENSIONI_TABELLARI = new Set(['.csv', '.tsv', '.sql']);
const ESTENSIONI_CHIAVI = new Set(['.key', '.p12', '.pfx', '.ppk', '.jks', '.keystore', '.kdbx']);
const NOMI_CHIAVI = new Set(['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']);
const CARTELLE_DATI = new Set(['lavoro', 'dati-veri', 'dump', 'dumps', 'backup', 'backups']);
const SUFFISSI_ESEMPIO = /\.(example|sample|template|esempio|modello)$/i;

const DESCRIZIONI = {
  'file-env': 'un file d\'ambiente: contiene i segreti di chi lo usa',
  'file-chiave': 'un file di chiavi o di password',
  'file-dati': 'un file di database o di backup',
  'foglio-di-calcolo': 'un foglio di calcolo: è il modo più comune di portare fuori dei dati',
  'dati-tabellari': 'dati tabellari oltre 1 MB: un\'esportazione',
  'cartella-dati': 'un file in una cartella di dati',
  'file-grande': 'un file oltre i 10 MB',
  'chiave-privata': 'una chiave privata',
  'token-noto': 'il token di un servizio',
  'stringa-connessione': 'una password in una stringa di connessione',
  'assegnazione-segreto': 'un valore assegnato a un nome da segreto',
  'jwt-service-role': 'una chiave Supabase «service_role»',
  'codice-fiscale': 'un codice fiscale valido',
  'iban': 'un IBAN valido',
  'email-in-quantita': `almeno ${SOGLIA_QUANTITA} indirizzi email diversi`,
  'telefono-in-quantita': `almeno ${SOGLIA_QUANTITA} numeri di telefono diversi`,
};
const REGOLE = Object.keys(DESCRIZIONI);
const DATI_PERSONALI = new Set(['codice-fiscale', 'iban', 'email-in-quantita', 'telefono-in-quantita']);

// Le regole sul percorso e sulla dimensione: valgono anche per i file che non si leggono.
function regoleDelPercorso(percorso, dimensione) {
  const trovati = [];
  const base = path.posix.basename(percorso);
  const minuscolo = base.toLowerCase();
  const est = path.posix.extname(minuscolo);
  const cartelle = percorso.toLowerCase().split('/').slice(0, -1);
  const env = minuscolo === '.env' || minuscolo.startsWith('.env.') || est === '.env';
  if (env && !SUFFISSI_ESEMPIO.test(minuscolo)) trovati.push({ regola: 'file-env' });
  if (ESTENSIONI_CHIAVI.has(est) || NOMI_CHIAVI.has(minuscolo)) trovati.push({ regola: 'file-chiave' });
  if (ESTENSIONI_DATI.has(est)) trovati.push({ regola: 'file-dati' });
  if (ESTENSIONI_FOGLI.has(est)) trovati.push({ regola: 'foglio-di-calcolo' });
  if (ESTENSIONI_TABELLARI.has(est) && dimensione > LIMITE_TABELLARE) trovati.push({ regola: 'dati-tabellari' });
  if (cartelle.some((c) => CARTELLE_DATI.has(c))) trovati.push({ regola: 'cartella-dati' });
  if (dimensione > LIMITE_FILE) trovati.push({ regola: 'file-grande', dettaglio: `${(dimensione / MB).toFixed(1)} MB` });
  return trovati;
}

const TOKEN_NOTI = [
  ['GitHub', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ['GitHub', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],
  ['AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['Slack', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g],
  ['Stripe', /\b[sr]k_live_[0-9A-Za-z]{20,}\b/g],
  ['Google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['OpenAI', /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g],
  ['OpenAI', /\bsk-[A-Za-z0-9]{48}\b/g],
  ['Resend', /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}\b/g],
  ['npm', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['SendGrid', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g],
];

// Un valore che dice di essere un segnaposto non è un segreto.
const SEGNAPOSTO = /^(?:\$\{|\$\(|\$[A-Z_]|<|\{\{|%|process\.env|env\.|x{3,}|\*{3,}|\.{3})|changeme|cambiami|example|esempio|placeholder|dummy|redacted|your[_-]|tuo[_-]|inserisci|^password$|^secret$/i;

function sembraSegreto(valore) {
  if (valore.length < 8 || SEGNAPOSTO.test(valore)) return false;
  // Un indirizzo o un percorso non è un segreto: «tokenUrl: 'https://…'», «/oauth2/token».
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|\/|\.\.?\/)/i.test(valore)) return false;
  // Nemmeno un pezzo di codice concatenato: «'SECRET='+require('crypto')…».
  if (/^\+|\($/.test(valore)) return false;
  // Un identificatore (lettere, _, ., -) è un nome, non un segreto: «gamma_token», «Authorization».
  return /[0-9]/.test(valore) || /[^A-Za-z0-9_.\-]/.test(valore);
}

// L'impronta di un valore: le prime 12 cifre del suo SHA-256. Dice se due segreti sono lo stesso
// senza rivelarli, e un'eccezione la può usare per ammettere quel valore e nessun altro.
const impronta = (valore) => createHash('sha256').update(valore).digest('hex').slice(0, 12);

function maschera(valore) {
  return `${valore.slice(0, 4)}… (${valore.length} caratteri), impronta ${impronta(valore)}`;
}

// Il codice fiscale delle persone fisiche, con l'omocodia, e il suo carattere di controllo.
const CF = /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/g;
const CF_DISPARI = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9,
  F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10,
  W: 22, X: 25, Y: 24, Z: 23 };
function codiceFiscaleValido(cf) {
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i];
    if (i % 2 === 0) somma += CF_DISPARI[c];
    else somma += /[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (somma % 26)) === cf[15];
}

// L'IBAN, coi paesi più vicini e la loro lunghezza, e il controllo modulo 97.
const IBAN_LUNGHEZZE = { IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, ES: 24, GB: 22, CH: 21, AT: 20, NL: 18, BE: 16,
  LU: 20, PT: 25, IE: 22, PL: 28, SI: 19, HR: 21, MT: 31, GR: 27, CZ: 24, SK: 24, HU: 28, RO: 24, DK: 18, SE: 24,
  FI: 18, NO: 15, LI: 21, MC: 27 };
const IBAN = /\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g;
function ibanValido(testo) {
  const iban = testo.replace(/ /g, '');
  if (IBAN_LUNGHEZZE[iban.slice(0, 2)] !== iban.length) return false;
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const c of riordinato) {
    const v = /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1;
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const DOMINI_FINTI = /(^|\.)(example\.(com|org|net)|example|test|invalid|local|localhost|users\.noreply\.github\.com)$/i;
const NON_DOMINI = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|ts|tsx|jsx|json|md|html?)$/i;
// Un telefono è: col prefisso +39 o 0039; un cellulare con uno spazio o un trattino in mezzo; un fisso
// con uno spazio, un trattino o una barra dopo il prefisso; un cellulare di dieci cifre attaccate.
// Il punto non separa: i decimali (coordinate degli SVG, statistiche) sembrerebbero telefoni. E i
// confini sono lettere, cifre, punti e segni: dentro una stringa base64 (i lockfile ne sono pieni),
// dopo una virgola decimale o in un numero negativo, una sequenza di cifre non è un telefono.
const TELEFONO = /(?<![\w.+-])(?:(?:\+|00)39[ .-]?(?:3\d{2}|0\d{1,3})[ .-]?\d{3}[ .-]?\d{3,4}|3\d{2}[ -]\d{3}[ -]?\d{3,4}|0\d{1,3}[ /-]\d{5,8}|3\d{9})(?![\w.])/g;

// Le regole sul contenuto. Ognuna dà le righe, e mai il valore per intero.
function regoleDelContenuto(testo) {
  const trovati = [];
  const inizi = [0];
  for (let i = 0; i < testo.length; i++) if (testo.charCodeAt(i) === 10) inizi.push(i + 1);
  const riga = (indice) => {
    let basso = 0, alto = inizi.length - 1;
    while (basso < alto) { const m = (basso + alto + 1) >> 1; if (inizi[m] <= indice) basso = m; else alto = m - 1; }
    return basso + 1;
  };

  for (const m of testo.matchAll(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g)) {
    const chiave = testo.slice(m.index, m.index + 400); // l'intestazione e l'inizio della chiave: bastano a distinguerla
    trovati.push({ regola: 'chiave-privata', riga: riga(m.index), impronta: impronta(chiave), dettaglio: `impronta ${impronta(chiave)}` });
  }
  for (const [servizio, re] of TOKEN_NOTI) {
    for (const m of testo.matchAll(re)) trovati.push({ regola: 'token-noto', riga: riga(m.index), impronta: impronta(m[0]), dettaglio: `${servizio}, ${maschera(m[0])}` });
  }
  for (const m of testo.matchAll(/\b(?:password|pwd)\s*=\s*([^;'"`\s]+)/gi)) {
    const inizioRiga = inizi[riga(m.index) - 1];
    const contesto = testo.slice(inizioRiga, testo.indexOf('\n', m.index) === -1 ? undefined : testo.indexOf('\n', m.index));
    if (/(server|data source|uid|user id|host|database|initial catalog)\s*=/i.test(contesto) && !SEGNAPOSTO.test(m[1]) && m[1].length >= 4) {
      trovati.push({ regola: 'stringa-connessione', riga: riga(m.index), impronta: impronta(m[1]), dettaglio: maschera(m[1]) });
    }
  }
  for (const m of testo.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"`]+:([^\s@/'"`]+)@[^\s/'"`]+/gi)) {
    if (!SEGNAPOSTO.test(m[1]) && m[1].length >= 4) trovati.push({ regola: 'stringa-connessione', riga: riga(m.index), impronta: impronta(m[1]), dettaglio: maschera(m[1]) });
  }
  // Il valore senza spazi: con gli spazi è un messaggio dell'interfaccia («La password è errata»).
  const NOME = /\b[A-Za-z_]*(?:password|passwd|pwd|secret|token|api_?key|apikey|access_?key|client_?secret|private_?key|segreto)[A-Za-z0-9_]*["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi;
  for (const m of testo.matchAll(NOME)) {
    if (sembraSegreto(m[1])) trovati.push({ regola: 'assegnazione-segreto', riga: riga(m.index), impronta: impronta(m[1]), dettaglio: maschera(m[1]) });
  }
  for (const m of testo.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const corpo = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (corpo && corpo.role === 'service_role') trovati.push({ regola: 'jwt-service-role', riga: riga(m.index), impronta: impronta(m[0]), dettaglio: `impronta ${impronta(m[0])}` });
    } catch { /* non è un JWT leggibile: le chiavi «anon» di Supabase sono pubbliche per scelta */ }
  }
  for (const m of testo.matchAll(CF)) {
    if (codiceFiscaleValido(m[0])) trovati.push({ regola: 'codice-fiscale', riga: riga(m.index) });
  }
  for (const m of testo.matchAll(IBAN)) {
    if (ibanValido(m[0])) trovati.push({ regola: 'iban', riga: riga(m.index) });
  }
  const email = new Set();
  for (const m of testo.matchAll(EMAIL)) {
    const dominio = m[0].split('@')[1];
    if (!DOMINI_FINTI.test(dominio) && !NON_DOMINI.test(dominio)) email.add(m[0].toLowerCase());
  }
  if (email.size >= SOGLIA_QUANTITA) trovati.push({ regola: 'email-in-quantita', dettaglio: `${email.size} indirizzi` });
  const telefoni = new Set();
  for (const m of testo.matchAll(TELEFONO)) telefoni.add(m[0].replace(/\D/g, '').replace(/^(?:00)?39(?=\d{9,10}$)/, ''));
  if (telefoni.size >= SOGLIA_QUANTITA) trovati.push({ regola: 'telefono-in-quantita', dettaglio: `${telefoni.size} numeri` });
  return trovati;
}

// --- Le eccezioni ------------------------------------------------------------------------------

function globInRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// La data di oggi, locale (sv-SE scrive AAAA-MM-GG): una scadenza vale fino alla fine del giorno italiano.
const oggiLocale = () => new Date().toLocaleDateString('sv-SE');

// testo: il contenuto del file delle eccezioni da usare; se manca, quello della cartella di lavoro.
// Prima del commit si usa quello dell'indice: vale l'eccezione che entra nel commit, non una lasciata fuori.
function leggiEccezioni(repo, oggi = oggiLocale(), testo) {
  const file = path.join(repo, ECCEZIONI);
  if (testo === undefined) {
    if (!fs.existsSync(file)) return { eccezioni: [], errori: [] };
    testo = fs.readFileSync(file, 'utf8');
  }
  if (testo === null) return { eccezioni: [], errori: [] };
  let dati;
  try { dati = JSON.parse(testo); } catch (e) {
    return { eccezioni: [], errori: [`${ECCEZIONI} non è un JSON valido: ${e.message}`] };
  }
  const errori = [];
  const eccezioni = [];
  (Array.isArray(dati.eccezioni) ? dati.eccezioni : []).forEach((e, i) => {
    const dove = `${ECCEZIONI}, eccezione ${i + 1}`;
    if (!e || typeof e.percorso !== 'string' || !e.percorso) { errori.push(`${dove}: manca «percorso»`); return; }
    if (!Array.isArray(e.regole) || !e.regole.length) { errori.push(`${dove} (${e.percorso}): manca «regole»`); return; }
    const sconosciute = e.regole.filter((r) => r !== '*' && !REGOLE.includes(r));
    if (sconosciute.length) { errori.push(`${dove} (${e.percorso}): regole sconosciute: ${sconosciute.join(', ')}`); return; }
    if (typeof e.perche !== 'string' || e.perche.trim().length < 10) { errori.push(`${dove} (${e.percorso}): manca «perche», o è troppo corto`); return; }
    if (e.fino && !/^\d{4}-\d{2}-\d{2}$/.test(e.fino)) { errori.push(`${dove} (${e.percorso}): «fino» va scritto AAAA-MM-GG`); return; }
    if (e.impronta && !/^[0-9a-f]{12}$/.test(e.impronta)) { errori.push(`${dove} (${e.percorso}): «impronta» sono le 12 cifre che il controllo stampa`); return; }
    if (e.contenuto && !/^[0-9a-f]{7,40}$/.test(e.contenuto)) { errori.push(`${dove} (${e.percorso}): «contenuto» è lo sha (almeno 7 cifre) che il controllo stampa con --storia`); return; }
    if (e.fino && e.fino < oggi) { errori.push(`${dove} (${e.percorso}): scaduta il ${e.fino}`); return; }
    eccezioni.push({ ...e, re: globInRegex(e.percorso), usata: false });
  });
  return { eccezioni, errori };
}

function eccezionePer(eccezioni, trovato) {
  return eccezioni.find((e) => e.re.test(trovato.percorso)
    && (e.regole.includes('*') || e.regole.includes(trovato.regola))
    && (!e.contenuto || trovato.sha.startsWith(e.contenuto))
    && (!e.impronta || trovato.impronta === e.impronta));
}

// --- Gli oggetti da controllare: percorso, contenuto (sha) e dimensione ------------------------

function git(repo, args, input) {
  // Senza «encoding» execFileSync restituisce un Buffer: serve, perché i contenuti possono essere binari.
  return execFileSync('git', args, { cwd: repo, input, maxBuffer: 1024 * MB, stdio: ['pipe', 'pipe', 'pipe'] });
}
const gitTesto = (repo, args, input) => git(repo, args, input).toString('utf8');

// L'uscita di `diff --raw -z` e `diff-tree --raw -z`: «:mode mode sha sha stato\0percorso\0».
function daRaw(uscita) {
  const parti = uscita.split('\0');
  const oggetti = [];
  for (let i = 0; i < parti.length - 1; i++) {
    const meta = parti[i].replace(/^\n+/, ''); // git log mette un a capo fra un commit e l'altro
    if (!meta.startsWith(':')) continue;
    const [, modo, , sha] = meta.slice(1).split(' ');
    const percorso = parti[++i];
    if (modo !== '160000' && !ZERI.test(sha)) oggetti.push({ percorso, sha });
  }
  return oggetti;
}

function oggettiStaged(repo) {
  return daRaw(gitTesto(repo, ['diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev', '--diff-filter=ACMR']));
}

// Ogni coppia (percorso, contenuto) entrata nei commit indicati, con un solo processo git. Ogni percorso
// in cui un contenuto è stato scritto conta, non solo il primo: una chiave finta copiata da una cartella
// di test ammessa in una che non lo è si ferma. Delle unioni conta ciò che portano rispetto al primo genitore.
function oggettiDeiCommit(repo, argomentiRevList) {
  const commit = Number(gitTesto(repo, ['rev-list', '--count', ...argomentiRevList]).trim());
  if (!commit) return { oggetti: [], commit: 0 };
  const uscita = gitTesto(repo, ['log', ...argomentiRevList, '--root', '--raw', '-z', '--no-renames', '--no-abbrev',
    '--diff-filter=ACMR', '--diff-merges=first-parent', '--format=']);
  return { oggetti: daRaw(uscita), commit };
}

const esiste = (repo, sha) => { try { git(repo, ['cat-file', '-e', `${sha}^{commit}`]); return true; } catch { return false; } };

function oggettiDelPush(repo, righe) {
  const oggetti = [];
  let commit = 0;
  for (const r of righe.split('\n').map((x) => x.trim()).filter(Boolean)) {
    const [, locale, , remoto] = r.split(/\s+/);
    if (!locale || ZERI.test(locale)) continue; // un ramo cancellato non porta niente
    // Un remoto che qui non c'è (spinto da un altro dispositivo, poi un --force-with-lease): si controlla
    // tutto ciò che nessun remoto conosciuto ha già.
    const noto = remoto && !ZERI.test(remoto) && esiste(repo, remoto);
    const argomenti = noto ? [`${remoto}..${locale}`] : [locale, '--not', '--remotes'];
    const r2 = oggettiDeiCommit(repo, argomenti);
    oggetti.push(...r2.oggetti);
    commit += r2.commit;
  }
  return { oggetti, commit };
}

function oggettiAlbero(repo) {
  const oggetti = [];
  for (const voce of gitTesto(repo, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']).split('\0').filter(Boolean)) {
    const tab = voce.indexOf('\t');
    const [, tipo, sha] = voce.slice(0, tab).split(' ');
    if (tipo === 'blob') oggetti.push({ percorso: voce.slice(tab + 1), sha });
  }
  return oggetti;
}

function oggettiStoria(repo) {
  return oggettiDeiCommit(repo, ['--all']).oggetti;
}

function tipiEDimensioni(repo, shas) {
  const risultato = new Map();
  for (let i = 0; i < shas.length; i += 2000) {
    const pezzo = shas.slice(i, i + 2000);
    const uscita = gitTesto(repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], pezzo.join('\n') + '\n');
    for (const r of uscita.split('\n').filter(Boolean)) {
      const [sha, tipo, dim] = r.split(' ');
      risultato.set(sha, { tipo, dimensione: Number(dim) });
    }
  }
  return risultato;
}

function contenuti(repo, shas, dimensioni) {
  const risultato = new Map();
  const lotti = [];
  let lotto = [], peso = 0;
  for (const sha of shas) {
    const d = dimensioni.get(sha)?.dimensione ?? 0;
    if (lotto.length && peso + d > LOTTO) { lotti.push(lotto); lotto = []; peso = 0; }
    lotto.push(sha); peso += d;
  }
  if (lotto.length) lotti.push(lotto);
  for (const pezzo of lotti) {
    const buf = git(repo, ['cat-file', '--batch'], pezzo.join('\n') + '\n');
    let pos = 0;
    while (pos < buf.length) {
      const fine = buf.indexOf(10, pos);
      const [sha, , dim] = buf.slice(pos, fine).toString('utf8').split(' ');
      const n = Number(dim);
      risultato.set(sha, buf.subarray(fine + 1, fine + 1 + n));
      pos = fine + 1 + n + 1;
    }
  }
  return risultato;
}

const binario = (buf) => buf.subarray(0, 8000).includes(0);
const stessoFile = (a, b) => (process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  : path.resolve(a) === path.resolve(b));

// --- Il controllo ------------------------------------------------------------------------------

export function controlla(repo, oggetti, eccezioni) {
  const unici = new Map();
  for (const o of oggetti) {
    const p = o.percorso.replace(/\\/g, '/');
    if (p === COPIA) continue; // la copia di questo controllo: contiene le sue stesse regole
    unici.set(`${o.sha}\0${p}`, { ...o, percorso: p });
  }
  const info = tipiEDimensioni(repo, [...new Set([...unici.values()].map((o) => o.sha))]);
  const blob = [...unici.values()].filter((o) => info.get(o.sha)?.tipo === 'blob')
    .map((o) => ({ ...o, dimensione: info.get(o.sha).dimensione }));
  const daLeggere = [...new Set(blob.filter((o) => o.dimensione <= LIMITE_LETTURA).map((o) => o.sha))];
  const testi = contenuti(repo, daLeggere, info);
  const perContenuto = new Map();
  const trovati = [];
  for (const o of blob) {
    for (const t of regoleDelPercorso(o.percorso, o.dimensione)) trovati.push({ ...t, percorso: o.percorso, sha: o.sha });
    const buf = testi.get(o.sha);
    if (!buf || binario(buf)) continue;
    if (!perContenuto.has(o.sha)) perContenuto.set(o.sha, regoleDelContenuto(buf.toString('utf8')));
    for (const t of perContenuto.get(o.sha)) trovati.push({ ...t, percorso: o.percorso, sha: o.sha });
  }
  const problemi = [];
  const ammessi = [];
  for (const t of trovati) {
    const e = eccezionePer(eccezioni, t);
    if (e) { e.usata = true; ammessi.push(t); } else problemi.push(t);
  }
  return { problemi, ammessi, file: blob.length };
}

function stampa(problemi, modo, storia) {
  const perFile = new Map();
  for (const p of problemi) {
    const chiave = storia ? `${p.percorso} @ ${p.sha.slice(0, 10)}` : p.percorso;
    if (!perFile.has(chiave)) perFile.set(chiave, []);
    perFile.get(chiave).push(p);
  }
  for (const [chiave, lista] of perFile) {
    console.log(`\n  ❌ ${chiave}`);
    for (const p of lista) {
      const dove = p.riga ? `riga ${p.riga}: ` : '';
      const dettaglio = p.dettaglio ? ` (${p.dettaglio})` : '';
      console.log(`     ${dove}${DESCRIZIONI[p.regola]}${dettaglio} [${p.regola}]`);
    }
  }
  console.log('');
  if (problemi.some((p) => !DATI_PERSONALI.has(p.regola) && !['file-dati', 'foglio-di-calcolo', 'dati-tabellari', 'cartella-dati', 'file-grande'].includes(p.regola))) {
    console.log('  Se è un segreto vero: toglilo, e consideralo già esposto. Va cambiato dove vale.');
  }
  if (modo === '--staged') console.log('  Per togliere un file dal commit: git restore --staged <file>');
  if (storia) console.log('  Il commit che lo contiene: git log --all --find-object=<sha>');
  console.log(`  Se è un falso positivo: un'eccezione in ${ECCEZIONI}, col suo perché`);
  console.log('  (il formato è scritto in testa a controllo-segreti-dati.mjs).');
}

function avvisaSeLaCopiaDiverge(repo) {
  const copia = path.join(repo, COPIA);
  if (!fs.existsSync(copia) || stessoFile(copia, QUESTO_FILE)) return;
  const norm = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  if (norm(copia) !== norm(QUESTO_FILE)) {
    console.error(`⚠️  ${COPIA} è diversa dall'originale del brain: la pipeline controlla con regole vecchie.`);
    console.error(`    Per allinearla: node "${QUESTO_FILE}" --copia "${repo}"`);
  }
}

function principale(argv) {
  const modi = ['--staged', '--push', '--intervallo', '--albero', '--storia', '--copia'];
  const modo = argv.find((a) => modi.includes(a));
  const valore = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
  if (!modo) {
    console.error(`Uso: node controllo-segreti-dati.mjs ${modi.join(' | ')} [--repo <cartella>]`);
    return 2;
  }
  if (modo === '--copia') {
    const dest = valore('--copia');
    if (!dest) { console.error('Uso: --copia <cartella del repository>'); return 2; }
    fs.mkdirSync(path.join(dest, '.github'), { recursive: true });
    fs.copyFileSync(QUESTO_FILE, path.join(dest, COPIA));
    console.log(`✅ copiato in ${path.join(dest, COPIA)}`);
    return 0;
  }
  let repo;
  try { repo = gitTesto(valore('--repo') || process.cwd(), ['rev-parse', '--show-toplevel']).trim(); } catch {
    console.error('❌ non è un repository git'); return 2;
  }
  avvisaSeLaCopiaDiverge(repo);
  let testoEccezioni;
  if (modo === '--staged') {
    try { testoEccezioni = gitTesto(repo, ['cat-file', '-p', `:${ECCEZIONI}`]); } catch { testoEccezioni = null; }
  }
  const { eccezioni, errori } = leggiEccezioni(repo, oggiLocale(), testoEccezioni);
  if (errori.length) {
    console.error('❌ Le eccezioni non sono valide:');
    for (const e of errori) console.error(`   • ${e}`);
    return 2;
  }
  let oggetti;
  let commit = null;
  if (modo === '--staged') oggetti = oggettiStaged(repo);
  else if (modo === '--push') ({ oggetti, commit } = oggettiDelPush(repo, fs.readFileSync(0, 'utf8')));
  else if (modo === '--intervallo') {
    const intervallo = valore('--intervallo');
    if (!intervallo) { console.error('Uso: --intervallo A..B'); return 2; }
    ({ oggetti, commit } = oggettiDeiCommit(repo, [intervallo]));
  } else if (modo === '--albero') oggetti = oggettiAlbero(repo);
  else oggetti = oggettiStoria(repo);

  const { problemi, ammessi, file } = controlla(repo, oggetti, eccezioni);
  const cosa = commit === null ? `${file} contenuti` : `${commit} commit, ${file} contenuti`;
  if (modo === '--albero' || modo === '--storia') {
    for (const e of eccezioni.filter((x) => !x.usata)) console.log(`ℹ️  eccezione mai usata, da togliere: ${e.percorso} [${e.regole.join(', ')}]`);
  }
  if (!problemi.length) {
    console.log(`✅ Controllo dei segreti e dei dati: niente da segnalare (${cosa}${ammessi.length ? `, ${ammessi.length} ammessi da un'eccezione` : ''}).`);
    return 0;
  }
  console.log(`❌ Controllo dei segreti e dei dati: ${problemi.length} da guardare (${cosa}).`);
  stampa(problemi, modo, modo === '--storia');
  return 1;
}

export const _perITest = { regoleDelPercorso, regoleDelContenuto, codiceFiscaleValido, ibanValido, globInRegex, leggiEccezioni, sembraSegreto };

if (process.argv[1] && stessoFile(process.argv[1], QUESTO_FILE)) {
  try { process.exitCode = principale(process.argv.slice(2)); } catch (e) {
    console.error(`❌ controllo dei segreti e dei dati: errore inatteso: ${e.message}`);
    process.exitCode = 2;
  }
}
