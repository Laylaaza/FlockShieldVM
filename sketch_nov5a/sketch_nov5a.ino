// made by Stan Linskens

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "MMS_Gasten";
const char* password = "MMS_Gasten";

const char* Url = "http://stan.1pc.nl/SmartLamp/api.php";

const int LED_RED = 20;
const int LED_GREEN = 21;
const int LED_BLUE = 22;
const int PHT_SENSOR = 4;
const int IR_SENSOR = 2;

enum ColorState {
  white,
  red,
  off
};

char NewState = off;

ColorState CurrentState = off;

int IrValue = 0;
int PhtValue = 0;

bool LightOn = false;

unsigned long LastSend = 0;

void setup() {
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(PHT_SENSOR, INPUT);
  pinMode(IR_SENSOR, INPUT);

  Serial.begin(9600);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    WriteRgb(0, 0, 255);
    Serial.println("Connecting to WiFi...");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Connected");
    CurrentState = off;
    UpdateLed(off);
  }
}

void loop() {
  ReadIr();
  ReadPht();
  LightUp();
}

void LightUp()
{
  if (PhtValue < 5000) {
    NewState = (IrValue == HIGH) ? white : red;
  }

  if (NewState == CurrentState) {
    return;
  }

  CurrentState = NewState;
  UpdateLed(CurrentState);

  LightOn = (CurrentState != off);

  if (millis() - LastSend >= 1000) {
    SendDataToServer(PhtValue, IrValue, CurrentState);
    LastSend = millis();
  }
}

void ReadIr() {
  IrValue = digitalRead(IR_SENSOR);
  IrValue = (IrValue == HIGH) ? 1 : 0;
}

void ReadPht() {
  PhtValue = analogRead(PHT_SENSOR);
}

void PrintValue(const char* type, int value) {
  Serial.print(type);
  Serial.print(": ");
  Serial.println(value);
}

void UpdateLed(char state) {
  switch (state) {
    case white:
      WriteRgb(255, 255, 255);
      break;
    case red:
      WriteRgb(100, 0, 0);
      break;
    case off:
      WriteRgb(0, 0, 0);
      break;
  }
}

void WriteRgb(int redValue, int greenValue, int blueValue) {
  analogWrite(LED_RED, redValue);
  analogWrite(LED_GREEN, greenValue);
  analogWrite(LED_BLUE, blueValue);
}

void SendDataToServer(int phtValue, int irValue, ColorState CurrentState) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(Url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> jsonDoc;
    jsonDoc["pht"] = phtValue;
    jsonDoc["ir"] = irValue;
    jsonDoc["Color"] = CurrentState;

    String requestBody;
    serializeJson(jsonDoc, requestBody);

    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println(httpResponseCode);
      Serial.println(response);
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
    }

    http.end();
  } else {
    Serial.println("WiFi Disconnected");
  }
}