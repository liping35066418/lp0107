const API_BASE = 'http://localhost:9877/api';

const state = {
  currentLevel: null,
  products: [],
  shelfSlots: [],
  history: [],
  violations: {},
  isValid: false,
};

const elements = {
  levelSelect: document.getElementById('levelSelect'),
  levelName: document.getElementById('levelName'),
  levelDesc: document.getElementById('levelDesc'),
  productList: document.getElementById('productList'),
  shelf: document.getElementById('shelf'),
  placedCount: document.getElementById('placedCount'),
  requiredCount: document.getElementById('requiredCount'),
  statusResult: document.getElementById('statusResult'),
  violationList: document.getElementById('violationList'),
  undoBtn: document.getElementById('undoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  checkBtn: document.getElementById('checkBtn'),
};

async function init() {
  try {
    await fetchProducts();
    await loadLevel(elements.levelSelect.value);
    bindEvents();
  } catch (error) {
    console.error('初始化失败:', error);
    showStatus('连接后端服务失败，请确认 9877 端口服务已启动', 'error');
  }
}

async function fetchProducts() {
  const res = await fetch(`${API_BASE}/products`);
  state.products = await res.json();
}

async function loadLevel(levelId) {
  const res = await fetch(`${API_BASE}/levels/${levelId}`);
  state.currentLevel = await res.json();
  state.shelfSlots = new Array(state.currentLevel.shelfRows * state.currentLevel.shelfCols).fill(null);
  state.history = [];
  state.violations = {};
  state.isValid = false;

  renderLevelInfo();
  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoButton();
  renderViolations();
}

function renderLevelInfo() {
  elements.levelName.textContent = state.currentLevel.name;
  elements.levelDesc.textContent = state.currentLevel.description;
}

function getPlacedProductIds() {
  return state.shelfSlots.filter(s => s !== null).map(s => s.productId);
}

function renderProductList() {
  const requiredIds = state.currentLevel.requiredProducts;
  const placedIds = getPlacedProductIds();
  const products = state.products.filter(p => requiredIds.includes(p.id));

  elements.productList.innerHTML = products.map(p => {
    const isPlaced = placedIds.includes(p.id);
    const weightLabel = p.weight === 'heavy' ? '重' : p.weight === 'medium' ? '中' : '轻';
    return `
      <div class="product-item ${isPlaced ? 'placed' : ''}" 
           draggable="${!isPlaced}" 
           data-product-id="${p.id}"
           title="${p.name}">
        <span class="product-icon">${p.icon}</span>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <span class="product-tag weight-${p.weight}">${weightLabel}</span>
        </div>
      </div>
    `;
  }).join('');

  elements.productList.querySelectorAll('.product-item[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
  });
}

function renderShelf() {
  const { shelfRows, shelfCols, zoneConfig, zoneLabels } = state.currentLevel;
  let html = '';

  for (let row = 0; row < shelfRows; row++) {
    const zoneKey = `row${row}`;
    const zone = zoneConfig ? zoneConfig[zoneKey] : null;
    const zoneClass = zone ? `zone-${zone}` : '';
    const zoneLabel = zone && zoneLabels ? zoneLabels[zone] : '';

    html += `<div class="shelf-row ${zoneClass}">`;
    if (zoneLabel) {
      html += `<span class="row-label">${zoneLabel}</span>`;
    }

    for (let col = 0; col < shelfCols; col++) {
      const slotIndex = row * shelfCols + col;
      const slot = state.shelfSlots[slotIndex];
      const violationKey = `${row}-${col}`;
      const hasViolation = state.violations[violationKey];
      const violationCount = hasViolation ? hasViolation.length : 0;

      html += `
        <div class="shelf-slot ${slot ? 'has-product' : ''} ${hasViolation ? 'violation' : ''}"
             data-row="${row}" 
             data-col="${col}"
             data-slot-index="${slotIndex}">
          ${hasViolation ? `<span class="violation-badge">${violationCount}</span>` : ''}
          ${slot ? renderSlotProduct(slot) : ''}
        </div>
      `;
    }

    html += '</div>';
  }

  elements.shelf.innerHTML = html;

  elements.shelf.querySelectorAll('.shelf-slot').forEach(slot => {
    slot.addEventListener('dragover', handleDragOver);
    slot.addEventListener('dragleave', handleDragLeave);
    slot.addEventListener('drop', handleDrop);
    slot.addEventListener('click', handleSlotClick);
  });
}

