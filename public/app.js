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

// State
let currentModalUrl = null;
let gridItems = JSON.parse(localStorage.getItem('gridItems') || '[]');
let uploadedImages = []; // Store base64 images

// Initialize
function init() {
  setupEventListeners();
  renderGrid();
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
  
  // Keyboard events
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      closeModal();
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

// Generate Image
async function generateImage() {
  const prompt = promptInput.value.trim();
  
  if (!prompt && uploadedImages.length === 0) {
    showToast('Please enter a prompt or upload an image', 'error');
    promptInput.focus();
    return;
  }
  
  // Add loading item to grid
  const loadingId = Date.now();
  addLoadingItem(loadingId, prompt || 'Image transformation');
  
  generateBtn.disabled = true;
  
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt || 'Transform this image',
        resolution: resolutionSelect.value,
        aspect_ratio: aspectRatioSelect.value,
        output_format: outputFormatSelect.value,
        safety_filter_level: safetyFilterSelect.value,
        image_input: uploadedImages
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate image');
    }
    
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
    
    // Update loading item with actual image
    updateLoadingItem(loadingId, {
      id: loadingId,
      prompt: prompt || 'Image transformation',
      imageUrl: imageUrl,
      settings: {
        resolution: resolutionSelect.value,
        aspect_ratio: aspectRatioSelect.value,
        output_format: outputFormatSelect.value
      },
      timestamp: Date.now()
    });
    
    // Clear uploaded images after successful generation
    uploadedImages = [];
    renderImagePreviews();
    
  } catch (err) {
    console.error('Generation error:', err);
    removeLoadingItem(loadingId);
    showToast(err.message, 'error');
  } finally {
    generateBtn.disabled = false;
  }
}

// Add Loading Item to Grid
function addLoadingItem(id, prompt) {
  gridEmpty.style.display = 'none';
  
  const item = document.createElement('div');
  item.className = 'grid-item';
  item.id = `grid-item-${id}`;
  item.innerHTML = `
    <div class="grid-item-loading">
      <div class="spinner"></div>
      <span>Processing</span>
    </div>
  `;
  
  // Insert at the beginning
  gridContainer.insertBefore(item, gridContainer.firstChild);
}

// Update Loading Item with Image
function updateLoadingItem(id, itemData) {
  const item = document.getElementById(`grid-item-${id}`);
  if (!item) return;
  
  // Add to storage
  gridItems.unshift(itemData);
  if (gridItems.length > 50) {
    gridItems = gridItems.slice(0, 50);
  }
  localStorage.setItem('gridItems', JSON.stringify(gridItems));
  
  // Update DOM
  item.innerHTML = `
    <img src="${itemData.imageUrl}" alt="Generated image" loading="lazy">
    <div class="grid-item-overlay">
      <div class="grid-item-prompt">${escapeHtml(itemData.prompt)}</div>
    </div>
  `;
  
  // Add click handler
  item.addEventListener('click', () => openModal(itemData.imageUrl));
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
  if (gridItems.length === 0) {
    gridEmpty.style.display = 'flex';
    return;
  }
  
  gridEmpty.style.display = 'none';
  
  gridItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'grid-item';
    el.innerHTML = `
      <img src="${item.imageUrl}" alt="Generated image" loading="lazy">
      <div class="grid-item-overlay">
        <div class="grid-item-prompt">${escapeHtml(item.prompt)}</div>
      </div>
    `;
    el.addEventListener('click', () => openModal(item.imageUrl));
    gridContainer.appendChild(el);
  });
}

// Modal Functions
function openModal(imageUrl) {
  currentModalUrl = imageUrl;
  modalImage.src = imageUrl;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.style.display = 'none';
  document.body.style.overflow = '';
  currentModalUrl = null;
}

async function downloadModalImage() {
  if (!currentModalUrl) return;
  
  try {
    const response = await fetch(currentModalUrl);
    const blob = await response.blob();
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
