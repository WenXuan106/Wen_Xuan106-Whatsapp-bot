const phoneInput = document.getElementById("phone");
const submitBtn = document.getElementById("submit");
const entryError = document.getElementById("entry-error");

const screens = {
  entry: document.getElementById("screen-entry"),
  code: document.getElementById("screen-code"),
  connected: document.getElementById("screen-connected"),
};

const codeEl = document.getElementById("code");
const statusLine = document.getElementById("status-line");
const footerStatus = document.getElementById("footer-status");

function showScreen(name) {
  for (const key in screens) screens[key].hidden = key !== name;
}

function render(state) {
  footerStatus.textContent = `status: ${state.status}`;

  if (state.status === "connected") {
    showScreen("connected");
    return;
  }

  if (state.status === "awaiting_code" && state.pairingCode) {
    codeEl.textContent = state.pairingCode;
    statusLine.textContent = "status: awaiting confirmation…";
    showScreen("code");
    return;
  }

  if (state.lastError) {
    entryError.textContent = state.lastError;
    entryError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "request pairing code";
  }
}

submitBtn.addEventListener("click", async () => {
  const phoneNumber = phoneInput.value.trim();
  entryError.hidden = true;

  if (!/^\d{7,15}$/.test(phoneNumber)) {
    entryError.textContent = "Enter digits only, with country code (e.g. 15551234567).";
    entryError.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "requesting…";

  try {
    const res = await fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
  } catch (err) {
    entryError.textContent = err.message;
    entryError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "request pairing code";
  }
});

// Live updates
const source = new EventSource("/api/stream");
source.onmessage = (event) => render(JSON.parse(event.data));

// Initial state in case the stream is slow to open
fetch("/api/status")
  .then((r) => r.json())
  .then(render);
