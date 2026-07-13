/* =============================================
   Firebase & ImageKit Configuration
   ============================================= */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: ENV_CONFIG.FIREBASE_API_KEY,
  authDomain: ENV_CONFIG.FIREBASE_AUTH_DOMAIN,
  projectId: ENV_CONFIG.FIREBASE_PROJECT_ID,
  storageBucket: ENV_CONFIG.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV_CONFIG.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV_CONFIG.FIREBASE_APP_ID,
  measurementId: ENV_CONFIG.FIREBASE_MEASUREMENT_ID
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
/* =============================================
   MAINTENANCE MODE INTERCEPTOR (REDIRECTS EVERYONE)
   ============================================= */
(function() {
  // Prevent redirect loop if already on the maintenance page
  if (window.location.pathname.includes('maintenance.html')) return;
  
  var maintenanceRef = database.ref('maintenanceMode');
  
  // Safely redirect to maintenance page
  function redirectToMaintenance() {
    try { window.stop(); } catch (e) {}
    window.location.replace('maintenance.html');
  }
  
  // Listen for maintenance mode changes in real-time
  maintenanceRef.on('value', function(snapshot) {
    var mode = snapshot.val();
    var isMaintenanceActive = (mode === true || (mode && mode.isActive === true));
    
    if (isMaintenanceActive) {
      // Redirects EVERYONE immediately
      redirectToMaintenance();
    }
  });
})();


/* Compute SHA-1 hex digest using Web Crypto API (requires HTTPS) */
function computeSHA1(arrayBuffer) {
  if (!crypto || !crypto.subtle) {
    return Promise.reject(new Error('SHA-1 requires HTTPS (crypto.subtle unavailable)'));
  }
  return crypto.subtle.digest('SHA-1', arrayBuffer).then(function(hashBuffer) {
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  });
}

/* Upload a single part for large file multipart upload */
function uploadB2Part(uploadUrl, authToken, partNumber, arrayBuffer, sha1Hash) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    
    xhr.addEventListener('load', function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch (e) { reject(new Error('Invalid response for part ' + partNumber)); }
      } else {
        reject(new Error('Part ' + partNumber + ' upload failed (HTTP ' + xhr.status + ')'));
      }
    });
    
    xhr.addEventListener('error', function() {
      reject(new Error('Network error on part ' + partNumber));
    });
    
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', authToken);
    xhr.setRequestHeader('X-Bz-Part-Number', partNumber.toString());
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Bz-Content-Sha1', sha1Hash);
    xhr.send(arrayBuffer);
  });
}

/* OMDb Config (Get your free key at omdbapi.com) */
const OMDB_CONFIG = {
  apiKey: ENV_CONFIG.OMDB_API_KEY,
  apiUrl: ENV_CONFIG.OMDB_API_URL
};

/* =============================================
   State Management
   ============================================= */
const AppState = {
  currentPage: document.body.dataset.page,
  currentUser: null,
  userProfile: null,
  videosCache: [],
  lastLoadedKey: null,
  currentCategory: 'all',
  currentSort: 'recent',
  currentSearch: '',
  likedVideos: [],
  dislikedVideos: [],
  viewedVideos: [],
  favouriteVideos: [],
  itemsPerPage: 8
  
  
};

/* Load persisted state from localStorage */
try {
  AppState.likedVideos = JSON.parse(localStorage.getItem('sv_liked') || '[]');
  AppState.dislikedVideos = JSON.parse(localStorage.getItem('sv_disliked') || '[]');
  AppState.viewedVideos = JSON.parse(localStorage.getItem('sv_viewed') || '[]');
  AppState.favouriteVideos = JSON.parse(localStorage.getItem('sv_favourites') || '[]');
} catch(e) {}

function persistState() {
  try {
    localStorage.setItem('sv_liked', JSON.stringify(AppState.likedVideos));
    localStorage.setItem('sv_disliked', JSON.stringify(AppState.dislikedVideos));
    localStorage.setItem('sv_viewed', JSON.stringify(AppState.viewedVideos));
    localStorage.setItem('sv_favourites', JSON.stringify(AppState.favouriteVideos));
  } catch(e) {}
}

/* =============================================
   Utility Functions
   ============================================= */
function escapeHTML(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function getThumbnailUrl(videoData) {
  if (videoData.thumbnailUrl && videoData.thumbnailUrl.length > 10) {
    return videoData.thumbnailUrl;
  }
  var title = videoData.title || 'Video';
  var hue = (title.charCodeAt(0) * 37 + (title.charCodeAt(1) || 0) * 53) % 360;
  return 'https://placehold.co/640x360/' + hue.toString(16).padStart(3, '0') + '222/ffffff?text=' + encodeURIComponent(title.substring(0, 20));
}

function getVideoUrl(videoData) {
  if (videoData.videoUrl && videoData.videoUrl.length > 5) {
    return videoData.videoUrl;
  }
  return '';
}

/* =============================================
   Toast Notification System
   ============================================= */
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  if (!container) return;

  var icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
    '<span class="toast-message">' + message + '</span>' +
    '<button class="toast-close">&times;</button>';

  container.appendChild(toast);
  toast.querySelector('.toast-close').addEventListener('click', function() { removeToast(toast); });
  setTimeout(function() { removeToast(toast); }, 4000);
}

function removeToast(toast) {
  if (toast.classList.contains('removing')) return;
  toast.classList.add('removing');
  setTimeout(function() { toast.remove(); }, 300);
}

/* =============================================
   Navigation Builder
   ============================================= */
function buildNavigation() {
 var nav = document.getElementById('main-nav');
 if (!nav) return;
 
 var page = AppState.currentPage;
 var user = AppState.currentUser;
 var isLoggedIn = !!user;
 
 var links = [
 
 ];
 
 var activeText = 'Home';
 if (page === 'home') activeText = 'Home';
 if (page === 'viewall') activeText = 'All Movies';
 
 var authHTML = '';
 if (isLoggedIn) {
  var initial = (user.displayName || user.email || 'U')[0].toUpperCase();
  var displayName = user.displayName || 'User';
  var displayEmail = user.email || '';
  
  authHTML = '<div class="nav-user" id="nav-user">' +
   '<button class="nav-user-btn" id="nav-user-btn">' +
   '<span class="nav-avatar">' + initial + '</span>' +
   '</button>' +
   '<div class="user-dropdown" id="user-dropdown">' +
   '<div class="dropdown-user-info">' +
   '<div class="dropdown-avatar">' + initial + '</div>' +
   '<div class="dropdown-user-text">' +
   '<span class="dropdown-user-name">' + escapeHTML(displayName) + '</span>' +
   '<span class="dropdown-user-email">' + escapeHTML(displayEmail) + '</span>' +
   '</div>' +
   '</div>' +
   '<div class="dropdown-divider"></div>' +
   '<a href="profile.html" class="dropdown-item" id="dd-dashboard">' +
   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
   'My Dashboard' +
   '</a>' +
   '<div class="dropdown-divider"></div>' +
   '<button class="dropdown-item danger" id="dd-logout">' +
   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
   'Sign Out' +
   '</button>' +
   '</div>' +
   '</div>';
 } else {
  authHTML = '<a href="login.html" class="btn-outline" style="padding:7px 18px; font-size:0.85rem;">Sign In</a>' +
   '<a href="signup.html" class="btn-accent" style="padding:7px 18px; font-size:0.85rem;">Sign Up</a>';
 }
 
 var linksHTML = '';
 for (var i = 0; i < links.length; i++) {
  var l = links[i];
  var activeClass = l.text === activeText ? ' active' : '';
  linksHTML += '<a href="' + l.href + '" class="nav-link' + activeClass + '">' + l.text + '</a>';
 }
 
 nav.innerHTML = '<div class="nav-inner">' +
  '<a href="homepage.html" class="nav-logo">' +
  '<img src="https://ik.imagekit.io/s95tumxuk/IMG_2611.png?updatedAt=1780340137129" alt="XSTREAM Logo" class="nav-logo-img">' +
  'XSTRΞAM FLIMS ' +
  '</a>' +
  '<div class="nav-links">' + linksHTML + '</div>' +
  '<div class="nav-actions">' +
  '<button class="nav-icon-btn" id="nav-search-btn" title="Search">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
  '</button>' +
  authHTML +
  '<button class="nav-mobile-btn" id="nav-mobile-btn">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' +
  '</button>' +
  '</div>' +
  '</div>' +
  '<div class="nav-search-bar" id="nav-search-bar">' +
  '<div class="nav-search-inner">' +
  '<svg class="nav-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
  '<input type="text" id="nav-search-input" class="nav-search-input" placeholder="Search movies..." autocomplete="off">' +
  '<button class="nav-search-close" id="nav-search-close">&times;</button>' +
  '</div>' +
  '<div class="nav-search-results" id="nav-search-results">' +
  '<table class="search-results-table">' +
  '<thead><tr>' +
  '<th class="search-th-thumb"></th>' +
  '<th class="search-th-info">Title</th>' +
  '<th class="search-th-year">Year</th>' +
  '<th class="search-th-rating">Rating</th>' +
  '<th class="search-th-type">Type</th>' +
  '</tr></thead>' +
  '<tbody id="search-results-body"></tbody>' +
  '</table>' +
  '<div class="search-no-results" id="search-no-results" style="display:none;">No movies found</div>' +
  '<div class="search-loading" id="search-loading" style="display:none;">' +
  '<div class="search-spinner"></div>Searching...</div>' +
  '</div>' +
  '</div>';
 
 /* Mobile menu */
 var overlay = document.getElementById('mobile-overlay');
 var mobileMenu = document.getElementById('mobile-menu');
 if (overlay && mobileMenu) {
  var mobileLinks = '';
  if (isLoggedIn) {
   var mInitial = (user.displayName || user.email || 'U')[0].toUpperCase();
   var mName = user.displayName || 'User';
   mobileLinks = '<div class="mobile-user-card">' +
    '<div class="mobile-user-avatar">' + mInitial + '</div>' +
    '<div class="mobile-user-text">' +
    '<span class="mobile-user-name">' + escapeHTML(mName) + '</span>' +
    '<span class="mobile-user-email">' + escapeHTML(user.email || '') + '</span>' +
    '</div>' +
    '</div>' +
    '<a href="profile.html" class="mobile-link">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
    'My Dashboard</a>' +
    '<div style="height:1px; background:var(--border); margin:8px 0;"></div>' +
    '<a href="#" class="mobile-link mobile-link-danger" id="mobile-logout">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
    'Sign Out</a>';
  } else {
   mobileLinks = '<a href="login.html" class="mobile-link">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' +
    'Sign In</a>' +
    '<a href="signup.html" class="mobile-link">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
    'Sign Up</a>';
  }
  
  mobileMenu.innerHTML = '<a href="homepage.html" class="mobile-link' + (page === 'home' ? ' active' : '') + '">' +
   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
   'Home</a>' +
   '<a href="homepage.html?sort=trending" class="mobile-link">' +
   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
   'Trending</a>' +
   '<a href="viewall.html" class="mobile-link">' +
   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' +
   ' All Movies</a>' +
   '<div style="height:1px; background:var(--border); margin:12px 0;"></div>' +
   mobileLinks;
 }
 
 bindNavEvents();
}

function bindNavEvents() {
 /* Scroll effect */
 var handleScroll = function() {
  var nav = document.getElementById('main-nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
 };
 window.removeEventListener('scroll', handleScroll);
 window.addEventListener('scroll', handleScroll);
 handleScroll();
 
 /* Mobile menu toggle */
 var mobileBtn = document.getElementById('nav-mobile-btn');
 var overlay = document.getElementById('mobile-overlay');
 var mobileMenu = document.getElementById('mobile-menu');
 var closeMobile = function() {
  if (overlay) overlay.classList.remove('active');
  if (mobileMenu) mobileMenu.classList.remove('active');
 };
 if (mobileBtn) {
  mobileBtn.addEventListener('click', function() {
   if (overlay) overlay.classList.toggle('active');
   if (mobileMenu) mobileMenu.classList.toggle('active');
  });
 }
 if (overlay) overlay.addEventListener('click', closeMobile);
 if (mobileMenu) {
  var mobileLinks = mobileMenu.querySelectorAll('.mobile-link');
  for (var i = 0; i < mobileLinks.length; i++) {
   mobileLinks[i].addEventListener('click', closeMobile);
  }
 }
 
 /* User dropdown toggle */
 var userBtn = document.getElementById('nav-user-btn');
 var userDiv = document.getElementById('nav-user');
 if (userBtn) {
  userBtn.addEventListener('click', function(e) {
   e.stopPropagation();
   if (userDiv) userDiv.classList.toggle('open');
  });
 }
 document.addEventListener('click', function() {
  if (userDiv) userDiv.classList.remove('open');
 });
 
 /* Logout handler */
var logoutHandler = function() {
  /* Clear Casha cache before signing out so stale data
     doesn't interfere with the next login session */
  try {
    if (typeof Casha !== 'undefined') {
      if (typeof Casha.clear === 'function') Casha.clear();
      if (typeof Casha.reset === 'function') Casha.reset();
      if (typeof Casha.invalidate === 'function') Casha.invalidate();
    }
    /* Clear any Casha keys in localStorage as fallback */
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && (key.indexOf('casha') !== -1 || key.indexOf('Casha') !== -1 || key.indexOf('xstream_cache') !== -1)) {
        keysToRemove.push(key);
      }
    }
    for (var j = 0; j < keysToRemove.length; j++) {
      localStorage.removeItem(keysToRemove[j]);
    }
  } catch (e) {}
  
  auth.signOut().then(function() {
    showToast('Signed out successfully', 'success');
    window.location.href = 'login.html';
  });
};
 
 var ddLogout = document.getElementById('dd-logout');
 if (ddLogout) ddLogout.addEventListener('click', logoutHandler);
 
 var mobileLogout = document.getElementById('mobile-logout');
 if (mobileLogout) {
  mobileLogout.addEventListener('click', function(e) {
   e.preventDefault();
   closeMobile();
   logoutHandler();
  });
 }
 

 
 /* ===== Search Bar Toggle ===== */
 var searchBtn = document.getElementById('nav-search-btn');
 var searchBar = document.getElementById('nav-search-bar');
 var searchInput = document.getElementById('nav-search-input');
 var searchClose = document.getElementById('nav-search-close');
 var searchResults = document.getElementById('nav-search-results');
 
 function openSearch() {
  if (searchBar) {
   searchBar.classList.add('active');
   setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
  }
 }
 
 function closeSearch() {
  if (searchBar) searchBar.classList.remove('active');
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.style.display = 'none';
  var tbody = document.getElementById('search-results-body');
  if (tbody) tbody.innerHTML = '';
  var noRes = document.getElementById('search-no-results');
  if (noRes) noRes.style.display = 'none';
 }
 
 if (searchBtn) {
  searchBtn.addEventListener('click', function(e) {
   e.stopPropagation();
   var isOpen = searchBar && searchBar.classList.contains('active');
   if (isOpen) { closeSearch(); } else { openSearch(); }
  });
 }
 
 if (searchClose) {
  searchClose.addEventListener('click', function(e) {
   e.stopPropagation();
   closeSearch();
  });
 }
 
 document.addEventListener('click', function(e) {
  if (searchBar && searchBar.classList.contains('active')) {
   if (!searchBar.contains(e.target) && e.target !== searchBtn) {
    closeSearch();
   }
  }
 });
 
 document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && searchBar && searchBar.classList.contains('active')) {
   closeSearch();
  }
 });
 
 var searchTimeout = null;
 if (searchInput) {
  searchInput.addEventListener('input', function() {
   var query = this.value.trim();
   clearTimeout(searchTimeout);
   
   if (query.length < 2) {
    if (searchResults) searchResults.style.display = 'none';
    var tbody = document.getElementById('search-results-body');
    if (tbody) tbody.innerHTML = '';
    var noRes = document.getElementById('search-no-results');
    if (noRes) noRes.style.display = 'none';
    return;
   }
    // ADD THIS CHECK:
 if (!RateLimiter.allowSearch()) {
   if (loading) loading.style.display = 'none';
   if (noRes) {
     noRes.textContent = 'Too many searches. Please wait a moment and try again.';
     noRes.style.display = 'block';
   }
   return;
 }
   var loading = document.getElementById('search-loading');
   if (loading) loading.style.display = 'flex';
   if (searchResults) searchResults.style.display = 'block';
   var noRes = document.getElementById('search-no-results');
   if (noRes) noRes.style.display = 'none';
   
   searchTimeout = setTimeout(function() {
    performSearch(query);
   }, 400);
  });
  
  searchInput.addEventListener('keydown', function(e) {
   if (e.key === 'Enter') {
    e.preventDefault();
    var query = this.value.trim();
    if (query.length >= 2) {
     clearTimeout(searchTimeout);
     performSearch(query);
    }
   }
  });
 }
}
/* =============================================
   Search Functionality
   ============================================= */
var searchAllVideosCache = null;

function performSearch(query) {
  var tbody = document.getElementById('search-results-body');
  var noRes = document.getElementById('search-no-results');
  var loading = document.getElementById('search-loading');
  var searchResults = document.getElementById('nav-search-results');
  
  if (!tbody) return;
  
  function renderResults(videos) {
    if (loading) loading.style.display = 'none';
    if (searchResults) searchResults.style.display = 'block';
    
    var q = query.toLowerCase();
    var filtered = videos.filter(function(v) {
      return (v.title || '').toLowerCase().includes(q) ||
        (v.genre || '').toLowerCase().includes(q) ||
        (v.country || '').toLowerCase().includes(q) ||
        (v.year || '').toString().includes(q) ||
        (v.director || '').toLowerCase().includes(q);
    });
    
    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (noRes) noRes.style.display = 'block';
      return;
    }
    
    if (noRes) noRes.style.display = 'none';
    
    var shown = filtered.slice(0, 15);
    var html = '';
    for (var i = 0; i < shown.length; i++) {
      var v = shown[i];
      var id = v._id || '';
      var title = escapeHTML(v.title || 'Untitled');
      var year = escapeHTML(v.year || '—');
      var genre = escapeHTML((v.genre || '—').substring(0, 25));
      var rating = escapeHTML(v.imdbRating || '—');
      var thumb = getThumbnailUrl(v);
      var typeLabel = v._isTranslated ? '<span class="search-type-badge translated">Translated</span>' : '<span class="search-type-badge original">Original</span>';
      
      html += '<tr class="search-result-row" data-id="' + id + '">' +
        '<td class="search-result-thumb">' +
        '<img src="' + thumb + '" alt="' + title + '" loading="lazy" onerror="this.src=\'https://placehold.co/60x85/e63946/ffffff?text=N/A\'">' +
        '</td>' +
        '<td class="search-result-info">' +
        '<div class="search-result-title">' + title + '</div>' +
        '<div class="search-result-sub">' + genre + '</div>' +
        '</td>' +
        '<td class="search-result-year">' + year + '</td>' +
        '<td class="search-result-rating">' + rating + '</td>' +
        '<td>' + typeLabel + '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
    
    var rows = tbody.querySelectorAll('.search-result-row');
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener('click', function() {
        var vid = this.getAttribute('data-id');
        if (vid) window.location.href = 'video.html?id=' + vid;
      });
    }
    
    if (filtered.length > 15) {
      var viewAllRow = document.createElement('tr');
      viewAllRow.className = 'search-view-all-row';
      viewAllRow.innerHTML = '<td colspan="5"><a href="viewall.html?search=' + encodeURIComponent(query) + '">View all ' + filtered.length + ' results →</a></td>';
      viewAllRow.querySelector('a').addEventListener('click', function(e) {
        e.stopPropagation();
      });
      tbody.appendChild(viewAllRow);
    }
  }
  
  /* ── Instant: already cached from a previous search ── */
  if (searchAllVideosCache) {
    renderResults(searchAllVideosCache);
    return;
  }
  
  /* ── Instant: Casha memory already populated by prefetch ── */
  var cashaMovies = Casha.getAllMovies();
  if (cashaMovies.length > 0) {
    searchAllVideosCache = cashaMovies;
    renderResults(cashaMovies);
    return;
  }
  
  /* ── Slow path: need to fetch ── */
  if (loading) loading.style.display = 'flex';
  if (searchResults) searchResults.style.display = 'block';
  if (noRes) noRes.style.display = 'none';
  tbody.innerHTML = '';
  
  /* Try Casha first, fall back to direct Firebase if Casha fails */
  var fetchPromise;
  
  if (typeof Casha !== 'undefined' && Casha.loadAll) {
    fetchPromise = Casha.loadAll().then(function(data) {
      var combined = Casha.getAllMovies();
      if (combined.length > 0) return combined;
      /* Casha returned empty — fall through to direct Firebase */
      throw new Error('casha_empty');
    });
  } else {
    fetchPromise = Promise.reject(new Error('no_casha'));
  }
  
  fetchPromise.catch(function() {
    /* Direct Firebase fallback — original logic, untouched */
    var descPromise = database.ref('description').once('value');
    var transPromise = database.ref('Translated').once('value');
    return Promise.all([descPromise, transPromise]).then(function(results) {
      var videos = [];
      var seenIds = {};
      
      results[0].forEach(function(child) {
        if (child.key === 'Translated') return;
        var data = child.val();
        if (!data || typeof data !== 'object' || !data.title) return;
        if (seenIds[child.key]) return;
        data._id = child.key;
        data._isTranslated = false;
        videos.push(data);
        seenIds[child.key] = true;
      });
      
      results[1].forEach(function(child) {
        var data = child.val();
        if (!data || typeof data !== 'object' || !data.title) return;
        if (seenIds[child.key]) return;
        data._id = child.key;
        data._isTranslated = true;
        videos.push(data);
        seenIds[child.key] = true;
      });
      
      return videos;
    });
  }).then(function(videos) {
    if (videos && videos.length > 0) {
      searchAllVideosCache = videos;
      renderResults(videos);
    } else {
      if (loading) loading.style.display = 'none';
      if (noRes) noRes.style.display = 'block';
    }
  }).catch(function(err) {
    if (loading) loading.style.display = 'none';
    if (tbody) tbody.innerHTML = '';
    if (noRes) {
      noRes.textContent = 'Search failed. Please try again.';
      noRes.style.display = 'block';
    }
  });
}

/* =============================================
   Scroll Arrows Helper
   ============================================= */
function bindScrollArrows(trackId, leftBtnId, rightBtnId) {
  var track = document.getElementById(trackId);
  var leftBtn = document.getElementById(leftBtnId);
  var rightBtn = document.getElementById(rightBtnId);
  if (!track || !leftBtn || !rightBtn) return;
  
  var scrollAmount = 200;
  
  leftBtn.addEventListener('click', function() {
    track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });
  
  rightBtn.addEventListener('click', function() {
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });
}
/* =============================================
   Year Tags Widget — Fixed with smart routing
   ============================================= */
