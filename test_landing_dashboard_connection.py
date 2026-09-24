"""
test_landing_dashboard_connection.py - Verifies the landing page to dashboard connection
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent

def test_landing_index():
    index_html = (ROOT / "landing page" / "index.html").read_text(encoding="utf-8")
    assert "js/dashboard-link.js" in index_html, "dashboard-link.js must be in index.html"
    assert 'href="/dashboard"' in index_html, "index.html must link to /dashboard"
    assert 'href="/dashboard/command"' in index_html, "index.html must link to /dashboard/command"
    assert 'href="/dashboard/content"' in index_html, "index.html must link to /dashboard/content"
    print("[PASS] landing page/index.html verified")

def test_landing_login():
    login_html = (ROOT / "landing page" / "login.html").read_text(encoding="utf-8")
    assert "js/dashboard-link.js" in login_html, "dashboard-link.js must be in login.html"
    assert "Redirecting to Dashboard..." in login_html, "Redirect text must mention Dashboard"
    assert "getDashboardUrl" in login_html, "login.html must use getDashboardUrl"
    print("[PASS] landing page/login.html verified")

def test_dashboard_link_script():
    js_file = ROOT / "landing page" / "js" / "dashboard-link.js"
    assert js_file.exists(), "dashboard-link.js must exist"
    content = js_file.read_text(encoding="utf-8")
    assert "getDashboardUrl" in content
    assert "data-dashboard-link" in content
    assert "resolveDashboardBase" in content
    print("[PASS] landing page/js/dashboard-link.js verified")

def test_server_routes():
    server_mjs = (ROOT / "server.mjs").read_text(encoding="utf-8")
    assert "landingDir" in server_mjs, "landingDir must be defined in server.mjs"
    assert '"/landing"' in server_mjs, "/landing route must be in server.mjs"
    assert '"/landing/"' in server_mjs, "/landing/ handler must be in server.mjs"
    print("[PASS] server.mjs /landing route verified")

def test_vite_proxy():
    vite_cfg = (ROOT / "vite.config.ts").read_text(encoding="utf-8")
    assert '"/landing":' in vite_cfg, "vite.config.ts must proxy /landing"
    print("[PASS] vite.config.ts proxy verified")

def test_dashboard_link():
    dash = (ROOT / "src" / "pages" / "Dashboard.tsx").read_text(encoding="utf-8")
    assert "/landing/" in dash, "Dashboard.tsx must link to /landing/"
    assert "Public Showcase" in dash, "Dashboard.tsx must have Public Showcase text"
    print("[PASS] Dashboard.tsx showcase link verified")

if __name__ == "__main__":
    test_landing_index()
    test_landing_login()
    test_dashboard_link_script()
    test_server_routes()
    test_vite_proxy()
    test_dashboard_link()
    print("\nALL LANDING-TO-DASHBOARD TESTS PASSED!")
