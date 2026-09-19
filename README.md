# dziflip — analýza flipů nemovitostí

Osobní nástroj pro vyhledávání, analýzu a plánování flipů nemovitostí v ČR.
Vložíte odkaz nebo text inzerátu → aplikace extrahuje dostupné údaje, vypočítá
cenovou analýzu, maximální nákupní cenu, ekonomiku flipu a rozpočet rekonstrukce.

## Architektura

- **Next.js 14 (App Router) + TypeScript** — frontend i backend (API routes) v jednom projektu
- **Prisma + PostgreSQL** — lokálně přes Docker Compose (`docker-compose.yml`), v produkci přes
  libovolného Postgres providera (Vercel Postgres, Prisma Postgres, Neon, Supabase…) — viz
  [DEPLOY.md](./DEPLOY.md) pro nasazení na Vercel
- **Tailwind CSS** — prémiové minimalistické UI (bílá/béžová, zaoblené karty)
- Oddělené vrstvy v `src/lib/`:
  - `extract.ts` — extrakce údajů z textu/HTML inzerátu (regex heuristiky, nikdy nevymýšlí data)
  - `fetchListing.ts` — server-side stažení URL inzerátu
  - `calc.ts` — čistě matematický výpočtový engine (max. nákupní cena, Flip Score pásma, ekonomika, citlivostní analýza)
  - `sources/` — provider architektura pro zdroje inzerátů (`types.ts` rozhraní, `mockProvider.ts` DEMO fixture data, `srealityProvider.ts` stub čekající na povolený přístup, `registry.ts`)
  - `notifications/` — provider architektura pro Deal Alerts (in-app, e-mail, push/SMS stuby, `dispatcher.ts`)
  - `dealRadar.ts` — jádro Deal Radaru: dedup, extrakce, tvorba/aktualizace projektu, comparables, cenový engine, alerty
  - `outreach.ts` — kontaktní automatizace (šablony, DRAFT/AUTO pravidla, denní limit, ochrana proti duplicitě)
  - `confidence.ts` — deterministický Data Confidence engine (HIGH/MEDIUM/LOW z dostupnosti podkladů)
  - `dealFeed.ts` — sestavení „30sekundové karty“ pro Deal Feed a Deal Radar výsledky
  - `settings.ts` — singleton aplikační nastavení
  - `sms/` — SMS provider architektura (`mockProvider.ts` bezpečný test kanál, `realProvider.ts`
    generický REST stub čekající na `SMS_API_URL`/`SMS_API_KEY`/`SMS_SENDER_ID`, `registry.ts`)
  - `smsHub.ts` — jádro SMS Hubu: DEMO/REAL firewall, AUTO gate (9 pravidel), dedup, denní limit,
    blacklist, audit log, deterministická klasifikace příchozích SMS a parsování termínu

## Spuštění (lokální vývoj)

Vyžaduje Docker (pro lokální PostgreSQL) — viz [DEPLOY.md](./DEPLOY.md) pro nasazení na Vercel.

```bash
npm install
cp .env.example .env       # výchozí hodnoty odpovídají docker-compose.yml, funguje bez úprav
docker compose up -d       # spustí lokální PostgreSQL na localhost:5432
npx prisma migrate deploy  # aplikuje migrace z prisma/migrations/
npm run dev                # http://localhost:3000
```

Změna schématu: upravte `prisma/schema.prisma` a spusťte `npm run db:migrate -- --name popis_zmeny`
(vytvoří novou migraci v `prisma/migrations/` a rovnou ji aplikuje lokálně).

## Fáze 2 — Deal Radar, alerty a komunikace

- **Deal Radar** (`/radar`) — libovolný počet hlídačů s parametry (lokalita, městská část,
  dispozice, plocha, max. cena/Kč/m², stav, vlastnictví, min. zisk/ROI, max. odhad rekonstrukce,
  rezerva, jen nové nabídky, sledování změny ceny). Tlačítko „Spustit nyní“ prožene hlídač
  vybranými zdroji.
- **Zdrojová architektura**: `MOCK_DEMO` (vždy aktivní, jasně označená DEMO fixture data pro
  testování celého pipeline) a `SREALITY` (status `PENDING_ACCESS` — aplikace CAPTCHU ani
  anti-bot ochranu nikdy neobchází; integrace čeká na povolený zdroj dat/API).
