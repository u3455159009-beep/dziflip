# Wakeify — budík s vlastní hudbou a chytrými úkoly

Wakeify tě budí tvojí oblíbenou hudbou uloženou přímo v telefonu, tedy bez internetu, i v režimu letadlo a po restartu. Vypnout ho jde až po splnění ranního úkolu: vyfotit předmět, vyřešit příklady, ujít kroky, naskenovat QR kód, nebo kombinaci těchto úkolů.

Platformy: **Android 7+** a **iOS 16.4+**. Na iOS 26+ se plánuje přes **AlarmKit**, na starších iOS přes oznámení.
Stack: **Expo SDK 57 / React Native 0.86 / TypeScript** + vlastní nativní modul `modules/wakeify-alarm` (Kotlin a Swift).

---

## 1. Analýza a volba technologie

| Kritérium | Expo + vlastní nativní modul ✅ | Flutter | Čistě nativní (2× kód) | Expo Go / jen JS |
|---|---|---|---|---|
| Spolehlivé buzení | ✅ přímý přístup k AlarmManager, službě v popředí a AlarmKit | ✅ přes platform channels | ✅ | ❌ nelze (bez služby v popředí a AlarmKitu) |
| Offline hudba | ✅ expo-file-system, MediaPlayer | ✅ | ✅ | ⚠️ jen v popředí |
| Oprávnění | ✅ nativní + Expo moduly | ✅ | ✅ | ⚠️ |
| Fotoaparát, QR, rozpoznávání obrazu | ✅ expo-camera (ML Kit / AVFoundation pro QR), vlastní engine v TS | ✅ | ✅ | ✅ |
| Moderní UI, jeden kód | ✅ | ✅ | ❌ dvě UI | ✅ |
| Údržba | ✅ TS + malý nativní modul | ✅ Dart | ❌ dvojí práce | — |

**Rozhodnutí:** Expo (Continuous Native Generation, EAS Build) s **vlastním nativním modulem** pro vše, co rozhoduje o spolehlivosti: plánování, zvonění, zamčenou obrazovku a restart. Hybridní framework sám o sobě nestačí. Proto je nativní jádro samostatné a funguje i bez spuštěného JS: po restartu, změně času nebo časového pásma si pravidla budíků přepočítá samo.

### Omezení OS, která návrh respektuje

- **Android:** přesné budíky vyžadují `USE_EXACT_ALARM`/`SCHEDULE_EXACT_ALARM`. Zobrazení přes zamčenou obrazovku vyžaduje `USE_FULL_SCREEN_INTENT` (od Androidu 14 ho může uživatel odebrat). Někteří výrobci (Xiaomi, Huawei…) agresivně uspávají aplikace. Po vynuceném zastavení aplikace Android zruší všechny její budíky.
- **iOS:** aplikace třetí strany nesmí běžet na pozadí kvůli zvonění. Jediná oficiální cesta je **AlarmKit (iOS 26+)**: zvoní i v tichém režimu a přes Soustředění. Vlastní zvuk ale musí být **kratší než 30 s, nepřehrává se ve smyčce** a **tlačítko Zastavit nejde odebrat**. Na starších iOS jsou k dispozici jen oznámení s 30s zvukem, která tichý režim neprorazí.
- **Streamovací služby** (Spotify, YouTube…) neumožňují spolehlivé přehrávání na pozadí ani offline mimo vlastní aplikace a mají licenční omezení. Wakeify proto přehrává jen lokální soubory.

---

## 2. Architektura

