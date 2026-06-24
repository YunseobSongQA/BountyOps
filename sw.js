self.addEventListener("push", (event) => {
  let data = { title: "BountyOps", body: "" };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "BountyOps", {
      body: data.body || "",
      icon: "/icon.png"
    })
  );
});