function buildYearTags() {
  var track = document.getElementById('year-track');
  if (!track) return;
  
  // Read initial year from URL
  var urlParams = new URLSearchParams(window.location.search);
  var initialYear = urlParams.get('year') || '';
  
  // Detect which page we're on
  var isViewAllPage = AppState.currentPage === 'viewall';
  
  function renderYears(years) {
    if (years.length === 0) {
      track.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">No years found</span>';
      return;
    }
    
    var html = '';
    
    // On viewall page: "All Years" button for clearing filter
    if (isViewAllPage) {
      html += '<button class="category-pill' + (!initialYear ? ' active' : '') + '" data-year="">All Years</button>';
    }
    
    for (var i = 0; i < years.length; i++) {
      var isActive = initialYear === years[i] ? ' active' : '';
      if (isViewAllPage) {
        // viewall.html → button with inline filter
        html += '<button class="category-pill' + isActive + '" data-year="' + years[i] + '">' + years[i] + '</button>';
      } else {
        // homepage.html → link that redirects to viewall.html
        html += '<a href="viewall.html?year=' + years[i] + '" class="category-pill' + isActive + '">' + years[i] + '</a>';
      }
    }
    track.innerHTML = html;
    
    // Only bind click handlers on viewall page (buttons)
    if (isViewAllPage) {
      var pills = track.querySelectorAll('.category-pill');
      for (var j = 0; j < pills.length; j++) {
        pills[j].addEventListener('click', handleYearClick);
      }
    }
    
    bindScrollArrows('year-track', 'year-scroll-left', 'year-scroll-right');
  }
  
  function handleYearClick() {
    var year = this.getAttribute('data-year');
    
    // Update active states
    var pills = track.querySelectorAll('.category-pill');
    for (var i = 0; i < pills.length; i++) {
      pills[i].classList.remove('active');
    }
    this.classList.add('active');
    
    // Update URL without reload
    var url = new URL(window.location);
    if (year) {
      url.searchParams.set('year', year);
    } else {
      url.searchParams.delete('year');
    }
    window.history.replaceState({}, '', url);
    
    // Clear search to avoid conflicts
    AppState.currentSearch = '';
    var navSearchInput = document.getElementById('nav-search-input');
    if (navSearchInput) navSearchInput.value = '';
    
    // Scroll pill into view
    this.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
    
    // Filter the grid
    applyDeepSearchToGrid();
  }
  
  /* ── Step 1: Try Casha instantly ── */
  try {
    if (typeof Casha !== 'undefined' && Casha.getAllMovies) {
      var movies = Casha.getAllMovies();
      if (movies && movies.length > 0) {
        var yearSet = {};
        for (var i = 0; i < movies.length; i++) {
          var y = movies[i].year;
          if (y && y.toString().length >= 4) {
            yearSet[y] = true;
          }
        }
        var years = Object.keys(yearSet).sort(function(a, b) {
          return parseInt(b) - parseInt(a);
        });
        
        if (years.length > 0) {
          renderYears(years);
          return;
        }
      }
    }
  } catch (e) {
    console.warn('[Casha] YearTags instant failed, using fallback.');
  }
  
  /* ── Step 2: Fallback to Firebase ── */
  track.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Loading...</span>';
  
  var descPromise = database.ref('description').once('value');
  var transPromise = database.ref('Translated').once('value');
  
  Promise.all([descPromise, transPromise]).then(function(results) {
    var yearSet = {};
    
    results[0].forEach(function(child) {
      if (child.key === 'Translated') return;
      var y = child.val().year;
      if (y && y.toString().length >= 4) yearSet[y] = true;
    });
    
    results[1].forEach(function(child) {
      var y = child.val().year;
      if (y && y.toString().length >= 4) yearSet[y] = true;
    });
    
    var years = Object.keys(yearSet).sort(function(a, b) {
      return parseInt(b) - parseInt(a);
    });
    
    renderYears(years);
  }).catch(function() {
    track.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Failed to load</span>';
  });
}
/* =============================================
   Footer Builder
   ============================================= */
function buildFooter() {
  var footer = document.getElementById('main-footer');
  if (!footer) return;
  
  var page = AppState.currentPage;
  var user = AppState.currentUser;
  var isLoggedIn = !!user;
  
  var activeTab = 'home';
  if (page === 'home') activeTab = 'home';
  if (page === 'series') activeTab = 'series';
  if (page === 'translated') activeTab = 'translate';
  if (page === 'live') activeTab = 'live';
  if (page === 'login' || page === 'signup' || page === 'profile') activeTab = 'login';
  
  var loginHref = isLoggedIn ? 'profile.html' : 'login.html';
  var loginLabel = 'Login';
  var loginIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
  
  if (isLoggedIn) {
    var initial = (user.displayName || user.email || 'U')[0].toUpperCase();
    var shortName = user.displayName || 'Profile';
    if (shortName.length > 8) shortName = shortName.substring(0, 8) + '.';
    loginLabel = shortName;
    loginIcon = '<span class="bottom-nav-avatar">' + initial + '</span>';
  }
  
 footer.innerHTML = '<nav class="bottom-nav" id="bottom-nav">' +
  '<a href="homepage.html" class="bottom-nav-item' + (activeTab === 'home' ? ' active' : '') + '" data-tab="home">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
  '<span>Home</span>' +
  '</a>' +
  '<a href="series.html" class="bottom-nav-item' + (activeTab === 'series' ? ' active' : '') + '" data-tab="series">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>' +
  '<span>Series</span>' +
  '</a>' +
  '<a href="translated.html" class="bottom-nav-item' + (activeTab === 'translate' ? ' active' : '') + '" data-tab="translate">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>' +
  '<span>Translate</span>' +
  '</a>' +
  '<a href="viewall.html" class="bottom-nav-item' + (activeTab === 'viewall' ? ' active' : '') + '" data-tab="viewall">' +
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' +
'</svg>' +
'<span>All Movies</span>' +
'</a>' +
  '<a href="' + loginHref + '" class="bottom-nav-item' + (activeTab === 'login' ? ' active' : '') + '" data-tab="login">' +
  loginIcon +
  '<span>' + loginLabel + '</span>' +
  '</a>' +
  '</nav>';
}
/* =============================================
   Category Pills — UI + Filter + Clear Button
   (Works on pages WITH pills AND without)
   ============================================= */
function initCategoryPills() {
  var track = document.getElementById('cat-track');
  var pills = track ? track.querySelectorAll('.category-pill') : [];
  
  for (var i = 0; i < pills.length; i++) {
    pills[i].addEventListener('click', handlePillClick);
  }
  
  function handlePillClick() {
    var category = this.getAttribute('data-category');
    var categoryText = this.textContent.trim();
    
    for (var j = 0; j < pills.length; j++) {
      pills[j].classList.remove('active');
    }
    this.classList.add('active');
    
    AppState.currentCategory = category;
    
    var catFilter = document.getElementById('category-filter');
    if (catFilter) {
      catFilter.value = category;
      var opts = catFilter.options;
      for (var k = 0; k < opts.length; k++) {
        if (opts[k].value.toLowerCase() === category.toLowerCase()) {
          catFilter.selectedIndex = k;
          break;
        }
      }
    }
    
    var recentTitle = document.getElementById('viewall-title') || document.getElementById('recent-title');
    if (recentTitle) {
      var svgIcon = recentTitle.querySelector('svg');
      var svgHtml = svgIcon ? svgIcon.outerHTML : '';
      if (category === 'all') {
        recentTitle.innerHTML = svgHtml + ' All Movies';
      } else {
        recentTitle.innerHTML = svgHtml + ' ' + categoryText + ' Movies';
      }
    }
    
    this.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
    
    applyDeepSearchToGrid();
  }
  
  /* ═══════════════════════════════════════════════
     Category dropdown — BINDS ON ALL PAGES
     Kills any broken inline onchange from HTML
     or viewall.js that references undefined
     "category" variable
     ═══════════════════════════════════════════════ */
  var catFilter = document.getElementById('category-filter');
  if (catFilter) {
    // Kill ALL existing change listeners by cloning the element
    var newCatFilter = catFilter.cloneNode(true);
    catFilter.parentNode.replaceChild(newCatFilter, catFilter);
    catFilter = newCatFilter;
    
    catFilter.addEventListener('change', function() {
      var category = this.value;
      AppState.currentCategory = category;
      
      // Sync pills if they exist
      for (var j = 0; j < pills.length; j++) {
        var pillCat = pills[j].getAttribute('data-category');
        pills[j].classList.toggle('active', pillCat === category);
      }
      
      var activePill = track ? track.querySelector('.category-pill.active') : null;
      if (activePill) {
        activePill.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest'
        });
      }
      
      // Update title
      var selectedText = this.options[this.selectedIndex].text;
      var recentTitle = document.getElementById('viewall-title') || document.getElementById('recent-title');
      if (recentTitle) {
        var svgIcon = recentTitle.querySelector('svg');
        var svgHtml = svgIcon ? svgIcon.outerHTML : '';
        if (category === 'all') {
          recentTitle.innerHTML = svgHtml + ' All Movies';
        } else {
          recentTitle.innerHTML = svgHtml + ' ' + selectedText;
        }
      }
      
      applyDeepSearchToGrid();
    });
  }
  
  /* ═══════════════════════════════════════════════
     Sort dropdown — same clone trick
     ═══════════════════════════════════════════════ */
  var sortFilter = document.getElementById('sort-filter');
  if (sortFilter) {
    var newSortFilter = sortFilter.cloneNode(true);
    sortFilter.parentNode.replaceChild(newSortFilter, sortFilter);
    sortFilter = newSortFilter;
    
    sortFilter.addEventListener('change', function() {
      AppState.currentSort = this.value;
      applyDeepSearchToGrid();
    });
  }
  
  /* ═══════════════════════════════════════════════
     Clear All button — matches viewall.html ID
     ═══════════════════════════════════════════════ */
  var clearBtn = document.getElementById('clear-all-filters') ||
    document.getElementById('clear-filters') ||
    document.getElementById('btn-clear') ||
    document.querySelector('.clear-filters-btn');
  
  if (clearBtn) {
    // Clone to kill any broken inline onclick
    var newClearBtn = clearBtn.cloneNode(true);
    clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
    clearBtn = newClearBtn;
    
    clearBtn.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Reset state
      AppState.currentCategory = 'all';
      AppState.currentSearch = '';
      AppState.currentSort = 'recent';
      
      // Reset pills
      for (var j = 0; j < pills.length; j++) {
        pills[j].classList.remove('active');
      }
      if (track) {
        var allPill = track.querySelector('.category-pill[data-category="all"]');
        if (allPill) allPill.classList.add('active');
      }
      
      // Reset dropdowns
      if (catFilter) catFilter.value = 'all';
      if (sortFilter) sortFilter.value = 'recent';
      
      // Reset search
      var navSearchInput = document.getElementById('nav-search-input');
      if (navSearchInput) navSearchInput.value = '';
      
      // Reset year pills
      var yearTrack = document.getElementById('year-track');
      if (yearTrack) {
        var yearPills = yearTrack.querySelectorAll('.category-pill');
        for (var y = 0; y < yearPills.length; y++) {
          yearPills[y].classList.remove('active');
        }
        var allYearPill = yearTrack.querySelector('.category-pill[data-year=""]');
        if (allYearPill) allYearPill.classList.add('active');
      }
      
      // Reset URL
      var url = new URL(window.location);
      url.searchParams.delete('year');
      url.searchParams.delete('search');
      url.searchParams.delete('category');
      url.searchParams.delete('sort');
      window.history.replaceState({}, '', url);
      
      // Reset title
      var recentTitle = document.getElementById('viewall-title') || document.getElementById('recent-title');
      if (recentTitle) {
        var svgIcon = recentTitle.querySelector('svg');
        var svgHtml = svgIcon ? svgIcon.outerHTML : '';
        recentTitle.innerHTML = svgHtml + ' All Movies';
      }
      
      // Hide active filters bar
      var activeFilters = document.getElementById('active-filters');
      if (activeFilters) activeFilters.style.display = 'none';
      
      applyDeepSearchToGrid();
    });
  }
  
  // Scroll arrows only if track exists
  if (track) {
    bindScrollArrows('cat-track', 'cat-scroll-left', 'cat-scroll-right');
  }
}

/* =============================================
   Deep Search — Genre-Only Category Matching
   ============================================= */
function setupDeepSearchPatch() {
  // ❌ REMOVED: No more pill click handlers here
  //    initCategoryPills() is the ONLY place that triggers filtering

  // ✅ KEEP: Search input handler only
  var searchInput = document.getElementById('nav-search-input');
  var searchTimeout;

  if (searchInput) {
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      var query = this.value.trim();
      AppState.currentSearch = query;

      // Hide the dropdown results when filtering the grid
      var searchResults = document.getElementById('nav-search-results');
      if (searchResults) searchResults.style.display = 'none';

      // Update title
      var recentTitle = document.getElementById('recent-title');
      if (recentTitle) {
        var svgIcon = recentTitle.querySelector('svg');
        var svgHtml = svgIcon ? svgIcon.outerHTML : '';
        if (query.length >= 2) {
          var displayQuery = query.charAt(0).toUpperCase() + query.slice(1);
          recentTitle.innerHTML = svgHtml + ' Search Results: ' + displayQuery + ' //';
        } else {
          recentTitle.innerHTML = svgHtml + ' Recent Movie Uploads //';
        }
      }

      searchTimeout = setTimeout(function() {
        applyDeepSearchToGrid();
      }, 400);
    });
  }
}

/* =============================================
   applyDeepSearchToGrid — The ONLY filter engine
   ============================================= */
