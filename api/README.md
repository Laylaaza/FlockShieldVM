# FlockShield API

## Beschrijving

De FlockShield API is gebouwd met PHP en SQL Server. De API vormt de verbinding tussen de hardware, AI en het dashboard.

De API ontvangt gegevens van de hardware en AI, slaat deze op in de SQL Server-database en stelt de gegevens beschikbaar aan het dashboard via JSON.

De API ondersteunt onder andere modules, vogeldetecties, afschrikacties, energi​​emetingen en AI-evaluaties.

## Benodigdheden

- PHP 8 of hoger
- Microsoft SQL Server
- PDO SQLSRV-extensie ingeschakeld
- SQL Server-verbindingsgegevens
- Postman (voor het testen van de API)

## Installatie en starten

Open een terminal in de map boven `aiapi` en voer het volgende commando uit:

```bash
php -S localhost:8000 -t api api/api.php
```

De API is vervolgens bereikbaar via:

`http://localhost:8000`

### Databaseverbinding

Vul bovenaan `api.php` de gegevens van de SQL Server-database in:

- Servernaam of IP-adres
- Databasenaam
- Gebruikersnaam
- Wachtwoord

De API maakt verbinding met de bestaande FlockShield-database. De tabellen worden niet automatisch aangemaakt.

## Endpoints

| Methode | Endpoint | Beschrijving |
|---|---|---|
| GET | `/api/status` | Controleert de API en databaseverbinding |
| GET | `/api/modules` | Haalt modules op |
| GET | `/api/detections` | Haalt vogeldetecties op |
| POST | `/api/detections` | Slaat een nieuwe vogeldetectie op |
| GET | `/api/actions` | Haalt afschrikacties op |
| POST | `/api/actions` | Slaat een nieuwe afschrikactie op |
| GET | `/api/energy` | Haalt energi​​emetingen op |
| POST | `/api/energy` | Slaat een nieuwe energiemeting op |
| GET | `/api/ai/test-rounds` | Haalt AI-testrondes op |
| GET | `/api/ai/evaluations` | Haalt AI-evaluaties op |
| POST | `/api/ai/evaluations` | Slaat een nieuwe AI-evaluatie op |
| GET | `/api/dashboard` | Geeft gecombineerde dashboardgegevens terug |

Bij de GET-endpoints voor detecties, acties en energi​​emetingen kan de hoeveelheid resultaten worden beperkt met `?limit=10`.

## Gegevens versturen

Voor POST-verzoeken moet de body in Postman op `raw` en `JSON` worden ingesteld.

Voorbeeld van een nieuwe vogeldetectie:

```json
{
  "module_id": 1,
  "detectie_tijdstip": "2026-11-23T10:30:00Z",
  "betrouwbaarheidsscore": 0.94,
  "invoerbron": "AI",
  "model_versie": "1.0"
}
```

De API controleert de verplichte velden en slaat de gegevens vervolgens op in SQL Server.


## Opmerkingen

- De API gebruikt SQL Server als centrale database.
- De API maakt geen nieuwe database of tabellen aan.
- Modules moeten al in de database bestaan voordat detecties aan deze modules gekoppeld kunnen worden.
- De hardware en AI moeten gegevens in het JSON-formaat aanleveren.
- Het dashboard haalt gegevens op via de GET-endpoints.
- De bestaande API van Stan wordt in deze versie niet gebruikt.
- De API heeft momenteel nog geen authenticatie en is bedoeld als ontwikkelversie.
- De SQL Server-verbinding en de queries moeten nog worden getest met de daadwerkelijke database.
