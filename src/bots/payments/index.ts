import {
  Client, GatewayIntentBits, Collection, Events,
  SlashCommandBuilder, REST, Routes, Interaction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits,
} from 'discord.js';
import { prisma } from '../../database/client';
import { config } from '../../config';
import { Colors, embedSuccess, embedError, embedInfo, embedStore } from '../../utils/embeds';
import { createChildLogger } from '../../utils/logger';
import { formatEth, truncateAddress } from '../../utils/helpers';

const log = createChildLogger('bot-payments');

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your wallet balance'),
  
  new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Wallet management')
    .addSubcommand(sub => sub.setName('info').setDescription('View your wallet info'))
    .addSubcommand(sub => sub.setName('deposit').setDescription('Get deposit address')
      .addStringOption(opt => opt.setName('amount').setDescription('Amount in ETH (optional)').setRequired(false)))
    .addSubcommand(sub => sub.setName('withdraw').setDescription('Withdraw ETH')
      .addStringOption(opt => opt.setName('amount').setDescription('Amount in ETH').setRequired(true))
      .addStringOption(opt => opt.setName('address').setDescription('Destination address').setRequired(true)))
    .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer to another user')
      .addUserOption(opt => opt.setName('user').setDescription('Recipient user').setRequired(true))
      .addNumberOption(opt => opt.setName('amount').setDescription('Amount in ETH').setRequired(true))),
  
  new SlashCommandBuilder()
    .setName('store')
    .setDescription('Browse the store')
    .addStringOption(opt => opt.setName('category').setDescription('Category').setRequired(false)
      .addChoices(
        { name: 'All', value: 'all' },
        { name: 'Macros', value: 'macros' },
        { name: 'Scripts', value: 'scripts' },
        { name: 'Tools', value: 'tools' },
        { name: 'Items', value: 'roblox-items' },
        { name: 'Services', value: 'services' },
      ))
    .addStringOption(opt => opt.setName('search').setDescription('Search products').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase a product')
    .addStringOption(opt => opt.setName('product').setDescription('Product name or ID').setRequired(true))
    .addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('orders')
    .setDescription('View your orders'),
  
  new SlashCommandBuilder()
    .setName('admin-deposit')
    .setDescription('[ADMIN] Add funds to a user wallet')
    .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    .addNumberOption(opt => opt.setName('amount').setDescription('Amount in ETH').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
    .setName('admin-products')
    .setDescription('[ADMIN] Manage products')
    .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true)
      .addChoices(
        { name: 'List', value: 'list' },
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' },
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function ensureUser(interaction: any) {
  let user = await prisma.user.findFirst({ where: { discordId: interaction.user.id } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        discordId: interaction.user.id,
        discordTag: interaction.user.tag,
        username: interaction.user.username,
      },
    });
    await prisma.wallet.create({
      data: {
        userId: user.id,
        address: `0x${interaction.user.id.replace(/\D/g, '').padEnd(40, '0').slice(0, 40)}`,
      },
    });
    log.info(`Auto-created user: ${interaction.user.tag}`);
  }
  return user;
}

