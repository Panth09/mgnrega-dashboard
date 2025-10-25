import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertCircle, Users, Calendar, DollarSign, CheckCircle, 
  TrendingUp, TrendingDown, Volume2, Search, X, 
  Download, Share2, BarChart3, RefreshCw, Moon, Sun
} from 'lucide-react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [states, setStates] = useState([]);
  const [allDistricts, setAllDistricts] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [compareDistricts, setCompareDistricts] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [compareData, setCompareData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const reportRef = useRef(null);

  useEffect(() => {
    fetchStates();
    fetchAllDistricts();
  }, []);

  useEffect(() => {
    if (selectedState) {
      fetchDistricts(selectedState);
    }
  }, [selectedState]);

  useEffect(() => {
    if (selectedDistrict) {
      fetchPerformance(selectedDistrict);
    }
  }, [selectedDistrict]);

  const fetchStates = async () => {
    try {
      const response = await fetch(`${API_URL}/states`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setStates(data);
      }
    } catch (err) {
      setError('Failed to load states');
      console.error(err);
    }
  };

  const fetchAllDistricts = async () => {
    try {
      const response = await fetch(`${API_URL}/states`);
      const statesData = await response.json();
      
      const allDist = [];
      for (const state of statesData) {
        const distResponse = await fetch(`${API_URL}/districts/${state.state_code}`);
        const distData = await distResponse.json();
        distData.forEach(d => {
          allDist.push({
            ...d,
            state_name: state.state_name,
            state_code: state.state_code
          });
        });
      }
      setAllDistricts(allDist);
    } catch (err) {
      console.error('Failed to load all districts:', err);
    }
  };

  const fetchDistricts = async (stateCode) => {
    try {
      const response = await fetch(`${API_URL}/districts/${stateCode}`);
      const data = await response.json();
      setDistricts(data);
      setSelectedDistrict('');
      setPerformance(null);
    } catch (err) {
      setError('Failed to load districts');
      console.error(err);
    }
  };

  const fetchPerformance = async (districtCode) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/performance/${districtCode}`);
      const data = await response.json();
      setPerformance(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load performance data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
    if (term.length > 1) {
      setShowSearch(true);
    } else {
      setShowSearch(false);
    }
  };

  const selectSearchResult = (district) => {
    setSelectedState(district.state_code);
    setSelectedDistrict(district.district_code);
    setSearchTerm('');
    setShowSearch(false);
  };

  const addToCompare = (districtCode) => {
    if (compareDistricts.length < 3 && !compareDistricts.includes(districtCode)) {
      setCompareDistricts([...compareDistricts, districtCode]);
      fetchCompareData([...compareDistricts, districtCode]);
    }
  };

  const removeFromCompare = (districtCode) => {
    const updated = compareDistricts.filter(d => d !== districtCode);
    setCompareDistricts(updated);
    fetchCompareData(updated);
  };

  const fetchCompareData = async (districtCodes) => {
    const data = [];
    for (const code of districtCodes) {
      try {
        const response = await fetch(`${API_URL}/performance/${code}`);
        const perfData = await response.json();
        data.push(perfData);
      } catch (err) {
        console.error('Failed to fetch compare data:', err);
      }
    }
    setCompareData(data);
  };

  const shareOnWhatsApp = () => {
    if (!performance) return;
    
    const text = `🏛️ मनरेगा प्रदर्शन - ${performance.district.district_name}
    
👥 परिवारों को रोजगार: ${formatNumber(performance.district.total_households)}
📅 औसत काम के दिन: ${performance.district.avg_days_per_household?.toFixed(1)}
💰 खर्च: ${formatCurrency(performance.district.total_expenditure)}
✅ पूरे काम: ${formatNumber(performance.district.works_completed)}

महीना: ${performance.district.month}`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

 const downloadReport = () => {
  window.print();
};

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    return new Intl.NumberFormat('en-IN').format(num);
  };

  const formatCurrency = (num) => {
    if (!num) return '₹0';
    return '₹' + new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0
    }).format(num);
  };

  const filteredDistricts = allDistricts.filter(d =>
    d.district_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.state_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const MetricCard = ({ icon: Icon, title, value, subtitle, trend, audioText, color }) => (
    <div className="metric-card">
      <div className="metric-header">
        <div className={`metric-icon ${color}`}>
          <Icon size={32} strokeWidth={2} />
        </div>
        <button onClick={() => speakText(audioText)} className="audio-btn" title="सुनें">
          <Volume2 size={20} />
        </button>
      </div>
      
      <div className="metric-content">
        <p className="metric-title">{title}</p>
        <p className="metric-value">{value}</p>
        {subtitle && <p className="metric-subtitle">{subtitle}</p>}
        
        {trend !== undefined && trend !== null && (
          <div className={`metric-trend ${parseFloat(trend) >= 0 ? 'positive' : 'negative'}`}>
            {parseFloat(trend) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>{Math.abs(trend)}% पिछले महीने से</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header className="header">
        <div className="container header-content">
          <div>
            <h1>मनरेगा प्रदर्शन डैशबोर्ड</h1>
            <p>MGNREGA Performance Dashboard</p>
          </div>
          <div className="header-actions">
            <button onClick={() => setDarkMode(!darkMode)} className="icon-btn" title="Toggle Theme">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={() => window.location.reload()} className="icon-btn" title="Refresh">
              <RefreshCw size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Search Bar */}
        <div className="search-section">
          <div className="search-wrapper">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              placeholder="जिला खोजें / Search District (e.g., Sitapur)"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setShowSearch(false); }} className="clear-btn">
                <X size={16} />
              </button>
            )}
          </div>
          
          {showSearch && filteredDistricts.length > 0 && (
            <div className="search-results">
              {filteredDistricts.slice(0, 10).map((district) => (
                <div
                  key={district.district_code}
                  onClick={() => selectSearchResult(district)}
                  className="search-result-item"
                >
                  <strong>{district.district_name}</strong>
                  <span className="text-gray">{district.state_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Traditional Selectors */}
        <div className="location-selector">
          <h2>📍 या राज्य-जिला चुनें / Or Select State-District</h2>
          
          <div className="selector-grid">
            <div className="selector-group">
              <label>राज्य / State</label>
              <select
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  setSelectedDistrict('');
                  setPerformance(null);
                }}
              >
                <option value="">राज्य चुनें / Select State</option>
                {states.map((state) => (
                  <option key={state.state_code} value={state.state_code}>
                    {state.state_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="selector-group">
              <label>जिला / District</label>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                disabled={!selectedState}
              >
                <option value="">जिला चुनें / Select District</option>
                {districts.map((district) => (
                  <option key={district.district_code} value={district.district_code}>
                    {district.district_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>डेटा लोड हो रहा है...</p>
          </div>
        )}

        {performance && !loading && (
          <div ref={reportRef}>
            <div className="district-banner">
              <div>
                <h2>{performance.district.district_name}, {performance.district.state_name}</h2>
                <p>महीना: {performance.district.month} | अंतिम अपडेट: {lastUpdated.toLocaleString('hi-IN')}</p>
              </div>
              <div className="action-buttons">
                {compareDistricts.length < 3 && !compareDistricts.includes(selectedDistrict) && (
                  <button onClick={() => addToCompare(selectedDistrict)} className="btn-secondary">
                    <BarChart3 size={16} /> तुलना में जोड़ें
                  </button>
                )}
                <button onClick={shareOnWhatsApp} className="btn-success">
                  <Share2 size={16} /> WhatsApp शेयर
                </button>
                <button onClick={downloadReport} className="btn-primary">
                  <Download size={16} /> रिपोर्ट डाउनलोड
                </button>
              </div>
            </div>

            <div className="metrics-grid">
              <MetricCard
                icon={Users}
                title="परिवारों को रोजगार"
                value={formatNumber(performance.district.total_households)}
                subtitle="Families Employed"
                trend={performance.trends.households}
                audioText={`${performance.district.total_households} परिवारों को रोजगार मिला`}
                color="blue"
              />
              <MetricCard
                icon={Calendar}
                title="औसत काम के दिन"
                value={performance.district.avg_days_per_household?.toFixed(1)}
                subtitle="Average Work Days"
                trend={performance.trends.days}
                audioText={`औसत ${performance.district.avg_days_per_household?.toFixed(1)} दिन काम मिला`}
                color="green"
              />
              <MetricCard
                icon={DollarSign}
                title="खर्च की गई राशि"
                value={formatCurrency(performance.district.total_expenditure)}
                subtitle="Total Expenditure"
                trend={performance.trends.expenditure}
                audioText={`कुल ${performance.district.total_expenditure} रुपये खर्च हुए`}
                color="purple"
              />
              <MetricCard
                icon={CheckCircle}
                title="पूरे हुए काम"
                value={formatNumber(performance.district.works_completed)}
                subtitle="Completed Works"
                trend={performance.trends.works}
                audioText={`${performance.district.works_completed} काम पूरे हुए`}
                color="orange"
              />
            </div>

            <div className="comparison-section">
              <h3>📊 राज्य औसत से तुलना</h3>
              <div className="bar-group">
                <div className="bar-label">
                  <span>आपका जिला</span>
                  <span className="bar-value">{performance.district.avg_days_per_household?.toFixed(1)} दिन</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill blue" style={{ width: `${Math.min(performance.district.avg_days_per_household * 3.33, 100)}%` }}></div>
                </div>
              </div>
              <div className="bar-group">
                <div className="bar-label">
                  <span>राज्य औसत</span>
                  <span className="bar-value">{performance.stateAverage} दिन</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill green" style={{ width: `${Math.min(performance.stateAverage * 3.33, 100)}%` }}></div>
                </div>
              </div>
              {performance.district.avg_days_per_household > performance.stateAverage ? (
                <p className="comparison-result positive">✅ आपका जिला राज्य औसत से बेहतर प्रदर्शन कर रहा है!</p>
              ) : (
                <p className="comparison-result neutral">📈 सुधार की गुंजाइश है</p>
              )}
            </div>
          </div>
        )}

        {/* Compare Districts Section */}
        {compareData.length > 0 && (
          <div className="compare-section">
            <h2>🔄 जिलों की तुलना / Compare Districts</h2>
            <div className="compare-grid">
              {compareData.map((data, idx) => (
                <div key={idx} className="compare-card">
                  <div className="compare-header">
                    <h3>{data.district.district_name}</h3>
                    <button onClick={() => removeFromCompare(data.district.district_code)} className="remove-btn">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="compare-stats">
                    <div className="compare-stat">
                      <Users size={20} />
                      <span>{formatNumber(data.district.total_households)}</span>
                    </div>
                    <div className="compare-stat">
                      <Calendar size={20} />
                      <span>{data.district.avg_days_per_household?.toFixed(1)} दिन</span>
                    </div>
                    <div className="compare-stat">
                      <DollarSign size={20} />
                      <span>{formatCurrency(data.district.total_expenditure)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedDistrict && !loading && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>अपना जिला खोजें या चुनें</h3>
            <p>ऊपर सर्च बॉक्स में जिला का नाम लिखें या राज्य-जिला चुनें</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>डेटा स्रोत: data.gov.in | अंतिम अपडेट: {lastUpdated.toLocaleTimeString('hi-IN')}</p>
      </footer>
    </div>
  );
}

export default App;