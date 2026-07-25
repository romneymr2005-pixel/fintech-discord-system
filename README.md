# Teto Fintech System

Sistema fintech completo con Discord bots, billetera Ethereum, y análisis de mercado con IA.

**Ideal para:** Comunidades de Roblox que vendan items, comunidades de Discord que busquen automatizar pagos, traders crypto que quieran alertas en Discord.

## Que Incluye

### Bots de Discord
- **Payments Bot** — Gestión de billetera, tienda, compras con ETH
- **Support Bot** — Sistema de tickets, FAQ, reglas, anuncios
- **Trading Bot** — Precios crypto, análisis con IA, alertas automatizadas

### REST API
- Auth (JWT)
- Wallet (balances, transacciones)
- Products (catálogo, CRUD)
- Orders (historial, estados)
- Support (tickets, respuestas)
- Express + Helmet + CORS

### IA Integrada
- NVIDIA DeepSeek API para análisis de mercado
- Generación de señales trading
- Respuestas contextuales

## Tech Stack

- Node.js 22 + TypeScript
- Discord.js v14
- Prisma + SQLite (fácil migrar a Postgres)
- Express.js
- Ethers.js (ETH wallet)
- NVIDIA DeepSeek AI
- CoinGecko API

## Setup Rapido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar base de datos
npx prisma db push
npx prisma generate
npm run db:seed

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus tokens

# 4. Levantar todo
npm run all
```

## Configurar Bots de Discord

1. Ir a https://discord.com/developers/applications
2. Crear 3 aplicaciones: Payments, Support, Trading
3. En cada una: Bot tab → Create bot → Copiar token
4. OAuth2 → URL Generator → Marcar `bot` + `applications.commands`
5. Invitar bots a tu servidor
6. Copiar Server ID (click derecho en servidor → Copy ID)
7. Pegar tokens en `.env`

## Comandos

| Bot | Comando | Descripción |
|-----|---------|-------------|
| Payments | `/balance` | Ver saldo |
| Payments | `/store` | Ver productos |
| Payments | `/buy <product>` | Comprar item |
| Payments | `/orders` | Historial |
| Support | `/ticket <asunto>` | Crear ticket |
| Support | `/faq` | Ver FAQ |
| Support | `/rules` | Reglas |
| Trading | `/price <symbol>` | Precio crypto |
| Trading | `/analyze <symbol>` | Análisis con IA |
| Trading | `/alert` | Configurar alerta |

## Variables de Entorno

```env
# API
PORT=3000
JWT_SECRET=tu_secreto_aqui

# Discord
DISCORD_PAYMENTS_TOKEN=
DISCORD_SUPPORT_TOKEN=
DISCORD_TRADING_TOKEN=
DISCORD_GUILD_ID=

# AI
NVIDIA_API_KEY=

# ETH (opcional, para pagos reales)
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
WALLET_PRIVATE_KEY=
```

## Estructura

```
src/
├── ai/nvidia.ts           # Integracion NVIDIA DeepSeek
├── api/                   # Express REST API
│   └── routes/            # auth, wallet, products, orders, support
├── bots/
│   ├── payments/          # Bot de pagos
│   ├── support/           # Bot de soporte
│   └── trading/           # Bot de trading
├── config/                # Configuracion centralizada
├── database/              # Prisma client + seed
├── utils/                 # helpers, logger, validators
└── index.ts               # Orquestador principal
```

## Autor

Construido por **Romney** — [@romneymr2005-pixel](https://github.com/romneymr2005-pixel)

## Licencia

MIT
