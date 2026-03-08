# 🚛 Der Planer: Reloaded

**Das alte Spiel in neuem Gewand** – eine browserbasierte Logistik-Managementsimulation im klassischen Stil.

> 🔖 **Version: 1.1.0**

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

### 🚛 Fuhrparkmanagement
- **8 Fahrzeugtypen**: vom kleinen Transporter (2 t) bis zum Schwerlastzug (60 t).
- Kaufe, warte und verkaufe Fahrzeuge (MAN, Volvo, Scania, DAF, Mercedes Actros u. a.).
- Fahrzeuge können in den Zuständen *untätig*, *fahrend* oder *Wartung* sein.
- Treibstoffverbrauch und Verschleiß werden realistisch simuliert.
- **Automatische Tankstopps**: Sinkt der Kraftstoffstand unter 15 %, hält das Fahrzeug selbständig an einer Tankstelle (15 Min. Verzögerung); die Kraftstoffkosten werden automatisch verbucht.

### 📦 Auftragsystem
- **25 fiktive Kunden** aus verschiedenen Branchen (Lebensmittel, Chemie, Bau, Medizin, Automobil …).
- **10 Frachttypen**: Allgemeingut, Kühlware, Gefahrgut, Schwerlast, Kraftstoff u. v. m.
- Aufträge haben eine Verfallszeit (2 Spieltage) und dynamische Preise je nach Frachttyp und Schwierigkeitsgrad.
- Verwalte verfügbare, aktive und abgeschlossene Aufträge in übersichtlichen Tabs – **mit aktuellen Zählern** in jedem Tab.
- **Erfüllbarkeitsanzeige**: Jeder verfügbare Auftrag zeigt ein grünes ✔ (erfüllbar) oder rotes ✘ (nicht erfüllbar) Icon; ein Tooltip erklärt den Grund (z. B. fehlende Sonderzulassung).
- **Mehrtransport-Aufträge**: Übersteigt das Auftragsgewicht die Fahrzeugkapazität, werden automatisch mehrere Fahrten durchgeführt – pro Fahrt wird die maximale Nutzlast vom verbleibenden Transportvolumen abgezogen.
- **Fahrzeug-Warteschlange**: Aufträge können auch einem bereits fahrenden Fahrzeug als Folgeauftrag zugewiesen werden. Das Fahrzeug arbeitet seine Auftragsliste nach der Rückkehr zum Heimatstandort nacheinander ab. Im Fuhrpark wird die Warteschlangenlänge angezeigt.
- **Nicht erfüllbare Aufträge ablehnen**: Ein Klick auf den Button lehnt alle nicht erfüllbaren Aufträge auf einmal ab (mit Bestätigungsdialog).
- **Auftragsvolumen skaliert mit Fuhrpark und Bekanntheitsgrad**: Die maximale Anzahl gleichzeitig verfügbarer Aufträge berechnet sich aus der Fuhrparkgröße (Fahrzeuge × 2,5); die maximale Auftragstonnage steigt mit dem Bekanntheitsgrad (Stufe 1–5). Beim Erreichen einer neuen Bekanntheitsgrad-Stufe werden sofort zwei neue Aufträge der neuen Kategorie eingespeist.

### 🗺️ Routenplaner & Europakarte
- **41 europäische Städte** auf einer Canvas-basierten Karte (Hamburg, Berlin, München, Amsterdam, Paris, Wien, Warschau, Rom, Barcelona u. v. m.).
- Plane Multi-Punkt-Routen mit automatischer Abholungs- und Lieferlogik.
- **Straßennetz-Routing**: Fahrzeuge folgen dem realen Straßennetz (Dijkstra-Algorithmus) statt direkter Luftlinien – mit automatisch eingefügten Transitstopps über Autobahnkreuze.
- Verfolge deine Flotte in Echtzeit auf der Europakarte; Fahrzeuge starten und enden stets am richtigen Standort.
- **Straßentypen-Visualisierung**: Autobahnen als breite, blaue Linien mit weißer Mittellinie; Bundesstraßen als gelbe Linien (nur in Zoom-Stufe 2 sichtbar).
- **Autobahnkreuz-Markierungen**: Knotenpunkte mit 3+ Autobahnverbindungen werden als blaue Rauten hervorgehoben.
- **Zwei Zoom-Stufen**: *Totale* (Zoom 1) zeigt nur Autobahnen und Hauptstädte; *Regionalansicht* (Zoom 2) zeigt alle Straßentypen, Auftragsziele (📦/🏁) und das HQ-Icon.
- Wechsel zwischen Zoom-Stufen per **+/–-Schaltflächen** oder **Mausrad**; Zoom-Stufe und Kartenposition werden im Spielstand gespeichert.
- **Schnellnavigation** in der Seitenleiste: Ein Klick auf Firmenzentrale, Auftragsziele oder Fahrzeuge zentriert die Karte sofort in Zoom-Stufe 2 auf den gewünschten Punkt.
- **Fahrzeug-Info-Panel**: Ein Klick auf ein Fahrzeug-Icon öffnet ein Panel mit Fahrer, Auftrag, Ziel und Status; bei mehreren überlappenden Fahrzeugen erscheint ein Auswahlmenü.

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

### 📈 Marktereignisse
- **8 dynamische Ereignisse**: Kraftstoffpreissprünge, Streiks, Rezessionen, Konjunkturbooms, Winterstürme, Autobahnstaus, Umweltvorschriften u. a.
- Jedes Ereignis hat eine Eintrittswahrscheinlichkeit und Dauer und beeinflusst Kraftstoffpreise, Auftragsvolumen, Fahrzeuggeschwindigkeit und Reputation.

### ⏱️ Zeitsteuerung
- Einstellbare Spielgeschwindigkeit: **Pause / 1× / 5× / 30×**.
- Das Spiel läuft in 15-Minuten-Ticks; Fahrzeuge, Aufträge und Ereignisse werden in Echtzeit aktualisiert.

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

Da das Spiel ohne Build-Schritt auskommt, reicht es, `index.html` im Browser zu öffnen:

```bash
# Repository klonen
git clone https://github.com/Tallerlei/Der-Planer.git
cd Der-Planer

# index.html direkt im Browser öffnen
open index.html       # macOS
xdg-open index.html   # Linux
start index.html      # Windows
```

Alternativ ist das Spiel über **GitHub Pages** direkt im Browser spielbar:
**▶ [https://tallerlei.github.io/Der-Planer/](https://tallerlei.github.io/Der-Planer/)**

---

## 🗂️ Projektstruktur

```
Der-Planer/
├── index.html        # Haupt-HTML-Datei und Spiel-UI (Single Page Application)
├── css/
│   └── style.css     # Dunkles Theme, Layout, Komponenten (~800 Zeilen)
└── js/
    ├── data.js       # Statische Spieldaten (Fahrzeuge, Städte, Kunden, Ereignisse …)
    └── game.js       # Spiellogik, Game-Loop, Rendering (~1800 Zeilen)
```

Das Spiel ist reines **Vanilla JavaScript** – kein Framework, kein Build-Tool, keine Abhängigkeiten.
Der Spielstand wird automatisch per `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt.

---

## 🛠️ Technischer Überblick

| Merkmal          | Details                              |
|------------------|--------------------------------------|
| Sprache          | HTML5, CSS3, Vanilla JavaScript (ES6)|
| Build-System     | keines – direktes Öffnen im Browser  |
| Persistenz       | Browser `localStorage`               |
| Grafik           | HTML5 Canvas (Karten & Routen)       |
| Deployment       | [GitHub Pages](https://tallerlei.github.io/Der-Planer/) |
