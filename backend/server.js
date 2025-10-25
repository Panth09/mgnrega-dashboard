const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

console.log('🔌 Connecting to database...');

// Try to extract connection details from DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ Missing DATABASE_URL in .env file!');
    process.exit(1);
}

// PostgreSQL connection with explicit config
const pool = new Pool({
    connectionString: connectionString,
    ssl: { 
        rejectUnauthorized: false 
    },
    // Add these for better connection handling
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Test connection with better error handling
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('Connection string format:', connectionString.replace(/:[^:@]+@/, ':****@'));
        return;
    }
    
    client.query('SELECT NOW(), current_user, current_database()', (err, result) => {
        release();
        if (err) {
            console.error('❌ Query failed:', err.message);
            return;
        }
        console.log('✅ Database connected!');
        console.log('   Time:', result.rows[0].now);
        console.log('   User:', result.rows[0].current_user);
        console.log('   Database:', result.rows[0].current_database);
    });
});

// Simple cache
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

// API Routes

// 1. Get all states
app.get('/api/states', async (req, res) => {
    try {
        const cacheKey = 'states';
        const cached = cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return res.json(cached.data);
        }
        
        console.log('Querying states...');
        const result = await pool.query(
            'SELECT DISTINCT state_code, state_name FROM public.districts ORDER BY state_name'
        );
        
        console.log('States found:', result.rows.length);
        cache.set(cacheKey, { data: result.rows, timestamp: Date.now() });
        res.json(result.rows);
        
    } catch (error) {
        console.error('Error fetching states:', error);
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
        res.status(500).json({ error: 'Failed to fetch districts' });
    }
});

// 3. Get district performance
app.get('/api/performance/:districtCode', async (req, res) => {
    try {
        const { districtCode } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM public.districts WHERE district_code = $1 ORDER BY month DESC LIMIT 2',
            [districtCode]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'District not found' });
        }

        const current = result.rows[0];
        const previous = result.rows[1] || null;

        const stateAvg = await pool.query(
            'SELECT AVG(avg_days_per_household) as state_avg FROM public.districts WHERE state_code = $1 AND month = $2',
            [current.state_code, current.month]
        );

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
        res.status(500).json({ error: 'Failed to fetch performance data' });
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
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Test: http://localhost:${PORT}/health\n`);
});

javascript
// Get historical data (last 6 months)
app.get('/api/history/:districtCode', async (req, res) => {
    try {
        const { districtCode } = req.params;
        
        const result = await pool.query(
            `SELECT month, avg_days_per_household, total_households, 
                    total_expenditure, works_completed 
             FROM public.districts 
             WHERE district_code = $1 
             ORDER BY month DESC 
             LIMIT 6`,
            [districtCode]
        );
        
        res.json(result.rows.reverse()); // Oldest to newest
        
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});