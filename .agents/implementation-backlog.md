# Lista prac implementacyjnych

Kontekst zadań dla agentów; zobacz [indeks](README.md). Wyniki i polecenia
przekazania poniżej są zapisem sesji, nie upoważnieniem do działań w nowym zadaniu.

Stan przeglądu: 2026-10-20. Źródła: [README](../README.md),
[FIXME.md](history/FIXME.md), komentarze TODO w `js/`
oraz nieaktywne pozycje menu i ustawień. To audyt repozytorium, a nie pełna
inwentaryzacja wszystkich funkcji najnowszego Paint.NET. Pierwsza partia
(punkty 1–6) oraz punkty 8–18 zostały zaimplementowane w opisanym poniżej zakresie. Punkt 7 jest odłożony
na decyzję użytkownika; pozostałe pozycje pozostają planem prac.

Skala: **S** — mała, lokalna zmiana; **M** — kilka współpracujących komponentów;
**L** — większa funkcja lub praca wymagająca pomiarów; **XL** — osobny projekt.
Priorytet P1 oznacza proponowaną pierwszą partię, P2 kolejne usprawnienia,
a P3 prace odłożone. Szacunki wymagają doprecyzowania przy wdrażaniu.

## P1 — ukończona pierwsza partia (1–6)

Wdrożono trwałą listę dziesięciu ostatnich plików (ścieżki desktopowe i uchwyty
przeglądarki), przejście Pomoc → Pluginy, własne kursory przesuwania i obrotu,
modalny stan zajętości przed końcowym przeliczeniem dużej transformacji,
trwały przełącznik automatycznych aktualizacji oraz transakcje operacji historii
z odtwarzaniem dokumentu po wykrywalnym błędzie. Zwykłe pobrania przeglądarkowe
bez uchwytu nie trafiają na listę ostatnich plików. Przełącznik aktualizacji web
steruje kontrolami i monitami aplikacji; nie wyłącza mechanizmów przeglądarki.
Ręczne sprawdzanie pozostaje dostępne na obu platformach.

Poniższa tabela zachowuje zakres zleconych zadań. Testy obejmują zapis i ponowne
odczytanie listy, brakujące pliki, błędy uprawnień i magazynu, sprzątanie stanu
zajętości oraz zachowanie pikseli i historii po błędach alokacji.

| ID | Zadanie | Skala | Zakres i kryterium ukończenia | Miejsce w kodzie |
| --- | --- | --- | --- | --- |
| 1 | Ostatnio otwierane dokumenty | M | Działające podmenu, trwała lista, deduplikacja, czyszczenie, obsługa brakujących plików. Desktop przechowuje ścieżki; web wymaga osobnego rozwiązania dla uchwytów i uprawnień. Otwarcie korzysta z istniejącej ścieżki DocumentIO. | [FileMenu](../js/src/interface/panel/header/main/menu/FileMenu.js), [DocumentIO](../js/src/io/DocumentIO.js) |
| 2 | Pomoc → Pluginy | S | Nieaktywna pozycja otwiera istniejącą stronę ustawień pluginów lub dokumentację JS API. Nie wymaga obsługi DLL. | [HelpMenu](../js/src/interface/panel/header/settings/HelpMenu.js) |
| 3 | Kursory przesuwania i obracania | S/M | Wykorzystać otwarte zasoby projektu dla aktywacji MoveTool i obrotu; poprawny hotspot, aktualizacja podczas gestu i przywracanie po jego zakończeniu. Sam obrót obrazu już działa. | [MoveTool](../js/src/engine/document/tool/tool/move/MoveTool.js), [MoveToolBase](../js/src/engine/document/tool/tool/move/MoveToolBase.js) |
| 4 | Sygnalizacja długiego końcowego przeliczania przesunięcia | S/M | Zrealizować TODO kursora oczekiwania. Jeśli przeliczenie blokuje wątek UI, umożliwić wyświetlenie stanu zajętości przed jego rozpoczęciem. Zawsze przywracać stan po błędzie/anulowaniu; bez zmiany pikseli i historii. | [MoveTool.renderInternal](../js/src/engine/document/tool/tool/move/MoveTool.js) |
| 5 | Włączanie/wyłączanie automatycznego sprawdzania aktualizacji | M | Odblokować ustawienie i faktycznie respektować je przy uruchomieniu oraz kolejnych kontrolach. Ręczne „Check now” nadal działa; preferencja jest trwała. Osobno określić zachowanie desktop/web. | [SettingsUpdatesEntry](../js/src/interface/window/settings/entry/SettingsUpdatesEntry.js), [updater](../js/platform/desktop/updater.js), [boot_loader](../js/platform/boot_loader.js) |
| 6 | Błędy wykonywania operacji i wykrywalne błędy alokacji | M | Jedna spójna ścieżka zgłoszenia błędu; nie maskować go samym logiem. Nie zapisywać nieudanego działania w historii, zwalniać zasoby częściowo utworzonej operacji i zachować dokument. Nie obiecywać przechwycenia zabicia całego procesu przez system. | [DocumentWorkspace.executeFunction](../js/src/engine/document/DocumentWorkspace.js) |

