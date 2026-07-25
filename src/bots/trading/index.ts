import {
  Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, TextChannel,
} from 'discord.js';
import { prisma } from '../../database/client';
import { config } from '../../config';
import { Colors, embedTrade, embedSuccess, embedError, embedInfo, embedWarning } from '../../utils/embeds';
import { createChildLogger } from '../../utils/logger';
import { analyzeMarket } from '../../ai/nvidia';
import axios from 'axios';

const log = createChildLogger('bot-trading');

const commands = [
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get current crypto price')
    .addStringOption(opt => opt.setName('symbol').setDescription('Symbol (ETH, BTC, SOL, etc.)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('prices')
    .setDescription('Get top crypto prices'),

  new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('AI-powered market analysis')
    .addStringOption(opt => opt.setName('symbol').setDescription('Symbol to analyze').setRequired(true)),

  new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Set a price alert')
    .addStringOption(opt => opt.setName('symbol').setDescription('Symbol').setRequired(true))
    .addStringOption(opt => opt.setName('condition').setDescription('Condition').setRequired(true)
      .addChoices(
        { name: 'Price Above', value: 'above' },
        { name: 'Price Below', value: 'below' },
      ))
    .addNumberOption(opt => opt.setName('target').setDescription('Target price').setRequired(true)),

  new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('View your active alerts'),

  new SlashCommandBuilder()
    .setName('cancel-alert')
    .setDescription('Cancel an alert')
    .addStringOption(opt => opt.setName('id').setDescription('Alert ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('View your portfolio summary'),

  new SlashCommandBuilder()
    .setName('market')
    .setDescription('Market overview with top gainers/losers'),
];

let priceCache: Record<string, { price: number; change24h: number; volume: number; lastUpdate: number }> = {};

async function getCryptoPrice(symbol: string): Promise<{ price: number; change24h: number; volume: number; marketCap: number } | null> {
  const cacheKey = symbol.toLowerCase();
  const cached = priceCache[cacheKey];
  if (cached && Date.now() - cached.lastUpdate < 30000) {
    return { price: cached.price, change24h: cached.change24h, volume: cached.volume, marketCap: 0 };
  }

  try {
    const coinIds: Record<string, string> = { eth: 'ethereum', btc: 'bitcoin', sol: 'solana', doge: 'dogecoin', ada: 'cardano', xrp: 'ripple', dot: 'polkadot', matic: 'matic-network', avax: 'avalanche-2', bnb: 'binancecoin', link: 'chainlink', uni: 'uniswap' };
    const coinId = coinIds[cacheKey] || cacheKey;
    const resp = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
    const data = resp.data[coinId];
    if (!data) return null;

    const result = { price: data.usd, change24h: data.usd_24h_change || 0, volume: data.usd_24h_vol || 0, marketCap: data.usd_market_cap || 0 };
    priceCache[cacheKey] = { ...result, lastUpdate: Date.now() };

    await prisma.priceHistory.create({ data: { symbol: symbol.toUpperCase(), price: result.price, volume: result.volume, change24h: result.change24h } });
    return result;
  } catch (error) {
    log.error(`Price fetch error for ${symbol}`, error);
    return null;
  }
}

async function handlePrice(interaction: any) {
  const symbol = interaction.options.getString('symbol').toUpperCase();
  await interaction.deferReply();

  const data = await getCryptoPrice(symbol);
  if (!data) {
    await interaction.editReply({ embeds: [embedError('Price Error', `Could not fetch price for **${symbol}**.`)] });
    return;
  }

  const changeEmoji = data.change24h >= 0 ? '📈' : '📉';
  const changeColor = data.change24h >= 0 ? Colors.success : Colors.error;

  const embed = embedTrade(`${symbol} Price`, '', [
    { name: '💰 Price', value: `$${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`, inline: true },
    { name: `${changeEmoji} 24h Change`, value: `${data.change24h >= 0 ? '+' : ''}${data.change24h.toFixed(2)}%`, inline: true },
    { name: '📊 24h Volume', value: `$${(data.volume / 1_000_000).toFixed(2)}M`, inline: true },
  ]);
  embed.setColor(changeColor as any);

  await interaction.editReply({ embeds: [embed] });
}

async function handlePrices(interaction: any) {
  await interaction.deferReply();

  const symbols = ['ETH', 'BTC', 'SOL', 'DOGE', 'ADA', 'XRP', 'BNB', 'AVAX'];
  const results = await Promise.all(symbols.map(async (s) => ({ symbol: s, data: await getCryptoPrice(s) })));

  const fields = results.filter(r => r.data).map(r => ({
    name: `${r.data!.change24h >= 0 ? '🟢' : '🔴'} ${r.symbol}`,
    value: `$${r.data!.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${r.data!.change24h >= 0 ? '+' : ''}${r.data!.change24h.toFixed(2)}%)`,
    inline: true,
  }));

  await interaction.editReply({ embeds: [embedTrade('Top Crypto Prices', 'Real-time market data', fields)] });
}

async function handleAnalyze(interaction: any) {
  const symbol = interaction.options.getString('symbol').toUpperCase();
  await interaction.deferReply({ content: `Analyzing ${symbol} with AI... This may take a moment.` });

  try {
    const priceData = await getCryptoPrice(symbol);
    if (!priceData) {
      await interaction.editReply({ embeds: [embedError('Error', `Could not get price data for **${symbol}**.`)] });
      return;
    }

    const history = await prisma.priceHistory.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
      take: 24,
    });

    const analysis = await analyzeMarket(symbol, priceData, history);

    const embed = embedTrade(`AI Analysis: ${symbol}`, analysis.summary, [
      { name: '📊 Signal', value: analysis.signal, inline: true },
      { name: '🎯 Confidence', value: `${analysis.confidence}%`, inline: true },
      { name: '⏱️ Timeframe', value: analysis.timeframe, inline: true },
      { name: '📈 Support', value: `$${analysis.support.toLocaleString()}`, inline: true },
      { name: '📉 Resistance', value: `$${analysis.resistance.toLocaleString()}`, inline: true },
      { name: '⚠️ Risk', value: analysis.risk, inline: true },
    ]);

    await interaction.editReply({ embeds: [embed] });
    log.info(`AI analysis completed for ${symbol} by ${interaction.user.tag}`);
  } catch (error) {
    log.error('Analysis error', error);
    await interaction.editReply({ embeds: [embedError('Analysis Error', 'AI analysis failed. Please try again.')] });
  }
}

async function handleAlert(interaction: any) {
  const symbol = interaction.options.getString('symbol').toUpperCase();
  const condition = interaction.options.getString('condition');
  const target = interaction.options.getNumber('target');

  const alert = await prisma.tradeAlert.create({
    data: {
      userId: interaction.user.id,
      symbol,
      type: condition === 'above' ? 'price-above' : 'price-below',
      targetValue: target,
      active: true,
    },
  });

  await interaction.reply({
    embeds: [embedSuccess('Alert Set', `**${symbol}** ${condition === 'above' ? 'above' : 'below'} **$${target.toLocaleString()}**\nAlert ID: \`${alert.id.slice(0, 8)}\``)],
    ephemeral: true,
  });
  log.info(`Alert created: ${symbol} ${condition} ${target} by ${interaction.user.tag}`);
}

async function handleAlerts(interaction: any) {
  const alerts = await prisma.tradeAlert.findMany({ where: { userId: interaction.user.id, active: true } });

  if (alerts.length === 0) {
    await interaction.reply({ embeds: [embedInfo('Alerts', 'No active alerts. Use `/alert` to create one.')], ephemeral: true });
    return;
  }

  const fields = alerts.map(a => ({
    name: `\`${a.id.slice(0, 8)}\` ${a.symbol}`,
    value: `${a.type === 'price-above' ? '📈 Above' : '📉 Below'} **$${a.targetValue.toLocaleString()}**`,
    inline: true,
  }));

  await interaction.reply({ embeds: [embedTrade('Your Alerts', `**${alerts.length}** active alerts`, fields)], ephemeral: true });
}

async function handleMarket(interaction: any) {
  await interaction.deferReply();

  const symbols = ['ETH', 'BTC', 'SOL', 'DOGE', 'ADA', 'XRP', 'BNB', 'AVAX', 'LINK', 'UNI', 'DOT', 'MATIC'];
  const results = await Promise.all(symbols.map(async (s) => ({ symbol: s, data: await getCryptoPrice(s) })));

  const valid = results.filter(r => r.data);
  const sorted = valid.sort((a, b) => (b.data!.change24h) - (a.data!.change24h));

  const topGainers = sorted.slice(0, 3).map(r => `🟢 **${r.symbol}**: +${r.data!.change24h.toFixed(2)}%`);
  const topLosers = sorted.slice(-3).reverse().map(r => `🔴 **${r.symbol}**: ${r.data!.change24h.toFixed(2)}%`);
  const totalMarketCap = valid.reduce((sum, r) => sum + (r.data?.marketCap || 0), 0);

  const embed = embedTrade('Market Overview', '', [
    { name: '🚀 Top Gainers', value: topGainers.join('\n') || 'N/A', inline: true },
    { name: '💥 Top Losers', value: topLosers.join('\n') || 'N/A', inline: true },
    { name: '💎 Total Market Cap', value: `$${(totalMarketCap / 1e12).toFixed(2)}T`, inline: true },
  ]);

  await interaction.editReply({ embeds: [embed] });
}

export async function startTradingBot(): Promise<void> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once(Events.ClientReady, async (c) => {
    log.info(`Trading Bot ready as ${c.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.discord.trading.token);
    try {
      await rest.put(Routes.applicationGuildCommands(config.discord.trading.clientId, config.discord.guildId), {
        body: commands.map(cmd => cmd.toJSON()),
      });
      log.info('Trading commands registered');
    } catch (error) {
      log.error('Failed to register trading commands', error);
    }

    // Start price alert checker
    setInterval(async () => {
      try {
        const alerts = await prisma.tradeAlert.findMany({ where: { active: true } });
        for (const alert of alerts) {
          const data = await getCryptoPrice(alert.symbol);
          if (!data) continue;

          const triggered = (alert.type === 'price-above' && data.price >= alert.targetValue) ||
            (alert.type === 'price-below' && data.price <= alert.targetValue);

          if (triggered) {
            await prisma.tradeAlert.update({ where: { id: alert.id }, data: { active: false, triggered: true, triggeredAt: new Date(), currentValue: data.price } });

            const user = await client.users.fetch(alert.userId).catch(() => null);
            if (user) {
              const embed = embedTrade('🔔 Alert Triggered!', `**${alert.symbol}** has ${alert.type === 'price-above' ? 'risen above' : 'fallen below'} **$${alert.targetValue.toLocaleString()}**`, [
                { name: 'Current Price', value: `$${data.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}`, inline: true },
                { name: 'Target', value: `$${alert.targetValue.toLocaleString()}`, inline: true },
              ]);
              await user.send({ embeds: [embed] }).catch(() => {});
            }
            log.info(`Alert triggered: ${alert.id} for ${alert.symbol}`);
          }
        }
      } catch (error) {
        log.error('Alert check error', error);
      }
    }, 60000); // Check every minute
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'price': await handlePrice(interaction); break;
        case 'prices': await handlePrices(interaction); break;
        case 'analyze': await handleAnalyze(interaction); break;
        case 'alert': await handleAlert(interaction); break;
        case 'alerts': await handleAlerts(interaction); break;
        case 'cancel-alert': {
          const id = interaction.options.getString('id');
          if (!id) {
            await interaction.reply({ embeds: [embedError('Error', 'Please provide an alert ID.')], ephemeral: true });
            break;
          }
          const alert = await prisma.tradeAlert.findFirst({ where: { userId: interaction.user.id, id: { startsWith: id } } });
          if (alert) {
            await prisma.tradeAlert.update({ where: { id: alert.id }, data: { active: false } });
            await interaction.reply({ embeds: [embedSuccess('Alert Cancelled', `Alert \`${alert.id.slice(0, 8)}\` cancelled.`)], ephemeral: true });
          } else {
            await interaction.reply({ embeds: [embedError('Error', 'Alert not found.')], ephemeral: true });
          }
          break;
        }
        case 'portfolio': await handleMarket(interaction); break;
        case 'market': await handleMarket(interaction); break;
      }
    } catch (error) {
      log.error(`Trading command error: ${interaction.commandName}`, error);
      const reply = { embeds: [embedError('Error', 'An error occurred.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
      else await interaction.reply(reply).catch(() => {});
    }
  });

  await client.login(config.discord.trading.token);
}
