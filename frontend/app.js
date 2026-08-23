const API = window.API_BASE;

// Global state & caches
let peopleCache = [];
let companiesCache = [];
let universitiesCache = [];
let jobsCache = [];
let currentUser = null;
let pendingIntroContact = null;
const connectedPairs = new Set();

// ---------------------------------------------------------------------------
// Helpers & Utilities
// ---------------------------------------------------------------------------

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function unwrapNum(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object" && val.low !== undefined) return val.low;
  return Number(val) || 0;
}

function errorState(container, err, retry) {
  container.innerHTML = "";
  const box = el("div", "error-state", `Couldn't load data: ${err.message}`);
  container.appendChild(box);
  if (retry) {
    const btn = el("button", "primary-btn", "Retry");
    btn.style.marginTop = "12px";
    btn.onclick = retry;
    container.appendChild(btn);
  }
}

function showToast(message, icon = "✨") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const item = el(
    "div",
    "toast-item",
    `<span>${icon}</span> <span>${message}</span>`
  );
  container.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(10px)";
    setTimeout(() => item.remove(), 300);
  }, 4000);
}

// ---------------------------------------------------------------------------
// Health check / db status pill
// ---------------------------------------------------------------------------

async function pollHealth() {
  const dot = document.getElementById("dbDot");
  const text = document.getElementById("dbStatusText");
  try {
    const health = await apiGet("/api/health");
    const up = health.database === "connected";
    dot.className = "dot " + (up ? "up" : "down");
    text.textContent = up ? "CognoDB Connected" : "CognoDB Unavailable";
  } catch {
    dot.className = "dot down";
    text.textContent = "API Unreachable";
  }
}

// ---------------------------------------------------------------------------
// Navigation Tabs
// ---------------------------------------------------------------------------

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
});

// ---------------------------------------------------------------------------
// Auth Gateway & User Session Management (Global & Failsafe)
// ---------------------------------------------------------------------------

window.switchAuthTab = function(tab) {
  const loginTab = document.getElementById("authTabLogin");
  const signupTab = document.getElementById("authTabSignup");
  const loginForm = document.getElementById("authLoginForm");
  const signupForm = document.getElementById("authSignupForm");

  if (!loginTab || !signupTab || !loginForm || !signupForm) return;

  if (tab === "signup") {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    signupForm.style.display = "block";
    loginForm.style.display = "none";
  } else {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    loginForm.style.display = "block";
    signupForm.style.display = "none";
  }
};

function setSessionUser(user) {
  currentUser = user;
  if (user) {
    localStorage.setItem("threadline_user", JSON.stringify(user));
    document.getElementById("userSessionBadge").style.display = "flex";
    document.getElementById("openAuthModalBtn").style.display = "none";
    document.getElementById("userAvatarSm").textContent = getInitials(user.name);
    document.getElementById("userNameSm").textContent = user.name;
    document.getElementById("authOverlay").classList.remove("active");

    // Sync user in forms
    const introFrom = document.getElementById("introFrom");
    const pathFrom = document.getElementById("pathFrom");
    if (introFrom) introFrom.value = user.id;
    if (pathFrom) pathFrom.value = user.id;
  } else {
    localStorage.removeItem("threadline_user");
    document.getElementById("userSessionBadge").style.display = "none";
    document.getElementById("openAuthModalBtn").style.display = "inline-flex";
    document.getElementById("authOverlay").classList.add("active");
  }
}

