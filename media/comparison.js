// media/comparison.js
(function() {
    'use strict';

    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // Application state
    let currentData = {};
    let currentAnalysis = null;

    /**
     * Initialize the application
     */
    function init() {
        console.log('Comparison app initializing...');
        
        // Set up event listeners
        setupEventListeners();
        
        // Let the extension know the webview is ready to receive data
        vscode.postMessage({ command: 'ready' });
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        window.addEventListener('message', handleMessage);
        window.addEventListener('error', handleError);
    }

    /**
     * Handle window errors
     */
    function handleError(event) {
        console.error('Window error:', event.error);
    }

    /**
     * Handle messages from the extension
     */
    function handleMessage(event) {
        const message = event.data;
        console.log('Received message:', message.command, message);
        
        try {
            switch (message.command) {
                case 'updateAnalysis':
                    updateAnalysis(message.analysis, message.data);
                    break;
                case 'updateData':
                    updateData(message.data);
                    break;
                default:
                    console.warn('Unknown message command:', message.command);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    /**
     * Update analysis and data
     */
    function updateAnalysis(analysis, data) {
        console.log('Updating analysis and data');
        currentAnalysis = analysis;
        currentData = data;

        const analysisSection = document.getElementById('analysisSection');
        const loadingSpinner = document.getElementById('loadingSpinner');
        const emptyState = document.getElementById('emptyState');

        if (!data || Object.keys(data).length === 0) {
            hideElement(analysisSection);
            hideElement(loadingSpinner);
            showElement(emptyState);
            return;
        }

        hideElement(loadingSpinner);
        hideElement(emptyState);
        showElement(analysisSection);
        analysisSection.classList.add('fade-in');

        // Update different sections if analysis is available
        if (analysis) {
            updateSummary(analysis.summary);
            updateCommonElements(analysis.commonElements);
            updateDifferences(analysis.differences);
            updateRecommendations(analysis.recommendations);
        }
        
        // Always update model responses
        updateModelResponses(data);
    }

    /**
     * Update just the model responses data
     */
    function updateData(data) {
        console.log('Updating data only');
        currentData = data;
        
        // Hide loading and empty state
        const loadingSpinner = document.getElementById('loadingSpinner');
        const emptyState = document.getElementById('emptyState');
        hideElement(loadingSpinner);
        hideElement(emptyState);
        
        updateModelResponses(data);
    }

    /**
     * Update the summary section
     */
    function updateSummary(summary) {
        const summaryContent = document.getElementById('summaryContent');
        if (summaryContent) {
            summaryContent.textContent = summary || 'Analysis summary not available.';
        }
    }

    /**
     * Update common elements section
     */
    function updateCommonElements(commonElements) {
        const commonTags = document.getElementById('commonTags');
        if (!commonTags) return;

        commonTags.innerHTML = '';
        
        if (commonElements && Array.isArray(commonElements) && commonElements.length > 0) {
            commonElements.forEach(element => {
                const tag = createTag(element, 'common');
                commonTags.appendChild(tag);
            });
        } else {
            const tag = createTag('No common elements identified', '');
            commonTags.appendChild(tag);
        }
    }

    /**
     * Update differences section
     */
    function updateDifferences(differences) {
        const differencesGrid = document.getElementById('differencesGrid');
        if (!differencesGrid) return;

        differencesGrid.innerHTML = '';
        
        if (differences && typeof differences === 'object') {
            Object.entries(differences).forEach(([modelId, modelDifferences]) => {
                if (Array.isArray(modelDifferences)) {
                    const card = createDifferenceCard(modelId, modelDifferences);
                    differencesGrid.appendChild(card);
                }
            });
        }
    }

    /**
     * Update recommendations section
     */
    function updateRecommendations(recommendations) {
        const recommendationsContent = document.getElementById('recommendationsContent');
        if (recommendationsContent) {
            recommendationsContent.textContent = recommendations || 'No specific recommendations available.';
        }
    }

    /**
     * Update model responses section
     */
    function updateModelResponses(data) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) {
            console.error('Results div not found');
            return;
        }

        resultsDiv.innerHTML = '';

        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            console.log('No data to display');
            return;
        }

        Object.entries(data).forEach(([modelId, response], index) => {
            console.log(`Creating card for model ${modelId} with response length: ${response.length}`);
            const card = createModelCard(modelId, response, index);
            resultsDiv.appendChild(card);
        });
    }

    /**
     * Create a tag element
     */
    function createTag(text, type) {
        const tag = document.createElement('span');
        tag.className = `tag ${type}`;
        tag.textContent = text;
        return tag;
    }

    /**
     * Create a difference card
     */
    function createDifferenceCard(modelId, differences) {
        const card = document.createElement('div');
        card.className = 'difference-card';
        
        const header = document.createElement('h4');
        header.textContent = `${modelId} Unique Points`;
        
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'tags-container';
        
        if (Array.isArray(differences)) {
            differences.forEach(diff => {
                const tag = createTag(diff, 'unique');
                tagsContainer.appendChild(tag);
            });
        }
        
        card.appendChild(header);
        card.appendChild(tagsContainer);
        
        return card;
    }

    /**
     * Create a model card
     */
    function createModelCard(modelId, response, index) {
        const card = document.createElement('div');
        card.className = 'model-card fade-in';
        card.style.animationDelay = `${index * 0.1}s`;

        const wordCount = countWords(response);
        const charCount = response.length;

        // Create header
        const header = document.createElement('div');
        header.className = 'model-header';
        const headerTitle = document.createElement('h2');
        headerTitle.textContent = modelId;
        header.appendChild(headerTitle);

        // Create content
        const content = document.createElement('div');
        content.className = 'model-content';

        // Create response text area
        const responseDiv = document.createElement('div');
        responseDiv.className = 'response-text';
        responseDiv.innerHTML = highlightKeyTerms(response);

        // Create stats bar
        const statsBar = document.createElement('div');
        statsBar.className = 'stats-bar';
        
        const wordCountDiv = document.createElement('div');
        wordCountDiv.className = 'word-count';
        wordCountDiv.textContent = `${wordCount} words`;
        
        const charCountDiv = document.createElement('div');
        charCountDiv.textContent = `${charCount} characters`;
        
        statsBar.appendChild(wordCountDiv);
        statsBar.appendChild(charCountDiv);

        // Assemble the card
        content.appendChild(responseDiv);
        content.appendChild(statsBar);
        card.appendChild(header);
        card.appendChild(content);

        return card;
    }

    /**
     * Highlight key terms in the text
     */
    function highlightKeyTerms(text) {
        if (!currentAnalysis || !currentAnalysis.commonElements || !Array.isArray(currentAnalysis.commonElements)) {
            return escapeHtml(text);
        }

        let highlightedText = escapeHtml(text);
        
        // Highlight common elements
        currentAnalysis.commonElements.forEach(element => {
            if (typeof element === 'string' && element.length > 2) {
                try {
                    const regex = new RegExp(`\\b${escapeRegex(element)}\\b`, 'gi');
                    highlightedText = highlightedText.replace(regex, '<span class="highlight">$&</span>');
                } catch (regexError) {
                    console.warn('Regex error for element:', element, regexError);
                }
            }
        });

        return highlightedText;
    }

    /**
     * Escape HTML characters
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') {
            return String(text);
        }
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape regex special characters
     */
    function escapeRegex(string) {
        if (typeof string !== 'string') {
            return String(string);
        }
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Count words in text
     */
    function countWords(text) {
        if (typeof text !== 'string') {
            return 0;
        }
        
        const trimmed = text.trim();
        if (trimmed === '') {
            return 0;
        }
        
        return trimmed.split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Show an element
     */
    function showElement(element) {
        if (element) {
            element.style.display = 'block';
        }
    }

    /**
     * Hide an element
     */
    function hideElement(element) {
        if (element) {
            element.style.display = 'none';
        }
    }

    /**
     * Utility function to safely get element by ID
     */
    function safeGetElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    }

    /**
     * Utility function to add event listener with error handling
     */
    function addEventListener(element, event, handler) {
        if (element && typeof handler === 'function') {
            element.addEventListener(event, (e) => {
                try {
                    handler(e);
                } catch (error) {
                    console.error('Event handler error:', error);
                }
            });
        }
    }

    /**
     * Debug function to log current state
     */
    function debugState() {
        console.log('Current state:', {
            data: currentData,
            analysis: currentAnalysis,
            dataKeys: Object.keys(currentData),
            analysisKeys: currentAnalysis ? Object.keys(currentAnalysis) : null
        });
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for debugging (optional)
    if (typeof window !== 'undefined') {
        window.ComparisonApp = {
            updateAnalysis,
            updateData,
            currentData: () => currentData,
            currentAnalysis: () => currentAnalysis,
            debugState,
            // Utility functions for external use
            escapeHtml,
            countWords,
            highlightKeyTerms
        };
    }

})();