const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Get credentials from environment
const YT_COOKIES = process.env.YT_COOKIES || '';
const YT_ID_TOKEN = process.env.YT_ID_TOKEN || '';

// Build cookie/header arguments for yt-dlp
function buildYtDlpArgs() {
    let args = '';
    if (YT_COOKIES) {
        // Escape the cookie string for shell
        const escapedCookies = YT_COOKIES.replace(/"/g, '\\"');
        args += ` --cookies-from-browser "" --add-header "Cookie:${escapedCookies}"`;
    }
    if (YT_ID_TOKEN) {
        args += ` --add-header "x-youtube-identity-token:${YT_ID_TOKEN}"`;
    }
    return args;
}

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        console.log('Fetching info for:', url);
        
        // Build command with headers for age-restricted videos
        const headers = buildYtDlpArgs();
        const command = `yt-dlp ${headers} --dump-json --no-warnings "${url}"`;
        
        console.log('Running command...');
        const { stdout, stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
        
        if (stderr) {
            console.log('yt-dlp stderr:', stderr);
        }
        
        const info = JSON.parse(stdout);
        
        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            author: info.uploader,
            videoId: info.id,
            available: true
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Command that failed:', error.cmd);
        
        // Check for specific errors
        if (error.message.includes('not found')) {
            res.status(500).json({ error: 'yt-dlp not installed. Please redeploy with Dockerfile.' });
        } else if (error.message.includes('410')) {
            res.status(410).json({ error: 'Video may be age-restricted or region-blocked. Try a different video.' });
        } else {
            res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
        }
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Format selector mapping
    let format;
    switch (quality) {
        case '720':
            format = 'bestvideo[height<=720]+bestaudio/best';
            break;
        case '360':
            format = 'bestvideo[height<=360]+bestaudio/best';
            break;
        case 'mp3':
            format = 'bestaudio/best';
            break;
        default:
            format = 'bestvideo[height<=720]+bestaudio/best';
    }
    
    const tempFile = path.join('/tmp', `video_${Date.now()}.mp4`);
    const headers = buildYtDlpArgs();
    
    try {
        console.log('Downloading with format:', format);
        
        const command = `yt-dlp ${headers} -f "${format}" --no-warnings -o "${tempFile}" "${url}"`;
        await execPromise(command, { timeout: 300000 }); // 5 minute timeout
        
        // Check if file was created
        if (!fs.existsSync(tempFile)) {
            throw new Error('Download completed but file not found');
        }
        
        const stat = fs.statSync(tempFile);
        const contentType = quality === 'mp3' ? 'audio/mpeg' : 'video/mp4';
        const extension = quality === 'mp3' ? 'mp3' : 'mp4';
        
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="youtube_video.${extension}"`
        });
        
        const readStream = fs.createReadStream(tempFile);
        readStream.pipe(res);
        
        readStream.on('end', () => {
            fs.unlinkSync(tempFile);
        });
        
        readStream.on('error', (err) => {
            console.error('Stream error:', err);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        });
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', ytdlp: 'configured' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`yt-dlp should be available at: ${process.env.PATH || '/usr/local/bin'}`);
});
