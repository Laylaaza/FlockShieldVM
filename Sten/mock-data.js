const MOCK_MODULES = {
  serverTime: "2026-11-16T13:32:08Z",
  modules: [
    { id: 1, zone: "A", battery: 76, lastContact: "2026-11-16T13:32:04Z", isActive: false },
    { id: 2, zone: "B", battery: 81, lastContact: "2026-11-16T13:32:03Z", isActive: false },
    { id: 3, zone: "C", battery: 64, lastContact: "2026-11-16T13:32:05Z", isActive: true },
    { id: 4, zone: "C", battery: 18, lastContact: "2026-11-16T13:32:04Z", isActive: true },
    { id: 5, zone: "D", battery: 52, lastContact: "2026-11-16T12:41:03Z", isActive: false },
    { id: 6, zone: "D", battery: 70, lastContact: "2026-11-16T13:32:05Z", isActive: false }
  ]
};

const MOCK_EVENTS = {
  events: [
    { id: 12, time: "2026-11-16T13:32:00Z", type: "deterrent_started", zone: "C", moduleIds: [3, 4], responseTimeMs: 2000 },
    { id: 11, time: "2026-11-16T13:31:58Z", type: "detection", zone: "C", moduleId: 3, confidence: 91, actionTaken: true },
    { id: 10, time: "2026-11-16T12:58:12Z", type: "detection", zone: "D", moduleId: 6, confidence: 54, actionTaken: false },
    { id: 9, time: "2026-11-16T12:41:03Z", type: "module_offline", zone: "D", moduleId: 5 },
    { id: 8, time: "2026-11-16T10:47:30Z", type: "deterrent_started", zone: "B", moduleIds: [2], responseTimeMs: 3000 },
    { id: 7, time: "2026-11-16T10:47:27Z", type: "detection", zone: "B", moduleId: 2, confidence: 88, actionTaken: true }
  ]
};