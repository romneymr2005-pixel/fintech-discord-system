import {
  Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, CategoryChannel, TextChannel,
} from 'discord.js';
import { prisma } from '../../database/client';
import { config } from '../../config';
import { Colors, embedSuccess, embedError, embedInfo, embedWarning } from '../../utils/embeds';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('bot-support');

let supportCategoryId: string = '';

const commands = [
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create a support ticket')
    .addStringOption(opt => opt.setName('subject').setDescription('Brief description').setRequired(true))
    .addStringOption(opt => opt.setName('category').setDescription('Category').setRequired(false)
      .addChoices(
        { name: 'General', value: 'general' },
        { name: 'Payment Issue', value: 'payment' },
        { name: 'Delivery Problem', value: 'delivery' },
        { name: 'Technical Help', value: 'technical' },
        { name: 'Refund Request', value: 'refund' },
        { name: 'Ban Appeal', value: 'ban-appeal' },
      )),

  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close current support ticket'),

  new SlashCommandBuilder()
    .setName('faq')
    .setDescription('View frequently asked questions')
    .addStringOption(opt => opt.setName('topic').setDescription('FAQ topic').setRequired(false)
      .addChoices(
        { name: 'All', value: 'all' },
        { name: 'How to Buy', value: 'buying' },
        { name: 'Payment Methods', value: 'payment' },
        { name: 'Delivery Info', value: 'delivery' },
        { name: 'Refund Policy', value: 'refund' },
        { name: 'Account Info', value: 'account' },
      )),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View community rules'),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('[ADMIN] Send announcement')
    .addStringOption(opt => opt.setName('message').setDescription('Announcement message').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Title').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-support')
    .setDescription('[ADMIN] Setup support category')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

const faqs: Record<string, { question: string; answer: string }[]> = {
  buying: [
    { question: 'How do I buy something?', answer: 'Use the `/store` command in the payments channel to browse products. Select a product and click "Pay Now" to complete your purchase with your wallet balance.' },
    { question: 'Do I need ETH to buy?', answer: 'Yes, we accept ETH for all purchases. Use `/wallet deposit` or ask an admin to add funds to your account.' },
  ],
  payment: [
    { question: 'What payment methods are accepted?', answer: 'We accept Ethereum (ETH) transfers and internal wallet payments. External crypto payments are coming soon.' },
    { question: 'How long does payment take?', answer: 'Internal wallet payments are instant. External ETH transfers require 3 confirmations (~1 minute).' },
  ],
  delivery: [
    { question: 'When do I get my purchase?', answer: 'Digital products are delivered instantly or within 5 minutes. For manual deliveries, a staff member will process your order shortly.' },
    { question: 'I haven\'t received my order', answer: 'Open a support ticket with your order ID and we\'ll resolve it immediately.' },
  ],
  refund: [
    { question: 'What is the refund policy?', answer: 'Refunds are available within 24 hours of purchase for undelivered items. Contact support with your order ID to request a refund.' },
    { question: 'How do I request a refund?', answer: 'Open a support ticket with category "Refund Request", provide your order ID and reason. Staff will review within 24 hours.' },
  ],
  account: [
    { question: 'How do I link my Discord account?', answer: 'Your Discord account is automatically linked when you first use any command. Use `/balance` to check your wallet.' },
    { question: 'How do I check my balance?', answer: 'Use the `/balance` command or `/wallet info` for detailed wallet information.' },
  ],
};

const communityRules = [
  '**1.** Be respectful to all members and staff',
  '**2.** No spamming, self-promotion, or advertising',
  '**3.** Use appropriate channels for your messages',
  '**4.** No sharing of purchased content with others',
  '**5.** Follow Discord Terms of Service',
  '**6.** Use support tickets for issues, not DMs',
  '**7.** No impersonation of staff members',
  '**8.** English and Spanish are both accepted',
];

async function ensureUser(interaction: any) {
  let user = await prisma.user.findFirst({ where: { discordId: interaction.user.id } });
  if (!user) {
    user = await prisma.user.create({
      data: { discordId: interaction.user.id, discordTag: interaction.user.tag, username: interaction.user.username },
    });
    await prisma.wallet.create({
      data: { userId: user.id, address: `0x${interaction.user.id.replace(/\D/g, '').padEnd(40, '0').slice(0, 40)}` },
    });
  }
  return user;
}

async function createTicketChannel(interaction: any, subject: string, category: string): Promise<TextChannel | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  // Find or create support category
  let supportCat = guild.channels.cache.find((c: any) => c.name === 'support-tickets' && c.type === ChannelType.GuildCategory) as CategoryChannel;
  if (!supportCat) {
    supportCat = await guild.channels.create({
      name: 'support-tickets',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages] },
      ],
    }) as CategoryChannel;
    supportCategoryId = supportCat.id;
  }

  const ticketNum = await prisma.supportTicket.count() + 1;
  const channel = await guild.channels.create({
    name: `ticket-${ticketNum}-${subject.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: supportCat.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });

  return channel as TextChannel;
}

async function handleCreateTicket(interaction: any) {
  const subject = interaction.options.getString('subject');
  const category = interaction.options.getString('category') || 'general';

  const user = await ensureUser(interaction);

  // Check for open tickets
  const openTicket = await prisma.supportTicket.findFirst({ where: { userId: user.id, status: { in: ['open', 'in-progress', 'waiting'] } } });
  if (openTicket) {
    await interaction.reply({ embeds: [embedWarning('Active Ticket', `You already have an open ticket: \`${openTicket.subject}\`\nPlease close it first or wait for a response.`)], ephemeral: true });
    return;
  }

  const channel = await createTicketChannel(interaction, subject, category);
  if (!channel) {
    await interaction.reply({ embeds: [embedError('Error', 'Could not create ticket channel.')], ephemeral: true });
    return;
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      discordChannelId: channel.id,
      subject,
      category,
      status: 'open',
      priority: category === 'payment' || category === 'refund' ? 'high' : 'normal',
    },
  });

  const embed = embedInfo('Support Ticket', `**${subject}**\n\nCategory: ${category}\nTicket ID: \`${ticket.id.slice(0, 8)}\`\n\nDescribe your issue in detail. A staff member will assist you shortly.`, [
    { name: 'Status', value: '🟢 Open', inline: true },
    { name: 'Priority', value: ticket.priority === 'high' ? '🔴 High' : '🟡 Normal', inline: true },
    { name: 'User', value: `${interaction.user}`, inline: true },
  ]);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`close_ticket_${ticket.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId(`escalate_ticket_${ticket.id}`).setLabel('Escalate').setStyle(ButtonStyle.Secondary).setEmoji('⬆️'),
  );

  await channel.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });
  await interaction.reply({ embeds: [embedSuccess('Ticket Created', `Your ticket has been created: ${channel}`)], ephemeral: true });

  log.info(`Ticket created: ${ticket.id} by ${interaction.user.tag}`);
}

async function handleCloseTicket(interaction: any, ticketId?: string) {
  const id = ticketId || '';
  let ticket;

  if (id) {
    ticket = await prisma.supportTicket.findUnique({ where: { id } });
  } else {
    ticket = await prisma.supportTicket.findFirst({ where: { discordChannelId: interaction.channelId } });
  }

  if (!ticket) {
    await interaction.reply({ embeds: [embedError('Error', 'No active ticket found for this channel.')], ephemeral: true });
    return;
  }

  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'closed' } });

  const embed = embedInfo('Ticket Closed', `Ticket \`${ticket.id.slice(0, 8)}\` has been closed.\nThis channel will be deleted in 10 seconds.`);

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }

  setTimeout(async () => {
    try {
      const channel = interaction.channel;
      if (channel && channel.type === ChannelType.GuildText) {
        await channel.delete(`Ticket ${ticket.id.slice(0, 8)} closed`);
      }
    } catch (e) { /* ignore */ }
  }, 10000);
}

