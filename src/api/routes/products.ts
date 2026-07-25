import { Router, Request, Response } from 'express';
import { prisma } from '../../database/client';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware';
import { createChildLogger } from '../../utils/logger';

const router = Router();
const log = createChildLogger('api-products');

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, search, featured } = req.query;
    const where: any = { active: true };

    if (category) where.category = category as string;
    if (featured === 'true') where.featured = true;
    if (search) where.OR = [{ name: { contains: search as string } }, { description: { contains: search as string } }, { tags: { contains: search as string } }];

    const products = await prisma.product.findMany({ where, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], include: { seller: { select: { username: true } }, _count: { select: { reviews: true } } } });
    res.json({ products });
  } catch (error) {
    log.error('Get products error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id as string }, include: { seller: { select: { username: true } }, reviews: { include: { user: { select: { username: true } } } } } });
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json({ product });
  } catch (error) {
    log.error('Get product error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, category, price, currency, stock, tags, digitalData, imageUrl, featured } = req.body;
    if (!name || !description || !category || !price) { res.status(400).json({ error: 'Missing required fields' }); return; }

    const product = await prisma.product.create({
      data: { name, description, category, price, currency: currency || 'ETH', stock: stock ?? -1, tags, digitalData: digitalData ? JSON.stringify(digitalData) : null, imageUrl, featured: featured || false, sellerId: req.userId! },
    });

    log.info(`Product created: ${name} by ${req.userId}`);
    res.json({ product });
  } catch (error) {
    log.error('Create product error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id as string } });
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }

    const updated = await prisma.product.update({ where: { id: req.params.id as string }, data: req.body });
    res.json({ product: updated });
  } catch (error) {
    log.error('Update product error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.product.update({ where: { id: req.params.id as string }, data: { active: false } });
    res.json({ success: true });
  } catch (error) {
    log.error('Delete product error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