- **Automatická analýza**: nová nabídka se dedupuje (portal+externalId), extrahuje, vytvoří se
  projekt, comparables (pokud je zdroj poskytne), cenový engine, Max Buy Price, cenové pásmo —
  vše stejnou matematikou jako v Ekonomice flipu. Bez dostatku dat (chybí prodejní cena z
  comparables) se nabídka nikdy neoznačí jako výjimečná.
- **Deal Feed** (`/feed`) — 30sekundová karta (foto, cena, Kč/m², odhad rekonstrukce, Max Buy
  Price, odhad prodeje, zisk, ROI, pásmo) s filtry (pásmo, min. zisk, lokalita, dispozice,
  nalezeno dnes) a rozklikávacím „PROČ?“ se zdroji a Data Confidence.
- **Deal Alerts** (`/alerts`) — inbox alertů se čtenými/nepřečtenými, odkazem na inzerát a časem
  nalezení. Notifikační providery: IN_APP (vždy funkční), EMAIL (čestně hlásí
  `NOT_CONFIGURED`, dokud nejsou v `.env` `SMTP_HOST`/`SMTP_FROM`), PUSH a SMS jsou připravené
  jako architektura bez funkčního backendu.
- **Price Drop Watch** — historie nabídkové ceny na detailu nemovitosti, ruční i automatický
  (z Deal Radaru) záznam, okamžitý přepočet ekonomiky flipu po změně ceny.
- **Kontakt a automatizace komunikace** — modul Kontakt (jméno, telefon, e-mail, RK, stav
  komunikace v 7 stavech), tři režimy DRAFT/OFF/AUTO (výchozí **DRAFT**), výchozí šablona žádosti
  o prohlídku (upravitelná), denní limit zpráv, ochrana proti duplicitnímu kontaktování, log
  každého pokusu o odeslání. AUTO vyžaduje explicitní potvrzení v Nastavení a nikdy neproběhne
  bez HIGH Data Confidence — jinak se bezpečně vrátí k návrhu (DRAFT).
- **Data Confidence** — HIGH/MEDIUM/LOW odvozené výhradně z ověřenosti ceny/plochy, počtu
  comparables a reálně zadaného rozpočtu; nikdy z pocitového AI skóre.
- **Nastavení** (`/settings`) — výchozí zisk/ROI/rezerva/Kč za m² rekonstrukce, preferované
  lokality, notifikace, automatizace kontaktování, šablony zpráv.

## Fáze 3 — SMS Hub

Pouze textové zprávy — telefonní hovory nejsou a nebudou implementovány.

- **SMS provider architektura** (`src/lib/sms/`): `MOCK_SMS` (vždy aktivní, bezpečný testovací
  kanál, nikdy nic skutečně neodešle) a `REAL_SMS` (generický REST stub, `PENDING_CONFIG` dokud
  nejsou v `.env` `SMS_API_URL`/`SMS_API_KEY`/`SMS_SENDER_ID`). **DEMO firewall**: nemovitost s
  `isDemo: true` se vždy odesílá přes `MOCK_SMS`, ať je `REAL_SMS` nakonfigurován, nebo ne —
  nikdy nejde na skutečného providera.
- **SMS na detailu nemovitosti** — sekce „SMS“ s konverzací ve stylu chatu (odeslané/přijaté,
  čas, stav, DEMO/MOCK/REAL odznak), souhrnný pruh Kontakt/Telefon/Poslední SMS/Stav
  komunikace/Další krok, a návrhy ke schválení s tlačítky Schválit a odeslat / Odeslal(a) jsem
  ručně / Zahodit.
- **Tři režimy** OFF/DRAFT/AUTO (výchozí **DRAFT**). AUTO vyžaduje explicitní potvrzení v
  Nastavení (checkbox + potvrzovací tlačítko) a nikdy se neaktivuje samo.
- **9 pravidel pro AUTO SMS** (`checkAutoSmsAllowed` v `smsHub.ts`, každý krok se loguje):
  nabídka splňuje Deal Radar kritéria (cenové pásmo), telefon je ze zdrojových dat kontaktu,
  Data Confidence = HIGH, nemovitost není DEMO, žádná duplicitní úvodní SMS na stejné číslo ke
  stejné nemovitosti, nepřekročen denní limit, číslo není na blacklistu, režim AUTO je aktivní a
  potvrzený. Jakékoliv selhání → bezpečný pád zpět na DRAFT s uvedeným důvodem.
- **Blacklist (NEKONTAKTOVAT)** — telefonní čísla lze označit v Nastavení nebo přímo u konverzace;
  blokuje automatické i ručně schválené odeslání.
