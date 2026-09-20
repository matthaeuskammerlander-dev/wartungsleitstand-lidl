# Aufbereitung der Excel-Liste

Diese PowerShell-Skripte erzeugen `daten.js` aus `Wartungen_Lidl.xlsx`. Sie
brauchen weder Python noch Node, nur Windows PowerShell. Reihenfolge:

```powershell
.\xlsx2tsv.ps1 -Xlsx "..\Wartungen_Lidl.xlsx" -OutDir ".\data"   # Blätter -> TSV
.\parse.ps1                                                       # TSV -> positionen.json
.\markets.ps1                                                     # Standorte zusammenfassen
# Koordinaten: geoqueries.json über Nominatim geocodieren -> data\coords.json
.\build.ps1                                                       # alles -> app\daten.js
```

Die Skripte erwarten ein Unterverzeichnis `data` neben sich und schreiben
`daten.js` nach `..\`. Wenn sich nur einzelne Adressen ändern, reicht es,
`coords.json` von Hand zu ergänzen und `build.ps1` erneut laufen zu lassen.

`serve.ps1` startet einen kleinen lokalen Webserver zum Ausprobieren:

```powershell
.\serve.ps1 -Port 8099 -Root ".."
```

`pdftext2.ps1` zieht den Text aus dem alten Wartungsprotokoll-PDF — nur
dokumentiert, falls das Formular wieder einmal abgeglichen werden muss.

## Stolpersteine, die hier schon gelöst sind

- Die drei Blätter der Liste lassen sich **nicht** über die Zeilennummer
  verbinden, ab Zeile 17 laufen sie auseinander. Verbunden wird über
  Filialnummer beziehungsweise normalisierte Adresse.
- Die Jahres-Spaltenüberschriften stimmen teilweise nicht mit dem Inhalt
  überein (in der 2020-Spalte stehen 61 Termine aus 2021). Das Jahr wird
  deshalb immer aus dem Datum gelesen.
- Excel-Datumswerte sind Seriennummern ab dem 30.12.1899.
