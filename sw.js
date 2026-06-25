// 서비스워커는 반드시 루트(/sw.js)에 있어야 한다(scope 때문에). 폴더로 옮기지 말 것.
self.addEventListener("push", (event) => {
  let data = { title: "BountyOps", body: "" };
  try { data = event.data.json(); } catch (e) {}

  // 현상수배 등급이 높으면 더 길게 진동시킨다 — 총소리처럼.
  const heavy = data.severity === "현상수배";
  event.waitUntil(
    self.registration.showNotification(data.title || "BountyOps", {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag || "bountyops",
      renotify: true,
      requireInteraction: heavy,
      vibrate: heavy ? [200, 80, 200, 80, 200] : [120, 60, 120],
      data: { url: "/" },
    })
  );
});

// 알림을 누르면 보안관 사무소(앱)를 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
