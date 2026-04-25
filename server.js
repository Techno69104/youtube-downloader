const express = require('express');
const ytdl = require('ytdl-core');
const { ytdlp } = require('yt-dlp-exec');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Your cookies from environment (keep these)
const COOKIE_STRING = process.env.YT_COOKIES || '';

// Helper to fix YouTube URLs
function cleanYouTubeUrl(url) {
    // Remove unnecessary parameters
    return url.split('&')[0];
}

// Method 1: Try yt-dlp first (most reliable)
async function getInfoWithYtDlp(url) {
    try {
        const result = await ytdlp(url, {
            dumpJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            preferFreeFormats: true
        });
        
        return {
            title: result.title,
            thumbnail: result.thumbnail,
            duration: result.duration,
            author: result.uploader,
            videoId: result.id,
            success: true,
            method: 'yt-dlp'
        };
    } catch (error) {
        console.log('yt-dlp failed:', error.message);
        return null;
    }
}

// Method 2: Try ytdl-core with cookies
async function getInfoWithYtdlCore(url, cookies) {
    try {
        const requestOptions = {};
        if (cookies) {
            requestOptions.headers = {
                Cookie: cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };
        }
        
        const info = await ytdl.getInfo(url, { requestOptions });
        
        return {
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            duration: info.videoDetails.lengthSeconds,
            author: info.videoDetails.author.name,
            videoId: info.videoDetails.videoId,
            success: true,
            method: 'ytdl-core'
        };
    } catch (error) {
        console.log('ytdl-core failed:', error.message);
        return null;
    }
}

// Get video information - tries multiple methods
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Extract video ID for fallback thumbnail
    let videoId = '';
    const idMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (idMatch) videoId = idMatch[1];
    
    try {
        console.log('Fetching info for:', url);
        
        // Try yt-dlp first
        let videoInfo = await getInfoWithYtDlp(url);
        
        // If yt-dlp fails, try ytdl-core
        if (!videoInfo) {
            videoInfo = await getInfoWithYtdlCore(url, COOKIE_STRING);
        }
        
        // If both fail, return basic info with thumbnail only
        if (!videoInfo) {
            return res.json({
                title: 'YouTube Video',
                thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                duration: 0,
                author: 'Unknown',
                videoId: videoId,
                available: true,
                basicMode: true,
                message: 'Video info limited to thumbnail only. Download may still work.'
            });
        }
        
        res.json({
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration,
            author: videoInfo.author,
            videoId: videoInfo.videoId,
            available: true
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        // Return basic info anyway so UI doesn't break
        res.json({
            title: 'YouTube Video',
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: 0,
            author: 'YouTube',
            videoId: videoId,
            basicMode: true,
            available: true
        });
    }
});

// Download endpoint with multiple methods
app.get('/api/download', async (req, res) => {
    const { url, itag } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        let videoUrl = url;
        let contentType = 'video/mp4';
        let filename = 'youtube_video.mp4';
        
        // Try yt-dlp first for download
        try {
            const info = await ytdlp(url, { dumpJson: true });
            const safeTitle = (info.title || 'video').replace(/[^\w\s]/gi, '');
            
            // Map itag to format for yt-dlp
            let format = 'bestvideo[height<=720]+bestaudio/best';
            if (itag === '22') format = 'bestvideo[height<=720]+bestaudio/best';
            if (itag === '18') format = 'bestvideo[height<=360]+bestaudio/best';
            if (itag === '140') format = 'bestaudio';
            
            filename = `${safeTitle}.mp4`;
            if (itag === '140') {
                contentType = 'audio/mpeg';
                filename = `${safeTitle}.mp3`;
            }
            
            res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.header('Content-Type', contentType);
            
            const stream = await ytdlp(url, {
                format: format,
                output: '-',
                noWarnings: true
            });
            
            stream.pipe(res);
            return;
            
        } catch (ytdlpError) {
            console.log('yt-dlp download failed, trying ytdl-core');
            
            // Fallback to ytdl-core
            const requestOptions = {};
            if (COOKIE_STRING) {
                requestOptions.headers = { Cookie: COOKIE_STRING };
            }
            
            const info = await ytdl.getInfo(url, { requestOptions });
            const format = info.formats.find(f => f.itag == itag);
            
            if (!format) {
                throw new Error('Format not available');
            }
            
            const safeTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
            filename = `${safeTitle}.${format.hasVideo ? 'mp4' : 'mp3'}`;
            
            res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.header('Content-Type', format.hasVideo ? 'video/mp4' : 'audio/mpeg');
            
            const stream = ytdl(url, { quality: itag, requestOptions });
            stream.pipe(res);
        }
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Cookie status: ${COOKIE_STRING ? '✅ Configured' : '❌ Not configured'}`);
});
