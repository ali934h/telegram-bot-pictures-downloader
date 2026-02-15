/**
 * Telegram Bot - Picture Downloader
 * Step 6: Added detailed logging to debug extraction
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
		console.log('HTML length:', html.length);
		
		// Extract image URLs
		const imageUrls = extractHighQualityImages(html, url, chatId, env);

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
 * Extract high-quality image URLs from HTML with detailed logging
 */
function extractHighQualityImages(html, baseUrl, chatId, env) {
	const imageUrls = new Set();
	
	console.log('=== EXTRACTION DEBUG ===');
	
	// Test different patterns
	const patterns = [
		// Pattern 1: Normal HTML with quotes
		{
			name: 'Normal with quotes',
			regex: /<a[^>]*href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*class=["']fancy["'][^>]*>/gi
		},
		// Pattern 2: Compressed HTML without quotes
		{
			name: 'Compressed classfancy',
			regex: /<a[^>]*href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*classfancy[^>]*>/gi
		},
		// Pattern 3: With data-fancybox
		{
			name: 'With data-fancybox',
			regex: /<a[^>]*href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*data-fancybox=["']gallery[^>]*>/gi
		},
		// Pattern 4: Compressed data-fancybox
		{
			name: 'Compressed data-fancybox',
			regex: /<a[^>]*href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*data-fancyboxgallery[^>]*>/gi
		},
		// Pattern 5: Any <a> with image extension
		{
			name: 'Any <a> with image',
			regex: /<a[^>]*href=["'](https?:\/\/cdn[^"']+\.(?:jpg|jpeg|png|webp|gif))["'][^>]*>/gi
		}
	];
	
	for (const pattern of patterns) {
		const matches = [];
		let match;
		while ((match = pattern.regex.exec(html)) !== null) {
			matches.push(match[1]);
			imageUrls.add(match[1]);
		}
		console.log(`Pattern "${pattern.name}": ${matches.length} matches`);
		if (matches.length > 0) {
			console.log('Sample:', matches[0]);
		}
	}
	
	console.log('Total unique URLs found:', imageUrls.size);
	
	// Log first few URLs
	const urlArray = Array.from(imageUrls);
	if (urlArray.length > 0) {
		console.log('First 3 URLs:');
		urlArray.slice(0, 3).forEach((url, i) => {
			console.log(`  ${i + 1}. ${url}`);
		});
	}
	
	// Convert to array and filter
	const filtered = filterHighQualityImages(urlArray);
	console.log('After filtering:', filtered.length);
	
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
		if (seen.has(cleanUrl)) {
			console.log('Skipped (duplicate):', url);
			continue;
		}
		
		// Skip masonry thumbnails (preview images)
		if (url.includes('masonry')) {
			console.log('Skipped (masonry):', url);
			continue;
		}
		
		// Skip images with size suffix like _w200, _w400, _w600, _w800
		if (url.match(/_w\d+\.(jpg|jpeg|png|webp|gif)$/i)) {
			console.log('Skipped (_wXXX):', url);
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
			console.log('Skipped (thumbnail pattern):', url);
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
			console.log('Skipped (ad domain):', url);
			continue;
		}

		// Add to filtered list
		console.log('Added:', url);
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
