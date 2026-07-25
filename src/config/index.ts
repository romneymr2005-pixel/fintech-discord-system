import dotenv from 'dotenv';
dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  api: {
    port: parseInt(process.env.API_PORT || '3000'),
    host: process.env.API_HOST || '0.0.0.0',
  },
  ethereum: {
    rpcUrl: process.env.ETH_RPC_URL || '',
    privateKey: process.env.ETH_PRIVATE_KEY || '',
    network: process.env.ETH_NETWORK || 'mainnet',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
  },
  discord: {
    payments: {
      token: process.env.DISCORD_PAYMENTS_TOKEN || '',
      clientId: process.env.DISCORD_PAYMENTS_CLIENT_ID || '',
    },
    support: {
      token: process.env.DISCORD_SUPPORT_TOKEN || '',
      clientId: process.env.DISCORD_SUPPORT_CLIENT_ID || '',
    },
    trading: {
      token: process.env.DISCORD_TRADING_TOKEN || '',
      clientId: process.env.DISCORD_TRADING_CLIENT_ID || '',
    },
    guildId: process.env.DISCORD_GUILD_ID || '',
  },
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY || '',
    model: process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-pro',
  },
  store: {
    currency: process.env.STORE_CURRENCY || 'ETH',
    minPurchaseUsd: parseFloat(process.env.MIN_PURCHASE_USD || '1'),
    adminRoles: (process.env.ADMIN_ROLES || 'Owner,Admin').split(','),
  },
};
