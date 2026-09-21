# docs-management

Beheer- en hostingplatform voor het [Coderius-Education/docs](https://github.com/Coderius-Education/docs) monorepo:

- **Inloggen met GitHub** — alleen leden van de Coderius-Education organisatie.
- **Docs bewerken** — hybride editor (WYSIWYG + raw MDX) met huisstijl-snippets; wijzigingen gaan naar een zelfgekozen branch en een PR die je vanuit de UI kunt mergen.
- **Hosting** — GitHub Actions bouwt elke site als artifact; deze backend haalt ze op en serveert ze op de site-domeinen (python.coderius.nl, …).
- **Branch-previews** — elke PR-build is bereikbaar op `{branch}--{site}.preview.coderius.nl`.
- **A/B-testen** — verdeel echt verkeer over twee varianten van een pagina en vergelijk engagement-metrics.

## Architectuur

Eén codebase, één Docker-image, drie containers:

| Service | Rol |
|---|---|
| `api` | Beheer-UI (React) + REST-API + GitHub-integratie + artifact-ingestie |
| `delivery` | Serveert gebouwde sites o.b.v. Host-header; A/B-cookies; analytics-snippet |
| `db` | PostgreSQL 16 |

Builds staan op een gedeeld volume: `/data/builds/<site>/<branch-slug>/<sha12>/` met een `current`-symlink per branch. Live = `<site>/main/current`.

### Tokens

- **Schrijfacties** (branches, commits, PR's) gebruiken het OAuth-token van de ingelogde gebruiker → correcte attributie op GitHub.
- **Artifact-ingestie** gebruikt een fine-grained PAT (alleen-lezen op het docs-repo). Upgrade-pad: een GitHub App met installation tokens, zodra PAT-verlenging gaat irriteren.

## Lokaal ontwikkelen

```bash
# Backend + Postgres + delivery
docker compose -f compose.dev.yml up --build

# Frontend (aparte terminal)
cd frontend && pnpm install && pnpm dev   # http://localhost:5173, proxy naar :8000
```

Of zonder Docker:

```bash
cd backend && uv sync && uv run uvicorn app.main_api:app --reload
```

Tests:

```bash
cd backend && uv run pytest
cd frontend && pnpm build   # typecheck + build
```

GitHub-koppeling lokaal testen: maak een *dev* OAuth App met callback `http://localhost:8000/api/auth/callback` en zet de client-id/secret in `.env` (zie `.env.example`). Webhooks lokaal: `gh webhook forward --repo Coderius-Education/docs --events workflow_run,pull_request,delete --url http://localhost:8000/api/webhooks/github`.

Previews lokaal: `*.localtest.me` wijst naar 127.0.0.1, dus `http://python.localtest.me:8001` werkt zonder hosts-bestand.

## Deploy (Portainer)

1. Zet DNS: A-records voor de site-domeinen (de cursus-subdomeinen plus de apex `coderius.nl`), het admin-domein en `*.preview.coderius.nl` naar de VPS. Let op: de apex `coderius.nl` heeft een eigen A/AAAA-record nodig en valt niet onder een `*.coderius.nl`-wildcard.
2. Maak in Portainer een stack van `compose.yml` met een `stack.env` op basis van `.env.example`.
3. Controleer: naam van het externe Traefik-netwerk (`TRAEFIK_NETWORK`), Traefik **v3** (de `HostRegexp`-syntax), en een DNS-01 certresolver (`lednsresolver`) voor het wildcard-preview-certificaat — zie §Hetzner DNS-01 hieronder.
4. Registreer de webhook op het docs-repo: `https://<admin-domein>/api/webhooks/github`, events `workflow_run`, `pull_request`, `delete`, `push`; secret = `GITHUB_WEBHOOK_SECRET`.
5. `GET /api/health` toont de status van database, builds-volume en PAT.

### Hetzner DNS-01 (wildcard preview-cert)

De live-sites en het admin-domein krijgen elk hun eigen cert via HTTP-01
(`leresolver`). De branch-previews draaien op `*.preview.coderius.nl`; een
wildcard-cert kan **alleen** via een DNS-01-challenge. De `docspreview`-router
in `compose.yml` vraagt dat cert aan bij de certresolver **`lednsresolver`**,
die je op de **externe Traefik-container** definieert (niet in deze stack).

Voorwaarden:
- De zone `coderius.nl` wordt gehost op **Hetzner DNS** (dns.hetzner.com).
- Een **Hetzner DNS Console** API-token (dns.hetzner.com → *API tokens*) — dit
  is níét een Hetzner Cloud-token.
- Een wildcard-DNS-record `*.preview.coderius.nl` dat naar de Traefik-host wijst
  (nodig om de previews te kunnen serveren; DNS-01 zelf heeft geen A-record nodig).

Voeg op de **Traefik-container** de resolver + credential toe. Via CLI-flags:

```yaml
# in de Traefik-service (de bestaande, externe Traefik):
command:
  - --certificatesresolvers.lednsresolver.acme.email=admin@coderius.nl
  - --certificatesresolvers.lednsresolver.acme.storage=/letsencrypt/acme-dns.json
  - --certificatesresolvers.lednsresolver.acme.dnschallenge=true
  - --certificatesresolvers.lednsresolver.acme.dnschallenge.provider=hetzner
environment:
  - HETZNER_API_KEY=<jouw-hetzner-dns-token>
volumes:
  - letsencrypt:/letsencrypt
```

Of via `traefik.yml` (static config):

```yaml
certificatesResolvers:
  lednsresolver:
    acme:
      email: admin@coderius.nl
      storage: /letsencrypt/acme-dns.json
      dnsChallenge:
        provider: hetzner
```

Na een Traefik-redeploy mét `HETZNER_API_KEY` haalt Traefik het wildcard-cert
op; de previews zijn dan bereikbaar op `{branch}--{site}.preview.coderius.nl`.

## Database-migraties

Het schema wordt bij het opstarten aangemaakt (idempotent). Voor schemawijzigingen ná de eerste release: `alembic revision --autogenerate` + `alembic upgrade head` (baseline staat in `backend/alembic/versions/0001_initial.py`).

## Lesmateriaal maken en bewerken

De editor opent lesmateriaal in **Bewerken**. Gewone Markdown, callouts en
uitklapbare tips/oplossingen kunnen visueel worden aangepast. **Blok toevoegen**
voegt een onderdeel bij het actieve tekstblok in. De velden voor menuvolgorde,
menunaam en beschrijving bewaren onbekende pagina-instellingen.

Ondersteunde interactieve onderdelen hebben formulieren:

- Python: `CodeExercise` (startcode).
- Algorithms: `PyRunner` (code, bewerkbaarheid, aantal regels en pakketten).
- Play: `TryButton` (code en uitvoermodus).

Imports worden bij invoegen automatisch gekoppeld. Andere MDX-componenten en
expressies blijven als bronblokken behouden, ook wanneer je omliggende tekst
bewerkt. **Bron bewerken** opent één blok; **Broncode** toont het volledige
bestand inclusief pagina-instellingen. Ongeldige MDX of YAML blijft beschikbaar
voor herstel in de bronweergave.

**Voorbeeld** is een statisch inhoudsvoorbeeld: code wordt hier niet uitgevoerd.
Het toont callouts, tips, tabellen en ondersteunde componentconfiguraties. Via
**Cursusvoorbeeld** open je een bestaande branch-build in een apart tabblad.
Afbeeldingen met openbare URLs of `/img/...` / `@site/static/...` worden waar
mogelijk tegen de betreffende site of branch-preview opgelost. Relatieve PNG-,
JPEG-, GIF- en WebP-afbeeldingen worden rechtstreeks uit de gekozen GitHub-branch
getoond, zonder op een build te wachten. Andere bronassets behouden een placeholder.

Via **Blok toevoegen → Afbeelding** kies je een lokaal bestand en alternatieve tekst.
**Uploaden en invoegen** commit de afbeelding met je eigen GitHub-account naast de
les en voegt een blijvende relatieve verwijzing in. Bestanden mogen maximaal 5 MB
zijn (PNG, JPEG, GIF of WebP; geen SVG). De bestandsnaam bevat een inhoudshash:
een bestaande afbeelding wordt niet overschreven en opnieuw uploaden van hetzelfde
bestand onder dezelfde naam maakt geen extra commit. Vanuit `main` maakt de editor
automatisch een conceptbranch. Uploaden bewaart de afbeelding meteen; **sla daarna
ook de les op** om de verwijzing te bewaren. Verwijderen uit de les verwijdert het
gecommitte bestand niet automatisch. Tijdelijke `blob:`- en `data:`-afbeeldingen
blijven geblokkeerd bij opslaan.

**Opslaan** bewaart een concept op een feature branch. **Controle aanvragen**
opent daarna een pull request; opslaan publiceert dus niet automatisch. Je kunt
na elke save verder bewerken. Conflicten behouden je lokale tekst. Een
herstelkopie wordt per gebruiker, cursus, branch en bestand in deze browser
bewaard; bij heropenen kun je haar herstellen of de serverversie gebruiken.
Opslaan gebruikt de huidige conceptbranch of een nieuwe kopie daarvan, zodat
afbeeldingen met de les meegaan.

Extra frontendchecks:

```bash
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Browserchecks gebruiken gemockte API-antwoorden en schrijven niet naar GitHub.
Met `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/pad/naar/chromium` kun je een reeds
geïnstalleerde browser gebruiken. De lesfixtures in `frontend/tests/fixtures`
komen uit het Coderius-Education/docs-repo (Python hoofdstuk 1 en Algorithms,
Vind maximum, stap 6) en vallen onder dezelfde CC BY-NC 4.0-licentie als het
lesmateriaal.