## P2 — konkretne uzupełnienia i zaległości techniczne

**Status:** punkt 7 odłożony — obecnie nie publikujemy wydań prerelease.
Punkty **8–16 ukończone**:

- 8: biały obrys wraca płynnie przez 200 ms po resecie; globalne wyłączenie
  animacji pozostawia pełny, statyczny obrys. Wykorzystana jest istniejąca pętla
  rysowania, bez dodatkowych timerów.
- 9: pojedynczy gest (także ruch klawiaturą) i zatwierdzenie mają osobne
  `seriesGuid`, zachowywane w mementach przy undo/redo. Kolejne gesty pozostają
  osobnymi krokami historii; istniejące grupowanie wewnątrz gestu jest zachowane.
- 10: zmiana geometrii, transformacji lub widoczności uchwytów zgłasza potrzebę
  odświeżenia widoku. Istniejąca pętla scala żądania; dokument nie jest ponownie
  komponowany z powodu samego przesunięcia uchwytu.
- 11: `dispose()` renderera jest idempotentne i odpina go od SurfaceBox;
  `removeRenderer()` tylko odłącza, umożliwiając dalsze użycie. SurfaceBox sprząta
  swoje renderery, lecz nie zwalnia pożyczonej powierzchni. Renderer zaznaczenia
  odpina zdarzenia zaznaczenia i ustawień oraz zwalnia własną ścieżkę. Sprzątany
  jest również tymczasowy podgląd narzędzia zaznaczania.

Tabela zachowuje pierwotny zakres; podsumowanie punktów **12–16** znajduje się
poniżej. Punkty 17–18 opisano niżej; kolejne większe zadania (19–21) wymagają osobnej decyzji.

### Ukończona partia 12–16

Wdrożono kolejno punkty 12–15, a następnie osobno TIFF, BMP/TGA i DDS.
Szczegółowy pierwotny zakres, kryteria ukończenia i odnośniki do kodu pozostają
w tabeli poniżej.

- [x] **12:** zmierzyć i usprawnić przewijanie, zmianę rozmiaru okna oraz
  tworzenie dokumentu, zachowując zoom, pozycję widoku i poprawne odświeżanie.
- [x] **13:** ustalić i wdrożyć kontrakt całkowitoliczbowych skanów oraz granic
  regionu; uwzględnić współrzędne ułamkowe, ujemne, otwory i puste regiony.
- [x] **14:** uruchomić rzeczywisty przełącznik akceleracji sprzętowej desktopu,
  z trwałą preferencją, zastosowaniem przy starcie Electrona i informacją
  o wymaganym restarcie.
- [x] **15:** dodać pobieranie obrazu z kamery: podgląd, uprawnienia, zdjęcie,
  anulowanie, obsługę braku urządzenia i zwolnienie strumienia.
- [x] **16:** po audycie kodeków rozszerzać opcje eksportu kolejno dla TIFF,
  BMP/TGA i DDS; wyniki weryfikować niezależnym dekoderem.

**Pomiary punktu 12:** scenariusz `checkViewPerformance.js`, dokument 1024×768:
tworzenie — 2 → 1 kompozycja, niezmiennie 3 powierzchnie robocze; 100 zmian
przewinięcia — 0 kompozycji/alokacji/resetów canvasu; 20 zdarzeń resize bez
zmiany wymiarów — 40 → 0 resetów canvasu; resize Fit to Window — 4 → 0 resetów.
Rzeczywista zmiana wymiarów zmienia tylko backing store widoku, nie powierzchnie
dokumentu. Usunięto podwójną inwalidację nowego dokumentu i podwójne
przeliczanie układu przy dopasowaniu. Nieaktywne dokumenty zachowują pozycję
bez przewijania aktywnego widoku.

