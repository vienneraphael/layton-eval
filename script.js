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

const JUDGE_DISPLAY_NAMES = {
    'openai': 'OpenAI Judge',
    'anthropic': 'Anthropic Judge',
    'gemini': 'Gemini Judge',
    'google': 'Gemini Judge',
    'mistral': 'Mistral Judge'
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
        successRates: new Set(['all']),
        disabledAnalyticsModels: new Set() // For toggling in legend
    }
};

let categorySelect = null;
let picaratsSelect = null;
let successRateSelect = null;

// Color helper
function getModelColor(modelName, provider, index, total) {
    const baseColor = PROVIDER_COLORS[provider] || PROVIDER_COLORS['default'];
    
    // Convert hex to HSL to vary the lightness/saturation slightly for uniqueness
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 107, g: 114, b: 128 };
    };

    const rgbToHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    };

    const rgb = hexToRgb(baseColor);
    const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    
    // Vary hue slightly (±15 degrees) and lightness (±10%) based on index
    // This keeps them visually close to provider but distinct
    const hueOffset = ((index % 5) - 2) * 6; 
    const lightnessOffset = ((index % 3) - 1) * 8;
    
    return `hsl(${h + hueOffset}, ${Math.min(100, s + 5)}%, ${Math.max(30, Math.min(80, l + lightnessOffset))}%)`;
}

