const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');
const { google } = require('googleapis');

const envPath = path.resolve(__dirname, '../.env');

function loadEnv() {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function saveRefreshTokenToEnv(refreshToken, clientId, clientSecret) {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

  if (content.includes('GOOGLE_REFRESH_TOKEN=')) {
    content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  } else {
    content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  }

  if (clientId && content.includes('GOOGLE_CLIENT_ID=')) {
    content = content.replace(/GOOGLE_CLIENT_ID=.*/, `GOOGLE_CLIENT_ID=${clientId}`);
  }
  if (clientSecret && content.includes('GOOGLE_CLIENT_SECRET=')) {
    content = content.replace(/GOOGLE_CLIENT_SECRET=.*/, `GOOGLE_CLIENT_SECRET=${clientSecret}`);
  }

  fs.writeFileSync(envPath, content, 'utf-8');
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('   Google Calendar Refresh Token Generator');
  console.log('======================================================\n');

  const env = loadEnv();
  let clientId = env.GOOGLE_CLIENT_ID;
  let clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || clientId.includes('placeholder') || clientId.includes('your_')) {
    clientId = await prompt('Enter your Google Client ID: ');
  }
  if (!clientSecret || clientSecret.includes('placeholder') || clientSecret.includes('your_')) {
    clientSecret = await prompt('Enter your Google Client Secret: ');
  }

  if (!clientId || !clientSecret) {
    console.error('❌ Error: Client ID and Client Secret are required.');
    process.exit(1);
  }

  const PORT = 8080;
  const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

  console.log(`\nUsing Redirect URI: ${REDIRECT_URI}`);
  console.log('⚠️  Make sure this redirect URI is added to your Google Cloud Console:');
  console.log(`   APIs & Services ➔ Credentials ➔ Your OAuth Client ➔ Authorized redirect URIs ➔ ${REDIRECT_URI}\n`);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh_token
    prompt: 'consent', // Forces consent screen to always issue a refresh_token
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });

  console.log('🔗 Opening your browser to authorize access to Google Calendar...');
  console.log('If the browser does not open automatically, visit this URL:\n');
  console.log(authUrl);
  console.log('\nWaiting for authentication...\n');

  // Attempt to open the URL in default browser (macOS / Linux / Windows)
  const openCommand = process.platform === 'darwin' ? `open "${authUrl}"` : process.platform === 'win32' ? `start "" "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(openCommand, () => {});

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/oauth2callback') {
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authentication Failed:</h2><p>${error}</p>`);
        console.error(`❌ Authentication failed: ${error}`);
        server.close();
        process.exit(1);
      }

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          const refreshToken = tokens.refresh_token;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #16a34a;">Authentication Successful!</h1>
              <p>Your Google Refresh Token has been retrieved and saved to your <code>.env</code> file.</p>
              <p style="color: #64748b;">You can safely close this window and return to your terminal.</p>
            </div>
          `);

          console.log('✅ Successfully authenticated with Google!');

          if (refreshToken) {
            console.log('\n======================================================');
            console.log('🎉 Your GOOGLE_REFRESH_TOKEN:');
            console.log(refreshToken);
            console.log('======================================================\n');

            saveRefreshTokenToEnv(refreshToken, clientId, clientSecret);
            console.log(`💾 Saved to: ${envPath}\n`);
          } else {
            console.log('⚠️  Google did not return a refresh token (only an access token).');
            console.log('This happens if you previously authorized the app.');
            console.log('Go to https://myaccount.google.com/permissions, remove access for this app, and run this command again.');
          }

          server.close();
          process.exit(0);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h2>Token Exchange Error:</h2><p>${err.message}</p>`);
          console.error(`❌ Error exchanging code for tokens: ${err.message}`);
          server.close();
          process.exit(1);
        }
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
