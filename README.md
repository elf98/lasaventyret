# Läsäventyret

Webbapp (PWA) som lär Oscar, 6 år, att läsa svenska med ljudningsmetoden. Byggd för iPad i
landskapsläge. Ingen text behövs för att navigera: allt läses upp med en neural svensk röst.

## Köra lokalt

```
npm install
npm run dev        # http://localhost:5180  (även på LAN-IP för iPaden)
npm run test       # motor-tester (behärskning, passbyggare, upplåsning)
npm run build      # typkontroll + produktionsbygge till dist/
```

Dropbox låser filer i `node_modules` och `dist`. Båda mapparna är markerade `com.dropbox.ignored`
(PowerShell: `Set-Content -Path dist -Stream com.dropbox.ignored -Value 1`) och Vites cache ligger i
tempkatalogen. Får du `EBUSY`/`EPERM` ändå: pausa Dropbox en stund.

Testläge: kryssrutan "Alla planeter öppna" i föräldravyn, eller öppna appen en gång med
`?unlockAll=1` i adressen (`?unlockAll=0` stänger av). I dev öppnar `?task=build-word:mor` en enda uppgift.

## Generera ljud (Azure TTS)

1. Skapa en Speech-resurs i Azure (gratisnivån räcker: 500 000 tecken/mån).
2. Kopiera `.env.example` till `.env` och fyll i `AZURE_SPEECH_KEY` och `AZURE_SPEECH_REGION`.
3. Kör:

```
npm run audio:list   # visar alla ljud-id och vilka som saknas
npm run audio        # genererar bara det som saknas eller ändrats
npm run audio -- --force            # gör om allt (t.ex. byte av röst)
npm run audio -- --only phrase.     # bara id:n med visst prefix
```

Ljudet hamnar i `public/audio/*.mp3` med `public/audio/manifest.json` som index. Manifestet
hashar röst + SSML per id, så en ändrad fras genereras om automatiskt. Röst byts med
`AZURE_VOICE` (`sv-SE-SofieNeural` är standard, `sv-SE-MattiasNeural` finns också).

Utan ljudfiler är appen tyst (kort paus i stället för tal). Den använder aldrig Web Speech API.

### Bokstavsljud

Bokstäverna sägs som ljud ("sss", inte "ess") via IPA-fonem i `src/content/letters.json`
(`ipa`-fältet). Vokalerna är de **korta** ljuden (a som i katt, o = ʊ som i ost): läses bokstaven som
text blir det långa "aa", och o blir identiskt med å (undantag: e läses som text, det lät bäst).
Azure ignorerar längdmarkering (ː) och aspiration (ʰ) på konsonanter; hållbara konsonanter skrivs
därför som upprepade fonem ("ss", "mm", "rr", "fff") och p/t/k som "ph"/"th"/"kh" (pust utan vokal).
b/d/g får en kort schwa ("bə"). Valfria fält per bokstav: `say` (läs som text/SSML i stället för IPA)
och `rate` (eget tempo). Egen inspelning i föräldravyn går alltid före TTS. Ord som rösten uttalar fel (Hurra, Startrampen) rättas i
`PRONOUNCE` i `scripts/generate-audio.ts` (IPA eller omstavning).

## Lägga till innehåll

Allt innehåll ligger i `src/content/*.json`. Ändra JSON, kör `npm run audio`, klart.

