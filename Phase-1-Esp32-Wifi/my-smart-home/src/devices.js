export const floors = [
  {
    id: 1,
    name: "Ground Floor",
    devices: [
      { id: 'g-l1', name: "Living Room Light", type: "light", state: { isOn: false } },
      { id: 'g-f1', name: "Living Room Fan", type: "fan", state: { isOn: true, speed: 3 } },
      { id: 'g-t1', name: "Main Thermostat", type: "thermostat", state: { temperature: 22 } },
      { id: 'g-s1', name: "Smart Speaker", type: "speaker", state: { isOn: true, volume: 40 } },
    ]
  },
  {
    id: 2,
    name: "First Floor",
    devices: [
      { id: 'f-l1', name: "Bedroom Light", type: "light", state: { isOn: true } },
      { id: 'f-ac1', name: "Bedroom AC", type: "thermostat", state: { temperature: 24 } },
      { id: 'f-l2', name: "Study Light", type: "light", state: { isOn: false } },
    ]
  }
];