// DOM Elements
const elements = {
    splitSelect: document.getElementById('split-select'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    leaderboardBody: document.querySelector('#leaderboard-table tbody'),
    rankChart: document.getElementById('rank-chart'),
    radarMainContainer: document.getElementById('radar-chart-main-container'),
    radarLegend: document.getElementById('radar-chart-legend'),
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
        this.allOptions = []; // Store original options for searching
        
        if (!this.container) return;

        this.trigger = this.container.querySelector('.multiselect-trigger');
        this.dropdown = this.container.querySelector('.multiselect-dropdown');
        this.triggerSpan = this.trigger.querySelector('span'); // First span
        
        // Search support
        this.searchInput = this.container.querySelector('.model-search-input');
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.filterOptions());
            this.searchInput.addEventListener('click', (e) => e.stopPropagation());
        }

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
        
        if (this.dropdown.classList.contains('show') && this.searchInput) {
            this.searchInput.focus();
            this.filterOptions(); // Reset filter on open
        }
    }

    close() {
        this.dropdown.classList.remove('show');
        this.trigger.classList.remove('active');
    }

    setOptions(options) {
        this.allOptions = options;
        this.optionsMap = new Map(options.map(o => [String(o.value), o.label]));
        this.renderOptions(options);
        this.updateTrigger();
    }

    filterOptions() {
        if (!this.searchInput) return;
        const query = this.searchInput.value.toLowerCase();
        const filtered = this.allOptions.filter(o => 
            o.label.toLowerCase().includes(query) || 
            (o.provider && o.provider.toLowerCase().includes(query))
        );
        this.renderOptions(filtered, query.length > 0);
    }

    renderOptions(options, isSearching = false) {
        // Find or create options list container
        let listContainer = this.dropdown.querySelector('.model-options-list') || this.dropdown;
        
        // If it's the dropdown itself, we need to preserve the header and search wrapper
        const header = this.dropdown.querySelector('.multiselect-header');
        const searchWrapper = this.dropdown.querySelector('.model-search-wrapper');
        
        // Clear only the options
        if (listContainer === this.dropdown) {
            // Keep header and search
            const children = Array.from(this.dropdown.children);
            children.forEach(child => {
                if (child !== header && child !== searchWrapper) {
                    this.dropdown.removeChild(child);
                }
            });
        } else {
            listContainer.innerHTML = '';
        }

        if (!header && !isSearching) {
            // Header with Clear button (only if not already there)
            const newHeader = document.createElement('div');
            newHeader.className = 'multiselect-header';
            newHeader.innerHTML = `
                <span>Select ${this.placeholder}</span>
                <button class="btn-clear">Clear</button>
            `;
            newHeader.querySelector('.btn-clear').onclick = (e) => {
                e.stopPropagation();
                this.selectAll();
            };
            if (searchWrapper) {
                this.dropdown.insertBefore(newHeader, searchWrapper);
            } else {
                this.dropdown.prepend(newHeader);
            }
        }

        // All Option (only if not searching)
        if (!isSearching) {
            this.addOption('all', `All ${this.placeholder}`, listContainer);
        }

        // Other Options
        options.forEach(opt => {
            this.addOption(opt.value, opt.label, listContainer);
        });
        
        if (options.length === 0) {
            const noRes = document.createElement('div');
            noRes.className = 'multiselect-option no-results';
            noRes.style.color = 'var(--text-muted)';
            noRes.style.justifyContent = 'center';
            noRes.textContent = 'No matches found';
            listContainer.appendChild(noRes);
        }
    }

    addOption(value, label, container) {
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

        container.appendChild(div);
    }

    handleSelection(value, isChecked) {
        if (value === 'all') {
            if (isChecked) {
                this.selectAll();
            } else {
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

class SearchableSelect {
    constructor(container, options, initialValue, onSelect) {
        this.container = container;
        this.options = options; // [{value, label, provider}]
        this.filteredOptions = options;
        this.onSelect = onSelect;
        this.selectedValue = initialValue;
        this.highlightedIndex = -1;
        this.isOpen = false;
        
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="model-selector-wrapper">
                <button class="model-select-trigger">
                    <span class="current-value"></span>
                    <span class="arrow">▼</span>
                </button>
                <div class="model-select-dropdown">
                    <input type="text" class="model-search-input" placeholder="Search model...">
                    <div class="model-options-list"></div>
                </div>
            </div>
        `;

        this.trigger = this.container.querySelector('.model-select-trigger');
        this.dropdown = this.container.querySelector('.model-select-dropdown');
        this.searchInput = this.container.querySelector('.model-search-input');
        this.optionsList = this.container.querySelector('.model-options-list');
        this.currentValueSpan = this.container.querySelector('.current-value');

        this.updateTriggerText();
        this.renderOptions(this.options);

        this.trigger.onclick = (e) => {
            e.stopPropagation();
            this.toggle();
        };

        this.searchInput.onclick = (e) => e.stopPropagation();
        this.searchInput.oninput = () => {
            const query = this.searchInput.value.toLowerCase();
            this.filteredOptions = this.options.filter(o => 
                o.label.toLowerCase().includes(query) || 
                (o.provider && o.provider.toLowerCase().includes(query))
            );
            this.highlightedIndex = this.filteredOptions.length > 0 ? 0 : -1;
            this.renderOptions(this.filteredOptions);
        };

        this.searchInput.onkeydown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.highlightedIndex = (this.highlightedIndex + 1) % this.filteredOptions.length;
                this.renderOptions(this.filteredOptions);
                this.scrollToHighlighted();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.highlightedIndex = (this.highlightedIndex - 1 + this.filteredOptions.length) % this.filteredOptions.length;
                this.renderOptions(this.filteredOptions);
                this.scrollToHighlighted();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredOptions.length) {
                    this.select(this.filteredOptions[this.highlightedIndex].value);
                }
            } else if (e.key === 'Escape') {
                this.close();
            }
        };

        document.addEventListener('click', () => this.close());
    }

    scrollToHighlighted() {
        const highlightedEl = this.optionsList.querySelector('.model-option.highlighted');
        if (highlightedEl) {
            highlightedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    updateTriggerText() {
        const selected = this.options.find(o => o.value === this.selectedValue);
        if (selected) {
            this.currentValueSpan.innerHTML = `<span class="provider-prefix">${selected.provider}:</span> ${selected.label}`;
        } else {
            this.currentValueSpan.textContent = 'Select a model';
        }
    }

    renderOptions(options) {
        this.optionsList.innerHTML = '';
        options.forEach((opt, index) => {
            const div = document.createElement('div');
            const isSelected = opt.value === this.selectedValue;
            const isHighlighted = index === this.highlightedIndex;
            div.className = `model-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`;
            div.innerHTML = `<span class="provider-prefix">${opt.provider}:</span> ${opt.label}`;
            div.onclick = (e) => {
                e.stopPropagation();
                this.select(opt.value);
            };
            this.optionsList.appendChild(div);
        });
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.dropdown.classList.toggle('show', this.isOpen);
        if (this.isOpen) {
            this.searchInput.value = '';
            this.filteredOptions = this.options;
            // Set highlighted to current selection if it exists in filtered options
            this.highlightedIndex = this.filteredOptions.findIndex(o => o.value === this.selectedValue);
            if (this.highlightedIndex === -1 && this.filteredOptions.length > 0) {
                this.highlightedIndex = 0;
            }
            this.renderOptions(this.filteredOptions);
            this.searchInput.focus();
            setTimeout(() => this.scrollToHighlighted(), 0);
        }
    }

    close() {
        this.isOpen = false;
        this.dropdown.classList.remove('show');
    }

    select(value) {
        this.selectedValue = value;
        this.updateTriggerText();
        this.close();
        if (this.onSelect) this.onSelect(value);
    }
}

function initEventListeners() {
    // Split Selector
    elements.splitSelect.addEventListener('change', (e) => {
        loadSplit(e.target.value);
    });

    // Tabs
    const tabs = document.querySelectorAll('.nav-btn');
    tabs.forEach(btn => {
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
    const tabs = document.querySelectorAll('.nav-btn');
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panes
    elements.tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    // Trigger render if needed (e.g. chart resize)
    if (tabId === 'leaderboard') {
        renderLeaderboard(); // Re-render to ensure chart size is correct
    } else if (tabId === 'analytics') {
        renderAnalytics();
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
        
        // Attach provider to PPI if missing
        ppi.forEach(p => {
            if (!p.provider) {
                p.provider = getProviderFromModelName(p.model, state.cache[split].modelProviders);
            }
        });

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
    if (state.activeTab === 'analytics') {
        renderAnalytics();
    }
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

    // Add X-axis label "Model Score" with info icon
    const xAxisLabel = document.createElementNS(svgNS, "text");
    xAxisLabel.setAttribute("x", padding.left + chartWidth / 2);
    xAxisLabel.setAttribute("y", height - 15);
    xAxisLabel.setAttribute("text-anchor", "middle");
    xAxisLabel.setAttribute("fill", "var(--text-header)");
    xAxisLabel.setAttribute("font-size", "13px");
    xAxisLabel.setAttribute("font-weight", "600");
    xAxisLabel.textContent = "Model Score";
    svg.appendChild(xAxisLabel);

    // Add info icon next to axis label (smaller, positioned above and to the right)
    const infoIconX = padding.left + chartWidth / 2 + 48;
    const infoIconY = height - 22;
    const tooltipText = "Model score is a 95%-CI estimation of the % of correct answers a human annotator would have attributed to the model. Answer correctness is based on both answer and justification.";
    
    const infoGroup = document.createElementNS(svgNS, "g");
    infoGroup.setAttribute("class", "svg-info-icon");
    infoGroup.style.cursor = "help";
    infoGroup.setAttribute("pointer-events", "all");
    
    // Circle background
    const infoCircle = document.createElementNS(svgNS, "circle");
    infoCircle.setAttribute("cx", infoIconX);
    infoCircle.setAttribute("cy", infoIconY);
    infoCircle.setAttribute("r", "5");
    infoCircle.setAttribute("fill", "#4b5563");
    infoCircle.setAttribute("stroke", "#6b7280");
    infoCircle.setAttribute("stroke-width", "1");
    infoGroup.appendChild(infoCircle);
    
    // "i" text
    const infoText = document.createElementNS(svgNS, "text");
    infoText.setAttribute("x", infoIconX);
    infoText.setAttribute("y", infoIconY + 2.5);
    infoText.setAttribute("text-anchor", "middle");
    infoText.setAttribute("fill", "#e5e7eb");
    infoText.setAttribute("font-size", "7px");
    infoText.setAttribute("font-weight", "700");
    infoText.setAttribute("font-style", "italic");
    infoText.setAttribute("font-family", "serif");
    infoText.setAttribute("pointer-events", "none");
    infoText.textContent = "i";
    infoGroup.appendChild(infoText);
    
    // Create HTML tooltip element
    let axisTooltip = document.getElementById('axis-info-tooltip');
    if (!axisTooltip) {
        axisTooltip = document.createElement('div');
        axisTooltip.id = 'axis-info-tooltip';
        axisTooltip.className = 'axis-info-tooltip';
        axisTooltip.textContent = tooltipText;
        document.body.appendChild(axisTooltip);
    }
    
    // Hover effect with tooltip
    infoGroup.addEventListener("mouseenter", (e) => {
        infoCircle.setAttribute("fill", "#2563eb");
        infoCircle.setAttribute("stroke", "#2563eb");
        infoText.setAttribute("fill", "#ffffff");
        
        // Position and show tooltip
        const rect = infoGroup.getBoundingClientRect();
        axisTooltip.style.left = (rect.left + rect.width / 2) + 'px';
        axisTooltip.style.top = (rect.top - 10) + 'px';
        axisTooltip.style.display = 'block';
    });
    infoGroup.addEventListener("mouseleave", () => {
        infoCircle.setAttribute("fill", "#4b5563");
        infoCircle.setAttribute("stroke", "#6b7280");
        infoText.setAttribute("fill", "#e5e7eb");
        axisTooltip.style.display = 'none';
    });
    
    svg.appendChild(infoGroup);

    container.appendChild(svg);
}

// --- Analytics Logic ---

function renderAnalytics() {
    if (state.activeTab !== 'analytics') return;
    
    const splitData = state.cache[state.currentSplit];
    if (!splitData || !splitData.loaded) return;

    const ppi = splitData.ppi;
    const riddlesMap = splitData.riddles;
    const results = splitData.results;

    // 1. Identify all models and their stats
    const allModelsStats = {}; 
    const categories = new Set();
    
    ppi.forEach(p => {
        const riddle = riddlesMap.get(p.riddle_id);
        if (!riddle) return;

        let score = 0;
        let valid = false;

        if (p.human_both_correct !== null && p.human_both_correct !== undefined) {
            score = p.human_both_correct ? 1 : 0;
            valid = true;
        } else {
            let judgeScoreSum = 0;
            let judgeCount = 0;
            Object.keys(p).forEach(k => {
                if (k.startsWith('both_correct_') && p[k] !== null) {
                    judgeScoreSum += p[k] ? 1 : 0;
                    judgeCount++;
                }
            });
            if (judgeCount > 0) {
                score = judgeScoreSum / judgeCount;
                valid = true;
            }
        }

        if (valid) {
            const cat = riddle.category || 'Unknown';
            categories.add(cat);

            if (!allModelsStats[p.model]) allModelsStats[p.model] = {};
            if (!allModelsStats[p.model][cat]) allModelsStats[p.model][cat] = { total: 0, count: 0 };
            
            allModelsStats[p.model][cat].total += score;
            allModelsStats[p.model][cat].count++;
        }
    });

    const sortedCategories = Array.from(categories).sort();
    const sortedModels = results.map(r => r.model);

    // 2. Filter models to display - Show ALL models but allow toggling via legend
    const modelsToDisplay = sortedModels;

    // 3. Render Single Large Radar Chart
    elements.radarMainContainer.innerHTML = '';
    elements.radarLegend.innerHTML = '';
    
    // Find focus UI above the radar
    const focusUI = document.getElementById('radar-focus-ui');

    const size = 800;
    const center = size / 2;
    const radius = size * 0.38;
    const svgNS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "radar-chart-svg");

    const angleStep = (Math.PI * 2) / sortedCategories.length;

    // Draw background circles
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach(level => {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", center);
        circle.setAttribute("cy", center);
        circle.setAttribute("r", radius * level);
        circle.setAttribute("class", "radar-grid-circle");
        svg.appendChild(circle);
        
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", center + 5);
        text.setAttribute("y", center - (radius * level) - 5);
        text.setAttribute("font-size", "11px");
        text.setAttribute("fill", "var(--text-muted)");
        text.setAttribute("font-weight", "600");
        text.textContent = `${Math.round(level * 100)}%`;
        svg.appendChild(text);
    });

    // Draw axes
    sortedCategories.forEach((cat, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x2 = center + Math.cos(angle) * radius;
        const y2 = center + Math.sin(angle) * radius;

        const axis = document.createElementNS(svgNS, "line");
        axis.setAttribute("x1", center);
        axis.setAttribute("y1", center);
        axis.setAttribute("x2", x2);
        axis.setAttribute("y2", y2);
        axis.setAttribute("class", "radar-axis");
        svg.appendChild(axis);

        const labelDist = radius + 45;
        const lx = center + Math.cos(angle) * labelDist;
        const ly = center + Math.sin(angle) * labelDist;
        
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", lx);
        text.setAttribute("y", ly);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("class", "radar-label");
        text.textContent = cat;
        svg.appendChild(text);
    });

    // Draw models
    const polygons = [];
    const legendItems = [];

    modelsToDisplay.forEach((modelName) => {
        const stats = allModelsStats[modelName];
        if (!stats) return;

        const provider = splitData.modelProviders.get(modelName);
        const globalIdx = sortedModels.indexOf(modelName);
        const color = getModelColor(modelName, provider, globalIdx, sortedModels.length);
        const isDisabled = state.filters.disabledAnalyticsModels.has(modelName);

        const points = sortedCategories.map((cat, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const performance = stats[cat] ? (stats[cat].total / stats[cat].count) : 0;
            const dist = radius * performance;
            const x = center + Math.cos(angle) * dist;
            const y = center + Math.sin(angle) * dist;
            return `${x},${y}`;
        }).join(" ");

        const polygon = document.createElementNS(svgNS, "polygon");
        polygon.setAttribute("points", points);
        polygon.setAttribute("class", "radar-area");
        polygon.setAttribute("data-model", modelName);
        polygon.style.stroke = color;
        polygon.style.fill = color;
        
        if (isDisabled) {
            polygon.style.display = 'none';
        }
        
        svg.appendChild(polygon);
        polygons.push(polygon);

        // Add to legend
        const legendItem = document.createElement('div');
        legendItem.className = `legend-item ${isDisabled ? 'disabled' : ''}`;
        legendItem.innerHTML = `
            <span class="legend-color" style="background-color: ${color}"></span>
            <span class="legend-name">${modelName}</span>
        `;
        
        const showFocusUI = (name, color) => {
            focusUI.innerHTML = `
                <div class="radar-focus-color" style="background-color: ${color}"></div>
                <div class="radar-focus-name">${name}</div>
            `;
            focusUI.classList.add('show');
        };

        const hideFocusUI = () => {
            focusUI.classList.remove('show');
        };

        const highlight = () => {
            if (state.filters.disabledAnalyticsModels.has(modelName)) return;
            
            legendItems.forEach(li => li.classList.remove('active'));
            legendItem.classList.add('active');
            polygons.forEach(p => {
                if (p === polygon) {
                    p.classList.remove('dimmed');
                    p.classList.add('highlighted');
                    p.parentNode.appendChild(p); // Bring to front
                } else {
                    p.classList.add('dimmed');
                    p.classList.remove('highlighted');
                }
            });
            showFocusUI(modelName, color);
        };

        const reset = () => {
            legendItem.classList.remove('active');
            polygons.forEach(p => {
                p.classList.remove('dimmed');
                p.classList.remove('highlighted');
            });
            hideFocusUI();
        };

        const toggle = (e) => {
            e.stopPropagation();
            if (state.filters.disabledAnalyticsModels.has(modelName)) {
                state.filters.disabledAnalyticsModels.delete(modelName);
            } else {
                state.filters.disabledAnalyticsModels.add(modelName);
            }
            renderAnalytics(); // Re-render to update visibility
        };

        legendItem.onmouseenter = highlight;
        legendItem.onmouseleave = reset;
        legendItem.onclick = toggle;
        
        polygon.onmouseenter = highlight;
        polygon.onmouseleave = reset;
        
        elements.radarLegend.appendChild(legendItem);
        legendItems.push(legendItem);
    });

    elements.radarMainContainer.appendChild(svg);
}

function renderRadarChart(container, stats, labels, provider) {
    // Kept for potential internal use but main logic now in renderAnalytics
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

    const modelCells = []; // Store cells to link them later

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
        
        // Up to 4 judges as per TODO, but let's be flexible while following the requirement
        sortedJudges.forEach((j, i) => {
            const th = document.createElement('th');
            const provider = getProviderFromModelName(j, splitData.modelProviders);
            
            // Show shortened judge name or fallback to J1, J2...
            th.textContent = JUDGE_DISPLAY_NAMES[provider] || `J${i+1}`;
            th.title = j; // Full name on hover
            
            // Color based on provider
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
            tdModel.title = `Click to view ${pred.model}'s full prediction`;
            tr.appendChild(tdModel);
            modelCells.push({ el: tdModel, model: pred.model });
            
            // Judges
            sortedJudges.forEach(j => {
                const td = document.createElement('td');
                const val = pred[`both_correct_${j}`];
                td.innerHTML = renderCheckCross(val);
                tr.appendChild(td);
            });
            
            // Human
            const tdHuman = document.createElement('td');
            const hVal = pred.human_both_correct;
            tdHuman.innerHTML = renderCheckCross(hVal);
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
        // Sort predictions by model name
        predictions.sort((a, b) => a.model.localeCompare(b.model));

        // Create Selector Container
        const selectorContainer = document.createElement('div');
        container.appendChild(selectorContainer);

        // Create Card Container
        const cardContainer = document.createElement('div');
        container.appendChild(cardContainer);

        // Prepare options
        const options = predictions.map(p => ({
            value: p.model,
            label: p.model,
            provider: p.provider
        }));

        // Initial render
        const initialModel = predictions[0].model;
        
        const renderSelectedCard = (modelName) => {
            const pred = predictions.find(p => p.model === modelName);
            cardContainer.innerHTML = '';
            if (pred) {
                cardContainer.appendChild(renderPredictionCard(pred, splitData));
            }
        };

        const modelSelector = new SearchableSelect(selectorContainer, options, initialModel, (val) => {
            renderSelectedCard(val);
        });

        // Link table cells to selector
        modelCells.forEach(({ el, model }) => {
            el.onclick = () => {
                modelSelector.select(model);
                // Scroll selector into view if it's far away
                selectorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
        });

        // Initial card
        renderSelectedCard(initialModel);
    }
}

function renderPredictionCard(pred, splitData) {
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
    ansDiv.innerHTML = `
        <strong style="display:block; margin-bottom:0.25rem; color:var(--text-muted);">Answer:</strong>
        <div class="markdown-content">${marked.parse(pred.answer || '')}</div>
    `;
    card.appendChild(ansDiv);

    // Justification
    if (pred.justification) {
        const justDiv = document.createElement('div');
        justDiv.style.marginBottom = '1rem';
        justDiv.innerHTML = `
            <strong style="display:block; margin-bottom:0.25rem; color:var(--text-muted);">Justification:</strong>
            <div class="markdown-content">
                ${marked.parse(pred.justification || '')}
            </div>
        `;
        card.appendChild(justDiv);
    }

    // Judges Table
    const tableContainer = document.createElement('div');
    tableContainer.className = 'judge-table-container';
    
    const table = document.createElement('table');
    table.className = 'judge-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Judge</th>
            <th>Judge Output</th>
        </tr>
    `;
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    
    const addRow = (name, ans, just, both, provider) => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'judge-name-cell';
        tdName.textContent = name;
        tdName.style.color = PROVIDER_COLORS[provider] || PROVIDER_COLORS['default'];
        tr.appendChild(tdName);
        
        const td = document.createElement('td');
        td.innerHTML = renderCheckCross(both);
        tr.appendChild(td);
        
        tbody.appendChild(tr);
    };

    // Human Judge
    if (pred.human_both_correct !== null) {
        addRow('Human', pred.human_answer_correct, pred.human_justification_correct, pred.human_both_correct, 'default');
    }

    // Automated Judges
    const judgeKeys = Object.keys(pred).filter(k => k.startsWith('both_correct_'));
    judgeKeys.forEach(key => {
        const judgeName = key.replace('both_correct_', '');
        if (pred[key] !== null) {
            const provider = getProviderFromModelName(judgeName, splitData.modelProviders);
            addRow(judgeName, pred[`is_answer_correct_${judgeName}`], pred[`is_justification_correct_${judgeName}`], pred[key], provider);
        }
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    card.appendChild(tableContainer);

    return card;
}

function renderCheckCross(val) {
    if (val === true) return '<span class="status-icon status-check" style="color:#3fb950 !important; font-weight:bold;">✓</span>';
    if (val === false) return '<span class="status-icon status-cross" style="color:#f85149 !important; font-weight:bold;">✗</span>';
    return '<span class="status-icon status-empty">—</span>';
}