function applyDeepSearchToGrid() {
  var grid = document.getElementById('videos-grid');
  var noVideos = document.getElementById('no-videos');
  var loadMoreContainer = document.getElementById('load-more-container');
  if (!grid) return;
  
  // Show skeleton
  grid.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>';
  
  if (noVideos) noVideos.style.display = 'none';
  if (loadMoreContainer) loadMoreContainer.style.display = 'none';
  
  var isViewAll = AppState.currentPage === 'viewall';
  
  /* ═══════════════════════════════════════════════
     NEW: Read URL parameters for year and search
     ═══════════════════════════════════════════════ */
  var urlParams = new URLSearchParams(window.location.search);
  var selectedYear = urlParams.get('year') || '';
  var urlSearch = urlParams.get('search') || '';
  
  // If search came from URL (e.g., "View all results" click), use it
  if (urlSearch && !AppState.currentSearch) {
    AppState.currentSearch = urlSearch;
  }
  
  // Update title based on year filter
  var recentTitle = document.getElementById('recent-title');
  if (recentTitle) {
    var svgIcon = recentTitle.querySelector('svg');
    var svgHtml = svgIcon ? svgIcon.outerHTML : '';
    
    if (selectedYear) {
      recentTitle.innerHTML = svgHtml + ' Movies from ' + escapeHTML(selectedYear) + ' //';
    } else if (AppState.currentSearch && AppState.currentSearch.length >= 2) {
      var displayQuery = AppState.currentSearch.charAt(0).toUpperCase() + AppState.currentSearch.slice(1);
      recentTitle.innerHTML = svgHtml + ' Search Results: ' + escapeHTML(displayQuery) + ' //';
    }
  }
  
  /* =============================================
     UNCHANGED LOGIC: Filter, Sort, Render
     ============================================= */
  function processAndRender(videos) {
    // ─── CATEGORY FILTER: genre/category fields ONLY ───
    var category = (AppState.currentCategory || 'all').toLowerCase();
    var isAll = category === 'all';
    
    var CATEGORY_MAP = {
      'action': ['action'],
      'comedy': ['comedy'],
      'drama': ['drama'],
      'horror': ['horror'],
      'thriller': ['thriller'],
      'romance': ['romance', 'romantic'],
      'sciencefiction': ['science fiction', 'sci-fi', 'scifi'],
      'scifi': ['science fiction', 'sci-fi', 'scifi'],
      'fantasy': ['fantasy'],
      'documentary': ['documentary'],
      'animation': ['animation', 'animated', 'anime'],
      'crime': ['crime'],
      'mystery': ['mystery'],
      'war': ['war'],
      'western': ['western'],
      'musical': ['musical'],
      'family': ['family'],
      'adventure': ['adventure'],
      'biography': ['biography', 'biopic'],
      'history': ['history', 'historical'],
      'bollywood': ['bollywood', 'hindi'],
      'korean': ['korean', 'korea'],
      'anime': ['anime', 'animated'],
      'translated': ['translated']
    };
    
    var searchTerms = CATEGORY_MAP[category] || [category];
    
    // ─── SEARCH FILTER ───
    var searchQuery = (AppState.currentSearch || '').toLowerCase();
    var hasSearch = searchQuery.length >= 2;
    
    var filtered = videos.filter(function(v) {
      /* ═══════════════════════════════════════════════
         NEW: Step 0 - YEAR FILTER (from URL parameter)
         ═══════════════════════════════════════════════ */
      if (selectedYear) {
        var videoYear = (v.year || '').toString().trim();
        if (videoYear !== selectedYear.trim()) {
          return false;
        }
      }
      
      // ── Step 1: Category match (genre + category fields ONLY) ──
      if (!isAll) {
        var genreRaw = (v.genre || '').toLowerCase();
        var catRaw = (v.category || '').toLowerCase();
        var genreItems = genreRaw.split(/[,;\/|]+/).map(function(g) { return g.trim(); });
        var catItems = catRaw.split(/[,;\/|]+/).map(function(c) { return c.trim(); });
        var allGenreTags = genreItems.concat(catItems);
        
        var foundGenre = false;
        for (var i = 0; i < searchTerms.length; i++) {
          var term = searchTerms[i].toLowerCase();
          for (var j = 0; j < allGenreTags.length; j++) {
            if (allGenreTags[j] === term) {
              foundGenre = true;
              break;
            }
          }
          if (foundGenre) break;
        }
        
        if (!foundGenre) return false;
      }
      
      // ── Step 2: Search match (all fields OK here — user typed it) ──
      if (hasSearch) {
        var combinedText = [
          v.title || '',
          v.description || '',
          v.genre || '',
          v.category || '',
          v.director || '',
          v.country || '',
          (v.year || '').toString()
        ].join(' ').toLowerCase();
        
        if (combinedText.indexOf(searchQuery) === -1) return false;
      }
      
      return true;
    });
    
  
    
    // ─── RENDER ───
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
      if (noVideos) {
        // Update no-videos message based on context
        var noVidMsg = noVideos.querySelector('p');
        if (noVidMsg) {
          if (selectedYear) {
            noVidMsg.textContent = 'No movies found for ' + selectedYear;
          } else if (hasSearch) {
            noVidMsg.textContent = 'No movies match "' + AppState.currentSearch + '"';
          } else {
            noVidMsg.textContent = 'Try adjusting your filters or search terms.';
          }
        }
        noVideos.style.display = 'flex';
      } else {
        grid.innerHTML = '<div class="empty-state" style="display:flex;flex-direction:column;align-items:center;grid-column:1/-1;"><h3>No movies found</h3><p>Try adjusting your filters or search terms.</p></div>';
      }
      return;
    }
    
    var limit = isViewAll ? filtered.length : (AppState.itemsPerPage || 8);
    var toShow = filtered.slice(0, limit);
    
    for (var i = 0; i < toShow.length; i++) {
      var card = createVideoCard(toShow[i]);
      grid.appendChild(card);
    }
    
    // Load More button (home page only)
    if (!isViewAll && filtered.length > limit && loadMoreContainer) {
      loadMoreContainer.style.display = 'flex';
    }
  }
  
  /* =============================================
     DATA FETCHING: Casha → Firebase Fallback
     (UNCHANGED)
     ============================================= */
  
  // 1. Instant: Try to get data already in Casha memory
  try {
    if (typeof Casha !== 'undefined' && Casha.getAllMovies) {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) {
        processAndRender(cashaMovies);
        return;
      }
    }
  } catch (e) {
    console.warn('[Casha] Instant get failed, falling back.');
  }
  
  // 2. Slow path: Try Casha fetch, fallback to original Firebase if it fails
  var fetchPromise;
  if (typeof Casha !== 'undefined' && Casha.loadAll) {
    fetchPromise = Casha.loadAll().then(function() {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) return cashaMovies;
      throw new Error('casha_empty');
    });
  } else {
    fetchPromise = Promise.reject(new Error('no_casha'));
  }
  
  fetchPromise.catch(function() {
    var descPromise = database.ref('description').once('value');
    var transPromise = database.ref('Translated').once('value');
    return Promise.all([descPromise, transPromise]).then(function(results) {
      var videos = [];
      var seenIds = {};
      
      results[0].forEach(function(child) {
        if (child.key === 'Translated') return;
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = false;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      results[1].forEach(function(child) {
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = true;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      return videos;
    });
  }).then(function(videos) {
    if (videos && videos.length > 0) {
      processAndRender(videos);
    } else {
      grid.innerHTML = '';
      if (noVideos) noVideos.style.display = 'flex';
    }
  }).catch(function(err) {
    console.error('Filter error:', err);
    grid.innerHTML = '<div class="empty-state"><h3>Error loading movies</h3></div>';
  });
}

/* =============================================
   Load / Reload Recent Videos Grid
   ============================================= */
function loadRecentVideos() {
  var grid = document.getElementById('videos-grid');
  if (!grid) return;
  
  /* ═══════════════════════════════════════════════
     Check if URL has any filter parameters
     If yes → delegate to applyDeepSearchToGrid()
     ═══════════════════════════════════════════════ */
  var urlParams = new URLSearchParams(window.location.search);
  var hasYearFilter = urlParams.has('year');
  var hasSearchFilter = urlParams.has('search');
  var hasCategoryFilter = urlParams.has('category');
  var hasSortParam = urlParams.has('sort');
  
  if (hasYearFilter || hasSearchFilter || hasCategoryFilter || hasSortParam) {
    if (hasSearchFilter) {
      AppState.currentSearch = urlParams.get('search') || '';
    }
    if (hasCategoryFilter) {
      AppState.currentCategory = urlParams.get('category') || 'all';
    }
    if (hasSortParam) {
      AppState.currentSort = urlParams.get('sort') || 'recent';
      var sortFilter = document.getElementById('sort-filter');
      if (sortFilter) sortFilter.value = AppState.currentSort;
    }
    
    applyDeepSearchToGrid();
    return;
  }
  
  /* ═══════════════════════════════════════════════
     BELOW: Original no-filter loading
     ═══════════════════════════════════════════════ */
  var noVideos = document.getElementById('no-videos');
  var loadMoreContainer = document.getElementById('load-more-container');
  
  grid.innerHTML =
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>' +
    '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>';
  
  if (noVideos) noVideos.style.display = 'none';
  if (loadMoreContainer) loadMoreContainer.style.display = 'none';
  
  function renderVideos(videos) {
    grid.innerHTML = '';
    
    /* ═══════════════════════════════════════════════
       NEW: Sort newer years first, keep upload
       order (original array index) within same year
       ═══════════════════════════════════════════════ */
    videos.sort(function(a, b) {
      var yearA = parseInt(a.year) || 0;
      var yearB = parseInt(b.year) || 0;
      if (yearB !== yearA) return yearB - yearA;
      return 0; // Same year → keep original order (newest uploads first)
    });
    
    var limit = AppState.itemsPerPage || 8;
    var toShow = videos.slice(0, limit);
    
    if (toShow.length === 0) {
      if (noVideos) noVideos.style.display = 'flex';
      return;
    }
    
    for (var i = 0; i < toShow.length; i++) {
      var card = createVideoCard(toShow[i]);
      grid.appendChild(card);
    }
    
    if (videos.length > limit && loadMoreContainer) {
      loadMoreContainer.style.display = 'flex';
    }
  }
  
  // 1. Instant: Try Casha memory
  try {
    if (typeof Casha !== 'undefined' && Casha.getAllMovies) {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) {
        renderVideos(cashaMovies);
        return;
      }
    }
  } catch (e) {
    console.warn('[Casha] loadRecentVideos instant get failed, falling back.');
  }
  
  // 2. Slow path: Casha fetch → Firebase fallback
  var fetchPromise;
  if (typeof Casha !== 'undefined' && Casha.loadAll) {
    fetchPromise = Casha.loadAll().then(function() {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) return cashaMovies;
      throw new Error('casha_empty');
    });
  } else {
    fetchPromise = Promise.reject(new Error('no_casha'));
  }
  
  fetchPromise.catch(function() {
    var descPromise = database.ref('description').once('value');
    var transPromise = database.ref('Translated').once('value');
    return Promise.all([descPromise, transPromise]).then(function(results) {
      var videos = [];
      var seenIds = {};
      
      results[0].forEach(function(child) {
        if (child.key === 'Translated') return;
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = false;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      results[1].forEach(function(child) {
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = true;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      return videos;
    });
  }).then(function(videos) {
    if (videos && videos.length > 0) {
      renderVideos(videos);
    } else {
      grid.innerHTML = '';
      if (noVideos) {
        var h3 = noVideos.querySelector('h3');
        if (h3) h3.textContent = 'No movies found';
        noVideos.style.display = 'flex';
      }
    }
  }).catch(function(err) {
    console.error('loadRecentVideos error:', err);
    grid.innerHTML = '';
    if (noVideos) {
      var h3 = noVideos.querySelector('h3');
      if (h3) h3.textContent = 'Failed to load movies';
      noVideos.style.display = 'flex';
    }
  });
}


/* =============================================
   Load Popular Widget — Newest First
   ============================================= */
function loadPopular() {
  var container = document.getElementById('popular-videos-widget');
  if (!container) return;
  
  // Show loading state
  container.innerHTML = '<div class="popular-card skeleton-popular"><div class="skeleton skeleton-thumb" style="height:140px;"></div></div>'.repeat(5);
  
  var maxItems = 40;
  
  function renderPopular(videos) {
    container.innerHTML = '';
    
    if (videos.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No movies yet.</p>';
      return;
    }
    
    // ─── Sort: Newest first ───
    videos.sort(function(a, b) {
      var timeA = a.createdAt || a.uploadedAt || a.timestamp || 0;
      var timeB = b.createdAt || b.uploadedAt || b.timestamp || 0;
      if (timeA && timeB) return timeB - timeA;
      if (timeA && !timeB) return -1;
      if (timeB && !timeA) return 1;
      // No timestamp — use Firebase push key (reverse = newest first)
      var keyA = a._id || '';
      var keyB = b._id || '';
      if (keyB > keyA) return 1;
      if (keyB < keyA) return -1;
      return 0;
    });
    
    // ─── Render ───
    var limit = Math.min(videos.length, maxItems);
    for (var j = 0; j < limit; j++) {
      (function(v) {
        var id = v._id || '';
        var isTrans = v._isTranslated === true;
        var thumb = getThumbnailUrl(v);
        var title = escapeHTML(v.title || 'Untitled');
        var link = 'video.html?id=' + id + (isTrans ? '&source=translated' : '');
        
        var card = document.createElement('div');
        card.className = 'popular-card';
        card.innerHTML = '<div class="popular-thumb">' +
          '<img src="' + thumb + '" alt="' + title + '" loading="lazy" onerror="this.src=\'https://placehold.co/160x220/e63946/ffffff?text=N/A\'">' +
          '<div class="popular-overlay">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
          '</div>';
        
        card.addEventListener('click', function() {
          window.location.href = link;
        });
        container.appendChild(card);
      })(videos[j]);
    }
  }
  
  // ─── Data Fetching: Casha → Firebase Fallback ───
  
  // 1. Instant: Casha memory
  try {
    if (typeof Casha !== 'undefined' && Casha.getAllMovies) {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) {
        renderPopular(cashaMovies);
        return;
      }
    }
  } catch (e) {
    console.warn('[Casha] loadPopular instant failed, falling back.');
  }
  
  // 2. Slow path: Casha fetch → Firebase fallback
  var fetchPromise;
  if (typeof Casha !== 'undefined' && Casha.loadAll) {
    fetchPromise = Casha.loadAll().then(function() {
      var cashaMovies = Casha.getAllMovies();
      if (cashaMovies && cashaMovies.length > 0) return cashaMovies;
      throw new Error('casha_empty');
    });
  } else {
    fetchPromise = Promise.reject(new Error('no_casha'));
  }
  
  fetchPromise.catch(function() {
    var descPromise = database.ref('description').once('value');
    var transPromise = database.ref('Translated').once('value');
    return Promise.all([descPromise, transPromise]).then(function(results) {
      var videos = [];
      var seenIds = {};
      
      results[0].forEach(function(child) {
        if (child.key === 'Translated') return;
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = false;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      results[1].forEach(function(child) {
        var data = child.val();
        if (data && data.title && !seenIds[child.key]) {
          data._id = child.key;
          data._isTranslated = true;
          videos.push(data);
          seenIds[child.key] = true;
        }
      });
      
      return videos;
    });
  }).then(function(videos) {
    if (videos && videos.length > 0) {
      renderPopular(videos);
    } else {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No movies yet.</p>';
    }
  }).catch(function(err) {
    console.error('loadPopular error:', err);
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Failed to load.</p>';
  });
}
// ====== Popular Movies Auto-Slide Widget ======
(function() {
  const track = document.getElementById('popular-track');
  const list = document.getElementById('popular-videos-widget');
  const btnLeft = document.getElementById('popular-scroll-left');
  const btnRight = document.getElementById('popular-scroll-right');
  
  if (!track || !list) return;
  
  let scrollPos = 0;
  let autoSpeed = 0.5;
  let isPaused = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragScrollStart = 0;
  let animFrameId = null;
  let resumeTimeout = null;
  let maxScroll = 0;
  
  function calcMaxScroll() {
    maxScroll = Math.max(0, list.scrollWidth - track.clientWidth);
    return maxScroll;
  }
  
  function autoSlide() {
    if (!isPaused && !isDragging) {
      scrollPos += autoSpeed;
      if (scrollPos >= calcMaxScroll()) {
        scrollPos = 0;
      }
      list.style.transform = `translateX(-${scrollPos}px)`;
    }
    animFrameId = requestAnimationFrame(autoSlide);
  }
  
  animFrameId = requestAnimationFrame(autoSlide);
  
  track.addEventListener('mouseenter', () => {
    isPaused = true;
    clearTimeout(resumeTimeout);
  });
  track.addEventListener('mouseleave', () => {
    clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(() => { isPaused = false; }, 800);
  });
  
  track.addEventListener('touchstart', () => {
    isPaused = true;
    clearTimeout(resumeTimeout);
  }, { passive: true });
  
  track.addEventListener('touchend', () => {
    clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(() => { isPaused = false; }, 1500);
  });
  
  track.addEventListener('mousedown', (e) => {
    isDragging = true;
    isPaused = true;
    clearTimeout(resumeTimeout);
    dragStartX = e.clientX;
    dragScrollStart = scrollPos;
    track.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const diff = dragStartX - e.clientX;
    scrollPos = Math.max(0, Math.min(calcMaxScroll(), dragScrollStart + diff));
    list.style.transform = `translateX(-${scrollPos}px)`;
  });
  
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    track.style.cursor = '';
    clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(() => { isPaused = false; }, 2000);
  });
  
  let touchStartX = 0;
  let touchScrollStart = 0;
  
  track.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchScrollStart = scrollPos;
  }, { passive: true });
  
  track.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const diff = touchStartX - e.touches[0].clientX;
    scrollPos = Math.max(0, Math.min(calcMaxScroll(), touchScrollStart + diff));
    list.style.transform = `translateX(-${scrollPos}px)`;
  }, { passive: true });
  
  const ARROW_STEP = 380;
  
  if (btnLeft) {
    btnLeft.addEventListener('click', () => {
      isPaused = true;
      clearTimeout(resumeTimeout);
      scrollPos = Math.max(0, scrollPos - ARROW_STEP);
      list.style.transform = `translateX(-${scrollPos}px)`;
      resumeTimeout = setTimeout(() => { isPaused = false; }, 2000);
    });
  }
  
  if (btnRight) {
    btnRight.addEventListener('click', () => {
      isPaused = true;
      clearTimeout(resumeTimeout);
      scrollPos = Math.min(calcMaxScroll(), scrollPos + ARROW_STEP);
      list.style.transform = `translateX(-${scrollPos}px)`;
      resumeTimeout = setTimeout(() => { isPaused = false; }, 2000);
    });
  }
  
  function refreshArrows() {
    if (!btnLeft || !btnRight) return;
    btnLeft.classList.toggle('dimmed', scrollPos <= 4);
    btnRight.classList.toggle('dimmed', scrollPos >= calcMaxScroll() - 4);
  }
  
  setInterval(refreshArrows, 200);
  setTimeout(refreshArrows, 100);
  
  window.addEventListener('resize', () => {
    calcMaxScroll();
    if (scrollPos > maxScroll) {
      scrollPos = Math.max(0, maxScroll);
      list.style.transform = `translateX(-${scrollPos}px)`;
    }
  });
  
  // ── RENDER — poster only, sorted by year, NO LIMIT ──
  window.renderPopularWidget = function(movies) {
    list.innerHTML = '';
    
    if (!movies || movies.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;padding:20px;width:100%;">No popular movies yet.</p>';
      return;
    }
    
    // Sort newest year first
    const sorted = [...movies].sort((a, b) => {
      return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    });
    
    // Render ALL movies — no slice, no limit
    sorted.forEach((movie) => {
      const card = document.createElement('div');
      card.className = 'popular-card';
      
      // ✅ FIXED: Correct URL structure matching video.html?id=...
      card.onclick = () => {
        const movieId = movie.id || movie._id; // Supports both ID formats
        if (movieId) {
          window.location.href = 'video.html?id=' + movieId;
        }
      };
      
      const rating = movie.rating || movie.imdb_rating || movie.imdbRating || '';
      const isTranslated = movie.translated || movie.is_translated || movie._isTranslated || false;
      const thumb = movie.thumbnail || movie.poster || movie.thumbnailUrl || '';
      
      // POSTER ONLY — no title, no meta, no views
      card.innerHTML = `
        <div class="popular-card-thumb">
          ${thumb
            ? `<img src="${thumb}" alt="${movie.title || ''}" loading="lazy">`
            : '<div class="skeleton skeleton-popular-thumb"></div>'}
          ${isTranslated ? '<span class="popular-card-badge">Translated</span>' : ''}
          ${rating ? `<span class="popular-card-rating"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>${rating}</span>` : ''}
        </div>
      `;
      
      list.appendChild(card);
    });
    
    // Clone first batch for seamless infinite loop
    const allCards = list.querySelectorAll('.popular-card');
    if (allCards.length > 0) {
      const cardWidth = allCards[0].offsetWidth + 14;
      const visibleCount = Math.ceil(track.clientWidth / cardWidth) + 2;
      for (let i = 0; i < Math.min(visibleCount, allCards.length); i++) {
        const clone = allCards[i].cloneNode(true);
        clone.classList.add('popular-card-clone');
        clone.removeAttribute('onclick'); // Remove click from clones so they don't cause bugs at the end of the scroll
        list.appendChild(clone);
      }
    }
    
    scrollPos = 0;
    list.style.transform = 'translateX(0)';
    calcMaxScroll();
  };
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animFrameId);
    } else {
      animFrameId = requestAnimationFrame(autoSlide);
    }
    
  });
})();

/* =============================================
   Auth State Observer
   ============================================= */
function initAuthState(onReady) {
  auth.onAuthStateChanged(function(user) {
    AppState.currentUser = user;
    
  
    
    // ✅ View All page gets unlimited items
    if (AppState.currentPage === 'viewall') {
      AppState.itemsPerPage = 99999;
    } else {
      AppState.itemsPerPage = 8;
    }
    
    var proceed = function() {
      buildNavigation();
      buildFooter();
      
      if (AppState.currentPage === 'home' || AppState.currentPage === 'viewall') {
        initCategoryPills();
        loadRecentVideos();
        setupDeepSearchPatch();
        loadPopular();
      }
      
      if (typeof onReady === 'function') onReady();
    };
    
    if (user) {
      database.ref('userAccounts/' + user.uid).once('value').then(function(snap) {
        AppState.userProfile = snap.val() || null;
        proceed();
      }).catch(function() {
        AppState.userProfile = null;
        proceed();
      });
    } else {
      AppState.userProfile = null;
      proceed();
    }
  });
}

/* =============================================
   Helper: Format Numbers & Dates
   ============================================= */
function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  num = parseInt(num);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  var d = new Date(timestamp);
  var now = new Date();
  var diff = now - d;
  var mins = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days = Math.floor(diff / 86400000);
  var months = Math.floor(days / 30);
  var years = Math.floor(days / 365);

  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + ' min ago';
  if (hours < 24) return hours + 'h ago';
  if (days < 30) return days + 'd ago';
  if (months < 12) return months + 'mo ago';
  return years + 'y ago';
}

/* =============================================
   OMDb Integration
   ============================================= */
var omdbCache = {};

function fetchOmdbData(title) {
  if (!title || title.length < 2) return Promise.resolve(null);
  var key = title.toLowerCase().trim();
  
  if (omdbCache[key]) {
    return Promise.resolve(omdbCache[key]);
  }
  
  return fetch(OMDB_CONFIG.apiUrl + '?t=' + encodeURIComponent(title) + '&apikey=' + OMDB_CONFIG.apiKey + '&type=movie')
    .then(function(response) { return response.json(); })
    .then(function(data) {
      if (data.Response === 'True') {
        var result = {
          poster: data.Poster !== 'N/A' ? data.Poster : null,
          year: data.Year || '',
          genre: data.Genre || '',
          rated: data.Rated || '',
          imdbRating: data.imdbRating || '',
          runtime: data.Runtime || '',
          director: data.Director || ''
        };
        omdbCache[key] = result;
        return result;
      }
      return null;
    })
    .catch(function() {
      return null;
    });
}
/* =============================================
   Video Card Builder
   ============================================= */
function createVideoCard(videoData, size) {
  var id = videoData._id || '';
  var thumb = getThumbnailUrl(videoData);
  var title = videoData.title || 'Untitled Video';
  var views = formatNumber(videoData.views || 0);
  var likes = formatNumber(videoData.likes || 0);
  var dislikes = formatNumber(videoData.dislikes || 0);
  var country = videoData.country || '';
  var year = videoData.year || '';
  var genre = videoData.genre || '';
  var rated = videoData.rated || '';
  var imdbRating = videoData.imdbRating || '';
  var runtime = videoData.runtime || '';
  var isTranslated = videoData._isTranslated === true;
  var vjName = videoData.vjName || '';
  var safeTitle = escapeHTML(title);
  var isFav = AppState.favouriteVideos.indexOf(id) >= 0;
  
  var card = document.createElement('article');
  card.className = 'video-card';
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', title);
  
  /* Build metadata badges */
  var metaBadges = '';
  if (year) metaBadges += '<span class="card-meta-year">' + escapeHTML(year) + '</span>';
  if (rated && rated !== 'N/A') metaBadges += '<span class="card-meta-rated">' + escapeHTML(rated) + '</span>';
  if (runtime && runtime !== 'N/A') metaBadges += '<span class="card-meta-runtime">' + escapeHTML(runtime) + '</span>';
  if (imdbRating && imdbRating !== 'N/A') metaBadges += '<span class="card-meta-imdb"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg> ' + escapeHTML(imdbRating) + '</span>';
  if (isTranslated && vjName) metaBadges += '<span class="card-vj-name">' + escapeHTML(vjName) + '</span>';
  
  var metaHTML = metaBadges ? '<div class="card-meta-badges">' + metaBadges + '</div>' : '';
  
  /* Truncate genre if too long */
  var genreDisplay = genre;
  if (genreDisplay.length > 40) genreDisplay = genreDisplay.substring(0, 40) + '...';
  var genreHTML = genre ? '<span class="card-meta-genre">' + escapeHTML(genreDisplay) + '</span>' : '';
  
  var countryHTML = country ? '<span class="video-card-country">' + escapeHTML(country) + '</span>' : '';
  
  /* Translated badge */
  var translatedBadge = isTranslated ?
    '<span class="card-translated-badge">Translated</span>' :
    '<span class="card-translated-badge card-translated-badge--non">Non Translated</span>';
  
  /* Stats row - only country now */
  var statsHTML = countryHTML ? '<div class="video-card-stats">' + countryHTML + '</div>' : '';
  
  card.innerHTML = '<div class="video-card-thumb">' +
    '<img src="' + thumb + '" alt="' + safeTitle + '" loading="lazy" onerror="this.src=\'https://placehold.co/640x360/e63946/ffffff?text=No+Image\'">' +
    '<div class="video-card-overlay">' +
    '<div class="play-btn-overlay"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>' +
    '<div class="card-actions">' +
    '<button class="card-action-btn fav-btn ' + (isFav ? 'active' : '') + '" data-id="' + id + '" title="Favourite">' +
    '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
    '</button>' +
    '<button class="card-action-btn dl-btn" data-url="' + (videoData.videoUrl || '') + '" data-title="' + safeTitle + '" title="Download">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
    '</button>' +
    '</div>' +
    '</div>' +
    (runtime ? '<span class="video-card-duration">' + escapeHTML(runtime) + '</span>' : '') +
    translatedBadge +
    '</div>' +
    '<div class="video-card-body">' +
    '<h3 class="video-card-title">' + safeTitle + '</h3>' +
    metaHTML +
    genreHTML +
    statsHTML +
    '</div>';
  
  card.addEventListener('click', function() {
    window.location.href = 'video.html?id=' + id;
  });
  card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.location.href = 'video.html?id=' + id;
  });
  
  var favBtn = card.querySelector('.fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!AppState.currentUser) {
        showToast('Please sign in to add favourites', 'warning');
        return;
      }
      toggleFavourite(id);
      this.classList.toggle('active');
    });
  }
  
  var dlBtn = card.querySelector('.dl-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var url = this.dataset.url;
      if (!url) {
        showToast('Movie not available for download', 'error');
        return;
      }
      handleFileDownload(url, this.dataset.title || 'video');
    });
  }
  
  return card;
}

function createWidgetVideoItem(videoData) {
  var id = videoData._id || '';
  var thumb = getThumbnailUrl(videoData);
  var title = videoData.title || 'Untitled';
  var views = formatNumber(videoData.views || 0);
  
  var item = document.createElement('div');
  item.className = 'widget-video-item';
  item.innerHTML = '<div class="widget-video-thumb"><img src="' + thumb + '" alt="' + escapeHTML(title) + '" onerror="this.src=\'https://placehold.co/100x64/e63946/ffffff?text=No+Image\'"></div>' +
    '<div class="widget-video-info"><h4>' + escapeHTML(title) + '</h4><span>' + views + ' views</span></div>';
  
  item.addEventListener('click', function() {
    window.location.href = 'video.html?id=' + id;
  });
  return item;
}

/* =============================================
   Lazy Loading Images
   ============================================= */
function initLazyLoading() {
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var img = entry.target;
        var src = img.getAttribute('data-src');
        if (src) {
          img.src = src;
          img.onload = function() { img.classList.add('loaded'); };
          img.onerror = function() {
            img.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'640\' height=\'360\'%3E%3Crect fill=\'%231e1e1e\' width=\'640\' height=\'360\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23555\' font-size=\'18\'%3ENo Thumbnail%3C/text%3E%3C/svg%3E';
            img.classList.add('loaded');
          };
          img.removeAttribute('data-src');
        }
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '100px' });

  var lazyImages = document.querySelectorAll('.lazy-img');
  for (var i = 0; i < lazyImages.length; i++) {
    observer.observe(lazyImages[i]);
  }
}

/* =============================================
   Firebase Video Operations
   ============================================= */

/**
 * Resolves the correct Firebase path for a video ID.
 * Checks the URL for &source=translated to determine
 * whether to look under description/Translated or description.
 */
function resolveVideoPath(videoId) {
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('source') === 'translated') {
    return 'Translated/' + videoId;
  }
  return 'description/' + videoId;
}