function renderSlotProduct(slot) {
  const product = state.products.find(p => p.id === slot.productId);
  if (!product) return '';
  return `
    <div class="slot-product">
      <span class="slot-product-icon">${product.icon}</span>
      <span class="slot-product-name">${product.name}</span>
    </div>
  `;
}

function handleDragStart(e) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.currentTarget.dataset.productId);
  e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const productId = e.dataTransfer.getData('text/plain');
  const slotIndex = parseInt(e.currentTarget.dataset.slotIndex);
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);

  placeProduct(productId, slotIndex, row, col);
}

function handleSlotClick(e) {
  const slotIndex = parseInt(e.currentTarget.dataset.slotIndex);
  if (state.shelfSlots[slotIndex]) {
    removeProduct(slotIndex);
  }
}

function placeProduct(productId, slotIndex, row, col) {
  const oldSlot = state.shelfSlots[slotIndex];

  saveHistory();

  const existingIndex = state.shelfSlots.findIndex(s => s && s.productId === productId);
  if (existingIndex !== -1) {
    state.shelfSlots[existingIndex] = null;
  }

  state.shelfSlots[slotIndex] = { productId, row, col };

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoButton();
  validateShelf();
}

function removeProduct(slotIndex) {
  if (!state.shelfSlots[slotIndex]) return;

  saveHistory();
  state.shelfSlots[slotIndex] = null;

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoButton();
  validateShelf();
}

function saveHistory() {
  state.history.push(JSON.parse(JSON.stringify(state.shelfSlots)));
  if (state.history.length > 50) {
    state.history.shift();
  }
}

function undo() {
  if (state.history.length === 0) return;

  state.shelfSlots = state.history.pop();
  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoButton();
  validateShelf();
}

function clearShelf() {
  if (state.shelfSlots.every(s => s === null)) return;
  
  saveHistory();
  state.shelfSlots = new Array(state.currentLevel.shelfRows * state.currentLevel.shelfCols).fill(null);
  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoButton();
  validateShelf();
}

function updateStatus() {
  const placed = state.shelfSlots.filter(s => s !== null).length;
  const required = state.currentLevel.requiredProducts.length;
  elements.placedCount.textContent = placed;
  elements.requiredCount.textContent = required;
}

function updateUndoButton() {
  elements.undoBtn.disabled = state.history.length === 0;
}

function showStatus(message, type = '') {
  elements.statusResult.textContent = message;
  elements.statusResult.className = 'status-result ' + type;
}

async function validateShelf() {
  const shelfState = {
    slots: state.shelfSlots.map(s => s || {}),
  };

  try {
    const res = await fetch(`${API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        levelId: state.currentLevel.id,
        shelfState,
      }),
    });

    const result = await res.json();
    state.violations = result.violationMap || {};
    state.isValid = result.valid;

    renderShelf();
    renderViolations(result);

    if (result.valid) {
      showStatus('🎉 恭喜！所有商品摆放合规！', 'success');
    } else if (result.violations.length > 0) {
      const vCount = result.violations.filter(v => v.type !== 'missing').length;
      if (vCount > 0) {
        showStatus(`⚠️ 发现 ${vCount} 处违规`, 'error');
      } else {
        showStatus(`📦 还需摆放 ${result.violations[0].missingProducts.length} 件商品`, 'warning');
      }
    } else {
      showStatus('开始摆放商品吧！', '');
    }
  } catch (error) {
    console.error('验证失败:', error);
  }
}

function renderViolations(result) {
  if (!result || result.violations.length === 0) {
    elements.violationList.innerHTML = '<p class="empty-tip">暂无违规</p>';
    return;
  }

  const typeLabels = {
    zone: '分区违规',
    weight: '重量违规',
    missing: '缺少商品',
  };

  elements.violationList.innerHTML = result.violations.map(v => `
    <div class="violation-item">
      <div class="violation-type">${typeLabels[v.type] || v.type}</div>
      <div class="violation-msg">${v.message}</div>
    </div>
  `).join('');
}

function bindEvents() {
  elements.levelSelect.addEventListener('change', (e) => {
    loadLevel(e.target.value);
  });

  elements.undoBtn.addEventListener('click', undo);
  elements.clearBtn.addEventListener('click', clearShelf);
  elements.checkBtn.addEventListener('click', validateShelf);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });
}

init();
