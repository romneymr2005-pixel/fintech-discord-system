import { config } from './config';
import { connectDatabase, disconnectDatabase } from './database/client';
import { startApi } from './api';
import { startPaymentsBot } from './bots/payments';
import { startSupportBot } from './bots/support';
import { startTradingBot } from './bots/trading';
import { createChildLogger } from './utils/logger';

const log = createChildLogger('main');

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║         TETO FINTECH - Starting...           ║
  ║   Fintech + Discord Bots + AI Trading        ║
  ╚══════════════════════════════════════════════╝
  `);

  // Connect database
  await connectDatabase();
  log.info('Database connected');

  // Start API server
  startApi().catch(err => log.error('API failed', err));

  // Start Discord bots (only if tokens are provided)
  const botsStarted: string[] = [];

  if (config.discord.payments.token) {
    startPaymentsBot()
      .then(() => { botsStarted.push('Payments'); log.info('Payments bot started'); })
      .catch(err => log.error('Payments bot failed', err));
  } else {
    log.warn('Payments bot skipped (no token)');
  }

  if (config.discord.support.token) {
    startSupportBot()
      .then(() => { botsStarted.push('Support'); log.info('Support bot started'); })
      .catch(err => log.error('Support bot failed', err));
  } else {
    log.warn('Support bot skipped (no token)');
  }

  if (config.discord.trading.token) {
    startTradingBot()
      .then(() => { botsStarted.push('Trading'); log.info('Trading bot started'); })
      .catch(err => log.error('Trading bot failed', err));
  } else {
    log.warn('Trading bot skipped (no token)');
  }

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║            System Status                      ║
  ╠══════════════════════════════════════════════╣
  ║  API:        http://${config.api.host}:${config.api.port}          ║
  ║  Database:   SQLite connected                 ║
  ║  Bots:       ${botsStarted.length > 0 ? botsStarted.join(', ') : 'None (add tokens to .env)'}
  ║  NVIDIA AI:  ${config.nvidia.apiKey ? 'Configured' : 'Not configured'}
  ╚══════════════════════════════════════════════╝
  `);

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', error);
  });
  process.on('unhandledRejection', (error) => {
    log.error('Unhandled rejection', error);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