function fetchVideos(limit, startAfterKey, category, sort, search) {
  // Fetch from BOTH description and description/Translated simultaneously
  var descPromise = database.ref('description').once('value');
  var transPromise = database.ref('Translated').once('value');
  
  return Promise.all([descPromise, transPromise]).then(function(results) {
    var descSnapshot = results[0];
    var transSnapshot = results[1];
    var videos = [];
    var seenIds = {}; // Deduplicate by ID
    
    // Process direct children of description (skip 'Translated' container)
    descSnapshot.forEach(function(child) {
      if (child.key === 'Translated') return; // Skip the container node
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return; // Skip non-video entries
      if (seenIds[child.key]) return;
      data._id = child.key;
      data._isTranslated = false;
      videos.push(data);
      seenIds[child.key] = true;
    });
    
    // Process children of description/Translated
    transSnapshot.forEach(function(child) {
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return;
      if (seenIds[child.key]) return;
      data._id = child.key;
      data._isTranslated = true;
      videos.push(data);
      seenIds[child.key] = true;
    });
    
    
    
    // Filter by user
    var urlParams = new URLSearchParams(window.location.search);
    var userFilter = urlParams.get('user');
    if (userFilter) {
      videos = videos.filter(function(v) { return v.userId === userFilter; });
    }
    
    // Filter by search
    if (search && search.trim()) {
      var q = search.toLowerCase();
      videos = videos.filter(function(v) {
        return (v.title || '').toLowerCase().includes(q) ||
          (v.description || '').toLowerCase().includes(q) ||
          (v.country || '').toLowerCase().includes(q);
      });
    }
        // Filter by year
    var yearFilter = urlParams.get('year');
    if (yearFilter) {
      videos = videos.filter(function(v) {
        return (v.year || '').toString() === yearFilter;
      });
    }
       // Sort
    if (sort === 'views') {
      videos.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    } else if (sort === 'likes') {
      videos.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
    } else if (sort === 'trending') {
      var now = Date.now();
      videos.sort(function(a, b) {
        var scoreA = (a.views || 0) + (a.likes || 0) * 5 + Math.max(0, 100000 - (now - (a.createdAt || 0))) / 1000;
        var scoreB = (b.views || 0) + (b.likes || 0) * 5 + Math.max(0, 100000 - (now - (b.createdAt || 0))) / 1000;
        return scoreB - scoreA;
      });
    } else {
      // Recent: newest movies first
      videos.sort(function(a, b) {
        var timeA = a.createdAt || a.uploadedAt || a.timestamp || 0;
        var timeB = b.createdAt || b.uploadedAt || b.timestamp || 0;
        // If BOTH have a real timestamp, use it
        if (timeA && timeB) return timeB - timeA;
        // If ONE has a timestamp, it goes first (assumed newer)
        if (timeA && !timeB) return -1;
        if (timeB && !timeA) return 1;
        // NEITHER has a timestamp — use Firebase push key
        // Push keys encode time: lexicographic descending = newest first
        var keyA = a._id || '';
        var keyB = b._id || '';
        if (keyB > keyA) return 1;
        if (keyB < keyA) return -1;
        return 0;
      });
    }
    
    AppState.videosCache = videos;
    
    var startIdx = 0;
    if (startAfterKey) {
      var idx = videos.findIndex(function(v) { return v._id === startAfterKey; });
      if (idx >= 0) startIdx = idx + 1;
    }
    
    var page = videos.slice(startIdx, startIdx + limit);
    var hasMore = startIdx + limit < videos.length;
    var lastKey = page.length > 0 ? page[page.length - 1]._id : null;
    
    return { videos: page, hasMore: hasMore, lastKey: lastKey, total: videos.length };
  });
}

function fetchVideoById(videoId) {
  /* Try description/Translated first, fall back to description */
  return database.ref('Translated/' + videoId).once('value').then(function(snap) {
    if (snap.exists()) {
      var data = snap.val();
      data._id = snap.key;
      data._isTranslated = true;
      return data;
    }
    return database.ref('description/' + videoId).once('value').then(function(snap2) {
      if (!snap2.exists()) return null;
      var data = snap2.val();
      data._id = snap2.key;
      data._isTranslated = false;
      return data;
    });
  });
}

function fetchRelatedVideos(currentId, limit) {
  var descPromise = database.ref('description').once('value');
  var transPromise = database.ref('Translated').once('value');
  
  return Promise.all([descPromise, transPromise]).then(function(results) {
    var descSnapshot = results[0];
    var transSnapshot = results[1];
    var videos = [];
    var seenIds = {};
    
    // Process direct children of description (skip 'Translated' container)
    descSnapshot.forEach(function(child) {
      if (child.key === 'Translated') return;
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return;
      if (child.key === currentId) return;
      if (seenIds[child.key]) return;
      data._id = child.key;
      data._isTranslated = false;
      videos.push(data);
      seenIds[child.key] = true;
    });
    
    // Process children of Translated
    transSnapshot.forEach(function(child) {
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return;
      if (child.key === currentId) return;
      if (seenIds[child.key]) return;
      data._id = child.key;
      data._isTranslated = true;
      videos.push(data);
      seenIds[child.key] = true;
    });
    
    videos.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    return videos.slice(0, limit);
  });
}

function incrementViews(videoId) {
  if (AppState.viewedVideos.indexOf(videoId) >= 0) return;
  var path = resolveVideoPath(videoId);
  database.ref(path + '/views').transaction(function(count) {
    return (count || 0) + 1;
  }, function(error, committed, snapshot) {
    if (error) {
      console.error('[Views] Transaction FAILED for path:', path, '—', error.message);
      /* If unauthenticated user can't write, try without auth */
      if (error.code === 'PERMISSION_DENIED') {
        console.warn('[Views] Permission denied. Your Firebase rules may not allow unauthenticated writes to:', path);
      }
    } else if (committed) {
      console.log('[Views] Incremented to:', snapshot.val(), 'for:', videoId);
    } else {
      console.log('[Views] Transaction aborted (value didn\'t change) for:', videoId);
    }
  });
  
  /* Save to user history */
  if (AppState.currentUser) {
    var uid = AppState.currentUser.uid;
    database.ref('userAccounts/' + uid + '/history/' + videoId).set(Date.now());
  }
  
  AppState.viewedVideos.push(videoId);
  persistState();
}

function toggleLike(videoId) {
  var path = resolveVideoPath(videoId);
  var idx = AppState.likedVideos.indexOf(videoId);
  var disIdx = AppState.dislikedVideos.indexOf(videoId);
  
  if (idx >= 0) {
    AppState.likedVideos.splice(idx, 1);
    database.ref(path + '/likes').transaction(function(c) { return Math.max(0, (c || 0) - 1); }, function(err) {
      if (err) console.error('[Like] Failed:', err.message);
    });
  } else {
    AppState.likedVideos.push(videoId);
    database.ref(path + '/likes').transaction(function(c) { return (c || 0) + 1; }, function(err) {
      if (err) console.error('[Like] Failed:', err.message);
    });
    if (disIdx >= 0) {
      AppState.dislikedVideos.splice(disIdx, 1);
      database.ref(path + '/dislikes').transaction(function(c) { return Math.max(0, (c || 0) - 1); });
    }
  }
  persistState();
  updateLikeDislikeUI(videoId);
}

function toggleDislike(videoId) {
  var path = resolveVideoPath(videoId);
  var idx = AppState.dislikedVideos.indexOf(videoId);
  var likeIdx = AppState.likedVideos.indexOf(videoId);
  
  if (idx >= 0) {
    AppState.dislikedVideos.splice(idx, 1);
    database.ref(path + '/dislikes').transaction(function(c) { return Math.max(0, (c || 0) - 1); }, function(err) {
      if (err) console.error('[Dislike] Failed:', err.message);
    });
  } else {
    AppState.dislikedVideos.push(videoId);
    database.ref(path + '/dislikes').transaction(function(c) { return (c || 0) + 1; }, function(err) {
      if (err) console.error('[Dislike] Failed:', err.message);
    });
    if (likeIdx >= 0) {
      AppState.likedVideos.splice(likeIdx, 1);
      database.ref(path + '/likes').transaction(function(c) { return Math.max(0, (c || 0) - 1); });
    }
  }
  persistState();
  updateLikeDislikeUI(videoId);
}

function toggleDislike(videoId) {
  var path = resolveVideoPath(videoId);
  var idx = AppState.dislikedVideos.indexOf(videoId);
  var likeIdx = AppState.likedVideos.indexOf(videoId);
  
  if (idx >= 0) {
    AppState.dislikedVideos.splice(idx, 1);
    database.ref(path + '/dislikes').transaction(function(c) { return Math.max(0, (c || 0) - 1); });
  } else {
    AppState.dislikedVideos.push(videoId);
    database.ref(path + '/dislikes').transaction(function(c) { return (c || 0) + 1; });
    if (likeIdx >= 0) {
      AppState.likedVideos.splice(likeIdx, 1);
      database.ref(path + '/likes').transaction(function(c) { return Math.max(0, (c || 0) - 1); });
    }
  }
  persistState();
  updateLikeDislikeUI(videoId);
}

function updateLikeDislikeUI(videoId) {
  var likeBtn = document.getElementById('like-btn');
  var dislikeBtn = document.getElementById('dislike-btn');
  var likeCount = document.getElementById('like-count');
  var dislikeCount = document.getElementById('dislike-count');
  
  if (!likeBtn) return;
  
  var isLiked = AppState.likedVideos.indexOf(videoId) >= 0;
  var isDisliked = AppState.dislikedVideos.indexOf(videoId) >= 0;
  
  likeBtn.classList.toggle('liked', isLiked);
  dislikeBtn.classList.toggle('disliked', isDisliked);
  
  var path = resolveVideoPath(videoId);
  database.ref(path).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var d = snap.val();
    if (likeCount) likeCount.textContent = formatNumber(d.likes || 0);
    if (dislikeCount) dislikeCount.textContent = formatNumber(d.dislikes || 0);
  });
}




/* =============================================
   Download System
   ============================================= */
function handleFileDownload(url, filename) {
  if (!url) {
    showToast('No movie URL available', 'error');
    return;
  }
  var a = document.createElement('a');
  a.href = url;
  a.download = (filename || 'video') + '.mp4';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); }, 100);
}

/* =============================================
   Offline Storage System (IndexedDB)
   ============================================= */
