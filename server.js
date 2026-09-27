const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'automations.db');
const db = new sqlite3.Database(dbPath);

// Initialize Database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT,
    action_type TEXT NOT NULL,
    action_config TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER,
    status TEXT NOT NULL,
    message TEXT,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Endpoint
app.get('/health', (req, res) => {
  db.get('SELECT 1', (err) => {
    if (err) {
      res.status(500).json({ status: 'error', error: err.message });
    } else {
      res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
    }
  });
});

// API: Get Rules and Stats
app.get('/api/rules', (req, res) => {
  db.all('SELECT * FROM rules ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT COUNT(*) as total, SUM(active) as active_count FROM rules', [], (err2, stats) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT COUNT(*) as total_logs FROM logs', [], (err3, logStats) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({
          rules: rows,
          stats: {
            total: stats.total || 0,
            active: stats.active_count || 0,
            executions: logStats.total_logs || 0
          }
        });
      });
    });
  });
});

// API: Create Rule
app.post('/api/rules', (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  if (!name || !trigger_type || !action_type) {
    return res.status(400).json({ error: 'Missing required rule fields' });
  }
  const query = `INSERT INTO rules (name, trigger_type, trigger_config, action_type, action_config) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [name, trigger_type, JSON.stringify(trigger_config || {}), action_type, JSON.stringify(action_config || {})], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Rule created successfully' });
  });
});

// API: Toggle Rule
app.patch('/api/rules/:id/toggle', (req, res) => {
  const { id } = req.params;
  db.get('SELECT active FROM rules WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Rule not found' });
    const newActive = row.active ? 0 : 1;
    db.run('UPDATE rules SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newActive, id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ id, active: newActive });
    });
  });
});

// API: Delete Rule
app.delete('/api/rules/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM rules WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM logs WHERE rule_id = ?', [id]);
    res.json({ message: 'Rule deleted successfully' });
  });
});

// API: Test Simulate Rule
app.post('/api/rules/:id/test', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM rules WHERE id = ?', [id], (err, rule) => {
    if (err || !rule) return res.status(404).json({ error: 'Rule not found' });
    if (!rule.active) return res.status(400).json({ error: 'Rule is currently inactive' });

    const logMsg = `Simulated trigger [${rule.trigger_type}] successfully executed action [${rule.action_type}].`;
    db.run('INSERT INTO logs (rule_id, status, message) VALUES (?, ?, ?)', [id, 'SUCCESS', logMsg], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true, message: logMsg, log_id: this.lastID });
    });
  });
});

// API: Get Logs
app.get('/api/logs', (req, res) => {
  const query = `SELECT logs.*, rules.name as rule_name FROM logs LEFT JOIN rules ON logs.rule_id = rules.id ORDER BY logs.executed_at DESC LIMIT 50`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Personal Automation Hub running on port ${PORT}`);
});

module.exports = { app, server, db };
