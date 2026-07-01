const fs = require('fs');
const path = require('path');
const http = require('http');

// Simple helper to load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valParts] = trimmed.split('=');
      if (key) {
        process.env[key.trim()] = valParts.join('=').trim().replace(/(^["']|["']$)/g, '');
      }
    }
  });
}

const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';

// Try to load express
let express;
try {
  express = require('express');
} catch (err) {
  express = null;
}

// Shared handler for proxying weather requests
async function handleWeatherRequest(req, res) {
  const { city, lat, lon } = req.query;

  if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === 'YOUR_KEY_HERE') {
    return res.status(500).json({ error: 'OpenWeatherMap API Key is not configured. Please check your .env file.' });
  }

  try {
    let currentUrl = '';
    let forecastUrl = '';

    if (city) {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
      forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else if (lat && lon) {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
      forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else {
      return res.status(400).json({ error: 'Missing parameter: city or coordinates (lat, lon) required' });
    }

    // Fetch current weather and forecast in parallel
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(currentUrl),
      fetch(forecastUrl)
    ]);

    if (!currentResponse.ok) {
      const errorData = await currentResponse.json();
      return res.status(currentResponse.status).json({ error: errorData.message || 'City not found' });
    }

    if (!forecastResponse.ok) {
      const errorData = await forecastResponse.json();
      return res.status(forecastResponse.status).json({ error: errorData.message || 'Forecast not found' });
    }

    const currentData = await currentResponse.json();
    const forecastData = await forecastResponse.json();

    // Fetch air pollution in parallel / sequence using coordinates from current weather
    let airPollutionData = null;
    if (currentData.coord && currentData.coord.lat && currentData.coord.lon) {
      try {
        const airUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${currentData.coord.lat}&lon=${currentData.coord.lon}&appid=${OPENWEATHER_API_KEY}`;
        const airResponse = await fetch(airUrl);
        if (airResponse.ok) {
          airPollutionData = await airResponse.json();
        }
      } catch (airErr) {
        console.error('Air pollution fetch failed:', airErr);
      }
    }

    return res.json({
      current: currentData,
      forecast: forecastData,
      airPollution: airPollutionData
    });
  } catch (error) {
    console.error('Proxy fetch error:', error);
    return res.status(500).json({ error: 'Internal server error fetching weather data' });
  }
}

if (express) {
  // Use Express if package is installed
  const app = express();
  const cors = require('cors');
  
  app.use(cors());
  app.use(express.static(path.join(__dirname, 'public')));
  
  app.get('/api/weather', async (req, res) => {
    // Add compatibility helpers to Express res object
    await handleWeatherRequest(req, res);
  });
  
  app.listen(PORT, () => {
    console.log(`[Express] Weather App running on http://localhost:${PORT}`);
  });
} else {
  // Fallback to native Node.js HTTP server if express is not installed yet
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    // Route: /api/weather
    if (pathname === '/api/weather') {
      const mockRes = {
        writeHead(status, headers) {
          res.writeHead(status, headers);
        },
        end(data) {
          res.end(data);
        },
        json(data) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(data) {
          res.writeHead(this.statusCode || 200, { 'Content-Type': 'text/plain' });
          res.end(data);
        }
      };

      const mockReq = {
        query: Object.fromEntries(parsedUrl.searchParams.entries())
      };

      await handleWeatherRequest(mockReq, mockRes);
      return;
    }

    // Serve static files from public/ directory
    let relativeFilePath = pathname === '/' ? 'index.html' : pathname;
    // Prevent directory traversal attacks
    const safeSuffix = path.normalize(relativeFilePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, 'public', safeSuffix);

    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'text/javascript';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.json') contentType = 'application/json';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`[Native Node] Weather App running on http://localhost:${PORT}`);
  });
}
