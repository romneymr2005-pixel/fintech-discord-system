import { Router, Request, Response } from 'express';
import { prisma } from '../../database/client';
import { authMiddleware, AuthRequest } from '../middleware';
import { createChildLogger } from '../../utils/logger';

const router = Router();
const log = createChildLogger('api-support');

router.post('/tickets', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { subject, category, message } = req.body;
    if (!subject || !message) { res.status(400).json({ error: 'Subject and message required' }); return; }

    const ticket = await prisma.supportTicket.create({
      data: { userId: req.userId!, subject, category: category || 'general', messages: { create: { authorId: req.userId!, content: message, isStaff: false } } },
      include: { messages: true },
    });

    log.info(`Ticket created: ${ticket.id} - ${subject}`);
    res.json({ ticket });
  } catch (error) {
    log.error('Create ticket error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tickets', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tickets = await prisma.supportTicket.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } });
    res.json({ tickets });
  } catch (error) {
    log.error('Get tickets error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tickets/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!ticket) { res.status(404).json({ error: 'Ticket not found' }); return; }
    res.json({ ticket });
  } catch (error) {
    log.error('Get ticket error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tickets/:id/reply', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message } = req.body;
    if (!message) { res.status(400).json({ error: 'Message required' }); return; }

    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id as string } });
    if (!ticket) { res.status(404).json({ error: 'Ticket not found' }); return; }

    const reply = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: req.userId!, content: message, isStaff: ['admin', 'owner'].includes(req.userRole || '') } });
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });

    res.json({ reply });
  } catch (error) {
    log.error('Reply ticket error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
