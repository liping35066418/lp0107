const API_BASE = 'http://localhost:9877/api';

const state = {
  currentLevel: null,
  products: [],
  shelfSlots: [],
  history: [],
  future: [],
  violations: {},
  violationCount: 0,
  isValid: false,
  dragSource: null,
  score: 0,
  timer: null,
  startTime: null,
  elapsedSeconds: 0,
  isLevelComplete: false,
  highScores: {},
};

const elements = {
  levelSelect: document.getElementById('levelSelect'),
  levelName: document.getElementById('levelName'),
  levelDesc: document.getElementById('levelDesc'),
  productList: document.getElementById('productList'),
  shelf: document.getElementById('shelf'),
  placedCount: document.getElementById('placedCount'),
  requiredCount: document.getElementById('requiredCount'),
  scoreDisplay: document.getElementById('scoreDisplay'),
  timerDisplay: document.getElementById('timerDisplay'),
  statusResult: document.getElementById('statusResult'),
  violationList: document.getElementById('violationList'),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  checkBtn: document.getElementById('checkBtn'),
  resultModal: document.getElementById('resultModal'),
  finalScore: document.getElementById('finalScore'),
  finalTime: document.getElementById('finalTime'),
  highScore: document.getElementById('highScore'),
  isNewRecord: document.getElementById('isNewRecord'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  retryBtn: document.getElementById('retryBtn'),
};

async function init() {
  try {
    loadHighScores();
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
  state.future = [];
  state.violations = {};
  state.violationCount = 0;
  state.isValid = false;
  state.score = 0;
  state.isLevelComplete = false;
  state.elapsedSeconds = 0;

  stopTimer();
  startTimer();

  renderLevelInfo();
  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  renderViolations();
  updateScoreDisplay();
  updateTimerDisplay();
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
           data-source-type="list"
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
          ${slot ? renderSlotProduct(slot, slotIndex) : ''}
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

  elements.shelf.querySelectorAll('.slot-product').forEach(el => {
    el.addEventListener('dragstart', handleSlotDragStart);
    el.addEventListener('dragend', handleSlotDragEnd);
  });
}

function renderSlotProduct(slot, slotIndex) {
  const product = state.products.find(p => p.id === slot.productId);
  if (!product) return '';
  return `
    <div class="slot-product" 
         draggable="true"
         data-product-id="${product.id}"
         data-source-slot="${slotIndex}"
         data-source-type="shelf">
      <span class="slot-product-icon">${product.icon}</span>
      <span class="slot-product-name">${product.name}</span>
    </div>
  `;
}

function handleDragStart(e) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({
    productId: e.currentTarget.dataset.productId,
    sourceType: e.currentTarget.dataset.sourceType,
  }));
  e.currentTarget.classList.add('dragging');
  state.dragSource = {
    productId: e.currentTarget.dataset.productId,
    sourceType: 'list',
  };
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  state.dragSource = null;
}

function handleSlotDragStart(e) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({
    productId: e.currentTarget.dataset.productId,
    sourceType: e.currentTarget.dataset.sourceType,
    sourceSlot: parseInt(e.currentTarget.dataset.sourceSlot),
  }));
  e.currentTarget.classList.add('dragging');
  state.dragSource = {
    productId: e.currentTarget.dataset.productId,
    sourceType: 'shelf',
    sourceSlot: parseInt(e.currentTarget.dataset.sourceSlot),
  };
  e.stopPropagation();
}

function handleSlotDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  state.dragSource = null;
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

  let dragData;
  try {
    dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
  } catch (err) {
    return;
  }

  const { productId, sourceType, sourceSlot } = dragData;
  const targetSlotIndex = parseInt(e.currentTarget.dataset.slotIndex);
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);

  placeOrSwapProduct(productId, sourceType, sourceSlot, targetSlotIndex, row, col);
}

function handleSlotClick(e) {
  const slotIndex = parseInt(e.currentTarget.dataset.slotIndex);
  if (state.shelfSlots[slotIndex]) {
    removeProduct(slotIndex);
  }
}

function placeOrSwapProduct(productId, sourceType, sourceSlot, targetSlotIndex, row, col) {
  const targetSlot = state.shelfSlots[targetSlotIndex];
  const currentSourceIndex = state.shelfSlots.findIndex(s => s && s.productId === productId);

  if (sourceType === 'shelf' && sourceSlot === targetSlotIndex) {
    return;
  }

  saveHistory();
  state.future = [];

  if (targetSlot) {
    const targetProductId = targetSlot.productId;

    if (sourceType === 'shelf' && sourceSlot !== undefined) {
      const sourceRow = Math.floor(sourceSlot / state.currentLevel.shelfCols);
      const sourceCol = sourceSlot % state.currentLevel.shelfCols;
      state.shelfSlots[sourceSlot] = { productId: targetProductId, row: sourceRow, col: sourceCol };
    } else {
      const emptyIndex = currentSourceIndex !== -1 && currentSourceIndex !== targetSlotIndex
        ? currentSourceIndex
        : state.shelfSlots.findIndex(s => s === null);
      if (emptyIndex !== -1) {
        const emptyRow = Math.floor(emptyIndex / state.currentLevel.shelfCols);
        const emptyCol = emptyIndex % state.currentLevel.shelfCols;
        state.shelfSlots[emptyIndex] = { productId: targetProductId, row: emptyRow, col: emptyCol };
      }
    }
  } else {
    if (sourceType === 'shelf' && sourceSlot !== undefined) {
      state.shelfSlots[sourceSlot] = null;
    } else if (currentSourceIndex !== -1 && currentSourceIndex !== targetSlotIndex) {
      state.shelfSlots[currentSourceIndex] = null;
    }
  }

  state.shelfSlots[targetSlotIndex] = { productId, row, col };

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  validateShelf();
}

