import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
// Production URL (e.g., https://your-app.a.run.app)
const APP_URL = (process.env.APP_URL || '').trim();

const getOAuthClient = (req?: express.Request) => {
  let redirectUri = '';
  
  if (APP_URL) {
    redirectUri = `${APP_URL.replace(/\/$/, '')}/auth/callback`;
  } else if (req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    redirectUri = `${protocol}://${host}/auth/callback`;
  } else {
    redirectUri = 'http://localhost:3000/auth/callback';
  }

  console.log('Using Redirect URI:', redirectUri);

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

const app = express();
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, vercel: !!process.env.VERCEL });
});

// Auth URL endpoint
app.get('/api/auth/url', (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('ERRO: GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados nos Secrets.');
      return res.status(500).json({ error: 'Configuração do Google incompleta. Verifique os Secrets.' });
    }

    const client = getOAuthClient(req);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      include_granted_scopes: true,
    });
    res.json({ url });
  } catch (error) {
    console.error('Erro ao gerar URL de autenticação:', error);
    res.status(500).json({ error: 'Erro interno ao iniciar autenticação' });
  }
});

// OAuth Callback
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const client = getOAuthClient(req);
    const { tokens } = await client.getToken(code as string);
    
    res.cookie('google_tokens', JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #002925; color: white; margin: 0; }
            .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
          </style>
        </head>
        <body>
          <div class="card">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticação bem-sucedida. Esta janela fechará automaticamente.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code:', error);
    res.status(500).send('Authentication failed');
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('google_tokens', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true });
});

// Helper to get authenticated client with auto-refresh
const getAuthenticatedClient = async (req: express.Request, res: express.Response) => {
  const tokenCookie = req.cookies.google_tokens;
  if (!tokenCookie) return null;

  try {
    const tokens = JSON.parse(tokenCookie);
    const client = getOAuthClient(req);
    client.setCredentials(tokens);

    const expiryDate = tokens.expiry_date || 0;
    const isExpired = Date.now() >= (expiryDate - 300000);

    if (isExpired && tokens.refresh_token) {
      const { credentials } = await client.refreshAccessToken();
      const updatedTokens = { ...tokens, ...credentials };
      
      res.cookie('google_tokens', JSON.stringify(updatedTokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      
      client.setCredentials(updatedTokens);
    }

    return client;
  } catch (error) {
    console.error('Erro na autenticação/renovação:', error);
    return null;
  }
};

// API Routes
app.get('/api/auth/me', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    res.json(data);
  } catch (error) {
    res.status(401).json({ error: 'Invalid session' });
  }
});

app.get('/api/calendar/list', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.calendarList.list();
    
    // Map calendars with their access roles
    const calendars = (data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary,
      accessRole: cal.accessRole, // 'owner', 'writer', 'reader', 'freeBusyReader'
      canWrite: cal.accessRole === 'owner' || cal.accessRole === 'writer'
    }));
    
    res.json(calendars);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

app.post('/api/calendar/freebusy', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { timeMin, timeMax, calendarIds } = req.body;
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: calendarIds.map((id: string) => ({ id })) },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

app.post('/api/calendar/check-conflicts', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { start, duration } = req.body;
    const navegahCalendarNames = ['Navegah (Pedro)', 'Navegah (Captação)', 'Navegah (Reuniões)', 'Navegah (Visita técnica)'];
    const { data: calList } = await calendar.calendarList.list();
    const relevantCalendars = calList.items?.filter(c => 
      c.summary === 'primary' || navegahCalendarNames.some(name => c.summary?.trim().toLowerCase() === name.toLowerCase())
    ) || [];
    let startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);
    const allConflicts: any[] = [];
    await Promise.all(relevantCalendars.map(async (cal) => {
      try {
        const { data } = await calendar.events.list({
          calendarId: cal.id!,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        if (data.items) data.items.forEach(item => allConflicts.push({ ...item, calendarName: cal.summary }));
      } catch (err) {}
    }));
    res.json({ conflicts: allConflicts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { title, start, duration, location, description, guests, team, calendarName, isOnline } = req.body;
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);
    const { data: calList } = await calendar.calendarList.list();
    let targetCalendarId = 'primary';
    if (calendarName) {
      const targetCal = calList.items?.find(c => c.summary?.trim().toLowerCase() === calendarName.trim().toLowerCase());
      if (targetCal) targetCalendarId = targetCal.id!;
    }
    const attendees: any[] = [];
    if (team) team.forEach((email: string) => attendees.push({ email: email.trim() }));
    if (guests) guests.split(',').forEach((email: string) => attendees.push({ email: email.trim() }));
    const event: any = {
      summary: title,
      location,
      description,
      start: { dateTime: startDate.toISOString() },
      end: { dateTime: endDate.toISOString() },
      attendees,
    };
    if (isOnline) {
      event.conferenceData = {
        createRequest: { requestId: `navegah-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
      };
    }
    const response = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: event,
      conferenceDataVersion: isOnline ? 1 : 0,
      sendUpdates: 'all',
    });
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error?.response?.data?.error?.message || 'Falha ao criar compromisso' });
  }
});

// Development server logic
if (!process.env.VERCEL) {
  const startDevServer = async () => {
    const PORT = 3000;
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
    app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
  };
  startDevServer();
}

export default app;
