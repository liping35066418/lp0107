const PRODUCTS = [
  { id: 'chips1', name: '薯片', category: 'puffed', weight: 'light', icon: '🍟' },
  { id: 'chips2', name: '虾条', category: 'puffed', weight: 'light', icon: '🥨' },
  { id: 'chips3', name: '爆米花', category: 'puffed', weight: 'light', icon: '🍿' },
  { id: 'chips4', name: '玉米片', category: 'puffed', weight: 'light', icon: '🌽' },
  { id: 'drink1', name: '可乐', category: 'drink', weight: 'medium', icon: '🥤' },
  { id: 'drink2', name: '果汁', category: 'drink', weight: 'medium', icon: '🧃' },
  { id: 'drink3', name: '牛奶', category: 'drink', weight: 'medium', icon: '🥛' },
  { id: 'drink4', name: '矿泉水', category: 'drink', weight: 'medium', icon: '💧' },
  { id: 'candy1', name: '巧克力', category: 'candy', weight: 'light', icon: '🍫' },
  { id: 'candy2', name: '棒棒糖', category: 'candy', weight: 'light', icon: '🍭' },
  { id: 'candy3', name: '软糖', category: 'candy', weight: 'light', icon: '🍬' },
  { id: 'candy4', name: '饼干', category: 'candy', weight: 'light', icon: '🍪' },
  { id: 'heavy1', name: '大米袋', category: 'grocery', weight: 'heavy', icon: '🌾' },
  { id: 'heavy2', name: '面粉袋', category: 'grocery', weight: 'heavy', icon: '🥖' },
  { id: 'heavy3', name: '桶装水', category: 'drink', weight: 'heavy', icon: '🪣' },
  { id: 'heavy4', name: '食用油', category: 'grocery', weight: 'heavy', icon: '🫒' },
];

const WEIGHT_ORDER = { light: 1, medium: 2, heavy: 3 };
const WEIGHT_LABEL = { light: '轻', medium: '中', heavy: '重' };

const LEVELS = {
  level1: {
    id: 'level1',
    name: '第一关：基础分区',
    description: '将膨化零食、冷藏饮品、糖果分别摆放到对应区域',
    shelfRows: 3,
    shelfCols: 4,
    zoneConfig: {
      row0: 'puffed',
      row1: 'drink',
      row2: 'candy',
    },
    zoneLabels: {
      puffed: '膨化零食区',
      drink: '冷藏饮品区',
      candy: '糖果区',
    },
    rules: ['zone'],
    requiredProducts: ['chips1', 'chips2', 'drink1', 'drink2', 'candy1', 'candy2'],
  },
  level2: {
    id: 'level2',
    name: '第二关：重物底层',
    description: '重物必须放在最底层，轻物可放任意层，同时禁止重的压轻的',
    shelfRows: 3,
    shelfCols: 4,
    zoneConfig: null,
    rules: ['weight', 'stack'],
    requiredProducts: ['heavy1', 'heavy2', 'chips1', 'candy1', 'drink1', 'heavy3'],
  },
  level3: {
    id: 'level3',
    name: '第三关：综合挑战',
    description: '分区摆放 + 重物底层 + 叠放不重压轻，三重规则同时生效',
    shelfRows: 4,
    shelfCols: 4,
    zoneConfig: {
      row0: 'puffed',
      row1: 'drink',
      row2: 'candy',
      row3: 'grocery',
    },
    zoneLabels: {
      puffed: '膨化零食区',
      drink: '冷藏饮品区',
      candy: '糖果区',
      grocery: '杂货区',
    },
    rules: ['zone', 'weight', 'stack'],
    requiredProducts: [
      'chips1', 'chips2', 'chips3',
      'drink1', 'drink2', 'drink3',
      'candy1', 'candy2', 'candy3',
      'heavy1', 'heavy2', 'heavy4',
    ],
  },
};

function getProducts() {
  return PRODUCTS;
}

function getLevel(levelId) {
  return LEVELS[levelId] || null;
}

function getProductById(productId) {
  return PRODUCTS.find(p => p.id === productId);
}

function addViolation(violations, violationMap, row, col, violation) {
  const key = `${row}-${col}`;
  if (!violationMap[key]) {
    violationMap[key] = [];
  }
  violationMap[key].push(violation);
  violations.push({ row, col, ...violation });
}

function validateShelf(levelId, shelfState) {
  const level = LEVELS[levelId];
  if (!level) {
    return { valid: false, errors: ['关卡不存在'] };
  }

  const violations = [];
  const violationMap = {};

  if (!shelfState || !Array.isArray(shelfState.slots)) {
    return { valid: false, errors: ['货架状态无效'] };
  }

  for (let row = 0; row < level.shelfRows; row++) {
    for (let col = 0; col < level.shelfCols; col++) {
      const slotIndex = row * level.shelfCols + col;
      const slot = shelfState.slots[slotIndex];
      if (!slot || !slot.productId) continue;

      const product = getProductById(slot.productId);
      if (!product) continue;

      if (level.rules.includes('zone') && level.zoneConfig) {
        const expectedCategory = level.zoneConfig[`row${row}`];
        if (expectedCategory && product.category !== expectedCategory) {
          addViolation(violations, violationMap, row, col, {
            type: 'zone',
            message: `${product.name}应放在${level.zoneLabels[expectedCategory]}`,
          });
        }
      }

      if (level.rules.includes('weight')) {
        const bottomRow = level.shelfRows - 1;
        if (product.weight === 'heavy' && row !== bottomRow) {
          addViolation(violations, violationMap, row, col, {
            type: 'weight',
            message: `${product.name}(${WEIGHT_LABEL[product.weight]})是重物，应放在最底层`,
          });
        }
      }
    }
  }

  if (level.rules.includes('stack')) {
    for (let col = 0; col < level.shelfCols; col++) {
      for (let row = 0; row < level.shelfRows - 1; row++) {
        const topSlotIndex = row * level.shelfCols + col;
        const bottomSlotIndex = (row + 1) * level.shelfCols + col;
        const topSlot = shelfState.slots[topSlotIndex];
        const bottomSlot = shelfState.slots[bottomSlotIndex];

        if (!topSlot || !topSlot.productId || !bottomSlot || !bottomSlot.productId) {
          continue;
        }

        const topProduct = getProductById(topSlot.productId);
        const bottomProduct = getProductById(bottomSlot.productId);
        if (!topProduct || !bottomProduct) continue;

        if (WEIGHT_ORDER[topProduct.weight] > WEIGHT_ORDER[bottomProduct.weight]) {
          addViolation(violations, violationMap, row, col, {
            type: 'stack',
            message: `第${row + 1}行${col + 1}列的${topProduct.name}(${WEIGHT_LABEL[topProduct.weight]})压在了第${row + 2}行${col + 1}列的${bottomProduct.name}(${WEIGHT_LABEL[bottomProduct.weight]})上，重的不能压轻的`,
          });
        }
      }
    }
  }

  const placedProductIds = shelfState.slots
    .filter(s => s && s.productId)
    .map(s => s.productId);

  const missingProducts = level.requiredProducts.filter(
    pid => !placedProductIds.includes(pid)
  );

  if (missingProducts.length > 0) {
    violations.push({
      type: 'missing',
      message: `还有 ${missingProducts.length} 件商品未摆放`,
      missingProducts,
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    violationMap,
    placedCount: placedProductIds.length,
    requiredCount: level.requiredProducts.length,
  };
}

module.exports = {
  getProducts,
  getLevel,
  validateShelf,
  PRODUCTS,
  LEVELS,
};
