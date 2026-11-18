// Solmara configuration: the city layout, tuning and the mission chain.
// Every number the game runs on lives here so the systems stay consistent.
(function () {
  'use strict';

  var G = window.SOLMARA = window.SOLMARA || {};

  // ---- World layout -------------------------------------------------------
  // Roads run on a grid every BLOCK units; the city is a square of blocks.
  G.BLOCK = 40;               // distance between road centrelines
  G.ROAD_W = 14;              // asphalt width
  G.HALF = 180;               // city extends -HALF..HALF on x and z
  G.BEACH_Z = 150;            // sand starts here (south edge)
  G.WATER_Z = 186;            // water plane starts here
  G.ROAD_LINES = [-160, -120, -80, -40, 0, 40, 80, 120, 160];

  // Named places the missions and the minimap use. All sit beside a road.
  G.PLACES = {
    hideout:   { x: -160, z: -160, name: "Rook's Hideout" },
    marina:    { x: 140,  z: 160,  name: 'Marina Garage' },
    oldtown:   { x: -140, z: 120,  name: 'Old Town Market' },
    tower:     { x: 20,   z: -20,  name: 'Solmara Tower' },
    bank:      { x: 80,   z: 40,   name: 'Bay Bank' },
    hospital:  { x: -120, z: -40,  name: 'Solmara General' },
    policeHQ:  { x: 120,  z: -120, name: 'Solmara PD HQ' },
    park:      { x: -60,  z: 60,   name: 'Palm Park' },
    beach:     { x: 0,    z: 165,  name: 'Solmara Beach' },
  };

  G.DISTRICTS = [
    { name: 'DOWNTOWN', x0: -60, z0: -60, x1: 60, z1: 60 },
    { name: 'OLD TOWN', x0: -180, z0: 80, x1: -80, z1: 180 },
    { name: 'MARINA', x0: 80, z0: 120, x1: 180, z1: 180 },
    { name: 'NORTHSIDE', x0: -180, z0: -180, x1: 180, z1: -80 },
    { name: 'BAYVIEW', x0: 80, z0: -60, x1: 180, z1: 120 },
  ];

  // ---- Player tuning ------------------------------------------------------
  G.TUNE = {
    walkSpeed: 5.2,
    runSpeed: 8.6,
    jumpSpeed: 7.5,
    gravity: 22,
    playerRadius: 0.55,
    playerHealth: 100,
    carAccel: 16,
    carBrake: 30,
    carMaxSpeed: 27,
    carMaxReverse: 9,
    carTurn: 1.9,
    carRadius: 1.6,
    trafficSpeed: 11,
    trafficCount: 14,
    pedCount: 20,
    parkedCount: 8,
    punchDamage: 22,
    gunDamage: 34,
    gunRange: 70,
    gunCooldown: 0.28,
    copShotDamage: 6,
    copShotRange: 45,
    wantedDecaySeconds: 26,
    bustHoldSeconds: 2.0,
    bustFine: 0.2,
  };

  // ---- Colours ------------------------------------------------------------
  G.PALETTE = {
    sky: 0x8ec9ee,
    sun: 0xfff2cf,
    ground: 0x9aa578,
    asphalt: 0x2e3138,
    sidewalk: 0xb9b3a4,
    sand: 0xe8d49a,
    water: 0x2e7fa8,
    building: [0xd8c9b0, 0xc9b8a3, 0xb7c4cc, 0xd9a986, 0xa8b8c4, 0xe0d6c2, 0x9fb4c0, 0xcfa08e],
    glass: [0x6fa8c8, 0x87b8d4, 0x5e93b5],
    car: [0xc0392b, 0x2e6fb0, 0xe6b800, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1c1c1e, 0x7f8c8d, 0xd35400],
    shirt: [0xdd5544, 0x4488dd, 0x44aa66, 0xddaa22, 0x8844aa, 0xdddddd, 0x222222, 0xcc88aa],
    skin: [0xe8b98a, 0xc98d5f, 0x8a5a35, 0xf0c8a0],
  };

  // ---- Story: the mission chain -------------------------------------------
  // Mara is the fixer who calls Rook (the player) with work.
  G.MISSIONS = [
    {
      id: 'first-wheels',
      title: 'First Wheels',
      brief: 'Mara: Rook, you need wheels before anything else. Take any car and bring it to the Marina Garage.',
      steps: [
        { kind: 'enter-car', text: 'Get in a car (walk up and press E)' },
        { kind: 'goto', place: 'marina', text: 'Drive to the Marina Garage' },
      ],
      reward: 150,
      done: 'Mara: Not bad. The car is yours now. Next job pays better.',
    },
    {
      id: 'the-package',
      title: 'The Package',
      brief: 'Mara: Pick up the package at the Old Town Market, then get it to Solmara Tower. Fast. The buyer hates waiting.',
      steps: [
        { kind: 'goto', place: 'oldtown', text: 'Pick up the package at Old Town Market' },
        { kind: 'timed-goto', place: 'tower', seconds: 90, text: 'Deliver to Solmara Tower before time runs out' },
      ],
      reward: 250,
      done: 'Mara: Delivered. The buyer sends his regards, and his money.',
    },
    {
      id: 'heat-wave',
      title: 'Heat Wave',
      brief: 'Mara: It was a setup, Rook. The cops are on you. Lose them, or get back to the hideout in one piece.',
      steps: [
        { kind: 'lose-heat', place: 'hideout', text: 'Lose the cops (wanted to zero) or reach the Hideout' },
      ],
      reward: 300,
      startWanted: 2,
      done: 'Mara: Clean. Whoever set you up will hear about this.',
    },
    {
      id: 'the-score',
      title: 'The Solmara Score',
      brief: 'Mara: One last job. Bay Bank, vault cash, in and out. The whole force will be on you — make the hideout and we are done.',
      steps: [
        { kind: 'goto', place: 'bank', text: 'Get to Bay Bank' },
        { kind: 'grab', place: 'bank', seconds: 3, text: 'Hold E at the bank door to grab the cash' },
        { kind: 'escape', place: 'hideout', text: 'Escape to the Hideout with the cash' },
      ],
      reward: 600,
      grabWanted: 3,
      done: 'Mara: Six hundred thousand in small bills. Solmara is ours, Rook.',
    },
  ];

  G.START_MONEY = 50;
  G.SAVE_KEY = 'solmara-save-v1';

  // ---- Dev hooks (used by the Playwright tests; harmless in play) --------
  // ?autostart=1 skips the title screen, ?mission=N jumps to a mission,
  // ?wanted=N sets the wanted level, ?incar=1 starts the player in a car,
  // ?pos=x,z teleports the player. Read once at boot.
  G.PARAMS = {};
  try {
    var q = new URLSearchParams(window.location.search || '');
    ['autostart', 'mission', 'wanted', 'incar', 'money', 'pos', 'noaa'].forEach(function (k) {
      if (q.has(k)) G.PARAMS[k] = q.get(k);
    });
  } catch (e) { /* file:// or old browser: no params */ }

  G.log = function () {
    if (window.console && console.log) console.log.apply(console, arguments);
  };
})();