```
src/
  app/                 obrazovky (expo-router)
    (tabs)/            Budíky · Hudba · Ráno (statistiky) · Nastavení
    alarm/[id].tsx     editor budíku
    ring.tsx           zvonění + úkoly
    welcome.tsx        ranní uvítání
    permissions.tsx    spolehlivost / onboarding
    targets/           QR kódy, předměty k vyfocení
    track/[id].tsx     začátek skladby, přejmenování
    history.tsx
  domain/              čistá logika (100% testovaná): plánování, rotace úkolů,
                       matematika, statistiky, sezení zvonění, QR, krokoměr
  vision/              offline rozpoznávání fotek (TS) + kalibrační fixtures
  data/                SQLite schéma, migrace, repozitáře
  services/            most k nativnímu enginu, hudba, audio, foto, průběh zvonění
  state/AppProvider    stav aplikace, synchronizace, dohledání zmeškaných budíků
  ui/                  design systém (tokeny, komponenty, ovládací prvky)
modules/wakeify-alarm/ nativní engine
  src/WakeifyAlarm.types.ts   kontrakt JS ↔ nativní
  android/  AlarmManager.setAlarmClock, služba v popředí s MediaPlayerem,
            full-screen intent, obnova po restartu, direct boot
  ios/      AlarmKit (iOS 26+), záložní oznámení, export 29s klipu,
            opakované buzení
```

**Tok budíku.** Uložení budíku zapíše záznam do SQLite a zavolá `syncAlarms()`. Nativní engine dostane *pravidla* (hodina, minuta, dny, hlasitost, zvuk) a sám spočítá nejbližší čas. Když budík zazvoní:

- **Android:** služba v popředí přehrává skladbu (zesilování, smyčka, audio focus, vibrace). Full-screen intent otevře `wakeify://ring` i na zamčeném telefonu.
- **iOS:** AlarmKit přehraje 29s úryvek. Tlačítko „Otevřít Wakeify“ nebo spuštění aplikace zobrazí obrazovku zvonění, která systémový zvuk ztiší a pustí celou skladbu.

Obrazovka zvonění podle plánu (`resolveChallenge`) vybere úkol, uloží *sezení* (počet odložení, kdy začal úkol) a hned zapíše provizorní záznam „zmeškáno“. Po splnění úkolu se záznam změní na „úspěch“ a zavolá se `markOccurrenceHandled`, které zruší opakované buzení.

**Offline-first.** Vše je lokálně:

- budíky, úkoly, historie a nastavení v SQLite (WAL),
- skladby v `Documents/music`,
- předlohy fotek v `Documents/targets`.

Žádný účet ani síť. Datová vrstva (`SqlDb` + repozitáře) je oddělená, takže volitelnou cloudovou synchronizaci jde přidat bez zásahu do UI.

**Rozpoznávání fotek (offline).** Fotka se zmenší na 128 px a dekóduje v JS (`jpeg-js`). Pak se porovná s 1–3 předlohami pomocí kombinace deskriptorů:

- HSV histogram s vyvážením bílé (grey-world),
- prostorové rozložení barev,
- HOG (8×8 buněk × 9 orientací, Pearsonova korelace),
- rozložení jasu,
- dHash.

Prahy jsou **kalibrované na skutečných fotografiích** (scikit-image, matplotlib). Testovací varianty simulují „další ráno“: posun záběru, rotaci ±7°, tmu nebo přesvětlení, teplé světlo lampy, šum a jiný úhel pohledu.

Výsledek při střední přísnosti: **98,6 % pravých záběrů přijato, 0 % cizích scén přijato** (`npm run calibrate:vision`). Kontrola kvality odmítne zakrytý objektiv, tmu nebo prázdnou zeď. Po 3 neúspěšných pokusech se nabídne **alternativní ověření** (5 těžkých příkladů, v historii označeno jako „alternativní ověření“).

Jde o porovnání *konkrétního místa nebo předmětu* s předlohou, ne o obecné rozpoznávání objektů. Fotku oblohy tedy ověří, pokud je pořízená z podobného místa.

---

## 3. Stav funkcí — co je hotové a co ne

