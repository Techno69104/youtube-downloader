const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get cookies from environment variable
const YT_COOKIES = process.env.YT_COOKIES || '';

// Helper to extract video ID
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]+)/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Validate YouTube URL
    if (!ytdl.validateURL(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    try {
        console.log('Fetching info for:', url);
        
        // Request options with cookies for age-restricted videos
        const requestOptions = {};
        if (YT_COOKIES) {
            requestOptions.headers = {
                Cookie: YT_COOKIES,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        const videoDetails = info.videoDetails;
        
        // Get best thumbnail
        const thumbnail = videoDetails.thumbnails && videoDetails.thumbnails.length > 0 
            ? videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url 
            : `https://img.youtube.com/vi/${videoDetails.videoId}/maxresdefault.jpg`;
        
        res.json({
            title: videoDetails.title,
            thumbnail: thumbnail,
            duration: videoDetails.lengthSeconds,
            author: videoDetails.author.name,
            videoId: videoDetails.videoId,
            available: true,
            isAgeRestricted: videoDetails.age_restricted || false
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        
        // Handle 410 error (age-restricted or unavailable)
        if (error.message.includes('410')) {
            res.status(410).json({ 
                error: 'This video may be age-restricted or unavailable. Try a different video.',
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
        // Request options with cookies
        const requestOptions = {};
        if (YT_COOKIES) {
            requestOptions.headers = {
                Cookie: YT_COOKIES,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        
        // Find the requested format
        const format = info.formats.find(f => f.itag == itag);
        
        if (!format) {
            return res.status(400).json({ error: 'Format not available' });
        }
        
        // Create safe filename
        const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        const extension = format.hasVideo ? 'mp4' : 'mp3';
        const filename = `${safeTitle}.${extension}`;
        
        res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
        
        // Stream the video with cookies
        const stream = ytdl(url, { 
            quality: itag, 
            requestOptions 
        });
        
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
    console.log(`Cookies configured: ${YT_COOKIES ? '✅ Yes' : '❌ No'}`);
});
