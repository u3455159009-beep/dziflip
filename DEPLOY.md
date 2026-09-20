# Nasazení DziFlip na Vercel (PostgreSQL)

Tento dokument popisuje, jak nasadit DziFlip na Vercel s PostgreSQL databází
místo lokálního SQLite. Postup je napsaný pro obrazovku **New Project**, kde
Vercel nabízí **Prisma Postgres** jako databázi k projektu.

## 1. Co appka teď očekává

`prisma/schema.prisma` používá jednu proměnnou prostředí:

- **`DATABASE_URL`** — jediné connection string, které appka potřebuje.
  Prisma Client ho používá za běhu (čtení/zápis dat) a `prisma migrate
  deploy` ho používá i pro aplikaci migrací. Vercelova integrace **Prisma
  Postgres** dává přesně tuto jednu proměnnou a nic víc — a to je v
  pořádku, appka žádnou druhou (`DIRECT_URL`) nepotřebuje (viz bod 5).

Produkční build (`npm run build`) automaticky spouští
`prisma generate && prisma migrate deploy && next build` — migrace se tedy
aplikují samy při každém nasazení, appka nikdy neběží se zastaralým schématem.

## 2. Co udělat na obrazovce „New Project"

1. **Připoj databázi.** Klikni na nabízenou **Prisma Postgres**. Vercel
   databázi vytvoří a sám vloží `DATABASE_URL` do proměnných prostředí
   projektu.

2. **Zkontroluj v Project Settings → Environment Variables, že `DATABASE_URL`
   existuje** a je nastavená pro **Production** (a **Preview**, pokud
   plánuješ nasazovat i z jiných větví). Nic dalšího přidávat nemusíš.

3. **Build command / Install command** — necháváme výchozí (Vercel je
   automaticky odvodí z `package.json`). Nic zde neměň — `npm run build`
   už obsahuje `prisma generate` i `prisma migrate deploy`.

4. **Jakmile `DATABASE_URL` existuje a ukazuje na skutečnou databázi →
   ano, můžeš kliknout Deploy.** První nasazení při buildu samo spustí
   migrace z `prisma/migrations/` a vytvoří celé schéma (26 tabulek).

## 3. Po prvním nasazení — kontrola

Po dokončení buildu zkontroluj v Deployment logu, že proběhlo:

```
Applying migration `20260919103451_init`
```

(nebo `No pending migrations to apply` při opakovaném nasazení). Pokud tam
vidíš chybu o připojení k databázi, zkontroluj bod 2 výše — nejčastější
příčina je, že `DATABASE_URL` chybí nebo je nastavená jen pro jedno
prostředí (např. jen Preview, ne Production).

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

## 5. Proč appka nepotřebuje DIRECT_URL

Klasický Postgres pooler (PgBouncer v transaction módu, Supabase pooler,
Neon pooler) neumí přes poolované připojení spouštět příkazy měnící
schéma (`CREATE TABLE` apod.) — proto se u nich používá dvojice
`DATABASE_URL` (poolované, pro běžné dotazy) + `DIRECT_URL` (nepoolované,
jen pro migrace).

**Prisma Postgres funguje jinak** — je to jedna spravovaná služba
postavená na Prisma Accelerate, která přes svůj jediný connection string
(`prisma+postgres://…`) podporuje jak běžné dotazy, tak migrace. Proto
Vercelova integrace žádnou druhou proměnnou nedává a appka žádnou
nepotřebuje — ověřeno přímo v tomto repu (`prisma migrate deploy` proběhne
čistě s jen `DATABASE_URL` nastaveným).

Pokud v budoucnu přejdeš na jiného Postgres providera, který používá
klasický pooler bez podpory migrací přes poolované připojení
(samostatný Supabase/Neon mimo Prisma Postgres, vlastní server
s PgBouncer), bude potřeba do `prisma/schema.prisma` do bloku
`datasource db` přidat zpět:

```prisma
directUrl = env("DIRECT_URL")
```

a nastavit `DIRECT_URL` na nepoolované připojení daného providera.

## 6. Další poznámky a možné zádrhele

- **Connection pooling.** Prisma Postgres pooling řeší za tebe (proto
  stačí jedna proměnná — viz bod 5).
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

## 7. Real Data Engine — aktivace automatického vyhledávání srovnatelných nabídek

DziFlip má kompletní architekturu pro automatické vyhledávání srovnatelných
nabídek (Comparable Discovery Engine) a dohledání původního inzerátu
(Listing Discovery Engine) — ale bez připojeného REAL zdroje dat **nikdy nic
nevymýšlí ani nescrapuje**. `/settings` → sekce **Provider Health** vždy
ukazuje pravdivý stav (PŘIPOJENO / ČEKÁ NA PŘÍSTUP / CHYBA) každého zdroje.