| Oblast | Stav | Ověřeno |
|---|---|---|
| Plánování (opakování, jednorázové, vynechání příštího, letní/zimní čas, změna časového pásma) | ✅ hotovo (TS i Kotlin) | 25 testů v TS + 18 JUnit testů v Kotlinu |
| Import hudby (MP3/M4A/AAC/WAV/AIFF/CAF/FLAC; OGG/Opus jen Android), ověření přehratelnosti, knihovna, mazání | ✅ | typecheck, Metro bundle |
| Stažení skladby z přímého odkazu pro offline použití | ✅ (streamovací služby jsou záměrně blokované) | — |
| Začátek skladby, hlasitost, postupné zesilování, vibrace, jiná skladba pro každý budík | ✅ | — |
| Android engine: setAlarmClock, služba v popředí, záložní zvuky, audio focus a hovory, obnova po restartu, direct boot, obnova po pádu procesu | ✅ napsáno | jádro se kompiluje proti Android API 35 jar; Expo vrstva zkontrolována proti zdrojům expo-modules-core; **neběželo na zařízení** |
| iOS engine: AlarmKit, opakované buzení, 29s CAF klip, záložní oznámení s limitem 64 požadavků | ✅ napsáno | syntakticky naparsováno, API ověřena proti dokumentaci Apple; **nekompilováno** (v prostředí chyběl Xcode) |
| Úkoly: matematika (3 obtížnosti, 1–10 příkladů), kroky (krokoměr OS, jinak akcelerometr), QR (generování, tisk, registrace existujícího kódu), fotka, kombinace | ✅ | doménová logika testovaná; matematika a uvítací obrazovka prokliknuté v prohlížeči (Playwright) |
| Rotace úkolů: stejný, týdenní plán (i automaticky vytvořený), každý den jiný, každý týden jiný, náhodně | ✅ | testy |
| Odložení (interval a maximum), série, statistiky, nejčastější časy vstávání, historie včetně zmeškaných | ✅ | testy |
| Uvítací obrazovka, afirmace (globální i pro každý budík), tmavý i světlý režim, přístupnost (role, popisky, ovládání čtečkou obrazovky) | ✅ | screenshoty |
| Cloudová synchronizace | ⏳ připravené rozhraní, neimplementováno | — |

**Automatické testy:**

- `npm test` spouští 73 testů v TS: doména, vision na reálných fotkách a repozitáře proti skutečnému SQLite.
- `npm run typecheck` je bez chyb.
- `npx expo export` úspěšně sestaví bundle pro Android i iOS.
- `npx expo prebuild` vygeneruje manifest, Info.plist i entitlements a autolinking najde nativní modul na obou platformách.
- Web preview (`npx expo start --web`) prošel v Playwrightu tokem *onboarding → nový budík → zvonění → 3 příklady → uvítání* bez chyb.

**Co je potřeba otestovat na zařízení** (v tomto prostředí nebylo Android SDK ani Xcode):

- zvonění při zamčené obrazovce a v Doze,
- režim letadlo,
- restart telefonu,
- fotoaparát a QR v reálu,
- AlarmKit s klipem v `Library/Sounds`,
- kompilaci Swift kódu pod Xcode 26.1.

Podrobný seznam rizik je v `modules/wakeify-alarm/ios/README.md` (sekce „Unverified on device“) a v `android/README.md`.

### Doporučený test na zařízení (cca 15 min)

1. Vytvoř budík a importuj MP3. V Nastavení → Spolehlivost povol vše.
2. Klepni na **„Zkušební budík za 10 s“** a zamkni telefon. Ověř, že se rozsvítí obrazovka a hraje skladba.
3. Zapni režim letadlo a zopakuj krok 2.
4. Nastav budík na +3 min, restartuj telefon a odemkni ho. Budík musí zazvonit.
5. Vyzkoušej každý typ úkolu a odložení (2×). Pak zkontroluj historii a statistiky.

---

## 4. Spuštění a vývoj

```bash
cd wakeify
npm install                 # .npmrc má legacy-peer-deps
npm test                    # unit testy
npm run typecheck
npx expo start --web        # rychlý náhled UI v prohlížeči (budíky nezvoní)
```

Expo Go **nestačí**, protože neobsahuje nativní modul. Aplikace to pozná a zobrazí upozornění „Budíky teď nezazvoní“. Pro skutečné buzení je potřeba vývojové sestavení:

```bash
# Android (Android Studio + SDK 35, připojený telefon s USB laděním)
npx expo run:android
# iOS (macOS, Xcode 26.1+, Apple Developer účet kvůli AlarmKitu na zařízení)
npx expo run:ios --device
```

