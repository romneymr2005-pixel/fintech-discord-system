import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@teto.store',
      passwordHash: adminHash,
      role: 'owner',
    },
  });

  // Create admin wallet
  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      address: '0x0000000000000000000000000000000000000001',
      balance: 0,
      currency: 'ETH',
    },
  });

  // Create sample products
  const products = [
    {
      name: 'Speed Macro Pack',
      description: 'Advanced speed macros for Roblox. Includes auto-farm, speed hack, and teleport macros. Compatible with major executors.',
      category: 'macros',
      price: 0.005,
      currency: 'ETH',
      stock: -1,
      active: true,
      featured: true,
      tags: 'macro,speed,automation,farming',
      digitalData: JSON.stringify({
        type: 'instant-delivery',
        content: 'Download link will be sent after purchase verification.',
        instructions: '1. Join our Discord\n2. Open a ticket with your order number\n3. Receive your files within 5 minutes',
      }),
      sellerId: admin.id,
    },
    {
      name: 'Admin Script Bundle',
      description: 'Premium admin scripts for Roblox. God mode, fly, noclip, ESP, aimbot. Regular updates included.',
      category: 'scripts',
      price: 0.01,
      currency: 'ETH',
      stock: -1,
      active: true,
      featured: true,
      tags: 'script,admin,premium,updating',
      digitalData: JSON.stringify({
        type: 'instant-delivery',
        content: 'Access to private GitHub repository.',
        instructions: '1. Purchase confirmed\n2. GitHub invite sent to your Discord\n3. Lifetime access with updates',
      }),
      sellerId: admin.id,
    },
    {
      name: 'VIP Server Boost',
      description: 'Get exclusive VIP server access for 30 days. Includes all game passes and priority queue.',
      category: 'services',
      price: 0.003,
      currency: 'ETH',
      stock: 50,
      active: true,
      featured: false,
      tags: 'server,vip,boost,30days',
      digitalData: JSON.stringify({
        type: 'manual-delivery',
        content: 'VIP server access for 30 days',
        instructions: '1. Provide your Roblox username after purchase\n2. Access granted within 1 hour\n3. Renewal options available',
      }),
      sellerId: admin.id,
    },
    {
      name: 'Custom Avatar Pack',
      description: '200+ unique Roblox avatar items. Hairs, faces, shirts, pants, accessories. All exclusive designs.',
      category: 'roblox-items',
      price: 0.002,
      currency: 'ETH',
      stock: -1,
      active: true,
      featured: false,
      tags: 'avatar,clothing,exclusive,200+',
      digitalData: JSON.stringify({
        type: 'instant-delivery',
        content: 'Direct Roblox catalog links',
        instructions: '1. Purchase confirmed\n2. Receive catalog links\n3. Redeem in Roblox catalog',
      }),
      sellerId: admin.id,
    },
    {
      name: 'Anti-Detect Browser Setup',
      description: 'Complete anti-detect browser configuration for multi-account management. Includes fingerprint settings and proxy setup guide.',
      category: 'tools',
      price: 0.008,
      currency: 'ETH',
      stock: -1,
      active: true,
      featured: true,
      tags: 'browser,anti-detect,multiaccount,privacy',
      digitalData: JSON.stringify({
        type: 'instant-delivery',
        content: 'Setup guide + configuration files',
        instructions: '1. Purchase confirmed\n2. Download setup package\n3. Follow step-by-step guide',
      }),
      sellerId: admin.id,
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findFirst({ where: { name: product.name } });
    if (!existing) {
      await prisma.product.create({ data: product });
      console.log(`  Created product: ${product.name}`);
    }
  }

  // Create system config
  const configs = [
    { id: 'cfg_store_open', key: 'store_open', value: 'true' },
    { id: 'cfg_store_name', key: 'store_name', value: 'Teto Store' },
    { id: 'cfg_min_order', key: 'min_order_eth', value: '0.001' },
    { id: 'cfg_support', key: 'support_ticket_category', value: 'support' },
    { id: 'cfg_trading', key: 'trading_channel_id', value: '' },
    { id: 'cfg_payment', key: 'payment_notification_channel', value: '' },
  ];

  for (const cfg of configs) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value },
      create: { id: cfg.id, key: cfg.key, value: cfg.value },
    });
  }

  console.log('✅ Database seeded successfully');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
