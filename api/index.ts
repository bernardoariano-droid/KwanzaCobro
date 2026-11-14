import type { VercelRequest, VercelResponse } from '@vercel/node';
import healthHandler from './_handlers/health.js';
import authMeHandler from './_handlers/auth/me.js';
import authRegisterHandler from './_handlers/auth/register.js';
import adminUsersHandler from './_handlers/admin/users.js';
import adminCompaniesHandler from './_handlers/admin/companies.js';
import resetSuperAdminPasswordHandler from './_handlers/admin/reset-super-admin-password.js';
import supabaseStatusHandler from './_handlers/supabase/status.js';
import supabasePullHandler from './_handlers/supabase/pull.js';
import supabaseSyncHandler from './_handlers/supabase/sync.js';
import supabaseSchemaHandler from './_handlers/supabase/schema.js';
import dataIndexHandler from './_handlers/data/index.js';
import dataSyncHandler from './_handlers/data/sync.js';
import smsSendHandler from './_handlers/sms/send-verification.js';
import smsVerifyHandler from './_handlers/sms/verify-code.js';
import smsReceiptHandler from './_handlers/sms/verify-receipt.js';

function resolveRoute(req: VercelRequest): string {
  const rawQueryRoute = req.query?.__route ?? req.query?.route;
  if (rawQueryRoute) {
    const val = Array.isArray(rawQueryRoute) ? rawQueryRoute.join('/') : String(rawQueryRoute);
    const cleaned = val.replace(/^\/+/, '').replace(/\/+$/, '');
    if (cleaned && cleaned !== 'index') {
      return `/${cleaned}`;
    }
  }

  const rawUrl = String(req.url || '/').split('?')[0];
  const stripped = rawUrl.replace(/^\/api/, '').replace(/\/+$/, '');
  return stripped || '/';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Reset-Token, X-Super-Admin-Reset-Token'
    );
    return res.status(204).end();
  }

  const route = resolveRoute(req);

  if (route === '/health' || route === '/') return healthHandler(req, res);
  if (route === '/auth/me') return authMeHandler(req, res);
  if (route === '/auth/register') return authRegisterHandler(req, res);
  if (route === '/admin/users') return adminUsersHandler(req, res);
  if (route === '/admin/companies') return adminCompaniesHandler(req, res);
  if (route === '/admin/reset-super-admin-password') return resetSuperAdminPasswordHandler(req, res);
  if (route === '/supabase/status') return supabaseStatusHandler(req, res);
  if (route === '/supabase/pull') return supabasePullHandler(req, res);
  if (route === '/supabase/sync') return supabaseSyncHandler(req, res);
  if (route === '/supabase/schema') return supabaseSchemaHandler(req, res);
  if (route === '/data') return dataIndexHandler(req, res);
  if (route === '/data/sync') return dataSyncHandler(req, res);
  if (route === '/sms/send-verification') return smsSendHandler(req, res);
  if (route === '/sms/verify-code') return smsVerifyHandler(req, res);
  if (route === '/sms/verify-receipt') return smsReceiptHandler(req, res);

  if (route.startsWith('/sms/verify-receipt/')) {
    const txId = decodeURIComponent(route.replace('/sms/verify-receipt/', ''));
    req.query = { ...(req.query || {}), transactionId: txId };
    return smsReceiptHandler(req, res);
  }

  return res.status(404).json({
    success: false,
    error: `Endpoint não encontrado: /api${route}`,
  });
}
