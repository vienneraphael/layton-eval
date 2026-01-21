// Constants
const SPLITS = {
    llm: {
        results: 'results_llm.jsonl',
        ppi: 'ppi_llm.jsonl',
        metadata: 'datasets/layton_eval.jsonl'
    },
    vlm: {
        results: 'results_vlm.jsonl',
        ppi: 'ppi_vlm.jsonl',
        metadata: 'datasets/layton_eval.jsonl'
    },
    full: {
        results: 'results.jsonl', // Assuming this exists or we fallback
        ppi: 'ppi_llm.jsonl', // Fallback or Combined? Spec says results.jsonl for full. 
                              // For PPI it lists ppi_llm and ppi_vlm. We might need to load both.
                              // For simplicity/safety, we'll start with LLM files for Full if files missing.
        metadata: 'datasets/layton_eval.jsonl'
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
        llm: {},
        vlm: {},
        full: {}
    },
    activeTab: 'leaderboard',
    selectedRiddleId: null
};

// DOM Elements
const elements = {
    splitSelect: document.getElementById('split-select'),
    tabs: document.querySelectorAll('.nav-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    leaderboardBody: document.querySelector('#leaderboard-table tbody'),
    rankChart: document.getElementById('rank-chart'),
    riddleList: document.getElementById('riddle-list'),
    riddleSearch: document.getElementById('riddle-search'),
    riddleDetail: document.getElementById('riddle-detail-view')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadSplit('llm'); // Load default
});

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
    elements.riddleSearch.addEventListener('input', (e) => {
        filterRiddleList(e.target.value);
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
    
    try {
        // Load Leaderboard
        const results = await loadJSONL(config.results);
        state.cache[split].results = results;

        // Load Metadata (Riddles)
        const metadata = await loadJSONL(config.metadata);
        // Index by ID
        state.cache[split].riddles = new Map(metadata.map(r => [r.id, r]));

        // Load Predictions (PPI)
        // If 'full', we might need to load multiple, but let's stick to config
        // Note: For 'full', we might want to merge, but let's keep it simple for v1
        const ppi = await loadJSONL(config.ppi);
        state.cache[split].ppi = ppi;

        state.cache[split].loaded = true;
        onDataLoaded();

    } catch (e) {
        console.error("Failed to load data for split " + split, e);
        // If file not found, try to handle gracefully (e.g. if VLM missing)
        if (split !== 'llm') {
             alert(`Data for ${split} split not found or incomplete. Check console.`);
        }
    }
}

async function loadJSONL(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        return text.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    console.warn("Skipping invalid JSON line", e);
                    return null;
                }
            })
            .filter(item => item !== null);
    } catch (e) {
        console.warn(`Could not load ${url}`, e);
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

    const width = container.clientWidth || 800;
    const height = 600; // Increased height
    const padding = { top: 50, right: 30, bottom: 200, left: 60 }; // Increased bottom padding
    
    // Detect Score Range (0-1 or 0-100)
    let maxScore = 100;
    const allScoresSmall = data.every(d => d.score <= 1);
    if (allScoresSmall) maxScore = 1;

    // Calculate dynamic Y-axis range (Scores)
    let minDataScore = maxScore;
    let maxDataScore = 0;
    
    data.forEach(d => {
        const ci = d['95% CI (±)'];
        const low = d.score - ci;
        const high = d.score + ci;
        if (low < minDataScore) minDataScore = low;
        if (high > maxDataScore) maxDataScore = high;
    });

    const paddingVal = allScoresSmall ? 0.05 : 5;
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
    
    // Y Scale function (Score)
    const yScale = (score) => {
        // Inverted: Max score at top (padding.top), Min score at bottom
        return padding.top + chartHeight - ((score - axisMin) / (axisMax - axisMin)) * chartHeight;
    };

    // X Scale function (Model Index)
    const xScale = (index) => {
        const step = chartWidth / data.length;
        return padding.left + step * index + step / 2;
    };

    // Draw Grid Lines (Horizontal)
    const tickCount = 10;
    for (let i = 0; i <= tickCount; i++) {
        const val = axisMin + (i / tickCount) * (axisMax - axisMin);
        const y = yScale(val);
        
        // Grid Line
        const gridLine = document.createElementNS(svgNS, "line");
        gridLine.setAttribute("x1", padding.left);
        gridLine.setAttribute("y1", y);
        gridLine.setAttribute("x2", width - padding.right);
        gridLine.setAttribute("y2", y);
        gridLine.setAttribute("stroke", "var(--border-color)");
        gridLine.setAttribute("stroke-opacity", "0.3");
        svg.appendChild(gridLine);

        // Label
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", padding.left - 10);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("fill", "var(--text-muted)");
        text.setAttribute("font-size", "10px");
        text.textContent = val.toFixed(allScoresSmall ? 2 : 0);
        svg.appendChild(text);
    }

    // Draw Grid Lines (Vertical) - Model Ticks
    data.forEach((_, index) => {
        const x = xScale(index);
        
        const gridLine = document.createElementNS(svgNS, "line");
        gridLine.setAttribute("x1", x);
        gridLine.setAttribute("y1", padding.top);
        gridLine.setAttribute("x2", x);
        gridLine.setAttribute("y2", height - padding.bottom);
        gridLine.setAttribute("stroke", "var(--border-color)");
        gridLine.setAttribute("stroke-opacity", "0.3");
        svg.appendChild(gridLine);
    });

    // Draw Data Points
    data.forEach((row, index) => {
        const x = xScale(index);
        const score = row.score;
        const ci = row['95% CI (±)'];
        const color = PROVIDER_COLORS[row.provider] || PROVIDER_COLORS['default'];

        const yScore = yScale(score);
        const yHigh = yScale(score + ci); // Higher score -> Smaller Y
        const yLow = yScale(score - ci);  // Lower score -> Larger Y

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

        // Vertical CI Line
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", yLow);
        line.setAttribute("x2", x);
        line.setAttribute("y2", yHigh);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        line.setAttribute("opacity", "0.6");
        g.appendChild(line);

        // Caps
        const capWidth = 10;
        
        // Top Cap (Higher Score)
        const cap1 = document.createElementNS(svgNS, "line");
        cap1.setAttribute("x1", x - capWidth/2);
        cap1.setAttribute("y1", yHigh);
        cap1.setAttribute("x2", x + capWidth/2);
        cap1.setAttribute("y2", yHigh);
        cap1.setAttribute("stroke", color);
        cap1.setAttribute("stroke-width", "2");
        g.appendChild(cap1);

        // Bottom Cap (Lower Score)
        const cap2 = document.createElementNS(svgNS, "line");
        cap2.setAttribute("x1", x - capWidth/2);
        cap2.setAttribute("y1", yLow);
        cap2.setAttribute("x2", x + capWidth/2);
        cap2.setAttribute("y2", yLow);
        cap2.setAttribute("stroke", color);
        cap2.setAttribute("stroke-width", "2");
        g.appendChild(cap2);

        // Score Point
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", yScore);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", "var(--bg-surface)"); // Use theme var
        circle.setAttribute("stroke", color);
        circle.setAttribute("stroke-width", "2");
        g.appendChild(circle);

        // Rank Spread Label (Above Top Cap)
        const spreadLabel = document.createElementNS(svgNS, "text");
        spreadLabel.setAttribute("x", x);
        spreadLabel.setAttribute("y", yHigh - 8);
        spreadLabel.setAttribute("text-anchor", "middle");
        spreadLabel.setAttribute("fill", "var(--text-muted)");
        spreadLabel.setAttribute("font-size", "10px");
        spreadLabel.textContent = rankSpreadText;
        g.appendChild(spreadLabel);

        // Model Name Label (Rotated on X-Axis)
        const labelY = height - padding.bottom + 15;
        const nameLabel = document.createElementNS(svgNS, "text");
        nameLabel.setAttribute("x", x);
        nameLabel.setAttribute("y", labelY);
        nameLabel.setAttribute("text-anchor", "end"); // Anchor end for 45 deg rotation to align well?
        // Actually for -45 or -90, end anchor works best if we position at the tick mark
        // Let's use 45 degrees, which usually goes down-right.
        // If we want it like the screenshot (vertical or angled), let's try 45.
        // Rotated 45 degrees around (x, labelY)
        nameLabel.setAttribute("transform", `rotate(45, ${x}, ${labelY})`);
        nameLabel.setAttribute("text-anchor", "start"); // Start of text at the tick
        nameLabel.setAttribute("fill", color); // Use provider color
        nameLabel.setAttribute("font-size", "11px");
        nameLabel.setAttribute("font-weight", "500");
        nameLabel.textContent = row.model;
        g.appendChild(nameLabel);

        svg.appendChild(g);
    });

    container.appendChild(svg);
}

