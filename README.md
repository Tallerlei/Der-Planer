# 🚛 Der Planer: Reloaded

**Das alte Spiel in neuem Gewand** – eine browserbasierte Logistik-Managementsimulation im klassischen Stil.

> 🔖 **Version: 1.19.0**

---

## 📖 Beschreibung

*Der Planer: Reloaded* ist ein im Browser spielbares Wirtschafts- und Logistikspiel.
Du übernimmst die Leitung einer kleinen Spedition und baust sie zu einem europaweit tätigen Transportunternehmen aus.
Kaufe Fahrzeuge, stelle Personal ein, nimm Frachtaufträge an, plane Routen quer durch Europa und behalte deine Finanzen im Blick – alles in Echtzeit.

Das Spiel läuft vollständig im Browser, ohne Installation oder Build-Schritt, und speichert den Spielstand automatisch im localStorage des Browsers.

---

## ✨ Features

### 🏢 Unternehmensführung
- Starte mit einem kleinen Budget (abhängig vom Schwierigkeitsgrad) und baue dein Unternehmen auf.
- Verwalte dein Büro und erweitere es mit neuen Räumen.
- Führe **Pressekonferenzen** durch und reagiere diplomatisch auf Krisen oder Erfolge, um deine Reputation zu steigern.
- **Ansehen-Dashboard**: Im Büro öffnet die Kachel **🏆 Ansehen** eine zentrale Übersicht über alle Reputationswerte:
  - **Unternehmensansehen (0–100)**: Fortschrittsbalken, Bekanntheitsgrad-Stufe (1–5), konkreter Effekttext (z. B. „Maximale Auftragsgröße 26.000 kg") und Trendpfeil.
  - **Kundenansehen** für jeden bekannten Auftraggeber: Sternebewertung, Balken, Abschluss-/Fehlerstatistik und Effektbeschreibung (inkl. Loyalitätsbonus bei ≥ 75).
  - **30-Tage-Verlaufsgraph** (Sparkline-SVG) für Unternehmensansehen und jeden Kunden, damit Trends frühzeitig erkannt werden.
  - **Frühwarnsystem**: Fällt ein Wert unter die Warnstufe (< 25) oder Gefahrenstufe (< 10), erscheint ein farbiger Badge (gelb/rot) direkt auf der Bürokachel – ohne das Dashboard öffnen zu müssen.

### 🚛 Fuhrparkmanagement
- **8 Fahrzeugtypen**: vom kleinen Transporter (2 t) bis zum Schwerlastzug (60 t).
- Kaufe, warte und verkaufe Fahrzeuge (MAN, Volvo, Scania, DAF, Mercedes Actros u. a.).
- Weise Fahrern Fahrzeuge zu und entferne sie wieder, wenn Fahrzeug und Fahrer sich am Firmensitz befinden.
- Fahrzeuge können in den Zuständen *untätig*, *fahrend* oder *Wartung* sein.
- Treibstoffverbrauch und Verschleiß werden realistisch simuliert.
- **Automatische Tankstopps**: Sinkt der Kraftstoffstand unter 15 %, hält das Fahrzeug selbständig an einer Tankstelle (15 Min. Verzögerung); die Kraftstoffkosten werden automatisch verbucht.
- **Anhänger-System**: Fahrzeuge mit Anhänger-Slot können beim Kauf mit einem passenden Anhänger ausgestattet werden. Sattelzug, Kühllaster und Tankzug unterstützen große Auflieger (Planenauflieger, Pritschenauflieger, Kühlauflieger, Tankauflieger); der Kleintransporter kann mit kleinen Anhängern (Kastenanhänger, Pritschenanhänger) ausgerüstet werden. Anhänger erhöhen die Nutzlast und ermöglichen zusätzliche Frachtanforderungen (z. B. Kühlung, ADR).
- **Anhänger-Verwaltung im Fuhrpark**: Für Fahrzeuge am Firmensitz kann direkt ein kompatibler Anhänger gekauft und angekoppelt werden. Anhänger lassen sich abkoppeln und im Fuhrpark einlagern – von dort können sie an ein anderes kompatibles Fahrzeug angekoppelt oder verkauft werden.

### 📦 Auftragsystem
- **25 fiktive Kunden** aus verschiedenen Branchen (Lebensmittel, Chemie, Bau, Medizin, Automobil …).
- **10 Frachttypen**: Allgemeingut, Kühlware, Gefahrgut, Schwerlast, Kraftstoff u. v. m.
- Aufträge haben eine Verfallszeit (2 Spieltage) und dynamische Preise je nach Frachttyp und Schwierigkeitsgrad.
- **Fuhrpark-adaptives Auftragssystem**: Auftragsgewichte passen sich an die aktuelle Gesamtkapazität des Fuhrparks an. Normale Aufträge bleiben innerhalb der Flottenkapazität; 15 % der Aufträge sind **Großaufträge** (🏋️) mit höherem Gewicht und +50 % Vergütung.
- **Garantierte erfüllbare Aufträge**: Bei jeder Auftragsgeneration sind mindestens 40 % der neuen Aufträge (mind. 1) auf die aktuelle Flotte zugeschnitten – die Gewichte bleiben innerhalb der maximalen Fahrzeugkapazität und alle Sonderanforderungen (Kühlung, ADR usw.) können vom Fuhrpark erfüllt werden.
- **Warenklassen mit Vergütungsfaktoren**: Jede Ware gehört einer Klasse an, die den Basis-km-Preis multipliziert – Standardware/Baustoffe (×1,0), Lebensmittel/Flüssigkeiten (×1,1), Kühlware (×1,3), Fahrzeugteile/Schwerlast (×1,2), Kraftstoff/Gefahrgut/Medizingüter (×1,5). Eilaufträge (⚡) erhalten zusätzlich den Faktor 1,4.
- **Distanzbasierte Vergütungsformel**: `random(5, 12) €/km × Distanz × Warenfaktor × Eilfaktor × Marktmodifikator × Kundenbindungsbonus` – die Basisspanne von 5–12 €/km garantiert faire und konsistente Wirtschaftlichkeit. Jede Auftragskarte zeigt beim €/km-Wert einen Tooltip mit vollständiger Faktor-Aufschlüsselung.
- **Kundenbindungsbonus**: Kunden mit einem Ansehen ≥ 75 bieten 5 % bessere Konditionen.
- **Auftragsfehler-Popup**: Bei einem abgelaufenen oder verspätet gelieferten Auftrag erscheint ein detailliertes Pop-up mit allen relevanten Zeitstempeln (Erhalten, Angenommen, Abgeholt, Deadline, Geliefert) und den finanziellen Auswirkungen. Das Spiel wird dabei automatisch pausiert. Mehrere Fehlermeldungen werden nacheinander angezeigt.
- **Automatischer Auftragsablauf**: Verfallene Aufträge werden automatisch entfernt und senken die Reputation beim jeweiligen Auftraggeber um −3 Punkte.
- **Kundenstatus (Kundenansehen)**: Jeder Auftraggeber hat ein eigenes Ansehen (0–100, Start: 50), das in den Auftragskarten als Sternbewertung angezeigt wird. Erfüllte Aufträge erhöhen das Ansehen – mit **sinkenden Zuwächsen** je höher der Wert bereits ist.
- Verwalte verfügbare, aktive und abgeschlossene Aufträge in übersichtlichen Tabs – **mit aktuellen Zählern** in jedem Tab.
- **Auftragsortierung**: Die Auftragsliste kann nach verschiedenen Kriterien sortiert werden – **Wert**, **Gewicht**, **Entfernung**, **€/km** (alle Tabs), **Ablaufzeit** (verfügbare Aufträge), **Frist** (aktive Aufträge) sowie **Abschlusszeitpunkt** und **Status** (Pünktlich/Verspätet, abgeschlossene Aufträge). Ein Klick auf ein aktives Sortierkriterium kehrt die Reihenfolge um (auf-/absteigend).
- **Abgeschlossene Aufträge**: Standardmäßig werden die letzten 10 abgeschlossenen Aufträge angezeigt. Über die Schaltfläche **⬇ Weitere anzeigen** können in Schritten von 10 weitere Aufträge eingeblendet werden.
- **Erfüllbarkeitsanzeige**: Jeder verfügbare Auftrag zeigt ein grünes ✔ (erfüllbar) oder rotes ✘ (nicht erfüllbar) Icon; technisch nicht erfüllbare Aufträge (z. B. Kühlware ohne Kühllaster) erscheinen **ausgegraut** und geben dem Spieler Investitionsanreize.
- **Mehrtransport-Aufträge**: Übersteigt das Auftragsgewicht die Fahrzeugkapazität, werden automatisch mehrere Fahrten durchgeführt – pro Fahrt wird die maximale Nutzlast vom verbleibenden Transportvolumen abgezogen.
- **Fahrzeug-Statusübersicht**: Im Fuhrpark-Bildschirm zeigt jede Fahrzeugkarte alle noch ausstehenden Ziele der aktuellen Route (Abholung, Lieferung, Rückkehr) mit der jeweiligen geschätzten Ankunftszeit an – nicht nur das unmittelbar nächste. Ein Beladungsbalken zeigt bei geladenen Fahrzeugen Gewicht und Füllgrad. In der Warteschlange ist für jeden Folgeauftrag die voraussichtliche Startzeit sichtbar – so kann frühzeitig umgeplant werden.
- **Auftragsreihenfolge ändern**: Die Position eines Auftrags in der Warteschlange eines Fahrzeugs lässt sich per Pfeilschaltfläche (▲ / ▼) verschieben, solange der Auftrag noch nicht aktiv ausgeführt wird.
- **Auftrag umleiten**: Ein warteschlangenstehender oder aktiv fahrender (aber noch nicht abgeholter) Auftrag kann im *Aktive Aufträge*-Tab einem anderen geeigneten Fahrzeug zugewiesen werden. Wurde die Ladung bereits abgeholt, ist eine Umleitung nicht mehr möglich.
- **Multi-Fahrzeug-Lieferung**: Übersteigt das Auftragsgewicht die Kapazität eines einzelnen Fahrzeugs, können zusätzliche Fahrzeuge hinzugefügt werden, die die verbleibende Ladung parallel transportieren. Der Auftrag gilt erst dann als vollständig abgeschlossen, wenn die Gesamtmenge geliefert wurde.
- **Nicht erfüllbare Aufträge ablehnen**: Ein Klick auf den Button lehnt alle nicht erfüllbaren Aufträge auf einmal ab (mit Bestätigungsdialog).
- **Auftragsvolumen skaliert mit Bekanntheitsgrad**: Die Auftragsgeneration läuft ohne obere Mengenbegrenzung – die Verfallszeit (1–2 Spieltage) reguliert den Pool natürlich. Die maximale Auftragstonnage steigt mit dem Bekanntheitsgrad (Stufe 1–5). Beim Erreichen einer neuen Bekanntheitsgrad-Stufe werden sofort zwei neue Aufträge der neuen Kategorie eingespeist.
- **Fahrzeug-ETA bei Auftragsannahme**: Bei der Fahrzeugauswahl im Auftragsmenü (Tab *Verfügbare Aufträge*) zeigt jedes Fahrzeug im Dropdown an, ab wann es am Abholort sein kann – z. B. `[ab 10:30]` für denselben Spieltag oder `[ab 15.03. 10:30]` für einen späteren Tag. Für Fahrzeuge, die bereits am Abholort sind, erscheint `[ab sofort]`.
- **Verbessertes Auftragsmenü**: Jede Auftragskarte zeigt die genaue Lieferfrist als Datum & Uhrzeit, die Streckenlänge in km (bei Mehrtransporten multipliziert mit der Anzahl der Fahrten) sowie den Wert **€/km** für direkten Lukrativitätsvergleich. Abgeschlossene Aufträge zeigen den Abschlusszeitpunkt; verspätete Lieferungen werden rot hervorgehoben und enthalten eine Aufschlüsselung der Strafzahlung. Der Auftraggeber-Name ist klickbar und öffnet eine **Unternehmensübersicht** mit aktuellem Kundenansehen und einer Statistik der angebotenen, angenommenen, erledigten und verfehlten Aufträge.

### 🗺️ Routenplaner & Europakarte
- **41 europäische Städte** auf einer Canvas-basierten Karte (Hamburg, Berlin, München, Amsterdam, Paris, Wien, Warschau, Rom, Barcelona u. v. m.).
- Plane Multi-Punkt-Routen mit automatischer Abholungs- und Lieferlogik.
- **Straßennetz-Routing**: Fahrzeuge folgen dem realen Straßennetz (Dijkstra-Algorithmus) statt direkter Luftlinien – mit automatisch eingefügten Transitstopps über Autobahnkreuze.
- Verfolge deine Flotte in Echtzeit auf der Europakarte; Fahrzeuge starten und enden stets am richtigen Standort.
- **Straßentypen-Visualisierung**: Autobahnen als breite, blaue Linien mit weißer Mittellinie; Bundesstraßen als gelbe Linien (nur in Zoom-Stufe 2 sichtbar).
- **Autobahnkreuz-Markierungen**: Knotenpunkte mit 3+ Autobahnverbindungen werden als blaue Rauten hervorgehoben.
- **Drei Zoom-Stufen**: *Totale* (Zoom 1) zeigt nur Autobahnen und Hauptstädte; *Regionalansicht* (Zoom 2) zeigt alle Straßentypen, Auftragsziele (📦/🏁) und das HQ-Icon; *Detailansicht* (Zoom 3) für maximale Kartendetails.
- Wechsel zwischen Zoom-Stufen per **+/–-Schaltflächen** oder **Mausrad**; Zoom-Stufe und Kartenposition werden im Spielstand gespeichert.
- **Pan-Funktion**: Die Karte lässt sich per Maus-Ziehen (Drag) verschieben.
- **Schnellnavigation** in der Seitenleiste: Ein Klick auf Firmenzentrale, Auftragsziele oder Fahrzeuge zentriert die Karte sofort in Zoom-Stufe 2 auf den gewünschten Punkt.
- **Fahrzeug-Icons**: Fahrzeuge werden auf der Karte mit dem jeweiligen Typ-Icon (🚐 🚛 🚚 u. a.) dargestellt; ausgewählte Fahrzeuge werden golden hervorgehoben.
- **Fahrzeug-Info-Panel**: Ein Klick auf ein Fahrzeug auf der Karte oder in der Flottenliste öffnet ein seitliches Detailpanel mit Fahrer, Auftrag, Ziel, Gesundheit und Kraftstoff – die Route wird gleichzeitig auf der Karte markiert; bei mehreren überlappenden Fahrzeugen erscheint ein Auswahlmenü.

### 👥 Personalverwaltung
- **7 Mitarbeiterrollen**: LKW-Fahrer (€ 2.400/Monat), Mechaniker, Buchhalter, Telefonistin, Manager, Rechtsanwältin u. a.
- Stelle Personal ein oder entlasse es – Gehälter werden monatlich automatisch abgebucht.
- Zufallsgenerierte deutsche Namen für alle Mitarbeiter.

### 💶 Finanzsystem
- Vollständiges Finanzsystem mit Einnahmen, Ausgaben, Transaktionsprotokoll und KPIs.
- **Kreditsystem** mit variablen Zinssätzen.
- Monatliche Kosten: Gehälter, Kraftstoff, Fahrzeugwartung.

### 📣 Marketing *(in Vorbereitung)*
- Neuer Bürobereich für Werbeverträge (Zeitungsanzeigen, Radio-Spots, Sponsoring).
- Aktive Werbeverträge beschleunigen den Bekanntheitsgrad-Aufbau und sorgen so für mehr und größere Aufträge.

### ⚡ Performance
- **Selektive DOM-Updates im Fuhrpark**: Fahrzeugkarten werden nur neu gerendert, wenn sich ihr Inhalt geändert hat (HTML-Caching pro Fahrzeug). Strukturänderungen (Kauf/Verkauf von Fahrzeugen) lösen einen vollständigen Neuaufbau aus, während stabile Zustände nur gezielt aktualisiert werden.
- **Optimierte Finanzansicht**: KPI-Karten und Transaktionsliste werden nur dann neu in den DOM geschrieben, wenn sich der Inhalt tatsächlich geändert hat. Kreditkarten-HTML wird einmalig gerendert und danach nicht mehr neu erstellt.
- **Debounced Resize-Handler**: Das `window.resize`-Ereignis wird erst 150 ms nach dem letzten Auslösen verarbeitet, um übermäßige Karten-Neuberechnungen beim Verändern der Fenstergröße zu vermeiden.

### 📈 Marktereignisse
- **8 dynamische Ereignisse**: Kraftstoffpreissprünge, Streiks, Rezessionen, Konjunkturbooms, Winterstürme, Autobahnstaus, Umweltvorschriften u. a.
- Jedes Ereignis hat eine Eintrittswahrscheinlichkeit und Dauer und beeinflusst Kraftstoffpreise, Auftragsvolumen, Fahrzeuggeschwindigkeit und Reputation.

### ⏱️ Zeitsteuerung
- Einstellbare Spielgeschwindigkeit: **Pause / 1× / 5×**.
- **⏭ Nächstes Ereignis**: Springt automatisch zum nächsten relevanten Spielereignis – entweder die Ankunft eines Fahrzeugs an einem Standort oder der Abschluss eines Auftrags. Spart Wartezeit, ohne die manuelle Kontrolle zu verlieren.
- Das Spiel läuft in 15-Minuten-Ticks; Fahrzeuge, Aufträge und Ereignisse werden in Echtzeit aktualisiert.

### 💾 Spielstand & Meldungsprotokoll
- Spielstand wird **automatisch nach jedem Tageswechsel** per `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt.
- **Meldungsprotokoll**: Alle Toast-Benachrichtigungen werden persistent im Spielstand gespeichert (bis zu 200 Einträge). Das Protokoll ist über die Schaltfläche 📋 in der Statusleiste oder den Bürobereich *Meldungsprotokoll* jederzeit abrufbar – neueste Einträge zuerst, farbcodiert nach Typ.

---

## 🎮 Spielmodi & Schwierigkeitsgrade

| Modus      | Beschreibung                                    |
|------------|-------------------------------------------------|
| **Story**   | Geführter Einstieg mit vordefinierten Zielen   |
| **Sandbox** | Freies Spiel ohne festgelegte Vorgaben         |

| Schwierigkeit | Startkapital | Auftragsfrequenz | Ereigniswahrscheinlichkeit |
|---------------|-------------|------------------|---------------------------|
| **Leicht**    | € 100.000   | 1,5×             | 0,5×                      |
| **Normal**    | € 50.000    | 1×               | 1×                        |
| **Schwer**    | € 25.000    | 0,75×            | 1,5×                      |

---

## 🚀 Spielen

Das Spiel ist direkt über **GitHub Pages** im Browser spielbar:
**▶ [https://tallerlei.github.io/Der-Planer/](https://tallerlei.github.io/Der-Planer/)**

Für lokale Entwicklung:

```bash
# Repository klonen
git clone https://github.com/Tallerlei/Der-Planer.git
cd Der-Planer

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev

# Build erstellen
npm run build

# Tests ausführen
npm test
```

---

## 🗂️ Projektstruktur

```
Der-Planer/
├── index.html          # Haupt-HTML-Datei und Spiel-UI (Single Page Application)
├── css/
│   └── style.css       # Dunkles Theme, Layout, Komponenten
├── src/
│   ├── main.js         # Einstiegspunkt – DOM-Init, window-Globals
│   ├── data.js         # Statische Spieldaten (Fahrzeuge, Städte, Kunden, Ereignisse …)
│   ├── utils.js        # Reine Hilfsfunktionen (rand, fmt, pick, uid)
│   ├── constants.js    # Spielkonstanten (APP_VERSION, TIME_COSTS, …)
│   ├── state.js        # Spielzustand (GS) und Stadtverzeichnis
│   ├── routing.js      # Dijkstra-Wegfindung, Routenberechnung
│   ├── game/
│   │   ├── engine.js   # Spielschleife, advanceGameTime, Koordination
│   │   ├── vehicles.js # Fahrzeugfabrik und Bewegungslogik
│   │   ├── orders.js   # Reine Auftragslogik (canFulfillOrder, getReputationTier)
│   │   ├── finance.js  # Transaktionen, Buchführung
│   │   ├── staff.js    # Personalverwaltung
│   │   ├── events.js   # Marktereignisse
│   │   └── save.js     # localStorage-Persistenz
│   ├── ui/
│   │   ├── statusbar.js    # Statusleiste und Auftrags-Badges
│   │   ├── notifications.js # Toast-Meldungen
│   │   ├── modal.js        # Modal-Dialog
│   │   ├── screens.js      # Bildschirmnavigation
│   │   ├── fleet.js        # Fuhrpark-Screen
│   │   ├── orders_ui.js    # Auftrags-Screen
│   │   ├── routes.js       # Routenplaner-Screen
│   │   ├── personnel.js    # Personal-Screen
│   │   ├── finance_ui.js   # Finanz-Screen
│   │   ├── office.js       # Büro-Screen
│   │   └── map.js          # Karte (Canvas-Rendering)
│   └── __tests__/
│       ├── utils.test.js       # Tests für Hilfsfunktionen
│       ├── routing.test.js     # Tests für Wegfindungsalgorithmus
│       ├── constants.test.js   # Tests für Spielkonstanten
│       └── orders.test.js      # Tests für Auftragslogik
├── vite.config.js      # Vite-Konfiguration
└── package.json        # npm-Skripte und Abhängigkeiten
```

Der Spielstand wird automatisch per `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt.

---

## 🛠️ Technischer Überblick

| Merkmal          | Details                                           |
|------------------|---------------------------------------------------|
| Sprache          | HTML5, CSS3, Vanilla JavaScript (ES Modules)      |
| Build-System     | [Vite](https://vitejs.dev/) – schneller Dev-Server und Bundles |
| Test-Framework   | [Vitest](https://vitest.dev/) – 97 Unit-Tests     |
| Persistenz       | Browser `localStorage`                            |
| Grafik           | HTML5 Canvas (Karten & Routen)                    |
| Deployment       | [GitHub Pages](https://tallerlei.github.io/Der-Planer/) via GitHub Actions |
