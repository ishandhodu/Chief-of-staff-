import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebClient } from '@slack/web-api';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const results: Record<string, string> = {};

  // Check env vars
  results.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ? 'set' : 'MISSING';
  results.SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID ?? 'MISSING';
  results.DIGEST_CHANNEL_ID = process.env.DIGEST_CHANNEL_ID ?? 'MISSING';
  results.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ? 'set' : 'MISSING';
  results.GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN ? 'set' : 'MISSING';
  results.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING';

  // Try posting to Slack
  try {
    const client = new WebClient(process.env.SLACK_BOT_TOKEN);
    await client.chat.postMessage({
      channel: process.env.DIGEST_CHANNEL_ID ?? process.env.SLACK_CHANNEL_ID ?? '',
      text: `Chief of Staff debug check:\n${JSON.stringify(results, null, 2)}`,
    });
    results.slack_post = 'SUCCESS';
  } catch (err) {
    results.slack_post = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  res.status(200).json(results);
}