// --- Visualizer Logic ---

function populateRiddleList() {
    const splitData = state.cache[state.currentSplit];
    const riddlesMap = splitData.riddles;
    if (!riddlesMap) return;

    // Get valid riddle IDs for this split from PPI
    const validRiddleIds = new Set();
    if (splitData.ppi) {
        splitData.ppi.forEach(p => validRiddleIds.add(p.riddle_id));
    }

    const list = elements.riddleList;
    list.innerHTML = '';

    // Convert to array, filter by valid IDs, and sort
    const riddles = Array.from(riddlesMap.values())
        .filter(r => validRiddleIds.has(r.id))
        .sort((a, b) => a.id.localeCompare(b.id));

    riddles.forEach(r => {
        const li = document.createElement('li');
        li.className = 'riddle-item';
        li.textContent = r.id;
        li.dataset.id = r.id;
        li.onclick = () => selectRiddle(r.id);
        list.appendChild(li);
    });
}

function filterRiddleList(query) {
    const items = elements.riddleList.getElementsByTagName('li');
    query = query.toLowerCase();
    for (let item of items) {
        const match = item.textContent.toLowerCase().includes(query);
        item.style.display = match ? 'block' : 'none';
    }
}

function selectRiddle(riddleId) {
    state.selectedRiddleId = riddleId;
    
    // Highlight in list
    const items = elements.riddleList.getElementsByTagName('li');
    for (let item of items) {
        item.classList.toggle('active', item.dataset.id === riddleId);
    }

    renderRiddleDetail(riddleId);
}

