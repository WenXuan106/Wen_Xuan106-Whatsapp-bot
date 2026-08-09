const phoneInput = document.getElementById("phone");
const submitBtn = document.getElementById("submit");
const useQrBtn = document.getElementById("use-qr");
const entryError = document.getElementById("entry-error");

const screens = {
  entry: document.getElementById("screen-entry"),
  qr: document.getElementById("screen-qr"),
  code: document.getElementById("screen-code"),
  connected: document.getElementById("screen-connected"),
};

const codeEl = document.getElementById("code");
const statusLine = document.getElementById("status-line");
const qrImage = document.getElementById("qr-image");
const qrStatusLine = document.getElementById("qr-status-line");
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

  if (state.status === "awaiting_qr" && state.qr) {
    qrImage.src = state.qr;
    qrStatusLine.textContent = "status: awaiting scan…";
    showScreen("qr");
    return;
  }

  if (state.lastError) {
    entryError.textContent = state.lastError;
    entryError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "request pairing code";
    useQrBtn.disabled = false;
    useQrBtn.textContent = "use QR code instead";
  }
}

submitBtn.addEventListener("click", async () => {
  const phoneNumber = phoneInput.value.trim().replace(/[^0-9]/g, "");
  entryError.hidden = true;

  if (!/^\d{7,15}$/.test(phoneNumber)) {
    entryError.textContent = "Enter a valid number with country code, e.g. +65 91234567.";
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
    submitBtn.textContent = "generating code…";
  } catch (err) {
    entryError.textContent = err.message;
    entryError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "request pairing code";
  }
});

useQrBtn.addEventListener("click", async () => {
  entryError.hidden = true;
  useQrBtn.disabled = true;
  useQrBtn.textContent = "loading QR…";

  try {
    const res = await fetch("/api/pair-qr", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
  } catch (err) {
    entryError.textContent = err.message;
    entryError.hidden = false;
    useQrBtn.disabled = false;
    useQrBtn.textContent = "use QR code instead";
  }
});

// Live updates
const source = new EventSource("/api/stream");
source.onmessage = (event) => render(JSON.parse(event.data));

// Initial state in case the stream is slow to open
fetch("/api/status")
  .then((r) => r.json())
  .then(render);
