// Solmara missions: Mara's job chain for Rook — objectives, the light
// beacon that marks them, timers, rewards and the story's ending.
(function () {
  'use strict';

  var G = window.SOLMARA;

  function Missions(scene) {
    this.scene = scene;
    this.index = 0;
    this.step = 0;
    this.timer = 0;
    this.grabProgress = 0;
    this.done = false;
    this.waitNext = 0;
    // The beacon: a column of light over the objective, visible across town.
    var geo = new THREE.CylinderGeometry(3, 3, 60, 16, 1, true);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    scene.add(this.beacon);
    var ringGeo = new THREE.RingGeometry(2.4, 3.4, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.15;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  Missions.prototype.mission = function () {
    return G.MISSIONS[this.index];
  };

  Missions.prototype.currentStep = function () {
    var m = this.mission();
    return m ? m.steps[this.step] : null;
  };

  Missions.prototype.start = function (index) {
    this.index = index;
    this.step = 0;
    this.done = false;
    this.waitNext = 0;
    this.grabProgress = 0;
    var m = this.mission();
    if (!m) return;
    this.timer = 0;
    if (m.startWanted) G.player.setWanted(m.startWanted);
    if (G.hud) {
      G.hud.banner(m.title, 'New mission');
      G.hud.say(m.brief);
      G.hud.setObjective(this.objectiveText());
    }
    this.placeBeacon();
  };

  Missions.prototype.objectiveText = function () {
    if (this.done) return 'Story complete — free roam Solmara.';
    var m = this.mission();
    if (!m) return '';
    var s = this.currentStep();
    var text = m.title + ': ' + (s ? s.text : '');
    if (s && s.kind === 'timed-goto' && this.timer > 0) {
      text += ' — ' + Math.ceil(this.timer) + 's';
    }
    if (s && s.kind === 'grab' && this.grabProgress > 0) {
      text += ' — ' + Math.round(this.grabProgress / s.seconds * 100) + '%';
    }
    return text;
  };

  Missions.prototype.markerPos = function () {
    var s = this.currentStep();
    if (!s || !s.place) return null;
    var p = G.PLACES[s.place];
    return p ? { x: p.x, z: p.z } : null;
  };

  Missions.prototype.placeBeacon = function () {
    var pos = this.markerPos();
    if (pos) {
      this.beacon.position.set(pos.x, 30, pos.z);
      this.beacon.visible = true;
      this.ring.position.set(pos.x, 0.15, pos.z);
      this.ring.visible = true;
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }
  };

  Missions.prototype.advanceStep = function () {
    var m = this.mission();
    this.step++;
    this.grabProgress = 0;
    this.timer = 0;
    if (this.step >= m.steps.length) {
      this.completeMission();
      return;
    }
    var s = this.currentStep();
    if (s && s.kind === 'timed-goto') this.timer = s.seconds;
    if (G.hud) G.hud.setObjective(this.objectiveText());
    this.placeBeacon();
  };

  Missions.prototype.completeMission = function () {
    var m = this.mission();
    G.player.money += m.reward;
    G.audio.jingle();
    if (G.hud) {
      G.hud.banner('MISSION PASSED', '+$' + m.reward + ' — ' + m.title);
      G.hud.say(m.done);
      G.hud.setMoney(G.player.money);
    }
    if (G.saveGame) G.saveGame();
    this.index++;
    this.step = 0;
    this.waitNext = 2.5;
    this.beacon.visible = false;
    this.ring.visible = false;
    if (this.index >= G.MISSIONS.length) {
      this.done = true;
      if (G.hud) {
        G.hud.banner('STORY COMPLETE', 'Solmara is yours, Rook. Free roam.');
        G.hud.setObjective(this.objectiveText());
      }
    }
  };

  Missions.prototype.failStep = function (reason) {
    if (G.hud) {
      G.hud.banner('MISSION FAILED', reason);
      G.hud.say('Mara: Again. From the top, Rook.');
    }
    G.audio.busted();
    this.start(this.index);
  };

  Missions.prototype.update = function (dt, input) {
    // Beacon pulse.
    if (this.beacon.visible) {
      var s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      this.beacon.scale.set(s, 1, s);
      this.ring.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.15);
    }
    if (this.done) return;
    if (this.waitNext > 0) {
      this.waitNext -= dt;
      if (this.waitNext <= 0) {
        if (this.index < G.MISSIONS.length) this.start(this.index);
      }
      return;
    }
    var m = this.mission();
    if (!m) return;
    var s = this.currentStep();
    if (!s) return;
    var p = G.player;
    var dist = 9999;
    if (s.place) {
      var pl = G.PLACES[s.place];
      var dx = p.x - pl.x, dz = p.z - pl.z;
      dist = Math.sqrt(dx * dx + dz * dz);
    }
    if (s.kind === 'enter-car') {
      if (p.inCar) this.advanceStep();
    } else if (s.kind === 'goto') {
      if (dist < 8) {
        G.audio.pickup();
        this.advanceStep();
      }
    } else if (s.kind === 'timed-goto') {
      this.timer -= dt;
      if (dist < 8) {
        G.audio.pickup();
        this.advanceStep();
      } else if (this.timer <= 0) {
        this.failStep('Out of time — the buyer walked away.');
      }
    } else if (s.kind === 'lose-heat') {
      if (p.wanted === 0 || dist < 8) this.advanceStep();
    } else if (s.kind === 'grab') {
      if (dist < 8) {
        if (input.eHeld) {
          this.grabProgress += dt;
          if (this.grabProgress >= s.seconds) {
            if (m.grabWanted) p.setWanted(m.grabWanted);
            this.advanceStep();
          }
        } else {
          this.grabProgress = Math.max(0, this.grabProgress - dt * 2);
        }
      }
    } else if (s.kind === 'escape') {
      if (dist < 8) this.advanceStep();
    }
    if (G.hud) G.hud.setObjective(this.objectiveText());
  };

  G.Missions = Missions;
})();
