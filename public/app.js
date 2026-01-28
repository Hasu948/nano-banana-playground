// DOM Elements
const promptInput = document.getElementById('prompt');
const resolutionSelect = document.getElementById('resolution');
const aspectRatioSelect = document.getElementById('aspect_ratio');
const outputFormatSelect = document.getElementById('output_format');
const safetyFilterSelect = document.getElementById('safety_filter');
const generateBtn = document.getElementById('generate-btn');
const gridContainer = document.getElementById('grid-container');
const gridEmpty = document.getElementById('grid-empty');
const toastContainer = document.getElementById('toast-container');

// File input elements
const fileUrlInput = document.getElementById('file-url-input');
const fileDropZone = document.getElementById('file-drop-zone');
const fileInput = document.getElementById('file-input');
const imagePreviewContainer = document.getElementById('image-preview-container');

// Modal Elements
const modal = document.getElementById('image-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalImage = document.getElementById('modal-image');
const modalDownload = document.getElementById('modal-download');
const modalCopy = document.getElementById('modal-copy');
const modalClose = document.getElementById('modal-close');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');
const modalPrompt = document.getElementById('modal-prompt');
const modalCreated = document.getElementById('modal-created');
const modalSettings = document.getElementById('modal-settings');
const modalId = document.getElementById('modal-id');
const modalCode = document.getElementById('modal-code');
const modalTweak = document.getElementById('modal-tweak');
const modalDelete = document.getElementById('modal-delete');
const copyCodeBtn = document.getElementById('copy-code-btn');
const codeTabs = document.querySelectorAll('.code-tab');

// State
let currentModalUrl = null;
let currentModalIndex = -1;
let currentCodeTab = 'nodejs';
let gridItems = JSON.parse(localStorage.getItem('gridItems') || '[]');
let uploadedImages = []; // Store base64 images

// -----------------------------
// Persistent image cache (IndexedDB)
// Purpose: keep generated images visible on future visits and prevent download failures.
// -----------------------------
const IMAGE_CACHE_DB = 'nanoBananaCache';
const IMAGE_CACHE_STORE = 'images';

function persistGridItems() {
  localStorage.setItem('gridItems', JSON.stringify(gridItems));
}

function getProxiedImageUrl(url) {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

function openImageCacheDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IMAGE_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMAGE_CACHE_STORE)) {
        db.createObjectStore(IMAGE_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openImageCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_CACHE_STORE, 'readonly');
    const store = tx.objectStore(IMAGE_CACHE_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key, value) {
  const db = await openImageCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
    const store = tx.objectStore(IMAGE_CACHE_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

function makeImageCacheKey(item) {
  return `img_${String(item.id)}`;
}

async function ensureItemCached(item) {
  if (!item?.imageUrl) return null;
  const key = item.cachedKey || makeImageCacheKey(item);

  // If already cached, just persist key.
  try {
    const existing = await idbGet(key);
    if (existing instanceof Blob) {
      if (!item.cachedKey) {
        item.cachedKey = key;
        persistGridItems();
      }
      return key;
    }
  } catch {
    // ignore
  }

  const resp = await fetch(getProxiedImageUrl(item.imageUrl));
  if (!resp.ok) throw new Error('Failed to fetch image for caching');
  const blob = await resp.blob();
  await idbSet(key, blob);
  item.cachedKey = key;
  item.cachedAt = Date.now();
  persistGridItems();
  return key;
}

async function getBestBlobForItem(item) {
  if (item?.cachedKey) {
    try {
      const blob = await idbGet(item.cachedKey);
      if (blob instanceof Blob) return blob;
    } catch {
      // ignore
    }
  }

  if (!item?.imageUrl) return null;
  try {
    const resp = await fetch(getProxiedImageUrl(item.imageUrl));
    if (!resp.ok) return null;
    const blob = await resp.blob();
    // Best effort: persist for future
    try {
      const key = item.cachedKey || makeImageCacheKey(item);
      await idbSet(key, blob);
      item.cachedKey = key;
      item.cachedAt = Date.now();
      persistGridItems();
    } catch {
      // ignore
    }
    return blob;
  } catch {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function showImageFailed(el) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:12px;padding:8px;text-align:center;';
  errorDiv.textContent = 'Image failed to load';
  el.appendChild(errorDiv);
}

function mountItemImage(el, img, item) {
  img.alt = 'Generated image';
  img.loading = 'lazy';

  img.onerror = function () {
    this.style.display = 'none';
    showImageFailed(el);
  };

  // Prefer cached blob (permanent); fall back to proxy URL (more reliable than direct URL).
  if (item.cachedKey) {
    idbGet(item.cachedKey)
      .then((blob) => {
        if (blob instanceof Blob) {
          const objectUrl = URL.createObjectURL(blob);
          img.dataset.objectUrl = objectUrl;
          img.src = objectUrl;
        } else {
          img.src = getProxiedImageUrl(item.imageUrl);
          ensureItemCached(item).catch(() => {});
        }
      })
      .catch(() => {
        img.src = getProxiedImageUrl(item.imageUrl);
        ensureItemCached(item).catch(() => {});
      });
  } else {
    img.src = getProxiedImageUrl(item.imageUrl);
    ensureItemCached(item).catch(() => {});
  }
}

async function clearImageCache() {
  try {
    const db = await openImageCacheDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMAGE_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(IMAGE_CACHE_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    gridItems.forEach((item) => {
      delete item.cachedKey;
      delete item.cachedAt;
    });
    persistGridItems();
    renderGrid();
    showToast('本地图片缓存已清理', 'success');
  } catch (err) {
    showToast('清理失败', 'error');
  }
}

// Initialize
function init() {
  setupEventListeners();
  initGridColumns();
  renderGrid();
}

// Initialize grid columns from localStorage
function initGridColumns() {
  const savedColumns = localStorage.getItem('gridColumns') || '4';
  const gridSlider = document.getElementById('grid-slider');
  const gridValue = document.getElementById('grid-value');
  
  if (gridSlider) {
    gridSlider.value = savedColumns;
    updateGridColumns(parseInt(savedColumns));
  }
  if (gridValue) {
    gridValue.textContent = savedColumns;
  }
}

// Update grid columns
function updateGridColumns(columns) {
  document.documentElement.style.setProperty('--grid-columns', columns);
  localStorage.setItem('gridColumns', columns.toString());
}

// Event Listeners
function setupEventListeners() {
  // Generate button
  generateBtn.addEventListener('click', generateImage);
  
  // Prompt input - generate on Ctrl+Enter or Cmd+Enter
  promptInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      generateImage();
    }
  });
  
  // File URL input
  if (fileUrlInput) {
    fileUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addImageFromUrl(fileUrlInput.value.trim());
        fileUrlInput.value = '';
      }
    });
  }
  
  // File drop zone
  if (fileDropZone) {
    fileDropZone.addEventListener('click', () => fileInput?.click());
    
    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });
    
    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('dragover');
    });
    
    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
  }
  
  // File input
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      fileInput.value = ''; // Reset to allow same file
    });
  }
  
  // Modal events
  modalOverlay.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  modalDownload.addEventListener('click', downloadModalImage);
  modalCopy.addEventListener('click', copyModalUrl);
  modalPrev?.addEventListener('click', showPrevImage);
  modalNext?.addEventListener('click', showNextImage);
  modalTweak?.addEventListener('click', tweakImage);
  modalDelete?.addEventListener('click', deleteFromGrid);
  copyCodeBtn?.addEventListener('click', copyCode);
  
  // Code tabs
  codeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      codeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCodeTab = tab.dataset.tab;
      updateCodeDisplay();
    });
  });
  
  // Appearance menu
  const appearanceBtn = document.getElementById('appearance-btn');
  const appearanceMenu = document.getElementById('appearance-menu');
  const gridSlider = document.getElementById('grid-slider');
  const gridValue = document.getElementById('grid-value');
  
  if (appearanceBtn && appearanceMenu) {
    appearanceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = appearanceMenu.style.display !== 'none';
      appearanceMenu.style.display = isVisible ? 'none' : 'block';
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!appearanceBtn.contains(e.target) && !appearanceMenu.contains(e.target)) {
        appearanceMenu.style.display = 'none';
      }
    });
  }
  
  // Grid slider
  if (gridSlider && gridValue) {
    gridSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      gridValue.textContent = value;
      updateGridColumns(parseInt(value));
    });
  }

  // 清理本地缓存
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      clearImageCache();
      if (appearanceMenu) appearanceMenu.style.display = 'none';
    });
  }
  
  // Keyboard events
  document.addEventListener('keydown', (e) => {
    // Modal navigation
    if (modal.style.display !== 'none') {
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'ArrowLeft') {
        showPrevImage();
      } else if (e.key === 'ArrowRight') {
        showNextImage();
      }
      return;
    }
    
    // Global shortcut: Ctrl+Enter or Cmd+Enter to generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      generateImage();
    }
  });
}