**Kontrakt punktu 13:** `getRegionScansInt()` zwraca niezależne półotwarte
prostokąty całkowitoliczbowe, zaokrąglając niepuste prostokąty na zewnątrz.
`getBoundsInt()` obejmuje wyłącznie te skany; pusty region ma granice (0,0,0,0).
Współrzędne niefinitywne i przekraczające bezpieczne liczby całkowite zgłaszają
błąd zamiast indeksować tablicę ułamkami. Region z geometrii ścieżki używa
wspólnego ze statystykami zaznaczenia skanowania even/odd w środkach pikseli,
zamiast prostokątów otaczających kontury, które wypełniały otwory.

**Punkt 14:** desktop zapisuje preferencję w profilu aplikacji i stosuje
`disableHardwareAcceleration()` przed gotowością Electrona. Ustawienia oddzielają
preferencję następnego startu, konieczność restartu, bieżący stan procesu oraz
statusy funkcji Chromium. Web nie udaje, że może zmieniać akcelerację; dostępność
WebGL nie jest traktowana jako identyfikacja fizycznego GPU.

**Punkt 15:** osobne File → From Camera, start na żądanie użytkownika,
podgląd bez audio i zdjęcie jako niezapisany dokument PNG. Testy desktop/web
obejmują rzeczywiste `getUserMedia` z testową kamerą Chromium, odmowę zgody,
brak/zajętość urządzenia, odłączenie, błędy podglądu/alokacji/kodowania/importu
i anulowanie podczas oczekiwania na zgodę oraz podczas kodowania. Wszystkie
ścieżki zamknięcia zwalniają strumień. Ograniczeń prywatności systemu i sandboxu
Flatpak nie obchodzimy.

**Punkt 16:** TIFF RGB/RGBA 8 bit/kanał, bez kompresji/LZW/Deflate; BMP/TGA
24-bit RGB lub dotychczasowy 32-bit z alfa; DDS bez kompresji lub BC1/DXT1
i BC3/DXT5, bez mipmap. Warianty RGB składają przezroczystość na bieli.
Opcje są trwałe per format; można przywrócić domyślne. Podgląd TIFF/TGA/DDS
dekoduje wynik zapisu, w tym stratny DDS. Testy kontrolują nagłówki, rzeczywiste
bajty, nieparzyste i minimalne wymiary, alfa oraz padding; niezależny FFmpeg
odczytuje eksporty desktopowe. Audyt opisano w [image-encoders.md](../docs/image-encoders.md).

**Przekazanie:** punkty 1–6 i 8–16 są ukończone; punkt 7 pozostaje odłożony
na wyraźną decyzję użytkownika (brak wydań prerelease). Ostatnia weryfikacja:
266 testów przeszło, pokrycie linii, gałęzi i funkcji wszystkich 287 plików
runtime wynosi 100%, bez nowych wykluczeń. Szczegóły testów paczki zapisano w
[COVERAGE-STATUS.md](history/COVERAGE-STATUS.md). Pracować na `develop`, commitować
lokalnie, a po zakończeniu i testach scalać do lokalnego `master`; nie pushować.
Zbudowano DEB i przetestowano jego rzeczywisty plik wykonywalny w dziesięciu
scenariuszach, w tym nowych testach widoku, akceleracji, kamery i eksportu.