async function handleBalance(interaction: any) {
  const user = await ensureUser(interaction);
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

  const embed = embedStore('Wallet Balance', `**${formatEth(wallet?.balance || 0)}**`, [
    { name: 'Address', value: `\`${truncateAddress(wallet?.address || 'N/A')}\``, inline: true },
    { name: 'Locked', value: formatEth(wallet?.locked || 0), inline: true },
    { name: 'ID', value: `\`${user.id.slice(0, 8)}\``, inline: true },
  ]);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleWalletInfo(interaction: any) {
  const user = await ensureUser(interaction);
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const txCount = await prisma.transaction.count({ where: { OR: [{ fromWalletId: wallet?.id }, { toWalletId: wallet?.id }] } });

  const embed = embedInfo('Wallet Info', '', [
    { name: 'Address', value: `\`${wallet?.address || 'N/A'}\``, inline: false },
    { name: 'Balance', value: formatEth(wallet?.balance || 0), inline: true },
    { name: 'Locked', value: formatEth(wallet?.locked || 0), inline: true },
    { name: 'Transactions', value: `${txCount}`, inline: true },
  ]);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStore(interaction: any) {
  const category = interaction.options.getString('category');
  const search = interaction.options.getString('search');

  const where: any = { active: true };
  if (category && category !== 'all') where.category = category;
  if (search) where.OR = [
    { name: { contains: search } },
    { description: { contains: search } },
    { tags: { contains: search } },
  ];

  const products = await prisma.product.findMany({ where, orderBy: { featured: 'desc' }, take: 25 });

  if (products.length === 0) {
    await interaction.reply({ embeds: [embedError('Store', 'No products found.')], ephemeral: true });
    return;
  }

  const fields = products.map(p => ({
    name: `${p.featured ? '⭐ ' : ''}${p.name}`,
    value: `**${formatEth(p.price)}** | ${p.category}\n${p.description.slice(0, 100)}${p.description.length > 100 ? '...' : ''}`,
    inline: true,
  }));

  const embed = embedStore('Teto Store', `Found **${products.length}** products. Use \`/buy <product name>\` to purchase.`, fields);

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('store_select')
      .setPlaceholder('Quick purchase...')
      .addOptions(products.slice(0, 25).map(p => ({
        label: `${p.name} - ${formatEth(p.price)}`,
        value: p.id,
        description: p.category,
      })))
  );

  await interaction.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
}

async function handleBuy(interaction: any) {
  const productQuery = interaction.options.getString('product');
  const quantity = interaction.options.getInteger('quantity') || 1;

  const product = await prisma.product.findFirst({
    where: { active: true, OR: [{ name: { contains: productQuery } }, { id: productQuery }] },
  });

  if (!product) {
    await interaction.reply({ embeds: [embedError('Purchase', 'Product not found.')], ephemeral: true });
    return;
  }

  if (product.stock !== -1 && product.stock < quantity) {
    await interaction.reply({ embeds: [embedError('Purchase', `Insufficient stock. Available: ${product.stock}`)], ephemeral: true });
    return;
  }

  const total = product.price * quantity;
  const user = await ensureUser(interaction);
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

  if (!wallet || wallet.balance < total) {
    const embed = embedError('Insufficient Balance', `You need **${formatEth(total)}** but have **${formatEth(wallet?.balance || 0)}**.\n\nUse \`/wallet deposit\` to add funds.`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Create order
  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        quantity,
        totalAmount: total,
        currency: product.currency,
        status: 'pending',
        discordChannelId: interaction.channelId,
      },
    });
    return newOrder;
  });

  const embed = embedStore('Order Created', `**${product.name}** x${quantity}`, [
    { name: 'Order ID', value: `\`${order.id.slice(0, 8)}\``, inline: true },
    { name: 'Total', value: formatEth(total), inline: true },
    { name: 'Your Balance', value: formatEth(wallet?.balance || 0), inline: true },
  ]);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pay_${order.id}`).setLabel('Pay Now').setStyle(ButtonStyle.Success).setEmoji('💰'),
    new ButtonBuilder().setCustomId(`cancel_${order.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌'),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  log.info(`Order created: ${order.id} by ${interaction.user.tag}`);
}

async function handlePayOrder(interaction: any, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
  if (!order) {
    await interaction.reply({ embeds: [embedError('Payment', 'Order not found.')], ephemeral: true });
    return;
  }

  const user = await ensureUser(interaction);
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet || wallet.balance < order.totalAmount) {
    await interaction.reply({ embeds: [embedError('Payment', 'Insufficient balance.')], ephemeral: true });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: order.totalAmount } } });
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount: order.totalAmount,
        currency: order.currency,
        fromAddress: wallet.address,
        toAddress: '0x0000000000000000000000000000000000000000',
        status: 'confirmed',
        confirmations: 3,
        requiredConfirmations: 3,
      },
    });
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'paid' } });
    return updated;
  });

  const embed = embedSuccess('Payment Confirmed!', `**${order.product.name}** purchased!\n\nOrder \`${order.id.slice(0, 8)}\` is now **paid**. Staff will process delivery shortly.`, [
    { name: 'Amount', value: formatEth(order.totalAmount), inline: true },
    { name: 'Balance Left', value: formatEth(wallet.balance - order.totalAmount), inline: true },
  ]);

  await interaction.update({ embeds: [embed], components: [] });
  log.info(`Payment confirmed: Order ${order.id}`);
}

async function handleOrders(interaction: any) {
  const user = await ensureUser(interaction);
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  if (orders.length === 0) {
    await interaction.reply({ embeds: [embedInfo('Orders', 'You have no orders yet.')], ephemeral: true });
    return;
  }

  const fields = orders.map(o => ({
    name: `\`${o.id.slice(0, 8)}\` - ${o.product.name}`,
    value: `Status: **${o.status}** | ${formatEth(o.totalAmount)} | ${new Date(o.createdAt).toLocaleDateString()}`,
    inline: false,
  }));

  await interaction.reply({ embeds: [embedInfo('Your Orders', '', fields)], ephemeral: true });
}