// Handle file selection
function handleFiles(files) {
  if (uploadedImages.length >= 14) {
    showToast('Maximum 14 images allowed', 'error');
    return;
  }
  
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files are allowed', 'error');
      return;
    }
    
    if (uploadedImages.length >= 14) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      uploadedImages.push(base64);
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

// Add image from URL
function addImageFromUrl(url) {
  if (!url) return;
  
  if (uploadedImages.length >= 14) {
    showToast('Maximum 14 images allowed', 'error');
    return;
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    showToast('Invalid URL', 'error');
    return;
  }
  
  uploadedImages.push(url);
  renderImagePreviews();
  showToast('Image added', 'success');
}

// Render image previews
function renderImagePreviews() {
  if (!imagePreviewContainer) return;
  
  if (uploadedImages.length === 0) {
    imagePreviewContainer.style.display = 'none';
    return;
  }
  
  imagePreviewContainer.style.display = 'flex';
  imagePreviewContainer.innerHTML = uploadedImages.map((img, index) => `
    <div class="image-preview" data-index="${index}">
      <img src="${img}" alt="Preview ${index + 1}">
      <button class="remove-image-btn" onclick="removeImage(${index})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('');
}

// Remove uploaded image
function removeImage(index) {
  uploadedImages.splice(index, 1);
  renderImagePreviews();
}

// Make removeImage global
window.removeImage = removeImage;

// Track active tasks
let activeTasks = 0;
let requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT = 1; // 1 并发更快出图，减少排队

// Track generation start times for each loading item
const generationStartTimes = new Map(); // id -> startTime (ms)

// Add request to queue and process
function queueRequest(requestData) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ ...requestData, resolve, reject });
    processQueue();
  });
}

// Process queue with controlled concurrency
async function processQueue() {
  // Don't start new requests if we're at max concurrent or queue is empty
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const request = requestQueue.shift();
    activeRequests++;
    
    // Process request asynchronously
    executeRequest(request)
      .then(result => {
        request.resolve(result);
      })
      .catch(err => {
        request.reject(err);
      })
      .finally(() => {
        activeRequests--;
        // Continue processing queue
        processQueue();
      });
    
    // Small delay between starting requests to avoid rate limiting
    if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Execute single request with retry
async function executeRequest(requestData, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: requestData.prompt,
        resolution: requestData.resolution,
        aspect_ratio: requestData.aspect_ratio,
        output_format: requestData.output_format,
        safety_filter_level: requestData.safety_filter_level,
        image_input: requestData.image_input
      })
    });
    
    const data = await response.json();
    
    // Handle rate limiting
    if (response.status === 429 || (data.error && data.error.includes('429'))) {
      if (retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount + 1) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`Rate limited, retrying in ${waitTime/1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
        return executeRequest(requestData, retryCount + 1);
      }
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate image');
    }
    
    return data;
  } catch (err) {
    // Retry on network errors
    if (retryCount < maxRetries && err.message.includes('fetch')) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000;
      await new Promise(r => setTimeout(r, waitTime));
      return executeRequest(requestData, retryCount + 1);
    }
    throw err;
  }
}

