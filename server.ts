import express from 'express';
import { createServer as createViteServer } from 'vite';
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
      include_granted_scopes: true, // Helps Google remember previous consents
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
    
    // Store tokens in a secure cookie
    res.cookie('google_tokens', JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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

    // Check if access token is expired or about to expire (within 5 mins)
    const expiryDate = tokens.expiry_date || 0;
    const isExpired = Date.now() >= (expiryDate - 300000);

    if (isExpired && tokens.refresh_token) {
      console.log('Token expirando, tentando renovar automaticamente...');
      const { credentials } = await client.refreshAccessToken();
      
      // Merge new tokens with old ones to preserve the refresh_token
      const updatedTokens = { ...tokens, ...credentials };
      
      res.cookie('google_tokens', JSON.stringify(updatedTokens), {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      
      client.setCredentials(updatedTokens);
      console.log('Token renovado com sucesso.');
    }

    return client;
  } catch (error) {
    console.error('Erro na autenticação/renovação:', error);
    return null;
  }
};

export default app;

// Get User Profile
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

// List Calendars
app.get('/api/calendar/list', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.calendarList.list();
    res.json(data.items || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list calendars' });
  }
});

// Get Free/Busy info
app.post('/api/calendar/freebusy', async (req, res) => {
  const tokenCookie = req.cookies.google_tokens;
  if (!tokenCookie) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { timeMin, timeMax, calendarIds } = req.body;
    const tokens = JSON.parse(tokenCookie);
    const client = getOAuthClient(req);
    client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id: string) => ({ id })),
      },
    });

    res.json(data);
  } catch (error) {
    console.error('FreeBusy Error:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// Check for conflicts across all relevant calendars
app.post('/api/calendar/check-conflicts', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { start, duration } = req.body;
    const navegahCalendarNames = [
      'Navegah (Pedro)',
      'Navegah (Captação)',
      'Navegah (Reuniões)',
      'Navegah (Visita técnica)'
    ];

    console.log(`Verificando conflitos GLOBAIS para: ${start}, duração: ${duration}`);

    // 1. Get all calendars to find the IDs of Navegah calendars
    const { data: calList } = await calendar.calendarList.list();
    const relevantCalendars = calList.items?.filter(c => 
      c.summary === 'primary' || 
      navegahCalendarNames.some(name => c.summary?.trim().toLowerCase() === name.toLowerCase())
    ) || [];

    console.log(`Agendas relevantes encontradas: ${relevantCalendars.map(c => c.summary).join(', ')}`);

    // 2. Parse date
    let startDate: Date;
    if (start.includes('Z') || start.includes('+') || (start.match(/-/g) || []).length > 2) {
      startDate = new Date(start);
    } else {
      startDate = new Date(`${start}:00-03:00`);
    }
    const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);

    // 3. Check each relevant calendar for events
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

        if (data.items && data.items.length > 0) {
          data.items.forEach(item => {
            allConflicts.push({
              ...item,
              calendarName: cal.summary // Add calendar name to show in UI
            });
          });
        }
      } catch (err) {
        console.error(`Erro ao buscar eventos na agenda ${cal.summary}:`, err);
      }
    }));

    console.log(`Total de conflitos globais encontrados: ${allConflicts.length}`);
    res.json({ conflicts: allConflicts });
  } catch (error) {
    console.error('Global Conflict Check Error:', error);
    res.status(500).json({ error: 'Failed to check global conflicts' });
  }
});

// Create Calendar Event
app.post('/api/calendar/events', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });

    const { 
      title, 
      start, 
      duration, 
      location, 
      description, 
      guests, 
      team, 
      calendarName, 
      isOnline,
      client: clientName
    } = req.body;

    // Basic validation
    if (!title || !start) {
      return res.status(400).json({ error: 'Título e Data/Horário são obrigatórios.' });
    }

    // Find the correct calendar ID for insertion
    let targetCalendarId = 'primary';
    if (calendarName && calendarName !== 'Navegah (Pedro)') {
      const { data: calList } = await calendar.calendarList.list();
      console.log('Agendas disponíveis (inserção):', calList.items?.map(c => c.summary).join(', '));
      
      const targetCal = calList.items?.find(c => 
        c.summary?.trim().toLowerCase() === calendarName.trim().toLowerCase()
      );
      
      if (targetCal) {
        targetCalendarId = targetCal.id!;
        console.log(`Agenda encontrada para inserção: ${targetCal.summary} (ID: ${targetCalendarId})`);
      } else {
        console.log(`Agenda "${calendarName}" não encontrada na inserção, usando "primary"`);
      }
    }

    // Calculate end time based on duration (minutes)
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (duration || 60) * 60000);

    // Format dates to ensure they have seconds (YYYY-MM-DDTHH:mm:ss)
    const formatDateTime = (date: Date) => {
      // We use local time but Google API expects ISO format or offset.
      // For simplicity, we'll use the local string format that worked before but with seconds.
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const formattedStart = formatDateTime(startDate);
    const formattedEnd = formatDateTime(endDate);

    // Parse attendees safely
    const attendees: any[] = [];
    
    // Add team members
    if (team && Array.isArray(team)) {
      team.forEach((email: string) => {
        if (email) attendees.push({ email: email.trim() });
      });
    }

    // Add external guests
    if (guests) {
      guests.split(',')
        .map((email: string) => email.trim())
        .filter((email: string) => email.length > 0 && email.includes('@'))
        .forEach((email: string) => attendees.push({ email }));
    }

    const event: any = {
      summary: title,
      location: location || (isOnline ? 'Google Meet' : ''),
      description: description || '',
      start: {
        dateTime: formattedStart,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: formattedEnd,
        timeZone: 'America/Sao_Paulo',
      },
      attendees: attendees,
    };

    // Handle Google Meet generation
    if (isOnline) {
      event.conferenceData = {
        createRequest: {
          requestId: `navegah-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    console.log(`Enviando evento para o calendário ${targetCalendarId}:`, JSON.stringify(event, null, 2));

    const response = await calendar.events.insert({
      calendarId: targetCalendarId,
      requestBody: event,
      conferenceDataVersion: isOnline ? 1 : 0,
      sendUpdates: 'all',
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error creating event:', error);
    
    if (error.response?.data?.error) {
      console.error('DETALHES DO ERRO GOOGLE:', JSON.stringify(error.response.data.error, null, 2));
    }

    const message = error?.response?.data?.error?.message || 'Falha ao criar compromisso. Verifique os dados e tente novamente.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();
