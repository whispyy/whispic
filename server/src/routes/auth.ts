import { Router } from 'express';
import { createSession, isAuthEnabled, verifyPassword } from '../auth/index.js';

export const authRouter = Router();

authRouter.post('/api/auth', (req, res) => {
  if (!isAuthEnabled()) {
    res.status(400).json({ error: 'Auth is not configured on this server' });
    return;
  }
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !verifyPassword(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  res.json({ token: createSession() });
});