// Generate Image
async function generateImage() {
  const prompt = promptInput.value.trim();
  
  if (!prompt && uploadedImages.length === 0) {
    showToast('Please enter a prompt or upload an image', 'error');
    promptInput.focus();
    return;
  }
  
  // Add loading item to grid
  const loadingId = Date.now() + Math.random();
  const startTime = Date.now();
  generationStartTimes.set(loadingId, startTime);
  const currentPrompt = prompt || 'Image transformation';
  const currentImages = [...uploadedImages]; // Copy current images
  const currentSettings = {
    resolution: resolutionSelect.value,
    aspect_ratio: aspectRatioSelect.value,
    output_format: outputFormatSelect.value,
    safety_filter_level: safetyFilterSelect.value
  };
  
  addLoadingItem(loadingId, currentPrompt);
  
  // Keep uploaded images for next generation (don't clear)
  
  // Track active tasks
  activeTasks++;
  updateButtonState();
  
  try {
    // Use queue system for rate limiting
    const data = await queueRequest({
      prompt: currentPrompt,
      resolution: currentSettings.resolution,
      aspect_ratio: currentSettings.aspect_ratio,
      output_format: currentSettings.output_format,
      safety_filter_level: currentSettings.safety_filter_level,
      image_input: currentImages
    });
    
    // Extract image URL from response
    let imageUrl = null;
    
    if (data.output) {
      if (Array.isArray(data.output)) {
        imageUrl = data.output[0];
      } else if (typeof data.output === 'string') {
        imageUrl = data.output;
      }
    }
    
    if (!imageUrl) {
      throw new Error('No image URL in response');
    }
    
    // Calculate generation time
    const endTime = Date.now();
    const startTime = generationStartTimes.get(loadingId) || endTime;
    const generationTime = Math.round((endTime - startTime) / 1000); // seconds
    generationStartTimes.delete(loadingId);
    
    // Update loading item with actual image
    updateLoadingItem(loadingId, {
      id: loadingId,
      prompt: currentPrompt,
      imageUrl: imageUrl,
      settings: {
        resolution: currentSettings.resolution,
        aspect_ratio: currentSettings.aspect_ratio,
        output_format: currentSettings.output_format
      },
      timestamp: endTime,
      generationTime: generationTime // seconds
    });
    
  } catch (err) {
    console.error('Generation error:', err);
    generationStartTimes.delete(loadingId);
    removeLoadingItem(loadingId);
    showToast(err.message, 'error');
  } finally {
    activeTasks--;
    updateButtonState();
  }
}

