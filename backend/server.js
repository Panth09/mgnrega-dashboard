const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// ✅ CORS Configuration
app.use(cors({
  origin: [
    'https://mgnrega-dashboard-by-panth.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Validate environment
if (!process.env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL in environment variables!');
    process.exit(1);
}

console.log('🔌 Connecting to database...');

// PostgreSQL connection - completely disable SSL verification
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false  // Disable SSL entirely
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        return;
    }
    
    client.query('SELECT NOW(), current_user', (err, result) => {
        release();
        if (err) {
            console.error('❌ Query failed:', err.message);
            return;
        }
        console.log('✅ Database connected!');
        console.log('   Time:', result.rows[0].now);
        console.log('   User:', result.rows[0].current_user);
    });
});

// Simple cache
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// API Routes

// 1. Get all states
app.get('/api/states', async (req, res) => {
    try {
        console.log('📊 Fetching states...');
        
        const cacheKey = 'states';
        const cached = cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('✅ Returning cached states');
            return res.json(cached.data);
        }
        
        console.log('🔍 Querying database for states...');
        const result = await pool.query(
            'SELECT DISTINCT state_code, state_name FROM public.districts ORDER BY state_name'
        );
        
        console.log(`✅ Found ${result.rows.length} states`);
        
        cache.set(cacheKey, { data: result.rows, timestamp: Date.now() });
        res.json(result.rows);
        
    } catch (error) {
        console.error('❌ Error fetching states:');
        console.error('Message:', error.message);
        console.error('Code:', error.code);
        console.error('Detail:', error.detail);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            error: 'Failed to fetch states',
            details: error.message,
            code: error.code
        });
    }
});

// 2. Get districts by state
app.get('/api/districts/:stateCode', async (req, res) => {
    try {
        const { stateCode } = req.params;
        
        const result = await pool.query(
            'SELECT DISTINCT district_code, district_name FROM public.districts WHERE state_code = $1 ORDER BY district_name',
            [stateCode]
        );
        
        res.json(result.rows);
        
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({ 
            error: 'Failed to fetch districts',
            details: error.message 
        });
    }
});

// 3. Get district performance
app.get('/api/performance/:districtCode', async (req, res) => {
    try {
        const { districtCode } = req.params;
        
        // Get current and previous month data
        const result = await pool.query(
            'SELECT * FROM public.districts WHERE district_code = $1 ORDER BY month DESC LIMIT 2',
            [districtCode]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'District not found' });
        }

        const current = result.rows[0];
        const previous = result.rows[1] || null;

        // Get state average
        const stateAvg = await pool.query(
            'SELECT AVG(avg_days_per_household) as state_avg FROM public.districts WHERE state_code = $1 AND month = $2',
            [current.state_code, current.month]
        );

        // Calculate trends
        const trends = {
            households: previous ? 
                (((current.total_households - previous.total_households) / previous.total_households) * 100).toFixed(1) : '0',
            days: previous ? 
                (((current.avg_days_per_household - previous.avg_days_per_household) / previous.avg_days_per_household) * 100).toFixed(1) : '0',
            expenditure: previous ? 
                (((current.total_expenditure - previous.total_expenditure) / previous.total_expenditure) * 100).toFixed(1) : '0',
            works: previous ? 
                (((current.works_completed - previous.works_completed) / previous.works_completed) * 100).toFixed(1) : '0'
        };

        res.json({
            district: current,
            trends,
            stateAverage: parseFloat(stateAvg.rows[0]?.state_avg || 0).toFixed(1),
            lastUpdated: current.updated_at
        });

    } catch (error) {
        console.error('Error fetching performance:', error);
        res.status(500).json({ 
            error: 'Failed to fetch performance data',
            details: error.message 
        });
    }
});

// 4. Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as count FROM public.districts');
        res.json({ 
            status: 'healthy',
            database: 'connected',
            records: result.rows[0].count,
            timestamp: new Date()
        });
    } catch (error) {
        res.status(503).json({ 
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`📊 API Endpoints:`);
    console.log(`   - GET /health`);
    console.log(`   - GET /api/states`);
    console.log(`   - GET /api/districts/:stateCode`);
    console.log(`   - GET /api/performance/:districtCode\n`);
});