function initAuthListeners() {
  const saved = localStorage.getItem("threadline_user");
  if (saved) {
    try {
      const u = JSON.parse(saved);
      setSessionUser(u);
    } catch {
      setSessionUser(null);
    }
  } else {
    document.getElementById("authOverlay").classList.add("active");
  }

  document.getElementById("userSessionBadge").addEventListener("click", (e) => {
    if (e.target.closest("#logoutBtn")) return;
    if (!currentUser) return;

    // Switch to Directory view tab
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const dirTab = document.querySelector('.tab[data-view="directory"]');
    if (dirTab) dirTab.classList.add("active");
    document.getElementById("view-directory").classList.add("active");

    // Open logged-in user's personal profile card
    selectPerson(currentUser.id);
  });

  document.getElementById("openAuthModalBtn").addEventListener("click", () => {
    document.getElementById("authOverlay").classList.add("active");
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    setSessionUser(null);
    showToast("Logged out of session", "🔒");
  });

  // Official Google OAuth 2.0 Trigger
  document.getElementById("googleAuthBtn").addEventListener("click", () => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Open Google OAuth Popup window
          const clientId = "1083928192842-demoapp.apps.googleusercontent.com";
          const redirectUri = window.location.origin;
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile&prompt=select_account`;
          window.open(authUrl, "Google OAuth 2.0 Sign In", "width=500,height=600");
        }
      });
    } else {
      alert("Google Identity Services script is loading. Please try again in a moment.");
    }
  });

  // Login Submit with Text Input (Email / Name / Member ID) & Password
  document.getElementById("submitLoginBtn").addEventListener("click", async () => {
    const identityInput = document.getElementById("loginIdentityInput");
    const identity = identityInput ? identityInput.value.trim() : "";
    const password = document.getElementById("loginPasswordInput").value.trim();

    if (!identity) {
      alert("Please enter your Email, Name, or Member ID.");
      return;
    }
    if (!password) {
      alert("Please enter your account password.");
      return;
    }

    const btn = document.getElementById("submitLoginBtn");
    btn.textContent = "Authenticating with CognoDB...";
    btn.disabled = true;

    try {
      const userObj = await apiPost("/api/auth/login", { identity, password });

      setSessionUser(userObj);
      showToast(`Signed In Successfully! Welcome back, ${userObj.name}`, "🔑");

      // Auto-open personal profile card
      selectPerson(userObj.id);

      const introBtn = document.getElementById("introGo");
      if (introBtn) introBtn.click();
    } catch (err) {
      alert(`Authentication Failed: ${err.message}`);
    } finally {
      btn.textContent = "Sign In to Account ➔";
      btn.disabled = false;
    }
  });

  // Registration / Signup Submit with Email & Password
  document.getElementById("submitSignupBtn").addEventListener("click", async () => {
    const name = document.getElementById("regNameInput").value.trim();
    const email = document.getElementById("regEmailInput").value.trim();
    const password = document.getElementById("regPasswordInput").value.trim();
    const headline = document.getElementById("regHeadlineInput").value.trim();
    const companyId = document.getElementById("regCompanySelect").value;
    const universityId = document.getElementById("regUniSelect").value;

    if (!name) {
      alert("Please enter your full name to register.");
      return;
    }
    if (!password) {
      alert("Please create a password for your account.");
      return;
    }

    const btn = document.getElementById("submitSignupBtn");
    btn.textContent = "Creating Secured Profile in CognoDB...";
    btn.disabled = true;

    try {
      const newUser = await apiPost("/api/auth/register", {
        name,
        email,
        headline,
        password,
        companyId,
        universityId,
      });

      // Update cache & list
      peopleCache.unshift(newUser);
      renderPeopleList(peopleCache);
      populateSelectors();

      setSessionUser(newUser);
      showToast(`Account Created! Welcome, ${newUser.name}`, "🎉");

      // Increment stats counter
      const statM = document.getElementById("statMembers");
      if (statM) statM.textContent = (parseInt(statM.textContent) || 16) + 1;
    } catch (err) {
      alert(`Registration failed: ${err.message}`);
    } finally {
      btn.textContent = "Create Account & Join Graph ➔";
      btn.disabled = false;
    }
  });
}

// Execute Auth Listeners IMMEDIATELY so buttons are active before network load
initAuthListeners();

// ---------------------------------------------------------------------------
// Directory View
// ---------------------------------------------------------------------------

function renderPeopleList(people) {
  const list = document.getElementById("peopleList");
  list.innerHTML = "";
  if (!people || people.length === 0) {
    list.appendChild(el("div", "empty-state", "No members match that query."));
    return;
  }

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const initials = getInitials(p.name);
    const row = el(
      "div",
      "list-row",
      `<div class="avatar-circle">${initials}</div>
       <div class="row-info">
         <div class="row-name">${p.name}</div>
         <div class="row-meta">${p.headline || ""}${p.company ? " · " + p.company : ""}</div>
       </div>`
    );
    row.setAttribute("data-person-id", p.id);
    row.onclick = () => selectPerson(p.id, row);
    list.appendChild(row);

    if (i === 0 && !document.getElementById("personDetail").querySelector(".profile-header")) {
      selectPerson(p.id, row);
    }
  }
}

async function loadPeople(term = "") {
  if (!term && peopleCache.length > 0) {
    renderPeopleList(peopleCache);
    return;
  }
  const list = document.getElementById("peopleList");
  list.innerHTML = '<div class="empty-state">Searching graph...</div>';
  try {
    const people = await apiGet(`/api/people?q=${encodeURIComponent(term)}`);
    if (!term) peopleCache = people;
    renderPeopleList(people);
  } catch (err) {
    errorState(list, err, () => loadPeople(term));
  }
}

async function selectPerson(id, rowEl) {
  document.querySelectorAll("#peopleList .list-row").forEach((r) => r.classList.remove("selected"));
  if (rowEl) {
    rowEl.classList.add("selected");
  } else {
    const rows = document.querySelectorAll("#peopleList .list-row");
    for (const r of rows) {
      if (r.getAttribute("data-person-id") === id) {
        r.classList.add("selected");
        r.scrollIntoView({ behavior: "smooth", block: "nearest" });
        break;
      }
    }
  }
  const detail = document.getElementById("personDetail");
  detail.innerHTML = '<div class="empty-state">Fetching member profile…</div>';
  try {
    const p = await apiGet(`/api/people/${id}`);
    const initials = getInitials(p.name);
    const skillChips = (p.skills || [])
      .filter((s) => s && s.name)
      .map((s) => `<span class="skill-chip ${s.level || "intermediate"}">${s.name}</span>`)
      .join("");

    detail.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar-lg">${initials}</div>
        <div class="profile-title-group">
          <h2>${p.name}</h2>
          <div class="profile-headline-tag">${p.headline || "Graph Network Member"}</div>
        </div>
      </div>

      <div class="info-cards-grid">
        <div class="info-card">
          <div class="info-label">Company Placement</div>
          <div class="info-value">${p.company || "Independent / Unspecified"}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Alma Mater</div>
          <div class="info-value">${p.university || "Not listed"}</div>
        </div>
      </div>

      <div class="section-label">Verified Skill Matrix</div>
      <div class="skill-chip-row" style="margin-bottom:24px;">${skillChips || '<span class="empty-state">No skills recorded</span>'}</div>

      <div style="display:flex; align-items:center; gap:12px;">
        ${
          currentUser && p.id === currentUser.id
            ? `<span class="hop-badge inside">👤 Your Logged-In Profile</span>`
            : connectedPairs.has((currentUser ? currentUser.id : "") + ":" + p.id) || connectedPairs.has(p.id + ":" + (currentUser ? currentUser.id : ""))
            ? `<span class="hop-badge inside" style="padding:8px 16px; font-size:0.85rem;">✓ Connected in Graph DB</span>
               <button onclick="openConnectModalWith('${p.id}')" class="primary-btn btn-sm" style="background:rgba(255,255,255,0.08); color:var(--text-main); border:1px solid var(--border-light);">
                 Edit Connection
               </button>`
            : `<button onclick="openConnectModalWith('${p.id}')" class="primary-btn glow-btn btn-sm">
                 + Add Connection Edge to ${p.name.split(" ")[0]}
               </button>`
        }
      </div>
    `;
  } catch (err) {
    errorState(detail, err, () => selectPerson(id, rowEl));
  }
}

