const screens = {
  login: document.getElementById("screen-login"),
  groups: document.getElementById("screen-groups"),
};
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login");
const loginError = document.getElementById("login-error");
const filterInput = document.getElementById("filter");
const banner = document.getElementById("banner");
const listEl = document.getElementById("group-list");
const emptyEl = document.getElementById("empty");
const actionError = document.getElementById("action-error");
const refreshBtn = document.getElementById("refresh");
const lockBtn = document.getElementById("lock");
const footerStatus = document.getElementById("footer-status");

// Kept only for this browser tab — closing the tab forgets it.
let password = sessionStorage.getItem("dashboardPassword") || "";
let groups = [];

function showScreen(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

function showLogin(message) {
  showScreen("login");
  footerStatus.textContent = "status: locked";
  loginBtn.disabled = false;
  loginBtn.textContent = "unlock";
  loginError.textContent = message || "";
  loginError.hidden = !message;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-dashboard-password": password,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

function renderBanner(data) {
  const notes = [];
  if (!data.whatsappConnected) {
    notes.push("WhatsApp isn't connected right now, so its groups aren't listed. Pair it on the pairing page first.");
  }
  if (data.telegramConfigured) {
    notes.push("Telegram groups appear once the bot has been added to them or has seen a message there.");
  }
  banner.textContent = notes.join(" ");
  banner.hidden = notes.length === 0;
}

function renderList() {
  const query = filterInput.value.trim().toLowerCase();
  const shown = groups.filter((g) => g.name.toLowerCase().includes(query));

  listEl.replaceChildren();
  for (const group of shown) {
    const row = document.createElement("li");
    row.className = "group-row" + (group.enabled ? "" : " group-row--off");

    const badge = document.createElement("span");
    badge.className = `badge badge--${group.platform}`;
    badge.textContent = group.platform === "whatsapp" ? "WA" : "TG";

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = group.name;
    name.title = group.name;

    const state = document.createElement("span");
    state.className = "group-state";
    state.textContent = group.enabled ? "ON" : "OFF";

    const label = document.createElement("label");
    label.className = "switch";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = group.enabled;
    checkbox.setAttribute("aria-label", `Bot on in ${group.name}`);
    const track = document.createElement("span");
    track.className = "switch__track";
    label.append(checkbox, track);

    checkbox.addEventListener("change", () => toggle(group, checkbox));

    row.append(badge, name, state, label);
    listEl.append(row);
  }

  listEl.hidden = shown.length === 0;
  if (groups.length === 0) {
    emptyEl.textContent = "No groups yet.";
    emptyEl.hidden = false;
  } else if (shown.length === 0) {
    emptyEl.textContent = "No groups match that filter.";
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
  }

  const offCount = groups.filter((g) => !g.enabled).length;
  footerStatus.textContent = `status: ${groups.length} group${groups.length === 1 ? "" : "s"}, ${offCount} off`;
}

async function toggle(group, checkbox) {
  const wanted = checkbox.checked;
  checkbox.disabled = true;
  actionError.hidden = true;
  try {
    await api("/api/groups/toggle", { method: "POST", body: JSON.stringify({ id: group.id, enabled: wanted }) });
    group.enabled = wanted;
  } catch (err) {
    checkbox.checked = !wanted; // put the switch back
    if (err.status === 401 || err.status === 429) return handleAuthError(err);
    actionError.textContent = err.message;
    actionError.hidden = false;
  }
  renderList();
}

function handleAuthError(err) {
  sessionStorage.removeItem("dashboardPassword");
  password = "";
  showLogin(err.message);
}

async function load() {
  actionError.hidden = true;
  try {
    const data = await api("/api/groups");
    groups = data.groups;
    renderBanner(data);
    showScreen("groups");
    renderList();
  } catch (err) {
    if (err.status === 503) return showLogin(err.message);
    if (err.status === 401 || err.status === 429) return handleAuthError(err);
    showScreen("groups");
    actionError.textContent = err.message;
    actionError.hidden = false;
  }
}

loginBtn.addEventListener("click", async () => {
  password = passwordInput.value;
  if (!password) return;
  loginBtn.disabled = true;
  loginBtn.textContent = "checking…";
  sessionStorage.setItem("dashboardPassword", password);
  passwordInput.value = "";
  await load();
});
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});
filterInput.addEventListener("input", renderList);
refreshBtn.addEventListener("click", load);
lockBtn.addEventListener("click", () => {
  sessionStorage.removeItem("dashboardPassword");
  password = "";
  groups = [];
  showLogin();
});

if (password) load();
else showLogin();
