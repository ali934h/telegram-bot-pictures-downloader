# Telegram Bot - Picture Downloader

A Cloudflare Workers-based Telegram bot that extracts and downloads high-quality images from web galleries.

## Features

- 🔒 **Private bot** with user authorization
- 🎯 **Multi-strategy extraction** with automatic fallback
- 🧹 **Smart filtering** removes thumbnails and low-quality images
- ⚡ **Cloudflare Workers** for serverless deployment
- 📤 **Direct delivery** sends images as documents to Telegram

## How It Works

1. Send a gallery URL to the bot
2. Bot fetches the page and extracts high-quality image URLs
3. Downloads images and sends them directly to your chat

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Cloudflare account](https://dash.cloudflare.com/)
- Telegram bot token from [@BotFather](https://t.me/botfather)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ali934h/telegram-bot-pictures-downloader.git
   cd telegram-bot-pictures-downloader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Set your Telegram bot token
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   
   # Set authorized user IDs (comma-separated)
   npx wrangler secret put ALLOWED_USER_IDS
   # Example: 123456789,987654321
   ```

4. **Deploy to Cloudflare Workers**
   ```bash
   npm run deploy
   ```

5. **Set webhook**
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>"
   ```

## Usage

1. Start a chat with your bot on Telegram
2. Send `/start` to verify authorization
3. Send any supported gallery URL
4. Receive high-quality images as documents

## Commands

- `/start` - Check authorization and get your user ID

## Finding Your User ID

1. Send `/start` to the bot
2. The bot will reply with your User ID
3. Add this ID to `ALLOWED_USER_IDS` environment variable

## Technical Details

### Architecture

- **Runtime:** Cloudflare Workers
- **Language:** JavaScript (ES modules)
- **API:** Telegram Bot API

### Image Extraction Strategies

The bot uses multiple strategies with automatic fallback:

1. **CDN Pattern** - Matches URLs from CDN servers
2. **Schema.org Pattern** - Extracts images marked with `itemprop="contentUrl"`

### Smart Filtering

Automatically removes:
- Thumbnails (e.g., `_w400.jpg`, `_w600.jpg`)
- Low-resolution previews
- Ad images
- Duplicate images

## Development

### Local Testing

```bash
# Start local development server
npm run dev
```

### Project Structure

```
.
├── src/
│   └── index.js          # Main bot logic
├── wrangler.toml         # Cloudflare Workers config
├── package.json          # Dependencies
└── README.md             # This file
```

## Security

- ✅ User authorization via `ALLOWED_USER_IDS`
- ✅ Environment variables stored as Cloudflare secrets
- ✅ No data persistence or logging of user activity
- ✅ Private bot - unauthorized users are rejected

## License

MIT License - feel free to use and modify.

## Author

[@ali934h](https://github.com/ali934h)