| ID | Zadanie | Skala | Zakres i kryterium ukończenia | Miejsce w kodzie |
| --- | --- | --- | --- | --- |
| 7 | Kanał aktualizacji prerelease | M | Ustawienie obecnie wyłączone. Spójne wybieranie wydań stabilnych/testowych, porównywanie wersji i zachowanie dla instalacji aktualizowanych ręcznie; bez samoczynnego przełączenia użytkowników na wersje testowe. | [SettingsUpdatesEntry](../js/src/interface/window/settings/entry/SettingsUpdatesEntry.js), [updater](../js/platform/desktop/updater.js) |
| 8 | Reset widoczności białego obrysu zaznaczenia | S/M | `resetOutlineWhiteOpacity()` zmienia pole, którego rysowanie nie używa. Określić i wdrożyć docelowy efekt wizualny/reset, respektując ustawienie animacji i unikając zbędnych timerów. | [SelectionRenderer](../js/src/engine/document/render/renderer/SelectionRenderer.js) |
| 9 | Identyfikatory serii operacji w historii | M | Dokończyć `seriesGuid` w mementach narzędzi i jego zachowanie przy undo/redo. Najpierw ustalić granice serii; nie sklejać niezależnych gestów ani nie zepsuć istniejącego grupowania. | [MoveTool](../js/src/engine/document/tool/tool/move/MoveTool.js), [MoveSelectionTool](../js/src/engine/document/tool/tool/move/MoveSelectionTool.js), [CompoundToolHistoryMemento](../js/src/engine/document/history/memento/CompoundToolHistoryMemento.js) |
| 10 | Kontrakt odświeżania po zmianie uchwytów | M | Zweryfikować TODO `notify?` w setterach położenia, kąta, kształtu i transformacji. Uzupełnić wymagane powiadomienia/inwalidację, z testem odświeżenia bez kolejnego ruchu myszy; nie dodawać redundantnych pełnych przerysowań. | [CanvasControl](../js/src/engine/document/render/renderer/CanvasControl.js), [MoveNubRenderer](../js/src/engine/document/render/renderer/MoveNubRenderer.js), [RotateNubRenderer](../js/src/engine/document/render/renderer/RotateNubRenderer.js), [MoveToolBase](../js/src/engine/document/tool/tool/move/MoveToolBase.js) |
| 11 | Domknięcie cyklu życia rendererów | M | Zdefiniować odpowiedzialność `dispose()` i usuwania renderera, w tym odpinanie subskrypcji i zwalnianie własnych ścieżek/cache. Obecnie część sprzątania robi DocumentWorkspace; unikać podwójnego zwalniania współdzielonych powierzchni. Potencjalne wycieki trzeba potwierdzić testem. | [SurfaceBoxRenderer](../js/src/engine/document/render/SurfaceBoxRenderer.js), [SurfaceBox](../js/src/engine/document/render/SurfaceBox.js), [SelectionRenderer](../js/src/engine/document/render/renderer/SelectionRenderer.js) |
| 12 | Przewijanie, zmiana rozmiaru okna i tworzenie dokumentu | M/L | Zmierzyć liczbę kompozycji i alokacji, zbadać TODO pre-paint/inwalidacji oraz zachowanie zoom-to-window przy istniejącym przesuwaniu dokumentu. Wdrożyć poprawki uzasadnione pomiarami; zachować pozycję widoku i kompletność odświeżenia. | [DocumentView](../js/src/engine/document/DocumentView.js), [AppView.onResize](../js/src/engine/AppView.js), [AppWorkspace](../js/src/engine/AppWorkspace.js) |
| 13 | Całkowitoliczbowe skany i granice regionu | M | Zweryfikować intencję `GetRegionScansReadOnlyInt`/`GetBoundsInt`. Obecne Region zwraca surowe prostokąty; określić kontrakt współrzędnych ułamkowych i bezpieczną rasteryzację. Zachować otwory, ujemne współrzędne i puste regiony. | [GraphicsPath.fromRegion](../js/src/engine/document/selection/GraphicsPath.js), [Region](../js/src/engine/util/Region.js) |
| 14 | Przełącznik akceleracji w wersji desktopowej | M | Obecnie wyłączony także w desktopie. Rozdzielić preferencję aplikacji od możliwości przeglądarki; ustawienie startowe Electrona, wymagany restart i rzeczywista diagnostyka działania. Nie utożsamiać tego z wyborem konkretnej karty GPU. | [SettingsGraphicsEntry](../js/src/interface/window/settings/entry/SettingsGraphicsEntry.js), [main](../js/platform/desktop/main.js) |
| 15 | Pobranie obrazu z kamery | M | Wyodrębnić od skanera: podgląd, zgoda na dostęp, wykonanie zdjęcia, anulowanie, zwolnienie urządzenia i otwarcie wyniku jako dokumentu. Zdefiniować wsparcie desktop/web i zachowanie przy braku urządzenia. | [FileMenu](../js/src/interface/panel/header/main/menu/FileMenu.js), README |
| 16 | Rozszerzenie opcji eksportu | M/L na format | Osobne zadania: warianty/kompresja TIFF, głębia BMP/TGA, kompresowane DDS. Najpierw audyt możliwości obecnych kodeków, potem kontrolki zapisu i testy plików odczytanych niezależnym dekoderem. Nie wdrażać wszystkich formatów naraz. | README: tabela formatów, [portableImageCodec](../src/portableImageCodec.js) |

