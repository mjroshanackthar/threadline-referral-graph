// Auto-detect localhost vs production cloud hosting
window.API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:4000"
  : "";

window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || "283432634300-dttfrd4o0doimka7cmgjuaivf4ioj58g.apps.googleusercontent.com";