| Fil | Innehåll |
|---|---|
| `letters.json` | bokstäver i inlärningsordning, ljud (IPA), exempelord |
| `words.json` | ord med emoji och ljudsekvens (`sounds`); `pair` = minimalt par i vokallängd (tak/tack), partnern läggs alltid bland alternativen i Vilket ord?; `decodable: false` = kluster/dubbelteckning, väntar på Verkstan; tom `emoji` = stavelse utan bild (bara riktiga småord) |
| `phrases.json` | alla instruktioner, beröm (`praise_*`, dras ur en blandad kortlek utan upprepning), knappetiketter (id → text) |
| `levels.json` | planeter: bokstäver, spel, vad som krävs för upplåsning, position på kartan |
| `mascots.json`, `names.json` | maskoter och namnförslag |
| `outfits.json`, `stickers.json` | kläder (stjärntröskel) och klistermärken |
| `config.json` | barnets namn, uppgifter per pass, andel repetition, passlängd |
| `sightwords.json` | ordbilder – **bara de allra vanligaste orden barnet känner igen direkt** (och, är, jag, det, hej, mamma, pappa); de/dem, mig/dig/sig och mycket är för svåra för en sexåring och ligger inte här. Ljudenliga småord (har, kan, inte ...) ligger i `words.json` och avkodas på Vardagsplaneten; Ordplaneten kör mest Vilket ord? (3 alternativ på lätt, annars 4) med ett memory per pass, påbörjade ord först |
| `rhymes.json` | rimpar av ord-id (båda måste ha emoji) |
| `sentences.json` | tokiga meningar: text, rätt bild (emoji), två fel bilder; 41 st, fördelade på Småmeningar (korta) och Tokplaneten (längre) via `sentences` i levels.json |
| `stories.json` | berättelser: titel, meningar och `questions` (två per berättelse: en om innehållet, en om ordningen), var och en med tre bild-alternativ och index för rätt svar |

Nytt ord: lägg till en rad i `words.json` med `id`, `text`, `emoji`, `sounds` och kör
`npm run audio`. Ny fras: lägg till nyckel i `phrases.json` och använd `phraseId('nyckel')`.

## Pedagogik och motor

- `src/engine/mastery.ts` – behärskning: tre rätt i rad (ordbilder, meningar, berättelser: två)
  spridda över minst två pass. **Ett fel backar ett steg**, inte till noll; behärskning tappas först när
  raden är helt borta (tre fel i rad). Repetitionsintervall 0/1/3/7/14/30 dagar, fördubblas efter behärskning.
- `src/engine/sessionBuilder.ts` – bygger ett pass: varje bokstav i nivån minst en gång, resten
  viktat mot det svaga, plus ~25 % repetition från tidigare planeter (förfallna först). Ordandelen
  (Ljudtåget/Bygg ordet) växer från 25 % till 60 % i takt med att planetens bokstäver behärskas.
  Ord väljs bara bland dem vars alla ljud barnet mött (`decodable: true`, kända bokstäver).
  Stavelser utan bild körs bara i Ljudtåget och är bara riktiga småord (sa, la, se); påhittade
  stavelser som "mi" är borttagna. Bildord varvar Bygg ordet och Ljudtåget. Så länge någon av
  planetens bokstäver är obehärskad prioriteras den i passet och trängs inte ut av ordandelen.
- `src/engine/unlock.ts` – en planet är klar vid 80 % behärskade bokstäver; nästa låses upp.
- Två fel i rad på samma uppgift ger scaffolding (bara rätt bokstav visas, pekare, långsamt ljud).

## Spel

| Spel | Fil | Tränar |
|---|---|---|
| Fånga ljudet | `src/games/CatchSound.tsx` | bokstav–ljud; bokstäverna flyger nästan dubbelt så långsamt på Lätt |
| Första ljudet / Sista ljudet | `src/games/SoundHunt.tsx` | hör ordet, välj bokstaven för första respektive sista ljudet (ingen läsning) |
| Räkna ljuden | `src/games/CountSounds.tsx` | hör ordet, välj hur många ljud det har; prickarna tänds när ordet ljudas |
| Ljudsortering | `src/games/SoundSort.tsx` | m eller n: hör ordet, se bilden, tryck på bokstaven som finns i ordet |
| Ljudtåget | `src/games/SoundTrain.tsx` | ljuda ihop i ordning, sedan välja rätt bild. Ordet sägs först EFTER bildvalet: barnet ska göra syntesen själv |
| Bygg ordet | `src/games/BuildWord.tsx` | dra/tryck brickor till rutor, ordet ljudas ihop |
| Läs och välj | `src/games/ReadWord.tsx` | ordet står skrivet, tre bilder, ordet läses INTE upp: ren avkodning. Efter två fel ljudas ordet fram |
| Vilket ord? | `src/games/WhichWord.tsx` | hör ett ord, välj rätt skrivet ord; alternativen liknar målordet (mus/mun/mor) så hela ordet måste läsas |
| Ordbilds-memory | `src/games/SightMemory.tsx` | fyra par ordbilder, VERSALER mot gemener (OCH + och) så att korten måste läsas; tysta tills ett par hittats |
| Rimjakt | `src/games/RhymeHunt.tsx` | hör ett ord, välj bilden som rimmar (`rhymes.json`) |
| Tokiga meningar | `src/games/SillySentences.tsx` | läs själv, välj rätt bild; högtalaren läser ord för ord (`sentences.json`) |
| Berättelse | `src/games/StoryReader.tsx` | 3–5 meningar, pil för nästa, två bildfrågor, sedan hela texten samlad för omläsning (bygger flyt) |