document.getElementById("peopleSearch").addEventListener("input", (e) => {
  clearTimeout(window.__searchDebounce);
  window.__searchDebounce = setTimeout(() => loadPeople(e.target.value), 180);
});

// ---------------------------------------------------------------------------
// Job Board View
// ---------------------------------------------------------------------------

function renderJobsList(jobs) {
  const list = document.getElementById("jobsList");
  list.innerHTML = "";
  if (!jobs || jobs.length === 0) {
    list.appendChild(el("div", "empty-state", "No open roles available."));
    return;
  }

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const card = el(
      "div",
      "job-card",
      `<div class="job-title">${j.title}</div>
       <div class="job-meta">${j.companyName} · ${j.seniority}</div>
       <div>${(j.requiredSkills || []).map((s) => `<span class="req-chip">#${s}</span>`).join("")}</div>`
    );
    card.onclick = () => selectJob(j, card);
    list.appendChild(card);

    if (i === 0) selectJob(j, card);
  }
}

async function loadJobs() {
  if (jobsCache.length > 0) {
    renderJobsList(jobsCache);
    return;
  }
  const list = document.getElementById("jobsList");
  list.innerHTML = '<div class="empty-state">Loading postings...</div>';
  try {
    const jobs = await apiGet("/api/jobs");
    jobsCache = jobs;
    renderJobsList(jobs);
  } catch (err) {
    errorState(list, err, loadJobs);
  }
}

