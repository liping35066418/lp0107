const express = require('express');
const cors = require('cors');
const { getLevel, validateShelf, getProducts } = require('./gameLogic');

const app = express();
const PORT = 9877;

app.use(cors());
app.use(express.json());

app.get('/api/levels/:levelId', (req, res) => {
  const level = getLevel(req.params.levelId);
  if (!level) {
    return res.status(404).json({ error: '关卡不存在' });
  }
  res.json(level);
});

app.get('/api/products', (req, res) => {
  res.json(getProducts());
});

app.post('/api/validate', (req, res) => {
  const { levelId, shelfState } = req.body;
  const result = validateShelf(levelId, shelfState);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`货架合规判定服务运行在 http://localhost:${PORT}`);
});
