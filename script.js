(function () {
  'use strict';

  var doc = document;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var behavior = reduceMotion ? 'auto' : 'smooth';

  
  var DRIVE_VIDEOS = [
    
  ];
  var DRIVE_FOLDER_ID = '';
  var DRIVE_API_KEY = '';     

  /* Startup animation */
  var startup = doc.querySelector('.startup');
  if (startup) {
    var startupDelay = reduceMotion ? 0 : 1500;
    doc.body.classList.add('is-starting');
    window.setTimeout(function () {
      doc.body.classList.add('startup-finished');
      window.setTimeout(function () {
        doc.body.classList.remove('is-starting', 'startup-finished');
      }, reduceMotion ? 0 : 600);
    }, startupDelay);
  }

  /* 1. Header state */
  var header = doc.querySelector('.site-header');
  function onScroll() { header.classList.toggle('scrolled', window.pageYOffset > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* 2. Mobile menu */
  var toggle = doc.querySelector('.nav-toggle');
  var nav = doc.getElementById('site-nav');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    doc.body.classList.toggle('menu-open', open);
  }

  toggle.addEventListener('click', function () {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) { setMenu(false); }
  });
  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 761px)').addEventListener('change', function (event) {
    if (event.matches) { setMenu(false); }
  });

  /* 3. Active nav link */
  var sections = ['about', 'works', 'ux-ui', 'services', 'contact']
    .map(function (id) { return doc.getElementById(id); })
    .filter(Boolean);
  var navLinks = doc.querySelectorAll('.site-nav a');

  if ('IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        navLinks.forEach(function (link) {
          var sectionId = entry.target.id === 'ux-ui' ? 'works' : entry.target.id;
          var on = link.getAttribute('href') === '#' + sectionId;
          if (on) { link.setAttribute('aria-current', 'true'); } else { link.removeAttribute('aria-current'); }
        });
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    sections.forEach(function (section) { navObserver.observe(section); });
  }

  /* 4. Works sliders */

  function driveFileId(link) {
    var text = String(link).trim();
    if (/^[\w-]{20,}$/.test(text)) { return text; }
    var match = /\/d\/([\w-]+)/.exec(text) || /[?&]id=([\w-]+)/.exec(text);
    return match ? match[1] : null;
  }

  function listedDriveVideos() {
    return DRIVE_VIDEOS.map(function (item) {
      var link = typeof item === 'string' ? item : item.link;
      var ratio = (typeof item === 'object' && item.ratio) || 16 / 9;
      var id = driveFileId(link);
      if (!id) { console.warn('Not a Google Drive link, skipped:', link); }
      return { id: id, ratio: ratio };
    }).filter(function (video) { return video.id; });
  }

  function driveFolderVideos() {
    var query = "'" + DRIVE_FOLDER_ID + "' in parents and mimeType contains 'video/' and trashed = false";
    var url = 'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent(query) +
      '&fields=' + encodeURIComponent('files(id,name,videoMediaMetadata(width,height))') +
      '&orderBy=name&pageSize=100&key=' + encodeURIComponent(DRIVE_API_KEY);
    return fetch(url).then(function (response) {
      if (!response.ok) { throw new Error('Drive returned ' + response.status); }
      return response.json();
    }).then(function (data) {
      return (data.files || []).map(function (file) {
        var meta = file.videoMediaMetadata;
        return { id: file.id, ratio: (meta && meta.width && meta.height) ? meta.width / meta.height : 16 / 9 };
      });
    });
  }

  function driveVideoList() {
    if (!DRIVE_FOLDER_ID || !DRIVE_API_KEY) { return Promise.resolve(listedDriveVideos()); }
    return driveFolderVideos().then(function (list) {
      return list.length ? list : listedDriveVideos();
    }, function (error) {
      console.warn('Could not load the Drive folder, using the links list instead.', error);
      return listedDriveVideos();
    });
  }

  function driveClip(video) {
    var clip = doc.createElement('div');
    clip.className = 'clip--drive';
    clip.style.setProperty('--ratio', video.ratio);
    var frame = doc.createElement('iframe');
    frame.src = 'https://drive.google.com/file/d/' + encodeURIComponent(video.id) + '/preview';
    frame.title = 'Video project';
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    clip.appendChild(frame);
    return clip;
  }

  function loadDriveVideos(track) {
    return driveVideoList().then(function (list) {
      if (!list.length) { return; }
      track.innerHTML = '';
      list.forEach(function (video) { track.appendChild(driveClip(video)); });
    });
  }

  function initSlider(slider) {
    var track = slider.querySelector('.track');
    var slides = track.children;
    var prevBtn = slider.querySelector('[data-prev]');
    var nextBtn = slider.querySelector('[data-next]');
    var count = slider.querySelector('.count');

    // Scroll position that lines slide i up with the left edge of the track.
    // Works for slides of different widths, such as videos with different shapes.
    function slideStart(i) {
      return slides[i].getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    }

    function currentIndex() {
      var maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll > 2 && track.scrollLeft >= maxScroll - 2) { return slides.length - 1; }
      var best = 0;
      var bestDistance = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var distance = Math.abs(slideStart(i) - track.scrollLeft);
        if (distance < bestDistance) { best = i; bestDistance = distance; }
      }
      return best;
    }

    function updateSlider() {
      var maxScroll = track.scrollWidth - track.clientWidth;
      count.textContent = (currentIndex() + 1) + ' / ' + slides.length;
      prevBtn.disabled = track.scrollLeft <= 2;
      nextBtn.disabled = track.scrollLeft >= maxScroll - 2;
    }

    function go(direction) {
      var next = Math.max(0, Math.min(slides.length - 1, currentIndex() + direction));
      var maxScroll = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: Math.min(maxScroll, slideStart(next)), behavior: behavior });
    }

    var dragStartX = null;
    var dragStartScroll = null;
    var dragMoved = false;
    var suppressClick = false;

    function endDrag(event) {
      if (dragStartX === null || dragStartScroll === null) { return; }
      var deltaX = event.clientX - dragStartX;
      var threshold = Math.max(50, track.clientWidth * 0.18);
      track.classList.remove('is-dragging');
      if (dragMoved && Math.abs(deltaX) > threshold) {
        go(deltaX < 0 ? 1 : -1);
      } else if (dragMoved) {
        track.scrollTo({ left: slideStart(currentIndex()), behavior: behavior });
      }
      suppressClick = dragMoved;
      dragStartX = null;
      dragStartScroll = null;
      dragMoved = false;
    }

    function moveDrag(event) {
      if (dragStartX === null || dragStartScroll === null) { return; }
      var deltaX = event.clientX - dragStartX;
      if (Math.abs(deltaX) < 6) { return; }
      dragMoved = true;
      track.classList.add('is-dragging');
      event.preventDefault();
      track.scrollLeft = dragStartScroll - deltaX;
    }

    prevBtn.addEventListener('click', function () { go(-1); });
    nextBtn.addEventListener('click', function () { go(1); });
    track.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) { return; }
      suppressClick = false;
      dragStartX = event.clientX;
      dragStartScroll = track.scrollLeft;
      dragMoved = false;
    });
    window.addEventListener('pointermove', moveDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    track.addEventListener('click', function (event) {
      if (!suppressClick) { return; }
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, true);
    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    });
    track.addEventListener('scroll', updateSlider, { passive: true });
    window.addEventListener('resize', updateSlider);
    // A clip appears only once its real size is known, so it never shows at the wrong size first
    Array.prototype.forEach.call(track.querySelectorAll('video'), function (video) {
      function showClip() {
        video.classList.add('is-ready');
        updateSlider();
      }
      if (video.readyState >= 1) { showClip(); } else { video.addEventListener('loadedmetadata', showClip); }
    });
    updateSlider();
  }

  doc.querySelectorAll('.slider').forEach(function (slider) {
    if (slider.hasAttribute('data-drive')) {
      // Google Drive clips are added first, then the slider is set up around them
      loadDriveVideos(slider.querySelector('.track'))
        .catch(function (error) { console.warn('The video list could not be loaded.', error); })
        .then(function () { initSlider(slider); });
    } else {
      initSlider(slider);
    }
  });

  /* 5. Services accordion */
  doc.querySelectorAll('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      var panel = doc.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
  });

  /* 6. Contact form */
  var form = doc.getElementById('contact-form');
  var status = form.querySelector('.form-status');
  var submitBtn = form.querySelector('.submit');
  var rules = {
    name: function (v) { return v.trim().length >= 2 || 'Enter your name.'; },
    phone: function (v) { return !v.trim() || /^[+()\d\s-]{7,}$/.test(v.trim()) || 'Enter a valid phone number, or leave it empty.'; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter a valid email address.'; },
    message: function (v) { return v.trim().length >= 10 || 'Tell me a little more, at least 10 characters.'; },
    file_links: function (v) {
      var link = v.trim();
      if (!link) { return true; }
      try {
        var url = new URL(link);
        return (url.protocol === 'http:' || url.protocol === 'https:') || 'Enter a valid link starting with http:// or https://.';
      } catch (error) {
        return 'Enter a valid link starting with http:// or https://.';
      }
    }
  };
  var fields = Array.prototype.slice.call(form.querySelectorAll('input[name], textarea[name]'))
    .filter(function (field) { return rules[field.name]; });

  function checkField(field) {
    var result = rules[field.name](field.value);
    var ok = result === true;
    var error = doc.getElementById('e-' + field.name);
    field.setAttribute('aria-invalid', String(!ok));
    error.textContent = ok ? '' : result;
    return ok;
  }

  fields.forEach(function (field) {
    field.addEventListener('blur', function () { checkField(field); });
    field.addEventListener('input', function () {
      if (field.getAttribute('aria-invalid') === 'true') { checkField(field); }
    });
  });

  function showStatus(type, message) {
    status.className = 'form-status' + (type ? ' ' + type : '');
    status.textContent = message;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var allValid = fields.map(checkField).every(Boolean);
    if (!allValid) {
      showStatus('err', 'Please fix the highlighted fields.');
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    // Honeypot: real visitors never fill this field, so pretend it worked.
    if (form.elements.namedItem('_gotcha').value) {
      showStatus('ok', 'Thanks, your message is in.');
      form.reset();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    showStatus('', '');

    var endpoint = form.getAttribute('data-endpoint');
    var send = fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form)
    }).then(function (res) {
      if (!res.ok) { throw new Error('Request failed'); }
    });

    send.then(function () {
      form.reset();
      fields.forEach(function (field) {
        field.removeAttribute('aria-invalid');
        doc.getElementById('e-' + field.name).textContent = '';
      });
      showStatus('ok', 'Thanks, your message is in. I will reply within two working days.');
    }).catch(function () {
      showStatus('err', 'Something went wrong. Please try again, or email me directly.');
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send message';
    });
  });

  /* 7. Parallax, scroll reveals and eased section jumps */
  var root = doc.documentElement;
  var parallaxItems = [];
  var scheduled = null;
  var tweenFrame = null;
  var revealEls = [];
  var revealIO = null;

  if (!reduceMotion) { root.classList.add('has-motion'); }

  /* Layers: hero backdrop, section watermarks, photo frame, headings */
  var hero = doc.querySelector('.hero');
  if (hero && hero.style.backgroundImage) {
    var backdrop = doc.createElement('div');
    backdrop.className = 'hero-bg';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('data-parallax', '0.28');
    backdrop.setAttribute('data-bleed', '');
    backdrop.style.backgroundImage = hero.style.backgroundImage;
    hero.style.backgroundImage = 'none';
    hero.insertBefore(backdrop, hero.firstChild);
  }

  var watermarks = { about: 'About', works: 'Works', 'ux-ui': 'UX/UI', services: 'Services', contact: 'Contact' };
  Object.keys(watermarks).forEach(function (id) {
    var section = doc.getElementById(id);
    if (!section) { return; }
    var ghost = doc.createElement('span');
    ghost.className = 'ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-parallax', '0.2');
    ghost.textContent = watermarks[id];
    section.insertBefore(ghost, section.firstChild);
  });

  var photo = doc.querySelector('.about-photo');
  if (photo) {
    var frame = doc.createElement('div');
    frame.className = 'about-media';
    photo.parentNode.insertBefore(frame, photo);
    frame.appendChild(photo);
    photo.setAttribute('data-parallax', '0.12');
    photo.setAttribute('data-zoom', '1.18');
  }

  doc.querySelectorAll('.h2').forEach(function (heading) {
    heading.setAttribute('data-parallax', '0.05');
  });

  /* Scroll reveals, staggered within each group */
  var revealSel = '.about .h2, .about p, .software, .works-head, .slider, .services .h2, .acc-item, .contact-info > *, .form, .site-footer .footer-inner';
  revealEls = Array.prototype.slice.call(doc.querySelectorAll(revealSel));
  revealEls.forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.setProperty('--delay', (i % 4) * 45 + 'ms');
  });

  if (!reduceMotion && 'IntersectionObserver' in window) {
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) { el.classList.add('is-in'); return; }
        var r = entry.boundingClientRect;
        // Leaving above the viewport sends the item up; leaving below sends it down.
        // Scrolling back the other way then brings it in from that same side.
        el.style.setProperty('--reveal-y', (r.top + r.height / 2 < window.innerHeight / 2) ? '-64px' : '64px');
        el.classList.remove('is-in');
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  }

  function startReveals() {
    revealEls.forEach(function (el) {
      if (revealIO) { revealIO.observe(el); } else { el.classList.add('is-in'); }
    });
  }
  startReveals();

  /* Parallax: measure once, then only write transforms on scroll */
  function centreOf(el) {
    var top = 0;
    for (var node = el; node; node = node.offsetParent) { top += node.offsetTop; }
    return top + el.offsetHeight / 2;
  }

  function measure() {
    if (reduceMotion) { return; }
    var strength = window.innerWidth <= 760 ? 0.6 : 1;
    parallaxItems = Array.prototype.slice.call(doc.querySelectorAll('[data-parallax]')).map(function (el) {
      var zoom = parseFloat(el.getAttribute('data-zoom')) || 1;
      var limit = zoom > 1 ? el.offsetHeight * (zoom - 1) / 2 : Infinity;
      if (el.hasAttribute('data-bleed')) {
        limit = Math.max(0, (el.offsetHeight - el.parentNode.offsetHeight) / 2);
      }
      return {
        el: el,
        speed: parseFloat(el.getAttribute('data-parallax')) * strength,
        limit: limit * 0.96,
        scale: zoom > 1 ? ' scale(' + zoom + ')' : '',
        centre: centreOf(el),
        y: null
      };
    });
    update();
  }

  function update() {
    scheduled = null;
    var mid = window.innerHeight / 2;
    var scrollY = window.pageYOffset;
    parallaxItems.forEach(function (item) {
      var visual = item.centre - scrollY;
      if (Math.abs(visual - mid) > window.innerHeight * 1.2) { return; }
      // Elements above the middle drift down and elements below drift up, so each layer
      // moves at its own speed in both scroll directions.
      var y = Math.max(-item.limit, Math.min(item.limit, (mid - visual) * item.speed));
      if (item.y !== null && Math.abs(item.y - y) < 0.1) { return; }
      item.y = y;
      item.el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)' + item.scale;
    });
  }

  function requestUpdate() {
    if (!scheduled) { scheduled = window.requestAnimationFrame(update); }
  }

  /* Eased glide for nav and in-page links, so the parallax plays during the jump */
  function stopTween() {
    if (tweenFrame) { window.cancelAnimationFrame(tweenFrame); tweenFrame = null; }
  }

  function glideTo(targetY, onDone) {
    stopTween();
    var startY = window.pageYOffset;
    var dist = targetY - startY;
    if (reduceMotion || Math.abs(dist) < 2) {
      window.scrollTo(0, targetY);
      if (onDone) { onDone(); }
      return;
    }
    var duration = Math.min(850, Math.max(350, Math.abs(dist) * 0.3));
    var t0 = null;
    function step(now) {
      if (t0 === null) { t0 = now; }
      var p = Math.min(1, (now - t0) / duration);
      var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, startY + dist * eased);
      if (p < 1) { tweenFrame = window.requestAnimationFrame(step); return; }
      tweenFrame = null;
      if (onDone) { onDone(); }
    }
    tweenFrame = window.requestAnimationFrame(step);
  }

  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, stopTween, { passive: true });
  });

  doc.addEventListener('click', function (event) {
    var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
    if (!link || link.classList.contains('skip') || event.defaultPrevented) { return; }
    var id = link.getAttribute('href').slice(1);
    var target = id ? doc.getElementById(id) : null;
    if (!target) { return; }
    event.preventDefault();
    var y = target.getBoundingClientRect().top + window.pageYOffset - header.offsetHeight;
    y = Math.max(0, Math.min(y, doc.documentElement.scrollHeight - window.innerHeight));
    if (window.history && history.pushState) { history.pushState(null, '', '#' + id); }
    glideTo(y, function () {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', function () { target.removeAttribute('tabindex'); }, { once: true });
      }
      target.focus({ preventScroll: true });
    });
  });

  measure();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (doc.fonts && doc.fonts.ready) { doc.fonts.ready.then(measure); }
  // Accordion opens and closes change page height, so re-measure when <main> resizes.
  if ('ResizeObserver' in window) { new ResizeObserver(measure).observe(doc.querySelector('main')); }

  /* Footer year */
  var year = doc.getElementById('year');
  if (year) { year.textContent = new Date().getFullYear(); }
})();