function removeProduct(slotIndex) {
  if (!state.shelfSlots[slotIndex]) return;

  saveHistory();
  state.future = [];
  state.shelfSlots[slotIndex] = null;

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  validateShelf();
}

function saveHistory() {
  state.history.push(JSON.parse(JSON.stringify(state.shelfSlots)));
  if (state.history.length > 100) {
    state.history.shift();
  }
}

function undo() {
  if (state.history.length === 0) return;

  state.future.push(JSON.parse(JSON.stringify(state.shelfSlots)));
  state.shelfSlots = state.history.pop();

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  validateShelf();
}

function redo() {
  if (state.future.length === 0) return;

  state.history.push(JSON.parse(JSON.stringify(state.shelfSlots)));
  state.shelfSlots = state.future.pop();

  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  validateShelf();
}

function clearShelf() {
  if (state.shelfSlots.every(s => s === null)) return;
  
  saveHistory();
  state.future = [];
  state.shelfSlots = new Array(state.currentLevel.shelfRows * state.currentLevel.shelfCols).fill(null);
  renderProductList();
  renderShelf();
  updateStatus();
  updateUndoRedoButtons();
  validateShelf();
}

function updateStatus() {
  const placed = state.shelfSlots.filter(s => s !== null).length;
  const required = state.currentLevel.requiredProducts.length;
  elements.placedCount.textContent = placed;
  elements.requiredCount.textContent = required;
}

function updateUndoRedoButtons() {
  elements.undoBtn.disabled = state.history.length === 0;
  elements.redoBtn.disabled = state.future.length === 0;
}

function calculateScore() {
  const placedCount = state.shelfSlots.filter(s => s !== null).length;
  const baseScore = placedCount * 10;
  const penalty = state.violationCount * 5;
  return Math.max(0, baseScore - penalty);
}

function updateScore() {
  state.score = calculateScore();
  updateScoreDisplay();
}

function updateScoreDisplay() {
  if (elements.scoreDisplay) {
    elements.scoreDisplay.textContent = state.score;
  }
}

function startTimer() {
  if (state.timer) return;
  state.startTime = Date.now() - state.elapsedSeconds * 1000;
  state.timer = setInterval(() => {
    state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function updateTimerDisplay() {
  if (elements.timerDisplay) {
    const mins = Math.floor(state.elapsedSeconds / 60);
    const secs = state.elapsedSeconds % 60;
    elements.timerDisplay.textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

function loadHighScores() {
  try {
    const saved = localStorage.getItem('shelfGame_highScores');
    if (saved) {
      state.highScores = JSON.parse(saved);
    }
  } catch (e) {
    console.error('加载历史最高分时出错:', e);
    state.highScores = {};
  }
}

function saveHighScore(levelId, score) {
  if (!state.highScores[levelId] || score > state.highScores[levelId]) {
    state.highScores[levelId] = score;
    try {
      localStorage.setItem('shelfGame_highScores', JSON.stringify(state.highScores));
    } catch (e) {
      console.error('保存历史最高分时出错:', e);
    }
    return true;
  }
  return false;
}

function getHighScore(levelId) {
  return state.highScores[levelId] || 0;
}

function showResultModal() {
  if (!elements.resultModal) return;

  const levelId = state.currentLevel.id;
  const currentScore = state.score;
  const isNew = saveHighScore(levelId, currentScore);

  elements.finalScore.textContent = currentScore;
  elements.finalTime.textContent = formatTime(state.elapsedSeconds);
  elements.highScore.textContent = getHighScore(levelId);

  if (isNew) {
    elements.isNewRecord.style.display = 'block';
  } else {
    elements.isNewRecord.style.display = 'none';
  }

  elements.resultModal.style.display = 'flex';
}

function hideResultModal() {
  if (elements.resultModal) {
    elements.resultModal.style.display = 'none';
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
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

    const nonMissingViolations = (result.violations || []).filter(v => v.type !== 'missing');
    state.violationCount = nonMissingViolations.length;

    updateScore();

    renderShelf();
    renderViolations(result);

    if (result.valid) {
      if (!state.isLevelComplete) {
        state.isLevelComplete = true;
        stopTimer();
        showStatus('🎉 恭喜！所有商品摆放合规！', 'success');
        setTimeout(() => {
          showResultModal();
        }, 500);
      }
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
    stack: '叠放违规',
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
  elements.redoBtn.addEventListener('click', redo);
  elements.clearBtn.addEventListener('click', clearShelf);
  elements.checkBtn.addEventListener('click', validateShelf);

  if (elements.closeModalBtn) {
    elements.closeModalBtn.addEventListener('click', hideResultModal);
  }

  if (elements.retryBtn) {
    elements.retryBtn.addEventListener('click', () => {
      hideResultModal();
      loadLevel(state.currentLevel.id);
    });
  }

  if (elements.resultModal) {
    elements.resultModal.addEventListener('click', (e) => {
      if (e.target === elements.resultModal) {
        hideResultModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
    if (e.key === 'Escape' && elements.resultModal && elements.resultModal.style.display === 'flex') {
      hideResultModal();
    }
  });
}

init();
