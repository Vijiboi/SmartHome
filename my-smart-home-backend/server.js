require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
let genAI, model;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found in environment variables");
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 1000,
    },
  });
  console.log("✅ Gemini AI initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize Gemini AI:", error.message);
  model = null;
}

// Middleware to handle cross-origin requests and parse JSON bodies
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  })
);
app.use(bodyParser.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// In-memory storage for the device state and sensor readings
let deviceState = {
  fan: 127, // PWM value (0-255) - start with some default
  light: 150, // PWM value (0-255) - start with some default
  sensors: {
    gas: 150, // Raw value from gas sensor
    ldr: 512, // Raw value from LDR (medium light)
    temp: 25, // Value from temperature sensor in °C (comfortable temp)
  },
};

// Energy usage tracking
let energyData = {
  dailyUsage: [],
  hourlyUsage: Array(24).fill(0),
  totalSavings: 0,
  lastOptimizationTime: null,
  usageHistory: [],
  aiSuggestions: [],
};

// Chat history for the AI chatbot
let chatHistory = [];

// Function to calculate energy consumption
const calculateEnergyConsumption = (lightValue, fanValue) => {
  // LED power consumption: ~10W at full brightness
  // Fan power consumption: ~15W at full speed
  const lightPower = (lightValue / 255) * 10; // Watts
  const fanPower = (fanValue / 255) * 15; // Watts
  return lightPower + fanPower;
};

// Function to track energy usage
const trackEnergyUsage = () => {
  const currentConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );
  const hour = new Date().getHours();

  energyData.hourlyUsage[hour] += currentConsumption / 3600; // Convert to kWh per hour

  // Add to usage history with timestamp
  energyData.usageHistory.push({
    timestamp: new Date(),
    light: deviceState.light,
    fan: deviceState.fan,
    consumption: currentConsumption,
    temperature: deviceState.sensors.temp,
    lightLevel: deviceState.sensors.ldr,
  });

  // Keep only last 1000 entries to prevent memory overflow
  if (energyData.usageHistory.length > 1000) {
    energyData.usageHistory = energyData.usageHistory.slice(-1000);
  }
};

// Start energy tracking interval
setInterval(trackEnergyUsage, 60000); // Track every minute

