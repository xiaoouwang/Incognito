const SHELL_CACHE = "incognito-shell-v2";
const ASSET_CACHE = "incognito-assets-v2";

const SHELL_FILES = ["./logo.png", "./manifest.webmanifest", "./pwa-192.png", "./pwa-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isDocumentRequest(url) {
  return (
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/Incognito") ||
    url.pathname.endsWith("/Incognito/")
  );
}

function isHashedAsset(url) {
  return url.pathname.includes("/assets/");
}

function isShellAsset(url) {
  return SHELL_FILES.some((path) => url.pathname.endsWith(path.replace("./", "")));
}

function isViteDevPath(url) {
  return (
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("/@vite/") ||
    url.pathname.includes("/@react-refresh") ||
    url.pathname.includes("/node_modules/")
  );
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response?.ok) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response?.ok) {
    const copy = response.clone();
    caches.open(cacheName).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isViteDevPath(url)) {
    return;
  }

  if (isNavigationRequest(event.request) || isDocumentRequest(url)) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
  }
});