## P3 — większe zadania

### Ukończona partia 17–18 (2026-10-20)

- **17 — ICC:** otwieranie PNG/JPEG/WebP/TIFF/AVIF/JPEG XL z osadzonym ICC
  konwertuje piksele do roboczego sRGB i zachowuje profil źródłowy. Image → Color
  Profile pokazuje profil, umożliwia wybór RGB ICC eksportu i powrót do sRGB.
  Zmiana jest odwracalna przez undo/redo. Eksport do sześciu wymienionych formatów
  rzeczywiście przelicza kolory i osadza profil. PDN zachowuje źródłowy i eksportowy
  profil; przekształcenia dokumentu i resize nie gubią tych ustawień. Pozostałe
  formaty eksportują dotychczasowe sRGB. Nie jest to edycja HDR/wide-gamut,
  soft proofing ani wyjście CMYK. Szczegóły: [color-management.md](../docs/color-management.md).
- **18 — PDN:** wspólny generator NRBF `src/pdn/PdnObjectGraph.js` obsługuje do
  65 535 warstw (ograniczenie walidacyjne; rzeczywisty limit zależy od pamięci).
  Stare szablony 1–64 pozostają zgodne bajt w bajt i nadal służą odzyskiwaniu
  wadliwych blend records dawnych plików paint.js. Zachowane są dokumentowe
  i warstwowe tablice string key/value `userMetadataItems`, także nieznane klucze,
  oraz własne ustawienia ICC i DPI. Nieznane typy warstw/tryby mieszania/struktury
  metadanych są odrzucane przed alokacją pikseli. Nie dodano obsługi nowego
  kontenera ani arbitralnych obiektów pluginów. Nie deklarować zgodności ze
  wszystkimi wersjami PDN; szczegóły: [pdn-format.md](../docs/pdn-format.md).

