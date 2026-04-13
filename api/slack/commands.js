// src/slack/verify.ts
import { createHmac, timingSafeEqual } from "crypto";
function verifySlackSignature(signingSecret, signature, timestamp, body) {
  const now = Math.floor(Date.now() / 1e3);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret);
  const expected = `v0=${hmac.update(baseString).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// src/slack/raw-body.ts
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// src/handlers/slack/commands.ts
var config = {
  api: {
    bodyParser: false
  }
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }
  const rawBody = await getRawBody(req);
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return res.status(500).json({ error: "SLACK_SIGNING_SECRET not configured" });
  }
  const signature = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return res.status(401).json({ error: "Missing Slack headers" });
  }
  if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const params = new URLSearchParams(rawBody);
  const command = params.get("command") ?? "";
  const text = params.get("text") ?? "";
  const user_id = params.get("user_id") ?? "";
  const channelId = process.env.DIGEST_CHANNEL_ID ?? "";
  const baseUrl = `https://${req.headers.host}`;
  fetch(`${baseUrl}/api/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.CRON_SECRET ?? ""
    },
    body: JSON.stringify({ command, text, user_id, channelId })
  }).catch((err) => console.error("[commands] failed to trigger process:", err));
  return res.status(200).json({ response_type: "in_channel", text: "Working on it..." });
}
export {
  config,
  handler as default
};