Nytt spel: skapa komponent med samma props (`task`, `scaffold`, `celebrating`, `onWrong`, `onSolved`),
lägg till id i `GameId` (`src/content/index.ts`), i `AVAILABLE_GAMES` (`src/games/index.ts`), i
passbyggaren och i `SessionScreen.tsx`, och lista spelet på planeterna i `levels.json`.

## Planeter och klarkrav

`levels.json` har `kind`: `letters` (bokstäver + ord), `sightwords`, `contrast` (Tvillingplaneten m/n, Spegelplaneten b/d och Prickplaneten å/ä; ingen Fånga ljudet här – ett ensamt m/n går inte att avgöra utan jämförelse, så varje uppgift ger sammanhang:
Fånga ljudet med bara de två + Ljudsortering: hör ordet, se bilden, välj bokstaven; egen räkning per ord), `words` (given ordlista: Vardagsplaneten
22 vanliga småord utan bild, Ordfabriken korta ord, Rymdstationen långa ord, Dubbelplaneten dubbeltecknade och vokallängd,
Stjärnfabriken kluster; ord utan bild körs i Ljudtåget, Bygg ordet och Vilket ord?), `cluster`
(Turboverkstan: alla ord med `decodable: false`), `sentences` (med `sentences`-urval: Småmeningar de korta,
Tokplaneten de längre), `stories`, `phonology` (Startrampen, bonus: fyra ljudlekar över en kurerad ordlista). Varje planet har ett `goal` som läses
upp i planetrutan (långtryck på planeten). En planet är klar när en andel av dess innehåll behärskas
(`src/engine/unlock.ts`): bokstäver 80 %, ordbilder 80 %, ordlistor 70 %, kluster 50 %, meningar 50 %,
berättelser 60 %, ljudlekar 40 %. Ordningen: Sol, Månen, Mars, Tvillingplaneten, Kometen, Ordplaneten, Ringplaneten, Prickplaneten, Racerbanan,
Spegelplaneten, Vardagsplaneten, Ordfabriken,
Rymdstationen, Robotplaneten, Dubbelplaneten, Stjärnfabriken, Turboverkstan, Småmeningar, Tokplaneten,
Sagoplaneten. Kartan är 301 vw bred och panoreras med finger/mus eller pilknapparna.

## Svårighetsgrad och genvägar

Föräldravyn: Lätt/Medel/Svår styr ordandel (25/45/60 % som grund), max stavelser utan bild (2/1/0) och
ordspelens ordning. **Skrivstil** (VERSALER / gemener / blandat, `letterCase` i settings) styr hur ord
visas i Läs och välj, Vilket ord?, meningar och berättelser; bokstavskorten visar alltid båda formerna,
och memory parar alltid ihop versal med gemen. Blandat ger samma ord samma form varje gång. Planeter kan bockas som klara där, så att nästa låses upp direkt.

## Bokstavsljud

