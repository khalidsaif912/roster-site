/**
 * eid-overlay.js
 * - بالونات تطير من الأسفل — اضغط عليها لتنفجر بألعاب نارية
 * - السرعة تزداد كلما طال وقت المستخدم
 * - ألعاب نارية تلقائية + بالنقر على الخلفية
 * - زر ✕ للإغلاق
 */

(function () {
  'use strict';

  var CONFIG = {
    fireworkCount:  90,
    burstInterval:  900,
    messages: [
      'عيدكم مبارك 🌙',
      'كل عام وأنتم بخير ✨',
      'تقبّل الله منا ومنكم 🤲',
      'عيد سعيد 🎉',
    ],
    msgInterval:      1400,
    schedulesBase:    'https://khalidsaif912.github.io/roster-site/schedules/',
    balloonSpawnRate: 2000,   // ms بين كل بالون جديد
    balloonSpeedMin:  3,      // ثواني للعبور (أقل = أسرع)
    balloonSpeedAccel: 0.08,  // كم تزيد السرعة كل ثانية
  };

  // ════════════════════════════════════════════
  //  🔊 Web Audio
  // ════════════════════════════════════════════
  var audioCtx = null, audioUnlocked = false;

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = audioCtx.createBuffer(1,1,22050);
      var src = audioCtx.createBufferSource();
      src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
      audioUnlocked = true;
    } catch(e) {}
  }

  function playCrackle() {
    if (!audioCtx||!audioUnlocked) return;
    try {
      var sz=audioCtx.sampleRate*.08, buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
      var d=buf.getChannelData(0);
      for(var i=0;i<sz;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/sz,3);
      var src=audioCtx.createBufferSource(); src.buffer=buf;
      var g=audioCtx.createGain();
      g.gain.setValueAtTime(.3,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.08);
      src.connect(g); g.connect(audioCtx.destination); src.start(audioCtx.currentTime);
    } catch(e) {}
  }

  function playPop() {
    if (!audioCtx||!audioUnlocked) return;
    try {
      var sz=audioCtx.sampleRate*.12, buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
      var d=buf.getChannelData(0);
      for(var i=0;i<sz;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/sz,1.5);
      var src=audioCtx.createBufferSource(); src.buffer=buf;
      var f=audioCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=800;
      var g=audioCtx.createGain();
      g.gain.setValueAtTime(.5,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);
      src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(audioCtx.currentTime);
    } catch(e) {}
  }

  function playBoom() {
    if (!audioCtx||!audioUnlocked) return;
    try {
      var sz=audioCtx.sampleRate*.7, buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
      var d=buf.getChannelData(0);
      for(var i=0;i<sz;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/sz,2);
      var src=audioCtx.createBufferSource(); src.buffer=buf;
      var f=audioCtx.createBiquadFilter(); f.type='lowpass';
      f.frequency.setValueAtTime(900,audioCtx.currentTime);
      f.frequency.exponentialRampToValueAtTime(80,audioCtx.currentTime+.6);
      var g=audioCtx.createGain();
      g.gain.setValueAtTime(.6,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.7);
      src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(audioCtx.currentTime);
      setTimeout(playCrackle,60); setTimeout(playCrackle,160);
      setTimeout(playCrackle,300); setTimeout(playCrackle,450);
    } catch(e) {}
  }

  function playLaunch() {
    if (!audioCtx||!audioUnlocked) return;
    try {
      var osc=audioCtx.createOscillator(), g=audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination); osc.type='sine';
      osc.frequency.setValueAtTime(150,audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700,audioCtx.currentTime+.3);
      g.gain.setValueAtTime(.15,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.3);
      osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime+.3);
    } catch(e) {}
  }

  // ════════════════════════════════════════════
  //  💅 CSS
  // ════════════════════════════════════════════
  var style = document.createElement('style');
  style.textContent = [
    '#eid-overlay{',
      'position:fixed;inset:0;z-index:999999;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'background:radial-gradient(ellipse at 50% 40%,#0a0a2e 0%,#000010 100%);',
      'animation:eidFadeIn .4s ease forwards;',
      'overflow:hidden;cursor:crosshair;',
      'user-select:none;-webkit-user-select:none;',
    '}',
    '@keyframes eidFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes eidFadeOut{from{opacity:1}to{opacity:0;pointer-events:none}}',
    '#eid-stars{position:absolute;inset:0;pointer-events:none;}',

    '#eid-close{',
      'position:absolute;top:16px;left:16px;z-index:20;',
      'width:38px;height:38px;border-radius:50%;',
      'background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.22);',
      'color:rgba(255,255,255,.7);font-size:18px;',
      'display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;',
    '}',
    '#eid-close:hover{background:rgba(255,255,255,.25);color:#fff;transform:scale(1.1);}',

    '#eid-sound-icon{',
      'position:absolute;top:16px;right:16px;z-index:20;',
      'width:38px;height:38px;border-radius:50%;',
      'background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.22);',
      'color:rgba(255,255,255,.5);font-size:17px;',
      'display:flex;align-items:center;justify-content:center;',
      'pointer-events:none;transition:all .4s;',
    '}',
    '#eid-sound-icon.on{color:#fde68a;border-color:rgba(253,230,138,.5);background:rgba(253,230,138,.08);}',

    '#eid-moon{',
      'font-size:clamp(50px,12vw,90px);line-height:1;margin-bottom:6px;',
      'animation:moonFloat 3s ease-in-out infinite;',
      'filter:drop-shadow(0 0 30px rgba(255,200,50,.6));',
      'position:relative;z-index:2;pointer-events:none;',
    '}',
    '@keyframes moonFloat{',
      '0%,100%{transform:translateY(0) rotate(-5deg)}',
      '50%{transform:translateY(-12px) rotate(5deg)}',
    '}',

    '#eid-name{',
      'font-family:"Amiri","Scheherazade New","Traditional Arabic",serif;',
      'font-size:clamp(18px,5vw,32px);font-weight:700;',
      'color:#fde68a;text-align:center;padding:0 20px;',
      'text-shadow:0 0 20px rgba(255,200,50,.9),0 2px 6px rgba(0,0,0,.6);',
      'letter-spacing:1px;position:relative;z-index:2;',
      'margin-bottom:4px;transition:opacity .5s ease;pointer-events:none;direction:rtl;',
    '}',

    '#eid-msg{',
      'font-family:"Amiri","Scheherazade New","Traditional Arabic",serif;',
      'font-size:clamp(26px,7vw,54px);font-weight:700;color:#fff;',
      'text-align:center;padding:0 20px;',
      'text-shadow:0 0 40px rgba(255,200,50,.8),0 2px 8px rgba(0,0,0,.6);',
      'letter-spacing:2px;position:relative;z-index:2;',
      'transition:opacity .4s ease;pointer-events:none;',
    '}',

    '#eid-tap-hint{',
      'margin-top:20px;font-family:system-ui,sans-serif;',
      'font-size:13px;color:rgba(255,255,255,.38);',
      'position:relative;z-index:2;letter-spacing:.5px;',
      'animation:hintPulse 2s ease-in-out infinite;pointer-events:none;',
    '}',
    '@keyframes hintPulse{0%,100%{opacity:.38}50%{opacity:.72}}',

    /* البالونات */
    '.eid-balloon{',
      'position:absolute;',
      'bottom:-120px;',
      'z-index:5;',
      'cursor:pointer;',
      'display:flex;flex-direction:column;align-items:center;',
      'transition:transform .1s;',
      '-webkit-tap-highlight-color:transparent;',
      'will-change:transform,bottom;',
    '}',
    '.eid-balloon:hover{transform:scale(1.15);}',
    '.eid-balloon:active{transform:scale(.9);}',

    '.eid-balloon-body{',
      'width:52px;height:64px;',
      'border-radius:50% 50% 45% 45%;',
      'position:relative;',
      'filter:drop-shadow(0 4px 8px rgba(0,0,0,.4));',
    '}',
    '.eid-balloon-body::after{',
      'content:"";',
      'position:absolute;',
      'top:12px;left:12px;',
      'width:12px;height:16px;',
      'background:rgba(255,255,255,.35);',
      'border-radius:50%;',
      'transform:rotate(-30deg);',
    '}',
    '.eid-balloon-knot{',
      'width:8px;height:8px;',
      'border-radius:50%;',
      'margin-top:-2px;',
    '}',
    '.eid-balloon-string{',
      'width:1.5px;height:40px;',
      'background:rgba(255,255,255,.4);',
      'animation:sway 2s ease-in-out infinite;',
    '}',
    '@keyframes sway{',
      '0%,100%{transform:rotate(-4deg);}',
      '50%{transform:rotate(4deg);}',
    '}',

    /* انفجار البالون */
    '@keyframes popOut{',
      '0%{transform:scale(1);opacity:1}',
      '50%{transform:scale(2.5);opacity:.5}',
      '100%{transform:scale(0);opacity:0}',
    '}',

    '.eid-spark{',
      'position:absolute;width:5px;height:5px;border-radius:50%;',
      'pointer-events:none;will-change:transform,opacity;',
    '}',
  ].join('');
  document.head.appendChild(style);

  // ════════════════════════════════════════════
  //  🏗️ DOM
  // ════════════════════════════════════════════
  var overlay = document.createElement('div');
  overlay.id = 'eid-overlay';

  var closeBtn = document.createElement('button');
  closeBtn.id = 'eid-close'; closeBtn.innerHTML = '✕';
  overlay.appendChild(closeBtn);

  var soundIcon = document.createElement('div');
  soundIcon.id = 'eid-sound-icon'; soundIcon.textContent = '🔇';
  overlay.appendChild(soundIcon);

  var starsEl = document.createElement('canvas');
  starsEl.id = 'eid-stars';
  overlay.appendChild(starsEl);

  var moon = document.createElement('div');
  moon.id = 'eid-moon'; moon.textContent = '🌙';
  overlay.appendChild(moon);

  var nameEl = document.createElement('div');
  nameEl.id = 'eid-name'; nameEl.style.display = 'none';
  overlay.appendChild(nameEl);

  var msgEl = document.createElement('div');
  msgEl.id = 'eid-msg'; msgEl.textContent = CONFIG.messages[0];
  overlay.appendChild(msgEl);

  var tapHint = document.createElement('div');
  tapHint.id = 'eid-tap-hint';
  tapHint.textContent = '🎈 انقر البالونات أو أي مكان لألعاب نارية';
  overlay.appendChild(tapHint);

  document.body.appendChild(overlay);

  // ════════════════════════════════════════════
  //  👤 اسم الموظف
  // ════════════════════════════════════════════
  var empId = localStorage.getItem('savedEmpId');
  if (empId) {
    fetch(CONFIG.schedulesBase + empId + '.json')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (d && d.name) {
          var firstName = d.name.split(' ')[0];
          nameEl.textContent = 'عيدك مبارك يا ' + firstName + ' 🎊';
          nameEl.style.display = 'block';
          nameEl.style.opacity = '0';
          setTimeout(function() { nameEl.style.opacity = '1'; }, 200);
        }
      }).catch(function() {});
  }

  // ════════════════════════════════════════════
  //  ⭐ نجوم
  // ════════════════════════════════════════════
  function drawStars() {
    var W = starsEl.width  = window.innerWidth;
    var H = starsEl.height = window.innerHeight;
    var ctx = starsEl.getContext('2d');
    for (var i = 0; i < 160; i++) {
      ctx.beginPath();
      ctx.arc(Math.random()*W, Math.random()*H, Math.random()*1.6+0.2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,220,'+(Math.random()*.7+.2)+')';
      ctx.fill();
    }
  }
  drawStars();
  window.addEventListener('resize', drawStars);

  // ════════════════════════════════════════════
  //  🎆 ألعاب نارية
  // ════════════════════════════════════════════
  var COLORS = [
    '#ff6b6b','#ffa500','#ffd700','#00ffcc',
    '#00bfff','#ff69b4','#adff2f','#ff4500',
    '#da70d6','#ffffff','#ffe066','#7fffd4',
  ];
  var BALLOON_COLORS = [
    '#ff4757','#ff6b81','#ffa502','#ffdd59',
    '#7bed9f','#70a1ff','#eccc68','#ff6348',
    '#ff4500','#ff69b4','#a29bfe','#fd79a8',
  ];

  function rand(min, max) { return min + Math.random() * (max - min); }

  function burst(cx, cy, count) {
    count = count || CONFIG.fireworkCount;
    playLaunch();
    setTimeout(function() { playBoom(); }, 250);
    for (var i = 0; i < count; i++) {
      (function(i) {
        var spark = document.createElement('div');
        spark.className = 'eid-spark';
        var color = COLORS[Math.floor(Math.random() * COLORS.length)];
        spark.style.cssText = 'left:'+cx+'px;top:'+cy+'px;background:'+color+';box-shadow:0 0 6px 2px '+color;
        overlay.appendChild(spark);
        var angle = (i/count)*Math.PI*2 + rand(-0.2,0.2);
        var speed = rand(60,220);
        var dx = Math.cos(angle)*speed, dy = Math.sin(angle)*speed;
        var dur = rand(600,1100), start = performance.now();
        function animate(now) {
          var p = Math.min((now-start)/dur,1);
          var e = 1-Math.pow(1-p,3);
          spark.style.transform = 'translate('+(dx*e)+'px,'+(dy*e+p*p*80)+'px) scale('+(1-p*.7)+')';
          spark.style.opacity = 1-p;
          if (p<1) { requestAnimationFrame(animate); }
          else if (spark.parentNode) { spark.parentNode.removeChild(spark); }
        }
        requestAnimationFrame(animate);
      })(i);
    }
  }

  function randomBurst() {
    burst(
      rand(window.innerWidth  * 0.1, window.innerWidth  * 0.9),
      rand(window.innerHeight * 0.1, window.innerHeight * 0.65)
    );
  }

  // ════════════════════════════════════════════
  //  🎈 البالونات
  // ════════════════════════════════════════════
  var startTime    = Date.now();
  var activeBalloons = [];

  function getSpeedMultiplier() {
    // السرعة تزداد كل ثانية بمقدار balloonSpeedAccel
    var elapsed = (Date.now() - startTime) / 1000; // ثواني
    return 1 + elapsed * CONFIG.balloonSpeedAccel;
  }

  function createBalloon() {
    var color     = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
    var size      = rand(44, 68);
    var xPos      = rand(5, 90); // %
    var sway      = rand(1.5, 3); // ثواني للتأرجح

    var el = document.createElement('div');
    el.className = 'eid-balloon';
    el.style.left = xPos + '%';
    el.style.bottom = '-120px';
    el.style.animationDuration = sway + 's';

    var body = document.createElement('div');
    body.className = 'eid-balloon-body';
    body.style.width  = size + 'px';
    body.style.height = (size * 1.2) + 'px';
    body.style.background = 'radial-gradient(circle at 35% 35%, ' +
      lighten(color) + ', ' + color + ')';

    var knot = document.createElement('div');
    knot.className = 'eid-balloon-knot';
    knot.style.background = darken(color);

    var string = document.createElement('div');
    string.className = 'eid-balloon-string';
    string.style.animationDelay = rand(0, 2) + 's';

    el.appendChild(body);
    el.appendChild(knot);
    el.appendChild(string);
    overlay.appendChild(el);

    // بيانات الحركة
    var balloonData = {
      el: el,
      y: -120,         // موضع من الأسفل (px)
      removed: false,
      color: color,
    };
    activeBalloons.push(balloonData);

    // الضغط على البالون
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      if (balloonData.removed) return;
      popBalloon(balloonData);
    });

    return balloonData;
  }

  function lighten(hex) {
    return hex + 'cc';
  }

  function darken(hex) {
    // تحويل بسيط للون أغمق
    try {
      var r = parseInt(hex.slice(1,3),16);
      var g = parseInt(hex.slice(3,5),16);
      var b = parseInt(hex.slice(5,7),16);
      r = Math.max(0, r-40); g = Math.max(0, g-40); b = Math.max(0, b-40);
      return '#' + ('0'+r.toString(16)).slice(-2) + ('0'+g.toString(16)).slice(-2) + ('0'+b.toString(16)).slice(-2);
    } catch(e) { return hex; }
  }

  function popBalloon(data) {
    if (data.removed) return;
    data.removed = true;

    // موضع الانفجار
    var rect = data.el.getBoundingClientRect();
    var cx = rect.left + rect.width  / 2;
    var cy = rect.top  + rect.height / 2;

    // أنيميشن الانفجار
    data.el.style.animation = 'popOut .3s ease forwards';
    playPop();

    setTimeout(function() {
      if (data.el.parentNode) data.el.parentNode.removeChild(data.el);
      // ألعاب نارية بلون البالون
      burstColored(cx, cy, 60, data.color);
    }, 150);

    // إزالة من القائمة
    activeBalloons = activeBalloons.filter(function(b) { return b !== data; });
  }

  function burstColored(cx, cy, count, baseColor) {
    playBoom();
    var colors = [baseColor, '#ffffff', '#ffd700', COLORS[Math.floor(Math.random()*COLORS.length)]];
    for (var i = 0; i < count; i++) {
      (function(i) {
        var spark = document.createElement('div');
        spark.className = 'eid-spark';
        var color = colors[Math.floor(Math.random() * colors.length)];
        spark.style.cssText = 'left:'+cx+'px;top:'+cy+'px;background:'+color+';box-shadow:0 0 6px 2px '+color;
        overlay.appendChild(spark);
        var angle = (i/count)*Math.PI*2 + rand(-0.3,0.3);
        var speed = rand(40,160);
        var dx = Math.cos(angle)*speed, dy = Math.sin(angle)*speed;
        var dur = rand(500,900), start = performance.now();
        function animate(now) {
          var p = Math.min((now-start)/dur,1);
          var e = 1-Math.pow(1-p,3);
          spark.style.transform = 'translate('+(dx*e)+'px,'+(dy*e+p*p*60)+'px) scale('+(1-p*.7)+')';
          spark.style.opacity = 1-p;
          if (p<1) { requestAnimationFrame(animate); }
          else if (spark.parentNode) { spark.parentNode.removeChild(spark); }
        }
        requestAnimationFrame(animate);
      })(i);
    }
  }

  // ════════════════════════════════════════════
  //  🎈 حركة البالونات — تسريع مع الوقت
  // ════════════════════════════════════════════
  var lastFrame = performance.now();

  function animateBalloons(now) {
    if (!running) return;
    var dt = (now - lastFrame) / 1000; // ثواني
    lastFrame = now;

    var speed = getSpeedMultiplier();
    var pxPerSec = (window.innerHeight + 200) / CONFIG.balloonSpawnRate * 1000 * speed;
    // سرعة أساسية: يقطع الشاشة في ~6 ثوان، تزيد مع الوقت
    var basePx = (window.innerHeight + 200) / 6 * speed;

    for (var i = activeBalloons.length - 1; i >= 0; i--) {
      var b = activeBalloons[i];
      if (b.removed) { activeBalloons.splice(i,1); continue; }
      b.y += basePx * dt;
      b.el.style.bottom = b.y + 'px';

      // إزالة إذا خرج من الشاشة
      if (b.y > window.innerHeight + 150) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        activeBalloons.splice(i,1);
      }
    }

    requestAnimationFrame(animateBalloons);
  }

  // إنشاء بالون كل فترة
  var balloonTimer = setInterval(function() {
    if (running) createBalloon();
  }, CONFIG.balloonSpawnRate);

  // إنشاء عدة بالونات في البداية
  setTimeout(function() { createBalloon(); }, 300);
  setTimeout(function() { createBalloon(); }, 800);
  setTimeout(function() { createBalloon(); }, 1400);

  // ════════════════════════════════════════════
  //  🔄 تناوب العبارات
  // ════════════════════════════════════════════
  var msgIdx = 0;
  var msgTimer = setInterval(function() {
    msgIdx = (msgIdx + 1) % CONFIG.messages.length;
    msgEl.style.opacity = '0';
    setTimeout(function() {
      msgEl.textContent = CONFIG.messages[msgIdx];
      msgEl.style.opacity = '1';
    }, 400);
  }, CONFIG.msgInterval);

  // ════════════════════════════════════════════
  //  👆 النقر على الخلفية = ألعاب نارية
  // ════════════════════════════════════════════
  overlay.addEventListener('click', function(e) {
    if (e.target === closeBtn) return;
    // تجاهل النقر على البالون (يعالجه البالون نفسه)
    if (e.target.closest && e.target.closest('.eid-balloon')) return;
    if (e.target.classList && e.target.classList.contains('eid-balloon')) return;

    if (!audioUnlocked) {
      unlockAudio();
      if (audioUnlocked) { soundIcon.textContent = '🔊'; soundIcon.classList.add('on'); }
    }

    var x = e.clientX || window.innerWidth  / 2;
    var y = e.clientY || window.innerHeight / 2;
    burst(x, y, 100);
    setTimeout(function() { burst(x+rand(-80,80), y+rand(-60,60), 70); }, 150);
    setTimeout(function() { burst(x+rand(-80,80), y+rand(-60,60), 70); }, 320);
  });

  // ════════════════════════════════════════════
  //  ❌ زر الإغلاق
  // ════════════════════════════════════════════
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    closeOverlay();
  });

  // الألعاب النارية التلقائية
  randomBurst();
  var burstTimer = setInterval(randomBurst, CONFIG.burstInterval);

  // بدء أنيميشن البالونات
  var running = true;
  requestAnimationFrame(animateBalloons);

  function closeOverlay() {
    running = false;
    clearInterval(msgTimer);
    clearInterval(burstTimer);
    clearInterval(balloonTimer);
    window.removeEventListener('resize', drawStars);
    overlay.style.animation = 'eidFadeOut .5s ease forwards';
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (audioCtx) { try { audioCtx.close(); } catch(e) {} }
    }, 520);
  }

})();