var OfflineDB = (function() {
  var DB_NAME = 'xstream_offline_db';
  var DB_VERSION = 1;
  var STORE_NAME = 'videos';
  var db = null;

  function open() {
    return new Promise(function(resolve, reject) {
      if (db) return resolve(db);
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e) {
        var database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function(e) { db = e.target.result; resolve(db); };
      request.onerror = function(e) { reject(e.target.error); };
    });
  }

  function saveVideo(id, blob, title) {
    return open().then(function(database) {
      return new Promise(function(resolve, reject) {
        var tx = database.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.put({ id: id, blob: blob, title: title, size: blob.size, timestamp: Date.now() });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function getVideo(id) {
    return open().then(function(database) {
      return new Promise(function(resolve, reject) {
        var tx = database.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(id);
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function deleteVideo(id) {
    return open().then(function(database) {
      return new Promise(function(resolve, reject) {
        var tx = database.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function getAll() {
    return open().then(function(database) {
      return new Promise(function(resolve, reject) {
        var tx = database.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var request = store.getAll();
        request.onsuccess = function() { resolve(request.result || []); };
        request.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  return { saveVideo: saveVideo, getVideo: getVideo, deleteVideo: deleteVideo, getAll: getAll };
})();

var MAX_DOWNLOADS = 5;
var MAX_STORAGE_BYTES = 1024 * 1024 * 1024; // 1GB Limit

function getOfflineStorageStats() {
  return OfflineDB.getAll().then(function(items) {
    var totalSize = 0;
    items.forEach(function(item) { totalSize += (item.size || 0); });
    return { count: items.length, totalSizeBytes: totalSize };
  });
}

function renderStorageBar() {
  var container = document.getElementById('storage-bar-container');
  if (!container) return;

  getOfflineStorageStats().then(function(stats) {
    var usedMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(1);
    var maxMB = (MAX_STORAGE_BYTES / (1024 * 1024)).toFixed(0);
    var percent = Math.min((stats.totalSizeBytes / MAX_STORAGE_BYTES) * 100, 100).toFixed(1);
    var isFull = stats.count >= MAX_DOWNLOADS || stats.totalSizeBytes >= MAX_STORAGE_BYTES;
    var barColor = isFull ? 'var(--error)' : percent > 80 ? 'var(--warning)' : 'var(--accent)';

    container.innerHTML = 
      '<div class="storage-info-row">' +
        '<span class="storage-label">Storage: ' + usedMB + ' MB / ' + maxMB + ' MB</span>' +
        '<span class="storage-label">' + stats.count + ' / ' + MAX_DOWNLOADS + ' Movies</span>' +
      '</div>' +
      '<div class="storage-bar-track">' +
        '<div class="storage-bar-fill" style="width:' + percent + '%; background:' + barColor + ';"></div>' +
      '</div>';
  });
}

function downloadForOffline(videoId, videoUrl, title) {
  return getOfflineStorageStats().then(function(stats) {
    if (stats.count >= MAX_DOWNLOADS) {
      showToast('Download limit reached (Max ' + MAX_DOWNLOADS + '). Delete a downloaded movie to download more.', 'warning');
      return Promise.reject('limit');
    }
    
    showToast('Fetching "' + (title || 'Video') + '" for offline viewing...', 'info');
    
    return fetch(videoUrl).then(function(response) {
      if (!response.ok) throw new Error('Network error');
      return response.blob();
    }).then(function(blob) {
      var newTotalSize = stats.totalSizeBytes + blob.size;
      if (newTotalSize > MAX_STORAGE_BYTES) {
        showToast('Storage full! You need ' + ((newTotalSize - MAX_STORAGE_BYTES) / (1024*1024)).toFixed(1) + ' MB more space.', 'error');
        return Promise.reject('storage');
      }
      
      return OfflineDB.saveVideo(videoId, blob, title).then(function() {
        if (AppState.currentUser) {
          database.ref('userAccounts/' + AppState.currentUser.uid + '/downloads/' + videoId).set({
            title: title || 'Untitled',
            downloadedAt: Date.now()
          }).catch(function(){});
        }
        showToast('"' + (title || 'Video') + '" saved for offline viewing!', 'success');
        renderStorageBar();
      });
    }).catch(function(err) {
      if (err !== 'limit' && err !== 'storage') showToast('Failed to download.', 'error');
      throw err;
    });
  });
}

/* =============================================
   Profile Data Loaders (With Play Buttons)
   ============================================= */
function loadUserFavourites(uid) {
  var container = document.getElementById('profile-favourites-list');
  if (!container) return Promise.resolve([]);

  return database.ref('userAccounts/' + uid + '/favourites').once('value').then(function(snap) {
    var favIds = [];
    snap.forEach(function(child) { favIds.push(child.key); });
    if (favIds.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:10px 0;">No favourites yet.</p>';
      return Promise.resolve([]);
    }

    return Promise.all(favIds.slice(0, 24).map(function(id) { return fetchVideoById(id); })).then(function(results) {
      var html = '';
      results.forEach(function(v) {
        if (!v) return;
        html += '<div class="widget-video-item" style="cursor:pointer;" onclick="window.location.href=\'video.html?id=' + v._id + '\'">' +
          '<div class="widget-video-thumb">' +
            '<img src="' + getThumbnailUrl(v) + '" alt="' + escapeHTML(v.title || 'Untitled') + '" onerror="this.src=\'https://placehold.co/100x64/e63946/fff?text=No+Image\'">' +
            '<div class="widget-play-overlay"><svg viewBox="0 0 24 24" fill="#fff" width="20" height="20"><polygon points="5,3 19,12 5,21"/></svg></div>' +
          '</div>' +
          '<div class="widget-video-info"><h4>' + escapeHTML(v.title || 'Untitled') + '</h4></div>' +
          '<button class="widget-remove-btn" onclick="event.stopPropagation(); window.removeFavourite(\'' + v._id + '\')" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="18" x2="21" y2="18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</div>';
      });
      container.innerHTML = html;
      return results;
    });
  }).catch(function() {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not load favourites.</p>';
    return [];
  });
}

function loadUserDownloads(uid) {
  var container = document.getElementById('profile-downloads-list');
  if (!container) return Promise.resolve([]);
  
  var barContainer = document.getElementById('storage-bar-container');
  if (barContainer) renderStorageBar();

  return database.ref('userAccounts/' + uid + '/downloads').once('value').then(function(snap) {
    var items = [];
    snap.forEach(function(child) {
      var data = child.val();
      items.push({ id: child.key, title: data.title, date: data.downloadedAt });
    });

    if (items.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:10px 0;">No downloads yet.</p>';
      return Promise.resolve([]);
    }

    items.sort(function(a, b) { return (b.downloadedAt || 0) - (a.downloadedAt || 0); });

    var html = '';
    items.forEach(function(item) {
      html += '<div class="widget-video-item" style="cursor:pointer;" onclick="window.playOffline(\'' + item.id + '\')">' +
        '<div class="widget-video-thumb">' +
          '<img src="https://placehold.co/100x64/1a1a1a/888?text=Offline" alt="Offline Video">' +
          '<div class="widget-play-overlay offline-badge"><svg viewBox="0 0 24 24" fill="#fff" width="20" height="20"><polygon points="5,3 19,12 5,21"/></svg><span>OFFLINE</span></div>' +
        '</div>' +
        '<div class="widget-video-info"><h4>' + escapeHTML(item.title || 'Untitled') + '</h4><span>' + formatDate(item.downloadedAt) + '</span></div>' +
        '<button class="widget-remove-btn" onclick="event.stopPropagation(); window.removeDownload(\'' + item.id + '\')" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</div>';
    });
    container.innerHTML = html;
    return items;
  }).catch(function() {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not load downloads.</p>';
    return [];
  });
}

function loadUserHistory(uid) {
  var container = document.getElementById('profile-history-list');
  if (!container) return Promise.resolve([]);

  return database.ref('userAccounts/' + uid + '/history').once('value').then(function(snap) {
    var entries = [];
    snap.forEach(function(child) {
      entries.push({ id: child.key, timestamp: child.val() });
    });

    if (entries.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);padding:10px 0;">No watch history yet.</p>';
      return Promise.resolve([]);
    }

    entries.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

    return Promise.all(entries.slice(0, 30).map(function(entry) { return fetchVideoById(entry.id); })).then(function(results) {
      var html = '';
      results.forEach(function(v) {
        if (!v) return;
        html += '<div class="widget-video-item" style="cursor:pointer;" onclick="window.location.href=\'video.html?id=' + v._id + '\'">' +
          '<div class="widget-video-thumb">' +
            '<img src="' + getThumbnailUrl(v) + '" alt="' + escapeHTML(v.title || 'Untitled') + '" onerror="this.src=\'https://placehold.co/100x64/e63946/fff?text=No+Image\'">' +
            '<div class="widget-play-overlay"><svg viewBox="0 0 24 24" fill="#fff" width="20" height="20"><polygon points="5,3 19,12 5,21"/></svg></div>' +
          '</div>' +
          '<div class="widget-video-info"><h4>' + escapeHTML(v.title || 'Untitled') + '</h4><span>' + formatDate(v.createdAt) + '</span></div>' +
        '</div>';
      });
      container.innerHTML = html;
      return results;
    });
  }).catch(function() {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not load history.</p>';
    return [];
  });
}

/* Global inline click handlers */
window.removeFavourite = function(videoId) {
  toggleFavourite(videoId);
  showToast('Removed from favourites', 'info');
  if (AppState.currentUser) loadUserFavourites(AppState.currentUser.uid);
};

window.removeDownload = function(videoId) {
  OfflineDB.deleteVideo(videoId).then(function() {
    if (AppState.currentUser) {
      database.ref('userAccounts/' + AppState.currentUser.uid + '/downloads/' + videoId).remove();
    }
    showToast('Removed from downloads and storage freed', 'info');
    renderStorageBar();
    if (AppState.currentUser) loadUserDownloads(AppState.currentUser.uid);
  }).catch(function() {
    showToast('Failed to remove.', 'error');
  });
};

window.playOffline = function(videoId) {
  showToast('Loading offline video...', 'info');
  OfflineDB.getVideo(videoId).then(function(data) {
    if (!data || !data.blob) {
      showToast('Offline file missing. It may have been cleared by your browser.', 'error');
      return;
    }
    window.location.href = 'video.html?offline=true&id=' + videoId;
  }).catch(function() {
    showToast('Error accessing offline storage.', 'error');
  });
};

/* =============================================
   Homepage: Render Videos
   ============================================= */
/* --- State for trending rotation --- */
var TrendingState = {
  pool: [],
  displayedIds: [],
  timer: null
};

function renderTrendingVideos() {
  var grid = document.getElementById('trending-grid');
  if (!grid) return;
  
  // Fetch a larger pool so we have room to shuffle
  fetchVideos(40, null, 'all', 'trending', '').then(function(result) {
    grid.innerHTML = '';
    
    if (result.videos.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>No trending movies yet</h3></div>';
      return;
    }
    
    TrendingState.pool = result.videos;
    
    // Show first 6 random
    var initial = pickTrending(6, []);
    renderTrendingCards(initial, false);
    
    // Start 5-second auto-rotation
    startTrendingRotation();
  }).catch(function(err) {
    console.error('Trending fetch error:', err);
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Could not load trending videos</h3></div>';
  });
}

function pickTrending(count, excludeIds) {
  var available = TrendingState.pool.filter(function(v) {
    return excludeIds.indexOf(v._id || v.id) === -1;
  });
  if (available.length < count) available = TrendingState.pool.slice();
  var shuffled = available.slice().sort(function() { return Math.random() - 0.5; });
  return shuffled.slice(0, count);
}

function renderTrendingCards(list, animate) {
  var grid = document.getElementById('trending-grid');
  if (!grid) return;
  
  if (animate) grid.classList.add('shuffling');
  
  var apply = function() {
    grid.innerHTML = '';
    list.forEach(function(v) { grid.appendChild(createVideoCard(v)); });
    TrendingState.displayedIds = list.map(function(v) { return v._id || v.id; });
    initLazyLoading();
    requestAnimationFrame(function() { grid.classList.remove('shuffling'); });
  };
  
  if (animate) {
    setTimeout(apply, 420);
  } else {
    apply();
  }
}

function startTrendingRotation() {
  stopTrendingRotation();
  TrendingState.timer = setInterval(function() {
    var picked = pickTrending(6, TrendingState.displayedIds);
    renderTrendingCards(picked, true);
  }, 20000);
}

function stopTrendingRotation() {
  if (TrendingState.timer) {
    clearInterval(TrendingState.timer);
    TrendingState.timer = null;
  }
}

function renderMainVideos(append) {
  var grid = document.getElementById('videos-grid');
  var loadMoreContainer = document.getElementById('load-more-container');
  var noVideos = document.getElementById('no-videos');
  if (!grid) return;

  if (!append) grid.innerHTML = '';

  fetchVideos(AppState.itemsPerPage, append ? AppState.lastLoadedKey : null, AppState.currentCategory, AppState.currentSort, AppState.currentSearch)
    .then(function(result) {
      AppState.lastLoadedKey = result.lastKey;

      if (result.videos.length === 0 && !append) {
        grid.innerHTML = '';
        if (noVideos) noVideos.style.display = 'block';
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
      }
      if (noVideos) noVideos.style.display = 'none';

      result.videos.forEach(function(v) { grid.appendChild(createVideoCard(v)); });
      initLazyLoading();

      if (result.hasMore) {
        if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
      } else {
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      }
    })
    .catch(function(err) {
      console.error('Videos fetch error:', err);
      if (!append) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Could not load movies</h3><p>Please check your connection and try again.</p></div>';
      }
    });
}

function renderSidebarPopular() {
  var container = document.getElementById('popular-videos-widget');
  if (!container) return;

  fetchVideos(5, null, 'all', 'views', '').then(function(result) {
    container.innerHTML = '';
    if (result.videos.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">No movies yet.</p>';
      return;
    }
    result.videos.forEach(function(v) { container.appendChild(createWidgetVideoItem(v)); });
    initLazyLoading();
  }).catch(function() {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not load.</p>';
  });
}

function updateCategoryCounts() {
  var descPromise = database.ref('description').once('value');
  var transPromise = database.ref('Translated').once('value');
  
  Promise.all([descPromise, transPromise]).then(function(results) {
    var descSnapshot = results[0];
    var transSnapshot = results[1];
    var allVideos = [];
    var seenIds = {};
    
    /* From description (skip Translated container) */
    descSnapshot.forEach(function(child) {
      if (child.key === 'Translated') return;
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return;
      if (seenIds[child.key]) return;
      allVideos.push(data);
      seenIds[child.key] = true;
    });
    
    /* From Translated */
    transSnapshot.forEach(function(child) {
      var data = child.val();
      if (!data || typeof data !== 'object' || !data.title) return;
      if (seenIds[child.key]) return;
      allVideos.push(data);
      seenIds[child.key] = true;
    });
    
    var setCount = function(id, count) {
      var el = document.getElementById(id);
      if (el) el.textContent = count;
    };
    
    setCount('count-all', allVideos.length);
    setCount('chip-count-all', allVideos.length);
    
    /* All categories matching the HTML filter dropdown values */
    var categories = [
      'action',
      'adventure',
      'animation',
      'anime',
      'biography',
      'comingofage',
      'comedy',
      'crime',
      'darkcomedy',
      'disaster',
      'documentary',
      'drama',
      'dystopian',
      'family',
      'fantasy',
      'noir',
      'heist',
      'historical',
      'horror',
      'indie',
      'legal',
      'martialarts',
      'mockumentary',
      'mystery',
      'musical',
      'political',
      'postapocalyptic',
      'psychological',
      'religious',
      'romance',
      'scifi',
      'sciencefiction',
      'slasher',
      'shortfilm',
      'spy',
      'sport',
      'supernatural',
      'survival',
      'thriller',
      'war',
      'western'
    ];
    
    categories.forEach(function(cat) {
      var count = allVideos.filter(function(v) {
        return (v.category || '').toLowerCase() === cat;
      }).length;
      setCount('count-' + cat, count);
      setCount('chip-count-' + cat, count);
    });
  }).catch(function(err) {
    console.error('Category count error:', err);
  });
}

function toggleFavourite(videoId) {
  var idx = AppState.favouriteVideos.indexOf(videoId);
  if (idx >= 0) {
    AppState.favouriteVideos.splice(idx, 1);
    database.ref('userAccounts/' + AppState.currentUser.uid + '/favourites/' + videoId).remove();
  } else {
    AppState.favouriteVideos.push(videoId);
    database.ref('userAccounts/' + AppState.currentUser.uid + '/favourites/' + videoId).set(Date.now());
  }
  persistState();
}

function removeFavourite(videoId) {
  toggleFavourite(videoId);
  showToast('Removed from favourites', 'info');
  if (AppState.currentUser) loadUserFavourites(AppState.currentUser.uid);
}

function removeDownload(videoId) {
  database.ref('userAccounts/' + AppState.currentUser.uid + '/downloads/' + videoId).remove();
  showToast('Removed from downloads', 'info');
  if (AppState.currentUser) loadUserDownloads(AppState.currentUser.uid);
}


/* =============================================
   Series Section: Fetch, Render & Auto-Rotate
   ============================================= */

/* --- State for series rotation --- */
var SeriesState = {
  allSeries: [],
  displayedIds: [],
  isPaused: false,
  rotationTimer: null,
  countdownTimer: null,
  secondsLeft: 10
};

/* -------------------------------------------------------
   fetchSeriesFromDB
   Reads all series from the Firebase "Series" node.
   ------------------------------------------------------- */
function fetchSeriesFromDB() {
  return new Promise(function (resolve, reject) {
    /* Use the shared `database` ref from app.js (same as series.js).
       Fall back to firebase.database() if that variable doesn't exist. */
    var dbRef = (typeof database !== 'undefined' && database)
      ? database
      : firebase.database();

    var ref = dbRef.ref('Series').orderByKey();

    ref.once('value').then(function (snapshot) {
      var seriesArr = [];
      snapshot.forEach(function (child) {
        var data = child.val();
        if (!data || !data.title) return;
        data._id = child.key;
        seriesArr.push(data);
      });
      resolve(seriesArr);
    }).catch(reject);
  });
}

/* -------------------------------------------------------
   pickRandomSeries
   Returns `count` unique items whose _id is NOT in
   the exclude list. Falls back to random with repeats
   when not enough unseen items remain.
   ------------------------------------------------------- */
function pickRandomSeries(pool, count, excludeIds) {
  var available = pool.filter(function (s) {
    return excludeIds.indexOf(s._id) === -1;
  });

  if (available.length < count) available = pool.slice();

  var picked = [];
  var shuffled = available.slice().sort(function () { return Math.random() - 0.5; });
  for (var i = 0; i < count && i < shuffled.length; i++) {
    picked.push(shuffled[i]);
  }
  return picked;
}

/* -------------------------------------------------------
   createSeriesCardForHome
   Builds a card identical in look to createVideoCard
   but clicks go to  watch.html?id=XXX&source=series
   so the watch page reads from the "Series" node.
   ------------------------------------------------------- */
function createSeriesCardForHome(s) {
  var id = s._id || '';
  var thumb = (typeof getThumbnailUrl === 'function') ? getThumbnailUrl(s) : (s.thumbnailUrl || s.posterUrl || 'https://placehold.co/640x360/e63946/ffffff?text=No+Image');
  var title = s.title || 'Untitled Series';
  var views = (typeof formatNumber === 'function') ? formatNumber(s.views || 0) : (s.views || 0);
  var genre = s.genre || '';
  var status = s.status || '';
  var totalSeasons = s.totalSeasons || 0;
  var imdbRating = s.imdbRating || '';
  var isFav = (typeof AppState !== 'undefined' && AppState.favouriteVideos)
    ? AppState.favouriteVideos.indexOf(id) >= 0
    : false;

  var esc = (typeof escapeHTML === 'function') ? escapeHTML : function (t) { return t; };

  var card = document.createElement('article');
  card.className = 'video-card';
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', title);
  card.dataset.id = id;

  /* Status badge */
  var statusBadge = '';
  if (status) {
    var cls = status.toLowerCase() === 'ongoing' ? 'ongoing' : 'completed';
    statusBadge = '<span class="status-badge ' + cls + '" style="font-size:0.65rem;padding:2px 7px;">' + esc(status) + '</span>';
  }

  /* Season count */
  var seasonBadge = totalSeasons > 0
    ? '<span style="font-size:0.7rem;color:var(--text-muted);">' + totalSeasons + 'S</span>'
    : '';

  /* IMDB rating */
  var ratingBadge = '';
  if (imdbRating && imdbRating !== 'N/A') {
    ratingBadge = '<span class="card-meta-imdb" style="font-size:0.7rem;">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg> ' +
      esc(imdbRating) + '</span>';
  }

  /* Genre tag */
  var genreBadge = genre
    ? '<span style="font-size:0.7rem;color:var(--text-secondary);">' + esc(genre) + '</span>'
    : '';

  card.innerHTML =
    '<div class="video-card-thumb">' +
    '<img src="' + thumb + '" alt="' + esc(title) + '" loading="lazy" onerror="this.src=\'https://placehold.co/640x360/e63946/ffffff?text=No+Image\'">' +
    '<div class="video-card-overlay">' +
    '<div class="play-btn-overlay"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>' +
    '<div class="card-actions">' +
    '<button class="card-action-btn fav-btn ' + (isFav ? 'active' : '') + '" data-id="' + id + '" title="Favourite">' +
    '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
    '</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="video-card-body">' +
    '<h3 class="video-card-title">' + esc(title) + '</h3>' +
    '<div class="video-card-stats">' +
    statusBadge + seasonBadge + ratingBadge + genreBadge +
    '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ' + views + '</span>' +
    '</div>' +
    '</div>';

  /* ★ KEY FIX — redirect to series watch page with matching ID ★ */
  card.addEventListener('click', function (e) {
    if (e.target.closest('.card-action-btn')) return;
    window.location.href = 'watch.html?id=' + id + '&source=series';
  });
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') window.location.href = 'watch.html?id=' + id + '&source=series';
  });

  /* Favourite button */
  var favBtn = card.querySelector('.fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof AppState === 'undefined' || !AppState.currentUser) {
        if (typeof showToast === 'function') showToast('Please sign in to add favourites', 'warning');
        return;
      }
      if (typeof toggleFavourite === 'function') toggleFavourite(id);
      this.classList.toggle('active');
      var svg = this.querySelector('svg');
      if (svg) svg.setAttribute('fill', this.classList.contains('active') ? 'currentColor' : 'none');
    });
  }

  return card;
}

/* -------------------------------------------------------
   renderSeriesCards
   Builds cards into #series-grid.
   ★ Now uses createSeriesCardForHome instead of
     createVideoCard so clicks go to the correct page.
   ------------------------------------------------------- */
function renderSeriesCards(seriesList, animate) {
  var grid = document.getElementById('series-grid');
  if (!grid) return;

  if (animate) {
    grid.classList.add('shuffling');
  }

  var applyCards = function () {
    grid.innerHTML = '';

    if (seriesList.length === 0) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;">' +
        '<h3>No series available yet</h3></div>';
      grid.classList.remove('shuffling');
      return;
    }

    seriesList.forEach(function (s) {
      grid.appendChild(createSeriesCardForHome(s));
    });

    SeriesState.displayedIds = seriesList.map(function (s) { return s._id; });

    if (typeof initLazyLoading === 'function') initLazyLoading();

    requestAnimationFrame(function () {
      grid.classList.remove('shuffling');
    });
  };

  if (animate) {
    setTimeout(applyCards, 420);
  } else {
    applyCards();
  }
}

/* -------------------------------------------------------
   shuffleSeriesNow
   Picks 6 new random series and swaps them in.
   ------------------------------------------------------- */
function shuffleSeriesNow(animate) {
  if (typeof animate === 'undefined') animate = true;
  var picked = pickRandomSeries(SeriesState.allSeries, 6, SeriesState.displayedIds);
  renderSeriesCards(picked, animate);
}

/* -------------------------------------------------------
   Progress bar helpers
   ------------------------------------------------------- */
function startProgressBar() {
  var fill = document.getElementById('series-progress-fill');
  if (!fill) return;
  fill.classList.remove('animating');
  fill.style.width = '0%';
  void fill.offsetWidth;
  fill.classList.add('animating');
}

function resetProgressBar() {
  var fill = document.getElementById('series-progress-fill');
  if (!fill) return;
  fill.classList.remove('animating');
  fill.style.width = '0%';
}

/* -------------------------------------------------------
   Countdown label updater
   ------------------------------------------------------- */
function startCountdown() {
  SeriesState.secondsLeft = 10;
  updateCountdownLabel();
  clearInterval(SeriesState.countdownTimer);
  SeriesState.countdownTimer = setInterval(function () {
    SeriesState.secondsLeft--;
    if (SeriesState.secondsLeft < 0) SeriesState.secondsLeft = 0;
    updateCountdownLabel();
  }, 1000);
}

function stopCountdown() {
  clearInterval(SeriesState.countdownTimer);
  var label = document.getElementById('series-rotation-label');
  if (label) label.textContent = 'Paused';
}

function updateCountdownLabel() {
  var label = document.getElementById('series-rotation-label');
  if (label) label.textContent = 'Shuffles in ' + SeriesState.secondsLeft + 's';
}

/* -------------------------------------------------------
   Rotation loop — fires every 10 seconds
   ------------------------------------------------------- */
function startSeriesRotation() {
  stopSeriesRotation();
  SeriesState.isPaused = false;
  updatePauseButton();

  startProgressBar();
  startCountdown();

  SeriesState.rotationTimer = setInterval(function () {
    if (!SeriesState.isPaused) {
      shuffleSeriesNow(true);
      startProgressBar();
      startCountdown();
    }
  }, 30000);
}

function stopSeriesRotation() {
  clearInterval(SeriesState.rotationTimer);
  clearInterval(SeriesState.countdownTimer);
  SeriesState.rotationTimer = null;
  SeriesState.countdownTimer = null;
  resetProgressBar();
}

function toggleSeriesPause() {
  SeriesState.isPaused = !SeriesState.isPaused;
  updatePauseButton();

  if (SeriesState.isPaused) {
    stopCountdown();
    resetProgressBar();
  } else {
    startProgressBar();
    startCountdown();
  }
}

function updatePauseButton() {
  var btn = document.getElementById('series-pause-btn');
  if (!btn) return;
  var pauseIcon = btn.querySelector('.pause-icon');
  var playIcon = btn.querySelector('.play-icon');
  if (SeriesState.isPaused) {
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (playIcon) playIcon.style.display = 'block';
  } else {
    if (pauseIcon) pauseIcon.style.display = 'block';
    if (playIcon) playIcon.style.display = 'none';
  }
}

/* -------------------------------------------------------
   renderSeriesSection — main entry point
   ------------------------------------------------------- */
function renderSeriesSection() {
  var grid = document.getElementById('series-grid');
  if (!grid) return;

  fetchSeriesFromDB()
    .then(function (allSeries) {
      SeriesState.allSeries = allSeries;

      if (allSeries.length === 0) {
        grid.innerHTML =
          '<div class="empty-state" style="grid-column:1/-1;">' +
          '<h3>No series available yet</h3></div>';
        return;
      }

      var initial = pickRandomSeries(allSeries, 6, []);
      renderSeriesCards(initial, false);
      startSeriesRotation();
    })
    .catch(function (err) {
      console.error('Series fetch error:', err);
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;">' +
        '<h3>Could not load series</h3>' +
        '<p>Please check your connection and try again.</p></div>';
    });
}

/* -------------------------------------------------------
   Wire up the pause & shuffle buttons
   ------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  var pauseBtn = document.getElementById('series-pause-btn');
  var shuffleBtn = document.getElementById('series-shuffle-btn');

  if (pauseBtn) {
    pauseBtn.addEventListener('click', toggleSeriesPause);
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', function () {
      shuffleSeriesNow(true);
      if (!SeriesState.isPaused) {
        startProgressBar();
        startCountdown();
      }
    });
  }
});

/* =============================================
   Homepage: Event Bindings
   ============================================= */
function initHomePage() {
  var urlParams = new URLSearchParams(window.location.search);

  AppState.currentSearch = urlParams.get('search') || '';
  var sortParam = urlParams.get('sort');
  if (sortParam === 'trending' || sortParam === 'views' || sortParam === 'likes') {
    AppState.currentSort = sortParam;
  }
  var catParam = urlParams.get('category');
  if (catParam) AppState.currentCategory = catParam;

  var catFilter = document.getElementById('category-filter');
  var sortFilter = document.getElementById('sort-filter');
  if (catFilter) catFilter.value = AppState.currentCategory;
  if (sortFilter) sortFilter.value = AppState.currentSort;

  var heroSearch = document.getElementById('hero-search-input');
  var sidebarSearch = document.getElementById('sidebar-search');
  if (heroSearch && AppState.currentSearch) heroSearch.value = AppState.currentSearch;
  if (sidebarSearch && AppState.currentSearch) sidebarSearch.value = AppState.currentSearch;

  var userFilter = urlParams.get('user');
  var recentTitle = document.getElementById('recent-title');
  if (userFilter && recentTitle) {
    recentTitle.innerHTML = '<svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> My Uploads';
  }
  
    createHeroParticles();
  initHeroSlider(); /* ← ADD THIS LINE */
  animateCounters();

 

  renderTrendingVideos();
  renderMainVideos(false);
  renderSeriesSection();

  updateCategoryCounts();
  renderSidebarPopular();
  
  

  var heroSearchBtn = document.getElementById('hero-search-btn');
  var doHeroSearch = function() {
    var q = heroSearch ? heroSearch.value.trim() : '';
    var newUrl = q ? 'homepage.html?search=' + encodeURIComponent(q) : 'homepage.html';
    window.location.href = newUrl;
  };
  if (heroSearchBtn) heroSearchBtn.addEventListener('click', doHeroSearch);
  if (heroSearch) {
    heroSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doHeroSearch();
    });
  }

  var doSidebarSearch = function() {
    var q = sidebarSearch ? sidebarSearch.value.trim() : '';
    if (q) {
      AppState.currentSearch = q;
      AppState.lastLoadedKey = null;
      renderMainVideos(false);
    }
  };
  if (sidebarSearch) {
    sidebarSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doSidebarSearch();
    });
  }

  var heroChips = document.getElementById('hero-chips');
  if (heroChips) {
    heroChips.addEventListener('click', function(e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var allChips = heroChips.querySelectorAll('.chip');
      for (var i = 0; i < allChips.length; i++) allChips[i].classList.remove('active');
      chip.classList.add('active');
      var cat = chip.dataset.category;
      AppState.currentCategory = cat;
      AppState.lastLoadedKey = null;
      if (catFilter) catFilter.value = cat;
      renderMainVideos(false);
    });
  }

  if (catFilter) {
    catFilter.addEventListener('change', function() {
      AppState.currentCategory = catFilter.value;
      AppState.lastLoadedKey = null;
      var sidebarCats = document.querySelectorAll('#sidebar-categories a');
      for (var i = 0; i < sidebarCats.length; i++) {
        sidebarCats[i].classList.toggle('active', sidebarCats[i].dataset.category === AppState.currentCategory);
      }
      renderMainVideos(false);
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', function() {
      AppState.currentSort = sortFilter.value;
      AppState.lastLoadedKey = null;
      renderMainVideos(false);
    });
  }

  var sidebarCategories = document.getElementById('sidebar-categories');
  if (sidebarCategories) {
    sidebarCategories.addEventListener('click', function(e) {
      e.preventDefault();
      var link = e.target.closest('a');
      if (!link) return;
      var allLinks = sidebarCategories.querySelectorAll('a');
      for (var i = 0; i < allLinks.length; i++) allLinks[i].classList.remove('active');
      link.classList.add('active');
      AppState.currentCategory = link.dataset.category;
      AppState.lastLoadedKey = null;
      if (catFilter) catFilter.value = AppState.currentCategory;
      renderMainVideos(false);
    });
  }

  var tagCloud = document.getElementById('tag-cloud');
  if (tagCloud) {
    tagCloud.addEventListener('click', function(e) {
      e.preventDefault();
      var tag = e.target.closest('.tag');
      if (!tag) return;
      var q = tag.textContent.replace('#', '');
      if (heroSearch) heroSearch.value = q;
      AppState.currentSearch = q;
      AppState.lastLoadedKey = null;
      renderMainVideos(false);
    });
  }

  var loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function() {
      var btn = this;
      btn.style.display = 'none';
      var spinner = document.getElementById('load-more-spinner');
      if (spinner) spinner.style.display = 'block';
      renderMainVideos(true).then(function() {
        btn.style.display = 'inline-flex';
        if (spinner) spinner.style.display = 'none';
      });
    });
  }

  var newsletterBtn = document.getElementById('newsletter-btn');
  if (newsletterBtn) {
    newsletterBtn.addEventListener('click', function() {
      var emailEl = document.getElementById('newsletter-email');
      var email = emailEl ? emailEl.value.trim() : '';
      if (!email || !email.includes('@')) {
        showToast('Please enter a valid email address', 'warning');
        return;
      }
      showToast('Thanks for subscribing!', 'success');
      if (emailEl) emailEl.value = '';
    });
  }

  createHeroParticles();
  animateCounters();
}
  /* More Categories Panel Toggle */
  var moreBtn = document.getElementById('btn-more-categories');
  var morePanel = document.getElementById('more-categories-panel');
  var moreClose = document.getElementById('more-categories-close');
  
  if (moreBtn && morePanel) {
    moreBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = morePanel.classList.contains('open');
      morePanel.classList.toggle('open');
      moreBtn.classList.toggle('active');
      if (!isOpen) {
        /* Close panel when clicking outside */
        setTimeout(function() {
          document.addEventListener('click', closeMorePanel);
        }, 10);
      } else {
        document.removeEventListener('click', closeMorePanel);
      }
    });
    
    if (moreClose) {
      moreClose.addEventListener('click', function(e) {
        e.stopPropagation();
        morePanel.classList.remove('open');
        moreBtn.classList.remove('active');
        document.removeEventListener('click', closeMorePanel);
      });
    }
  }
  
  function closeMorePanel(e) {
    if (morePanel && !morePanel.contains(e.target) && e.target !== moreBtn) {
      morePanel.classList.remove('open');
      moreBtn.classList.remove('active');
      document.removeEventListener('click', closeMorePanel);
    }
  }
/* =============================================
   Hero Particles
   ============================================= */
function createHeroParticles() {
  var container = document.getElementById('hero-particles');
  if (!container) return;
  for (var i = 0; i < 30; i++) {
    var p = document.createElement('div');
    p.className = 'hero-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = (60 + Math.random() * 40) + '%';
    p.style.animationDuration = (4 + Math.random() * 8) + 's';
    p.style.animationDelay = Math.random() * 5 + 's';
    p.style.width = (2 + Math.random() * 3) + 'px';
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

/* =============================================
   Hero Featured Slider — Background Images
   ============================================= */
var HeroSlider = {
  movies: [],
  currentIndex: 0,
  timer: null,
  interval: 7000,
  isTransitioning: false
};

function fetchHeroSliderMovies() {
  var descPromise = database.ref('description').once('value');
  var transPromise = database.ref('Translated').once('value');

  return Promise.all([descPromise, transPromise]).then(function(results) {
    var movies = [];
    var seenIds = {};

    results[0].forEach(function(child) {
      if (child.key === 'Translated') return;
      var data = child.val();
      if (!data || !data.title) return;
      if (seenIds[child.key]) return;
      if (!data.thumbnailUrl || data.thumbnailUrl.length < 10) return;
      data._id = child.key;
      data._source = 'description';
      movies.push(data);
      seenIds[child.key] = true;
    });

    results[1].forEach(function(child) {
      var data = child.val();
      if (!data || !data.title) return;
      if (seenIds[child.key]) return;
      if (!data.thumbnailUrl || data.thumbnailUrl.length < 10) return;
      data._id = child.key;
      data._source = 'Translated';
      movies.push(data);
      seenIds[child.key] = true;
    });

    for (var i = movies.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = movies[i]; movies[i] = movies[j]; movies[j] = tmp;
    }

    return movies;
  });
}

function buildHeroSlider(movies) {
  var slider = document.getElementById('hero-featured-slider');
  var indicators = document.getElementById('hero-indicators');
  if (!slider) return;

  HeroSlider.movies = movies;
  slider.innerHTML = '';
  if (indicators) indicators.innerHTML = '';

  if (movies.length === 0) return;

  var fragment = document.createDocumentFragment();
  var dotFragment = document.createDocumentFragment();

  movies.forEach(function(movie, index) {
    var slide = document.createElement('div');
    slide.className = 'hero-slide' + (index === 0 ? ' active' : '');
    slide.dataset.index = index;

    var img = document.createElement('img');
    img.src = movie.thumbnailUrl;
    img.alt = movie.title || 'Movie';
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.onerror = function() {
      this.src = 'https://placehold.co/1920x800/0a0a0f/333?text=No+Image';
    };

    slide.appendChild(img);
    fragment.appendChild(slide);

    if (indicators) {
      var dot = document.createElement('button');
      dot.className = 'hero-indicator-dot' + (index === 0 ? ' active' : '');
      dot.dataset.index = index;
      dot.setAttribute('aria-label', 'Go to slide ' + (index + 1));
      dotFragment.appendChild(dot);
    }
  });

  slider.appendChild(fragment);
  if (indicators) indicators.appendChild(dotFragment);

  updateHeroSlideInfo(movies[0]);
}

function updateHeroSlideInfo(movie) {
  var metaEl = document.getElementById('hero-slide-meta');
  var titleEl = document.getElementById('hero-slide-title');
  var watchBtn = document.getElementById('hero-slide-watch-btn');
  var infoEl = document.getElementById('hero-slide-info');

  if (!movie) return;

  var parts = [];
  if (movie.year) parts.push(escapeHTML(movie.year));
  if (movie.genre) {
    var g = movie.genre;
    if (g.length > 20) g = g.substring(0, 20) + '...';
    parts.push(escapeHTML(g));
  }
  if (movie._source === 'Translated' && movie.vjName) {
    parts.push('<span class="meta-vj">' + escapeHTML(movie.vjName.replace('vj-', 'VJ ')) + '</span>');
  }
  if (movie.rated && movie.rated !== 'N/A') parts.push(escapeHTML(movie.rated));

  var metaHTML = '';
  for (var i = 0; i < parts.length; i++) {
    if (i > 0) metaHTML += '<span class="meta-sep">·</span>';
    metaHTML += '<span>' + parts[i] + '</span>';
  }

  if (metaEl) metaEl.innerHTML = metaHTML;
  if (titleEl) titleEl.textContent = movie.title || 'Untitled';

  var source = movie._source === 'Translated' ? '&source=translated' : '';
  if (watchBtn) watchBtn.href = 'video.html?id=' + movie._id + source;

  if (infoEl) {
    infoEl.classList.remove('show');
    void infoEl.offsetWidth;
    infoEl.classList.add('show');
  }
}

function goToHeroSlide(index) {
  if (HeroSlider.isTransitioning) return;
  HeroSlider.isTransitioning = true;

  var slides = document.querySelectorAll('.hero-slide');
  var dots = document.querySelectorAll('.hero-indicator-dot');
  var total = HeroSlider.movies.length;
  if (total === 0) return;

  if (index < 0) index = total - 1;
  if (index >= total) index = 0;

  if (slides[HeroSlider.currentIndex]) slides[HeroSlider.currentIndex].classList.remove('active');
  if (dots[HeroSlider.currentIndex]) dots[HeroSlider.currentIndex].classList.remove('active');

  HeroSlider.currentIndex = index;

  if (slides[index]) slides[index].classList.add('active');
  if (dots[index]) dots[index].classList.add('active');

  updateHeroSlideInfo(HeroSlider.movies[index]);

  setTimeout(function() {
    HeroSlider.isTransitioning = false;
  }, 1200);
}

function nextHeroSlide() {
  goToHeroSlide(HeroSlider.currentIndex + 1);
}

function prevHeroSlide() {
  goToHeroSlide(HeroSlider.currentIndex - 1);
}

function startHeroSliderAuto() {
  stopHeroSliderAuto();
  HeroSlider.timer = setInterval(nextHeroSlide, HeroSlider.interval);
}

function stopHeroSliderAuto() {
  if (HeroSlider.timer) {
    clearInterval(HeroSlider.timer);
    HeroSlider.timer = null;
  }
}

function initHeroSlider() {
  var slider = document.getElementById('hero-featured-slider');
  if (!slider) return;

  fetchHeroSliderMovies().then(function(movies) {
    buildHeroSlider(movies);
    if (movies.length === 0) return;

    startHeroSliderAuto();

    var leftBtn = document.getElementById('hero-arrow-left');
    var rightBtn = document.getElementById('hero-arrow-right');

    if (leftBtn) {
      leftBtn.addEventListener('click', function() {
        stopHeroSliderAuto();
        prevHeroSlide();
        startHeroSliderAuto();
      });
    }

    if (rightBtn) {
      rightBtn.addEventListener('click', function() {
        stopHeroSliderAuto();
        nextHeroSlide();
        startHeroSliderAuto();
      });
    }

    var indicators = document.getElementById('hero-indicators');
    if (indicators) {
      indicators.addEventListener('click', function(e) {
        var dot = e.target.closest('.hero-indicator-dot');
        if (!dot) return;
        var idx = parseInt(dot.dataset.index, 10);
        if (isNaN(idx)) return;
        stopHeroSliderAuto();
        goToHeroSlide(idx);
        startHeroSliderAuto();
      });
    }

    /* Click background image → go to video */
    slider.addEventListener('click', function(e) {
      if (e.target.closest('.hero-arrow') || e.target.closest('.hero-indicators') || e.target.closest('.hero-slide-info') || e.target.closest('.hero-content')) return;
      var movie = HeroSlider.movies[HeroSlider.currentIndex];
      if (!movie) return;
      var source = movie._source === 'Translated' ? '&source=translated' : '';
      window.location.href = 'video.html?id=' + movie._id + source;
    });

    /* Pause on hover */
    var heroSection = slider.closest('.hero');
    if (heroSection) {
      heroSection.addEventListener('mouseenter', stopHeroSliderAuto);
      heroSection.addEventListener('mouseleave', startHeroSliderAuto);
    }

    /* Keyboard */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft') { stopHeroSliderAuto(); prevHeroSlide(); startHeroSliderAuto(); }
      if (e.key === 'ArrowRight') { stopHeroSliderAuto(); nextHeroSlide(); startHeroSliderAuto(); }
    });

    /* Touch swipe */
    var touchStartX = 0;
    if (heroSection) {
      heroSection.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      heroSection.addEventListener('touchend', function(e) {
        var diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
          stopHeroSliderAuto();
          if (diff > 0) nextHeroSlide(); else prevHeroSlide();
          startHeroSliderAuto();
        }
      }, { passive: true });
    }

  }).catch(function(err) {
    console.error('Hero slider error:', err);
  });
}

/* =============================================
   Stat Counter Animation
   ============================================= */
function animateCounters() {
  var counters = document.querySelectorAll('.stat-number[data-count]');
  for (var i = 0; i < counters.length; i++) {
    (function(el) {
      var target = parseInt(el.dataset.count);
      var duration = 2000;
      var start = performance.now();
      var step = function(now) {
        var elapsed = now - start;
        var progress = Math.min(elapsed / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.floor(eased * target);
        el.textContent = formatNumber(current);
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = formatNumber(target);
      };
      requestAnimationFrame(step);
    })(counters[i]);
  }
}


/* =============================================
   Login Page (with Device Limit)
   ============================================= */
function initLoginPage() {
  var form = document.getElementById('login-form');
  if (!form) return;
  
  /* Password visibility toggles */
  var toggleBtns = document.querySelectorAll('.toggle-password');
  for (var i = 0; i < toggleBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.dataset.target;
        var input = document.getElementById(targetId);
        if (!input) return;
        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        var eyeOpen = btn.querySelector('.eye-open');
        var eyeClosed = btn.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = isPassword ? 'none' : 'block';
        if (eyeClosed) eyeClosed.style.display = isPassword ? 'block' : 'none';
      });
    })(toggleBtns[i]);
  }
  
  // ============================================
  // GOOGLE REDIRECT LOGIN — UID-based Storage
  // Reads and saves under userAccounts/{uid}
  // ============================================
  
  // 1. Catch user returning from Google
  firebase.auth().getRedirectResult().then(function(result) {
    if (result.user) {
      var user = result.user;
      var uid = user.uid;
      
      // Ensure user profile exists in DB under userAccounts using the Firebase UID
      return firebase.database().ref('userAccounts/' + uid).once('value').then(function(snap) {
        if (!snap.exists()) {
          return firebase.database().ref('userAccounts/' + uid).set({
            fullName: user.displayName || 'User',
            email: user.email,
            createdAt: Date.now(),
            uid: uid,
            emailVerified: true
          });
        }
      }).then(function() {
        showToast('Welcome back!', 'success');
        setTimeout(function() { window.location.href = 'homepage.html'; }, 1000);
      });
    }
  }).catch(function(err) {
    if (err.code === 'auth/redirect-cancelled-by-user') return;
    console.error('Google Auth Error:', err);
    showToast('Google sign-in failed.', 'error');
  });
  
  // 2. The Button Click
  var googleBtn = document.getElementById('google-login-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', function() {
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithRedirect(provider);
    });
  }
  
  /* Email form submit */
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    clearFormErrors('login');
    
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var remember = document.getElementById('remember-me').checked;
    
    var valid = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFormError('login-email', 'Please enter a valid email address');
      valid = false;
    }
    if (!password || password.length < 6) {
      showFormError('login-password', 'Password must be at least 6 characters');
      valid = false;
    }
    if (!valid) return;
    
    setFormLoading('login', true);
    
    /* Step 1: Check device limit BEFORE Firebase login */
    var deviceCheckPromise;
    if (typeof ADLL !== 'undefined') {
      deviceCheckPromise = ADLL.checkBeforeLogin(email);
    } else {
      deviceCheckPromise = Promise.resolve({ allowed: true });
    }
    
    deviceCheckPromise.then(function(result) {
      /* If device limit reached, redirect */
      if (!result.allowed) {
        try {
          sessionStorage.setItem('xstream_login_credentials', JSON.stringify({
            email: email,
            password: password
          }));
        } catch (e) {}
        setFormLoading('login', false);
        if (typeof ADLL !== 'undefined') {
          ADLL.redirectToLimitPage();
        }
        return null;
      }
      
      /* Step 2: Firebase login */
      var persistence = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      return auth.setPersistence(persistence).then(function() {
        return auth.signInWithEmailAndPassword(email, password);
      });
      
    }).then(function(cred) {
      if (!cred) return;
      
      /* Step 3: Ensure profile exists under userAccounts/{uid} */
      var uid = cred.user.uid;
      var profilePromise = database.ref('userAccounts/' + uid).once('value').then(function(snap) {
        if (!snap.exists()) {
          return database.ref('userAccounts/' + uid).set({
            fullName: cred.user.displayName || 'User',
            email: cred.user.email || '',
            createdAt: Date.now(),
            uid: uid,
            emailVerified: cred.user.emailVerified || false
          });
        }
      });
      
      /* Step 4: Register this device */
      var devicePromise;
      if (typeof ADLL !== 'undefined') {
        devicePromise = ADLL.registerDevice(uid);
      } else {
        devicePromise = Promise.resolve();
      }
      
      return Promise.all([profilePromise, devicePromise]);
      
    }).then(function() {
      showToast('Welcome back!', 'success');
      setTimeout(function() { window.location.href = 'profile.html'; }, 600);
      
    }).catch(function(err) {
      setFormLoading('login', false);
      showToast(getAuthErrorMessage(err.code), 'error');
    });
  });
}


