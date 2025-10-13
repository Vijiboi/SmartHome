import React, { useState, useEffect } from 'react';
import EnergyOptimizer from './EnergyOptimizer';
import EnergyAnalytics from './EnergyAnalytics';
import AIEnergyOptimizer from './AIEnergyOptimizer';
import AIChatbot from './AIChatbot';

function Dashboard() {
  const [devices, setDevices] = useState([
    { id: 1, name: 'Living Room Light', type: 'light', status: 'on', room: 'Living Room', brightness: 75 },
    { id: 2, name: 'Bedroom Light', type: 'light', status: 'off', room: 'Bedroom', brightness: 60 },
    { id: 4, name: 'Front Door Lock', type: 'lock', status: 'locked', room: 'Entrance' },
    { id: 6, name: 'Bedroom Fire Alarm', type: 'fire-alarm', status: 'normal', room: 'Bedroom', batteryLevel: 92 },
    { id: 7, name: 'Living Room Fire Alarm', type: 'fire-alarm', status: 'normal', room: 'Living Room', batteryLevel: 78 },
    { id: 8, name: 'Study Light', type: 'light', status: 'on', room: 'Study', brightness: 90 },
    { id: 9, name: 'Living Room Fan', type: 'fan', status: 'on', room: 'Living Room', speed: 2 },
  ]);

  // State variables for backend communication
  const [lightValue, setLightValue] = useState(0);
  const [fanValue, setFanValue] = useState(0);
  const [serverIP, setServerIP] = useState("localhost:3001");
  const [status, setStatus] = useState("Waiting for data...");
  const [sensorData, setSensorData] = useState({ gas: 0, ldr: 0, temp: 0 });
  const serverUrl = `http://${serverIP}`;

  const sendControl = (device, value) => {
    fetch(`${serverUrl}/api/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ [device]: value }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        console.log('Control command sent:', data);
        setStatus("Command sent successfully!");
      })
      .catch(error => {
        console.error('Error sending control command:', error);
        setStatus("Failed to send command. Check server IP and connection.");
      });
  };

  const fetchState = React.useCallback(() => {
    fetch(`${serverUrl}/api/state`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        // Update state with data from the server
        setLightValue(data.light);
        setFanValue(data.fan);
        setSensorData(data.sensors);
        setStatus("Data updated!");
  
        // Update the main 'devices' state with the new values from the backend
        setDevices(prevDevices => prevDevices.map(device => {
          if (device.type === 'light' && device.name === 'Living Room Light') {
            return {
              ...device,
              brightness: Math.round((data.light / 255) * 100),
              status: data.light > 0 ? 'on' : 'off'
            };
          }
          if (device.type === 'fan' && device.name === 'Living Room Fan') {
            const speed = data.fan > 0 ? (data.fan > 127 ? 2 : 1) : 0;
            return {
              ...device,
              speed: speed,
              status: data.fan > 0 ? 'on' : 'off'
            };
          }
          return device;
        }));
      })
      .catch(error => {
        console.error('Error fetching state:', error);
        setStatus("Failed to fetch data. Check server IP and connection.");
      });
  }, [serverUrl]);

  useEffect(() => {
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, [serverIP, fetchState]);

  // Function to apply AI suggestions to ESP32
  const applyAISuggestions = (lightValue, fanValue) => {
    sendControl('light', lightValue);
    sendControl('fan', fanValue);
  };

  const toggleDevice = (id) => {
    const device = devices.find(d => d.id === id);
    if (device.type === 'light' && device.name === 'Living Room Light') {
      sendControl('light', lightValue > 0 ? 0 : 255);
    } else if (device.type === 'fan' && device.name === 'Living Room Fan') {
      sendControl('fan', fanValue > 0 ? 0 : 255);
    } else {
      setDevices(prevDevices => prevDevices.map(d => {
        if (d.id === id) {
          if (d.type === 'light') {
            return { ...d, status: d.status === 'on' ? 'off' : 'on' };
          } else if (d.type === 'fan') {
            return { ...d, status: d.status === 'on' ? 'off' : 'on' };
          } else if (d.type === 'lock') {
            return { ...d, status: d.status === 'locked' ? 'unlocked' : 'locked' };
          } else if (d.type === 'fire-alarm') {
            const statuses = ['normal', 'testing', 'low-battery'];
            const currentIndex = statuses.indexOf(d.status);
            const nextStatus = statuses[(currentIndex + 1) % statuses.length];
            return { ...d, status: nextStatus };
          }
        }
        return d;
      }));
    }
  };

  const adjustBrightness = (id, brightness) => {
    if (id === 1) { // Assuming Living Room Light has id 1
      const espValue = Math.round((brightness / 100) * 255);
      sendControl('light', espValue);
    } else {
      setDevices(prevDevices => prevDevices.map(device => {
        if (device.id === id && device.type === 'light') {
          return { ...device, brightness: brightness, status: brightness > 0 ? 'on' : 'off' };
        }
        return device;
      }));
    }
  };

  const adjustFanSpeed = (id, speed) => {
    if (id === 9) { // Assuming Living Room Fan has id 9
      const espValue = Math.round((speed / 3) * 255);
      sendControl('fan', espValue);
    } else {
      setDevices(prevDevices => prevDevices.map(device => {
        if (device.id === id && device.type === 'fan') {
          return { ...device, speed: speed, status: speed > 0 ? 'on' : 'off' };
        }
        return device;
      }));
    }
  };

  const getDeviceIcon = (type, status, device = null) => {
    switch (type) {
      case 'light':
        if (status === 'off') return '🔅';
        if (device && device.brightness) {
          if (device.brightness > 80) return '💡';
          if (device.brightness > 50) return '💡';
          if (device.brightness > 20) return '💡';
          return '🔅';
        }
        return status === 'on' ? '💡' : '🔅';
      case 'fan': return status === 'on' ? '💨' : '🔄';
      case 'lock': return status === 'locked' ? '🔒' : '🔓';
      case 'fire-alarm':
        if (status === 'alarm') return '🚨';
        if (status === 'testing') return '🔧';
        if (status === 'low-battery') return '🔋';
        return '🛡️'; // normal status
      default: return '📱';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'on': return 'bg-green-50 text-green-700 border-green-200';
      case 'off': return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'locked': return 'bg-red-50 text-red-700 border-red-200';
      case 'unlocked': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'normal': return 'bg-green-50 text-green-700 border-green-200';
      case 'alarm': return 'bg-red-50 text-red-700 border-red-200 animate-pulse';
      case 'testing': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'low-battery': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Enhanced Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-40">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
          <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob animation-delay-6000"></div>
        </div>
      </div>
      
      {/* Enhanced Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20"></div>
      
      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-2 h-2 bg-white rounded-full opacity-60 animate-float"></div>
        <div className="absolute top-40 right-20 w-1 h-1 bg-purple-300 rounded-full opacity-80 animate-float-delayed"></div>
        <div className="absolute bottom-32 left-1/4 w-1.5 h-1.5 bg-yellow-300 rounded-full opacity-70 animate-float"></div>
        <div className="absolute top-60 right-1/3 w-1 h-1 bg-pink-300 rounded-full opacity-60 animate-float-delayed"></div>
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Enhanced Header Section with Gradient */}
        <div className="mb-16">
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-10 text-white shadow-2xl border border-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-purple-100 bg-clip-text text-transparent">
                  Smart Home Dashboard
                </h2>
                <p className="text-purple-100 text-xl font-medium">Control your connected devices with elegance</p>
              </div>
              <div className="hidden md:flex items-center space-x-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                  <div className="text-3xl">🏠</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50"></div>
                <span className="text-sm font-medium">All systems operational</span>
              </div>
              <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                <div className="text-sm opacity-90">
                  🕐 Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>
              <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                <span className="text-sm font-medium">
                  🌡️ {Math.floor(Math.random() * 5) + 20}°C
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Server IP Configuration Section */}
        <div className="mb-8">
          <label className="block text-md font-medium text-white mb-2">Server IP Address</label>
          <div className="flex items-center">
            <input
              type="text"
              value={serverIP}
              onChange={(e) => setServerIP(e.target.value)}
              className="flex-grow rounded-xl bg-white/10 border-white/20 text-white placeholder-gray-400 shadow-inner px-4 py-2 focus:ring-purple-400 focus:border-purple-400 transition-colors"
              placeholder="e.g., 192.168.1.100"
            />
            <button
              onClick={fetchState}
              className="ml-4 px-6 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-semibold shadow-md hover:from-purple-600 hover:to-indigo-600 transition duration-300"
            >
              Connect & Update
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-300">{status}</p>
        </div>

        {/* Gemini AI Energy Optimizer Section */}
        <AIEnergyOptimizer 
          sensorData={sensorData}
          onApplySuggestions={applyAISuggestions}
          serverIP={serverIP}
        />

        {/* Original AI Energy Optimizer Section */}
        <EnergyOptimizer 
          devices={devices}
          sensorData={sensorData}
          onApplySuggestions={applyAISuggestions}
          serverIP={serverIP}
        />

        {/* Energy Analytics Dashboard */}
        <EnergyAnalytics 
          serverIP={serverIP}
        />

        {/* Enhanced Device Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-20">
          {devices.map((device) => (
            <div
              key={device.id}
              className="group bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 hover:shadow-3xl transform hover:scale-105 transition-all duration-500 border border-white/20 hover:border-purple-200/50 relative overflow-hidden"
            >
              {/* Card glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
              
              {/* Device Header */}
              <div className="relative z-10 flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="text-5xl group-hover:scale-110 transition-transform duration-300 filter drop-shadow-lg">
                      {getDeviceIcon(device.type, device.status, device)}
                    </div>
                    {(device.status === 'on' || device.status === 'locked' || device.status === 'normal') && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-400/50"></div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                      {device.type.replace('-', ' ')}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <span
                    className={`px-4 py-2 rounded-full text-xs font-bold shadow-lg transition-all duration-300 ${getStatusColor(device.status)} border backdrop-blur-sm`}
                  >
                    {device.status}
                  </span>
                </div>
              </div>

              {/* Enhanced Device Info */}
              <div className="relative z-10 mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-purple-600 transition-colors duration-300">
                  {device.name}
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center text-gray-600 text-sm bg-gray-50 rounded-xl p-3">
                    <span className="mr-3 text-lg">📍</span>
                    <span className="font-semibold">{device.room}</span>
                  </div>

                  {device.type === 'light' && device.brightness !== undefined && (
                    <div className="space-y-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 border border-yellow-200">
                      <div className="flex items-center text-gray-700 text-sm">
                        <span className="mr-3 text-lg">💡</span>
                        <span className="font-semibold">Brightness: {device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness}%</span>
                        <div className="ml-auto">
                          <div className="w-20 h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                (device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness) > 60 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 shadow-lg shadow-yellow-400/30' :
                                (device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness) > 30 ? 'bg-gradient-to-r from-yellow-300 to-yellow-400' :
                                'bg-gradient-to-r from-gray-300 to-gray-400'
                              }`}
                              style={{ width: `${device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col space-y-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness}
                          onChange={(e) => adjustBrightness(device.id, parseInt(e.target.value))}
                          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-enhanced"
                          style={{
                            background: `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${(device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness)}%, #e5e7eb ${(device.id === 1 ? Math.round((lightValue / 255) * 100) : device.brightness)}%, #e5e7eb 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                          <span className="bg-gray-100 px-2 py-1 rounded">Off</span>
                          <span className="bg-yellow-100 px-2 py-1 rounded">Dim</span>
                          <span className="bg-yellow-200 px-2 py-1 rounded">Bright</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {device.type === 'fan' && device.speed !== undefined && (
                    <div className="p-4 bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border border-green-100 space-y-4 shadow-sm hover:shadow-md transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-teal-400 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                            💨
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Fan Speed</p>
                            <p className="text-sm text-gray-600">Level {device.id === 9 ? Math.round((fanValue / 255) * 3) : device.speed} of 3</p>
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          {[1, 2, 3].map((level) => (
                            <div
                              key={level}
                              className={`w-3 h-6 rounded-full transition-all duration-300 ${
                                level <= (device.id === 9 ? Math.round((fanValue / 255) * 3) : device.speed)
                                  ? 'bg-gradient-to-t from-green-400 to-teal-400 shadow-md transform scale-110'
                                  : 'bg-gray-200 hover:bg-gray-300'
                              }`}
                            ></div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="3"
                            value={device.id === 9 ? Math.round((fanValue / 255) * 3) : device.speed}
                            onChange={(e) => adjustFanSpeed(device.id, parseInt(e.target.value))}
                            className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer fan-slider shadow-inner"
                            style={{
                              background: `linear-gradient(to right, #10b981 0%, #14b8a6 ${((device.id === 9 ? Math.round((fanValue / 255) * 3) : device.speed) / 3) * 100}%, #e5e7eb ${((device.id === 9 ? Math.round((fanValue / 255) * 3) : device.speed) / 3) * 100}%, #e5e7eb 100%)`
                            }}
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <span>Off</span>
                            <span>Low</span>
                            <span>Med</span>
                            <span>High</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {device.type === 'fire-alarm' && device.batteryLevel && (
                    <div className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl border border-orange-100 shadow-sm hover:shadow-md transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                            🔋
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Battery Level</p>
                            <p className="text-sm text-gray-600">{device.batteryLevel}% remaining</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="w-20 h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                device.batteryLevel > 50 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                                device.batteryLevel > 20 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                                'bg-gradient-to-r from-red-400 to-red-600'
                              }`}
                              style={{ width: `${device.batteryLevel}%` }}
                            ></div>
                          </div>
                          <p className={`text-xs mt-1 font-medium ${
                            device.batteryLevel > 50 ? 'text-green-600' :
                            device.batteryLevel > 20 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {device.batteryLevel > 50 ? 'Good' : device.batteryLevel > 20 ? 'Low' : 'Critical'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced Control Button */}
              <button
                onClick={() => toggleDevice(device.id)}
                className={`w-full py-4 px-6 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-opacity-50 ${
                  device.status === 'on' || device.status === 'locked' || device.status === 'normal'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-200 focus:ring-blue-300'
                    : device.status === 'alarm'
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-200 animate-pulse focus:ring-red-300'
                    : 'bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 shadow-gray-200 focus:ring-gray-300'
                }`}
              >
                <span className="flex items-center justify-center space-x-3">
                  <span className="text-lg">
                    {device.type === 'lock'
                      ? (device.status === 'locked' ? '🔓' : '🔒')
                      : device.type === 'fire-alarm'
                      ? (device.status === 'normal' ? '🔧' :
                         device.status === 'testing' ? '🔋' :
                         device.status === 'low-battery' ? '🛡️' : '🚨')
                      : (device.status === 'on' ? '⏹️' : '▶️')
                    }
                  </span>
                  <span className="font-medium">
                    {device.type === 'lock'
                      ? (device.status === 'locked' ? 'Unlock Door' : 'Lock Door')
                      : device.type === 'fire-alarm'
                      ? (device.status === 'normal' ? 'Test Alarm' :
                         device.status === 'testing' ? 'Check Battery' :
                         device.status === 'low-battery' ? 'Reset Alarm' : 'Silence Alarm')
                      : (device.status === 'on' ? 'Turn Off' : 'Turn On')
                    }
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Enhanced Statistics Section */}
        <div className="mt-16">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-gray-900">Smart Home Analytics</h3>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Live data</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Active Devices */}
              <div className="relative group">
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border border-green-200 group-hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-500 rounded-xl">
                      <span className="text-white text-xl">⚡</span>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-green-600">
                        {devices.filter(d => d.status === 'on').length}
                      </div>
                      <div className="text-green-700 font-medium">Active</div>
                    </div>
                  </div>
                  <div className="text-sm text-green-600 font-medium">Devices Running</div>
                  <div className="mt-2 w-full bg-green-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(devices.filter(d => d.status === 'on').length / devices.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Inactive Devices */}
              <div className="relative group">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200 group-hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gray-500 rounded-xl">
                      <span className="text-white text-xl">⏸️</span>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-600">
                        {devices.filter(d => d.status === 'off').length}
                      </div>
                      <div className="text-gray-700 font-medium">Inactive</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Devices Off</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gray-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(devices.filter(d => d.status === 'off').length / devices.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Security Status */}
              <div className="relative group">
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-6 border border-red-200 group-hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-red-500 rounded-xl">
                      <span className="text-white text-xl">🔒</span>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-red-600">
                        {devices.filter(d => d.status === 'locked').length}
                      </div>
                      <div className="text-red-700 font-medium">Secured</div>
                    </div>
                  </div>
                  <div className="text-sm text-red-600 font-medium">Security Devices</div>
                  <div className="mt-2 w-full bg-red-200 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(devices.filter(d => d.status === 'locked').length / devices.filter(d => d.type === 'lock').length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Total Devices */}
              <div className="relative group">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200 group-hover:shadow-lg transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-500 rounded-xl">
                      <span className="text-white text-xl">🏠</span>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-blue-600">
                        {devices.length}
                      </div>
                      <div className="text-blue-700 font-medium">Total</div>
                    </div>
                  </div>
                  <div className="text-sm text-blue-600 font-medium">Connected Devices</div>
                  <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full w-full transition-all duration-500"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Energy Usage Simulation */}
            <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-bold text-gray-900">Energy Usage Today</h4>
                <span className="text-sm text-gray-500">Last 24 hours</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Energy consumption</span>
                    <span>
                      {devices.filter(d => d.status === 'on').length * 0.5 +
                        devices.filter(d => d.type === 'ac' && d.status === 'on').length * 2.5} kWh
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-purple-400 to-pink-400 h-3 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((devices.filter(d => d.status === 'on').length / devices.length) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-2xl">
                  {devices.filter(d => d.status === 'on').length > 2 ? '⚡' : '🌱'}
                </div>
              </div>
            </div>
            {/* Sensor Data Section */}
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Sensor Readings</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Temperature */}
                <div className="flex flex-col items-center bg-gray-50 p-4 rounded-xl shadow-inner">
                  <span role="img" aria-label="thermometer" className="text-4xl mb-2">🌡️</span>
                  <p className="text-2xl font-bold">{sensorData.temp.toFixed(1)}°C</p>
                  <p className="text-sm text-gray-500">Temperature</p>
                </div>
                {/* LDR */}
                <div className="flex flex-col items-center bg-gray-50 p-4 rounded-xl shadow-inner">
                  <span role="img" aria-label="sun" className="text-4xl mb-2">☀️</span>
                  <p className="text-2xl font-bold">{sensorData.ldr}</p>
                  <p className="text-sm text-gray-500">Light (LDR)</p>
                </div>
                {/* Gas */}
                <div className="flex flex-col items-center bg-gray-50 p-4 rounded-xl shadow-inner">
                  <span role="img" aria-label="warning" className="text-4xl mb-2">🚨</span>
                  <p className="text-2xl font-bold">{sensorData.gas}</p>
                  <p className="text-sm text-gray-500">Gas Level</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Chatbot */}
      <AIChatbot serverIP={serverIP} />
    </div>
  );
}

export default Dashboard;