Alla bokstäver via IPA-fonem; vokalerna som korta ljud (se ovan). Stopp-ljuden
(p, t, k, b, d, g) blir aldrig bra i TTS. Spela in dem själv i föräldravyn (🎙️): inspelningen sparas i
IndexedDB, går alltid före TTS och följer med i Exportera/Importera (base64) så att den kan flyttas från
datorn till iPaden. Inspelning kräver https eller localhost.

## Stjärnor och belöning

Varje pass ger 1–3 stjärnor (`src/engine/rating.ts`): 3 = alla uppgifter lösta med högst ett fel,
2 = högst två uppgifter som krävde fler försök, annars 1. Måttet är "rätt inom två försök", inte
felfritt, så att det lönar sig att våga pröva. Behärskning (mastery) kräver fortfarande felfritt. Under passet visas hur många stjärnor som fortfarande går
att få. Klädtrösklarna i `outfits.json` är satta efter den skalan; gamla sparfiler (version 1, stjärnor
per uppgift) skalas ner med 5 vid migrering och import. Tre tryck på 1,2 sekunder ger en kort paus
("Lugn! Lyssna först") där inga tryck når spelet, och i Ljudtåget räknas nästa vagn först när förra
vagnens ljud spelats klart.

## Föräldravyn

Utöver nivå, skrivstil och planetbockar visas **förväxlingar**: bokstavspar barnet blandat ihop
(minst två gånger), vanligast först. Ett par högt upp pekar direkt på vilken tvillingplanet som
behöver köras. Felen loggas i `confusions` när både rätt svar och det valda alternativet är
bokstäver. Där finns också en påminnelse om att skriva dagens bokstäver på papper efter passet.

## Progress

Sparas i localStorage (`lasaventyret-progress-v1`, persist-version 2). Full spelinstruktion ges
bara de två första gångerna ett spel möts (`gamesSeen`), därefter alltid den korta cuen. Export/import som JSON finns i föräldravyn
(håll in kugghjulet 3 s + räkneuppgift).

## Egna ord

Föräldravyn, avsnittet Egna ord: skriv ordet, välj emoji, spela in uttalet (krävs, det finns ingen TTS
i appen vid körning). Ordet registreras i den vanliga ordlistan och dyker upp i Ljudtåget, Bygg ordet
och Vilket ord? när barnet mött ordets bokstäver. Sparas i IndexedDB och följer med i export/import.

## Ljudregler

Allt tal går via `audio.speak()`/`audio.speakEach()` i `src/audio/AudioManager.ts`: ett nytt anrop
avbryter det pågående, även ljud som ännu inte laddats. Anropa aldrig `audio.play()` direkt från spel,
då kan två röster överlappa.

## Deploy

1. DNS: A-post `lasaventyret.elf98.com` → 159.89.22.162.
2. På servern (PuTTY): kopiera `deploy/apache-lasaventyret.conf` till `~/lasaventyret.conf` och kör
   raderna i `deploy/server-setup.sh` (vhost, `a2ensite`, certbot). Vhosten är IP-baserad enligt
   serverns konvention.
3. Här: `.\deploy.ps1` bygger och kopierar `dist/` med tar över ssh till `/var/www/lasaventyret/`.
   HTTPS krävs för PWA-installation och mikrofon på iPaden.

## Status per fas

- [x] Fas 1: grund, ljudsystem, maskot, karta, progressmodell, föräldralås, Fånga ljudet
- [x] Fas 2: alla bokstäver i spel, Bygg ordet, Ljudtåget, klistermärkesbok, adaptiv repetition (ord + bokstäver)
- [x] Fas 3: ordbilder (Vilket ord?, memory), Rimjakt, Turboverkstan (kluster/dubbelteckning), Tokiga meningar, miniberättelser, svårighetsgrad
- [x] Fas 4: inspelning av bokstavsljud, egna ord med bild, export/import av allt, PWA-manifest
- [x] Deploy: live på https://lasaventyret.elf98.com sedan 13 sep 2026 (DNS i Cloudflare, IP-baserad vhost, certbot). Uppdateringar: `.\deploy.ps1`
