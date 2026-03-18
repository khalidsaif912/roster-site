/**
 * eid-overlay.js
 * يظهر في كل زيارة مع ألعاب نارية وصوت وترحيب شخصي بالموظف
 * لتعطيله: احذف هذا الملف من docs/
 */

(function () {
  'use strict';

  var CONFIG = {
    duration:      5000,
    fireworkCount: 80,
    burstInterval: 700,
    messages: [
      'عيدكم مبارك 🌙',
      'كل عام وأنتم بخير ✨',
      'تقبّل الله منا ومنكم 🤲',
      'عيد سعيد 🎉',
    ],
    msgInterval:  1200,
    showMode:     'always',
    storageKey:   'eid_overlay_seen_2025',
    schedulesBase: 'https://khalidsaif912.github.io/roster-site/schedules/',
  };

  // ════════════════════════════════════════════
  //  🔊 Web Audio — صوت الألعاب النارية
  // ════════════════════════════════════════════
  var audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtx;
  }

  function playLaunch() {
    var ctx = getAudioCtx(); if (!ctx) return;
    try {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
    } catch(e) {}
  }

  function playCrackle() {
    var ctx = getAudioCtx(); if (!ctx) return;
    try {
      var bufSize = ctx.sampleRate * 0.08;
      var buffer  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      var data    = buffer.getChannelData(0);
      for (var i = 0; i < bufSize; i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, 3);
      var source = ctx.createBufferSource(); source.buffer = buffer;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      source.connect(gain); gain.connect(ctx.destination); source.start(ctx.currentTime);
    } catch(e) {}
  }

  function playBoom() {
    var ctx = getAudioCtx(); if (!ctx) return;
    try {
      var bufSize = ctx.sampleRate * 0.6;
      var buffer  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      var data    = buffer.getChannelData(0);
      for (var i = 0; i < bufSize; i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, 2);
      var source = ctx.createBufferSource(); source.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      source.start(ctx.currentTime);
      setTimeout(playCrackle, 80);
      setTimeout(playCrackle, 180);
      setTimeout(playCrackle, 300);
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
      'cursor:pointer;overflow:hidden;',
    '}',
    '@keyframes eidFadeIn{from{opacity:0}to{opacity:1}}',
    '@keyframes eidFadeOut{from{opacity:1}to{opacity:0;pointer-events:none}}',

    '#eid-stars{position:absolute;inset:0;pointer-events:none;}',

    '#eid-moon{',
      'font-size:clamp(50px,12vw,90px);line-height:1;margin-bottom:6px;',
      'animation:moonFloat 3s ease-in-out infinite;',
      'filter:drop-shadow(0 0 30px rgba(255,200,50,.6));',
      'position:relative;z-index:2;',
    '}',
    '@keyframes moonFloat{',
      '0%,100%{transform:translateY(0) rotate(-5deg)}',
      '50%{transform:translateY(-12px) rotate(5deg)}',
    '}',

    /* اسم الموظف */
    '#eid-name{',
      'font-family:"Amiri","Scheherazade New","Traditional Arabic",serif;',
      'font-size:clamp(18px,5vw,32px);font-weight:700;',
      'color:#fde68a;',
      'text-align:center;padding:0 20px;',
      'text-shadow:0 0 20px rgba(255,200,50,.9),0 2px 6px rgba(0,0,0,.6);',
      'letter-spacing:1px;position:relative;z-index:2;',
      'margin-bottom:4px;',
      'min-height:1.4em;',
      'transition:opacity .4s ease;',
    '}',

    /* العبارة الرئيسية */
    '#eid-msg{',
      'font-family:"Amiri","Scheherazade New","Traditional Arabic",serif;',
      'font-size:clamp(24px,7vw,52px);font-weight:700;color:#fff;',
      'text-align:center;padding:0 20px;',
      'text-shadow:0 0 40px rgba(255,200,50,.8),0 2px 8px rgba(0,0,0,.6);',
      'letter-spacing:2px;position:relative;z-index:2;',
      'min-height:1.3em;transition:opacity .4s ease;',
    '}',

    '#eid-hint{',
      'margin-top:24px;font-family:system-ui,sans-serif;',
      'font-size:13px;color:rgba(255,255,255,.4);',
      'position:relative;z-index:2;letter-spacing:.5px;',
    '}',

    '#eid-bar-wrap{',
      'position:absolute;bottom:0;left:0;right:0;height:4px;',
      'background:rgba(255,255,255,.1);',
    '}',
    '#eid-bar{',
      'height:100%;width:100%;',
      'background:linear-gradient(to right,#f59e0b,#fbbf24,#fde68a);',
      'transform-origin:left;',
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

  var starsEl = document.createElement('canvas');
  starsEl.id = 'eid-stars';
  overlay.appendChild(starsEl);

  var moon = document.createElement('div');
  moon.id = 'eid-moon';
  moon.textContent = '🌙';
  overlay.appendChild(moon);

  // سطر اسم الموظف (مخفي بالبداية)
  var nameEl = document.createElement('div');
  nameEl.id = 'eid-name';
  nameEl.style.display = 'none';
  overlay.appendChild(nameEl);

  var msgEl = document.createElement('div');
  msgEl.id = 'eid-msg';
  msgEl.textContent = CONFIG.messages[0];
  overlay.appendChild(msgEl);

  var hint = document.createElement('div');
  hint.id = 'eid-hint';
  hint.textContent = 'اضغط في أي مكان للمتابعة';
  overlay.appendChild(hint);

  var barWrap = document.createElement('div');
  barWrap.id = 'eid-bar-wrap';
  var bar = document.createElement('div');
  bar.id = 'eid-bar';
  barWrap.appendChild(bar);
  overlay.appendChild(barWrap);

  document.body.appendChild(overlay);

  // ════════════════════════════════════════════
  //  👤 جلب اسم الموظف من localStorage + JSON
  // ════════════════════════════════════════════
  function showEmployeeName(firstName) {
    if (!firstName) return;
    nameEl.textContent = 'عيدك مبارك يا ' + firstName + ' 🎊';
    nameEl.style.display = 'block';
    nameEl.style.opacity = '0';
    setTimeout(function() { nameEl.style.opacity = '1'; }, 100);
  }

  var empId = localStorage.getItem('savedEmpId');
  if (empId) {
    fetch(CONFIG.schedulesBase + empId + '.json')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) {
        if (d && d.name) {
          var firstName = d.name.split(' ')[0];
          showEmployeeName(firstName);
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

  function burst(cx, cy) {
    playLaunch();
    setTimeout(function() { playBoom(); }, 200);
    var count = CONFIG.fireworkCount;
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
      rand(window.innerHeight * 0.1, window.innerHeight * 0.65)
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
  //  ⏱️ شريط التقدم
  // ════════════════════════════════════════════
  var startTime = performance.now();
  function updateBar(now) {
    var ratio = Math.max(0, 1 - (now - startTime) / CONFIG.duration);
    bar.style.transform = 'scaleX(' + ratio + ')';
    if (ratio > 0) requestAnimationFrame(updateBar);
  }
  requestAnimationFrame(updateBar);

  randomBurst();
  var burstTimer = setInterval(randomBurst, CONFIG.burstInterval);

  // ════════════════════════════════════════════
  //  ❌ إغلاق
  // ════════════════════════════════════════════
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

  var autoClose = setTimeout(closeOverlay, CONFIG.duration);
  overlay.addEventListener('click', function() { clearTimeout(autoClose); closeOverlay(); });

})();