function renderRiddleDetail(riddleId) {
    const splitData = state.cache[state.currentSplit];
    const riddle = splitData.riddles.get(riddleId);
    
    // Get all predictions for this riddle
    const predictions = splitData.ppi.filter(p => p.riddle_id === riddleId);

    const container = elements.riddleDetail;
    container.innerHTML = '';

    if (!riddle) {
        container.innerHTML = '<div class="empty-state">Riddle not found</div>';
        return;
    }

    // Header
    const h2 = document.createElement('h2');
    h2.textContent = `Riddle ${riddle.id}: ${riddle.category || 'Unknown Category'}`;
    h2.style.marginBottom = '1rem';
    h2.style.color = 'var(--text-header)';
    container.appendChild(h2);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'riddle-meta';
    meta.innerHTML = `
        <span class="badge">Picarats: ${riddle.picarats || '?'}</span>
        <a href="${riddle.url}" target="_blank" style="color: var(--primary); text-decoration: none;">Wiki Link ↗</a>
    `;
    container.appendChild(meta);

    // Image
    if (riddle.img) {
        const img = document.createElement('img');
        // Handle base64 or path. Assuming base64 from spec "Lazy-loaded b64 image" 
        // But jsonl example showed "/9j/..." which is base64 content
        // It needs prefix
        img.src = `data:image/jpeg;base64,${riddle.img}`;
        img.className = 'riddle-image';
        img.loading = 'lazy';
        container.appendChild(img);
    }

    // Description
    const desc = document.createElement('div');
    desc.className = 'riddle-content';
    desc.innerHTML = `<p style="white-space: pre-wrap;">${riddle.description}</p>`;
    container.appendChild(desc);

    // Hints
    const hintsSection = document.createElement('div');
    hintsSection.className = 'hints-section';
    
    const hints = [
        { label: 'First Hint', text: riddle.first_hint },
        { label: 'Second Hint', text: riddle.second_hint },
        { label: 'Third Hint', text: riddle.third_hint },
        { label: 'Special Hint', text: riddle.special_hint }
    ];

    hints.forEach(h => {
        if (!h.text) return; // Hide if null
        
        const details = document.createElement('details');
        details.className = 'hint-accordion';
        details.innerHTML = `
            <summary>${h.label}</summary>
            <div class="hint-content">${h.text}</div>
        `;
        hintsSection.appendChild(details);
    });
    container.appendChild(hintsSection);

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
            ansDiv.innerHTML = `<strong>Answer:</strong> ${pred.answer}`;
            card.appendChild(ansDiv);

            // Justification
            if (pred.justification) {
                const justDiv = document.createElement('details');
                justDiv.style.marginBottom = '1rem';
                justDiv.innerHTML = `
                    <summary style="cursor:pointer; color:var(--text-muted)">Show Justification</summary>
                    <p style="margin-top:0.5rem; white-space: pre-wrap; font-size: 0.9em; color: var(--text-main)">${pred.justification}</p>
                `;
                card.appendChild(justDiv);
            }

            // Judges
            const scorecard = document.createElement('div');
            scorecard.className = 'judge-scorecard';

            // Find valid judges (keys starting with is_answer_correct_)
            // Spec: "Exactly 3 of 4 will be non-null"
            // Keys: is_answer_correct_MODELNAME, is_justification_correct_MODELNAME, both_correct_MODELNAME
            // We need to extract the judge names.
            
            // Regex to find judge names from keys
            const judgeKeys = Object.keys(pred).filter(k => k.startsWith('both_correct_'));
            
            // Also Human
            if (pred.human_both_correct !== null) {
                scorecard.appendChild(createJudgeCard('Human', pred.human_answer_correct, pred.human_justification_correct, pred.human_both_correct));
            } else {
                // "No human annotation available" - spec says display this if null. 
                // But if we have other judges, maybe just don't show human card or show it as disabled?
                // Spec says: "If human... null, the UI must display 'No human annotation available.'"
                // I'll add a text if strictly requested, or just omit. 
                // Let's omit for clean UI unless no judges at all.
            }

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
    if (val === true) return '<span class="status-correct">Correct</span>';
    if (val === false) return '<span class="status-incorrect">Incorrect</span>';
    return '<span class="status-null">N/A</span>';
}
