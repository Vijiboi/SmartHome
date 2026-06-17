#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ======================================
// 1. WiFi Configuration
// ======================================
const char* ssid = "Airtel_Prakasham airtell"; //change
const char* password = "8871588000"; //Change

// ======================================
// 2. Server Configuration
// ======================================

const char* serverUrl = "http://192.168.1.12:5000"; //to_be_updated

// ======================================
// 3. Pin Definitions
// ======================================
#define FAN_PIN 5   // GPIO for the motor (e.g., connected to a MOSFET or motor driver)
#define LED_PIN 18  // GPIO for the LED
#define GAS_PIN 34  // Analog pin for the gas sensor
#define LDR_PIN 35  // Analog pin for the LDR
#define TEMP_PIN 32 // Analog pin for the temperature sensor (e.g., LM35)

// ======================================
// 4. PWM Configuration - No ledcSetup
// ======================================
// We will use analogWrite(), which is simpler and more compatible.
// It uses a default 8-bit resolution (0-255).

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ Connected to WiFi!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup pins for PWM using pinMode
  pinMode(FAN_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Stage 1: Send sensor data to the server
    sendSensorData();

    // Stage 2: Fetch control state from the server
    fetchControlState();

    delay(2000); // Poll every 2 seconds
  } else {
    Serial.println("WiFi not connected. Retrying...");
    delay(5000);
  }
}

// ======================================
// Function to send sensor data to the server
// ======================================

void sendSensorData() {
  int gasVal = analogRead(GAS_PIN);
  int ldrVal = analogRead(LDR_PIN);
  float tempVal = analogRead(TEMP_PIN);

  float temperature = (tempVal * 3.3 / 4095.0) / 0.01;

  HTTPClient http;
  String url = String(serverUrl) + "/api/sensors";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  String json = "{\"gas\":" + String(gasVal) +
                ",\"ldr\":" + String(ldrVal) +
                ",\"temp\":" + String(temperature, 2) + "}";

  int httpResponseCode = http.POST(json);

  if (httpResponseCode > 0) {
    Serial.println("📤 Sensor data sent: " + json);
  } else {
    Serial.printf("❌ Error sending data, code: %d\n", httpResponseCode);
  }
  http.end();
}

// ======================================
// Function to fetch control state from the server and apply PWM
// ======================================
void fetchControlState() {
  HTTPClient http;
  String url = String(serverUrl) + "/api/state";
  http.begin(url);
  int httpResponseCode = http.GET();

  if (httpResponseCode == 200) {
    String payload = http.getString();
    Serial.println("📥 State received: " + payload);

    // Parse JSON response using ArduinoJson
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      int fanValue = doc["fan"];
      int lightValue = doc["light"];

      // Apply PWM to the fan and LED using analogWrite
      analogWrite(FAN_PIN, fanValue);
      analogWrite(LED_PIN, lightValue);

      Serial.printf("⚡ Applied PWM -> Fan: %d, Light: %d\n", fanValue, lightValue);
    } else {
      Serial.println("❌ JSON parsing failed!");
    }
  } else {
    Serial.printf("❌ Error fetching state, code: %d\n", httpResponseCode);
  }
  http.end();
}