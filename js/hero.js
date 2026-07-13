/* ============================================
   XSTREAM FILMS — Hero Section Script
   ============================================ */
(function () {
  'use strict';

  /* ------------------------------------------
     Configuration
     ------------------------------------------ */
  var SLIDE_INTERVAL   = 7000;
  var BACKDROP_FADE    = 1200;
  var CONTENT_FADE     = 400;
  var MAX_SLIDES       = 6;
  var REFRESH_INTERVAL = 60000; /* 1 minute */
  var CACHE_KEY        = 'xstream_hero_cache';
  var CACHE_TTL        = 60000; /* 1 minute */

  /* ------------------------------------------
     Mock Data (Shows instantly before Firebase)
     ------------------------------------------ */
  var MOCK_MOVIES = [
    {
      title: 'LOADING FEATURED',
      overview: 'Fetching the latest premium movies for you. Please wait while we connect to the server.',
      backdrop_path: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800'%3E%3Crect width='1920' height='800' fill='%23111'/%3E%3Ctext x='960' y='400' font-family='system-ui' font-size='48' fill='%23444' text-anchor='middle' dominant-baseline='middle'%3ELOADING FEATURED%3C/text%3E%3C/svg%3E",
      poster_path: '',
      release_date: '2024',
      vote_average: '--',
      genres: ['Connecting'],
      runtime: '',
      certification: '',
      director: '',
      quality: 'HD',
      trailer: '#',
      vjName: '',
      id: 'mock-1',
      source: 'description'
    },
    {
      title: 'DISCOVER NEW RELEASES',
      overview: 'Your personalized streaming experience is almost ready. New content is being loaded right now.',
      backdrop_path: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800'%3E%3Crect width='1920' height='800' fill='%230a0a0a'/%3E%3Ctext x='960' y='400' font-family='system-ui' font-size='48' fill='%23333' text-anchor='middle' dominant-baseline='middle'%3EDISCOVER NEW RELEASES%3C/text%3E%3C/svg%3E",
      poster_path: '',
      release_date: '2024',
      vote_average: '--',
      genres: ['Loading'],
      runtime: '',
      certification: '',
      director: '',
      quality: 'HD',
      trailer: '#',
      vjName: '',
      id: 'mock-2',
      source: 'description'
    }
  ];

  /* ------------------------------------------
     State
     ------------------------------------------ */
  var movies              = [];
  var currentIndex        = 0;
  var activeBackdropLayer = 'a';
  var slideTimer          = null;
  var refreshTimer        = null;
  var isTransitioning     = false;

  /* ------------------------------------------
     DOM Cache
     ------------------------------------------ */
  var els = {};

  function cacheDOM() {
    els.backdropA       = document.getElementById('backdrop-a');
    els.backdropB       = document.getElementById('backdrop-b');
    els.content         = document.getElementById('hero-content');
    els.title           = document.getElementById('hero-title');
    els.meta            = document.getElementById('hero-meta');
    els.director        = document.getElementById('hero-director');
    els.description     = document.getElementById('hero-description');
    els.btnWatch        = document.getElementById('btn-watch');
    els.btnTrailer      = document.getElementById('btn-trailer');
    els.btnWatchlist    = document.getElementById('btn-watchlist');
    els.infoRating      = document.getElementById('info-rating');
    els.infoDate        = document.getElementById('info-date');
    els.infoDirector    = document.getElementById('info-director');
    els.infoQuality     = document.getElementById('info-quality');
    els.infoQualityIcon = document.getElementById('info-quality-icon');
    els.infoPanel       = document.getElementById('hero-info-panel');
    els.dotsContainer   = document.getElementById('hero-dots');
    els.heroSection     = document.getElementById('hero');
  }

  /* ------------------------------------------
     Utilities
     ------------------------------------------ */
  function escapeHTML(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function displayYear(val) {
    if (!val) return 'N/A';
    if (typeof val === 'number') return String(val);
    var y = val.split('-')[0];
    return (y && y.length === 4) ? y : escapeHTML(val);
  }

  function getQualityIcon(quality) {
    if (!quality) return 'HD';
    var q = quality.toUpperCase();
    if (q.indexOf('4K') !== -1) return '4K';
    return 'HD';
  }

  /* ------------------------------------------
     Caching Layer (localStorage)
     ------------------------------------------ */
  function getCachedMovies() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (Date.now() - data.ts > CACHE_TTL) return null;
      return data.movies || null;
    } catch (e) {
      return null;
    }
  }

  function setCachedMovies(moviesList) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        movies: moviesList
      }));
    } catch (e) {
      /* storage full or unavailable */
    }
  }

  /* ------------------------------------------
     Firebase Fetch
     ------------------------------------------ */
  function fetchMoviesFromFirebase() {
    if (typeof database === 'undefined') {
      console.warn('Hero: database is not defined');
      return Promise.resolve([]);
    }

    var descPromise  = database.ref('description').once('value');
    var transPromise = database.ref('Translated').once('value');

    return Promise.all([descPromise, transPromise]).then(function (results) {
      var out  = [];
      var seen = {};

      function addSnapshot(snap, source) {
        snap.forEach(function (child) {
          if (child.key === 'Translated') return;
          var d = child.val();
          if (!d || !d.title) return;
          if (seen[child.key]) return;

          var img = d.thumbnailUrl || d.posterUrl || '';
          if (img.length < 10) return;

          seen[child.key] = true;
          out.push({
            title:         d.title,
            overview:      d.overview || d.description || '',
            backdrop_path: img,
            poster_path:   d.posterUrl || '',
            release_date:  d.year || '',
            vote_average:  d.rating || d.vote_average || 0,
            genres:        d.genre ? d.genre.split(',').map(function (g) { return g.trim(); }).filter(Boolean) : [],
            runtime:       d.duration || d.runtime || '',
            certification: d.rated || 'N/A',
            director:      d.director || '',
            quality:       d.quality || 'HD',
            trailer:       d.trailer || '#',
            vjName:        d.vjName || '',
            id:            child.key,
            source:        source
          });
        });
      }

      addSnapshot(results[0], 'description');
      addSnapshot(results[1], 'Translated');

      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
      }

      return out.slice(0, MAX_SLIDES);
    });
  }

  /* ------------------------------------------
     Populate Hero from Movie Object
     ------------------------------------------ */
  function populateHero(movie) {
    if (!movie) return;

    els.title.textContent = movie.title || 'Untitled';

    var metaHTML = '';
    var year = displayYear(movie.release_date);
    if (year && year !== 'N/A') {
      metaHTML += '<span class="hero-meta-item hero-meta-year">' + escapeHTML(year) + '</span>';
    }

    if (movie.genres && movie.genres.length) {
      metaHTML += '<span class="hero-meta-sep">•</span>';
      metaHTML += '<span class="hero-meta-item">' + escapeHTML(movie.genres.join(', ')) + '</span>';
    }

    if (movie.runtime) {
      metaHTML += '<span class="hero-meta-sep">•</span>';
      metaHTML += '<span class="hero-meta-item">' + escapeHTML(movie.runtime) + '</span>';
    }

    if (movie.certification && movie.certification !== 'N/A') {
      metaHTML += '<span class="hero-meta-sep">•</span>';
      metaHTML += '<span class="hero-meta-item"><span class="hero-meta-rating">' + escapeHTML(movie.certification) + '</span></span>';
    }

    if (movie.source === 'Translated' && movie.vjName) {
      metaHTML += '<span class="hero-meta-sep">•</span>';
      metaHTML += '<span class="hero-meta-item"><span class="meta-vj">' + escapeHTML(movie.vjName.replace('vj-', 'VJ ')) + '</span></span>';
    }

    els.meta.innerHTML = metaHTML;

    if (movie.director) {
      els.director.innerHTML = '<span class="hero-director-label">Directed by</span> <span class="hero-director-name">' + escapeHTML(movie.director) + '</span>';
      els.director.style.display = '';
    } else {
      els.director.style.display = 'none';
    }

    if (movie.overview) {
      els.description.textContent = movie.overview;
      els.description.style.display = '';
    } else {
      els.description.style.display = 'none';
    }

    var source = (movie.source === 'Translated') ? '&source=translated' : '';
    els.btnWatch.href = 'video.html?id=' + (movie.id || '') + source;
    els.btnTrailer.href = movie.trailer || '#';

    els.infoRating.textContent = (movie.vote_average || 'N/A') + '/10';
    els.infoDate.textContent = year;
    els.infoDirector.textContent = movie.director || 'N/A';
    els.infoQuality.textContent = movie.quality || 'HD';
    els.infoQualityIcon.textContent = getQualityIcon(movie.quality);

    els.btnWatchlist.classList.remove('added');
    els.btnWatchlist.textContent = '+';
  }

  /* ------------------------------------------
     Backdrop Crossfade
     ------------------------------------------ */
  function setBackdrop(url, instant) {
    if (!url) return;

    if (instant) {
      var layer = activeBackdropLayer === 'a' ? els.backdropA : els.backdropB;
      layer.src = url;
      layer.style.opacity = '1';
      layer.classList.add('zooming');
      return;
    }

    var nextName     = activeBackdropLayer === 'a' ? 'b' : 'a';
    var currentLayer = activeBackdropLayer === 'a' ? els.backdropA : els.backdropB;
    var nextLayer    = nextName === 'a' ? els.backdropA : els.backdropB;

    var img = new Image();
    img.onload = function () {
      nextLayer.src = url;
      nextLayer.classList.remove('zooming');
      void nextLayer.offsetWidth;
      nextLayer.classList.add('zooming');
      nextLayer.style.opacity = '1';
      currentLayer.style.opacity = '0';
      setTimeout(function () {
        currentLayer.classList.remove('zooming');
        activeBackdropLayer = nextName;
      }, BACKDROP_FADE);
    };
    img.onerror = function () {
      nextLayer.src = 'https://placehold.co/1920x800/0a0a0f/333?text=No+Image';
      nextLayer.classList.remove('zooming');
      void nextLayer.offsetWidth;
      nextLayer.classList.add('zooming');
      nextLayer.style.opacity = '1';
      currentLayer.style.opacity = '0';
    };
    img.src = url;
  }

  /* ------------------------------------------
     Build Dots
     ------------------------------------------ */
  function buildDots() {
    els.dotsContainer.innerHTML = '';
    for (var i = 0; i < movies.length; i++) {
      var dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      dot.dataset.index = i;
      els.dotsContainer.appendChild(dot);
    }
  }

  function updateDots() {
    var dots = els.dotsContainer.querySelectorAll('.hero-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === currentIndex);
    }
  }

  /* ------------------------------------------
     Slider Navigation
     ------------------------------------------ */
  function goToSlide(index) {
    if (isTransitioning || movies.length === 0) return;
    if (index < 0) index = movies.length - 1;
    if (index >= movies.length) index = 0;
    if (index === currentIndex) return;

    isTransitioning = true;
    els.content.classList.add('fading');

    setTimeout(function () {
      currentIndex = index;
      populateHero(movies[currentIndex]);
      setBackdrop(movies[currentIndex].backdrop_path, false);
      updateDots();
      els.content.classList.remove('fading');
      setTimeout(function () { isTransitioning = false; }, CONTENT_FADE);
    }, CONTENT_FADE);
  }

  function nextSlide() { goToSlide(currentIndex + 1); }

  /* ------------------------------------------
     Auto-Advance (Slides)
     ------------------------------------------ */
  function startAutoSlide() {
    stopAutoSlide();
    if (movies.length <= 1) return;
    slideTimer = setInterval(nextSlide, SLIDE_INTERVAL);
  }

  function stopAutoSlide() {
    if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
  }

  /* ------------------------------------------
     Apply Movies to Slider
     ------------------------------------------ */
  function applyMovies(moviesList) {
    movies = moviesList;
    currentIndex = 0;
    buildDots();
    populateHero(movies[0]);
    setBackdrop(movies[0].backdrop_path, true);
    startAutoSlide();
  }

  function updateSliderMovies(newMovies) {
    /* Skip update if the list is identical */
    if (movies.length === newMovies.length && movies[0] && newMovies[0] && movies[0].id === newMovies[0].id) return;

    stopAutoSlide();
    isTransitioning = true;
    els.content.classList.add('fading');

    setTimeout(function () {
      applyMovies(newMovies);
      els.content.classList.remove('fading');
      setTimeout(function () { isTransitioning = false; }, CONTENT_FADE);
    }, CONTENT_FADE);
  }

  /* ------------------------------------------
     1-Minute Auto-Refresh
     ------------------------------------------ */
  function startRefreshCycle() {
    stopRefreshCycle();
    refreshTimer = setInterval(function () {
      var cached = getCachedMovies();
      if (cached && cached.length > 0) {
        updateSliderMovies(cached);
      } else {
        fetchMoviesFromFirebase().then(function (fbMovies) {
          if (fbMovies.length > 0) {
            setCachedMovies(fbMovies);
            updateSliderMovies(fbMovies);
          }
        });
      }
    }, REFRESH_INTERVAL);
  }

  function stopRefreshCycle() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  /* ------------------------------------------
     Entrance Animations
     ------------------------------------------ */
  function triggerEntrance() {
    var animEls = document.querySelectorAll('.hero-anim');
    setTimeout(function () {
      for (var i = 0; i < animEls.length; i++) {
        animEls[i].classList.add('visible');
      }
    }, 150);
  }

  /* ------------------------------------------
     Event Listeners
     ------------------------------------------ */
  function bindEvents() {
    els.dotsContainer.addEventListener('click', function (e) {
      var dot = e.target.closest('.hero-dot');
      if (!dot) return;
      var idx = parseInt(dot.dataset.index, 10);
      if (isNaN(idx)) return;
      stopAutoSlide(); goToSlide(idx); startAutoSlide();
    });

    els.btnWatchlist.addEventListener('click', function () {
      this.classList.toggle('added');
      this.textContent = this.classList.contains('added') ? '✓' : '+';
    });

    els.heroSection.addEventListener('mouseenter', stopAutoSlide);
    els.heroSection.addEventListener('mouseleave', startAutoSlide);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { stopAutoSlide(); nextSlide(); startAutoSlide(); }
      if (e.key === 'ArrowLeft')  { stopAutoSlide(); goToSlide(currentIndex - 1); startAutoSlide(); }
    });

    var touchStartX = 0;
    els.heroSection.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    els.heroSection.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        stopAutoSlide();
        if (diff > 0) nextSlide(); else goToSlide(currentIndex - 1);
        startAutoSlide();
      }
    }, { passive: true });

    els.heroSection.addEventListener('click', function (e) {
      if (e.target.closest('.hero-dot') || e.target.closest('.hero-info-panel') ||
          e.target.closest('.hero-content') || e.target.closest('.hero-actions')) return;
      if (movies.length === 0) return;
      var movie = movies[currentIndex];
      if (!movie) return;
      /* Prevent navigating if currently showing mock data */
      if (movie.id === 'mock-1' || movie.id === 'mock-2') return;
      
      var src = movie.source === 'Translated' ? '&source=translated' : '';
      window.location.href = 'video.html?id=' + movie.id + src;
    });
  }

  /* ------------------------------------------
     Initialize
     ------------------------------------------ */
  function init() {
    cacheDOM();
    if (!els.heroSection) return;

    bindEvents();
    triggerEntrance();

    /* 0. Show mock data INSTANTLY so layout isn't empty */
    applyMovies(MOCK_MOVIES);

    /* 1. Check cache next for fast load */
    var cached = getCachedMovies();
    if (cached && cached.length > 0) {
      /* Cache hit -> replace mock data smoothly */
      updateSliderMovies(cached);
      /* Fetch in background to refresh cache for next cycle */
      fetchMoviesFromFirebase().then(function (fbMovies) {
        if (fbMovies.length > 0) setCachedMovies(fbMovies);
      });
    } else {
      /* 2. Cache miss — load from Firebase */
      fetchMoviesFromFirebase().then(function (fbMovies) {
        if (fbMovies.length > 0) {
          setCachedMovies(fbMovies);
          /* Replace mock data smoothly once loaded */
          updateSliderMovies(fbMovies);
        }
      }).catch(function (err) {
        console.error('Hero slider error:', err);
      });
    }

    /* 3. Start 1-minute refresh cycle */
    startRefreshCycle();
  }

  /* ------------------------------------------
     Boot
     ------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();