// Update button state based on active tasks
function updateButtonState() {
  if (activeTasks > 0) {
    generateBtn.innerHTML = `
      <span class="run-text">Running (${activeTasks})</span>
      <span class="run-shortcut">(ctrl+enter)</span>
    `;
  } else {
    generateBtn.innerHTML = `
      <span class="run-text">Run model</span>
      <span class="run-shortcut">(ctrl+enter)</span>
    `;
  }
  // Button is always enabled to allow multiple tasks
  generateBtn.disabled = false;
}

// Add Loading Item to Grid
function addLoadingItem(id, prompt) {
  gridEmpty.style.display = 'none';
  
  const item = document.createElement('div');
  item.className = 'grid-item';
  item.id = `grid-item-${id}`;
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'grid-item-loading';
  loadingDiv.innerHTML = `
    <div class="spinner"></div>
    <span class="loading-text">Processing...</span>
  `;
  item.appendChild(loadingDiv);
  
  // Insert at the beginning
  gridContainer.insertBefore(item, gridContainer.firstChild);
  
  // Start timer to update elapsed time
  const startTime = generationStartTimes.get(id);
  if (startTime) {
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const textEl = loadingDiv.querySelector('.loading-text');
      if (textEl && item.parentNode) {
        textEl.textContent = `Processing... ${elapsed}秒`;
      } else {
        clearInterval(timerId);
      }
    };
    const timerId = setInterval(updateTimer, 1000);
    updateTimer(); // Initial update
    // Store timer ID so we can clear it later
    item.dataset.timerId = timerId;
  }
}

// Update Loading Item with Image
function updateLoadingItem(id, itemData) {
  const item = document.getElementById(`grid-item-${id}`);
  if (!item) return;
  
  // Clear timer if exists
  if (item.dataset.timerId) {
    clearInterval(parseInt(item.dataset.timerId));
    delete item.dataset.timerId;
  }
  
  // Add to storage
  gridItems.unshift(itemData);
  if (gridItems.length > 50) {
    gridItems = gridItems.slice(0, 50);
  }
  persistGridItems();
  // Cache ASAP so future visits still show images
  ensureItemCached(itemData).catch(() => {});
  
  // Update DOM
  item.innerHTML = '';
  const img = document.createElement('img');
  mountItemImage(item, img, itemData);
  item.appendChild(img);
  const overlay = document.createElement('div');
  overlay.className = 'grid-item-overlay';
  const promptDiv = document.createElement('div');
  promptDiv.className = 'grid-item-prompt';
  const promptText = itemData.prompt || '';
  const timeText = itemData.generationTime ? ` (${itemData.generationTime}秒)` : '';
  promptDiv.textContent = promptText + timeText;
  overlay.appendChild(promptDiv);
  item.appendChild(overlay);
  
  // Add click handler - find the index in gridItems
  const itemIndex = gridItems.findIndex(g => g.id === itemData.id);
  item.addEventListener('click', () => openModal(itemData.imageUrl, itemIndex));
}

// Remove Loading Item
function removeLoadingItem(id) {
  const item = document.getElementById(`grid-item-${id}`);
  if (item) {
    item.remove();
  }
  
  // Show empty state if no items
  if (gridItems.length === 0 && gridContainer.querySelectorAll('.grid-item').length === 0) {
    gridEmpty.style.display = 'flex';
  }
}