- **Příchozí SMS** — webhook `/api/sms/webhook` (připraveno pro budoucího poskytovatele,
  volitelné `SMS_WEBHOOK_SECRET`), přiřazení k nemovitosti podle historie předchozí komunikace
  nebo shody telefonu v kontaktu; při nejednoznačnosti končí v „Nepřiřazené SMS“ a nikdy se
  nepřiřadí náhodně.
- **Deterministická klasifikace** (žádná AI) — rozpoznává „Nabízí prohlídku“, „Chce zavolat“,
  „Nemovitost prodána“, „Nemá zájem“, „Chce další informace“ podle klíčových slov (funguje i bez
  diakritiky), jinak vždy `UNKNOWN`. Regex rozpoznává i navržený termín prohlídky (datum/čas) a
  zobrazí jej jako návrh — nikdy jej automaticky nepotvrzuje.
- **Odpovědi na termín** — tlačítka Připravit odpověď / Potvrdit text / Navrhnout jiný termín
  vždy jen připraví DRAFT; automatické odpovědi jsou v Nastavení defaultně **vypnuté** a i po
  zapnutí appka nikdy sama nepotvrzuje schůzku bez vašeho výslovného odeslání.
- **`/messages`** — SMS Hub inbox s pěti sekcemi (Nové, Čekající na mou odpověď, Odeslané,
  Nepřiřazené, Archiv) a ručním přiřazením nepřiřazených zpráv k nemovitosti.
- **Deal Feed** — každá karta má stav SMS (SMS neodeslána / SMS draft / SMS odeslána / Makléř
  odpověděl / Prohlídka navržena), odvozený z reálné konverzace.
- **Audit log** (`SmsAuditLog`, endpoint `/api/projects/[id]/sms-audit`) — každé rozhodnutí
  (i důvod, proč SMS NEBYLA odeslána) je uloženo s časem, krokem a výsledkem PASS/FAIL/INFO.

## Stav aplikace

### CO UŽ FUNGUJE
- Vložení URL nebo textu inzerátu → automatická extrakce údajů s vyznačením
  **OVĚŘENO / ODHADNUTO / NEZNÁMÉ** u každého pole (nikdy se nic nevymýšlí)
- Ruční oprava/doplnění libovolného pole (okamžitě označeno jako OVĚŘENO)
- Cenový engine se srovnatelnými nemovitostmi (ruční přidávání, průměr/medián/rozpětí Kč/m²,
  jasné rozlišení nabídková/odhadovaná/realizovaná cena)
- Flip Score (🔴🟠🟢⚡) počítaný matematicky z vašich parametrů, ne odhadem AI
- Maximální nákupní cena (MAX BUY PRICE) s live přepočtem při změně jakéhokoli čísla
- Kompletní ekonomika flipu (3 scénáře: konzervativní/základní/optimistický, marže, ROI)
- Interaktivní citlivostní analýza (matice cena × náklady rekonstrukce)
- Fotografie — galerie, ruční třídění dle místnosti a poznámky
- Rekonstrukční rozpočet po položkách i místnostech, kategorie, 3 cenové varianty
- Historie projektů (6 stavů) a porovnání 2–5 nemovitostí vedle sebe
- Deal Radar, Deal Feed, Deal Alerts, Price Drop Watch, Kontakt/DRAFT-AUTO komunikace, Data
  Confidence a Nastavení — viz sekce Fáze 2 výše
- SMS Hub (konverzace, DRAFT/AUTO, 9 bezpečnostních pravidel, blacklist, příchozí SMS,
  klasifikace, `/messages` inbox, audit log) — viz sekce Fáze 3 výše

### CO JE ZATÍM MOCK/DEMO
- Nic není fingované — chybějící data jsou vždy označena NEZNÁMÉ, nikdy nejsou nahrazena
  vymyšlenými hodnotami. "Levná/Premium" varianta rozpočtu je transparentní procentní odchylka
  od skutečně zadané "doporučené" varianty, ne reálně dohledaná data.
- Zdroj `MOCK_DEMO` v Deal Radaru je pevná, jasně označená (`isDemo: true`, badge „DEMO“
  všude v UI) sada 14 ukázkových nabídek — slouží k ověření celého pipeline (dedup, comparables,
  cenový engine, price drop, alerty), ne k reálnému vyhledávání. `/api/demo/simulate-price-drop`
  je testovací nástroj, který mění jen tuto fixture data, nikdy reálný projekt přímo.
