# SmartLamp JSON API

This PHP API stores photoresistor and infrared sensor readings, plus the current
lamp color state, sent by an ESP32.
Each request is saved as a timestamped record in `data.json`.

## Send sensor data

### `POST /api.php`

The `pht` value must be a non-negative integer. The `ir` value is `0` or `1`,
and `Color` is `0` for white, `1` for red, or `2` for off.

```http
POST /api.php HTTP/1.1
Content-Type: application/json

{"pht":420,"ir":1,"Color":0}
```

Response (`201 Created`):

```json
{
  "pht": 420,
  "ir": 1,
  "Color": 0,
  "received_at": "2026-11-03T17:51:41+00:00"
}
```

Invalid JSON or sensor values are rejected with an error response.

## Get stored data

### `GET /api.php`

Returns all stored records:

```json
{
  "count": 1,
  "records": [
    {
      "pht": 420,
      "ir": 1,
      "Color": 0,
      "received_at": "2026-11-03T17:51:41+00:00"
    }
  ]
}
```

Use `GET https://stan.1pc.nl/SmartLamp/api.php?limit=1` to return only the 20 most recent records. The
limit can be from `1` to `1000`.

From the project directory:

Test the API:

```text
curl -X POST https://stan.1pc.nl/SmartLamp/api.php -H "Content-Type: application/json" -d "{\"pht\":420,\"ir\":1,\"Color\":0}"
curl https://stan.1pc.nl/SmartLamp/api.php
curl https://stan.1pc.nl/SmartLamp/api.php?limit=1
```

The web server user must have permission to write `data.json`.
