import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatEth(wei: number): string {
  return `${wei.toFixed(6)} ETH`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function truncateAddress(address: string, chars: number = 6): string {
  if (!address) return 'N/A';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const value = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || 0);
}

export function escapeMarkdown(text: string): string {
  return text.replace(/[*_~`>|]/g, '\\$&');
}

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export function timestamp(): string {
  return new Date().toISOString();
}