// Function to get AI energy optimization suggestions
async function getAIOptimizationSuggestions() {
  try {
    if (!model) {
      throw new Error("Gemini AI model not initialized");
    }
    const currentHour = new Date().getHours();
    const currentTemp = deviceState.sensors.temp;
    const currentLightLevel = deviceState.sensors.ldr;
    const currentConsumption = calculateEnergyConsumption(
      deviceState.light,
      deviceState.fan
    );

    // Get recent usage patterns
    const recentUsage = energyData.usageHistory.slice(-10);
    const avgRecentConsumption =
      recentUsage.length > 0
        ? recentUsage.reduce((sum, entry) => sum + entry.consumption, 0) /
          recentUsage.length
        : 0;

    const hourlyPattern = energyData.hourlyUsage
      .map((usage, hour) => `${hour}h:${usage.toFixed(1)}kWh`)
      .join(", ");

    const prompt = `You are an AI energy optimization expert for a smart home system. 

Current Status:
- Time: ${currentHour}:00 (24-hour format)
- Current LED brightness: ${deviceState.light}/255 (${Math.round(
      (deviceState.light / 255) * 100
    )}%)
- Current fan speed: ${deviceState.fan}/255 (${Math.round(
      (deviceState.fan / 255) * 5
    )} of 5 levels)
- Room temperature: ${currentTemp}°C
- Light sensor reading: ${currentLightLevel}/1024 (${Math.round(
      (currentLightLevel / 1024) * 100
    )}% brightness)
- Current power consumption: ${currentConsumption.toFixed(2)}W

Based on this data, provide energy optimization recommendations. Consider:
- Time of day (reduce brightness at night, optimize for comfort during day)
- Temperature (increase fan if hot, reduce if cool)
- Natural light available (reduce LED if sufficient natural light)
- Energy savings potential while maintaining comfort

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "ledBrightness": 150,
  "fanSpeed": 100,
  "expectedSavings": 25,
  "explanation": "Your optimization reasoning here",
  "comfortLevel": 8
}

Values: ledBrightness (0-255), fanSpeed (0-255), expectedSavings (0-100%), comfortLevel (1-10)`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("✅ Gemini AI Response:", text);

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestion = JSON.parse(jsonMatch[0]);

      // Ensure numeric values
      suggestion.ledBrightness =
        Number(suggestion.ledBrightness) || deviceState.light;
      suggestion.fanSpeed = Number(suggestion.fanSpeed) || deviceState.fan;
      suggestion.expectedSavings = Number(suggestion.expectedSavings) || 0;
      suggestion.comfortLevel = Number(suggestion.comfortLevel) || 7;

      // Store the suggestion with timestamp
      energyData.aiSuggestions.push({
        timestamp: new Date(),
        suggestion: suggestion,
        currentState: { ...deviceState },
        applied: false,
      });

      // Keep only last 20 suggestions
      if (energyData.aiSuggestions.length > 20) {
        energyData.aiSuggestions = energyData.aiSuggestions.slice(-20);
      }

      return suggestion;
    }

    throw new Error("Invalid AI response format");
  } catch (error) {
    console.error("❌ Gemini AI Error:", error.message);
    console.log("🔄 Using fallback optimization...");

    // Enhanced fallback suggestions based on smart rules
    const currentHour = new Date().getHours();
    const currentTemp = deviceState.sensors.temp;
    const lightLevel = deviceState.sensors.ldr;

    let ledBrightness = deviceState.light;
    let fanSpeed = deviceState.fan;
    let expectedSavings = 0;
    let explanation = "Smart fallback optimization";

    // Time-based optimization
    if (currentHour >= 22 || currentHour <= 6) {
      // Night time: reduce brightness significantly
      ledBrightness = Math.max(30, Math.floor(deviceState.light * 0.3));
      fanSpeed = Math.max(50, Math.floor(deviceState.fan * 0.6));
      expectedSavings = 35;
      explanation =
        "Night mode: Reduced lighting and fan speed for sleep comfort and energy savings";
    } else if (currentHour >= 9 && currentHour <= 17) {
      // Daytime: utilize natural light
      const naturalLightFactor = Math.max(0.3, 1 - lightLevel / 1024);
      ledBrightness = Math.floor(deviceState.light * naturalLightFactor);
      expectedSavings = 20;
      explanation = `Daytime optimization: Reduced LED brightness by ${Math.round(
        (1 - naturalLightFactor) * 100
      )}% using natural light`;
    } else {
      // Evening: balanced settings
      ledBrightness = Math.floor(deviceState.light * 0.85);
      expectedSavings = 15;
      explanation =
        "Evening optimization: Balanced comfort and energy efficiency";
    }

    // Temperature-based fan adjustment
    if (currentTemp > 28) {
      fanSpeed = Math.min(255, Math.floor(deviceState.fan * 1.3));
      explanation += ". Increased fan speed due to high temperature";
    } else if (currentTemp < 20) {
      fanSpeed = Math.max(30, Math.floor(deviceState.fan * 0.7));
      explanation += ". Reduced fan speed due to cool temperature";
    }

    return {
      ledBrightness: Math.max(0, Math.min(255, ledBrightness)),
      fanSpeed: Math.max(0, Math.min(255, fanSpeed)),
      expectedSavings,
      explanation,
      comfortLevel: 7,
    };
  }
}