// Render Grid from Storage
function renderGrid() {
  // Clear and re-mount empty state element to avoid duplicates
  gridContainer.innerHTML = '';
  gridContainer.appendChild(gridEmpty);

  if (gridItems.length === 0) {
    gridEmpty.style.display = 'flex';
    return;
  }
  
  gridEmpty.style.display = 'none';
  
  gridItems.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'grid-item';
    const img = document.createElement('img');
    mountItemImage(el, img, item);
    el.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'grid-item-overlay';
    const promptDiv = document.createElement('div');
    promptDiv.className = 'grid-item-prompt';
    promptDiv.textContent = item.prompt || '';
    overlay.appendChild(promptDiv);
    el.appendChild(overlay);
    el.addEventListener('click', () => openModal(item.imageUrl, index));
    gridContainer.appendChild(el);
  });
}

// Modal Functions
function openModal(imageUrl, index) {
  currentModalUrl = imageUrl;
  currentModalIndex = index;
  
  const item = gridItems[index];
  if (!item) return;
  
  // Prefer cached blob; fall back to proxy URL
  modalImage.src = '';
  if (item.cachedKey) {
    idbGet(item.cachedKey)
      .then((blob) => {
        if (blob instanceof Blob) {
          const objectUrl = URL.createObjectURL(blob);
          modalImage.dataset.objectUrl = objectUrl;
          modalImage.src = objectUrl;
        } else {
          modalImage.src = getProxiedImageUrl(item.imageUrl);
        }
        ensureItemCached(item).catch(() => {});
      })
      .catch(() => {
        modalImage.src = getProxiedImageUrl(item.imageUrl);
        ensureItemCached(item).catch(() => {});
      });
  } else {
    modalImage.src = getProxiedImageUrl(item.imageUrl);
    ensureItemCached(item).catch(() => {});
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Update info
  if (modalPrompt) modalPrompt.textContent = item.prompt || '-';
  if (modalId) modalId.textContent = String(item.id).substring(0, 12) + '...';
  if (modalCreated) {
    const date = new Date(item.timestamp);
    modalCreated.textContent = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  if (modalSettings && item.settings) {
    const timeText = item.generationTime ? ` • ${item.generationTime}秒` : '';
    modalSettings.textContent = `${item.settings.resolution} • ${item.settings.aspect_ratio} • ${item.settings.output_format}${timeText}`;
  }
  
  // Update code display
  updateCodeDisplay();
  
  // Update nav buttons
  updateNavButtons();
}

function closeModal() {
  modal.style.display = 'none';
  document.body.style.overflow = '';
  // Revoke object URL if used
  if (modalImage?.dataset?.objectUrl) {
    try { URL.revokeObjectURL(modalImage.dataset.objectUrl); } catch {}
    delete modalImage.dataset.objectUrl;
  }
  currentModalUrl = null;
  currentModalIndex = -1;
}

function showPrevImage() {
  if (currentModalIndex > 0) {
    const prevItem = gridItems[currentModalIndex - 1];
    openModal(prevItem.imageUrl, currentModalIndex - 1);
  }
}

function showNextImage() {
  if (currentModalIndex < gridItems.length - 1) {
    const nextItem = gridItems[currentModalIndex + 1];
    openModal(nextItem.imageUrl, currentModalIndex + 1);
  }
}

function updateNavButtons() {
  if (modalPrev) {
    modalPrev.disabled = currentModalIndex <= 0;
    modalPrev.style.opacity = currentModalIndex <= 0 ? '0.5' : '1';
  }
  if (modalNext) {
    modalNext.disabled = currentModalIndex >= gridItems.length - 1;
    modalNext.style.opacity = currentModalIndex >= gridItems.length - 1 ? '0.5' : '1';
  }
}

function updateCodeDisplay() {
  if (!modalCode) return;
  
  const item = gridItems[currentModalIndex];
  if (!item) return;
  
  let code = '';
  
  if (currentCodeTab === 'nodejs') {
    code = `import Replicate from "replicate";
const replicate = new Replicate();

const output = await replicate.run(
  "google/nano-banana-pro",
  {
    input: {
      prompt: "${escapeString(item.prompt)}",
      resolution: "${item.settings?.resolution || '2K'}",
      aspect_ratio: "${item.settings?.aspect_ratio || '16:9'}",
      output_format: "${item.settings?.output_format || 'jpg'}",
      safety_filter_level: "block_only_high"
    }
  }
);
console.log(output);`;
  } else if (currentCodeTab === 'python') {
    code = `import replicate

output = replicate.run(
    "google/nano-banana-pro",
    input={
        "prompt": "${escapeString(item.prompt)}",
        "resolution": "${item.settings?.resolution || '2K'}",
        "aspect_ratio": "${item.settings?.aspect_ratio || '16:9'}",
        "output_format": "${item.settings?.output_format || 'jpg'}",
        "safety_filter_level": "block_only_high"
    }
)
print(output)`;
  } else if (currentCodeTab === 'http') {
    code = `curl -s -X POST \\
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: wait" \\
  -d '{
    "input": {
      "prompt": "${escapeString(item.prompt)}",
      "resolution": "${item.settings?.resolution || '2K'}",
      "aspect_ratio": "${item.settings?.aspect_ratio || '16:9'}",
      "output_format": "${item.settings?.output_format || 'jpg'}",
      "safety_filter_level": "block_only_high"
    }
  }' \\
  https://api.replicate.com/v1/models/google/nano-banana-pro/predictions`;
  }
  
  modalCode.textContent = code;
}

function escapeString(str) {
  return str ? str.replace(/"/g, '\\"').replace(/\n/g, '\\n') : '';
}

function tweakImage() {
  const item = gridItems[currentModalIndex];
  if (!item) return;
  
  // Fill the prompt and settings from this item
  promptInput.value = item.prompt || '';
  if (item.settings) {
    resolutionSelect.value = item.settings.resolution || '2K';
    aspectRatioSelect.value = item.settings.aspect_ratio || '16:9';
    outputFormatSelect.value = item.settings.output_format || 'jpg';
  }
  
  // Add the generated image to image_input
  if (item.imageUrl) {
    // Prefer cached blob -> data URL (permanent); fallback to original URL
    (async () => {
      const blob = await getBestBlobForItem(item);
      const input = blob ? await blobToDataUrl(blob) : item.imageUrl;
      uploadedImages = [];
      uploadedImages.push(input);
      renderImagePreviews();
    })();
  }
  
  closeModal();
  
  // Scroll sidebar into view and highlight
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Add highlight effect
    sidebar.style.transition = 'box-shadow 0.3s ease';
    sidebar.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.5)';
    
    setTimeout(() => {
      sidebar.style.boxShadow = '';
    }, 1500);
  }
  
  // Focus on prompt input after a short delay
  setTimeout(() => {
    promptInput.focus();
    promptInput.select();
  }, 300);
  
  showToast('Settings and image loaded, modify and run again', 'success');
}

function deleteFromGrid() {
  if (currentModalIndex < 0 || currentModalIndex >= gridItems.length) return;
  
  // Remove from array
  gridItems.splice(currentModalIndex, 1);
  localStorage.setItem('gridItems', JSON.stringify(gridItems));
  
  // Re-render grid
  gridContainer.innerHTML = '';
  if (gridItems.length === 0) {
    gridEmpty.style.display = 'flex';
    gridContainer.appendChild(gridEmpty);
  } else {
    gridEmpty.style.display = 'none';
    gridItems.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'grid-item';
      el.innerHTML = `
        <img src="${item.imageUrl}" alt="Generated image" loading="lazy">
        <div class="grid-item-overlay">
          <div class="grid-item-prompt">${escapeHtml(item.prompt)}</div>
        </div>
      `;
      el.addEventListener('click', () => openModal(item.imageUrl, index));
      gridContainer.appendChild(el);
    });
  }
  
  closeModal();
  showToast('Image deleted from grid', 'success');
}

function copyCode() {
  if (!modalCode) return;
  
  navigator.clipboard.writeText(modalCode.textContent)
    .then(() => showToast('Code copied', 'success'))
    .catch(() => showToast('Failed to copy', 'error'));
}

async function downloadModalImage() {
  if (currentModalIndex < 0) return;
  const item = gridItems[currentModalIndex];
  if (!item) return;
  
  try {
    const blob = await getBestBlobForItem(item);
    if (!blob) throw new Error('No image data');
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `nano-banana-${Date.now()}.${outputFormatSelect.value}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Image downloaded', 'success');
  } catch (err) {
    showToast('Failed to download', 'error');
  }
}

function copyModalUrl() {
  if (!currentModalUrl) return;
  
  navigator.clipboard.writeText(currentModalUrl)
    .then(() => showToast('URL copied', 'success'))
    .catch(() => showToast('Failed to copy', 'error'));
}

// Toast Notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
init();
