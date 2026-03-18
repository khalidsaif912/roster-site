/**
 * eid-overlay.js
 * - العبارة لا تختفي تلقائياً
 * - النقر يُطلق ألعاباً نارية إضافية ويُفعّل الصوت تلقائياً
 * - زر ✕ للإغلاق
 * لتعطيله: احذف هذا الملف من docs/
 */

(function () {
  'use strict';

  var CONFIG = {
    fireworkCount:  90,
    burstInterval:  800,
    messages: [
      'عيدكم مبارك 🌙',
      'كل عام وأنتم بخير ✨',
      'تقبّل الله منا ومنكم 🤲',
      'عيد سعيد 🎉',
    ],
    msgInterval:   1400,
    schedulesBase: 'https://khalidsaif912.github.io/roster-site/schedules/',
  };

  // ════════════════════════════════════════════
  //  🔊 Web Audio
  // ════════════════════════════════════════════
  var audioCtx      = null;
  var audioUnlocked = false;

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = audioCtx.createBuffer(1, 1, 22050);
      var src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
      audioUnlocked = true;
    } catch(e) {}
  }

  function playCrackle() {
    if (!audioCtx || !audioUnlocked) return;
    try {
      var bufSize = audioCtx.sampleRate * 0.08;
      var buffer  = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      var data    = buffer.getChannelData(0);
      for (var i = 0; i < bufSize; i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, 3);
      var source = audioCtx.createBufferSource(); source.buffer = buffer;
      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      source.connect(gain); gain.connect(audioCtx.destination); source.start(audioCtx.currentTime);
    } catch(e) {}
  }

  function playBoom() {
    if (!audioCtx || !audioUnlocked) return;
    try {
      var bufSize = audioCtx.sampleRate * 0.7;
      var buffer  = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      var data    = buffer.getChannelData(0);
      for (var i = 0; i < bufSize; i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, 2);
      var source = audioCtx.createBufferSource(); source.buffer = buffer;
      var filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.6);
      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
      source.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
      source.start(audioCtx.currentTime);
      setTimeout(playCrackle, 60);
      setTimeout(playCrackle, 160);
      setTimeout(playCrackle, 300);
      setTimeout(playCrackle, 450);
    } catch(e) {}
  }

  function playLaunch() {
    if (!audioCtx || !audioUnlocked) return;
    try {
      var osc  = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
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

    /* زر الإغلاق */
    '#eid-close{',
      'position:absolute;top:16px;left:16px;z-index:20;',
      'width:38px;height:38px;border-radius:50%;',
      'background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.22);',
      'color:rgba(255,255,255,.7);font-size:18px;',
      'display:flex;align-items:center;justify-content:center;',
      'cursor:pointer;transition:all .2s;',
      '-webkit-tap-highlight-color:transparent;',
    '}',
    '#eid-close:hover{background:rgba(255,255,255,.25);color:#fff;transform:scale(1.1);}',

    /* أيقونة الصوت في الزاوية */
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
      'margin-bottom:4px;transition:opacity .5s ease;pointer-events:none;',
    '}',

    '#eid-msg{',
      'font-family:"Amiri","Scheherazade New","Traditional Arabic",serif;',
      'font-size:clamp(26px,7vw,54px);font-weight:700;color:#fff;',
      'text-align:center;padding:0 20px;',
      'text-shadow:0 0 40px rgba(255,200,50,.8),0 2px 8px rgba(0,0,0,.6);',
      'letter-spacing:2px;position:relative;z-index:2;',
      'transition:opacity .4s ease;pointer-events:none;',
    '}',

    /* تلميح النقر */
    '#eid-tap-hint{',
      'margin-top:20px;',
      'font-family:system-ui,sans-serif;',
      'font-size:13px;color:rgba(255,255,255,.38);',
      'position:relative;z-index:2;letter-spacing:.5px;',
      'animation:hintPulse 2s ease-in-out infinite;',
      'pointer-events:none;',
    '}',
    '@keyframes hintPulse{0%,100%{opacity:.38}50%{opacity:.72}}',

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
  closeBtn.id = 'eid-close';
  closeBtn.innerHTML = '✕';
  overlay.appendChild(closeBtn);

  var soundIcon = document.createElement('div');
  soundIcon.id = 'eid-sound-icon';
  soundIcon.textContent = '🔇';
  overlay.appendChild(soundIcon);

  var starsEl = document.createElement('canvas');
  starsEl.id = 'eid-stars';
  overlay.appendChild(starsEl);

  var moon = document.createElement('div');
  moon.id = 'eid-moon';
  moon.textContent = '🌙';
  overlay.appendChild(moon);

  var nameEl = document.createElement('div');
  nameEl.id = 'eid-name';
  nameEl.style.display = 'none';
  overlay.appendChild(nameEl);

  var msgEl = document.createElement('div');
  msgEl.id = 'eid-msg';
  msgEl.textContent = CONFIG.messages[0];
  overlay.appendChild(msgEl);

  var tapHint = document.createElement('div');
  tapHint.id = 'eid-tap-hint';
  tapHint.textContent = '✨ انقر في أي مكان لألعاب نارية إضافية';
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
      })
      .catch(function() {});
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
          var p = Math.min((now-start)/dur, 1);
          var e = 1-Math.pow(1-p,3);
          spark.style.transform = 'translate('+(dx*e)+'px,'+(dy*e+p*p*80)+'px) scale('+(1-p*.7)+')';
          spark.style.opacity = 1-p;
          if (p < 1) { requestAnimationFrame(animate); }
          else if (spark.parentNode) { spark.parentNode.removeChild(spark); }
        }
        requestAnimationFrame(animate);
      })(i);
    }
  }

  function randomBurst() {
    burst(
      rand(window.innerWidth  * 0.1, window.innerWidth  * 0.9),
      rand(window.innerHeight * 0.1, window.innerHeight * 0.65),
      CONFIG.fireworkCount
    );
  }

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
  //  👆 النقر = صوت + ألعاب نارية إضافية
  // ════════════════════════════════════════════
  overlay.addEventListener('click', function(e) {
    if (e.target === closeBtn) return;

    // تفعيل الصوت عند أول نقرة
    if (!audioUnlocked) {
      unlockAudio();
      if (audioUnlocked) {
        soundIcon.textContent = '🔊';
        soundIcon.classList.add('on');
      }
    }

    var x = e.clientX || window.innerWidth  / 2;
    var y = e.clientY || window.innerHeight / 2;

    burst(x, y, 100);
    setTimeout(function() { burst(x + rand(-80,80), y + rand(-60,60), 70); }, 150);
    setTimeout(function() { burst(x + rand(-80,80), y + rand(-60,60), 70); }, 320);
  });

  // ════════════════════════════════════════════
  //  ❌ زر الإغلاق
  // ════════════════════════════════════════════
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    closeOverlay();
  });

  randomBurst();
  var burstTimer = setInterval(randomBurst, CONFIG.burstInterval);

  function closeOverlay() {
    clearInterval(msgTimer);
    clearInterval(burstTimer);
    window.removeEventListener('resize', drawStars);
    overlay.style.animation = 'eidFadeOut .5s ease forwards';
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (audioCtx) { try { audioCtx.close(); } catch(e) {} }
    }, 520);
  }

})();
