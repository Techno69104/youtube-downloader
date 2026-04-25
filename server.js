const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Helper to run commands
function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

// Get video information
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    try {
        console.log('Fetching info for:', url);
        
        // Get video info as JSON
        const command = `yt-dlp --dump-json --no-warnings "${url}"`;
        const output = await runCommand(command);
        const info = JSON.parse(output);
        
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
        res.status(500).json({ error: 'Failed to fetch video: ' + error.message });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }
    
    // Map quality to yt-dlp format selector
    let format = 'bestvideo[height<=720]+bestaudio/best';
    if (quality === 'mp3') {
        format = 'bestaudio/best';
    }
    
    const tempFile = path.join('/tmp', `video_${Date.now()}.mp4`);
    
    try {
        console.log('Downloading with format:', format);
        
        // Download video
        const command = `yt-dlp -f "${format}" --no-warnings -o "${tempFile}" "${url}"`;
        await runCommand(command);
        
        // Stream file to response
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
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed: ' + error.message });
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
