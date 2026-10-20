# Lista prac implementacyjnych

Stan przeglądu: 2026-10-20. Źródła: README, FIXME.md, komentarze TODO w `js/`
oraz nieaktywne pozycje menu i ustawień. To audyt repozytorium, a nie pełna
inwentaryzacja wszystkich funkcji najnowszego Paint.NET. Pierwsza partia
(punkty 1–6) została zaimplementowana; pozostałe pozycje pozostają planem prac.

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

## P3 — większe zadania do osobnej decyzji

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

- Wszystkie cztery pozycje w `FIXME.md` są oznaczone jako ukończone: układ
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