async function selectJob(job, cardEl) {
  document.querySelectorAll("#jobsList .job-card").forEach((c) => c.classList.remove("selected"));
  if (cardEl) cardEl.classList.add("selected");
  const detail = document.getElementById("jobDetail");
  detail.innerHTML = '<div class="empty-state">Calculating Graph Fit & Proximity...</div>';
  try {
    const candidates = await apiGet(`/api/jobs/${job.id}/candidates`);
    if (candidates.length === 0) {
      detail.innerHTML = '<div class="empty-placeholder">No network members match this role\'s skills yet.</div>';
      return;
    }

    detail.innerHTML = `
      <div style="margin-bottom:20px;">
        <h2 style="font-family:var(--font-display); font-size:1.35rem; font-weight:700; margin-bottom:4px;">${job.title}</h2>
        <div style="font-size:0.88rem; color:var(--text-muted);">${job.companyName} · Ranked by skill overlap & network proximity</div>
      </div>
    `;

    for (const c of candidates) {
      const pct = Math.round((c.skillCoverage || 0) * 100);
      const hopVal = unwrapNum(c.closestHop);
      let hopClass = "hop-multi";
      let hopText = `${hopVal} hops away`;

      if (c.closestHop === null || c.closestHop === undefined) {
        hopClass = "hop-multi";
        hopText = "No path in graph";
      } else if (hopVal === 0) {
        hopClass = "inside";
        hopText = "Already inside";
      } else if (hopVal === 1) {
        hopClass = "hop-1";
        hopText = "1 Hop away";
      }

      const row = el(
        "div",
        "candidate-row",
        `<div>
           <div class="candidate-name">${c.name}</div>
           <div class="candidate-sub">${c.headline || ""} · Skills: ${(c.matchedSkills || []).join(", ")}</div>
         </div>
         <div style="display:flex; align-items:center; gap:16px;">
           <div style="text-align:right;">
             <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--accent-cyan); font-weight:600;">${pct}% Fit</div>
             <div class="coverage-bar" style="margin-top:4px;"><div class="coverage-fill" style="width:${pct}%"></div></div>
           </div>
           <span class="hop-badge ${hopClass}">${hopText}</span>
         </div>`
      );
      detail.appendChild(row);
    }
  } catch (err) {
    errorState(detail, err, () => selectJob(job, cardEl));
  }
}

// ---------------------------------------------------------------------------
// Selector Populators
// ---------------------------------------------------------------------------

