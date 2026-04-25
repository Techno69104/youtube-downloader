const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Build cookie string from environment variables
function buildCookieString() {
    const cookies = [];
    
    // Method 1: Individual cookie variables
    if (process.env.LOGIN_INFO) cookies.push(`LOGIN_INFO=${process.env.LOGIN_INFO}`);
    if (process.env.SID) cookies.push(`SID=${process.env.SID}`);
    if (process.env.HSID) cookies.push(`HSID=${process.env.HSID}`);
    if (process.env.SSID) cookies.push(`SSID=${process.env.SSID}`);
    if (process.env.APISID) cookies.push(`APISID=${process.env.APISID}`);
    if (process.env.SAPISID) cookies.push(`SAPISID=${process.env.SAPISID}`);
    
    // Method 2: Single YT_COOKIES variable
    if (process.env.YT_COOKIES) {
        return process.env.YT_COOKIES;
    }
    
    // Method 3: Full JSON export
    if (process.env.YT_COOKIES_JSON) {
        try {
            const cookieArray = JSON.parse(process.env.YT_COOKIES_JSON);
            return cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
        } catch (e) {
            console.error('Failed to parse YT_COOKIES_JSON');
        }
    }
    
    return cookies.join('; ');
}

const COOKIE_STRING = buildCookieString();
console.log('Cookies configured:', COOKIE_STRING ? '✅ Yes' : '❌ No');

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        console.log('Fetching info for:', url);
        
        const requestOptions = {};
        
        if (COOKIE_STRING) {
            requestOptions.headers = {
                Cookie: COOKIE_STRING,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        
        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoId: info.videoDetails.videoId,
            available: true
        });
    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.message.includes('410')) {
            res.status(410).json({ 
                error: 'Video may be age-restricted. Make sure you\'re logged into YouTube and cookies are valid.',
                code: 'AGE_RESTRICTED'
            });
        } else {
            res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
        }
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;
    
    if (!url || !ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    
    try {
        const requestOptions = {};
        
        if (COOKIE_STRING) {
            requestOptions.headers = {
                Cookie: COOKIE_STRING,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        const extension = format.hasVideo ? 'mp4' : 'mp3';
        const filename = `${safeTitle}.${extension}`;
        
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        const stream = ytdl(url, { quality: itag, requestOptions });
        stream.pipe(res);
        
        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed' });
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