Źródła kontrolne wskazane przez użytkownika: [OpenPDN 3.36.7](https://github.com/rivy/OpenPDN)
i [wydanie 5.1.12](https://github.com/paintdotnet/release/releases/tag/v5.1.12).
Źródła OpenPDN przejrzano w `/tmp/paintjs-openpdn-audit`: `Document.cs`,
`Layer.cs`, `MetaData.cs`, `SystemLayer/PropertyItem2.cs`. Wersja 3.36.7 ma
starsze `NameValueCollection userMetaData`; DPI jest w sekcji `$exif` jako
PropertyItem. Obecna implementacja zachowuje tablice `userMetadataItems` schematu
5.x, a własny DPI zapisuje pod `paint.js.resolution`; nie jest to implementacja
odczytu/zapisu natywnego EXIF DPI ani automatyczna obsługa kolekcji z wersji 3.x.
Oryginalnej aplikacji 5.1.12 nie dekompilowano ani nie uruchamiano.

Weryfikacja: 269 testów przeszło; 100% linii/gałęzi/funkcji 291 plików runtime,
bez nowych wykluczeń. Testy obejmują profil z zamienionymi czerwonymi/zielonymi
primariami (niezależny wzorzec Pillow/Little CMS), odczyt wyeksportowanego ICC,
undo/redo, błędy/anulowanie/równoległy odczyt profilu i rzeczywisty round trip
65 warstw w desktopie/web. Log: `/tmp/paintjs-icc-pdn-coverage-complete.log`.
Testy paczki i końcowy stan przekazania: [COVERAGE-STATUS.md](history/COVERAGE-STATUS.md).

Tabela zachowuje pierwotny zakres. **19–21 pozostają do zrobienia; 7 odłożony.**

| ID | Zadanie | Skala | Uwagi |
| --- | --- | --- | --- |
| 17 | Profile ICC: informacje, zachowywanie i konwersja | L | Najpierw audyt utraty metadanych w obecnej ścieżce dekodowania. Rozdzielić pokazanie informacji, przenoszenie profilu i rzeczywistą konwersję pikseli. Pełne advanced color/HDR to odrębny, znacznie większy projekt. Menu: `ImageMenu`. |
| 18 | Ograniczenia PDN | L | Rozdzielić zwiększenie limitu 64 warstw, zachowanie dodatkowych metadanych i obsługę nowszych struktur. Zmiana limitu wymaga audytu szablonów i zabezpieczeń, a nie tylko skasowania walidacji. Nie utożsamiać braków z README z potwierdzonym zakresem danych zapisywanych przez oryginalny format. Kod: `PdnDocumentCodec`, `PdnTemplateFactory`. |
| 19 | Wydajność dużych dokumentów, efektów i złożonych zaznaczeń | L | Powtarzalne scenariusze i profilowanie pamięci/czasu, potem osobne poprawki. Nie rozwiązywać przez ciche obcinanie historii lub zmniejszanie jakości. Część workerów, próbkowania i oszczędnego undo już wdrożono. |
| 20 | JPEG XR: pozostałe głębie i modele kanałów | L | Odczyt obecnie obejmuje RGB 8/16 bit i float32. Najpierw ocenić ograniczenia mostka/dekodera i przygotować rzeczywiste pliki testowe; nie obiecywać pełnej obsługi samą zmianą listy akceptowanych wartości. |
| 21 | Firefox i Safari | L | Osobna macierz zgodności, realne testy silników i adaptery plików/schowka. HTTPS, zgody użytkownika i ograniczenia API są warunkami platformy, nie zwykłymi TODO do usunięcia. |

## Poza bieżącą, rozsądną partią

- **XL: natywne pluginy Paint.NET DLL/.NET** — zgodnie z decyzją użytkownika;
  obecne JS API pluginów działa i nie wymaga zastąpienia.
- **L/XL: skanery** — integracje urządzeń i platform, oddzielnie od kamery.
- **XL: zaawansowany kolor/HDR i ręczne wybieranie fizycznego GPU** — ograniczenia
  silnika/systemu oraz duży zakres testów; przełącznik akceleracji to osobne zadanie 14.
- **L/XL: osobne natywne okna paneli** — TODO w `FormRegistry`; obecnie panele
  działają jako `WebWindow`. Wymaga synchronizacji stanu, fokusu i zdarzeń między oknami.
- **XL: animacje i dokumenty wielostronicowe** — wpływ na model dokumentu,
  edycję, historię i import/eksport; nie jest to tylko nowa opcja kodera.
- **XL: pełna zgodność wszystkich odmian PDN i danych pluginów** — większa od
  pojedynczych rozszerzeń formatu opisanych w zadaniu 18.

## Co jest już zrobione lub wymaga ostrożnej interpretacji

- Wszystkie cztery pozycje w [FIXME.md](history/FIXME.md) są oznaczone jako ukończone: układ
  kontrolek kolorów, tłumaczenia jednostek oraz zapis HEIC i JPEG XR.
- `AppFile.exists()` ma implementację przez Node fs.
- `MoveTool.onPasteMouseDown()` jest zaimplementowane i wywoływane.
- Obracanie i przesuwanie dokumentu/zaznaczenia już istnieją. Stare komentarze
  nie dowodzą braku tych funkcji; zadania 3 i 12 dotyczą pozostałego zakresu.
- Istnieje rozbudowane undo/redo i grupowanie mementów; zadanie 9 dotyczy
  niewykorzystanego kontraktu identyfikatora serii, nie pisania historii od nowa.
- Wyjątki `Not implemented` w klasach bazowych, np. `File`, `Layer`,
  `HistoryMemento` i `SelectionTool`, służą jako kontrakty dla implementacji.
  Konkretny brak należy wykazać w klasie potomnej/używanej ścieżce.

## Zasady wykonania

Każde zadanie powinno kończyć się implementacją właściwego zachowania,
regresją sprawdzającą efekt, aktualizacją README i lokalnym commitem.
Samo usunięcie TODO nie jest wykonaniem zadania. Dla komentarza dotyczącego
już działającej funkcji najpierw potwierdzić to testem i ustalić pozostały zakres.
Zachować bramkę 100% pokrycia runtime bez nowych wykluczeń; budowane paczki
weryfikować istniejącym testem aplikacji rozpakowanej z pakietu.
