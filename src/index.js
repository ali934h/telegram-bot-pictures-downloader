/**
 * Telegram Bot - Picture Downloader
 * Step 2: Add web scraping and image extraction
 */

export default {
	async fetch(request, env, ctx) {
		// Only accept POST requests
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const update = await request.json();
			
			// Handle incoming message
			if (update.message) {
				await handleMessage(update.message, env);
			}
			
			return new Response('OK', { status: 200 });
		} catch (error) {
			console.error('Error processing request:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

/**
 * Handle incoming Telegram message
 */
async function handleMessage(message, env) {
	const chatId = message.chat.id;
	const userId = message.from.id;
	const text = message.text || '';

	// Check if user is authorized
	if (!isAuthorized(userId, env)) {
		await sendMessage(
			chatId,
			`❌ Access Denied\n\nYour User ID: ${userId}\n\nThis bot is private. Contact the owner to get access.`,
			env.TELEGRAM_BOT_TOKEN
		);
		return;
	}

	// Handle commands
	if (text === '/start') {
		await sendMessage(
			chatId,
			`✅ Welcome! You are authorized.\n\nSend me a URL to download high-quality images from that page.\n\nYour User ID: ${userId}`,
			env.TELEGRAM_BOT_TOKEN
		);
		return;
	}

	// Check if message contains a URL
	if (text.startsWith('http://') || text.startsWith('https://')) {
		await processUrl(chatId, text, env);
	} else {
		await sendMessage(
			chatId,
			'❌ Please send a valid URL starting with http:// or https://',
			env.TELEGRAM_BOT_TOKEN
		);
	}
}

/**
 * Process URL and extract high-quality images
 */
async function processUrl(chatId, url, env) {
	try {
		// Send processing message
		await sendMessage(
			chatId,
			'🔄 Fetching page and extracting images...',
			env.TELEGRAM_BOT_TOKEN
		);

		// Fetch the webpage
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch page: ${response.status}`);
		}

		const html = await response.text();
		
		// Extract image URLs
		const imageUrls = await extractHighQualityImages(html, url);

		if (imageUrls.length === 0) {
			await sendMessage(
				chatId,
				'❌ No high-quality images found on this page.',
				env.TELEGRAM_BOT_TOKEN
			);
			return;
		}

		// Send summary
		await sendMessage(
			chatId,
			`✅ Found ${imageUrls.length} high-quality image(s).\n\n🔄 Starting download and delivery...`,
			env.TELEGRAM_BOT_TOKEN
		);

		// Download and send images
		await downloadAndSendImages(chatId, imageUrls, env);

		await sendMessage(
			chatId,
			'✅ All images have been delivered!',
			env.TELEGRAM_BOT_TOKEN
		);

	} catch (error) {
		console.error('Error processing URL:', error);
		await sendMessage(
			chatId,
			`❌ Error processing URL: ${error.message}`,
			env.TELEGRAM_BOT_TOKEN
		);
	}
}

/**
 * Extract high-quality image URLs from HTML
 */
async function extractHighQualityImages(html, baseUrl) {
	const imageUrls = new Set();
	
	// Pattern 1: Find img tags with src
	const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
	let match;
	while ((match = imgRegex.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}

	// Pattern 2: Find img tags with data-src (lazy loading)
	const dataSrcRegex = /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi;
	while ((match = dataSrcRegex.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}

	// Pattern 3: Find links to image files
	const linkRegex = /<a[^>]+href=["']([^"']+\.(jpg|jpeg|png|webp|gif))["'][^>]*>/gi;
	while ((match = linkRegex.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}

	// Pattern 4: Find direct image URLs in text
	const directUrlRegex = /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif)/gi;
	while ((match = directUrlRegex.exec(html)) !== null) {
		imageUrls.add(match[0]);
	}

	// Convert relative URLs to absolute
	const absoluteUrls = Array.from(imageUrls).map(url => {
		if (url.startsWith('//')) {
			return 'https:' + url;
		} else if (url.startsWith('/')) {
			const base = new URL(baseUrl);
			return base.origin + url;
		} else if (!url.startsWith('http')) {
			return new URL(url, baseUrl).href;
		}
		return url;
	});

	// Filter high-quality images
	const filtered = await filterHighQualityImages(absoluteUrls);
	
	return filtered;
}

/**
 * Filter out thumbnails, logos, and ads - keep only high-quality images
 */
async function filterHighQualityImages(urls) {
	const filtered = [];
	
	for (const url of urls) {
		// Skip common thumbnail/icon patterns
		if (
			url.includes('thumb') ||
			url.includes('thumbnail') ||
			url.includes('logo') ||
			url.includes('icon') ||
			url.includes('avatar') ||
			url.includes('badge') ||
			url.includes('banner') ||
			url.includes('-150x') ||
			url.includes('-300x') ||
			url.includes('_small') ||
			url.includes('_thumb') ||
			url.match(/\d+x\d+/) && !url.match(/\d{3,}x\d{3,}/) // Skip small dimensions like 50x50
		) {
			continue;
		}

		// Skip ad domains
		if (
			url.includes('doubleclick.net') ||
			url.includes('googlesyndication') ||
			url.includes('googleadservices') ||
			url.includes('adserver') ||
			url.includes('advertising')
		) {
			continue;
		}

		// Check if image is large enough
		try {
			const isLarge = await isLargeImage(url);
			if (isLarge) {
				filtered.push(url);
			}
		} catch (error) {
			// If we can't check size, include it anyway
			filtered.push(url);
		}
	}

	return filtered;
}

/**
 * Check if image is large enough (high quality)
 */
async function isLargeImage(url) {
	try {
		const response = await fetch(url, { method: 'HEAD' });
		if (!response.ok) return false;
		
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const sizeInKB = parseInt(contentLength) / 1024;
			// Images larger than 100KB are likely high quality
			return sizeInKB > 100;
		}
		
		return true; // If no content-length, assume it's good
	} catch (error) {
		return true; // If check fails, include the image
	}
}

/**
 * Download images and send them to Telegram
 */
async function downloadAndSendImages(chatId, imageUrls, env) {
	for (let i = 0; i < imageUrls.length; i++) {
		try {
			const imageUrl = imageUrls[i];
			
			// Download image
			const response = await fetch(imageUrl);
			if (!response.ok) {
				console.error(`Failed to download image ${i + 1}: ${response.status}`);
				continue;
			}

			const imageBlob = await response.blob();
			const arrayBuffer = await imageBlob.arrayBuffer();

			// Get filename from URL or generate one
			const filename = getFilenameFromUrl(imageUrl) || `image_${i + 1}.jpg`;

			// Send to Telegram
			await sendDocument(chatId, arrayBuffer, filename, env.TELEGRAM_BOT_TOKEN);
			
			// Small delay to avoid rate limiting
			await sleep(500);
			
		} catch (error) {
			console.error(`Error sending image ${i + 1}:`, error);
		}
	}
}

/**
 * Send document/file to Telegram
 */
async function sendDocument(chatId, fileBuffer, filename, botToken) {
	const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
	
	// Create form data
	const formData = new FormData();
	formData.append('chat_id', chatId.toString());
	formData.append('document', new Blob([fileBuffer]), filename);

	const response = await fetch(url, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('Failed to send document:', error);
		throw new Error('Failed to send document');
	}

	return response.json();
}

/**
 * Extract filename from URL
 */
function getFilenameFromUrl(url) {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const filename = pathname.split('/').pop();
		return filename || null;
	} catch (error) {
		return null;
	}
}

/**
 * Sleep helper
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if user is authorized
 */
function isAuthorized(userId, env) {
	const allowedUsers = env.ALLOWED_USER_IDS || '';
	const allowedUsersList = allowedUsers.split(',').map(id => id.trim());
	return allowedUsersList.includes(userId.toString());
}

/**
 * Send message to Telegram
 */
async function sendMessage(chatId, text, botToken) {
	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			chat_id: chatId,
			text: text,
			parse_mode: 'HTML'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		console.error('Failed to send message:', error);
		throw new Error('Failed to send message');
	}

	return response.json();
}
