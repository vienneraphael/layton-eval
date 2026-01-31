// Constants
const SPLITS = {
    llm: {
        results: 'benchmark_results/results_llm.jsonl',
        ppi: 'ppi/ppi_llm.jsonl',
        metadata: 'datasets/layton_eval_llm.jsonl'
    },
    vlm: {
        results: 'benchmark_results/results_vlm.jsonl',
        ppi: 'ppi/ppi_vlm.jsonl',
        metadata: 'datasets/layton_eval_vlm.jsonl'
    }
};

const PROVIDER_COLORS = {
    'openai': '#10a37f',
    'anthropic': '#f4a261',
    'google': '#4dabf7',
    'gemini': '#4dabf7',
    'mistral': '#fcd53f',
    'meta': '#0668E1',
    'together': '#0055ff',
    'default': '#6b7280'
};

// State
const state = {
    currentSplit: 'llm',
    cache: {
        llm: { judges: [] },
        vlm: { judges: [] }
    },
    activeTab: 'leaderboard',
    selectedRiddleId: null,
    filters: {
        categories: new Set(['all']),
        picarats: new Set(['all']),
        successRates: new Set(['all'])
    }
};

let categorySelect = null;
let picaratsSelect = null;
let successRateSelect = null;

// DOM Elements
const elements = {
    splitSelect: document.getElementById('split-select'),
    tabs: document.querySelectorAll('.nav-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    leaderboardBody: document.querySelector('#leaderboard-table tbody'),
    rankChart: document.getElementById('rank-chart'),
    riddleGrid: document.getElementById('riddle-grid'),
    riddleSearch: document.getElementById('riddle-search'),
    modal: document.getElementById('riddle-modal'),
    modalBody: document.getElementById('modal-body'),
    closeModal: document.querySelector('.close-modal')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadSplit('llm'); // Load default
});

class MultiSelect {
    constructor(containerId, placeholder, onChange) {
        this.container = document.getElementById(containerId);
        this.placeholder = placeholder;
        this.onChange = onChange;
        this.selectedValues = new Set(['all']);
        this.optionsMap = new Map();
        
        if (!this.container) return;

        this.trigger = this.container.querySelector('.multiselect-trigger');
        this.dropdown = this.container.querySelector('.multiselect-dropdown');
        this.triggerSpan = this.trigger.querySelector('span'); // First span

        this.initEvents();
    }

    initEvents() {
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.close();
            }
        });
    }

    toggle() {
        // Close others
        document.querySelectorAll('.multiselect-dropdown').forEach(d => {
            if (d !== this.dropdown) d.classList.remove('show');
        });
        document.querySelectorAll('.multiselect-trigger').forEach(t => {
            if (t !== this.trigger) t.classList.remove('active');
        });

        this.dropdown.classList.toggle('show');
        this.trigger.classList.toggle('active');
    }

    close() {
        this.dropdown.classList.remove('show');
        this.trigger.classList.remove('active');
    }

    setOptions(options) {
        this.optionsMap = new Map(options.map(o => [String(o.value), o.label]));
        this.dropdown.innerHTML = '';
        
        // Header with Clear button
        const header = document.createElement('div');
        header.className = 'multiselect-header';
        header.innerHTML = `
            <span>Select ${this.placeholder}</span>
            <button class="btn-clear">Clear</button>
        `;
        header.querySelector('.btn-clear').onclick = (e) => {
            e.stopPropagation();
            this.selectAll();
        };
        this.dropdown.appendChild(header);

        // All Option
        this.addOption('all', `All ${this.placeholder}`);

        // Other Options
        options.forEach(opt => {
            this.addOption(opt.value, opt.label);
        });
        
        this.updateTrigger();
    }

    addOption(value, label) {
        const div = document.createElement('div');
        div.className = 'multiselect-option';
        const strValue = String(value);
        
        div.innerHTML = `
            <input type="checkbox" value="${strValue}" ${this.selectedValues.has(strValue) ? 'checked' : ''}>
            <span>${label}</span>
        `;
        
        const checkbox = div.querySelector('input');
        
        div.onclick = (e) => {
            e.stopPropagation();
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                this.handleSelection(strValue, checkbox.checked);
            }
        };

        checkbox.onclick = (e) => {
            e.stopPropagation();
            this.handleSelection(strValue, checkbox.checked);
        };

        this.dropdown.appendChild(div);
    }

    handleSelection(value, isChecked) {
        if (value === 'all') {
            if (isChecked) {
                this.selectAll();
            } else {
                // If unchecking all, we should technically check everything else or empty?
                // Standard behavior: 'All' is a special state.
                // If user unchecks 'All', effectively nothing is selected -> usually show everything or nothing.
                // Let's force it to stay checked if it was the only one?
                // Or let's just re-select it if size is 0.
                this.selectedValues.clear();
                this.selectedValues.add('all');
            }
        } else {
            if (isChecked) {
                this.selectedValues.delete('all');
                this.selectedValues.add(value);
            } else {
                this.selectedValues.delete(value);
                if (this.selectedValues.size === 0) {
                    this.selectedValues.add('all');
                }
            }
        }
        this.renderOptionsState();
        this.updateTrigger();
        if (this.onChange) this.onChange(this.selectedValues);
    }

    selectAll() {
        this.selectedValues.clear();
        this.selectedValues.add('all');
        this.renderOptionsState();
        this.updateTrigger();
        if (this.onChange) this.onChange(this.selectedValues);
    }

    renderOptionsState() {
        const checkboxes = this.dropdown.querySelectorAll('input');
        checkboxes.forEach(cb => {
            cb.checked = this.selectedValues.has(cb.value);
        });
    }

    updateTrigger() {
        if (this.selectedValues.has('all')) {
            this.triggerSpan.textContent = `All ${this.placeholder}`;
        } else {
            const count = this.selectedValues.size;
            if (count === 1) {
                const val = Array.from(this.selectedValues)[0];
                this.triggerSpan.textContent = this.optionsMap.get(val) || val;
            } else {
                this.triggerSpan.textContent = `${count} ${this.placeholder}`;
            }
        }
    }
}

