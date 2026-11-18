// Solmara people: one low-poly figure factory shared by the player and the
// pedestrians, plus the pedestrian crowd that walks the sidewalks.
(function () {
  'use strict';

  var G = window.SOLMARA;

  // A simple readable figure: legs, torso, arms, head. Limbs swing with the
  // walk phase; `down` lays the figure flat (knocked down).
  function makePerson(shirtColor, skinColor, pantsColor, scale) {
    var g = new THREE.Group();
    var s = scale || 1;
    var shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
    var skin = new THREE.MeshLambertMaterial({ color: skinColor });
    var pants = new THREE.MeshLambertMaterial({ color: pantsColor || 0x2c3e50 });
    var legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.24);
    var armGeo = new THREE.BoxGeometry(0.16, 0.72, 0.18);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
    torso.position.y = 1.16;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.72;
    var hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    hair.position.y = 1.92;
    var legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.16, 0.4, 0);
    var legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(0.16, 0.4, 0);
    var armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-0.42, 1.18, 0);
    var armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set(0.42, 1.18, 0);
    g.add(torso, head, hair, legL, legR, armL, armR);
    g.scale.setScalar(s);
    // Pivot the limbs at the hip/shoulder by offsetting the geometry origin:
    // rotating the mesh around its centre is close enough at this scale.
    return {
      group: g, legL: legL, legR: legR, armL: armL, armR: armR,
      phase: Math.random() * 6,
      setWalk: function (moving, speed01) {
        if (!moving) {
          this.legL.rotation.x = 0; this.legR.rotation.x = 0;
          this.armL.rotation.x = 0; this.armR.rotation.x = 0;
          return;
        }
        this.phase += 0.22 * (0.5 + speed01);
        var sw = Math.sin(this.phase) * 0.65 * (0.4 + speed01 * 0.6);
        this.legL.rotation.x = sw;
        this.legR.rotation.x = -sw;
        this.armL.rotation.x = -sw * 0.8;
        this.armR.rotation.x = sw * 0.8;
      },
      setDown: function (down) {
        g.rotation.x = down ? -Math.PI / 2 : 0;
        g.position.y = down ? 0.25 : 0;
      },
    };
  }

  // ---- Pedestrian crowd ----------------------------------------------------
  function Pedestrians(scene) {
    this.list = [];
    this.scene = scene;
    var rnd = Math.random;
    for (var i = 0; i < G.TUNE.pedCount; i++) this.spawnRandom();
  }

  Pedestrians.prototype.randomSidewalkSpot = function () {
    var lines = G.ROAD_LINES;
    var L = lines[Math.floor(Math.random() * lines.length)];
    var along = -170 + Math.random() * 340;
    var side = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.5) return { x: L + side * 8.6, z: along, axis: 'z', dir: Math.random() < 0.5 ? 1 : -1 };
    return { x: along, z: L + side * 8.6, axis: 'x', dir: Math.random() < 0.5 ? 1 : -1 };
  };

  Pedestrians.prototype.spawnRandom = function () {
    var spot = this.randomSidewalkSpot();
    var shirt = G.PALETTE.shirt[Math.floor(Math.random() * G.PALETTE.shirt.length)];
    var skin = G.PALETTE.skin[Math.floor(Math.random() * G.PALETTE.skin.length)];
    var fig = makePerson(shirt, skin);
    fig.group.position.set(spot.x, 0, spot.z);
    this.scene.add(fig.group);
    this.list.push({
      fig: fig, x: spot.x, z: spot.z, axis: spot.axis,
      dir: spot.dir, speed: 1.4 + Math.random() * 1.1,
      state: 'walk', timer: 0, hp: 50, fleeX: 0, fleeZ: 0,
    });
  };

  Pedestrians.prototype.nearest = function (x, z, range) {
    var best = null, bd = range;
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (p.state === 'down') continue;
      var dx = p.x - x, dz = p.z - z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  Pedestrians.prototype.knockDown = function (p, fromX, fromZ) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.timer = 6;
    p.fig.setDown(true);
    p.fig.setWalk(false, 0);
    var dx = p.x - fromX, dz = p.z - fromZ;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    p.x += (dx / d) * 1.5; p.z += (dz / d) * 1.5;
  };

  Pedestrians.prototype.fleeFrom = function (x, z, radius) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      if (p.state !== 'walk') continue;
      var dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.state = 'flee';
        p.timer = 3;
        p.fleeX = x; p.fleeZ = z;
      }
    }
  };

  Pedestrians.prototype.update = function (dt, playerX, playerZ, wanted) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) {
          this.scene.remove(p.fig.group);
          this.list.splice(i, 1);
          this.spawnRandom();
        }
        continue;
      }
      var speed = p.speed, moving = true;
      if (p.state === 'flee') {
        p.timer -= dt;
        if (p.timer <= 0) p.state = 'walk';
        var dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
        var d = Math.sqrt(dx * dx + dz * dz) || 1;
        p.x += (dx / d) * 4.6 * dt;
        p.z += (dz / d) * 4.6 * dt;
        p.fig.group.rotation.y = Math.atan2(dx, dz);
        speed = 4.6;
      } else {
        // Stroll the sidewalk; turn at intersections sometimes.
        if (p.axis === 'z') {
          p.z += p.dir * p.speed * dt;
          if (Math.abs(p.z % 40) < 1 && Math.random() < 0.004) { p.axis = 'x'; p.dir = Math.random() < 0.5 ? 1 : -1; }
          if (p.z > 175 || p.z < -175) p.dir *= -1;
          p.fig.group.rotation.y = p.dir > 0 ? 0 : Math.PI;
        } else {
          p.x += p.dir * p.speed * dt;
          if (Math.abs(p.x % 40) < 1 && Math.random() < 0.004) { p.axis = 'z'; p.dir = Math.random() < 0.5 ? 1 : -1; }
          if (p.x > 175 || p.x < -175) p.dir *= -1;
          p.fig.group.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        // A wanted player nearby scares the crowd.
        if (wanted >= 2) {
          var px = p.x - playerX, pz = p.z - playerZ;
          if (px * px + pz * pz < 625) {
            p.state = 'flee'; p.timer = 2.5; p.fleeX = playerX; p.fleeZ = playerZ;
          }
        }
      }
      p.x = Math.max(-178, Math.min(178, p.x));
      p.z = Math.max(-178, Math.min(178, p.z));
      p.fig.group.position.set(p.x, 0, p.z);
      p.fig.setWalk(moving, Math.min(1, speed / 5));
    }
  };

  G.makePerson = makePerson;
  G.Pedestrians = Pedestrians;
})();