// AI Chatbot function
async function getChatbotResponse(userMessage, context = {}) {
  try {
    if (!model) {
      throw new Error("Gemini AI model not initialized");
    }
    const lightPercent = Math.round((deviceState.light / 255) * 100);
    const fanPercent = Math.round((deviceState.fan / 255) * 100);
    const lightLevelPercent = Math.round(
      (deviceState.sensors.ldr / 1024) * 100
    );
    const currentPower = calculateEnergyConsumption(
      deviceState.light,
      deviceState.fan
    ).toFixed(2);

    const systemContext = `You are an intelligent smart home assistant. You can help users with:
1. Energy optimization and savings tips
2. Device control recommendations
3. Smart home automation advice
4. Environmental monitoring insights

Current smart home status:
- LED brightness: ${deviceState.light}/255 (${lightPercent}%)
- Fan speed: ${deviceState.fan}/255 (${fanPercent}%)
- Room temperature: ${deviceState.sensors.temp}°C
- Light level: ${deviceState.sensors.ldr}/1024 (${lightLevelPercent}%)
- Current power consumption: ${currentPower}W
- Total energy savings today: ${energyData.totalSavings.toFixed(2)}W

Be helpful, concise, and provide actionable advice. Respond in a friendly, conversational manner.`;

    const prompt = `${systemContext}

User message: "${userMessage}"

Respond helpfully and conversationally. Keep responses under 100 words unless more detail is specifically requested.`;

    console.log("🤖 Chatbot processing:", userMessage);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("✅ Chatbot response generated successfully");

    // Store chat history
    chatHistory.push({
      timestamp: new Date(),
      user: userMessage,
      assistant: text,
      context: { ...deviceState },
    });

    // Keep only last 50 chat entries
    if (chatHistory.length > 50) {
      chatHistory = chatHistory.slice(-50);
    }

    return text;
  } catch (error) {
    console.error("❌ Chatbot Error:", error.message);
    console.error("Full error:", error);

    // Provide a more helpful fallback response based on the user's message
    const message = userMessage.toLowerCase();

    if (
      message.includes("energy") ||
      message.includes("save") ||
      message.includes("bill")
    ) {
      return `Based on your current setup (LED: ${Math.round(
        (deviceState.light / 255) * 100
      )}%, Fan: ${Math.round(
        (deviceState.fan / 255) * 100
      )}%), here are some energy tips:
      
• Reduce LED brightness by 20% during daytime
• Use fan speed level 2-3 for optimal comfort
• Turn off lights when not needed
• Current power usage: ${calculateEnergyConsumption(
        deviceState.light,
        deviceState.fan
      ).toFixed(1)}W

Would you like specific optimization suggestions?`;
    }

    if (
      message.includes("temperature") ||
      message.includes("hot") ||
      message.includes("cold")
    ) {
      return `Current room temperature is ${
        deviceState.sensors.temp
      }°C. For optimal comfort:
      
• If too warm: Increase fan speed or reduce LED heat
• If too cool: Reduce fan speed
• Ideal range: 22-26°C
      
Your current fan is at ${Math.round(
        (deviceState.fan / 255) * 100
      )}%. Would you like me to suggest adjustments?`;
    }

    if (
      message.includes("light") ||
      message.includes("bright") ||
      message.includes("dark")
    ) {
      return `Current lighting: LED at ${Math.round(
        (deviceState.light / 255) * 100
      )}%, natural light at ${Math.round(
        (deviceState.sensors.ldr / 1024) * 100
      )}%.
      
Suggestions:
• Use natural light during day
• Dim LED for evening ambiance  
• Night mode: 10-20% brightness
      
Need help adjusting your lighting?`;
    }

    return `Hi! I'm your smart home assistant. I can help with energy optimization, device control, and monitoring. 

Current status:
• LED: ${Math.round((deviceState.light / 255) * 100)}%
• Fan: ${Math.round((deviceState.fan / 255) * 100)}% 
• Temperature: ${deviceState.sensors.temp}°C
• Power: ${calculateEnergyConsumption(
      deviceState.light,
      deviceState.fan
    ).toFixed(1)}W

Try asking about energy savings, device control, or optimization tips!`;
  }
}

// ======================================
// API Endpoints
// ======================================

app.get("/", (req, res) => {
  res.send("🎉 Hello! The Smart Home AI API server is running correctly.");
});
app.post("/api/control", (req, res) => {
  const { fan, light } = req.body;

  if (fan !== undefined) {
    deviceState.fan = Math.max(0, Math.min(255, parseInt(fan)));
  }
  if (light !== undefined) {
    deviceState.light = Math.max(0, Math.min(255, parseInt(light)));
  }

  console.log("Updated device state:", deviceState);
  res.json({ success: true, state: deviceState });
});