function initEventListeners() {
    // Split Selector
    elements.splitSelect.addEventListener('change', (e) => {
        loadSplit(e.target.value);
    });

    // Tabs
    elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Riddle Search
    elements.riddleSearch.addEventListener('input', () => filterRiddleGrid());
    
    // Filters - Init MultiSelects
    categorySelect = new MultiSelect('category-filter-container', 'Categories', (selected) => {
        state.filters.categories = new Set(selected);
        filterRiddleGrid();
    });
    
    picaratsSelect = new MultiSelect('picarats-filter-container', 'Picarats', (selected) => {
        state.filters.picarats = new Set(selected);
        filterRiddleGrid();
    });

    successRateSelect = new MultiSelect('success-filter-container', 'Success Rates', (selected) => {
        state.filters.successRates = new Set(selected);
        filterRiddleGrid();
    });

    // Modal Events
    elements.closeModal.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
            closeModal();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.modal.style.display === 'block') {
            closeModal();
        }
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Update buttons
    elements.tabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panes
    elements.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    // Trigger render if needed (e.g. chart resize)
    if (tabId === 'leaderboard') {
        renderLeaderboard(); // Re-render to ensure chart size is correct
    }
}

async function loadSplit(split) {
    state.currentSplit = split;
    
    // Check cache
    if (state.cache[split].loaded) {
        onDataLoaded();
        return;
    }

    const config = SPLITS[split];
    if (!config) {
        console.error(`No configuration found for split: ${split}`);
        return;
    }
    
    try {
        console.log(`Loading data for split: ${split}...`);
        
        // Load all data in parallel for better performance
        const [results, metadata, ppi] = await Promise.all([
            loadJSONL(config.results),
            loadJSONL(config.metadata),
            loadJSONL(config.ppi)
        ]);

        state.cache[split].results = results;
        
        // Build model-to-provider map
        state.cache[split].modelProviders = new Map(results.map(r => [r.model, r.provider]));
        
        // Index Metadata by ID
        state.cache[split].riddles = new Map(metadata.map(r => [r.id, r]));
        
        state.cache[split].ppi = ppi;
        
        // Identify all judges for this split
        const judges = new Set();
        ppi.forEach(p => {
            Object.keys(p).forEach(k => {
                if (k.startsWith('both_correct_')) {
                    judges.add(k.replace('both_correct_', ''));
                }
            });
        });
        state.cache[split].judges = Array.from(judges).sort();

        state.cache[split].loaded = true;
        
        console.log(`Successfully loaded ${results.length} results, ${metadata.length} riddles, and ${ppi.length} predictions.`);
        
        onDataLoaded();

    } catch (e) {
        console.error("Failed to load data for split " + split, e);
        if (split !== 'llm') {
             alert(`Data for ${split} split not found or incomplete. Check console.`);
        }
    }
}

