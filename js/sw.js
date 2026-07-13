// sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase (Replace with your actual config)
firebase.initializeApp({
 apiKey: "YOUR_API_KEY",
 authDomain: "YOUR_PROJECT.firebaseapp.com",
 projectId: "YOUR_PROJECT_ID",
 storageBucket: "YOUR_PROJECT.appspot.com",
 messagingSenderId: "YOUR_SENDER_ID",
 appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Map notification types to deep links
function getDeepLink(data) {
 if (data.movieId) return `/movieinfo/${data.movieId}`;
 if (data.episodeId) return `/episode/${data.episodeId}`;
 if (data.type === 'wishlist') return `/wishlist`;
 if (data.type === 'download') return `/downloads`;
 return '/';
}

// Handle Background Messages
messaging.onBackgroundMessage((payload) => {
 const data = payload.data || {};
 const title = data.title || 'New Notification';
 const options = {
  body: data.subtitle || '',
  icon: data.icon || '/icons/icon-192x192.png',
  badge: '/icons/badge-72x72.png',
  image: data.poster || '',
  tag: data.mergeKey || 'default-group', // Prevents duplicates & groups notifications
  renotify: true,
  requireInteraction: data.persistent === 'true',
  data: { url: getDeepLink(data) }
 };
 
 self.registration.showNotification(title, options);
});

// Handle Notification Click (Deep Linking)
self.addEventListener('notificationclick', (event) => {
 event.notification.close();
 const targetUrl = event.notification.data?.url || '/';
 
 event.waitUntil(
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
   // If app is already open, focus it and navigate
   for (const client of clientList) {
    if (client.url.includes(self.location.origin) && 'focus' in client) {
     client.navigate(targetUrl);
     return client.focus();
    }
   }
   // If app is closed, open a new window
   return self.clients.openWindow(targetUrl);
  })
 );
});