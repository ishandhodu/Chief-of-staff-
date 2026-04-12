import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
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
  const parsedUrl = url.parse(req.url!, true);
  const code = parsedUrl.query.code as string;

  if (code) {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ GOOGLE_REFRESH_TOKEN:', tokens.refresh_token);
    console.log('\nAdd this to your Vercel environment variables.\n');
    res.end('Done! You can close this tab.');
    server.close();
  }
});

server.listen(3001);
