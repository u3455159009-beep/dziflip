# dziflip — analýza flipů nemovitostí

Osobní nástroj pro vyhledávání, analýzu a plánování flipů nemovitostí v ČR.
Vložíte odkaz nebo text inzerátu → aplikace extrahuje dostupné údaje, vypočítá
cenovou analýzu, maximální nákupní cenu, ekonomiku flipu a rozpočet rekonstrukce.

## Architektura

- **Next.js 14 (App Router) + TypeScript** — frontend i backend (API routes) v jednom projektu
- **Prisma + SQLite** (`prisma/dev.db`) — databáze projektů, srovnání, rozpočtu a fotografií
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

## Spuštění

```bash
npm install
cp .env.example .env   # výchozí SQLite databáze, funguje bez úprav
npx prisma db push     # vytvoří dev.db
npm run dev            # http://localhost:3000
```

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
- **Push notifikace a SMS** — architektura připravena (`src/lib/notifications`), chybí konkrétní
  provider (např. FCM/APNs, Twilio)
- **Zpracování odpovědí makléřů** — datový model (`OutreachMessage.direction = INBOUND`) i
  přiřazení k nemovitosti jsou připraveny, chybí napojení na e-mailovou schránku (IMAP/webhook)
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
3. Napojit Vision API pro analýzu fotografií místnost po místnosti
4. Napojit image-generation API pro vizualizace rekonstrukce (PŘED/PO)
5. Napojit produktové vyhledávání pro automatický nákupní seznam
6. Napojit příjem e-mailových odpovědí makléřů (IMAP/webhook) na `OutreachMessage`
7. Rozšířit extrakci o další portály a strukturovaná data (JSON-LD), kde jsou dostupná

Citlivé API klíče patří výhradně do `.env` (server-side), nikdy do klientského kódu —
viz `.env.example` pro připravené proměnné budoucích integrací.