/* =============================================
   Signup Page (with Email OTP Verification)
   ============================================= */
function initSignupPage() {
  var form = document.getElementById('signup-form');
  if (!form) return;
  
  /* Password visibility toggles */
  var toggleBtns = document.querySelectorAll('.toggle-password');
  for (var i = 0; i < toggleBtns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.dataset.target;
        var input = document.getElementById(targetId);
        if (!input) return;
        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        var eyeOpen = btn.querySelector('.eye-open');
        var eyeClosed = btn.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = isPassword ? 'none' : 'block';
        if (eyeClosed) eyeClosed.style.display = isPassword ? 'block' : 'none';
      });
    })(toggleBtns[i]);
  }
  
  /* Password strength meter */
  var passwordInput = document.getElementById('signup-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', function() {
      var val = passwordInput.value;
      var fill = document.getElementById('strength-fill');
      var text = document.getElementById('strength-text');
      if (!fill || !text) return;
      
      var score = 0;
      if (val.length >= 6) score++;
      if (val.length >= 12) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      var levels = [
        { width: '0%', color: 'transparent', label: '' },
        { width: '20%', color: '#e74c3c', label: 'Weak' },
        { width: '40%', color: '#e67e22', label: 'Fair' },
        { width: '60%', color: '#f1c40f', label: 'Good' },
        { width: '80%', color: '#2ecc71', label: 'Strong' },
        { width: '100%', color: '#27ae60', label: 'Excellent' }
      ];
      var level = val.length === 0 ? levels[0] : levels[Math.min(score, 5)];
      fill.style.width = level.width;
      fill.style.background = level.color;
      text.textContent = level.label;
      text.style.color = level.color;
      
      var confirmInput = document.getElementById('signup-confirm-password');
      var confirmError = document.getElementById('signup-confirm-password-error');
      if (confirmInput && confirmError && confirmInput.value.length > 0) {
        if (confirmInput.value === val) {
          confirmError.textContent = '';
          confirmInput.style.borderColor = '';
        }
      }
    });
  }
  
  /* ============================================
     Google Sign Up — UID-based Database Storage
     Uses Firebase UID as the database key under
     the userAccounts node. Never uses email as
     a key, push(), or generated IDs.
     ============================================ */
  
  /* 1. Check if user is returning from Google redirect */
  auth.getRedirectResult().then(function(result) {
    if (result.user) {
      var isNewUser = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
      var user = result.user;
      
      if (!user.email) {
        showToast('Could not get email from Google account.', 'error');
        return;
      }
      
      /* Use the Firebase Auth UID as the sole database key */
      var uid = user.uid;
      
      if (isNewUser) {
        database.ref('userAccounts/' + uid).once('value').then(function(snap) {
          if (!snap.exists()) {
            /* Store only the required fields under userAccounts/{uid} */
            return database.ref('userAccounts/' + uid).set({
              fullName: user.displayName || 'User',
              email: user.email,
              createdAt: Date.now(),
              uid: uid,
              emailVerified: true
            });
          }
        }).then(function() {
          showToast('Welcome to xStream!', 'success');
          setTimeout(function() { window.location.href = 'profile.html'; }, 600);
        }).catch(function(error) {
          console.error('Google signup DB error:', error);
          showToast('Failed to save account. Please try again.', 'error');
        });
      } else {
        showToast('Welcome back!', 'success');
        setTimeout(function() { window.location.href = 'profile.html'; }, 600);
      }
    }
  }).catch(function(err) {
    if (err.code === 'auth/redirect-cancelled-by-user') return;
    console.error('Google Auth error:', err);
  });
  
  /* 2. The Button Click — Sends user straight to Google */
  var googleBtn = document.getElementById('google-signup-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', function() {
      var provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithRedirect(provider);
    });
  }
  
  /* ============================================
     Form Submit — Redirect to OTP Verification
     Does NOT create the Firebase account here.
     Does NOT write to Realtime Database here.
     Stores temporary data in sessionStorage and
     redirects to verification.html, which handles
     account creation and UID-based database storage
     under the userAccounts node.
     ============================================ */
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    clearFormErrors('signup');
    
    var name = document.getElementById('signup-name').value.trim();
    var email = document.getElementById('signup-email').value.trim();
    var password = document.getElementById('signup-password').value;
    var confirmPassword = document.getElementById('signup-confirm-password').value;
    var agreeTerms = document.getElementById('agree-terms').checked;
    
    /* Validation — only fields that exist on the form */
    var valid = true;
    if (!name || name.length < 2) {
      showFormError('signup-name', 'Full name must be at least 2 characters');
      valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFormError('signup-email', 'Please enter a valid email address');
      valid = false;
    }
    if (!password || password.length < 6) {
      showFormError('signup-password', 'Password must be at least 6 characters');
      valid = false;
    }
    if (password !== confirmPassword) {
      showFormError('signup-confirm-password', 'Passwords do not match');
      valid = false;
    }
    if (!agreeTerms) {
      showToast('You must agree to the Terms of Service', 'warning');
      valid = false;
    }
    if (!valid) return;
    
    setFormLoading('signup', true);
    
    /* Step 1: Check if email is already registered
       Uses Firebase Auth directly — does NOT query Realtime Database.
       Auth is the single source of truth for account existence. */
    auth.fetchSignInMethodsForEmail(email).then(function(methods) {
      if (methods && methods.length > 0) {
        setFormLoading('signup', false);
        showFormError('signup-email', 'An account with this email already exists');
        return;
      }
      
      /* Step 2: Save temporary signup data to sessionStorage
         Password is held here only — never written to Realtime Database.
         The verification page will read this, create the Auth account,
         get the UID, and save the database record at userAccounts/{uid}. */
      var signupData = {
        fullName: name,
        email: email,
        password: password,
        timestamp: Date.now()
      };
      
      try {
        sessionStorage.setItem('xstream_signup_data', JSON.stringify(signupData));
      } catch (err) {
        setFormLoading('signup', false);
        showToast('Unable to save form data. Please enable cookies.', 'error');
        return;
      }
      
      /* Step 3: Redirect to verification page
         verification.html will:
         - Create the Firebase Auth account with email + password
         - Get the authenticated user's UID
         - Save the database record at userAccounts/{uid} with:
           { fullName, email, createdAt, uid, emailVerified } */
      window.location.href = 'verification.html';
      
    }).catch(function(err) {
      setFormLoading('signup', false);
      console.error('Signup pre-check error:', err);
      showToast('Something went wrong. Please try again.', 'error');
    });
  });
}


/* =============================================
   Video Watch Page
   ============================================= */