- E-mailové odeslání žádosti o prohlídku: bez `SMTP_HOST`/`SMTP_FROM` v `.env` aplikace zprávu
  vždy jen připraví/zaloguje se stavem `BLOCKED_NO_PROVIDER` a nikdy nepředstírá odeslání;
  uživatel může zprávu poslat sám a označit tlačítkem „Odeslal(a) jsem ručně“.

### CO POTŘEBUJE EXTERNÍ API (zatím nepřipojeno)
- **Sreality.cz a další portály** — provider je připraven (`src/lib/sources/srealityProvider.ts`),
  ale status zůstává `PENDING_ACCESS`, dokud nebude k dispozici oficiální API nebo licencovaný
  feed; aplikace nikdy neobchází CAPTCHU ani anti-bot ochranu.
- **Reálné odesílání e-mailů** — potřeba SMTP nebo transakční e-mail API (viz `SMTP_HOST`/`SMTP_FROM`)
- **Reálné odesílání SMS** — provider je připraven (`src/lib/sms/realProvider.ts`), stačí doplnit
  `SMS_API_URL`/`SMS_API_KEY`/`SMS_SENDER_ID` a případně upravit tvar požadavku podle konkrétního
  vybraného poskytovatele (viz doporučení níže)
- **Push notifikace** — architektura připravena (`src/lib/notifications`), chybí konkrétní
  provider (např. FCM/APNs)
- **Zpracování odpovědí makléřů** — datový model (`OutreachMessage.direction = INBOUND`) i
  přiřazení k nemovitosti jsou připraveny, chybí napojení na e-mailovou schránku (IMAP/webhook)
- **Příchozí SMS od reálného providera** — webhook `/api/sms/webhook` je hotový a funkční, stačí
  jej nastavit jako callback URL u zvoleného SMS providera
- **Automatické vyhledávání srovnatelných nemovitostí** z reálného trhu — nyní se přidávají ručně
  nebo je poskytne zdrojový provider (u DEMO fixture); potřeba API/feed realitních portálů
- **AI analýza fotografií** (rozpoznání místnosti, stav, co opravit/vyměnit) — potřeba Vision API
- **AI vizualizace rekonstrukce** (před/po) — potřeba image-generation API zachovávající
  perspektivu a geometrii místnosti
- **Vyhledávání konkrétních produktů a cen** pro nákupní seznam — potřeba API e-shopů/vyhledávání
- Extrakce z URL funguje jen pro portály, které vykreslují obsah na serveru; portály náročné
  na JavaScript (např. sreality.cz) vrátí málo dat — aplikace na to upozorní a vyzve k vložení
  textu inzerátu ručně

### DALŠÍ KROKY
1. Připojit reálný datový zdroj pro Sreality.cz (nebo jiný portál) přes povolené API/feed
2. Nastavit SMTP a dokončit reálné odesílání e-mailů (architektura je hotová)
3. Vybrat SMS providera pro ČR a doplnit `SMS_API_URL`/`SMS_API_KEY`/`SMS_SENDER_ID`
   (architektura + webhook jsou hotové) — viz doporučení níže
4. Napojit Vision API pro analýzu fotografií místnost po místnosti
5. Napojit image-generation API pro vizualizace rekonstrukce (PŘED/PO)
6. Napojit produktové vyhledávání pro automatický nákupní seznam
7. Napojit příjem e-mailových odpovědí makléřů (IMAP/webhook) na `OutreachMessage`
8. Rozšířit extrakci o další portály a strukturovaná data (JSON-LD), kde jsou dostupná

### DOPORUČENÍ NA SMS PROVIDERA PRO ČR
Hledejte providera s: (1) REST API s doručenkami (delivery receipts) a webhookem pro příchozí
SMS, (2) vlastním/ověřeným odesílajícím číslem nebo alfanumerickým senderem akceptovaným v ČR,
(3) rozumnou cenou za segment a podporou dvoucestné komunikace (obousměrné SMS), (4) API klíčem
s omezeným oprávněním jen na SMS (ne celý účet). V ČR typicky přichází v úvahu např. SMSbrana.cz,
GoSMS, SmsManager.cz nebo mezinárodní Twilio/Vonage s českým číslem — porovnejte cenu za SMS,
rychlost doručení a kvalitu webhooků. Po výběru upravte tvar požadavku v
`src/lib/sms/realProvider.ts` (`send()`) podle dokumentace zvoleného providera a nastavte
webhook u providera na `/api/sms/webhook` (volitelně chráněný `SMS_WEBHOOK_SECRET`).

Citlivé API klíče patří výhradně do `.env` (server-side), nikdy do klientského kódu —
viz `.env.example` pro připravené proměnné budoucích integrací.
