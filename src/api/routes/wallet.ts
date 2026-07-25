import { Router, Response } from 'express';
import { prisma } from '../../database/client';
import { authMiddleware, AuthRequest } from '../middleware';
import { isValidEthAddress } from '../../utils/helpers';
import { createChildLogger } from '../../utils/logger';

const router = Router();
const log = createChildLogger('api-wallet');

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet) { res.status(404).json({ error: 'Wallet not found' }); return; }
    res.json({ wallet });
  } catch (error) {
    log.error('Get wallet error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transactions', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet) { res.status(404).json({ error: 'Wallet not found' }); return; }

    const transactions = await prisma.transaction.findMany({
      where: { OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ transactions, balance: wallet.balance, locked: wallet.locked });
  } catch (error) {
    log.error('Get transactions error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/transfer', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { toAddress, amount, description } = req.body;
    if (!toAddress || !isValidEthAddress(toAddress)) { res.status(400).json({ error: 'Invalid Ethereum address' }); return; }
    if (!amount || amount <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }

    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!senderWallet) { res.status(404).json({ error: 'Wallet not found' }); return; }
    if (senderWallet.balance < amount) { res.status(400).json({ error: 'Insufficient balance' }); return; }

    let receiverWallet = await prisma.wallet.findUnique({ where: { address: toAddress } });
    if (!receiverWallet) {
      receiverWallet = await prisma.wallet.create({ data: { userId: `external-${Date.now()}`, address: toAddress, balance: 0 } });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { id: senderWallet.id }, data: { balance: { decrement: amount } } });
      await tx.wallet.update({ where: { id: receiverWallet!.id }, data: { balance: { increment: amount } } });

      const txRecord = await tx.transaction.create({
        data: {
          fromWalletId: senderWallet.id,
          toWalletId: receiverWallet.id,
          amount,
          currency: 'ETH',
          type: 'transfer',
          status: 'confirmed',
          description: description || `Transfer to ${toAddress.slice(0, 10)}...`,
        },
      });

      return txRecord;
    });

    log.info(`Transfer: ${amount} ETH from ${senderWallet.address.slice(0, 10)} to ${toAddress.slice(0, 10)}`);
    res.json({ transaction: result, newBalance: senderWallet.balance - amount });
  } catch (error) {
    log.error('Transfer error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/deposit', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (!wallet) { res.status(404).json({ error: 'Wallet not found' }); return; }

    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await prisma.transaction.create({
      data: {
        toWalletId: wallet.id,
        amount,
        currency: 'ETH',
        type: 'deposit',
        status: 'confirmed',
        description: 'Manual deposit (admin)',
      },
    });

    log.info(`Deposit: ${amount} ETH to ${wallet.address.slice(0, 10)}`);
    res.json({ success: true, newBalance: wallet.balance + amount });
  } catch (error) {
    log.error('Deposit error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
