import React, { useState, useEffect, useCallback } from 'react';

const AIEnergyOptimizer = ({ sensorData, onApplySuggestions, serverIP = "localhost:3001" }) => {
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentState, setCurrentState] = useState({ light: 0, fan: 0 });
  const [appliedOptimizations, setAppliedOptimizations] = useState([]);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [lastOptimizationTime, setLastOptimizationTime] = useState(null);

  // Fetch current device state
  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(`http://${serverIP}/api/state`);
      const data = await response.json();
      setCurrentState({ light: data.light, fan: data.fan });
    } catch (error) {
      console.error('Error fetching state:', error);
    }
  }, [serverIP]);

  const getAIOptimizationSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://${serverIP}/api/ai-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        const suggestion = data.suggestion;
        const currentPower = ((currentState.light / 255) * 10) + ((currentState.fan / 255) * 15);
        const optimizedPower = ((suggestion.ledBrightness / 255) * 10) + ((suggestion.fanSpeed / 255) * 15);
        const powerSavings = currentPower - optimizedPower;
        
        setAiSuggestions({
          ledBrightness: suggestion.ledBrightness,
          fanSpeed: suggestion.fanSpeed,
          expectedSavings: suggestion.expectedSavings,
          explanation: suggestion.explanation,
          comfortLevel: suggestion.comfortLevel,
          currentPower: currentPower.toFixed(2),
          optimizedPower: optimizedPower.toFixed(2),
          powerSavings: powerSavings.toFixed(2),
          timestamp: new Date(data.timestamp)
        });

        // Auto-apply if enabled and significant savings are possible
        if (autoOptimize && powerSavings > 1) {
          console.log('Auto-applying suggestions in 2 seconds...');
        }
      } else {
        console.error('Failed to get AI suggestions:', data.error);
      }
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [serverIP, currentState.light, currentState.fan, autoOptimize]);

  useEffect(() => {
    fetchState();
    // Auto-fetch suggestions every 5 minutes if auto-optimize is enabled
    const interval = setInterval(() => {
      if (autoOptimize) {
        getAIOptimizationSuggestions();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchState, autoOptimize, getAIOptimizationSuggestions]);



  const applySuggestions = async () => {
    if (!aiSuggestions) return;

    try {
      const response = await fetch(`http://${serverIP}/api/apply-ai-optimization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledBrightness: aiSuggestions.ledBrightness,
          fanSpeed: aiSuggestions.fanSpeed,
          expectedSavings: aiSuggestions.expectedSavings
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Apply to local devices
        onApplySuggestions(aiSuggestions.ledBrightness, aiSuggestions.fanSpeed);
        
        // Track applied optimization
        setAppliedOptimizations(prev => [...prev, {
          ...aiSuggestions,
          appliedAt: new Date(),
          actualSavings: result.actualSavings,
          savingsPercentage: result.savingsPercentage
        }]);

        setLastOptimizationTime(new Date());
        setAiSuggestions(null);
        
        // Fetch updated state
        await fetchState();
        
        console.log('AI optimization applied successfully:', result);
      } else {
        console.error('Failed to apply optimization:', result.error);
      }
    } catch (error) {
      console.error('Error applying suggestions:', error);
    }
  };

  const getComfortLevelColor = (level) => {
    if (level >= 8) return 'text-green-600';
    if (level >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSavingsColor = (savings) => {
    if (savings >= 25) return 'from-green-500 to-emerald-500';
    if (savings >= 15) return 'from-blue-500 to-cyan-500';
    return 'from-yellow-500 to-orange-500';
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100 mb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
            <span className="mr-3 text-3xl">🤖</span>
            Gemini AI Energy Optimizer
          </h3>
          <p className="text-gray-600">Real AI-powered energy optimization suggestions</p>
        </div>
        <div className="flex items-center space-x-4">
          {aiSuggestions && (
            <div className={`bg-gradient-to-r ${getSavingsColor(aiSuggestions.expectedSavings)} px-4 py-2 rounded-full text-white font-semibold`}>
              💰 Save {aiSuggestions.expectedSavings}%
            </div>
          )}
        </div>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-lg">💡</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-blue-600">
                {Math.round((currentState.light / 255) * 100)}%
              </div>
              <div className="text-blue-700 text-sm">Current LED</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-lg">💨</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-green-600">
                {Math.round((currentState.fan / 255) * 5)}
              </div>
              <div className="text-green-700 text-sm">Current Fan</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-purple-500 rounded-lg">
              <span className="text-white text-lg">🌡️</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-purple-600">
                {sensorData.temp.toFixed(1)}°C
              </div>
              <div className="text-purple-700 text-sm">Temperature</div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border border-yellow-200">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-lg">⚡</span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-yellow-600">
                {(((currentState.light / 255) * 10) + ((currentState.fan / 255) * 15)).toFixed(1)}W
              </div>
              <div className="text-yellow-700 text-sm">Power Usage</div>
            </div>
          </div>
        </div>
      </div>

      {/* Get AI Suggestions Button */}
      {!aiSuggestions && !loading && (
        <div className="text-center mb-8">
          <button
            onClick={getAIOptimizationSuggestions}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            <span className="flex items-center justify-center space-x-2">
              <span>🔮</span>
              <span>Get AI Energy Suggestions</span>
            </span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          <p className="text-gray-600 mt-4">🤖 AI is analyzing your energy usage patterns...</p>
        </div>
      )}

      {/* AI Suggestions */}
      {aiSuggestions && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200 mb-6">
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
              <span className="mr-2">🧠</span>
              AI Analysis & Recommendations
            </h4>
            <p className="text-gray-700 text-sm bg-white p-3 rounded-lg border border-gray-200">
              {aiSuggestions.explanation}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* LED Suggestion */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-yellow-500 rounded-xl">
                    <span className="text-white text-xl">💡</span>
                  </div>
                  <div>
                    <h5 className="font-semibold text-gray-900">LED Brightness</h5>
                    <p className="text-sm text-gray-600">
                      {Math.round((aiSuggestions.ledBrightness / 255) * 100)}% 
                      <span className="text-xs text-gray-500 ml-1">({aiSuggestions.ledBrightness}/255)</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(aiSuggestions.ledBrightness / 255) * 100}%` }}
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
                    <p className="text-sm text-gray-600">
                      Level {Math.round((aiSuggestions.fanSpeed / 255) * 5)} 
                      <span className="text-xs text-gray-500 ml-1">({aiSuggestions.fanSpeed}/255)</span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex space-x-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`flex-1 h-3 rounded-full transition-all duration-300 ${
                      level <= Math.round((aiSuggestions.fanSpeed / 255) * 5)
                        ? 'bg-gradient-to-r from-green-400 to-green-500'
                        : 'bg-gray-200'
                    }`}
                  ></div>
                ))}
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 text-center border border-gray-100">
              <div className="text-2xl font-bold text-green-600">{aiSuggestions.expectedSavings}%</div>
              <div className="text-sm text-gray-600">Expected Savings</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center border border-gray-100">
              <div className={`text-2xl font-bold ${getComfortLevelColor(aiSuggestions.comfortLevel)}`}>
                {aiSuggestions.comfortLevel}/10
              </div>
              <div className="text-sm text-gray-600">Comfort Level</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center border border-gray-100">
              <div className="text-2xl font-bold text-blue-600">{aiSuggestions.powerSavings}W</div>
              <div className="text-sm text-gray-600">Power Reduction</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={applySuggestions}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <span className="flex items-center justify-center space-x-2">
                <span>✨</span>
                <span>Apply AI Suggestions</span>
              </span>
            </button>
            
            <button
              onClick={() => setAiSuggestions(null)}
              className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all duration-300"
            >
              Get New Suggestions
            </button>
          </div>
        </div>
      )}

      {/* Auto-optimize Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6">
        <div>
          <h5 className="font-semibold text-gray-900">🤖 Auto-Optimization</h5>
          <p className="text-sm text-gray-600">Let AI automatically optimize your devices every 5 minutes</p>
        </div>
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={autoOptimize}
            onChange={(e) => setAutoOptimize(e.target.checked)}
            className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            {autoOptimize ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {/* Recent Optimizations */}
      {appliedOptimizations.length > 0 && (
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <h5 className="font-semibold text-green-900 mb-2 flex items-center">
            <span className="mr-2">📊</span>
            Recent AI Optimizations
          </h5>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {appliedOptimizations.slice(-3).reverse().map((opt, index) => (
              <div key={index} className="text-sm text-green-800 bg-white p-2 rounded border border-green-100">
                <div className="flex justify-between items-center">
                  <span>
                    💡 {Math.round((opt.ledBrightness / 255) * 100)}% | 
                    💨 Level {Math.round((opt.fanSpeed / 255) * 5)} | 
                    💰 {opt.actualSavings}W saved
                  </span>
                  <span className="text-xs text-green-600">
                    {opt.appliedAt.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastOptimizationTime && (
        <div className="text-center text-sm text-gray-500 mt-4">
          Last AI optimization: {lastOptimizationTime.toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default AIEnergyOptimizer;