async function handleFAQ(interaction: any) {
  const topic = interaction.options.getString('topic') || 'all';

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (topic === 'all') {
    for (const [key, items] of Object.entries(faqs)) {
      for (const faq of items.slice(0, 2)) {
        fields.push({ name: `❓ ${faq.question}`, value: faq.answer, inline: false });
      }
    }
  } else {
    const items = faqs[topic] || [];
    for (const faq of items) {
      fields.push({ name: `❓ ${faq.question}`, value: faq.answer, inline: false });
    }
  }

  await interaction.reply({ embeds: [embedInfo('Frequently Asked Questions', '', fields.slice(0, 25))], ephemeral: true });
}

export async function startSupportBot(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.once(Events.ClientReady, async (c) => {
    log.info(`Support Bot ready as ${c.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.discord.support.token);
    try {
      await rest.put(Routes.applicationGuildCommands(config.discord.support.clientId, config.discord.guildId), {
        body: commands.map(cmd => cmd.toJSON()),
      });
      log.info('Support commands registered');
    } catch (error) {
      log.error('Failed to register support commands', error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'ticket': await handleCreateTicket(interaction); break;
        case 'close': await handleCloseTicket(interaction); break;
        case 'faq': await handleFAQ(interaction); break;
        case 'rules': {
          const embed = embedInfo('Community Rules', communityRules.join('\n'));
          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }
        case 'announce': {
          const msg = interaction.options.getString('message');
          const title = interaction.options.getString('title') || 'Announcement';
          const embed = new EmbedBuilder().setColor(Colors.gold).setTitle(`📢 ${title}`).setDescription(msg).setTimestamp().setFooter({ text: `Announced by ${interaction.user.tag}` });
          await (interaction.channel as TextChannel)?.send({ embeds: [embed] });
          await interaction.reply({ embeds: [embedSuccess('Announced', 'Your announcement has been sent.')], ephemeral: true });
          break;
        }
        case 'setup-support': {
          await interaction.reply({ embeds: [embedSuccess('Setup', 'Support category will be created on the next ticket.')], ephemeral: true });
          break;
        }
      }
    } catch (error) {
      log.error(`Support command error: ${interaction.commandName}`, error);
    }
  });

  // Handle ticket close/escalate buttons
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('close_ticket_')) {
      const ticketId = interaction.customId.replace('close_ticket_', '');
      await handleCloseTicket(interaction, ticketId);
    } else if (interaction.customId.startsWith('escalate_ticket_')) {
      const ticketId = interaction.customId.replace('escalate_ticket_', '');
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { priority: 'urgent' } });
      await interaction.reply({ embeds: [embedWarning('Escalated', 'This ticket has been escalated to urgent priority.')], ephemeral: true });
    }
  });

  // Handle messages in ticket channels (auto-reply to tickets)
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.channel.isTextBased()) return;

    const ticket = await prisma.supportTicket.findFirst({ where: { discordChannelId: message.channelId, status: { in: ['open', 'in-progress', 'waiting'] } } });
    if (!ticket) return;

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: message.author.id,
        content: message.content.slice(0, 2000),
        isStaff: message.member?.permissions.has(PermissionFlagsBits.ManageMessages) || false,
      },
    });

    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'in-progress', updatedAt: new Date() } });
  });

  await client.login(config.discord.support.token);
}
