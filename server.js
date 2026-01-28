require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Replicate API Token (set via environment variable)
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Check token endpoint (for debugging)
app.get('/api/check', (req, res) => {
  res.json({ 
    hasToken: !!REPLICATE_API_TOKEN,
    tokenLength: REPLICATE_API_TOKEN.length
  });
});

// API endpoint to generate images
app.post('/api/generate', async (req, res) => {
  try {
    // Check if token is set
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    const { prompt, resolution, aspect_ratio, output_format, safety_filter_level, image_input } = req.body;

    // Process image inputs - Replicate accepts data URIs (base64)
    let processedImages = [];
    if (image_input && Array.isArray(image_input)) {
      processedImages = image_input.filter(img => img && img.length > 0);
    }

    console.log('Generating image with prompt:', prompt);
    console.log('Image inputs count:', processedImages.length);

    const requestBody = {
      input: {
        prompt: prompt || 'A beautiful landscape',
        resolution: resolution || '2K',
        aspect_ratio: aspect_ratio || '4:3',
        output_format: output_format || 'jpg',
        safety_filter_level: safety_filter_level || 'block_only_high'
      }
    };

    // Only add image_input if there are images
    if (processedImages.length > 0) {
      requestBody.input.image_input = processedImages;
    }

    const response = await fetch('https://api.replicate.com/v1/models/google/nano-banana-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    
    console.log('API Response status:', response.status);
    console.log('API Response:', JSON.stringify(data).substring(0, 500));

    if (!response.ok) {
      // Handle different error formats
      const errorMsg = data.detail || data.error || data.message || JSON.stringify(data);
      throw new Error(`API Error (${response.status}): ${errorMsg}`);
    }

    // Check if prediction failed
    if (data.status === 'failed' || data.status === 'canceled') {
      const errorMsg = data.error || data.detail || 'Prediction failed';
      console.log('Prediction failed:', JSON.stringify(data, null, 2));
      throw new Error(`Generation failed: ${errorMsg}`);
    }

    // Check if prediction is still processing
    if (data.status && (data.status === 'starting' || data.status === 'processing')) {
      // If using Prefer: wait, this shouldn't happen, but handle it anyway
      const predictionId = data.id;
      console.log('Prediction still processing, polling for result...');
      
      // Poll for result
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max
      
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
        
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
        
        const pollData = await pollResponse.json();
        
        if (pollData.status === 'succeeded' && pollData.output) {
          return res.json(pollData);
        } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
          throw new Error(pollData.error || 'Prediction failed');
        }
        
        attempts++;
      }
      
      throw new Error('Prediction timed out');
    }

    // Check if output exists and status is succeeded
    if (data.status !== 'succeeded') {
      console.log('Unexpected status:', data.status);
      console.log('Full response:', JSON.stringify(data, null, 2));
      throw new Error(`Unexpected status: ${data.status}. ${data.error || ''}`);
    }

    if (!data.output) {
      console.log('No output in response:', JSON.stringify(data, null, 2));
      throw new Error('No output in API response. The generation may have failed.');
    }

    res.json(data);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy image URLs (avoid CORS + allow browser-side caching)
// Security: only allow https://*.replicate.delivery/*
app.get('/api/image', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url' });
    }

    let u;
    try {
      u = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid url' });
    }

    if (u.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only https URLs are allowed' });
    }

    const host = u.hostname.toLowerCase();
    const isReplicateDelivery = host === 'replicate.delivery' || host.endsWith('.replicate.delivery');
    if (!isReplicateDelivery) {
      return res.status(400).json({ error: 'Host not allowed' });
    }

    const response = await fetch(u.toString(), {
      // Keep it simple; the upstream is a static asset
      headers: {
        'User-Agent': 'nano-banana-playground'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Upstream error: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Cache in browser/CDN. The URLs are unique; caching helps "download failed" and reopens.
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=604800');

    const arrayBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Error proxying image:', err);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎨 Nano Banana Playground running at http://localhost:${PORT}`);
  console.log(`Token configured: ${!!REPLICATE_API_TOKEN}`);
});
