import { google } from 'googleapis';
import * as http from 'http';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.');
  process.exit(1);
}
const REDIRECT_URI = 'http://localhost:3001/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. After authorizing, you will be redirected to localhost:3001.');
console.log('   The refresh token will be printed here.\n');

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url!, 'http://localhost:3001');
  const code = parsedUrl.searchParams.get('code');

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Waiting for OAuth callback...');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error('\nNo refresh token returned. Try revoking app access at https://myaccount.google.com/permissions and re-running.');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('No refresh token returned. Check the terminal.');
    } else {
      console.log('\n✅ GOOGLE_REFRESH_TOKEN:', tokens.refresh_token);
      console.log('\nAdd this to your Vercel environment variables.\n');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Done! You can close this tab.');
    }
  } catch (err) {
    console.error('\nToken exchange failed:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Token exchange failed. Check the terminal.');
  } finally {
    server.close();
  }
});

server.listen(3001);