async function loadJSONL(url) {
    try {
        console.log(`Fetching: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        const lines = text.trim().split('\n');
        console.log(`Received ${lines.length} lines from ${url}`);
        
        return lines
            .filter(line => line.trim())
            .map((line, index) => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    if (index === 0) {
                        console.warn(`Potential JSON parse error on first line of ${url}. Check for BOM or encoding issues.`, e);
                    }
                    return null;
                }
            })
            .filter(item => item !== null);
    } catch (e) {
        console.warn(`Could not load ${url}. Error:`, e);
        return []; // Return empty array on failure
    }
}

function onDataLoaded() {
    renderLeaderboard();
    populateRiddleList();
}

// --- Leaderboard Logic ---

function renderLeaderboard() {
    const data = state.cache[state.currentSplit].results;
    if (!data) return;

    // Clear table
    elements.leaderboardBody.innerHTML = '';

    // Render Rows
    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Rank
        const tdRank = document.createElement('td');
        tdRank.textContent = row.rank;
        tr.appendChild(tdRank);

        // Model
        const tdModel = document.createElement('td');
        tdModel.textContent = row.model;
        if (row.provider) {
            // Optional: Add provider badge or color
        }
        tr.appendChild(tdModel);

        // Score
        const tdScore = document.createElement('td');
        tdScore.textContent = row.score.toFixed(1);
        tr.appendChild(tdScore);

        // CI
        const tdCI = document.createElement('td');
        tdCI.textContent = `±${row['95% CI (±)']}`;
        tr.appendChild(tdCI);

        // Rank Spread
        const tdSpread = document.createElement('td');
        tdSpread.className = 'mobile-hide';
        // Format: "1 <--> 2" -> "[1] ⟷ [2]"
        const spreadParts = row.rank_spread.split('<-->').map(s => s.trim());
        if (spreadParts.length === 2) {
            tdSpread.innerHTML = `<span class="rank-spread-arrow">[${spreadParts[0]}] ⟷ [${spreadParts[1]}]</span>`;
        } else {
            tdSpread.textContent = row.rank_spread;
        }
        tr.appendChild(tdSpread);

        // Provider
        const tdProvider = document.createElement('td');
        tdProvider.className = 'mobile-hide';
        tdProvider.textContent = row.provider || '-';
        tr.appendChild(tdProvider);

        elements.leaderboardBody.appendChild(tr);
    });

    // Render Chart
    renderRankChart(data);
}

function renderRankChart(data) {
    const container = elements.rankChart;
    container.innerHTML = '';

    const width = Math.max(600, container.clientWidth || 800);
    const modelHeight = 30; // pixels per model
    const height = Math.max(400, data.length * modelHeight + 150); // Dynamic height
    const padding = { top: 40, right: 60, bottom: 60, left: 200 }; // Increased left padding for model names
    
    // Detect Score Range (0-1 or 0-100)
    let maxScore = 100;
    const allScoresSmall = data.every(d => d.score <= 1);
    if (allScoresSmall) maxScore = 1;

    // Calculate dynamic Score range
    let minDataScore = maxScore;
    let maxDataScore = 0;
    
    data.forEach(d => {
        const ci = d['95% CI (±)'];
        const low = d.score - ci;
        const high = d.score + ci;
        if (low < minDataScore) minDataScore = low;
        if (high > maxDataScore) maxDataScore = high;
    });

    const paddingVal = allScoresSmall ? 0.01 : 1;
    let axisMin = Math.max(0, minDataScore - paddingVal);
    let axisMax = Math.min(maxScore, maxDataScore + paddingVal);

    if (axisMin >= axisMax) {
        axisMin = 0;
        axisMax = maxScore;
    }

    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.left - padding.right;
    
    // SVG
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    
    // X Scale function (Score)
    const xScale = (score) => {
        return padding.left + ((score - axisMin) / (axisMax - axisMin)) * chartWidth;
    };

    // Y Scale function (Model Index)
    const yScale = (index) => {
        const step = chartHeight / data.length;
        return padding.top + step * index + step / 2;
    };

    // Draw Grid Lines (Vertical - Score Ticks)
    const tickCount = 10;
    for (let i = 0; i <= tickCount; i++) {
        const val = axisMin + (i / tickCount) * (axisMax - axisMin);
        const x = xScale(val);
        
        // Grid Line
        const gridLine = document.createElementNS(svgNS, "line");
        gridLine.setAttribute("x1", x);
        gridLine.setAttribute("y1", padding.top);
        gridLine.setAttribute("x2", x);
        gridLine.setAttribute("y2", height - padding.bottom);
        gridLine.setAttribute("stroke", "var(--border-color)");
        gridLine.setAttribute("stroke-opacity", "0.3");
        svg.appendChild(gridLine);

        // Label (Bottom)
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", x);
        text.setAttribute("y", height - padding.bottom + 20);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "var(--text-muted)");
        text.setAttribute("font-size", "11px");
        text.textContent = val.toFixed(allScoresSmall ? 2 : 0);
        svg.appendChild(text);

        // Label (Top - optional)
        const textTop = text.cloneNode(true);
        textTop.setAttribute("y", padding.top - 10);
        svg.appendChild(textTop);
    }

    // Draw Grid Lines (Horizontal) - Model Ticks
    data.forEach((_, index) => {
        const y = yScale(index);
        
        const gridLine = document.createElementNS(svgNS, "line");
        gridLine.setAttribute("x1", padding.left);
        gridLine.setAttribute("y1", y);
        gridLine.setAttribute("x2", width - padding.right);
        gridLine.setAttribute("y2", y);
        gridLine.setAttribute("stroke", "var(--border-color)");
        gridLine.setAttribute("stroke-opacity", "0.2");
        svg.appendChild(gridLine);
    });

    // Draw Data Points
    data.forEach((row, index) => {
        const y = yScale(index);
        const score = row.score;
        const ci = row['95% CI (±)'];
        const color = PROVIDER_COLORS[row.provider] || PROVIDER_COLORS['default'];

        const xScore = xScale(score);
        const xLow = xScale(score - ci);
        const xHigh = xScale(score + ci);

        const g = document.createElementNS(svgNS, "g");

        // Rank Spread Text
        let rankSpreadText = row.rank_spread;
        const spreadParts = row.rank_spread.split('<-->').map(s => s.trim());
        if (spreadParts.length === 2) {
            if (spreadParts[0] === spreadParts[1]) {
                rankSpreadText = spreadParts[0];
            } else {
                rankSpreadText = `${spreadParts[0]}-${spreadParts[1]}`;
            }
        }

        // Horizontal CI Line
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", xLow);
        line.setAttribute("y1", y);
        line.setAttribute("x2", xHigh);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        line.setAttribute("opacity", "0.6");
        g.appendChild(line);

        // Caps
        const capHeight = 10;
        
        // Left Cap
        const cap1 = document.createElementNS(svgNS, "line");
        cap1.setAttribute("x1", xLow);
        cap1.setAttribute("y1", y - capHeight/2);
        cap1.setAttribute("x2", xLow);
        cap1.setAttribute("y2", y + capHeight/2);
        cap1.setAttribute("stroke", color);
        cap1.setAttribute("stroke-width", "2");
        g.appendChild(cap1);

        // Right Cap
        const cap2 = document.createElementNS(svgNS, "line");
        cap2.setAttribute("x1", xHigh);
        cap2.setAttribute("y1", y - capHeight/2);
        cap2.setAttribute("x2", xHigh);
        cap2.setAttribute("y2", y + capHeight/2);
        cap2.setAttribute("stroke", color);
        cap2.setAttribute("stroke-width", "2");
        g.appendChild(cap2);

        // Score Point
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", xScore);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", "var(--bg-surface)");
        circle.setAttribute("stroke", color);
        circle.setAttribute("stroke-width", "2");
        g.appendChild(circle);

        // Rank Spread Label (Above the line)
        const spreadLabel = document.createElementNS(svgNS, "text");
        spreadLabel.setAttribute("x", xHigh + 10);
        spreadLabel.setAttribute("y", y + 4);
        spreadLabel.setAttribute("text-anchor", "start");
        spreadLabel.setAttribute("fill", "var(--text-muted)");
        spreadLabel.setAttribute("font-size", "10px");
        spreadLabel.textContent = `[${rankSpreadText}]`;
        g.appendChild(spreadLabel);

        // Model Name Label (Horizontal on Y-Axis)
        const nameLabel = document.createElementNS(svgNS, "text");
        nameLabel.setAttribute("x", padding.left - 15);
        nameLabel.setAttribute("y", y + 4);
        nameLabel.setAttribute("text-anchor", "end");
        nameLabel.setAttribute("fill", color);
        nameLabel.setAttribute("font-size", "12px");
        nameLabel.setAttribute("font-weight", "500");
        nameLabel.textContent = row.model;
        g.appendChild(nameLabel);

        svg.appendChild(g);
    });

    container.appendChild(svg);
}

// --- Visualizer Logic ---

function populateFilters(riddles) {
    const categories = new Set();
    const picarats = new Set();
    
    // We'll define fixed buckets for success rate
    const successBuckets = [
        { value: 'very_high', label: 'Very High (80-100%)', min: 80 },
        { value: 'high', label: 'High (60-80%)', min: 60 },
        { value: 'medium', label: 'Medium (40-60%)', min: 40 },
        { value: 'low', label: 'Low (20-40%)', min: 20 },
        { value: 'very_low', label: 'Very Low (0-20%)', min: 0 },
        { value: 'unknown', label: 'Unknown', min: -1 }
    ];

    riddles.forEach(r => {
        if (r.category) categories.add(r.category);
        if (r.picarats !== undefined && r.picarats !== null) picarats.add(r.picarats);
    });

    // Populate Category
    if (categorySelect) {
        const catOptions = Array.from(categories).sort().map(cat => ({
            value: cat,
            label: cat
        }));
        categorySelect.setOptions(catOptions);
    }

    // Populate Picarats
    if (picaratsSelect) {
        const picOptions = Array.from(picarats).sort((a, b) => a - b).map(pic => ({
            value: pic,
            label: pic === 0 ? '?' : String(pic)
        }));
        picaratsSelect.setOptions(picOptions);
    }

    // Populate Success Rate
    if (successRateSelect) {
        successRateSelect.setOptions(successBuckets);
    }
}

function calculateRiddleStats(riddles, ppi) {
    if (!ppi) return;
    
    const predictionsByRiddle = new Map();
    ppi.forEach(p => {
        if (!predictionsByRiddle.has(p.riddle_id)) {
            predictionsByRiddle.set(p.riddle_id, []);
        }
        predictionsByRiddle.get(p.riddle_id).push(p);
    });

    riddles.forEach(r => {
        const preds = predictionsByRiddle.get(r.id) || [];
        if (preds.length === 0) {
            r.successRate = null;
            return;
        }

        let totalScore = 0;
        let validPreds = 0;

        preds.forEach(p => {
            let judgeScoreSum = 0;
            let judgeCount = 0;

            // Prioritize human judge if exists
            if (p.human_both_correct !== null && p.human_both_correct !== undefined) {
                totalScore += p.human_both_correct ? 1 : 0;
                validPreds++;
                return; 
            }

            // Otherwise average available automated judges
            Object.keys(p).forEach(k => {
                if (k.startsWith('both_correct_') && p[k] !== null) {
                    judgeScoreSum += p[k] ? 1 : 0;
                    judgeCount++;
                }
            });

            if (judgeCount > 0) {
                totalScore += judgeScoreSum / judgeCount;
                validPreds++;
            }
        });

        if (validPreds > 0) {
            r.successRate = (totalScore / validPreds) * 100;
        } else {
            r.successRate = null;
        }
    });
}

function populateRiddleList() {
    // Legacy function name kept for compatibility with loadSplit calling onDataLoaded
    // But now it populates the grid
    const splitData = state.cache[state.currentSplit];
    const riddlesMap = splitData.riddles;
    if (!riddlesMap) return;

    // Get valid riddle IDs for this split from PPI
    const validRiddleIds = new Set();
    if (splitData.ppi) {
        splitData.ppi.forEach(p => validRiddleIds.add(p.riddle_id));
    }

    const grid = elements.riddleGrid;
    grid.innerHTML = '';

    // Convert to array, filter by valid IDs, and sort
    const riddles = Array.from(riddlesMap.values())
        .filter(r => validRiddleIds.has(r.id))
        .filter(r => r.split === state.currentSplit)
        .sort((a, b) => a.id.localeCompare(b.id));

    // Calculate Stats
    calculateRiddleStats(riddles, splitData.ppi);

    populateFilters(riddles);

    riddles.forEach(r => {
        const card = createRiddleCard(r);
        grid.appendChild(card);
    });
    
    // Apply initial filter in case of reload/split change keeping search
    filterRiddleGrid();
}

function createRiddleCard(riddle) {
    const card = document.createElement('div');
    card.className = 'riddle-card';
    card.dataset.id = riddle.id;
    card.dataset.category = riddle.category || 'Unknown';
    card.dataset.picarats = riddle.picarats !== undefined ? riddle.picarats : 'Unknown';
    
    // Dataset for success rate
    card.dataset.successRate = riddle.successRate !== null ? riddle.successRate : -1;

    // Combine all textual fields for search
    const searchTerms = [
        riddle.id,
        getRiddleTitle(riddle),
        riddle.category,
        riddle.description,
        riddle.first_hint,
        riddle.second_hint,
        riddle.third_hint,
        riddle.special_hint,
        riddle.solution,
        riddle.answer
    ].filter(Boolean).join(' ').toLowerCase();

    card.dataset.search = searchTerms;
    
    card.onclick = () => openModal(riddle.id);

    // ID
    const idSpan = document.createElement('div');
    idSpan.className = 'card-id';
    idSpan.textContent = riddle.id;
    card.appendChild(idSpan);

    // Title
    const title = document.createElement('h3');
    title.textContent = getRiddleTitle(riddle);
    card.appendChild(title);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    
    // Format Picarats display
    const picaratsDisplay = (riddle.picarats === 0 || riddle.picarats === undefined || riddle.picarats === null) 
        ? '?' 
        : riddle.picarats;

    // Format Success Rate
    let successBadge = '';
    if (riddle.successRate !== null && riddle.successRate !== undefined) {
        const rate = Math.round(riddle.successRate);
        let colorClass = 'rate-medium';
        if (rate >= 80) colorClass = 'rate-very-high';
        else if (rate >= 60) colorClass = 'rate-high';
        else if (rate >= 40) colorClass = 'rate-medium';
        else if (rate >= 20) colorClass = 'rate-low';
        else colorClass = 'rate-very-low';
        
        successBadge = `<span class="badge badge-success ${colorClass}">${rate}% Good</span>`;
    }

    meta.innerHTML = `
        <span class="badge badge-category">${riddle.category || 'Unknown'}</span>
        <span class="badge">${picaratsDisplay} Picarats</span>
        ${successBadge}
    `;
    card.appendChild(meta);

    return card;
}

function getRiddleTitle(riddle) {
    let title = `Riddle ${riddle.id}`;
    if (riddle.url && riddle.url.includes('Puzzle:')) {
        try {
            const parts = riddle.url.split('Puzzle:');
            if (parts.length > 1) {
                // Decode and replace underscores
                title = decodeURIComponent(parts[1]).replace(/_/g, ' ');
            }
        } catch (e) {
            console.warn('Failed to parse title', e);
        }
    }
    return title;
}

function getProviderFromModelName(modelName, modelProviders) {
    if (modelProviders && modelProviders.has(modelName)) {
        return modelProviders.get(modelName);
    }
    
    const name = modelName.toLowerCase();
    if (name.includes('gpt') || name.includes('openai') || name.includes('o1') || name.includes('o3')) return 'openai';
    if (name.includes('claude') || name.includes('anthropic')) return 'anthropic';
    if (name.includes('gemini') || name.includes('google')) return 'gemini';
    if (name.includes('mistral') || name.includes('mixtral')) return 'mistral';
    if (name.includes('llama') || name.includes('meta')) return 'meta';
    if (name.includes('qwen')) return 'together';
    return 'default';
}

function filterRiddleGrid() {
    const query = elements.riddleSearch.value.toLowerCase();
    const selectedCats = state.filters.categories;
    const selectedPics = state.filters.picarats;
    const selectedRates = state.filters.successRates;

    const cards = elements.riddleGrid.getElementsByClassName('riddle-card');
    
    for (let card of cards) {
        const matchesSearch = !query || card.dataset.search.includes(query);
        
        const cat = card.dataset.category;
        const pic = card.dataset.picarats; // String
        const rate = parseFloat(card.dataset.successRate);
        
        const matchesCat = selectedCats.has('all') || selectedCats.has(cat);
        const matchesPic = selectedPics.has('all') || selectedPics.has(pic);
        
        let matchesRate = selectedRates.has('all');
        if (!matchesRate) {
            // Check against selected buckets
            if (selectedRates.has('unknown') && rate === -1) matchesRate = true;
            if (selectedRates.has('very_high') && rate >= 80) matchesRate = true;
            if (selectedRates.has('high') && rate >= 60 && rate < 80) matchesRate = true;
            if (selectedRates.has('medium') && rate >= 40 && rate < 60) matchesRate = true;
            if (selectedRates.has('low') && rate >= 20 && rate < 40) matchesRate = true;
            if (selectedRates.has('very_low') && rate >= 0 && rate < 20) matchesRate = true;
        }
        
        card.style.display = (matchesSearch && matchesCat && matchesPic && matchesRate) ? 'flex' : 'none';
    }
}

function openModal(riddleId) {
    state.selectedRiddleId = riddleId;
    renderRiddleDetail(riddleId);
    elements.modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeModal() {
    elements.modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    state.selectedRiddleId = null;
}

function renderRiddleDetail(riddleId) {
    const splitData = state.cache[state.currentSplit];
    const riddle = splitData.riddles.get(riddleId);
    
    // Get all predictions for this riddle
    const predictions = splitData.ppi.filter(p => p.riddle_id === riddleId);

    const container = elements.modalBody;
    container.innerHTML = '';
    
    // Add class for styling reuse
    container.className = 'riddle-detail';

    if (!riddle) {
        container.innerHTML = '<div class="empty-state">Riddle not found</div>';
        return;
    }

    // Header
    const h2 = document.createElement('h2');
    h2.textContent = getRiddleTitle(riddle);
    h2.className = 'riddle-title';
    container.appendChild(h2);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'riddle-meta';
    
    // Format Picarats display
    const picaratsDisplay = (riddle.picarats === 0 || riddle.picarats === undefined || riddle.picarats === null) 
        ? '?' 
        : riddle.picarats;

    meta.innerHTML = `
        <a href="${riddle.url}" target="_blank" class="btn-wiki">See in Wiki ↗</a>
        <span class="badge badge-category">Category: ${riddle.category || 'Unknown'}</span>
        <span class="badge">Picarats: ${picaratsDisplay}</span>
    `;
    container.appendChild(meta);

    // Problem Card (Image + Description)
    const problemCard = document.createElement('div');
    problemCard.className = 'riddle-content';

    const problemHeader = document.createElement('h3');
    problemHeader.textContent = "Problem Statement";
    problemHeader.className = 'riddle-section-header';
    problemCard.appendChild(problemHeader);

    // Image
    if (riddle.img) {
        const imgContainer = document.createElement('div');
        imgContainer.style.textAlign = 'center';
        imgContainer.style.marginBottom = '1.5rem';
        imgContainer.style.backgroundColor = 'var(--bg-body)';
        imgContainer.style.borderRadius = '8px';
        imgContainer.style.padding = '1rem';
        imgContainer.style.border = '1px solid var(--border-color)';

        const img = document.createElement('img');
        img.src = `data:image/jpeg;base64,${riddle.img}`;
        img.className = 'riddle-image';
        img.loading = 'lazy';
        img.style.marginBottom = '0'; // Reset margin
        
        imgContainer.appendChild(img);
        problemCard.appendChild(imgContainer);
    }

    // Description Text (Markdown)
    const descText = document.createElement('div');
    descText.className = 'riddle-description-text markdown-content';
    descText.innerHTML = marked.parse(riddle.description || '');
    problemCard.appendChild(descText);

    container.appendChild(problemCard);

    // --- Solution & Ground Truth Section ---
    const solutionCard = document.createElement('div');
    solutionCard.className = 'riddle-content solution-section';

    const solutionHeader = document.createElement('h3');
    solutionHeader.textContent = "Solution & Ground Truth";
    solutionHeader.className = 'riddle-section-header solution-header';
    solutionCard.appendChild(solutionHeader);

    // Ground Truth Answer
    const gtBox = document.createElement('div');
    gtBox.className = 'ground-truth-box';
    gtBox.innerHTML = `
        <span class="ground-truth-label">Ground Truth Answer</span>
        <div class="markdown-content">${marked.parse(riddle.answer || '')}</div>
    `;
    solutionCard.appendChild(gtBox);

    // Solution Text (Official)
    if (riddle.solution) {
        const solDiv = document.createElement('div');
        solDiv.style.marginBottom = '1.5rem';
        solDiv.innerHTML = `
            <span class="ground-truth-label">Official Solution</span>
            <div class="markdown-content">${marked.parse(riddle.solution)}</div>
        `;
        solutionCard.appendChild(solDiv);
    }

    // Proposed Justification
    if (riddle.justification) {
        const justDiv = document.createElement('details');
        justDiv.innerHTML = `
            <summary style="cursor:pointer; color:var(--text-muted); font-weight:500;">Show Proposed Justification (Generated)</summary>
            <div style="margin-top:1rem; padding-left:1rem; border-left:2px solid var(--accent-green);" class="markdown-content">
                ${marked.parse(riddle.justification)}
            </div>
        `;
        solutionCard.appendChild(justDiv);
    }

    container.appendChild(solutionCard);


    // Hints
    const hintsSection = document.createElement('div');
    hintsSection.className = 'hints-section';
    
    const hints = [
        { id: 'hint1', label: 'First Hint', text: riddle.first_hint },
        { id: 'hint2', label: 'Second Hint', text: riddle.second_hint },
        { id: 'hint3', label: 'Third Hint', text: riddle.third_hint },
        { id: 'hintS', label: 'Special Hint', text: riddle.special_hint }
    ].filter(h => h.text);

    if (hints.length > 0) {
        // Tab Headers
        const tabHeader = document.createElement('div');
        tabHeader.className = 'hints-tabs';
        
        // Content Container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'hints-content-container';

        hints.forEach((h, index) => {
            // Button
            const btn = document.createElement('button');
            btn.className = `hint-tab-btn ${index === 0 ? 'active' : ''}`;
            btn.textContent = h.label;
            
            // Pane
            const pane = document.createElement('div');
            pane.id = `pane-${h.id}`; // Unique ID within modal
            pane.className = `hint-tab-pane markdown-content ${index === 0 ? 'active' : ''}`;
            pane.innerHTML = marked.parse(h.text || ''); // Render hints as markdown too
            contentContainer.appendChild(pane);

            // Click Handler
            btn.onclick = () => {
                // Deactivate all
                tabHeader.querySelectorAll('.hint-tab-btn').forEach(b => b.classList.remove('active'));
                contentContainer.querySelectorAll('.hint-tab-pane').forEach(p => p.classList.remove('active'));
                
                // Activate clicked
                btn.classList.add('active');
                pane.classList.add('active');
            };
            
            tabHeader.appendChild(btn);
        });

        hintsSection.appendChild(tabHeader);
        hintsSection.appendChild(contentContainer);
        container.appendChild(hintsSection);
    }

    // Recap Table
    if (predictions.length > 0) {
        const recapContainer = document.createElement('div');
        recapContainer.className = 'recap-table-container';
        
        const table = document.createElement('table');
        table.className = 'recap-table';
        
        // Use pre-identified judges for this split
        const sortedJudges = splitData.judges || [];
        
        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        const thModel = document.createElement('th');
        thModel.textContent = 'Model';
        headerRow.appendChild(thModel);
        
        const thOverall = document.createElement('th');
        thOverall.textContent = 'Overall';
        headerRow.appendChild(thOverall);
        
        // Up to 4 judges as per TODO, but let's be flexible while following the requirement
        sortedJudges.forEach((j, i) => {
            const th = document.createElement('th');
            // Show shortened judge name or J1, J2...
            th.textContent = `J${i+1}`;
            th.title = j; // Full name on hover
            
            // Color based on provider
            const provider = getProviderFromModelName(j, splitData.modelProviders);
            th.style.color = PROVIDER_COLORS[provider] || PROVIDER_COLORS['default'];
            th.style.fontWeight = '700';
            
            headerRow.appendChild(th);
        });
        
        // Fill up to 4 if needed? The TODO says "the 4 judges". 
        // If there are fewer than 4, should I add empty columns?
        // If there are more, should I show them all?
        // I'll show what's there, but ensure we don't exceed 4 if that's a strict UI constraint.
        // Actually, let's just show all available judges found in the data.
        
        const thHuman = document.createElement('th');
        thHuman.textContent = 'Human';
        headerRow.appendChild(thHuman);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = document.createElement('tbody');
        predictions.forEach(pred => {
            const tr = document.createElement('tr');
            
            // Model
            const tdModel = document.createElement('td');
            tdModel.className = 'model-name-cell';
            tdModel.textContent = pred.model;
            tdModel.style.color = PROVIDER_COLORS[pred.provider] || 'inherit';
            tr.appendChild(tdModel);
            
            // Overall
            const tdOverall = document.createElement('td');
            let overallScore = 0;
            let valid = false;
            if (pred.human_both_correct !== null && pred.human_both_correct !== undefined) {
                overallScore = pred.human_both_correct ? 1 : 0;
                valid = true;
            } else {
                let sum = 0;
                let count = 0;
                sortedJudges.forEach(j => {
                    const val = pred[`both_correct_${j}`];
                    if (val !== null && val !== undefined) {
                        sum += val ? 1 : 0;
                        count++;
                    }
                });
                if (count > 0) {
                    overallScore = sum / count;
                    valid = true;
                }
            }
            tdOverall.innerHTML = valid ? renderCheckCross(overallScore >= 0.5) : '';
            tr.appendChild(tdOverall);
            
            // Judges
            sortedJudges.forEach(j => {
                const td = document.createElement('td');
                const val = pred[`both_correct_${j}`];
                td.innerHTML = val !== null && val !== undefined ? renderCheckCross(val) : '';
                tr.appendChild(td);
            });
            
            // Human
            const tdHuman = document.createElement('td');
            const hVal = pred.human_both_correct;
            tdHuman.innerHTML = hVal !== null && hVal !== undefined ? renderCheckCross(hVal) : '';
            tr.appendChild(tdHuman);
            
            tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        recapContainer.appendChild(table);
        container.appendChild(recapContainer);
    }

    // Model Predictions & Judges
    const predHeader = document.createElement('h3');
    predHeader.textContent = "Model Predictions & Evaluations";
    predHeader.style.marginBottom = '1rem';
    predHeader.style.color = 'var(--text-header)';
    container.appendChild(predHeader);

    if (predictions.length === 0) {
        const p = document.createElement('p');
        p.textContent = "No model predictions found for this riddle.";
        p.style.color = 'var(--text-muted)';
        container.appendChild(p);
    } else {
        predictions.forEach(pred => {
            const card = document.createElement('div');
            card.className = 'riddle-content';
            card.style.borderColor = 'var(--border-color)';
            
            // Model Name
            const modelHeader = document.createElement('h4');
            modelHeader.textContent = pred.model;
            modelHeader.style.color = PROVIDER_COLORS[pred.provider] || 'var(--text-header)';
            modelHeader.style.marginBottom = '0.5rem';
            card.appendChild(modelHeader);

            // Answer
            const ansDiv = document.createElement('div');
            ansDiv.style.marginBottom = '1rem';
            // ansDiv.innerHTML = `<strong>Answer:</strong> ${pred.answer}`; // OLD
            ansDiv.innerHTML = `
                <strong style="display:block; margin-bottom:0.25rem; color:var(--text-muted);">Answer:</strong>
                <div class="markdown-content">${marked.parse(pred.answer || '')}</div>
            `;
            card.appendChild(ansDiv);

            // Justification
            if (pred.justification) {
                const justDiv = document.createElement('details');
                justDiv.style.marginBottom = '1rem';
                justDiv.innerHTML = `
                    <summary style="cursor:pointer; color:var(--text-muted)">Show Justification</summary>
                    <div style="margin-top:0.5rem; color: var(--text-main)" class="markdown-content">
                        ${marked.parse(pred.justification || '')}
                    </div>
                `;
                card.appendChild(justDiv);
            }

            // Judges
            const scorecard = document.createElement('div');
            scorecard.className = 'judge-scorecard';
            
            // Also Human
            if (pred.human_both_correct !== null) {
                scorecard.appendChild(createJudgeCard('Human', pred.human_answer_correct, pred.human_justification_correct, pred.human_both_correct));
            }

            // Regex to find judge names from keys
            const judgeKeys = Object.keys(pred).filter(k => k.startsWith('both_correct_'));

            judgeKeys.forEach(key => {
                const judgeName = key.replace('both_correct_', '');
                // Check if this judge is active (non-null)
                if (pred[key] !== null) {
                    const ansKey = `is_answer_correct_${judgeName}`;
                    const justKey = `is_justification_correct_${judgeName}`;
                    scorecard.appendChild(createJudgeCard(judgeName, pred[ansKey], pred[justKey], pred[key]));
                }
            });

            card.appendChild(scorecard);
            container.appendChild(card);
        });
    }
}

function createJudgeCard(name, ans, just, both) {
    const card = document.createElement('div');
    card.className = 'judge-card';
    
    card.innerHTML = `
        <h4>${name}</h4>
        <div class="status-row">
            <span>Answer:</span>
            ${renderStatus(ans)}
        </div>
        <div class="status-row">
            <span>Justification:</span>
            ${renderStatus(just)}
        </div>
        <div class="status-row" style="border-top:1px solid var(--border-color); padding-top:0.5rem; margin-top:0.5rem">
            <span>Overall:</span>
            ${renderStatus(both)}
        </div>
    `;
    return card;
}

function renderStatus(val) {
    if (val === true) return '<span class="status-correct" style="color:#3fb950 !important; font-weight:bold;">✓ Correct</span>';
    if (val === false) return '<span class="status-incorrect" style="color:#f85149 !important; font-weight:bold;">✗ Incorrect</span>';
    return '<span class="status-null">N/A</span>';
}

function renderCheckCross(val) {
    if (val === true) return '<span class="status-icon status-check" style="color:#3fb950 !important; font-weight:bold;">✓</span>';
    if (val === false) return '<span class="status-icon status-cross" style="color:#f85149 !important; font-weight:bold;">✗</span>';
    return '<span class="status-icon status-empty">-</span>';
}
