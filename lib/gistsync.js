const axios = require("axios");
const config = require("../config");

// Tiny client for keeping a copy of a JSON file in a private GitHub Gist, so
// data survives hosts that wipe the disk on every redeploy (like Render's
// free plan). Used by lib/scores.js for the game points.
//
// Needs two settings (see config.js): GITHUB_TOKEN (a classic personal
// access token with only the "gist" permission) and SCORES_GIST_ID (the id
// from the gist's URL).

function apiBase() {
  // GITHUB_API_URL is only here so the code can be tested against a fake server.
  return (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
}

function isConfigured() {
  return Boolean(config.GITHUB_TOKEN && config.SCORES_GIST_ID);
}

function headers() {
  return {
    Authorization: `Bearer ${config.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "whatsapp-telegram-bot",
  };
}

/**
 * Returns the text of `fileName` inside the gist, or null if the gist exists
 * but doesn't have that file yet. Throws if the gist can't be read (wrong id,
 * bad token, network down, ...) — err.response.status holds the HTTP status.
 */
async function fetchFile(fileName) {
  const res = await axios.get(`${apiBase()}/gists/${config.SCORES_GIST_ID}`, {
    headers: headers(),
    timeout: 10000,
  });
  const file = res.data && res.data.files && res.data.files[fileName];
  if (!file) return null;

  // Large files come back truncated; the full text is at raw_url.
  if (file.truncated && file.raw_url) {
    const raw = await axios.get(file.raw_url, {
      timeout: 15000,
      responseType: "text",
      transformResponse: (d) => d,
    });
    return raw.data;
  }
  return file.content == null ? "" : file.content;
}

/** Replaces (or creates) `fileName` in the gist with `content`. Throws on failure. */
async function pushFile(fileName, content) {
  await axios.patch(
    `${apiBase()}/gists/${config.SCORES_GIST_ID}`,
    { files: { [fileName]: { content } } },
    { headers: headers(), timeout: 15000 }
  );
}

module.exports = { isConfigured, fetchFile, pushFile };
