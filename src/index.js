/**
 * Telegram Bot - Picture Downloader
 * Step 4: Extract from <a href> not <img srcset>
 */

// Track processing URLs to prevent duplicate processing
const processingUrls = new Set();

export default {
	async fetch(request, env, ctx) {
		// Only accept POST requests
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const update = await request.json();
			
			// Handle incoming message (not edited message)
			if (update.message && !update.edited_message) {
				// Use ctx.waitUntil for background processing
				ctx.waitUntil(handleMessage(update.message, env));
			}
			
			return new Response('OK', { status: 200 });
		} catch (error) {
			console.error('Error processing request:', error);
			return new Response('OK', { status: 200 }); // Always return 200 to Telegram
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
	const messageId = message.message_id;

	// Create unique key for this message
	const messageKey = `${chatId}_${messageId}_${text}`;

	// Prevent duplicate processing
	if (processingUrls.has(messageKey)) {
		return;
	}

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
		// Mark as processing
		processingUrls.add(messageKey);
		
		try {
			await processUrl(chatId, text, env);
		} finally {
			// Remove from processing set after completion
			setTimeout(() => processingUrls.delete(messageKey), 60000); // Clean up after 1 minute
		}
	} else if (text && text.length > 0) {
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
		const imageUrls = extractHighQualityImages(html, url);

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
 * Extract from <a href> tags with class="fancy" or data-fancybox="gallery"
 */
function extractHighQualityImages(html, baseUrl) {
	const imageUrls = new Set();
	
	// Extract <a> tags with class="fancy" or data-fancybox="gallery-XX"
	// These <a href> point to the original full-size images
	
	// Pattern 1: <a class="fancy" ... href="https://cdn.elitebabes.com/.../image.jpg">
	const regex1 = /<a[^>]*class="fancy"[^>]*href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"[^>]*>/gi;
	let match;
	while ((match = regex1.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}
	
	// Pattern 2: <a href="https://cdn..." ... class="fancy">
	const regex2 = /<a[^>]*href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"[^>]*class="fancy"[^>]*>/gi;
	while ((match = regex2.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}
	
	// Pattern 3: <a data-fancybox="gallery-01" ... href="https://cdn...">
	const regex3 = /<a[^>]*data-fancybox="gallery-[^"]*"[^>]*href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"[^>]*>/gi;
	while ((match = regex3.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}
	
	// Pattern 4: <a href="https://cdn..." ... data-fancybox="gallery-01">
	const regex4 = /<a[^>]*href="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"[^>]*data-fancybox="gallery-[^"]*"[^>]*>/gi;
	while ((match = regex4.exec(html)) !== null) {
		imageUrls.add(match[1]);
	}

	// Convert to array and filter
	const filtered = filterHighQualityImages(Array.from(imageUrls));
	
	return filtered;
}

/**
 * Filter out unwanted images
 */
function filterHighQualityImages(urls) {
	const filtered = [];
	const seen = new Set();
	
	for (const url of urls) {
		// Remove query parameters for deduplication
		const cleanUrl = url.split('?')[0];
		if (seen.has(cleanUrl)) continue;
		
		// Skip masonry thumbnails (preview images)
		if (url.includes('masonry')) {
			continue;
		}
		
		// Skip images with size suffix like _w200, _w400, _w600, _w800
		// But allow images without size suffix (original images)
		if (url.match(/_w\d+\.(jpg|jpeg|png|webp|gif)$/i)) {
			continue;
		}
		
		// Skip common thumbnail patterns
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
			url.includes('_small')
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

		// Add to filtered list
		filtered.push(url);
		seen.add(cleanUrl);
	}

	return filtered;
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
