const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// ✅ CRITICAL: Configure CORS for production
const allowedOrigins = [
  'https://mgnrega-dashboard-by-panth.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'CORS policy does not allow access from this origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase credentials in .env file!');
    console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY');
    process.exit(1);
}

console.log('✅ Supabase URL:', process.env.SUPABASE_URL);

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Simple cache
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

function getCachedData(key, fetchFn) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return Promise.resolve(cached.data);
    }
    return fetchFn().then(data => {
        cache.set(key, { data, timestamp: Date.now() });
        return data;
    });
}

// 1. Get all states
app.get('/api/states', async (req, res) => {
    try {
        console.log('Fetching states...');
        
        const data = await getCachedData('states', async () => {
            const { data, error } = await supabase
                .from('districts')
                .select('state_code, state_name')
                .order('state_name');
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            console.log('Raw data from Supabase:', data);
            
            // Get unique states
            const uniqueStates = [...new Map(
                data.map(item => [item.state_code, item])
            ).values()];
            
            console.log('Unique states:', uniqueStates);
            return uniqueStates;
        });
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ 
            error: 'Failed to fetch states',
            details: error.message 
        });
    }
});

// 2. Get districts by state
app.get('/api/districts/:stateCode', async (req, res) => {
    try {
        const { stateCode } = req.params;
        console.log('Fetching districts for state:', stateCode);
        
        const data = await getCachedData(`districts_${stateCode}`, async () => {
            const { data, error } = await supabase
                .from('districts')
                .select('district_code, district_name')
                .eq('state_code', stateCode)
                .order('district_name');
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            // Get unique districts
            const uniqueDistricts = [...new Map(
                data.map(item => [item.district_code, item])
            ).values()];
            
            return uniqueDistricts;
        });
        
        res.json(data);
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
        console.log('Fetching performance for district:', districtCode);
        
        // Current month
        const { data: currentData, error: currentError } = await supabase
            .from('districts')
            .select('*')
            .eq('district_code', districtCode)
            .order('month', { ascending: false })
            .limit(2);
        
        if (currentError) {
            console.error('Supabase error:', currentError);
            throw currentError;
        }
        
        if (!currentData || currentData.length === 0) {
            return res.status(404).json({ error: 'District not found' });
        }
        
        const current = currentData[0];
        const previous = currentData[1] || null;
        
        // State average
        const { data: stateData, error: stateError } = await supabase
            .from('districts')
            .select('avg_days_per_household')
            .eq('state_code', current.state_code)
            .eq('month', current.month);
        
        if (stateError) {
            console.error('State avg error:', stateError);
        }
        
        const stateAverage = stateData && stateData.length > 0
            ? stateData.reduce((sum, d) => sum + parseFloat(d.avg_days_per_household || 0), 0) / stateData.length
            : 0;
        
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
            stateAverage: parseFloat(stateAverage.toFixed(1)),
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
        const { data, error } = await supabase
            .from('districts')
            .select('id')
            .limit(1);
        
        if (error) throw error;
        
        res.json({ 
            status: 'healthy',
            database: 'connected',
            recordCount: data ? data.length : 0,
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

// Data sync
async function syncData() {
    console.log('Data sync completed (using existing Supabase data)');
    cache.clear();
}

cron.schedule('0 */6 * * *', syncData);
syncData();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Test health: http://localhost:${PORT}/health`);
    console.log(`✅ Test states: http://localhost:${PORT}/api/states`);
});
