import { Router, Request, Response } from 'express';
import { prisma } from '../../database/client';
import { authMiddleware, AuthRequest } from '../middleware';
import { generateId } from '../../utils/helpers';
import { createChildLogger } from '../../utils/logger';

const router = Router();
const log = createChildLogger('api-orders');

router.post('/create', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.active) { res.status(404).json({ error: 'Product not found' }); return; }
    if (product.stock !== -1 && product.stock < quantity) { res.status(400).json({ error: 'Insufficient stock' }); return; }

    const totalAmount = product.price * quantity;
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet) { res.status(404).json({ error: 'Wallet not found' }); return; }
    if (wallet.balance < totalAmount) { res.status(400).json({ error: 'Insufficient balance', required: totalAmount, available: wallet.balance }); return; }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: { userId: req.userId!, productId, quantity, totalAmount, currency: product.currency, status: 'pending' },
      });

      if (product.stock !== -1) {
        await tx.product.update({ where: { id: productId }, data: { stock: { decrement: quantity } } });
      }

      return newOrder;
    });

    log.info(`Order created: ${order.id} - ${product.name} x${quantity}`);
    res.json({ order, paymentAddress: '0x...' });
  } catch (error) {
    log.error('Create order error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/pay', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id as string }, include: { product: true } });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order.userId !== req.userId) { res.status(403).json({ error: 'Not your order' }); return; }
    if (order.status !== 'pending') { res.status(400).json({ error: `Order is ${order.status}` }); return; }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet || wallet.balance < order.totalAmount) { res.status(400).json({ error: 'Insufficient balance' }); return; }

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: order.totalAmount } } });

      const payment = await tx.payment.create({
        data: { orderId: order.id, amount: order.totalAmount, currency: order.currency, fromAddress: wallet.address, toAddress: '0x0000000000000000000000000000000000000001', status: 'confirmed', confirmations: 3 },
      });

      const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'paid', paymentTx: `wallet-${generateId()}` } });

      if ((order as any).product?.stock !== -1) {
        await tx.product.update({ where: { id: order.productId }, data: { stock: { decrement: order.quantity } } });
      }

      return { payment, order: updatedOrder };
    });

    log.info(`Payment confirmed: Order ${order.id} - ${order.totalAmount} ETH`);
    res.json({ success: true, order: result.order, payment: result.payment });
  } catch (error) {
    log.error('Pay order error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orders = await prisma.order.findMany({ where: { userId: req.userId }, include: { product: { select: { name: true, imageUrl: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ orders });
  } catch (error) {
    log.error('Get orders error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id as string }, include: { product: true, payment: true, user: { select: { username: true } } } });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ order });
  } catch (error) {
    log.error('Get order error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