// ======================================
// API Endpoint for the ESP32 to send sensor data
// ======================================
// This route accepts POST requests from the ESP32 with sensor readings.
// The ESP32 will periodically send data to this endpoint.
app.post("/api/sensors", (req, res) => {
  const { gas, ldr, temp } = req.body;

  if (gas !== undefined) {
    deviceState.sensors.gas = parseFloat(gas);
  }
  if (ldr !== undefined) {
    deviceState.sensors.ldr = parseFloat(ldr);
  }
  if (temp !== undefined) {
    deviceState.sensors.temp = parseFloat(temp);
  }

  console.log("Received sensor data:", deviceState.sensors);
  res.json({ success: true });
});

// ======================================
// API Endpoint for the Frontend to get the latest state
// ======================================
// This route is a simple GET request that returns the current state
// of all devices and sensors. The frontend will poll this endpoint.
app.get("/api/state", (req, res) => {
  res.json(deviceState);
});

// ======================================
// API Endpoint for Energy Optimization
// ======================================
app.get("/api/energy", (req, res) => {
  const currentConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );
  const dailyTotal = energyData.hourlyUsage.reduce(
    (sum, usage) => sum + usage,
    0
  );

  res.json({
    currentConsumption: currentConsumption.toFixed(2),
    dailyUsage: dailyTotal.toFixed(3),
    hourlyUsage: energyData.hourlyUsage,
    totalSavings: energyData.totalSavings,
    usageHistory: energyData.usageHistory.slice(-24),
    aiSuggestions: energyData.aiSuggestions.slice(-5),
    lastUpdate: new Date(),
  });
});

// AI Energy Optimization endpoint
app.post("/api/ai-optimize", async (req, res) => {
  try {
    const suggestion = await getAIOptimizationSuggestions();
    res.json({
      success: true,
      suggestion: suggestion,
      currentState: deviceState,
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get AI optimization suggestions",
      details: error.message,
    });
  }
});

// Apply AI optimization suggestions
app.post("/api/apply-ai-optimization", (req, res) => {
  const { ledBrightness, fanSpeed, expectedSavings } = req.body;

  const beforeConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );

  // Apply the optimization
  if (ledBrightness !== undefined) {
    deviceState.light = Math.max(0, Math.min(255, parseInt(ledBrightness)));
  }
  if (fanSpeed !== undefined) {
    deviceState.fan = Math.max(0, Math.min(255, parseInt(fanSpeed)));
  }

  const afterConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );
  const actualSavings = beforeConsumption - afterConsumption;

  // Track savings
  if (actualSavings > 0) {
    energyData.totalSavings += actualSavings;
  }

  energyData.lastOptimizationTime = new Date();

  // Mark the suggestion as applied
  if (energyData.aiSuggestions.length > 0) {
    energyData.aiSuggestions[
      energyData.aiSuggestions.length - 1
    ].applied = true;
  }

  console.log(
    "AI Optimization applied: Light:",
    ledBrightness,
    "Fan:",
    fanSpeed,
    "Savings:",
    actualSavings.toFixed(2) + "W"
  );

  res.json({
    success: true,
    state: deviceState,
    actualSavings: actualSavings.toFixed(2),
    expectedSavings: expectedSavings || 0,
    savingsPercentage:
      beforeConsumption > 0
        ? ((actualSavings / beforeConsumption) * 100).toFixed(1)
        : 0,
  });
});

// AI Chatbot endpoint
app.post("/api/chat", async (req, res) => {
  console.log("📨 Chat request received:", req.body);

  try {
    const { message } = req.body;

    if (!message || message.trim() === "") {
      console.log("❌ Empty message received");
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    console.log("🤖 Processing message:", message.trim());
    const response = await getChatbotResponse(message.trim());

    console.log("✅ Chat response generated, length:", response.length);

    res.json({
      success: true,
      response: response,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("❌ Chat endpoint error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get chatbot response",
      details: error.message,
    });
  }
});

// Get chat history
app.get("/api/chat-history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    success: true,
    history: chatHistory.slice(-limit),
    total: chatHistory.length,
  });
});

