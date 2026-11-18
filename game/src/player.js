// Solmara player: Rook on foot and behind the wheel — movement, the
// follow camera, entering and stealing cars, punching and shooting, and
// the wanted level that follows every crime.
(function () {
  'use strict';

  var G = window.SOLMARA;

  function Player(scene) {
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.yaw = 0; this.camYaw = 0;
    this.health = G.TUNE.playerHealth;
    this.money = G.START_MONEY;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeTimer = 0;
    this.inCar = false;
    this.car = null;
    this.bustTimer = 0;
    this.gunTimer = 0;
    this.hurtFlash = 0;
    this.fig = G.makePerson(0x2c3e50, 0xe8b98a, 0x2c3e50);
    this.fig.group.position.set(0, 0, 0);
    scene.add(this.fig.group);
    this.scene = scene;
    this.tracers = [];
    var lineMat = new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.9 });
    for (var i = 0; i < 6; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      var line = new THREE.Line(geo, lineMat.clone());
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line: line, life: 0 });
    }
  }

  Player.prototype.spawnAt = function (x, z) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    this.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.fig.group.position.set(x, 0, z);
  };

  Player.prototype.addWanted = function (n) {
    this.wanted = Math.min(5, this.wanted + n);
    this.wantedTimer = 0;
    this.crimeTimer = 0;
    if (G.hud) G.hud.setStars(this.wanted);
  };

  Player.prototype.setWanted = function (n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.wantedTimer = 0;
    this.crimeTimer = 0;
    if (G.hud) G.hud.setStars(this.wanted);
  };

  Player.prototype.damage = function (amount, source) {
    if (G.state !== 'playing') return;
    // One hit per source per 0.8s: a ramming cop car overlaps for many
    // frames, and each frame must not be a fresh hit.
    var now = Date.now();
    this._lastHit = this._lastHit || {};
    if (this._lastHit[source] && now - this._lastHit[source] < 800) return;
    this._lastHit[source] = now;
    this.health -= amount;
    this.hurtFlash = 1;
    if (G.hud) G.hud.damageFlash();
    if (this.health <= 0) {
      this.health = 0;
      if (G.onWasted) G.onWasted();
    }
  };

  Player.prototype.heal = function (amount) {
    this.health = Math.min(G.TUNE.playerHealth, this.health + amount);
  };

  // ---- Tracers: short-lived lines from a muzzle to a hit point ------------
  Player.prototype.tracer = function (x1, y1, z1, x2, y2, z2, color) {
    for (var i = 0; i < this.tracers.length; i++) {
      var t = this.tracers[i];
      if (t.life <= 0) {
        t.line.geometry.setFromPoints([new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)]);
        t.line.material.color.setHex(color || 0xffdd55);
        t.line.material.opacity = 0.9;
        t.line.visible = true;
        t.life = 0.09;
        return;
      }
    }
  };

  Player.prototype.updateTracers = function (dt) {
    for (var i = 0; i < this.tracers.length; i++) {
      var t = this.tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
  };

  // ---- Shooting: hitscan against peds, police cars and buildings ----------
  Player.prototype.rayHit = function (ox, oy, oz, dx, dy, dz, maxDist) {
    var best = maxDist, hit = null;
    // Buildings: slab test against each AABB (treated as tall).
    var cols = G.world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var b = cols[i];
      var tmin = 0, tmax = best;
      var o, d, mn, mx;
      o = ox; d = dx; mn = b.x0; mx = b.x1;
      if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) continue; }
      else {
        var t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      o = oz; d = dz; mn = b.z0; mx = b.z1;
      if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) continue; }
      else {
        t1 = (mn - o) / d; t2 = (mx - o) / d;
        if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (tmin < best && tmin > 0) { best = tmin; hit = { kind: 'wall' }; }
    }
    // Pedestrians: ray vs sphere at chest height.
    var peds = G.peds.list;
    for (var j = 0; j < peds.length; j++) {
      var p = peds[j];
      if (p.state === 'down') continue;
      var cx = p.x - ox, cy = 1.2 - oy, cz = p.z - oz;
      var tca = cx * dx + cy * dy + cz * dz;
      if (tca < 0 || tca > best) continue;
      var d2 = cx * cx + cy * cy + cz * cz - tca * tca;
      if (d2 < 0.81) { best = tca; hit = { kind: 'ped', ped: p }; }
    }
    // Police cars: ray vs horizontal circle.
    var pol = G.police.list;
    for (var k = 0; k < pol.length; k++) {
      var c = pol[k];
      var ex = c.x - ox, ez = c.z - oz;
      var t2 = ex * dx + ez * dz;
      if (t2 < 0 || t2 > best) continue;
      var d3 = ex * ex + ez * ez - t2 * t2;
      if (d3 < 4.2) { best = t2; hit = { kind: 'cop', car: c }; }
    }
    return { dist: best, hit: hit };
  };

  Player.prototype.shoot = function (camera) {
    if (this.gunTimer > 0 || G.state !== 'playing' || this.inCar) return;
    this.gunTimer = G.TUNE.gunCooldown;
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    var ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    var r = this.rayHit(ox, oy, oz, dir.x, dir.y, dir.z, G.TUNE.gunRange);
    var hx = ox + dir.x * r.dist, hy = oy + dir.y * r.dist, hz = oz + dir.z * r.dist;
    this.tracer(this.x, 1.5, this.z, hx, hy, hz, 0xffdd55);
    G.audio.gunshot();
    if (r.hit) {
      if (r.hit.kind === 'ped') {
        var p = r.hit.ped;
        p.hp -= G.TUNE.gunDamage;
        if (p.hp <= 0) {
          G.peds.knockDown(p, this.x, this.z);
          this.addWanted(1);
          if (G.hud) G.hud.say('Mara: A body in broad daylight? The cops heard that.');
        } else {
          G.peds.fleeFrom(p.x, p.z, 18);
        }
      } else if (r.hit.kind === 'cop') {
        this.addWanted(1);
        if (G.hud) G.hud.say('Mara: You shot a cop car. Now they are all coming.');
      }
      G.peds.fleeFrom(hx, hz, 22);
    }
  };

  Player.prototype.punch = function () {
    if (G.state !== 'playing' || this.inCar) return;
    G.audio.punch();
    var p = G.peds.nearest(this.x, this.z, 2.3);
    if (p) {
      p.hp -= G.TUNE.punchDamage;
      if (p.hp <= 0) {
        G.peds.knockDown(p, this.x, this.z);
        this.addWanted(1);
      } else {
        G.peds.fleeFrom(p.x, p.z, 15);
      }
    }
  };

  // ---- Entering and leaving cars -------------------------------------------
  Player.prototype.nearestEnterable = function () {
    if (G.playerCar) {
      var dx = G.playerCar.x - this.x, dz = G.playerCar.z - this.z;
      if (dx * dx + dz * dz < 12.25) return { car: G.playerCar, kind: 'mine' };
    }
    var c = G.traffic.nearestCar(this.x, this.z, 3.5, ['parked', 'traffic']);
    if (c) return { car: c, kind: c.kind };
    return null;
  };

  Player.prototype.enterCar = function (entry) {
    var c = entry.car;
    G.traffic.removeCar(c); // the car leaves traffic control either way
    if (entry.kind === 'traffic') {
      this.addWanted(1);
      if (G.hud) G.hud.say('Car stolen! The owner called it in.');
      G.audio.horn();
    }
    c.kind = 'player';
    G.playerCar = c;
    this.inCar = true;
    this.car = c;
    this.fig.group.visible = false;
    if (G.hud) G.hud.setInCar(true);
  };

  Player.prototype.exitCar = function () {
    var c = this.car;
    if (!c) return;
    var side = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
    this.x = c.x + side.x * 2.4;
    this.z = c.z + side.z * 2.4;
    this.y = 0; this.vy = 0;
    var hit = G.collideCircle(this.x, this.z, G.TUNE.playerRadius);
    if (hit) { this.x = hit.x; this.z = hit.z; }
    this.inCar = false;
    this.car = null;
    this.yaw = c.yaw;
    this.camYaw = c.yaw;
    this.fig.group.visible = true;
    this.fig.group.position.set(this.x, 0, this.z);
    if (G.hud) G.hud.setInCar(false);
  };

  // ---- Per-frame update ------------------------------------------------------
  Player.prototype.update = function (dt, input, camera) {
    this.gunTimer -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.updateTracers(dt);

    // Wanted decays when the player keeps clean for a while.
    if (this.wanted > 0) {
      this.crimeTimer += dt;
      if (this.crimeTimer > G.TUNE.wantedDecaySeconds) {
        this.crimeTimer = 0;
        this.setWanted(this.wanted - 1);
        if (this.wanted === 0 && G.hud) G.hud.say('Mara: Heat is off. You are clean, Rook.');
      }
    }
    if (this.bustTimer > 0) this.bustTimer = Math.max(0, this.bustTimer - dt * 0.5);

    if (this.inCar && this.car) {
      var drive = G.drivePlayerCar(this.car, input, dt);
      this.x = this.car.x; this.z = this.car.z;
      this.yaw = this.car.yaw;
      G.audio.engine(Math.abs(this.car.speed) / G.TUNE.carMaxSpeed, input.forward ? 1 : 0);
      if (input.ePressed) {
        // Exiting clears this.car, so fall through to the on-foot code
        // below instead of reading the car's yaw for the camera.
        this.exitCar();
      } else {
        this.updateCamera(dt, camera, 11, 4.6, this.car.yaw, Math.abs(this.car.speed) / G.TUNE.carMaxSpeed);
        return;
      }
    }

    G.audio.engine(0, 0);
    // On foot: move relative to the camera yaw.
    var mx = 0, mz = 0;
    if (input.forward) { mx += Math.sin(this.camYaw); mz += Math.cos(this.camYaw); }
    if (input.back) { mx -= Math.sin(this.camYaw); mz -= Math.cos(this.camYaw); }
    if (input.left) { mx -= Math.cos(this.camYaw); mz += Math.sin(this.camYaw); }
    if (input.right) { mx += Math.cos(this.camYaw); mz -= Math.sin(this.camYaw); }
    var ml = Math.sqrt(mx * mx + mz * mz);
    var moving = ml > 0;
    var speed = input.run ? G.TUNE.runSpeed : G.TUNE.walkSpeed;
    if (moving) {
      mx /= ml; mz /= ml;
      this.yaw = Math.atan2(mx, mz);
      var nx = this.x + mx * speed * dt;
      var nz = this.z + mz * speed * dt;
      var hit = G.collideCircle(nx, nz, G.TUNE.playerRadius);
      if (hit) { nx = hit.x; nz = hit.z; }
      this.x = Math.max(-178, Math.min(178, nx));
      this.z = Math.max(-178, Math.min(178, nz));
    }
    // Jump and gravity.
    if (input.jumpPressed && this.y === 0) this.vy = G.TUNE.jumpSpeed;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= G.TUNE.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    // Camera orbit from mouse drag; arrow keys nudge it too.
    if (input.dragDX) this.camYaw -= input.dragDX * 0.005;
    this.fig.group.position.set(this.x, this.y, this.z);
    this.fig.group.rotation.y = this.yaw;
    this.fig.setWalk(moving, moving ? (input.run ? 1 : 0.55) : 0);
    if (input.punchPressed) this.punch();
    if (input.shootPressed || input.mouseDown) this.shoot(camera);
    if (input.ePressed) {
      var entry = this.nearestEnterable();
      if (entry) this.enterCar(entry);
    }
    this.updateCamera(dt, camera, 7.5, 3.2, this.yaw, moving ? 0.4 : 0);
  };

  Player.prototype.updateCamera = function (dt, camera, dist, height, targetYaw, speed01) {
    // Ease the camera behind the target; mouse drags hold it off-axis briefly.
    var diff = targetYaw - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camYaw += diff * Math.min(1, dt * 3.5);
    var fwd = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    // Keep the camera out of buildings: rise above the roof first, and only
    // pull in closer when the roof is still above the camera.
    var d = dist;
    var h = height;
    var px = this.x, pz = this.z;
    var guard = 0;
    while (guard++ < 24) {
      var cx = px - fwd.x * d, cz = pz - fwd.z * d;
      if (!G.cameraBlocked(cx, h, cz)) break;
      if (h < height + 16) h += 3.5;
      else d -= 1.5;
    }
    var tx = px - fwd.x * d, tz = pz - fwd.z * d;
    var ty = h + this.y * 0.5;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 8);
    camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 8);
    camera.lookAt(px + fwd.x * 4, 1.4 + this.y * 0.5, pz + fwd.z * 4);
    var wantFov = 60 + speed01 * 12;
    if (Math.abs(camera.fov - wantFov) > 0.2) {
      camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  };

  // Called by police when a cop car sits on the on-foot player.
  Player.prototype.policeContact = function (dt) {
    this.bustTimer += dt;
    if (this.bustTimer > G.TUNE.bustHoldSeconds && G.onBusted) G.onBusted();
  };

  G.Player = Player;
})();
