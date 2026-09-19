# Nasazení DziFlip na Vercel (PostgreSQL)

Tento dokument popisuje, jak nasadit DziFlip na Vercel s PostgreSQL databází
místo lokálního SQLite. Postup je napsaný pro obrazovku **New Project**, kde
Vercel nabízí **Prisma Postgres** jako databázi k projektu.

## 1. Co appka teď očekává

`prisma/schema.prisma` používá dvě proměnné prostředí:

- **`DATABASE_URL`** — připojení, které Prisma Client používá za běhu appky.
  Může to být pooled/proxy připojení (např. `prisma+postgres://…` u Prisma
  Postgres/Accelerate, nebo pgbouncer URL).
- **`DIRECT_URL`** — přímé (nepoolované) připojení, používané výhradně pro
  spuštění migrací (`prisma migrate deploy`). Pokud váš provider dává jen
  jeden connection string, nastavte `DIRECT_URL` na stejnou hodnotu jako
  `DATABASE_URL`.

Produkční build (`npm run build`) automaticky spouští
`prisma generate && prisma migrate deploy && next build` — migrace se tedy
aplikují samy při každém nasazení, appka nikdy neběží se zastaralým schématem.

## 2. Co udělat na obrazovce „New Project"

1. **Připoj databázi.** Klikni na nabízenou **Prisma Postgres** (nebo
   Vercel Postgres/Neon/Supabase — postup níže funguje pro libovolného
   Postgres providera). Vercel databázi vytvoří a **sám vloží příslušné
   proměnné prostředí do projektu** — nejčastěji `DATABASE_URL`, případně i
   `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` apod.
   podle konkrétní integrace.

2. **Zkontroluj/doplň proměnné prostředí** (Project Settings → Environment
   Variables), tak aby existovaly přesně tyto dvě, se jmény, která appka
   čte:
   - `DATABASE_URL` — pokud ji Vercel/Prisma Postgres integrace nastavila
     rovnou pod tímto jménem, nic neděláš. Pokud ji nastavila pod jiným
     jménem (např. `POSTGRES_PRISMA_URL`), přidej `DATABASE_URL` jako
     novou proměnnou a vlož do ní **stejnou hodnotu**.
   - `DIRECT_URL` — pokud integrace dala samostatné „non-pooling"/„direct"
     připojení (např. `POSTGRES_URL_NON_POOLING`), zkopíruj jeho hodnotu do
     `DIRECT_URL`. Pokud žádné samostatné direct připojení nemáš, nastav
     `DIRECT_URL` na **stejnou hodnotu jako `DATABASE_URL`**.

   Obě proměnné nastav pro **Production** i **Preview** prostředí (pokud
   plánuješ nasazovat i z jiné větve než produkční).

3. **Build command / Install command** — necháváme výchozí (Vercel je
   automaticky odvodí z `package.json`). Nic zde neměň — `npm run build`
   už obsahuje `prisma generate` i `prisma migrate deploy`.

4. **Nekliкej Deploy, dokud nemáš obě proměnné vyplněné.** Jakmile
   `DATABASE_URL` a `DIRECT_URL` existují a ukazují na skutečnou databázi
   → **ano, můžeš kliknout Deploy.** První nasazení při buildu samo spustí
   migrace z `prisma/migrations/` a vytvoří celé schéma (26 tabulek).

## 3. Po prvním nasazení — kontrola

Po dokončení buildu zkontroluj v Deployment logu, že proběhlo:

```
Applying migration `20260919103451_init`
```

(nebo `No pending migrations to apply` při opakovaném nasazení). Pokud tam
vidíš chybu o připojení k databázi, zkontroluj bod 2 výše — nejčastější
příčina je špatně zkopírovaná/chybějící `DIRECT_URL`.

Otevři nasazenou appku a projdi:
- `/` — Nová analýza
- `/settings` — Nastavení (mělo by se načíst bez chyby → potvrzuje, že appka umí číst i zapisovat do DB)
- `/radar` → vytvoř hlídač se zdrojem MOCK_DEMO → „Spustit nyní" → ověří celý pipeline nad produkční DB

## 4. Budoucí změny schématu

Lokálně: uprav `prisma/schema.prisma`, spusť
`npm run db:migrate -- --name popis_zmeny` (vytvoří a rovnou aplikuje
migraci na tvůj lokální Postgres), commitni nový adresář v
`prisma/migrations/` a pushni. Další nasazení na Vercelu migraci samo
aplikuje díky `prisma migrate deploy` v build scriptu.

## 5. Poznámky a možné zádrhele

- **Connection pooling.** Postgres má omezený počet současných připojení a
  serverless funkce na Vercelu je mohou snadno vyčerpat. Pokud používáš
  Prisma Postgres (Accelerate), pooling řeší za tebe. Pokud připojuješ
  vlastní Postgres (Neon/Supabase/vlastní server), použij jejich pooled
  connection string (obvykle s `?pgbouncer=true` nebo samostatnou pooler
  doménou) jako `DATABASE_URL`, a nepoolované přímé připojení jako
  `DIRECT_URL`.
- **Edge Runtime.** Žádná route v projektu nepoužívá `export const runtime
  = "edge"` — musí to tak zůstat, protože Prisma Client (bez driver
  adapterů, které tento projekt nepoužívá) potřebuje standardní Node.js
  runtime.
- **Prisma engine / binární chyba při buildu.** Pokud build na Vercelu
  selže s chybou o chybějícím Prisma query engine, přidej do
  `prisma/schema.prisma` do bloku `generator client` řádek
  `binaryTargets = ["native", "rhel-openssl-3.0.x"]` a redeployni. Ve
  výchozím stavu to ale u standardního Next.js projektu na Vercelu není
  potřeba.
- **DEMO data se nikdy nenačtou automaticky do produkce.** `MOCK_DEMO`
  zdroj vytvoří vlastní DEMO fixture data (`DemoListing`) až při prvním
  spuštění hlídače s tímto zdrojem — pokud produkci nechceš zanést DEMO
  projekty, prostě takový hlídač nevytvářej / v Nastavení vypni „Zobrazovat
  DEMO data v přehledech".
- **Souborový systém je na Vercelu needitovatelný** (kromě `/tmp`).
  Appka nikde nezapisuje na disk (žádné `fs.writeFile` v `src/`), takže to
  není problém — fotografie/dokumenty appka neukládá lokálně, jen odkazuje
  na URL.
- **Žádné automatické platby ani objednávky.** Shopping List (Fáze 5) i
  SMS Hub (Fáze 3) v produkci fungují stejně bezpečně jako lokálně —
  žádná funkce appky sama neprovádí nákup ani neodesílá reálnou SMS/e-mail
  bez explicitně nastaveného a potvrzeného režimu AUTO a reálného
  API klíče (viz `.env.example`).

## 6. Shrnutí — co přesně nastavit ve Vercelu

| Proměnná | Hodnota |
|---|---|
| `DATABASE_URL` | Connection string k tvé Postgres databázi (z Prisma Postgres/Vercel integrace) |
| `DIRECT_URL` | Přímé/nepoolované připojení; pokud provider nedává samostatné, stejná hodnota jako `DATABASE_URL` |

Vše ostatní z `.env.example` (SMTP, SMS API, Vision API…) je **volitelné** —
appka bez nich normálně běží, jen příslušné funkce zůstanou v bezpečném
`PENDING_ACCESS`/`NOT_CONFIGURED` stavu, přesně jako lokálně.

**Až budou `DATABASE_URL` a `DIRECT_URL` v Project Settings vyplněné
skutečnými hodnotami z tvé databáze → ano, můžeš kliknout Deploy.**