// API Endpoint to apply AI optimization
app.post("/api/optimize", (req, res) => {
  const { lightValue, fanValue, expectedSavings } = req.body;

  const beforeConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );

  // Apply the optimization
  if (lightValue !== undefined) {
    deviceState.light = Math.max(0, Math.min(255, parseInt(lightValue)));
  }
  if (fanValue !== undefined) {
    deviceState.fan = Math.max(0, Math.min(255, parseInt(fanValue)));
  }

  const afterConsumption = calculateEnergyConsumption(
    deviceState.light,
    deviceState.fan
  );
  const actualSavings = beforeConsumption - afterConsumption;

  // Track savings
  if (actualSavings > 0) {
    energyData.totalSavings += actualSavings;
  }

  energyData.lastOptimizationTime = new Date();

  console.log(
    `AI Optimization applied: Light: ${lightValue}, Fan: ${fanValue}, Savings: ${actualSavings.toFixed(
      2
    )}W`
  );

  res.json({
    success: true,
    state: deviceState,
    actualSavings: actualSavings.toFixed(2),
    expectedSavings: expectedSavings,
  });
});

// API Endpoint for usage analytics
app.get("/api/analytics", (req, res) => {
  const now = new Date();
  const hour = now.getHours();

  // Calculate peak usage hours
  const peakHour = energyData.hourlyUsage.indexOf(
    Math.max(...energyData.hourlyUsage)
  );
  const lowHour = energyData.hourlyUsage.indexOf(
    Math.min(...energyData.hourlyUsage.filter((h) => h > 0))
  );

  // Calculate efficiency score based on usage patterns
  const totalUsage = energyData.hourlyUsage.reduce(
    (sum, usage) => sum + usage,
    0
  );
  const averageUsage = totalUsage / 24;
  const currentUsage = energyData.hourlyUsage[hour];
  const efficiencyScore = Math.max(
    0,
    Math.min(100, 100 - (currentUsage / averageUsage - 1) * 50)
  );

  res.json({
    peakHour: Number(peakHour) || 0,
    lowHour: Number(lowHour) || 0,
    averageDaily: Number(totalUsage.toFixed(3)) || 0,
    currentHourUsage: Number(currentUsage.toFixed(3)) || 0,
    efficiencyScore: Number(efficiencyScore.toFixed(1)) || 0,
    totalSavings: Number(energyData.totalSavings) || 0,
    optimizationCount: energyData.aiSuggestions.filter((s) => s.applied).length,
    aiSuggestionsToday: energyData.aiSuggestions.filter(
      (s) => new Date(s.timestamp).toDateString() === new Date().toDateString()
    ).length,
  });
});

// Test Gemini AI endpoint
app.get("/api/test-ai", async (req, res) => {
  try {
    if (!model) {
      throw new Error("Gemini AI model not initialized - check API key");
    }

    console.log("🧪 Testing Gemini AI...");
    const result = await model.generateContent(
      "Respond with just the word 'WORKING' if you can see this message."
    );
    const response = await result.response;
    const text = response.text();
    console.log("✅ Gemini test successful:", text.trim());

    res.json({ success: true, response: text.trim(), geminiWorking: true });
  } catch (error) {
    console.error("❌ Gemini test failed:", error.message);
    res.json({
      success: false,
      error: error.message,
      geminiWorking: false,
      apiKeyConfigured: !!process.env.GEMINI_API_KEY,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log("🚀 Smart Home AI Server running at http://localhost:" + PORT);
  console.log("🤖 AI Features: Energy Optimization & Chatbot Enabled");
  console.log(
    "🔑 Gemini API Key configured:",
    process.env.GEMINI_API_KEY ? "Yes" : "No"
  );
});
