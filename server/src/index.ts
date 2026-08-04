import express from 'express';
import { config } from './config/index.js';
import { shutdownExif } from './ingest/exif.js';
import { generatePlace } from './jobs/handlers/geocode.js';
import { generateImageDerivatives } from './jobs/handlers/thumbnail.js';
import { generateVideoDerivatives } from './jobs/handlers/video.js';
import { startPurgeWorker } from './jobs/purge.js';
import { registerHandler, startWorker } from './jobs/queue.js';
import { adminRouter } from './routes/admin.js';
import { albumsRouter } from './routes/albums.js';
import { assetsRouter } from './routes/assets.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { mapRouter } from './routes/map.js';
import { searchRouter } from './routes/search.js';
import { timelineRouter } from './routes/timeline.js';
import { trashRouter } from './routes/trash.js';
import './db/index.js';

registerHandler('thumbnail', generateImageDerivatives);
registerHandler('video', generateVideoDerivatives);
registerHandler('geocode', generatePlace);
startWorker();
startPurgeWorker();

const app = express();
app.use(express.json());

app.use(healthRouter);
app.use(authRouter);
app.use(assetsRouter);
app.use(timelineRouter);
app.use(searchRouter);
app.use(mapRouter);
app.use(albumsRouter);
app.use(trashRouter);
app.use(adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// Without this, a throw in any handler returns Express's default HTML error page
// (with a stack trace outside production), which no client can parse.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) {
    console.error('Request error after headers were sent:', err);
    res.end();
    return;
  }
  // Client errors raised by middleware (e.g. express.json on a malformed body)
  // carry their own 4xx status and a safe message.
  const status = (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message });
    return;
  }
  console.error('Unhandled request error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`whispic-server listening on :${config.port}, photosRoot=${config.photosRoot}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await shutdownExif();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
