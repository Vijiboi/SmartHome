import React, { useState, useEffect } from 'react';

const EnergyAnalytics = ({ serverIP }) => {
  const [analytics, setAnalytics] = useState({
    peakHour: 0,
    lowHour: 0,
    averageDaily: 0,
    currentHourUsage: 0,
    efficiencyScore: 0,
    totalSavings: 0,
    optimizationCount: 0
  });

  const [energyData, setEnergyData] = useState({
    currentConsumption: 0,
    dailyUsage: 0,
    hourlyUsage: Array(24).fill(0),
    usageHistory: []
  });

  const fetchAnalytics = React.useCallback(async () => {
    const serverUrl = `http://${serverIP}`;
    try {
      const [analyticsRes, energyRes] = await Promise.all([
        fetch(`${serverUrl}/api/analytics`),
        fetch(`${serverUrl}/api/energy`)
      ]);

      if (analyticsRes.ok && energyRes.ok) {
        const analyticsData = await analyticsRes.json();
        const energyInfo = await energyRes.json();
        
        // Ensure numeric values with defaults
        setAnalytics({
          peakHour: Number(analyticsData.peakHour) || 0,
          lowHour: Number(analyticsData.lowHour) || 0,
          averageDaily: Number(analyticsData.averageDaily) || 0,
          currentHourUsage: Number(analyticsData.currentHourUsage) || 0,
          efficiencyScore: Number(analyticsData.efficiencyScore) || 0,
          totalSavings: Number(analyticsData.totalSavings) || 0,
          optimizationCount: Number(analyticsData.optimizationCount) || 0,
          aiSuggestionsToday: Number(analyticsData.aiSuggestionsToday) || 0
        });
        
        setEnergyData({
          currentConsumption: Number(energyInfo.currentConsumption) || 0,
          dailyUsage: Number(energyInfo.dailyUsage) || 0,
          hourlyUsage: Array.isArray(energyInfo.hourlyUsage) ? energyInfo.hourlyUsage : Array(24).fill(0),
          totalSavings: Number(energyInfo.totalSavings) || 0,
          usageHistory: Array.isArray(energyInfo.usageHistory) ? energyInfo.usageHistory : [],
          aiSuggestions: Array.isArray(energyInfo.aiSuggestions) ? energyInfo.aiSuggestions : []
        });
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  }, [serverIP]);

  useEffect(() => {
    const interval = setInterval(fetchAnalytics, 5000); // Update every 5 seconds
    fetchAnalytics(); // Initial fetch
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  const getEfficiencyColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getEfficiencyBg = (score) => {
    if (score >= 80) return 'from-green-50 to-green-100 border-green-200';
    if (score >= 60) return 'from-yellow-50 to-yellow-100 border-yellow-200';
    return 'from-red-50 to-red-100 border-red-200';
  };

  const formatTime = (hour) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour} ${period}`;
  };

  const calculateMonthlySavings = () => {
    // Assuming average electricity cost of ₹6 per kWh in India
    const costPerKwh = 6;
    const totalSavings = parseFloat(analytics.totalSavings) || 0;
    const dailySavingsKwh = totalSavings / 1000; // Convert watts to kWh
    const monthlySavings = dailySavingsKwh * costPerKwh * 30;
    return monthlySavings.toFixed(2);
  };

  const getHourlyUsageChart = () => {
    const maxUsage = Math.max(...energyData.hourlyUsage);
    return energyData.hourlyUsage.map((usage, hour) => ({
      hour,
      usage,
      percentage: maxUsage > 0 ? (usage / maxUsage) * 100 : 0,
      isCurrentHour: hour === new Date().getHours()
    }));
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 border border-gray-100 mb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
            <span className="mr-3 text-3xl">📊</span>
            Energy Analytics Dashboard
          </h3>
          <p className="text-gray-600">Real-time energy consumption insights and savings tracking</p>
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-2 rounded-full border border-blue-200">
          <span className="text-blue-700 font-semibold">💡 Live Monitoring</span>
        </div>
      </div>

      {/* Current Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Current Consumption */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500 rounded-xl">
              <span className="text-white text-xl">⚡</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-600">
                {energyData.currentConsumption}W
              </div>
              <div className="text-purple-700 font-medium text-sm">Current Usage</div>
            </div>
          </div>
          <div className="text-xs text-purple-600">Real-time power consumption</div>
        </div>

        {/* Daily Usage */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500 rounded-xl">
              <span className="text-white text-xl">📈</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {(parseFloat(energyData.dailyUsage) || 0).toFixed(2)} kWh
              </div>
              <div className="text-blue-700 font-medium text-sm">Today's Usage</div>
            </div>
          </div>
          <div className="text-xs text-blue-600">Total energy consumed today</div>
        </div>

        {/* Efficiency Score */}
        <div className={`bg-gradient-to-br rounded-2xl p-6 border ${getEfficiencyBg(analytics.efficiencyScore)}`}>
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl ${analytics.efficiencyScore >= 80 ? 'bg-green-500' : analytics.efficiencyScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}>
              <span className="text-white text-xl">
                {analytics.efficiencyScore >= 80 ? '🌟' : analytics.efficiencyScore >= 60 ? '⚖️' : '⚠️'}
              </span>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${getEfficiencyColor(analytics.efficiencyScore)}`}>
                {analytics.efficiencyScore}%
              </div>
              <div className={`font-medium text-sm ${getEfficiencyColor(analytics.efficiencyScore)}`}>Efficiency</div>
            </div>
          </div>
          <div className={`text-xs ${getEfficiencyColor(analytics.efficiencyScore)}`}>
            {analytics.efficiencyScore >= 80 ? 'Excellent efficiency!' : 
             analytics.efficiencyScore >= 60 ? 'Good efficiency' : 'Needs optimization'}
          </div>
        </div>

        {/* Total Savings */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500 rounded-xl">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                ₹{calculateMonthlySavings()}
              </div>
              <div className="text-green-700 font-medium text-sm">Monthly Savings</div>
            </div>
          </div>
          <div className="text-xs text-green-600">Estimated monthly bill reduction</div>
        </div>
      </div>

      {/* Hourly Usage Chart */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-semibold text-gray-900">24-Hour Usage Pattern</h4>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Usage (kWh)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Current Hour</span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <div className="grid grid-cols-12 gap-2 mb-4">
            {getHourlyUsageChart().map(({ hour, usage, percentage, isCurrentHour }) => (
              <div key={hour} className="flex flex-col items-center">
                <div className="w-full h-32 bg-gray-200 rounded-lg flex flex-col justify-end overflow-hidden relative">
                  <div 
                    className={`w-full rounded-lg transition-all duration-500 ${
                      isCurrentHour 
                        ? 'bg-gradient-to-t from-purple-400 to-purple-500 animate-pulse' 
                        : 'bg-gradient-to-t from-blue-400 to-blue-500'
                    }`}
                    style={{ height: `${percentage}%` }}
                    title={`${formatTime(hour)}: ${usage.toFixed(3)} kWh`}
                  ></div>
                  {isCurrentHour && (
                    <div className="absolute top-1 left-1/2 transform -translate-x-1/2">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                    </div>
                  )}
                </div>
                <div className={`text-xs mt-2 font-medium ${isCurrentHour ? 'text-purple-600' : 'text-gray-600'}`}>
                  {hour}
                </div>
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-gray-500">
            Hours (0 = Midnight, 12 = Noon, 23 = 11 PM)
          </div>
        </div>
      </div>

      {/* Usage Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Peak & Off-Peak Times */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 border border-orange-200">
          <h5 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">⏰</span>
            Usage Patterns
          </h5>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-500 rounded-lg">
                  <span className="text-white text-sm">🔥</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Peak Usage</p>
                  <p className="text-sm text-gray-600">{formatTime(analytics.peakHour)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-red-600">
                  {energyData.hourlyUsage[analytics.peakHour]?.toFixed(3) || '0'} kWh
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <span className="text-white text-sm">🌱</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Low Usage</p>
                  <p className="text-sm text-gray-600">{formatTime(analytics.lowHour)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">
                  {energyData.hourlyUsage[analytics.lowHour]?.toFixed(3) || '0'} kWh
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Optimization Stats */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200">
          <h5 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🤖</span>
            AI Optimization Impact
          </h5>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Total Power Saved</p>
                <p className="text-sm text-gray-600">Cumulative reduction</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-indigo-600">
                  {(Number(analytics.totalSavings) || 0).toFixed(1)} W
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Optimizations Today</p>
                <p className="text-sm text-gray-600">AI adjustments made</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-purple-600">
                  {analytics.optimizationCount}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Energy Saving Tips */}
      <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-6 border border-cyan-200">
        <h5 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">💡</span>
          Smart Energy Tips
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-start space-x-3">
              <span className="text-lg">🌅</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Morning (6-9 AM)</p>
                <p className="text-xs text-gray-600">Use 60-70% brightness, minimal fan speed</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-lg">☀️</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Daytime (9 AM-5 PM)</p>
                <p className="text-xs text-gray-600">Utilize natural light, reduce LED brightness</p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start space-x-3">
              <span className="text-lg">🌇</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Evening (5-9 PM)</p>
                <p className="text-xs text-gray-600">Gradual brightness increase, optimal fan speed</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-lg">🌙</span>
              <div>
                <p className="text-sm font-medium text-gray-900">Night (9 PM-6 AM)</p>
                <p className="text-xs text-gray-600">Dim lighting, low fan for comfortable sleep</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnergyAnalytics;