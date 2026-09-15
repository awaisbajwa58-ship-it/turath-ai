import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/createApp.js';

async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT) || 3000;

  // Vite integration for development vs production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`تراث اے آئی (Turath AI) سرور چالو ہے: http://localhost:${PORT}`);
  });
}

startServer();