function populateSelectors() {
  const loginUserSelect = document.getElementById("loginUserSelect");
  const introFrom = document.getElementById("introFrom");
  const introCompany = document.getElementById("introCompany");
  const pathFrom = document.getElementById("pathFrom");
  const pathTo = document.getElementById("pathTo");

  const regCompanySelect = document.getElementById("regCompanySelect");
  const regUniSelect = document.getElementById("regUniSelect");

  if (peopleCache.length > 0) {
    const peopleOpts = peopleCache.map((p) => `<option value="${p.id}">${p.name} (${p.company || "Independent"})</option>`).join("");
    if (loginUserSelect) loginUserSelect.innerHTML = peopleOpts;
    if (introFrom) introFrom.innerHTML = peopleOpts;
    if (pathFrom) pathFrom.innerHTML = peopleCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    if (pathTo) pathTo.innerHTML = peopleCache.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");

    if (currentUser) {
      if (introFrom) introFrom.value = currentUser.id;
      if (pathFrom) pathFrom.value = currentUser.id;
    }
    if (peopleCache.length > 1 && pathTo) {
      pathTo.selectedIndex = 1;
    }
  }

  if (companiesCache.length > 0) {
    const compOpts = companiesCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    if (introCompany) introCompany.innerHTML = compOpts;
    if (regCompanySelect) regCompanySelect.innerHTML = `<option value="">None / Independent</option>` + compOpts;
  }

  if (universitiesCache.length > 0 && regUniSelect) {
    regUniSelect.innerHTML = `<option value="">None / Not specified</option>` + universitiesCache.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
  }
}

// ---------------------------------------------------------------------------
// Warm Intros Action
// ---------------------------------------------------------------------------

document.getElementById("introGo").addEventListener("click", async () => {
  const results = document.getElementById("introResults");
  const personId = document.getElementById("introFrom").value;
  const companyId = document.getElementById("introCompany").value;

  if (!personId || !companyId) {
    results.innerHTML = '<div class="empty-state">Please select a person and a target company.</div>';
    return;
  }

  results.innerHTML = '<div class="empty-state">Traversing graph relationships (1–3 hops)...</div>';
  try {
    const paths = await apiGet(`/api/intros?personId=${personId}&companyId=${companyId}`);
    if (paths.length === 0) {
      results.innerHTML = '<div class="empty-placeholder"><div class="placeholder-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></div>No referral path found within 3 hops into this company.</div>';
      return;
    }

    results.innerHTML = "";
    for (const p of paths) {
      const hopVal = unwrapNum(p.hops);
      const pathNames = p.pathNames || [];
      
      let graphFlowHTML = "";
      for (let i = 0; i < pathNames.length; i++) {
        const nodeName = pathNames[i];
        const initials = getInitials(nodeName);
        const avatarClass = i === 0 ? "start" : i === pathNames.length - 1 ? "target" : "";

        graphFlowHTML += `
          <div class="graph-node">
            <div class="node-avatar ${avatarClass}">${initials}</div>
            <div class="node-name">${nodeName}</div>
          </div>
        `;

        if (i < pathNames.length - 1) {
          graphFlowHTML += `
            <div class="graph-connector">
              <span class="connector-label">KNOWS</span>
              <div class="connector-line"></div>
            </div>
          `;
        }
      }

      const card = el(
        "div",
        "network-path-card",
        `<div class="path-header">
           <div>
             <div class="path-target-title">Intro via ${p.contactName}</div>
             <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${p.contactHeadline || ""}</div>
           </div>
           <div style="display:flex; align-items:center; gap:10px;">
             <span class="hop-badge hop-1">${hopVal} Hop${hopVal > 1 ? "s" : ""}</span>
             <span class="path-trust-badge">Trust Score: ${p.pathStrength}</span>
           </div>
         </div>
         <div class="graph-flow-container">${graphFlowHTML}</div>
         <div class="path-action-bar">
           <button class="primary-btn glow-btn btn-sm" onclick="openRequestIntroModal('${p.contactName}', '${p.contactHeadline || ""}')">
             Request Warm Intro ➔
           </button>
         </div>`
      );
      results.appendChild(card);
    }
  } catch (err) {
    errorState(results, err, () => document.getElementById("introGo").click());
  }
});

// ---------------------------------------------------------------------------
// Path Finder Action
// ---------------------------------------------------------------------------

