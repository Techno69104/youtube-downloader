import os
import json
import subprocess
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import tempfile
import re

app = Flask(__name__)
CORS(app)

def extract_video_id(url):
    """Extract YouTube video ID from URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)',
        r'(?:youtu\.be\/)([a-zA-Z0-9_-]+)',
        r'(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]+)'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information using yt-dlp"""
    data = request.get_json()
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400
    
    try:
        # Get video info using yt-dlp
        cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-download',
            '--no-warnings',
            url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            return jsonify({'error': 'Failed to fetch video info'}), 500
        
        info = json.loads(result.stdout)
        
        return jsonify({
            'title': info.get('title', 'YouTube Video'),
            'thumbnail': info.get('thumbnail', f'https://img.youtube.com/vi/{video_id}/maxresdefault.jpg'),
            'duration': info.get('duration', 0),
            'author': info.get('uploader', 'YouTube'),
            'videoId': video_id
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Request timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download_video():
    """Download video using yt-dlp"""
    url = request.args.get('url')
    quality = request.args.get('quality', '720')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
        temp_path = temp_file.name
        temp_file.close()
        
        # Select format based on quality
        if quality == 'mp3':
            format_str = 'bestaudio/best'
            ext = 'mp3'
        else:
            format_str = f'bestvideo[height<={quality}]+bestaudio/best'
            ext = 'mp4'
        
        # Download using yt-dlp
        cmd = [
            'yt-dlp',
            '-f', format_str,
            '-o', temp_path,
            '--no-warnings',
            url
        ]
        
        subprocess.run(cmd, capture_output=True, timeout=120)
        
        # Send file
        return send_file(
            temp_path,
            as_attachment=True,
            download_name=f'youtube_video.{ext}',
            mimetype='video/mp4' if ext == 'mp4' else 'audio/mpeg'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/', methods=['GET'])
def serve_frontend():
    """Serve the HTML interface"""
    return app.send_static_file('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
