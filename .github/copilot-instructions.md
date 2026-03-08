# GitHub Copilot Instructions – Der Planer: Reloaded

## Projektübersicht

*Der Planer: Reloaded* ist eine browserbasierte Logistik-Managementsimulation in reinem Vanilla JavaScript (kein Framework, kein Build-Tool). Die Anwendung besteht aus drei Kerndateien:

| Datei            | Zweck                                                            |
|------------------|------------------------------------------------------------------|
| `index.html`     | Haupt-HTML-Datei und gesamte Spiel-UI (Single Page Application)  |
| `css/style.css`  | Dunkles Theme, Layout und alle UI-Komponenten                    |
| `js/data.js`     | Statische Spieldaten (Fahrzeuge, Städte, Kunden, Ereignisse …)   |
| `js/game.js`     | Spiellogik, Game-Loop, Rendering                                 |

Deployment: GitHub Pages direkt aus dem Repository-Root, kein Build-Schritt erforderlich.

---

## Kernregeln für Copilot

### 1. Minimale Änderungen – nur das Notwendige

> **Ändere niemals Code, der für die aktuelle Aufgabe nicht erforderlich ist.**

- Bearbeite ausschließlich die Dateien und Codeabschnitte, die die Aufgabe direkt betreffen.
- Keine Refactorings, Umbenennungen oder Formatierungsänderungen an unbeteiligtem Code.
- Keine neuen Abhängigkeiten, Frameworks oder Build-Tools einführen.
- Bestehende Tests und Verhaltensweisen dürfen nicht ohne expliziten Auftrag verändert werden.

### 2. README immer aktuell halten

> **Nach jeder inhaltlichen Änderung am Spiel muss `README.md` aktualisiert werden.**

Konkret bedeutet das:
- Neues Feature → neue Zeile/neuen Abschnitt unter **✨ Features** hinzufügen.
- Entferntes Feature → entsprechenden Eintrag aus der Feature-Liste entfernen.
- Geänderte Zahlen (Städte, Fahrzeugtypen, Mitarbeiterrollen usw.) → Zahlen in README anpassen.
- Neue Dateien in `js/` oder `css/` → Projektstruktur-Abschnitt aktualisieren.

### 3. Versionsnummer pflegen

> **Jede inhaltliche Änderung am Spiel erfordert eine Anpassung der Versionsnummer.**

Die Versionsnummer ist als Konstante `APP_VERSION` am Anfang von `js/game.js` definiert und wird im Info-Screen des Spiels angezeigt.

Versionsschema: `MAJOR.MINOR.PATCH` (Semantic Versioning)
- **PATCH** erhöhen bei Bugfixes und kleinen Korrekturen.
- **MINOR** erhöhen bei neuen Features oder sichtbaren Änderungen an bestehenden Features.
- **MAJOR** erhöhen bei grundlegenden Überarbeitungen der Spielstruktur.

Die aktuelle Versionsnummer muss außerdem im Abschnitt **🔖 Version** der `README.md` aktuell gehalten werden.

### 4. Features vollständig auflisten

Jedes spielrelevante Feature muss im README unter **✨ Features** dokumentiert sein.
Die aktuelle Feature-Liste umfasst:

- 🏢 Unternehmensführung (Budget, Büroräume, Pressekonferenzen, Reputation)
- 🚛 Fuhrparkmanagement (8 Fahrzeugtypen, Kauf/Wartung/Verkauf, Zustandsverwaltung)
- 📦 Auftragssystem (25 Kunden, 10 Frachttypen, Verfallszeiten, dynamische Preise)
- 🗺️ Routenplaner & Europakarte (41 Städte, Multi-Punkt-Routen, Canvas-Karte)
- 👥 Personalverwaltung (7 Mitarbeiterrollen, Einstellung/Entlassung, Gehaltsabrechnung)
- 💶 Finanzsystem (Einnahmen/Ausgaben, Kredite, Transaktionsprotokoll, KPIs)
- 📈 Marktereignisse (8 dynamische Ereignisse, Kraftstoff, Streik, Rezession usw.)
- ⏱️ Zeitsteuerung (Pause / 1× / 5× / 30×, 15-Minuten-Ticks)
- 💾 Automatisches Speichern via `localStorage`

---

## Kodierkonventionen

- **Sprache der UI und aller Strings:** Deutsch
- **Sprache der Bezeichner (Variablen, Funktionen):** Englisch
- **Stil:** Vanilla JavaScript (ES6+), keine externen Bibliotheken
- **Kein Build-Schritt:** Änderungen müssen direkt im Browser lauffähig sein
- **Spielstand-Persistenz:** ausschließlich über `localStorage`
- **Canvas-Rendering:** für Karten und Routen via HTML5 Canvas API

## Deployment

Das Spiel wird automatisch via GitHub Actions (`deploy.yml`) auf GitHub Pages veröffentlicht, sobald Änderungen auf den Hauptbranch gepusht werden. Es ist kein manueller Build notwendig.