document.getElementById("pathGo").addEventListener("click", async () => {
  const result = document.getElementById("pathResult");
  const fromId = document.getElementById("pathFrom").value;
  const toId = document.getElementById("pathTo").value;

  if (!fromId || !toId) {
    result.innerHTML = '<div class="empty-state">Please select two members.</div>';
    return;
  }
  if (fromId === toId) {
    result.innerHTML = '<div class="empty-state">Please pick two different network members.</div>';
    return;
  }

  result.innerHTML = '<div class="empty-state">Executing Cypher shortestPath()...</div>';
  try {
    const path = await apiGet(`/api/path?fromId=${fromId}&toId=${toId}`);
    const hopVal = unwrapNum(path.hops);
    const peopleList = path.people || [];

    let graphFlowHTML = "";
    for (let i = 0; i < peopleList.length; i++) {
      const pNode = peopleList[i];
      const initials = getInitials(pNode.name);
      const avatarClass = i === 0 ? "start" : i === peopleList.length - 1 ? "target" : "";

      graphFlowHTML += `
        <div class="graph-node">
          <div class="node-avatar ${avatarClass}">${initials}</div>
          <div class="node-name">${pNode.name}</div>
        </div>
      `;

      if (i < peopleList.length - 1) {
        graphFlowHTML += `
          <div class="graph-connector">
            <span class="connector-label">KNOWS</span>
            <div class="connector-line"></div>
          </div>
        `;
      }
    }

    result.innerHTML = `
      <div class="network-path-card">
        <div class="path-header">
          <div class="path-target-title">Shortest Traversal Route</div>
          <span class="path-trust-badge">${hopVal} Hops Apart</span>
        </div>
        <div class="graph-flow-container">${graphFlowHTML}</div>
      </div>
    `;
  } catch (err) {
    errorState(result, err, () => document.getElementById("pathGo").click());
  }
});

// ---------------------------------------------------------------------------
// MODAL 1: Add Connection Modal (POST /api/connections Graph Write)
// ---------------------------------------------------------------------------

function populateConnectionModalSelectors() {
  const fromSel = document.getElementById("connFromSelect");
  const toSel = document.getElementById("connToSelect");
  if (!peopleCache.length) return;

  const opts = peopleCache.map((p) => `<option value="${p.id}">${p.name} (${p.company || "Independent"})</option>`).join("");
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;

  if (currentUser) fromSel.value = currentUser.id;
  if (peopleCache.length > 1) toSel.selectedIndex = 1;
}

function openConnectModalWith(targetId) {
  populateConnectionModalSelectors();
  const modal = document.getElementById("addConnectionModal");
  if (currentUser) document.getElementById("connFromSelect").value = currentUser.id;
  if (targetId) document.getElementById("connToSelect").value = targetId;
  modal.classList.add("active");
}

document.getElementById("openAddConnBtn").addEventListener("click", () => {
  populateConnectionModalSelectors();
  document.getElementById("addConnectionModal").classList.add("active");
});

document.getElementById("closeAddConnBtn").addEventListener("click", () => {
  document.getElementById("addConnectionModal").classList.remove("active");
});

document.getElementById("connStrengthRange").addEventListener("input", (e) => {
  document.getElementById("trustValLabel").textContent = e.target.value;
});

