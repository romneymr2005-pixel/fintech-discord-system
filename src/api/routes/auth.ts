import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../database/client';
import { config } from '../../config';
import { authMiddleware, AuthRequest } from '../middleware';
import { validateUsername, validatePassword, validateEmail } from '../../utils/validators';
import { createChildLogger } from '../../utils/logger';

const router = Router();
const log = createChildLogger('api-auth');

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, discordId } = req.body;

    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) { res.status(400).json({ error: usernameCheck.error }); return; }

    if (password) {
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) { res.status(400).json({ error: passwordCheck.error }); return; }
    }

    if (email && !validateEmail(email)) { res.status(400).json({ error: 'Invalid email' }); return; }

    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, email ? { email } : {}, discordId ? { discordId } : {}].filter(Boolean) } });
    if (existing) { res.status(409).json({ error: 'User already exists' }); return; }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const user = await prisma.user.create({ data: { username, email, passwordHash, discordId } });

    const wallet = await prisma.wallet.create({ data: { userId: user.id, address: `0x${user.id.replace(/-/g, '').slice(0, 40).padEnd(40, '0')}` } });

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, { expiresIn: '7d' });

    log.info(`User registered: ${username}`);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, wallet: { address: wallet.address, balance: wallet.balance } } });
  } catch (error) {
    log.error('Register error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findFirst({ where: { OR: [{ username }, { email: username }] } });
    if (!user || !user.passwordHash) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwt.secret, { expiresIn: '7d' });
    log.info(`User logged in: ${user.username}`);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    log.error('Login error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { wallet: true } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user: { id: user.id, username: user.username, role: user.role, email: user.email, wallet: user.wallet } });
  } catch (error) {
    log.error('Get me error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
