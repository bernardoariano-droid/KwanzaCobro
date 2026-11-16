import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import healthHandler from './api/_handlers/health.js';
import adminUsersHandler from './api/_handlers/admin/users.js';
import adminCompaniesHandler from './api/_handlers/admin/companies.js';
import resetSuperAdminPasswordHandler from './api/_handlers/admin/reset-super-admin-password.js';
import authMeHandler from './api/_handlers/auth/me.js';
import authRegisterHandler from './api/_handlers/auth/register.js';
import supabaseStatusHandler from './api/_handlers/supabase/status.js';
import supabasePullHandler from './api/_handlers/supabase/pull.js';
import supabaseSyncHandler from './api/_handlers/supabase/sync.js';
import supabaseSchemaHandler from './api/_handlers/supabase/schema.js';
import dataIndexHandler from './api/_handlers/data/index.js';
import dataSyncHandler from './api/_handlers/data/sync.js';
import smsSendHandler from './api/_handlers/sms/send-verification.js';
import smsVerifyHandler from './api/_handlers/sms/verify-code.js';
import smsReceiptHandler from './api/_handlers/sms/verify-receipt.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

// -------------------------------------------------------------
// Endpoints de API (100% Supabase Auth & PostgreSQL + SMS)
// Partilham exatamente os mesmos handlers usados em Vercel & Netlify
// -------------------------------------------------------------
app.get('/api/health', async (req, res) => healthHandler(req as any, res as any));

// Autenticação e Gestão de Utilizadores / Empresas
app.get('/api/auth/me', async (req, res) => authMeHandler(req as any, res as any));
app.all('/api/auth/register', async (req, res) => authRegisterHandler(req as any, res as any));
app.all('/api/admin/users', async (req, res) => adminUsersHandler(req as any, res as any));
app.all('/api/admin/companies', async (req, res) => adminCompaniesHandler(req as any, res as any));
app.all('/api/admin/reset-super-admin-password', async (req, res) =>
  resetSuperAdminPasswordHandler(req as any, res as any)
);

// Sincronização & Esquema Supabase
app.get('/api/supabase/status', async (req, res) => supabaseStatusHandler(req as any, res as any));
app.get('/api/supabase/pull', async (req, res) => supabasePullHandler(req as any, res as any));
app.post('/api/supabase/sync', async (req, res) => supabaseSyncHandler(req as any, res as any));
app.get('/api/supabase/schema', async (req, res) => supabaseSchemaHandler(req as any, res as any));

// Rotas de dados compatíveis (100% autenticadas via Supabase JWT + RLS)
app.get('/api/data', async (req, res) => dataIndexHandler(req as any, res as any));
app.post('/api/data/sync', async (req, res) => dataSyncHandler(req as any, res as any));

// Verificação SMS & Autenticidade de Comprovativos
app.post('/api/sms/send-verification', async (req, res) => smsSendHandler(req as any, res as any));
app.post('/api/sms/verify-code', async (req, res) => smsVerifyHandler(req as any, res as any));
app.get('/api/sms/verify-receipt', async (req, res) => smsReceiptHandler(req as any, res as any));
app.get('/api/sms/verify-receipt/:transactionId', async (req, res) => {
  req.query = { ...(req.query || {}), transactionId: req.params.transactionId };
  return smsReceiptHandler(req as any, res as any);
});

// -------------------------------------------------------------
// Configuração do Servidor: Vite em Dev / Estático em Prod
// -------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: disableHmr ? { server: httpServer } : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEUROJUS KwanzaCobro] Servidor a correr na porta ${PORT} (100% Supabase Auth)`);
  });
}

startServer();
