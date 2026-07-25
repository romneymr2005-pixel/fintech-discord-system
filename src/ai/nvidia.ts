import OpenAI from 'openai';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('nvidia-ai');

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: config.nvidia.apiKey,
});

export interface MarketAnalysis {
  summary: string;
  signal: string;
  confidence: number;
  timeframe: string;
  support: number;
  resistance: number;
  risk: string;
}

export async function analyzeMarket(
  symbol: string,
  currentPrice: { price: number; change24h: number; volume: number },
  history: { price: number; change24h: number | null; timestamp: Date }[]
): Promise<MarketAnalysis> {
  const priceHistory = history.map(h => `$${h.price?.toFixed(2)} (${h.change24h?.toFixed(2)}%)`).join(', ');

  const prompt = `You are an expert crypto market analyst. Analyze ${symbol} cryptocurrency.

Current Price: $${currentPrice.price}
24h Change: ${currentPrice.change24h.toFixed(2)}%
24h Volume: $${(currentPrice.volume / 1_000_000).toFixed(2)}M
Recent Price History: ${priceHistory || 'Limited data'}

Provide a concise analysis in this exact JSON format (no markdown, just raw JSON):
{
  "summary": "2-3 sentence analysis of current market conditions",
  "signal": "STRONG BUY / BUY / HOLD / SELL / STRONG SELL",
  "confidence": 75,
  "timeframe": "short-term (1-7 days)",
  "support": ${currentPrice.price * 0.95},
  "resistance": ${currentPrice.price * 1.05},
  "risk": "LOW / MEDIUM / HIGH"
}`;

  try {
    const completion = await client.chat.completions.create({
      model: config.nvidia.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 1024,
      stream: false,
    } as any);

    const response = completion.choices[0]?.message?.content || '';
    log.info(`AI response for ${symbol}: ${response.slice(0, 100)}...`);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || `Analysis for ${symbol} based on current market data.`,
        signal: parsed.signal || 'HOLD',
        confidence: Math.min(100, Math.max(0, parsed.confidence || 70)),
        timeframe: parsed.timeframe || 'short-term',
        support: parsed.support || currentPrice.price * 0.95,
        resistance: parsed.resistance || currentPrice.price * 1.05,
        risk: parsed.risk || 'MEDIUM',
      };
    }

    return {
      summary: response.slice(0, 500) || `Analysis for ${symbol}: Price at $${currentPrice.price} with ${currentPrice.change24h.toFixed(2)}% 24h change.`,
      signal: currentPrice.change24h > 3 ? 'BUY' : currentPrice.change24h < -3 ? 'SELL' : 'HOLD',
      confidence: 65,
      timeframe: 'short-term (1-7 days)',
      support: currentPrice.price * 0.95,
      resistance: currentPrice.price * 1.05,
      risk: Math.abs(currentPrice.change24h) > 10 ? 'HIGH' : Math.abs(currentPrice.change24h) > 5 ? 'MEDIUM' : 'LOW',
    };
  } catch (error) {
    log.error('NVIDIA AI error', error);
    return {
      summary: `AI analysis temporarily unavailable for ${symbol}. Current price: $${currentPrice.price} with ${currentPrice.change24h.toFixed(2)}% change.`,
      signal: 'HOLD',
      confidence: 50,
      timeframe: 'N/A',
      support: currentPrice.price * 0.95,
      resistance: currentPrice.price * 1.05,
      risk: 'MEDIUM',
    };
  }
}

export async function generateStoreDescription(productName: string, category: string): Promise<string> {
  try {
    const completion = await client.chat.completions.create({
      model: config.nvidia.model,
      messages: [{
        role: 'user',
        content: `Write a compelling, professional product description for a Roblox community store listing. Product: "${productName}", Category: "${category}". Keep it under 200 words. Make it sound premium and trustworthy.`,
      }],
      temperature: 0.8,
      max_tokens: 512,
      stream: false,
    } as any);

    return completion.choices[0]?.message?.content || `Premium ${category} product for the Roblox community.`;
  } catch (error) {
    log.error('AI description generation error', error);
    return `Premium ${productName} - Quality product for the Roblox community.`;
  }
}
