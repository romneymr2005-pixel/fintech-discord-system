import { EmbedBuilder, EmbedField } from 'discord.js';

export const Colors = {
  primary: 0xE84040,
  success: 0x00D26A,
  warning: 0xFFB830,
  error: 0xFF4444,
  info: 0x5865F2,
  neutral: 0x99AAB5,
  gold: 0xFFD700,
  purple: 0x9B59B6,
} as const;

export function embedSuccess(title: string, description: string, fields?: EmbedField[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
  if (fields?.length) embed.addFields(fields);
  return embed;
}

export function embedError(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.error)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function embedWarning(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function embedInfo(title: string, description: string, fields?: EmbedField[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.info)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setTimestamp();
  if (fields?.length) embed.addFields(fields);
  return embed;
}

export function embedStore(title: string, description: string, fields?: EmbedField[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.purple)
    .setTitle(`🛒 ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Teto Store' });
  if (fields?.length) embed.addFields(fields);
  return embed;
}

export function embedTrade(title: string, description: string, fields?: EmbedField[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.gold)
    .setTitle(`📊 ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Teto Trading Signals' });
  if (fields?.length) embed.addFields(fields);
  return embed;
}
