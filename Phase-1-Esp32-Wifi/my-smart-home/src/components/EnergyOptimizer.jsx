import React, { useState, useEffect } from 'react';

const EnergyOptimizer = ({ devices, sensorData, onApplySuggestions, serverIP = "localhost:3001" }) => {
  const [suggestions, setSuggestions] = useState({
    lightSuggestion: 0,
    fanSuggestion: 0,
    energySavings: 0,
    reasoning: ''
  });
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userBehavior, setUserBehavior] = useState('normal'); // normal, eco, comfort
  const [autoApply, setAutoApply] = useState(false);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate AI suggestions based on time, sensor data, and user behavior
  useEffect(() => {
    calculateOptimalSettings();
  }, [currentTime, sensorData, userBehavior, devices]);

  const calculateOptimalSettings = () => {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const timeDecimal = hour + minute / 60;
    
    // Get current device values
    const currentLight = devices.find(d => d.id === 1);
    const currentFan = devices.find(d => d.id === 9);
    const currentLightValue = currentLight ? Math.round((currentLight.brightness / 100) * 255) : 0;
    const currentFanValue = currentFan ? Math.round((currentFan.speed / 3) * 255) : 0;

    let optimalLight = 0;
    let optimalFan = 0;
    let reasoning = '';

    // Time-based optimization
    if (timeDecimal >= 6 && timeDecimal < 9) {
      // Morning (6 AM - 9 AM)
      optimalLight = userBehavior === 'eco' ? 120 : userBehavior === 'comfort' ? 180 : 150;
      optimalFan = userBehavior === 'eco' ? 85 : userBehavior === 'comfort' ? 170 : 127;
      reasoning = 'Morning routine: Moderate lighting and ventilation for fresh start';
    } else if (timeDecimal >= 9 && timeDecimal < 17) {
      // Work hours (9 AM - 5 PM)
      // Consider LDR sensor for natural light compensation
      const naturalLightCompensation = Math.max(0, (1024 - sensorData.ldr) / 1024);
      optimalLight = Math.round(naturalLightCompensation * (userBehavior === 'eco' ? 100 : userBehavior === 'comfort' ? 200 : 150));
      optimalFan = userBehavior === 'eco' ? 64 : userBehavior === 'comfort' ? 127 : 85;
      reasoning = `Work hours: Light adjusted for natural daylight (${Math.round(naturalLightCompensation * 100)}% compensation needed)`;
    } else if (timeDecimal >= 17 && timeDecimal < 21) {
      // Evening (5 PM - 9 PM)
      optimalLight = userBehavior === 'eco' ? 140 : userBehavior === 'comfort' ? 220 : 180;
      optimalFan = userBehavior === 'eco' ? 85 : userBehavior === 'comfort' ? 170 : 127;
      reasoning = 'Evening activities: Comfortable lighting and moderate cooling';
    } else if (timeDecimal >= 21 || timeDecimal < 6) {
      // Night (9 PM - 6 AM)
      optimalLight = userBehavior === 'eco' ? 50 : userBehavior === 'comfort' ? 120 : 80;
      optimalFan = userBehavior === 'eco' ? 42 : userBehavior === 'comfort' ? 127 : 85;
      reasoning = 'Night time: Dimmed lighting and gentle airflow for better sleep';
    }

    // Temperature-based fan adjustment
    if (sensorData.temp > 28) {
      optimalFan = Math.min(255, optimalFan + 85); // Increase fan speed
      reasoning += '. High temperature detected - increased cooling';
    } else if (sensorData.temp < 22) {
      optimalFan = Math.max(0, optimalFan - 42); // Decrease fan speed
      reasoning += '. Cool temperature - reduced fan speed';
    }

    // Calculate energy savings percentage
    const currentEnergyConsumption = (currentLightValue / 255 * 10) + (currentFanValue / 255 * 15); // Watts
    const optimizedEnergyConsumption = (optimalLight / 255 * 10) + (optimalFan / 255 * 15); // Watts
    const energySavings = Math.max(0, ((currentEnergyConsumption - optimizedEnergyConsumption) / currentEnergyConsumption) * 100);

    setSuggestions({
      lightSuggestion: Math.round((optimalLight / 255) * 100),
      fanSuggestion: Math.round((optimalFan / 255) * 3),
      energySavings: energySavings.toFixed(1),
      reasoning
    });

    // Auto-apply if enabled and suggestions are different from current values
    if (autoApply && (
      Math.abs(optimalLight - currentLightValue) > 10 ||
      Math.abs(Math.round((optimalFan / 255) * 3) - (currentFan ? currentFan.speed : 0)) > 0
    )) {
      onApplySuggestions(optimalLight, optimalFan);
    }
  };

  const applySuggestions = () => {
    const lightValue = Math.round((suggestions.lightSuggestion / 100) * 255);
    const fanValue = Math.round((suggestions.fanSuggestion / 3) * 255);
    
    // Send optimization data to backend for tracking
    fetch(`http://${serverIP}/api/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lightValue,
        fanValue,
        expectedSavings: suggestions.energySavings
      }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('Optimization applied and tracked:', data);
    })
    .catch(error => {
      console.error('Error tracking optimization:', error);
    });
    
    onApplySuggestions(lightValue, fanValue);
  };

  const getTimeOfDayIcon = () => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 12) return '🌅';
    if (hour >= 12 && hour < 17) return '☀️';
    if (hour >= 17 && hour < 21) return '🌇';
    return '🌙';
  };

  const getBehaviorIcon = () => {
    switch (userBehavior) {
      case 'eco': return '🌱';
      case 'comfort': return '🏠';
      default: return '⚖️';
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100 mb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
            <span className="mr-3 text-3xl">🤖</span>
            AI Energy Optimizer
          </h3>
          <p className="text-gray-600">Smart suggestions to reduce your electricity bill</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-2 rounded-full border border-green-200">
            <span className="text-green-700 font-semibold">💰 Save {suggestions.energySavings}%</span>
          </div>
          <div className="text-4xl">{getTimeOfDayIcon()}</div>
        </div>
      </div>

      {/* Current Status & Time */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500 rounded-xl">
              <span className="text-white text-xl">🕐</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-blue-700 font-medium">Current Time</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500 rounded-xl">
              <span className="text-white text-xl">🌡️</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-600">
                {sensorData.temp.toFixed(1)}°C
              </div>
              <div className="text-purple-700 font-medium">Temperature</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl p-6 border border-yellow-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500 rounded-xl">
              <span className="text-white text-xl">☀️</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-600">
                {Math.round((sensorData.ldr / 1024) * 100)}%
              </div>
              <div className="text-yellow-700 font-medium">Natural Light</div>
            </div>
          </div>
        </div>
      </div>

      {/* User Behavior Settings */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Optimization Mode</h4>
        <div className="grid grid-cols-3 gap-4">
          {[
            { mode: 'eco', label: 'Eco Mode', icon: '🌱', desc: 'Maximum savings' },
            { mode: 'normal', label: 'Balanced', icon: '⚖️', desc: 'Comfort + savings' },
            { mode: 'comfort', label: 'Comfort', icon: '🏠', desc: 'Maximum comfort' }
          ].map((option) => (
            <button
              key={option.mode}
              onClick={() => setUserBehavior(option.mode)}
              className={`p-4 rounded-xl border-2 transition-all duration-300 text-center ${
                userBehavior === option.mode
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-2">{option.icon}</div>
              <div className="font-semibold">{option.label}</div>
              <div className="text-xs text-gray-500 mt-1">{option.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
              <span className="mr-2">{getBehaviorIcon()}</span>
              Smart Recommendations
            </h4>
            <p className="text-gray-600 text-sm">{suggestions.reasoning}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Light Suggestion */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-yellow-500 rounded-xl">
                  <span className="text-white text-xl">💡</span>
                </div>
                <div>
                  <h5 className="font-semibold text-gray-900">LED Brightness</h5>
                  <p className="text-sm text-gray-600">Optimal: {suggestions.lightSuggestion}%</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-yellow-600">{suggestions.lightSuggestion}%</div>
                <div className="text-xs text-gray-500">of 255 levels</div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${suggestions.lightSuggestion}%` }}
              ></div>
            </div>
          </div>

          {/* Fan Suggestion */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-green-500 rounded-xl">
                  <span className="text-white text-xl">💨</span>
                </div>
                <div>
                  <h5 className="font-semibold text-gray-900">Fan Speed</h5>
                  <p className="text-sm text-gray-600">Optimal: Level {suggestions.fanSuggestion}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">Level {suggestions.fanSuggestion}</div>
                <div className="text-xs text-gray-500">of 5 speeds</div>
              </div>
            </div>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className={`flex-1 h-3 rounded-full transition-all duration-300 ${
                    level <= suggestions.fanSuggestion
                      ? 'bg-gradient-to-r from-green-400 to-green-500'
                      : 'bg-gray-200'
                  }`}
                ></div>
              ))}
            </div>
          </div>
        </div>

        {/* Energy Savings Display */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="text-lg font-semibold mb-2 flex items-center">
                <span className="mr-2">💰</span>
                Potential Energy Savings
              </h5>
              <p className="text-green-100 text-sm">
                Following these suggestions could save you {suggestions.energySavings}% on electricity costs
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{suggestions.energySavings}%</div>
              <div className="text-green-100 text-sm">Monthly Savings</div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={applySuggestions}
          className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
        >
          <span className="flex items-center justify-center space-x-2">
            <span>🎯</span>
            <span>Apply AI Suggestions</span>
          </span>
        </button>
        
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-200">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              🤖 Auto-apply suggestions
            </span>
          </label>
        </div>
      </div>

      {/* Tips Section */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
        <h5 className="font-semibold text-blue-900 mb-2 flex items-center">
          <span className="mr-2">💡</span>
          Energy Saving Tips
        </h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• LED brightness can be reduced by 20% without noticeable difference</li>
          <li>• Fan speed adjustment based on temperature saves up to 30% energy</li>
          <li>• Using natural light during day reduces electricity consumption</li>
          <li>• Night mode settings can save 40% on lighting costs</li>
        </ul>
      </div>
    </div>
  );
};

export default EnergyOptimizer;