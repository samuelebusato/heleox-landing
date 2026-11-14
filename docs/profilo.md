# Il profilo di heleox-landing

> Il profilo del progetto ([framework](../../../Rule/regole-sviluppo-sicuro.md) §0.2, PF1), **fonte unica dei due livelli**: i cinque assi, le cose che il progetto ha, gli ambienti che usa, il comando del rilascio, le regole tolte. Da qui, dal brain, `node Code/genera-regole-progetto.mjs Projects/heleox-landing` genera [`regole-progetto.md`](regole-progetto.md), le regole del progetto.
>
> **I cinque assi li ha scelti l'agente della sessione principale, su delega di Samuele, il 2026-11-14.** Le cose, gli ambienti e il comando del rilascio li ha letti dalle fonti la sessione del rulebook: ⬜ **da confermare da Samuele**.
>
> ⚠️ **Prima di committare questa cartella**: il deploy (`.github/workflows/deploy.yml`) pubblica tutto il repository su S3 e non esclude `docs/`, quindi questo file e le regole del progetto diventerebbero pagine pubbliche del sito. Va aggiunto `--exclude "docs/*"`, come nel deploy di `fr-busato`.

```profilo
progetto: heleox-landing
dati: basso
sicurezza: basso
dove: A
per: personale
rigore: prodotto
cose: cloud, usato-da-altri, dati-personali
ambienti: produzione
rilascio: automatico a ogni push su `main`, col workflow «Deploy su S3 + CloudFront» e il ruolo OIDC (D9) — .github/workflows/deploy.yml
toglie: DC3 — deroga del 2026-08-04 (§1.0 del framework): il sito non ha il `History.md`
toglie: DC4 — deroga del 2026-08-04 (§1.0 del framework): il sito non ha l'`Architecture.md`
toglie: DC5 — deroga del 2026-08-04 (§1.0 del framework): il sito non ha il `threat-model.md`
toglie: DC7 — deroga del 2026-08-04 (§1.0 del framework): i tre documenti che si aggiornano a ogni sessione non ci sono
toglie: TM1 — deroga del 2026-08-04 (§1.0 del framework): il metodo del threat model vale per un `threat-model.md` che il sito non ha
toglie: CF2 — deroga del 2026-08-04 (§1.0 del framework): le righe del threat model del confine nuovo vanno in un `threat-model.md` che il sito non ha
```

## Perché questi valori

| Asse | Valore | Chi, quando e perché |
|---|---|---|
| Dati | basso | L'agente della sessione principale, su delega di Samuele, il 2026-11-14: un sito statico, che non tiene dati suoi |
| Sicurezza | basso | Lo stesso: nulla da rubare; il rischio è l'alterazione del sito, coperta dal ruolo OIDC del deploy e dalle intestazioni di sicurezza |
| Dove gira | A | Un sito statico, su S3 e CloudFront |
| Per chi | personale | È il sito di HeleoX, progetto di Samuele |
| Rigore | prodotto | È online e pubblico |

**La deroga** (§1.0 del framework, 2026-08-04): il sito non ha i tre documenti, `History.md`, `Architecture.md` e `threat-model.md`. Il profilo toglie le regole che li descrivono o li presuppongono (DC3, DC4, DC5, DC7, TM1, CF2); dove le regole del ciclo nominano i tre documenti, quella parte si salta. **Il piano di manutenzione invece vale** (Samuele, 2026-11-14: MN15, corto nel profilo A, MN16). ⬜ Gli altri documenti del pavimento (la classificazione, il disaster recovery, il `MANUAL_SETUP.md`) la deroga non li nomina: li decide Samuele.

**Le cose che ha**:
- `cloud`: S3 e CloudFront, con un ruolo OIDC per il deploy;
- `usato-da-altri`: è un sito pubblico;
- `dati-personali` (⬜ da confermare): pubblica le recensioni col nome scelto da chi le scrive (`recensioni.json`), che arrivano per mail; il modulo dello scan gratuito manda il dominio all'API di HeleoX.

**Gli ambienti**: solo la produzione, il sito online.