document.getElementById("submitAddConnBtn").addEventListener("click", async () => {
  const fromId = document.getElementById("connFromSelect").value;
  const toId = document.getElementById("connToSelect").value;
  const strength = parseFloat(document.getElementById("connStrengthRange").value) || 0.8;

  if (fromId === toId) {
    alert("Please select two different people to connect.");
    return;
  }

  const btn = document.getElementById("submitAddConnBtn");
  btn.textContent = "Writing Edge to CognoDB Graph...";
  btn.disabled = true;

  try {
    await apiPost("/api/connections", { fromId, toId, strength });
    document.getElementById("addConnectionModal").classList.remove("active");

    connectedPairs.add(fromId + ":" + toId);
    connectedPairs.add(toId + ":" + fromId);

    const pFrom = peopleCache.find((p) => p.id === fromId);
    const pTo = peopleCache.find((p) => p.id === toId);
    const nameFrom = pFrom ? pFrom.name : fromId;
    const nameTo = pTo ? pTo.name : toId;

    showToast(`Connected ${nameFrom} ➔ ${nameTo} (Trust: ${strength}) in CognoDB!`, "✨");

    // Increment edges counter
    const statE = document.getElementById("statEdges");
    if (statE) statE.textContent = (parseInt(statE.textContent) || 17) + 1;

    // Refresh active profile card to display connected badge
    selectPerson(toId);

    // Refresh Warm Intros search
    const introBtn = document.getElementById("introGo");
    if (introBtn) introBtn.click();
  } catch (err) {
    alert(`Failed to save connection: ${err.message}`);
  } finally {
    btn.textContent = "Save Connection to CognoDB";
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
function handleOfficialGoogleResponse(response) {
  if (!response || !response.credential) return;
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const payload = JSON.parse(jsonPayload);
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    processGoogleLogin(googleId, email, name, picture);
  } catch (err) {
    console.error("Failed to parse Google JWT Token:", err);
    alert("Google OAuth Token Verification Failed.");
  }
}
window.handleOfficialGoogleResponse = handleOfficialGoogleResponse;

async function processGoogleLogin(googleId, email, name, picture) {
  try {
    const userObj = await apiPost("/api/auth/google", { googleId, email, name, picture });

    const authOverlay = document.getElementById("authOverlay");
    if (authOverlay) authOverlay.classList.remove("active");

    setSessionUser(userObj);
    showToast(`Google OAuth Verified! Welcome, ${userObj.name}`, "🌐");

    if (!peopleCache.some((p) => p.id === userObj.id)) {
      peopleCache.unshift(userObj);
      renderPeopleList(peopleCache);
      populateSelectors();
    }

    selectPerson(userObj.id);

    const introBtn = document.getElementById("introGo");
    if (introBtn) introBtn.click();
  } catch (err) {
    alert(`Google Authentication Failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// MODAL 2: Request Warm Intro Modal
// ---------------------------------------------------------------------------

function openRequestIntroModal(contactName, contactHeadline) {
  pendingIntroContact = contactName;
  const senderName = currentUser ? currentUser.name.split(" ")[0] : "Candidate";
  document.getElementById("requestContactInput").value = `${contactName} (${contactHeadline || "Network Contact"})`;
  document.getElementById("requestMsgTextarea").value = `Hi ${contactName.split(" ")[0]},\n\nI saw that you are connected to members at my target company. I'm actively exploring opportunities there and would greatly appreciate a warm introduction if you're comfortable referring me!\n\nBest regards,\n${senderName}`;
  document.getElementById("requestIntroModal").classList.add("active");
}

document.getElementById("closeRequestIntroBtn").addEventListener("click", () => {
  document.getElementById("requestIntroModal").classList.remove("active");
});

document.getElementById("sendIntroMsgBtn").addEventListener("click", () => {
  document.getElementById("requestIntroModal").classList.remove("active");
  showToast(`Referral request message sent to ${pendingIntroContact || "contact"}!`, "✉️");
});

// ---------------------------------------------------------------------------
// Boot & Fast Initialization (Graceful & Non-blocking)
// ---------------------------------------------------------------------------

pollHealth();
setInterval(pollHealth, 15000);

async function boot() {
  try {
    const people = await apiGet("/api/people").catch(() => []);
    const companies = await apiGet("/api/companies").catch(() => []);
    const universities = await apiGet("/api/universities").catch(() => []);
    const jobs = await apiGet("/api/jobs").catch(() => []);

    if (people.length) peopleCache = people;
    if (companies.length) companiesCache = companies;
    if (universities.length) universitiesCache = universities;
    if (jobs.length) jobsCache = jobs;

    // Update Top Stats Bar
    document.getElementById("statMembers").textContent = peopleCache.length || 20;
    document.getElementById("statCompanies").textContent = companiesCache.length || 6;
    document.getElementById("statJobs").textContent = jobsCache.length || 6;

    // Populate drop downs & options
    populateSelectors();

    // Render initial views instantly
    if (peopleCache.length > 0) renderPeopleList(peopleCache);
    if (jobsCache.length > 0) renderJobsList(jobsCache);

    // Trigger initial intro search seamlessly
    const introBtn = document.getElementById("introGo");
    if (introBtn) introBtn.click();
  } catch (err) {
    console.error("Boot load warning:", err);
  }
}

boot();