function initVideoPage() {
  var urlParams = new URLSearchParams(window.location.search);
  var videoId = urlParams.get('id');
  var isOffline = urlParams.get('offline') === 'true';
  
  if (isOffline) {
    OfflineDB.getVideo(videoId).then(function(data) {
      if (!data || !data.blob) {
        showToast('Offline file not found.', 'error');
        showVideoNotFound();
        return;
      }
      
      var wrapper = document.getElementById('video-player-wrapper');
      var info = document.getElementById('video-info');
      var notFound = document.getElementById('video-not-found');
      
      if (notFound) notFound.style.display = 'none';
      if (wrapper && info) {
        var blobUrl = URL.createObjectURL(data.blob);
        wrapper.innerHTML = '<video controls playsinline src="' + blobUrl + '">Your browser does not support the video tag.</video>';
        
        var videoTitle = document.getElementById('video-title');
        if (videoTitle) videoTitle.textContent = data.title || 'Offline Video';
        
        var videoDescription = document.getElementById('video-description');
        if (videoDescription) videoDescription.textContent = 'You are watching this offline. No internet connection is required.';
        
        var videoMeta = document.querySelector('.video-meta');
        if (videoMeta) videoMeta.style.display = 'none';
        
        info.style.display = 'block';
        document.title = (data.title || 'Offline Video') + ' — Xstream';
      }
    }).catch(function() {
      showVideoNotFound();
    });
    return;
  }
  
  if (!videoId) {
    showVideoNotFound();
    return;
  }
  
  // --- UPDATED: Robust fetch that checks BOTH description and Translated ---
  function fetchVideoFromBothPaths(id) {
    return database.ref('description/' + id).once('value').then(function(snapshot) {
      var data = snapshot.val();
      if (data && data.title) {
        data._id = id;
        data._isTranslated = false;
        return data;
      }
      // If not in regular movies, check Translated
      return database.ref('Translated/' + id).once('value').then(function(transSnap) {
        var transData = transSnap.val();
        if (transData && transData.title) {
          transData._id = id;
          transData._isTranslated = true;
          return transData;
        }
        return null; // Not found in either
      });
    });
  }
  // -----------------------------------------------------------------------
  
  fetchVideoFromBothPaths(videoId).then(function(videoData) {
        if (!videoData) {
          showVideoNotFound();
          return;
        }
        
        renderVideoPlayer(videoData);
        incrementViews(videoId);
        
        // --- ADDED: Thumbnail in Description Box ---
        (function() {
          setTimeout(function() {
            var descBox = document.querySelector('.video-description-box');
            if (descBox && videoData) {
              var thumbUrl = getThumbnailUrl(videoData);
              var thumbHtml = '<div class="desc-thumbnail-wrapper"><img src="' + thumbUrl + '" alt="' + escapeHTML(videoData.title || 'Movie') + ' Thumbnail" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>';
              descBox.insertAdjacentHTML('afterbegin', thumbHtml);
            }
          }, 50);
        })();
        // ------------------------------------------
    
    /* Like / Dislike */
    var likeBtn = document.getElementById('like-btn');
    var dislikeBtn = document.getElementById('dislike-btn');
    if (likeBtn) likeBtn.addEventListener('click', function() { toggleLike(videoId); });
    if (dislikeBtn) dislikeBtn.addEventListener('click', function() { toggleDislike(videoId); });
    
     /* ═══════════════════════════════════════════════
   Share — Native Web Share API + Warm Messages
   ═══════════════════════════════════════════════ */
  
  /* Helper: Copy text to clipboard with fallback */
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Link & details copied to clipboard! 📋', 'success');
      }).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }
  
  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Link & details copied! 📋', 'success');
    } catch (e) {
      showToast('Could not copy — please share manually', 'warning');
    }
    document.body.removeChild(textarea);
  }
  
  /* Helper: Update OG meta tags for link previews */
  function updateShareMeta(title, description, imageUrl, url) {
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:image', imageUrl, 'property');
    setMeta('og:url', url, 'property');
    setMeta('og:type', 'video.movie', 'property');
    setMeta('twitter:card', 'summary_large_image', 'name');
    setMeta('twitter:title', title, 'name');
    setMeta('twitter:description', description, 'name');
    setMeta('twitter:image', imageUrl, 'name');
  }
  
  function setMeta(key, content, attr) {
    var el = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (el) {
      el.setAttribute('content', content);
    } else {
      var meta = document.createElement('meta');
      meta.setAttribute(attr, key);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    }
  }
  
  /* Main share handler */
  var shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function() {
      /* ── Gather video data from multiple possible sources ── */
      var vd = (typeof currentVideoData !== 'undefined') ? currentVideoData : {};
      var title = vd.title ||
        (document.getElementById('video-title') ? document.getElementById('video-title').textContent.trim() : '') ||
        document.title ||
        'Amazing Movie';
      var year = vd.year || '';
      var genre = vd.genre || '';
      var rating = vd.imdbRating || '';
      var director = vd.director || '';
      var thumbnail = vd.thumbnailUrl || '';
      var url = window.location.href;
      
      /* ── Build warm share text ── */
      var line = '━━━━━━━━━━━━━━━━━━\n';
      var shareText = line +
        '🎬 XSTRΞAM FLIMS\n' +
        line + '\n' +
        '🔥 "' + title + '"\n\n';
      
      if (year) shareText += '📅 Year: ' + year + '\n';
      if (rating) shareText += '⭐ IMDB: ' + rating + '/10\n';
      if (genre) shareText += '🎭 Genre: ' + genre + '\n';
      if (director) shareText += '🎥 Director: ' + director + '\n';
      
      shareText += '\n' +
        '✨ Watch it FREE in HD quality!\n' +
        '🚀 No ads, no signup hassle.\n\n' +
        '👇 Watch now:\n' +
        url + '\n\n' +
        line +
        '📖 "Where every frame tells a story"\n' +
        line;
      
      /* ── Update OG meta tags for rich link previews ── */
      var ogDesc = 'Watch "' + title + '"';
      if (year) ogDesc += ' (' + year + ')';
      if (rating) ogDesc += ' — ⭐ ' + rating + '/10';
      if (genre) ogDesc += ' — ' + genre;
      ogDesc += ' only on XSTREAM FLIMS. Free HD streaming, no ads!';
      
      updateShareMeta(
        title + ' — XSTREAM FLIMS',
        ogDesc,
        thumbnail,
        url
      );
      
      /* ── Share data object ── */
      var shareData = {
        title: '🎬 ' + title + ' — XSTREAM FLIMS',
        text: shareText,
        url: url
      };
      
      /* ── Try native Web Share API (WhatsApp, Telegram, etc.) ── */
      if (navigator.share) {
        navigator.share(shareData).then(function() {
          showToast('Shared successfully! 🎉', 'success');
        }).catch(function(err) {
          // User cancelled the share menu — don't show error
          if (err.name !== 'AbortError') {
            // Actual error — fall back to clipboard
            copyToClipboard(shareText);
          }
        });
      } else {
        /* ── No Web Share API (desktop Chrome, etc.) → clipboard ── */
        copyToClipboard(shareText);
      }
    });
  }
    
    /* Favourite */
    var favouriteBtn = document.getElementById('favourite-btn');
    var favouriteLabel = document.getElementById('favourite-label');
    if (favouriteBtn) {
      var isFav = AppState.favouriteVideos.indexOf(videoId) >= 0;
      favouriteBtn.classList.toggle('favourited', isFav);
      if (favouriteLabel) favouriteLabel.textContent =
  isFav ? 'Added to Watch List' : 'Add to Watch List';
      
      favouriteBtn.addEventListener('click', function() {
        if (!AppState.currentUser) {
          showToast('Please sign in to add favourites', 'warning');
          return;
        }
        toggleFavourite(videoId);
        var nowFav =userAccounts/{uid}/watchList/{videoId}.indexOf(videoId) >= 0;
        favouriteBtn.classList.toggle('favourited', nowFav);
        if (favouriteLabel) favouriteLabel.textContent = nowFav ? 'Favourited' : 'Favourite';
        showToast(nowFav ? 'Added to Watch List' : 'Removed from Watch List', nowFav ? 'success' : 'info');
      });
    }
    
    /* Download */
    var downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function() {
        var videoUrl = getVideoUrl(videoData);
        if (!videoUrl) {
          showToast('Movie file not available for download', 'error');
          return;
        }
        
        if (!AppState.currentUser) {
          showToast('Please sign in to download movies', 'warning');
          return;
        }
        
        downloadBtn.classList.add('downloading');
        var dlText = downloadBtn.childNodes[downloadBtn.childNodes.length - 1];
        var originalText = dlText.textContent;
        dlText.textContent = 'Fetching...';
        
        downloadForOffline(videoId, videoUrl, videoData.title || 'Video')
          .then(function() {
            dlText.textContent = 'Saved!';
            setTimeout(function() {
              downloadBtn.classList.remove('downloading');
              dlText.textContent = originalText;
            }, 2000);
          })
          .catch(function() {
            downloadBtn.classList.remove('downloading');
            dlText.textContent = originalText;
          });
      });
    }
    
    updateLikeDislikeUI(videoId);
    
    /* Related Videos */
    fetchRelatedVideos(videoId, 8).then(function(videos) {
      var container = document.getElementById('related-videos');
      if (!container) return;
      container.innerHTML = '';
      if (videos.length === 0) {
        container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">No related movies found.</p>';
        return;
      }
      videos.forEach(function(v) { container.appendChild(createWidgetVideoItem(v)); });
      initLazyLoading();
    });
    
  }).catch(function(err) {
    console.error('Video fetch error:', err);
    showVideoNotFound();
  });
}



function renderVideoPlayer(videoData) {
  var wrapper = document.getElementById('video-player-wrapper');
  var info = document.getElementById('video-info');
  var notFound = document.getElementById('video-not-found');
  
  if (!wrapper || !info) return;
  if (notFound) notFound.style.display = 'none';
  
  var videoUrl = getVideoUrl(videoData);
  if (videoUrl) {
    // FIXED: Removed the vidEl.play() block to restore iPhone audio
    wrapper.innerHTML = '<video controls playsinline preload="metadata" src="' + videoUrl + '">...</video>';
  } else {
    wrapper.innerHTML = '<div style="aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; background:var(--bg-elevated); flex-direction:column; gap:12px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color:var(--text-muted)"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="m10 8 5 4-5 4V8z"/></svg><p style="color:var(--text-muted); font-size:0.9rem;"> file not available</p></div>';
  }
  
  var videoTitle = document.getElementById('video-title');
  var videoDescription = document.getElementById('video-description');
  var videoViews = document.querySelector('#video-views span');
  var videoDate = document.querySelector('#video-date span');
  var videoCountryBadge = document.querySelector('#video-country-badge span');
  var likeCount = document.getElementById('like-count');
  var dislikeCount = document.getElementById('dislike-count');
  
  if (videoTitle) videoTitle.textContent = videoData.title || 'Untitled';
  if (videoDescription) videoDescription.textContent = videoData.description || 'No description available.';
  if (videoViews) videoViews.textContent = formatNumber(videoData.views || 0) + ' views';
  if (videoDate) videoDate.textContent = formatDate(videoData.createdAt);
  if (videoCountryBadge) videoCountryBadge.textContent = videoData.country || 'Unknown';
  if (likeCount) likeCount.textContent = formatNumber(videoData.likes || 0);
  if (dislikeCount) dislikeCount.textContent = formatNumber(videoData.dislikes || 0);
  
  info.style.display = 'block';
  document.title = (videoData.title || 'Video') + ' — Xstream';
  
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.content = (videoData.description || '').substring(0, 160);
}

function showVideoNotFound() {
  var wrapper = document.getElementById('video-player-wrapper');
  var info = document.getElementById('video-info');
  var notFound = document.getElementById('video-not-found');
  if (wrapper) wrapper.style.display = 'none';
  if (info) info.style.display = 'none';
  if (notFound) notFound.style.display = 'block';
}

/* =============================================
   Form Helpers
   ============================================= */
function showFormError(fieldId, message) {
  var errorEl = document.getElementById(fieldId + '-error');
  if (errorEl) errorEl.textContent = message;
  var input = document.getElementById(fieldId);
  if (input) input.style.borderColor = 'var(--error)';
}

function clearFormErrors(prefix) {
  var errorFields = {
    login: ['login-email', 'login-password'],
    signup: ['signup-name', 'signup-email', 'signup-password', 'signup-confirm-password', 'signup-country', 'signup-age'],
    forgot: ['forgot-email'],
    upload: ['video-file', 'thumb-file', 'upload-title', 'upload-desc', 'upload-category']
  };
  var fields = errorFields[prefix] || [];
  fields.forEach(function(id) {
    var errorEl = document.getElementById(id + '-error');
    if (errorEl) errorEl.textContent = '';
    var input = document.getElementById(id);
    if (input) input.style.borderColor = '';
  });
}

function setFormLoading(prefix, loading) {
  var submitId = prefix + '-submit';
  var btn = document.getElementById(submitId);
  if (!btn) return;
  var text = btn.querySelector('.btn-text');
  var spinner = btn.querySelector('.btn-spinner');
  if (loading) {
    btn.disabled = true;
    if (text) text.style.opacity = '0';
    if (spinner) spinner.style.display = 'block';
  } else {
    btn.disabled = false;
    if (text) text.style.opacity = '1';
    if (spinner) spinner.style.display = 'none';
  }
}

function getAuthErrorMessage(code) {
  var messages = {
    'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
    'auth/invalid-email': 'The email address is not valid.',
    'auth/weak-password': 'Password is too weak. Use at least 8 characters with a mix of letters, numbers, and symbols.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/too-many-requests': 'Too many failed attempts. Please wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/user-disabled': 'This account has been disabled. Contact support for help.',
    'auth/invalid-verification-code': 'The verification code is invalid or expired.',
    'auth/invalid-reset-token': 'The password reset link is invalid or has expired.'
  };
  return messages[code] || 'An unexpected error occurred. Please try again.';
}
function initViewAllLiveSearch() {
  var searchInput = document.getElementById('viewall-search-input');
  var clearBtn = document.getElementById('viewall-search-clear');
  var grid = document.getElementById('videos-grid');
  var noVideos = document.getElementById('no-videos');
  var loadMoreContainer = document.getElementById('load-more-container');
  var activeFiltersDiv = document.getElementById('active-filters');
  var activeFilterChips = document.getElementById('active-filter-chips');
  var clearAllFilters = document.getElementById('clear-all-filters');
  
  if (!searchInput || !grid) return;
  
  var searchTimeout = null;
  
  function performLiveSearch(query) {
    grid.innerHTML = '';
    noVideos.style.display = 'none';
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    
    if (!query || query.trim().length < 2) {
      activeFiltersDiv.style.display = 'none';
      // Reload default view (fallback to fetchVideos if page function missing)
      if (typeof loadViewAllVideos === 'function') {
        loadViewAllVideos();
      } else {
        fetchVideos(AppState.itemsPerPage, null, 'all', 'recent', '').then(function(res) {
          renderResults(res.videos);
        });
      }
      return;
    }
    
    // Show active filter chip
    if (activeFiltersDiv) {
      activeFiltersDiv.style.display = 'flex';
      if (activeFilterChips) {
        activeFilterChips.innerHTML = '<span class="filter-chip">Search: "' + escapeHTML(query) + '"</span>';
      }
    }
    
    // Show skeletons while loading
    for (var i = 0; i < 8; i++) {
      grid.innerHTML += '<div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>';
    }
    
    // Fetch universally using the search parameter
    fetchVideos(AppState.itemsPerPage, null, 'all', 'recent', query).then(function(res) {
      grid.innerHTML = '';
      renderResults(res.videos);
    });
  }
  
  function renderResults(videos) {
    if (videos.length === 0) {
      noVideos.style.display = 'flex';
      return;
    }
    for (var i = 0; i < videos.length; i++) {
      grid.appendChild(createVideoCard(videos[i]));
    }
  }
  
  // Live typing listener (debounced at 400ms)
  searchInput.addEventListener('input', function() {
    var query = this.value.trim();
    clearBtn.style.display = query.length > 0 ? 'block' : 'none';
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
      performLiveSearch(query);
    }, 400);
  });
  
  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      performLiveSearch('');
    });
  }
  
  // "Clear All" text button
  if (clearAllFilters) {
    clearAllFilters.addEventListener('click', function() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      performLiveSearch('');
    });
  }
  
  // CATCH OLD LINKS: If user comes from homepage sidebar (e.g., ?category=action or ?search=avatar)
  var urlParams = new URLSearchParams(window.location.search);
  var initialSearch = urlParams.get('search') || urlParams.get('q') || urlParams.get('category') || '';
  if (initialSearch && initialSearch.toLowerCase() !== 'all') {
    searchInput.value = initialSearch;
    clearBtn.style.display = 'block';
    performLiveSearch(initialSearch);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initViewAllLiveSearch);

/* =============================================
   Profile Page Data Loaders (Rewritten)
   ============================================= */

function loadUserFavourites(uid) {
  var container = document.getElementById('profile-favourites-list');
  if (!container) return Promise.resolve([]);
  
  container.innerHTML = '<div class="profile-loading-state"><div class="profile-spinner"></div><span>Loading favourites...</span></div>';
  
  return database.ref('userAccounts/' + uid + '/favourites').once('value').then(function(snap) {
    if (!snap.exists()) {
      container.innerHTML = '<div class="profile-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><p>No favourites yet</p><span>Browse and save your favourite content</span></div>';
      return Promise.resolve([]);
    }
    
    var movieIds = [];
    var liveChannels = [];
    
    snap.forEach(function(child) {
      var data = child.val();
      if (typeof data === 'number') {
        movieIds.push(child.key);
      } else if (typeof data === 'object' && data.streamUrl) {
        var channelData = Object.assign({ id: child.key }, data);
        liveChannels.push(channelData);
      }
    });
    
    if (movieIds.length === 0 && liveChannels.length === 0) {
      container.innerHTML = '<div class="profile-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><p>No favourites yet</p><span>Browse and save your favourite content</span></div>';
      return Promise.resolve([]);
    }
    
    var moviePromises = movieIds.slice(0, 18).map(function(id) {
      return fetchVideoById(id);
    });
    
    return Promise.all(moviePromises).then(function(movieResults) {
      var html = '';
      
      // 1. Render Live TV Channels
      liveChannels.forEach(function(ch) {
        var thumbHtml = ch.thumbnail ?
          '<img src="' + ch.thumbnail + '" alt="' + escapeHTML(ch.name) + '" onerror="this.parentElement.innerHTML=\'<div class=\\\'profile-card-placeholder\\\'>TV</div>\'">' :
          '<div class="profile-card-placeholder">TV</div>';
        
        html += '<div class="profile-card" onclick="window.location.href=\'channel.html?id=' + ch.id + '\'">' +
          '<div class="profile-card-thumb">' +
          thumbHtml +
          '<div class="profile-card-overlay">' +
          '<div class="profile-card-play-btn"><svg viewBox="0 0 24 24" fill="#fff" width="32" height="32"><polygon points="6,3 20,12 6,21"/></svg></div>' +
          '</div>' +
          '<span class="profile-card-badge profile-card-badge--live">LIVE</span>' +
          '</div>' +
          '<div class="profile-card-body">' +
          '<h3 class="profile-card-title">' + escapeHTML(ch.name) + '</h3>' +
          '<p class="profile-card-meta">' + escapeHTML(ch.country || 'Unknown') + ' &bull; ' + escapeHTML(ch.category || 'General') + '</p>' +
          '</div>' +
          '<button class="profile-card-remove" onclick="event.stopPropagation(); removeFavourite(\'' + ch.id + '\')" title="Remove from favourites">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '</div>';
      });
      
      // 2. Render Standard Movies
      movieResults.forEach(function(v) {
        if (!v) return;
        
        html += '<div class="profile-card" onclick="window.location.href=\'video.html?id=' + v._id + '\'">' +
          '<div class="profile-card-thumb">' +
          '<img src="' + getThumbnailUrl(v) + '" alt="' + escapeHTML(v.title || 'Untitled') + '" onerror="this.src=\'https://placehold.co/300x170/e63946/fff?text=No+Image\'">' +
          '<div class="profile-card-overlay">' +
          '<div class="profile-card-play-btn"><svg viewBox="0 0 24 24" fill="#fff" width="32" height="32"><polygon points="6,3 20,12 6,21"/></svg></div>' +
          '</div>' +
          '</div>' +
          '<div class="profile-card-body">' +
          '<h3 class="profile-card-title">' + escapeHTML(v.title || 'Untitled') + '</h3>' +
          '<p class="profile-card-meta">' + formatDate(v.createdAt) + '</p>' +
          '</div>' +
          '<button class="profile-card-remove" onclick="event.stopPropagation(); removeFavourite(\'' + v._id + '\')" title="Remove from favourites">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
          '</div>';
      });
      
      container.innerHTML = '<div class="profile-scroll-container">' + html + '</div>';
      
      // Scroll to bottom initially so user can scroll up
      var scrollBox = container.querySelector('.profile-scroll-container');
      if (scrollBox) {
        setTimeout(function() {
          scrollBox.scrollTop = scrollBox.scrollHeight;
        }, 50);
      }
      
      return movieResults.concat(liveChannels);
    });
  }).catch(function(error) {
    console.error('loadUserFavourites error:', error);
    container.innerHTML = '<div class="profile-empty-state profile-empty-state--error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Failed to load favourites</p><span>Please check your connection and try again</span></div>';
    return [];
  });
}

function loadUserDownloads(uid) {
  var container = document.getElementById('profile-downloads-list');
  if (!container) return Promise.resolve([]);
  
  container.innerHTML = '<div class="profile-loading-state"><div class="profile-spinner"></div><span>Loading downloads...</span></div>';
  
  return database.ref('userAccounts/' + uid + '/downloads').once('value').then(function(snap) {
    var items = [];
    snap.forEach(function(child) {
      var data = child.val();
      items.push({
        id: child.key,
        url: data.url,
        title: data.title,
        date: data.downloadedAt
      });
    });
    
    if (items.length === 0) {
      container.innerHTML = '<div class="profile-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><p>No downloads yet</p><span>Download content to watch offline</span></div>';
      return Promise.resolve([]);
    }
    
    // Fixed: use 'date' property for sorting
    items.sort(function(a, b) {
      return (b.date || 0) - (a.date || 0);
    });
    
    var html = '';
    items.forEach(function(item) {
      html += '<div class="profile-card" onclick="window.playOffline(\'' + item.id + '\')">' +
        '<div class="profile-card-thumb profile-card-thumb--offline">' +
        '<div class="profile-card-overlay">' +
        '<div class="profile-card-play-btn"><svg viewBox="0 0 24 24" fill="#fff" width="32" height="32"><polygon points="6,3 20,12 6,21"/></svg></div>' +
        '<span class="profile-card-offline-label">OFFLINE</span>' +
        '</div>' +
        '</div>' +
        '<div class="profile-card-body">' +
        '<h3 class="profile-card-title">' + escapeHTML(item.title || 'Untitled') + '</h3>' +
        '<p class="profile-card-meta">Downloaded ' + formatDate(item.date) + '</p>' +
        '</div>' +
        '<button class="profile-card-remove" onclick="event.stopPropagation(); removeDownload(\'' + item.id + '\')" title="Remove download">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '</div>';
    });
    
    container.innerHTML = '<div class="profile-scroll-container">' + html + '</div>';
    
    // Scroll to bottom initially
    var scrollBox = container.querySelector('.profile-scroll-container');
    if (scrollBox) {
      setTimeout(function() {
        scrollBox.scrollTop = scrollBox.scrollHeight;
      }, 50);
    }
    
    return items;
  }).catch(function(error) {
    console.error('loadUserDownloads error:', error);
    container.innerHTML = '<div class="profile-empty-state profile-empty-state--error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Failed to load downloads</p><span>Please check your connection and try again</span></div>';
    return [];
  });
}

