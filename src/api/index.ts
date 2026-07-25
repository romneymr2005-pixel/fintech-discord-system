import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config';
import { connectDatabase } from '../database/client';
import { rateLimit } from './middleware';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import supportRoutes from './routes/support';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('api');
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit(200, 60000));

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/support', supportRoutes);

app.get('/api/health', (_, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString() }); });

export async function startApi(): Promise<void> {
  await connectDatabase();
  app.listen(config.api.port, config.api.host, () => {
    log.info(`API running on http://${config.api.host}:${config.api.port}`);
  });
}

if (require.main === module) {
  startApi().catch(console.error);
}

export default app;
