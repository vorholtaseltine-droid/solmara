// Solmara city: a sun-soaked grid city built from boxes, canvas textures and
// a painted ground plane. Exports the colliders, the parked-car spots and
// the place markers every other system needs.
(function () {
  'use strict';

  var G = window.SOLMARA;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Ground: one 2048px canvas painted with roads, sidewalks, sand -----
  function paintGround() {
    var S = 2048, W = 400; // canvas px, world units across (-200..200)
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var c = cv.getContext('2d');
    function X(x) { return (x + W / 2) / W * S; }
    function Z(z) { return (z + W / 2) / W * S; }
    function U(u) { return u / W * S; }

    c.fillStyle = '#8fa06b'; // lawn / bare ground
    c.fillRect(0, 0, S, S);

    // Beach sand along the south edge.
    c.fillStyle = '#e8d49a';
    c.fillRect(0, Z(150), S, S - Z(150));
    // A park block.
    c.fillStyle = '#6f9e57';
    c.fillRect(X(-80), Z(40), U(40), U(40));

    // Sidewalks: a light frame around every block.
    c.fillStyle = '#b9b3a4';
    var lines = G.ROAD_LINES;
    for (var i = 0; i < lines.length - 1; i++) {
      for (var j = 0; j < lines.length - 1; j++) {
        var x0 = lines[i] + 7, z0 = lines[j] + 7;
        c.fillRect(X(x0), Z(z0), U(26), U(26));
      }
    }
    // Block interiors (grass / concrete lots).
    c.fillStyle = '#a8a88e';
    for (i = 0; i < lines.length - 1; i++) {
      for (j = 0; j < lines.length - 1; j++) {
        x0 = lines[i] + 10; z0 = lines[j] + 10;
        c.fillRect(X(x0), Z(z0), U(20), U(20));
      }
    }
    c.fillStyle = '#6f9e57';
    c.fillRect(X(-70), Z(50), U(20), U(20)); // park lawn

    // Asphalt.
    c.fillStyle = '#2e3138';
    lines.forEach(function (L) {
      c.fillRect(X(L - 7), 0, U(14), S);
      c.fillRect(0, Z(L - 7), S, U(14));
    });
    // Centre dashes.
    c.fillStyle = '#d8c25a';
    lines.forEach(function (L) {
      for (var d = -190; d < 200; d += 16) {
        c.fillRect(X(L - 0.6), Z(d), U(1.2), U(7));
        c.fillRect(X(d), Z(L - 0.6), U(7), U(1.2));
      }
    });
    // Crosswalks at every intersection.
    c.fillStyle = '#e8e8e8';
    lines.forEach(function (Lx) {
      lines.forEach(function (Lz) {
        for (var s = -6; s <= 6; s += 3) {
          c.fillRect(X(Lx + s - 1), Z(Lz - 7), U(1.6), U(3));
          c.fillRect(X(Lx + s - 1), Z(Lz + 4), U(1.6), U(3));
          c.fillRect(X(Lx - 7), Z(Lz + s - 1), U(3), U(1.6));
          c.fillRect(X(Lx + 4), Z(Lz + s - 1), U(3), U(1.6));
        }
      });
    });
    // Parking stalls in the marina lots.
    c.strokeStyle = '#e8e8e8'; c.lineWidth = 2;
    for (var p = 0; p < 6; p++) {
      var px = X(110 + p * 5), pz = Z(130);
      c.strokeRect(px, pz, U(4), U(9));
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 2;
    return tex;
  }

  // ---- Facades: four window-grid textures buildings share ------------------
  function facadeTexture(base, lit) {
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 256;
    var c = cv.getContext('2d');
    c.fillStyle = base;
    c.fillRect(0, 0, 128, 256);
    var rnd = mulberry32(base.length * 7919 + lit * 13 + 5);
    for (var y = 10; y < 246; y += 18) {
      for (var x = 8; x < 120; x += 16) {
        var r = rnd();
        c.fillStyle = r < 0.22 ? '#ffd98a' : (r < 0.6 ? '#2c3844' : '#46586a');
        c.fillRect(x, y, 10, 12);
      }
    }
    return new THREE.CanvasTexture(cv);
  }

  function signTexture(text, bg, fg) {
    var cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    var c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, 512, 128);
    c.fillStyle = fg;
    c.font = 'bold 64px Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 256, 68);
    return new THREE.CanvasTexture(cv);
  }

  // ---- City build ----------------------------------------------------------
  function buildCity(scene) {
    var world = {
      colliders: [],
      parkedSpots: [],
      group: new THREE.Group(),
    };
    G.world = world;
    var rnd = mulberry32(20261117);

    // Lights and sky.
    scene.background = new THREE.Color(G.PALETTE.sky);
    scene.fog = new THREE.Fog(G.PALETTE.sky, 180, 420);
    var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(G.PALETTE.sun, 1.15);
    sun.position.set(120, 180, 60);
    scene.add(sun);

    // Ground.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ map: paintGround() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    world.group.add(ground);

    // Water (south of the beach) and a foam strip at the shoreline.
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 90),
      new THREE.MeshLambertMaterial({ color: G.PALETTE.water })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.06, 228);
    world.group.add(water);
    var foam = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 3),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.09, 186);
    world.group.add(foam);

    // Facade materials.
    var facades = [
      facadeTexture('#d8c9b0', 1), facadeTexture('#b7c4cc', 2),
      facadeTexture('#d9a986', 3), facadeTexture('#a8b8c4', 4),
    ];
    var facadeMats = facades.map(function (t) {
      return new THREE.MeshLambertMaterial({ map: t });
    });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd0e8, emissive: 0x1c2f3a });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var roofGeo = new THREE.BoxGeometry(1, 0.5, 1);

    function addBuilding(cx, cz, w, h, d, matIndex, glass) {
      // One material per building keeps the draw calls down (a material
      // array would split every box into six calls); the roof shows the
      // same facade, which reads as a rooftop pattern from above.
      var m = new THREE.Mesh(boxGeo, glass ? glassMat : facadeMats[matIndex % 4]);
      m.scale.set(w, h, d);
      m.position.set(cx, h / 2, cz);
      world.group.add(m);
      world.colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h: h });
      return m;
    }

    // Blocks: centres sit between the roads.
    var centres = [-140, -100, -60, -20, 20, 60, 100, 140];
    centres.forEach(function (bx) {
      centres.forEach(function (bz) {
        if (bz >= 140) return; // beach row
        if (bx === -60 && bz === 60) return; // Palm Park
        if (bx >= 100 && bz >= 100) return; // marina parking lots
        var downtown = Math.abs(bx) <= 60 && Math.abs(bz) <= 60;
        var n = downtown ? (rnd() < 0.5 ? 2 : 1) : (rnd() < 0.6 ? 1 : 2);
        for (var k = 0; k < n; k++) {
          var w = 12 + rnd() * 7, d = 12 + rnd() * 7;
          var h = downtown ? 24 + rnd() * 46 : 8 + rnd() * 16;
          var ox = n === 1 ? 0 : (k === 0 ? -5 : 5);
          var oz = n === 1 ? 0 : (k === 0 ? 5 : -5);
          addBuilding(bx + ox, bz + oz, w, h, d, Math.floor(rnd() * 4), false);
        }
      });
    });

    // Landmarks: the glass Solmara Tower and the Bay Bank.
    addBuilding(20, -20, 26, 78, 26, 0, true);
    var bank = addBuilding(60, 20, 22, 16, 18, 1, false);
    bank.position.y = 8;

    // Signs.
    function addSign(text, bg, fg, x, y, z, yaw, w, h) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) })
      );
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      world.group.add(m);
    }
    addSign('SOLMARA', '#1c4d6e', '#ffd98a', 20, 70, -6.4, 0, 30, 7);
    addSign('BAY BANK', '#274e13', '#f2e6c9', 60, 19, 10.6, 0, 20, 5);
    addSign('MARINA', '#7a3b12', '#ffe9b0', 140, 9, 132, Math.PI, 18, 4.5);
    addSign('PALM PARK', '#2e5d33', '#eaf5d8', -60, 6, 38, 0, 16, 4);

    // Street lamps at intersections.
    var poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
    var lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    G.ROAD_LINES.forEach(function (Lx) {
      G.ROAD_LINES.forEach(function (Lz) {
        if ((Lx + Lz) % 80 !== 0) return;
        var pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(Lx + 8.5, 3, Lz + 8.5);
        world.group.add(pole);
        var lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(Lx + 8.5, 6.2, Lz + 8.5);
        world.group.add(lamp);
      });
    });

    // Palm trees: beach, park and marina.
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 6, 6);
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    var frondGeo = new THREE.BoxGeometry(0.5, 0.12, 3.4);
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    function addPalm(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3;
      trunk.rotation.z = 0.08;
      g.add(trunk);
      for (var i = 0; i < 5; i++) {
        var f = new THREE.Mesh(frondGeo, frondMat);
        var a = (i / 5) * Math.PI * 2;
        f.position.set(Math.cos(a) * 1.2, 6.1, Math.sin(a) * 1.2);
        f.rotation.y = -a;
        f.rotation.z = 0.5;
        g.add(f);
      }
      g.position.set(x, 0, z);
      world.group.add(g);
    }
    for (var px = -160; px <= 160; px += 32) addPalm(px + 8, 168);
    for (var pz = 48; pz <= 72; pz += 12) { addPalm(-72, pz); addPalm(-48, pz + 6); }
    addPalm(120, 140); addPalm(150, 145); addPalm(105, 155);

    // Parked-car spots: marina lots and a few curbside.
    [[112, 134, 0], [122, 134, 0], [132, 134, 0], [142, 134, 0], [152, 134, 0],
     [-8, 47, Math.PI / 2], [48, -47, 0], [-47, 8, Math.PI / 2]].forEach(function (s) {
      world.parkedSpots.push({ x: s[0], z: s[1], yaw: s[2] });
    });

    scene.add(world.group);
    G.log('[city] colliders:', world.colliders.length);
    return world;
  }

  // Circle (x, z, r) against building AABBs; returns the push-out or null.
  function collideCircle(x, z, r) {
    var cols = G.world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var b = cols[i];
      var cx = Math.max(b.x0, Math.min(x, b.x1));
      var cz = Math.max(b.z0, Math.min(z, b.z1));
      var dx = x - cx, dz = z - cz;
      var d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          var d = Math.sqrt(d2);
          return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
        }
        // Centre inside the box: push out along the smallest penetration.
        var pl = x - b.x0, pr = b.x1 - x, pt = z - b.z0, pb = b.z1 - z;
        var m = Math.min(pl, pr, pt, pb);
        if (m === pl) return { x: b.x0 - r, z: z };
        if (m === pr) return { x: b.x1 + r, z: z };
        if (m === pt) return { x: x, z: b.z0 - r };
        return { x: x, z: b.z1 + r };
      }
    }
    return null;
  }

  // Is the 3D point (x, y, z) inside a building? The camera uses this so it
  // can rise above a roof instead of clipping through the tower.
  function cameraBlocked(x, y, z) {
    var cols = G.world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var b = cols[i];
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h) return true;
    }
    return false;
  }

  G.buildCity = buildCity;
  G.collideCircle = collideCircle;
  G.cameraBlocked = cameraBlocked;
})();
