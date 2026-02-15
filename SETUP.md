# Setup Guide - Telegram Bot Picture Downloader

## Step 1: Configure Environment Variables

You need to set two secret environment variables in Cloudflare Workers:

### 1. Set Telegram Bot Token

Run this command in your terminal:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
```

When prompted, paste your bot token from BotFather.

### 2. Set Allowed User IDs

Run this command:

```bash
wrangler secret put ALLOWED_USER_IDS
```

When prompted, enter your Telegram User ID(s). For multiple users, separate with commas:
- Single user: `123456789`
- Multiple users: `123456789,987654321`

To find your User ID, message [@userinfobot](https://t.me/userinfobot) on Telegram.

## Step 2: Deploy the Worker

```bash
npm run deploy
```

After deployment, you'll get a URL like: `https://telegram-bot-pictures-downloader.your-subdomain.workers.dev`

## Step 3: Set Telegram Webhook

Replace `YOUR_BOT_TOKEN` and `YOUR_WORKER_URL` in this URL and open it in your browser:

```
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=YOUR_WORKER_URL
```

You should see: `{"ok":true,"result":true,"description":"Webhook was set"}`

## Step 4: Test the Bot

Open your bot in Telegram and send `/start`. You should receive a welcome message.

## Current Status

✅ Step 1 Complete: Basic bot with authentication
- Bot receives messages
- Only authorized users can interact
- URL detection implemented

✅ Step 2 Complete: Web scraping and image delivery
- Extracts images from any webpage
- Filters out thumbnails, logos, and ads
- Only sends high-quality images (>100KB)
- Delivers images as files to Telegram

## How to Use

1. Send `/start` to verify authorization
2. Send any URL containing images
3. Bot will extract, filter, and send high-quality images
4. Images are delivered as files (not compressed)

## Features

- **Smart Filtering**: Automatically removes thumbnails, logos, icons, and ads
- **High Quality Only**: Only downloads images larger than 100KB
- **Multiple Patterns**: Detects images in `<img>` tags, lazy-loaded images, direct links, and more
- **Private Access**: Only authorized User IDs can use the bot
- **File Delivery**: Images sent as documents to preserve quality