### Sestavení přes EAS (bez lokálního Xcode / Android Studia)

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android   # APK
npx eas-cli@latest build --profile development --platform ios       # interní distribuce
npx eas-cli@latest build --profile production --platform all        # obchody
```

## 5. Instalace

- **Android:** stáhni APK z odkazu, který vrátí EAS build. Povol „Instalovat z neznámých zdrojů“ a nainstaluj. Při prvním spuštění projdi obrazovku Spolehlivost (přesné budíky, oznámení, zobrazení přes zamčenou obrazovku, bez omezení baterie).
- **iPhone:** zaregistruj zařízení příkazem `eas device:create` a sestav profil `development` nebo `preview`. Instalace proběhne přes QR odkaz od EAS. Pak v Nastavení → Soukromí → Režim vývojáře zapni vývojářský režim (iOS 16+). Pro App Store použij `eas submit`.

## 6. Oprávnění

| Oprávnění | Platforma | Proč |
|---|---|---|
| `USE_EXACT_ALARM` / `SCHEDULE_EXACT_ALARM` (≤ API 32) | Android | přesný čas zvonění (Wakeify je budík, splňuje pravidla Google Play) |
| `POST_NOTIFICATIONS` | Android 13+ | oznámení zvonícího budíku |
| `USE_FULL_SCREEN_INTENT` | Android | obrazovka zvonění přes zamčený displej |
| `FOREGROUND_SERVICE(_MEDIA_PLAYBACK)`, `WAKE_LOCK` | Android | přehrávání při vypnutém displeji |
| `RECEIVE_BOOT_COMPLETED` | Android | obnova budíků po restartu |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Android | výjimka z úsporného režimu (doporučeno) |
| `VIBRATE` | Android | vibrace |
| `CAMERA` | obě | úkoly s fotkou a QR kódem |
| `ACTIVITY_RECOGNITION` / `NSMotionUsageDescription` | obě | krokoměr |
| `NSAlarmKitUsageDescription` | iOS 26+ | systémové budíky |
| Time-sensitive notifications | iOS | záložní engine |
| Background audio | iOS | celá skladba, když je aplikace otevřená |

Blokovaná oprávnění: mikrofon, úložiště a „zobrazení přes jiné aplikace“ se nepoužívají.

## 7. Známá omezení

1. **iOS:**
   - Systémový budík přehraje jen **29 s** úryvek, a to jednou.
   - Wakeify proto plánuje **opakované buzení** (výchozí: každou minutu, 10×), dokud nesplníš úkol.
   - Tlačítko Zastavit na zamčené obrazovce nejde odebrat.
   - Celá skladba hraje, jakmile otevřeš aplikaci.
2. **iOS < 26:** buzení přes oznámení neprorazí tichý režim ani Soustředění a funguje omezeně (30s zvuky, limit 64 naplánovaných oznámení).
3. **Android:**
   - Po vynuceném zastavení aplikace v nastavení systému se budíky obnoví až po dalším spuštění Wakeify.
   - Před prvním odemčením po restartu zazní systémový tón místo skladby (soubor je v šifrovaném úložišti).
   - Smyčka skladby začíná od 0:00, ne od nastaveného začátku.
4. **Rozpoznávání fotek** porovnává s tvými předlohami, nejde o obecnou klasifikaci objektů. Při velmi odlišném osvětlení nebo úhlu záběru je k dispozici alternativní ověření.
5. Kroky z akcelerometru (záloha) jsou méně přesné než systémový krokoměr.
6. Na webu aplikace běží jen jako náhled UI, budíky tam nezvoní.

## 8. Návrhy dalšího rozvoje

- Widget s nejbližším budíkem a Live Activity na iOS.
- Úkoly: přepsat text, zatřást telefonem, „vstaň z postele“ (snímač blízkosti), čárový kód produktu.
- Volitelná on-device ML embedding síť (např. MobileNet přes TFLite / Core ML) jako druhý stupeň rozpoznávání fotek.
- Volitelná šifrovaná cloudová záloha (rozhraní `SqlDb` je připravené).
- Spánkový režim: postupné ztmavení obrazovky, uspávací playlist, chytré buzení v lehké fázi spánku (HealthKit / Health Connect).
- Sdílené výzvy a streaky s přáteli.
- Lokalizace (EN, DE), Apple Watch / Wear OS.