Portály Sreality.cz, Bezrealitky.cz a Reality.iDNES.cz nemají veřejné,
ToS-souhlasné API pro hromadné stahování nabídek — proto zůstávají
`PENDING_ACCESS` natrvalo, dokud nezískáš oficiální partnerský přístup.

### 7.1 FlatScan Data API (doporučené — čeká jen na klíč)

Kompletní přímá integrace na FlatScan Data API (`src/lib/sources/flatScan/`)
je hotová a čeká pouze na API klíč — po jeho nastavení není potřeba nic
dalšího programovat.

1. Získej `FLATSCAN_API_KEY` od FlatScanu (https://flatscan.cz).
2. Nastav v proměnných prostředí **jen**:
   ```
   FLATSCAN_API_KEY=<tvůj klíč>
   ```
   (`FLATSCAN_API_BASE_URL` nech nenastavenou — výchozí
   `https://flatscan.cz/api/v1` je správná; přepiš ji jen pokud ti FlatScan
   dá jinou adresu.)
3. Po redeploy/restartu appky:
   - `/settings` → **Provider Health** → `FlatScan Data API` se přepne z
     ČEKÁ NA PŘÍSTUP na PŘIPOJENO (nebo CHYBA, pokud klíč nefunguje — appka
     to poctivě ukáže, klíč sama nikdy nikam nevypíše).
   - **Comparable Discovery Engine** začne u nových i existujících
     nemovitostí automaticky hledat srovnatelné nabídky přes FlatScan.
   - **Listing Discovery Engine** začne zkoušet dohledat původní inzerát,
     když uživatel vloží jen text/název bez URL.
   - Na detailu nemovitosti se navíc objeví panel **Lokalita** (medián/
     průměr Kč/m², počet aktivních nabídek, trend, odchylka nabídky od
     lokálního mediánu) a panel **Historie ceny — nalezený originál**
     (původní/aktuální cena, pokles, dny na trhu) — oba jen když FlatSkan
     pro danou lokalitu/nabídku skutečně data vrátí.

**Rozpočet API volání.** FlatScan Starter má limit 1 000 volání/měsíc.
Appka to respektuje dvouúrovňovou cache (výsledky hledání i jednotlivé
nabídky se cachují v databázi, výchozí platnost 24 h — nastavitelná v
`/settings` jako "TTL cache FlatScan dat"), takže stejný dotaz ze dvou
různých projektů ve stejné oblasti během 24 h nespotřebuje druhé volání.
Aktuální počet volání za tento měsíc vs. limit 1 000 je vidět přímo v
Provider Health u FlatScanu.

**Pozor — parametry `/listings` nejsou z brief dokumentace jisté.**
Integrace odesílá filtry jako `city`, `district`, `disposition`,
`area_min`/`area_max`, `price_max`, `ownership_type` — to je nejlepší odhad
z příkladu objektu nabídky, který jsi poskytl, ne z oficiální
dokumentace parametrů. Až budeš mít klíč a skutečnou dokumentaci, zkontroluj
`src/lib/sources/flatScan/provider.ts` (funkce `toFlatScanQuery`) a
`types.ts` (`FlatScanListingsQuery`) — pokud se přesné názvy parametrů liší,
uprav je tam. Odpovědi appka parsuje defenzivně (chybějící pole se nikdy
nedoplňují odhadem), takže i při drobném nesouladu parametrů appka nespadne,
jen prostě nic nenajde a poctivě to napíše do `comparableDiscoveryNote`.

Pole, která dokumentovaný příklad nabídky neobsahuje (`condition`,
`construction`, `floor`, `elevator`, `balcony`/`terrace`, `parking`,
`ownership`) appka čte defenzivně, pokud je FlatScan skutečně vrací — pokud
ne, zůstanou u daného comparable prázdná a similarity score se počítá jen
z polí, která reálně známe (stejně jako u všech ostatních zdrojů).

FlatScanův vlastní AI deal score (`/ai-scores`) appka **nikdy nepoužívá** —
DziFlip má vlastní, čistě matematický výpočet (Flip Score / MAX BUY PRICE),
FlatScanovo skóre by ho nemělo nijak nahrazovat ani ovlivňovat, takže tento
endpoint není v integraci vůbec volaný.

### 7.2 WEB_SEARCH (obecný, alternativní zdroj)

Kromě FlatScanu je k dispozici i obecný, providerem-neutrální zdroj —
**`WEB_SEARCH`** (`src/lib/sources/searchProvider.ts`) — nad libovolným
jiným licencovaným vyhledávacím/realitním datovým API, které bys chtěl
použít navíc nebo místo FlatScanu. Aktivace:

1. Nastav v proměnných prostředí `SEARCH_API_KEY` (a volitelně
   `SEARCH_API_URL`, pokud tvé API neběží na výchozí adrese v kódu).
2. API musí na `GET {SEARCH_API_URL}?municipality=...&district=...&...`
   (s `Authorization: Bearer {SEARCH_API_KEY}`) vracet JSON ve tvaru:
   ```json
   { "results": [
     { "url": "...", "title": "...", "price": 7490000, "areaM2": 64.3,
       "disposition": "2+1", "municipality": "Brno", "district": "Královo Pole",
       "condition": "Dobrý stav", "portal": "...", "photos": ["..."],
       "publishedAt": "2026-01-01T00:00:00Z", "description": "..." }
   ] }
   ```
   Chybějící pole appka nikdy nedoplňuje odhadem — položka bez `url`/`price`/
   `areaM2`/`disposition`/`municipality` se zahodí, ne vyplní naslepo.
3. Po nastavení klíče se `WEB_SEARCH` v Provider Health automaticky přepne
   na PŘIPOJENO a Comparable Discovery Engine i Listing Discovery Engine ho
   začnou používat — nic dalšího v kódu není potřeba měnit.

Bez tohoto klíče appka i nadále funguje — jen srovnatelné nabídky je nutné
doplňovat ručně (formulář „+ Přidat ručně" u Cenového enginu), přesně jako
dosud.

## 8. Gemini AI Renovation Visualization (image-to-image)

Skutečná vizualizace „před/po" nad Google Gemini (`src/lib/imageGen/gemini/`)
je hotová a čeká jen na klíč.

1. Získej API klíč pro Gemini API (https://ai.google.dev/ nebo Google AI
   Studio → API keys).
2. Nastav v proměnných prostředí Vercelu (Production, **Sensitive**, nikdy
   ne `NEXT_PUBLIC_...`):
   ```
   IMAGE_GEN_API_KEY=<tvůj klíč>
   ```
   Volitelně `GEMINI_IMAGE_MODEL`, pokud chceš přepsat výchozí
   `gemini-2.5-flash-image` (např. na novější preview model, jakmile ho
   budeš chtít vyzkoušet).
3. Po redeploy:
   - `/settings` → **Provider Health** → sekce „AI Renovation Visualization"
     ukáže `Google Gemini (image-to-image)` jako PŘIPOJENO (nebo CHYBA s
     posledním bezpečným chybovým hlášením, pokud klíč nefunguje).
   - Na detailu nemovitosti, u libovolné fotografie s vyplněným
     rekonstrukčním plánem (`RenovationPlan`), tlačítko „Vygenerovat"
     skutečně upraví PŮVODNÍ fotografii podle plánu (image-to-image edit,
     ne generování nové místnosti) a zobrazí ji vedle originálu jako
     „AI VIZUALIZACE".
   - Stejný požadavek (stejná fotka + styl/prompt + stejný rekonstrukční
     plán) podruhé nespotřebuje další placené volání — použije se
     existující výsledek z cache.

Bez tohoto klíče appka i nadále funguje přesně jako dosud — požadavek na
vizualizaci se uloží jako `NOT_CONFIGURED`, nikdy se nefingáže hotový
výsledek.

## 9. Shrnutí — co přesně nastavit ve Vercelu

| Proměnná | Hodnota |
|---|---|
| `DATABASE_URL` | Connection string k tvé Prisma Postgres databázi — Vercel ho vloží sám při připojení databáze k projektu |
| `FLATSCAN_API_KEY` | *(volitelné, ale doporučené)* Jakmile ho dostaneš od FlatScanu, přidej ho do Vercelu a redeployni — aktivuje automatické comparables, listing discovery, historii cen a lokalitní kontext (viz bod 7.1). Bez něj appka běží dál stejně jako dosud, jen bez těchto automatizací. |
| `IMAGE_GEN_API_KEY` | *(volitelné)* Google Gemini API klíč — aktivuje skutečnou AI vizualizaci rekonstrukce (viz bod 8). Výhradně server-side proměnná, nikdy `NEXT_PUBLIC_...`. |

Vše ostatní z `.env.example` (SMTP, SMS API, Vision API…) je **volitelné** —
appka bez nich normálně běží, jen příslušné funkce zůstanou v bezpečném
`PENDING_ACCESS`/`NOT_CONFIGURED` stavu, přesně jako lokálně.

**`DATABASE_URL` v Project Settings už je vyplněná skutečnou hodnotou z tvé
Prisma Postgres databáze → ano, můžeš kliknout Deploy.**
