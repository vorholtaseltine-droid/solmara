// Solmara HUD: money, health, wanted stars, the mission objective, the
// subtitle line, the minimap, banners and the title / pause / end screens.
(function () {
  'use strict';

  var G = window.SOLMARA;

  function HUD() {
    var $ = function (id) { return document.getElementById(id); };
    this.el = {
      money: $('hud-money'), health: $('hud-health-fill'), healthText: $('hud-health-text'),
      stars: $('hud-stars'), objective: $('hud-objective'), subtitle: $('hud-subtitle'),
      banner: $('hud-banner'), bannerTitle: $('hud-banner-title'), bannerSub: $('hud-banner-sub'),
      minimap: $('hud-minimap'), speed: $('hud-speed'), hint: $('hud-hint'),
      flash: $('hud-flash'), crosshair: $('hud-crosshair'),
      title: $('title-screen'), pause: $('pause-screen'), end: $('end-screen'),
      endTitle: $('end-title'), endSub: $('end-sub'),
      startBtn: $('btn-start'), continueBtn: $('btn-continue'),
      resumeBtn: $('btn-resume'), restartBtn: $('btn-restart'), saveBtn: $('btn-save'),
      endBtn: $('btn-end'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.sayTimer = 0;
    this.bannerTimer = 0;
    this.bindButtons();
  }

  HUD.prototype.bindButtons = function () {
    var self = this;
    this.el.startBtn.addEventListener('click', function () { G.startGame(false); });
    this.el.continueBtn.addEventListener('click', function () { G.startGame(true); });
    this.el.resumeBtn.addEventListener('click', function () { G.resumeGame(); });
    this.el.restartBtn.addEventListener('click', function () { G.restartMission(); });
    this.el.saveBtn.addEventListener('click', function () {
      if (G.saveGame) { G.saveGame(); self.say('Game saved.'); }
    });
    this.el.endBtn.addEventListener('click', function () { G.respawnAfterEnd(); });
  };

  HUD.prototype.showTitle = function (hasSave) {
    this.el.title.style.display = 'flex';
    this.el.pause.style.display = 'none';
    this.el.end.style.display = 'none';
    this.el.continueBtn.style.display = hasSave ? 'inline-block' : 'none';
  };

  HUD.prototype.hideTitle = function () {
    this.el.title.style.display = 'none';
  };

  HUD.prototype.showPause = function (show) {
    this.el.pause.style.display = show ? 'flex' : 'none';
  };

  HUD.prototype.showEnd = function (kind) {
    this.el.end.style.display = 'flex';
    if (kind === 'busted') {
      this.el.endTitle.textContent = 'BUSTED';
      this.el.endSub.textContent = 'The Solmara PD took their cut. You keep the rest.';
    } else {
      this.el.endTitle.textContent = 'WASTED';
      this.el.endSub.textContent = 'Solmara General patched you up. It was not free.';
    }
  };

  HUD.prototype.hideEnd = function () {
    this.el.end.style.display = 'none';
  };

  HUD.prototype.setMoney = function (m) {
    this.el.money.textContent = '$' + Math.floor(m).toLocaleString('en-US');
  };

  HUD.prototype.setHealth = function (h) {
    var pct = Math.max(0, Math.min(100, h));
    this.el.health.style.width = pct + '%';
    this.el.health.style.background = pct > 50 ? '#37c24a' : (pct > 25 ? '#e6b800' : '#e5534b');
    this.el.healthText.textContent = Math.ceil(pct);
  };

  HUD.prototype.setStars = function (n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.color = n > 0 ? '#ffd23f' : 'rgba(255,255,255,0.45)';
  };

  HUD.prototype.setObjective = function (text) {
    this.el.objective.textContent = text;
  };

  HUD.prototype.setSpeed = function (kph, inCar) {
    this.el.speed.style.display = inCar ? 'block' : 'none';
    if (inCar) this.el.speed.textContent = Math.round(kph) + ' km/h';
  };

  HUD.prototype.setHint = function (text) {
    this.el.hint.textContent = text || '';
  };

  HUD.prototype.setInCar = function (inCar) {
    this.el.crosshair.style.display = inCar ? 'none' : 'block';
  };

  HUD.prototype.say = function (text, seconds) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.style.opacity = '1';
    this.sayTimer = seconds || 5;
  };

  HUD.prototype.banner = function (title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.style.opacity = '1';
    this.bannerTimer = 2.6;
  };

  HUD.prototype.damageFlash = function () {
    this.el.flash.style.opacity = '0.45';
    var self = this;
    setTimeout(function () { self.el.flash.style.opacity = '0'; }, 120);
  };

  // ---- Minimap ---------------------------------------------------------------
  HUD.prototype.drawMinimap = function () {
    var ctx = this.mm, S = 180, k = S / 400;
    function X(x) { return (x + 200) * k; }
    function Z(z) { return (z + 200) * k; }
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#141a21';
    ctx.fillRect(0, 0, S, S);
    // Water along the south edge.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, Z(186), S, S - Z(186));
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect(0, Z(150), S, Z(186) - Z(150));
    // Roads.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 14 * k;
    G.ROAD_LINES.forEach(function (L) {
      ctx.beginPath(); ctx.moveTo(X(L), 0); ctx.lineTo(X(L), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Z(L)); ctx.lineTo(S, Z(L)); ctx.stroke();
    });
    // Park.
    ctx.fillStyle = '#3d6b35';
    ctx.fillRect(X(-80), Z(40), 40 * k, 40 * k);
    // Mission marker.
    var marker = G.missions ? G.missions.markerPos() : null;
    if (marker) {
      var pulse = 1 + Math.sin(performance.now() * 0.005) * 0.25;
      ctx.save();
      ctx.translate(X(marker.x), Z(marker.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd23f';
      var r = 5 * pulse;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    // Pedestrians as faint dots.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    var peds = G.peds ? G.peds.list : [];
    for (var i = 0; i < peds.length; i++) {
      ctx.fillRect(X(peds[i].x) - 1, Z(peds[i].z) - 1, 2, 2);
    }
    // Traffic as grey dots, police flashing.
    var cars = G.traffic ? G.traffic.list : [];
    for (var j = 0; j < cars.length; j++) {
      if (cars[j].kind === 'parked') continue;
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(X(cars[j].x) - 1.5, Z(cars[j].z) - 1.5, 3, 3);
    }
    var pol = G.police ? G.police.list : [];
    var flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (var q = 0; q < pol.length; q++) {
      ctx.fillStyle = flash ? '#ff4444' : '#4488ff';
      ctx.beginPath();
      ctx.arc(X(pol[q].x), Z(pol[q].z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player's own car.
    if (G.playerCar) {
      ctx.fillStyle = '#37c24a';
      ctx.fillRect(X(G.playerCar.x) - 2, Z(G.playerCar.z) - 2, 4, 4);
    }
    // Player arrow.
    var p = G.player;
    if (p) {
      ctx.save();
      ctx.translate(X(p.x), Z(p.z));
      ctx.rotate(Math.PI - p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  };

  HUD.prototype.update = function (dt) {
    if (this.sayTimer > 0) {
      this.sayTimer -= dt;
      if (this.sayTimer <= 0) this.el.subtitle.style.opacity = '0';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.opacity = '0';
    }
    this.drawMinimap();
  };

  G.HUD = HUD;
})();
