/**
 * dashboard-link.js — Smart Resolver for NEMO Dashboard Connections
 * Detects current origin and resolves paths to the active dashboard regardless of
 * whether the landing page is hosted via standalone python server (port 8080),
 * Vite dev server (port 5173/5174), or the unified Node backend (port 4173/4174).
 */

(function () {
  function resolveDashboardBase() {
    const currentPort = window.location.port;
    const hostname = window.location.hostname || "127.0.0.1";

    // ONLY if running on isolated standalone python static server (port 8080 from start.bat)
    if (currentPort === "8080") {
      return `http://${hostname}:5173/dashboard`;
    }

    // When served by Vite dev server, unified Node backend, or reverse proxy:
    // always use relative /dashboard so it works on whatever port or domain is active
    return "/dashboard";
  }

  window.getDashboardUrl = function (subpath = "") {
    const base = resolveDashboardBase();
    if (!subpath) return base;
    const cleanSub = subpath.startsWith("/") ? subpath : `/${subpath}`;
    return `${base}${cleanSub}`;
  };

  function updateDashboardLinks() {
    // 1. Specific Dashboard links
    document.querySelectorAll("[data-dashboard-link]").forEach((el) => {
      const sub = el.getAttribute("data-dashboard-link") || "";
      el.href = window.getDashboardUrl(sub);
    });

    // 2. Auth buttons - if user is already logged in, lead straight to dashboard
    const authBtn = document.getElementById("nav-scroll-auth-btn");
    const heroAuthBtn = document.getElementById("hero-signin-btn");
    const cachedUser = localStorage.getItem("nemo_user");
    if (cachedUser) {
      try {
        const user = JSON.parse(cachedUser);
        if (user && (user.email || user.displayName)) {
          const dashUrl = window.getDashboardUrl();
          if (authBtn) {
            authBtn.href = dashUrl;
            authBtn.setAttribute("data-cursor", "DASHBOARD");
            authBtn.setAttribute("title", `Logged in as ${user.displayName || user.email} — Open Dashboard`);
          }
          if (heroAuthBtn) {
            heroAuthBtn.href = dashUrl;
            heroAuthBtn.setAttribute("data-cursor", "DASHBOARD");
            heroAuthBtn.setAttribute("title", `Logged in as ${user.displayName || user.email} — Open Dashboard`);
          }
        }
      } catch (e) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateDashboardLinks);
  } else {
    updateDashboardLinks();
  }
})();
