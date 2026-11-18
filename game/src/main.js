// Solmara boot and the one loop: input every frame, the world in fixed
// steps, the renderer painting what is there. Screens: title, playing,
// paused, busted, wasted. The recording's transcripts are this session's
// work: every line here was written in it.
(function () {
  'use strict';

  var G = window.SOLMARA;

  // ---- Renderer, scene, camera ----------------------------------------------
  var canvas = document.getElementById('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: G.PARAMS.noaa !== '1' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 4, -10);
  G.camera = camera; // exposed for the Playwright test driver

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Systems ---------------------------------------------------------------
  G.audio = new G.SoundFX();
  G.buildCity(scene);
  G.peds = new G.Pedestrians(scene);
  G.traffic = new G.Traffic(scene);
  G.police = new G.Police(scene);
  G.player = new G.Player(scene);
  G.missions = new G.Missions(scene);
  G.hud = new G.HUD();
  G.playerCar = null;
  G.state = 'title';

  // Cross-system hooks the other modules call.
  G.damagePlayer = function (amount, source) { G.player.damage(amount, source); };
  G.onPoliceContact = function (dt) { G.player.policeContact(dt); };
  G.tracer = function (x1, y1, z1, x2, y2, z2, color) {
    G.player.tracer(x1, y1, z1, x2, y2, z2, color);
  };

  // ---- Input -----------------------------------------------------------------
  var keys = {};
  var input = {
    forward: false, back: false, left: false, right: false, run: false,
    jumpPressed: false, ePressed: false, eHeld: false, punchPressed: false,
    shootPressed: false, mouseDown: false, dragDX: 0, dragDY: 0,
  };
  var dragging = false, lastMX = 0, lastMY = 0;
  G.input = input; // test hook: lets Playwright read held keys

  function keyDown(e) {
    if (e.repeat) return;
    G.audio.resume();
    keys[e.code] = true;
    if (e.code === 'Space') { input.jumpPressed = true; e.preventDefault(); }
    if (e.code === 'KeyE') { input.ePressed = true; input.eHeld = true; }
    if (e.code === 'KeyF') input.punchPressed = true;
    if (e.code === 'KeyM') G.audio.setMuted(!G.audio.muted);
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  }
  function keyUp(e) {
    keys[e.code] = false;
    if (e.code === 'KeyE') input.eHeld = false;
  }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousedown', function (e) {
    G.audio.resume();
    if (G.state !== 'playing') return;
    if (e.button === 0) {
      input.mouseDown = true;
      input.shootPressed = true;
      dragging = true;
      lastMX = e.clientX; lastMY = e.clientY;
    }
  });
  window.addEventListener('mouseup', function () {
    input.mouseDown = false;
    dragging = false;
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    input.dragDX += e.clientX - lastMX;
    input.dragDY += e.clientY - lastMY;
    lastMX = e.clientX; lastMY = e.clientY;
  });
  // Touch: one finger drag orbits, a second-finger tap shoots. Kept minimal.
  canvas.addEventListener('touchstart', function (e) {
    if (G.state !== 'playing') return;
    var t = e.touches[0];
    dragging = true; lastMX = t.clientX; lastMY = t.clientY;
    if (e.touches.length > 1) input.shootPressed = true;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var t = e.touches[0];
    input.dragDX += t.clientX - lastMX;
    input.dragDY += t.clientY - lastMY;
    lastMX = t.clientX; lastMY = t.clientY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function () { dragging = false; });

  function readKeys() {
    input.forward = !!(keys['KeyW'] || keys['ArrowUp']);
    input.back = !!(keys['KeyS'] || keys['ArrowDown']);
    input.left = !!(keys['KeyA'] || keys['ArrowLeft']);
    input.right = !!(keys['KeyD'] || keys['ArrowRight']);
    input.run = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  }

  function clearEdges() {
    input.jumpPressed = false;
    input.ePressed = false;
    input.punchPressed = false;
    input.shootPressed = false;
    input.dragDX = 0;
    input.dragDY = 0;
  }

  // ---- Save / load -------------------------------------------------------------
  function readSave() {
    try {
      var raw = window.localStorage.getItem(G.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  G.saveGame = function () {
    try {
      window.localStorage.setItem(G.SAVE_KEY, JSON.stringify({
        money: Math.floor(G.player.money),
        health: Math.floor(G.player.health),
        mission: G.missions.index,
        x: G.player.x, z: G.player.z,
        wanted: G.player.wanted,
      }));
    } catch (e) { /* storage can be off: the save then lasts this visit only */ }
  };

  // ---- State changes -----------------------------------------------------------
  function applyParams() {
    var q = G.PARAMS;
    if (q.pos) {
      var parts = q.pos.split(',');
      var x = parseFloat(parts[0]), z = parseFloat(parts[1]);
      if (isFinite(x) && isFinite(z)) G.player.spawnAt(x, z);
    }
    if (q.money) {
      var m = parseFloat(q.money);
      if (isFinite(m)) G.player.money = m;
    }
    if (q.wanted) {
      var w = parseInt(q.wanted, 10);
      if (isFinite(w)) G.player.setWanted(w);
    }
    if (q.incar === '1') {
      var spot = G.traffic.nearestCar(G.player.x, G.player.z, 60, ['parked', 'traffic']);
      if (spot) {
        G.player.x = spot.x; G.player.z = spot.z;
        G.player.enterCar({ car: spot, kind: spot.kind });
      }
    }
  }

  G.startGame = function (fromSave) {
    G.audio.init();
    G.audio.resume();
    var save = fromSave ? readSave() : null;
    var missionIndex = 0;
    if (save) {
      G.player.money = save.money || G.START_MONEY;
      G.player.health = save.health || G.TUNE.playerHealth;
      G.player.spawnAt(save.x || 0, save.z || -20);
      G.player.setWanted(save.wanted || 0);
      missionIndex = Math.min(save.mission || 0, G.MISSIONS.length - 1);
    } else {
      G.player.money = G.START_MONEY;
      G.player.health = G.TUNE.playerHealth;
      G.player.spawnAt(0, -20);
      G.player.setWanted(0);
    }
    if (G.PARAMS.mission !== undefined) {
      var mi = parseInt(G.PARAMS.mission, 10);
      if (isFinite(mi)) missionIndex = Math.max(0, Math.min(G.MISSIONS.length - 1, mi));
    }
    G.hud.hideTitle();
    G.hud.hideEnd();
    G.state = 'playing';
    applyParams();
    G.hud.setMoney(G.player.money);
    G.hud.setHealth(G.player.health);
    G.hud.setStars(G.player.wanted);
    G.missions.start(missionIndex);
    G.log('[solmara] started, mission', missionIndex);
  };

  function togglePause() {
    if (G.state === 'playing') {
      G.state = 'paused';
      G.hud.showPause(true);
    } else if (G.state === 'paused') {
      G.resumeGame();
    }
  }

  G.resumeGame = function () {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    G.hud.showPause(false);
  };

  G.restartMission = function () {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    G.hud.showPause(false);
    G.player.health = G.TUNE.playerHealth;
    G.player.setWanted(0);
    G.missions.start(G.missions.index);
  };

  function endRun(kind, respawnPlace) {
    G.state = kind;
    G.audio.busted();
    G.hud.showEnd(kind);
    G.endTimer = 4;
    G.endRespawn = respawnPlace;
  }

  G.onBusted = function () {
    if (G.state !== 'playing') return;
    G.player.money = Math.floor(G.player.money * (1 - G.TUNE.bustFine));
    endRun('busted', G.PLACES.policeHQ);
  };

  G.onWasted = function () {
    if (G.state !== 'playing') return;
    G.player.money = Math.floor(G.player.money * (1 - G.TUNE.bustFine));
    endRun('wasted', G.PLACES.hospital);
  };

  G.respawnAfterEnd = function () {
    if (G.state !== 'busted' && G.state !== 'wasted') return;
    var at = G.endRespawn || G.PLACES.hospital;
    if (G.player.inCar) G.player.exitCar();
    G.player.spawnAt(at.x, at.z);
    G.player.health = G.TUNE.playerHealth;
    G.player.setWanted(0);
    G.player.bustTimer = 0;
    G.hud.hideEnd();
    G.hud.setMoney(G.player.money);
    G.hud.setHealth(G.player.health);
    G.state = 'playing';
  };

  // ---- Contextual hint ---------------------------------------------------------
  function updateHint() {
    var h = '';
    if (G.state === 'playing') {
      if (G.player.inCar) h = 'E exit car · W/S drive · A/D steer';
      else {
        var entry = G.player.nearestEnterable();
        if (entry) h = entry.kind === 'traffic' ? 'E steal car (wanted +1)' : 'E enter car';
        else if (G.missions.currentStep() && G.missions.currentStep().kind === 'grab') h = 'Hold E — grab the cash';
        else h = 'WASD move · Shift run · Space jump · F punch · Click shoot';
      }
    }
    G.hud.setHint(h);
  }

  // ---- Main loop ----------------------------------------------------------------
  var last = performance.now();
  var lastHealth = -1, lastMoney = -1, lastSpeed = -1;
  var frames = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    readKeys();

    if (G.state === 'playing') {
      G.player.update(dt, input, camera);
      var allCars = G.traffic.list.concat(G.police.list);
      if (G.playerCar) allCars.push(G.playerCar);
      G.traffic.update(dt, allCars);
      resolveCarCollisions(allCars);
      G.police.update(dt, G.player.wanted, G.player);
      G.peds.update(dt, G.player.x, G.player.z, G.player.wanted);
      G.missions.update(dt, input);
      G.audio.siren(dt, G.police.nearestDistance(G.player.x, G.player.z), G.player.wanted);
      G.audio.music();
      // HUD numbers, only when they changed.
      if (Math.floor(G.player.health) !== lastHealth) {
        lastHealth = Math.floor(G.player.health);
        G.hud.setHealth(G.player.health);
      }
      if (Math.floor(G.player.money) !== lastMoney) {
        lastMoney = Math.floor(G.player.money);
        G.hud.setMoney(G.player.money);
      }
      var kph = G.player.inCar && G.player.car ? Math.abs(G.player.car.speed) * 3.6 : 0;
      if (Math.round(kph) !== lastSpeed) {
        lastSpeed = Math.round(kph);
        G.hud.setSpeed(kph, G.player.inCar);
      }
      updateHint();
      G.hud.update(dt);
    } else if (G.state === 'busted' || G.state === 'wasted') {
      G.endTimer -= dt;
      if (G.endTimer <= 0) G.respawnAfterEnd();
    }

    clearEdges();
    renderer.render(scene, camera);
    frames++;
    if (frames === 5) {
      window.__solmaraReady = true;
      G.log('[solmara] ready, state', G.state);
    }
  }

  // Push overlapping cars apart; a hard hit costs the player health.
  function resolveCarCollisions(allCars) {
    for (var i = 0; i < allCars.length; i++) {
      for (var j = i + 1; j < allCars.length; j++) {
        var a = allCars[i], b = allCars[j];
        var dx = b.x - a.x, dz = b.z - a.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < 10.2 && d2 > 0.0001) {
          var d = Math.sqrt(d2);
          var push = (3.2 - d) / 2;
          var nx = dx / d, nz = dz / d;
          if (a.kind !== 'parked') { a.x -= nx * push; a.z -= nz * push; }
          if (b.kind !== 'parked') { b.x += nx * push; b.z += nz * push; }
          var rel = Math.abs(a.speed - b.speed);
          if (rel > 6) {
            G.audio.crash();
            if ((a.kind === 'player' || b.kind === 'player') && G.player.inCar) {
              G.damagePlayer(3, 'crash');
            }
            a.speed *= 0.6; b.speed *= 0.6;
          }
        }
      }
    }
    // The player's car against pedestrians: a hit knocks the ped down.
    if (G.player.inCar && G.player.car && Math.abs(G.player.car.speed) > 3) {
      var p = G.peds.nearest(G.player.car.x, G.player.car.z, 2.2);
      if (p) {
        G.peds.knockDown(p, G.player.car.x, G.player.car.z);
        G.player.addWanted(1);
        G.audio.crash();
        if (G.hud) G.hud.say('Mara: You just ran someone over. The cops heard that.');
      }
    }
  }

  // ---- Title screen ---------------------------------------------------------------
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.state === 'playing') togglePause();
  });

  G.hud.showTitle(!!readSave());
  G.hud.setMoney(G.player.money);
  G.hud.setHealth(G.player.health);
  G.hud.setStars(0);
  G.hud.setObjective('Press Start to begin Rook\'s story.');
  if (G.PARAMS.autostart === '1') {
    G.startGame(false);
  }
  requestAnimationFrame(frame);

  // Test hook: the Playwright driver reads this to assert on the live game.
  window.__solmara = {
    G: G,
    state: function () { return G.state; },
    player: function () {
      return {
        x: G.player.x, z: G.player.z, health: G.player.health,
        money: G.player.money, wanted: G.player.wanted,
        inCar: G.player.inCar, mission: G.missions.index,
        step: G.missions.step, done: G.missions.done,
      };
    },
  };
})();