async function handleAdminDeposit(interaction: any) {
  const targetUser = interaction.options.getUser('user');
  const amount = interaction.options.getNumber('amount');

  const user = await prisma.user.findFirst({ where: { discordId: targetUser.id } });
  if (!user) {
    await interaction.reply({ embeds: [embedError('Admin', 'User not registered in system.')], ephemeral: true });
    return;
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    await interaction.reply({ embeds: [embedError('Admin', 'User has no wallet.')], ephemeral: true });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await tx.transaction.create({
      data: { toWalletId: wallet.id, amount, type: 'deposit', status: 'confirmed', description: `Admin deposit by ${interaction.user.tag}` },
    });
  });

  await interaction.reply({ embeds: [embedSuccess('Deposit Complete', `Added **${formatEth(amount)}** to ${targetUser.tag}'s wallet.`)], ephemeral: true });
  log.info(`Admin deposit: ${amount} ETH to ${user.username} by ${interaction.user.tag}`);
}

export async function startPaymentsBot(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once(Events.ClientReady, async (c) => {
    log.info(`Payments Bot ready as ${c.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.discord.payments.token);
    try {
      await rest.put(Routes.applicationGuildCommands(config.discord.payments.clientId, config.discord.guildId), {
        body: commands.map(cmd => cmd.toJSON()),
      });
      log.info('Slash commands registered');
    } catch (error) {
      log.error('Failed to register commands', error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'balance': await handleBalance(interaction); break;
        case 'wallet':
          switch (interaction.options.getSubcommand()) {
            case 'info': await handleWalletInfo(interaction); break;
            case 'deposit':
              await interaction.reply({ embeds: [embedInfo('Deposit', 'Send ETH to your wallet address:\n`' + 'Use /wallet info to get your address.`\n\nOr contact an admin to add funds.')], ephemeral: true });
              break;
            case 'withdraw':
              await interaction.reply({ embeds: [embedInfo('Withdraw', 'Withdrawals are processed manually by staff. Open a support ticket.')], ephemeral: true });
              break;
            case 'transfer':
              await interaction.reply({ embeds: [embedInfo('Transfer', 'Transfers between users are instant. Use the command correctly.')], ephemeral: true });
              break;
          }
          break;
        case 'store': await handleStore(interaction); break;
        case 'buy': await handleBuy(interaction); break;
        case 'orders': await handleOrders(interaction); break;
        case 'admin-deposit': await handleAdminDeposit(interaction); break;
        case 'admin-products': await interaction.reply({ embeds: [embedInfo('Admin Products', 'Use the web dashboard to manage products.')], ephemeral: true }); break;
      }
    } catch (error) {
      log.error(`Command error: ${interaction.commandName}`, error);
      const reply = { embeds: [embedError('Error', 'An error occurred.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    }
  });

  // Handle button interactions (pay/cancel)
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('pay_')) {
      const orderId = interaction.customId.replace('pay_', '');
      await handlePayOrder(interaction, orderId);
    } else if (interaction.customId.startsWith('cancel_')) {
      const orderId = interaction.customId.replace('cancel_', '');
      await prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
      await interaction.update({ embeds: [embedInfo('Order Cancelled', `Order \`${orderId.slice(0, 8)}\` has been cancelled.`)], components: [] });
    }
  });

  // Handle select menu (quick buy)
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId === 'store_select') {
      const productId = interaction.values[0];
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return;

      const user = await ensureUser(interaction);
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const total = product.price;

      if (!wallet || wallet.balance < total) {
        await interaction.reply({ embeds: [embedError('Insufficient Balance', `Need **${formatEth(total)}**, have **${formatEth(wallet?.balance || 0)}**.`)], ephemeral: true });
        return;
      }

      const order = await prisma.order.create({
        data: { userId: user.id, productId: product.id, quantity: 1, totalAmount: total, currency: product.currency, status: 'pending', discordChannelId: interaction.channelId },
      });

      const embed = embedStore('Order Created', `**${product.name}**`, [
        { name: 'Total', value: formatEth(total), inline: true },
      ]);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`pay_${order.id}`).setLabel('Pay Now').setStyle(ButtonStyle.Success).setEmoji('💰'),
        new ButtonBuilder().setCustomId(`cancel_${order.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌'),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    }
  });

  await client.login(config.discord.payments.token);
}
