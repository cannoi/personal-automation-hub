const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory fallback or simple JSON-backed store to avoid native sqlite build issues in alpine containers
const dbFile = path.join(dataDir, 'automations.json');
function readDb() {
  try {
    if (fs.existsSync(dbFile)) {
      return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    }
  } catch (e) {}
  return { rules: [], logs: [] };
}
function writeDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

// API: Get Rules and Stats
app.get('/api/rules', (req, res) => {
  const db = readDb();
  const rules = db.rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const activeCount = rules.filter(r => r.active === 1).length;
  res.json({
    rules,
    stats: {
      total: rules.length,
      active: activeCount,
      executions: db.logs.length
    }
  });
});

// API: Create Rule
app.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !trigger_type || !action_type) {
    return res.status(400).json({ error: 'Missing required rule fields' });
  }
  const db = readDb();
  const newRule = {
    id: Date.now(),
    name,
    trigger_type,
    trigger_config: JSON.stringify(trigger_config || {}),
    action_type,
    action_config: JSON.stringify(action_config || {}),
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.rules.unshift(newRule);
  writeDb(db);
  res.json({ id: newRule.id, message: 'Rule created successfully' });
});

// API: Toggle Rule
app.patch('/api/rules/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const rule = db.rules.find(r => r.id === id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  rule.active = rule.active ? 0 : 1;
  rule.updated_at = new Date().toISOString();
  writeDb(db);
  res.json({ id, active: rule.active });
});

// API: Delete Rule
app.delete('/api/rules/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  db.rules = db.rules.filter(r => r.id !== id);
  db.logs = db.logs.filter(l => l.rule_id !== id);
  writeDb(db);
  res.json({ message: 'Rule deleted successfully' });
});

// API: Test Simulate Rule
app.post('/api/rules/:id/test', (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const rule = db.rules.find(r => r.id === id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  if (!rule.active) return res.status(400).json({ error: 'Rule is currently inactive' });

  const logMsg = `Simulated trigger [${rule.trigger_type}] executed successfully`;
  const newLog = {
    id: Date.now(),
    rule_id: id,
    status: 'SUCCESS',
    message: logMsg,
    executed_at: new Date().toISOString()
  };
  db.logs.unshift(newLog);
  writeDb(db);
  res.json({ success: true, message: logMsg, log: newLog });
});

// API: Get Logs
app.get('/api/logs', (req, res) => {
  const db = readDb();
  const logs = db.logs.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at)).slice(0, 50);
  res.json(logs);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Personal Automation Hub running on port ${PORT}`);
});