function loadUserHistory(uid) {
  var container = document.getElementById('profile-history-list');
  if (!container) return Promise.resolve([]);
  
  container.innerHTML = '<div class="profile-loading-state"><div class="profile-spinner"></div><span>Loading history...</span></div>';
  
  return database.ref('userAccounts/' + uid + '/history').once('value').then(function(snap) {
    var entries = [];
    snap.forEach(function(child) {
      var ts = child.val();
      entries.push({ id: child.key, timestamp: ts });
    });
    
    if (entries.length === 0) {
      container.innerHTML = '<div class="profile-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>No watch history yet</p><span>movies you watch will appear here</span></div>';
      return Promise.resolve([]);
    }
    
    entries.sort(function(a, b) {
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    
    var topEntries = entries.slice(0, 30);
    var promises = topEntries.map(function(entry) {
      return fetchVideoById(entry.id);
    });
    
    return Promise.all(promises).then(function(results) {
      var html = '';
      results.forEach(function(v, index) {
        if (!v) return;
        
        // Fixed: use actual watch timestamp
        var watchedAt = topEntries[index].timestamp;
        
        html += '<div class="profile-card" onclick="window.location.href=\'video.html?id=' + v._id + '\'">' +
          '<div class="profile-card-thumb">' +
          '<img src="' + getThumbnailUrl(v) + '" alt="' + escapeHTML(v.title || 'Untitled') + '" onerror="this.src=\'https://placehold.co/300x170/e63946/fff?text=No+Image\'">' +
          '<div class="profile-card-overlay">' +
          '<div class="profile-card-play-btn"><svg viewBox="0 0 24 24" fill="#fff" width="32" height="32"><polygon points="6,3 20,12 6,21"/></svg></div>' +
          '</div>' +
          '<span class="profile-card-badge profile-card-badge--history"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Watched</span>' +
          '</div>' +
          '<div class="profile-card-body">' +
          '<h3 class="profile-card-title">' + escapeHTML(v.title || 'Untitled') + '</h3>' +
          '<p class="profile-card-meta">Watched ' + formatDate(watchedAt) + '</p>' +
          '</div>' +
          '</div>';
      });
      
      container.innerHTML = '<div class="profile-scroll-container">' + html + '</div>';
      
      // Scroll to bottom initially
      var scrollBox = container.querySelector('.profile-scroll-container');
      if (scrollBox) {
        setTimeout(function() {
          scrollBox.scrollTop = scrollBox.scrollHeight;
        }, 50);
      }
      
      return results;
    });
  }).catch(function(error) {
    console.error('loadUserHistory error:', error);
    container.innerHTML = '<div class="profile-empty-state profile-empty-state--error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Failed to load history</p><span>Please check your connection and try again</span></div>';
    return [];
  });
}

/* =============================================
   Clear Watch History
   ============================================= */
function clearWatchHistory(uid) {
  if (!confirm('Clear all watch history?')) return;
  
  var container = document.getElementById('profile-history-list');
  
  if (container) {
    container.innerHTML =
      '<div class="profile-loading-state"><div class="profile-spinner"></div><span>Clearing history...</span></div>';
  }
  
  database.ref('userAccounts/' + uid + '/watchedHistory').remove()
    .then(function() {
      
      if (container) {
        container.innerHTML =
          '<div class="profile-empty-state">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">' +
          '<circle cx="12" cy="12" r="10"/>' +
          '<polyline points="12 6 12 12 16 14"/>' +
          '</svg>' +
          '<p>No watch history yet</p>' +
          '<span>Movies you watch will appear here</span>' +
          '</div>';
      }
      
    })
    .catch(function(error) {
      
      console.error('clearWatchHistory error:', error);
      
      if (container) {
        container.innerHTML =
          '<div class="profile-empty-state profile-empty-state--error">' +
          '<p>Failed to clear history</p>' +
          '</div>';
      }
      
    });
}
 

/* =============================================
   View All Page — No Pagination
   Reads from "description" + "Translated" ONLY
   ============================================= */
var VIEWALL_STATE = {
  allVideos: [],
  currentCategory: 'all',
  currentSort: 'recent',
  currentYear: ''
};

function initViewAllPage() {
  var grid = document.getElementById('videos-grid');
  if (!grid) return;
  
  var loadMoreBtn = document.getElementById('load-more-btn');
  var catFilter = document.getElementById('category-filter');
  var sortFilter = document.getElementById('sort-filter');
  
  /* Hide Load More — everything loads at once */
  if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  
  /* Read URL params */
  var urlParams = new URLSearchParams(window.location.search);
  VIEWALL_STATE.currentYear = urlParams.get('year') || '';
  VIEWALL_STATE.currentCategory = 'all';
  VIEWALL_STATE.currentSort = 'recent';
  
  var urlSort = urlParams.get('sort');
  var urlCat = urlParams.get('category');
  if (urlSort) VIEWALL_STATE.currentSort = urlSort;
  if (urlCat) VIEWALL_STATE.currentCategory = urlCat;
  
  if (catFilter) catFilter.value = VIEWALL_STATE.currentCategory;
  if (sortFilter) sortFilter.value = VIEWALL_STATE.currentSort;
  
  /* Update page header if filtering by year */
  if (VIEWALL_STATE.currentYear) {
    setViewAllHeader(
      'Movies from ' + VIEWALL_STATE.currentYear,
      'Browse all movies released in ' + VIEWALL_STATE.currentYear + '.',
      'Year: ' + VIEWALL_STATE.currentYear
    );
    showActiveFilterChips();
  } else {
    resetViewAllHeader();
    showActiveFilterChips();
  }
  
  /* Fetch from nodes, then render (uses cache if available for SPA speed) */
  fetchFromBothNodes();
  
  /* ---- Category ---- */
  if (catFilter) {
    catFilter.addEventListener('change', function() {
      VIEWALL_STATE.currentCategory = catFilter.value;
      filterAndRender();
      showActiveFilterChips();
    });
  }
  
  /* ---- Sort ---- */
  if (sortFilter) {
    sortFilter.addEventListener('change', function() {
      VIEWALL_STATE.currentSort = sortFilter.value;
      filterAndRender();
    });
  }
  
  /* ---- Clear filters ---- */
  var clearBtn = document.getElementById('clear-all-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      VIEWALL_STATE.currentCategory = 'all';
      VIEWALL_STATE.currentSort = 'recent';
      VIEWALL_STATE.currentYear = '';
      if (catFilter) catFilter.value = 'all';
      if (sortFilter) sortFilter.value = 'recent';
      
      resetViewAllHeader();
      filterAndRender();
      showActiveFilterChips();
    });
  }
}


/* -------------------------------------------------------
   Header Helpers
   ------------------------------------------------------- */
function setViewAllHeader(title, subtitle, breadcrumb) {
  var pageTitle = document.getElementById('viewall-page-title');
  var pageSubtitle = document.getElementById('viewall-page-subtitle');
  var breadcrumbCurrent = document.getElementById('breadcrumb-current');
  var titleEl = document.getElementById('viewall-title');
  
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) pageSubtitle.textContent = subtitle;
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = breadcrumb;
  if (titleEl) {
    titleEl.innerHTML = '<svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + escapeHTML(title);
  }
}

function resetViewAllHeader() {
  setViewAllHeader(
    'All Movies',
    'Browse the complete collection of Movies from creators worldwide.',
    'All Movies'
  );
  var titleEl = document.getElementById('viewall-title');
  if (titleEl) {
    titleEl.innerHTML = '<svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> All Movies';
  }
}

/* -------------------------------------------------------
   showActiveFilterChips
   ------------------------------------------------------- */
function showActiveFilterChips() {
  var container = document.getElementById('active-filters');
  var chipsContainer = document.getElementById('active-filter-chips');
  if (!container || !chipsContainer) return;
  
  var hasFilter = false;
  var chipsHTML = '';
  
  if (VIEWALL_STATE.currentYear) {
    hasFilter = true;
    chipsHTML += '<span class="active-chip">Year: ' + escapeHTML(VIEWALL_STATE.currentYear) + ' <button onclick="removeYearFilter()" class="chip-remove">&times;</button></span>';
  }
  
  if (VIEWALL_STATE.currentCategory && VIEWALL_STATE.currentCategory !== 'all') {
    hasFilter = true;
    chipsHTML += '<span class="active-chip">' + escapeHTML(VIEWALL_STATE.currentCategory) + ' <button onclick="removeCategoryFilter()" class="chip-remove">&times;</button></span>';
  }
  
  if (hasFilter) {
    container.style.display = 'flex';
    chipsContainer.innerHTML = chipsHTML;
  } else {
    container.style.display = 'none';
    chipsContainer.innerHTML = '';
  }
}

function removeYearFilter() {
  VIEWALL_STATE.currentYear = '';
  resetViewAllHeader();
  filterAndRender();
  showActiveFilterChips();
}

function removeCategoryFilter() {
  VIEWALL_STATE.currentCategory = 'all';
  var catFilter = document.getElementById('category-filter');
  if (catFilter) catFilter.value = 'all';
  filterAndRender();
  showActiveFilterChips();
}

/* -------------------------------------------------------
   FILTER & RENDER (New Uploads First)
   ------------------------------------------------------- */
function filterAndRender() {
  var grid = document.getElementById('videos-grid');
  if (!grid) return;
  
  var videos = VIEWALL_STATE.allVideos.slice();
  
  /* --- 1. FILTER BY CATEGORY --- */
  if (VIEWALL_STATE.currentCategory !== 'all') {
    videos = videos.filter(function(v) {
      var vidCat = (v.genre || v.category || '').toLowerCase();
      return vidCat === VIEWALL_STATE.currentCategory.toLowerCase();
    });
  }
  
  /* --- 2. FILTER BY YEAR --- */
  if (VIEWALL_STATE.currentYear) {
    videos = videos.filter(function(v) {
      return String(v.year || v.date || '').substring(0, 4) === VIEWALL_STATE.currentYear;
    });
  }
  
  /* --- 3. SORT (DESCENDING = NEWEST FIRST) --- */
  if (VIEWALL_STATE.currentSort === 'recent') {
    videos.sort(function(a, b) {
      var timeA = new Date(a.date || a.added || (a.year ? a.year + '-12-31' : 0)).getTime();
      var timeB = new Date(b.date || b.added || (b.year ? b.year + '-12-31' : 0)).getTime();
      return timeB - timeA;
    });
  }
  else if (VIEWALL_STATE.currentSort === 'oldest') {
    videos.sort(function(a, b) {
      var timeA = new Date(a.date || a.added || (a.year ? a.year + '-01-01' : 0)).getTime();
      var timeB = new Date(b.date || b.added || (b.year ? b.year + '-01-01' : 0)).getTime();
      return timeA - timeB;
    });
  }
  else if (VIEWALL_STATE.currentSort === 'az') {
    videos.sort(function(a, b) {
      var tA = a.Translated || a.description || a.title || '';
      var tB = b.Translated || b.description || b.title || '';
      return tA.localeCompare(tB);
    });
  }
  else if (VIEWALL_STATE.currentSort === 'za') {
    videos.sort(function(a, b) {
      var tA = a.Translated || a.description || a.title || '';
      var tB = b.Translated || b.description || b.title || '';
      return tB.localeCompare(tA);
    });
  }
  
  /* --- 4. RENDER TO DOM --- */
  if (!videos.length) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text3);">No movies found matching these filters.</div>';
    return;
  }
  
  var html = '';
  videos.forEach(function(v) {
    /* STRICTLY "Translated" + "description" ONLY */
    var title = v.Translated || v.description || 'Untitled';
    var poster = v.poster || v.image || '';
    var url = v.url || '#';
    var year = v.year || (v.date ? String(v.date).substring(0, 4) : '');
    
    html +=
      '<a class="va-card" href="' + escapeHTML(url) + '">' +
      '<div class="va-poster">' +
      (poster ?
        '<img data-src="' + escapeHTML(poster) + '" alt="' + escapeHTML(title) + '" class="va-lazy-img" loading="lazy">' :
        '<div class="va-no-img">No Image</div>') +
      '</div>' +
      '<div class="va-info">' +
      '<h3 class="va-title">' + escapeHTML(title) + '</h3>' +
      (year ? '<span class="va-year">' + escapeHTML(year) + '</span>' : '') +
      '</div>' +
      '</a>';
  });
  
  grid.innerHTML = html;
  
  /* Trigger lazy load if you have it set up globally */
  if (typeof lazyLoadViewAllImages === 'function') {
    lazyLoadViewAllImages();
  }
}


/* -------------------------------------------------------
   Header Helpers
   ------------------------------------------------------- */
function setViewAllHeader(title, subtitle, breadcrumb) {
  var pageTitle = document.getElementById('viewall-page-title');
  var pageSubtitle = document.getElementById('viewall-page-subtitle');
  var breadcrumbCurrent = document.getElementById('breadcrumb-current');
  var titleEl = document.getElementById('viewall-title');
  
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) pageSubtitle.textContent = subtitle;
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = breadcrumb;
  if (titleEl) {
    titleEl.innerHTML = '<svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + escapeHTML(title);
  }
}

function resetViewAllHeader() {
  setViewAllHeader(
    'All Movies',
    'Browse the complete collection of Movies from creators worldwide.',
    'All Movies'
  );
  var titleEl = document.getElementById('viewall-title');
  if (titleEl) {
    titleEl.innerHTML = '<svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> All Movies';
  }
}

/* -------------------------------------------------------
   showActiveFilterChips
   ------------------------------------------------------- */
function showActiveFilterChips() {
  var container = document.getElementById('active-filters');
  var chipsContainer = document.getElementById('active-filter-chips');
  if (!container || !chipsContainer) return;
  
  var hasFilter = false;
  var chipsHTML = '';
  
  if (VIEWALL_STATE.currentYear) {
    hasFilter = true;
    chipsHTML += '<span class="active-chip">Year: ' + escapeHTML(VIEWALL_STATE.currentYear) + ' <button onclick="removeYearFilter()" class="chip-remove">&times;</button></span>';
  }
  
  if (VIEWALL_STATE.currentCategory && VIEWALL_STATE.currentCategory !== 'all') {
    hasFilter = true;
    chipsHTML += '<span class="active-chip">' + escapeHTML(VIEWALL_STATE.currentCategory) + ' <button onclick="removeCategoryFilter()" class="chip-remove">&times;</button></span>';
  }
  
  if (hasFilter) {
    container.style.display = 'flex';
    chipsContainer.innerHTML = chipsHTML;
  } else {
    container.style.display = 'none';
    chipsContainer.innerHTML = '';
  }
}

function removeYearFilter() {
  VIEWALL_STATE.currentYear = '';
  resetViewAllHeader();
  filterAndRender();
  showActiveFilterChips();
}

function removeCategoryFilter() {
  VIEWALL_STATE.currentCategory = 'all';
  var catFilter = document.getElementById('category-filter');
  if (catFilter) catFilter.value = 'all';
  filterAndRender();
  showActiveFilterChips();
}

/* -------------------------------------------------------
   fetchFromBothNodes
   Fires two parallel reads (description + Translated),
   merges into one array. Series are completely excluded.
   ------------------------------------------------------- */
function fetchFromBothNodes() {
  var grid = document.getElementById('videos-grid');
  if (!grid) return;
  
  /* If we already fetched data (e.g. navigating back via SPA), just re-render */
  if (VIEWALL_STATE.allVideos.length > 0) {
    filterAndRender();
    return;
  }
  
  var dbRef = (typeof database !== 'undefined' && database) ? database : firebase.database();
  
  var p1 = dbRef.ref('description').once('value');
  var p2 = dbRef.ref('Translated').once('value');
  
  Promise.all([p1, p2]).then(function(results) {
    VIEWALL_STATE.allVideos = [];
    var seenIds = {};
    var nodeNames = ['description', 'Translated'];
    
    /* Loop through the 2 snapshots */
    for (var i = 0; i < results.length; i++) {
      var snapshot = results[i];
      var source = nodeNames[i];
      
      snapshot.forEach(function(child) {
        if (source === 'description' && child.key === 'Translated') return; // skip container
        var data = child.val();
        if (!data || typeof data !== 'object' || !data.title) return;
        if (seenIds[child.key]) return;
        
        data._id = child.key;
        data._source = source;
        data._isTranslated = (source === 'Translated');
        VIEWALL_STATE.allVideos.push(data);
        seenIds[child.key] = true;
      });
    }
    
    console.log('[ViewAll] Total merged: ' + VIEWALL_STATE.allVideos.length);
    filterAndRender();
    
  }).catch(function(err) {
    console.error('[ViewAll] Fetch error:', err);
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;">' +
      '<h3>Could not load Movies</h3>' +
      '<p>Please check your connection and try again.</p></div>';
  });
}

/* -------------------------------------------------------
   filterAndRender
   Filters, sorts, renders from the merged list.
   ------------------------------------------------------- */
function filterAndRender() {
  var grid = document.getElementById('videos-grid');
  var noVideos = document.getElementById('no-videos');
  var badge = document.getElementById('video-count-badge');
  
  if (!grid) return;
  
  var list = VIEWALL_STATE.allVideos.slice();
  
  /* ---- Filter by year ---- */
  if (VIEWALL_STATE.currentYear) {
    var yearStr = VIEWALL_STATE.currentYear.toString();
    list = list.filter(function(v) {
      return (v.year || '').toString() === yearStr;
    });
  }
  
    // Filter by category — deep search across all text fields
    if (category && category !== 'all') {
      var catKeyword = category.toLowerCase();
      if (catKeyword === 'sciencefiction') catKeyword = 'science';
      videos = videos.filter(function(v) {
        var combinedText = [
          v.title || '',
          v.description || '',
          v.genre || '',
          v.category || '',
          v.director || '',
          v.country || '',
          v.year || ''
        ].join(' ').toLowerCase();
        return combinedText.includes(catKeyword);
      });
    }
  
  /* ---- Sort ---- */
  if (VIEWALL_STATE.currentSort === 'views') {
    list.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
  } else if (VIEWALL_STATE.currentSort === 'likes') {
    list.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
  } else if (VIEWALL_STATE.currentSort === 'trending') {
    var now = Date.now();
    list.sort(function(a, b) {
      var sA = (a.views || 0) + (a.likes || 0) * 5 + Math.max(0, 100000 - (now - (a.createdAt || 0))) / 1000;
      var sB = (b.views || 0) + (b.likes || 0) * 5 + Math.max(0, 100000 - (now - (b.createdAt || 0))) / 1000;
      return sB - sA;
    });
  } else {
    list.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  
  /* ---- Render ---- */
  grid.innerHTML = '';
  
  if (list.length === 0) {
    if (noVideos) noVideos.style.display = 'block';
    if (badge) badge.textContent = '0 Videos';
    return;
  }
  
  if (noVideos) noVideos.style.display = 'none';
  if (badge) badge.textContent = list.length + ' Video' + (list.length !== 1 ? 's' : '');
  
  var fragment = document.createDocumentFragment();
  list.forEach(function(v) {
    fragment.appendChild(createVideoCard(v));
  });
  grid.appendChild(fragment);
  
  if (typeof initLazyLoading === 'function') initLazyLoading();
}

/* =============================================
   Profile Page
   ============================================= */
function initProfilePage() {
  var authGuard = document.getElementById('profile-auth-guard');
  var profileContent = document.getElementById('profile-content');
  
  if (!AppState.currentUser) {
    if (authGuard) authGuard.style.display = 'block';
    if (profileContent) profileContent.style.display = 'none';
    return;
  }
  
  if (authGuard) authGuard.style.display = 'none';
  if (profileContent) profileContent.style.display = 'block';
  
  var user = AppState.currentUser;
  var profile = AppState.userProfile || {};
  
  var avatar = document.getElementById('profile-avatar');
  var nameEl = document.getElementById('profile-name');
  var emailEl = document.getElementById('profile-email');
  var countryEl = document.getElementById('profile-country');
  var ageEl = document.getElementById('profile-age');
  var joinedEl = document.getElementById('profile-joined');
  
  if (avatar) avatar.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
  if (nameEl) nameEl.textContent = profile.fullName || user.displayName || 'User';
  if (emailEl) emailEl.textContent = user.email || '—';
  if (countryEl) countryEl.textContent = profile.country || 'Unknown';
  if (ageEl) ageEl.textContent = profile.age ? profile.age + ' years' : '—';
  if (joinedEl) joinedEl.textContent = profile.createdAt ? formatDate(profile.createdAt) : '—';
  
  var signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
     auth.signOut().then(function() {
  showToast('Signed out successfully', 'success');
  window.location.href = 'login.html';
    });
    });
  }
  
  loadUserFavourites(user.uid).then(function(favs) {
    var favCount = document.getElementById('stat-favourites');
    if (favCount) favCount.textContent = favs.filter(function(v) { return v !== null; }).length;
  });
  
  loadUserDownloads(user.uid).then(function(dls) {
    var dlCount = document.getElementById('stat-downloads');
    if (dlCount) dlCount.textContent = dls.length;
  });
  
  loadUserHistory(user.uid).then(function(hist) {
    var histCount = document.getElementById('stat-history');
    if (histCount) histCount.textContent = hist.filter(function(v) { return v !== null; }).length;
  });
  
  initProfileTabs();
}

function initProfileTabs() {
  var tabs = document.querySelectorAll('.profile-tab');
  var contents = document.querySelectorAll('.profile-tab-content');
  
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var targetTab = this.dataset.tab;
      tabs.forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      contents.forEach(function(c) {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      var targetContent = document.getElementById('tab-' + targetTab);
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
      }
    });
  });
}

/* =============================================
   Profile Quick Links Builder
   ============================================= */
function buildProfileLinks() {
  var container = document.getElementById('profile-links');
  if (!container) return;
  
  var isLoggedIn = !!AppState.currentUser;
  
  var sections = [
    {
      title: 'Account',
      links: [
        { href: 'helpcenter.html', label: 'Help Center', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
        { href: 'contact.html', label: 'Contact Us', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { href: 'services.html', label: 'Terms of Service', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
        { href: 'privacy.html', label: 'Privacy Policy', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
        { href: 'cookies.html', label: 'Cookie Policy', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
        { href: '#', label: 'DMCA', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' }
      ]
    }
  ];
  
  var html = '';
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    html += '<div class="profile-links-section">';
    html += '<h4 class="profile-links-title">' + sec.title + '</h4>';
    html += '<div class="profile-links-grid">';
    for (var l = 0; l < sec.links.length; l++) {
      var link = sec.links[l];
      html += '<a href="' + link.href + '" class="profile-link-card">';
      html += '<span class="profile-link-icon">' + link.icon + '</span>';
      html += '<span class="profile-link-label">' + link.label + '</span>';
      html += '<svg class="profile-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
      html += '</a>';
    }
    html += '</div>';
    html += '</div>';
  }
  
  container.innerHTML = html;
}
function initProfileTabs() {
  var tabs = document.querySelectorAll('.profile-tab');
  var contents = document.querySelectorAll('.profile-tab-content');
  
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var targetTab = this.dataset.tab;
      tabs.forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
      contents.forEach(function(c) {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      var targetContent = document.getElementById('tab-' + targetTab);
      if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
      }
    });
  });
}


/* =============================================
   Initialize Application
   ============================================= */
function init() {
  buildFooter();
  buildYearTags();
  
  initAuthState(function() {
    switch (AppState.currentPage) {
      case 'home':
        var homeResult = initHomePage();
        /* If initHomePage returns a Promise, wait for it */
        if (homeResult && typeof homeResult.then === 'function') {
          homeResult.then(function() {
            window.dispatchEvent(new Event('appReady'));
          }).catch(function() {
            /* Even on error, dismiss splash so user isn't stuck */
            window.dispatchEvent(new Event('appReady'));
          });
        } else {
          /* Sync init — fire immediately */
          window.dispatchEvent(new Event('appReady'));
        }
        break;
        
      case 'translated':
        if (typeof initTranslatedPage === 'function') initTranslatedPage();
        else initViewAllPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'viewall':
        initViewAllPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'series':
        /* series.js handles it */
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'watch':
        /* series.js handles it */
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'login':
        initLoginPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'signup':
        initSignupPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'upload':
        initUploadPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'video':
        initVideoPage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      case 'profile':
        initProfilePage();
        window.dispatchEvent(new Event('appReady'));
        break;
        
      default:
        window.dispatchEvent(new Event('appReady'));
        break;
    }
  });
}

/* Run on DOM ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* =============================================
   Initialize SiteAnalytics
   ============================================= */
document.addEventListener('DOMContentLoaded', function() {
  // Wait for Firebase Auth to be ready before starting analytics
  auth.onAuthStateChanged(function(user) {
    // We initialize analytics regardless of login status to track all visitors
    if (typeof SiteAnalytics !== 'undefined' && typeof database !== 'undefined') {
      try {
        SiteAnalytics.init(database);
        console.log("✅ SiteAnalytics initialized. Tracking data under /Analytic");
      } catch (e) {
        console.error("❌ Failed to initialize SiteAnalytics:", e);
      }
    } else {
      console.warn("⚠️ SiteAnalytics or Firebase Database not found.");
    }
  });
});