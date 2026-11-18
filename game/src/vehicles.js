// Solmara vehicles: the car factory, arcade driving physics, the traffic
// that fills the roads and the police that chase the player.
(function () {
  'use strict';

  var G = window.SOLMARA;

  // ---- Car mesh ------------------------------------------------------------
  // Forward is local +z. A car is a body, a dark cabin, four spinning wheels,
  // headlights and brake lights; police add a flashing light bar.
  function makeCarMesh(color, kind) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
    var tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
    body.position.y = 0.62;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.1), glassMat);
    cabin.position.set(0, 1.28, -0.25);
    g.add(body, cabin);
    var wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    var wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, tyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.38, p[1]);
      g.add(w);
      wheels.push(w);
    });
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
    [-0.6, 0.6].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
      h.position.set(x, 0.66, 2.22);
      g.add(h);
    });
    var brakeMat = new THREE.MeshBasicMaterial({ color: 0x881111 });
    var brakes = [];
    [-0.6, 0.6].forEach(function (x) {
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), brakeMat);
      b.position.set(x, 0.66, -2.22);
      g.add(b);
      brakes.push(b);
    });
    var lightBar = null;
    if (kind === 'police') {
      lightBar = {
        red: new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 })),
        blue: new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff })),
      };
      lightBar.red.position.set(-0.35, 1.66, -0.25);
      lightBar.blue.position.set(0.35, 1.66, -0.25);
      g.add(lightBar.red, lightBar.blue);
    }
    return { group: g, wheels: wheels, brakes: brakes, brakeMat: brakeMat, lightBar: lightBar };
  }

  function makeCar(kind, color, x, z, yaw) {
    var mesh = makeCarMesh(color, kind);
    mesh.group.position.set(x, 0, z);
    mesh.group.rotation.y = yaw;
    return {
      kind: kind, mesh: mesh, x: x, z: z, yaw: yaw, speed: 0,
      axis: 'x', line: 0, dir: 1, turnCooldown: 0, shotTimer: 0,
      brake: false, flash: 0,
    };
  }

  function carForward(c) {
    return { x: Math.sin(c.yaw), z: Math.cos(c.yaw) };
  }

  function syncCarMesh(c) {
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.yaw;
    var spin = c.speed * 0.09;
    c.mesh.wheels.forEach(function (w) { w.rotation.x += spin; });
    c.mesh.brakeMat.color.setHex(c.brake ? 0xff2222 : 0x881111);
    if (c.mesh.lightBar) {
      c.flash += 0.35;
      var on = Math.floor(c.flash) % 2 === 0;
      c.mesh.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x551111);
      c.mesh.lightBar.blue.material.color.setHex(on ? 0x2222aa : 0x2244ff);
    }
  }

  // ---- Player driving: arcade physics with building collision --------------
  function drivePlayerCar(c, input, dt) {
    var fwd = input.forward ? 1 : 0, back = input.back ? 1 : 0;
    var steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (fwd) c.speed += G.TUNE.carAccel * dt;
    if (back) {
      if (c.speed > 0.5) c.speed -= G.TUNE.carBrake * dt;
      else c.speed -= G.TUNE.carAccel * 0.55 * dt;
    }
    if (!fwd && !back) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 8 * dt);
    c.speed = Math.max(-G.TUNE.carMaxReverse, Math.min(G.TUNE.carMaxSpeed, c.speed));
    c.brake = back && c.speed > 0.5;
    var turnAuthority = Math.min(1, Math.abs(c.speed) / 6);
    c.yaw += steer * G.TUNE.carTurn * turnAuthority * dt * Math.sign(c.speed || 1);
    var f = carForward(c);
    var nx = c.x + f.x * c.speed * dt;
    var nz = c.z + f.z * c.speed * dt;
    var hit = G.collideCircle(nx, nz, G.TUNE.carRadius);
    if (hit) {
      if (Math.abs(c.speed) > 8) G.audio.crash();
      c.speed *= 0.4;
      nx = hit.x; nz = hit.z;
    }
    nx = Math.max(-178, Math.min(178, nx));
    nz = Math.max(-178, Math.min(178, nz));
    c.x = nx; c.z = nz;
    syncCarMesh(c);
    return { moving: Math.abs(c.speed) > 0.5, throttle: fwd ? 1 : 0 };
  }

  // ---- Traffic -------------------------------------------------------------
  function Traffic(scene) {
    this.list = [];
    this.scene = scene;
    for (var i = 0; i < G.TUNE.trafficCount; i++) this.spawn(false);
    G.world.parkedSpots.forEach(function (s) {
      var color = G.PALETTE.car[Math.floor(Math.random() * G.PALETTE.car.length)];
      var c = makeCar('parked', color, s.x, s.z, s.yaw);
      scene.add(c.mesh.group);
      this.list.push(c);
    }, this);
  }

  Traffic.prototype.randomRoadCar = function () {
    var lines = G.ROAD_LINES;
    var axis = Math.random() < 0.5 ? 'x' : 'z';
    var line = lines[Math.floor(Math.random() * lines.length)];
    var along = -170 + Math.random() * 340;
    var dir = Math.random() < 0.5 ? 1 : -1;
    var color = G.PALETTE.car[Math.floor(Math.random() * G.PALETTE.car.length)];
    var c = makeCar('traffic', color, 0, 0, 0);
    c.axis = axis; c.line = line; c.dir = dir;
    c.speed = G.TUNE.trafficSpeed * (0.85 + Math.random() * 0.3);
    if (axis === 'x') { c.x = along; c.z = line + (dir > 0 ? 3.2 : -3.2); c.yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.z = along; c.x = line + (dir > 0 ? -3.2 : 3.2); c.yaw = dir > 0 ? 0 : Math.PI; }
    return c;
  };

  Traffic.prototype.spawn = function (nearPlayer) {
    var c = this.randomRoadCar();
    this.scene.add(c.mesh.group);
    this.list.push(c);
    return c;
  };

  Traffic.prototype.carAhead = function (c, all) {
    // Is there a car in my lane within 10 units ahead of me?
    var ahead = 10;
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (o === c || o.kind === 'parked') continue;
      if (o.axis !== c.axis || o.line !== c.line || o.dir !== c.dir) continue;
      var along = c.axis === 'x' ? (o.x - c.x) * c.dir : (o.z - c.z) * c.dir;
      if (along > 0 && along < ahead) ahead = along;
    }
    var p = G.playerCar;
    if (p) {
      var pAlong = c.axis === 'x' ? (p.x - c.x) * c.dir : (p.z - c.z) * c.dir;
      var pLat = c.axis === 'x' ? Math.abs(p.z - c.z) : Math.abs(p.x - c.x);
      if (pAlong > 0 && pAlong < ahead && pLat < 3) ahead = pAlong;
    }
    return ahead;
  };

  Traffic.prototype.update = function (dt, allCars) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var c = this.list[i];
      if (c.kind === 'parked' || c.kind === 'player') continue;
      c.turnCooldown -= dt;
      var along = c.axis === 'x' ? c.x : c.z;
      var nearLine = Math.abs(along % 40) < 2 || Math.abs(along % 40) > 38;
      if (nearLine && c.turnCooldown <= 0 && Math.random() < dt * 0.9) {
        // Turn onto the crossing road at this intersection.
        var cross = Math.round(along / 40) * 40;
        var newLine = Math.max(-160, Math.min(160, cross));
        var newAxis = c.axis === 'x' ? 'z' : 'x';
        var newDir = Math.random() < 0.5 ? 1 : -1;
        if (newAxis === 'x') { c.z = newLine + (newDir > 0 ? 3.2 : -3.2); c.yaw = newDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { c.x = newLine + (newDir > 0 ? -3.2 : 3.2); c.yaw = newDir > 0 ? 0 : Math.PI; }
        c.axis = newAxis; c.line = newLine; c.dir = newDir;
        c.turnCooldown = 3;
      }
      var ahead = this.carAhead(c, allCars);
      var target = ahead < 9 ? 0 : G.TUNE.trafficSpeed;
      c.speed += Math.max(-14 * dt, Math.min(8 * dt, target - c.speed));
      if (c.axis === 'x') c.x += c.dir * c.speed * dt;
      else c.z += c.dir * c.speed * dt;
      var pos = c.axis === 'x' ? c.x : c.z;
      if (pos > 178 || pos < -178) {
        // Wrap to the far end of the same road, out of the player's view.
        if (c.axis === 'x') c.x = -c.dir * 170;
        else c.z = -c.dir * 170;
      }
      syncCarMesh(c);
    }
  };

  Traffic.prototype.nearestCar = function (x, z, range, kinds) {
    var best = null, bd = range;
    for (var i = 0; i < this.list.length; i++) {
      var c = this.list[i];
      if (kinds && kinds.indexOf(c.kind) === -1) continue;
      var dx = c.x - x, dz = c.z - z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  Traffic.prototype.removeCar = function (c) {
    var i = this.list.indexOf(c);
    if (i !== -1) this.list.splice(i, 1);
    this.scene.remove(c.mesh.group);
  };

  // ---- Police --------------------------------------------------------------
  function Police(scene) {
    this.list = [];
    this.scene = scene;
    this.spawnTimer = 0;
  }

  Police.prototype.wantedCount = function (wanted) {
    return Math.min(5, Math.max(0, wanted));
  };

  Police.prototype.spawnNear = function (px, pz) {
    var lines = G.ROAD_LINES;
    var axis = Math.random() < 0.5 ? 'x' : 'z';
    var line = lines[Math.floor(Math.random() * lines.length)];
    var along = (axis === 'x' ? px : pz) + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 30);
    along = Math.max(-170, Math.min(170, along));
    var c = makeCar('police', 0xf0f0f0, 0, 0, 0);
    c.axis = axis; c.line = line; c.dir = 1;
    if (axis === 'x') { c.x = along; c.z = line; c.yaw = Math.PI / 2; }
    else { c.z = along; c.x = line; c.yaw = 0; }
    c.speed = 10;
    this.scene.add(c.mesh.group);
    this.list.push(c);
    return c;
  };

  Police.prototype.nearestDistance = function (px, pz) {
    var best = 9999;
    for (var i = 0; i < this.list.length; i++) {
      var c = this.list[i];
      var dx = c.x - px, dz = c.z - pz;
      best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
    }
    return best;
  };

  Police.prototype.update = function (dt, wanted, player) {
    var want = this.wantedCount(wanted);
    this.spawnTimer -= dt;
    while (this.list.length < want && this.spawnTimer <= 0) {
      this.spawnNear(player.x, player.z);
      this.spawnTimer = 1.2;
    }
    if (want === 0) {
      // Stand down: drive off and fade out far from the player.
      for (var i = this.list.length - 1; i >= 0; i--) {
        var c = this.list[i];
        c.speed = Math.min(c.speed + 8 * dt, 16);
        var f = carForward(c);
        c.x += f.x * c.speed * dt;
        c.z += f.z * c.speed * dt;
        var dx = c.x - player.x, dz = c.z - player.z;
        if (dx * dx + dz * dz > 14400) {
          this.scene.remove(c.mesh.group);
          this.list.splice(i, 1);
        } else syncCarMesh(c);
      }
      return;
    }
    var maxSpeed = 16 + wanted * 1.4;
    for (var j = 0; j < this.list.length; j++) {
      var p = this.list[j];
      var tx = player.x, tz = player.z;
      var dx = tx - p.x, dz = tz - p.z;
      var dist = Math.sqrt(dx * dx + dz * dz) || 1;
      var desired = Math.atan2(dx, dz);
      var diff = desired - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      p.speed = Math.min(p.speed + 10 * dt, maxSpeed);
      var f2 = carForward(p);
      var nx = p.x + f2.x * p.speed * dt;
      var nz = p.z + f2.z * p.speed * dt;
      var hit = G.collideCircle(nx, nz, G.TUNE.carRadius);
      if (hit) { nx = hit.x; nz = hit.z; p.speed *= 0.5; }
      p.x = Math.max(-178, Math.min(178, nx));
      p.z = Math.max(-178, Math.min(178, nz));
      syncCarMesh(p);
      // Ram the player: a hard hit slows the player's car and hurts.
      // One ram per cop per 1.5s so a long overlap is one hit, not fifty.
      p.ramTimer = (p.ramTimer || 0) - dt;
      if (player.inCar && dist < 3.4) {
        if (Math.abs(p.speed) > 6 && p.ramTimer <= 0) {
          p.ramTimer = 1.5;
          if (G.damagePlayer) G.damagePlayer(4, 'ram');
          G.audio.crash();
        }
        if (player.car) {
          player.car.speed *= 0.92;
          var px = player.car.x - p.x, pz = player.car.z - p.z;
          var pd = Math.sqrt(px * px + pz * pz) || 1;
          player.car.x += (px / pd) * 0.4;
          player.car.z += (pz / pd) * 0.4;
        }
      }
      // Foot bust: a cop car sitting on the player ends the run.
      if (!player.inCar && dist < 2.6 && G.onPoliceContact) G.onPoliceContact(dt);
      // Cops shoot at wanted 3+ when close enough.
      p.shotTimer -= dt;
      if (wanted >= 3 && dist < G.TUNE.copShotRange && p.shotTimer <= 0) {
        p.shotTimer = 1.1 + Math.random() * 0.7;
        if (Math.random() < 0.55 && G.damagePlayer) G.damagePlayer(G.TUNE.copShotDamage, 'shot');
        if (G.tracer) G.tracer(p.x, 1.4, p.z, player.x, 1.2, player.z, 0xffaa33);
        G.audio.gunshot();
      }
    }
  };

  G.makeCar = makeCar;
  G.carForward = carForward;
  G.syncCarMesh = syncCarMesh;
  G.drivePlayerCar = drivePlayerCar;
  G.Traffic = Traffic;
  G.Police = Police;
})();
