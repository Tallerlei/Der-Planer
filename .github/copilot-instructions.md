# GitHub Copilot Instructions – Der Planer: Reloaded

## Projektübersicht

*Der Planer: Reloaded* ist eine browserbasierte Logistik-Managementsimulation.
                            |

Deployment: GitHub Pages direkt aus dem Repository-Root, kein Build-Schritt erforderlich.

---

## Kernregeln für Copilot

### 1. Minimale Änderungen – nur das Notwendige

> **Ändere niemals Code, der für die aktuelle Aufgabe nicht erforderlich ist.**

- Bearbeite ausschließlich die Dateien und Codeabschnitte, die die Aufgabe direkt betreffen.
- Bestehende Tests und Verhaltensweisen dürfen nicht ohne expliziten Auftrag verändert werden.

### 2. README immer aktuell halten

> **Nach jeder inhaltlichen Änderung am Spiel muss `README.md` aktualisiert werden.**

Konkret bedeutet das:
- Neues Feature → neue Zeile/neuen Abschnitt unter **✨ Features** hinzufügen.
- Entferntes Feature → entsprechenden Eintrag aus der Feature-Liste entfernen.
- Geänderte Zahlen (Städte, Fahrzeugtypen, Mitarbeiterrollen usw.) → Zahlen in README anpassen.

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

---

## Kodierkonventionen

- **Sprache der UI und aller Strings:** Deutsch
- **Sprache der Bezeichner (Variablen, Funktionen):** Englisch
- **Kein Build-Schritt:** Änderungen müssen direkt im Browser lauffähig sein

## Deployment

Das Spiel wird automatisch via GitHub Actions (`deploy.yml`) auf GitHub Pages veröffentlicht, sobald Änderungen auf den Hauptbranch gepusht werden. Es ist kein manueller Build notwendig.
